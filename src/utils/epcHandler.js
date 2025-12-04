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
 * CRITICAL FIX (v2.3): Certificate Number URL Format
 * - EPC certificate URLs use 'certificate-number' field (format: XXXX-XXXX-XXXX-XXXX-XXXX)
 * - NOT 'lmk-key' (64-char hash) which causes 404 errors on the website
 * - URL format: https://find-energy-certificate.service.gov.uk/energy-certificate/{certificate-number}
 * 
 * CRITICAL FIX (v2.4): Two-Step Certificate Number Retrieval
 * - Search API does NOT return certificate-number in results
 * - Step 1: Search API returns lmk-key for matching properties
 * - Step 2: Call individual certificate API: /api/v1/domestic/certificate/{lmk-key}
 * - Step 3: Extract certificate-number (RRN) from individual certificate response
 * - Build URL: https://find-energy-certificate.service.gov.uk/energy-certificate/{certificate-number}
 * 
 * API Documentation: https://epc.opendatacommunities.org/docs/api
 */

/**
 * Validate certificate number format
 * Valid format: XXXX-XXXX-XXXX-XXXX-XXXX (20 chars with 4 hyphens = 24 total)
 * @param {string} certificateNumber - The certificate number to validate
 * @returns {boolean} True if valid format
 */
function isValidCertificateNumber(certificateNumber) {
    if (!certificateNumber || typeof certificateNumber !== 'string') {
        return false;
    }
    
    // Certificate number format: XXXX-XXXX-XXXX-XXXX-XXXX
    // Pattern: 4 alphanumeric chars, hyphen, repeated 5 times (last group has no trailing hyphen)
    const certPattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
    
    if (certPattern.test(certificateNumber)) {
        return true;
    }
    
    log.warning(`Invalid certificate number format: ${certificateNumber}`);
    return false;
}

/**
 * Fetch individual certificate details using lmk-key
 * This is required because the search API doesn't always return certificate-number
 * @param {string} lmkKey - The lmk-key from search results
 * @param {string} apiKey - EPC API key
 * @param {string} email - EPC registered email
 * @returns {Promise<Object|null>} Certificate details including certificate-number
 */
