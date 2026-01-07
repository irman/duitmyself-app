import ky, { type KyInstance } from 'ky';
import type { BudgetAdapter } from './budget.interface';
import { BudgetAPIError } from './budget.interface';
import type { Transaction, TransactionResult } from '@/shared/types/common.types';
import { logger, logBudgetAPICall } from '@/shared/utils/logger';

/**
 * Lunch Money API response for transaction creation
 */
interface LunchMoneyTransactionResponse {
    ids?: number[];
    error?: string;
}

/**
 * Lunch Money API response for user info
 */
interface LunchMoneyUserResponse {
    user_name?: string;
    error?: string;
}

/**
 * Lunch Money Adapter
 * 
 * Integrates with Lunch Money budgeting platform
 * API Docs: https://lunchmoney.dev/
 */
export class LunchMoneyAdapter implements BudgetAdapter {
    private client: KyInstance;

    constructor(
        apiKey: string,
        baseUrl: string,
        retryConfig: { limit: number; backoffMs: number }
    ) {
        this.client = ky.create({
            prefixUrl: baseUrl,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            retry: {
                limit: retryConfig.limit,
                methods: ['post', 'get'],
                statusCodes: [408, 429, 500, 502, 503, 504],
                backoffLimit: retryConfig.backoffMs,
            },
            hooks: {
                beforeRetry: [
                    ({ request, error, retryCount }) => {
                        logger.warn({
                            event: 'budget.api.retry',
                            url: request.url,
                            retryCount,
                            error: error?.message,
                        }, 'Retrying Lunch Money API request');
                    },
                ],
            },
        });
    }

    /**
     * Create a transaction in Lunch Money
     */
    async createTransaction(transaction: Transaction): Promise<TransactionResult> {
        try {
            // Convert our transaction format to Lunch Money format
            const lunchMoneyTransaction = {
                date: transaction.date.split('T')[0], // YYYY-MM-DD format
                amount: transaction.amount,
                payee: transaction.payee,
                asset_id: parseInt(transaction.account_id, 10),
                category_id: transaction.category ? undefined : null, // Let Lunch Money auto-categorize
                notes: transaction.notes || '',
                status: transaction.status || 'cleared',
                currency: transaction.currency || 'myr',
            };

            logger.debug({
                event: 'budget.create.request',
                transaction: lunchMoneyTransaction,
            }, 'Creating transaction in Lunch Money');

            const response = await this.client
                .post('transactions', {
                    json: {
                        transactions: [lunchMoneyTransaction],
                        apply_rules: true, // Apply Lunch Money rules for auto-categorization
                        check_for_recurring: true, // Check for recurring transactions
                        debit_as_negative: false, // We handle sign ourselves
                    },
                })
                .json<LunchMoneyTransactionResponse>();

            if (response.error) {
                throw new BudgetAPIError('Lunch Money API returned error', undefined, response);
            }

            const transactionId = response.ids?.[0]?.toString();

            logBudgetAPICall({
                action: 'create',
                success: true,
                transactionId,
                merchant: transaction.payee,
                amount: transaction.amount,
            });

            return {
                success: true,
                transactionId,
                metadata: {
                    lunchMoneyId: response.ids?.[0],
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            logBudgetAPICall({
                action: 'create',
                success: false,
                error: errorMessage,
                merchant: transaction.payee,
                amount: transaction.amount,
            });

            throw new BudgetAPIError(
                'Failed to create transaction in Lunch Money',
                undefined,
                undefined,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Validate API credentials by fetching user info
     */
    async validateCredentials(): Promise<boolean> {
        try {
            const response = await this.client.get('me').json<LunchMoneyUserResponse>();

            if (response.error) {
                logBudgetAPICall({
                    action: 'validate',
                    success: false,
                    error: response.error,
                });
                return false;
            }

            logBudgetAPICall({
                action: 'validate',
                success: true,
            });

            return true;
        } catch (error) {
            logger.warn('Lunch Money credentials validation failed', { error });
            return false;
        }
    }

    /**
     * Split a transaction 50/50 via Lunch Money API
     */
    async splitTransaction(transactionId: number, amount: number): Promise<void> {
        try {
            logger.debug({
                event: 'budget.split.request',
                transactionId,
                amount,
            }, 'Splitting transaction in Lunch Money');

            // Calculate 50/50 split amounts with proper rounding
            // Round the second split to 2 decimals, then calculate first split to absorb any remainder
            const secondSplit = Math.round((amount / 2) * 100) / 100;
            const firstSplit = Math.round((amount - secondSplit) * 100) / 100;

            const response = await this.client
                .put(`transactions/${transactionId}`, {
                    json: {
                        split: [
                            { amount: firstSplit },
                            { amount: secondSplit }
                        ]
                    },
                })
                .json<{ updated?: boolean; split?: number[]; error?: string | string[] }>();

            // Log the full response for debugging
            logger.info({
                event: 'budget.split.response',
                transactionId,
                response,
            }, 'Lunch Money split response');

            if (response.error) {
                logger.error({
                    event: 'budget.split.api_error',
                    transactionId,
                    error: response.error,
                    fullResponse: response,
                }, 'Lunch Money API returned error');
                throw new BudgetAPIError('Lunch Money API returned error', undefined, response);
            }

            logBudgetAPICall({
                action: 'split',
                success: true,
                transactionId: transactionId.toString(),
            });

            logger.info({
                event: 'budget.split.success',
                transactionId,
                splitIds: response.split,
            }, 'Transaction split successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // Log detailed error information
            logger.error({
                event: 'budget.split.exception',
                transactionId,
                error: errorMessage,
                errorType: error instanceof Error ? error.name : typeof error,
                errorDetails: error,
            }, 'Exception while splitting transaction');

            logBudgetAPICall({
                action: 'split',
                success: false,
                error: errorMessage,
                transactionId: transactionId.toString(),
            });

            throw new BudgetAPIError(
                'Failed to split transaction in Lunch Money',
                undefined,
                undefined,
                error instanceof Error ? error : undefined
            );
        }
    }
}
