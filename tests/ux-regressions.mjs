// Run with: node tests/ux-regressions.mjs. Uses only in-memory fixtures; never calls the deployed site.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { Hono } from 'hono';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let passed = 0;
const check = (label, run) => { run(); passed++; console.log(`PASS ${label}`); };
try {
  const { parseDelimited } = await server.ssrLoadModule('/src/services/parseDelimited.ts');
  const { attendanceDraftKey, discardOtherAttendanceDrafts } = await server.ssrLoadModule('/src/services/attendanceDrafts.ts');
  check('attendance drafts are account-scoped and unowned drafts are discarded', () => {
    const originalWindow = globalThis.window;
    const teacher = 'invigilator:account';
    const own = attendanceDraftKey(teacher, '101', 'p1');
    const other = attendanceDraftKey('admin:account', '101', 'p1');
    const legacy = 'exam-attendance-draft:101:p1';
    const keys = new Set([own, other, legacy, 'unrelated-setting']);
    globalThis.window = { sessionStorage: {
      get length() { return keys.size; },
      key: (index) => [...keys][index],
      removeItem: (key) => keys.delete(key)
    } };
    try {
      assert.notEqual(own, other);
      discardOtherAttendanceDrafts(teacher);
      assert.deepEqual([...keys], [own, 'unrelated-setting']);
      discardOtherAttendanceDrafts();
      assert.deepEqual([...keys], ['unrelated-setting']);
    } finally {
      globalThis.window = originalWindow;
    }
  });
  check('quoted commas and escaped quotes', () => assert.deepEqual(parseDelimited('姓名,帳號,密碼,科別\n王老師,w,TestPass123456,"英文,雙語"\n李老師,l,TestPass123456,"科別""A"'), [['姓名','帳號','密碼','科別'],['王老師','w','TestPass123456','英文,雙語'],['李老師','l','TestPass123456','科別"A']]));
  check('quoted multiline CSV and tabs', () => { assert.deepEqual(parseDelimited('a,b,"c\nd"'), [['a','b','c\nd']]); assert.deepEqual(parseDelimited('a\tb\tc'), [['a','b','c']]); });
  check('malformed quote rejected, not silently skipped', () => { assert.throws(() => parseDelimited('a,b,"c')); assert.throws(() => parseDelimited('a,b,"c"broken')); });
  const { createEmptyExamState } = await server.ssrLoadModule('/src/types/exam.ts');
  const { invigilatorForPeriod } = await server.ssrLoadModule('/src/types/examSchedule.ts');
  const period = { id: 'p1', date: '2026-11-07', subject: '數學', startTime: '09:00', endTime: '10:00', grades: [] };
  const { announcementsForPeriod } = await server.ssrLoadModule('/src/types/announcements.ts');
  check('period CSV selects applicable announcements by display time, subject and audience', () => {
    const base = { subject: '', targetAudience: 'all', publishedAt: '2026-11-07T00:30:00Z' };
    const announcements = [
      { ...base, id: 'before-exam' },
      { ...base, id: 'this-period', subject: '數學', targetAudience: 'grade_1', startsAt: '2026-11-07T01:10:00Z' },
      { ...base, id: 'different-subject', subject: '國文' },
      { ...base, id: 'different-room', targetAudience: '102' },
      { ...base, id: 'at-next-period', startsAt: '2026-11-07T02:00:00Z' },
      { ...base, id: 'ended-before-period', endsAt: '2026-11-07T01:00:00Z' },
      { ...base, id: 'previous-day', publishedAt: '2026-11-06T01:00:00Z' },
      { ...base, id: 'spans-period', publishedAt: '2026-11-06T01:00:00Z', endsAt: '2026-11-07T01:20:00Z' }
    ];
    assert.deepEqual(announcementsForPeriod(announcements, period, [{ classId: '101', grade: 1 }]).map(({ id }) => id),
      ['before-exam', 'this-period', 'spans-period']);
  });
  const makeState = () => ({ ...createEmptyExamState(), config: { ...createEmptyExamState().config, periods: [period] }, teachers: [{ id: 'stable-id', name: '測試教師', username: 'test-teacher', department: '測試', assignedClassId: '', examAuthorAssignments: [{ subject: '數學', grade: 1 }] }], classrooms: [{ classId: '101', className: '測試班', grade: 1, expectedCount: 5, presentCount: 0, absentCount: 0, absentStudents: [], totalSeats: 30, invigilator: '測試教師', statusReported: false, lastUpdated: '', periodInvigilators: { p1: 'stable-id' }, periodAttendance: {} }] });
  check('period-only invigilator resolves correctly', () => { const s = makeState(); assert.equal(invigilatorForPeriod(s.classrooms[0], period.id, s.teachers)?.id, 'stable-id'); });
  const { AdminView } = await server.ssrLoadModule('/src/components/admin/AdminView.tsx');
  check('unreported matrix does not claim perfect attendance', () => { const html = renderToStaticMarkup(React.createElement(AdminView, { data: makeState() })); assert.match(html, /待點名/); assert.doesNotMatch(html, /全勤到齊|全班到齊/); assert.match(html, /點名狀態/); });
  check('empty issues and teachers have actionable empty states', () => { const s = makeState(); s.teachers = []; assert.match(renderToStaticMarkup(React.createElement(AdminView, { data: s, activeAdminTab: 'issues' })), /目前沒有考場通報/); assert.match(renderToStaticMarkup(React.createElement(AdminView, { data: s, activeAdminTab: 'teachers' })), /尚未建立教師名冊/); });
  const { api } = await server.ssrLoadModule('/worker/examRoutes.ts');
  const { visibleIssue } = await server.ssrLoadModule('/worker/visibility.ts');
  let state = makeState();
  const session = { role: 'invigilator', classId: '101', invigilation: [{ classId: '101', periodId: 'p1' }] };
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('state', state);
    c.set('session', session);
    c.set('body', await c.req.json());
    c.set('broadcast', (event, data) => {
      if (event === 'PERIOD_ATTENDANCE_UPDATED') state.classrooms[0].periodAttendance[data.periodId] = data.attendance;
    });
    await next();
  });
  app.route('/', api);
  const post = (path, body) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const attendance = { classId: '101', periodId: 'p1', expectedPeriod: period, expectedLastUpdated: null, expectedCount: 5, presentCount: 5, absentCount: 0, absentStudents: [] };
  assert.equal((await post('/api/exam/attendance', attendance)).status, 200); passed++; console.log('PASS initial attendance saved');
  const version = state.classrooms[0].periodAttendance.p1.lastUpdated;
  assert.equal((await post('/api/exam/attendance', attendance)).status, 409); passed++; console.log('PASS stale confirmation cannot overwrite newer attendance');
  assert.equal(state.classrooms[0].periodAttendance.p1.lastUpdated, version);
  assert.equal((await post('/api/exam/attendance', { ...attendance, expectedLastUpdated: version })).status, 200); passed++; console.log('PASS fresh attendance version can save');
  state.config.periods.push({ ...period, id: 'p2', subject: '國文', startTime: '10:10', endTime: '11:00' });
  const issue = { classId: '101', type: 'general', content: '考場時鐘停走' };
  assert.equal((await post('/api/exam/issue', issue)).status, 400);
  assert.equal((await post('/api/exam/issue', { ...issue, periodId: 'p2' })).status, 403);
  assert.equal((await post('/api/exam/issue', { ...issue, periodId: 'p1', expectedPeriod: { ...period, subject: '舊考科' } })).status, 409);
  assert.equal(state.issues.length, 0);
  const submitted = await post('/api/exam/issue', { ...issue, periodId: 'p1', expectedPeriod: period });
  assert.equal(submitted.status, 200);
  assert.equal(state.issues[0].periodId, 'p1');
  assert.match(state.issues[0].periodLabel, /數學/);
  check('issue access is period-scoped and unassigned history remains visible to the classroom', () => {
    const otherPeriod = { ...session, invigilation: [{ classId: '101', periodId: 'p2' }] };
    assert.equal(visibleIssue(state.issues[0], session), true);
    assert.equal(visibleIssue(state.issues[0], otherPeriod), false);
    assert.equal(visibleIssue(state.issues[0], { role: 'admin' }), true);
    assert.equal(visibleIssue(issue, otherPeriod), true);
    assert.ok(!visibleIssue(issue, null));
  });
  state = makeState();
  const sameTeacher = { name: '更新姓名', username: 'test-teacher', password: 'SafeTestPassword123456', department: '雙語,英文', assignedClassId: '' };
  assert.equal((await post('/api/exam/teachers/import', { mode: 'replace', teachers: [sameTeacher] })).status, 200);
  assert.equal(state.teachers[0].id, 'stable-id'); assert.equal(state.classrooms[0].periodInvigilators.p1, 'stable-id'); assert.equal(state.teachers[0].examAuthorAssignments[0].subject, '數學'); passed++; console.log('PASS roster replacement preserves IDs and assignments');
  assert.equal((await post('/api/exam/teachers/import', { mode: 'replace', teachers: [{ ...sameTeacher, username: 'different' }] })).status, 409); passed++; console.log('PASS referenced teacher removal is blocked');
  const { examSync } = await server.ssrLoadModule('/src/services/examSync.ts');
  const oldFetch = globalThis.fetch; const oldWindow = globalThis.window;
  const events = []; const unsubscribe = examSync.subscribe((event, data) => events.push([event, data]));
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.fetch = async (path) => Response.json({ success: true, data: path === '/api/exam/state' ? state : { ...state.classrooms[0], lastUpdated: version } });
  await examSync.updateAttendance(attendance);
  assert.ok(events.some(([event, data]) => event === 'INIT_STATE' && data.classrooms.length === 1)); passed++; console.log('PASS HTTP save refreshes UI without WebSocket');
  events.length = 0;
  let releaseSnapshot;
  let markSnapshotRequested;
  const snapshotRequested = new Promise((resolve) => { markSnapshotRequested = resolve; });
  globalThis.fetch = async (path) => {
    if (path === '/api/exam/state') {
      return new Promise((resolve) => { releaseSnapshot = resolve; markSnapshotRequested(); });
    }
    return Response.json({ success: true, data: {} });
  };
  const delayedSave = assert.rejects(examSync.updateAttendance(attendance), /登入狀態已變更/);
  await snapshotRequested;
  await examSync.logout();
  releaseSnapshot(Response.json({ success: true, data: state }));
  await delayedSave;
  assert.ok(!events.some(([event]) => event === 'INIT_STATE')); passed++; console.log('PASS delayed authenticated snapshot cannot return after logout');
  globalThis.fetch = oldFetch; globalThis.window = oldWindow; unsubscribe();
  console.log(`All ${passed} UX regression checks passed (in-memory only).`);
} finally { await server.close(); }
