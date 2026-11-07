import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  Send,
  Inbox,
  Bell,
  Monitor,
  CheckCircle2,
  Check,
  HeartPulse,
  FileQuestion,
  Wrench,
  Siren,
  DoorOpen,
  Users,
  Clock,
  UserRound,
  ChevronDown
} from 'lucide-react';
import { WorkbenchHeader } from './WorkbenchHeader';
import { examSync } from '../../services/examSync';
import { ABSENCE_REASONS } from '../../types/exam';
import type { ClassroomExamState, ExamIssue, IssueType, ExamAnnouncement, AbsentStudent, ExamConfig, ExamPeriod } from '../../types/exam';
import { activePeriod, classroomForPeriod, examPeriods, periodApplies, periodLabel } from '../../types/examSchedule';
import { ExamPeriodSelect, useExamClock } from '../ExamPeriodSelect';
import { gradeLabel } from '../../types/grades';
import { useActionConfirmation } from '../useActionConfirmation';
import { type InvigilatorTab } from './InvigilatorNavigation';

interface InvigilatorViewProps {
  classroom: ClassroomExamState;
  config: ExamConfig;
  issues: ExamIssue[];
  announcements: ExamAnnouncement[];
  classList: Pick<ClassroomExamState, 'classId' | 'className' | 'grade'>[];
  onSelectClass: (classId: string) => void;
  initialPeriodId?: string;
  allowedPeriodIds?: string[];
}

type ClassroomTab = Extract<InvigilatorTab, 'attendance' | 'announcements' | 'issues'>;

export function ScheduledInvigilatorView({ tab, ...props }: InvigilatorViewProps & {
  tab: ClassroomTab;
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
        periodControls={
          <section ref={attendanceSection} tabIndex={-1} className="min-w-0 text-slate-900" aria-label="點名節次">
            <ExamPeriodSelect periods={periods} value={selected?.id ?? ''} onChange={selectPeriod} autoLabel="自動選擇目前考試" />
            <p className="mt-2 text-sm font-bold text-slate-700">
              {period ? `點名節次 · ${periodLabel(period)}` : periods.length ? '目前不是考試時段，請選擇要回報的節次。' : examPeriods(props.config).length ? '本帳號沒有此班適用的點名節次，請聯絡教務確認監考指派。' : '尚未建立考程，請聯絡教務建立後再點名。'}
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
    title: '緊急支援',
    subtitle: '突發狀況、急需協助',
    icon: Siren,
    color: 'border-red-400 bg-red-100 hover:bg-red-200 text-red-900 ring-2 ring-red-400/30',
    iconColor: 'text-red-600',
    text: '緊急：考場有突發狀況，請巡堂主管或試務組立即前往協助！'
  }
];


function parseAbsentSeatNumbers(raw: string) {
  const tokens = raw.trim().split(/[\s,，、;；]+/).filter(Boolean);
  if (!tokens.length) return { error: '請輸入缺席座號，例如 3、7、15。' };
  const seats: number[] = [];
  const seen = new Set<number>();
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) return { error: `「${token}」不是有效座號。請輸入數字，並用頓號、逗號或空白分隔。` };
    const seatNo = Number(token);
    if (seatNo < 1) return { error: '座號須從 1 開始。' };
    if (!seen.has(seatNo)) {
      seen.add(seatNo);
      seats.push(seatNo);
    }
  }
  return { seats };
}

