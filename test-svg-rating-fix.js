const { scrapeRatingFromCertificate } = require('./src/utils/epcHandler');

/**
 * Test the fixed SVG rating extraction
 * Should extract "E" from certificate showing "45 E", not "F" from scale
 */
async function testSVGRatingFix() {
    console.log('\n=== Testing Fixed SVG Rating Extraction ===\n');
    
    const testCases = [
        {
            url: 'https://find-energy-certificate.service.gov.uk/energy-certificate/0310-2606-8090-2399-6161',
            expected: 'E',
            description: 'Certificate with rating "45 E"'
        },
        {
            url: 'https://find-energy-certificate.service.gov.uk/energy-certificate/2648-3961-7260-5043-7964',
            expected: 'D',
            description: 'Certificate from HU6 8NS area'
        }
    ];
    
    for (const testCase of testCases) {
        console.log(`\nTest: ${testCase.description}`);
        console.log(`URL: ${testCase.url}`);
        console.log(`Expected: ${testCase.expected}`);
        
        const rating = await scrapeRatingFromCertificate(testCase.url);
        
        console.log(`Extracted: ${rating}`);
        
        if (rating === testCase.expected) {
            console.log('✓ PASS');
        } else {
            console.log(`✗ FAIL (expected ${testCase.expected}, got ${rating})`);
        }
    }
    
    console.log('\n=== Test Complete ===\n');
}

testSVGRatingFix();
