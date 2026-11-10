/** Load a git-ignored env file (`.env.local` or `.env.test`) into process.env without overriding. */
import { existsSync, readFileSync } from 'node:fs';

export function loadEnvFile(name: '.env.local' | '.env.test'): void {
  const path = new URL(`../${name}`, import.meta.url).pathname;
  if (!existsSync(path)) throw new Error(`${name} missing: run npm run db:bootstrap first`);
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}
