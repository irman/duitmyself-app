import type { ExtractedTransaction } from '@/shared/types/common.types';

/**
 * AI Adapter Interface
 * 
 * Defines the contract for AI services that extract transaction data
 * from banking notification text.
 * 
 * Implementations: Gemini, Claude, custom models
 */
export interface AIAdapter {
    /**
     * Extract transaction data from notification text
     * 
     * @param text - Notification text from banking app
     * @returns Extracted transaction data
     * @throws {AIExtractionError} If extraction fails
     */
    extractTransactionData(text: string): Promise<ExtractedTransaction>;

    /**
     * Validate API key/credentials
     * 
     * @returns True if credentials are valid
     */
    validateApiKey(): Promise<boolean>;
}

/**
 * AI Extraction Error
 */
export class AIExtractionError extends Error {
    constructor(
        message: string,
        public readonly notificationText: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'AIExtractionError';
    }
}
