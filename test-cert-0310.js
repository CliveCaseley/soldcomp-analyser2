const axios = require('axios');
const cheerio = require('cheerio');

async function testCertificate() {
  const certificateNumber = '0310-2606-8090-2399-6161';
  const url = `https://find-energy-certificate.service.gov.uk/energy-certificate/${certificateNumber}`;
  
  console.log(`Testing certificate: ${certificateNumber}`);
  console.log(`URL: ${url}\n`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    console.log('Method 1: "energy rating is" pattern');
    const bodyText = $('body').text();
    const match1 = bodyText.match(/energy\s+rating\s+is\s+([A-G])\b/i);
    if (match1) {
      console.log(`  Found: ${match1[1]}`);
    }
    
    console.log('\nMethod 2: dt/dd pairs with "rating" label');
    let foundInDtDd = false;
    $('dt').each((i, elem) => {
      const label = $(elem).text().trim().toLowerCase();
      if (label.includes('rating')) {
        const value = $(elem).next('dd').text().trim();
        console.log(`  Label: "${label}"`);
        console.log(`  Value: "${value}"`);
        const match = value.match(/\b([A-G])\b/);
        if (match && !foundInDtDd) {
          console.log(`  -> Would extract: ${match[1]}`);
          foundInDtDd = true;
        }
      }
    });
    
    console.log('\nMethod 3: Check SVG desc');
    const svgDesc = $('desc').text();
    const svgMatch = svgDesc.match(/energy\s+rating\s+is\s+([A-G])\b/i);
    if (svgMatch) {
      console.log(`  Found in SVG desc: ${svgMatch[1]}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCertificate();
