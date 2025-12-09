/**
 * Test script to verify Image_URL Link and EPC Certificate Link columns
 * are correctly added and ordered in the output
 */

const { addHyperlinks } = require('./src/utils/excelHelper');
const { STANDARD_HEADERS } = require('./src/utils/csvParser');

console.log('='.repeat(80));
console.log('HYPERLINK COLUMNS TEST');
console.log('='.repeat(80));
console.log('');

// Test 1: Verify STANDARD_HEADERS includes new columns in correct order
console.log('Test 1: Verify STANDARD_HEADERS array');
console.log('-'.repeat(80));
console.log('Expected columns:');
console.log('  - Image_URL (column 17)');
console.log('  - Image_URL Link (column 18) <- NEW');
console.log('  - EPC Certificate (column 20)');
console.log('  - EPC Certificate Link (column 21) <- NEW');
console.log('');

const imageUrlIndex = STANDARD_HEADERS.indexOf('Image_URL');
const imageUrlLinkIndex = STANDARD_HEADERS.indexOf('Image_URL Link');
const epcCertIndex = STANDARD_HEADERS.indexOf('EPC Certificate');
const epcCertLinkIndex = STANDARD_HEADERS.indexOf('EPC Certificate Link');

console.log('Actual positions:');
console.log(`  - Image_URL: ${imageUrlIndex} ✓`);
console.log(`  - Image_URL Link: ${imageUrlLinkIndex} ${imageUrlLinkIndex === imageUrlIndex + 1 ? '✓' : '❌'}`);
console.log(`  - EPC Certificate: ${epcCertIndex} ✓`);
console.log(`  - EPC Certificate Link: ${epcCertLinkIndex} ${epcCertLinkIndex === epcCertIndex + 1 ? '✓' : '❌'}`);
console.log('');

if (imageUrlLinkIndex === imageUrlIndex + 1 && epcCertLinkIndex === epcCertIndex + 1) {
    console.log('✅ Test 1 PASSED: All hyperlink columns are in correct order');
} else {
    console.log('❌ Test 1 FAILED: Column ordering is incorrect');
}
console.log('');

// Test 2: Verify addHyperlinks function generates both new columns
console.log('Test 2: Verify addHyperlinks function');
console.log('-'.repeat(80));

const testProperties = [
    {
        Address: '123 Main Street',
        Postcode: 'AB12 3CD',
        URL: 'https://www.rightmove.co.uk/properties/123456',
        Image_URL: 'https://photos.zillowstatic.com/fp/cfdb889fbce9aef86db6af969fc2f292-cc_ft_960.jpg',
        'EPC Certificate': 'https://find-energy-certificate.service.gov.uk/energy-certificate/1234-5678-9012-3456-7890'
    },
    {
        Address: '456 Oak Avenue',
        Postcode: 'XY45 6ZZ',
        URL: 'https://www.propertydata.co.uk/listing/789',
        Image_URL: '',  // Empty image URL
        'EPC Certificate': 'https://find-energy-certificate.service.gov.uk/energy-certificate/9876-5432-1098-7654-3210'
    },
    {
        Address: '789 Pine Road',
        Postcode: 'CD78 9EF',
        URL: 'https://www.rightmove.co.uk/properties/999',
        Image_URL: 'https://photos.zillowstatic.com/fp/7eea11f4dadc4f847434729d481c583b-cc_ft_960.jpg',
        'EPC Certificate': ''  // Empty EPC Certificate
    }
];

const withHyperlinks = addHyperlinks(testProperties);

console.log('Testing property 1 (has both Image_URL and EPC Certificate):');
console.log(`  URL: ${withHyperlinks[0].URL}`);
console.log(`  Link: ${withHyperlinks[0].Link}`);
console.log(`  Image_URL: ${withHyperlinks[0].Image_URL}`);
console.log(`  Image_URL Link: ${withHyperlinks[0]['Image_URL Link']}`);
console.log(`  EPC Certificate: ${withHyperlinks[0]['EPC Certificate']}`);
console.log(`  EPC Certificate Link: ${withHyperlinks[0]['EPC Certificate Link']}`);
console.log('');

console.log('Testing property 2 (has EPC but no Image_URL):');
console.log(`  Image_URL: "${withHyperlinks[1].Image_URL}"`);
console.log(`  Image_URL Link: "${withHyperlinks[1]['Image_URL Link']}"`);
console.log(`  EPC Certificate: ${withHyperlinks[1]['EPC Certificate']}`);
console.log(`  EPC Certificate Link: ${withHyperlinks[1]['EPC Certificate Link']}`);
console.log('');

console.log('Testing property 3 (has Image_URL but no EPC):');
console.log(`  Image_URL: ${withHyperlinks[2].Image_URL}`);
console.log(`  Image_URL Link: ${withHyperlinks[2]['Image_URL Link']}`);
console.log(`  EPC Certificate: "${withHyperlinks[2]['EPC Certificate']}"`);
console.log(`  EPC Certificate Link: "${withHyperlinks[2]['EPC Certificate Link']}"`);
console.log('');

// Verify all expected columns exist
let test2Passed = true;
if (!withHyperlinks[0]['Image_URL Link'] || !withHyperlinks[0]['Image_URL Link'].includes('HYPERLINK')) {
    console.log('❌ Property 1: Image_URL Link is missing or invalid');
    test2Passed = false;
}
if (!withHyperlinks[0]['EPC Certificate Link'] || !withHyperlinks[0]['EPC Certificate Link'].includes('HYPERLINK')) {
    console.log('❌ Property 1: EPC Certificate Link is missing or invalid');
    test2Passed = false;
}
if (withHyperlinks[1]['Image_URL Link'] !== '') {
    console.log('❌ Property 2: Image_URL Link should be empty when Image_URL is empty');
    test2Passed = false;
}
if (withHyperlinks[2]['EPC Certificate Link'] !== '') {
    console.log('❌ Property 3: EPC Certificate Link should be empty when EPC Certificate is empty');
    test2Passed = false;
}

if (test2Passed) {
    console.log('✅ Test 2 PASSED: addHyperlinks generates correct formulas');
} else {
    console.log('❌ Test 2 FAILED: addHyperlinks has issues');
}
console.log('');

// Test 3: Display full column order
console.log('Test 3: Full column order');
console.log('-'.repeat(80));
STANDARD_HEADERS.forEach((header, index) => {
    const marker = ['Image_URL Link', 'EPC Certificate Link'].includes(header) ? ' <-- NEW' : '';
    console.log(`${(index + 1).toString().padStart(2, '0')}. ${header}${marker}`);
});
console.log('');

console.log('='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log('✅ All tests should pass for the implementation to be correct');
console.log('');
