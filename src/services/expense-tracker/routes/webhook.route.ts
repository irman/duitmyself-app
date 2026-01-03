import { Hono } from 'hono';
import type { TransactionProcessor } from '../transaction-processor.service';
import { validateWebhookPayload } from '@/shared/utils/validators';
import { logger } from '@/shared/utils/logger';
import { otelLog } from '@/shared/utils/otel-logger';
import { ZodError } from 'zod';
import { transformNotificationPayload } from './transformers';
import { tracer } from '@/shared/utils/tracing';
import { addSpanAttributes, setSpanStatus } from '@/shared/utils/tracing-utils';
import { trace, context } from '@opentelemetry/api';

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

                // Log raw incoming payload for debugging
                logger.info({
                    event: 'webhook.notification.payload.received',
                    raw_payload: body,
                    headers: {
                        'content-type': c.req.header('content-type'),
                        'user-agent': c.req.header('user-agent'),
                    },
                }, 'Received notification webhook payload');
                otelLog.info('Received notification webhook payload', {
                    event: 'webhook.notification.payload.received',
                    raw_payload: body,
                });

                // Transform payload to standard format
                const transformedBody = transformNotificationPayload(body);

                // Add transformed payload to span
                span.addEvent('webhook.payload.transformed', {
                    'payload.transformed': JSON.stringify(transformedBody),
                });

                // Log transformed payload
                logger.info({
                    event: 'webhook.notification.payload.transformed',
                    transformed_payload: transformedBody,
                }, 'Transformed notification webhook payload');
                otelLog.info('Transformed notification webhook payload', {
                    event: 'webhook.notification.payload.transformed',
                    transformed_payload: transformedBody,
                });

                // Validate transformed payload
                const payload = validateWebhookPayload(transformedBody);

                // Add validated payload attributes to span
                addSpanAttributes(span, {
                    'webhook.app_name': payload.app_name,
                    'webhook.has_gps': !!(payload.latitude && payload.longitude),
                    'webhook.timestamp': payload.timestamp,
                });

                // Log validated payload
                logger.info({
                    event: 'webhook.notification.payload.validated',
                    validated_payload: payload,
                }, 'Validated notification webhook payload');
                otelLog.info('Validated notification webhook payload', {
                    event: 'webhook.notification.payload.validated',
                    app_name: payload.app_name,
                });

                // Process transaction asynchronously (fire-and-forget)
                // We respond immediately to MacroDroid, processing happens in background
                processor.processTransaction(payload).catch((error) => {
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
                // Record error in span
                setSpanStatus(span, false, error instanceof Error ? error.message : 'Unknown error');
                if (error instanceof Error) {
                    span.recordException(error);
                }
                span.end();

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
    });

    // Future webhook endpoints can be added here:
    // app.post('/webhook/email', async (c) => { ... });
    // app.post('/webhook/screenshot', async (c) => { ... });

    return app;
}
