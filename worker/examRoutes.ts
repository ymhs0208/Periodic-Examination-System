import { Hono } from 'hono';
import type { ExamVariables } from './worker';
import type { ClassroomExamState, CorrectionProposal, ExamAnnouncement, ExamAttendance, ExamAuthorAssignment, ExamIssue, ExamPeriod, SystemData, TeacherAccountInput } from '../src/types/exam';
import { MAX_EXAM_AUTHOR_ASSIGNMENTS, validTeacherPassword } from '../src/types/exam';
import { comparePeriods, examPeriods, invigilatorForPeriod, isExamDate, isExamTime, LEGACY_PERIOD_ID, periodApplies, periodLabel, periodScopesOverlap, periodTimesOverlap, scheduledExamSubjects } from '../src/types/examSchedule';
import { announcementStatus } from '../src/types/announcements';
import { adminState, hashPassword, MAX_PASSWORD_LENGTH, type StoredTeacher } from './passwords';
import { availableGrades, DEFAULT_GRADE_LABELS, gradeLabel } from '../src/types/grades';
import { examImports, MAX_IMPORT_BYTES, type ExamImportKind } from '../src/types/examImports';
import { applyExamCsv, ExamImportError, examImportVersion } from './examImports';

export const api = new Hono<{ Variables: ExamVariables }>();

function parseGrade(value: unknown): number | undefined {
  const grade = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof grade === 'number' && Number.isSafeInteger(grade) && grade >= 1 && grade <= 999
    ? grade
    : undefined;
}

function classroomScheduleOverlaps(config: SystemData['config'], classId: string, grade: number) {
  const periods = examPeriods(config).filter((period) => periodApplies(period, { classId, grade }));
  return periods.some((period, index) => periods.slice(index + 1).some((other) => periodTimesOverlap(period, other)));
}

function syncClassroomInvigilatorsFromTeachers(state: SystemData) {
  for (const classroom of state.classrooms) {
    const teacher = state.teachers?.find((entry) => entry.assignedClassId === classroom.classId);
    if (teacher) {
      classroom.invigilator = teacher.name;
      classroom.invigilatorUsername = teacher.username;
    } else if (classroom.invigilatorUsername) {
      classroom.invigilator = '待指派監考老師';
      classroom.invigilatorUsername = undefined;
    }
  }
}

// Batch import school teachers with independent username/password
api.post('/api/exam/teachers/import', async (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { teachers, mode } = c.get('body');
  if (!Array.isArray(teachers) || teachers.length === 0) {
    return c.json({ success: false, error: '請提供有效的教師匯入資料' }, 400);
  }
  if (teachers.length > 50) {
    return c.json({ success: false, error: '每次最多匯入 50 筆教師資料，請分批匯入' }, 400);
  }

  const previousTeachers = state.teachers || [];
  if (mode === 'replace') {
    const retained = new Set(teachers.map((teacher) => String(teacher.username || '').trim()));
    const removed = previousTeachers.filter((teacher) => !retained.has(teacher.username));
    if (removed.some((teacher) => teacher.examAuthorAssignments?.length || teacher.assignedClassId ||
      state.classrooms.some((room) => Object.values(room.periodInvigilators ?? {}).includes(teacher.id)))) {
      return c.json({ success: false, error: '覆蓋名冊將移除仍有預設考場、分節監考或出題指派的教師。請先解除相關指派，或改用合併模式。' }, 409);
    }
  }
  const currentTeachers: StoredTeacher[] = mode === 'replace'
    ? previousTeachers.filter((teacher) => teachers.some((raw) => String(raw.username || '').trim() === teacher.username)).map((teacher) => ({ ...teacher }))
    : previousTeachers.map((teacher) => ({ ...teacher }));

  if (teachers.some((teacher) => !teacher || !String(teacher.name || '').trim() ||
    !String(teacher.username || '').trim() || typeof teacher.password !== 'string' ||
    !validTeacherPassword(teacher.password))) {
    return c.json({ success: false, error: '每筆須填寫姓名、帳號與至少 12 字元的非簡單密碼（最多 256 字元）' }, 400);
  }

  for (const raw of teachers as TeacherAccountInput[]) {
    const name = String(raw.name || '').trim();
    const username = String(raw.username || '').trim();
    const passwordHash = await hashPassword(raw.password!.trim());
    const department = String(raw.department || '').trim() || '專任教師';
    const assignedClassId = String(raw.assignedClassId || '').trim();

    // If assignedClassId is specified and valid, clear previous teacher assigned to that class
    if (assignedClassId && state.classrooms.some((c) => c.classId === assignedClassId)) {
      currentTeachers.forEach((t) => {
        if (t.assignedClassId === assignedClassId && t.username !== username) {
          t.assignedClassId = '';
        }
      });
    }

    const existingIdx = currentTeachers.findIndex((t) => t.username === username);
    if (existingIdx >= 0) {
      currentTeachers[existingIdx] = {
        ...currentTeachers[existingIdx],
        name,
        password: undefined,
        passwordHash,
        department: department || currentTeachers[existingIdx].department,
        assignedClassId:
          assignedClassId && state.classrooms.some((c) => c.classId === assignedClassId)
            ? assignedClassId
            : currentTeachers[existingIdx].assignedClassId
      };
    } else {
      currentTeachers.push({
        id: `tch-${crypto.randomUUID()}`,
        name,
        username,
        passwordHash,
        department,
        assignedClassId:
          assignedClassId && state.classrooms.some((c) => c.classId === assignedClassId)
            ? assignedClassId
            : ''
      });
    }
  }

  state.teachers = currentTeachers;
  syncClassroomInvigilatorsFromTeachers(state);

  broadcast('INIT_STATE', state);
  return c.json({ success: true, data: adminState(state) });
});

