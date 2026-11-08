import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, FileClock, History, RefreshCw, ShieldAlert } from 'lucide-react';
import { examSync } from '../../services/examSync';
import { auditActions, type AuditLogPage } from '../../types/audit';

const taipeiTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'medium'
});
const button = 'inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50';
const columns = 'lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_8rem]';
const reviewActions = new Set(['loginFailed', 'rateLimited', 'accessDenied', 'examReset', 'examClearCurrent']);

export function AuditLogView() {
  const [cursors, setCursors] = useState<(number | null)[]>([null]);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<AuditLogPage>();
  const [error, setError] = useState('');
  const before = cursors[cursors.length - 1];
  const loading = !result && !error;

  useEffect(() => {
    const request = new AbortController();
    setResult(undefined);
    setError('');
    examSync.fetchAuditLogs(before, request.signal)
      .then((page) => { if (!request.signal.aborted) setResult(page); })
      .catch((err) => { if (!request.signal.aborted) setError(err instanceof Error ? err.message : '無法載入操作紀錄'); });
    return () => request.abort();
  }, [before, refresh]);

  function refreshLatest() {
    setCursors([null]);
    setRefresh((value) => value + 1);
  }

  return (
    <section aria-labelledby="audit-title" className="min-w-0 space-y-4">
      <header className="view-header-banner flex items-start gap-3 rounded-2xl border border-(--header-edge) p-4 sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-(--header-edge) bg-white text-(--header-accent) sm:size-12">
          <History size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="audit-title" className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">操作紀錄</h2>
          <p className="mt-1 text-sm leading-6 text-slate-700">查看登入、登出與主要考務異動。</p>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-950">紀錄清單</h3>
            <p className="text-xs text-slate-600 sm:text-sm">
              {result ? `本頁 ${result.entries.length} 筆 · ` : ''}由新到舊
            </p>
          </div>
          <button type="button" className={`${button} shrink-0 cursor-pointer disabled:cursor-default`} disabled={loading} onClick={refreshLatest}>
            <RefreshCw size={16} aria-hidden="true" />更新最新紀錄
          </button>
        </div>
        {loading && <p role="status" className="flex min-h-36 items-center justify-center gap-2 px-4 text-sm font-bold text-slate-700">
          <RefreshCw size={16} className="motion-safe:animate-spin" aria-hidden="true" />正在載入操作紀錄…
        </p>}
        <div aria-busy={loading}>
          {error && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-rose-50 p-4 sm:px-5">
              <p role="alert" className="flex min-w-0 items-start gap-2 text-sm font-bold text-rose-900 [overflow-wrap:anywhere]">
                <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{error}
              </p>
              <button type="button" className={button} onClick={() => setRefresh((value) => value + 1)}>重試</button>
            </div>
          )}
          {result && (result.entries.length > 0 ? (
            <>
              <div aria-hidden="true" className={`hidden gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-bold text-slate-600 lg:grid ${columns}`}>
                <span>操作</span><span>操作人員</span><span>操作對象</span><span>時間</span>
              </div>
              <ul aria-label="操作紀錄清單" className="divide-y divide-slate-200">
                {result.entries.map((entry) => {
                  const [date, time] = taipeiTime.format(entry.occurredAt).split(' ');
                  const needsReview = reviewActions.has(entry.action);
                  const Icon = needsReview ? ShieldAlert : FileClock;
                  return (
                    <li key={entry.id} className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3 text-sm [overflow-wrap:anywhere] hover:bg-slate-50 sm:px-5 lg:items-center lg:gap-4 ${columns}`}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${needsReview ? 'bg-amber-50 text-amber-900' : 'bg-violet-50 text-violet-800'}`}>
                          <Icon size={17} aria-hidden="true" />
                        </span>
                        <strong className="min-w-0 text-slate-950">{auditActions[entry.action]}</strong>
                      </div>
                      <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 lg:col-start-auto lg:row-start-auto">
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${entry.role === 'admin' ? 'bg-violet-100 text-violet-900' : 'bg-sky-100 text-sky-900'}`}>
                          {entry.role === 'admin' ? '管理員' : '教師'}
                        </span>
                        <span className="min-w-0 font-semibold text-slate-800">{entry.actor}</span>
                      </div>
                      <div className="col-span-2 min-w-0 text-slate-700 lg:col-span-1">
                        <span className="mr-2 text-xs font-bold text-slate-500 lg:hidden">操作對象</span>
                        {entry.target || '—'}
                      </div>
                      <time dateTime={new Date(entry.occurredAt).toISOString()}
                        className="col-start-2 row-start-1 font-mono text-xs leading-5 whitespace-nowrap tabular-nums text-slate-600 lg:col-start-auto lg:row-start-auto">
                        <span className="block">{date}</span>
                        <span className="block font-bold text-slate-800">{time}</span>
                      </time>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="grid min-h-36 justify-items-center content-center gap-2 p-5 text-center">
              <FileClock size={26} className="text-violet-800" aria-hidden="true" />
              <p className="text-sm font-bold text-slate-700">{cursors.length === 1 ? '目前沒有操作紀錄。' : '此頁沒有操作紀錄。'}</p>
            </div>
          ))}
        </div>
        {(result || cursors.length > 1) && (
          <nav aria-label="操作紀錄分頁" className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 p-3 sm:px-5">
            <button type="button" disabled={cursors.length < 2} className={button} onClick={() => setCursors((pages) => pages.slice(0, -1))}>
              <ArrowLeft size={16} aria-hidden="true" />較新紀錄
            </button>
            <p role="status" className="text-sm font-bold text-slate-700">第 {cursors.length} 頁</p>
            <button type="button" disabled={result?.nextBefore == null} className={button}
              onClick={() => { if (result?.nextBefore != null) setCursors((pages) => [...pages, result.nextBefore]); }}>
              較舊紀錄<ArrowRight size={16} aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}
