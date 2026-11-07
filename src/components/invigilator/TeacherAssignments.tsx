import { serverNow } from '../../types/time';
import { ArrowRight, CalendarDays, ClipboardList, DoorOpen } from 'lucide-react';
import { useId } from 'react';
import type { ClassroomExamState, ExamConfig, ExamPeriod } from '../../types/exam';
import { classroomForPeriod, periodLabel, taipeiDateTime } from '../../types/examSchedule';
import { gradeLabel } from '../../types/grades';

export function TeacherAssignments({ classroom, config, periods = [], now, onSelectPeriod, heading = 'h1' }: {
  classroom?: ClassroomExamState;
  config: ExamConfig;
  periods?: ExamPeriod[];
  now?: Date;
  onSelectPeriod?: (id: string) => void;
  heading?: 'h1' | 'h2';
}) {
  const Title = heading;
  const titleId = useId();
  const Subtitle = heading === 'h1' ? 'h2' : 'h3';
  const DayTitle = heading === 'h1' ? 'h3' : 'h4';
  const [today, time] = taipeiDateTime.format(now ?? serverNow()).split(' ');
  const byDate = new Map<string, ExamPeriod[]>();
  for (const period of periods) {
    const day = byDate.get(period.date);
    if (day) day.push(period);
    else byDate.set(period.date, [period]);
  }

  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="attendance-banner relative isolate flex flex-wrap items-center justify-between gap-3 px-4 py-5 text-white sm:px-6">
        <div className="attendance-banner-pattern pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold text-teal-100"><ClipboardList size={16} aria-hidden="true" />教師工作台</p>
          <Title id={titleId} tabIndex={-1} className="mt-1 scroll-mt-4 text-xl font-black sm:text-2xl">我的監考安排</Title>
          {config.examName && <p className="mt-1 text-sm text-slate-100 [overflow-wrap:anywhere]">{config.examName}</p>}
        </div>
        {classroom && (
          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/25 bg-slate-950/25 px-3 py-2">
            <DoorOpen size={18} className="shrink-0 text-teal-100" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-teal-100">指派考場</p>
              <p className="text-sm font-black [overflow-wrap:anywhere]">{classroom.className}（{classroom.classId}）</p>
            </div>
          </div>
        )}
      </header>

      {!classroom ? (
        <p className="p-4 text-sm leading-6 text-slate-700 sm:px-6">目前尚未指派監考考場。教務處完成指派後，這裡會顯示你的監考安排。</p>
      ) : (
        <div className="p-4 sm:p-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
            <Subtitle className="text-base font-black text-slate-950">監考節次</Subtitle>
            <p className="text-xs font-bold text-slate-600">{gradeLabel(config, classroom.grade)} · 共 {periods.length} 節 · 台灣時間</p>
          </div>
          {periods.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">此考場目前沒有已設定的考試節次。</p>
          ) : (
            <div className="max-h-96 space-y-4 overflow-y-auto p-1">
              {[...byDate].map(([date, day]) => (
                <div key={date} className="space-y-2">
                  <DayTitle className="flex items-center gap-2 text-sm font-black text-teal-900">
                    <CalendarDays size={16} aria-hidden="true" />
                    <time dateTime={date}>{date}</time>{date === today && <span className="text-xs text-slate-700">今天</span>}
                  </DayTitle>
                  <ul className="space-y-2">
                    {day.map((period) => {
                      const ongoing = date === today && period.startTime <= time && time < period.endTime;
                      const ended = date < today || (date === today && period.endTime <= time);
                      const reported = classroomForPeriod(classroom, period).statusReported;
                      return (
                        <li key={period.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${ongoing ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}>
                          <div className="min-w-0">
                            <p className="font-black text-slate-950 [overflow-wrap:anywhere]">{period.subject}</p>
                            <p className="mt-0.5 font-mono text-sm font-bold text-slate-700">{period.startTime}–{period.endTime}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-xs font-bold ${ongoing ? 'bg-teal-100 text-teal-950' : 'bg-white text-slate-700'}`}>
                              {ongoing ? '進行中' : ended ? '已結束' : '未開始'}
                            </span>
                            {reported && <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-teal-900">已回報</span>}
                            {onSelectPeriod && (
                              <button type="button" onClick={() => onSelectPeriod(period.id)}
                                aria-label={`前往點名，${periodLabel(period)}`}
                                className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-lg border border-teal-200 bg-white px-2.5 text-xs font-bold text-teal-900 hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-teal-700">
                                前往點名<ArrowRight size={15} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
