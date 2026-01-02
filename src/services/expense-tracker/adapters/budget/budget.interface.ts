import type { Transaction, TransactionResult } from '@/shared/types/common.types';

/**
 * Budget Adapter Interface
 * 
 * Defines the contract for budget platform integrations
 * 
 * Implementations: Lunch Money, YNAB, Actual Budget, custom
 */
export interface BudgetAdapter {
    /**
     * Create a transaction in the budget platform
     * 
     * @param transaction - Transaction data
     * @returns Result of transaction creation
     * @throws {BudgetAPIError} If API call fails
     */
    createTransaction(transaction: Transaction): Promise<TransactionResult>;

    /**
     * Validate API credentials
     * 
     * @returns True if credentials are valid
     */
    validateCredentials(): Promise<boolean>;
}

/**
 * Budget API Error
 */
export class BudgetAPIError extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number,
        public readonly responseBody?: unknown,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'BudgetAPIError';
    }
}
