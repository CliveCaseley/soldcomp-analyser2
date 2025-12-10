const { parseCSV } = require('./src/utils/csvParser');
const { getCertificateNumber } = require('./src/utils/epcHandler');
const fs = require('fs');
const path = require('path');

async function verifyPR23() {
    console.log('═'.repeat(80));
    console.log('PR #23 VERIFICATION TEST');
    console.log('Testing Postcode Search Approach (v5.0) with Real Dataset');
    console.log('═'.repeat(80));
    console.log('');
    
    // Read input CSV
    const inputPath = '/home/ubuntu/Uploads/data (5).csv';
    console.log(`📂 Reading input: ${inputPath}`);
    
    const csvContent = fs.readFileSync(inputPath, 'utf8');
    const parsed = await parseCSV(csvContent, inputPath);
    
    console.log(`✅ Parsed ${parsed.normalizedData.length} properties`);
    console.log('');
    
    // Test cases to verify
    const testCases = [
        {
            name: '51a Outgate',
            address: '51a, Outgate, Ealand, Scunthorpe DN17 4JD',
            postcode: 'DN17 4JD',
            expectedCert: '9727-0009-2305-7219-1214',
            expectedRating: 'B'
        },
        {
            name: '317 Wharf Road',
            address: '317 Wharf Road, Ealand',
            postcode: 'DN17 4JW',
            expectedCert: '0310-2606-8090-2399-6161',
            expectedRating: 'E'
        },
        {
            name: '307 Wharf Road',
            address: '307, Wharf Road, Ealand, Scunthorpe DN17 4JW',
            postcode: 'DN17 4JW',
            expectedCert: null,
            expectedRating: null,
            note: 'Should be NULL (no EPC exists)'
        }
    ];
    
    const results = [];
    
    for (const testCase of testCases) {
        console.log('═'.repeat(80));
        console.log(`TEST CASE: ${testCase.name}`);
        console.log('═'.repeat(80));
        console.log(`Address: ${testCase.address}`);
        console.log(`Postcode: ${testCase.postcode}`);
        console.log(`Expected Cert: ${testCase.expectedCert || 'NULL'}`);
        console.log(`Expected Rating: ${testCase.expectedRating || 'NULL'}`);
        if (testCase.note) console.log(`Note: ${testCase.note}`);
        console.log('');
        
        try {
            const certData = await getCertificateNumber(
                testCase.postcode,
                testCase.address,
                null,
                null
            );
            
            const actualCert = certData ? certData.certificateNumber : null;
            const actualRating = certData ? certData.rating : null;
            
            const certMatch = actualCert === testCase.expectedCert;
            const ratingMatch = !testCase.expectedRating || (actualRating === testCase.expectedRating);
            const testPassed = certMatch && ratingMatch;
            
            results.push({
                testCase: testCase.name,
                passed: testPassed,
                expectedCert: testCase.expectedCert,
                actualCert: actualCert,
                certMatch: certMatch,
                expectedRating: testCase.expectedRating,
                actualRating: actualRating,
                ratingMatch: ratingMatch
            });
            
            console.log('');
            console.log('─'.repeat(80));
            console.log('RESULT:');
            console.log(`  Certificate: ${actualCert || 'NULL'} (Expected: ${testCase.expectedCert || 'NULL'}) ${certMatch ? '✅' : '❌'}`);
            console.log(`  Rating: ${actualRating || 'NULL'} (Expected: ${testCase.expectedRating || 'NULL'}) ${ratingMatch ? '✅' : '❌'}`);
            console.log(`  Overall: ${testPassed ? '✅ PASS' : '❌ FAIL'}`);
            console.log('─'.repeat(80));
            console.log('');
            
        } catch (error) {
            console.error(`❌ Error processing test case: ${error.message}`);
            results.push({
                testCase: testCase.name,
                passed: false,
                error: error.message
            });
        }
        
        // Brief delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Summary
    console.log('═'.repeat(80));
    console.log('VERIFICATION SUMMARY');
    console.log('═'.repeat(80));
    console.log('');
    
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const successRate = (passed / total * 100).toFixed(1);
    
    results.forEach(r => {
        console.log(`${r.testCase}: ${r.passed ? '✅ PASS' : '❌ FAIL'}`);
        if (!r.passed && !r.error) {
            if (!r.certMatch) {
                console.log(`  Certificate mismatch: got ${r.actualCert}, expected ${r.expectedCert}`);
            }
            if (!r.ratingMatch) {
                console.log(`  Rating mismatch: got ${r.actualRating}, expected ${r.expectedRating}`);
            }
        }
        if (r.error) {
            console.log(`  Error: ${r.error}`);
        }
    });
    
    console.log('');
    console.log(`Results: ${passed}/${total} tests passed (${successRate}%)`);
    console.log('═'.repeat(80));
    
    // Write results to file
    const reportPath = path.join(__dirname, 'PR23_VERIFICATION_RESULTS.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        results: results,
        summary: {
            passed: passed,
            total: total,
            successRate: successRate + '%'
        }
    }, null, 2));
    
    console.log(`📝 Results saved to: ${reportPath}`);
}

verifyPR23().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
