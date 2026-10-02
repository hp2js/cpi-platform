import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { checkUpload } from './uploads.js';

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../../../../e2e/fixtures/${name}`, import.meta.url)),
  );
const text = (value: string) => new TextEncoder().encode(value);
const reason = (name: string, bytes: Uint8Array) => {
  const check = checkUpload(name, bytes);
  return check.ok ? 'ok' : check.message.split(',')[0];
};

/** A ZIP with only the parts the check reads: a local header signature and the central directory. */
function zip(names: string[], { encrypted = false } = {}) {
  const parts: number[] = [0x50, 0x4b, 0x03, 0x04, 0, 0];
  const directoryStart = parts.length;
  for (const name of names) {
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(8, encrypted ? 1 : 0, true);
    view.setUint16(28, name.length, true);
    parts.push(...header, ...text(name));
  }
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(10, names.length, true);
  view.setUint32(16, directoryStart, true);
  return new Uint8Array([...parts, ...end]);
}
const docx = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];

it('accepts real Office, PNG and PDF files', () => {
  expect(reason('minutes.docx', fixture('cpc-minutes.docx'))).toBe('ok');
  expect(reason('register.xlsx', fixture('allocation-register.xlsx'))).toBe(
    'ok',
  );
  expect(reason('board.png', fixture('notice-board.png'))).toBe('ok');
  expect(reason('minutes.docx', zip(docx))).toBe('ok');
  expect(reason('minutes.pdf', text('%PDF-1.7\n1 0 obj\n<<>>\n%%EOF\n'))).toBe(
    'ok',
  );
});

it('refuses renamed, damaged and incomplete files (AT21)', () => {
  expect(reason('minutes.pdf', new Uint8Array([0x4d, 0x5a, 0x90, 0]))).toBe(
    "The file's contents do not match a .pdf file",
  );
  const damaged = 'This file appears to be damaged or incomplete';
  // Any ZIP renamed .docx, or a workbook renamed .docx.
  expect(reason('minutes.docx', zip(['notes.txt']))).toBe(damaged);
  expect(reason('minutes.docx', fixture('allocation-register.xlsx'))).toBe(
    damaged,
  );
  const office = fixture('cpc-minutes.docx');
  expect(reason('minutes.docx', office.subarray(0, office.length - 30))).toBe(
    damaged,
  );
  const png = fixture('notice-board.png');
  expect(reason('board.png', png.subarray(0, png.length - 12))).toBe(damaged);
  expect(reason('minutes.pdf', text('%PDF-1.7\n1 0 obj\n<<>>\n'))).toBe(
    damaged,
  );
  expect(reason('photo.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
    damaged,
  );
});

it('refuses files that cannot be inspected or carry active content', () => {
  const locked = 'This file is password-protected';
  const active = 'This file contains macros';
  expect(reason('minutes.docx', zip(docx, { encrypted: true }))).toBe(locked);
  expect(
    reason('minutes.pdf', text('%PDF-1.7\ntrailer <</Encrypt 5 0 R>>\n%%EOF')),
  ).toBe(locked);
  expect(reason('minutes.docx', zip([...docx, 'word/vbaProject.bin']))).toBe(
    active,
  );
  expect(
    reason('minutes.docx', zip([...docx, 'word/embeddings/oleObject1.bin'])),
  ).toBe(active);
  // Escaped names are decoded before matching.
  expect(
    reason('minutes.pdf', text('%PDF-1.7\n<</S /J#61vaScript>>\n%%EOF')),
  ).toBe(active);
  expect(
    reason(
      'minutes.pdf',
      text('%PDF-1.7\n<</OpenAction <</S /Launch>>>>\n%%EOF'),
    ),
  ).toBe(active);
  // Embedded charts and printer settings are ordinary Office content.
  expect(
    reason(
      'minutes.docx',
      zip([
        ...docx,
        'word/embeddings/chart1.xlsx',
        'word/printerSettings1.bin',
      ]),
    ),
  ).toBe('ok');
  // Binary stream data that happens to contain a name is not a dictionary entry.
  expect(
    reason(
      'minutes.pdf',
      text('%PDF-1.7\n<</Length 9>>stream\nx/JS(\x01)\nendstream\n%%EOF'),
    ),
  ).toBe('ok');
});
