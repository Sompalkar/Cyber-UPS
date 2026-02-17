import {
    RateRequest,
    RateResponse,
    RateQuote,
    ValidationError,
    CarrierError,
} from '../domain';
import { validateRateRequest } from '../domain/schemas';
import { CarrierRegistry } from '../carriers/registry';
import { RateQuoteRepository, AuditRepository } from '../db/repository';
import { ZodError } from 'zod';
function generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

interface RatingServiceDeps {
    registry: CarrierRegistry;
    quoteRepo?: RateQuoteRepository;   // optional — service works without DB
    auditRepo?: AuditRepository;       // optional
}

export class RatingService {
    private registry: CarrierRegistry;
    private quoteRepo?: RateQuoteRepository;
    private auditRepo?: AuditRepository;

    constructor(deps: RatingServiceDeps) {
        this.registry = deps.registry;
        this.quoteRepo = deps.quoteRepo;
        this.auditRepo = deps.auditRepo;
    }
    async getRates(
        rawRequest: unknown,
        carrierName?: string,
    ): Promise<RateResponse> {
        const requestId = generateRequestId();
        let request: RateRequest;
        try {
            request = validateRateRequest(rawRequest) as RateRequest;
        } catch (err) {
            if (err instanceof ZodError) {
                throw new ValidationError(
                    'Invalid rate request',
                    {
                        issues: err.issues.map(issue => ({
                            field: issue.path.join('.'),
                            message: issue.message,
                        })),
                    },
                );
            }
            throw err;
        }
        let quotes: RateQuote[] = [];

        if (carrierName) {
            const carrier = this.registry.get(carrierName);
            if (!carrier) {
                throw new CarrierError({
                    message: `Carrier "${carrierName}" is not registered. Available carriers: ${this.registry.listCarriers().join(', ')}`,
                    code: 'CARRIER_NOT_FOUND',
                    retryable: false,
                });
            }
            quotes = await this.fetchFromCarrier(carrier.name, request, requestId);
        } else {
            const carriers = this.registry.getAll();
            if (carriers.length === 0) {
                throw new CarrierError({
                    message: 'No carriers registered. Did you forget to register a carrier adapter?',
                    code: 'CARRIER_NOT_FOUND',
                    retryable: false,
                });
            }
            const results = await Promise.allSettled(
                carriers.map(c => this.fetchFromCarrier(c.name, request, requestId))
            );

            for (const result of results) {
                if (result.status === 'fulfilled') {
                    quotes.push(...result.value);
                } else {
                    console.warn(
                        `[rating] Carrier failed during rate shopping:`,
                        result.reason instanceof Error ? result.reason.message : result.reason,
                    );
                }
            }
        }
        quotes.sort((a, b) => a.totalPrice - b.totalPrice);
        if (this.quoteRepo && quotes.length > 0) {
            this.quoteRepo
                .saveQuotes(requestId, quotes, request.origin.postalCode, request.destination.postalCode)
                .catch(err => console.error('[rating] Failed to persist quotes:', err));
        }

        return {
            requestId,
            carrier: carrierName ?? 'all',
            quotes,
            requestedAt: new Date(),
        };
    }
    private async fetchFromCarrier(
        carrierName: string,
        request: RateRequest,
        requestId: string,
    ): Promise<RateQuote[]> {
        const carrier = this.registry.get(carrierName);
        if (!carrier) return [];

        const start = Date.now();

        try {
            const quotes = await carrier.getRates(request);
            if (this.auditRepo) {
                this.auditRepo.logOperation({
                    requestId,
                    carrier: carrierName,
                    operation: 'rate',
                    status: 'success',
                    durationMs: Date.now() - start,
                }).catch(() => { }); // swallow audit failures
            }

            return quotes;

        } catch (err) {
            const duration = Date.now() - start;
            if (this.auditRepo) {
                this.auditRepo.logOperation({
                    requestId,
                    carrier: carrierName,
                    operation: 'rate',
                    status: 'error',
                    durationMs: duration,
                    errorCode: err instanceof CarrierError ? err.code : 'UNKNOWN',
                    errorMsg: err instanceof Error ? err.message : 'unknown error',
                }).catch(() => { });
            }

            throw err;
        }
    }
}
