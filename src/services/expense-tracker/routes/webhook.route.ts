import { Hono } from 'hono';
import type { TransactionProcessor } from '../transaction-processor.service';
import { validateWebhookPayload } from '@/shared/utils/validators';
import { logger } from '@/shared/utils/logger';
import { ZodError } from 'zod';
import { transformNotificationPayload } from './transformers';
import { tracer } from '@/shared/utils/tracing';
import { addSpanAttributes, setSpanStatus } from '@/shared/utils/tracing-utils';
import { trace, context } from '@opentelemetry/api';
import { getWideEvent } from '@/shared/middleware/wide-event.middleware';

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
        // Start root span for webhook request
        const span = tracer.startSpan('webhook.notification.received');

        return await context.with(trace.setSpan(context.active(), span), async () => {
            try {
                // Get wide event for enrichment
                const wideEvent = getWideEvent(c);

                // Add request metadata to span
                addSpanAttributes(span, {
                    'http.method': 'POST',
                    'http.route': '/webhook/notification',
                    'http.user_agent': c.req.header('user-agent') || 'unknown',
                });

                // Parse request body
                const body = await c.req.json();

                // Add raw payload to span
                span.addEvent('webhook.payload.received', {
                    'payload.raw': JSON.stringify(body),
                });

                // Transform payload to standard format
                const transformedBody = transformNotificationPayload(body);

                // Validate transformed payload
                const payload = validateWebhookPayload(transformedBody);

                // Enrich wide event with webhook context
                if (wideEvent) {
                    wideEvent.webhook = {
                        payload_type: 'notification',
                        has_gps: !!(payload.latitude && payload.longitude),
                        notification_text: payload.notification_text.substring(0, 100), // Truncate for log size
                    };
                }

                // Add validated payload attributes to span
                addSpanAttributes(span, {
                    'webhook.app_name': payload.app_name,
                    'webhook.has_gps': !!(payload.latitude && payload.longitude),
                    'webhook.timestamp': payload.timestamp,
                });

                // Process transaction asynchronously (fire-and-forget)
                // We respond immediately to MacroDroid, processing happens in background
                processor.processTransaction(payload, wideEvent).catch((error) => {
                    logger.error({
                        event: 'transaction.processing.error',
                        error,
                        payload,
                    }, 'Failed to process transaction');
                });

                // Mark span as successful
                setSpanStatus(span, true);
                span.end();

                // Return success immediately
                return c.json({
                    success: true,
                    message: 'Notification webhook received, processing transaction',
                });
            } catch (error) {
                // Get wide event for error enrichment
                const wideEvent = getWideEvent(c);

                // Record error in span
                setSpanStatus(span, false, error instanceof Error ? error.message : 'Unknown error');
                if (error instanceof Error) {
                    span.recordException(error);
                }
                span.end();

                // Validation error
                if (error instanceof ZodError) {
                    if (wideEvent) {
                        wideEvent.error = {
                            type: 'ValidationError',
                            message: 'Invalid webhook payload',
                            retriable: false,
                            step: 'validation',
                        };
                    }

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
                if (wideEvent && error instanceof Error) {
                    wideEvent.error = {
                        type: error.name,
                        message: error.message,
                        retriable: false,
                        step: 'webhook_processing',
                    };
                }

                return c.json(
                    {
                        success: false,
                        error: 'Internal server error',
                    },
                    500
                );
            }
        });
    });

    // Future webhook endpoints can be added here:
    // app.post('/webhook/email', async (c) => { ... });
    // app.post('/webhook/screenshot', async (c) => { ... });

    return app;
}
