import type { AIAdapter } from './adapters/ai/ai.interface';
import type { BudgetAdapter } from './adapters/budget/budget.interface';
import type { GeocodingAdapter } from './adapters/geocoding/geocoding.interface';
import type {
    WebhookPayload,
    Transaction,
    TransactionResult,
} from '@/shared/types/common.types';
import type { WideEvent } from '@/shared/types/wide-event.types';
import { validateCoordinates } from '@/shared/utils/validators';
import { logger } from '@/shared/utils/logger';
import { getAccountId, isAllowedApp, config } from '@/shared/config/config';
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
 * 
 * Uses wide events pattern for logging - enriches a single event throughout
 * the pipeline instead of emitting multiple log statements.
 */
export class TransactionProcessor {
    constructor(
        public aiAdapter: AIAdapter,
        public budgetAdapter: BudgetAdapter,
        private geocodingAdapter: GeocodingAdapter
    ) { }

    /**
     * Calculate distance between two GPS coordinates using Haversine formula
     * @returns Distance in kilometers
     */
    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Process a webhook payload and create a transaction
     * 
     * @param payload - Webhook payload from MacroDroid
     * @param wideEvent - Optional wide event to enrich with processing context
     * @returns Transaction result
     */
    async processTransaction(payload: WebhookPayload, wideEvent?: WideEvent): Promise<TransactionResult> {
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

                // === STEP 1: Filter - Check if app is allowed ===
                const filterSpan = tracer.startSpan('transaction.filter', {
                    attributes: {
                        'filter.app_name': payload.app_name,
                    },
                });

                const isAllowed = isAllowedApp(payload.app_name);

                // Enrich wide event with app context
                if (wideEvent) {
                    wideEvent.app = {
                        name: payload.app_name,
                        allowed: isAllowed,
                    };
                }

                addSpanAttributes(filterSpan, {
                    'filter.result': isAllowed,
                });
                filterSpan.end();

                if (!isAllowed) {
                    const errorMsg = `App '${payload.app_name}' is not in the allowed list`;
                    if (wideEvent) {
                        wideEvent.outcome = 'rejected';
                        wideEvent.error = {
                            type: 'FilterError',
                            message: errorMsg,
                            retriable: false,
                            step: 'filter',
                        };
                    }
                    setSpanStatus(span, false, errorMsg);
                    span.end();
                    return {
                        success: false,
                        error: errorMsg,
                    };
                }

                // === STEP 2: AI Extraction - Parse notification text ===
                const aiSpan = tracer.startSpan('transaction.ai_extract', {
                    attributes: {
                        'ai.notification_text': payload.notification_text,
                    },
                });

                const aiStart = Date.now();
                const extracted = await this.aiAdapter.extractTransactionData(
                    payload.notification_text
                );
                const aiDuration = Date.now() - aiStart;

                // Enrich wide event with AI extraction context
                if (wideEvent) {
                    wideEvent.ai = {
                        is_transaction: extracted.is_transaction,
                        extraction_time_ms: aiDuration,
                        model: 'gemini-2.0-flash-exp',
                    };
                    if (extracted.confidence !== undefined) {
                        wideEvent.ai.confidence = extracted.confidence;
                    }
                }

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
                    const errorMsg = 'Not a financial transaction';
                    if (wideEvent) {
                        wideEvent.outcome = 'rejected';
                        wideEvent.error = {
                            type: 'NotTransactionError',
                            message: errorMsg,
                            retriable: false,
                            step: 'ai_extraction',
                        };
                    }
                    setSpanStatus(span, false, errorMsg);
                    span.end();
                    return {
                        success: false,
                        error: errorMsg,
                    };
                }

