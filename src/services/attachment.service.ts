import { db } from "@/lib/db";
import { attachments, expenses } from "@/lib/db/schema";
import { eq, sum } from "drizzle-orm";
import { createClient as createServerClient } from "@supabase/supabase-js";

// Service-role client for Storage operations (bypasses RLS)
function getStorageClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TOTAL_SIZE_PER_EXPENSE = 50 * 1024 * 1024; // 50 MB
const STORAGE_BUCKET = "attachments";

// Magic byte signatures for file type verification
const MAGIC_BYTES: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF header (WebP)
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
};

/**
 * Verify file content matches declared MIME type using magic bytes.
 * This prevents MIME type spoofing where an attacker sends a malicious
 * file with a forged Content-Type header.
 */
async function verifyMagicBytes(file: File, declaredMime: string): Promise<boolean> {
  const signatures = MAGIC_BYTES[declaredMime];
  if (!signatures) return false;

  const headerSize = Math.max(...signatures.map((s) => s.length));
  const buffer = await file.slice(0, headerSize).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  return signatures.some((sig) =>
    sig.every((byte, i) => bytes[i] === byte),
  );
}

// ---------------------------------------------------------------------------
// uploadAttachment
// ---------------------------------------------------------------------------
export async function uploadAttachment(params: {
  file: File;
  expenseId: string;
  documentType: string;
  uploadedById: string;
}) {
  const { file, expenseId, documentType, uploadedById } = params;

  // 1. Validate MIME type (Content-Type header)
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `허용되지 않는 파일 형식입니다. 허용 형식: JPEG, PNG, WebP, PDF`,
    );
  }

  // 1b. Verify file content matches declared MIME type (magic bytes)
  const isValidContent = await verifyMagicBytes(file, file.type);
  if (!isValidContent) {
    throw new AppError(
      "VALIDATION_ERROR",
      `파일 내용이 선언된 형식과 일치하지 않습니다. 유효한 JPEG, PNG, WebP, PDF 파일만 업로드해주세요.`,
    );
  }

  // 2. Validate individual file size
  if (file.size > MAX_FILE_SIZE) {
    throw new AppError(
      "VALIDATION_ERROR",
      `파일 크기가 10MB를 초과합니다.`,
    );
  }

  // 3. Check total size per expense
  const existing = await db
    .select({ totalSize: sum(attachments.fileSize) })
    .from(attachments)
    .where(eq(attachments.expenseId, expenseId));

  const currentTotal = Number(existing[0]?.totalSize ?? 0);
  if (currentTotal + file.size > MAX_TOTAL_SIZE_PER_EXPENSE) {
    throw new AppError(
      "VALIDATION_ERROR",
      `비용당 총 첨부파일 크기가 50MB를 초과합니다.`,
    );
  }

  // 4. Verify expense exists AND the uploader owns the expense
  const [expense] = await db
    .select({ id: expenses.id, submittedById: expenses.submittedById, status: expenses.status, type: expenses.type })
    .from(expenses)
    .where(eq(expenses.id, expenseId));

  if (!expense) {
    throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
  }

  if (expense.submittedById !== uploadedById) {
    throw new AppError("FORBIDDEN", "본인이 제출한 비용에만 파일을 첨부할 수 있습니다.");
  }

  // Block uploads to finalized expenses (but allow for auto-approved corporate cards)
  // Corporate card expenses are created with APPROVED status immediately,
  // so we must check the type to allow initial file attachment.
  if (
    (expense.status === "REJECTED" || expense.status === "CANCELLED") ||
    (expense.status === "APPROVED" && expense.type !== "CORPORATE_CARD")
  ) {
    throw new AppError("FORBIDDEN", "완료된 비용에는 파일을 첨부할 수 없습니다.");
  }

  // 5. Upload to Supabase Storage
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileKey = `${expenseId}/${timestamp}_${sanitizedName}`;

  const supabase = getStorageClient();
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileKey, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Supabase storage upload error:", uploadError.message);
    throw new AppError(
      "INTERNAL_ERROR",
      `파일 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.`,
    );
  }

  // 6. Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileKey);

  // 7. Save to DB
  const [attachment] = await db
    .insert(attachments)
    .values({
      expenseId,
      documentType,
      fileName: file.name,
      fileKey,
      fileUrl: publicUrl,
      fileSize: file.size,
      mimeType: file.type,
      uploadedById,
    })
    .returning();

  return attachment;
}

// ---------------------------------------------------------------------------
// deleteAttachment
// ---------------------------------------------------------------------------
export async function deleteAttachment(
  attachmentId: string,
  userId: string,
) {
  // 1. Find the attachment
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, attachmentId));

  if (!attachment) {
    throw new AppError("NOT_FOUND", "첨부파일을 찾을 수 없습니다.");
  }

  // 2. Check ownership
  if (attachment.uploadedById !== userId) {
    throw new AppError("FORBIDDEN", "본인이 업로드한 파일만 삭제할 수 있습니다.");
  }

  // 2.5. Block deletion from finalized expenses (audit trail protection)
  const [expense] = await db
    .select({ status: expenses.status })
    .from(expenses)
    .where(eq(expenses.id, attachment.expenseId));

  if (expense && (expense.status === "APPROVED" || expense.status === "REJECTED")) {
    throw new AppError("FORBIDDEN", "승인/반려된 비용의 첨부파일은 삭제할 수 없습니다.");
  }

  // 3. Delete from Supabase Storage
  const supabase = getStorageClient();
  const { error: storageError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([attachment.fileKey]);

  if (storageError) {
    console.error("Storage delete error:", storageError);
    // Continue to delete DB record even if storage delete fails
  }

  // 4. Delete from DB
  const [deleted] = await db
    .delete(attachments)
    .where(eq(attachments.id, attachmentId))
    .returning();

  return deleted;
}

// ---------------------------------------------------------------------------
// getAttachmentsByExpenseId
// ---------------------------------------------------------------------------
export async function getAttachmentsByExpenseId(expenseId: string) {
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.expenseId, expenseId));
}

// ---------------------------------------------------------------------------
// AppError helper
// ---------------------------------------------------------------------------
export class AppError extends Error {
  constructor(
    public code:
      | "VALIDATION_ERROR"
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INTERNAL_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
