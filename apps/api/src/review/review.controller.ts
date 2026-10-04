import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  EvidenceLookupItem,
  ReviewBundle,
  ReviewQueueItem,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import {
  ReviewService,
  type EvidenceFilters,
  type ReviewOverride,
} from './review.service';

/** An administrator's justified override: `X-Override-Reason` and the action path after the ID. */
const Override = createParamDecorator(
  (_: unknown, context: ExecutionContext): ReviewOverride => {
    const request = context.switchToHttp().getRequest<Request>();
    return {
      reason: request.header('X-Override-Reason')?.trim(),
      action: request.path.split('/').slice(4).join('/') || 'review',
    };
  },
);

/**
 * The officer review workflow (PRD §7.3, FR08–FR10, FR15). Action bodies are validated by the
 * service after scope and assignment checks.
 */
@Controller()
@Roles('officer', 'supervisor', 'administrator')
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  /** FR15: scoped lookup only; out-of-scope files never appear in results or counts. */
  @Get('evidence')
  evidence(
    @CurrentUser() user: User,
    @Query() query: EvidenceFilters,
  ): Promise<EvidenceLookupItem[]> {
    return this.review.evidence(user, query);
  }

  @Get('reviews')
  queue(
    @CurrentUser() user: User,
    @Query('status') status = 'open',
  ): Promise<ReviewQueueItem[]> {
    return this.review.queue(user, status);
  }

  @Get('reviews/:submissionId')
  bundle(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
  ): Promise<ReviewBundle> {
    return this.review.bundle(user, id);
  }

  @Put('reviews/:submissionId/decisions/:milestoneCode')
  decide(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Param('milestoneCode') code: string,
    @Body() body: unknown,
    @Override() override: ReviewOverride,
  ): Promise<ReviewBundle> {
    return this.review.decide(user, id, code, body, override);
  }

  @Put('reviews/:submissionId/evidence/:evidenceId/suitability')
  suitability(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Param('evidenceId') evidenceId: string,
    @Body() body: unknown,
    @Override() override: ReviewOverride,
  ): Promise<ReviewBundle> {
    return this.review.suitability(user, id, evidenceId, body, override);
  }

  @Post('reviews/:submissionId/clarifications/:clarificationId/close')
  @HttpCode(200)
  closeClarification(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Param('clarificationId') clarificationId: string,
    @Body() body: unknown,
    @Override() override: ReviewOverride,
  ): Promise<ReviewBundle> {
    return this.review.closeClarification(
      user,
      id,
      clarificationId,
      body,
      override,
    );
  }

  /** Oversight comments are guidance for the officer, never an approval gate (PRD §5.2, §7.3). */
  @Post('reviews/:submissionId/comments')
  @HttpCode(200)
  @Roles('supervisor')
  comment(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Body() body: unknown,
  ): Promise<ReviewBundle> {
    return this.review.comment(user, id, body);
  }

  /** A reply in an oversight comment's thread; the assigned officer may mark it addressed. */
  @Post('reviews/:submissionId/comments/:commentId/replies')
  @HttpCode(200)
  @Roles('officer', 'supervisor')
  reply(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Param('commentId') commentId: string,
    @Body() body: unknown,
  ): Promise<ReviewBundle> {
    return this.review.reply(user, id, commentId, body);
  }

  @Post('reviews/:submissionId/decisions/:milestoneCode/carry-forward')
  @HttpCode(200)
  carryForward(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Param('milestoneCode') code: string,
    @Body() body: unknown,
    @Override() override: ReviewOverride,
  ): Promise<ReviewBundle> {
    return this.review.carryForward(user, id, code, body, override);
  }

  @Post('reviews/:submissionId/clarifications')
  requestClarification(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Body() body: unknown,
    @Override() override: ReviewOverride,
  ): Promise<ReviewBundle> {
    return this.review.requestClarification(user, id, body, override);
  }

  @Post('reviews/:submissionId/finalize')
  @HttpCode(200)
  finalize(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Body() body: unknown,
    @Override() override: ReviewOverride,
  ): Promise<ReviewBundle> {
    return this.review.finalize(user, id, body, override);
  }

  @Post('reviews/:submissionId/reopen')
  @HttpCode(200)
  reopen(
    @CurrentUser() user: User,
    @Param('submissionId') id: string,
    @Body() body: unknown,
    @Override() override: ReviewOverride,
  ): Promise<ReviewBundle> {
    return this.review.reopen(user, id, body, override);
  }
}
