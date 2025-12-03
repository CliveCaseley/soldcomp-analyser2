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
 * Write CSV to Apify Key-Value Store
 * @param {Array<Object>} properties - Array of property objects
 * @param {string} storeName - KVS store name
 * @param {string} key - Key name
 */
async function writeCSVToKVS(properties, storeName, key) {
    log.info(`Writing ${properties.length} properties to KVS: ${storeName}/${key}`);
    
    try {
        // Convert properties to CSV
        const csv = stringify(properties, {
            header: true,
            columns: STANDARD_HEADERS
        });
        
        // Open named key-value store
        const store = await Actor.openKeyValueStore(storeName);
        
        // Save the CSV
        await store.setValue(key, csv, { contentType: 'text/csv' });
        
        log.info(`Successfully wrote CSV to KVS (${csv.length} bytes)`);
    } catch (error) {
        log.error(`Failed to write to KVS: ${error.message}`);
        throw error;
    }
}

module.exports = {
    readCSVFromKVS,
    writeCSVToKVS
};