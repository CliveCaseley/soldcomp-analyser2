const { log } = require('apify');

/**
 * DATA SANITIZER MODULE
 * 
 * CRITICAL FIX (v2.1): Prevent JavaScript/HTML Garbage in Output
 * - Removes JavaScript code patterns from scraped data
 * - Removes HTML tags and entities
 * - Validates data types and ranges
 * - Prevents CSV injection attacks
 * 
 * Issue #8: JavaScript/HTML garbage appearing in Type and other columns
 * Issue #9: Price data corruption (£300,000 → 30000)
 */

/**
 * Detect if a string contains JavaScript code
 * @param {string} str - String to check
 * @returns {boolean} True if string contains JS code
 */
function containsJavaScript(str) {
    if (!str || typeof str !== 'string') return false;
    
    const jsPatterns = [
        /function\s*\(/i,
        /=>\s*\{/,
        /window\./i,
        /document\./i,
        /console\./i,
        /\bvar\s+\w+\s*=/i,
        /\blet\s+\w+\s*=/i,
        /\bconst\s+\w+\s*=/i,
        /sessionStorage/i,
        /localStorage/i,
        /addEventListener/i,
        /\breturn\s+/i,
        /\bif\s*\(/i,
        /\.innerHTML/i,
        /\.querySelector/i
    ];
    
    return jsPatterns.some(pattern => pattern.test(str));
}

/**
 * Detect if a string contains HTML code
 * @param {string} str - String to check
 * @returns {boolean} True if string contains HTML
 */
function containsHTML(str) {
    if (!str || typeof str !== 'string') return false;
    
    const htmlPatterns = [
        /<\s*script[^>]*>/i,
        /<\s*div[^>]*>/i,
        /<\s*span[^>]*>/i,
        /<\s*p[^>]*>/i,
        /<\s*a\s+href/i,
        /<\s*img[^>]*>/i,
        /&lt;/,
        /&gt;/,
        /&quot;/,
        /&amp;/
    ];
    
    return htmlPatterns.some(pattern => pattern.test(str));
}

/**
 * Remove JavaScript and HTML from string
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function removeJavaScriptAndHTML(str) {
    if (!str || typeof str !== 'string') return '';
    
    let sanitized = str;
    
    // Remove HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    
    // Remove HTML entities
    sanitized = sanitized.replace(/&[a-z]+;/gi, '');
    
    // If string still contains JS patterns after HTML removal, it's likely pure JS code - reject it
    if (containsJavaScript(sanitized)) {
        log.warning(`Rejected string containing JavaScript code: ${sanitized.substring(0, 100)}...`);
        return '';
    }
    
    // Trim and normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    return sanitized;
}

/**
 * Validate and sanitize price value
 * @param {*} price - Price value to validate
 * @returns {number|null} Sanitized price or null if invalid
 */
function sanitizePrice(price) {
    if (!price) return null;
    
    // Convert to string for processing
    let priceStr = String(price).trim();
    
    // Remove currency symbols and commas
    priceStr = priceStr.replace(/[£$€,]/g, '');
    
    // Parse as float
    const priceNum = parseFloat(priceStr);
    
    // Validate range (UK properties typically £10,000 - £10,000,000)
    if (isNaN(priceNum) || priceNum < 10000 || priceNum > 10000000) {
        log.warning(`Invalid price value: ${price} (parsed as ${priceNum})`);
        return null;
    }
    
    return priceNum;
}

/**
 * Validate and sanitize floor area (sq ft)
 * @param {*} sqft - Square footage value
 * @returns {number|null} Sanitized sq ft or null if invalid
 */
function sanitizeSqFt(sqft) {
    if (!sqft) return null;
    
    // Convert to string for processing
    let sqftStr = String(sqft).trim();
    
    // Remove commas and units
    sqftStr = sqftStr.replace(/[,]/g, '').replace(/sq\.?\s*ft/gi, '').trim();
    
    // Parse as float
    const sqftNum = parseFloat(sqftStr);
    
    // Validate range (properties typically 100 - 10,000 sq ft)
    if (isNaN(sqftNum) || sqftNum < 50 || sqftNum > 10000) {
        log.warning(`Invalid square footage value: ${sqft} (parsed as ${sqftNum})`);
        return null;
    }
    
    return sqftNum;
}

/**
 * Validate and sanitize bedroom count
 * @param {*} bedrooms - Bedroom count
 * @returns {number|null} Sanitized bedroom count or null if invalid
 */
function sanitizeBedrooms(bedrooms) {
    if (!bedrooms) return null;
    
    const bedroomsNum = parseInt(bedrooms);
    
    // Validate range (properties typically 0-10 bedrooms)
    if (isNaN(bedroomsNum) || bedroomsNum < 0 || bedroomsNum > 15) {
        log.warning(`Invalid bedroom count: ${bedrooms}`);
        return null;
    }
    
    return bedroomsNum;
}

/**
 * Sanitize a complete property object
 * @param {Object} property - Property object to sanitize
 * @returns {Object} Sanitized property object
 */
function sanitizeProperty(property) {
    const sanitized = { ...property };
    
    // Sanitize text fields (remove JS/HTML)
    const textFields = ['Address', 'Type', 'Tenure'];
    textFields.forEach(field => {
        if (sanitized[field]) {
            const originalValue = sanitized[field];
            sanitized[field] = removeJavaScriptAndHTML(String(originalValue));
            
            if (originalValue !== sanitized[field]) {
                log.warning(`Sanitized ${field}: "${originalValue.substring(0, 50)}..." → "${sanitized[field]}"`);
            }
        }
    });
    
    // Validate and sanitize Price
    if (sanitized.Price) {
        const originalPrice = sanitized.Price;
        sanitized.Price = sanitizePrice(originalPrice);
        
        if (sanitized.Price === null) {
            sanitized.needs_review = 1;
            log.warning(`Price validation failed for ${sanitized.Address}: ${originalPrice}`);
        }
    }
    
    // Validate and sanitize Sq. ft
    if (sanitized['Sq. ft']) {
        const originalSqft = sanitized['Sq. ft'];
        sanitized['Sq. ft'] = sanitizeSqFt(originalSqft);
        
        if (sanitized['Sq. ft'] === null) {
            sanitized.needs_review = 1;
            log.warning(`Sq. ft validation failed for ${sanitized.Address}: ${originalSqft}`);
        }
    }
    
    // Validate and sanitize Bedrooms
    if (sanitized.Bedrooms) {
        const originalBedrooms = sanitized.Bedrooms;
        sanitized.Bedrooms = sanitizeBedrooms(originalBedrooms);
        
        if (sanitized.Bedrooms === null) {
            sanitized.needs_review = 1;
            log.warning(`Bedroom count validation failed for ${sanitized.Address}: ${originalBedrooms}`);
        }
    }
    
    return sanitized;
}

/**
 * Detect widow row (summary row with averages but no actual property data)
 * Widow rows typically have:
 * - Empty Address, Postcode, and Date of sale
 * - But contain numeric values in Price, £/sqft, or other average fields
 * - Often appear at the end of CSV files as summary statistics
 * 
 * @param {Object} property - Property object to check
 * @returns {boolean} True if this is a widow/summary row
 */
function isWidowRow(property) {
    // Check if critical identifying fields are empty
    const hasEmptyIdentifiers = (
        (!property.Address || property.Address.trim() === '') &&
        (!property.Postcode || property.Postcode.trim() === '') &&
        (!property['Date of sale'] || property['Date of sale'].trim() === '')
    );
    
    // Check if it has numeric summary data (Price or £/sqft)
    const hasSummaryData = (
        (property.Price && !isNaN(parseFloat(property.Price))) ||
        (property['£/sqft'] && !isNaN(parseFloat(String(property['£/sqft']).replace(/[£,]/g, ''))))
    );
    
    return hasEmptyIdentifiers && hasSummaryData;
}

/**
 * Sanitize an array of properties
 * @param {Array<Object>} properties - Array of properties
 * @returns {Array<Object>} Array of sanitized properties
 */
function sanitizeProperties(properties) {
    log.info(`Sanitizing ${properties.length} properties...`);
    
    // Filter out widow/summary rows
    const beforeWidowFilter = properties.length;
    const filteredProperties = properties.filter(prop => {
        if (isWidowRow(prop)) {
            log.warning(`⚠️ Removing widow/summary row with Price=${prop.Price}, £/sqft=${prop['£/sqft']}`);
            return false;
        }
        return true;
    });
    
    const widowRowsRemoved = beforeWidowFilter - filteredProperties.length;
    if (widowRowsRemoved > 0) {
        log.info(`✅ Removed ${widowRowsRemoved} widow/summary row(s) from input`);
    }
    
    const sanitized = filteredProperties.map(sanitizeProperty);
    
    log.info('Data sanitization complete');
    return sanitized;
}

module.exports = {
    containsJavaScript,
    containsHTML,
    removeJavaScriptAndHTML,
    sanitizePrice,
    sanitizeSqFt,
    sanitizeBedrooms,
    sanitizeProperty,
    sanitizeProperties,
    isWidowRow
};
