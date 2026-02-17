import axios, {
    AxiosInstance,
    AxiosRequestConfig,
    AxiosResponse,
    AxiosError,
    InternalAxiosRequestConfig,
} from 'axios';
import {
    CarrierError,
    NetworkError,
    TimeoutError,
    RateLimitError,
} from '../domain/errors';

export interface HttpClientOptions {
    baseURL?: string;
    timeoutMs: number;
    defaultHeaders?: Record<string, string>;
}

export interface HttpResponse<T = unknown> {
    status: number;
    data: T;
    headers: Record<string, string>;
}
export class HttpClient {
    private client: AxiosInstance;
    private carrier: string;

    constructor(carrier: string, options: HttpClientOptions) {
        this.carrier = carrier;
        this.client = axios.create({
            baseURL: options.baseURL,
            timeout: options.timeoutMs,
            headers: {
                'Content-Type': 'application/json',
                ...options.defaultHeaders,
            },
        });
        this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
            (config as InternalAxiosRequestConfig & { metadata: { startTime: number } }).metadata = { startTime: Date.now() };
            return config;
        });
    }

    async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
        try {
            const response: AxiosResponse<T> = await this.client.post(url, data, config);
            return this.wrapResponse(response);
        } catch (err) {
            throw this.handleError(err);
        }
    }

    async get<T>(url: string, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
        try {
            const response: AxiosResponse<T> = await this.client.get(url, config);
            return this.wrapResponse(response);
        } catch (err) {
            throw this.handleError(err);
        }
    }

    private wrapResponse<T>(response: AxiosResponse<T>): HttpResponse<T> {
        return {
            status: response.status,
            data: response.data,
            headers: response.headers as Record<string, string>,
        };
    }
    private handleError(err: unknown): CarrierError {
        if (!axios.isAxiosError(err)) {
            return new NetworkError(
                this.carrier,
                `Unexpected error: ${err instanceof Error ? err.message : 'unknown'}`,
                err instanceof Error ? err : undefined,
            );
        }

        const axiosErr = err as AxiosError;
        if (axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') {
            return new TimeoutError(this.carrier, this.client.defaults.timeout ?? 0);
        }
        if (!axiosErr.response) {
            return new NetworkError(
                this.carrier,
                `Network error: ${axiosErr.message}`,
                axiosErr,
            );
        }

        const { status, data } = axiosErr.response;
        if (status === 429) {
            const retryAfter = axiosErr.response.headers['retry-after'];
            const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
            return new RateLimitError(this.carrier, retryMs);
        }
        return new CarrierError({
            message: `${this.carrier} API error (HTTP ${status}): ${this.extractErrorMessage(data)}`,
            code: 'CARRIER_API_ERROR',
            carrier: this.carrier,
            statusCode: status,
            retryable: status >= 500,
            details: typeof data === 'object' ? (data as Record<string, unknown>) : { raw: data },
        });
    }
    private extractErrorMessage(data: unknown): string {
        if (typeof data === 'string') return data;
        if (data && typeof data === 'object') {
            const obj = data as Record<string, unknown>;
            if (obj.response && typeof obj.response === 'object') {
                const resp = obj.response as Record<string, unknown>;
                if (Array.isArray(resp.errors) && resp.errors.length > 0) {
                    return String(resp.errors[0].message ?? resp.errors[0].code ?? 'Unknown error');
                }
            }
            if (obj.message) return String(obj.message);
        }
        return 'Unknown error';
    }
}
