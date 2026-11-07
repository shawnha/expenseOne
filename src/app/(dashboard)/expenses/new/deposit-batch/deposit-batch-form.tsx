"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CheckCircle2, FileText, Loader2, Paperclip, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { FileUploadWithDocType } from '@/components/forms/file-upload';
import { CompanySelector } from '@/components/forms/company-selector';
import { CategorySelectField } from '@/components/forms/category-select-field';
import { ExpenseNotesField } from '@/components/expenses/expense-notes-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { useFormBusy } from '@/hooks/use-form-busy';
import { BANK_LIST } from '@/lib/banks';
import { todayKST } from '@/lib/plans/pick-ui';
import { applyDocument, blankDraft, draftError, draftPayload, type DepositDraft, type DraftField } from '@/lib/deposit-batch/draft';
import { submitDepositDocument } from '@/lib/deposit-batch/submit';
import { MAX_TOTAL_FILE_SIZE, type FileWithPreview } from '@/lib/validations/expense-form';
import type { OcrFields, OcrResult } from '@/lib/ocr/types';
import { cn } from '@/lib/utils';

interface Company { id: string; name: string; slug: string; currency: string }
interface Row {
  draft: DepositDraft; touched: DraftField[]; reviewed: boolean; selected: boolean;
  status: 'draft' | 'saving' | 'done' | 'failed' | 'unknown' | 'attachment-failed';
  expenseId?: string; error?: string; fields?: OcrFields;
  role: 'request' | 'unassigned' | 'support'; targetId?: string; extras: FileWithPreview[];
}
const newRow = (name: string): Row => ({ draft: blankDraft(name), touched: [], reviewed: false, selected: true, status: 'draft', role: 'request', extras: [] });
const locked = (r: Row) => !!r.expenseId || r.status === 'unknown';
const label = (r: Row) => r.status === 'done' ? '승인 대기' : r.status === 'attachment-failed' ? '첨부 재시도 필요' : r.status === 'unknown' ? '등록 여부 확인 필요' : r.status === 'saving' ? '제출 중' : r.status === 'failed' ? '등록 실패' : r.role === 'unassigned' ? '보조 증빙 연결 필요' : r.reviewed ? '확인 완료' : '확인 대기';
const amountLabel = (r: Row) => `${Number(r.draft.amount || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}${r.draft.currency === 'USD' ? ' USD' : '원'}`;

