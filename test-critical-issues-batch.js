/**
 * COMPREHENSIVE TEST SUITE: Critical Issues Batch
 * 
 * Tests all 4 critical issues:
 * 1. Target URL preservation
 * 2. EPC Lookup row corruption
 * 3. Duplicate detection with wrong data
 * 4. UTF-8 encoding (£ vs Â£)
 */

const { parseCSV, cleanProperty } = require('./src/utils/csvParser');
const { findTarget } = require('./src/utils/targetFinder');
const { detectAndMergeDuplicates } = require('./src/utils/duplicateDetector');
const { createEPCLookupRow } = require('./src/utils/epcHandler');
const fs = require('fs');
const path = require('path');

console.log('═'.repeat(80));
console.log('COMPREHENSIVE TEST SUITE: Critical Issues Batch');
console.log('═'.repeat(80));
console.log('');

// ========================================================================
// TEST 1: UTF-8 Encoding Issue (£ vs Â£)
// ========================================================================
console.log('━'.repeat(80));
console.log('TEST 1: UTF-8 Encoding Issue');
console.log('━'.repeat(80));
console.log('');

console.log('Reading data.csv with UTF-8 encoding...');
const dataCSVPath = '/home/ubuntu/Uploads/data.csv';
const dataCSVContent = fs.readFileSync(dataCSVPath, 'utf8');

// Check for encoding issues
const hasEncodingIssue = dataCSVContent.includes('Â£');
const hasPoundSign = dataCSVContent.includes('£');

console.log(`❌ Contains "Â£" (corrupted): ${hasEncodingIssue}`);
console.log(`✅ Contains "£" (correct): ${hasPoundSign}`);

if (hasEncodingIssue) {
    console.log('');
    console.log('ISSUE CONFIRMED: UTF-8 encoding corruption detected');
    console.log('Sample corrupted text:');
    const lines = dataCSVContent.split('\n').filter(line => line.includes('Â£'));
    console.log(lines.slice(0, 3).join('\n'));
}

console.log('');

// ========================================================================
// TEST 2: Parse CSV and Check for Pre-existing Issues
// ========================================================================
console.log('━'.repeat(80));
console.log('TEST 2: Parse CSV and Check Target/EPC Lookup');
console.log('━'.repeat(80));
console.log('');

const parseResult = parseCSV(dataCSVContent);
let properties = parseResult.normalizedData.map(cleanProperty);
const preHeaderRows = parseResult.preHeaderRows;

console.log(`Parsed ${properties.length} properties`);
console.log(`Pre-header rows: ${preHeaderRows.length}`);
console.log('');

// Find target
const { target, comparables } = findTarget(properties, preHeaderRows);
console.log(`Target property: ${target.Address}, ${target.Postcode}`);
console.log(`Target URL: ${target.URL}`);
console.log(`Target URL length: ${target.URL ? target.URL.length : 0}`);
console.log('');

// Check for EPC Lookup rows in input
const epcLookupInInput = properties.filter(p => 
    p.Address === 'EPC Lookup' || p._isEPCLookupRow
);
console.log(`EPC Lookup rows in INPUT: ${epcLookupInInput.length}`);
if (epcLookupInInput.length > 0) {
    console.log('❌ ISSUE: EPC Lookup rows should NOT exist in input CSV!');
    epcLookupInInput.forEach((p, idx) => {
        console.log(`  Row ${idx + 1}:`);
        console.log(`    Address: ${p.Address}`);
        console.log(`    Postcode: ${p.Postcode}`);
        console.log(`    Sq. ft: ${p['Sq. ft']}`);
        console.log(`    Distance: ${p.Distance}`);
        console.log(`    Ranking: ${p.Ranking}`);
        console.log(`    _isEPCLookupRow: ${p._isEPCLookupRow}`);
    });
} else {
    console.log('✅ No EPC Lookup rows in input (correct)');
}
console.log('');

// ========================================================================
// TEST 3: Duplicate Detection - "The Vicarage" Issue
// ========================================================================
console.log('━'.repeat(80));
console.log('TEST 3: Duplicate Detection - Check for "The Vicarage"');
console.log('━'.repeat(80));
console.log('');

