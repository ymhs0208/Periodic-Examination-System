import { useServerClock } from '../useServerClock';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, LayoutGrid,
  Maximize2, Minimize2, UserRound, UsersRound
} from 'lucide-react';
import type { ClassroomExamState, SystemData } from '../../types/exam';
import { classroomGrades, gradeLabel } from '../../types/grades';
import { classroomForPeriod, dataForPeriod, examPeriods, periodApplies, periodLabel, preferredPeriod } from '../../types/examSchedule';
import { ExamPeriodSelect } from '../ExamPeriodSelect';

interface AttendanceBoardViewProps {
  data: SystemData;
  initialMode?: 'school' | 'classroom';
  selectedClassroom: ClassroomExamState;
  onSelectClassroom: (classId: string) => void;
  onChooseClassroom: () => void;
}

const control = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700';
const panel = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6';
const timeFormat = new Intl.DateTimeFormat('zh-TW', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Taipei'
});

const tones = {
  neutral: 'border-slate-200 text-slate-950',
  present: 'border-teal-200 text-teal-800',
  absent: 'border-rose-200 text-rose-800',
  rate: 'border-blue-200 text-blue-800'
};

function Stat({ label, value, unit, tone = 'neutral' }: {
  label: string;
  value: number | string;
  unit?: string;
  tone?: keyof typeof tones;
}) {
  return (
    <div className={`min-w-0 rounded-2xl border bg-white p-3 sm:p-5 ${tones[tone]}`}>
      <dt className="text-sm font-bold text-slate-600">{label}</dt>
      <dd className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-mono text-2xl font-bold leading-none tabular-nums sm:text-4xl">{value}</span>
        {unit && value !== '—' && <span className="text-xs font-bold text-slate-600">{unit}</span>}
      </dd>
    </div>
  );
}

