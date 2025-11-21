/* ============================================================================
   utils.js
   Purpose: Shared utility functions used across modules
============================================================================ */

// ------------------- Function: getVillageCrestUrl -------------------
// Returns the URL of the village crest for a given village
export function getVillageCrestUrl(village) {
    const villageCrests = {
        'rudania': 'https://static.wixstatic.com/media/7573f4_ffb523e41dbb43c183283a5afbbc74e1~mv2.png',
        'inariko': 'https://static.wixstatic.com/media/7573f4_066600957d904b1dbce10912d698f5a2~mv2.png',
        'vhintl': 'https://static.wixstatic.com/media/7573f4_15ac377e0dd643309853fc77250a86a1~mv2.png'
    };
    return villageCrests[village.toLowerCase()] || '';
}

// ------------------- Function: capitalize -------------------
// Comprehensive capitalization function for consistent formatting
// Handles jobs, villages, and other names with proper capitalization
export function capitalize(str) {
    if (!str || typeof str !== 'string') return '';
    
    // Handle special cases and common abbreviations
    const specialCases = {
        'ko': 'KO',
        'ko\'d': 'KO\'d',
        'bloodmoon': 'Blood Moon',
        'blood moon': 'Blood Moon',
        'fairycircle': 'Fairy Circle',
        'fairy circle': 'Fairy Circle',
        'flowerbloom': 'Flower Bloom',
        'flower bloom': 'Flower Bloom',
        'meteorshower': 'Meteor Shower',
        'meteor shower': 'Meteor Shower',
        'rockslide': 'Rock Slide',
        'rock slide': 'Rock Slide',
        'thundersnow': 'Thunder Snow',
        'thunder snow': 'Thunder Snow',
        'thunderstorm': 'Thunderstorm',
        'heatlightning': 'Heat Lightning',
        'heat lightning': 'Heat Lightning',
        'cinderstorm': 'Cinder Storm',
        'cinder storm': 'Cinder Storm',
        'blightrain': 'Blight Rain',
        'blight rain': 'Blight Rain',
        'blizzard': 'Blizzard',
        'drought': 'Drought',
        'jubilee': 'Jubilee',
        'muggy': 'Muggy',
        'sleet': 'Sleet',
        'hail': 'Hail',
        'fog': 'Fog',
        'rain': 'Rain',
        'snow': 'Snow',
        'cloudy': 'Cloudy',
        'rainbow': 'Rainbow',
        'avalanche': 'Avalanche'
    };
    
    const lowerStr = str.toLowerCase().trim();
    
    // Check for special cases first
    if (specialCases[lowerStr]) {
        return specialCases[lowerStr];
    }
    
    // Handle camelCase and PascalCase by adding spaces before capitals
    let formatted = str.replace(/([A-Z])/g, ' $1').trim();
    
    // Capitalize first letter of each word
    formatted = formatted.split(' ')
        .map(word => {
            if (!word) return '';
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ')
        .trim();
    
    return formatted;
}

// ------------------- Function: capitalizeArray -------------------
// Capitalizes all strings in an array
export function capitalizeArray(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.filter(Boolean).map(item => capitalize(item));
} 