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
const { sanitizeProperties } = require('./utils/dataSanitizer');
const { detectManualEdits } = require('./utils/manualEditDetector');

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
        const parseResult = parseCSV(csvContent);
        let properties = parseResult.normalizedData;
        const preHeaderRows = parseResult.preHeaderRows;
        log.info(`Parsed ${properties.length} properties and ${preHeaderRows.length} pre-header rows`);
        
        // Step 4: Clean and normalize properties
        log.info('=== STEP 3: Cleaning and normalizing data ===');
        properties = properties.map(cleanProperty);
        
        // Step 4.5: Sanitize data (remove JS/HTML garbage, validate values)
        log.info('=== STEP 3.5: Sanitizing data (removing JS/HTML, validating values) ===');
        properties = sanitizeProperties(properties);
        
        // Step 5: Find target property (CRITICAL)
        log.info('=== STEP 4: Finding target property ===');
        const { target, comparables } = findTarget(properties, preHeaderRows);
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
        
        // Step 8.5: Sanitize scraped data (remove JS/HTML from scraped content)
        log.info('=== STEP 7.5: Sanitizing scraped data ===');
        allProperties = sanitizeProperties(allProperties);
        
        // Step 9: Detect and merge duplicates
        log.info('=== STEP 8: Detecting duplicates ===');
        allProperties = detectAndMergeDuplicates(allProperties);
        
        // Step 9.5: Detect manual edits before enrichment (BATCH 2)
        log.info('=== STEP 8.5: Detecting manual edits ===');
        for (const property of allProperties) {
            detectManualEdits(property);
        }
        // Also check target property
        detectManualEdits(target);
        
        // Step 10: Geocode properties and calculate distances
        if (GOOGLE_API_KEY) {
            log.info('=== STEP 9: Geocoding and calculating distances ===');
            await geocodeAndCalculateDistances(allProperties, target, GOOGLE_API_KEY);
        } else {
            log.warning('Skipping geocoding and distance calculation (no GOOGLE_API_KEY)');
        }
        
        // Step 11: Enrich with EPC data (including target)
        log.info('=== STEP 10: Enriching with EPC data ===');
        await enrichWithEPCData(allProperties, EPC_API_KEY);
        
        // ENHANCEMENT A: Fetch EPC certificate for target property
        log.info('=== STEP 10.1: Enriching target property with EPC data ===');
        await enrichWithEPCData([target], EPC_API_KEY);
        
        // Step 11.5: Final data processing - ensure Sqm calculated for ALL properties
        log.info('=== STEP 10.5: Final data processing (Sqm calculation) ===');
        finalizePropertyData(allProperties);
        finalizePropertyData([target]); // Also finalize target
        
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
 * 
 * FIX 4: Custom Rightmove Scraper (Direct HTTP with Cheerio)
 * - Uses direct HTTP scraping (no paid subscription required)
 * - Extracts: address, sold date, price, property type, bedrooms, bathrooms
 * - Handles errors gracefully with fallback values
 * - Addresses Issue #6: Rightmove URLs not scraped
 * 
 * @param {Object} classifiedURLs - Classified URLs by type
 * @returns {Array<Object>} Scraped properties
 */