// Add or update a single teacher account
api.post('/api/exam/teachers', async (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { id, name, username, password, department, assignedClassId, examAuthorAssignments, expectedExamAuthorAssignments } = c.get('body');
  const cleanName = String(name || '').trim();
  const cleanUsername = String(username || '').trim();
  const cleanPassword = String(password || '').trim();
  const cleanDept = String(department || '').trim() || '專任教師';
  const cleanClassId = String(assignedClassId || '').trim();

  if (!cleanName || !cleanUsername || (!id && !validTeacherPassword(cleanPassword)) || (cleanPassword && !validTeacherPassword(cleanPassword))) {
    return c.json({ success: false, error: '請填寫姓名、帳號；新增或重設密碼須為 12 至 256 字元且不可過於簡單' }, 400);
  }
  state.teachers = state.teachers || [];
  const target = state.teachers.find((teacher) => teacher.id === id);
  if (id && !target) {
    return c.json({ success: false, error: '找不到該名教師資料' }, 404);
  }
  let assignments: ExamAuthorAssignment[] | undefined;
  if (examAuthorAssignments !== undefined) {
    const grades = availableGrades(state.config, state.classrooms);
    const subjects = scheduledExamSubjects(state.config);
    if (!Array.isArray(examAuthorAssignments) || examAuthorAssignments.length > MAX_EXAM_AUTHOR_ASSIGNMENTS) {
      return c.json({ success: false, error: `每位教師最多可設定 ${MAX_EXAM_AUTHOR_ASSIGNMENTS} 項出題指派` }, 400);
    }
    assignments = [];
    for (const item of examAuthorAssignments) {
      const subject = typeof item?.subject === 'string' ? item.subject.trim() : '';
      const grade = item?.grade;
      if (!subject || subject.length > 100 || !grades.includes(grade)) {
        return c.json({ success: false, error: '每項出題指派都須填寫科目並選擇有效年級' }, 400);
      }
      if (!subjects.includes(subject) && !target?.examAuthorAssignments?.some((entry) => entry.subject === subject && entry.grade === grade)) {
        return c.json({ success: false, error: '新增或變更出題指派時，請選擇目前考程表中的科目' }, 400);
      }
      if (assignments.some((entry) => entry.subject === subject && entry.grade === grade)) {
        return c.json({ success: false, error: '同一教師的出題科目與年級不可重複指派' }, 400);
      }
      assignments.push({ subject, grade });
    }
  }

  if (target && assignments && expectedExamAuthorAssignments !== undefined &&
    JSON.stringify(expectedExamAuthorAssignments) !== JSON.stringify(target.examAuthorAssignments ?? [])) {
    return c.json({ success: false, error: '此教師的出題指派已有變更，請重新開啟編輯後再儲存' }, 409);
  }

  // Check duplicate username on another teacher
  const dup = state.teachers.find((t) => t.username === cleanUsername && t.id !== id);
  if (dup) {
    return c.json({
      success: false,
      error: `登入帳號「${cleanUsername}」已由 ${dup.name} 使用，請使用其他帳號`
    }, 400);
  }

  // If assigning to a classroom, unassign previous teacher of that classroom
  if (cleanClassId) {
    state.teachers.forEach((t) => {
      if (t.assignedClassId === cleanClassId && t.id !== id) {
        t.assignedClassId = '';
      }
    });
  }

  if (target) {
    target.name = cleanName;
    target.username = cleanUsername;
    target.department = cleanDept;
    target.assignedClassId = cleanClassId;
    if (assignments !== undefined) target.examAuthorAssignments = assignments;
    if (cleanPassword) {
      target.passwordHash = await hashPassword(cleanPassword);
      delete target.password;
    }
  } else {
    state.teachers.push({
      id: `tch-${crypto.randomUUID()}`,
      name: cleanName,
      username: cleanUsername,
      passwordHash: await hashPassword(cleanPassword),
      department: cleanDept,
      examAuthorAssignments: assignments,
      assignedClassId: cleanClassId
    });
  }

  syncClassroomInvigilatorsFromTeachers(state);
  broadcast('INIT_STATE', state);
  return c.json({ success: true, data: adminState(state) });
});