async function fetchCertificateByLmkKey(lmkKey, apiKey, email) {
    if (!lmkKey || !apiKey) {
        log.warning('Cannot fetch certificate: missing lmk-key or API key');
        return null;
    }
    
    log.info(`Fetching individual certificate for lmk-key: ${lmkKey.substring(0, 16)}...`);
    
    try {
        // Individual certificate endpoint
        const certificateURL = `https://epc.opendatacommunities.org/api/v1/domestic/certificate/${lmkKey}`;
        const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');
        
        const response = await axios.get(certificateURL, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        
        if (!response.data || !response.data.rows || response.data.rows.length === 0) {
            log.warning('No certificate data returned from individual certificate API');
            return null;
        }
        
        const certificate = response.data.rows[0];
        const certificateNumber = certificate['certificate-number'];
        
        if (certificateNumber) {
            log.info(`Retrieved certificate-number from individual API: ${certificateNumber}`);
            return {
                certificateNumber: certificateNumber,
                lmkKey: lmkKey,
                rating: certificate['current-energy-rating'],
                floorArea: certificate['total-floor-area'],
                address1: certificate['address1'],
                address2: certificate['address2'],
                address3: certificate['address3'],
                postcode: certificate['postcode']
            };
        }
        
        log.warning('Certificate data returned but no certificate-number field');
        return null;
        
    } catch (error) {
        log.warning(`Failed to fetch individual certificate: ${error.message}`);
        return null;
    }
}

/**
 * Get certificate number by looking up via postcode
 * Uses two-step process: search API -> individual certificate API
 * @param {string} postcode - Property postcode
 * @param {string} address - Property address for matching
 * @param {string} apiKey - EPC API key
 * @returns {Promise<Object|null>} Certificate data with number or null
 */
async function getCertificateNumber(postcode, address, apiKey) {
    if (!apiKey || !postcode) {
        log.warning('Cannot look up certificate number: missing API key or postcode');
        return null;
    }
    
    log.info(`Looking up certificate number via postcode: ${postcode}`);
    
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
        
        if (!bestMatch) {
            log.warning('No matching address found in search results');
            return null;
        }
        
        // Get lmk-key from search result
        const lmkKey = bestMatch['lmk-key'];
        
        // Check if certificate-number is directly available in search results
        if (bestMatch['certificate-number'] && isValidCertificateNumber(bestMatch['certificate-number'])) {
            const certificateNumber = bestMatch['certificate-number'];
            log.info(`Found certificate number in search results: ${certificateNumber}`);
            return {
                certificateNumber: certificateNumber,
                lmkKey: lmkKey,
                rating: bestMatch['current-energy-rating'],
                floorArea: bestMatch['total-floor-area']
            };
        }
        
        // CRITICAL FIX: Certificate-number not in search results, fetch via individual certificate API
        log.info(`Certificate-number not in search results, fetching via individual certificate API using lmk-key`);
        
        if (!lmkKey) {
            log.warning('No lmk-key found in search results, cannot fetch certificate');
            return null;
        }
        
        const certData = await fetchCertificateByLmkKey(lmkKey, apiKey, email);
        
        if (certData && certData.certificateNumber) {
            log.info(`Successfully retrieved certificate-number via individual API: ${certData.certificateNumber}`);
            return certData;
        }
        
        log.warning('Failed to retrieve certificate-number from individual certificate API');
        return null;
        
    } catch (error) {
        log.warning(`Failed to get certificate number: ${error.message}`);
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
 * Uses two-step process: search API -> individual certificate API for certificate-number
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
            // Get lmk-key from search result
            const lmkKey = bestMatch['lmk-key'];
            let certificateNumber = bestMatch['certificate-number'];
            let rating = bestMatch['current-energy-rating'];
            let floorArea = bestMatch['total-floor-area'];
            
            // CRITICAL FIX (v2.4): If certificate-number not in search results, fetch via individual certificate API
            if (!certificateNumber || !isValidCertificateNumber(certificateNumber)) {
                log.info(`Certificate-number not in search results for ${address}, fetching via individual certificate API`);
                
                if (lmkKey) {
                    const certData = await fetchCertificateByLmkKey(lmkKey, apiKey, email);
                    
                    if (certData && certData.certificateNumber) {
                        certificateNumber = certData.certificateNumber;
                        // Use data from individual certificate API if available
                        rating = certData.rating || rating;
                        floorArea = certData.floorArea || floorArea;
                        log.info(`Successfully retrieved certificate-number via individual API: ${certificateNumber}`);
                    }
                }
            }
            
            // If still no certificate number, fallback to search URL
            if (!certificateNumber || !isValidCertificateNumber(certificateNumber)) {
                log.warning(`Could not retrieve certificate-number for ${address}, using search URL instead`);
                return {
                    rating: rating,
                    searchURL: generateEPCSearchURL(postcode),
                    floorArea: floorArea,
                    lmkKey: lmkKey,
                    certificateNumber: null,
                    certificateURL: null,
                    note: 'Certificate number not available - use search link'
                };
            }
            
            const epcData = {
                rating: rating,
                certificateURL: `https://find-energy-certificate.service.gov.uk/energy-certificate/${certificateNumber}`,
                floorArea: floorArea,
                lmkKey: lmkKey, // Keep for reference
                certificateNumber: certificateNumber
            };
            
            log.info(`Found EPC via API: Rating ${epcData.rating}, Certificate #: ${certificateNumber}`);
            log.info(`Certificate URL: ${epcData.certificateURL}`);
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
    isValidCertificateNumber,
    getCertificateNumber,
    fetchCertificateByLmkKey
};