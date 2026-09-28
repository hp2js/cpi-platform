// @vitest-environment node
import {
  institutionProfileSchema,
  institutionSchema,
  peopleSchema,
  simulationStateSchema,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
import {
  acceptInvitation,
  completeDraft,
  obligationPath,
  publishSeedForm,
} from '@/test/api-helpers';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';

const latestNotification = (recipientId: string, eventType: string) =>
  getDb()
    .notifications.filter(
      (notification) =>
        notification.recipientId === recipientId &&
        notification.eventType === eventType,
    )
    .at(-1);

describe('several focal persons on one report', () => {
  it('records who saved the draft and names them on a conflict', async () => {
    await publishSeedForm();
    await signInAs('administrator');
    await request('/api/settings/users', peopleSchema, {
      method: 'POST',
      json: {
        displayName: 'Grace Deputy',
        email: 'grace.demo-001@example.invalid',
        jobTitle: 'Deputy IAO',
        role: 'institution',
        institutionId: 'DEMO-001',
      },
    });
    await signInAs('focal-demo-001');
    const { draft, answers } = await completeDraft('DEMO-001');
    expect(draft.savedBy).toBe('Focal person, DEMO-001');

    // Grace started from the empty report and saves after her colleague.
    await acceptInvitation('grace.demo-001@example.invalid');
    await expect(
      request(`${obligationPath('DEMO-001')}/draft`, z.unknown(), {
        method: 'PUT',
        json: { baseVersion: 0, answers },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'version_conflict',
      message: expect.stringMatching(
        /^Focal person, DEMO-001 saved this report at \d\d:\d\d EAT on 2026-10-01\. Reload to see their changes/,
      ),
    });

    // Colleagues see each other on the institution's profile.
    const profile = await request(
      '/api/institution-profile',
      institutionProfileSchema,
    );
    expect(profile.focalPersons.map((person) => person.displayName)).toEqual([
      'Focal person, DEMO-001',
      'Grace Deputy',
    ]);
    expect(profile.reviewingOfficer).toBe('Prevention Officer A');
  });
});

describe('an institution with no active focal person', () => {
  it('asks the administrator to confirm, then flags it to officer and supervisor', async () => {
    await signInAs('administrator');
    const deactivate = (confirmNoFocalPerson?: boolean) =>
      request('/api/settings/users/focal-demo-003/status', peopleSchema, {
        method: 'POST',
        json: {
          active: false,
          reason: 'Left the institution this week.',
          confirmNoFocalPerson,
        },
      });
    await expect(deactivate()).rejects.toMatchObject({
      status: 409,
      code: 'last_focal_person',
    });
    await deactivate(true);

    await signInAs('officer-a');
    const institution = await request(
      '/api/institutions/DEMO-003',
      institutionSchema,
    );
    expect(institution.activeFocalPersons).toBe(0);

    await signInAs('administrator');
    await request('/api/simulation/advance', simulationStateSchema, {
      method: 'POST',
      json: { boundaryId: 'Q1-reminder-7' },
    });
    expect(latestNotification('officer-a', 'review.digest')?.body).toMatch(
      /1 institution has no active focal person to report or answer clarifications \(DEMO-003\)/,
    );
    expect(latestNotification('supervisor', 'oversight.digest')?.body).toMatch(
      /1 institution has no active focal person \(DEMO-003\)/,
    );
  });
});

describe('the institution keeps its Accounting Officer contact current', () => {
  it('lets a focal person update it, audited, with the officer told', async () => {
    await signInAs('focal-demo-002');
    const update = (json: object) =>
      request('/api/institution-profile/accounting-officer', z.unknown(), {
        method: 'PUT',
        json,
      });
    await expect(
      update({
        name: 'New AO',
        designation: 'Director General',
        email: 'new.ao@gmail.com',
        phone: '',
      }),
    ).rejects.toMatchObject({ status: 422 });
    await update({
      name: 'Accounting Officer (acting), DEMO-002',
      designation: 'Acting Managing Director',
      email: 'acting.ao.demo-002@example.invalid',
      phone: '+254 700 000 002',
    });
    const profile = await request(
      '/api/institution-profile',
      institutionProfileSchema,
    );
    expect(profile.institution.accountingOfficer).toMatchObject({
      name: 'Accounting Officer (acting), DEMO-002',
      designation: 'Acting Managing Director',
    });
    expect(latestNotification('officer-a', 'institution.updated')?.title).toBe(
      'DEMO-002 updated its Accounting Officer contact',
    );
    expect(getDb().audit.at(-1)).toMatchObject({
      action: 'institution.accounting_officer',
    });

    // Only the institution's own focal persons use this route.
    await signInAs('officer-a');
    await expect(
      update({
        name: 'Someone Else',
        designation: 'Director',
        email: '',
        phone: '',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
