const axios = require('axios');
const cheerio = require('cheerio');
const { log } = require('apify');

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_DELAY = 2000; // 2 seconds between requests
let lastRequestTime = 0;

/**
 * Scrape PropertyData transaction page
 * 
 * CRITICAL FIX (v2.0): Floor Area vs £/sqft Extraction
 * ------------------------------------------------------
 * PropertyData pages contain BOTH floor area measurements AND price per sqft:
 *   - "1200 sq ft" (actual floor area) → should go to 'Sq. ft' column
 *   - "£93 per sq ft" (price per sqft) → should go to '£/sqft' column
 * 
 * Previous Issue:
 *   - Regex matched BOTH patterns, causing £/sqft values to overwrite floor area
 *   - Result: 'Sq. ft' column showed "£93" instead of "1200"
 *   - Broke ranking algorithm (floor area is 40% weight)
 * 
 * Solution:
 *   1. Extract £/sqft FIRST using pattern: £\d+ per/\/ sq ft
 *   2. Extract floor area SECOND with negative lookahead to exclude currency
 *   3. Add validation: floor area must be 50-10000 sq ft (reasonable range)
 *   4. Calculate Sqm automatically from Sq. ft
 *   5. Fallback to body text scan if table extraction fails
 * 
 * @param {string} url - PropertyData URL
 * @returns {Object} Scraped property data with proper Sq. ft, Sqm, and £/sqft fields
 */
