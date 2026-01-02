import type { AIAdapter } from './adapters/ai/ai.interface';
import type { BudgetAdapter } from './adapters/budget/budget.interface';
import type { GeocodingAdapter } from './adapters/geocoding/geocoding.interface';
import type {
    WebhookPayload,
    Transaction,
    TransactionResult,
} from '@/shared/types/common.types';
import { validateCoordinates } from '@/shared/utils/validators';
import {
    logger,
    logWebhookReceived,
    logFilterResult,
    logTransactionProcessed,
    logError,
} from '@/shared/utils/logger';
import { getAccountId, isAllowedApp } from '@/shared/config/config';
import { tracer } from '@/shared/utils/tracing';
import { addSpanAttributes, setSpanStatus } from '@/shared/utils/tracing-utils';
import { trace, context } from '@opentelemetry/api';

/**
 * Transaction Processor Service
 * 
 * Orchestrates the transaction processing pipeline:
 * 1. Filter - Check if app is allowed
 * 2. AI Extraction - Parse notification text
 * 3. Account Mapping - Resolve budget platform account ID
 * 4. Location Enrichment - Convert GPS to address (optional)
 * 5. Budget Sync - Create transaction in budget platform
 */
export class TransactionProcessor {
    constructor(
        private aiAdapter: AIAdapter,
        private budgetAdapter: BudgetAdapter,
        private geocodingAdapter: GeocodingAdapter
    ) { }

