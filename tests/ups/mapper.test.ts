import { buildUpsRateRequest, parseUpsRateResponse } from '../../src/carriers/ups/mapper';
import { ServiceLevel } from '../../src/domain/models';
import { ParseError } from '../../src/domain/errors';
import { buildSampleRateRequest } from '../helpers';

import rateSuccessFixture from '../fixtures/ups-rate-success.json';

describe('UPS Mapper', () => {

    describe('buildUpsRateRequest', () => {
        it('should produce a correctly structured UPS rate request', () => {
            const request = buildSampleRateRequest();
            const upsRequest = buildUpsRateRequest(request, 'ACCT123');
            expect(upsRequest).toHaveProperty('RateRequest');
            expect(upsRequest.RateRequest).toHaveProperty('Request');
            expect(upsRequest.RateRequest).toHaveProperty('Shipment');

            const shipment = upsRequest.RateRequest.Shipment;
            expect(shipment.Shipper.Name).toBe('Test Warehouse');
            expect(shipment.Shipper.ShipperNumber).toBe('ACCT123');
            expect(shipment.Shipper.Address.City).toBe('San Francisco');
            expect(shipment.Shipper.Address.StateProvinceCode).toBe('CA');
            expect(shipment.Shipper.Address.PostalCode).toBe('94105');
            expect(shipment.Shipper.Address.CountryCode).toBe('US');
            expect(shipment.ShipTo.Address.City).toBe('New York');
            expect(shipment.ShipTo.Address.PostalCode).toBe('10001');
            expect(shipment.Package).toHaveLength(1);
            const pkg = shipment.Package[0];
            expect(pkg.PackagingType.Code).toBe('02');           // customer supplied
            expect(pkg.Dimensions.Length).toBe('12');             // string!
            expect(pkg.Dimensions.Width).toBe('8');
            expect(pkg.Dimensions.Height).toBe('6');
            expect(pkg.Dimensions.UnitOfMeasurement.Code).toBe('IN');
            expect(pkg.PackageWeight.Weight).toBe('5.5');         // string!
            expect(pkg.PackageWeight.UnitOfMeasurement.Code).toBe('LBS');
        });

        it('should include Service field when a specific service level is requested', () => {
            const request = buildSampleRateRequest({ serviceLevel: ServiceLevel.Overnight });
            const upsRequest = buildUpsRateRequest(request, 'ACCT123');

            expect(upsRequest.RateRequest.Shipment.Service).toBeDefined();
            expect(upsRequest.RateRequest.Shipment.Service?.Code).toBe('01');  // Next Day Air
        });

        it('should omit Service field for rate shopping (no specific level)', () => {
            const request = buildSampleRateRequest();  // no serviceLevel
            const upsRequest = buildUpsRateRequest(request, 'ACCT123');

            expect(upsRequest.RateRequest.Shipment.Service).toBeUndefined();
        });

        it('should handle multiple packages', () => {
            const request = buildSampleRateRequest({
                packages: [
                    { weight: 2, length: 10, width: 6, height: 4 },
                    { weight: 8, length: 18, width: 12, height: 10 },
                    { weight: 0.5, length: 6, width: 4, height: 3 },
                ],
            });
            const upsRequest = buildUpsRateRequest(request, 'ACCT123');

            expect(upsRequest.RateRequest.Shipment.Package).toHaveLength(3);
            expect(upsRequest.RateRequest.Shipment.Package[1].PackageWeight.Weight).toBe('8');
        });

        it('should handle address with street2 line', () => {
            const request = buildSampleRateRequest({
                origin: {
                    name: 'HQ',
                    street: '100 Main St',
                    street2: 'Suite 400',
                    city: 'Portland',
                    state: 'OR',
                    postalCode: '97201',
                    countryCode: 'US',
                },
            });
            const upsRequest = buildUpsRateRequest(request, 'ACCT123');

            expect(upsRequest.RateRequest.Shipment.Shipper.Address.AddressLine).toEqual([
                '100 Main St',
                'Suite 400',
            ]);
        });

        it('should include payment details with the account number', () => {
            const upsRequest = buildUpsRateRequest(buildSampleRateRequest(), 'MY_ACCT');

            const payment = upsRequest.RateRequest.Shipment.PaymentDetails;
            expect(payment).toBeDefined();
            expect(payment?.ShipmentCharge[0].BillShipper.AccountNumber).toBe('MY_ACCT');
        });
    });

    describe('parseUpsRateResponse', () => {
        it('should parse a multi-service rate response correctly', () => {
            const quotes = parseUpsRateResponse(rateSuccessFixture);
            expect(quotes).toHaveLength(3);
            const ground = quotes.find(q => q.serviceName === 'UPS Ground');
            expect(ground).toBeDefined();
            expect(ground?.carrier).toBe('ups');
            expect(ground?.serviceLevel).toBe(ServiceLevel.Ground);
            expect(ground?.totalPrice).toBe(15.72);
            expect(ground?.currency).toBe('USD');
            expect(ground?.transitDays).toBe(5);
        });

        it('should prefer negotiated rates when available', () => {
            const quotes = parseUpsRateResponse(rateSuccessFixture);
            const overnight = quotes.find(q => q.serviceName === 'UPS Next Day Air');
            expect(overnight).toBeDefined();
            expect(overnight?.totalPrice).toBe(48.15);
        });

        it('should parse transit days and guaranteed delivery', () => {
            const quotes = parseUpsRateResponse(rateSuccessFixture);

            const twoDay = quotes.find(q => q.serviceName === 'UPS 2nd Day Air');
            expect(twoDay?.transitDays).toBe(2);
            expect(twoDay?.guaranteedDelivery).toBe('11:30 P.M.');
        });

        it('should include charge breakdown', () => {
            const quotes = parseUpsRateResponse(rateSuccessFixture);

            const overnight = quotes.find(q => q.serviceName === 'UPS Next Day Air');
            expect(overnight?.breakdown).toBeDefined();
            expect(overnight?.breakdown?.baseCharge).toBe(52.30);
            expect(overnight?.breakdown?.fuelSurcharge).toBe(2.50);
        });

        it('should throw ParseError for completely malformed response', () => {
            expect(() => parseUpsRateResponse(null)).toThrow(ParseError);
            expect(() => parseUpsRateResponse({})).toThrow(ParseError);
            expect(() => parseUpsRateResponse({ RateResponse: {} })).toThrow(ParseError);
        });

        it('should handle response with a single RatedShipment (not array)', () => {
            const singleResult = {
                RateResponse: {
                    Response: {
                        ResponseStatus: { Code: '1', Description: 'Success' },
                        TransactionReference: { CustomerContext: 'test' },
                    },
                    RatedShipment: {   // note: not an array
                        Service: { Code: '03' },
                        TransportationCharges: { CurrencyCode: 'USD', MonetaryValue: '12.50' },
                        ServiceOptionsCharges: { CurrencyCode: 'USD', MonetaryValue: '0.00' },
                        TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '12.50' },
                    },
                },
            };

            const quotes = parseUpsRateResponse(singleResult);
            expect(quotes).toHaveLength(1);
            expect(quotes[0].totalPrice).toBe(12.50);
        });
    });
});
