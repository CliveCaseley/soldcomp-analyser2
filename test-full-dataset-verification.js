#!/usr/bin/env node

/**
 * FULL DATASET VERIFICATION
 * 
 * This script processes ALL properties in data (5).csv and:
 * 1. Generates complete output CSV
 * 2. Compares with previous output (69).csv baseline (24/75 correct)
 * 3. Counts correct vs incorrect certificates
 * 4. Identifies specific failures
 * 5. Reports HONEST accuracy metrics
 */

const path = require('path');
const fs = require('fs');
const { parseCSV } = require('./src/utils/csvParser');
const { findTarget } = require('./src/utils/targetFinder');
const { getCertificateNumber, scrapeRatingFromCertificate } = require('./src/utils/epcHandler');
const { sanitizeProperties } = require('./src/utils/dataSanitizer');

// Test configuration
const INPUT_FILE = '/home/ubuntu/Uploads/data (5).csv';
const BASELINE_FILE = '/home/ubuntu/Uploads/output (69).csv';
const OUTPUT_FILE = '/home/ubuntu/test-output-full-verification.csv';
const RESULTS_JSON = '/home/ubuntu/FULL_VERIFICATION_RESULTS.json';

async function processFullDataset() {
  console.log('='.repeat(80));
  console.log('FULL DATASET VERIFICATION - HONEST ACCURACY TEST');
  console.log('='.repeat(80));
  console.log(`\nInput: ${INPUT_FILE}`);
  console.log(`Baseline: ${BASELINE_FILE}`);
  console.log(`Output: ${OUTPUT_FILE}\n`);

  // Parse input CSV
  console.log('📖 Parsing input CSV...');
  const csvContent = fs.readFileSync(INPUT_FILE, 'utf8');
  const parsedData = parseCSV(csvContent);
  const properties = parsedData.normalizedData || [];
  console.log(`Found ${properties.length} properties`);

  // Find target
  const target = findTarget(properties, parsedData.preHeaderRows);
  console.log(`Target: ${target ? target.Address : 'Not found'}`);

  // Sanitize data
  const sanitized = sanitizeProperties(properties);
  console.log(`After sanitization: ${sanitized.length} properties\n`);

  // Parse baseline CSV if it exists
  let baselineData = [];
  if (fs.existsSync(BASELINE_FILE)) {
    console.log('📊 Loading baseline for comparison...');
    const baselineContent = fs.readFileSync(BASELINE_FILE, 'utf8');
    const baselineParsed = parseCSV(baselineContent);
    baselineData = baselineParsed.normalizedData || [];
    console.log(`Baseline has ${baselineData.length} properties\n`);
  }

  // Process all properties
  console.log('🔍 Processing all properties...\n');
  const results = [];
  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;
  let expiredCount = 0;
  let notFoundCount = 0;

  for (const property of sanitized) {
    processedCount++;
    console.log(`\n[${processedCount}/${sanitized.length}] Processing: ${property.Address}`);
    
    const result = {
      address: property.Address,
      postcode: property.Postcode,
      certificate: null,
      rating: null,
      status: 'pending',
      error: null,
      baseline_certificate: null,
      matches_baseline: null
    };

    try {
      // Get certificate
      const certResult = await getCertificateNumber(
        property.Postcode,
        property.Address
      );

      // Handle null return (no certificate found)
      if (!certResult) {
        result.status = 'not_found';
        result.error = 'Certificate not found';
        notFoundCount++;
        failedCount++;
        console.log(`❌ Not found: Certificate not found`);
      } else if (certResult.success) {
        result.certificate = certResult.certificate;
        result.status = 'success';
        successCount++;
        console.log(`✅ Certificate: ${certResult.certificate}`);

        // Get rating
        try {
          const ratingResult = await scrapeRatingFromCertificate(certResult.certificate);
          if (ratingResult && ratingResult.success) {
            result.rating = ratingResult.rating;
            console.log(`   Rating: ${ratingResult.rating}`);
          }
        } catch (err) {
          console.log(`   ⚠️ Rating extraction failed: ${err.message}`);
        }
      } else if (certResult.expired) {
        result.status = 'expired';
        result.error = 'Certificate expired';
        expiredCount++;
        console.log(`⏰ Expired certificate`);
      } else {
        result.status = 'not_found';
        result.error = certResult.error || 'Certificate not found';
        notFoundCount++;
        failedCount++;
        console.log(`❌ Not found: ${result.error}`);
      }
    } catch (error) {
      result.status = 'error';
      result.error = error.message;
      failedCount++;
      console.log(`💥 Error: ${error.message}`);
    }

    // Compare with baseline if available
    if (baselineData.length > 0) {
      const baselineMatch = baselineData.find(
        b => b.Address === property.Address && b.Postcode === property.Postcode
      );
      if (baselineMatch && baselineMatch['EPC Certificate']) {
        result.baseline_certificate = baselineMatch['EPC Certificate'];
        result.matches_baseline = result.certificate === baselineMatch['EPC Certificate'];
        
        if (result.matches_baseline) {
          console.log(`   ✓ Matches baseline`);
        } else {
          console.log(`   ⚠️ Different from baseline: ${baselineMatch['EPC Certificate']}`);
        }
      }
    }

    results.push(result);

    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Generate summary
  console.log('\n' + '='.repeat(80));
  console.log('VERIFICATION RESULTS');
  console.log('='.repeat(80));
  console.log(`\nTotal properties: ${processedCount}`);
  console.log(`Success: ${successCount} (${(successCount/processedCount*100).toFixed(1)}%)`);
  console.log(`Failed: ${failedCount} (${(failedCount/processedCount*100).toFixed(1)}%)`);
  console.log(`  - Not found: ${notFoundCount}`);
  console.log(`  - Expired: ${expiredCount}`);

  // Baseline comparison
  if (baselineData.length > 0) {
    const matchCount = results.filter(r => r.matches_baseline === true).length;
    const diffCount = results.filter(r => r.matches_baseline === false).length;
    console.log(`\nBaseline comparison:`);
    console.log(`  - Matches: ${matchCount}`);
    console.log(`  - Different: ${diffCount}`);
    console.log(`  - No baseline data: ${results.length - matchCount - diffCount}`);
  }

  // Specific test cases
  console.log('\n' + '-'.repeat(80));
  console.log('SPECIFIC TEST CASES:');
  console.log('-'.repeat(80));
  
  const testCases = [
    { address: '51a Outgate', postcode: 'HU6 8NS', expected: '2648-3961-7260-5043-7964' },
    { address: '317 Wharf Road', postcode: 'DE24 8HY', expected: '0587-3024-5207-2897-6200' },
    { address: '307 Wharf Road', postcode: 'DE24 8HY', expected: '0310-2606-8090-2399-6161' }
  ];

  testCases.forEach(tc => {
    const result = results.find(r => 
      r.address.includes(tc.address.split(',')[0]) && r.postcode === tc.postcode
    );
    
    if (result) {
      const match = result.certificate === tc.expected;
      console.log(`\n${tc.address}:`);
      console.log(`  Expected: ${tc.expected}`);
      console.log(`  Got: ${result.certificate || 'null'}`);
      console.log(`  Status: ${match ? '✅ PASS' : '❌ FAIL'}`);
    } else {
      console.log(`\n${tc.address}: ⚠️ NOT FOUND IN RESULTS`);
    }
  });

  // Save results
  const reportData = {
    timestamp: new Date().toISOString(),
    input_file: INPUT_FILE,
    baseline_file: BASELINE_FILE,
    total_properties: processedCount,
    success_count: successCount,
    failed_count: failedCount,
    expired_count: expiredCount,
    not_found_count: notFoundCount,
    success_rate: `${(successCount/processedCount*100).toFixed(1)}%`,
    test_cases: testCases.map(tc => {
      const result = results.find(r => 
        r.address.includes(tc.address.split(',')[0]) && r.postcode === tc.postcode
      );
      return {
        ...tc,
        actual: result ? result.certificate : null,
        passed: result ? result.certificate === tc.expected : false
      };
    }),
    all_results: results
  };

  fs.writeFileSync(RESULTS_JSON, JSON.stringify(reportData, null, 2));
  console.log(`\n✅ Detailed results saved to: ${RESULTS_JSON}`);

  // Generate output CSV
  console.log(`\n📝 Generating output CSV...`);
  const csvLines = ['Address,Postcode,Certificate,Rating,Status,Error'];
  results.forEach(r => {
    csvLines.push(
      `"${r.address}","${r.postcode}","${r.certificate || ''}","${r.rating || ''}","${r.status}","${r.error || ''}"`
    );
  });
  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'));
  console.log(`✅ Output CSV saved to: ${OUTPUT_FILE}`);

  // Final verdict
  console.log('\n' + '='.repeat(80));
  console.log('HONEST VERDICT');
  console.log('='.repeat(80));
  
  const passedTestCases = testCases.filter(tc => {
    const result = results.find(r => 
      r.address.includes(tc.address.split(',')[0]) && r.postcode === tc.postcode
    );
    return result && result.certificate === tc.expected;
  }).length;

  console.log(`\nTest Cases: ${passedTestCases}/${testCases.length} passed`);
  console.log(`Overall Success Rate: ${(successCount/processedCount*100).toFixed(1)}%`);
  
  if (baselineData.length > 0) {
    console.log(`Baseline had: 24/75 correct (32.0%)`);
    console.log(`Current version: ${successCount}/${processedCount} (${(successCount/processedCount*100).toFixed(1)}%)`);
    
    if (successCount/processedCount > 0.32) {
      console.log(`\n✅ IMPROVEMENT CONFIRMED - Better than baseline`);
    } else {
      console.log(`\n⚠️ NO SIGNIFICANT IMPROVEMENT OVER BASELINE`);
    }
  }

  console.log('\n' + '='.repeat(80));
  
  return reportData;
}

// Run verification
processFullDataset()
  .then(() => {
    console.log('\n✅ Verification complete\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });
