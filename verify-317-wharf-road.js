const { getCertificateNumber, scrapeCertificateData } = require('./src/utils/epcHandler');

async function verify317() {
    console.log('Verifying 317 Wharf Road certificates...\n');
    
    // Check both certificate URLs
    const certs = [
        { 
            id: '2068-4069-6258-6561-6084', 
            desc: 'Certificate 1 (selected by algorithm)'
        },
        { 
            id: '0310-2606-8090-2399-6161', 
            desc: 'Certificate 2 (expected)'
        }
    ];
    
    for (const cert of certs) {
        console.log('═'.repeat(80));
        console.log(cert.desc);
        console.log(`Certificate: ${cert.id}`);
        console.log('═'.repeat(80));
        
        const url = `https://find-energy-certificate.service.gov.uk/energy-certificate/${cert.id}`;
        const data = await scrapeCertificateData(url);
        
        console.log(`Address: ${data.address}`);
        console.log(`Rating: ${data.rating}`);
        console.log(`Floor Area: ${data.floorArea} sqm`);
        console.log('');
    }
}

verify317().catch(console.error);
