/**
 * Password rules (TRD 8.1): at least 12 characters (V6.2.1), up to 128 accepted (V6.2.9), any
 * characters and no composition rules (V6.2.5), checked against a short local list of common
 * passwords and simple patterns (V6.2.4, partial: the list is not the top-3000 list), and refused
 * when it contains the email's local part or the product name (V6.2.11). No breached-password
 * corpus is available offline and no outside service is called, so V6.2.12 is not met.
 */
const COMMON = new Set([
  '123456789012', '1234567890123', '12345678901234', '123456123456', '111111111111', '000000000000', '121212121212',
  '123123123123', '987654321098', '098765432109', '112233445566', '123qweasdzxc', '1q2w3e4r5t6y', '1qaz2wsx3edc',
  'qwertyuiopas', 'qwerty123456', 'qwertyqwerty', 'asdfghjklzxc', 'zxcvbnmasdfg', 'abcdefghijkl', 'abcd12345678',
  'password1234', 'password12345', 'password123456', 'passwordpassword', 'p@ssw0rd1234', 'p@ssword1234',
  'passw0rd1234', 'iloveyou1234', 'iloveyouiloveyou', 'letmein12345', 'letmeinletmein', 'welcome12345',
  'welcome123456', 'welcomewelcome', 'changeme1234', 'changemechangeme', 'administrator', 'administrator1',
  'admin1234567', 'adminadminadmin', 'monkey123456', 'dragon123456', 'football1234', 'baseball1234',
  'sunshine1234', 'princess1234', 'superman1234', 'trustno11234', 'starwars1234', 'whatever1234',
  'master123456', 'shadow123456', 'computer1234', 'internet1234', 'mustang12345', 'michael12345',
  'jennifer1234', 'hockey123456', 'canada123456', 'toronto12345', 'ontario12345', 'qwertyuiop12',
  'q1w2e3r4t5y6', 'abc123abc123', 'mypassword12', 'mypassword123', 'secret123456', 'secretsecret',
  'contractor12', 'construction', 'construction1', 'electrician1',
]);

export type PasswordProblem = 'too_short' | 'too_long' | 'common' | 'contains_identity';

export function checkPassword(password: string, email: string): PasswordProblem | null {
  const chars = [...password.normalize('NFKC')];
  if (chars.length < 12) return 'too_short';
  if (chars.length > 128) return 'too_long';
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.{1,4})\1+$/.test(lower) || isSequence(lower)) return 'common';
  const local = email.split('@')[0]!.toLowerCase();
  if ((local.length >= 4 && lower.includes(local)) || lower.includes('payclock')) return 'contains_identity';
  return null;
}

function isSequence(s: string): boolean {
  const codes = [...s].map((c) => c.charCodeAt(0));
  const step = codes[1]! - codes[0]!;
  return Math.abs(step) === 1 && codes.every((c, i) => i === 0 || c - codes[i - 1]! === step);
}
