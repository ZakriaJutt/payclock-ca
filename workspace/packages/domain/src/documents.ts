import { createHash } from 'node:crypto';
import type { TenantDb } from '@payclock/db';
import { storageKey, type BlobStore, type StorageEntity, type StoragePurpose } from '@payclock/platform';
import { authorize, type Actor } from './actor.ts';
import { audit } from './audit.ts';
import { hmacHex, safeEqual } from './auth/crypto.ts';
import { DomainError, notFound, uuidField } from './errors.ts';

/**
 * Evidence files (TRD 8.7, T-2.2.4). Types PDF, PNG, JPEG, CSV up to 10 MB (V5.2.1); the declared
 * type and the content signature must agree (V5.2.2); keys are server-generated
 * `t/{tenant}/{purpose}/{entity}/{uuid}.{ext}` (V5.3.2, R-13). A file is downloadable only after
 * the scanner marks it `clean` (V5.4.3: the only scanner here is a local signature check, refused
 * outside local and test by configuration). Downloads go through the API: a 5-minute link built
 * from APP_PUBLIC_URL (R-16), signed for this tenant and document, and still requiring a session
 * of that tenant; the file name is set by the server (V5.4.1).
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, { ext: string; sniff: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: 'pdf', sniff: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  'image/png': { ext: 'png', sniff: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', sniff: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'text/csv': { ext: 'csv', sniff: (b) => !b.includes(0) && isUtf8(b) && !/^(MZ|\x7fELF|#!)/.test(b.subarray(0, 4).toString('latin1')) },
};
const PURPOSES: ReadonlySet<string> = new Set(['evidence', 'import', 'action_pdf', 'sent_copy', 'export']);
const ENTITY_TABLE: Record<StorageEntity, string> = { project: 'project', subcontract: 'subcontract', invoice: 'invoice', event: 'event' };
export const LINK_TTL_S = 300;

function isUtf8(b: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}

export interface FileScanner {
  scan(body: Buffer, mime: string): Promise<'clean' | 'rejected' | 'pending'>;
}

/** Local and test only (config refuses it elsewhere): re-checks the signature; it is not a malware scan. */
export const localSignatureScanner: FileScanner = {
  async scan(body, mime) {
    return TYPES[mime]?.sniff(body) ? 'clean' : 'rejected';
  },
};
/** No scanner configured: every file stays `pending` and cannot be downloaded. */
export const noScanner: FileScanner = { async scan() { return 'pending'; } };

export interface DocumentDeps {
  db: TenantDb;
  store: BlobStore;
  scanner: FileScanner;
  linkKey: Buffer;
  publicUrl: string;
  now?: () => number;
}

export async function uploadDocument(
  deps: DocumentDeps,
  actor: Actor,
  input: { purpose: unknown; entity_type: unknown; entity_id: unknown; mime: string; body: Buffer },
): Promise<Record<string, unknown>> {
  authorize(actor, 'write_records');
  if (typeof input.purpose !== 'string' || !PURPOSES.has(input.purpose)) throw new DomainError(422, 'unprocessable', 'unknown purpose', ['purpose']);
  if (typeof input.entity_type !== 'string' || !(input.entity_type in ENTITY_TABLE)) throw new DomainError(422, 'unprocessable', 'unknown entity_type', ['entity_type']);
  const entityId = uuidField(input.entity_id, 'entity_id');
  const purpose = input.purpose as StoragePurpose;
  const entityType = input.entity_type as StorageEntity;
  const type = TYPES[input.mime];
  if (!type) throw new DomainError(415, 'unsupported_media_type', 'accepted types: PDF, PNG, JPEG, CSV', ['content-type']);
  if (input.body.length === 0 || input.body.length > MAX_FILE_BYTES) throw new DomainError(413, 'payload_too_large', 'files are 1 byte to 10 MB');
  if (!type.sniff(input.body)) throw new DomainError(415, 'unsupported_media_type', 'file content does not match its declared type', ['content-type']);

  // The entity must be readable in this tenant (row-level security): otherwise 404, nothing stored.
  const exists = await deps.db.withTenant(actor.tenantId, async (tx) =>
    (await tx.raw.query(`select 1 from ${ENTITY_TABLE[entityType]} where id = $1`, [entityId])).rowCount);
  if (!exists) throw notFound(entityType);

  const key = storageKey({ tenantId: actor.tenantId, purpose, entityId, ext: type.ext });
  const status = await deps.scanner.scan(input.body, input.mime);
  await deps.store.put(actor.tenantId, key, input.body, input.mime);
  try {
    return await deps.db.withTenant(actor.tenantId, async (tx) => {
      const r = await tx.raw.query<{ id: string; created_at: string }>(
        `insert into source_document (tenant_id, purpose, entity_type, entity_id, storage_key, sha256, mime, bytes, scan_status, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id, created_at`,
        [actor.tenantId, purpose, entityType, entityId, key, createHash('sha256').update(input.body).digest(), input.mime, input.body.length, status, actor.userId],
      );
      const id = r.rows[0]!.id;
      await audit(tx, actor, 'document.uploaded', 'source_document', id, undefined, { purpose, entityType, entityId, bytes: input.body.length });
      return { id, purpose, entity_type: entityType, entity_id: entityId, mime: input.mime, bytes: input.body.length, scan_status: status, created_at: r.rows[0]!.created_at };
    });
  } catch (e) {
    await deps.store.delete(actor.tenantId, key).catch(() => undefined);
    throw e;
  }
}

