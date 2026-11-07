/// <reference path="../worker-configuration.d.ts" />

import { DurableObject } from 'cloudflare:workers';
import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { createEmptyExamState, MIN_ADMIN_PASSWORD_LENGTH } from '../src/types/exam';
import type { AbsentStudent, AdminAccounts, ClassroomExamState, CorrectionProposal, ExamAttendance, ExamIssue, ExamSession, SystemData } from '../src/types/exam';
import { examPeriods, invigilationConflicts, LEGACY_PERIOD_ID, periodApplies } from '../src/types/examSchedule';
import { announcementStatus, nextAnnouncementBoundary } from '../src/types/announcements';
import { availableGrades } from '../src/types/grades';
import type { AuditAction, AuditLogEntry, AuditLogPage } from '../src/types/audit';
import { auditExpiry, examAuditOperation } from './audit';
import { api } from './examRoutes';
import { validateMutation } from './validation';
import { activeAnnouncements, canAccessPeriod, canAccessRoom, publicAbsences, visibleClassroom, visibleIssue, visibleState } from './visibility';
import { adminState, hashPassword, MAX_PASSWORD_LENGTH, DUMMY_PASSWORD_HASH, verifyPassword, type StoredExamState } from './passwords';

type WorkerEnv = Env & {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_ROTATION_ID?: string;
};

interface AdminCredentials {
  username: string;
  passwordHash?: string;
  password?: string;
  rotationId?: string;
}

type StoredAdminAccount = {
  id: string;
  username: string;
  password_hash: string;
  enabled: number;
  rotation_id: string | null;
};

type StoredSession = {
  role: ExamSession['role'];
  teacher_id: string;
  revision: string;
};

interface ExamEvent {
  event: string;
  payload: unknown;
}

interface PeriodAttendanceUpdate {
  classId: string;
  periodId: string;
  attendance: ExamAttendance;
}

export interface ExamVariables {
  state: StoredExamState;
  body: Record<string, any>;
  session: ExamSession | null;
  broadcast: (event: string, payload: unknown) => void;
}

const SESSION_SECONDS = 12 * 60 * 60;
const STATE_KEY = 'exam-state';
const ADMIN_KEY = 'admin-credentials';
const PRIMARY_ADMIN_ID = 'primary-admin';
const CLASS_WRITE_PATHS = /^\/api\/exam\/(attendance|issue|announcement\/[^/]+\/read)$/;
const MAX_ACCOUNT_LENGTH = 128;
const IP_FAILURES = { limit: 60, window: 5 * 60_000 };
const ACCOUNT_FAILURES = { limit: 8, window: 15 * 60_000 };
const MIGRATION_BATCH = 25;

function passwordRevision(hash?: string) {
  return hash?.split('$')[2] ?? '';
}

function sessionCookie(url: string) {
  return new URL(url).protocol === 'https:' ? '__Host-exam_session' : 'exam_session';
}

function isLoopback(url: URL) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}


export class ExamRoom extends DurableObject<WorkerEnv> {
  private pendingRequests = 0;
  private requestQueue: Promise<unknown> = Promise.resolve();
  private readonly readLimits = new Map<string, { count: number; until: number }>();
  private securityLogWindow = { count: 0, until: 0 };
  private readonly router = new Hono<{ Variables: ExamVariables }>();

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions_v2 (
        token TEXT PRIMARY KEY, role TEXT NOT NULL, teacher_id TEXT NOT NULL,
        expires INTEGER NOT NULL, revision TEXT NOT NULL
      );
      DROP TABLE IF EXISTS sessions;
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS admin_accounts (
        id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, enabled INTEGER NOT NULL, rotation_id TEXT
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS login_failures (
        scope TEXT PRIMARY KEY, failures INTEGER NOT NULL, expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS login_failures_expiry ON login_failures(expires);
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS exam_period_attendance (
        class_id TEXT NOT NULL, period_id TEXT NOT NULL, attendance TEXT NOT NULL,
        PRIMARY KEY (class_id, period_id)
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        actor TEXT NOT NULL, role TEXT NOT NULL, action TEXT NOT NULL, target TEXT
      );
      CREATE INDEX IF NOT EXISTS audit_log_expiry ON audit_log(expires_at);
    `);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS session_security (
      token TEXT PRIMARY KEY, verified_at INTEGER NOT NULL
    )`);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"event":"PING"}', '{"event":"PONG"}'));

    this.router.use('/api/*', (c, next) => bodyLimit({
      maxSize: c.req.path.startsWith('/api/exam/import/') ? 1024 * 1024 : 64 * 1024,
      onError: (c) => c.json({ success: false, error: '上傳資料超過大小限制' }, 413)
    })(c, next));

