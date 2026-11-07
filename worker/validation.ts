import type { SystemData } from '../src/types/exam';
import { availableGrades } from '../src/types/grades';
import { isExamDate, isExamTime } from '../src/types/examSchedule';

type Rule = (value: unknown) => boolean;
const text = (max: number, empty = false): Rule => (v) => typeof v === 'string' && v.length <= max && (empty || !!v.trim());
const integer = (min: number, max: number): Rule => (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const oneOf = (...values: unknown[]): Rule => (v) => values.includes(v);
const bool: Rule = (v) => typeof v === 'boolean';
const object: Rule = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function fields(value: Record<string, unknown>, rules: Record<string, Rule>) {
  return Object.entries(value).every(([key, v]) => Object.hasOwn(rules, key) && rules[key](v));
}
const assignment: Rule = (v) => object(v) && fields(v as Record<string, unknown>, { subject: text(100), grade: integer(1,999) });
const assignments: Rule = (v) => Array.isArray(v) && v.length <= 100 && v.every(assignment);
const teacherRules = { id: text(128), name: text(100), username: text(128), password: text(256,true), department: text(100,true), assignedClassId: text(128,true), examAuthorAssignments: assignments, expectedExamAuthorAssignments: assignments };

// Validate before any route mutates state; TypeScript types are not an HTTP boundary.
export function validateMutation(path: string, method: string, b: Record<string, unknown>, state: SystemData): string | null {
  if (method === 'GET' || method === 'HEAD') return null;
  let rules: Record<string, Rule> | undefined;
  if (path === '/api/exam/config') {
    rules = { schoolName: text(150,true), academicYear: text(50,true), examName: text(150,true), subject: text(100,true),
      examDate: (v) => typeof v === 'string' && (v === '' || isExamDate(v)), startTime: (v) => typeof v === 'string' && (v === '' || isExamTime(v)), endTime: (v) => typeof v === 'string' && (v === '' || isExamTime(v)),
      durationMinutes: integer(0,1440), rulesNotes: (v) => Array.isArray(v) && v.length <= 100 && v.every(text(500)) };
    const next = { ...state.config, ...b };
    if (next.startTime && next.endTime && String(next.startTime) >= String(next.endTime)) return '結束時間須晚於開始時間';
  } else if (path === '/api/exam/announcement') {
    rules = { type: oneOf('correction','extension','notice','emergency'), subject: text(100,true), targetAudience: (v) => typeof v === 'string' && (v === 'all' || availableGrades(state.config, state.classrooms).some(g => v === `grade_${g}`) || state.classrooms.some(r => r.classId === v)), title: text(150), content: text(3000), priority: oneOf('normal','high','critical'), publishedBy: text(100), startsAt: text(30), endsAt: text(30) };
    if (!('title' in b) || !('content' in b)) return '標題與內容皆為必填';
  } else if (path === '/api/exam/issue') {
    rules = { classId: text(128), className: text(100), type: oneOf('general','medical','paper','facility','violation','urgent'), content: text(3000), isUrgent: bool };
  } else if (/^\/api\/exam\/issue\/[^/]+$/.test(path)) {
    rules = { status: oneOf('pending','processing','resolved'), reply: text(3000,true), repliedBy: text(100) };
  } else if (/^\/api\/exam\/classroom(?:\/[^/]+)?$/.test(path)) {
    if (method === 'DELETE') {
      rules = {};
    } else {
    rules = { classId: text(128,true), grade: (v) => integer(1,999)(v) || (typeof v === 'string' && /^\d{1,3}$/.test(v) && Number(v) >= 1), className: text(100), invigilator: text(100,true), teacherId: text(128,true), expectedCount: integer(1,10000), totalSeats: integer(1,10000), expected: object };
    if (b.teacherId && !state.teachers?.some(t => t.id === b.teacherId)) return '找不到指定教師';
    const room = state.classrooms.find(r => r.classId === decodeURIComponent(path.split('/')[4] ?? '') || r.classId === b.classId);
    const count = b.expectedCount ?? room?.expectedCount ?? 30;
    if (room && typeof count === 'number' && count < room.absentCount) return '應到人數不可小於已回報缺席人數';
    if (b.totalSeats !== undefined && (Number(b.totalSeats) < Number(count) || (room?.absentStudents.some(s => s.seatNo > Number(b.totalSeats))))) return '座位數不可小於應到人數或已記錄座號';
    }
  } else if (path === '/api/exam/attendance') {
    rules = { classId: text(128), periodId: text(64), expectedPeriod: object, expectedLastUpdated: v => v === null || (typeof v === 'string' && v.length <= 30 && Number.isFinite(Date.parse(v))), expectedCount: integer(1,10000), presentCount: integer(0,10000), absentCount: integer(0,10000), absentStudents: v => Array.isArray(v) && v.length <= 10000 && v.every(s => object(s) && fields(s, { seatNo: integer(1,10000), name: text(100,true), reason: text(100,true) })) };
  } else if (path === '/api/exam/corrections') {
    rules = { subject: text(100), targetAudience: text(128), title: text(150), content: text(3000) };
  } else if (/^\/api\/exam\/corrections\/[^/]+$/.test(path)) {
    rules = { decision: oneOf('approved','rejected'), reason: text(500,true) };
  } else if (/^\/api\/exam\/announcement\/[^/]+\/read$/.test(path)) {
    rules = { classId: v => text(128)(v) && state.classrooms.some(r => r.classId === v) };
    if (!('classId' in b)) return '請選擇考場';
  } else if (path === '/api/exam/periods') {
    rules = { periods: v => Array.isArray(v) && v.length <= 200 && v.every(object), expectedPeriods: v => Array.isArray(v) && v.length <= 200 && v.every(object) };
  } else if (/^\/api\/exam\/import\/[^/]+$/.test(path)) {
    rules = { text: text(256 * 1024,true), expectedVersion: v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v) };
  } else if (/^\/api\/exam\/grades\/[^/]+$/.test(path)) {
    rules = { label: v => v === null || text(24)(v) };
  } else if (path === '/api/exam/teachers/import') {
    rules = { mode: oneOf('merge','replace'), teachers: (v) => Array.isArray(v) && v.length > 0 && v.length <= 50 && v.every(t => object(t) && fields(t, teacherRules)) };
  } else if (path === '/api/exam/teachers') {
    rules = teacherRules;
  } else if (/^\/api\/exam\/teachers\/[^/]+\/assign$/.test(path)) {
    rules = { classId: text(128,true), expected: object };
  } else if (path === '/api/exam/period-invigilators') {
    rules = { classId: text(128), periodId: text(64), teacherId: v => v === null || text(128)(v), expectedTeacherId: v => v === null || text(128)(v), expectedPeriod: object };
  } else if (/^\/api\/auth\/admins(?:\/[^/]+)?$/.test(path)) {
    rules = { username: text(128), password: text(256), enabled: bool };
  } else if (path === '/api/auth/credentials') {
    rules = { adminUser: text(128,true), adminPass: text(256,true) };
  }
  return rules && !fields(b, rules) ? '資料型別、長度、範圍或欄位有誤，請檢查輸入內容' : null;
}
