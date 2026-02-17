import { RatingService } from '../../src/services/rating.service';
import { CarrierRegistry } from '../../src/carriers/registry';
import { CarrierAdapter } from '../../src/carriers/types';
import { ServiceLevel, RateQuote } from '../../src/domain/models';
import { CarrierError, ValidationError } from '../../src/domain/errors';
import { buildSampleRateRequest } from '../helpers';

function createMockCarrier(name: string, quotes: RateQuote[]): CarrierAdapter {
    return {
        name,
        getSupportedServices: () => [ServiceLevel.Ground, ServiceLevel.Overnight],
        getRates: jest.fn().mockResolvedValue(quotes),
    };
}

function createFailingCarrier(name: string, error: Error): CarrierAdapter {
    return {
        name,
        getSupportedServices: () => [ServiceLevel.Ground],
        getRates: jest.fn().mockRejectedValue(error),
    };
}

const sampleQuotes: RateQuote[] = [
    {
        carrier: 'mock',
        serviceName: 'Mock Ground',
        serviceLevel: ServiceLevel.Ground,
        totalPrice: 12.50,
        currency: 'USD',
        transitDays: 5,
    },
    {
        carrier: 'mock',
        serviceName: 'Mock Express',
        serviceLevel: ServiceLevel.Overnight,
        totalPrice: 45.00,
        currency: 'USD',
        transitDays: 1,
    },
];

