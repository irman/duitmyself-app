/**
 * Credit Card Statement Service Types
 */

/**
 * Credit card data from Notion
 */
export interface CreditCard {
    id: string;
    name: string;
    statement_day: number; // Day of month (1-31)
    due_in_days: number; // Days after statement date when payment is due
}

/**
 * Statement to be created
 */
export interface Statement {
    cardId: string;
    cardName: string;
    statementDate: string; // ISO date string (YYYY-MM-DD)
    dueDate: string; // ISO date string (YYYY-MM-DD)
    monthYear: string; // Display format (e.g., "Jan 2026")
}

/**
 * Existing statement from Notion (for duplicate detection)
 */
export interface ExistingStatement {
    cardId: string;
    statementDate: string; // ISO date string (YYYY-MM-DD)
}

/**
 * Result of statement creation job
 */
export interface StatementJobResult {
    success: boolean;
    statementsCreated: number;
    duplicatesSkipped: number;
    errors: string[];
    details: {
        created: Statement[];
        skipped: Statement[];
    };
}

/**
 * Notion credit card page properties
 */
export interface NotionCreditCardPage {
    id: string;
    properties: {
        Name?: {
            title: Array<{ plain_text: string }>;
        };
        'Statement Day'?: {
            number: number;
        };
        'Due in Days'?: {
            number: number;
        };
    };
}

/**
 * Notion statement page properties
 */
export interface NotionStatementPage {
    id: string;
    properties: {
        Card?: {
            relation: Array<{ id: string }>;
        };
        'Statement Date'?: {
            date: { start: string };
        };
    };
}
