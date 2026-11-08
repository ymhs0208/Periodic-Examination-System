import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  ArrowRight, Building2, ChevronDown, ClipboardCheck, GraduationCap, History, KeyRound, LayoutGrid,
  LogOut, Settings, ShieldCheck, UserCheck, UserRoundCog, Users, X, type LucideIcon
} from 'lucide-react';
import type { AdminTab } from './admin/AdminView';
import type { PolicyView } from './PolicyPage';

export type ActiveView = 'home' | 'blackboard' | 'attendance' | 'academic' | 'invigilator' | 'admin' | 'login' | PolicyView;

export const VIEW_PATHS: Record<ActiveView, string> = {
  home: '/',
  blackboard: '/blackboard',
  attendance: '/attendance',
  academic: '/board/academic',
  invigilator: '/invigilator',
  admin: '/admin',
  login: '/login',
  privacy: '/privacy',
  disclaimer: '/disclaimer'
};

interface HeaderProps {
  activeView: ActiveView;
  currentPath: string;
  onViewChange: (view: ActiveView) => void;
  onNavigateAdminTab: (tab: AdminTab) => void;
  isInvigilatorAuthed: boolean;
  isAdminAuthed: boolean;
  checkingSession?: boolean;
  canSubmitCorrections?: boolean;
  loggedInUsername: string;
  onLogout: () => void;
  loggingOut?: boolean;
}

interface NavigationItem {
  view: ActiveView;
  tab?: AdminTab;
  label: string;
  description: string;
  icon: LucideIcon;
}

const adminHomeItem: NavigationItem = {
  view: 'admin', label: '教務管理中心', description: '開啟教室黑板、出席看板與教務處看板', icon: Building2
};

const adminItems: NavigationItem[] = [
  { view: 'admin', tab: 'matrix', label: '考場看板', description: '查看各班點名進度與考場狀況', icon: LayoutGrid },
  { view: 'admin', tab: 'teachers', label: '教師帳號管理', description: '匯入名冊與管理登入帳號', icon: Users },
  { view: 'admin', tab: 'assign', label: '監考指派', description: '安排各班的監考老師', icon: UserCheck },
  { view: 'admin', tab: 'settings', label: '考程與班級設定', description: '維護考程、考場與管理員帳號', icon: Settings },
  { view: 'admin', tab: 'logs', label: '操作紀錄', description: '查看登入及考務異動', icon: History }
];

const invigilatorItem: NavigationItem = {
  view: 'invigilator',
  label: '教師工作台',
  description: '查看我的監考安排、點名與通報',
  icon: ClipboardCheck
};

const focusStyle = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500';
const accountAction = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 px-2 py-2 text-sm font-bold text-stone-800 hover:bg-stone-200 disabled:cursor-default disabled:opacity-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700';

function itemPath(item: NavigationItem) {
  return item.tab ? `/admin/${item.tab}` : VIEW_PATHS[item.view];
}

