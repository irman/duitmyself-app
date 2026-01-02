/**
 * Geocoding Adapter Interface
 * 
 * Defines the contract for geocoding services that convert GPS coordinates
 * to human-readable addresses
 * 
 * Implementations: LocationIQ, Google Maps, OpenStreetMap
 */
export interface GeocodingAdapter {
    /**
     * Convert GPS coordinates to human-readable address
     * 
     * @param lat - Latitude
     * @param lon - Longitude
     * @returns Human-readable address or location description
     * @throws {GeocodingError} If geocoding fails
     */
    reverseGeocode(lat: number, lon: number): Promise<string>;

    /**
     * Validate API key/credentials
     * 
     * @returns True if credentials are valid
     */
    validateApiKey(): Promise<boolean>;
}

/**
 * Geocoding Error
 */
export class GeocodingError extends Error {
    constructor(
        message: string,
        public readonly latitude: number,
        public readonly longitude: number,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'GeocodingError';
    }
}