describe('RatingService', () => {
    let registry: CarrierRegistry;
    let service: RatingService;

    beforeEach(() => {
        registry = new CarrierRegistry();
        service = new RatingService({ registry });
    });

    describe('input validation', () => {
        it('should reject request with empty packages array', async () => {
            const badRequest = {
                ...buildSampleRateRequest(),
                packages: [],
            };

            await expect(service.getRates(badRequest))
                .rejects.toThrow(ValidationError);
        });

        it('should reject request with negative package weight', async () => {
            const badRequest = {
                ...buildSampleRateRequest(),
                packages: [{ weight: -1, length: 10, width: 8, height: 6 }],
            };

            await expect(service.getRates(badRequest))
                .rejects.toThrow(ValidationError);
        });

        it('should reject request with missing origin city', async () => {
            const badRequest = {
                origin: { street: '123 St', city: '', state: 'CA', postalCode: '94105', countryCode: 'US' },
                destination: { street: '456 St', city: 'NYC', state: 'NY', postalCode: '10001', countryCode: 'US' },
                packages: [{ weight: 5, length: 10, width: 8, height: 6 }],
            };

            await expect(service.getRates(badRequest))
                .rejects.toThrow(ValidationError);
        });

        it('should reject request with invalid country code (wrong length)', async () => {
            const badRequest = {
                ...buildSampleRateRequest(),
                origin: {
                    street: '123 St',
                    city: 'Portland',
                    state: 'OR',
                    postalCode: '97201',
                    countryCode: 'USA',      // should be 2 chars
                },
            };

            await expect(service.getRates(badRequest))
                .rejects.toThrow(ValidationError);
        });

        it('should include field-level error details in ValidationError', async () => {
            try {
                await service.getRates({
                    origin: { street: '', city: '', state: '', postalCode: '', countryCode: 'X' },
                    destination: { street: '456 St', city: 'NYC', state: 'NY', postalCode: '10001', countryCode: 'US' },
                    packages: [],
                });
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(ValidationError);
                const valErr = err as ValidationError;
                expect(valErr.details).toBeDefined();
                expect(valErr.details?.issues).toBeDefined();
                expect(Array.isArray(valErr.details?.issues)).toBe(true);
            }
        });

        it('should reject package that exceeds maximum girth', async () => {
            const badRequest = {
                ...buildSampleRateRequest(),
                packages: [
                    { weight: 5, length: 80, width: 50, height: 50 },
                ],
            };

            await expect(service.getRates(badRequest))
                .rejects.toThrow(ValidationError);
        });
    });

    describe('carrier delegation', () => {
        it('should delegate to the specified carrier', async () => {
            const mockCarrier = createMockCarrier('mock-carrier', sampleQuotes);
            registry.register(mockCarrier);

            const result = await service.getRates(buildSampleRateRequest(), 'mock-carrier');

            expect(result.quotes).toHaveLength(2);
            expect(result.carrier).toBe('mock-carrier');
            expect(mockCarrier.getRates).toHaveBeenCalledTimes(1);
        });

        it('should throw CARRIER_NOT_FOUND for unregistered carrier', async () => {
            try {
                await service.getRates(buildSampleRateRequest(), 'nonexistent');
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(CarrierError);
                expect((err as CarrierError).code).toBe('CARRIER_NOT_FOUND');
            }
        });

        it('should throw CARRIER_NOT_FOUND when no carriers are registered', async () => {
            try {
                await service.getRates(buildSampleRateRequest());
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(CarrierError);
                expect((err as CarrierError).code).toBe('CARRIER_NOT_FOUND');
            }
        });
    });

    describe('multi-carrier fan-out', () => {
        it('should query all registered carriers when no specific carrier is specified', async () => {
            const carrier1 = createMockCarrier('carrier-a', [
                { carrier: 'carrier-a', serviceName: 'A Ground', serviceLevel: ServiceLevel.Ground, totalPrice: 20, currency: 'USD' },
            ]);
            const carrier2 = createMockCarrier('carrier-b', [
                { carrier: 'carrier-b', serviceName: 'B Ground', serviceLevel: ServiceLevel.Ground, totalPrice: 18, currency: 'USD' },
            ]);

            registry.register(carrier1);
            registry.register(carrier2);

            const result = await service.getRates(buildSampleRateRequest());

            expect(result.quotes).toHaveLength(2);
            expect(result.carrier).toBe('all');
            expect(carrier1.getRates).toHaveBeenCalledTimes(1);
            expect(carrier2.getRates).toHaveBeenCalledTimes(1);
        });

        it('should return partial results if one carrier fails during fan-out', async () => {
            const goodCarrier = createMockCarrier('good-carrier', [
                { carrier: 'good-carrier', serviceName: 'Good Ground', serviceLevel: ServiceLevel.Ground, totalPrice: 15, currency: 'USD' },
            ]);
            const badCarrier = createFailingCarrier('bad-carrier', new Error('API down'));

            registry.register(goodCarrier);
            registry.register(badCarrier);
            const result = await service.getRates(buildSampleRateRequest());

            expect(result.quotes).toHaveLength(1);
            expect(result.quotes[0].carrier).toBe('good-carrier');
        });
    });

    describe('result ordering', () => {
        it('should sort quotes by price, cheapest first', async () => {
            const unsortedQuotes: RateQuote[] = [
                { carrier: 'test', serviceName: 'Expensive', serviceLevel: ServiceLevel.Overnight, totalPrice: 99.99, currency: 'USD' },
                { carrier: 'test', serviceName: 'Cheap', serviceLevel: ServiceLevel.Ground, totalPrice: 5.99, currency: 'USD' },
                { carrier: 'test', serviceName: 'Medium', serviceLevel: ServiceLevel.TwoDay, totalPrice: 25.50, currency: 'USD' },
            ];

            registry.register(createMockCarrier('test', unsortedQuotes));

            const result = await service.getRates(buildSampleRateRequest(), 'test');

            expect(result.quotes[0].totalPrice).toBe(5.99);
            expect(result.quotes[1].totalPrice).toBe(25.50);
            expect(result.quotes[2].totalPrice).toBe(99.99);
        });
    });

    describe('response metadata', () => {
        it('should include a request ID and timestamp', async () => {
            registry.register(createMockCarrier('test', sampleQuotes));

            const result = await service.getRates(buildSampleRateRequest(), 'test');

            expect(result.requestId).toBeDefined();
            expect(result.requestId).toMatch(/^req_/);
            expect(result.requestedAt).toBeInstanceOf(Date);
        });
    });

    describe('error propagation', () => {
        it('should propagate carrier errors when targeting a specific carrier', async () => {
            const carrierError = new CarrierError({
                message: 'UPS is down',
                code: 'CARRIER_API_ERROR',
                carrier: 'test',
                retryable: true,
                statusCode: 500,
            });
            const failingCarrier = createFailingCarrier('test', carrierError);
            registry.register(failingCarrier);

            try {
                await service.getRates(buildSampleRateRequest(), 'test');
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(CarrierError);
                expect((err as CarrierError).code).toBe('CARRIER_API_ERROR');
                expect((err as CarrierError).retryable).toBe(true);
            }
        });
    });
});
