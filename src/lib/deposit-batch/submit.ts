import { resolveCreatedExpenseId } from '../utils/submit-result';

export type BatchSubmitResult =
  | { status: 'done'; expenseId: string }
  | { status: 'attachment-failed'; expenseId: string; message: string }
  | { status: 'failed' | 'unknown'; message: string };
export interface BatchFile { file: File; documentType: string }
/** 결과가 불명확한 생성 요청은 자동 재시도하지 않는다. 첨부 실패는 생성 id를 재사용한다. */
export async function submitDepositDocument(args: {
  payload: unknown; files: BatchFile[]; expenseId?: string;
  onCreated: (id: string) => void; fetcher?: typeof fetch;
}): Promise<BatchSubmitResult> {
  if (!args.files.length) return { status: 'failed', message: '정산서 증빙을 첨부해주세요.' };
  const request = args.fetcher ?? fetch;
  let expenseId = args.expenseId;
  if (!expenseId) {
    let response: Response;
    try { response = await request('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args.payload), redirect: 'error' }); }
    catch { return { status: 'unknown', message: '등록 결과를 확인하지 못했습니다. 중복 요청을 막기 위해 재제출을 멈췄습니다. 비용 목록에서 확인해주세요.' }; }
    const body = await response.json().catch(() => null);
    if (!response.ok) return { status: response.status >= 500 ? 'unknown' : 'failed', message: body?.error?.message ?? '입금요청을 등록하지 못했습니다. 비용 목록에서 확인해주세요.' };
    try { expenseId = resolveCreatedExpenseId(response, body); }
    catch (error) { return { status: 'unknown', message: error instanceof Error ? error.message : '등록 결과를 확인해주세요.' }; }
    args.onCreated(expenseId);
  }
  try {
    // 첨부 재시도 전, 이미 붙은 동일 파일은 다시 올리지 않는다(첫 응답만 유실된 경우 포함).
    let existing: { fileName?: string; fileSize?: number; documentType?: string }[] = [];
    if (args.expenseId) {
      const response = await request(`/api/expenses/${expenseId}`, { cache: 'no-store', redirect: 'error' });
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.data?.attachments)) throw new Error('저장된 첨부를 확인하지 못했습니다. 잠시 후 첨부만 재시도해주세요.');
      existing = [...body.data.attachments];
    }
    for (const item of args.files) {
      const index = existing.findIndex(f => f.fileName === item.file.name && f.fileSize === item.file.size && f.documentType === item.documentType);
      if (index >= 0) { existing.splice(index, 1); continue; }
      const form = new FormData(); form.append('file', item.file); form.append('expenseId', expenseId); form.append('documentType', item.documentType);
      const response = await request('/api/attachments/upload', { method: 'POST', body: form, redirect: 'error' });
      const body = await response.json().catch(() => null);
      if (!response.ok || response.redirected || typeof body?.data?.id !== 'string' || !body.data.id) throw new Error('입금요청은 등록됐지만 첨부 업로드에 실패했습니다. 첨부만 재시도해주세요.');
    }
    return { status: 'done', expenseId };
  } catch (error) {
    return { status: 'attachment-failed', expenseId, message: error instanceof Error ? error.message : '첨부 업로드에 실패했습니다. 첨부만 재시도해주세요.' };
  }
}
