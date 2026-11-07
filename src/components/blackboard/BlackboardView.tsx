import { useServerClock } from '../useServerClock';
import React, { useState, useEffect, useRef } from 'react';
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

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === boardRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const relevantAnnouncements = classroomAnnouncements(announcements, classroom, currentTime.getTime());
  const focusAnnouncements = announcementFocus && relevantAnnouncements.length > 0;
  useEffect(() => {
    if (!relevantAnnouncements.length) setAnnouncementFocus(false);
  }, [relevantAnnouncements.length]);

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      if (document.fullscreenElement === boardRef.current) {
        await document.exitFullscreen().catch(() => {});
      } else setIsFullscreen(false);
    } else {
      setIsFullscreen(true);
      await boardRef.current?.requestFullscreen?.().catch(() => {});
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
      className={`projection-board${isFullscreen ? ' projection-board--fullscreen' : ''}`}
    >
      <BlackboardHeader classroom={classroom} config={config} now={currentTime} date={today}
        period={period} nextPeriod={nextPeriod} hasScheduleToday={todaysPeriods.length > 0}
        announcementFocus={focusAnnouncements} isFullscreen={isFullscreen}
        connectionMessage={connectionMessage} onChooseClassroom={onChooseClassroom}
        onToggleFullscreen={isEmbedded ? undefined : () => { void toggleFullscreen(); }} />

      <div className={`projection-layout${focusAnnouncements ? ' projection-layout-focus' : !relevantAnnouncements.length ? ' projection-layout-quiet' : ''}`}>
        <div className="projection-notices">
          <AnnouncementProjection key={classroom.classId} announcements={relevantAnnouncements} focused={focusAnnouncements} fitToScreen={isFullscreen}
            onToggleFocus={isEmbedded ? undefined : () => setAnnouncementFocus((value) => !value)} />
        </div>

        <div hidden={focusAnnouncements} className="projection-overview" tabIndex={isFullscreen ? 0 : undefined} aria-label="出席、考程與考場守則">
          {period && <ProjectionAttendance classroom={classroom} absences={absentSeats} />}
          {!period && <ProjectionSchedule periods={todaysPeriods} nextPeriod={nextPeriod} time={taipeiTime} />}

          <section aria-labelledby="blackboard-rules-heading" className="projection-rules projection-card">
            <div className="projection-card-heading">
              <h2 id="blackboard-rules-heading"><AlertCircle size={20} aria-hidden="true" />考場注意事項</h2>
            </div>

            {rulesList.length ? <ol className="projection-rules-list">
              {rulesList.map((rule, idx) => (
                <li key={idx} className="projection-rule">{rule}</li>
              ))}
            </ol> : <p className="projection-attendance-note">尚未設定考場守則。</p>}
          </section>
        </div>
      </div>
    </div>
  );
};
