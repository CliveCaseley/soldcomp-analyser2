/**
 * Extended test for EPC v5.0 with real dataset properties
 */

const { getCertificateNumber } = require('./src/utils/epcHandler');

const TEST_PROPERTIES = [
    {
        name: "51a Outgate, Ealand, DN17 4JD",
        postcode: "DN17 4JD",
        address: "51a, Outgate, Ealand",
        notes: "User's test case #1"
    },
    {
        name: "317 Wharf Road (Spen Lea), DN17 4JW",
        postcode: "DN17 4JW",
        address: "317 Wharf Road, Ealand",
        notes: "User's test case #2 - This is 'Spen Lea' property"
    },
    {
        name: "307 Wharf Road, DN17 4JW",
        postcode: "DN17 4JW",
        address: "307, Wharf Road, Ealand",
        notes: "From dataset - has certificate 8065-7922-4589-4034-5906"
    },
    {
        name: "14 Brickyard Court, DN17 4FH",
        postcode: "DN17 4FH",
        address: "14, Brickyard Court, Ealand",
        notes: "From dataset"
    },
    {
        name: "22 Field Road, DN17 4HP",
        postcode: "DN17 4HP",
        address: "22, Field Road, Crowle",
        notes: "From dataset"
    },
    {
        name: "3 Willow Close, DN17 4FJ",
        postcode: "DN17 4FJ",
        address: "3, Willow Close, Ealand",
        notes: "From dataset"
    }
];

async function runExtendedTests() {
    console.log('═'.repeat(80));
    console.log('🧪 EPC V5.0 - EXTENDED TEST WITH DATASET PROPERTIES');
    console.log('═'.repeat(80));
    console.log('');
    
    let successCount = 0;
    let failureCount = 0;
    let nullCount = 0;
    
    for (let i = 0; i < TEST_PROPERTIES.length; i++) {
        const prop = TEST_PROPERTIES[i];
        console.log('─'.repeat(80));
        console.log(`TEST ${i + 1}/${TEST_PROPERTIES.length}: ${prop.name}`);
        console.log('─'.repeat(80));
        console.log(`Postcode: ${prop.postcode}`);
        console.log(`Address: ${prop.address}`);
        console.log(`Notes: ${prop.notes}`);
        console.log('');
        
        try {
            const result = await getCertificateNumber(prop.postcode, prop.address);
            
            console.log('');
            console.log('📋 RESULT:');
            
            if (result) {
                console.log(`   ✅ Certificate Found: ${result.certificateNumber}`);
                console.log(`   Rating: ${result.rating || 'N/A'}`);
                console.log(`   Floor Area: ${result.floorArea ? result.floorArea + ' sqm' : 'N/A'}`);
                console.log(`   Certificate Address: ${result.address || 'N/A'}`);
                console.log(`   Address Verified: ${result.addressVerified ? 'YES' : 'NO'}`);
                console.log(`   Certificate URL: ${result.certificateURL}`);
                successCount++;
            } else {
                console.log(`   ⚠️ No certificate found (NULL)`);
                nullCount++;
            }
            
        } catch (error) {
            console.log(`   ❌ ERROR: ${error.message}`);
            failureCount++;
        }
        
        console.log('');
        
        // Wait 2 seconds between requests
        if (i < TEST_PROPERTIES.length - 1) {
            console.log('⏳ Waiting 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('');
        }
    }
    
    console.log('═'.repeat(80));
    console.log('📊 EXTENDED TEST SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Total Properties Tested: ${TEST_PROPERTIES.length}`);
    console.log(`Certificates Found: ${successCount} ✅`);
    console.log(`No Certificate (NULL): ${nullCount} ⚠️`);
    console.log(`Errors: ${failureCount} ❌`);
    console.log(`Success Rate: ${((successCount / TEST_PROPERTIES.length) * 100).toFixed(1)}%`);
    console.log('═'.repeat(80));
}

runExtendedTests();
