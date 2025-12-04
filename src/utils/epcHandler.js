const axios = require('axios');
const cheerio = require('cheerio');
const { log } = require('apify');

/**
 * EPC API HANDLER
 * 
 * CRITICAL FIX (v2.1): Proper EPC API Integration
 * - Uses official EPC API with authentication
 * - Provides individual property EPC certificate URLs
 * - Falls back to web scraping if API unavailable
 * - Addresses Issue #10: EPC link misplacement
 * 
 * CRITICAL FIX (v2.2): Certificate ID Hash Format
 * - Old format: 34-digit numeric IDs (deprecated, causes 404 errors)
 * - New format: 64-character SHA-256 hash
 * - Automatically detects old format and converts via postcode lookup
 * 
 * API Documentation: https://epc.opendatacommunities.org/docs/api
 */

/**
 * Check if a certificate ID is in old numeric format (deprecated)
 * Old format: 34-digit numeric string (causes 404 errors)
 * New format: 64-character alphanumeric SHA-256 hash
 * @param {string} lmkKey - The certificate ID to check
 * @returns {boolean} True if old format, false if new hash format
 */
function isOldCertificateFormat(lmkKey) {
    if (!lmkKey || typeof lmkKey !== 'string') {
        return false;
    }
    
    // Old format: 34 digits (numeric only)
    // Example: 1234567890123456789012345678901234
    const isOldNumeric = /^\d{30,40}$/.test(lmkKey);
    
    // New format: 64 characters (alphanumeric, SHA-256 hash)
    // Example: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
    const isNewHash = /^[a-f0-9]{64}$/i.test(lmkKey);
    
    if (isNewHash) {
        return false; // Already in new format
    }
    
    // If it's all numeric and roughly the right length, it's old format
    if (isOldNumeric) {
        log.warning(`Detected old EPC certificate format: ${lmkKey} (${lmkKey.length} chars)`);
        return true;
    }
    
    // For other formats (like mixed alphanumeric), check length
    // New format should be exactly 64 characters
    if (lmkKey.length !== 64) {
        log.warning(`Potentially invalid EPC certificate format: ${lmkKey} (${lmkKey.length} chars, expected 64)`);
        return true; // Treat as old/invalid format
    }
    
    return false;
}

/**
 * Get new hash format certificate ID by looking up via postcode
 * @param {string} postcode - Property postcode
 * @param {string} address - Property address for matching
 * @param {string} apiKey - EPC API key
 * @param {string} oldLmkKey - Old certificate ID (for logging)
 * @returns {Promise<string|null>} New hash format certificate ID or null
 */
