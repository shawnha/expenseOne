// ============================================================
// User & Auth Types
// ============================================================

export type UserRole = 'MEMBER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department: string | null;
  profileImageUrl: string | null;
  cardLastFour: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Expense Types
// ============================================================

export type ExpenseType = 'CORPORATE_CARD' | 'DEPOSIT_REQUEST';

export type ExpenseStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

// Default categories: ODD, MART_PHARMACY, OTHER — users can add custom ones
export type ExpenseCategory = string;

// Default document types: ESTIMATE, BANK_COPY, ID_CARD, BIZ_LICENSE, RECEIPT, OTHER — users can add custom ones
export type DocumentType = string;

export type NotificationType =
  | 'DEPOSIT_APPROVED'
  | 'DEPOSIT_REJECTED'
  | 'NEW_DEPOSIT_REQUEST'
  | 'REMAINING_PAYMENT_REQUEST'
  | 'REMAINING_PAYMENT_APPROVED'
  | 'GOWID_NEW_TRANSACTION';

export interface Expense {
  id: string;
  type: ExpenseType;
  status: ExpenseStatus;
  title: string;
  description: string | null;
  amount: number;
  category: ExpenseCategory;
  merchantName: string | null;
  transactionDate: string;
  cardLastFour: string | null;
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  isUrgent: boolean;
  isPrePaid: boolean;
  prePaidPercentage: number | null;
  remainingPaymentRequested: boolean;
  remainingPaymentApproved: boolean;
  rejectionReason: string | null;
  submittedById: string;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  expenseId: string;
  documentType: DocumentType;
  fileName: string;
  fileKey: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedById: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedExpenseId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}