    this.router.use('*', async (c, next) => {
      const method = c.req.method;
      const path = c.req.path;
      const origin = c.req.header('Origin');
      c.header('Cache-Control', 'no-store');
      c.header('X-Request-ID', crypto.randomUUID());
      // Admission control runs before JSON parsing, state loads and expensive hashes.
      const ip = c.req.header('CF-Connecting-IP') || 'local';
      const category = path === '/ws' ? 'ws' : path === '/api/auth/login' || path === '/api/auth/reauth' ? 'auth' : method === 'GET' ? 'read' : 'write';
      if (!this.admit(`global:${category}`, category === 'auth' ? 300 : 1200) || !this.admit(`${category}:${ip}`, category === 'auth' ? 120 : 240)) {
        this.securityAudit('rateLimited', null, category, c.res.headers.get('X-Request-ID'));
        c.header('Retry-After', '60');
        return c.json({ success: false, error: '請求過於頻繁，請稍後再試' }, 429);
      }
      if (origin && origin !== new URL(c.req.url).origin && (method !== 'GET' || path === '/ws')) {
        this.securityAudit('accessDenied', null, 'origin', c.res.headers.get('X-Request-ID'));
        return c.json({ success: false, error: '不允許跨網站操作' }, 403);
      }

      if (this.pendingRequests >= 128) {
        c.header('Retry-After', '5');
        this.securityAudit('rateLimited', null, 'queue-capacity', c.res.headers.get('X-Request-ID'));
        return c.json({ success: false, error: '系統忙碌中，請稍後再試' }, 503);
      }
      let body: ExamVariables['body'] = {};
      if (c.req.header('Content-Type')?.includes('application/json')) {
        try {
          const parsed = await c.req.json();
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
          body = parsed;
        } catch {
          return c.json({ success: false, error: '無法讀取請求資料' }, 400);
        }
      }

      // Serialize the read, change and storage write so simultaneous submissions cannot overwrite each other.
      return this.serializeRequest(async () => {
        const state: StoredExamState = await this.ctx.storage.get<StoredExamState>(STATE_KEY) ?? createEmptyExamState();
        const credentialsPending = await this.migrateCredentials(state);
        if (credentialsPending) await this.scheduleNextAlarm(state, Date.now(), true);
        const token = getCookie(c, sessionCookie(c.req.url));
        if (token || path === '/api/auth/login') await this.initializeAdminAccounts(isLoopback(new URL(c.req.url)));
        const session = this.getSession(token, state);
        const events: ExamEvent[] = [];
        c.set('state', state);
        c.set('body', body);
        c.set('session', session);
        c.set('broadcast', (event, payload) => events.push({ event, payload }));

        const publicRoute = (method === 'GET' && ['/ws', '/api/exam/state', '/api/auth/session'].includes(path)) ||
          (method === 'POST' && ['/api/auth/login', '/api/auth/logout'].includes(path));
        if (!publicRoute && session?.role !== 'admin') {
          if (!session) {
            this.securityAudit('accessDenied', null, 'authentication', c.res.headers.get('X-Request-ID'));
            return c.json({ success: false, error: '請先登入' }, 401);
          }
          const canSubmitCorrection = path === '/api/exam/corrections' && session.canSubmitCorrections;
          const canWriteClassroom = typeof body.classId === 'string' && CLASS_WRITE_PATHS.test(path) &&
            (path === '/api/exam/attendance'
              ? canAccessPeriod(session, body.classId, body.periodId ?? LEGACY_PERIOD_ID) ||
                (body.periodId === undefined && !examPeriods(state.config).length && canAccessRoom(session, body.classId))
              : canAccessRoom(session, body.classId));
          if (method !== 'POST' || (!canSubmitCorrection && !canWriteClassroom)) {
            this.securityAudit('accessDenied', session, 'authorization', c.res.headers.get('X-Request-ID'));
            return c.json({ success: false, error: '沒有此操作權限' }, 403);
          }
        }

        const invalid = validateMutation(path, method, body, state);
        if (invalid) return c.json({ success: false, error: invalid }, 400);
        const sensitive = method !== 'GET' && (
          /^\/api\/auth\/(admins|credentials)(?:\/|$)/.test(path) ||
          /^\/api\/exam\/teachers(?:\/|$)/.test(path) ||
          (path.startsWith('/api/exam/import/') && !!body.expectedVersion));
        if (session?.role === 'admin' && sensitive) {
          const [proof] = this.ctx.storage.sql.exec<{ verified_at: number }>('SELECT verified_at FROM session_security WHERE token = ?', token ?? '');
          if (!proof || Date.now() - proof.verified_at > 5 * 60_000) {
            this.securityAudit('accessDenied', session, 'recent-auth-required', c.res.headers.get('X-Request-ID'));
            return c.json({ success: false, error: '此操作需要重新驗證管理員密碼' }, 428);
          }
        }
        const previousTeachers = new Map(state.teachers?.map((teacher) => [teacher.id, teacher.passwordHash]));
        const requiresPeriodRecords = path === '/api/exam/attendance' || path === '/api/exam/state' || path === '/api/exam/periods' || path === '/ws';
        if (requiresPeriodRecords) this.loadPeriodAttendance(state);
        const checkInvigilation = method !== 'GET' && /^\/api\/exam\/(?:teachers|classroom|periods|config)(?:\/|$)/.test(path)
          && state.classrooms.some((room) => Object.keys(room.periodInvigilators ?? {}).length);
        const previousConflicts = checkInvigilation ? invigilationConflicts(state) : undefined;
        await next();
        if ([401, 403].includes(c.res.status)) this.securityAudit('accessDenied', session, 'route-authorization', c.res.headers.get('X-Request-ID'));
        if (c.res.ok && events.length) {
          if (previousConflicts) {
            for (const [key, message] of invigilationConflicts(state)) {
              if (!previousConflicts.has(key)) {
                c.res = c.json({ success: false, error: message }, 409, { 'Cache-Control': 'no-store' });
                return;
              }
            }
          }
          const operation = session ? examAuditOperation(method, path, body) : undefined;
          const writesState = events.some(({ event }) => event !== 'PERIOD_ATTENDANCE_UPDATED');
          const periodUpdates = events.filter(({ event }) => event === 'PERIOD_ATTENDANCE_UPDATED');
          this.ctx.storage.transactionSync(() => {
            if (writesState) {
              const classrooms = state.classrooms.map(({ periodAttendance: _records, ...room }) => room);
              this.ctx.storage.kv.put(STATE_KEY, { ...state, classrooms });
            }
            for (const { payload } of periodUpdates) {
              const { classId, periodId, attendance } = payload as PeriodAttendanceUpdate;
              this.ctx.storage.sql.exec(
                'INSERT INTO exam_period_attendance VALUES (?, ?, ?) ON CONFLICT (class_id, period_id) DO UPDATE SET attendance = excluded.attendance',
                classId, periodId, JSON.stringify(attendance)
              );
            }
            if (session && operation) this.recordAudit(session, operation.action, operation.target);
          });
          if (operation || events.some(({ event }) => event === 'ANNOUNCEMENT_PUBLISHED')) {
            await this.scheduleNextAlarm(state, Date.now(), credentialsPending);
          }
          if (events.some(({ event }) => event === 'INIT_STATE')) {
            if (!requiresPeriodRecords) this.loadPeriodAttendance(state);
            const currentTeachers = new Map(state.teachers?.map((teacher) => [teacher.id, teacher.passwordHash]));
            for (const [id, passwordHash] of previousTeachers) {
              if (!currentTeachers.has(id) || currentTeachers.get(id) !== passwordHash) {
                this.ctx.storage.sql.exec('DELETE FROM sessions_v2 WHERE teacher_id = ?', id);
              }
            }
          }
          for (const event of events) this.broadcast(event, state);
        }
        if (path !== '/ws') c.header('Cache-Control', 'no-store');
      });
    });

