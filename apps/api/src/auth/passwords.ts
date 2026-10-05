import {
  createHash,
  randomBytes,
  randomInt,
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
/** How long an emailed temporary password works if the person never signs in. */
export const TEMPORARY_PASSWORD_TTL_MS = INVITATION_TTL_MS;

/** Without look-alike characters (0/O, 1/l/I), so it can be typed from the email. */
const READABLE = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Four groups of four from 56 characters: about 93 bits, typed as `xxxx-xxxx-xxxx-xxxx`. */
export function temporaryPassword() {
  return Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => READABLE[randomInt(READABLE.length)]).join(
      '',
    ),
  ).join('-');
}

/** A six-digit sign-in code, emailed after the password is accepted. */
export const signInCode = () => String(randomInt(1_000_000)).padStart(6, '0');

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
/** Invited accounts have not yet chosen their own password (they may hold a temporary one). */
export function accountStatus(user: UserRow): AccountStatus {
  if (!user.active) return 'deactivated';
  return user.passwordHash && !user.passwordExpiresAt ? 'active' : 'invited';
}

/** Whether the account may sign in with a password: active, or within its temporary password. */
export function canSignIn(user: UserRow) {
  return (
    user.active &&
    user.passwordHash !== null &&
    (!user.passwordExpiresAt || Date.parse(user.passwordExpiresAt) > Date.now())
  );
}

/** When an invited account's temporary password or invitation link stops working. */
export function invitationExpiresAt(user: UserRow) {
  if (accountStatus(user) !== 'invited') return null;
  return (
    user.passwordExpiresAt ??
    (user.authLink?.purpose === 'invitation' ? user.authLink.expiresAt : null)
  );
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
