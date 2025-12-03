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
 * @param {Array<Object>} properties - Array of properties
 * @returns {Array<Object>} Properties with Link column
 */
function addHyperlinks(properties) {
    return properties.map(property => {
        if (property.URL) {
            property.Link = generateHyperlink(property.URL, 'View');
        } else {
            property.Link = '';
        }
        return property;
    });
}

module.exports = {
    generateHyperlink,
    addHyperlinks
};