import { Pool } from 'pg';
import { RateQuote } from '../domain/models';

export class RateQuoteRepository {
    constructor(private pool: Pool) { }
    async saveQuotes(
        requestId: string,
        quotes: RateQuote[],
        originPostal: string,
        destPostal: string,
    ): Promise<void> {
        if (quotes.length === 0) return;
        const values: unknown[] = [];
        const placeholders: string[] = [];

        quotes.forEach((q, i) => {
            const offset = i * 8;
            placeholders.push(
                `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
            );
            values.push(
                requestId,
                q.carrier,
                q.serviceName,
                q.serviceLevel,
                q.totalPrice,
                q.currency,
                q.transitDays ?? null,
            );
        });

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const q of quotes) {
                await client.query(
                    `INSERT INTO rate_quotes (request_id, carrier, service_name, service_level, total_price, currency, transit_days, origin_postal, dest_postal)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [requestId, q.carrier, q.serviceName, q.serviceLevel, q.totalPrice, q.currency, q.transitDays ?? null, originPostal, destPostal],
                );
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('[db] Failed to persist rate quotes:', err);
        } finally {
            client.release();
        }
    }
    async findRecentQuotes(
        originPostal: string,
        destPostal: string,
        maxAgeMinutes: number = 30,
    ): Promise<RateQuote[]> {
        const result = await this.pool.query(
            `SELECT carrier, service_name, service_level, total_price, currency, transit_days
       FROM rate_quotes
       WHERE origin_postal = $1
         AND dest_postal = $2
         AND created_at > NOW() - INTERVAL '1 minute' * $3
       ORDER BY total_price ASC`,
            [originPostal, destPostal, maxAgeMinutes],
        );

        return result.rows.map(row => ({
            carrier: row.carrier,
            serviceName: row.service_name,
            serviceLevel: row.service_level,
            totalPrice: parseFloat(row.total_price),
            currency: row.currency,
            transitDays: row.transit_days,
        }));
    }
}

export class AuditRepository {
    constructor(private pool: Pool) { }
    async logOperation(entry: {
        requestId: string;
        carrier: string;
        operation: string;
        status: 'success' | 'error';
        durationMs: number;
        errorCode?: string;
        errorMsg?: string;
    }): Promise<void> {
        try {
            await this.pool.query(
                `INSERT INTO audit_log (request_id, carrier, operation, status, duration_ms, error_code, error_msg)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [entry.requestId, entry.carrier, entry.operation, entry.status, entry.durationMs, entry.errorCode ?? null, entry.errorMsg ?? null],
            );
        } catch (err) {
            console.error('[db] Failed to write audit log:', err);
        }
    }
}
