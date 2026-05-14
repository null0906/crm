import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema';

const poolConfig: PoolConfig & { family: 4 } = {
  connectionString: process.env.DATABASE_URL!,
  // Force IPv4 to avoid flaky carrier IPv6 routes on Indian mobile networks.
  family: 4,
  max: Number(process.env.DATABASE_POOL_MAX) || 20,
};

const pool = new Pool(poolConfig);

export const db = drizzle(pool, { schema });

export type DB = typeof db;
export { schema };
