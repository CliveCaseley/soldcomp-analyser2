const { parseCSV } = require('./src/utils/csvParser');
const { findTarget } = require('./src/utils/targetFinder');
const fs = require('fs');

async function testTargetURLDebug() {
    console.log('=== Target URL Debug Test ===\n');
    
    const inputFile = '/home/ubuntu/Uploads/data (5).csv';
    console.log(`Reading input file: ${inputFile}\n`);
    
    const csvContent = fs.readFileSync(inputFile, 'utf8');
    
    // Parse CSV
    console.log('Step 1: Parsing CSV...');
    const { normalizedData, preHeaderRows } = parseCSV(csvContent);
    console.log(`  Parsed ${normalizedData.length} properties`);
    console.log(`  Found ${preHeaderRows.length} pre-header rows\n`);
    
    // Check for isTarget rows before findTarget
    console.log('Step 2: Capturing URLs from isTarget rows BEFORE findTarget...');
    const targetURLs = [];
    normalizedData.forEach((prop, index) => {
        console.log(`  Row ${index}: isTarget=${prop.isTarget}, Address="${prop.Address || 'N/A'}", URL="${(prop.URL || 'N/A').substring(0, 60)}..."`);
        
        if (prop.isTarget === 1 || prop.isTarget === '1' || prop.isTarget === true) {
            console.log(`    ✓ Found isTarget row!`);
            if (prop.URL && prop.URL.trim() !== '') {
                targetURLs.push({
                    url: prop.URL,
                    index: index,
                    address: prop.Address,
                    postcode: prop.Postcode
                });
                console.log(`    ✓ Captured URL: ${prop.URL.substring(0, 80)}...`);
            } else {
                console.log(`    ✗ No URL in isTarget row`);
            }
        }
        
        // Only show first 10 rows to avoid clutter
        if (index >= 9) {
            console.log(`  ... (showing only first 10 rows)\n`);
            return;
        }
    });
    console.log(`✓ Captured ${targetURLs.length} URLs from isTarget rows\n`);
    
    // Find target
    console.log('Step 3: Finding target with findTarget()...');
    const { target, comparables } = findTarget(normalizedData, preHeaderRows);
    console.log(`  Target found: ${target.Address || 'N/A'}`);
    console.log(`  Target URL: ${target.URL || 'N/A'}`);
    console.log(`  Target isTarget: ${target.isTarget}\n`);
    
    // Check if target URL needs restoration
    console.log('Step 4: Checking if target URL needs restoration...');
    let originalTargetURL = target.URL;
    console.log(`  Current target URL: ${originalTargetURL || 'N/A'}`);
    
    if ((!originalTargetURL || originalTargetURL.trim() === '' || originalTargetURL === 'View') && targetURLs.length > 0) {
        console.log(`  ⚠️ Target has no valid URL, but found ${targetURLs.length} URLs from isTarget rows`);
        console.log(`  📝 URLs available for restoration:`);
        targetURLs.forEach((item, i) => {
            console.log(`    ${i+1}. ${item.url}`);
            console.log(`       Address: ${item.address || 'N/A'}`);
            console.log(`       Postcode: ${item.postcode || 'N/A'}`);
        });
        console.log(`  ✓ Restoring URL from isTarget row: ${targetURLs[0].url}`);
        originalTargetURL = targetURLs[0].url;
        target.URL = originalTargetURL;
    } else {
        console.log(`  ✓ Target URL is valid: ${originalTargetURL}`);
    }
    
    console.log('\n=== Test Complete ===');
    console.log(`Final target URL: ${target.URL || 'N/A'}`);
}

testTargetURLDebug().catch(console.error);