                const MIN_CONFIDENCE = 0.4;
                if (extracted.confidence && extracted.confidence < MIN_CONFIDENCE) {
                    const errorMsg = `Low confidence: ${extracted.confidence}`;
                    if (wideEvent) {
                        wideEvent.outcome = 'rejected';
                        wideEvent.error = {
                            type: 'LowConfidenceError',
                            message: errorMsg,
                            retriable: false,
                            step: 'ai_extraction',
                        };
                    }
                    setSpanStatus(span, false, errorMsg);
                    span.end();
                    return {
                        success: false,
                        error: errorMsg,
                    };
                }

                // Enrich wide event with transaction details
                if (wideEvent) {
                    wideEvent.transaction = {
                        date: payload.timestamp,
                    };
                    if (extracted.amount !== undefined) wideEvent.transaction.amount = extracted.amount;
                    if (extracted.merchant !== undefined) wideEvent.transaction.merchant = extracted.merchant;
                    if (extracted.category !== undefined) wideEvent.transaction.category = extracted.category;
                    if (extracted.currency !== undefined) wideEvent.transaction.currency = extracted.currency;
                    if (extracted.type !== undefined) wideEvent.transaction.type = extracted.type;
                }

                // === STEP 3: Account Mapping - Resolve account ID ===
                const accountSpan = tracer.startSpan('transaction.account_mapping', {
                    attributes: {
                        'account.app_name': payload.app_name,
                    },
                });

                const accountId = getAccountId(payload.app_name);

                if (!accountId) {
                    const errorMsg = `No account mapping found for app '${payload.app_name}'`;
                    if (wideEvent) {
                        wideEvent.outcome = 'error';
                        wideEvent.error = {
                            type: 'AccountMappingError',
                            message: errorMsg,
                            retriable: false,
                            step: 'account_mapping',
                        };
                    }
                    logger.error({ event: 'account.mapping.missing', appName: payload.app_name }, errorMsg);

                    setSpanStatus(accountSpan, false, errorMsg);
                    accountSpan.end();
                    setSpanStatus(span, false, errorMsg);
                    span.end();
                    return {
                        success: false,
                        error: errorMsg,
                    };
                }

                // Update wide event with account ID
                if (wideEvent && wideEvent.app) {
                    wideEvent.app.account_id = accountId;
                }

                addSpanAttributes(accountSpan, {
                    'account.id': accountId,
                });
                accountSpan.end();

                // === STEP 4: Location Enrichment (optional) ===
                let locationNote = '';
                if (payload.latitude && payload.longitude) {
                    const locationSpan = tracer.startSpan('transaction.location_enrichment', {
                        attributes: {
                            'location.latitude': payload.latitude,
                            'location.longitude': payload.longitude,
                        },
                    });

                    const locationStart = Date.now();
                    try {
                        const coords = validateCoordinates(payload.latitude, payload.longitude);
                        const location = await this.geocodingAdapter.reverseGeocode(
                            coords.latitude,
                            coords.longitude
                        );
                        locationNote = `\nLocation: ${location}`;

                        // Enrich wide event with location
                        if (wideEvent) {
                            wideEvent.location = {
                                latitude: Number(payload.latitude),
                                longitude: Number(payload.longitude),
                                address: location,
                                lookup_success: true,
                                lookup_time_ms: Date.now() - locationStart,
                            };
                        }

                        addSpanAttributes(locationSpan, {
                            'location.address': location,
                        });
                        setSpanStatus(locationSpan, true);
                    } catch (error) {
                        // Enrich wide event with failed location lookup
                        if (wideEvent) {
                            wideEvent.location = {
                                latitude: Number(payload.latitude),
                                longitude: Number(payload.longitude),
                                lookup_success: false,
                                lookup_time_ms: Date.now() - locationStart,
                            };
                        }

                        logger.warn({
                            event: 'location.enrichment.failed',
                            error,
                        }, 'Failed to enrich with location, continuing without it');

                        setSpanStatus(locationSpan, false, 'Failed to enrich location');
                    } finally {
                        locationSpan.end();
                    }
                }

