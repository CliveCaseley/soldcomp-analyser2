const { log } = require('apify');

/**
 * Manual Edit Detector
 * 
 * Detects and preserves manual edits during iterative processing
 * 
 * **BATCH 2 IMPLEMENTATION**:
 * - Detects when fields have been manually edited (e.g., EPC URL corrected)
 * - Marks manually edited fields with internal flags
 * - Prevents automated updates from overwriting manual corrections
 * - Applies to: EPC Certificate, Sq. ft, Price, Address, etc.
 * 
 * **Use case**: User runs output CSV back through as data.csv with manual corrections
 * 
 * @module manualEditDetector
 */

/**
 * Fields that should be protected from automatic updates once manually edited
 */
const PROTECTED_FIELDS = {
    'EPC Certificate': 'epc_certificate',
    'Sq. ft': 'sqft',
    'Sqm': 'sqm',
    'Price': 'price',
    'Address': 'address',
    'Postcode': 'postcode',
    'Type': 'type',
    'Tenure': 'tenure',
    'Bedrooms': 'bedrooms',
    'Date of sale': 'date_of_sale'
};

/**
 * Check if a property has existing data that looks like it was processed before
 * 
 * Indicators of processed data:
 * - Has EPC Certificate URL
 * - Has geocoded coordinates
 * - Has calculated fields like Distance, £/sqft
 * - Has Google Streetview URL
 * 
 * @param {Object} property - Property to check
 * @returns {boolean} True if property appears to have been processed before
 */
function hasBeenProcessed(property) {
    return !!(
        property['EPC Certificate'] ||
        property['Google Streetview URL'] ||
        property.Distance ||
        property['£/sqft'] ||
        (property.Latitude && property.Longitude)
    );
}

/**
 * Initialize manual edit flags for a property
 * 
 * Creates internal `_manual_edit_flags` object to track which fields are manually edited
 * 
 * @param {Object} property - Property to initialize
 */
function initializeManualEditFlags(property) {
    if (!property._manual_edit_flags) {
        property._manual_edit_flags = {};
    }
}

/**
 * Mark a field as manually edited
 * 
 * @param {Object} property - Property containing the field
 * @param {string} fieldName - Display name of the field (e.g., 'EPC Certificate')
 * @param {*} manualValue - The manually edited value
 */
function markFieldAsManuallyEdited(property, fieldName, manualValue) {
    initializeManualEditFlags(property);
    
    const flagKey = PROTECTED_FIELDS[fieldName];
    if (flagKey) {
        property._manual_edit_flags[flagKey] = true;
        log.info(`  ✓ Marked '${fieldName}' as manually edited for ${property.Address || 'property'}`);
        log.info(`    Manual value: ${manualValue}`);
    }
}

/**
 * Check if a field is marked as manually edited
 * 
 * @param {Object} property - Property to check
 * @param {string} fieldName - Display name of the field (e.g., 'EPC Certificate')
 * @returns {boolean} True if field is manually edited and should be protected
 */
function isFieldManuallyEdited(property, fieldName) {
    if (!property._manual_edit_flags) {
        return false;
    }
    
    const flagKey = PROTECTED_FIELDS[fieldName];
    return flagKey && property._manual_edit_flags[flagKey] === true;
}

/**
 * Detect manual edits by comparing existing data with freshly scraped data
 * 
 * Called BEFORE enrichment to identify fields that shouldn't be overwritten
 * 
 * Strategy:
 * 1. Check if property has been processed before
 * 2. For each protected field, check if it exists and looks manually edited
 * 3. Mark detected manual edits with flags
 * 
 * @param {Object} property - Property with existing data
 * @param {Object} freshData - Freshly scraped/fetched data (optional, for comparison)
 */