// Assign a teacher to a classroom (or unassign)
api.patch('/api/exam/teachers/:id/assign', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { id } = c.req.param();
  const { classId, expected } = c.get('body');
  const targetClassId = String(classId || '').trim();

  state.teachers = state.teachers || [];
  const teacher = state.teachers.find((t) => t.id === id);
  if (!teacher) {
    return c.json({ success: false, error: '找不到該名教師資料' }, 404);
  }
  const targetClassroom = state.classrooms.find((room) => room.classId === targetClassId);
  if (targetClassId && !targetClassroom) {
    return c.json({ success: false, error: '找不到該班考場' }, 404);
  }

  // If teacher was previously assigned to a classroom and is now unassigned
  const prevClassId = teacher.assignedClassId;
  const targetTeacher = state.teachers.find((entry) => entry.assignedClassId === targetClassId);
  if (expected !== undefined && (!expected ||
    expected.previousClassId !== (prevClassId || '') ||
    (targetClassId && expected.targetTeacherId !== (targetTeacher?.id || '')))) {
    return c.json({ success: false, error: '監考指派已變更，請核對目前的安排後再試一次。' }, 409);
  }

  if (targetClassroom) {
    // Unassign any other teacher currently assigned to targetClassId
    state.teachers.forEach((t) => {
      if (t.assignedClassId === targetClassId && t.id !== id) {
        t.assignedClassId = '';
      }
    });
    teacher.assignedClassId = targetClassId;

    targetClassroom.invigilator = teacher.name;
    targetClassroom.invigilatorUsername = teacher.username;
    targetClassroom.lastUpdated = new Date().toISOString();
  } else {
    teacher.assignedClassId = '';
    if (prevClassId) {
      const prevCls = state.classrooms.find((c) => c.classId === prevClassId);
      if (prevCls && prevCls.invigilatorUsername === teacher.username) {
        prevCls.invigilator = '待指派監考老師';
        prevCls.invigilatorUsername = '';
      }
    }
  }

  syncClassroomInvigilatorsFromTeachers(state);
  broadcast('INIT_STATE', state);
  return c.json({ success: true, data: adminState(state) });
});

// Assign a teacher for one period and classroom.
api.patch('/api/exam/period-invigilators', (c) => {
  const state = c.get('state');
  const { classId, periodId, teacherId, expectedTeacherId, expectedPeriod } = c.get('body');
  const room = state.classrooms.find((item) => item.classId === classId);
  const periods = examPeriods(state.config);
  const period = periods.find((item) => item.id === periodId);
  if (!room || !period || !periodApplies(period, room)) {
    return c.json({ success: false, error: '找不到適用此考場的考試節次' }, 404);
  }
  if (expectedPeriod !== undefined && (expectedPeriod?.date !== period.date || expectedPeriod?.startTime !== period.startTime ||
    expectedPeriod?.endTime !== period.endTime || expectedPeriod?.subject !== period.subject)) {
    return c.json({ success: false, error: '考試節次已更新，請重新核對後再指派' }, 409);
  }
  const teachers = state.teachers ?? [];
  const current = invigilatorForPeriod(room, period.id, teachers)?.id ?? null;
  if (current !== expectedTeacherId) {
    return c.json({ success: false, error: '本節監考指派已變更，請重新核對' }, 409);
  }
  if (teacherId !== null) {
    if (!teachers.some((teacher) => teacher.id === teacherId)) {
      return c.json({ success: false, error: '找不到該名教師' }, 404);
    }
    const conflict = state.classrooms.find((otherRoom) => otherRoom.classId !== room.classId &&
      periods.some((other) => periodTimesOverlap(period, other) && periodApplies(other, otherRoom) &&
        invigilatorForPeriod(otherRoom, other.id, teachers)?.id === teacherId));
    if (conflict) {
      return c.json({ success: false, error: `這位老師在重疊時段已指派至 ${conflict.className}，請先調整原指派` }, 409);
    }
  }
  (room.periodInvigilators ??= {})[period.id] = teacherId;
  c.get('broadcast')('INIT_STATE', state);
  return c.json({ success: true });
});

// Delete a teacher account
api.delete('/api/exam/teachers/:id', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { id } = c.req.param();
  state.teachers = state.teachers || [];
  const idx = state.teachers.findIndex((t) => t.id === id);
  if (idx === -1) {
    return c.json({ success: false, error: '找不到該名教師資料' }, 404);
  }

  const removed = state.teachers.splice(idx, 1)[0];
  if (removed.assignedClassId) {
    const cls = state.classrooms.find((c) => c.classId === removed.assignedClassId);
    if (cls && cls.invigilatorUsername === removed.username) {
      cls.invigilator = '待指派監考老師';
      cls.invigilatorUsername = '';
    }
  }

  broadcast('INIT_STATE', state);
  return c.json({ success: true, data: adminState(state) });
});

