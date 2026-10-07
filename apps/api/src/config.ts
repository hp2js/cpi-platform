import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z
      .url()
      .refine((value) => /^postgres(ql)?:/.test(value), 'Use a PostgreSQL URL'),
    REDIS_URL: z
      .url()
      .refine((value) => /^rediss?:/.test(value), 'Use a Redis URL'),
    S3_ENDPOINT: z
      .url()
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
      .default('http://127.0.0.1:19000'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
      .default('cpi-files'),
    S3_ACCESS_KEY_ID: z.string().min(1).default('cpi-local'),
    S3_SECRET_ACCESS_KEY: z.string().min(8).default('cpi-local-files-only'),
    S3_FORCE_PATH_STYLE: z.stringbool().default(true),
    S3_PREFIX: z
      .string()
      .regex(/^evidence\/(?:[a-zA-Z0-9_-]+\/)*$/)
      .default('evidence/'),
    /**
     * Demonstration deployment: lists the fictional accounts for one-click sign-in. Turn off
     * (DEMO_MODE=false) anywhere real people sign in.
     */
    DEMO_MODE: z.stringbool().default(true),
    /** Migrate on start and seed an empty database with the fictional fixtures. */
    DB_AUTO_SETUP: z.stringbool().default(true),
    /** Where email links point (the web portal's origin). */
    PORTAL_URL: z.url().default('http://127.0.0.1:5180'),
    /** Resend API key for account emails; empty or unset sends them to the local email sink. */
    RESEND_API_KEY: z.string().default(''),
    /** Sender for account emails; Resend requires a verified domain to reach other recipients. */
    EMAIL_FROM: z
      .string()
      .min(3)
      .default('CPI Platform <onboarding@resend.dev>'),
    /**
     * The administrator seeded in every mode, emailed a temporary password when first created and
     * kept across resets. Required without demo mode, where no seeded account can sign in.
     */
    ADMIN_EMAIL: z
      .string()
      .trim()
      .regex(/^([^@\s]+@[^@\s]+\.[^@\s]+)?$/)
      .default(''),
    ADMIN_NAME: z.string().trim().default('Platform administrator'),
    /**
     * Outside demo mode, file uploads stay off until this is true: the recorded decision that
     * malware scanning, quarantine and a production review are in place for real documents.
     */
    REAL_DOCUMENT_UPLOADS: z.stringbool().default(false),
    /** Waits before the 2nd and 3rd attempts of a notification email (real time, milliseconds). */
    DELIVERY_RETRY_DELAYS_MS: z
      .string()
      .default('30000,120000')
      .transform((value) => value.split(',').map(Number))
      .pipe(z.array(z.number().int().min(0)).length(2)),
    /** Idle session lifetime; each authenticated request extends it. */
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .default(8 * 3600),
  })
  .refine((config) => config.DEMO_MODE || config.ADMIN_EMAIL, {
    path: ['ADMIN_EMAIL'],
    message: 'Required when DEMO_MODE=false',
  });
export type AppConfig = z.infer<typeof schema>;

/**
 * The reset boundary (HP2-42). Restoring fixtures replaces every record, so it only runs against
 * a database whose name marks it as disposable: `…_demo` (the demo database) or `…_test`
 * (integration tests). Turning on demo mode against any other database cannot wipe it.
 */
export const disposableDatabase = (config: AppConfig) =>
  /_(demo|test)$/.test(
    decodeURIComponent(new URL(config.DATABASE_URL).pathname.slice(1)),
  );

/** Why demonstration controls (clock, new run, scripted year) are unavailable, or null. */
export const demoBlock = (config: AppConfig) =>
  !config.DEMO_MODE
    ? ('demo_only' as const)
    : !disposableDatabase(config)
      ? ('not_demo_database' as const)
      : null;

/** Names the invalid variables, never their values, so its message is safe to print. */
export class ConfigError extends Error {}
export const CONFIG = Symbol('CONFIG');
/** The only place the running server reads the environment. */
export const configProvider = {
  provide: CONFIG,
  useFactory: () => loadConfig(process.env),
};
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Do not log connection strings or credentials.
    throw new ConfigError(
      `Invalid environment: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  return result.data;
}
