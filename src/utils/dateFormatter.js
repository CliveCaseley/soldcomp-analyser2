const { log } = require('apify');

/**
 * DATE FORMATTER MODULE
 * 
 * CRITICAL FIX: Standardize Date Format to DD/MM/YYYY
 * - Handles multiple input formats (DD/MM/YYYY, DD-MMM-YY, YYYY-MM-DD, etc.)
 * - Always outputs consistent DD/MM/YYYY format
 * - Prevents date inconsistencies in CSV output
 * 
 * Issue: Mixed date formats in output ("02 Jul 2025" vs "01/08/2025")
 * Solution: Standardize ALL dates to DD/MM/YYYY format
 */

/**
 * Parse various date formats and return Date object
 * @param {string} dateStr - Date string in various formats
 * @returns {Date|null} Parsed Date object or null if parsing fails
 */
function parseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    
    const trimmed = dateStr.trim();
    
    try {
        // Format 1: DD/MM/YYYY (already correct)
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
            const [day, month, year] = trimmed.split('/').map(Number);
            return new Date(year, month - 1, day);
        }
        
        // Format 2: DD-MMM-YY (e.g., "02-Jul-25" or "02 Jul 2025")
        // Matches: 02-Jul-25, 02 Jul 25, 02-Jul-2025, 02 Jul 2025
        const monthNameMatch = trimmed.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[\s-](\d{2,4})$/);
        if (monthNameMatch) {
            const day = parseInt(monthNameMatch[1]);
            const monthName = monthNameMatch[2].toLowerCase();
            let year = parseInt(monthNameMatch[3]);
            
            // Convert 2-digit year to 4-digit
            if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
            }
            
            const months = {
                'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
                'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
            };
            
            const month = months[monthName];
            if (month !== undefined) {
                return new Date(year, month, day);
            }
        }
        
        // Format 3: YYYY-MM-DD (ISO format)
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
            return new Date(trimmed);
        }
        
        // Format 4: DD-MM-YYYY (with hyphens)
        if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed)) {
            const [day, month, year] = trimmed.split('-').map(Number);
            return new Date(year, month - 1, day);
        }
        
        // Format 5: Try JavaScript's Date.parse as fallback
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
            return date;
        }
    } catch (error) {
        log.warning(`Failed to parse date: ${dateStr}`);
    }
    
    return null;
}

/**
 * Format Date object to DD/MM/YYYY string
 * @param {Date} date - Date object
 * @returns {string} Formatted date string (DD/MM/YYYY)
 */
function formatDateToDDMMYYYY(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return null;
    }
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
}

/**
 * Standardize date string to DD/MM/YYYY format
 * @param {string} dateStr - Date string in any supported format
 * @returns {string|null} Standardized date (DD/MM/YYYY) or null if parsing fails
 */
function standardizeDateFormat(dateStr) {
    if (!dateStr) return null;
    
    const date = parseDate(dateStr);
    if (!date) {
        log.warning(`Could not parse date: "${dateStr}"`);
        return null;
    }
    
    const formatted = formatDateToDDMMYYYY(date);
    
    if (dateStr !== formatted) {
        log.info(`Standardized date: "${dateStr}" → "${formatted}"`);
    }
    
    return formatted;
}

module.exports = {
    parseDate,
    formatDateToDDMMYYYY,
    standardizeDateFormat
};
