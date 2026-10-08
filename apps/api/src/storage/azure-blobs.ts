import { ManagedIdentityCredential } from '@azure/identity';
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import type { AppConfig } from '../config';
import type { ObjectLocation } from './objects';

/**
 * Azure Blob Storage behind the same operations as the S3 client in `Objects`, which keeps the
 * error mapping and digest checks. In Azure the API signs in with its managed identity, so there
 * is no storage key to hold or rotate.
 */
export class AzureBlobs {
  private readonly service: BlobServiceClient;
  constructor(private readonly config: AppConfig) {
    const options = { retryOptions: { maxTries: 2, tryTimeoutInMs: 15_000 } };
    this.service = config.AZURE_STORAGE_CONNECTION_STRING
      ? BlobServiceClient.fromConnectionString(
          config.AZURE_STORAGE_CONNECTION_STRING,
          options,
        )
      : new BlobServiceClient(
          config.AZURE_STORAGE_BLOB_URL!,
          new ManagedIdentityCredential({ clientId: config.AZURE_CLIENT_ID }),
          options,
        );
  }
  private container(name = this.config.S3_BUCKET): ContainerClient {
    return this.service.getContainerClient(name);
  }
  async ready() {
    await this.container().getProperties({
      abortSignal: AbortSignal.timeout(1500),
    });
  }
  async put(
    location: ObjectLocation,
    bytes: Buffer,
    mimeType: string,
    sha256: Buffer,
  ) {
    await this.container(location.bucket)
      .getBlockBlobClient(location.objectKey)
      .upload(bytes, bytes.length, {
        blobHTTPHeaders: { blobContentType: mimeType },
        metadata: { sha256: sha256.toString('hex') },
        abortSignal: AbortSignal.timeout(15_000),
      });
  }
  /** The stored bytes, refusing anything but the expected length before reading the body. */
  async get(location: ObjectLocation, sizeBytes: number) {
    const response = await this.container(location.bucket)
      .getBlobClient(location.objectKey)
      .download(0, undefined, { abortSignal: AbortSignal.timeout(15_000) });
    const body = response.readableStreamBody;
    if (!body || response.contentLength !== sizeBytes) {
      if (body && 'destroy' in body) (body as { destroy(): void }).destroy();
      throw new Error('Invalid length');
    }
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }
  async remove(location: ObjectLocation) {
    await this.container(location.bucket)
      .getBlobClient(location.objectKey)
      .deleteIfExists({ abortSignal: AbortSignal.timeout(5000) });
  }
  async *list() {
    for await (const blob of this.container().listBlobsFlat({
      prefix: this.config.S3_PREFIX,
    }))
      yield {
        bucket: this.config.S3_BUCKET,
        objectKey: blob.name,
        modified: blob.properties.lastModified,
      };
  }
}
