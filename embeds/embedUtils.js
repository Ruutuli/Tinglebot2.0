// ------------------- Import necessary modules and helpers -------------------
const mongoose = require('mongoose'); 
const { EmbedBuilder } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const { getVillageColorByName } = require('../modules/locationsModule');
const { capitalizeFirstLetter } = require('../modules/formattingModule');

// Default values
const DEFAULT_EMOJI = '🔹';
const DEFAULT_IMAGE_URL = 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';

// Job actions for different professions
const jobActions = {
    "Artist": "created",
    "Craftsman": "crafted",
    "Weaver": "stitched",
    "Blacksmith": "forged",
    "Mask Maker": "made",
    "Witch": "brewed",
    "Cook": "cooked",
    "Researcher": "invented"
};

// ------------------- Helper Functions -------------------

// Get the article ('a' or 'an') for an item based on its name
function getArticleForItem(itemName) {
    const vowels = ['A', 'E', 'I', 'O', 'U'];
    return vowels.includes(itemName.charAt(0).toUpperCase()) ? 'an' : 'a';
}

// Format item details with padding and code blocks
function formatItemDetails(itemName, quantity = 1, emoji = DEFAULT_EMOJI) {
    const truncatedName = itemName.length > 20 ? itemName.substring(0, 17) + '...' : itemName;
    const itemNamePadded = truncatedName.padEnd(20, ' ');
    const quantityPadded = quantity.toString().padStart(3, ' ');
    return `${emoji} \`${itemNamePadded}\` ⨯ \`${quantityPadded}\``;
}

// Get common embed settings based on the character's home village color
const getCommonEmbedSettings = (character) => {
    const villageColor = getVillageColorByName(capitalizeFirstLetter(character.homeVillage));
    return {
        color: villageColor,
        author: {
            name: `${character.name} 🔗`,
            iconURL: character.icon,
            url: character.inventory
        },
        image: { url: DEFAULT_IMAGE_URL }
    };
};

// ------------------- Export the utilities -------------------
module.exports = {
    DEFAULT_EMOJI,
    DEFAULT_IMAGE_URL,
    jobActions,
    getArticleForItem,
    formatItemDetails,
    getCommonEmbedSettings,
};

