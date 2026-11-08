import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { setReauthenticationHandler } from '../../services/examSync';

// Credentials stay in component memory only and are cleared on completion/cancel.
export function SecurityReauth() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const resolve = useRef<((ok: boolean) => void) | null>(null);
  const finish = (ok: boolean) => {
    setPassword(''); setError(''); setOpen(false); dialog.current?.close();
    resolve.current?.(ok); resolve.current = null;
  };
  useEffect(() => {
    let pending: Promise<boolean> | null = null;
    setReauthenticationHandler(() => {
      if (pending) return pending;
      pending = new Promise<boolean>(done => { resolve.current = done; setOpen(true); }).finally(() => { pending = null; });
      return pending;
    });
    return () => { setReauthenticationHandler(null); resolve.current?.(false); };
  }, []);
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      passwordInput.current?.focus({ preventScroll: true });
    }
  }, [open]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/reauth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal: AbortSignal.timeout(30000) });
      const result = await response.json() as { success?: boolean; error?: string };
      setPassword('');
      if (!response.ok || !result.success) setError(result.error || '重新驗證失敗，請重新登入後再試');
      else finish(true);
    } catch { setPassword(''); setError('無法完成驗證，請檢查網路後再試'); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} aria-labelledby="reauth-title" aria-describedby="reauth-description"
    onCancel={(event) => { event.preventDefault(); if (!busy) finish(false); }}
    className="no-print fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/65">
    <form onSubmit={submit} className="flex max-h-[calc(100dvh-2rem-2px)] flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 bg-teal-50 p-4 admin-theme:bg-violet-50 sm:px-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-teal-800 admin-theme:text-violet-800"><ShieldCheck size={20} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 id="reauth-title" className="text-lg font-black">確認管理員身分</h2>
          <p id="reauth-description" className="mt-1 text-sm leading-6 text-slate-700">此操作需要最近 5 分鐘內的管理員驗證。驗證成功後會繼續原操作。</p>
        </div>
      </header>
      <div className="min-h-0 space-y-3 overflow-y-auto p-4 sm:px-6">
        <label className="block text-sm font-bold text-slate-800">目前管理員密碼
          <input ref={passwordInput} type="password" autoComplete="current-password" required maxLength={256}
            value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy}
            className="mt-1.5 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-sm font-bold text-rose-900">{error}</p>}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:px-6">
        <button type="button" disabled={busy} onClick={() => finish(false)}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50">取消</button>
        <button type="submit" disabled={busy}
          className="min-h-11 rounded-xl bg-teal-800 px-4 text-sm font-bold text-white hover:bg-teal-900 admin-theme:bg-violet-800 admin-theme:hover:bg-violet-900 disabled:opacity-50">{busy ? '驗證中…' : '驗證並繼續'}</button>
      </footer>
    </form>
  </dialog>;
}
