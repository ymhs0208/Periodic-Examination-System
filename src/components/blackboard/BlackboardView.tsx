import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  Clock,
  Users,
  ShieldCheck,
  CalendarClock,
  UserCheck,
  UserMinus,
  AlertCircle
} from 'lucide-react';
import type { ClassroomExamState, ExamAnnouncement, ExamConfig } from '../../types/exam';
import { publicAbsenceReason } from '../../types/exam';
import { classroomAnnouncements } from '../../types/announcements';
import { AnnouncementProjection } from './AnnouncementProjection';
import { BlackboardHeader } from './BlackboardHeader';
import { ProjectionAttendance, ProjectionSchedule } from './ProjectionSummary';
import { activePeriod, classroomForPeriod, configForPeriod, examPeriods, periodApplies, taipeiDateTime } from '../../types/examSchedule';
import './projection.css';

interface BlackboardViewProps {
  classroom: ClassroomExamState;
  announcements: ExamAnnouncement[];
  config: ExamConfig;
  onChooseClassroom?: () => void;
  connectionMessage?: string;
  isEmbedded?: boolean;
}

export const BlackboardView: React.FC<BlackboardViewProps> = ({
  classroom: baseClassroom,
  announcements,
  config: examConfig,
  onChooseClassroom,
  connectionMessage,
  isEmbedded = false
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [today, taipeiTime] = taipeiDateTime.format(currentTime).split(' ');
  const todaysPeriods = examPeriods(examConfig).filter((period) => period.date === today && periodApplies(period, baseClassroom));
  const period = activePeriod(todaysPeriods, currentTime);
  const nextPeriod = todaysPeriods.find((item) => item.startTime > taipeiTime);
  const classroom = classroomForPeriod(baseClassroom, period);
  const config = period ? configForPeriod(examConfig, period) : examConfig;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [announcementFocus, setAnnouncementFocus] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const fullscreenContentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const content = fullscreenContentRef.current;
    if (!isFullscreen || !board || !content) return;

    const fitContent = () => {
      const { clientWidth: width, clientHeight: height } = board;
      if (!width || !height) return;
      const setWidth = (scale: number) => { content.style.width = `${width / scale}px`; };
      setWidth(1);
      const naturalHeight = content.offsetHeight;
      let scale = 1;
      if (naturalHeight > height) {
        // Reflow across the full screen width so long content does not turn into a narrow strip.
        const availableHeight = height - 1;
        let low = availableHeight / naturalHeight;
        let high = 1;
        for (let step = 0; step < 8; step++) {
          const candidate = (low + high) / 2;
          setWidth(candidate);
          if (content.offsetHeight * candidate <= availableHeight) low = candidate;
          else high = candidate;
        }
        scale = low;
        setWidth(scale);
      }
      content.style.transform = `scale(${scale})`;
    };
    fitContent();
    const observer = new ResizeObserver(fitContent);
    observer.observe(board);
    observer.observe(content);
    return () => {
      observer.disconnect();
      content.style.removeProperty('transform');
      content.style.removeProperty('width');
    };
  }, [isFullscreen]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === boardRef.current && !!boardRef.current);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen]);

  const relevantAnnouncements = classroomAnnouncements(announcements, classroom, currentTime.getTime());
  const focusAnnouncements = announcementFocus && relevantAnnouncements.length > 0;
  useEffect(() => {
    if (!relevantAnnouncements.length) setAnnouncementFocus(false);
  }, [relevantAnnouncements.length]);

  const toggleFullscreen = () => {
    const nextState = !isFullscreen;
    setIsFullscreen(nextState);
    if (nextState) {
      if (!document.fullscreenElement && boardRef.current?.requestFullscreen) {
        boardRef.current.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const hasAbsences = classroom.statusReported && classroom.absentCount > 0;
  const absentSeats = hasAbsences
    ? [...classroom.absentStudents].sort((a, b) => a.seatNo - b.seatNo)
    : [];
  const AbsenceIcon = !classroom.statusReported ? Clock : hasAbsences ? UserMinus : ShieldCheck;
  const absenceState = !classroom.statusReported ? '等待監考老師回報' : hasAbsences ? '已完成點名' : '全班到齊';
  const absenceTone = !classroom.statusReported
    ? 'border-amber-200 bg-amber-50 text-amber-950'
    : hasAbsences
      ? 'border-rose-200 bg-rose-50 text-rose-950'
      : 'border-teal-200 bg-teal-50 text-teal-950';

  const rulesList = config.rulesNotes;

  return (
    <div
      ref={boardRef}
      className={`${
        isFullscreen && !isEmbedded
          ? 'projection-board fixed inset-0 z-50 h-dvh w-screen overflow-clip rounded-none border-0'
          : isEmbedded
          ? 'relative w-full rounded-2xl border border-slate-200/90 xl:h-[780px] h-auto shadow-xs overflow-hidden'
          : 'relative w-full flex-1 min-h-0 lg:h-full rounded-2xl border border-slate-200/90 shadow-xs overflow-y-auto'
      } bg-[#f4f7fb] text-slate-900 flex flex-col select-none`}
    >
      <div ref={fullscreenContentRef}
        className={isFullscreen ? 'flex min-h-full w-full shrink-0 origin-top-left flex-col transition-none' : 'contents'}>
      <BlackboardHeader classroom={classroom} config={config} now={currentTime} date={today}
        period={period} nextPeriod={nextPeriod} hasScheduleToday={todaysPeriods.length > 0}
        announcementFocus={focusAnnouncements} isFullscreen={isFullscreen}
        connectionMessage={connectionMessage} onChooseClassroom={onChooseClassroom} onToggleFullscreen={isEmbedded ? undefined : toggleFullscreen} />

      <div
        className={`flex-1 ${
          isFullscreen
            ? `projection-layout min-h-0 overflow-hidden${focusAnnouncements ? ' projection-layout-focus' : !relevantAnnouncements.length ? ' projection-layout-quiet' : ''}`
            : isEmbedded
            ? 'min-h-fit p-3 flex flex-col gap-3'
            : 'min-h-fit p-2.5 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-4 items-stretch'
        }`}
      >
        <div className={isFullscreen ? 'projection-notices' : `flex min-w-0 flex-col ${focusAnnouncements || isEmbedded ? 'lg:col-span-12' : relevantAnnouncements.length ? 'lg:col-span-8 lg:col-start-5 lg:row-start-1' : 'lg:col-span-5 lg:col-start-8 lg:row-start-1'}`}>
          <AnnouncementProjection key={classroom.classId} announcements={relevantAnnouncements} focused={focusAnnouncements} fitToScreen={isFullscreen}
            onToggleFocus={isEmbedded ? undefined : () => setAnnouncementFocus((value) => !value)} />
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            左欄：考場出席統計、缺席座號與考場守則
           ────────────────────────────────────────────────────────────────── */}
        <div hidden={focusAnnouncements}
          className={isFullscreen ? 'projection-overview' : `${focusAnnouncements ? 'hidden' : 'flex'} min-w-0 flex-col gap-3 ${
            isEmbedded ? 'w-full' : relevantAnnouncements.length ? 'lg:col-span-4 lg:col-start-1 lg:row-start-1' : 'order-first lg:order-none lg:col-span-7 lg:col-start-1 lg:row-start-1'
          }`}>
          {/* 區塊 A：考場出席人數即時看板 */}
          {isFullscreen ? <>
            {period && <ProjectionAttendance classroom={classroom} absences={absentSeats} />}
            {!period && <ProjectionSchedule periods={todaysPeriods} nextPeriod={nextPeriod} time={taipeiTime} />}
          </> : period ? <div className="flex-1 bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 lg:p-5 flex flex-col justify-between gap-3 shadow-2xs">
            {/* 標題列 */}
            <div className="shrink-0 border-b border-slate-100 pb-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base sm:text-lg lg:text-xl font-black text-slate-900 tracking-tight">
                        考場出席人數即時看板
                      </h2>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono font-black text-xs tabular-nums">
                        {classroom.className}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 whitespace-nowrap ${
                      classroom.statusReported
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    {classroom.statusReported ? '已完成點名核對' : '點名回報中'}
                  </span>
                </div>
              </div>
            </div>

            <dl className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4">
                <dt className="text-xs font-bold text-slate-700 sm:text-sm">應到人數</dt>
                <dd className="mt-1 flex items-baseline gap-1.5 text-slate-950">
                  <span className="font-mono text-2xl font-black leading-none tabular-nums sm:text-4xl">{classroom.expectedCount}</span>
                  <span className="text-xs font-bold">人</span>
                </dd>
              </div>
              <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 sm:px-4">
                <dt className="text-xs font-bold text-teal-900 sm:text-sm">實到人數</dt>
                <dd className="mt-1 flex items-baseline gap-1.5 text-teal-950">
                  <span className="font-mono text-2xl font-black leading-none tabular-nums sm:text-4xl">{classroom.statusReported ? classroom.presentCount : '—'}</span>
                  {classroom.statusReported && <span className="text-xs font-bold">人</span>}
                </dd>
              </div>
            </dl>

            <section aria-labelledby="blackboard-absence-heading"
              className={`flex flex-1 flex-col justify-center gap-3 rounded-2xl border px-3 py-4 sm:px-5 sm:py-5 ${absenceTone}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-current/20 bg-white/70 sm:size-11">
                    <AbsenceIcon size={21} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 id="blackboard-absence-heading" className="text-base font-black sm:text-xl">缺席人數</h3>
                    <p className="mt-0.5 text-sm font-bold">{absenceState}</p>
                  </div>
                </div>
                <p className="flex items-baseline gap-1.5">
                  <span className="font-mono text-4xl font-black leading-none tabular-nums sm:text-5xl">
                    {classroom.statusReported ? classroom.absentCount : '—'}
                  </span>
                  {classroom.statusReported && <span className="text-sm font-bold sm:text-base">人</span>}
                </p>
              </div>
              <p className="sr-only" role="status" aria-atomic="true">
                {classroom.statusReported ? `缺席 ${classroom.absentCount} 人` : '缺席人數尚未回報'}
              </p>

              {hasAbsences && (
                <div className="border-t border-rose-200 pt-3">
                  <h4 className="text-sm font-black sm:text-base">缺席座號與假別</h4>
                  {absentSeats.length > 0 ? (
                    <ul aria-label="缺席座號與假別" className="mt-2 flex flex-wrap gap-2">
                      {absentSeats.map(({ seatNo, reason }) => (
                        <li key={seatNo} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-rose-900 sm:min-h-12">
                          <span className="whitespace-nowrap text-xs font-bold sm:text-sm">
                            <span className="mr-0.5 font-mono text-xl font-black tabular-nums sm:text-2xl">{String(seatNo).padStart(2, '0')}</span>號
                          </span>
                          <span className="whitespace-nowrap rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-bold sm:text-sm">
                            {publicAbsenceReason(reason) || '未註明'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-sm font-bold">尚無已登記的缺席座號。</p>}
                </div>
              )}
            </section>
          </div> : (
            <section aria-labelledby="today-schedule-heading" className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h2 id="today-schedule-heading" className="flex items-center gap-2 text-xl font-black">
                <CalendarClock size={21} aria-hidden="true" className="text-teal-800" />本班今日考程
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-600">{today} · {classroom.className}</p>
              {todaysPeriods.length ? (
                <ol className="mt-4 space-y-2">
                  {todaysPeriods.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <span className="font-mono text-sm font-bold text-teal-900 sm:text-lg">{item.startTime}–{item.endTime}</span>
                      <span className="min-w-0 flex-1 font-black [overflow-wrap:anywhere] sm:text-lg">{item.subject}</span>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-700">{item.endTime <= taipeiTime ? '已結束' : '未開始'}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-700">今日沒有安排考試。</p>}
            </section>
          )}

          {/* 區塊 B：考場作答規定與注意事項 (手機單欄完整顯示、平板/桌機雙欄緊湊排版) */}
          <section aria-labelledby="blackboard-rules-heading" className={isFullscreen ? 'projection-rules projection-card' : 'bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-3.5 shrink-0 shadow-2xs'}>
            <div className="flex items-center justify-between mb-2">
              <h2 id="blackboard-rules-heading" className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-teal-800 shrink-0" aria-hidden="true" />
                <span>考場作答規定與注意事項</span>
              </h2>
              {!isFullscreen && <span className="text-[11px] font-bold text-slate-600">請考生嚴格遵守</span>}
            </div>

            <div className={isFullscreen ? 'projection-rules-list' : 'grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2'}>
              {rulesList.length === 0 && <p className="text-sm text-slate-600">尚未設定考場守則。</p>}
              {rulesList.map((rule, idx) => (
                <div
                  key={idx}
                  className={isFullscreen ? 'projection-rule' : 'flex items-start sm:items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/70 text-xs font-bold text-slate-700'}
                  title={rule}
                >
                  <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-900 font-mono font-black text-[11px] tabular-nums shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{rule}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
};
