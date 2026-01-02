/**
 * Common TypeScript types used across the duitmyself application
 */

/**
 * Supported banking apps for transaction processing
 */
export type BankingApp = 'Maybank MAE' | 'Grab' | 'TNG eWallet' | 'ShopeePay';

/**
 * Transaction type
 */
export type TransactionType = 'debit' | 'credit';

/**
 * Webhook payload from MacroDroid
 */
export interface WebhookPayload {
    /** Banking app package name (e.g., com.maybank2u.life) - used for filtering and account mapping */
    app_name: string;
    /** Notification title */
    notification_title: string;
    /** Notification text content */
    notification_text: string;
    /** ISO 8601 timestamp */
    timestamp: string;
    /** GPS latitude (optional) */
    latitude?: string | undefined;
    /** GPS longitude (optional) */
    longitude?: string | undefined;
}

/**
 * Extracted transaction data from AI
 */
export interface ExtractedTransaction {
    /** Whether this is actually a transaction (not just a notification) */
    is_transaction: boolean;
    /** Transaction amount (positive for debit, negative for credit) */
    amount: number;
    /** Merchant or payee name */
    merchant: string;
    /** Transaction type */
    type: TransactionType;
    /** Currency code (e.g., MYR, USD) */
    currency?: string | undefined;
    /** Optional category */
    category?: string | undefined;
    /** Transaction reference number */
    reference?: string | undefined;
    /** AI confidence score (0-1) */
    confidence?: number | undefined;
    /** Original notification text for notes */
    notes?: string | undefined;
}

/**
 * Complete transaction for budget platform
 */
export interface Transaction {
    /** Transaction date (ISO 8601) */
    date: string;
    /** Transaction amount */
    amount: number;
    /** Merchant/payee name */
    payee: string;
    /** Budget platform account ID */
    account_id: string;
    /** Transaction category (optional) */
    category?: string | undefined;
    /** Additional notes */
    notes?: string | undefined;
    /** Transaction status */
    status?: 'cleared' | 'uncleared' | 'pending';
    /** Currency code (default: MYR) */
    currency?: string | undefined;
}

/**
 * Result of transaction creation in budget platform
 */
export interface TransactionResult {
    /** Whether transaction was created successfully */
    success: boolean;
    /** Transaction ID from budget platform */
    transactionId?: string | undefined;
    /** Error message if failed */
    error?: string | undefined;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * GPS coordinates
 */
export interface Coordinates {
    latitude: number;
    longitude: number;
}

/**
 * Account mapping configuration
 */
export interface AccountMapping {
    [appName: string]: string; // app name -> account ID
}

/**
 * Log context for structured logging
 */
export interface LogContext {
    /** Request ID for tracing */
    requestId?: string;
    /** Transaction ID */
    transactionId?: string;
    /** Banking app name */
    appName?: string;
    /** Additional context */
    [key: string]: unknown;
}

/**
 * API adapter health status
 */
export interface AdapterHealth {
    /** Adapter name */
    name: string;
    /** Connection status */
    status: 'connected' | 'disconnected' | 'error';
    /** Last check timestamp */
    lastCheck: Date;
    /** Error message if status is error */
    error?: string;
}

/**
 * Application health check response
 */
export interface HealthCheckResponse {
    /** Overall status */
    status: 'healthy' | 'degraded' | 'unhealthy';
    /** Current timestamp */
    timestamp: string;
    /** Uptime in seconds */
    uptime: number;
    /** Adapter health statuses */
    adapters: {
        ai: 'connected' | 'disconnected' | 'error';
        budget: 'connected' | 'disconnected' | 'error';
        geocoding: 'connected' | 'disconnected' | 'error';
    };
}

/**
 * Metrics response
 */
export interface MetricsResponse {
    /** Total transactions processed */
    totalTransactions: number;
    /** Success rate (0-1) */
    successRate: number;
    /** Average processing time in seconds */
    averageProcessingTime: number;
    /** Uptime in seconds */
    uptime: number;
}