// Update attendance for a classroom
api.post('/api/exam/attendance', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { classId, periodId, expectedPeriod, expectedLastUpdated, expectedCount, presentCount, absentCount, absentStudents } = c.get('body');
  const classroom = state.classrooms.find((c) => c.classId === classId);

  if (!classroom) {
    return c.json({ success: false, error: '班級不存在' }, 404);
  }
  const period = examPeriods(state.config).find((item) => item.id === periodId);
  if (periodId !== undefined || state.config.periods !== undefined) {
    if (!period || !periodApplies(period, classroom)) {
      return c.json({ success: false, error: '請選擇此班適用的考試節次' }, 400);
    }
  }
  if (expectedPeriod !== undefined && (!expectedPeriod || !period ||
    period.date !== expectedPeriod.date || period.startTime !== expectedPeriod.startTime ||
    period.endTime !== expectedPeriod.endTime || period.subject !== expectedPeriod.subject)) {
    return c.json({ success: false, error: '考試節次已更新，請重新核對後再送出點名' }, 409);
  }

  if (!Number.isSafeInteger(expectedCount) || expectedCount < 1 || expectedCount > 10000 ||
    !Number.isSafeInteger(presentCount) || presentCount < 0 || presentCount > 10000 ||
    !Number.isSafeInteger(absentCount) || absentCount < 0 || absentCount > 10000 ||
    expectedCount !== presentCount + absentCount ||
    !Array.isArray(absentStudents) || absentStudents.length !== absentCount ||
    absentStudents.some((student) => !student ||
      !Number.isSafeInteger(student.seatNo) || student.seatNo < 1 || student.seatNo > classroom.totalSeats ||
      typeof student.name !== 'string' || typeof student.reason !== 'string' ||
      student.name.length > 100 || student.reason.length > 100) ||
    new Set(absentStudents.map((student) => student.seatNo)).size !== absentCount) {
    return c.json({ success: false, error: '出缺席人數或座號資料有誤' }, 400);
  }

  const currentRecord = period && state.config.periods !== undefined ? classroom.periodAttendance?.[period.id] : classroom;
  const currentVersion = currentRecord?.statusReported ? currentRecord.lastUpdated : null;
  if (expectedLastUpdated !== currentVersion) {
    return c.json({ success: false, error: '此班本節點名已由其他人更新，請保留草稿並重新載入核對後再送出。' }, 409);
  }
  const attendance: ExamAttendance = {
    expectedCount, presentCount, absentCount,
    absentStudents: absentStudents.map(({ seatNo, name, reason }) => ({ seatNo, name, reason })),
    statusReported: true,
    lastUpdated: new Date(Math.max(Date.now(), Date.parse(currentVersion || '') + 1 || 0)).toISOString()
  };
  if (period && state.config.periods !== undefined) {
    broadcast('PERIOD_ATTENDANCE_UPDATED', { classId, periodId: period.id, attendance });
    const { periodInvigilators: _assignmentIds, invigilatorUsername: _defaultUsername, ...publicRoom } = classroom;
    return c.json({ success: true, data: { ...publicRoom, ...attendance } });
  } else {
    Object.assign(classroom, attendance);
  }

  broadcast('ATTENDANCE_UPDATED', classroom);
  const { periodInvigilators: _assignmentIds, invigilatorUsername: _defaultUsername, ...publicRoom } = classroom;
  return c.json({ success: true, data: publicRoom });
});

// Update classroom metadata (grade, className, invigilator, expectedCount, totalSeats)
api.patch('/api/exam/classroom/:classId', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { classId } = c.req.param();
  const { grade, className, invigilator, teacherId, expectedCount, totalSeats, expected } = c.get('body');
  const classroom = state.classrooms.find((c) => c.classId === classId);

  if (!classroom) {
    return c.json({ success: false, error: '班級不存在' }, 404);
  }
  if (expected !== undefined && (expected?.grade !== classroom.grade ||
    expected?.className !== classroom.className || expected?.expectedCount !== classroom.expectedCount)) {
    return c.json({ success: false, error: '此班級已更新，請重新載入頁面後再編輯。' }, 409);
  }

  if (grade !== undefined) {
    const nextGrade = parseGrade(grade);
    if (nextGrade === undefined) return c.json({ success: false, error: '年級代碼須為 1 至 999 的整數' }, 400);
    if (nextGrade !== classroom.grade && classroomScheduleOverlaps(state.config, classId, nextGrade)) {
      return c.json({ success: false, error: '更改年級會使此班考程重疊，請先調整考程表' }, 409);
    }
    classroom.grade = nextGrade;
  }
  if (className !== undefined && String(className).trim()) {
    classroom.className = String(className).trim();
  }

  // If teacherId is provided, bind that teacher from state.teachers
  if (teacherId && state.teachers) {
    const selectedTeacher = state.teachers.find((t) => t.id === teacherId);
    if (selectedTeacher) {
      state.teachers.forEach((t) => {
        if (t.assignedClassId === classId && t.id !== selectedTeacher.id) {
          t.assignedClassId = '';
        }
      });
      selectedTeacher.assignedClassId = classId;
      classroom.invigilator = selectedTeacher.name;
      classroom.invigilatorUsername = selectedTeacher.username;
    }
  } else if (invigilator !== undefined && String(invigilator).trim()) {
    const invName = String(invigilator).trim();
    classroom.invigilator = invName;
    const matchedTch = (state.teachers || []).find(
      (t) => t.name === invName || t.username === invName
    );
    if (matchedTch) {
      state.teachers?.forEach((t) => {
        if (t.assignedClassId === classId && t.id !== matchedTch.id) {
          t.assignedClassId = '';
        }
      });
      matchedTch.assignedClassId = classId;
      classroom.invigilatorUsername = matchedTch.username;
    }
  }

  if (expectedCount !== undefined) {
    const nextExpected = expectedCount;
    classroom.expectedCount = nextExpected;
    classroom.presentCount = Math.max(0, nextExpected - classroom.absentCount);
    if (nextExpected > classroom.totalSeats) {
      classroom.totalSeats = nextExpected;
    }
  }
  if (totalSeats !== undefined) {
    classroom.totalSeats = totalSeats;
  }
  classroom.lastUpdated = new Date().toISOString();

  broadcast('INIT_STATE', state);
  return c.json({ success: true, data: classroom });
});

