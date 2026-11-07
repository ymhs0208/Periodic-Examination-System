import { serverNowMs } from '../types/time';
import { useEffect, useState } from 'react';
import { nextAnnouncementBoundary } from '../types/announcements';
import type { ExamAnnouncement } from '../types/exam';

export function useAnnouncementClock(announcements: ExamAnnouncement[], enabled = true) {
  const [tick, setTick] = useState(0);
  const now = serverNowMs();
  const boundary = enabled ? nextAnnouncementBoundary(announcements, now) : Infinity;

  useEffect(() => {
    if (!Number.isFinite(boundary)) return;
    const refresh = () => setTick((value) => value + 1);
    const timer = window.setTimeout(refresh, Math.min(2_147_483_647, Math.max(0, boundary - serverNowMs())));
    return () => window.clearTimeout(timer);
  }, [boundary, tick]);

  return now;
}
