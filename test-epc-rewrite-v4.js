/**
 * Test script for EPC rewrite v4.0
 * Tests the new structured HTML approach for EPC extraction
 */

const { 
    scrapeCertificateData,
    getCertificateNumber
} = require('./src/utils/epcHandler');

async function testCertificateScraping() {
    console.log('═'.repeat(80));
    console.log('TEST 1: Scraping Certificate Data from Known Certificate');
    console.log('═'.repeat(80));
    console.log('Certificate: 0310-2606-8090-2399-6161');
    console.log('Expected Address: Spen Lea, 317 Wharf Road, Ealand, Scunthorpe, DN17 4JW');
    console.log('Expected Rating: E');
    console.log('Expected Floor Area: 226 square metres');
    console.log('');
    
    const certificateURL = 'https://find-energy-certificate.service.gov.uk/energy-certificate/0310-2606-8090-2399-6161';
    
    const data = await scrapeCertificateData(certificateURL);
    
    console.log('');
    console.log('RESULTS:');
    console.log('  Address:', data.address);
    console.log('  Rating:', data.rating);
    console.log('  Floor Area:', data.floorArea, 'sqm');
    console.log('');
    
    // Verify results
    let success = true;
    if (!data.address || !data.address.includes('317') || !data.address.includes('Wharf Road')) {
        console.log('❌ FAILED: Address not extracted correctly');
        success = false;
    }
    if (data.rating !== 'E') {
        console.log('❌ FAILED: Rating should be E, got:', data.rating);
        success = false;
    }
    if (data.floorArea !== 226) {
        console.log('❌ FAILED: Floor area should be 226, got:', data.floorArea);
        success = false;
    }
    
    if (success) {
        console.log('✅ TEST 1 PASSED: All data extracted correctly');
    }
    
    console.log('');
}

async function testAddressMatching() {
    console.log('═'.repeat(80));
    console.log('TEST 2: Address Matching for 317 Wharf Road WITH Floor Area');
    console.log('═'.repeat(80));
    console.log('Simulating re-processing where floor area (226 sqm) is known from CSV');
    console.log('');
    
    // Test with exact address match AND known floor area from CSV
    const result = await getCertificateNumber(
        'DN17 4JW',
        '317 Wharf Road, Ealand, Scunthorpe',
        null,
        226 // Known floor area from CSV
    );
    
    console.log('');
    console.log('RESULTS:');
    if (result) {
        console.log('✅ Found certificate:', result.certificateNumber);
        console.log('   Rating:', result.rating);
        console.log('   Floor Area:', result.floorArea, 'sqm');
        console.log('   Match Status:', result.matchStatus);
        
        if (result.certificateNumber === '0310-2606-8090-2399-6161' && result.rating === 'E') {
            console.log('✅ TEST 2 PASSED: Correct certificate matched (Spen Lea)');
        } else {
            console.log('❌ TEST 2 FAILED: Wrong certificate or rating');
            console.log('   Expected: 0310-2606-8090-2399-6161 with rating E');
            console.log('   Got:', result.certificateNumber, 'with rating', result.rating);
        }
    } else {
        console.log('❌ TEST 2 FAILED: No certificate found');
    }
    
    console.log('');
}

async function testNoMatch() {
    console.log('═'.repeat(80));
    console.log('TEST 3: Non-existent Address (should return NULL)');
    console.log('═'.repeat(80));
    console.log('Testing with: 307 Wharf Road (should not exist)');
    console.log('');
    
    const result = await getCertificateNumber(
        'DN17 4JW',
        '307 Wharf Road, Ealand, Scunthorpe'
    );
    
    console.log('');
    console.log('RESULTS:');
    if (result === null) {
        console.log('✅ TEST 3 PASSED: Correctly returned NULL (no certificate exists)');
    } else {
        console.log('❌ TEST 3 FAILED: Should have returned NULL but got:', result);
    }
    
    console.log('');
}

async function runTests() {
    console.log('\n\n');
    console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                  EPC REWRITE v4.0 - TEST SUITE                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    try {
        await testCertificateScraping();
        await testAddressMatching();
        await testNoMatch();
        
        console.log('═'.repeat(80));
        console.log('ALL TESTS COMPLETED');
        console.log('═'.repeat(80));
        
    } catch (error) {
        console.error('Test failed with error:', error);
    }
}

runTests();
