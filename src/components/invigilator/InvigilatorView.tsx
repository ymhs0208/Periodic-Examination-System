import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  Send,
  Bell,
  ClipboardCheck,
  Monitor,
  CheckCircle2,
  Check,
  HeartPulse,
  FileQuestion,
  Wrench,
  Siren,
  Settings2,
  ChevronUp,
  LogOut
} from 'lucide-react';
import { examSync } from '../../services/examSync';
import { ABSENCE_REASONS } from '../../types/exam';
import type { ClassroomExamState, ExamIssue, IssueType, ExamAnnouncement, AbsentStudent, ExamConfig, ExamPeriod } from '../../types/exam';
import { activePeriod, classroomForPeriod, examPeriods, periodApplies, periodLabel } from '../../types/examSchedule';
import { ExamPeriodSelect, useExamClock } from '../ExamPeriodSelect';
import { availableGrades, gradeLabel } from '../../types/grades';
import { classroomAnnouncements } from '../../types/announcements';
import { useActionConfirmation } from '../useActionConfirmation';
import { useAnnouncementClock } from '../useAnnouncementClock';
import { invigilatorTitle, type InvigilatorTab } from './InvigilatorNavigation';

interface InvigilatorViewProps {
  classroom: ClassroomExamState;
  config: ExamConfig;
  issues: ExamIssue[];
  announcements: ExamAnnouncement[];
  classList: Pick<ClassroomExamState, 'classId' | 'className' | 'grade'>[];
  onSelectClass: (classId: string) => void;
  canEditClassroom?: boolean;
  onLogout?: () => void;
  initialPeriodId?: string;
  allowedPeriodIds?: string[];
}

export function ScheduledInvigilatorView({ tab, correctionSubmission, ...props }: InvigilatorViewProps & {
  tab: InvigilatorTab;
  correctionSubmission?: React.ReactNode;
}) {
  const [requested, setRequested] = useState(props.initialPeriodId ?? '');
  const attendanceSection = useRef<HTMLElement>(null);
  const requestedFocus = useRef(false);
  const now = useExamClock();
  const periods = examPeriods(props.config).filter((period) => periodApplies(period, props.classroom) &&
    (!props.allowedPeriodIds || props.allowedPeriodIds.includes(period.id)));
  const selected = periods.find((period) => period.id === requested);
  const period = selected ?? activePeriod(periods, now);
  useLayoutEffect(() => {
    if (requestedFocus.current) attendanceSection.current?.querySelector('select')?.focus();
    requestedFocus.current = false;
  }, [requested, tab]);

  function selectPeriod(id: string) {
    if (requested === id) return;
    requestedFocus.current = true;
    setRequested(id);
  }

  return (
      <InvigilatorView key={period?.id ?? 'unselected'} {...props} period={period} tab={tab}
        extraPage={tab === 'corrections' ? correctionSubmission : null}
        periodControls={
          <section ref={attendanceSection} tabIndex={-1} className="min-w-0 rounded-xl bg-white p-3 text-slate-900 sm:p-4" aria-label="點名節次">
            <ExamPeriodSelect periods={periods} value={selected?.id ?? ''} onChange={selectPeriod} autoLabel="自動選擇目前考試" />
            <p className="mt-2 text-sm font-bold text-slate-700">
              {period ? `點名節次 · ${periodLabel(period)}` : periods.length ? '目前不是考試時段，請選擇要回報的節次。' : '此班目前沒有可點名的考程。'}
            </p>
          </section>
        }
        lockPeriod={() => { if (period) setRequested(period.id); }} />
  );
}

const PRESET_ISSUES = [
  {
    id: 'medical',
    type: 'medical' as IssueType,
    title: '學生身體不適',
    subtitle: '嘔吐、肚子痛、頭暈',
    icon: HeartPulse,
    color: 'border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800',
    iconColor: 'text-rose-800',
    text: '有考生身體不適，請協助處理。'
  },
  {
    id: 'paper',
    type: 'paper' as IssueType,
    title: '考卷印不清楚',
    subtitle: '缺頁、字體模糊',
    icon: FileQuestion,
    color: 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800',
    iconColor: 'text-amber-600',
    text: '試卷印刷異常，請協助處理。'
  },
  {
    id: 'facility',
    type: 'facility' as IssueType,
    title: '冷氣/設備故障',
    subtitle: '冷氣不冷、異音、跳電',
    icon: Wrench,
    color: 'border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900',
    iconColor: 'text-teal-700',
    text: '考場設備異常，請協助處理。'
  },
  {
    id: 'urgent',
    type: 'urgent' as IssueType,
    title: '緊急呼叫支援！',
    subtitle: '突發狀況、急需協助',
    icon: Siren,
    color: 'border-red-400 bg-red-100 hover:bg-red-200 text-red-900 ring-2 ring-red-400/30',
    iconColor: 'text-red-600',
    text: '緊急：考場有突發狀況，請巡堂主管或試務組立即前往協助！'
  }
];

