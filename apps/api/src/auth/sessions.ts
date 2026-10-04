import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type Redis from 'ioredis';
import { and, eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import type { Role } from '@cpi/contracts';
import { CONFIG, type AppConfig } from '../config';
import { users } from '../database/schema';
import { ApiError, forbidden } from '../http/api-error';
import { Infrastructure } from '../infrastructure';

export type User = typeof users.$inferSelect;

/**
 * Sessions: an opaque random ID in an HttpOnly cookie, mapped to the user in Redis with a
 * sliding idle timeout. Signing in (demo or password) starts one; deactivation ends access.
 */
const COOKIE = 'cpi_session';
const LOCKOUT_MS = 15 * 60_000;
const key = (id: string) => `session:${id}`;
export const CODE_TTL_MS = 10 * 60_000;
const CODE_ATTEMPTS = 5;
const challengeKey = (id: string) => `signin-code:${id}`;
const codeHash = (challengeId: string, code: string) =>
  createHash('sha256').update(`${challengeId}:${code}`).digest();

function sessionIdFrom(request: Request) {
  const prefix = `${COOKIE}=`;
  return request.headers.cookie
    ?.split(/;\s*/)
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

/** Redis is down or unreachable: no one can sign in or stay signed in until it recovers. */
export const sessionStoreUnavailable = () =>
  new ApiError(
    503,
    'Sign-in is temporarily unavailable. Please try again shortly.',
    'session_store_unavailable',
  );

@Injectable()
export class Sessions {
  constructor(
    private readonly infrastructure: Infrastructure,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** Every Redis call, so an outage answers 503 instead of an unexpected 500. */
  private async store<T>(operation: (redis: Redis) => Promise<T>) {
    try {
      return await operation(this.infrastructure.redis);
    } catch {
      throw sessionStoreUnavailable();
    }
  }

  async start(response: Response, userId: string) {
    const id = randomBytes(32).toString('base64url');
    await this.store(async (redis) => {
      await redis.set(key(id), userId, 'EX', this.config.SESSION_TTL_SECONDS);
      // An index of the user's sessions, so a role change can end them all.
      await redis.sadd(`user-sessions:${userId}`, id);
    });
    response.cookie(COOKIE, id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.NODE_ENV === 'production',
      path: '/api',
      maxAge: this.config.SESSION_TTL_SECONDS * 1000,
    });
  }

  async end(request: Request, response: Response) {
    const id = sessionIdFrom(request);
    if (id) await this.store((redis) => redis.del(key(id)));
    response.clearCookie(COOKIE, { path: '/api' });
  }

  /** Development control: drops the caller's session but keeps the cookie (session_expired). */
  async expire(request: Request) {
    const id = sessionIdFrom(request);
    if (id) await this.store((redis) => redis.del(key(id)));
  }

  /** Ends every session of a user; their next request gets 401 `session_expired`. */
  async endAllFor(userId: string) {
    await this.store(async (redis) => {
      const ids = await redis.smembers(`user-sessions:${userId}`);
      await redis.del(`user-sessions:${userId}`, ...ids.map(key));
    });
  }

  /* Sign-in throttling per email, whether or not an account exists (PRD §13.1). */

  /** Milliseconds until the email may try again; 0 when not locked. */
  async lockedFor(email: string) {
    return Math.max(
      0,
      await this.store((redis) => redis.pttl(`login-lock:${email}`)),
    );
  }

  /** Five failures within 15 minutes lock that email for 15 minutes. */
  async recordFailure(email: string) {
    await this.store(async (redis) => {
      const failures = await redis.incr(`login-fail:${email}`);
      if (failures === 1)
        await redis.pexpire(`login-fail:${email}`, LOCKOUT_MS);
      if (failures >= 5) {
        await redis.set(`login-lock:${email}`, '1', 'PX', LOCKOUT_MS);
        await redis.del(`login-fail:${email}`);
      }
    });
  }

  async clearFailures(email: string) {
    await this.store((redis) =>
      redis.del(`login-fail:${email}`, `login-lock:${email}`),
    );
  }

  /** Development reset: sign-in lockouts belong to the data being reset. */
  async clearAllFailures() {
    const redis = this.infrastructure.redis;
    const throttles = await redis.keys('login-*');
    if (throttles.length) await redis.del(...throttles);
  }

  /* Emailed sign-in codes (second factor), held in Redis for 10 minutes; only a hash is kept. */

  async startChallenge(user: User, code: string) {
    const id = randomBytes(24).toString('base64url');
    await this.store((redis) =>
      redis
        .multi()
        .hset(challengeKey(id), {
          userId: user.id,
          email: user.email.toLowerCase(),
          codeHash: codeHash(id, code).toString('base64'),
          attempts: 0,
        })
        .pexpire(challengeKey(id), CODE_TTL_MS)
        .exec(),
    );
    return id;
  }

  /**
   * The user ID when the code is right (the challenge is then used up); `expired` when the
   * challenge is unknown, used, timed out or out of attempts; `wrong` (with the email, for
   * throttling) otherwise. Five wrong codes end the challenge.
   */
  async completeChallenge(
    id: string,
    code: string,
  ): Promise<
    | { result: 'ok'; userId: string; email: string }
    | { result: 'wrong'; email: string }
    | { result: 'expired' }
  > {
    return this.store(async (redis) => {
      const stored = await redis.hgetall(challengeKey(id));
      if (!stored.userId || !stored.email || !stored.codeHash)
        return { result: 'expired' };
      const expected = Buffer.from(stored.codeHash, 'base64');
      const actual = codeHash(id, code);
      if (
        actual.length === expected.length &&
        timingSafeEqual(actual, expected)
      ) {
        // Deleting is the claim: of two simultaneous right answers, only one signs in.
        if ((await redis.del(challengeKey(id))) !== 1)
          return { result: 'expired' };
        return { result: 'ok', userId: stored.userId, email: stored.email };
      }
      if (
        (await redis.hincrby(challengeKey(id), 'attempts', 1)) >= CODE_ATTEMPTS
      )
        await redis.del(challengeKey(id));
      return { result: 'wrong', email: stored.email };
    });
  }

  /** The signed-in, active user; 401 `session_expired` when a cookie outlived its session. */
  async resolve(request: Request): Promise<User> {
    const id = sessionIdFrom(request);
    const userId = id
      ? await this.store((redis) =>
          redis.getex(key(id), 'EX', this.config.SESSION_TTL_SECONDS),
        )
      : null;
    const [user] = userId
      ? await this.infrastructure.database
          .select()
          .from(users)
          .where(and(eq(users.id, userId), eq(users.active, true)))
      : [];
    if (user) return user;
    throw id
      ? new ApiError(
          401,
          'Your session has expired. Sign in again to continue.',
          'session_expired',
        )
      : new ApiError(401, 'Sign in to continue.', 'unauthenticated');
  }
}

const PUBLIC = 'public';
const ROLES = 'roles';
const TEMPORARY = 'temporary-password';
/** No session needed (health checks, sign-in). */
export const Public = () => SetMetadata(PUBLIC, true);
/** Open to a session that still uses a temporary password (everything else answers 403). */
export const TemporaryPasswordAllowed = () => SetMetadata(TEMPORARY, true);
/** Restrict a route or controller to these roles; others get 403. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export type AuthenticatedRequest = Request & { user?: User };

/** Global guard: every route needs a session unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: Sessions,
  ) {}

  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.sessions.resolve(request);
    if (
      user.passwordExpiresAt &&
      !this.reflector.getAllAndOverride<boolean>(TEMPORARY, targets)
    )
      throw new ApiError(
        403,
        'Choose your own password to continue.',
        'password_change_required',
      );
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles && !roles.includes(user.role)) throw forbidden();
    request.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user!,
);
