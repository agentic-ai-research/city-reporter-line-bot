/**
 * Geocoding service using Google Maps Geocoding API
 * Converts text addresses to GPS coordinates
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Convert a Thai address/location text to GPS coordinates
 * @param {string} address - Address or location description
 * @returns {Object|null} - { lat, lng, formattedAddress } or null if not found
 */
export async function geocodeAddress(address) {
    if (!address || !GOOGLE_MAPS_API_KEY) {
        console.log('Geocoding skipped: no address or API key');
        return null;
    }

    try {
        // Add Thailand context for better results
        const searchAddress = address.includes('ประเทศไทย') || address.includes('Thailand')
            ? address
            : `${address}, ประเทศไทย`;

        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('address', searchAddress);
        url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
        url.searchParams.set('language', 'th');
        url.searchParams.set('region', 'th');

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.results.length > 0) {
            const result = data.results[0];
            return {
                lat: result.geometry.location.lat,
                lng: result.geometry.location.lng,
                formattedAddress: result.formatted_address
            };
        }

        console.log('Geocoding: no results for', address, data.status);
        return null;

    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
}

/**
 * Reverse geocode GPS coordinates to address
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string|null} - Formatted address or null
 */
export async function reverseGeocode(lat, lng) {
    if (!GOOGLE_MAPS_API_KEY) {
        return null;
    }

    try {
        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('latlng', `${lat},${lng}`);
        url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
        url.searchParams.set('language', 'th');

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.results.length > 0) {
            return data.results[0].formatted_address;
        }

        return null;

    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return null;
    }
}

/**
 * Find places by name near a location
 * @param {string} query - Place name to search
 * @param {Object} location - { lat, lng } center point (optional)
 * @returns {Array} - Array of place results
 */
export async function findPlaces(query, location = null) {
    if (!GOOGLE_MAPS_API_KEY) {
        return [];
    }

    try {
        const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
        url.searchParams.set('query', query);
        url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
        url.searchParams.set('language', 'th');
        url.searchParams.set('region', 'th');

        if (location) {
            url.searchParams.set('location', `${location.lat},${location.lng}`);
            url.searchParams.set('radius', '5000'); // 5km radius
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK') {
            return data.results.map(place => ({
                name: place.name,
                address: place.formatted_address,
                lat: place.geometry.location.lat,
                lng: place.geometry.location.lng
            }));
        }

        return [];

    } catch (error) {
        console.error('Place search error:', error);
        return [];
    }
}
