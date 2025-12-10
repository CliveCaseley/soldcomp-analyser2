/**
 * DEBUG TEST: EPC API Authentication
 * 
 * This script tests different authentication methods to find the correct one
 */

const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.EPC_API_KEY;
const EMAIL = process.env.EPC_EMAIL;
const TEST_POSTCODE = 'HU68NS'; // Test postcode

console.log('═'.repeat(80));
console.log('🔬 EPC API AUTHENTICATION DEBUG TEST');
console.log('═'.repeat(80));
console.log('Email:', EMAIL);
console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'NOT SET');
console.log('Test Postcode:', TEST_POSTCODE);
console.log('');

async function testMethod1_BasicAuthEmailApiKey() {
    console.log('═'.repeat(80));
    console.log('METHOD 1: Basic Auth with email:apikey');
    console.log('═'.repeat(80));
    
    try {
        const auth = Buffer.from(`${EMAIL}:${API_KEY}`).toString('base64');
        console.log('Auth String:', `${EMAIL}:${API_KEY.substring(0, 10)}...`);
        console.log('Base64 Token:', `${auth.substring(0, 20)}...`);
        
        const response = await axios.get('https://epc.opendatacommunities.org/api/v1/domestic/search', {
            params: { postcode: TEST_POSTCODE, size: 5 },
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            },
            timeout: 15000
        });
        
        console.log('✅ SUCCESS!');
        console.log('Status:', response.status);
        console.log('Results:', response.data?.rows?.length || 0, 'certificates');
        return true;
        
    } catch (error) {
        console.log('❌ FAILED');
        console.log('Error:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Status Text:', error.response.statusText);
            console.log('Response Headers:', JSON.stringify(error.response.headers, null, 2));
            console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}

async function testMethod2_ApiKeyInHeader() {
    console.log('');
    console.log('═'.repeat(80));
    console.log('METHOD 2: API Key in custom header');
    console.log('═'.repeat(80));
    
    try {
        const response = await axios.get('https://epc.opendatacommunities.org/api/v1/domestic/search', {
            params: { postcode: TEST_POSTCODE, size: 5 },
            headers: {
                'X-API-Key': API_KEY,
                'Accept': 'application/json'
            },
            timeout: 15000
        });
        
        console.log('✅ SUCCESS!');
        console.log('Status:', response.status);
        console.log('Results:', response.data?.rows?.length || 0, 'certificates');
        return true;
        
    } catch (error) {
        console.log('❌ FAILED');
        console.log('Error:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
        }
        return false;
    }
}

async function testMethod3_ApiKeyInQuery() {
    console.log('');
    console.log('═'.repeat(80));
    console.log('METHOD 3: API Key in query parameter');
    console.log('═'.repeat(80));
    
    try {
        const response = await axios.get('https://epc.opendatacommunities.org/api/v1/domestic/search', {
            params: { 
                postcode: TEST_POSTCODE, 
                size: 5,
                api_key: API_KEY
            },
            headers: {
                'Accept': 'application/json'
            },
            timeout: 15000
        });
        
        console.log('✅ SUCCESS!');
        console.log('Status:', response.status);
        console.log('Results:', response.data?.rows?.length || 0, 'certificates');
        return true;
        
    } catch (error) {
        console.log('❌ FAILED');
        console.log('Error:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
        }
        return false;
    }
}

async function testMethod4_BearerToken() {
    console.log('');
    console.log('═'.repeat(80));
    console.log('METHOD 4: Bearer token with API key');
    console.log('═'.repeat(80));
    
    try {
        const response = await axios.get('https://epc.opendatacommunities.org/api/v1/domestic/search', {
            params: { postcode: TEST_POSTCODE, size: 5 },
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json'
            },
            timeout: 15000
        });
        
        console.log('✅ SUCCESS!');
        console.log('Status:', response.status);
        console.log('Results:', response.data?.rows?.length || 0, 'certificates');
        return true;
        
    } catch (error) {
        console.log('❌ FAILED');
        console.log('Error:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
        }
        return false;
    }
}

async function testMethod5_BasicAuthApiKeyOnly() {
    console.log('');
    console.log('═'.repeat(80));
    console.log('METHOD 5: Basic Auth with apikey:empty');
    console.log('═'.repeat(80));
    
    try {
        const auth = Buffer.from(`${API_KEY}:`).toString('base64');
        
        const response = await axios.get('https://epc.opendatacommunities.org/api/v1/domestic/search', {
            params: { postcode: TEST_POSTCODE, size: 5 },
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            },
            timeout: 15000
        });
        
        console.log('✅ SUCCESS!');
        console.log('Status:', response.status);
        console.log('Results:', response.data?.rows?.length || 0, 'certificates');
        return true;
        
    } catch (error) {
        console.log('❌ FAILED');
        console.log('Error:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
        }
        return false;
    }
}

async function runAllTests() {
    const results = {
        method1: await testMethod1_BasicAuthEmailApiKey(),
        method2: await testMethod2_ApiKeyInHeader(),
        method3: await testMethod3_ApiKeyInQuery(),
        method4: await testMethod4_BearerToken(),
        method5: await testMethod5_BasicAuthApiKeyOnly()
    };
    
    console.log('');
    console.log('═'.repeat(80));
    console.log('SUMMARY');
    console.log('═'.repeat(80));
    console.log('Method 1 (Basic email:apikey):', results.method1 ? '✅ WORKS' : '❌ FAILED');
    console.log('Method 2 (X-API-Key header):', results.method2 ? '✅ WORKS' : '❌ FAILED');
    console.log('Method 3 (Query parameter):', results.method3 ? '✅ WORKS' : '❌ FAILED');
    console.log('Method 4 (Bearer token):', results.method4 ? '✅ WORKS' : '❌ FAILED');
    console.log('Method 5 (Basic apikey:empty):', results.method5 ? '✅ WORKS' : '❌ FAILED');
    console.log('═'.repeat(80));
}

runAllTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
