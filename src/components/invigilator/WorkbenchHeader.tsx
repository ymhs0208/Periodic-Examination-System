import type React from 'react';
import { ChevronRight } from 'lucide-react';
import { invigilatorPage, type InvigilatorTab } from './InvigilatorNavigation';

export type WorkbenchInfo = {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' }>;
  tone?: 'default' | 'success' | 'warning';
};

const toneClass = {
  default: 'border-slate-200 bg-white text-slate-950',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900'
};

/** 教師工作台各分頁共用的頁內標頭：頁面名稱、說明、關鍵資訊與操作。 */
export function WorkbenchHeader({ tab, title, titleId, heading = 'h1', info, actions, children }: {
  tab: InvigilatorTab;
  title?: string;
  titleId?: string;
  heading?: 'h1' | 'h2';
  info: WorkbenchInfo[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const page = invigilatorPage(tab);
  const Icon = page.icon;
  const Title = heading;
  return (
    <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-1.5 bg-gradient-to-r from-teal-700 via-teal-500 to-sky-400" aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-800 ring-1 ring-teal-100 sm:h-14 sm:w-14">
            <Icon size={26} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-xs font-bold tracking-wide text-teal-700">
              教師工作台<ChevronRight size={13} aria-hidden="true" />{page.title}
            </p>
            <Title id={titleId} tabIndex={-1} className="mt-0.5 scroll-mt-4 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              {title ?? page.title}
            </Title>
            <p className="mt-1 text-sm leading-6 text-slate-600">{page.description}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {info.length > 0 && (
        <dl className="grid gap-2 border-t border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
          {info.map(({ label, value, icon: InfoIcon, tone = 'default' }) => (
            <div key={label} className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2 ${toneClass[tone]}`}>
              {InfoIcon && <InfoIcon size={18} className="shrink-0 opacity-70" aria-hidden="true" />}
              <div className="min-w-0">
                <dt className="text-[11px] font-bold tracking-wide opacity-70">{label}</dt>
                <dd className="text-sm font-black [overflow-wrap:anywhere] sm:text-base">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}
      {children && <div className="border-t border-slate-100 p-3 sm:p-4">{children}</div>}
    </header>
  );
}
