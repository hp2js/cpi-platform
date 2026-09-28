import { randomBytes } from 'node:crypto';
import {
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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

function sessionIdFrom(request: Request) {
  const prefix = `${COOKIE}=`;
  return request.headers.cookie
    ?.split(/;\s*/)
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

@Injectable()
export class Sessions {
  constructor(
    private readonly infrastructure: Infrastructure,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async start(response: Response, userId: string) {
    const id = randomBytes(32).toString('base64url');
    await this.infrastructure.redis.set(
      key(id),
      userId,
      'EX',
      this.config.SESSION_TTL_SECONDS,
    );
    // An index of the user's sessions, so a role change can end them all.
    await this.infrastructure.redis.sadd(`user-sessions:${userId}`, id);
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
    if (id) await this.infrastructure.redis.del(key(id));
    response.clearCookie(COOKIE, { path: '/api' });
  }

  /** Ends every session of a user; their next request gets 401 `session_expired`. */
  async endAllFor(userId: string) {
    const redis = this.infrastructure.redis;
    const ids = await redis.smembers(`user-sessions:${userId}`);
    await redis.del(`user-sessions:${userId}`, ...ids.map(key));
  }

  /* Sign-in throttling per email, whether or not an account exists (PRD §13.1). */

  /** Milliseconds until the email may try again; 0 when not locked. */
  async lockedFor(email: string) {
    return Math.max(
      0,
      await this.infrastructure.redis.pttl(`login-lock:${email}`),
    );
  }

  /** Five failures within 15 minutes lock that email for 15 minutes. */
  async recordFailure(email: string) {
    const redis = this.infrastructure.redis;
    const failures = await redis.incr(`login-fail:${email}`);
    if (failures === 1) await redis.pexpire(`login-fail:${email}`, LOCKOUT_MS);
    if (failures >= 5) {
      await redis.set(`login-lock:${email}`, '1', 'PX', LOCKOUT_MS);
      await redis.del(`login-fail:${email}`);
    }
  }

  async clearFailures(email: string) {
    await this.infrastructure.redis.del(
      `login-fail:${email}`,
      `login-lock:${email}`,
    );
  }

  /** The signed-in, active user; 401 `session_expired` when a cookie outlived its session. */
  async resolve(request: Request): Promise<User> {
    const id = sessionIdFrom(request);
    const userId = id
      ? await this.infrastructure.redis.getex(
          key(id),
          'EX',
          this.config.SESSION_TTL_SECONDS,
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
/** No session needed (health checks, sign-in). */
export const Public = () => SetMetadata(PUBLIC, true);
/** Restrict a route or controller to these roles; others get 403. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

type AuthenticatedRequest = Request & { user?: User };

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
