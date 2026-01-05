import type { CreditCard, ExistingStatement } from '../../types';

/**
 * Notion Adapter Interface
 * 
 * Handles all interactions with Notion API for credit cards and statements
 */
export interface NotionAdapter {
    /**
     * Fetch all credit cards from Notion database
     * 
     * @returns Array of credit cards
     * @throws {Error} If API call fails
     */
    getCreditCards(): Promise<CreditCard[]>;

    /**
     * Fetch existing statements from a specific date onwards
     * Used for duplicate detection
     * 
     * @param fromDate - ISO date string (YYYY-MM-DD)
     * @returns Array of existing statements
     * @throws {Error} If API call fails
     */
    getExistingStatements(fromDate: string): Promise<ExistingStatement[]>;

    /**
     * Create a new statement in Notion
     * 
     * @param statement - Statement data
     * @returns Created statement page ID
     * @throws {Error} If API call fails
     */
    createStatement(statement: {
        cardId: string;
        cardName: string;
        statementDate: string;
        dueDate: string;
        monthYear: string;
    }): Promise<string>;

    /**
     * Validate API credentials
     * 
     * @returns True if credentials are valid
     */
    validateCredentials(): Promise<boolean>;
}
