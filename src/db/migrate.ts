import { loadConfig } from '../config';
import { createPool, closePool } from './pool';

const MIGRATIONS = [
    {
        name: '001_create_rate_quotes',
        sql: `
      CREATE TABLE IF NOT EXISTS rate_quotes (
        id            SERIAL PRIMARY KEY,
        request_id    VARCHAR(64) NOT NULL,
        carrier       VARCHAR(32) NOT NULL,
        service_name  VARCHAR(128) NOT NULL,
        service_level VARCHAR(32) NOT NULL,
        total_price   DECIMAL(10, 2) NOT NULL,
        currency      VARCHAR(3) NOT NULL DEFAULT 'USD',
        transit_days  INTEGER,
        origin_postal VARCHAR(20),
        dest_postal   VARCHAR(20),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- index for looking up quotes by request
      CREATE INDEX IF NOT EXISTS idx_rate_quotes_request_id
        ON rate_quotes(request_id);

      -- index for analytics: "what rates did we get for this lane?"
      CREATE INDEX IF NOT EXISTS idx_rate_quotes_lane
        ON rate_quotes(origin_postal, dest_postal, carrier);
    `,
    },
    {
        name: '002_create_audit_log',
        sql: `
      CREATE TABLE IF NOT EXISTS audit_log (
        id          SERIAL PRIMARY KEY,
        request_id  VARCHAR(64) NOT NULL,
        carrier     VARCHAR(32) NOT NULL,
        operation   VARCHAR(32) NOT NULL,
        status      VARCHAR(16) NOT NULL,
        duration_ms INTEGER,
        error_code  VARCHAR(32),
        error_msg   TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_audit_log_request_id
        ON audit_log(request_id);
    `,
    },
];

async function runMigrations() {
    const config = loadConfig();
    const pool = createPool(config.db);

    console.log('[migrate] Running database migrations...');

    for (const migration of MIGRATIONS) {
        try {
            await pool.query(migration.sql);
            console.log(`[migrate] ✓ ${migration.name}`);
        } catch (err) {
            console.error(`[migrate] ✗ ${migration.name} failed:`, err);
            process.exit(1);
        }
    }

    console.log('[migrate] All migrations complete.');
    await closePool(pool);
}
runMigrations().catch((err) => {
    console.error('[migrate] Fatal error:', err);
    process.exit(1);
});
