const axios = require('axios');
const cheerio = require('cheerio');
const { log } = require('apify');

/**
 * EPC HANDLER - Web Scraping Approach
 * 
 * CRITICAL FIX (v2.5): Direct Web Scraping of Certificate Numbers
 * - Bypasses the API entirely (API often doesn't return certificate-number)
 * - Scrapes postcode search page directly: https://find-energy-certificate.service.gov.uk/find-a-certificate/search-by-postcode?postcode={postcode}
 * - Extracts certificate numbers from href attributes: /energy-certificate/XXXX-XXXX-XXXX-XXXX-XXXX
 * - Matches by address to find the correct certificate
 * - More reliable than API which has missing certificate-number fields
 * 
 * Previous versions:
 * - v2.1: Proper EPC API Integration
 * - v2.3: Certificate Number URL Format (using certificate-number not lmk-key)
 * - v2.4: Two-Step Certificate Number Retrieval (search API + individual certificate API)
 * 
 * API Documentation (deprecated for this implementation): https://epc.opendatacommunities.org/docs/api
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
 * Scrape certificate numbers from postcode search page (NEW APPROACH - v2.5)
 * This bypasses the API entirely and scrapes directly from the web interface
 * The web interface provides direct links to certificates with certificate numbers in href
 * 
 * @param {string} postcode - Property postcode to search
 * @returns {Promise<Array>} Array of {certificateNumber, address, href, rating} objects
 */
