import { HttpClient } from '../../http/client';
import { UpsConfig } from '../../config';
import { AuthProvider } from '../types';
import { AuthenticationError } from '../../domain/errors';
import { UpsAuthResponse } from './types';

interface CachedToken {
    accessToken: string;
    expiresAt: number;     // unix timestamp in ms
}
const REFRESH_BUFFER_MS = 60_000;

export class UpsAuthProvider implements AuthProvider {
    private cachedToken: CachedToken | null = null;
    private pendingRefresh: Promise<string> | null = null;
    private httpClient: HttpClient;
    private config: UpsConfig;

    constructor(config: UpsConfig, httpClient: HttpClient) {
        this.config = config;
        this.httpClient = httpClient;
    }
    async getToken(): Promise<string> {
        if (this.cachedToken && this.isTokenValid()) {
            return this.cachedToken.accessToken;
        }
        if (this.pendingRefresh) {
            return this.pendingRefresh;
        }
        this.pendingRefresh = this.fetchNewToken();

        try {
            const token = await this.pendingRefresh;
            return token;
        } finally {
            this.pendingRefresh = null;
        }
    }
    invalidate(): void {
        this.cachedToken = null;
        this.pendingRefresh = null;
    }

    private isTokenValid(): boolean {
        if (!this.cachedToken) return false;
        return Date.now() < (this.cachedToken.expiresAt - REFRESH_BUFFER_MS);
    }
    private async fetchNewToken(): Promise<string> {
        try {
            const credentials = Buffer.from(
                `${this.config.clientId}:${this.config.clientSecret}`
            ).toString('base64');

            const response = await this.httpClient.post<UpsAuthResponse>(
                this.config.authUrl,
                'grant_type=client_credentials',    // form-urlencoded, not JSON!
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${credentials}`,
                    },
                },
            );

            const data = response.data;

            if (!data.access_token) {
                throw new AuthenticationError(
                    'ups',
                    'Token response missing access_token field',
                );
            }
            const expiresInSec = parseInt(data.expires_in, 10);

            if (isNaN(expiresInSec) || expiresInSec <= 0) {
                console.warn('[ups-auth] Could not parse expires_in, defaulting to 4h');
            }

            const expiresInMs = (isNaN(expiresInSec) ? 14400 : expiresInSec) * 1000;

            this.cachedToken = {
                accessToken: data.access_token,
                expiresAt: Date.now() + expiresInMs,
            };

            return data.access_token;

        } catch (err) {
            if (err instanceof AuthenticationError) throw err;
            throw new AuthenticationError(
                'ups',
                `Failed to obtain access token: ${err instanceof Error ? err.message : 'unknown error'}`,
                err instanceof Error ? err : undefined,
            );
        }
    }
}
