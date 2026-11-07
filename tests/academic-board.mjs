// In-memory projection tests only. No credentials, database, or deployed site.
// Run: node tests/academic-board.mjs
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let count = 0;
const check = (label, run) => { run(); count++; console.log(`PASS ${label}`); };
try {
  const { academicOverview, academicStatus } = await vite.ssrLoadModule('/src/components/academic/academicOverview.ts');
  const { createEmptyExamState } = await vite.ssrLoadModule('/src/types/exam.ts');
  const { AcademicBoardView } = await vite.ssrLoadModule('/src/components/academic/AcademicBoardView.tsx');
  const { Header } = await vite.ssrLoadModule('/src/components/Header.tsx');
  const { LoginPage } = await vite.ssrLoadModule('/src/components/auth/LoginPage.tsx');
  const period = { id: 'p1', date: '2026-11-07', startTime: '09:00', endTime: '10:00', subject: '國文', grades: [1] };
  const record = { expectedCount: 30, presentCount: 27, absentCount: 3, absentStudents: [{ seatNo: 1, name: '絕不可投影姓名', reason: '絕不可投影原因' }], statusReported: true, lastUpdated: '2026-11-07T01:05:00Z' };
  const room = (id, extra = {}) => ({ classId: id, className: `${id}班`, grade: 1, invigilator: '不應投影帳號', totalSeats: 30, ...record, statusReported: false, periodAttendance: {}, ...extra });
  const state = () => { const data = createEmptyExamState(); data.config.periods = [period]; data.classrooms = [room('103', { periodAttendance: { p1: { ...record, presentCount: 30, absentCount: 0 } } }), room('102', { periodAttendance: { p1: record } }), room('101')]; return data; };
  const now = new Date('2026-11-07T01:30:00Z');
  check('all rooms appear immediately; missing/high absences first', () => {
    const o = academicOverview(state(), now);
    assert.deepEqual(o.rooms.map((item) => item.room.classId), ['101', '102', '103']);
    assert.equal(o.totals.total, 3); assert.equal(o.totals.missing, 1); assert.equal(o.totals.unknownPeople, 30);
    assert.equal(o.totals.present, 57); assert.equal(o.totals.absent, 3); assert.equal(o.totals.reported, 2);
  });
  check('future periods are not false missing alerts', () => {
    const o = academicOverview(state(), new Date('2026-11-07T00:30:00Z'));
    assert.equal(o.totals.missing, 0); assert.equal(academicStatus(o.rooms.find((i) => i.room.classId === '101')), '未開始');
  });
  check('today without periods never reuses old attendance', () => {
    const o = academicOverview(state(), new Date('2026-11-08T01:30:00Z'));
    assert.equal(o.rooms.length, 3); assert.equal(o.totals.reported, 0); assert.equal(o.totals.present, 0); assert.equal(o.totals.absent, 0);
    assert.ok(o.rooms.every((item) => item.phase === 'none' && !item.missing));
  });
  check('simultaneous grade-specific subjects use each classroom schedule', () => {
    const data = state(); data.config.periods.push({ ...period, id: 'p2', subject: '英文', grades: [2] }); data.classrooms[0].grade = 2;
    assert.equal(academicOverview(data, now).rooms.find((item) => item.room.classId === '103').period.subject, '英文');
  });
  check('new period does not reuse previous period counts', () => {
    const data = state(); data.config.periods.push({ ...period, id: 'next', startTime: '10:30', endTime: '11:30' });
    const o = academicOverview(data, new Date('2026-11-07T02:40:00Z'));
    assert.equal(o.totals.missing, 3); assert.equal(o.totals.reported, 0);
  });
  check('ended period missing remains visible', () => assert.equal(academicOverview(state(), new Date('2026-11-07T03:40:00Z')).totals.missing, 1));
  check('high absence threshold covers 3 people and ten percent', () => {
    const data = state(); data.classrooms[1].periodAttendance.p1 = { ...record, expectedCount: 10, presentCount: 9, absentCount: 1 };
    assert.equal(academicOverview(data, now).totals.highAbsence, 1);
    data.classrooms[1].periodAttendance.p1 = { ...record, expectedCount: 40, presentCount: 38, absentCount: 2 };
    assert.equal(academicOverview(data, now).totals.highAbsence, 0);
  });
  check('urgent issues first; old or resolved issues do not create false alerts', () => {
    const data = state(); data.issues = [{ id: 'x', classId: '103', type: 'urgent', status: 'pending', createdAt: '2026-11-07T01:00:00Z', content: '私人內容' }, { id: 'y', classId: '101', type: 'urgent', status: 'pending', createdAt: '2026-11-06T01:00:00Z' }, { id: 'z', classId: '102', type: 'urgent', status: 'resolved', createdAt: '2026-11-07T01:00:00Z' }];
    const o = academicOverview(data, now); assert.equal(o.rooms[0].room.classId, '103'); assert.equal(o.totals.openIssues, 1);
  });
  check('empty state is valid', () => assert.equal(academicOverview(createEmptyExamState(), now).totals.total, 0));
  // Minimal browser globals for SSR-only projection smoke tests.
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  const props = { data: state(), liveConnection: 'offline', lastDataReceivedAt: '2026-11-07T01:30:00Z', onReconnect() {}, onOpenOperations() {} };
  check('projection renders connection warning but no private details', () => {
    const html = renderToStaticMarkup(React.createElement(AcademicBoardView, props));
    assert.match(html, /網路離線/); assert.match(html, /舊資料/); assert.match(html, /全螢幕投影/);
    assert.doesNotMatch(html, /絕不可投影姓名|絕不可投影原因|不應投影帳號/);
  });
  check('header does not show board entries', () => {
    const header = (admin) => renderToStaticMarkup(React.createElement(Header, { activeView: 'academic', currentPath: '/board/academic', isAdminAuthed: admin, isInvigilatorAuthed: false, autoOpenMenuSignal: 0, loggedInUsername: '', onViewChange() {}, onNavigateAdminTab() {}, onLogout() {} }));
    assert.doesNotMatch(header(true), /教務處看板|出席即時看板|教室電子黑板/);
    assert.doesNotMatch(header(false), /href="\/board\/academic"/);
  });
  check('direct route asks for administrator login', () => assert.match(renderToStaticMarkup(React.createElement(LoginPage, { config: state().config, intendedView: 'academic', onLoginSuccess() {}, onNavigateView() {} })), /教務處看板登入|教務管理員帳號/));
  console.log(`All ${count} academic-board checks passed.`);
} finally { delete globalThis.window; await vite.close(); }
