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
    const attendance={classId:'test-room',expectedLastUpdated:null,expectedCount:30,presentCount:29,absentCount:1,absentStudents:[{seatNo:1,name:'測試學生',reason:'病假'}]};
    const anon=await wsSnapshot(); const teacher=await wsSnapshot(teacherCookie);
    const nextEvent=(ws)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('update timeout')),5000);ws.addEventListener('message',e=>{clearTimeout(timer);resolve(JSON.parse(e.data));},{once:true});});
    const anonUpdate=nextEvent(anon.ws);const teacherUpdate=nextEvent(teacher.ws);
    assert.equal((await adminRequest('/api/exam/attendance','POST',attendance)).res.status,200);
    const anonPayload=(await anonUpdate).payload;const teacherPayload=(await teacherUpdate).payload;
    assert.equal(anonPayload.absentStudents[0].name,'');assert.equal(anonPayload.absentStudents[0].reason,'');assert.equal(teacherPayload.absentStudents[0].reason,'病假');
    const publicState=(await request('/api/exam/state')).data.data;
    assert.equal(publicState.classrooms[0].absentStudents[0].reason,'');assert.equal(publicState.classrooms[0].absentStudents[0].name,'');
    assert.equal((await request('/api/exam/state','GET',undefined,teacherCookie)).data.data.classrooms[0].absentStudents[0].reason,'病假');
    await wait(1200);
    assert.equal((await request('/api/auth/admins','POST',{username:'local-second-admin',password:crypto.randomUUID()},adminCookie)).res.status,428);
    assert.equal((await request('/api/auth/reauth','POST',{password:crypto.randomUUID()},adminCookie)).res.status,401);
    assert.equal((await request('/api/auth/reauth','POST',{password},adminCookie)).res.status,200);
    assert.equal((await request('/api/auth/admins','POST',{username:'local-second-admin',password:crypto.randomUUID()},adminCookie)).res.status,200);
    const logs=(await request('/api/admin/audit-logs','GET',undefined,adminCookie)).data.data.entries;
    for(const action of ['accessDenied','loginFailed','reauthenticate'])assert.ok(logs.some(e=>e.action===action),action);
    assert.ok(logs.every(e=>!JSON.stringify(e).includes(password)));
    for(let i=sockets.length;i<8;i++) await wsSnapshot();
    const quota=await mf.dispatchFetch('http://localhost/ws',{headers:{Upgrade:'websocket'}});assert.equal(quota.status,429);
    let limited=false;
    for(let i=0;i<241;i++){const r=await request('/api/exam/state');if(r.res.status===429){limited=true;assert.equal(r.res.headers.get('Retry-After'),'60');break;}}
    assert.equal(limited,true);
  } finally {for(const ws of sockets)ws.close();await mf.dispose();}
});
