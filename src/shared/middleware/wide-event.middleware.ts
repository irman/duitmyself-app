import type { Context, Next } from 'hono';
import { logger } from '@/shared/utils/logger';
import type { WideEvent } from '@/shared/types/wide-event.types';
import { trace } from '@opentelemetry/api';

/**
 * Wide Event Middleware
 * 
 * Implements the "wide events" pattern from https://loggingsucks.com/
 * 
 * Creates a single, context-rich log event per request that accumulates
 * business and technical context throughout the request lifecycle.
 * 
 * Benefits:
 * - Single canonical log line per request (vs 17+ scattered logs)
 * - All context in one place for powerful queries
 * - Reduced log volume (80%+ reduction)
 * - Better correlation and debugging
 * 
 * Usage:
 * ```typescript
 * app.use('/*', wideEventMiddleware());
 * 
 * // In route handler:
 * const wideEvent = c.get('wideEvent');
 * wideEvent.transaction = { amount: 100, merchant: 'Starbucks' };
 * ```
 */
export function wideEventMiddleware() {
    return async (c: Context, next: Next) => {
        const startTime = Date.now();

        // Get trace context for correlation
        const activeSpan = trace.getActiveSpan();
        const spanContext = activeSpan?.spanContext();

        // Initialize wide event with request metadata
        const wideEvent: WideEvent = {
            timestamp: new Date().toISOString(),
            request_id: crypto.randomUUID(),
            service: process.env.OTEL_SERVICE_NAME || 'duitmyself-app',
            version: process.env.npm_package_version || '1.0.0',
            http: {
                method: c.req.method,
                path: c.req.path,
                user_agent: c.req.header('user-agent') || 'unknown',
            },
            outcome: 'success', // Default, will be updated
            duration_ms: 0, // Will be calculated in finally
        };

        // Add optional trace context if available
        if (spanContext?.traceId) {
            wideEvent.trace_id = spanContext.traceId;
        }
        if (spanContext?.spanId) {
            wideEvent.span_id = spanContext.spanId;
        }
        if (process.env.DEPLOYMENT_ID) {
            wideEvent.deployment_id = process.env.DEPLOYMENT_ID;
        }
        if (process.env.REGION) {
            wideEvent.region = process.env.REGION;
        }

        // Attach wide event to context for enrichment by handlers
        c.set('wideEvent', wideEvent);

        try {
            await next();

            // Capture response status
            wideEvent.http!.status_code = c.res.status;

            // Determine outcome based on status code
            if (c.res.status >= 200 && c.res.status < 300) {
                wideEvent.outcome = 'success';
            } else if (c.res.status >= 400 && c.res.status < 500) {
                wideEvent.outcome = 'rejected';
            } else {
                wideEvent.outcome = 'error';
            }
        } catch (error) {
            // Capture error details
            wideEvent.outcome = 'error';
            wideEvent.http!.status_code = 500;

            if (error instanceof Error) {
                wideEvent.error = {
                    type: error.name,
                    message: error.message,
                    retriable: false, // Default, can be overridden by handler
                };
                if (error.stack) {
                    wideEvent.error.stack = error.stack;
                }
            } else {
                wideEvent.error = {
                    type: 'UnknownError',
                    message: String(error),
                    retriable: false,
                };
            }

            // Re-throw to let error handler deal with it
            throw error;
        } finally {
            // Calculate final duration
            wideEvent.duration_ms = Date.now() - startTime;

            // Emit the single canonical log line
            logger.info(wideEvent, `${wideEvent.http?.method} ${wideEvent.http?.path} - ${wideEvent.outcome}`);
        }
    };
}

/**
 * Helper function to safely get wide event from context
 * Returns undefined if not available (e.g., in tests or non-HTTP contexts)
 */
export function getWideEvent(c: Context): WideEvent | undefined {
    try {
        return c.get('wideEvent');
    } catch {
        return undefined;
    }
}
