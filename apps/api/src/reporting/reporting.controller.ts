import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type {
  Completeness,
  Draft,
  EvidenceItem,
  Receipt,
  ReportBundle,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { ApiError } from '../http/api-error';
import {
  ReportingService,
  type Upload,
  type UploadFields,
} from './reporting.service';
import { MAX_FILE_BYTES } from './rules';

/** Submission requires an Idempotency-Key header (AT06). */
const IdempotencyKey = createParamDecorator(
  (_: unknown, context: ExecutionContext): string => {
    const key = context
      .switchToHttp()
      .getRequest<Request>()
      .header('idempotency-key');
    if (!key || key.length > 200)
      throw new ApiError(
        400,
        'Submission requires an Idempotency-Key header.',
        'idempotency_key_required',
      );
    return key;
  },
);

/** `Content-Disposition` with an ASCII fallback and the UTF-8 name. */
const disposition = (kind: 'inline' | 'attachment', name: string) =>
  `${kind}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

/** Quarterly reporting by the institution (PRD §7.2, FR05–FR07). */
@Controller()
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('obligations/:obligationId/report')
  @Roles('institution')
  report(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
  ): Promise<ReportBundle> {
    return this.reporting.report(user, id);
  }

  /** The body is validated by the service, after scope and editability. */
  @Put('obligations/:obligationId/draft')
  @Roles('institution')
  saveDraft(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
    @Body() body: unknown,
  ): Promise<Draft> {
    return this.reporting.saveDraft(user, id, body);
  }

  @Get('obligations/:obligationId/completeness')
  @Roles('institution')
  completeness(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
  ): Promise<Completeness> {
    return this.reporting.completeness(user, id);
  }

  /** 201 for a new file; 200 when a retried upload matches one already stored. */
  @Post('obligations/:obligationId/evidence')
  @Roles('institution')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_FILE_BYTES,
        files: 1,
        fields: 8,
        fieldSize: 4096,
        parts: 9,
      },
      defParamCharset: 'utf8',
    }),
  )
  async upload(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
    @UploadedFile() file: Upload,
    @Body() fields: UploadFields,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EvidenceItem> {
    const { created, body } = await this.reporting.upload(
      user,
      id,
      file,
      fields,
    );
    if (!created) response.status(200);
    return body;
  }

  /** Streams the file; access rules are in `ReportingService.file`. */
  @Get('evidence/:evidenceId/file')
  async file(
    @CurrentUser() user: User,
    @Param('evidenceId') id: string,
    @Query('download') download: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.reporting.file(user, id);
    const kind = download === undefined ? 'inline' : 'attachment';
    response
      .setHeader('Cache-Control', 'private, no-store')
      .type(file.mimeType)
      .setHeader('Content-Disposition', disposition(kind, file.fileName));
    if (file.demonstration) response.setHeader('X-Demonstration-Copy', 'true');
    else response.setHeader('Content-Length', String(file.bytes.byteLength));
    response.send(file.bytes);
  }

  /** 201 with a new receipt; 200 with the original one when the key is replayed. */
  @Post('obligations/:obligationId/submit')
  @Roles('institution')
  async submit(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
    @IdempotencyKey() key: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Receipt> {
    const result = await this.reporting.submit(user, id, key, body);
    response.status(result.created ? 201 : 200);
    return result.body;
  }

  @Get('receipts')
  @Roles('institution')
  receipts(@CurrentUser() user: User): Promise<Receipt[]> {
    return this.reporting.receipts(user);
  }

  @Get('receipts/:receiptId')
  receipt(
    @CurrentUser() user: User,
    @Param('receiptId') id: string,
  ): Promise<Receipt> {
    return this.reporting.receipt(user, id);
  }
}
