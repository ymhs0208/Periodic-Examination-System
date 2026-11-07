import { useServerClock } from './useServerClock';
import type { ExamPeriod } from '../types/exam';
import { periodLabel } from '../types/examSchedule';

export function useExamClock() {
  return useServerClock(60_000);
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
      <select disabled={!periods.length} value={value} onChange={(event) => onChange(event.target.value)}
        className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-2 text-sm text-slate-950">
        <option value="">{autoLabel}</option>
        {periods.map((period) => <option key={period.id} value={period.id}>{periodLabel(period)}</option>)}
      </select>
    </label>
  );
}
