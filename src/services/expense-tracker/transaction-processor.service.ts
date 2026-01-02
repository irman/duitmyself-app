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

        try {
            // Log webhook received
            logWebhookReceived({
                appName: payload.app_name,
                timestamp: payload.timestamp,
                hasGPS: !!(payload.latitude && payload.longitude),
            });

            // Step 1: Filter - Check if app is allowed
            if (!this.filterByApp(payload.app_name)) {
                return {
                    success: false,
                    error: `App '${payload.app_name}' is not in the allowed list`,
                };
            }

            // Step 2: AI Extraction - Parse notification text
            const extracted = await this.aiAdapter.extractTransactionData(
                payload.notification_text
            );

            // Step 2.5: Confidence Filter - Only process actual transactions
            if (!extracted.is_transaction) {
                logger.info({
                    event: 'filter.not_transaction',
                    appName: payload.app_name,
                    confidence: extracted.confidence,
                }, 'Notification is not a transaction, skipping');

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

                return {
                    success: false,
                    error: `Low confidence: ${extracted.confidence}`,
                };
            }

            // Step 3: Account Mapping - Resolve account ID
            const accountId = getAccountId(payload.app_name);
            if (!accountId) {
                const error = `No account mapping found for app '${payload.app_name}'`;
                logger.error({ event: 'account.mapping.missing', appName: payload.app_name }, error);
                return {
                    success: false,
                    error,
                };
            }

            // Step 4: Location Enrichment (optional)
            let locationNote = '';
            if (payload.latitude && payload.longitude) {
                try {
                    const coords = validateCoordinates(payload.latitude, payload.longitude);
                    const location = await this.geocodingAdapter.reverseGeocode(
                        coords.latitude,
                        coords.longitude
                    );
                    locationNote = `\nLocation: ${location}`;
                } catch (error) {
                    // Non-critical failure - continue without location
                    logger.warn({
                        event: 'location.enrichment.failed',
                        error,
                    }, 'Failed to enrich with location, continuing without it');
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
                ].filter(Boolean).join(' | '),
                status: 'cleared',
                currency: extracted.currency?.toLowerCase() || 'myr',
            };

            // Step 6: Budget Sync - Create transaction
            const result = await this.budgetAdapter.createTransaction(transaction);

            // Log success
            const processingTime = (performance.now() - startTime) / 1000; // Convert to seconds
            logTransactionProcessed({
                transactionId: result.transactionId || 'unknown',
                merchant: extracted.merchant,
                amount: extracted.amount,
                processingTime,
            });

            return result;
        } catch (error) {
            logError(error instanceof Error ? error : new Error('Unknown error'), {
                appName: payload.app_name,
                notificationText: payload.notification_text,
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
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
