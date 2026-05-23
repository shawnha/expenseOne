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

  // Permission: corporate card = within 7 days of creation
  if (expenseType === "CORPORATE_CARD") {
    const createdAt = new Date(expense.created_at);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (createdAt < sevenDaysAgo) {
      return null;
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
    />
  );
}
