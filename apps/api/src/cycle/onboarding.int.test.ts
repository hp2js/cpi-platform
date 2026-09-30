import { and, count, eq } from 'drizzle-orm';
import type {
  InstitutionImportPreview,
  InstitutionProfile,
  People,
  Plan,
  ReportBundle,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  auditEvents,
  institutions,
  notifications,
  obligations,
} from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import {
  STRONG_PASSWORD,
  emailedToken,
  obligationPath,
  publishSeedForm,
} from '../test/journeys';

const newInstitution = {
  id: 'MDA-101',
  name: 'Demo Ports Authority',
  typeId: 'state-corporation',
  officerId: 'officer-b',
  supervisorId: 'supervisor',
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

/** Ported from apps/web/src/mocks/onboarding.test.ts and focal.test.ts (FR01). */
describe.skipIf(!integration)('onboarding institutions', () => {
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

  const counted = async (table: typeof institutions | typeof obligations) =>
    (await api.db.select({ n: count() }).from(table))[0]!.n;

  it('creates an institution that can report straight away', async () => {
    await publishSeedForm(admin);
    const created = await admin.post('/settings/institutions', newInstitution);
    expect(created.status).toBe(201);
    expect(
      (created.body as People).institutions.find(
        (item) => item.id === 'MDA-101',
      ),
    ).toMatchObject({
      name: 'Demo Ports Authority',
      type: 'State corporation',
      active: true,
      officer: { id: 'officer-b' },
      supervisor: { id: 'supervisor' },
      focalPersons: [
        { email: 'focal.mda-101@example.invalid', status: 'invited' },
      ],
    });
    expect(
      await admin.post('/settings/institutions', newInstitution),
    ).toMatchObject({ status: 422, body: { code: 'invalid_institution' } });

    // Q1 has opened: a seeded historical baseline awaits confirmation. Q2–Q4 start with an
    // empty plan for the institution to fill in and propose (FR04).
    const officer = await api.client().signIn('officer-b');
    const plan = await officer.json<Plan>('/institutions/MDA-101/plan');
    expect(plan.baselines.map((baseline) => baseline.status)).toEqual([
      'approved',
    ]);
    expect(plan.baselines[0]!.historicalSeed?.confirmedAt).toBeNull();
    expect(plan.baselines[0]!.milestones.every((m) => m.mandatory)).toBe(true);
    expect(plan).toMatchObject({
      approval: null,
      risks: [],
      activities: [],
      plannedMilestones: [],
    });
    expect(plan.proposals.map((proposal) => proposal.status)).toEqual([
      'approved',
      'not_proposed',
      'not_proposed',
      'not_proposed',
    ]);
    expect(
      (
        await api.db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.recipientId, 'officer-b'),
              eq(notifications.eventType, 'assignment.changed'),
            ),
          )
      ).map((row) => row.title),
    ).toEqual(['MDA-101 assigned to you']);

    const focal = api.client();
    const token = await emailedToken(admin, 'focal.mda-101@example.invalid');
    await focal.post(`/auth/tokens/${token}`, { password: STRONG_PASSWORD });
    const q1 = await focal.json<ReportBundle>(
      `${obligationPath('MDA-101')}/report`,
    );
    expect(q1.editable).toBe(true);
    expect(q1.baseline.milestones).toHaveLength(2);
  });

  it('previews a CSV import row by row and imports all or nothing', async () => {
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
    const preview = async (csv: string) =>
      (
        await admin.post('/settings/institutions/import/preview', {
          csv,
          seedOpenedQuarters: true,
        })
      ).body as InstitutionImportPreview;
    const checked = await preview([header, ...good, ...bad].join('\n'));
    expect(checked).toMatchObject({ valid: 2, invalid: 3 });
    expect(checked.rows[1]!.name).toBe('Demo Fisheries Service, Coast');
    expect(checked.rows[1]!.supervisorName).toBe('Supervisor');
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
      admin.post('/settings/institutions/import', {
        csv,
        seedOpenedQuarters: true,
      });
    expect(await importCsv([header, ...good, ...bad].join('\n'))).toMatchObject(
      { status: 422, body: { code: 'import_invalid' } },
    );
    expect(await counted(institutions)).toBe(8);
    expect(await importCsv([header, ...good].join('\n'))).toMatchObject({
      status: 200,
      body: { created: ['MDA-201', 'MDA-202'], focalUsers: 1 },
    });
    expect(await counted(obligations)).toBe(40);
  });

  it('restores the seeded institutions when a new run starts', async () => {
    await admin.post('/settings/institutions', newInstitution);
    await admin.post('/simulation/reset');
    expect(await counted(institutions)).toBe(8);
  });

  it('manages institution types: rename relabels, retire keeps history', async () => {
    const people = (
      await admin.post('/settings/institution-types', {
        label: 'Tribunal',
        active: true,
      })
    ).body as People;
    expect(people.institutionTypes.at(-1)).toMatchObject({
      id: 'tribunal',
      label: 'Tribunal',
      institutionCount: 0,
    });
    expect(
      await admin.post('/settings/institution-types', {
        label: 'tribunal',
        active: true,
      }),
    ).toMatchObject({ status: 422 });
    const renamed = (
      await admin.put('/settings/institution-types/state-agency', {
        label: 'State department',
        active: true,
      })
    ).body as People;
    expect(
      renamed.institutions.find((item) => item.id === 'DEMO-001')?.type,
    ).toBe('State department');
    // A retired type stays on its institutions but cannot be newly chosen.
    await admin.put('/settings/institution-types/fund', {
      label: 'Fund',
      active: false,
    });
    expect(
      await admin.post('/settings/institutions', {
        ...newInstitution,
        typeId: 'fund',
      }),
    ).toMatchObject({ status: 422 });
    const kept = await admin.put('/settings/institutions/DEMO-007', {
      name: 'Demo Water Fund',
      typeId: 'fund',
      accountingOfficer: {
        name: 'Accounting Officer, DEMO-007',
        designation: 'Chief Executive',
        email: '',
        phone: '',
      },
    });
    expect(kept.status).toBe(200);
  });

  it('lets a focal person keep the Accounting Officer contact current', async () => {
    const focal = await api.client().signIn('focal-demo-002');
    const profile = await focal.json<InstitutionProfile>(
      '/institution-profile',
    );
    expect(profile).toMatchObject({
      institution: { id: 'DEMO-002', activeFocalPersons: 1 },
      reviewingOfficer: 'Prevention Officer A',
      focalPersons: [{ id: 'focal-demo-002', status: 'active' }],
    });
    expect(
      (
        await focal.put('/institution-profile/accounting-officer', {
          name: 'New AO',
          designation: 'Director General',
          email: 'new.ao@gmail.com',
          phone: '',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await focal.put('/institution-profile/accounting-officer', {
          name: 'Accounting Officer (acting), DEMO-002',
          designation: 'Acting Managing Director',
          email: 'acting.ao.demo-002@example.invalid',
          phone: '+254 700 000 002',
        })
      ).status,
    ).toBe(200);
    expect(
      (await focal.json<InstitutionProfile>('/institution-profile')).institution
        .accountingOfficer,
    ).toMatchObject({
      name: 'Accounting Officer (acting), DEMO-002',
      designation: 'Acting Managing Director',
    });
    const [audit] = await api.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'institution.accounting_officer'));
    expect(audit?.summary).toMatch(
      /changed from .* to Accounting Officer \(acting\)/,
    );
    // Only the institution's own focal persons use this route.
    const officer = await api.client().signIn('officer-a');
    expect(
      (
        await officer.put('/institution-profile/accounting-officer', {
          name: 'Someone Else',
          designation: 'Director',
          email: '',
          phone: '',
        })
      ).status,
    ).toBe(403);
  });
});
