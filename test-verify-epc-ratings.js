/**
 * Quick verification script for EPC ratings from data (5).csv
 * Tests the critical cases:
 * - 317 Wharf Road: Should be rating E
 * - 307 Wharf Road: Should be no certificate/rating
 */

const fs = require('fs');
const { scrapeRatingFromCertificate } = require('./src/utils/epcHandler');

async function verifyEPCRatings() {
    console.log('=== EPC RATING VERIFICATION ===\n');
    
    // Read input CSV to get certificate URLs
    const inputFile = '/home/ubuntu/Uploads/data (5).csv';
    const csvContent = fs.readFileSync(inputFile, 'utf-8');
    const lines = csvContent.split('\n');
    
    // Find header row
    const header = lines[0].split(',');
    const addressIdx = header.indexOf('Address');
    const certIdx = header.indexOf('EPC Certificate');
    const ratingIdx = header.indexOf('EPC rating');
    
    console.log(`Header indices - Address: ${addressIdx}, Certificate: ${certIdx}, Rating: ${ratingIdx}\n`);
    
    // Test cases
    const testCases = [];
    
    // Find 317 Wharf Road
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const cells = line.split(',');
        const address = cells[addressIdx];
        const certURL = cells[certIdx];
        
        if (address && address.includes('317') && address.toLowerCase().includes('wharf')) {
            testCases.push({
                name: '317 Wharf Road (Spen Lea)',
                address: address,
                certURL: certURL,
                expectedRating: 'E'
            });
        }
        
        if (address && address.includes('307') && address.toLowerCase().includes('wharf')) {
            testCases.push({
                name: '307 Wharf Road',
                address: address,
                certURL: certURL || '',
                expectedRating: 'NULL'
            });
        }
    }
    
    // Add some manual test cases from the data
    testCases.push({
        name: '14 Brickyard Court',
        address: '14, Brickyard Court, Ealand',
        certURL: 'https://find-energy-certificate.service.gov.uk/energy-certificate/0390-3395-2060-2924-3471',
        expectedRating: 'Unknown (verify manually)'
    });
    
    testCases.push({
        name: '51a Outgate',
        address: '51a, Outgate, Ealand',
        certURL: 'https://find-energy-certificate.service.gov.uk/energy-certificate/0612-2808-7566-9097-7091',
        expectedRating: 'Unknown (verify manually)'
    });
    
    console.log(`Found ${testCases.length} test cases\n`);
    
    // Test each certificate
    let passCount = 0;
    let failCount = 0;
    
    for (const testCase of testCases) {
        console.log(`Testing: ${testCase.name}`);
        console.log(`  Address: ${testCase.address}`);
        console.log(`  Certificate: ${testCase.certURL}`);
        console.log(`  Expected: ${testCase.expectedRating}`);
        
        if (!testCase.certURL || testCase.certURL.trim() === '') {
            console.log(`  Result: NO CERTIFICATE (correct if expected NULL)`);
            if (testCase.expectedRating === 'NULL') {
                console.log(`  ✓ PASS\n`);
                passCount++;
            } else {
                console.log(`  ✗ FAIL (expected ${testCase.expectedRating})\n`);
                failCount++;
            }
            continue;
        }
        
        try {
            const rating = await scrapeRatingFromCertificate(testCase.certURL);
            console.log(`  Scraped Rating: ${rating || 'NULL'}`);
            
            if (testCase.expectedRating === 'NULL') {
                if (!rating) {
                    console.log(`  ✓ PASS\n`);
                    passCount++;
                } else {
                    console.log(`  ✗ FAIL (expected NULL, got ${rating})\n`);
                    failCount++;
                }
            } else if (testCase.expectedRating === 'Unknown (verify manually)') {
                console.log(`  ℹ INFO (manual verification needed)\n`);
            } else {
                if (rating === testCase.expectedRating) {
                    console.log(`  ✓ PASS\n`);
                    passCount++;
                } else {
                    console.log(`  ✗ FAIL (expected ${testCase.expectedRating})\n`);
                    failCount++;
                }
            }
        } catch (err) {
            console.log(`  ✗ ERROR: ${err.message}\n`);
            failCount++;
        }
    }
    
    console.log('=== SUMMARY ===');
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Total: ${testCases.length}`);
    
    if (failCount === 0) {
        console.log('\n✓ ALL TESTS PASSED - Code is working correctly!');
    } else {
        console.log(`\n✗ ${failCount} TESTS FAILED - Review needed`);
    }
}

// Run verification
verifyEPCRatings().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('\n✗ Verification failed:', err);
    process.exit(1);
});
