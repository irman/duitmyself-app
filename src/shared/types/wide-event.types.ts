/**
 * Wide Event Types
 * 
 * Based on the "wide events" pattern from https://loggingsucks.com/
 * 
 * A wide event is a single, context-rich log event emitted per request/job
 * that contains all relevant business and technical context in one place.
 * 
 * This enables powerful queries like:
 * - "Show me all failed transactions for Grab over RM 50"
 * - "Find low-confidence AI extractions in the last 24h"
 * - "Show me all transactions where Gemini took > 2s"
 */

/**
 * Core wide event structure
 * Emitted once per request with full context
 */
export interface WideEvent {
    // ===== Request Metadata =====
    timestamp: string;
    request_id: string;
    trace_id?: string;
    span_id?: string;
    service: string;
    version?: string;
    deployment_id?: string;
    region?: string;

    // ===== HTTP Context =====
    http?: {
        method: string;
        path: string;
        status_code?: number;
        user_agent?: string;
    };

    // ===== Job Context (for cron jobs) =====
    job?: {
        name: string;
        trigger: 'cron' | 'manual' | 'api';
        schedule?: string;
    };

    // ===== Outcome =====
    outcome: 'success' | 'error' | 'rejected';
    duration_ms: number;

    // ===== Transaction Context =====
    transaction?: {
        id?: string;
        amount?: number;
        merchant?: string;
        category?: string;
        currency?: string;
        type?: 'debit' | 'credit';
        date?: string;
        notes?: string;
    };

    // ===== App Context =====
    app?: {
        name: string;
        account_id?: string;
        allowed: boolean;
    };

    // ===== AI Extraction Context =====
    ai?: {
        confidence?: number;
        is_transaction: boolean;
        extraction_time_ms?: number;
        model?: string;
    };

    // ===== Location Context =====
    location?: {
        latitude?: number;
        longitude?: number;
        address?: string;
        lookup_success: boolean;
        lookup_time_ms?: number;
    };

    // ===== External API Calls =====
    external_apis?: {
        gemini?: {
            latency_ms: number;
            success: boolean;
            retry_count: number;
        };
        lunch_money?: {
            latency_ms: number;
            success: boolean;
            retry_count: number;
        };
        locationiq?: {
            latency_ms: number;
            success: boolean;
            retry_count: number;
        };
        notion?: {
            latency_ms: number;
            success: boolean;
            retry_count: number;
        };
        telegram?: {
            latency_ms: number;
            success: boolean;
            retry_count: number;
        };
    };

    // ===== CC Statements Context =====
    cc_statements?: {
        cards_fetched: number;
        statements_created: number;
        statements_skipped: number;
        telegram_sent: boolean;
        errors?: string[];
    };

    // ===== Error Context =====
    error?: {
        type: string;
        message: string;
        code?: string;
        retriable: boolean;
        step?: string; // Which pipeline step failed
        stack?: string;
    };

    // ===== Webhook Context =====
    webhook?: {
        payload_type: 'notification' | 'email' | 'screenshot';
        has_gps: boolean;
        notification_text?: string;
        app_package_name?: string; // For screenshot webhooks
    };

    // ===== Feature Flags (future) =====
    feature_flags?: Record<string, boolean>;
}

/**
 * Adapter metadata returned by all adapters
 * Used to enrich wide events with timing and retry info
 */
export interface AdapterMetadata {
    latency_ms: number;
    success: boolean;
    retry_count: number;
}

/**
 * Helper type for adapter responses
 */
export interface AdapterResponse<T> {
    data: T | null;
    metadata: AdapterMetadata;
}
