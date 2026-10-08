// @vitest-environment node
import { deflateSync } from 'node:zlib';
import {
  institutionResultsSchema,
  reportIdentitySchema,
  reportIdentitySettingsSchema,
  scenarioResultSchema,
  type ReportIdentity,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fetchFile, request } from '@/lib/api';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';

/** A small valid RGB PNG, as an administrator would upload a logo. */
function png(width: number, height: number) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x53)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const fields = (identity: ReportIdentity) => ({
  organizationName: identity.organizationName,
  reportTitle: identity.reportTitle,
  accentColor: identity.accentColor,
  foreword: identity.foreword,
  contact: identity.contact,
  footer: identity.footer,
  signatory: identity.signatory,
  authorization: identity.authorization,
});
const save = (body: object) =>
  request('/api/settings/report-identity', reportIdentitySettingsSchema, {
    method: 'PUT',
    json: body,
  });

describe('report identity (HP2-65)', () => {
  it('ships fictional defaults and refuses low contrast and unauthorized official names', async () => {
    await signInAs('administrator');
    const { identity } = await request(
      '/api/settings/report-identity',
      reportIdentitySettingsSchema,
    );
    expect(identity.organizationName).toMatch(/fictional/);
    await expect(
      save({ ...fields(identity), accentColor: '#FFDD00' }),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: { accentColor: expect.stringMatching(/contrast/) },
    });
    await expect(
      save({ ...fields(identity), organizationName: 'EACC' }),
    ).rejects.toMatchObject({
      fieldErrors: { organizationName: expect.stringMatching(/authorization/) },
    });
    // With a recorded authorization, the official name is accepted.
    const authorized = await save({
      ...fields(identity),
      organizationName: 'EACC',
      authorization: 'Letter ref. DEMO/123 (fictional)',
    });
    expect(authorized.changes[0]?.summary).toBe(
      'Changed organization name, authorization',
    );
    expect(
      getDb().audit.filter(
        (event) => event.action === 'report_identity.update',
      ),
    ).toHaveLength(1);
    await signInAs('focal-demo-001');
    await expect(
      request('/api/settings/report-identity', z.unknown()),
    ).rejects.toMatchObject({ status: 403 });
  });

  it(
    'keeps the identity in force at publication, with its logo',
    { timeout: 60_000 },
    async () => {
      await signInAs('administrator');
      const body = new FormData();
      body.append(
        'file',
        new Blob([png(120, 40)], { type: 'image/png' }),
        'logo.png',
      );
      const uploaded = await request(
        '/api/settings/report-identity/images/logo',
        reportIdentitySettingsSchema,
        { method: 'POST', body },
      );
      const logo = uploaded.identity.logo!;
      expect(logo).toMatchObject({
        width: 120,
        height: 40,
        mimeType: 'image/png',
      });

      await request('/api/simulation/scenario', scenarioResultSchema, {
        method: 'POST',
        timeoutMs: 60_000,
      });
      await request('/api/annual/publish', z.unknown(), {
        method: 'POST',
        json: { institutionIds: ['DEMO-004'] },
      });
      await save({
        ...fields(uploaded.identity),
        reportTitle: 'A later title',
      });
      await signInAs('focal-demo-004');
      const results = await request('/api/results', institutionResultsSchema);
      expect(results.results[0]?.identity).toMatchObject({
        reportTitle: 'Annual Corruption Prevention Assessment',
        logo: { id: logo.id },
      });
      expect(
        (await request('/api/report-identity', reportIdentitySchema))
          .reportTitle,
      ).toBe('A later title');

      // The document keeps the published identity and is scoped to the institution (HP2-64).
      const file = await fetchFile(
        `/api/publications/${results.results[0]!.id}/report.pdf`,
      );
      expect(file.fileName).toBe('CPI-FY2026-27-DEMO-004-v1.pdf');
      expect(file.mimeType).toBe('application/pdf');
      const pdf = new TextDecoder('latin1').decode(
        new Uint8Array(await file.blob.arrayBuffer()),
      );
      expect(pdf.startsWith('%PDF-1.7')).toBe(true);
      expect(pdf).toContain('/Subtype /Image'); // the logo
      expect(pdf).toContain('(Annual Corruption Prevention Assessment');
      await signInAs('focal-demo-001');
      await expect(
        fetchFile(`/api/publications/${results.results[0]!.id}/report.pdf`),
      ).rejects.toMatchObject({ status: 404 });
    },
  );
});
