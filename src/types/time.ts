// Shared time helpers: store as ISO/UTC, display in Asia/Taipei, use server-corrected "now".
export const TAIPEI_TIME_ZONE = 'Asia/Taipei';

const fullFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TAIPEI_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
const clockFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TAIPEI_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

let offsetMs = 0;
let bestRtt = Infinity;
let sampledAt = 0;

/** Record the server clock (ms epoch) seen in a response sent at sentAt and received at receivedAt (client ms). */
export function recordServerTime(serverMs: number, sentAt: number, receivedAt: number) {
  if (!Number.isFinite(serverMs) || serverMs <= 0) return;
  const rtt = receivedAt - sentAt;
  if (!(rtt >= 0 && rtt < 15_000)) return;
  // Prefer low-latency samples, but refresh at least every 5 minutes.
  if (rtt > bestRtt * 2 + 50 && receivedAt - sampledAt < 300_000) return;
  offsetMs = serverMs + rtt / 2 - receivedAt;
  bestRtt = Math.min(bestRtt, rtt);
  sampledAt = receivedAt;
}

export const serverClockOffset = () => offsetMs;
export const serverNowMs = () => Date.now() + offsetMs;
export const serverNow = () => new Date(serverNowMs());

function toDate(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

/** "YYYY-MM-DD HH:mm:ss" in Taipei time, or fallback when invalid. */
export function formatTaipeiDateTime(value: string | number | Date | undefined, fallback = '—') {
  const date = value === undefined || value === '' ? undefined : toDate(value);
  return date ? fullFormat.format(date) : fallback;
}

/** "HH:mm:ss" in Taipei time. */
export function formatTaipeiClock(value: string | number | Date | undefined, fallback = '—') {
  const date = value === undefined || value === '' ? undefined : toDate(value);
  return date ? clockFormat.format(date) : fallback;
}

/** Calendar date "YYYY-MM-DD" in Taipei (not UTC). */
export function taipeiDateStamp(value: string | number | Date = serverNow()) {
  return formatTaipeiDateTime(value, '').slice(0, 10);
}