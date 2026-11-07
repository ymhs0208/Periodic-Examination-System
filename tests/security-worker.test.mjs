import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';

test('isolated Worker: REST/WS privacy, auth, audit, headers, recent verification and quotas', { timeout: 90000 }, async () => {
  // Only the test bundle shortens recent-auth to one second and the per-IP socket cap to eight.
  // No test route, binding or shortened policy is written to production source.
  const bundle = await build({entryPoints:['worker/worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['module','main'],external:['cloudflare:*','node:*'],plugins:[{name:'test-recent-auth-window',setup(build){build.onLoad({filter:/worker[\\/]worker\.ts$/},async ({path}) => ({contents:(await readFile(path,'utf8')).replace('Date.now() - proof.verified_at > 5 * 60_000','Date.now() - proof.verified_at > 1000').replace('?.ip === ip).length >= 128','?.ip === ip).length >= 8'),loader:'ts'}));}}]});
  const password = crypto.randomUUID(); const teacherPassword = crypto.randomUUID();
  const mf = new Miniflare(await convertV4MiniflareOptions({script:bundle.outputFiles[0].text,modules:true,compatibilityDate:'2026-11-07',durableObjects:{EXAM:{className:'ExamRoom',useSQLite:true}},bindings:{ADMIN_USERNAME:'local-test-admin',ADMIN_PASSWORD:password},serviceBindings:{ASSETS:()=>new Response('<!doctype html><title>local test</title>',{headers:{'Content-Type':'text/html'}})},log:new Log(LogLevel.ERROR)}));
  const sockets=[];
  const request = async (path, method='GET', body, cookie) => {
    const res = await mf.dispatchFetch(`http://localhost${path}`,{method,headers:{...(body ? {'Content-Type':'application/json'}:{}),...(cookie ? {Cookie:cookie}:{})},...(body ? {body:JSON.stringify(body)}:{})});
    return {res, data: await res.json()};
  };
  let adminCookie;
  const adminRequest = async (path,method,body) => {
    let reply=await request(path,method,body,adminCookie);
    if(reply.res.status===428){assert.equal((await request('/api/auth/reauth','POST',{password},adminCookie)).res.status,200);reply=await request(path,method,body,adminCookie);}
    return reply;
  };
  const wsSnapshot = async(cookie) => {
    const res=await mf.dispatchFetch('http://localhost/ws',{headers:{Upgrade:'websocket',...(cookie ? {Cookie:cookie}:{})}});
    assert.equal(res.status,101); const ws=res.webSocket; sockets.push(ws); ws.accept();
    const data=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('snapshot timeout')),5000);ws.addEventListener('message',event=>{clearTimeout(timeout);resolve(JSON.parse(event.data));},{once:true});});
    return {ws,data};
  };
  try {
    const html=await mf.dispatchFetch('http://localhost/blackboard');
    assert.match(html.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
    assert.match(html.headers.get('Content-Security-Policy'),/script-src 'self'/);
    assert.equal(html.headers.get('X-Frame-Options'),'DENY'); assert.equal(html.headers.get('Referrer-Policy'),'no-referrer');
    assert.match(html.headers.get('Permissions-Policy'),/microphone=\(\)/);
    assert.equal((await request('/api/auth/admins')).res.status,401);
    const login=await request('/api/auth/login','POST',{role:'admin',username:'local-test-admin',password});
    assert.equal(login.res.status,200); adminCookie=login.res.headers.get('Set-Cookie').split(';')[0];
    assert.equal((await adminRequest('/api/exam/classroom','POST',{classId:'test-room',grade:9,className:'測試考場',invigilator:'測試監考',expectedCount:30})).res.status,200);
    for(const body of [{unknownSetting:true},{schoolName:null},{rulesNotes:[12]}]) assert.equal((await adminRequest('/api/exam/config','PATCH',body)).res.status,400);
    assert.equal((await adminRequest('/api/exam/announcement','POST',{title:{},content:'測試'})).res.status,400);
    assert.equal((await adminRequest('/api/exam/teachers','POST',{name:'測試教師',username:'local-test-teacher',password:'short'})).res.status,400);
    assert.equal((await adminRequest('/api/exam/teachers/import','POST',{mode:'merge',teachers:[{name:'測試',username:'test-weak',password:'short'}]})).res.status,400);
    assert.equal((await adminRequest('/api/exam/teachers','POST',{name:'測試教師',username:'local-test-teacher',password:teacherPassword,assignedClassId:'test-room'})).res.status,200);
    const teacherId=(await request('/api/exam/state','GET',undefined,adminCookie)).data.data.teachers[0].id;
    assert.equal((await adminRequest('/api/exam/teachers','POST',{id:teacherId,name:'測試教師',username:'local-test-teacher',password:'short'})).res.status,400);
    const teacherLogin=await request('/api/auth/login','POST',{role:'invigilator',username:'local-test-teacher',password:teacherPassword});
    assert.equal(teacherLogin.res.status,200);const teacherCookie=teacherLogin.res.headers.get('Set-Cookie').split(';')[0];
    assert.equal((await request('/api/auth/admins','GET',undefined,teacherCookie)).res.status,403);
    const privateReason='病假：隔離測試私人原因';
    const attendance={classId:'test-room',expectedLastUpdated:null,expectedCount:30,presentCount:29,absentCount:1,absentStudents:[{seatNo:1,name:'測試學生',reason:privateReason}]};
    const anon=await wsSnapshot(); const teacher=await wsSnapshot(teacherCookie);
    const nextEvent=(ws)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('update timeout')),5000);ws.addEventListener('message',e=>{clearTimeout(timer);resolve(JSON.parse(e.data));},{once:true});});
    const anonUpdate=nextEvent(anon.ws);const teacherUpdate=nextEvent(teacher.ws);
    assert.equal((await adminRequest('/api/exam/attendance','POST',attendance)).res.status,200);
    const anonPayload=(await anonUpdate).payload;const teacherPayload=(await teacherUpdate).payload;
    assert.equal(anonPayload.absentStudents[0].name,'');assert.equal(anonPayload.absentStudents[0].reason,'');assert.equal(teacherPayload.absentStudents[0].reason,privateReason);
    const publicState=(await request('/api/exam/state')).data.data;
    assert.equal(publicState.classrooms[0].absentStudents[0].reason,'');assert.equal(publicState.classrooms[0].absentStudents[0].name,'');
    assert.equal((await request('/api/exam/state','GET',undefined,teacherCookie)).data.data.classrooms[0].absentStudents[0].reason,privateReason);

    const periods=[
      {id:'first',date:'2026-11-07',startTime:'09:00',endTime:'10:00',subject:'數學',grades:[]},
      {id:'second',date:'2026-11-07',startTime:'10:10',endTime:'11:10',subject:'國文',grades:[]}
    ];
    assert.equal((await adminRequest('/api/exam/periods','PATCH',{expectedPeriods:[],periods})).res.status,200);
    assert.equal((await adminRequest('/api/exam/period-invigilators','PATCH',{
      classId:'test-room',periodId:'second',teacherId:null,expectedTeacherId:teacherId
    })).res.status,200);
    const otherPeriodUpdate=nextEvent(anon.ws);
    assert.equal((await adminRequest('/api/exam/attendance','POST',{...attendance,periodId:'second'})).res.status,200);
    const otherPeriodEvent=await otherPeriodUpdate;
    assert.equal(otherPeriodEvent.event,'PERIOD_ATTENDANCE_UPDATED');
    assert.deepEqual(otherPeriodEvent.payload.attendance.absentStudents,[{seatNo:1,name:'',reason:''}]);
    assert.deepEqual((await wsSnapshot()).data.payload.classrooms[0].periodAttendance.second.absentStudents,[{seatNo:1,name:'',reason:''}]);
    assert.deepEqual((await request('/api/exam/state')).data.data.classrooms[0].periodAttendance.second.absentStudents,[{seatNo:1,name:'',reason:''}]);
    const firstAttendance={...attendance,periodId:'first',absentStudents:[{seatNo:2,name:'本節測試學生',reason:'病假'}]};
    assert.equal((await request('/api/exam/attendance','POST',{...attendance,periodId:'second'},teacherCookie)).res.status,403);
    const forged=await request('/api/exam/attendance','POST',{
      ...firstAttendance,expectedCount:1,presentCount:1,absentCount:0,absentStudents:[]
    },teacherCookie);
    assert.equal(forged.res.status,409);
    assert.equal((await request('/api/exam/state')).data.data.classrooms[0].periodAttendance.first,undefined);
    const firstPeriodUpdate=nextEvent(anon.ws);
    const saved=await request('/api/exam/attendance','POST',firstAttendance,teacherCookie);
    assert.equal(saved.res.status,200);
    assert.deepEqual(saved.data.data.absentStudents,firstAttendance.absentStudents);
    assert.equal(saved.data.data.periodAttendance,undefined);
    assert.ok(!JSON.stringify(saved.data).includes(privateReason));
    assert.deepEqual((await firstPeriodUpdate).payload.attendance.absentStudents,[{seatNo:2,name:'',reason:'病假'}]);
    assert.equal((await request('/api/exam/state')).data.data.classrooms[0].periodAttendance.first.expectedCount,30);
    assert.equal((await adminRequest('/api/exam/classroom/test-room','PATCH',{expectedCount:31})).res.status,200);
    const retry={...firstAttendance,expectedLastUpdated:saved.data.data.lastUpdated};
    assert.equal((await request('/api/exam/attendance','POST',retry,teacherCookie)).res.status,409);
    const updated=await request('/api/exam/attendance','POST',{...retry,expectedCount:31,presentCount:30},teacherCookie);
    assert.equal(updated.res.status,200);
    assert.equal(updated.data.data.expectedCount,31);

    await wait(1200);
    assert.equal((await request('/api/auth/admins','POST',{username:'local-second-admin',password:crypto.randomUUID()},adminCookie)).res.status,428);
    assert.equal((await request('/api/auth/reauth','POST',{password:crypto.randomUUID()},adminCookie)).res.status,401);
    assert.equal((await request('/api/auth/reauth','POST',{password},adminCookie)).res.status,200);
    assert.equal((await request('/api/auth/admins','POST',{username:'local-second-admin',password:crypto.randomUUID()},adminCookie)).res.status,200);
    const logs=(await request('/api/admin/audit-logs','GET',undefined,adminCookie)).data.data.entries;
    for(const action of ['accessDenied','loginFailed','reauthenticate'])assert.ok(logs.some(e=>e.action===action),action);
    assert.ok(logs.every(e=>!JSON.stringify(e).includes(password)));

    assert.equal((await adminRequest('/api/exam/config','PATCH',{
      schoolName:'測試學校',academicYear:'115',examName:'測試段考',rulesNotes:['測試考場守則']
    })).res.status,200);
    assert.equal((await adminRequest('/api/exam/announcement','POST',{title:'測試公告',content:'測試內容'})).res.status,200);
    assert.equal((await request('/api/exam/issue','POST',{classId:'test-room',periodId:'first',content:'測試通報'},teacherCookie)).res.status,200);
    assert.equal((await adminRequest('/api/exam/teachers','POST',{id:teacherId,name:'測試教師',username:'local-test-teacher',
      examAuthorAssignments:[{subject:'數學',grade:9}]})).res.status,200);
    assert.equal((await request('/api/exam/corrections','POST',{
      subject:'數學',targetAudience:'grade_9',title:'測試更正',content:'測試內容'
    },teacherCookie)).res.status,200);

    const resetPath='/api/exam/reset';
    const resetBody={scope:'all',confirmation:'刪除',expectedResetId:null};
    assert.equal((await request(resetPath,'POST',resetBody)).res.status,401);
    assert.equal((await request(resetPath,'POST',resetBody,teacherCookie)).res.status,403);
    assert.equal((await request(resetPath,'POST',{...resetBody,scope:'current'},teacherCookie)).res.status,403);
    assert.equal((await adminRequest(resetPath,'POST',{...resetBody,scope:undefined})).res.status,400);
    assert.equal((await adminRequest(resetPath,'POST',{...resetBody,confirmation:' 刪除 '})).res.status,400);
    const beforeReset=(await request('/api/exam/state','GET',undefined,adminCookie)).data.data;
    assert.equal(beforeReset.classrooms.length,1);
    assert.equal(beforeReset.correctionProposals.length,1);
    await wait(1200);
    assert.equal((await request(resetPath,'POST',resetBody,adminCookie)).res.status,428);
    assert.equal((await request('/api/auth/reauth','POST',{password},adminCookie)).res.status,200);

    const teacherCurrentReset=nextEvent(teacher.ws);
    assert.equal((await adminRequest(resetPath,'POST',{...resetBody,scope:'current'})).res.status,200);
    const currentResetEvent=await teacherCurrentReset;
    assert.equal(currentResetEvent.event,'INIT_STATE');
    assert.equal(currentResetEvent.session.role,'invigilator');
    assert.deepEqual(currentResetEvent.session.invigilation,[]);
    assert.equal(currentResetEvent.session.canSubmitCorrections,false);
    const cleared=(await request('/api/exam/state','GET',undefined,adminCookie)).data.data;
    assert.equal(cleared.resetId,currentResetEvent.payload.resetId);
    assert.equal(cleared.config.schoolName,'測試學校');
    assert.equal(cleared.config.academicYear,'115');
    assert.deepEqual(cleared.config.rulesNotes,['測試考場守則']);
    assert.equal(cleared.config.examName,'');
    assert.equal(cleared.config.periods,undefined);
    for(const key of ['announcements','issues','correctionProposals']) assert.equal(cleared[key]?.length ?? 0,0,key);
    assert.deepEqual(cleared.teachers.map(({id,assignedClassId,examAuthorAssignments})=>({id,assignedClassId,examAuthorAssignments})),[
      {id:teacherId,assignedClassId:'',examAuthorAssignments:[]}
    ]);
    assert.equal(cleared.classrooms[0].classId,'test-room');
    assert.equal(cleared.classrooms[0].expectedCount,31);
    assert.equal(cleared.classrooms[0].statusReported,false);
    assert.deepEqual(cleared.classrooms[0].absentStudents,[]);
    assert.equal(cleared.classrooms[0].periodAttendance,undefined);
    assert.equal(cleared.classrooms[0].periodInvigilators,undefined);
    assert.equal((await request('/api/auth/session','GET',undefined,teacherCookie)).data.data.teacherId,teacherId);
    assert.equal((await adminRequest('/api/exam/periods','PATCH',{expectedPeriods:[],periods})).res.status,200);
    assert.equal((await adminRequest('/api/exam/attendance','POST',{
      ...firstAttendance,expectedCount:31,presentCount:30
    })).res.status,200);

    const publicReset=nextEvent(anon.ws);
    const teacherDisconnected=new Promise((resolve) => teacher.ws.addEventListener('close',resolve,{once:true}));
    assert.equal((await adminRequest(resetPath,'POST',{...resetBody,expectedResetId:cleared.resetId})).res.status,200);
    const resetEvent=await publicReset;
    assert.equal(resetEvent.event,'INIT_STATE');
    assert.deepEqual(resetEvent.payload.classrooms,[]);
    await teacherDisconnected;
    assert.equal((await request('/api/auth/session','GET',undefined,teacherCookie)).data.data,null);
    assert.equal((await request('/api/auth/session','GET',undefined,adminCookie)).data.data.role,'admin');
    assert.equal((await request('/api/auth/admins','GET',undefined,adminCookie)).data.data.accounts.length,2);
    const afterReset=(await request('/api/exam/state','GET',undefined,adminCookie)).data.data;
    assert.notEqual(afterReset.resetId,undefined);
    assert.equal(afterReset.resetId,resetEvent.payload.resetId);
    assert.equal(afterReset.config.schoolName,'');
    assert.equal(afterReset.config.periods,undefined);
    for(const key of ['classrooms','teachers','announcements','issues','correctionProposals']) assert.equal(afterReset[key]?.length ?? 0,0,key);
    const resetLogs=(await request('/api/admin/audit-logs','GET',undefined,adminCookie)).data.data.entries;
    assert.ok(resetLogs.some(entry=>entry.action==='examReset'));
    assert.ok(resetLogs.some(entry=>entry.action==='examClearCurrent'));
    assert.ok(resetLogs.some(entry=>entry.action==='announcementPublish'));
    assert.equal((await adminRequest('/api/exam/classroom','POST',{
      classId:'test-room',grade:9,className:'重建考場',invigilator:'測試監考',expectedCount:30
    })).res.status,200);
    assert.equal((await adminRequest('/api/exam/periods','PATCH',{expectedPeriods:[],periods})).res.status,200);
    assert.equal((await adminRequest(resetPath,'POST',resetBody)).res.status,409);
    const recreated=(await request('/api/exam/state','GET',undefined,adminCookie)).data.data;
    assert.equal(recreated.classrooms.length,1);
    assert.equal(recreated.classrooms[0].periodAttendance,undefined);

    for(let i=sockets.filter(ws=>ws.readyState===WebSocket.OPEN).length;i<8;i++) await wsSnapshot();
    const quota=await mf.dispatchFetch('http://localhost/ws',{headers:{Upgrade:'websocket'}});assert.equal(quota.status,429);
    let limited=false;
    for(let i=0;i<241;i++){const r=await request('/api/exam/state');if(r.res.status===429){limited=true;assert.equal(r.res.headers.get('Retry-After'),'60');break;}}
    assert.equal(limited,true);
  } finally {for(const ws of sockets)ws.close();await mf.dispose();}
});
