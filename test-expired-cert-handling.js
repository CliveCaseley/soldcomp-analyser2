/**
 * Test script for expired certificate handling
 * Tests the new functionality for preferring non-expired certificates
 * 
 * Test cases:
 * 1. 317 Wharf Road, DN17 4JW - should get E (non-expired), not F (expired)
 * 2. 307 Wharf Road, DN17 4JW - verify certificate matching
 * 3. 51a Outgate (postcode TBD) - should get cert 9727-0009-2305-7219-1214, rating B, 180 sqm, Detached house
 */

const { getCertificateNumber } = require('./src/utils/epcHandler.js');

async function testExpiredCertificateHandling() {
    console.log('═'.repeat(80));
    console.log('🧪 TESTING EXPIRED CERTIFICATE HANDLING');
    console.log('═'.repeat(80));
    console.log('');
    
    const testCases = [
        {
            name: 'Test Case 1: 317 Wharf Road (should prefer non-expired E over expired F)',
            postcode: 'DN17 4JW',
            address: '317 Wharf Road, Ealand',
            expectedRating: 'E',
            expectedCert: '0310-2606-8090-2399-6161', // This is the non-expired E certificate
            shouldNotBeCert: '2068-4069-6258-6561-6084' // This is the expired F certificate
        },
        {
            name: 'Test Case 2: 307 Wharf Road (should return NULL - no certificate exists)',
            postcode: 'DN17 4JW',
            address: '307, Wharf Road, Ealand, Scunthorpe DN17 4JW',
            expectedCert: null, // No certificate exists for this address
            expectedRating: null
        },
        {
            name: 'Test Case 3: 51a Outgate (verify correct extraction)',
            postcode: 'DN17 4JD',
            address: '51a Outgate, Ealand',
            expectedCert: '9727-0009-2305-7219-1214',
            expectedRating: 'B',
            expectedFloorArea: 180,
            expectedPropertyType: 'Detached house'
        }
    ];
    
    const results = [];
    
    for (const testCase of testCases) {
        console.log('═'.repeat(80));
        console.log(`🧪 ${testCase.name}`);
        console.log('═'.repeat(80));
        console.log(`   Postcode: ${testCase.postcode}`);
        console.log(`   Address: ${testCase.address}`);
        console.log('');
        
        try {
            const result = await getCertificateNumber(testCase.postcode, testCase.address);
            
            if (result) {
                console.log('✅ Certificate found:');
                console.log(`   Certificate Number: ${result.certificateNumber}`);
                console.log(`   Rating: ${result.rating || 'N/A'}`);
                console.log(`   Floor Area: ${result.floorArea ? result.floorArea + ' sqm' : 'N/A'}`);
                console.log(`   Property Type: ${result.propertyType || 'N/A'}`);
                console.log(`   Address: ${result.address || 'N/A'}`);
                console.log('');
                
                // Check expectations
                let testPassed = true;
                const issues = [];
                
                if (testCase.expectedCert && result.certificateNumber !== testCase.expectedCert) {
                    testPassed = false;
                    issues.push(`Expected cert ${testCase.expectedCert}, got ${result.certificateNumber}`);
                }
                
                if (testCase.shouldNotBeCert && result.certificateNumber === testCase.shouldNotBeCert) {
                    testPassed = false;
                    issues.push(`Got expired certificate ${testCase.shouldNotBeCert} - should have preferred non-expired!`);
                }
                
                if (testCase.expectedRating && result.rating !== testCase.expectedRating) {
                    testPassed = false;
                    issues.push(`Expected rating ${testCase.expectedRating}, got ${result.rating}`);
                }
                
                if (testCase.expectedFloorArea && result.floorArea !== testCase.expectedFloorArea) {
                    testPassed = false;
                    issues.push(`Expected floor area ${testCase.expectedFloorArea}, got ${result.floorArea}`);
                }
                
                if (testCase.expectedPropertyType && result.propertyType !== testCase.expectedPropertyType) {
                    testPassed = false;
                    issues.push(`Expected property type "${testCase.expectedPropertyType}", got "${result.propertyType}"`);
                }
                
                if (testPassed) {
                    console.log('✅ TEST PASSED');
                } else {
                    console.log('❌ TEST FAILED:');
                    issues.forEach(issue => console.log(`   - ${issue}`));
                }
                
                results.push({
                    testCase: testCase.name,
                    passed: testPassed,
                    result: result,
                    issues: issues
                });
            } else {
                console.log('❌ No certificate found');
                const testPassed = testCase.expectedCert === null;
                
                results.push({
                    testCase: testCase.name,
                    passed: testPassed,
                    result: null,
                    issues: testPassed ? [] : ['Expected certificate but got null']
                });
            }
        } catch (error) {
            console.error(`❌ Test failed with error: ${error.message}`);
            console.error(error.stack);
            
            results.push({
                testCase: testCase.name,
                passed: false,
                result: null,
                issues: [error.message]
            });
        }
        
        console.log('');
    }
    
    // Summary
    console.log('═'.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(80));
    console.log('');
    
    const passedTests = results.filter(r => r.passed).length;
    const totalTests = results.length;
    
    results.forEach((result, idx) => {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`${status}: ${result.testCase}`);
        if (!result.passed && result.issues.length > 0) {
            result.issues.forEach(issue => console.log(`   └─ ${issue}`));
        }
    });
    
    console.log('');
    console.log(`Total: ${passedTests}/${totalTests} tests passed`);
    console.log('═'.repeat(80));
    
    return results;
}

// Run the test
testExpiredCertificateHandling()
    .then(() => {
        console.log('✅ Test script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Test script failed:', error);
        process.exit(1);
    });
