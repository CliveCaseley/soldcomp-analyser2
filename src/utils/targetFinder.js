const fuzzball = require('fuzzball');
const { log } = require('apify');

/**
 * Common variations of "target" to match against
 */
const TARGET_VARIATIONS = [
    'target',
    'target property',
    'target:',
    'target is',
    'tgt',
    'subject property',
    'subject'
];

/**
 * Regex patterns for target indicator prefixes to be removed from address field
 * Matches various formats like "Target is", "TARGET =", "target:", etc.
 * Case-insensitive and handles optional trailing punctuation/spaces
 */
const TARGET_PREFIX_PATTERNS = [
    /^target\s+is\s*/i,           // "Target is", "TARGET IS", etc.
    /^target\s*=\s*/i,            // "TARGET =", "target=", etc.
    /^target\s*:\s*/i,            // "target:", "TARGET:", etc.
    /^target\s+property\s*:?\s*/i, // "Target property:", "TARGET PROPERTY", etc.
    /^tgt\s*:?\s*/i,              // "TGT:", "tgt", etc.
    /^subject\s+property\s*:?\s*/i, // "Subject property:", etc.
    /^subject\s*:?\s*/i           // "Subject:", etc.
];

/**
 * Clean up target indicator prefixes from address field
 * Removes common prefixes like "Target is", "TARGET =", "target:", etc.
 * Also removes trailing commas and extra spaces after prefix removal
 * 
 * @param {string} address - Raw address string that may contain target indicators
 * @returns {string} Cleaned address with prefixes removed
 * 
 * @example
 * cleanTargetAddress("Target is 54, Smith Street, Scunthorpe") 
 * // Returns: "54, Smith Street, Scunthorpe"
 * 
 * cleanTargetAddress("TARGET = 123 Main St")
 * // Returns: "123 Main St"
 * 
 * cleanTargetAddress("target: 45 Oak Avenue, DN15 7LQ")
 * // Returns: "45 Oak Avenue, DN15 7LQ"
 */
function cleanTargetAddress(address) {
    if (!address || typeof address !== 'string') {
        return address;
    }

    let cleanedAddress = address.trim();
    
    // Try each pattern and remove if found at the start of the address
    for (const pattern of TARGET_PREFIX_PATTERNS) {
        if (pattern.test(cleanedAddress)) {
            const originalAddress = cleanedAddress;
            cleanedAddress = cleanedAddress.replace(pattern, '');
            log.info(`Address cleanup: Removed target prefix`);
            log.info(`  Before: "${originalAddress}"`);
            log.info(`  After:  "${cleanedAddress}"`);
            break; // Only remove one prefix (the first match)
        }
    }
    
    // Remove leading commas, colons, or equals signs that might be left over
    cleanedAddress = cleanedAddress.replace(/^[,:\s=]+/, '').trim();
    
    // Clean up multiple spaces
    cleanedAddress = cleanedAddress.replace(/\s+/g, ' ').trim();
    
    return cleanedAddress;
}

/**
 * Find the target property in the dataset using fuzzy matching
 * @param {Array<Object>} properties - Array of property objects
 * @returns {Object} Result containing target property and remaining properties
 * @throws {Error} If no target found, multiple targets found, or target missing required fields
 */
