import { examImports, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, type ExamImportKind, type ExamImportRow } from '../src/types/examImports';
import type { ExamPeriod, SystemData } from '../src/types/exam';
import { comparePeriods, examPeriods, invigilatorForPeriod, invigilationConflicts, isExamDate, isExamTime, periodApplies, periodLabel, periodScopesOverlap, periodTimesOverlap } from '../src/types/examSchedule';
import { availableGrades, DEFAULT_GRADE_LABELS, gradeLabel } from '../src/types/grades';

export class ExamImportError extends Error {}
type CsvRow = { line: number; cells: string[] };

function csvRows(text: string): CsvRow[] {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new ExamImportError('CSV 檔案須小於 256 KB');
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows: CsvRow[] = [];
  let line = 1;
  let start = 1;
  let cells: string[] = [];
  let value = '';
  let quoted = false;
  let closed = false;
  for (let index = 0; index <= source.length; index++) {
    const char = index === source.length ? '\n' : source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else {
        value += char;
        if (char === '\n') line++;
      }
    } else if (char === ',' || char === '\n') {
      cells.push(value.trim());
      value = '';
      closed = false;
      if (char === '\n') {
        if (cells.length > 1 || cells[0]) rows.push({ line: start, cells });
        if (rows.length > MAX_IMPORT_ROWS + 1) throw new ExamImportError(`一次最多匯入 ${MAX_IMPORT_ROWS} 筆資料`);
        cells = [];
        start = ++line;
      }
    } else if (char === '"' && !value && !closed) {
      quoted = true;
    } else if (char === '"' || closed) {
      throw new ExamImportError(`第 ${line} 列的引號格式有誤`);
    } else {
      value += char;
    }
  }
  if (quoted) throw new ExamImportError(`第 ${start} 列的引號未關閉`);
  return rows;
}

function invalid(line: number, message: string): never {
  throw new ExamImportError(`第 ${line} 列 · ${message}`);
}

function unique(seen: Set<string>, key: string, line: number, label: string) {
  if (seen.has(key)) invalid(line, `${label}重複`);
  seen.add(key);
}

function positiveInteger(value: string, max: number) {
  const number = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(number) && number >= 1 && number <= max ? number : undefined;
}

function list(value: string) {
  return [...new Set(value.split(/[;；、,]/).map((item) => item.trim()).filter(Boolean))];
}

function importSchedule(state: SystemData, rows: CsvRow[]): ExamImportRow[] {
  const knownGrades = availableGrades(state.config, state.classrooms);
  const classIds = new Set(state.classrooms.map((room) => room.classId));
  const periods = [...examPeriods(state.config)];
  const scopeKey = (item: ExamPeriod) => JSON.stringify([[...item.grades].sort(), [...(item.classIds ?? [])].sort()]);
  const result = rows.map(({ cells: [date, startTime, endTime, subject, gradeList, classList], line }): ExamImportRow => {
    const grades = list(gradeList).map((value) => positiveInteger(value, 999));
    const rooms = list(classList);
    if (!isExamDate(date) || !isExamTime(startTime) || !isExamTime(endTime) || startTime >= endTime ||
      !subject || subject.length > 100 || /[\r\n]/.test(subject)) invalid(line, '請檢查日期、開始與結束時間及考試科目');
    if ((grades.length && rooms.length) || grades.some((grade) => grade === undefined || !knownGrades.includes(grade)) ||
      rooms.some((room) => !classIds.has(room))) invalid(line, '請填寫已存在的年級或班級代號，兩欄擇一');
    const item: ExamPeriod = {
      id: crypto.randomUUID(), date, startTime, endTime, subject,
      grades: [...new Set(grades as number[])].sort((a, b) => a - b),
      ...(rooms.length ? { classIds: rooms.sort() } : {})
    };
    const scope = rooms.length ? rooms.join('、') : item.grades.map((grade) => gradeLabel(state.config, grade)).join('、') || '全校';
    const summary = `${periodLabel(item)} · ${scope}`;
    if (periods.some((old) => old.date === date && old.startTime === startTime && old.endTime === endTime &&
      old.subject.trim() === subject && scopeKey(old) === scopeKey(item))) return { line, action: '略過', summary };
    const overlap = periods.find((old) => periodTimesOverlap(old, item) && periodScopesOverlap(old, item, state.classrooms));
    if (overlap) invalid(line, `與 ${periodLabel(overlap)} 的考程重疊`);
    if (periods.length >= 200) invalid(line, '考程表最多可設定 200 節');
    periods.push(item);
    return { line, action: '新增', summary };
  });
  if (result.some((item) => item.action === '新增')) state.config.periods = periods.sort(comparePeriods);
  return result;
}

