import { redirect } from "next/navigation";
import { getAuthUser, getCachedClient, getCachedCurrentUser } from "@/lib/supabase/cached";
import { getActiveCompanies } from "@/services/company.service";
import { getMyCustomCategories } from "@/services/category.service";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { canEditExpense } from "@/lib/expense-edit-access";
import type {
  ExpenseType,
  ExpenseStatus,
  DocumentType,
} from "@/types";
import { EditExpenseForm } from "./edit-expense-form";

export interface CompanyOption {
  id: string;
  name: string;
  slug: string;
  currency: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExistingAttachment {
  id: string;
  documentType: DocumentType;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

export interface ExpenseEditData {
  id: string;
  type: ExpenseType;
  status: ExpenseStatus;
  title: string;
  description: string | null;
  amount: number;
  /** 원문 통화(KRW/USD). 승인된 입금요청의 읽기 전용 금액 표시에 쓴다. */
  currency: string;
  /** USD 건의 원문 금액(센트). KRW 건은 null. */
  amountOriginal: number | null;
  category: string;
  merchantName: string | null;
  transactionDate: string;
  cardLastFour: string | null;
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  isUrgent: boolean;
  isPrePaid: boolean;
  prePaidPercentage: number | null;
  dueDate: string | null;
  createdAt: string;
  companyId: string | null;
  hasFreelancerWithholding: boolean;
  /** 사입 여부. 승인 후엔 잠금 필드라 요약 카드에만 보여준다. */
  isPurchase: boolean;
  /** 후지급 플래그. 법카 사용으로 변경 버튼을 숨기는 조건(서버 규칙과 동일). */
  remainingPaymentRequested: boolean;
  remainingPaymentApproved: boolean;
}

// ---------------------------------------------------------------------------
// Data fetching + permission check
// ---------------------------------------------------------------------------

async function getExpenseForEdit(id: string): Promise<{
  expense: ExpenseEditData;
  attachments: ExistingAttachment[];
  /** 작성자. 관리자가 남의 건을 고칠 때 카드·카테고리는 작성자 것을 쓴다. */
  submittedById: string;
} | null> {
  const supabase = await getCachedClient();
  const [authUser, viewer] = await Promise.all([getAuthUser(), getCachedCurrentUser()]);

  if (!authUser || !viewer) {
    redirect("/login");
  }

  const { data: expense, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !expense) {
    return null;
  }

  const expenseType = expense.type as ExpenseType;
  const expenseStatus = expense.status as ExpenseStatus;

  // 누가·어느 상태에서 고칠 수 있나 — 상세 화면의 「수정」 버튼과 **같은 함수**를 본다
  // (lib/expense-edit-access.ts). 작성자 또는 관리자(2026-10-04), 제출·승인만, 반품 불가.
  // 예전엔 여기만 "작성자만"이라, 관리자에게 보이는 수정 버튼을 누르면 상세로 되돌아왔다.
  if (
    !canEditExpense(
      { type: expenseType, status: expenseStatus, submittedById: expense.submitted_by_id },
      { id: authUser.id, role: viewer.role },
    )
  ) {
    return null;
  }

  // Fetch attachments
  const { data: attachmentRows } = await supabase
    .from("attachments")
    .select("id, document_type, file_name, file_url, file_size, mime_type")
    .eq("expense_id", id);

  return {
    submittedById: expense.submitted_by_id,
    expense: {
      id: expense.id,
      type: expenseType,
      status: expenseStatus,
      title: expense.title,
      description: expense.description,
      amount: expense.amount,
      currency: expense.currency ?? "KRW",
      amountOriginal: expense.amount_original ?? null,
      category: expense.category,
      merchantName: expense.merchant_name,
      transactionDate: expense.transaction_date,
      cardLastFour: expense.card_last_four,
      bankName: expense.bank_name,
      accountHolder: expense.account_holder,
      accountNumber: expense.account_number,
      isUrgent: expense.is_urgent ?? false,
      isPrePaid: expense.is_pre_paid ?? false,
      prePaidPercentage: expense.pre_paid_percentage ?? null,
      dueDate: expense.due_date ?? null,
      createdAt: expense.created_at,
      companyId: expense.company_id ?? null,
      hasFreelancerWithholding: expense.has_freelancer_withholding ?? false,
      isPurchase: expense.is_purchase ?? false,
      remainingPaymentRequested: expense.remaining_payment_requested ?? false,
      remainingPaymentApproved: expense.remaining_payment_approved ?? false,
    },
    attachments: (attachmentRows ?? []).map(
      (a: {
        id: string;
        document_type: string;
        file_name: string;
        file_url: string;
        file_size: number;
        mime_type: string;
      }) => ({
        id: a.id,
        documentType: a.document_type as DocumentType,
        fileName: a.file_name,
        fileUrl: a.file_url,
        fileSize: a.file_size,
        mimeType: a.mime_type,
      })
    ),
  };
}

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

interface EditExpensePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditExpensePage({ params }: EditExpensePageProps) {
  const { id } = await params;
  const result = await getExpenseForEdit(id);

  if (!result) {
    // Cannot edit: redirect back to detail page
    redirect(`/expenses/${id}?error=edit_not_allowed`);
  }

  // 카드·카테고리는 **작성자** 것이다. 관리자가 남의 건을 고칠 때(2026-10-04) 관리자 카드로 "카드 내역이
  // 안 합쳐진다"를 판단하면 틀린다 — 법카 변경(convertDepositRequestToCard)은 작성자 카드를 붙인다.
  // 남의 사용자 행이라 RLS 와 무관하게 서버 DB 로 읽는다.
  const ownerId = result.submittedById;
  const [companies, myCategories, viewer, ownerCard] = await Promise.all([
    getActiveCompanies(),
    getMyCustomCategories(ownerId),
    getCachedCurrentUser(),
    db.select({ cardLastFour: users.cardLastFour }).from(users).where(eq(users.id, ownerId)),
  ]);
  const initialCompanies: CompanyOption[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    currency: c.currency,
  }));

  return (
    <EditExpenseForm
      expense={result.expense}
      existingAttachments={result.attachments}
      initialCompanies={initialCompanies}
      myCategories={myCategories}
      viewerIsAdmin={viewer?.role === "ADMIN"}
      viewerCardLastFour={ownerCard[0]?.cardLastFour ?? null}
    />
  );
}
