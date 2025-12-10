/**
 * Test script for EPC v5.0 - Postcode Table Search Approach
 * Tests the new simplified approach with real-world addresses
 */

const { 
    scrapeCertificateTable, 
    matchAddressToCertificateRow,
    getCertificateNumber,
    scrapeCertificateData
} = require('./src/utils/epcHandler');

// Test cases provided by user
const TEST_CASES = [
    {
        name: "Test 1: 51a Outgate, DN17 4JD",
        postcode: "DN17 4JD",
        address: "51a Outgate, Ealand",
        expectedCert: "9727-0009-2305-7219-1214",
        expectedRating: "B"
    },
    {
        name: "Test 2: 317 Wharf Road, DN17 4JW",
        postcode: "DN17 4JW",
        address: "317 Wharf Road, Crowle",
        expectedCert: null, // User will specify
        expectedRating: "E"
    },
    {
        name: "Test 3: 307 Wharf Road, DN17 4JW (No cert exists)",
        postcode: "DN17 4JW",
        address: "307 Wharf Road, Crowle",
        expectedCert: null,
        expectedRating: null
    }
];

async function runTests() {
    console.log('═'.repeat(80));
    console.log('🧪 EPC V5.0 POSTCODE TABLE SEARCH - TEST SUITE');
    console.log('═'.repeat(80));
    console.log('');
    
    let passedTests = 0;
    let failedTests = 0;
    
    for (let i = 0; i < TEST_CASES.length; i++) {
        const testCase = TEST_CASES[i];
        console.log('─'.repeat(80));
        console.log(`TEST ${i + 1}/${TEST_CASES.length}: ${testCase.name}`);
        console.log('─'.repeat(80));
        console.log(`Postcode: ${testCase.postcode}`);
        console.log(`Address: ${testCase.address}`);
        console.log(`Expected Cert: ${testCase.expectedCert || 'NULL'}`);
        console.log(`Expected Rating: ${testCase.expectedRating || 'NULL'}`);
        console.log('');
        
        try {
            const result = await getCertificateNumber(testCase.postcode, testCase.address);
            
            console.log('');
            console.log('📋 TEST RESULT:');
            console.log(`   Certificate Found: ${result ? 'YES' : 'NO'}`);
            
            if (result) {
                console.log(`   Certificate Number: ${result.certificateNumber}`);
                console.log(`   Rating: ${result.rating || 'N/A'}`);
                console.log(`   Floor Area: ${result.floorArea ? result.floorArea + ' sqm' : 'N/A'}`);
                console.log(`   Certificate Address: ${result.address || 'N/A'}`);
                console.log(`   Address Verified: ${result.addressVerified ? 'YES' : 'NO'}`);
                
                // Verify results
                let passed = true;
                
                if (testCase.expectedCert && result.certificateNumber !== testCase.expectedCert) {
                    console.log(`   ❌ FAIL: Expected cert ${testCase.expectedCert}, got ${result.certificateNumber}`);
                    passed = false;
                }
                
                if (testCase.expectedRating && result.rating !== testCase.expectedRating) {
                    console.log(`   ❌ FAIL: Expected rating ${testCase.expectedRating}, got ${result.rating}`);
                    passed = false;
                }
                
                if (passed) {
                    console.log('   ✅ PASS: Results match expectations');
                    passedTests++;
                } else {
                    failedTests++;
                }
            } else {
                // No certificate found
                if (testCase.expectedCert === null) {
                    console.log('   ✅ PASS: Correctly returned NULL (no cert exists)');
                    passedTests++;
                } else {
                    console.log(`   ❌ FAIL: Expected cert ${testCase.expectedCert}, got NULL`);
                    failedTests++;
                }
            }
            
        } catch (error) {
            console.log(`   ❌ ERROR: ${error.message}`);
            console.error(error.stack);
            failedTests++;
        }
        
        console.log('');
        
        // Wait 2 seconds between requests to avoid rate limiting
        if (i < TEST_CASES.length - 1) {
            console.log('⏳ Waiting 2 seconds before next test...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('');
        }
    }
    
    console.log('═'.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Total Tests: ${TEST_CASES.length}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${((passedTests / TEST_CASES.length) * 100).toFixed(1)}%`);
    console.log('═'.repeat(80));
    
    process.exit(failedTests > 0 ? 1 : 0);
}

// Additional test: Certificate page scraping
async function testCertificateScraping() {
    console.log('═'.repeat(80));
    console.log('🧪 ADDITIONAL TEST: Certificate Page Scraping');
    console.log('═'.repeat(80));
    console.log('Testing certificate: 9727-0009-2305-7219-1214');
    console.log('');
    
    const certURL = 'https://find-energy-certificate.service.gov.uk/energy-certificate/9727-0009-2305-7219-1214';
    const certData = await scrapeCertificateData(certURL);
    
    console.log('📄 Certificate Data:');
    console.log(`   Address: ${certData.address || 'N/A'}`);
    console.log(`   Rating: ${certData.rating || 'N/A'}`);
    console.log(`   Floor Area: ${certData.floorArea ? certData.floorArea + ' sqm' : 'N/A'}`);
    console.log('');
    
    if (certData.address && certData.address.includes('51A OUTGATE') && certData.rating === 'B') {
        console.log('✅ PASS: Certificate data extracted correctly');
    } else {
        console.log('❌ FAIL: Certificate data mismatch');
    }
    console.log('═'.repeat(80));
}

// Run tests
(async () => {
    await testCertificateScraping();
    console.log('');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await runTests();
})();
