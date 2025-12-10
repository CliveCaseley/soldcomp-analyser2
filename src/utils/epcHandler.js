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
 * REWRITE v4.0: Get certificate number with strict address verification
 * Uses web scraping + individual certificate verification for accuracy
 * 
 * NEW APPROACH:
 * 1. Scrape certificate numbers from postcode search page
 * 2. For each certificate, fetch full data from certificate page (including exact address)
 * 3. Compare certificate address with property address using exact house number matching
 * 4. Only return match if addresses match exactly
 * 5. If multiple matches, use floor area (if known) as tie-breaker
 * 
 * @param {string} postcode - Property postcode
 * @param {string} address - Property address for matching
 * @param {string} apiKey - EPC API key (optional, kept for compatibility but not used)
 * @param {number} knownFloorArea - Optional floor area in sqm for better matching when multiple certificates exist
 * @returns {Promise<Object|null>} Certificate data with number or null
 */
async function getCertificateNumber(postcode, address, apiKey = null, knownFloorArea = null) {
    log.info('═'.repeat(80));
    log.info('🔎 EPC CERTIFICATE LOOKUP v4.0 (STRICT VERIFICATION)');
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
    log.info(`🏠 Property Address: "${address}"`);
    log.info('');
    
    try {
        // STEP 1: Scrape certificate numbers from postcode search page
        const certificates = await scrapeCertificateNumbersFromPostcode(postcode);
        
        if (certificates.length === 0) {
            log.warning('❌ No certificates found for postcode');
            log.info('═'.repeat(80));
            return null;
        }
        
        log.info(`📊 Found ${certificates.length} certificates for postcode`);
        log.info('');
        
        // STEP 2: Extract property house number for matching
        const propertyHouseNum = extractHouseNumber(address);
        log.info(`🔢 Property House Number:`);
        log.info(`   Primary: ${propertyHouseNum.primary || 'NONE'}`);
        log.info(`   Flat/Suffix: ${propertyHouseNum.flat || 'NONE'}`);
        log.info('');
        
        if (!propertyHouseNum.primary) {
            log.warning('❌ Cannot extract house number from property address');
            log.info('═'.repeat(80));
            return null;
        }
        
        // STEP 3: Check each certificate by scraping its page for exact address
        log.info('🔍 Checking certificates for exact address match...');
        log.info('');
        
        const normalizedPropertyAddr = normalizeTextForMatching(address);
        const propertyWords = normalizedPropertyAddr.split(/\s+/).filter(w => w.length > 2);
        
        const matchingCertificates = []; // Collect ALL matches instead of returning first one
        
        for (let i = 0; i < certificates.length; i++) {
            const cert = certificates[i];
            log.info(`─`.repeat(80));
            log.info(`📄 Certificate ${i + 1}/${certificates.length}: ${cert.certificateNumber}`);
            log.info(`   Search Page Address: "${cert.address}"`);
            
            // Scrape full certificate data including exact address
            const certData = await scrapeCertificateData(cert.href);
            
            if (!certData.address) {
                log.warning(`   ⚠️ Could not extract address from certificate page`);
                continue;
            }
            
            log.info(`   📮 Certificate Page Address: "${certData.address}"`);
            
            // Extract house number from certificate address
            const certHouseNum = extractHouseNumber(certData.address);
            log.info(`   🔢 Certificate House#: ${certHouseNum.primary}${certHouseNum.flat || ''}`);
            
            // Check for exact house number match
            const matchResult = isExactHouseNumberMatch(propertyHouseNum, certHouseNum);
            log.info(`   ${matchResult.isExactMatch ? '✅' : '❌'} House Number: ${matchResult.matchType}`);
            
            if (!matchResult.isExactMatch) {
                log.info(`   ⏭️  Skipping - house number doesn't match`);
                continue;
            }
            
            // House number matches - verify street name similarity
            const normalizedCertAddr = normalizeTextForMatching(certData.address);
            const certWords = normalizedCertAddr.split(/\s+/).filter(w => w.length > 2);
            const wordMatches = propertyWords.filter(word => certWords.includes(word));
            const streetSimilarity = propertyWords.length > 0 ? wordMatches.length / propertyWords.length : 0;
            
            log.info(`   📍 Street Similarity: ${(streetSimilarity * 100).toFixed(1)}%`);
            
            const MIN_STREET_SIMILARITY = 0.3;
            if (streetSimilarity < MIN_STREET_SIMILARITY) {
                log.info(`   ⏭️  Skipping - street name too different (need ${(MIN_STREET_SIMILARITY * 100).toFixed(1)}%)`);
                continue;
            }
            
            // This is a valid match - add to list
            log.info(`   ✅ VALID MATCH - added to candidates`);
            matchingCertificates.push({
                cert: cert,
                certData: certData,
                matchResult: matchResult,
                streetSimilarity: streetSimilarity
            });
        }
        
        log.info('');
        log.info(`📊 Found ${matchingCertificates.length} matching certificate(s)`);
        
        // If no matches found, return null
        if (matchingCertificates.length === 0) {
            log.info('');
            log.info('❌ ═══════════════════════════════════════════════════════════════════════════');
            log.info('❌ NO EXACT MATCH FOUND');
            log.info('❌ ═══════════════════════════════════════════════════════════════════════════');
            log.info(`   Checked ${certificates.length} certificates`);
            log.info(`   Property: "${address}"`);
            log.info(`   None had exact house number + street match`);
            log.info('   🚫 Returning NULL - better no data than wrong data');
            log.info('═'.repeat(80));
            return null;
        }
        
        // If only one match, return it
        if (matchingCertificates.length === 1) {
            const match = matchingCertificates[0];
            log.info('');
            log.info('✅ ═══════════════════════════════════════════════════════════════════════════');
            log.info('✅ SINGLE EXACT MATCH FOUND!');
            log.info('✅ ═══════════════════════════════════════════════════════════════════════════');
            log.info(`   Certificate: ${match.cert.certificateNumber}`);
            log.info(`   Property Address: "${address}"`);
            log.info(`   Certificate Address: "${match.certData.address}"`);
            log.info(`   Rating: ${match.certData.rating || 'N/A'}`);
            log.info(`   Floor Area: ${match.certData.floorArea ? match.certData.floorArea + ' sqm' : 'N/A'}`);
            log.info(`   Match Type: ${match.matchResult.matchType}`);
            log.info(`   Street Similarity: ${(match.streetSimilarity * 100).toFixed(1)}%`);
            log.info('═'.repeat(80));
            
            return {
                certificateNumber: match.cert.certificateNumber,
                certificateURL: match.cert.href,
                rating: match.certData.rating,
                floorArea: match.certData.floorArea,
                address: match.certData.address,
                matchStatus: 'Exact Match',
                matchDetails: {
                    matchType: match.matchResult.matchType,
                    streetSimilarity: match.streetSimilarity,
                    certificateAddress: match.certData.address,
                    propertyAddress: address
                }
            };
        }
        
        // Multiple matches found - need to pick the best one
        // Prioritize: 1) floor area match (if known), 2) addresses WITHOUT property names, 3) better street similarity
        log.info('');
        log.info('⚠️ ═══════════════════════════════════════════════════════════════════════════');
        log.info('⚠️  MULTIPLE MATCHES FOUND - Selecting best match');
        log.info('⚠️ ═══════════════════════════════════════════════════════════════════════════');
        if (knownFloorArea) {
            log.info(`   Known Floor Area: ${knownFloorArea} sqm (will use for matching)`);
        }
        log.info('');
        
        matchingCertificates.forEach((match, idx) => {
            log.info(`   ${idx + 1}. ${match.cert.certificateNumber}`);
            log.info(`      Address: "${match.certData.address}"`);
            log.info(`      Rating: ${match.certData.rating}, Floor Area: ${match.certData.floorArea} sqm`);
            log.info(`      Street Similarity: ${(match.streetSimilarity * 100).toFixed(1)}%`);
        });
        
        let bestMatch = null;
        let bestScore = -1;
        let selectionReason = '';
        
        for (const match of matchingCertificates) {
            let score = match.streetSimilarity; // Base score from street similarity
            let reasons = [];
            
            // PRIORITY 1: If floor area is known, heavily weight exact matches
            if (knownFloorArea && match.certData.floorArea) {
                const floorDiff = Math.abs(match.certData.floorArea - knownFloorArea);
                if (floorDiff === 0) {
                    score += 10; // Exact floor area match is VERY strong signal
                    reasons.push('exact floor area match');
                } else if (floorDiff <= 2) {
                    score += 5; // Within 2 sqm is also very good
                    reasons.push('floor area within 2 sqm');
                } else if (floorDiff <= 5) {
                    score += 2; // Within 5 sqm is okay
                    reasons.push('floor area within 5 sqm');
                }
            }
            
            // PRIORITY 2: Prefer addresses without property names (slightly)
            const hasPropertyName = match.certData.address.match(/^[a-z\s]+,\s*\d+/i);
            if (!hasPropertyName) {
                score += 0.5;
                reasons.push('no property name');
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = match;
                selectionReason = reasons.join(', ') || 'best street similarity';
            }
        }
        
        log.info('');
        log.info('✅ SELECTED BEST MATCH:');
        log.info(`   Certificate: ${bestMatch.cert.certificateNumber}`);
        log.info(`   Address: "${bestMatch.certData.address}"`);
        log.info(`   Rating: ${bestMatch.certData.rating}`);
        log.info(`   Floor Area: ${bestMatch.certData.floorArea} sqm`);
        log.info(`   Selection Reason: ${selectionReason}`);
        log.info('═'.repeat(80));
        
        return {
            certificateNumber: bestMatch.cert.certificateNumber,
            certificateURL: bestMatch.cert.href,
            rating: bestMatch.certData.rating,
            floorArea: bestMatch.certData.floorArea,
            address: bestMatch.certData.address,
            matchStatus: matchingCertificates.length > 1 ? 'Multiple Matches' : 'Exact Match',
            matchDetails: {
                matchType: bestMatch.matchResult.matchType,
                streetSimilarity: bestMatch.streetSimilarity,
                certificateAddress: bestMatch.certData.address,
                propertyAddress: address,
                totalMatches: matchingCertificates.length,
                allMatches: matchingCertificates.map(m => ({
                    certificateNumber: m.cert.certificateNumber,
                    address: m.certData.address,
                    rating: m.certData.rating,
                    floorArea: m.certData.floorArea
                }))
            }
        };
        
    } catch (error) {
        log.warning(`❌ Failed to get certificate number: ${error.message}`);
        log.error(error.stack);
        log.info('═'.repeat(80));
        return null;
    }
}