function importGrades(state: SystemData, rows: CsvRow[]): ExamImportRow[] {
  const existing = availableGrades(state.config, state.classrooms);
  const labels = { ...(state.config.gradeLabels ?? DEFAULT_GRADE_LABELS) };
  const seen = new Set<string>();
  const changes = rows.map(({ cells: [code, name], line }) => {
    const grade = positiveInteger(code, 999);
    if (grade === undefined || !name || name.length > 24 || /[\r\n]/.test(name)) invalid(line, '請填寫有效的年級代碼與 24 字以內的名稱');
    unique(seen, String(grade), line, '年級代碼');
    const previous = existing.includes(grade) ? gradeLabel(state.config, grade) : undefined;
    if (previous !== name) labels[grade] = name;
    return { line, grade, name, previous };
  });
  state.config.gradeLabels = labels;
  const grades = availableGrades(state.config, state.classrooms);
  return changes.map(({ line, grade, name, previous }): ExamImportRow => {
    if (grades.some((other) => other !== grade && gradeLabel(state.config, other).toLowerCase() === name.toLowerCase())) invalid(line, '此年級名稱已使用');
    return {
      line, action: previous === name ? '略過' : previous === undefined ? '新增' : '更新',
      summary: `${grade} · ${previous && previous !== name ? `${previous} → ` : ''}${name}`
    };
  });
}

function importClassrooms(state: SystemData, rows: CsvRow[]): ExamImportRow[] {
  const grades = availableGrades(state.config, state.classrooms);
  const periods = examPeriods(state.config);
  const seen = new Set<string>();
  return rows.map(({ cells: [classId, code, className, count], line }): ExamImportRow => {
    const room = state.classrooms.find((item) => item.classId === classId);
    const grade = positiveInteger(code, 999);
    const expectedCount = positiveInteger(count, 10000);
    if ((!room && !/^[\p{L}\p{N}_-]{1,64}$/u.test(classId)) || !className || className.length > 100 || /[\r\n]/.test(className) ||
      grade === undefined || !grades.includes(grade) || expectedCount === undefined) invalid(line, '請填寫有效班級代號、班名、既有年級及 1 至 10000 的應到人數');
    unique(seen, classId, line, '班級代號');
    const label = `${classId} · ${gradeLabel(state.config, grade)} · ${className} · 應到 ${expectedCount} 人`;
    if (room?.grade !== grade) {
      const applicable = periods.filter((period) => periodApplies(period, { classId, grade }));
      if (applicable.some((period, index) => applicable.slice(index + 1).some((other) => periodTimesOverlap(period, other)))) {
        invalid(line, '班級適用的考程時段重疊，請先調整考程表');
      }
    }
    const now = new Date().toISOString();
    if (!room) {
      state.classrooms.push({
        classId, grade, className, expectedCount, invigilator: '待指派監考老師',
        presentCount: expectedCount, absentCount: 0, absentStudents: [], totalSeats: Math.max(30, expectedCount), statusReported: false, lastUpdated: now
      });
      return { line, action: '新增', summary: label };
    }
    if (room.grade === grade && room.className === className && room.expectedCount === expectedCount) return { line, action: '略過', summary: label };
    const previous = `${gradeLabel(state.config, room.grade)} · ${room.className} · 應到 ${room.expectedCount} 人`;
    Object.assign(room, { grade, className, expectedCount, presentCount: Math.max(0, expectedCount - room.absentCount), totalSeats: Math.max(room.totalSeats, expectedCount), lastUpdated: now });
    return { line, action: '更新', summary: `${label}（原 ${previous}）` };
  });
}

