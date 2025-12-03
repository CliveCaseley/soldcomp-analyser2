const axios = require('axios');
const { log } = require('apify');

/**
 * Geocoding cache to minimize API calls
 */
const geocodeCache = new Map();

/**
 * Geocode an address using Google Geocoding API
 * @param {string} address - Full address
 * @param {string} postcode - Postcode
 * @param {string} apiKey - Google API key
 * @returns {Object} Geocoding result with lat, lng
 */
async function geocodeAddress(address, postcode, apiKey) {
    const fullAddress = `${address}, ${postcode}, UK`;
    const cacheKey = fullAddress.toLowerCase().trim();
    
    // Check cache
    if (geocodeCache.has(cacheKey)) {
        log.info(`Using cached geocode for: ${fullAddress}`);
        return geocodeCache.get(cacheKey);
    }
    
    log.info(`Geocoding: ${fullAddress}`);
    
    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: fullAddress,
                key: apiKey
            },
            timeout: 10000
        });

        if (response.data.status === 'OK' && response.data.results.length > 0) {
            const location = response.data.results[0].geometry.location;
            const result = {
                lat: location.lat,
                lng: location.lng,
                formatted_address: response.data.results[0].formatted_address
            };
            
            // Cache the result
            geocodeCache.set(cacheKey, result);
            
            log.info(`Geocoded successfully: ${result.formatted_address}`);
            return result;
        } else {
            log.warning(`Geocoding failed for ${fullAddress}: ${response.data.status}`);
            return null;
        }
    } catch (error) {
        log.error(`Geocoding error for ${fullAddress}:`, error.message);
        return null;
    }
}

/**
 * Generate Google Streetview URL
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Streetview URL
 */
function generateStreetviewURL(lat, lng) {
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

module.exports = {
    geocodeAddress,
    generateStreetviewURL
};