const axios = require('axios');
const { log } = require('apify');

/**
 * Geocoding cache to minimize API calls
 */
const geocodeCache = new Map();

/**
 * Geocode an address using Google Geocoding API
 * 
 * CRITICAL FIX: Enhanced Geocoding with Retry Logic
 * - Adds retry logic for transient failures (network timeouts, rate limits)
 * - Improved error handling and logging
 * - Validates coordinates before returning
 * - Ensures lat/long are always populated when geocoding succeeds
 * 
 * Issue: Latitude and Longitude missing from all properties in output
 * Solution: Enhanced geocoding with better error handling and retry logic
 * 
 * @param {string} address - Full address
 * @param {string} postcode - Postcode
 * @param {string} apiKey - Google API key
 * @param {number} retries - Number of retry attempts (default: 2)
 * @returns {Object} Geocoding result with lat, lng
 */
async function geocodeAddress(address, postcode, apiKey, retries = 2) {
    if (!apiKey) {
        log.error('Google API key is not set - cannot geocode addresses');
        return null;
    }
    
    if (!address || !postcode) {
        log.warning('Missing address or postcode - cannot geocode');
        return null;
    }
    
    const fullAddress = `${address}, ${postcode}, UK`;
    const cacheKey = fullAddress.toLowerCase().trim();
    
    // Check cache
    if (geocodeCache.has(cacheKey)) {
        const cached = geocodeCache.get(cacheKey);
        log.info(`Using cached geocode for: ${fullAddress} (${cached.lat}, ${cached.lng})`);
        return cached;
    }
    
    log.info(`Geocoding: ${fullAddress}`);
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
                params: {
                    address: fullAddress,
                    key: apiKey,
                    region: 'uk'
                },
                timeout: 15000 // Increased timeout to 15 seconds
            });

            if (response.data.status === 'OK' && response.data.results.length > 0) {
                const location = response.data.results[0].geometry.location;
                
                // Validate coordinates
                if (!location.lat || !location.lng) {
                    log.error(`Invalid coordinates returned for ${fullAddress}`);
                    return null;
                }
                
                const result = {
                    lat: location.lat,
                    lng: location.lng,
                    formatted_address: response.data.results[0].formatted_address
                };
                
                // Cache the result
                geocodeCache.set(cacheKey, result);
                
                log.info(`✓ Geocoded successfully: ${result.formatted_address} → (${result.lat}, ${result.lng})`);
                return result;
            } else if (response.data.status === 'ZERO_RESULTS') {
                log.warning(`No results found for ${fullAddress}`);
                return null;
            } else if (response.data.status === 'OVER_QUERY_LIMIT') {
                log.warning(`Google API quota exceeded - retry attempt ${attempt + 1}/${retries + 1}`);
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
                    continue;
                }
                log.error(`Geocoding failed after ${retries + 1} attempts: OVER_QUERY_LIMIT`);
                return null;
            } else {
                log.warning(`Geocoding failed for ${fullAddress}: ${response.data.status}`);
                if (response.data.error_message) {
                    log.warning(`Error message: ${response.data.error_message}`);
                }
                return null;
            }
        } catch (error) {
            log.error(`Geocoding error for ${fullAddress} (attempt ${attempt + 1}/${retries + 1}):`, error.message);
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                continue;
            }
            return null;
        }
    }
    
    log.error(`Geocoding failed after ${retries + 1} attempts for ${fullAddress}`);
    return null;
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