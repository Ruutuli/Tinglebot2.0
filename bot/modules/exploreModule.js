// ============================================================================
// ------------------- Explore Module Helpers -------------------
// ============================================================================

const Character = require('@/models/CharacterModel');
const ModCharacter = require('@/models/ModCharacterModel');
const Square = require('../models/mapModel');
const Party = require('@/models/PartyModel');

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
async function updateDiscoveryGrottoStatus(squareId, quadrantId, discoveryKey, grottoStatus, options = {}) {
    if (EXPLORATION_TESTING_MODE || !squareId || !quadrantId || !discoveryKey || !grottoStatus) return;
    if (options.party && options.party.status !== "started") return; // Do not update map when expedition is over
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
        const party = grotto.partyId ? await Party.findOne({ partyId: grotto.partyId }).lean() : null;
        if (party && party.status !== "started") return; // Do not update map when expedition is over
        await updateDiscoveryGrottoStatus(grotto.squareId, grotto.quadrantId, dk, "cleared");
    }
}

// ------------------- handleExpeditionFailedFromWave ------------------
// Called when an expedition wave fails (party pool hits 0) — ends the expedition with KO status
// Similar to handleExpeditionFailed in explore.js but callable from waveModule
const EXPLORATION_KO_DEBUFF_DAYS = 7;
const REGION_TO_VILLAGE_LOWER = { eldin: "rudania", lanayru: "inariko", faron: "vhintl" };
const START_POINTS_BY_REGION = {
    eldin: { square: "H5", quadrant: "Q3" },
    lanayru: { square: "E8", quadrant: "Q2" },
    faron: { square: "H11", quadrant: "Q1" },
};

async function handleExpeditionFailedFromWave(expeditionId, client) {
    if (!expeditionId) return { success: false, error: 'No expeditionId provided' };
    
    const { handleKO } = require('./characterStatsModule.js');
    const { closeRaidsForExpedition } = require('./raidModule.js');
    const Grotto = require('@/models/GrottoModel');
    const { EmbedBuilder } = require('discord.js');
    const logger = require('@/utils/logger');
    
    try {
        const party = await Party.findActiveByPartyId(expeditionId);
        if (!party) return { success: false, error: 'Party not found' };
        
        const start = START_POINTS_BY_REGION[party.region];
        if (!start) return { success: false, error: 'Could not resolve start location for region' };
        
        const targetVillage = REGION_TO_VILLAGE_LOWER[party.region] || "rudania";
        const debuffEndDate = new Date(Date.now() + EXPLORATION_KO_DEBUFF_DAYS * 24 * 60 * 60 * 1000);
        
        if (!EXPLORATION_TESTING_MODE) {
            for (const partyChar of party.characters) {
                const char = await Character.findById(partyChar._id);
                if (char) {
                    await handleKO(char._id);
                    char.currentStamina = 0;
                    char.currentVillage = targetVillage;
                    char.debuff = char.debuff || {};
                    char.debuff.active = true;
                    char.debuff.endDate = debuffEndDate;
                    await char.save();
                }
            }
        }
        
        // Reset explored quadrants
        const exploredThisRun = party.exploredQuadrantsThisRun || [];
        if (exploredThisRun.length > 0) {
            for (const { squareId, quadrantId } of exploredThisRun) {
                if (squareId && quadrantId) {
                    await Square.updateOne(
                        { squareId: new RegExp(`^${escapeSquareIdForRegex(squareId)}$`, 'i'), "quadrants.quadrantId": new RegExp(`^${quadrantId}$`, 'i') },
                        { $set: { "quadrants.$[q].status": "unexplored", "quadrants.$[q].exploredBy": "", "quadrants.$[q].exploredAt": null } },
                        { arrayFilters: [{ "q.quadrantId": new RegExp(`^${quadrantId}$`, 'i') }] }
                    ).catch((err) => logger.warn("EXPLORE", `[exploreModule.js]⚠️ Reset quadrant to unexplored: ${err?.message}`));
                }
            }
        }
        
        // Delete grottos and close raids
        await Grotto.deleteMany({ partyId: party.partyId }).catch((err) => logger.warn("EXPLORE", `[exploreModule.js]⚠️ Grotto delete on fail: ${err?.message}`));
        await closeRaidsForExpedition(party.partyId);
        
        // Update party status
        party.square = start.square;
        party.quadrant = start.quadrant;
        party.status = "completed";
        party.totalHearts = 0;
        party.totalStamina = 0;
        party.gatheredItems = [];
        party.exploredQuadrantsThisRun = [];
        party.visitedQuadrantsThisRun = [];
        party.ruinRestQuadrants = [];
        party.blightExposure = 0;
        for (const c of party.characters) {
            c.currentHearts = 0;
            c.currentStamina = 0;
            c.items = [];
        }
        pushProgressLog(party, 'Party', 'expedition_failed', "Expedition failed — party was KO'd during monster camp wave.", undefined, undefined, new Date());
        await party.save();
        
        // Build KO embed
        const villageLabel = (targetVillage || "").charAt(0).toUpperCase() + (targetVillage || "").slice(1);
        const regionLabel = (party.region || "").charAt(0).toUpperCase() + (party.region || "").slice(1);
        const locationStr = `${start.square} ${start.quadrant} (${regionLabel} start)`;
        
        const embed = new EmbedBuilder()
            .setTitle("💀 **Expedition: Expedition Failed — Party KO'd**")
            .setColor(0x8b0000)
            .setDescription(
                "The party lost all collective hearts during a monster camp wave. The expedition has failed.\n\n" +
                "**Return:** Party wakes in **" + villageLabel + "** (the village you began from) with 0 hearts and 0 stamina.\n\n" +
                "**Items:** All items brought on the expedition and any found during the expedition are lost.\n\n" +
                "**Map:** Any quadrants this expedition had marked as Explored return to Unexplored status.\n\n" +
                "**Recovery debuff:** For **" + EXPLORATION_KO_DEBUFF_DAYS + " days**, characters cannot use healing or stamina items, cannot use healer services, and cannot join or go on expeditions. They must recover their strength."
            )
            .addFields(
                { name: '❤️ **__Party Hearts__**', value: '0', inline: true },
                { name: '🟩 **__Party Stamina__**', value: '0', inline: true },
                { name: '📍 **__Quadrant__**', value: locationStr, inline: true },
                { name: '🆔 **__Expedition ID__**', value: expeditionId, inline: true }
            )
            .setTimestamp();
        
        return { success: true, embed, party, villageLabel };
        
    } catch (err) {
        const logger = require('@/utils/logger');
        logger.error('EXPLORE', `handleExpeditionFailedFromWave: ${err.message}`);
        return { success: false, error: err.message };
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
    markGrottoCleared,
    handleExpeditionFailedFromWave
};
