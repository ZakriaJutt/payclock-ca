import pg from 'pg';

/** Drop PayClock's own test schemas so the suite can re-migrate from nothing. payclock_test only. */
export async function resetTestSchemas(migratorUrl: string): Promise<void> {
  if (!/\/payclock_test(\?|$)/.test(migratorUrl)) throw new Error('refusing: reset only runs against payclock_test');
  const c = new pg.Client({ connectionString: migratorUrl });
  await c.connect();
  try {
    await c.query('drop schema if exists pgboss cascade');
    await c.query('drop schema public cascade');
    await c.query('create schema public');
  } finally {
    await c.end();
  }
}
