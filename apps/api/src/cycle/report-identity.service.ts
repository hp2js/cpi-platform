import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  defaultReportIdentity,
  inspectReportImage,
  reportIdentityIssues,
  summarizeIdentityChange,
  type ReportIdentity,
  type ReportIdentitySettings,
  type ReportIdentityUpdate,
  type ReportImageSlot,
  type ReportImages,
} from '@cpi/contracts';
import type { User } from '../auth/sessions';
import {
  DB,
  nextId,
  write,
  type Database,
  type Db,
  type Tx,
} from '../database/db';
import { currentState } from '../database/state';
import { Events } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Objects } from '../storage/objects';
import { ReportIdentityRepository } from './report-identity.repository';

/** The identity in force: the cycle's own, or the safe fictional default. */
export async function reportIdentityOf(db: Db): Promise<ReportIdentity> {
  const { cycle } = await currentState(db);
  return cycle.reportIdentity ?? defaultReportIdentity;
}

const slotLabel: Record<ReportImageSlot, string> = {
  logo: 'logo',
  signature: 'signature image',
};

/**
 * Who issues the annual report and how it is branded (HP2-65). Images go to object storage;
 * publications keep the identity in force when they were released.
 */
@Injectable()
export class ReportIdentityService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: ReportIdentityRepository,
    private readonly objects: Objects,
    private readonly events: Events,
  ) {}

  current(): Promise<ReportIdentity> {
    return reportIdentityOf(this.db);
  }

  private async settingsOf(db: Db): Promise<ReportIdentitySettings> {
    const [identity, changes] = await Promise.all([
      reportIdentityOf(db),
      this.repository.changes(db),
    ]);
    return { identity, changes };
  }

  settings(): Promise<ReportIdentitySettings> {
    return this.settingsOf(this.db);
  }

  update(user: User, update: ReportIdentityUpdate) {
    const issues = reportIdentityIssues(update);
    if (issues.length)
      throw new ApiError(
        422,
        'Check the highlighted fields.',
        'invalid_identity',
        Object.fromEntries(issues.map((issue) => [issue.path, issue.message])),
      );
    return write(this.db, async (tx, businessTime) => {
      const { cycle } = await currentState(tx);
      const before = cycle.reportIdentity ?? defaultReportIdentity;
      const summary = summarizeIdentityChange(before, update);
      await this.repository.setIdentity(cycle.id, { ...before, ...update }, tx);
      await this.record(tx, user, businessTime, cycle.id, summary);
      return this.settingsOf(tx);
    });
  }

  /** Stores an image in object storage and makes it the cycle's logo or signature. */
  async uploadImage(
    user: User,
    slot: ReportImageSlot,
    file: { buffer: Buffer } | undefined,
  ) {
    if (!file)
      throw new ApiError(422, 'Choose an image to upload.', 'file_required', {
        file: 'Choose an image to upload.',
      });
    const inspected = inspectReportImage(new Uint8Array(file.buffer));
    if (!inspected.ok)
      throw new ApiError(422, inspected.message, 'invalid_image', {
        file: inspected.message,
      });
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const location = this.objects.location();
    await this.objects.put(location, file.buffer, inspected.mimeType);
    try {
      return await write(this.db, async (tx, businessTime) => {
        const id = await nextId(tx, 'img');
        const image = {
          id,
          mimeType: inspected.mimeType,
          sizeBytes: file.buffer.length,
          width: inspected.width,
          height: inspected.height,
          sha256,
        };
        await this.repository.insertImage(
          {
            ...image,
            ...location,
            uploadedAt: businessTime,
            uploadedBy: user.displayName,
          },
          tx,
        );
        const { cycle } = await currentState(tx);
        const before = cycle.reportIdentity ?? defaultReportIdentity;
        await this.repository.setIdentity(
          cycle.id,
          { ...before, [slot]: image },
          tx,
        );
        await this.record(
          tx,
          user,
          businessTime,
          cycle.id,
          `New ${slotLabel[slot]} (${inspected.width} × ${inspected.height})`,
        );
        return this.settingsOf(tx);
      });
    } catch (error) {
      // Nothing refers to the object yet; storage clean-up keeps a day's grace anyway.
      await this.objects.remove(location).catch(() => undefined);
      throw error;
    }
  }

  /** Stops using an image; published reports that used it keep it. */
  removeImage(user: User, slot: ReportImageSlot) {
    return write(this.db, async (tx, businessTime) => {
      const { cycle } = await currentState(tx);
      const before = cycle.reportIdentity ?? defaultReportIdentity;
      if (!before[slot]) return this.settingsOf(tx);
      await this.repository.setIdentity(
        cycle.id,
        { ...before, [slot]: null },
        tx,
      );
      await this.record(
        tx,
        user,
        businessTime,
        cycle.id,
        `Removed ${slotLabel[slot]}`,
      );
      return this.settingsOf(tx);
    });
  }

  /** The identity's logo and signature, for a report document (HP2-64). */
  async imagesFor(identity: ReportIdentity): Promise<ReportImages> {
    const load = async (image: ReportIdentity['logo']) => {
      if (!image) return undefined;
      const { bytes } = await this.image(image.id);
      return {
        bytes: new Uint8Array(bytes),
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
      };
    };
    const [logo, signature] = await Promise.all([
      load(identity.logo),
      load(identity.signature),
    ]);
    return { logo, signature };
  }

  /** An image's bytes, for any signed-in reader of a report that shows it. */
  async image(id: string) {
    const row = await this.repository.image(id);
    if (!row) throw notFound();
    const bytes = await this.objects.get(
      { bucket: row.bucket, objectKey: row.objectKey },
      { sizeBytes: row.sizeBytes, sha256: row.sha256 },
    );
    return { bytes, mimeType: row.mimeType };
  }

  private async record(
    tx: Tx,
    user: User,
    businessTime: string,
    cycleId: string,
    summary: string,
  ) {
    await this.repository.insertChange(
      { at: businessTime, by: user.displayName, summary },
      tx,
    );
    await this.events.audit(
      tx,
      businessTime,
      user,
      'report_identity.update',
      { type: 'cycle', id: cycleId },
      summary,
    );
  }
}
