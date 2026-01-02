import ky, { type KyInstance } from 'ky';
import type { GeocodingAdapter } from './geocoding.interface';
import { logger, logLocationLookup } from '@/shared/utils/logger';

/**
 * LocationIQ API response for reverse geocoding
 */
interface LocationIQResponse {
    display_name?: string;
    address?: {
        road?: string;
        suburb?: string;
        city?: string;
        state?: string;
        country?: string;
    };
    error?: string;
}

/**
 * LocationIQ Adapter
 * 
 * Integrates with LocationIQ geocoding service
 * API Docs: https://locationiq.com/docs
 */
export class LocationIQAdapter implements GeocodingAdapter {
    private client: KyInstance;
    private apiKey: string;

    constructor(
        apiKey: string,
        baseUrl: string,
        retryConfig: { limit: number; backoffMs: number }
    ) {
        this.apiKey = apiKey;
        this.client = ky.create({
            prefixUrl: baseUrl,
            retry: {
                limit: retryConfig.limit,
                methods: ['get'],
                statusCodes: [408, 429, 500, 502, 503, 504],
                backoffLimit: retryConfig.backoffMs,
            },
            hooks: {
                beforeRetry: [
                    ({ request, error, retryCount }) => {
                        logger.warn({
                            event: 'geocoding.api.retry',
                            url: request.url,
                            retryCount,
                            error: error?.message,
                        }, 'Retrying LocationIQ API request');
                    },
                ],
            },
        });
    }

    /**
     * Convert GPS coordinates to human-readable address
     */
    async reverseGeocode(lat: number, lon: number): Promise<string> {
        try {
            logger.debug({
                event: 'geocoding.request',
                latitude: lat,
                longitude: lon,
            }, 'Requesting reverse geocoding');

            const response = await this.client
                .get('reverse', {
                    searchParams: {
                        key: this.apiKey,
                        lat: lat.toString(),
                        lon: lon.toString(),
                        format: 'json',
                        // Request specific address components
                        addressdetails: '1',
                        // Normalize address format
                        normalizecity: '1',
                    },
                })
                .json<LocationIQResponse>();

            if (response.error) {
                throw new Error(response.error);
            }

            // Format the address nicely
            const location = this.formatAddress(response);

            logLocationLookup({
                latitude: lat,
                longitude: lon,
                location,
            });

            return location;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            logLocationLookup({
                latitude: lat,
                longitude: lon,
                error: errorMessage,
            });

            // Don't throw - return coordinates as fallback
            // This allows transaction processing to continue even if geocoding fails
            return `${lat}, ${lon}`;
        }
    }

    /**
     * Validate API key by making a test request
     */
    async validateApiKey(): Promise<boolean> {
        try {
            // Test with Kuala Lumpur coordinates
            await this.reverseGeocode(3.139, 101.6869);
            return true;
        } catch (error) {
            logger.warn('LocationIQ API key validation failed', { error });
            return false;
        }
    }

    /**
     * Format address from LocationIQ response
     */
    private formatAddress(response: LocationIQResponse): string {
        // If display_name is available, use it
        if (response.display_name) {
            // Clean up the display name (remove country code and postal code for brevity)
            const parts = response.display_name.split(',').map((p) => p.trim());
            // Take first 3-4 parts (usually: place, suburb, city, state)
            const relevantParts = parts.slice(0, Math.min(4, parts.length));
            return relevantParts.join(', ');
        }

        // Otherwise, build from address components
        if (response.address) {
            const { road, suburb, city, state } = response.address;
            const parts = [road, suburb, city, state].filter(Boolean);
            if (parts.length > 0) {
                return parts.join(', ');
            }
        }

        // Fallback to display_name or empty
        return response.display_name || '';
    }
}
