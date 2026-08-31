import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-providers';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';

export interface UploadResult {
  /** Full S3 object key — stored in transaction_documents.storageKey */
  storageKey: string;
}

export interface S3ObjectStream {
  stream: Readable;
  contentType: string;
  contentLength: number | undefined;
  fileName: string;
}

export interface S3ObjectInfo {
  key: string;
  size: number | undefined;
  lastModified: Date | undefined;
  /** Extracted filename from the key */
  fileName: string;
}

@Injectable()
export class S3StorageService implements OnModuleInit {
  private readonly logger = new Logger(S3StorageService.name);
  private client: S3Client | null = null;
  private bucket: string;
  private ready = false;

  onModuleInit() {
    const region   = process.env.S3_REGION   ?? 'us-east-1';
    const endpoint = process.env.S3_ENDPOINT;
    const profile  = process.env.AWS_PROFILE;

    this.bucket = process.env.S3_BUCKET_NAME ?? '';

    if (!this.bucket) {
      this.logger.warn('S3_BUCKET_NAME is not set — S3 is disabled');
      return;
    }

    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    };

    if (profile) {
      clientConfig.credentials = fromIni({ profile });
      this.logger.log(`Using AWS profile: ${profile}`);
    } else {
      const accessKeyId     = process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

      if (!accessKeyId || !secretAccessKey) {
        this.logger.warn('AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY is not set — S3 is disabled');
        return;
      }

      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }

    this.client = new S3Client(clientConfig);

    this.ready = true;

    this.logger.log(
      `S3 storage initialised — bucket: ${this.bucket}, region: ${region}` +
      (endpoint ? `, endpoint: ${endpoint}` : ''),
    );
  }

  private assertReady(method: string) {
    if (!this.ready || !this.client) {
      throw new Error(
        `S3 is not configured. Set S3_BUCKET_NAME and either AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in your .env file. ` +
        `Called from: ${method}`,
      );
    }
  }

  // ── Key builder ─────────────────────────────────────────────────────────────

  /**
   * Canonical S3 key structure:
   *   transactions/{transactionId}/{stage}/{uuid}-{safeFilename}
   *
   * The UUID prefix prevents collisions when the same file is re-uploaded.
   */
  buildKey(transactionId: string, stage: string, originalFilename: string): string {
    const safeFilename = path
      .basename(originalFilename)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();
    const uuid = randomUUID().split('-')[0];
    return `transactions/${transactionId}/${stage.toLowerCase()}/${uuid}-${safeFilename}`;
  }

  /** Extract the original filename portion from a storage key. */
  fileNameFromKey(storageKey: string): string {
    const base = storageKey.split('/').pop() ?? storageKey;
    // Strip the uuid prefix (format: {8chars}-{filename})
    const match = base.match(/^[a-f0-9]+-(.+)$/);
    return match ? match[1] : base;
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  async upload(
    transactionId: string,
    stage: string,
    originalFilename: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<UploadResult> {
    this.assertReady('upload');
    const storageKey = this.buildKey(transactionId, stage, originalFilename);

    await this.client!.send(
      new PutObjectCommand({
        Bucket:      this.bucket,
        Key:         storageKey,
        Body:        buffer,
        ContentType: mimeType,
        Metadata: {
          transactionId,
          stage:            stage.toLowerCase(),
          originalFilename,
        },
      }),
    );

    this.logger.log(`Uploaded: ${storageKey}`);
    return { storageKey };
  }

  // ── Retrieve (stream) ───────────────────────────────────────────────────────

  /**
   * Fetch an object from S3 and return it as a Node.js Readable stream.
   * The caller is responsible for piping the stream to the HTTP response.
   */
  async getObject(storageKey: string): Promise<S3ObjectStream> {
    this.assertReady('getObject');
    const response: GetObjectCommandOutput = await this.client!.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );

    if (!response.Body) {
      throw new Error(`S3 object ${storageKey} has no body`);
    }

    return {
      stream:        response.Body as Readable,
      contentType:   response.ContentType  ?? 'application/octet-stream',
      contentLength: response.ContentLength,
      fileName:      this.fileNameFromKey(storageKey),
    };
  }

  // ── List ────────────────────────────────────────────────────────────────────

  /**
   * List all objects under a prefix with full metadata.
   *
   * Prefix examples:
   *   transactions/{txId}            → all files for a transaction
   *   transactions/{txId}/contract   → contract stage only
   *   transactions/{txId}/disclosures
   */
  async listObjects(prefix: string): Promise<S3ObjectInfo[]> {
    this.assertReady('listObjects');
    const results: S3ObjectInfo[] = [];
    let continuationToken: string | undefined;
    const normalised = prefix.endsWith('/') ? prefix : `${prefix}/`;

    do {
      const response = await this.client!.send(
        new ListObjectsV2Command({
          Bucket:            this.bucket,
          Prefix:            normalised,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of response.Contents ?? []) {
        if (obj.Key) {
          results.push({
            key:          obj.Key,
            size:         obj.Size,
            lastModified: obj.LastModified,
            fileName:     this.fileNameFromKey(obj.Key),
          });
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return results;
  }

  /** List all files for a transaction (all stages). */
  listByTransaction(transactionId: string): Promise<S3ObjectInfo[]> {
    return this.listObjects(`transactions/${transactionId}`);
  }

  /** List all files for a transaction scoped to a specific stage. */
  listByTransactionAndStage(transactionId: string, stage: string): Promise<S3ObjectInfo[]> {
    return this.listObjects(`transactions/${transactionId}/${stage.toLowerCase()}`);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async delete(storageKey: string): Promise<void> {
    this.assertReady('delete');
    await this.client!.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    this.logger.log(`Deleted: ${storageKey}`);
  }

  // ── Exists ──────────────────────────────────────────────────────────────────

  async exists(storageKey: string): Promise<boolean> {
    this.assertReady('exists');
    try {
      await this.client!.send(new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }));
      return true;
    } catch {
      return false;
    }
  }
}
