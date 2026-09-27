import { z } from 'zod';
import { institutionIdSchema, instantSchema, roleSchema } from './common.js';

export const sessionUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: roleSchema,
  /** Present only for institution users: the one institution they act for. */
  institutionId: institutionIdSchema.optional(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const scoringProfileSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Simulation profiles must be labelled as such wherever scores appear (PRD §7.1). */
  simulation: z.boolean(),
});
export type ScoringProfileSummary = z.infer<typeof scoringProfileSummarySchema>;

export const simulationClockSchema = z.object({
  runId: z.string(),
  /** Simulated business time; distinct from actual time used for audit. */
  businessTime: instantSchema,
  timezone: z.string(),
});
export type SimulationClock = z.infer<typeof simulationClockSchema>;

export const sessionSchema = z.object({
  user: sessionUserSchema,
  clock: simulationClockSchema,
  profile: scoringProfileSummarySchema,
});
export type Session = z.infer<typeof sessionSchema>;

/** Demo-only account directory used by the sign-in picker until real authentication exists. */
export const demoAccountSchema = sessionUserSchema
  .pick({
    id: true,
    displayName: true,
    role: true,
    institutionId: true,
  })
  .extend({
    /** Shown on the demo picker so the institution is recognisable, not just its code. */
    institutionName: z.string().optional(),
  });
export type DemoAccount = z.infer<typeof demoAccountSchema>;
export const demoAccountsSchema = z.array(demoAccountSchema);

export const signInRequestSchema = z.object({ accountId: z.string() });
export type SignInRequest = z.infer<typeof signInRequestSchema>;
