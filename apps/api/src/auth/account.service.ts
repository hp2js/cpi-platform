import { Inject, Injectable } from '@nestjs/common';
import {
  passwordProblems,
  type Account,
  type accountUpdateSchema,
  type changePasswordSchema,
} from '@cpi/contracts';
import type { z } from 'zod';
import { CONFIG, type AppConfig } from '../config';
import { DB, write, type Database, type Db } from '../database/db';
import { Events } from '../events/events';
import { ApiError } from '../http/api-error';
import { AuthRepository } from './auth.repository';
import { hashPassword, passwordMatches } from './passwords';
import { assignedInstitutionIds, reviewerName } from './scope';
import type { User } from './sessions';

/**
 * My account: every signed-in user maintains their own name, job title and phone. Email and
 * role are the sign-in identity and scope, managed by the administrator, so they are shown
 * but not editable here.
 */
@Injectable()
export class AccountService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly repository: AuthRepository,
    private readonly events: Events,
  ) {}

  get(user: User): Promise<Account> {
    return this.account(this.db, user);
  }

  update(
    user: User,
    input: z.infer<typeof accountUpdateSchema>,
  ): Promise<Account> {
    return write(this.db, async (tx, businessTime) => {
      const changed = (['displayName', 'jobTitle', 'phone'] as const).filter(
        (key) => user[key] !== input[key],
      );
      const updated = await this.repository.updateUser(user.id, input, tx);
      await this.events.audit(
        tx,
        businessTime,
        updated,
        'account.update',
        { type: 'user', id: user.id },
        changed.length ? `Updated ${changed.join(', ')}` : 'No changes',
      );
      return this.account(tx, updated);
    });
  }

  /** Also how a person replaces their emailed temporary password, which ends that state. */
  async changePassword(
    user: User,
    input: z.infer<typeof changePasswordSchema>,
  ): Promise<void> {
    const temporary = user.passwordExpiresAt !== null;
    if (
      !temporary &&
      !(await passwordMatches(
        user,
        input.currentPassword ?? '',
        this.config.DEMO_MODE,
      ))
    )
      throw wrongCurrentPassword();
    const problems = passwordProblems(input.newPassword, user.email);
    if (temporary && (await passwordMatches(user, input.newPassword, false)))
      problems.push('Choose a password different from the emailed one.');
    if (problems.length)
      throw new ApiError(422, problems.join(' '), 'weak_password', {
        newPassword: problems.join(' '),
      });
    const passwordHash = await hashPassword(input.newPassword);
    await write(this.db, async (tx, businessTime) => {
      await this.repository.updateUser(
        user.id,
        { passwordHash, passwordExpiresAt: null, authLink: null },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        temporary ? 'account.activate' : 'account.password_change',
        { type: 'user', id: user.id },
        temporary
          ? 'Temporary password replaced at first sign-in'
          : 'Password changed',
      );
    });
  }

  private async account(db: Db, user: User): Promise<Account> {
    const institution = user.institutionId
      ? await this.repository.institution(user.institutionId, db)
      : undefined;
    const reviewer = institution
      ? await reviewerName(db, institution.id)
      : undefined;
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
      phone: user.phone,
      institution: institution ?? null,
      reviewingOfficer: reviewer ?? null,
      portfolioSize:
        user.role === 'officer'
          ? (await assignedInstitutionIds(db, user.id)).length
          : null,
    };
  }
}

/** A malformed body and a wrong current password get the same answer. */
export const wrongCurrentPassword = () =>
  new ApiError(422, 'Your current password is not right.', 'invalid_password', {
    currentPassword: 'Your current password is not right.',
  });
