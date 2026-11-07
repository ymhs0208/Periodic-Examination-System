import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, CircleCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { examSync } from '../../services/examSync';
import type { ExamPeriod, SystemData } from '../../types/exam';
import { comparePeriods, examPeriods, LEGACY_PERIOD_ID, periodLabel, taipeiDateTime } from '../../types/examSchedule';
import { availableGrades, gradeLabel } from '../../types/grades';
import { useActionConfirmation } from '../useActionConfirmation';
import { ExamCsvImport } from './ExamCsvImport';

const field = 'mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-2.5 text-sm text-slate-950';

export function ExamScheduleSettings({ data }: { data: SystemData }) {
  const { confirmAction, confirmationDialog } = useActionConfirmation();
  const [draft, setDraft] = useState<{ base: ExamPeriod[]; period: ExamPeriod; isNew: boolean } | null>(null);
  const [savedResponse, setSavedResponse] = useState<{ baseKey: string; periods: ExamPeriod[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const scheduleHeading = useRef<HTMLHeadingElement>(null);
  const synced = examPeriods(data.config);
  const syncedKey = JSON.stringify(synced);
  // The save response can arrive before the live snapshot. A newer snapshot takes precedence.
  if (savedResponse && savedResponse.baseKey !== syncedKey) setSavedResponse(null);
  const current = savedResponse?.baseKey === syncedKey ? savedResponse.periods : synced;
  const period = draft?.period;
  const grades = availableGrades(data.config, data.classrooms);
  const conflicting = draft !== null && JSON.stringify(draft.base) !== JSON.stringify(current);
  const dirty = draft !== null && (draft.isNew || JSON.stringify(draft.period) !== JSON.stringify(draft.base.find((item) => item.id === draft.period.id)));
  const savedDays = new Map<string, ExamPeriod[]>();
  for (const period of [...current].sort(comparePeriods)) {
    const day = savedDays.get(period.date);
    if (day) day.push(period);
    else savedDays.set(period.date, [period]);
  }
  const scopeLabel = (period: ExamPeriod) => period.classIds?.length
    ? period.classIds.map((id) => data.classrooms.find((room) => room.classId === id)?.className ?? id).join('、')
    : period.grades.length ? period.grades.map((grade) => gradeLabel(data.config, grade)).join('、') : '全校';
  const hasAttendance = (period: ExamPeriod) => data.classrooms.some((room) =>
    room.periodAttendance?.[period.id] || (period.id === LEGACY_PERIOD_ID && room.statusReported));
  const editing = Boolean(draft);
  useLayoutEffect(() => {
    if (editing && !dialog.current?.open) dialog.current?.showModal();
  }, [editing]);

  function openEditor(existing?: ExamPeriod) {
    setFormError('');
    setNotice('');
    setDraft({
      base: current,
      isNew: !existing,
      period: existing ?? {
        id: crypto.randomUUID(),
        date: current.at(-1)?.date || taipeiDateTime.format(new Date()).slice(0, 10),
        startTime: '', endTime: '', subject: '', grades: []
      }
    });
  }

  function closeEditor() {
    dialog.current?.close();
    setDraft(null);
  }

  function update(changes: Partial<ExamPeriod>) {
    setDraft((currentDraft) => currentDraft && { ...currentDraft, period: { ...currentDraft.period, ...changes } });
    setFormError('');
  }

  async function persist(remove = false) {
    if (!draft || conflicting || saving) return;
    const edited = { ...draft.period, subject: draft.period.subject.trim() };
    if (remove ? draft.isNew || hasAttendance(draft.period) : !dirty) return;
    if (!remove && (!edited.subject || edited.startTime >= edited.endTime)) {
      setFormError('請填寫科目，並確認結束時間晚於開始時間。');
      return;
    }
    const original = draft.base.find((item) => item.id === edited.id);
    const next = draft.base.filter((item) => item.id !== edited.id);
    if (!remove) next.push(edited);
    next.sort(comparePeriods);
    const confirmed = remove && original ? original : edited;
    if (!await confirmAction({
      title: remove ? '確認移除考試節次' : draft.isNew ? '確認新增考試節次' : '確認儲存考試節次',
      description: '儲存後，各班電子黑板與監考點名將依新考程顯示。',
      facts: [
        { label: '考試節次', value: periodLabel(confirmed) },
        { label: '適用範圍', value: scopeLabel(confirmed) }
      ],
      confirmLabel: remove ? '確認移除' : '確認儲存',
      danger: remove
    })) return;

    setSaving(true);
    setFormError('');
    try {
      const periods = await examSync.saveExamPeriods(next, draft.base);
      setSavedResponse({ baseKey: syncedKey, periods });
      closeEditor();
      if (remove || (original && original.date !== edited.date)) scheduleHeading.current?.focus();
      setNotice(remove ? '已移除考試節次。' : draft.isNew ? '已新增考試節次。' : '考試節次已儲存。');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '無法儲存考程表，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void persist();
  }

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 lg:col-span-12" aria-labelledby="exam-schedule-title">
      {confirmationDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 ref={scheduleHeading} id="exam-schedule-title" tabIndex={-1} className="flex items-center gap-2 text-lg font-black text-slate-950">
            <CalendarDays size={20} className="text-teal-800" aria-hidden="true" />考程表
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">時間以台灣時間為準，各節點名分開記錄。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving || current.length >= 200} onClick={() => openEditor()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-800 px-3 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">
            <Plus size={17} aria-hidden="true" />新增考試節次
          </button>
        </div>
      </div>
      <div className="mt-3"><ExamCsvImport kind="schedule" disabled={editing || saving} /></div>
      <div role="status" className={`mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm ${current.length ? 'border-teal-200 bg-teal-50 text-teal-950' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>
        {current.length > 0 ? <>
          <strong className="flex items-center gap-1.5"><CircleCheck size={17} aria-hidden="true" />考程已設定</strong>
          <span>已儲存 {savedDays.size} 天，共 {current.length} 節考試</span>
        </> : <strong>尚未設定考程</strong>}
      </div>
      <div className="mt-4 space-y-3">
        {notice && <p role="status" className="text-sm font-bold text-teal-800">{notice}</p>}
        {current.length === 0 && <p className="text-sm text-slate-700">點選「新增考試節次」安排第一節考試。</p>}
        {[...savedDays].map(([date, dayPeriods]) => (
          <section key={date} aria-labelledby={`exam-day-${date}`} className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5">
              <h4 id={`exam-day-${date}`} className="font-black text-slate-950"><time dateTime={date}>{date}</time></h4>
              <span className="text-xs font-bold text-slate-600">{dayPeriods.length} 節</span>
            </div>
            <ul className="divide-y divide-slate-200 border-t border-slate-200">
              {dayPeriods.map((period) => (
                <li key={period.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_minmax(7rem,0.65fr)_auto] sm:items-center sm:gap-3">
                  <span className="font-mono font-bold tabular-nums text-teal-900">{period.startTime}–{period.endTime}</span>
                  <div className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
                    <strong className="text-slate-950">{period.subject}</strong>
                    {hasAttendance(period) && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-900">已有點名</span>}
                  </div>
                  <span className="text-slate-700 [overflow-wrap:anywhere]">適用 · {scopeLabel(period)}</span>
                  <button type="button" onClick={() => openEditor(period)} aria-label={`編輯 ${periodLabel(period)}`}
                    className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-800 hover:bg-slate-50">
                    <Pencil size={15} aria-hidden="true" />編輯
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {draft && period && (
        <dialog ref={dialog} aria-labelledby="exam-period-editor-title"
          onCancel={(event) => { event.preventDefault(); if (!saving) closeEditor(); }}
          className="no-print fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/65">
          <form onSubmit={save} className="flex max-h-[calc(100dvh-2rem-2px)] flex-col">
            <header className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <h4 id="exam-period-editor-title" className="text-lg font-black">{draft.isNew ? '新增考試節次' : '編輯考試節次'}</h4>
                {!draft.isNew && hasAttendance(period) && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-900">已有點名</span>}
              </div>
              <p className="mt-1 text-sm text-slate-700">儲存後，各班電子黑板與監考點名將套用本節變更。</p>
            </header>
            <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
              <fieldset disabled={saving} className="min-w-0 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="min-w-0 text-sm font-bold text-slate-700">考試日期
                    <input type="date" required className={field} value={period.date}
                      onChange={(e) => update({ date: e.target.value })} />
                  </label>
                  <label className="min-w-0 text-sm font-bold text-slate-700">開始時間
                    <input type="time" required className={field} value={period.startTime} onChange={(e) => update({ startTime: e.target.value })} />
                  </label>
                  <label className="min-w-0 text-sm font-bold text-slate-700">結束時間
                    <input type="time" required className={field} value={period.endTime} onChange={(e) => update({ endTime: e.target.value })} />
                  </label>
                  <label className="min-w-0 text-sm font-bold text-slate-700">考試科目
                    <input required maxLength={100} className={field} value={period.subject} onChange={(e) => update({ subject: e.target.value })} />
                  </label>
                </div>
                <fieldset className="min-w-0">
                  <legend className="text-xs font-bold text-slate-700">適用年級</legend>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {grades.map((grade) => (
                      <label key={grade} className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800">
                        <input type="checkbox" checked={period.grades.includes(grade)} className="accent-teal-800"
                          onChange={(e) => update({ classIds: undefined, grades: e.target.checked
                            ? [...period.grades, grade].sort((a, b) => a - b)
                            : period.grades.filter((item) => item !== grade) })} />
                        {gradeLabel(data.config, grade)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {data.classrooms.length > 0 && (
                  <details className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">
                    <summary className="cursor-pointer text-sm font-bold text-slate-800">指定班級{period.classIds?.length ? `（${period.classIds.length} 班）` : ''}</summary>
                    <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                      {data.classrooms.map((room) => (
                        <label key={room.classId} className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2 text-sm text-slate-800">
                          <input type="checkbox" checked={period.classIds?.includes(room.classId) ?? false} className="accent-teal-800"
                            onChange={(e) => {
                              const previous = period.classIds ?? [];
                              const classIds = e.target.checked ? [...previous, room.classId].sort() : previous.filter((id) => id !== room.classId);
                              update({ grades: [], classIds: classIds.length ? classIds : undefined });
                            }} />
                          {room.className}（{room.classId}）
                        </label>
                      ))}
                    </div>
                  </details>
                )}
                <p className="mt-2 text-xs leading-5 text-slate-700">適用範圍 · {scopeLabel(period)}。年級與指定班級擇一，皆未選擇時適用全校。</p>
              </fieldset>
            </div>
            <footer className="shrink-0 space-y-2 border-t border-slate-200 px-4 py-3 sm:px-6">
              {conflicting && <p role="alert" className="text-sm font-bold text-rose-800">其他管理員已更新考程。請關閉彈窗，再從總覽重新開啟節次。</p>}
              {formError && <p role="alert" className="text-sm font-bold text-rose-800">{formError}</p>}
              {saving && <p role="status" className="text-sm font-bold text-teal-800">正在更新考程表…</p>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {!draft.isNew && !hasAttendance(period) && (
                  <button type="button" disabled={conflicting || saving} onClick={() => void persist(true)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50">
                    <Trash2 size={15} aria-hidden="true" />移除本節
                  </button>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                  <button type="button" disabled={saving} onClick={closeEditor}
                    className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">取消</button>
                  <button type="submit" disabled={!dirty || conflicting || saving}
                    className="min-h-11 rounded-xl bg-teal-800 px-4 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">儲存節次</button>
                </div>
              </div>
            </footer>
          </form>
        </dialog>
      )}
    </section>
  );
}
