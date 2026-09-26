/**
 * RFC 4180 CSV with spreadsheet formula injection neutralised: cells starting with = + - @
 * or a control character are prefixed with an apostrophe (FR13).
 */
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]) {
  return (
    [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  );
}
