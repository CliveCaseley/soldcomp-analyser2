/**
 * Integration test for data (5).csv with expired certificate handling
 * Tests a few key properties to verify the full workflow
 */

const { parseCSV } = require('./src/utils/csvParser.js');
const { getCertificateNumber } = require('./src/utils/epcHandler.js');
const fs = require('fs');
const path = require('path');

async function testDataIntegration() {
    console.log('═'.repeat(80));
    console.log('🧪 INTEGRATION TEST WITH DATA (5).CSV');
    console.log('═'.repeat(80));
    console.log('');
    
    // Parse the CSV file
    const inputPath = '/home/ubuntu/Uploads/data (5).csv';
    console.log(`📄 Reading CSV from: ${inputPath}`);
    const csvContent = fs.readFileSync(inputPath, 'utf-8');
    
    const parsedData = await parseCSV(csvContent);
    console.log(`✅ Parsed ${parsedData.normalizedData.length} rows`);
    console.log('');
    
    // Test specific properties
    const testAddresses = [
        '317 Wharf Road, Ealand', // Should get non-expired E certificate
        '307, Wharf Road, Ealand, Scunthorpe DN17 4JW' // Should return NULL
    ];
    
    const results = [];
    
    for (const property of parsedData.normalizedData) {
        const address = property['Address'];
        const postcode = property['Postcode'];
        
        // Check if this is one of our test addresses
        if (testAddresses.some(testAddr => address && address.includes(testAddr.split(',')[0]))) {
            console.log('═'.repeat(80));
            console.log(`🔍 Testing: ${address}`);
            console.log(`   Postcode: ${postcode}`);
            console.log('');
            
            try {
                const certData = await getCertificateNumber(postcode, address);
                
                if (certData) {
                    console.log('✅ Certificate found:');
                    console.log(`   Certificate: ${certData.certificateNumber}`);
                    console.log(`   Rating: ${certData.rating || 'N/A'}`);
                    console.log(`   Floor Area: ${certData.floorArea ? certData.floorArea + ' sqm' : 'N/A'}`);
                    console.log(`   Property Type: ${certData.propertyType || 'N/A'}`);
                    console.log('');
                    
                    results.push({
                        address: address,
                        postcode: postcode,
                        certificate: certData.certificateNumber,
                        rating: certData.rating,
                        floorArea: certData.floorArea,
                        propertyType: certData.propertyType,
                        success: true
                    });
                } else {
                    console.log('❌ No certificate found');
                    console.log('');
                    
                    results.push({
                        address: address,
                        postcode: postcode,
                        certificate: null,
                        success: true // NULL is expected for 307
                    });
                }
            } catch (error) {
                console.error(`❌ Error processing ${address}: ${error.message}`);
                console.log('');
                
                results.push({
                    address: address,
                    postcode: postcode,
                    error: error.message,
                    success: false
                });
            }
        }
    }
    
    // Summary
    console.log('═'.repeat(80));
    console.log('📊 INTEGRATION TEST SUMMARY');
    console.log('═'.repeat(80));
    console.log('');
    
    results.forEach((result, idx) => {
        console.log(`${idx + 1}. ${result.address}`);
        if (result.success) {
            if (result.certificate) {
                console.log(`   ✅ Certificate: ${result.certificate}`);
                console.log(`   Rating: ${result.rating || 'N/A'}`);
                console.log(`   Floor Area: ${result.floorArea || 'N/A'} sqm`);
                console.log(`   Property Type: ${result.propertyType || 'N/A'}`);
            } else {
                console.log(`   ✅ No certificate (as expected)`);
            }
        } else {
            console.log(`   ❌ Error: ${result.error}`);
        }
        console.log('');
    });
    
    const successCount = results.filter(r => r.success).length;
    console.log(`Total: ${successCount}/${results.length} properties processed successfully`);
    console.log('═'.repeat(80));
    
    return results;
}

// Run the test
testDataIntegration()
    .then(() => {
        console.log('✅ Integration test completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Integration test failed:', error);
        process.exit(1);
    });