api.delete('/api/exam/classroom/:classId', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { classId } = c.req.param();
  const classroom = state.classrooms.find((item) => item.classId === classId);
  if (!classroom) {
    return c.json({ success: false, error: '班級不存在' }, 404);
  }

  for (const teacher of state.teachers ?? []) {
    if (teacher.assignedClassId === classId) teacher.assignedClassId = '';
  }
  state.classrooms = state.classrooms.filter((item) => item.classId !== classId);

  broadcast('INIT_STATE', state);
  return c.json({ success: true, data: { classId } });
});

// Add a new classroom
api.post('/api/exam/classroom', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { classId, grade, className, invigilator, teacherId, expectedCount } = c.get('body');
  if (!className || (!invigilator && !teacherId)) {
    return c.json({ success: false, error: '請填寫班級名稱與指派監考老師' }, 400);
  }

  const requestedId = String(classId ?? '').trim();
  const existing = state.classrooms.find((classroom) => classroom.classId === requestedId);
  const nextGrade = grade === undefined ? existing?.grade ?? 9 : parseGrade(grade);
  if (nextGrade === undefined) return c.json({ success: false, error: '年級代碼須為 1 至 999 的整數' }, 400);
  if (existing && nextGrade !== existing.grade && classroomScheduleOverlaps(state.config, existing.classId, nextGrade)) {
    return c.json({ success: false, error: '更改年級會使此班考程重疊，請先調整考程表' }, 409);
  }

  let normalizedId = requestedId;
  if (!normalizedId) {
    let sequence = state.classrooms.length + 1;
    do {
      normalizedId = `${nextGrade}${String(sequence++).padStart(2, '0')}`;
    } while (state.classrooms.some((classroom) => classroom.classId === normalizedId));
  }

  let resolvedInvigilator = String(invigilator || '').trim();
  let resolvedUsername = '';

  if (teacherId && state.teachers) {
    const selectedTeacher = state.teachers.find((t) => t.id === teacherId);
    if (selectedTeacher) {
      state.teachers.forEach((t) => {
        if (t.assignedClassId === normalizedId && t.id !== selectedTeacher.id) {
          t.assignedClassId = '';
        }
      });
      selectedTeacher.assignedClassId = normalizedId;
      resolvedInvigilator = selectedTeacher.name;
      resolvedUsername = selectedTeacher.username;
    }
  }

  if (existing) {
    existing.grade = nextGrade;
    existing.className = String(className).trim();
    existing.invigilator = resolvedInvigilator || existing.invigilator;
    if (resolvedUsername) existing.invigilatorUsername = resolvedUsername;
    if (expectedCount !== undefined) {
      existing.expectedCount = expectedCount;
      existing.presentCount = Math.max(0, existing.expectedCount - existing.absentCount);
      existing.totalSeats = Math.max(existing.totalSeats, existing.expectedCount);
    }
    existing.lastUpdated = new Date().toISOString();
    broadcast('INIT_STATE', state);
    return c.json({ success: true, data: existing });
  }

  const exp = expectedCount ?? 30;
  const newClassroom: ClassroomExamState = {
    classId: normalizedId,
    grade: nextGrade,
    className: String(className).trim(),
    invigilator: resolvedInvigilator || '待指派監考老師',
    invigilatorUsername: resolvedUsername || undefined,
    expectedCount: exp,
    presentCount: exp,
    absentCount: 0,
    absentStudents: [],
    totalSeats: Math.max(30, exp),
    statusReported: false,
    lastUpdated: new Date().toISOString()
  };

  state.classrooms.push(newClassroom);
  broadcast('INIT_STATE', state);
  return c.json({ success: true, data: newClassroom });
});

