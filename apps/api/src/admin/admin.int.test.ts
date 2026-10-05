import { and, eq } from 'drizzle-orm';
import type {
  AdminAttention,
  Assignment,
  AuditPage,
  People,
  ReportBundle,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drafts, notifications, users } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import {
  completeDraft,
  obligationPath,
  publishSeedForm,
} from '../test/journeys';

/** Ported from apps/web/src/mocks/admin.test.ts (FR10, PRD §5.2, §9). */
describe.skipIf(!integration)('administrator console', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  let admin: Client;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(async () => {
    await api.reset();
    await api.flushRedis();
    admin = await api.client().signIn('administrator');
  });

  const attention = () => admin.json<AdminAttention>('/admin/attention');
  const ids = (items: { id: string }[]) => items.map((item) => item.id);

  it('lists open work with links, and clears as it is handled', async () => {
    expect(await attention()).toContainEqual(
      expect.objectContaining({ id: 'no-form', link: '/admin/forms' }),
    );
    await publishSeedForm(admin);
    const supervisor = await api.client().signIn('supervisor');
    await supervisor.post('/assignment-suggestions', {
      institutionId: 'DEMO-004',
      suggestedOfficerId: 'officer-b',
      reason: 'Officer A has the oldest backlog this quarter.',
    });
    const items = await attention();
    expect(ids(items)).not.toContain('no-form');
    expect(items.find((item) => item.id === 'requests')).toMatchObject({
      count: 1,
      link: '/admin/assignments',
    });
    expect((await supervisor.request('/admin/attention')).status).toBe(403);
  });

  it('filters the audit log on the server, pages, marks elevated actions and exports CSV', async () => {
    await publishSeedForm(admin);
    for (const institutionId of ['DEMO-001', 'DEMO-005'])
      await admin.post('/assignments', {
        institutionId,
        officerId: institutionId === 'DEMO-001' ? 'officer-b' : 'officer-a',
        reason: 'Swapping portfolios for the test.',
      });
    const page = (query: string) => admin.json<AuditPage>(`/audit${query}`);
    const all = await page('?pageSize=2');
    expect(all.events).toHaveLength(2);
    expect(all.total).toBeGreaterThan(2);
    expect(all.actions).toContain('form.publish');
    const second = await page('?pageSize=2&page=2');
    expect(second.events[0]?.id).not.toBe(all.events[0]?.id);
    const published = await page('?action=form.publish');
    expect(published.total).toBeGreaterThan(0);
    expect(
      published.events.every((event) => event.action === 'form.publish'),
    ).toBe(true);
    expect((await page('?q=Swapping')).total).toBe(2);
    expect((await page('?elevated=true')).total).toBe(0);
    const csv = await admin.request('/audit.csv?action=form.publish');
    expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(csv.headers.get('content-disposition')).toBe(
      'attachment; filename="cpi-audit-log.csv"',
    );
    expect(String(csv.body).split('\r\n')[0]).toMatch(
      /^business_time,actual_time,actor/,
    );
  });

  it('gives read-only support access that needs a reason, is audited and tells the institution', async () => {
    await publishSeedForm(admin);
    const focal = await api.client().signIn('focal-demo-001');
    const { draft } = await completeDraft(focal, 'DEMO-001');
    const view = (client: Client, reason: string) =>
      client.post(
        `/support/obligations/${encodeURIComponent('DEMO-001:FY2026-27-Q1')}`,
        { reason },
      );
    const officer = await api.client().signIn('officer-a');
    expect(
      (await view(officer, 'Officer trying the support route directly.'))
        .status,
    ).toBe(403);
    expect((await view(admin, 'Too short.')).status).toBe(422);
    const bundle = (
      await view(
        admin,
        'Focal person reports the milestones section will not save.',
      )
    ).body as ReportBundle;
    expect(bundle.draft?.version).toBe(draft.version);
    expect(
      await api.db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientId, 'focal-demo-001'),
            eq(notifications.eventType, 'support.access'),
          ),
        ),
    ).toHaveLength(1);
    // Nothing about the draft changed.
    const [stored] = await api.db
      .select()
      .from(drafts)
      .where(eq(drafts.obligationId, 'DEMO-001:FY2026-27-Q1'));
    expect(stored?.version).toBe(draft.version);
    expect(
      (await admin.json<AuditPage>('/audit?elevated=true')).events[0]?.action,
    ).toBe('support.draft_view');
    expect(
      (await focal.json<ReportBundle>(`${obligationPath('DEMO-001')}/report`))
        .draft?.version,
    ).toBe(draft.version);
  });

  it('edits a user, and changes a role once scope is handed over', async () => {
    const edited = (
      await admin.put('/settings/users/officer-b', {
        displayName: 'Prevention Officer B',
        jobTitle: 'Senior Prevention Officer',
      })
    ).body as People;
    expect(edited.users.find((user) => user.id === 'officer-b')?.jobTitle).toBe(
      'Senior Prevention Officer',
    );

    const changeRole = (userId: string, body: object) =>
      admin.put(`/settings/users/${userId}/role`, body);
    const promote = {
      role: 'supervisor',
      institutionId: null,
      reason: 'Promoted to supervise the eastern region.',
    };
    expect(await changeRole('officer-a', promote)).toMatchObject({
      status: 409,
      body: { code: 'officer_has_assignments' },
    });
    expect(await changeRole('administrator', promote)).toMatchObject({
      status: 409,
      body: { code: 'self_role_change' },
    });
    expect(
      await changeRole('focal-demo-001', {
        role: 'officer',
        institutionId: null,
        reason: 'Joining the prevention unit.',
      }),
    ).toMatchObject({ status: 409, body: { code: 'last_focal_person' } });

    const moved = await admin.post('/assignments/bulk', {
      institutionIds: [
        'DEMO-001',
        'DEMO-002',
        'DEMO-003',
        'DEMO-004',
        'DEMO-005',
      ],
      officerId: 'officer-b',
      reason: 'Officer A is moving to supervision.',
      handoverNote: 'DEMO-002 has an open clarification.',
    });
    expect(moved.body).toEqual({
      changed: ['DEMO-001', 'DEMO-002', 'DEMO-003', 'DEMO-004'],
      unchanged: ['DEMO-005'],
    });
    expect(
      (await admin.json<Assignment[]>('/assignments')).filter(
        (row) => row.validTo === null && row.officerId === 'officer-b',
      ),
    ).toHaveLength(8);
    expect(ids(await attention())).toContain('idle-officers');

    const officerA = await api.client().signIn('officer-a');
    expect((await changeRole('officer-a', promote)).status).toBe(200);
    const [promoted] = await api.db
      .select()
      .from(users)
      .where(eq(users.id, 'officer-a'));
    expect(promoted?.role).toBe('supervisor');
    // Their session ended, so the new permissions apply at the next sign-in.
    expect(await officerA.request('/session')).toMatchObject({
      status: 401,
      body: { code: 'session_expired' },
    });
    expect(
      (await admin.json<AuditPage>('/audit?action=user.role_change')).total,
    ).toBe(1);
  });
});
