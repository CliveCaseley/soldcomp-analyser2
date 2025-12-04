# Changelog

## [2.2.0] - 2025-12-04

### Fixed

#### Fix 1: Empty Row Filtering
- **File**: `src/utils/kvsHandler.js`
- **Issue**: CSV outputs contained empty rows with null/NaN values
- **Solution**: Added `isEmptyRow()` function to filter out rows where all critical fields are empty
- **Impact**: Cleaner CSV outputs, improved data quality

#### Fix 2: Google Streetview Dual Columns
- **Files**: `src/utils/csvParser.js`, `src/main.js`
- **Issue**: Google Streetview URL column was being overwritten with Excel HYPERLINK formulas
- **Solution**: 
  - Added new `'Google Streetview Link'` column to header schema
  - Preserved plain URL in `'Google Streetview URL'` column
  - Added HYPERLINK formula in separate `'Google Streetview Link'` column
- **Impact**: Maintains data integrity while providing user-friendly clickable links

#### Fix 3: PropertyData Hero Image Extraction
- **File**: `src/scrapers/propertyDataScraper.js`
- **Issue**: Hero images not being extracted from PropertyData transaction pages
- **Solution**:
  - Extracts transaction ID from URL
  - Constructs direct image URL: `https://i.ytimg.com/vi/4jDlTypfWgs/maxresdefault.jpg`
  - Uses HEAD request to verify image availability
  - Validates Content-Type header before setting Image_URL
- **Impact**: PropertyData listings now include hero images

#### Fix 4: Deprecated Apify Rightmove Scraper
- **Files**: `src/scrapers/rightmoveApifyScraper.js`, `test-rightmove.js`
- **Issue**: Apify sub-actor for Rightmove scraping was outdated and unreliable
- **Solution**:
  - Deprecated all Apify sub-actor functions
  - Added deprecation warnings
  - Created test script for validation
- **Impact**: Prepares codebase for direct Cheerio scraper implementation

#### Fix 5: Rightmove Hero Image Extraction
- **File**: `src/scrapers/rightmoveScraper.js`
- **Issue**: Hero images not being extracted correctly from Rightmove listings
- **Solution**:
  - Added image filtering logic to skip map images
  - Filters out URLs containing 'map/_generate' or 'property-marker'
  - Selects first valid property image
- **Impact**: Rightmove listings now include correct hero images

#### Fix 6: General Improvements
- Added test scripts for validation (`test-rightmove.js`, `test-propertydata-image.js`, `debug-streetview.js`)
- Enhanced error handling and logging
- Improved documentation with FIX_SUMMARY.md
- Added comprehensive deployment instructions

### Testing
- ✅ Empty row filtering validated
- ✅ Dual Google Streetview columns verified
- ✅ PropertyData image extraction working
- ✅ Rightmove image extraction working
- ✅ All test scripts passing

### Documentation
- Added DEPLOYMENT_INSTRUCTIONS.md
- Created FIX_SUMMARY.md
- Updated PUSH_SUMMARY.md
- Added test and debug scripts

---

## [2.1.0] - Previous Release
- Initial implementation of core features
- Basic scraping functionality
- CSV output generation
