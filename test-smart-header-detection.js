#!/usr/bin/env node

/**
 * Comprehensive test suite for smart header detection
 * Tests the CSV parser with various file structures
 */

const fs = require('fs');
const { parseCSV } = require('./src/utils/csvParser');

console.log('='.repeat(80));
console.log('SMART HEADER DETECTION TEST SUITE');
console.log('='.repeat(80));
console.log();

// Test files
const testFiles = [
    {
        name: 'data (3).csv',
        path: '/home/ubuntu/Uploads/data (3).csv',
        description: 'TARGET metadata on row 1, headers on row 3',
        expectedHeaderRow: 2,
        expectedDataRows: 50
    },
    {
        name: 'output (22).csv',
        path: '/home/ubuntu/Uploads/output (22).csv',
        description: 'Standard format with headers on row 1',
        expectedHeaderRow: 0,
        expectedDataRows: 20
    },
    {
        name: 'output (23).csv',
        path: '/home/ubuntu/Uploads/output (23).csv',
        description: 'Standard format with headers on row 1',
        expectedHeaderRow: 0,
        expectedDataRows: 20
    }
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Run tests
testFiles.forEach(testFile => {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`TEST: ${testFile.name}`);
    console.log(`Description: ${testFile.description}`);
    console.log(`${'─'.repeat(80)}\n`);
    
    totalTests++;
    
    try {
        // Check if file exists
        if (!fs.existsSync(testFile.path)) {
            console.log(`❌ FAILED: File not found: ${testFile.path}\n`);
            failedTests++;
            return;
        }
        
        // Read and parse CSV
        const csvContent = fs.readFileSync(testFile.path, 'utf-8');
        const result = parseCSV(csvContent);
        
        // Verify results
        console.log(`✓ Parsing successful`);
        console.log(`✓ Data rows parsed: ${result.length}`);
        
        // Check if we have data
        if (result.length === 0) {
            console.log(`❌ FAILED: No data rows parsed\n`);
            failedTests++;
            return;
        }
        
        // Verify required columns are present
        const requiredColumns = ['Date of sale', 'Address', 'Postcode', 'Type', 'Price'];
        const firstRow = result[0];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));
        
        if (missingColumns.length > 0) {
            console.log(`❌ FAILED: Missing columns: ${missingColumns.join(', ')}\n`);
            failedTests++;
            return;
        }
        
        console.log(`✓ All required columns present`);
        
        // Check that we have actual data (not all empty)
        const hasData = requiredColumns.some(col => {
            const values = result.slice(0, 5).map(row => row[col]);
            return values.some(val => val && val.trim() !== '' && val !== 'nan');
        });
        
        if (!hasData) {
            console.log(`❌ FAILED: No actual data found in required columns\n`);
            failedTests++;
            return;
        }
        
        console.log(`✓ Data contains valid values`);
        
        // Show sample data
        console.log(`\nSample data (first row):`);
        console.log(`  Date: ${firstRow['Date of sale']}`);
        console.log(`  Address: ${firstRow.Address}`);
        console.log(`  Postcode: ${firstRow.Postcode}`);
        console.log(`  Type: ${firstRow.Type}`);
        console.log(`  Price: ${firstRow.Price}`);
        console.log(`  isTarget: ${firstRow.isTarget}`);
        
        console.log(`\n✅ TEST PASSED\n`);
        passedTests++;
        
    } catch (error) {
        console.log(`❌ FAILED: ${error.message}`);
        console.error(error.stack);
        console.log();
        failedTests++;
    }
});

// Summary
console.log('\n' + '='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log(`Total tests: ${totalTests}`);
console.log(`Passed: ${passedTests} ✅`);
console.log(`Failed: ${failedTests} ${failedTests > 0 ? '❌' : ''}`);
console.log(`Success rate: ${Math.round((passedTests / totalTests) * 100)}%`);
console.log('='.repeat(80));

// Exit with appropriate code
process.exit(failedTests > 0 ? 1 : 0);
