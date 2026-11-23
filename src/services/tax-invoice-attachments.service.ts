import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { taxInvoiceAttachments, taxInvoiceRequests } from "@/lib/db/schema-tax-invoice";
import { taxInvoiceAttachmentLimit, type TaxInvoiceAttachment } from "@/lib/tax-invoice-attachments";
import { AppError } from "./attachment.service";
import type { Actor } from "./tax-invoice.service";

const BUCKET = "tax-invoice-attachments";
const objectPath = (requestId: string, attachmentId: string) => `${requestId}/${attachmentId}`;
const fileColumns = { id: taxInvoiceAttachments.id, fileName: taxInvoiceAttachments.fileName, fileSize: taxInvoiceAttachments.fileSize };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function storage() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new AppError("INTERNAL_ERROR", "첨부 파일 저장소가 설정되지 않았습니다.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key).storage.from(BUCKET);
}

export async function listTaxInvoiceAttachments(requestIds: string[]) {
  const byRequest = new Map<string, TaxInvoiceAttachment[]>();
  if (!requestIds.length) return byRequest;
  const files = await db.select({ ...fileColumns, requestId: taxInvoiceAttachments.requestId })
    .from(taxInvoiceAttachments).where(inArray(taxInvoiceAttachments.requestId, requestIds))
    .orderBy(asc(taxInvoiceAttachments.createdAt), asc(taxInvoiceAttachments.id));
  for (const { requestId, ...file } of files) {
    const group = byRequest.get(requestId) ?? [];
    group.push(file);
    byRequest.set(requestId, group);
  }
  return byRequest;
}

async function removeObjects(requestId: string, ids: string[]) {
  if (!ids.length) return;
  try {
    const { error } = await storage().remove(ids.map((id) => objectPath(requestId, id)));
    if (error) console.error("[TaxInvoice] 첨부 파일 저장소 정리 실패", error.name);
  } catch {
    console.error("[TaxInvoice] 첨부 파일 저장소 정리 실패");
  }
}

/** Holds the request write lock until its files and form changes can commit together. */
export async function writeTaxInvoiceWithAttachments<T>(
  requestId: string,
  files: File[],
  removeIds: string[],
  write: (tx: Tx) => Promise<{ row: T; changed: boolean }>,
) {
  // The same edit may be retried after a timeout. Keep one copy of each file.
  const prepared = await Promise.all(files.map(async (file) => {
    const fileName = file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "첨부 파일";
    const bytes = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(fileName).update("\0").update(bytes).digest("hex");
    return { file, fileName, fileHash };
  }));
  const attemptedUploads: string[] = [];
  try {
    const result = await db.transaction(async (tx) => {
      const result = await write(tx);
      const removed: string[] = [];
      if (result.changed && (files.length || removeIds.length)) {
        const current = await tx.select({ ...fileColumns, fileHash: taxInvoiceAttachments.fileHash }).from(taxInvoiceAttachments)
          .where(eq(taxInvoiceAttachments.requestId, requestId));
        const toRemove = new Set(removeIds);
        const remaining = current.filter((file) => !toRemove.has(file.id));
        const seen = new Set(remaining.map(({ fileHash }) => fileHash));
        const added = prepared.filter(({ fileHash }) => {
          if (seen.has(fileHash)) return false;
          seen.add(fileHash);
          return true;
        });
        const limitError = taxInvoiceAttachmentLimit([...remaining, ...added.map(({ file }) => ({ fileSize: file.size }))]);
        if (limitError) throw new AppError("VALIDATION_ERROR", limitError);

        if (toRemove.size) {
          const deleted = await tx.delete(taxInvoiceAttachments).where(and(
            eq(taxInvoiceAttachments.requestId, requestId), inArray(taxInvoiceAttachments.id, [...toRemove]),
          )).returning({ id: taxInvoiceAttachments.id });
          removed.push(...deleted.map(({ id }) => id));
        }

        if (added.length) {
          const bucket = storage();
          const attachments = [];
          for (const { file, fileName, fileHash } of added) {
            const id = randomUUID();
            attemptedUploads.push(id);
            const { error } = await bucket.upload(objectPath(requestId, id), file, { contentType: file.type, upsert: false });
            if (error) throw new AppError("INTERNAL_ERROR", "첨부 파일을 저장하지 못했습니다. 다시 시도해 주세요.");
            attachments.push({ id, requestId, fileName, fileSize: file.size, fileHash });
          }
          await tx.insert(taxInvoiceAttachments).values(attachments);
        }
      }
      return { ...result, removed };
    });
    await removeObjects(requestId, result.removed);
    return result;
  } catch (error) {
    if (attemptedUploads.length) {
      try {
        // A lost connection on COMMIT is ambiguous. Never delete a committed file.
        const saved = await db.select({ id: taxInvoiceAttachments.id }).from(taxInvoiceAttachments)
          .where(inArray(taxInvoiceAttachments.id, attemptedUploads));
        const committed = new Set(saved.map(({ id }) => id));
        await removeObjects(requestId, attemptedUploads.filter((id) => !committed.has(id)));
      } catch {
        console.error("[TaxInvoice] 저장된 첨부 파일을 확인하지 못했습니다");
      }
    }
    throw error;
  }
}

export async function downloadTaxInvoiceAttachment(actor: Actor, requestId: string, attachmentId: string) {
  const [attachment] = await db.select({ fileName: taxInvoiceAttachments.fileName }).from(taxInvoiceAttachments)
    .innerJoin(taxInvoiceRequests, eq(taxInvoiceAttachments.requestId, taxInvoiceRequests.id))
    .where(and(
      eq(taxInvoiceAttachments.id, attachmentId), eq(taxInvoiceAttachments.requestId, requestId),
      actor.role === "ADMIN" ? undefined : eq(taxInvoiceRequests.requestedById, actor.id),
    ));
  if (!attachment) throw new AppError("NOT_FOUND", "첨부 파일을 찾을 수 없습니다.");
  const { data, error } = await storage().createSignedUrl(objectPath(requestId, attachmentId), 60, { download: attachment.fileName });
  if (error || !data) throw new AppError("INTERNAL_ERROR", "첨부 파일을 열지 못했습니다.");
  return data.signedUrl;
}
