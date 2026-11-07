import { ArrowRight, Building2, CalendarDays, ClipboardList, DoorOpen, LayoutGrid, Monitor, UsersRound } from 'lucide-react';
import type { ClassroomExamState, ExamConfig } from '../types/exam';
import { classroomGrades, gradeLabel } from '../types/grades';

interface ClassroomPickerProps {
  board: 'blackboard' | 'attendance';
  classrooms: ClassroomExamState[];
  config: ExamConfig;
  onSelectClassroom: (classId: string) => void;
}

export function ClassroomPicker({ board, classrooms, config, onSelectClassroom }: ClassroomPickerProps) {
  const grades = classroomGrades(classrooms);
  const isBlackboard = board === 'blackboard';
  const Icon = isBlackboard ? Monitor : LayoutGrid;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-6">
      <section className="attendance-banner relative isolate overflow-hidden rounded-3xl px-5 py-7 text-white sm:px-9 sm:py-10 lg:px-12 lg:py-12">
        <div className="attendance-banner-pattern pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/3" aria-hidden="true" />
        <div className="grid items-center gap-7 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-teal-200">
              <Icon size={16} aria-hidden="true" />
              {isBlackboard ? '教室電子黑板' : '考場出席即時看板'}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">選擇班級</h1>
            <p className="mt-3 text-sm leading-7 text-slate-200 sm:text-base">
              {isBlackboard ? '選擇班級後，即可查看該班的考程、出席狀態與公告。' : '選擇班級後，即可查看該班的出席統計與缺席明細。'}
            </p>
          </div>
          <dl className="grid w-full max-w-sm gap-3 rounded-2xl border border-white/20 bg-slate-950/30 p-4 text-sm lg:min-w-60">
            <div className="flex items-center justify-between gap-4">
              <dt className="flex shrink-0 items-center gap-2 text-slate-200"><Building2 size={16} aria-hidden="true" />考場</dt>
              <dd className="font-bold"><span className="font-mono text-lg">{classrooms.length}</span> 班</dd>
            </div>
            {config.examDate && (
              <div className="flex items-center justify-between gap-4 border-t border-white/15 pt-3">
                <dt className="flex shrink-0 items-center gap-2 text-slate-200"><CalendarDays size={16} aria-hidden="true" />考試日期</dt>
                <dd className="font-mono font-bold">{config.examDate}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8" aria-labelledby="class-picker-heading">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-800">
            <UsersRound size={19} aria-hidden="true" />
          </div>
          <div>
            <h2 id="class-picker-heading" className="text-lg font-bold text-slate-950">班級列表</h2>
            <p className="mt-0.5 text-xs text-slate-600">依年級分組</p>
          </div>
        </div>

        {grades.length === 0 ? (
          <div className="mt-5 flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            <ClipboardList size={26} className="text-slate-500" aria-hidden="true" />
            <p className="mt-3 font-bold text-slate-900">目前尚未建立考場。</p>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">教務處新增考場後，班級就會出現在這裡。</p>
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {grades.map((grade) => (
              <section key={grade} aria-labelledby={`picker-grade-${grade}`}>
                <h3 id={`picker-grade-${grade}`} className="mb-2.5 break-words text-sm font-bold text-slate-700">{gradeLabel(config, grade)}</h3>
                <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {classrooms.filter((room) => room.grade === grade).map((room) => (
                    <li key={room.classId}>
                      <button
                        type="button"
                        onClick={() => onSelectClassroom(room.classId)}
                        className="group flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-teal-600 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-teal-100 group-hover:text-teal-800">
                          <DoorOpen size={17} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-bold text-slate-950">{room.className}</span>
                          <span className="block break-all font-mono text-xs text-slate-600">{room.classId}</span>
                        </span>
                        <ArrowRight size={17} className="shrink-0 text-teal-800" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
