// ============================================================================
// ------------------- Explore Module Helpers -------------------
// ============================================================================

const Character = require('@/models/CharacterModel');
const ModCharacter = require('@/models/ModCharacterModel');
const Square = require('../models/mapModel');

const { handleError } = require('@/utils/globalErrorHandler');
const { EXPLORATION_TESTING_MODE } = require('@/utils/explorationTestingConfig');

// ------------------- Helpers ------------------
// escapeSquareIdForRegex - escape squareId for use in RegExp
function escapeSquareIdForRegex(squareId) {
    return String(squareId || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ------------------- hasDiscoveriesInQuadrant ------------------
// True if quadrant has monster_camp or grotto discoveries (for revisiting).
async function hasDiscoveriesInQuadrant(squareId, quadrantId) {
    if (!squareId || !quadrantId) return false;
    try {
        const square = await Square.findOne({ squareId: new RegExp(`^${escapeSquareIdForRegex(squareId)}$`, 'i') });
        if (!square?.quadrants) return false;
        const q = square.quadrants.find((qu) => String(qu.quadrantId || "").toUpperCase() === String(quadrantId).toUpperCase());
        if (!q?.discoveries?.length) return false;
        return q.discoveries.some((d) => (d.type || "").toLowerCase() === "monster_camp" || (d.type || "").toLowerCase() === "grotto");
    } catch {
        return false;
    }
}

// ------------------- getCharacterItems ------------------
// Fetch character items from party data -
async function getCharacterItems(party, characterName) {
    const character = party.characters.find(char => char.name === characterName);
    const items = character && character.items ? character.items : [];
    return items;
}

// ------------------- formatCharacterItems ------------------
// Format character items for display -
function formatCharacterItems(items) {
    if (!items || items.length === 0) {
        return "No items carried";
    }
    return items.map(item => `${item.itemName} - Heals: ${item.modifierHearts || 0} ❤️ | Stamina: ${item.staminaRecovered || 0} 🟩`).join('\n');
}

// ------------------- calculateTotalHeartsAndStamina ------------------
// Total hearts and stamina for the party. During started expedition, pool is authoritative.
async function calculateTotalHeartsAndStamina(party) {
    if (party && party.status === 'started') {
        return {
            totalHearts: Math.max(0, party.totalHearts ?? 0),
            totalStamina: Math.max(0, party.totalStamina ?? 0)
        };
    }
    let totalHearts = 0;
    let totalStamina = 0;

    for (const char of party.characters || []) {
        try {
            const characterData = await Character.findById(char._id).lean();
            if (characterData) {
                totalHearts += characterData.currentHearts || 0;
                totalStamina += characterData.currentStamina || 0;
            }
        } catch (error) {
            handleError(error, 'exploreModule.js');
            console.error(`[exploreModule.js]❌ Error fetching character: ${error.message}`);
        }
    }
    return { totalHearts, totalStamina };
}

// ------------------- recomputePartyTotals ------------------
// Set party.totalHearts and party.totalStamina from party.characters. During started expedition, pool is authoritative: no-op.
function recomputePartyTotals(party) {
    if (!party || !party.characters || !Array.isArray(party.characters)) return;
    if (party.status === 'started') return; // Pool-only: do not recompute from slots
    party.totalHearts = party.characters.reduce((s, c) => s + (c.currentHearts ?? 0), 0);
    party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
    party.markModified('totalHearts');
    party.markModified('totalStamina');
}

// ------------------- syncPartyMemberStats ------------------
// Sync member stats from DB into party.characters, recompute totals and save. During started expedition, do not overwrite pool.
async function syncPartyMemberStats(party) {
    if (!party || !party.characters || party.characters.length === 0) return;
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
        if (party.status !== 'started') {
            party.totalHearts = party.characters.reduce((s, c) => s + (c.currentHearts ?? 0), 0);
            party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
        }
        party.markModified('characters');
        await party.save();
    } catch (error) {
        handleError(error, 'exploreModule.js');
        console.error(`[exploreModule.js]❌ syncPartyMemberStats failed: ${error.message}`);
    }
}

// ------------------- pushProgressLog ------------------
// Push entry to party progress log (exploration dashboard) -
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

// ------------------- updateDiscoveryGrottoStatus ------------------
// Update grottoStatus on map discovery (found | cleansed | cleared) -
async function updateDiscoveryGrottoStatus(squareId, quadrantId, discoveryKey, grottoStatus) {
    if (EXPLORATION_TESTING_MODE || !squareId || !quadrantId || !discoveryKey || !grottoStatus) return;
    const qd = String(quadrantId).trim().toUpperCase();
    await Square.updateOne(
        { squareId: new RegExp(`^${escapeSquareIdForRegex(squareId)}$`, 'i') },
        { $set: { "quadrants.$[q].discoveries.$[d].grottoStatus": grottoStatus } },
        { arrayFilters: [{ "q.quadrantId": qd }, { "d.discoveryKey": discoveryKey }] }
    );
}

// ------------------- markGrottoCleared ------------------
// Mark grotto cleared (status + completedAt) and update map discovery -
async function markGrottoCleared(grotto) {
    if (!grotto) return;
    if (EXPLORATION_TESTING_MODE) return; // No persist in testing mode
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
    recomputePartyTotals,
    syncPartyMemberStats,
    pushProgressLog,
    hasDiscoveriesInQuadrant,
    updateDiscoveryGrottoStatus,
    markGrottoCleared
};
