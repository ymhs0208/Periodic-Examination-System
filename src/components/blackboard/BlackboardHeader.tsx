import { useLayoutEffect, useRef } from 'react';
import { ArrowLeft, BookOpen, Clock, Maximize2, Minimize2 } from 'lucide-react';
import type { ClassroomExamState, ExamConfig, ExamPeriod } from '../../types/exam';
import { gradeLabel } from '../../types/grades';

const clockFormat = new Intl.DateTimeFormat('zh-TW', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Taipei'
});

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
    <div className="projection-actions">
      {onChooseClassroom && (
        <button type="button" onClick={onChooseClassroom} className="projection-button">
          <ArrowLeft size={16} aria-hidden="true" />重新選班
        </button>
      )}
      {onToggleFullscreen && (
        <button ref={fullscreenButton} type="button" aria-pressed={isFullscreen} onClick={(event) => {
          restoreFocus.current = document.activeElement === event.currentTarget;
          onToggleFullscreen();
        }} className="projection-button projection-button-primary">
          {isFullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          {isFullscreen ? '退出全螢幕' : '全螢幕投影'}
        </button>
      )}
    </div>
  );
  const connectionStatus = connectionMessage && (
    <p role="status" className="projection-connection">{connectionMessage}</p>
  );

  return (
    <header className={`projection-header${announcementFocus ? ' projection-header-focus' : ''}`}>
      <div className="projection-toolbar">
        <div className="projection-brand">
          <span className="projection-brand-icon"><BookOpen size={17} aria-hidden="true" /></span>
          <strong>教室電子黑板</strong>
          {!announcementFocus && !isFullscreen && schoolDetails && <span className="projection-school">{schoolDetails}</span>}
        </div>
        {controls}
      </div>
      {connectionStatus}
      <div className="projection-masthead">
        <div className="projection-class">
          <p className="projection-kicker">考場</p>
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
          <p className="projection-kicker"><Clock size={15} aria-hidden="true" />台灣時間 {!announcementFocus && <time dateTime={date}>{date}</time>}</p>
          <time dateTime={now.toISOString()} className="projection-clock-time">{hours}:{minutes}<span>:{seconds}</span></time>
        </div>
      </div>
    </header>
  );
}
