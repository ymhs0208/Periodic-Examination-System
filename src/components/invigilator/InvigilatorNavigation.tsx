import { useEffect, useId, useRef, useState } from 'react';
import { Bell, CalendarDays, ChevronDown, ChevronRight, ClipboardCheck, FilePenLine, GraduationCap, Send } from 'lucide-react';
import './workbench.css';

const pages = {
  attendance: { title: '座號點名', short: '回報出缺席', icon: ClipboardCheck, description: '只需要標記缺席座號。全班到齊時，直接送出點名。' },
  announcements: { title: '考務公告', short: '查看最新通知', icon: Bell, description: '查看此考場適用的試題更正、考試延長及緊急通知。' },
  issues: { title: '考場通報', short: '聯絡教務處', icon: Send, description: '選擇考試節次，向教務處通報考場狀況或查看本節回覆。' },
  assignments: { title: '我的監考安排', short: '查看監考時間', icon: CalendarDays, description: '依日期查看監考考場和時間，從指定節次直接進入點名。' },
  corrections: { title: '試題更正送審', short: '提交與查詢', icon: FilePenLine, description: '提交更正內容並追蹤審核進度。教務處核准後才會公告。' }
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

export function InvigilatorNavigation({ active, classId, showAssignments, showCorrections, examName, status, onNavigate }: {
  active: InvigilatorTab;
  classId?: string;
  showAssignments: boolean;
  showCorrections: boolean;
  examName?: string;
  status?: Partial<Record<InvigilatorTab, string>>;
  onNavigate: (tab: InvigilatorTab) => void;
}) {
  const [open, setOpen] = useState(false);
  const linksId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const activeStatus = status?.[active];
  useEffect(() => setOpen(false), [active, classId]);

  function closeMenu() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <nav aria-label="教師工作台頁面" className="wb-nav" onKeyDown={(event) => {
      if (open && event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
      }
    }}>
      <div className="wb-identity">
        <span className="wb-mark"><GraduationCap size={22} aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="text-base font-black text-slate-950">教師工作台</p>
          <p className="text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">{examName || '段考考務'}</p>
        </div>
      </div>
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={linksId}
        onClick={() => setOpen(!open)} className="wb-nav-toggle">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-teal-800">{open ? '收合功能選單' : '展開功能選單'}</span>
          <span className="mt-0.5 block text-sm font-black">{invigilatorTitle(active)}</span>
        </span>
        {activeStatus && <span className="wb-button-status" data-tone={active === 'announcements' ? undefined : 'warning'}>{activeStatus}</span>}
        <ChevronDown size={18} className="wb-nav-chevron" aria-hidden="true" />
      </button>
      <div id={linksId} hidden={!open} className="wb-links">
        {tabs.filter((tab) => (tab !== 'assignments' || showAssignments) && (tab !== 'corrections' || showCorrections)).map((tab) => {
          const { title, short, icon: Icon } = pages[tab];
          return (
            <a key={tab} href={invigilatorPath(tab, classId)} aria-current={active === tab ? 'page' : undefined}
              onClick={(event) => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                closeMenu();
                onNavigate(tab);
              }}
              className="wb-link">
              <span className="wb-link-icon"><Icon size={18} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{title}</span>
                {status?.[tab] ? (
                  <span className="wb-link-status"><span className="wb-button-status" data-tone={tab === 'announcements' ? undefined : 'warning'}>{status[tab]}</span></span>
                ) : <span className="wb-link-hint">{short}</span>}
              </span>
              <ChevronRight size={16} className="wb-link-arrow" aria-hidden="true" />
            </a>
          );
        })}
      </div>
    </nav>
  );
}
