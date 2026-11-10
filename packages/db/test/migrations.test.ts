import { describe, expect, it } from 'vitest';
import { checkOrder, listMigrations, ormParity } from '@payclock/db';
import '../../../tests/helpers.ts';

describe('IT-10 (partial) migrations and ORM parity', () => {
  it('schema built from migrations equals the ORM model (empty diff)', async () => {
    expect(await ormParity(process.env.MIGRATOR_DATABASE_URL!)).toEqual([]);
  });

  it('migration files are timestamped and in one linear order', () => {
    const files = listMigrations();
    expect(files.length).toBeGreaterThan(0);
    expect(checkOrder(files, files.map((f) => ({ version: f.version, sha256: f.sha256 })))).toEqual([]);
  });

  it('fails on an edited applied migration and on a branch migration that sorts before the last applied', () => {
    const files = listMigrations();
    const f = files[0]!;
    expect(checkOrder(files, [{ version: f.version, sha256: 'edited' }])[0]).toMatch(/edited/);
    const branch = { version: '20261101T000000', file: '20261101T000000_branch.sql', sha256: 'x', sql: '' };
    expect(checkOrder([branch, ...files], files.map((x) => ({ version: x.version, sha256: x.sha256 })))[0]).toMatch(/sorts before/);
  });
});
