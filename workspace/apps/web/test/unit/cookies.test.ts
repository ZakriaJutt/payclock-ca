import { describe, expect, it } from 'vitest';
import { clearedCookie, readCookie, sessionCookie } from '../../src/auth.ts';

describe('session cookie attributes (ASVS V3.3)', () => {
  it('__Host- prefix, Secure, HttpOnly, SameSite=Strict, Path=/, no Domain', () => {
    const c = sessionCookie('__Host-payclock_session', 'tok', 3600);
    expect(c).toBe('__Host-payclock_session=tok; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600');
    expect(c).not.toMatch(/Domain=/i);
    expect(clearedCookie('__Host-payclock_session')).toMatch(/Max-Age=0$/);
  });

  it('reads only the named cookie', () => {
    expect(readCookie('a=1; __Host-payclock_session=abc; b=2', '__Host-payclock_session')).toBe('abc');
    expect(readCookie('x__Host-payclock_session=abc', '__Host-payclock_session')).toBeNull();
    expect(readCookie(undefined, 'x')).toBeNull();
  });
});
