import pino from 'pino';
import type { LogContext } from '../types/common.types';

/**
 * Create a logger instance with appropriate configuration
 */
function createLogger() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const logLevel = process.env.LOG_LEVEL || 'info';

    const baseConfig = {
        level: logLevel,
        // Base fields for all logs
        base: {
            env: process.env.NODE_ENV,
        },
        // Timestamp format
        timestamp: pino.stdTimeFunctions.isoTime,
    };

    // Add pretty print transport only in development
    if (isDevelopment) {
        return pino({
            ...baseConfig,
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'HH:MM:ss Z',
                    ignore: 'pid,hostname',
                },
            },
        });
    }

    return pino(baseConfig);
}

/**
 * Global logger instance
 */
export const logger = createLogger();

/**
 * Create a child logger with context
 * 
 * @param context - Additional context to include in all logs
 * @returns Child logger with context
 * 
 * @example
 * const requestLogger = createContextLogger({ requestId: '123' });
 * requestLogger.info('Processing request');
 */
export function createContextLogger(context: LogContext) {
    return logger.child(context);
}

/**
 * Log webhook received
 */
export function logWebhookReceived(payload: {
    appName: string;
    timestamp: string;
    hasGPS: boolean;
}) {
    logger.info({
        event: 'webhook.received',
        appName: payload.appName,
        timestamp: payload.timestamp,
        hasGPS: payload.hasGPS,
    }, 'Webhook received');
}

/**
 * Log filter result
 */
export function logFilterResult(result: {
    appName: string;
    passed: boolean;
    reason?: string | undefined;
}) {
    if (result.passed) {
        logger.info({
            event: 'filter.passed',
            appName: result.appName,
        }, 'App filter passed');
    } else {
        logger.info({
            event: 'filter.skipped',
            appName: result.appName,
            reason: result.reason,
        }, 'App filter skipped');
    }
}

/**
 * Log AI extraction request
 */
export function logAIExtractionRequest(data: {
    notificationText: string;
    requestId?: string;
}) {
    logger.debug({
        event: 'ai.extraction.request',
        notificationText: data.notificationText,
        requestId: data.requestId,
    }, 'Sending AI extraction request');
}

/**
 * Log AI extraction response
 */
export function logAIExtractionResponse(data: {
    amount: number;
    merchant: string;
    type: string;
    category?: string | undefined;
    requestId?: string;
}) {
    logger.info({
        event: 'ai.extraction.response',
        amount: data.amount,
        merchant: data.merchant,
        type: data.type,
        category: data.category,
        requestId: data.requestId,
    }, 'AI extraction completed');
}

/**
 * Log location lookup
 */
export function logLocationLookup(data: {
    latitude: number;
    longitude: number;
    location?: string;
    error?: string;
}) {
    if (data.error) {
        logger.warn({
            event: 'location.lookup.failed',
            latitude: data.latitude,
            longitude: data.longitude,
            error: data.error,
        }, 'Location lookup failed');
    } else {
        logger.debug({
            event: 'location.lookup.success',
            latitude: data.latitude,
            longitude: data.longitude,
            location: data.location,
        }, 'Location lookup completed');
    }
}

/**
 * Log budget platform API call
 */
export function logBudgetAPICall(data: {
    action: 'create' | 'validate';
    success: boolean;
    transactionId?: string | undefined;
    error?: string | undefined;
    merchant?: string | undefined;
    amount?: number | undefined;
}) {
    if (data.success) {
        logger.info({
            event: `budget.${data.action}.success`,
            transactionId: data.transactionId,
            merchant: data.merchant,
            amount: data.amount,
        }, `Budget ${data.action} successful`);
    } else {
        logger.error({
            event: `budget.${data.action}.failed`,
            error: data.error,
            merchant: data.merchant,
            amount: data.amount,
        }, `Budget ${data.action} failed`);
    }
}

/**
 * Log transaction processing completion
 */
export function logTransactionProcessed(data: {
    transactionId: string;
    merchant: string;
    amount: number;
    processingTime: number;
}) {
    logger.info({
        event: 'transaction.processed',
        transactionId: data.transactionId,
        merchant: data.merchant,
        amount: data.amount,
        processingTime: data.processingTime,
    }, 'Transaction processed successfully');
}

/**
 * Log error with context
 */
export function logError(error: Error, context?: LogContext) {
    logger.error({
        event: 'error',
        error: {
            message: error.message,
            name: error.name,
            stack: error.stack,
        },
        ...context,
    }, error.message);
}
