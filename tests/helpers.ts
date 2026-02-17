import { RateRequest } from '../src/domain/models';
export function buildSampleRateRequest(overrides?: Partial<RateRequest>): RateRequest {
    return {
        origin: {
            name: 'Test Warehouse',
            street: '123 Warehouse Blvd',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94105',
            countryCode: 'US',
        },
        destination: {
            name: 'Test Customer',
            street: '456 Delivery Lane',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            countryCode: 'US',
        },
        packages: [
            {
                weight: 5.5,
                length: 12,
                width: 8,
                height: 6,
            },
        ],
        ...overrides,
    };
}
export const TEST_UPS_CONFIG = {
    clientId: 'test_client_id',
    clientSecret: 'test_client_secret',
    accountNumber: 'TEST123',
    baseUrl: 'https://onlinetools.ups.com',
    authUrl: 'https://onlinetools.ups.com/security/v1/oauth/token',
};
