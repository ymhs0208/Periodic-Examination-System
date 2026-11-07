import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Plus, RefreshCw, Shield } from 'lucide-react';
import { examSync } from '../../services/examSync';
import { MIN_ADMIN_PASSWORD_LENGTH } from '../../types/exam';
import type { AdminAccount, AdminAccounts } from '../../types/exam';
import { useActionConfirmation } from '../useActionConfirmation';

const input = 'mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950';
const secondary = 'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-default disabled:opacity-50 sm:text-sm';

export function AdminAccountsSettings() {
  const { confirmAction, confirmationDialog } = useActionConfirmation();
  const [data, setData] = useState<AdminAccounts>();
  const [editing, setEditing] = useState<AdminAccount | 'new'>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [activity, setActivity] = useState('');
  const busy = Boolean(activity);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const enabledCount = data?.accounts.filter((account) => account.enabled).length ?? 0;

  async function refresh() {
    setActivity('正在載入管理員帳號…');
    setError('');
    try {
      setData(await examSync.getAdminAccounts());
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法讀取管理員帳號。');
    } finally {
      setActivity('');
    }
  }

  useEffect(() => { void refresh(); }, []);

  function openForm(account: AdminAccount | 'new') {
    setEditing(account);
    setUsername(account === 'new' ? '' : account.username);
    setPassword('');
    setError('');
    setNotice('');
  }

  async function persist(updates: Parameters<typeof examSync.saveAdminAccount>[0], id: string | undefined, message: string) {
    setActivity('正在儲存管理員帳號…');
    setError('');
    setNotice('');
    try {
      setData(await examSync.saveAdminAccount(updates, id));
      setEditing(undefined);
      setPassword('');
      setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法儲存管理員帳號。');
    } finally {
      setActivity('');
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || busy) return;
    const name = username.trim();
    const secret = password.trim();
    if (!name || ((editing === 'new' || secret) && [...secret].length < MIN_ADMIN_PASSWORD_LENGTH)) {
      setError(`請輸入帳號，新增或重設的密碼至少需要 ${MIN_ADMIN_PASSWORD_LENGTH} 個字元。`);
      return;
    }
    if (!await confirmAction({
      title: editing === 'new' ? '確認新增管理員帳號' : '確認更新管理員帳號',
      description: editing === 'new' ? '此帳號會取得教務管理中心的完整管理權限。'
        : secret ? '重設密碼會結束此帳號的其他登入。' : undefined,
      facts: [
        { label: '管理員帳號', value: name },
        { label: '密碼', value: secret ? '將儲存新密碼' : '沿用目前密碼' }
      ],
      confirmLabel: editing === 'new' ? '確認新增' : '確認更新'
    })) return;
    await persist({ username: name, password: secret || undefined }, editing === 'new' ? undefined : editing.id,
      editing === 'new' ? '管理員帳號已新增。' : '管理員帳號已更新。');
  }

  async function toggle(account: AdminAccount) {
    if (busy) return;
    const enabled = !account.enabled;
    if (!await confirmAction({
      title: enabled ? '確認啟用管理員帳號' : '確認停用管理員帳號',
      description: enabled ? '啟用後可重新登入教務管理中心。' : '停用後，此帳號目前的登入會結束。',
      facts: [{ label: '管理員帳號', value: account.username }],
      confirmLabel: enabled ? '確認啟用' : '確認停用',
      danger: !enabled
    })) return;
    await persist({ enabled }, account.id, enabled ? '管理員帳號已啟用。' : '管理員帳號已停用。');
  }

  return (
    <section aria-labelledby="admin-accounts-heading" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      {confirmationDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="admin-accounts-heading" className="flex items-center gap-2 text-lg font-black text-slate-950">
            <Shield size={20} aria-hidden="true" className="text-teal-800" />教務管理員帳號
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">每位管理員使用自己的帳號登入。啟用中的帳號具有完整教務管理權限。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void refresh()} disabled={busy} className={secondary}><RefreshCw size={15} aria-hidden="true" />重新載入</button>
          <button type="button" disabled={busy || !data} onClick={() => openForm('new')}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-teal-800 px-3 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">
            <Plus size={16} aria-hidden="true" />新增管理員
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-900">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm font-bold text-teal-900">{notice}</p>}
      {busy && <p role="status" className="text-sm font-bold text-teal-900">{activity}</p>}

      {editing && (
        <form onSubmit={save} className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-3.5 sm:p-4">
          <h4 className="flex items-center gap-2 text-base font-black text-teal-950">
            <KeyRound size={17} aria-hidden="true" />{editing === 'new' ? '建立新管理員' : '編輯帳號與重設密碼'}
          </h4>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-bold text-slate-800">登入帳號
              <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={128} disabled={busy} />
            </label>
            <label className="min-w-0 text-sm font-bold text-slate-800">新密碼
              <input className={input} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                required={editing === 'new'} minLength={MIN_ADMIN_PASSWORD_LENGTH} maxLength={256} disabled={busy}
                placeholder={editing === 'new' ? `至少 ${MIN_ADMIN_PASSWORD_LENGTH} 個字元` : '留空沿用原密碼'} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-teal-800 px-3 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">核對並儲存</button>
            <button type="button" disabled={busy} onClick={() => { setEditing(undefined); setPassword(''); setError(''); }} className={secondary}>取消編輯</button>
          </div>
        </form>
      )}

      {data && (
        <>
          <p className="text-sm font-bold text-slate-700">共 {data.accounts.length} 個帳號 · {enabledCount} 個啟用中</p>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
            {data.accounts.map((account) => {
              const current = account.id === data.currentId;
              return (
                <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 p-3 sm:px-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-black text-slate-950 [overflow-wrap:anywhere]">{account.username}</p>
                    <p className="mt-1 text-xs font-bold text-slate-700">{account.enabled ? '已啟用' : '已停用'}{current ? ' · 目前登入' : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => openForm(account)} aria-label={`編輯 ${account.username}`} className={secondary}>編輯</button>
                    <button type="button" disabled={busy || (account.enabled && (current || enabledCount <= 1))}
                      onClick={() => void toggle(account)} aria-label={`${account.enabled ? '停用' : '啟用'} ${account.username}`} className={secondary}>
                      {account.enabled ? '停用' : '啟用'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs leading-6 text-slate-700">至少保留一個啟用帳號。若要停用自己，請由另一位管理員操作。</p>
        </>
      )}
    </section>
  );
}
