const { log } = require('apify');

/**
 * DUPLICATE DETECTION MODULE
 * 
 * This module detects and merges duplicate property entries that arise from:
 * - Address variations: "45, Smith Street" vs "45, Smith Street, Scunthorpe DN15 7LQ"
 * - Different data sources: CSV input, Rightmove scraping, PropertyData scraping
 * - Incomplete vs enriched data: properties before/after PropertyData enrichment
 * 
 * KEY FEATURES:
 * 1. Advanced address normalization:
 *    - Removes postcodes from address field (already in separate column)
 *    - Removes city names (Scunthorpe, etc.)
 *    - Normalizes comma and whitespace usage
 *    - Case-insensitive matching
 * 
 * 2. Intelligent merge strategy:
 *    - Calculates completeness score for each duplicate
 *    - Prefers entries with PropertyData enrichment (Image_URL)
 *    - Keeps most complete data from both versions
 *    - Always preserves target property (isTarget flag)
 * 
 * 3. Data quality prioritization:
 *    - High priority: Price, Floor area (Sq. ft), PropertyData enrichment
 *    - Medium priority: Bedrooms, Address, Postcode
 *    - Avoids data with scrape errors
 * 
 * USAGE:
 *   const { detectAndMergeDuplicates } = require('./utils/duplicateDetector');
 *   properties = detectAndMergeDuplicates(properties);
 * 
 * See DUPLICATE_DETECTION_FIX.md for detailed documentation
 */

/**
 * Detect and merge duplicate properties based on address + postcode OR URL
 * 
 * CRITICAL FIX (v2.1): Enhanced Duplicate Detection
 * - Primary: Address + Postcode matching (existing logic)
 * - Fallback: URL-based matching for URL-only entries
 * - Handles incomplete properties that lack address/postcode
 * 
 * @param {Array<Object>} properties - Array of properties
 * @returns {Array<Object>} Deduplicated properties
 */
function detectAndMergeDuplicates(properties) {
    log.info('Detecting duplicates...');
    
    const uniqueProperties = [];
    const seenKeys = new Map(); // Map of key -> index in uniqueProperties
    const seenURLs = new Map(); // Map of URL -> index in uniqueProperties
    
    properties.forEach(property => {
        let isDuplicate = false;
        let existingIndex = -1;
        
        // Strategy 1: Try address + postcode based detection
        const addressKey = generatePropertyKey(property);
        
        // Only use address key if it has meaningful data (not just "|")
        if (addressKey && addressKey !== '|' && addressKey.length > 1) {
            if (seenKeys.has(addressKey)) {
                isDuplicate = true;
                existingIndex = seenKeys.get(addressKey);
                log.info(`Found duplicate (address): ${property.Address || 'No address'}, ${property.Postcode || 'No postcode'}`);
            }
        }
        
        // Strategy 2: Try URL-based detection (fallback for URL-only entries)
        if (!isDuplicate && property.URL) {
            const urlKey = normalizeURL(property.URL);
            if (seenURLs.has(urlKey)) {
                isDuplicate = true;
                existingIndex = seenURLs.get(urlKey);
                log.info(`Found duplicate (URL): ${property.URL}`);
            }
        }
        
        if (isDuplicate && existingIndex !== -1) {
            // Merge with existing property
            uniqueProperties[existingIndex] = mergeProperties(uniqueProperties[existingIndex], property);
        } else {
            // Add as new unique property
            const newIndex = uniqueProperties.length;
            uniqueProperties.push(property);
            
            // Register keys
            if (addressKey && addressKey !== '|' && addressKey.length > 1) {
                seenKeys.set(addressKey, newIndex);
            }
            if (property.URL) {
                seenURLs.set(normalizeURL(property.URL), newIndex);
            }
        }
    });
    
    const duplicatesRemoved = properties.length - uniqueProperties.length;
    log.info(`Removed ${duplicatesRemoved} duplicates. ${uniqueProperties.length} unique properties remaining.`);
    
    return uniqueProperties;
}

