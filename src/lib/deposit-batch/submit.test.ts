import test from 'node:test';
import assert from 'node:assert/strict';
import { submitDepositDocument } from './submit';
const file = new File(['%PDF example'], '정산서.pdf', { type: 'application/pdf' });
const files = [{ file, documentType: '정산서' }];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const makeFetch = (fn: (url: string, init?: RequestInit) => Response | Promise<Response>) => fn as typeof fetch;
test('한 요청에 해당하는 파일만 만들어진 요청 id에 첨부한다', async () => {
  const urls: string[] = []; let id = '';
  const result = await submitDepositDocument({ payload: { title: '정산 A' }, files, onCreated: v => { id = v; }, fetcher: makeFetch((url, init) => {
    urls.push(url); if (url === '/api/expenses') return json({ data: { id: 'expense-a' } }, 201);
    assert.equal((init?.body as FormData).get('expenseId'), 'expense-a'); assert.equal((init?.body as FormData).get('documentType'), '정산서'); return json({ data: { id: 'attachment-a' } }, 201);
  }) }); assert.deepEqual(result, { status: 'done', expenseId: 'expense-a' }); assert.equal(id, 'expense-a'); assert.equal(urls.length, 2);
});
test('첨부 실패를 요청 생성 실패로 표시하지 않고 생성 id를 보관한다', async () => {
  const result = await submitDepositDocument({ payload: {}, files, onCreated: () => {}, fetcher: makeFetch(url => url === '/api/expenses' ? json({ data: { id: 'expense-a' } }, 201) : json({}, 500)) }); assert.equal(result.status, 'attachment-failed'); assert.equal('expenseId' in result && result.expenseId, 'expense-a');
});
test('첨부 재시도는 이미 저장된 파일을 건너뛰고 요청을 다시 만들지 않는다', async () => {
  const urls: string[] = [];
  const result = await submitDepositDocument({ payload: {}, files, expenseId: 'existing', onCreated: () => { throw new Error('must not create'); }, fetcher: makeFetch(url => { urls.push(url); return json({ data: { attachments: [{ fileName: file.name, fileSize: file.size, documentType: '정산서' }] } }); }) });
  assert.deepEqual(result, { status: 'done', expenseId: 'existing' }); assert.deepEqual(urls, ['/api/expenses/existing']);
});
test('부분 첨부 실패는 남은 파일만 재시도한다', async () => {
  const other = new File(['bank'], '통장.pdf', { type: 'application/pdf' }); let uploads = 0;
  const result = await submitDepositDocument({ payload: {}, files: [...files, { file: other, documentType: 'BANK_COPY' }], expenseId: 'existing', onCreated: () => {}, fetcher: makeFetch(url => { if (url.includes('/existing')) return json({ data: { attachments: [{ fileName: file.name, fileSize: file.size, documentType: '정산서' }] } }); uploads++; return json({ data: { id: 'attachment-b' } }, 201); }) }); assert.equal(result.status, 'done'); assert.equal(uploads, 1);
});
test('서버 500·응답 유실·id 누락은 등록 불명확으로 멈춘다', async () => {
  const fetchers = [makeFetch(() => json({}, 500)), makeFetch(() => { throw new TypeError('network'); }), makeFetch(() => json({ data: {} }, 201))];
  for (const fetcher of fetchers) { const r = await submitDepositDocument({ payload: {}, files, onCreated: () => {}, fetcher }); assert.equal(r.status, 'unknown'); }
});
test('명시적 입력 검증 실패는 수정 후 재시도 가능하다', async () => {
  const r = await submitDepositDocument({ payload: {}, files, onCreated: () => {}, fetcher: makeFetch(() => json({ error: { message: '금액 확인' } }, 400)) }); assert.deepEqual(r, { status: 'failed', message: '금액 확인' });
});
test('재시도 시 기존 첨부 조회가 실패하면 추가 업로드하지 않는다', async () => {
  let calls = 0; const r = await submitDepositDocument({ payload: {}, files, expenseId: 'existing', onCreated: () => {}, fetcher: makeFetch(() => { calls++; return json({}, 403); }) }); assert.equal(r.status, 'attachment-failed'); assert.equal(calls, 1);
});

test('증빙 없이 입금요청을 만들지 않는다', async () => {
  let calls = 0; const r = await submitDepositDocument({ payload: {}, files: [], onCreated: () => {}, fetcher: makeFetch(() => { calls++; return json({}); }) }); assert.equal(r.status, 'failed'); assert.equal(calls, 0);
});
test('첨부 응답이 HTML·id 누락이면 성공으로 안내하지 않는다', async () => {
  const r = await submitDepositDocument({ payload: {}, files, onCreated: () => {}, fetcher: makeFetch(url => url === '/api/expenses' ? json({ data: { id: 'expense-a' } }, 201) : new Response('<html>login</html>', { status: 200 })) }); assert.equal(r.status, 'attachment-failed');
});
