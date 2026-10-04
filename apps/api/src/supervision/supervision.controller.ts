import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  assignmentChangeRequestSchema,
  bulkAssignmentRequestSchema,
  bulkSupervisionRequestSchema,
  reassignmentSuggestionRequestSchema,
  suggestionDismissRequestSchema,
  supervisionChangeRequestSchema,
  type Assignment,
  type ReassignmentSuggestion,
  type Supervision,
  type AssignmentChangeRequest,
  type BulkAssignmentRequest,
  type BulkSupervisionRequest,
  type ReassignmentSuggestionRequest,
  type SuggestionDismissRequest,
  type SupervisionChangeRequest,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { invalidBody } from '../http/api-error';
import { SchemaValidationPipe } from '../http/validation.pipe';
import { SupervisionService } from './supervision.service';

/** Supervision, reassignment requests and bulk moves (PRD §5.2). */
@Controller()
export class SupervisionController {
  constructor(private readonly supervision: SupervisionService) {}

  /**
   * Supervisor records. Administrators see all; supervisors, the history of the institutions
   * they currently supervise; officers, the current supervisor of their own institutions.
   */
  @Get('supervision')
  @Roles('officer', 'supervisor', 'administrator')
  list(@CurrentUser() user: User): Promise<Supervision[]> {
    return this.supervision.supervision(user);
  }

  /** Assigns or changes an institution's supervisor; access follows at once (PRD §5.2). */
  @Post('supervision')
  @HttpCode(200)
  @Roles('administrator')
  changeSupervisor(
    @CurrentUser() admin: User,
    @Body(
      new SchemaValidationPipe(
        supervisionChangeRequestSchema,
        invalidBody(
          'Choose a supervisor and give a reason of at least 10 characters.',
          { reason: 'Give a reason of at least 10 characters.' },
        ),
      ),
    )
    body: SupervisionChangeRequest,
  ): Promise<{ ok: true }> {
    return this.supervision.changeSupervisor(admin, body);
  }

  /** Every assignment record in the caller's scope, including ended ones and cover. */
  @Get('assignments/history')
  @Roles('administrator', 'supervisor', 'officer')
  history(@CurrentUser() user: User): Promise<Assignment[]> {
    return this.supervision.history(user);
  }

  /** Reassignment takes effect immediately for access; history keeps earlier reviewers (FR01, AT22). */
  @Post('assignments')
  @HttpCode(200)
  @Roles('administrator')
  reassign(
    @CurrentUser() admin: User,
    @Body(
      new SchemaValidationPipe(
        assignmentChangeRequestSchema,
        invalidBody(
          'Choose an officer and give a reason of at least 10 characters.',
          { reason: 'Give a reason of at least 10 characters.' },
        ),
      ),
    )
    body: AssignmentChangeRequest,
  ): Promise<{ ok: true }> {
    return this.supervision.reassign(admin, body);
  }

  @Get('assignment-suggestions')
  @Roles('officer', 'supervisor', 'administrator')
  suggestions(@CurrentUser() user: User): Promise<ReassignmentSuggestion[]> {
    return this.supervision.suggestions(user);
  }

  /**
   * A supervisor suggests a reassignment, or an officer declares a conflict of interest about
   * their own institution. Only the administrator can apply either.
   */
  @Post('assignment-suggestions')
  @Roles('supervisor', 'officer')
  suggest(
    @CurrentUser() user: User,
    @Body(
      new SchemaValidationPipe(
        reassignmentSuggestionRequestSchema,
        invalidBody('Give a reason of at least 10 characters.', {
          reason: 'Give a reason of at least 10 characters.',
        }),
      ),
    )
    body: ReassignmentSuggestionRequest,
  ): Promise<ReassignmentSuggestion> {
    return this.supervision.suggest(user, body);
  }

  @Post('assignment-suggestions/:suggestionId/dismiss')
  @HttpCode(200)
  @Roles('administrator')
  dismiss(
    @CurrentUser() admin: User,
    @Param('suggestionId') id: string,
    @Body(
      new SchemaValidationPipe(
        suggestionDismissRequestSchema,
        invalidBody('Explain the decision in at least 10 characters.', {
          note: 'Explain the decision in at least 10 characters.',
        }),
      ),
    )
    body: SuggestionDismissRequest,
  ): Promise<ReassignmentSuggestion> {
    return this.supervision.dismiss(admin, id, body.note);
  }

  /** Many institutions to one officer; each keeps its own history entry and notifications. */
  @Post('assignments/bulk')
  @HttpCode(200)
  @Roles('administrator')
  bulkAssign(
    @CurrentUser() admin: User,
    @Body(
      new SchemaValidationPipe(
        bulkAssignmentRequestSchema,
        invalidBody(
          'Choose institutions, an officer and a reason of at least 10 characters.',
        ),
      ),
    )
    body: BulkAssignmentRequest,
  ) {
    return this.supervision.bulkAssign(admin, body);
  }

  @Post('supervision/bulk')
  @HttpCode(200)
  @Roles('administrator')
  bulkSupervise(
    @CurrentUser() admin: User,
    @Body(
      new SchemaValidationPipe(
        bulkSupervisionRequestSchema,
        invalidBody(
          'Choose institutions, a supervisor and a reason of at least 10 characters.',
        ),
      ),
    )
    body: BulkSupervisionRequest,
  ) {
    return this.supervision.bulkSupervise(admin, body);
  }
}
