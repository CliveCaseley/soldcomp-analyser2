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
    log.info('═'.repeat(80));
    log.info('🔎 EPC CERTIFICATE LOOKUP');
    log.info('═'.repeat(80));
    
    if (!postcode) {
        log.warning('⚠️ Cannot look up certificate number: missing postcode');
        return null;
    }
    
    if (!address) {
        log.warning('⚠️ Cannot look up certificate number: missing address');
        return null;
    }
    
    log.info(`📮 Postcode: ${postcode}`);
    log.info(`🏠 Address: "${address}"`);
    log.info(`🌐 Looking up certificate number via web scraping...`);
    log.info('');
    
    try {
        // Scrape certificate numbers from postcode search page
        const certificates = await scrapeCertificateNumbersFromPostcode(postcode);
        
        if (certificates.length === 0) {
            log.warning('❌ No certificates found for postcode');
            return null;
        }
        
        log.info(`📊 Found ${certificates.length} certificates for postcode ${postcode}`);
        log.info('');
        
        // Find best matching address
        const bestMatch = findBestAddressMatchFromScrapedData(certificates, address);
        
        if (bestMatch) {
            log.info('');
            log.info('✅ CERTIFICATE LOOKUP SUCCESS');
            log.info(`   Certificate: ${bestMatch.certificateNumber}`);
            log.info(`   Address: "${bestMatch.address}"`);
            log.info(`   URL: ${bestMatch.href}`);
            log.info('═'.repeat(80));
            
            return {
                certificateNumber: bestMatch.certificateNumber,
                certificateURL: bestMatch.href,
                rating: bestMatch.rating,
                address: bestMatch.address
            };
        }
        
        // CRITICAL FIX: No fallback to prevent incorrect matches
        // If no good match found, return null (property has no EPC)
        log.warning('⚠️ findBestAddressMatchFromScrapedData returned null');
        log.warning('⚠️ No EPC certificate found for this property');
        log.info('═'.repeat(80));
        return null;
        
    } catch (error) {
        log.warning(`❌ Failed to get certificate number: ${error.message}`);
        log.error(error.stack);
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
 * CRITICAL FIX: Stricter matching to prevent incorrect matches (e.g., 307 to 303)
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
    
    // CRITICAL FIX: No partial credit for different house numbers
    // Previously, similar street names could give a match even with wrong house number
    // This caused 307 to match with 303 incorrectly
    return 0; // No match if house numbers don't match exactly
}

/**
 * Normalize text for matching by removing punctuation and extra whitespace
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeTextForMatching(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/[,;:.!?]/g, ' ') // Replace punctuation with spaces
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim();
}

/**
 * Find best matching address from scraped certificate data
 * IMPROVED VERSION (v2.6): Enhanced punctuation handling and logging
 * 
 * @param {Array} certificates - Array of certificate objects from scraping
 * @param {string} targetAddress - Target address to match
 * @returns {Object} Best matching certificate or null
 */
