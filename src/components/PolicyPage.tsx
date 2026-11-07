import { FileText, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

export type PolicyView = 'privacy' | 'disclaimer';

type PolicySection = { id: string; title: string; content: ReactNode };

const link = 'rounded-sm font-bold text-teal-800 underline underline-offset-4 hover:text-teal-950';
const list = 'list-disc space-y-2 pl-5';

const privacy: PolicySection[] = [
  {
    id: 'scope',
    title: '適用範圍與使用目的',
    content: <p>本政策適用於 TWEXAM 段考考務即時管理系統。資料用於帳號驗證、考程與監考指派、分節點名、考場通報、試題更正審核、公告顯示及考務報表。各校的考務資料問題由該校教務處受理。</p>
  },
  {
    id: 'information',
    title: '系統處理的資料',
    content: (
      <ul className={list}>
        <li><strong>教師帳號</strong>包括姓名、登入帳號、科別、監考班級與授權狀態。登入密碼經雜湊處理後保存。</li>
        <li><strong>考務紀錄</strong>包括班級、應到與實到人數、缺席座號及假別，並可能包含校方登錄的姓名、通報、試題更正送審內容與審核結果。</li>
        <li><strong>連線與安全資料</strong>包括登入工作階段，以及用於限制異常登入的帳號與 IP 位址相關資料。</li>
        <li><strong>操作紀錄</strong>包含操作帳號、時間、項目及相關對象，僅供管理員查閱。</li>
      </ul>
    )
  },
  {
    id: 'access',
    title: '公開範圍與資料使用',
    content: (
      <>
        <p>電子黑板和出席即時看板可在未登入時瀏覽，可能顯示考場與監考資訊、公開公告、出席統計、缺席座號及標準假別。學生姓名、自由填寫的缺席備註及考場通報依身分與班級權限提供。試題更正送審內容由送審老師與教務人員查看，核准發布後才會顯示公告內容。</p>
        <p>教務人員可依考務需要檢視或匯出報表。請將含個人資料的匯出檔與紙本限於考務用途。未提供必要的帳號資料時，可能無法使用登入後的功能。</p>
      </>
    )
  },
  {
    id: 'providers',
    title: '登入 Cookie 與外部服務',
    content: (
      <>
        <p>系統以必要的 Cookie 維持登入，登入有效期最長為 12 小時，登出會結束目前的登入工作階段。</p>
        <p>網站與資料由 Cloudflare 提供主機和儲存服務，網頁也會向 Google Fonts 請求字型。相關連線可能經由服務商在台灣以外的基礎設施處理。請參閱服務商的說明。</p>
        <ul className={list}>
          <li><a className={link} href="https://www.cloudflare.com/privacypolicy/">Cloudflare 隱私政策</a></li>
          <li><a className={link} href="https://fonts.google.com/faq">Google Fonts 說明</a></li>
        </ul>
      </>
    )
  },
  {
    id: 'retention',
    title: '資料保存與權利申請',
    content: (
      <>
        <p>操作紀錄自登錄日起保留三個月，屆期由系統自動刪除。考務紀錄的保存與清理依學校的考務、檔案保存規定與適用法令辦理。個別資料的保存期限請向辦理考試的學校確認。</p>
        <p>你可依適用規定申請查閱、取得副本、更正或補充個人資料，也可請求停止相關資料作業或刪除資料。請使用學校官網公布的教務處聯絡方式，說明要查詢的考試、班級與請求事項。學校可能需要核對身分。</p>
        <p><a className={link} href="https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=3">個人資料保護法第 3 條</a></p>
      </>
    )
  }
];

const disclaimer: PolicySection[] = [
  {
    id: 'official-information',
    title: '考務資訊與正式指示',
    content: <p>本系統協助顯示考程、點名、考場通報與試題更正。若畫面與學校正式公告或監考老師轉達的教務指示有差異，請以學校確認的正式內容為準。考試時間、試題更正與作答方式如有疑問，請向監考老師或教務處確認。</p>
  },
  {
    id: 'availability',
    title: '更新與服務中斷',
    content: <p>網路、裝置或服務維護可能造成畫面延遲、暫時無法使用或資料尚未同步。若送出點名或通報後未顯示成功，請確認系統紀錄，必要時依校方流程回報。緊急考場事件請立即告知監考老師並依校方應變流程處理。</p>
  },
  {
    id: 'copyright',
    title: '版權與內容使用',
    content: <p>© TWEXAM 版權所有。學校提供的試題更正、公告與報表，及網站使用的第三方字型與程式元件，各依原權利人或適用授權條款使用。分享或轉載校方資料前，請確認授權與個人資料公開範圍。</p>
  },
  {
    id: 'rights',
    title: '權利與聯絡方式',
    content: <p>本聲明以適用法令為準，法令保障的權利及依法應負的責任仍適用。考務內容如有錯誤，請透過學校官方聯絡方式通知教務處。</p>
  }
];

export function PolicyPage({ view }: { view: PolicyView }) {
  const isPrivacy = view === 'privacy';
  const Icon = isPrivacy ? ShieldCheck : FileText;
  const sections = isPrivacy ? privacy : disclaimer;

  return (
    <article aria-labelledby="policy-title" className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6">
      <header className="attendance-banner relative isolate overflow-hidden rounded-3xl px-5 py-7 text-white sm:px-9 sm:py-10">
        <div className="attendance-banner-pattern pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <div className="flex items-center gap-2 text-sm font-bold text-teal-100"><Icon size={19} aria-hidden="true" />TWEXAM · 網站聲明</div>
        <h1 id="policy-title" className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{isPrivacy ? '隱私政策' : '免責聲明'}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-100 sm:text-base">
          {isPrivacy ? '了解本系統如何處理考務資料、誰可以查看，以及如何提出個人資料請求。' : '了解系統資訊的使用範圍、服務中斷時的處理方式與版權。'}
        </p>
        <p className="mt-4 text-xs font-bold text-teal-100">更新日期 <time dateTime="2026-11-07">2026 年 11 月 7 日</time></p>
      </header>
      <div className="grid min-w-0 items-start gap-4 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-6">
        <nav aria-label="本頁目錄" className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-black text-slate-950">本頁目錄</p>
          <ul className="grid gap-1 sm:grid-cols-2 md:grid-cols-1">
            {sections.map(({ id, title }) => (
              <li key={id}>
                <a href={`#${id}`} className="flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-teal-800 hover:bg-teal-50">{title}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-4 sm:px-7">
          {sections.map(({ id, title, content }) => (
            <section key={id} className="py-5 sm:py-6" aria-labelledby={id}>
              <h2 id={id} tabIndex={-1} className="scroll-mt-5 text-lg font-black text-slate-950 sm:text-xl">{title}</h2>
              <div className="mt-2 space-y-3 text-sm leading-7 text-slate-700 sm:text-base">{content}</div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