const vicarageProperties = comparables.filter(p => 
    p.Address && p.Address.includes('The Vicarage')
);

console.log(`Found ${vicarageProperties.length} properties with "The Vicarage" in address`);
vicarageProperties.forEach((p, idx) => {
    console.log(`\nProperty ${idx + 1}:`);
    console.log(`  Address: ${p.Address}`);
    console.log(`  Price: £${p.Price}`);
    console.log(`  Sq. ft: ${p['Sq. ft']}`);
    console.log(`  Sqm: ${p.Sqm}`);
    console.log(`  URL: ${p.URL}`);
});

if (vicarageProperties.length > 1) {
    console.log('');
    console.log('❌ DUPLICATE DETECTED: Multiple "The Vicarage" properties before merge');
} else {
    console.log('');
    console.log('✅ No duplicates before merge (or already merged in input)');
}

// Now test duplicate detection
console.log('');
console.log('Running duplicate detection...');
const beforeCount = comparables.length;
const deduped = detectAndMergeDuplicates(comparables);
const afterCount = deduped.length;
const removed = beforeCount - afterCount;

console.log(`Before: ${beforeCount} properties`);
console.log(`After: ${afterCount} properties`);
console.log(`Removed: ${removed} duplicates`);

const vicarageAfterDedup = deduped.filter(p => 
    p.Address && p.Address.includes('The Vicarage')
);

console.log('');
console.log(`"The Vicarage" properties after deduplication: ${vicarageAfterDedup.length}`);
vicarageAfterDedup.forEach((p, idx) => {
    console.log(`\nProperty ${idx + 1}:`);
    console.log(`  Address: ${p.Address}`);
    console.log(`  Price: £${p.Price}`);
    console.log(`  Sq. ft: ${p['Sq. ft']}`);
    console.log(`  Sqm: ${p.Sqm}`);
    console.log(`  URL: ${p.URL}`);
    console.log(`  needs_review: ${p.needs_review}`);
});

if (vicarageAfterDedup.length > 1) {
    console.log('');
    console.log('❌ ISSUE: Still have duplicates after deduplication!');
} else if (vicarageAfterDedup.length === 1) {
    console.log('');
    console.log('✅ Duplicates merged successfully');
}

// ========================================================================
// TEST 4: EPC Lookup Row Creation and Integrity
// ========================================================================
console.log('');
console.log('━'.repeat(80));
console.log('TEST 4: EPC Lookup Row Creation and Integrity');
console.log('━'.repeat(80));
console.log('');

const epcLookupRow = createEPCLookupRow(target.Postcode);

console.log('Created EPC Lookup row:');
console.log(`  Address: "${epcLookupRow.Address}"`);
console.log(`  Postcode: ${epcLookupRow.Postcode}`);
console.log(`  Sq. ft: "${epcLookupRow['Sq. ft']}"`);
console.log(`  Sqm: "${epcLookupRow.Sqm}"`);
console.log(`  Distance: "${epcLookupRow.Distance}"`);
console.log(`  Ranking: "${epcLookupRow.Ranking}"`);
console.log(`  _isEPCLookupRow: ${epcLookupRow._isEPCLookupRow}`);
console.log(`  URL: ${epcLookupRow.URL}`);

// Validate EPC Lookup row has NO property data
const hasPropertyData = 
    epcLookupRow['Sq. ft'] !== '' ||
    epcLookupRow.Sqm !== '' ||
    epcLookupRow.Distance !== '' ||
    epcLookupRow.Ranking !== '';

if (hasPropertyData) {
    console.log('');
    console.log('❌ ISSUE: EPC Lookup row has property data (should be empty)!');
} else {
    console.log('');
    console.log('✅ EPC Lookup row correctly has NO property data');
}

// ========================================================================
// TEST 5: Check Output CSV for Issues
// ========================================================================
console.log('');
console.log('━'.repeat(80));
console.log('TEST 5: Analyze Output CSV (output (55).csv)');
console.log('━'.repeat(80));
console.log('');

