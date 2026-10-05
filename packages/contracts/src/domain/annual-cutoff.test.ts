import { describe, expect, it } from 'vitest';
import { foundationAtCutoff } from './annual.js';

describe('foundation validity at annual cutoff (AT28)', () => {
  const old = {
    version: 1,
    effectiveFrom: '2026-07-01',
    effectiveTo: '2027-08-01',
    status: 'superseded',
  };
  const successor = {
    version: 2,
    effectiveFrom: '2027-08-01',
    effectiveTo: null,
    status: 'active',
  };
  it('retains the prior version until the successor becomes effective, with UTC-equivalent cutoffs', () => {
    expect(
      foundationAtCutoff([successor, old], '2027-07-31T23:59:59+03:00'),
    ).toBe(old);
    expect(foundationAtCutoff([old, successor], '2027-07-31T20:59:59Z')).toBe(
      old,
    );
    expect(
      foundationAtCutoff([old, successor], '2027-08-01T00:00:00+03:00'),
    ).toBe(successor);
  });
  it('does not revive superseded credit after withdrawal or credit a future-only document', () => {
    expect(
      foundationAtCutoff(
        [old, { ...successor, status: 'withdrawn' }],
        '2027-08-01T00:00:00+03:00',
      ),
    ).toBeUndefined();
    expect(
      foundationAtCutoff([successor], '2027-07-31T23:59:59+03:00'),
    ).toBeUndefined();
  });
});
