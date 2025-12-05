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
 * Extract house number from address string
 * Handles various formats: "32", "32a", "32A", "Flat 1, 32", "32-34", etc.
 * @param {string} address - Address string
 * @returns {Object} {primary: string, flat: string|null, hasRange: boolean}
 */
function extractHouseNumber(address) {
    if (!address) return { primary: null, flat: null, hasRange: false };
    
    const normalized = address.toLowerCase().trim();
    
    // Pattern 1: "Flat X, 32 Street" or "Apartment X, 32 Street"
    const flatPattern = /(?:flat|apartment|apt|unit)\s*([a-z0-9]+)[,\s]+(\d+[a-z]?)/i;
    const flatMatch = normalized.match(flatPattern);
    if (flatMatch) {
        return {
            primary: flatMatch[2],
            flat: flatMatch[1],
            hasRange: false
        };
    }
    
    // Pattern 2: "32a Street" or "32A Street" (house number with letter suffix)
    const letterSuffixPattern = /^(\d+)([a-z])\b/i;
    const letterMatch = normalized.match(letterSuffixPattern);
    if (letterMatch) {
        return {
            primary: letterMatch[1],
            flat: letterMatch[2],
            hasRange: false
        };
    }
    
    // Pattern 3: "32-34 Street" (range)
    const rangePattern = /^(\d+)-(\d+)\b/;
    const rangeMatch = normalized.match(rangePattern);
    if (rangeMatch) {
        return {
            primary: rangeMatch[1],
            flat: null,
            hasRange: true,
            rangeTo: rangeMatch[2]
        };
    }
    
    // Pattern 4: Simple "32 Street" (just extract leading number)
    const simplePattern = /^(\d+)\b/;
    const simpleMatch = normalized.match(simplePattern);
    if (simpleMatch) {
        return {
            primary: simpleMatch[1],
            flat: null,
            hasRange: false
        };
    }
    
    return { primary: null, flat: null, hasRange: false };
}

/**
 * Calculate match score between two house number objects
 * @param {Object} target - Target house number object
 * @param {Object} candidate - Candidate house number object
 * @returns {number} Score between 0 and 1
 */
function scoreHouseNumberMatch(target, candidate) {
    if (!target.primary || !candidate.primary) {
        return 0;
    }
    
    // Exact match on primary number
    if (target.primary === candidate.primary) {
        // Check flat/letter suffix match
        if (target.flat && candidate.flat) {
            return target.flat === candidate.flat ? 1.0 : 0.7; // Same number, different flat
        }
        if (!target.flat && !candidate.flat) {
            return 1.0; // Perfect match
        }
        // One has flat, other doesn't - partial match
        return 0.8;
    }
    
    // Check if target is in candidate's range
    if (candidate.hasRange && candidate.rangeTo) {
        const targetNum = parseInt(target.primary, 10);
        const rangeStart = parseInt(candidate.primary, 10);
        const rangeEnd = parseInt(candidate.rangeTo, 10);
        if (targetNum >= rangeStart && targetNum <= rangeEnd) {
            return 0.6; // Partial match for range
        }
    }
    
    return 0; // No match
}

/**
 * Find best matching address from scraped certificate data
 * IMPROVED VERSION (Batch 1 - Issue 5): Better house number extraction and matching
 * 
 * @param {Array} certificates - Array of certificate objects from scraping
 * @param {string} targetAddress - Target address to match
 * @returns {Object} Best matching certificate or null
 */
