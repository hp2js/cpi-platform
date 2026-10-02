import { createHash, randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { CONFIG, type AppConfig } from '../config';
import { ApiError } from '../http/api-error';
import { MAX_FILE_BYTES } from '../reporting/rules';

export const storageUnavailable = () =>
  new ApiError(
    503,
    'File storage is temporarily unavailable. Please try again.',
    'storage_unavailable',
  );
export const storageMissing = () =>
  new ApiError(
    503,
    'This file is unavailable. Please contact support.',
    'file_unavailable',
  );
export type ObjectLocation = { bucket: string; objectKey: string };

@Injectable()
export class Objects implements OnApplicationShutdown {
  readonly client: S3Client;
  private readonly logger = new Logger('ObjectStorage');
  constructor(@Inject(CONFIG) readonly config: AppConfig) {
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
      maxAttempts: 2,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 1500,
        socketTimeout: 10_000,
      }),
    });
  }
  location(): ObjectLocation {
    return {
      bucket: this.config.S3_BUCKET,
      objectKey: `${this.config.S3_PREFIX}${randomUUID()}`,
    };
  }
  async ready() {
    await this.client.send(
      new HeadBucketCommand({ Bucket: this.config.S3_BUCKET }),
      { abortSignal: AbortSignal.timeout(1500) },
    );
  }
  async put(location: ObjectLocation, bytes: Buffer, mimeType: string) {
    // One SHA-256 serves as the server-verified transport checksum (it also stops the SDK adding CRC32) and the metadata digest.
    const sha256 = createHash('sha256').update(bytes).digest();
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: location.bucket,
          Key: location.objectKey,
          Body: bytes,
          ContentLength: bytes.length,
          ContentType: mimeType,
          ChecksumSHA256: sha256.toString('base64'),
          Metadata: { sha256: sha256.toString('hex') },
        }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
    } catch {
      this.logger.warn({ event: 'storage.put_failed' });
      throw storageUnavailable();
    }
  }
  async get(
    location: ObjectLocation,
    expected: { sizeBytes: number; sha256: string },
  ): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: location.bucket,
          Key: location.objectKey,
        }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
      if (
        !response.Body ||
        response.ContentLength !== expected.sizeBytes ||
        expected.sizeBytes > MAX_FILE_BYTES
      ) {
        if (response.Body && 'destroy' in response.Body)
          response.Body.destroy();
        throw new Error('Invalid length');
      }
      const bytes = Buffer.from(await response.Body.transformToByteArray());
      if (
        bytes.length !== expected.sizeBytes ||
        createHash('sha256').update(bytes).digest('hex') !== expected.sha256
      )
        throw new Error('Invalid digest');
      return bytes;
    } catch {
      this.logger.warn({ event: 'storage.get_failed' });
      throw storageMissing();
    }
  }
  async remove(location: ObjectLocation) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: location.bucket,
        Key: location.objectKey,
      }),
      { abortSignal: AbortSignal.timeout(5000) },
    );
  }
  async *list() {
    let token: string | undefined;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.S3_BUCKET,
          Prefix: this.config.S3_PREFIX,
          ContinuationToken: token,
        }),
      );
      for (const object of result.Contents ?? [])
        if (object.Key)
          yield {
            bucket: this.config.S3_BUCKET,
            objectKey: object.Key,
            modified: object.LastModified,
          };
      token = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (token);
  }
  onApplicationShutdown() {
    this.client.destroy();
  }
}
