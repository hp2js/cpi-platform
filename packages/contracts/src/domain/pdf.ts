/* A tiny PDF writer for labelled demonstration documents, shared by the API and the mock. */

/** Escapes text for a PDF string literal; non-Latin-1 characters become `?`. */
const pdfText = (text: string) =>
  text
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    .replace(/[\\()]/g, (character) => `\\${character}`);

/**
 * A small, valid one-page PDF with the given lines, so seeded demonstration files open in any
 * viewer like real ones. Long lines wrap at about 90 characters.
 */
export function demonstrationPdf(title: string, lines: string[]) {
  const wrapped = lines.flatMap((line) => {
    const out: string[] = [];
    let rest = line;
    while (rest.length > 90) {
      const cut = rest.lastIndexOf(' ', 90);
      const at = cut > 40 ? cut : 90;
      out.push(rest.slice(0, at));
      rest = rest.slice(at).trimStart();
    }
    out.push(rest);
    return out;
  });
  const content = [
    'BT',
    '/F1 16 Tf',
    '56 780 Td',
    `(${pdfText(title)}) Tj`,
    '/F1 11 Tf',
    '0 -28 Td',
    '15 TL',
    ...wrapped.slice(0, 44).map((line) => `(${pdfText(line)}) '`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Latin-1: one byte per character, so the offsets above are byte offsets.
  return Uint8Array.from(body, (character) => character.charCodeAt(0));
}