function importInvigilation(state: SystemData, rows: CsvRow[]): ExamImportRow[] {
  const teachers = state.teachers ?? [];
  const periods = examPeriods(state.config);
  const seen = new Set<string>();
  const defaults = new Map(teachers.filter((teacher) => teacher.assignedClassId).map((teacher) => [teacher.assignedClassId!, teacher]));
  const affectedDefaults = new Set<string>();
  const results = rows.map(({ cells: [classId, username, date, time, subject], line }): ExamImportRow => {
    const room = state.classrooms.find((item) => item.classId === classId);
    if (!room) invalid(line, '找不到此班級代號');
    const teacher = username ? teachers.find((item) => item.username === username) : undefined;
    if (username && !teacher) invalid(line, '找不到此教師登入帳號');
    const perPeriod = Boolean(date || time || subject);
    const matches = perPeriod ? periods.filter((item) => item.date === date && item.startTime === time && item.subject.trim() === subject && periodApplies(item, room)) : [];
    if (perPeriod && (!date || !time || !subject || matches.length !== 1)) invalid(line, '請填寫適用此班且可唯一辨識的考試日期、開始時間與科目');
    const period = matches[0];
    unique(seen, JSON.stringify([classId, period?.id]), line, '此考場與節次');
    const previous = period ? invigilatorForPeriod(room, period.id, teachers) : defaults.get(classId);
    const summary = `${room.className}（${classId}） · ${period ? periodLabel(period) : '考場預設'} · ${previous?.name ?? '待指派'} → ${teacher?.name ?? '待指派'}`;
    if (period) {
      const teacherId = teacher?.id ?? null;
      if (room.periodInvigilators?.[period.id] === teacherId) return { line, action: '略過', summary };
      (room.periodInvigilators ??= {})[period.id] = teacherId;
    } else {
      if (previous?.id === teacher?.id) return { line, action: '略過', summary };
      affectedDefaults.add(classId);
      if (teacher) defaults.set(classId, teacher);
      else defaults.delete(classId);
    }
    return { line, action: '更新', summary };
  });
  if (!affectedDefaults.size) return results;
  const defaultRooms = new Map<string, string>();
  for (const [classId, teacher] of defaults) {
    const previous = defaultRooms.get(teacher.id);
    if (previous) throw new ExamImportError(`${teacher.name} 的預設監考同時指派至 ${previous} 與 ${classId}，請一併調整原指派`);
    defaultRooms.set(teacher.id, classId);
  }
  for (const teacher of teachers) {
    const next = defaultRooms.get(teacher.id) ?? '';
    if ((teacher.assignedClassId ?? '') !== next) teacher.assignedClassId = next;
  }
  for (const room of state.classrooms.filter((item) => affectedDefaults.has(item.classId))) {
    const teacher = defaults.get(room.classId);
    room.invigilator = teacher?.name ?? '待指派監考老師';
    room.invigilatorUsername = teacher?.username;
  }
  return results;
}

export async function examImportVersion(kind: ExamImportKind, text: string, state: SystemData) {
  const baseline = [kind, text, examPeriods(state.config), state.config.gradeLabels,
    state.classrooms.map(({ classId, className, grade, expectedCount, invigilator, invigilatorUsername, periodInvigilators }) =>
      [classId, className, grade, expectedCount, invigilator, invigilatorUsername, periodInvigilators]),
    state.teachers?.map(({ id, username, name, assignedClassId }) => [id, username, name, assignedClassId])];
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(baseline)));
  return [...new Uint8Array(hash)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export function applyExamCsv(kind: ExamImportKind, text: string, state: SystemData) {
  const [header, ...rows] = csvRows(text);
  const headers = examImports[kind].headers;
  if (!header || header.cells.length !== headers.length || headers.some((field, index) => field !== header.cells[index])) {
    throw new ExamImportError('欄位名稱或順序不符，請使用此頁的 CSV 範本');
  }
  if (!rows.length) throw new ExamImportError('CSV 沒有可匯入的資料');
  for (const row of rows) {
    if (row.cells.length !== headers.length) invalid(row.line, `欄位數量應為 ${headers.length}`);
  }
  const previous = kind === 'grades' ? undefined : invigilationConflicts(state);
  const apply = { schedule: importSchedule, grades: importGrades, classrooms: importClassrooms, invigilation: importInvigilation };
  const result = apply[kind](state, rows);
  if (previous) {
    for (const [key, message] of invigilationConflicts(state)) {
      if (!previous.has(key)) throw new ExamImportError(message);
    }
  }
  return result;
}
