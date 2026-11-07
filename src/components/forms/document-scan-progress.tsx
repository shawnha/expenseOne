import { CheckCircle2, FileText, Loader2 } from 'lucide-react';

export type DocumentReadStage = 'queued' | 'reading' | 'done' | 'failed' | 'skipped';
export function DocumentScanProgress({ files, stages }: { files: { id: string; name: string }[]; stages: Readonly<Record<string, DocumentReadStage>> }) {
  const active = files.filter(f => stages[f.id] === 'reading').length;
  const queued = files.filter(f => stages[f.id] === 'queued').length;
  const complete = files.filter(f => stages[f.id] === 'done').length;
  const failed = files.filter(f => ['failed', 'skipped'].includes(stages[f.id])).length;
  if (!files.length || !Object.keys(stages).length) return null;
  return (
    <div className="rounded-xl border border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] p-4" aria-live="polite" aria-busy={active + queued > 0}>
      <div className="flex items-center gap-4">
        {active + queued > 0 ? <div className="document-scan-sheet" aria-hidden="true"><FileText className="size-7 text-[var(--apple-blue)]" /><span className="document-scan-beam" /></div> : <CheckCircle2 className="size-6 shrink-0 text-[var(--apple-blue)]" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--apple-label)]">{active + queued > 0 ? '문서 스캔 중' : '문서 확인 완료'}</p>
          <p className="mt-1 text-xs text-[var(--apple-secondary-label)]">{active + queued > 0 ? `인식 중 ${active}개 · 대기 ${queued}개` : '인식된 값은 제출 전에 확인해주세요.'}</p>
          <p className="mt-1 text-xs tabular-nums text-[var(--apple-secondary-label)]">{complete} / {files.length}개 인식 완료{failed > 0 && ` · 직접 입력 필요 ${failed}개`}</p>
        </div>
      </div>
      {active + queued > 0 && <ul className="mt-3 space-y-1 text-xs text-[var(--apple-secondary-label)]">{files.filter(f => ['reading', 'queued'].includes(stages[f.id])).map(f => <li key={f.id} className="flex min-w-0 items-center gap-2"><Loader2 className={`size-3 shrink-0 ${stages[f.id] === 'reading' ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /><span className="min-w-0 break-all">{f.name}</span><span className="ml-auto shrink-0">{stages[f.id] === 'reading' ? '스캔 중' : '대기'}</span></li>)}</ul>}
    </div>
  );
}