// Invigilator reports an issue
api.post('/api/exam/issue', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { classId, type, content, isUrgent } = c.get('body');
  if (typeof content !== 'string' || !content.trim() || content.length > 3000) {
    return c.json({ success: false, error: '請輸入問題內容' }, 400);
  }

  const classroom = state.classrooms.find((room) => room.classId === classId);
  if (!classroom) return c.json({ success: false, error: '班級不存在' }, 404);

  const newIssue: ExamIssue = {
    id: `issue-${crypto.randomUUID()}`,
    classId: classroom.classId,
    className: classroom.className,
    type: type || 'general',
    content,
    status: 'pending',
    createdAt: new Date().toISOString(),
    isUrgent: Boolean(isUrgent)
  };

  state.issues.unshift(newIssue);
  broadcast('ISSUE_REPORTED', newIssue);
  return c.json({ success: true, data: newIssue });
});

// Admin updates or replies to an issue
api.patch('/api/exam/issue/:id', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { id } = c.req.param();
  const { status, reply, repliedBy } = c.get('body');

  const issue = state.issues.find((i) => i.id === id);
  if (!issue) {
    return c.json({ success: false, error: '問題不存在' }, 404);
  }

  if (status) issue.status = status;
  if (reply !== undefined) {
    issue.reply = reply;
    issue.repliedBy = repliedBy || '教務處 試務組';
    issue.repliedAt = new Date().toISOString();
  }

  broadcast('ISSUE_UPDATED', issue);
  return c.json({ success: true, data: issue });
});

function recordAnnouncement(
  state: SystemData,
  broadcast: ExamVariables['broadcast'],
  details: Omit<ExamAnnouncement, 'id' | 'publishedAt' | 'readByClassIds'>
) {
  const announcement: ExamAnnouncement = {
    ...details,
    id: `anno-${crypto.randomUUID()}`,
    publishedAt: new Date().toISOString(),
    readByClassIds: []
  };
  state.announcements.unshift(announcement);
  broadcast('ANNOUNCEMENT_PUBLISHED', announcement);
  return announcement;
}

function validCorrectionAudience(audience: string, state: SystemData) {
  return audience === 'all' || availableGrades(state.config, state.classrooms).some((grade) => audience === `grade_${grade}`);
}

api.post('/api/exam/corrections', (c) => {
  const state = c.get('state');
  const author = c.get('session');
  if (!author?.canSubmitCorrections || !author.teacherId) {
    return c.json({ success: false, error: '此帳號沒有試題更正送審權限' }, 403);
  }
  const body = c.get('body');
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const targetAudience = typeof body.targetAudience === 'string' ? body.targetAudience : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!subject || subject.length > 100 || !title || title.length > 150 || !content || content.length > 3000 ||
    !validCorrectionAudience(targetAudience, state)) {
    return c.json({ success: false, error: '請檢查考科、公告對象、標題與更正內容' }, 400);
  }
  if (!author.examAuthorAssignments?.some((item) => item.subject === subject && targetAudience === `grade_${item.grade}`)) {
    return c.json({ success: false, error: '只能為已指派的科目與年級提交試題更正' }, 403);
  }

  const proposals = state.correctionProposals ??= [];
  const existing = proposals.find((item) => item.status === 'pending' && item.teacherId === author.teacherId &&
    item.subject === subject && item.targetAudience === targetAudience && item.title === title && item.content === content);
  if (existing) return c.json({ success: true, data: existing });

  const proposal: CorrectionProposal = {
    id: `correction-${crypto.randomUUID()}`,
    teacherId: author.teacherId,
    teacherName: author.username,
    subject, targetAudience, title, content,
    submittedAt: new Date().toISOString(),
    status: 'pending'
  };
  proposals.unshift(proposal);
  c.get('broadcast')('CORRECTION_UPDATED', proposal);
  return c.json({ success: true, data: proposal });
});

api.patch('/api/exam/corrections/:id', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const proposal = state.correctionProposals?.find((item) => item.id === c.req.param('id'));
  if (!proposal) return c.json({ success: false, error: '找不到試題更正申請' }, 404);
  if (proposal.status !== 'pending') return c.json({ success: false, error: '這筆申請已完成審核' }, 409);

  const { decision, reason } = c.get('body');
  const reviewNote = typeof reason === 'string' ? reason.trim() : '';
  if ((decision !== 'approved' && decision !== 'rejected') || (decision === 'rejected' && (!reviewNote || reviewNote.length > 500))) {
    return c.json({ success: false, error: '請選擇審核結果，退回時須填寫原因' }, 400);
  }
  if (decision === 'approved' && !validCorrectionAudience(proposal.targetAudience, state)) {
    return c.json({ success: false, error: '公告對象已變更，請退回此申請並通知老師重新送審' }, 409);
  }

  proposal.status = decision;
  proposal.reviewedAt = new Date().toISOString();
  if (decision === 'rejected') {
    proposal.reviewNote = reviewNote;
  } else {
    const { subject, targetAudience, title, content } = proposal;
    recordAnnouncement(state, broadcast, {
      subject, targetAudience, title, content,
      type: 'correction',
      priority: 'critical',
      publishedBy: '教務處 試務中心'
    });
  }
  broadcast('CORRECTION_UPDATED', proposal);
  return c.json({ success: true, data: proposal });
});