    /**
     * Process a webhook payload and create a transaction
     * 
     * @param payload - Webhook payload from MacroDroid
     * @returns Transaction result
     */
    async processTransaction(payload: WebhookPayload): Promise<TransactionResult> {
        const startTime = performance.now();

        // Start main processing span
        const span = tracer.startSpan('transaction.process');

        return await context.with(trace.setSpan(context.active(), span), async () => {
            try {
                // Add payload metadata to span
                addSpanAttributes(span, {
                    'transaction.app_name': payload.app_name,
                    'transaction.timestamp': payload.timestamp,
                    'transaction.has_gps': !!(payload.latitude && payload.longitude),
                });

                // Log webhook received
                logWebhookReceived({
                    appName: payload.app_name,
                    timestamp: payload.timestamp,
                    hasGPS: !!(payload.latitude && payload.longitude),
                });

                // Step 1: Filter - Check if app is allowed
                const filterSpan = tracer.startSpan('transaction.filter', {
                    attributes: {
                        'filter.app_name': payload.app_name,
                    },
                });

                const isAllowed = this.filterByApp(payload.app_name);
                addSpanAttributes(filterSpan, {
                    'filter.result': isAllowed,
                });
                filterSpan.end();

                if (!isAllowed) {
                    setSpanStatus(span, false, `App '${payload.app_name}' is not in the allowed list`);
                    span.end();
                    return {
                        success: false,
                        error: `App '${payload.app_name}' is not in the allowed list`,
                    };
                }

                // Step 2: AI Extraction - Parse notification text
                const aiSpan = tracer.startSpan('transaction.ai_extract', {
                    attributes: {
                        'ai.notification_text': payload.notification_text,
                    },
                });

                const extracted = await this.aiAdapter.extractTransactionData(
                    payload.notification_text
                );

                addSpanAttributes(aiSpan, {
                    'ai.is_transaction': extracted.is_transaction,
                    'ai.confidence': extracted.confidence || 0,
                    'ai.amount': extracted.amount,
                    'ai.merchant': extracted.merchant,
                    'ai.category': extracted.category || 'unknown',
                });
                aiSpan.end();

                // Step 2.5: Confidence Filter - Only process actual transactions
                if (!extracted.is_transaction) {
                    logger.info({
                        event: 'filter.not_transaction',
                        appName: payload.app_name,
                        confidence: extracted.confidence,
                    }, 'Notification is not a transaction, skipping');

                    setSpanStatus(span, false, 'Not a financial transaction');
                    span.end();
                    return {
                        success: false,
                        error: 'Not a financial transaction',
                    };
                }

                const MIN_CONFIDENCE = 0.4;
                if (extracted.confidence && extracted.confidence < MIN_CONFIDENCE) {
                    logger.warn({
                        event: 'filter.low_confidence',
                        appName: payload.app_name,
                        confidence: extracted.confidence,
                        threshold: MIN_CONFIDENCE,
                    }, 'Transaction confidence too low, skipping');

                    setSpanStatus(span, false, `Low confidence: ${extracted.confidence}`);
                    span.end();
                    return {
                        success: false,
                        error: `Low confidence: ${extracted.confidence}`,
                    };
                }

                // Step 3: Account Mapping - Resolve account ID
                const accountSpan = tracer.startSpan('transaction.account_mapping', {
                    attributes: {
                        'account.app_name': payload.app_name,
                    },
                });

                const accountId = getAccountId(payload.app_name);
                if (!accountId) {
                    const error = `No account mapping found for app '${payload.app_name}'`;
                    logger.error({ event: 'account.mapping.missing', appName: payload.app_name }, error);

                    setSpanStatus(accountSpan, false, error);
                    accountSpan.end();
                    setSpanStatus(span, false, error);
                    span.end();
                    return {
                        success: false,
                        error,
                    };
                }

                addSpanAttributes(accountSpan, {
                    'account.id': accountId,
                });
                accountSpan.end();

                // Step 4: Location Enrichment (optional)
                let locationNote = '';
                if (payload.latitude && payload.longitude) {
                    const locationSpan = tracer.startSpan('transaction.location_enrichment', {
                        attributes: {
                            'location.latitude': payload.latitude,
                            'location.longitude': payload.longitude,
                        },
                    });

                    try {
                        const coords = validateCoordinates(payload.latitude, payload.longitude);
                        const location = await this.geocodingAdapter.reverseGeocode(
                            coords.latitude,
                            coords.longitude
                        );
                        locationNote = `\nLocation: ${location}`;

                        addSpanAttributes(locationSpan, {
                            'location.address': location,
                        });
                        setSpanStatus(locationSpan, true);
                    } catch (error) {
                        // Non-critical failure - continue without location
                        logger.warn({
                            event: 'location.enrichment.failed',
                            error,
                        }, 'Failed to enrich with location, continuing without it');

                        setSpanStatus(locationSpan, false, 'Failed to enrich location');
                    } finally {
                        locationSpan.end();
                    }
                }

                // Step 5: Build transaction
                const transaction: Transaction = {
                    date: payload.timestamp,
                    amount: extracted.amount,
                    payee: extracted.merchant,
                    account_id: accountId,
                    category: extracted.category,
                    notes: [
                        extracted.notes || payload.notification_text,
                        extracted.reference ? `Ref: ${extracted.reference}` : null,
                        locationNote ? `📍 ${locationNote}` : null,
                        (payload.latitude && payload.longitude) ? `📌 ${payload.latitude}, ${payload.longitude}` : null,
                    ].filter(Boolean).join(' | '),
                    status: 'uncleared',
                    currency: extracted.currency?.toLowerCase() || 'myr',
                };

                // Step 6: Budget Sync - Create transaction
                const budgetSpan = tracer.startSpan('transaction.budget_sync', {
                    attributes: {
                        'budget.amount': transaction.amount,
                        'budget.merchant': transaction.payee,
                        'budget.account_id': transaction.account_id,
                    },
                });

                const result = await this.budgetAdapter.createTransaction(transaction);

                addSpanAttributes(budgetSpan, {
                    'budget.transaction_id': result.transactionId || 'unknown',
                    'budget.success': result.success,
                });
                setSpanStatus(budgetSpan, result.success);
                budgetSpan.end();

                // Log success
                const processingTime = (performance.now() - startTime) / 1000; // Convert to seconds
                logTransactionProcessed({
                    transactionId: result.transactionId || 'unknown',
                    merchant: extracted.merchant,
                    amount: extracted.amount,
                    processingTime,
                });

                // Mark main span as successful
                addSpanAttributes(span, {
                    'transaction.id': result.transactionId || 'unknown',
                    'transaction.processing_time_ms': processingTime * 1000,
                });
                setSpanStatus(span, true);
                span.end();

                return result;
            } catch (error) {
                logError(error instanceof Error ? error : new Error('Unknown error'), {
                    appName: payload.app_name,
                    notificationText: payload.notification_text,
                });

                // Mark span as failed
                setSpanStatus(span, false, error instanceof Error ? error.message : 'Unknown error');
                if (error instanceof Error) {
                    span.recordException(error);
                }
                span.end();

                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error occurred',
                };
            }
        });
    }

    /**
     * Filter notifications by app name
     * 
     * @param appName - Banking app name
     * @returns True if app is allowed
     */
    private filterByApp(appName: string): boolean {
        const passed = isAllowedApp(appName);

        logFilterResult({
            appName,
            passed,
            reason: passed ? undefined : 'App not in allowed list',
        });

        return passed;
    }

    /**
     * Validate all adapters are working
     * 
     * @returns Object with validation results for each adapter
     */
    async validateAdapters() {
        const results = {
            ai: false,
            budget: false,
            geocoding: false,
        };

        try {
            results.ai = await this.aiAdapter.validateApiKey();
        } catch (error) {
            logger.error('AI adapter validation failed', { error });
        }

        try {
            results.budget = await this.budgetAdapter.validateCredentials();
        } catch (error) {
            logger.error('Budget adapter validation failed', { error });
        }

        try {
            results.geocoding = await this.geocodingAdapter.validateApiKey();
        } catch (error) {
            logger.error('Geocoding adapter validation failed', { error });
        }

        return results;
    }
}
