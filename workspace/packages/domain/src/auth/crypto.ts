import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Credential primitives for local sign-in (TRD 8.1). Node's crypto only; no third-party code.
 * Passwords: scrypt with a per-hash salt and the cost stored in the hash (V11.4.2). Tokens: 256-bit
 * random, stored only as SHA-256. TOTP: RFC 6238, HMAC-SHA1, 30 s, 6 digits, one step either
 * side, each step usable once.
 */
export const sha256 = (v: string | Buffer): Buffer => createHash('sha256').update(v).digest();
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

function scryptAsync(password: string, salt: Buffer, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, 32, { N: n, r: 8, p: 1, maxmem: 256 * n * 8 + 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k))),
  );
}

export async function hashPassword(password: string, log2n: number): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 2 ** log2n);
  return `scrypt$${log2n}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = /^scrypt\$(\d{2})\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(stored);
  if (!m) return false;
  const want = Buffer.from(m[3]!, 'base64url');
  const got = await scryptAsync(password, Buffer.from(m[2]!, 'base64url'), 2 ** Number(m[1]));
  return got.length === want.length && timingSafeEqual(got, want);
}

/** A fixed hash verified for unknown accounts, so timing does not reveal whether an email exists. */
const dummies = new Map<number, Promise<string>>();
export async function burnPasswordCheck(password: string, log2n: number): Promise<void> {
  if (!dummies.has(log2n)) dummies.set(log2n, hashPassword(randomToken(), log2n));
  await verifyPassword(password, await dummies.get(log2n)!);
}

// ---------- AES-256-GCM for TOTP secrets at rest ----------
export function encrypt(key: Buffer, plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decrypt(key: Buffer, blob: Buffer): Buffer {
  const d = createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

export function hmacHex(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------- TOTP (RFC 6238 / RFC 4226) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('bad base32');
    value = ((value << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const TOTP_PERIOD_S = 30;
export const totpStep = (atMs: number): number => Math.floor(atMs / 1000 / TOTP_PERIOD_S);

export function totpCode(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', secret).update(counter).digest();
  const off = h[h.length - 1]! & 15;
  const bin = ((h[off]! & 127) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 1_000_000).padStart(6, '0');
}

/** The matching step within one step either side and strictly after `lastStep` (no replay); else null. */
export function verifyTotp(secret: Buffer, code: string, atMs: number, lastStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpStep(atMs);
  let found: number | null = null;
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (safeEqual(totpCode(secret, step), code) && found === null) found = step;
  }
  return found;
}
