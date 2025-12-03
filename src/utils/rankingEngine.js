const { log } = require('apify');

/**
 * Ranking weights
 */
const WEIGHTS = {
    FLOOR_AREA: 0.40,
    PROXIMITY: 0.30,
    BEDROOMS: 0.20,
    RECENCY: 0.10
};

/**
 * Calculate ranking score for a comparable property
 * @param {Object} property - Comparable property
 * @param {Object} target - Target property
 * @param {number} maxDistance - Maximum distance in miles for normalization
 * @param {number} maxDays - Maximum days since sale for normalization
 * @returns {number} Ranking score (0-100)
 */
function calculateRanking(property, target, maxDistance, maxDays) {
    let totalScore = 0;
    
    // Floor area similarity (40%)
    const floorAreaScore = calculateFloorAreaScore(property, target);
    totalScore += floorAreaScore * WEIGHTS.FLOOR_AREA;
    
    // Proximity (30%)
    const proximityScore = calculateProximityScore(property, maxDistance);
    totalScore += proximityScore * WEIGHTS.PROXIMITY;
    
    // Bedrooms match (20%)
    const bedroomsScore = calculateBedroomsScore(property, target);
    totalScore += bedroomsScore * WEIGHTS.BEDROOMS;
    
    // Recency of sale (10%)
    const recencyScore = calculateRecencyScore(property, maxDays);
    totalScore += recencyScore * WEIGHTS.RECENCY;
    
    return Math.round(totalScore);
}

/**
 * Calculate floor area similarity score
 * @param {Object} property - Property to score
 * @param {Object} target - Target property
 * @returns {number} Score (0-100)
 */
function calculateFloorAreaScore(property, target) {
    if (!property['Sq. ft'] || !target['Sq. ft']) {
        return 0; // Missing data
    }
    
    const propertySqft = parseFloat(property['Sq. ft']);
    const targetSqft = parseFloat(target['Sq. ft']);
    
    if (isNaN(propertySqft) || isNaN(targetSqft) || targetSqft === 0) {
        return 0;
    }
    
    const difference = Math.abs(propertySqft - targetSqft);
    const percentDifference = (difference / targetSqft) * 100;
    
    const score = Math.max(0, 100 - percentDifference);
    return score;
}

/**
 * Calculate proximity score
 * @param {Object} property - Property to score
 * @param {number} maxDistance - Maximum distance for normalization
 * @returns {number} Score (0-100)
 */
function calculateProximityScore(property, maxDistance) {
    if (!property.Distance || !property._distanceValue) {
        return 0; // Missing distance data
    }
    
    const distance = property._distanceValue;
    
    if (maxDistance === 0) {
        return 100; // All properties at same location
    }
    
    const score = Math.max(0, 100 - (distance / maxDistance * 100));
    return score;
}

/**
 * Calculate bedrooms match score
 * @param {Object} property - Property to score
 * @param {Object} target - Target property
 * @returns {number} Score (0, 50, or 100)
 */
function calculateBedroomsScore(property, target) {
    if (!property.Bedrooms || !target.Bedrooms) {
        return 0; // Missing data
    }
    
    const propertyBeds = parseInt(property.Bedrooms);
    const targetBeds = parseInt(target.Bedrooms);
    
    if (isNaN(propertyBeds) || isNaN(targetBeds)) {
        return 0;
    }
    
    const difference = Math.abs(propertyBeds - targetBeds);
    
    if (difference === 0) {
        return 100; // Exact match
    } else if (difference === 1) {
        return 50; // Off by 1
    } else {
        return 0; // More than 1 difference
    }
}

/**
 * Calculate recency of sale score
 * @param {Object} property - Property to score
 * @param {number} maxDays - Maximum days for normalization
 * @returns {number} Score (0-100)
 */
function calculateRecencyScore(property, maxDays) {
    if (!property['Date of sale'] || !property._daysSinceSale) {
        return 0; // Missing data
    }
    
    const days = property._daysSinceSale;
    
    if (maxDays === 0) {
        return 100; // All on same date
    }
    
    const score = Math.max(0, 100 - (days / maxDays * 100));
    return score;
}

/**
 * Parse date string to days since sale
 * @param {string} dateStr - Date string (DD/MM/YYYY or YYYY-MM-DD)
 * @returns {number} Days since sale
 */
function parseDateToDays(dateStr) {
    if (!dateStr) return null;
    
    try {
        let date;
        
        // Try DD/MM/YYYY format
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                date = new Date(parts[2], parts[1] - 1, parts[0]);
            }
        }
        // Try YYYY-MM-DD format
        else if (dateStr.includes('-')) {
            date = new Date(dateStr);
        }
        
        if (date && !isNaN(date.getTime())) {
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
        }
    } catch (error) {
        log.warning(`Failed to parse date: ${dateStr}`);
    }
    
    return null;
}

/**
 * Rank all comparable properties
 * @param {Array<Object>} properties - Array of comparable properties
 * @param {Object} target - Target property
 * @returns {Array<Object>} Ranked properties sorted by score (highest first)
 */
function rankProperties(properties, target) {
    log.info(`Ranking ${properties.length} comparable properties...`);
    
    // Calculate days since sale for all properties
    properties.forEach(prop => {
        if (prop['Date of sale']) {
            prop._daysSinceSale = parseDateToDays(prop['Date of sale']);
        }
    });
    
    // Find max values for normalization
    const maxDistance = Math.max(...properties
        .filter(p => p._distanceValue)
        .map(p => p._distanceValue), 0);
    
    const maxDays = Math.max(...properties
        .filter(p => p._daysSinceSale)
        .map(p => p._daysSinceSale), 0);
    
    log.info(`Max distance for normalization: ${maxDistance} miles`);
    log.info(`Max days for normalization: ${maxDays} days`);
    
    // Calculate ranking for each property
    properties.forEach(prop => {
        const score = calculateRanking(prop, target, maxDistance, maxDays);
        prop.Ranking = score;
        log.info(`  ${prop.Address || 'Unknown'}: Score ${score}`);
    });
    
    // Sort by ranking (highest first)
    const ranked = properties.sort((a, b) => (b.Ranking || 0) - (a.Ranking || 0));
    
    log.info('Ranking complete');
    return ranked;
}

module.exports = {
    rankProperties,
    parseDateToDays
};