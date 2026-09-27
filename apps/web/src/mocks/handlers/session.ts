import { http, HttpResponse } from 'msw';
import {
  demoSignInSchema,
  passwordProblems,
  passwordResetRequestSchema,
  passwordSignInSchema,
  setPasswordSchema,
  type AuthConfig,
  type DemoAccount,
} from '@cpi/contracts';
import { commit, getDb } from '../db';
import {
  accountForToken,
  accountStatus,
  clearFailures,
  DEMO_PASSWORD,
  hashPassword,
  lockedFor,
  passwordMatches,
  prepareLink,
  recordFailure,
  sendLink,
} from '../services/auth';
import { audit } from '../services/events';
import { apiError } from '../services/http';
import { networkDelay } from '../services/latency';
import { requireUser, toSession } from '../services/session';

/** One message for every failure, so the form never reveals which emails have accounts. */
const WRONG = 'The email or password is not right. Check both and try again.';

const config: AuthConfig = {
  passwordSignIn: true,
  demoAccounts: true,
  demoPassword: DEMO_PASSWORD,
  providers: [
    {
      id: 'ecitizen',
      name: 'eCitizen',
      status: 'planned',
      description:
        'Sign-in through the government eCitizen service is a planned option. It would use OpenID Connect: eCitizen confirms who the person is, and this platform still decides their role and institution. It is not connected in this demonstration, and no agreement with eCitizen is implied.',
    },
  ],
};

export const sessionHandlers = [
  http.get('/api/auth/config', async () => {
    await networkDelay();
    return HttpResponse.json(config);
  }),

  // Demo mode only: fictional accounts that have finished setting up.
  http.get('/api/demo/accounts', async () => {
    await networkDelay();
    const db = getDb();
    const accounts: DemoAccount[] = db.users
      .filter((user) => accountStatus(user) === 'active')
      .map(({ id, displayName, role, institutionId }) => {
        const institution = db.institutions.find(
          (candidate) => candidate.id === institutionId,
        );
        return {
          id,
          displayName,
          role,
          ...(institutionId ? { institutionId } : {}),
          ...(institution ? { institutionName: institution.name } : {}),
        };
      });
    return HttpResponse.json(accounts);
  }),

  http.get('/api/session', async () => {
    await networkDelay();
    return HttpResponse.json(toSession(requireUser()));
  }),

  http.post('/api/session', async ({ request }) => {
    await networkDelay();
    const body = (await request.json().catch(() => undefined)) as unknown;
    const db = getDb();

    const demo = demoSignInSchema.safeParse(body);
    if (demo.success && config.demoAccounts) {
      const user = db.users.find(
        (candidate) =>
          candidate.id === demo.data.accountId &&
          accountStatus(candidate) === 'active',
      );
      if (!user)
        return apiError(
          422,
          'Choose an active demo account.',
          'invalid_account',
        );
      commit((store) => {
        store.session = { userId: user.id, expired: false };
      });
      return HttpResponse.json(toSession(user));
    }

    const parsed = passwordSignInSchema.safeParse(body);
    if (!parsed.success)
      return apiError(
        422,
        'Enter your email and password.',
        'invalid_request',
        {
          ...(typeof (body as { email?: unknown })?.email === 'string'
            ? {}
            : { email: 'Enter your email.' }),
          password: 'Enter your password.',
        },
      );
    const email = parsed.data.email.toLowerCase();
    const wait = lockedFor(db, email);
    if (wait)
      return apiError(
        429,
        `Too many attempts. Try again in ${Math.ceil(wait / 60_000)} minutes, or reset your password.`,
        'too_many_attempts',
      );
    const user = db.users.find((candidate) => candidate.email === email);
    const ok =
      user &&
      accountStatus(user) === 'active' &&
      (await passwordMatches(user, parsed.data.password));
    if (!ok) {
      commit((store) => recordFailure(store, email));
      return apiError(401, WRONG, 'invalid_credentials');
    }
    commit((store) => {
      clearFailures(store, email);
      store.session = { userId: user.id, expired: false };
      audit(
        store,
        user,
        'session.sign_in',
        { type: 'user', id: user.id },
        'Password sign-in',
      );
    });
    return HttpResponse.json(toSession(user));
  }),

  http.delete('/api/session', async () => {
    await networkDelay();
    commit((db) => {
      db.session = null;
    });
    return new HttpResponse(null, { status: 204 });
  }),

  // Always the same answer, so the form cannot be used to find accounts.
  http.post('/api/auth/password-reset', async ({ request }) => {
    await networkDelay();
    const parsed = passwordResetRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(422, 'Enter your email.', 'invalid_request', {
        email: 'Enter your email.',
      });
    const user = getDb().users.find(
      (candidate) => candidate.email === parsed.data.email.toLowerCase(),
    );
    if (user && accountStatus(user) === 'active') {
      const link = await prepareLink('reset');
      commit((db) => sendLink(db, user, link));
    }
    return HttpResponse.json(
      {
        message:
          'If an account uses that email, a reset link is on its way. It expires in 1 hour.',
      },
      { status: 202 },
    );
  }),

  http.get('/api/auth/tokens/:token', async ({ params }) => {
    await networkDelay();
    const { user, expired } = await accountForToken(
      getDb(),
      String(params.token),
    );
    if (!user)
      return apiError(
        expired ? 410 : 404,
        expired
          ? 'This link has expired. Ask for a new one.'
          : 'This link is not valid. It may already have been used.',
        expired ? 'link_expired' : 'link_invalid',
      );
    return HttpResponse.json({
      purpose: user.authLink!.purpose,
      email: user.email,
      displayName: user.displayName,
      expiresAt: user.authLink!.expiresAt,
    });
  }),

  // Sets the password from an invitation or reset link, then signs the person in.
  http.post('/api/auth/tokens/:token', async ({ params, request }) => {
    await networkDelay();
    const { user, expired } = await accountForToken(
      getDb(),
      String(params.token),
    );
    if (!user)
      return apiError(
        expired ? 410 : 404,
        expired
          ? 'This link has expired. Ask for a new one.'
          : 'This link is not valid. It may already have been used.',
        expired ? 'link_expired' : 'link_invalid',
      );
    const parsed = setPasswordSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    const problems = parsed.success
      ? passwordProblems(parsed.data.password, user.email)
      : ['Choose a password.'];
    if (problems.length)
      return apiError(422, problems.join(' '), 'weak_password', {
        password: problems.join(' '),
      });
    const hash = await hashPassword(user, parsed.data!.password);
    const purpose = user.authLink!.purpose;
    commit((db) => {
      user.passwordHash = hash;
      user.authLink = null;
      clearFailures(db, user.email);
      db.session = { userId: user.id, expired: false };
      audit(
        db,
        user,
        purpose === 'invitation'
          ? 'account.activate'
          : 'account.password_reset',
        { type: 'user', id: user.id },
        purpose === 'invitation'
          ? 'Invitation accepted; password set'
          : 'Password reset by email link',
      );
    });
    return HttpResponse.json(toSession(user));
  }),
];
