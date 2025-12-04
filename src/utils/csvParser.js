const { parse } = require('csv-parse/sync');
const fuzzball = require('fuzzball');
const { log } = require('apify');

/**
 * Standard schema for property data
 * 
 * CRITICAL UPDATE (v2.1): Added Latitude, Longitude, and EPC Certificate columns
 * - Latitude and Longitude populated from geocoding results
 * - EPC Certificate contains individual property EPC URLs (not just postcode search)
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
    'Latitude',
    'Longitude',
    'URL',
    'Link',
    'Image_URL',
    'EPC rating',
    'EPC Certificate',
    'Google Streetview URL',
    'Google Streetview Link',
    'isTarget',
    'Ranking',
    'needs_review'
];

/**
 * Common variations of column names for fuzzy matching
 */
// IMPORTANT: Order matters! More specific headers should come before more general ones
// to ensure proper matching (e.g., £/sqft before Sq. ft)
const HEADER_VARIATIONS = {
    'Date of sale': ['date', 'sale date', 'sold date', 'transaction date', 'date of sale'],
    'Address': ['address', 'property address', 'full address', 'street address'],
    'Postcode': ['postcode', 'post code', 'postal code', 'zip'],
    'Type': ['type', 'property type', 'house type'],
    'Tenure': ['tenure', 'freehold', 'leasehold'],
    'Age at sale': ['age', 'age at sale', 'property age', 'years old'],
    'Price': ['price', 'sale price', 'sold price', 'amount'],
    '£/sqft': ['£/sqft', 'price per sqft', 'per sqft', '£ per sqft', '£ sqft', '£sqft'],  // Check this BEFORE Sq. ft
    'Sq. ft': ['sq ft', 'sqft', 'square feet', 'sq. ft', 'sq.ft', 'square ft'],
    'Sqm': ['sqm', 'sq m', 'square meters', 'square metres', 'sq. m'],
    'Bedrooms': ['bedrooms', 'beds', 'bedroom', 'bed'],
    'Distance': ['distance', 'distance from target'],
    'Latitude': ['latitude', 'lat'],
    'Longitude': ['longitude', 'lng', 'long'],
    'URL': ['url', 'link', 'web link', 'listing url'],
    'Image_URL': ['image', 'image url', 'photo', 'picture'],
    'EPC rating': ['epc', 'epc rating', 'energy rating', 'energy performance'],
    'EPC Certificate': ['epc certificate', 'epc cert', 'epc link', 'epc url', 'energy certificate'],
    'Google Streetview URL': ['streetview', 'google streetview', 'street view'],
    'isTarget': ['istarget', 'is target', 'target'],
    'Ranking': ['ranking', 'rank', 'score'],
    'needs_review': ['needs review', 'review', 'flag', 'needs_review']
};

/**
 * Check if a string is a URL
 * @param {string} str - String to check
 * @returns {boolean} True if string is a URL
 */
function isURL(str) {
    if (!str || typeof str !== 'string') return false;
    const urlPattern = /^https?:\/\//i;
    return urlPattern.test(str.trim());
}

/**
 * Parse CSV content with flexible header detection
 * 
 * CRITICAL FIX (v2.1): URL Detection and Prevention of Misplacement
 * - Detects URL-only rows and structures them properly
 * - Prevents URLs from being mapped to Date, Postcode, or other non-URL columns
 * - Ensures URLs always go to URL/Link columns
 * 
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

        // Detect headers (returns both mapping and row index)
        const { headerMapping, headerRowIndex } = detectHeaders(records);
        log.info('Header mapping detected:', headerMapping);
        log.info(`Header row index: ${headerRowIndex}`);

        // Convert to objects with standard headers
        const normalizedData = normalizeData(records, headerMapping, headerRowIndex);
        log.info(`Normalized ${normalizedData.length} data rows`);

        return normalizedData;
    } catch (error) {
        log.error('Failed to parse CSV:', error.message);
        throw error;
    }
}

/**
 * Detect headers using fuzzy matching
 * CRITICAL FIX: Scans first 10 rows to find the actual header row instead of assuming row 1
 * 
 * @param {Array<Array>} records - Raw CSV rows
 * @returns {Object} Object containing headerMapping and headerRowIndex
 */
