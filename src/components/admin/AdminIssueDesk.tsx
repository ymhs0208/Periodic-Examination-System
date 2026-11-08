import { useRef } from 'react';
import { AlertTriangle, ArrowUp, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, FileText, HeartPulse, MessageSquare, Wrench, X } from 'lucide-react';
import type { ExamIssue, IssueStatus } from '../../types/exam';
import { formatTaipeiDateTime } from '../../types/time';

const states = {
  pending: { label: '待處理', color: 'bg-amber-50 text-amber-900' },
  processing: { label: '處理中', color: 'bg-sky-50 text-sky-900' },
  resolved: { label: '已結案', color: 'bg-emerald-50 text-emerald-900' }
};

const replies = [
  { label: '已聯絡健康中心', message: '教務處已聯絡健康中心請求協助；到場時間待確認。', icon: HeartPulse },
  { label: '已聯絡巡堂補卷', message: '教務處已聯絡巡堂組協助補送試卷；到場時間待確認。', icon: FileText },
  { label: '已聯絡總務維修', message: '教務處已聯絡總務處請求維修；到場時間待確認。', icon: Wrench }
];

const panel = 'min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm';
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700';

function IssueBadges({ issue }: { issue: ExamIssue }) {
  const { label, color } = states[issue.status];
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
      <span className={`rounded-full px-2 py-1 ${color}`}>{label}</span>
      {issue.isUrgent && <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-900">緊急</span>}
    </span>
  );
}

