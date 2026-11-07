// Local regression tests only: no production requests or real credentials.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const { outputFiles } = await build({
  stdin: { contents: `export * from './src/types/exam'; export * from './worker/visibility'; export * from './worker/validation'; export * from './worker/passwords';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const api = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const base = () => {
  const state = api.createEmptyExamState();
  state.classrooms.push({ classId: 'test-room', grade: 9, className: '測試考場', invigilator: '測試教師', expectedCount: 30, presentCount: 29, absentCount: 1, absentStudents: [{seatNo:1,name:'測試學生',reason:'病假'}], totalSeats:30, statusReported:true, lastUpdated:'', periodAttendance: { 'test-period': {expectedCount:30,presentCount:29,absentCount:1,absentStudents:[{seatNo:1,name:'測試學生',reason:'其他私人原因'}],statusReported:true,lastUpdated:''} } });
  return state;
};
test('M01: public attendance removes names and free-text reasons while keeping standard categories', () => {
  const state = base(); const view = api.visibleState(state,null);
  assert.deepEqual(view.classrooms[0].absentStudents, [{seatNo:1,name:'',reason:'病假'}]);
  assert.deepEqual(view.classrooms[0].periodAttendance['test-period'].absentStudents, [{seatNo:1,name:'',reason:''}]);
  for (const reason of api.ABSENCE_REASONS) assert.equal(api.publicAbsenceReason(` ${reason} `),reason);
  for (const reason of ['病假：私人備註','其他私人原因','',null,undefined]) assert.equal(api.publicAbsenceReason(reason),'');
  assert.equal(api.visibleState(state,{role:'admin',username:'test'}).classrooms[0].absentStudents[0].reason,'病假');
  const teacher = {role:'invigilator',username:'test',invigilation:[{classId:'test-room',periodId:'test-period'}]};
  assert.equal(api.visibleState(state,teacher).classrooms[0].periodAttendance['test-period'].absentStudents[0].reason,'其他私人原因');
});
test('M02: shared minimum/maximum and simple password policy', () => {
  assert.equal(api.validTeacherPassword('short'),false);
  assert.equal(api.validTeacherPassword('123456789012'),false);
  assert.equal(api.validTeacherPassword('a'.repeat(12)),false);
  assert.equal(api.validTeacherPassword('春季考務測試用長密語2026'),true);
  assert.equal(api.validTeacherPassword('x'.repeat(257)),false);
});
test('M03: config, announcement, counts and issue boundary validation rejects wrong types without mutation', () => {
  const state = base(); const before = structuredClone(state);
  const cases = [
    ['/api/exam/config',{unknownSetting:true}], ['/api/exam/config',{schoolName:12}],
    ['/api/exam/config',{examDate:'2026-02-30'}], ['/api/exam/config',{rulesNotes:[null]}],
    ['/api/exam/config',{durationMinutes:Infinity}], ['/api/exam/announcement',{title:[],content:'測試'}],
    ['/api/exam/announcement',{title:'測試',content:'測試',priority:'other'}],
    ['/api/exam/announcement',{title:'測試',content:'測試',targetAudience:'grade_999'}],
    ['/api/exam/classroom/test-room',{expectedCount:1.5}], ['/api/exam/classroom/test-room',{totalSeats:NaN}],
    ['/api/exam/issue/test',{status:'unknown'}], ['/api/exam/issue/test',{reply:{}}],
    ['/api/exam/teachers',{name:{},username:'test'}], ['/api/exam/teachers/import',{mode:'unknown',teachers:[]}],
  ];
  for (const [path,body] of cases) assert.ok(api.validateMutation(path,'PATCH',body,state),path);
  assert.deepEqual(state,before);
  assert.equal(api.validateMutation('/api/exam/config','PATCH',{schoolName:'測試學校',rulesNotes:[]},state),null);
  assert.equal(api.validateMutation('/api/exam/announcement','POST',{title:'測試',content:'測試',targetAudience:'all'},state),null);
});
test('L01: password hashing and dummy verification use matching scrypt parameters', async () => {
  // Generated for this test, never written to disk or logged.
  const secret = crypto.randomUUID(); const hash = await api.hashPassword(secret);
  assert.equal(await api.verifyPassword(secret,hash),true);
  assert.equal(await api.verifyPassword(crypto.randomUUID(),hash),false);
  assert.equal(await api.verifyPassword(secret,api.DUMMY_PASSWORD_HASH),false);
  assert.equal(hash.split('$')[1],api.DUMMY_PASSWORD_HASH.split('$')[1]);
});
