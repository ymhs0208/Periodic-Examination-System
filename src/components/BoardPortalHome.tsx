import type { ReactNode } from 'react';
import { LayoutGrid, Monitor, Radio, type LucideIcon } from 'lucide-react';

export type BoardPortalView = 'blackboard' | 'attendance' | 'academic';

export const BOARD_PORTALS: { view: BoardPortalView; href: string; label: string; description: string; icon: LucideIcon }[] = [
  { view: 'blackboard', href: '/blackboard', label: '教室電子黑板', description: '投影考程、公告與試題更正', icon: Monitor },
  { view: 'attendance', href: '/attendance', label: '出席即時看板', description: '查看各班出席統計與缺席明細', icon: LayoutGrid },
  { view: 'academic', href: '/board/academic', label: '教務處看板', description: '全校考場監看、異常優先與投影模式', icon: Radio }
];

export function BoardPortals({ onNavigate }: { onNavigate?: (view: BoardPortalView) => void }) {
  return (
    <nav aria-label="看板入口" className="grid gap-4 lg:grid-cols-3">
      {BOARD_PORTALS.map(({ view, href, label, description, icon: Icon }) => (
        <a key={view} href={href}
          onClick={(event) => {
            if (!onNavigate || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onNavigate(view);
          }}
          className="flex min-h-52 flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700 sm:p-7">
          <span className="grid size-14 place-items-center rounded-2xl bg-teal-50 text-teal-800"><Icon size={28} aria-hidden="true" /></span>
          <span className="mt-6 text-2xl font-black text-slate-950">{label}</span>
          <span className="mt-2 text-sm leading-6 text-slate-600">{description}</span>
          <span className="mt-auto pt-6 text-sm font-bold text-teal-800">開啟</span>
        </a>
      ))}
    </nav>
  );
}

export function BoardPortalHome({
  eyebrow = '段考考務即時管理系統',
  title = '選擇要開啟的看板',
  details,
  onNavigate,
  children
}: {
  eyebrow?: ReactNode;
  title?: string;
  details?: string;
  onNavigate?: (view: BoardPortalView) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[#e7eef2] shadow-sm">
      <section className="attendance-banner no-print relative isolate overflow-hidden px-5 py-7 text-white sm:px-10 sm:py-10">
        <div className="attendance-banner-pattern pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-teal-200">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">{title}</h1>
        {details && <p className="mt-3 text-sm text-slate-200 sm:text-base">{details}</p>}
      </section>
      <div className="flex-1 p-5 sm:p-10">
        <BoardPortals onNavigate={onNavigate} />
        {children}
      </div>
    </div>
  );
}
