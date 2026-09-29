import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import {
  cycle,
  initialAssignments,
  initialBaselines,
  initialBusinessTime,
  initialForm,
  initialInstitutionTypes,
  initialProfiles,
  initialSupervisions,
  initialRisks,
  institutions,
  seedFoundations,
  users,
} from '@cpi/contracts/fixtures';
import type { Database } from './db';
import * as schema from './schema';

const tables = Object.values(schema).filter((value) => is(value, PgTable));

/**
 * Restore the fictional PRD §17.1 starting state (the mock's `seed()`). A new simulation run
 * passes `keepProfiles` so the administrator's profile library carries over.
 */
export async function loadFixtures(
  db: Database,
  options: { keepProfiles?: boolean; runId?: string } = {},
) {
  await db.transaction(async (tx) => {
    const keptProfiles = options.keepProfiles
      ? await tx
          .select()
          .from(schema.scoringProfiles)
          .orderBy(schema.scoringProfiles.position)
      : [];
    await tx.execute(
      sql.raw(
        `TRUNCATE ${tables.map((table) => `"${getTableName(table)}"`).join(', ')} RESTART IDENTITY CASCADE`,
      ),
    );
    await tx.execute(sql`ALTER SEQUENCE record_ids RESTART WITH 1`);

    await tx.insert(schema.institutionTypes).values(initialInstitutionTypes);
    await tx.insert(schema.institutions).values(institutions);
    await tx.insert(schema.users).values(
      users.map((user) => ({
        ...user,
        institutionId: user.institutionId ?? null,
        jobTitle: user.jobTitle ?? '',
        phone: user.phone ?? '',
        passwordHash: user.passwordHash ?? null,
        authLink: null,
      })),
    );
    await tx.insert(schema.assignments).values(initialAssignments);
    await tx.insert(schema.supervisions).values(initialSupervisions);

    await tx
      .insert(schema.scoringProfiles)
      .values(
        keptProfiles.length
          ? keptProfiles.map(({ position, ...profile }) => profile)
          : initialProfiles,
      );
    await tx.insert(schema.cycles).values({
      id: cycle.id,
      label: cycle.label,
      timezone: cycle.timezone,
      foundationDeadline: cycle.foundationDeadline,
      evaluationCutoff: cycle.evaluationCutoff,
      profileId: 'hackathon-mock-v1',
      reminderDaysBefore: [7, 1],
      overdueNotice: true,
      dayCounting: cycle.dayCounting,
    });
    await tx
      .insert(schema.periods)
      .values(
        cycle.periods.map((period) => ({ ...period, cycleId: cycle.id })),
      );
    await tx.insert(schema.formVersions).values(initialForm);
    await tx.insert(schema.systemState).values({
      runId: options.runId ?? 'run-001',
      businessTime: initialBusinessTime,
    });

    await tx.insert(schema.obligations).values(
      institutions.flatMap((institution) =>
        cycle.periods.map((period) => ({
          id: `${institution.id}:${period.id}`,
          institutionId: institution.id,
          periodId: period.id,
          state: 'not_started' as const,
        })),
      ),
    );
    await tx.insert(schema.risks).values(initialRisks);
    await tx.insert(schema.baselines).values(initialBaselines);
    const foundations = seedFoundations();
    // Foundation documents belong to the institution, not to a quarterly obligation.
    await tx
      .insert(schema.evidence)
      .values(
        foundations.evidence.map((item) => ({ ...item, obligationId: null })),
      );
    await tx.insert(schema.foundationVersions).values(foundations.versions);
  });
}
