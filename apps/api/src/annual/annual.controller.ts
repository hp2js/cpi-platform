import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  correctionRequestSchema,
  extensionRequestSchema,
  publishRequestSchema,
  type AnnualEvaluation,
  type AnnualOverview,
  type ConsolidatedReport,
  type InstitutionResults,
  type Oversight,
} from '@cpi/contracts';
import type { z } from 'zod';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { ApiError, invalidBody } from '../http/api-error';
import {
  SchemaValidationPipe,
  type QueryFilters,
} from '../http/validation.pipe';
import { AnnualService } from './annual.service';

/** Marks the response as a CSV download named `name`. */
const csvDownload = (response: Response, name: string) =>
  response
    .type('text/csv; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="${name}"`);

/** Annual evaluation, publication and corrections (PRD §7.4, §7.6, FR12–FR13, FR16). */
@Controller()
export class AnnualController {
  constructor(private readonly annual: AnnualService) {}

  @Get('annual')
  @Roles('supervisor', 'administrator', 'officer')
  overview(@CurrentUser() user: User): Promise<AnnualOverview> {
    return this.annual.annual(user);
  }

  @Post('annual/publish')
  @HttpCode(200)
  @Roles('administrator')
  publish(
    @CurrentUser() user: User,
    @Body(
      new SchemaValidationPipe(
        publishRequestSchema,
        invalidBody('Choose at least one institution to publish.'),
      ),
    )
    input: z.infer<typeof publishRequestSchema>,
  ): Promise<AnnualOverview> {
    return this.annual.publish(user, input);
  }

  @Post('annual/extensions')
  @HttpCode(200)
  @Roles('administrator')
  extend(
    @CurrentUser() user: User,
    @Body(
      new SchemaValidationPipe(
        extensionRequestSchema,
        (error) =>
          new ApiError(
            422,
            'Give the new date, who authorized it and a reason of at least 10 characters.',
            'invalid_request',
            Object.fromEntries(
              error.issues.map((issue) => [
                issue.path.join('.'),
                issue.message,
              ]),
            ),
          ),
      ),
    )
    input: z.infer<typeof extensionRequestSchema>,
  ): Promise<AnnualEvaluation> {
    return this.annual.extend(user, input);
  }

  @Post('annual/corrections')
  @Roles('administrator')
  openCorrection(
    @CurrentUser() user: User,
    @Body(
      new SchemaValidationPipe(
        correctionRequestSchema,
        invalidBody(
          'Choose the quarter and give a reason of at least 10 characters.',
          { reason: 'Give a reason of at least 10 characters.' },
        ),
      ),
    )
    input: z.infer<typeof correctionRequestSchema>,
  ): Promise<AnnualOverview> {
    return this.annual.openCorrection(user, input);
  }

  @Get('annual/report')
  @Roles('supervisor', 'administrator')
  report(@CurrentUser() user: User): Promise<ConsolidatedReport> {
    return this.annual.report(user);
  }

  @Get('annual/report.csv')
  @Roles('supervisor', 'administrator')
  async reportCsv(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const csv = await this.annual.reportCsv(user);
    csvDownload(response, 'cpi-consolidated-results.csv');
    return csv;
  }

  /** Institution: only its own released results; nothing numerical before release (AT18, AT19). */
  @Get('results')
  @Roles('institution')
  results(@CurrentUser() user: User): Promise<InstitutionResults> {
    return this.annual.results(user);
  }

  @Get('results/export.csv')
  @Roles('institution')
  async resultsCsv(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const csv = await this.annual.resultsCsv(user);
    csvDownload(response, `cpi-result-${user.institutionId}.csv`);
    return csv;
  }

  /** The body is validated by the service after scope and assignment checks. */
  @Post('obligations/:obligationId/close-nonresponse')
  @HttpCode(200)
  @Roles('officer', 'supervisor', 'administrator')
  closeNonresponse(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
    @Body() body: unknown,
  ): Promise<AnnualEvaluation> {
    return this.annual.closeNonresponse(user, id, body);
  }

  /**
   * Dashboard metrics as defined in PRD §4.3, filtered to the caller's authorized scope.
   * Officers see their own portfolio: the scope limits them to it (PRD §5.2).
   */
  @Get('oversight')
  @Roles('officer', 'supervisor', 'administrator')
  oversight(
    @CurrentUser() user: User,
    @Query() query: QueryFilters,
  ): Promise<Oversight> {
    return this.annual.oversight(user, query);
  }
}