                // === STEP 5: Build Transaction ===
                const transaction: Transaction = {
                    date: payload.timestamp,
                    amount: extracted.amount!, // Non-null: verified is_transaction is true
                    payee: extracted.merchant!, // Non-null: verified is_transaction is true
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

                // === STEP 6: Budget Sync - Create transaction ===
                const budgetSpan = tracer.startSpan('transaction.budget_sync', {
                    attributes: {
                        'budget.amount': transaction.amount,
                        'budget.merchant': transaction.payee,
                        'budget.account_id': transaction.account_id,
                    },
                });

                const budgetStart = Date.now();
                const result = await this.budgetAdapter.createTransaction(transaction);
                const budgetDuration = Date.now() - budgetStart;

                // Enrich wide event with external API call metadata
                if (wideEvent) {
                    wideEvent.external_apis = {
                        gemini: {
                            latency_ms: aiDuration,
                            success: true,
                            retry_count: 0, // TODO: Get from adapter
                        },
                        lunch_money: {
                            latency_ms: budgetDuration,
                            success: result.success,
                            retry_count: 0, // TODO: Get from adapter
                        },
                    };

                    // Update transaction ID in wide event
                    if (wideEvent.transaction && result.transactionId) {
                        wideEvent.transaction.id = result.transactionId;
                    }
                }

                addSpanAttributes(budgetSpan, {
                    'budget.transaction_id': result.transactionId || 'unknown',
                    'budget.success': result.success,
                });
                setSpanStatus(budgetSpan, result.success);
                budgetSpan.end();

                // Calculate final processing time
                const processingTime = (performance.now() - startTime) / 1000; // Convert to seconds

                // Mark main span as successful
                addSpanAttributes(span, {
                    'transaction.id': result.transactionId || 'unknown',
                    'transaction.processing_time_ms': processingTime * 1000,
                });
                setSpanStatus(span, true);
                span.end();

                return result;
            } catch (error) {
                // Enrich wide event with error
                if (wideEvent) {
                    wideEvent.outcome = 'error';
                    if (error instanceof Error) {
                        wideEvent.error = {
                            type: error.name,
                            message: error.message,
                            retriable: false,
                            step: 'unknown',
                        };
                        if (error.stack !== undefined) {
                            wideEvent.error.stack = error.stack;
                        }
                    }
                }

                logger.error({
                    event: 'transaction.processing.error',
                    error,
                    appName: payload.app_name,
                    notificationText: payload.notification_text,
                }, 'Transaction processing failed');

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
     * Process a screenshot webhook payload and create a transaction
     * 
     * @param payload - Screenshot webhook payload from MacroDroid
     * @param wideEvent - Optional wide event to enrich with processing context
     * @returns Transaction result
     */
    async processScreenshotTransaction(
        payload: import('@/shared/types/common.types').ScreenshotWebhookPayload,
        wideEvent?: WideEvent
    ): Promise<TransactionResult> {
        const startTime = performance.now();

        // Start main processing span
        const span = tracer.startSpan('transaction.process.screenshot');

        return await context.with(trace.setSpan(context.active(), span), async () => {
            try {
                // Add payload metadata to span
                addSpanAttributes(span, {
                    'transaction.app_package_name': payload.app_package_name,
                    'transaction.timestamp': payload.timestamp,
                    'transaction.has_gps': !!(payload.latitude && payload.longitude),
                    'transaction.has_metadata': !!payload.metadata,
                });

                // === STEP 1: Filter - Check if app package is allowed ===
                const filterSpan = tracer.startSpan('transaction.filter', {
                    attributes: {
                        'filter.app_package_name': payload.app_package_name,
                    },
                });

                const isAllowed = isAllowedApp(payload.app_package_name);

                // Enrich wide event with app context
                if (wideEvent) {
                    wideEvent.app = {
                        name: payload.app_package_name,
                        allowed: isAllowed,
                    };
                }

                addSpanAttributes(filterSpan, {
                    'filter.result': isAllowed,
                });
                filterSpan.end();

                if (!isAllowed) {
                    const errorMsg = `App '${payload.app_package_name}' is not in the allowed list`;
                    if (wideEvent) {
                        wideEvent.outcome = 'rejected';
                        wideEvent.error = {
                            type: 'FilterError',
                            message: errorMsg,
                            retriable: false,
                            step: 'filter',
                        };
                    }
                    setSpanStatus(span, false, errorMsg);
                    span.end();
                    return {
                        success: false,
                        error: errorMsg,
                    };
                }

                // === STEP 2: AI Extraction - Analyze screenshot ===
                const aiSpan = tracer.startSpan('transaction.ai_extract_image', {
                    attributes: {
                        'ai.app_package_name': payload.app_package_name,
                        'ai.has_location': !!(payload.latitude && payload.longitude),
                    },
                });

                const aiStart = Date.now();
                const locationData = (payload.latitude && payload.longitude) ? {
                    latitude: parseFloat(payload.latitude),
                    longitude: parseFloat(payload.longitude),
                } : undefined;

                // Prepare available accounts for AI to help identify unknown apps
                const availableAccounts = Object.entries(config.accountMapping).map(([packageName, accountId]) => ({
                    packageName,
                    accountId: String(accountId),
                }));

                const extracted = await this.aiAdapter.extractTransactionDataFromImage(
                    payload.image_base64,
                    {
                        appPackageName: payload.app_package_name,
                        location: locationData,
                        timestamp: payload.timestamp,
                        userPayee: payload.user_input?.payee,
                        userRemarks: payload.user_input?.remarks,
                        availableAccounts,
                    }
                );
                const aiDuration = Date.now() - aiStart;

                // Enrich wide event with AI extraction context
                if (wideEvent) {
                    wideEvent.ai = {
                        is_transaction: extracted.is_transaction,
                        extraction_time_ms: aiDuration,
                        model: 'gemini-2.5-flash-lite',
                    };
                    if (extracted.confidence !== undefined) {
                        wideEvent.ai.confidence = extracted.confidence;
                    }
                }

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
                    const errorMsg = 'Not a financial transaction';
                    if (wideEvent) {
                        wideEvent.outcome = 'rejected';
                        wideEvent.error = {
                            type: 'NotTransactionError',
                            message: errorMsg,
                            retriable: false,
                            step: 'ai_extraction',
                        };
                    }
                    setSpanStatus(span, false, errorMsg);
                    span.end();
                    return {
                        success: false,
                        error: errorMsg,
                    };
                }

                const MIN_CONFIDENCE = 0.4;
                if (extracted.confidence && extracted.confidence < MIN_CONFIDENCE) {
                    const errorMsg = `Low confidence: ${extracted.confidence}`;
                    if (wideEvent) {
                        wideEvent.outcome = 'rejected';
                        wideEvent.error = {
                            type: 'LowConfidenceError',
                            message: errorMsg,
                            retriable: false,
                            step: 'ai_extraction',
                        };
                    }
                    setSpanStatus(span, false, errorMsg);
                    span.end();
                    return {
                        success: false,
                        error: errorMsg,
                    };
                }

                // Enrich wide event with transaction details
                if (wideEvent) {
                    wideEvent.transaction = {
                        date: payload.timestamp,
                    };
                    if (extracted.amount !== undefined) wideEvent.transaction.amount = extracted.amount;
                    if (extracted.merchant !== undefined) wideEvent.transaction.merchant = extracted.merchant;
                    if (extracted.category !== undefined) wideEvent.transaction.category = extracted.category;
                    if (extracted.currency !== undefined) wideEvent.transaction.currency = extracted.currency;
                    if (extracted.type !== undefined) wideEvent.transaction.type = extracted.type;
                }

                // === STEP 3: Account Mapping - Resolve account ID ===
                const accountSpan = tracer.startSpan('transaction.account_mapping', {
                    attributes: {
                        'account.app_package_name': payload.app_package_name,
                    },
                });

                const accountId = getAccountId(payload.app_package_name);

                if (!accountId) {
                    const errorMsg = `No account mapping found for app '${payload.app_package_name}'`;
                    if (wideEvent) {
                        wideEvent.outcome = 'error';
                        wideEvent.error = {
                            type: 'AccountMappingError',
                            message: errorMsg,
                            retriable: false,
                            step: 'account_mapping',
                        };
                    }
                    logger.error({ event: 'account.mapping.missing', appPackageName: payload.app_package_name }, errorMsg);

                    setSpanStatus(accountSpan, false, errorMsg);
                    accountSpan.end();
                    setSpanStatus(span, false, errorMsg);
                    span.end();
                    return {
                        success: false,
                        error: errorMsg,
                    };
                }

                // Update wide event with account ID
                if (wideEvent && wideEvent.app) {
                    wideEvent.app.account_id = accountId;
                }

                addSpanAttributes(accountSpan, {
                    'account.id': accountId,
                });
                accountSpan.end();

                // === STEP 4: Location Enrichment (optional) ===
                let locationNote = '';
                if (payload.latitude && payload.longitude) {
                    const locationSpan = tracer.startSpan('transaction.location_enrichment', {
                        attributes: {
                            'location.latitude': payload.latitude,
                            'location.longitude': payload.longitude,
                        },
                    });

                    const locationStart = Date.now();
                    try {
                        const coords = validateCoordinates(payload.latitude, payload.longitude);
                        const location = await this.geocodingAdapter.reverseGeocode(
                            coords.latitude,
                            coords.longitude
                        );
                        locationNote = `\nLocation: ${location}`;

                        // Enrich wide event with location
                        if (wideEvent) {
                            wideEvent.location = {
                                latitude: Number(payload.latitude),
                                longitude: Number(payload.longitude),
                                address: location,
                                lookup_success: true,
                                lookup_time_ms: Date.now() - locationStart,
                            };
                        }

                        addSpanAttributes(locationSpan, {
                            'location.address': location,
                        });
                        setSpanStatus(locationSpan, true);
                    } catch (error) {
                        // Enrich wide event with failed location lookup
                        if (wideEvent) {
                            wideEvent.location = {
                                latitude: Number(payload.latitude),
                                longitude: Number(payload.longitude),
                                lookup_success: false,
                                lookup_time_ms: Date.now() - locationStart,
                            };
                        }

                        logger.warn({
                            event: 'location.enrichment.failed',
                            error,
                        }, 'Failed to enrich with location, continuing without it');

                        setSpanStatus(locationSpan, false, 'Failed to enrich location');
                    } finally {
                        locationSpan.end();
                    }
                }

                // === STEP 5: Build Transaction ===
                // Use extracted transaction date if available, otherwise fall back to metadata timestamp
                const transactionDate = extracted.transaction_date || payload.timestamp;

                // Home location detection
                const HOME_LAT = 3.182298;
                const HOME_LON = 101.6750803;
                const HOME_RADIUS_KM = 0.1; // 100 meters

                let finalLocationNote: string | null = null;
                if (payload.latitude && payload.longitude) {
                    const lat = parseFloat(payload.latitude);
                    const lon = parseFloat(payload.longitude);

                    // Calculate distance using Haversine formula
                    const distance = this.calculateDistance(lat, lon, HOME_LAT, HOME_LON);

                    if (distance <= HOME_RADIUS_KM) {
                        finalLocationNote = '📌 Home';
                    } else if (locationNote) {
                        // Use geocoded location name with coordinates
                        finalLocationNote = `📍 ${locationNote} (${lat}, ${lon})`;
                    } else {
                        // Fallback to coordinates only
                        finalLocationNote = `📌 ${lat}, ${lon}`;
                    }
                }

                const transaction: Transaction = {
                    date: transactionDate,
                    amount: extracted.amount!, // Non-null: verified is_transaction is true
                    payee: extracted.merchant!, // AI-normalized payee
                    account_id: accountId,
                    category: extracted.category,
                    notes: [
                        extracted.notes,
                        extracted.reference ? `Ref: ${extracted.reference}` : null,
                        payload.user_input?.remarks ? `💬 ${payload.user_input.remarks}` : null,
                        finalLocationNote,
                    ].filter(Boolean).join(' | '),
                    status: 'uncleared',
                    currency: extracted.currency?.toLowerCase() || 'myr',
                    tags: [payload.app_package_name],
                };

                // === STEP 6: Budget Sync - Create transaction ===
                const budgetSpan = tracer.startSpan('transaction.budget_sync', {
                    attributes: {
                        'budget.amount': transaction.amount,
                        'budget.merchant': transaction.payee,
                        'budget.account_id': transaction.account_id,
                    },
                });

                const budgetStart = Date.now();
                const result = await this.budgetAdapter.createTransaction(transaction);
                const budgetDuration = Date.now() - budgetStart;

                // === STEP 7: Split Transaction (if requested) ===
                if (payload.user_input?.split === true && result.success && result.transactionId) {
                    try {
                        logger.info({
                            event: 'transaction.split.request',
                            transactionId: result.transactionId,
                            amount: transaction.amount,
                        }, 'Splitting transaction 50/50');

                        await this.budgetAdapter.splitTransaction(
                            parseInt(result.transactionId),
                            transaction.amount
                        );

                        logger.info({
                            event: 'transaction.split.success',
                            transactionId: result.transactionId,
                        }, 'Transaction split successfully');
                    } catch (error) {
                        // Log error but don't fail the entire transaction
                        logger.error({
                            event: 'transaction.split.failed',
                            transactionId: result.transactionId,
                            error: error instanceof Error ? error.message : 'Unknown error',
                        }, 'Failed to split transaction');
                    }
                }

                // Enrich wide event with external API call metadata
                if (wideEvent) {
                    wideEvent.external_apis = {
                        gemini: {
                            latency_ms: aiDuration,
                            success: true,
                            retry_count: 0,
                        },
                        lunch_money: {
                            latency_ms: budgetDuration,
                            success: result.success,
                            retry_count: 0,
                        },
                    };

                    // Update transaction ID in wide event
                    if (wideEvent.transaction && result.transactionId) {
                        wideEvent.transaction.id = result.transactionId;
                    }
                }

                addSpanAttributes(budgetSpan, {
                    'budget.transaction_id': result.transactionId || 'unknown',
                    'budget.success': result.success,
                });
                setSpanStatus(budgetSpan, result.success);
                budgetSpan.end();

                // Calculate final processing time
                const processingTime = (performance.now() - startTime) / 1000; // Convert to seconds

                // Mark main span as successful
                addSpanAttributes(span, {
                    'transaction.id': result.transactionId || 'unknown',
                    'transaction.processing_time_ms': processingTime * 1000,
                });
                setSpanStatus(span, true);
                span.end();

                return result;
            } catch (error) {
                // Enrich wide event with error
                if (wideEvent) {
                    wideEvent.outcome = 'error';
                    if (error instanceof Error) {
                        wideEvent.error = {
                            type: error.name,
                            message: error.message,
                            retriable: false,
                            step: 'unknown',
                        };
                        if (error.stack !== undefined) {
                            wideEvent.error.stack = error.stack;
                        }
                    }
                }

                logger.error({
                    event: 'transaction.processing.error',
                    error,
                    appPackageName: payload.app_package_name,
                    trace_id: span.spanContext().traceId,
                    span_id: span.spanContext().spanId,
                }, 'Screenshot transaction processing failed');

                // Mark span as failed and record exception
                setSpanStatus(span, false, error instanceof Error ? error.message : 'Unknown error');
                if (error instanceof Error) {
                    span.recordException(error);
                    // Add error details as span attributes for better visibility
                    addSpanAttributes(span, {
                        'error.type': error.name,
                        'error.message': error.message,
                        'error.stack': error.stack || 'No stack trace',
                    });
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
