import type {
  EvidenceItem,
  FormVersion,
  Milestone,
  MilestoneResponse,
  ReportAnswers,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { answerChanges } from './changes';

const form = {
  sections: [
    {
      id: 'minutes',
      title: 'Minutes',
      questions: [
        {
          id: 'cpc-minutes',
          label: 'Signed CPC minutes',
          type: 'evidence',
          required: true,
          kind: 'scored',
        },
        {
          id: 'remarks',
          label: 'Other remarks',
          type: 'long_text',
          required: false,
          kind: 'informational',
        },
      ],
    },
  ],
} as unknown as FormVersion;
const milestones = [{ id: 'm1', code: 'M-01' }] as Milestone[];
const evidence = [
  { id: 'e1', fileName: 'minutes-v1.pdf' },
  { id: 'e2', fileName: 'minutes-v2.pdf' },
] as EvidenceItem[];

const response = (patch: Partial<MilestoneResponse>): MilestoneResponse => ({
  completed: true,
  output: 'Register in use.',
  emergingIssues: '',
  actions: '',
  evidence: [{ evidenceId: 'e1', passage: 'Item 4' }],
  evidenceUnavailable: null,
  ...patch,
});
const answers = (
  questions: ReportAnswers['questions'],
  milestone: MilestoneResponse,
): ReportAnswers => ({ questions, milestones: { m1: milestone } });

describe('answerChanges', () => {
  it('reports nothing when the draft still matches the submitted revision', () => {
    const same = answers(
      { 'cpc-minutes': { evidenceIds: ['e1'], unavailable: null } },
      response({}),
    );
    expect(answerChanges(form, milestones, evidence, same, same)).toEqual([]);
  });

  it('lists each changed answer in plain words, with its field on the report page', () => {
    const before = answers(
      {
        'cpc-minutes': { evidenceIds: ['e1'], unavailable: null },
        remarks: '',
      },
      response({}),
    );
    const after = answers(
      {
        'cpc-minutes': { evidenceIds: ['e2'], unavailable: null },
        remarks: 'Minutes re-signed.',
      },
      response({
        completed: false,
        emergingIssues: 'Exception review not held.',
        evidence: [{ evidenceId: 'e2', passage: 'Item 6' }],
      }),
    );
    expect(
      answerChanges(form, milestones, evidence, before, after).map(
        ({ label, before: was, after: now }) => [label, was, now],
      ),
    ).toEqual([
      ['Signed CPC minutes', 'minutes-v1.pdf', 'minutes-v2.pdf'],
      ['Other remarks', 'Not answered', 'Minutes re-signed.'],
      ['M-01 completed', 'Completed', 'Not completed'],
      [
        'M-01 supporting evidence',
        'minutes-v1.pdf (Item 4)',
        'minutes-v2.pdf (Item 6)',
      ],
      [
        'M-01 why it was not completed',
        'Not answered',
        'Exception review not held.',
      ],
    ]);
    expect(
      answerChanges(form, milestones, evidence, before, after)[2]!.field,
    ).toBe('field-milestones-m1-completed');
  });
});
