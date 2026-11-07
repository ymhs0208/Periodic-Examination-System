import { useLayoutEffect, useRef, useState } from 'react';
import { CalendarClock, CheckCircle2, ClipboardList, Pencil, Search, UserPlus, UsersRound } from 'lucide-react';
import { examSync } from '../../services/examSync';
import type { ClassroomExamState, ExamPeriod, SystemData, TeacherAccount } from '../../types/exam';
import { availableGrades, gradeLabel } from '../../types/grades';
import { comparePeriods, examPeriods, invigilatorForPeriod, periodApplies, periodLabel, periodTimesOverlap, preferredPeriod } from '../../types/examSchedule';
import { useActionConfirmation } from '../useActionConfirmation';
import { ExamCsvImport } from './ExamCsvImport';

type AssignmentFilter = 'all' | 'pending' | 'assigned';
type EditorSelection = { classId: string; periodId?: string; periodLabel: string; teacherId: string | null };
type TeacherChoice = { teacher: TeacherAccount; otherRoom?: string };

const field = 'mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950';
const panel = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5';
const secondary = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-default disabled:opacity-50';
const primary = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-teal-800 px-3 text-sm font-bold text-white hover:bg-teal-900 disabled:cursor-default disabled:opacity-50';

function assignmentSource(room: ClassroomExamState, period: ExamPeriod | undefined, teacher: TeacherAccount | undefined) {
  if (!period) {
    if (teacher) return '考場預設老師';
    return room.invigilator && !['待指派', '待指派監考老師'].includes(room.invigilator)
      ? `原登記 ${room.invigilator}，尚未綁定帳號` : '尚未設定預設老師';
  }
  const override = room.periodInvigilators?.[period.id];
  if (override === null) return '本節已解除指派';
  if (override !== undefined) return teacher ? '本節專屬指派' : '本節指派的帳號已不可用';
  return teacher ? '沿用考場預設' : '尚無考場預設老師';
}

