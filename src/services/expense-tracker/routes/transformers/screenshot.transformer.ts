import type { ScreenshotPayloadInput, ScreenshotPayloadOutput } from './types';

/**
 * Transform screenshot payload from MacroDroid format to standard format
 * 
 * Accepts various field name variations and normalizes to standard format
 * 
 * @param input - Raw screenshot payload from MacroDroid
 * @returns Normalized screenshot payload
 */
export function transformScreenshotPayload(input: ScreenshotPayloadInput): ScreenshotPayloadOutput {
    // Extract base64 image (try different field names)
    const imageBase64 = input.image_base64 || input.image || '';

    // Extract app package name (try different field names)
    const appPackageName = input.app_package_name || input.package_name || input.app_name || '';

    // Convert Unix timestamp to ISO 8601 if needed
    let timestamp = input.timestamp;
    if (timestamp && /^\d+$/.test(timestamp)) {
        const numericTimestamp = parseInt(timestamp);

        // Detect if timestamp is in seconds or milliseconds
        // Timestamps in seconds are typically 10 digits (e.g., 1767706329)
        // Timestamps in milliseconds are typically 13 digits (e.g., 1767706329000)
        // Cutoff: if less than 10000000000 (Sep 2001), assume seconds
        const timestampMs = numericTimestamp < 10000000000
            ? numericTimestamp * 1000  // Convert seconds to milliseconds
            : numericTimestamp;         // Already in milliseconds

        const date = new Date(timestampMs);
        timestamp = date.toISOString();
    }

    // Parse location if provided as comma-separated string
    let latitude = input.latitude;
    let longitude = input.longitude;

    if (input.location && !latitude && !longitude) {
        const parts = input.location.split(',').map(s => s.trim());
        if (parts.length === 2) {
            latitude = parts[0];
            longitude = parts[1];
        }
    }

    // Build result
    const result: ScreenshotPayloadOutput = {
        image_base64: imageBase64,
        app_package_name: appPackageName,
        timestamp: timestamp || new Date().toISOString(),
    };

    if (latitude !== undefined) {
        result.latitude = latitude;
    }
    if (longitude !== undefined) {
        result.longitude = longitude;
    }
    if (input.metadata !== undefined) {
        result.metadata = input.metadata;

        // Extract user_input from metadata if provided
        if (input.metadata.user_input) {
            result.user_input = {
                payee: input.metadata.user_input.payee,
                split: input.metadata.user_input.split ?? false,
                remarks: input.metadata.user_input.remarks,
            };
        }
    }

    return result;
}
