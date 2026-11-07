import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarClock, ChevronLeft, ChevronRight, Focus, List, Megaphone, Pause, Play } from 'lucide-react';
import { announcementDisplayStart } from '../../types/announcements';
import type { ExamAnnouncement } from '../../types/exam';

const styles = {
  emergency: { label: '緊急公告', rank: 0, frame: 'border-rose-300 bg-rose-50', ribbon: 'bg-rose-900 text-white', meta: 'text-rose-900', progress: 'bg-rose-700' },
  correction: { label: '試題更正', rank: 1, frame: 'border-amber-300 bg-amber-50', ribbon: 'bg-amber-300 text-amber-950', meta: 'text-amber-950', progress: 'bg-amber-700' },
  extension: { label: '考試延長', rank: 2, frame: 'border-sky-300 bg-sky-50', ribbon: 'bg-sky-900 text-white', meta: 'text-sky-900', progress: 'bg-sky-700' },
  notice: { label: '考務公告', rank: 3, frame: 'border-teal-300 bg-teal-50', ribbon: 'bg-teal-900 text-white', meta: 'text-teal-900', progress: 'bg-teal-700' }
};

const projectionTime = new Intl.DateTimeFormat('zh-TW', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Taipei'
});
const control = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:text-sm';
const noticeStyle = (notice: ExamAnnouncement) => styles[notice.type] ?? styles.notice;
const readingTime = (notice?: ExamAnnouncement) => notice ? Math.min(120, Math.max(30, Math.ceil(notice.content.length / 6))) : 30;

