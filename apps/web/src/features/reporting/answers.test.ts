import { expect, it } from 'vitest';
import { replaceEvidence } from './answers';

it('points every reference at the replacement file', () => {
  const answers = {
    questions: {
      minutes: { evidenceIds: ['old', 'other'], unavailable: null },
      note: 'text',
    },
    milestones: {
      a: {
        completed: true,
        output: '',
        emergingIssues: '',
        actions: '',
        evidence: [{ evidenceId: 'old', passage: 'p1' }],
        evidenceUnavailable: null,
      },
      b: {
        completed: true,
        output: '',
        emergingIssues: '',
        actions: '',
        evidence: [{ evidenceId: 'other', passage: 'p2' }],
        evidenceUnavailable: null,
      },
    },
  };
  const next = replaceEvidence(answers, 'old', 'new');
  expect(next.questions.minutes).toEqual({
    evidenceIds: ['new', 'other'],
    unavailable: null,
  });
  expect(next.questions.note).toBe('text');
  expect(next.milestones.a?.evidence).toEqual([
    { evidenceId: 'new', passage: 'p1' },
  ]);
  expect(next.milestones.b?.evidence).toEqual([
    { evidenceId: 'other', passage: 'p2' },
  ]);
});
