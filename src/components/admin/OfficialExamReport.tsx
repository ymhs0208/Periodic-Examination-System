import { serverNow } from '../../types/time';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { AbsentStudent, ClassroomExamState, SystemData } from '../../types/exam';
import { classroomGrades, gradeLabel } from '../../types/grades';
import './official-exam-report.css';

interface ReportProps {
  data: SystemData;
  classrooms: ClassroomExamState[];
  detailScope: string;
  audienceLabel: (target: string) => string;
  issueLabel: (category: string) => string;
}

const dateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

const signatures = [
  ['試務組長', '考務清點與歸檔'],
  ['註冊組長', '缺考與補考核對'],
  ['教學組長', '試題與監考複核'],
  ['教務主任', '複核'],
  ['校長', '核閱']
];

export function countAbsentReasons(students: Pick<AbsentStudent, 'reason'>[] = []) {
  let sick = 0;
  let personal = 0;
  let official = 0;
  let bereavement = 0;
  let other = 0;
  for (const student of students) {
    const reason = student.reason?.trim() || '';
    if (reason.includes('病')) sick++;
    else if (reason.includes('事')) personal++;
    else if (reason.includes('公')) official++;
    else if (reason.includes('喪')) bereavement++;
    else other++;
  }
  return { sick, personal, official, bereavement, other };
}

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date);
}

function reportTime(value: string, examDate: string) {
  const formatted = timestamp(value);
  return examDate && formatted.startsWith(`${examDate} `) ? formatted.slice(examDate.length + 1) : formatted;
}

function percent(present: number, expected: number) {
  return expected > 0 ? `${(present / expected * 100).toFixed(2)}%` : '—';
}

function summarize(rooms: ClassroomExamState[]) {
  const reported = rooms.filter((room) => room.statusReported);
  return {
    count: rooms.length,
    reported: reported.length,
    expected: rooms.reduce((sum, room) => sum + room.expectedCount, 0),
    reportedExpected: reported.reduce((sum, room) => sum + room.expectedCount, 0),
    present: reported.reduce((sum, room) => sum + room.presentCount, 0),
    absent: reported.reduce((sum, room) => sum + room.absentCount, 0),
    ...countAbsentReasons(reported.flatMap((room) => room.absentStudents))
  };
}

function ReportSection({ number, title, note, children }: {
  number: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="official-report-section">
      <h3 className="official-report-section-heading">
        <span><span className="official-report-number">{number}</span>{title}</span>
        {note && <small>{note}</small>}
      </h3>
      {children}
    </section>
  );
}

