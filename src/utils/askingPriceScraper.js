const axios = require('axios');
const cheerio = require('cheerio');
const { log } = require('apify');

/**
 * BATCH 3: Extract asking price from live property listings
 * 
 * This module detects live listings and extracts the asking price.
 * Works with both Rightmove and PropertyData live listing URLs.
 * 
 * Use cases:
 * - Target property has a live listing URL
 * - Extract current asking price for valuation comparison
 * - Calculate £/sqft using asking price and floor area
 */

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_DELAY = 2000; // 2 seconds between requests
let lastRequestTime = 0;

/**
 * Determine if a URL is a live listing (not sold property)
 * @param {string} url - URL to check
 * @returns {boolean} True if URL appears to be a live listing
 */
function isLiveListing(url) {
    if (!url) return false;
    
    // Rightmove live listings use /properties/ path
    // Sold properties use /house-prices/details/ path
    if (url.includes('rightmove.co.uk')) {
        return url.includes('/properties/') && !url.includes('/house-prices/');
    }
    
    // PropertyData live listings use /property/ path (not /transaction/)
    if (url.includes('propertydata.co.uk')) {
        return url.includes('/property/') && !url.includes('/transaction/');
    }
    
    return false;
}

/**
 * Extract asking price from Rightmove live listing
 * @param {string} url - Rightmove listing URL
 * @returns {Object} {price: number, priceText: string} or null
 */
async function extractRightmoveAskingPrice(url) {
    await rateLimitDelay();
    
    log.info(`Extracting asking price from Rightmove: ${url}`);
    
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
        
        // Try multiple selectors for asking price
        // Rightmove uses various selectors depending on page layout
        let priceText = $('span[data-testid="price"]').first().text().trim() ||
                       $('._1gfnqJ3Vtd1z40MlC0MzXu').first().text().trim() ||
                       $('article[data-test="price"]').first().text().trim() ||
                       $('div:contains("£")').first().text().match(/£[\d,]+/)?.[0];
        
        if (!priceText) {
            log.warning(`Could not find asking price on Rightmove page: ${url}`);
            return null;
        }
        
        // Extract numeric price
        const priceMatch = priceText.match(/£?([\d,]+)/);
        if (!priceMatch) {
            log.warning(`Could not parse price from text: ${priceText}`);
            return null;
        }
        
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        
        log.info(`Extracted asking price: £${price.toLocaleString()}`);
        
        return {
            price: price,
            priceText: `£${price.toLocaleString()}`
        };
        
    } catch (error) {
        log.error(`Failed to extract Rightmove asking price from ${url}:`, error.message);
        return null;
    }
}

/**
 * Extract asking price from PropertyData live listing
 * @param {string} url - PropertyData listing URL
 * @returns {Object} {price: number, priceText: string} or null
 */
async function extractPropertyDataAskingPrice(url) {
    await rateLimitDelay();
    
    log.info(`Extracting asking price from PropertyData: ${url}`);
    
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
        
        // PropertyData shows asking price in various locations
        // Look in property details table and main content
        let priceText = null;
        
        // Check in property details table
        $('table tr, .property-details li').each((i, elem) => {
            const text = $(elem).text().trim();
            if (text.match(/asking price|price|guide price/i) && text.match(/£/)) {
                const match = text.match(/£([\d,]+)/);
                if (match) {
                    priceText = `£${match[1]}`;
                    return false; // Break loop
                }
            }
        });
        
        // Fallback: search entire page for price pattern
        if (!priceText) {
            const bodyText = $('body').text();
            const priceMatch = bodyText.match(/(?:asking|guide|price)?\s*£([\d,]+)/i);
            if (priceMatch) {
                priceText = `£${priceMatch[1]}`;
            }
        }
        
        if (!priceText) {
            log.warning(`Could not find asking price on PropertyData page: ${url}`);
            return null;
        }
        
        // Extract numeric price
        const priceMatch = priceText.match(/£([\d,]+)/);
        if (!priceMatch) {
            log.warning(`Could not parse price from text: ${priceText}`);
            return null;
        }
        
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        
        log.info(`Extracted asking price: £${price.toLocaleString()}`);
        
        return {
            price: price,
            priceText: `£${price.toLocaleString()}`
        };
        
    } catch (error) {
        log.error(`Failed to extract PropertyData asking price from ${url}:`, error.message);
        return null;
    }
}

/**
 * Extract asking price from live listing URL (auto-detect source)
 * @param {string} url - Listing URL (Rightmove or PropertyData)
 * @returns {Object} {price: number, priceText: string, source: string} or null
 */
async function extractAskingPrice(url) {
    if (!url) {
        log.warning('No URL provided for asking price extraction');
        return null;
    }
    
    // Check if URL is a live listing
    if (!isLiveListing(url)) {
        log.info(`URL is not a live listing, skipping asking price extraction: ${url}`);
        return null;
    }
    
    let result = null;
    let source = null;
    
    // Determine source and extract price
    if (url.includes('rightmove.co.uk')) {
        result = await extractRightmoveAskingPrice(url);
        source = 'Rightmove';
    } else if (url.includes('propertydata.co.uk')) {
        result = await extractPropertyDataAskingPrice(url);
        source = 'PropertyData';
    } else {
        log.warning(`Unknown listing source: ${url}`);
        return null;
    }
    
    if (result) {
        result.source = source;
    }
    
    return result;
}

/**
 * Calculate £/sqft from asking price and floor area
 * @param {number} askingPrice - Asking price in pounds
 * @param {number} floorArea - Floor area in square feet
 * @returns {string} Formatted £/sqft (e.g., "£125") or null
 */
function calculatePricePerSqft(askingPrice, floorArea) {
    if (!askingPrice || !floorArea || floorArea === 0) {
        return null;
    }
    
    const pricePerSqft = Math.round(askingPrice / floorArea);
    return `£${pricePerSqft}`;
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
    isLiveListing,
    extractAskingPrice,
    extractRightmoveAskingPrice,
    extractPropertyDataAskingPrice,
    calculatePricePerSqft
};