function detectHeaders(records) {
    log.info('Attempting to detect headers with smart scanning...');
    
    // Expected core column names that should appear in a valid header row
    const CORE_COLUMNS = ['date', 'address', 'postcode', 'price'];
    
    // Scan the first 10 rows (or all rows if less than 10)
    const rowsToScan = Math.min(10, records.length);
    let bestHeaderRow = -1;
    let bestHeaderMapping = {};
    let bestMatchScore = 0;
    
    log.info(`Scanning first ${rowsToScan} rows to find header row...`);
    
    for (let rowIndex = 0; rowIndex < rowsToScan; rowIndex++) {
        const row = records[rowIndex];
        const headerMapping = {};
        let matchedColumns = 0;
        let coreColumnsMatched = 0;
        
        // Try to match each cell in this row to standard headers
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
            const cellValue = String(row[colIndex]).toLowerCase().trim();
            
            // Skip empty cells
            if (cellValue === '') continue;
            
            // Try to match with standard headers using fuzzy matching
            let bestMatch = null;
            let bestScore = 0;

            for (const [standardHeader, variations] of Object.entries(HEADER_VARIATIONS)) {
                for (const variation of variations) {
                    // Check for exact match first (100% priority)
                    if (cellValue === variation) {
                        bestScore = 100;
                        bestMatch = standardHeader;
                        break;
                    }
                    
                    // Otherwise use fuzzy matching
                    const score = fuzzball.ratio(cellValue, variation);
                    if (score > bestScore && score > 70) { // 70% threshold
                        bestScore = score;
                        bestMatch = standardHeader;
                    }
                }
                
                // If we found an exact match, stop searching
                if (bestScore === 100) break;
            }

            if (bestMatch) {
                headerMapping[colIndex] = bestMatch;
                matchedColumns++;
                
                // Check if this is a core column
                const standardHeaderLower = bestMatch.toLowerCase();
                if (CORE_COLUMNS.some(core => standardHeaderLower.includes(core))) {
                    coreColumnsMatched++;
                }
            }
        }
        
        // Calculate a score for this row: number of matched columns + bonus for core columns
        const rowScore = matchedColumns + (coreColumnsMatched * 2);
        
        log.info(`Row ${rowIndex}: ${matchedColumns} columns matched (${coreColumnsMatched} core columns), score: ${rowScore}`);
        
        // If this row has a better score, use it as the header row
        if (rowScore > bestMatchScore && coreColumnsMatched >= 2) {
            bestMatchScore = rowScore;
            bestHeaderRow = rowIndex;
            bestHeaderMapping = headerMapping;
            log.info(`✓ New best header row candidate: row ${rowIndex}`);
        }
    }
    
    // If no header row found, default to row 0 (backward compatibility)
    if (bestHeaderRow === -1) {
        log.warning('No clear header row found in first 10 rows, defaulting to row 0');
        bestHeaderRow = 0;
        // Try to map row 0 anyway
        const row = records[0];
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
            const cellValue = String(row[colIndex]).toLowerCase().trim();
            let bestMatch = null;
            let bestScore = 0;
            for (const [standardHeader, variations] of Object.entries(HEADER_VARIATIONS)) {
                for (const variation of variations) {
                    const score = fuzzball.ratio(cellValue, variation);
                    if (score > bestScore && score > 70) {
                        bestScore = score;
                        bestMatch = standardHeader;
                    }
                }
            }
            if (bestMatch) {
                bestHeaderMapping[colIndex] = bestMatch;
            }
        }
    }
    
    log.info(`✓ Header row detected at row ${bestHeaderRow}`);
    log.info('Header row content:', records[bestHeaderRow]);
    log.info('Header mapping:', bestHeaderMapping);
    
    // Log each mapped column for clarity
    for (const [colIndex, standardHeader] of Object.entries(bestHeaderMapping)) {
        const cellValue = records[bestHeaderRow][colIndex];
        log.info(`  Column ${colIndex} ("${cellValue}") → "${standardHeader}"`);
    }
    
    return {
        headerMapping: bestHeaderMapping,
        headerRowIndex: bestHeaderRow
    };
}

