import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  supportAccessRequestSchema,
  type AdminAttention,
  type AuditPage,
  type ReportBundle,
  type SupportAccessRequest,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { invalidBody } from '../http/api-error';
import {
  SchemaValidationPipe,
  type QueryFilters,
} from '../http/validation.pipe';
import { AdminService } from './admin.service';

/** Administrator console: audit log, attention list and support access (FR10, PRD §5.2, §9). */
@Controller()
@Roles('administrator')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** The audit log, filtered and paged on the server (FR10). */
  @Get('audit')
  audit(@Query() query: QueryFilters): Promise<AuditPage> {
    return this.admin.audit(query);
  }

  /** The same filters as a CSV file for auditors; cells are encoded against formula injection. */
  @Get('audit.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="cpi-audit-log.csv"')
  auditCsv(@Query() query: QueryFilters): Promise<string> {
    return this.admin.auditCsv(query);
  }

  /** What needs the administrator now, each with a link to where it is handled (PRD §9). */
  @Get('admin/attention')
  attention(): Promise<AdminAttention> {
    return this.admin.attention();
  }

  /**
   * Read-only support access to an institution's report as it stands, including an unsaved
   * draft (PRD §5.2: "logged support access only"). Each view needs a reason, is audited, and
   * the institution is told. Administrators never edit or submit on an institution's behalf.
   */
  @Post('support/obligations/:obligationId')
  @HttpCode(200)
  support(
    @CurrentUser() admin: User,
    @Param('obligationId') id: string,
    @Body(
      new SchemaValidationPipe(
        supportAccessRequestSchema,
        invalidBody('Give the support reason in at least 20 characters.', {
          reason: 'Give the support reason in at least 20 characters.',
        }),
      ),
    )
    body: SupportAccessRequest,
  ): Promise<ReportBundle> {
    return this.admin.support(admin, id, body.reason);
  }
}
