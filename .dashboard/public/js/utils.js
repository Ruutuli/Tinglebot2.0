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