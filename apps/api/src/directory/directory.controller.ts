import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import {
  accountingOfficerSchema,
  type AccountingOfficer,
  type Assignment,
  type Cycle,
  type Institution,
  type InstitutionProfile,
  type Obligation,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { ApiError } from '../http/api-error';
import { SchemaValidationPipe } from '../http/validation.pipe';
import { DirectoryService } from './directory.service';

@Controller()
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get('cycles/current')
  cycle(): Promise<Cycle> {
    return this.directory.cycle();
  }

  @Get('institutions')
  institutions(@CurrentUser() user: User): Promise<Institution[]> {
    return this.directory.institutions(user);
  }

  @Get('institutions/:institutionId')
  institution(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
  ): Promise<Institution> {
    return this.directory.institution(user, id);
  }

  @Get('obligations')
  obligations(
    @CurrentUser() user: User,
    @Query('institutionId') filter?: string,
  ): Promise<Obligation[]> {
    return this.directory.obligations(user, filter);
  }

  @Get('assignments')
  @Roles('officer', 'supervisor', 'administrator')
  assignments(@CurrentUser() user: User): Promise<Assignment[]> {
    return this.directory.assignments(user);
  }

  /** A focal person's own institution: its record, reviewing officer and focal persons. */
  @Get('institution-profile')
  @Roles('institution')
  profile(@CurrentUser() user: User): Promise<InstitutionProfile> {
    return this.directory.profile(user);
  }

  /**
   * The institution knows first when its Accounting Officer changes, so its focal persons keep
   * the contact current. Name, type and ID stay with the administrator. Audited; the officer
   * is told.
   */
  @Put('institution-profile/accounting-officer')
  @Roles('institution')
  updateAccountingOfficer(
    @CurrentUser() user: User,
    @Body(
      new SchemaValidationPipe(accountingOfficerSchema, (error) => {
        const fieldErrors: Record<string, string> = {};
        for (const issue of error.issues)
          fieldErrors[String(issue.path[0])] ??= issue.message;
        return new ApiError(
          422,
          'Check the Accounting Officer’s details.',
          'invalid_request',
          fieldErrors,
        );
      }),
    )
    body: AccountingOfficer,
  ): Promise<{ ok: true }> {
    return this.directory.updateAccountingOfficer(user, body);
  }
}
