import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { trace } from '@opentelemetry/api';

/**
 * OpenTelemetry Tracing Configuration
 * 
 * Initializes OpenTelemetry SDK with SigNoz OTLP exporter
 * Auto-instruments HTTP requests and provides manual tracing capabilities
 */

// Get configuration from environment
const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'duitmyself-app';
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';

// Configure OTLP exporter
const traceExporter = new OTLPTraceExporter({
    url: `${OTEL_ENDPOINT}/v1/traces`,
    headers: {},
});

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
    serviceName: SERVICE_NAME,
    traceExporter,
    instrumentations: [
        // Pino instrumentation for log-trace correlation
        new PinoInstrumentation({
            logHook: (span, record) => {
                // Inject trace context into log records
                record['trace_id'] = span.spanContext().traceId;
                record['span_id'] = span.spanContext().spanId;
                record['trace_flags'] = span.spanContext().traceFlags;
            },
        }),
        getNodeAutoInstrumentations({
            // Auto-instrument HTTP/HTTPS requests
            '@opentelemetry/instrumentation-http': {
                enabled: true,
            },
            // Disable instrumentations we don't need
            '@opentelemetry/instrumentation-fs': {
                enabled: false,
            },
            // Disable Pino from auto-instrumentations since we're adding it manually
            '@opentelemetry/instrumentation-pino': {
                enabled: false,
            },
        }),
    ],
});

// Start the SDK
sdk.start();

// Log initialization
console.log(`[OpenTelemetry] Tracing initialized for service: ${SERVICE_NAME}`);
console.log(`[OpenTelemetry] Exporting traces to: ${OTEL_ENDPOINT}`);

// Graceful shutdown
process.on('SIGTERM', () => {
    sdk
        .shutdown()
        .then(() => console.log('[OpenTelemetry] Tracing terminated'))
        .catch((error) => console.error('[OpenTelemetry] Error terminating tracing', error))
        .finally(() => process.exit(0));
});

// Export tracer for manual instrumentation
export const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