function findTarget(properties) {
    log.info('Searching for target property...');
    
    const targetCandidates = [];

    // Scan all rows and all columns for target indicators
    properties.forEach((property, index) => {
        let isTarget = false;
        let targetIndicatorFound = '';

        // Check all fields for target indicators
        for (const [key, value] of Object.entries(property)) {
            if (!value) continue;
            
            const valueStr = String(value).toLowerCase().trim();
            
            // Check for existing isTarget flag
            if (key === 'isTarget' && (value === '1' || value === 1 || value === true)) {
                isTarget = true;
                targetIndicatorFound = 'isTarget flag';
                break;
            }

            // Fuzzy match against target variations
            for (const variation of TARGET_VARIATIONS) {
                const score = fuzzball.ratio(valueStr, variation);
                if (score > 80) { // 80% threshold for target matching
                    isTarget = true;
                    targetIndicatorFound = `"${value}" matched "${variation}" (score: ${score})`;
                    break;
                }
                
                // Also check if the value contains the variation
                if (valueStr.includes(variation)) {
                    isTarget = true;
                    targetIndicatorFound = `"${value}" contains "${variation}"`;
                    break;
                }
            }

            if (isTarget) break;
        }

        if (isTarget) {
            log.info(`Target candidate found at row ${index}: ${targetIndicatorFound}`);
            targetCandidates.push({ property, index, indicator: targetIndicatorFound });
        }
    });

    // Validate number of targets
    if (targetCandidates.length === 0) {
        const error = 'FATAL ERROR: No target property found. Please ensure one property is marked as "target" in the input CSV.';
        log.error(error);
        throw new Error(error);
    }

    if (targetCandidates.length > 1) {
        const error = `FATAL ERROR: Multiple target properties found (${targetCandidates.length}). Only one property should be marked as target.`;
        log.error(error);
        targetCandidates.forEach(({ index, indicator }) => {
            log.error(`  - Row ${index}: ${indicator}`);
        });
        throw new Error(error);
    }

    // Extract target property
    const { property: targetProperty, index: targetIndex } = targetCandidates[0];
    
    // CRITICAL FIX: Target indicator can be in ANY field (Date, Address, etc.)
    // We need to find which field contains the target indicator and extract address data from it
    // This handles cases like "TARGET = 7 Fernbank Close DN9 3PT" in the Date column
    
    let targetFieldKey = null;
    let targetFieldValue = null;
    
    // Find which field contains the target indicator
    for (const [key, value] of Object.entries(targetProperty)) {
        if (!value || key === 'isTarget') continue;
        
        const valueStr = String(value).toLowerCase().trim();
        
        // Check if this field matches any target pattern
        for (const pattern of TARGET_PREFIX_PATTERNS) {
            if (pattern.test(valueStr)) {
                targetFieldKey = key;
                targetFieldValue = String(value);
                log.info(`Target indicator found in field "${key}": "${value}"`);
                break;
            }
        }
        
        if (!targetFieldKey) {
            // Also check for exact matches with target variations
            for (const variation of TARGET_VARIATIONS) {
                if (valueStr.includes(variation)) {
                    targetFieldKey = key;
                    targetFieldValue = String(value);
                    log.info(`Target indicator found in field "${key}": "${value}"`);
                    break;
                }
            }
        }
        
        if (targetFieldKey) break;
    }
    
    // Clean and extract address data from the field containing the target indicator
    if (targetFieldKey && targetFieldValue) {
        const cleanedValue = cleanTargetAddress(targetFieldValue);
        log.info(`Cleaned target value: "${cleanedValue}"`);
        
        // If the cleaned value contains actual address data (not empty after cleaning)
        if (cleanedValue && cleanedValue.trim() !== '') {
            // Extract postcode and address from the cleaned value
            const { extractedPostcode, cleanedAddress } = extractPostcodeFromAddress(cleanedValue);
            
            log.info('Extracting address components from target field:');
            log.info(`  Original field "${targetFieldKey}": "${targetFieldValue}"`);
            log.info(`  After cleaning: "${cleanedValue}"`);
            log.info(`  Extracted postcode: ${extractedPostcode || 'None'}`);
            log.info(`  Extracted address: "${cleanedAddress}"`);
            
            // Populate Address field with the cleaned address (without postcode)
            if (cleanedAddress && cleanedAddress.trim() !== '') {
                targetProperty.Address = cleanedAddress;
                log.info(`✓ Address field populated: "${targetProperty.Address}"`);
            }
            
            // Populate Postcode field (only if currently empty and we extracted one)
            if (extractedPostcode && (!targetProperty.Postcode || targetProperty.Postcode.trim() === '')) {
                targetProperty.Postcode = extractedPostcode;
                log.info(`✓ Postcode field populated: "${targetProperty.Postcode}"`);
            }
            
            // Clear the original field if it's not Address or Postcode (to avoid showing "TARGET = ..." in output)
            if (targetFieldKey !== 'Address' && targetFieldKey !== 'Postcode' && targetFieldKey !== 'URL') {
                targetProperty[targetFieldKey] = '';
                log.info(`✓ Cleared original field "${targetFieldKey}" to avoid showing target indicator in output`);
            }
        }
    }
    
    // Also clean the Address field if it still has a prefix (for backward compatibility)
    // BUT ONLY if we didn't already process it above (targetFieldKey !== 'Address')
    if (targetFieldKey !== 'Address' && targetProperty.Address && typeof targetProperty.Address === 'string') {
        const originalAddress = targetProperty.Address;
        const cleanedAddr = cleanTargetAddress(targetProperty.Address);
        
        // Only update if address actually changed
        if (originalAddress !== cleanedAddr) {
            log.info('Additional Address field cleanup performed');
            log.info(`  Before cleanup: "${originalAddress}"`);
            log.info(`  After cleanup:  "${cleanedAddr}"`);
            
            // Extract postcode from this cleaned address if needed
            const { extractedPostcode, cleanedAddress } = extractPostcodeFromAddress(cleanedAddr);
            targetProperty.Address = cleanedAddress;
            
            if (extractedPostcode && (!targetProperty.Postcode || targetProperty.Postcode.trim() === '')) {
                targetProperty.Postcode = extractedPostcode;
                log.info(`✓ Postcode extracted from Address field: "${targetProperty.Postcode}"`);
            }
        }
    }
    
    // Validate target has required fields (after address cleanup)
    // This allows postcode extraction to work on the cleaned address
    validateTarget(targetProperty);

    // Set isTarget flag
    targetProperty.isTarget = 1;

    // Remove target from properties array
    const remainingProperties = properties.filter((_, index) => index !== targetIndex);

    log.info('Target property successfully identified and validated');
    
    // Log target info based on what data we have
    if (targetProperty.Address && targetProperty.Postcode) {
        log.info(`Target: ${targetProperty.Address}, ${targetProperty.Postcode}`);
    } else if (targetProperty.URL) {
        log.info(`Target URL: ${targetProperty.URL} (address will be scraped)`);
    }

    return {
        target: targetProperty,
        comparables: remainingProperties
    };
}

