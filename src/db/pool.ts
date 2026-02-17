import { Pool, PoolConfig } from 'pg';
import { DbConfig } from '../config';

export function createPool(config: DbConfig): Pool {
    const poolConfig: PoolConfig = {
        connectionString: config.connectionString,
        max: 10,                   // max connections in the pool
        idleTimeoutMillis: 30000,  // close idle connections after 30s
        connectionTimeoutMillis: 5000,
    };

    const pool = new Pool(poolConfig);
    pool.on('error', (err) => {
        console.error('[db] Unexpected pool error:', err.message);
    });

    return pool;
}
export async function closePool(pool: Pool): Promise<void> {
    await pool.end();
}
