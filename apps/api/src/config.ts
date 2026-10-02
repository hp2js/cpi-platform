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
export const CONFIG = Symbol('CONFIG');
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Do not log connection strings or credentials.
    throw new Error(
      `Invalid environment: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  return result.data;
}
