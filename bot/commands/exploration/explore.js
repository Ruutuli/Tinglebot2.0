// ============================================================================
// ------------------- explore.js -------------------
// Exploration command: roll, secure, move, camp, end, grotto trials, etc.
// ============================================================================

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

// ------------------- Discord ------------------
const { SlashCommandBuilder } = require("@discordjs/builders");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");

// ------------------- Database ------------------
const { fetchAllItems, fetchItemsByMonster, createRelic, getCharacterInventoryCollection, getCharacterInventoryCollectionWithModSupport, fetchMonsterByName, fetchCharacterById } = require('@/database/db.js');

// ------------------- Models ------------------
const Raid = require("../../models/RaidModel.js");
const Party = require('@/models/PartyModel.js');
const Character = require('@/models/CharacterModel.js');
const ItemModel = require('@/models/ItemModel.js');
const Square = require('@/models/mapModel.js');
const Grotto = require('@/models/GrottoModel.js');
const MonsterCamp = require('@/models/MonsterCampModel.js');
const Relic = require('@/models/RelicModel.js');

// ------------------- Modules ------------------
const { calculateFinalValue, getMonstersByRegion, getExplorationMonsterFromList, createWeightedItemList } = require("../../modules/rngModule.js");
const { getEncounterOutcome } = require("../../modules/encounterModule.js");
const { generateVictoryMessage, generateDamageMessage, generateDefenseBuffMessage, generateAttackBuffMessage, generateFinalOutcomeMessage, generateModCharacterVictoryMessage } = require("../../modules/flavorTextModule.js");
const { handleKO, healKoCharacter, useHearts } = require("../../modules/characterStatsModule.js");
const { triggerRaid, endExplorationRaidAsRetreat } = require("../../modules/raidModule.js");
const { startWave, joinWave } = require("../../modules/waveModule.js");
const MapModule = require('@/modules/mapModule.js');
const { syncPartyMemberStats, pushProgressLog, hasDiscoveriesInQuadrant, updateDiscoveryGrottoStatus, markGrottoCleared } = require("../../modules/exploreModule.js");

// ------------------- Utils ------------------
const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { addItemInventoryDatabase, removeItemInventoryDatabase } = require('@/utils/inventoryUtils.js');
const { addOldMapToCharacter, hasOldMap, hasAppraisedOldMap } = require('@/utils/oldMapUtils.js');
const { checkInventorySync } = require('@/utils/characterUtils.js');
const { enforceJail } = require('@/utils/jailCheck');
const { generateGrottoMaze, getPathCellAt, getNeighbourCoords, getCellBeyondWall } = require('@/utils/grottoMazeGenerator.js');
const { renderMazeToBuffer } = require('@/utils/grottoMazeRenderer.js');
const logger = require("@/utils/logger.js");
const fs = require("fs");
const path = require("path");

// ------------------- Data ------------------
const { rollGrottoTrialType, getTrialLabel, GROTTO_CLEARED_FLAVOR } = require('@/data/grottoTrials.js');
const { rollPuzzleConfig, getPuzzleFlavor, ensurePuzzleConfig, checkPuzzleOffer, getPuzzleConsumeItems, getRandomPuzzleSuccessFlavor } = require('@/data/grottoPuzzleData.js');
const { getRandomGrottoName, getRandomGrottoNameUnused } = require('@/data/grottoNames.js');
const { getFailOutcome, getMissOutcome, getSuccessOutcome, getCompleteOutcome } = require('@/data/grottoTargetPracticeOutcomes.js');
const { getGrottoMazeOutcome, getGrottoMazeTrapOutcome, getGazepScryingOutcome } = require('@/data/grottoMazeOutcomes.js');
const { getRandomMazeEntryFlavor } = require('@/data/grottoMazeEntryFlavors.js');
const { rollTestOfPowerMonster } = require('@/data/grottoTestOfPowerMonsters.js');
const { getRandomBlessingFlavor } = require('@/data/grottoBlessingOutcomes.js');
const { getRandomOldMap, OLD_MAPS_LINK, OLD_MAP_ICON_URL, MAP_EMBED_BORDER_URL } = require("../../data/oldMaps.js");
const { getRandomCampFlavor, getRandomSafeSpaceFlavor } = require("../../data/explorationMessages.js");

// ------------------- Embeds & Handlers ------------------
const { addExplorationStandardFields, getExplorationPartyCharacterFields, addExplorationCommandsField, createExplorationItemEmbed, createExplorationMonsterEmbed, regionColors, regionImages, getExploreCommandId, createWaveEmbed, getWaveCommandId, getItemCommandId } = require("../../embeds/embeds.js");
const { handleAutocomplete } = require("../../handlers/autocompleteHandler.js");

// ------------------- Image URLs ------------------
const EXPLORATION_IMAGE_FALLBACK = "https://via.placeholder.com/100x100";
const GROTTO_MAZE_LEGEND = "🟫 Entrance | 🟩 Exit | 🟦 Chest | 🟨 Trap | 🔴 Scrying Wall | ✖️ Used (trap/chest/wall) | 🟧 You are here | ⬜ Path | ⬛ Wall — Unexplored areas stay dark until you enter them.";
const MAZE_EMBED_COLORS = {
  success: 0x22c55e,    // green — exit, bypassed, faster path, chest
  harm: 0xdc2626,       // red — pit trap, trap triggered, stalagmites
  battle: 0xea580c,     // orange — construct appeared
  neutral: 0xfbbf24,    // amber — nothing, step_back, collapse
  scrying: 0x9333ea,    // purple — arrived at Scrying Wall
  blocked: 0x6b7280,    // gray — wall blocked
  default: 0x00ff99,    // teal — normal move, entry, etc.
};
function getMazeEmbedColor(outcomeType, regionColor) {
  if (!outcomeType) return regionColor || MAZE_EMBED_COLORS.default;
  const c = MAZE_EMBED_COLORS;
  if (['exit', 'bypassed', 'faster_path_open', 'chest'].includes(outcomeType)) return c.success;
  if (['pit_trap', 'trap', 'stalagmites'].includes(outcomeType)) return c.harm;
  if (outcomeType === 'battle') return c.battle;
  if (['collapse', 'step_back', 'nothing'].includes(outcomeType)) return c.neutral;
  return regionColor || c.default;
}
RAISED_RELIC_IMAGE_URL = "https://static.wikia.nocookie.net/zelda_gamepedia_en/images/7/7c/HW_Sealed_Weapon_Icon.png/revision/latest?cb=20150918051232";
const RELIC_EMBED_BORDER_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";

// ============================================================================
// ------------------- Constants & Configuration -------------------
// ============================================================================

// ------------------- appendExploreStat ------------------
// Append roll debug line to exploreStats.txt
function appendExploreStat(line) {
 const filePath = path.join(__dirname, "..", "..", "exploreStats.txt");
 try {
  fs.appendFileSync(filePath, line + "\n");
 } catch (e) {
  logger.warn("EXPLORE", `[explore.js]⚠️ exploreStats write failed: ${e?.message || e}`);
 }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- resolveExplorationMonsterLoot ------------------
// Chuchu loot: Chuchu Jelly (or elemental variant) instead of Chuchu Egg
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

// ------------------- buildCostsForLog ------------------
// Build stamina/hearts cost object for progress log from pay result
function buildCostsForLog(payResult) {
  if (!payResult) return {};
  const o = {};
  if (payResult.staminaPaid > 0) o.staminaLost = payResult.staminaPaid;
  if (payResult.heartsPaid > 0) o.heartsLost = payResult.heartsPaid;
  return o;
}

// ------------------- getTargetPracticeModifiers ------------------
// Modifiers from bow/slingshot, Hunter/Scout, weapon quality
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

// ------------------- Region Constants ------------------
const START_POINTS_BY_REGION = {
 eldin: { square: "H5", quadrant: "Q3" },
 lanayru: { square: "H8", quadrant: "Q2" },
 faron: { square: "F10", quadrant: "Q4" },
};

// ------------------- Village mapping (Raid: Rudania | Inariko | Vhintl) ------------------
const REGION_TO_VILLAGE = {
 eldin: "Rudania",
 lanayru: "Inariko",
 faron: "Vhintl",
};

// ------------------- Paving bundles (virtual slots, 5 base items each) ------------------
const PAVING_BUNDLES = {
 "Eldin Ore Bundle": { baseItemName: "Eldin Ore", quantityPerSlot: 5 },
 "Wood Bundle": { baseItemName: "Wood", quantityPerSlot: 5 },
};

const DISABLE_EXPLORATION_RAIDS = false; // TODO: remove when done testing

const EXPLORATION_CHEST_RELIC_CHANCE = 0.02;

// ------------------- Roll outcome chances (must sum to 1) ------------------
const EXPLORATION_OUTCOME_CHANCES = {
  monster: 0.18,
  item: 0.32,
  explored: 0.185,  // fallback when grotto can't be placed (square has grotto, at cap, etc.)
  fairy: 0.05,
  chest: 0.03,
  old_map: 0.03,
  ruins: 0.04,
  relic: 0.005,
  camp: 0.06,
  monster_camp: 0.08,
  grotto: 0.02,
};

// ------------------- Retreat (tier 5+ raids): +5% per fail, cap 95% ------------------
const RETREAT_BASE_CHANCE = 0.5;
const RETREAT_BONUS_PER_FAIL = 0.05;
const RETREAT_CHANCE_CAP = 0.95;

// ------------------- createStuckInWildEmbed ------------------
// Party out of stamina; recovery via /explore camp
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

// ------------------- payStaminaOrStruggle ------------------
// Pay cost: stamina first, then hearts for shortfall
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
        logger.warn("EXPLORE", `[explore.js]⚠️ payStaminaOrStruggle useHearts: ${err?.message || err}`);
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

// ------------------- normalizeExpeditionId ------------------
// Autocomplete may send full string; extract partyId (before first "|")
function normalizeExpeditionId(value) {
 if (!value || typeof value !== "string") return value;
 const trimmed = value.trim();
 const pipe = trimmed.indexOf("|");
 return pipe === -1 ? trimmed : trimmed.slice(0, pipe).trim();
}

// ------------------- handleExplorationChestOpen ------------------
// Open chest: pay stamina, roll loot per character, embed result
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
 const lootLines = [];
 for (const pc of party.characters) {
  const char = await Character.findById(pc._id);
  if (!char) continue;
  let isRelic = Math.random() < EXPLORATION_CHEST_RELIC_CHANCE;
  if (isRelic && (await characterAlreadyFoundRelicThisExpedition(party, char.name, char._id))) isRelic = false;
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
    lootLines.push(`${char.name}: 🔸 Unknown Relic (${savedRelic?.relicId || '—'})`);
    if (!party.gatheredItems) party.gatheredItems = [];
    party.gatheredItems.push({ characterId: char._id, characterName: char.name, itemName: "Unknown Relic", quantity: 1, emoji: "🔸" });
    pushProgressLog(party, char.name, "relic", `Found a relic in chest in ${location}; take to Artist/Researcher to appraise.`, { itemName: "Unknown Relic", emoji: "🔸" }, undefined);
   } catch (err) {
    logger.error("EXPLORE", `[explore.js]❌ createRelic (chest): ${err?.message || err}`);
    if (allItems && allItems.length > 0) {
     const fallback = allItems[Math.floor(Math.random() * allItems.length)];
     if (!party.gatheredItems) party.gatheredItems = [];
     party.gatheredItems.push({ characterId: char._id, characterName: char.name, itemName: fallback.itemName, quantity: 1, emoji: fallback.emoji || "" });
     try {
      await addItemInventoryDatabase(char._id, fallback.itemName, 1, interaction, "Exploration Chest");
      lootLines.push(`${char.name}: ${fallback.emoji || "📦"} ${fallback.itemName}`);
     } catch (_) {}
    }
   }
  } else {
   if (!allItems || allItems.length === 0) {
    logger.warn("EXPLORE", `[explore.js]⚠️ Chest: no items for ${char.name}`);
    lootLines.push(`${char.name}: (no items available)`);
    continue;
   }
   const item = allItems[Math.floor(Math.random() * allItems.length)];
   if (!party.gatheredItems) party.gatheredItems = [];
   party.gatheredItems.push({ characterId: char._id, characterName: char.name, itemName: item.itemName, quantity: 1, emoji: item.emoji || "" });
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
  hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
 });
 const lootSummary = lootLines.length > 0
  ? lootLines.map((line) => line.trim()).join(" · ")
  : "Nothing found.";
 const chestCostsForLog = buildCostsForLog(chestPayResult);
 pushProgressLog(party, character.name, "chest_open", `Opened chest in **${location}**. **Found:** ${lootSummary}`, undefined, Object.keys(chestCostsForLog).length ? chestCostsForLog : undefined);
 await party.save();
 return { lootEmbed, party, nextCharacter };
}

// ------------------- Discovery constants (3-per-square limit) ------------------
const SPECIAL_OUTCOMES = ["monster_camp", "ruins", "grotto"];
const DISCOVERY_COUNT_OUTCOMES = ["monster_camp", "grotto", "ruins", "ruins_found"];
const DISCOVERY_CLEANUP_OUTCOMES = ["monster_camp", "ruins", "grotto", "ruins_found"];
const MAX_SPECIAL_EVENTS_PER_SQUARE = 3;
const DISCOVERY_REDUCE_CHANCE_WHEN_ANY = 0.25; // 75% less chance when square has 1+ discovery

const LOC_IN_MESSAGE_RE = /\s+in\s+([A-J](?:[1-9]|1[0-2]))\s+(Q[1-4])/i;

// ------------------- hasActiveGrottoAtLocation ------------------
// True if party has an open grotto trial at current location (must complete before roll/move/discovery)
async function hasActiveGrottoAtLocation(party, expeditionId) {
  const squareId = (party?.square && String(party.square).trim()) || "";
  const quadrantId = (party?.quadrant && String(party.quadrant).trim()) || "";
  if (!squareId || !quadrantId) return false;
  const grotto = await Grotto.findOne({
    squareId,
    quadrantId,
    partyId: expeditionId,
    sealed: false,
    completedAt: null,
  });
  if (!grotto) return false;
  if (grotto.trialType === "target_practice" && grotto.targetPracticeState?.failed) return false;
  return true;
}

