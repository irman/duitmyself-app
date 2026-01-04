import { z } from 'zod';

/**
 * Webhook payload validation schema
 */
export const webhookPayloadSchema = z.object({
    app_name: z.string().min(1, 'App name is required'),
    notification_title: z.string().min(1, 'Notification title is required'),
    notification_text: z.string().min(1, 'Notification text is required'),
    timestamp: z.string().datetime('Invalid timestamp format'),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
});

/**
 * Environment variables validation schema
 */
export const envSchema = z.object({
    // Server
    PORT: z.string().default('3000').transform(Number),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // API Keys
    GEMINI_API_KEY: z.string().min(1, 'Gemini API key is required'),
    LUNCH_MONEY_API_KEY: z.string().min(1, 'Lunch Money API key is required'),
    LOCATIONIQ_API_KEY: z.string().min(1, 'LocationIQ API key is required'),

    // Security (Optional)
    WEBHOOK_SECRET: z.string().optional(),

    // Account Mapping (Optional - Overrides config file)
    ACCOUNT_MAYBANK_MAE: z.string().optional(),
    ACCOUNT_GRAB: z.string().optional(),
    ACCOUNT_TNG_EWALLET: z.string().optional(),
    ACCOUNT_SHOPEEPAY: z.string().optional(),

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number),
    RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),

    // Retry Configuration
    API_RETRY_LIMIT: z.string().default('3').transform(Number),
    API_RETRY_BACKOFF_MS: z.string().default('10000').transform(Number),
});

/**
 * Extracted transaction validation schema
 */
export const extractedTransactionSchema = z.object({
    is_transaction: z.boolean(),
    amount: z.number().optional(),
    merchant: z.string().min(1).optional(),
    type: z.enum(['debit', 'credit']).optional(),
    currency: z.string().optional(),
    category: z.string().optional(),
    reference: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    notes: z.string().optional(),
});

/**
 * Coordinates validation schema
 */
export const coordinatesSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
});

/**
 * Account mapping validation schema
 */
export const accountMappingSchema = z.record(z.string(), z.string());

/**
 * Validate webhook payload
 */
export function validateWebhookPayload(data: unknown) {
    return webhookPayloadSchema.parse(data);
}

/**
 * Validate environment variables
 */
export function validateEnv(env: NodeJS.ProcessEnv) {
    return envSchema.parse(env);
}

/**
 * Validate extracted transaction
 */
export function validateExtractedTransaction(data: unknown) {
    return extractedTransactionSchema.parse(data);
}

/**
 * Validate coordinates
 */
export function validateCoordinates(lat: string, lon: string) {
    return coordinatesSchema.parse({
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
    });
}

/**
 * Validate account mapping
 */
export function validateAccountMapping(data: unknown) {
    return accountMappingSchema.parse(data);
}

/**
 * Type exports for validated data
 */
export type ValidatedWebhookPayload = z.infer<typeof webhookPayloadSchema>;
export type ValidatedEnv = z.infer<typeof envSchema>;
export type ValidatedExtractedTransaction = z.infer<typeof extractedTransactionSchema>;
export type ValidatedCoordinates = z.infer<typeof coordinatesSchema>;
export type ValidatedAccountMapping = z.infer<typeof accountMappingSchema>;
