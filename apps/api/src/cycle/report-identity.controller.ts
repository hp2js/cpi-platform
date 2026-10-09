import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  REPORT_IMAGE_LIMITS,
  reportIdentityUpdateSchema,
  reportImageSlotSchema,
  type ReportIdentity,
  type ReportIdentitySettings,
  type ReportIdentityUpdate,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { notFound } from '../http/api-error';
import { SchemaValidationPipe } from '../http/validation.pipe';
import { ReportIdentityService } from './report-identity.service';
import { invalidSettings } from './settings.service';

const slotOf = (slot: string) => {
  const parsed = reportImageSlotSchema.safeParse(slot);
  if (!parsed.success) throw notFound();
  return parsed.data;
};

/**
 * The annual report's identity (HP2-65). Every signed-in role reads it and its images to render
 * reports; only administrators change it.
 */
@Controller()
export class ReportIdentityController {
  constructor(private readonly identity: ReportIdentityService) {}

  @Get('report-identity')
  current(): Promise<ReportIdentity> {
    return this.identity.current();
  }

  @Get('report-identity/images/:imageId')
  async image(
    @Param('imageId') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.identity.image(id);
    response
      .setHeader('Cache-Control', 'private, max-age=3600')
      .setHeader('Content-Length', String(image.bytes.byteLength))
      .type(image.mimeType)
      .send(image.bytes);
  }

  @Get('settings/report-identity')
  @Roles('administrator')
  settings(): Promise<ReportIdentitySettings> {
    return this.identity.settings();
  }

  @Put('settings/report-identity')
  @Roles('administrator')
  update(
    @CurrentUser() user: User,
    @Body(new SchemaValidationPipe(reportIdentityUpdateSchema, invalidSettings))
    input: ReportIdentityUpdate,
  ): Promise<ReportIdentitySettings> {
    return this.identity.update(user, input);
  }

  @Post('settings/report-identity/images/:slot')
  @Roles('administrator')
  @UseInterceptors(
    FileInterceptor('file', {
      // A little over the limit, so the service can say what the limit is.
      limits: {
        fileSize: REPORT_IMAGE_LIMITS.maxBytes + 1,
        files: 1,
        parts: 2,
      },
    }),
  )
  upload(
    @CurrentUser() user: User,
    @Param('slot') slot: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<ReportIdentitySettings> {
    return this.identity.uploadImage(user, slotOf(slot), file);
  }

  @Delete('settings/report-identity/images/:slot')
  @Roles('administrator')
  remove(
    @CurrentUser() user: User,
    @Param('slot') slot: string,
  ): Promise<ReportIdentitySettings> {
    return this.identity.removeImage(user, slotOf(slot));
  }
}
