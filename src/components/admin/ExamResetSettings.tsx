import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { examSync } from '../../services/examSync';
import { EXAM_RESET_CONFIRMATION, type ExamResetScope, type SystemData } from '../../types/exam';
import { useActionConfirmation } from '../useActionConfirmation';

const options = {
  current: {
    title: '清除本次段考資料',
    removed: '本次考試名稱與日期、考程、監考與出題指派、點名、通報、公告及試題更正',
    retained: '教師與管理員帳號、班級、學校、學年度、年級與考場守則設定，以及操作紀錄',
    success: '本次段考資料已清除，教師帳號與班級已保留。'
  },
  all: {
    title: '重設全部考務資料',
    removed: '考試設定、考程、考場班級、教師帳號、監考與出題指派、點名、通報、公告及試題更正',
    retained: '管理員帳號與操作紀錄',
    success: '全部考務資料已重設，教師登入已失效。'
  }
} satisfies Record<ExamResetScope, { title: string; removed: string; retained: string; success: string }>;
const scopes = ['current', 'all'] as const;

export function ExamResetSettings({ data }: { data: SystemData }) {
  const { confirmAction, confirmationDialog } = useActionConfirmation();
  const [busy, setBusy] = useState<ExamResetScope>();
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();

  async function reset(scope: ExamResetScope) {
    const option = options[scope];
    if (busy || !await confirmAction({
      title: `確認${option.title}`,
      description: '刪除後無法在系統內復原。',
      facts: [
        { label: '刪除範圍', value: option.removed },
        { label: '保留資料', value: option.retained }
      ],
      confirmLabel: scope === 'current' ? '確認清除本次段考' : '確認刪除全部考務資料',
      requiredText: EXAM_RESET_CONFIRMATION,
      danger: true
    })) return;

    setBusy(scope);
    setFeedback(undefined);
    try {
      await examSync.resetExamData(scope, EXAM_RESET_CONFIRMATION, data.resetId ?? null);
      setFeedback({ error: false, text: option.success });
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : '無法重設考務資料，請重新整理後核對。' });
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section aria-labelledby="exam-reset-title" className="min-w-0 space-y-4 rounded-2xl border border-rose-200 bg-white p-4 sm:p-6">
      {confirmationDialog}
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-800"><AlertTriangle size={21} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h3 id="exam-reset-title" className="text-lg font-black text-slate-950">選擇要清除的資料</h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">如果只是準備下一次段考，可保留教師帳號、班級與基本設定。</p>
        </div>
      </div>
      <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-950">刪除後無法在系統內復原。</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {scopes.map((scope) => {
          const option = options[scope];
          return (
            <div key={scope} className={`flex min-w-0 flex-col gap-3 rounded-xl border p-4 ${scope === 'current' ? 'border-teal-200 bg-teal-50' : 'border-rose-200 bg-rose-50'}`}>
              <h4 className="font-black text-slate-950">{option.title}</h4>
              <dl className="space-y-2 text-sm leading-6 text-slate-700">
                <div><dt className="font-bold">清除</dt><dd>{option.removed}</dd></div>
                <div><dt className="font-bold">保留</dt><dd>{option.retained}</dd></div>
              </dl>
              <button type="button" disabled={Boolean(busy)} onClick={() => void reset(scope)}
                className={`mt-auto inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl px-4 text-sm font-bold disabled:opacity-50 ${scope === 'current' ? 'border border-teal-300 bg-white text-teal-900 hover:bg-teal-100' : 'bg-rose-800 text-white hover:bg-rose-900'}`}>
                <Trash2 size={17} aria-hidden="true" />{busy === scope ? '清除中…' : option.title}
              </button>
            </div>
          );
        })}
      </div>
      {feedback && <p role={feedback.error ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm font-bold ${feedback.error ? 'bg-rose-50 text-rose-950' : 'bg-teal-50 text-teal-950'}`}>{feedback.text}</p>}
    </section>
  );
}