async function getNewCertificateHash(postcode, address, apiKey, oldLmkKey = null) {
    if (!apiKey || !postcode) {
        log.warning('Cannot convert certificate ID: missing API key or postcode');
        return null;
    }
    
    log.info(`Converting old certificate ID ${oldLmkKey || 'unknown'} to new hash format via postcode lookup: ${postcode}`);
    
    try {
        const apiBaseURL = 'https://epc.opendatacommunities.org/api/v1/domestic/search';
        const email = process.env.EPC_EMAIL || 'user@example.com';
        const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');
        
        const params = {
            postcode: postcode.replace(/\s+/g, ''),
            size: 20 // Get more results for better matching
        };
        
        const response = await axios.get(apiBaseURL, {
            params,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        
        if (!response.data || !response.data.rows || response.data.rows.length === 0) {
            log.warning('No EPC data found for postcode lookup');
            return null;
        }
        
        const results = response.data.rows;
        
        // Find best matching address
        const bestMatch = findBestAddressMatch(results, address);
        
        if (bestMatch && bestMatch['lmk-key']) {
            const newLmkKey = bestMatch['lmk-key'];
            
            // Verify it's the new format
            if (!isOldCertificateFormat(newLmkKey)) {
                log.info(`Successfully converted to new hash format: ${newLmkKey}`);
                return newLmkKey;
            } else {
                log.warning(`API returned old format certificate ID: ${newLmkKey}`);
                // Try to find another result with new format
                for (const result of results) {
                    if (result['lmk-key'] && !isOldCertificateFormat(result['lmk-key'])) {
                        log.info(`Found alternative new hash format: ${result['lmk-key']}`);
                        return result['lmk-key'];
                    }
                }
                return null;
            }
        }
        
        return null;
    } catch (error) {
        log.warning(`Failed to get new certificate hash: ${error.message}`);
        return null;
    }
}

/**
 * Generate EPC postcode search URL (web interface)
 * @param {string} postcode - Property postcode
 * @returns {string} EPC search URL
 */
function generateEPCSearchURL(postcode) {
    const cleanPostcode = postcode.replace(/\s+/g, '+');
    return `https://find-energy-certificate.service.gov.uk/find-a-certificate/search-by-postcode?postcode=${cleanPostcode}`;
}

/**
 * Fetch EPC data using official API
 * @param {string} postcode - Property postcode
 * @param {string} address - Property address
 * @param {string} apiKey - EPC API key
 * @returns {Object} EPC data with certificate URL, rating, floor area
 */
async function fetchEPCDataViaAPI(postcode, address, apiKey) {
    if (!apiKey) {
        log.warning('EPC_API_KEY not set, skipping API call');
        return null;
    }
    
    log.info(`Fetching EPC data via API for: ${address}, ${postcode}`);
    
    try {
        // EPC API endpoint for domestic properties
        const apiBaseURL = 'https://epc.opendatacommunities.org/api/v1/domestic/search';
        
        // Prepare authentication (Basic Auth with email:apikey)
        // The API requires email address as username and API key as password
        // Format: Authorization: Basic base64(email:apikey)
        // Use EPC_EMAIL environment variable, fallback to placeholder if not set
        const email = process.env.EPC_EMAIL || 'user@example.com';
        const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');
        
        // Search by postcode
        const params = {
            postcode: postcode.replace(/\s+/g, ''),
            size: 10 // Limit results
        };
        
        const response = await axios.get(apiBaseURL, {
            params,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        
        if (!response.data || !response.data.rows || response.data.rows.length === 0) {
            log.info('No EPC data found via API');
            return null;
        }
        
        // Find best matching address
        const results = response.data.rows;
        const bestMatch = findBestAddressMatch(results, address);
        
        if (bestMatch) {
            let lmkKey = bestMatch['lmk-key'];
            
            // CRITICAL: Check if certificate ID is in old deprecated format
            // Old format causes 404 errors on the EPC website
            if (isOldCertificateFormat(lmkKey)) {
                log.warning(`Certificate ID ${lmkKey} is in old format, attempting conversion...`);
                
                // Try to find a result with new hash format in the same response
                const newFormatResult = results.find(r => 
                    r['lmk-key'] && !isOldCertificateFormat(r['lmk-key'])
                );
                
                if (newFormatResult) {
                    // Use the address matching to find the correct one with new format
                    const newFormatMatches = results.filter(r => 
                        r['lmk-key'] && !isOldCertificateFormat(r['lmk-key'])
                    );
                    const bestNewMatch = findBestAddressMatch(newFormatMatches, address);
                    if (bestNewMatch) {
                        lmkKey = bestNewMatch['lmk-key'];
                        log.info(`Converted to new hash format: ${lmkKey}`);
                    } else {
                        log.warning(`Could not find matching certificate in new format, using search URL instead`);
                        return {
                            rating: bestMatch['current-energy-rating'],
                            searchURL: generateEPCSearchURL(postcode),
                            floorArea: bestMatch['total-floor-area'],
                            lmkKey: null,
                            certificateURL: null,
                            note: 'Certificate ID in deprecated format - use search link'
                        };
                    }
                } else {
                    // No new format available in API response - return search URL
                    log.warning(`No certificates with new format found for ${postcode}`);
                    return {
                        rating: bestMatch['current-energy-rating'],
                        searchURL: generateEPCSearchURL(postcode),
                        floorArea: bestMatch['total-floor-area'],
                        lmkKey: null,
                        certificateURL: null,
                        note: 'Certificate ID in deprecated format - use search link'
                    };
                }
            }
            
            const epcData = {
                rating: bestMatch['current-energy-rating'],
                certificateURL: `https://find-energy-certificate.service.gov.uk/energy-certificate/${lmkKey}`,
                floorArea: bestMatch['total-floor-area'],
                lmkKey: lmkKey
            };
            
            log.info(`Found EPC via API: Rating ${epcData.rating}, Certificate: ${epcData.certificateURL}`);
            return epcData;
        } else {
            log.info('No matching address found in EPC API results');
            return null;
        }
        
    } catch (error) {
        log.warning(`EPC API call failed: ${error.message}`);
        return null;
    }
}

/**
 * Find best matching address from EPC API results
 * @param {Array} results - EPC API results
 * @param {string} targetAddress - Target address to match
 * @returns {Object} Best matching result or null
 */
function findBestAddressMatch(results, targetAddress) {
    if (!targetAddress || !results || results.length === 0) {
        return results[0]; // Return first result if no address to match
    }
    
    const normalizedTarget = targetAddress.toLowerCase().trim();
    let bestMatch = null;
    let bestScore = 0;
    
    for (const result of results) {
        const resultAddress = [
            result['address1'],
            result['address2'],
            result['address3']
        ].filter(Boolean).join(', ').toLowerCase().trim();
        
        // Simple scoring: count matching words
        const targetWords = normalizedTarget.split(/\s+/);
        const resultWords = resultAddress.split(/\s+/);
        const matches = targetWords.filter(word => resultWords.includes(word)).length;
        const score = matches / targetWords.length;
        
        if (score > bestScore) {
            bestScore = score;
            bestMatch = result;
        }
    }
    
    // Only return match if score > 50%
    return bestScore > 0.5 ? bestMatch : results[0];
}

/**
 * Try to scrape EPC rating for a property (fallback method)
 * @param {string} postcode - Property postcode
 * @param {string} address - Property address
 * @param {string} apiKey - EPC API key (optional)
 * @returns {Object} EPC data or null
 */
async function scrapeEPCData(postcode, address, apiKey = null) {
    log.info(`Attempting to fetch EPC data for: ${address}, ${postcode}`);
    
    // Try API first if key available
    if (apiKey) {
        const apiData = await fetchEPCDataViaAPI(postcode, address, apiKey);
        if (apiData) {
            return apiData;
        }
    }
    
    // Fallback to web scraping
    try {
        const url = generateEPCSearchURL(postcode);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        
        // Try to find matching address in results
        let epcRating = null;
        let certificateURL = null;
        
        $('.search-result, .govuk-summary-list__row').each((i, elem) => {
            const resultAddress = $(elem).find('.govuk-summary-list__value, .address').text().trim();
            
            // Simple address matching
            if (resultAddress && address && resultAddress.toLowerCase().includes(address.toLowerCase().substring(0, 20))) {
                const rating = $(elem).find('.energy-rating, .govuk-tag').text().trim();
                if (rating && /^[A-G]$/i.test(rating)) {
                    epcRating = rating.toUpperCase();
                }
                
                // Try to find certificate link
                const link = $(elem).find('a').attr('href');
                if (link) {
                    certificateURL = link.startsWith('http') ? link : `https://find-energy-certificate.service.gov.uk${link}`;
                }
            }
        });

        if (epcRating) {
            log.info(`Found EPC rating via scraping: ${epcRating}`);
            return { 
                rating: epcRating, 
                certificateURL: certificateURL || null,
                searchURL: url 
            };
        } else {
            log.info('No EPC rating found, will provide search link');
            return { searchURL: url };
        }
    } catch (error) {
        log.warning(`Failed to fetch EPC data: ${error.message}`);
        return { searchURL: generateEPCSearchURL(postcode) };
    }
}

/**
 * Create EPC lookup row
 * @param {string} targetPostcode - Target property postcode
 * @returns {Object} EPC lookup row data
 */
function createEPCLookupRow(targetPostcode) {
    const url = generateEPCSearchURL(targetPostcode);
    return {
        'Date of sale': '',
        'Address': 'EPC Lookup',
        'Postcode': targetPostcode,
        'Type': '',
        'Tenure': '',
        'Age at sale': '',
        'Price': '',
        'Sq. ft': '',
        'Sqm': '',
        '£/sqft': '',
        'Bedrooms': '',
        'Distance': '',
        'URL': url,
        'Link': `=HYPERLINK("${url}", "EPC Search")`,
        'Image_URL': '',
        'EPC rating': '',
        'Google Streetview URL': '',
        'isTarget': '',
        'Ranking': '',
        'needs_review': ''
    };
}

module.exports = {
    generateEPCSearchURL,
    scrapeEPCData,
    createEPCLookupRow,
    isOldCertificateFormat,
    getNewCertificateHash
};