function findBestAddressMatchFromScrapedData(certificates, targetAddress) {
    // DEFENSIVE: Check for empty certificates array
    if (!certificates || certificates.length === 0) {
        log.warning('⚠️ No certificates provided to match against');
        return null;
    }
    
    // DEFENSIVE: Check for missing target address
    if (!targetAddress || targetAddress.trim() === '') {
        log.warning('⚠️ No target address provided, returning first certificate as fallback');
        return certificates[0];
    }
    
    log.info(`🔍 Matching target address: "${targetAddress}"`);
    log.info(`📋 Total certificates to compare: ${certificates.length}`);
    
    const normalizedTarget = normalizeTextForMatching(targetAddress);
    const targetHouseNum = extractHouseNumber(targetAddress);
    
    log.info(`🏠 Extracted target house number: ${JSON.stringify(targetHouseNum)}`);
    log.info(`📝 Normalized target: "${normalizedTarget}"`);
    
    let bestMatch = null;
    let bestScore = 0;
    let matchesWithScores = [];
    
    for (const cert of certificates) {
        const certAddress = cert.address;
        const normalizedCertAddr = normalizeTextForMatching(certAddress);
        const certHouseNum = extractHouseNumber(certAddress);
        
        // Calculate house number match score (weight: 70%)
        const houseNumScore = scoreHouseNumberMatch(targetHouseNum, certHouseNum);
        
        // Calculate street name match score (weight: 30%)
        // Improved: use normalized text (punctuation removed) and filter short words
        const targetWords = normalizedTarget.split(/\s+/).filter(w => w.length > 2);
        const certWords = normalizedCertAddr.split(/\s+/).filter(w => w.length > 2);
        const wordMatches = targetWords.filter(word => certWords.includes(word));
        const streetScore = targetWords.length > 0 ? wordMatches.length / targetWords.length : 0;
        
        // Combined score: prioritize house number matching (70/30 split)
        const totalScore = (houseNumScore * 0.7) + (streetScore * 0.3);
        
        // Store for debugging
        matchesWithScores.push({
            cert: cert,
            houseNum: certHouseNum.primary,
            totalScore: totalScore,
            houseNumScore: houseNumScore,
            streetScore: streetScore
        });
        
        log.info(`  📍 Candidate: "${cert.address}"`);
        log.info(`     House#: ${certHouseNum.primary}${certHouseNum.flat || ''}, Total: ${totalScore.toFixed(3)}, House: ${houseNumScore.toFixed(3)}, Street: ${streetScore.toFixed(3)}`);
        
        if (totalScore > bestScore) {
            bestScore = totalScore;
            bestMatch = cert;
        }
    }
    
    // Log top 5 matches for debugging
    log.info('');
    log.info('🏆 Top 5 Matches:');
    matchesWithScores
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 5)
        .forEach((m, idx) => {
            log.info(`  ${idx + 1}. House ${m.houseNum} - Score: ${m.totalScore.toFixed(3)} (house: ${m.houseNumScore.toFixed(3)}, street: ${m.streetScore.toFixed(3)})`);
        });
    log.info('');
    
    // CRITICAL FIX: Require minimum score of 0.5 to ensure house number matches
    // This prevents incorrect matches like 307 matching to 303
    // Since house number match is weighted 70%, exact match gives 0.7 minimum
    const SCORE_THRESHOLD = 0.5;
    
    if (bestScore >= SCORE_THRESHOLD && bestMatch) {
        log.info(`✅ Selected best match: "${bestMatch.address}"`);
        log.info(`   Certificate: ${bestMatch.certificateNumber}`);
        log.info(`   Final Score: ${bestScore.toFixed(3)}`);
        return bestMatch;
    } else {
        log.warning(`❌ No good match found (best score: ${bestScore.toFixed(3)}, threshold: ${SCORE_THRESHOLD})`);
        log.warning(`⚠️ This usually means the property doesn't have an EPC certificate`);
        log.warning(`⚠️ Returning null instead of fallback to prevent incorrect matches`);
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
 * Fetch EPC data using web scraping (NEW APPROACH - v2.5)
 * Uses web scraping to extract certificate numbers directly from postcode search page
 * This is more reliable than the API which often doesn't return certificate-number
 * 
 * FINAL TASK 2: Enhanced with direct certificate page rating scraping
 * If rating is not found on postcode search page, scrapes individual certificate page
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
            let rating = certData.rating;
            
            // FINAL TASK 2: If rating not found on postcode search page, scrape certificate page
            if (!rating && certData.certificateURL) {
                log.info(`⚠️ Rating not found on postcode search, attempting to scrape from certificate page...`);
                rating = await scrapeRatingFromCertificate(certData.certificateURL);
                if (rating) {
                    log.info(`✅ Successfully scraped rating from certificate: ${rating}`);
                }
            }
            
            log.info(`Found EPC via web scraping: Rating ${rating || 'N/A'}, Certificate #: ${certData.certificateNumber}`);
            log.info(`Certificate URL: ${certData.certificateURL}`);
            return {
                rating: rating,
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
 * FINAL TASK 2: Scrape EPC rating from certificate page
 * Extracts the energy efficiency rating (A-G) from individual EPC certificate pages
 * 
 * @param {string} certificateURL - Full URL to EPC certificate page
 * @returns {Promise<string|null>} Energy rating (A-G) or null if not found
 */
async function scrapeRatingFromCertificate(certificateURL) {
    if (!certificateURL) {
        return null;
    }
    
    log.info(`Scraping EPC rating from certificate: ${certificateURL}`);
    
    try {
        const response = await axios.get(certificateURL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        let rating = null;
        
        // Method 1: Look for energy rating in SVG title or text elements
        // The certificate page typically shows the rating in a large graphic
        $('svg text, .energy-rating-letter, .epc-rating, .rating-letter').each((i, elem) => {
            const text = $(elem).text().trim().toUpperCase();
            // Check if it's a single letter A-G
            if (/^[A-G]$/.test(text)) {
                rating = text;
                log.info(`Found EPC rating (SVG/class): ${rating}`);
                return false; // break
            }
        });
        
        // Method 2: Look for "Current energy rating" or "Energy rating" in dt/dd pairs
        // CRITICAL FIX: Exclude "potential rating" labels to avoid extracting future/potential ratings
        if (!rating) {
            $('dt').each((i, elem) => {
                const label = $(elem).text().trim().toLowerCase();
                
                // Skip potential ratings or improvement steps
                if (label.includes('potential') || 
                    label.includes('after completing') || 
                    label.includes('step ')) {
                    return true; // continue to next
                }
                
                if (label.includes('current energy rating') || 
                    label.includes('energy efficiency rating') ||
                    label === 'energy rating') {
                    const value = $(elem).next('dd').text().trim().toUpperCase();
                    // Extract letter from text like "D" or "Band D" or "Rating: D"
                    const match = value.match(/\b([A-G])\b/);
                    if (match) {
                        rating = match[1];
                        log.info(`Found EPC rating (dt/dd): ${rating}`);
                        return false; // break
                    }
                }
            });
        }
        
        // Method 3: Look for energy rating in heading tags or strong emphasis
        if (!rating) {
            $('h1, h2, h3, h4, h5, h6, strong, b').each((i, elem) => {
                const text = $(elem).text().trim();
                // Look for patterns like "Energy rating: D" or "Rating D" or just "D"
                if (text.toLowerCase().includes('energy rating') || 
                    text.toLowerCase().includes('current rating')) {
                    const match = text.toUpperCase().match(/\b([A-G])\b/);
                    if (match) {
                        rating = match[1];
                        log.info(`Found EPC rating (heading): ${rating}`);
                        return false; // break
                    }
                }
            });
        }
        
        // Method 4: Look for rating in table cells
        if (!rating) {
            $('td, th').each((i, elem) => {
                const cellText = $(elem).text().trim().toUpperCase();
                // Look for single letter A-G in cells
                if (/^[A-G]$/.test(cellText)) {
                    // Check if previous cell or label mentions "rating" or "efficiency"
                    const prevCell = $(elem).prev();
                    const prevText = prevCell.text().trim().toLowerCase();
                    if (prevText.includes('rating') || 
                        prevText.includes('efficiency') ||
                        prevText.includes('current')) {
                        rating = cellText;
                        log.info(`Found EPC rating (table): ${rating}`);
                        return false; // break
                    }
                }
            });
        }
        
        // Method 5: Look in the page content for "energy rating is X" pattern
        if (!rating) {
            const bodyText = $('body').text();
            
            // Pattern 1: "energy rating is X"
            let ratingMatch = bodyText.match(/energy\s+rating\s+is\s+([A-G])\b/i);
            if (ratingMatch) {
                rating = ratingMatch[1].toUpperCase();
                log.info(`Found EPC rating (energy rating is X): ${rating}`);
            }
            
            // Pattern 2: "Energy efficiency rating: X" or "rating X"
            if (!rating) {
                ratingMatch = bodyText.match(/energy\s+efficiency\s+rating[:\s]*([A-G])\b/i);
                if (ratingMatch) {
                    rating = ratingMatch[1].toUpperCase();
                    log.info(`Found EPC rating (energy efficiency rating): ${rating}`);
                }
            }
            
            // Pattern 3: Look in SVG description text (desc tag)
            if (!rating) {
                $('desc').each((i, elem) => {
                    const descText = $(elem).text();
                    const match = descText.match(/energy\s+rating\s+is\s+([A-G])\b/i);
                    if (match) {
                        rating = match[1].toUpperCase();
                        log.info(`Found EPC rating (SVG desc): ${rating}`);
                        return false; // break
                    }
                });
            }
        }
        
        if (rating) {
            log.info(`✅ Successfully scraped EPC rating: ${rating} from ${certificateURL}`);
            return rating;
        } else {
            log.warning(`⚠️ Could not find EPC rating in certificate page: ${certificateURL}`);
            return null;
        }
        
    } catch (error) {
        log.warning(`❌ Failed to scrape EPC rating from certificate: ${error.message}`);
        return null;
    }
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
 * 
 * FINAL TASK 2: Enhanced with direct certificate page rating scraping
 * If rating is not found via search, scrapes individual certificate page
 * 
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

        // FINAL TASK 2: If rating not found but have certificate URL, scrape from certificate page
        if (!epcRating && certificateURL) {
            log.info(`⚠️ Rating not found in search results, attempting to scrape from certificate page...`);
            epcRating = await scrapeRatingFromCertificate(certificateURL);
            if (epcRating) {
                log.info(`✅ Successfully scraped rating from certificate: ${epcRating}`);
            }
        }

        if (epcRating || certificateURL) {
            log.info(`Found EPC data via scraping: Rating ${epcRating || 'N/A'}`);
            
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
    // ═══════════════════════════════════════════════════════════
    // DEBUG LOGGING - Track EPC Lookup row creation
    // ═══════════════════════════════════════════════════════════
    log.info('🔍 CREATING EPC LOOKUP ROW');
    log.info(`   Postcode: ${targetPostcode}`);
    log.info(`   Address will be set to: "EPC Lookup"`);
    log.info('   ⚠️ WARNING: This is a special row that should NOT be merged with real properties!');
    
    const url = generateEPCSearchURL(targetPostcode);
    const epcLookupRow = {
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
        'needs_review': '',
        '_isEPCLookupRow': true  // Special marker to identify this row
    };
    
    log.info(`✅ EPC Lookup row created with URL: ${url}`);
    log.info('');
    
    return epcLookupRow;
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
    scrapeRatingFromCertificate,
    extractHouseNumber,
    scoreHouseNumberMatch,
    normalizeTextForMatching
};