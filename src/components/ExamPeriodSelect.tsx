import { useEffect, useState } from 'react';
import type { ExamPeriod } from '../types/exam';
import { periodLabel } from '../types/examSchedule';

export function useExamClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => {
      const time = new Date();
      setNow((previous) => Math.floor(previous.getTime() / 60_000) === Math.floor(time.getTime() / 60_000) ? previous : time);
    };
    const timer = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return now;
}

export function ExamPeriodSelect({ periods, value, onChange, autoLabel }: {
  periods: ExamPeriod[];
  value: string;
  onChange: (id: string) => void;
  autoLabel: string;
}) {
  return (
    <label className="block min-w-0 max-w-lg text-sm font-bold text-slate-800">
      考試節次
      <select value={value} onChange={(event) => onChange(event.target.value)}
        className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-2 text-sm text-slate-950">
        <option value="">{autoLabel}</option>
        {periods.map((period) => <option key={period.id} value={period.id}>{periodLabel(period)}</option>)}
      </select>
    </label>
  );
}
