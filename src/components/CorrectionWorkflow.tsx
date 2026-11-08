import { useState, type FormEvent } from 'react';
import { CheckCircle2, FilePenLine, Inbox, Send, Undo2 } from 'lucide-react';
import { examSync } from '../services/examSync';
import type { CorrectionDraft, CorrectionProposal, ExamAuthorAssignment, SystemData } from '../types/exam';
import { gradeLabel } from '../types/grades';
import { useActionConfirmation } from './useActionConfirmation';

const field = 'mt-1 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950';
const primary = 'min-h-11 cursor-pointer rounded-xl bg-teal-800 px-4 text-sm font-bold text-white hover:bg-teal-900 admin-theme:bg-violet-800 admin-theme:hover:bg-violet-900 disabled:opacity-50';
const secondary = 'min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50';
const panel = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6';
const labels = { pending: '待教務審核', approved: '已核准', rejected: '已退回' };
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'short' });

function CorrectionDetails({ item, audience }: { item: CorrectionProposal; audience: string }) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-black text-slate-950 [overflow-wrap:anywhere]">{item.title}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${item.status === 'pending' ? 'bg-amber-100 text-amber-950' : item.status === 'approved' ? 'bg-teal-100 text-teal-950' : 'bg-rose-100 text-rose-950'}`}>
          {labels[item.status]}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 font-bold text-slate-700 [overflow-wrap:anywhere]">
        {item.subject} · {audience} · {dateFormat.format(new Date(item.submittedAt))}
      </p>
      <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-900 [overflow-wrap:anywhere]">{item.content}</p>
      {item.reviewNote && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-rose-900 [overflow-wrap:anywhere]">退回原因：{item.reviewNote}</p>}
    </>
  );
}

const facts = (draft: CorrectionDraft, audience: string) => [
  { label: '考科', value: draft.subject },
  { label: '顯示對象', value: audience },
  { label: '標題', value: draft.title },
  { label: '更正內容', value: draft.content }
];

const assignmentKey = ({ subject, grade }: ExamAuthorAssignment) => JSON.stringify([subject, grade]);

