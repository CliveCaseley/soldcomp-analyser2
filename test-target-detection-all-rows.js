const fs = require('fs');
const { parseCSV } = require('./src/utils/csvParser');
const { findTarget } = require('./src/utils/targetFinder');

/**
 * Test script to verify target detection works for pre-header rows
 */

// Mock Apify log for standalone testing
global.log = {
    info: (...args) => console.log('[INFO]', ...args),
    warning: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
};

// Test files
const testFiles = [
    '/home/ubuntu/Uploads/data (3).csv',           // Target in row 0, header in row 2
    '/home/ubuntu/Uploads/output (22).csv',        // Target in row 2, header in row 0
    '/home/ubuntu/Uploads/output (23).csv'         // Target in row 2, header in row 0
];

console.log('='.repeat(80));
console.log('TARGET DETECTION TEST - ALL ROWS INCLUDING PRE-HEADER');
console.log('='.repeat(80));
console.log('');

testFiles.forEach((filePath, index) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST ${index + 1}: ${filePath.split('/').pop()}`);
    console.log('='.repeat(80));
    
    try {
        // Read CSV file
        const csvContent = fs.readFileSync(filePath, 'utf8');
        
        // Show first 5 lines of CSV
        const lines = csvContent.split('\n').slice(0, 5);
        console.log('\n📄 First 5 lines of CSV:');
        lines.forEach((line, i) => {
            console.log(`  Row ${i}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
        });
        
        // Parse CSV
        console.log('\n📋 Parsing CSV...');
        const parseResult = parseCSV(csvContent);
        const { normalizedData, preHeaderRows } = parseResult;
        
        console.log(`  ✓ Normalized properties: ${normalizedData.length}`);
        console.log(`  ✓ Pre-header rows: ${preHeaderRows.length}`);
        
        // Show pre-header rows
        if (preHeaderRows.length > 0) {
            console.log('\n📌 Pre-header rows:');
            preHeaderRows.forEach((row, i) => {
                console.log(`  Row ${i}:`, row);
            });
        }
        
        // Find target
        console.log('\n🎯 Finding target...');
        const { target, comparables } = findTarget(normalizedData, preHeaderRows);
        
        console.log('\n✅ TARGET FOUND:');
        console.log(`  Address: ${target.Address || 'N/A'}`);
        console.log(`  Postcode: ${target.Postcode || 'N/A'}`);
        console.log(`  isTarget: ${target.isTarget}`);
        console.log(`  URL: ${target.URL || 'N/A'}`);
        console.log(`  Comparables: ${comparables.length}`);
        
        // Show first 3 comparables
        if (comparables.length > 0) {
            console.log('\n📊 First 3 comparables:');
            comparables.slice(0, 3).forEach((comp, i) => {
                console.log(`  ${i + 1}. ${comp.Address || 'N/A'}, ${comp.Postcode || 'N/A'}`);
            });
        }
        
        console.log('\n✅ TEST PASSED');
        
    } catch (error) {
        console.error('\n❌ TEST FAILED');
        console.error(`Error: ${error.message}`);
        console.error(error.stack);
    }
});

console.log('\n' + '='.repeat(80));
console.log('ALL TESTS COMPLETED');
console.log('='.repeat(80));
