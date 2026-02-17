export enum ServiceLevel {
    Ground = 'ground',
    Express = 'express',
    Overnight = 'overnight',
    TwoDay = 'two_day',
    ThreeDay = 'three_day',
    International = 'international',
}
export interface Address {
    name?: string;
    street: string;
    street2?: string;
    city: string;
    state: string;        // state/province code — "CA", "ON", etc.
    postalCode: string;
    countryCode: string;   // ISO 3166-1 alpha-2
}
export interface PackageInfo {
    weight: number;        // lbs
    length: number;        // inches
    width: number;         // inches
    height: number;        // inches
    description?: string;
}
export interface RateRequest {
    origin: Address;
    destination: Address;
    packages: PackageInfo[];
    serviceLevel?: ServiceLevel;   // if omitted, we'll shop across all available services
    shipDate?: string;             // ISO date string, defaults to today
}
export interface RateQuote {
    carrier: string;               // "ups", "fedex", etc.
    serviceName: string;           // human readable — "UPS Ground", "FedEx 2Day"
    serviceLevel: ServiceLevel;
    totalPrice: number;            // always USD for now. would add currency field later
    currency: string;
    transitDays?: number;          // estimated, not guaranteed
    guaranteedDelivery?: string;   // date string if the carrier guarantees it
    breakdown?: ChargeBreakdown;
}
export interface ChargeBreakdown {
    baseCharge: number;
    fuelSurcharge?: number;
    fees?: Array<{ name: string; amount: number }>;
}
export interface RateResponse {
    requestId: string;
    carrier: string;
    quotes: RateQuote[];
    requestedAt: Date;
}
