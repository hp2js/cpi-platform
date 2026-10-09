import { describe, expect, it } from 'vitest';
import { inputVersions, scoringFixtures } from './catalogue.js';
import { profileConformance, runFixture } from './conformance.js';
import { renderWorksheet } from './report.js';

describe('HP2-11 fixtures against the implementation', () => {
  it('uses the profile the fixtures were written against', () => {
    expect(profileConformance()).toEqual({
      id: inputVersions.profile.id,
      name: inputVersions.profile.name,
      version: inputVersions.profile.version,
      formula: inputVersions.formula,
      rounding: inputVersions.rounding,
      weights: inputVersions.weights,
    });
  });

  it.each(scoringFixtures.map((fixture) => [fixture.id, fixture] as const))(
    '%s: the engine reproduces the expected result',
    (_, fixture) => {
      const row = runFixture(fixture);
      expect(row.actual).toEqual(fixture.expected);
      expect(row.outcome).toBe('pass');
    },
  );

  it('renders every fixture, its outcome, the review status and the scripted year', () => {
    const worksheet = renderWorksheet();
    for (const fixture of scoringFixtures)
      expect(worksheet).toContain(`**${fixture.id}**`);
    expect(worksheet).toContain(
      `${scoringFixtures.length} of ${scoringFixtures.length} fixtures pass`,
    );
    expect(worksheet).toContain('Team review of inputs: **not yet recorded**');
    for (let n = 1; n <= 8; n += 1)
      expect(worksheet).toContain(`| DEMO-00${n} |`);
  });
});
