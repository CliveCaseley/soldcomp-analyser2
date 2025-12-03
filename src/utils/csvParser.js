const { parse } = require('csv-parse/sync');
const fuzzball = require('fuzzball');
const { log } = require('apify');

/**
 * Standard schema for property data
 */
const STANDARD_HEADERS = [
    'Date of sale',
    'Address',
    'Postcode',
    'Type',
    'Tenure',
    'Age at sale',
    'Price',
    'Sq. ft',
    'Sqm',
    '£/sqft',
    'Bedrooms',
    'Distance',
    'URL',
    'Link',
    'Image_URL',
    'EPC rating',
    'Google Streetview URL',
    'isTarget',
    'Ranking',
    'needs_review'
];

/**
 * Common variations of column names for fuzzy matching
 */
const HEADER_VARIATIONS = {
    'Date of sale': ['date', 'sale date', 'sold date', 'transaction date', 'date of sale'],
    'Address': ['address', 'property address', 'full address', 'street address'],
    'Postcode': ['postcode', 'post code', 'postal code', 'zip'],
    'Type': ['type', 'property type', 'house type'],
    'Tenure': ['tenure', 'freehold', 'leasehold'],
    'Age at sale': ['age', 'age at sale', 'property age', 'years old'],
    'Price': ['price', 'sale price', 'sold price', 'amount'],
    'Sq. ft': ['sq ft', 'sqft', 'square feet', 'sq. ft', 'sq.ft', 'square ft'],
    'Sqm': ['sqm', 'sq m', 'square meters', 'square metres', 'sq. m'],
    '£/sqft': ['£/sqft', 'price per sqft', 'per sqft', '£ per sqft'],
    'Bedrooms': ['bedrooms', 'beds', 'bedroom', 'bed'],
    'Distance': ['distance', 'distance from target'],
    'URL': ['url', 'link', 'web link', 'listing url'],
    'Image_URL': ['image', 'image url', 'photo', 'picture'],
    'EPC rating': ['epc', 'epc rating', 'energy rating', 'energy performance'],
    'Google Streetview URL': ['streetview', 'google streetview', 'street view'],
    'isTarget': ['istarget', 'is target', 'target'],
    'Ranking': ['ranking', 'rank', 'score'],
    'needs_review': ['needs review', 'review', 'flag', 'needs_review']
};

/**
 * Parse CSV content with flexible header detection
 * @param {string} csvContent - Raw CSV content
 * @returns {Array<Object>} Array of parsed rows with normalized headers
 */
function parseCSV(csvContent) {
    log.info('Parsing CSV content...');
    
    try {
        // Parse CSV with automatic header detection
        const records = parse(csvContent, {
            columns: false,
            skip_empty_lines: true,
            relax_column_count: true,
            trim: true
        });

        if (records.length === 0) {
            throw new Error('CSV file is empty');
        }

        log.info(`Parsed ${records.length} rows from CSV`);

        // Detect headers
        const headerMapping = detectHeaders(records);
        log.info('Header mapping detected:', headerMapping);

        // Convert to objects with standard headers
        const normalizedData = normalizeData(records, headerMapping);
        log.info(`Normalized ${normalizedData.length} data rows`);

        return normalizedData;
    } catch (error) {
        log.error('Failed to parse CSV:', error.message);
        throw error;
    }
}

/**
 * Detect headers using fuzzy matching
 * @param {Array<Array>} records - Raw CSV rows
 * @returns {Object} Mapping of detected column indices to standard headers
 */
function detectHeaders(records) {
    const headerMapping = {};
    const headerRow = records[0];

    log.info('Attempting to detect headers...');
    log.info('First row:', headerRow);

    for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
        const cellValue = String(headerRow[colIndex]).toLowerCase().trim();
        
        // Try to match with standard headers using fuzzy matching
        let bestMatch = null;
        let bestScore = 0;

        for (const [standardHeader, variations] of Object.entries(HEADER_VARIATIONS)) {
            for (const variation of variations) {
                const score = fuzzball.ratio(cellValue, variation);
                if (score > bestScore && score > 70) { // 70% threshold
                    bestScore = score;
                    bestMatch = standardHeader;
                }
            }
        }

        if (bestMatch) {
            headerMapping[colIndex] = bestMatch;
            log.info(`Mapped column ${colIndex} ("${cellValue}") to "${bestMatch}" (score: ${bestScore})`);
        } else {
            log.warning(`Could not map column ${colIndex} ("${cellValue}") - no match found`);
        }
    }

    return headerMapping;
}

/**
 * Normalize data rows using header mapping
 * @param {Array<Array>} records - Raw CSV rows
 * @param {Object} headerMapping - Mapping of column indices to standard headers
 * @returns {Array<Object>} Normalized data objects
 */
function normalizeData(records, headerMapping) {
    const normalizedData = [];
    
    // Skip first row (header row) if it was detected as headers
    const startIndex = Object.keys(headerMapping).length > 0 ? 1 : 0;

    for (let i = startIndex; i < records.length; i++) {
        const row = records[i];
        const normalizedRow = {};

        // Initialize all standard headers with empty values
        STANDARD_HEADERS.forEach(header => {
            normalizedRow[header] = '';
        });

        // Map detected columns
        for (const [colIndex, standardHeader] of Object.entries(headerMapping)) {
            const value = row[parseInt(colIndex)];
            if (value !== undefined && value !== null && value !== '') {
                normalizedRow[standardHeader] = String(value).trim();
            }
        }

        // If no headers detected, treat each row as potential data
        if (Object.keys(headerMapping).length === 0) {
            // Store raw data in a special format for later processing
            normalizedRow._rawData = row;
        }

        normalizedData.push(normalizedRow);
    }

    return normalizedData;
}

/**
 * Clean and normalize a single property object
 * @param {Object} property - Property data object
 * @returns {Object} Cleaned property object
 */
function cleanProperty(property) {
    const cleaned = { ...property };

    // Normalize postcode (uppercase, remove extra spaces)
    if (cleaned.Postcode) {
        cleaned.Postcode = cleaned.Postcode.toUpperCase().replace(/\s+/g, ' ').trim();
    }

    // Normalize price (remove £, commas, convert to number)
    if (cleaned.Price) {
        const priceStr = String(cleaned.Price).replace(/[£,]/g, '').trim();
        const priceNum = parseFloat(priceStr);
        if (!isNaN(priceNum)) {
            cleaned.Price = priceNum;
        }
    }

    // Normalize numeric fields
    const numericFields = ['Sq. ft', 'Sqm', '£/sqft', 'Bedrooms', 'Age at sale'];
    numericFields.forEach(field => {
        if (cleaned[field]) {
            const numStr = String(cleaned[field]).replace(/[,]/g, '').trim();
            const num = parseFloat(numStr);
            if (!isNaN(num)) {
                cleaned[field] = num;
            }
        }
    });

    // Calculate Sqm from Sq. ft if missing
    if (cleaned['Sq. ft'] && !cleaned.Sqm) {
        cleaned.Sqm = Math.round(cleaned['Sq. ft'] * 0.092903 * 10) / 10;
    }

    // Calculate £/sqft if missing
    if (cleaned.Price && cleaned['Sq. ft'] && !cleaned['£/sqft']) {
        cleaned['£/sqft'] = Math.round(cleaned.Price / cleaned['Sq. ft']);
    }

    // Normalize address (trim, consistent spacing)
    if (cleaned.Address) {
        cleaned.Address = cleaned.Address.replace(/\s+/g, ' ').trim();
    }

    return cleaned;
}

module.exports = {
    parseCSV,
    cleanProperty,
    STANDARD_HEADERS
};