function AssignmentFields({ choices, perPeriod, saving, onSave }: {
  choices: TeacherChoice[];
  perPeriod: boolean;
  saving: boolean;
  onSave: (teacher: TeacherAccount) => void;
}) {
  const [query, setQuery] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const term = query.trim().toLowerCase();
  const matches = choices.filter(({ teacher }) => [teacher.name, teacher.username, teacher.department]
    .some((value) => value?.toLowerCase().includes(term)));
  const available = matches.filter((item) => !item.otherRoom);
  const occupied = matches.filter((item) => item.otherRoom);
  const candidate = matches.find(({ teacher }) => teacher.id === candidateId);

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (candidate && !(perPeriod && candidate.otherRoom)) onSave(candidate.teacher);
    }} className="space-y-3">
      <label className="block text-sm font-bold text-slate-800">搜尋教師
        <input type="search" value={query} disabled={saving} className={field} placeholder="姓名、帳號或科別"
          onChange={(event) => { setQuery(event.target.value); setCandidateId(''); }} />
      </label>
      <label className="block text-sm font-bold text-slate-800">選擇監考老師
        <select required value={candidate?.teacher.id ?? ''} disabled={saving} className={field}
          aria-describedby="assignment-teacher-hint" onChange={(event) => setCandidateId(event.target.value)}>
          <option value="">請選擇教師</option>
          {available.length > 0 && (
            <optgroup label={perPeriod ? '此時段可指派' : '尚無預設考場'}>
              {available.map(({ teacher }) => <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.username}</option>)}
            </optgroup>
          )}
          {occupied.length > 0 && (
            <optgroup label={perPeriod ? '時段重疊，無法指派' : '可從其他考場調任'}>
              {occupied.map(({ teacher, otherRoom }) => (
                <option key={teacher.id} value={teacher.id} disabled={perPeriod}>{teacher.name} · {teacher.username}（{otherRoom}）</option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <p id="assignment-teacher-hint" className="text-sm leading-6 text-slate-700">
        {!matches.length ? '沒有符合搜尋條件的其他教師。' : perPeriod
          ? `有 ${available.length} 位教師可指派${occupied.length ? `，${occupied.length} 位與其他考場時段重疊` : ''}。`
          : '調任教師時，系統會一併更新原考場的預設指派。'}
      </p>
      {!perPeriod && candidate?.otherRoom && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-950">此教師將從 {candidate.otherRoom} 調任，原考場會變為待指派。</p>
      )}
      <button type="submit" disabled={saving || !candidate || (perPeriod && Boolean(candidate.otherRoom))} className={primary}>
        <CheckCircle2 size={16} aria-hidden="true" />核對指派
      </button>
    </form>
  );
}

export function InvigilatorAssignments({ data, onManageTeachers, onOpenSchedule }: {
  data: SystemData;
  onManageTeachers: () => void;
  onOpenSchedule?: () => void;
}) {
  const { config } = data;
  const teachers = data.teachers ?? [];
  const periods = [...examPeriods(config)].sort(comparePeriods);
  const periodsByDate = new Map<string, ExamPeriod[]>();
  for (const item of periods) {
    const day = periodsByDate.get(item.date);
    if (day) day.push(item);
    else periodsByDate.set(item.date, [item]);
  }
  const [referenceTime] = useState(() => new Date());
  const [requestedPeriod, setRequestedPeriod] = useState('');
  const period = requestedPeriod === '@default' ? undefined :
    periods.find((item) => item.id === requestedPeriod) ?? preferredPeriod(periods, referenceTime);
  const scope = period ? periodLabel(period) : '考場預設';
  const classrooms = period ? data.classrooms.filter((room) => periodApplies(period, room)) : data.classrooms;
  const { confirmAction, confirmationDialog } = useActionConfirmation();
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState('');
  const [status, setStatus] = useState<AssignmentFilter>('all');
  const [editor, setEditor] = useState<EditorSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);

  const teachersByRoom = new Map(classrooms.map((room) => [room.classId, period
    ? invigilatorForPeriod(room, period.id, teachers)
    : teachers.find((teacher) => teacher.assignedClassId === room.classId)]));
  const assignedCount = [...teachersByRoom.values()].filter(Boolean).length;
  const grades = availableGrades(config, classrooms).filter((value) => classrooms.some((room) => room.grade === value));
  const activeGrade = grades.includes(Number(grade)) ? grade : '';
  const selectedRoom = classrooms.find((room) => room.classId === editor?.classId);
  const currentTeacher = selectedRoom && teachersByRoom.get(selectedRoom.classId);
  const changedElsewhere = Boolean(editor && (!selectedRoom || editor.periodId !== period?.id || editor.periodLabel !== scope ||
    editor.teacherId !== (currentTeacher?.id ?? null)));
  const editing = Boolean(editor);
  useLayoutEffect(() => {
    if (editing && !dialog.current?.open) dialog.current?.showModal();
  }, [editing]);

  const roomLabel = (id: string) => {
    const room = data.classrooms.find((item) => item.classId === id);
    return room ? `${room.className}（${id}）` : id;
  };
  const occupied = new Map<string, string>();
  if (period && selectedRoom) {
    const overlapping = periods.filter((other) => periodTimesOverlap(period, other));
    for (const room of data.classrooms) {
      if (room.classId === selectedRoom.classId) continue;
      for (const other of overlapping.filter((item) => periodApplies(item, room))) {
        const teacher = invigilatorForPeriod(room, other.id, teachers);
        if (teacher && !occupied.has(teacher.id)) occupied.set(teacher.id, roomLabel(room.classId));
      }
    }
  }
  const choices = teachers.filter((teacher) => teacher.id !== currentTeacher?.id).map((teacher) => ({
    teacher,
    otherRoom: period ? occupied.get(teacher.id) : teacher.assignedClassId ? roomLabel(teacher.assignedClassId) : undefined
  }));
  const term = query.trim().toLowerCase();
  const visible = classrooms.filter((room) => {
    const teacher = teachersByRoom.get(room.classId);
    return (!activeGrade || String(room.grade) === activeGrade) &&
      (status === 'all' || Boolean(teacher) === (status === 'assigned')) &&
      [room.classId, room.className, teacher?.name ?? (!period ? room.invigilator : ''), teacher?.username]
        .some((value) => value?.toLowerCase().includes(term));
  }).sort((first, second) => Number(Boolean(teachersByRoom.get(first.classId))) - Number(Boolean(teachersByRoom.get(second.classId))) ||
    first.grade - second.grade || first.classId.localeCompare(second.classId, 'zh-TW', { numeric: true }));

  function openEditor(room: ClassroomExamState) {
    setError('');
    setNotice('');
    setEditor({ classId: room.classId, periodId: period?.id, periodLabel: scope, teacherId: teachersByRoom.get(room.classId)?.id ?? null });
  }

  function closeEditor() {
    dialog.current?.close();
    setEditor(null);
  }

  async function saveAssignment(teacher: TeacherAccount, remove = false) {
    if (!selectedRoom || changedElsewhere || saving) return;
    const sourceId = teacher.assignedClassId || '';
    if (!await confirmAction({
      title: remove ? '確認解除監考指派' : '確認監考指派',
      description: period
        ? remove ? '解除後，本節將變為待指派。' : '此變更只套用到所選節次。'
        : '此變更會套用到尚未單獨指派的節次。',
      facts: [
        { label: '考場', value: roomLabel(selectedRoom.classId) },
        { label: '適用範圍', value: scope },
        { label: remove ? '解除的監考老師' : '指派的監考老師', value: `${teacher.name}（${teacher.username}）` },
        ...(!remove && currentTeacher ? [{ label: '原監考老師', value: currentTeacher.name }] : []),
        ...(!period && !remove && sourceId ? [{ label: '原考場', value: `${roomLabel(sourceId)} 將變為待指派` }] : [])
      ],
      confirmLabel: remove ? '確認解除' : '確認指派',
      danger: remove
    })) return;

    setSaving(true);
    setError('');
    try {
      if (period) {
        await examSync.assignPeriodInvigilator({
          classId: selectedRoom.classId, periodId: period.id, expectedPeriod: period,
          teacherId: remove ? null : teacher.id, expectedTeacherId: currentTeacher?.id ?? null
        });
      } else {
        const result = await examSync.assignTeacherToClassroom(teacher.id, remove ? '' : selectedRoom.classId, {
          previousClassId: sourceId, targetTeacherId: currentTeacher?.id || ''
        });
        if (!result.success) throw new Error(result.error || '無法儲存監考指派，請稍後再試。');
      }
      closeEditor();
      if (status !== 'all' || query.trim()) listHeading.current?.focus();
      setNotice(remove ? `已解除 ${roomLabel(selectedRoom.classId)} 的監考指派。` : `已指派 ${teacher.name} 監考 ${roomLabel(selectedRoom.classId)}。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法儲存監考指派，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  const filters = [
    { value: 'all', label: '全部考場', count: classrooms.length },
    { value: 'pending', label: '待指派', count: classrooms.length - assignedCount },
    { value: 'assigned', label: '已指派', count: assignedCount }
  ] as const;

  return (
    <div className="space-y-4">
      {confirmationDialog}
      <section className={panel} aria-labelledby="assignment-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="assignment-title" className="flex items-center gap-2 text-lg font-black text-slate-950">
              <ClipboardList size={20} className="text-teal-800" aria-hidden="true" />監考指派
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-700">選好節次後，直接從考場清單指派或更換老師。</p>
          </div>
          <button type="button" onClick={onManageTeachers} className={secondary}><UsersRound size={16} aria-hidden="true" />管理教師名冊</button>
        </div>
        <div className="mt-4 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="min-w-0 text-sm font-bold text-slate-800">1. 選擇考試節次
            <select className={field} value={period?.id ?? '@default'} onChange={(event) => {
              setRequestedPeriod(event.target.value);
              setStatus('all');
              setGrade('');
              setQuery('');
              setNotice('');
            }}>
              {[...periodsByDate].map(([date, day]) => (
                <optgroup key={date} label={date || '舊考程'}>
                  {day.map((item) => <option key={item.id} value={item.id}>{item.startTime}–{item.endTime} · {item.subject}</option>)}
                </optgroup>
              ))}
              <option value="@default">考場預設（適用未單獨指派的節次）</option>
            </select>
          </label>
          <ExamCsvImport kind="invigilation" disabled={editing || saving} />
        </div>
        <div className="mt-3 rounded-xl bg-teal-50 px-3 py-2.5 text-teal-950">
          <p className="flex items-start gap-2 text-sm font-black [overflow-wrap:anywhere]"><CalendarClock size={17} className="mt-0.5 shrink-0" aria-hidden="true" />目前排班 · {scope}</p>
          <p className="mt-1 text-xs leading-5">
            {period ? '調整只影響這一節。清單會標示是否沿用考場預設老師。' : '考場預設會套用到未個別設定的節次。'}
          </p>
          {!periods.length && <p className="mt-1 text-xs leading-5">
            尚未設定考程，可先安排考場預設老師。<a href="/admin/settings/schedule" className="font-bold underline underline-offset-2"
              onClick={(event) => { if (onOpenSchedule && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onOpenSchedule(); } }}>前往考程表</a>
          </p>}
        </div>
      </section>

      <section className={panel} aria-labelledby="assignment-list-title">
        <h3 ref={listHeading} tabIndex={-1} id="assignment-list-title" className="text-lg font-black text-slate-950">2. 指派考場老師</h3>
        {notice && <p role="status" className="mt-3 rounded-xl bg-teal-50 p-3 text-sm font-bold text-teal-900">{notice}</p>}
        <div role="group" aria-label="依指派狀態篩選" className="mt-3 grid grid-cols-3 gap-2">
          {filters.map(({ value, label, count }) => (
            <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}
              className="flex min-h-14 min-w-0 cursor-pointer flex-wrap items-center justify-center gap-x-1.5 rounded-xl border border-slate-200 px-1.5 py-2 text-xs font-bold text-slate-800 hover:bg-teal-50 aria-pressed:border-teal-800 aria-pressed:bg-teal-800 aria-pressed:text-white sm:text-sm">
              {label}<strong className="font-mono text-lg tabular-nums">{count}</strong>
            </button>
          ))}
        </div>
        {classrooms.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.4fr)]">
            <label className="min-w-0 text-sm font-bold text-slate-800">搜尋考場
              <span className="relative block">
                <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="班級代號、班名或教師" className={`${field} pl-9`} />
              </span>
            </label>
            <label className="min-w-0 text-sm font-bold text-slate-800">篩選年級
              <select value={activeGrade} onChange={(event) => setGrade(event.target.value)} className={field}>
                <option value="">全部年級</option>
                {grades.map((item) => <option key={item} value={item}>{gradeLabel(config, item)}</option>)}
              </select>
            </label>
          </div>
        )}
        <p role="status" className="mt-3 text-sm font-bold text-slate-600">顯示 {visible.length} 間考場</p>
        {visible.length ? (
          <ul aria-label="考場監考指派清單" className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            {visible.map((room) => {
              const teacher = teachersByRoom.get(room.classId);
              const action = teacher ? '更換老師' : '指派老師';
              return (
                <li key={room.classId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:px-4">
                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <strong className="block text-sm text-slate-950">{room.className}</strong>
                    <p className="text-xs text-slate-600">{gradeLabel(config, room.grade)} · {room.classId}</p>
                  </div>
                  <div className="col-start-1 row-start-2 min-w-0 [overflow-wrap:anywhere] sm:col-start-2 sm:row-start-1">
                    <strong className={`block text-sm ${teacher ? 'text-slate-950' : 'text-amber-900'}`}>{teacher?.name ?? '待指派'}</strong>
                    <p className="text-xs text-slate-600">{assignmentSource(room, period, teacher)}</p>
                  </div>
                  <button type="button" onClick={() => openEditor(room)} aria-label={`${roomLabel(room.classId)} ${action}`}
                    className={`${teacher ? secondary : primary} col-start-2 row-span-2 row-start-1 whitespace-nowrap sm:col-start-3 sm:row-span-1`}>
                    {teacher ? <Pencil size={15} aria-hidden="true" /> : <UserPlus size={15} aria-hidden="true" />}{action}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          {classrooms.length ? status === 'pending' && assignedCount === classrooms.length ? '此範圍的考場都已指派。' : '找不到符合條件的考場，請調整篩選。'
            : data.classrooms.length ? '這一節沒有適用的考場，請確認考程的適用範圍。' : '尚未設定考場班級。'}
        </p>}
      </section>

      {editor && (
        <dialog ref={dialog} aria-labelledby="assignment-editor-title"
          onCancel={(event) => { event.preventDefault(); if (!saving) closeEditor(); }}
          className="no-print fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/65">
          <div className="flex max-h-[calc(100dvh-2rem-2px)] flex-col">
            <header className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6">
              <h4 id="assignment-editor-title" className="text-lg font-black [overflow-wrap:anywhere]">{editor.teacherId ? '更換監考老師' : '指派監考老師'}</h4>
              <p className="mt-1 text-sm font-bold text-teal-900 [overflow-wrap:anywhere]">{roomLabel(editor.classId)} · {editor.periodLabel}</p>
            </header>
            <div className="min-h-0 flex-auto space-y-4 overflow-y-auto overscroll-contain p-4 sm:px-6">
              {changedElsewhere && !saving ? <p role="alert" className="text-sm font-bold text-rose-800">考場、節次或指派已變更，請關閉後重新開啟。</p> : (
                <>
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-800 [overflow-wrap:anywhere]">
                    目前監考 · <strong>{currentTeacher ? `${currentTeacher.name}（${currentTeacher.username}）` : '待指派'}</strong>
                    {selectedRoom && <span className="mt-1 block text-xs text-slate-600">{assignmentSource(selectedRoom, period, currentTeacher)}</span>}
                  </p>
                  {teachers.length ? <AssignmentFields choices={choices} perPeriod={Boolean(period)} saving={saving} onSave={(teacher) => void saveAssignment(teacher)} /> : (
                    <button type="button" className={secondary} onClick={() => { closeEditor(); onManageTeachers(); }}>前往教師名冊新增教師</button>
                  )}
                </>
              )}
            </div>
            <footer className="shrink-0 space-y-2 border-t border-slate-200 px-4 py-3 sm:px-6">
              {saving && <p role="status" className="text-sm font-bold text-teal-900">正在更新監考指派…</p>}
              {error && <p role="alert" className="text-sm font-bold text-rose-800">{error}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {currentTeacher && !changedElsewhere && <button type="button" disabled={saving} onClick={() => void saveAssignment(currentTeacher, true)}
                  className="min-h-11 rounded-xl px-2 text-sm font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50">解除指派</button>}
                <button type="button" className={`${secondary} ml-auto`} disabled={saving} onClick={closeEditor}>取消</button>
              </div>
            </footer>
          </div>
        </dialog>
      )}
    </div>
  );
}
