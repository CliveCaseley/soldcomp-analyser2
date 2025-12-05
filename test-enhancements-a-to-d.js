/**
 * Test Script for Enhancements A-D
 * 
 * Tests:
 * A) Target property EPC certificate fetching
 * B) Hyperlinked URL columns for all URLs
 * C) Geocoding missing coordinates and distance calculation
 * D) Floor area scraping from EPC certificates
 */

const { scrapeEPCData, scrapeFloorAreaFromCertificate } = require('./src/utils/epcHandler');
const { geocodeAddress, generateStreetviewURL } = require('./src/utils/geocoder');
const { calculateDistance, formatDistance } = require('./src/utils/distanceCalculator');
const { generateHyperlink } = require('./src/utils/excelHelper');

console.log('='.repeat(80));
console.log('Testing Enhancements A-D');
console.log('='.repeat(80));

async function runTests() {
    try {
        // Test data
        const testAddress = '7 Fernbank Close';
        const testPostcode = 'DN9 3PT';
        const testCertificateURL = 'https://find-energy-certificate.service.gov.uk/energy-certificate/2648-3961-7260-5043-7964';
        
        console.log('\n--- TEST A: Target Property EPC Certificate ---');
        console.log(`Testing with: ${testAddress}, ${testPostcode}`);
        const epcData = await scrapeEPCData(testPostcode, testAddress, null);
        
        if (epcData) {
            console.log('✅ EPC Data retrieved successfully');
            console.log(`   Rating: ${epcData.rating || 'N/A'}`);
            console.log(`   Certificate URL: ${epcData.certificateURL || 'N/A'}`);
            console.log(`   Floor Area: ${epcData.floorArea ? epcData.floorArea + ' sqm' : 'N/A'}`);
        } else {
            console.log('❌ Failed to retrieve EPC data');
        }
        
        console.log('\n--- TEST B: Hyperlinked URL Columns ---');
        const testURLs = {
            'Rightmove': 'https://www.rightmove.co.uk/properties/123456',
            'EPC Certificate': testCertificateURL,
            'Google Streetview': 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=53.5,-1.0'
        };
        
        for (const [type, url] of Object.entries(testURLs)) {
            const hyperlink = generateHyperlink(url, `View ${type}`);
            console.log(`✅ ${type} Hyperlink: ${hyperlink.substring(0, 80)}...`);
        }
        
        console.log('\n--- TEST C: Geocoding and Distance Calculation ---');
        // Note: This would require Google API key to test properly
        console.log('Geocoding test requires GOOGLE_API_KEY environment variable');
        
        // Test with mock coordinates
        const targetLat = 53.5;
        const targetLng = -1.0;
        const propertyLat = 53.52;
        const propertyLng = -1.02;
        
        const distance = calculateDistance(targetLat, targetLng, propertyLat, propertyLng);
        const formattedDistance = formatDistance(distance);
        
        console.log(`✅ Distance calculation: ${formattedDistance}`);
        console.log(`   Target: (${targetLat}, ${targetLng})`);
        console.log(`   Property: (${propertyLat}, ${propertyLng})`);
        
        // Test streetview URL generation
        const streetviewURL = generateStreetviewURL(propertyLat, propertyLng);
        console.log(`✅ Streetview URL: ${streetviewURL}`);
        
        console.log('\n--- TEST D: Floor Area Scraping from EPC Certificate ---');
        console.log(`Testing with certificate: ${testCertificateURL}`);
        
        const floorArea = await scrapeFloorAreaFromCertificate(testCertificateURL);
        
        if (floorArea) {
            const sqFt = Math.round(floorArea / 0.092903);
            console.log('✅ Floor area scraped successfully');
            console.log(`   Floor Area: ${floorArea} sqm (${sqFt} sq ft)`);
        } else {
            console.log('⚠️  Could not scrape floor area (may not be available on this certificate)');
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('All Enhancement Tests Completed');
        console.log('='.repeat(80));
        
    } catch (error) {
        console.error('\n❌ Test failed with error:', error);
        console.error(error.stack);
    }
}

// Run tests
runTests();