/**
 * UK Postcode regex pattern
 * Matches formats like: SW1A 1AA, EC1A 1BB, N1 9GU, DN15 7LQ, etc.
 */
const UK_POSTCODE_REGEX = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i;

/**
 * Extract UK postcode from address string if present
 * @param {string} address - Address string that may contain a postcode
 * @returns {Object} Object with extractedPostcode and cleanedAddress
 */
function extractPostcodeFromAddress(address) {
    if (!address || typeof address !== 'string') {
        return { extractedPostcode: null, cleanedAddress: address };
    }

    const match = address.match(UK_POSTCODE_REGEX);
    if (match) {
        const extractedPostcode = match[1].toUpperCase();
        // Remove the postcode from the address and clean up extra spaces/commas
        let cleanedAddress = address.replace(UK_POSTCODE_REGEX, '');
        // Remove trailing commas, spaces, and clean up multiple spaces
        cleanedAddress = cleanedAddress.replace(/[,\s]+$/, '').replace(/\s+/g, ' ').trim();
        return { extractedPostcode, cleanedAddress };
    }

    return { extractedPostcode: null, cleanedAddress: address };
}

/**
 * Validate that target property has required fields
 * @param {Object} target - Target property object
 * @throws {Error} If target missing required fields
 */
function validateTarget(target) {
    log.info('Validating target property...');
    
    // Step 1: Try to extract postcode from Address if Postcode column is empty
    const hasPostcode = target.Postcode && target.Postcode.trim() !== '';
    const hasAddress = target.Address && target.Address.trim() !== '';
    const hasUrl = target.URL && target.URL.trim() !== '';

    log.info(`Target validation - Initial state: Address=${hasAddress ? 'Yes' : 'No'}, Postcode=${hasPostcode ? 'Yes' : 'No'}, URL=${hasUrl ? 'Yes' : 'No'}`);

    // If no postcode but we have an address, try to extract postcode from it
    if (!hasPostcode && hasAddress) {
        log.info('Postcode column empty - attempting to extract from Address field...');
        const { extractedPostcode, cleanedAddress } = extractPostcodeFromAddress(target.Address);
        
        if (extractedPostcode) {
            log.info(`✓ Postcode extracted from address: "${extractedPostcode}"`);
            log.info(`  Original Address: "${target.Address}"`);
            log.info(`  Cleaned Address: "${cleanedAddress}"`);
            
            // Update the target object
            target.Postcode = extractedPostcode;
            target.Address = cleanedAddress;
        } else {
            log.warning('✗ No UK postcode pattern found in Address field');
        }
    }

    // Step 2: Validate based on available data
    const finalHasPostcode = target.Postcode && target.Postcode.trim() !== '';
    const finalHasAddress = target.Address && target.Address.trim() !== '';
    
    // Validation logic:
    // Option 1: Has Address + Postcode (after extraction) = Valid
    // Option 2: Has URL (will be scraped later) = Valid
    // Option 3: Has neither = Invalid
    
    if (finalHasAddress && finalHasPostcode) {
        log.info('✓ Target validation PASSED: Has Address + Postcode');
        log.info(`  Address: "${target.Address}"`);
        log.info(`  Postcode: "${target.Postcode}"`);
        return;
    }
    
    if (hasUrl) {
        log.info('✓ Target validation PASSED: Has URL (address/postcode will be scraped)');
        log.info(`  URL: "${target.URL}"`);
        return;
    }
    
    // If we get here, validation has failed
    log.error('✗ Target validation FAILED: Missing required data');
    log.error(`  Address: ${finalHasAddress ? `"${target.Address}"` : 'MISSING'}`);
    log.error(`  Postcode: ${finalHasPostcode ? `"${target.Postcode}"` : 'MISSING'}`);
    log.error(`  URL: ${hasUrl ? `"${target.URL}"` : 'MISSING'}`);
    
    const error = 'FATAL ERROR: Target property does not have sufficient data. ' +
                  'Target MUST have either (Address + Postcode) OR a URL to scrape. ' +
                  'Current target has neither.';
    log.error(error);
    throw new Error(error);
}

module.exports = {
    findTarget
};