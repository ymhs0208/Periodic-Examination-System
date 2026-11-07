export type IssueType = 'general' | 'medical' | 'paper' | 'facility' | 'violation' | 'urgent';
export type IssueStatus = 'pending' | 'processing' | 'resolved';

export const ABSENCE_REASONS = ['病假', '事假', '喪假', '公假', '曠課'];
export const EXAM_RESET_CONFIRMATION = '刪除';
export type ExamResetScope = 'current' | 'all';
export const MIN_ADMIN_PASSWORD_LENGTH = 8;
export const MIN_TEACHER_PASSWORD_LENGTH = 12;
export function validTeacherPassword(password: unknown): password is string {
  if (typeof password !== 'string') return false;
  const value = password.trim();
  return [...value].length >= MIN_TEACHER_PASSWORD_LENGTH && value.length <= 256 &&
    !/^(.)\1+$/u.test(value) && !['password1234', '123456789012', 'qwerty123456', 'abcdefghijkl'].includes(value.toLowerCase());
}

export function publicAbsenceReason(reason: unknown): string {
  const label = typeof reason === 'string' ? reason.trim() : '';
  return ABSENCE_REASONS.includes(label) ? label : '';
}

export interface AbsentStudent {
  seatNo: number;
  name: string;
  reason: string;
}

export interface ExamIssue {
  id: string;
  classId: string;
  className: string;
  periodId?: string;
  periodLabel?: string;
  type: IssueType;
  content: string;
  status: IssueStatus;
  reply?: string;
  repliedBy?: string;
  repliedAt?: string;
  createdAt: string;
  isUrgent?: boolean;
}

export type AnnouncementType = 'correction' | 'extension' | 'notice' | 'emergency';

export interface ExamAnnouncement {
  id: string;
  type: AnnouncementType;
  subject: string;
  targetAudience: string; // 'all', 'grade_<number>', or a classroom ID
  title: string;
  content: string;
  publishedAt: string;
  startsAt?: string;
  endsAt?: string;
  publishedBy: string;
  priority: 'normal' | 'high' | 'critical';
  readByClassIds?: string[];
}

export interface CorrectionDraft {
  subject: string;
  targetAudience: string;
  title: string;
  content: string;
}

export interface CorrectionProposal extends CorrectionDraft {
  id: string;
  teacherId: string;
  teacherName: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt?: string;
  reviewNote?: string;
}

export interface ExamAuthorAssignment {
  subject: string;
  grade: number;
}

export const MAX_EXAM_AUTHOR_ASSIGNMENTS = 100;

export interface TeacherAccount {
  id: string;
  name: string;
  username: string;
  department?: string;
  examAuthorAssignments?: ExamAuthorAssignment[];
  assignedClassId?: string; // '' or undefined when unassigned, or classId like '903'
}

export type TeacherAccountInput = Partial<TeacherAccount> & { password?: string };

export interface ExamAttendance {
  expectedCount: number;
  presentCount: number;
  absentCount: number;
  absentStudents: AbsentStudent[];
  statusReported: boolean;
  lastUpdated: string;
}

export interface ClassroomExamState extends ExamAttendance {
  classId: string;
  grade: number;
  className: string;
  invigilator: string;
  invigilatorUsername?: string;
  totalSeats: number;
  periodAttendance?: Record<string, ExamAttendance>;
  periodInvigilators?: Record<string, string | null>;
  periodInvigilatorNames?: Record<string, string>;
}

export interface ExamPeriod {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  subject: string;
  grades: number[];
  classIds?: string[];
}

export interface ExamConfig {
  schoolName: string;
  academicYear: string;
  examName: string;
  examDate: string;
  subject: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  rulesNotes: string[];
  gradeLabels?: Record<number, string>;
  periods?: ExamPeriod[];
}

export interface SystemData {
  resetId?: string;
  config: ExamConfig;
  classrooms: ClassroomExamState[];
  teachers?: TeacherAccount[];
  issues: ExamIssue[];
  announcements: ExamAnnouncement[];
  correctionProposals?: CorrectionProposal[];
}

export interface ExamSession {
  role: 'admin' | 'invigilator';
  username: string;
  classId?: string;
  teacherId?: string;
  invigilation?: { classId: string; periodId: string }[];
  adminId?: string;
  canSubmitCorrections?: boolean;
  examAuthorAssignments?: ExamAuthorAssignment[];
}

export interface AdminAccount {
  id: string;
  username: string;
  enabled: boolean;
}

export interface AdminAccounts {
  currentId: string;
  accounts: AdminAccount[];
}

export function createEmptyExamState(): SystemData {
  return {
    config: {
      schoolName: '',
      academicYear: '',
      examName: '',
      examDate: '',
      subject: '',
      startTime: '',
      endTime: '',
      durationMinutes: 0,
      rulesNotes: []
    },
    classrooms: [],
    teachers: [],
    issues: [],
    announcements: []
  };
}
