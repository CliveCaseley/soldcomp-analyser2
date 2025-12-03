const axios = require('axios');
const cheerio = require('cheerio');
const { log } = require('apify');

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_DELAY = 2500; // 2.5 seconds between requests
let lastRequestTime = 0;

/**
 * Scrape a Rightmove listing (sold or for-sale)
 * @param {string} url - Rightmove listing URL
 * @returns {Object} Scraped property data
 */
async function scrapeRightmoveListing(url) {
    await rateLimitDelay();
    
    log.info(`Scraping Rightmove listing: ${url}`);
    
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-GB,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 30000
        });

        const $ = cheerio.load(response.data);
        const data = {};

        // Extract address
        const address = $('h1[itemprop="streetAddress"]').text().trim() ||
                       $('._2uQQ3SV0eMHL1P6t5ZDo2q').first().text().trim() ||
                       $('h1').first().text().trim();
        if (address) {
            // Split address and postcode
            const parts = address.split(',').map(p => p.trim());
            const lastPart = parts[parts.length - 1];
            
            // Check if last part is a postcode
            if (/^[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}$/i.test(lastPart)) {
                data.Postcode = lastPart;
                data.Address = parts.slice(0, -1).join(', ');
            } else {
                data.Address = address;
            }
        }

        // Extract price
        const price = $('span[data-testid="price"]').text().trim() ||
                     $('._1gfnqJ3Vtd1z40MlC0MzXu').first().text().trim();
        if (price) {
            data.Price = price.replace(/[£,]/g, '').trim();
        }

        // Extract bedrooms
        const bedrooms = $('div:contains("BEDROOMS")').next().text().trim() ||
                        $('[data-testid="beds-label"]').text().match(/\d+/)?.[0];
        if (bedrooms) {
            data.Bedrooms = parseInt(bedrooms);
        }

        // Extract property type
        const type = $('div:contains("PROPERTY TYPE")').next().text().trim() ||
                    $('._2RnXSVJcWbWv4IpBC1Sng6').text().trim();
        if (type) {
            data.Type = type;
        }

        // Extract square footage
        const sqft = response.data.match(/([\d,]+)\s*sq\s*\.?\s*ft/i);
        if (sqft) {
            data['Sq. ft'] = parseFloat(sqft[1].replace(/,/g, ''));
        }

        // Extract tenure
        const tenure = response.data.match(/Tenure[:\s]*([A-Za-z]+)/i) ||
                      response.data.match(/(Freehold|Leasehold)/i);
        if (tenure) {
            data.Tenure = tenure[1];
        }

        // Extract image URL
        const imageUrl = $('img[itemprop="image"]').attr('src') ||
                        $('meta[property="og:image"]').attr('content') ||
                        $('._2BF5FRGRs6NWezFf-XNFvh img').first().attr('src');
        if (imageUrl) {
            data.Image_URL = imageUrl;
        }

        // Extract date of sale (for sold properties)
        const saleDate = $('div:contains("Sold")').text().match(/Sold\s+on\s+([\d\/]+)/i);
        if (saleDate) {
            data['Date of sale'] = saleDate[1];
        }

        log.info(`Successfully scraped Rightmove listing: ${data.Address || 'Unknown address'}`);
        return data;
        
    } catch (error) {
        log.error(`Failed to scrape Rightmove listing ${url}:`, error.message);
        return { needs_review: 1, _scrapeError: error.message };
    }
}

/**
 * Scrape Rightmove postcode search results
 * @param {string} url - Rightmove postcode search URL
 * @returns {Array<Object>} Array of property listings
 */
async function scrapeRightmovePostcodeSearch(url) {
    await rateLimitDelay();
    
    log.info(`Scraping Rightmove postcode search: ${url}`);
    
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-GB,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            },
            timeout: 30000
        });

        const $ = cheerio.load(response.data);
        const properties = [];

        // Find property cards (structure may vary)
        $('.propertyCard, .l-searchResult').each((i, elem) => {
            const property = {};

            // Extract address
            const address = $(elem).find('.propertyCard-address, address').text().trim();
            if (address) {
                // Try to split address and postcode
                const parts = address.split(',').map(p => p.trim());
                const lastPart = parts[parts.length - 1];
                
                if (/^[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}$/i.test(lastPart)) {
                    property.Postcode = lastPart;
                    property.Address = parts.slice(0, -1).join(', ');
                } else {
                    property.Address = address;
                }
            }

            // Extract price
            const price = $(elem).find('.propertyCard-priceValue').text().trim();
            if (price) {
                property.Price = price.replace(/[£,]/g, '').trim();
            }

            // Extract property URL
            const propertyUrl = $(elem).find('a.propertyCard-link').attr('href');
            if (propertyUrl) {
                property.URL = propertyUrl.startsWith('http') ? propertyUrl : `https://www.rightmove.co.uk${propertyUrl}`;
            }

            // Extract image
            const imageUrl = $(elem).find('img').first().attr('src');
            if (imageUrl) {
                property.Image_URL = imageUrl;
            }

            if (property.Address || property.URL) {
                properties.push(property);
            }
        });

        log.info(`Found ${properties.length} properties from postcode search`);
        return properties;
        
    } catch (error) {
        log.error(`Failed to scrape Rightmove postcode search ${url}:`, error.message);
        return [{ needs_review: 1, _scrapeError: error.message, URL: url }];
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
    scrapeRightmoveListing,
    scrapeRightmovePostcodeSearch
};