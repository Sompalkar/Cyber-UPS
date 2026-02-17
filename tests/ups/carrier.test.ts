import axios from 'axios';
import { UpsCarrier } from '../../src/carriers/ups/carrier';
import { ServiceLevel } from '../../src/domain/models';
import { CarrierError, TimeoutError, RateLimitError, ParseError } from '../../src/domain/errors';
import { buildSampleRateRequest, TEST_UPS_CONFIG } from '../helpers';

import authFixture from '../fixtures/ups-auth-success.json';
import rateSuccessFixture from '../fixtures/ups-rate-success.json';
import rateErrorFixture from '../fixtures/ups-rate-error.json';
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
function createMockAxiosInstance(options: {
    authResponse?: unknown;
    rateResponse?: unknown;
    authError?: unknown;
    rateError?: unknown;
}) {
    const mockPost = jest.fn().mockImplementation((url: string) => {
        if (url.includes('oauth') || url.includes('security')) {
            if (options.authError) return Promise.reject(options.authError);
            return Promise.resolve({
                status: 200,
                data: options.authResponse ?? authFixture,
                headers: {},
            });
        }
        if (options.rateError) return Promise.reject(options.rateError);
        return Promise.resolve({
            status: 200,
            data: options.rateResponse ?? rateSuccessFixture,
            headers: {},
        });
    });

    return {
        post: mockPost,
        get: jest.fn(),
        defaults: { timeout: 15000 },
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
        },
    };
}

describe('UpsCarrier', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockedAxios.isAxiosError.mockReturnValue(false);
    });

    function createCarrierWithMock(options: Parameters<typeof createMockAxiosInstance>[0] = {}) {
        const mockInstance = createMockAxiosInstance(options);
        mockedAxios.create.mockReturnValue(mockInstance as any);
        const carrier = new UpsCarrier(TEST_UPS_CONFIG, 15000);
        return { carrier, mockInstance };
    }

    describe('getRates - happy path', () => {
        it('should return parsed rate quotes for a valid request', async () => {
            const { carrier } = createCarrierWithMock({});

            const request = buildSampleRateRequest();
            const quotes = await carrier.getRates(request);

            expect(quotes).toHaveLength(3);
            expect(quotes.every(q => q.carrier === 'ups')).toBe(true);
            const serviceNames = quotes.map(q => q.serviceName);
            expect(serviceNames).toContain('UPS Ground');
            expect(serviceNames).toContain('UPS 2nd Day Air');
            expect(serviceNames).toContain('UPS Next Day Air');
        });

        it('should include auth token in the rate request headers', async () => {
            const { carrier, mockInstance } = createCarrierWithMock({});

            await carrier.getRates(buildSampleRateRequest());
            const rateCalls = mockInstance.post.mock.calls.filter(
                (call: unknown[]) => !(call[0] as string).includes('oauth')
            );
            expect(rateCalls.length).toBeGreaterThan(0);
            const rateConfig = rateCalls[0][2];
            expect(rateConfig?.headers?.Authorization).toMatch(/^Bearer /);
            expect(rateConfig?.headers?.Authorization).toContain(authFixture.access_token);
        });

        it('should handle specific service level requests', async () => {
            const singleServiceResponse = {
                RateResponse: {
                    Response: {
                        ResponseStatus: { Code: '1', Description: 'Success' },
                        TransactionReference: { CustomerContext: 'test' },
                    },
                    RatedShipment: [
                        {
                            Service: { Code: '03' },
                            TransportationCharges: { CurrencyCode: 'USD', MonetaryValue: '15.72' },
                            ServiceOptionsCharges: { CurrencyCode: 'USD', MonetaryValue: '0.00' },
                            TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '15.72' },
                            GuaranteedDelivery: { BusinessDaysInTransit: '5' },
                        },
                    ],
                },
            };

            const { carrier } = createCarrierWithMock({ rateResponse: singleServiceResponse });

            const request = buildSampleRateRequest({ serviceLevel: ServiceLevel.Ground });
            const quotes = await carrier.getRates(request);

            expect(quotes).toHaveLength(1);
            expect(quotes[0].serviceLevel).toBe(ServiceLevel.Ground);
        });
    });

    describe('getRates - error handling', () => {
        it('should throw CarrierError for HTTP 400 from UPS', async () => {
            const error400: any = new Error('Request failed');
            error400.response = { status: 400, data: rateErrorFixture, headers: {} };
            error400.isAxiosError = true;
            error400.code = undefined;

            mockedAxios.isAxiosError.mockReturnValue(true);
            const { carrier } = createCarrierWithMock({ rateError: error400 });

            try {
                await carrier.getRates(buildSampleRateRequest());
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(CarrierError);
                const carrierErr = err as CarrierError;
                expect(carrierErr.statusCode).toBe(400);
                expect(carrierErr.retryable).toBe(false);
            }
        });

        it('should throw retryable CarrierError for HTTP 500', async () => {
            const error500: any = new Error('Internal error');
            error500.response = { status: 500, data: { message: 'Internal error' }, headers: {} };
            error500.isAxiosError = true;

            mockedAxios.isAxiosError.mockReturnValue(true);
            const { carrier } = createCarrierWithMock({ rateError: error500 });

            try {
                await carrier.getRates(buildSampleRateRequest());
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(CarrierError);
                expect((err as CarrierError).retryable).toBe(true);
            }
        });

        it('should throw RateLimitError for HTTP 429', async () => {
            const error429: any = new Error('Too Many Requests');
            error429.response = { status: 429, data: {}, headers: { 'retry-after': '30' } };
            error429.isAxiosError = true;

            mockedAxios.isAxiosError.mockReturnValue(true);
            const { carrier } = createCarrierWithMock({ rateError: error429 });

            try {
                await carrier.getRates(buildSampleRateRequest());
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(RateLimitError);
                expect((err as RateLimitError).retryable).toBe(true);
                expect((err as RateLimitError).retryAfterMs).toBe(30000);
            }
        });

        it('should throw TimeoutError when request times out', async () => {
            const timeoutErr: any = new Error('timeout of 15000ms exceeded');
            timeoutErr.code = 'ECONNABORTED';
            timeoutErr.isAxiosError = true;

            mockedAxios.isAxiosError.mockReturnValue(true);
            const { carrier } = createCarrierWithMock({ rateError: timeoutErr });

            try {
                await carrier.getRates(buildSampleRateRequest());
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(TimeoutError);
                expect((err as TimeoutError).retryable).toBe(true);
            }
        });

        it('should handle malformed JSON response from UPS', async () => {
            const { carrier } = createCarrierWithMock({ rateResponse: 'this is not JSON' });

            try {
                await carrier.getRates(buildSampleRateRequest());
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(ParseError);
            }
        });
    });

    describe('getSupportedServices', () => {
        it('should return supported service levels', () => {
            const { carrier } = createCarrierWithMock({});

            const services = carrier.getSupportedServices();
            expect(services).toContain(ServiceLevel.Ground);
            expect(services).toContain(ServiceLevel.Overnight);
            expect(services).toContain(ServiceLevel.TwoDay);
            expect(services.length).toBeGreaterThan(0);
        });
    });

    describe('carrier metadata', () => {
        it('should identify as "ups"', () => {
            const { carrier } = createCarrierWithMock({});
            expect(carrier.name).toBe('ups');
        });
    });
});
