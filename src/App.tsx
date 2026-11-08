import { serverNow } from './types/time';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { Header, VIEW_PATHS, type ActiveView } from './components/Header';
import { BoardPortalHome } from './components/BoardPortalHome';
import { BlackboardView } from './components/blackboard/BlackboardView';
import { AcademicBoardView } from './components/academic/AcademicBoardView';
import { AttendanceBoardView } from './components/attendance/AttendanceBoardView';
import { ClassroomPicker } from './components/ClassroomPicker';
import { ScheduledInvigilatorView } from './components/invigilator/InvigilatorView';
import { TeacherAssignments } from './components/invigilator/TeacherAssignments';
import { WorkbenchHeader } from './components/invigilator/WorkbenchHeader';
import { useAnnouncementClock } from './components/useAnnouncementClock';
import { classroomAnnouncements } from './types/announcements';
import { examPeriods, periodApplies } from './types/examSchedule';
import { InvigilatorNavigation, invigilatorPath, invigilatorTitle, isInvigilatorTab, type InvigilatorTab } from './components/invigilator/InvigilatorNavigation';
import { CorrectionSubmission } from './components/CorrectionWorkflow';
import { PolicyPage, type PolicyView } from './components/PolicyPage';
import { AdminView, type AdminTab } from './components/admin/AdminView';
import { adminSettingsPath, adminSettingsTitle, parseAdminSettingsPage, type AdminSettingsPage } from './components/admin/AdminSettingsNavigation';
import { SecurityReauth } from './components/auth/SecurityReauth';
import { LoginPage } from './components/auth/LoginPage';
import { RequestActivity, SystemFeedback } from './components/SystemFeedback';
import { examSync, type LiveConnection } from './services/examSync';
import { discardOtherAttendanceDrafts } from './services/attendanceDrafts';
import { createEmptyExamState, type ExamSession, type SystemData } from './types/exam';

type BoardView = 'blackboard' | 'attendance';

const pageTitles: Record<ActiveView, string> = {
  home: '',
  blackboard: '教室電子黑板',
  attendance: '出席即時看板',
  academic: '教務處看板',
  invigilator: '教師工作台',
  admin: '教務管理中心',
  login: '登入',
  privacy: '隱私政策',
  disclaimer: '免責聲明'
};

const policyViews: PolicyView[] = ['privacy', 'disclaimer'];

const adminPageTitles: Record<AdminTab, string> = {
  home: '', matrix: '考場看板', broadcast: '公告與更正', issues: '考場通報', teachers: '教師帳號',
  assign: '監考指派', reports: '統計報表', settings: '考務設定', logs: '操作紀錄'
};

function boardClassPath(view: BoardView, classId: string) {
  return `${VIEW_PATHS[view]}/${encodeURIComponent(classId)}`;
}

