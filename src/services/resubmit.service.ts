import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { ResubmitSource } from "@/lib/deposit-prefill";

// ---------------------------------------------------------------------------
// 반려된 입금요청 「이 내용으로 다시 올리기」 — 새 입금요청 폼에 미리 채울 값.
//
// 계좌번호까지 돌려주므로 **본인 + 입금요청 + 반려** 세 조건을 모두 WHERE 에 넣는다(상세 화면의 버튼 조건과 같다).
// 하나라도 안 맞으면 null — 폼은 빈 새 요청으로 뜬다. expense.service 는 Slack·푸시·계획 모듈을 끌고 오므로
// 입금요청 화면(계획 서비스를 올리면 안 됨)에서 쓰지 않고 여기 좁은 SELECT 하나만 둔다.
// 금액은 참고로만 돌려준다 — 폼은 금액 칸을 채우지 않는다(재제출 중 금액이 같은 건 8%뿐, autofill.service).
// ---------------------------------------------------------------------------

export async function getResubmitSource(expenseId: string, userId: string): Promise<ResubmitSource | null> {
  if (!expenseId || !userId) return null;
  try {
    const [row] = await db
      .select({
        id: expenses.id,
        title: expenses.title,
        companyId: expenses.companyId,
        category: expenses.category,
        bankName: expenses.bankName,
        accountHolder: expenses.accountHolder,
        accountNumber: expenses.accountNumber,
        description: expenses.description,
        dueDate: expenses.dueDate,
        currency: expenses.currency,
        previousAmount: expenses.amount,
        hasFreelancerWithholding: expenses.hasFreelancerWithholding,
        rejectionReason: expenses.rejectionReason,
        isUrgent: expenses.isUrgent,
        branch: expenses.branch,
        // 선지급·사입은 옮기지 않는다(금액·약국 줄에 묶여 있다) — 있었다는 사실만 배너로 알린다.
        hadPrePaid: expenses.isPrePaid,
        hadPurchase: expenses.isPurchase,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.submittedById, userId),
          eq(expenses.type, "DEPOSIT_REQUEST"),
          eq(expenses.status, "REJECTED"),
        ),
      )
      .limit(1);
    return row ?? null;
  } catch (err) {
    // 편의 기능이다. 실패해도 빈 폼은 떠야 한다.
    console.error("[resubmit] 반려 건 조회 실패:", err);
    return null;
  }
}
