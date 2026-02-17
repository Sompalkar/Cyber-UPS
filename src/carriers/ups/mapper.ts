import { RateRequest, RateQuote, Address, PackageInfo, ChargeBreakdown } from '../../domain/models';
import {
    UpsRateRequest,
    UpsRateResponse,
    UpsAddress,
    UpsPackage,
    UpsRatedShipment,
} from './types';
import { lookupServiceByCode, getUpsCodeForLevel } from './service-codes';
import { ParseError } from '../../domain/errors';
export function buildUpsRateRequest(
    request: RateRequest,
    accountNumber: string,
): UpsRateRequest {
    const upsRequest: UpsRateRequest = {
        RateRequest: {
            Request: {
                TransactionReference: {
                    CustomerContext: `cybership-rate-${Date.now()}`,
                },
            },
            Shipment: {
                Shipper: {
                    Name: request.origin.name || 'Shipper',
                    ShipperNumber: accountNumber,
                    Address: mapAddress(request.origin),
                },
                ShipTo: {
                    Name: request.destination.name || 'Recipient',
                    Address: mapAddress(request.destination),
                },
                ShipFrom: {
                    Name: request.origin.name || 'Shipper',
                    Address: mapAddress(request.origin),
                },
                Package: request.packages.map(mapPackage),
                PaymentDetails: {
                    ShipmentCharge: [{
                        Type: '01',    // transportation charges
                        BillShipper: {
                            AccountNumber: accountNumber,
                        },
                    }],
                },
            },
        },
    };
    if (request.serviceLevel) {
        const upsCode = getUpsCodeForLevel(request.serviceLevel);
        if (upsCode) {
            upsRequest.RateRequest.Shipment.Service = {
                Code: upsCode,
                Description: request.serviceLevel,
            };
        }
    }

    return upsRequest;
}
function mapAddress(addr: Address): UpsAddress {
    const lines = [addr.street];
    if (addr.street2) lines.push(addr.street2);

    return {
        AddressLine: lines,
        City: addr.city,
        StateProvinceCode: addr.state,
        PostalCode: addr.postalCode,
        CountryCode: addr.countryCode,
    };
}
function mapPackage(pkg: PackageInfo): UpsPackage {
    return {
        PackagingType: {
            Code: '02',           // 02 = Customer Supplied Package
            Description: 'Package',
        },
        Dimensions: {
            UnitOfMeasurement: {
                Code: 'IN',
                Description: 'Inches',
            },
            Length: String(pkg.length),
            Width: String(pkg.width),
            Height: String(pkg.height),
        },
        PackageWeight: {
            UnitOfMeasurement: {
                Code: 'LBS',
                Description: 'Pounds',
            },
            Weight: String(pkg.weight),
        },
    };
}
export function parseUpsRateResponse(raw: unknown): RateQuote[] {
    try {
        const data = raw as UpsRateResponse;
        if (!data?.RateResponse?.RatedShipment) {
            throw new ParseError(
                'ups',
                'Response missing RateResponse.RatedShipment',
            );
        }
        let shipments = data.RateResponse.RatedShipment;
        if (!Array.isArray(shipments)) {
            shipments = [shipments];
        }

        return shipments.map(mapRatedShipment);

    } catch (err) {
        if (err instanceof ParseError) throw err;

        throw new ParseError(
            'ups',
            `Failed to parse rate response: ${err instanceof Error ? err.message : 'unknown error'}`,
            err instanceof Error ? err : undefined,
        );
    }
}
function mapRatedShipment(rated: UpsRatedShipment): RateQuote {
    const serviceInfo = lookupServiceByCode(rated.Service.Code);
    const totalCharges = rated.NegotiatedRateCharges?.TotalCharge ?? rated.TotalCharges;

    const quote: RateQuote = {
        carrier: 'ups',
        serviceName: serviceInfo.name,
        serviceLevel: serviceInfo.level,
        totalPrice: parseMonetary(totalCharges.MonetaryValue),
        currency: totalCharges.CurrencyCode || 'USD',
        breakdown: buildBreakdown(rated),
    };
    if (rated.GuaranteedDelivery) {
        const days = parseInt(rated.GuaranteedDelivery.BusinessDaysInTransit, 10);
        if (!isNaN(days)) {
            quote.transitDays = days;
        }
        if (rated.GuaranteedDelivery.DeliveryByTime) {
            quote.guaranteedDelivery = rated.GuaranteedDelivery.DeliveryByTime;
        }
    }

    return quote;
}

function buildBreakdown(rated: UpsRatedShipment): ChargeBreakdown {
    return {
        baseCharge: parseMonetary(rated.TransportationCharges.MonetaryValue),
        fuelSurcharge: parseMonetary(rated.ServiceOptionsCharges.MonetaryValue),
    };
}
function parseMonetary(value: string | undefined): number {
    if (!value) return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
}