async function scrapePropertyData(url) {
    await rateLimitDelay();
    
    log.info(`Scraping PropertyData: ${url}`);
    
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-GB,en;q=0.9'
            },
            timeout: 30000
        });

        const $ = cheerio.load(response.data);
        const data = {};

        // Extract address
        const address = $('h1.property-address, .property-title, h1').first().text().trim();
        if (address) {
            // Try to split address and postcode
            const parts = address.split(',').map(p => p.trim());
            const lastPart = parts[parts.length - 1];
            
            if (/^[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}$/i.test(lastPart)) {
                data.Postcode = lastPart;
                data.Address = parts.slice(0, -1).join(', ');
            } else {
                data.Address = address;
            }
        }

        // Extract property details from table or list
        // Critical: Extract £/sqft BEFORE floor area to prevent confusion
        // PropertyData pages can show both "1200 sq ft" (floor area) and "£93 per sq ft" (price/sqft)
        $('table tr, .property-details li').each((i, elem) => {
            const text = $(elem).text().trim();
            
            // Date of sale
            if (text.match(/Date of sale|Sale date/i)) {
                const date = $(elem).find('td').last().text().trim() || text.split(':').pop().trim();
                if (date) data['Date of sale'] = date;
            }
            
            // Price
            if (text.match(/Price|Sale price/i)) {
                const price = $(elem).find('td').last().text().trim() || text.split(':').pop().trim();
                if (price) {
                    data.Price = price.replace(/[£,]/g, '').trim();
                }
            }
            
            // Property type
            if (text.match(/Property type|Type/i)) {
                const type = $(elem).find('td').last().text().trim() || text.split(':').pop().trim();
                if (type) data.Type = type;
            }
            
            // Tenure
            if (text.match(/Tenure/i)) {
                const tenure = $(elem).find('td').last().text().trim() || text.split(':').pop().trim();
                if (tenure) data.Tenure = tenure;
            }
            
            // Bedrooms
            if (text.match(/Bedrooms?/i)) {
                const beds = $(elem).find('td').last().text().trim() || text.split(':').pop().trim();
                const bedsNum = parseInt(beds);
                if (!isNaN(bedsNum)) data.Bedrooms = bedsNum;
            }
            
            // Price per square foot (extract FIRST before floor area)
            // Matches patterns like: "£93 per sq ft", "£132/sq ft", "£125 per sqft"
            if (text.match(/£\s*[\d,]+\s*(per|\/)\s*sq\.?\s*ft/i)) {
                const pricePerSqft = text.match(/£\s*([\d,]+)\s*(?:per|\/)\s*sq\.?\s*ft/i);
                if (pricePerSqft) {
                    data['£/sqft'] = `£${pricePerSqft[1]}`;
                    log.debug(`Extracted £/sqft: ${data['£/sqft']} from text: ${text}`);
                }
            }
            
            // Actual floor area (extract AFTER £/sqft to avoid confusion)
            // Use negative lookahead to exclude lines with currency symbols (£, $, €)
            // Matches patterns like: "1200 sq ft", "Floor area: 950 sq ft", "1,200 sqft", "875 square feet"
            // Does NOT match: "£93 per sq ft" (already handled above)
            if (text.match(/sq\.?\s*ft|square\s+feet|floor area/i) && !text.match(/[£$€]\s*[\d,]+/)) {
                const sqft = text.match(/(?<![£$€])\b([\d,]+)\s*(?:sq\.?\s*ft|square\s+feet)/i);
                if (sqft) {
                    const sqftValue = parseFloat(sqft[1].replace(/,/g, ''));
                    // Additional validation: floor area should be reasonable (50-10000 sq ft)
                    if (sqftValue >= 50 && sqftValue <= 10000) {
                        data['Sq. ft'] = sqftValue;
                        log.debug(`Extracted floor area: ${data['Sq. ft']} sq ft from text: ${text}`);
                    }
                }
            }
        });

        // Fallback: If floor area or £/sqft not found in tables, scan entire page body
        if (!data['Sq. ft'] || !data['£/sqft']) {
            const bodyText = $('body').text();
            
            // Fallback for £/sqft
            if (!data['£/sqft']) {
                const pricePerSqftMatch = bodyText.match(/£\s*([\d,]+)\s*(?:per|\/)\s*sq\.?\s*ft/i);
                if (pricePerSqftMatch) {
                    data['£/sqft'] = `£${pricePerSqftMatch[1]}`;
                    log.debug(`Fallback: Extracted £/sqft: ${data['£/sqft']}`);
                }
            }
            
            // Fallback for floor area (only if no currency symbol nearby)
            if (!data['Sq. ft']) {
                // Look for patterns like "Floor area: 1200 sq ft" or just "1200 sq ft"
                // Split body into lines to avoid matching across unrelated content
                const lines = bodyText.split('\n');
                for (const line of lines) {
                    // Skip lines with currency symbols
                    if (line.match(/[£$€]/)) continue;
                    
                    const sqftMatch = line.match(/(?:floor\s*area|internal\s*area)?\s*:?\s*([\d,]+)\s*(?:sq\.?\s*ft|square\s+feet)/i);
                    if (sqftMatch) {
                        const sqftValue = parseFloat(sqftMatch[1].replace(/,/g, ''));
                        if (sqftValue >= 50 && sqftValue <= 10000) {
                            data['Sq. ft'] = sqftValue;
                            log.debug(`Fallback: Extracted floor area: ${data['Sq. ft']} sq ft`);
                            break;
                        }
                    }
                }
            }
        }

        // Calculate Sqm if Sq. ft is available
        if (data['Sq. ft'] && !isNaN(data['Sq. ft'])) {
            data.Sqm = Math.round(data['Sq. ft'] * 0.092903); // 1 sq ft = 0.092903 sqm
            log.debug(`Calculated Sqm: ${data.Sqm} from ${data['Sq. ft']} sq ft`);
        }

        // Extract image
        const imageUrl = $('img.property-image, .property-photo img, meta[property="og:image"]').first().attr('src') ||
                        $('meta[property="og:image"]').attr('content');
        if (imageUrl) {
            data.Image_URL = imageUrl.startsWith('http') ? imageUrl : `https://lh7-us.googleusercontent.com/8FqRXHn5L7pxh5f4QewRSuYUqmoq6YsT8U_QFKl0VWVMwQmmeRqn1w8Vpr22OmesfnCYEuiNGRZj591HQobmSwrLBhALNrNsAWN4621XTXNIqcuh8ky-wZ8umPY5UXq7tQuszVkgNgFVOHyWBhq461c`;
        }

        log.info(`Successfully scraped PropertyData: ${data.Address || 'Unknown address'}`);
        return data;
        
    } catch (error) {
        log.error(`Failed to scrape PropertyData ${url}:`, error.message);
        return { needs_review: 1, _scrapeError: error.message };
    }
}

/**
 * Rate limiting delay
 */
async function rateLimitDelay() {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
        const delay = RATE_LIMIT_DELAY - timeSinceLastRequest;
        log.info(`Rate limiting: waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    lastRequestTime = Date.now();
}

module.exports = {
    scrapePropertyData
};