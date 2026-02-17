import { CarrierAdapter } from './types';

export class CarrierRegistry {
    private carriers: Map<string, CarrierAdapter> = new Map();
    register(adapter: CarrierAdapter): void {
        this.carriers.set(adapter.name, adapter);
    }
    get(name: string): CarrierAdapter | undefined {
        return this.carriers.get(name);
    }
    listCarriers(): string[] {
        return Array.from(this.carriers.keys());
    }
    getAll(): CarrierAdapter[] {
        return Array.from(this.carriers.values());
    }
    has(name: string): boolean {
        return this.carriers.has(name);
    }
}
