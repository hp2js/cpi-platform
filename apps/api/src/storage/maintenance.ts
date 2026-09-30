import { createHash } from 'node:crypto';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { loadConfig } from '../config';
import { Infrastructure } from '../infrastructure';
import { evidence, evidenceFiles } from '../database/schema';
import { write } from '../database/db';
import { Objects } from './objects';
import { Files } from './files';

async function main() {
  const objects = new Objects(loadConfig(process.env));
  const infrastructure = new Infrastructure(loadConfig(process.env), objects);
  const files = new Files(infrastructure, objects);
  const db = infrastructure.database;
  try {
    await objects.ready();
    if (process.argv[2] === 'migrate') {
      const candidates = await db
        .select({ id: evidenceFiles.evidenceId })
        .from(evidenceFiles)
        .where(isNotNull(evidenceFiles.bytes));
      console.log(
        `${candidates.length} legacy file(s). ${process.argv.includes('--apply') ? 'Migrating and verifying.' : 'Dry run; use --apply to move them.'}`,
      );
      if (!process.argv.includes('--apply')) return;
      for (const candidate of candidates) {
        await files.withUpload((persist) =>
          write(db, async (tx) => {
            const [row] = await tx
              .select({ file: evidenceFiles, metadata: evidence })
              .from(evidenceFiles)
              .innerJoin(evidence, eq(evidence.id, evidenceFiles.evidenceId))
              .where(
                and(
                  eq(evidenceFiles.evidenceId, candidate.id),
                  isNull(evidenceFiles.objectKey),
                ),
              );
            if (!row?.file.bytes) return;
            if (
              row.file.bytes.length !== row.metadata.sizeBytes ||
              createHash('sha256').update(row.file.bytes).digest('hex') !==
                row.metadata.sha256
            )
              throw new Error('Legacy file failed integrity verification');
            await persist(
              tx,
              candidate.id,
              row.file.bytes,
              row.metadata.mimeType,
              true,
            );
          }),
        );
        console.log(`Migrated ${candidate.id}`);
      }
    } else if (process.argv[2] === 'gc') {
      // Keep a full day of grace for in-flight requests and uncertain commits.
      let count = 0;
      for await (const location of objects.list()) {
        if (
          !location.modified ||
          location.modified.getTime() > Date.now() - 86_400_000
        )
          continue;
        await write(db, async (tx) => {
          const [reference] = await tx
            .select({ id: evidenceFiles.evidenceId })
            .from(evidenceFiles)
            .where(
              and(
                eq(evidenceFiles.bucket, location.bucket),
                eq(evidenceFiles.objectKey, location.objectKey),
              ),
            )
            .limit(1);
          if (reference) return;
          count++;
          console.log(
            `${process.argv.includes('--delete') ? 'Deleting' : 'Orphan'} ${location.objectKey}`,
          );
          if (process.argv.includes('--delete')) await objects.remove(location);
        });
      }
      console.log(
        `${count} unreferenced object(s) older than 24 hours. Without --delete, nothing is removed.`,
      );
    } else throw new Error('Expected migrate or gc');
  } finally {
    await infrastructure.onApplicationShutdown();
    objects.onApplicationShutdown();
  }
}
void main().catch(() => {
  console.error(
    'Storage maintenance failed. No unverified legacy bytes were removed. Check service availability and configuration.',
  );
  process.exitCode = 1;
});
