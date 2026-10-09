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
import type {
  FormCheck,
  FormCreation,
  FormValidation,
  FormVersion,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { FormsService } from './forms.service';

/**
 * Reporting form versions (FR03). Drafts are administrator-only. Bodies are validated by the
 * service after the version is found and its status checked.
 */
@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<FormVersion[]> {
    return this.forms.list(user);
  }

  /** Whether a new version can be started now (FR03). Declared before `:formId`. */
  @Get('creation')
  @Roles('administrator')
  creation(): Promise<FormCreation> {
    return this.forms.creation();
  }

  @Get(':formId')
  get(
    @CurrentUser() user: User,
    @Param('formId') id: string,
  ): Promise<FormVersion> {
    return this.forms.get(user, id);
  }

  @Get(':formId/validation')
  @Roles('administrator')
  validation(@Param('formId') id: string): Promise<FormValidation> {
    return this.forms.validation(id);
  }

  /** Checks a draft as edited, without saving it: issues, changes and publication impact. */
  @Post(':formId/check')
  @HttpCode(200)
  @Roles('administrator')
  check(
    @Param('formId') id: string,
    @Body() body: unknown,
  ): Promise<FormCheck> {
    return this.forms.check(id, body);
  }

  @Put(':formId')
  @Roles('administrator')
  update(
    @CurrentUser() user: User,
    @Param('formId') id: string,
    @Body() body: unknown,
  ) {
    return this.forms.update(user, id, body);
  }

  @Post(':formId/publish')
  @HttpCode(200)
  @Roles('administrator')
  publish(@CurrentUser() user: User, @Param('formId') id: string) {
    return this.forms.publish(user, id);
  }

  @Post()
  @Roles('administrator')
  create(@CurrentUser() user: User) {
    return this.forms.create(user);
  }

  /** An unpublished draft can be discarded with a reason; the first version cannot. */
  @Delete(':formId')
  @HttpCode(204)
  @Roles('administrator')
  discard(
    @CurrentUser() user: User,
    @Param('formId') id: string,
    @Body() body: unknown,
  ): Promise<void> {
    return this.forms.discard(user, id, body);
  }
}