function ReportTable({ label, columns, headers, children, className = '' }: {
  label: string;
  columns: number[];
  headers: string[];
  children: ReactNode;
  className?: string;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapper} className="official-report-table-wrap" tabIndex={overflowing ? 0 : undefined}
      role={overflowing ? 'region' : undefined}
      aria-label={overflowing ? `${label}，可左右捲動` : undefined}>
      <table className={className} aria-label={label}>
        <colgroup>{columns.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
        <thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function OfficialExamReport({ data, classrooms, detailScope, audienceLabel, issueLabel }: ReportProps) {
  const [createdAt, setCreatedAt] = useState(() => serverNow().toISOString());
  useEffect(() => {
    const refreshPrintTime = () => flushSync(() => setCreatedAt(serverNow().toISOString()));
    window.addEventListener('beforeprint', refreshPrintTime);
    return () => window.removeEventListener('beforeprint', refreshPrintTime);
  }, []);

  const { config, announcements, issues } = data;
  const total = summarize(data.classrooms);
  const grades = classroomGrades(data.classrooms);
  const summaries = [
    ...grades.map((grade) => ({
      label: gradeLabel(config, grade),
      total: false,
      stats: summarize(data.classrooms.filter((room) => room.grade === grade))
    })),
    { label: '全校合計', total: true, stats: total }
  ];
  const absentees = classrooms.flatMap((room) =>
    room.statusReported ? room.absentStudents.map((student) => ({ room, student })) : []
  );
  const serial = ['EXAM', config.examDate.replace(/-/g, ''), config.subject].filter(Boolean).join('-');
  const examTime = [config.startTime, config.endTime].filter(Boolean).join(' - ');
  const fields = [
    ['學年度與學期', config.academicYear], ['考試日期', config.examDate],
    ['段考名稱', config.examName], ['考試科目', config.subject],
    ['考試時間', examTime && `${examTime}${config.durationMinutes > 0 ? `（${config.durationMinutes} 分鐘）` : ''}`],
    ['明細列印範圍', detailScope]
  ];
  const keyFigures = [
    ['已回報考場', `${total.reported} / ${total.count} 班`],
    ['全校應到', `${total.expected} 人`],
    ['已回報實到／缺席', total.reported ? `${total.present} / ${total.absent} 人` : '—'],
    ['已回報到考率', percent(total.present, total.reportedExpected)]
  ];

  return (
    <article className="official-report" aria-labelledby="official-report-title">
      <div className="official-report-cover">
        <div className="official-report-kicker"><span>教務處試務中心</span><span>備查聯</span></div>
        {config.schoolName && <p className="official-report-school">{config.schoolName}</p>}
        <h2 id="official-report-title">段考考務出缺席暨試務報表</h2>
        <div className="official-report-reference">
          <span>報表編號 <strong>{serial}</strong></span>
          <span>製表時間 <strong>{timestamp(createdAt)}</strong>（臺北時間）</span>
        </div>
        <dl className="official-report-facts">
          {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '未設定'}</dd></div>)}
        </dl>
        <dl className="official-report-figures">
          {keyFigures.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </div>

      <ReportSection number="01" title="全校與各年級出缺席統計" note="全校資料">
        <ReportTable label="全校與各年級出缺席統計" className="official-report-summary"
          columns={[12, 10, 9, 9, 8, 7, 7, 7, 7, 9, 15]}
          headers={['年級', '已回報／考場', '應到', '實到', '缺席', '病假', '事假', '公假', '喪假', '曠課／其他', '到考率']}>
          {summaries.map(({ label, total: isTotal, stats }) => (
            <tr key={label} className={isTotal ? 'official-report-total' : undefined}>
              <th scope="row">{label}</th><td>{stats.reported} / {stats.count}</td><td>{stats.expected}</td>
              <td>{stats.reported ? stats.present : '—'}</td><td>{stats.reported ? stats.absent : '—'}</td>
              <td>{stats.reported ? stats.sick : '—'}</td><td>{stats.reported ? stats.personal : '—'}</td>
              <td>{stats.reported ? stats.official : '—'}</td><td>{stats.reported ? stats.bereavement : '—'}</td>
              <td>{stats.reported ? stats.other : '—'}</td><td>{percent(stats.present, stats.reportedExpected)}</td>
            </tr>
          ))}
        </ReportTable>
        <p className="official-report-note">實到、缺席、假別及到考率依已回報考場計算。到考率為已回報實到人數除以已回報應到人數。</p>
      </ReportSection>

      <ReportSection number="02" title="各考場點名明細" note={`${classrooms.length} 間考場`}>
        {classrooms.length ? (
          <ReportTable label="各考場點名明細" className="official-report-classrooms" columns={[19, 14, 8, 8, 8, 12, 18, 13]}
            headers={['考場', '監考教師', '應到', '實到', '缺席', '到考率', '點名狀態／時間', '監考簽章']}>
            {classrooms.map((room) => (
              <tr key={room.classId}>
                <th scope="row">{room.classId} <small className="official-report-inline">{room.className}</small></th>
                <td>{room.invigilator || '—'}</td>
                <td>{room.expectedCount}</td><td>{room.statusReported ? room.presentCount : '—'}</td>
                <td>{room.statusReported ? room.absentCount : '—'}</td>
                <td>{room.statusReported ? percent(room.presentCount, room.expectedCount) : '—'}</td>
                <td>{room.statusReported ? '已回報' : '待回報'} {room.statusReported && <small className="official-report-inline">{reportTime(room.lastUpdated, config.examDate)}</small>}</td>
                <td aria-label="監考簽章留白" />
              </tr>
            ))}
          </ReportTable>
        ) : <p className="official-report-empty">此列印範圍沒有考場紀錄。</p>}
      </ReportSection>

      <ReportSection number="03" title="缺席考生核對清冊" note={`${absentees.length} 筆`}>
        {absentees.length ? (
          <ReportTable label="缺席考生核對清冊" columns={[8, 20, 9, 15, 26, 22]}
            headers={['序號', '考場', '座號', '考生姓名', '缺席原因', '假單／補考核對']}>
            {absentees.map(({ room, student }, index) => (
              <tr key={`${room.classId}-${student.seatNo}`}>
                <td>{index + 1}</td><th scope="row">{room.classId} <small className="official-report-inline">{room.className}</small></th>
                <td>{String(student.seatNo).padStart(2, '0')}</td>
                <td>{student.name || '未登錄'}</td><td>{student.reason || '未註明'}</td>
                <td><span className="official-report-box" />核假 <span className="official-report-box" />補考</td>
              </tr>
            ))}
          </ReportTable>
        ) : <p className="official-report-empty">此列印範圍尚無缺席紀錄。</p>}
      </ReportSection>

      <ReportSection number="04" title="試題更正與公告紀錄" note={`全校 · ${announcements.length} 則`}>
        {announcements.length ? (
          <ReportTable label="試題更正與公告紀錄" className="official-report-narrative" columns={[26, 74]} headers={['發布資料', '公告內容']}>
            {announcements.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.type === 'correction' ? '試題更正' : '考務公告'}
                  <small>{timestamp(item.publishedAt)}<br />{audienceLabel(item.targetAudience)}<br />{item.publishedBy || '—'}</small>
                </th>
                <td><strong>{item.title}</strong><p>{item.content}</p></td>
              </tr>
            ))}
          </ReportTable>
        ) : <p className="official-report-empty">尚無公告或試題更正紀錄。</p>}
      </ReportSection>

      <ReportSection number="05" title="考場通報與處置紀錄" note={`全校 · ${issues.length} 件`}>
        {issues.length ? (
          <ReportTable label="考場通報與處置紀錄" className="official-report-narrative" columns={[24, 76]} headers={['通報資料', '考場狀況與教務處置']}>
            {issues.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.classId} {item.className}
                  <small>{timestamp(item.createdAt)}<br />{issueLabel(item.type)}<br />
                    {item.status === 'resolved' ? '已結案' : item.status === 'processing' ? '處理中' : '待處理'}
                  </small>
                </th>
                <td>
                  <p>{item.content}</p>
                  <div className="official-report-reply">
                    <strong>教務處置與回覆</strong>
                    <p>{item.reply || '—'}</p>
                    {item.repliedBy && <small>{item.repliedBy} · {timestamp(item.repliedAt || '')}</small>}
                  </div>
                </td>
              </tr>
            ))}
          </ReportTable>
        ) : <p className="official-report-empty">尚無考場通報紀錄。</p>}
      </ReportSection>

      <div className="official-report-approval">
        <ReportSection number="06" title="教務處簽核">
          <div className="official-report-signatures">
            {signatures.map(([role, note]) => (
              <div key={role}>
                <strong>{role}</strong>
                <small>{note}</small>
                <span>日期：　月　日</span>
              </div>
            ))}
          </div>
          <p className="official-report-note">請核章後併同本節試題留存教務處備查。</p>
        </ReportSection>
      </div>
    </article>
  );
}
