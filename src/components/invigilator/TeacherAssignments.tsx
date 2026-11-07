import { serverNow } from '../../types/time';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import { useId } from 'react';
import type { ClassroomExamState, ExamConfig, ExamPeriod } from '../../types/exam';
import { classroomForPeriod, periodLabel, taipeiDateTime } from '../../types/examSchedule';
import { gradeLabel } from '../../types/grades';

export function TeacherAssignments({ classroom, config, periods = [], now, onSelectPeriod }: {
  classroom?: ClassroomExamState;
  config: ExamConfig;
  periods?: ExamPeriod[];
  now?: Date;
  onSelectPeriod?: (id: string) => void;
}) {
  const titleId = useId();
  const [today, time] = taipeiDateTime.format(now ?? serverNow()).split(' ');
  const byDate = new Map<string, ExamPeriod[]>();
  for (const period of periods) {
    const day = byDate.get(period.date);
    if (day) day.push(period);
    else byDate.set(period.date, [period]);
  }

  return (
    <section aria-labelledby={titleId} className="wb-panel space-y-4">
      {!classroom ? (
        <>
          <h2 id={titleId} className="wb-section-title">監考節次</h2>
          <p className="wb-empty">目前尚未指派監考考場。教務處完成指派後，這裡會顯示你的監考安排。</p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={titleId} className="wb-section-title flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]"><MapPin size={20} className="shrink-0 text-teal-800" aria-hidden="true" /><span className="min-w-0">{classroom.className}</span></h2>
            <p className="rounded-full bg-teal-50 px-3 py-1 text-sm font-bold text-teal-950">{gradeLabel(config, classroom.grade)} · 共 {periods.length} 節</p>
          </div>
          {periods.length === 0 ? (
            <p className="wb-empty">此考場目前沒有已設定的考試節次。</p>
          ) : (
            <div className="space-y-5">
              {[...byDate].map(([date, day]) => (
                <div key={date} className="space-y-2">
                  <h3 className="flex items-center gap-2 border-b border-slate-200 pb-2 text-sm font-black text-teal-900">
                    <CalendarDays size={16} aria-hidden="true" />
                    <time dateTime={date}>{date}</time>{date === today && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs">今天</span>}
                  </h3>
                  <ul className="space-y-2">
                    {day.map((period) => {
                      const ongoing = date === today && period.startTime <= time && time < period.endTime;
                      const ended = date < today || (date === today && period.endTime <= time);
                      const reported = classroomForPeriod(classroom, period).statusReported;
                      return (
                        <li key={period.id} className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4 ${ongoing ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}>
                          <div className="min-w-0">
                            <p className="font-black text-slate-950 [overflow-wrap:anywhere]">{period.subject}</p>
                            <p className="mt-0.5 font-mono text-sm font-bold text-slate-700">{period.startTime}–{period.endTime}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-xs font-bold ${ongoing ? 'bg-teal-100 text-teal-950' : 'bg-white text-slate-700'}`}>
                              {ongoing ? '進行中' : ended ? '已結束' : '未開始'}
                            </span>
                            {onSelectPeriod ? (
                              <button type="button" onClick={() => onSelectPeriod(period.id)}
                                aria-label={`前往點名，${periodLabel(period)}，${reported ? '已回報' : '尚未回報'}`}
                                className="inline-flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-teal-200 bg-white px-2.5 py-1 text-sm font-bold text-teal-900 hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-teal-700">
                                前往點名
                                <span className="wb-button-status" data-tone={reported ? 'success' : undefined}>{reported ? '已回報' : '尚未回報'}</span>
                                <ArrowRight size={15} aria-hidden="true" />
                              </button>
                            ) : reported && <span className="wb-button-status" data-tone="success">已回報</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
