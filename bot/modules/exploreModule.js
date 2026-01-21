// exploreModule.js
const Character = require('@app/shared/models/CharacterModel');

const { handleError } = require('@app/shared/utils/globalErrorHandler');
// Fetch character's items from the party data
async function getCharacterItems(party, characterName) {
    const character = party.characters.find(char => char.name === characterName);
    const items = character && character.items ? character.items : [];
    console.log(`Items Retrieved for ${characterName}:`, JSON.stringify(items, null, 2));
    return items;
}

// Format character items for display
function formatCharacterItems(items) {
    if (!items || items.length === 0) {
        return "No items carried";
    }
    return items.map(item => `${item.itemName} - Heals: ${item.modifierHearts || 0} ❤️ | Stamina: ${item.staminaRecovered || 0} 🟩`).join('\n');
}

// Calculate total hearts and stamina for the party
async function calculateTotalHeartsAndStamina(party) {
    let totalHearts = 0;
    let totalStamina = 0;

    for (const char of party.characters) {
        try {
            const characterData = await Character.findById(char._id).lean();
            if (characterData) {
                totalHearts += characterData.currentHearts || 0;
                totalStamina += characterData.currentStamina || 0;
                console.log(`Fetched ${characterData.name}: Hearts - ${characterData.currentHearts}, Stamina - ${characterData.currentStamina}`);
            }
        } catch (error) {
    handleError(error, 'exploreModule.js');

            console.error(`Error fetching character data for ID ${char._id}: ${error.message}`);
        }
    }
    console.log(`Final Calculated Total Hearts: ${totalHearts}, Total Stamina: ${totalStamina}`);
    return { totalHearts, totalStamina };
}

module.exports = {
    getCharacterItems,
    formatCharacterItems,
    calculateTotalHeartsAndStamina
};
