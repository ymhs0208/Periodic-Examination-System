import type { ExamSession } from './exam';

export const auditActions = {
  login: '登入',
  loginFailed: '登入失敗',
  rateLimited: '安全限流',
  accessDenied: '拒絕授權',
  reauthenticate: '重新驗證',
  logout: '登出',
  adminCreate: '新增管理員',
  adminUpdate: '更新管理員設定',
  teacherSave: '儲存教師帳號與出題指派',
  teacherImport: '匯入教師名冊',
  teacherDelete: '移除教師帳號',
  invigilation: '調整監考指派',
  attendance: '回報考場點名',
  classroom: '儲存考場班級',
  issueReport: '提交考場通報',
  issueUpdate: '處理考場通報',
  correctionSubmit: '送審試題更正',
  correctionApprove: '核准並發布試題更正',
  correctionReject: '退回試題更正',
  announcementPublish: '發布考務公告',
  announcementDelete: '撤回考務公告',
  examSettings: '更新考務設定',
  schedule: '儲存考程表',
  grade: '調整年級設定',
  csvImport: '匯入 CSV'
} as const;

export type AuditAction = keyof typeof auditActions;

export type AuditLogEntry = {
  id: number;
  occurredAt: number;
  actor: string;
  role: ExamSession['role'];
  action: AuditAction;
  target: string | null;
};

export interface AuditLogPage {
  entries: AuditLogEntry[];
  nextBefore: number | null;
}
