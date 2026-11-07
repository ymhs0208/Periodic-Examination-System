import { useEffect, useState } from 'react';
import { serverNowMs } from '../types/time';

/** Server-corrected clock aligned to stepMs boundaries (no setInterval drift). */
export function useServerClock(stepMs = 1000) {
  const [now, setNow] = useState(() => new Date(serverNowMs()));
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const current = serverNowMs();
      setNow((previous) => Math.floor(previous.getTime() / stepMs) === Math.floor(current / stepMs) ? previous : new Date(current));
      timer = window.setTimeout(tick, stepMs - (current % stepMs) + 15);
    };
    tick();
    const wake = () => { window.clearTimeout(timer); tick(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [stepMs]);
  return now;
}