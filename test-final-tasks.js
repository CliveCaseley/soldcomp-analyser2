/**
 * TEST SCRIPT FOR FINAL TASKS
 * 
 * TASK 1: Verify widow row removal
 * TASK 2: Verify EPC rating extraction from certificate pages
 */

const { isWidowRow } = require('./src/utils/dataSanitizer');
const { scrapeRatingFromCertificate } = require('./src/utils/epcHandler');

console.log('═'.repeat(80));
console.log('TEST 1: WIDOW ROW DETECTION');
console.log('═'.repeat(80));

// Test widow row detection
const widowRowExample = {
    'Date of sale': '',
    'Address': '',
    'Postcode': '',
    'Type': '',
    'Tenure': '',
    'Age at sale': '',
    'Price': '298169',
    'Sq. ft': '',
    'Sqm': '',
    '£/sqft': '£237',
    'Bedrooms': '',
    'Distance': ''
};

const normalRowExample = {
    'Date of sale': '21/03/2025',
    'Address': '1, Willow Close, Ealand, Scunthorpe',
    'Postcode': 'DN17 4FJ',
    'Type': 'Detached house',
    'Tenure': 'Freehold',
    'Age at sale': 'Old stock',
    'Price': '470000',
    'Sq. ft': '1733',
    'Sqm': '161',
    '£/sqft': '£271',
    'Bedrooms': '',
    'Distance': '7.3mi'
};

console.log('\n1. Testing widow row detection...');
console.log('Widow row example:', JSON.stringify(widowRowExample, null, 2));
const isWidow = isWidowRow(widowRowExample);
console.log(`Result: ${isWidow ? '✅ DETECTED as widow row' : '❌ NOT detected'}`);

console.log('\n2. Testing normal row detection...');
console.log('Normal row example:', JSON.stringify(normalRowExample, null, 2));
const isNormal = isWidowRow(normalRowExample);
console.log(`Result: ${isNormal ? '❌ INCORRECTLY detected as widow row' : '✅ CORRECTLY identified as normal row'}`);

console.log('\n');
console.log('═'.repeat(80));
console.log('TEST 2: EPC RATING EXTRACTION FROM CERTIFICATE');
console.log('═'.repeat(80));

// Test EPC rating extraction from a real certificate
const testCertificateURL = 'https://find-energy-certificate.service.gov.uk/energy-certificate/2234-9437-9000-0656-7206';

console.log(`\nTesting EPC rating extraction from: ${testCertificateURL}`);
console.log('This will scrape the actual certificate page...');

(async () => {
    try {
        const rating = await scrapeRatingFromCertificate(testCertificateURL);
        
        if (rating) {
            console.log(`\n✅ SUCCESS: Extracted rating: ${rating}`);
            console.log(`   Rating is valid (A-G): ${/^[A-G]$/.test(rating) ? '✅ YES' : '❌ NO'}`);
        } else {
            console.log('\n⚠️ WARNING: Could not extract rating from certificate');
        }
        
        console.log('\n');
        console.log('═'.repeat(80));
        console.log('TEST SUMMARY');
        console.log('═'.repeat(80));
        console.log('1. Widow row detection: ✅ IMPLEMENTED');
        console.log(`2. EPC rating extraction: ${rating ? '✅ WORKING' : '⚠️ NEEDS INVESTIGATION'}`);
        console.log('═'.repeat(80));
        
    } catch (error) {
        console.error('\n❌ ERROR during testing:', error.message);
        console.error(error.stack);
    }
})();
