export type ErrorCode =
    | 'VALIDATION_ERROR'
    | 'AUTH_FAILED'
    | 'AUTH_EXPIRED'
    | 'RATE_LIMITED'
    | 'CARRIER_API_ERROR'
    | 'NETWORK_ERROR'
    | 'TIMEOUT'
    | 'PARSE_ERROR'
    | 'CARRIER_NOT_FOUND'
    | 'UNKNOWN';
export class CarrierError extends Error {
    public readonly code: ErrorCode;
    public readonly carrier: string;
    public readonly retryable: boolean;
    public readonly statusCode?: number;
    public readonly details?: Record<string, unknown>;

    constructor(opts: {
        message: string;
        code: ErrorCode;
        carrier?: string;
        retryable?: boolean;
        statusCode?: number;
        details?: Record<string, unknown>;
        cause?: Error;
    }) {
        super(opts.message);
        this.name = 'CarrierError';
        this.code = opts.code;
        this.carrier = opts.carrier ?? 'unknown';
        this.retryable = opts.retryable ?? false;
        this.statusCode = opts.statusCode;
        this.details = opts.details;
        if (opts.cause) {
            this.cause = opts.cause;
        }
    }
    toJSON() {
        return {
            error: {
                code: this.code,
                message: this.message,
                carrier: this.carrier,
                retryable: this.retryable,
                ...(this.statusCode ? { statusCode: this.statusCode } : {}),
                ...(this.details ? { details: this.details } : {}),
            },
        };
    }
}

export class AuthenticationError extends CarrierError {
    constructor(carrier: string, message: string, cause?: Error) {
        super({
            message,
            code: 'AUTH_FAILED',
            carrier,
            retryable: false,
            statusCode: 401,
            cause,
        });
        this.name = 'AuthenticationError';
    }
}

export class RateLimitError extends CarrierError {
    public readonly retryAfterMs?: number;

    constructor(carrier: string, retryAfterMs?: number) {
        super({
            message: `Rate limited by ${carrier}. ${retryAfterMs ? `Retry after ${retryAfterMs}ms` : 'Try again later.'}`,
            code: 'RATE_LIMITED',
            carrier,
            retryable: true,
            statusCode: 429,
        });
        this.name = 'RateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
}

export class NetworkError extends CarrierError {
    constructor(carrier: string, message: string, cause?: Error) {
        super({
            message,
            code: 'NETWORK_ERROR',
            carrier,
            retryable: true,
            cause,
        });
        this.name = 'NetworkError';
    }
}

export class TimeoutError extends CarrierError {
    constructor(carrier: string, timeoutMs: number) {
        super({
            message: `Request to ${carrier} timed out after ${timeoutMs}ms`,
            code: 'TIMEOUT',
            carrier,
            retryable: true,
        });
        this.name = 'TimeoutError';
    }
}

export class ValidationError extends CarrierError {
    constructor(message: string, details?: Record<string, unknown>) {
        super({
            message,
            code: 'VALIDATION_ERROR',
            retryable: false,
            details,
        });
        this.name = 'ValidationError';
    }
}

export class ParseError extends CarrierError {
    constructor(carrier: string, message: string, cause?: Error) {
        super({
            message,
            code: 'PARSE_ERROR',
            carrier,
            retryable: false,
            cause,
        });
        this.name = 'ParseError';
    }
}
