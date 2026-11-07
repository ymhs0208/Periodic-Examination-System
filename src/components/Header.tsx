import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  ArrowRight, Building2, ChevronDown, ClipboardCheck, GraduationCap, History, KeyRound, LayoutGrid,
  LogOut, Settings, ShieldCheck, UserCheck, Users, X, type LucideIcon
} from 'lucide-react';
import type { AdminTab } from './admin/AdminView';
import type { PolicyView } from './PolicyPage';

export type ActiveView = 'blackboard' | 'attendance' | 'academic' | 'invigilator' | 'admin' | 'login' | PolicyView;

export const VIEW_PATHS: Record<ActiveView, string> = {
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
  autoOpenMenuSignal: number;
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

const adminItems: NavigationItem[] = [
  { view: 'admin', label: '教務管理中心', description: '開啟教室黑板、出席看板與教務處看板', icon: Building2 },
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

function itemPath(item: NavigationItem) {
  return item.tab ? `/admin/${item.tab}` : VIEW_PATHS[item.view];
}

export function Header({
  activeView, currentPath, onViewChange, onNavigateAdminTab, isInvigilatorAuthed, isAdminAuthed, checkingSession, canSubmitCorrections,
  loggedInUsername, autoOpenMenuSignal, onLogout, loggingOut
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
    else if (autoOpenMenuSignal > 0) setIsMenuOpen(true);
  }, [autoOpenMenuSignal, isAuthenticated]);

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

  const groups = [
    ...(isAdminAuthed ? [{ label: '教務管理中心', items: adminItems }] : []),
    { label: '考場作業', items: [canSubmitCorrections
      ? { ...invigilatorItem, description: '查看監考安排與試題更正送審' }
      : invigilatorItem] }
  ];

  function isActiveItem(item: NavigationItem) {
    if (activeView !== item.view) return false;
    if (item.view !== 'admin') return true;
    const matchesTab = (entry: NavigationItem) => currentPath === itemPath(entry) || currentPath.startsWith(`${itemPath(entry)}/`);
    if (item.tab) return matchesTab(item);
    return !adminItems.some((entry) => entry.tab && matchesTab(entry));
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#10243d] text-white shadow-sm">
      <div className="relative mx-auto grid max-w-[1720px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-3 sm:gap-x-4 sm:px-6 lg:px-8">
        <a
          href={VIEW_PATHS.blackboard}
          onClick={(event) => navigate(event, 'blackboard')}
          className={`col-start-1 row-start-1 flex min-h-14 min-w-0 items-center gap-2 rounded-xl sm:min-h-16 sm:gap-3 ${focusStyle}`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-200 text-[#10243d] sm:size-10">
            <GraduationCap size={22} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black tracking-tight min-[400px]:hidden">段考考務系統</span>
            <span className="hidden truncate text-sm font-black tracking-tight min-[400px]:block sm:text-base">段考考務即時管理系統</span>
            <span aria-hidden="true" className="hidden text-[10px] font-bold tracking-widest text-teal-200/90 lg:block">考場、點名與教務管理中心</span>
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
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-2.5 text-xs font-bold text-white hover:bg-white/10 aria-expanded:border-teal-300/60 aria-expanded:bg-white/10 sm:px-3 sm:text-sm ${focusStyle}`}
            >
              <RoleIcon size={17} className="shrink-0 text-teal-200" aria-hidden="true" />
              <span>{roleLabel}</span>
              <ChevronDown size={15} className={menuVisible ? 'rotate-180' : undefined} aria-hidden="true" />
            </button>
          ) : !checkingSession ? (
            <a
              href={VIEW_PATHS.login}
              aria-current={activeView === 'login' ? 'page' : undefined}
              onClick={(event) => navigate(event, 'login')}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-200 px-3 text-xs font-black text-[#10243d] hover:bg-teal-100 sm:px-4 sm:text-sm ${focusStyle}`}
            >
              <KeyRound size={16} aria-hidden="true" />登入
            </a>
          ) : null}

          {menuVisible && (
            <div
              ref={panelRef}
              id="account-panel"
              className="absolute inset-x-3 top-full z-50 mt-2 flex max-h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl sm:inset-x-auto sm:right-6 sm:w-96 md:right-0 md:mt-4 md:max-h-[calc(100dvh-6rem)]"
            >
              <div className="attendance-banner flex shrink-0 items-center gap-3 px-4 py-3 text-white">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-teal-200">
                  <RoleIcon size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-teal-200">{roleLabel}</p>
                  <p className="mt-0.5 truncate text-sm font-black" title={loggedInUsername}>{loggedInUsername || '已登入'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    triggerRef.current?.focus();
                  }}
                  aria-label="關閉帳號選單"
                  className={`grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl hover:bg-white/10 ${focusStyle}`}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <nav aria-label="帳號功能" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-2.5 py-2.5">
                {groups.map((group) => (
                  <section key={group.label} aria-label={group.label}>
                    <h2 className="px-2 pb-1 text-xs font-bold text-slate-600">{group.label}</h2>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActiveItem(item);
                      return (
                        <a
                          key={itemPath(item)}
                          href={itemPath(item)}
                          onClick={(event) => navigate(event, item.view, item.tab)}
                          aria-current={active ? 'page' : undefined}
                          className={`group flex min-h-12 items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-slate-100 aria-[current=page]:bg-teal-50 ${focusStyle}`}
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 group-aria-[current=page]:bg-teal-100 group-aria-[current=page]:text-teal-800">
                            <Icon size={16} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold group-aria-[current=page]:text-teal-900">{item.label}</span>
                            <span className="block text-xs leading-4 text-slate-600">{item.description}</span>
                          </span>
                          <ArrowRight size={15} className="shrink-0 text-slate-500 group-aria-[current=page]:text-teal-800" aria-hidden="true" />
                        </a>
                      );
                    })}
                  </section>
                ))}
              </nav>

              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 p-2.5">
                <a href={VIEW_PATHS.login} onClick={(event) => { event.preventDefault(); setIsMenuOpen(false); onLogout(); }} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold hover:bg-slate-100 ${focusStyle}`}>
                  <KeyRound size={15} aria-hidden="true" />登出並切換帳號
                </a>
                <button type="button" disabled={loggingOut} onClick={() => {
                  setIsMenuOpen(false);
                  triggerRef.current?.focus();
                  onLogout();
                }} className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-50 px-2 text-xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50 ${focusStyle}`}>
                  <LogOut size={15} aria-hidden="true" />{loggingOut ? '登出中…' : '登出'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
