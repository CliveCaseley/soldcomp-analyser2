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
 * Handles both sold property detail pages and regular listings
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
                'Upgrade-Insecure-Requests': '1',
                'Referer': 'https://www.rightmove.co.uk/'
            },
            timeout: 30000
        });

        const $ = cheerio.load(response.data);
        const html = response.data;
        const data = {};

        // Check if this is a sold property details page (house-prices/details/)
        const isSoldDetailsPage = url.includes('/house-prices/details/');

        if (isSoldDetailsPage) {
            // Extract data from sold property details page
            
            // Address - try multiple selectors
            const address = $('h1').first().text().trim() ||
                           $('h1[itemprop="address"]').text().trim() ||
                           $('.sold-prices-content h1').text().trim();
            if (address) {
                data.Address = address;
                
                // Extract postcode from address
                const postcodeMatch = address.match(/([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})$/i);
                if (postcodeMatch) {
                    data.Postcode = postcodeMatch[1];
                }
            }

            // Sold date - look for date patterns
            const datePattern = /sold[^<>]*?(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/gi;
            const dateMatch = html.match(datePattern);
            if (dateMatch && dateMatch[0]) {
                const extractedDate = dateMatch[0].match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
                if (extractedDate) {
                    data['Date of sale'] = extractedDate[1];
                }
            }

            // Price - look for £ amount
            const priceMatch = html.match(/£([\d,]+)/);
            if (priceMatch) {
                data.Price = parseFloat(priceMatch[1].replace(/,/g, ''));
            }

            // Property type - look in detail lists
            $('dt, th').each((i, elem) => {
                const label = $(elem).text().trim().toLowerCase();
                const value = $(elem).next('dd, td').text().trim() || 
                             $(elem).parent().next().text().trim();
                
                if (label.includes('property type') || label.includes('type')) {
                    data.Type = value;
                }
                
                if (label.includes('bedroom') && !data.Bedrooms) {
                    const bedroomMatch = value.match(/(\d+)/);
                    if (bedroomMatch) {
                        data.Bedrooms = parseInt(bedroomMatch[1]);
                    }
                }
                
                if (label.includes('bathroom') && !data.Bathrooms) {
                    const bathroomMatch = value.match(/(\d+)/);
                    if (bathroomMatch) {
                        data.Bathrooms = parseInt(bathroomMatch[1]);
                    }
                }
            });

            // Fallback: extract from text content
            if (!data.Bedrooms) {
                const bedroomMatch = html.match(/(\d+)\s*bedroom/i);
                if (bedroomMatch) {
                    data.Bedrooms = parseInt(bedroomMatch[1]);
                }
            }

            if (!data.Bathrooms) {
                const bathroomMatch = html.match(/(\d+)\s*bathroom/i);
                if (bathroomMatch) {
                    data.Bathrooms = parseInt(bathroomMatch[1]);
                }
            }

            if (!data.Type) {
                // Common property types
                const typeMatch = html.match(/(detached|semi-detached|terraced|flat|bungalow|apartment|house)/i);
                if (typeMatch) {
                    data.Type = typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1);
                }
            }

        } else {
            // Regular listing page scraping (existing logic)
            
            // Extract address
            const address = $('h1[itemprop="streetAddress"]').text().trim() ||
                           $('._2uQQ3SV0eMHL1P6t5ZDo2q').first().text().trim() ||
                           $('h1').first().text().trim();
            if (address) {
                const parts = address.split(',').map(p => p.trim());
                const lastPart = parts[parts.length - 1];
                
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
                data.Price = parseFloat(price.replace(/[£,]/g, '').trim());
            }

            // Extract bedrooms
            const bedrooms = $('div:contains("BEDROOMS")').next().text().trim() ||
                            $('[data-testid="beds-label"]').text().match(/\d+/)?.[0];
            if (bedrooms) {
                data.Bedrooms = parseInt(bedrooms);
            }

            // Extract bathrooms
            const bathrooms = $('div:contains("BATHROOMS")').next().text().trim() ||
                             $('[data-testid="baths-label"]').text().match(/\d+/)?.[0];
            if (bathrooms) {
                data.Bathrooms = parseInt(bathrooms);
            }

            // Extract property type
            const type = $('div:contains("PROPERTY TYPE")').next().text().trim() ||
                        $('._2RnXSVJcWbWv4IpBC1Sng6').text().trim();
            if (type) {
                data.Type = type;
            }

            // Extract date of sale (for sold properties)
            const saleDate = $('div:contains("Sold")').text().match(/Sold\s+on\s+([\d\/]+)/i);
            if (saleDate) {
                data['Date of sale'] = saleDate[1];
            }
        }

        // Common fields for both types
        
        // Extract square footage
        const sqft = html.match(/([\d,]+)\s*sq\s*\.?\s*ft/i);
        if (sqft) {
            data['Sq. ft'] = parseFloat(sqft[1].replace(/,/g, ''));
        }

        // Extract tenure
        const tenureMatch = html.match(/(Freehold|Leasehold)/i);
        if (tenureMatch) {
            data.Tenure = tenureMatch[1];
        }

        // Extract property hero image (first property photo, not map/icons)
        // Rightmove pages show map images first, then actual property photos
        let imageUrl = null;
        
        $('img').each((i, elem) => {
            const src = $(elem).attr('src');
            const alt = $(elem).attr('alt');
            
            // Skip map images, icons, and other non-property images
            if (src && 
                !src.includes('map/_generate') && 
                !src.includes('property-marker') && 
                !src.includes('house-pound') && 
                !src.includes('icon') &&
                !src.includes('logo') &&
                src.includes('media.rightmove.co.uk')) {
                
                imageUrl = src;
                return false; // Break the loop - first property photo found
            }
        });
        
        // Fallback to meta tag or first image if no property photo found
        if (!imageUrl) {
            imageUrl = $('meta[property="og:image"]').attr('content') || 
                       $('img[itemprop="image"]').attr('src');
        }
        
        if (imageUrl) {
            data.Image_URL = imageUrl;
        }

        // Add URL to data
        data.URL = url;
        
        // BATCH 3: Store Rightmove URL in dedicated column for Excel hyperlinks
        data.URL_Rightmove = url;

        // Validation - mark for review if critical fields missing
        if (!data.Address || !data.Price) {
            data.needs_review = 1;
            data._scrapeError = 'Missing critical fields';
        }

        log.info(`Successfully scraped Rightmove listing: ${data.Address || 'Unknown address'}`);
        return data;
        
    } catch (error) {
        log.error(`Failed to scrape Rightmove listing ${url}:`, error.message);
        return { 
            needs_review: 1, 
            _scrapeError: error.message,
            URL: url 
        };
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