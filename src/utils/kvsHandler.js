const { Actor } = require('apify');
const { log } = require('apify');
const { stringify } = require('csv-stringify/sync');
const { STANDARD_HEADERS } = require('./csvParser');

/**
 * Read CSV from Apify Key-Value Store
 * @param {string} storeName - KVS store name
 * @param {string} key - Key name
 * @returns {string} CSV content
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
        const csvContent = Buffer.isBuffer(value) ? value.toString('utf-8') : value;
        
        log.info(`Successfully read CSV from KVS (${csvContent.length} bytes)`);
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
        
        // Convert properties to CSV
        const csv = stringify(filteredProperties, {
            header: true,
            columns: STANDARD_HEADERS
        });
        
        // Open named key-value store
        const store = await Actor.openKeyValueStore(storeName);
        
        // Save the CSV
        await store.setValue(key, csv, { contentType: 'text/csv' });
        
        log.info(`Successfully wrote CSV to KVS (${csv.length} bytes, ${filteredProperties.length} rows)`);
    } catch (error) {
        log.error(`Failed to write to KVS: ${error.message}`);
        throw error;
    }
}

module.exports = {
    readCSVFromKVS,
    writeCSVToKVS
};