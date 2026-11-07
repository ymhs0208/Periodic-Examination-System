import type { AuditAction } from '../src/types/audit';
import { examImports, type ExamImportKind } from '../src/types/examImports';

const routes: [RegExp, AuditAction][] = [
  [/^POST \/api\/exam\/teachers\/import$/, 'teacherImport'],
  [/^POST \/api\/exam\/teachers$/, 'teacherSave'],
  [/^DELETE \/api\/exam\/teachers\/([^/]+)$/, 'teacherDelete'],
  [/^PATCH \/api\/exam\/teachers\/([^/]+)\/assign$/, 'invigilation'],
  [/^PATCH \/api\/exam\/period-invigilators$/, 'invigilation'],
  [/^POST \/api\/exam\/attendance$/, 'attendance'],
  [/^(?:POST \/api\/exam\/classroom|PATCH \/api\/exam\/classroom\/([^/]+))$/, 'classroom'],
  [/^POST \/api\/exam\/issue$/, 'issueReport'],
  [/^PATCH \/api\/exam\/issue\/([^/]+)$/, 'issueUpdate'],
  [/^POST \/api\/exam\/corrections$/, 'correctionSubmit'],
  [/^PATCH \/api\/exam\/corrections\/([^/]+)$/, 'correctionApprove'],
  [/^POST \/api\/exam\/announcement$/, 'announcementPublish'],
  [/^DELETE \/api\/exam\/announcement\/([^/]+)$/, 'announcementDelete'],
  [/^PATCH \/api\/exam\/config$/, 'examSettings'],
  [/^PATCH \/api\/exam\/periods$/, 'schedule'],
  [/^PATCH \/api\/exam\/grades\/([^/]+)$/, 'grade'],
  [/^POST \/api\/exam\/import\/(schedule|grades|classrooms|invigilation)$/, 'csvImport']
];

function identifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const decoded = decodeURIComponent(value);
    return /^[\p{L}\p{N}_-]{1,100}$/u.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function examAuditOperation(method: string, path: string, body: Record<string, unknown>) {
  const request = `${method} ${path}`;
  for (const [pattern, action] of routes) {
    const match = pattern.exec(request);
    if (!match) continue;
    if (action === 'csvImport') return { action, target: examImports[match[1] as ExamImportKind].title };
    const classId = ['classroom', 'invigilation', 'attendance', 'issueReport'].includes(action)
      ? identifier(body.classId) : null;
    const periodId = action === 'attendance' || action === 'invigilation' ? identifier(body.periodId) : null;
    const target = [identifier(match[1]) ?? classId ?? (action === 'teacherSave' ? identifier(body.id) : null), periodId]
      .filter(Boolean).join(' · ');
    return { action: action === 'correctionApprove' && body.decision === 'rejected' ? 'correctionReject' as const : action, target: target || null };
  }
}

export function auditExpiry(occurredAt: number): number {
  const taipeiOffset = 8 * 60 * 60 * 1000;
  const taipei = new Date(occurredAt + taipeiOffset);
  const day = taipei.getUTCDate();
  taipei.setUTCMonth(taipei.getUTCMonth() + 3, 1);
  const lastDay = new Date(Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth() + 1, 0)).getUTCDate();
  taipei.setUTCDate(Math.min(day, lastDay));
  return taipei.getTime() - taipeiOffset;
}
