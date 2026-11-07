import { useLayoutEffect, useRef } from 'react';
import { ArrowLeft, BookOpen, CalendarClock, Clock, Maximize2, Minimize2 } from 'lucide-react';
import type { ClassroomExamState, ExamConfig, ExamPeriod } from '../../types/exam';
import { gradeLabel } from '../../types/grades';

const clockFormat = new Intl.DateTimeFormat('zh-TW', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Taipei'
});
const control = 'inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/25 px-2.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 sm:px-3';

interface BlackboardHeaderProps {
  classroom: Pick<ClassroomExamState, 'classId' | 'className' | 'grade'>;
  config: ExamConfig;
  now: Date;
  date: string;
  period?: ExamPeriod;
  nextPeriod?: ExamPeriod;
  hasScheduleToday: boolean;
  announcementFocus: boolean;
  isFullscreen: boolean;
  connectionMessage?: string;
  onChooseClassroom?: () => void;
  onToggleFullscreen?: () => void;
}

export function BlackboardHeader({
  classroom, config, now, date, period, nextPeriod, hasScheduleToday, announcementFocus,
  isFullscreen, connectionMessage, onChooseClassroom, onToggleFullscreen
}: BlackboardHeaderProps) {
  const [hours, minutes, seconds] = clockFormat.format(now).split(':');
  const schoolDetails = [config.schoolName, config.academicYear, config.examName].filter(Boolean).join(' · ');
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    if (restoreFocus.current) {
      fullscreenButton.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [isFullscreen]);
  const controls = (onChooseClassroom || onToggleFullscreen) && (
    <div className="flex max-w-full flex-wrap items-center gap-1.5">
      {onChooseClassroom && (
        <button type="button" onClick={onChooseClassroom} className={`${control} bg-white/5 text-white hover:bg-white/15`}>
          <ArrowLeft size={16} aria-hidden="true" />重新選班
        </button>
      )}
      {onToggleFullscreen && (
        <button ref={fullscreenButton} type="button" onClick={(event) => {
          restoreFocus.current = document.activeElement === event.currentTarget;
          onToggleFullscreen();
        }} className={`${control} bg-teal-200 text-slate-950 hover:bg-teal-100`}>
          {isFullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          {isFullscreen ? '退出全螢幕' : '全螢幕'}
        </button>
      )}
    </div>
  );
  const connectionStatus = connectionMessage && (
    <p role="status" className="border-b border-amber-300/40 bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-950 sm:px-5">{connectionMessage}</p>
  );

  if (isFullscreen) {
    return (
      <header className={`projection-header${announcementFocus ? ' projection-header-focus' : ''}`}>
        <div className="projection-toolbar">
          <div className="projection-brand">
            <span className="projection-brand-icon"><BookOpen size={17} aria-hidden="true" /></span>
            <strong>教室電子黑板</strong>
            {!announcementFocus && schoolDetails && <span className="projection-school">{schoolDetails}</span>}
          </div>
          {controls}
        </div>
        {connectionStatus}
        <div className="projection-masthead">
          <div className="projection-class">
            <p className="projection-kicker">目前考場</p>
            <p className="projection-class-name">{classroom.className}</p>
            {!announcementFocus && <p className="projection-class-code">{gradeLabel(config, classroom.grade)} · {classroom.classId}</p>}
          </div>
          <div className="projection-exam">
            <p className={`projection-exam-state${period && !announcementFocus ? ' projection-exam-active' : ''}`}>
              {announcementFocus ? '公告投影' : period ? '考試進行中' : '非考試時段'}
            </p>
            <h1>{period?.subject ?? '今日考程'}</h1>
            {!announcementFocus && (period ? (
              <p className="projection-exam-detail">
                <span className="projection-numerals">{period.startTime}–{period.endTime}</span>
                {config.durationMinutes > 0 && <span>{config.durationMinutes} 分鐘</span>}
              </p>
            ) : nextPeriod ? (
              <p className="projection-exam-detail">下一節 <span className="projection-numerals">{nextPeriod.startTime}–{nextPeriod.endTime}</span> · {nextPeriod.subject}</p>
            ) : <p className="projection-exam-detail">{hasScheduleToday ? '今日考試已結束' : '今日沒有安排考試'}</p>)}
          </div>
          <div className="projection-clock">
            <p className="projection-kicker"><Clock size={15} aria-hidden="true" />台灣時間</p>
            <time dateTime={now.toISOString()} className="projection-clock-time">{hours}:{minutes}<span>:{seconds}</span></time>
            {!announcementFocus && <time dateTime={date} className="projection-clock-date">{date}</time>}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="attendance-banner relative isolate shrink-0 overflow-hidden text-white">
      <div className="attendance-banner-pattern pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/15 bg-slate-950/20 px-3 py-2 sm:px-5 lg:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <p className="flex items-center gap-1.5 text-xs font-black tracking-wide text-teal-100">
            <BookOpen size={16} aria-hidden="true" />教室電子黑板
          </p>
          {!announcementFocus && schoolDetails && (
            <p className="min-w-0 text-xs leading-5 text-slate-100 [overflow-wrap:anywhere]">{schoolDetails}</p>
          )}
        </div>
        {controls}
      </div>
      {connectionStatus}

      <div className={`grid grid-cols-2 items-center gap-x-3 gap-y-3 px-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)_minmax(8.5rem,auto)] sm:gap-x-4 sm:px-5 lg:px-6 ${announcementFocus ? 'py-2 sm:py-2.5' : 'py-3 sm:py-4'}`}>
        <div className="col-start-1 row-start-1 min-w-0">
          <p className="text-xs font-bold text-teal-100">目前班級</p>
          <p className={`font-black leading-tight tracking-tight text-white [overflow-wrap:anywhere] ${announcementFocus ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl lg:text-3xl'}`}>
            {classroom.className}
          </p>
          {!announcementFocus && <p className="mt-1 text-xs font-bold text-slate-200 [overflow-wrap:anywhere]">
            {gradeLabel(config, classroom.grade)} · {classroom.classId}
          </p>}
        </div>

        <div className={`col-span-2 row-start-2 min-w-0 rounded-xl border border-white/20 bg-slate-950/25 px-3 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:px-4 ${announcementFocus ? 'py-1.5 sm:py-2' : 'py-2.5 sm:py-3'}`}>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black ${period && !announcementFocus ? 'bg-teal-200 text-slate-950' : 'bg-white/15 text-white'}`}>
              {period && !announcementFocus && <span className="size-1.5 rounded-full bg-teal-800" aria-hidden="true" />}
              {announcementFocus ? '公告投影' : period ? '考試進行中' : '非考試時段'}
            </span>
            <h1 className={`min-w-0 font-black leading-tight tracking-tight text-white [overflow-wrap:anywhere] ${announcementFocus ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl lg:text-3xl'}`}>
              {period?.subject ?? '今日考程'}
            </h1>
          </div>
          {!announcementFocus && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs font-bold leading-5 text-teal-50 sm:text-sm">
              <CalendarClock size={16} className="mt-0.5 shrink-0 text-teal-100" aria-hidden="true" />
              {period ? (
                <span className="min-w-0"><span className="font-mono tabular-nums">{period.startTime}–{period.endTime}</span>
                  {config.durationMinutes > 0 && <span className="ml-2">{config.durationMinutes} 分鐘</span>}
                </span>
              ) : nextPeriod ? (
                <span className="min-w-0 [overflow-wrap:anywhere]">下一節 <span className="font-mono tabular-nums">{nextPeriod.startTime}–{nextPeriod.endTime}</span> · {nextPeriod.subject}</span>
              ) : <span>{hasScheduleToday ? '今日考試已結束' : '今日沒有安排考試'}</span>}
            </p>
          )}
        </div>

        <div className="col-start-2 row-start-1 min-w-0 justify-self-end text-right sm:col-start-3">
          <p className="flex items-center justify-end gap-1 text-xs font-bold text-teal-100">
            <Clock size={14} className="shrink-0" aria-hidden="true" />台灣時間
          </p>
          <time dateTime={now.toISOString()} className={`mt-0.5 block whitespace-nowrap font-mono font-black leading-none tabular-nums ${announcementFocus ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl lg:text-4xl'}`}>
            {hours}:{minutes}<span className="text-sm text-teal-100 sm:text-base">:{seconds}</span>
          </time>
          {!announcementFocus && <time dateTime={date} className="mt-1 block font-mono text-xs font-bold text-slate-200">{date}</time>}
        </div>
      </div>
    </header>
  );
}
