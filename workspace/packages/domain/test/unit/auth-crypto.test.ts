/** B2 unit tests: TOTP (RFC 6238 vectors), password hashing and rules, secret encryption, storage keys. */
import { describe, expect, it } from 'vitest';
import { keyBelongsTo, storageKey } from '@payclock/platform';
import { base32Decode, base32Encode, decrypt, encrypt, hashPassword, totpCode, totpStep, verifyPassword, verifyTotp } from '../../src/auth/crypto.ts';
import { checkPassword } from '../../src/auth/password-policy.ts';

const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('TOTP (RFC 6238 appendix B, SHA-1, last 6 digits)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('T = %i s gives %s', (t, code) => {
    expect(totpCode(RFC_SECRET, totpStep(t * 1000))).toBe(code);
  });

  it('accepts one step either side, refuses two steps away and any step at or before the last used one (no replay)', () => {
    const at = 1_800_000_000_000;
    const step = totpStep(at);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), at, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), at, null)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), at, null)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), at, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), at, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), at, step - 1)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '12345', at, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', at, null)).toBeNull();
  });

  it('base32 round-trips (authenticator secret format)', () => {
    for (let n = 1; n <= 40; n++) {
      const b = Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + n) & 255));
      expect(base32Decode(base32Encode(b))).toEqual(b);
    }
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });
});

describe('passwords (TRD 8.1, ASVS V6.2)', () => {
  it('scrypt hash verifies the right password only and carries its own cost', async () => {
    const h = await hashPassword('correct horse battery staple', 14);
    expect(h).toMatch(/^scrypt\$14\$/);
    expect(await verifyPassword('correct horse battery staple', h)).toBe(true);
    expect(await verifyPassword('correct horse battery stapl', h)).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await hashPassword('correct horse battery staple', 14)).not.toBe(h); // salted
  });

  it('12 to 128 characters, common and patterned passwords refused, identity refused, no composition rules', () => {
    const email = 'office.manager@example.test';
    expect(checkPassword('short pass', email)).toBe('too_short');
    expect(checkPassword('x'.repeat(129), email)).toBe('too_long');
    expect(checkPassword('Password1234', email)).toBe('common');
    expect(checkPassword('abcabcabcabc', email)).toBe('common');
    expect(checkPassword('abcdefghijklm', email)).toBe('common');
    expect(checkPassword('my office.manager pass', email)).toBe('contains_identity');
    expect(checkPassword('payclock rocks 2026', email)).toBe('contains_identity');
    expect(checkPassword('lakeshore lantern umbrella', email)).toBeNull(); // only lower case and spaces: allowed
    expect(checkPassword('ÉtéÀMontréal-丁', email)).toBeNull();
  });
});

describe('secrets at rest and storage keys', () => {
  it('AES-256-GCM round-trips and refuses a tampered blob', () => {
    const key = Buffer.alloc(32, 3);
    const blob = encrypt(key, Buffer.from('secret'));
    expect(decrypt(key, blob).toString()).toBe('secret');
    blob[blob.length - 1]! ^= 1;
    expect(() => decrypt(key, blob)).toThrow();
  });

  it('keys are t/{tenant}/{purpose}/{entity}/{uuid}.{ext}; a key of another tenant or with a forged path is refused (R-13)', () => {
    const t = '0a000000-0000-4000-8000-00000000000a';
    const e = '0a000000-0000-4000-8000-0000000000e1';
    const k = storageKey({ tenantId: t, purpose: 'evidence', entityId: e, ext: 'pdf' });
    expect(k).toMatch(new RegExp(`^t/${t}/evidence/${e}/[0-9a-f-]{36}\\.pdf$`));
    expect(keyBelongsTo(k, t)).toBe(true);
    expect(keyBelongsTo(k, '0b000000-0000-4000-8000-00000000000b')).toBe(false);
    expect(keyBelongsTo(`t/${t}/evidence/../../x.pdf`, t)).toBe(false);
    expect(() => storageKey({ tenantId: t, purpose: 'evidence', entityId: '../x', ext: 'pdf' })).toThrow();
    expect(() => storageKey({ tenantId: t, purpose: 'evidence', entityId: e, ext: 'p/df' })).toThrow();
  });
});
