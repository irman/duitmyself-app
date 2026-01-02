import { Hono } from 'hono';
import type { TransactionProcessor } from '../transaction-processor.service';
import { validateWebhookPayload } from '@/shared/utils/validators';
import { logger } from '@/shared/utils/logger';
import { ZodError } from 'zod';
import { transformNotificationPayload } from './transformers';

/**
 * Create webhook routes
 * 
 * @param processor - Transaction processor instance
 * @returns Hono app with webhook routes
 */
export function createWebhookRoutes(processor: TransactionProcessor) {
    const app = new Hono();

    /**
     * POST /webhook/notification
     * 
     * Process banking notification from MacroDroid
     * Accepts both MacroDroid format (app, title, text) and standard format
     */
    app.post('/webhook/notification', async (c) => {
        try {
            // Parse request body
            const body = await c.req.json();

            // Log raw incoming payload for debugging
            logger.info({
                event: 'webhook.notification.payload.received',
                raw_payload: body,
                headers: {
                    'content-type': c.req.header('content-type'),
                    'user-agent': c.req.header('user-agent'),
                },
            }, 'Received notification webhook payload');

            // Transform payload to standard format
            const transformedBody = transformNotificationPayload(body);

            // Log transformed payload
            logger.info({
                event: 'webhook.notification.payload.transformed',
                transformed_payload: transformedBody,
            }, 'Transformed notification webhook payload');

            // Validate transformed payload
            const payload = validateWebhookPayload(transformedBody);

            // Log validated payload
            logger.info({
                event: 'webhook.notification.payload.validated',
                validated_payload: payload,
            }, 'Validated notification webhook payload');

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
                message: 'Notification webhook received, processing transaction',
            });
        } catch (error) {
            // Validation error
            if (error instanceof ZodError) {
                logger.warn({
                    event: 'webhook.notification.validation.failed',
                    errors: error.errors,
                }, 'Notification webhook payload validation failed');

                return c.json(
                    {
                        success: false,
                        error: 'Invalid notification webhook payload',
                        details: error.errors,
                    },
                    400
                );
            }

            // Other errors
            logger.error({
                event: 'webhook.notification.error',
                error,
            }, 'Notification webhook endpoint error');

            return c.json(
                {
                    success: false,
                    error: 'Internal server error',
                },
                500
            );
        }
    });

    // Future webhook endpoints can be added here:
    // app.post('/webhook/email', async (c) => { ... });
    // app.post('/webhook/screenshot', async (c) => { ... });

    return app;
}