const outputCSVPath = '/home/ubuntu/Uploads/output (55).csv';
if (fs.existsSync(outputCSVPath)) {
    const outputCSVContent = fs.readFileSync(outputCSVPath, 'utf8');
    const outputParseResult = parseCSV(outputCSVContent);
    const outputProperties = outputParseResult.normalizedData;
    
    console.log(`Parsed ${outputProperties.length} properties from output CSV`);
    console.log('');
    
    // Check target URL
    const outputTarget = outputProperties.find(p => p.isTarget == 1 || p.isTarget === '1');
    if (outputTarget) {
        console.log('Target property in output:');
        console.log(`  Address: ${outputTarget.Address}`);
        console.log(`  URL: ${outputTarget.URL}`);
        console.log(`  URL is just "View": ${outputTarget.URL === 'View'}`);
        
        if (outputTarget.URL === 'View' || outputTarget.URL === 'view') {
            console.log('');
            console.log('❌ ISSUE CONFIRMED: Target URL is just "View" (corrupted)!');
        } else {
            console.log('');
            console.log('✅ Target URL preserved correctly');
        }
    } else {
        console.log('⚠️  Could not find target property in output');
    }
    
    console.log('');
    
    // Check EPC Lookup rows in output
    const outputEPCLookup = outputProperties.filter(p => 
        p.Address === 'EPC Lookup'
    );
    
    console.log(`EPC Lookup rows in OUTPUT: ${outputEPCLookup.length}`);
    outputEPCLookup.forEach((p, idx) => {
        console.log(`\nEPC Lookup Row ${idx + 1}:`);
        console.log(`  Address: ${p.Address}`);
        console.log(`  Postcode: ${p.Postcode}`);
        console.log(`  Sq. ft: ${p['Sq. ft']}`);
        console.log(`  Sqm: ${p.Sqm}`);
        console.log(`  Distance: ${p.Distance}`);
        console.log(`  Ranking: ${p.Ranking}`);
        console.log(`  Latitude: ${p.Latitude}`);
        console.log(`  Longitude: ${p.Longitude}`);
        
        const hasData = p['Sq. ft'] || p.Sqm || p.Distance || p.Ranking;
        if (hasData) {
            console.log('  ❌ CORRUPTED: Has property data!');
        } else {
            console.log('  ✅ Clean: No property data');
        }
    });
    
    console.log('');
    
    // Check for "The Vicarage" duplicates
    const outputVicarage = outputProperties.filter(p => 
        p.Address && p.Address.includes('The Vicarage')
    );
    
    console.log(`"The Vicarage" properties in OUTPUT: ${outputVicarage.length}`);
    outputVicarage.forEach((p, idx) => {
        console.log(`\nProperty ${idx + 1}:`);
        console.log(`  Address: ${p.Address}`);
        console.log(`  Price: £${p.Price}`);
        console.log(`  Sq. ft: ${p['Sq. ft']}`);
        console.log(`  Sqm: ${p.Sqm}`);
        console.log(`  needs_review: ${p.needs_review}`);
    });
    
    if (outputVicarage.length > 1) {
        console.log('');
        console.log('❌ ISSUE CONFIRMED: Duplicate "The Vicarage" in output!');
    } else {
        console.log('');
        console.log('✅ No duplicates in output');
    }
    
    // Check UTF-8 encoding in output
    const outputHasEncodingIssue = outputCSVContent.includes('Â£');
    const outputHasPoundSign = outputCSVContent.includes('£');
    
    console.log('');
    console.log('UTF-8 encoding in OUTPUT:');
    console.log(`  Contains "Â£" (corrupted): ${outputHasEncodingIssue}`);
    console.log(`  Contains "£" (correct): ${outputHasPoundSign}`);
    
    if (outputHasEncodingIssue) {
        console.log('  ❌ ISSUE: UTF-8 encoding corruption in output');
    } else {
        console.log('  ✅ No encoding issues in output');
    }
    
} else {
    console.log('⚠️  output (55).csv not found');
}

console.log('');
console.log('═'.repeat(80));
console.log('TEST SUITE COMPLETE');
console.log('═'.repeat(80));
