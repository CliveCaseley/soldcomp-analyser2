# Soldcomp-Analyser2 Apify Actor

**Version:** 2.0.0  
**Author:** Clive Caseley

## Overview

Soldcomp-Analyser2 is an Apify actor that processes property sales data from multiple sources, enriches it with external data, and produces a ranked list of comparable properties relative to a designated target property.

## Features

✅ **Flexible CSV parsing** with automatic header detection and fuzzy matching  
✅ **Robust target detection** using fuzzy matching for "target" variations  
✅ **Multi-source data scraping** (Rightmove, PropertyData)  
✅ **Conservative scraping strategy** with rate limiting to avoid anti-bot detection  
✅ **Google Geocoding integration** for accurate distance calculation  
✅ **Haversine distance calculation** with formatted output ("0.1mi")  
✅ **EPC data enrichment** with postcode search fallback  
✅ **Weighted ranking algorithm** (40% floor area, 30% proximity, 20% bedrooms, 10% recency)  
✅ **Intelligent duplicate detection** and merging  
✅ **Excel-friendly output** with HYPERLINK formulas  
✅ **Iterative processing** support with data persistence  
✅ **Comprehensive logging** and error handling

## Prerequisites

- Apify account
- Google Cloud Platform account with Geocoding API enabled
- API keys:
  - `GOOGLE_API_KEY` (required for distance calculation and streetview)
  - `EPC_API_KEY` (optional, for future EPC API integration)

## Installation

### 1. Clone or Upload to Apify

You can either:
- Clone this repository and push to Apify
- Upload the folder directly to Apify platform

### 2. Set Environment Variables

In your Apify actor settings, configure the following environment variables:

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `GOOGLE_API_KEY` | Yes | Google Geocoding API key | - |
| `EPC_API_KEY` | No | EPC API key (future use) | - |
| `KV_STORE_NAME` | No | Apify Key-Value Store name | `clive.caseley/soldcomp-analyser-kvs` |
| `DATA_KEY` | No | Input CSV filename | `data.csv` |
| `OUTPUT_KEY` | No | Output CSV filename | `output.csv` |

### 3. Prepare Key-Value Store

1. Create an Apify Key-Value Store named `clive.caseley/soldcomp-analyser-kvs` (or your custom name)
2. Upload your input CSV as `data.csv`

## Input CSV Format

Your input CSV should contain property data with the following characteristics:

### Required: Target Property
- **Exactly ONE** property must be marked as "target" (case-insensitive, fuzzy matched)
- Target MUST have both **postcode** AND **address** (or actor will fail)
- Can be marked with variations: "TARGET", "Target:", "target is", "tgt", etc.

### Supported Data Types

1. **PropertyData listings** - Structured property data
2. **Rightmove postcode search URLs** - Returns multiple listings
3. **Individual Rightmove sold listing URLs** - Direct property links
4. **Individual Rightmove for-sale listing URLs**
5. **Manual entries** - Partial data with address/postcode

### Example Input Structure

```csv
Date of sale,Address,Postcode,Type,Price,Bedrooms,URL,isTarget
2023-05-15,123 Main Street,SW1A 1AA,Terraced,500000,3,,1
2023-06-20,456 Oak Avenue,SW1A 1AB,Detached,750000,4,,
https://www.rightmove.co.uk/properties/12345678,,,,,,,
https://propertydata.co.uk/property/78910,,,,,,,
```

## Output CSV Format

The actor generates a CSV with **19 columns**:

| Column | Description |
|--------|-------------|
| Date of sale | Transaction date (DD/MM/YYYY) |
| Address | Full property address (excluding postcode) |
| Postcode | UK postcode (normalized) |
| Type | Property type (Detached, Semi-detached, Terraced, Flat) |
| Tenure | Freehold/Leasehold |
| Age at sale | Property age in years |
| Price | Sale price (numeric) |
| Sq. ft | Floor area in square feet |
| Sqm | Floor area in square meters |
| £/sqft | Price per square foot |
| Bedrooms | Number of bedrooms |
| Distance | Distance from target (e.g., "0.1mi") |
| URL | Property listing URL (plain text) |
| Link | Excel HYPERLINK formula |
| Image_URL | Property image URL |
| EPC rating | Energy Performance Certificate rating (A-G) |
| Google Streetview URL | Google Streetview link |
| isTarget | 1 for target property, 0 otherwise |
| Ranking | Comparable property score (0-100) |
| needs_review | 1 if manual review needed (scraping failed, etc.) |

### Output Row Order

1. **Postcode search listings** (no ranking)
2. **EPC lookup URL row** (single row with postcode search link)
3. **Target property** (isTarget=1, no ranking)
4. **Ranked comparables** (sorted by ranking score, highest first)

## Ranking Algorithm

