/**
 * Test script for Rightmove scraper
 */

const { scrapeRightmoveListing } = require('./src/scrapers/rightmoveScraper');

const testUrl = 'https://www.rightmove.co.uk/house-prices/details/6171d97f-7b34-4a58-b40b-96117e11e797';

console.log('Testing Rightmove scraper...');
console.log('URL:', testUrl);
console.log('---');

scrapeRightmoveListing(testUrl)
    .then(data => {
        console.log('Scraped data:');
        console.log(JSON.stringify(data, null, 2));
        console.log('---');
        
        // Validation
        const requiredFields = ['Address', 'Date of sale', 'Price', 'Type', 'Bedrooms'];
        const missingFields = requiredFields.filter(field => !data[field]);
        
        if (missingFields.length > 0) {
            console.log('⚠️  Missing fields:', missingFields.join(', '));
        } else {
            console.log('✅ All required fields extracted successfully');
        }
        
        if (data.Bathrooms) {
            console.log('✅ Bathrooms extracted:', data.Bathrooms);
        } else {
            console.log('⚠️  Bathrooms not found (optional)');
        }
    })
    .catch(err => {
        console.error('❌ Test failed:', err);
        process.exit(1);
    });