export function Header({
  activeView, currentPath, onViewChange, onNavigateAdminTab, isInvigilatorAuthed, isAdminAuthed, checkingSession, canSubmitCorrections,
  loggedInUsername, onLogout, loggingOut
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isAuthenticated = isInvigilatorAuthed || isAdminAuthed;
  const roleLabel = isAdminAuthed ? '教務管理員' : canSubmitCorrections ? '出題老師' : '監考老師';
  const RoleIcon = isAdminAuthed ? ShieldCheck : UserCheck;
  const menuVisible = isAuthenticated && isMenuOpen;

  useEffect(() => {
    if (!isAuthenticated) setIsMenuOpen(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!menuVisible) return;
    const firstLink = panelRef.current?.querySelector<HTMLAnchorElement>('nav a');
    firstLink?.focus({ preventScroll: true });

    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsMenuOpen(false);
        triggerRef.current?.focus();
      }
    }

    function closeOnBack() {
      setIsMenuOpen(false);
    }

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('popstate', closeOnBack);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('popstate', closeOnBack);
    };
  }, [menuVisible]);

  function navigate(event: MouseEvent<HTMLAnchorElement>, view: ActiveView, tab?: AdminTab) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setIsMenuOpen(false);
    if (panelRef.current?.contains(event.currentTarget)) triggerRef.current?.focus();
    if (tab) onNavigateAdminTab(tab);
    else onViewChange(view);
  }

  const teacherHomeItem = canSubmitCorrections
    ? { ...invigilatorItem, description: '查看監考安排與試題更正送審' }
    : invigilatorItem;
  const primaryItem = isAdminAuthed ? adminHomeItem : teacherHomeItem;
  const PrimaryIcon = primaryItem.icon;

  function isActiveItem(item: NavigationItem) {
    if (activeView !== item.view) return false;
    if (item.view !== 'admin') return true;
    const path = itemPath(item);
    return currentPath === path || Boolean(item.tab && currentPath.startsWith(`${path}/`));
  }

  function closeAccountPanel() {
    setIsMenuOpen(false);
    triggerRef.current?.focus();
  }

  function logoutFromPanel() {
    closeAccountPanel();
    onLogout();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white text-slate-950 shadow-sm">
      <div className="relative mx-auto grid max-w-[1720px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-3 sm:gap-x-4 sm:px-6 lg:px-8">
        <a
          href={VIEW_PATHS.home}
          onClick={(event) => navigate(event, 'home')}
          className={`col-start-1 row-start-1 flex min-h-14 min-w-0 items-center gap-2 rounded-xl sm:min-h-16 sm:gap-3 ${focusStyle}`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-800 sm:size-10">
            <GraduationCap size={22} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black tracking-tight min-[400px]:hidden">段考考務系統</span>
            <span className="hidden truncate text-sm font-black tracking-tight min-[400px]:block sm:text-base">段考考務即時管理系統</span>
            <span aria-hidden="true" className="hidden text-[10px] font-bold tracking-widest text-slate-500 lg:block">考場、點名與教務管理中心</span>
          </span>
        </a>

        <div
          ref={accountRef}
          className="col-start-2 row-start-1 justify-self-end md:relative"
          onBlur={(event) => {
            if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
              setIsMenuOpen(false);
            }
          }}
        >
          {isAuthenticated ? (
            <button
              ref={triggerRef}
              type="button"
              aria-label={`帳號選單，${roleLabel}`}
              aria-expanded={menuVisible}
              aria-controls="account-panel"
              onClick={() => setIsMenuOpen((open) => !open)}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-stone-200 bg-white px-2.5 text-xs font-bold text-stone-800 hover:bg-stone-50 aria-expanded:border-stone-300 aria-expanded:bg-stone-100 sm:px-3 sm:text-sm ${focusStyle}`}
            >
              <RoleIcon size={17} className="shrink-0 text-teal-800" aria-hidden="true" />
              <span>{roleLabel}</span>
              <ChevronDown size={15} className={menuVisible ? 'rotate-180' : undefined} aria-hidden="true" />
            </button>
          ) : !checkingSession ? (
            <a
              href={VIEW_PATHS.login}
              aria-current={activeView === 'login' ? 'page' : undefined}
              onClick={(event) => navigate(event, 'login')}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-800 px-3 text-xs font-black text-white hover:bg-teal-900 sm:px-4 sm:text-sm ${focusStyle}`}
            >
              <KeyRound size={16} aria-hidden="true" />登入
            </a>
          ) : null}

          {menuVisible && (
            <div
              ref={panelRef}
              id="account-panel"
              className="absolute inset-x-3 top-full z-50 mt-2 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white text-stone-950 shadow-xl sm:inset-x-auto sm:right-6 sm:w-[26rem] md:right-0 md:max-h-[calc(100dvh-6rem)]"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 sm:px-5 sm:pt-5">
                <div className="flex items-start gap-3 border-b border-stone-200 pb-4">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-full sm:size-14 ${isAdminAuthed ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800'}`}>
                    <RoleIcon size={25} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-black leading-tight [overflow-wrap:anywhere]" title={loggedInUsername}>{loggedInUsername || '已登入'}</p>
                    <p className="mt-1.5 text-sm font-semibold text-stone-600">{roleLabel}</p>
                  </div>
                  <button type="button" onClick={closeAccountPanel} aria-label="關閉帳號選單"
                    className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-100 ${focusStyle}`}>
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>

                <nav aria-label="帳號功能" className="space-y-3 py-4">
                  <a href={itemPath(primaryItem)} onClick={(event) => navigate(event, primaryItem.view)}
                    aria-current={isActiveItem(primaryItem) ? 'page' : undefined}
                    className={`flex min-h-12 items-center justify-center gap-2 rounded-xl bg-stone-950 px-3 py-2.5 text-center text-base font-bold text-white hover:bg-stone-800 ${focusStyle}`}>
                    <PrimaryIcon size={18} className="shrink-0" aria-hidden="true" />{primaryItem.label}
                    <ArrowRight size={16} className="shrink-0" aria-hidden="true" />
                  </a>
                  <p className="text-center text-xs leading-5 text-stone-600">{primaryItem.description}</p>
                  {isAdminAuthed && (
                    <div role="group" aria-label="常用入口" className="grid grid-cols-2 gap-1.5">
                      {[...adminItems, teacherHomeItem].map((item) => {
                        const Icon = item.icon;
                        return (
                          <a
                            key={itemPath(item)}
                            href={itemPath(item)}
                            onClick={(event) => navigate(event, item.view, item.tab)}
                            aria-current={isActiveItem(item) ? 'page' : undefined}
                            title={item.description}
                            className={`group flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-bold text-stone-800 hover:bg-stone-100 aria-[current=page]:bg-violet-50 aria-[current=page]:text-violet-900 ${focusStyle}`}
                          >
                            <Icon size={16} className="shrink-0 text-stone-500 group-aria-[current=page]:text-violet-800" aria-hidden="true" />
                            <span>{item.label}</span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </nav>
              </div>

              <div className="shrink-0 bg-white px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="grid grid-cols-2 divide-x divide-stone-300/60 overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
                  <button type="button" disabled={loggingOut} onClick={logoutFromPanel} className={accountAction}>
                    <UserRoundCog size={16} aria-hidden="true" />切換帳號
                  </button>
                  <button type="button" disabled={loggingOut} onClick={logoutFromPanel} className={accountAction}>
                    <LogOut size={16} aria-hidden="true" />{loggingOut ? '登出中…' : '登出'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
