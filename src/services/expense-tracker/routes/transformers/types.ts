/**
 * Payload transformer types
 */

/**
 * Generic payload transformer function signature
 */
export type PayloadTransformer<TInput = any, TOutput = any> = (input: TInput) => TOutput;

import type { UserInput } from '@/shared/types/common.types';

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
 * Screenshot payload input (MacroDroid format)
 */
export interface ScreenshotPayloadInput {
    // Base64-encoded screenshot image
    image_base64?: string;
    image?: string; // Alternative field name

    // App identification
    app_package_name?: string;
    package_name?: string; // Alternative field name
    app_name?: string; // Fallback if package name not available

    // Location (can be comma-separated string or separate fields)
    location?: string; // e.g., "3.1390,101.6869"
    latitude?: string;
    longitude?: string;

    // Timestamp
    timestamp?: string;

    // Additional metadata
    metadata?: {
        device?: string;
        screen_title?: string;
        [key: string]: any;
    };
}

/**
 * Screenshot payload output (standard format)
 */
export interface ScreenshotPayloadOutput {
    image_base64: string;
    app_package_name: string;
    timestamp: string;
    latitude?: string;
    longitude?: string;
    metadata?: Record<string, any>;
    user_input?: UserInput;
}