    this.router.get('/api/exam/state', (c) =>
      c.json({ success: true, data: visibleState(c.get('state'), this.getSession(getCookie(c, sessionCookie(c.req.url)), c.get('state'))) })
    );

    this.router.get('/api/auth/session', (c) =>
      c.json({ success: true, data: this.getSession(getCookie(c, sessionCookie(c.req.url)), c.get('state')) })
    );

    this.router.post('/api/auth/login', async (c) => {
      const { role, username, password } = c.get('body');
      const account = String(username ?? '').trim();
      const secret = String(password ?? '').trim();
      if (!account || account.length > MAX_ACCOUNT_LENGTH || !secret || secret.length > MAX_PASSWORD_LENGTH) {
        this.securityAudit('loginFailed', null, 'invalid-input', c.res.headers.get('X-Request-ID'));
        return c.json({ success: false, error: '帳號或密碼錯誤，請重新確認' }, 401);
      }
      const state = c.get('state');
      const matchedAdmin = this.findAdminByName(account);
      const nameMatches = state.teachers?.filter((entry) => entry.name === account);
      const teacher = role === 'invigilator'
        ? state.teachers?.find((entry) => entry.username === account) ??
          (nameMatches?.length === 1 ? nameMatches[0] : undefined)
        : undefined;
      const now = Date.now();
      const ipScope = `ip:${c.req.header('CF-Connecting-IP') || 'local'}`;
      const accountScope = matchedAdmin ? `account:admin:${matchedAdmin.id}` : teacher ? `account:${teacher.id}` : `unknown:${account.toLowerCase()}`;
      const limits = [{ scope: ipScope, ...IP_FAILURES }, { scope: accountScope, ...ACCOUNT_FAILURES }];
      const retryAfter = this.loginRetryAfter(limits, now);
      if (retryAfter > 0) {
        c.header('Retry-After', String(retryAfter));
        this.securityAudit('rateLimited', null, 'login', c.res.headers.get('X-Request-ID'));
        return c.json({ success: false, error: '登入嘗試次數過多，請稍後再試' }, 429);
      }

      // Exactly two scrypt verifications on every well-formed, non-throttled attempt.
      const adminValid = await verifyPassword(secret, matchedAdmin?.enabled ? matchedAdmin.password_hash : DUMMY_PASSWORD_HASH);
      const teacherValid = await verifyPassword(secret, teacher?.passwordHash ?? DUMMY_PASSWORD_HASH);
      const isAdmin = !!matchedAdmin?.enabled && adminValid;
      const isTeacher = !isAdmin && !!teacher?.passwordHash && teacherValid;
      if (!isAdmin && !isTeacher) {
        this.securityAudit('loginFailed', matchedAdmin ? { role: 'admin', username: matchedAdmin.id } : teacher ? { role: 'invigilator', username: teacher.id } : null, 'credentials', c.res.headers.get('X-Request-ID'));
        for (const limit of limits) this.recordLoginFailure(limit.scope, now + limit.window);
        return c.json({ success: false, error: '帳號或密碼錯誤，請重新確認' }, 401);
      }

      this.ctx.storage.sql.exec('DELETE FROM login_failures WHERE scope = ?', accountScope);
      const cookie = sessionCookie(c.req.url);
      this.endSession(getCookie(c, cookie));
      const token = crypto.randomUUID();
      this.ctx.storage.sql.exec('DELETE FROM sessions_v2 WHERE expires <= ?', now);
      this.ctx.storage.sql.exec('INSERT INTO sessions_v2 VALUES (?, ?, ?, ?, ?)',
        token, isAdmin ? 'admin' : 'invigilator', isAdmin ? matchedAdmin!.id : teacher!.id,
        now + SESSION_SECONDS * 1000, passwordRevision(isAdmin ? matchedAdmin!.password_hash : teacher?.passwordHash));
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO session_security VALUES (?, ?)', token, now);
      const session = this.getSession(token, state)!;
      this.recordAudit(session, 'login');
      await this.scheduleNextAlarm(state, now, false);
      setCookie(c, cookie, token, {
        httpOnly: true,
        secure: new URL(c.req.url).protocol === 'https:',
        sameSite: 'Strict',
        path: '/',
        maxAge: SESSION_SECONDS
      });
      return c.json({ success: true, data: session });
    });

