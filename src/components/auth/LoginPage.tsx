import React, { useState } from 'react';
import {
  Lock,
  UserRound,
  GraduationCap,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  Monitor,
  ClipboardCheck,
  FileCheck2,
  Radio
} from 'lucide-react';
import { examSync } from '../../services/examSync';
import type { ExamConfig, ExamSession } from '../../types/exam';
import type { ActiveView } from '../Header';

interface LoginPageProps {
  config: ExamConfig;
  intendedView?: ActiveView | null;
  onLoginSuccess: (data: ExamSession) => void;
  onNavigateView: (view: ActiveView) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  config,
  intendedView,
  onLoginSuccess,
  onNavigateView
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setLoginError(null);

    if (!username.trim() || !password.trim()) {
      setLoginError('請輸入登入帳號與密碼');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await examSync.login({
        role: (intendedView === 'admin' || intendedView === 'academic') ? 'admin' : 'invigilator',
        username: username.trim(),
        password: password.trim()
      });

      if (res.success && res.data) {
        onLoginSuccess(res.data);
      } else {
        setLoginError(res.error || '帳號或密碼錯誤，請重新確認');
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '連線驗證失敗，請稍後再試。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAdminLogin = (intendedView === 'admin' || intendedView === 'academic');

  return (
    <div className="mx-auto my-2 grid w-full max-w-[1060px] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_16px_48px_-28px_#10243d50] sm:my-8 md:grid-cols-[minmax(0,1fr)_minmax(0,0.88fr)]">
      <section className="min-w-0 px-5 py-7 sm:px-10 sm:py-10 lg:px-14 lg:py-12" aria-labelledby="login-title">
        <div className="mx-auto max-w-sm">
          <div className="mb-7">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-900">
              <GraduationCap size={17} aria-hidden="true" />考務工作台
            </p>
            <h1 id="login-title" className="text-[1.75rem] font-black leading-tight tracking-tight text-[#10243d] sm:text-4xl">
              {intendedView === 'academic' ? '教務處看板登入' : isAdminLogin ? '教務管理中心登入' : intendedView === 'invigilator' ? '教師登入' : '登入考務帳號'}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {isAdminLogin ? '請使用教務管理員帳號登入。' : '請輸入教務處提供的帳號與密碼。'}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {loginError && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
                <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{loginError}
              </p>
            )}
            <div>
              <label htmlFor="exam-username" className="mb-1.5 block text-sm font-bold text-slate-800">登入帳號</label>
              <div className="relative">
                <UserRound size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input id="exam-username" name="username" type="text" value={username} onChange={(event) => setUsername(event.target.value)}
                  placeholder="請輸入考務帳號" autoComplete="username" autoCapitalize="none" spellCheck={false}
                  className="min-h-[3.25rem] w-full rounded-xl border border-slate-300 bg-[#f8fafb] py-2 pl-11 pr-3 text-base text-slate-950 placeholder:text-slate-500 focus:bg-white focus:outline-2 focus:outline-teal-700"
                />
              </div>
            </div>
            <div>
              <label htmlFor="exam-password" className="mb-1.5 block text-sm font-bold text-slate-800">登入密碼</label>
              <div className="relative">
                <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input id="exam-password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)}
                  placeholder="請輸入登入密碼" autoComplete="current-password"
                  className="min-h-[3.25rem] w-full rounded-xl border border-slate-300 bg-[#f8fafb] py-2 pl-11 pr-12 text-base text-slate-950 placeholder:text-slate-500 focus:bg-white focus:outline-2 focus:outline-teal-700"
                />
                <button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                  className="absolute inset-y-0.5 right-0.5 grid w-11 cursor-pointer place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={isSubmitting}
              className="group relative flex min-h-[3.25rem] w-full cursor-pointer items-center justify-center rounded-xl bg-[#10243d] px-12 py-3 text-base font-bold text-white hover:bg-[#1b3b51] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting ? '正在驗證…' : '登入'}
              <ArrowRight size={18} className="absolute right-4 text-teal-200 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-3">
            <a href="/blackboard" onClick={(event) => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onNavigateView('blackboard');
            }} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg text-sm font-bold text-teal-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
              <Monitor size={17} aria-hidden="true" />前往電子黑板<ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <aside className="attendance-banner relative isolate hidden min-w-0 flex-col justify-between overflow-hidden px-8 py-9 text-white md:flex lg:px-10 lg:py-11">
        <div className="attendance-banner-pattern pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <div>
          <p className="break-words text-xs font-bold tracking-widest text-teal-200">{config.schoolName || '段考考務即時管理系統'}</p>
          <p className="mt-3 max-w-[15rem] text-3xl font-black leading-tight tracking-tight lg:text-4xl">段考考務管理</p>
          <p className="mt-3 text-sm leading-7 text-slate-200">在同一個工作台完成點名、考場通報與試題公告。</p>
        </div>

        <div className="relative mx-auto my-5 h-48 w-full max-w-[300px]" aria-hidden="true">
          <div className="absolute left-1/2 top-1/2 size-40 -translate-1/2 rounded-full border border-teal-100/20 bg-teal-200/10" />
          <div className="absolute inset-y-3 left-1/2 w-36 -translate-x-1/2 -rotate-[14deg] rounded-2xl border border-teal-100/20 bg-teal-200/10" />
          <div className="absolute inset-y-2 left-1/2 flex w-36 -translate-x-1/2 rotate-[8deg] flex-col gap-3 rounded-2xl border border-white/20 bg-[#1d4c5e] p-4 shadow-xl">
            <FileCheck2 size={32} className="text-teal-200" />
            {[0, 1, 2].map((line) => (
              <div key={line} className="flex items-center gap-2">
                <span className="size-3 shrink-0 rounded-sm border border-teal-200/60 bg-teal-100/20" />
                <span className="h-1.5 flex-1 rounded-full bg-white/25" />
              </div>
            ))}
          </div>
          <div className="absolute left-4 top-12 grid size-11 -rotate-12 place-items-center rounded-xl border border-teal-100/20 bg-[#18374c] text-teal-200"><ClipboardCheck size={22} /></div>
          <div className="absolute bottom-5 right-5 grid size-12 rotate-12 place-items-center rounded-xl bg-teal-200 text-[#10243d] shadow-lg"><Radio size={23} /></div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/15 pt-4 text-xs font-bold text-teal-100">
          <span>監考點名</span><span>考場通報</span><span>教務管理中心</span>
        </div>
      </aside>
    </div>
  );
};
