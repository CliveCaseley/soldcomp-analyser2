const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Debug script to analyze SVG structure in EPC certificates
 * Tests with a real certificate that shows "45 E" rating
 */
async function debugSVGRating() {
    // Test with a real EPC certificate
    const testURL = 'https://find-energy-certificate.service.gov.uk/energy-certificate/0310-2606-8090-2399-6161';
    
    console.log(`\n=== Analyzing EPC Certificate ===`);
    console.log(`URL: ${testURL}\n`);
    
    try {
        const response = await axios.get(testURL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        console.log('--- All SVG text elements ---');
        $('svg text').each((i, elem) => {
            const text = $(elem).text().trim();
            const parent = $(elem).parent().prop('tagName');
            const parentClass = $(elem).parent().attr('class') || 'none';
            console.log(`[${i}] "${text}" (parent: ${parent}, class: ${parentClass})`);
        });
        
        console.log('\n--- SVG text elements with A-G letters ---');
        $('svg text').each((i, elem) => {
            const text = $(elem).text().trim().toUpperCase();
            if (/[A-G]/.test(text)) {
                console.log(`[${i}] "${text}"`);
            }
        });
        
        console.log('\n--- Looking for score + letter pattern (e.g., "45 E") ---');
        $('svg text').each((i, elem) => {
            const text = $(elem).text().trim();
            // Look for number + letter pattern
            if (/\d+\s*[A-G]/i.test(text)) {
                console.log(`✓ FOUND RATING: "${text}"`);
            }
        });
        
        console.log('\n--- Elements with class containing "rating" ---');
        $('[class*="rating"], [class*="band"], [class*="score"]').each((i, elem) => {
            const tagName = elem.tagName;
            const className = $(elem).attr('class');
            const text = $(elem).text().trim();
            console.log(`<${tagName} class="${className}">${text}</${tagName}>`);
        });
        
        console.log('\n--- dt/dd pairs ---');
        $('dt').each((i, elem) => {
            const label = $(elem).text().trim();
            const value = $(elem).next('dd').text().trim();
            if (label.toLowerCase().includes('rating') || label.toLowerCase().includes('energy')) {
                console.log(`${label}: ${value}`);
            }
        });
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugSVGRating();