    this.router.post('/api/auth/reauth', async (c) => {
      const session = c.get('session')!;
      const admin = this.findAdmin(session.adminId!);
      const password = c.get('body').password;
      const now = Date.now();
      const limits = [{ scope: `reauth:${session.adminId}`, ...ACCOUNT_FAILURES }];
      const retry = this.loginRetryAfter(limits, now);
      if (retry) {
        this.securityAudit('rateLimited', session, 'reauth', c.res.headers.get('X-Request-ID'));
        c.header('Retry-After', String(retry));
        return c.json({ success: false, error: '驗證次數過多，請稍後再試' }, 429);
      }
      const valid = typeof password === 'string' && password.length <= MAX_PASSWORD_LENGTH &&
        await verifyPassword(password.trim(), admin?.password_hash ?? DUMMY_PASSWORD_HASH);
      if (!valid) {
        this.recordLoginFailure(limits[0].scope, now + ACCOUNT_FAILURES.window);
        this.securityAudit('loginFailed', session, 'reauth', c.res.headers.get('X-Request-ID'));
        return c.json({ success: false, error: '驗證失敗，請確認目前管理員密碼' }, 401);
      }
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO session_security VALUES (?, ?)', getCookie(c, sessionCookie(c.req.url))!, now);
      this.ctx.storage.sql.exec('DELETE FROM login_failures WHERE scope = ?', limits[0].scope);
      this.recordAudit(session, 'reauthenticate');
      return c.json({ success: true });
    });

    this.router.post('/api/auth/logout', async (c) => {
      const cookie = sessionCookie(c.req.url);
      this.endSession(getCookie(c, cookie));
      const session = c.get('session');
      if (session) {
        this.recordAudit(session, 'logout');
        await this.scheduleNextAlarm(c.get('state'), Date.now(), false);
      }
      deleteCookie(c, cookie, { path: '/', secure: new URL(c.req.url).protocol === 'https:' });
      return c.json({ success: true });
    });

    this.router.get('/api/auth/admins', (c) =>
      c.json({ success: true, data: this.publicAdmins(c.get('session')!.adminId!) })
    );

    this.router.get('/api/admin/audit-logs', (c) => {
      const raw = c.req.query('before');
      const before = raw === undefined ? Number.MAX_SAFE_INTEGER : Number(raw);
      if (!Number.isSafeInteger(before) || before < 1) {
        return c.json({ success: false, error: '操作紀錄頁碼無效' }, 400);
      }
      const rows = this.ctx.storage.sql.exec<AuditLogEntry>(
        `SELECT id, occurred_at AS occurredAt, actor, role, action, target FROM audit_log
         WHERE expires_at > ? AND id < ? ORDER BY id DESC LIMIT 51`, Date.now(), before
      ).toArray();
      const entries = rows.slice(0, 50);
      const data: AuditLogPage = { entries, nextBefore: rows.length > 50 ? entries[49].id : null };
      return c.json({ success: true, data });
    });

