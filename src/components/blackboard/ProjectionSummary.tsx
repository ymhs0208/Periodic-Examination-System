import { CalendarClock, Clock, ShieldCheck, Users } from 'lucide-react';
import { publicAbsenceReason, type AbsentStudent, type ClassroomExamState, type ExamPeriod } from '../../types/exam';

export function ProjectionAttendance({ classroom, absences }: {
  classroom: ClassroomExamState;
  absences: AbsentStudent[];
}) {
  const reported = classroom.statusReported;
  const hasAbsences = reported && classroom.absentCount > 0;
  const status = !reported ? '等候點名回報' : hasAbsences ? '點名已回報' : '全班到齊';
  const StatusIcon = reported ? ShieldCheck : Clock;

  return (
    <section className="projection-summary projection-card" aria-labelledby="projection-attendance">
      <div className="projection-card-heading">
        <h2 id="projection-attendance"><Users size={21} aria-hidden="true" />本節出席</h2>
        <p className={reported ? 'projection-status projection-status-ready' : 'projection-status projection-status-waiting'}>
          <StatusIcon size={15} aria-hidden="true" />{status}
        </p>
      </div>
      <dl className="projection-counts">
        {[
          { label: '應到', value: classroom.expectedCount, tone: 'expected' },
          { label: '實到', value: reported ? classroom.presentCount : null, tone: 'present' },
          { label: '缺席', value: reported ? classroom.absentCount : null, tone: hasAbsences ? 'absent' : 'expected' }
        ].map(({ label, value, tone }) => (
          <div key={label} className={`projection-count projection-count-${tone}`}>
            <dt>{label}</dt>
            <dd>{value === null ? '—' : <><strong>{value}</strong><span>人</span></>}</dd>
          </div>
        ))}
      </dl>
      <p className="sr-only" role="status" aria-atomic="true">
        {reported ? `實到 ${classroom.presentCount} 人，缺席 ${classroom.absentCount} 人` : '實到與缺席人數尚未回報'}
      </p>
      {hasAbsences ? (
        <div className="projection-absence">
          <h3>缺席座號與假別</h3>
          {absences.length ? (
            <ul aria-label="缺席座號與假別" className="projection-seats">
              {absences.map(({ seatNo, reason }) => (
                <li key={seatNo}>
                  <span><strong>{String(seatNo).padStart(2, '0')}</strong> 號</span>
                  <span>{publicAbsenceReason(reason) || '未註明'}</span>
                </li>
              ))}
            </ul>
          ) : <p>尚無已登記的缺席座號。</p>}
        </div>
      ) : (
        <p className="projection-attendance-note">
          {reported ? '本節無缺席考生。' : '監考老師送出點名後，會在這裡顯示實到與缺席名單。'}
        </p>
      )}
    </section>
  );
}

export function ProjectionSchedule({ periods, nextPeriod, time }: {
  periods: ExamPeriod[];
  nextPeriod?: ExamPeriod;
  time: string;
}) {
  return (
    <section className="projection-summary projection-card" aria-labelledby="projection-schedule">
      <div className="projection-card-heading">
        <h2 id="projection-schedule"><CalendarClock size={21} aria-hidden="true" />本班今日考程</h2>
        {periods.length > 0 && <p className="projection-status projection-status-ready">共 {periods.length} 節</p>}
      </div>
      {periods.length ? (
        <ol className="projection-schedule">
          {periods.map((item) => (
            <li key={item.id} className={item.id === nextPeriod?.id ? 'projection-schedule-next' : undefined}>
              <span>{item.startTime}–{item.endTime}</span>
              <strong>{item.subject}</strong>
              <span className="projection-schedule-state">{item.id === nextPeriod?.id ? '下一節' : item.endTime <= time ? '已結束' : '未開始'}</span>
            </li>
          ))}
        </ol>
      ) : <p className="projection-attendance-note">今日沒有安排考試。</p>}
    </section>
  );
}
