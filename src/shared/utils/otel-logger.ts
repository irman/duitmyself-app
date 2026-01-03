import { trace } from '@opentelemetry/api';

// Get configuration from environment
const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'duitmyself-app';
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';

// Severity numbers per OTLP spec
const SEVERITY = {
    TRACE: 1,
    DEBUG: 5,
    INFO: 9,
    WARN: 13,
    ERROR: 17,
    FATAL: 21,
} as const;

type LogLevel = keyof typeof SEVERITY;

/**
 * Convert a value to OTLP attribute value format
 */
function toOtlpValue(value: any): any {
    if (typeof value === 'string') {
        return { stringValue: value };
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
    }
    if (typeof value === 'boolean') {
        return { boolValue: value };
    }
    if (value === null || value === undefined) {
        return { stringValue: '' };
    }
    // Arrays and objects get stringified
    return { stringValue: JSON.stringify(value) };
}

/**
 * Flatten nested objects into dot-notation keys
 * e.g., { output: { success: true, id: 123 } } becomes { 'output.success': true, 'output.id': 123 }
 */
function flattenAttributes(obj: Record<string, any>, prefix = ''): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            // Recursively flatten nested objects
            Object.assign(result, flattenAttributes(value, newKey));
        } else {
            result[newKey] = value;
        }
    }

    return result;
}

/**
 * Emit a log record directly to OTLP endpoint
 */
export function emitLog(
    level: LogLevel,
    message: string,
    attributes?: Record<string, any>
) {
    if (!OTEL_ENDPOINT) return;

    // Get current span context for correlation
    const activeSpan = trace.getActiveSpan();
    const spanContext = activeSpan?.spanContext();

    const timeUnixNano = String(Date.now() * 1_000_000);

    // Flatten nested objects into dot-notation keys
    const flatAttrs = flattenAttributes(attributes || {});

    const otlpPayload = {
        resourceLogs: [{
            resource: {
                attributes: [
                    { key: 'service.name', value: { stringValue: SERVICE_NAME } },
                    { key: 'service.version', value: { stringValue: SERVICE_VERSION } },
                ],
            },
            scopeLogs: [{
                scope: { name: 'duitmyself-logger', version: '1.0.0' },
                logRecords: [{
                    timeUnixNano,
                    severityNumber: SEVERITY[level],
                    severityText: level,
                    body: { stringValue: message },
                    attributes: Object.entries(flatAttrs).map(([key, value]) => ({
                        key,
                        value: toOtlpValue(value),
                    })),
                    traceId: spanContext?.traceId || '',
                    spanId: spanContext?.spanId || '',
                }],
            }],
        }],
    };

    // Fire and forget
    fetch(`${OTEL_ENDPOINT}/v1/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(otlpPayload),
    }).catch(err => {
        process.stderr.write(`[OTLP] Log export failed: ${err}\n`);
    });
}

// Convenience methods
export const otelLog = {
    trace: (msg: string, attrs?: Record<string, any>) => emitLog('TRACE', msg, attrs),
    debug: (msg: string, attrs?: Record<string, any>) => emitLog('DEBUG', msg, attrs),
    info: (msg: string, attrs?: Record<string, any>) => emitLog('INFO', msg, attrs),
    warn: (msg: string, attrs?: Record<string, any>) => emitLog('WARN', msg, attrs),
    error: (msg: string, attrs?: Record<string, any>) => emitLog('ERROR', msg, attrs),
    fatal: (msg: string, attrs?: Record<string, any>) => emitLog('FATAL', msg, attrs),
};

if (OTEL_ENDPOINT) {
    console.log(`[OpenTelemetry] Log export enabled to: ${OTEL_ENDPOINT}/v1/logs`);
}
