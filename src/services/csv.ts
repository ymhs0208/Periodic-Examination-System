export function escapeCSV(value: unknown): string {
  const text = value == null ? '' : String(value);
  const firstVisible = text.replace(/^[\s\p{Cf}\u0000-\u001f]+/u, '');
  const safeText = typeof value === 'number'
    ? text
    : /^[=+\-@＝＋－＠]/u.test(firstVisible)
      ? `\t${text}`
      : /^[\u0000-\u001f\p{Cf}]/u.test(text)
        ? `'${text}`
        : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}
