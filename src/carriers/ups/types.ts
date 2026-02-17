export interface UpsRateRequest {
    RateRequest: {
        Request: {
            TransactionReference: {
                CustomerContext: string;
            };
        };
        Shipment: UpsShipment;
    };
}

export interface UpsShipment {
    Shipper: UpsShipper;
    ShipTo: UpsShipTo;
    ShipFrom: UpsShipFrom;
    Service?: UpsService;
    Package: UpsPackage[];
    PaymentDetails?: {
        ShipmentCharge: Array<{
            Type: string;
            BillShipper: {
                AccountNumber: string;
            };
        }>;
    };
    ShipmentRatingOptions?: {
        NegotiatedRatesIndicator?: string;
    };
}

export interface UpsShipper {
    Name: string;
    ShipperNumber: string;
    Address: UpsAddress;
}

export interface UpsShipTo {
    Name: string;
    Address: UpsAddress;
}

export interface UpsShipFrom {
    Name: string;
    Address: UpsAddress;
}

export interface UpsAddress {
    AddressLine: string[];
    City: string;
    StateProvinceCode: string;
    PostalCode: string;
    CountryCode: string;
}

export interface UpsService {
    Code: string;
    Description?: string;
}

export interface UpsPackage {
    PackagingType: {
        Code: string;       // "02" = Customer Supplied Package
        Description?: string;
    };
    Dimensions: {
        UnitOfMeasurement: { Code: string; Description?: string };
        Length: string;      // UPS wants these as strings, which is annoying
        Width: string;
        Height: string;
    };
    PackageWeight: {
        UnitOfMeasurement: { Code: string; Description?: string };
        Weight: string;      // also a string
    };
}

export interface UpsRateResponse {
    RateResponse: {
        Response: {
            ResponseStatus: {
                Code: string;
                Description: string;
            };
            Alert?: UpsAlert[];
            TransactionReference: {
                CustomerContext: string;
            };
        };
        RatedShipment: UpsRatedShipment[];
    };
}

export interface UpsRatedShipment {
    Service: {
        Code: string;
        Description?: string;
    };
    RatedShipmentAlert?: UpsAlert[];
    BillingWeight?: {
        UnitOfMeasurement: { Code: string };
        Weight: string;
    };
    TransportationCharges: UpsCharge;
    ServiceOptionsCharges: UpsCharge;
    TotalCharges: UpsCharge;
    NegotiatedRateCharges?: {
        TotalCharge: UpsCharge;
    };
    GuaranteedDelivery?: {
        BusinessDaysInTransit: string;
        DeliveryByTime?: string;
    };
    RatedPackage?: Array<{
        TransportationCharges: UpsCharge;
        ServiceOptionsCharges: UpsCharge;
        TotalCharges: UpsCharge;
        Weight?: string;
    }>;
}

export interface UpsCharge {
    CurrencyCode: string;
    MonetaryValue: string;    // yes, UPS returns money as strings
}

export interface UpsAlert {
    Code: string;
    Description: string;
}

export interface UpsAuthResponse {
    access_token: string;
    token_type: string;
    issued_at: string;
    client_id: string;
    expires_in: string;      // seconds until expiry, but as a string
    status: string;
}

export interface UpsErrorResponse {
    response: {
        errors: Array<{
            code: string;
            message: string;
        }>;
    };
}