async function scrapeAllURLs(classifiedURLs) {
    const scrapedProperties = [];
    
    log.info('Rightmove scraping mode: Direct HTTP with Cheerio');
    
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
 * 
 * CRITICAL FIX (v2.1): Latitude and Longitude Output
 * - Now maps geocoded coordinates to output columns (Latitude, Longitude)
 * - Previously stored in _geocode internal field only
 * 
 * ENHANCEMENT C: Geocode missing lat/long and calculate all distances
 * - Skip geocoding if lat/long already exists
 * - Always calculate distance if coordinates are available
 * - Fill missing coordinates for any property
 * 
 * @param {Array<Object>} properties - Properties to geocode
 * @param {Object} target - Target property
 * @param {string} apiKey - Google API key
 */
async function geocodeAndCalculateDistances(properties, target, apiKey) {
    // Geocode target property first (or use existing coordinates)
    log.info('Geocoding target property...');
    let targetGeocode;
    
    if (target.Latitude && target.Longitude) {
        log.info('Target already has coordinates, using existing values');
        targetGeocode = {
            lat: parseFloat(target.Latitude),
            lng: parseFloat(target.Longitude)
        };
        target._geocode = targetGeocode;
    } else {
        targetGeocode = await geocodeAddress(target.Address, target.Postcode, apiKey);
        
        if (!targetGeocode) {
            log.warning('Failed to geocode target property - distances cannot be calculated');
            return;
        }
        
        target._geocode = targetGeocode;
        target.Latitude = targetGeocode.lat;
        target.Longitude = targetGeocode.lng;
    }
    
    // Add/update target streetview URL
    const targetStreetviewURL = generateStreetviewURL(targetGeocode.lat, targetGeocode.lng);
    target['Google Streetview URL'] = targetStreetviewURL;
    target['Google Streetview Link'] = `=HYPERLINK("${targetStreetviewURL}", "View Map")`;
    
    // Geocode all comparable properties
    for (const property of properties) {
        if (!property.Address || !property.Postcode) {
            log.warning(`Skipping geocoding for property without address/postcode`);
            property.needs_review = 1;
            continue;
        }
        
        let geocode;
        
        // ENHANCEMENT C: Check if property already has coordinates
        if (property.Latitude && property.Longitude) {
            log.info(`Property already has coordinates: ${property.Address}`);
            geocode = {
                lat: parseFloat(property.Latitude),
                lng: parseFloat(property.Longitude)
            };
            property._geocode = geocode;
        } else {
            // Geocode if coordinates are missing
            geocode = await geocodeAddress(property.Address, property.Postcode, apiKey);
            
            if (geocode) {
                property._geocode = geocode;
                property.Latitude = geocode.lat;
                property.Longitude = geocode.lng;
            } else {
                log.warning(`Failed to geocode: ${property.Address}, ${property.Postcode}`);
                property.needs_review = 1;
                continue;
            }
        }
        
        // Add/update streetview URL
        const streetviewURL = generateStreetviewURL(geocode.lat, geocode.lng);
        property['Google Streetview URL'] = streetviewURL;
        property['Google Streetview Link'] = `=HYPERLINK("${streetviewURL}", "View Map")`;
        
        // ENHANCEMENT C: Always calculate distance if coordinates are available
        const distance = calculateDistance(
            targetGeocode.lat,
            targetGeocode.lng,
            geocode.lat,
            geocode.lng
        );
        
        property._distanceValue = distance; // Store numeric value for ranking
        property.Distance = formatDistance(distance);
        
        log.info(`  ${property.Address}: ${property.Distance} (${geocode.lat}, ${geocode.lng})`);
    }
}

/**
 * Enrich properties with EPC data
 * 
 * CRITICAL FIX (v2.1): EPC API Integration with Certificate URLs
 * - Now uses EPC API with authentication
 * - Populates both 'EPC rating' and 'EPC Certificate' columns
 * - Certificate column contains individual property certificate URLs
 * 
 * ENHANCEMENT D: Scrape floor area from EPC certificates
 * - Automatically scrapes floor area from certificate pages
 * - Falls back to direct certificate scraping if initial attempt failed
 * 
 * BATCH 2 ENHANCEMENT: Preserve manual edits
 * - Checks for manual edits before overwriting fields
 * - Preserves user corrections (e.g., manually corrected EPC URLs)
 * - Compares scraped vs existing data to detect manual changes
 * 
 * @param {Array<Object>} properties - Properties to enrich
 * @param {string} apiKey - EPC API key
 */
async function enrichWithEPCData(properties, apiKey) {
    const { scrapeFloorAreaFromCertificate } = require('./utils/epcHandler');
    const { compareAndMarkEPCEdit, compareAndMarkSqftEdit, canUpdateField } = require('./utils/manualEditDetector');
    
    for (const property of properties) {
        if (!property.Postcode) continue;
        
        try {
            const epcData = await scrapeEPCData(property.Postcode, property.Address, apiKey);
            
            if (epcData) {
                // Store EPC rating
                if (epcData.rating) {
                    property['EPC rating'] = epcData.rating;
                }
                
                // BATCH 2: Check if EPC Certificate is manually edited before updating
                if (epcData.certificateURL) {
                    // If property already has EPC Certificate, check for manual edit
                    if (property['EPC Certificate']) {
                        compareAndMarkEPCEdit(property, epcData.certificateURL);
                    }
                    
                    // Only update if not manually edited
                    if (canUpdateField(property, 'EPC Certificate')) {
                        property['EPC Certificate'] = epcData.certificateURL;
                        log.info(`  EPC Certificate URL: ${epcData.certificateURL}`);
                    } else {
                        log.info(`  ✓ Preserving manually edited EPC Certificate: ${property['EPC Certificate']}`);
                    }
                }
                
                // BATCH 1 ENHANCEMENT: Use EPC floor area as arbiter for conflicts
                let epcFloorAreaSqm = epcData.floorArea;
                
                // Try direct scraping if floor area not in initial data
                if (!epcFloorAreaSqm && epcData.certificateURL) {
                    log.info(`  Attempting direct floor area scrape from certificate...`);
                    epcFloorAreaSqm = await scrapeFloorAreaFromCertificate(epcData.certificateURL);
                }
                
                if (epcFloorAreaSqm) {
                    const epcSqFt = Math.round(epcFloorAreaSqm / 0.092903);
                    
                    // BATCH 2: Check for manual edit on square footage before updating
                    if (property['Sq. ft']) {
                        compareAndMarkSqftEdit(property, epcSqFt);
                    }
                    
                    // Check if this property has a floor area conflict from duplicate merging
                    if (property._floorAreaConflict) {
                        log.info(`  ✓ Resolving floor area conflict with EPC data...`);
                        log.info(`    Conflicting values: ${property._floorAreaConflict.value1} vs ${property._floorAreaConflict.value2}`);
                        log.info(`    EPC arbiter value: ${epcSqFt} sq ft (${epcFloorAreaSqm} sqm)`);
                        
                        // BATCH 2: Only update if not manually edited
                        if (canUpdateField(property, 'Sq. ft')) {
                            // Use EPC floor area as the authoritative source
                            property['Sq. ft'] = epcSqFt;
                            property.Sqm = epcFloorAreaSqm;
                            
                            // Update needs_review flag to indicate resolution
                            if (property.needs_review) {
                                property.needs_review = property.needs_review.replace(
                                    /Sq\. ft conflict: [^;]+/g,
                                    `Floor area resolved by EPC: ${epcSqFt} sqft`
                                );
                                property.needs_review = property.needs_review.replace(
                                    /Sqm conflict: [^;]+/g,
                                    `Floor area resolved by EPC: ${epcFloorAreaSqm} sqm`
                                );
                            }
                            
                            // Clean up conflict marker
                            delete property._floorAreaConflict;
                            
                            log.info(`  ✓ Conflict resolved using EPC floor area`);
                        } else {
                            log.info(`  ✓ Preserving manually edited square footage: ${property['Sq. ft']} sq ft`);
                        }
                    }
                    // Otherwise, use EPC floor area if property doesn't have it
                    else if (!property['Sq. ft']) {
                        property['Sq. ft'] = epcSqFt;
                        property.Sqm = epcFloorAreaSqm;
                        log.info(`  Using EPC floor area: ${epcSqFt} sq ft (${epcFloorAreaSqm} sqm)`);
                    }
                }
            }
        } catch (error) {
            log.warning(`Failed to fetch EPC data for ${property.Address}: ${error.message}`);
        }
    }
}

/**
 * Final data processing - ensure all calculated fields are present
 * 
 * CRITICAL FIX (v2.1): Sqm Calculation for ALL Properties
 * - Runs after all scraping and enrichment completes
 * - Calculates Sqm from Sq. ft for ANY property that has floor area
 * - Previously only calculated during CSV parsing or PropertyData scraping
 * 
 * BATCH 2 ENHANCEMENT: Respect manual edits
 * - Does not recalculate if fields are manually edited
 * 
 * @param {Array<Object>} properties - Properties to finalize
 */
function finalizePropertyData(properties) {
    const { canUpdateField } = require('./utils/manualEditDetector');
    let sqmCalculated = 0;
    
    for (const property of properties) {
        // Calculate Sqm from Sq. ft if missing (and not manually edited)
        if (property['Sq. ft'] && !property.Sqm && canUpdateField(property, 'Sqm')) {
            const sqft = parseFloat(property['Sq. ft']);
            if (!isNaN(sqft) && sqft > 0) {
                property.Sqm = Math.round(sqft * 0.092903); // 1 sq ft = 0.092903 sqm
                sqmCalculated++;
                log.info(`Calculated Sqm for ${property.Address || 'property'}: ${property.Sqm} sqm (from ${sqft} sq ft)`);
            }
        }
        
        // Calculate £/sqft from Price and Sq. ft if missing
        if (property.Price && property['Sq. ft'] && !property['£/sqft']) {
            const price = parseFloat(property.Price);
            const sqft = parseFloat(property['Sq. ft']);
            if (!isNaN(price) && !isNaN(sqft) && sqft > 0) {
                property['£/sqft'] = Math.round(price / sqft);
                log.info(`Calculated £/sqft for ${property.Address || 'property'}: £${property['£/sqft']}`);
            }
        }
    }
    
    log.info(`Final data processing: Calculated Sqm for ${sqmCalculated} properties`);
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
    // ═══════════════════════════════════════════════════════════
    // DEBUG LOGGING - Track output preparation
    // ═══════════════════════════════════════════════════════════
    log.info('');
    log.info('═'.repeat(80));
    log.info('📋 PREPARING OUTPUT');
    log.info('═'.repeat(80));
    log.info(`Total properties to process: ${properties.length}`);
    log.info(`Target property: "${target.Address}", ${target.Postcode}`);
    log.info('');
    
    // CRITICAL VALIDATION: Check if any property already has "EPC Lookup" as address
    const epcLookupProperties = properties.filter(p => p.Address === 'EPC Lookup');
    if (epcLookupProperties.length > 0) {
        log.error('❌❌❌ CORRUPTION DETECTED IN INPUT:');
        log.error(`   Found ${epcLookupProperties.length} properties with Address="EPC Lookup"`);
        log.error('   These should NOT exist before EPC lookup row is created!');
        epcLookupProperties.forEach((p, idx) => {
            log.error(`   Property ${idx + 1}: Postcode=${p.Postcode}, URL=${p.URL?.substring(0, 50)}`);
        });
    }
    
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
    
    log.info('Property categories:');
    log.info(`  - Rightmove postcode searches: ${rightmovePostcodeSearches.length}`);
    log.info(`  - Rightmove individual listings: ${rightmoveIndividualListings.length}`);
    log.info(`  - PropertyData listings: ${propertydataListings.length}`);
    log.info(`  - Comparables: ${comparables.length}`);
    log.info('');
    
    // 1. Add Rightmove postcode search URLs (no ranking)
    log.info('Adding Rightmove postcode searches...');
    rightmovePostcodeSearches.forEach((p, idx) => {
        p.Ranking = ''; // No ranking for URL-only rows
        log.info(`  ${idx + 1}. "${p.Address || 'No address'}" (${p.Postcode})`);
        output.push(p);
    });
    
    // 2. Add EPC lookup row
    log.info('');
    log.info('Creating and adding EPC lookup row...');
    const epcLookupRow = createEPCLookupRow(target.Postcode);
    log.info(`  EPC Lookup row: Address="${epcLookupRow.Address}", Postcode=${epcLookupRow.Postcode}`);
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
    
    log.info('');
    log.info('Output structure per SPEC v01.docx:');
    log.info(`  1. Rightmove postcode search URLs: ${rightmovePostcodeSearches.length}`);
    log.info(`  2. EPC lookup row: 1`);
    log.info(`  3. Target property: 1`);
    log.info(`  4. Individual Rightmove listings: ${rightmoveIndividualListings.length}`);
    log.info(`  5. PropertyData listings: ${propertydataListings.length}`);
    log.info(`  6. Ranked comparables: ${rankedComparables.length}`);
    log.info(`  Total output rows: ${output.length}`);
    
    // ═══════════════════════════════════════════════════════════
    // CRITICAL VALIDATION: Verify final output integrity
    // ═══════════════════════════════════════════════════════════
    log.info('');
    log.info('🔍 VALIDATING FINAL OUTPUT...');
    
    // Check for corrupted addresses
    const corruptedProperties = output.filter(p => 
        p.Address === 'EPC Lookup' && !p._isEPCLookupRow
    );
    
    if (corruptedProperties.length > 0) {
        log.error('❌❌❌ CRITICAL CORRUPTION DETECTED IN FINAL OUTPUT!');
        log.error(`   Found ${corruptedProperties.length} properties with corrupted addresses`);
        corruptedProperties.forEach((p, idx) => {
            log.error(`   Corrupted ${idx + 1}: Address="${p.Address}", Postcode=${p.Postcode}, URL=${p.URL?.substring(0, 50)}`);
        });
    }
    
    // Verify EPC Lookup row exists and is correct
    const epcLookupRows = output.filter(p => p._isEPCLookupRow);
    if (epcLookupRows.length === 0) {
        log.warning('⚠️ WARNING: No EPC Lookup row found in output!');
    } else if (epcLookupRows.length > 1) {
        log.warning(`⚠️ WARNING: Multiple EPC Lookup rows found: ${epcLookupRows.length}`);
    } else {
        log.info(`✅ EPC Lookup row: OK (Address="${epcLookupRows[0].Address}", Postcode=${epcLookupRows[0].Postcode})`);
    }
    
    // Verify target property
    const targetInOutput = output.find(p => p === target);
    if (targetInOutput) {
        log.info(`✅ Target property: OK (Address="${targetInOutput.Address}", Postcode=${targetInOutput.Postcode})`);
        if (targetInOutput.Address === 'EPC Lookup') {
            log.error('❌❌❌ TARGET PROPERTY CORRUPTED! Address is "EPC Lookup"!');
        }
    } else {
        log.error('❌ Target property NOT found in output!');
    }
    
    log.info('═'.repeat(80));
    log.info('');
    
    return output;
}