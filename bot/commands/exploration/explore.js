const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { SlashCommandBuilder } = require("@discordjs/builders");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { fetchAllItems, fetchItemsByMonster, createRelic, getCharacterInventoryCollection, fetchMonsterByName } = require('@/database/db.js');
const {
 calculateFinalValue,
 getMonstersByRegion,
 getExplorationMonsterFromList,
 createWeightedItemList,
} = require("../../modules/rngModule.js");
const { getEncounterOutcome } = require("../../modules/encounterModule.js");
const {
 generateVictoryMessage,
 generateDamageMessage,
 generateDefenseBuffMessage,
 generateAttackBuffMessage,
 generateFinalOutcomeMessage,
} = require("../../modules/flavorTextModule.js");
const { handleKO, healKoCharacter, useHearts } = require("../../modules/characterStatsModule.js");
const { triggerRaid, endExplorationRaidAsRetreat } = require("../../modules/raidModule.js");
const Raid = require("../../models/RaidModel.js");
const { addItemInventoryDatabase, removeItemInventoryDatabase } = require('@/utils/inventoryUtils.js');
const { addOldMapToCharacter, hasOldMap, hasAppraisedOldMap } = require('@/utils/oldMapUtils.js');
const { checkInventorySync } = require('@/utils/characterUtils.js');
const { enforceJail } = require('@/utils/jailCheck');
const Party = require('@/models/PartyModel.js');
const Character = require('@/models/CharacterModel.js');
const ItemModel = require('@/models/ItemModel.js');
const Square = require('@/models/mapModel.js');
const Grotto = require('@/models/GrottoModel.js');
const MonsterCamp = require('@/models/MonsterCampModel.js');
const MapModule = require('@/modules/mapModule.js');
const { rollGrottoTrialType, getTrialLabel } = require('@/data/grottoTrials.js');
const { getFailOutcome, getMissOutcome, getSuccessOutcome, getCompleteOutcome } = require('@/data/grottoTargetPracticeOutcomes.js');
const { generateGrottoMaze, getPathCellAt, getNeighbourCoords } = require('@/utils/grottoMazeGenerator.js');
const { getGrottoMazeOutcome, getGrottoMazeTrapOutcome } = require('@/data/grottoMazeOutcomes.js');
const {
 addExplorationStandardFields,
 addExplorationCommandsField,
 createExplorationItemEmbed,
 createExplorationMonsterEmbed,
 regionColors,
 regionImages,
 getExploreCommandId,
} = require("../../embeds/embeds.js");

const EXPLORATION_IMAGE_FALLBACK = "https://via.placeholder.com/100x100";
const { handleAutocomplete } = require("../../handlers/autocompleteHandler.js");
const { getRandomOldMap, OLD_MAPS_LINK } = require("../../data/oldMaps.js");
const { getRandomCampFlavor, getRandomSafeSpaceFlavor } = require("../../data/explorationMessages.js");
const { syncPartyMemberStats } = require("../../modules/exploreModule.js");
const logger = require("@/utils/logger.js");
const fs = require("fs");
const path = require("path");

/** Append a line to exploreStats.txt (bot/exploreStats.txt) for roll debugging. */
function appendExploreStat(line) {
 const filePath = path.join(__dirname, "..", "..", "exploreStats.txt");
 try {
  fs.appendFileSync(filePath, line + "\n");
 } catch (e) {
  logger.warn("EXPLORE", "exploreStats write failed: " + (e?.message || e));
 }
}

/**
 * Resolve loot for Chuchu monsters: always give Chuchu Jelly (or elemental variant)
 * instead of Chuchu Egg. Matches loot.js behavior.
 */
async function resolveExplorationMonsterLoot(monsterName, rawLootedItem) {
  if (!rawLootedItem) return null;
  if (!monsterName.includes("Chuchu")) {
    return { ...rawLootedItem, quantity: rawLootedItem.quantity ?? 1 };
  }

  let jellyType;
  if (monsterName.includes("Ice")) jellyType = "White Chuchu Jelly";
  else if (monsterName.includes("Fire")) jellyType = "Red Chuchu Jelly";
  else if (monsterName.includes("Electric")) jellyType = "Yellow Chuchu Jelly";
  else jellyType = "Chuchu Jelly";

  const quantity = monsterName.includes("Large") ? 3 : monsterName.includes("Medium") ? 2 : 1;
  const result = { ...rawLootedItem, itemName: jellyType, quantity };
  try {
    const jellyItem = await ItemModel.findOne({ itemName: jellyType }).select("emoji");
    if (jellyItem?.emoji) result.emoji = jellyItem.emoji;
  } catch (_) {}
  return result;
}

/**
 * Compute target practice modifiers from character (bow/slingshot, Hunter/Scout, weapon quality).
 * Returns { failReduction, missReduction } to subtract from base thresholds.
 */
function getTargetPracticeModifiers(character) {
  let failReduction = 0;
  let missReduction = 0;
  const name = character?.gearWeapon?.name?.toLowerCase() ?? "";
  const hasRangedWeapon = name.includes("bow") || name.includes("slingshot");
  const job = (character?.job || "").trim();
  const isHunterOrScout = ["Hunter", "Hunter (Looting)", "Scout"].includes(job);
  const modifierHearts = Number(character?.gearWeapon?.stats?.modifierHearts) || 0;
  if (hasRangedWeapon) {
    failReduction += 0.08;
    missReduction += 0.05;
  }
  if (isHunterOrScout) {
    failReduction += 0.05;
  }
  const qualityBonus = Math.min(0.05, modifierHearts * 0.01);
  failReduction += qualityBonus;
  missReduction += qualityBonus * 0.5;
  return { failReduction, missReduction };
}

// Region start squares (party returned here on full party KO)
const START_POINTS_BY_REGION = {
 eldin: { square: "H5", quadrant: "Q3" },
 lanayru: { square: "H8", quadrant: "Q2" },
 faron: { square: "F10", quadrant: "Q4" },
};

// Region to village (Raid model requires village: Rudania | Inariko | Vhintl)
const REGION_TO_VILLAGE = {
 eldin: "Rudania",
 lanayru: "Inariko",
 faron: "Vhintl",
};

// TODO: remove when done testing - treats tier 5+ monsters as regular encounters (no raid)
const DISABLE_EXPLORATION_RAIDS = false;

const EXPLORATION_CHEST_RELIC_CHANCE = 0.08;

/** Static chance per exploration roll outcome (must sum to 1). */
const EXPLORATION_OUTCOME_CHANCES = {
  monster: 0.18,
  item: 0.32,
  explored: 0.17,
  fairy: 0.05,
  chest: 0.03,
  old_map: 0.03,
  ruins: 0.04,
  relic: 0.02,
  camp: 0.06,
  monster_camp: 0.08,
  grotto: 0.02,
};

/** Base chance that a retreat attempt succeeds (tier 5+ exploration raids only). Each failed attempt adds 5% to the next, cap 95% (same as travel flee). */
const RETREAT_BASE_CHANCE = 0.5;
const RETREAT_BONUS_PER_FAIL = 0.05;
const RETREAT_CHANCE_CAP = 0.95;

/**
 * Builds an embed for when the party is out of stamina and stuck in the wild.
 * Recovery is via /explore camp only (no table rolls).
 * @param {object} party - Party document (for region color)
 * @param {string} [location] - Optional location string (e.g. "H5 Q3") for context
 * @returns {EmbedBuilder}
 */
function createStuckInWildEmbed(party, location) {
  return new EmbedBuilder()
    .setTitle("🏕️ Stuck in the wild — camp to recover")
    .setColor(regionColors[party?.region] || "#8B4513")
    .setDescription(
      `Your party has run out of stamina. **If you continue** (roll, move, secure, etc.), each action will **cost hearts** instead (1 heart = 1 stamina). **Or** use </explore camp:${getExploreCommandId()}> to recover stamina with no heart cost.\n\n` +
      `After recovering, use </explore roll:${getExploreCommandId()}> or </explore move:${getExploreCommandId()}> to continue the expedition.`
    )
    .setImage(EXPLORATION_IMAGE_FALLBACK)
    .setFooter({ text: location ? `Current location: ${location}` : "Expedition" });
}

const EXPLORE_STRUGGLE_CONTEXT = { commandName: "explore", operation: "struggle" };

/**
 * Pay action cost from party: stamina first, then hearts (struggle) for shortfall.
 * @param {object} party - Party document (mutated)
 * @param {number} characterIndex - Current actor index (for currentFirst order)
 * @param {number} staminaCost - Required cost (0, 1, 2, 3, or 5)
 * @param {{ order?: 'currentFirst'|'openerFirst', openerIndex?: number }} [options]
 * @returns {Promise<{ ok: boolean, reason?: string, staminaPaid?: number, heartsPaid?: number }>}
 */
async function payStaminaOrStruggle(party, characterIndex, staminaCost, options = {}) {
  if (!party || !party.characters || party.characters.length === 0) {
    return { ok: false, reason: "not_enough" };
  }
  const n = party.characters.length;
  const openerIndex = options.openerIndex != null && options.openerIndex >= 0 && options.openerIndex < n ? options.openerIndex : (party.currentTurn - 1 + n) % n;
  const order = options.order === "openerFirst"
    ? [openerIndex, ...party.characters.map((_, i) => i).filter((i) => i !== openerIndex)]
    : [characterIndex, ...party.characters.map((_, i) => i).filter((i) => i !== characterIndex)];

  const totalStamina = Math.max(0, party.totalStamina ?? 0);
  const totalHearts = Math.max(0, party.totalHearts ?? 0);
  const shortfall = Math.max(0, staminaCost - totalStamina);

  if (shortfall > 0 && totalHearts < shortfall) {
    return { ok: false, reason: "not_enough" };
  }

  if (shortfall === 0) {
    let remaining = staminaCost;
    for (const idx of order) {
      if (remaining <= 0) break;
      const slot = party.characters[idx];
      const charDoc = await Character.findById(slot._id);
      if (!charDoc) continue;
      const have = typeof charDoc.currentStamina === "number" ? charDoc.currentStamina : 0;
      const take = Math.min(remaining, have);
      if (take > 0) {
        charDoc.currentStamina = Math.max(0, have - take);
        await charDoc.save();
        slot.currentStamina = charDoc.currentStamina;
        remaining -= take;
      }
    }
    party.markModified("characters");
    party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
    await party.save();
    return { ok: true, staminaPaid: staminaCost, heartsPaid: 0 };
  }

  let remainingStamina = staminaCost;
  for (const idx of order) {
    if (remainingStamina <= 0) break;
    const slot = party.characters[idx];
    const charDoc = await Character.findById(slot._id);
    if (!charDoc) continue;
    const have = typeof charDoc.currentStamina === "number" ? charDoc.currentStamina : 0;
    const take = Math.min(remainingStamina, have);
    if (take > 0) {
      charDoc.currentStamina = Math.max(0, have - take);
      await charDoc.save();
      slot.currentStamina = charDoc.currentStamina;
      remainingStamina -= take;
    }
  }
  let remainingHearts = shortfall;
  const { fetchCharacterById } = require("@/database/db.js");
  for (const idx of order) {
    if (remainingHearts <= 0) break;
    const slot = party.characters[idx];
    const charDoc = await Character.findById(slot._id);
    if (!charDoc) continue;
    const currentH = typeof charDoc.currentHearts === "number" ? charDoc.currentHearts : 0;
    const take = Math.min(remainingHearts, currentH);
    if (take > 0) {
      try {
        await useHearts(charDoc._id, take, EXPLORE_STRUGGLE_CONTEXT);
      } catch (err) {
        logger.warn("EXPLORE", `payStaminaOrStruggle useHearts: ${err?.message || err}`);
      }
      const updated = await fetchCharacterById(slot._id);
      if (updated) {
        party.characters[idx].currentHearts = updated.currentHearts ?? 0;
      }
      remainingHearts -= take;
    }
  }
  party.markModified("characters");
  party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
  party.totalHearts = party.characters.reduce((s, c) => s + (c.currentHearts ?? 0), 0);
  await party.save();
  return { ok: true, staminaPaid: staminaCost - shortfall, heartsPaid: shortfall };
}

// Autocomplete can show "E402960 | Lanayru | started | H8 Q2"; value sent may be that full string. Use only the partyId (before first "|").
function normalizeExpeditionId(value) {
 if (!value || typeof value !== "string") return value;
 const trimmed = value.trim();
 const pipe = trimmed.indexOf("|");
 return pipe === -1 ? trimmed : trimmed.slice(0, pipe).trim();
}

async function handleExplorationChestOpen(interaction, expeditionId, location, openerCharacterIndex) {
 const party = await Party.findActiveByPartyId(expeditionId);
 if (!party) return null;

 const n = party.characters.length;
 if (!n) return null;
 const openerIndex = typeof openerCharacterIndex === "number" && openerCharacterIndex >= 0 && openerCharacterIndex < n
  ? openerCharacterIndex
  : (party.currentTurn - 1 + n) % n;
 const partyChar = party.characters[openerIndex];
 const character = await Character.findById(partyChar._id);
 if (!character) return null;

 const chestPayResult = await payStaminaOrStruggle(party, openerIndex, 1, { order: "openerFirst", openerIndex });
 if (!chestPayResult.ok) return { notEnoughStamina: true };

 party.currentTurn = (party.currentTurn + 1) % n;
 await party.save();

 const allItems = await fetchAllItems();
 logger.info("EXPLORE", `Chest open: location=${location}, allItems=${allItems?.length ?? 0}`);
 const lootLines = [];
 for (const pc of party.characters) {
  const char = await Character.findById(pc._id);
  if (!char) continue;
  let isRelic = Math.random() < EXPLORATION_CHEST_RELIC_CHANCE;
  if (isRelic && characterAlreadyFoundRelicThisExpedition(party, char.name)) isRelic = false;
  if (isRelic) {
   try {
    const savedRelic = await createRelic({
     name: "Unknown Relic",
     discoveredBy: char.name,
     characterId: char._id,
     discoveredDate: new Date(),
     locationFound: location,
     appraised: false,
    });
    logger.info("EXPLORE", `Chest item (relic): character=${char.name}, relicId=${savedRelic?.relicId || '?'}, item=Unknown Relic`);
    lootLines.push(`${char.name}: 🔸 Unknown Relic (${savedRelic?.relicId || '—'})`);
    pushProgressLog(party, char.name, "relic", `Found a relic in chest in ${location}; take to Artist/Researcher to appraise.`, { itemName: "Unknown Relic", emoji: "🔸" }, undefined);
   } catch (err) {
    logger.error("EXPLORE", `createRelic error (chest): ${err?.message || err}`);
    if (allItems && allItems.length > 0) {
     const fallback = allItems[Math.floor(Math.random() * allItems.length)];
     logger.info("EXPLORE", `Chest item (relic fallback): character=${char.name}, item=${fallback.itemName}`);
     try {
      await addItemInventoryDatabase(char._id, fallback.itemName, 1, interaction, "Exploration Chest");
      lootLines.push(`${char.name}: ${fallback.emoji || "📦"} ${fallback.itemName}`);
     } catch (_) {}
    }
   }
  } else {
   if (!allItems || allItems.length === 0) {
    logger.warn("EXPLORE", `Chest: no items available for ${char.name}`);
    lootLines.push(`${char.name}: (no items available)`);
    continue;
   }
   const item = allItems[Math.floor(Math.random() * allItems.length)];
   logger.info("EXPLORE", `Chest item: character=${char.name}, item=${item.itemName}`);
   try {
    await addItemInventoryDatabase(char._id, item.itemName, 1, interaction, "Exploration Chest");
    lootLines.push(`${char.name}: ${item.emoji || "📦"} ${item.itemName}`);
   } catch (err) {
    handleInteractionError(err, interaction, { source: "explore.js chest open" });
    lootLines.push(`${char.name}: (failed to add item)`);
   }
  }
 }

 const nextCharacter = party.characters[party.currentTurn];
 const lootEmbed = new EmbedBuilder()
  .setTitle("📦 **Chest opened!**")
  .setColor(regionColors[party.region] || "#00ff99")
  .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
 if (lootLines.length > 0) {
  lootEmbed.addFields({
   name: "Loot",
   value: lootLines.map((line) => `• ${line}`).join("\n"),
   inline: false,
  });
 } else {
  lootEmbed.setDescription("Nothing found inside.");
 }
 lootEmbed.setFooter({ text: "−1 stamina" });
 addExplorationStandardFields(lootEmbed, {
  party,
  expeditionId,
  location,
  nextCharacter: nextCharacter ?? null,
  showNextAndCommands: true,
  showRestSecureMove: false,
  ruinRestRecovered: 0,
 });
 const lootSummary = lootLines.length > 0
  ? lootLines.map((line) => line.trim()).join(" · ")
  : "Nothing found.";
 const chestCostsForLog = { ...(chestPayResult.staminaPaid > 0 && { staminaLost: chestPayResult.staminaPaid }), ...(chestPayResult.heartsPaid > 0 && { heartsLost: chestPayResult.heartsPaid }) };
 pushProgressLog(party, character.name, "chest_open", `Opened chest in **${location}**. **Found:** ${lootSummary}`, undefined, Object.keys(chestCostsForLog).length ? chestCostsForLog : undefined);
 return { lootEmbed, party, nextCharacter };
}

/** Roll outcomes that are "discoveries" (reportable on map); reroll when square at cap or applying reduced chance. */
const SPECIAL_OUTCOMES = ["monster_camp", "ruins", "grotto", "relic"];
/** Outcomes to count toward the 3-per-square limit. Only when user chooses Yes: monster_camp, grotto, relic, ruins. monster_camp_skipped is NOT included so "No" does not count. */
const DISCOVERY_COUNT_OUTCOMES = ["monster_camp", "grotto", "relic", "ruins", "ruins_found"];
/** When leaving a square, clear these from progressLog if not reported (include ruins_found). */
const DISCOVERY_CLEANUP_OUTCOMES = ["monster_camp", "ruins", "grotto", "relic", "ruins_found"];
const MAX_SPECIAL_EVENTS_PER_SQUARE = 3;
/** When square already has 1+ discovery, keep a discovery outcome only this fraction of the time (75% less chance). */
const DISCOVERY_REDUCE_CHANCE_WHEN_ANY = 0.25;

/** Parse square from progress message like "Found X in H8 Q2; ..." -> "H8". */
const LOC_IN_MESSAGE_RE = /\s+in\s+([A-J](?:[1-9]|1[0-2]))\s+(Q[1-4])/i;


/** Outcome of the most recent progress log entry that applies to the given (square, quadrant). Used to know if Move was prompted. */
function getLastProgressOutcomeForLocation(party, square, quadrant) {
 const sq = String(square || "").trim().toUpperCase();
 const q = String(quadrant || "").trim().toUpperCase();
 const loc = `${sq} ${q}`;
 const log = party.progressLog;
 if (!log || !log.length) return null;
 for (let i = log.length - 1; i >= 0; i--) {
  const e = log[i];
  const msg = e.message || "";
  let entryLoc = null;
  if (e.outcome === "explored") {
   const m = msg.match(/\(([A-J](?:[1-9]|1[0-2])\s+Q[1-4])\)/i);
   if (m) entryLoc = m[1].trim().toUpperCase();
  } else if (e.outcome === "move") {
   const m = msg.match(/\*\*(\S+ \S+)\*\*/);
   if (m) entryLoc = m[1].trim().toUpperCase();
  } else if (e.outcome === "secure") {
   const m = msg.match(/Secured\s+(\S+\s+Q[1-4])/i);
   if (m) entryLoc = m[1].trim().toUpperCase();
  } else {
   // Outcomes like monster, raid, item, fairy, etc. — they occur at a location but do NOT prompt Move
   const mIn = msg.match(LOC_IN_MESSAGE_RE);
   if (mIn && mIn[1] && mIn[2]) {
    entryLoc = `${String(mIn[1]).trim().toUpperCase()} ${String(mIn[2]).trim().toUpperCase()}`;
   } else {
    const mBold = msg.match(/\*\*(\S+ \S+)\*\*/);
    if (mBold) entryLoc = mBold[1].trim().toUpperCase();
   }
  }
  if (entryLoc === loc) return e.outcome;
 }
 return null;
}

/** Normalize square id for comparison (e.g. "H8" vs "h8"). */
function normalizeSquareId(square) {
 return String(square || "").trim().toUpperCase();
}

function countSpecialEventsInSquare(party, square) {
 if (!party.progressLog || !Array.isArray(party.progressLog)) return 0;
 const sq = normalizeSquareId(square);
 if (!sq) return 0;
 let count = 0;
 for (const e of party.progressLog) {
  if (!DISCOVERY_COUNT_OUTCOMES.includes(e.outcome)) continue;
  const msg = e.message || "";
  const m = LOC_IN_MESSAGE_RE.exec(msg);
  if (!m || !m[1]) continue;
  if (String(m[1]).trim().toUpperCase() !== sq) continue;
  count += 1;
 }
 return count;
}

/** Each square can have at most one grotto. Returns true if this square already has a grotto (from this party's progressLog or from the map/Square). */
function hasGrottoInSquare(party, square, squareDoc) {
 const sq = normalizeSquareId(square);
 if (!sq) return false;
 // Map: only use squareDoc if it refers to this square (avoid wrong-doc false positives)
 if (squareDoc && squareDoc.quadrants && Array.isArray(squareDoc.quadrants)) {
  const docSquareId = normalizeSquareId(squareDoc.squareId);
  if (docSquareId === sq) {
   for (const q of squareDoc.quadrants) {
    const discoveries = q.discoveries || [];
    if (!Array.isArray(discoveries)) continue;
    for (const d of discoveries) {
     if (d && String(d.type).toLowerCase() === "grotto") return true;
    }
   }
  }
 }
 // Party progressLog: only outcome "grotto" (not skipped), and message must match this square
 if (party.progressLog && Array.isArray(party.progressLog)) {
  for (const e of party.progressLog) {
   if (e.outcome !== "grotto") continue;
   const m = LOC_IN_MESSAGE_RE.exec(e.message || "");
   if (!m || !m[1]) continue;
   if (String(m[1]).trim().toUpperCase() !== sq) continue;
   return true;
  }
 }
 return false;
}

/** True if this character has already found a relic this expedition (one relic per character per run to prevent stacking). */
function characterAlreadyFoundRelicThisExpedition(party, characterName) {
 if (!party.progressLog || !Array.isArray(party.progressLog)) return false;
 return party.progressLog.some((e) => e.outcome === "relic" && (e.characterName || "") === (characterName || ""));
}

function pushProgressLog(party, characterName, outcome, message, loot, costs, at) {
 if (!party.progressLog) party.progressLog = [];
 const entry = {
  at: at instanceof Date ? at : new Date(),
  characterName: characterName || "Unknown",
  outcome,
  message: message || "",
 };
 if (loot && (loot.itemName || loot.emoji)) {
  entry.loot = { itemName: loot.itemName || "", emoji: loot.emoji || "" };
 }
 if (costs) {
  if (typeof costs.heartsLost === "number" && costs.heartsLost > 0) entry.heartsLost = costs.heartsLost;
  if (typeof costs.staminaLost === "number" && costs.staminaLost > 0) entry.staminaLost = costs.staminaLost;
  if (typeof costs.heartsRecovered === "number" && costs.heartsRecovered > 0) entry.heartsRecovered = costs.heartsRecovered;
  if (typeof costs.staminaRecovered === "number" && costs.staminaRecovered > 0) entry.staminaRecovered = costs.staminaRecovered;
 }
 party.progressLog.push(entry);
}

/** Reportable outcomes that get logged to the map path (Square.quadrants[].discoveries). */
const REPORTABLE_DISCOVERY_OUTCOMES = new Set(["monster_camp", "ruins", "grotto", "relic"]);

