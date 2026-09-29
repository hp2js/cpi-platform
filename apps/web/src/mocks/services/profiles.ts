import type { IndicatorWeights, ScoringProfile } from '@cpi/contracts';
import { getDb, type MockDb } from '../db';
import type { MockProfile } from '@cpi/contracts/fixtures';

/** The profile the current cycle and run use (PRD §7.1). */
export function activeProfile(db: MockDb = getDb()): MockProfile {
  return (
    db.profiles.find((profile) => profile.id === db.cycleProfileId) ??
    db.profiles[0]!
  );
}

export function activeWeights(db: MockDb = getDb()): IndicatorWeights {
  return activeProfile(db).weights;
}

/** The label shown on internal score screens and exports. */
export function profileLabel(db: MockDb = getDb()) {
  return activeProfile(db).name;
}

/** The profile locks with the cycle's first published form version (§7.1). */
export function profileLock(db: MockDb = getDb()) {
  const first = db.forms
    .filter((form) => form.status === 'published')
    .sort((a, b) => a.version - b.version)[0];
  return first
    ? `Locked since form version ${first.version} was published. A different profile needs a new simulation run (PRD §7.1).`
    : null;
}

/** Problems that block approval or use; empty when the profile is valid. */
export function profileIssues(profile: MockProfile, db: MockDb = getDb()) {
  const issues: { path: string; message: string }[] = [];
  const { weights } = profile;
  const total =
    weights.procedures +
    weights.riskAssessment +
    weights.mitigationPlan +
    weights.implementation;
  if (total !== 100)
    issues.push({
      path: 'weights',
      message: `Indicator weights must total 100; they total ${total}.`,
    });
  if (profile.proceduresMode === 'prerequisite' && weights.procedures !== 0)
    issues.push({
      path: 'weights.procedures',
      message:
        'When procedures are a prerequisite they carry no points; set the weight to 0.',
    });
  if (profile.proceduresMode === 'scored' && weights.procedures === 0)
    issues.push({
      path: 'weights.procedures',
      message:
        'Scored procedures need a weight above 0, or make them a prerequisite.',
    });
  if (weights.implementation === 0)
    issues.push({
      path: 'weights.implementation',
      message: 'Implementation needs a weight above 0.',
    });
  for (const [key, checks] of Object.entries(profile.checklists)) {
    if (new Set(checks.map((check) => check.toLowerCase())).size !== 4)
      issues.push({
        path: `checklists.${key}`,
        message: 'Each of the four checks must be different.',
      });
  }
  if (
    db.profiles.some(
      (other) =>
        other.id !== profile.id &&
        other.name.trim().toLowerCase() === profile.name.trim().toLowerCase(),
    )
  )
    issues.push({
      path: 'name',
      message: 'Another profile already has this name.',
    });
  return issues;
}

export function toProfile(
  profile: MockProfile,
  db: MockDb = getDb(),
): ScoringProfile {
  return { ...profile, issues: profileIssues(profile, db) };
}
