import type { MockDb } from '../db';
import type { MockUser } from '@cpi/contracts/fixtures';
import { sendEmail } from './events';

/**
 * Mock authentication. The real API must use a slow password hash (Argon2id or bcrypt),
 * HTTP-only secure session cookies and server-side throttling; this stand-in keeps the same
 * behaviour visible: salted hashes, single-use hashed tokens, generic errors and lockout.
 */

/** Published for the demonstration: every seeded account accepts it (PRD §17.1 fixtures). */
export const DEMO_PASSWORD = 'Demo-Password-2026';
/** Seeded accounts store this marker instead of a hash of the published demo password. */
export const DEMO_PASSWORD_MARKER = 'demo-password';

export const INVITATION_TTL_MS = 7 * 86_400_000;
export const RESET_TTL_MS = 3_600_000;
const LOCKOUT_FAILURES = 5;
const LOCKOUT_WINDOW_MS = 15 * 60_000;

/** Security tokens use actual time, not simulated business time. */
export const now = () => Date.now();

async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export const hashPassword = (user: MockUser, password: string) =>
  sha256(`${user.id}:${password}`);
export const hashToken = (token: string) => sha256(`token:${token}`);

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export async function passwordMatches(user: MockUser, password: string) {
  if (!user.passwordHash) return false;
  if (user.passwordHash === DEMO_PASSWORD_MARKER)
    return password === DEMO_PASSWORD;
  return user.passwordHash === (await hashPassword(user, password));
}

export type AccountStatus = 'active' | 'invited' | 'deactivated';
export function accountStatus(user: MockUser): AccountStatus {
  if (!user.active) return 'deactivated';
  return user.passwordHash ? 'active' : 'invited';
}

/* ---------- Throttling (per email, whether or not an account exists) ---------- */

export function lockedFor(db: MockDb, email: string) {
  const record = db.loginAttempts[email];
  if (!record?.lockedUntil) return 0;
  return Math.max(0, record.lockedUntil - now());
}

export function recordFailure(db: MockDb, email: string) {
  const time = now();
  const record = db.loginAttempts[email] ?? { failures: [], lockedUntil: null };
  record.failures = [
    ...record.failures.filter((at) => time - at < LOCKOUT_WINDOW_MS),
    time,
  ];
  if (record.failures.length >= LOCKOUT_FAILURES) {
    record.lockedUntil = time + LOCKOUT_WINDOW_MS;
    record.failures = [];
  }
  db.loginAttempts[email] = record;
}

export function clearFailures(db: MockDb, email: string) {
  delete db.loginAttempts[email];
}

/* ---------- Invitations and resets ---------- */

export interface PreparedLink {
  purpose: 'invitation' | 'reset';
  token: string;
  tokenHash: string;
  expiresAt: string;
}

/** Creates a single-use token; only its hash is ever stored. */
export async function prepareLink(
  purpose: 'invitation' | 'reset',
): Promise<PreparedLink> {
  const token = newToken();
  return {
    purpose,
    token,
    tokenHash: await hashToken(token),
    expiresAt: new Date(
      now() + (purpose === 'invitation' ? INVITATION_TTL_MS : RESET_TTL_MS),
    ).toISOString(),
  };
}

/**
 * Stores the link on the account (replacing any earlier one) and emails it. Call inside
 * `commit`, with a link from `prepareLink`.
 */
export function sendLink(
  db: MockDb,
  user: MockUser,
  prepared: PreparedLink,
  invitedBy?: MockUser,
) {
  const { purpose, token, tokenHash, expiresAt } = prepared;
  user.authLink = { purpose, tokenHash, expiresAt };
  const link = `/set-password?token=${token}`;
  const key = `${purpose}:${user.id}:${tokenHash.slice(0, 12)}`;
  if (purpose === 'invitation')
    sendEmail(db, key, 'account.invitation', user, {
      subject: 'You are invited to the CPI Platform',
      body: `${invitedBy?.displayName ?? 'An administrator'} created an account for you (${user.email}). Set your password to sign in. The link works once and expires in 7 days.`,
      link,
    });
  else
    sendEmail(db, key, 'account.password_reset', user, {
      subject: 'Reset your CPI Platform password',
      body: 'Someone asked to reset the password for this account. If it was you, choose a new password with this link; it works once and expires in 1 hour. Otherwise you can ignore this email.',
      link,
    });
}

/** The account a link belongs to, if the link is current. */
export async function accountForToken(db: MockDb, token: string) {
  const tokenHash = await hashToken(token);
  const user = db.users.find(
    (candidate) => candidate.authLink?.tokenHash === tokenHash,
  );
  if (!user?.authLink || !user.active)
    return { user: undefined, expired: false };
  if (Date.parse(user.authLink.expiresAt) < now())
    return { user: undefined, expired: true };
  return { user, expired: false };
}
