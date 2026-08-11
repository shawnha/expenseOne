import { redirect } from "next/navigation";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { getActiveCompanies } from "@/services/company.service";
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
}

// ---------------------------------------------------------------------------
// Data fetching + permission check
// ---------------------------------------------------------------------------

async function getExpenseForEdit(id: string): Promise<{
  expense: ExpenseEditData;
  attachments: ExistingAttachment[];
  /** true면 첨부만 손댈 수 있다 (법카사용 7일 초과) */
  attachmentsOnly: boolean;
} | null> {
  const supabase = await getCachedClient();
  const authUser = await getAuthUser();

  if (!authUser) {
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

  // Only the owner can edit
  if (expense.submitted_by_id !== authUser.id) {
    return null;
  }

  const expenseType = expense.type as ExpenseType;
  const expenseStatus = expense.status as ExpenseStatus;

  // 반품 건은 수정 불가 — 삭제 후 재등록
  if (expenseType === "REFUND") {
    return null;
  }

  // 법카사용: 등록 7일이 지나면 거래 정보(금액·날짜·가맹점 등) 수정을 막는다.
  //
  // 단 **영수증 첨부는 계속 허용한다.** 예전엔 7일이 지나면 수정 페이지 자체를
  // 거부하고 상세로 되돌려보냈는데, 상세 페이지는 수정 버튼을 그대로 띄우고
  // 있어서 누르면 아무 설명 없이 튕겨나왔다. 사용자에겐 "새로고침만 된다"로
  // 보였고, 실제로 막힌 건 승인/제출 상태 법카 553건 중 504건이었다.
  //
  // 첨부는 금액·날짜를 바꾸지 않아 원장 무결성과 무관하고, 영수증을 나중에
  // 받는 건 회계에서 흔하다. 입금요청이 승인 후에도 '영수증 보충'을 위해
  // 수정 가능한 것과 같은 이유다.
  let attachmentsOnly = false;
  if (expenseType === "CORPORATE_CARD") {
    const createdAt = new Date(expense.created_at);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (createdAt < sevenDaysAgo) {
      attachmentsOnly = true;
    }
  }

  // Deposit request: SUBMITTED is fully editable; APPROVED stays editable so
  // the submitter can attach late receipts (e.g. 영수증 보충) without the
  // admin having to revert the approval. REJECTED / CANCELLED are dead-end.
  if (expenseType === "DEPOSIT_REQUEST") {
    if (expenseStatus !== "SUBMITTED" && expenseStatus !== "APPROVED") {
      return null;
    }
  }

  // Fetch attachments
  const { data: attachmentRows } = await supabase
    .from("attachments")
    .select("id, document_type, file_name, file_url, file_size, mime_type")
    .eq("expense_id", id);

  return {
    attachmentsOnly,
    expense: {
      id: expense.id,
      type: expenseType,
      status: expenseStatus,
      title: expense.title,
      description: expense.description,
      amount: expense.amount,
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

  const companies = await getActiveCompanies();
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
      attachmentsOnly={result.attachmentsOnly}
    />
  );
}
