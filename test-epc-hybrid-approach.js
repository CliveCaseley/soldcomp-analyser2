/**
 * Test EPC Hybrid Approach (v6.0)
 * Tests the new hybrid implementation that combines API + minimal scraping
 */

require('dotenv').config();
const { getCertificateNumber } = require('./src/utils/epcHandler_hybrid');

async function testHybridApproach() {
    console.log('═'.repeat(80));
    console.log('🧪 TESTING EPC HYBRID APPROACH (v6.0)');
    console.log('═'.repeat(80));
    console.log('');
    console.log('📊 Test Strategy:');
    console.log('   1. Use API to get EPC data (rating, floor area)');
    console.log('   2. Scrape ONCE per postcode for certificate numbers');
    console.log('   3. Match property address to combine both datasets');
    console.log('');
    console.log('🎯 Expected Benefits:');
    console.log('   ✓ Accurate data from official API');
    console.log('   ✓ Minimal web scraping (1 request per postcode)');
    console.log('   ✓ Avoids 403 rate limiting');
    console.log('   ✓ Cache reuse for same postcode');
    console.log('');
    console.log('═'.repeat(80));
    console.log('');
    
    // Test cases from data (5).csv
    const testCases = [
        {
            address: '51a Outgate',
            postcode: 'DN17 4JD',
            expected: {
                certificateNumber: '9727-0009-2305-7219-1214',
                rating: 'B'
            }
        },
        {
            address: '317 Wharf Road',
            postcode: 'DN17 4JW',
            expected: {
                certificateNumber: '2068-4069-6258-6561-6084',
                rating: 'F'
            }
        },
        {
            address: '14 Brickyard Court',
            postcode: 'DN17 4FH',
            expected: {
                certificateNumber: '0390-3395-2060-2924-3471',
                rating: 'B'
            }
        },
        {
            address: '22 Field Road',
            postcode: 'DN17 4HP',
            expected: {
                certificateNumber: '0170-2053-9035-2027-6231',
                rating: 'C'
            }
        },
        {
            address: '3 Willow Close',
            postcode: 'DN17 4FJ',
            expected: {
                certificateNumber: '9330-3882-6420-2604-2451',
                rating: 'A'
            }
        }
    ];
    
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`TEST ${i + 1}/${testCases.length}: ${testCase.address}, ${testCase.postcode}`);
        console.log('─'.repeat(80));
        console.log('');
        
        try {
            const result = await getCertificateNumber(
                testCase.postcode,
                testCase.address,
                process.env.EPC_API_KEY
            );
            
            if (result) {
                const certMatch = result.certificateNumber === testCase.expected.certificateNumber;
                const ratingMatch = result.rating === testCase.expected.rating;
                const success = certMatch && ratingMatch;
                
                if (success) {
                    successCount++;
                } else {
                    failureCount++;
                }
                
                results.push({
                    testCase: testCase,
                    result: result,
                    success: success,
                    certMatch: certMatch,
                    ratingMatch: ratingMatch
                });
                
                console.log('');
                console.log('═'.repeat(80));
                console.log(success ? '✅ TEST PASSED' : '⚠️ TEST FAILED');
                console.log('═'.repeat(80));
                console.log('');
                console.log('📋 Results:');
                console.log(`   Expected Certificate: ${testCase.expected.certificateNumber}`);
                console.log(`   Got Certificate:      ${result.certificateNumber || 'N/A'} ${certMatch ? '✅' : '❌'}`);
                console.log(`   Expected Rating:      ${testCase.expected.rating}`);
                console.log(`   Got Rating:           ${result.rating || 'N/A'} ${ratingMatch ? '✅' : '❌'}`);
                console.log(`   Floor Area:           ${result.floorArea ? result.floorArea + ' sqm' : 'N/A'}`);
                console.log(`   Property Type:        ${result.propertyType || 'N/A'}`);
                console.log('');
                
            } else {
                failureCount++;
                results.push({
                    testCase: testCase,
                    result: null,
                    success: false
                });
                
                console.log('');
                console.log('❌ TEST FAILED: No result returned');
                console.log('');
            }
            
        } catch (error) {
            failureCount++;
            results.push({
                testCase: testCase,
                error: error.message,
                success: false
            });
            
            console.log('');
            console.log('❌ TEST FAILED WITH ERROR');
            console.log(`   Error: ${error.message}`);
            console.log('');
        }
        
        // Small delay to avoid overwhelming the servers
        if (i < testCases.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // Summary
    console.log('\n');
    console.log('═'.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(80));
    console.log('');
    console.log(`Total Tests:    ${testCases.length}`);
    console.log(`✅ Passed:      ${successCount} (${((successCount / testCases.length) * 100).toFixed(1)}%)`);
    console.log(`❌ Failed:      ${failureCount} (${((failureCount / testCases.length) * 100).toFixed(1)}%)`);
    console.log('');
    
    // Detailed breakdown
    console.log('═'.repeat(80));
    console.log('📋 DETAILED RESULTS');
    console.log('═'.repeat(80));
    console.log('');
    
    results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.testCase.address}, ${r.testCase.postcode}`);
        console.log(`   Status: ${r.success ? '✅ PASS' : '❌ FAIL'}`);
        if (r.result) {
            console.log(`   Certificate: ${r.result.certificateNumber || 'N/A'} ${r.certMatch ? '✅' : '❌'}`);
            console.log(`   Rating: ${r.result.rating || 'N/A'} ${r.ratingMatch ? '✅' : '❌'}`);
            console.log(`   Floor Area: ${r.result.floorArea ? r.result.floorArea + ' sqm' : 'N/A'}`);
        } else if (r.error) {
            console.log(`   Error: ${r.error}`);
        } else {
            console.log(`   No result returned`);
        }
        console.log('');
    });
    
    console.log('═'.repeat(80));
    console.log('');
    
    // Performance analysis
    console.log('═'.repeat(80));
    console.log('🚀 PERFORMANCE COMPARISON');
    console.log('═'.repeat(80));
    console.log('');
    console.log('Previous Approach (100% Web Scraping):');
    console.log(`   Requests for 5 properties: 5 (one per property)`);
    console.log(`   Risk: High (403 rate limiting)`);
    console.log('');
    console.log('Hybrid Approach (API + Cached Scraping):');
    console.log(`   API requests: 5 (fast, no rate limiting)`);
    console.log(`   Web scraping requests: ${new Set(testCases.map(tc => tc.postcode)).size} (one per unique postcode)`);
    console.log(`   Total requests: ${5 + new Set(testCases.map(tc => tc.postcode)).size}`);
    console.log(`   Reduction: ${((1 - (new Set(testCases.map(tc => tc.postcode)).size / 5)) * 100).toFixed(1)}% fewer scraping requests`);
    console.log(`   Risk: Low (minimal scraping)`);
    console.log('');
    console.log('For 75 properties with 20 unique postcodes:');
    console.log(`   Old approach: 75 scraping requests`);
    console.log(`   New approach: 75 API + 20 scraping = 95 total (but 73% less scraping)`);
    console.log('');
    console.log('═'.repeat(80));
}

testHybridApproach();
