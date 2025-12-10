/**
 * Quick test of a single property with corrected authentication
 */

require('dotenv').config();

const { getCertificateNumber } = require('./src/utils/epcHandler');

async function testSingleProperty() {
    console.log('═'.repeat(80));
    console.log('SINGLE PROPERTY AUTHENTICATION TEST');
    console.log('═'.repeat(80));
    
    // Verify credentials are loaded
    console.log('\n🔐 Credentials Check:');
    console.log(`Email: ${process.env.EPC_EMAIL || 'NOT SET'}`);
    console.log(`API Key: ${process.env.EPC_API_KEY ? process.env.EPC_API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);
    
    // Test property from data (5).csv
    const testProperty = {
        postcode: 'HU6 8NS',
        address: '92a, The Quadrant, HULL'
    };
    
    console.log('\n📍 Test Property:');
    console.log(`Address: ${testProperty.address}`);
    console.log(`Postcode: ${testProperty.postcode}`);
    console.log('');
    
    try {
        const result = await getCertificateNumber(
            testProperty.postcode,
            testProperty.address
        );
        
        if (result) {
            console.log('\n✅ SUCCESS! Certificate found:');
            console.log(`Certificate: ${result.certificateNumber || 'N/A'}`);
            console.log(`Rating: ${result.rating || 'N/A'}`);
            console.log(`Floor Area: ${result.floorArea || 'N/A'} sqm`);
            console.log(`URL: ${result.certificateURL || 'N/A'}`);
            console.log(`Status: ${result.expired ? '🔴 EXPIRED' : '✅ Valid'}`);
        } else {
            console.log('\n❌ No certificate found');
        }
        
    } catch (error) {
        console.log('\n❌ ERROR:', error.message);
        if (error.response) {
            console.log(`Status: ${error.response.status}`);
            console.log(`Status Text: ${error.response.statusText}`);
        }
        console.error(error.stack);
    }
    
    console.log('\n' + '═'.repeat(80));
}

testSingleProperty().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
