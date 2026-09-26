import { describe, expect, it } from 'vitest';
import { add, format2, mul, rational, sum } from './rational';

/** Annual score A = 10P + 15R + 15M + 60 × (I1 + I2 + I3 + I4) ÷ 4 (PRD §10.5). */
function annual(p: number, r: number, m: number, quarters: [number, number][]) {
  const foundations = sum([
    mul(rational(10), rational(p, 4)),
    mul(rational(15), rational(r, 4)),
    mul(rational(15), rational(m, 4)),
  ]);
  const implementation = mul(
    rational(60),
    mul(sum(quarters.map(([n, d]) => rational(n, d))), rational(1, 4)),
  );
  return format2(add(foundations, implementation));
}

describe('PRD §10.6 worked examples', () => {
  it('Example A: 88.75', () =>
    expect(
      annual(4, 4, 4, [
        [1, 2],
        [3, 4],
        [1, 1],
        [1, 1],
      ]),
    ).toBe('88.75'));
  it('Example B: 70.00 with Q3 closed as zero', () =>
    expect(
      annual(4, 3, 4, [
        [1, 2],
        [3, 4],
        [0, 1],
        [1, 1],
      ]),
    ).toBe('70.00'));
  it('Worked case §3.3: 96.25', () =>
    expect(
      annual(4, 4, 4, [
        [3, 4],
        [1, 1],
        [1, 1],
        [1, 1],
      ]),
    ).toBe('96.25'));
  it('Example D: deleting unfinished rows cannot turn 4/8 into 4/4', () =>
    expect(format2(rational(4, 8))).toBe('0.50'));
  it('rounds half-up only at display', () =>
    expect(format2(rational(1, 8))).toBe('0.13'));
});
