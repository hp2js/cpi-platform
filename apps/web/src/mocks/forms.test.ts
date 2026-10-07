// @vitest-environment node
import {
  formCheckSchema,
  formCreationSchema,
  formValidationSchema,
  formVersionSchema,
  type FormVersion,
  type Question,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
import { publishSeedForm } from '@/test/api-helpers';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';
import { completeness } from './services/reporting';

const LATER = ['FY2026-27-Q2', 'FY2026-27-Q3', 'FY2026-27-Q4'];

async function newDraft() {
  await publishSeedForm();
  await signInAs('administrator');
  return request('/api/forms', formVersionSchema, { method: 'POST' });
}

const save = (
  draft: FormVersion,
  sections: FormVersion['sections'],
  baseRevision = draft.revision,
) =>
  request(`/api/forms/${draft.id}`, formVersionSchema, {
    method: 'PUT',
    json: {
      title: draft.title,
      periodIds: LATER,
      sections,
      weights: draft.weights,
      baseRevision,
    },
  });

const withQuestions = (draft: FormVersion, extra: Question[]) =>
  draft.sections.map((section) =>
    section.id === 'issues-and-remarks'
      ? { ...section, questions: [...section.questions, ...extra] }
      : section,
  );

const validation = (id: string) =>
  request(`/api/forms/${id}/validation`, formValidationSchema);

const trainings: Question = {
  id: 'trainings',
  label: 'Trainings held this quarter',
  type: 'repeated',
  required: true,
  kind: 'informational',
  minRows: 1,
  maxRows: 10,
  columns: [
    { id: 'column-1', label: 'Date', type: 'date', required: true },
    {
      id: 'column-2',
      label: 'Staff attending',
      type: 'number',
      required: true,
      limits: { min: 1, max: 500 },
    },
  ],
};
const controls: Question = {
  id: 'controls',
  label: 'Controls in place',
  type: 'checklist',
  required: true,
  kind: 'informational',
  items: [
    { id: 'item-1', label: 'Gift register kept' },
    { id: 'item-2', label: 'Declarations filed' },
  ],
};
const staff: Question = {
  id: 'staff-trained',
  label: 'Staff trained',
  type: 'number',
  required: true,
  kind: 'informational',
  limits: { min: 0, max: 500, integer: true, unit: 'staff' },
};

describe('revising the form (FR03)', () => {
  it('refuses a stale save, and audits every saved draft', async () => {
    const draft = await newDraft();
    const saved = await save(draft, withQuestions(draft, [staff]));
    expect(saved.revision).toBe(1);
    await expect(
      save(draft, withQuestions(draft, [controls])),
    ).rejects.toMatchObject({ status: 409, code: 'version_conflict' });
    expect(getDb().audit.at(-1)).toMatchObject({
      action: 'form.draft_save',
      summary: 'Draft version 2 saved: 1 question added (Staff trained)',
    });
  });

  it('never lets a retired ID return as a different question', async () => {
    const draft = await newDraft();
    // "remarks" was long text in version 1; here it comes back as a number.
    const sections = draft.sections.map((section) => ({
      ...section,
      questions: section.questions.map((question) =>
        question.id === 'remarks'
          ? { ...question, type: 'number' as const }
          : question,
      ),
    }));
    const saved = await save(draft, sections);
    expect((await validation(saved.id)).issues).toContainEqual({
      path: 'sections.2.questions.2.id',
      message:
        'Question ID "remarks" was a long text question in version 1. A different question needs a new ID.',
    });
  });

  it('summarizes the changes and tells institutions, officers and supervisors', async () => {
    const draft = await newDraft();
    const sections = withQuestions(draft, [staff]).map((section) => ({
      ...section,
      questions: section.questions
        .filter((question) => question.id !== 'remarks')
        .map((question) =>
          question.id === 'emerging-issues'
            ? { ...question, label: 'Emerging issues this quarter' }
            : question,
        ),
    }));
    const saved = await save(draft, sections);
    expect(saved.changes).toEqual([
      {
        kind: 'changed',
        target: 'question',
        id: 'emerging-issues',
        label: 'Emerging issues this quarter',
        details: ['Wording changed'],
      },
      {
        kind: 'added',
        target: 'question',
        id: 'staff-trained',
        label: 'Staff trained',
        details: ['In “Emerging issues and remarks”'],
      },
      {
        kind: 'removed',
        target: 'question',
        id: 'remarks',
        label: 'Other remarks',
        details: [],
      },
      {
        kind: 'periods',
        target: 'form',
        id: 'periods',
        label: 'Quarters',
        details: ['Q2, Q3, Q4 will use version 2', 'Q1 keeps version 1'],
      },
    ]);
    await request(`/api/forms/${saved.id}/publish`, formVersionSchema, {
      method: 'POST',
    });
    const body = (recipientId: string) =>
      getDb()
        .notifications.filter(
          (item) =>
            item.recipientId === recipientId &&
            item.eventType === 'form.published',
        )
        .at(-1)?.body;
    const expected =
      'Q2, Q3, Q4 will use version 2. Changes from version 1: 1 question added (Staff trained), 1 question changed (Emerging issues this quarter), 1 question removed (Other remarks).';
    expect(body('supervisor')).toBe(expected);
    expect(body('officer-a')).toBe(expected);
    expect(
      getDb().notifications.some(
        (item) =>
          item.eventType === 'form.published' &&
          item.body === expected &&
          getDb().users.find((user) => user.id === item.recipientId)?.role ===
            'institution',
      ),
    ).toBe(true);
  });

  it('discards a draft with a reason, but never the first or a published version', async () => {
    await signInAs('administrator');
    const discard = (id: string, reason = 'Started by mistake, not needed.') =>
      request(`/api/forms/${id}`, z.unknown(), {
        method: 'DELETE',
        json: { reason },
      });
    await expect(discard('form-v1')).rejects.toMatchObject({
      status: 409,
      code: 'first_version',
    });
    const draft = await newDraft();
    await expect(discard('form-v1')).rejects.toMatchObject({
      status: 409,
      code: 'version_locked',
    });
    await expect(discard(draft.id, 'short')).rejects.toMatchObject({
      status: 422,
    });
    await discard(draft.id);
    expect(getDb().forms.map((form) => form.id)).toEqual(['form-v1']);
    expect(getDb().audit.at(-1)).toMatchObject({
      action: 'form.discard',
      summary: 'Draft version 2 discarded: Started by mistake, not needed.',
    });
    // A new version can start again straight away.
    expect(
      (await request('/api/forms', formVersionSchema, { method: 'POST' }))
        .version,
    ).toBe(2);
  });
});

describe('checklists, repeated rows and answer limits (FR03)', () => {
  it('checks the configuration before publication', async () => {
    const draft = await newDraft();
    const saved = await save(
      draft,
      withQuestions(draft, [
        { ...controls, items: [] },
        {
          ...trainings,
          minRows: 5,
          maxRows: 2,
          columns: [
            { id: 'column-1', label: '', type: 'choice', required: true },
          ],
        },
        { ...staff, limits: { min: 10, max: 1 } },
        {
          id: 'note',
          label: 'Note',
          type: 'text',
          required: false,
          kind: 'informational',
          limits: { min: 1 },
        },
      ]),
    );
    const messages = (await validation(saved.id)).issues.map(
      (issue) => issue.message,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        'A checklist needs at least one item.',
        'Give every column a label.',
        'A choice column needs at least two options.',
        'The fewest rows must not be more than the most rows.',
        'The lowest value must not be above the highest.',
        'A range, whole numbers or a unit apply only to numbers.',
      ]),
    );
  });

  it('separates missing answers and broken limits from complete ones', async () => {
    const draft = await newDraft();
    const form = {
      ...draft,
      sections: withQuestions(draft, [staff, controls, trainings]),
    };
    const check = (questions: Record<string, unknown>) =>
      completeness(
        form,
        [],
        {
          questions: {
            'cpc-minutes': {
              evidenceIds: [],
              unavailable: { explanation: 'Awaiting signatures this week.' },
            },
            'iao-minutes': {
              evidenceIds: [],
              unavailable: { explanation: 'Awaiting signatures this week.' },
            },
            'emerging-issues': 'None.',
            'actions-planned': 'None.',
            ...questions,
          } as never,
          milestones: {},
        },
        [],
      ).missing.map((item) => `${item.label}: ${item.message}`);

    expect(
      check({
        'staff-trained': '12.5',
        controls: { items: { 'item-1': true, 'item-2': null } },
        trainings: { rows: [] },
      }),
    ).toEqual([
      'Staff trained: Enter a whole number.',
      'Controls in place: Mark every item done or not done (1 left).',
      'Trainings held this quarter: Add at least one row.',
    ]);
    expect(
      check({
        'staff-trained': '900',
        controls: { items: { 'item-1': true, 'item-2': false } },
        trainings: {
          rows: [{ 'column-1': '2026-10-12', 'column-2': '0' }],
        },
      }),
    ).toEqual([
      'Staff trained: Enter a number from 0 to 500 staff.',
      'Trainings held this quarter, row 1: Staff attending: Enter a number from 1 to 500.',
    ]);
    expect(
      check({
        'staff-trained': '40',
        controls: { items: { 'item-1': true, 'item-2': false } },
        trainings: {
          rows: [{ 'column-1': '2026-10-12', 'column-2': '35' }],
        },
      }),
    ).toEqual([]);
  });

  it('checks unsaved edits, linked to their fields, with the publication impact (HP2-70)', async () => {
    const draft = await newDraft();
    const sections = structuredClone(draft.sections);
    sections[0]!.questions[0]!.label = ' ';
    const check = await request(
      `/api/forms/${draft.id}/check`,
      formCheckSchema,
      {
        method: 'POST',
        json: {
          title: draft.title,
          periodIds: ['FY2026-27-Q1', 'FY2026-27-Q3', 'FY2026-27-Q4'],
          sections,
        },
      },
    );
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
    expect(getDb().forms.find((form) => form.id === draft.id)?.revision).toBe(
      draft.revision,
    );
  });

  it('explains when no period is left for a new version (HP2-70)', async () => {
    await publishSeedForm();
    await signInAs('administrator');
    const creation = () => request('/api/forms/creation', formCreationSchema);
    expect(await creation()).toMatchObject({ allowed: true, reason: null });
    getDb().businessTime = '2027-08-01T09:00:00+03:00';
    const refused = await creation();
    expect(refused).toMatchObject({ allowed: false, assignablePeriods: [] });
    expect(refused.reason).toMatch(/Every period in this cycle has started/);
    await expect(
      request('/api/forms', formVersionSchema, { method: 'POST' }),
    ).rejects.toMatchObject({ status: 409, code: 'no_assignable_period' });
  });
});
