import { createElement } from 'react';
import { eq } from 'drizzle-orm';
import type { AfterCommit, Tx } from '../database/db';
import { toNairobi, users } from '../database/schema';
import type { Mailer } from '../email/mailer';
import { TemporaryPasswordEmail } from '../email/templates';
import {
  TEMPORARY_PASSWORD_TTL_MS,
  hashPassword,
  temporaryPassword,
} from './passwords';
import type { User } from './sessions';

/** Invites a person to an account created inside the current `write()`. */
export type Invite = (tx: Tx, user: User) => Promise<void>;

/**
 * Gives the account a new random temporary password (replacing any earlier one or invitation
 * link) and emails it once the change commits. Only its hash is stored. The person signs in
 * with it, confirms the emailed code, and must then choose their own password.
 */
export function inviter(
  mailer: Mailer,
  invitedBy: User,
  afterCommit: AfterCommit,
): Invite {
  return async (tx, user) => {
    const password = temporaryPassword();
    const expiresAt = toNairobi(
      new Date(Date.now() + TEMPORARY_PASSWORD_TTL_MS),
    );
    await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        passwordExpiresAt: expiresAt,
        authLink: null,
      })
      .where(eq(users.id, user.id));
    afterCommit(() =>
      mailer.send(
        {
          to: user.email,
          subject: 'You are invited to the CPI Platform',
          idempotencyKey: `invitation:${user.id}:${expiresAt}`,
          email: createElement(TemporaryPasswordEmail, {
            displayName: user.displayName,
            email: user.email,
            password,
            invitedBy: invitedBy.displayName,
            expiresAt,
            signInUrl: mailer.link('/sign-in'),
          }),
        },
        `The account for ${user.email} was saved, but the invitation email could not be sent. Use Resend invitation to try again.`,
      ),
    );
  };
}
