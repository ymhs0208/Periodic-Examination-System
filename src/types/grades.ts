import type { ClassroomExamState, ExamConfig } from './exam';

export const DEFAULT_GRADE_LABELS: Record<number, string> = {
  7: '7 年級',
  8: '8 年級',
  9: '9 年級'
};

export function gradeLabel(config: ExamConfig, grade: number) {
  return config.gradeLabels?.[grade] ?? `${grade} 年級`;
}

export function classroomGrades(classrooms: Pick<ClassroomExamState, 'grade'>[]) {
  return [...new Set(classrooms.map((classroom) => classroom.grade))].sort((a, b) => a - b);
}

export function availableGrades(config: ExamConfig, classrooms: Pick<ClassroomExamState, 'grade'>[]) {
  const configured = Object.keys(config.gradeLabels ?? DEFAULT_GRADE_LABELS).map(Number);
  return [...new Set([...configured, ...classroomGrades(classrooms)])].sort((a, b) => a - b);
}
