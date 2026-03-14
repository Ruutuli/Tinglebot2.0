// ============================================================================
// ------------------- Explore Module Helpers -------------------
// ============================================================================

const Character = require('@/models/CharacterModel');
const ModCharacter = require('@/models/ModCharacterModel');
const Square = require('../models/mapModel');
const Party = require('@/models/PartyModel');
const Pin = require('@/models/PinModel');

const { handleError } = require('@/utils/globalErrorHandler');
const { EXPLORATION_TESTING_MODE } = require('@/utils/explorationTestingConfig');
const { START_POINTS_BY_REGION } = require('@/data/explorationStartPoints.js');

// ------------------- Helpers ------------------
// escapeSquareIdForRegex - escape squareId for use in RegExp
function escapeSquareIdForRegex(squareId) {
    return String(squareId || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Progress log outcomes that are "reportable" (can be pinned on dashboard). When leaving a square, unpinned ones are cleared.
// Keep legacy outcomes for backward compatibility with older progress logs.
const DISCOVERY_CLEANUP_OUTCOMES = [
    "monster_camp",
    "monster_camp_fight",
    "grotto",
    "grotto_found",
    "grotto_cleansed",
    "ruins",
    "ruins_found",
    "ruin_rest",
];
// Location parsing used for discovery cleanup / reminders. Keep aligned with dashboard parsing (supports "in" and "at").
const LOC_IN_MESSAGE_RE = /\s+(?:in|at)\s+([A-J](?:[1-9]|1[0-2]))\s+(Q[1-4])/i;

// True if current quadrant has reportable discoveries that are not yet pinned (reportedDiscoveryKeys or Pin). Used for embed reminder.
// Also checks Pin collection so discoveries pinned on the dashboard count even if party.reportedDiscoveryKeys wasn't updated yet.
async function hasUnpinnedDiscoveriesInQuadrant(party) {
    if (!party?.square || !party?.quadrant || !Array.isArray(party.progressLog)) return false;
    const reportedSet = new Set(Array.isArray(party.reportedDiscoveryKeys) ? party.reportedDiscoveryKeys.filter((k) => typeof k === "string" && k.length > 0) : []);
    const currentSquare = String(party.square).trim().toUpperCase();
    const currentQuadrant = String(party.quadrant).trim().toUpperCase();
    const partyIdNorm = party.partyId ? String(party.partyId).trim() : "";
    let quadrantHasPin = false;
    if (partyIdNorm) {
        try {
            // Case-insensitive partyId match (dashboard URL may use different casing)
            const pinQuery = { partyId: new RegExp(`^${escapeSquareIdForRegex(partyIdNorm)}$`, "i") };
            const pins = await Pin.find(pinQuery).select("sourceDiscoveryKey").lean();
            for (const pin of pins || []) {
                if (pin.sourceDiscoveryKey && typeof pin.sourceDiscoveryKey === "string") {
                    const k = pin.sourceDiscoveryKey.trim();
                    reportedSet.add(k);
                    // If this pin is for the current quadrant, remember so we can suppress reminder even if key format differs
                    const parts = k.split("|");
                    if (parts.length >= 3) {
                        const pinSquare = String(parts[1] || "").trim().toUpperCase();
                        const pinQuadrant = String(parts[2] || "").trim().toUpperCase();
                        if (pinSquare === currentSquare && pinQuadrant === currentQuadrant) {
                            quadrantHasPin = true;
                        }
                    }
                }
            }
        } catch (_) {
            // ignore pin lookup errors; fall back to reportedDiscoveryKeys only
        }
    }
    for (const e of party.progressLog) {
        if (!DISCOVERY_CLEANUP_OUTCOMES.includes(e.outcome)) continue;
        const m = LOC_IN_MESSAGE_RE.exec(e.message || "");
        if (!m || !m[1] || !m[2]) continue;
        const entrySquare = String(m[1]).trim().toUpperCase();
        const entryQuadrant = String(m[2]).trim().toUpperCase();
        if (entrySquare !== currentSquare || entryQuadrant !== currentQuadrant) continue;
        const atStr = e.at instanceof Date ? e.at.toISOString() : (typeof e.at === "string" ? e.at : "");
        const key = `${e.outcome}|${entrySquare}|${entryQuadrant}|${atStr}`;
        if (reportedSet.has(key)) continue;
        // Exact key not pinned; if user pinned something in this quadrant, don't show reminder (key format may differ)
        if (quadrantHasPin) continue;
        return true;
    }
    return false;
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

// ------------------- restorePartyPoolOnGrottoExit ------------------
// Restore expedition party pool to full when leaving a grotto (hearts and stamina).
// Must match explore.js so raid path (e.g. Test of Power exit) gets same full restore.
function restorePartyPoolOnGrottoExit(party) {
    if (!party) return;
    if (typeof party.maxHearts === 'number') party.totalHearts = party.maxHearts;
    if (typeof party.maxStamina === 'number') party.totalStamina = party.maxStamina;
    party.markModified('totalHearts');
    party.markModified('totalStamina');
    if (party.characters && Array.isArray(party.characters)) {
        for (const slot of party.characters) {
            if (typeof slot.maxHearts === 'number') slot.currentHearts = slot.maxHearts;
            if (typeof slot.maxStamina === 'number') slot.currentStamina = slot.maxStamina;
        }
        party.markModified('characters');
    }
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
        if (typeof costs.heartsReceived === 'number' && costs.heartsReceived > 0) entry.heartsReceived = costs.heartsReceived;
        if (typeof costs.heartsDealt === 'number' && costs.heartsDealt > 0) entry.heartsDealt = costs.heartsDealt;
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
    if (!squareId || !quadrantId || !discoveryKey || !grottoStatus) return;
    if (options.party && options.party.status !== "started") return; // Do not update map when expedition is over
    const qd = String(quadrantId).trim().toUpperCase();
    await Square.updateOne(
        { squareId: new RegExp(`^${escapeSquareIdForRegex(squareId)}$`, 'i') },
        { $set: { "quadrants.$[q].discoveries.$[d].grottoStatus": grottoStatus } },
        { arrayFilters: [{ "q.quadrantId": qd }, { "d.discoveryKey": discoveryKey }] }
    );
}

// ------------------- updateDiscoveryGrottoStatusByTypeInQuadrant ------------------
// Fallback: set grottoStatus on every discovery with type "grotto" in this quadrant (used when grotto has no discoveryKey).
async function updateDiscoveryGrottoStatusByTypeInQuadrant(squareId, quadrantId, grottoStatus) {
    if (!squareId || !quadrantId || !grottoStatus) return;
    const qd = String(quadrantId).trim().toUpperCase();
    await Square.updateOne(
        { squareId: new RegExp(`^${escapeSquareIdForRegex(squareId)}$`, 'i') },
        { $set: { "quadrants.$[q].discoveries.$[d].grottoStatus": grottoStatus } },
        { arrayFilters: [{ "q.quadrantId": qd }, { "d.type": "grotto" }] }
    );
}

// ------------------- markGrottoCleared ------------------
// Mark grotto cleared (status + completedAt) and update map discovery -
// Map is updated even if expedition has ended so grottoStatus stays correct.
async function markGrottoCleared(grotto) {
    if (!grotto) return;
    grotto.status = "cleared";
    grotto.completedAt = new Date();
    grotto.markModified?.("status");
    await grotto.save();
    if (!grotto.squareId || !grotto.quadrantId) return;
    const dk = grotto.discoveryKey;
    if (dk) {
        await updateDiscoveryGrottoStatus(grotto.squareId, grotto.quadrantId, dk, "cleared", {});
    } else {
        const logger = require('@/utils/logger');
        logger.warn("EXPLORE", `[exploreModule.js] markGrottoCleared: grotto ${grotto._id} has no discoveryKey — updating map by type in quadrant`);
        await updateDiscoveryGrottoStatusByTypeInQuadrant(grotto.squareId, grotto.quadrantId, "cleared");
    }
}

// ------------------- applyExpeditionFailedState ------------------
// Shared core logic for expedition failed (KO): apply debuff, reset map, update party.
// Used by handleExpeditionFailed (explore.js) and handleExpeditionFailedFromWave (wave path).
// Returns { success, error?, party?, start?, targetVillage?, villageLabel?, regionLabel?, locationStr?, debuffDays? }.
const EXPLORATION_KO_DEBUFF_DAYS = 7;
const REGION_TO_VILLAGE_LOWER = { eldin: "rudania", lanayru: "inariko", faron: "vhintl" };
const logger = require('@/utils/logger');

async function applyExpeditionFailedState(party, options = {}) {
    const failMessage = options.failMessage || "Expedition failed.";
    const regionKey = (party.region || "").toString().trim().toLowerCase();
    const start = START_POINTS_BY_REGION[regionKey];
    if (!start) return { success: false, error: 'Could not resolve start location for region' };

    const targetVillage = REGION_TO_VILLAGE_LOWER[regionKey] || "rudania";
    const debuffEndDate = new Date(Date.now() + EXPLORATION_KO_DEBUFF_DAYS * 24 * 60 * 60 * 1000);

    const { handleKO } = require('./characterStatsModule.js');
    const { closeRaidsForExpedition } = require('./raidModule.js');
    const Grotto = require('@/models/GrottoModel');

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

    const exploredThisRun = party.exploredQuadrantsThisRun || [];
    if (exploredThisRun.length > 0) {
        for (const { squareId, quadrantId } of exploredThisRun) {
            if (squareId && quadrantId) {
                const quadRegex = new RegExp(`^${quadrantId}$`, 'i');
                await Square.updateOne(
                    { squareId: new RegExp(`^${escapeSquareIdForRegex(squareId)}$`, 'i'), "quadrants.quadrantId": quadRegex },
                    { $set: { "quadrants.$[q].status": "unexplored", "quadrants.$[q].exploredBy": "", "quadrants.$[q].exploredAt": null } },
                    { arrayFilters: [{ "q.quadrantId": quadRegex }] }
                ).catch((err) => logger.warn("EXPLORE", `[exploreModule.js]⚠️ Reset quadrant to unexplored: ${err?.message}`));
                if (EXPLORATION_TESTING_MODE) {
                    await Square.updateOne(
                        { squareId: new RegExp(`^${escapeSquareIdForRegex(squareId)}$`, 'i'), "quadrants.quadrantId": quadRegex },
                        { $set: { "quadrants.$[q].discoveries": [] } },
                        { arrayFilters: [{ "q.quadrantId": quadRegex }] }
                    ).catch((err) => logger.warn("EXPLORE", `[exploreModule.js]⚠️ Testing fail: clear discoveries: ${err?.message}`));
                }
            }
        }
    }

    await Grotto.deleteMany({ partyId: party.partyId }).catch((err) => logger.warn("EXPLORE", `[exploreModule.js]⚠️ Grotto delete on fail: ${err?.message}`));
    await closeRaidsForExpedition(party.partyId);

    const lostItems = [
        ...(party.gatheredItems || []).map((item) => ({
            characterId: item.characterId,
            characterName: item.characterName,
            itemName: item.itemName,
            quantity: item.quantity ?? 1,
            emoji: item.emoji ?? '',
        })),
        ...(party.characters || []).flatMap((c) =>
            (c.items || []).map((item) => ({
                characterId: c._id,
                characterName: c.name,
                itemName: item.itemName,
                quantity: 1,
                emoji: item.emoji ?? '',
            }))
        ),
    ];
    const finalLocation = { square: party.square, quadrant: party.quadrant };

    party.square = start.square;
    party.quadrant = start.quadrant;
    party.status = "failed";
    party.outcome = "failed";
    party.lostItems = lostItems;
    party.finalLocation = finalLocation;
    party.endedAt = new Date();
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
    if (EXPLORATION_TESTING_MODE && party.progressLog?.length > 0) {
        party.progressLog = [];
        party.markModified('progressLog');
    }
    pushProgressLog(party, 'Party', 'expedition_failed', failMessage, undefined, undefined, new Date());
    await party.save();

    const villageLabel = (targetVillage || "").charAt(0).toUpperCase() + (targetVillage || "").slice(1);
    const regionLabel = (party.region || "").charAt(0).toUpperCase() + (party.region || "").slice(1);
    const locationStr = `${start.square} ${start.quadrant} (${regionLabel} start)`;

    return {
        success: true,
        party,
        start,
        targetVillage,
        villageLabel,
        regionLabel,
        locationStr,
        debuffDays: EXPLORATION_KO_DEBUFF_DAYS,
    };
}

// ------------------- handleExpeditionFailedFromWave ------------------
// Called when an expedition wave fails (party pool hits 0) — ends the expedition with KO status.
// Uses applyExpeditionFailedState for shared logic.
async function handleExpeditionFailedFromWave(expeditionId, client) {
    if (!expeditionId) return { success: false, error: 'No expeditionId provided' };

    const { EmbedBuilder } = require('discord.js');

    try {
        const party = await Party.findActiveByPartyId(expeditionId);
        if (!party) return { success: false, error: 'Party not found' };

        const result = await applyExpeditionFailedState(party, {
            failMessage: "Expedition failed — party was KO'd during monster camp wave.",
        });
        if (!result.success) return { success: false, error: result.error };

        const { villageLabel, locationStr, debuffDays } = result;

        const embed = new EmbedBuilder()
            .setTitle("💀 **Expedition: Expedition Failed — Party KO'd**")
            .setColor(0x8b0000)
            .setDescription(
                "The party lost all collective hearts during a monster camp wave. The expedition has failed.\n\n" +
                "**Return:** Party wakes in **" + villageLabel + "** (the village you began from) with 0 hearts and 0 stamina.\n\n" +
                "**Items:** All items brought on the expedition and any found during the expedition are lost.\n\n" +
                "**Map:** Any quadrants this expedition had marked as Explored return to Unexplored status.\n\n" +
                "**Recovery debuff:** For **" + debuffDays + " days**, characters cannot use healing or stamina items, cannot use healer services, and cannot join or go on expeditions. They must recover their strength."
            )
            .addFields(
                { name: '❤️ **__Party Hearts__**', value: '0', inline: true },
                { name: '🟩 **__Party Stamina__**', value: '0', inline: true },
                { name: '📍 **__Quadrant__**', value: locationStr, inline: true },
                { name: '🆔 **__Expedition ID__**', value: expeditionId, inline: true }
            )
            .setTimestamp();

        return { success: true, embed, party: result.party, villageLabel };
    } catch (err) {
        logger.error('EXPLORE', `handleExpeditionFailedFromWave: ${err.message}`);
        return { success: false, error: err.message };
    }
}

module.exports = {
    getCharacterItems,
    formatCharacterItems,
    calculateTotalHeartsAndStamina,
    recomputePartyTotals,
    restorePartyPoolOnGrottoExit,
    syncPartyMemberStats,
    pushProgressLog,
    hasDiscoveriesInQuadrant,
    hasUnpinnedDiscoveriesInQuadrant,
    updateDiscoveryGrottoStatus,
    markGrottoCleared,
    applyExpeditionFailedState,
    handleExpeditionFailedFromWave
};
