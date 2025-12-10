/**
 * Test 5 properties to verify the hybrid v6 implementation works end-to-end
 */

require('dotenv').config();

const fs = require('fs');
const { parseCSV } = require('./src/utils/csvParser');
const { sanitizeProperties } = require('./src/utils/dataSanitizer');
const { getCertificateNumber } = require('./src/utils/epcHandler');

async function testSample() {
    console.log('═'.repeat(80));
    console.log('SAMPLE TEST - 5 PROPERTIES');
    console.log('═'.repeat(80));
    
    console.log('\n🔐 Credentials:');
    console.log(`Email: ${process.env.EPC_EMAIL || 'NOT SET'}`);
    console.log(`API Key: ${process.env.EPC_API_KEY ? process.env.EPC_API_KEY.substring(0, 10) + '...' : 'NOT SET'}\n`);
    
    // Load data
    const csvContent = fs.readFileSync('/home/ubuntu/Uploads/data (5).csv', 'utf8');
    const parsedData = parseCSV(csvContent);
    const sanitized = sanitizeProperties(parsedData.normalizedData || []);
    
    console.log(`📊 Total properties: ${sanitized.length}`);
    console.log('🔍 Testing first 5 properties...\n');
    
    const results = [];
    
    for (let i = 0; i < Math.min(5, sanitized.length); i++) {
        const property = sanitized[i];
        console.log(`\n[${i + 1}/5] ${property.Address}, ${property.Postcode}`);
        console.log('─'.repeat(80));
        
        try {
            const result = await getCertificateNumber(property.Postcode, property.Address);
            
            if (result) {
                results.push({
                    address: property.Address,
                    postcode: property.Postcode,
                    certificate: result.certificateNumber || 'N/A',
                    rating: result.rating || 'N/A',
                    floorArea: result.floorArea || 'N/A',
                    status: result.expired ? 'EXPIRED' : 'VALID',
                    success: true
                });
                console.log(`✅ Certificate: ${result.certificateNumber || 'N/A'}`);
                console.log(`   Rating: ${result.rating || 'N/A'}, Floor Area: ${result.floorArea || 'N/A'} sqm`);
            } else {
                results.push({
                    address: property.Address,
                    postcode: property.Postcode,
                    certificate: 'Not found',
                    success: false
                });
                console.log('❌ No certificate found');
            }
            
        } catch (error) {
            results.push({
                address: property.Address,
                postcode: property.Postcode,
                error: error.message,
                success: false
            });
            console.log(`❌ Error: ${error.message}`);
        }
    }
    
    // Summary
    console.log('\n' + '═'.repeat(80));
    console.log('SUMMARY');
    console.log('═'.repeat(80));
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Success: ${successCount}/5 (${(successCount/5*100).toFixed(0)}%)`);
    console.log(`❌ Failed: ${5 - successCount}/5`);
    
    // Detailed results
    console.log('\nDETAILED RESULTS:');
    results.forEach((r, idx) => {
        console.log(`\n${idx + 1}. ${r.address}`);
        console.log(`   Postcode: ${r.postcode}`);
        if (r.success) {
            console.log(`   ✅ Certificate: ${r.certificate}`);
            console.log(`   Rating: ${r.rating}, Floor Area: ${r.floorArea} sqm, Status: ${r.status}`);
        } else {
            console.log(`   ❌ ${r.error || r.certificate}`);
        }
    });
    
    console.log('\n' + '═'.repeat(80));
}

testSample().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
