import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../database/db';
import { ApiError } from '../http/api-error';
import { evidenceFiles } from '../database/schema';
import { Infrastructure } from '../infrastructure';
import { Objects, storageMissing, type ObjectLocation } from './objects';

type PersistFile = (
  tx: Tx,
  evidenceId: string,
  bytes: Buffer,
  mimeType: string,
  verify?: boolean,
) => Promise<void>;
@Injectable()
export class Files {
  private readonly logger = new Logger('Files');
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly objects: Objects,
  ) {}

  /**
   * Real documents need scanning, quarantine and a production review first (PRD §9.2): outside
   * demo mode, new uploads answer 403 until REAL_DOCUMENT_UPLOADS records that approval.
   * Maintenance (storage:migrate) moves existing files and is not affected.
   */
  assertUploadsApproved() {
    const { DEMO_MODE, REAL_DOCUMENT_UPLOADS } = this.objects.config;
    if (!DEMO_MODE && !REAL_DOCUMENT_UPLOADS)
      throw new ApiError(
        403,
        'File uploads are turned off until malware scanning and a production review are approved for real documents.',
        'uploads_not_approved',
      );
  }

  /** Object writes are not SQL transactions. Compensate only after confirming no committed reference. */
  async withUpload<T>(
    change: (persist: PersistFile) => Promise<T>,
  ): Promise<T> {
    const staged: ObjectLocation[] = [];
    try {
      return await change(
        async (tx, evidenceId, bytes, mimeType, verify = false) => {
          const location = this.objects.location();
          staged.push(location); // A failed PUT can still have reached the server.
          await this.objects.put(location, bytes, mimeType);
          if (verify)
            await this.objects.get(location, {
              sizeBytes: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            });
          const record = { evidenceId, ...location, bytes: null };
          await tx.insert(evidenceFiles).values(record).onConflictDoUpdate({
            target: evidenceFiles.evidenceId,
            set: record,
          });
        },
      );
    } catch (error) {
      for (const location of staged) {
        try {
          const [committed] = await this.infrastructure.database
            .select({ id: evidenceFiles.evidenceId })
            .from(evidenceFiles)
            .where(
              and(
                eq(evidenceFiles.bucket, location.bucket),
                eq(evidenceFiles.objectKey, location.objectKey),
              ),
            )
            .limit(1);
          if (!committed) await this.objects.remove(location);
        } catch {
          // If commit outcome is uncertain, keep the object; the conservative GC command reconciles later.
          this.logger.warn({
            event: 'storage.cleanup_deferred',
            objectKey: location.objectKey,
          });
        }
      }
      throw error;
    }
  }

  async read(item: {
    id: string;
    sizeBytes: number;
    sha256: string;
    demonstration: boolean;
  }): Promise<Buffer | null> {
    const [stored] = await this.infrastructure.database
      .select()
      .from(evidenceFiles)
      .where(eq(evidenceFiles.evidenceId, item.id));
    if (stored?.objectKey && stored.bucket)
      return this.objects.get(
        { bucket: stored.bucket, objectKey: stored.objectKey },
        item,
      );
    if (stored?.bytes) return stored.bytes; // Backward-compatible until explicitly migrated.
    if (!stored && item.demonstration) return null;
    throw storageMissing(); // A lost real file must never become a synthetic demonstration.
  }
}