const InvigilatorView: React.FC<InvigilatorViewProps & {
  period?: ExamPeriod;
  periodControls: React.ReactNode;
  tab: InvigilatorTab;
  extraPage?: React.ReactNode;
  lockPeriod: () => void;
}> = ({
  classroom,
  config,
  issues,
  announcements,
  classList,
  onSelectClass,
  canEditClassroom = false,
  onLogout,
  period,
  periodControls,
  tab,
  extraPage,
  lockPeriod
}) => {
  const { confirmAction, confirmationDialog } = useActionConfirmation();
  const attendanceRecord = classroomForPeriod(classroom, period);
  const [absentStudents, setAbsentStudents] = useState<AbsentStudent[]>(attendanceRecord.absentStudents);
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);
  const [attendanceSavedMessage, setAttendanceSavedMessage] = useState(false);
  const [attendanceError, setAttendanceError] = useState('');

  // Classroom & Invigilator inline edit state
  const [isEditingClassInfo, setIsEditingClassInfo] = useState(false);
  const [editGrade, setEditGrade] = useState<number>(classroom.grade);
  const [editClassName, setEditClassName] = useState<string>(classroom.className);
  const [editInvigilator, setEditInvigilator] = useState<string>(classroom.invigilator);
  const [editExpectedCount, setEditExpectedCount] = useState(classroom.expectedCount);
  const [classInfoSaved, setClassInfoSaved] = useState(false);
  const [savingClassInfo, setSavingClassInfo] = useState(false);
  const [classInfoError, setClassInfoError] = useState('');

  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [issueType, setIssueType] = useState<IssueType>('general');
  const [issueContent, setIssueContent] = useState<string>('');
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [issueSuccessMessage, setIssueSuccessMessage] = useState(false);
  const [issueError, setIssueError] = useState('');

  useEffect(() => {
    setAbsentStudents(attendanceRecord.absentStudents);
  }, [classroom.classId, attendanceRecord.statusReported, attendanceRecord.lastUpdated]);

  useEffect(() => {
    setEditGrade(classroom.grade);
    setEditClassName(classroom.className);
    setEditInvigilator(classroom.invigilator);
    setEditExpectedCount(classroom.expectedCount);
  }, [classroom.classId, classroom.grade, classroom.className, classroom.invigilator, classroom.expectedCount]);

  const expectedCount = attendanceRecord.expectedCount;
  const presentCount = Math.max(0, expectedCount - absentStudents.length);
  const absentCount = absentStudents.length;
  const classroomIssues = issues.filter((i) => i.classId === classroom.classId);
  const announcementNow = useAnnouncementClock(announcements);
  const currentAnnouncements = classroomAnnouncements(announcements, classroom, announcementNow);

  const handleSaveClassInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingClassInfo) return;
    setSavingClassInfo(true);
    setClassInfoError('');
    try {
      await examSync.updateClassroom(classroom.classId, {
        grade: editGrade,
        className: editClassName.trim() || classroom.className,
        invigilator: editInvigilator.trim() || classroom.invigilator,
        expectedCount: editExpectedCount
      });
      setClassInfoSaved(true);
      setTimeout(() => {
        setClassInfoSaved(false);
        setIsEditingClassInfo(false);
      }, 1000);
    } catch (error) {
      setClassInfoError(error instanceof Error ? error.message : '無法儲存考場設定。');
    } finally {
      setSavingClassInfo(false);
    }
  };

  const handleToggleSeat = (seatNo: number) => {
    lockPeriod();
    setAttendanceSavedMessage(false);
    const existingIndex = absentStudents.findIndex((s) => s.seatNo === seatNo);
    if (existingIndex >= 0) {
      setAbsentStudents(absentStudents.filter((s) => s.seatNo !== seatNo));
    } else {
      const updated = [
        ...absentStudents,
        {
          seatNo,
          name: '',
          reason: ''
        }
      ].sort((a, b) => a.seatNo - b.seatNo);
      setAbsentStudents(updated);
    }
  };

  const handleMarkAllPresent = () => {
    lockPeriod();
    setAttendanceSavedMessage(false);
    setAbsentStudents([]);
  };

  const handleSaveAttendance = async () => {
    if (isSubmittingAttendance || !period) return;
    lockPeriod();
    const attendance = { classId: classroom.classId, periodId: period.id, expectedPeriod: period, expectedCount, presentCount, absentCount, absentStudents };
    if (!await confirmAction({
      title: '確認送出點名',
      description: '請核對人數、缺席座號及假別。',
      facts: [
        { label: '考場', value: classroom.className },
        { label: '考試節次', value: periodLabel(period) },
        { label: '出席統計', value: `應到 ${expectedCount} 人、實到 ${presentCount} 人、缺席 ${absentCount} 人` },
        ...(absentCount ? [{
          label: '缺席明細',
          value: absentStudents.map(({ seatNo, reason }) => `座號 ${seatNo}　${reason || '未註明'}`).join('\n')
        }] : [])
      ],
      confirmLabel: '確認送出'
    })) return;

    setAttendanceError('');
    setAttendanceSavedMessage(false);
    setIsSubmittingAttendance(true);
    try {
      await examSync.updateAttendance(attendance);
      setAttendanceSavedMessage(true);
      setTimeout(() => setAttendanceSavedMessage(false), 4000);
    } catch (error) {
      setAttendanceError(error instanceof Error ? error.message : '點名送出失敗，請稍後再試。');
    } finally {
      setIsSubmittingAttendance(false);
    }
  };

  const handlePickPreset = (preset: typeof PRESET_ISSUES[0]) => {
    setSelectedPresetId(preset.id);
    setIssueType(preset.type);
    setIssueContent(preset.text);
  };

  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueContent.trim() || isSubmittingIssue) return;
    const issue = {
      classId: classroom.classId,
      className: classroom.className,
      type: issueType,
      content: issueContent.trim(),
      isUrgent: issueType === 'urgent'
    };
    if (!await confirmAction({
      title: '確認送出通報',
      description: '確認後，教務處將收到這則通報。',
      facts: [
        { label: '考場', value: issue.className },
        { label: '類別', value: PRESET_ISSUES.find(({ type }) => type === issue.type)?.title ?? '一般通報' },
        { label: '通報內容', value: issue.content }
      ],
      confirmLabel: '確認通報',
      danger: issue.isUrgent
    })) return;

    setIssueError('');
    setIssueSuccessMessage(false);
    setIsSubmittingIssue(true);
    try {
      await examSync.reportIssue(issue);
      setIssueSuccessMessage(true);
      setTimeout(() => setIssueSuccessMessage(false), 4000);
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : '通報送出失敗，請稍後再試。');
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  const absenceBySeat = new Map(absentStudents.map((student) => [student.seatNo, student]));
  const changed = absentStudents.length !== attendanceRecord.absentStudents.length ||
    attendanceRecord.absentStudents.some((student) => absenceBySeat.get(student.seatNo)?.reason !== student.reason);
  const reportStatus = changed ? '有未送出的變更' :
    attendanceRecord.statusReported || attendanceSavedMessage ? '本節已回報' : '本節尚未回報';
  const field = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-950';
  const primary = 'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-black text-white hover:bg-teal-900 disabled:cursor-default disabled:opacity-50';
  const announcementLabels = { correction: '試題更正', emergency: '緊急公告', extension: '考試延長', notice: '考務公告' };

  return (
    <div className="min-w-0 space-y-4">
      {confirmationDialog}
      <p role="status" className="sr-only">
        {currentAnnouncements[0] ? `最新考務公告：${currentAnnouncements[0].title}` : ''}
      </p>

      <header className="attendance-banner relative isolate overflow-hidden rounded-2xl border border-slate-800 p-4 text-white sm:p-6">
        <div className="attendance-banner-pattern pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <div className={`grid min-w-0 gap-4 md:items-center ${tab === 'attendance' ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : ''}`}>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-teal-100"><ClipboardCheck size={16} aria-hidden="true" />教師工作台</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-4xl">{tab === 'attendance' ? '監考點名' : invigilatorTitle(tab)}</h1>
            <p className="mt-2 text-base font-black [overflow-wrap:anywhere] sm:text-lg">{classroom.className}（{classroom.classId}）</p>
            <p className="mt-0.5 text-sm text-slate-100 [overflow-wrap:anywhere]">{gradeLabel(config, classroom.grade)}{period && attendanceRecord.invigilator ? ` · ${attendanceRecord.invigilator}` : ''}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(canEditClassroom || classList.length > 1) && (
                  <select value={classroom.classId} aria-label="切換監考班級" onChange={(event) => onSelectClass(event.target.value)}
                    className="min-h-10 min-w-0 max-w-full rounded-lg border border-white/25 bg-slate-900 px-2 text-xs font-bold text-white">
                    {classList.map((room) => <option key={room.classId} value={room.classId}>{room.className}</option>)}
                  </select>
              )}
              {canEditClassroom && (
                  <button type="button" onClick={() => setIsEditingClassInfo((open) => !open)} aria-expanded={isEditingClassInfo}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-teal-200 px-2.5 text-xs font-bold text-slate-950 hover:bg-teal-100">
                    {isEditingClassInfo ? <ChevronUp size={15} aria-hidden="true" /> : <Settings2 size={15} aria-hidden="true" />}
                    {isEditingClassInfo ? '收起設定' : '考場設定'}
                  </button>
              )}
              {onLogout && (
                <button type="button" onClick={onLogout} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 text-xs font-bold text-white hover:bg-white/20">
                  <LogOut size={15} aria-hidden="true" />登出
                </button>
              )}
            </div>
          </div>
          {tab === 'attendance' && periodControls}
        </div>
      </header>

      {canEditClassroom && isEditingClassInfo && (
        <form onSubmit={handleSaveClassInfo} className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50 p-4">
          <h2 className="text-base font-black text-teal-950">考場設定</h2>
          <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <label className="min-w-0 text-sm font-bold text-slate-800">年級
              <select value={editGrade} onChange={(event) => setEditGrade(Number(event.target.value))} className={field}>
                {availableGrades(config, classList).map((grade) => <option key={grade} value={grade}>{gradeLabel(config, grade)}</option>)}
              </select>
            </label>
            <label className="min-w-0 text-sm font-bold text-slate-800">班級名稱
              <input value={editClassName} onChange={(event) => setEditClassName(event.target.value)} className={field} />
            </label>
            <label className="min-w-0 text-sm font-bold text-slate-800">監考老師
              <input value={editInvigilator} onChange={(event) => setEditInvigilator(event.target.value)} className={field} />
            </label>
            <label className="min-w-0 text-sm font-bold text-slate-800">應到人數
              <input type="number" min={1} max={60} value={editExpectedCount}
                onChange={(event) => setEditExpectedCount(Math.max(1, Number(event.target.value) || 30))} className={field} />
            </label>
            <button type="submit" disabled={savingClassInfo || classInfoSaved} className={primary}>{savingClassInfo ? '儲存中…' : '儲存設定'}</button>
          </div>
          {classInfoError && <p role="alert" className="text-sm font-bold text-rose-800">{classInfoError}</p>}
          {classInfoSaved && <p role="status" className="text-sm font-bold text-teal-900">考場設定已儲存。</p>}
        </form>
      )}

      {tab === 'attendance' && (
        <section id="invigilator-attendance" tabIndex={-1} aria-labelledby="invigilator-attendance-title" className="min-w-0 scroll-mt-4 rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 p-4 sm:px-5">
            <div>
              <h2 id="invigilator-attendance-title" className="flex items-center gap-2 text-lg font-black text-slate-950">
                <ClipboardCheck size={20} className="text-teal-800" aria-hidden="true" />座號點名
              </h2>
              <p className="mt-1 text-sm text-slate-700">點選缺席座號，再登記假別並核對送出。</p>
            </div>
            {period && <p className={`rounded-full px-2.5 py-1 text-xs font-bold ${reportStatus === '本節已回報' ? 'bg-teal-100 text-teal-950' : 'bg-amber-100 text-amber-950'}`}>{reportStatus}</p>}
          </div>

          {period ? (
            <>
              <div className="space-y-4 p-4 sm:p-5">
                <dl className="grid grid-cols-3 gap-2" aria-label="本節出席統計">
                  {[
                    { label: '應到人數', value: expectedCount, tone: 'border-slate-200 bg-slate-50 text-slate-950' },
                    { label: '實到人數', value: presentCount, tone: 'border-teal-200 bg-teal-50 text-teal-950' },
                    { label: '缺席人數', value: absentCount, tone: 'border-rose-200 bg-rose-50 text-rose-950' }
                  ].map(({ label, value, tone }) => (
                    <div key={label} className={`min-w-0 rounded-xl border px-2 py-2.5 sm:px-3.5 ${tone}`}>
                      <dt className="text-xs font-bold sm:text-sm">{label}</dt>
                      <dd className="mt-0.5 flex flex-wrap items-baseline gap-1">
                        <span className="font-mono text-xl font-black tabular-nums sm:text-3xl">{value}</span>
                        <span className="text-xs font-bold">人</span>
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                      <Monitor size={17} className="text-teal-800" aria-hidden="true" />座位分布
                    </h3>
                    <button type="button" disabled={!absentCount || isSubmittingAttendance} onClick={handleMarkAllPresent}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-xs font-bold text-teal-900 hover:bg-teal-100 disabled:opacity-50">
                      <Check size={16} aria-hidden="true" />標記全班到齊
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 sm:gap-2">
                    {Array.from({ length: classroom.totalSeats }, (_, index) => {
                      const seat = index + 1;
                      const isAbsent = absenceBySeat.has(seat);
                      return (
                        <button key={seat} type="button" onClick={() => handleToggleSeat(seat)} aria-pressed={isAbsent} disabled={isSubmittingAttendance}
                          className={`flex min-h-12 flex-col items-center justify-center rounded-lg border px-0.5 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60 ${isAbsent ? 'border-rose-400 bg-rose-100 text-rose-950 hover:bg-rose-200' : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-teal-300 hover:bg-teal-50'}`}>
                          <span className="font-mono text-base font-black leading-none tabular-nums sm:text-lg"><span className="sr-only">座號 </span>{String(seat).padStart(2, '0')}</span>
                          <span className="mt-1 text-[10px] leading-none">{isAbsent ? '缺席' : '未標記'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={`rounded-xl border p-3 ${absentCount ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                  <h3 className="text-sm font-black text-slate-950">缺席座號與假別 <span className="font-mono text-xs text-slate-700">（{absentCount} 人）</span></h3>
                  {absentCount ? (
                    <ul className="mt-2 grid gap-2 xl:grid-cols-2">
                      {absentStudents.map((student) => (
                        <li key={student.seatNo} className="flex min-w-0 items-center gap-2 rounded-lg border border-rose-200 bg-white px-2 py-1.5">
                          <span className="shrink-0 text-xs font-black text-rose-900">座號 {student.seatNo}</span>
                          <select aria-label={`座號 ${student.seatNo} 的假別`} value={student.reason} disabled={isSubmittingAttendance}
                            onChange={(event) => {
                              lockPeriod();
                              setAttendanceSavedMessage(false);
                              const reason = event.target.value;
                              setAbsentStudents((students) => students.map((item) => item.seatNo === student.seatNo ? { ...item, reason } : item));
                            }}
                            className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-1.5 text-sm text-slate-900">
                            <option value="">未選擇假別</option>
                            {student.reason && !ABSENCE_REASONS.includes(student.reason) && <option value={student.reason}>{student.reason}</option>}
                            {ABSENCE_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                          </select>
                          <button type="button" disabled={isSubmittingAttendance} onClick={() => handleToggleSeat(student.seatNo)}
                            aria-label={`取消座號 ${student.seatNo} 缺席`} className="min-h-10 shrink-0 rounded-lg px-2 text-xs font-bold text-rose-900 hover:bg-rose-100">
                            取消
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-sm text-slate-700">目前沒有標記缺席的座號。</p>}
                </div>
              </div>

              <div className="space-y-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 p-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-700">送出前會再核對節次、人數與假別。</p>
                  <button type="button" disabled={isSubmittingAttendance} onClick={handleSaveAttendance} className={`${primary} w-full sm:w-auto`}>
                    <CheckCircle2 size={19} aria-hidden="true" />{isSubmittingAttendance ? '正在送出點名…' : '送出點名'}
                  </button>
                </div>
                {attendanceError && <p role="alert" className="rounded-lg bg-rose-100 p-2 text-sm font-bold text-rose-950">{attendanceError}</p>}
                {attendanceSavedMessage && <p role="status" className="rounded-lg bg-teal-100 p-2 text-sm font-bold text-teal-950">點名已送出，電子黑板與教務端已同步。</p>}
              </div>
            </>
          ) : <p className="p-4 text-sm text-slate-700">選擇考試節次後即可點名。</p>}
        </section>
      )}
      {tab === 'announcements' && (
          <section id="invigilator-notices" tabIndex={-1} aria-labelledby="invigilator-notices-title"
            className={`min-w-0 scroll-mt-4 rounded-2xl border p-4 sm:p-5 ${currentAnnouncements.length ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
            <h2 id="invigilator-notices-title" className="flex items-center gap-2 text-lg font-black text-slate-950">
              <Bell size={19} className="text-amber-800" aria-hidden="true" />考務公告
            </h2>
            {currentAnnouncements.length ? (
              <ul className="mt-3 space-y-2">
                {currentAnnouncements.map((item) => (
                  <li key={item.id} className="rounded-xl border border-amber-200 bg-white p-3">
                    <p className="text-xs font-bold text-amber-950">{announcementLabels[item.type]}{item.subject ? ` · ${item.subject}` : ''}</p>
                    <h3 className="mt-1 text-sm font-black text-slate-950 [overflow-wrap:anywhere]">{item.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800 [overflow-wrap:anywhere]">{item.content}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-sm text-slate-700">目前沒有考務公告。</p>}
          </section>
      )}
      {tab === 'issues' && (
          <section id="invigilator-issue-panel" tabIndex={-1} aria-labelledby="invigilator-issue-title" className="min-w-0 scroll-mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div>
              <h2 id="invigilator-issue-title" className="flex items-center gap-2 text-lg font-black text-slate-950"><Send size={19} className="text-teal-800" aria-hidden="true" />考場通報</h2>
              <p className="mt-1 text-sm text-slate-700">選擇常用情況或直接填寫通報內容。</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_ISSUES.map((preset) => {
                const Icon = preset.icon;
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button key={preset.id} type="button" onClick={() => handlePickPreset(preset)} aria-pressed={isSelected} disabled={isSubmittingIssue}
                    className={`min-h-16 min-w-0 rounded-lg border p-2 text-left focus-visible:outline-2 focus-visible:outline-teal-700 ${preset.color} ${isSelected ? 'ring-2 ring-teal-800 ring-inset' : ''}`}>
                    <span className="flex items-start gap-1.5 text-xs font-black sm:text-sm">
                      <Icon size={16} className={`shrink-0 ${preset.iconColor}`} aria-hidden="true" />{preset.title}
                    </span>
                    <span className="mt-1 block text-[11px] font-bold">{preset.subtitle}</span>
                  </button>
                );
              })}
            </div>
            <form onSubmit={handleSubmitIssue} className="space-y-2">
              <label htmlFor="invigilator-issue" className="block text-sm font-bold text-slate-800">通報內容</label>
              <textarea id="invigilator-issue" rows={3} value={issueContent} disabled={isSubmittingIssue}
                onChange={(event) => setIssueContent(event.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-950"
                placeholder="描述考場狀況與需要的協助" />
              <button type="submit" disabled={isSubmittingIssue || !issueContent.trim()} className={`${primary} w-full`}>
                <Send size={17} aria-hidden="true" />{isSubmittingIssue ? '正在送出通報…' : '送出通報'}
              </button>
              {issueError && <p role="alert" className="rounded-lg bg-rose-100 p-2 text-sm font-bold text-rose-950">{issueError}</p>}
              {issueSuccessMessage && <p role="status" className="rounded-lg bg-teal-100 p-2 text-sm font-bold text-teal-950">通報已送出，可在下方查看處理進度。</p>}
            </form>

            <div className="border-t border-slate-200 pt-3">
              <h3 className="text-sm font-black text-slate-950">教務回覆與處理進度（{classroomIssues.length}）</h3>
              {classroomIssues.length ? (
                <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto">
                  {classroomIssues.map((issue) => (
                    <li key={issue.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-xs font-bold text-teal-950">
                        {issue.status === 'resolved' ? '已處理完成' : issue.status === 'processing' ? '處理中' : '待教務處理'}
                      </span>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-950 [overflow-wrap:anywhere]">{issue.content}</p>
                      {issue.reply && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-teal-50 p-2 text-sm text-teal-950 [overflow-wrap:anywhere]">教務處回覆 · {issue.reply}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-sm text-slate-700">目前沒有考場通報。</p>}
            </div>
          </section>
      )}
      {(tab === 'assignments' || tab === 'corrections') && (extraPage ?? (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {tab === 'corrections' ? '此帳號尚未取得試題更正送審權限。' : '此帳號沒有個人的監考安排。'}
        </p>
      ))}
    </div>
  );
};
