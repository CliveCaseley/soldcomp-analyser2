const { log } = require('apify');

/**
 * URL types
 */
const URL_TYPES = {
    RIGHTMOVE_POSTCODE_SEARCH: 'rightmove_postcode_search',
    RIGHTMOVE_SOLD_LISTING: 'rightmove_sold_listing',
    RIGHTMOVE_FORSALE_LISTING: 'rightmove_forsale_listing',
    PROPERTYDATA: 'propertydata',
    UNKNOWN: 'unknown'
};

/**
 * Detect and classify URLs found in the dataset
 * @param {Array<Object>} properties - Array of property objects
 * @returns {Object} Classified URLs by type
 */
function classifyURLs(properties) {
    log.info('Classifying URLs in dataset...');
    
    const classified = {
        [URL_TYPES.RIGHTMOVE_POSTCODE_SEARCH]: [],
        [URL_TYPES.RIGHTMOVE_SOLD_LISTING]: [],
        [URL_TYPES.RIGHTMOVE_FORSALE_LISTING]: [],
        [URL_TYPES.PROPERTYDATA]: [],
        [URL_TYPES.UNKNOWN]: []
    };

    properties.forEach((property, index) => {
        // Check URL field
        if (property.URL && isValidURL(property.URL)) {
            const type = classifyURL(property.URL);
            classified[type].push({ url: property.URL, property, index });
        }

        // Also check all fields for URLs (in case URL is in a different column)
        for (const [key, value] of Object.entries(property)) {
            if (key !== 'URL' && value && isValidURL(String(value))) {
                const type = classifyURL(String(value));
                if (!classified[type].some(item => item.url === String(value))) {
                    classified[type].push({ url: String(value), property, index });
                    // Store URL in the URL field if it's empty
                    if (!property.URL) {
                        property.URL = String(value);
                    }
                }
            }
        }
    });

    // Log classification results
    for (const [type, urls] of Object.entries(classified)) {
        if (urls.length > 0) {
            log.info(`Found ${urls.length} ${type} URLs`);
        }
    }

    return classified;
}

/**
 * Classify a single URL
 * @param {string} url - URL to classify
 * @returns {string} URL type
 */
function classifyURL(url) {
    const urlLower = url.toLowerCase();

    // Rightmove postcode search (house-prices with postcode)
    // Example: https://www.rightmove.co.uk/house-prices/dn15-7lq.html?soldIn=2&radius=0.25
    if (urlLower.includes('rightmove.co.uk') && urlLower.includes('house-prices')) {
        // If it has a postcode pattern and radius/soldin parameters, it's a postcode search
        if ((urlLower.includes('radius') || urlLower.includes('soldin')) && 
            !urlLower.includes('/details/')) {
            return URL_TYPES.RIGHTMOVE_POSTCODE_SEARCH;
        }
        // If it has /details/, it's an individual property
        if (urlLower.includes('/details/')) {
            return URL_TYPES.RIGHTMOVE_SOLD_LISTING;
        }
    }

    // Rightmove sold listing (properties page)
    if (urlLower.includes('rightmove.co.uk') && 
        (urlLower.includes('property-for-sale') || urlLower.includes('sold')) &&
        urlLower.includes('properties/')) {
        return URL_TYPES.RIGHTMOVE_SOLD_LISTING;
    }

    // Rightmove for-sale listing
    if (urlLower.includes('rightmove.co.uk') && 
        urlLower.includes('properties/') &&
        !urlLower.includes('sold')) {
        return URL_TYPES.RIGHTMOVE_FORSALE_LISTING;
    }

    // PropertyData
    if (urlLower.includes('propertydata.co.uk')) {
        return URL_TYPES.PROPERTYDATA;
    }

    return URL_TYPES.UNKNOWN;
}

/**
 * Check if a string is a valid URL
 * @param {string} str - String to check
 * @returns {boolean} True if valid URL
 */
function isValidURL(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Tag properties with _source metadata based on their URL type
 * This is crucial for proper output ordering per SPEC v01.docx
 * @param {Array<Object>} properties - Array of property objects
 * @returns {Array<Object>} Properties with _source tags applied
 */
function tagURLOnlyProperties(properties) {
    log.info('Tagging URL-only properties with _source metadata...');
    
    let taggedCount = 0;
    
    properties.forEach(property => {
        // Skip if already tagged
        if (property._source) {
            return;
        }
        
        // Check if this is a URL-only row (has URL but minimal other data)
        if (property.URL && isValidURL(property.URL)) {
            const urlType = classifyURL(property.URL);
            const hasMinimalData = isURLOnlyRow(property);
            
            if (hasMinimalData) {
                // Tag based on URL type
                switch (urlType) {
                    case URL_TYPES.RIGHTMOVE_POSTCODE_SEARCH:
                        property._source = 'rightmove_postcode_search';
                        property._url_only = true;
                        taggedCount++;
                        log.info(`Tagged as postcode search: ${property.URL}`);
                        break;
                    
                    case URL_TYPES.RIGHTMOVE_SOLD_LISTING:
                    case URL_TYPES.RIGHTMOVE_FORSALE_LISTING:
                        property._source = 'rightmove_individual_listing';
                        property._url_only = true;
                        taggedCount++;
                        log.info(`Tagged as individual listing: ${property.URL}`);
                        break;
                    
                    case URL_TYPES.PROPERTYDATA:
                        property._source = 'propertydata_listing';
                        property._url_only = true;
                        taggedCount++;
                        log.info(`Tagged as PropertyData listing: ${property.URL}`);
                        break;
                    
                    default:
                        log.warning(`Unknown URL type for: ${property.URL}`);
                }
            }
        }
    });
    
    log.info(`Tagged ${taggedCount} URL-only properties`);
    return properties;
}

/**
 * Check if a property is a URL-only row (has URL but minimal other data)
 * @param {Object} property - Property object to check
 * @returns {boolean} True if this is a URL-only row
 */
function isURLOnlyRow(property) {
    // Count how many essential data fields are filled with actual property data (not URLs)
    const essentialFields = ['Address', 'Postcode', 'Price', 'Type', 'Tenure'];
    const filledFields = essentialFields.filter(field => {
        const value = property[field];
        // Exclude empty, NaN, and URL values from counting as "filled"
        if (!value || value === '' || value === 'NaN' || value === 'nan') {
            return false;
        }
        // If Address field contains a URL, don't count it as filled
        if (field === 'Address' && isValidURL(String(value))) {
            return false;
        }
        return true;
    });
    
    // If less than 2 essential fields are filled, it's likely a URL-only row
    return filledFields.length < 2;
}

module.exports = {
    classifyURLs,
    classifyURL,
    tagURLOnlyProperties,
    URL_TYPES
};