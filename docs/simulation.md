# Simulation runbook

How the business clock, new runs and the scripted year behave, and where they are allowed. Code: `apps/api/src/simulation/`, `apps/api/src/config.ts` (`demoEnvironment`, `disposableDatabase`), `apps/api/src/database/fixtures.ts`.

## Where the controls work

| Environment                                                          | Business time                                                  | Advance, new run, scripted year               |
| -------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| **Demo environment**: `DEMO_MODE=true` and a database named `…_demo` | Moves only when an administrator advances it                   | Administrators only; others get `403`         |
| `DEMO_MODE=false` (real records)                                     | Follows the real clock (`RealTimeClock`, checked every second) | Refused for everyone: `409 demo_only`         |
| `DEMO_MODE=true` on any other database (a misconfiguration)          | Does not move                                                  | Refused for everyone: `409 not_demo_database` |

`GET /api/simulation` reports `controls: true` only in the demo environment. Otherwise `blockedBy` names why (`demo_only` or `not_demo_database`), and the Simulation clock page hides the buttons and shows that reason with its fix. `pnpm db:seed` and the development reset (`POST /api/__mock/reset`) follow the same database rule. Refused requests change nothing.

Whether advanced by an administrator or by the real clock, each boundary (reporting opens, reminders, overdue notices, cutoffs) is processed once per run: replays are no-ops.

## Setting up the demo environment

`.env.example` names the database `cpi_demo`, so a fresh `cp .env.example .env && pnpm docker:up` is a demo environment. To keep a separate database for real or exploratory records, give it a name that does not end in `_demo` and run it with `DEMO_MODE=false`.

## Operations

**Advance the clock.** Simulation clock → _Advance to …_ or _Go_ on a boundary. Business time only moves forward; reset the run to start again.

**Run the scripted year** (PRD §17.1). Institutions and officers act through the normal services until the evaluation cutoff; steps already done are skipped, so it can be rerun after a failure. Publication is left to the administrator. The expected results are asserted in `simulation.int.test.ts` and the mock's `annual.test.ts`.

**Start a new run.** Replaces the current run on the demo database; earlier runs are not kept and there is no per-run isolation.

- Kept: the scoring profile library, a chosen approved profile, and the administrator configured by `ADMIN_EMAIL`.
- Restored from the fixture: everything else, including the calendar, day counting, reminders, forms, risk scale, institution types, institutions, people and all workflow records. The scripted year's dates and expected results depend on the fixture calendar and form.
- The reset holds the write lock: it waits for writes in progress, later writes wait for it, and the `simulation.reset` audit event is recorded in the same transaction. If the reset fails, nothing changes.
- Uploaded files of the replaced run stay in the bucket until `pnpm storage:gc --delete` removes unreferenced objects older than 24 hours.

## Evidence

| Check                                                                                                 | Test                                                                                          |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Demo mode off: advance, new run and scripted year refused, records unchanged; clock follows real time | `auth.int.test.ts` "refuses simulation controls and follows the real clock outside demo mode" |
| Not administrators: all three refused, records unchanged                                              | `simulation.int.test.ts` "refuses simulation controls to everyone but administrators"         |
| Not the demo database: refused                                                                        | `simulation/reset-boundary.test.ts`                                                           |
| New run waits for a write in progress, then records itself                                            | `simulation.int.test.ts` "starts a new run only after a write in progress commits"            |
| Boundaries processed once; scripted year results                                                      | `simulation.int.test.ts` (AT13, AT24, scripted year)                                          |

Related issues: [HP2-28](https://linear.app/hp2js/issue/HP2-28), [HP2-34](https://linear.app/hp2js/issue/HP2-34), [HP2-42](https://linear.app/hp2js/issue/HP2-42).
