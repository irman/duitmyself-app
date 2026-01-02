import { SeverityNumber } from '@opentelemetry/api-logs';

/**
 * Convert Pino log level to OpenTelemetry SeverityNumber
 */
function pinoLevelToSeverity(level: number): SeverityNumber {
    if (level >= 60) return SeverityNumber.FATAL; // fatal
    if (level >= 50) return SeverityNumber.ERROR; // error
    if (level >= 40) return SeverityNumber.WARN; // warn
    if (level >= 30) return SeverityNumber.INFO; // info
    if (level >= 20) return SeverityNumber.DEBUG; // debug
    return SeverityNumber.TRACE; // trace
}

/**
 * Convert Pino log to OTLP JSON format
 */
export function pinoToOTLP(log: any) {
    const timeUnixNano = log.time ? String(log.time * 1000000) : String(Date.now() * 1000000);

    return {
        resourceLogs: [{
            resource: {
                attributes: [
                    { key: 'service.name', value: { stringValue: process.env.OTEL_SERVICE_NAME || 'duitmyself-app' } },
                    { key: 'service.version', value: { stringValue: process.env.npm_package_version || '1.0.0' } },
                ],
            },
            scopeLogs: [{
                scope: {
                    name: 'pino',
                    version: '1.0.0',
                },
                logRecords: [{
                    timeUnixNano,
                    severityNumber: pinoLevelToSeverity(log.level),
                    severityText: log.level >= 60 ? 'FATAL' :
                        log.level >= 50 ? 'ERROR' :
                            log.level >= 40 ? 'WARN' :
                                log.level >= 30 ? 'INFO' :
                                    log.level >= 20 ? 'DEBUG' : 'TRACE',
                    body: { stringValue: log.msg || '' },
                    attributes: [
                        ...Object.entries(log)
                            .filter(([key]) => !['time', 'level', 'msg', 'pid', 'hostname'].includes(key))
                            .map(([key, value]) => ({
                                key,
                                value: { stringValue: typeof value === 'string' ? value : JSON.stringify(value) },
                            })),
                        // Add trace context if present
                        ...(log.trace_id ? [{ key: 'trace_id', value: { stringValue: log.trace_id } }] : []),
                        ...(log.span_id ? [{ key: 'span_id', value: { stringValue: log.span_id } }] : []),
                    ],
                    traceId: log.trace_id || '',
                    spanId: log.span_id || '',
                }],
            }],
        }],
    };
}
