import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Config } from './config.ts';

/**
 * File storage behind one interface (TRD 8.7, T-2.2.4). Objects are private: no public URL is
 * ever built from the bucket; downloads go through the API after a tenant-scoped read. Locally
 * the S3 API reaches MinIO at 127.0.0.1:9000; production points the same settings at the
 * provider's S3 endpoint.
 */
export type StoragePurpose = 'evidence' | 'import' | 'action_pdf' | 'sent_copy' | 'export';
export type StorageEntity = 'project' | 'subcontract' | 'invoice' | 'event';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXT = /^[a-z0-9]{1,5}$/;
const PURPOSES: ReadonlySet<string> = new Set(['evidence', 'import', 'action_pdf', 'sent_copy', 'export']);

/** Server-generated key `t/{tenant_id}/{purpose}/{entity_id}/{uuid}.{ext}` (V5.3.2, R-13). */
export function storageKey(p: { tenantId: string; purpose: StoragePurpose; entityId: string; ext: string }): string {
  if (!UUID.test(p.tenantId) || !UUID.test(p.entityId)) throw new Error('storage key needs lower-case uuids');
  if (!PURPOSES.has(p.purpose)) throw new Error('unknown storage purpose');
  if (!EXT.test(p.ext)) throw new Error('bad file extension');
  return `t/${p.tenantId}/${p.purpose}/${p.entityId}/${randomUUID()}.${p.ext}`;
}

const KEY = /^t\/([0-9a-f-]{36})\/([a-z_]+)\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.([a-z0-9]{1,5})$/;

/** True only for a well-formed key of this tenant (checked again before every storage call). */
export function keyBelongsTo(key: string, tenantId: string): boolean {
  const m = KEY.exec(key);
  return !!m && m[1] === tenantId && PURPOSES.has(m[2]!);
}

export interface BlobStore {
  put(tenantId: string, key: string, body: Buffer, contentType: string): Promise<void>;
  get(tenantId: string, key: string): Promise<Buffer>;
  delete(tenantId: string, key: string): Promise<void>;
  ping(): Promise<boolean>;
}

function guard(tenantId: string, key: string): void {
  if (!keyBelongsTo(key, tenantId)) throw new Error('storage key outside the tenant prefix');
}

export function createS3BlobStore(config: Pick<Config, 'S3_ENDPOINT' | 'S3_REGION' | 'S3_BUCKET' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY' | 'S3_FORCE_PATH_STYLE'>): BlobStore {
  if (!config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) throw new Error('S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required');
  const bucket = config.S3_BUCKET;
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: config.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
    requestHandler: { requestTimeout: 10_000, connectionTimeout: 5_000 },
  });
  return {
    async put(tenantId, key, body, contentType) {
      guard(tenantId, key);
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, IfNoneMatch: '*' }));
    },
    async get(tenantId, key) {
      guard(tenantId, key);
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await out.Body!.transformToByteArray());
    },
    async delete(tenantId, key) {
      guard(tenantId, key);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async ping() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** In-memory store for unit tests. */
export class MemoryBlobStore implements BlobStore {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  async put(tenantId: string, key: string, body: Buffer, contentType: string) {
    guard(tenantId, key);
    if (this.objects.has(key)) throw new Error('object exists');
    this.objects.set(key, { body, contentType });
  }
  async get(tenantId: string, key: string) {
    guard(tenantId, key);
    const o = this.objects.get(key);
    if (!o) throw new Error('no such object');
    return o.body;
  }
  async delete(tenantId: string, key: string) {
    guard(tenantId, key);
    this.objects.delete(key);
  }
  async ping() {
    return true;
  }
}
