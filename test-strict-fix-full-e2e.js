/**
 * END-TO-END TEST: STRICT HOUSE NUMBER MATCHING
 * 
 * This test uses the actual hybrid API+scraping workflow to verify that
 * properties at different house numbers do NOT get matched with wrong certificates.
 */

require('dotenv').config();
const epcHandler = require('./src/utils/epcHandler.js');

console.log('═'.repeat(80));
console.log('🧪 END-TO-END TEST: STRICT HOUSE NUMBER MATCHING');
console.log('═'.repeat(80));
console.log('');

// Verify API credentials
if (!process.env.EPC_API_KEY || !process.env.EPC_EMAIL) {
    console.error('❌ ERROR: Missing EPC_API_KEY or EPC_EMAIL in .env file');
    console.error('   Please ensure .env file exists with credentials');
    process.exit(1);
}

console.log('✅ API credentials loaded');
console.log('');

// Test cases from the problematic output (71).csv
const testCases = [
    {
        name: 'Case 1: 9 Westbourne Drive should NOT get cert for #1',
        address: '9, Westbourne Drive, Crowle, Scunthorpe DN17 4HX',
        postcode: 'DN17 4HX',
        wrongCert: '2146-0611-9115-6411-7162', // This is for #1, not #9
        expectedHouseNum: '9'
    },
    {
        name: 'Case 2: 13 Westbourne Drive should NOT get cert for #1',
        address: '13, Westbourne Drive, Crowle, Scunthorpe DN17 4HX',
        postcode: 'DN17 4HX',
        wrongCert: '2146-0611-9115-6411-7162', // This is for #1, not #13
        expectedHouseNum: '13'
    },
    {
        name: 'Case 3: 10b King Edward Street should NOT get cert for #1',
        address: '10b, King Edward Street, Belton, Doncaster DN9 1QN',
        postcode: 'DN9 1QN',
        wrongCert: '0955-2866-7078-9998-2061', // This is for #1, not #10b
        expectedHouseNum: '10'
    }
];

(async () => {
    for (const testCase of testCases) {
        console.log('─'.repeat(80));
        console.log(testCase.name);
        console.log('─'.repeat(80));
        console.log(`Address: ${testCase.address}`);
        console.log(`Postcode: ${testCase.postcode}`);
        console.log(`Wrong Cert (for #1): ${testCase.wrongCert}`);
        console.log('');
        
        try {
            const result = await epcHandler.getCertificateNumber(
                testCase.postcode,
                testCase.address,
                process.env.EPC_API_KEY
            );
            
            console.log('');
            if (!result) {
                console.log('✅ CORRECT: No certificate matched (strict filtering worked)');
                console.log(`   Property at #${testCase.expectedHouseNum} did NOT get cert for #1`);
            } else if (result.certificateNumber === testCase.wrongCert) {
                console.log('❌ FAILED: Got the WRONG certificate!');
                console.log(`   Property at #${testCase.expectedHouseNum} got cert for #1`);
                console.log(`   Certificate: ${result.certificateNumber}`);
                console.log(`   Rating: ${result.rating}`);
            } else {
                console.log('✅ CORRECT: Got a DIFFERENT certificate (not the one for #1)');
                console.log(`   Certificate: ${result.certificateNumber}`);
                console.log(`   Rating: ${result.rating}`);
                console.log(`   This might be correct if there's actually a cert for #${testCase.expectedHouseNum}`);
            }
            
        } catch (error) {
            console.error('❌ ERROR:', error.message);
        }
        
        console.log('');
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('═'.repeat(80));
    console.log('🏁 END-TO-END TEST COMPLETE');
    console.log('═'.repeat(80));
    console.log('');
    console.log('EXPECTED RESULTS:');
    console.log('- Properties at #9, #13, #10b should either:');
    console.log('  a) Get NO certificate (if none exists for their house number)');
    console.log('  b) Get a DIFFERENT certificate (if one exists for their house number)');
    console.log('  c) Should NEVER get certificate 2146-0611-9115-6411-7162 or 0955-2866-7078-9998-2061');
    console.log('');
})();
