import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

/**
 * The only way the application opens a database connection (TRD 8.2 layer 2). Every transaction
 * sets `app.tenant_id` with `set_config(..., true)` (transaction-local), so row-level security
 * scopes every statement; without it, reads return no rows and writes fail.
 */
export type Tx = NodePgDatabase<typeof schema> & { raw: pg.PoolClient };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Civil dates stay strings; bigint (int8) cents become numbers only when safe.
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(20, (v: string) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new RangeError('bigint value exceeds safe integer range');
  return n;
});

export class TenantDb {
  readonly pool: pg.Pool;

  constructor(connectionString: string, max = 10) {
    this.pool = new pg.Pool({ connectionString, max, statement_timeout: 15_000, idle_in_transaction_session_timeout: 20_000 });
    this.pool.on('error', () => undefined);
  }

  /** Run `fn` in one transaction scoped to `tenantId`. Rolls back on any error. */
  async withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID.test(tenantId)) throw new Error('withTenant requires a tenant uuid');
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      const db = drizzle(client, { schema }) as unknown as Tx;
      db.raw = client;
      const out = await fn(db);
      await client.query('commit');
      return out;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Global, tenant-less reads (rule tables, holidays, app_user). Tenant tables return no rows. */
  async withoutTenant<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin read only');
      const db = drizzle(client, { schema }) as unknown as Tx;
      db.raw = client;
      const out = await fn(db);
      await client.query('commit');
      return out;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Identity writes without a tenant (B2): sessions, credentials, sign-in links and throttles are
   * global like `app_user`. Tenant tables stay invisible here (no `app.tenant_id`).
   */
  withIdentity<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.withGlobalWrite(fn);
  }

  /** Global writes without a tenant (rule tables, holidays). Only for the migrator connection. */
  async withGlobalWrite<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const db = drizzle(client, { schema }) as unknown as Tx;
      db.raw = client;
      const out = await fn(db);
      await client.query('commit');
      return out;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('select 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
