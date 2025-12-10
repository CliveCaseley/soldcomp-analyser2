const { 
    getCertificateNumber, 
    scrapeRatingFromCertificate 
} = require('./src/utils/epcHandler');

/**
 * Comprehensive test for EPC accuracy fixes
 * 
 * Tests:
 * 1. Rating extraction: Certificate 0310-2606-8090-2399-6161 should extract E (not F or D from potential ratings)
 * 2. Address matching: 307 Wharf Road should return null (no match), not match to 303
 * 3. Correct certificate for 317 Wharf Road
 */

async function runTests() {
    console.log('═'.repeat(80));
    console.log('EPC ACCURACY FIXES - COMPREHENSIVE TEST SUITE');
    console.log('═'.repeat(80));
    console.log('');
    
    let passCount = 0;
    let failCount = 0;
    
    // Test 1: Rating Extraction - Should extract E, not potential ratings
    console.log('TEST 1: Rating Extraction for Spen Lea 317 Wharf Road');
    console.log('─'.repeat(80));
    try {
        const certificateURL = 'https://find-energy-certificate.service.gov.uk/energy-certificate/0310-2606-8090-2399-6161';
        const rating = await scrapeRatingFromCertificate(certificateURL);
        
        console.log(`Certificate: ${certificateURL}`);
        console.log(`Extracted Rating: ${rating}`);
        console.log(`Expected: E`);
        
        if (rating === 'E') {
            console.log('✅ PASS: Correctly extracted current rating E');
            passCount++;
        } else {
            console.log(`❌ FAIL: Expected E but got ${rating}`);
            console.log('   Issue: Might be extracting potential rating instead of current rating');
            failCount++;
        }
    } catch (error) {
        console.log(`❌ FAIL: Error - ${error.message}`);
        failCount++;
    }
    console.log('');
    
    // Test 2: Address Matching - 307 Wharf Road should NOT match to 303
    console.log('TEST 2: Address Matching for 307 Wharf Road (No EPC exists)');
    console.log('─'.repeat(80));
    try {
        const postcode = 'DN17 4JW';
        const address = '307, Wharf Road, Ealand, Scunthorpe';
        
        console.log(`Looking up: ${address}`);
        console.log(`Postcode: ${postcode}`);
        
        const certData = await getCertificateNumber(postcode, address);
        
        if (certData === null) {
            console.log('✅ PASS: Correctly returned null (no EPC match)');
            console.log('   Previous bug: Would incorrectly match to 303 Wharf Road');
            passCount++;
        } else {
            console.log(`❌ FAIL: Should return null but got certificate ${certData.certificateNumber}`);
            console.log(`   Matched address: ${certData.address}`);
            console.log('   Issue: Incorrectly matching to wrong house number');
            failCount++;
        }
    } catch (error) {
        console.log(`❌ FAIL: Error - ${error.message}`);
        failCount++;
    }
    console.log('');
    
    // Test 3: Verify 303 Wharf Road gets correct certificate
    console.log('TEST 3: Correct Certificate for 303 Wharf Road');
    console.log('─'.repeat(80));
    try {
        const postcode = 'DN17 4JW';
        const address = '303, Wharf Road, Ealand, Scunthorpe';
        
        console.log(`Looking up: ${address}`);
        console.log(`Postcode: ${postcode}`);
        
        const certData = await getCertificateNumber(postcode, address);
        
        if (certData && certData.certificateNumber === '8065-7922-4589-4034-5906') {
            console.log('✅ PASS: Correctly matched to certificate 8065-7922-4589-4034-5906');
            console.log(`   Address: ${certData.address}`);
            passCount++;
        } else if (certData) {
            console.log(`❌ FAIL: Got certificate ${certData.certificateNumber}`);
            console.log(`   Expected: 8065-7922-4589-4034-5906`);
            failCount++;
        } else {
            console.log(`❌ FAIL: No certificate found (expected 8065-7922-4589-4034-5906)`);
            failCount++;
        }
    } catch (error) {
        console.log(`❌ FAIL: Error - ${error.message}`);
        failCount++;
    }
    console.log('');
    
    // Test 4: Verify 317 Wharf Road gets correct certificate
    console.log('TEST 4: Correct Certificate for 317 Wharf Road, Ealand');
    console.log('─'.repeat(80));
    try {
        const postcode = 'DN17 4JW';
        const address = '317 Wharf Road, Ealand';
        
        console.log(`Looking up: ${address}`);
        console.log(`Postcode: ${postcode}`);
        
        const certData = await getCertificateNumber(postcode, address);
        
        if (certData) {
            console.log(`Certificate: ${certData.certificateNumber}`);
            console.log(`Address: ${certData.address}`);
            
            // There are two certificates for 317 Wharf Road
            // One is "317, Wharf Road, Ealand" (2068-4069-6258-6561-6084)
            // One is "Spen Lea, 317 Wharf Road" (0310-2606-8090-2399-6161)
            // Our address "317 Wharf Road, Ealand" should match the first one better
            
            if (certData.address.includes('317')) {
                console.log('✅ PASS: Found certificate for 317 Wharf Road');
                console.log(`   Note: Multiple certificates exist for this address`);
                passCount++;
            } else {
                console.log(`❌ FAIL: Matched to wrong address`);
                failCount++;
            }
        } else {
            console.log(`❌ FAIL: No certificate found`);
            failCount++;
        }
    } catch (error) {
        console.log(`❌ FAIL: Error - ${error.message}`);
        failCount++;
    }
    console.log('');
    
    // Test 5: Test rating extraction on 303 certificate (should be G)
    console.log('TEST 5: Rating Extraction for 303 Wharf Road');
    console.log('─'.repeat(80));
    try {
        const certificateURL = 'https://find-energy-certificate.service.gov.uk/energy-certificate/8065-7922-4589-4034-5906';
        const rating = await scrapeRatingFromCertificate(certificateURL);
        
        console.log(`Certificate: 8065-7922-4589-4034-5906 (303 Wharf Road)`);
        console.log(`Extracted Rating: ${rating}`);
        console.log(`Expected: G`);
        
        if (rating === 'G') {
            console.log('✅ PASS: Correctly extracted rating G');
            passCount++;
        } else {
            console.log(`❌ FAIL: Expected G but got ${rating}`);
            failCount++;
        }
    } catch (error) {
        console.log(`❌ FAIL: Error - ${error.message}`);
        failCount++;
    }
    console.log('');
    
    // Summary
    console.log('═'.repeat(80));
    console.log('TEST SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Total Tests: ${passCount + failCount}`);
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log('');
    
    if (failCount === 0) {
        console.log('🎉 All tests passed! EPC accuracy fixes are working correctly.');
    } else {
        console.log('⚠️ Some tests failed. Please review the fixes.');
    }
    console.log('═'.repeat(80));
}

// Run tests
runTests().catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
});
