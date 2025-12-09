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
        
        // Image URL hyperlink
        if (property.Image_URL) {
            property['Image_URL Link'] = generateHyperlink(property.Image_URL, 'View Image');
        } else {
            property['Image_URL Link'] = '';
        }
        
        // ENHANCEMENT B: EPC Certificate hyperlink
        if (property['EPC Certificate']) {
            property['EPC Certificate Link'] = generateHyperlink(property['EPC Certificate'], 'View EPC');
        } else {
            property['EPC Certificate Link'] = '';
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