const sign = (deps: DocumentDeps, tenantId: string, id: string, exp: number) => hmacHex(deps.linkKey, `doc:${tenantId}:${id}:${exp}`);

async function readDocument(deps: DocumentDeps, actor: Actor, id: string) {
  const doc = await deps.db.withTenant(actor.tenantId, async (tx) =>
    (await tx.raw.query<{ id: string; storage_key: string; mime: string; purpose: string; scan_status: string }>(
      'select id, storage_key, mime, purpose, scan_status from source_document where id = $1', [id])).rows[0]);
  if (!doc) throw notFound('document');
  if (doc.scan_status !== 'clean') throw new DomainError(409, 'scan_not_clean', `file is ${doc.scan_status === 'pending' ? 'waiting for a scan' : 'rejected by the scan'}`);
  return doc;
}

/** `GET /documents/{id}/link`: 5-minute link on APP_PUBLIC_URL, after a row-level read succeeds. */
export async function documentLink(deps: DocumentDeps, actor: Actor, documentId: string): Promise<{ url: string; expires_at: string }> {
  authorize(actor, 'read');
  const doc = await readDocument(deps, actor, uuidField(documentId, 'id'));
  const exp = Math.floor((deps.now ?? Date.now)() / 1000) + LINK_TTL_S;
  const url = new URL(`/api/v1/documents/${doc.id}/content`, deps.publicUrl);
  url.searchParams.set('exp', String(exp));
  url.searchParams.set('sig', sign(deps, actor.tenantId, doc.id, exp));
  return { url: url.toString(), expires_at: new Date(exp * 1000).toISOString() };
}

/** `GET /documents/{id}/content?exp&sig`: a valid, unexpired link for THIS tenant, plus its session. */
export async function downloadDocument(deps: DocumentDeps, actor: Actor, documentId: string, exp: string | null, sig: string | null): Promise<{ body: Buffer; mime: string; filename: string }> {
  authorize(actor, 'read');
  const id = uuidField(documentId, 'id');
  const expN = Number(exp);
  if (!exp || !sig || !Number.isSafeInteger(expN) || !safeEqual(sig, sign(deps, actor.tenantId, id, expN))) throw new DomainError(403, 'link_invalid', 'this link is not valid');
  if (expN * 1000 <= (deps.now ?? Date.now)()) throw new DomainError(403, 'link_expired', 'this link has expired; request a new one');
  const doc = await readDocument(deps, actor, id);
  const body = await deps.store.get(actor.tenantId, doc.storage_key);
  const ext = TYPES[doc.mime]?.ext ?? 'bin';
  await deps.db.withTenant(actor.tenantId, (tx) => audit(tx, actor, 'document.downloaded', 'source_document', id));
  return { body, mime: doc.mime, filename: `${doc.purpose}-${doc.id}.${ext}` };
}
