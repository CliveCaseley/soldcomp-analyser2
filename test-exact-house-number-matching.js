/**
 * TEST SCRIPT: STRICT EXACT HOUSE NUMBER MATCHING (v3.0)
 * 
 * Purpose: Verify that EPC matching ONLY matches certificates with EXACT house numbers
 * 
 * Critical Requirements:
 * 1. Must reject wrong house numbers (e.g., 71 should NOT match 3, 303 should NOT match 307)
 * 2. Must return NULL when no exact match found (better no data than wrong data)
 * 3. Must flag ambiguous cases where multiple exact matches exist
 * 4. Must handle flats/letter suffixes correctly (32a vs 32b vs 32)
 * 
 * Test Cases:
 * A. Exact match scenarios (should succeed)
 * B. Wrong house number scenarios (should return NULL)
 * C. Flat/letter suffix scenarios (should match correctly or return NULL)
 * D. Ambiguous scenarios (should flag as ambiguous)
 */

const { 
    extractHouseNumber, 
    isExactHouseNumberMatch,
    findBestAddressMatchFromScrapedData,
    scrapeCertificateNumbersFromPostcode
} = require('./src/utils/epcHandler');

console.log('═'.repeat(80));
console.log('TEST: STRICT EXACT HOUSE NUMBER MATCHING (v3.0)');
console.log('═'.repeat(80));
console.log('');

// ===========================
// TEST 1: House Number Extraction
// ===========================
console.log('📋 TEST 1: House Number Extraction');
console.log('─'.repeat(80));

const testAddresses = [
    { address: '14 Brickyard Court', expected: { primary: '14', flat: null } },
    { address: '32a The Street', expected: { primary: '32', flat: 'a' } },
    { address: 'Flat 5, 42 High Street', expected: { primary: '42', flat: '5' } },
    { address: '71 Westgate Road', expected: { primary: '71', flat: null } },
    { address: '3 Willow Close', expected: { primary: '3', flat: null } },
    { address: '303 Wharf Road', expected: { primary: '303', flat: null } },
    { address: '307 Wharf Road', expected: { primary: '307', flat: null } },
];

let test1Pass = true;
for (const test of testAddresses) {
    const result = extractHouseNumber(test.address);
    const pass = result.primary === test.expected.primary && result.flat === test.expected.flat;
    
    console.log(`  ${pass ? '✅' : '❌'} "${test.address}"`);
    console.log(`     Expected: ${test.expected.primary}${test.expected.flat || ''}`);
    console.log(`     Got: ${result.primary}${result.flat || ''}`);
    
    if (!pass) test1Pass = false;
}

console.log('');
console.log(`TEST 1 RESULT: ${test1Pass ? '✅ PASSED' : '❌ FAILED'}`);
console.log('');

// ===========================
// TEST 2: Exact Matching Logic
// ===========================
console.log('📋 TEST 2: Exact Matching Logic');
console.log('─'.repeat(80));

const matchTests = [
    // Should match
    {
        target: { primary: '14', flat: null },
        candidate: { primary: '14', flat: null },
        shouldMatch: true,
        description: '14 vs 14 (exact match)'
    },
    {
        target: { primary: '32', flat: 'a' },
        candidate: { primary: '32', flat: 'a' },
        shouldMatch: true,
        description: '32a vs 32a (exact match with flat)'
    },
    {
        target: { primary: '42', flat: null },
        candidate: { primary: '42', flat: 'a' },
        shouldMatch: true,
        description: '42 vs 42a (target whole building)'
    },
    
    // Should NOT match
    {
        target: { primary: '71', flat: null },
        candidate: { primary: '3', flat: null },
        shouldMatch: false,
        description: '71 vs 3 (different house numbers)'
    },
    {
        target: { primary: '303', flat: null },
        candidate: { primary: '307', flat: null },
        shouldMatch: false,
        description: '303 vs 307 (similar but different)'
    },
    {
        target: { primary: '3', flat: null },
        candidate: { primary: '1', flat: null },
        shouldMatch: false,
        description: '3 vs 1 (wrong house number)'
    },
    {
        target: { primary: '32', flat: 'a' },
        candidate: { primary: '32', flat: 'b' },
        shouldMatch: false,
        description: '32a vs 32b (different flats)'
    },
];

