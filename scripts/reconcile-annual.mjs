import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Independent PRD worksheet: no imports from the scoring engine, API or seed.
// These fixtures use quarters of four milestones and four checks per foundation.
const fixture = JSON.parse(
  readFileSync(
    new URL('../docs/acceptance/annual-fixtures.json', import.meta.url),
    'utf8',
  ),
);
assert.equal(fixture.checksPerFoundation, 4);
assert.equal(fixture.milestonesPerQuarter, 4);
assert.equal(fixture.quartersPerYear, 4);
assert.deepEqual(fixture.foundationWeights, [10, 15, 15]);
assert.equal(fixture.implementationWeight, 60);
assert.equal(fixture.cases.length, 8);
assert.equal(new Set(fixture.cases.map((row) => row.institutionId)).size, 8);
const money = (cents) =>
  `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
for (const row of fixture.cases) {
  assert.equal(row.foundationAcceptedChecks.length, 3);
  assert.equal(row.quarterAcceptedMilestones.length, 4);
  for (const n of [
    ...row.foundationAcceptedChecks,
    ...row.quarterAcceptedMilestones,
  ])
    assert.ok(Number.isInteger(n) && n >= 0 && n <= 4);
  // All divisions are exact cents for this worksheet; no rounded components are summed.
  const foundationCents = row.foundationAcceptedChecks.reduce(
    (sum, checks, i) =>
      sum + (BigInt(checks * fixture.foundationWeights[i]) * 100n) / 4n,
    0n,
  );
  const implementationCents =
    (BigInt(row.quarterAcceptedMilestones.reduce((a, b) => a + b, 0)) *
      BigInt(fixture.implementationWeight) *
      100n) /
    16n;
  assert.equal(
    money(foundationCents),
    row.expectedFoundationPoints,
    row.institutionId,
  );
  assert.equal(
    money(implementationCents),
    row.expectedImplementationPoints,
    row.institutionId,
  );
  assert.equal(
    money(foundationCents + implementationCents),
    row.expectedTotal,
    row.institutionId,
  );
  console.log(
    `${row.institutionId}: ${money(foundationCents)} + ${money(implementationCents)} = ${row.expectedTotal}`,
  );
}
