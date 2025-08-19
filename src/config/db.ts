/*import { Pool } from 'pg';
import { env } from './env.js';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

// Forzar search_path en cada conexión
pool.on('connect', async (client) => {
  await client.query('SET search_path TO app_examenes, public');
});

export async function tx<T>(fn: (client: import('pg').PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}*/

import { Pool, PoolClient } from 'pg';
import { env } from './env.js';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

// Forzar search_path en cada conexión
pool.on('connect', async (client) => {
  await client.query('SET search_path TO app_examenes, public');
});

export async function tx<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