/** Push a discovery to the Square document so it appears on the map path and can be pinned. */
async function pushDiscoveryToMap(party, outcomeType, at, userId) {
 const squareId = (party.square && String(party.square).trim()) || "";
 const quadrantId = (party.quadrant && String(party.quadrant).trim()) || "";
 if (!squareId || !quadrantId) return;
 const discoveryKey = `${outcomeType}|${squareId}|${quadrantId}|${(at instanceof Date ? at : new Date()).toISOString()}`;
 const discovery = {
  type: outcomeType,
  discoveredBy: userId || party.leaderId || "",
  discoveredAt: at instanceof Date ? at : new Date(),
  discoveryKey,
 };
 await Square.updateOne(
  { squareId },
  { $push: { "quadrants.$[q].discoveries": discovery } },
  { arrayFilters: [{ "q.quadrantId": quadrantId }] }
 );
}

/** Find a party character who has Goddess Plume: first in loadout, then in inventory. Returns { characterIndex, character, source: 'loadout'|'inventory' } or null. */
async function findGoddessPlumeHolder(party) {
 for (let ci = 0; ci < (party.characters || []).length; ci++) {
  const slot = party.characters[ci];
  const items = slot.items || [];
  if (items.some((it) => String(it.itemName || "").toLowerCase() === "goddess plume")) {
   const character = await Character.findById(slot._id);
   if (character) return { characterIndex: ci, character, source: "loadout" };
  }
 }
 for (let ci = 0; ci < (party.characters || []).length; ci++) {
  const slot = party.characters[ci];
  const character = await Character.findById(slot._id);
  if (!character) continue;
  try {
   const collection = await getCharacterInventoryCollection(character.name);
   const entry = await collection.findOne({
    itemName: { $regex: /^Goddess Plume$/i },
    quantity: { $gte: 1 },
   });
   if (entry) return { characterIndex: ci, character, source: "inventory" };
  } catch (_) {
   /* skip */
  }
 }
 return null;
}

