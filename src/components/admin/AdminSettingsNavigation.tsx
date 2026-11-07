import { ArrowRight, Building2, CalendarDays, ClipboardList, GraduationCap, KeyRound, Settings } from 'lucide-react';

const pages = {
  schedule: { title: '考程表', description: '設定各日的考試節次、科目、時間與適用班級。', icon: CalendarDays },
  basics: { title: '考試基本資料', description: '維護學校名稱、學期、段考名稱與考場守則。', icon: ClipboardList },
  grades: { title: '年級管理', description: '新增年級代碼與名稱，或調整既有年級。', icon: GraduationCap },
  classrooms: { title: '考場班級', description: '新增考場，調整班級、年級與應到人數。', icon: Building2 },
  credentials: { title: '管理員帳號', description: '更新教務行政端的登入帳號與密碼。', icon: KeyRound }
};

export type AdminSettingsPage = keyof typeof pages;
const settingsPages = Object.keys(pages) as AdminSettingsPage[];
export const adminSettingsPath = (page?: AdminSettingsPage) => page ? `/admin/settings/${page}` : '/admin/settings';
export const adminSettingsTitle = (page: AdminSettingsPage) => pages[page].title;

export function parseAdminSettingsPage(segment?: string) {
  return settingsPages.find((page) => page === segment);
}

export function AdminSettingsNavigation({ active, onNavigate }: {
  active?: AdminSettingsPage;
  onNavigate?: (page?: AdminSettingsPage) => void;
}) {
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, page?: AdminSettingsPage) => {
    if (!onNavigate || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(page);
  };

  return (
    <>
      <nav aria-label="考務設定子頁" className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3">
        {[undefined, ...settingsPages].map((page) => {
          const title = page ? pages[page].title : '設定總覽';
          const Icon = page ? pages[page].icon : Settings;
          return (
            <a key={page ?? 'overview'} href={adminSettingsPath(page)} aria-current={page === active ? 'page' : undefined}
              onClick={(event) => navigate(event, page)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 text-xs font-bold text-slate-800 hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700 aria-[current=page]:border-teal-800 aria-[current=page]:bg-teal-800 aria-[current=page]:text-white sm:px-3 sm:text-sm">
              <Icon size={16} aria-hidden="true" />{title}
            </a>
          );
        })}
      </nav>
      {active === undefined && (
        <ul aria-label="考務設定項目" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {settingsPages.map((page) => {
            const { title, description, icon: Icon } = pages[page];
            return (
              <li key={page}>
                <a href={adminSettingsPath(page)} onClick={(event) => navigate(event, page)}
                  className="flex h-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700 sm:p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-900"><Icon size={19} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-black text-slate-950">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{description}</p>
                  </div>
                  <ArrowRight size={16} className="mt-0.5 shrink-0 text-teal-800" aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
