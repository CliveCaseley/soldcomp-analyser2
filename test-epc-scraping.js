/**
 * Test script for EPC web scraping implementation
 * Tests the new scrapeCertificateNumbersFromPostcode function
 */

const { scrapeCertificateNumbersFromPostcode, getCertificateNumber } = require('./src/utils/epcHandler');

async function testEPCScaping() {
    console.log('=== EPC Web Scraping Test ===\n');
    
    // Test postcode: HU6 8NS (from the example in the requirements)
    const testPostcode = 'HU6 8NS';
    const testAddress = '92a, The Quadrant, HULL';
    
    console.log(`Test 1: Scraping certificates for postcode: ${testPostcode}`);
    console.log('---');
    
    try {
        const certificates = await scrapeCertificateNumbersFromPostcode(testPostcode);
        
        if (certificates.length === 0) {
            console.log('❌ No certificates found');
            return;
        }
        
        console.log(`✅ Found ${certificates.length} certificates:\n`);
        
        certificates.forEach((cert, index) => {
            console.log(`Certificate ${index + 1}:`);
            console.log(`  Number: ${cert.certificateNumber}`);
            console.log(`  Address: ${cert.address}`);
            console.log(`  Rating: ${cert.rating || 'N/A'}`);
            console.log(`  URL: ${cert.href}`);
            console.log('');
        });
        
        // Test 2: Get certificate number with address matching
        console.log('\n---');
        console.log(`Test 2: Finding certificate for specific address: "${testAddress}"`);
        console.log('---\n');
        
        const certData = await getCertificateNumber(testPostcode, testAddress);
        
        if (certData) {
            console.log('✅ Found matching certificate:');
            console.log(`  Certificate Number: ${certData.certificateNumber}`);
            console.log(`  Matched Address: ${certData.address}`);
            console.log(`  Rating: ${certData.rating || 'N/A'}`);
            console.log(`  URL: ${certData.certificateURL}`);
        } else {
            console.log('❌ No matching certificate found');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testEPCScaping().then(() => {
    console.log('\n=== Test completed ===');
    process.exit(0);
}).catch((error) => {
    console.error('Test error:', error);
    process.exit(1);
});
