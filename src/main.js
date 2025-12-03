const { Actor, log } = require('apify');
const { parseCSV, cleanProperty } = require('./utils/csvParser');
const { findTarget } = require('./utils/targetFinder');
const { classifyURLs, tagURLOnlyProperties, URL_TYPES } = require('./utils/urlClassifier');
const { scrapeRightmoveListing, scrapeRightmovePostcodeSearch } = require('./scrapers/rightmoveScraper');
const { scrapePropertyData } = require('./scrapers/propertyDataScraper');
const { geocodeAddress, generateStreetviewURL } = require('./utils/geocoder');
const { calculateDistance, formatDistance } = require('./utils/distanceCalculator');
const { scrapeEPCData, createEPCLookupRow } = require('./utils/epcHandler');
const { rankProperties } = require('./utils/rankingEngine');
const { detectAndMergeDuplicates } = require('./utils/duplicateDetector');
const { addHyperlinks } = require('./utils/excelHelper');
const { readCSVFromKVS, writeCSVToKVS } = require('./utils/kvsHandler');

/**
 * Main actor entry point
 */
Actor.main(async () => {
    log.info('Soldcomp-Analyser2 Actor starting...');
    
    try {
        // Step 1: Get environment variables
        const EPC_API_KEY = process.env.EPC_API_KEY;
        const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
        const KV_STORE_NAME = process.env.KV_STORE_NAME || 'clive.caseley/soldcomp-analyser-kvs';
        const DATA_KEY = process.env.DATA_KEY || 'data.csv';
        const OUTPUT_KEY = process.env.OUTPUT_KEY || 'output.csv';
        
        log.info('Environment variables loaded:');
        log.info(`  KV_STORE_NAME: ${KV_STORE_NAME}`);
        log.info(`  DATA_KEY: ${DATA_KEY}`);
        log.info(`  OUTPUT_KEY: ${OUTPUT_KEY}`);
        log.info(`  EPC_API_KEY: ${EPC_API_KEY ? 'Set' : 'Not set'}`);
        log.info(`  GOOGLE_API_KEY: ${GOOGLE_API_KEY ? 'Set' : 'Not set'}`);
        
        if (!GOOGLE_API_KEY) {
            log.warning('GOOGLE_API_KEY not set - distance calculation and streetview will be skipped');
        }
        
        // Step 2: Read CSV from KVS
        log.info('=== STEP 1: Reading CSV from KVS ===');
        const csvContent = await readCSVFromKVS(KV_STORE_NAME, DATA_KEY);
        
        // Step 3: Parse CSV with flexible header detection
        log.info('=== STEP 2: Parsing CSV ===');
        let properties = parseCSV(csvContent);
        log.info(`Parsed ${properties.length} properties`);
        
        // Step 4: Clean and normalize properties
        log.info('=== STEP 3: Cleaning and normalizing data ===');
        properties = properties.map(cleanProperty);
        
        // Step 5: Find target property (CRITICAL)
        log.info('=== STEP 4: Finding target property ===');
        const { target, comparables } = findTarget(properties);
        log.info(`Target property: ${target.Address}, ${target.Postcode}`);
        log.info(`Comparable properties: ${comparables.length}`);
        
        // Step 6: Classify URLs
        log.info('=== STEP 5: Classifying URLs ===');
        const classifiedURLs = classifyURLs(comparables);
        
        // Step 6.5: Tag URL-only properties with _source metadata for proper ordering
        log.info('=== STEP 5.5: Tagging URL-only properties ===');
        tagURLOnlyProperties(comparables);
        
        // Step 7: Scrape URLs
        log.info('=== STEP 6: Scraping URLs ===');
        const scrapedProperties = await scrapeAllURLs(classifiedURLs);
        log.info(`Scraped ${scrapedProperties.length} properties from URLs`);
        
        // Step 8: Merge scraped data with existing properties
        log.info('=== STEP 7: Merging scraped data ===');
        let allProperties = mergeScrapedData(comparables, scrapedProperties);
        log.info(`Total properties after merging: ${allProperties.length}`);
        
        // Step 9: Detect and merge duplicates
        log.info('=== STEP 8: Detecting duplicates ===');
        allProperties = detectAndMergeDuplicates(allProperties);
        
        // Step 10: Geocode properties and calculate distances
        if (GOOGLE_API_KEY) {
            log.info('=== STEP 9: Geocoding and calculating distances ===');
            await geocodeAndCalculateDistances(allProperties, target, GOOGLE_API_KEY);
        } else {
            log.warning('Skipping geocoding and distance calculation (no GOOGLE_API_KEY)');
        }
        
        // Step 11: Enrich with EPC data
        log.info('=== STEP 10: Enriching with EPC data ===');
        await enrichWithEPCData(allProperties);
        
        // Step 12: Rank comparable properties
        log.info('=== STEP 11: Ranking comparable properties ===');
        const rankedProperties = rankProperties(allProperties, target);
        
        // Step 13: Add Excel hyperlinks
        log.info('=== STEP 12: Adding Excel hyperlinks ===');
        const withHyperlinks = addHyperlinks([target, ...rankedProperties]);
        
        // Step 14: Prepare final output with proper ordering
        log.info('=== STEP 13: Preparing final output ===');
        const finalOutput = prepareOutput(withHyperlinks, target);
        log.info(`Final output: ${finalOutput.length} rows`);
        
        // Step 15: Write output to KVS
        log.info('=== STEP 14: Writing output to KVS ===');
        await writeCSVToKVS(finalOutput, KV_STORE_NAME, OUTPUT_KEY);
        
        log.info('=== Actor completed successfully! ===');
        
    } catch (error) {
        log.error('Actor failed with error:', error);
        throw error;
    }
});

