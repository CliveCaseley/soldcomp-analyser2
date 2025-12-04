/**
 * Debug script to examine the street-view page HTML
 */

const axios = require('axios');
const cheerio = require('cheerio');

async function debugStreetView() {
    const transactionId = '36A61A95-0328-DEF2-E063-4704A8C046AE';
    const streetViewUrl = `https://propertydata.co.uk/transaction-street-view/%7B${transactionId}%7D`;
    
    console.log(`Fetching: ${streetViewUrl}\n`);
    
    try {
        const response = await axios.get(streetViewUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-GB,en;q=0.9'
            },
            timeout: 30000
        });
        
        console.log(`Status: ${response.status}`);
        console.log(`Content-Type: ${response.headers['content-type']}\n`);
        
        const $ = cheerio.load(response.data);
        
        // Find all images
        console.log('=== ALL IMAGES ON PAGE ===');
        const images = $('img');
        console.log(`Total images found: ${images.length}\n`);
        
        images.each((i, elem) => {
            const src = $(elem).attr('src');
            const dataSrc = $(elem).attr('data-src');
            const alt = $(elem).attr('alt');
            const className = $(elem).attr('class');
            const id = $(elem).attr('id');
            
            console.log(`Image ${i + 1}:`);
            console.log(`  src: ${src || 'N/A'}`);
            console.log(`  data-src: ${dataSrc || 'N/A'}`);
            console.log(`  alt: ${alt || 'N/A'}`);
            console.log(`  class: ${className || 'N/A'}`);
            console.log(`  id: ${id || 'N/A'}`);
            console.log('');
        });
        
        // Check for common selectors
        console.log('\n=== CHECKING COMMON SELECTORS ===');
        const selectors = [
            'img.hero-image',
            '.hero-image img',
            '#hero-image',
            '.property-image img',
            '.street-view-image img',
            'img[class*="hero"]',
            'img[class*="property"]',
            '.main-image img',
            'main img'
        ];
        
        for (const selector of selectors) {
            const elem = $(selector).first();
            if (elem.length > 0) {
                console.log(`✓ Found: ${selector}`);
                console.log(`  src: ${elem.attr('src')}`);
            }
        }
        
        // Save HTML for manual inspection
        const fs = require('fs');
        fs.writeFileSync('/home/ubuntu/soldcomp-analyser2-fixed/streetview-debug.html', response.data);
        console.log('\n✓ Saved HTML to streetview-debug.html');
        
    } catch (error) {
        console.error('ERROR:', error.message);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${error.response.data.substring(0, 500)}`);
        }
    }
}

debugStreetView();
