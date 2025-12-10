const { scrapeCertificateData } = require('./src/utils/epcHandler');

async function verify() {
    console.log('Checking certificates for 317 Wharf Road...\n');
    
    const certs = [
        { num: '2068-4069-6258-6561-6084', desc: '317, Wharf Road, Ealand' },
        { num: '0310-2606-8090-2399-6161', desc: 'Spen Lea, 317 Wharf Road' }
    ];
    
    for (const cert of certs) {
        console.log(`Certificate: ${cert.num}`);
        console.log(`Description: ${cert.desc}`);
        const url = `https://find-energy-certificate.service.gov.uk/energy-certificate/${cert.num}`;
        const data = await scrapeCertificateData(url);
        console.log(`Address: ${data.address}`);
        console.log(`Rating: ${data.rating}`);
        console.log(`Floor Area: ${data.floorArea} sqm`);
        console.log('');
    }
}

verify();
