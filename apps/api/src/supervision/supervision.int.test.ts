import { and, eq, isNull } from 'drizzle-orm';
import type {
  Assignment,
  ConsolidatedReport,
  Institution,
  Obligation,
  Oversight,
  People,
  ReassignmentSuggestion,
  ReviewBundle,
  ReviewQueueItem,
  Supervision,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, notifications, supervisions } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import {
  activateInvited,
  completeDraft,
  publishSeedForm,
  submitDraft,
} from '../test/journeys';

/** Ported from apps/web/src/mocks/supervision.test.ts and officers.test.ts (PRD §5.2). */
describe.skipIf(!integration)(
  'supervision, cover and reassignment requests',
  () => {
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

    const ids = (list: { id: string }[]) => list.map((item) => item.id).sort();
    const notified = async (recipientId: string, eventType: string) =>
      (
        await api.db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.recipientId, recipientId),
              eq(notifications.eventType, eventType),
            ),
          )
      ).map((row) => row.title);

    /** Creates a second supervisor for DEMO-005–008; returns a signed-in client for them. */
    async function secondSupervisor() {
      const people = (
        await admin.post('/settings/users', {
          displayName: 'Supervisor Two',
          email: 'supervisor.two@example.invalid',
          jobTitle: 'Deputy Head of Prevention',
          role: 'supervisor',
          institutionId: null,
        })
      ).body as People;
      const id = people.users.find(
        (user) => user.email === 'supervisor.two@example.invalid',
      )!.id;
      for (const institutionId of [
        'DEMO-005',
        'DEMO-006',
        'DEMO-007',
        'DEMO-008',
      ])
        expect(
          (
            await admin.post('/supervision', {
              institutionId,
              supervisorId: id,
              reason: 'Splitting oversight between two supervisors.',
            })
          ).status,
        ).toBe(200);
      const two = await activateInvited(
        admin,
        api.client(),
        'supervisor.two@example.invalid',
      );
      return { id, two };
    }

    async function submittedQ1(
      institutionId = 'DEMO-001',
      officerId = 'officer-a',
    ) {
      await publishSeedForm(admin);
      const focal = await api
        .client()
        .signIn(`focal-${institutionId.toLowerCase()}`);
      const { draft } = await completeDraft(focal, institutionId);
      await submitDraft(focal, institutionId, draft.version);
      const officer = await api.client().signIn(officerId);
      return (await officer.json<ReviewQueueItem[]>('/reviews')).find(
        (item) => item.institutionId === institutionId,
      )!;
    }

    it('scopes supervisors to their institutions everywhere', async () => {
      const { two } = await secondSupervisor();
      const one = await api.client().signIn('supervisor');
      expect(ids(await one.json<Institution[]>('/institutions'))).toEqual([
        'DEMO-001',
        'DEMO-002',
        'DEMO-003',
        'DEMO-004',
      ]);
      const obligations = await one.json<Obligation[]>('/obligations');
      expect(new Set(obligations.map((item) => item.institutionId)).size).toBe(
        4,
      );
      expect((await one.request('/institutions/DEMO-005')).status).toBe(404);
      expect(
        (await one.json<Assignment[]>('/assignments')).every(
          (item) => item.officerId === 'officer-a',
        ),
      ).toBe(true);
      expect(
        (await one.json<Assignment[]>('/assignments/history')).every(
          (row) => row.institutionId <= 'DEMO-004',
        ),
      ).toBe(true);
      // Only the officer who reviews the supervisor's institutions.
      expect(
        (await one.json<Oversight>('/oversight')).workload.map(
          (row) => row.officerId,
        ),
      ).toEqual(['officer-a']);
      expect(
        (await one.json<ConsolidatedReport>('/annual/report')).unreleased,
      ).toHaveLength(4);
      expect(
        (await one.json<Supervision[]>('/supervision')).every(
          (row) => row.supervisorId === 'supervisor',
        ),
      ).toBe(true);

      // A submission from the other supervisor's institution is out of reach.
      const item = await submittedQ1('DEMO-005', 'officer-b');
      expect((await one.request(`/reviews/${item.submissionId}`)).status).toBe(
        404,
      );
      expect(
        (await two.json<ReviewBundle>(`/reviews/${item.submissionId}`)).item
          .institutionId,
      ).toBe('DEMO-005');
    });

    it('keeps oversight from lapsing when supervisors are deactivated', async () => {
      const deactivate = () =>
        admin.post('/settings/users/supervisor/status', {
          active: false,
          reason: 'Leaving the prevention unit.',
        });
      expect(await deactivate()).toMatchObject({
        status: 409,
        body: { code: 'supervisor_has_institutions' },
      });
      // Even with no institutions, the last supervisor stays active.
      await api.db
        .update(supervisions)
        .set({ validTo: '2026-10-01T08:00:00+03:00' })
        .where(isNull(supervisions.validTo));
      expect(await deactivate()).toMatchObject({
        status: 409,
        body: { code: 'last_supervisor' },
      });
    });

    it('closes the comment loop without gating finalization', async () => {
      const item = await submittedQ1();
      const supervisor = await api.client().signIn('supervisor');
      const commented = (
        await supervisor.post(`/reviews/${item.submissionId}/comments`, {
          text: 'Check the CPC minutes are signed.',
        })
      ).body as ReviewBundle;
      const comment = commented.comments[0]!;
      expect(comment).toMatchObject({ status: 'open', replies: [] });
      const path = `/reviews/${item.submissionId}/comments/${comment.id}/replies`;
      // Only the officer marks a comment addressed.
      expect(
        (await supervisor.post(path, { text: 'Thanks.', addressed: true }))
          .status,
      ).toBe(422);
      const officer = await api.client().signIn('officer-a');
      const addressed = (
        await officer.post(path, {
          text: 'Checked: signed and dated.',
          addressed: true,
        })
      ).body as ReviewBundle;
      expect(addressed.comments[0]).toMatchObject({
        status: 'addressed',
        replies: [{ role: 'officer', text: 'Checked: signed and dated.' }],
      });
      expect(await notified('supervisor', 'review.comment_reply')).toHaveLength(
        1,
      );
      // Another officer cannot reply.
      const other = await api.client().signIn('officer-b');
      expect(
        (await other.post(path, { text: 'Not mine.', addressed: false }))
          .status,
      ).toBe(404);
    });

    it('lets a supervisor suggest and only the administrator decide', async () => {
      const supervisor = await api.client().signIn('supervisor');
      const suggest = (body: object) =>
        supervisor.post('/assignment-suggestions', body);
      const first = await suggest({
        institutionId: 'DEMO-004',
        suggestedOfficerId: 'officer-b',
        reason: 'Officer A has the oldest backlog this quarter.',
      });
      expect(first).toMatchObject({
        status: 201,
        body: {
          status: 'open',
          currentOfficerName: 'Prevention Officer A',
          suggestedOfficerName: 'Prevention Officer B',
        },
      });
      const suggestion = first.body as ReassignmentSuggestion;
      expect(
        await suggest({
          institutionId: 'DEMO-004',
          suggestedOfficerId: null,
          reason: 'A second suggestion for the same institution.',
        }),
      ).toMatchObject({ status: 409, body: { code: 'suggestion_open' } });
      // Supervisors cannot reassign.
      expect(
        (
          await supervisor.post('/assignments', {
            institutionId: 'DEMO-004',
            officerId: 'officer-b',
            reason: 'Trying to reassign directly.',
          })
        ).status,
      ).toBe(403);
      expect(await notified('administrator', 'assignment.suggested')).toEqual([
        'Reassignment suggested: DEMO-004',
      ]);
      await admin.post('/assignments', {
        institutionId: 'DEMO-004',
        officerId: 'officer-b',
        reason: 'Balancing the backlog as suggested.',
        suggestionId: suggestion.id,
      });
      expect(
        (
          await admin.json<ReassignmentSuggestion[]>('/assignment-suggestions')
        )[0],
      ).toMatchObject({ status: 'applied', resolvedBy: 'Administrator' });

      // A dismissed suggestion tells the supervisor why.
      const second = (
        await suggest({
          institutionId: 'DEMO-003',
          suggestedOfficerId: null,
          reason: 'Conflict of interest reported for Officer A.',
        })
      ).body as ReassignmentSuggestion;
      await admin.post(`/assignment-suggestions/${second.id}/dismiss`, {
        note: 'Checked: no conflict on record.',
      });
      expect(
        (
          await supervisor.json<ReassignmentSuggestion[]>(
            '/assignment-suggestions',
          )
        ).find((item) => item.id === second.id),
      ).toMatchObject({
        status: 'dismissed',
        resolutionNote: 'Checked: no conflict on record.',
      });
    });

    it('lets an officer declare a conflict of interest about its own institution', async () => {
      const officer = await api.client().signIn('officer-a');
      const declare = (body: object) =>
        officer.post('/assignment-suggestions', body);
      expect(
        (
          await declare({
            kind: 'conflict_of_interest',
            institutionId: 'DEMO-005',
            suggestedOfficerId: null,
            reason: 'Not my institution at all.',
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await declare({
            kind: 'suggestion',
            institutionId: 'DEMO-002',
            suggestedOfficerId: 'officer-b',
            reason: 'Officers cannot suggest reassignments.',
          })
        ).status,
      ).toBe(403);
      expect(
        await declare({
          kind: 'conflict_of_interest',
          institutionId: 'DEMO-002',
          suggestedOfficerId: null,
          reason: 'My brother is the Accounting Officer there.',
        }),
      ).toMatchObject({
        status: 201,
        body: {
          kind: 'conflict_of_interest',
          requestedByRole: 'officer',
          status: 'open',
        },
      });
      expect(await notified('supervisor', 'assignment.suggested')).toEqual([
        'Conflict of interest declared: DEMO-002',
      ]);
    });

    it('moves access for the cover period and returns it automatically', async () => {
      const cover = (coverUntil: string) =>
        admin.post('/assignments', {
          institutionId: 'DEMO-001',
          officerId: 'officer-b',
          reason: 'Officer A on annual leave.',
          coverUntil,
          handoverNote: 'The Q1 report is due on 15 October.',
        });
      expect((await cover('2026-10-01')).status).toBe(422);
      expect((await cover('2026-10-10')).status).toBe(200);
      const covering = await api.client().signIn('officer-b');
      expect(
        (await covering.json<Assignment[]>('/assignments')).find(
          (row) => row.institutionId === 'DEMO-001',
        ),
      ).toMatchObject({
        cover: {
          until: '2026-10-10T23:59:59+03:00',
          returnToOfficerId: 'officer-a',
          returnToOfficerName: 'Prevention Officer A',
        },
        handoverNote: 'The Q1 report is due on 15 October.',
      });
      const away = await api.client().signIn('officer-a');
      expect(
        ids(await away.json<Institution[]>('/institutions')),
      ).not.toContain('DEMO-001');

      // 14 Oct: the cover has ended and DEMO-001 is back with Officer A.
      await admin.post('/simulation/advance', { boundaryId: 'Q1-reminder-1' });
      expect(
        (await away.json<Assignment[]>('/assignments')).find(
          (row) => row.institutionId === 'DEMO-001' && row.validTo === null,
        ),
      ).toMatchObject({ validFrom: '2026-10-10T23:59:59+03:00', cover: null });
      const audit = await api.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'assignment.change'));
      expect(
        audit.some((event) =>
          event.summary.includes('Cover by Prevention Officer B ended'),
        ),
      ).toBe(true);
    });

    it('moves many institutions to one officer or supervisor at once', async () => {
      const moved = await admin.post('/assignments/bulk', {
        institutionIds: ['DEMO-001', 'DEMO-002', 'DEMO-005'],
        officerId: 'officer-b',
        reason: 'Officer A is moving to another unit.',
      });
      expect(moved).toMatchObject({
        status: 200,
        body: { changed: ['DEMO-001', 'DEMO-002'], unchanged: ['DEMO-005'] },
      });
      expect(
        await admin.post('/assignments/bulk', {
          institutionIds: ['DEMO-999'],
          officerId: 'officer-b',
          reason: 'Unknown institution in the list.',
        }),
      ).toMatchObject({ status: 422 });
      const { id } = await secondSupervisor();
      expect(
        (
          await admin.post('/supervision/bulk', {
            institutionIds: ['DEMO-001', 'DEMO-005'],
            supervisorId: id,
            reason: 'Rebalancing oversight.',
          })
        ).body,
      ).toEqual({ changed: ['DEMO-001'], unchanged: ['DEMO-005'] });
    });

    it('reads an open quarter as open, with its deadline and reports in (HP2-55)', async () => {
      await publishSeedForm(admin);
      const focal = await api.client().signIn('focal-demo-001');
      const { draft } = await completeDraft(focal, 'DEMO-001');
      await submitDraft(focal, 'DEMO-001', draft.version);
      const officer = await api.client().signIn('officer-a');
      const [q1, q2] = (await officer.json<Oversight>('/oversight')).trends;
      expect(q1).toMatchObject({
        status: 'open',
        expected: 4,
        received: 1,
        due: 0,
        submissionDeadline: expect.stringMatching(/^2026-10-15T/),
      });
      expect(q2).toMatchObject({ status: 'not_open', received: 0 });
    });
  },
);
