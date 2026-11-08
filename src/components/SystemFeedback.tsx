import { useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import { examSync } from '../services/examSync';

export function SystemFeedback({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (onRetry) return;
    const timer = window.setTimeout(() => setSlow(true), 5000);
    return () => window.clearTimeout(timer);
  }, [onRetry]);

  return (
    <section className="mx-auto mt-8 flex w-full max-w-xl items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:gap-4 sm:p-6">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${onRetry ? 'bg-amber-100 text-amber-900' : 'bg-teal-100 text-teal-900'}`} aria-hidden="true">
        {onRetry ? <WifiOff size={22} /> : <LoaderCircle size={22} className="motion-safe:animate-spin" />}
      </span>
      <div className="min-w-0">
        <div role={onRetry ? 'alert' : 'status'}>
          <h1 className="text-lg font-black text-slate-950">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-slate-700">{!onRetry && slow ? '系統回覆較慢，仍在等待連線。請稍候。' : detail}</p>
        </div>
        {onRetry && <button type="button" onClick={onRetry}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-bold text-white hover:bg-teal-900">
          <RefreshCw size={16} aria-hidden="true" />重新載入
        </button>}
      </div>
    </section>
  );
}

export function RequestActivity() {
  const [active, setActive] = useState<Record<number, boolean>>({});
  const [visible, setVisible] = useState(false);
  useEffect(() => examSync.subscribe((event, payload) => {
    if (event === 'REQUEST_STARTED') {
      setActive((current) => ({ ...current, [payload.id]: payload.reading }));
    } else if (event === 'REQUEST_FINISHED') {
      setActive((current) => {
        const next = { ...current };
        delete next[payload];
        return next;
      });
    }
  }), []);
  const requests = Object.values(active);
  const pending = requests.length > 0;
  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 350);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return (
    <div role="status" className="no-print pointer-events-none fixed inset-x-3 bottom-3 z-50 flex justify-end sm:bottom-5 sm:right-5">
      {pending && visible && <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-3.5 py-2.5 text-sm font-bold text-teal-950 shadow-lg">
        <LoaderCircle size={18} aria-hidden="true" className="shrink-0 motion-safe:animate-spin" />
        {requests.every(Boolean) ? '正在讀取資料…' : '正在處理操作，等候系統回覆…'}
      </div>}
    </div>
  );
}