function findBestAddressMatchFromScrapedData(certificates, targetAddress) {
    if (!targetAddress || !certificates || certificates.length === 0) {
        return certificates[0]; // Return first result if no address to match
    }
    
    log.info(`Matching target address: "${targetAddress}"`);
    
    const normalizedTarget = targetAddress.toLowerCase().trim();
    const targetHouseNum = extractHouseNumber(targetAddress);
    
    log.info(`Extracted target house number: ${JSON.stringify(targetHouseNum)}`);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const cert of certificates) {
        const certAddress = cert.address.toLowerCase().trim();
        const certHouseNum = extractHouseNumber(cert.address);
        
        // Calculate house number match score (weight: 70%)
        const houseNumScore = scoreHouseNumberMatch(targetHouseNum, certHouseNum);
        
        // Calculate street name match score (weight: 30%)
        const targetWords = normalizedTarget.split(/\s+/).filter(w => w.length > 2); // Filter short words
        const certWords = certAddress.split(/\s+/).filter(w => w.length > 2);
        const wordMatches = targetWords.filter(word => certWords.includes(word)).length;
        const streetScore = targetWords.length > 0 ? wordMatches / targetWords.length : 0;
        
        // Combined score: prioritize house number matching
        const totalScore = (houseNumScore * 0.7) + (streetScore * 0.3);
        
        log.info(`  Candidate: "${cert.address}" - House#: ${certHouseNum.primary}${certHouseNum.flat || ''}, Score: ${totalScore.toFixed(2)} (house: ${houseNumScore.toFixed(2)}, street: ${streetScore.toFixed(2)})`);
        
        if (totalScore > bestScore) {
            bestScore = totalScore;
            bestMatch = cert;
        }
    }
    
    // Only return match if score > 40% (lowered threshold due to weighted scoring)
    if (bestScore > 0.4 && bestMatch) {
        log.info(`✓ Selected best match: "${bestMatch.address}" (score: ${bestScore.toFixed(2)})`);
        return bestMatch;
    } else {
        log.warning(`✗ No good match found (best score: ${bestScore.toFixed(2)}), returning first result as fallback`);
        return certificates[0];
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
 * ENHANCEMENT D: Scrape floor area from EPC certificate page
 * Extracts floor area (in sqm) from individual EPC certificate pages
 * 
 * @param {string} certificateURL - Full URL to EPC certificate page
 * @returns {Promise<number|null>} Floor area in square meters, or null if not found
 */
async function scrapeFloorAreaFromCertificate(certificateURL) {
    if (!certificateURL) {
        return null;
    }
    
    log.info(`Scraping floor area from certificate: ${certificateURL}`);
    
    try {
        const response = await axios.get(certificateURL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        // Look for floor area in the certificate page
        // Floor area is typically displayed in various formats:
        // "Total floor area: 123 m²"
        // "Total floor area   123 square metres"
        
        let floorArea = null;
        
        // Method 1: Look for dt/dd pairs with "Total floor area"
        $('dt').each((i, elem) => {
            const label = $(elem).text().trim().toLowerCase();
            if (label.includes('total floor area') || label.includes('floor area')) {
                const value = $(elem).next('dd').text().trim();
                const match = value.match(/(\d+(?:\.\d+)?)/);
                if (match) {
                    floorArea = parseFloat(match[1]);
                    log.info(`Found floor area (dt/dd): ${floorArea} sqm`);
                    return false; // break
                }
            }
        });
        
        // Method 2: Look for text containing "floor area" and extract number
        if (!floorArea) {
            $('p, div, span, td, th').each((i, elem) => {
                const text = $(elem).text().trim();
                if (text.toLowerCase().includes('total floor area') || text.toLowerCase().includes('floor area')) {
                    const match = text.match(/(\d+(?:\.\d+)?)\s*(?:m²|m2|square\s+metres?|sqm)/i);
                    if (match) {
                        floorArea = parseFloat(match[1]);
                        log.info(`Found floor area (text search): ${floorArea} sqm`);
                        return false; // break
                    }
                }
            });
        }
        
        // Method 3: Look in table rows for floor area
        if (!floorArea) {
            $('tr').each((i, elem) => {
                const rowText = $(elem).text().trim().toLowerCase();
                if (rowText.includes('floor area')) {
                    const cells = $(elem).find('td');
                    if (cells.length > 1) {
                        const value = cells.last().text().trim();
                        const match = value.match(/(\d+(?:\.\d+)?)/);
                        if (match) {
                            floorArea = parseFloat(match[1]);
                            log.info(`Found floor area (table): ${floorArea} sqm`);
                            return false; // break
                        }
                    }
                }
            });
        }
        
        if (floorArea && floorArea > 0) {
            log.info(`Successfully scraped floor area: ${floorArea} sqm from ${certificateURL}`);
            return floorArea;
        } else {
            log.warning(`Could not find floor area in certificate page: ${certificateURL}`);
            return null;
        }
        
    } catch (error) {
        log.warning(`Failed to scrape floor area from certificate: ${error.message}`);
        return null;
    }
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
            // ENHANCEMENT D: Scrape floor area from certificate if URL is available
            if (apiData.certificateURL && !apiData.floorArea) {
                const scrapedFloorArea = await scrapeFloorAreaFromCertificate(apiData.certificateURL);
                if (scrapedFloorArea) {
                    apiData.floorArea = scrapedFloorArea;
                }
            }
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
            
            // ENHANCEMENT D: Scrape floor area from certificate if URL is available
            let floorArea = null;
            if (certificateURL) {
                floorArea = await scrapeFloorAreaFromCertificate(certificateURL);
            }
            
            return { 
                rating: epcRating, 
                certificateURL: certificateURL || null,
                floorArea: floorArea,
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
    findBestAddressMatchFromScrapedData,
    scrapeFloorAreaFromCertificate,
    extractHouseNumber,
    scoreHouseNumberMatch
};