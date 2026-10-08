import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Foundations } from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { MAX_FILE_BYTES } from '../reporting/rules';
import {
  FoundationsService,
  type Upload,
  type UploadFields,
} from './foundations.service';

/** Procedures, risk assessment and mitigation plan documents (PRD §10.3, AT28). */
@Controller()
export class FoundationsController {
  constructor(private readonly foundations: FoundationsService) {}

  @Get('institutions/:institutionId/foundations')
  get(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
  ): Promise<Foundations> {
    return this.foundations.get(user, institutionId);
  }

  @Post('institutions/:institutionId/foundations')
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
  upload(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @UploadedFile() file: Upload,
    @Body() body: UploadFields,
  ): Promise<Foundations> {
    return this.foundations.upload(user, institutionId, file, body);
  }

  @Post('foundation-versions/:versionId/withdraw')
  @HttpCode(200)
  @Roles('institution')
  withdraw(
    @CurrentUser() user: User,
    @Param('versionId') id: string,
    @Body() body: unknown,
  ): Promise<Foundations> {
    return this.foundations.withdraw(user, id, body);
  }

  @Put('institutions/:institutionId/foundations/:kind/review')
  @Roles('officer', 'supervisor', 'administrator')
  review(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Param('kind') kind: string,
    @Body() body: unknown,
  ): Promise<Foundations> {
    return this.foundations.review(user, institutionId, kind, body);
  }

  /** No valid document at the cutoff: an explicit 0 of 4 with a reason (AT28). */
  @Post('institutions/:institutionId/foundations/:kind/unsupported')
  @HttpCode(200)
  @Roles('officer', 'supervisor', 'administrator')
  unsupported(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Param('kind') kind: string,
    @Body() body: unknown,
  ): Promise<Foundations> {
    return this.foundations.unsupported(user, institutionId, kind, body);
  }
}
