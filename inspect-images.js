const axios = require('axios');
const cheerio = require('cheerio');

async function inspectImages(url) {
    console.log(`\n=== Inspecting: ${url} ===\n`);
    
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        
        const $ = cheerio.load(response.data);
        
        // Find all images
        console.log('All <img> tags:');
        $('img').each((i, elem) => {
            const src = $(elem).attr('src');
            const alt = $(elem).attr('alt');
            const classAttr = $(elem).attr('class');
            if (src && i < 10) {
                console.log(`${i+1}. src: ${src.substring(0, 100)}...`);
                console.log(`   alt: ${alt || 'N/A'}`);
                console.log(`   class: ${classAttr || 'N/A'}\n`);
            }
        });
        
        // Check meta tags
        console.log('\nMeta tags:');
        console.log('og:image:', $('meta[property="og:image"]').attr('content'));
        console.log('twitter:image:', $('meta[name="twitter:image"]').attr('content'));
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function main() {
    await inspectImages('https://propertydata.co.uk/transaction/36A61A95-0328-DEF2-E063-4704A8C046AE');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await inspectImages('https://www.rightmove.co.uk/house-prices/details/29635c41-4639-4208-9735-39d2a8ece8d1');
}

main().catch(console.error);
