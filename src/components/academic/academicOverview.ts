import type { ClassroomExamState, ExamPeriod, SystemData } from '../../types/exam';
import { activePeriod, classroomForPeriod, comparePeriods, examPeriods, periodApplies, taipeiDateTime } from '../../types/examSchedule';

export type RoomPhase = 'active' | 'upcoming' | 'ended' | 'none';
export interface AcademicRoom {
  room: ClassroomExamState;
  period?: ExamPeriod;
  periodNumber?: number;
  phase: RoomPhase;
  missing: boolean;
  highAbsence: boolean;
  urgentIssues: number;
  openIssues: number;
  priority: number;
}

// Projection contains aggregate counts only: never render student names, seats,
// absence reasons, issue contents, or account information.
export function academicOverview(data: SystemData, now: Date) {
  const [today, time] = taipeiDateTime.format(now).split(' ');
  const periods = examPeriods(data.config).slice().sort(comparePeriods);
  const rooms: AcademicRoom[] = data.classrooms.map((base) => {
    const todays = periods.filter((period) => period.date === today && periodApplies(period, base));
    const period = activePeriod(todays, now) ?? todays.find((item) => item.startTime > time) ?? todays.at(-1);
    const phase: RoomPhase = !period ? 'none' : time < period.startTime ? 'upcoming' : time >= period.endTime ? 'ended' : 'active';
    const room = classroomForPeriod(base, period);
    const missing = !!period && phase !== 'upcoming' && !room.statusReported;
    const highAbsence = !!period && room.statusReported && room.absentCount > 0 &&
      (room.absentCount >= 3 || (room.expectedCount > 0 && room.absentCount / room.expectedCount >= 0.1));
    // Unresolved issues are a daily safety summary across periods.
    const issues = data.issues.filter((issue) => issue.classId === base.classId && issue.status !== 'resolved' &&
      Number.isFinite(Date.parse(issue.createdAt)) && taipeiDateTime.format(new Date(issue.createdAt)).split(' ')[0] === today);
    const urgentIssues = issues.filter((issue) => issue.isUrgent || issue.type === 'urgent').length;
    const priority = urgentIssues ? 0 : missing ? 1 : highAbsence ? 2 : issues.length ? 3 :
      period && room.statusReported && room.absentCount > 0 ? 4 : phase === 'active' ? 5 : phase === 'upcoming' ? 6 : 7;
    return { room, period, periodNumber: period ? todays.indexOf(period) + 1 : undefined,
      phase, missing, highAbsence, urgentIssues, openIssues: issues.length, priority };
  }).sort((a, b) => a.priority - b.priority || b.room.absentCount - a.room.absentCount ||
    a.room.grade - b.room.grade || a.room.className.localeCompare(b.room.className, 'zh-TW', { numeric: true }) ||
    a.room.classId.localeCompare(b.room.classId));
  const scheduled = rooms.filter((item) => item.period);
  const reported = scheduled.filter((item) => item.room.statusReported);
  const missing = rooms.filter((item) => item.missing);
  return {
    today, rooms,
    totals: {
      total: rooms.length, scheduled: scheduled.length, active: rooms.filter((item) => item.phase === 'active').length,
      reported: reported.length, missing: missing.length,
      unknownPeople: missing.reduce((sum, item) => sum + item.room.expectedCount, 0),
      present: reported.reduce((sum, item) => sum + item.room.presentCount, 0),
      absent: reported.reduce((sum, item) => sum + item.room.absentCount, 0),
      highAbsence: rooms.filter((item) => item.highAbsence).length,
      urgent: rooms.filter((item) => item.urgentIssues).length,
      openIssues: rooms.reduce((sum, item) => sum + item.openIssues, 0),
    }
  };
}

export function academicStatus(item: AcademicRoom) {
  if (item.urgentIssues) return '緊急通報';
  if (item.missing) return item.phase === 'ended' ? '已結束・未回報' : '未回報';
  if (item.highAbsence) return '缺席偏高';
  if (item.openIssues) return '通報待處理';
  if (!item.period) return '今日無考程';
  if (item.phase === 'upcoming') return item.room.statusReported ? '未開始・已回報' : '未開始';
  if (item.phase === 'ended') return '已結束・已回報';
  return item.room.absentCount > 0 ? '已回報・有缺席' : '已回報・全員到齊';
}
