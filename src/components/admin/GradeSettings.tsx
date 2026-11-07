import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { examSync } from '../../services/examSync';
import type { SystemData } from '../../types/exam';
import { availableGrades, gradeLabel } from '../../types/grades';
import { ExamCsvImport } from './ExamCsvImport';

export function GradeSettings({ data }: { data: SystemData }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const grades = availableGrades(data.config, data.classrooms);

  function resetForm() {
    setCode('');
    setLabel('');
    setEditing(null);
  }

  async function save(grade: number, name: string | null) {
    setSaving(true);
    setFeedback(null);
    try {
      await examSync.saveGrade(grade, name);
      if (name !== null || editing === grade) resetForm();
      setFeedback({ success: true, message: name === null ? '已移除年級。' : '年級已儲存。' });
    } catch (error) {
      setFeedback({ success: false, message: error instanceof Error ? error.message : '無法儲存年級，請稍後再試。' });
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const grade = Number(code);
    if (editing === null && grades.includes(grade)) {
      setFeedback({ success: false, message: '此代碼已存在。若要改名，請點該年級的編輯按鈕。' });
      return;
    }
    void save(grade, label.trim());
  }

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:col-span-12" aria-labelledby="grade-settings-heading">
      <div>
        <h3 id="grade-settings-heading" className="text-base font-black text-slate-900 sm:text-lg">年級管理</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">新增年級代碼與顯示名稱，例如代碼 10、名稱「高中一年級」。改名後，選班、公告對象與報表會同步更新。</p>
      </div>
      <ExamCsvImport kind="grades" disabled={saving || editing !== null} />
      <form onSubmit={submit} className="grid items-end gap-3 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto]">
        <label className="block text-sm font-bold text-slate-700">
          年級代碼
          <input type="number" min={1} max={999} step={1} required readOnly={editing !== null} value={code}
            onChange={(event) => setCode(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-mono read-only:bg-slate-100" />
        </label>
        <label className="block text-sm font-bold text-slate-700">
          顯示名稱
          <input type="text" required maxLength={24} value={label} onChange={(event) => setLabel(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving}
            className="min-h-11 cursor-pointer rounded-xl bg-teal-800 px-4 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">
            {editing === null ? '新增年級' : '儲存名稱'}
          </button>
          {editing !== null && <button type="button" disabled={saving} onClick={resetForm}
            className="min-h-11 cursor-pointer rounded-xl border border-slate-300 px-3 text-sm font-bold">取消</button>}
        </div>
      </form>
      {feedback && <p role={feedback.success ? 'status' : 'alert'} className={feedback.success ? 'text-sm text-teal-800' : 'text-sm text-rose-800'}>{feedback.message}</p>}
      {grades.length === 0 && <p className="text-sm text-slate-600">目前沒有年級，請先新增再建立考場。</p>}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {grades.map((grade) => {
          const name = gradeLabel(data.config, grade);
          const inUse = data.classrooms.some((room) => room.grade === grade) ||
            data.announcements.some((item) => item.targetAudience === `grade_${grade}`) ||
            data.config.periods?.some((item) => item.grades.includes(grade));
          return (
            <li key={grade} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span className="font-mono text-xs text-slate-500">{grade}</span>
              <span className="min-w-0 flex-1 break-words text-sm font-bold text-slate-900">{name}</span>
              <button type="button" aria-label={`編輯 ${name}`} disabled={saving} onClick={() => {
                setEditing(grade);
                setCode(String(grade));
                setLabel(name);
                setFeedback(null);
              }} className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-teal-800 hover:bg-teal-100">
                <Pencil size={16} aria-hidden="true" />
              </button>
              <button type="button" aria-label={`移除 ${name}`} title={inUse ? '此年級已有考場、定向公告或考程' : '移除年級'}
                disabled={saving || inUse} onClick={() => void save(grade, null)}
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-rose-800 hover:bg-rose-100 disabled:cursor-default disabled:opacity-30">
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
