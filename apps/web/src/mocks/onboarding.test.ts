// @vitest-environment node
import {
  calendarSettingsSchema,
  institutionImportPreviewSchema,
  institutionImportResultSchema,
  obligationsSchema,
  peopleSchema,
  planSchema,
  reportBundleSchema,
  simulationStateSchema,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { request } from '@/lib/api';
import { publishSeedForm } from '@/test/api-helpers';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';
import { countDays, shiftDays } from './services/days';
import { responseDueAt } from './services/clarifications';

const holidays = [{ date: '2026-10-20', name: 'Mashujaa Day' }];
const working = { mode: 'working' as const, holidays };
const calendarDays = { mode: 'calendar' as const, holidays };

describe('day counting (PRD §9.1)', () => {
  it('counts calendar days or working days without weekends and holidays', () => {
    // Fri 16 Oct 2026 + 3 working days skips the weekend and Mashujaa Day (Tue 20 Oct).
    expect(shiftDays('2026-10-16', 3, working)).toBe('2026-10-22');
    expect(shiftDays('2026-10-16', 3, calendarDays)).toBe('2026-10-19');
    expect(shiftDays('2026-10-22', -3, working)).toBe('2026-10-16');
    expect(countDays('2026-10-15', '2026-10-19', working)).toBe(2);
    expect(countDays('2026-10-15', '2026-10-19', calendarDays)).toBe(4);
    // The PRD §9.1 rule: 15 calendar days after 30 September is 15 October.
    expect(shiftDays('2026-09-30', 15, calendarDays)).toBe('2026-10-15');
  });

  it('gives working-day clarification windows once enforced', () => {
    const rule = {
      ...working,
      reportingDays: 15,
      clarificationDays: 7,
    };
    // Thu 1 Oct 2026 + 7 working days = Mon 12 Oct.
    expect(
      responseDueAt(
        '2026-10-01T08:00:00+03:00',
        '2026-10-01T08:00:00+03:00',
        rule,
      ),
    ).toBe('2026-10-12T23:59:59+03:00');
  });
});

describe('enforcing working days (FR02)', () => {
  it('recalculates unopened deadlines from the rule, keeps opened ones and labels lateness', async () => {
    await signInAs('administrator');
    const current = await request(
      '/api/settings/calendar',
      calendarSettingsSchema,
    );
    const saved = await request(
      '/api/settings/calendar',
      calendarSettingsSchema,
      {
        method: 'PUT',
        json: {
          deadlines: Object.fromEntries(
            current.periods.map((period) => [period.id, period.deadlineDate]),
          ),
          foundationDeadlineDate: current.foundationDeadlineDate,
          evaluationCutoffDate: current.evaluationCutoffDate,
          reminders: current.reminders,
          dayCounting: { ...current.dayCounting, mode: 'working' },
          applyRuleToDeadlines: true,
          reason: 'The organizer confirmed working days for this cycle.',
        },
      },
    );
    // Q1 has opened: its 15 October deadline stays.
    expect(saved.periods[0]!.deadlineDate).toBe('2026-10-15');
    // Q2: 15 working days after 31 Dec 2026, skipping 1 Jan and weekends.
    expect(saved.periods[1]!.deadlineDate).toBe('2027-01-22');
    expect(saved.ruleDeadlines['FY2026-27-Q2']).toBe('2027-01-22');
    expect(saved.changes[0]!.summary).toMatch(/calendar → working days/);

    // A report on Monday 19 Oct is two working days late (Fri 16, Mon 19).
    await publishSeedForm();
    getDb().businessTime = '2026-10-19T10:00:00+03:00';
    await signInAs('focal-demo-002');
    const obligations = await request(
      '/api/obligations?institutionId=DEMO-002',
      obligationsSchema,
    );
    expect(obligations[0]!.daysLateUnit).toBe('working');
  });
});

describe('onboarding institutions (FR01)', () => {
  const create = (json: object) =>
    request('/api/settings/institutions', peopleSchema, {
      method: 'POST',
      json,
    });
  const newInstitution = {
    id: 'MDA-101',
    name: 'Demo Ports Authority',
    typeId: 'state-corporation',
    officerId: 'officer-b',
    accountingOfficer: {
      name: 'Accounting Officer, MDA-101',
      designation: 'Managing Director',
      email: 'ao.mda-101@example.invalid',
      phone: '',
    },
    focalUser: {
      displayName: 'Focal person, MDA-101',
      email: 'focal.mda-101@example.invalid',
      jobTitle: 'Integrity Assurance Officer',
    },
    seedOpenedQuarters: true,
  };

  it('creates an institution that can report straight away', async () => {
    await publishSeedForm();
    const people = await create(newInstitution);
    expect(
      people.institutions.find((item) => item.id === 'MDA-101'),
    ).toMatchObject({ name: 'Demo Ports Authority', active: true });
    await expect(create(newInstitution)).rejects.toMatchObject({
      status: 422,
    });

    // Q1 has opened: a seeded historical baseline awaits confirmation; Q2–Q4 are proposed.
    await signInAs('officer-b');
    const plan = await request('/api/institutions/MDA-101/plan', planSchema);
    expect(plan.baselines.map((baseline) => baseline.status)).toEqual([
      'approved',
      'proposed',
      'proposed',
      'proposed',
    ]);
    expect(plan.baselines[0]!.historicalSeed?.confirmedAt).toBeNull();
    expect(plan.baselines[1]!.milestones.every((m) => m.mandatory)).toBe(true);

    const focal = getDb().users.find(
      (user) => user.email === 'focal.mda-101@example.invalid',
    )!;
    await signInAs(focal.id);
    const q1 = await request(
      `/api/obligations/${encodeURIComponent('MDA-101:FY2026-27-Q1')}/report`,
      reportBundleSchema,
    );
    expect(q1.editable).toBe(true);
    expect(q1.baseline.milestones).toHaveLength(2);
  });

  it('previews a CSV import row by row and imports all or nothing', async () => {
    await signInAs('administrator');
    const header =
      'institution_id,name,type,officer_email,ao_name,ao_designation,ao_email,ao_phone,focal_name,focal_email';
    const good = [
      'MDA-201,Demo Tea Board,State corporation,officer.a@example.invalid,AO MDA-201,Managing Director,,,Focal person MDA-201,focal.mda-201@example.invalid',
      '"MDA-202","Demo Fisheries Service, Coast",state agency,officer.b@example.invalid,AO MDA-202,Director General,,,,',
    ];
    const bad = [
      'DEMO-001,Duplicate,State agency,officer.a@example.invalid,AO,Director General,,,,',
      'mda203,Bad ID,Space agency,nobody@example.invalid,,,,,,',
      'MDA-201,Repeated in file,State agency,officer.a@example.invalid,AO MDA-201b,Director,,,,',
    ];
    const preview = (csv: string) =>
      request(
        '/api/settings/institutions/import/preview',
        institutionImportPreviewSchema,
        { method: 'POST', json: { csv, seedOpenedQuarters: true } },
      );
    const checked = await preview([header, ...good, ...bad].join('\n'));
    expect(checked).toMatchObject({ valid: 2, invalid: 3 });
    expect(checked.rows[1]!.name).toBe('Demo Fisheries Service, Coast');
    expect(checked.rows[2]!.errors[0]).toMatch(/already in use/);
    expect(checked.rows[3]!.errors.join(' ')).toMatch(/three digits/);
    expect(checked.rows[3]!.errors.join(' ')).toMatch(
      /active prevention officer/,
    );
    expect(checked.rows[4]!.errors[0]).toMatch(/already in use/);
    expect((await preview('name,type\nX,Y')).fileErrors[0]).toMatch(
      /Missing columns: institution_id, officer_email, ao_name, ao_designation/,
    );

    const importCsv = (csv: string) =>
      request(
        '/api/settings/institutions/import',
        institutionImportResultSchema,
        {
          method: 'POST',
          json: { csv, seedOpenedQuarters: true },
        },
      );
    await expect(
      importCsv([header, ...good, ...bad].join('\n')),
    ).rejects.toMatchObject({ status: 422, code: 'import_invalid' });
    expect(getDb().institutions).toHaveLength(8);
    const result = await importCsv([header, ...good].join('\n'));
    expect(result).toEqual({ created: ['MDA-201', 'MDA-202'], focalUsers: 1 });
    expect(getDb().obligations).toHaveLength(40);
  });

  it('restores the seeded institutions when a new run starts', async () => {
    await signInAs('administrator');
    await create(newInstitution);
    await request('/api/simulation/reset', simulationStateSchema, {
      method: 'POST',
    });
    // A new run restores the seeded fixture set (PRD FR14); onboarding is repeated per run.
    expect(getDb().institutions.map((item) => item.id)).not.toContain(
      'MDA-101',
    );
  });
});