/**
 * Normalize URL for consistent comparison
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeURL(url) {
    if (!url) return '';
    
    // Convert to lowercase, remove trailing slashes, normalize protocol
    let normalized = url.toLowerCase().trim();
    normalized = normalized.replace(/\/$/, ''); // Remove trailing slash
    normalized = normalized.replace(/^https?:\/\//, ''); // Remove protocol for comparison
    
    return normalized;
}

/**
 * Normalize address string for consistent duplicate detection
 * Removes city names, postcodes, and normalizes formatting
 * ENHANCED VERSION (Batch 1): Better comma handling for duplicate detection
 * 
 * @param {string} address - Raw address string
 * @param {string} postcode - Postcode (to remove from address if present)
 * @returns {string} Normalized address
 */
function normalizeAddress(address, postcode) {
    if (!address) return '';
    
    let normalized = address.toLowerCase().trim();
    
    // Remove postcode from address if it appears there
    // UK postcode pattern: e.g., DN15 7LQ, DN157LQ
    if (postcode) {
        const postcodeVariants = [
            postcode.toLowerCase().replace(/\s+/g, ''), // Remove spaces: dn157lq
            postcode.toLowerCase().replace(/\s+/g, ' '), // Single space: dn15 7lq
            postcode.toLowerCase() // Original: might have irregular spacing
        ];
        
        postcodeVariants.forEach(variant => {
            normalized = normalized.replace(variant, '');
        });
    }
    
    // Also remove any UK postcode pattern (backup cleanup)
    // Pattern: 1-2 letters, 1-2 digits, optional letter, optional space, digit, 2 letters
    normalized = normalized.replace(/\b[a-z]{1,2}\d{1,2}[a-z]?\s?\d[a-z]{2}\b/gi, '');
    
    // Remove common UK city names that appear in this dataset
    // Extended list to include more common towns/cities
    const cityNames = [
        'scunthorpe',
        'lincolnshire', 
        'north lincolnshire',
        'lincs',
        'england',
        'uk',
        'united kingdom',
        'blaxton',
        'doncaster',
        'hull',
        'grimsby',
        'leeds',
        'sheffield',
        'york'
    ];
    
    cityNames.forEach(city => {
        // Remove city name with common separators
        normalized = normalized.replace(new RegExp(`,\\s*${city}\\s*$`, 'gi'), '');
        normalized = normalized.replace(new RegExp(`\\s+${city}\\s*$`, 'gi'), '');
    });
    
    // ENHANCEMENT: Better comma normalization for duplicate matching
    // Remove commas after house numbers (e.g., "32," → "32")
    normalized = normalized.replace(/^(\d+[a-z]?),\s*/i, '$1 ');
    
    // Normalize comma usage
    // Remove leading/trailing commas
    normalized = normalized.replace(/^,+\s*/, '').replace(/\s*,+$/, '');
    // Collapse multiple commas into one
    normalized = normalized.replace(/,+/g, ',');
    // Normalize comma spacing: ensure single space after comma
    normalized = normalized.replace(/,\s*/g, ', ');
    // Remove comma before end of string
    normalized = normalized.replace(/,\s*$/, '');
    
    // Collapse multiple spaces into one
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Final trim
    normalized = normalized.trim();
    
    return normalized;
}

/**
 * Generate a unique key for a property based on address + postcode
 * Uses advanced normalization to handle address variations
 * @param {Object} property - Property object
 * @returns {string} Unique key
 */
function generatePropertyKey(property) {
    const rawAddress = property.Address || '';
    const postcode = (property.Postcode || '').toLowerCase().trim().replace(/\s+/g, '');
    
    // Normalize address to handle variations
    const normalizedAddress = normalizeAddress(rawAddress, postcode);
    
    return `${normalizedAddress}|${postcode}`;
}

/**
 * Calculate completeness score for a property object
 * Higher score means more complete data
 * @param {Object} property - Property object
 * @returns {number} Completeness score
 */