/**
 * Normalize data rows using header mapping
 * 
 * CRITICAL FIX (v2.1): URL-Only Row Detection
 * - Detects rows that contain only a URL
 * - Properly maps URL to URL/Link columns instead of wrong columns
 * - Flags URL-only rows for scraping with needs_review
 * 
 * CRITICAL FIX (v2.2): Smart Header Row Detection
 * - Now accepts headerRowIndex parameter to skip all rows before the actual header row
 * - Prevents rows before the header (e.g., TARGET metadata) from being parsed as data
 * 
 * @param {Array<Array>} records - Raw CSV rows
 * @param {Object} headerMapping - Mapping of column indices to standard headers
 * @param {number} headerRowIndex - Index of the row containing headers
 * @returns {Array<Object>} Normalized data objects
 */
function normalizeData(records, headerMapping, headerRowIndex) {
    const normalizedData = [];
    
    // Start processing from the row AFTER the header row
    // This ensures we skip any metadata rows (like TARGET) that appear before the header
    const startIndex = headerRowIndex + 1;
    
    log.info(`Processing data rows starting from row ${startIndex} (skipping ${startIndex} rows including header at row ${headerRowIndex})`);
    log.info(`Total rows to process: ${records.length - startIndex}`);

    for (let i = startIndex; i < records.length; i++) {
        const row = records[i];
        const normalizedRow = {};

        // Initialize all standard headers with empty values
        STANDARD_HEADERS.forEach(header => {
            normalizedRow[header] = '';
        });

        // Check if this is a URL-only row
        const nonEmptyCells = row.filter(cell => cell && String(cell).trim() !== '');
        const isURLOnlyRow = nonEmptyCells.length === 1 && isURL(nonEmptyCells[0]);
        
        if (isURLOnlyRow) {
            // Special handling for URL-only rows
            const url = String(nonEmptyCells[0]).trim();
            normalizedRow.URL = url;
            normalizedRow.Link = `=HYPERLINK("${url}", "View")`;
            normalizedRow.needs_review = 1; // Flag for scraping
            log.info(`Detected URL-only row: ${url}`);
        } else {
            // Map detected columns normally
            for (const [colIndex, standardHeader] of Object.entries(headerMapping)) {
                const value = row[parseInt(colIndex)];
                if (value !== undefined && value !== null && value !== '') {
                    const stringValue = String(value).trim();
                    
                    // CRITICAL: Prevent URLs from being mapped to non-URL columns
                    if (isURL(stringValue)) {
                        // If this column is not a URL column, move it to URL column
                        if (!['URL', 'Link', 'Image_URL', 'EPC Certificate', 'Google Streetview URL'].includes(standardHeader)) {
                            log.warning(`Found URL in non-URL column (${standardHeader}), moving to URL column: ${stringValue}`);
                            normalizedRow.URL = stringValue;
                            normalizedRow.Link = `=HYPERLINK("${stringValue}", "View")`;
                        } else {
                            normalizedRow[standardHeader] = stringValue;
                        }
                    } else {
                        normalizedRow[standardHeader] = stringValue;
                    }
                }
            }

            // If no headers detected, treat each row as potential data
            if (Object.keys(headerMapping).length === 0) {
                // Store raw data in a special format for later processing
                normalizedRow._rawData = row;
            }
        }

        normalizedData.push(normalizedRow);
    }

    return normalizedData;
}

/**
 * Clean and normalize a single property object
 * 
 * CRITICAL FIX (v2.1): Postcode Extraction from Combined Address Fields
 * - Extracts UK postcode from Address field if Postcode column is empty
 * - Uses regex: /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i
 * - Removes extracted postcode from Address field
 * 
 * @param {Object} property - Property data object
 * @returns {Object} Cleaned property object
 */
function cleanProperty(property) {
    const cleaned = { ...property };

    // CRITICAL FIX: Extract postcode from Address if Postcode field is empty
    if (cleaned.Address && (!cleaned.Postcode || cleaned.Postcode === '')) {
        // UK postcode pattern: 1-2 letters, 1-2 digits, optional letter, optional space, digit, 2 letters
        // Examples: DN15 7LQ, DN157LQ, SW1A 1AA, W1A 0AX
        const postcodeMatch = cleaned.Address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i);
        if (postcodeMatch) {
            cleaned.Postcode = postcodeMatch[1].toUpperCase().replace(/\s+/g, ' ').trim();
            // Remove postcode from address field
            cleaned.Address = cleaned.Address.replace(postcodeMatch[0], '').replace(/,\s*$/, '').trim();
            log.info(`Extracted postcode from address: ${cleaned.Postcode}`);
        }
    }

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