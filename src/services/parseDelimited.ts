export function parseDelimited(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const counts = new Map([[',', 0], ['\t', 0], ['，', 0]]);
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (inQuote && text[i + 1] === '"') i++; else inQuote = !inQuote; }
    else if (!inQuote && (c === '\n' || c === '\r')) break;
    else if (!inQuote && counts.has(c)) counts.set(c, counts.get(c)! + 1);
  }
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false; let closed = false;
  const field = () => { row.push(value.trim()); value = ''; closed = false; };
  const finish = () => { field(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } } else value += c; }
    else if (c === '"' && !value.trim() && !closed) quoted = true;
    else if (c === delimiter) field();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; finish(); }
    else if (closed && c.trim()) throw new Error(`第 ${rows.length + 1} 列：引號結束後有多餘字元。`);
    else value += c;
  }
  if (quoted) throw new Error(`第 ${rows.length + 1} 列：引號未關閉。`);
  finish(); return rows;
}