export function AdminIssueDesk({
  issues, periods, periodFilter, classFilter, selected, replying, feedback,
  onPeriodChange, onClearClass, onSelect, onReply, issueLabel
}: {
  issues: ExamIssue[];
  periods: Map<string, string>;
  periodFilter: string;
  classFilter: string;
  selected?: ExamIssue;
  replying: boolean;
  feedback?: { issueId: string; error: boolean; text: string };
  onPeriodChange: (value: string) => void;
  onClearClass: () => void;
  onSelect: (id: string) => void;
  onReply: (id: string, message: string, status: IssueStatus) => void;
  issueLabel: (type: ExamIssue['type']) => string;
}) {
  const listHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const grouped = new Map<string, ExamIssue[]>();
  for (const issue of issues) {
    const key = issue.periodId ?? '';
    const group = grouped.get(key);
    if (group) group.push(issue);
    else grouped.set(key, [issue]);
  }
  const periodLabel = (issue: ExamIssue) => issue.periodId
    ? issue.periodLabel ?? periods.get(issue.periodId) ?? '已移除的考試節次'
    : '未分節的舊通報';
  const openCount = issues.filter((issue) => issue.status !== 'resolved').length;

  return (
    <div className="space-y-4">
      <header className="view-header-banner flex items-start gap-3 rounded-2xl border border-(--header-edge) p-4 sm:p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-(--header-edge) bg-white text-(--header-accent)">
          <AlertTriangle size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">考場通報</h2>
          <p className="mt-1 text-sm leading-6 text-slate-700">依節次查看案件、回覆監考老師或結案。</p>
        </div>
      </header>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(17rem,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="issue-list-title" className={`${panel} p-3 sm:p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 ref={listHeading} tabIndex={-1} id="issue-list-title" className="scroll-mt-20 text-base font-black text-slate-950">各考場通報清單</h3>
            <p role="status" className="text-xs font-bold text-slate-600">共 {issues.length} 件 <span className="ml-1 rounded-full bg-amber-50 px-2 py-1 text-amber-900">{openCount} 件未結案</span></p>
          </div>
          <label className="mt-3 block min-w-0 text-sm font-bold text-slate-700">通報節次
            <select value={periodFilter} onChange={(event) => onPeriodChange(event.target.value)}
              className={`mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-2 text-sm ${focus}`}>
              <option value="">所有節次</option>
              {[...periods].map(([id, label]) => <option key={id} value={`period:${id}`}>{label}</option>)}
              <option value="unassigned">未分節的舊通報</option>
            </select>
          </label>
          {classFilter && (
            <button type="button" onClick={onClearClass}
              className={`mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 text-sm font-bold text-violet-900 hover:bg-violet-100 ${focus}`}>
              考場 {classFilter} · 清除篩選 <X size={15} aria-hidden="true" />
            </button>
          )}
          {issues.length ? (
            <div className="mt-3 space-y-3 lg:max-h-[35rem] lg:overflow-y-auto lg:p-1">
              {[...grouped].map(([key, group]) => (
                <section key={key} className="space-y-2">
                  <h4 className="flex items-start gap-2 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-700 [overflow-wrap:anywhere]">
                    <CalendarClock size={15} className="shrink-0 text-violet-800" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{periodLabel(group[0])}</span>
                    <span className="shrink-0">{group.length} 件</span>
                  </h4>
                  <ul className="space-y-2">
                    {group.map((issue) => (
                      <li key={issue.id}>
                        <button type="button" aria-pressed={selected?.id === issue.id}
                          onClick={() => {
                            onSelect(issue.id);
                            if (window.matchMedia('(width < 64rem)').matches) detailHeading.current?.focus();
                          }}
                          className={`block w-full cursor-pointer space-y-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50 aria-pressed:border-violet-300 aria-pressed:bg-violet-50 ${focus}`}>
                          <span className="flex flex-wrap items-center justify-between gap-1.5">
                            <strong className="min-w-0 text-sm text-slate-950 [overflow-wrap:anywhere]">{issue.className}</strong>
                            <IssueBadges issue={issue} />
                          </span>
                          <span className="line-clamp-2 text-sm leading-5 text-slate-700 [overflow-wrap:anywhere]">{issue.content}</span>
                          <span className="flex items-center gap-2 text-xs text-slate-600">
                            <time dateTime={issue.createdAt} className="min-w-0 flex-1 tabular-nums">{formatTaipeiDateTime(issue.createdAt)}</time>
                            {issue.reply && <span className="shrink-0 font-bold text-violet-800">已回覆</span>}
                            <ChevronRight size={15} className="shrink-0 text-violet-800" aria-hidden="true" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-600">
            {periodFilter || classFilter ? '這個篩選範圍沒有通報。' : '目前沒有考場通報。'}
          </p>}
        </section>

        <section aria-labelledby="issue-detail-title" className={`${panel} overflow-hidden`}>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
            <h3 id="issue-detail-title" ref={detailHeading} tabIndex={-1} className="flex scroll-mt-24 items-center gap-2 text-base font-black text-slate-950">
              <MessageSquare size={18} className="text-violet-800" aria-hidden="true" />案件詳情
            </h3>
            <button type="button" onClick={() => listHeading.current?.focus()}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-violet-900 hover:bg-violet-100 lg:hidden ${focus}`}>
              <ArrowUp size={15} aria-hidden="true" />回到清單
            </button>
          </header>
          {selected ? (
            <div className="space-y-4 p-4 sm:p-5">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="min-w-0 text-xl font-black text-slate-950 [overflow-wrap:anywhere]">{selected.className}</h4>
                  <IssueBadges issue={selected} />
                </div>
                <p className="text-sm font-bold text-violet-900 [overflow-wrap:anywhere]">{periodLabel(selected)}</p>
                <p className="text-xs text-slate-600">{issueLabel(selected.type)} · <time dateTime={selected.createdAt}>{formatTaipeiDateTime(selected.createdAt)}</time></p>
              </div>
              <div className="space-y-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-600">監考老師通報</p>
                  <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-slate-950 [overflow-wrap:anywhere]">{selected.content}</p>
                </div>
                {selected.reply && <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                  <p className="text-xs font-bold text-violet-900">已傳送的回覆</p>
                  <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-violet-950 [overflow-wrap:anywhere]">{selected.reply}</p>
                </div>}
              </div>
              <div className="space-y-2.5 border-t border-slate-200 pt-4">
                <h4 className="text-sm font-black text-slate-950">回覆與結案</h4>
                <p className="text-xs leading-5 text-slate-700">請先依校內流程聯絡支援人員，再選擇回覆內容。系統只會傳送回覆給監考老師。</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {replies.map(({ label, message, icon: Icon }) => (
                    <button key={label} type="button" disabled={replying} onClick={() => onReply(selected.id, message, 'processing')}
                      className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left text-sm font-bold text-slate-800 hover:border-violet-300 hover:bg-violet-50 disabled:cursor-default disabled:opacity-50 ${focus}`}>
                      <Icon size={17} className="shrink-0 text-violet-800" aria-hidden="true" />{label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {replying && <p role="status" className="mr-auto text-sm font-bold text-violet-900">正在儲存處理結果…</p>}
                  {feedback?.issueId === selected.id && <p role={feedback.error ? 'alert' : 'status'} className={`mr-auto rounded-lg px-2.5 py-2 text-sm font-bold ${feedback.error ? 'bg-rose-50 text-rose-900' : 'bg-emerald-50 text-emerald-900'}`}>{feedback.text}</p>}
                  <button type="button" disabled={replying} onClick={() => onReply(selected.id, '教務處已確認處置完畢，紀錄於段考考務日誌。', 'resolved')}
                    className={`inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 text-sm font-bold text-white hover:bg-violet-900 disabled:cursor-default disabled:opacity-50 sm:w-auto ${focus}`}>
                    <CheckCircle2 size={17} aria-hidden="true" />處置完成（結案）
                  </button>
                </div>
              </div>
            </div>
          ) : <div className="grid min-h-44 content-center justify-items-center gap-2 p-5 text-center text-sm text-slate-600">
            <ClipboardList size={26} className="text-violet-800" aria-hidden="true" />
            {issues.length ? '從通報清單選擇案件，即可查看內容與回覆。' : '沒有案件需要查看。'}
          </div>}
        </section>
      </div>
    </div>
  );
}
