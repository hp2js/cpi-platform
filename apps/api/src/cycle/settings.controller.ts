import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import type { z } from 'zod';
import {
  calendarUpdateSchema,
  institutionCreateSchema,
  institutionImportRequestSchema,
  institutionTypeUpdateSchema,
  institutionUpdateSchema,
  riskScaleUpdateSchema,
  userCreateSchema,
  userRoleChangeSchema,
  userStatusSchema,
  userUpdateSchema,
  type CalendarSettings,
  type People,
  type ProfilesState,
  type RiskScaleSettings,
  type CalendarUpdate,
  type InstitutionCreate,
  type InstitutionImportRequest,
  type InstitutionTypeUpdate,
  type InstitutionUpdate,
  type RiskScaleUpdate,
  type UserCreate,
  type UserRoleChange,
  type UserStatus,
  type UserUpdate,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { invalidBody } from '../http/api-error';
import { SchemaValidationPipe } from '../http/validation.pipe';
import { PeopleService } from './people.service';
import { SettingsService, invalidSettings } from './settings.service';

/** A settings body, failing with the settings screens' 422. */
const settings = <T>(schema: z.ZodType<T>) =>
  new SchemaValidationPipe(schema, invalidSettings);

/**
 * Administrator settings (PRD §7.1, FR01, FR02, §10.1). Scoring profiles, calendar and risk
 * scale are in SettingsService; users, institutions and types in PeopleService.
 */
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly people: PeopleService,
  ) {}

  /* Scoring profiles: administrators manage them; supervisors and officers read the rules in use. */

  @Get('profiles')
  @Roles('administrator', 'supervisor', 'officer')
  profiles(): Promise<ProfilesState> {
    return this.settings.profiles();
  }

  @Post('profiles')
  @Roles('administrator')
  createProfile(
    @CurrentUser() user: User,
    @Body() body: { basedOn?: unknown } | undefined,
  ) {
    return this.settings.createProfile(user, body?.basedOn);
  }

  /** The body is validated after the profile is found and checked to be a draft. */
  @Put('profiles/:profileId')
  @Roles('administrator')
  updateProfile(
    @CurrentUser() user: User,
    @Param('profileId') id: string,
    @Body() body: unknown,
  ) {
    return this.settings.updateProfile(user, id, body);
  }

  @Delete('profiles/:profileId')
  @Roles('administrator')
  deleteProfile(@CurrentUser() user: User, @Param('profileId') id: string) {
    return this.settings.deleteProfile(user, id);
  }

  @Post('profiles/:profileId/approve')
  @HttpCode(200)
  @Roles('administrator')
  approveProfile(@CurrentUser() user: User, @Param('profileId') id: string) {
    return this.settings.approveProfile(user, id);
  }

  @Post('profiles/:profileId/apply')
  @HttpCode(200)
  @Roles('administrator')
  applyProfile(@CurrentUser() user: User, @Param('profileId') id: string) {
    return this.settings.applyProfile(user, id);
  }

  /* Reporting calendar (FR02) */

  @Get('calendar')
  @Roles('administrator')
  calendar(): Promise<CalendarSettings> {
    return this.settings.calendar();
  }

  @Put('calendar')
  @Roles('administrator')
  updateCalendar(
    @CurrentUser() user: User,
    @Body(settings(calendarUpdateSchema))
    input: CalendarUpdate,
  ): Promise<CalendarSettings> {
    return this.settings.updateCalendar(user, input);
  }

  /* Risk rating scale: labels for the 1–5 ratings in risk registers (O16). */

  @Get('risk-scale')
  @Roles('administrator')
  riskScale(): Promise<RiskScaleSettings> {
    return this.settings.riskScale();
  }

  @Put('risk-scale')
  @Roles('administrator')
  updateRiskScale(
    @CurrentUser() user: User,
    @Body(settings(riskScaleUpdateSchema))
    input: RiskScaleUpdate,
  ): Promise<RiskScaleSettings> {
    return this.settings.updateRiskScale(user, input);
  }

  /* Users and institutions (FR01) */

  @Get('people')
  @Roles('administrator')
  listPeople(): Promise<People> {
    return this.people.list();
  }

  @Post('users')
  @Roles('administrator')
  createUser(
    @CurrentUser() admin: User,
    @Body(settings(userCreateSchema)) input: UserCreate,
  ): Promise<People> {
    return this.people.createUser(admin, input);
  }

  /** A new temporary password replaces the earlier one (e.g. it expired or the email was lost). */
  @Post('users/:userId/invitation')
  @HttpCode(200)
  @Roles('administrator')
  resendInvitation(
    @CurrentUser() admin: User,
    @Param('userId') id: string,
  ): Promise<People> {
    return this.people.resendInvitation(admin, id);
  }

  @Put('users/:userId')
  @Roles('administrator')
  updateUser(
    @CurrentUser() admin: User,
    @Param('userId') id: string,
    @Body(settings(userUpdateSchema)) input: UserUpdate,
  ): Promise<People> {
    return this.people.updateUser(admin, id, input);
  }

  /**
   * Changes an account's role, keeping one identity and its history. Scope must be handed over
   * first; the person's sessions end so the new permissions apply at the next sign-in.
   */
  @Put('users/:userId/role')
  @Roles('administrator')
  changeRole(
    @CurrentUser() admin: User,
    @Param('userId') id: string,
    @Body(
      new SchemaValidationPipe(
        userRoleChangeSchema,
        invalidBody(
          'Choose a role and give a reason of at least 10 characters.',
        ),
      ),
    )
    input: UserRoleChange,
  ): Promise<{ ok: boolean }> {
    return this.people.changeRole(admin, id, input);
  }

  @Post('users/:userId/status')
  @HttpCode(200)
  @Roles('administrator')
  userStatus(
    @CurrentUser() admin: User,
    @Param('userId') id: string,
    @Body(settings(userStatusSchema)) input: UserStatus,
  ): Promise<People> {
    return this.people.userStatus(admin, id, input);
  }

  @Put('institutions/:institutionId')
  @Roles('administrator')
  updateInstitution(
    @CurrentUser() admin: User,
    @Param('institutionId') id: string,
    @Body(settings(institutionUpdateSchema))
    input: InstitutionUpdate,
  ): Promise<People> {
    return this.people.updateInstitution(admin, id, input);
  }

  /* Institution types: a managed list; retiring keeps history, renaming updates labels. */

  @Post('institution-types')
  @Roles('administrator')
  createType(
    @CurrentUser() admin: User,
    @Body(settings(institutionTypeUpdateSchema))
    input: InstitutionTypeUpdate,
  ): Promise<People> {
    return this.people.createType(admin, input);
  }

  @Put('institution-types/:typeId')
  @Roles('administrator')
  updateType(
    @CurrentUser() admin: User,
    @Param('typeId') id: string,
    @Body(settings(institutionTypeUpdateSchema))
    input: InstitutionTypeUpdate,
  ): Promise<People> {
    return this.people.updateType(admin, id, input);
  }

  /* Onboarding institutions (FR01) */

  @Post('institutions')
  @Roles('administrator')
  createInstitution(
    @CurrentUser() admin: User,
    @Body(settings(institutionCreateSchema))
    input: InstitutionCreate,
  ): Promise<People> {
    return this.people.createInstitution(admin, input);
  }

  @Post('institutions/import/preview')
  @HttpCode(200)
  @Roles('administrator')
  previewImport(
    @Body(settings(institutionImportRequestSchema))
    input: InstitutionImportRequest,
  ) {
    return this.people.previewImport(input);
  }

  /** All or nothing: one invalid row means nothing is created, so a file can be fixed and re-run. */
  @Post('institutions/import')
  @HttpCode(200)
  @Roles('administrator')
  importInstitutions(
    @CurrentUser() admin: User,
    @Body(settings(institutionImportRequestSchema))
    input: InstitutionImportRequest,
  ) {
    return this.people.importInstitutions(admin, input);
  }
}
