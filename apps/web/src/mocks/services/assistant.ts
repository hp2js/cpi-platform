import {
  ASSISTANT_CHARS_PER_PAGE,
  pdfPageText,
  sheetText,
  type AssistantDocument,
} from '@cpi/contracts';

/** The mock always runs the model-free provider: no model, no network (PRD §14). */
export const MOCK_PROVIDER = { name: 'deterministic', model: 'rules' };
export const MOCK_MAX_PAGES = 50;

export type MockExtraction =
  | { ok: true; document: AssistantDocument }
  | { ok: false; reason: 'too_long' | 'unsupported' | 'unreadable' };

/** The browser twin of the API's `extractText`, with the same limits and outcomes. */
export async function extractText(
  bytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
): Promise<MockExtraction> {
  try {
    if (mimeType === 'application/pdf') {
      // Vitest runs in Node (also under jsdom), where only pdf.js's legacy build loads.
      const node = typeof process !== 'undefined' && !!process.versions?.node;
      const pdfjs = node
        ? await import('pdfjs-dist/legacy/build/pdf.mjs')
        : await import('pdfjs-dist');
      if (!node && !pdfjs.GlobalWorkerOptions.workerSrc)
        pdfjs.GlobalWorkerOptions.workerSrc = (
          await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        ).default;
      const task = pdfjs.getDocument({
        data: bytes.slice(),
        disableFontFace: true,
        verbosity: 0,
      });
      try {
        const document = await task.promise;
        if (document.numPages > MOCK_MAX_PAGES)
          return { ok: false, reason: 'too_long' };
        const pages: string[] = [];
        for (let number = 1; number <= document.numPages; number += 1)
          pages.push(
            pdfPageText(
              (await (await document.getPage(number)).getTextContent()).items,
            ),
          );
        return { ok: true, document: { unit: 'page', pages } };
      } finally {
        await task.destroy();
      }
    }
    if (mimeType === 'image/png' || mimeType === 'image/jpeg')
      return { ok: true, document: { unit: 'page', pages: [''] } };
    if (mimeType.endsWith('wordprocessingml.document')) {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({
        arrayBuffer: bytes.buffer,
      });
      return value.length > MOCK_MAX_PAGES * ASSISTANT_CHARS_PER_PAGE
        ? { ok: false, reason: 'too_long' }
        : { ok: true, document: { unit: 'document', pages: [value] } };
    }
    if (mimeType.endsWith('spreadsheetml.sheet')) {
      const { default: readXlsxFile } = await import('read-excel-file/browser');
      const sheets = await readXlsxFile(new Blob([bytes]));
      if (sheets.length > MOCK_MAX_PAGES)
        return { ok: false, reason: 'too_long' };
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