export function AnnouncementProjection({ announcements, focused, fitToScreen, onToggleFocus }: {
  announcements: ExamAnnouncement[];
  focused: boolean;
  fitToScreen: boolean;
  onToggleFocus?: () => void;
}) {
  const notices = [...announcements].sort((first, second) => noticeStyle(first).rank - noticeStyle(second).rank);
  const leadingId = notices[0]?.id;
  const [selectedId, setSelectedId] = useState(leadingId);
  const notice = notices.find((item) => item.id === selectedId) ?? notices[0];
  const currentIndex = notices.findIndex((item) => item.id === notice?.id);
  const duration = readingTime(notice);
  const [seconds, setSeconds] = useState(duration);
  const remaining = useRef(duration * 1000);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [readingId, setReadingId] = useState<string | null>(null);
  const reading = Boolean(notice && readingId === notice.id);
  const canRotate = notices.length > 1;
  const style = notice && noticeStyle(notice);
  const dense = Boolean(fitToScreen && notice && (notice.content.length > 500 || notice.content.split('\n').length >= 12));

  useEffect(() => setSelectedId(leadingId), [leadingId]);
  useEffect(() => {
    remaining.current = duration * 1000;
    setSeconds(duration);
  }, [notice?.id, duration]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setPaused(event.matches);
    preference.addEventListener('change', onChange);
    return () => preference.removeEventListener('change', onChange);
  }, []);

  const nextId = canRotate ? notices[(currentIndex + 1) % notices.length].id : undefined;
  useEffect(() => {
    if (!nextId || paused || reading) return;
    const deadline = Date.now() + remaining.current;
    const timer = window.setInterval(() => {
      remaining.current = Math.max(0, deadline - Date.now());
      if (remaining.current) {
        setSeconds(Math.ceil(remaining.current / 1000));
      } else {
        window.clearInterval(timer);
        setSelectedId(nextId);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [notice?.id, duration, nextId, paused, reading]);

  function move(offset: number) {
    setSelectedId(notices[(currentIndex + offset + notices.length) % notices.length].id);
  }

  return (
    <section aria-labelledby="projection-heading" className="notice-panel min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="notice-panel-heading flex flex-wrap items-start justify-between gap-2 pb-3 sm:items-center">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-900 text-white sm:size-11">
            <Megaphone size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="projection-heading" className="text-base font-black tracking-tight text-slate-950 sm:text-xl">試題更正與考務公告</h2>
            <p className="mt-0.5 text-xs font-bold text-slate-600">{notices.length ? `${notices.length} 則顯示中` : '等待教務處發布'}</p>
          </div>
        </div>
        {(notice || focused) && onToggleFocus && (
          <button type="button" onClick={onToggleFocus} className={control}>
            {focused ? <List size={17} aria-hidden="true" /> : <Focus size={17} aria-hidden="true" />}
            {focused ? '返回完整黑板' : '放大公告'}
          </button>
        )}
      </div>

      {canRotate && (
        <div className="notice-controls mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100 p-2">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-1 sm:flex-none">
            <button type="button" aria-label="上一則公告" className={control} onClick={() => move(-1)}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <select aria-label="跳至公告" value={notice?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)}
              className="min-h-11 min-w-0 flex-1 cursor-pointer rounded-xl border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-700 sm:max-w-56 sm:flex-none sm:text-sm">
              {notices.map((item, index) => (
                <option key={item.id} value={item.id}>{index + 1}／{notices.length} · {item.title.slice(0, 28)}</option>
              ))}
            </select>
            <button type="button" aria-label="下一則公告" className={control} onClick={() => move(1)}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold tabular-nums text-slate-700">{paused || reading ? '輪播暫停' : `${seconds} 秒後切換`}</span>
            <button type="button" onClick={() => setPaused((value) => !value)} className={control}>
              {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
              {paused ? '繼續輪播' : '暫停輪播'}
            </button>
          </div>
        </div>
      )}

      <p role="status" aria-atomic="true" className="sr-only">
        {notice ? `第 ${currentIndex + 1} 則公告，${noticeStyle(notice).label}，${notice.title}` : '目前沒有試題更正或考務公告。'}
      </p>
      {notice && style ? (
        <article key={notice.id} className={`min-w-0 overflow-hidden rounded-2xl border ${style.frame}`}>
          <div className={`notice-type flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6 ${style.ribbon}`}>
            <span className="flex items-center gap-2 text-base font-black tracking-wide sm:text-xl">
              <Bell size={20} className="shrink-0" aria-hidden="true" />{style.label}
            </span>
            {notice.subject && <span className="max-w-full text-sm font-bold [overflow-wrap:anywhere] sm:text-base">{notice.subject}</span>}
          </div>
          {canRotate && (
            <div aria-hidden="true" className="h-1 bg-white/75">
              <div className={`h-full ${style.progress}`} style={{ width: `${Math.max(0, Math.min(100, seconds / duration * 100))}%` }} />
            </div>
          )}
          <div className="notice-content min-w-0 space-y-3 p-3 sm:space-y-4 sm:p-5 lg:p-6">
            <h3 className={`notice-title font-black leading-tight tracking-tight text-slate-950 [overflow-wrap:anywhere] ${focused ? 'text-3xl sm:text-[clamp(2.25rem,4.5vw,5rem)]' : 'text-2xl sm:text-[clamp(1.875rem,3.1vw,3.75rem)]'}`}>
              {notice.title}
            </h3>
            <div role="region" aria-label="公告內文" tabIndex={0}
              onFocus={() => setReadingId(notice.id)} onBlur={() => setReadingId(null)}
              className={`notice-body min-w-0 rounded-xl border border-slate-200 bg-white p-3 focus-visible:outline-2 focus-visible:outline-teal-700 sm:p-5 lg:p-6 ${fitToScreen ? dense ? 'notice-body-dense' : '' : `overflow-y-auto overscroll-contain ${focused ? 'max-h-[55dvh]' : 'max-h-[46dvh]'}`}`}>
              <p className={`whitespace-pre-wrap font-bold leading-relaxed text-slate-950 [overflow-wrap:anywhere] ${focused ? 'text-2xl sm:text-[clamp(1.875rem,3.3vw,3.75rem)]' : 'text-xl sm:text-[clamp(1.5rem,2.35vw,2.75rem)]'}`}>
                {notice.content}
              </p>
            </div>
            <footer className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-bold sm:text-sm ${style.meta}`}>
              <span className="min-w-0 [overflow-wrap:anywhere]">{notice.publishedBy || '教務處'}</span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock size={15} aria-hidden="true" />
                顯示時間 <time>{projectionTime.format(announcementDisplayStart(notice))}</time>
              </span>
            </footer>
          </div>
        </article>
      ) : (
        <div className="notice-empty rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
          <div>
            <Bell size={27} className="mx-auto mb-2 text-teal-800" aria-hidden="true" />
            <h3 className="text-xl font-black text-slate-900 sm:text-2xl">目前沒有公告</h3>
            <p className="mt-1 text-sm leading-6 text-slate-700">教務處發布試題更正或考務通知後，會自動顯示在這裡。</p>
          </div>
        </div>
      )}
    </section>
  );
}