async function scrapeCertificateNumbersFromPostcode(postcode) {
    if (!postcode) {
        log.warning('Cannot scrape certificates: missing postcode');
        return [];
    }
    
    log.info(`Scraping certificate numbers from postcode search page: ${postcode}`);
    
    try {
        const cleanPostcode = postcode.replace(/\s+/g, '');
        const searchURL = `https://find-energy-certificate.service.gov.uk/find-a-certificate/search-by-postcode?postcode=${cleanPostcode}`;
        
        const response = await axios.get(searchURL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        const certificates = [];
        
        // Find all certificate links - they have format: href="/energy-certificate/XXXX-XXXX-XXXX-XXXX-XXXX"
        $('a.govuk-link[href^="/energy-certificate/"]').each((i, elem) => {
            const href = $(elem).attr('href');
            const address = $(elem).text().trim();
            
            // Extract certificate number from href
            // Format: /energy-certificate/2648-3961-7260-5043-7964
            const match = href.match(/\/energy-certificate\/([A-Z0-9-]+)/i);
            
            if (match && match[1]) {
                const certificateNumber = match[1];
                
                if (isValidCertificateNumber(certificateNumber)) {
                    // Try to find rating if available on the page
                    let rating = null;
                    const parent = $(elem).closest('.govuk-summary-list__row, .search-result');
                    if (parent.length > 0) {
                        const ratingText = parent.find('.govuk-tag, .energy-rating').text().trim();
                        if (ratingText && /^[A-G]$/i.test(ratingText)) {
                            rating = ratingText.toUpperCase();
                        }
                    }
                    
                    certificates.push({
                        certificateNumber: certificateNumber,
                        address: address,
                        href: `https://find-energy-certificate.service.gov.uk${href}`,
                        rating: rating
                    });
                    
                    log.info(`Found certificate: ${certificateNumber} for ${address}`);
                }
            }
        });
        
        log.info(`Scraped ${certificates.length} certificates from postcode search page`);
        return certificates;
        
    } catch (error) {
        log.warning(`Failed to scrape certificate numbers: ${error.message}`);
        return [];
    }
}


/**
 * Get certificate number by scraping postcode search page
 * Uses web scraping approach to extract certificate numbers from href attributes
 * 
 * @param {string} postcode - Property postcode
 * @param {string} address - Property address for matching
 * @param {string} apiKey - EPC API key (optional, kept for compatibility but not used)
 * @returns {Promise<Object|null>} Certificate data with number or null
 */
async function getCertificateNumber(postcode, address, apiKey = null) {
    if (!postcode) {
        log.warning('Cannot look up certificate number: missing postcode');
        return null;
    }
    
    log.info(`Looking up certificate number via web scraping: ${postcode}`);
    
    try {
        // Scrape certificate numbers from postcode search page
        const certificates = await scrapeCertificateNumbersFromPostcode(postcode);
        
        if (certificates.length === 0) {
            log.warning('No certificates found for postcode');
            return null;
        }
        
        // Find best matching address
        const bestMatch = findBestAddressMatchFromScrapedData(certificates, address);
        
        if (bestMatch) {
            log.info(`Found matching certificate: ${bestMatch.certificateNumber} for ${bestMatch.address}`);
            return {
                certificateNumber: bestMatch.certificateNumber,
                certificateURL: bestMatch.href,
                rating: bestMatch.rating,
                address: bestMatch.address
            };
        }
        
        // If no good match, return first result as fallback
        log.info('No exact address match, returning first result as fallback');
        const fallback = certificates[0];
        return {
            certificateNumber: fallback.certificateNumber,
            certificateURL: fallback.href,
            rating: fallback.rating,
            address: fallback.address
        };
        
    } catch (error) {
        log.warning(`Failed to get certificate number: ${error.message}`);
        return null;
    }
}

/**
 * Find best matching address from scraped certificate data
 * @param {Array} certificates - Array of certificate objects from scraping
 * @param {string} targetAddress - Target address to match
 * @returns {Object} Best matching certificate or null
 */
function findBestAddressMatchFromScrapedData(certificates, targetAddress) {
    if (!targetAddress || !certificates || certificates.length === 0) {
        return certificates[0]; // Return first result if no address to match
    }
    
    const normalizedTarget = targetAddress.toLowerCase().trim();
    let bestMatch = null;
    let bestScore = 0;
    
    for (const cert of certificates) {
        const certAddress = cert.address.toLowerCase().trim();
        
        // Simple scoring: count matching words
        const targetWords = normalizedTarget.split(/\s+/);
        const certWords = certAddress.split(/\s+/);
        const matches = targetWords.filter(word => certWords.includes(word)).length;
        const score = matches / targetWords.length;
        
        if (score > bestScore) {
            bestScore = score;
            bestMatch = cert;
        }
    }
    
    // Only return match if score > 50%
    return bestScore > 0.5 ? bestMatch : certificates[0];
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
 * Fetch EPC data using web scraping (NEW APPROACH - v2.5)
 * Uses web scraping to extract certificate numbers directly from postcode search page
 * This is more reliable than the API which often doesn't return certificate-number
 * 
 * @param {string} postcode - Property postcode
 * @param {string} address - Property address
 * @param {string} apiKey - EPC API key (optional, kept for compatibility but not used)
 * @returns {Object} EPC data with certificate URL, rating, floor area
 */
async function fetchEPCDataViaAPI(postcode, address, apiKey = null) {
    log.info(`Fetching EPC data via web scraping for: ${address}, ${postcode}`);
    
    try {
        // Use web scraping to get certificate data
        const certData = await getCertificateNumber(postcode, address, apiKey);
        
        if (certData) {
            log.info(`Found EPC via web scraping: Rating ${certData.rating || 'N/A'}, Certificate #: ${certData.certificateNumber}`);
            log.info(`Certificate URL: ${certData.certificateURL}`);
            return {
                rating: certData.rating,
                certificateURL: certData.certificateURL,
                certificateNumber: certData.certificateNumber,
                floorArea: null // Floor area not available from scraping
            };
        } else {
            log.info('No EPC data found via web scraping');
            return { searchURL: generateEPCSearchURL(postcode) };
        }
        
    } catch (error) {
        log.warning(`EPC web scraping failed: ${error.message}`);
        return { searchURL: generateEPCSearchURL(postcode) };
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
    scrapeCertificateNumbersFromPostcode,
    findBestAddressMatchFromScrapedData
};