// @vitest-environment node
import {
  adminAttentionSchema,
  assignmentsSchema,
  auditPageSchema,
  bulkChangeResultSchema,
  reportBundleSchema,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
import { completeDraft, publishSeedForm } from '@/test/api-helpers';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';

const attention = () => request('/api/admin/attention', adminAttentionSchema);
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('what needs the administrator', () => {
  it('lists open work with links, and clears as it is handled', async () => {
    await signInAs('administrator');
    // Nothing is published yet in the seeded run.
    expect(await attention()).toContainEqual(
      expect.objectContaining({ id: 'no-form', link: '/admin/forms' }),
    );
    await publishSeedForm();
    await signInAs('supervisor');
    await request('/api/assignment-suggestions', z.unknown(), {
      method: 'POST',
      json: {
        institutionId: 'DEMO-004',
        suggestedOfficerId: 'officer-b',
        reason: 'Officer A has the oldest backlog this quarter.',
      },
    });
    await signInAs('administrator');
    const items = await attention();
    expect(ids(items)).not.toContain('no-form');
    expect(items.find((item) => item.id === 'requests')).toMatchObject({
      count: 1,
      link: '/admin/assignments',
    });
  });
});

describe('the audit log at scale', () => {
  it('filters on the server, pages, marks elevated actions and exports CSV', async () => {
    await publishSeedForm();
    await signInAs('administrator');
    // A few more events to page through.
    for (const institutionId of ['DEMO-001', 'DEMO-005'])
      await request('/api/assignments', z.unknown(), {
        method: 'POST',
        json: {
          institutionId,
          officerId: institutionId === 'DEMO-001' ? 'officer-b' : 'officer-a',
          reason: 'Swapping portfolios for the test.',
        },
      });
    const page = (query: string) =>
      request(`/api/audit${query}`, auditPageSchema);
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
    const searched = await page('?q=Swapping');
    expect(searched.total).toBe(2);
    const elevated = await page('?elevated=true');
    expect(elevated.total).toBe(0);

    const csv = await fetch(
      new URL('/api/audit.csv?action=form.publish', 'http://localhost'),
    ).then((response) => response.text());
    expect(csv.split('\n')[0]).toMatch(/^business_time,actual_time,actor/);
  });
});

describe('read-only support access (PRD §5.2)', () => {
  it('needs a reason, is audited, tells the institution, and changes nothing', async () => {
    await publishSeedForm();
    await signInAs('focal-demo-001');
    const { draft } = await completeDraft('DEMO-001');
    const obligationId = encodeURIComponent('DEMO-001:FY2026-27-Q1');
    const view = (reason: string) =>
      request(`/api/support/obligations/${obligationId}`, reportBundleSchema, {
        method: 'POST',
        json: { reason },
      });

    await signInAs('officer-a');
    await expect(
      view('Officer trying the support route directly.'),
    ).rejects.toMatchObject({ status: 403 });
    await signInAs('administrator');
    await expect(view('Too short.')).rejects.toMatchObject({ status: 422 });
    const bundle = await view(
      'Focal person reports the milestones section will not save.',
    );
    expect(bundle.draft?.version).toBe(draft.version);
    expect(getDb().audit.at(-1)).toMatchObject({
      action: 'support.draft_view',
    });
    expect(
      getDb().notifications.some(
        (notification) =>
          notification.recipientId === 'focal-demo-001' &&
          notification.eventType === 'support.access',
      ),
    ).toBe(true);
    // Nothing about the draft changed.
    expect(
      getDb().drafts.find(
        (item) => item.obligationId === 'DEMO-001:FY2026-27-Q1',
      )?.version,
    ).toBe(draft.version);
    const elevated = await request('/api/audit?elevated=true', auditPageSchema);
    expect(elevated.events[0]?.action).toBe('support.draft_view');
  });
});

describe('bulk moves and role changes', () => {
  it('moves an officer’s institutions at once, then changes their role', async () => {
    await signInAs('administrator');
    const changeRole = (userId: string, json: object) =>
      request(`/api/settings/users/${userId}/role`, z.unknown(), {
        method: 'PUT',
        json,
      });
    await expect(
      changeRole('officer-a', {
        role: 'supervisor',
        institutionId: null,
        reason: 'Promoted to supervise the eastern region.',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'officer_has_assignments' });

    const moved = await request(
      '/api/assignments/bulk',
      bulkChangeResultSchema,
      {
        method: 'POST',
        json: {
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
        },
      },
    );
    expect(moved).toEqual({
      changed: ['DEMO-001', 'DEMO-002', 'DEMO-003', 'DEMO-004'],
      unchanged: ['DEMO-005'],
    });
    const assignments = await request('/api/assignments', assignmentsSchema);
    expect(
      assignments.filter(
        (row) => row.validTo === null && row.officerId === 'officer-b',
      ),
    ).toHaveLength(8);
    expect(ids(await attention())).toContain('idle-officers');

    await changeRole('officer-a', {
      role: 'supervisor',
      institutionId: null,
      reason: 'Promoted to supervise the eastern region.',
    });
    expect(getDb().users.find((user) => user.id === 'officer-a')?.role).toBe(
      'supervisor',
    );
    expect(getDb().audit.at(-1)).toMatchObject({ action: 'user.role_change' });

    // Supervisors change in bulk too; ones already in place are left alone.
    const supervised = await request(
      '/api/supervision/bulk',
      bulkChangeResultSchema,
      {
        method: 'POST',
        json: {
          institutionIds: ['DEMO-001', 'DEMO-002'],
          supervisorId: 'officer-a',
          reason: 'Eastern region oversight.',
        },
      },
    );
    expect(supervised.changed).toEqual(['DEMO-001', 'DEMO-002']);
    await expect(
      changeRole('officer-a', {
        role: 'officer',
        institutionId: null,
        reason: 'Back to reviewing after the pilot.',
      }),
    ).rejects.toMatchObject({ code: 'supervisor_has_institutions' });
    await expect(
      changeRole('administrator', {
        role: 'officer',
        institutionId: null,
        reason: 'Trying to change my own role.',
      }),
    ).rejects.toMatchObject({ code: 'self_role_change' });
  });
});
