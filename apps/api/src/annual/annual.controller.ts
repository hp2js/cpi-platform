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
  exportCsv,
  extensionRequestSchema,
  publishRequestSchema,
  type AnnualEvaluation,
  type AnnualOverview,
  type ConsolidatedReport,
  type InstitutionResults,
  type Oversight,
  type CorrectionRequest,
  type ExportPayload,
  type ExtensionRequest,
  type PublishRequest,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { ApiError, invalidBody } from '../http/api-error';
import {
  SchemaValidationPipe,
  type QueryFilters,
} from '../http/validation.pipe';
import { AnnualService } from './annual.service';

/** Sends the export as an attachment named `name` in `format`. */
function download(
  response: Response,
  name: string,
  format: 'csv' | 'json',
  payload: ExportPayload,
) {
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${name}.${format}"`,
  );
  if (format === 'json') return payload;
  response.type('text/csv; charset=utf-8');
  return exportCsv(payload);
}

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
    input: PublishRequest,
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
    input: ExtensionRequest,
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
    input: CorrectionRequest,
  ): Promise<AnnualOverview> {
    return this.annual.openCorrection(user, input);
  }

  @Get('annual/report')
  @Roles('supervisor', 'administrator')
  report(@CurrentUser() user: User): Promise<ConsolidatedReport> {
    return this.annual.report(user);
  }

  /** The versioned export (PRD §12.3) as CSV or JSON; the two carry the same rows. */
  @Get('annual/report.csv')
  @Roles('supervisor', 'administrator')
  reportCsv(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.reportExport(user, response, 'csv');
  }

  @Get('annual/report.json')
  @Roles('supervisor', 'administrator')
  reportJson(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.reportExport(user, response, 'json');
  }

  private async reportExport(
    user: User,
    response: Response,
    format: 'csv' | 'json',
  ) {
    const payload = await this.annual.reportExport(user, format);
    return download(response, 'cpi-consolidated-results', format, payload);
  }

  /** Institution: only its own released results; nothing numerical before release (AT18, AT19). */
  @Get('results')
  @Roles('institution')
  results(@CurrentUser() user: User): Promise<InstitutionResults> {
    return this.annual.results(user);
  }

  @Get('results/export.csv')
  @Roles('institution')
  resultsCsv(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.resultsExport(user, response, 'csv');
  }

  @Get('results/export.json')
  @Roles('institution')
  resultsJson(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.resultsExport(user, response, 'json');
  }

  private async resultsExport(
    user: User,
    response: Response,
    format: 'csv' | 'json',
  ) {
    const payload = await this.annual.resultsExport(user, format);
    return download(
      response,
      `cpi-result-${user.institutionId}`,
      format,
      payload,
    );
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
