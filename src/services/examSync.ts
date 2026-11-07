import { recordServerTime, serverNowMs } from '../types/time';
import type {
  SystemData,
  ClassroomExamState,
  TeacherAccountInput,
  ExamIssue,
  ExamAnnouncement,
  CorrectionDraft,
  CorrectionProposal,
  ExamConfig,
  ExamPeriod,
  ExamSession,
  AdminAccounts
} from '../types/exam';
import { announcementStatus } from '../types/announcements';
import type { AuditLogPage } from '../types/audit';
import type { ExamImportKind, ExamImportPreview } from '../types/examImports';

export type SyncEventHandler = (event: string, payload: any) => void;
let reauthenticationHandler: (() => Promise<boolean>) | null = null;
export function setReauthenticationHandler(handler: (() => Promise<boolean>) | null) { reauthenticationHandler = handler; }

export type LiveConnection = 'connecting' | 'connected' | 'reconnecting' | 'offline';
type ApiReply<T> = { success: boolean; data?: T; error?: string };
const REQUEST_TIMEOUT = 20_000;

class ExamSyncService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private subscribers: Set<SyncEventHandler> = new Set();
  private reconnectTimer: any = null;
  private audioCtx: AudioContext | null = null;
  private soundEnabled = true;
  private requestId = 0;

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public playChime(type: 'urgent' | 'notice' | 'success' = 'notice') {
    if (!this.soundEnabled || typeof window === 'undefined') return;
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'urgent') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880.0, now + 0.12);
        osc.frequency.setValueAtTime(1174.66, now + 0.24);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.start(now);
        osc.stop(now + 0.9);
      } else if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880.0, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      }
    } catch {
      // Audio autoplay policy catch
    }
  }

  public subscribe(handler: SyncEventHandler): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  private notifySubscribers(event: string, payload: any) {
    this.subscribers.forEach((handler) => {
      try {
        handler(event, payload);
      } catch (err) {
        console.error('Error in sync subscriber:', err);
      }
    });
  }

  public init() {
    this.connectWebSocket('connecting');
  }

  public reconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.connectWebSocket('reconnecting');
  }

  private connectWebSocket(status: 'connecting' | 'reconnecting') {
    if (typeof window === 'undefined') return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    this.notifySubscribers('LIVE_CONNECTION', navigator.onLine ? status : 'offline');

    try {
      const socket = this.ws = new WebSocket(wsUrl);
      const initialSnapshotTimer = window.setTimeout(() => {
        if (this.ws === socket) socket.close();
      }, 10_000);

      socket.onopen = () => {
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      socket.onmessage = (event) => {
        try {
          const { event: evType, payload, session } = JSON.parse(event.data);
          if (evType) {
            this.notifySubscribers(evType, payload);
            if (evType === 'INIT_STATE') {
              this.reconnectAttempts = 0;
              window.clearTimeout(initialSnapshotTimer);
              this.notifySubscribers('SESSION_UPDATED', session);
              this.notifySubscribers('LIVE_CONNECTION', 'connected');
            }

            if (evType === 'ANNOUNCEMENT_PUBLISHED' && announcementStatus(payload, serverNowMs()) === 'active') {
              this.playChime(payload.type === 'correction' ? 'urgent' : 'notice');
            } else if (evType === 'ISSUE_REPORTED') {
              this.playChime('urgent');
            }
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      socket.onclose = () => {
        window.clearTimeout(initialSnapshotTimer);
        this.scheduleReconnect();
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.notifySubscribers('LIVE_CONNECTION', navigator.onLine ? 'reconnecting' : 'offline');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket('reconnecting');
    }, Math.min(60000, 1000 * 2 ** Math.min(this.reconnectAttempts++, 6)) * (0.5 + Math.random() * 0.5));
  }

  private async request<T>(path: string, options: RequestInit = {}, retried = false): Promise<ApiReply<T>> {
    const method = options.method ?? 'GET';
    const tracked = path !== '/api/exam/state' && path !== '/api/auth/session' && !path.endsWith('/read');
    const id = ++this.requestId;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      cancel();
    }, REQUEST_TIMEOUT);
    if (tracked) this.notifySubscribers('REQUEST_STARTED', { id, reading: method === 'GET' });
    try {
      const sentAt = Date.now();
      const response = await fetch(path, { ...options, signal: controller.signal });
      recordServerTime(Number(response.headers.get('X-Server-Time')), sentAt, Date.now());
      if (response.status === 428 && !retried && reauthenticationHandler) {
        window.clearTimeout(timeout);
        const verified = await reauthenticationHandler();
        if (!verified) return { success: false, error: '已取消身分驗證；原操作尚未執行' };
        if (options.signal?.aborted) return { success: false, error: '原操作已取消，請重新操作' };
        return this.request<T>(path, options, true);
      }
      const result = await response.json() as ApiReply<T>;
      if (typeof result?.success !== 'boolean') throw new Error('Invalid API response');
      if (response.ok && result.success && method !== 'GET' && path.startsWith('/api/exam/') && !path.endsWith('/read')) {
        try { this.notifySubscribers('INIT_STATE', await this.fetchState()); }
        catch { this.notifySubscribers('LIVE_CONNECTION', navigator.onLine ? 'reconnecting' : 'offline'); }
      }
      return response.ok ? result : { success: false, error: result.error };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (timedOut) {
        if (path === '/api/auth/login') throw new Error('登入驗證逾時，請重新整理頁面確認登入狀態。');
        throw new Error(method === 'GET' ? '讀取逾時，請重新載入資料。' : '系統回覆逾時，請先確認資料是否已更新，再決定是否重試。');
      }
      throw new Error(navigator.onLine ? '暫時無法取得系統回覆，請稍後再試。' : '目前未連上網路，請確認連線後再試。');
    } finally {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', cancel);
      if (tracked) this.notifySubscribers('REQUEST_FINISHED', id);
    }
  }

  private readData<T>(result: ApiReply<unknown>): T {
    if (!result.success) throw new Error(result.error || '考務操作失敗');
    return result.data as T;
  }

  // REST API Helpers
  public async fetchState(signal?: AbortSignal): Promise<SystemData> {
    const res = await this.request('/api/exam/state', { signal, cache: 'no-store' });
    return this.readData(res);
  }

  public async fetchSession(signal?: AbortSignal): Promise<ExamSession | null> {
    return this.readData(await this.request('/api/auth/session', { signal, cache: 'no-store' }));
  }

  public async updateAttendance(data: {
    classId: string;
    periodId: string;
    expectedPeriod: Pick<ExamPeriod, 'date' | 'startTime' | 'endTime' | 'subject'>;
    expectedLastUpdated: string | null;
    expectedCount: number;
    presentCount: number;
    absentCount: number;
    absentStudents: { seatNo: number; name: string; reason: string }[];
  }): Promise<ClassroomExamState> {
    const res = await this.request('/api/exam/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return this.readData(res);
  }

  public async reportIssue(data: {
    classId: string;
    className: string;
    type: string;
    content: string;
    isUrgent?: boolean;
  }): Promise<ExamIssue> {
    const res = await this.request('/api/exam/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return this.readData(res);
  }

  public async updateIssue(
    id: string,
    updates: { status?: string; reply?: string; repliedBy?: string }
  ): Promise<ExamIssue> {
    const res = await this.request(`/api/exam/issue/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return this.readData(res);
  }

  public async publishAnnouncement(data: {
    type: string;
    subject: string;
    targetAudience: string;
    title: string;
    content: string;
    startsAt?: string;
    endsAt?: string;
    priority?: string;
    publishedBy?: string;
  }): Promise<ExamAnnouncement> {
    const res = await this.request('/api/exam/announcement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return this.readData(res);
  }

  public async submitCorrection(draft: CorrectionDraft): Promise<CorrectionProposal> {
    return this.readData(await this.request('/api/exam/corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    }));
  }

  public async reviewCorrection(id: string, decision: 'approved' | 'rejected', reason?: string): Promise<CorrectionProposal> {
    return this.readData(await this.request(`/api/exam/corrections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason })
    }));
  }

  public async deleteAnnouncement(id: string): Promise<void> {
    await this.readData(await this.request(`/api/exam/announcement/${id}`, { method: 'DELETE' }));
  }

  public async markAnnouncementRead(id: string, classId: string): Promise<void> {
    await this.readData(await this.request(`/api/exam/announcement/${id}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId })
    }));
  }

  public async updateConfig(updates: Partial<ExamConfig>): Promise<ExamConfig> {
    const res = await this.request('/api/exam/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return this.readData(res);
  }

  public async saveGrade(grade: number, label: string | null): Promise<ExamConfig> {
    const response = await this.request(`/api/exam/grades/${grade}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });
    return this.readData(response);
  }

  public async saveExamPeriods(periods: ExamPeriod[], expectedPeriods: ExamPeriod[]): Promise<ExamPeriod[]> {
    return this.readData(await this.request('/api/exam/periods', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periods, expectedPeriods })
    }));
  }

  public async importExamCsv(kind: ExamImportKind, text: string, expectedVersion?: string): Promise<ExamImportPreview> {
    return this.readData(await this.request(`/api/exam/import/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, expectedVersion })
    }));
  }

  public async updateClassroom(
    classId: string,
    updates: {
      grade?: number;
      className?: string;
      invigilator?: string;
      teacherId?: string;
      expectedCount?: number;
      totalSeats?: number;
      expected?: Pick<ClassroomExamState, 'grade' | 'className' | 'expectedCount'>;
    }
  ): Promise<ClassroomExamState> {
    const res = await this.request(`/api/exam/classroom/${encodeURIComponent(classId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return this.readData(res);
  }

  public async addClassroom(data: {
    classId?: string;
    grade: number;
    className: string;
    invigilator: string;
    teacherId?: string;
    expectedCount: number;
  }): Promise<ClassroomExamState> {
    const res = await this.request('/api/exam/classroom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return this.readData(res);
  }

  public async importTeachers(
    teachers: TeacherAccountInput[],
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<{ success: boolean; error?: string; data?: SystemData }> {
    const res = await this.request<SystemData>('/api/exam/teachers/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teachers, mode })
    });
    return res;
  }

  public async saveTeacher(
    teacher: TeacherAccountInput & { expectedExamAuthorAssignments?: TeacherAccountInput['examAuthorAssignments'] }
  ): Promise<{ success: boolean; error?: string; data?: SystemData }> {
    const res = await this.request<SystemData>('/api/exam/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(teacher)
    });
    return res;
  }

  public async assignTeacherToClassroom(
    teacherId: string,
    classId: string,
    expected?: { previousClassId: string; targetTeacherId?: string }
  ): Promise<{ success: boolean; error?: string; data?: SystemData }> {
    const res = await this.request<SystemData>(`/api/exam/teachers/${teacherId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, expected })
    });
    return res;
  }

  public async assignPeriodInvigilator(data: {
    classId: string;
    periodId: string;
    teacherId: string | null;
    expectedTeacherId: string | null;
    expectedPeriod?: Pick<ExamPeriod, 'date' | 'startTime' | 'endTime' | 'subject'>;
  }) {
    await this.readData(await this.request('/api/exam/period-invigilators', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }));
  }

  public async deleteTeacher(
    teacherId: string
  ): Promise<{ success: boolean; error?: string; data?: SystemData }> {
    const res = await this.request<SystemData>(`/api/exam/teachers/${teacherId}`, {
      method: 'DELETE'
    });
    return res;
  }

  public async login(data: {
    role: 'invigilator' | 'admin';
    username: string;
    password: string;
  }): Promise<{
    success: boolean;
    error?: string;
    data?: ExamSession;
  }> {
    const res = await this.request<ExamSession>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res;
  }

  public async logout(): Promise<void> {
    await this.readData(await this.request('/api/auth/logout', { method: 'POST' }));
  }

  public async getAdminAccounts(): Promise<AdminAccounts> {
    return this.readData(await this.request('/api/auth/admins'));
  }

  public async fetchAuditLogs(before: number | null, signal: AbortSignal): Promise<AuditLogPage> {
    const query = before === null ? '' : `?before=${before}`;
    return this.readData(await this.request(`/api/admin/audit-logs${query}`, { signal, cache: 'no-store' }));
  }

  public async saveAdminAccount(data: { username?: string; password?: string; enabled?: boolean }, id?: string): Promise<AdminAccounts> {
    return this.readData(await this.request(id ? `/api/auth/admins/${encodeURIComponent(id)}` : '/api/auth/admins', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }));
  }

}

export const examSync = new ExamSyncService();
