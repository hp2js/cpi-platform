// @vitest-environment node
import {
  assignmentHistorySchema,
  assignmentsSchema,
  institutionsSchema,
  oversightSchema,
  profilesStateSchema,
  reassignmentSuggestionSchema,
  reassignmentSuggestionsSchema,
  simulationStateSchema,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';

const advance = (boundaryId: string) =>
  request('/api/simulation/advance', simulationStateSchema, {
    method: 'POST',
    json: { boundaryId },
  });

const latestNotification = (recipientId: string, eventType: string) =>
  getDb()
    .notifications.filter(
      (notification) =>
        notification.recipientId === recipientId &&
        notification.eventType === eventType,
    )
    .at(-1);

describe('what officers can read (PRD §5.2)', () => {
  it('reads the rules in use and compares only its own portfolio', async () => {
    await signInAs('officer-a');
    const profiles = await request(
      '/api/settings/profiles',
      profilesStateSchema,
    );
    expect(profiles.cycleProfileId).toBe('hackathon-mock-v1');
    const oversight = await request('/api/oversight', oversightSchema);
    expect(oversight.workload.map((row) => row.officerId)).toEqual([
      'officer-a',
    ]);
    expect(oversight.trends).toHaveLength(4);
    // Changing rules stays with the administrator.
    await expect(
      request('/api/settings/profiles', z.unknown(), {
        method: 'POST',
        json: { basedOn: 'hackathon-mock-v1' },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('sees who reviewed its institutions before, and nothing else', async () => {
    await signInAs('administrator');
    await request('/api/assignments', z.unknown(), {
      method: 'POST',
      json: {
        institutionId: 'DEMO-005',
        officerId: 'officer-a',
        reason: 'Balancing portfolios for Q2.',
        handoverNote: 'Q1 review is half done; M-02 evidence looked thin.',
      },
    });
    await signInAs('officer-a');
    const history = await request(
      '/api/assignments/history',
      assignmentHistorySchema,
    );
    const demo5 = history.filter((row) => row.institutionId === 'DEMO-005');
    expect(demo5.map((row) => row.officerId)).toEqual([
      'officer-b',
      'officer-a',
    ]);
    expect(demo5[1]!.handoverNote).toBe(
      'Q1 review is half done; M-02 evidence looked thin.',
    );
    expect(history.some((row) => row.institutionId === 'DEMO-006')).toBe(false);
    expect(latestNotification('officer-a', 'assignment.changed')?.body).toMatch(
      /Handover note: Q1 review is half done/,
    );
    // The previous officer is told the institution has moved.
    expect(latestNotification('officer-b', 'assignment.changed')?.title).toBe(
      'DEMO-005 moved to Prevention Officer A',
    );
  });
});

describe('officer digest', () => {
  it('flags baselines to approve before the quarter opens and seeds to confirm', async () => {
    await signInAs('administrator');
    await advance('Q1-reminder-7');
    const digest = latestNotification('officer-a', 'review.digest');
    expect(digest?.body).toMatch(
      /4 baselines need your approval before the quarter opens; 4 seeded baselines need confirming/,
    );
    expect(digest?.link).toBe('/officer');
  });
});

describe('temporary cover', () => {
  it('moves access for the cover period and returns it automatically', async () => {
    await signInAs('administrator');
    await expect(
      request('/api/assignments', z.unknown(), {
        method: 'POST',
        json: {
          institutionId: 'DEMO-001',
          officerId: 'officer-b',
          reason: 'Officer A on annual leave.',
          coverUntil: '2026-10-01',
        },
      }),
    ).rejects.toMatchObject({ status: 422 });
    await request('/api/assignments', z.unknown(), {
      method: 'POST',
      json: {
        institutionId: 'DEMO-001',
        officerId: 'officer-b',
        reason: 'Officer A on annual leave.',
        coverUntil: '2026-10-10',
      },
    });
    await signInAs('officer-b');
    const covering = await request('/api/assignments', assignmentsSchema);
    expect(
      covering.find((row) => row.institutionId === 'DEMO-001')?.cover,
    ).toMatchObject({
      until: '2026-10-10T23:59:59+03:00',
      returnToOfficerId: 'officer-a',
    });
    await signInAs('officer-a');
    expect(
      (await request('/api/institutions', institutionsSchema)).map(
        (item) => item.id,
      ),
    ).not.toContain('DEMO-001');

    // 14 Oct: the cover has ended and DEMO-001 is back with Officer A.
    await signInAs('administrator');
    await advance('Q1-reminder-1');
    await signInAs('officer-a');
    const back = await request('/api/assignments', assignmentsSchema);
    expect(
      back.find(
        (row) => row.institutionId === 'DEMO-001' && row.validTo === null,
      ),
    ).toMatchObject({
      validFrom: '2026-10-10T23:59:59+03:00',
      cover: null,
    });
    expect(
      getDb().audit.some(
        (event) =>
          event.action === 'assignment.change' &&
          event.summary.includes('Cover by Prevention Officer B ended'),
      ),
    ).toBe(true);
  });
});

describe('conflict of interest', () => {
  it('lets an officer declare one about its own institution; the administrator decides', async () => {
    await signInAs('officer-a');
    const declare = (json: object) =>
      request('/api/assignment-suggestions', reassignmentSuggestionSchema, {
        method: 'POST',
        json,
      });
    await expect(
      declare({
        kind: 'conflict_of_interest',
        institutionId: 'DEMO-005',
        suggestedOfficerId: null,
        reason: 'Not my institution at all.',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      declare({
        kind: 'suggestion',
        institutionId: 'DEMO-002',
        suggestedOfficerId: 'officer-b',
        reason: 'Officers cannot suggest reassignments.',
      }),
    ).rejects.toMatchObject({ status: 403 });
    const request_ = await declare({
      kind: 'conflict_of_interest',
      institutionId: 'DEMO-002',
      suggestedOfficerId: null,
      reason: 'My brother is the Accounting Officer there.',
    });
    expect(request_).toMatchObject({
      kind: 'conflict_of_interest',
      requestedByRole: 'officer',
      status: 'open',
    });
    expect(
      latestNotification('supervisor', 'assignment.suggested')?.title,
    ).toBe('Conflict of interest declared: DEMO-002');

    // The supervisor of the institution sees the declaration too.
    await signInAs('supervisor');
    expect(
      (
        await request(
          '/api/assignment-suggestions',
          reassignmentSuggestionsSchema,
        )
      ).map((item) => item.id),
    ).toContain(request_.id);

    await signInAs('administrator');
    await request('/api/assignments', z.unknown(), {
      method: 'POST',
      json: {
        institutionId: 'DEMO-002',
        officerId: 'officer-b',
        reason: 'Conflict of interest declared by Officer A.',
        suggestionId: request_.id,
      },
    });
    expect(
      latestNotification('officer-a', 'assignment.suggestion_resolved'),
    ).toMatchObject({ link: '/officer/institutions/DEMO-002' });
  });
});
