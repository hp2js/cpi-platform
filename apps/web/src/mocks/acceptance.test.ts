// @vitest-environment node
import {
  annualOverviewSchema,
  formVersionSchema,
  receiptSchema,
  reportBundleSchema,
  reviewBundleSchema,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
import {
  completeDraft,
  obligationPath,
  publishSeedForm,
  submitDraft,
  submittedQ1,
} from '@/test/api-helpers';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';

/** Mandatory scenarios (PRD §16.1) not covered by a single journey test elsewhere. */

describe('form versions (AT04, AT05)', () => {
  it('shows a new question without a deployment and leaves an earlier submission unchanged', async () => {
    const item = await submittedQ1();
    const before = await request(
      `/api/reviews/${item.submissionId}`,
      reviewBundleSchema,
    );

    await signInAs('administrator');
    const draft = await request('/api/forms', formVersionSchema, {
      method: 'POST',
    });
    const sections = draft.sections.map((section) =>
      section.id === 'issues-and-remarks'
        ? {
            ...section,
            questions: [
              ...section.questions,
              {
                id: 'budget-note',
                label: 'Budget spent on prevention this quarter',
                type: 'text' as const,
                required: false,
                kind: 'informational' as const,
              },
            ],
          }
        : section,
    );
    await request(`/api/forms/${draft.id}`, formVersionSchema, {
      method: 'PUT',
      json: {
        title: draft.title,
        periodIds: ['FY2026-27-Q2', 'FY2026-27-Q3', 'FY2026-27-Q4'],
        sections,
        weights: draft.weights,
      },
    });
    await request(`/api/forms/${draft.id}/publish`, formVersionSchema, {
      method: 'POST',
    });

    // AT04: the institution sees the new question on a future quarter.
    await signInAs('focal-demo-001');
    const q2 = await request(
      `${obligationPath('DEMO-001', 2)}/report`,
      reportBundleSchema,
    );
    expect(q2.form?.version).toBe(2);
    expect(
      (q2.form?.sections ?? []).flatMap((section) =>
        section.questions.map((question) => question.id),
      ),
    ).toContain('budget-note');

    // AT05: the submitted Q1 revision, its form and its calculation are unchanged.
    await signInAs('officer-a');
    const after = await request(
      `/api/reviews/${item.submissionId}`,
      reviewBundleSchema,
    );
    expect(after.form.version).toBe(1);
    expect(after.answers).toEqual(before.answers);
    expect(after.score.provisional).toEqual(before.score.provisional);
  });
});

describe('deadline boundary (AT11)', () => {
  it('treats the last second as on time and the next as one day late', async () => {
    await publishSeedForm();
    const submitAt = async (institutionId: string, at: string) => {
      await signInAs(`focal-${institutionId.toLowerCase()}`);
      const { draft } = await completeDraft(institutionId);
      getDb().businessTime = at;
      return submitDraft(institutionId, draft.version);
    };
    const onTime = await submitAt('DEMO-002', '2026-10-15T23:59:59+03:00');
    const late = await submitAt('DEMO-003', '2026-10-16T00:00:00+03:00');
    expect(receiptSchema.parse(onTime)).toMatchObject({
      timeliness: 'on_time',
      daysLate: 0,
    });
    expect(late).toMatchObject({ timeliness: 'late', daysLate: 1 });
  });
});

describe('release readiness (AT14)', () => {
  it('blocks publication while a quarter awaits officer review', async () => {
    await submittedQ1();
    getDb().businessTime = '2027-08-01T09:00:00+03:00';
    await signInAs('administrator');
    const annual = await request('/api/annual', annualOverviewSchema);
    const demo1 = annual.institutions.find(
      (row) => row.institutionId === 'DEMO-001',
    )!;
    expect(demo1.releasable).toBe(false);
    expect(demo1.quarters[0]!.status).toBe('awaiting_review');
    await expect(
      request('/api/annual/publish', z.unknown(), {
        method: 'POST',
        json: { institutionIds: ['DEMO-001'] },
      }),
    ).rejects.toMatchObject({ status: 422, code: 'not_releasable' });
  });
});
