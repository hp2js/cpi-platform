import { and, eq, getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import {
  cycle,
  initialAssignments,
  initialBaselines,
  initialBusinessTime,
  initialActivities,
  initialForm,
  initialInstitutionTypes,
  initialPlanApprovals,
  initialPlannedMilestones,
  initialProfiles,
  initialSupervisions,
  initialRisks,
  institutions,
  seedFoundations,
  users,
} from '@cpi/contracts/fixtures';
import { inviter } from '../auth/invitations';
import type { AppConfig } from '../config';
import type { Mailer } from '../email/mailer';
import { lockWrites, type Database, type Tx } from './db';
import * as schema from './schema';

const tables = Object.values(schema).filter((value) => is(value, PgTable));

/** What this deployment seeds: demo data or not, and the configured administrator. */
export const seedOptions = (config: AppConfig, mailer: Mailer) => ({
  demo: config.DEMO_MODE,
  administrator: config.ADMIN_EMAIL
    ? { email: config.ADMIN_EMAIL, displayName: config.ADMIN_NAME, mailer }
    : undefined,
});

/** The configured administrator's fixed ID, so resets can keep the account. */
export const PLATFORM_ADMIN_ID = 'platform-admin';

/**
 * Restore the starting state. `demo` (the default) loads the fictional PRD §17.1 year (the
 * mock's `seed()`); otherwise only the cycle, form, profiles and institution types, with no
 * institutions or people. `administrator` adds the configured administrator: an existing account
 * is kept as it is, a new one gets a temporary password emailed through `mailer` after commit.
 * A new simulation run passes `keepProfiles` so the administrator's profile library carries over.
 * It holds the write lock throughout, so it waits for writes in progress and later writes wait
 * for it; `then` records the outcome in the same transaction.
 */
export async function loadFixtures(
  db: Database,
  options: {
    keepProfiles?: boolean;
    /** The new run's ID, or how to derive it from the run being replaced. */
    runId?: string | ((previous: string | undefined) => string);
    demo?: boolean;
    administrator?: { email: string; displayName: string; mailer: Mailer };
    then?: (tx: Tx, businessTime: string) => Promise<void>;
  } = {},
) {
  const { demo = true, administrator } = options;
  const afterCommit: (() => Promise<void>)[] = [];
  await db.transaction(async (tx) => {
    await lockWrites(tx);
    const [replaced] =
      typeof options.runId === 'function'
        ? await tx
            .select({ runId: schema.systemState.runId })
            .from(schema.systemState)
        : [];
    const runId =
      typeof options.runId === 'function'
        ? options.runId(replaced?.runId)
        : (options.runId ?? 'run-001');
    const keptProfiles = options.keepProfiles
      ? await tx
          .select()
          .from(schema.scoringProfiles)
          .orderBy(schema.scoringProfiles.position)
      : [];
    // Kept only while ADMIN_EMAIL still names it; a different address is a new administrator.
    const [keptAdministrator] = administrator
      ? await tx
          .select()
          .from(schema.users)
          .where(
            and(
              eq(schema.users.id, PLATFORM_ADMIN_ID),
              sql`lower(${schema.users.email}) = ${administrator.email.toLowerCase()}`,
            ),
          )
      : [];
    await tx.execute(
      sql.raw(
        `TRUNCATE ${tables.map((table) => `"${getTableName(table)}"`).join(', ')} RESTART IDENTITY CASCADE`,
      ),
    );
    await tx.execute(sql`ALTER SEQUENCE record_ids RESTART WITH 1`);

    await tx.insert(schema.institutionTypes).values(initialInstitutionTypes);

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
      riskScale: cycle.riskScale,
    });
    await tx
      .insert(schema.periods)
      .values(
        cycle.periods.map((period) => ({ ...period, cycleId: cycle.id })),
      );
    await tx.insert(schema.formVersions).values(initialForm);
    await tx.insert(schema.systemState).values({
      runId,
      businessTime: initialBusinessTime,
    });

    if (administrator) {
      const email = administrator.email.toLowerCase();
      const user = keptAdministrator ?? {
        id: PLATFORM_ADMIN_ID,
        displayName: administrator.displayName,
        email,
        role: 'administrator' as const,
        active: true,
      };
      const [stored] = await tx.insert(schema.users).values(user).returning();
      if (!keptAdministrator)
        await inviter(
          administrator.mailer,
          { ...stored!, displayName: 'The platform operator' },
          (task) => afterCommit.push(task),
        )(tx, stored!);
    }
    if (!demo) return options.then?.(tx, initialBusinessTime);

    await tx.insert(schema.institutions).values(institutions);
    await tx.insert(schema.users).values(
      users
        .filter((user) => user.email !== administrator?.email.toLowerCase())
        .map((user) => ({
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
    await tx.insert(schema.activities).values(initialActivities);
    await tx.insert(schema.plannedMilestones).values(initialPlannedMilestones);
    await tx.insert(schema.planApprovals).values(initialPlanApprovals);
    await tx.insert(schema.baselines).values(initialBaselines);
    const foundations = seedFoundations();
    // Foundation documents belong to the institution, not to a quarterly obligation.
    await tx.insert(schema.evidence).values(
      foundations.evidence.map((item) => ({
        ...item,
        obligationId: null,
        demonstration: true,
      })),
    );
    await tx.insert(schema.foundationVersions).values(foundations.versions);
    await options.then?.(tx, initialBusinessTime);
  });
  for (const task of afterCommit) await task();
}
