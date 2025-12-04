const { scrapePropertyData } = require('./src/scrapers/propertyDataScraper');
const { scrapeRightmoveListing } = require('./src/scrapers/rightmoveScraper');

async function testHeroImages() {
    console.log('=== Testing Hero Image Extraction ===\n');
    
    // Test PropertyData
    console.log('1. Testing PropertyData...');
    const propertyDataUrl = 'https://propertydata.co.uk/transaction/36A61A95-0328-DEF2-E063-4704A8C046AE';
    const propertyDataResult = await scrapePropertyData(propertyDataUrl);
    console.log('PropertyData Image URL:', propertyDataResult.Image_URL);
    console.log('PropertyData Address:', propertyDataResult.Address);
    console.log('');
    
    // Test Rightmove
    console.log('2. Testing Rightmove...');
    const rightmoveUrl = 'https://www.rightmove.co.uk/house-prices/details/29635c41-4639-4208-9735-39d2a8ece8d1';
    const rightmoveResult = await scrapeRightmoveListing(rightmoveUrl);
    console.log('Rightmove Image URL:', rightmoveResult.Image_URL);
    console.log('Rightmove Address:', rightmoveResult.Address);
    console.log('');
    
    console.log('=== Test Complete ===');
}

testHeroImages().catch(console.error);
