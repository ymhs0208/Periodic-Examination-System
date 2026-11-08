import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Building2, Pencil, Plus, Search, Trash2, UserCheck } from 'lucide-react';
import { examSync } from '../../services/examSync';
import type { ClassroomExamState, SystemData } from '../../types/exam';
import { availableGrades, gradeLabel } from '../../types/grades';
import { useActionConfirmation } from '../useActionConfirmation';
import { ExamCsvImport } from './ExamCsvImport';

type ClassroomDetails = Pick<ClassroomExamState, 'grade' | 'className' | 'expectedCount'>;
type Draft = { original?: ClassroomExamState; grade: number; name: string; count: string };
const field = 'mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950';
const secondary = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50';

function classroomDetails({ grade, className, expectedCount }: ClassroomDetails): ClassroomDetails {
  return { grade, className, expectedCount };
}

function matchesSearch(room: ClassroomExamState, query: string) {
  const term = query.trim().toLowerCase();
  return [room.className, room.classId].some((value) => value.toLowerCase().includes(term));
}

export function ClassroomSettings({ data, onManageInvigilation }: { data: SystemData; onManageInvigilation: () => void }) {
  const { confirmAction, confirmationDialog } = useActionConfirmation();
  const [query, setQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [acknowledged, setAcknowledged] = useState<Record<string, { room: ClassroomExamState; before?: ClassroomDetails }>>({});
  const [removed, setRemoved] = useState<Record<string, true>>({});
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Keep confirmed saves visible until a newer live snapshot arrives for each class.
  const liveRooms = new Map(data.classrooms.map((room) => [room.classId, room]));
  let pending = acknowledged;
  for (const [id, entry] of Object.entries(acknowledged)) {
    const live = liveRooms.get(id);
    if (live && JSON.stringify(classroomDetails(live)) !== JSON.stringify(entry.before)) {
      if (pending === acknowledged) pending = { ...acknowledged };
      delete pending[id];
    } else {
      liveRooms.set(id, entry.room);
    }
  }
  if (pending !== acknowledged) setAcknowledged(pending);
  let pendingRemoved = removed;
  for (const id of Object.keys(removed)) {
    if (!data.classrooms.some((room) => room.classId === id)) {
      if (pendingRemoved === removed) pendingRemoved = { ...removed };
      delete pendingRemoved[id];
    } else {
      liveRooms.delete(id);
    }
  }
  if (pendingRemoved !== removed) setRemoved(pendingRemoved);
  const rooms = [...liveRooms.values()].sort((first, second) =>
    first.grade - second.grade || first.classId.localeCompare(second.classId, 'zh-TW', { numeric: true }));
  const grades = availableGrades(data.config, rooms);
  const activeFilter = grades.includes(Number(gradeFilter)) ? gradeFilter : '';
  const visible = rooms.filter((room) => (!activeFilter || String(room.grade) === activeFilter) && matchesSearch(room, query));
  const groups = new Map<number, ClassroomExamState[]>();
  for (const room of visible) {
    const group = groups.get(room.grade);
    if (group) group.push(room);
    else groups.set(room.grade, [room]);
  }
  const editing = draft !== null;
  const latestRoom = draft?.original && liveRooms.get(draft.original.classId);
  const changedElsewhere = Boolean(draft?.original && (!latestRoom ||
    JSON.stringify(classroomDetails(draft.original)) !== JSON.stringify(classroomDetails(latestRoom))));
  const changed = !draft?.original || draft.grade !== draft.original.grade ||
    draft.name.trim() !== draft.original.className || Number(draft.count) !== draft.original.expectedCount;
  const maxCount = Math.max(10000, draft?.original?.expectedCount ?? 0);

  useLayoutEffect(() => {
    if (editing && !dialog.current?.open) dialog.current?.showModal();
  }, [editing]);

  function openEditor(room?: ClassroomExamState) {
    setNotice('');
    setError('');
    setDraft({ original: room, grade: room?.grade ?? (Number(activeFilter) || grades[0]), name: room?.className ?? '', count: String(room?.expectedCount ?? 30) });
  }

  function closeEditor() {
    dialog.current?.close();
    setDraft(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !changed || saving || changedElsewhere) return;
    const details = { grade: draft.grade, className: draft.name.trim(), expectedCount: Number(draft.count) };
    if (!details.className || !grades.includes(details.grade) || !Number.isSafeInteger(details.expectedCount) ||
      details.expectedCount < 1 || details.expectedCount > maxCount) {
      setError('請選擇年級、填寫班級名稱，並輸入有效的應到人數。');
      return;
    }
    const before = draft.original ? classroomDetails(draft.original) : undefined;
    if (!await confirmAction({
      title: draft.original ? '確認更新考場班級' : '確認新增考場班級',
      facts: [
        ...(draft.original ? [{ label: '班級代號', value: draft.original.classId }] : []),
        { label: '班級名稱', value: details.className },
        { label: '年級', value: gradeLabel(data.config, details.grade) },
        { label: '應到人數', value: `${details.expectedCount} 人` }
      ],
      confirmLabel: '確認儲存'
    })) return;

    setSaving(true);
    setError('');
    try {
      const room = draft.original
        ? await examSync.updateClassroom(draft.original.classId, { ...details, expected: before })
        : await examSync.addClassroom({ ...details, invigilator: '待指派監考老師' });
      setAcknowledged((entries) => ({ ...entries, [room.classId]: { before, room } }));
      if (activeFilter && activeFilter !== String(room.grade)) setGradeFilter('');
      if (!matchesSearch(room, query)) setQuery('');
      closeEditor();
      if (before && before.grade !== room.grade) heading.current?.focus();
      setNotice(`${draft.original ? '已更新' : '已新增'}「${room.className}」（${room.classId}），應到 ${room.expectedCount} 人。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法儲存考場班級，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  async function removeClassroom(room: ClassroomExamState) {
    if (saving) return;
    const assignedCount = (data.teachers ?? []).filter((teacher) => teacher.assignedClassId === room.classId).length;
    if (!await confirmAction({
      title: '確認刪除考場班級',
      description: '刪除會一併拿掉該班出缺席資料，並把指派到這班的監考改回未指派。此操作無法復原。',
      facts: [
        { label: '班級代號', value: room.classId },
        { label: '班級名稱', value: room.className },
        { label: '年級', value: gradeLabel(data.config, room.grade) },
        { label: '應到人數', value: `${room.expectedCount} 人` },
        ...(assignedCount ? [{ label: '將改回未指派', value: `${assignedCount} 位監考老師` }] : [])
      ],
      confirmLabel: '確認刪除',
      danger: true
    })) return;

    setSaving(true);
    setError('');
    try {
      await examSync.deleteClassroom(room.classId);
      setAcknowledged((entries) => {
        if (!(room.classId in entries)) return entries;
        const next = { ...entries };
        delete next[room.classId];
        return next;
      });
      setRemoved((entries) => ({ ...entries, [room.classId]: true }));
      if (draft?.original?.classId === room.classId) closeEditor();
      setNotice(`已刪除「${room.className}」（${room.classId}）。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法刪除考場班級，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="classroom-settings-title" className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      {confirmationDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 ref={heading} id="classroom-settings-title" tabIndex={-1} className="flex items-center gap-2 text-lg font-black text-slate-950">
            <Building2 size={20} className="text-violet-800" aria-hidden="true" />考場班級與應到人數設定
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">查看已設定的班級代號、班名與應到人數。選擇班級旁的「編輯」即可修改，或按「刪除」移除該班。</p>
        </div>
        <button type="button" disabled={!grades.length} onClick={() => openEditor()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-violet-800 px-3.5 text-sm font-bold text-white hover:bg-violet-900 disabled:opacity-50">
          <Plus size={17} aria-hidden="true" />新增考場班級
        </button>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <ExamCsvImport kind="classrooms" disabled={editing} />
        <button type="button" className={secondary} onClick={onManageInvigilation}><UserCheck size={16} aria-hidden="true" />前往監考排班</button>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
        <strong>{rooms.length ? `已設定 ${rooms.length} 班` : '尚未設定考場班級'}</strong>
        {rooms.length > 0 && <span>全校應到共 <strong className="tabular-nums">{rooms.reduce((total, room) => total + room.expectedCount, 0)}</strong> 人</span>}
      </div>
      {notice && <p role="status" className="text-sm font-bold text-violet-800">{notice}</p>}
      {rooms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
          {grades.length ? '可點「新增考場班級」建立第一班，或用 CSV 一次匯入多班。' : '請先在「年級管理」新增年級，再建立考場班級。'}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.45fr)]">
            <label className="min-w-0 text-sm font-bold text-slate-700">搜尋班級
              <span className="relative block">
                <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="search" className={`${field} pl-9`} placeholder="輸入班名或班級代號" value={query} onChange={(event) => setQuery(event.target.value)} />
              </span>
            </label>
            <label className="min-w-0 text-sm font-bold text-slate-700">篩選年級
              <select className={field} value={activeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
                <option value="">全部年級</option>
                {grades.map((grade) => <option key={grade} value={grade}>{gradeLabel(data.config, grade)}</option>)}
              </select>
            </label>
          </div>
          <p role="status" className="text-sm font-bold text-slate-700">顯示 {visible.length} 班，共 {rooms.length} 班</p>
          {!visible.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">找不到符合條件的班級，請調整搜尋或年級篩選。</p>}
          {[...groups].map(([grade, group]) => (
            <section key={grade} aria-labelledby={`classroom-grade-${grade}`} className="overflow-hidden rounded-xl border border-slate-200">
              <header className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5">
                <h4 id={`classroom-grade-${grade}`} className="font-black text-slate-950">{gradeLabel(data.config, grade)}</h4>
                <span className="text-xs font-bold text-slate-600">{group.length} 班</span>
              </header>
              <ul className="divide-y divide-slate-200 border-t border-slate-200">
                {group.map((room) => (
                  <li key={room.classId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                    <div className="min-w-0">
                      <strong className="block text-slate-950 [overflow-wrap:anywhere]">{room.className}</strong>
                      <span className="text-xs text-slate-600 [overflow-wrap:anywhere]">班級代號 {room.classId}</span>
                    </div>
                    <p className="col-start-1 row-start-2 text-slate-700 sm:col-start-2 sm:row-start-1">應到 <strong className="tabular-nums text-slate-950">{room.expectedCount}</strong> 人</p>
                    <div className="col-start-2 row-span-2 row-start-1 flex flex-wrap justify-end gap-2 sm:col-start-3 sm:row-span-1">
                      <button type="button" className={secondary} disabled={saving}
                        aria-label={`編輯 ${room.className}（${room.classId}）`} onClick={() => openEditor(room)}>
                        <Pencil size={15} aria-hidden="true" />編輯
                      </button>
                      <button type="button" disabled={saving} onClick={() => removeClassroom(room)}
                        aria-label={`刪除 ${room.className}（${room.classId}）`}
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50">
                        <Trash2 size={15} aria-hidden="true" />刪除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {draft && (
        <dialog ref={dialog} aria-labelledby="classroom-editor-title"
          onCancel={(event) => { event.preventDefault(); if (!saving) closeEditor(); }}
          className="no-print fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/65">
          <form onSubmit={save} className="flex max-h-[calc(100dvh-2rem-2px)] flex-col">
            <header className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6">
              <h4 id="classroom-editor-title" className="text-lg font-black">{draft.original ? '編輯考場班級' : '新增考場班級'}</h4>
              <p className="mt-1 text-sm text-slate-700">{draft.original ? `班級代號 ${draft.original.classId}` : '儲存後，系統會自動產生班級代號。'}</p>
            </header>
            <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
              <fieldset disabled={saving} className="min-w-0 space-y-3">
                <label className="block text-sm font-bold text-slate-700">班級名稱
                  <input required className={field} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <label className="block text-sm font-bold text-slate-700">年級
                  <select required className={field} value={draft.grade} onChange={(event) => setDraft({ ...draft, grade: Number(event.target.value) })}>
                    {grades.map((grade) => <option key={grade} value={grade}>{gradeLabel(data.config, grade)}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-bold text-slate-700">應到人數
                  <input required type="number" min={1} max={maxCount} step={1} className={field} value={draft.count}
                    onChange={(event) => setDraft({ ...draft, count: event.target.value })} />
                </label>
              </fieldset>
            </div>
            <footer className="shrink-0 space-y-2 border-t border-slate-200 px-4 py-3 sm:px-6">
              {changedElsewhere && <p role="alert" className="text-sm font-bold text-rose-800">此班級已更新，請關閉彈窗後重新開啟。</p>}
              {error && <p role="alert" className="text-sm font-bold text-rose-800">{error}</p>}
              {saving && <p role="status" className="text-sm font-bold text-violet-800">正在儲存考場班級…</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={secondary} disabled={saving} onClick={closeEditor}>取消</button>
                <button type="submit" disabled={saving || !changed || changedElsewhere}
                  className="min-h-11 rounded-xl bg-violet-800 px-4 text-sm font-bold text-white hover:bg-violet-900 disabled:opacity-50">儲存班級</button>
              </div>
            </footer>
          </form>
        </dialog>
      )}
    </section>
  );
}
