import { serverNow } from '../../types/time';
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, CalendarPlus, ChevronDown, Clock3, Pencil, Plus, Trash2 } from 'lucide-react';
import { examSync } from '../../services/examSync';
import type { ExamPeriod, SystemData } from '../../types/exam';
import { comparePeriods, examPeriods, isExamDate, LEGACY_PERIOD_ID, periodLabel, taipeiDateTime } from '../../types/examSchedule';
import { availableGrades, gradeLabel } from '../../types/grades';
import { useActionConfirmation } from '../useActionConfirmation';
import { ExamCsvImport } from './ExamCsvImport';

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700';
const field = `mt-1.5 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-2.5 text-base text-slate-950 ${focus}`;
const checkbox = 'flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 has-checked:border-violet-300 has-checked:bg-violet-50';
const weekday = new Intl.DateTimeFormat('zh-TW', { weekday: 'long', timeZone: 'Asia/Taipei' });

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
        date: current.at(-1)?.date || taipeiDateTime.format(serverNow()).slice(0, 10),
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
    <section className="min-w-0 space-y-4" aria-labelledby="exam-schedule-title">
      {confirmationDialog}
      <header className="view-header-banner flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-(--header-edge) p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-(--header-edge) bg-white text-(--header-accent)">
            <CalendarDays size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 ref={scheduleHeading} id="exam-schedule-title" tabIndex={-1} className="scroll-mt-24 text-2xl font-black tracking-tight text-slate-950">考程表</h2>
            <p className="mt-1 text-sm leading-6 text-slate-700">時間以台灣時間為準，各節點名分開記錄。</p>
          </div>
        </div>
        <button type="button" disabled={saving || current.length >= 200} onClick={() => openEditor()}
          className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-violet-800 px-3 text-sm font-bold text-white hover:bg-violet-900 disabled:cursor-default disabled:opacity-50 ${focus}`}>
          <Plus size={17} aria-hidden="true" />新增考試節次
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:px-4">
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-700">
          <span className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-violet-950">{savedDays.size} 個考試日</span>
          <span className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-violet-950">共 {current.length} 節</span>
        </p>
        <ExamCsvImport kind="schedule" disabled={editing || saving} />
      </div>
      <div className="space-y-3">
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{notice}</p>}
        {current.length === 0 && (
          <div className="grid min-h-40 justify-items-center content-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center">
            <CalendarPlus size={26} className="text-violet-800" aria-hidden="true" />
            <h3 className="font-black text-slate-950">尚未設定考程</h3>
            <p className="text-sm text-slate-700">點選「新增考試節次」安排第一節考試。</p>
          </div>
        )}
        {[...savedDays].map(([date, dayPeriods]) => (
          <section key={date} aria-labelledby={`exam-day-${date}`} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-violet-100 bg-violet-50 px-3 py-2.5 sm:px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-violet-800"><CalendarDays size={17} aria-hidden="true" /></span>
                <h3 id={`exam-day-${date}`} className="flex flex-wrap items-baseline gap-x-2 text-base font-black text-slate-950">
                  <time dateTime={date}>{date}</time>
                  {isExamDate(date) && <span className="text-xs font-bold text-violet-900">{weekday.format(new Date(date))}</span>}
                </h3>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-violet-900">{dayPeriods.length} 節</span>
            </header>
            <ul className="divide-y divide-slate-200">
              {dayPeriods.map((period) => (
                <li key={period.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-3 py-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,.7fr)_auto] sm:gap-3 sm:px-4">
                  <span className="flex items-center gap-1.5 font-mono text-xs font-bold whitespace-nowrap tabular-nums text-violet-900 sm:rounded-lg sm:bg-violet-50 sm:px-2 sm:py-1.5">
                    <Clock3 size={15} className="shrink-0" aria-hidden="true" />{period.startTime}–{period.endTime}
                  </span>
                  <div className="col-start-1 flex min-w-0 flex-wrap items-center gap-1.5 [overflow-wrap:anywhere] sm:col-start-auto">
                    <strong className="min-w-0 text-base text-slate-950">{period.subject}</strong>
                    {hasAttendance(period) && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-900">已有點名</span>}
                  </div>
                  <span className="col-start-1 min-w-0 text-xs leading-5 text-slate-700 [overflow-wrap:anywhere] sm:col-start-auto">適用 · {scopeLabel(period)}</span>
                  <button type="button" onClick={() => openEditor(period)} aria-label={`編輯 ${periodLabel(period)}`}
                    className={`col-start-2 row-span-3 row-start-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 px-2.5 text-sm font-bold text-slate-800 hover:bg-violet-50 sm:col-start-auto sm:row-span-1 sm:row-start-auto ${focus}`}>
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
            <header className="view-header-banner shrink-0 px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <h4 id="exam-period-editor-title" className="text-lg font-black">{draft.isNew ? '新增考試節次' : '編輯考試節次'}</h4>
                {!draft.isNew && hasAttendance(period) && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-900">已有點名</span>}
              </div>
              <p className="mt-1 text-sm text-slate-700">儲存後，各班電子黑板與監考點名將套用本節變更。</p>
            </header>
            <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
              <fieldset disabled={saving} className="min-w-0 space-y-3">
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <label className="col-span-2 min-w-0 text-sm font-bold text-slate-700 sm:col-span-1">考試日期
                    <input type="date" required className={field} value={period.date}
                      onChange={(e) => update({ date: e.target.value })} />
                  </label>
                  <label className="col-span-2 min-w-0 text-sm font-bold text-slate-700 sm:col-span-1">考試科目
                    <input required maxLength={100} className={field} value={period.subject} onChange={(e) => update({ subject: e.target.value })} />
                  </label>
                  <label className="min-w-0 text-sm font-bold text-slate-700">開始時間
                    <input type="time" required className={field} value={period.startTime} onChange={(e) => update({ startTime: e.target.value })} />
                  </label>
                  <label className="min-w-0 text-sm font-bold text-slate-700">結束時間
                    <input type="time" required className={field} value={period.endTime} onChange={(e) => update({ endTime: e.target.value })} />
                  </label>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-3">
                  <p className="text-sm font-bold text-violet-950 [overflow-wrap:anywhere]">適用範圍 · {scopeLabel(period)}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-700">年級與指定班級擇一，皆未選擇時適用全校。</p>
                </div>
                <fieldset className="min-w-0">
                  <legend className="text-sm font-bold text-slate-700">適用年級</legend>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {grades.map((grade) => (
                      <label key={grade} className={checkbox}>
                        <input type="checkbox" checked={period.grades.includes(grade)} className="accent-violet-800"
                          onChange={(e) => update({ classIds: undefined, grades: e.target.checked
                            ? [...period.grades, grade].sort((a, b) => a - b)
                            : period.grades.filter((item) => item !== grade) })} />
                        {gradeLabel(data.config, grade)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {data.classrooms.length > 0 && (
                  <details className="group rounded-xl border border-slate-200 bg-white px-2.5">
                    <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden ${focus}`}>
                      指定班級{period.classIds?.length ? `（${period.classIds.length} 班）` : ''}
                      <ChevronDown size={16} className="shrink-0 text-violet-800 group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="grid gap-2 pb-2.5 sm:grid-cols-2">
                      {data.classrooms.map((room) => (
                        <label key={room.classId} className={checkbox}>
                          <input type="checkbox" checked={period.classIds?.includes(room.classId) ?? false} className="accent-violet-800"
                            onChange={(e) => {
                              const previous = period.classIds ?? [];
                              const classIds = e.target.checked ? [...previous, room.classId].sort() : previous.filter((id) => id !== room.classId);
                              update({ grades: [], classIds: classIds.length ? classIds : undefined });
                            }} />
                          <span className="min-w-0 [overflow-wrap:anywhere]">{room.className}（{room.classId}）</span>
                        </label>
                      ))}
                    </div>
                  </details>
                )}
              </fieldset>
            </div>
            <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
              {conflicting && <p role="alert" className="text-sm font-bold text-rose-800">其他管理員已更新考程。請關閉彈窗，再從總覽重新開啟節次。</p>}
              {formError && <p role="alert" className="text-sm font-bold text-rose-800">{formError}</p>}
              {saving && <p role="status" className="text-sm font-bold text-violet-800">正在更新考程表…</p>}
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
                    className="min-h-11 rounded-xl bg-violet-800 px-4 text-sm font-bold text-white hover:bg-violet-900 disabled:opacity-50">儲存節次</button>
                </div>
              </div>
            </footer>
          </form>
        </dialog>
      )}
    </section>
  );
}
