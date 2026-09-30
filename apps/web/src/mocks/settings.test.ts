// @vitest-environment node
import {
  accountSchema,
  assignmentHistorySchema,
  calendarSettingsSchema,
  cycleSchema,
  peopleSchema,
  planSchema,
  riskScaleSettingsSchema,
  profilesStateSchema,
  scoringProfileSchema,
  sessionSchema,
  simulationStateSchema,
  type ScoringProfile,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
import { acceptInvitation, publishSeedForm } from '@/test/api-helpers';
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

  it('labels the risk scale, refusing a repeated label, and keeps severity a number', async () => {
    await signInAs('administrator');
    const scale = () =>
      request('/api/settings/risk-scale', riskScaleSettingsSchema);
    const update = (json: object) =>
      request('/api/settings/risk-scale', riskScaleSettingsSchema, {
        method: 'PUT',
        json,
      });
    const current = (await scale()).riskScale;
    expect(current.probability[2]).toBe('Possible');
    const reason = 'Labels confirmed against the EACC template.';
    await expect(
      update({
        ...current,
        impact: ['Low', 'Low', 'Moderate', 'Major', 'Severe'],
        reason,
      }),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: { impact: 'Give each point of the scale its own label.' },
    });
    await expect(update({ ...current, reason })).rejects.toMatchObject({
      status: 422,
      code: 'no_change',
    });
    const saved = await update({
      probability: ['Very low', 'Low', 'Medium', 'High', 'Very high'],
      impact: current.impact,
      source: 'EACC risk assessment template, 23rd Cycle guidelines, page 4.',
      reason,
    });
    expect(saved.changes[0]).toMatchObject({
      summary:
        'Probability labels → 1 Very low, 2 Low, 3 Medium, 4 High, 5 Very high; Source → EACC risk assessment template, 23rd Cycle guidelines, page 4.',
      reason,
    });
    expect(getDb().audit.at(-1)?.action).toBe('settings.risk_scale');
    await signInAs('officer-a');
    await expect(scale()).rejects.toMatchObject({ status: 403 });
    await signInAs('focal-demo-001');
    const cycle = await request('/api/cycles/current', cycleSchema);
    expect(cycle.riskScale.probability[4]).toBe('Very high');
    const plan = await request('/api/institutions/DEMO-001/plan', planSchema);
    expect(plan.risks[0]).toMatchObject({ probability: 3, severity: 12 });
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
        jobTitle: 'Deputy Integrity Assurance Officer',
        role: 'institution',
        institutionId: 'DEMO-001',
      },
    });
    const deputy = created.users.find(
      (user) => user.email === 'deputy.demo-001@example.invalid',
    )!;
    expect(deputy).toMatchObject({ active: true, status: 'invited' });
    // They cannot sign in until they accept the emailed invitation.
    await expect(signInAs(deputy.id)).rejects.toThrow();
    await acceptInvitation('deputy.demo-001@example.invalid');
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
          typeId: 'state-corporation',
          accountingOfficer: {
            name: 'Accounting Officer, DEMO-002',
            designation: 'Managing Director',
            email: 'ao.demo-002@example.invalid',
            phone: '+254 700 000 002',
          },
        },
      },
    );
    expect(
      people.institutions.find((institution) => institution.id === 'DEMO-002'),
    ).toMatchObject({
      name: 'Demo Water and Sanitation Board',
      accountingOfficer: { phone: '+254 700 000 002' },
      focalPersons: [{ email: 'focal.demo-002@example.invalid' }],
      officer: { id: 'officer-a' },
    });
  });

  it('manages institution types: renaming updates labels, retiring keeps history', async () => {
    await signInAs('administrator');
    const type = (json: object, id = '') =>
      request(
        `/api/settings/institution-types${id ? `/${id}` : ''}`,
        peopleSchema,
        { method: id ? 'PUT' : 'POST', json },
      );
    const added = await type({ label: 'Tertiary college', active: true });
    expect(
      added.institutionTypes.find((item) => item.label === 'Tertiary college'),
    ).toMatchObject({ id: 'tertiary-college', institutionCount: 0 });
    await expect(type({ label: 'fund', active: true })).rejects.toMatchObject({
      status: 422,
    });
    const renamed = await type(
      { label: 'Government fund', active: true },
      'fund',
    );
    expect(
      renamed.institutions.find((item) => item.id === 'DEMO-007')?.type,
    ).toBe('Government fund');
    const retired = await type(
      { label: 'Government fund', active: false },
      'fund',
    );
    // A retired type stays on existing institutions; new ones cannot choose it.
    expect(
      retired.institutions.find((item) => item.id === 'DEMO-007')?.typeId,
    ).toBe('fund');
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

describe('my account', () => {
  it('lets any user edit their name, job title and phone, but not their email or role', async () => {
    await signInAs('focal-demo-001');
    const before = await request('/api/account', accountSchema);
    expect(before).toMatchObject({
      role: 'institution',
      institution: { id: 'DEMO-001' },
      reviewingOfficer: 'Prevention Officer A',
      jobTitle: 'Integrity Assurance Officer',
    });
    const after = await request('/api/account', accountSchema, {
      method: 'PUT',
      json: {
        displayName: 'Amina Focal (fictional)',
        jobTitle: 'Senior Integrity Assurance Officer',
        phone: '+254 700 000 001',
        email: 'changed@example.invalid',
        role: 'administrator',
      },
    });
    expect(after).toMatchObject({
      displayName: 'Amina Focal (fictional)',
      email: 'focal.demo-001@example.invalid',
      role: 'institution',
    });
    const session = await request('/api/session', sessionSchema);
    expect(session.user.jobTitle).toBe('Senior Integrity Assurance Officer');
    await expect(
      request('/api/account', accountSchema, {
        method: 'PUT',
        json: { displayName: 'A', jobTitle: '', phone: 'call me' },
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
