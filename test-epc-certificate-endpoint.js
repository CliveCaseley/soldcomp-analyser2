/**
 * Test if we can get certificate-number from individual certificate API endpoint
 */

const axios = require('axios');

const EPC_API_KEY = 'b0cd6d579fff23a5af1129e9ebc86cc4657c265b';
const EPC_EMAIL = 'clive.caseley@btinternet.com';

async function testCertificateEndpoint() {
    console.log('═'.repeat(80));
    console.log('🔬 TESTING INDIVIDUAL CERTIFICATE API ENDPOINT');
    console.log('═'.repeat(80));
    console.log('');
    
    // Use the lmk-key from the previous test
    const lmkKey = '0c68e61f193e19280da6a98e54fa35e961bdfbc65119ad7178e9238aee4b9cf5';
    
    try {
        const apiURL = `https://epc.opendatacommunities.org/api/v1/domestic/certificate/${lmkKey}`;
        const auth = Buffer.from(`${EPC_EMAIL}:${EPC_API_KEY}`).toString('base64');
        
        console.log(`🔑 LMK Key: ${lmkKey}`);
        console.log(`🌐 API URL: ${apiURL}`);
        console.log('');
        
        console.log('🌐 Making API request...');
        const response = await axios.get(apiURL, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        
        console.log('✅ API REQUEST SUCCESSFUL');
        console.log('');
        console.log('📊 Response status:', response.status);
        console.log('');
        
        if (response.data && response.data.rows && response.data.rows.length > 0) {
            const cert = response.data.rows[0];
            
            console.log('🔍 CERTIFICATE FIELDS:');
            console.log('═'.repeat(80));
            
            const fields = Object.keys(cert);
            console.log(`\n📝 Total fields: ${fields.length}\n`);
            
            // Check for certificate-number specifically
            console.log('🎯 CRITICAL FIELD CHECK:');
            console.log('═'.repeat(80));
            console.log('');
            console.log(`✓ lmk-key:              ${cert['lmk-key'] || 'MISSING'}`);
            console.log(`✓ certificate-number:   ${cert['certificate-number'] || '❌ MISSING'}`);
            console.log(`✓ certificate-hash:     ${cert['certificate-hash'] || '❌ MISSING'}`);
            console.log(`✓ address1:             ${cert['address1'] || 'MISSING'}`);
            console.log(`✓ postcode:             ${cert['postcode'] || 'MISSING'}`);
            console.log(`✓ current-energy-rating: ${cert['current-energy-rating'] || 'MISSING'}`);
            console.log('');
            
            if (cert['certificate-number']) {
                console.log('✅ SUCCESS: certificate-number IS available from individual certificate endpoint!');
                console.log(`   Certificate number: ${cert['certificate-number']}`);
                console.log(`   URL: https://find-energy-certificate.service.gov.uk/energy-certificate/${cert['certificate-number']}`);
                console.log('');
                console.log('💡 SOLUTION: Use two-step API approach:');
                console.log('   1. Search by postcode to get lmk-keys');
                console.log('   2. Fetch individual certificates to get certificate-numbers');
            } else {
                console.log('❌ FAILED: certificate-number is STILL missing from individual certificate endpoint');
                console.log('   Must use web scraping approach');
            }
            
            console.log('');
            console.log('═'.repeat(80));
            console.log('📋 SAMPLE OF FIELDS (first 20):');
            console.log('═'.repeat(80));
            
            fields.slice(0, 20).forEach((field, index) => {
                const value = cert[field];
                const preview = typeof value === 'string' && value.length > 50 
                    ? value.substring(0, 50) + '...' 
                    : value;
                console.log(`${(index + 1).toString().padStart(3, ' ')}. ${field.padEnd(40, ' ')} = ${preview}`);
            });
            
        } else {
            console.log('⚠️ No certificate data returned');
        }
        
    } catch (error) {
        console.error('❌ API REQUEST FAILED');
        console.error('');
        console.error('Error details:');
        console.error(`  Message: ${error.message}`);
        if (error.response) {
            console.error(`  Status: ${error.response.status}`);
            console.error(`  Status Text: ${error.response.statusText}`);
        }
    }
    
    console.log('');
    console.log('═'.repeat(80));
}

testCertificateEndpoint();
