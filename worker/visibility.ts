import type { AbsentStudent, ClassroomExamState, ExamIssue, ExamSession, SystemData } from '../src/types/exam';
import { publicAbsenceReason } from '../src/types/exam';
import { examPeriods, LEGACY_PERIOD_ID } from '../src/types/examSchedule';
import { announcementStatus } from '../src/types/announcements';
import { adminState, type StoredExamState } from './passwords';

export function publicAbsences(students: AbsentStudent[]) {
  return students.map(({ seatNo, reason }) => ({
    seatNo, name: '', reason: publicAbsenceReason(reason)
  }));
}

export function canAccessRoom(session: ExamSession | null, classId: string) {
  return session?.role === 'admin' || session?.classId === classId || session?.invigilation?.some((item) => item.classId === classId);
}

export function canAccessPeriod(session: ExamSession | null, classId: string, periodId: string) {
  return session?.role === 'admin' || session?.invigilation?.some((item) => item.classId === classId && item.periodId === periodId);
}

export function visibleClassroom(classroom: ClassroomExamState, session: ExamSession | null, state: SystemData) {
  const periodInvigilatorNames = classroom.periodInvigilators && Object.fromEntries(
    Object.entries(classroom.periodInvigilators).map(([periodId, teacherId]) => [
      periodId, state.teachers?.find((teacher) => teacher.id === teacherId)?.name ?? '待指派監考老師'
    ])
  );
  if (session?.role === 'admin') return { ...classroom, periodInvigilatorNames };
  const periodAttendance = classroom.periodAttendance && Object.fromEntries(
    Object.entries(classroom.periodAttendance).map(([id, record]) => [
      id, canAccessPeriod(session, classroom.classId, id) ? record : { ...record, absentStudents: publicAbsences(record.absentStudents) }
    ])
  );
  return {
    ...classroom,
    absentStudents: canAccessPeriod(session, classroom.classId, LEGACY_PERIOD_ID) ||
      (session?.classId === classroom.classId && !examPeriods(state.config).length)
      ? classroom.absentStudents : publicAbsences(classroom.absentStudents),
    periodAttendance,
    periodInvigilators: undefined,
    periodInvigilatorNames,
    invigilatorUsername: undefined
  };
}

export function visibleIssue(issue: ExamIssue, session: ExamSession | null) {
  return issue.periodId ? canAccessPeriod(session, issue.classId, issue.periodId) : canAccessRoom(session, issue.classId);
}

export function activeAnnouncements(state: SystemData, now: number) {
  return state.announcements.filter((item) => announcementStatus(item, now) === 'active');
}

export function visibleState(state: StoredExamState, session: ExamSession | null): SystemData {
  const classrooms = state.classrooms.map((room) => visibleClassroom(room, session, state));
  if (session?.role === 'admin') return { ...adminState(state), classrooms };
  return {
    ...state,
    teachers: [],
    correctionProposals: session?.canSubmitCorrections
      ? state.correctionProposals?.filter((item) => item.teacherId === session.teacherId)
      : [],
    classrooms,
    issues: state.issues.filter((issue) => visibleIssue(issue, session)),
    announcements: activeAnnouncements(state, Date.now())
  };
}
