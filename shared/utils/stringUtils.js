/**
 * Capitalizes a village name consistently
 * @param {string} villageName - The village name to capitalize
 * @returns {string} The properly capitalized village name
 */
function capitalizeVillageName(villageName) {
    if (!villageName) return 'Unknown Village';
    
    // Special cases for known villages
    const villageMap = {
        'rudania': 'Rudania',
        'inariko': 'Inariko',
        'vhintl': 'Vhintl'
    };
    
    const lowerName = villageName.toLowerCase();
    return villageMap[lowerName] || villageName.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

module.exports = {
    capitalizeVillageName
}; 