function detectManualEdits(property, freshData = null) {
    // Only check for manual edits if property has been processed before
    if (!hasBeenProcessed(property)) {
        return;
    }
    
    log.info(`Checking for manual edits in: ${property.Address || 'property'}`);
    
    initializeManualEditFlags(property);
    
    // Check EPC Certificate
    if (property['EPC Certificate']) {
        const epcURL = property['EPC Certificate'];
        
        // If we have fresh data to compare against
        if (freshData && freshData['EPC Certificate']) {
            // If existing EPC URL differs from what would be scraped, it's likely manual
            if (epcURL !== freshData['EPC Certificate']) {
                markFieldAsManuallyEdited(property, 'EPC Certificate', epcURL);
            }
        } else {
            // If we don't have fresh data yet, we'll mark it as potentially manual
            // and verify later during enrichment
            // For now, just log that we found existing EPC data
            log.info(`  Found existing EPC Certificate: ${epcURL}`);
        }
    }
    
    // Check square footage - if it exists and doesn't match typical sources
    if (property['Sq. ft']) {
        const sqft = property['Sq. ft'];
        
        if (freshData && freshData['Sq. ft']) {
            // Check for significant difference (>5%)
            const diff = Math.abs(parseFloat(sqft) - parseFloat(freshData['Sq. ft']));
            const pct = diff / parseFloat(freshData['Sq. ft']);
            
            if (pct > 0.05) {
                markFieldAsManuallyEdited(property, 'Sq. ft', sqft);
                if (property.Sqm) {
                    markFieldAsManuallyEdited(property, 'Sqm', property.Sqm);
                }
            }
        }
    }
    
    // Check price
    if (property.Price) {
        const price = property.Price;
        
        if (freshData && freshData.Price) {
            // Prices shouldn't change, but if they do, it's manual
            if (parseFloat(price) !== parseFloat(freshData.Price)) {
                markFieldAsManuallyEdited(property, 'Price', price);
            }
        }
    }
    
    // Check address/postcode changes
    if (property.Address && freshData && freshData.Address) {
        // Normalize for comparison
        const normalizeAddr = (addr) => addr.toLowerCase().trim().replace(/\s+/g, ' ');
        
        if (normalizeAddr(property.Address) !== normalizeAddr(freshData.Address)) {
            markFieldAsManuallyEdited(property, 'Address', property.Address);
        }
    }
    
    if (property.Postcode && freshData && freshData.Postcode) {
        if (property.Postcode !== freshData.Postcode) {
            markFieldAsManuallyEdited(property, 'Postcode', property.Postcode);
        }
    }
}

/**
 * Compare existing EPC Certificate with scraped result to detect manual edit
 * 
 * Called during EPC enrichment to check if user manually corrected the EPC URL
 * 
 * @param {Object} property - Property with existing EPC Certificate
 * @param {string} scrapedEPCURL - Freshly scraped EPC URL
 */
function compareAndMarkEPCEdit(property, scrapedEPCURL) {
    const existingEPCURL = property['EPC Certificate'];
    
    if (!existingEPCURL || !scrapedEPCURL) {
        return; // Nothing to compare
    }
    
    // Normalize URLs for comparison
    const normalizeURL = (url) => url.toLowerCase().trim();
    
    if (normalizeURL(existingEPCURL) !== normalizeURL(scrapedEPCURL)) {
        log.info(`⚠️  EPC URL mismatch detected for ${property.Address || 'property'}:`);
        log.info(`   Existing: ${existingEPCURL}`);
        log.info(`   Scraped:  ${scrapedEPCURL}`);
        log.info(`   → Preserving existing (manual edit)`);
        
        markFieldAsManuallyEdited(property, 'EPC Certificate', existingEPCURL);
    }
}

/**
 * Compare existing square footage with scraped/EPC result to detect manual edit
 * 
 * @param {Object} property - Property with existing Sq. ft
 * @param {number} scrapedSqft - Freshly scraped/calculated square footage
 */
function compareAndMarkSqftEdit(property, scrapedSqft) {
    const existingSqft = property['Sq. ft'];
    
    if (!existingSqft || !scrapedSqft) {
        return;
    }
    
    const diff = Math.abs(parseFloat(existingSqft) - parseFloat(scrapedSqft));
    const pct = diff / parseFloat(scrapedSqft);
    
    // If difference is >5%, consider it a manual edit
    if (pct > 0.05) {
        log.info(`⚠️  Square footage mismatch detected for ${property.Address || 'property'}:`);
        log.info(`   Existing: ${existingSqft} sq ft`);
        log.info(`   Scraped:  ${scrapedSqft} sq ft`);
        log.info(`   Difference: ${(pct * 100).toFixed(1)}%`);
        log.info(`   → Preserving existing (manual edit)`);
        
        markFieldAsManuallyEdited(property, 'Sq. ft', existingSqft);
        if (property.Sqm) {
            markFieldAsManuallyEdited(property, 'Sqm', property.Sqm);
        }
    }
}

/**
 * Should we update this field, or is it manually edited?
 * 
 * Convenience function for enrichment logic
 * 
 * @param {Object} property - Property to check
 * @param {string} fieldName - Field to check (e.g., 'EPC Certificate')
 * @returns {boolean} True if field can be updated, false if it's manually edited
 */
function canUpdateField(property, fieldName) {
    return !isFieldManuallyEdited(property, fieldName);
}

module.exports = {
    hasBeenProcessed,
    detectManualEdits,
    markFieldAsManuallyEdited,
    isFieldManuallyEdited,
    compareAndMarkEPCEdit,
    compareAndMarkSqftEdit,
    canUpdateField,
    PROTECTED_FIELDS
};