export function CorrectionSubmission({ data, teacherId, assignments }: {
  data: SystemData;
  teacherId?: string;
  assignments: ExamAuthorAssignment[];
}) {
  const { confirmAction, confirmationDialog } = useActionConfirmation();
  const [selection, setSelection] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const assignment = assignments.find((item) => assignmentKey(item) === selection) ??
    (assignments.length === 1 ? assignments[0] : undefined);
  const proposals = data.correctionProposals?.filter((item) => item.teacherId === teacherId) ?? [];
  const audienceLabel = (value: string) => value === 'all' ? '全校所有考場' : `${gradeLabel(data.config, Number(value.slice(6)))}全體考場`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!assignment || busy) return;
    const draft = { subject: assignment.subject, title: title.trim(), content: content.trim(), targetAudience: `grade_${assignment.grade}` };
    if (!draft.title || !draft.content) return;
    if (!await confirmAction({
      title: '確認送審試題更正',
      description: '送審後，教務核准才會對考場顯示。',
      facts: facts(draft, audienceLabel(draft.targetAudience)),
      confirmLabel: '確認送審'
    })) return;
    setBusy(true);
    setError('');
    setSent(false);
    try {
      await examSync.submitCorrection(draft);
      setTitle('');
      setContent('');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '送審失敗，請稍後再試。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wb-split">
      {confirmationDialog}
      <form onSubmit={submit} onChange={() => { setSent(false); setError(''); }}
        aria-labelledby="correction-submission-title" className="wb-panel space-y-4">
        <h2 id="correction-submission-title" className="wb-section-title">填寫更正內容</h2>
        <p className="text-sm leading-6 text-slate-700">選擇科目與年級，填寫題號和更正內容。</p>
        <label className="block min-w-0 text-sm font-bold text-slate-800">出題科目與年級
          <select required disabled={busy} className={field} value={assignment ? assignmentKey(assignment) : ''} onChange={(e) => setSelection(e.target.value)}>
            <option value="" disabled>選擇出題科目與年級</option>
            {assignments.map((item) => (
              <option key={assignmentKey(item)} value={assignmentKey(item)}>{item.subject} · {gradeLabel(data.config, item.grade)}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-800">更正標題
          <input required maxLength={150} disabled={busy} className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如 第 5 題選項更正" />
        </label>
        <label className="block text-sm font-bold text-slate-800">更正內容
          <textarea required rows={4} maxLength={3000} disabled={busy} className={field} value={content} onChange={(e) => setContent(e.target.value)} placeholder="請寫明題號及更正後的內容" />
        </label>
        <p className="wb-empty">
          {assignment ? `核准後，${audienceLabel(`grade_${assignment.grade}`)}都會看到更正，直到公告結束或教務撤回。` : '選擇年級後即可確認公告對象。'}
        </p>
        <button type="submit" disabled={busy || !assignment || !title.trim() || !content.trim()}
          className={`${primary} wb-status-button inline-flex w-full flex-wrap items-center justify-center gap-2 py-2`}>
          <Send size={17} aria-hidden="true" />
          預覽並送審
          {(busy || sent || error) && (
            <span className="wb-button-status" data-tone={sent ? 'success' : error ? 'error' : undefined}>
              {busy ? '送審中' : sent ? '已送審' : '送審失敗'}
            </span>
          )}
        </button>
        {error && <p role="alert" className="text-sm font-bold text-rose-800">{error}</p>}
        <p role="status" className="sr-only">{busy ? '正在送審' : sent ? '已送交教務審核' : ''}</p>
      </form>
      <section aria-labelledby="wb-correction-history" className="wb-panel space-y-4">
        <h2 id="wb-correction-history" className="wb-section-title">我的送審紀錄 <span className="text-sm text-slate-600">（{proposals.length} 則）</span></h2>
        {proposals.length > 0 ? (
          <ul className="space-y-3">
            {proposals.map((item) => (
              <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <CorrectionDetails item={item} audience={audienceLabel(item.targetAudience)} />
              </li>
            ))}
          </ul>
        ) : <p className="wb-empty">目前沒有送審紀錄。送出後，可在這裡查看教務審核結果。</p>}
      </section>
    </div>
  );
}

export function CorrectionReview({ proposals, audienceLabel }: {
  proposals: CorrectionProposal[];
  audienceLabel: (value: string) => string;
}) {
  const { confirmAction, confirmationDialog } = useActionConfirmation();
  const [rejectId, setRejectId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  const pending = proposals.filter((item) => item.status === 'pending');
  const reviewed = proposals.filter((item) => item.status !== 'pending');

  async function review(item: CorrectionProposal, decision: 'approved' | 'rejected') {
    const rejecting = decision === 'rejected';
    const reviewNote = rejecting ? reason.trim() : undefined;
    if (busy || (rejecting && !reviewNote)) return;
    if (!await confirmAction({
      title: rejecting ? '確認退回試題更正' : '確認核准並發布試題更正',
      description: rejecting ? '出題老師會看到退回原因。' : '核准後會立即顯示在所選考場。',
      facts: [
        { label: '送審教師', value: item.teacherName },
        ...facts(item, audienceLabel(item.targetAudience)),
        ...(reviewNote ? [{ label: '退回原因', value: reviewNote }] : [])
      ],
      confirmLabel: rejecting ? '確認退回' : '核准並發布',
      danger: rejecting
    })) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      await examSync.reviewCorrection(item.id, decision, reviewNote);
      setRejectId('');
      setReason('');
      setFeedback({ error: false, text: rejecting ? '已退回，出題老師可查看原因。' : '已核准並發布至所選考場。' });
    } catch (err) {
      setFeedback({ error: true, text: err instanceof Error ? err.message : '審核失敗，請稍後再試。' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${panel} shadow-sm`} aria-labelledby="correction-review-title">
      {confirmationDialog}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="min-w-0">
          <h3 id="correction-review-title" className="flex items-center gap-2 text-lg font-black text-slate-950">
            <FilePenLine size={20} className="shrink-0 text-violet-800" aria-hidden="true" />待審的試題更正
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">核對題號、內容與對象。核准後會立即發布。</p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-950">{pending.length} 筆待審</span>
      </div>
      {feedback && <p role={feedback.error ? 'alert' : 'status'} className={`mt-3 rounded-xl p-3 text-sm font-bold ${feedback.error ? 'bg-rose-50 text-rose-900' : 'bg-emerald-50 text-emerald-900'}`}>{feedback.text}</p>}
      {pending.length ? (
        <ul className="mt-4 grid gap-3 xl:grid-cols-2">
          {pending.map((item) => (
            <li key={item.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-sm font-bold text-violet-900 [overflow-wrap:anywhere]">送審教師 · {item.teacherName}</p>
              <CorrectionDetails item={item} audience={audienceLabel(item.targetAudience)} />
              {rejectId === item.id ? (
                <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void review(item, 'rejected'); }}>
                  <label className="block text-sm font-bold text-slate-800">退回原因
                    <textarea required rows={2} maxLength={500} disabled={busy} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button disabled={busy || !reason.trim()} type="submit" className={primary}>核對退回內容</button>
                    <button disabled={busy} type="button" className={secondary} onClick={() => setRejectId('')}>取消退回</button>
                  </div>
                </form>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button disabled={busy} type="button" className={`${primary} inline-flex items-center gap-1.5`} onClick={() => void review(item, 'approved')}>
                    <CheckCircle2 size={16} aria-hidden="true" />核對並核准
                  </button>
                  <button disabled={busy} type="button" className={`${secondary} inline-flex items-center gap-1.5`} onClick={() => { setRejectId(item.id); setReason(''); }}>
                    <Undo2 size={16} aria-hidden="true" />退回
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700"><Inbox size={19} aria-hidden="true" />目前沒有待審的試題更正。</p>}
      {reviewed.length > 0 && (
        <details className="mt-4 rounded-xl border border-slate-200 px-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-slate-800">已審核紀錄（{reviewed.length} 筆）</summary>
          <ul className="grid gap-3 pb-3 xl:grid-cols-2">
            {reviewed.map((item) => (
              <li key={item.id} className="rounded-xl border border-slate-200 p-3">
                <p className="mb-1 text-xs font-bold text-violet-900 [overflow-wrap:anywhere]">送審教師 · {item.teacherName}</p>
                <CorrectionDetails item={item} audience={audienceLabel(item.targetAudience)} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
