import type { ClassroomExamState, ExamAnnouncement } from './exam';

export function announcementStatus(announcement: ExamAnnouncement, now: number) {
  if (announcement.endsAt && Date.parse(announcement.endsAt) <= now) return 'ended';
  if (announcement.startsAt && Date.parse(announcement.startsAt) > now) return 'scheduled';
  return 'active';
}

export function announcementDisplayStart(announcement: ExamAnnouncement) {
  const published = Date.parse(announcement.publishedAt);
  return Math.max(published, Date.parse(announcement.startsAt ?? announcement.publishedAt));
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
