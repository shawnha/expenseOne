import type { OcrFields } from '../ocr/types';
import { suggestAccount, suggestAmountKRW } from '../ocr/suggest';
import { depositRequestSubmitSchema } from '../validations/expense';

export interface DepositDraft {
  title: string; companyId: string; category: string; amount: string;
  currency: 'KRW' | 'USD'; bankName: string; accountHolder: string; accountNumber: string;
  description: string; dueDate: string;
}
export type DraftField = keyof DepositDraft;
export const blankDraft = (name: string): DepositDraft => ({
  title: name.replace(/\.[^.]+$/, '').slice(0, 200), companyId: '', category: '', amount: '', currency: 'KRW',
  bankName: '', accountHolder: '', accountNumber: '', description: '', dueDate: '',
});
/** OCR가 늦게 끝나도 사람이 고친 칸은 덮어쓰지 않는다. */
export function applyDocument(draft: DepositDraft, fields: OcrFields, touched: DraftField[]): DepositDraft {
  const next = { ...draft };
  const set = <K extends DraftField>(key: K, value: DepositDraft[K]) => { if (!touched.includes(key)) next[key] = value; };
  const account = suggestAccount(fields);
  if (account) {
    if (account.bankName) set('bankName', account.bankName);
    set('accountHolder', account.accountHolder); set('accountNumber', account.accountNumber);
  }
  if (!['통장사본', '사업자등록증', '신분증'].includes(fields.docType)) {
    if (fields.merchantName?.trim()) set('title', `${fields.merchantName.trim()} 정산`.slice(0, 200));
    const amount = suggestAmountKRW(fields);
    if (amount) { set('amount', String(amount.total)); set('currency', 'KRW'); }
    else if (fields.currency?.toUpperCase() === 'USD' && fields.totalAmount && fields.totalAmount > 0 && Number.isInteger(Math.round(fields.totalAmount * 100)) && Math.abs(fields.totalAmount * 100 - Math.round(fields.totalAmount * 100)) < .00001) {
      set('amount', String(fields.totalAmount)); set('currency', 'USD');
    }
  }
  return next;
}

export function draftPayload(d: DepositDraft, transactionDate: string) {
  const amount = Number(d.amount);
  if (!d.amount.trim() || !Number.isFinite(amount) || amount <= 0 || (d.currency === 'KRW' ? !Number.isInteger(amount) : Math.abs(amount * 100 - Math.round(amount * 100)) > .00001)) {
    throw new Error(d.currency === 'USD' ? '달러 금액은 소수 둘째 자리까지 입력해주세요.' : '금액을 원 단위의 양수로 입력해주세요.');
  }
  return depositRequestSubmitSchema.parse({
    ...d, title: d.title.trim(), category: d.category.trim(),
    bankName: d.bankName.trim(), accountHolder: d.accountHolder.trim(), accountNumber: d.accountNumber.replace(/[\s-]/g, ''),
    amount: d.currency === 'USD' ? Math.round(amount * 100) : amount, type: 'DEPOSIT_REQUEST',
    transactionDate, dueDate: d.dueDate || null, isUrgent: false, isPrePaid: false,
  });
}
export function draftError(d: DepositDraft, date: string): string | null {
  if (!d.companyId) return '회사를 선택해주세요.';
  if (!/^\d{8,20}$/.test(d.accountNumber.replace(/[\s-]/g, ''))) return '계좌번호를 숫자 8~20자리로 확인해주세요.';
  try { draftPayload(d, date); return null; }
  catch (error) {
    if (error && typeof error === 'object' && 'issues' in error) return (error as { issues: { message: string }[] }).issues[0]?.message ?? '입력 내용을 확인해주세요.';
    return error instanceof Error ? error.message : '입력 내용을 확인해주세요.';
  }
}
