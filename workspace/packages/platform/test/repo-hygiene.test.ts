/**
 * B2-S07: V13.3.1 (no secret in the repository) and V6.3.2 (no default accounts) are checked by
 * tests, not only claimed. Scans the files git tracks.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = resolve(new URL('../../../..', import.meta.url).pathname);
const tracked = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
const text = (f: string) => readFileSync(resolve(repo, f), 'utf8');
const textFiles = tracked.filter((f) => !/\.(png|jpe?g|pdf|ico)$/i.test(f) && !f.endsWith('package-lock.json'));

/** Secret values from the git-ignored env files of this machine (never printed). */
function localSecrets(): string[] {
  const out: string[] = [];
  for (const name of ['.env.local', '.env.test']) {
    const p = resolve(repo, 'workspace', name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = /^(AUTH_SECRET_KEY|S3_SECRET_ACCESS_KEY|S3_ACCESS_KEY_ID|SMTP_PASSWORD|DATABASE_URL)=(.+)$/.exec(line.trim());
      if (!m) continue;
      const v = m[1] === 'DATABASE_URL' ? decodeURIComponent(/:\/\/[^:]+:([^@]+)@/.exec(m[2]!)?.[1] ?? '') : m[2]!;
      if (v.length >= 8) out.push(v);
    }
  }
  return out;
}

describe('V13.3.1: no secret in the repository', () => {
  it('no env file with values is tracked; .env.example holds names only', () => {
    expect(tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.env.example'))).toEqual([]);
    const example = text('workspace/.env.example').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l));
    expect(example.filter((l) => !/=$/.test(l))).toEqual([]);
  });

  it('no tracked file contains this machine\'s secret values, a private key or a cloud access key', () => {
    const secrets = localSecrets();
    const hits: string[] = [];
    for (const f of textFiles) {
      const t = text(f);
      if (secrets.some((s) => t.includes(s))) hits.push(`${f}: local secret value`);
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) hits.push(`${f}: private key`);
      if (/\bAKIA[0-9A-Z]{16}\b/.test(t)) hits.push(`${f}: AWS access key id`);
      if (/postgres:\/\/[^:\s/]+:[^@\s$`{]{8,}@/.test(t)) hits.push(`${f}: database URL with a password`); // the 1-character placeholders of broken-connection tests are allowed
    }
    expect(hits).toEqual([]);
  });
});

describe('V6.3.2: no default accounts', () => {
  it('no migration or seed creates a credential, and the seed creates owners only as invited', () => {
    const files = tracked.filter((f) => /workspace\/(packages\/db\/migrations\/.*\.sql|scripts\/.*\.ts)$/.test(f));
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) expect({ f, creds: /insert\s+into\s+user_credential/i.test(text(f)) }).toEqual({ f, creds: false });
    const seed = text('workspace/scripts/seed-synthetic.ts');
    expect(seed).not.toMatch(/'owner', 'active'/);
    expect(seed).toMatch(/'owner', 'invited'/);
  });
});
