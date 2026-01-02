/**
 * Payload transformer types
 */

/**
 * Generic payload transformer function signature
 */
export type PayloadTransformer<TInput = any, TOutput = any> = (input: TInput) => TOutput;

/**
 * Notification payload input (MacroDroid format)
 */
export interface NotificationPayloadInput {
    // MacroDroid format
    app?: string;
    title?: string;
    text?: string;

    // Standard format
    app_name?: string;
    notification_title?: string;
    notification_text?: string;

    // Common fields
    timestamp?: string;
    latitude?: string;
    longitude?: string;
}

/**
 * Notification payload output (standard format)
 */
export interface NotificationPayloadOutput {
    app_name: string;
    notification_title: string;
    notification_text: string;
    timestamp: string;
    latitude?: string;
    longitude?: string;
}

/**
 * Email payload input (placeholder for future implementation)
 */
export interface EmailPayloadInput {
    from: string;
    subject: string;
    body: string;
    timestamp?: string;
}

/**
 * Screenshot payload input (placeholder for future implementation)
 */
export interface ScreenshotPayloadInput {
    image_url: string;
    timestamp?: string;
    metadata?: Record<string, any>;
}
