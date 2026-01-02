import { Hono } from 'hono';
import type { TransactionProcessor } from '../transaction-processor.service';
import { validateWebhookPayload } from '@/shared/utils/validators';
import { logger } from '@/shared/utils/logger';
import { ZodError } from 'zod';

/**
 * Create webhook routes
 * 
 * @param processor - Transaction processor instance
 * @returns Hono app with webhook routes
 */
export function createWebhookRoutes(processor: TransactionProcessor) {
    const app = new Hono();

    /**
     * Normalize MacroDroid payload to standard format
     * Accepts both MacroDroid format (app, title, text) and standard format
     */
    function normalizePayload(body: any): any {
        // If it's already in standard format, return as-is
        if (body.app_name && body.notification_title && body.notification_text) {
            return body;
        }

        // Convert MacroDroid format to standard format
        return {
            app_name: body.app || body.app_name,
            notification_title: body.title || body.notification_title,
            notification_text: body.text || body.notification_text,
            timestamp: body.timestamp,
            latitude: body.latitude,
            longitude: body.longitude,
        };
    }

    /**
     * POST /webhook
     * 
     * Process banking notification from MacroDroid
     */
    app.post('/webhook', async (c) => {
        try {
            // Parse request body
            const body = await c.req.json();

            // Normalize payload to standard format
            const normalizedBody = normalizePayload(body);

            // Validate normalized payload
            const payload = validateWebhookPayload(normalizedBody);

            // Process transaction asynchronously (fire-and-forget)
            // We respond immediately to MacroDroid, processing happens in background
            processor.processTransaction(payload).catch((error) => {
                logger.error({
                    event: 'transaction.processing.error',
                    error,
                    payload,
                }, 'Failed to process transaction');
            });

            // Return success immediately
            return c.json({
                success: true,
                message: 'Webhook received, processing transaction',
            });
        } catch (error) {
            // Validation error
            if (error instanceof ZodError) {
                logger.warn({
                    event: 'webhook.validation.failed',
                    errors: error.errors,
                }, 'Webhook payload validation failed');

                return c.json(
                    {
                        success: false,
                        error: 'Invalid webhook payload',
                        details: error.errors,
                    },
                    400
                );
            }

            // Other errors
            logger.error({
                event: 'webhook.error',
                error,
            }, 'Webhook endpoint error');

            return c.json(
                {
                    success: false,
                    error: 'Internal server error',
                },
                500
            );
        }
    });

    return app;
}