/**
 * Scrape all classified URLs
 * @param {Object} classifiedURLs - Classified URLs by type
 * @returns {Array<Object>} Scraped properties
 */
async function scrapeAllURLs(classifiedURLs) {
    const scrapedProperties = [];
    
    // Scrape Rightmove postcode searches
    for (const { url } of classifiedURLs[URL_TYPES.RIGHTMOVE_POSTCODE_SEARCH]) {
        log.info(`Scraping Rightmove postcode search: ${url}`);
        const properties = await scrapeRightmovePostcodeSearch(url);
        scrapedProperties.push(...properties.map(p => ({ ...p, _source: 'postcode_search' })));
    }
    
    // Scrape individual Rightmove sold listings
    for (const { url, property } of classifiedURLs[URL_TYPES.RIGHTMOVE_SOLD_LISTING]) {
        log.info(`Scraping Rightmove sold listing: ${url}`);
        const data = await scrapeRightmoveListing(url);
        scrapedProperties.push({ ...property, ...data, URL: url });
    }
    
    // Scrape individual Rightmove for-sale listings
    for (const { url, property } of classifiedURLs[URL_TYPES.RIGHTMOVE_FORSALE_LISTING]) {
        log.info(`Scraping Rightmove for-sale listing: ${url}`);
        const data = await scrapeRightmoveListing(url);
        scrapedProperties.push({ ...property, ...data, URL: url });
    }
    
    // Scrape PropertyData URLs
    for (const { url, property } of classifiedURLs[URL_TYPES.PROPERTYDATA]) {
        log.info(`Scraping PropertyData: ${url}`);
        const data = await scrapePropertyData(url);
        scrapedProperties.push({ ...property, ...data, URL: url });
    }
    
    return scrapedProperties;
}

/**
 * Merge scraped data with existing properties
 * @param {Array<Object>} existing - Existing properties
 * @param {Array<Object>} scraped - Scraped properties
 * @returns {Array<Object>} Merged properties
 */
function mergeScrapedData(existing, scraped) {
    // Combine all properties
    const all = [...existing, ...scraped];
    
    // Clean all properties
    return all.map(cleanProperty);
}

/**
 * Geocode properties and calculate distances from target
 * @param {Array<Object>} properties - Properties to geocode
 * @param {Object} target - Target property
 * @param {string} apiKey - Google API key
 */
