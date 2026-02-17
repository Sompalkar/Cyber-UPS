import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface UpsConfig {
    clientId: string;
    clientSecret: string;
    accountNumber: string;
    baseUrl: string;
    authUrl: string;
}

export interface DbConfig {
    connectionString: string;
}

export interface AppConfig {
    nodeEnv: string;
    requestTimeoutMs: number;
    ups: UpsConfig;
    db: DbConfig;
}
function readEnv(key: string, fallback?: string): string {
    const val = process.env[key] ?? fallback;
    if (val === undefined) {
        throw new Error(
            `Missing required environment variable: ${key}. ` +
            `Check your .env file or environment.`
        );
    }
    return val;
}
export function loadConfig(): AppConfig {
    return {
        nodeEnv: readEnv('NODE_ENV', 'development'),
        requestTimeoutMs: parseInt(readEnv('REQUEST_TIMEOUT_MS', '15000'), 10),
        ups: {
            clientId: readEnv('UPS_CLIENT_ID'),
            clientSecret: readEnv('UPS_CLIENT_SECRET'),
            accountNumber: readEnv('UPS_ACCOUNT_NUMBER'),
            baseUrl: readEnv('UPS_BASE_URL', 'https://onlinetools.ups.com'),
            authUrl: readEnv('UPS_AUTH_URL', 'https://onlinetools.ups.com/security/v1/oauth/token'),
        },
        db: {
            connectionString: readEnv('DATABASE_URL', 'postgresql://cybership:cybership_dev@localhost:5432/cybership'),
        },
    };
}