/**
 * Extract house number from address string
 * Handles various formats: "32", "32a", "32A", "Flat 1, 32", "32-34", "Spen Lea, 317 Street", etc.
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
    
    // Pattern 2: Property name followed by number, e.g., "Spen Lea, 317 Wharf Road" or "Akland House, 303 Street"
    // Look for: word(s), comma, number
    const propertyNamePattern = /^[a-z\s]+,\s*(\d+[a-z]?)\b/i;
    const propertyNameMatch = normalized.match(propertyNamePattern);
    if (propertyNameMatch) {
        const houseNum = propertyNameMatch[1];
        // Check if it has a letter suffix
        const letterCheck = houseNum.match(/^(\d+)([a-z])$/i);
        if (letterCheck) {
            return {
                primary: letterCheck[1],
                flat: letterCheck[2],
                hasRange: false
            };
        }
        return {
            primary: houseNum,
            flat: null,
            hasRange: false
        };
    }
    
    // Pattern 3: "32a Street" or "32A Street" (house number with letter suffix at start)
    const letterSuffixPattern = /^(\d+)([a-z])\b/i;
    const letterMatch = normalized.match(letterSuffixPattern);
    if (letterMatch) {
        return {
            primary: letterMatch[1],
            flat: letterMatch[2],
            hasRange: false
        };
    }
    
    // Pattern 4: "32-34 Street" (range)
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
    
    // Pattern 5: Simple "32 Street" (just extract leading number)
    const simplePattern = /^(\d+)\b/;
    const simpleMatch = normalized.match(simplePattern);
    if (simpleMatch) {
        return {
            primary: simpleMatch[1],
            flat: null,
            hasRange: false
        };
    }
    
    // Pattern 6: Number after comma anywhere in address (last resort for addresses like "Name, Name, 32 Street")
    // Look for comma followed by number
    const commaNumberPattern = /,\s*(\d+[a-z]?)\b/i;
    const commaNumberMatch = normalized.match(commaNumberPattern);
    if (commaNumberMatch) {
        const houseNum = commaNumberMatch[1];
        // Check if it has a letter suffix
        const letterCheck = houseNum.match(/^(\d+)([a-z])$/i);
        if (letterCheck) {
            return {
                primary: letterCheck[1],
                flat: letterCheck[2],
                hasRange: false
            };
        }
        return {
            primary: houseNum,
            flat: null,
            hasRange: false
        };
    }
    
    return { primary: null, flat: null, hasRange: false };
}

/**
 * Check if two house number objects match EXACTLY
 * CRITICAL FIX v3.0: STRICT exact matching only - NO fuzzy matching, NO partial matches
 * Better to have NO EPC data than WRONG EPC data
 * 
 * @param {Object} target - Target house number object
 * @param {Object} candidate - Candidate house number object
 * @returns {Object} {isExactMatch: boolean, matchType: string}
 */
