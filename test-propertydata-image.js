/**
 * Test script for PropertyData scraper with street-view image extraction
 */

const { scrapePropertyData } = require('./src/scrapers/propertyDataScraper');

async function testPropertyDataScraper() {
    console.log('Testing PropertyData scraper with street-view image extraction...\n');
    
    // Test URL provided in the task
    const testUrl = 'https://propertydata.co.uk/transaction/36A61A95-0328-DEF2-E063-4704A8C046AE';
    
    console.log(`Scraping: ${testUrl}\n`);
    
    try {
        const result = await scrapePropertyData(testUrl);
        
        console.log('=== SCRAPING RESULTS ===');
        console.log(JSON.stringify(result, null, 2));
        console.log('\n=== KEY FIELDS ===');
        console.log(`Address: ${result.Address || 'NOT FOUND'}`);
        console.log(`Postcode: ${result.Postcode || 'NOT FOUND'}`);
        console.log(`Price: ${result.Price || 'NOT FOUND'}`);
        console.log(`Date of sale: ${result['Date of sale'] || 'NOT FOUND'}`);
        console.log(`Type: ${result.Type || 'NOT FOUND'}`);
        console.log(`Image URL: ${result.Image_URL || 'NOT FOUND'}`);
        
        if (result.Image_URL) {
            console.log('\n✅ SUCCESS: Hero image extracted from street-view page!');
        } else {
            console.log('\n⚠️  WARNING: No image URL found');
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testPropertyDataScraper();
