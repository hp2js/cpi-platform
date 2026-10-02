import type { MockDb } from '../db';
import type { MockUser } from '@cpi/contracts/fixtures';
import { portalUrl, sendAccountEmail } from './events';

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
  // Temporary passwords are hashed before the account (and its ID) exists.
  const [scheme, salt] = user.passwordHash.split('$');
  if (scheme === 'salted')
    return (
      user.passwordHash ===
      `salted$${salt}$${await sha256(`${salt}:${password}`)}`
    );
  return user.passwordHash === (await hashPassword(user, password));
}

export type AccountStatus = 'active' | 'invited' | 'deactivated';
/** Invited accounts have not yet chosen their own password (they may hold a temporary one). */
export function accountStatus(user: MockUser): AccountStatus {
  if (!user.active) return 'deactivated';
  return user.passwordHash && !user.passwordExpiresAt ? 'active' : 'invited';
}

/** Whether the account may sign in with a password: active, or within its temporary password. */
export function canSignIn(user: MockUser) {
  return (
    user.active &&
    !!user.passwordHash &&
    (!user.passwordExpiresAt || Date.parse(user.passwordExpiresAt) > now())
  );
}

/** When an invited account's temporary password or invitation link stops working. */
export function invitationExpiresAt(user: MockUser) {
  if (accountStatus(user) !== 'invited') return null;
  return (
    user.passwordExpiresAt ??
    (user.authLink?.purpose === 'invitation' ? user.authLink.expiresAt : null)
  );
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

/* ---------- Invitations (temporary passwords) ---------- */

const READABLE = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomIndex = (size: number) =>
  crypto.getRandomValues(new Uint32Array(1))[0]! % size;

export interface PreparedInvitation {
  password: string;
  passwordHash: string;
  expiresAt: string;
}

/** A random temporary password and its hash; only the hash is stored. */
export async function prepareInvitation(): Promise<PreparedInvitation> {
  const password = Array.from({ length: 4 }, () =>
    Array.from(
      { length: 4 },
      () => READABLE[randomIndex(READABLE.length)],
    ).join(''),
  ).join('-');
  const salt = newToken().slice(0, 16);
  return {
    password,
    passwordHash: `salted$${salt}$${await sha256(`${salt}:${password}`)}`,
    expiresAt: new Date(now() + INVITATION_TTL_MS).toISOString(),
  };
}

/**
 * Gives the account the temporary password (replacing any earlier one) and emails it. Call
 * inside `commit`, with an invitation from `prepareInvitation`.
 */
export function sendInvitation(
  db: MockDb,
  user: MockUser,
  prepared: PreparedInvitation,
  invitedBy?: MockUser,
) {
  user.passwordHash = prepared.passwordHash;
  user.passwordExpiresAt = prepared.expiresAt;
  user.authLink = null;
  sendAccountEmail(db, user.email, {
    subject: 'You are invited to the CPI Platform',
    body: `Welcome, ${user.displayName}\n\n${invitedBy?.displayName ?? 'An administrator'} created a CPI Platform account for you. Sign in with your email address (${user.email}) and this temporary password:\n\nTemporary password: ${prepared.password}\n\nEach time you sign in we email you a code, and the first time you choose your own password.\n\n${portalUrl('/sign-in')}`,
  });
}

/* ---------- Emailed sign-in codes ---------- */

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_ATTEMPTS = 5;

export const codeHash = (challengeId: string, code: string) =>
  sha256(`${challengeId}:${code}`);

export async function prepareChallenge() {
  const code = String(randomIndex(1_000_000)).padStart(6, '0');
  const id = newToken();
  return { id, code, codeHash: await codeHash(id, code) };
}

/** Stores the challenge and emails its code. Call inside `commit`. */
export function sendChallenge(
  db: MockDb,
  user: MockUser,
  challenge: Awaited<ReturnType<typeof prepareChallenge>>,
) {
  const expiresAt = now() + CODE_TTL_MS;
  db.signInChallenges[challenge.id] = {
    userId: user.id,
    codeHash: challenge.codeHash,
    attempts: 0,
    expiresAt,
  };
  sendAccountEmail(db, user.email, {
    subject: `${challenge.code} is your CPI Platform sign-in code`,
    body: `Your sign-in code\n\nHello ${user.displayName},\n\nYour sign-in code is ${challenge.code}\n\nEnter it on the sign-in page within 10 minutes.`,
  });
  return new Date(expiresAt).toISOString();
}

/* ---------- Password resets ---------- */

export interface PreparedLink {
  purpose: 'invitation' | 'reset';
  token: string;
  tokenHash: string;
  expiresAt: string;
}

/** Creates a single-use reset token; only its hash is ever stored. */
export async function prepareLink(): Promise<PreparedLink> {
  const token = newToken();
  return {
    purpose: 'reset',
    token,
    tokenHash: await hashToken(token),
    expiresAt: new Date(now() + RESET_TTL_MS).toISOString(),
  };
}

/** Stores the reset link on the account and emails it. Call inside `commit`. */
export function sendLink(db: MockDb, user: MockUser, prepared: PreparedLink) {
  const { purpose, token, tokenHash, expiresAt } = prepared;
  user.authLink = { purpose, tokenHash, expiresAt };
  sendAccountEmail(db, user.email, {
    subject: 'Reset your CPI Platform password',
    body: `Reset your password\n\nSomeone asked to reset the password for this account. If it was you, choose a new password with this link; it works once and expires in 1 hour. Otherwise you can ignore this email.\n\n${portalUrl(`/set-password?token=${token}`)}`,
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