// Admin publishes an announcement / question correction
api.post('/api/exam/announcement', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { type, subject, targetAudience, title, content, priority, publishedBy, startsAt, endsAt } = c.get('body');
  if (!title || !content) {
    return c.json({ success: false, error: '標題與內容皆為必填' }, 400);
  }

  const timestamp = (value: unknown) => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') return NaN;
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
  };
  const now = Date.now();
  const start = timestamp(startsAt);
  const end = timestamp(endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return c.json({ success: false, error: '公告顯示時間格式有誤' }, 400);
  }
  if (end !== undefined && end <= Math.max(now, start ?? now)) {
    return c.json({ success: false, error: '結束顯示時間須晚於開始顯示時間及現在時間' }, 400);
  }

  const newAnnouncement = recordAnnouncement(state, broadcast, {
    type: type || 'correction',
    subject: subject || state.config.subject,
    targetAudience: targetAudience || 'all',
    title,
    content,
    startsAt,
    endsAt,
    publishedBy: publishedBy || '教務處 試務中心',
    priority: priority || (type === 'correction' ? 'critical' : 'normal')
  });
  return c.json({ success: true, data: newAnnouncement });
});

// Admin deletes / revokes an announcement
api.delete('/api/exam/announcement/:id', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { id } = c.req.param();
  const index = state.announcements.findIndex((a) => a.id === id);
  if (index === -1) {
    return c.json({ success: false, error: '公告不存在' }, 404);
  }

  const deleted = state.announcements.splice(index, 1)[0];
  broadcast('ANNOUNCEMENT_DELETED', { id });
  return c.json({ success: true, data: deleted });
});

// Classroom acknowledges reading announcement
api.post('/api/exam/announcement/:id/read', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const { id } = c.req.param();
  const { classId } = c.get('body');
  const anno = state.announcements.find((a) => a.id === id);
  if (!anno || announcementStatus(anno, Date.now()) !== 'active') {
    return c.json({ success: false, error: '公告目前未顯示' }, 404);
  }
  if (classId) {
    anno.readByClassIds = anno.readByClassIds || [];
    if (!anno.readByClassIds.includes(classId)) {
      anno.readByClassIds.push(classId);
      broadcast('ANNOUNCEMENT_READ', { id, classId, count: anno.readByClassIds.length });
    }
  }
  return c.json({ success: true, data: anno });
});

// Admin updates exam configuration
api.patch('/api/exam/config', (c) => {
  const state = c.get('state');
  const broadcast = c.get('broadcast');
  const updates = c.get('body'); // Field whitelist validated by the Worker before this route.
  state.config = { ...state.config, ...updates };
  if (state.config.periods === undefined && ['examDate', 'startTime', 'endTime', 'subject'].some((key) => key in updates)) broadcast('INIT_STATE', state);
  else broadcast('CONFIG_UPDATED', state.config);
  return c.json({ success: true, data: state.config });
});

api.patch('/api/exam/periods', (c) => {
  const state = c.get('state');
  const previous = examPeriods(state.config);
  const { periods, expectedPeriods } = c.get('body');
  if (!Array.isArray(periods) || periods.length > 200) {
    return c.json({ success: false, error: '考程最多可設定 200 節' }, 400);
  }
  if (JSON.stringify(expectedPeriods) !== JSON.stringify(previous)) {
    return c.json({ success: false, error: '考程已由其他管理員更新，請載入最新考程後再編輯' }, 409);
  }
  const knownGrades = availableGrades(state.config, state.classrooms);
  const knownClassIds = new Set(state.classrooms.map((room) => room.classId));
  const next: ExamPeriod[] = [];
  const ids = new Set<string>();
  for (const item of periods) {
    const id = item?.id;
    const subject = typeof item?.subject === 'string' ? item.subject.trim() : '';
    const classIds = item?.classIds ?? [];
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(id) || ids.has(id) ||
      (id === LEGACY_PERIOD_ID && !previous.some((period) => period.id === id)) ||
      !isExamDate(item.date) || !isExamTime(item.startTime) || !isExamTime(item.endTime) || item.startTime >= item.endTime ||
      !subject || subject.length > 100 || !Array.isArray(item.grades) ||
      item.grades.some((grade: number) => !knownGrades.includes(grade)) ||
      !Array.isArray(classIds) || classIds.some((classId) => !knownClassIds.has(classId)) || (classIds.length && item.grades.length)) {
      return c.json({ success: false, error: '請檢查日期、時間、科目與適用班級或年級，結束時間須晚於開始時間' }, 400);
    }
    ids.add(id);
    next.push({
      id, date: item.date, startTime: item.startTime, endTime: item.endTime, subject,
      grades: [...new Set<number>(item.grades)].sort((a, b) => a - b),
      ...(classIds.length ? { classIds: [...new Set<string>(classIds)].sort() } : {})
    });
  }

  for (const [index, period] of next.entries()) {
    const overlapping = next.slice(index + 1).some((other) =>
      periodTimesOverlap(period, other) && periodScopesOverlap(period, other, state.classrooms));
    if (overlapping) return c.json({ success: false, error: `${periodLabel(period)} 與同一考場適用的其他考試重疊` }, 400);
  }

  for (const period of previous) {
    const replacement = next.find((item) => item.id === period.id);
    const recorded = state.classrooms.filter((room) => room.periodAttendance?.[period.id] ||
      (period.id === LEGACY_PERIOD_ID && room.statusReported));
    if (recorded.length && (!replacement || recorded.some((room) =>
      periodApplies(period, room) && !periodApplies(replacement, room)))) {
      return c.json({ success: false, error: `${periodLabel(period)} 已有點名紀錄，須保留該節與已回報班級` }, 409);
    }
  }

  const migrateLegacy = state.config.periods === undefined && next.some((period) => period.id === LEGACY_PERIOD_ID);
  state.config.periods = next.sort(comparePeriods);
  for (const room of state.classrooms) {
    if (room.periodInvigilators) {
      room.periodInvigilators = Object.fromEntries(Object.entries(room.periodInvigilators).filter(([id]) => ids.has(id)));
    }
  }
  broadcastSchedule(state, c.get('broadcast'), migrateLegacy);
  return c.json({ success: true, data: state.config.periods });
});

