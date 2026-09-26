import {
  assignmentsSchema,
  institutionsSchema,
  obligationsSchema,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiUrl, request } from '@/lib/api';
import { signInAs } from '@/test/render-app';

describe('mock API scope (PRD §5.2, AT01, AT02)', () => {
  it('limits an institution user to its own institution', async () => {
    await signInAs('focal-demo-001');
    const institutions = await request('/api/institutions', institutionsSchema);
    expect(institutions.map((institution) => institution.id)).toEqual([
      'DEMO-001',
    ]);
    await expect(
      request('/api/institutions/DEMO-002', z.unknown()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      request('/api/obligations?institutionId=DEMO-002', z.unknown()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      request('/api/assignments', z.unknown()),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('limits an officer to currently assigned institutions', async () => {
    await signInAs('officer-a');
    const institutions = await request('/api/institutions', institutionsSchema);
    expect(institutions.map((institution) => institution.id)).toEqual([
      'DEMO-001',
      'DEMO-002',
      'DEMO-003',
      'DEMO-004',
    ]);
    await expect(
      request('/api/institutions/DEMO-005', z.unknown()),
    ).rejects.toMatchObject({ status: 404 });
    const assignments = await request('/api/assignments', assignmentsSchema);
    expect(
      new Set(assignments.map((assignment) => assignment.officerId)),
    ).toEqual(new Set(['officer-a']));
  });

  it('gives the supervisor all 32 institution-quarter obligations', async () => {
    await signInAs('supervisor');
    const obligations = await request('/api/obligations', obligationsSchema);
    expect(obligations).toHaveLength(32);
  });

  it('reports an expired session distinctly from a missing one', async () => {
    await expect(request('/api/session', z.unknown())).rejects.toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
    await signInAs('supervisor');
    await fetch(apiUrl('/api/__mock/expire-session'), {
      method: 'POST',
    });
    await expect(
      request('/api/institutions', z.unknown()),
    ).rejects.toMatchObject({ status: 401, code: 'session_expired' });
  });
});

describe('derived obligation flags', () => {
  it('marks future quarters not yet due at the start of Q1 reporting', async () => {
    await signInAs('focal-demo-001');
    const obligations = await request('/api/obligations', obligationsSchema);
    expect(obligations.map((obligation) => obligation.flags)).toEqual([
      [],
      ['not_yet_due'],
      ['not_yet_due'],
      ['not_yet_due'],
    ]);
  });
});
