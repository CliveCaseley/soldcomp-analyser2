# Push Instructions: Batch 3 (Rightmove URLs + Target Asking Price)

## Branch Information

**Branch Name**: `fix/batch-3-rm-urls-and-asking-price`

**Base Branch**: `master`

**Created**: December 5, 2025

---

## Changes Summary

### Features Implemented

1. **Extract Rightmove URLs from PropertyData Pages (Issue #4)**
   - PropertyData scraper now extracts Rightmove URLs when present
   - Stores URL_Rightmove and URL_PropertyData in separate columns
   - Excel hyperlinks generated for both URL types

2. **Extract Asking Price for Target Property (Issue #7)**
   - Detects live listings vs sold properties
   - Scrapes asking price from Rightmove and PropertyData live listings
   - Calculates £/sqft using asking price and floor area
   - Updates target property Price and £/sqft fields

### Files Modified

**Core Implementation:**
- `src/scrapers/propertyDataScraper.js` - Extract Rightmove URLs
- `src/scrapers/rightmoveScraper.js` - Store URL_Rightmove field
- `src/utils/excelHelper.js` - Add Rightmove/PropertyData hyperlink columns
- `src/main.js` - Add asking price extraction workflow

**New Files:**
- `src/utils/askingPriceScraper.js` - Asking price extraction module

**Testing:**
- `test-batch-3-rm-urls-asking-price.js` - Comprehensive test suite

**Documentation:**
- `BATCH_3_SUMMARY.md` - Technical documentation
- `BATCH_3_SUMMARY.pdf` - PDF version
- `PUSH_INSTRUCTIONS_BATCH_3.md` - This file

---

## Pre-Push Checklist

### 1. Verify Branch Status
```bash
cd /home/ubuntu/github_repos/soldcomp-analyser2
git status
git branch
```

**Expected Output:**
- Current branch: `fix/batch-3-rm-urls-and-asking-price`
- Modified files: 4 files
- New files: 5 files
- No merge conflicts

### 2. Run Tests
```bash
node test-batch-3-rm-urls-asking-price.js
```

**Expected Output:**
```
=== BATCH 3 TEST SUMMARY ===
✓ All Batch 3 features implemented and tested

Features:
  1. ✓ Extract Rightmove URLs from PropertyData pages
  2. ✓ Store separate URL columns (URL_Rightmove, URL_PropertyData)
  3. ✓ Generate Excel hyperlinks for new URL columns
  4. ✓ Detect live listings vs sold properties
  5. ✓ Extract asking price from live listings
  6. ✓ Calculate £/sqft from asking price and floor area
```

**Status**: All tests passed ✓

### 3. Verify Code Quality
```bash
# Check for syntax errors
node -c src/utils/askingPriceScraper.js
node -c src/scrapers/propertyDataScraper.js
node -c src/scrapers/rightmoveScraper.js
node -c src/utils/excelHelper.js
node -c src/main.js
```

**Expected Output:**
- No syntax errors
- All files valid JavaScript

---

## Git Workflow

### Step 1: Review Changes
```bash
git status
git diff
```

**Files Changed:**
1. `src/scrapers/propertyDataScraper.js` - Rightmove URL extraction
2. `src/scrapers/rightmoveScraper.js` - URL_Rightmove field
3. `src/utils/excelHelper.js` - New hyperlink columns
4. `src/main.js` - Asking price extraction workflow

**Files Added:**
1. `src/utils/askingPriceScraper.js` - New module
2. `test-batch-3-rm-urls-asking-price.js` - Test suite
3. `BATCH_3_SUMMARY.md` - Documentation
4. `BATCH_3_SUMMARY.pdf` - PDF documentation
5. `PUSH_INSTRUCTIONS_BATCH_3.md` - This file

### Step 2: Stage Changes
```bash
git add src/scrapers/propertyDataScraper.js
git add src/scrapers/rightmoveScraper.js
git add src/utils/excelHelper.js
git add src/main.js
git add src/utils/askingPriceScraper.js
git add test-batch-3-rm-urls-asking-price.js
git add BATCH_3_SUMMARY.md
git add BATCH_3_SUMMARY.pdf
git add PUSH_INSTRUCTIONS_BATCH_3.md
```

**Alternative (stage all):**
```bash
git add .
```

### Step 3: Commit Changes
```bash
git commit -m "Batch 3: Extract Rightmove URLs and target asking price

Features:
- Extract Rightmove URLs from PropertyData pages (Issue #4)
- Extract asking price for target property from live listings (Issue #7)
- Add URL_Rightmove and URL_PropertyData columns with hyperlinks
- Implement live listing detection (Rightmove + PropertyData)
- Calculate £/sqft from asking price and floor area

Files modified:
- src/scrapers/propertyDataScraper.js
- src/scrapers/rightmoveScraper.js
- src/utils/excelHelper.js
- src/main.js

New files:
- src/utils/askingPriceScraper.js
- test-batch-3-rm-urls-asking-price.js
- BATCH_3_SUMMARY.md
- BATCH_3_SUMMARY.pdf
- PUSH_INSTRUCTIONS_BATCH_3.md

Tests: All Batch 3 tests passing (100% pass rate)"
```

### Step 4: Push to Remote
```bash
git push origin fix/batch-3-rm-urls-and-asking-price
```

**Expected Output:**
```
Enumerating objects: X, done.
Counting objects: 100% (X/X), done.
Delta compression using up to Y threads
Compressing objects: 100% (X/X), done.
Writing objects: 100% (X/X), Z KiB | Z MiB/s, done.
Total X (delta Y), reused 0 (delta 0)
remote: Resolving deltas: 100% (Y/Y), completed with Z local objects.
To https://github.com/CliveCaseley/soldcomp-analyser2.git
 * [new branch]      fix/batch-3-rm-urls-and-asking-price -> fix/batch-3-rm-urls-and-asking-price
```

---

## Pull Request Creation

### Step 1: Navigate to GitHub
**URL**: https://github.com/CliveCaseley/soldcomp-analyser2

### Step 2: Create Pull Request
1. Click "Compare & pull request" button
2. Or navigate to: https://github.com/CliveCaseley/soldcomp-analyser2/pull/new/fix/batch-3-rm-urls-and-asking-price

### Step 3: Fill PR Details

**Title:**
```
Batch 3: Extract Rightmove URLs and Target Asking Price
```

**Description:**
```markdown
## Overview
Implements Batch 3 features for Rightmove URL extraction and target asking price scraping.

## Issues Addressed
- **Issue #4**: Extract Rightmove URLs from PropertyData transaction pages
- **Issue #7**: Extract asking price for target property from live listings

## Features Implemented

### 1. Rightmove URL Extraction from PropertyData
- ✅ PropertyData scraper extracts Rightmove URLs when present
- ✅ Stores URL_Rightmove and URL_PropertyData in separate columns
- ✅ Excel hyperlinks generated for both URL types
- ✅ Graceful handling when Rightmove URL not found

### 2. Target Asking Price Extraction
- ✅ Detects live listings vs sold properties (Rightmove + PropertyData)
- ✅ Scrapes asking price from live listing pages
- ✅ Calculates £/sqft using asking price and floor area
- ✅ Updates target property Price and £/sqft fields
- ✅ Flags asking prices to distinguish from sold prices

## Technical Changes

### Modified Files
1. **src/scrapers/propertyDataScraper.js**
   - Extract Rightmove URLs from PropertyData pages
   - Store URL_PropertyData for reference

2. **src/scrapers/rightmoveScraper.js**
   - Store URL_Rightmove for consistency

3. **src/utils/excelHelper.js**
   - Add Rightmove Link hyperlink column
   - Add PropertyData Link hyperlink column

4. **src/main.js**
   - Import askingPriceScraper module
   - Add Step 10.2: Extract target asking price
   - Add extractTargetAskingPrice() function

### New Files
5. **src/utils/askingPriceScraper.js**
   - Live listing detection (isLiveListing)
   - Asking price extraction (extractAskingPrice)
   - £/sqft calculation (calculatePricePerSqft)

6. **test-batch-3-rm-urls-asking-price.js**
   - Comprehensive test suite
   - 100% pass rate on all tests

### Documentation
7. **BATCH_3_SUMMARY.md** - Complete technical documentation
8. **BATCH_3_SUMMARY.pdf** - PDF version for easy sharing
9. **PUSH_INSTRUCTIONS_BATCH_3.md** - Deployment guide

## Test Results
✅ All Batch 3 tests passing (100% pass rate)

### Test Coverage
- ✅ PropertyData Rightmove URL extraction
- ✅ Rightmove URL storage
- ✅ Live listing detection (4/4 tests passed)
- ✅ £/sqft calculation (4/4 tests passed)
- ✅ Excel hyperlink generation
- ✅ Target asking price extraction workflow

## Edge Cases Handled
- ✅ PropertyData page without Rightmove URL
- ✅ Target property is sold property (not live listing)
- ✅ No floor area for target property
- ✅ Invalid or unreachable listing URL
- ✅ Multiple Rightmove links on PropertyData page

## Performance Impact
- Minimal: +2-5 seconds per target property (if live listing detected)
- No impact on comparable property processing
- Rate limiting maintained (2 seconds between requests)

## Integration
- ✅ Compatible with Batch 1 (EPC matching & duplicates)
- ✅ Compatible with Batch 2 (manual edit detection)
- ✅ Compatible with Enhancements A-D (EPC, geocoding, floor area)
- ✅ Asking price extraction uses floor area from EPC (Enhancement A)

## Documentation
Complete documentation provided:
- Technical summary with architecture diagrams
- Implementation details with code examples
- Test results and pass rates
- Usage examples and edge cases
- Performance considerations

## Breaking Changes
None - fully backward compatible

## Dependencies
- Existing: axios, cheerio, apify
- No new dependencies added

## Checklist
- ✅ Code implemented and tested
- ✅ All tests passing (100% pass rate)
- ✅ Documentation complete
- ✅ No breaking changes
- ✅ Edge cases handled
- ✅ Performance validated
- ✅ Integration tested

## Ready for Review
This PR is ready for review and merge. All tests passing, documentation complete.

See **BATCH_3_SUMMARY.md** for complete technical documentation.
```

### Step 4: Assign Reviewers
- Assign repository owner/maintainer
- Add relevant labels: `enhancement`, `batch-3`

### Step 5: Submit PR
Click "Create pull request"

---

## Post-Push Verification

### 1. Verify Remote Branch
```bash
git branch -a
```

**Expected Output:**
```
* fix/batch-3-rm-urls-and-asking-price
  master
  remotes/origin/fix/batch-3-rm-urls-and-asking-price
  remotes/origin/master
```

### 2. Check PR Status
Visit: https://github.com/CliveCaseley/soldcomp-analyser2/pulls

**Expected:**
- PR visible in pull requests list
- All checks passing (if CI/CD configured)
- No merge conflicts

### 3. Verify Commits
```bash
git log --oneline -5
```

**Expected:**
- Latest commit visible
- Commit message matches template

---

## Rollback Instructions

### If Issues Found Before Merge

**Revert local changes:**
```bash
git reset --hard HEAD~1
```

**Force push to remote (if already pushed):**
```bash
git push origin fix/batch-3-rm-urls-and-asking-price --force
```

### If Issues Found After Merge

**Create revert PR:**
```bash
git checkout master
git pull origin master
git revert <commit-hash>
git push origin master
```

---

## Merge Instructions

### Step 1: Review PR
- Check all tests passing
- Review code changes
- Verify documentation complete

### Step 2: Merge PR
**Option 1: GitHub UI**
1. Navigate to PR page
2. Click "Merge pull request"
3. Select "Squash and merge" (recommended) or "Create a merge commit"
4. Confirm merge

**Option 2: Command Line**
```bash
git checkout master
git pull origin master
git merge fix/batch-3-rm-urls-and-asking-price
git push origin master
```

### Step 3: Delete Feature Branch
**On GitHub:**
- Click "Delete branch" button after merge

**Locally:**
```bash
git branch -d fix/batch-3-rm-urls-and-asking-price
git push origin --delete fix/batch-3-rm-urls-and-asking-price
```

### Step 4: Update Local Master
```bash
git checkout master
git pull origin master
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] PR reviewed and approved
- [ ] Documentation complete
- [ ] No merge conflicts
- [ ] Edge cases tested

### Deployment
- [ ] Merge PR to master
- [ ] Delete feature branch
- [ ] Update local master branch
- [ ] Verify master branch status

### Post-Deployment
- [ ] Run smoke tests on production
- [ ] Monitor for any issues
- [ ] Validate Batch 3 features working
- [ ] Update project documentation

---

## Contact Information

**Repository**: https://github.com/CliveCaseley/soldcomp-analyser2

**Branch**: fix/batch-3-rm-urls-and-asking-price

**Documentation**: BATCH_3_SUMMARY.md

**Issues**:
- Issue #4: Extract Rightmove URLs from PropertyData pages
- Issue #7: Extract asking price for target property

---

## Additional Notes

### Test Command
```bash
node test-batch-3-rm-urls-asking-price.js
```

### Key Features
1. Rightmove URL extraction from PropertyData pages
2. Live listing detection (Rightmove + PropertyData)
3. Asking price scraping for target properties
4. £/sqft calculation from asking price and floor area
5. Excel hyperlink columns for Rightmove and PropertyData URLs

### Success Criteria
- ✅ All tests passing (100% pass rate)
- ✅ No breaking changes
- ✅ Full backward compatibility
- ✅ Complete documentation
- ✅ Edge cases handled

---

## Version History

**v1.0** (December 5, 2025)
- Initial Batch 3 implementation
- Rightmove URL extraction from PropertyData
- Target asking price extraction
- Comprehensive test suite
- Complete documentation

---

## References

- **BATCH_3_SUMMARY.md** - Complete technical documentation
- **test-batch-3-rm-urls-asking-price.js** - Test suite
- **src/utils/askingPriceScraper.js** - Core implementation
- **Issues #4, #7** - Original requirements

---

**Status**: ✅ Ready for push and merge

**Last Updated**: December 5, 2025
