// @vitest-environment node
import { evidenceItemSchema } from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { dispositionFileName, fetchFile, request } from '@/lib/api';
import {
  completeDraft,
  obligationPath,
  publishSeedForm,
} from '@/test/api-helpers';
import { pdfBytes, uploadForm } from '@/test/fixtures';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';
import { demonstrationPdf, loadFile, storeFile } from './services/files';

const open = (id: string) => fetchFile(`/api/evidence/${id}/file`);
const latin1 = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe('who can open a file (PRD §5.2)', () => {
  it('opens foundation documents for the institution and everyone reviewing it, and no one else', async () => {
    const procedures = 'ev-DEMO-001-procedures';
    for (const account of [
      'focal-demo-001',
      'officer-a',
      'supervisor',
      'administrator',
    ]) {
      await signInAs(account);
      const file = await open(procedures);
      expect(file, account).toMatchObject({
        mimeType: 'application/pdf',
        demonstration: true,
        fileName: 'prevention-procedures-2026-demonstration.pdf',
      });
      expect(latin1(new Uint8Array(await file.blob.arrayBuffer()))).toMatch(
        /^%PDF-1\.4[\s\S]*DEMONSTRATION COPY[\s\S]*%%EOF\n$/,
      );
    }
    expect(getDb().audit.at(-1)).toMatchObject({
      action: 'evidence.access',
      summary: 'prevention-procedures-2026.pdf opened by an administrator',
    });
    for (const account of ['officer-b', 'focal-demo-002']) {
      await signInAs(account);
      await expect(open(procedures), account).rejects.toMatchObject({
        status: 404,
      });
    }
  });

  it('opens a draft’s files for an administrator only after an audited support view', async () => {
    await publishSeedForm();
    await signInAs('focal-demo-003');
    const { upload } = await completeDraft('DEMO-003');
    await signInAs('administrator');
    await expect(open(upload.id)).rejects.toMatchObject({ status: 404 });
    await request(
      `/api/support/obligations/${encodeURIComponent('DEMO-003:FY2026-27-Q1')}`,
      z.unknown(),
      {
        method: 'POST',
        json: { reason: 'The focal person reports the draft will not save.' },
      },
    );
    const file = await open(upload.id);
    expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(pdfBytes());
    expect(getDb().audit.at(-1)?.summary).toBe(
      'cpc-minutes.pdf opened by an administrator during a support view',
    );
    // The support view is for administrators; officers still wait for submission.
    await signInAs('officer-a');
    await expect(open(upload.id)).rejects.toMatchObject({ status: 404 });
  });

  it('keeps the uploaded name, including characters outside ASCII', async () => {
    await publishSeedForm();
    await signInAs('focal-demo-001');
    const upload = await request(
      `${obligationPath('DEMO-001')}/evidence`,
      evidenceItemSchema,
      {
        method: 'POST',
        body: uploadForm('Minutes – Q1 “final”.pdf', pdfBytes(), 'cpc_minutes'),
      },
    );
    const file = await open(upload.id);
    expect(file).toMatchObject({
      fileName: 'Minutes – Q1 “final”.pdf',
      demonstration: false,
    });
  });
});

describe('the mock file store', () => {
  it('keeps contents by hash, so a reused record ID cannot serve another file', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await storeFile('hash-a', bytes);
    expect(await loadFile('hash-a')).toEqual(bytes);
    expect(await loadFile('hash-b')).toBeUndefined();
  });

  it('writes a well-formed demonstration PDF', () => {
    const text = latin1(
      demonstrationPdf('Plan (v2)', ['A long line '.repeat(20), 'Naïve ✓']),
    );
    const start = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    for (const [index, offset] of [
      ...text.matchAll(/^(\d{10}) 00000 n $/gm),
    ].entries())
      expect(text.slice(Number(offset[1]))).toMatch(
        new RegExp(`^${index + 1} 0 obj`),
      );
    expect(text).toContain('(Plan \\(v2\\)) Tj');
    expect(text).toContain("(Na\xefve ?) '");
  });

  it('reads the file name from either form of Content-Disposition', () => {
    expect(
      dispositionFileName(
        `inline; filename="a_b.pdf"; filename*=UTF-8''a%E2%80%93b.pdf`,
      ),
    ).toBe('a–b.pdf');
    expect(dispositionFileName('attachment; filename="plain.pdf"')).toBe(
      'plain.pdf',
    );
    expect(dispositionFileName(null)).toBeNull();
  });
});
