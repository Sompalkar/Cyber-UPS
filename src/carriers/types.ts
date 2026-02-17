import { RateRequest, RateQuote, ServiceLevel } from '../domain/models';
export interface AuthProvider {
    getToken(): Promise<string>;
    invalidate(): void;
}
export interface CarrierAdapter {
    readonly name: string;
    getSupportedServices(): ServiceLevel[];
    getRates(request: RateRequest): Promise<RateQuote[]>;
}