function decodeClassId(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function parseRouteFromPathname(pathname: string): {
  view: ActiveView;
  adminTab?: AdminTab;
  invigilatorTab?: InvigilatorTab;
  classId?: string;
  normalizedPath: string;
} {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const segments = clean.split('/').filter(Boolean);
  const first = segments[0] || '';
  const second = segments[1] || '';

  if (first === 'privacy' || first === 'disclaimer') {
    return { view: first, normalizedPath: VIEW_PATHS[first] };
  }

  if (first === 'login') {
    return {
      view: 'login',
      normalizedPath: '/login'
    };
  }

  if (first === 'board' && second === 'academic') {
    return { view: 'academic', normalizedPath: VIEW_PATHS.academic };
  }

  if (first === 'attendance') {
    return {
      view: 'attendance',
      classId: second || undefined,
      normalizedPath: second ? `/attendance/${second}` : '/attendance'
    };
  }

  if (first === 'invigilator') {
    if (isInvigilatorTab(second)) {
      const classSegment = segments[2];
      return {
        view: 'invigilator',
        invigilatorTab: second,
        classId: classSegment ? decodeClassId(classSegment) : undefined,
        normalizedPath: classSegment ? `/invigilator/${second}/${classSegment}` : invigilatorPath(second)
      };
    }
    return {
      view: 'invigilator',
      invigilatorTab: second ? 'attendance' : undefined,
      classId: second ? decodeClassId(second) : undefined,
      normalizedPath: second ? `/invigilator/${second}` : '/invigilator'
    };
  }

  if (first === 'admin') {
    const validTabs: AdminTab[] = [
      'home',
      'matrix',
      'broadcast',
      'issues',
      'assign',
      'teachers',
      'settings',
      'reports',
      'logs'
    ];
    if (!second || second === 'home') {
      return { view: 'admin', adminTab: 'home', normalizedPath: '/admin' };
    }
    const tab: AdminTab = validTabs.includes(second as AdminTab)
      ? (second as AdminTab)
      : 'home';
    return {
      view: 'admin',
      adminTab: tab,
      normalizedPath: tab === 'settings' ? adminSettingsPath(parseAdminSettingsPage(segments[2]))
        : tab === 'home' ? '/admin' : `/admin/${tab}`
    };
  }

  if (!first) {
    return { view: 'home', normalizedPath: '/' };
  }

  if (first === 'blackboard') {
    return {
      view: 'blackboard',
      classId: second || undefined,
      normalizedPath: second ? `/blackboard/${second}` : '/blackboard'
    };
  }

  return { view: 'home', normalizedPath: '/' };
}

export default function App() {
  const initialRoute = parseRouteFromPathname(window.location.pathname);

  const [activeView, setActiveView] = useState<ActiveView>(initialRoute.view);
  const [intendedView, setIntendedView] = useState<ActiveView | null>(null);
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>(
    initialRoute.adminTab || 'home'
  );
  const [currentPath, setCurrentPath] = useState<string>(initialRoute.normalizedPath);
  const [selectedClassId, setSelectedClassId] = useState<string>(
    initialRoute.view === 'invigilator' ? initialRoute.classId || '' : ''
  );
  const [invigilatorPeriodId, setInvigilatorPeriodId] = useState<string>();
  const [requestedInvigilatorTab, setInvigilatorTab] = useState(initialRoute.invigilatorTab);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [sessionCheck, setSessionCheck] = useState<'checking' | 'ready' | 'error'>('checking');
  const [connectionError, setConnectionError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [lastDataReceivedAt, setLastDataReceivedAt] = useState<string>();
  const [liveConnection, setLiveConnection] = useState<LiveConnection>('connecting');
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const isAdminAuthed = session?.role === 'admin';
  const isInvigilatorAuthed = session?.role === 'invigilator' || isAdminAuthed;
  const accountId = isAdminAuthed ? session.adminId : session?.teacherId;
  const invigilatorTab = requestedInvigilatorTab ?? (session?.role === 'invigilator' ? 'assignments' : 'attendance');
  const loggedInUsername = session?.username || '';
  const mainRef = useRef<HTMLElement>(null);
  const previousNavigation = useRef(currentPath);

  const [systemData, setSystemData] = useState<SystemData>(createEmptyExamState);
  const draftGeneration = systemData.resetId ? `:${systemData.resetId}` : '';
  const attendanceDraftOwner = accountId ? `${session?.role}:${accountId}${draftGeneration}` : undefined;

  useEffect(() => {
    if (sessionCheck === 'ready' && !isLoading && !connectionError) discardOtherAttendanceDrafts(attendanceDraftOwner);
  }, [attendanceDraftOwner, sessionCheck, isLoading, connectionError]);

  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseRouteFromPathname(window.location.pathname);
      setActiveView(parsed.view);
      if (parsed.adminTab) {
        setActiveAdminTab(parsed.adminTab);
      }
      if (parsed.view === 'invigilator' && parsed.classId) {
        setSelectedClassId(parsed.classId);
      }
      setInvigilatorTab(parsed.invigilatorTab);
      setInvigilatorPeriodId(undefined);
      setCurrentPath(parsed.normalizedPath);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToView = useCallback((view: ActiveView) => {
    const targetPath = VIEW_PATHS[view];
    setActiveView(view);
    if (view === 'invigilator') setInvigilatorTab(undefined);
    if (view === 'admin') setActiveAdminTab('home');
    setInvigilatorPeriodId(undefined);
    setCurrentPath(targetPath);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  }, []);

  const navigateToInvigilatorTab = useCallback((tab: InvigilatorTab, classId?: string, periodId?: string) => {
    const targetPath = invigilatorPath(tab, classId);
    setActiveView('invigilator');
    setInvigilatorTab(tab);
    if (classId) setSelectedClassId(classId);
    if (periodId !== undefined) setInvigilatorPeriodId(periodId);
    setCurrentPath(targetPath);
    if (window.location.pathname !== targetPath) window.history.pushState({}, '', targetPath);
  }, []);

  const navigateToAdminTab = useCallback((tab: AdminTab) => {
    const targetPath = tab === 'home' ? '/admin' : `/admin/${tab}`;
    setActiveView('admin');
    setActiveAdminTab(tab);
    setCurrentPath(targetPath);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  }, []);

  const activeSettingsPage = activeAdminTab === 'settings' ? parseAdminSettingsPage(currentPath.split('/')[3]) : undefined;

  const navigateToAdminSettings = (page?: AdminSettingsPage) => {
    const targetPath = adminSettingsPath(page);
    setActiveView('admin');
    setActiveAdminTab('settings');
    setCurrentPath(targetPath);
    if (window.location.pathname !== targetPath) window.history.pushState({}, '', targetPath);
  };

  const navigateToBoardClass = (view: BoardView, classId: string) => {
    const targetPath = boardClassPath(view, classId);
    setCurrentPath(targetPath);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  };

  useEffect(() => {
    let active = true;
    let receivedSnapshot = false;
    let receivedSession = false;
    const controller = new AbortController();
    const unsubscribe = examSync.subscribe((event, payload) => {
      if (event === 'LIVE_CONNECTION') {
        setLiveConnection(payload);
        return;
      }
      if (event === 'SESSION_UPDATED') {
        receivedSession = true;
        setSession(payload ?? null);
        setSessionCheck('ready');
        return;
      }
      if (event === 'INIT_STATE') {
        receivedSnapshot = true;
        setIsLoading(false);
        setConnectionError(false);
      }
      if (['INIT_STATE', 'PERIOD_ATTENDANCE_UPDATED', 'ATTENDANCE_UPDATED', 'CLASSROOM_UPDATED', 'CLASSROOM_ADDED', 'ISSUE_REPORTED', 'ISSUE_UPDATED', 'CONFIG_UPDATED'].includes(event)) {
        setLastDataReceivedAt(serverNow().toISOString());
      }
      setSystemData((prev) => {
        if (event === 'INIT_STATE') {
          return payload;
        }

        if (event === 'CORRECTION_UPDATED') {
          const proposals = prev.correctionProposals ?? [];
          const correctionProposals = proposals.some((item) => item.id === payload.id)
            ? proposals.map((item) => item.id === payload.id ? payload : item)
            : [payload, ...proposals];
          return { ...prev, correctionProposals };
        }

        if (event === 'PERIOD_ATTENDANCE_UPDATED') {
          return {
            ...prev,
            classrooms: prev.classrooms.map((room) => room.classId === payload.classId
              ? { ...room, periodAttendance: { ...room.periodAttendance, [payload.periodId]: payload.attendance } }
              : room)
          };
        }

        if (event === 'ATTENDANCE_UPDATED' || event === 'CLASSROOM_UPDATED') {
          const updatedClassrooms = prev.classrooms.map((c) =>
            c.classId === payload.classId ? { ...c, ...payload } : c
          );
          return { ...prev, classrooms: updatedClassrooms };
        }

        if (event === 'CLASSROOM_ADDED') {
          if (prev.classrooms.some((c) => c.classId === payload.classId)) {
            return {
              ...prev,
              classrooms: prev.classrooms.map((c) =>
                c.classId === payload.classId ? { ...c, ...payload } : c
              )
            };
          }
          return { ...prev, classrooms: [...prev.classrooms, payload] };
        }

        if (event === 'ISSUE_REPORTED') {
          if (prev.issues.some((i) => i.id === payload.id)) {
            return prev;
          }
          return { ...prev, issues: [payload, ...prev.issues] };
        }

        if (event === 'ISSUE_UPDATED') {
          const updatedIssues = prev.issues.map((i) =>
            i.id === payload.id ? { ...i, ...payload } : i
          );
          return { ...prev, issues: updatedIssues };
        }

        if (event === 'ANNOUNCEMENTS_UPDATED') {
          return { ...prev, announcements: payload };
        }

        if (event === 'ANNOUNCEMENT_PUBLISHED') {
          if (prev.announcements.some((a) => a.id === payload.id)) {
            return prev;
          }
          return { ...prev, announcements: [payload, ...prev.announcements] };
        }

        if (event === 'ANNOUNCEMENT_DELETED') {
          return {
            ...prev,
            announcements: prev.announcements.filter((a) => a.id !== payload.id)
          };
        }

        if (event === 'ANNOUNCEMENT_READ') {
          return {
            ...prev,
            announcements: prev.announcements.map((announcement) =>
              announcement.id === payload.id && !announcement.readByClassIds?.includes(payload.classId)
                ? { ...announcement, readByClassIds: [...(announcement.readByClassIds || []), payload.classId] }
                : announcement
            )
          };
        }

        if (event === 'CONFIG_UPDATED') {
          return { ...prev, config: { ...prev.config, ...payload } };
        }

        return prev;
      });
    });

    const markOffline = () => setLiveConnection('offline');
    const reconnectOnline = () => examSync.reconnect();
    window.addEventListener('offline', markOffline);
    window.addEventListener('online', reconnectOnline);
    if (loadAttempt) examSync.reconnect();
    else examSync.init();
    examSync.fetchSession(controller.signal)
      .then((restSession) => {
        if (active && !receivedSession) {
          setSession(restSession);
          setSessionCheck('ready');
        }
      })
      .catch(() => {
        if (active && !receivedSession) setSessionCheck('error');
      });
    examSync.fetchState(controller.signal)
      .then((data) => {
        if (active && !receivedSnapshot) {
          setSystemData(data);
          setLastDataReceivedAt(serverNow().toISOString());
        }
      })
      .catch(() => {
        if (active && !receivedSnapshot) setConnectionError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
      window.removeEventListener('offline', markOffline);
      window.removeEventListener('online', reconnectOnline);
      unsubscribe();
    };
  }, [loadAttempt]);

  const retryLoading = () => {
    setConnectionError(false);
    setIsLoading(true);
    setSessionCheck('checking');
    setLoadAttempt((attempt) => attempt + 1);
  };

  const classList = systemData.classrooms.map((c) => ({
    classId: c.classId,
    className: c.className,
    grade: c.grade,
    invigilator: c.invigilator
  }));

  const teacherRooms = session?.role === 'invigilator' ? systemData.classrooms.filter((room) =>
    session.classId === room.classId || session.invigilation?.some((assignment) => assignment.classId === room.classId)
  ) : [];
  const teacherPeriods = (classId: string) => session?.invigilation?.filter((item) => item.classId === classId).map((item) => item.periodId);
  const requestedClassroomId = activeView === 'invigilator' ? parseRouteFromPathname(currentPath).classId : undefined;
  const accessibleRooms = isAdminAuthed ? systemData.classrooms : teacherRooms;
  const invigilatorClassroom = requestedClassroomId
    ? accessibleRooms.find((room) => room.classId === requestedClassroomId)
    : accessibleRooms.find((room) => room.classId === selectedClassId) ??
      accessibleRooms.find((room) => room.classId === session?.classId) ?? accessibleRooms[0];
  const boardView = activeView === 'blackboard' || activeView === 'attendance' ? activeView : null;
  const boardClassroom = systemData.classrooms.find(
    (classroom) => boardView && currentPath === boardClassPath(boardView, classroom.classId)
  );

  useEffect(() => {
    const section = activeView === 'admin' && isAdminAuthed ? activeSettingsPage ? adminSettingsTitle(activeSettingsPage) : adminPageTitles[activeAdminTab]
      : activeView === 'invigilator' ? invigilatorTitle(invigilatorTab) : boardClassroom?.className;
    const title = [section, pageTitles[activeView], '段考考務即時管理系統'].filter(Boolean);
    document.title = title.join('｜');
  }, [activeView, activeAdminTab, activeSettingsPage, invigilatorTab, isAdminAuthed, boardClassroom?.className]);

  useEffect(() => {
    const previous = previousNavigation.current;
    previousNavigation.current = currentPath;
    if (previous === currentPath) return;

    const [, oldView, oldClass] = previous.split('/');
    const [, newView, newClass] = currentPath.split('/');
    const sameBoard = oldView === newView && (newView === 'blackboard' || newView === 'attendance');
    if (sameBoard && (newView === 'attendance' || (oldClass && newClass))) return;
    mainRef.current?.focus();
  }, [currentPath]);

  const handleLoginSuccess = (authData: ExamSession) => {
    setSession(authData);
    setSystemData(createEmptyExamState());
    setSessionCheck('ready');
    setIsLoading(true);
    setConnectionError(false);
    setLoadAttempt((attempt) => attempt + 1);
    if (authData.classId) {
      setSelectedClassId(authData.classId);
    }

    // Navigate to intended view or default portal for their role
    if (activeView === 'academic' && authData.role === 'admin') {
      setIntendedView(null);
    } else if (intendedView === 'academic' && authData.role === 'admin') {
      setIntendedView(null);
      navigateToView('academic');
    } else if (activeView === 'invigilator' || (activeView === 'admin' && authData.role === 'admin')) {
      setIntendedView(null);
    } else if (intendedView === 'admin' && authData.role === 'admin') {
      setIntendedView(null);
      navigateToView('admin');
    } else if (intendedView === 'invigilator') {
      setIntendedView(null);
      navigateToView('invigilator');
    } else if (authData.role === 'admin') {
      navigateToView('admin');
    } else {
      navigateToView('invigilator');
    }
  };

  const handleLogoutAll = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      await examSync.logout();
      discardOtherAttendanceDrafts();
      setSession(null);
      setSystemData(createEmptyExamState());
      retryLoading();
      navigateToView('login');
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : '登出失敗，請稍後再試。');
    } finally {
      setLoggingOut(false);
    }
  };

  const viewingClassroomBoard = boardView === 'blackboard' && !!boardClassroom;
  const needsSession = activeView === 'academic' || activeView === 'admin' || activeView === 'invigilator' || activeView === 'login';
  const signedInOnLoginPage = activeView === 'login' && session !== null;
  const connectionMessage = {
    connecting: '正在建立即時連線，畫面暫時顯示上次讀取的資料。',
    reconnecting: '即時連線中斷，正在重新連線。畫面暫時顯示上次讀取的資料。',
    offline: '目前未連上網路，畫面暫時顯示上次讀取的資料。',
    connected: undefined
  }[liveConnection];
  useEffect(() => {
    if (activeView === 'login' && session) navigateToView(session.role === 'admin' ? 'admin' : 'invigilator');
  }, [activeView, session, navigateToView]);
  const correctionSubmission = session?.canSubmitCorrections
    ? <CorrectionSubmission key={session.teacherId} data={systemData} teacherId={session.teacherId}
        assignments={session.examAuthorAssignments ?? []} />
    : null;
  const invigilatorRouteClassId = requestedClassroomId || isAdminAuthed || teacherRooms.length > 1 ? invigilatorClassroom?.classId : undefined;
  const showWorkbench = activeView === 'invigilator' && isInvigilatorAuthed;
  const announcementNow = useAnnouncementClock(systemData.announcements, showWorkbench);
  const workbenchAnnouncements = showWorkbench && invigilatorClassroom
    ? classroomAnnouncements(systemData.announcements, invigilatorClassroom, announcementNow) : [];
  const openRoomIssues = showWorkbench ? systemData.issues.filter((issue) =>
    issue.classId === invigilatorClassroom?.classId && issue.status !== 'resolved').length : 0;
  const pendingCorrections = showWorkbench && correctionSubmission ? systemData.correctionProposals?.filter((item) =>
    item.teacherId === session?.teacherId && item.status === 'pending').length ?? 0 : 0;

  return (
    <div
      data-header-tone={activeView === 'admin' ? 'admin' : activeView === 'invigilator' ? 'teacher' : 'board'}
      className="min-h-screen bg-[#f4f6fb] text-slate-900 flex flex-col font-sans selection:bg-blue-700 selection:text-white"
    >
      <SecurityReauth />
      <a href="#main-content" className="skip-to-main no-print" onClick={(event) => {
        event.preventDefault();
        mainRef.current?.focus();
      }}>跳至主要內容</a>
      {/* 頂部全域導覽列 */}
      <Header
        activeView={activeView}
        currentPath={currentPath}
        onViewChange={(view) => {
          setIntendedView(null);
          navigateToView(view);
        }}
        onNavigateAdminTab={navigateToAdminTab}
        isInvigilatorAuthed={isInvigilatorAuthed}
        isAdminAuthed={isAdminAuthed}
        checkingSession={sessionCheck === 'checking'}
        canSubmitCorrections={session?.canSubmitCorrections}
        loggedInUsername={loggedInUsername}
        loggingOut={loggingOut}
        onLogout={handleLogoutAll}
      />
      {!showWorkbench && <RequestActivity />}

      {/* 主畫面（依獨立路徑渲染） */}
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 max-w-[1720px] w-full mx-auto px-2.5 sm:px-5 lg:px-8 py-4 sm:py-6"
      >
        {logoutError && <div role="alert" className="no-print mb-3 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-900">
          <p>登出未確認。{logoutError}</p>
          <button type="button" className="min-h-10 shrink-0 px-2" onClick={() => setLogoutError('')}>關閉</button>
        </div>}
        {activeView === 'privacy' || activeView === 'disclaimer' ? (
          <PolicyPage view={activeView} />
        ) : isLoading || signedInOnLoginPage || (needsSession && sessionCheck === 'checking') ? (
          <SystemFeedback
            key={loadAttempt}
            title={signedInOnLoginPage ? '登入成功，正在開啟工作台…' : isLoading ? '正在載入考務資料…' : '正在確認登入狀態…'}
            detail="正在與考務系統連線，請稍候。"
          />
        ) : connectionError ? (
          <SystemFeedback title="暫時無法載入考務資料" detail="系統會嘗試重新連線，也可以立即重新載入。" onRetry={retryLoading} />
        ) : needsSession && sessionCheck === 'error' ? (
          <SystemFeedback title="暫時無法確認登入狀態" detail="請重新載入，系統會再次確認你的登入狀態。" onRetry={retryLoading} />
        ) : (
          <>
            {connectionMessage && !showWorkbench && !viewingClassroomBoard && activeView !== 'academic' && activeView !== 'login' && (
              <p role="status" className="no-print mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-950">{connectionMessage}</p>
            )}
            {/* 獨立路徑 0: /login (獨立登入頁面) */}
            {activeView === 'login' && (
              <LoginPage
                config={systemData.config}
                intendedView={intendedView}
                onLoginSuccess={handleLoginSuccess}
                onNavigateView={navigateToView}
              />
            )}

            {activeView === 'home' && (
              <BoardPortalHome
                details={[systemData.config.examName, systemData.config.subject, systemData.config.examDate].filter(Boolean).join(' · ') || undefined}
                onNavigate={navigateToView}
              />
            )}

            {/* 獨立路徑 1: /blackboard (教室電子黑板) */}
            {boardView === 'blackboard' && boardClassroom && (
              <div className="w-full">
                <BlackboardView
                  classroom={boardClassroom}
                  announcements={systemData.announcements}
                  config={systemData.config}
                  connectionMessage={connectionMessage}
                  onChooseClassroom={() => navigateToView('blackboard')}
                />
              </div>
            )}

            {/* 獨立路徑 2: /attendance (考場出席人數即時看板) */}
            {boardView === 'attendance' && (boardClassroom || ((currentPath === '/attendance' || currentPath === '/attendance/school') && systemData.classrooms.length > 0)) && (
              <div className="w-full flex-1 min-h-0 flex flex-col lg:overflow-hidden">
                <AttendanceBoardView
                  data={systemData}
                  mode={boardClassroom ? 'classroom' : 'school'}
                  selectedClassroom={boardClassroom ?? systemData.classrooms[0]}
                  onSelectClassroom={(classId) => navigateToBoardClass('attendance', classId)}
                  onShowSchool={() => navigateToView('attendance')}
                />
              </div>
            )}

            {boardView && !boardClassroom && (boardView !== 'attendance' || (currentPath !== '/attendance' && currentPath !== '/attendance/school') || !systemData.classrooms.length) && (
              <>
              {boardView === 'attendance' && systemData.classrooms.length > 0 && <a href="/attendance/school" className="mb-4 block rounded-xl bg-teal-800 p-4 text-center font-bold text-white">開啟全校總覽</a>}
              <ClassroomPicker
                board={boardView}
                classrooms={systemData.classrooms}
                config={systemData.config}
                onSelectClassroom={(classId) => navigateToBoardClass(boardView, classId)}
              />
              </>
            )}

            {activeView === 'academic' && (
              isAdminAuthed ? <AcademicBoardView data={systemData} liveConnection={liveConnection}
                lastDataReceivedAt={lastDataReceivedAt} onReconnect={() => examSync.reconnect()}
                onOpenOperations={() => navigateToView('admin')}
                onOpenClassroom={(classId, periodId) => navigateToInvigilatorTab('attendance', classId, periodId)} />
              : <>
                  {session && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 font-bold text-amber-950">教務處看板僅供教務管理員使用。請改用教務管理員帳號登入。</p>}
                  <LoginPage config={systemData.config} intendedView="academic"
                    onLoginSuccess={handleLoginSuccess} onNavigateView={navigateToView} />
                </>
            )}

            {/* 獨立路徑 3: /invigilator (監考老師點名端) */}
            {activeView === 'invigilator' && (
              <div className="min-w-0">
                {isInvigilatorAuthed ? (
                  <div className="teacher-workbench">
                    <InvigilatorNavigation active={invigilatorTab} classId={invigilatorRouteClassId}
                      examName={systemData.config.examName}
                      showAssignments={session?.role === 'invigilator'} showCorrections={Boolean(correctionSubmission)}
                      status={{
                        announcements: workbenchAnnouncements.length ? `${workbenchAnnouncements.length} 則公告` : undefined,
                        issues: openRoomIssues ? `共 ${openRoomIssues} 則未結案` : undefined,
                        corrections: pendingCorrections ? `${pendingCorrections} 則待審` : undefined
                      }}
                      onNavigate={(tab) => navigateToInvigilatorTab(tab, invigilatorRouteClassId)} />
                    <div className="min-w-0 space-y-4">
                      {connectionMessage && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <button type="button" onClick={() => examSync.reconnect()}
                            className="inline-flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-1 text-sm font-bold text-slate-900 hover:bg-amber-50">
                            <RefreshCw size={16} aria-hidden="true" />重新連線
                            <span className="wb-button-status" data-tone="warning">{liveConnection === 'offline' ? '離線' : liveConnection === 'connecting' ? '連線中' : '重連中'}</span>
                          </button>
                          <p className="text-xs text-slate-600">目前顯示上次讀取的資料。</p>
                        </div>
                      )}
                      <p role="status" className="sr-only">{connectionMessage}</p>
                      {invigilatorTab === 'assignments' && session?.role === 'invigilator' ? (
                        <>
                          <WorkbenchHeader tab="assignments" />
                          {teacherRooms.length ? teacherRooms.map((room) => {
                            const assigned = teacherPeriods(room.classId);
                            return <TeacherAssignments key={room.classId} classroom={room} config={systemData.config}
                              periods={examPeriods(systemData.config).filter((period) => periodApplies(period, room) && (!assigned || assigned.includes(period.id)))}
                              onSelectPeriod={(periodId) => navigateToInvigilatorTab('attendance', room.classId, periodId)} />;
                          }) : <TeacherAssignments config={systemData.config} />}
                        </>
                      ) : invigilatorTab === 'corrections' ? (
                        <>
                          <WorkbenchHeader tab="corrections" />
                          {correctionSubmission ?? <p className="wb-panel text-sm text-slate-700">此帳號尚未取得試題更正送審權限。</p>}
                        </>
                      ) : invigilatorClassroom && invigilatorTab !== 'assignments' ? (
                        <ScheduledInvigilatorView key={JSON.stringify([session?.role, attendanceDraftOwner ?? session?.username, invigilatorClassroom.classId])}
                          tab={invigilatorTab}
                          attendanceDraftOwner={attendanceDraftOwner}
                          classroom={invigilatorClassroom}
                          config={systemData.config}
                          issues={systemData.issues}
                          announcements={workbenchAnnouncements}
                          classList={isAdminAuthed ? classList : teacherRooms}
                          onSelectClass={(classId) => navigateToInvigilatorTab(invigilatorTab, classId, '')}
                          initialPeriodId={invigilatorPeriodId}
                          allowedPeriodIds={isAdminAuthed ? undefined : teacherPeriods(invigilatorClassroom.classId)}
                        />
                      ) : (
                        <>
                          <WorkbenchHeader tab={invigilatorTab} />
                          <div className="wb-panel space-y-3 text-sm text-slate-700">
                            <p>{invigilatorTab === 'assignments' ? '此帳號沒有個人的監考安排。'
                              : requestedClassroomId ? '這個連結指定的考場不存在，或目前帳號沒有查看權限。'
                              : '目前尚未指派考場。教務處完成指派後，就能在這裡查看考場資料。'}</p>
                            {requestedClassroomId && invigilatorTab !== 'assignments' && (
                              <button type="button"
                                onClick={() => isAdminAuthed ? navigateToAdminTab('matrix') : navigateToInvigilatorTab('assignments')}
                                className="min-h-11 rounded-xl bg-teal-800 px-3 text-sm font-bold text-white hover:bg-teal-900">
                                {isAdminAuthed ? '返回考場看板' : '查看我的監考安排'}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <LoginPage
                    config={systemData.config}
                    intendedView="invigilator"
                    onLoginSuccess={handleLoginSuccess}
                    onNavigateView={navigateToView}
                  />
                )}
              </div>
            )}

            {/* 獨立路徑 4: /admin 及各子路徑 (/admin/matrix, /admin/broadcast, /admin/issues, /admin/settings, /admin/reports) */}
            {activeView === 'admin' && (
              <div className={activeAdminTab === 'home' && isAdminAuthed ? 'w-full' : 'mx-auto max-w-7xl'}>
                {isAdminAuthed ? (
                  <AdminView
                    data={systemData}
                    onSelectClassroom={(id, periodId) => {
                      navigateToInvigilatorTab('attendance', id, periodId);
                    }}
                    activeAdminTab={activeAdminTab}
                    onAdminTabChange={navigateToAdminTab}
                    activeSettingsPage={activeSettingsPage}
                    onSettingsPageChange={navigateToAdminSettings}
                    onNavigateView={navigateToView}
                  />
                ) : (
                  <LoginPage
                    config={systemData.config}
                    intendedView="admin"
                    onLoginSuccess={handleLoginSuccess}
                    onNavigateView={navigateToView}
                  />
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* 頁尾 */}
      <footer
        className="py-2 shrink-0 border-t border-slate-200 bg-white px-4 text-sm text-slate-700"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3">
          <p className="py-1 text-xs font-medium">© TWEXAM 版權所有</p>
          <nav aria-label="網站聲明" className="flex flex-wrap items-center gap-1">
            {policyViews.map((view) => (
              <a key={view} href={VIEW_PATHS[view]} aria-current={activeView === view ? 'page' : undefined}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  setIntendedView(null);
                  navigateToView(view);
                }}
                className="inline-flex min-h-8 items-center rounded-lg px-2 text-xs font-bold text-teal-800 hover:bg-teal-50 hover:underline focus-visible:outline-2 focus-visible:outline-teal-700 aria-[current=page]:bg-teal-50 aria-[current=page]:underline">
                {pageTitles[view]}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
