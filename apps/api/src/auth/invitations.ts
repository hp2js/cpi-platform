import { eq } from 'drizzle-orm';
import type { Tx } from '../database/db';
import { users } from '../database/schema';
import { sendEmail } from '../events/events';
import { newLink } from './passwords';
import type { User } from './sessions';

/**
 * Stores a new single-use invitation link on the account (replacing any earlier one) and emails
 * it; the person sets their own password from it. Call inside `write()`.
 */
export async function sendInvitation(
  tx: Tx,
  businessTime: string,
  portalUrl: string,
  user: User,
  invitedBy: User,
) {
  const link = newLink('invitation');
  await tx
    .update(users)
    .set({ authLink: link.stored })
    .where(eq(users.id, user.id));
  await sendEmail(
    tx,
    businessTime,
    portalUrl,
    `invitation:${user.id}:${link.stored.tokenHash.slice(0, 12)}`,
    'account.invitation',
    user,
    {
      subject: 'You are invited to the CPI Platform',
      body: `${invitedBy.displayName} created an account for you (${user.email}). Set your password to sign in. The link works once and expires in 7 days.`,
      link: `/set-password?token=${link.token}`,
    },
  );
}
