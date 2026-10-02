import { z } from 'zod';
import { institutionIdSchema, instantSchema, roleSchema } from './common.js';

export const sessionUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: roleSchema,
  /** Present only for institution users: the one institution they act for. */
  institutionId: institutionIdSchema.optional(),
  /** Self-maintained; prefills the submission's role or delegation reference. */
  jobTitle: z.string().optional(),
  /**
   * Present (true) while the account still uses its emailed temporary password: the person
   * must choose their own before anything else answers (403 `password_change_required`).
   */
  mustChangePassword: z.literal(true).optional(),
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

/** One-click demonstration sign-in; accepted only when the deployment runs in demo mode. */
export const demoSignInSchema = z.object({ accountId: z.string() });
/** Normal sign-in (PRD §13.1: throttled; one generic error for any failure). */
export const passwordSignInSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256),
});
export type PasswordSignIn = z.infer<typeof passwordSignInSchema>;
export const signInRequestSchema = z.union([
  demoSignInSchema,
  passwordSignInSchema,
]);
export type SignInRequest = z.infer<typeof signInRequestSchema>;

/**
 * A right email and password answers 202 with a challenge: a six-digit code is emailed, and
 * `POST /session/code` with the code starts the session. Demo sign-in answers with a session.
 */
export const signInChallengeSchema = z.object({
  challengeId: z.string(),
  /** When the emailed code stops working (10 minutes; five wrong codes also end it). */
  expiresAt: instantSchema,
});
export type SignInChallenge = z.infer<typeof signInChallengeSchema>;
export const signInCodeSchema = z.object({
  challengeId: z.string().min(1).max(64),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
export type SignInCode = z.infer<typeof signInCodeSchema>;

/** How people can sign in on this deployment. */
export const authConfigSchema = z.object({
  passwordSignIn: z.boolean(),
  /** Demonstration deployments list fictional accounts for one-click sign-in. */
  demoAccounts: z.boolean(),
  /** Demonstration only: the published password every seeded demo account accepts. */
  demoPassword: z.string().nullable(),
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** `planned` providers are shown with an explanation; they cannot be used yet. */
      status: z.enum(['available', 'planned']),
      description: z.string(),
    }),
  ),
});
export type AuthConfig = z.infer<typeof authConfigSchema>;

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().min(3).max(254),
});

/** What a single-use link from an invitation or reset email is for. */
export const authTokenSchema = z.object({
  purpose: z.enum(['invitation', 'reset']),
  email: z.string(),
  displayName: z.string(),
  expiresAt: instantSchema,
});
export type AuthToken = z.infer<typeof authTokenSchema>;

export const setPasswordSchema = z.object({
  password: z.string().max(128),
});
export const changePasswordSchema = z.object({
  /** Not asked while the account uses its temporary password (the session just proved it). */
  currentPassword: z.string().min(1).max(256).optional(),
  newPassword: z.string().max(128),
});
export type ChangePassword = z.infer<typeof changePasswordSchema>;

export const PASSWORD_MIN_LENGTH = 12;
const commonPasswords = new Set([
  'password1234',
  'password12345',
  'passwordpassword',
  '123456789012',
  'qwertyuiopas',
  'iloveyou1234',
  'welcome12345',
  'administrator',
  'letmein12345',
  'changeme1234',
  'kenya1234567',
  'nairobi12345',
]);

/**
 * Password rules shared by the form and the API, following NIST SP 800-63B: length rather
 * than composition, no common or context-specific passwords, paste and managers allowed.
 * Returns the unmet rules; an empty list means the password is acceptable.
 */
export function passwordProblems(password: string, email = '') {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH)
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (password.length > 128) problems.push('Use at most 128 characters.');
  const lower = password.toLowerCase();
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (commonPasswords.has(lower) || /^(.)\1+$/.test(password))
    problems.push('Choose a less common password.');
  if (local.length >= 4 && lower.includes(local))
    problems.push('Do not include your email address.');
  return problems;
}
