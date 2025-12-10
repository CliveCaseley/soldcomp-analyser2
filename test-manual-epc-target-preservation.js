/**
 * Test: Manual EPC Certificate Preservation for Target Property
 * 
 * ISSUE: When a target row in the input CSV has a manual EPC certificate URL,
 * it was being lost during processing because normalizePreHeaderRow() didn't 
 * capture EPC data before returning.
 * 
 * FIX: Added a first pass to capture EPC Certificate data from pre-header rows
 * before processing target indicators.
 */

const fs = require('fs');
const { parseCSV } = require('./src/utils/csvParser');
const { findTarget } = require('./src/utils/targetFinder');

async function runTests() {
    console.log('=== Testing Manual EPC Certificate Preservation for Target ===\n');
    
    // Test 1: Real-world file (data 7.csv)
    console.log('TEST 1: Real-world CSV with manual EPC in target row\n');
    
    const inputPath = '/home/ubuntu/Uploads/data (7).csv';
    let csvContent = fs.readFileSync(inputPath, 'utf-8');
    csvContent = csvContent.replace(/^\uFEFF/, ''); // Remove BOM
    
    const result = parseCSV(csvContent);
    const properties = result.normalizedData || [];
    const preHeaderRows = result.preHeaderRows || [];
    
    console.log(`Parsed ${properties.length} properties, ${preHeaderRows.length} pre-header rows`);
    
    // Find target
    const { target } = findTarget(properties, preHeaderRows);
    
    // Validate
    const expectedEPCURL = 'https://find-energy-certificate.service.gov.uk/energy-certificate/8700-7121-7570-5276-3292';
    const actualEPCURL = target['EPC Certificate'];
    
    console.log('\n--- Test Results ---');
    console.log(`Expected EPC: ${expectedEPCURL}`);
    console.log(`Actual EPC:   ${actualEPCURL}`);
    
    if (actualEPCURL === expectedEPCURL) {
        console.log('✅ TEST 1 PASSED: EPC Certificate correctly preserved!');
    } else if (actualEPCURL) {
        console.log('❌ TEST 1 FAILED: Wrong EPC URL preserved');
    } else {
        console.log('❌ TEST 1 FAILED: EPC Certificate was lost');
    }
    
    // Test 2: Verify target has correct address/postcode
    console.log('\n\nTEST 2: Target identity validation\n');
    const expectedAddress = 'Flat 1, Moat House, Castle Moat, Northgate, Pontefract';
    const expectedPostcode = 'WF8 1EJ';
    
    console.log(`Expected Address: ${expectedAddress}`);
    console.log(`Actual Address:   ${target.Address}`);
    console.log(`Expected Postcode: ${expectedPostcode}`);
    console.log(`Actual Postcode:   ${target.Postcode}`);
    
    if (target.Address === expectedAddress && target.Postcode === expectedPostcode) {
        console.log('✅ TEST 2 PASSED: Target identity preserved');
    } else {
        console.log('❌ TEST 2 FAILED: Target identity corrupted');
    }
    
    // Summary
    console.log('\n\n=== SUMMARY ===');
    if (actualEPCURL === expectedEPCURL && target.Address === expectedAddress && target.Postcode === expectedPostcode) {
        console.log('✅ ALL TESTS PASSED');
        console.log('Manual EPC Certificate preservation is working correctly!');
        return 0;
    } else {
        console.log('❌ SOME TESTS FAILED');
        return 1;
    }
}

runTests().then(process.exit).catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
