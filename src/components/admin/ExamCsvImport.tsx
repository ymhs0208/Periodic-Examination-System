import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { examSync } from '../../services/examSync';
import { examImports, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, type ExamImportKind, type ExamImportPreview } from '../../types/examImports';

const secondary = 'inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50';

export function ExamCsvImport({ kind, disabled = false }: { kind: ExamImportKind; disabled?: boolean }) {
  const info = examImports[kind];
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<{ name: string; text: string }>();
  const [preview, setPreview] = useState<ExamImportPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const changed = preview?.rows.filter(({ action }) => action !== '略過').length ?? 0;

  function download() {
    const blob = new Blob(['\uFEFF', info.headers.join(','), '\r\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${info.title}匯入範本.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function run(selectedFile: { name: string; text: string }, version?: string) {
    setError('');
    setBusy(true);
    try {
      const result = await examSync.importExamCsv(kind, selectedFile.text, version);
      if (version) {
        const updated = result.rows.filter(({ action }) => action !== '略過').length;
        setNotice(`已匯入 ${updated} 筆，略過 ${result.rows.length - updated} 筆。`);
        dialog.current?.close();
      } else {
        setPreview(result);
      }
    } catch (err) {
      setPreview(undefined);
      setError(err instanceof Error ? err.message : '無法處理 CSV，請稍後再試。');
    } finally {
      setBusy(false);
    }
  }

  async function selectFile(selected: File) {
    setFile(undefined);
    setPreview(undefined);
    setError('');
    if (selected.size > MAX_IMPORT_BYTES) {
      setError('CSV 檔案須小於 256 KB。');
      return;
    }
    setBusy(true);
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer());
    } catch {
      setError('無法讀取檔案。請將 CSV 另存為 UTF-8 編碼後再試。');
      setBusy(false);
      return;
    }
    const next = { name: selected.name, text };
    setFile(next);
    await run(next);
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} disabled={disabled} onClick={() => {
          setFile(undefined);
          setPreview(undefined);
          setError('');
          setNotice('');
          dialog.current?.showModal();
        }}><Upload size={16} aria-hidden="true" />匯入 CSV</button>
        <button type="button" className={secondary} onClick={download}><Download size={16} aria-hidden="true" />下載 CSV 範本</button>
      </div>
      {notice && <p role="status" className="mt-2 text-sm font-bold text-teal-800">{notice}</p>}
      <dialog ref={dialog} aria-labelledby={`csv-${kind}-title`}
        onCancel={(event) => { if (busy) event.preventDefault(); }}
        onClose={() => { setFile(undefined); setPreview(undefined); setError(''); }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/65">
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <header className="shrink-0 border-b border-slate-200 p-4 sm:px-6">
            <h3 id={`csv-${kind}-title`} className="text-lg font-black">{info.title} CSV 匯入</h3>
            <p className="mt-1 text-sm leading-6 text-slate-700">{info.help}</p>
          </header>
          <div className="min-h-0 space-y-3 overflow-y-auto p-4 sm:px-6">
            <label className="block text-sm font-bold">選擇 UTF-8 CSV 檔案
              <input type="file" accept=".csv,text/csv" disabled={busy} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  event.target.value = '';
                  if (selected) void selectFile(selected);
                }} />
            </label>
            <p className="text-xs text-slate-600">每次最多 {MAX_IMPORT_ROWS} 筆。請使用範本的欄位名稱與順序。</p>
            {file && <p className="text-sm font-bold text-slate-800 [overflow-wrap:anywhere]">{file.name}</p>}
            {busy && <p role="status" className="text-sm text-slate-700">正在處理 CSV…</p>}
            {error && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-sm font-bold text-rose-900">{error}</p>}
            {error && file && !busy && <button type="button" className={secondary} onClick={() => void run(file)}>重新預覽</button>}
            {preview && <>
              <p role="status" className="text-sm font-bold text-teal-900">
                預覽 {preview.rows.length} 筆 · 將匯入 {changed} 筆 · 略過 {preview.rows.length - changed} 筆
              </p>
              <ul aria-label="CSV 匯入預覽" className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                {preview.rows.map(({ line, action, summary }) => (
                  <li key={line} className="flex items-start gap-2 p-2.5 text-sm">
                    <span className="shrink-0 text-xs font-bold text-teal-900">第 {line} 列 · {action}</span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">{summary}</span>
                  </li>
                ))}
              </ul>
            </>}
          </div>
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 p-4 sm:px-6">
            <button type="button" className={secondary} disabled={busy} onClick={() => dialog.current?.close()}>關閉</button>
            <button type="button" disabled={busy || !file || !preview || !changed}
              className="min-h-11 rounded-xl bg-teal-800 px-4 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50"
              onClick={() => { if (file && preview) void run(file, preview.version); }}>確認匯入</button>
          </footer>
        </div>
      </dialog>
    </div>
  );
}
