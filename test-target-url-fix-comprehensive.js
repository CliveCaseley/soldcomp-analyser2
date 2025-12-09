const { parseCSV } = require('./src/utils/csvParser');
const { findTarget } = require('./src/utils/targetFinder');
const fs = require('fs');

async function testTargetURLFixComprehensive() {
    console.log('=== Comprehensive Target URL Fix Test ===\n');
    
    const inputFile = '/home/ubuntu/Uploads/data (5).csv';
    console.log(`Reading input file: ${inputFile}\n`);
    
    const csvContent = fs.readFileSync(inputFile, 'utf8');
    
    // Parse CSV
    console.log('Step 1: Parsing CSV...');
    const { normalizedData, preHeaderRows } = parseCSV(csvContent);
    console.log(`  Parsed ${normalizedData.length} properties`);
    console.log(`  Found ${preHeaderRows.length} pre-header rows\n`);
    
    // Find target
    console.log('Step 2: Finding target...');
    const { target, comparables } = findTarget(normalizedData, preHeaderRows);
    console.log(`  Target found: ${target.Address || 'N/A'}`);
    console.log(`  Target postcode: ${target.Postcode || 'N/A'}`);
    console.log(`  Target URL: ${target.URL || 'N/A'}`);
    console.log(`  Target isTarget: ${target.isTarget}\n`);
    
    // Verify fix
    console.log('Step 3: Verifying the fix...');
    const expectedURL = 'https://www.rightmove.co.uk/properties/160516301#/?channel=RES_BUY';
    const isURLCorrect = target.URL === expectedURL;
    
    console.log(`  Expected URL: ${expectedURL}`);
    console.log(`  Actual URL:   ${target.URL}`);
    console.log(`  Match: ${isURLCorrect ? '✓ YES' : '✗ NO'}\n`);
    
    if (isURLCorrect) {
        console.log('✅ TEST PASSED: Target URL is correctly preserved!');
        console.log('   The "Link" column (containing "View") did not overwrite the "URL" column.\n');
    } else {
        console.log('❌ TEST FAILED: Target URL was not preserved correctly.');
        console.log('   Expected URL to be preserved, but it was overwritten.\n');
        return false;
    }
    
    // Test that comparables also have correct URLs
    console.log('Step 4: Checking comparable URLs...');
    let comparablesWithURLs = 0;
    let comparablesWithViewURL = 0;
    
    for (let i = 0; i < Math.min(5, comparables.length); i++) {
        const comp = comparables[i];
        const url = comp.URL || '';
        if (url && url !== '') {
            comparablesWithURLs++;
            if (url === 'View') {
                comparablesWithViewURL++;
            }
            console.log(`  Comparable ${i+1}: ${comp.Address}`);
            console.log(`    URL: ${url.substring(0, 60)}...`);
        }
    }
    
    console.log(`\n  Comparables with URLs: ${comparablesWithURLs}`);
    console.log(`  Comparables with "View" as URL: ${comparablesWithViewURL}\n`);
    
    if (comparablesWithViewURL > 0) {
        console.log('⚠️  WARNING: Some comparables still have "View" as URL.');
        console.log('   This is expected if the input CSV had "View" in the URL column.\n');
    }
    
    console.log('=== Test Complete ===');
    return isURLCorrect;
}

testTargetURLFixComprehensive()
    .then(passed => {
        process.exit(passed ? 0 : 1);
    })
    .catch(error => {
        console.error('Test failed with error:', error);
        process.exit(1);
    });