function ReportStatus({ reported }: { reported: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${reported ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-900'}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {reported ? '已回報' : '待回報'}
    </span>
  );
}

export function AttendanceBoardView({ data, selectedClassroom, onSelectClassroom, onChooseClassroom, initialMode = 'classroom' }: AttendanceBoardViewProps) {
  const [mode, setMode] = useState<'school' | 'classroom'>(initialMode);
  const [requestedPeriodId, setRequestedPeriodId] = useState('');
  const [selectedGradeFilter, setGradeFilter] = useState('all');
  const currentTime = useServerClock(1000);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const allPeriods = examPeriods(data.config);
  const periods = mode === 'school' ? allPeriods : allPeriods.filter((period) => periodApplies(period, selectedClassroom) || !!selectedClassroom.periodAttendance?.[period.id]);
  const chosenPeriod = periods.find((period) => period.id === requestedPeriodId);
  const period = chosenPeriod ?? preferredPeriod(periods, currentTime);
  const periodData = dataForPeriod(data, period);
  const classroom = classroomForPeriod(selectedClassroom, period, data.config.periods === undefined && !allPeriods.length);
  const classroomIndex = data.classrooms.findIndex((room) => room.classId === classroom.classId);
  const classroomCount = data.classrooms.length;
  const schoolCount = periodData.classrooms.length;
  const reported = periodData.classrooms.filter((room) => room.statusReported);
  const reportedExpected = reported.reduce((sum, room) => sum + room.expectedCount, 0);
  const schoolPresent = reported.reduce((sum, room) => sum + room.presentCount, 0);
  const grades = classroomGrades(periodData.classrooms);
  const gradeFilter = grades.includes(Number(selectedGradeFilter)) ? selectedGradeFilter : 'all';
  const displayedClassrooms = periodData.classrooms.filter((room) => gradeFilter === 'all' || String(room.grade) === gradeFilter);
  const { config } = periodData;
  const examDetails = [config.examDate, config.subject, [config.startTime, config.endTime].filter(Boolean).join('–')].filter(Boolean);
  const attendanceRate = (present: number, expected: number) => expected > 0 ? `${(present / expected * 100).toFixed(1)}%` : '—';

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === boardRef.current);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreen);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === boardRef.current) {
        await document.exitFullscreen();
      } else {
        await boardRef.current?.requestFullscreen();
      }
      setFullscreenError(false);
    } catch {
      setFullscreenError(true);
    }
  }

  function moveClassroom(direction: number) {
    const next = (classroomIndex + direction + classroomCount) % classroomCount;
    onSelectClassroom(data.classrooms[next].classId);
  }

  return (
    <div ref={boardRef} className={fullscreen ? 'overflow-auto bg-[#f4f6fb] p-3 sm:p-6' : 'w-full'}>
      <div className="mx-auto w-full max-w-[1440px] space-y-4 pb-5 sm:space-y-5">
        <section className="attendance-banner relative isolate overflow-hidden rounded-3xl p-4 text-white sm:p-6 lg:p-8">
          <div className="attendance-banner-pattern pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/3" aria-hidden="true" />
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0 flex-1 basis-52">
              <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-teal-200">
                <LayoutGrid size={16} aria-hidden="true" />考場出席即時看板
              </p>
              <h1 className="mt-2.5 break-words text-3xl font-black tracking-tight sm:text-4xl">
                {mode === 'school' ? '全校考場總覽' : classroom.className}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-200">
                {mode === 'classroom' && <span>{gradeLabel(config, classroom.grade)} · {classroom.classId}</span>}
                {(config.examName || config.schoolName) && <span>{config.examName || config.schoolName}</span>}
                {examDetails.length > 0 && (
                  <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} aria-hidden="true" />{examDetails.join(' · ')}</span>
                )}
              </div>
            </div>
            <time className="flex items-center gap-2 rounded-xl border border-white/20 bg-slate-950/30 px-3 py-2 font-mono text-sm font-bold tabular-nums">
              <Clock3 size={16} className="text-teal-200" aria-hidden="true" />
              {timeFormat.format(currentTime)}
            </time>
          </div>
        </section>

        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
          {mode === 'classroom' && <button type="button" className={control} onClick={async () => {
            if (document.fullscreenElement === boardRef.current) await document.exitFullscreen().catch(() => {});
            setMode('school');
            setFullscreenError(false);
            onChooseClassroom();
          }}>
            <ArrowLeft size={16} aria-hidden="true" />返回全校總覽
          </button>}
          {(['classroom', 'school'] as const).map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={mode === item}
              onClick={async () => {
                if (item === 'school' && document.fullscreenElement === boardRef.current) {
                  await document.exitFullscreen().catch(() => {});
                }
                setFullscreenError(false);
                setMode(item);
              }}
              className={`${control} aria-pressed:border-teal-700 aria-pressed:bg-teal-50 aria-pressed:text-teal-900`}
            >
              {item === 'classroom' ? '單班出席' : '全校總覽'}
            </button>
          ))}
          {mode === 'classroom' && document.fullscreenEnabled && (
            <button type="button" className={`${control} sm:ml-auto`} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
              {fullscreen ? '退出全螢幕' : '全螢幕'}
            </button>
          )}
        </div>
        {fullscreenError && <p role="status" className="text-sm text-slate-600">目前無法切換全螢幕。</p>}
        <div className={panel}>
          <ExamPeriodSelect periods={periods} value={chosenPeriod?.id ?? ''} onChange={setRequestedPeriodId} autoLabel="自動選擇考試節次" />
          <p className="mt-2 text-sm font-bold text-slate-700">{period ? `目前查看 · ${periodLabel(period)}` : '目前沒有已設定的考試節次。'}</p>
        </div>

        {mode === 'classroom' ? (
          <>
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-4" aria-label="本班出席統計">
              <Stat label="應到人數" value={classroom.expectedCount} unit="人" />
              <Stat label="實到人數" value={classroom.statusReported ? classroom.presentCount : '—'} unit="人" tone="present" />
              <Stat label="缺席人數" value={classroom.statusReported ? classroom.absentCount : '—'} unit="人" tone="absent" />
              <Stat label="到考率" value={classroom.statusReported ? attendanceRate(classroom.presentCount, classroom.expectedCount) : '—'} tone="rate" />
            </dl>
            <section className={panel} aria-labelledby="room-summary">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="room-summary" className="text-lg font-black">考場資訊</h2>
                <ReportStatus reported={classroom.statusReported} />
              </div>
              <p className="mt-3 flex items-center gap-2 break-words text-sm font-bold text-slate-700">
                <UserRound size={16} className="shrink-0" aria-hidden="true" />{classroom.invigilator || '待指派監考老師'}
              </p>
              <div className="my-4 flex max-w-sm items-center gap-2">
                <button type="button" className={`${control} px-2 disabled:cursor-default disabled:opacity-50`} aria-label="上一班" disabled={classroomCount < 2} onClick={() => moveClassroom(-1)}><ChevronLeft size={17} aria-hidden="true" /></button>
                <select className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-sm font-bold text-slate-800" aria-label="切換班級" value={classroom.classId} onChange={(event) => onSelectClassroom(event.target.value)}>
                  {data.classrooms.map((room) => <option key={room.classId} value={room.classId}>{room.className}</option>)}
                </select>
                <button type="button" className={`${control} px-2 disabled:cursor-default disabled:opacity-50`} aria-label="下一班" disabled={classroomCount < 2} onClick={() => moveClassroom(1)}><ChevronRight size={17} aria-hidden="true" /></button>
              </div>
              <h3 className="border-t border-slate-200 pt-4 text-sm font-bold">缺席明細</h3>
              {classroom.absentStudents.length > 0 ? (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {classroom.absentStudents.map((student) => (
                    <li key={student.seatNo} className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
                      <span className="font-mono font-bold">{String(student.seatNo).padStart(2, '0')} 號</span>
                      {student.name && <span className="break-all">{student.name}</span>}
                      {student.reason && <span className="break-all text-xs">{student.reason}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-600">{classroom.statusReported ? '目前無缺席紀錄。' : '尚未完成點名。'}</p>
              )}
            </section>
          </>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-4" aria-label="全校出席統計">
              <Stat label="全校應到" value={periodData.classrooms.reduce((sum, room) => sum + room.expectedCount, 0)} unit="人" />
              <Stat label="已回報實到" value={reported.length ? schoolPresent : '—'} unit="人" tone="present" />
              <Stat label="已回報缺席" value={reported.length ? reported.reduce((sum, room) => sum + room.absentCount, 0) : '—'} unit="人" tone="absent" />
              <Stat label="已回報到考率" value={attendanceRate(schoolPresent, reportedExpected)} tone="rate" />
              <Stat label="回報進度" value={`${reported.length}/${schoolCount}`} unit="班" />
            </dl>
            <section className={panel} aria-labelledby="school-heading">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="school-heading" className="flex items-center gap-2 text-lg font-black"><UsersRound size={19} className="text-teal-800" aria-hidden="true" />各班回報狀態</h2>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  年級
                  <select aria-label="年級" className="min-h-11 max-w-full rounded-xl border border-slate-200 bg-white px-3" value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
                    <option value="all">全部</option>
                    {grades.map((grade) => <option key={grade} value={grade}>{gradeLabel(config, grade)}</option>)}
                  </select>
                </label>
              </div>
              {displayedClassrooms.length === 0 && <p className="mt-4 text-sm text-slate-600">此年級目前沒有考場。</p>}
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {displayedClassrooms.map((room) => (
                  <li key={room.classId}>
                    <button type="button" className="flex h-full w-full cursor-pointer flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-teal-600 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" onClick={() => {
                      onSelectClassroom(room.classId);
                      setMode('classroom');
                    }}>
                      <span className="flex w-full flex-wrap items-center justify-between gap-2">
                        <span className="break-words font-bold">{room.className} <span className="font-mono text-xs text-slate-600">{room.classId}</span></span>
                        <ReportStatus reported={room.statusReported} />
                      </span>
                      <span className="flex w-full items-center justify-between gap-2 text-sm text-slate-700">
                        {room.statusReported ? `實到 ${room.presentCount} / 應到 ${room.expectedCount} · 缺席 ${room.absentCount}` : `應到 ${room.expectedCount} 人`}
                        <ArrowUpRight size={17} className="shrink-0 text-teal-800" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