function calculateCompleteness(property) {
    let score = 0;
    
    // Key fields worth more points
    const keyFields = {
        'Address': 2,
        'Postcode': 2,
        'Price': 3,
        'Type': 1,
        'Bedrooms': 2,
        'Sq. ft': 3, // Very important for ranking
        'Sqm': 2,
        '£/sqft': 2,
        'Date of sale': 1,
        'Tenure': 1,
        'Age at sale': 1,
        'Distance': 1,
        'EPC rating': 1,
        'Google Streetview URL': 1
    };
    
    // Count filled fields with weights
    for (const [field, weight] of Object.entries(keyFields)) {
        const value = property[field];
        if (value && value !== '' && value !== 'nan' && value !== '-' && value !== 0) {
            score += weight;
        }
    }
    
    // Bonus points for having PropertyData enrichment (Image_URL populated)
    if (property.Image_URL && property.Image_URL !== '' && property.Image_URL !== 'nan') {
        score += 5; // High bonus for PropertyData enrichment
    }
    
    // Bonus for having URL
    if (property.URL && property.URL !== '' && property.URL !== 'nan') {
        score += 2;
    }
    
    // Penalty for scrape errors
    if (property._scrapeError) {
        score -= 10;
    }
    
    return score;
}

/**
 * Check if a URL is a Rightmove URL
 * @param {string} url - URL to check
 * @returns {boolean} True if Rightmove URL
 */
function isRightmoveURL(url) {
    return url && url.toLowerCase().includes('rightmove.co.uk');
}

/**
 * Check if a URL is a PropertyData URL
 * @param {string} url - URL to check
 * @returns {boolean} True if PropertyData URL
 */
function isPropertyDataURL(url) {
    return url && url.toLowerCase().includes('propertydata.co.uk');
}

/**
 * Detect significant conflicts in floor area data
 * Returns true if there's a significant difference (>10%) between values
 * @param {number} value1 - First floor area value
 * @param {number} value2 - Second floor area value
 * @returns {boolean} True if significant conflict exists
 */
function hasFloorAreaConflict(value1, value2) {
    if (!value1 || !value2) return false;
    if (value1 === value2) return false;
    
    const diff = Math.abs(value1 - value2);
    const avg = (value1 + value2) / 2;
    const percentDiff = (diff / avg) * 100;
    
    return percentDiff > 10; // More than 10% difference
}

/**
 * Merge two property objects, keeping most complete data
 * ENHANCED VERSION (Batch 1 - Issue 2): Better duplicate merging
 * 
 * Improvements:
 * - Keeps BOTH URLs from different sources (RM + PropertyData)
 * - Uses EPC floor area as final arbiter for conflicts
 * - Adds "Needs Review" flag for significant differences
 * 
 * @param {Object} existing - Existing property
 * @param {Object} newData - New property data
 * @returns {Object} Merged property
 */
