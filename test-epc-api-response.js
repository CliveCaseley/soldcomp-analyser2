/**
 * Test EPC API to see what fields are returned
 * This will help us understand if certificate-number is available
 */

const axios = require('axios');

const EPC_API_KEY = 'b0cd6d579fff23a5af1129e9ebc86cc4657c265b';
const EPC_EMAIL = 'clive.caseley@btinternet.com';

async function testEPCAPI() {
    console.log('═'.repeat(80));
    console.log('🔬 TESTING EPC API RESPONSE FIELDS');
    console.log('═'.repeat(80));
    console.log('');
    
    // Test postcode: DN17 4JD (known to have certificates)
    const testPostcode = 'DN174JD';
    
    try {
        const apiBaseURL = 'https://epc.opendatacommunities.org/api/v1/domestic/search';
        const auth = Buffer.from(`${EPC_EMAIL}:${EPC_API_KEY}`).toString('base64');
        
        console.log(`📮 Test Postcode: ${testPostcode}`);
        console.log(`🔑 API Key: ${EPC_API_KEY.substring(0, 10)}...`);
        console.log(`📧 Email: ${EPC_EMAIL}`);
        console.log('');
        
        const params = {
            postcode: testPostcode,
            size: 5 // Just get a few results for testing
        };
        
        console.log('🌐 Making API request...');
        console.log(`   URL: ${apiBaseURL}`);
        console.log(`   Params: ${JSON.stringify(params)}`);
        console.log('');
        
        const response = await axios.get(apiBaseURL, {
            params,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        
        console.log('✅ API REQUEST SUCCESSFUL');
        console.log('');
        console.log('📊 Response status:', response.status);
        console.log('📦 Number of results:', response.data.rows ? response.data.rows.length : 0);
        console.log('');
        
        if (response.data.rows && response.data.rows.length > 0) {
            const firstResult = response.data.rows[0];
            
            console.log('🔍 FIRST RESULT FIELDS:');
            console.log('═'.repeat(80));
            
            // List all available fields
            const fields = Object.keys(firstResult);
            console.log(`\n📝 Total fields: ${fields.length}\n`);
            
            fields.forEach((field, index) => {
                const value = firstResult[field];
                const preview = typeof value === 'string' && value.length > 50 
                    ? value.substring(0, 50) + '...' 
                    : value;
                console.log(`${(index + 1).toString().padStart(3, ' ')}. ${field.padEnd(40, ' ')} = ${preview}`);
            });
            
            console.log('');
            console.log('═'.repeat(80));
            console.log('🎯 KEY FIELDS TO CHECK:');
            console.log('═'.repeat(80));
            console.log('');
            
            // Check specific important fields
            console.log(`✓ lmk-key:                  ${firstResult['lmk-key'] || 'MISSING'}`);
            console.log(`✓ certificate-number:       ${firstResult['certificate-number'] || '❌ MISSING'}`);
            console.log(`✓ address1:                 ${firstResult['address1'] || 'MISSING'}`);
            console.log(`✓ address2:                 ${firstResult['address2'] || ''}`);
            console.log(`✓ address3:                 ${firstResult['address3'] || ''}`);
            console.log(`✓ postcode:                 ${firstResult['postcode'] || 'MISSING'}`);
            console.log(`✓ current-energy-rating:    ${firstResult['current-energy-rating'] || 'MISSING'}`);
            console.log(`✓ total-floor-area:         ${firstResult['total-floor-area'] || 'MISSING'}`);
            console.log(`✓ property-type:            ${firstResult['property-type'] || 'MISSING'}`);
            console.log('');
            
            // Check if certificate-number is available
            if (firstResult['certificate-number']) {
                console.log('✅ GOOD NEWS: certificate-number field IS AVAILABLE in API response!');
                console.log(`   Certificate number: ${firstResult['certificate-number']}`);
                console.log(`   Can construct URL: https://find-energy-certificate.service.gov.uk/energy-certificate/${firstResult['certificate-number']}`);
            } else {
                console.log('❌ BAD NEWS: certificate-number field is MISSING from API response');
                console.log('   This explains why they switched to web scraping');
                console.log('   We need to use lmk-key or scraping approach');
            }
            
            console.log('');
            console.log('═'.repeat(80));
            console.log('📋 FULL FIRST RESULT (JSON):');
            console.log('═'.repeat(80));
            console.log(JSON.stringify(firstResult, null, 2));
            
        } else {
            console.log('⚠️ No results returned from API');
        }
        
    } catch (error) {
        console.error('❌ API REQUEST FAILED');
        console.error('');
        console.error('Error details:');
        console.error(`  Message: ${error.message}`);
        if (error.response) {
            console.error(`  Status: ${error.response.status}`);
            console.error(`  Status Text: ${error.response.statusText}`);
            console.error(`  Data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
    
    console.log('');
    console.log('═'.repeat(80));
}

testEPCAPI();
