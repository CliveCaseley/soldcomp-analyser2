const { Actor } = require('apify');
const { log } = require('apify');
const { stringify } = require('csv-stringify/sync');
const { STANDARD_HEADERS } = require('./csvParser');

/**
 * Read CSV from Apify Key-Value Store
 * CRITICAL FIX: UTF-8 BOM Removal
 * - Strips UTF-8 BOM (Byte Order Mark) if present
 * - BOM causes encoding issues (Â£ instead of £)
 * - Excel adds BOM by default, must be removed
 * 
 * @param {string} storeName - KVS store name
 * @param {string} key - Key name
 * @returns {string} CSV content without BOM
 */
async function readCSVFromKVS(storeName, key) {
    log.info(`Reading CSV from KVS: ${storeName}/${key}`);
    
    try {
        // Open named key-value store
        const store = await Actor.openKeyValueStore(storeName);
        
        // Get the value
        const value = await store.getValue(key);
        
        if (!value) {
            throw new Error(`No data found in KVS at ${storeName}/${key}`);
        }
        
        // If value is Buffer, convert to string
        let csvContent = Buffer.isBuffer(value) ? value.toString('utf-8') : value;
        
        // CRITICAL FIX: Remove UTF-8 BOM if present
        // UTF-8 BOM is EF BB BF (� in text), causes encoding issues
        if (csvContent.charCodeAt(0) === 0xFEFF) {
            log.warning('⚠️ UTF-8 BOM detected in CSV - removing it');
            csvContent = csvContent.substring(1);
        }
        
        // Also check for common BOM patterns
        if (csvContent.startsWith('\uFEFF')) {
            log.warning('⚠️ UTF-8 BOM (FEFF) detected - removing it');
            csvContent = csvContent.replace(/^\uFEFF/, '');
        }
        
        log.info(`Successfully read CSV from KVS (${csvContent.length} bytes, BOM removed if present)`);
        return csvContent;
    } catch (error) {
        log.error(`Failed to read from KVS: ${error.message}`);
        throw error;
    }
}

/**
 * Check if a row is completely empty (all critical fields are null/undefined/empty)
 * @param {Object} row - Property row object
 * @returns {boolean} true if row is completely empty
 */
function isEmptyRow(row) {
    // Critical fields that should have values in a valid row
    const criticalFields = [
        'Date of sale',
        'Address',
        'Postcode',
        'Type',
        'Price',
        'URL'
    ];
    
    // Check if all critical fields are empty
    return criticalFields.every(field => {
        const value = row[field];
        return value === null || 
               value === undefined || 
               value === '' || 
               value === 'nan' ||
               (typeof value === 'number' && isNaN(value));
    });
}

/**
 * Write CSV to Apify Key-Value Store
 * CRITICAL FIX: UTF-8 Encoding and Proper Quoting
 * - Uses RFC 4180 compliant CSV format
 * - Properly quotes fields with commas/newlines/quotes
 * - Forces UTF-8 encoding WITHOUT BOM
 * - Prevents £ from becoming Â£
 * 
 * @param {Array<Object>} properties - Array of property objects
 * @param {string} storeName - KVS store name
 * @param {string} key - Key name
 */
async function writeCSVToKVS(properties, storeName, key) {
    log.info(`Writing ${properties.length} properties to KVS: ${storeName}/${key}`);
    
    try {
        // Filter out completely empty rows
        const filteredProperties = properties.filter(row => !isEmptyRow(row));
        const removedCount = properties.length - filteredProperties.length;
        
        if (removedCount > 0) {
            log.info(`Removed ${removedCount} empty duplicate rows from output`);
        }
        
        // Convert properties to CSV with proper RFC 4180 formatting
        // CRITICAL: quoted: true ensures fields with commas are properly quoted
        // This prevents column misalignment when CSV is re-imported
        const csv = stringify(filteredProperties, {
            header: true,
            columns: STANDARD_HEADERS,
            quoted: true,           // Quote all fields (safest for re-import)
            quoted_string: true,    // Quote string fields
            escape: '"',            // Use double-quote escaping per RFC 4180
            record_delimiter: '\n'  // Use LF line endings (not CRLF)
        });
        
        // CRITICAL FIX: Convert to Buffer with explicit UTF-8 encoding (no BOM)
        // This prevents Â£ encoding issues
        const csvBuffer = Buffer.from(csv, 'utf-8');
        
        // Open named key-value store
        const store = await Actor.openKeyValueStore(storeName);
        
        // Save the CSV as Buffer with explicit charset
        await store.setValue(key, csvBuffer, { 
            contentType: 'text/csv; charset=utf-8'
        });
        
        log.info(`Successfully wrote CSV to KVS (${csvBuffer.length} bytes, ${filteredProperties.length} rows, UTF-8 without BOM)`);
    } catch (error) {
        log.error(`Failed to write to KVS: ${error.message}`);
        throw error;
    }
}

module.exports = {
    readCSVFromKVS,
    writeCSVToKVS
};