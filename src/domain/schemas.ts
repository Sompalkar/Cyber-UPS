import { z } from 'zod';
import { ServiceLevel } from './models';

export const addressSchema = z.object({
    name: z.string().optional(),
    street: z.string().min(1, 'Street address is required'),
    street2: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State/province code is required'),
    postalCode: z.string()
        .min(1, 'Postal code is required')
        .max(20, 'Postal code seems too long'),
    countryCode: z.string()
        .length(2, 'Country code must be 2-letter ISO format')
        .transform(val => val.toUpperCase()),
});

export const packageSchema = z.object({
    weight: z.number()
        .positive('Weight must be positive')
        .max(150, 'Single package cannot exceed 150 lbs'),  // UPS max is 150 lbs
    length: z.number().positive('Length must be positive'),
    width: z.number().positive('Width must be positive'),
    height: z.number().positive('Height must be positive'),
    description: z.string().optional(),
}).refine(
    (pkg) => {
        const girth = 2 * (pkg.width + pkg.height) + pkg.length;
        return girth <= 165;
    },
    { message: 'Package exceeds maximum girth + length of 165 inches' }
);

const serviceLevelSchema = z.nativeEnum(ServiceLevel);

export const rateRequestSchema = z.object({
    origin: addressSchema,
    destination: addressSchema,
    packages: z.array(packageSchema)
        .min(1, 'At least one package is required')
        .max(25, 'Maximum 25 packages per shipment'),
    serviceLevel: serviceLevelSchema.optional(),
    shipDate: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ship date must be YYYY-MM-DD format')
        .optional(),
});
export function validateRateRequest(input: unknown) {
    return rateRequestSchema.parse(input);
}
