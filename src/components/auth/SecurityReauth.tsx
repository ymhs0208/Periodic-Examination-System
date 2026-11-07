import { useEffect, useRef, useState } from 'react';
import { setReauthenticationHandler } from '../../services/examSync';

// Credentials stay in component memory only and are cleared on completion/cancel.
export function SecurityReauth() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
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
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); }, [open]);
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
  return <dialog ref={dialog} aria-labelledby="reauth-title" onCancel={event => { event.preventDefault(); if (!busy) finish(false); }} className="rounded-2xl p-6 w-[min(95vw,420px)] backdrop:bg-black/40">
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id="reauth-title" className="text-lg font-bold">確認管理員身分</h2>
      <p className="text-sm">帳號變更或名冊匯入需要最近 5 分鐘內的驗證。驗證成功後會繼續原操作。</p>
      <label className="text-sm font-bold">目前管理員密碼
        <input autoFocus type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className="block w-full border rounded-lg p-2 mt-1" />
      </label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex gap-3 justify-end"><button type="button" disabled={busy} onClick={() => finish(false)}>取消</button><button type="submit" disabled={busy} className="bg-blue-700 text-white rounded-lg px-4 py-2">{busy ? '驗證中…' : '驗證並繼續'}</button></div>
    </form>
  </dialog>;
}
