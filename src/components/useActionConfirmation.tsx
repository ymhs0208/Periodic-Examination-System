import { useEffect, useId, useRef, useState } from 'react';

interface Confirmation {
  title: string;
  description?: string;
  facts: { label: string; value: string | number }[];
  confirmLabel: string;
  danger?: boolean;
  requiredText?: string;
}

export function useActionConfirmation() {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [enteredText, setEnteredText] = useState('');
  const canConfirm = !confirmation?.requiredText || enteredText === confirmation.requiredText;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (confirmation && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
      cancelRef.current?.focus();
    }
  }, [confirmation]);

  useEffect(() => () => {
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const confirmAction = (request: Confirmation) => {
    if (resolveRef.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setEnteredText('');
      setConfirmation(request);
    });
  };

  const finish = (confirmed: boolean) => {
    if (confirmed && !canConfirm) return;
    const resolve = resolveRef.current;
    dialogRef.current?.close();
    resolveRef.current = null;
    setConfirmation(null);
    resolve?.(confirmed);
  };

  const confirmationDialog = confirmation && (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={confirmation.description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        finish(false);
      }}
      className="no-print fixed inset-0 m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/65"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="border-b border-slate-200 px-4 py-4 sm:px-6">
          <h2 id={titleId} className="text-lg font-black sm:text-xl">{confirmation.title}</h2>
          {confirmation.description && (
            <p id={descriptionId} className="mt-1 text-sm text-slate-700">{confirmation.description}</p>
          )}
        </header>
        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
          <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50">
            {confirmation.facts.map(({ label, value }) => (
              <div key={label} className="px-3 py-2 sm:px-4">
                <dt className="text-xs font-bold text-slate-600">{label}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm font-semibold [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
          </dl>
          {confirmation.requiredText && (
            <label className="mt-4 block text-sm font-bold text-slate-900">
              輸入「{confirmation.requiredText}」以確認
              <input type="text" autoComplete="off" value={enteredText} onChange={(event) => setEnteredText(event.target.value)}
                className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base" />
            </label>
          )}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-6">
          <button ref={cancelRef} type="button" onClick={() => finish(false)}
            className="min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 text-sm font-bold hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 admin-theme:focus-visible:outline-violet-700">
            取消
          </button>
          <button type="button" onClick={() => finish(true)} disabled={!canConfirm}
            className={`min-h-11 cursor-pointer rounded-xl px-4 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 admin-theme:focus-visible:outline-violet-700 disabled:cursor-default disabled:opacity-50 ${confirmation.danger ? 'bg-rose-800 hover:bg-rose-900' : 'bg-teal-800 hover:bg-teal-900 admin-theme:bg-violet-800 admin-theme:hover:bg-violet-900'}`}>
            {confirmation.confirmLabel}
          </button>
        </footer>
      </div>
    </dialog>
  );

  return { confirmAction, confirmationDialog };
}
