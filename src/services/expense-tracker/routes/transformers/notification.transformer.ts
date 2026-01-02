import type { NotificationPayloadInput, NotificationPayloadOutput } from './types';

/**
 * Transform notification payload from MacroDroid format to standard format
 * 
 * Accepts both MacroDroid format (app, title, text) and standard format
 * (app_name, notification_title, notification_text)
 * 
 * @param input - Raw notification payload
 * @returns Normalized notification payload
 */
export function transformNotificationPayload(input: NotificationPayloadInput): NotificationPayloadOutput {
    // Convert Unix timestamp (milliseconds) to ISO 8601 if needed
    let timestamp = input.timestamp;
    if (timestamp && /^\d+$/.test(timestamp)) {
        // It's a Unix timestamp in milliseconds
        const date = new Date(parseInt(timestamp));
        timestamp = date.toISOString();
    }

    // If it's already in standard format, return as-is
    if (input.app_name && input.notification_title && input.notification_text) {
        const result: NotificationPayloadOutput = {
            app_name: input.app_name,
            notification_title: input.notification_title,
            notification_text: input.notification_text,
            timestamp: timestamp || new Date().toISOString(),
        };

        if (input.latitude !== undefined) {
            result.latitude = input.latitude;
        }
        if (input.longitude !== undefined) {
            result.longitude = input.longitude;
        }

        return result;
    }

    // Convert MacroDroid format to standard format
    const result: NotificationPayloadOutput = {
        app_name: input.app || input.app_name || '',
        notification_title: input.title || input.notification_title || '',
        notification_text: input.text || input.notification_text || '',
        timestamp: timestamp || new Date().toISOString(),
    };

    if (input.latitude !== undefined) {
        result.latitude = input.latitude;
    }
    if (input.longitude !== undefined) {
        result.longitude = input.longitude;
    }

    return result;
}
