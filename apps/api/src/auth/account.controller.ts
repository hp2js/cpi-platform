import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import {
  accountUpdateSchema,
  changePasswordSchema,
  passwordProblems,
  type Account,
} from '@cpi/contracts';
import { CONFIG, type AppConfig } from '../config';
import { write, type Db } from '../database/db';
import { assignments, institutions, users } from '../database/schema';
import { Events } from '../events/events';
import { ApiError } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { hashPassword, passwordMatches } from './passwords';
import { assignedInstitutionIds } from './scope';
import { CurrentUser, type User } from './sessions';

/**
 * My account: every signed-in user maintains their own name, job title and phone. Email and
 * role are the sign-in identity and scope, managed by the administrator, so they are shown
 * but not editable here.
 */
async function account(db: Db, user: User): Promise<Account> {
  const [institution] = user.institutionId
    ? await db
        .select({ id: institutions.id, name: institutions.name })
        .from(institutions)
        .where(eq(institutions.id, user.institutionId))
    : [];
  const [reviewer] = institution
    ? await db
        .select({ name: users.displayName })
        .from(assignments)
        .innerJoin(users, eq(users.id, assignments.officerId))
        .where(
          and(
            eq(assignments.institutionId, institution.id),
            isNull(assignments.validTo),
          ),
        )
    : [];
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    jobTitle: user.jobTitle,
    phone: user.phone,
    institution: institution ?? null,
    reviewingOfficer: reviewer?.name ?? null,
    portfolioSize:
      user.role === 'officer'
        ? (await assignedInstitutionIds(db, user.id)).length
        : null,
  };
}

@Controller('account')
export class AccountController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  @Get()
  get(@CurrentUser() user: User) {
    return account(this.db, user);
  }

  @Put()
  update(@CurrentUser() user: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const parsed = accountUpdateSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Some details need attention.',
          'invalid_account',
          Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join('.'),
              issue.message,
            ]),
          ),
        );
      const changed = (['displayName', 'jobTitle', 'phone'] as const).filter(
        (key) => user[key] !== parsed.data[key],
      );
      const [updated] = await tx
        .update(users)
        .set(parsed.data)
        .where(eq(users.id, user.id))
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        updated!,
        'account.update',
        { type: 'user', id: user.id },
        changed.length ? `Updated ${changed.join(', ')}` : 'No changes',
      );
      return account(tx, updated!);
    });
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: User, @Body() body: unknown) {
    const parsed = changePasswordSchema.safeParse(body);
    if (
      !parsed.success ||
      !(await passwordMatches(
        user,
        parsed.data.currentPassword,
        this.config.DEMO_MODE,
      ))
    )
      throw new ApiError(
        422,
        'Your current password is not right.',
        'invalid_password',
        { currentPassword: 'Your current password is not right.' },
      );
    const problems = passwordProblems(parsed.data.newPassword, user.email);
    if (problems.length)
      throw new ApiError(422, problems.join(' '), 'weak_password', {
        newPassword: problems.join(' '),
      });
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await write(this.db, async (tx, businessTime) => {
      await tx
        .update(users)
        .set({ passwordHash, authLink: null })
        .where(eq(users.id, user.id));
      await this.events.audit(
        tx,
        businessTime,
        user,
        'account.password_change',
        { type: 'user', id: user.id },
        'Password changed',
      );
    });
  }
}
