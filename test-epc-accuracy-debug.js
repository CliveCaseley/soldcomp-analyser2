const axios = require('axios');
const cheerio = require('cheerio');

// Test certificate scraping for the problematic certificate
async function testCertificateScraping() {
  const certificateNumber = '8065-7922-4589-4034-5906';
  const url = `https://find-energy-certificate.service.gov.uk/energy-certificate/${certificateNumber}`;
  
  console.log('\n=== Testing Certificate Scraping ===');
  console.log(`URL: ${url}\n`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    console.log('--- Method 1: SVG Text Detection ---');
    const svgRatings = [];
    $('svg text').each((i, el) => {
      const text = $(el).text().trim();
      if (/^[A-G]$/.test(text)) {
        svgRatings.push(text);
      }
    });
    console.log('SVG ratings found:', svgRatings);
    
    console.log('\n--- Method 2: dt/dd Pairs ---');
    $('dt').each((i, el) => {
      const label = $(el).text().trim().toLowerCase();
      if (label.includes('rating') || label.includes('current')) {
        const value = $(el).next('dd').text().trim();
        console.log(`${label}: ${value}`);
      }
    });
    
    console.log('\n--- Method 3: Headings with "rating" ---');
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
      const text = $(el).text().trim();
      if (text.toLowerCase().includes('rating')) {
        const nextText = $(el).next().text().trim();
        console.log(`Heading: "${text}" -> Next: "${nextText}"`);
      }
    });
    
    console.log('\n--- Method 4: Table Cells ---');
    $('table td, table th').each((i, el) => {
      const text = $(el).text().trim();
      if (/^[A-G]$/.test(text)) {
        console.log(`Table cell: ${text}`);
      }
    });
    
    console.log('\n--- Method 5: Looking for "Energy rating" text ---');
    const bodyText = $('body').text();
    const energyRatingMatch = bodyText.match(/Energy rating\s+([A-G])/i);
    if (energyRatingMatch) {
      console.log(`Found in body text: ${energyRatingMatch[1]}`);
    }
    
    console.log('\n--- Method 6: Current energy efficiency rating ---');
    const currentRatingMatch = bodyText.match(/Current energy efficiency rating\s+([A-G])/i);
    if (currentRatingMatch) {
      console.log(`Current rating: ${currentRatingMatch[1]}`);
    }
    
    console.log('\n--- Method 7: Checking specific divs with govuk-body class ---');
    $('.govuk-body').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length < 50 && /[A-G]/.test(text)) {
        console.log(`govuk-body: "${text}"`);
      }
    });
    
    console.log('\n--- Full HTML snippet with "rating" keyword ---');
    const htmlSnippet = response.data.toLowerCase();
    const ratingIndex = htmlSnippet.indexOf('energy rating');
    if (ratingIndex > -1) {
      const snippet = response.data.substring(ratingIndex, ratingIndex + 200);
      console.log(snippet);
    }
    
  } catch (error) {
    console.error('Error scraping certificate:', error.message);
  }
}

// Test postcode search to see what addresses are available for DN17 4JW
async function testPostcodeSearch() {
  const postcode = 'DN17 4JW';
  const url = `https://find-energy-certificate.service.gov.uk/find-a-certificate/search-by-postcode?postcode=${encodeURIComponent(postcode)}`;
  
  console.log('\n\n=== Testing Postcode Search ===');
  console.log(`URL: ${url}\n`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    const properties = [];
    $('.govuk-summary-list__row').each((i, row) => {
      const $row = $(row);
      const addressLink = $row.find('a').first();
      const address = addressLink.text().trim();
      const href = addressLink.attr('href');
      
      if (address && href) {
        const certificateNumber = href.split('/').pop();
        properties.push({ address, certificateNumber });
      }
    });
    
    console.log(`Found ${properties.length} properties:\n`);
    
    // Filter for Wharf Road properties
    const wharfRoadProps = properties.filter(p => 
      p.address.toLowerCase().includes('wharf road')
    );
    
    console.log('Wharf Road properties:');
    wharfRoadProps.forEach((prop, i) => {
      console.log(`${i + 1}. ${prop.address}`);
      console.log(`   Certificate: ${prop.certificateNumber}\n`);
    });
    
    // Check if 303, 307, or 317 are present
    console.log('\nChecking for specific addresses:');
    ['303', '307', '317', 'spen lea'].forEach(num => {
      const matches = properties.filter(p => 
        p.address.toLowerCase().includes(num.toLowerCase())
      );
      if (matches.length > 0) {
        console.log(`\n${num.toUpperCase()}:`);
        matches.forEach(m => {
          console.log(`  - ${m.address}`);
          console.log(`    Certificate: ${m.certificateNumber}`);
        });
      } else {
        console.log(`\n${num}: NOT FOUND`);
      }
    });
    
  } catch (error) {
    console.error('Error searching postcode:', error.message);
  }
}

// Run tests
(async () => {
  await testCertificateScraping();
  await testPostcodeSearch();
})();
