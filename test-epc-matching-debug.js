/**
 * Test Script: EPC Address Matching Debug
 * 
 * Purpose: Debug why "32, Summerfields Drive, Blaxton, Doncaster DN9 3BG"
 * is NOT matching "32 Summerfields Drive, Blaxton, DONCASTER, DN9 3BG"
 * 
 * Expected: Certificate 0587-3024-5207-2897-6200
 * Actual: Certificate 2510-0044-8002-0798-5706 (WRONG!)
 */

const { 
    scrapeCertificateNumbersFromPostcode, 
    findBestAddressMatchFromScrapedData,
    extractHouseNumber,
    scoreHouseNumberMatch
} = require('./src/utils/epcHandler');

async function testEPCMatching() {
    console.log('='.repeat(80));
    console.log('EPC ADDRESS MATCHING DEBUG TEST');
    console.log('='.repeat(80));
    console.log('');
    
    const testPostcode = 'DN9 3BG';
    const testAddress = '32, Summerfields Drive, Blaxton, Doncaster DN9 3BG';
    const expectedCert = '0587-3024-5207-2897-6200';
    const wrongCert = '2510-0044-8002-0798-5706';
    
    console.log('Test Parameters:');
    console.log(`  Postcode: ${testPostcode}`);
    console.log(`  Target Address: "${testAddress}"`);
    console.log(`  Expected Certificate: ${expectedCert}`);
    console.log(`  Wrong Certificate (current): ${wrongCert}`);
    console.log('');
    
    // Step 1: Scrape all certificates from postcode
    console.log('Step 1: Scraping all certificates from DN9 3BG...');
    console.log('-'.repeat(80));
    const certificates = await scrapeCertificateNumbersFromPostcode(testPostcode);
    console.log(`Found ${certificates.length} certificates`);
    console.log('');
    
    // Step 2: Show all certificates
    console.log('Step 2: All Certificates Found:');
    console.log('-'.repeat(80));
    certificates.forEach((cert, index) => {
        const marker = cert.certificateNumber === expectedCert ? ' ✓ EXPECTED' : 
                      cert.certificateNumber === wrongCert ? ' ✗ WRONG' : '';
        console.log(`${index + 1}. ${cert.certificateNumber}${marker}`);
        console.log(`   Address: "${cert.address}"`);
        console.log('');
    });
    
    // Step 3: Test house number extraction
    console.log('Step 3: House Number Extraction Test');
    console.log('-'.repeat(80));
    const targetHouseNum = extractHouseNumber(testAddress);
    console.log(`Target address: "${testAddress}"`);
    console.log(`Extracted house number: ${JSON.stringify(targetHouseNum)}`);
    console.log('');
    
    // Check if expected cert exists
    const expectedCertData = certificates.find(c => c.certificateNumber === expectedCert);
    if (expectedCertData) {
        console.log(`Expected certificate found!`);
        console.log(`  Certificate: ${expectedCertData.certificateNumber}`);
        console.log(`  Address: "${expectedCertData.address}"`);
        const expectedHouseNum = extractHouseNumber(expectedCertData.address);
        console.log(`  Extracted house number: ${JSON.stringify(expectedHouseNum)}`);
        const houseScore = scoreHouseNumberMatch(targetHouseNum, expectedHouseNum);
        console.log(`  House number score: ${houseScore}`);
    } else {
        console.log(`ERROR: Expected certificate ${expectedCert} NOT FOUND in scraped data!`);
    }
    console.log('');
    
    // Step 4: Run matching algorithm with detailed logging
    console.log('Step 4: Running Matching Algorithm');
    console.log('-'.repeat(80));
    const bestMatch = findBestAddressMatchFromScrapedData(certificates, testAddress);
    console.log('');
    
    // Step 5: Results
    console.log('='.repeat(80));
    console.log('RESULTS');
    console.log('='.repeat(80));
    if (bestMatch) {
        console.log(`Selected Certificate: ${bestMatch.certificateNumber}`);
        console.log(`Selected Address: "${bestMatch.address}"`);
        console.log('');
        
        if (bestMatch.certificateNumber === expectedCert) {
            console.log('✓ SUCCESS: Correct certificate selected!');
        } else {
            console.log('✗ FAILURE: Wrong certificate selected!');
            console.log(`  Expected: ${expectedCert}`);
            console.log(`  Got: ${bestMatch.certificateNumber}`);
            
            // Show why the wrong one was selected
            if (expectedCertData) {
                console.log('');
                console.log('Comparison:');
                console.log(`  Expected: "${expectedCertData.address}"`);
                console.log(`  Selected: "${bestMatch.address}"`);
            }
        }
    } else {
        console.log('✗ ERROR: No certificate matched!');
    }
    console.log('');
    console.log('='.repeat(80));
}

// Run the test
testEPCMatching().then(() => {
    console.log('Test completed');
    process.exit(0);
}).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
