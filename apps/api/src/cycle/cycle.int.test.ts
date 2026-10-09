import { eq } from 'drizzle-orm';
import type {
  CalendarSettings,
  FormCheck,
  FormCreation,
  FormVersion,
  People,
  ProfilesState,
  ScoringProfile,
  Session,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  auditEvents,
  notifications,
  periods,
  systemState,
} from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import { activateInvited } from '../test/journeys';

/** Ported from apps/web/src/mocks/settings.test.ts and thin-path.test.ts (AT03). */
describe.skipIf(!integration)('reporting cycle', () => {
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

  const notified = async (eventType: string) =>
    (
      await api.db
        .select()
        .from(notifications)
        .where(eq(notifications.eventType, eventType))
    ).length;

  async function approvedCopy(weights: ScoringProfile['weights']) {
    const draft = (
      await admin.post('/settings/profiles', { basedOn: 'hackathon-mock-v1' })
    ).body as ScoringProfile;
    await admin.put(`/settings/profiles/${draft.id}`, {
      name: 'Heavier implementation',
      weights,
      proceduresMode: 'scored',
      checklists: draft.checklists,
      sourceNote: 'Test profile.',
    });
    return (await admin.post(`/settings/profiles/${draft.id}/approve`))
      .body as ScoringProfile;
  }

  describe('scoring profiles (PRD §7.1, §10.1)', () => {
    it('seeds the tested default and a reference profile that cannot be applied', async () => {
      const state = await admin.json<ProfilesState>('/settings/profiles');
      expect(state.cycleProfileId).toBe('hackathon-mock-v1');
      expect(state.locked).toBe(false);
      expect(state.profiles.map((profile) => profile.id)).toEqual([
        'hackathon-mock-v1',
        'cycle-23-reference',
      ]);
      expect(state.profiles[1]).toMatchObject({
        status: 'reference',
        proceduresMode: 'prerequisite',
        weights: { procedures: 0, implementation: 80 },
      });
      expect(
        await admin.post('/settings/profiles/cycle-23-reference/apply'),
      ).toMatchObject({ status: 409, body: { code: 'profile_not_approved' } });
    });

    it('applies an approved profile before the first publication, then locks it', async () => {
      const profile = await approvedCopy({
        procedures: 5,
        riskAssessment: 10,
        mitigationPlan: 10,
        implementation: 75,
      });
      expect(profile.status).toBe('approved');
      await admin.post(`/settings/profiles/${profile.id}/apply`);
      expect((await admin.json<Session>('/session')).profile.name).toBe(
        'Heavier implementation',
      );

      const published = (await admin.post('/forms/form-v1/publish'))
        .body as FormVersion;
      expect(published).toMatchObject({
        status: 'published',
        weightsLocked: true,
        weights: { implementation: 75 },
      });
      const state = await admin.json<ProfilesState>('/settings/profiles');
      expect(state.locked).toBe(true);
      expect(
        await admin.post('/settings/profiles/hackathon-mock-v1/apply'),
      ).toMatchObject({ status: 409, body: { code: 'profile_locked' } });
      // An approved profile is immutable.
      expect(
        await admin.put(`/settings/profiles/${profile.id}`, profile),
      ).toMatchObject({ status: 409, body: { code: 'profile_immutable' } });
    });

    it('blocks invalid weights with an actionable error (AT03)', async () => {
      const draft = (
        await admin.post('/settings/profiles', { basedOn: 'hackathon-mock-v1' })
      ).body as ScoringProfile;
      expect(draft.name).toBe('Hackathon Mock v1 copy');
      await admin.put(`/settings/profiles/${draft.id}`, {
        name: draft.name,
        weights: { ...draft.weights, implementation: 50 },
        proceduresMode: draft.proceduresMode,
        checklists: draft.checklists,
        sourceNote: draft.sourceNote,
      });
      expect(
        await admin.post(`/settings/profiles/${draft.id}/approve`),
      ).toMatchObject({
        status: 422,
        body: {
          code: 'profile_invalid',
          fieldErrors: {
            weights: 'Indicator weights must total 100; they total 90.',
          },
        },
      });
    });
  });

  describe('form versions (FR03)', () => {
    it('publishes, notifies institutions and officers, and audits', async () => {
      expect((await admin.post('/forms/form-v1/publish')).status).toBe(200);
      // 8 focal people, 2 officers and the supervisor, once each.
      expect(await notified('form.published')).toBe(11);
      const [audit] = await api.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'form.publish'));
      expect(audit).toMatchObject({
        actorName: 'Administrator',
        objectId: 'form-v1',
        businessTime: '2026-10-01T08:00:00+03:00',
      });
      expect(await admin.post('/forms/form-v1/publish')).toMatchObject({
        status: 409,
        body: { code: 'already_published' },
      });
    });

    it('keeps drafts to the administrator and allows one draft at a time', async () => {
      await admin.post('/forms/form-v1/publish');
      const draft = (await admin.post('/forms')).body as FormVersion;
      expect(draft).toMatchObject({
        id: 'form-v2',
        status: 'draft',
        basedOnVersion: 1,
      });
      // Q1 reporting has opened, so it stays on version 1.
      expect(draft.periodIds).not.toContain('FY2026-27-Q1');
      expect(await admin.post('/forms')).toMatchObject({
        status: 409,
        body: { code: 'draft_exists' },
      });
      const focal = await api.client().signIn('focal-demo-001');
      expect((await focal.request('/forms/form-v2')).status).toBe(404);
      expect(
        (await focal.json<FormVersion[]>('/forms')).map((form) => form.id),
      ).toEqual(['form-v1']);
      expect((await focal.request('/forms/form-v1/validation')).status).toBe(
        403,
      );
    });

    it('checks unsaved edits, linked to their fields, with the publication impact (HP2-70)', async () => {
      await admin.post('/forms/form-v1/publish');
      const draft = (await admin.post('/forms')).body as FormVersion;
      const sections = structuredClone(draft.sections);
      sections[0]!.questions[0]!.label = ' ';
      const check = (
        await admin.post('/forms/form-v2/check', {
          title: draft.title,
          periodIds: ['FY2026-27-Q1', 'FY2026-27-Q3', 'FY2026-27-Q4'],
          sections,
        })
      ).body as FormCheck;
      expect(check.valid).toBe(false);
      expect(check.issues).toEqual(
        expect.arrayContaining([
          {
            path: 'sections.0.questions.0.label',
            message: 'Give the question a label.',
          },
          expect.objectContaining({ path: 'periodIds' }),
        ]),
      );
      expect(
        check.impact.periods.map((period) => [period.label, period.outcome]),
      ).toEqual([
        ['Q1', 'locked'],
        ['Q2', 'keeps'],
        ['Q3', 'moves'],
        ['Q4', 'moves'],
      ]);
      expect(check.impact.institutions).toBe(8);
      expect(check.impact.recipients).toEqual([
        { role: 'institution', count: 8 },
        { role: 'officer', count: 2 },
        { role: 'supervisor', count: 1 },
      ]);
      // Nothing was saved.
      expect((await admin.json<FormVersion>('/forms/form-v2')).revision).toBe(
        draft.revision,
      );
      const focal = await api.client().signIn('focal-demo-001');
      expect(
        (await focal.post('/forms/form-v2/check', { title: 'x' })).status,
      ).toBe(403);
    });

    it('explains when no period is left for a new version (HP2-70)', async () => {
      await admin.post('/forms/form-v1/publish');
      expect(await admin.json<FormCreation>('/forms/creation')).toMatchObject({
        allowed: true,
        reason: null,
      });
      await api.db
        .update(systemState)
        .set({ businessTime: '2027-08-01T09:00:00+03:00' });
      const creation = await admin.json<FormCreation>('/forms/creation');
      expect(creation).toMatchObject({ allowed: false, assignablePeriods: [] });
      expect(creation.reason).toMatch(/Every period in this cycle has started/);
      expect(await admin.post('/forms')).toMatchObject({
        status: 409,
        body: { code: 'no_assignable_period', message: creation.reason },
      });
    });

    it('refuses to change scored criteria in a later version', async () => {
      await admin.post('/forms/form-v1/publish');
      const draft = (await admin.post('/forms')).body as FormVersion;
      const sections = draft.sections.map((section) => ({
        ...section,
        questions: section.questions.filter(
          (question) => question.type !== 'milestone_progress',
        ),
      }));
      await admin.put('/forms/form-v2', {
        title: draft.title,
        periodIds: draft.periodIds,
        sections,
        weights: draft.weights,
        baseRevision: draft.revision,
      });
      const result = await admin.post('/forms/form-v2/publish');
      expect(result).toMatchObject({
        status: 422,
        body: { code: 'publication_blocked' },
      });
      expect(
        (result.body as { fieldErrors: Record<string, string> }).fieldErrors
          .sections,
      ).toBe('The form needs exactly one milestone progress block.');
    });
  });

  describe('reporting calendar (FR02)', () => {
    async function base(reason: string) {
      const current = await admin.json<CalendarSettings>('/settings/calendar');
      return {
        current,
        body: {
          deadlines: Object.fromEntries(
            current.periods.map((period) => [period.id, period.deadlineDate]),
          ),
          foundationDeadlineDate: current.foundationDeadlineDate,
          evaluationCutoffDate: current.evaluationCutoffDate,
          reminders: current.reminders,
          dayCounting: current.dayCounting,
          applyRuleToDeadlines: false,
          reason,
        },
      };
    }

    it('fixes an opened quarter’s deadline and moves a future one with a reason', async () => {
      const { current, body } = await base(
        'Public holiday moves the Q2 deadline.',
      );
      const [q1, q2] = current.periods;
      expect(q1!.lock.editable).toBe(false);
      expect(q2!.lock.editable).toBe(true);
      expect(
        await admin.put('/settings/calendar', {
          ...body,
          deadlines: { ...body.deadlines, [q1!.id]: '2026-10-20' },
        }),
      ).toMatchObject({ status: 422, body: { code: 'calendar_invalid' } });

      const next = (
        await admin.put('/settings/calendar', {
          ...body,
          deadlines: { ...body.deadlines, [q2!.id]: '2027-01-18' },
        })
      ).body as CalendarSettings;
      expect(next.periods[1]!.deadlineDate).toBe('2027-01-18');
      const [stored] = await api.db
        .select()
        .from(periods)
        .where(eq(periods.id, q2!.id));
      expect(stored!.submissionDeadline).toBe('2027-01-18T23:59:59+03:00');
      expect(next.changes[0]).toMatchObject({
        reason: 'Public holiday moves the Q2 deadline.',
        by: 'Administrator',
      });
      expect(await notified('calendar.changed')).toBe(10);
    });

    it('saves a new reminder schedule without notifying, and refuses no-ops', async () => {
      const { body } = await base(
        'Institutions asked for an earlier reminder.',
      );
      expect(await admin.put('/settings/calendar', body)).toMatchObject({
        status: 422,
        body: { code: 'no_change' },
      });
      const next = (
        await admin.put('/settings/calendar', {
          ...body,
          reminders: { daysBefore: [7, 14, 1], overdueNotice: true },
        })
      ).body as CalendarSettings;
      expect(next.reminders.daysBefore).toEqual([14, 7, 1]);
      expect(await notified('calendar.changed')).toBe(0);
    });
  });

  describe('users and institutions (FR01, AT22)', () => {
    it('creates an account and ends a deactivated account’s session', async () => {
      const created = (
        await admin.post('/settings/users', {
          displayName: 'Deputy focal person, DEMO-001',
          email: 'deputy.demo-001@example.invalid',
          jobTitle: 'Deputy Integrity Officer',
          role: 'institution',
          institutionId: 'DEMO-001',
        })
      ).body as People;
      const deputy = created.users.find(
        (user) => user.email === 'deputy.demo-001@example.invalid',
      )!;
      expect(deputy).toMatchObject({ active: true, institutionId: 'DEMO-001' });
      expect(
        await admin.post('/settings/users', {
          displayName: 'Duplicate',
          email: 'DEPUTY.demo-001@example.invalid',
          jobTitle: '',
          role: 'supervisor',
          institutionId: null,
        }),
      ).toMatchObject({
        status: 422,
        body: {
          fieldErrors: { email: 'Another account already uses this address.' },
        },
      });

      // New accounts are invited: they sign in with the emailed temporary password.
      expect(deputy.status).toBe('invited');
      const session = await activateInvited(admin, api.client(), deputy.email);
      expect((await session.request('/session')).status).toBe(200);
      await admin.post(`/settings/users/${deputy.id}/status`, {
        active: false,
        reason: 'Left the institution in October.',
      });
      expect((await session.request('/session')).status).toBe(401);
    });

    it('refuses to deactivate an officer with institutions, or oneself', async () => {
      expect(
        await admin.post('/settings/users/officer-a/status', {
          active: false,
          reason: 'Moving to another department.',
        }),
      ).toMatchObject({
        status: 409,
        body: { code: 'officer_has_assignments' },
      });
      expect(
        await admin.post('/settings/users/administrator/status', {
          active: false,
          reason: 'Testing self deactivation.',
        }),
      ).toMatchObject({ status: 409, body: { code: 'self_deactivation' } });
    });

    it('renames an institution while its stable ID stays the same', async () => {
      const people = (
        await admin.put('/settings/institutions/DEMO-002', {
          name: 'Demo Water and Sanitation Board',
          typeId: 'state-corporation',
          accountingOfficer: {
            name: 'Accounting Officer, DEMO-002',
            designation: 'Managing Director',
            email: '',
            phone: '',
          },
        })
      ).body as People;
      expect(
        people.institutions.find(
          (institution) => institution.id === 'DEMO-002',
        ),
      ).toMatchObject({ name: 'Demo Water and Sanitation Board' });
      // The focal person and the assigned officer.
      expect(await notified('institution.renamed')).toBe(2);
    });

    it('keeps settings to the administrator', async () => {
      const supervisor = await api.client().signIn('supervisor');
      expect((await supervisor.request('/settings/people')).status).toBe(403);
      expect((await supervisor.request('/settings/profiles')).status).toBe(200);
    });
  });
});