const InvigilatorView: React.FC<InvigilatorViewProps & {
  period?: ExamPeriod;
  periodControls: React.ReactNode;
  tab: ClassroomTab;
  lockPeriod: () => void;
}> = ({
  classroom,
  config,
  issues,
  announcements,
  classList,
  onSelectClass,
  period,
  periodControls,
  tab,
  lockPeriod
}) => {
  const { confirmAction, confirmationDialog } = useActionConfirmation();
  const attendanceRecord = classroomForPeriod(classroom, period);
  const draftKey = `exam-attendance-draft:${classroom.classId}:${period?.id ?? 'none'}`;
  const initialDraft = useRef<{ absentStudents: AbsentStudent[]; version: string | null } | null>(null);
  const draftLoaded = useRef(false);
  if (!draftLoaded.current) {
    draftLoaded.current = true;
    try { initialDraft.current = JSON.parse(sessionStorage.getItem(draftKey) || 'null'); } catch { /* storage unavailable */ }
  }
  const [absentStudents, setAbsentStudents] = useState<AbsentStudent[]>(initialDraft.current?.absentStudents ?? attendanceRecord.absentStudents);
  const baseVersion = useRef<string | null>(initialDraft.current ? initialDraft.current.version : attendanceRecord.statusReported ? attendanceRecord.lastUpdated : null);
  const baseStudents = useRef(attendanceRecord.absentStudents);
  const [remoteConflict, setRemoteConflict] = useState(false);
  const dirty = useRef(!!initialDraft.current);
  const [draftWarning, setDraftWarning] = useState('');
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);
  const [attendanceSaved, setAttendanceSaved] = useState(false);
  const [absentSeatInput, setAbsentSeatInput] = useState('');
  const [absentReasonInput, setAbsentReasonInput] = useState('');
  const [seatError, setSeatError] = useState('');
  const [attendanceError, setAttendanceError] = useState('');

  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [issueType, setIssueType] = useState<IssueType>('general');
  const [issueContent, setIssueContent] = useState<string>('');
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [issueSent, setIssueSent] = useState(false);
  const [issueError, setIssueError] = useState('');

  useEffect(() => {
    const version = attendanceRecord.statusReported ? attendanceRecord.lastUpdated : null;
    if (version === baseVersion.current) return;
    if (dirty.current) { setRemoteConflict(true); return; }
    baseVersion.current = version;
    baseStudents.current = attendanceRecord.absentStudents;
    setAbsentStudents(attendanceRecord.absentStudents);
    setAttendanceSaved(false);
  }, [classroom.classId, attendanceRecord.statusReported, attendanceRecord.lastUpdated]);

  useEffect(() => {
    const changed = JSON.stringify(absentStudents) !== JSON.stringify(baseStudents.current) || !!initialDraft.current;
    dirty.current = changed;
    try {
      if (changed) sessionStorage.setItem(draftKey, JSON.stringify({ absentStudents, version: baseVersion.current }));
      else sessionStorage.removeItem(draftKey);
    } catch { if (changed) setDraftWarning('瀏覽器無法保留草稿，離開本頁前請先送出點名。'); }
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [absentStudents, draftKey]);

  const reloadAttendance = () => {
    if (!window.confirm('捨棄本機草稿，重新載入伺服器最新點名？')) return;
    initialDraft.current = null; dirty.current = false;
    baseVersion.current = attendanceRecord.statusReported ? attendanceRecord.lastUpdated : null;
    baseStudents.current = attendanceRecord.absentStudents;
    setAbsentStudents(attendanceRecord.absentStudents); setRemoteConflict(false);
    setAttendanceError('');
    setAttendanceSaved(false);
    try { sessionStorage.removeItem(draftKey); } catch { /* no storage */ }
  };

  const expectedCount = attendanceRecord.expectedCount;
  const presentCount = Math.max(0, expectedCount - absentStudents.length);
  const absentCount = absentStudents.length;
  const classroomIssues = issues.filter((i) => i.classId === classroom.classId);

  const markSeatsAbsent = (seatNos: number[]) => {
    if (!absentReasonInput) {
      setSeatError('請先選擇假別，再標記缺席座號。');
      return false;
    }
    const newSeats = [...new Set(seatNos)].filter((seatNo) => !absentStudents.some((student) => student.seatNo === seatNo));
    if (!newSeats.length) return true;
    if (absentStudents.length + newSeats.length > attendanceRecord.expectedCount) {
      setSeatError('缺席人數不可超過應到人數。');
      return false;
    }
    lockPeriod();
    setAttendanceSaved(false);
    setAttendanceError('');
    setSeatError('');
    setAbsentStudents([
      ...absentStudents,
      ...newSeats.map((seatNo) => ({ seatNo, name: '', reason: absentReasonInput }))
    ].sort((a, b) => a.seatNo - b.seatNo));
    return true;
  };

  const handleToggleSeat = (seatNo: number) => {
    const existingIndex = absentStudents.findIndex((s) => s.seatNo === seatNo);
    if (existingIndex >= 0) {
      lockPeriod();
      setAttendanceSaved(false);
      setAttendanceError('');
      setSeatError('');
      setAbsentStudents(absentStudents.filter((s) => s.seatNo !== seatNo));
      return;
    }
    markSeatsAbsent([seatNo]);
  };

  const handleAddAbsentSeats = (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmittingAttendance) return;
    if (!absentReasonInput) {
      setSeatError('請先選擇假別，再輸入缺席座號。');
      return;
    }
    const parsed = parseAbsentSeatNumbers(absentSeatInput);
    if (parsed.error || !parsed.seats) {
      setSeatError(parsed.error ?? '請輸入缺席座號。');
      return;
    }
    const invalid = parsed.seats.filter((seatNo) => seatNo > classroom.totalSeats);
    if (invalid.length) {
      setSeatError(`找不到座號 ${invalid.join('、')}，請輸入 1 到 ${classroom.totalSeats} 的座號。`);
      return;
    }
    const newSeats = parsed.seats.filter((seatNo) => !absentStudents.some((student) => student.seatNo === seatNo));
    if (!newSeats.length) {
      setSeatError('這些座號都已列為缺席。');
      return;
    }
    if (markSeatsAbsent(newSeats)) setAbsentSeatInput('');
  };

  const handleMarkAllPresent = () => {
    lockPeriod();
    setAttendanceSaved(false);
    setSeatError('');
    setAttendanceError('');
    setAbsentStudents([]);
  };

  const handleSaveAttendance = async () => {
    if (isSubmittingAttendance || !period) return;
    if (remoteConflict) { setAttendanceError('已有較新的點名，請先核對並重新載入。'); return; }
    if (absentCount > expectedCount) { setAttendanceError(`缺席 ${absentCount} 人超過應到 ${expectedCount} 人，請取消多選的座號。`); return; }
    lockPeriod();
    const attendance = { classId: classroom.classId, periodId: period.id, expectedPeriod: period, expectedLastUpdated: baseVersion.current, expectedCount, presentCount, absentCount, absentStudents };
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
    setAttendanceSaved(false);
    setIsSubmittingAttendance(true);
    try {
      const saved = await examSync.updateAttendance(attendance);
      baseVersion.current = saved.lastUpdated;
      baseStudents.current = saved.absentStudents;
      initialDraft.current = null; dirty.current = false;
      setAbsentStudents(saved.absentStudents); setRemoteConflict(false);
      try { sessionStorage.removeItem(draftKey); } catch { /* no storage */ }
      setAttendanceSaved(true);
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
    setIssueSent(false);
    setIssueError('');
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
    setIssueSent(false);
    setIsSubmittingIssue(true);
    try {
      await examSync.reportIssue(issue);
      setSelectedPresetId('');
      setIssueType('general');
      setIssueContent('');
      setIssueSent(true);
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : '通報送出失敗，請稍後再試。');
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  const absenceBySeat = new Map(absentStudents.map((student) => [student.seatNo, student]));
  const changed = absentStudents.length !== attendanceRecord.absentStudents.length ||
    attendanceRecord.absentStudents.some((student) => absenceBySeat.get(student.seatNo)?.reason !== student.reason);
  const reported = attendanceSaved || attendanceRecord.statusReported;
  const reportStatus = remoteConflict ? '有較新紀錄' : attendanceError ? '請檢查錯誤' :
    attendanceSaved ? '已回報' : changed ? '尚未送出變更' : reported ? '已回報' : '尚未回報';
  const reportTone = remoteConflict || attendanceError ? 'error' : reportStatus === '已回報' ? 'success' : 'warning';
  const primary = 'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-black text-white hover:bg-teal-900 disabled:cursor-default disabled:opacity-50';
  const announcementLabels = { correction: '試題更正', emergency: '緊急公告', extension: '考試延長', notice: '考務公告' };

  return (
    <div className="min-w-0 space-y-4">
      {confirmationDialog}
      <p role="status" className="sr-only">
        {announcements[0] ? `最新考務公告：${announcements[0].title}` : ''}
      </p>

      <WorkbenchHeader tab={tab}
        info={[
          { label: '監考考場', value: `${classroom.className}（${classroom.classId}）`, icon: DoorOpen },
          { label: '年級', value: gradeLabel(config, classroom.grade), icon: Users },
          ...(tab === 'issues' ? [
            { label: '所選節次', value: period ? periodLabel(period) : '尚未選定', icon: Clock },
            { label: '監考教師', value: (period && attendanceRecord.invigilator) || '—', icon: UserRound }
          ] : [])
        ]}
        actions={classList.length > 1 ? (
            <label className="block min-w-0 text-sm font-bold text-slate-700">切換考場
              <select value={classroom.classId} onChange={(event) => onSelectClass(event.target.value)}
                className="mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900">
                {classList.map((room) => <option key={room.classId} value={room.classId}>{room.className}</option>)}
              </select>
            </label>
          ) : undefined} />

      {tab === 'attendance' && (
        <div className="space-y-4">
          <section className="wb-panel space-y-3" aria-labelledby="invigilator-attendance-title">
            <h2 id="invigilator-attendance-title" className="wb-section-title flex items-center gap-2"><span className="wb-step" aria-hidden="true">1</span>確認考試節次</h2>
            {periodControls}
            {draftWarning && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">{draftWarning}</p>}
            {(remoteConflict || initialDraft.current) && <div className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-950">
              <p role="alert">{remoteConflict ? '送出前請先載入最新點名。' : '已恢復這個考場與節次的點名草稿。'}</p>
              <button type="button" onClick={reloadAttendance} className="inline-flex min-h-11 flex-wrap items-center gap-2 underline">
                捨棄草稿並載入最新點名
                {remoteConflict && <span className="wb-button-status" data-tone="warning">有較新紀錄</span>}
              </button>
            </div>}
          </section>

          {period && (
            <div className="wb-split">
              <section className="wb-panel space-y-4" aria-labelledby="wb-mark-absent">
                <h2 id="wb-mark-absent" className="wb-section-title flex items-center gap-2"><span className="wb-step" aria-hidden="true">2</span>標記缺席</h2>
                <form onSubmit={handleAddAbsentSeats} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-black text-slate-950">輸入缺席座號</h3>
                    <button type="button" disabled={!absentCount || isSubmittingAttendance} onClick={handleMarkAllPresent}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-teal-200 bg-white px-2.5 text-sm font-bold text-teal-900 hover:bg-teal-50 disabled:opacity-50">
                      <Check size={16} aria-hidden="true" />標記全班到齊
                    </button>
                  </div>
                  <div className="grid min-w-0 gap-3 min-[520px]:grid-cols-2">
                    <label className="min-w-0 text-sm font-bold text-slate-700">假別
                      <select id="absent-reason-input" required value={absentReasonInput} disabled={isSubmittingAttendance}
                        onChange={(event) => setAbsentReasonInput(event.target.value)}
                        className="mt-1 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-950">
                        <option value="">請選擇假別</option>
                        {ABSENCE_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                      </select>
                    </label>
                    <label className="min-w-0 text-sm font-bold text-slate-700" htmlFor="absent-seat-input">缺席座號
                      <input id="absent-seat-input" type="text" autoComplete="off" enterKeyHint="done"
                        value={absentSeatInput} disabled={isSubmittingAttendance}
                        placeholder="例如 3、7、15"
                        onChange={(event) => setAbsentSeatInput(event.target.value)}
                        className="mt-1 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-base font-bold text-slate-950 placeholder:font-sans placeholder:font-bold placeholder:text-slate-400" />
                    </label>
                    <button type="submit" disabled={isSubmittingAttendance || !absentSeatInput.trim()}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-teal-200 bg-white px-4 text-sm font-black text-teal-950 hover:bg-teal-50 disabled:opacity-50 min-[520px]:col-span-2">
                      加入缺席
                    </button>
                  </div>
                  <p className="text-sm leading-5 text-slate-600">先選假別，再輸入座號。多個座號可用頓號、逗號或空白分隔。</p>
                </form>

                <details className="group rounded-xl border border-slate-200 bg-white">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-black text-slate-900 marker:content-none [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
                    <ChevronDown size={16} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
                    <Monitor size={17} className="shrink-0 text-teal-800" aria-hidden="true" />改用座位圖點選
                  </summary>
                  <div className="border-t border-slate-200 p-3">
                    <p className="mb-2 text-sm text-slate-600">選好假別後，點一下標記缺席，再點一次即可取消。</p>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-1.5">
                      {Array.from({ length: classroom.totalSeats }, (_, index) => {
                        const seat = index + 1;
                        const isAbsent = absenceBySeat.has(seat);
                        return (
                          <button key={seat} type="button" onClick={() => handleToggleSeat(seat)} aria-pressed={isAbsent} disabled={isSubmittingAttendance}
                            className={`flex min-h-12 flex-col items-center justify-center rounded-lg border px-0.5 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60 ${isAbsent ? 'border-rose-400 bg-rose-100 text-rose-950 hover:bg-rose-200' : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-teal-300 hover:bg-teal-50'}`}>
                            <span className="font-mono text-base font-black leading-none tabular-nums sm:text-lg"><span className="sr-only">座號 </span>{String(seat).padStart(2, '0')}</span>
                            <span className="mt-1 text-[10px] leading-none">{isAbsent ? '缺席' : '未列缺席'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </details>
                {seatError && <p role="alert" className="rounded-lg bg-rose-100 p-3 text-sm font-bold text-rose-950">{seatError}</p>}
              </section>

              <section className="wb-panel space-y-4" aria-labelledby="wb-check-attendance">
                <h2 id="wb-check-attendance" className="wb-section-title flex items-center gap-2"><span className="wb-step" aria-hidden="true">3</span>核對並送出</h2>
                <dl className="grid grid-cols-3 gap-2" aria-label="本節出席統計">
                  {[
                    { label: '應到', value: expectedCount, tone: 'border-slate-200 bg-slate-50 text-slate-950' },
                    { label: '實到', value: presentCount, tone: 'border-teal-200 bg-teal-50 text-teal-950' },
                    { label: '缺席', value: absentCount, tone: 'border-rose-200 bg-rose-50 text-rose-950' }
                  ].map(({ label, value, tone }) => (
                    <div key={label} className={`min-w-0 rounded-xl border px-2 py-3 text-center ${tone}`}>
                      <dt className="text-sm font-bold">{label}</dt>
                      <dd className="mt-0.5 font-mono text-xl font-black tabular-nums sm:text-2xl">{value}<span className="ml-1 font-sans text-xs">人</span></dd>
                    </div>
                  ))}
                </dl>
                <div className={`rounded-xl border p-3 ${absentCount ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                  <h3 className="text-sm font-black text-slate-950">缺席座號與假別 <span className="font-mono text-xs text-slate-700">（{absentCount} 人）</span></h3>
                  {absentCount ? (
                    <ul className="mt-2 grid gap-2">
                      {absentStudents.map((student) => (
                        <li key={student.seatNo} className="flex min-w-0 items-center gap-2 rounded-lg border border-rose-200 bg-white px-2 py-1.5">
                          <span className="shrink-0 text-xs font-black text-rose-900">座號 {student.seatNo}</span>
                          <select aria-label={`座號 ${student.seatNo} 的假別`} value={student.reason} disabled={isSubmittingAttendance}
                            onChange={(event) => {
                              lockPeriod();
                              setAttendanceSaved(false);
                              setAttendanceError('');
                              const reason = event.target.value;
                              setAbsentStudents((students) => students.map((item) => item.seatNo === student.seatNo ? { ...item, reason } : item));
                            }}
                            className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-1.5 text-sm text-slate-900">
                            <option value="">假別選填（未註明）</option>
                            {student.reason && !ABSENCE_REASONS.includes(student.reason) && <option value={student.reason}>{student.reason}</option>}
                            {ABSENCE_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                          </select>
                          <button type="button" disabled={isSubmittingAttendance} onClick={() => handleToggleSeat(student.seatNo)}
                            aria-label={`取消座號 ${student.seatNo} 缺席`} className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-bold text-rose-900 hover:bg-rose-100">
                            取消
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-sm text-slate-700">目前無人列為缺席。全班到齊時可直接送出。</p>}
                </div>

                <button type="button" disabled={isSubmittingAttendance} onClick={handleSaveAttendance} className={`${primary} w-full flex-wrap py-2`}>
                  <CheckCircle2 size={19} aria-hidden="true" />{reported ? '更新點名' : '送出點名'}
                  <span className="wb-button-status" data-tone={isSubmittingAttendance ? undefined : reportTone}>
                    {isSubmittingAttendance ? '送出中' : reportStatus}
                  </span>
                </button>
                {attendanceError && <p role="alert" className="rounded-lg bg-rose-100 p-2 text-sm font-bold text-rose-950">{attendanceError}</p>}
                <p role="status" className="sr-only">{isSubmittingAttendance ? '正在送出點名' : attendanceSaved ? '點名已回報' : ''}</p>
              </section>
            </div>
          )}
        </div>
      )}
      {tab === 'announcements' && (
          <section id="invigilator-notices" tabIndex={-1} aria-labelledby="invigilator-notices-title"
            className="wb-panel space-y-4">
            <h2 id="invigilator-notices-title" className="wb-section-title">本考場的公告</h2>
            {announcements.length ? (
              <ul className="space-y-3">
                {announcements.map((item) => (
                  <li key={item.id} className={`rounded-2xl border p-4 sm:p-5 ${item.type === 'emergency' ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                    <p className="inline-block rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 [overflow-wrap:anywhere]">{announcementLabels[item.type]}{item.subject ? ` · ${item.subject}` : ''}</p>
                    <h3 className="mt-2 text-lg font-black text-slate-950 [overflow-wrap:anywhere]">{item.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-slate-800 [overflow-wrap:anywhere]">{item.content}</p>
                  </li>
                ))}
              </ul>
            ) : <div className="wb-empty flex items-center gap-3"><Inbox size={22} className="shrink-0 text-teal-800" aria-hidden="true" />目前沒有考務公告。</div>}
          </section>
      )}
      {tab === 'issues' && (
          <div className="wb-split">
            <section id="invigilator-issue-panel" tabIndex={-1} aria-labelledby="invigilator-issue-title" className="wb-panel space-y-4">
              <div>
                <h2 id="invigilator-issue-title" className="wb-section-title">新增通報</h2>
                <p className="mt-1 text-sm leading-6 text-slate-700">選擇下方情況可帶入文字，也可以直接填寫。</p>
              </div>
              <div className="grid gap-2 min-[390px]:grid-cols-2">
                {PRESET_ISSUES.map((preset) => {
                  const Icon = preset.icon;
                  const isSelected = selectedPresetId === preset.id;
                  return (
                    <button key={preset.id} type="button" onClick={() => handlePickPreset(preset)} aria-pressed={isSelected} disabled={isSubmittingIssue}
                      className={`min-h-20 min-w-0 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-teal-700 ${preset.color} ${isSelected ? 'ring-2 ring-teal-800 ring-inset' : ''}`}>
                      <span className="flex items-center gap-1.5 text-sm font-black">
                        <Icon size={16} className={`shrink-0 ${preset.iconColor}`} aria-hidden="true" />{preset.title}
                        {isSelected && <Check size={16} className="ml-auto shrink-0" aria-hidden="true" />}
                      </span>
                      <span className="mt-1 block text-xs leading-5">{preset.subtitle}</span>
                    </button>
                  );
                })}
              </div>
              <form onSubmit={handleSubmitIssue} className="space-y-2">
                {selectedPresetId && (
                  <button type="button" disabled={isSubmittingIssue} onClick={() => {
                    setSelectedPresetId('');
                    setIssueType('general');
                    setIssueError('');
                  }} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    改為一般通報
                  </button>
                )}
                <label htmlFor="invigilator-issue" className="block text-sm font-bold text-slate-800">通報內容</label>
                <textarea id="invigilator-issue" rows={3} value={issueContent} disabled={isSubmittingIssue}
                  onChange={(event) => {
                    setIssueContent(event.target.value);
                    setIssueSent(false);
                    setIssueError('');
                  }}
                  className="block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-950"
                  placeholder="描述考場狀況與需要的協助" />
                <button type="submit" disabled={isSubmittingIssue || !issueContent.trim()} className={`${primary} wb-status-button w-full flex-wrap py-2`}>
                  <Send size={17} aria-hidden="true" />{issueType === 'urgent' ? '送出緊急通報' : '送出通報'}
                  {(isSubmittingIssue || issueSent || issueError) && (
                    <span className="wb-button-status" data-tone={issueSent ? 'success' : issueError ? 'error' : undefined}>
                      {isSubmittingIssue ? '送出中' : issueSent ? '已送出' : '送出失敗'}
                    </span>
                  )}
                </button>
                {issueError && <p role="alert" className="rounded-lg bg-rose-100 p-2 text-sm font-bold text-rose-950">{issueError}</p>}
                <p role="status" className="sr-only">{isSubmittingIssue ? '正在送出通報' : issueSent ? '通報已送出，請在處理進度查看回覆。' : ''}</p>
              </form>
            </section>

            <section className="wb-panel space-y-4" aria-labelledby="wb-issue-progress">
              <h2 id="wb-issue-progress" className="wb-section-title">處理進度 <span className="text-sm text-slate-600">（{classroomIssues.length} 則）</span></h2>
              {classroomIssues.length ? (
                <ul className="space-y-3">
                  {classroomIssues.map((issue) => (
                    <li key={issue.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${issue.status === 'resolved' ? 'bg-emerald-100 text-emerald-950' : issue.status === 'processing' ? 'bg-sky-100 text-sky-950' : 'bg-amber-100 text-amber-950'}`}>
                        {issue.status === 'resolved' ? '已處理完成' : issue.status === 'processing' ? '處理中' : '待教務處理'}
                      </span>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-950 [overflow-wrap:anywhere]">{issue.content}</p>
                      {issue.reply && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-teal-50 p-2 text-sm text-teal-950 [overflow-wrap:anywhere]">教務處回覆 · {issue.reply}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="wb-empty">目前沒有考場通報。送出後，可在這裡查看進度與教務處回覆。</p>}
            </section>
          </div>
      )}
    </div>
  );
};