export default function DepositBatchForm({ initialCompanies, myCategories = [] }: { initialCompanies: Company[]; myCategories?: string[] }) {
  const previewUrls = useRef(new Map<File, string>());
  useEffect(() => { const urls = previewUrls.current; return () => { for (const url of urls.values()) URL.revokeObjectURL(url); }; }, []);
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const filesRef = useRef<FileWithPreview[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const [active, setActive] = useState('');
  const [reading, setReading] = useState(0);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [extraReading, setExtraReading] = useState(0);
  const [companyBusy, setCompanyBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [confirmIds, setConfirmIds] = useState<string[]>([]);
  const [commonCategory, setCommonCategory] = useState('');
  const [supportTarget, setSupportTarget] = useState('');
  const patch = useCallback((id: string, transform: (row: Row) => Row) => {
    setRows(prev => { if (!prev[id]) return prev; const next = { ...prev, [id]: transform(prev[id]) }; rowsRef.current = next; return next; });
  }, []);
  const onFilesChange = useCallback((incoming: FileWithPreview[]) => {
    const kept = filesRef.current.filter(f => rowsRef.current[f.id] && (locked(rowsRef.current[f.id]) || (rowsRef.current[f.id].targetId && !!rowsRef.current[rowsRef.current[f.id].targetId!] && locked(rowsRef.current[rowsRef.current[f.id].targetId!]))) && !incoming.some(n => n.id === f.id));
    if (kept.length) toast.info('이미 제출한 요청의 증빙은 이 화면에서 제거할 수 없습니다.');
    const next = [...incoming, ...kept]; filesRef.current = next; setFiles(next);
    setRows(prev => {
      const updated = Object.fromEntries(next.map(f => [f.id, prev[f.id] ?? newRow(f.file.name)]));
      for (const r of Object.values(updated)) {
        if (r.role === 'support' && (!r.targetId || !updated[r.targetId])) { r.role = 'unassigned'; r.targetId = undefined; }
      }
      for (const [id, r] of Object.entries(prev)) {
        if (!updated[id] && r.targetId && updated[r.targetId]) updated[r.targetId] = { ...updated[r.targetId], reviewed: false };
      }
      rowsRef.current = updated; return updated;
    });
    setActive(current => next.some(f => f.id === current) ? current : next[0]?.id ?? '');
  }, []);
  const onRead = useCallback((id: string, result: OcrResult) => patch(id, row => {
    if (locked(row)) return row;
    const supporting = ['통장사본', '사업자등록증', '신분증'].includes(result.fields.docType);
    return { ...row, fields: result.fields, draft: applyDocument(row.draft, result.fields, row.touched), reviewed: false,
      ...(supporting ? { role: 'unassigned' as const, selected: false } : {}) };
  }), [patch]);
  const edit = (id: string, key: DraftField, value: string) => patch(id, row => locked(row) ? row : ({ ...row, draft: { ...row.draft, [key]: value }, touched: [...new Set([...row.touched, key])], reviewed: false, status: 'draft', error: undefined }));
  const requestFiles = files.filter(f => rows[f.id]?.role !== 'support');
  const activeFile = requestFiles.find(f => f.id === active) ?? requestFiles[0];
  const currentId = activeFile?.id ?? '';
  const row = rows[currentId];
  const waiting = reading > 0 || extraReading > 0 || uploadBusy || companyBusy;
  const readyIds = files.filter(f => { const r = rows[f.id]; return r?.role === 'request' && r.reviewed && r.selected && !locked(r) && !draftError(r.draft, todayKST()); }).map(f => f.id);
  const done = Object.values(rows).filter(r => r.status === 'done').length;
  const dirty = files.some(f => { const r = rows[f.id]; return r && (r.role === 'support' && r.targetId ? rows[r.targetId]?.status !== 'done' : r.status !== 'done'); });
  useUnsavedChanges(dirty || submitting); useFormBusy('deposit-batch', dirty || submitting);

  function attached(id: string) {
    const primary = filesRef.current.find(f => f.id === id);
    if (!primary) return [];
    return [primary, ...filesRef.current.filter(f => rowsRef.current[f.id]?.role === 'support' && rowsRef.current[f.id]?.targetId === id), ...rowsRef.current[id].extras];
  }
  function review(id: string) {
    const r = rowsRef.current[id]; const error = draftError(r.draft, todayKST());
    const documents = attached(id);
    const issue = error ?? (documents.reduce((total, f) => total + f.file.size, 0) > MAX_TOTAL_FILE_SIZE ? '요청 한 건의 전체 증빙은 최대 50MB입니다.' : null) ?? (!documents.every(f => f.documentType) ? '증빙마다 서류 종류를 선택해주세요.' : null);
    if (issue) { patch(id, r => ({ ...r, error: issue })); return; }
    patch(id, r => ({ ...r, reviewed: true, error: undefined }));
    const next = requestFiles.find(f => f.id !== id && rows[f.id].role === 'request' && !rows[f.id].reviewed && !locked(rows[f.id]));
    if (next) setActive(next.id);
    toast.success('요청 내용을 확인했습니다.');
  }
  async function submit(ids: string[]) {
    if (submitLock.current || waiting) return;
    submitLock.current = true; setSubmitting(true); setConfirmIds([]);
    try {
      for (const id of ids) {
        const r = rowsRef.current[id];
        if (!r || r.status === 'done' || r.status === 'unknown' || (r.expenseId && r.status !== 'attachment-failed')) continue;
        const docs = attached(id);
        if (!docs.length || docs.some(f => !f.documentType)) { patch(id, x => ({ ...x, error: '서류 종류를 선택해주세요.' })); continue; }
        if (!r.expenseId && (draftError(r.draft, todayKST()) || !r.reviewed)) continue;
        patch(id, x => ({ ...x, status: 'saving', error: undefined }));
        const result = await submitDepositDocument({
          payload: draftPayload(r.draft, todayKST()), expenseId: r.expenseId,
          files: docs.map(f => ({ file: f.file, documentType: f.documentType! })),
          onCreated: expenseId => patch(id, x => ({ ...x, expenseId })),
        });
        patch(id, x => ({ ...x, status: result.status, ...('expenseId' in result ? { expenseId: result.expenseId } : {}), error: 'message' in result ? result.message : undefined }));
      }
    } catch { toast.error('처리를 완료하지 못했습니다. 각 요청의 상태를 확인해주세요.'); }
    finally { submitLock.current = false; setSubmitting(false); }
  }
  function extraFiles(id: string, incoming: FileWithPreview[]) {
    const total = [...attached(id).filter(f => !rowsRef.current[id].extras.some(e => e.id === f.id)), ...incoming].reduce((sum, f) => sum + f.file.size, 0);
    if (total > MAX_TOTAL_FILE_SIZE) { toast.error('요청 한 건의 전체 증빙은 최대 50MB입니다.'); return; }
    patch(id, r => ({ ...r, extras: incoming, reviewed: false }));
  }

  return <div className="mx-auto max-w-5xl space-y-5">
    <Breadcrumb items={[{ label: '비용 관리', href: '/expenses' }, { label: '입금요청', href: '/expenses/new/deposit-request' }, { label: '정산서로 여러 건' }]} />
    <div className="flex items-center gap-3"><Link href="/expenses/new/deposit-request" aria-label="입금요청으로 돌아가기" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full glass"><ArrowLeft className="size-4" /></Link><div><h1 className="text-title3">입금요청</h1><p className="mt-1 text-sm text-[var(--apple-secondary-label)]">정산서별로 확인하고, 각각 입금요청을 만듭니다.</p></div></div>
    <nav className="flex flex-wrap gap-2" aria-label="입금요청 작성 방법"><Link className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-[var(--apple-secondary-label)]" href="/expenses/new/deposit-request">직접 작성</Link><span aria-current="page" className="inline-flex min-h-11 items-center rounded-full bg-[var(--apple-blue)] px-4 text-sm text-white">정산서로 여러 건</span></nav>
    {done > 0 && <div role="status" className="flex items-center gap-2 rounded-xl bg-[var(--apple-green)]/10 p-4 text-sm"><CheckCircle2 className="size-5 shrink-0" />{done}건이 승인 대기로 등록되었습니다. <Link className="ml-auto shrink-0 text-[var(--apple-blue)] underline" href="/expenses">내 비용 보기</Link></div>}
    <fieldset disabled={submitting} className="min-w-0 space-y-5">
      <section className="glass p-4 sm:p-6"><h2 className="text-subheadline font-semibold">정산서 넣기</h2><p className="mt-1 mb-4 text-sm text-[var(--apple-secondary-label)]">파일 1개당 요청 1건 · 최대 10개. 한 PDF에 여러 정산서가 묶여 있으면 파일을 나눠 올려주세요.</p>
        <FileUploadWithDocType files={files} onFilesChange={onFilesChange} onDocumentRead={onRead} onDocumentTypeChange={(id, type) => { if (rowsRef.current[id] && locked(rowsRef.current[id])) { toast.info("등록된 요청의 증빙은 수정 화면에서 변경해주세요."); return; } onFilesChange(filesRef.current.map(f => f.id === id ? { ...f, documentType: type } : f)); patch(id, r => ({ ...r, reviewed: false })); }} onReadingCountChange={setReading} onBusyChange={setUploadBusy} maxFiles={10} />
      </section>
      {requestFiles.length > 0 && <>
        <div className="glass p-4"><CategorySelectField value={commonCategory} onChange={setCommonCategory} myCategories={myCategories} required={false} /><Button className="mt-3 min-h-11 rounded-full" variant="outline" disabled={!commonCategory} onClick={() => { setRows(prev => { const next = Object.fromEntries(Object.entries(prev).map(([id, r]) => [id, locked(r) ? r : { ...r, draft: { ...r.draft, category: commonCategory }, reviewed: false }])); rowsRef.current = next; return next; }); }}>모든 요청에 카테고리 적용</Button></div>
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2" aria-label="정산서별 요청 목록">{requestFiles.map(f => { const r = rows[f.id]; return <div key={f.id} className={cn('flex min-w-0 items-start gap-2 rounded-xl border bg-[var(--apple-system-background)] p-3', currentId === f.id ? 'border-[var(--apple-blue)] ring-1 ring-[var(--apple-blue)]' : 'border-[var(--apple-separator)]')}>
            <input type="checkbox" aria-label={`${r.draft.title} 제출 선택`} className="mt-1 size-5 shrink-0 accent-[var(--apple-blue)]" checked={r.selected} disabled={locked(r) || r.role !== 'request'} onChange={e => patch(f.id, r => ({ ...r, selected: e.target.checked }))} />
            <button type="button" className="min-h-11 min-w-0 flex-1 space-y-1 text-left" onClick={() => setActive(f.id)} aria-pressed={currentId === f.id}><p className="break-words text-sm font-medium">{r.draft.title}</p><p className="text-xs text-[var(--apple-secondary-label)]">{initialCompanies.find(c => c.id === r.draft.companyId)?.name ?? '회사 확인 필요'}</p><p className="text-sm tabular-nums">{amountLabel(r)}</p><p className={cn('text-xs', r.status === 'done' ? 'text-[var(--apple-green)]' : r.error || r.role === 'unassigned' ? 'text-[var(--apple-orange)]' : 'text-[var(--apple-secondary-label)]')}>{label(r)}</p></button>
          </div>; })}</div>
          {row && <section className="glass min-w-0 space-y-4 p-4 sm:p-6" aria-label="요청 내용 확인">
            <div className="flex items-start gap-2"><FileText className="mt-0.5 size-4 shrink-0 text-[var(--apple-blue)]" /><div className="min-w-0"><h2 className="break-all text-sm font-medium">{activeFile.file.name}</h2><p className="mt-1 text-xs text-[var(--apple-secondary-label)]">인식된 값은 원본 정산서와 대조해주세요.</p></div>{<a href="#" onClick={event => { let url = previewUrls.current.get(activeFile.file); if (!url) { url = URL.createObjectURL(activeFile.file); previewUrls.current.set(activeFile.file, url); } event.currentTarget.href = url; }} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex min-h-11 shrink-0 items-center px-2 text-sm text-[var(--apple-blue)]">원본 보기</a>}</div>
            {row.role === 'unassigned' ? <div className="space-y-3"><p className="text-sm text-[var(--apple-orange)]">이 파일은 {row.fields?.docType}입니다. 별도 입금요청 대신 다른 정산서의 추가 증빙으로 연결해주세요.</p><Label htmlFor="support-target">연결할 요청</Label><select id="support-target" className="h-11 w-full min-w-0 rounded-lg border border-input bg-[var(--apple-system-background)] px-3 text-sm" value={supportTarget} onChange={e => setSupportTarget(e.target.value)}><option value="">요청 선택</option>{files.filter(f => rows[f.id]?.role === 'request' && !locked(rows[f.id])).map(f => <option key={f.id} value={f.id}>{rows[f.id].draft.title}</option>)}</select><Button className="min-h-11" disabled={!supportTarget || !rows[supportTarget] || locked(rows[supportTarget])} onClick={() => { if (!rowsRef.current[supportTarget] || locked(rowsRef.current[supportTarget])) return; patch(currentId, r => ({ ...r, role: 'support', targetId: supportTarget })); patch(supportTarget, r => ({ ...r, reviewed: false, draft: r.draft.bankName && r.draft.accountNumber ? r.draft : applyDocument(r.draft, row.fields!, r.touched) })); setActive(supportTarget); }}>추가 증빙으로 연결</Button></div> : <>
              <p className="break-words text-xs text-[var(--apple-secondary-label)]">이 요청의 증빙 {attached(currentId).length}개{files.filter(f => rows[f.id]?.targetId === currentId).map(f => ` · ${f.file.name}`).join('')}</p>
              <fieldset disabled={locked(row)} className="min-w-0 space-y-4">
                <CompanySelector value={row.draft.companyId} initialCompanies={initialCompanies} onChange={id => edit(currentId, 'companyId', id)} documentFields={row.fields ? [row.fields] : []} allowDocumentAutoSelect={!row.touched.includes('companyId') && !confirmIds.length && !submitting && !locked(row) && !reading} documentSelectionLocked={locked(row) || !!confirmIds.length} onDocumentCompanyCheckChange={setCompanyBusy} onDocumentCompanyChange={id => edit(currentId, 'companyId', id)} />
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="batch-title">제목</Label><Input id="batch-title" maxLength={200} value={row.draft.title} onChange={e => edit(currentId, 'title', e.target.value)} /></div>
                  <div className="sm:col-span-2"><CategorySelectField value={row.draft.category} onChange={v => edit(currentId, 'category', v)} myCategories={myCategories} /></div>
                  <div className="space-y-1.5"><Label htmlFor="batch-amount">최종 요청 금액</Label><Input id="batch-amount" inputMode="decimal" value={row.draft.amount} onChange={e => edit(currentId, 'amount', e.target.value)} /><p className="text-xs text-[var(--apple-secondary-label)]">부가세 등 포함, 최종 지급 금액</p></div>
                  <div className="space-y-1.5"><Label htmlFor="batch-currency">통화</Label><select id="batch-currency" className="h-11 w-full min-w-0 rounded-lg border border-input bg-[var(--apple-system-background)] px-3 text-sm" value={row.draft.currency} onChange={e => edit(currentId, 'currency', e.target.value)}><option value="KRW">원화 KRW</option><option value="USD">달러 USD</option></select>{row.draft.currency === 'USD' && <p className="text-xs text-[var(--apple-secondary-label)]">제출 시 환율로 원화 환산됩니다.</p>}</div>
                  <div className="space-y-1.5"><Label htmlFor="batch-bank">은행</Label><Input id="batch-bank" list="batch-banks" value={row.draft.bankName} onChange={e => edit(currentId, 'bankName', e.target.value)} /><datalist id="batch-banks">{BANK_LIST.map(b => <option key={b} value={b} />)}</datalist></div>
                  <div className="space-y-1.5"><Label htmlFor="batch-holder">예금주</Label><Input id="batch-holder" maxLength={100} value={row.draft.accountHolder} onChange={e => edit(currentId, 'accountHolder', e.target.value)} /></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="batch-account">계좌번호</Label><Input id="batch-account" inputMode="numeric" maxLength={50} value={row.draft.accountNumber} onChange={e => edit(currentId, 'accountNumber', e.target.value)} /></div>
                  <div className="space-y-1.5"><Label htmlFor="batch-due">납입 기일 · 선택</Label><Input id="batch-due" type="date" value={row.draft.dueDate} onChange={e => edit(currentId, 'dueDate', e.target.value)} /></div>
                </div>
                <ExpenseNotesField id="batch-description" value={row.draft.description} onChange={e => edit(currentId, 'description', e.target.value)} />
                <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-[var(--apple-blue)]"><Paperclip className="mr-1 inline size-4" />추가 증빙 {row.extras.length}개</summary><FileUploadWithDocType files={row.extras} onFilesChange={next => extraFiles(currentId, next)} onDocumentTypeChange={(id, type) => extraFiles(currentId, row.extras.map(f => f.id === id ? { ...f, documentType: type } : f))} onDocumentRead={(_id, result) => patch(currentId, r => ({ ...r, draft: applyDocument(r.draft, { ...result.fields, totalAmount: null, supplyAmount: null, vatAmount: null, merchantName: null }, [...r.touched, ...(["bankName", "accountHolder", "accountNumber"] as DraftField[]).filter(key => !!r.draft[key])]), reviewed: false }))} onReadingCountChange={setExtraReading} /></details>
              </fieldset>
              {row.error && <p role="alert" className="break-words text-sm text-[var(--apple-orange)]">{row.error}</p>}
              {row.expenseId && <Link href={`/expenses/${row.expenseId}`} className="inline-flex min-h-11 items-center text-sm text-[var(--apple-blue)] underline">등록된 요청 보기</Link>}
              {row.status === 'attachment-failed' ? <Button className="min-h-11" disabled={waiting} onClick={() => submit([currentId])}>첨부만 다시 올리기</Button> : row.status === 'unknown' ? <Link href="/expenses" className="inline-flex min-h-11 items-center text-sm text-[var(--apple-blue)] underline">비용 목록에서 등록 여부 확인</Link> : !row.expenseId && <Button className="min-h-11 w-full rounded-full" disabled={waiting} onClick={() => review(currentId)}><Check className="size-4" />{row.reviewed ? '수정 내용 확인' : '이 내용으로 확인'}</Button>}
            </>}
          </section>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--apple-separator)] bg-[var(--apple-system-background)] p-4"><div><p className="text-sm font-medium">확인한 요청 {readyIds.length}건</p><p className="mt-1 text-xs text-[var(--apple-secondary-label)]">선택·확인한 건만 제출합니다. 선지급·원천징수·사입은 직접 작성해주세요.</p></div><Button className="min-h-11 rounded-full" disabled={!readyIds.length || waiting || submitting} onClick={() => setConfirmIds(readyIds)}>{submitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <ScanLine className="size-4" />}확인한 {readyIds.length}건 요청</Button></div>
      </>}
    </fieldset>
    <Dialog open={confirmIds.length > 0} onOpenChange={open => { if (!open) setConfirmIds([]); }}><DialogContent><DialogHeader><DialogTitle>입금요청 {confirmIds.length}건 제출</DialogTitle><DialogDescription>정산서별로 요청과 첨부가 나뉘어 등록됩니다. 각 요청은 관리자 승인 후 처리됩니다.</DialogDescription></DialogHeader><ul className="max-h-72 space-y-3 overflow-y-auto">{confirmIds.map(id => { const r = rows[id]; return <li key={id} className="text-sm"><p className="break-words font-medium">{r.draft.title}</p><p className="text-xs text-[var(--apple-secondary-label)]">{initialCompanies.find(c => c.id === r.draft.companyId)?.name} · {amountLabel(r)} · {r.draft.bankName} · {r.draft.accountHolder} · 증빙 {attached(id).length}개</p></li>; })}</ul><DialogFooter><Button variant="outline" onClick={() => setConfirmIds([])}>다시 수정</Button><Button onClick={() => submit(confirmIds)}>입금요청 {confirmIds.length}건 만들기</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
