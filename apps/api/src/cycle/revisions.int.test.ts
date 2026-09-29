import { desc, eq } from 'drizzle-orm';
import type {
  Completeness,
  Cycle,
  FormValidation,
  FormVersion,
  Plan,
  Question,
  RiskScaleSettings,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, formVersions, notifications } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import { publishSeedForm } from '../test/journeys';

/**
 * Ported from apps/web/src/mocks/forms.test.ts and settings.test.ts (FR03, O16): form version
 * revisions and the declared risk scale.
 */
describe.skipIf(!integration)('form revisions and the risk scale', () => {
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

  const LATER = ['FY2026-27-Q2', 'FY2026-27-Q3', 'FY2026-27-Q4'];
  const staff: Question = {
    id: 'staff-trained',
    label: 'Staff trained',
    type: 'number',
    required: true,
    kind: 'informational',
    limits: { min: 0, max: 500, integer: true, unit: 'staff' },
  };
  const lastAudit = async () =>
    (
      await api.db
        .select()
        .from(auditEvents)
        .orderBy(desc(auditEvents.seq))
        .limit(1)
    )[0];

  async function newDraft() {
    await publishSeedForm(admin);
    return (await admin.post('/forms')).body as FormVersion;
  }
  const save = (
    draft: FormVersion,
    sections: FormVersion['sections'],
    baseRevision = draft.revision,
  ) =>
    admin.put(`/forms/${draft.id}`, {
      title: draft.title,
      periodIds: LATER,
      sections,
      weights: draft.weights,
      baseRevision,
    });
  const withQuestions = (draft: FormVersion, extra: Question[]) =>
    draft.sections.map((section) =>
      section.id === 'issues-and-remarks'
        ? { ...section, questions: [...section.questions, ...extra] }
        : section,
    );

  it('refuses a stale save, audits every save and summarizes the changes', async () => {
    const draft = await newDraft();
    const saved = (await save(draft, withQuestions(draft, [staff])))
      .body as FormVersion;
    expect(saved.revision).toBe(1);
    expect(saved.changes[0]).toMatchObject({
      kind: 'added',
      id: 'staff-trained',
    });
    expect(await save(draft, withQuestions(draft, [staff]))).toMatchObject({
      status: 409,
      body: { code: 'version_conflict' },
    });
    expect(await lastAudit()).toMatchObject({
      action: 'form.draft_save',
      summary: 'Draft version 2 saved: 1 question added (Staff trained)',
    });
    await admin.post(`/forms/${draft.id}/publish`);
    const body = (
      await api.db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientId, 'supervisor'))
    ).find((item) => item.eventId === `${draft.id}:published`)?.body;
    expect(body).toBe(
      'Q2, Q3, Q4 will use version 2. Changes from version 1: 1 question added (Staff trained).',
    );
  });

  it('never lets a retired ID return as a different question, and checks new types', async () => {
    const draft = await newDraft();
    const sections = withQuestions(draft, [
      {
        id: 'controls',
        label: 'Controls in place',
        type: 'checklist',
        required: true,
        kind: 'informational',
        items: [],
      },
    ]).map((section) => ({
      ...section,
      questions: section.questions.map((question) =>
        question.id === 'remarks'
          ? { ...question, type: 'number' as const }
          : question,
      ),
    }));
    await save(draft, sections);
    const { issues } = await admin.json<FormValidation>(
      `/forms/${draft.id}/validation`,
    );
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'Question ID "remarks" was a long text question in version 1. A different question needs a new ID.',
        'A checklist needs at least one item.',
      ]),
    );
  });

  it('enforces answer limits in the completeness check', async () => {
    const draft = await newDraft();
    await save(draft, withQuestions(draft, [staff]));
    await admin.post(`/forms/${draft.id}/publish`);
    await admin.post('/simulation/advance', { boundaryId: 'Q2-open' });
    const focal = await api.client().signIn('focal-demo-003');
    const path = `/obligations/${encodeURIComponent('DEMO-003:FY2026-27-Q2')}`;
    const report = await focal.json<{
      draft: { version: number } | null;
      form: FormVersion;
    }>(`${path}/report`);
    expect(report.form.version).toBe(2);
    await focal.put(`${path}/draft`, {
      baseVersion: report.draft?.version ?? 0,
      answers: { questions: { 'staff-trained': '900' }, milestones: {} },
    });
    const check = await focal.json<Completeness>(`${path}/completeness`);
    expect(check.missing).toContainEqual({
      field: 'questions.staff-trained',
      label: 'Staff trained',
      message: 'Enter a number from 0 to 500 staff.',
    });
  });

  it('discards a draft with a reason, but never the first or a published version', async () => {
    const discard = (id: string, reason = 'Started by mistake, not needed.') =>
      admin.delete(`/forms/${id}`, { reason });
    expect(await discard('form-v1')).toMatchObject({
      status: 409,
      body: { code: 'first_version' },
    });
    const draft = await newDraft();
    expect(await discard('form-v1')).toMatchObject({
      status: 409,
      body: { code: 'version_locked' },
    });
    expect((await discard(draft.id, 'short')).status).toBe(422);
    expect((await discard(draft.id)).status).toBe(204);
    expect(
      (await api.db.select({ id: formVersions.id }).from(formVersions)).map(
        (row) => row.id,
      ),
    ).toEqual(['form-v1']);
    expect(await lastAudit()).toMatchObject({
      action: 'form.discard',
      summary: 'Draft version 2 discarded: Started by mistake, not needed.',
    });
    expect((await admin.post('/forms')).status).toBe(201);
  });

  it('labels the risk scale, refusing a repeated label, and keeps severity a number', async () => {
    const current = (
      await admin.json<RiskScaleSettings>('/settings/risk-scale')
    ).riskScale;
    expect(current.probability[2]).toBe('Possible');
    const reason = 'Labels confirmed against the EACC template.';
    expect(
      await admin.put('/settings/risk-scale', {
        ...current,
        impact: ['Low', 'Low', 'Moderate', 'Major', 'Severe'],
        reason,
      }),
    ).toMatchObject({
      status: 422,
      body: {
        fieldErrors: { impact: 'Give each point of the scale its own label.' },
      },
    });
    expect(
      await admin.put('/settings/risk-scale', { ...current, reason }),
    ).toMatchObject({ status: 422, body: { code: 'no_change' } });
    const saved = (
      await admin.put('/settings/risk-scale', {
        probability: ['Very low', 'Low', 'Medium', 'High', 'Very high'],
        impact: current.impact,
        source: 'EACC risk assessment template, 23rd Cycle guidelines, page 4.',
        reason,
      })
    ).body as RiskScaleSettings;
    expect(saved.changes[0]).toMatchObject({
      summary:
        'Probability labels → 1 Very low, 2 Low, 3 Medium, 4 High, 5 Very high; Source → EACC risk assessment template, 23rd Cycle guidelines, page 4.',
      reason,
    });
    expect((await lastAudit())?.action).toBe('settings.risk_scale');
    const officer = await api.client().signIn('officer-a');
    expect((await officer.request('/settings/risk-scale')).status).toBe(403);
    const focal = await api.client().signIn('focal-demo-001');
    expect(
      (await focal.json<Cycle>('/cycles/current')).riskScale.probability[4],
    ).toBe('Very high');
    expect(
      (await focal.json<Plan>('/institutions/DEMO-001/plan')).risks[0],
    ).toMatchObject({ probability: 3, severity: 12 });
  });
});