function mergeProperties(existing, newData) {
    // Calculate completeness scores
    const existingScore = calculateCompleteness(existing);
    const newScore = calculateCompleteness(newData);
    
    // Start with the more complete version as base
    let merged = existingScore >= newScore ? { ...existing } : { ...newData };
    let lesserData = existingScore >= newScore ? newData : existing;
    
    // Track if we need to add "Needs Review" flag
    let needsReview = false;
    let reviewReasons = [];
    
    // ENHANCEMENT: Keep both URLs from different sources
    // Store Rightmove and PropertyData URLs separately
    const existingURL = existing.URL || '';
    const newDataURL = newData.URL || '';
    
    if (existingURL && newDataURL && existingURL !== newDataURL) {
        const existingIsRM = isRightmoveURL(existingURL);
        const newDataIsRM = isRightmoveURL(newDataURL);
        const existingIsPD = isPropertyDataURL(existingURL);
        const newDataIsPD = isPropertyDataURL(newDataURL);
        
        // If we have both RM and PropertyData, keep both
        if ((existingIsRM && newDataIsPD) || (existingIsPD && newDataIsRM)) {
            log.info('Detected duplicate with both Rightmove and PropertyData URLs - keeping both');
            
            // Store both URLs
            if (existingIsRM) {
                merged.URL_Rightmove = existingURL;
                merged.URL_PropertyData = newDataURL;
            } else {
                merged.URL_Rightmove = newDataURL;
                merged.URL_PropertyData = existingURL;
            }
            
            // Keep the PropertyData URL in main URL field (for primary link)
            merged.URL = existingIsPD ? existingURL : newDataURL;
            
            // Update Link field to point to PropertyData
            if (merged.URL_PropertyData) {
                merged.Link = `=HYPERLINK("${merged.URL_PropertyData}", "View")`;
            }
        }
    }
    
    // Merge each field from the lesser complete version, filling in gaps
    for (const [key, value] of Object.entries(lesserData)) {
        // Skip internal fields
        if (key.startsWith('_')) continue;
        
        // Skip URL field if we already handled it above
        if (key === 'URL' && (merged.URL_Rightmove || merged.URL_PropertyData)) continue;
        
        // If merged value is empty, use value from lesser data
        if (!merged[key] || merged[key] === '' || merged[key] === 'nan' || merged[key] === '-' || merged[key] === 0) {
            if (value && value !== '' && value !== 'nan' && value !== '-' && value !== 0) {
                merged[key] = value;
            }
        }
        // For numeric price fields, prefer higher values (more likely to be accurate)
        else if (key === 'Price' && typeof value === 'number' && typeof merged[key] === 'number') {
            const existingPrice = merged[key];
            const newPrice = value;
            if (existingPrice !== newPrice) {
                merged[key] = Math.max(merged[key], value);
                const priceDiff = Math.abs(existingPrice - newPrice);
                if (priceDiff > 10000) { // More than £10k difference
                    needsReview = true;
                    reviewReasons.push(`Price conflict: ${existingPrice} vs ${newPrice}`);
                }
            }
        }
        // ENHANCEMENT: For floor area fields, check for conflicts and use EPC as arbiter
        else if ((key === 'Sq. ft' || key === 'Sqm') && typeof value === 'number' && typeof merged[key] === 'number') {
            const existingArea = merged[key];
            const newArea = value;
            
            // Check for significant conflict
            if (hasFloorAreaConflict(existingArea, newArea)) {
                needsReview = true;
                reviewReasons.push(`${key} conflict: ${existingArea} vs ${newArea}`);
                log.warning(`Floor area conflict detected: ${existingArea} vs ${newArea} - will use EPC as arbiter`);
                
                // Mark for EPC verification (will be resolved by EPC scraping later)
                merged._floorAreaConflict = {
                    value1: existingArea,
                    value2: newArea,
                    field: key
                };
                
                // For now, take the larger value (more conservative)
                merged[key] = Math.max(existingArea, newArea);
            } else {
                // No significant conflict, take larger value
                merged[key] = Math.max(merged[key], value);
            }
        }
    }
    
    // Special handling: always preserve PropertyData enrichment data
    // If one version has Image_URL (PropertyData enriched) and other doesn't, keep the enriched data
    if (existing.Image_URL && existing.Image_URL !== '' && existing.Image_URL !== 'nan') {
        merged.Image_URL = existing.Image_URL;
    }
    if (newData.Image_URL && newData.Image_URL !== '' && newData.Image_URL !== 'nan') {
        merged.Image_URL = newData.Image_URL;
    }
    
    // Special handling for isTarget flag - always preserve it
    if (existing.isTarget === 1 || newData.isTarget === 1) {
        merged.isTarget = 1;
    }
    
    // ENHANCEMENT: Set needs_review flag if conflicts detected
    if (needsReview) {
        merged.needs_review = reviewReasons.join('; ');
        log.warning(`Property marked for review: ${merged.Address} - ${merged.needs_review}`);
    } else {
        // Reset needs_review if we got better data (no scrape errors and has key fields)
        if ((existing.needs_review || newData.needs_review) && 
            !merged._scrapeError && merged.Address && merged.Price) {
            merged.needs_review = '';
        }
    }
    
    // Log the merge decision
    log.info(`Merged properties: kept version with score ${Math.max(existingScore, newScore)} (existing: ${existingScore}, new: ${newScore})`);
    if (merged.URL_Rightmove || merged.URL_PropertyData) {
        log.info(`  → Kept both URLs: RM=${merged.URL_Rightmove ? 'Yes' : 'No'}, PD=${merged.URL_PropertyData ? 'Yes' : 'No'}`);
    }
    
    return merged;
}

module.exports = {
    detectAndMergeDuplicates,
    mergeProperties
};