// ------------------- resolveGrottoAtLocation ------------------
// Resolve grotto by optional name/id, or fall back to most recently unsealed
async function resolveGrottoAtLocation(squareId, quadrantId, expeditionId, grottoOption) {
 const query = {
  squareId: new RegExp(`^${String(squareId).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  quadrantId: new RegExp(`^${String(quadrantId).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  partyId: expeditionId,
  sealed: false,
 };
 if (grottoOption && String(grottoOption).trim()) {
  const val = String(grottoOption).trim();
  if (val === "none") return null;
  const byName = await Grotto.findOne({ ...query, name: new RegExp(`^${val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  if (byName) return byName;
  try {
   const byId = await Grotto.findById(val);
   if (byId && byId.partyId === expeditionId && !byId.sealed) return byId;
  } catch (_) {}
 }
 return Grotto.findOne(query).sort({ unsealedAt: -1 });
}

// ------------------- getActiveGrottoCommand ------------------
// Returns the grotto subcommand mention for the trial type (targetpractice, maze, puzzle, continue)
function getActiveGrottoCommand(trialType) {
  const cmdId = getExploreCommandId();
  if (trialType === "target_practice") return `</explore grotto targetpractice:${cmdId}>`;
  if (trialType === "maze") return `</explore grotto maze:${cmdId}>`;
  if (trialType === "puzzle") return `</explore grotto puzzle:${cmdId}>`;
  return `</explore grotto continue:${cmdId}>`;
}

// ------------------- postGrottoMazeModVersion ------------------
// Posts the mod view (full map + solution path) to the mod channel
async function postGrottoMazeModVersion(client, layout, currentNode, grottoName, expeditionId, location, mazeState) {
  if (!layout || !client) return;
  try {
   const modBuf = await renderMazeToBuffer(layout, { viewMode: "mod", currentNode, openedChests: mazeState?.openedChests, triggeredTraps: mazeState?.triggeredTraps, usedScryingWalls: mazeState?.usedScryingWalls });
   const modFiles = [new AttachmentBuilder(modBuf, { name: "maze-mod.png" })];
   const modEmbed = new EmbedBuilder()
    .setTitle("🗺️ **Grotto: Maze — Mod view**")
    .setColor(0x9b59b6)
    .setDescription(`**${grottoName}** at ${location}\nExpedition: \`${expeditionId}\`\n\nFull map with correct path (light green), traps, chests, Scrying Walls, and party position.`)
    .setImage("attachment://maze-mod.png")
    .addFields({ name: "Map legend", value: "🟫 Start | 🟩 Exit | 🟨 Trap | 🟦 Chest | 🔴 Scrying Wall | ⬜ Path | 🟧 You are here | 🟢 Correct path | ⬛ Wall", inline: false })
    .setTimestamp();
   const channel = await client.channels.fetch("1473557438174330880").catch(() => null);
   if (channel) await channel.send({ embeds: [modEmbed], files: modFiles }).catch((err) => logger.warn("EXPLORE", `[explore.js] Maze mod post failed: ${err?.message || err}`));
  } catch (err) {
   logger.warn("EXPLORE", `[explore.js] Maze mod render failed: ${err?.message || err}`);
  }
}

// ------------------- parsePuzzleItems ------------------
// Parse items string: "Wood x50, Ancient Screw x20, Flint" -> [{ itemName, quantity }, ...]
// Format: "Name" (qty 1) or "Name xN"
function parsePuzzleItems(itemsStr) {
  if (!itemsStr || typeof itemsStr !== "string") return [];
  const parts = itemsStr.split(",").map((s) => s.trim()).filter(Boolean);
  const result = [];
  const xQtyRe = /^\s*(.+?)\s*x\s*(\d+)\s*$/i;
  for (const part of parts) {
    const m = part.match(xQtyRe);
    if (m) {
      result.push({ itemName: m[1].trim(), quantity: Math.max(1, parseInt(m[2], 10)) });
    } else {
      result.push({ itemName: part, quantity: 1 });
    }
  }
  return result;
}

// ------------------- getLastProgressOutcomeForLocation ------------------
// Most recent progress log outcome at (square, quadrant); used for Move prompt
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

// ------------------- normalizeSquareId ------------------
function normalizeSquareId(square) {
 return String(square || "").trim().toUpperCase();
}

// ------------------- countSpecialEventsInSquare ------------------
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

const MAX_GROTTOS_PER_SQUARE = 2;

// ------------------- hasGrottoInSquare ------------------
// True if square at grotto cap (from progressLog or map)
function hasGrottoInSquare(party, square, squareDoc) {
 const sq = normalizeSquareId(square);
 if (!sq) return false;
 let count = 0;
 // Map: count grottos on the Square
 if (squareDoc && squareDoc.quadrants && Array.isArray(squareDoc.quadrants)) {
  const docSquareId = normalizeSquareId(squareDoc.squareId);
  if (docSquareId === sq) {
   for (const q of squareDoc.quadrants) {
    const discoveries = q.discoveries || [];
    if (!Array.isArray(discoveries)) continue;
    for (const d of discoveries) {
     if (d && String(d.type).toLowerCase() === "grotto") count += 1;
    }
   }
  }
 }
 // Party progressLog: count outcome "grotto" for this square
 if (party.progressLog && Array.isArray(party.progressLog)) {
  for (const e of party.progressLog) {
   if (e.outcome !== "grotto") continue;
   const m = LOC_IN_MESSAGE_RE.exec(e.message || "");
   if (!m || !m[1]) continue;
   if (String(m[1]).trim().toUpperCase() !== sq) continue;
   count += 1;
  }
 }
 return count >= MAX_GROTTOS_PER_SQUARE;
}

// ------------------- characterAlreadyFoundRelicThisExpedition ------------------
// One relic per character per expedition
async function characterAlreadyFoundRelicThisExpedition(party, characterName, characterId = null) {
 const norm = (s) => (s || "").toString().trim().toLowerCase();
 if (party.progressLog && Array.isArray(party.progressLog)) {
  const foundInLog = party.progressLog.some((e) => e.outcome === "relic" && norm(e.characterName) === norm(characterName));
  if (foundInLog) return true;
 }
 // Fallback: check Relic collection — relics discovered during this expedition have discoveredDate >= party.createdAt
  if (characterId && party.createdAt) {
  try {
   const count = await Relic.countDocuments({
    characterId,
    discoveredDate: { $gte: party.createdAt },
   });
   if (count >= 1) return true;
  } catch (err) {
   logger.warn("EXPLORE", `[explore.js]⚠️ Relic check failed: ${err?.message || err}`);
  }
 }
 return false;
}

const REPORTABLE_DISCOVERY_OUTCOMES = new Set(["monster_camp", "ruins", "grotto"]);

// ------------------- pushDiscoveryToMap ------------------
// Add discovery to Square.quadrants[].discoveries for map display
async function pushDiscoveryToMap(party, outcomeType, at, userId, options = {}) {
 const squareId = (party.square && String(party.square).trim()) || "";
 const quadrantId = (party.quadrant && String(party.quadrant).trim()) || "";
 if (!squareId || !quadrantId) return;
 const discoveryKey = options.discoveryKey || `${outcomeType}|${squareId}|${quadrantId}|${(at instanceof Date ? at : new Date()).toISOString()}`;
 const discovery = {
  type: outcomeType,
  discoveredBy: userId || party.leaderId || "",
  discoveredAt: at instanceof Date ? at : new Date(),
  discoveryKey,
 };
 if (options.name) discovery.name = options.name;
 if (outcomeType === "grotto") {
  discovery.grottoStatus = options.grottoStatus ?? (options.name ? "cleansed" : "found");
 }
 await Square.updateOne(
  { squareId },
  { $push: { "quadrants.$[q].discoveries": discovery } },
  { arrayFilters: [{ "q.quadrantId": quadrantId }] }
 );
}

// ------------------- updateDiscoveryName ------------------
// Set name on an existing discovery (e.g. grotto when cleansed on revisit)
async function updateDiscoveryName(squareId, quadrantId, discoveryKey, name) {
 if (!squareId || !quadrantId || !discoveryKey || !name) return;
 await Square.updateOne(
  { squareId },
  { $set: { "quadrants.$[q].discoveries.$[d].name": name } },
  { arrayFilters: [{ "q.quadrantId": quadrantId }, { "d.discoveryKey": discoveryKey }] }
 );
}

// ------------------- findGoddessPlumeHolder ------------------
// Party loadout only (Goddess Plume must be in expedition loadout; other grotto items use regular inventory)
async function findGoddessPlumeHolder(party) {
 for (let ci = 0; ci < (party.characters || []).length; ci++) {
  const slot = party.characters[ci];
  const items = slot.items || [];
  if (items.some((it) => String(it.itemName || "").toLowerCase() === "goddess plume")) {
   const character = await Character.findById(slot._id);
   if (character) return { characterIndex: ci, character };
  }
 }
 return null;
}

// ------------------- partyHasLensOfTruth ------------------
// True if any party member has "Lens of Truth" in inventory (grottos use inventory, not party/loadout items)
async function partyHasLensOfTruth(party) {
  for (const slot of party.characters || []) {
    try {
      const collection = await getCharacterInventoryCollectionWithModSupport(slot);
      const entry = await collection.findOne({
        characterId: slot._id,
        itemName: { $regex: /^Lens of Truth$/i },
        quantity: { $gte: 1 },
      });
      if (entry) return true;
    } catch (_) { /* skip */ }
  }
  return false;
}

// ------------------- handleGrottoCleanse ------------------
// Plume + 1 stamina; create Grotto, roll trial; blessing = immediate Spirit Orbs
async function handleGrottoCleanse(i, msg, party, expeditionId, characterIndex, location, disabledRow, nextCharacter, ruinRestRecovered) {
 logger.info("EXPLORE", `[explore.js] handleGrottoCleanse ENTER expeditionId=${expeditionId} characterIndex=${characterIndex}`);
 const freshParty = await Party.findActiveByPartyId(expeditionId);
 if (!freshParty) {
  logger.warn("EXPLORE", `[explore.js] handleGrottoCleanse: expedition not found expeditionId=${expeditionId}`);
  await i.followUp({ embeds: [new EmbedBuilder().setTitle("Error").setDescription("Expedition not found.").setColor(0xff0000)], ephemeral: true }).catch(() => {});
  return;
 }
 const grottoPayResult = await payStaminaOrStruggle(freshParty, characterIndex, 1, { order: "currentFirst" });
 if (!grottoPayResult.ok) {
  logger.info("EXPLORE", `[explore.js] handleGrottoCleanse: not enough stamina/hearts expeditionId=${expeditionId}`);
  const partyTotalStamina = Math.max(0, freshParty.totalStamina ?? 0);
  const partyTotalHearts = Math.max(0, freshParty.totalHearts ?? 0);
  const charName = freshParty.characters[characterIndex]?.name || "Party";
  const at = new Date();
  pushProgressLog(freshParty, charName, "grotto", `Found a grotto in ${location}; mark on map for later (need stamina or hearts to cleanse).`, undefined, undefined, at);
  await freshParty.save();
  const noStaminaEmbed = new EmbedBuilder()
   .setTitle("❌ Not enough stamina or hearts to cleanse the grotto")
   .setColor(regionColors[freshParty.region] || "#00ff99")
   .setDescription("Party has " + partyTotalStamina + " 🟩 and " + partyTotalHearts + " ❤ (need 1 total). **Camp** to recover, or use hearts to **Struggle**. Mark the grotto on the dashboard for later.")
   .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
  addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant) });
  await msg.edit({ embeds: [noStaminaEmbed], components: [disabledRow] }).catch(() => {});
  await i.followUp({ embeds: [noStaminaEmbed], ephemeral: true }).catch(() => {});
  return;
 }
 const plumeHolder = await findGoddessPlumeHolder(freshParty);
 if (!plumeHolder) {
  logger.info("EXPLORE", `[explore.js] handleGrottoCleanse: no Goddess Plume holder in party expeditionId=${expeditionId}`);
  const charName = freshParty.characters[characterIndex]?.name || "Party";
  const at = new Date();
  pushProgressLog(freshParty, charName, "grotto", `Found a grotto in ${location}; mark on map for later (no Goddess Plume to cleanse).`, undefined, undefined, at);
  await freshParty.save();
  const noPlumeEmbed = new EmbedBuilder()
   .setTitle("❌ No Goddess Plume to cleanse the grotto")
   .setColor(regionColors[freshParty.region] || "#00ff99")
   .setDescription("No party member has a Goddess Plume in their expedition loadout. Add one to your loadout before departing, then mark the grotto on the dashboard for later or continue exploring.")
   .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
  addExplorationStandardFields(noPlumeEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant) });
  await msg.edit({ embeds: [noPlumeEmbed], components: [disabledRow] }).catch(() => {});
  await i.followUp({ embeds: [noPlumeEmbed], ephemeral: true }).catch(() => {});
  return;
 }
 const cleanseCharacter = plumeHolder.character;
 const idx = (freshParty.characters[plumeHolder.characterIndex].items || []).findIndex((it) => String(it.itemName || "").toLowerCase() === "goddess plume");
 if (idx !== -1) {
  freshParty.characters[plumeHolder.characterIndex].items.splice(idx, 1);
  freshParty.markModified("characters");
 }
 // Cost already applied by payStaminaOrStruggle

 const at = new Date();
 const squareId = (freshParty.square && String(freshParty.square).trim()) || "";
 const quadrantId = (freshParty.quadrant && String(freshParty.quadrant).trim()) || "";
 const usedGrottoNames = await Grotto.distinct("name").catch(() => []);
 const grottoName = getRandomGrottoNameUnused(usedGrottoNames);
 const discoveryKey = `grotto|${squareId}|${quadrantId}|${at.toISOString()}`;
 const trialType = rollGrottoTrialType();
 const puzzleState = trialType === 'puzzle' ? (() => {
  const cfg = rollPuzzleConfig();
  const s = { puzzleSubType: cfg.subType };
  if (cfg.subType === 'odd_structure') s.puzzleVariant = cfg.variant;
  else s.puzzleClueIndex = cfg.clueIndex;
  return s;
 })() : undefined;
 let grottoDoc = await Grotto.findOne({ squareId, quadrantId });
 if (grottoDoc) {
  grottoDoc.discoveryKey = discoveryKey;
  grottoDoc.name = grottoName;
  grottoDoc.sealed = false;
  grottoDoc.status = "cleansed";
  grottoDoc.trialType = trialType;
  grottoDoc.partyId = expeditionId;
  grottoDoc.unsealedAt = at;
  grottoDoc.unsealedBy = cleanseCharacter.name;
  grottoDoc.completedAt = null;
  grottoDoc.targetPracticeState = { turnIndex: 0, successCount: 0, failed: false };
  grottoDoc.puzzleState = puzzleState || { puzzleSubType: null, puzzleVariant: null, puzzleClueIndex: null };
  grottoDoc.testOfPowerState = { raidStarted: false, raidId: null };
  grottoDoc.mazeState = { currentNode: "", steps: [], facing: "s", layout: undefined, openedChests: [], triggeredTraps: [], usedScryingWalls: [] };
  grottoDoc.markModified("targetPracticeState");
  grottoDoc.markModified("puzzleState");
  grottoDoc.markModified("testOfPowerState");
  await grottoDoc.save();
  logger.info("EXPLORE", `[explore.js] handleGrottoCleanse: grotto updated (recleanse) ${grottoName} trialType=${trialType} expeditionId=${expeditionId}`);
 } else {
  grottoDoc = new Grotto({
   squareId,
   quadrantId,
   discoveryKey,
   name: grottoName,
   sealed: false,
   trialType,
   partyId: expeditionId,
   unsealedAt: at,
   unsealedBy: cleanseCharacter.name,
   ...(puzzleState && { puzzleState: puzzleState }),
  });
  await grottoDoc.save();
  logger.info("EXPLORE", `[explore.js] handleGrottoCleanse: grotto created ${grottoName} trialType=${trialType} expeditionId=${expeditionId}`);
 }
 await pushDiscoveryToMap(freshParty, "grotto", at, i.user?.id, { discoveryKey, name: grottoName });
 const grottoCostsForLog = buildCostsForLog(grottoPayResult);
 pushProgressLog(freshParty, cleanseCharacter.name, "grotto_cleansed", `Cleansed grotto **${grottoName}** in ${location} (1 Goddess Plume + 1 stamina).`, undefined, Object.keys(grottoCostsForLog).length ? grottoCostsForLog : { staminaLost: 1 }, at);
 await freshParty.save();

 // Generate maze layout at cleanse time for maze trials so the embed can show the maze image
 if (trialType === "maze") {
  const generated = generateGrottoMaze({ width: 6, height: 6, entryType: "diagonal" });
  if (generated.pathCells && generated.pathCells.length > 0) {
   const startCell = generated.pathCells.find((c) => c.type === "start");
   grottoDoc.mazeState = grottoDoc.mazeState || {};
   grottoDoc.mazeState.layout = {
    matrix: generated.matrix,
    width: generated.width,
    height: generated.height,
    entryNodes: generated.entryNodes,
    pathCells: generated.pathCells,
   };
   const startKey = startCell ? startCell.key || `${startCell.x},${startCell.y}` : `${generated.entryNodes.start.x},${generated.entryNodes.start.y}`;
   grottoDoc.mazeState.currentNode = startKey;
   grottoDoc.mazeState.facing = "s";
   grottoDoc.mazeState.steps = [];
   grottoDoc.mazeState.visitedCells = [startKey];
   grottoDoc.mazeState.openedChests = [];
   await grottoDoc.save();
  }
 }

 if (trialType === "blessing") {
  for (const slot of freshParty.characters) {
   try {
    await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, i, "Grotto - Blessing");
   } catch (err) {
    logger.warn("EXPLORE", `[explore.js]⚠️ Grotto blessing Spirit Orb: ${slot.name}: ${err?.message || err}`);
   }
  }
  await markGrottoCleared(grottoDoc);
  pushProgressLog(freshParty, cleanseCharacter.name, "grotto_blessing", `Blessing trial: each party member received a Spirit Orb.`, undefined, undefined, new Date());
  await freshParty.save();
  const blessingFlavor = getRandomBlessingFlavor();
  const blessingEmbed = new EmbedBuilder()
   .setTitle("🗺️ **Expedition: Grotto cleansed — Blessing!**")
   .setColor(regionColors[freshParty.region] || "#00ff99")
   .setDescription(
    `**${cleanseCharacter.name}** used a Goddess Plume and 1 stamina to cleanse **${grottoName}** in **${location}**.\n\n` +
    blessingFlavor + `\n\n${GROTTO_CLEARED_FLAVOR}\n\nUse the commands below to continue exploring.`
   )
   .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
  addExplorationStandardFields(blessingEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant) });
  const explorePageUrlGrotto = `${(process.env.DASHBOARD_URL || process.env.APP_URL || "https://tinglebot.xyz").replace(/\/$/, "")}/explore/${encodeURIComponent(expeditionId)}`;
  blessingEmbed.addFields({
   name: "📍 **__Set pin on webpage__**",
   value: `Set a pin for this grotto on the **explore/${expeditionId}** page: ${explorePageUrlGrotto}`,
   inline: false,
  });
  await msg.edit({ embeds: [blessingEmbed], components: [disabledRow] }).catch(() => {});
  const blessingAnnounce = new EmbedBuilder()
   .setTitle("✨ **A bright light spills from the stump!** ✨")
   .setColor(0xfbbf24)
   .setDescription(
    "The talismans fall away as **" + cleanseCharacter.name + "** holds the Goddess Plume to the roots. **" + grottoName + "** is cleansed — and within, a simple blessing awaits.\n\n" +
    blessingFlavor + `\n\n${GROTTO_CLEARED_FLAVOR}\n\nUse the commands below to continue exploring.`
   )
   .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
  addExplorationStandardFields(blessingAnnounce, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant) });
  blessingAnnounce.addFields({
   name: "📍 **__Set pin on webpage__**",
   value: `Set a pin for this grotto on the **explore/${expeditionId}** page: ${explorePageUrlGrotto}`,
   inline: false,
  });
  await i.followUp({ embeds: [blessingAnnounce] }).catch(() => {});
  return;
 }

 const trialLabel = getTrialLabel(trialType);
 const grottoCmdHint = getActiveGrottoCommand(trialType);
 let continueDesc = `**${cleanseCharacter.name}** used a Goddess Plume and 1 stamina to cleanse **${grottoName}** in **${location}**.\n\n**Trial: ${trialLabel}** — Complete it to receive a **Spirit Orb**. See **Commands** below.`;
 if (trialType === 'puzzle' && grottoDoc.puzzleState?.puzzleSubType) {
  const puzzleFlavor = getPuzzleFlavor(grottoDoc);
  if (puzzleFlavor) continueDesc += `\n\n${puzzleFlavor}`;
 }
 let trialMazeFiles = [];
 let trialMazeImg = regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK;
 if (trialType === "maze" && grottoDoc.mazeState?.layout) {
  try {
       const mazeBuf = await renderMazeToBuffer(grottoDoc.mazeState.layout, { viewMode: "member", currentNode: grottoDoc.mazeState.currentNode, visitedCells: grottoDoc.mazeState.visitedCells, openedChests: grottoDoc.mazeState.openedChests, triggeredTraps: grottoDoc.mazeState.triggeredTraps, usedScryingWalls: grottoDoc.mazeState.usedScryingWalls });
   trialMazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
   trialMazeImg = "attachment://maze.png";
   postGrottoMazeModVersion(i.client, grottoDoc.mazeState.layout, grottoDoc.mazeState.currentNode, grottoName, expeditionId, location, grottoDoc.mazeState);
  } catch (err) {
   logger.warn("EXPLORE", `[explore.js] Maze render (cleanse): ${err?.message || err}`);
  }
 }
 const continueEmbed = new EmbedBuilder()
  .setTitle("🗺️ **Expedition: Grotto cleansed!**")
  .setColor(regionColors[freshParty.region] || "#00ff99")
  .setDescription(continueDesc)
  .setImage(trialMazeImg);
 addExplorationStandardFields(continueEmbed, {
  party: freshParty,
  expeditionId,
  location,
  nextCharacter,
  showNextAndCommands: true,
  showRestSecureMove: false,
  ruinRestRecovered,
  hasActiveGrotto: true,
  activeGrottoCommand: grottoCmdHint,
 });
 const explorePageUrlTrial = `${(process.env.DASHBOARD_URL || process.env.APP_URL || "https://tinglebot.xyz").replace(/\/$/, "")}/explore/${encodeURIComponent(expeditionId)}`;
 continueEmbed.addFields({
  name: "📍 **__Set pin on webpage__**",
  value: `Set a pin for this grotto on the **explore/${expeditionId}** page: ${explorePageUrlTrial}`,
  inline: false,
 });
 if (trialType === "maze" && trialMazeFiles.length) continueEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
 await msg.edit({ embeds: [continueEmbed], components: [disabledRow], files: trialMazeFiles.length ? trialMazeFiles : undefined }).catch(() => {});
 const cleanseAnnounce = new EmbedBuilder()
  .setTitle("✨ **A bright light spills from the stump!** ✨")
  .setColor(0xfbbf24)
  .setDescription(
   "The talismans fall away as **" + cleanseCharacter.name + "** holds the Goddess Plume to the roots. **" + grottoName + "** is cleansed — **the way is open**. A trial awaits inside; complete it to receive a **Spirit Orb**.\n\n**Trial: " + trialLabel + "**."
  )
  .setImage(trialMazeImg);
 addExplorationStandardFields(cleanseAnnounce, {
  party: freshParty,
  expeditionId,
  location,
  nextCharacter,
  showNextAndCommands: true,
  showRestSecureMove: false,
  ruinRestRecovered,
  hasActiveGrotto: true,
  activeGrottoCommand: grottoCmdHint,
 });
 cleanseAnnounce.addFields({
  name: "📍 **__Set pin on webpage__**",
  value: `Set a pin for this grotto on the **explore/${expeditionId}** page: ${explorePageUrlTrial}`,
  inline: false,
 });
 if (trialType === "maze" && trialMazeFiles.length) cleanseAnnounce.setFooter({ text: GROTTO_MAZE_LEGEND });
 await i.followUp({ embeds: [cleanseAnnounce], files: trialMazeFiles.length ? trialMazeFiles : undefined }).catch(() => {});
}