function isExactHouseNumberMatch(target, candidate) {
    if (!target.primary || !candidate.primary) {
        return { isExactMatch: false, matchType: 'missing_house_number' };
    }
    
    // RULE 1: Primary house numbers MUST match exactly
    if (target.primary !== candidate.primary) {
        return { isExactMatch: false, matchType: 'different_house_number' };
    }
    
    // RULE 2: If target has flat/letter suffix, candidate must have the SAME suffix
    if (target.flat && candidate.flat) {
        if (target.flat === candidate.flat) {
            return { isExactMatch: true, matchType: 'exact_with_flat' };
        } else {
            return { isExactMatch: false, matchType: 'different_flat' };
        }
    }
    
    // RULE 3: If target has no flat, but candidate does - this could be ambiguous
    // Example: Target "32 Street" could match "32a Street" or "32b Street"
    // For safety, we mark this as ambiguous but allow it (treat whole building as match)
    if (!target.flat && candidate.flat) {
        return { isExactMatch: true, matchType: 'target_whole_building' };
    }
    
    // RULE 4: If candidate has no flat, target shouldn't have one either
    if (target.flat && !candidate.flat) {
        return { isExactMatch: false, matchType: 'target_has_flat_certificate_doesnt' };
    }
    
    // Perfect match - same primary number, no flats
    return { isExactMatch: true, matchType: 'exact_match' };
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
 * VERSION 3.0: STRICT EXACT HOUSE NUMBER MATCHING ONLY
 * 
 * CRITICAL CHANGE: No fuzzy matching, no partial matches, no scoring thresholds
 * - First filter to certificates with EXACT house number match
 * - If no exact matches found, return null (better no data than wrong data)
 * - Among exact matches, use street name similarity to pick the best one
 * - Returns object with certificate AND match status for transparency
 * 
 * @param {Array} certificates - Array of certificate objects from scraping
 * @param {string} targetAddress - Target address to match
 * @returns {Object|null} {certificate: Object, matchStatus: string, matchDetails: Object} or null
 */
function findBestAddressMatchFromScrapedData(certificates, targetAddress) {
    // DEFENSIVE: Check for empty certificates array
    if (!certificates || certificates.length === 0) {
        log.warning('⚠️ No certificates provided to match against');
        return null;
    }
    
    // DEFENSIVE: Check for missing target address
    if (!targetAddress || targetAddress.trim() === '') {
        log.warning('⚠️ No target address provided - cannot match without address');
        return null;
    }
    
    log.info('═'.repeat(80));
    log.info('🔍 STRICT EXACT HOUSE NUMBER MATCHING (v3.0)');
    log.info('═'.repeat(80));
    log.info(`🏠 Target address: "${targetAddress}"`);
    log.info(`📋 Total certificates available: ${certificates.length}`);
    log.info('');
    
    const normalizedTarget = normalizeTextForMatching(targetAddress);
    const targetHouseNum = extractHouseNumber(targetAddress);
    
    log.info(`🔢 Extracted target house number:`);
    log.info(`   Primary: ${targetHouseNum.primary || 'NONE'}`);
    log.info(`   Flat/Suffix: ${targetHouseNum.flat || 'NONE'}`);
    log.info(`   Has Range: ${targetHouseNum.hasRange}`);
    log.info('');
    
    // STEP 1: Filter to certificates with EXACT house number match
    log.info('📌 STEP 1: Filtering for EXACT house number matches...');
    const exactMatches = [];
    
    for (const cert of certificates) {
        const certAddress = cert.address;
        const certHouseNum = extractHouseNumber(certAddress);
        const matchResult = isExactHouseNumberMatch(targetHouseNum, certHouseNum);
        
        log.info(`  🔍 "${certAddress.substring(0, 50)}..."`);
        log.info(`     Cert House#: ${certHouseNum.primary}${certHouseNum.flat || ''}`);
        log.info(`     Match Result: ${matchResult.isExactMatch ? '✅' : '❌'} (${matchResult.matchType})`);
        
        if (matchResult.isExactMatch) {
            exactMatches.push({
                cert: cert,
                certHouseNum: certHouseNum,
                matchType: matchResult.matchType,
                certAddress: certAddress
            });
        }
    }
    
    log.info('');
    log.info(`📊 EXACT MATCHES FOUND: ${exactMatches.length}`);
    log.info('');
    
    // STEP 2: If no exact matches, return null
    if (exactMatches.length === 0) {
        log.warning('❌ NO EXACT HOUSE NUMBER MATCHES FOUND');
        log.warning('🚫 Returning NULL - better to have no EPC data than wrong EPC data');
        log.info('═'.repeat(80));
        return null;
    }
    
    // STEP 3: If only one exact match, verify street similarity before accepting
    if (exactMatches.length === 1) {
        const match = exactMatches[0];
        
        // Calculate street similarity for the single match
        const normalizedCertAddr = normalizeTextForMatching(match.certAddress);
        const targetWords = normalizedTarget.split(/\s+/).filter(w => w.length > 2);
        const certWords = normalizedCertAddr.split(/\s+/).filter(w => w.length > 2);
        const wordMatches = targetWords.filter(word => certWords.includes(word));
        const streetScore = targetWords.length > 0 ? wordMatches.length / targetWords.length : 0;
        
        const MIN_STREET_SIMILARITY = 0.3; // At least 30% of words must match
        
        if (streetScore < MIN_STREET_SIMILARITY) {
            log.warning('❌ SINGLE MATCH BUT STREET NAME MISMATCH');
            log.warning(`   Street similarity: ${(streetScore * 100).toFixed(1)}%`);
            log.warning(`   Minimum required: ${(MIN_STREET_SIMILARITY * 100).toFixed(1)}%`);
            log.warning(`   House number matches but streets are different: "${targetAddress}" vs "${match.certAddress}"`);
            log.warning('🚫 Returning NULL - likely different properties with same house number');
            log.info('═'.repeat(80));
            return null;
        }
        
        log.info('✅ SINGLE EXACT MATCH - Using this certificate');
        log.info(`   Address: "${match.certAddress}"`);
        log.info(`   Certificate: ${match.cert.certificateNumber}`);
        log.info(`   Match Type: ${match.matchType}`);
        log.info(`   Street similarity: ${(streetScore * 100).toFixed(1)}%`);
        log.info('═'.repeat(80));
        
        return {
            certificate: match.cert,
            matchStatus: 'Exact Match',
            matchDetails: {
                matchType: match.matchType,
                candidateCount: certificates.length,
                exactMatchCount: 1,
                streetSimilarity: streetScore
            }
        };
    }
    
    // STEP 4: Multiple exact matches - use street name similarity to pick best one
    log.info('⚠️ MULTIPLE EXACT MATCHES - Comparing street names...');
    log.info('');
    
    const targetWords = normalizedTarget.split(/\s+/).filter(w => w.length > 2);
    let bestMatch = null;
    let bestStreetScore = 0;
    
    for (const match of exactMatches) {
        const normalizedCertAddr = normalizeTextForMatching(match.certAddress);
        const certWords = normalizedCertAddr.split(/\s+/).filter(w => w.length > 2);
        const wordMatches = targetWords.filter(word => certWords.includes(word));
        const streetScore = targetWords.length > 0 ? wordMatches.length / targetWords.length : 0;
        
        log.info(`  📍 "${match.certAddress}"`);
        log.info(`     Street similarity: ${(streetScore * 100).toFixed(1)}%`);
        
        if (streetScore > bestStreetScore) {
            bestStreetScore = streetScore;
            bestMatch = match;
        }
    }
    
    log.info('');
    
    // CRITICAL FIX v3.0: Require minimum street similarity to prevent wrong street matches
    // Even with exact house number, we need SOME street name overlap to be confident
    // Example: "3 Willow Close" should NOT match "3 Westgate Road"
    const MIN_STREET_SIMILARITY = 0.3; // At least 30% of words must match
    
    if (bestStreetScore < MIN_STREET_SIMILARITY) {
        log.warning('❌ STREET NAME MISMATCH');
        log.warning(`   Best street similarity: ${(bestStreetScore * 100).toFixed(1)}%`);
        log.warning(`   Minimum required: ${(MIN_STREET_SIMILARITY * 100).toFixed(1)}%`);
        log.warning('   House number matches but street names are too different');
        log.warning('🚫 Returning NULL - likely different properties with same house number');
        log.info('═'.repeat(80));
        return null;
    }
    
    // Check for ambiguity - if multiple matches have same street score, flag it
    const sameScoreMatches = exactMatches.filter(m => {
        const normalizedCertAddr = normalizeTextForMatching(m.certAddress);
        const certWords = normalizedCertAddr.split(/\s+/).filter(w => w.length > 2);
        const wordMatches = targetWords.filter(word => certWords.includes(word));
        const streetScore = targetWords.length > 0 ? wordMatches.length / targetWords.length : 0;
        return Math.abs(streetScore - bestStreetScore) < 0.01; // Same score within 1%
    });
    
    if (sameScoreMatches.length > 1) {
        log.warning('⚠️ AMBIGUOUS: Multiple certificates have same house number AND similar street names');
        log.warning(`   Found ${sameScoreMatches.length} equally good matches`);
        sameScoreMatches.forEach((m, idx) => {
            log.warning(`   ${idx + 1}. ${m.certAddress}`);
        });
        log.warning('   Using first match but flagging as ambiguous for manual review');
        log.info('═'.repeat(80));
        
        return {
            certificate: bestMatch.cert,
            matchStatus: 'Ambiguous',
            matchDetails: {
                matchType: bestMatch.matchType,
                candidateCount: certificates.length,
                exactMatchCount: exactMatches.length,
                ambiguousCount: sameScoreMatches.length,
                ambiguousAddresses: sameScoreMatches.map(m => m.certAddress)
            }
        };
    }
    
    // Clear winner
    log.info('✅ BEST MATCH SELECTED');
    log.info(`   Address: "${bestMatch.certAddress}"`);
    log.info(`   Certificate: ${bestMatch.cert.certificateNumber}`);
    log.info(`   Match Type: ${bestMatch.matchType}`);
    log.info(`   Street similarity: ${(bestStreetScore * 100).toFixed(1)}%`);
    log.info('═'.repeat(80));
    
    return {
        certificate: bestMatch.cert,
        matchStatus: 'Exact Match',
        matchDetails: {
            matchType: bestMatch.matchType,
            candidateCount: certificates.length,
            exactMatchCount: exactMatches.length,
            streetSimilarity: bestStreetScore
        }
    };
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
 * REWRITE v4.0: Fetch EPC data using web scraping with strict verification
 * Uses the new getCertificateNumber function which includes:
 * - Strict address verification from certificate page
 * - Rating extraction from structured HTML
 * - Floor area extraction from structured HTML
 * - Floor area matching for tie-breaking when multiple certificates exist
 * 
 * @param {string} postcode - Property postcode
 * @param {string} address - Property address
 * @param {string} apiKey - EPC API key (optional, kept for compatibility but not used)
 * @param {number} knownFloorArea - Optional known floor area in sqm for better matching
 * @returns {Object} EPC data with certificate URL, rating, floor area
 */
async function fetchEPCDataViaAPI(postcode, address, apiKey = null, knownFloorArea = null) {
    log.info(`Fetching EPC data via web scraping (v4.0) for: ${address}, ${postcode}`);
    if (knownFloorArea) {
        log.info(`  Known floor area: ${knownFloorArea} sqm (will use for matching)`);
    }
    
    try {
        // Use new approach: getCertificateNumber now includes full certificate verification
        const certData = await getCertificateNumber(postcode, address, apiKey, knownFloorArea);
        
        if (certData) {
            log.info(`Found EPC via web scraping:`);
            log.info(`  Certificate: ${certData.certificateNumber}`);
            log.info(`  Rating: ${certData.rating || 'N/A'}`);
            log.info(`  Floor Area: ${certData.floorArea ? certData.floorArea + ' sqm' : 'N/A'}`);
            log.info(`  Match Status: ${certData.matchStatus || 'N/A'}`);
            
            return {
                rating: certData.rating,
                certificateURL: certData.certificateURL,
                certificateNumber: certData.certificateNumber,
                floorArea: certData.floorArea, // Now included from certificate page
                matchStatus: certData.matchStatus,
                matchDetails: certData.matchDetails
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
 * REWRITE v4.0: Scrape EPC data from certificate page using structured HTML
 * Uses reliable HTML structure: epc-address, epc-rating-result, govuk-summary-list
 * This is MUCH simpler and more reliable than previous SVG/fallback approaches
 * 
 * @param {string} certificateURL - Full URL to EPC certificate page
 * @returns {Promise<Object>} {address: string, rating: string, floorArea: number} or null values
 */
async function scrapeCertificateData(certificateURL) {
    if (!certificateURL) {
        log.warning('Cannot scrape certificate: missing URL');
        return { address: null, rating: null, floorArea: null };
    }
    
    log.info(`🔍 Scraping certificate data from: ${certificateURL}`);
    
    try {
        const response = await axios.get(certificateURL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        // Extract certificate address from structured HTML
        let certificateAddress = null;
        const addressElem = $('.epc-address.govuk-body, p.epc-address');
        if (addressElem.length > 0) {
            // Get HTML and replace <br> with commas for parsing
            const addressHtml = addressElem.html() || '';
            certificateAddress = addressHtml
                .replace(/<br\s*\/?>/gi, ', ')
                .replace(/<[^>]+>/g, '') // Remove any other HTML tags
                .trim();
            log.info(`📮 Certificate Address: "${certificateAddress}"`);
        } else {
            log.warning('⚠️ Could not find certificate address (.epc-address)');
        }
        
        // Extract rating from structured HTML (plain text, not SVG)
        let rating = null;
        const ratingElem = $('.epc-rating-result.govuk-body, p.epc-rating-result');
        if (ratingElem.length > 0) {
            const ratingText = ratingElem.text().trim().toUpperCase();
            // Expect single letter A-G
            if (/^[A-G]$/.test(ratingText)) {
                rating = ratingText;
                log.info(`⭐ Certificate Rating: ${rating}`);
            } else {
                log.warning(`⚠️ Found .epc-rating-result but text doesn't match A-G: "${ratingText}"`);
            }
        } else {
            log.warning('⚠️ Could not find rating element (.epc-rating-result)');
        }
        
        // Extract floor area from summary list
        let floorArea = null;
        $('dt').each((i, elem) => {
            const label = $(elem).text().trim().toLowerCase();
            if (label.includes('total floor area')) {
                const valueElem = $(elem).next('dd');
                if (valueElem.length > 0) {
                    const valueText = valueElem.text().trim();
                    // Match number before "square metres"
                    const match = valueText.match(/(\d+(?:\.\d+)?)\s*square metres?/i);
                    if (match) {
                        floorArea = parseFloat(match[1]);
                        log.info(`📐 Floor Area: ${floorArea} square metres`);
                        return false; // break
                    }
                }
            }
        });
        
        if (!floorArea) {
            log.warning('⚠️ Could not find floor area in certificate');
        }
        
        return {
            address: certificateAddress,
            rating: rating,
            floorArea: floorArea
        };
        
    } catch (error) {
        log.error(`❌ Failed to scrape certificate data: ${error.message}`);
        return { address: null, rating: null, floorArea: null };
    }
}

/**
 * BACKWARD COMPATIBILITY: Scrape EPC rating from certificate page
 * Now uses the new scrapeCertificateData function
 * 
 * @param {string} certificateURL - Full URL to EPC certificate page
 * @returns {Promise<string|null>} Energy rating (A-G) or null if not found
 */
async function scrapeRatingFromCertificate(certificateURL) {
    const data = await scrapeCertificateData(certificateURL);
    return data.rating;
}

/**
 * BACKWARD COMPATIBILITY: Scrape floor area from EPC certificate page
 * Now uses the new scrapeCertificateData function
 * 
 * @param {string} certificateURL - Full URL to EPC certificate page
 * @returns {Promise<number|null>} Floor area in square meters, or null if not found
 */
async function scrapeFloorAreaFromCertificate(certificateURL) {
    const data = await scrapeCertificateData(certificateURL);
    return data.floorArea;
}

/**
 * Try to scrape EPC rating for a property (fallback method)
 * 
 * REWRITE v4.0: Enhanced with structured HTML parsing and floor area matching
 * 
 * @param {string} postcode - Property postcode
 * @param {string} address - Property address
 * @param {string} apiKey - EPC API key (optional)
 * @param {number} knownFloorArea - Optional known floor area in sqm for better matching
 * @returns {Object} EPC data or null
 */
async function scrapeEPCData(postcode, address, apiKey = null, knownFloorArea = null) {
    log.info(`Attempting to fetch EPC data for: ${address}, ${postcode}`);
    
    // Try API first if key available (API mode uses fetchEPCDataViaAPI which includes full scraping)
    if (apiKey) {
        const apiData = await fetchEPCDataViaAPI(postcode, address, apiKey, knownFloorArea);
        if (apiData) {
            // Floor area is now extracted during certificate verification
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
    scrapeCertificateData,
    fetchEPCDataViaAPI,
    extractHouseNumber,
    isExactHouseNumberMatch,
    normalizeTextForMatching
};