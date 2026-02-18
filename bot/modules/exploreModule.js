// exploreModule.js
const Character = require('@/models/CharacterModel');
const ModCharacter = require('@/models/ModCharacterModel');
const Square = require('../models/mapModel');

const { handleError } = require('@/utils/globalErrorHandler');

/**
 * True if quadrant has monster_camp or grotto discoveries (for revisiting).
 */
async function hasDiscoveriesInQuadrant(squareId, quadrantId) {
    if (!squareId || !quadrantId) return false;
    try {
        const square = await Square.findOne({ squareId: new RegExp(`^${String(squareId).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
        if (!square?.quadrants) return false;
        const q = square.quadrants.find((qu) => String(qu.quadrantId || "").toUpperCase() === String(quadrantId).toUpperCase());
        if (!q?.discoveries?.length) return false;
        return q.discoveries.some((d) => (d.type || "").toLowerCase() === "monster_camp" || (d.type || "").toLowerCase() === "grotto");
    } catch {
        return false;
    }
}
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
    const { EXPLORATION_TESTING_MODE } = require('@/utils/explorationTestingConfig');
    if (EXPLORATION_TESTING_MODE) return; // Preserve in-session hearts/stamina display; never overwrite from DB
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

/**
 * Push an entry to the party progress log (shown on exploration dashboard).
 * @param {Object} party - Party document
 * @param {string} characterName - Name of character who performed the action
 * @param {string} outcome - Outcome type (e.g. 'monster_camp_defeated', 'chest_open', 'raid')
 * @param {string} message - Human-readable message
 * @param {{ itemName?: string, emoji?: string }} loot - Optional loot info
 * @param {{ heartsLost?: number, staminaLost?: number, heartsRecovered?: number, staminaRecovered?: number }} costs - Optional cost/recovery info
 * @param {Date} at - Timestamp for the entry
 */
function pushProgressLog(party, characterName, outcome, message, loot, costs, at) {
    if (!party) return;
    if (!party.progressLog) party.progressLog = [];
    const entry = {
        at: at instanceof Date ? at : new Date(),
        characterName: characterName || 'Unknown',
        outcome,
        message: message || '',
    };
    if (loot && (loot.itemName || loot.emoji)) {
        entry.loot = { itemName: loot.itemName || '', emoji: loot.emoji || '' };
    }
    if (costs) {
        if (typeof costs.heartsLost === 'number' && costs.heartsLost > 0) entry.heartsLost = costs.heartsLost;
        if (typeof costs.staminaLost === 'number' && costs.staminaLost > 0) entry.staminaLost = costs.staminaLost;
        if (typeof costs.heartsRecovered === 'number' && costs.heartsRecovered > 0) entry.heartsRecovered = costs.heartsRecovered;
        if (typeof costs.staminaRecovered === 'number' && costs.staminaRecovered > 0) entry.staminaRecovered = costs.staminaRecovered;
    }
    party.progressLog.push(entry);
    party.markModified('progressLog');
}

/**
 * Update grottoStatus on a map discovery (found | cleansed | cleared).
 */
async function updateDiscoveryGrottoStatus(squareId, quadrantId, discoveryKey, grottoStatus) {
    const { EXPLORATION_TESTING_MODE } = require('@/utils/explorationTestingConfig');
    if (EXPLORATION_TESTING_MODE || !squareId || !quadrantId || !discoveryKey || !grottoStatus) return;
    const sq = String(squareId).trim();
    const qd = String(quadrantId).trim().toUpperCase();
    await Square.updateOne(
        { squareId: new RegExp(`^${sq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        { $set: { "quadrants.$[q].discoveries.$[d].grottoStatus": grottoStatus } },
        { arrayFilters: [{ "q.quadrantId": qd }, { "d.discoveryKey": discoveryKey }] }
    );
}

/**
 * Mark grotto as cleared (status + completedAt) and update map discovery.
 */
async function markGrottoCleared(grotto) {
    if (!grotto) return;
    grotto.status = "cleared";
    grotto.completedAt = new Date();
    grotto.markModified?.("status");
    await grotto.save();
    const dk = grotto.discoveryKey;
    if (dk && grotto.squareId && grotto.quadrantId) {
        await updateDiscoveryGrottoStatus(grotto.squareId, grotto.quadrantId, dk, "cleared");
    }
}

module.exports = {
    getCharacterItems,
    formatCharacterItems,
    calculateTotalHeartsAndStamina,
    syncPartyMemberStats,
    pushProgressLog,
    hasDiscoveriesInQuadrant,
    updateDiscoveryGrottoStatus,
    markGrottoCleared
};