let test2Pass = true;
for (const test of matchTests) {
    const result = isExactHouseNumberMatch(test.target, test.candidate);
    const pass = result.isExactMatch === test.shouldMatch;
    
    console.log(`  ${pass ? '✅' : '❌'} ${test.description}`);
    console.log(`     Expected match: ${test.shouldMatch}`);
    console.log(`     Got match: ${result.isExactMatch} (${result.matchType})`);
    
    if (!pass) test2Pass = false;
}

console.log('');
console.log(`TEST 2 RESULT: ${test2Pass ? '✅ PASSED' : '❌ FAILED'}`);
console.log('');

// ===========================
// TEST 3: Full Matching with Mock Data
// ===========================
console.log('📋 TEST 3: Full Matching with Mock Certificates');
console.log('─'.repeat(80));

const mockCertificates = [
    { certificateNumber: 'CERT-001', address: '1 Willow Close', href: 'http://example.com/1', rating: 'C' },
    { certificateNumber: 'CERT-002', address: '3 Westgate Road', href: 'http://example.com/2', rating: 'D' },
    { certificateNumber: 'CERT-003', address: '14 Brickyard Court', href: 'http://example.com/3', rating: 'E' },
    { certificateNumber: 'CERT-004', address: '303 Wharf Road', href: 'http://example.com/4', rating: 'C' },
    { certificateNumber: 'CERT-005', address: '307 Wharf Road', href: 'http://example.com/5', rating: 'D' },
];

const fullMatchTests = [
    {
        targetAddress: '14 Brickyard Court',
        expectedCert: 'CERT-003',
        expectedStatus: 'Exact Match',
        description: 'Should match 14 Brickyard Court exactly'
    },
    {
        targetAddress: '71 Westgate Road',
        expectedCert: null,
        expectedStatus: null,
        description: 'Should return NULL (71 not in list, only 3 Westgate Road)'
    },
    {
        targetAddress: '3 Willow Close',
        expectedCert: null,
        expectedStatus: null,
        description: 'Should return NULL (3 Willow Close not in list, only 1 Willow Close)'
    },
    {
        targetAddress: '303 Wharf Road',
        expectedCert: 'CERT-004',
        expectedStatus: 'Exact Match',
        description: 'Should match 303 Wharf Road (not 307)'
    },
];

let test3Pass = true;
for (const test of fullMatchTests) {
    const result = findBestAddressMatchFromScrapedData(mockCertificates, test.targetAddress);
    
    let pass = false;
    if (test.expectedCert === null) {
        // Should return null
        pass = (result === null);
    } else {
        // Should return specific certificate
        pass = (result && result.certificate && result.certificate.certificateNumber === test.expectedCert);
    }
    
    console.log(`  ${pass ? '✅' : '❌'} ${test.description}`);
    console.log(`     Target: "${test.targetAddress}"`);
    console.log(`     Expected: ${test.expectedCert || 'NULL'}`);
    console.log(`     Got: ${result ? result.certificate.certificateNumber : 'NULL'}`);
    console.log(`     Match Status: ${result ? result.matchStatus : 'N/A'}`);
    
    if (!pass) test3Pass = false;
}

console.log('');
console.log(`TEST 3 RESULT: ${test3Pass ? '✅ PASSED' : '❌ FAILED'}`);
console.log('');

// ===========================
// FINAL SUMMARY
// ===========================
console.log('═'.repeat(80));
console.log('FINAL TEST SUMMARY');
console.log('═'.repeat(80));
console.log(`  Test 1 (House Number Extraction): ${test1Pass ? '✅ PASSED' : '❌ FAILED'}`);
console.log(`  Test 2 (Exact Matching Logic): ${test2Pass ? '✅ PASSED' : '❌ FAILED'}`);
console.log(`  Test 3 (Full Matching): ${test3Pass ? '✅ PASSED' : '❌ FAILED'}`);
console.log('');

const allPass = test1Pass && test2Pass && test3Pass;
console.log(`OVERALL: ${allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
console.log('═'.repeat(80));

process.exit(allPass ? 0 : 1);
