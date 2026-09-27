// @vitest-environment node
import {
  assignmentHistorySchema,
  calendarSettingsSchema,
  peopleSchema,
  profilesStateSchema,
  scoringProfileSchema,
  sessionSchema,
  simulationStateSchema,
  type ScoringProfile,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
import { publishSeedForm } from '@/test/api-helpers';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';

const profiles = () => request('/api/settings/profiles', profilesStateSchema);

async function approvedCopy(weights: ScoringProfile['weights']) {
  const draft = await request('/api/settings/profiles', scoringProfileSchema, {
    method: 'POST',
    json: { basedOn: 'hackathon-mock-v1' },
  });
  await request(`/api/settings/profiles/${draft.id}`, scoringProfileSchema, {
    method: 'PUT',
    json: {
      name: 'Heavier implementation',
      weights,
      proceduresMode: 'scored',
      checklists: draft.checklists,
      sourceNote: 'Test profile.',
    },
  });
  return request(
    `/api/settings/profiles/${draft.id}/approve`,
    scoringProfileSchema,
    { method: 'POST' },
  );
}

describe('scoring profiles (PRD §7.1, §10.1)', () => {
  it('seeds the tested default and a reference profile that cannot be applied', async () => {
    await signInAs('administrator');
    const state = await profiles();
    expect(state.cycleProfileId).toBe('hackathon-mock-v1');
    expect(state.locked).toBe(false);
    const reference = state.profiles.find(
      (profile) => profile.id === 'cycle-23-reference',
    )!;
    expect(reference).toMatchObject({
      status: 'reference',
      proceduresMode: 'prerequisite',
      weights: { procedures: 0, implementation: 80 },
    });
    await expect(
      request('/api/settings/profiles/cycle-23-reference/apply', z.unknown(), {
        method: 'POST',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'profile_not_approved' });
  });

  it('applies an approved profile before the first publication, then locks it for the cycle', async () => {
    await signInAs('administrator');
    const profile = await approvedCopy({
      procedures: 5,
      riskAssessment: 10,
      mitigationPlan: 10,
      implementation: 75,
    });
    await request(
      `/api/settings/profiles/${profile.id}/apply`,
      profilesStateSchema,
      { method: 'POST' },
    );
    const session = await request('/api/session', sessionSchema);
    expect(session.profile.name).toBe('Heavier implementation');

    await publishSeedForm();
    await signInAs('administrator');
    expect(getDb().forms[0]!.weights.implementation).toBe(75);
    const state = await profiles();
    expect(state.locked).toBe(true);
    await expect(
      request('/api/settings/profiles/hackathon-mock-v1/apply', z.unknown(), {
        method: 'POST',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'profile_locked' });
    // An approved profile is immutable.
    await expect(
      request(`/api/settings/profiles/${profile.id}`, z.unknown(), {
        method: 'PUT',
        json: { ...profile },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'profile_immutable' });
  });

  it('tries a different profile in a new run and keeps the profile library', async () => {
    await signInAs('administrator');
    const profile = await approvedCopy({
      procedures: 10,
      riskAssessment: 10,
      mitigationPlan: 10,
      implementation: 70,
    });
    await publishSeedForm();
    await signInAs('administrator');
    const run = await request('/api/simulation/reset', simulationStateSchema, {
      method: 'POST',
      json: { profileId: profile.id },
    });
    expect(run.runId).toBe('run-002');
    const state = await profiles();
    expect(state.cycleProfileId).toBe(profile.id);
    expect(state.locked).toBe(false);
    expect(state.profiles.map((item) => item.id)).toContain(profile.id);
  });
});

describe('reporting calendar (FR02)', () => {
  const calendar = () =>
    request('/api/settings/calendar', calendarSettingsSchema);
  const save = (json: object) =>
    request('/api/settings/calendar', calendarSettingsSchema, {
      method: 'PUT',
      json,
    });

  it('fixes an opened quarter’s deadline and moves a future one with a reason', async () => {
    await signInAs('administrator');
    const current = await calendar();
    const q1 = current.periods[0]!;
    const q2 = current.periods[1]!;
    expect(q1.lock.editable).toBe(false);
    expect(q2.lock.editable).toBe(true);
    const base = {
      deadlines: Object.fromEntries(
        current.periods.map((period) => [period.id, period.deadlineDate]),
      ),
      foundationDeadlineDate: current.foundationDeadlineDate,
      evaluationCutoffDate: current.evaluationCutoffDate,
      reminders: current.reminders,
      dayCounting: current.dayCounting,
      applyRuleToDeadlines: false,
      reason: 'Public holiday moves the Q2 deadline.',
    };
    await expect(
      save({
        ...base,
        deadlines: { ...base.deadlines, [q1.id]: '2026-10-20' },
      }),
    ).rejects.toMatchObject({ status: 422, code: 'calendar_invalid' });

    const next = await save({
      ...base,
      deadlines: { ...base.deadlines, [q2.id]: '2027-01-18' },
    });
    expect(next.periods[1]!.deadlineDate).toBe('2027-01-18');
    expect(getDb().cycle.periods[1]!.submissionDeadline).toBe(
      '2027-01-18T23:59:59+03:00',
    );
    expect(next.changes[0]).toMatchObject({
      reason: 'Public holiday moves the Q2 deadline.',
    });
    expect(
      getDb().notifications.some(
        (item) => item.eventType === 'calendar.changed',
      ),
    ).toBe(true);
  });

  it('adds a reminder for future deadlines without sending past ones late', async () => {
    await signInAs('administrator');
    const current = await calendar();
    await save({
      deadlines: Object.fromEntries(
        current.periods.map((period) => [period.id, period.deadlineDate]),
      ),
      foundationDeadlineDate: current.foundationDeadlineDate,
      evaluationCutoffDate: current.evaluationCutoffDate,
      reminders: { daysBefore: [14, 7, 1], overdueNotice: true },
      dayCounting: current.dayCounting,
      applyRuleToDeadlines: false,
      reason: 'Institutions asked for an earlier reminder.',
    });
    const boundaries = (
      await request('/api/simulation', simulationStateSchema)
    ).boundaries.map((boundary) => boundary.id);
    expect(boundaries).toContain('Q2-reminder-14');
  });
});

describe('users and institutions (FR01, AT22)', () => {
  it('creates an account and ends a deactivated account’s session', async () => {
    await signInAs('administrator');
    const created = await request('/api/settings/users', peopleSchema, {
      method: 'POST',
      json: {
        displayName: 'Deputy focal person, DEMO-001',
        email: 'deputy.demo-001@example.invalid',
        role: 'institution',
        institutionId: 'DEMO-001',
      },
    });
    const deputy = created.users.find(
      (user) => user.email === 'deputy.demo-001@example.invalid',
    )!;
    expect(deputy.active).toBe(true);

    await signInAs(deputy.id);
    await request('/api/session', sessionSchema);
    // The administrator deactivates the account from another session.
    getDb().session = { userId: 'administrator', expired: false };
    await request(`/api/settings/users/${deputy.id}/status`, peopleSchema, {
      method: 'POST',
      json: { active: false, reason: 'Left the institution in October.' },
    });
    getDb().session = { userId: deputy.id, expired: false };
    await expect(request('/api/session', sessionSchema)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('refuses to deactivate an officer who still has institutions', async () => {
    await signInAs('administrator');
    await expect(
      request('/api/settings/users/officer-a/status', z.unknown(), {
        method: 'POST',
        json: { active: false, reason: 'Moving to another department.' },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'officer_has_assignments' });
  });

  it('renames an institution while its stable ID stays the same', async () => {
    await signInAs('administrator');
    const people = await request(
      '/api/settings/institutions/DEMO-002',
      peopleSchema,
      {
        method: 'PUT',
        json: {
          name: 'Demo Water and Sanitation Board',
          type: 'State corporation',
          focalContact: 'Focal person, DEMO-002',
          accountingOfficerContact: 'Accounting Officer, DEMO-002',
        },
      },
    );
    expect(
      people.institutions.find((institution) => institution.id === 'DEMO-002'),
    ).toMatchObject({ name: 'Demo Water and Sanitation Board' });
  });
});

describe('reassignment (AT22)', () => {
  it('moves access at once and keeps the earlier reviewer in the history', async () => {
    await signInAs('administrator');
    await request('/api/assignments', z.unknown(), {
      method: 'POST',
      json: {
        institutionId: 'DEMO-005',
        officerId: 'officer-a',
        reason: 'Balancing portfolios for Q2.',
      },
    });
    const history = await request(
      '/api/assignments/history',
      assignmentHistorySchema,
    );
    expect(
      history
        .filter((row) => row.institutionId === 'DEMO-005')
        .map((row) => row.officerId),
    ).toEqual(['officer-b', 'officer-a']);
    await signInAs('officer-b');
    await expect(
      request('/api/institutions/DEMO-005', z.unknown()),
    ).rejects.toMatchObject({ status: 404 });
    await signInAs('officer-a');
    await request('/api/institutions/DEMO-005', z.unknown());
  });
});