    this.router.post('/api/auth/admins', (c) => this.saveAdmin(c));
    this.router.patch('/api/auth/admins/:id', (c) => this.saveAdmin(c, c.req.param('id')));
    this.router.patch('/api/auth/credentials', (c) => {
      const { adminUser, adminPass } = c.get('body');
      return this.saveAdmin(c, c.get('session')!.adminId!, {
        username: typeof adminUser === 'string' ? adminUser.trim() || undefined : undefined,
        password: typeof adminPass === 'string' ? adminPass.trim() || undefined : undefined
      });
    });

    this.router.get('/ws', (c) => {
      if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
        return c.text('Expected WebSocket', 426);
      }
      const ip = c.req.header('CF-Connecting-IP') || 'local';
      const sockets = this.ctx.getWebSockets();
      if (sockets.length >= 1024 || sockets.filter(socket => (socket.deserializeAttachment() as { ip?: string } | null)?.ip === ip).length >= 128) {
        c.header('Retry-After', '60');
        this.securityAudit('rateLimited', c.get('session'), 'websocket-quota', c.res.headers.get('X-Request-ID'));
        return c.json({ success: false, error: '即時連線數已達上限，請關閉多餘分頁後重試' }, 429);
      }
      const [client, server] = Object.values(new WebSocketPair());
      const state = c.get('state');
      const token = getCookie(c, sessionCookie(c.req.url));
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ token: token ?? null, ip });
      const session = this.getSession(token, state);
      server.send(JSON.stringify({ event: 'INIT_STATE', payload: visibleState(state, session), session }));
      return new Response(null, { status: 101, webSocket: client });
    });

    this.router.route('/', api);
    this.router.notFound((c) => c.json({ success: false, error: '找不到此功能' }, 404));
    this.router.onError((error, c) => {
      console.error(JSON.stringify({ event: 'requestError', requestId: c.res.headers.get('X-Request-ID'), category: 'internal' }));
      return c.json({ success: false, error: '考務系統暫時無法處理請求' }, 500);
    });
  }

  fetch(request: Request) {
    return this.router.fetch(request);
  }

  private serializeRequest<T>(work: () => Promise<T>): Promise<T> {
    this.pendingRequests++;
    const task = this.requestQueue.then(work, work).finally(() => { this.pendingRequests--; });
    this.requestQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  private socketToken(socket: WebSocket): string | null {
    const saved = socket.deserializeAttachment();
    return typeof saved === 'string' ? saved : saved?.token ?? null;
  }

  private admit(key: string, limit: number): boolean {
    const now = Date.now();
    for (const [entry, bucket] of this.readLimits) if (bucket.until <= now) this.readLimits.delete(entry);
    let bucket = this.readLimits.get(key);
    if (!bucket) {
      if (this.readLimits.size >= 4096) return false;
      bucket = { count: 0, until: now + 60_000 };
      this.readLimits.set(key, bucket);
    }
    return ++bucket.count <= limit;
  }

  private securityAudit(action: AuditAction, session: ExamSession | null, category: string, requestId: string | null) {
    const now = Date.now();
    // Bound security log writes; structured warning allows platform alerting without secrets.
    if (this.securityLogWindow.until <= now) this.securityLogWindow = { count: 0, until: now + 60_000 };
    if (++this.securityLogWindow.count > 120) return;
    const actor = session ? { ...session, username: session.adminId ?? session.teacherId ?? session.username } : { role: 'invigilator' as const, username: 'anonymous' };
    this.recordAudit(actor, action, `${category}; request=${requestId ?? 'none'}`);
    console.warn(JSON.stringify({ event: action, category, requestId, actor: actor.username }));
    this.ctx.waitUntil(this.scheduleNextAlarm(createEmptyExamState(), now, false));
  }

  private loadPeriodAttendance(state: StoredExamState) {
    const rooms = new Map(state.classrooms.map((room) => [room.classId, room]));
    for (const row of this.ctx.storage.sql.exec<{ class_id: string; period_id: string; attendance: string }>(
      'SELECT class_id, period_id, attendance FROM exam_period_attendance'
    )) {
      const room = rooms.get(row.class_id);
      if (room) (room.periodAttendance ??= {})[row.period_id] = JSON.parse(row.attendance);
    }
  }

  async alarm() {
    await this.serializeRequest(async () => {
      const now = Date.now();
      this.ctx.storage.sql.exec('DELETE FROM audit_log WHERE expires_at <= ?', now);
      this.ctx.storage.sql.exec('DELETE FROM session_security WHERE token NOT IN (SELECT token FROM sessions_v2 WHERE expires > ?)', now);
      this.ctx.storage.sql.exec('DELETE FROM login_failures WHERE expires <= ?', now);
      const state = await this.ctx.storage.get<StoredExamState>(STATE_KEY);
      const credentialsPending = state ? await this.migrateCredentials(state) : false;
      await this.scheduleNextAlarm(state ?? createEmptyExamState(), now, credentialsPending);
      if (state) this.broadcast({ event: 'ANNOUNCEMENTS_UPDATED', payload: activeAnnouncements(state, now) }, state);
    });
  }

  private async scheduleNextAlarm(state: SystemData, now: number, credentialsPending: boolean) {
    const boundary = nextAnnouncementBoundary(state.announcements, now);
    const [expiry] = this.ctx.storage.sql.exec<{ expires_at: number }>(
      'SELECT expires_at FROM audit_log ORDER BY expires_at LIMIT 1'
    );
    const next = Math.min(boundary, credentialsPending ? now + 1000 : Infinity, expiry?.expires_at ?? Infinity);
    if (!Number.isFinite(next)) return;
    const scheduled = await this.ctx.storage.getAlarm();
    if (scheduled === null || next < scheduled) await this.ctx.storage.setAlarm(Math.max(now, next));
  }

  private recordAudit(session: ExamSession, action: AuditAction, target: string | null = null) {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      'INSERT INTO audit_log (occurred_at, expires_at, actor, role, action, target) VALUES (?, ?, ?, ?, ?, ?)',
      now, auditExpiry(now), session.username, session.role, action, target
    );
  }

  private async migrateCredentials(state: StoredExamState) {
    const legacy = state.teachers?.filter((teacher) => typeof teacher.password === 'string') ?? [];
    for (const teacher of legacy.slice(0, MIGRATION_BATCH)) {
      teacher.passwordHash ??= await hashPassword(teacher.password!);
      delete teacher.password;
    }
    if (legacy.length) await this.ctx.storage.put(STATE_KEY, state);
    return legacy.length > MIGRATION_BATCH;
  }

  private async initializeAdminAccounts(allowLocalBootstrap: boolean) {
    const sql = this.ctx.storage.sql;
    const primary = this.findAdmin(PRIMARY_ADMIN_ID);
    const username = this.env.ADMIN_USERNAME?.trim();
    const rotationId = this.env.ADMIN_ROTATION_ID;
    const bootstrapHash = this.env.ADMIN_PASSWORD_HASH;
    if (!primary) {
      const legacy = await this.ctx.storage.get<AdminCredentials>(ADMIN_KEY);
      const rotate = !!(username && bootstrapHash && rotationId && legacy?.rotationId !== rotationId);
      const initialName = !rotate && (legacy?.passwordHash || legacy?.password) ? legacy.username : username;
      const localPassword = allowLocalBootstrap ? this.env.ADMIN_PASSWORD?.trim() : undefined;
      const initialPassword = legacy?.password || localPassword;
      const initialHash = rotate ? bootstrapHash : legacy?.passwordHash ||
        (initialName && initialPassword ? await hashPassword(initialPassword) : bootstrapHash);
      if (!initialName || !initialHash) return;
      this.ctx.storage.transactionSync(() => {
        sql.exec('INSERT INTO admin_accounts VALUES (?, ?, ?, ?, 1, ?)',
          PRIMARY_ADMIN_ID, initialName, initialName.toLowerCase(), initialHash, rotate ? rotationId! : legacy?.rotationId ?? null);
        if (rotate) {
          sql.exec("DELETE FROM sessions_v2 WHERE role = 'admin' AND teacher_id = ''");
        } else {
          sql.exec("UPDATE sessions_v2 SET teacher_id = ?, revision = ? WHERE role = 'admin' AND teacher_id = ''",
            PRIMARY_ADMIN_ID, passwordRevision(initialHash));
        }
        this.ctx.storage.kv.delete(ADMIN_KEY);
      });
      return;
    }

    if (username && bootstrapHash && rotationId && primary.rotation_id !== rotationId) {
      const existing = this.findAdminByName(username);
      if (existing && existing.id !== primary.id) return;
      this.ctx.storage.transactionSync(() => {
        sql.exec('UPDATE admin_accounts SET username = ?, username_key = ?, password_hash = ?, enabled = 1, rotation_id = ? WHERE id = ?',
          username, username.toLowerCase(), bootstrapHash, rotationId, primary.id);
        sql.exec("DELETE FROM sessions_v2 WHERE role = 'admin' AND teacher_id = ?", primary.id);
      });
    }
  }

  private findAdmin(id: string) {
    return [...this.ctx.storage.sql.exec<StoredAdminAccount>('SELECT * FROM admin_accounts WHERE id = ?', id)][0];
  }

  private findAdminByName(username: string) {
    return [...this.ctx.storage.sql.exec<StoredAdminAccount>('SELECT * FROM admin_accounts WHERE username_key = ?', username.toLowerCase())][0];
  }

  private publicAdmins(currentId: string): AdminAccounts {
    const rows = this.ctx.storage.sql.exec<Pick<StoredAdminAccount, 'id' | 'username' | 'enabled'>>(
      'SELECT id, username, enabled FROM admin_accounts ORDER BY enabled DESC, username_key');
    return { currentId, accounts: [...rows].map(({ id, username, enabled }) => ({ id, username, enabled: enabled === 1 })) };
  }

  private async saveAdmin(c: Context<{ Variables: ExamVariables }>, id?: string, input = c.get('body')) {
    const currentId = c.get('session')!.adminId!;
    const current = id ? this.findAdmin(id) : undefined;
    if (id && !current) return c.json({ success: false, error: '找不到管理員帳號' }, 404);
    const { username: rawName, password: rawPassword, enabled: requestedEnabled } = input;
    const username = rawName === undefined ? current?.username : typeof rawName === 'string' ? rawName.trim() : '';
    const password = typeof rawPassword === 'string' ? rawPassword.trim() : '';
    if (!username || username.length > MAX_ACCOUNT_LENGTH ||
      ((!current || rawPassword !== undefined) && ([...password].length < MIN_ADMIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH)) ||
      (requestedEnabled !== undefined && typeof requestedEnabled !== 'boolean')) {
      return c.json({ success: false, error: `請輸入有效帳號，新增或重設的密碼須為 ${MIN_ADMIN_PASSWORD_LENGTH} 至 ${MAX_PASSWORD_LENGTH} 個字元` }, 400);
    }
    const duplicate = this.findAdminByName(username);
    if (duplicate && duplicate.id !== id) return c.json({ success: false, error: '此管理員帳號已存在' }, 409);
    const enabled = requestedEnabled ?? (current ? Boolean(current.enabled) : true);
    const sql = this.ctx.storage.sql;
    if (current?.enabled && !enabled) {
      const [{ total }] = [...sql.exec<{ total: number }>('SELECT COUNT(*) AS total FROM admin_accounts WHERE enabled = 1')];
      if (total <= 1) return c.json({ success: false, error: '至少須保留一個啟用中的管理員帳號' }, 409);
      if (current.id === currentId) return c.json({ success: false, error: '請由另一位管理員停用目前登入的帳號' }, 409);
    }
    const passwordHash = password ? await hashPassword(password) : current!.password_hash;
    const activeToken = getCookie(c, sessionCookie(c.req.url)) ?? '';
    this.ctx.storage.transactionSync(() => {
      if (!current) {
        sql.exec('INSERT INTO admin_accounts VALUES (?, ?, ?, ?, ?, NULL)',
          crypto.randomUUID(), username, username.toLowerCase(), passwordHash, Number(enabled));
      } else {
        sql.exec('UPDATE admin_accounts SET username = ?, username_key = ?, password_hash = ?, enabled = ? WHERE id = ?',
          username, username.toLowerCase(), passwordHash, Number(enabled), current.id);
        if (password || !enabled) {
          const preserved = current.id === currentId ? activeToken : '';
          sql.exec("DELETE FROM sessions_v2 WHERE role = 'admin' AND teacher_id = ? AND token != ?", current.id, preserved);
          if (preserved) sql.exec('UPDATE sessions_v2 SET revision = ? WHERE token = ?', passwordRevision(passwordHash), preserved);
        }
      }
      this.recordAudit(c.get('session')!, current ? 'adminUpdate' : 'adminCreate', username);
    });
    await this.scheduleNextAlarm(c.get('state'), Date.now(), false);
    for (const socket of this.ctx.getWebSockets()) {
      const token = this.socketToken(socket);
      if (token && !this.getSession(token, c.get('state'))) socket.close(1000, 'Session ended');
    }
    return c.json({ success: true, data: this.publicAdmins(currentId) });
  }

  private loginRetryAfter(limits: { scope: string; limit: number }[], now: number): number {
    const sql = this.ctx.storage.sql;
    sql.exec('DELETE FROM login_failures WHERE expires <= ?', now);
    let wait = 0;
    for (const { scope, limit } of limits) {
      const [record] = sql.exec<{ failures: number; expires: number }>(
        'SELECT failures, expires FROM login_failures WHERE scope = ?', scope);
      if (record && record.failures >= limit) wait = Math.max(wait, record.expires - now);
    }
    return Math.ceil(wait / 1000);
  }

  private recordLoginFailure(scope: string, expires: number) {
    this.ctx.storage.sql.exec(`
      INSERT INTO login_failures VALUES (?, 1, ?)
      ON CONFLICT(scope) DO UPDATE SET failures = failures + 1
    `, scope, expires);
  }

  private getSession(token: string | null | undefined, state: StoredExamState): ExamSession | null {
    if (!token) return null;
    const [session] = this.ctx.storage.sql.exec<StoredSession>(
      'SELECT role, teacher_id, revision FROM sessions_v2 WHERE token = ? AND expires > ?', token, Date.now());
    if (!session) return null;
    if (session.role === 'admin') {
      const admin = this.findAdmin(session.teacher_id);
      if (!admin?.enabled || !session.revision || session.revision !== passwordRevision(admin.password_hash)) return null;
      return { role: 'admin', username: admin.username, adminId: admin.id };
    }

    const teacher = state.teachers?.find((entry) => entry.id === session.teacher_id);
    if (!teacher || !session.revision || session.revision !== passwordRevision(teacher.passwordHash)) return null;
    const periods = examPeriods(state.config);
    const invigilation = state.classrooms.flatMap((room) => periods.filter((period) => {
      const override = room.periodInvigilators?.[period.id];
      return periodApplies(period, room) && (override === undefined ? teacher.assignedClassId === room.classId : override === teacher.id);
    }).map((period) => ({ classId: room.classId, periodId: period.id })));
    const defaultRoom = state.classrooms.find((room) => room.classId === teacher.assignedClassId);
    const grades = availableGrades(state.config, state.classrooms);
    const examAuthorAssignments = (teacher.examAuthorAssignments ?? []).filter((item) => grades.includes(item.grade));
    return {
      role: 'invigilator',
      username: `${teacher.name} (${teacher.username})`,
      classId: invigilation[0]?.classId ?? (defaultRoom && !periods.some((period) => periodApplies(period, defaultRoom)) ? defaultRoom.classId : undefined),
      invigilation,
      teacherId: teacher.id,
      canSubmitCorrections: examAuthorAssignments.length > 0,
      examAuthorAssignments
    };
  }

  private endSession(token: string | undefined) {
    if (!token) return;
    this.ctx.storage.sql.exec('DELETE FROM sessions_v2 WHERE token = ?', token);
    this.ctx.storage.sql.exec('DELETE FROM session_security WHERE token = ?', token);
    for (const socket of this.ctx.getWebSockets()) {
      if (this.socketToken(socket) === token) socket.close(1000, 'Session ended');
    }
  }

  private broadcast({ event, payload }: ExamEvent, state: SystemData) {
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      const token = this.socketToken(socket);
      const session = this.getSession(token, state);
      if (token && !session) {
        socket.close(1000, 'Session ended');
        continue;
      }
      let visiblePayload = payload;
      if (event === 'CORRECTION_UPDATED' && session?.role !== 'admin' &&
        (!session?.canSubmitCorrections || session.teacherId !== (payload as CorrectionProposal).teacherId)) continue;
      if (event === 'ANNOUNCEMENTS_UPDATED' && session?.role === 'admin') continue;
      if (event === 'ANNOUNCEMENT_PUBLISHED' && session?.role !== 'admin' &&
        announcementStatus(payload as SystemData['announcements'][number], now) !== 'active') continue;
      if (event === 'INIT_STATE') visiblePayload = visibleState(state, session);
      if (event === 'ATTENDANCE_UPDATED' || event === 'CLASSROOM_ADDED' || event === 'CLASSROOM_UPDATED') {
        visiblePayload = visibleClassroom(payload as ClassroomExamState, session, state);
      }
      if (event === 'PERIOD_ATTENDANCE_UPDATED') {
        const update = payload as PeriodAttendanceUpdate;
        if (!canAccessPeriod(session, update.classId, update.periodId)) {
          visiblePayload = { ...update, attendance: { ...update.attendance, absentStudents: publicAbsences(update.attendance.absentStudents) } };
        }
      }
      if ((event === 'ISSUE_REPORTED' || event === 'ISSUE_UPDATED') && !visibleIssue(payload as ExamIssue, session)) {
        continue;
      }
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ event, payload: visiblePayload, session: event === 'INIT_STATE' ? session : undefined }));
        } catch {
          socket.close(1011, 'Unable to send update');
        }
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (url.protocol === 'http:' && !isLoopback(url)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return Response.json({ success: false, error: '此操作必須使用 HTTPS' }, {
          status: 403,
          headers: { 'Cache-Control': 'no-store' }
        });
      }
      url.protocol = 'https:';
      return Response.redirect(url, 308);
    }
    let response: Response;
    if (pathname === '/ws' || pathname.startsWith('/api/')) {
      response = await env.EXAM.get(env.EXAM.idFromName('school')).fetch(request);
    } else {
      response = await env.ASSETS.fetch(request);
    }
    if (response.status === 101) return response;
    const secured = new Response(response.body, response);
    if (url.protocol === 'https:') secured.headers.set('Strict-Transport-Security', 'max-age=31536000');
    secured.headers.set('X-Content-Type-Options', 'nosniff');
    const websocketOrigin = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
    secured.headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ${websocketOrigin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`);
    secured.headers.set('X-Frame-Options', 'DENY');
    secured.headers.set('Referrer-Policy', 'no-referrer');
    secured.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()');
    if (pathname.startsWith('/api/')) secured.headers.set('Cache-Control', 'no-store');
    secured.headers.set('X-Server-Time', String(Date.now()));
    return secured;
  }
} satisfies ExportedHandler<WorkerEnv>;
