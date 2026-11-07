import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, History, RefreshCw } from 'lucide-react';
import { examSync } from '../../services/examSync';
import { auditActions, type AuditLogPage } from '../../types/audit';

const taipeiTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'medium'
});
const button = 'inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50';

export function AuditLogView() {
  const [cursors, setCursors] = useState<(number | null)[]>([null]);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<AuditLogPage>();
  const [error, setError] = useState('');
  const before = cursors[cursors.length - 1];

  useEffect(() => {
    const request = new AbortController();
    setResult(undefined);
    setError('');
    examSync.fetchAuditLogs(before, request.signal)
      .then((page) => { if (!request.signal.aborted) setResult(page); })
      .catch((err) => { if (!request.signal.aborted) setError(err instanceof Error ? err.message : '無法載入操作紀錄'); });
    return () => request.abort();
  }, [before, refresh]);

  return (
    <section aria-labelledby="audit-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="audit-title" className="flex items-center gap-2 text-lg font-black text-slate-950">
            <History size={20} className="text-teal-800" aria-hidden="true" />操作紀錄
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">查看登入、登出與主要考務異動。時間以台灣時間顯示。</p>
        </div>
        <button type="button" className={button} onClick={() => { setCursors([null]); setRefresh((value) => value + 1); }}>
          <RefreshCw size={16} aria-hidden="true" />重新整理
        </button>
      </div>
      <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-sm font-bold text-teal-950">紀錄保留三個月，到期後自動刪除。</p>
      <div className="mt-4" aria-busy={!result && !error}>
        {error && <p role="alert" className="text-sm font-bold text-rose-800">{error}</p>}
        {!result && !error && <p role="status" className="text-sm text-slate-700">正在載入操作紀錄…</p>}
        {result && (result.entries.length > 0 ? (
          <ul aria-label="操作紀錄清單" className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            {result.entries.map((entry) => (
              <li key={entry.id} className="grid gap-1.5 px-3 py-3 text-sm [overflow-wrap:anywhere] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_10.5rem] md:items-baseline md:gap-3 sm:px-4">
                <strong className="text-slate-950">{auditActions[entry.action]}</strong>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-slate-800">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{entry.role === 'admin' ? '管理員' : '教師'}</span>
                  <span className="min-w-0">{entry.actor}</span>
                </div>
                <span className="text-slate-700">{entry.target ? `對象 · ${entry.target}` : '—'}</span>
                <time dateTime={new Date(entry.occurredAt).toISOString()} className="font-mono text-xs tabular-nums text-slate-700">{taipeiTime.format(entry.occurredAt)}</time>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">此頁沒有操作紀錄。</p>)}
      </div>
      {result && (cursors.length > 1 || result.nextBefore !== null) && (
        <nav aria-label="操作紀錄分頁" className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" disabled={cursors.length < 2} className={button} onClick={() => setCursors((pages) => pages.slice(0, -1))}>
            <ArrowLeft size={16} aria-hidden="true" />較新紀錄
          </button>
          <p role="status" className="text-sm font-bold text-slate-700">第 {cursors.length} 頁</p>
          <button type="button" disabled={result.nextBefore === null} className={button}
            onClick={() => { if (result.nextBefore !== null) setCursors([...cursors, result.nextBefore]); }}>
            較舊紀錄<ArrowRight size={16} aria-hidden="true" />
          </button>
        </nav>
      )}
    </section>
  );
}