// ------------------- applyBlightExposure ------------------
// Increment blight exposure when revealing/traveling blighted quadrant
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

const REGION_TO_VILLAGE_LOWER = { eldin: "rudania", lanayru: "inariko", faron: "vhintl" };
const EXPLORATION_KO_DEBUFF_DAYS = 7;

// ------------------- handleExpeditionFailed ------------------
// Full party KO: reset to start, apply debuff, reset explored quadrants
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
    ).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Reset quadrant to unexplored: ${err?.message}`));
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

// ------------------- getAdjacentQuadrants ------------------
// Adjacent quadrants from map module (square+quadrant format)
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
  .addSubcommand((subcommand) =>
   subcommand
    .setName("discovery")
    .setDescription("Revisit a monster camp or grotto marked on the map in your current quadrant")
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
      .setName("discovery")
      .setDescription("Monster camp or grotto in this quadrant to revisit")
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
      .addStringOption((o) => o.setName("grotto").setDescription("Grotto name at this location").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
     sub
      .setName("targetpractice")
      .setDescription("Take your turn in a Target Practice grotto trial")
      .addStringOption((o) => o.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("charactername").setDescription("Your character name").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("grotto").setDescription("Grotto name at this location").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
     sub
      .setName("puzzle")
      .setDescription("View puzzle clue, or submit an offering (correct items = Spirit Orbs for all)")
      .addStringOption((o) => o.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("charactername").setDescription("Your character name").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("grotto").setDescription("Grotto name at this location").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("items").setDescription("Item(s) to offer (omit to view the puzzle clue first)").setRequired(false).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
     sub
      .setName("maze")
      .setDescription("Move north, east, south, or west, or use Song of Scrying at a wall")
      .addStringOption((o) => o.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("charactername").setDescription("Your character name").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("grotto").setDescription("Grotto name at this location").setRequired(true).setAutocomplete(true))
      .addStringOption((o) =>
       o
        .setName("action")
        .setDescription("North, East, South, or West; or Song of Scrying at a wall")
        .setRequired(true)
        .setAutocomplete(true)
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

   // ------------------- Grotto subcommands -------------------
   if (subcommandGroup === "grotto") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    let characterName = (interaction.options.getString("charactername") || "").trim();
    if (characterName.includes("|")) characterName = characterName.split("|")[0].trim();
    const userId = interaction.user.id;
    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) return interaction.editReply("Expedition ID not found.");
    const character = await Character.findOne({ name: characterName, userId });
    if (!character) return interaction.editReply("Character not found or you do not own this character.");
    const location = `${party.square} ${party.quadrant}`;
    const squareId = (party.square && String(party.square).trim()) || "";
    const quadrantId = (party.quadrant && String(party.quadrant).trim()) || "";

    if (subcommand === "continue") {
     const grottoOption = interaction.options.getString("grotto");
     const grotto = await resolveGrottoAtLocation(squareId, quadrantId, expeditionId, grottoOption);
     if (!grotto) {
      return interaction.editReply(
       "No active grotto trial at this location for this expedition. Make sure you have cleansed a grotto here and are in the same square and quadrant."
      );
     }
     if (grotto.trialType === "puzzle" && grotto.puzzleState?.offeringSubmitted && grotto.puzzleState?.offeringApproved === true && !grotto.completedAt) {
      await markGrottoCleared(grotto);
      for (const slot of party.characters) {
       try {
        await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Puzzle");
       } catch (err) {
        logger.warn("EXPLORE", `[explore.js]⚠️ Grotto puzzle Spirit Orb: ${err?.message || err}`);
       }
      }
      pushProgressLog(party, character.name, "grotto_puzzle_success", "Puzzle approved. Each party member received a Spirit Orb.", undefined, undefined, new Date());
      await party.save();
      const flavor = getRandomPuzzleSuccessFlavor();
      const rollCmdId = getExploreCommandId();
      const approvedEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Puzzle — Approved!**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(`**Correct!** ${flavor}\n\n${GROTTO_CLEARED_FLAVOR}\n\nUse </explore roll:${rollCmdId}> to leave the grotto and continue exploring.`)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(approvedEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      });
      return interaction.editReply({ embeds: [approvedEmbed] });
     }
     if (grotto.trialType === "puzzle" && grotto.completedAt) {
      const rollCmdId = getExploreCommandId();
      const doneEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Puzzle — Complete**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(`${GROTTO_CLEARED_FLAVOR}\n\nUse </explore roll:${rollCmdId}> to leave the grotto and continue exploring.`)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(doneEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      });
      return interaction.editReply({ embeds: [doneEmbed] });
     }
     if (grotto.trialType === "puzzle" && grotto.puzzleState?.offeringSubmitted && grotto.puzzleState?.offeringApproved === false) {
      return interaction.editReply("The puzzle offering was denied. Items offered are still consumed. The grotto trial is complete with no Spirit Orbs.");
     }
     if (grotto.trialType === "test_of_power") {
      const raidStarted = grotto.testOfPowerState?.raidStarted && grotto.testOfPowerState?.raidId;
      if (raidStarted) {
       const raidId = grotto.testOfPowerState.raidId;
       const embedInProgress = new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Test of Power**")
        .setColor(regionColors[party.region] || "#00ff99")
        .setDescription(`The trial has already begun. Use </raid> with Raid ID **${raidId}** to fight. When the monster is defeated, each party member will receive a Spirit Orb.`)
        .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
       addExplorationStandardFields(embedInProgress, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: `</raid> (Raid ID: ${raidId})` });
       return interaction.editReply({ embeds: [embedInProgress] });
      }
      const poolEntry = rollTestOfPowerMonster();
      let monster = await fetchMonsterByName(poolEntry.name);
      if (!monster) {
       monster = {
        name: poolEntry.name,
        hearts: poolEntry.hearts,
        tier: poolEntry.tier,
        nameMapping: (poolEntry.name || "").replace(/\s+/g, ""),
        image: "",
       };
      }
      const village = REGION_TO_VILLAGE[party.region?.toLowerCase()] || "Inariko";
      const raidResult = await triggerRaid(monster, interaction, village, false, null, false, expeditionId, grotto._id);
      if (raidResult && raidResult.success) {
       grotto.testOfPowerState = grotto.testOfPowerState || {};
       grotto.testOfPowerState.raidStarted = true;
       grotto.testOfPowerState.raidId = raidResult.raidId;
       await grotto.save();
       const embedStarted = new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Test of Power — Raid Started**")
        .setColor(regionColors[party.region] || "#00ff99")
        .setDescription(`The trial has begun! A **${monster.name}** has appeared. Use </raid> with Raid ID **${raidResult.raidId}** to fight. When the monster is defeated, each party member will receive a Spirit Orb.`)
        .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
       addExplorationStandardFields(embedStarted, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: `</raid> (Raid ID: ${raidResult.raidId})` });
       return interaction.editReply({ embeds: [embedStarted] });
      }
      const errMsg = raidResult?.error || "Could not start the raid. Try again.";
      return interaction.editReply(`Test of Power could not start the raid: ${errMsg}`);
     }
     const trialLabel = getTrialLabel(grotto.trialType);
     const cmdId = getExploreCommandId();
     let grottoDesc = `Party is at grotto in **${location}**.\n\n**Trial:** ${trialLabel}\n\n`;
     if (grotto.trialType === 'puzzle') {
      const ensured = ensurePuzzleConfig(grotto);
      if (ensured !== grotto) {
       await ensured.save();
       Object.assign(grotto.puzzleState || {}, ensured.puzzleState);
      }
      const flavor = getPuzzleFlavor(grotto);
      if (flavor) {
       grottoDesc += `${flavor}\n\nSee **Commands** below.`;
      } else {
       grottoDesc += "Discuss with your group. Submit an offering (items); if correct, everyone gets Spirit Orbs. See **Commands** below.";
      }
     } else {
      const instructions = {
       target_practice: "Establish turn order. Each turn: one character shoots — 3 successes wins, 1 fail ends the trial. See **Commands** below.",
       test_of_power: "Boss battle — no backing out. Prepare and fight; spirit orbs on victory. (Test of Power flow uses raid-style encounter; ensure party is ready.)",
       maze: "Use North, East, South, or West to move, or Song of Scrying at a wall. See **Commands** below.",
      };
      grottoDesc += instructions[grotto.trialType] || `Complete the ${trialLabel} trial. See **Commands** below.`;
     }
     let continueMazeFiles = [];
     let continueMazeImg = regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK;
     if (grotto.trialType === "maze" && grotto.mazeState?.layout) {
      try {
       const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: grotto.mazeState.currentNode, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
       continueMazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
       continueMazeImg = "attachment://maze.png";
      } catch (err) {
       logger.warn("EXPLORE", `[explore.js] Maze render (continue): ${err?.message || err}`);
      }
     }
     const embed = new EmbedBuilder()
      .setTitle(`🗺️ **Grotto: ${trialLabel}**`)
      .setColor(regionColors[party.region] || "#00ff99")
      .setDescription(grottoDesc)
      .setImage(continueMazeImg);
     addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location,
      nextCharacter: party.characters[party.currentTurn] ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasActiveGrotto: true,
      activeGrottoCommand: getActiveGrottoCommand(grotto.trialType),
     });
     if (grotto.trialType === "maze" && continueMazeFiles.length) embed.setFooter({ text: GROTTO_MAZE_LEGEND });
     return interaction.editReply({ embeds: [embed], files: continueMazeFiles.length ? continueMazeFiles : undefined });
    }

    if (subcommand === "targetpractice") {
     const grottoOption = interaction.options.getString("grotto");
     const grotto = await resolveGrottoAtLocation(squareId, quadrantId, expeditionId, grottoOption);
     if (!grotto || grotto.trialType !== "target_practice") {
      return interaction.editReply("No Target Practice grotto at this location for this expedition.");
     }
     const TARGET_SUCCESSES = 3;
     const BASE_FAIL = 0.15;
     const BASE_MISS = 0.25;
     if (grotto.targetPracticeState.failed) {
      const cmdId = getExploreCommandId();
      const cmdDiscovery = `</explore discovery:${cmdId}>`;
      const failedEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Target Practice — Already Failed**")
       .setColor(0x8b0000)
       .setDescription(
        "The party already failed this Target Practice trial.\n\n" +
        `You can return later: use ${cmdDiscovery} in this quadrant to revisit — the grotto stays open, no cleanse needed.`
       )
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(failedEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      });
      return interaction.editReply({ embeds: [failedEmbed] });
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
      const cmdDiscovery = `</explore discovery:${cmdId}>`;
      const desc = `The blimp looms before you. ${flavor}\n\n↳ **${outcome.ctaHint}** ➾ ${cmdRoll}\n\nYou can return later: use ${cmdDiscovery} in this quadrant to revisit — the grotto stays open, no cleanse needed.`;
      const embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Target Practice — Failed**")
       .setColor(0x8b0000)
       .setDescription(desc)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(embed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
     });
      return interaction.editReply({ embeds: [embed] });
     }

     if (roll < failThreshold + missThreshold) {
      const outcome = getMissOutcome();
      const flavor = outcome.flavor.replace(/\{char\}/g, character.name);
      const desc = `The blimp looms before you. ${flavor}\n\n**Miss.** Use the command in **Commands** below to try again.`;
      const embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Target Practice**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(desc)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(embed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: cmdTargetPractice,
     });
      return interaction.editReply({ embeds: [embed] });
     }

     const newSuccesses = (grotto.targetPracticeState.successCount || 0) + 1;
     grotto.targetPracticeState.successCount = newSuccesses;
     const turnIndex = (grotto.targetPracticeState.turnIndex || 0) + 1;
     grotto.targetPracticeState.turnIndex = turnIndex;
     if (newSuccesses >= TARGET_SUCCESSES) {
      await markGrottoCleared(grotto);
      for (const slot of party.characters) {
       try {
        await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Target Practice");
       } catch (err) {
        logger.warn("EXPLORE", `[explore.js]⚠️ Grotto target practice Spirit Orb: ${err?.message || err}`);
       }
      }
      pushProgressLog(party, character.name, "grotto_target_success", `Target Practice completed. Each party member received a Spirit Orb.`, undefined, undefined, new Date());
      await party.save();
      const outcome = getCompleteOutcome();
      const flavor = outcome.flavor.replace(/\{char\}/g, character.name);
      const desc = `The blimp looms before you. ${flavor}\n\n${GROTTO_CLEARED_FLAVOR}\n\nSee **Commands** below to continue exploring.`;
      const embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Target Practice — Success!**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(desc)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(embed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
     });
      return interaction.editReply({ embeds: [embed] });
     }
     await grotto.save();
     const nextIdx = turnIndex % party.characters.length;
     const nextChar = party.characters[nextIdx];
     const outcome = getSuccessOutcome();
     const flavor = outcome.flavor.replace(/\{char\}/g, character.name);
     const desc = `The blimp looms before you. ${flavor}\n\n**Progress:** ${newSuccesses}/${TARGET_SUCCESSES} hits. **Next shooter:** **${nextChar?.name ?? "—"}** — use the command in **Commands** below.`;
     const embed = new EmbedBuilder()
      .setTitle("🗺️ **Grotto: Target Practice**")
      .setColor(regionColors[party.region] || "#00ff99")
      .setDescription(desc)
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location,
      nextCharacter: nextChar ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasActiveGrotto: true,
      activeGrottoCommand: cmdTargetPractice,
     });
     return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "puzzle") {
     const grottoOption = interaction.options.getString("grotto");
     const grotto = await resolveGrottoAtLocation(squareId, quadrantId, expeditionId, grottoOption);
     if (!grotto || grotto.trialType !== "puzzle") {
      return interaction.editReply("No Puzzle grotto at this location for this expedition.");
     }
     if (grotto.puzzleState.offeringSubmitted) {
      const approved = grotto.puzzleState.offeringApproved === true;
      const itemsStr = (grotto.puzzleState.offeringItems || []).join(", ");
      const rollCmdId = getExploreCommandId();
      const embed = new EmbedBuilder()
       .setTitle(approved ? "🗺️ **Grotto: Puzzle — Complete**" : "🗺️ **Grotto: Puzzle — Denied**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(
        approved
         ? `An offering was already submitted (${itemsStr}) and approved. Everyone received a **Spirit Orb**. Use </explore roll:${rollCmdId}> to leave the grotto and continue exploring.`
         : `An offering was already submitted (${itemsStr}) but was not correct. Items were consumed. The grotto trial is complete with no Spirit Orbs. Use </explore roll:${rollCmdId}> to leave the grotto and continue exploring.`
       )
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(embed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      });
      return interaction.editReply({ embeds: [embed] });
     }
     const itemsStr = interaction.options.getString("items");
     const parsedItems = parsePuzzleItems(itemsStr);
     if (!itemsStr?.trim() || parsedItems.length === 0) {
      const ensured = ensurePuzzleConfig(grotto);
      if (ensured !== grotto) {
       await ensured.save();
       Object.assign(grotto.puzzleState || {}, ensured.puzzleState);
      }
      const flavor = getPuzzleFlavor(grotto);
      const grottoDesc = flavor || "Discuss with your group. Determine what to offer and submit with </explore grotto puzzle> (items). If correct, everyone gets Spirit Orbs.";
      const cmdId = getExploreCommandId();
      const embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Puzzle**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(grottoDesc)
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(embed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: `</explore grotto puzzle:${cmdId}>`,
      });
      return interaction.editReply({ embeds: [embed] });
     }
     // Validate: submitting character must have each item in required quantity (inventory only)
     let inventoryCollection;
     try {
      inventoryCollection = await getCharacterInventoryCollectionWithModSupport(character);
     } catch (err) {
      logger.warn("EXPLORE", `[explore.js] puzzle getCharacterInventoryCollectionWithModSupport: ${err?.message || err}`);
      return interaction.editReply("Could not read your inventory. Try again or contact staff.");
     }
     const inventoryEntries = await inventoryCollection.find({ characterId: character._id }).toArray();
     const inventoryByItem = new Map();
     for (const entry of inventoryEntries || []) {
      const name = (entry.itemName || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      inventoryByItem.set(key, (inventoryByItem.get(key) || 0) + (entry.quantity || 0));
     }
     const checkResult = checkPuzzleOffer(grotto, parsedItems);
     const consumeItems = checkResult.approved ? getPuzzleConsumeItems(grotto, parsedItems) : parsedItems;
     for (const { itemName, quantity } of consumeItems) {
      const key = itemName.trim().toLowerCase();
      const have = inventoryByItem.get(key) || 0;
      if (have < quantity) {
       return interaction.editReply(
        `You don't have enough **${itemName}**. ${checkResult.approved ? `The puzzle requires ${quantity}` : `You offered ${quantity}`} but you have ${have}. Check your inventory and try again.`
       );
      }
     }
     // Consume: if approved, only remove required amount; if denied, remove full offering
     try {
      for (const { itemName, quantity } of consumeItems) {
       await removeItemInventoryDatabase(character._id, itemName, quantity, interaction, "Grotto puzzle offering");
      }
     } catch (err) {
      handleInteractionError(err, interaction, { source: "explore.js grotto puzzle removeItem" });
      return interaction.editReply(
        `Could not remove one or more items from your inventory. ${err?.message || err}. If items were partially consumed, contact staff.`
      ).catch(() => {});
     }
     const displayItems = consumeItems.map((p) => (p.quantity > 1 ? `${p.itemName} x${p.quantity}` : p.itemName));
     grotto.puzzleState.offeringSubmitted = true;
     grotto.puzzleState.offeringApproved = checkResult.approved;
     grotto.puzzleState.offeringItems = displayItems;
     grotto.puzzleState.offeringBy = character.name;
     grotto.puzzleState.offeredAt = new Date();
     if (checkResult.approved) {
      await markGrottoCleared(grotto);
      for (const slot of party.characters) {
       try {
        await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Puzzle");
       } catch (err) {
        logger.warn("EXPLORE", `[explore.js]⚠️ Grotto puzzle Spirit Orb: ${err?.message || err}`);
       }
      }
      pushProgressLog(party, character.name, "grotto_puzzle_success", "Puzzle approved. Each party member received a Spirit Orb.", undefined, undefined, new Date());
     }
     pushProgressLog(party, character.name, "grotto_puzzle_offering", `Puzzle offering submitted: ${displayItems.join(", ")}. ${checkResult.approved ? "Approved." : "Denied."}`, undefined, undefined, new Date());
     await grotto.save();
     await party.save();
     if (checkResult.approved) {
      const flavor = getRandomPuzzleSuccessFlavor();
      const rollCmdId = getExploreCommandId();
      const successEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Puzzle — Correct!**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(
        `**${character.name}** submitted an offering: **${displayItems.join(", ")}**\n\n**Correct!** ${flavor}\n\n${GROTTO_CLEARED_FLAVOR}\n\nUse </explore roll:${rollCmdId}> to leave the grotto and continue exploring.`
       )
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(successEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      });
      return interaction.editReply({ embeds: [successEmbed] });
     }
     return interaction.editReply({
      embeds: [
       new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Puzzle — Offering Submitted**")
        .setColor(regionColors[party.region] || "#00ff99")
        .setDescription(
         `**${character.name}** submitted an offering: **${displayItems.join(", ")}**\n\nThe offering was not correct. Items are consumed. The grotto trial is complete with no Spirit Orbs.`
        )
        .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK),
      ],
     });
    }

    if (subcommand === "maze") {
     const mazeCmdId = getExploreCommandId();
     const grottoOption = interaction.options.getString("grotto");
     const grotto = await resolveGrottoAtLocation(squareId, quadrantId, expeditionId, grottoOption);
     if (!grotto || grotto.trialType !== "maze") {
      return interaction.editReply("No Maze grotto at this location for this expedition.");
     }
     const layout = grotto.mazeState?.layout;
     let hasLayout = layout && layout.pathCells && layout.pathCells.length > 0 && layout.matrix && layout.matrix.length > 0;
     let layoutJustCreated = false;
     if (!hasLayout) {
      const generated = generateGrottoMaze({ width: 6, height: 6, entryType: 'diagonal' });
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
      const startKeyMaze = startCell ? startCell.key || `${startCell.x},${startCell.y}` : `${generated.entryNodes.start.x},${generated.entryNodes.start.y}`;
      grotto.mazeState.currentNode = startKeyMaze;
      grotto.mazeState.facing = 's';
      grotto.mazeState.steps = [];
      grotto.mazeState.visitedCells = [startKeyMaze];
      grotto.mazeState.openedChests = [];
      grotto.mazeState.triggeredTraps = [];
      grotto.mazeState.usedScryingWalls = [];
      await grotto.save();
      hasLayout = true;
      layoutJustCreated = true;
      postGrottoMazeModVersion(interaction.client, grotto.mazeState.layout, grotto.mazeState.currentNode, grotto.name || "Grotto", expeditionId, location, grotto.mazeState);
     } else if (!grotto.mazeState.visitedCells?.length && grotto.mazeState.currentNode) {
      grotto.mazeState.visitedCells = [grotto.mazeState.currentNode];
      await grotto.save();
     }
     // Lens of Truth bypass: offer skip on first entry (layout just created)
     if (layoutJustCreated && (await partyHasLensOfTruth(party))) {
      const bypassRow = new ActionRowBuilder().addComponents(
       new ButtonBuilder().setCustomId(`grotto_maze_bypass_yes|${expeditionId}|${grotto._id}`).setLabel("Bypass maze (Lens of Truth)").setStyle(ButtonStyle.Primary),
       new ButtonBuilder().setCustomId(`grotto_maze_bypass_no|${expeditionId}|${grotto._id}`).setLabel("Enter the maze").setStyle(ButtonStyle.Secondary)
      );
      const bypassEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Maze**")
       .setColor(getMazeEmbedColor(null, regionColors[party.region]))
       .setDescription("Someone in your party has a **Lens of Truth** in their inventory. You may bypass the maze for immediate Spirit Orbs (forgoing chests), or enter the maze as normal.")
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(bypassEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: false, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: `</explore grotto maze:${mazeCmdId}>`, extraFieldsBeforeIdQuadrant: getExplorationPartyCharacterFields(party) });
      const bypassMsg = await interaction.editReply({ embeds: [bypassEmbed], components: [bypassRow] });
      const bypassCollector = bypassMsg.createMessageComponentCollector({
       filter: (i) => i.user.id === interaction.user.id,
       time: 60 * 1000,
       max: 1,
      });
      bypassCollector.on("collect", async (i) => {
       await i.deferUpdate();
       const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`grotto_maze_bypass_yes|${expeditionId}|${grotto._id}`).setLabel("Bypass maze (Lens of Truth)").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId(`grotto_maze_bypass_no|${expeditionId}|${grotto._id}`).setLabel("Enter the maze").setStyle(ButtonStyle.Secondary).setDisabled(true)
       );
       await i.editReply({ components: [disabledRow] }).catch(() => {});
       const isBypass = i.customId.includes("_yes|");
       if (isBypass) {
        const freshParty = await Party.findActiveByPartyId(expeditionId);
        const freshGrotto = await Grotto.findById(grotto._id);
        if (freshGrotto && !freshGrotto.completedAt && freshParty) {
         await markGrottoCleared(freshGrotto);
         for (const slot of freshParty.characters) {
          if (slot._id) {
           try {
            await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, i, "Grotto - Maze (Lens of Truth bypass)");
           } catch (err) {
            logger.warn("EXPLORE", `[explore.js] Grotto maze bypass Spirit Orb: ${err?.message || err}`);
           }
          }
         }
         pushProgressLog(freshParty, character.name, "grotto_maze_success", "Maze bypassed with Lens of Truth. Each party member received a Spirit Orb.", undefined, undefined, new Date());
         await freshParty.save();
         const rollCmdId = getExploreCommandId();
         const doneEmbed = new EmbedBuilder()
          .setTitle("🗺️ **Grotto: Maze — Bypassed**")
          .setColor(getMazeEmbedColor('bypassed', regionColors[freshParty.region]))
          .setDescription(`Your party used the **Lens of Truth** to see through the maze.\n\n${GROTTO_CLEARED_FLAVOR}\n\nUse </explore roll:${rollCmdId}> to leave the grotto and continue exploring.`)
          .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
         addExplorationStandardFields(doneEmbed, { party: freshParty, expeditionId, location: `${freshParty.square} ${freshParty.quadrant}`, nextCharacter: freshParty.characters[freshParty.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: false, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant) });
         await i.editReply({ embeds: [doneEmbed], components: [disabledRow] }).catch(() => {});
        }
       } else {
        const entryFlavor = getRandomMazeEntryFlavor();
        const mazeCmd = `</explore grotto maze:${mazeCmdId}>`;
        const enterEmbed = new EmbedBuilder()
         .setTitle("🗺️ **Grotto: Maze**")
         .setColor(getMazeEmbedColor(null, regionColors[party.region]))
         .setDescription(`${entryFlavor}\n\n↳ Use ${mazeCmd} with **action:** North, East, South, West, or Song of Scrying at a wall.`);
        let enterFiles = [];
        try {
         const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: grotto.mazeState.currentNode, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
         enterFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
         enterEmbed.setImage("attachment://maze.png");
         enterEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
        } catch (err) {
         logger.warn("EXPLORE", `[explore.js] Maze render failed: ${err?.message || err}`);
         enterEmbed.setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
        }
        addExplorationStandardFields(enterEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: mazeCmd, extraFieldsBeforeIdQuadrant: getExplorationPartyCharacterFields(party) });
        await i.editReply({ embeds: [enterEmbed], components: [disabledRow], files: enterFiles }).catch(() => {});
       }
      });
      bypassCollector.on("end", (collected, reason) => {
       if (collected.size === 0 && reason === "time") {
        bypassMsg.edit({ components: [new ActionRowBuilder().addComponents(
         new ButtonBuilder().setCustomId(`grotto_maze_bypass_yes|${expeditionId}|${grotto._id}`).setLabel("Bypass maze (Lens of Truth)").setStyle(ButtonStyle.Primary).setDisabled(true),
         new ButtonBuilder().setCustomId(`grotto_maze_bypass_no|${expeditionId}|${grotto._id}`).setLabel("Enter the maze").setStyle(ButtonStyle.Secondary).setDisabled(true)
        )] }).catch(() => {});
       }
      });
      return;
     }
     const action = interaction.options.getString("action");
     const matrix = grotto.mazeState.layout?.matrix || [];
     const pathCells = grotto.mazeState.layout?.pathCells || [];
     const currentNode = grotto.mazeState.currentNode || '';
     const facing = grotto.mazeState.facing || 's';

     let mazeFiles = [];
     let mazeImg = regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK;
     if (grotto.mazeState?.layout) {
      try {
       const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: grotto.mazeState.currentNode, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
       mazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
       mazeImg = "attachment://maze.png";
      } catch (e) {
       logger.warn("EXPLORE", `[explore.js] Maze render: ${e?.message}`);
      }
     }
     const mazeFirstEntryFlavor = layoutJustCreated ? getRandomMazeEntryFlavor() : null;

     if (action === "wall") {
      const [cx, cy] = (currentNode || '').split(',').map((n) => parseInt(n, 10));
      const currentCell = pathCells?.length && !isNaN(cx) && !isNaN(cy) ? getPathCellAt(pathCells, cx, cy) : null;
      const usedScryingWalls = grotto.mazeState?.usedScryingWalls || [];
      const scryingWallAlreadyUsed = currentCell && (currentCell.type === 'mazep' || currentCell.type === 'mazen') && usedScryingWalls.includes(currentNode);
      const isMazepCell = currentCell && (currentCell.type === 'mazep' || currentCell.type === 'mazen') && !scryingWallAlreadyUsed;

      let outcome;
      let rollLabel = '';
      if (isMazepCell) {
       const usedWalls = grotto.mazeState.usedScryingWalls || [];
       if (!usedWalls.includes(currentNode)) {
        grotto.mazeState.usedScryingWalls = [...usedWalls, currentNode];
        grotto.markModified("mazeState.usedScryingWalls");
       }
       const charDocs = await Character.find({ _id: { $in: (party.characters || []).map((c) => c._id).filter(Boolean) } }).select('job jobVoucher jobVoucherJob');
       const hasEntertainer = charDocs?.some(
        (c) => (c?.job || '').toLowerCase() === 'entertainer' || (c?.jobVoucher && (c?.jobVoucherJob || '').toLowerCase() === 'entertainer')
       );
       const successChance = hasEntertainer ? 0.75 : 0.5;
       const success = Math.random() < successChance;
       outcome = getGazepScryingOutcome(success);
       rollLabel = hasEntertainer ? ' (🎭 Entertainer boost — 50% higher success)' : '';
      } else {
       const roll = Math.floor(Math.random() * 6) + 1;
       outcome = getGrottoMazeOutcome(roll);
       rollLabel = ` (Roll: **${roll}**)`;
      }
      if (outcome.heartsLost > 0 && character._id) {
       try {
        await useHearts(character._id, outcome.heartsLost, { commandName: 'explore', operation: 'grotto_maze_trap' });
       } catch (err) {
        logger.warn("EXPLORE", `[explore.js]⚠️ Grotto maze pit trap useHearts: ${err?.message || err}`);
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
      if (outcome.type === 'collapse' || outcome.type === 'faster_path_open') {
       const beyond = getCellBeyondWall(matrix, cx, cy, facing);
       if (beyond) {
        const newKey = `${beyond.x},${beyond.y}`;
        grotto.mazeState.currentNode = newKey;
        const steps = grotto.mazeState.steps || [];
        const visited = new Set(grotto.mazeState.visitedCells || []);
        visited.add(newKey);
        grotto.mazeState.visitedCells = [...visited];
        grotto.mazeState.steps = [...steps, newKey];
        await grotto.save();
        const destCell = getPathCellAt(pathCells, beyond.x, beyond.y);
        const destType = destCell?.type || 'path';
        if (destType === 'exit') {
         await markGrottoCleared(grotto);
         for (const slot of party.characters) {
          try {
           await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Maze");
          } catch (err) {
           logger.warn("EXPLORE", `[explore.js]⚠️ Grotto maze exit Spirit Orb: ${err?.message || err}`);
          }
         }
         pushProgressLog(party, character.name, "grotto_maze_success", "Maze trial complete. Each party member received a Spirit Orb.", undefined, undefined, new Date());
         await party.save();
         try {
          const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "mod", currentNode: newKey, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
          mazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
          mazeImg = "attachment://maze.png";
         } catch (e) {}
         const exitDesc = (mazeFirstEntryFlavor ? mazeFirstEntryFlavor + "\n\n" : "") + outcome.flavor + "\n\n**Exit!**\n\n";
         const exitEmbed = new EmbedBuilder()
          .setTitle("🗺️ **Grotto: Maze — Exit!**")
          .setColor(getMazeEmbedColor('exit', regionColors[party.region]))
          .setDescription(exitDesc + `${GROTTO_CLEARED_FLAVOR}\n\nSee **Commands** below to continue exploring.`)
          .setImage(mazeImg);
         addExplorationStandardFields(exitEmbed, {
          party,
          expeditionId,
          location,
          nextCharacter: party.characters[party.currentTurn] ?? null,
          showNextAndCommands: true,
          showRestSecureMove: false,
          hasActiveGrotto: false,
          hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
         });
         if (mazeFiles.length) exitEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
         return interaction.editReply({ embeds: [exitEmbed], files: mazeFiles });
        }
       }
       await grotto.save();
       try {
        const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: grotto.mazeState.currentNode, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
        mazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
        mazeImg = "attachment://maze.png";
       } catch (e) {}
      }
      if (outcome.type === 'step_back') {
       const backResult = getNeighbourCoords(matrix, cx, cy, 'back', facing);
       if (backResult) {
        const backKey = `${backResult.x},${backResult.y}`;
        grotto.mazeState.currentNode = backKey;
        grotto.mazeState.facing = backResult.facing;
        const steps = grotto.mazeState.steps || [];
        grotto.mazeState.steps = steps.slice(0, Math.max(0, steps.length - 1));
        await grotto.save();
        try {
         const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: grotto.mazeState.currentNode, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
         mazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
         mazeImg = "attachment://maze.png";
        } catch (e) {}
       }
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
         pushProgressLog(party, character.name, "grotto_maze_scrying", `Song of Scrying: ${outcome.battle.monsterLabel} appeared but raid could not start.`, undefined, undefined, new Date());
         await party.save();
         const mazeEmbedErr = new EmbedBuilder()
          .setTitle("🗺️ **Grotto: Maze — Song of Scrying**")
          .setColor(getMazeEmbedColor('battle', regionColors[party.region]))
          .setDescription(`${mazeFirstEntryFlavor ? mazeFirstEntryFlavor + "\n\n" : ""}**${character.name}** sings the sequence on the wall...${rollLabel}\n\n${outcome.flavor}\n\n⏰ **${wallRaidError}**\n\n↳ Continue with </explore grotto maze:${mazeCmdId}>.`)
          .setImage(mazeImg);
        addExplorationStandardFields(mazeEmbedErr, {
          party,
          expeditionId,
          location,
          nextCharacter: party.characters[party.currentTurn] ?? null,
          showNextAndCommands: true,
          showRestSecureMove: false,
          hasActiveGrotto: true,
          activeGrottoCommand: `</explore grotto maze:${mazeCmdId}>`,
          extraFieldsBeforeIdQuadrant: getExplorationPartyCharacterFields(party),
        });
         if (mazeFiles.length) mazeEmbedErr.setFooter({ text: GROTTO_MAZE_LEGEND });
         return interaction.editReply({ embeds: [mazeEmbedErr], files: mazeFiles });
        }
       } else {
        wallRaidError = "Construct not found; continue exploring.";
       }
      }
      const ctaHint = (outcome.ctaHint || "").replace(/<\/explore grotto maze>/g, `</explore grotto maze:${mazeCmdId}>`);
      let desc = `${mazeFirstEntryFlavor ? mazeFirstEntryFlavor + "\n\n" : ""}**${character.name}** sings the sequence on the wall...${rollLabel}\n\n${outcome.flavor}\n\n↳ **${ctaHint}**`;
      if (wallRaidError) desc += `\n\n⏰ **${wallRaidError}**`;
      const scryingLogMsg = outcome.type === 'faster_path_open' ? 'Song of Scrying: faster path opened.' : outcome.type === 'pit_trap' ? 'Song of Scrying: pit trap (lost hearts and stamina).' : outcome.type === 'collapse' ? 'Song of Scrying: passage collapsed, emerged on other side.' : outcome.type === 'step_back' ? 'Song of Scrying: stepped back.' : outcome.type === 'stalagmites' ? 'Song of Scrying: stalagmites fell (stamina cost).' : outcome.type === 'nothing' ? 'Song of Scrying: nothing happened.' : outcome.type === 'battle' ? `Song of Scrying: ${outcome.battle?.monsterLabel || 'construct'} appeared.` : 'Song of Scrying.';
      if (outcome.type !== 'battle' || wallRaidError) {
       pushProgressLog(party, character.name, "grotto_maze_scrying", scryingLogMsg, undefined, (outcome.heartsLost > 0 || outcome.staminaCost > 0) ? { heartsLost: outcome.heartsLost || undefined, staminaLost: outcome.staminaCost || undefined } : undefined, new Date());
       await party.save();
      }
      const mazeEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Maze — Song of Scrying**")
       .setColor(getMazeEmbedColor(outcome.type, regionColors[party.region]))
       .setDescription(desc)
       .setImage(mazeImg);
      if (raidIdForEmbed) {
       mazeEmbed.addFields({ name: "🆔 **__Raid ID__**", value: raidIdForEmbed, inline: true });
      }
      addExplorationStandardFields(mazeEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: `</explore grotto maze:${mazeCmdId}>`,
       extraFieldsBeforeIdQuadrant: getExplorationPartyCharacterFields(party),
      });
      if (mazeFiles.length) mazeEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
      return interaction.editReply({ embeds: [mazeEmbed], files: mazeFiles });
     }

     const dir = action;
     const displayDir = dir && dir.length ? dir.charAt(0).toUpperCase() + dir.slice(1).toLowerCase() : dir;
     const [cx, cy] = (currentNode || '').split(',').map((n) => parseInt(n, 10));
     if (isNaN(cx) || isNaN(cy)) {
      return interaction.editReply(`Maze position is invalid. Re-enter the grotto with </explore grotto continue:${mazeCmdId}> and try again.`);
     }
     const nextResult = getNeighbourCoords(matrix, cx, cy, dir, facing);
     if (!nextResult) {
      const currentCell = getPathCellAt(pathCells, cx, cy);
      const isScryingWall = currentCell && (currentCell.type === 'mazep' || currentCell.type === 'mazen');
      const usedScryingWalls = grotto.mazeState?.usedScryingWalls || [];
      const scryingWallAvailable = isScryingWall && !usedScryingWalls.includes(currentNode);
      const ctaText = scryingWallAvailable
       ? `Use </explore grotto maze:${mazeCmdId}> with North, East, South, or West, or Song of Scrying at a wall.`
       : `Use </explore grotto maze:${mazeCmdId}> with North, East, South, or West.`;
      const blockedDesc = mazeFirstEntryFlavor ? `${mazeFirstEntryFlavor}\n\n` : "";
      const blockedEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Maze**")
       .setColor(getMazeEmbedColor('blocked', regionColors[party.region]))
       .setDescription(blockedDesc + `There's a wall to the **${displayDir}** — you can't move that way. ${ctaText}`)
       .setImage(mazeImg);
      addExplorationStandardFields(blockedEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: `</explore grotto maze:${mazeCmdId}>`,
       extraFieldsBeforeIdQuadrant: getExplorationPartyCharacterFields(party),
      });
      if (mazeFiles.length) blockedEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
      return interaction.editReply({ embeds: [blockedEmbed], files: mazeFiles });
     }
     const nextKey = `${nextResult.x},${nextResult.y}`;
     grotto.mazeState.currentNode = nextKey;
     grotto.mazeState.facing = nextResult.facing;
     if (!grotto.mazeState.steps) grotto.mazeState.steps = [];
     grotto.mazeState.steps.push({ direction: dir, at: new Date() });
     if (!grotto.mazeState.visitedCells) grotto.mazeState.visitedCells = [];
     if (!grotto.mazeState.visitedCells.includes(nextKey)) grotto.mazeState.visitedCells.push(nextKey);
     try {
      const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: nextKey, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
      mazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
      mazeImg = "attachment://maze.png";
     } catch (e) {}
     const cell = getPathCellAt(pathCells, nextResult.x, nextResult.y);
     const cellType = cell?.type || 'path';

     if (cellType === 'exit') {
      await markGrottoCleared(grotto);
      for (const slot of party.characters) {
       try {
        await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Maze");
       } catch (err) {
        logger.warn("EXPLORE", `[explore.js]⚠️ Grotto maze exit Spirit Orb: ${err?.message || err}`);
       }
      }
      pushProgressLog(party, character.name, "grotto_maze_success", "Maze trial complete. Each party member received a Spirit Orb.", undefined, undefined, new Date());
      await party.save();
      try {
       const exitMazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "mod", currentNode: nextKey, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
       mazeFiles = [new AttachmentBuilder(exitMazeBuf, { name: "maze.png" })];
       mazeImg = "attachment://maze.png";
      } catch (e) {}
      const exitDesc = mazeFirstEntryFlavor ? `${mazeFirstEntryFlavor}\n\n` : "";
      const exitEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Maze — Exit!**")
       .setColor(getMazeEmbedColor('exit', regionColors[party.region]))
       .setDescription(exitDesc + `Party reached the exit!\n\n${GROTTO_CLEARED_FLAVOR}\n\nSee **Commands** below to continue exploring.`)
       .setImage(mazeImg);
      addExplorationStandardFields(exitEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      });
      if (mazeFiles.length) exitEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
      return interaction.editReply({ embeds: [exitEmbed], files: mazeFiles });
     }

     if (cellType === 'trap') {
      const triggered = grotto.mazeState.triggeredTraps || [];
      if (!triggered.includes(nextKey)) {
       grotto.mazeState.triggeredTraps = [...triggered, nextKey];
       const trapRoll = Math.floor(Math.random() * 6) + 1;
      const trapOutcome = getGrottoMazeTrapOutcome(trapRoll);
      if (trapOutcome.heartsLost > 0 && character._id) {
       try {
        await useHearts(character._id, trapOutcome.heartsLost, { commandName: 'explore', operation: 'grotto_maze_trap_cell' });
       } catch (err) {
        logger.warn("EXPLORE", `[explore.js]⚠️ Grotto maze trap cell useHearts: ${err?.message || err}`);
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
      const heartsLost = trapOutcome.heartsLost ?? 0;
      const staminaCost = trapOutcome.staminaCost ?? 0;
      const costParts = [];
      if (heartsLost > 0) costParts.push(`−${heartsLost}❤️ hearts`);
      if (staminaCost > 0) costParts.push(`−${staminaCost}🟩 stamina`);
      const costLine = costParts.length > 0 ? `\n\n**Cost:** ${costParts.join(", ")}` : "";
      pushProgressLog(party, character.name, "grotto_maze_trap", `Maze trap triggered (moved ${displayDir}): ${trapOutcome.flavor?.split(".")[0] || "trap"}.`, undefined, heartsLost > 0 || staminaCost > 0 ? { heartsLost: heartsLost || undefined, staminaLost: staminaCost || undefined } : undefined, new Date());
      await party.save();
      const trapDesc = `${mazeFirstEntryFlavor ? mazeFirstEntryFlavor + "\n\n" : ""}**Party moved ${displayDir} and triggered a trap!** (Roll: ${trapRoll})\n\n${trapOutcome.flavor}${costLine}`;
      const trapEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Maze — Trap!**")
       .setColor(getMazeEmbedColor('trap', regionColors[party.region]))
       .setDescription(trapDesc)
       .setImage(mazeImg);
      addExplorationStandardFields(trapEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: `</explore grotto maze:${mazeCmdId}>`,
       extraFieldsBeforeIdQuadrant: getExplorationPartyCharacterFields(party),
      });
      if (mazeFiles.length) trapEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
      await grotto.save();
      return interaction.editReply({ embeds: [trapEmbed], files: mazeFiles });
      }
     }

     if (cellType === 'chest') {
      const opened = grotto.mazeState.openedChests || [];
      if (!opened.includes(nextKey)) {
       grotto.mazeState.openedChests = [...opened, nextKey];
       try {
        await addItemInventoryDatabase(character._id, "Spirit Orb", 1, interaction, "Grotto - Maze chest");
       } catch (err) {
        logger.warn("EXPLORE", `[explore.js]⚠️ Grotto maze chest: ${err?.message || err}`);
       }
       const charDoc = await Character.findById(character._id);
       if (charDoc && party.characters) {
        const idx = party.characters.findIndex((c) => c._id && c._id.toString() === character._id.toString());
        if (idx !== -1) party.characters[idx] = { ...party.characters[idx], ...charDoc.toObject?.() || charDoc };
       }
       await grotto.save();
       pushProgressLog(party, character.name, "grotto_maze_chest", `${character.name} opened a maze chest (moved ${displayDir}) and received a Spirit Orb.`, { itemName: "Spirit Orb", emoji: "💫" }, undefined, new Date());
       await party.save();
       const chestDesc = mazeFirstEntryFlavor ? `${mazeFirstEntryFlavor}\n\n` : "";
       const chestEmbed = new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Maze — 📦 Treasure Chest!**")
        .setColor(getMazeEmbedColor('chest', regionColors[party.region]))
        .setDescription(
          chestDesc +
          `**📦 Chest found!** Party moved **${displayDir}** and discovered a treasure chest!\n\n` +
          `**${character.name}** receives a **Spirit Orb** from the chest.`
        )
        .setImage(mazeImg);
       addExplorationStandardFields(chestEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: party.characters[party.currentTurn] ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
        hasActiveGrotto: true,
        activeGrottoCommand: `</explore grotto maze:${mazeCmdId}>`,
        extraFieldsBeforeIdQuadrant: getExplorationPartyCharacterFields(party),
       });
       if (mazeFiles.length) chestEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
       return interaction.editReply({ embeds: [chestEmbed], files: mazeFiles });
      }
     }

     if (cellType === 'mazep' || cellType === 'mazen') {
      const usedWalls = grotto.mazeState.usedScryingWalls || [];
      if (!usedWalls.includes(nextKey)) {
       pushProgressLog(party, character.name, "grotto_maze_scrying_wall", `Party encountered a Scrying Wall (moved ${displayDir}). Use Song of Scrying to interact.`, undefined, undefined, new Date());
       await party.save();
       const redDesc = mazeFirstEntryFlavor ? `${mazeFirstEntryFlavor}\n\n` : "";
       const redEmbed = new EmbedBuilder()
        .setTitle(`🗺️ **Grotto: Maze — Scrying Wall**`)
        .setColor(getMazeEmbedColor('scrying', regionColors[party.region]))
        .setDescription(
          redDesc +
          `Party moved **${displayDir}** and came upon a **wall covered in ancient musical notes!** The runes pulse faintly, awaiting a melody.\n\n` +
          `↳ **Use action: Song of Scrying at a wall** to see what happens!\n` +
          `💡 *A party member with the Entertainer job has a 50% higher chance of success.*`
        )
        .setImage(mazeImg);
       addExplorationStandardFields(redEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: party.characters[party.currentTurn] ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
        hasActiveGrotto: true,
        activeGrottoCommand: `</explore grotto maze:${mazeCmdId}>`,
        extraFieldsBeforeIdQuadrant: getExplorationPartyCharacterFields(party),
       });
       if (mazeFiles.length) redEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
       await grotto.save();
       return interaction.editReply({ embeds: [redEmbed], files: mazeFiles });
      }
     }

     await grotto.save();
     const moveDesc = mazeFirstEntryFlavor ? `${mazeFirstEntryFlavor}\n\n` : "";
     const moveEmbed = new EmbedBuilder()
      .setTitle("🗺️ **Grotto: Maze**")
      .setColor(getMazeEmbedColor(null, regionColors[party.region]))
      .setDescription(moveDesc + `Party moved **${displayDir}**.`)
      .setImage(mazeImg);
    addExplorationStandardFields(moveEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: `</explore grotto maze:${mazeCmdId}>`,
       extraFieldsBeforeIdQuadrant: getExplorationPartyCharacterFields(party),
      });
     if (mazeFiles.length) moveEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
     return interaction.editReply({ embeds: [moveEmbed], files: mazeFiles });
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
      .setDescription(`Party paid 2 🟩 per member and arrived at the grotto in **${travelSquare} ${travelQuadrant}**.\n\nIf the grotto is sealed, cleanse it. If unsealed, use </explore grotto continue:${getExploreCommandId()}> to enter the trial.`)
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(embed, { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant) });
     return interaction.editReply({ embeds: [embed] });
    }

    return interaction.editReply("Unknown grotto subcommand.");
   }

   // ------------------- Revisit discovery (monster camp or grotto in current quadrant) -------------------
   if (subcommand === "discovery") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const discoveryKey = (interaction.options.getString("discovery") || "").trim();
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) return interaction.editReply("Expedition ID not found.");
    const character = await Character.findOne({ name: characterName, userId });
    if (!character) return interaction.editReply("Character not found or you do not own this character.");
    const characterIndex = party.characters.findIndex((c) => c.name === characterName);
    if (characterIndex === -1) return interaction.editReply("Your character is not part of this expedition.");
    if (party.status !== "started") return interaction.editReply("This expedition has not been started yet.");

    const squareId = (party.square && String(party.square).trim()) || "";
    const quadrantId = (party.quadrant && String(party.quadrant).trim()) || "";
    if (!squareId || !quadrantId) return interaction.editReply("Expedition has no current location. Use </explore roll> or </explore move> first.");

    const squareDoc = await Square.findOne({ squareId: new RegExp(`^${String(squareId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (!squareDoc || !squareDoc.quadrants) return interaction.editReply("No map data for this square.");
    const quadrant = squareDoc.quadrants.find((q) => String(q.quadrantId).toUpperCase() === quadrantId.toUpperCase());
    if (!quadrant) return interaction.editReply("No quadrant data for your current location.");
    const discoveries = quadrant.discoveries || [];
    const discovery = discoveries.find((d) => d.discoveryKey === discoveryKey);
    if (!discovery) return interaction.editReply("That discovery was not found in this quadrant. Pick a monster camp or grotto from the list.");
    const discoveryType = String(discovery.type || "").toLowerCase();
    if (discoveryType !== "monster_camp" && discoveryType !== "grotto") {
     return interaction.editReply("You can only revisit monster camps and grottos. That discovery is not one of those.");
    }

    const atActiveGrottoDisc = await hasActiveGrottoAtLocation(party, expeditionId);
    if (atActiveGrottoDisc && discoveryType === "monster_camp") {
     const grotto = await Grotto.findOne({
      squareId,
      quadrantId,
      partyId: expeditionId,
      sealed: false,
      completedAt: null,
     });
     const grottoCmd = getActiveGrottoCommand(grotto?.trialType);
     return interaction.editReply(
      `**Complete the grotto trial first.** You cannot visit monster camps until the trial is complete. Use ${grottoCmd} for your turn.`
     );
    }

    const location = `${party.square} ${party.quadrant}`;
    const nextCharacter = party.characters[party.currentTurn] ?? null;

    if (discoveryType === "monster_camp") {
     const regionKey = (party.region && String(party.region).trim()) || "Eldin";
     const regionCapitalized = regionKey.charAt(0).toUpperCase() + regionKey.slice(1).toLowerCase();
     let camp;
     try {
      camp = await MonsterCamp.findOrCreate(squareId, quadrantId, regionCapitalized);
     } catch (err) {
      logger.error("EXPLORE", `[explore.js]❌ monster_camp findOrCreate: ${err?.message || err}`);
      return interaction.editReply("Failed to find or create monster camp.");
     }
     const isFightable = await MonsterCamp.isFightable(camp);
     if (!isFightable) {
      return interaction.editReply(
       "This camp was recently cleared. Wait for the next Blood Moon to fight it again. Continue with </explore roll>."
      );
     }
     const village = REGION_TO_VILLAGE[regionKey?.toLowerCase()] || "Inariko";
     const MONSTER_CAMP_DIFFICULTIES = ["beginner", "beginner+", "easy", "easy+", "mixed-low", "mixed-medium", "intermediate", "intermediate+"];
     const difficultyGroup = MONSTER_CAMP_DIFFICULTIES[Math.floor(Math.random() * MONSTER_CAMP_DIFFICULTIES.length)];
     const monsterCount = 2 + Math.floor(Math.random() * 4);
     const modifiedInteraction = {
      channel: interaction.channel,
      client: interaction.client,
      guild: interaction.guild,
      user: interaction.user,
      editReply: async () => {},
      followUp: async (opts) => interaction.channel.send(opts),
     };
     let waveResult;
     try {
      waveResult = await startWave(village, monsterCount, difficultyGroup, modifiedInteraction);
     } catch (waveErr) {
      logger.error("EXPLORE", `[explore.js]❌ startWave failed: ${waveErr?.message || waveErr}`);
      return interaction.editReply(`Failed to start wave: ${waveErr?.message || "Unknown error"}`);
     }
     const { waveId, waveData } = waveResult;
     waveData.source = "monster_camp";
     waveData.monsterCampId = camp.campId;
     waveData.channelId = interaction.channel.id;
     waveData.expeditionId = expeditionId;
     await waveData.save();
     const joinedNames = [];
     const failedJoins = [];
     for (const slot of party.characters || []) {
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
     const joinNote = joinedNames.length > 0 ? `**All party members** (${joinedNames.join(", ")}) must fight. ` : "";
     await interaction.channel.send({
      content: `🌊 **MONSTER CAMP WAVE!** — Revisiting a camp at **${location}**!\n\n${joinNote}Use </wave:${getWaveCommandId()}> to take your turn (id: \`${waveId}\`). **The expedition pauses until the wave is complete.**\n</item:${getItemCommandId()}> to heal during the wave!`,
      embeds: [waveEmbed],
     });
     if (failedJoins.length > 0) {
      logger.warn("EXPLORE", `[explore.js]⚠️ monster_camp: could not join wave: ${failedJoins.join("; ")}`);
     }
     pushProgressLog(party, character.name, "monster_camp_revisit", `Revisited monster camp at ${location}; wave ${waveId} started.`, undefined, undefined, new Date());
     await party.save();
     const embed = new EmbedBuilder()
      .setTitle("🗺️ **Expedition: Revisiting Monster Camp**")
      .setColor(regionColors[party.region] || "#00ff99")
      .setDescription(
       `Revisiting a monster camp at **${location}**. All party members must fight. Use </wave:${getWaveCommandId()}> (id: \`${waveId}\`). **Do not use /explore roll until the wave is complete.**`
      )
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(embed, { party, expeditionId, location, nextCharacter: null, showNextAndCommands: false, showRestSecureMove: false });
     return interaction.editReply({ embeds: [embed] });
    }

    if (discoveryType === "grotto") {
     const grotto = await Grotto.findOne({ squareId, quadrantId, sealed: false, partyId: expeditionId }).sort({ unsealedAt: -1 });
     if (grotto) {
      const trialLabel = getTrialLabel(grotto.trialType);
      const cmdId = getExploreCommandId();
      const instructions = {
       blessing: "The grotto held a blessing. Everyone received a Spirit Orb!",
       target_practice: "Establish turn order. Each turn: one character shoots — 3 successes wins, 1 fail ends the trial. See **Commands** below.",
       puzzle: "Discuss with your group. Submit an offering (items); staff will review. If approved, everyone gets Spirit Orbs. See **Commands** below.",
       maze: "Use North, East, South, or West to move, or Song of Scrying at a wall. See **Commands** below.",
      };
      const text = instructions[grotto.trialType] || `Complete the ${trialLabel} trial.`;
      let revisitMazeFiles = [];
      let revisitMazeImg = regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK;
      if (grotto.trialType === "maze" && grotto.mazeState?.layout) {
       try {
        const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: grotto.mazeState.currentNode, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
        revisitMazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
        revisitMazeImg = "attachment://maze.png";
       } catch (err) {
        logger.warn("EXPLORE", `[explore.js] Maze render (revisit): ${err?.message || err}`);
       }
      }
      const embed = new EmbedBuilder()
       .setTitle("🗺️ **Expedition: Revisiting Grotto**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(`Party is at grotto in **${location}**.\n\n**Trial:** ${trialLabel}\n\n${text}`)
       .setImage(revisitMazeImg);
      addExplorationStandardFields(embed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: getActiveGrottoCommand(grotto.trialType),
      });
      if (grotto.trialType === "maze" && revisitMazeFiles.length) embed.setFooter({ text: GROTTO_MAZE_LEGEND });
      return interaction.editReply({ embeds: [embed], files: revisitMazeFiles.length ? revisitMazeFiles : undefined });
     }
     const plumeHolder = await findGoddessPlumeHolder(party);
     if (!plumeHolder) {
      return interaction.editReply(
       "No party member has a Goddess Plume in their expedition loadout to cleanse this grotto. Add one to your loadout before departing, or use </explore roll> and when you get a grotto here choose **Yes** to cleanse with a plume."
      );
     }
     const grottoPayResult = await payStaminaOrStruggle(party, plumeHolder.characterIndex, 1, { order: "currentFirst" });
     if (!grottoPayResult.ok) {
      const partyTotalStamina = (party.characters || []).reduce((sum, c) => sum + (Number(c.currentStamina) || 0), 0);
      const partyTotalHearts = (party.characters || []).reduce((sum, c) => sum + (Number(c.currentHearts) || 0), 0);
      return interaction.editReply(
       `Not enough stamina or hearts to cleanse the grotto. Party has ${partyTotalStamina} 🟩 and ${partyTotalHearts} ❤ (need 1 total). Camp to recover or use hearts to Struggle.`
      );
     }
     const plumeIdx = (party.characters[plumeHolder.characterIndex].items || []).findIndex((it) => String(it.itemName || "").toLowerCase() === "goddess plume");
     if (plumeIdx !== -1) {
      party.characters[plumeHolder.characterIndex].items.splice(plumeIdx, 1);
      party.markModified("characters");
      await party.save();
     }
     const at = new Date();
     const usedGrottoNamesRevisit = await Grotto.distinct("name").catch(() => []);
     const grottoName = getRandomGrottoNameUnused(usedGrottoNamesRevisit);
     const discoveryKeyGrotto = discovery.discoveryKey || `grotto|${squareId}|${quadrantId}|${at.toISOString()}`;
     const trialTypeRevisit = rollGrottoTrialType();
     const puzzleStateRevisit = trialTypeRevisit === 'puzzle' ? (() => {
      const cfg = rollPuzzleConfig();
      const s = { puzzleSubType: cfg.subType };
      if (cfg.subType === 'odd_structure') s.puzzleVariant = cfg.variant;
      else s.puzzleClueIndex = cfg.clueIndex;
      return s;
     })() : undefined;
     let grottoDoc = await Grotto.findOne({ squareId, quadrantId });
     if (grottoDoc) {
      grottoDoc.discoveryKey = discoveryKeyGrotto;
      grottoDoc.name = grottoName;
      grottoDoc.sealed = false;
      grottoDoc.status = "cleansed";
      grottoDoc.trialType = trialTypeRevisit;
      grottoDoc.partyId = expeditionId;
      grottoDoc.unsealedAt = at;
      grottoDoc.unsealedBy = plumeHolder.character.name;
      grottoDoc.completedAt = null;
      grottoDoc.targetPracticeState = { turnIndex: 0, successCount: 0, failed: false };
      grottoDoc.puzzleState = puzzleStateRevisit || { puzzleSubType: null, puzzleVariant: null, puzzleClueIndex: null };
      grottoDoc.testOfPowerState = { raidStarted: false, raidId: null };
      grottoDoc.mazeState = { currentNode: "", steps: [], facing: "s", layout: undefined, openedChests: [], triggeredTraps: [], usedScryingWalls: [] };
      grottoDoc.markModified("targetPracticeState");
      grottoDoc.markModified("puzzleState");
      grottoDoc.markModified("testOfPowerState");
      await grottoDoc.save();
     } else {
      grottoDoc = new Grotto({
       discoveryKey: discoveryKeyGrotto,
       squareId,
       quadrantId,
       name: grottoName,
       partyId: expeditionId,
       sealed: false,
       unsealedAt: at,
       unsealedBy: plumeHolder.character.name,
       trialType: trialTypeRevisit,
       ...(puzzleStateRevisit && { puzzleState: puzzleStateRevisit }),
      });
      await grottoDoc.save();
     }
     if (discovery.discoveryKey) {
      await updateDiscoveryName(squareId, quadrantId, discovery.discoveryKey, grottoName);
      await updateDiscoveryGrottoStatus(squareId, quadrantId, discovery.discoveryKey, "cleansed");
     }
     pushProgressLog(party, plumeHolder.character.name, "grotto_cleansed", `Cleansed grotto **${grottoName}** (revisit) in ${location} (1 Goddess Plume + 1 stamina).`, undefined, { staminaLost: 1 }, at);
     if (grottoDoc.trialType === "blessing") {
      await markGrottoCleared(grottoDoc);
      for (const slot of party.characters) {
       try {
        await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Blessing (revisit)");
       } catch (err) {
        logger.warn("EXPLORE", `[explore.js]⚠️ Grotto revisit blessing Spirit Orb: ${err?.message || err}`);
       }
      }
      pushProgressLog(party, plumeHolder.character.name, "grotto_blessing", "Blessing trial: each party member received a Spirit Orb.", undefined, undefined, new Date());
      const blessingFlavorRevisit = getRandomBlessingFlavor();
      const blessingEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Expedition: Grotto cleansed (revisit)**")
       .setColor(regionColors[party.region] || "#00ff99")
       .setDescription(
        `**${plumeHolder.character.name}** used a Goddess Plume and 1 stamina to cleanse **${grottoName}** in **${location}**.\n\n` +
        blessingFlavorRevisit + `\n\n${GROTTO_CLEARED_FLAVOR}\n\nUse the commands below to continue exploring.`
       )
       .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
      addExplorationStandardFields(blessingEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant) });
      const explorePageUrlRevisit = `${(process.env.DASHBOARD_URL || process.env.APP_URL || "https://tinglebot.xyz").replace(/\/$/, "")}/explore/${encodeURIComponent(expeditionId)}`;
      blessingEmbed.addFields({
       name: "📍 **__Set pin on webpage__**",
       value: `Set a pin for this grotto on the **explore/${expeditionId}** page: ${explorePageUrlRevisit}`,
       inline: false,
      });
      return interaction.editReply({ embeds: [blessingEmbed] });
     }
     const trialLabelRevisit = getTrialLabel(grottoDoc.trialType);
     const grottoCmdRevisit = getActiveGrottoCommand(grottoDoc.trialType);
     let continueDescRevisit = `**${plumeHolder.character.name}** used a Goddess Plume and 1 stamina to cleanse **${grottoName}** in **${location}**.\n\n**Trial: ${trialLabelRevisit}** — `;
     if (grottoDoc.trialType === 'puzzle' && grottoDoc.puzzleState?.puzzleSubType) {
      const puzzleFlavorRevisit = getPuzzleFlavor(grottoDoc);
      if (puzzleFlavorRevisit) continueDescRevisit += `\n\n${puzzleFlavorRevisit}`;
      else continueDescRevisit += `Complete the trial to receive a **Spirit Orb**. Use ${grottoCmdRevisit} for your turn.`;
     } else {
      continueDescRevisit += `Complete the trial to receive a **Spirit Orb**. Use ${grottoCmdRevisit} for your turn.`;
     }
     const continueEmbed = new EmbedBuilder()
      .setTitle("🗺️ **Expedition: Grotto cleansed (revisit)**")
      .setColor(regionColors[party.region] || "#00ff99")
      .setDescription(continueDescRevisit)
      .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
     addExplorationStandardFields(continueEmbed, {
      party,
      expeditionId,
      location,
      nextCharacter,
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasActiveGrotto: true,
      activeGrottoCommand: grottoCmdRevisit,
     });
     const explorePageUrlRevisitTrial = `${(process.env.DASHBOARD_URL || process.env.APP_URL || "https://tinglebot.xyz").replace(/\/$/, "")}/explore/${encodeURIComponent(expeditionId)}`;
     continueEmbed.addFields({
      name: "📍 **__Set pin on webpage__**",
      value: `Set a pin for this grotto on the **explore/${expeditionId}** page: ${explorePageUrlRevisitTrial}`,
      inline: false,
     });
     return interaction.editReply({ embeds: [continueEmbed] });
    }

    return interaction.editReply("Unknown discovery type.");
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

     const atActiveGrotto = await hasActiveGrottoAtLocation(party, expeditionId);
     if (atActiveGrotto) {
      const grotto = await Grotto.findOne({
       squareId: (party.square && String(party.square).trim()) || "",
       quadrantId: (party.quadrant && String(party.quadrant).trim()) || "",
       partyId: expeditionId,
       sealed: false,
       completedAt: null,
      });
      const grottoCmd = getActiveGrottoCommand(grotto?.trialType);
      return interaction.editReply(
       `**Complete the grotto trial first.** You cannot use \`/explore roll\` until the trial is complete. Use ${grottoCmd} for your turn.`
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

     // Compute roll stamina cost from quadrant state BEFORE sync (rolling in unexplored costs 2)
     const rollStaminaCost = party.quadrantState === "unexplored" ? 2 : party.quadrantState === "explored" ? 1 : 0;

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
         logger.error("EXPLORE", `[explore.js]❌ Mark quadrant explored (roll sync): ${mapErr.message}`);
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

     const payResult = await payStaminaOrStruggle(party, characterIndex, rollStaminaCost, { order: "currentFirst" });
     if (!payResult.ok) {
      const location = `${party.square} ${party.quadrant}`;
      return interaction.editReply({
        embeds: [createStuckInWildEmbed(party, location)],
      });
     }
     const rollCostsForLog = buildCostsForLog(payResult);
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
       outcomeType = rollOutcome();
       continue;
      }
      if (!SPECIAL_OUTCOMES.includes(outcomeType)) break;
      if (specialCount >= MAX_SPECIAL_EVENTS_PER_SQUARE) {
       const reason = `special discovery count for this square is ${specialCount} (max ${MAX_SPECIAL_EVENTS_PER_SQUARE}); only counted outcomes: monster_camp/grotto/relic/ruins when accepted (monster_camp_skipped does not count)`;
       outcomeType = rollOutcome();
       continue;
      }
      if (outcomeType === "grotto") {
       const alreadyHasGrotto = hasGrottoInSquare(party, party.square, mapSquareForGrotto);
       if (alreadyHasGrotto) {
        outcomeType = lastOutcomeHere === "explored" ? "item" : "explored"; // fallback; avoid explored twice in a row
        break;
       }
      }
      if (outcomeType === "relic" && (await characterAlreadyFoundRelicThisExpedition(party, character.name, character._id))) {
       const reason = "this character already found a relic this expedition (one per character)";
       outcomeType = rollOutcome();
       continue;
      }
      if (specialCount >= 1 && Math.random() > DISCOVERY_REDUCE_CHANCE_WHEN_ANY) {
       const reason = `square already has ${specialCount} special discovery/discoveries; roll failed discovery-reduce (${(DISCOVERY_REDUCE_CHANCE_WHEN_ANY * 100).toFixed(0)}% keep chance)`;
       outcomeType = rollOutcome();
       continue;
      }
      break;
     }
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
         logger.warn("EXPLORE", `[explore.js]⚠️ Map update: no square for ${mapSquareId} ${mapQuadrantId}`);
        } else if (result.modifiedCount === 0) {
         logger.warn("EXPLORE", `[explore.js]⚠️ Map: quadrant not updated ${mapSquareId} ${mapQuadrantId}`);
        } else {
         if (!party.exploredQuadrantsThisRun) party.exploredQuadrantsThisRun = [];
         party.exploredQuadrantsThisRun.push({ squareId: mapSquareId, quadrantId: mapQuadrantId });
         party.markModified("exploredQuadrantsThisRun");
         await party.save();
        }
       }
      } catch (mapErr) {
       logger.error("EXPLORE", `[explore.js]❌ Update map quadrant status: ${mapErr.message}`);
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
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
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
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
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
      const embed = createExplorationItemEmbed(party, character, fairyItem, expeditionId, location, party.totalHearts, party.totalStamina, nextChar ?? null, true, ruinRestRecovered, await hasDiscoveriesInQuadrant(party.square, party.quadrant));
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
      let savedOldMapDoc = null;
      if (outcomeType === "old_map") {
       chosenMapOldMap = getRandomOldMap();
       try {
        savedOldMapDoc = await addOldMapToCharacter(character.name, chosenMapOldMap.number, location);
       } catch (err) {
        handleInteractionError(err, interaction, { source: "explore.js old_map" });
       }
       const mapIdStr = savedOldMapDoc?.mapId ? `\`${savedOldMapDoc.mapId}\`` : "—";
       const userIds = [...new Set((party.characters || []).map((c) => c.userId).filter(Boolean))];
       const dmEmbed = new EmbedBuilder()
        .setTitle("🗺️ Expedition map found")
        .setDescription(`**Map #${chosenMapOldMap.number}** found and saved to **${character.name}**'s map collection. Take it to the Inariko Library to get it deciphered.`)
        .setThumbnail(OLD_MAP_ICON_URL)
        .setImage(MAP_EMBED_BORDER_URL)
        .addFields(
          { name: "Map", value: `**Map #${chosenMapOldMap.number}**`, inline: true },
          { name: "Map ID", value: mapIdStr, inline: true },
          { name: "Expedition", value: `\`${expeditionId}\``, inline: true }
        )
        .setURL(OLD_MAPS_LINK)
        .setColor(0x2ecc71)
        .setFooter({ text: "Roots of the Wild • Old Maps" });
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
        logger.error("EXPLORE", `[explore.js]❌ createRelic (roll): ${err?.message || err}`);
       }
       if (!party.gatheredItems) party.gatheredItems = [];
       party.gatheredItems.push({ characterId: character._id, characterName: character.name, itemName: "Unknown Relic", quantity: 1, emoji: "🔸" });
       const relicUserIds = [...new Set((party.characters || []).map((c) => c.userId).filter(Boolean))];
       const relicIdStr = savedRelic?.relicId ? `\`${savedRelic.relicId}\`` : '—';
       const relicDmEmbed = new EmbedBuilder()
        .setTitle("🔸 Expedition relic found")
        .setDescription(`**Unknown Relic** discovered by **${character.name}** in ${location}.\n\nTake it to an Inarikian Artist or Researcher to get it appraised.`)
        .setColor(0xe67e22)
        .setThumbnail(UNAPPRAISED_RELIC_IMAGE_URL)
        .setImage(RELIC_EMBED_BORDER_URL)
        .addFields(
          { name: "Relic ID", value: relicIdStr, inline: true },
          { name: "Expedition", value: `\`${expeditionId}\``, inline: true }
        )
        .setURL("https://www.rootsofthewild.com/relics")
        .setFooter({ text: "Use /relic appraisal-request to get it appraised" });
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
       old_map: chosenMapOldMap ? `Found Map #${chosenMapOldMap.number} in ${location}; take to Inariko Library to decipher.` : `Found an old map in ${location}; take to Inariko Library to decipher.`,
       ruins: `Found ruins in ${location} (explore for 3 stamina or skip).`,
       relic: `Found a relic in ${location}; take to Artist/Researcher to appraise.`,
       camp: `Found a safe space in ${location} and rested. Recovered ${campHeartsRecovered} heart(s), ${campStaminaRecovered} stamina.`,
       monster_camp: `Found a monster camp in ${location}; report to town hall to mark on map.`,
       grotto: `Found a grotto in ${location} (cleanse for 1 Goddess Plume + 1 stamina or mark for later).`,
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
        ? { itemName: chosenMapOldMap ? `Map #${chosenMapOldMap.number}` : "An old map", emoji: "" }
        : outcomeType === "relic"
          ? { itemName: "Unknown Relic", emoji: "🔸" }
          : undefined;
      const at = new Date();
      // Ruins, grotto, monster camp: only add to map and progressLog when user chooses Yes (No = doesn't count)
      if (REPORTABLE_DISCOVERY_OUTCOMES.has(outcomeType) && outcomeType !== "ruins" && outcomeType !== "monster_camp" && outcomeType !== "grotto") {
       await pushDiscoveryToMap(party, outcomeType, at, interaction.user?.id);
      }
      const progressOutcome = outcomeType === "ruins" ? "ruins_found" : outcomeType;
      // Ruins, monster camp: defer progressLog until button choice (Yes = counts, No = skipped)
      // Grotto: log discovery immediately so dashboard shows it; choice (Yes/No) adds follow-up entries
      if (outcomeType !== "monster_camp" && outcomeType !== "ruins") {
       pushProgressLog(
        party,
        character.name,
        outcomeType === "grotto" ? "grotto_found" : progressOutcome,
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
       const mapInfo = chosenMapOldMap
        ? `**${character.name}** found **Map #${chosenMapOldMap.number}** in **${location}**!\n\nThe script is faded and hard to read—you'll need to take it to the Inariko Library to get it deciphered.\n\n**Saved to ${character.name}'s map collection.**`
        : `**${character.name}** found an old map in **${location}**!\n\nThe script is faded and hard to read—you'll need to take it to the Inariko Library to get it deciphered.\n\n**Saved to ${character.name}'s map collection.**`;
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
        "You stumble across an interesting looking stump with roots covered in talismans. More info about grottos can be found [here](https://www.rootsofthewild.com/grottos).\n\n" +
        "**Mark on map** — Save for later (counts toward this square's 3 discovery limit).\n" +
        "**Open** — Cleanse the grotto now (1 Goddess Plume + 1 stamina).";
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
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      });

      const isYesNoChoice = outcomeType === "ruins" || outcomeType === "grotto" || outcomeType === "chest";
      const isMonsterCampChoice = outcomeType === "monster_camp";
      let components = [];
      if (isYesNoChoice) {
       const grottoLabels = outcomeType === "grotto"
        ? { yes: "Open", no: "Mark on map" }
        : { yes: "Yes", no: "No" };
       const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
         .setCustomId(`explore_${outcomeType}_yes|${expeditionId}|${characterIndex}`)
         .setLabel(grottoLabels.yes)
         .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
         .setCustomId(`explore_${outcomeType}_no|${expeditionId}|${characterIndex}`)
         .setLabel(grottoLabels.no)
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
       const expectedUserId = interaction.user.id;
       const collector = msg.createMessageComponentCollector({
        filter: (i) => {
         const match = i.user.id === expectedUserId;
         if (!match) {
          logger.info("EXPLORE", `[explore.js] Grotto/ruins/chest button filter REJECTED: clicker=${i.user.id} (${i.user.tag}) expected=${expectedUserId} outcomeType=${outcomeType} customId=${i.customId}`);
         }
         return match;
        },
        time: 5 * 60 * 1000,
        max: 1,
       });
       collector.on("collect", async (i) => {
        logger.info("EXPLORE", `[explore.js] Button collected: outcomeType=${outcomeType} customId=${i.customId} userId=${i.user.id} expeditionId=${expeditionId}`);
        try {
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
         const collectLabels = outcomeType === "grotto" ? { yes: "Open", no: "Mark on map" } : { yes: "Yes", no: "No" };
         disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_yes|${expeditionId}|${characterIndex}`)
           .setLabel(collectLabels.yes)
           .setStyle(ButtonStyle.Success)
           .setDisabled(true),
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_no|${expeditionId}|${characterIndex}`)
           .setLabel(collectLabels.no)
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
          addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant) });
          await i.followUp({ embeds: [noStaminaEmbed] }).catch(() => {});
          return;
         }
         // Reload ruinsCharacter for later use (camp outcome etc. may add stamina to them)
         const ruinsCharacterReload = await Character.findById(ruinsCharSlot._id);
         if (ruinsCharacterReload) {
          ruinsCharacter.currentStamina = ruinsCharacterReload.currentStamina;
          ruinsCharacter.currentHearts = ruinsCharacterReload.currentHearts;
         }
         const ruinsCostsForLog = buildCostsForLog(ruinsPayResult);

         // Now that user chose Yes, add ruins to map and reportable progress log (so dashboard shows "Set pin" only after Yes)
         const ruinsAt = new Date();
         await pushDiscoveryToMap(freshParty, "ruins", ruinsAt, i.user?.id);
         pushProgressLog(freshParty, ruinsCharacter.name, "ruins", `Explored ruins in ${location}.`, undefined, ruinsCostsForLog, ruinsAt);

         // Weighted roll: chest 7, camp 3, landmark 3, relic 1, old_map 2, star_fragment 2, blight 1, goddess_plume 1 (total 20)
         const roll = Math.random() * 20;
         let ruinsOutcome;
         if (roll < 7) ruinsOutcome = "chest";
         else if (roll < 10) ruinsOutcome = "camp";
         else if (roll < 13) ruinsOutcome = "landmark";
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

         if (ruinsOutcome === "relic" && (await characterAlreadyFoundRelicThisExpedition(freshParty, ruinsCharacter.name, ruinsCharacter._id))) {
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
           logger.warn("EXPLORE", `[explore.js]⚠️ Mark ruin-rest on map: ${mapErr?.message || mapErr}`);
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
           logger.error("EXPLORE", `[explore.js]❌ createRelic (ruins): ${err?.message || err}`);
          }
          if (!freshParty.gatheredItems) freshParty.gatheredItems = [];
          freshParty.gatheredItems.push({ characterId: ruinsCharacter._id, characterName: ruinsCharacter.name, itemName: "Unknown Relic", quantity: 1, emoji: "🔸" });
          const ruinsRelicIdStr = ruinsSavedRelic?.relicId ? `\`${ruinsSavedRelic.relicId}\`` : '—';
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found a relic in the ruins! (ID: ${ruinsRelicIdStr}) Take it to an Inarikian Artist or Researcher to get it appraised. More info [here](https://www.rootsofthewild.com/relics).\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a relic (take to Artist/Researcher to appraise).";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, ruinsCostsForLog);
          pushProgressLog(freshParty, ruinsCharacter.name, "relic", `Found a relic in ${location}; take to Artist/Researcher to appraise.`, { itemName: "Unknown Relic", emoji: "🔸" }, undefined);
          const relicUserIds = [...new Set((freshParty.characters || []).map((c) => c.userId).filter(Boolean))];
          const relicDmEmbed = new EmbedBuilder()
           .setTitle("🔸 Expedition relic found")
           .setDescription(`**Unknown Relic** discovered by **${ruinsCharacter.name}** in ${location}.\n\nTake it to an Inarikian Artist or Researcher to get it appraised.`)
           .setColor(0xe67e22)
           .setThumbnail(UNAPPRAISED_RELIC_IMAGE_URL)
           .setImage(RELIC_EMBED_BORDER_URL)
           .addFields(
             { name: "Relic ID", value: ruinsRelicIdStr, inline: true },
             { name: "Expedition", value: `\`${expeditionId}\``, inline: true }
           )
           .setURL("https://www.rootsofthewild.com/relics")
           .setFooter({ text: "Use /relic appraisal-request to get it appraised" });
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
          let ruinsSavedMapDoc = null;
          try {
           ruinsSavedMapDoc = await addOldMapToCharacter(ruinsCharacter.name, chosenMap.number, location);
          } catch (err) {
           handleInteractionError(err, i, { source: "explore.js ruins old_map" });
          }
          const ruinsMapIdStr = ruinsSavedMapDoc?.mapId ? ` Map ID: \`${ruinsSavedMapDoc.mapId}\`.` : "";
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found **Map #${chosenMap.number}** in the ruins! The script is faded and hard to read—take it to the Inariko Library to get it deciphered.\n\n**Saved to ${ruinsCharacter.name}'s map collection.**${ruinsMapIdStr} Find out more about maps [here](${OLD_MAPS_LINK}).\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += `Found Map #${chosenMap.number}; saved to map collection. Take to Inariko Library to decipher.`;
          lootForLog = { itemName: `Map #${chosenMap.number}`, emoji: "" };
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, lootForLog, ruinsCostsForLog);
          // DM all expedition members (no coordinates until appraised)
          const userIds = [...new Set((freshParty.characters || []).map((c) => c.userId).filter(Boolean))];
          const ruinsMapIdField = ruinsSavedMapDoc?.mapId ? { name: "Map ID", value: `\`${ruinsSavedMapDoc.mapId}\``, inline: true } : null;
          const dmEmbed = new EmbedBuilder()
           .setTitle("🗺️ Expedition map found")
           .setDescription(`**Map #${chosenMap.number}** found and saved to **${ruinsCharacter.name}**'s map collection. Take it to the Inariko Library to get it deciphered.`)
           .setThumbnail(OLD_MAP_ICON_URL)
           .setImage(MAP_EMBED_BORDER_URL)
           .addFields(
             { name: "Map", value: `**Map #${chosenMap.number}**`, inline: true },
             ...(ruinsMapIdField ? [ruinsMapIdField] : []),
             { name: "Expedition", value: `\`${expeditionId}\``, inline: true }
           )
           .setURL(OLD_MAPS_LINK)
           .setColor(0x2ecc71)
           .setFooter({ text: "Roots of the Wild • Old Maps" });
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
         // Persist progress log (incl. "ruins" entry for Report to town hall) before showing embed/buttons
         await freshParty.save();
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
          hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(finalParty.square, finalParty.quadrant),
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
              addExplorationStandardFields(errEmbed, { party: fp || {}, expeditionId, location, nextCharacter: fp?.characters?.[fp.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(fp?.square, fp?.quadrant) });
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
              addExplorationStandardFields(noStamEmbed, { party: fp, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(fp.square, fp.quadrant) });
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
              addExplorationStandardFields(openedEmbed, { party: fp, expeditionId, location, nextCharacter: result.nextCharacter ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(fp.square, fp.quadrant) });
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
             addExplorationStandardFields(skipEmbed, { party: finalParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(finalParty.square, finalParty.quadrant) });
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
           addExplorationStandardFields(errEmbed, { party: freshParty || {}, expeditionId, location, nextCharacter: freshParty?.characters?.[freshParty.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty?.square, freshParty?.quadrant) });
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
           addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant) });
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
           addExplorationStandardFields(openedEmbed, { party: freshParty, expeditionId, location, nextCharacter: result.nextCharacter ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant) });
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
         addExplorationStandardFields(skipEmbed, { party, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant) });
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
          await party.save();
          const monsterCampEmbed = new EmbedBuilder()
           .setTitle("🗺️ **Expedition: Monster Camp found!**")
           .setColor(regionColors[party.region] || "#00ff99")
           .setDescription(
            description.split("\n\n")[0] + "\n\n" +
            `✅ **Marked on map.** You can fight it when you return (or after the next Blood Moon if already cleared). Continue with </explore roll:${getExploreCommandId()}>.`
           )
           .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
          addExplorationStandardFields(monsterCampEmbed, { party, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant) });
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
          const squareId = (freshParty.square && String(freshParty.square).trim()) || "";
          const quadrantId = (freshParty.quadrant && String(freshParty.quadrant).trim()) || "";
          const regionKey = (freshParty.region && String(freshParty.region).trim()) || "Eldin";
          const regionCapitalized = regionKey.charAt(0).toUpperCase() + regionKey.slice(1).toLowerCase();
          let camp;
          try {
           camp = await MonsterCamp.findOrCreate(squareId, quadrantId, regionCapitalized);
          } catch (err) {
           logger.error("EXPLORE", `[explore.js]❌ MonsterCamp findOrCreate: ${err?.message || err}`);
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
          addExplorationStandardFields(blockedEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant) });
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
          let waveResult;
          try {
           waveResult = await startWave(village, monsterCount, difficultyGroup, modifiedInteraction);
          } catch (waveErr) {
           logger.error("EXPLORE", `[explore.js]❌ startWave (monster camp): ${waveErr?.message || waveErr}`);
           await i.followUp({ content: `❌ Failed to start wave: ${waveErr?.message || "Unknown error"}`, ephemeral: true }).catch(() => {});
           return;
          }
          const { waveId, waveData } = waveResult;
          waveData.source = "monster_camp";
          waveData.monsterCampId = camp.campId;
          waveData.channelId = i.channel.id;
          waveData.expeditionId = expeditionId;
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
           content: `🌊 **MONSTER CAMP WAVE!** — A wave has been triggered at **${location}**!\n\n${joinNote}Use </wave:${getWaveCommandId()}> to take your turn (id: \`${waveId}\`). **The expedition pauses until the wave is complete.**\n</item:${getItemCommandId()}> to heal during the wave!`,
           embeds: [waveEmbed],
          });
          if (failedJoins.length > 0) {
           logger.warn("EXPLORE", `[explore.js]⚠️ Monster camp wave: could not join: ${failedJoins.join("; ")}`);
          }
          pushProgressLog(freshParty, character.name, "monster_camp_fight", `Found a monster camp in ${location}; marked on map and started wave ${waveId}. All party members must fight.`, undefined, monsterCampCosts, at);
          await freshParty.save();
          const monsterCampEmbed = new EmbedBuilder()
           .setTitle("🗺️ **Expedition: Monster Camp found!**")
           .setColor(regionColors[freshParty.region] || "#00ff99")
           .setDescription(
            description.split("\n\n")[0] + "\n\n" +
            `✅ **Marked on map and fighting now!** All party members must fight. Use </wave:${getWaveCommandId()}> to take turns (id: \`${waveId}\`). **Do not use /explore roll until the wave is complete.**`
           )
           .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
          addExplorationStandardFields(monsterCampEmbed, { party: freshParty, expeditionId, location, nextCharacter: null, showNextAndCommands: false, showRestSecureMove: false, ruinRestRecovered });
          await msg.edit({ embeds: [monsterCampEmbed], components: [disabledRow] }).catch(() => {});
          return;
         }
         if (monsterCampChoice === "leave") {
          pushProgressLog(party, character.name, "monster_camp_skipped", `Found a monster camp in ${location}; didn't mark it (won't count toward discovery limit).`, undefined, monsterCampCosts, at);
          await party.save();
          const monsterCampEmbed = new EmbedBuilder()
           .setTitle("🗺️ **Expedition: Monster Camp found!**")
           .setColor(regionColors[party.region] || "#00ff99")
           .setDescription(
            description.split("\n\n")[0] + "\n\n" +
            `✅ **You didn't mark it.** Won't be recorded as a discovery (squares have 3 max). Continue with </explore roll:${getExploreCommandId()}>.`
           )
           .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
          addExplorationStandardFields(monsterCampEmbed, { party, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant) });
          await msg.edit({ embeds: [monsterCampEmbed], components: [disabledRow] }).catch(() => {});
          return;
         }
        }

        if (outcomeType === "grotto") {
         const at = new Date();
         if (isYes) {
          logger.info("EXPLORE", `[explore.js] Grotto Yes chosen, calling handleGrottoCleanse expeditionId=${expeditionId} characterIndex=${characterIndex}`);
          // Yes = cleanse (handled by handleGrottoCleanse; discovery pushed there if needed)
          await handleGrottoCleanse(i, msg, party, expeditionId, characterIndex, location, disabledRow, nextCharacter, ruinRestRecovered);
          logger.info("EXPLORE", `[explore.js] handleGrottoCleanse returned expeditionId=${expeditionId}`);
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
         addExplorationStandardFields(grottoEmbed, { party, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant) });
         const explorePageUrlNo = `${(process.env.DASHBOARD_URL || process.env.APP_URL || "https://tinglebot.xyz").replace(/\/$/, "")}/explore/${encodeURIComponent(expeditionId)}`;
         grottoEmbed.addFields({
          name: "📍 **__Set pin on webpage__**",
          value: `Set a pin for this grotto on the **explore/${expeditionId}** page: ${explorePageUrlNo}`,
          inline: false,
         });
         await msg.edit({ embeds: [grottoEmbed], components: [disabledRow] }).catch(() => {});
         return;
        }

        if (outcomeType === "ruins" && !isYes) {
         const at = new Date();
         pushProgressLog(party, character.name, "ruins_skipped", `Found ruins in ${location}; left for later (won't count toward discovery limit).`, undefined, undefined, at);
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
          hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
        });
        await msg.edit({ embeds: [choiceEmbed], components: [disabledRow] }).catch(() => {});
        if (outcomeType === "ruins" && !isYes && nextCharacter?.userId) {
         await i.followUp({
          content: `**${character.name}** decided not to explore the ruins! <@${nextCharacter.userId}> take your turn.`,
         }).catch(() => {});
        }
        } catch (collectErr) {
         logger.error("EXPLORE", `[explore.js] ❌ Collector collect handler error outcomeType=${outcomeType} customId=${i?.customId} userId=${i?.user?.id}: ${collectErr?.message || collectErr}`);
         if (i && !i.replied && !i.deferred) {
          await i.reply({ content: "❌ Something went wrong processing your choice. Try /explore roll again.", flags: 64 }).catch(() => {});
         } else if (i?.followUp) {
          await i.followUp({ content: "❌ Something went wrong processing your choice. Try /explore roll again.", flags: 64 }).catch(() => {});
         }
        }
       });
       collector.on("end", async (collected, reason) => {
        if (collected.size === 0) {
         logger.info("EXPLORE", `[explore.js] Collector ended without collect: reason=${reason} outcomeType=${outcomeType} expeditionId=${expeditionId}`);
        }
        if (reason === "time" && collected.size === 0 && msg.editable) {
         const fp = await Party.findActiveByPartyId(expeditionId);
         if (fp) {
          if (outcomeType === "monster_camp") {
           pushProgressLog(fp, character.name, "monster_camp_skipped", `Found a monster camp in ${location}; choice timed out (not marked).`, undefined, Object.keys(rollCostsForLog).length ? rollCostsForLog : undefined, new Date());
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
          } else if (outcomeType === "grotto") {
           pushProgressLog(fp, character.name, "grotto_skipped", `Found a grotto in ${location}; choice timed out (no action).`, undefined, undefined, new Date());
          }
          if (outcomeType === "monster_camp" || outcomeType === "ruins" || outcomeType === "grotto") {
           await fp.save();
          }
         }
         if (outcomeType === "monster_camp") {
          // Already edited in monster_camp block above
         } else {
         const timeoutLabels = outcomeType === "grotto" ? { yes: "Open", no: "Mark on map" } : { yes: "Yes", no: "No" };
         const timeoutDisabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_yes|${expeditionId}|${characterIndex}`)
           .setLabel(timeoutLabels.yes)
           .setStyle(ButtonStyle.Success)
           .setDisabled(true),
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_no|${expeditionId}|${characterIndex}`)
           .setLabel(timeoutLabels.no)
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


      if (availableItems.length === 0) {
       logger.warn("EXPLORE", `[explore.js]⚠️ No items for region "${regionKey}"`);
       return interaction.editReply("No items available for this region.");
      }

      // Rarity-weighted pick: common items (low rarity) more likely, rare less likely. FV 50 = neutral spread. Fallback to uniform if no itemRarity.
      const weightedList = createWeightedItemList(availableItems, 50);
      const selectedItem = weightedList.length > 0
       ? weightedList[Math.floor(Math.random() * weightedList.length)]
       : availableItems[Math.floor(Math.random() * availableItems.length)];

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
       ruinRestRecovered,
       await hasDiscoveriesInQuadrant(party.square, party.quadrant)
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
      await party.save();

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
       logger.error("EXPLORE", `[explore.js]❌ Add item to inventory: ${error.message}`);
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
          logger.warn("EXPLORE", `[explore.js]⚠️ Raid cooldown: ${raidResult.error}`);
          await interaction.editReply(
           `⏰ **${raidResult.error}**\n\n🗺️ **The monster has retreated due to recent raid activity. Try exploring again later.**`
          );
         } else {
          logger.error("EXPLORE", `[explore.js]❌ Trigger raid: ${raidResult?.error || "Unknown error"}`);
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
         ruinRestRecovered,
         await hasDiscoveriesInQuadrant(party.square, party.quadrant)
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
        logger.error("EXPLORE", `[explore.js]❌ Raid processing: ${error?.message || error}`);
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
        ruinRestRecovered,
        await hasDiscoveriesInQuadrant(party.square, party.quadrant)
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
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       });

       await interaction.editReply({ embeds: [embed] });
       await interaction.followUp({ content: `<@${nextCharacterTier.userId}> it's your turn now` });
      }
     }
    } catch (error) {
     handleInteractionError(error, interaction, { source: "explore.js" });
     logger.error("EXPLORE", `[explore.js]❌ Roll command: ${error?.message || error}`);
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
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
     });
     addExplorationCommandsField(notExploredEmbed, {
       party,
       expeditionId,
       location: locationSecure,
       nextCharacter: nextChar ?? null,
       showNextAndCommands: true,
       showRestSecureMove: true,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
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
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
     });
     addExplorationCommandsField(embed, {
      party,
      expeditionId,
      location: locationSecure,
      nextCharacter: nextChar ?? null,
      showNextAndCommands: true,
      showRestSecureMove: true,
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
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
       logger.warn("EXPLORE", `[explore.js]⚠️ Secure map: no square ${mapSquareId} ${mapQuadrantId}`);
      }
     } catch (mapErr) {
      logger.error("EXPLORE", `[explore.js]❌ Update map to secured: ${mapErr.message}`);
     }
    }

    party.quadrantState = "secured";
    party.markModified("quadrantState");
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;

    const locationSecure = `${party.square} ${party.quadrant}`;
    const secureCostsForLog = buildCostsForLog(securePayResult);
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

    const atActiveGrottoMove = await hasActiveGrottoAtLocation(party, expeditionId);
    if (atActiveGrottoMove) {
     const grotto = await Grotto.findOne({
      squareId: (party.square && String(party.square).trim()) || "",
      quadrantId: (party.quadrant && String(party.quadrant).trim()) || "",
      partyId: expeditionId,
      sealed: false,
      completedAt: null,
     });
     const grottoCmd = getActiveGrottoCommand(grotto?.trialType);
     return interaction.editReply(
      `**Complete the grotto trial first.** You cannot use \`/explore move\` until the trial is complete. Use ${grottoCmd} for your turn.`
     );
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
     ? buildCostsForLog(movePayResult)
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
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
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
       logger.error("EXPLORE", `[explore.js]❌ Mark quadrant explored (move): ${mapErr.message}`);
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
        logger.warn("EXPLORE", `[explore.js]⚠️ Old map collection check: ${invErr?.message || invErr}`);
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
    const hasDiscMove = await hasDiscoveriesInQuadrant(newLocation.square, newLocation.quadrant);
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationMove,
      nextCharacter: nextCharacterMove ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      commandsLast: true,
      hasDiscoveriesInQuadrant: hasDiscMove,
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
      hasDiscoveriesInQuadrant: hasDiscMove,
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
    const hasDiscItem = await hasDiscoveriesInQuadrant(party.square, party.quadrant);
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationItem,
      nextCharacter: nextCharacterItem,
      showNextAndCommands: true,
      showRestSecureMove: false,
      commandsLast: true,
      hasDiscoveriesInQuadrant: hasDiscItem,
    });
    addExplorationCommandsField(embed, {
      party,
      expeditionId,
      location: locationItem,
      nextCharacter: nextCharacterItem,
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasDiscoveriesInQuadrant: hasDiscItem,
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
    // Bundles (Eldin Ore Bundle, Wood Bundle) are virtual slots: return as base item with quantity per slot
    for (const partyCharacter of party.characters || []) {
     const items = partyCharacter.items || [];
     for (const item of items) {
      if (!item || !item.itemName) continue;
      const bundle = PAVING_BUNDLES[item.itemName];
      if (bundle) {
       await addItemInventoryDatabase(
        partyCharacter._id,
        bundle.baseItemName,
        bundle.quantityPerSlot,
        interaction,
        "Expedition ended — returned from party (bundle)"
       ).catch((err) => logger.error("EXPLORE", `[explore.js]❌ Return bundle to owner: ${err.message}`));
      } else {
       await addItemInventoryDatabase(
        partyCharacter._id,
        item.itemName,
        1,
        interaction,
        "Expedition ended — returned from party"
       ).catch((err) => logger.error("EXPLORE", `[explore.js]❌ Return item to owner: ${err.message}`));
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
    let itemsGathered = Array.isArray(party.gatheredItems) && party.gatheredItems.length > 0
      ? party.gatheredItems.reduce((sum, g) => sum + (typeof g.quantity === "number" ? g.quantity : 1), 0)
      : 0;
    // Fallback: count from progressLog when gatheredItems wasn't persisted (legacy bug)
    if (itemsGathered === 0 && log.length > 0) {
      for (const e of log) {
        if (e.outcome === "item") itemsGathered += 1;
        else if (e.outcome === "relic") itemsGathered += 1;
        else if (e.outcome === "monster" && e.loot?.itemName) itemsGathered += 1;
        else if (e.outcome === "chest_open") itemsGathered += party.characters?.length ?? 1;
      }
    }
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
      else if (o === "relic") highlightOutcomes.add("Relic found");
    }
    const highlightsList = [...highlightOutcomes];
    if (itemsGathered > 0) highlightsList.unshift(`**${itemsGathered}** item(s) gathered`);
    const highlightsValue = highlightsList.length > 0 ? highlightsList.map((h) => `• ${h}`).join("\n") : "";

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
    if (highlightsValue) {
     embed.addFields({
      name: "✨ **Highlights**",
      value: highlightsValue,
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

    if (raid.grottoId) {
     return interaction.editReply({
      content: "You cannot retreat from a Grotto Test of Power. Defeat the monster to continue your expedition.",
      ephemeral: true
     });
    }

    const retreatPayResult = await payStaminaOrStruggle(party, characterIndex, 1, { order: "currentFirst" });
    if (!retreatPayResult.ok) {
     return interaction.editReply(
      "Not enough stamina or hearts. A retreat attempt costs **1** (stamina or heart). The party has " + (party.totalStamina ?? 0) + " stamina and " + (party.totalHearts ?? 0) + " hearts. **Camp** to recover, or use hearts to **Struggle**."
     );
    }
    const retreatCostsForLog = buildCostsForLog(retreatPayResult);

    const failedAttempts = raid.failedRetreatAttempts ?? 0;
    const retreatChance = Math.min(RETREAT_BASE_CHANCE + failedAttempts * RETREAT_BONUS_PER_FAIL, RETREAT_CHANCE_CAP);
    const success = Math.random() < retreatChance;
    if (success) {
     await endExplorationRaidAsRetreat(raid, interaction.client);
     character.failedFleeAttempts = 0;
     await character.save();
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
      showRestSecureMove: false,
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
     });
     return interaction.editReply({ embeds: [embed] });
    }

    raid.failedRetreatAttempts = (raid.failedRetreatAttempts ?? 0) + 1;
    await raid.save();

    character.failedFleeAttempts = (character.failedFleeAttempts ?? 0) + 1;
    await character.save();

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
      showRestSecureMove: false,
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
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
    const hasDiscCamp = await hasDiscoveriesInQuadrant(party.square, party.quadrant);
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationCamp,
      nextCharacter: nextCharacterCamp ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      commandsLast: true,
      hasDiscoveriesInQuadrant: hasDiscCamp,
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
      hasDiscoveriesInQuadrant: hasDiscCamp,
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
