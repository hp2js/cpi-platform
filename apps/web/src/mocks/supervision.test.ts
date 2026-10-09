// @vitest-environment node
import {
  assignmentHistorySchema,
  assignmentsSchema,
  consolidatedReportSchema,
  institutionsSchema,
  obligationsSchema,
  oversightSchema,
  peopleSchema,
  reassignmentSuggestionSchema,
  reassignmentSuggestionsSchema,
  reviewBundleSchema,
  simulationStateSchema,
  supervisionsSchema,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
import { acceptInvitation, submittedQ1 } from '@/test/api-helpers';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';

const ids = (list: { id: string }[]) => list.map((item) => item.id).sort();

/** Creates a second supervisor and gives them DEMO-005–008; returns their user ID. */
async function secondSupervisor() {
  await signInAs('administrator');
  const people = await request('/api/settings/users', peopleSchema, {
    method: 'POST',
    json: {
      displayName: 'Supervisor Two',
      email: 'supervisor.two@example.invalid',
      jobTitle: 'Deputy Head of Prevention',
      role: 'supervisor',
      institutionId: null,
    },
  });
  const id = people.users.find(
    (user) => user.email === 'supervisor.two@example.invalid',
  )!.id;
  for (const institutionId of ['DEMO-005', 'DEMO-006', 'DEMO-007', 'DEMO-008'])
    await request('/api/supervision', z.unknown(), {
      method: 'POST',
      json: {
        institutionId,
        supervisorId: id,
        reason: 'Splitting oversight between two supervisors.',
      },
    });
  return id;
}

describe('supervisors see only their assigned institutions', () => {
  it('scopes directory, assignments, oversight, reports and reviews', async () => {
    const two = await secondSupervisor();

    await signInAs('supervisor');
    expect(ids(await request('/api/institutions', institutionsSchema))).toEqual(
      ['DEMO-001', 'DEMO-002', 'DEMO-003', 'DEMO-004'],
    );
    const obligations = await request('/api/obligations', obligationsSchema);
    expect(new Set(obligations.map((item) => item.institutionId)).size).toBe(4);
    await expect(
      request('/api/institutions/DEMO-005', z.unknown()),
    ).rejects.toMatchObject({ status: 404 });
    const assignments = await request('/api/assignments', assignmentsSchema);
    expect(assignments.every((item) => item.officerId === 'officer-a')).toBe(
      true,
    );
    const history = await request(
      '/api/assignments/history',
      assignmentHistorySchema,
    );
    expect(history.every((row) => row.institutionId <= 'DEMO-004')).toBe(true);
    // Only the officer who reviews the supervisor's institutions.
    const oversight = await request('/api/oversight', oversightSchema);
    expect(oversight.workload.map((row) => row.officerId)).toEqual([
      'officer-a',
    ]);
    const report = await request(
      '/api/annual/report',
      consolidatedReportSchema,
    );
    expect(report.unreleased).toHaveLength(4);
    // The supervision history covers the supervisor's institutions only.
    const supervision = await request('/api/supervision', supervisionsSchema);
    expect(supervision.every((row) => row.supervisorId === 'supervisor')).toBe(
      true,
    );

    // A submission from the other supervisor's institution is out of reach.
    const item = await submittedQ1('DEMO-005', 'officer-b');
    await signInAs('supervisor');
    await expect(
      request(`/api/reviews/${item.submissionId}`, reviewBundleSchema),
    ).rejects.toMatchObject({ status: 404 });
    await acceptInvitation('supervisor.two@example.invalid');
    expect(getDb().session?.userId).toBe(two);
    const bundle = await request(
      `/api/reviews/${item.submissionId}`,
      reviewBundleSchema,
    );
    expect(bundle.item.institutionId).toBe('DEMO-005');
  });

  it('keeps oversight from lapsing when supervisors are deactivated (safeguard)', async () => {
    await signInAs('administrator');
    const deactivate = (userId: string) =>
      request(`/api/settings/users/${userId}/status`, z.unknown(), {
        method: 'POST',
        json: { active: false, reason: 'Leaving the prevention unit.' },
      });
    await expect(deactivate('supervisor')).rejects.toMatchObject({
      status: 409,
      code: 'supervisor_has_institutions',
    });
    // Even with no institutions, the last supervisor stays active.
    for (const institution of getDb().supervisions)
      institution.validTo = '2026-10-01T08:00:00+03:00';
    await expect(deactivate('supervisor')).rejects.toMatchObject({
      code: 'last_supervisor',
    });
  });

  it('gives new institutions the only supervisor by default on import', async () => {
    await signInAs('administrator');
    const csv = [
      'institution_id,name,type,officer_email,ao_name,ao_designation,ao_email,ao_phone,focal_name,focal_email',
      'MDA-301,Demo Water Board,State corporation,officer.a@example.invalid,AO MDA-301,Managing Director,,,,',
    ].join('\n');
    const people = await request(
      '/api/settings/institutions/import',
      z.unknown(),
      { method: 'POST', json: { csv, seedOpenedQuarters: false } },
    ).then(() => request('/api/settings/people', peopleSchema));
    expect(
      people.institutions.find((item) => item.id === 'MDA-301')?.supervisor,
    ).toMatchObject({ id: 'supervisor' });
  });
});

describe('oversight signals', () => {
  it('flags reviews past the target, internally only, and sends a digest', async () => {
    await submittedQ1();
    await signInAs('administrator');
    // Received 1 Oct; the 10-day target ends 11 Oct. The Q1 deadline passes on 15 Oct.
    await request('/api/simulation/advance', simulationStateSchema, {
      method: 'POST',
      json: { boundaryId: 'Q1-overdue' },
    });
    await signInAs('supervisor');
    const obligations = await request(
      '/api/obligations?institutionId=DEMO-001',
      obligationsSchema,
    );
    expect(obligations[0]!.flags).toContain('review_overdue');
    const oversight = await request('/api/oversight', oversightSchema);
    expect(oversight.trends[0]).toMatchObject({
      periodLabel: 'Q1',
      due: 8,
      submitted: 1,
      reviewOverdue: 1,
    });
    expect(oversight.reviewTarget).toEqual({ days: 10, unit: 'calendar' });
    const digest = getDb().notifications.filter(
      (notification) =>
        notification.recipientId === 'supervisor' &&
        notification.eventType === 'oversight.digest',
    );
    expect(digest.at(-1)?.body).toMatch(
      /7 reports missing after the deadline; 1 review past the officer review target/,
    );

    // The institution never sees officer review timing.
    await signInAs('focal-demo-001');
    const own = await request(
      '/api/obligations?institutionId=DEMO-001',
      obligationsSchema,
    );
    expect(own[0]!.flags).not.toContain('review_overdue');
  });

  it('closes the comment loop without gating finalization', async () => {
    const item = await submittedQ1();
    await signInAs('supervisor');
    const commented = await request(
      `/api/reviews/${item.submissionId}/comments`,
      reviewBundleSchema,
      { method: 'POST', json: { text: 'Check the CPC minutes are signed.' } },
    );
    const comment = commented.comments[0]!;
    expect(comment).toMatchObject({ status: 'open', replies: [] });

    const reply = (text: string, addressed: boolean) =>
      request(
        `/api/reviews/${item.submissionId}/comments/${comment.id}/replies`,
        reviewBundleSchema,
        { method: 'POST', json: { text, addressed } },
      );
    // Only the officer marks a comment addressed.
    await expect(reply('Thanks.', true)).rejects.toMatchObject({
      status: 422,
    });
    await signInAs('officer-a');
    const addressed = await reply('Checked: signed and dated.', true);
    expect(addressed.comments[0]).toMatchObject({
      status: 'addressed',
      replies: [{ role: 'officer', text: 'Checked: signed and dated.' }],
    });
    expect(
      getDb().notifications.some(
        (notification) =>
          notification.recipientId === 'supervisor' &&
          notification.eventType === 'review.comment_reply',
      ),
    ).toBe(true);
    // Another officer cannot reply.
    await signInAs('officer-b');
    await expect(reply('Not mine.', false)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('reassignment suggestions', () => {
  it('lets a supervisor suggest and only the administrator decide', async () => {
    await signInAs('supervisor');
    const suggest = (json: object) =>
      request('/api/assignment-suggestions', reassignmentSuggestionSchema, {
        method: 'POST',
        json,
      });
    const suggestion = await suggest({
      institutionId: 'DEMO-004',
      suggestedOfficerId: 'officer-b',
      reason: 'Officer A has the oldest backlog this quarter.',
    });
    expect(suggestion).toMatchObject({
      status: 'open',
      currentOfficerName: 'Prevention Officer A',
      suggestedOfficerName: 'Prevention Officer B',
    });
    await expect(
      suggest({
        institutionId: 'DEMO-004',
        suggestedOfficerId: null,
        reason: 'A second suggestion for the same institution.',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'suggestion_open' });
    // Supervisors cannot reassign.
    await expect(
      request('/api/assignments', z.unknown(), {
        method: 'POST',
        json: {
          institutionId: 'DEMO-004',
          officerId: 'officer-b',
          reason: 'Trying to reassign directly.',
        },
      }),
    ).rejects.toMatchObject({ status: 403 });

    await signInAs('administrator');
    expect(
      getDb().notifications.some(
        (notification) =>
          notification.recipientId === 'administrator' &&
          notification.eventType === 'assignment.suggested',
      ),
    ).toBe(true);
    await request('/api/assignments', z.unknown(), {
      method: 'POST',
      json: {
        institutionId: 'DEMO-004',
        officerId: 'officer-b',
        reason: 'Balancing the backlog as suggested.',
        suggestionId: suggestion.id,
      },
    });
    const list = await request(
      '/api/assignment-suggestions',
      reassignmentSuggestionsSchema,
    );
    expect(list[0]).toMatchObject({
      status: 'applied',
      resolvedBy: 'Administrator',
    });

    // A dismissed suggestion tells the supervisor why.
    await signInAs('supervisor');
    const second = await suggest({
      institutionId: 'DEMO-003',
      suggestedOfficerId: null,
      reason: 'Conflict of interest reported for Officer A.',
    });
    await signInAs('administrator');
    await request(
      `/api/assignment-suggestions/${second.id}/dismiss`,
      reassignmentSuggestionSchema,
      { method: 'POST', json: { note: 'Checked: no conflict on record.' } },
    );
    await signInAs('supervisor');
    const mine = await request(
      '/api/assignment-suggestions',
      reassignmentSuggestionsSchema,
    );
    expect(mine.find((item) => item.id === second.id)).toMatchObject({
      status: 'dismissed',
      resolutionNote: 'Checked: no conflict on record.',
    });
  });
});

describe('quarter status in oversight (HP2-55)', () => {
  it('reads an open quarter as open, with its deadline and reports in', async () => {
    await submittedQ1('DEMO-001');
    const [q1, q2] = (await request('/api/oversight', oversightSchema)).trends;
    expect(q1).toMatchObject({
      status: 'open',
      expected: 4,
      received: 1,
      due: 0,
      submissionDeadline: expect.stringMatching(/^2026-10-15T/),
    });
    expect(q2).toMatchObject({ status: 'not_open', received: 0 });
  });
});
