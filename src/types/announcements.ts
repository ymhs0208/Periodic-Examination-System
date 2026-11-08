import type { ClassroomExamState, ExamAnnouncement, ExamPeriod } from './exam';
import { taipeiDateStamp } from './time';

export function announcementStatus(announcement: ExamAnnouncement, now: number) {
  if (announcement.endsAt && Date.parse(announcement.endsAt) <= now) return 'ended';
  if (announcement.startsAt && Date.parse(announcement.startsAt) > now) return 'scheduled';
  return 'active';
}

export function announcementDisplayStart(announcement: ExamAnnouncement) {
  const published = Date.parse(announcement.publishedAt);
  return Math.max(published, Date.parse(announcement.startsAt ?? announcement.publishedAt));
}

export function announcementsForPeriod(
  announcements: ExamAnnouncement[],
  period: ExamPeriod | undefined,
  classrooms: Pick<ClassroomExamState, 'grade' | 'classId'>[]
) {
  if (!period?.date) return [];
  const periodStart = Date.parse(`${period.date}T${period.startTime}:00+08:00`);
  const periodEnd = Date.parse(`${period.date}T${period.endTime}:00+08:00`);
  const audiences = new Set(['all', ...classrooms.flatMap((room) => [room.classId, `grade_${room.grade}`])]);
  return announcements.filter((item) => {
    const start = announcementDisplayStart(item);
    const subject = item.subject?.trim();
    if (!(start < periodEnd) || !audiences.has(item.targetAudience) ||
      (subject && subject !== period.subject.trim())) return false;
    // An open-ended notice belongs to its first display day for historical exports.
    return item.endsAt ? Date.parse(item.endsAt) > Math.max(start, periodStart) : taipeiDateStamp(start) === period.date;
  });
}

export function classroomAnnouncements(
  announcements: ExamAnnouncement[],
  classroom: Pick<ClassroomExamState, 'grade' | 'classId'>,
  now: number
) {
  const targets = ['all', `grade_${classroom.grade}`, classroom.classId];
  return announcements
    .filter((item) => targets.includes(item.targetAudience) && announcementStatus(item, now) === 'active')
    .sort((first, second) => announcementDisplayStart(second) - announcementDisplayStart(first));
}

export function nextAnnouncementBoundary(announcements: ExamAnnouncement[], now: number) {
  let next = Infinity;
  for (const { startsAt, endsAt } of announcements) {
    for (const value of [startsAt, endsAt]) {
      const time = Date.parse(value ?? '');
      if (time > now) next = Math.min(next, time);
    }
  }
  return next;
}
