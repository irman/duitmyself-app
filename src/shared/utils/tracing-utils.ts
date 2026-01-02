import { Span, SpanStatusCode, trace, context } from '@opentelemetry/api';
import { tracer } from './tracing';

/**
 * Tracing Utility Functions
 * 
 * Helper functions for creating and managing OpenTelemetry spans
 */

/**
 * Execute a function within a new span
 * 
 * @param spanName - Name of the span
 * @param fn - Function to execute within the span
 * @param attributes - Optional span attributes
 * @returns Result of the function
 */
export async function withSpan<T>(
    spanName: string,
    fn: (span: Span) => Promise<T>,
    attributes?: Record<string, string | number | boolean>
): Promise<T> {
    const span = tracer.startSpan(spanName);

    // Add attributes if provided
    if (attributes) {
        span.setAttributes(attributes);
    }

    try {
        // Execute function in span context
        const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));

        // Mark span as successful
        span.setStatus({ code: SpanStatusCode.OK });

        return result;
    } catch (error) {
        // Record exception and mark span as error
        recordException(span, error);
        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
    } finally {
        // Always end the span
        span.end();
    }
}

/**
 * Execute a synchronous function within a new span
 * 
 * @param spanName - Name of the span
 * @param fn - Function to execute within the span
 * @param attributes - Optional span attributes
 * @returns Result of the function
 */
export function withSpanSync<T>(
    spanName: string,
    fn: (span: Span) => T,
    attributes?: Record<string, string | number | boolean>
): T {
    const span = tracer.startSpan(spanName);

    // Add attributes if provided
    if (attributes) {
        span.setAttributes(attributes);
    }

    try {
        // Execute function in span context
        const result = context.with(trace.setSpan(context.active(), span), () => fn(span));

        // Mark span as successful
        span.setStatus({ code: SpanStatusCode.OK });

        return result;
    } catch (error) {
        // Record exception and mark span as error
        recordException(span, error);
        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
    } finally {
        // Always end the span
        span.end();
    }
}

/**
 * Add structured attributes to a span
 * 
 * @param span - Span to add attributes to
 * @param attributes - Attributes to add
 */
export function addSpanAttributes(
    span: Span,
    attributes: Record<string, string | number | boolean | null | undefined>
): void {
    for (const [key, value] of Object.entries(attributes)) {
        if (value !== null && value !== undefined) {
            span.setAttribute(key, value);
        }
    }
}

/**
 * Record an exception in a span
 * 
 * @param span - Span to record exception in
 * @param error - Error to record
 */
export function recordException(span: Span, error: unknown): void {
    if (error instanceof Error) {
        span.recordException(error);
    } else {
        span.recordException({
            name: 'UnknownError',
            message: String(error),
        });
    }
}

/**
 * Set span status
 * 
 * @param span - Span to set status on
 * @param success - Whether the operation was successful
 * @param message - Optional status message
 */
export function setSpanStatus(span: Span, success: boolean, message?: string): void {
    if (success) {
        span.setStatus({ code: SpanStatusCode.OK });
    } else {
        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: message || 'Operation failed',
        });
    }
}

/**
 * Get the current active span
 * 
 * @returns Current active span or undefined
 */
export function getCurrentSpan(): Span | undefined {
    return trace.getSpan(context.active());
}

/**
 * Add event to current span
 * 
 * @param name - Event name
 * @param attributes - Event attributes
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    const span = getCurrentSpan();
    if (span) {
        span.addEvent(name, attributes);
    }
}
