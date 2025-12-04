const { log } = require('apify');

/**
 * RIGHTMOVE APIFY SUB-ACTOR SCRAPER
 * 
 * ⚠️ DEPRECATED - FIX 4: Replaced by direct HTTP scraping (rightmoveScraper.js)
 * 
 * This module is no longer used. The project now uses direct HTTP scraping
 * with Cheerio instead of Apify sub-actors to avoid subscription costs.
 * 
 * All functionality has been moved to src/scrapers/rightmoveScraper.js
 * which provides direct scraping without requiring Apify subscriptions.
 * 
 * @deprecated Use rightmoveScraper.js instead
 */

/**
 * @deprecated Use scrapeRightmoveListing from rightmoveScraper.js instead
 */
async function scrapeRightmoveSoldListingViaApify(url) {
    log.warning('⚠️  scrapeRightmoveSoldListingViaApify is deprecated. Use rightmoveScraper.js instead.');
    return { needs_review: 1, _scrapeError: 'Deprecated function - use rightmoveScraper.js' };
}

/**
 * @deprecated Use scrapeRightmovePostcodeSearch from rightmoveScraper.js instead
 */
async function scrapeRightmovePostcodeSearchViaApify(url) {
    log.warning('⚠️  scrapeRightmovePostcodeSearchViaApify is deprecated. Use rightmoveScraper.js instead.');
    return [{ needs_review: 1, _scrapeError: 'Deprecated function - use rightmoveScraper.js', URL: url }];
}

/**
 * @deprecated No longer needed - direct scraping is now always used
 */
function shouldUseApifyScraping() {
    log.warning('⚠️  shouldUseApifyScraping is deprecated. Direct scraping is now always used.');
    return false;
}

module.exports = {
    scrapeRightmoveSoldListingViaApify,
    scrapeRightmovePostcodeSearchViaApify,
    shouldUseApifyScraping
};
