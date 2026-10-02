import { sql } from 'drizzle-orm';
import { loadConfig } from '../config';
import { nextId, write } from '../database/db';
import { users } from '../database/schema';
import { Mailer } from '../email/mailer';
import { Events } from '../events/events';
import { Infrastructure } from '../infrastructure';
import { Objects } from '../storage/objects';
import { inviter } from './invitations';

/**
 * Invites an administrator by email, for deployments without demo sign-in (DEMO_MODE=false),
 * where no one could otherwise sign in to add the first real account:
 *
 *   pnpm user:invite-admin person@agency.go.ke "Full Name"
 *
 * Creates the account (or re-invites an existing administrator) and emails a temporary password.
 */
async function main() {
  const [email = '', ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(' ').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name.length < 3)
    throw new Error(
      'Usage: pnpm user:invite-admin <email> "<full name, 3+ characters>"',
    );
  const config = loadConfig(process.env);
  const objects = new Objects(config);
  const infrastructure = new Infrastructure(config, objects);
  const mailer = new Mailer(infrastructure, config);
  const events = new Events(config);
  const db = infrastructure.database;
  try {
    await write(db, async (tx, businessTime, afterCommit) => {
      const [existing] = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
      if (existing && existing.role !== 'administrator')
        throw new Error(`${email} already has a ${existing.role} account.`);
      const user =
        existing ??
        (
          await tx
            .insert(users)
            .values({
              id: await nextId(tx, 'user'),
              displayName: name,
              email,
              role: 'administrator',
              active: true,
            })
            .returning()
        )[0]!;
      const operator = { ...user, displayName: 'The platform operator' };
      await inviter(mailer, operator, afterCommit)(tx, user);
      await events.audit(
        tx,
        businessTime,
        operator,
        existing ? 'user.invite' : 'user.create',
        { type: 'user', id: user.id },
        `Administrator ${email} invited from the command line`,
      );
    });
    console.log(
      `Emailed a temporary password to ${email}${config.RESEND_API_KEY ? '' : ' (no RESEND_API_KEY: it is in the local email sink)'}.`,
    );
  } finally {
    await infrastructure.onApplicationShutdown();
    objects.onApplicationShutdown();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Invitation failed.');
  process.exitCode = 1;
});
