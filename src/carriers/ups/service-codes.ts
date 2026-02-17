import { ServiceLevel } from '../../domain/models';

interface ServiceInfo {
    name: string;
    level: ServiceLevel;
}
const UPS_SERVICE_MAP: Record<string, ServiceInfo> = {
    '01': { name: 'UPS Next Day Air', level: ServiceLevel.Overnight },
    '02': { name: 'UPS 2nd Day Air', level: ServiceLevel.TwoDay },
    '03': { name: 'UPS Ground', level: ServiceLevel.Ground },
    '07': { name: 'UPS Worldwide Express', level: ServiceLevel.International },
    '08': { name: 'UPS Worldwide Expedited', level: ServiceLevel.International },
    '11': { name: 'UPS Standard', level: ServiceLevel.Ground },
    '12': { name: 'UPS 3 Day Select', level: ServiceLevel.ThreeDay },
    '13': { name: 'UPS Next Day Air Saver', level: ServiceLevel.Overnight },
    '14': { name: 'UPS Next Day Air Early', level: ServiceLevel.Overnight },
    '54': { name: 'UPS Worldwide Express Plus', level: ServiceLevel.International },
    '59': { name: 'UPS 2nd Day Air A.M.', level: ServiceLevel.TwoDay },
    '65': { name: 'UPS Worldwide Saver', level: ServiceLevel.International },
};
const LEVEL_TO_UPS_CODE: Partial<Record<ServiceLevel, string>> = {
    [ServiceLevel.Ground]: '03',
    [ServiceLevel.Express]: '02',     // map "express" to 2nd Day Air
    [ServiceLevel.Overnight]: '01',
    [ServiceLevel.TwoDay]: '02',
    [ServiceLevel.ThreeDay]: '12',
    [ServiceLevel.International]: '07',
};
export function lookupServiceByCode(code: string): ServiceInfo {
    return UPS_SERVICE_MAP[code] ?? {
        name: `UPS Service ${code}`,
        level: ServiceLevel.Ground,   // default to ground for unknown codes
    };
}
export function getUpsCodeForLevel(level: ServiceLevel): string | undefined {
    return LEVEL_TO_UPS_CODE[level];
}
export function getSupportedLevels(): ServiceLevel[] {
    const levels = new Set(Object.values(UPS_SERVICE_MAP).map(s => s.level));
    return Array.from(levels);
}
