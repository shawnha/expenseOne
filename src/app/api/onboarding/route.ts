import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { validateOrigin } from "@/lib/api-utils";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const onboardingSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요").max(100, "이름은 100자 이내로 입력해주세요"),
  cardLastFour: z
    .string()
    .regex(/^\d{4}$/, "카드 끝 4자리 숫자를 입력해주세요")
    .optional()
    .or(z.literal("")),
  profileImageUrl: z.string().url().optional().nullable(),
  companyId: z.string().uuid("잘못된 회사 ID 형식입니다.").optional(),
});

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = onboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join(", ") } },
        { status: 400 },
      );
    }

    const { name, cardLastFour, profileImageUrl, companyId } = parsed.data;

    await db
      .update(users)
      .set({
        name,
        cardLastFour: cardLastFour || null,
        profileImageUrl: profileImageUrl || null,
        companyId: companyId || null,
        onboardingCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    revalidatePath("/");
    revalidateTag("user-profile", { expire: 0 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "프로필 저장에 실패했습니다." } },
      { status: 500 },
    );
  }
}