function broadcastSchedule(state: SystemData, broadcast: ExamVariables['broadcast'], migrateLegacy: boolean) {
  broadcast('INIT_STATE', state);
  if (migrateLegacy) {
    for (const room of state.classrooms.filter((item) => item.statusReported)) {
      const { expectedCount, presentCount, absentCount, absentStudents, statusReported, lastUpdated } = room;
      broadcast('PERIOD_ATTENDANCE_UPDATED', {
        classId: room.classId, periodId: LEGACY_PERIOD_ID,
        attendance: { expectedCount, presentCount, absentCount, absentStudents, statusReported, lastUpdated }
      });
    }
  }
}

api.post('/api/exam/import/:kind', async (c) => {
  const kind = c.req.param('kind') as ExamImportKind;
  if (!Object.hasOwn(examImports, kind)) return c.json({ success: false, error: '找不到此匯入功能' }, 404);
  const { text, expectedVersion } = c.get('body');
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES ||
    (expectedVersion !== undefined && (typeof expectedVersion !== 'string' || !/^[a-f0-9]{64}$/.test(expectedVersion)))) {
    return c.json({ success: false, error: 'CSV 資料或預覽版本有誤' }, 400);
  }
  const state = c.get('state');
  const version = await examImportVersion(kind, text, state);
  if (expectedVersion !== undefined && expectedVersion !== version) {
    return c.json({ success: false, error: '匯入資料或考務設定已變更，請重新預覽後再確認' }, 409);
  }
  const migrateLegacy = state.config.periods === undefined && examPeriods(state.config).some((period) => period.id === LEGACY_PERIOD_ID);
  try {
    const rows = applyExamCsv(kind, text, state);
    if (expectedVersion && rows.some(({ action }) => action !== '略過')) {
      const broadcast = c.get('broadcast');
      if (kind === 'schedule') broadcastSchedule(state, broadcast, migrateLegacy);
      else broadcast('INIT_STATE', state);
    }
    return c.json({ success: true, data: { version, rows } });
  } catch (error) {
    if (error instanceof ExamImportError) return c.json({ success: false, error: error.message }, 400);
    throw error;
  }
});

// Update a single grade without overwriting concurrent edits to other grades or the exam settings.
api.patch('/api/exam/grades/:grade', (c) => {
  const state = c.get('state');
  const grade = parseGrade(c.req.param('grade'));
  const { label } = c.get('body');
  if (grade === undefined || (label !== null && (typeof label !== 'string' || !label.trim() || label.trim().length > 24))) {
    return c.json({ success: false, error: '請輸入 1 至 999 的年級代碼及 24 字以內的名稱' }, 400);
  }

  const labels = { ...(state.config.gradeLabels ?? DEFAULT_GRADE_LABELS) };
  if (label === null) {
    if (state.teachers?.some((teacher) => teacher.examAuthorAssignments?.some((item) => item.grade === grade))) {
      return c.json({ success: false, error: '此年級已有出題老師指派，請先調整教師設定' }, 409);
    }
    if (state.classrooms.some((room) => room.grade === grade) ||
      state.announcements.some((item) => item.targetAudience === `grade_${grade}`) ||
      state.config.periods?.some((period) => period.grades.includes(grade))) {
      return c.json({ success: false, error: '此年級已有考場、定向公告或考程，請先調整相關資料' }, 409);
    }
    delete labels[grade];
  } else {
    const name = label.trim();
    const duplicated = availableGrades(state.config, state.classrooms).some(
      (other) => other !== grade && gradeLabel(state.config, other).toLowerCase() === name.toLowerCase()
    );
    if (duplicated) return c.json({ success: false, error: '此年級名稱已使用' }, 409);
    labels[grade] = name;
  }
  state.config.gradeLabels = labels;
  c.get('broadcast')('CONFIG_UPDATED', state.config);
  return c.json({ success: true, data: state.config });
});

