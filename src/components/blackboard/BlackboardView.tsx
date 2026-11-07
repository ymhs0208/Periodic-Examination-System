import { useServerClock } from '../useServerClock';
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ClassroomExamState, ExamAnnouncement, ExamConfig } from '../../types/exam';
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
  const currentTime = useServerClock(1000);
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
  const rulesList = config.rulesNotes;

  return (
    <div
      ref={boardRef}
      className={`${
        isFullscreen && !isEmbedded
          ? 'projection-board fixed inset-0 z-50 h-dvh w-screen overflow-clip rounded-none border-0'
          : isEmbedded
          ? 'projection-board relative w-full rounded-2xl border border-slate-200/90 xl:h-[780px] h-auto shadow-xs overflow-hidden'
          : 'projection-board relative w-full flex-1 min-h-0 lg:h-full rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden'
      } text-slate-900 flex flex-col select-none`}
    >
      <div ref={fullscreenContentRef}
        className={isFullscreen ? 'flex min-h-full w-full shrink-0 origin-top-left flex-col transition-none' : 'contents'}>
      <BlackboardHeader classroom={classroom} config={config} now={currentTime} date={today}
        period={period} nextPeriod={nextPeriod} hasScheduleToday={todaysPeriods.length > 0}
        announcementFocus={focusAnnouncements} isFullscreen={isFullscreen}
        connectionMessage={connectionMessage} onChooseClassroom={onChooseClassroom} onToggleFullscreen={isEmbedded ? undefined : toggleFullscreen} />

      <div
        className={`flex-1 projection-layout min-h-0 ${isFullscreen ? 'overflow-hidden' : 'overflow-auto'}${focusAnnouncements ? ' projection-layout-focus' : !relevantAnnouncements.length ? ' projection-layout-quiet' : ''}`}
      >
        <div className="projection-notices">
          <AnnouncementProjection key={classroom.classId} announcements={relevantAnnouncements} focused={focusAnnouncements} fitToScreen={isFullscreen}
            onToggleFocus={isEmbedded ? undefined : () => setAnnouncementFocus((value) => !value)} />
        </div>

        <div hidden={focusAnnouncements} className="projection-overview">
          {period && <ProjectionAttendance classroom={classroom} absences={absentSeats} />}
          {!period && <ProjectionSchedule periods={todaysPeriods} nextPeriod={nextPeriod} time={taipeiTime} />}

          <section aria-labelledby="blackboard-rules-heading" className="projection-rules projection-card">
            <div className="flex items-center justify-between mb-2">
              <h2 id="blackboard-rules-heading" className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-teal-800 shrink-0" aria-hidden="true" />
                <span>考場作答規定與注意事項</span>
              </h2>
            </div>

            <div className="projection-rules-list">
              {rulesList.length === 0 && <p className="text-sm text-slate-600">尚未設定考場守則。</p>}
              {rulesList.map((rule, idx) => (
                <div key={idx} className="projection-rule" title={rule}>
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
