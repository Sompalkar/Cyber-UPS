import { UpsAuthProvider } from '../../src/carriers/ups/auth';
import { HttpClient } from '../../src/http/client';
import { AuthenticationError } from '../../src/domain/errors';
import { TEST_UPS_CONFIG } from '../helpers';

import authSuccessFixture from '../fixtures/ups-auth-success.json';
jest.mock('../../src/http/client');

describe('UpsAuthProvider', () => {
    let authProvider: UpsAuthProvider;
    let mockHttpClient: jest.Mocked<HttpClient>;

    beforeEach(() => {
        mockHttpClient = new HttpClient('ups-auth', { timeoutMs: 5000 }) as jest.Mocked<HttpClient>;
        authProvider = new UpsAuthProvider(TEST_UPS_CONFIG, mockHttpClient);
    });

    describe('token acquisition', () => {
        it('should fetch a new token on first call', async () => {
            mockHttpClient.post.mockResolvedValueOnce({
                status: 200,
                data: authSuccessFixture,
                headers: {},
            });

            const token = await authProvider.getToken();

            expect(token).toBe(authSuccessFixture.access_token);
            expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
            const [url, body, config] = mockHttpClient.post.mock.calls[0];
            expect(url).toBe(TEST_UPS_CONFIG.authUrl);
            expect(body).toBe('grant_type=client_credentials');
            expect(config?.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
            expect(config?.headers?.['Authorization']).toMatch(/^Basic /);
        });

        it('should send base64-encoded credentials in Basic auth header', async () => {
            mockHttpClient.post.mockResolvedValueOnce({
                status: 200,
                data: authSuccessFixture,
                headers: {},
            });

            await authProvider.getToken();

            const authHeader = mockHttpClient.post.mock.calls[0][2]?.headers?.['Authorization'];
            const expected = Buffer.from(
                `${TEST_UPS_CONFIG.clientId}:${TEST_UPS_CONFIG.clientSecret}`
            ).toString('base64');
            expect(authHeader).toBe(`Basic ${expected}`);
        });
    });

    describe('token caching', () => {
        it('should reuse a cached token on subsequent calls', async () => {
            mockHttpClient.post.mockResolvedValueOnce({
                status: 200,
                data: authSuccessFixture,
                headers: {},
            });

            const token1 = await authProvider.getToken();
            const token2 = await authProvider.getToken();
            const token3 = await authProvider.getToken();
            expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
            expect(token1).toBe(token2);
            expect(token2).toBe(token3);
        });

        it('should not make duplicate requests when called concurrently', async () => {
            mockHttpClient.post.mockImplementation(
                () => new Promise(resolve =>
                    setTimeout(() => resolve({
                        status: 200,
                        data: authSuccessFixture,
                        headers: {},
                    }), 100)
                )
            );
            const results = await Promise.all([
                authProvider.getToken(),
                authProvider.getToken(),
                authProvider.getToken(),
                authProvider.getToken(),
                authProvider.getToken(),
            ]);
            expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
            results.forEach(token => {
                expect(token).toBe(authSuccessFixture.access_token);
            });
        });
    });

    describe('token refresh', () => {
        it('should fetch a new token when the cached one is about to expire', async () => {
            const shortLivedToken = {
                ...authSuccessFixture,
                access_token: 'short_lived_token',
                expires_in: '30',   // 30 seconds, within the 60s buffer
            };

            const freshToken = {
                ...authSuccessFixture,
                access_token: 'fresh_token',
                expires_in: '14399',
            };

            mockHttpClient.post
                .mockResolvedValueOnce({ status: 200, data: shortLivedToken, headers: {} })
                .mockResolvedValueOnce({ status: 200, data: freshToken, headers: {} });

            const token1 = await authProvider.getToken();
            expect(token1).toBe('short_lived_token');
            const token2 = await authProvider.getToken();
            expect(token2).toBe('fresh_token');
            expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
        });

        it('should fetch a new token after invalidate() is called', async () => {
            const tokenA = { ...authSuccessFixture, access_token: 'token_A' };
            const tokenB = { ...authSuccessFixture, access_token: 'token_B' };

            mockHttpClient.post
                .mockResolvedValueOnce({ status: 200, data: tokenA, headers: {} })
                .mockResolvedValueOnce({ status: 200, data: tokenB, headers: {} });

            const first = await authProvider.getToken();
            expect(first).toBe('token_A');
            authProvider.invalidate();

            const second = await authProvider.getToken();
            expect(second).toBe('token_B');
            expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
        });
    });

    describe('error handling', () => {
        it('should throw AuthenticationError when token response is missing access_token', async () => {
            mockHttpClient.post.mockResolvedValueOnce({
                status: 200,
                data: { status: 'denied' },   // no access_token field
                headers: {},
            });

            await expect(authProvider.getToken()).rejects.toThrow(AuthenticationError);
        });

        it('should throw AuthenticationError on network failure', async () => {
            mockHttpClient.post.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

            await expect(authProvider.getToken()).rejects.toThrow(AuthenticationError);
            await expect(authProvider.getToken()).rejects.toThrow(/Failed to obtain access token/);
        });

        it('should allow retry after a failed token request', async () => {
            mockHttpClient.post.mockRejectedValueOnce(new Error('network blip'));
            mockHttpClient.post.mockResolvedValueOnce({
                status: 200,
                data: authSuccessFixture,
                headers: {},
            });
            await expect(authProvider.getToken()).rejects.toThrow();
            const token = await authProvider.getToken();
            expect(token).toBe(authSuccessFixture.access_token);
        });
    });
});
