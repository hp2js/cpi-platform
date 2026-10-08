import { createHash, randomUUID } from 'node:crypto';
import { BlobServiceClient } from '@azure/storage-blob';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { Objects } from './objects';

// Runs against floci-az or Azurite: `pnpm infra:local` starts floci-az and prints the string.
const connection = process.env.AZURE_STORAGE_CONNECTION_STRING;

describe.skipIf(!connection)('Azure Blob file storage', () => {
  const bucket = `cpi-test-${randomUUID().slice(0, 8)}`;
  // Built in beforeAll: a skipped describe body still runs, and the config needs the string.
  let objects: Objects;
  beforeAll(async () => {
    objects = new Objects(
      loadConfig({
        ...process.env,
        DATABASE_URL: 'postgresql://unused@127.0.0.1/unused',
        REDIS_URL: 'redis://127.0.0.1',
        STORAGE_BACKEND: 'azure',
        S3_BUCKET: bucket,
        S3_PREFIX: `evidence/tests/${randomUUID()}/`,
      }),
    );
    await BlobServiceClient.fromConnectionString(connection!)
      .getContainerClient(bucket)
      .create();
  });
  const bytes = Buffer.from('%PDF-1.7 blob storage %%EOF');
  const expected = {
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };

  it('stores, lists, verifies and removes an object under the prefix', async () => {
    await objects.ready();
    const location = objects.location();
    await objects.put(location, bytes, 'application/pdf');
    expect(await objects.get(location, expected)).toEqual(bytes);
    const listed = [];
    for await (const item of objects.list()) listed.push(item.objectKey);
    expect(listed).toEqual([location.objectKey]);
    await objects.remove(location);
    await objects.remove(location);
    await expect(objects.get(location, expected)).rejects.toMatchObject({
      status: 503,
    });
  });
  it('refuses bytes whose length or digest differs from the metadata', async () => {
    const location = objects.location();
    await objects.put(location, bytes, 'application/pdf');
    await expect(
      objects.get(location, { ...expected, sizeBytes: 1 }),
    ).rejects.toMatchObject({ response: { code: 'file_unavailable' } });
    await expect(
      objects.get(location, { ...expected, sha256: '0'.repeat(64) }),
    ).rejects.toMatchObject({ response: { code: 'file_unavailable' } });
  });
});
