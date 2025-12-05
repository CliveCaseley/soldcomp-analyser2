/**
 * Generate Excel HYPERLINK formula
 * @param {string} url - URL to link to
 * @param {string} text - Display text
 * @returns {string} Excel HYPERLINK formula
 */
function generateHyperlink(url, text = 'View') {
    if (!url || url === '') {
        return '';
    }
    
    // Escape quotes in URL
    const escapedUrl = url.replace(/"/g, '""');
    return `=HYPERLINK("${escapedUrl}", "${text}")`;
}

/**
 * Add hyperlink formulas to properties
 * ENHANCEMENT B: Add hyperlinked URL columns for all URLs
 * - URL → Link (existing)
 * - EPC Certificate → EPC Certificate Link (new)
 * - Google Streetview URL → Google Streetview Link (already exists in geocoder)
 * 
 * BATCH 3: Add separate URL columns for Rightmove and PropertyData
 * - URL_Rightmove → URL_Rightmove (hyperlink)
 * - URL_PropertyData → URL_PropertyData (hyperlink)
 * 
 * @param {Array<Object>} properties - Array of properties
 * @returns {Array<Object>} Properties with Link columns
 */
function addHyperlinks(properties) {
    return properties.map(property => {
        // Main URL hyperlink (Rightmove, PropertyData, etc.)
        if (property.URL) {
            property.Link = generateHyperlink(property.URL, 'View');
        } else {
            property.Link = '';
        }
        
        // ENHANCEMENT B: EPC Certificate hyperlink
        if (property['EPC Certificate']) {
            property['EPC Certificate Link'] = generateHyperlink(property['EPC Certificate'], 'View EPC');
        } else {
            property['EPC Certificate Link'] = '';
        }
        
        // BATCH 3: Rightmove URL hyperlink
        if (property.URL_Rightmove) {
            // Store both the raw URL and hyperlink formula
            // Excel will display the hyperlink formula as a clickable link
            property['Rightmove Link'] = generateHyperlink(property.URL_Rightmove, 'View RM');
        } else {
            property['Rightmove Link'] = '';
        }
        
        // BATCH 3: PropertyData URL hyperlink
        if (property.URL_PropertyData) {
            // Store both the raw URL and hyperlink formula
            // Excel will display the hyperlink formula as a clickable link
            property['PropertyData Link'] = generateHyperlink(property.URL_PropertyData, 'View PD');
        } else {
            property['PropertyData Link'] = '';
        }
        
        // Note: Google Streetview Link is already added in geocoder.js
        // property['Google Streetview Link'] already exists
        
        return property;
    });
}

module.exports = {
    generateHyperlink,
    addHyperlinks
};