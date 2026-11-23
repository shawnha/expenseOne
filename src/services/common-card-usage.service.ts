import { and, count, desc, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { commonCardUsage } from "@/lib/db/common-card-usage";
import { companies, gowidCardMappings, users } from "@/lib/db/schema";
import { AppError } from "./attachment.service";

const fields = {
  id: commonCardUsage.id,
  lastFour: commonCardUsage.lastFour,
  startedOn: commonCardUsage.startedOn,
  endedOn: commonCardUsage.endedOn,
};

export async function getCommonCardsForUser(userId: string) {
  const [usage, cards] = await Promise.all([
    db.select({ ...fields, companyName: companies.name }).from(commonCardUsage)
      .leftJoin(companies, eq(companies.id, commonCardUsage.companyId))
      .where(eq(commonCardUsage.userId, userId))
      .orderBy(desc(commonCardUsage.startedOn), desc(commonCardUsage.createdAt)),
    db.select({ id: gowidCardMappings.id, lastFour: gowidCardMappings.cardLastFour, companyName: companies.name })
      .from(gowidCardMappings).innerJoin(companies, eq(companies.id, gowidCardMappings.companyId))
      .where(and(isNull(gowidCardMappings.userId), eq(gowidCardMappings.isActive, true), eq(companies.isActive, true))),
  ]);

  return { usage, cards };
}

export async function startCommonCardUsage(userId: string, mappingId: string, startedOn: string, endedOn: string | null) {
  return db.transaction(async (tx) => {
    const [card] = await tx
      .select({ companyId: companies.id, lastFour: gowidCardMappings.cardLastFour })
      .from(gowidCardMappings).innerJoin(companies, eq(companies.id, gowidCardMappings.companyId))
      .where(and(
        eq(gowidCardMappings.id, mappingId),
        eq(gowidCardMappings.isActive, true),
        isNull(gowidCardMappings.userId),
        eq(companies.isActive, true),
      ))
      .for("share");
    if (!card) throw new AppError("VALIDATION_ERROR", "사용 가능한 공용 카드를 선택해 주세요.");

    const [entry] = await tx.insert(commonCardUsage).values({ userId, mappingId, ...card, startedOn, endedOn })
      .onConflictDoNothing().returning(fields);
    if (!entry) throw new AppError("VALIDATION_ERROR", "이 카드에 같은 시작일이나 진행 중인 사용 기록이 있습니다.");
    return entry;
  });
}

export async function endCommonCardUsage(userId: string, id: string, endedOn: string) {
  const [entry] = await db.update(commonCardUsage).set({ endedOn })
    .where(and(
      eq(commonCardUsage.id, id),
      eq(commonCardUsage.userId, userId),
      isNull(commonCardUsage.endedOn),
      lte(commonCardUsage.startedOn, endedOn),
    )).returning(fields);

  if (!entry) throw new AppError("VALIDATION_ERROR", "사용 중인 카드와 종료일을 확인해 주세요.");
  return entry;
}

export async function getAdminCommonCardUsage(page: number) {
  const limit = 20;
  const [rows, [total]] = await Promise.all([
    db.select({ ...fields, userName: users.name, companyName: companies.name }).from(commonCardUsage)
      .leftJoin(users, eq(users.id, commonCardUsage.userId))
      .leftJoin(companies, eq(companies.id, commonCardUsage.companyId))
      .orderBy(desc(commonCardUsage.createdAt), desc(commonCardUsage.id))
      .limit(limit).offset((page - 1) * limit),
    db.select({ count: count() }).from(commonCardUsage),
  ]);
  return { rows, total: total.count, totalPages: Math.ceil(total.count / limit) };
}
