import {
  ASSISTANT_CHARS_PER_PAGE,
  pdfPageText,
  sheetText,
  type AssistantDocument,
} from '@cpi/contracts';

export type Extraction =
  | { ok: true; document: AssistantDocument }
  | { ok: false; reason: 'too_long' | 'unsupported' | 'unreadable' };

/**
 * The text of a stored evidence file, page by page, or why it cannot be read. Over the page limit
 * a file is declined, never partly read: a partial reading would wrongly flag information as
 * missing (Decision 7). Images have no text layer and come back as one unreadable page.
 */
export async function extractText(
  bytes: Buffer,
  mimeType: string,
  maxPages: number,
): Promise<Extraction> {
  try {
    if (mimeType === 'application/pdf') return await pdf(bytes, maxPages);
    if (mimeType === 'image/png' || mimeType === 'image/jpeg')
      return { ok: true, document: { unit: 'page', pages: [''] } };
    if (mimeType.endsWith('wordprocessingml.document')) {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ buffer: bytes });
      return value.length > maxPages * ASSISTANT_CHARS_PER_PAGE
        ? { ok: false, reason: 'too_long' }
        : { ok: true, document: { unit: 'document', pages: [value] } };
    }
    if (mimeType.endsWith('spreadsheetml.sheet')) {
      const { default: readXlsxFile } = await import('read-excel-file/node');
      const sheets = await readXlsxFile(bytes);
      if (sheets.length > maxPages) return { ok: false, reason: 'too_long' };
      return {
        ok: true,
        document: {
          unit: 'sheet',
          pages: sheets.map(({ data }) => sheetText(data)),
        },
      };
    }
    return { ok: false, reason: 'unsupported' };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

async function pdf(bytes: Buffer, maxPages: number): Promise<Extraction> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Text only: no scripts, no fonts loaded, nothing fetched.
  const task = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const document = await task.promise;
    if (document.numPages > maxPages) return { ok: false, reason: 'too_long' };
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      pages.push(pdfPageText((await page.getTextContent()).items));
    }
    return { ok: true, document: { unit: 'page', pages } };
  } finally {
    await task.destroy();
  }
}
