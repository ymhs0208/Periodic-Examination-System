import { Bell, CalendarDays, ClipboardCheck, FilePenLine, Send } from 'lucide-react';

const pages = {
  attendance: { title: '座號點名', icon: ClipboardCheck, description: '依座號標記缺席學生，確認後回報本節出缺席。' },
  announcements: { title: '考務公告', icon: Bell, description: '教務處發布的試題更正、延長與緊急公告。' },
  issues: { title: '考場通報', icon: Send, description: '考場有狀況時，一鍵通知教務處與巡堂人員。' },
  assignments: { title: '我的監考安排', icon: CalendarDays, description: '查看你負責的考場與各日監考節次。' },
  corrections: { title: '試題更正送審', icon: FilePenLine, description: '提出試題更正，送教務處審核後公告。' }
};

export type InvigilatorTab = keyof typeof pages;
const tabs = Object.keys(pages) as InvigilatorTab[];

export function isInvigilatorTab(value: string): value is InvigilatorTab {
  return tabs.some((tab) => tab === value);
}

export const invigilatorPage = (tab: InvigilatorTab) => pages[tab];
export const invigilatorTitle = (tab: InvigilatorTab) => pages[tab].title;
export const invigilatorPath = (tab: InvigilatorTab, classId?: string) =>
  `/invigilator/${tab}${classId ? `/${encodeURIComponent(classId)}` : ''}`;

export function InvigilatorNavigation({ active, classId, showAssignments, showCorrections, onNavigate }: {
  active: InvigilatorTab;
  classId?: string;
  showAssignments: boolean;
  showCorrections: boolean;
  onNavigate: (tab: InvigilatorTab) => void;
}) {
  return (
    <nav aria-label="監考工作台頁面" className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3">
      {tabs.filter((tab) => (tab !== 'assignments' || showAssignments) && (tab !== 'corrections' || showCorrections)).map((tab) => {
        const { title, icon: Icon } = pages[tab];
        return (
          <a key={tab} href={invigilatorPath(tab, classId)} aria-current={active === tab ? 'page' : undefined}
            onClick={(event) => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onNavigate(tab);
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 text-xs font-bold text-slate-800 hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700 aria-[current=page]:border-teal-800 aria-[current=page]:bg-teal-800 aria-[current=page]:text-white sm:px-3 sm:text-sm">
            <Icon size={16} aria-hidden="true" />{title}
          </a>
        );
      })}
    </nav>
  );
}
