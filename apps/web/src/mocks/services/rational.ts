/**
 * Exact rational arithmetic for annual aggregation (PRD §10.5): no intermediate rounding,
 * half-up rounding only for display.
 */
export interface Rational {
  n: bigint;
  d: bigint;
}

const gcd = (a: bigint, b: bigint): bigint =>
  b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b);

export function rational(
  numerator: number | bigint,
  denominator: number | bigint = 1,
): Rational {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  if (d === 0n) throw new Error('Zero denominator');
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

export const add = (a: Rational, b: Rational) =>
  rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational) => rational(a.n * b.n, a.d * b.d);
export const sum = (values: Rational[]) => values.reduce(add, rational(0));

/** Half-up to two decimals, e.g. 88.75. */
export function format2(value: Rational) {
  const hundredths = (value.n * 200n + value.d) / (value.d * 2n);
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`;
}
