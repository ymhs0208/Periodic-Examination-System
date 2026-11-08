import { ArrowLeft, ArrowRight, Building2, CalendarDays, ChevronDown, ClipboardList, GraduationCap, KeyRound, Settings, Trash2 } from 'lucide-react';

const pages = {
  schedule: { title: '考程表', description: '設定各日的考試節次、科目、時間與適用班級。', icon: CalendarDays },
  basics: { title: '考試基本資料', description: '維護學校名稱、學期、段考名稱與考場守則。', icon: ClipboardList },
  grades: { title: '年級管理', description: '新增年級代碼與名稱，或調整既有年級。', icon: GraduationCap },
  classrooms: { title: '考場班級', description: '新增考場，調整班級、年級與應到人數。', icon: Building2 },
  credentials: { title: '管理員帳號', description: '更新教務管理中心的登入帳號與密碼。', icon: KeyRound },
  reset: { title: '重設考務資料', description: '清除本次段考紀錄，或將考務資料及教師帳號全部重設。', icon: Trash2 }
};

export type AdminSettingsPage = keyof typeof pages;
const settingsPages = Object.keys(pages) as AdminSettingsPage[];
const groups = [
  { title: '考試安排', items: ['schedule', 'basics'] },
  { title: '考場管理', items: ['grades', 'classrooms'] },
  { title: '帳號與資料', items: ['credentials', 'reset'] }
] as const;
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700';
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
    if (!onNavigate || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(page);
  };

  if (!active) {
    return (
      <>
        <header className="view-header-banner flex items-start gap-3 rounded-2xl border border-(--header-edge) p-4 sm:gap-4 sm:p-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-(--header-edge) bg-white text-(--header-accent) sm:size-13">
            <Settings size={24} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">考務設定</h2>
            <p className="mt-1 text-sm leading-6 text-slate-700">從下方選擇要調整的項目。</p>
          </div>
        </header>
        <nav aria-label="考務設定項目" className="grid gap-3 lg:grid-cols-3">
          {groups.map((group) => (
            <section key={group.title} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <h3 className="px-1 pb-3 text-sm font-black text-slate-700">{group.title}</h3>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {group.items.map((page) => {
                  const { title, description, icon: Icon } = pages[page];
                  const reset = page === 'reset';
                  return (
                    <li key={page}>
                      <a href={adminSettingsPath(page)} onClick={(event) => navigate(event, page)}
                        className={`group flex h-full min-w-0 items-start gap-2.5 rounded-xl border p-3 ${reset ? 'border-rose-200 bg-rose-50 hover:bg-rose-100' : 'border-slate-200 bg-slate-50 hover:border-violet-200 hover:bg-violet-50'} ${focus}`}>
                        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${reset ? 'bg-rose-100 text-rose-900' : 'bg-violet-100 text-violet-900'}`}><Icon size={18} aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-base font-black ${reset ? 'text-rose-950' : 'text-slate-950'}`}>{title}</span>
                          <span className="mt-1 block text-sm leading-5 text-slate-700">{description}</span>
                        </span>
                        <ArrowRight size={16} className="mt-1 shrink-0 text-slate-500 group-hover:text-violet-800" aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </>
    );
  }

  const links = groups.map((group) => (
    <div key={group.title} className="space-y-1">
      <p className="px-2.5 text-xs font-bold text-slate-500">{group.title}</p>
      {group.items.map((page) => {
        const { title, icon: Icon } = pages[page];
        return (
          <a key={page} href={adminSettingsPath(page)} onClick={(event) => navigate(event, page)} aria-current={page === active ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-2 rounded-lg border border-transparent px-2.5 text-sm font-bold text-slate-700 hover:bg-violet-50 aria-[current=page]:border-violet-200 aria-[current=page]:bg-violet-50 aria-[current=page]:text-violet-950 ${focus}`}>
            <Icon size={16} className={page === 'reset' ? 'shrink-0 text-rose-800' : 'shrink-0 text-violet-800'} aria-hidden="true" />{title}
          </a>
        );
      })}
    </div>
  ));

  return (
    <nav aria-label="考務設定子頁" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
      <a href={adminSettingsPath()} onClick={(event) => navigate(event)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-sm font-bold text-violet-900 hover:bg-violet-50 ${focus}`}>
        <ArrowLeft size={16} aria-hidden="true" />返回設定總覽
      </a>
      <div className="mt-2 hidden space-y-3 border-t border-slate-200 pt-3 lg:block">{links}</div>
      <details key={active} className="group mt-2 border-t border-slate-200 pt-2 lg:hidden">
        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg bg-violet-50 px-2.5 text-sm font-bold text-violet-950 marker:content-none [&::-webkit-details-marker]:hidden ${focus}`}>
          <span className="min-w-0">目前在 {pages[active].title}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs">切換項目 <ChevronDown size={16} className="group-open:rotate-180" aria-hidden="true" /></span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">{links}</div>
      </details>
    </nav>
  );
}
