import { CarrierAdapter } from '../types';
import { RateRequest, RateQuote, ServiceLevel } from '../../domain/models';
import { CarrierError, AuthenticationError, ParseError } from '../../domain/errors';
import { HttpClient } from '../../http/client';
import { UpsConfig } from '../../config';
import { UpsAuthProvider } from './auth';
import { buildUpsRateRequest, parseUpsRateResponse } from './mapper';
import { getSupportedLevels } from './service-codes';

const RATE_API_PATH = '/api/rating/v2403/Rate';

export class UpsCarrier implements CarrierAdapter {
    readonly name = 'ups';

    private auth: UpsAuthProvider;
    private httpClient: HttpClient;
    private accountNumber: string;

    constructor(config: UpsConfig, timeoutMs: number) {
        this.accountNumber = config.accountNumber;
        this.httpClient = new HttpClient('ups', {
            baseURL: config.baseUrl,
            timeoutMs,
        });
        const authClient = new HttpClient('ups-auth', {
            timeoutMs,
        });
        this.auth = new UpsAuthProvider(config, authClient);
    }

    getSupportedServices(): ServiceLevel[] {
        return getSupportedLevels();
    }

    async getRates(request: RateRequest): Promise<RateQuote[]> {
        const upsRequest = buildUpsRateRequest(request, this.accountNumber);

        try {
            return await this.executeRateRequest(upsRequest);
        } catch (err) {
            if (this.isAuthError(err)) {
                this.auth.invalidate();
                return await this.executeRateRequest(upsRequest);
            }
            throw err;
        }
    }

    private async executeRateRequest(upsRequest: unknown): Promise<RateQuote[]> {
        const token = await this.auth.getToken();
        const response = await this.httpClient.post<unknown>(
            RATE_API_PATH,
            upsRequest,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'transId': `cybership-${Date.now()}`,   // UPS requires a transaction ID
                    'transactionSrc': 'cybership',
                },
            },
        );
        try {
            return parseUpsRateResponse(response.data);
        } catch (err) {
            if (err instanceof ParseError) throw err;

            throw new ParseError(
                'ups',
                `Unexpected response structure from UPS Rating API`,
                err instanceof Error ? err : undefined,
            );
        }
    }

    private isAuthError(err: unknown): boolean {
        if (err instanceof AuthenticationError) return true;
        if (err instanceof CarrierError && err.statusCode === 401) return true;
        return false;
    }
}