/** Cleanse grotto (Yes): check plume + 1 stamina, deduct, create Grotto, roll trial; blessing = immediate spirit orbs. */
async function handleGrottoCleanse(i, msg, party, expeditionId, characterIndex, location, disabledRow, nextCharacter, ruinRestRecovered) {
 const freshParty = await Party.findActiveByPartyId(expeditionId);
 if (!freshParty) {
  await i.followUp({ embeds: [new EmbedBuilder().setTitle("Error").setDescription("Expedition not found.").setColor(0xff0000)], ephemeral: true }).catch(() => {});
  return;
 }
 const grottoPayResult = await payStaminaOrStruggle(freshParty, characterIndex, 1, { order: "currentFirst" });
 if (!grottoPayResult.ok) {
  const partyTotalStamina = Math.max(0, freshParty.totalStamina ?? 0);
  const partyTotalHearts = Math.max(0, freshParty.totalHearts ?? 0);
  const noStaminaEmbed = new EmbedBuilder()
   .setTitle("❌ Not enough stamina or hearts to cleanse the grotto")
   .setColor(regionColors[freshParty.region] || "#00ff99")
   .setDescription("Party has " + partyTotalStamina + " 🟩 and " + partyTotalHearts + " ❤ (need 1 total). **Camp** to recover, or use hearts to **Struggle**. Mark the grotto for later otherwise.")
   .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
  addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
  await msg.edit({ embeds: [noStaminaEmbed], components: [disabledRow] }).catch(() => {});
  await i.followUp({ embeds: [noStaminaEmbed], ephemeral: true }).catch(() => {});
  return;
 }
 const plumeHolder = await findGoddessPlumeHolder(freshParty);
 if (!plumeHolder) {
  const noPlumeEmbed = new EmbedBuilder()
   .setTitle("❌ No Goddess Plume to cleanse the grotto")
   .setColor(regionColors[freshParty.region] || "#00ff99")
   .setDescription("No party member has a Goddess Plume in their loadout or inventory. Mark the grotto for later or continue exploring.")
   .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
  addExplorationStandardFields(noPlumeEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
  await msg.edit({ embeds: [noPlumeEmbed], components: [disabledRow] }).catch(() => {});
  await i.followUp({ embeds: [noPlumeEmbed], ephemeral: true }).catch(() => {});
  return;
 }
 const { character: cleanseCharacter, source: plumeSource } = plumeHolder;
 if (plumeSource === "loadout") {
  const idx = (freshParty.characters[plumeHolder.characterIndex].items || []).findIndex((it) => String(it.itemName || "").toLowerCase() === "goddess plume");
  if (idx !== -1) {
   freshParty.characters[plumeHolder.characterIndex].items.splice(idx, 1);
   freshParty.markModified("characters");
  }
 } else {
  try {
   await removeItemInventoryDatabase(cleanseCharacter._id, "Goddess Plume", 1, i, "Grotto cleanse");
  } catch (err) {
   handleInteractionError(err, i, { source: "explore.js grotto cleanse remove plume" });
   await msg.edit({ components: [disabledRow] }).catch(() => {});
   return;
  }
 }
 // Cost already applied by payStaminaOrStruggle

 const at = new Date();
 const squareId = (freshParty.square && String(freshParty.square).trim()) || "";
 const quadrantId = (freshParty.quadrant && String(freshParty.quadrant).trim()) || "";
 const discoveryKey = `grotto|${squareId}|${quadrantId}|${at.toISOString()}`;
 await pushDiscoveryToMap(freshParty, "grotto", at, i.user?.id);
 const grottoCostsForLog = { ...(grottoPayResult.staminaPaid > 0 && { staminaLost: grottoPayResult.staminaPaid }), ...(grottoPayResult.heartsPaid > 0 && { heartsLost: grottoPayResult.heartsPaid }) };
 pushProgressLog(freshParty, cleanseCharacter.name, "grotto_cleansed", `Cleansed grotto in ${location} (1 Goddess Plume + 1 stamina).`, undefined, Object.keys(grottoCostsForLog).length ? grottoCostsForLog : { staminaLost: 1 }, at);

 const trialType = rollGrottoTrialType();
 const grottoDoc = new Grotto({
  squareId,
  quadrantId,
  discoveryKey,
  sealed: false,
  trialType,
  partyId: expeditionId,
  unsealedAt: at,
  unsealedBy: cleanseCharacter.name,
 });
 await grottoDoc.save();

 if (trialType === "blessing") {
  for (const slot of freshParty.characters) {
   try {
    await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, i, "Grotto - Blessing");
   } catch (err) {
    logger.warn("EXPLORE", `Grotto blessing: failed to add Spirit Orb to ${slot.name}: ${err?.message || err}`);
   }
  }
  grottoDoc.completedAt = new Date();
  await grottoDoc.save();
  pushProgressLog(freshParty, cleanseCharacter.name, "grotto_blessing", `Blessing trial: each party member received a Spirit Orb.`, undefined, undefined, new Date());
  await freshParty.save();
  const blessingEmbed = new EmbedBuilder()
   .setTitle("🗺️ **Expedition: Grotto cleansed — Blessing!**")
   .setColor(regionColors[freshParty.region] || "#00ff99")
   .setDescription(
    `**${cleanseCharacter.name}** used a Goddess Plume and 1 stamina to cleanse the grotto in **${location}**.\n\n` +
    "The grotto held a simple blessing. Everyone received a **Spirit Orb**!\n\n" +
    `↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`
   )
   .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
  addExplorationStandardFields(blessingEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
  await msg.edit({ embeds: [blessingEmbed], components: [disabledRow] }).catch(() => {});
  return;
 }

 const trialLabel = getTrialLabel(trialType);
 const continueEmbed = new EmbedBuilder()
  .setTitle("🗺️ **Expedition: Grotto cleansed!**")
  .setColor(regionColors[freshParty.region] || "#00ff99")
  .setDescription(
   `**${cleanseCharacter.name}** used a Goddess Plume and 1 stamina to cleanse the grotto in **${location}**.\n\n` +
   `**Trial: ${trialLabel}**\n\n` +
   `Use </explore grotto continue:${getExploreCommandId()}> to enter the trial (id: \`${expeditionId}\`, charactername: **${nextCharacter?.name ?? "—"}**).`
  )
  .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
 addExplorationStandardFields(continueEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
 await msg.edit({ embeds: [continueEmbed], components: [disabledRow] }).catch(() => {});
}

/** When party reveals or travels through a blighted quadrant, increment exposure (stacks on repeated travel). */
async function applyBlightExposure(party, square, quadrant, reason, characterName) {
 const prev = typeof party.blightExposure === "number" ? party.blightExposure : 0;
 party.blightExposure = prev + 1;
 party.markModified("blightExposure");
 const location = `${square} ${quadrant}`;
 pushProgressLog(
  party,
  characterName || "Party",
  "blight_exposure",
  `Blight exposure +1 (${reason}) at ${location}. Total exposure: ${party.blightExposure}.`,
  undefined,
  undefined
 );
 await party.save();
}

// Village name for character.currentVillage (lowercase to match join/explore)
const REGION_TO_VILLAGE_LOWER = { eldin: "rudania", lanayru: "inariko", faron: "vhintl" };
const EXPLORATION_KO_DEBUFF_DAYS = 7;

async function handleExpeditionFailed(party, interaction) {
 const start = START_POINTS_BY_REGION[party.region];
 if (!start) {
  await interaction.editReply("Expedition failed but could not resolve start location for region.");
  return;
 }

 const targetVillage = REGION_TO_VILLAGE_LOWER[party.region] || "rudania";
 const debuffEndDate = new Date(Date.now() + EXPLORATION_KO_DEBUFF_DAYS * 24 * 60 * 60 * 1000);

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

 // Reset any quadrants this expedition marked as Explored back to Unexplored
 const exploredThisRun = party.exploredQuadrantsThisRun || [];
 if (exploredThisRun.length > 0) {
  for (const { squareId, quadrantId } of exploredThisRun) {
   if (squareId && quadrantId) {
    const squareIdRegex = new RegExp(`^${String(squareId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    await Square.updateOne(
     { squareId: squareIdRegex, "quadrants.quadrantId": quadrantId },
     { $set: { "quadrants.$[q].status": "unexplored", "quadrants.$[q].exploredBy": "", "quadrants.$[q].exploredAt": null } },
     { arrayFilters: [{ "q.quadrantId": quadrantId }] }
    ).catch((err) => logger.warn("EXPLORE", `Failed to reset quadrant to unexplored: ${err?.message}`));
   }
  }
 }

 party.square = start.square;
 party.quadrant = start.quadrant;
 party.status = "completed";
 party.totalHearts = 0;
 party.totalStamina = 0;
 party.gatheredItems = [];
 for (const c of party.characters) {
  c.currentHearts = 0;
  c.currentStamina = 0;
  c.items = [];
 }
 await party.save();

 const villageLabel = (targetVillage || "").charAt(0).toUpperCase() + (targetVillage || "").slice(1);
 const regionLabel = (party.region || "").charAt(0).toUpperCase() + (party.region || "").slice(1);
 const locationStr = `${start.square} ${start.quadrant} (${regionLabel} start)`;
 const embed = new EmbedBuilder()
  .setTitle("💀 **Expedition: Expedition Failed — Party KO'd**")
  .setColor(0x8b0000)
  .setDescription(
   "The party lost all collective hearts. The expedition has failed.\n\n" +
   "**Return:** Party wakes in **" + villageLabel + "** (the village you began from) with 0 hearts and 0 stamina.\n\n" +
   "**Items:** All items brought on the expedition and any found during the expedition are lost.\n\n" +
   "**Map:** Any quadrants this expedition had marked as Explored return to Unexplored status.\n\n" +
   "**Recovery debuff:** For **" + EXPLORATION_KO_DEBUFF_DAYS + " days**, characters cannot use healing or stamina items, cannot use healer services, and cannot join or go on expeditions. They must recover their strength. (A future boosting perk may allow removing this debuff.)"
  )
  .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
 addExplorationStandardFields(embed, {
  party: { partyId: party.partyId, totalHearts: 0, totalStamina: 0 },
  expeditionId: party.partyId,
  location: locationStr,
  nextCharacter: null,
  showNextAndCommands: false,
  showRestSecureMove: false,
 });
 await interaction.editReply({ embeds: [embed] });
}

// Helper: get adjacent quadrants from map module (square+quadrant format from map model)
function getAdjacentQuadrants(currentSquare, currentQuadrant) {
 const mapModule = new MapModule();
 try {
  const sq = String(currentSquare || "").trim();
  const quad = String(currentQuadrant || "").trim().toUpperCase();
  if (!sq || !quad) return [];
  return mapModule.getAdjacentSquares(sq, quad) || [];
 } catch {
  return [];
 }
}

// ------------------- Expedition Command Definition -------------------
module.exports = {
 data: new SlashCommandBuilder()
  .setName("explore")
  .setDescription("Manage exploration parties")
  .addSubcommand((subcommand) =>
   subcommand
    .setName("roll")
    .setDescription("Roll for an encounter (costs 1 stamina, or 2 in unexplored quad; 0 in secured)")
    .addStringOption((option) =>
     option.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Your character name")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("secure")
    .setDescription("Secure the current quadrant (costs resources)")
    .addStringOption((option) =>
     option.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Your character name")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("move")
    .setDescription("Move to an adjacent quadrant")
    .addStringOption((option) =>
     option.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Your character name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("quadrant")
      .setDescription("Quadrant to move to (adjacent to current location)")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("item")
    .setDescription("Use a healing item from your expedition loadout")
    .addStringOption((option) =>
     option.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Your character name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("item")
      .setDescription("Item to use (healing items only)")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("camp")
    .setDescription("Set up camp for extended rest")
    .addStringOption((option) =>
     option.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Your character name")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("end")
    .setDescription("End expedition and return home (only at starting quadrant)")
    .addStringOption((option) =>
     option.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Your character name")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("retreat")
    .setDescription("Attempt to retreat from a tier 5+ monster battle (1 stamina per attempt, not guaranteed)")
    .addStringOption((option) =>
     option.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Your character name")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommandGroup((group) =>
   group
    .setName("grotto")
    .setDescription("Grotto trial actions")
    .addSubcommand((sub) =>
     sub
      .setName("continue")
      .setDescription("Enter or continue the grotto trial after cleansing")
      .addStringOption((o) => o.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("charactername").setDescription("Your character name").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
     sub
      .setName("targetpractice")
      .setDescription("Take your turn in a Target Practice grotto trial")
      .addStringOption((o) => o.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("charactername").setDescription("Your character name").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
     sub
      .setName("puzzle")
      .setDescription("Submit an offering for a Puzzle grotto (mod will approve or deny)")
      .addStringOption((o) => o.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("charactername").setDescription("Your character name").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("items").setDescription("Item(s) offered (comma-separated)").setRequired(true))
      .addStringOption((o) => o.setName("description").setDescription("Optional flavor text"))
    )
    .addSubcommand((sub) =>
     sub
      .setName("maze")
      .setDescription("Maze direction or wall roll (direction: left/right/straight/back)")
      .addStringOption((o) => o.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("charactername").setDescription("Your character name").setRequired(true).setAutocomplete(true))
      .addStringOption((o) =>
       o
        .setName("action")
        .setDescription("Direction or 'wall' for Song of Scrying roll")
        .setRequired(true)
        .addChoices(
         { name: "Left", value: "left" },
         { name: "Right", value: "right" },
         { name: "Straight", value: "straight" },
         { name: "Back", value: "back" },
         { name: "Wall (roll)", value: "wall" }
        )
      )
    )
    .addSubcommand((sub) =>
     sub
      .setName("travel")
      .setDescription("Return to a known grotto (costs 2 stamina per party member)")
      .addStringOption((o) => o.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("charactername").setDescription("Your character name").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("location").setDescription("Square and quadrant, e.g. H8 Q3").setRequired(true))
    )
  ),

 // ------------------- Command Execution Logic -------------------
 async execute(interaction) {
  try {
   await interaction.deferReply();

   const subcommandGroup = interaction.options.getSubcommandGroup(false);
   const subcommand = interaction.options.getSubcommand(false);
   logger.info("EXPLORE", `Executing subcommand: ${subcommandGroup || ""} ${subcommand}, User ID: ${interaction.user.id}`);

   // ------------------- Grotto subcommands -------------------
   if (subcommandGroup === "grotto") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const userId = interaction.user.id;
    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) return interaction.editReply("Expedition ID not found.");
    const character = await Character.findOne({ name: characterName, userId });
    if (!character) return interaction.editReply("Character not found or you do not own this character.");
    const location = `${party.square} ${party.quadrant}`;
    const squareId = (party.square && String(party.square).trim()) || "";
    const quadrantId = (party.quadrant && String(party.quadrant).trim()) || "";

    if (subcommand === "continue") {
     const grotto = await Grotto.findOne({ squareId, quadrantId, sealed: false, partyId: expeditionId }).sort({ unsealedAt: -1 });
     if (!grotto) {
      return interaction.editReply(
       "No active grotto trial at this location for this expedition. Make sure you have cleansed a grotto here and are in the same square and quadrant."
      );
     }
     if (grotto.trialType === "puzzle" && grotto.puzzleState?.offeringSubmitted && grotto.puzzleState?.offeringApproved === true && !grotto.completedAt) {
      grotto.completedAt = new Date();
      await grotto.save();
      for (const slot of party.characters) {
       try {
        await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Puzzle");
       } catch (err) {
        logger.warn("EXPLORE", `Grotto puzzle: failed to add Spirit Orb: ${err?.message || err}`);
       }
      }
      pushProgressLog(party, character.name, "grotto_puzzle_success", "Puzzle approved. Each party member received a Spirit Orb.", undefined, undefined, new Date());
      await party.save();
      return interaction.editReply({
       embeds: [
        new EmbedBuilder()
         .setTitle("🗺️ **Grotto: Puzzle — Approved!**")
         .setColor(regionColors[party.region] || "#00ff99")
         .setDescription("The offering was approved. Everyone receives a **Spirit Orb**!")
         .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK),
       ],
      });
     }
     if (grotto.trialType === "puzzle" && grotto.puzzleState?.offeringSubmitted && grotto.puzzleState?.offeringApproved === false) {
      return interaction.editReply("The puzzle offering was denied. Items offered are still consumed. The grotto trial is complete with no Spirit Orbs.");
     }
     const trialLabel = getTrialLabel(grotto.trialType);
     const instructions = {
      target_practice: "Establish turn order. Use </explore grotto targetpractice> on each turn until the party succeeds (required successes) or one character fails.",
      puzzle: "Discuss with your group. Submit an offering with </explore grotto puzzle> (items and optional description). A mod will approve or deny.",
      test_of_power: "Boss battle — no backing out. Prepare and fight; spirit orbs on victory. (Test of Power flow uses raid-style encounter; ensure party is ready.)",
      maze: "Use </explore grotto maze> with direction (left/right/straight/back) or **Wall** for Song of Scrying.",
     };
     const text = instructions[grotto.trialType] || `Complete the ${trialLabel} trial.`;
     const embed = new EmbedBuilder()
      .setTitle(`🗺️ **Grotto: ${trialLabel}**`)
      .setColor(regionColors[party.region] || "#00ff99")
      .setDescription(`Party is at grotto in **${location}**.\n\n**Trial:** ${trialLabel}\n\n${text}`)
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(embed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
     return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "targetpractice") {
     const grotto = await Grotto.findOne({ squareId, quadrantId, sealed: false, partyId: expeditionId }).sort({ unsealedAt: -1 });
     if (!grotto || grotto.trialType !== "target_practice") {
      return interaction.editReply("No Target Practice grotto at this location for this expedition.");
     }
     const TARGET_SUCCESSES = 3;
     const BASE_FAIL = 0.15;
     const BASE_MISS = 0.25;
     if (grotto.targetPracticeState.failed) {
      return interaction.editReply("The party already failed this Target Practice trial. You can return to the grotto later on another expedition.");
     }
     const { failReduction, missReduction } = getTargetPracticeModifiers(character);
     const failThreshold = Math.max(0.04, BASE_FAIL - failReduction);
     const missThreshold = Math.max(0.10, BASE_MISS - missReduction);
     const roll = Math.random();
     const cmdId = getExploreCommandId();
     const cmdRoll = `</explore roll:${cmdId}>`;
     const cmdTargetPractice = `</explore grotto targetpractice:${cmdId}>`;

     if (roll < failThreshold) {
      grotto.targetPracticeState.failed = true;
      await grotto.save();
      pushProgressLog(party, character.name, "grotto_target_fail", `Target Practice: ${character.name} failed the roll. Party may return later.`, undefined, undefined, new Date());
      await party.save();
      const outcome = getFailOutcome();
      const flavor = outcome.flavor.replace(/\{char\}/g, character.name);
      const desc = `The blimp looms before you. ${flavor}\n\n↳ **${outcome.ctaHint}** ➾ ${cmdRoll}`;
      const embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Target Practice — Failed**")
       .setColor(0x8b0000)
       .setDescription(desc)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(embed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
      return interaction.editReply({ embeds: [embed] });
     }

     if (roll < failThreshold + missThreshold) {
      const outcome = getMissOutcome();
      const flavor = outcome.flavor.replace(/\{char\}/g, character.name);
      const desc = `The blimp looms before you. ${flavor}\n\n↳ **${outcome.ctaHint}** ➾ ${cmdTargetPractice}`;
      const embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Target Practice**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(desc)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(embed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
      return interaction.editReply({ embeds: [embed] });
     }

     const newSuccesses = (grotto.targetPracticeState.successCount || 0) + 1;
     grotto.targetPracticeState.successCount = newSuccesses;
     const turnIndex = (grotto.targetPracticeState.turnIndex || 0) + 1;
     grotto.targetPracticeState.turnIndex = turnIndex;
     if (newSuccesses >= TARGET_SUCCESSES) {
      grotto.completedAt = new Date();
      await grotto.save();
      for (const slot of party.characters) {
       try {
        await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Target Practice");
       } catch (err) {
        logger.warn("EXPLORE", `Grotto target practice: failed to add Spirit Orb: ${err?.message || err}`);
       }
      }
      pushProgressLog(party, character.name, "grotto_target_success", `Target Practice completed. Each party member received a Spirit Orb.`, undefined, undefined, new Date());
      await party.save();
      const outcome = getCompleteOutcome();
      const flavor = outcome.flavor.replace(/\{char\}/g, character.name);
      const desc = `The blimp looms before you. ${flavor}\n\n↳ **${outcome.ctaHint}** ➾ ${cmdRoll}`;
      const embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Target Practice — Success!**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(desc)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(embed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
      return interaction.editReply({ embeds: [embed] });
     }
     await grotto.save();
     const nextIdx = turnIndex % party.characters.length;
     const nextChar = party.characters[nextIdx];
     const outcome = getSuccessOutcome();
     const flavor = outcome.flavor.replace(/\{char\}/g, character.name);
     const desc = `The blimp looms before you. ${flavor}\n\nSuccesses: ${newSuccesses}/${TARGET_SUCCESSES}. Next: **${nextChar?.name ?? "—"}**.\n\n↳ **${outcome.ctaHint}** ➾ ${cmdTargetPractice}`;
     const embed = new EmbedBuilder()
      .setTitle("🗺️ **Grotto: Target Practice**")
      .setColor(regionColors[party.region] || "#00ff99")
      .setDescription(desc)
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(embed, { party, expeditionId, location, nextCharacter: nextChar ?? null, showNextAndCommands: true, showRestSecureMove: false });
     return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "puzzle") {
     const grotto = await Grotto.findOne({ squareId, quadrantId, sealed: false, partyId: expeditionId }).sort({ unsealedAt: -1 });
     if (!grotto || grotto.trialType !== "puzzle") {
      return interaction.editReply("No Puzzle grotto at this location for this expedition.");
     }
     if (grotto.puzzleState.offeringSubmitted) {
      return interaction.editReply("An offering has already been submitted for this grotto. Await mod approval or denial.");
     }
     const itemsStr = interaction.options.getString("items");
     const description = interaction.options.getString("description") || "";
     const itemNames = (itemsStr || "").split(",").map((s) => s.trim()).filter(Boolean);
     if (itemNames.length === 0) return interaction.editReply("Provide at least one item name in the `items` option.");
     grotto.puzzleState.offeringSubmitted = true;
     grotto.puzzleState.offeringItems = itemNames;
     grotto.puzzleState.offeringDescription = description;
     grotto.puzzleState.offeringBy = character.name;
     grotto.puzzleState.offeredAt = new Date();
     await grotto.save();
     pushProgressLog(party, character.name, "grotto_puzzle_offering", `Puzzle offering submitted: ${itemNames.join(", ")}. Await mod approval.`, undefined, undefined, new Date());
     await party.save();
     return interaction.editReply({
      embeds: [
       new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Puzzle — Offering Submitted**")
        .setColor(regionColors[party.region] || "#00ff99")
        .setDescription(
         `**${character.name}** submitted an offering: **${itemNames.join(", ")}**${description ? `\n\nDescription: ${description}` : ""}\n\nA mod will approve or deny. If approved, the party receives Spirit Orbs. If denied, items are still consumed.`
        )
        .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK),
      ],
     });
    }

    if (subcommand === "maze") {
     const grotto = await Grotto.findOne({ squareId, quadrantId, sealed: false, partyId: expeditionId }).sort({ unsealedAt: -1 });
     if (!grotto || grotto.trialType !== "maze") {
      return interaction.editReply("No Maze grotto at this location for this expedition.");
     }
     const layout = grotto.mazeState?.layout;
     const hasLayout = layout && layout.pathCells && layout.pathCells.length > 0 && layout.matrix && layout.matrix.length > 0;
     if (!hasLayout) {
      const generated = generateGrottoMaze({ width: 12, height: 12, entryType: 'diagonal' });
      if (!generated.pathCells || generated.pathCells.length === 0) {
       return interaction.editReply("Failed to generate the maze. Please try again.");
      }
      const startCell = generated.pathCells.find((c) => c.type === 'start');
      grotto.mazeState = grotto.mazeState || {};
      grotto.mazeState.layout = {
       matrix: generated.matrix,
       width: generated.width,
       height: generated.height,
       entryNodes: generated.entryNodes,
       pathCells: generated.pathCells,
      };
      grotto.mazeState.currentNode = startCell ? startCell.key || `${startCell.x},${startCell.y}` : `${generated.entryNodes.start.x},${generated.entryNodes.start.y}`;
      grotto.mazeState.facing = 's';
      grotto.mazeState.steps = [];
      grotto.mazeState.openedChests = [];
      await grotto.save();
     }
     const action = interaction.options.getString("action");
     const matrix = grotto.mazeState.layout?.matrix || [];
     const pathCells = grotto.mazeState.layout?.pathCells || [];
     const currentNode = grotto.mazeState.currentNode || '';
     const facing = grotto.mazeState.facing || 's';

     if (action === "wall") {
      const roll = Math.floor(Math.random() * 6) + 1;
      const outcome = getGrottoMazeOutcome(roll);
      if (outcome.heartsLost > 0 && character._id) {
       try {
        await useHearts(character._id, outcome.heartsLost, { commandName: 'explore', operation: 'grotto_maze_trap' });
       } catch (err) {
        logger.warn("EXPLORE", `Grotto maze pit trap useHearts: ${err?.message || err}`);
       }
       const charDoc = await Character.findById(character._id).select('currentHearts');
       if (charDoc) {
        const idx = party.characters.findIndex((c) => c._id && c._id.toString() === character._id.toString());
        if (idx !== -1) party.characters[idx].currentHearts = charDoc.currentHearts;
        party.totalHearts = party.characters.reduce((s, c) => s + (c.currentHearts ?? 0), 0);
        party.markModified("characters");
        await party.save();
       }
      }
      if (outcome.staminaCost > 0) {
       let remaining = outcome.staminaCost;
       const rollCostOrder = party.characters.map((_, i) => i);
       for (const idx of rollCostOrder) {
        if (remaining <= 0) break;
        const slot = party.characters[idx];
        const charDoc = await Character.findById(slot._id);
        if (!charDoc) continue;
        const have = typeof charDoc.currentStamina === "number" ? charDoc.currentStamina : 0;
        const take = Math.min(remaining, have);
        if (take > 0) {
         charDoc.currentStamina = Math.max(0, have - take);
         await charDoc.save();
         slot.currentStamina = charDoc.currentStamina;
         remaining -= take;
        }
       }
       party.markModified("characters");
       party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
       await party.save();
      }
      if (outcome.type === 'collapse') {
       const steps = grotto.mazeState.steps || [];
       const startCell = pathCells.find((c) => c.type === 'start');
       const startKey = startCell ? (startCell.key || `${startCell.x},${startCell.y}`) : (pathCells[0] && (pathCells[0].key || `${pathCells[0].x},${pathCells[0].y}`));
       grotto.mazeState.currentNode = startKey || currentNode;
       grotto.mazeState.steps = steps.slice(0, Math.max(0, steps.length - 3));
       await grotto.save();
      }
      let raidIdForEmbed = null;
      let wallRaidError = null;
      if (outcome.type === 'battle' && outcome.battle) {
       let monster = await fetchMonsterByName(outcome.battle.monsterLabel);
       if (!monster && outcome.battle.tier) {
        const regionMonsters = await getMonstersByRegion(party.region?.toLowerCase());
        const sameTier = regionMonsters && regionMonsters.filter((m) => m.tier === outcome.battle.tier);
        if (sameTier && sameTier.length > 0) monster = sameTier[Math.floor(Math.random() * sameTier.length)];
       }
       if (monster) {
        const village = REGION_TO_VILLAGE[party.region?.toLowerCase()] || "Inariko";
        const raidResult = await triggerRaid(monster, interaction, village, false, character, false, expeditionId);
        if (raidResult && raidResult.success) {
         raidIdForEmbed = raidResult.raidId;
         pushProgressLog(party, character.name, "grotto_maze_raid", `Song of Scrying: ${outcome.battle.monsterLabel} appeared. Raid started.`, undefined, undefined, new Date());
         party.currentTurn = (party.currentTurn + 1) % party.characters.length;
         await party.save();
        } else {
         wallRaidError = raidResult?.error || "Raid could not be started.";
         const mazeEmbedErr = new EmbedBuilder()
          .setTitle("🗺️ **Grotto: Maze — Song of Scrying**")
          .setColor(regionColors[party.region] || "#00ff99")
          .setDescription(`**${character.name}** sings the sequence on the wall... (Roll: **${roll}**)\n\n${outcome.flavor}\n\n⏰ **${wallRaidError}**\n\n↳ Continue with </explore grotto maze>.`)
          .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
         addExplorationStandardFields(mazeEmbedErr, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
         return interaction.editReply({ embeds: [mazeEmbedErr] });
        }
       } else {
        wallRaidError = "Construct not found; continue exploring.";
       }
      }
      let desc = `**${character.name}** sings the sequence on the wall... (Roll: **${roll}**)\n\n${outcome.flavor}\n\n↳ **${outcome.ctaHint}**`;
      if (wallRaidError) desc += `\n\n⏰ **${wallRaidError}**`;
      const mazeEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Maze — Song of Scrying**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(desc)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      if (raidIdForEmbed) {
       mazeEmbed.addFields({ name: "🆔 **__Raid ID__**", value: raidIdForEmbed, inline: true });
      }
      addExplorationStandardFields(mazeEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
      return interaction.editReply({ embeds: [mazeEmbed] });
     }

     const dir = action;
     const [cx, cy] = (currentNode || '').split(',').map((n) => parseInt(n, 10));
     if (isNaN(cx) || isNaN(cy)) {
      return interaction.editReply("Maze position is invalid. Re-enter the grotto with </explore grotto continue> and try again.");
     }
     const nextResult = getNeighbourCoords(matrix, cx, cy, dir, facing);
     if (!nextResult) {
      return interaction.editReply({
       embeds: [
        new EmbedBuilder()
         .setTitle("🗺️ **Grotto: Maze**")
         .setColor(regionColors[party.region] || "#00ff99")
         .setDescription(`That way is blocked. Party remains at the current location. Use </explore grotto maze> with another direction or **Wall** for Song of Scrying.`)
         .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK),
       ],
      });
     }
     const nextKey = `${nextResult.x},${nextResult.y}`;
     grotto.mazeState.currentNode = nextKey;
     grotto.mazeState.facing = nextResult.facing;
     if (!grotto.mazeState.steps) grotto.mazeState.steps = [];
     grotto.mazeState.steps.push({ direction: dir, at: new Date() });
     const cell = getPathCellAt(pathCells, nextResult.x, nextResult.y);
     const cellType = cell?.type || 'path';

     if (cellType === 'exit') {
      grotto.completedAt = new Date();
      await grotto.save();
      for (const slot of party.characters) {
       try {
        await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Maze");
       } catch (err) {
        logger.warn("EXPLORE", `Grotto maze exit Spirit Orb: ${err?.message || err}`);
       }
      }
      pushProgressLog(party, character.name, "grotto_maze_success", "Maze trial complete. Each party member received a Spirit Orb.", undefined, undefined, new Date());
      await party.save();
      const exitEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Maze — Exit!**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(`Party reached the exit! Everyone receives a **Spirit Orb**.`)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(exitEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
      return interaction.editReply({ embeds: [exitEmbed] });
     }

     if (cellType === 'trap') {
      const trapRoll = Math.floor(Math.random() * 6) + 1;
      const trapOutcome = getGrottoMazeTrapOutcome(trapRoll);
      if (trapOutcome.heartsLost > 0 && character._id) {
       try {
        await useHearts(character._id, trapOutcome.heartsLost, { commandName: 'explore', operation: 'grotto_maze_trap_cell' });
       } catch (err) {
        logger.warn("EXPLORE", `Grotto maze trap cell useHearts: ${err?.message || err}`);
       }
       const charDoc = await Character.findById(character._id).select('currentHearts');
       if (charDoc) {
        const idx = party.characters.findIndex((c) => c._id && c._id.toString() === character._id.toString());
        if (idx !== -1) party.characters[idx].currentHearts = charDoc.currentHearts;
        party.totalHearts = party.characters.reduce((s, c) => s + (c.currentHearts ?? 0), 0);
        party.markModified("characters");
        await party.save();
       }
      }
      if (trapOutcome.staminaCost > 0) {
       let remaining = trapOutcome.staminaCost;
       for (let idx = 0; idx < party.characters.length && remaining > 0; idx++) {
        const slot = party.characters[idx];
        const charDoc = await Character.findById(slot._id);
        if (!charDoc) continue;
        const have = typeof charDoc.currentStamina === "number" ? charDoc.currentStamina : 0;
        const take = Math.min(remaining, have);
        if (take > 0) {
         charDoc.currentStamina = Math.max(0, have - take);
         await charDoc.save();
         slot.currentStamina = charDoc.currentStamina;
         remaining -= take;
        }
       }
       party.markModified("characters");
       party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
       await party.save();
      }
      const trapDesc = `Party moved **${dir}** and triggered a trap! (Roll: **${trapRoll}**)\n\n${trapOutcome.flavor}\n\n↳ ${trapOutcome.ctaHint}`;
      const trapEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Maze — Trap!**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(trapDesc)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(trapEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
      await grotto.save();
      return interaction.editReply({ embeds: [trapEmbed] });
     }

     if (cellType === 'chest') {
      const opened = grotto.mazeState.openedChests || [];
      if (!opened.includes(nextKey)) {
       grotto.mazeState.openedChests = [...opened, nextKey];
       try {
        await addItemInventoryDatabase(character._id, "Spirit Orb", 1, interaction, "Grotto - Maze chest");
       } catch (err) {
        logger.warn("EXPLORE", `Grotto maze chest: ${err?.message || err}`);
       }
       const charDoc = await Character.findById(character._id);
       if (charDoc && party.characters) {
        const idx = party.characters.findIndex((c) => c._id && c._id.toString() === character._id.toString());
        if (idx !== -1) party.characters[idx] = { ...party.characters[idx], ...charDoc.toObject?.() || charDoc };
       }
       await grotto.save();
       const chestEmbed = new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Maze — Chest**")
        .setColor(regionColors[party.region] || "#00ff99")
        .setDescription(`Party moved **${dir}** and found a chest! **${character.name}** receives a **Spirit Orb**. Continue with </explore grotto maze>.`)
        .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
       addExplorationStandardFields(chestEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
       return interaction.editReply({ embeds: [chestEmbed] });
      }
     }

     if (cellType === 'mazep' || cellType === 'mazen') {
      const redLabel = cellType === 'mazep' ? 'Mazep' : 'MazeN';
      const redEmbed = new EmbedBuilder()
       .setTitle(`🗺️ **Grotto: Maze — ${redLabel}**`)
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(`Party moved **${dir}** and encountered ${redLabel}. Continue exploring. Use </explore grotto maze>.`)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(redEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
      await grotto.save();
      return interaction.editReply({ embeds: [redEmbed] });
     }

     await grotto.save();
     const moveEmbed = new EmbedBuilder()
      .setTitle("🗺️ **Grotto: Maze**")
      .setColor(regionColors[party.region] || "#00ff99")
      .setDescription(`Party chose **${dir}** and moved. Continue exploring. Use </explore grotto maze> with direction or **Wall** for Song of Scrying.`)
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(moveEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
     return interaction.editReply({ embeds: [moveEmbed] });
    }

    if (subcommand === "travel") {
     const locationStr = interaction.options.getString("location");
     const match = (locationStr || "").match(/^([A-Ja-j](?:[1-9]|1[0-2]))\s*(Q[1-4])$/i);
     if (!match) {
      return interaction.editReply("Provide location as square and quadrant, e.g. `H8 Q3`.");
     }
     const [, travelSquare, travelQuadrant] = match;
     const normSquare = travelSquare.toUpperCase();
     const normQuad = travelQuadrant.toUpperCase();
     const grottoDoc = await Grotto.findOne({ squareId: normSquare, quadrantId: normQuad });
     const squareDoc = await Square.findOne({
      squareId: new RegExp(`^${normSquare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      quadrants: { $elemMatch: { quadrantId: normQuad, "discoveries.type": "grotto" } },
     });
     if (!grottoDoc && !squareDoc) {
      return interaction.editReply("No grotto found at that location. The grotto must exist (cleansed or marked) at that square and quadrant.");
     }
     const costPerMember = 2;
     const totalCost = costPerMember * (party.characters?.length || 0);
     const partyStamina = Math.max(0, party.totalStamina ?? 0);
     if (partyStamina < totalCost) {
      return interaction.editReply(`Not enough stamina to travel to the grotto. Need ${totalCost} 🟩 (2 per member); party has ${partyStamina}.`);
     }
     let remaining = totalCost;
     for (let ci = 0; ci < (party.characters || []).length; ci++) {
      if (remaining <= 0) break;
      const slot = party.characters[ci];
      const charDoc = await Character.findById(slot._id);
      if (!charDoc) continue;
      const have = typeof charDoc.currentStamina === "number" ? charDoc.currentStamina : 0;
      const take = Math.min(remaining, have, costPerMember);
      if (take > 0) {
       charDoc.currentStamina = Math.max(0, have - take);
       await charDoc.save();
       slot.currentStamina = charDoc.currentStamina;
       remaining -= take;
      }
     }
     party.markModified("characters");
     party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
     party.square = normSquare;
     party.quadrant = normQuad;
     await party.save();
     pushProgressLog(party, character.name, "grotto_travel", `Party traveled to grotto at ${travelSquare} ${travelQuadrant} (−${totalCost} stamina).`, undefined, { staminaLost: totalCost }, new Date());
     const embed = new EmbedBuilder()
      .setTitle("🗺️ **Expedition: Arrived at Grotto**")
      .setColor(regionColors[party.region] || "#00ff99")
      .setDescription(`Party paid 2 🟩 per member and arrived at the grotto in **${travelSquare} ${travelQuadrant}**.\n\nIf the grotto is sealed, cleanse it. If unsealed, use </explore grotto continue> to enter the trial.`)
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(embed, { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false });
     return interaction.editReply({ embeds: [embed] });
    }

    return interaction.editReply("Unknown grotto subcommand.");
   }

   // ------------------- Roll for Encounter -------------------
   if (subcommand === "roll") {
    try {
     const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
     const characterName = interaction.options.getString("charactername");
     const userId = interaction.user.id;

     const party = await Party.findActiveByPartyId(expeditionId);
     if (!party) {
      return interaction.editReply("Expedition ID not found.");
     }
     await syncPartyMemberStats(party);

     const character = await Character.findOne({ name: characterName, userId });
     if (!character) {
      return interaction.editReply(
       "Character not found or you do not own this character."
      );
     }

     if (character.debuff?.active && character.debuff?.endDate) {
      const endDate = new Date(character.debuff.endDate);
      if (endDate > new Date()) {
       const daysLeft = Math.ceil((endDate - new Date()) / (24 * 60 * 60 * 1000));
       return interaction.editReply(
        `**${character.name}** is recovering from a full party KO and cannot explore for **${daysLeft}** more day(s). During this time they cannot use healing or stamina items, healer services, or join expeditions.`
       );
      }
     }

     if (party.status !== "started") {
      return interaction.editReply("This expedition has not been started yet.");
     }

     const characterIndex = party.characters.findIndex(
      (char) => char.name === characterName
     );

     if (characterIndex === -1) {
      return interaction.editReply(
       "Your character is not part of this expedition."
      );
     }

    if (party.currentTurn !== characterIndex) {
      const nextCharacter = party.characters[party.currentTurn];
      const notYourTurnEmbed = new EmbedBuilder()
        .setTitle("⏳ Not Your Turn")
        .setColor(regionColors[party.region] || "#FF9800")
        .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`)
        .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      return interaction.editReply({ embeds: [notYourTurnEmbed] });
    }

     // Sync quadrant state from map so stamina cost matches canonical explored/secured status
     const mapSquare = await Square.findOne({ squareId: party.square });
     let ruinRestRecovered = 0;
     if (mapSquare && mapSquare.quadrants && mapSquare.quadrants.length) {
      const q = mapSquare.quadrants.find(
       (qu) => String(qu.quadrantId).toUpperCase() === String(party.quadrant || "").toUpperCase()
      );
      if (q && (q.status === "explored" || q.status === "secured")) {
       party.quadrantState = q.status;
       party.markModified("quadrantState");
      } else if (party.quadrantState === "unexplored" && party.square && party.quadrant) {
       // Entering a quadrant counts as explored: ensure map and party are in sync (e.g. moved before this was persisted)
       const mapSquareId = (party.square && String(party.square).trim()) || "";
       const mapQuadrantId = (party.quadrant && String(party.quadrant).trim().toUpperCase()) || "";
       if (mapSquareId && mapQuadrantId) {
        try {
         const squareIdRegex = new RegExp(`^${mapSquareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
         await Square.updateOne(
          { squareId: squareIdRegex, "quadrants.quadrantId": mapQuadrantId },
          {
           $set: {
            "quadrants.$[q].status": "explored",
            "quadrants.$[q].exploredBy": interaction.user?.id || party.leaderId || "",
            "quadrants.$[q].exploredAt": new Date(),
           },
         },
         { arrayFilters: [{ "q.quadrantId": mapQuadrantId }] }
        );
        if (!party.exploredQuadrantsThisRun) party.exploredQuadrantsThisRun = [];
        party.exploredQuadrantsThisRun.push({ squareId: mapSquareId, quadrantId: mapQuadrantId });
        party.markModified("exploredQuadrantsThisRun");
        } catch (mapErr) {
         logger.error("EXPLORE", `Failed to mark quadrant explored on roll sync: ${mapErr.message}`);
        }
        party.quadrantState = "explored";
        party.markModified("quadrantState");
        const qSync = mapSquare.quadrants.find(
         (qu) => String(qu.quadrantId).toUpperCase() === String(party.quadrant || "").toUpperCase()
        );
        if (qSync && qSync.blighted) {
         await applyBlightExposure(party, party.square, party.quadrant, "reveal", character?.name);
        }
       }
      }
      // Known ruin-rest spot: auto-recover stamina when rolling here again
      const restStamina = typeof q?.ruinRestStamina === "number" && q.ruinRestStamina > 0 ? q.ruinRestStamina : 0;
      if (restStamina > 0 && character) {
       const maxStam = typeof character.maxStamina === "number" ? character.maxStamina : character.currentStamina ?? 0;
       const curStam = typeof character.currentStamina === "number" ? character.currentStamina : 0;
       const add = Math.min(restStamina, Math.max(0, maxStam - curStam));
       if (add > 0) {
        character.currentStamina = Math.min(maxStam, curStam + add);
        await character.save();
        party.characters[characterIndex].currentStamina = character.currentStamina;
        party.markModified("characters");
        party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
        await party.save();
        ruinRestRecovered = add;
        const locationRuinRest = `${party.square} ${party.quadrant}`;
        pushProgressLog(party, character.name, "ruin_rest", `Known ruin-rest spot in ${locationRuinRest}: +${add} stamina.`, undefined, { staminaRecovered: add });
       }
      }
     }

     // Secured quadrants cannot be rolled — prompt to Move, Item, or Camp instead
     if (party.quadrantState === "secured") {
      const nextCharacter = party.characters[party.currentTurn];
      const location = `${party.square} ${party.quadrant}`;
      const securedNoRollEmbed = new EmbedBuilder()
       .setTitle("🔒 **Quadrant Secured — No Roll**")
       .setColor(regionColors[party.region] || "#FF9800")
       .setDescription(
        `This quadrant (**${location}**) is already secured. You cannot roll here.\n\nUse **Move** to go to another quadrant, **Item** to use a healing item, or **Camp** to rest and recover hearts.`
       )
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(securedNoRollEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextCharacter ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
        commandsLast: true,
      });
      addExplorationCommandsField(securedNoRollEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextCharacter ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
        showSecuredQuadrantOnly: true,
        isAtStartQuadrant: (() => {
          const start = START_POINTS_BY_REGION[party.region];
          return start && String(party.square || "").toUpperCase() === String(start.square || "").toUpperCase() && String(party.quadrant || "").toUpperCase() === String(start.quadrant || "").toUpperCase();
        })(),
      });
      return interaction.editReply({ embeds: [securedNoRollEmbed] });
     }

     let staminaCost = 0;

     if (party.quadrantState === "unexplored") {
      staminaCost = 2;
     } else if (party.quadrantState === "explored") {
      staminaCost = 1;
     } else if (party.quadrantState === "secured") {
      staminaCost = 0;
     }

     const payResult = await payStaminaOrStruggle(party, characterIndex, staminaCost, { order: "currentFirst" });
     if (!payResult.ok) {
      const location = `${party.square} ${party.quadrant}`;
      return interaction.editReply({
        embeds: [createStuckInWildEmbed(party, location)],
      });
     }
     const rollCostsForLog = {
      ...(payResult.staminaPaid > 0 && { staminaLost: payResult.staminaPaid }),
      ...(payResult.heartsPaid > 0 && { heartsLost: payResult.heartsPaid }),
     };
     character.currentStamina = party.characters[characterIndex].currentStamina;
     character.currentHearts = party.characters[characterIndex].currentHearts;

     const location = `${party.square} ${party.quadrant}`;

     // Single outcome per roll: one of monster, item, explored, fairy, chest, old_map, ruins, relic, camp, monster_camp, grotto (chances in EXPLORATION_OUTCOME_CHANCES)
     // Reroll if: explored twice in a row; or special (ruins/relic/camp/monster_camp/grotto) and square has 3 discoveries; or grotto and square already has grotto; or special and discovery-reduce roll fails
     function rollOutcome() {
      const r = Math.random();
      let cum = 0;
      let outcome;
      for (const [name, chance] of Object.entries(EXPLORATION_OUTCOME_CHANCES)) {
       cum += chance;
       if (r < cum) { outcome = name; break; }
      }
      if (!outcome) outcome = Object.keys(EXPLORATION_OUTCOME_CHANCES).pop();
      logger.info("EXPLORE", `Roll outcome: r=${r.toFixed(4)} -> ${outcome} (location=${location})`);
      appendExploreStat(`${new Date().toISOString()}\troll\tr=${r.toFixed(4)}\t${outcome}\t${location}`);
      return outcome;
     }
     let outcomeType = rollOutcome();
     const currentSquareNorm = normalizeSquareId(party.square);
     const specialCount = countSpecialEventsInSquare(party, party.square);
     const lastOutcomeHere = getLastProgressOutcomeForLocation(party, party.square, party.quadrant);
     // Only use map doc that matches this square (avoid wrong square false positives)
     let mapSquareForGrotto = null;
     if (currentSquareNorm) {
      const found = await Square.findOne({ squareId: new RegExp(`^${String(party.square).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
      if (found && normalizeSquareId(found.squareId) === currentSquareNorm) mapSquareForGrotto = found;
     }
     for (;;) {
      // Don't allow "explored" twice in a row at the same location
      if (outcomeType === "explored" && lastOutcomeHere === "explored") {
       const reason = "explored twice in a row at this location (blocked by rule)";
       logger.info("EXPLORE", `Skipped ${outcomeType} at ${location}: ${reason}`);
       outcomeType = rollOutcome();
       continue;
      }
      if (!SPECIAL_OUTCOMES.includes(outcomeType)) break;
      if (specialCount >= MAX_SPECIAL_EVENTS_PER_SQUARE) {
       const reason = `special discovery count for this square is ${specialCount} (max ${MAX_SPECIAL_EVENTS_PER_SQUARE}); only counted outcomes: monster_camp/grotto/relic/ruins when accepted (monster_camp_skipped does not count)`;
       logger.info("EXPLORE", `Skipped ${outcomeType} at ${location}: ${reason}`);
       outcomeType = rollOutcome();
       continue;
      }
      if (outcomeType === "grotto") {
       const alreadyHasGrotto = hasGrottoInSquare(party, party.square, mapSquareForGrotto);
       if (alreadyHasGrotto) {
        const reason = "this square already has a grotto (from map or this run); one grotto per square only";
        logger.info("EXPLORE", `Skipped ${outcomeType} at ${location}: ${reason}`);
        outcomeType = rollOutcome();
        continue;
       }
      }
      if (outcomeType === "relic" && characterAlreadyFoundRelicThisExpedition(party, character.name)) {
       const reason = "this character already found a relic this expedition (one per character)";
       logger.info("EXPLORE", `Skipped ${outcomeType} at ${location}: ${reason}`);
       outcomeType = rollOutcome();
       continue;
      }
      if (specialCount >= 1 && Math.random() > DISCOVERY_REDUCE_CHANCE_WHEN_ANY) {
       const reason = `square already has ${specialCount} special discovery/discoveries; roll failed discovery-reduce (${(DISCOVERY_REDUCE_CHANCE_WHEN_ANY * 100).toFixed(0)}% keep chance)`;
       logger.info("EXPLORE", `Skipped ${outcomeType} at ${location}: ${reason}`);
       outcomeType = rollOutcome();
       continue;
      }
      break;
     }
     logger.info("EXPLORE", `Roll final outcome: ${outcomeType} at ${location}`);
     if (outcomeType !== "monster" && outcomeType !== "item") {
      appendExploreStat(`${new Date().toISOString()}\tfinal\t${outcomeType}\t${location}`);
     }

     if (outcomeType === "explored") {
      party.quadrantState = "explored";
      party.markModified("quadrantState");
      pushProgressLog(party, character.name, "explored", `Explored the quadrant (${location}). Party can now Secure, Roll again, or Move.`, undefined, Object.keys(rollCostsForLog).length ? rollCostsForLog : undefined);
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save();

      // Mark quadrant as explored in the canonical map (exploringMap) — case-insensitive squareId to match dashboard
      try {
       const mapSquareId = (party.square && String(party.square).trim()) || "";
       const mapQuadrantId = (party.quadrant && String(party.quadrant).trim().toUpperCase()) || "";
       if (mapSquareId && mapQuadrantId) {
        const squareIdRegexExplored = new RegExp(`^${mapSquareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
        const result = await Square.updateOne(
         { squareId: squareIdRegexExplored, "quadrants.quadrantId": mapQuadrantId },
         {
          $set: {
           "quadrants.$[q].status": "explored",
           "quadrants.$[q].exploredBy": interaction.user?.id || party.leaderId || "",
           "quadrants.$[q].exploredAt": new Date(),
          },
         },
         { arrayFilters: [{ "q.quadrantId": mapQuadrantId }] }
        );
        if (result.matchedCount === 0) {
         logger.warn("EXPLORE", `Map update: no square found for ${mapSquareId} quadrant ${mapQuadrantId}`);
        } else if (result.modifiedCount === 0) {
         logger.warn("EXPLORE", `Map update: square found but quadrant not updated for ${mapSquareId} ${mapQuadrantId}`);
        } else {
         if (!party.exploredQuadrantsThisRun) party.exploredQuadrantsThisRun = [];
         party.exploredQuadrantsThisRun.push({ squareId: mapSquareId, quadrantId: mapQuadrantId });
         party.markModified("exploredQuadrantsThisRun");
         await party.save();
        }
       }
      } catch (mapErr) {
       logger.error("EXPLORE", `Failed to update map quadrant status: ${mapErr.message}`);
      }

      const mapSquareForBlight = await Square.findOne({ squareId: party.square });
      const quadBlight = mapSquareForBlight?.quadrants?.find(
       (qu) => String(qu.quadrantId).toUpperCase() === String(party.quadrant || "").toUpperCase()
      );
      if (quadBlight && quadBlight.blighted) {
       await applyBlightExposure(party, party.square, party.quadrant, "reveal", character.name);
      }

      const nextCharacter = party.characters[party.currentTurn];
      const startPoint = START_POINTS_BY_REGION[party.region];
      const isAtStartQuadrant = startPoint && String(party.square || "").toUpperCase() === String(startPoint.square || "").toUpperCase() && String(party.quadrant || "").toUpperCase() === String(startPoint.quadrant || "").toUpperCase();
      const embed = new EmbedBuilder()
       .setTitle(`🗺️ **Expedition: Quadrant Explored!**`)
       .setDescription(`**${character.name}** has explored this area (**${location}**). Use the commands below to take your turn, or secure, or move.`)
       .setColor(regionColors[party.region] || "#00ff99")
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(embed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextCharacter ?? null,
        showNextAndCommands: true,
        showRestSecureMove: true,
        isAtStartQuadrant: !!isAtStartQuadrant,
        ruinRestRecovered,
      });
      await interaction.editReply({ embeds: [embed] });
      await interaction.followUp({ content: `<@${nextCharacter.userId}> it's your turn now` });
      return;
     }

     if (outcomeType === "fairy") {
      const fairyHealsOnSpot = Math.random() < 0.5;
      if (fairyHealsOnSpot) {
       let totalHeartsRecovered = 0;
       for (let i = 0; i < party.characters.length; i++) {
        const partyChar = party.characters[i];
        const char = await Character.findById(partyChar._id);
        if (!char) continue;
        const maxH = char.maxHearts ?? 0;
        const currentH = char.currentHearts ?? 0;
        const needed = Math.max(0, maxH - currentH);
        if (char.ko) {
         await healKoCharacter(char._id);
        }
        char.currentHearts = maxH;
        await char.save();
        party.characters[i].currentHearts = char.currentHearts;
        totalHeartsRecovered += needed;
       }
       party.markModified("characters");
       party.totalHearts = party.characters.reduce((s, c) => s + (c.currentHearts ?? 0), 0);
       party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
       pushProgressLog(party, character.name, "fairy", `A fairy appeared in ${location} and healed the party! All hearts restored (+${totalHeartsRecovered} ❤ from 1 fairy).`, undefined, { heartsRecovered: totalHeartsRecovered, ...rollCostsForLog });
       party.currentTurn = (party.currentTurn + 1) % party.characters.length;
       await party.save();
       const nextChar = party.characters[party.currentTurn];
       const fairyEmbed = new EmbedBuilder()
        .setTitle(`🧚 **Expedition: A Fairy Appeared!**`)
        .setDescription(`**${character.name}** encountered a fairy in **${location}**! The fairy swept over the party, restoring everyone to full hearts.`)
        .setColor(regionColors[party.region] || "#E8D5F2")
        .setThumbnail("https://via.placeholder.com/100x100")
        .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
       const healedChar = party.characters[characterIndex];
       addExplorationStandardFields(fairyEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextChar ?? null,
        showNextAndCommands: true,
        showRestSecureMove: true,
        commandsLast: true,
        extraFieldsBeforeIdQuadrant: [{ name: `❤️ __${character.name} Hearts__`, value: `${healedChar?.currentHearts ?? 0}/${character.maxHearts ?? 0}`, inline: true }],
        ruinRestRecovered,
      });
       fairyEmbed.addFields(
        { name: "📋 **Recovery**", value: `Party fully healed! (+${totalHeartsRecovered} ❤️ total)`, inline: false },
       );
       addExplorationCommandsField(fairyEmbed, { party, expeditionId, location, nextCharacter: nextChar ?? null, showNextAndCommands: true, showFairyRollOnly: true });
       await interaction.editReply({ embeds: [fairyEmbed] });
       await interaction.followUp({ content: `<@${nextChar.userId}> it's your turn now` });
       return;
      }
      const fairyItem = await ItemModel.findOne({ itemName: "Fairy" }).lean().catch(() => null) || { itemName: "Fairy", emoji: "🧚", image: null };
      pushProgressLog(party, character.name, "fairy", `Found a Fairy in ${location}.`, undefined, Object.keys(rollCostsForLog).length ? rollCostsForLog : undefined);
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save();
      const nextChar = party.characters[party.currentTurn];
      const embed = createExplorationItemEmbed(party, character, fairyItem, expeditionId, location, party.totalHearts, party.totalStamina, nextChar ?? null, true, ruinRestRecovered);
      if (!party.gatheredItems) party.gatheredItems = [];
      party.gatheredItems.push({ characterId: character._id, characterName: character.name, itemName: "Fairy", quantity: 1, emoji: fairyItem.emoji || "🧚" });
      await interaction.editReply({ embeds: [embed] });
      await interaction.followUp({ content: `<@${nextChar.userId}> it's your turn now` });
      try {
       await addItemInventoryDatabase(character._id, "Fairy", 1, interaction, "Exploration");
      } catch (err) {
       handleInteractionError(err, interaction, { source: "explore.js fairy" });
      }
      return;
     }

     if (outcomeType === "chest" || outcomeType === "old_map" || outcomeType === "ruins" || outcomeType === "relic" || outcomeType === "camp" || outcomeType === "monster_camp" || outcomeType === "grotto") {
      let failedNotifyUserIds = [];
      let failedNotifyEmbed = null;
      let campHeartsRecovered = 0;
      let campStaminaRecovered = 0;
      if (outcomeType === "camp") {
       campHeartsRecovered = Math.floor(Math.random() * 3) + 1;
       campStaminaRecovered = Math.floor(Math.random() * 3) + 1;
       character.currentHearts = Math.min(character.maxHearts, character.currentHearts + campHeartsRecovered);
       character.currentStamina = Math.min(character.maxStamina, character.currentStamina + campStaminaRecovered);
       await character.save();
       const campCharIndex = party.characters.findIndex((c) => c._id.toString() === character._id.toString());
       if (campCharIndex >= 0) {
        party.characters[campCharIndex].currentHearts = character.currentHearts;
        party.characters[campCharIndex].currentStamina = character.currentStamina;
        party.markModified("characters");
       }
       party.totalHearts = party.characters.reduce((s, c) => s + (c.currentHearts ?? 0), 0);
       party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
      }

      let chosenMapOldMap = null;
      if (outcomeType === "old_map") {
       chosenMapOldMap = getRandomOldMap();
       try {
        await addOldMapToCharacter(character.name, chosenMapOldMap.number, location);
       } catch (err) {
        handleInteractionError(err, interaction, { source: "explore.js old_map" });
       }
       const userIds = [...new Set((party.characters || []).map((c) => c.userId).filter(Boolean))];
       const dmEmbed = new EmbedBuilder()
        .setTitle("🗺️ Expedition map found")
        .setDescription(`An old map found and saved to **${character.name}**'s map collection. Take it to the Inariko Library to get it deciphered.`)
        .addFields({ name: "Expedition", value: `\`${expeditionId}\``, inline: true })
        .setURL(OLD_MAPS_LINK)
        .setColor("#2ecc71")
        .setFooter({ text: "More info" });
       const client = interaction.client;
       if (client) {
        failedNotifyEmbed = dmEmbed;
        for (const uid of userIds) {
         try {
          const user = await client.users.fetch(uid).catch(() => null);
          if (user) {
           const sent = await user.send({ embeds: [dmEmbed] }).catch(() => null);
           if (!sent) failedNotifyUserIds.push(uid);
          }
         } catch (_) {
          failedNotifyUserIds.push(uid);
         }
        }
       }
      }

      if (outcomeType === "relic") {
       let savedRelic = null;
       try {
        savedRelic = await createRelic({
         name: "Unknown Relic",
         discoveredBy: character.name,
         characterId: character._id,
         discoveredDate: new Date(),
         locationFound: location,
         appraised: false,
        });
       } catch (err) {
        logger.error("EXPLORE", `createRelic error (roll outcome): ${err?.message || err}`);
       }
       const relicUserIds = [...new Set((party.characters || []).map((c) => c.userId).filter(Boolean))];
       const relicIdStr = savedRelic?.relicId ? ` (ID: \`${savedRelic.relicId}\`)` : '';
       const relicDmEmbed = new EmbedBuilder()
        .setTitle("🔸 Expedition relic found")
        .setDescription(`**Unknown Relic** discovered by **${character.name}** in ${location}.${relicIdStr}\n\nTake it to an Inarikian Artist or Researcher to get it appraised.`)
        .addFields({ name: "Expedition", value: `\`${expeditionId}\``, inline: true })
        .setURL("https://www.rootsofthewild.com/relics")
        .setColor("#e67e22")
        .setFooter({ text: "More info" });
       const relicClient = interaction.client;
       if (relicClient) {
        failedNotifyEmbed = relicDmEmbed;
        for (const uid of relicUserIds) {
         try {
          const user = await relicClient.users.fetch(uid).catch(() => null);
          if (user) {
           const sent = await user.send({ embeds: [relicDmEmbed] }).catch(() => null);
           if (!sent) failedNotifyUserIds.push(uid);
          }
         } catch (_) {
          failedNotifyUserIds.push(uid);
         }
        }
       }
      }

      const progressMessages = {
       chest: `Found a chest in ${location} (open for 1 stamina).`,
       old_map: `Found an old map in ${location}; take to Inariko Library to decipher.`,
       ruins: `Found ruins in ${location} (explore for 3 stamina or skip).`,
       relic: `Found a relic in ${location}; take to Artist/Researcher to appraise.`,
       camp: `Found a safe space in ${location} and rested. Recovered ${campHeartsRecovered} heart(s), ${campStaminaRecovered} stamina.`,
       monster_camp: `Found a monster camp in ${location}; report to town hall to mark on map.`,
       grotto: `Found a grotto in ${location} (cleanse for 1 plume + 1 stamina or mark for later).`,
      };
      const chestRuinsCosts =
       Object.keys(rollCostsForLog).length > 0 || outcomeType === "camp"
        ? {
            ...rollCostsForLog,
            ...(outcomeType === "camp" && { heartsRecovered: campHeartsRecovered, staminaRecovered: campStaminaRecovered }),
          }
        : undefined;
      const lootForProgressLog =
       outcomeType === "old_map"
        ? { itemName: "An old map", emoji: "" }
        : outcomeType === "relic"
          ? { itemName: "Unknown Relic", emoji: "🔸" }
          : undefined;
      const at = new Date();
      // Ruins, grotto, monster camp: only add to map and progressLog when user chooses Yes (No = doesn't count)
      if (REPORTABLE_DISCOVERY_OUTCOMES.has(outcomeType) && outcomeType !== "ruins" && outcomeType !== "monster_camp" && outcomeType !== "grotto") {
       await pushDiscoveryToMap(party, outcomeType, at, interaction.user?.id);
      }
      const progressOutcome = outcomeType === "ruins" ? "ruins_found" : outcomeType;
      // Ruins, grotto, monster camp: defer progressLog until button choice (Yes = counts, No = skipped, doesn't count)
      if (outcomeType !== "monster_camp" && outcomeType !== "ruins" && outcomeType !== "grotto") {
       pushProgressLog(
        party,
        character.name,
        progressOutcome,
        progressMessages[outcomeType] || `Found something in ${location}.`,
        lootForProgressLog,
        chestRuinsCosts,
        at
       );
      }
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save();
      const nextCharacter = party.characters[party.currentTurn];

      let title, description;
      if (outcomeType === "monster_camp") {
       title = `🗺️ **Expedition: Monster Camp found!**`;
       description =
        `**${character.name}** found something unsettling in **${location}**.\n\n` +
        "Um....You found a Monster Camp of some kind....!!! What do you want to do?\n\n" +
        "**Mark it** — Add to map and fight later (counts toward this square's 3 discovery limit).\n" +
        "**Fight it** — Add to map and fight now (same as Mark, but you fight the wave here; refightable after Blood Moon).\n" +
        `**Leave it** — Don't mark. Won't be recorded as a discovery. Continue with </explore roll:${getExploreCommandId()}>.`;
      } else if (outcomeType === "chest") {
       title = `🗺️ **Expedition: Chest found!**`;
       description =
        `**${character.name}** found a chest in **${location}**!\n\n` +
        "Open chest? Costs 1 stamina.\n\n" +
        "**Yes** — Open the chest (1 item per party member, relics possible).\n" +
        `**No** — Continue exploring with </explore roll:${getExploreCommandId()}>.`;
      } else if (outcomeType === "old_map") {
       const mapInfo = `**${character.name}** found an old map in **${location}**!\n\nThe script is faded and hard to read—you'll need to take it to the Inariko Library to get it deciphered.\n\n**Saved to ${character.name}'s map collection.**`;
       title = `🗺️ **Expedition: Old map found!**`;
       description =
        mapInfo + `\n\nFind out more [here](${OLD_MAPS_LINK}).\n\n↳ **Continue** ➾ See **Commands** below to take your turn.`;
      } else if (outcomeType === "ruins") {
       title = `🗺️ **Expedition: Ruins found!**`;
       description =
        `**${character.name}** found some ruins in **${location}**!\n\n` +
        "**Yes** — Explore the ruins (cost 3 stamina; counts toward discovery limit).\n" +
        `**No** — Leave for later. Won't be recorded as a discovery. Use </explore roll:${getExploreCommandId()}> to continue.`;
      } else if (outcomeType === "relic") {
       title = `🗺️ **Expedition: Relic found!**`;
       description =
        `**${character.name}** found something ancient in **${location}**.\n\n` +
        "You found a relic! What is this? Take it to an Inarikian Artist or Researcher to get this appraised. You can find more info [here](https://www.rootsofthewild.com/relics).\n\n" +
        "↳ **Continue** ➾ See **Commands** below to take your turn.";
      } else if (outcomeType === "grotto") {
       title = `🗺️ **Expedition: Grotto found!**`;
       description =
        `**${character.name}** stumbled across something strange in **${location}**.\n\n` +
        "You stumble across an interesting looking stump with roots covered in talismans, do you have the means to cleanse them? More info about grottos can be found [here](https://www.rootsofthewild.com/grottos).\n\n" +
        "**Yes** — Cleanse the grotto (1 Goddess Plume + 1 stamina).\n" +
        "**No** — Mark it on the map for later (counts toward this square's 3 discovery limit).";
      } else if (outcomeType === "camp") {
       const safeSpaceFlavorRoll = getRandomSafeSpaceFlavor();
       title = `🗺️ **Expedition: Found a safe space and rested!**`;
       description =
        `**${character.name}** found a safe space in **${location}** and rested!\n\n\`\`\`\n${safeSpaceFlavorRoll}\n\`\`\`\n\nRecovered ❤️ **${campHeartsRecovered}** heart(s) and 🟩 **${campStaminaRecovered}** stamina.`;
      }

      const embed = new EmbedBuilder()
       .setTitle(title)
       .setDescription(description)
       .setColor(regionColors[party.region] || "#00ff99")
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(embed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextCharacter ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
        ruinRestRecovered,
      });

      const isYesNoChoice = outcomeType === "ruins" || outcomeType === "grotto" || outcomeType === "chest";
      const isMonsterCampChoice = outcomeType === "monster_camp";
      let components = [];
      if (isYesNoChoice) {
       const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
         .setCustomId(`explore_${outcomeType}_yes|${expeditionId}|${characterIndex}`)
         .setLabel("Yes")
         .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
         .setCustomId(`explore_${outcomeType}_no|${expeditionId}|${characterIndex}`)
         .setLabel("No")
         .setStyle(ButtonStyle.Secondary)
       );
       components = [row];
      } else if (isMonsterCampChoice) {
       const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
         .setCustomId(`explore_monster_camp_mark|${expeditionId}|${characterIndex}`)
         .setLabel("Mark it")
         .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
         .setCustomId(`explore_monster_camp_fight|${expeditionId}|${characterIndex}`)
         .setLabel("Fight it")
         .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
         .setCustomId(`explore_monster_camp_leave|${expeditionId}|${characterIndex}`)
         .setLabel("Leave it")
         .setStyle(ButtonStyle.Secondary)
       );
       components = [row];
      }

      const msg = await interaction.editReply({ embeds: [embed], components });
      if (failedNotifyUserIds.length > 0 && failedNotifyEmbed) {
       await interaction.followUp({
        content: failedNotifyUserIds.map((uid) => `<@${uid}>`).join(" ") + " — Couldn't DM you:",
        embeds: [failedNotifyEmbed],
       }).catch(() => {});
      }
      await interaction.followUp({ content: `<@${nextCharacter.userId}> it's your turn now` });

      if (isYesNoChoice || isMonsterCampChoice) {
       const collector = msg.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 5 * 60 * 1000,
        max: 1,
       });
       collector.on("collect", async (i) => {
        await i.deferUpdate();
        const isYes = i.customId.endsWith("_yes") || i.customId.includes("_yes|");
        let disabledRow;
        if (isMonsterCampChoice) {
         disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
           .setCustomId(`explore_monster_camp_mark|${expeditionId}|${characterIndex}`)
           .setLabel("Mark it")
           .setStyle(ButtonStyle.Primary)
           .setDisabled(true),
          new ButtonBuilder()
           .setCustomId(`explore_monster_camp_fight|${expeditionId}|${characterIndex}`)
           .setLabel("Fight it")
           .setStyle(ButtonStyle.Success)
           .setDisabled(true),
          new ButtonBuilder()
           .setCustomId(`explore_monster_camp_leave|${expeditionId}|${characterIndex}`)
           .setLabel("Leave it")
           .setStyle(ButtonStyle.Secondary)
           .setDisabled(true)
         );
        } else {
         disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_yes|${expeditionId}|${characterIndex}`)
           .setLabel("Yes")
           .setStyle(ButtonStyle.Success)
           .setDisabled(true),
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_no|${expeditionId}|${characterIndex}`)
           .setLabel("No")
           .setStyle(ButtonStyle.Secondary)
           .setDisabled(true)
         );
        }
        await msg.edit({ components: [disabledRow] }).catch(() => {});

        if (outcomeType === "ruins" && isYes) {
         // Disable Yes/No buttons immediately so the original message stays with greyed-out buttons
         await msg.edit({ embeds: [embed], components: [disabledRow] }).catch(() => {});
         // Ruins exploration: charge 3 stamina, then roll one of chest/camp/landmark/relic/old_map/star_fragment/blight/goddess_plume
         const freshParty = await Party.findActiveByPartyId(expeditionId);
         if (!freshParty) {
          await i.followUp({ embeds: [new EmbedBuilder().setTitle("Error").setDescription("Expedition not found.").setColor(0xff0000)], ephemeral: true }).catch(() => {});
          return;
         }
         const parts = i.customId.split("|");
         const ruinsCharIndex = parts.length >= 3 && /^\d+$/.test(parts[2])
          ? Math.max(0, Math.min(parseInt(parts[2], 10), freshParty.characters.length - 1))
          : (freshParty.currentTurn - 1 + freshParty.characters.length) % freshParty.characters.length;
         const ruinsCharSlot = freshParty.characters[ruinsCharIndex];
         const ruinsCharacter = await Character.findById(ruinsCharSlot._id);
         if (!ruinsCharacter) {
          await i.followUp({ embeds: [new EmbedBuilder().setTitle("Error").setDescription("Character not found.").setColor(0xff0000)], ephemeral: true }).catch(() => {});
          return;
         }
         const ruinsStaminaCost = 3;
         const ruinsPayResult = await payStaminaOrStruggle(freshParty, ruinsCharIndex, ruinsStaminaCost, { order: "currentFirst" });
         if (!ruinsPayResult.ok) {
          const partyTotalStamina = Math.max(0, freshParty.totalStamina ?? 0);
          const partyTotalHearts = Math.max(0, freshParty.totalHearts ?? 0);
          const noStaminaEmbed = new EmbedBuilder()
           .setTitle("❌ Not enough stamina or hearts to explore the ruins")
           .setColor(regionColors[freshParty.region] || "#00ff99")
           .setDescription("Party has " + partyTotalStamina + " 🟩 and " + partyTotalHearts + " ❤ (need 3 total). **Camp** to recover, or use hearts to **Struggle** (1 heart = 1 stamina).")
           .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
          addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
          await i.followUp({ embeds: [noStaminaEmbed] }).catch(() => {});
          return;
         }
         // Reload ruinsCharacter for later use (camp outcome etc. may add stamina to them)
         const ruinsCharacterReload = await Character.findById(ruinsCharSlot._id);
         if (ruinsCharacterReload) {
          ruinsCharacter.currentStamina = ruinsCharacterReload.currentStamina;
          ruinsCharacter.currentHearts = ruinsCharacterReload.currentHearts;
         }
         const ruinsCostsForLog = { ...(ruinsPayResult.staminaPaid > 0 && { staminaLost: ruinsPayResult.staminaPaid }), ...(ruinsPayResult.heartsPaid > 0 && { heartsLost: ruinsPayResult.heartsPaid }) };

         // Now that user chose Yes, add ruins to map and reportable progress log (so dashboard shows "Set pin" only after Yes)
         const ruinsAt = new Date();
         await pushDiscoveryToMap(freshParty, "ruins", ruinsAt, i.user?.id);
         pushProgressLog(freshParty, ruinsCharacter.name, "ruins", `Explored ruins in ${location}.`, undefined, ruinsCostsForLog, ruinsAt);

         // Weighted roll: chest 7, camp 3, landmark 2, relic 2, old_map 2, star_fragment 2, blight 1, goddess_plume 1 (total 20)
         const roll = Math.random() * 20;
         let ruinsOutcome;
         if (roll < 7) ruinsOutcome = "chest";
         else if (roll < 10) ruinsOutcome = "camp";
         else if (roll < 12) ruinsOutcome = "landmark";
         else if (roll < 14) ruinsOutcome = "relic";
         else if (roll < 16) ruinsOutcome = "old_map";
         else if (roll < 18) ruinsOutcome = "star_fragment";
         else if (roll < 19) ruinsOutcome = "blight";
         else ruinsOutcome = "goddess_plume";

         let resultTitle = `🗺️ **Expedition: Explored the ruins!**`;
         const summaryLine = `**${ruinsCharacter.name}** chose to explore the ruins! The party explored the ruins in **${location}** (−3 stamina).\n\n`;
         let resultDescription = "";
         let progressMsg = `Explored ruins in ${location} (-3 stamina). `;
         let lootForLog = undefined;
         let ruinsFailedNotifyUserIds = [];
         let ruinsFailedNotifyEmbed = null;

         if (ruinsOutcome === "relic" && characterAlreadyFoundRelicThisExpedition(freshParty, ruinsCharacter.name)) {
          ruinsOutcome = "landmark";
         }
         if (ruinsOutcome === "chest") {
          resultDescription = summaryLine + `**${ruinsCharacter.name}** explored the ruins and found a chest!\n\nOpen chest? Costs 1 stamina.\n\n**Yes** — Open the chest (1 item per party member, relics possible).\n**No** — Continue exploring with </explore roll:${getExploreCommandId()}>.`;
          progressMsg += "Found a chest (open for 1 stamina).";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, ruinsCostsForLog);
         } else if (ruinsOutcome === "camp") {
          const recover = 1;
          ruinsCharacter.currentStamina = Math.min(ruinsCharacter.maxStamina ?? ruinsCharacter.currentStamina, ruinsCharacter.currentStamina + recover);
          await ruinsCharacter.save();
          const idx = freshParty.characters.findIndex((c) => c._id.toString() === ruinsCharacter._id.toString());
          if (idx >= 0) { freshParty.characters[idx].currentStamina = ruinsCharacter.currentStamina; }
          freshParty.totalStamina = freshParty.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
          await freshParty.save();
          // Mark this quadrant as a ruin-rest spot so future visits auto-heal
          try {
           const mapSquareId = (freshParty.square && String(freshParty.square).trim()) || "";
           const mapQuadrantId = (freshParty.quadrant && String(freshParty.quadrant).trim().toUpperCase()) || "";
           if (mapSquareId && mapQuadrantId) {
            const squareIdRegex = new RegExp(`^${mapSquareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
            await Square.updateOne(
             { squareId: squareIdRegex, "quadrants.quadrantId": mapQuadrantId },
             { $set: { "quadrants.$[q].ruinRestStamina": recover } },
             { arrayFilters: [{ "q.quadrantId": mapQuadrantId }] }
            );
           }
          } catch (mapErr) {
           logger.warn("EXPLORE", `Failed to mark ruin-rest on map: ${mapErr?.message || mapErr}`);
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found a solid camp spot in the ruins and recovered **${recover}** 🟩 stamina. Remember to add it to the map for future expeditions!\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a camp spot; recovered 1 stamina.";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, { ...ruinsCostsForLog, staminaRecovered: recover });
         } else if (ruinsOutcome === "landmark") {
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found nothing special in the ruins—but an interesting landmark. It's been marked on the map.\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found an interesting landmark (marked on map).";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, ruinsCostsForLog);
         } else if (ruinsOutcome === "relic") {
          let ruinsSavedRelic = null;
          try {
           ruinsSavedRelic = await createRelic({
            name: "Unknown Relic",
            discoveredBy: ruinsCharacter.name,
            characterId: ruinsCharacter._id,
            discoveredDate: new Date(),
            locationFound: location,
            appraised: false,
          });
          } catch (err) {
           logger.error("EXPLORE", `createRelic error (ruins): ${err?.message || err}`);
          }
          const ruinsRelicIdStr = ruinsSavedRelic?.relicId ? ` (ID: \`${ruinsSavedRelic.relicId}\`)` : '';
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found a relic in the ruins!${ruinsRelicIdStr} Take it to an Inarikian Artist or Researcher to get it appraised. More info [here](https://www.rootsofthewild.com/relics).\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a relic (take to Artist/Researcher to appraise).";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, ruinsCostsForLog);
          pushProgressLog(freshParty, ruinsCharacter.name, "relic", `Found a relic in ${location}; take to Artist/Researcher to appraise.`, { itemName: "Unknown Relic", emoji: "🔸" }, undefined);
          const relicUserIds = [...new Set((freshParty.characters || []).map((c) => c.userId).filter(Boolean))];
          const relicDmEmbed = new EmbedBuilder()
           .setTitle("🔸 Expedition relic found")
           .setDescription(`**Unknown Relic** discovered by **${ruinsCharacter.name}** in ${location}.${ruinsRelicIdStr}\n\nTake it to an Inarikian Artist or Researcher to get it appraised.`)
           .addFields({ name: "Expedition", value: `\`${expeditionId}\``, inline: true })
           .setURL("https://www.rootsofthewild.com/relics")
           .setColor("#e67e22")
           .setFooter({ text: "More info" });
          const relicClient = i.client;
          if (relicClient) {
           ruinsFailedNotifyEmbed = relicDmEmbed;
           for (const uid of relicUserIds) {
            try {
             const user = await relicClient.users.fetch(uid).catch(() => null);
             if (user) {
              const sent = await user.send({ embeds: [relicDmEmbed] }).catch(() => null);
              if (!sent) ruinsFailedNotifyUserIds.push(uid);
             }
            } catch (_) {
             ruinsFailedNotifyUserIds.push(uid);
            }
           }
          }
         } else if (ruinsOutcome === "old_map") {
          const chosenMap = getRandomOldMap();
          logger.info("EXPLORE", `Ruins item: outcome=old_map, character=${ruinsCharacter.name}`);
          try {
           await addOldMapToCharacter(ruinsCharacter.name, chosenMap.number, location);
          } catch (err) {
           handleInteractionError(err, i, { source: "explore.js ruins old_map" });
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found an old map in the ruins! The script is faded and hard to read—take it to the Inariko Library to get it deciphered.\n\n**Saved to ${ruinsCharacter.name}'s map collection.** Find out more about maps [here](${OLD_MAPS_LINK}).\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found an old map; saved to map collection. Take to Inariko Library to decipher.";
          lootForLog = { itemName: "An old map", emoji: "" };
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, lootForLog, ruinsCostsForLog);
          // DM all expedition members (no coordinates until appraised)
          const userIds = [...new Set((freshParty.characters || []).map((c) => c.userId).filter(Boolean))];
          const dmEmbed = new EmbedBuilder()
           .setTitle("🗺️ Expedition map found")
           .setDescription(`An old map found and saved to **${ruinsCharacter.name}**'s map collection. Take it to the Inariko Library to get it deciphered.`)
           .addFields({ name: "Expedition", value: `\`${expeditionId}\``, inline: true })
           .setURL(OLD_MAPS_LINK)
           .setColor("#2ecc71")
           .setFooter({ text: "More info" });
          const client = i.client;
          if (client) {
           ruinsFailedNotifyEmbed = dmEmbed;
           for (const uid of userIds) {
            try {
             const user = await client.users.fetch(uid).catch(() => null);
             if (user) {
              const sent = await user.send({ embeds: [dmEmbed] }).catch(() => null);
              if (!sent) ruinsFailedNotifyUserIds.push(uid);
             }
            } catch (_) {
             ruinsFailedNotifyUserIds.push(uid);
            }
           }
          }
         } else if (ruinsOutcome === "star_fragment") {
          logger.info("EXPLORE", `Ruins item: outcome=star_fragment, character=${ruinsCharacter.name}, item=Star Fragment`);
          try {
           await addItemInventoryDatabase(ruinsCharacter._id, "Star Fragment", 1, i, "Exploration - Ruins");
          } catch (err) {
           handleInteractionError(err, i, { source: "explore.js ruins star_fragment" });
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** collected a **Star Fragment** in the ruins!\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a Star Fragment.";
          lootForLog = { itemName: "Star Fragment", emoji: "" };
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, lootForLog, ruinsCostsForLog);
         } else if (ruinsOutcome === "blight") {
          ruinsCharacter.blighted = true;
          if (!ruinsCharacter.blightedAt) ruinsCharacter.blightedAt = new Date();
          if (!ruinsCharacter.blightStage || ruinsCharacter.blightStage === 0) {
           ruinsCharacter.blightStage = 1;
           ruinsCharacter.blightEffects = { rollMultiplier: 1.0, noMonsters: false, noGathering: false };
          }
          await ruinsCharacter.save();
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found… **BLIGHT** in the ruins. You're blighted! Use the </blight:...> command for healing and info.\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found blight; character is now blighted.";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, ruinsCostsForLog);
         } else {
          // goddess_plume
          logger.info("EXPLORE", `Ruins item: outcome=goddess_plume, character=${ruinsCharacter.name}, item=Goddess Plume`);
          try {
           await addItemInventoryDatabase(ruinsCharacter._id, "Goddess Plume", 1, i, "Exploration - Ruins");
          } catch (err) {
           handleInteractionError(err, i, { source: "explore.js ruins goddess_plume" });
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** excavated a **Goddess Plume** from the ruins!\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Excavated a Goddess Plume.";
          lootForLog = { itemName: "Goddess Plume", emoji: "" };
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, lootForLog, ruinsCostsForLog);
         }
         const finalParty = await Party.findActiveByPartyId(expeditionId);
         const resultEmbed = new EmbedBuilder()
          .setTitle(resultTitle)
          .setDescription(resultDescription)
          .setColor(regionColors[finalParty?.region] || "#00ff99")
          .setImage(regionImages[finalParty?.region] || EXPLORATION_IMAGE_FALLBACK);
         addExplorationStandardFields(resultEmbed, {
          party: finalParty,
          expeditionId,
          location,
          nextCharacter: nextCharacter ?? null,
          showNextAndCommands: true,
          showRestSecureMove: false,
          ruinRestRecovered,
        });
         const explorePageUrl = `${(process.env.DASHBOARD_URL || process.env.APP_URL || "https://tinglebot.xyz").replace(/\/$/, "")}/explore/${encodeURIComponent(expeditionId)}`;
         resultEmbed.addFields({
          name: "📍 **__Set pin on webpage__**",
          value: `Set a pin for this discovery on the **explore/${expeditionId}** page: ${explorePageUrl}`,
          inline: false,
         });

         if (ruinsOutcome === "chest") {
          const chestRow = new ActionRowBuilder().addComponents(
           new ButtonBuilder().setCustomId(`explore_chest_yes|${expeditionId}|${ruinsCharIndex}`).setLabel("Yes").setStyle(ButtonStyle.Success),
           new ButtonBuilder().setCustomId(`explore_chest_no|${expeditionId}|${ruinsCharIndex}`).setLabel("No").setStyle(ButtonStyle.Secondary)
          );
          const chestDisabledRow = new ActionRowBuilder().addComponents(
           new ButtonBuilder().setCustomId(`explore_chest_yes|${expeditionId}|${ruinsCharIndex}`).setLabel("Yes").setStyle(ButtonStyle.Success).setDisabled(true),
           new ButtonBuilder().setCustomId(`explore_chest_no|${expeditionId}|${ruinsCharIndex}`).setLabel("No").setStyle(ButtonStyle.Secondary).setDisabled(true)
          );
          const resultMsg = await i.followUp({ embeds: [resultEmbed], components: [chestRow], fetchReply: true }).catch(() => null);
          if (resultMsg) {
           const chestCollector = resultMsg.createMessageComponentCollector({
            filter: (ci) => ci.user.id === i.user.id,
            time: 5 * 60 * 1000,
            max: 1,
           });
           chestCollector.on("collect", async (ci) => {
            await ci.deferUpdate();
            await resultMsg.edit({ components: [chestDisabledRow] }).catch(() => {});
            if (ci.customId.endsWith("_yes") || ci.customId.includes("_yes|")) {
             const chestParts = ci.customId.split("|");
             const chestOpenerIndex = chestParts.length >= 3 && /^\d+$/.test(chestParts[2])
              ? parseInt(chestParts[2], 10)
              : ruinsCharIndex;
             const result = await handleExplorationChestOpen(ci, expeditionId, location, chestOpenerIndex);
             if (result === null) {
              const fp = await Party.findActiveByPartyId(expeditionId);
              const errEmbed = new EmbedBuilder()
               .setTitle("❌ **Couldn't open chest**")
               .setColor("#b91c1c")
               .setDescription("Something went wrong opening the chest. Try </explore roll> to continue.")
               .setImage(regionImages[fp?.region] || EXPLORATION_IMAGE_FALLBACK);
              addExplorationStandardFields(errEmbed, { party: fp || {}, expeditionId, location, nextCharacter: fp?.characters?.[fp.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
              await resultMsg.edit({ embeds: [errEmbed], components: [chestDisabledRow] }).catch(() => {});
              return;
             }
             if (result.notEnoughStamina) {
              const fp = await Party.findActiveByPartyId(expeditionId);
              const noStamEmbed = new EmbedBuilder()
               .setTitle(resultTitle)
               .setColor(regionColors[fp?.region] || "#00ff99")
               .setDescription(resultDescription.split("\n\n")[0] + "\n\n❌ **Not enough stamina or hearts to open the chest.** Party has " + (fp?.totalStamina ?? 0) + " 🟩 and " + (fp?.totalHearts ?? 0) + " ❤ (need 1). **Camp** to recover, or use hearts to **Struggle** (1 heart = 1 stamina).")
               .setImage(regionImages[fp?.region] || EXPLORATION_IMAGE_FALLBACK);
              addExplorationStandardFields(noStamEmbed, { party: fp, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
              await resultMsg.edit({ embeds: [noStamEmbed], components: [chestDisabledRow] }).catch(() => {});
              return;
             }
             if (result?.lootEmbed) {
              const fp = await Party.findActiveByPartyId(expeditionId);
              const openedEmbed = new EmbedBuilder()
               .setTitle(resultTitle)
               .setColor(regionColors[fp?.region] || "#00ff99")
               .setDescription(resultDescription.split("\n\n")[0] + `\n\n**Chest opened!** Continue with </explore roll:${getExploreCommandId()}>.`)
               .setImage(regionImages[fp?.region] || EXPLORATION_IMAGE_FALLBACK);
              addExplorationStandardFields(openedEmbed, { party: fp, expeditionId, location, nextCharacter: result.nextCharacter ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
              await resultMsg.edit({ embeds: [openedEmbed], components: [chestDisabledRow] }).catch(() => {});
              await ci.followUp({ embeds: [result.lootEmbed] }).catch(() => {});
              if (result.nextCharacter?.userId) await ci.followUp({ content: `<@${result.nextCharacter.userId}> it's your turn now` }).catch(() => {});
             }
            } else {
             const skipEmbed = new EmbedBuilder()
              .setTitle(resultTitle)
              .setColor(regionColors[finalParty?.region] || "#00ff99")
              .setDescription(resultDescription.split("\n\n")[0] + `\n\n**Chest wasn't opened!** Continue with </explore roll:${getExploreCommandId()}>.`)
              .setImage(regionImages[finalParty?.region] || EXPLORATION_IMAGE_FALLBACK);
             addExplorationStandardFields(skipEmbed, { party: finalParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
             await resultMsg.edit({ embeds: [skipEmbed], components: [chestDisabledRow] }).catch(() => {});
            }
           });
           chestCollector.on("end", (collected, reason) => {
            if (reason === "time" && collected.size === 0 && resultMsg.editable) {
             resultMsg.edit({ components: [chestDisabledRow] }).catch(() => {});
            }
           });
          }
         } else {
          await i.followUp({ embeds: [resultEmbed] }).catch(() => {});
          if (ruinsFailedNotifyUserIds.length > 0 && ruinsFailedNotifyEmbed) {
           await i.followUp({
            content: ruinsFailedNotifyUserIds.map((uid) => `<@${uid}>`).join(" ") + " — Couldn't DM you:",
            embeds: [ruinsFailedNotifyEmbed],
           }).catch(() => {});
          }
          const nextUserId = nextCharacter?.userId;
          const nextName = nextCharacter?.name ?? "Next player";
          await i.followUp({
            content: nextUserId
              ? `OK, keep going — <@${nextUserId}> it's your turn. Use \`/explore roll\` to continue.`
              : `OK, keep going — **${nextName}**, use \`/explore roll\` to continue.`,
          }).catch(() => {});
         }
         return;
        }

        if (outcomeType === "chest") {
         if (isYes) {
          const chestParts = i.customId.split("|");
          const chestOpenerIndex = chestParts.length >= 3 && /^\d+$/.test(chestParts[2])
           ? parseInt(chestParts[2], 10)
           : undefined;
          const result = await handleExplorationChestOpen(i, expeditionId, location, chestOpenerIndex);
          if (result === null) {
           const freshParty = await Party.findActiveByPartyId(expeditionId);
           const errEmbed = new EmbedBuilder()
            .setTitle("❌ **Couldn't open chest**")
            .setColor("#b91c1c")
            .setDescription("Something went wrong opening the chest. Try </explore roll> to continue.")
            .setImage(regionImages[freshParty?.region] || EXPLORATION_IMAGE_FALLBACK);
           addExplorationStandardFields(errEmbed, { party: freshParty || {}, expeditionId, location, nextCharacter: freshParty?.characters?.[freshParty.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
           await msg.edit({ embeds: [errEmbed], components: [disabledRow] }).catch(() => {});
           return;
          }
          if (result.notEnoughStamina) {
           const freshParty = await Party.findActiveByPartyId(expeditionId);
           const noStaminaEmbed = new EmbedBuilder()
            .setTitle("🗺️ **Expedition: Chest found!**")
            .setColor(regionColors[freshParty?.region] || "#00ff99")
            .setDescription(description.split("\n\n")[0] + "\n\n❌ **Not enough stamina or hearts to open the chest.** Party has " + (freshParty?.totalStamina ?? 0) + " 🟩 and " + (freshParty?.totalHearts ?? 0) + " ❤ (need 1). **Camp** to recover, or use hearts to **Struggle** (1 heart = 1 stamina).")
            .setImage(regionImages[freshParty?.region] || EXPLORATION_IMAGE_FALLBACK);
           addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
           await msg.edit({ embeds: [noStaminaEmbed], components: [disabledRow] }).catch(() => {});
          return;
          }
          if (result?.lootEmbed) {
           const freshParty = await Party.findActiveByPartyId(expeditionId);
           const openedEmbed = new EmbedBuilder()
            .setTitle("🗺️ **Expedition: Chest opened!**")
            .setColor(regionColors[freshParty?.region] || "#00ff99")
            .setDescription(description.split("\n\n")[0] + `\n\n**Chest opened!** Continue with </explore roll:${getExploreCommandId()}>.`)
            .setImage(regionImages[freshParty?.region] || EXPLORATION_IMAGE_FALLBACK);
           addExplorationStandardFields(openedEmbed, { party: freshParty, expeditionId, location, nextCharacter: result.nextCharacter ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
           await msg.edit({ embeds: [openedEmbed], components: [disabledRow] }).catch(() => {});
           await i.followUp({ embeds: [result.lootEmbed] }).catch(() => {});
           if (result.nextCharacter?.userId) {
            await i.followUp({ content: `<@${result.nextCharacter.userId}> it's your turn now` }).catch(() => {});
           }
           return;
          }
          return;
         }
         const skipEmbed = new EmbedBuilder()
          .setTitle("🗺️ **Expedition: Chest wasn't opened!**")
          .setColor(regionColors[party.region] || "#00ff99")
          .setDescription(description.split("\n\n")[0] + `\n\n**Chest wasn't opened!** Continue with </explore roll:${getExploreCommandId()}>.`)
          .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
         addExplorationStandardFields(skipEmbed, { party, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
         await msg.edit({ embeds: [skipEmbed], components: [disabledRow] }).catch(() => {});
        return;
        }

        if (outcomeType === "monster_camp") {
         const at = new Date();
         const monsterCampCosts = Object.keys(rollCostsForLog).length ? rollCostsForLog : undefined;
         const monsterCampChoice = i.customId.includes("_mark")
           ? "mark"
           : i.customId.includes("_fight")
             ? "fight"
             : "leave";
         if (monsterCampChoice === "mark") {
          await pushDiscoveryToMap(party, "monster_camp", at, i.user?.id);
          pushProgressLog(party, character.name, "monster_camp", `Found a monster camp in ${location}; marked on map (fight later).`, undefined, monsterCampCosts, at);
          logger.info("EXPLORE", `Counted monster_camp at ${location}: user marked on map (counts toward 3-per-square discovery limit).`);
          await party.save();
          const monsterCampEmbed = new EmbedBuilder()
           .setTitle("🗺️ **Expedition: Monster Camp found!**")
           .setColor(regionColors[party.region] || "#00ff99")
           .setDescription(
            description.split("\n\n")[0] + "\n\n" +
            `✅ **Marked on map.** You can fight it when you return (or after the next Blood Moon if already cleared). Continue with </explore roll:${getExploreCommandId()}>.`
           )
           .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
          addExplorationStandardFields(monsterCampEmbed, { party, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
          await msg.edit({ embeds: [monsterCampEmbed], components: [disabledRow] }).catch(() => {});
          return;
         }
         if (monsterCampChoice === "fight") {
          const freshParty = await Party.findActiveByPartyId(expeditionId);
          if (!freshParty) {
           await i.followUp({ embeds: [new EmbedBuilder().setTitle("Error").setDescription("Expedition not found.").setColor(0xff0000)], ephemeral: true }).catch(() => {});
           return;
          }
          await pushDiscoveryToMap(freshParty, "monster_camp", at, i.user?.id);
          pushProgressLog(freshParty, character.name, "monster_camp", `Found a monster camp in ${location}; marked on map and fighting now.`, undefined, monsterCampCosts, at);
          logger.info("EXPLORE", `Counted monster_camp at ${location}: user chose Fight (marked on map, counts toward 3-per-square discovery limit).`);
          const squareId = (freshParty.square && String(freshParty.square).trim()) || "";
          const quadrantId = (freshParty.quadrant && String(freshParty.quadrant).trim()) || "";
          const regionKey = (freshParty.region && String(freshParty.region).trim()) || "Eldin";
          const regionCapitalized = regionKey.charAt(0).toUpperCase() + regionKey.slice(1).toLowerCase();
          let camp;
          try {
           camp = await MonsterCamp.findOrCreate(squareId, quadrantId, regionCapitalized);
          } catch (err) {
           logger.error("EXPLORE", `MonsterCamp findOrCreate failed: ${err?.message || err}`);
           await i.followUp({ content: "❌ Failed to find or create monster camp.", ephemeral: true }).catch(() => {});
           return;
          }
          const isFightable = await MonsterCamp.isFightable(camp);
          if (!isFightable) {
           pushProgressLog(freshParty, character.name, "monster_camp_fight_blocked", `Found a monster camp in ${location}; camp recently cleared (wait for Blood Moon).`, undefined, monsterCampCosts, at);
           await freshParty.save();
           const blockedEmbed = new EmbedBuilder()
            .setTitle("🗺️ **Expedition: Monster Camp found!**")
            .setColor(regionColors[freshParty.region] || "#00ff99")
            .setDescription(
             description.split("\n\n")[0] + "\n\n" +
             `🔴 **This camp was recently cleared.** Wait for the next Blood Moon to fight it again. Continue with </explore roll:${getExploreCommandId()}>.`
            )
            .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
          addExplorationStandardFields(blockedEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
          await msg.edit({ embeds: [blockedEmbed], components: [disabledRow] }).catch(() => {});
          return;
          }
          const village = REGION_TO_VILLAGE[regionKey?.toLowerCase()] || "Inariko";
          const MONSTER_CAMP_DIFFICULTIES = ["beginner", "beginner+", "easy", "easy+", "mixed-low", "mixed-medium", "intermediate", "intermediate+"];
          const difficultyGroup = MONSTER_CAMP_DIFFICULTIES[Math.floor(Math.random() * MONSTER_CAMP_DIFFICULTIES.length)];
          const monsterCount = 2 + Math.floor(Math.random() * 4);
          const modifiedInteraction = {
           channel: i.channel,
           client: i.client,
           guild: i.guild,
           user: i.user,
           editReply: async () => {},
           followUp: async (opts) => i.channel.send(opts),
          };
          const { startWave, joinWave } = require("../../modules/waveModule");
          const { createWaveEmbed } = require("../../embeds/embeds.js");
          let waveResult;
          try {
           waveResult = await startWave(village, monsterCount, difficultyGroup, modifiedInteraction);
          } catch (waveErr) {
           logger.error("EXPLORE", `startWave failed for monster camp: ${waveErr?.message || waveErr}`);
           await i.followUp({ content: `❌ Failed to start wave: ${waveErr?.message || "Unknown error"}`, ephemeral: true }).catch(() => {});
           return;
          }
          const { waveId, waveData } = waveResult;
          waveData.source = "monster_camp";
          waveData.monsterCampId = camp.campId;
          waveData.channelId = i.channel.id;
          await waveData.save();
          const joinedNames = [];
          const failedJoins = [];
          for (const slot of freshParty.characters || []) {
           try {
            const charDoc = await Character.findById(slot._id);
            if (!charDoc) continue;
            if (charDoc.blighted && charDoc.blightStage >= 3) {
             failedJoins.push(`${charDoc.name} (Blight Stage ${charDoc.blightStage})`);
             continue;
            }
            if (String(charDoc.currentVillage || "").toLowerCase() !== String(village).toLowerCase()) {
             failedJoins.push(`${charDoc.name} (wrong village)`);
             continue;
            }
            await joinWave(charDoc, waveId);
            joinedNames.push(charDoc.name);
           } catch (joinErr) {
            failedJoins.push(`${slot.name || "Unknown"} (${joinErr?.message || joinErr})`);
           }
          }
          const waveEmbed = createWaveEmbed(waveData);
          const joinNote = joinedNames.length > 0
           ? `**All party members** (${joinedNames.join(", ")}) must fight. `
           : "";
          await i.channel.send({
           content: `🌊 **MONSTER CAMP WAVE!** — A wave has been triggered at **${location}**!\n\n${joinNote}Use \`/wave id:${waveId}\` to take your turn. **The expedition pauses until the wave is complete.**`,
           embeds: [waveEmbed],
          });
          if (failedJoins.length > 0) {
           logger.warn("EXPLORE", `Some party members could not auto-join monster camp wave: ${failedJoins.join("; ")}`);
          }
          pushProgressLog(freshParty, character.name, "monster_camp_fight", `Found a monster camp in ${location}; marked on map and started wave ${waveId}. All party members must fight.`, undefined, monsterCampCosts, at);
          await freshParty.save();
          const monsterCampEmbed = new EmbedBuilder()
           .setTitle("🗺️ **Expedition: Monster Camp found!**")
           .setColor(regionColors[freshParty.region] || "#00ff99")
           .setDescription(
            description.split("\n\n")[0] + "\n\n" +
            `✅ **Marked on map and fighting now!** All party members must fight. Use \`/wave id:${waveId}\` to take turns. **Do not use /explore roll until the wave is complete.**`
           )
           .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
          addExplorationStandardFields(monsterCampEmbed, { party: freshParty, expeditionId, location, nextCharacter: null, showNextAndCommands: false, showRestSecureMove: false, ruinRestRecovered });
          await msg.edit({ embeds: [monsterCampEmbed], components: [disabledRow] }).catch(() => {});
          return;
         }
         if (monsterCampChoice === "leave") {
          pushProgressLog(party, character.name, "monster_camp_skipped", `Found a monster camp in ${location}; didn't mark it (won't count toward discovery limit).`, undefined, monsterCampCosts, at);
          logger.info("EXPLORE", `Skipped counting monster_camp at ${location}: user chose Leave (not marked on map; does not count toward 3-per-square discovery limit).`);
          await party.save();
          const monsterCampEmbed = new EmbedBuilder()
           .setTitle("🗺️ **Expedition: Monster Camp found!**")
           .setColor(regionColors[party.region] || "#00ff99")
           .setDescription(
            description.split("\n\n")[0] + "\n\n" +
            `✅ **You didn't mark it.** Won't be recorded as a discovery (squares have 3 max). Continue with </explore roll:${getExploreCommandId()}>.`
           )
           .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
          addExplorationStandardFields(monsterCampEmbed, { party, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
          await msg.edit({ embeds: [monsterCampEmbed], components: [disabledRow] }).catch(() => {});
          return;
         }
        }

        if (outcomeType === "grotto") {
         const at = new Date();
         if (isYes) {
          // Yes = cleanse (handled by handleGrottoCleanse; discovery pushed there if needed)
          await handleGrottoCleanse(i, msg, party, expeditionId, characterIndex, location, disabledRow, nextCharacter, ruinRestRecovered);
          return;
         }
         // No = mark on map for later
         await pushDiscoveryToMap(party, "grotto", at, i.user?.id);
         pushProgressLog(party, character.name, "grotto", `Found a grotto in ${location}; marked on map for later.`, undefined, undefined, at);
         await party.save();
         const grottoEmbed = new EmbedBuilder()
          .setTitle("🗺️ **Expedition: Grotto found!**")
          .setColor(regionColors[party.region] || "#00ff99")
          .setDescription(
           description.split("\n\n")[0] + "\n\n" +
           `✅ **You marked it on the map for later.** Continue with </explore roll:${getExploreCommandId()}>.`
          )
          .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
         addExplorationStandardFields(grottoEmbed, { party, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
         await msg.edit({ embeds: [grottoEmbed], components: [disabledRow] }).catch(() => {});
         return;
        }

        if (outcomeType === "ruins" && !isYes) {
         const at = new Date();
         pushProgressLog(party, character.name, "ruins_skipped", `Found ruins in ${location}; left for later (won't count toward discovery limit).`, undefined, undefined, at);
         logger.info("EXPLORE", `Skipped counting ruins at ${location}: user chose No / left for later (does not count toward 3-per-square discovery limit).`);
         await party.save();
        }

        const intro = description.split("\n\n")[0];
        const choiceEmbed = new EmbedBuilder()
         .setTitle(title)
         .setColor(regionColors[party.region] || "#00ff99")
         .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
        if (outcomeType === "ruins") {
         choiceEmbed.setDescription(
          intro +
          "\n\n" +
          (isYes
           ? "✅ **You chose to explore the ruins!** (Cost 3 stamina.)"
           : `✅ **${character.name} left the ruins for later.**`)
         );
        } else {
         choiceEmbed.setDescription(
          intro +
          "\n\n" +
          (isYes
           ? "✅ **You'll attempt to cleanse the grotto!** (Cost 1 Goddess Plume + 1 stamina.)"
           : `✅ **You marked it on the map for later.** Continue with </explore roll:${getExploreCommandId()}>.`)
         );
        }
        addExplorationStandardFields(choiceEmbed, {
          party,
          expeditionId,
          location,
          nextCharacter: nextCharacter ?? null,
          showNextAndCommands: true,
          showRestSecureMove: false,
          ruinRestRecovered,
        });
        await msg.edit({ embeds: [choiceEmbed], components: [disabledRow] }).catch(() => {});
        if (outcomeType === "ruins" && !isYes && nextCharacter?.userId) {
         await i.followUp({
          content: `**${character.name}** decided not to explore the ruins! <@${nextCharacter.userId}> take your turn.`,
         }).catch(() => {});
        }
       });
       collector.on("end", async (collected, reason) => {
        if (reason === "time" && collected.size === 0 && msg.editable) {
         const fp = await Party.findActiveByPartyId(expeditionId);
         if (fp) {
          if (outcomeType === "monster_camp") {
           pushProgressLog(fp, character.name, "monster_camp_skipped", `Found a monster camp in ${location}; choice timed out (not marked).`, undefined, Object.keys(rollCostsForLog).length ? rollCostsForLog : undefined, new Date());
           logger.info("EXPLORE", `Skipped counting monster_camp at ${location}: choice timed out (not marked; does not count toward discovery limit).`);
           const timeoutDisabledRowMonsterCamp = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
             .setCustomId(`explore_monster_camp_mark|${expeditionId}|${characterIndex}`)
             .setLabel("Mark it")
             .setStyle(ButtonStyle.Primary)
             .setDisabled(true),
            new ButtonBuilder()
             .setCustomId(`explore_monster_camp_fight|${expeditionId}|${characterIndex}`)
             .setLabel("Fight it")
             .setStyle(ButtonStyle.Success)
             .setDisabled(true),
            new ButtonBuilder()
             .setCustomId(`explore_monster_camp_leave|${expeditionId}|${characterIndex}`)
             .setLabel("Leave it")
             .setStyle(ButtonStyle.Secondary)
             .setDisabled(true)
           );
           msg.edit({ components: [timeoutDisabledRowMonsterCamp] }).catch(() => {});
          } else if (outcomeType === "ruins") {
           pushProgressLog(fp, character.name, "ruins_skipped", `Found ruins in ${location}; choice timed out (left for later).`, undefined, undefined, new Date());
           logger.info("EXPLORE", `Skipped counting ruins at ${location}: choice timed out (not marked; does not count toward discovery limit).`);
          } else if (outcomeType === "grotto") {
           pushProgressLog(fp, character.name, "grotto_skipped", `Found a grotto in ${location}; choice timed out (no action).`, undefined, undefined, new Date());
           logger.info("EXPLORE", `Skipped grotto at ${location}: choice timed out (no action; does not count toward discovery limit).`);
          }
          if (outcomeType === "monster_camp" || outcomeType === "ruins" || outcomeType === "grotto") {
           await fp.save();
          }
         }
         if (outcomeType === "monster_camp") {
          // Already edited in monster_camp block above
         } else {
         const timeoutDisabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_yes|${expeditionId}|${characterIndex}`)
           .setLabel("Yes")
           .setStyle(ButtonStyle.Success)
           .setDisabled(true),
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_no|${expeditionId}|${characterIndex}`)
           .setLabel("No")
           .setStyle(ButtonStyle.Secondary)
           .setDisabled(true)
         );
         msg.edit({ components: [timeoutDisabledRow] }).catch(() => {});
         }
        }
       });
      }
      return;
     }

     if (outcomeType === "item") {
      const allItems = await fetchAllItems();
      const regionKey = party.region?.toLowerCase() || "";
      const availableItems = allItems.filter(
       (item) => item[regionKey]
      );

      logger.info("EXPLORE", `Item outcome: region=${regionKey}, allItems=${allItems?.length ?? 0}, availableForRegion=${availableItems.length}`);

      if (availableItems.length === 0) {
       logger.warn("EXPLORE", `No items available for region "${regionKey}" — check item schema has region field`);
       return interaction.editReply("No items available for this region.");
      }

      // Rarity-weighted pick: common items (low rarity) more likely, rare less likely. FV 50 = neutral spread. Fallback to uniform if no itemRarity.
      const weightedList = createWeightedItemList(availableItems, 50);
      const selectedItem = weightedList.length > 0
       ? weightedList[Math.floor(Math.random() * weightedList.length)]
       : availableItems[Math.floor(Math.random() * availableItems.length)];

      logger.info("EXPLORE", `Item found (roll outcome): ${selectedItem.itemName} | location=${location} | character=${character.name}`);
      appendExploreStat(`${new Date().toISOString()}\tfinal\titem\t${location}\trarity=${selectedItem.itemRarity ?? "?"}`);

      pushProgressLog(party, character.name, "item", `Found ${selectedItem.itemName} in ${location}.`, undefined, Object.keys(rollCostsForLog).length ? rollCostsForLog : undefined);
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save();

      const nextCharacter = party.characters[party.currentTurn];
      const embed = createExplorationItemEmbed(
       party,
       character,
       selectedItem,
       expeditionId,
       location,
       party.totalHearts,
       party.totalStamina,
       nextCharacter ?? null,
       true,
       ruinRestRecovered
      );

      if (!party.gatheredItems) {
       party.gatheredItems = [];
      }

      party.gatheredItems.push({
       characterId: character._id,
       characterName: character.name,
       itemName: selectedItem.itemName,
       quantity: 1,
       emoji: selectedItem.emoji || "",
      });

      await interaction.editReply({ embeds: [embed] });
      await interaction.followUp({ content: `<@${nextCharacter.userId}> it's your turn now` });

      try {
       await addItemInventoryDatabase(
        character._id,
        selectedItem.itemName,
        1,
        interaction,
        "Exploration"
       );
      } catch (error) {
       handleInteractionError(error, interaction, { source: "explore.js" });
       logger.error("EXPLORE", `Could not add item to inventory: ${error.message}`);
      }
     } else if (outcomeType === "monster") {
      // Check if character has blight stage 3 or higher (monsters don't attack them)
      if (character.blighted && character.blightStage >= 3) {
        return interaction.editReply({
          content: `❌ **${character.name} cannot encounter monsters during exploration!**\n\n<:blight_eye:805576955725611058> At **Blight Stage ${character.blightStage}**, monsters no longer attack your character. You cannot encounter monsters until you are healed.`,
          ephemeral: true
        });
      }

      const monsters = await getMonstersByRegion(party.region.toLowerCase());
      if (!monsters || monsters.length === 0) {
       return interaction.editReply("No monsters available for this region.");
      }

      const selectedMonster = getExplorationMonsterFromList(monsters);
      logger.info("EXPLORE", `Encounter: ${selectedMonster.name} (Tier ${selectedMonster.tier})`);
      appendExploreStat(`${new Date().toISOString()}\tfinal\tmonster\t${location}\ttier=${selectedMonster.tier ?? "?"}`);

      if (selectedMonster.tier > 4 && !DISABLE_EXPLORATION_RAIDS) {
       try {
        const village = REGION_TO_VILLAGE[party.region?.toLowerCase()] || "Inariko";
        const raidResult = await triggerRaid(
         selectedMonster,
         interaction,
         village,
         false,
         character,
         false,
         expeditionId
        );

        if (!raidResult || !raidResult.success) {
         // Check if it's a cooldown error
         if (raidResult?.error && raidResult.error.includes('Raid cooldown active')) {
          logger.warn("EXPLORE", `Raid cooldown active during exploration: ${raidResult.error}`);
          await interaction.editReply(
           `⏰ **${raidResult.error}**\n\n🗺️ **The monster has retreated due to recent raid activity. Try exploring again later.**`
          );
         } else {
          logger.error("EXPLORE", `Failed to trigger raid for battle: ${raidResult?.error || "Unknown error"}`);
          await interaction.editReply(
           "**An error occurred during the raid setup.**"
          );
         }
         return;
        }

        const battleId = raidResult.raidId;
        const raidData = raidResult.raidData || {};
        const monsterHearts = raidData.monster
         ? { current: raidData.monster.currentHearts, max: raidData.monster.maxHearts }
         : { current: selectedMonster.hearts, max: selectedMonster.hearts };
        const monsterDefeated = monsterHearts.current === 0;

        pushProgressLog(party, character.name, "raid", `Encountered ${selectedMonster.name} (tier ${selectedMonster.tier}) in ${location}. Raid started.`, undefined, Object.keys(rollCostsForLog).length ? rollCostsForLog : undefined);
        party.currentTurn = (party.currentTurn + 1) % party.characters.length;
        await party.save();

        const nextCharacterRaid = party.characters[party.currentTurn];
        const embed = createExplorationMonsterEmbed(
         party,
         character,
         selectedMonster,
         expeditionId,
         location,
         party.totalHearts,
         party.totalStamina,
         nextCharacterRaid ?? null,
         true,
         ruinRestRecovered
        );

        embed.addFields(
         {
          name: `💙 __Monster Hearts__`,
          value: `${monsterHearts.current}/${monsterHearts.max}`,
          inline: true,
         },
         { name: "🆔 **__Raid ID__**", value: battleId, inline: true },
         {
          name: `⚔️ __Raid Outcome__`,
          value: monsterDefeated ? "Monster defeated!" : "Raid in progress...",
          inline: false,
         }
        );

        if (monsterDefeated) {
         const items = await fetchItemsByMonster(selectedMonster.name);
         const rawItem = items.length > 0 ? items[Math.floor(Math.random() * items.length)] : null;
         const lootedItem = await resolveExplorationMonsterLoot(selectedMonster.name, rawItem);

         if (lootedItem) {
          const qty = lootedItem.quantity ?? 1;
          embed.addFields({
           name: `🎉 __Loot Found__`,
           value: `${lootedItem.emoji || ""} **${lootedItem.itemName}**${qty > 1 ? ` x${qty}` : ""}`,
           inline: false,
          });

          await addItemInventoryDatabase(
           character._id,
           lootedItem.itemName,
           qty,
           interaction,
           "Exploration Loot"
          );

          if (!party.gatheredItems) {
           party.gatheredItems = [];
          }
          party.gatheredItems.push({
           characterId: character._id,
           characterName: character.name,
           itemName: lootedItem.itemName,
           quantity: qty,
           emoji: lootedItem.emoji || "",
          });
         }
        }

        await interaction.editReply({ embeds: [embed] });
        await interaction.followUp({ content: `<@${nextCharacterRaid.userId}> it's your turn now` });
       } catch (error) {
        handleInteractionError(error, interaction, { source: "explore.js" });
        logger.error("EXPLORE", `Raid processing failed: ${error?.message || error}`);
        await interaction.editReply("**An error occurred during the raid.**");
       }
      } else {

       const diceRoll = Math.floor(Math.random() * 100) + 1;
       const {
        damageValue,
        adjustedRandomValue,
        attackSuccess,
        defenseSuccess,
       } = calculateFinalValue(character, diceRoll);
       logger.info("CMBT", `Exploration battle - Damage: ${damageValue}, Roll: ${adjustedRandomValue}/100`);

       const outcome = await getEncounterOutcome(
        character,
        selectedMonster,
        damageValue,
        adjustedRandomValue,
        attackSuccess,
        defenseSuccess
       );

       if (outcome.hearts > 0) {
        party.totalHearts = Math.max(0, party.totalHearts - outcome.hearts);

        character.currentHearts = Math.max(
         0,
         character.currentHearts - outcome.hearts
        );

        if (character.currentHearts === 0) {
         logger.info("CMBT", `${character.name} defeated by ${selectedMonster.name}`);
         await handleKO(character._id);
        }

        await character.save();

        party.characters[characterIndex].currentHearts = character.currentHearts;
        party.characters[characterIndex].currentStamina = character.currentStamina;
        party.markModified("characters");
        party.totalHearts = party.characters.reduce(
         (sum, c) => sum + (c.currentHearts ?? 0),
         0
        );
        party.totalStamina = party.characters.reduce(
         (sum, c) => sum + (c.currentStamina ?? 0),
         0
        );
       }

       if (party.totalHearts <= 0) {
        await handleExpeditionFailed(party, interaction);
        return;
       }

       let lootedItem = null;
       if (outcome.canLoot) {
        const items = await fetchItemsByMonster(selectedMonster.name);
        const rawItem = items.length > 0 ? items[Math.floor(Math.random() * items.length)] : null;
        lootedItem = await resolveExplorationMonsterLoot(selectedMonster.name, rawItem);
        logger.info("LOOT", `Monster loot: ${selectedMonster.name} → ${lootedItem?.itemName ?? "none"} (pool=${items.length})`);
       }

       const monsterMsg = outcome.hearts > 0
        ? `Fought ${selectedMonster.name} in ${location}. ${outcome.result}. Lost ${outcome.hearts} heart(s).${outcome.canLoot ? " Got loot." : ""}`
        : `Fought ${selectedMonster.name} in ${location}. ${outcome.result}.${outcome.canLoot ? " Got loot." : ""}`;
       const monsterCosts =
        outcome.hearts > 0 || Object.keys(rollCostsForLog).length > 0
         ? { ...(outcome.hearts > 0 && { heartsLost: outcome.hearts }), ...rollCostsForLog }
         : undefined;
       pushProgressLog(party, character.name, "monster", monsterMsg, lootedItem ? { itemName: lootedItem.itemName, emoji: lootedItem.emoji || "" } : undefined, monsterCosts);
       party.currentTurn = (party.currentTurn + 1) % party.characters.length;
       await party.save();

       const nextCharacterTier = party.characters[party.currentTurn];
       const embed = createExplorationMonsterEmbed(
        party,
        character,
        selectedMonster,
        expeditionId,
        location,
        party.totalHearts,
        party.totalStamina,
        nextCharacterTier ?? null,
        true,
        ruinRestRecovered
       );

       const hasEquippedWeapon = !!(character?.gearWeapon?.name);
       const hasEquippedArmor = !!(
        character?.gearArmor?.head?.name ||
        character?.gearArmor?.chest?.name ||
        character?.gearArmor?.legs?.name
       );
       const battleOutcomeDisplay = (() => {
        if (outcome.hearts && outcome.hearts > 0) {
         return outcome.result === "KO" ? generateDamageMessage("KO") : generateDamageMessage(outcome.hearts);
        }
        if (outcome.defenseSuccess) {
         return generateDefenseBuffMessage(outcome.defenseSuccess, outcome.adjustedRandomValue, outcome.damageValue, hasEquippedArmor);
        }
        if (outcome.attackSuccess) {
         return generateAttackBuffMessage(outcome.attackSuccess, outcome.adjustedRandomValue, outcome.damageValue, hasEquippedWeapon);
        }
        if (outcome.result === "Win!/Loot" || outcome.result === "Win!/Loot (1HKO)") {
         if (character && character.isModCharacter && outcome.result === "Win!/Loot (1HKO)") {
          const { generateModCharacterVictoryMessage } = require("../../modules/flavorTextModule.js");
          return generateModCharacterVictoryMessage(character.name, character.modTitle, character.modType);
         }
         return generateVictoryMessage(outcome.adjustedRandomValue, outcome.defenseSuccess, outcome.attackSuccess);
        }
        if (outcome.result && typeof outcome.result === "string" && outcome.result.includes("HEART(S)")) {
         const heartMatch = outcome.result.match(/(\d+)\s*HEART\(S\)/);
         if (heartMatch) return generateDamageMessage(parseInt(heartMatch[1]));
        }
        if (outcome.result && (outcome.result.includes("divine power") || outcome.result.includes("legendary prowess") || outcome.result.includes("ancient") || outcome.result.includes("divine authority"))) {
         return outcome.result;
        }
        return generateFinalOutcomeMessage(outcome.damageValue || 0, outcome.defenseSuccess || false, outcome.attackSuccess || false, outcome.adjustedRandomValue || 0, outcome.damageValue || 0, hasEquippedWeapon, hasEquippedArmor);
       })();
       embed.addFields({ name: `⚔️ __Battle Outcome__`, value: battleOutcomeDisplay, inline: false });

       if (outcome.hearts > 0 && character.currentHearts === 0) {
        embed.addFields({
         name: "💀 __Party member KO'd__",
         value: `**${character.name}** is KO'd! They had **${outcome.hearts}** heart(s). The party loses **${outcome.hearts}** heart(s). A fairy or tonic must be used to revive them (use </explore item:${getExploreCommandId()}> when the expedition prompts you).`,
         inline: false,
        });
       }

       if (outcome.canLoot && lootedItem) {
        const qty = lootedItem.quantity ?? 1;
        embed.addFields({
         name: `🎉 __Loot Found__`,
         value: `${lootedItem.emoji || ""} **${lootedItem.itemName}**${qty > 1 ? ` x${qty}` : ""}`,
         inline: false,
        });

        await addItemInventoryDatabase(
         character._id,
         lootedItem.itemName,
         qty,
         interaction,
         "Exploration Loot"
        );

        if (!party.gatheredItems) {
         party.gatheredItems = [];
        }
        party.gatheredItems.push({
         characterId: character._id,
         characterName: character.name,
         itemName: lootedItem.itemName,
         quantity: qty,
         emoji: lootedItem.emoji || "",
        });
       }

       addExplorationCommandsField(embed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextCharacterTier ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
       });

       await interaction.editReply({ embeds: [embed] });
       await interaction.followUp({ content: `<@${nextCharacterTier.userId}> it's your turn now` });
      }
     }
    } catch (error) {
     handleInteractionError(error, interaction, { source: "explore.js" });
     logger.error("EXPLORE", `Roll command error: ${error?.message || error}`);
     await interaction.editReply(
      "An error occurred while processing the roll command."
     );
    }

    // ------------------- Secure Quadrant Command -------------------
   } else if (subcommand === "secure") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply("Expedition ID not found.");
    }

    const character = await Character.findOne({ name: characterName, userId });
    if (!character) {
     return interaction.editReply(
      "Character not found or you do not own this character."
     );
    }

    const characterIndex = party.characters.findIndex(
     (char) => char.name === characterName
    );

    if (characterIndex === -1) {
     return interaction.editReply(
      "Your character is not part of this expedition."
     );
    }

    if (party.currentTurn !== characterIndex) {
     const nextCharacter = party.characters[party.currentTurn];
     const notYourTurnEmbed = new EmbedBuilder()
       .setTitle("⏳ Not Your Turn")
       .setColor(regionColors[party.region] || "#FF9800")
       .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     return interaction.editReply({ embeds: [notYourTurnEmbed] });
    }

    if (party.quadrantState !== "explored") {
     const locationSecure = `${party.square} ${party.quadrant}`;
     const nextChar = party.characters[party.currentTurn];
     const notExploredEmbed = new EmbedBuilder()
       .setTitle("🔒 Quadrant Not Explored")
       .setColor(regionColors[party.region] || "#FF9800")
       .setDescription(
         `You can only **Secure** quadrants that have been fully explored.\n\n` +
         `**${locationSecure}** has not been explored yet. Use **Explore** to reveal this quadrant, then you can secure it.`
       )
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(notExploredEmbed, {
       party,
       expeditionId,
       location: locationSecure,
       nextCharacter: nextChar ?? null,
       showNextAndCommands: true,
       showRestSecureMove: true,
       commandsLast: true,
     });
     addExplorationCommandsField(notExploredEmbed, {
       party,
       expeditionId,
       location: locationSecure,
       nextCharacter: nextChar ?? null,
       showNextAndCommands: true,
       showRestSecureMove: true,
       isAtStartQuadrant: (() => {
        const start = START_POINTS_BY_REGION[party.region];
        return start && String(party.square || "").toUpperCase() === String(start.square || "").toUpperCase() && String(party.quadrant || "").toUpperCase() === String(start.quadrant || "").toUpperCase();
       })(),
     });
     return interaction.editReply({ embeds: [notExploredEmbed] });
    }

    const staminaCost = 5;
    const securePayResult = await payStaminaOrStruggle(party, characterIndex, staminaCost, { order: "currentFirst" });
    if (!securePayResult.ok) {
     return interaction.editReply(
      `Not enough stamina or hearts to secure (need ${staminaCost} total). Party has ${party.totalStamina ?? 0} stamina and ${party.totalHearts ?? 0} hearts. **Camp** to recover stamina, or use hearts to **Struggle** (1 heart = 1 stamina).`
     );
    }
    character.currentStamina = party.characters[characterIndex].currentStamina;
    character.currentHearts = party.characters[characterIndex].currentHearts;

    const requiredResources = ["Wood", "Eldin Ore"];
    const availableResources = party.characters.flatMap((char) => char.items);
    const hasResources = requiredResources.every((resource) =>
     availableResources.some((item) =>
      item.itemName === resource || item.itemName === `${resource} Bundle`
     )
    );

    if (!hasResources) {
     const locationSecure = `${party.square} ${party.quadrant}`;
     const nextChar = party.characters[party.currentTurn];
     const embed = new EmbedBuilder()
      .setTitle("🚫 **Cannot Secure Quadrant**")
      .setColor(regionColors[party.region] || "#FF9800")
      .setDescription(
        `To secure **${locationSecure}**, the party needs **Wood** and **Eldin Ore** (in someone's expedition loadout).\n\nContinue exploring to find these resources, then try **Secure** again. Use the commands below for your next action.`
      )
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationSecure,
      nextCharacter: nextChar ?? null,
      showNextAndCommands: true,
      showRestSecureMove: true,
      commandsLast: true,
     });
     addExplorationCommandsField(embed, {
      party,
      expeditionId,
      location: locationSecure,
      nextCharacter: nextChar ?? null,
      showNextAndCommands: true,
      showRestSecureMove: true,
      isAtStartQuadrant: (() => {
       const start = START_POINTS_BY_REGION[party.region];
       return start && String(party.square || "").toUpperCase() === String(start.square || "").toUpperCase() && String(party.quadrant || "").toUpperCase() === String(start.quadrant || "").toUpperCase();
      })(),
     });
     return interaction.editReply({ embeds: [embed] });
    }

    // Cost already applied by payStaminaOrStruggle

    // Remove Wood and Eldin Ore (or their bundles) from the party — one of each from whoever has them
    for (const resource of requiredResources) {
     for (let ci = 0; ci < party.characters.length; ci++) {
      const idx = (party.characters[ci].items || []).findIndex(
       (item) => item.itemName === resource || item.itemName === `${resource} Bundle`
      );
      if (idx !== -1) {
       party.characters[ci].items.splice(idx, 1);
       break;
      }
     }
    }
    party.markModified("characters");

    // Mark quadrant as secured in the canonical map (exploringMap) — use case-insensitive squareId to match dashboard
    const mapSquareId = (party.square && String(party.square).trim()) || "";
    const mapQuadrantId = (party.quadrant && String(party.quadrant).trim().toUpperCase()) || "";
    if (mapSquareId && mapQuadrantId) {
     try {
      const squareIdRegex = new RegExp(`^${mapSquareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
      const mapResult = await Square.updateOne(
       { squareId: squareIdRegex, "quadrants.quadrantId": mapQuadrantId },
       { $set: { "quadrants.$[q].status": "secured" } },
       { arrayFilters: [{ "q.quadrantId": mapQuadrantId }] }
      );
      if (mapResult.matchedCount === 0) {
       logger.warn("EXPLORE", `Secure map update: no square found for ${mapSquareId} quadrant ${mapQuadrantId}`);
      }
     } catch (mapErr) {
      logger.error("EXPLORE", `Failed to update map quadrant status to secured: ${mapErr.message}`);
     }
    }

    party.quadrantState = "secured";
    party.markModified("quadrantState");
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;

    const locationSecure = `${party.square} ${party.quadrant}`;
    const secureCostsForLog = { ...(securePayResult.staminaPaid > 0 && { staminaLost: securePayResult.staminaPaid }), ...(securePayResult.heartsPaid > 0 && { heartsLost: securePayResult.heartsPaid }) };
    pushProgressLog(
     party,
     character.name,
     "secure",
     `Secured ${locationSecure} using Wood and Eldin Ore (-${staminaCost} party stamina). Quadrant secured; no stamina cost to explore here.`,
     undefined,
     Object.keys(secureCostsForLog).length ? secureCostsForLog : undefined
    );
    await party.save();

    const nextCharacterSecure = party.characters[party.currentTurn];
    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Secured ${locationSecure}**`)
     .setColor(regionColors[party.region] || "#FF9800")
     .setDescription(
      `${character.name} secured the quadrant using resources (-${staminaCost} party stamina).`
     )
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationSecure,
      nextCharacter: nextCharacterSecure ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      commandsLast: true,
    });
    const explorePageUrlSecure = `${(process.env.DASHBOARD_URL || process.env.APP_URL || "https://tinglebot.xyz").replace(/\/$/, "")}/explore/${encodeURIComponent(expeditionId)}`;
    embed.addFields({
      name: "📋 **__Benefits__**",
      value: "Quadrant secured. No stamina cost to explore here, increased safety. You can draw your path on the dashboard before moving:\n🔗 " + explorePageUrlSecure,
      inline: false,
     });
    const startPointSecure = START_POINTS_BY_REGION[party.region];
    const isAtStartQuadrantSecure =
      startPointSecure &&
      String(party.square || "").toUpperCase() === String(startPointSecure.square || "").toUpperCase() &&
      String(party.quadrant || "").toUpperCase() === String(startPointSecure.quadrant || "").toUpperCase();
    addExplorationCommandsField(embed, {
      party,
      expeditionId,
      location: locationSecure,
      nextCharacter: nextCharacterSecure ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      showSecuredQuadrantOnly: true,
      isAtStartQuadrant: !!isAtStartQuadrantSecure,
    });

    await interaction.editReply({ embeds: [embed] });
    await interaction.followUp({
      content: `**Next:** Camp, Item, or Move. <@${nextCharacterSecure.userId}> it's your turn.`,
    });

    // ------------------- Move to Adjacent Quadrant -------------------
   } else if (subcommand === "move") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const quadrantInput = interaction.options.getString("quadrant") || "";
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply("Expedition ID not found.");
    }

    const character = await Character.findOne({ name: characterName, userId });
    if (!character) {
     return interaction.editReply(
      "Character not found or you do not own this character."
     );
    }

    const characterIndex = party.characters.findIndex(
     (char) => char.name === characterName
    );

    if (characterIndex === -1) {
     return interaction.editReply(
      "Your character is not part of this expedition."
     );
    }

    if (party.currentTurn !== characterIndex) {
     const nextCharacter = party.characters[party.currentTurn];
     const notYourTurnEmbed = new EmbedBuilder()
       .setTitle("⏳ Not Your Turn")
       .setColor(regionColors[party.region] || "#FF9800")
       .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     return interaction.editReply({ embeds: [notYourTurnEmbed] });
    }

    if (party.status !== "started") {
     return interaction.editReply("This expedition has not been started yet.");
    }

    // Sync quadrant state from map (exploringMap / Square model) — secured/explored on map means Move is allowed
    const moveSquareId = String(party.square || "").trim();
    const moveSquareIdRegex = moveSquareId ? new RegExp(`^${moveSquareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") : null;
    const mapSquareForMove = moveSquareIdRegex ? await Square.findOne({ squareId: moveSquareIdRegex }) : null;
    if (mapSquareForMove?.quadrants?.length && party.square && party.quadrant) {
     const qMove = mapSquareForMove.quadrants.find(
      (qu) => String(qu.quadrantId).toUpperCase() === String(party.quadrant || "").toUpperCase()
     );
     if (qMove && (qMove.status === "explored" || qMove.status === "secured")) {
      party.quadrantState = qMove.status;
      party.markModified("quadrantState");
     }
    }
    // Fallback: if progress log shows we secured this location, treat as secured (map may be out of sync)
    if (party.quadrantState !== "explored" && party.quadrantState !== "secured") {
     const lastOutcomeHere = getLastProgressOutcomeForLocation(party, party.square, party.quadrant);
     if (lastOutcomeHere === "secure") {
      party.quadrantState = "secured";
      party.markModified("quadrantState");
     }
    }

    // Only allow Move when the expedition has prompted Move: (1) quadrant secured, or (2) quadrant explored AND last action here was "explored" (empty) or "move" (we showed the full menu with Move)
    const quadrantState = (party.quadrantState || "").toLowerCase();
    if (quadrantState !== "explored" && quadrantState !== "secured") {
     const moveBlockedEmbed = new EmbedBuilder()
      .setTitle("🚫 **Move not available**")
      .setColor(regionColors[party.region] || "#b91c1c")
      .setDescription(
       "You can't use **Move** right now. This quadrant hasn't been explored yet.\n\n" +
       `Use </explore roll:${getExploreCommandId()}> to explore the current quadrant first. **Move** only becomes available when the expedition prompts you (e.g. after exploring, or when the quadrant is secured).`
      )
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(moveBlockedEmbed, {
      party,
      expeditionId,
      location: `${party.square} ${party.quadrant}`,
      nextCharacter: party.characters[party.currentTurn] ?? null,
      showNextAndCommands: false,
      showRestSecureMove: false,
     });
     return interaction.editReply({ embeds: [moveBlockedEmbed] });
    }
    if (quadrantState === "explored") {
     const lastOutcome = getLastProgressOutcomeForLocation(party, party.square, party.quadrant);
     const moveWasPrompted = lastOutcome === "explored" || lastOutcome === "move";
     if (!moveWasPrompted) {
      const moveBlockedEmbed = new EmbedBuilder()
       .setTitle("🚫 **Move not available**")
       .setColor(regionColors[party.region] || "#b91c1c")
       .setDescription(
        "You can't use **Move** right now. The expedition hasn't prompted you to move.\n\n" +
        `Use </explore roll:${getExploreCommandId()}> (or respond to the current prompt) until you see the **Quadrant Explored** menu with Roll, Item, Camp, Secure, and **Move**. Only then can you use **Move**.`
       )
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(moveBlockedEmbed, {
       party,
       expeditionId,
       location: `${party.square} ${party.quadrant}`,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: false,
       showRestSecureMove: false,
      });
      return interaction.editReply({ embeds: [moveBlockedEmbed] });
     }
    }

    const currentSquare = party.square;
    const currentQuadrant = party.quadrant;
    const adjacent = getAdjacentQuadrants(currentSquare, currentQuadrant);

    // Parse "H8 - Q1" or "H8 Q1" format
    const trimmed = quadrantInput.trim();
    let targetSquare, targetQuadrant;
    if (trimmed.includes(" - ")) {
     const parts = trimmed.split(" - ");
     targetSquare = (parts[0] || "").trim().toUpperCase();
     targetQuadrant = (parts[1] || "").trim().toUpperCase();
    } else {
     const spaceIdx = trimmed.lastIndexOf(" ");
     targetSquare = spaceIdx > 0 ? trimmed.slice(0, spaceIdx).trim().toUpperCase() : trimmed.toUpperCase();
     targetQuadrant = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1).trim().toUpperCase() : null;
    }

    const newLocation = adjacent.find(
     (a) =>
      String(a.square || "").toUpperCase() === targetSquare &&
      String(a.quadrant || "").toUpperCase() === (targetQuadrant || "").toUpperCase()
    );

    if (!newLocation) {
     return interaction.editReply(
      "That quadrant is not adjacent to your current location. Pick one of the suggested quadrants."
     );
    }

    // Move cost: 2 if unexplored, 1 if explored, 0 if secured
    let destinationQuadrantState = "unexplored";
    let destQ = null;
    const destMapSquare = await Square.findOne({ squareId: newLocation.square });
    if (destMapSquare && destMapSquare.quadrants && destMapSquare.quadrants.length) {
     destQ = destMapSquare.quadrants.find(
      (qu) => String(qu.quadrantId).toUpperCase() === String(newLocation.quadrant).toUpperCase()
     );
     if (destQ && (destQ.status === "explored" || destQ.status === "secured")) {
      destinationQuadrantState = destQ.status;
     }
    }
    const moveWasReveal = destinationQuadrantState === "unexplored";
    const staminaCost = destinationQuadrantState === "secured" ? 0 : destinationQuadrantState === "unexplored" ? 2 : 1;
    let movePayResult = null;
    if (staminaCost > 0) {
     movePayResult = await payStaminaOrStruggle(party, characterIndex, staminaCost, { order: "currentFirst" });
     if (!movePayResult.ok) {
      const location = `${party.square} ${party.quadrant}`;
      return interaction.editReply({
       embeds: [createStuckInWildEmbed(party, location)],
      });
     }
     character.currentStamina = party.characters[characterIndex].currentStamina;
     character.currentHearts = party.characters[characterIndex].currentHearts;
    }
    const moveCostsForLog = staminaCost > 0 && movePayResult
     ? { ...(movePayResult.staminaPaid > 0 && { staminaLost: movePayResult.staminaPaid }), ...(movePayResult.heartsPaid > 0 && { heartsLost: movePayResult.heartsPaid }) }
     : undefined;
    // Block leaving the square until all quadrants (except inaccessible) are explored or secured
    // Exception: allow moving to the starting square (where they can end the expedition) even if current square isn't fully explored
    const targetSquareNorm = String(newLocation.square || "").trim().toUpperCase();
    const currentSquareNorm = String(currentSquare || "").trim().toUpperCase();
    const startPoint = START_POINTS_BY_REGION[party.region];
    const isMovingToStart = startPoint &&
     targetSquareNorm === String(startPoint.square || "").trim().toUpperCase() &&
     String(newLocation.quadrant || "").toUpperCase() === String(startPoint.quadrant || "").trim().toUpperCase();

    // Exception: allow moving to a square that is fully explored (retreat/backtrack - "go back the way you came")
    let isMovingToFullyExploredSquare = false;
    if (destMapSquare && destMapSquare.quadrants && destMapSquare.quadrants.length) {
     const targetUnexplored = destMapSquare.quadrants.filter((q) => {
      const s = (q.status || "").toLowerCase();
      return s !== "inaccessible" && s !== "explored" && s !== "secured";
     });
     isMovingToFullyExploredSquare = targetUnexplored.length === 0;
    }

    if (targetSquareNorm !== currentSquareNorm && !isMovingToStart && !isMovingToFullyExploredSquare) {
     const currentMapSquare = await Square.findOne({ squareId: currentSquare });
     if (currentMapSquare && currentMapSquare.quadrants && currentMapSquare.quadrants.length) {
      const unexplored = currentMapSquare.quadrants
       .filter((q) => {
        const s = (q.status || "").toLowerCase();
        return s !== "inaccessible" && s !== "explored" && s !== "secured";
       })
       .map((q) => (q.quadrantId || "").trim().toUpperCase())
       .filter(Boolean);
      if (unexplored.length > 0) {
       const quadList = unexplored.join(", ");
       const locationMove = `${currentSquare} ${party.quadrant}`;
       const cantLeaveEmbed = new EmbedBuilder()
        .setTitle("🚫 **Can't leave yet**")
        .setColor(regionColors[party.region] || "#b91c1c")
        .setDescription(
         `You can't leave **${currentSquare}** until the whole square is explored.\n\n` +
         `**Still unexplored:** ${quadList}\n\n` +
         `Use the **Move** command again to explore the remaining quadrant(s), then you can move to an adjacent square.`
        )
        .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
       addExplorationStandardFields(cantLeaveEmbed, {
        party,
        expeditionId,
        location: locationMove,
        nextCharacter: party.characters[party.currentTurn] ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
      });
       return interaction.editReply({ embeds: [cantLeaveEmbed] });
      }
     }
    }

    // When leaving a square, clear reportable discoveries in that square that were NOT pinned (not in reportedDiscoveryKeys). Marked discoveries are kept.
    const leavingSquare = String(currentSquare || "").trim().toUpperCase();
    const reportedSet = new Set(Array.isArray(party.reportedDiscoveryKeys) ? party.reportedDiscoveryKeys.filter((k) => typeof k === "string" && k.length > 0) : []);
    let clearedCount = 0;
    const clearedKeys = [];
    const skippedKeys = [];
    if (leavingSquare && party.progressLog && Array.isArray(party.progressLog)) {
     party.progressLog = party.progressLog.filter((e) => {
      if (!DISCOVERY_CLEANUP_OUTCOMES.includes(e.outcome)) return true;
      const m = LOC_IN_MESSAGE_RE.exec(e.message || "");
      if (!m || !m[1]) return true;
      const entrySquare = String(m[1]).trim().toUpperCase();
      const entryQuadrant = (m[2] || "").trim().toUpperCase();
      if (entrySquare !== leavingSquare) return true;
      const atStr = e.at instanceof Date ? e.at.toISOString() : (typeof e.at === "string" ? e.at : "");
      const key = `${e.outcome}|${entrySquare}|${entryQuadrant}|${atStr}`;
      if (reportedSet.has(key)) {
       skippedKeys.push(key);
       return true;
      }
      clearedCount += 1;
      clearedKeys.push(key);
      return false;
     });
     if (clearedCount > 0) party.markModified("progressLog");
     if (clearedKeys.length > 0 || skippedKeys.length > 0) {
      logger.info("EXPLORE", `Leave square discovery cleanup: partyId=${party.partyId}, square=${leavingSquare}, cleared=${clearedKeys.length}, skipped=${skippedKeys.length}`);
     }
    }

    // Cost already applied by payStaminaOrStruggle when staminaCost > 0

    party.square = newLocation.square;
    party.quadrant = newLocation.quadrant;
    // Entering a quadrant counts as exploring it: mark explored in map and party (unless already secured)
    if (destinationQuadrantState === "unexplored") {
     const mapSquareId = (newLocation.square && String(newLocation.square).trim()) || "";
     const mapQuadrantId = (newLocation.quadrant && String(newLocation.quadrant).trim().toUpperCase()) || "";
     if (mapSquareId && mapQuadrantId) {
      try {
       const squareIdRegex = new RegExp(`^${mapSquareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
       await Square.updateOne(
        { squareId: squareIdRegex, "quadrants.quadrantId": mapQuadrantId },
        {
         $set: {
          "quadrants.$[q].status": "explored",
          "quadrants.$[q].exploredBy": interaction.user?.id || party.leaderId || "",
          "quadrants.$[q].exploredAt": new Date(),
         },
        },
        { arrayFilters: [{ "q.quadrantId": mapQuadrantId }] }
       );
       if (!party.exploredQuadrantsThisRun) party.exploredQuadrantsThisRun = [];
       party.exploredQuadrantsThisRun.push({ squareId: mapSquareId, quadrantId: mapQuadrantId });
       party.markModified("exploredQuadrantsThisRun");
      } catch (mapErr) {
       logger.error("EXPLORE", `Failed to mark quadrant explored on move: ${mapErr.message}`);
      }
     }
     destinationQuadrantState = "explored";
    }
    party.quadrantState = destinationQuadrantState;
    party.markModified("quadrantState");
    const locationMove = `${newLocation.square} ${newLocation.quadrant}`;
    const quadrantStateLabel = destinationQuadrantState === "secured" ? "secured" : "explored";
    const directionLabel = newLocation.direction || "to";
    pushProgressLog(
     party,
     character.name,
     "move",
    staminaCost > 0
      ? `Moved ${directionLabel} **${locationMove}** (quadrant ${quadrantStateLabel}). (-${staminaCost} stamina)`
      : `Moved ${directionLabel} **${locationMove}** (quadrant ${quadrantStateLabel}).`,
    undefined,
    moveCostsForLog
   );
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    if (destQ && destQ.blighted) {
     await applyBlightExposure(
      party,
      newLocation.square,
      newLocation.quadrant,
      moveWasReveal ? "reveal" : "travel",
      character.name
     );
    }

    const nextCharacterMove = party.characters[party.currentTurn];
    const moveToUnexplored = moveWasReveal;
    let moveDescription = moveToUnexplored
     ? `Moved to a new location!`
     : `${character.name} led the party to **${locationMove}** (quadrant ${quadrantStateLabel}).`;
    if (clearedCount > 0) {
     moveDescription += `\n\n⚠️ **${clearedCount} unmarked discovery(ies) in ${currentSquare} were forgotten.** Place pins on the dashboard before moving to keep them on the map.`;
    }

    // If this quadrant is an old map location, check if any party member has that map and show prompt
    const quadWithMap = destMapSquare && destMapSquare.quadrants ? destMapSquare.quadrants.find(
      (qu) => String(qu.quadrantId).toUpperCase() === String(newLocation.quadrant).toUpperCase()
    ) : null;
    if (quadWithMap && quadWithMap.oldMapNumber != null) {
      const mapItemName = `Map #${quadWithMap.oldMapNumber}`;
      const leadsToLabel = (quadWithMap.oldMapLeadsTo || "treasure").charAt(0).toUpperCase() + (quadWithMap.oldMapLeadsTo || "").slice(1);
      const whoHasMap = [];
      try {
        for (const pc of party.characters) {
          const hasIt = await hasAppraisedOldMap(pc.name, quadWithMap.oldMapNumber);
          if (hasIt) whoHasMap.push(pc.name);
        }
        if (whoHasMap.length > 0) {
          moveDescription += `\n\n🗺️ **Map location!** This area is marked on **${mapItemName}**. ${whoHasMap.join(", ")} ${whoHasMap.length === 1 ? "has" : "have"} the map — you've found the location of a **${leadsToLabel}**! More info: ${OLD_MAPS_LINK}`;
        }
      } catch (invErr) {
        logger.warn("EXPLORE", `Could not check old map collection: ${invErr?.message || invErr}`);
      }
    }

    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Moved to ${newLocation.square} ${newLocation.quadrant}**`)
     .setColor(regionColors[party.region] || "#2196F3")
     .setDescription(moveDescription)
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
    const moveToSecured = destinationQuadrantState === "secured";
    const moveIsAtStart = (() => {
     const start = START_POINTS_BY_REGION[party.region];
     return start && String(party.square || "").toUpperCase() === String(start.square || "").toUpperCase() && String(party.quadrant || "").toUpperCase() === String(start.quadrant || "").toUpperCase();
    })();
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationMove,
      nextCharacter: nextCharacterMove ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      commandsLast: true,
    });
    addExplorationCommandsField(embed, {
      party,
      expeditionId,
      location: locationMove,
      nextCharacter: nextCharacterMove ?? null,
      showNextAndCommands: true,
      showRestSecureMove: !moveToSecured && !moveToUnexplored,
      showSecuredQuadrantOnly: moveToSecured,
      showMoveToUnexploredOnly: moveToUnexplored,
      isAtStartQuadrant: moveIsAtStart,
    });

    await interaction.editReply({ embeds: [embed] });
    await interaction.followUp({ content: `<@${nextCharacterMove.userId}> it's your turn now` });

    // ------------------- Use Item (healing from expedition loadout) -------------------
   } else if (subcommand === "item") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const itemName = interaction.options.getString("item");
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply("Expedition ID not found.");
    }

    const character = await Character.findOne({ name: characterName, userId });
    if (!character) {
     return interaction.editReply(
      "Character not found or you do not own this character."
     );
    }

    const characterIndex = party.characters.findIndex(
     (c) => c.name === characterName
    );
    if (characterIndex === -1) {
     return interaction.editReply(
      "Your character is not part of this expedition."
     );
    }

    if (party.status !== "started") {
     return interaction.editReply("This expedition has not been started yet.");
    }

    const partyChar = party.characters[characterIndex];
    const itemIndex = partyChar.items.findIndex(
     (i) => i.itemName && i.itemName.trim().toLowerCase() === (itemName || "").trim().toLowerCase()
    );
    if (itemIndex === -1) {
     return interaction.editReply(
      `Your character doesn't have **${itemName}** in their expedition loadout.`
     );
    }

    const carried = partyChar.items[itemIndex];
    const hearts = Math.max(0, carried.modifierHearts || 0);
    const stamina = Math.max(0, carried.staminaRecovered || 0);

    if (hearts === 0 && stamina === 0) {
     return interaction.editReply(
      "That item can only be used when securing the quadrant (e.g. Wood Bundle, Eldin Ore Bundle)."
     );
    }

    if (hearts > 0) {
     character.currentHearts = Math.min(
      character.maxHearts,
      character.currentHearts + hearts
     );
    }
    if (stamina > 0) {
     character.currentStamina = Math.min(
      character.maxStamina,
      character.currentStamina + stamina
     );
    }
    partyChar.currentHearts = character.currentHearts;
    partyChar.currentStamina = character.currentStamina;

    partyChar.items.splice(itemIndex, 1);
    party.totalHearts = party.characters.reduce(
     (sum, c) => sum + (c.currentHearts ?? 0),
     0
    );
    party.totalStamina = party.characters.reduce(
     (sum, c) => sum + (c.currentStamina ?? 0),
     0
    );

    // Using an item counts as a turn — advance to next character
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await character.save();
    await party.save();

    const heartsText = hearts > 0 ? `+${hearts} ❤️` : "";
    const staminaText = stamina > 0 ? `+${stamina} 🟩` : "";
    const effect = [heartsText, staminaText].filter(Boolean).join(", ");
    const locationItem = `${party.square} ${party.quadrant}`;

    const nextCharacterItem = party.characters[party.currentTurn] ?? null;
    pushProgressLog(party, character.name, "item", `${character.name} used ${carried.itemName} in ${locationItem} (${effect}).`, undefined, {
     ...(hearts > 0 ? { heartsRecovered: hearts } : {}),
     ...(stamina > 0 ? { staminaRecovered: stamina } : {}),
    });
    await party.save();

    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Used item — ${carried.itemName}**`)
     .setColor(regionColors[party.region] || "#4CAF50")
     .setDescription(
      `${character.name} used **${carried.itemName}** (${effect}).`
     )
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK)
     .addFields(
      {
       name: `❤️ **__${character.name} Hearts__**`,
       value: `${character.currentHearts}/${character.maxHearts}`,
       inline: true,
      },
      {
       name: `🟩 **__${character.name} Stamina__**`,
       value: `${character.currentStamina}/${character.maxStamina}`,
       inline: true,
      }
     );
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationItem,
      nextCharacter: nextCharacterItem,
      showNextAndCommands: true,
      showRestSecureMove: false,
      commandsLast: true,
    });
    addExplorationCommandsField(embed, {
      party,
      expeditionId,
      location: locationItem,
      nextCharacter: nextCharacterItem,
      showNextAndCommands: true,
      showRestSecureMove: false,
    });

    await interaction.editReply({ embeds: [embed] });
    if (nextCharacterItem?.userId) {
     await interaction.followUp({ content: `<@${nextCharacterItem.userId}> it's your turn now` }).catch(() => {});
    }

    // ------------------- End Expedition (at starting quadrant) -------------------
   } else if (subcommand === "end") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply("Expedition ID not found.");
    }

    const character = await Character.findOne({ name: characterName, userId });
    if (!character) {
     return interaction.editReply(
      "Character not found or you do not own this character."
     );
    }

    const characterIndex = party.characters.findIndex(
     (c) => c.name === characterName
    );
    if (characterIndex === -1) {
     return interaction.editReply(
      "Your character is not part of this expedition."
     );
    }

    const startPoint = START_POINTS_BY_REGION[party.region];
    if (!startPoint) {
     return interaction.editReply("Could not determine the starting quadrant for this region.");
    }
    const isAtStartQuadrant = String(party.square || "").toUpperCase() === String(startPoint.square || "").toUpperCase() &&
     String(party.quadrant || "").toUpperCase() === String(startPoint.quadrant || "").toUpperCase();
    if (!isAtStartQuadrant) {
     return interaction.editReply(
      "You can only end the expedition when at the starting quadrant for your region. Use **Move** to return to the start first."
     );
    }

    const regionToVillage = {
     eldin: "rudania",
     lanayru: "inariko",
     faron: "vhintl",
    };
    const targetVillage = regionToVillage[party.region];

    // Divide remaining hearts and stamina evenly among the group (each gets equal share, capped at max)
    const remainingHearts = Math.max(0, party.totalHearts ?? 0);
    const remainingStamina = Math.max(0, party.totalStamina ?? 0);
    const memberCount = (party.characters || []).length;
    const splitLinesEnd = [];
    if (memberCount > 0 && (remainingHearts > 0 || remainingStamina > 0)) {
     const heartsPerMember = Math.floor(remainingHearts / memberCount);
     const heartsRemainder = remainingHearts % memberCount;
     const staminaPerMember = Math.floor(remainingStamina / memberCount);
     const staminaRemainder = remainingStamina % memberCount;
     for (let idx = 0; idx < party.characters.length; idx++) {
      const partyCharacter = party.characters[idx];
      const char = await Character.findById(partyCharacter._id);
      if (char) {
       const heartShare = heartsPerMember + (idx < heartsRemainder ? 1 : 0);
       const staminaShare = staminaPerMember + (idx < staminaRemainder ? 1 : 0);
       const maxH = char.maxHearts ?? 0;
       const maxS = char.maxStamina ?? 0;
       char.currentHearts = Math.min(maxH, heartShare);
       char.currentStamina = Math.min(maxS, staminaShare);
       char.currentVillage = targetVillage;
       await char.save();
       // Sync party document so dashboard expedition report shows same split as embed
       partyCharacter.currentHearts = char.currentHearts;
       partyCharacter.currentStamina = char.currentStamina;
       const name = partyCharacter.name || char.name || "Unknown";
       splitLinesEnd.push(`${name}: ${heartShare} ❤, ${staminaShare} stamina`);
      }
     }
    } else if (memberCount > 0) {
     for (const partyCharacter of party.characters) {
      const char = await Character.findById(partyCharacter._id);
      if (char) {
       char.currentVillage = targetVillage;
       await char.save();
      }
     }
    }

    // Return any remaining loadout items to each character's inventory
    for (const partyCharacter of party.characters || []) {
     const items = partyCharacter.items || [];
     for (const item of items) {
      if (item && item.itemName) {
       await addItemInventoryDatabase(
        partyCharacter._id,
        item.itemName,
        1,
        interaction,
        "Expedition ended — returned from party"
       ).catch((err) => logger.error("EXPLORE", `Return item to owner: ${err.message}`));
      }
     }
    }

    const villageLabelEnd = targetVillage.charAt(0).toUpperCase() + targetVillage.slice(1);
    const memberNamesEnd = (party.characters || []).map((c) => c.name).filter(Boolean);
    const membersTextEnd = memberNamesEnd.length > 0 ? memberNamesEnd.join(", ") : "—";
    pushProgressLog(party, character.name, "end", `Expedition ended. Returned to ${villageLabelEnd}: ${membersTextEnd}.`, undefined, undefined);

    party.status = "completed";
    await party.save();

    // Stats and highlights from progressLog and gatheredItems (use saved party with "end" entry)
    const log = party.progressLog || [];
    const turnsOrActions = log.filter((e) => e.outcome !== "end").length;
    const itemsGathered = Array.isArray(party.gatheredItems)
      ? party.gatheredItems.reduce((sum, g) => sum + (typeof g.quantity === "number" ? g.quantity : 1), 0)
      : 0;
    const highlightOutcomes = new Set();
    for (const e of log) {
      const o = e.outcome;
      if (o === "ruins" || o === "ruin_rest") highlightOutcomes.add("Found ruins");
      else if (o === "grotto" || o === "grotto_cleansed" || o === "grotto_maze_success" || o === "grotto_travel" || o === "grotto_puzzle_success" || o === "grotto_target_success" || o === "grotto_maze_raid") highlightOutcomes.add("Found grotto");
      else if (o === "monster_camp") highlightOutcomes.add("Monster camp");
      else if (o === "raid") highlightOutcomes.add("Raid");
      else if (o === "fairy") highlightOutcomes.add("Fairy");
      else if (o === "chest_open") highlightOutcomes.add("Chest opened");
      else if (o === "secure") highlightOutcomes.add("Secured quadrant");
      else if (o === "monster") highlightOutcomes.add("Defeated monster");
      else if (o === "retreat") highlightOutcomes.add("Escaped raid");
    }
    const highlightsList = [...highlightOutcomes];

    const reportBaseUrl = process.env.DASHBOARD_URL || process.env.APP_URL || "https://tinglebot.xyz";
    const reportUrl = `${reportBaseUrl.replace(/\/$/, "")}/explore/${expeditionId}`;
    const splitSectionEnd = splitLinesEnd.length > 0
      ? `**Split (remaining hearts & stamina):**\n${splitLinesEnd.join("\n")}\n\n`
      : "No remaining hearts or stamina to divide.\n\n";
    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Returned Home**`)
     .setColor(regionColors[party.region] || "#4CAF50")
     .setDescription(
      `The expedition has ended.\n\n` +
      `**Returned to ${villageLabelEnd}:**\n${membersTextEnd}\n\n` +
      splitSectionEnd +
      `**View the expedition report here:** [Open expedition report](${reportUrl})`
     )
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);

    embed.addFields({
     name: "📊 **Expedition stats**",
     value: `**${turnsOrActions}** actions · **${itemsGathered}** item(s) gathered`,
     inline: false
    });
    if (highlightsList.length > 0) {
     embed.addFields({
      name: "✨ **Highlights**",
      value: highlightsList.join(" · "),
      inline: false
     });
    }

    await interaction.editReply({ embeds: [embed] });

    // ------------------- Retreat (tier 5+ exploration raid only) -------------------
   } else if (subcommand === "retreat") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply("Expedition ID not found.");
    }

    const character = await Character.findOne({ name: characterName, userId });
    if (!character) {
     return interaction.editReply(
      "Character not found or you do not own this character."
     );
    }

    const characterIndex = party.characters.findIndex((c) => c.name === characterName);
    if (characterIndex === -1) {
     return interaction.editReply("Your character is not part of this expedition.");
    }

    if (party.status !== "started") {
     return interaction.editReply("This expedition has not been started yet.");
    }

    const raid = await Raid.findOne({ expeditionId: party.partyId, status: "active" });
    if (!raid) {
     return interaction.editReply({
      content: "Your party is not in a tier 5+ monster battle. Use **/explore retreat** only during such a battle (when a tier 5+ encounter started a raid).",
      ephemeral: true
     });
    }

    const retreatPayResult = await payStaminaOrStruggle(party, characterIndex, 1, { order: "currentFirst" });
    if (!retreatPayResult.ok) {
     return interaction.editReply(
      "Not enough stamina or hearts. A retreat attempt costs **1** (stamina or heart). The party has " + (party.totalStamina ?? 0) + " stamina and " + (party.totalHearts ?? 0) + " hearts. **Camp** to recover, or use hearts to **Struggle**."
     );
    }
    const retreatCostsForLog = { ...(retreatPayResult.staminaPaid > 0 && { staminaLost: retreatPayResult.staminaPaid }), ...(retreatPayResult.heartsPaid > 0 && { heartsLost: retreatPayResult.heartsPaid }) };

    const failedAttempts = raid.failedRetreatAttempts ?? 0;
    const retreatChance = Math.min(RETREAT_BASE_CHANCE + failedAttempts * RETREAT_BONUS_PER_FAIL, RETREAT_CHANCE_CAP);
    const success = Math.random() < retreatChance;
    if (success) {
     await endExplorationRaidAsRetreat(raid, interaction.client);
     pushProgressLog(party, character.name, "retreat", "Party attempted to retreat and escaped.", undefined, retreatCostsForLog);
     await party.save();
     const monsterName = raid.monster?.name || "the monster";
     const location = [party.square, party.quadrant].filter(Boolean).join(" ") || "Current location";
     const nextCharacter = party.characters[party.currentTurn] ?? null;
     const embed = new EmbedBuilder()
      .setTitle("🏃 **Retreat successful**")
      .setColor(regionColors[party.region] || 0x9C27B0)
      .setDescription(`The party escaped from **${monsterName}**!`)
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location,
      nextCharacter,
      showNextAndCommands: true,
      showRestSecureMove: false
     });
     return interaction.editReply({ embeds: [embed] });
    }

    raid.failedRetreatAttempts = (raid.failedRetreatAttempts ?? 0) + 1;
    await raid.save();

    pushProgressLog(party, character.name, "retreat_failed", "Party attempted to retreat but could not get away.", undefined, retreatCostsForLog);
    await party.save();

    const monsterName = raid.monster?.name || "the monster";
    const location = [party.square, party.quadrant].filter(Boolean).join(" ") || "Current location";
    const nextCharacter = party.characters[party.currentTurn] ?? null;
    const cmdRetreat = `</explore retreat:${getExploreCommandId()}>`;
    const retreatFailedEmbed = new EmbedBuilder()
      .setTitle("🏃 **Retreat failed**")
      .setColor(regionColors[party.region] || 0xFF9800)
      .setDescription(
        `The party couldn't get away from **${monsterName}**!\n\n` +
        `**Try again:** ${cmdRetreat} with id \`${expeditionId}\` and your character — costs 1 stamina (or 1 heart if you're out of stamina).`
      )
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
    addExplorationStandardFields(retreatFailedEmbed, {
      party,
      expeditionId,
      location,
      nextCharacter,
      showNextAndCommands: true,
      showRestSecureMove: false
    });
    return interaction.editReply({ embeds: [retreatFailedEmbed] });
   // ------------------- Camp Command -------------------
   } else if (subcommand === "camp") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply("Expedition ID not found.");
    }

    const character = await Character.findOne({ name: characterName, userId });
    if (!character) {
     return interaction.editReply(
      "Character not found or you do not own this character."
     );
    }

    const characterIndex = party.characters.findIndex(
     (char) => char.name === characterName
    );

    if (characterIndex === -1) {
     return interaction.editReply(
      "Your character is not part of this expedition."
     );
    }

    if (party.currentTurn !== characterIndex) {
     const nextCharacter = party.characters[party.currentTurn];
     const notYourTurnEmbed = new EmbedBuilder()
       .setTitle("⏳ Not Your Turn")
       .setColor(regionColors[party.region] || "#FF9800")
       .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     return interaction.editReply({ embeds: [notYourTurnEmbed] });
    }

    const isSecured = party.quadrantState === "secured";
    let staminaCost = isSecured ? 0 : 3;
    let heartsPct = isSecured ? 0.5 : 0.25;
    const stuckInWild = staminaCost > 0 && party.totalStamina < staminaCost;
    if (stuckInWild) {
     staminaCost = 0;
     heartsPct = 0.25;
    }

    if (staminaCost > 0) {
     const campChar = party.characters[characterIndex];
     const campCharDoc = await Character.findById(campChar._id);
     if (campCharDoc) {
      campCharDoc.currentStamina = Math.max(0, (campCharDoc.currentStamina ?? 0) - staminaCost);
      await campCharDoc.save();
      party.characters[characterIndex].currentStamina = campCharDoc.currentStamina;
      party.markModified("characters");
     }
    }

    const recoveryPerMember = [];
    for (let i = 0; i < party.characters.length; i++) {
     const partyChar = party.characters[i];
     const char = await Character.findById(partyChar._id);
     if (char) {
      const maxHrt = char.maxHearts ?? 0;
      const heartsRecovered = Math.floor(maxHrt * heartsPct);
      let staminaRecovered = 0;
      if (stuckInWild) {
       const maxStam = char.maxStamina ?? 0;
       const curStam = char.currentStamina ?? 0;
       const room = Math.max(0, maxStam - curStam);
       if (room > 0) {
        staminaRecovered = Math.min(room, Math.floor(Math.random() * 3) + 1);
        char.currentStamina = Math.min(maxStam, curStam + staminaRecovered);
        staminaRecovered = char.currentStamina - curStam;
        party.characters[i].currentStamina = char.currentStamina;
       }
      }
      recoveryPerMember.push({ name: char.name, hearts: heartsRecovered, stamina: staminaRecovered });
      char.currentHearts = Math.min(char.maxHearts, char.currentHearts + heartsRecovered);
      party.characters[i].currentHearts = char.currentHearts;
      await char.save();
     }
    }
    party.markModified("characters");
    party.totalStamina = party.characters.reduce((sum, c) => sum + (c.currentStamina ?? 0), 0);
    party.totalHearts = party.characters.reduce((sum, c) => sum + (c.currentHearts ?? 0), 0);

    const locationCamp = `${party.square} ${party.quadrant}`;
    const totalHeartsRecovered = recoveryPerMember.reduce((s, r) => s + r.hearts, 0);
    const totalStaminaRecovered = recoveryPerMember.reduce((s, r) => s + (r.stamina ?? 0), 0);
    const costsForLog = staminaCost > 0
     ? { staminaLost: staminaCost, heartsRecovered: totalHeartsRecovered }
     : { heartsRecovered: totalHeartsRecovered, ...(stuckInWild && totalStaminaRecovered > 0 && { staminaRecovered: totalStaminaRecovered }) };
    const campLogStamina = stuckInWild
     ? (totalStaminaRecovered > 0 ? ` (camp in the wild — no cost; recovered ${totalStaminaRecovered} stamina)` : " (camp in the wild — no cost)")
     : (staminaCost > 0 ? ` (-${staminaCost} stamina)` : "");
    pushProgressLog(
     party,
     character.name,
     "camp",
     `Camped at ${locationCamp}. Party recovered hearts (${Math.round(heartsPct * 100)}% of max).${campLogStamina}`,
     undefined,
     costsForLog
    );

    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    const nextCharacterCamp = party.characters[party.currentTurn];
    const recoveryValue = recoveryPerMember
     .map((r) => {
      const parts = [`${r.name}: +${r.hearts} ❤️`];
      if ((r.stamina ?? 0) > 0) parts.push(`+${r.stamina} 🟩`);
      return parts.join(" ");
     })
     .join("\n");
    const campFlavor = getRandomCampFlavor();
    const costNote = staminaCost > 0 ? ` (-${staminaCost} stamina)` : (stuckInWild ? " (no cost — camp in the wild)" : "");
    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Camp at ${locationCamp}**`)
     .setColor(regionColors[party.region] || "#4CAF50")
     .setDescription(
      `${character.name} set up camp.${costNote}\n\n\`\`\`\n${campFlavor}\n\`\`\``
     )
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationCamp,
      nextCharacter: nextCharacterCamp ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      commandsLast: true,
    });
    embed.addFields({
      name: "📋 **__Recovery__**",
      value: recoveryValue,
      inline: false,
     });
    addExplorationCommandsField(embed, {
      party,
      expeditionId,
      location: locationCamp,
      nextCharacter: nextCharacterCamp ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
    });

    await interaction.editReply({ embeds: [embed] });
    await interaction.followUp({ content: `<@${nextCharacterCamp.userId}> it's your turn now` });
   }
  } catch (error) {
   await handleInteractionError(error, interaction, {
     source: 'explore.js',
     subcommand: interaction.options?.getSubcommand()
   });
  }
 },

 async autocomplete(interaction) {
  await handleAutocomplete(interaction);
 },
};
