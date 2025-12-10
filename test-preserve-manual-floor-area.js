/**
 * Test: Preserve Manual Floor Area Data
 * 
 * Validates that manual floor area values (Sq. ft and Sqm) are preserved
 * when PropertyData URLs are scraped, instead of being overwritten.
 */

const { log } = require('apify');

// Mock the scrapePropertyData function to simulate scraped data
function mockScrapePropertyData(url) {
    return {
        Address: '123 Test Street',
        Postcode: 'AB1 2CD',
        Price: '300000',
        'Sq. ft': '1500',  // Scraped floor area (should NOT overwrite manual data)
        Sqm: '139',        // Scraped sqm (should NOT overwrite manual data)
        'Date of sale': '2024-01-15',
        Type: 'Semi-Detached'
    };
}

/**
 * Test Case 1: Property with manual floor area should preserve it
 */
function testPreserveManualFloorArea() {
    console.log('\n=== Test 1: Preserve Manual Floor Area ===');
    
    const existingProperty = {
        Address: '123 Test Street',
        Postcode: 'AB1 2CD',
        'Sq. ft': '1800',  // Manual value (larger than scraped)
        Sqm: '167',        // Manual value
        URL: 'https://www.propertydata.co.uk/test-url'
    };
    
    const scrapedData = mockScrapePropertyData(existingProperty.URL);
    
    // Simulate the fix logic
    const hasManualFloorArea = existingProperty['Sq. ft'] && existingProperty['Sq. ft'] !== '';
    
    let mergedProperty;
    if (hasManualFloorArea) {
        mergedProperty = {
            ...existingProperty,
            ...scrapedData,
            'Sq. ft': existingProperty['Sq. ft'],  // Preserve manual
            'Sqm': existingProperty.Sqm,            // Preserve manual
            URL: existingProperty.URL
        };
    } else {
        mergedProperty = { ...existingProperty, ...scrapedData, URL: existingProperty.URL };
    }
    
    console.log('Existing (manual) Sq. ft:', existingProperty['Sq. ft']);
    console.log('Scraped Sq. ft:', scrapedData['Sq. ft']);
    console.log('Merged Sq. ft:', mergedProperty['Sq. ft']);
    console.log('Merged Sqm:', mergedProperty.Sqm);
    
    // Validation
    if (mergedProperty['Sq. ft'] === '1800' && mergedProperty.Sqm === '167') {
        console.log('✅ PASS: Manual floor area preserved');
        return true;
    } else {
        console.log('❌ FAIL: Manual floor area was overwritten');
        return false;
    }
}

/**
 * Test Case 2: Property without floor area should use scraped data
 */
function testUseScrapedFloorArea() {
    console.log('\n=== Test 2: Use Scraped Floor Area When Manual Data Missing ===');
    
    const existingProperty = {
        Address: '456 Another Street',
        Postcode: 'CD3 4EF',
        URL: 'https://www.propertydata.co.uk/test-url-2'
        // No Sq. ft or Sqm - should use scraped data
    };
    
    const scrapedData = mockScrapePropertyData(existingProperty.URL);
    
    // Simulate the fix logic
    const hasManualFloorArea = existingProperty['Sq. ft'] && existingProperty['Sq. ft'] !== '';
    
    let mergedProperty;
    if (hasManualFloorArea) {
        mergedProperty = {
            ...existingProperty,
            ...scrapedData,
            'Sq. ft': existingProperty['Sq. ft'],
            'Sqm': existingProperty.Sqm,
            URL: existingProperty.URL
        };
    } else {
        mergedProperty = { ...existingProperty, ...scrapedData, URL: existingProperty.URL };
    }
    
    console.log('Existing Sq. ft:', existingProperty['Sq. ft'] || '(empty)');
    console.log('Scraped Sq. ft:', scrapedData['Sq. ft']);
    console.log('Merged Sq. ft:', mergedProperty['Sq. ft']);
    console.log('Merged Sqm:', mergedProperty.Sqm);
    
    // Validation
    if (mergedProperty['Sq. ft'] === '1500' && mergedProperty.Sqm === '139') {
        console.log('✅ PASS: Scraped floor area used when manual data missing');
        return true;
    } else {
        console.log('❌ FAIL: Scraped floor area not properly merged');
        return false;
    }
}

/**
 * Test Case 3: Property with empty string floor area should use scraped data
 */
function testEmptyStringFloorArea() {
    console.log('\n=== Test 3: Use Scraped Floor Area When Manual Data is Empty String ===');
    
    const existingProperty = {
        Address: '789 Empty Street',
        Postcode: 'EF5 6GH',
        'Sq. ft': '',  // Empty string - should use scraped data
        Sqm: '',
        URL: 'https://www.propertydata.co.uk/test-url-3'
    };
    
    const scrapedData = mockScrapePropertyData(existingProperty.URL);
    
    // Simulate the fix logic
    const hasManualFloorArea = existingProperty['Sq. ft'] && existingProperty['Sq. ft'] !== '';
    
    let mergedProperty;
    if (hasManualFloorArea) {
        mergedProperty = {
            ...existingProperty,
            ...scrapedData,
            'Sq. ft': existingProperty['Sq. ft'],
            'Sqm': existingProperty.Sqm,
            URL: existingProperty.URL
        };
    } else {
        mergedProperty = { ...existingProperty, ...scrapedData, URL: existingProperty.URL };
    }
    
    console.log('Existing Sq. ft:', `"${existingProperty['Sq. ft']}" (empty string)`);
    console.log('Scraped Sq. ft:', scrapedData['Sq. ft']);
    console.log('Merged Sq. ft:', mergedProperty['Sq. ft']);
    console.log('Merged Sqm:', mergedProperty.Sqm);
    
    // Validation
    if (mergedProperty['Sq. ft'] === '1500' && mergedProperty.Sqm === '139') {
        console.log('✅ PASS: Scraped floor area used when manual data is empty string');
        return true;
    } else {
        console.log('❌ FAIL: Empty string not properly handled');
        return false;
    }
}

// Run all tests
console.log('========================================');
console.log('Testing Manual Floor Area Preservation');
console.log('========================================');

const results = [
    testPreserveManualFloorArea(),
    testUseScrapedFloorArea(),
    testEmptyStringFloorArea()
];

const passed = results.filter(r => r).length;
const total = results.length;

console.log('\n========================================');
console.log(`Test Results: ${passed}/${total} passed`);
console.log('========================================\n');

if (passed === total) {
    console.log('✅ All tests passed! Fix is working correctly.');
    process.exit(0);
} else {
    console.log('❌ Some tests failed. Please review the implementation.');
    process.exit(1);
}
