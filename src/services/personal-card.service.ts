import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { personalCardNumbers } from "@/lib/db/personal-card-numbers";
import { AppError } from "./attachment.service";

export interface PersonalCardNumber {
  id: string;
  companyId: string;
  lastFour: string;
}

const cardColumns = {
  id: personalCardNumbers.id,
  companyId: personalCardNumbers.companyId,
  lastFour: personalCardNumbers.lastFour,
};

export function getPersonalCards(userId: string) {
  return db.select(cardColumns).from(personalCardNumbers)
    .where(eq(personalCardNumbers.userId, userId))
    .orderBy(asc(personalCardNumbers.createdAt), asc(personalCardNumbers.id));
}

export async function getPersonalCardForExpense(userId: string, companyId: string, cardId: string) {
  const [card] = await db.select({ lastFour: personalCardNumbers.lastFour }).from(personalCardNumbers)
    .where(and(
      eq(personalCardNumbers.userId, userId),
      eq(personalCardNumbers.companyId, companyId),
      eq(personalCardNumbers.id, cardId),
    ));
  if (!card) throw new AppError("VALIDATION_ERROR", "이 법인에 등록한 카드를 다시 선택해 주세요.");
  return card.lastFour;
}

export async function savePersonalCard(userId: string, values: Omit<PersonalCardNumber, "id">, id?: string) {
  const [company] = await db.select({ id: companies.id }).from(companies)
    .where(and(eq(companies.id, values.companyId), eq(companies.isActive, true)));
  if (!company) throw new AppError("VALIDATION_ERROR", "사용 가능한 법인을 선택해 주세요.");

  if (!id) {
    const [card] = await db.insert(personalCardNumbers).values({ userId, ...values })
      .onConflictDoNothing().returning(cardColumns);
    if (!card) throw new AppError("VALIDATION_ERROR", "이 법인에 같은 뒷자리가 이미 등록되어 있습니다.");
    return card;
  }

  try {
    const [card] = await db.update(personalCardNumbers).set(values)
      .where(and(eq(personalCardNumbers.userId, userId), eq(personalCardNumbers.id, id)))
      .returning(cardColumns);
    if (!card) throw new AppError("NOT_FOUND", "등록한 카드를 찾을 수 없습니다.");
    return card;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      throw new AppError("VALIDATION_ERROR", "이 법인에 같은 뒷자리가 이미 등록되어 있습니다.");
    }
    throw error;
  }
}