Properties are ranked using a weighted scoring system (0-100 scale):

| Criterion | Weight | Calculation |
|-----------|--------|-------------|
| **Floor area similarity** | 40% | 100 - (abs(property_sqft - target_sqft) / target_sqft × 100) |
| **Proximity** | 30% | 100 - (distance_miles / max_distance × 100) |
| **Bedrooms match** | 20% | 100 (exact), 50 (±1), 0 (otherwise) |
| **Recency of sale** | 10% | 100 - (days_since_sale / max_days × 100) |

**Missing data handling:** Properties with missing data receive 0 score for that criterion but are kept in results (for iterative refinement).

## Iterative Processing

The actor supports iterative runs to progressively enrich data:

1. **First run:** Input `data.csv` → Output `output.csv`
2. **Subsequent runs:** Rename `output.csv` to `data.csv` → Run again → New `output.csv`
3. **Duplicate handling:** Properties are merged based on address + postcode
4. **Target persistence:** Target property is maintained across iterations

## Error Handling

### Fatal Errors (Actor stops)
- No target property found
- Multiple target properties found
- Target missing postcode or address

### Non-Fatal Errors (Logged, flagged with needs_review=1)
- Scraping failures
- Geocoding failures
- Missing data in properties
- URL classification failures

## Local Development

### Setup

```bash
# Install dependencies
npm install

# Set environment variables
export GOOGLE_API_KEY=your_google_api_key
export KV_STORE_NAME=clive.caseley/soldcomp-analyser-kvs

# Run locally
npm start
```

### Testing

The actor includes comprehensive logging at each step:
- Target detection
- CSV parsing
- URL classification
- Scraping progress
- Geocoding results
- Ranking calculation

Monitor the console output for detailed progress and any issues.

## Deployment to Apify

### Option 1: Upload via Apify Console

1. Zip the entire project folder
2. Go to Apify Console → Actors → Create new actor
3. Upload the zip file
4. Configure environment variables
5. Build and run

### Option 2: Deploy via Apify CLI

```bash
# Install Apify CLI
npm install -g apify-cli

# Login to Apify
apify login

# Deploy actor
apify push
```

## Project Structure

```
soldcomp-analyser2/
├── .actor/
│   └── actor.json              # Actor configuration
├── src/
│   ├── main.js                 # Main orchestrator
│   ├── utils/
│   │   ├── csvParser.js        # CSV parsing with fuzzy header detection
│   │   ├── targetFinder.js     # Target property detection
│   │   ├── urlClassifier.js    # URL classification
│   │   ├── geocoder.js         # Google Geocoding integration
│   │   ├── distanceCalculator.js # Haversine distance calculation
│   │   ├── epcHandler.js       # EPC data enrichment
│   │   ├── rankingEngine.js    # Property ranking algorithm
│   │   ├── duplicateDetector.js # Duplicate detection and merging
│   │   ├── excelHelper.js      # Excel HYPERLINK generation
│   │   └── kvsHandler.js       # Apify KVS integration
│   └── scrapers/
│       ├── rightmoveScraper.js # Rightmove scraping (conservative)
│       └── propertyDataScraper.js # PropertyData scraping
├── test/
│   └── sample-data.csv         # Sample test data
├── package.json
├── Dockerfile
└── README.md
```

## Troubleshooting

### Actor fails with "No target property found"
- Ensure exactly one property has "target" indicator in any column
- Check for typos (use variations: "TARGET", "target:", etc.)
- Verify the target row has data

### Actor fails with "Target missing required fields"
- Target MUST have both Address and Postcode populated
- Check for empty cells in target row

### Distance calculation not working
- Verify `GOOGLE_API_KEY` is set correctly
- Check Google Cloud Console for API quota/billing
- Enable Geocoding API in Google Cloud Platform

### Scraping returns no data
- Check if URLs are valid and accessible
- Rightmove may have anti-bot measures (rate limiting is built-in)
- Review `needs_review` column for flagged properties

### Duplicate properties appearing
- The actor should automatically detect and merge duplicates
- Check Address and Postcode formatting consistency
- Duplicates are matched on normalized address + postcode

## API Rate Limits

The actor implements conservative rate limiting:
- **Rightmove:** 2.5 seconds between requests
- **PropertyData:** 2 seconds between requests
- **Google Geocoding:** Results are cached to minimize API calls

## Support and Maintenance

For issues or questions:
1. Check the actor logs in Apify Console
2. Review the specification document: `/home/ubuntu/SPEC_v02_UPDATED.md`
3. Contact: Clive Caseley

## Version History

- **v2.0.0** - Complete rewrite with modular architecture, enhanced scraping, ranking engine
- **v1.0.0** - Initial implementation

## License

MIT License

---

**Built with Apify SDK** - https://apify.com/