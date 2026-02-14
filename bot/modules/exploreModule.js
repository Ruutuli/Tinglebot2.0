// exploreModule.js
const Character = require('@/models/CharacterModel');
const ModCharacter = require('@/models/ModCharacterModel');

const { handleError } = require('@/utils/globalErrorHandler');
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

/**
 * Sync party member stats from Character/ModCharacter DB into party.characters,
 * then recompute party.totalHearts and party.totalStamina and save.
 * Use when loading party for exploration so totals match members (e.g. after raid damage).
 */
async function syncPartyMemberStats(party) {
    if (!party || !party.characters || party.characters.length === 0) return;
    try {
        for (let i = 0; i < party.characters.length; i++) {
            const slot = party.characters[i];
            if (!slot || !slot._id) continue;
            let charDoc = await Character.findById(slot._id).lean();
            if (!charDoc) {
                charDoc = await ModCharacter.findById(slot._id).lean();
            }
            if (charDoc) {
                slot.currentHearts = charDoc.currentHearts ?? 0;
                slot.currentStamina = charDoc.currentStamina ?? 0;
            }
        }
        party.totalHearts = party.characters.reduce((s, c) => s + (c.currentHearts ?? 0), 0);
        party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
        party.markModified('characters');
        await party.save();
    } catch (error) {
        handleError(error, 'exploreModule.js');
        console.error(`[exploreModule.js]: syncPartyMemberStats failed: ${error.message}`);
    }
}

module.exports = {
    getCharacterItems,
    formatCharacterItems,
    calculateTotalHeartsAndStamina,
    syncPartyMemberStats
};
