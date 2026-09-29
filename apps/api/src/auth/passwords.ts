import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { toNairobi, type users } from '../database/schema';

/**
 * Passwords, sign-in throttling and single-use links (PRD §13.1, NIST SP 800-63B).
 * Security times use actual time, never simulated business time.
 */

type UserRow = typeof users.$inferSelect;

/** Published for the demonstration: every seeded account accepts it while DEMO_MODE is on. */
export const DEMO_PASSWORD = 'Demo-Password-2026';
/** Seeded accounts store this marker instead of a hash of the published demo password. */
export const DEMO_PASSWORD_MARKER = 'demo-password';

export const INVITATION_TTL_MS = 7 * 86_400_000;
export const RESET_TTL_MS = 3_600_000;

// OWASP's scrypt baseline: N=2^17, r=8, p=1 (about 128 MiB per hash).
const COST = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const KEY_LENGTH = 64;

function scrypt(password: string, salt: Buffer, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/** `scrypt$N$r$p$salt$key`, base64url; the parameters travel with the hash. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, COST);
  return [
    'scrypt',
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/** Compared against when no account matches, so timing does not reveal which emails exist. */
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

async function verify(password: string, stored: string) {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: COST.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function passwordMatches(
  user: UserRow | undefined,
  password: string,
  demoMode: boolean,
) {
  if (!user?.passwordHash) {
    await verify(password, await DUMMY_HASH);
    return false;
  }
  if (user.passwordHash === DEMO_PASSWORD_MARKER)
    return demoMode && password === DEMO_PASSWORD;
  return verify(password, user.passwordHash);
}

export type AccountStatus = 'active' | 'invited' | 'deactivated';
/** Invited accounts exist but cannot sign in until the person sets a password. */
export function accountStatus(user: UserRow): AccountStatus {
  if (!user.active) return 'deactivated';
  return user.passwordHash ? 'active' : 'invited';
}

export const hashToken = (token: string) =>
  createHash('sha256').update(`token:${token}`).digest('hex');

/** A single-use link token; only its hash is stored. */
export function newLink(purpose: 'invitation' | 'reset') {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    stored: {
      purpose,
      tokenHash: hashToken(token),
      expiresAt: toNairobi(
        new Date(
          Date.now() +
            (purpose === 'invitation' ? INVITATION_TTL_MS : RESET_TTL_MS),
        ),
      ),
    },
  };
}
