import { deflateSync } from 'node:zlib';
import { eq } from 'drizzle-orm';
import type {
  InstitutionResults,
  ReportIdentity,
  ReportIdentitySettings,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, systemState } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';

/** A small valid RGB PNG, as an administrator would upload a logo. */
function png(width: number, height: number) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
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

describe.skipIf(!integration)('report identity (HP2-65)', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  let admin: Client;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(async () => {
    await api.reset();
    admin = await api.client().signIn('administrator');
  });

  const update = (identity: ReportIdentity, patch: Partial<ReportIdentity>) => {
    const {
      logo: _logo,
      signature: _signature,
      ...fields
    } = {
      ...identity,
      ...patch,
    };
    return admin.put('/settings/report-identity', fields);
  };

  it('ships fictional defaults, refuses low contrast and unauthorized official names, and audits changes', async () => {
    const { identity } = await admin.json<ReportIdentitySettings>(
      '/settings/report-identity',
    );
    expect(identity).toMatchObject({
      organizationName: 'Adili Online',
      authorization: expect.stringMatching(/supplied by the Adili V3/),
      logo: { id: 'builtin-adili-logo' },
    });
    // The built-in logo is served like an uploaded one.
    const builtin = await admin.request(
      '/report-identity/images/builtin-adili-logo',
    );
    expect(builtin.status).toBe(200);
    expect(builtin.headers.get('content-type')).toBe('image/jpeg');
    expect(identity.footer).toMatch(/Not an official EACC publication/);

    expect(await update(identity, { accentColor: '#FFDD00' })).toMatchObject({
      status: 422,
      body: { fieldErrors: { accentColor: expect.stringMatching(/contrast/) } },
    });
    expect(
      await update(identity, {
        organizationName: 'Ethics and Anti-Corruption Commission',
        authorization: null,
      }),
    ).toMatchObject({
      status: 422,
      body: {
        fieldErrors: {
          organizationName: expect.stringMatching(/authorization/),
        },
      },
    });

    const saved = (
      await update(identity, {
        organizationName: 'Demo County Oversight Office (fictional)',
        signatory: { name: 'A. Example', title: 'Head of Oversight' },
      })
    ).body as ReportIdentitySettings;
    expect(saved.identity).toMatchObject({
      organizationName: 'Demo County Oversight Office (fictional)',
      signatory: { name: 'A. Example' },
    });
    expect(saved.changes[0]?.summary).toBe(
      'Changed organization name, signatory',
    );
    const audits = await api.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'report_identity.update'));
    expect(audits).toHaveLength(1);

    const focal = await api.client().signIn('focal-demo-001');
    expect((await focal.request('/settings/report-identity')).status).toBe(403);
    expect(
      (await focal.json<ReportIdentity>('/report-identity')).organizationName,
    ).toBe('Demo County Oversight Office (fictional)');
  });

  it('stores logos in object storage, checks them, and keeps the published identity', async () => {
    const tooBig = await admin.upload(
      '/settings/report-identity/images/logo',
      { name: 'logo.png', bytes: png(1600, 10) },
      {},
    );
    expect(tooBig).toMatchObject({
      status: 422,
      body: { code: 'invalid_image' },
    });

    const uploaded = (
      await admin.upload(
        '/settings/report-identity/images/logo',
        { name: 'logo.png', bytes: png(120, 40) },
        {},
      )
    ).body as ReportIdentitySettings;
    const logo = uploaded.identity.logo!;
    expect(logo).toMatchObject({
      mimeType: 'image/png',
      width: 120,
      height: 40,
    });
    const image = await admin.request(`/report-identity/images/${logo.id}`);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');

    // Publish the scripted year, then change the branding: the release keeps the old identity.
    await admin.post('/simulation/scenario');
    await api.db
      .update(systemState)
      .set({ businessTime: '2027-08-01T09:00:00+03:00' });
    await admin.post('/annual/publish', { institutionIds: ['DEMO-004'] });
    await update(uploaded.identity, { reportTitle: 'A later report title' });
    const focal = await api.client().signIn('focal-demo-004');
    const results = await focal.json<InstitutionResults>('/results');
    expect(results.results[0]?.identity).toMatchObject({
      reportTitle: 'Annual Corruption Prevention Assessment',
      logo: { id: logo.id },
    });
    expect(
      (await focal.request(`/report-identity/images/${logo.id}`)).status,
    ).toBe(200);
  }, 120_000);
});
