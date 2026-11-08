import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { examSync } from '../../services/examSync';
import { MIN_ADMIN_PASSWORD_LENGTH } from '../../types/exam';
import type { AdminAccount, AdminAccounts } from '../../types/exam';
import { useActionConfirmation } from '../useActionConfirmation';

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700';
const input = `mt-1.5 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950 ${focus}`;
const button = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold disabled:cursor-default disabled:opacity-50 ${focus}`;
const secondary = `${button} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
const primary = `${button} bg-violet-800 text-white hover:bg-violet-900`;

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
  const editor = useRef<HTMLDialogElement>(null);
  const editingAccount = Boolean(editing);

  useLayoutEffect(() => {
    if (editingAccount && editor.current && !editor.current.open) editor.current.showModal();
  }, [editingAccount]);

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

  function closeForm() {
    editor.current?.close();
    setEditing(undefined);
    setPassword('');
    setError('');
  }

  async function persist(updates: Parameters<typeof examSync.saveAdminAccount>[0], id: string | undefined, message: string) {
    setActivity('正在儲存管理員帳號…');
    setError('');
    setNotice('');
    try {
      setData(await examSync.saveAdminAccount(updates, id));
      closeForm();
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
    <section aria-labelledby="admin-accounts-heading" className="min-w-0 space-y-4">
      {confirmationDialog}
      <header className="view-header-banner flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-(--header-edge) p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-(--header-edge) bg-white text-(--header-accent)">
            <ShieldCheck size={23} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="admin-accounts-heading" className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">教務管理員帳號</h2>
            <p className="mt-1 text-sm leading-6 text-slate-700">啟用中的帳號可登入並管理所有考務設定。</p>
          </div>
        </div>
        <button type="button" disabled={busy || !data} onClick={() => openForm('new')} className={primary}>
          <Plus size={17} aria-hidden="true" />新增管理員
        </button>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
          <h3 className="text-base font-black text-slate-950">帳號清單</h3>
          <button type="button" onClick={() => void refresh()} disabled={busy} className={secondary}>
            <RefreshCw size={15} aria-hidden="true" />重新載入
          </button>
        </div>
        {data && (
          <dl className="grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 bg-slate-50">
            {[
              { label: '全部帳號', value: data.accounts.length, color: 'text-slate-950' },
              { label: '已啟用', value: enabledCount, color: 'text-emerald-800' },
              { label: '已停用', value: data.accounts.length - enabledCount, color: 'text-slate-600' }
            ].map(({ label, value, color }) => (
              <div key={label} className="px-2 py-2.5 text-center">
                <dt className="text-xs font-bold text-slate-700">{label}</dt>
                <dd className={`mt-0.5 font-mono text-xl font-black tabular-nums ${color}`}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {!editing && (error || notice || activity) && (
          <div className="space-y-2 px-4 py-3 sm:px-5">
            {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-900">{error}</p>}
            {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{notice}</p>}
            {busy && <p role="status" className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <RefreshCw size={15} className="motion-safe:animate-spin" aria-hidden="true" />{activity}
            </p>}
          </div>
        )}
        {data && (
          <>
            {data.accounts.length ? (
              <ul aria-label="管理員帳號清單" className="divide-y divide-slate-200">
                {data.accounts.map((account) => {
                  const current = account.id === data.currentId;
                  return (
                    <li key={account.id} className="grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center sm:px-5">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${current ? 'bg-violet-100 text-violet-900' : 'bg-slate-100 text-slate-600'}`}>
                          <UserRound size={19} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-950 [overflow-wrap:anywhere]">{account.username}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-xs font-bold">
                            <span className={`rounded-full px-2 py-0.5 ${account.enabled ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>
                              {account.enabled ? '已啟用' : '已停用'}
                            </span>
                            {current && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-900">目前登入</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => openForm(account)} aria-label={`編輯 ${account.username}`} className={secondary}>
                          <Pencil size={15} aria-hidden="true" />編輯
                        </button>
                        <button type="button" disabled={busy || (account.enabled && (current || enabledCount <= 1))}
                          onClick={() => void toggle(account)} aria-label={`${account.enabled ? '停用' : '啟用'} ${account.username}`}
                          className={`${button} border ${account.enabled ? 'border-rose-200 bg-white text-rose-800 hover:bg-rose-50' : 'border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100'}`}>
                          {account.enabled ? '停用' : '啟用'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="px-4 py-6 text-center text-sm text-slate-600">目前沒有管理員帳號。</p>}
            <p className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-700 sm:px-5">
              至少保留一個啟用帳號。若要停用目前登入的帳號，請由另一位管理員操作。
            </p>
          </>
        )}
      </div>

      {editing && (
        <dialog ref={editor} aria-labelledby="admin-account-editor-title"
          onCancel={(event) => { event.preventDefault(); if (!busy) closeForm(); }}
          className="no-print fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/65">
          <form onSubmit={save} className="flex max-h-[calc(100dvh-2rem-2px)] flex-col">
            <header className="view-header-banner shrink-0 px-4 py-3.5 sm:px-5">
              <h3 id="admin-account-editor-title" className="flex items-center gap-2 text-lg font-black">
                <KeyRound size={19} className="shrink-0 text-violet-800" aria-hidden="true" />
                {editing === 'new' ? '建立新管理員' : '編輯帳號與重設密碼'}
              </h3>
            </header>
            <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
              <label className="block text-sm font-bold text-slate-800">登入帳號
                <input className={input} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={128} disabled={busy} />
              </label>
              <label className="block text-sm font-bold text-slate-800">新密碼
                <input className={input} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                  required={editing === 'new'} minLength={MIN_ADMIN_PASSWORD_LENGTH} maxLength={256} disabled={busy}
                  aria-describedby="admin-account-password-hint" />
              </label>
              <p id="admin-account-password-hint" className="text-sm text-slate-600">
                {editing === 'new' ? `密碼至少需要 ${MIN_ADMIN_PASSWORD_LENGTH} 個字元。` : '如需保留目前密碼，請將密碼欄位留空。'}
              </p>
              {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-900">{error}</p>}
              {busy && <p role="status" className="text-sm font-bold text-slate-700">{activity}</p>}
            </div>
            <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
              <button type="button" disabled={busy} onClick={closeForm} className={secondary}>取消</button>
              <button type="submit" disabled={busy} className={primary}>核對並儲存</button>
            </footer>
          </form>
        </dialog>
      )}
    </section>
  );
}
