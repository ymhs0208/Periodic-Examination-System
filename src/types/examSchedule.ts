import type { ClassroomExamState, ExamConfig, ExamPeriod, SystemData, TeacherAccount } from './exam';

export const LEGACY_PERIOD_ID = 'legacy';
export const taipeiDateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'short'
});

export function isExamDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export const isExamTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export function examPeriods(config: ExamConfig): ExamPeriod[] {
  if (config.periods) return config.periods;
  if (!config.subject?.trim() || !isExamDate(config.examDate) || !isExamTime(config.startTime) ||
    !isExamTime(config.endTime) || config.startTime >= config.endTime) return [];
  return [{
    id: LEGACY_PERIOD_ID, date: config.examDate, subject: config.subject,
    startTime: config.startTime, endTime: config.endTime, grades: []
  }];
}

export function scheduledExamSubjects(config: ExamConfig): string[] {
  return [...new Set(examPeriods(config).map((period) => period.subject.trim()).filter(Boolean))];
}

export function periodApplies(period: ExamPeriod, room: Pick<ClassroomExamState, 'classId' | 'grade'>) {
  if (period.classIds?.length) return period.classIds.includes(room.classId);
  return !period.grades.length || period.grades.includes(room.grade);
}

export function invigilatorForPeriod(room: ClassroomExamState, periodId: string, teachers: TeacherAccount[]) {
  const override = room.periodInvigilators?.[periodId];
  return override === undefined
    ? teachers.find((teacher) => teacher.assignedClassId === room.classId)
    : teachers.find((teacher) => teacher.id === override);
}

export function periodScopesOverlap(first: ExamPeriod, second: ExamPeriod, classrooms: ClassroomExamState[]) {
  if (first.classIds?.length || second.classIds?.length) {
    return classrooms.some((room) => periodApplies(first, room) && periodApplies(second, room));
  }
  return !first.grades.length || !second.grades.length || first.grades.some((grade) => second.grades.includes(grade));
}

export function periodTimesOverlap(first: ExamPeriod, second: ExamPeriod) {
  return first.date === second.date && first.startTime < second.endTime && second.startTime < first.endTime;
}

export function invigilationConflicts(data: SystemData) {
  const periods = examPeriods(data.config);
  const assignments = new Map<string, { room: ClassroomExamState; period: ExamPeriod }[]>();
  for (const room of data.classrooms) {
    for (const period of periods.filter((item) => periodApplies(item, room))) {
      const teacher = invigilatorForPeriod(room, period.id, data.teachers ?? []);
      if (!teacher) continue;
      const slots = assignments.get(teacher.id) ?? [];
      slots.push({ room, period });
      assignments.set(teacher.id, slots);
    }
  }
  const conflicts = new Map<string, string>();
  for (const [teacherId, slots] of assignments) {
    for (const [index, first] of slots.entries()) {
      for (const second of slots.slice(index + 1)) {
        if (first.room.classId === second.room.classId || !periodTimesOverlap(first.period, second.period)) continue;
        const key = JSON.stringify([teacherId, first.room.classId, first.period.id, second.room.classId, second.period.id]);
        conflicts.set(key, `${first.room.className} 與 ${second.room.className} 的監考指派時段重疊`);
      }
    }
  }
  return conflicts;
}

export function comparePeriods(first: ExamPeriod, second: ExamPeriod) {
  return first.date.localeCompare(second.date) || first.startTime.localeCompare(second.startTime) ||
    first.endTime.localeCompare(second.endTime) || first.subject.localeCompare(second.subject, 'zh-TW');
}

export function activePeriod(periods: ExamPeriod[], now: Date) {
  const [date, time] = taipeiDateTime.format(now).split(' ');
  return periods.find((period) => period.date === date && period.startTime <= time && time < period.endTime);
}

export function preferredPeriod(periods: ExamPeriod[], now: Date) {
  const [date, time] = taipeiDateTime.format(now).split(' ');
  return activePeriod(periods, now) ??
    periods.filter((period) => period.date === date && period.startTime <= time).at(-1) ??
    periods.find((period) => period.date >= date) ?? periods.at(-1);
}

export function periodLabel(period: ExamPeriod) {
  if (!period.date) return '未分節的舊點名紀錄';
  return `${period.date}　${period.startTime}–${period.endTime}　${period.subject}`;
}

export function classroomForPeriod(room: ClassroomExamState, period?: ExamPeriod, useLegacy = false): ClassroomExamState {
  const record = period && room.periodAttendance?.[period.id];
  const invigilator = period ? room.periodInvigilatorNames?.[period.id] ?? room.invigilator : room.invigilator;
  if (record) return { ...room, ...record, invigilator };
  if (useLegacy || period?.id === LEGACY_PERIOD_ID) return { ...room, invigilator };
  return { ...room, invigilator, presentCount: 0, absentCount: 0, absentStudents: [], statusReported: false };
}

export function configForPeriod(config: ExamConfig, period: ExamPeriod): ExamConfig {
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return {
    ...config, examDate: period.date, subject: period.subject, startTime: period.startTime,
    endTime: period.endTime, durationMinutes: minutes(period.endTime) - minutes(period.startTime)
  };
}

export function dataForPeriod(data: SystemData, period?: ExamPeriod): SystemData {
  const useLegacy = data.config.periods === undefined && examPeriods(data.config).length === 0;
  return {
    ...data,
    config: period?.date ? configForPeriod(data.config, period) : data.config,
    classrooms: data.classrooms
      .filter((room) => !period || periodApplies(period, room) || !!room.periodAttendance?.[period.id])
      .map((room) => classroomForPeriod(room, period, useLegacy))
  };
}

export function reportingPeriods(data: SystemData): ExamPeriod[] {
  const periods = examPeriods(data.config);
  if (data.config.periods === undefined || periods.some((period) => period.id === LEGACY_PERIOD_ID) ||
    !data.classrooms.some((room) => room.statusReported)) return periods;
  return [...periods, { id: LEGACY_PERIOD_ID, date: '', startTime: '', endTime: '', subject: '', grades: [] }];
}