async function geocodeAndCalculateDistances(properties, target, apiKey) {
    // Geocode target property first
    log.info('Geocoding target property...');
    const targetGeocode = await geocodeAddress(target.Address, target.Postcode, apiKey);
    
    if (!targetGeocode) {
        log.warning('Failed to geocode target property - distances cannot be calculated');
        return;
    }
    
    target._geocode = targetGeocode;
    target['Google Streetview URL'] = generateStreetviewURL(targetGeocode.lat, targetGeocode.lng);
    
    // Geocode all comparable properties
    for (const property of properties) {
        if (!property.Address || !property.Postcode) {
            log.warning(`Skipping geocoding for property without address/postcode`);
            property.needs_review = 1;
            continue;
        }
        
        const geocode = await geocodeAddress(property.Address, property.Postcode, apiKey);
        
        if (geocode) {
            property._geocode = geocode;
            property['Google Streetview URL'] = generateStreetviewURL(geocode.lat, geocode.lng);
            
            // Calculate distance from target
            const distance = calculateDistance(
                targetGeocode.lat,
                targetGeocode.lng,
                geocode.lat,
                geocode.lng
            );
            
            property._distanceValue = distance; // Store numeric value for ranking
            property.Distance = formatDistance(distance);
            
            log.info(`  ${property.Address}: ${property.Distance}`);
        } else {
            log.warning(`Failed to geocode: ${property.Address}, ${property.Postcode}`);
            property.needs_review = 1;
        }
    }
}

/**
 * Enrich properties with EPC data
 * @param {Array<Object>} properties - Properties to enrich
 */
async function enrichWithEPCData(properties) {
    for (const property of properties) {
        if (!property.Postcode) continue;
        
        try {
            const epcData = await scrapeEPCData(property.Postcode, property.Address);
            if (epcData && epcData.rating) {
                property['EPC rating'] = epcData.rating;
            }
        } catch (error) {
            log.warning(`Failed to fetch EPC data for ${property.Address}: ${error.message}`);
        }
    }
}

/**
 * Prepare final output with proper ordering
 * @param {Array<Object>} properties - All properties (target + comparables)
 * @param {Object} target - Target property
 * @returns {Array<Object>} Ordered output
 */
/**
 * Prepare output data in the correct order per SPEC v01.docx:
 * 1. Rightmove postcode search URLs (top)
 * 2. EPC lookup row
 * 3. Target property
 * 4. Individual Rightmove sold listings (URL-only rows from input CSV)
 * 5. PropertyData listings (ranked comparables)
 */
function prepareOutput(properties, target) {
    const output = [];
    
    // Separate different types of rows based on _source metadata
    const rightmovePostcodeSearches = properties.filter(p => 
        (p._source === 'postcode_search' || p._source === 'rightmove_postcode_search') && p !== target
    );
    
    const rightmoveIndividualListings = properties.filter(p => 
        p._source === 'rightmove_individual_listing' && p !== target
    );
    
    const propertydataListings = properties.filter(p => 
        p._source === 'propertydata_listing' && p !== target
    );
    
    // All other properties (comparables with full data)
    const comparables = properties.filter(p => 
        p !== target && 
        !p._source && 
        !rightmovePostcodeSearches.includes(p) &&
        !rightmoveIndividualListings.includes(p) &&
        !propertydataListings.includes(p)
    );
    
    // 1. Add Rightmove postcode search URLs (no ranking)
    rightmovePostcodeSearches.forEach(p => {
        p.Ranking = ''; // No ranking for URL-only rows
        output.push(p);
    });
    
    // 2. Add EPC lookup row
    const epcLookupRow = createEPCLookupRow(target.Postcode);
    output.push(epcLookupRow);
    
    // 3. Add target property (no ranking)
    target.Ranking = ''; // No ranking for target
    output.push(target);
    
    // 4. Add individual Rightmove sold listings from input CSV (no ranking)
    rightmoveIndividualListings.forEach(p => {
        p.Ranking = ''; // No ranking for URL-only rows
        output.push(p);
    });
    
    // 5. Add PropertyData URL-only listings from input CSV (no ranking)
    propertydataListings.forEach(p => {
        p.Ranking = ''; // No ranking for URL-only rows
        output.push(p);
    });
    
    // 6. Add ranked comparables (sorted by ranking, highest first)
    const rankedComparables = comparables
        .filter(p => p.Ranking !== undefined && p.Ranking !== '')
        .sort((a, b) => (b.Ranking || 0) - (a.Ranking || 0));
    
    output.push(...rankedComparables);
    
    log.info('Output structure per SPEC v01.docx:');
    log.info(`  1. Rightmove postcode search URLs: ${rightmovePostcodeSearches.length}`);
    log.info(`  2. EPC lookup row: 1`);
    log.info(`  3. Target property: 1`);
    log.info(`  4. Individual Rightmove listings: ${rightmoveIndividualListings.length}`);
    log.info(`  5. PropertyData listings: ${propertydataListings.length}`);
    log.info(`  6. Ranked comparables: ${rankedComparables.length}`);
    log.info(`  Total output rows: ${output.length}`);
    
    return output;
}