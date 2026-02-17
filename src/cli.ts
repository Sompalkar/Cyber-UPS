import { loadConfig } from './config';
import { CarrierRegistry } from './carriers/registry';
import { UpsCarrier } from './carriers/ups/carrier';
import { RatingService } from './services/rating.service';

import { CarrierError } from './domain/errors';

async function main() {
    console.log('=== Cybership Carrier Integration Demo ===\n');

    let config;
    try {
        config = loadConfig();
    } catch (err) {
        console.error('Config error:', (err as Error).message);
        console.log('\nHint: copy .env.example to .env and fill in your UPS credentials.\n');
        process.exit(1);
    }
    const registry = new CarrierRegistry();
    const upsCarrier = new UpsCarrier(config.ups, config.requestTimeoutMs);
    registry.register(upsCarrier);

    console.log(`Registered carriers: ${registry.listCarriers().join(', ')}`);
    const ratingService = new RatingService({ registry });
    const sampleRequest = {
        origin: {
            name: 'Cybership HQ',
            street: '123 Warehouse Blvd',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94105',
            countryCode: 'US',
        },
        destination: {
            name: 'Customer',
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
                description: 'Electronics',
            },
        ],
    };

    console.log('\nSample rate request:');
    console.log(JSON.stringify(sampleRequest, null, 2));
    try {
        console.log('\nFetching rates from UPS...');
        const result = await ratingService.getRates(sampleRequest, 'ups');

        console.log(`\nGot ${result.quotes.length} rate quotes:`);
        for (const quote of result.quotes) {
            console.log(
                `  ${quote.serviceName}: $${quote.totalPrice.toFixed(2)} ${quote.currency}` +
                (quote.transitDays ? ` (${quote.transitDays} business days)` : '')
            );
        }
        console.log(`\nRequest ID: ${result.requestId}`);

    } catch (err) {
        if (err instanceof CarrierError) {
            console.log(`\nCarrier error (expected without live credentials):`);
            console.log(JSON.stringify(err.toJSON(), null, 2));
            console.log(`\nRetryable: ${err.retryable}`);
        } else {
            console.error('Unexpected error:', err);
        }
    }
    console.log('\n--- Validation Demo ---');
    try {
        await ratingService.getRates({
            origin: { street: '', city: '', state: '', postalCode: '', countryCode: 'X' },
            destination: { street: '456 St', city: 'NYC', state: 'NY', postalCode: '10001', countryCode: 'US' },
            packages: [],   // empty packages array should fail
        });
    } catch (err) {
        if (err instanceof CarrierError) {
            console.log('Validation correctly caught bad input:');
            console.log(JSON.stringify(err.toJSON(), null, 2));
        }
    }

    console.log('\nDone.');
}

main().catch(console.error);
