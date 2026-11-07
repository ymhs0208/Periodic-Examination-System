import type React from 'react';
import { invigilatorPage, type InvigilatorTab } from './InvigilatorNavigation';

type WorkbenchInfo = {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' }>;
};

/** 教師工作台各分頁共用的頁內標頭：頁面名稱、說明、關鍵資訊與操作。 */
export function WorkbenchHeader({ tab, info = [], actions }: {
  tab: InvigilatorTab;
  info?: WorkbenchInfo[];
  actions?: React.ReactNode;
}) {
  const page = invigilatorPage(tab);
  const Icon = page.icon;
  return (
    <header className="wb-hero">
      <div className="wb-hero-top">
        <div className="min-w-0">
          <p className="wb-eyebrow"><Icon size={16} aria-hidden="true" />教師工作台</p>
          <h1 tabIndex={-1} className="mt-2 text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-black tracking-tight text-slate-950">{page.title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-700 sm:text-base">{page.description}</p>
        </div>
        {actions && <div className="wb-hero-actions">{actions}</div>}
      </div>
      {info.length > 0 && (
        <dl className="wb-context">
          {info.map(({ label, value, icon: InfoIcon }) => (
            <div key={label} className="flex min-w-0 items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-950 sm:px-3">
              {InfoIcon && <InfoIcon size={18} className="shrink-0 opacity-70" aria-hidden="true" />}
              <div className="min-w-0">
                <dt className="text-xs font-bold opacity-80">{label}</dt>
                <dd className="mt-0.5 text-sm font-bold [overflow-wrap:anywhere]">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
