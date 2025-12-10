/**
 * Local test runner for full pipeline with data (5).csv
 * Tests the complete actor workflow locally without Apify
 */

const fs = require('fs');
const path = require('path');
const { parseCSV, cleanProperty } = require('./src/utils/csvParser');
const { findTarget } = require('./src/utils/targetFinder');
const { classifyURLs, tagURLOnlyProperties } = require('./src/utils/urlClassifier');
const { scrapeRightmoveListing, scrapeRightmovePostcodeSearch } = require('./src/scrapers/rightmoveScraper');
const { scrapePropertyData } = require('./src/scrapers/propertyDataScraper');
const { scrapeEPCData, createEPCLookupRow } = require('./src/utils/epcHandler');
const { rankProperties } = require('./src/utils/rankingEngine');
const { detectAndMergeDuplicates } = require('./src/utils/duplicateDetector');
const { addHyperlinks } = require('./src/utils/excelHelper');
const { sanitizeProperties } = require('./src/utils/dataSanitizer');
const { detectManualEdits } = require('./src/utils/manualEditDetector');

async function runFullPipeline() {
    console.log('=== FULL PIPELINE TEST WITH DATA (5).CSV ===\n');
    
    try {
        // Step 1: Read input CSV
        const inputFile = '/home/ubuntu/Uploads/data (5).csv';
        console.log('Step 1: Reading CSV from', inputFile);
        const csvContent = fs.readFileSync(inputFile, 'utf-8');
        
        // Step 2: Parse CSV
        console.log('\nStep 2: Parsing CSV...');
        const parseResult = parseCSV(csvContent);
        let properties = parseResult.normalizedData;
        const preHeaderRows = parseResult.preHeaderRows;
        console.log(`Parsed ${properties.length} properties and ${preHeaderRows.length} pre-header rows`);
        
        // Step 3: Clean and normalize
        console.log('\nStep 3: Cleaning and normalizing data...');
        properties = properties.map(cleanProperty);
        
        // Step 3.5: Sanitize data
        console.log('\nStep 3.5: Sanitizing data...');
        properties = sanitizeProperties(properties);
        console.log(`After sanitization: ${properties.length} properties`);
        
        // Step 4: Find target property
        console.log('\nStep 4: Finding target property...');
        const { target: targetInfo, comparables: remainingProperties } = findTarget(properties, preHeaderRows);
        properties = remainingProperties; // Update properties to exclude target
        console.log('Target found:', targetInfo ? `${targetInfo.Address}, ${targetInfo.Postcode}` : 'NOT FOUND');
        
        // Step 5: Check for manual edits (for re-imports)
        console.log('\nStep 5: Checking for manual edits...');
        for (const property of properties) {
            detectManualEdits(property);
        }
        if (targetInfo) {
            detectManualEdits(targetInfo);
        }
        
        // Step 6-10: Skip URL scraping and deduplication for this test
        console.log('\nStep 6-10: Skipping URL scraping and deduplication (not needed for EPC test)...');
        
        // Step 11: Scrape EPC data
        console.log('\nStep 11: Scraping EPC data...');
        let epcSuccessCount = 0;
        for (const prop of properties) {
            if (!prop.Postcode) continue;
            console.log(`  ${prop.Address}, ${prop.Postcode}`);
            try {
                const epcData = await scrapeEPCData(prop.Address, prop.Postcode);
                if (epcData && epcData.rating) {
                    Object.assign(prop, epcData);
                    epcSuccessCount++;
                    console.log(`    ✓ Rating: ${epcData.rating}, Certificate: ${epcData['EPC Certificate'] || 'N/A'}`);
                } else {
                    console.log(`    ✗ No EPC data found`);
                }
            } catch (err) {
                console.log(`    ✗ Error: ${err.message}`);
            }
        }
        console.log(`EPC data scraped for ${epcSuccessCount}/${properties.length} properties`);
        
        // Step 12: Rank properties
        console.log('\nStep 12: Ranking properties...');
        if (targetInfo) {
            properties = rankProperties(properties, targetInfo);
        }
        
        // Step 13: Add hyperlinks
        console.log('\nStep 13: Adding hyperlink columns...');
        // Add target back to properties array before adding hyperlinks
        if (targetInfo) {
            properties = addHyperlinks([targetInfo, ...properties]);
        } else {
            properties = addHyperlinks(properties);
        }
        
        // Step 14: Write output CSV
        const outputFile = '/home/ubuntu/github_repos/soldcomp-analyser2/test-output-data5.csv';
        console.log('\nStep 14: Writing output to', outputFile);
        
        // Convert to CSV
        const headers = Object.keys(properties[0] || {});
        let csvOutput = headers.join(',') + '\n';
        for (const prop of properties) {
            const row = headers.map(h => {
                let val = prop[h] || '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            });
            csvOutput += row.join(',') + '\n';
        }
        
        fs.writeFileSync(outputFile, csvOutput, 'utf-8');
        console.log(`\n✓ Output written to ${outputFile}`);
        console.log(`✓ Total properties in output: ${properties.length}`);
        
        // Verification: Check critical cases
        console.log('\n=== VERIFICATION RESULTS ===\n');
        
        // Find 317 Wharf Road
        const wharf317 = properties.find(p => 
            p.Address && p.Address.includes('317') && p.Address.toLowerCase().includes('wharf')
        );
        if (wharf317) {
            console.log('317 Wharf Road (Spen Lea):');
            console.log(`  Rating: ${wharf317['EPC Rating'] || 'NULL'} (Expected: E)`);
            console.log(`  Certificate: ${wharf317['EPC Certificate'] || 'NULL'}`);
            console.log(`  Result: ${wharf317['EPC Rating'] === 'E' ? '✓ PASS' : '✗ FAIL'}`);
        } else {
            console.log('317 Wharf Road: NOT FOUND in output');
        }
        
        // Find 307 Wharf Road
        console.log('');
        const wharf307 = properties.find(p => 
            p.Address && p.Address.includes('307') && p.Address.toLowerCase().includes('wharf')
        );
        if (wharf307) {
            console.log('307 Wharf Road:');
            console.log(`  Rating: ${wharf307['EPC Rating'] || 'NULL'} (Expected: NULL)`);
            console.log(`  Certificate: ${wharf307['EPC Certificate'] || 'NULL'} (Expected: NULL)`);
            const isNull = !wharf307['EPC Rating'] || wharf307['EPC Rating'] === '';
            console.log(`  Result: ${isNull ? '✓ PASS' : '✗ FAIL'}`);
        } else {
            console.log('307 Wharf Road: NOT FOUND in output');
        }
        
        // Check random sample of 10 properties
        console.log('\n=== RANDOM SAMPLE CHECK (10 properties) ===\n');
        const sample = properties
            .filter(p => p['EPC Certificate'])
            .sort(() => 0.5 - Math.random())
            .slice(0, 10);
        
        for (const prop of sample) {
            console.log(`${prop.Address}, ${prop.Postcode}:`);
            console.log(`  Rating: ${prop['EPC Rating']}`);
            console.log(`  Certificate: ${prop['EPC Certificate']}`);
        }
        
        // Count correct EPCs
        const totalWithCerts = properties.filter(p => p['EPC Certificate']).length;
        const totalWithRatings = properties.filter(p => p['EPC Rating']).length;
        console.log(`\n=== SUMMARY ===`);
        console.log(`Total properties: ${properties.length}`);
        console.log(`Properties with certificates: ${totalWithCerts}`);
        console.log(`Properties with ratings: ${totalWithRatings}`);
        console.log(`\nConfidence: Manual verification needed for critical cases`);
        
    } catch (error) {
        console.error('\n✗ Pipeline failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
runFullPipeline().then(() => {
    console.log('\n✓ Pipeline test complete');
    process.exit(0);
}).catch(err => {
    console.error('\n✗ Pipeline test failed:', err);
    process.exit(1);
});
