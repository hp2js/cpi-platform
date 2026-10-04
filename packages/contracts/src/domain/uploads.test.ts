import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { checkUpload } from './uploads.js';

const fixtures = new URL('../../../../e2e/fixtures/', import.meta.url);
const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(name, fixtures)));
const expected = JSON.parse(
  readFileSync(new URL('rejected/expected.json', fixtures), 'utf8'),
) as Record<string, keyof typeof messages>;
const messages = {
  damaged: 'This file appears to be damaged or incomplete',
  protected: 'This file is password-protected',
  active: 'This file contains macros',
  mismatch: "The file's contents do not match",
};
const text = (value: string) => new TextEncoder().encode(value);
/** 'ok', or which kind of refusal the message is. */
const reason = async (name: string, bytes: Uint8Array) => {
  const check = await checkUpload(name, bytes);
  if (check.ok) return 'ok';
  const kinds = Object.keys(messages) as (keyof typeof messages)[];
  return (
    kinds.find((kind) => check.message.startsWith(messages[kind])) ??
    check.message
  );
};

/** A ZIP with deflated entries: local headers, central directory and end record. */
function zip(entries: [string, string | Uint8Array][]) {
  const local: number[] = [];
  const directory: number[] = [];
  for (const [name, content] of entries) {
    const data = deflateRawSync(
      typeof content === 'string' ? text(content) : content,
    );
    const size =
      typeof content === 'string' ? text(content).length : content.length;
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(8, 8, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, size, true);
    header.setUint16(26, name.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(10, 8, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, size, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, local.length, true);
    local.push(...new Uint8Array(header.buffer), ...text(name), ...data);
    directory.push(...new Uint8Array(entry.buffer), ...text(name));
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(16, local.length, true);
  return new Uint8Array([
    ...local,
    ...directory,
    ...new Uint8Array(end.buffer),
  ]);
}
const types = `<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const docx = (...extra: [string, string | Uint8Array][]) =>
  zip([
    ['[Content_Types].xml', types],
    ['word/document.xml', '<w:document/>'],
    ...extra,
  ]);

it('accepts real PDF, Word, Excel, PNG and JPEG files', async () => {
  for (const name of [
    'minutes.pdf',
    'cpc-minutes.docx',
    'allocation-register.xlsx',
    'notice-board.png',
    'photo.jpg',
  ])
    expect([name, await reason(name, fixture(name))]).toEqual([name, 'ok']);
  // Embedded charts and printer settings are ordinary Office content.
  expect(
    await reason(
      'minutes.docx',
      docx(
        ['word/embeddings/chart1.xlsx', 'x'],
        ['word/printerSettings1.bin', 'x'],
      ),
    ),
  ).toBe('ok');
  // Binary stream data that happens to contain a name is not a dictionary entry.
  expect(
    await reason(
      'minutes.pdf',
      text('%PDF-1.7\n<</Length 9>>stream\nx/JS(\x01)\nendstream\n%%EOF'),
    ),
  ).toBe('ok');
});

it('refuses every rejected fixture for its reason (AT21)', async () => {
  for (const [name, why] of Object.entries(expected))
    expect([name, await reason(name, fixture(`rejected/${name}`))]).toEqual([
      name,
      why,
    ]);
});

it('decodes escaped PDF names and bounds what it inflates', async () => {
  expect(
    await reason('minutes.pdf', text('%PDF-1.7\n<</S /J#61vaScript>>\n%%EOF')),
  ).toBe('active');
  // A content-types part that inflates past 1 MiB is not expanded: the file is uninspectable.
  const small = docx();
  const inflated = zip([
    ['[Content_Types].xml', types + ' '.repeat(2 * 1024 * 1024)],
    ['word/document.xml', '<w:document/>'],
  ]);
  expect(await reason('minutes.docx', small)).toBe('ok');
  expect(await reason('minutes.docx', inflated)).toBe('damaged');
});
