import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  assistantSettingsRequestSchema,
  type AssistantSettings,
  type AssistantView,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { invalidBody } from '../http/api-error';
import { SchemaValidationPipe } from '../http/validation.pipe';
import { AssistantService } from './assistant.service';

/**
 * Evidence assistant (PRD §14). Institutions have no route here: suggestions never reach them.
 * Bodies of officer actions are validated after scope and assignment checks.
 */
@Controller()
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('reviews/:submissionId/evidence/:evidenceId/assistant')
  @Roles('officer', 'supervisor', 'administrator')
  view(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Param('evidenceId') evidenceId: string,
  ): Promise<AssistantView> {
    return this.assistant.view(user, id, evidenceId);
  }

  /** 202: the run continues in the background; poll the view for its outcome. */
  @Post('reviews/:submissionId/evidence/:evidenceId/assistant/runs')
  @HttpCode(202)
  @Roles('officer')
  run(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Param('evidenceId') evidenceId: string,
  ): Promise<AssistantView> {
    return this.assistant.run(user, id, evidenceId);
  }

  @Put('reviews/:submissionId/assistant/suggestions/:suggestionId')
  @Roles('officer')
  decide(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Param('suggestionId') suggestionId: string,
    @Body() body: unknown,
  ): Promise<AssistantView> {
    return this.assistant.decide(user, id, suggestionId, body);
  }

  @Get('admin/assistant')
  @Roles('administrator')
  settings(): Promise<AssistantSettings> {
    return this.assistant.settings();
  }

  @Put('admin/assistant')
  @Roles('administrator')
  update(
    @CurrentUser() user: User,
    @Body(
      new SchemaValidationPipe(
        assistantSettingsRequestSchema,
        invalidBody('Say whether the evidence assistant is on.'),
      ),
    )
    body: { enabled: boolean },
  ): Promise<AssistantSettings> {
    return this.assistant.setEnabled(user, body.enabled);
  }
}
