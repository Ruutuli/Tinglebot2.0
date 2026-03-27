// ============================================================================
// ------------------- explore.js -------------------
// Exploration command: roll, secure, move, camp, end, grotto trials, etc.
//
// DESIGN NOTE — Quadrant "explored" vs "revealed":
// - A quadrant stays UNEXPLORED until the party gets the "Quadrant Explored!" prompt (roll outcome "explored").
// - Moving into a quadrant does NOT mark it explored; only the roll outcome "explored" updates the map DB.
// - The dashboard removes fog of war from the quadrant the party is currently in (so they can see it), but
//   that quadrant remains "unexplored" (e.g. roll costs 2 stamina) until they get the Quadrant Explored prompt.
//
// DESIGN NOTE — Turn Order Architecture:
// The expedition system has THREE independent turn trackers:
//   1. party.currentTurn — indexes into party.characters[] for expedition actions (roll, move, camp, secure)
//   2. wave.currentTurn — indexes into wave.participants[] during monster camp waves
//   3. raid.currentTurn — indexes into raid.participants[] during tier 5+ raids
//
// Key turn order rules:
//   - During active combat (wave/raid), the combat's turn order takes precedence
//   - The expedition turn is "frozen" while combat is active
//   - When combat ends (victory/retreat), the expedition turn advances once (the roll that triggered combat is "consumed")
//   - Items used during combat advance ONLY the combat turn, not the expedition turn
//   - Items used outside combat advance the expedition turn (so "Next" and who can use item stay in sync)
//   - Camping, retreat attempts, and most roll outcomes advance the expedition turn
//   - Choice-based outcomes (monster_camp, chest, ruins, grotto) defer turn advancement until the choice is made
//   - Wave currentTurn continues across monsters; after a kill, the next participant acts first
//
// Turn advancement pattern (use party.advanceTurn() when possible for consistency):
//   party.currentTurn = (party.currentTurn + 1) % party.characters.length;
//   await party.save();
//
// DESIGN NOTE — Concurrency:
// There is no optimistic locking or version field on Party. One action per expedition at a time is assumed
// (turn check restricts who can act). If adding concurrent actions later, consider a version field and
// retry on conflict.
// ============================================================================

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

// ------------------- Discord ------------------
const { SlashCommandBuilder } = require("@discordjs/builders");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");

// ------------------- Database ------------------
const { fetchAllItems, fetchItemsByMonster, createRelic, getCharacterInventoryCollection, getCharacterInventoryCollectionWithModSupport, fetchMonsterByName, fetchCharacterById, fetchItemByName, getMonstersAboveTier } = require('@/database/db.js');

// ------------------- Models ------------------
const Raid = require("../../models/RaidModel.js");
const Party = require('@/models/PartyModel.js');
const Character = require('@/models/CharacterModel.js');
const ModCharacter = require('@/models/ModCharacterModel.js');
const ItemModel = require('@/models/ItemModel.js');
const Square = require('@/models/mapModel.js');
const Pin = require('@/models/PinModel.js');
const Grotto = require('@/models/GrottoModel.js');
const MonsterCamp = require('@/models/MonsterCampModel.js');
const Relic = require('@/models/RelicModel.js');
const Wave = require('@/models/WaveModel.js');

// ------------------- Modules ------------------
const { calculateFinalValue, getMonstersByRegion, getExplorationMonsterFromList, createWeightedItemList, createQuadrantWeightedExplorationItemList, applyQuadrantMonsterBias } = require("../../modules/rngModule.js");
const { getEncounterOutcome } = require("../../modules/encounterModule.js");
const { generateVictoryMessage, generateDamageMessage, generateDefenseBuffMessage, generateAttackBuffMessage, generateFinalOutcomeMessage, generateModCharacterVictoryMessage } = require("../../modules/flavorTextModule.js");
const { handleKO, healKoCharacter, useHearts } = require("../../modules/characterStatsModule.js");
const { triggerRaid, endExplorationRaidAsRetreat, closeRaidsForExpedition, advanceRaidTurnOnItemUse, cancelRaidTurnSkip, scheduleRaidTurnSkip } = require("../../modules/raidModule.js");
const { startWave, joinWave, advanceWaveTurnOnItemUse } = require("../../modules/waveModule.js");
const MapModule = require('@/modules/mapModule.js');
const { pushProgressLog, hasDiscoveriesInQuadrant, hasUnpinnedDiscoveriesInQuadrant, updateDiscoveryGrottoStatus, markGrottoCleared, applyExpeditionFailedState } = require("../../modules/exploreModule.js");
const { getElixirTypeByName, elixirCountersExplorationHazard, isHazardResistanceElixir } = require("../../modules/elixirModule.js");
const { finalizeBlightApplication } = require("../../handlers/blightHandler.js");
const { partyHasRelic, consumeBlightCandleUse, partyHasLensOfTruthRelic, characterHasRelic, relicOwnerMatchQuery } = require('@/utils/relicUtils.js');

// ------------------- Utils ------------------
const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { addItemInventoryDatabase, removeItemInventoryDatabase, logItemRemovalToDatabase } = require('@/utils/inventoryUtils.js');
const { addOldMapToCharacter, hasOldMap, hasAppraisedOldMap, hasAppraisedUnexpiredOldMap, hasAppraisedRedeemedOldMap, findAndRedeemOldMap } = require('@/utils/oldMapUtils.js');
const { checkInventorySync } = require('@/utils/characterUtils.js');
const { enforceJail } = require('@/utils/jailCheck');
// Set to true to allow roll/move/camp/secure/end/grotto/discovery/item without pinning discoveries (for testing). false = must set a pin for grottos/monster camps etc. before other actions.
const SKIP_PIN_REQUIREMENT_FOR_TESTING = false;
const { generateGrottoMaze, getPathCellAt, getNeighbourCoords, getCellBeyondWall, removeScryingWall } = require('@/utils/grottoMazeGenerator.js');
const { renderMazeToBuffer } = require('@/utils/grottoMazeRenderer.js');
const logger = require("@/utils/logger.js");
const { isValidImageUrl } = require("@/utils/validation.js");
const fs = require("fs");
const path = require("path");

// ------------------- Data ------------------
const { rollGrottoTrialType, getTrialLabel, GROTTO_CLEARED_FLAVOR, GROTTO_ALREADY_CLEARED_BLESSING, GROTTO_CLEANSED_VS_CLEARED, GROTTO_STATUS_LEGEND } = require('@/data/grottoTrials.js');
const { rollPuzzleConfig, getPuzzleFlavor, getOfferingStatueClueText, ensurePuzzleConfig, checkPuzzleOffer, getPuzzleConsumeItems, getRandomPuzzleSuccessFlavor } = require('@/data/grottoPuzzleData.js');
const { getRandomGrottoName, getRandomGrottoNameUnused } = require('@/data/grottoNames.js');
const { getFailOutcome, getMissOutcome, getSuccessOutcome, getCompleteOutcome } = require('@/data/grottoTargetPracticeOutcomes.js');
const { getGrottoMazeOutcome, getGrottoMazeTrapOutcome, getGazepScryingOutcome, getGrottoMazeChestLoot, getGrottoMazeRandomMoveEvent } = require('@/data/grottoMazeOutcomes.js');
const { getRandomMazeEntryFlavor } = require('@/data/grottoMazeEntryFlavors.js');
// Test of Power uses normal monsters from MonsterModel (tier 5+) and their images
const { getRandomBlessingFlavor } = require('@/data/grottoBlessingOutcomes.js');
const { getRandomOldMap, OLD_MAPS_LINK, OLD_MAP_ICON_URL, MAP_EMBED_BORDER_URL } = require("../../data/oldMaps.js");
const { getRandomCampFlavor, getRandomSafeSpaceFlavor } = require("../../data/explorationMessages.js");
const { getEffectiveQuadrantStatus, isPreestablishedSecured, isPreestablishedNoCamp } = require("../../data/preestablishedSecuredQuadrants.js");
const { START_POINTS_BY_REGION } = require("../../data/explorationStartPoints.js");

// ------------------- Embeds & Handlers ------------------
const { addExplorationStandardFields, addExplorationCommandsField, getExplorationFlavorText, createExplorationItemEmbed, createExplorationMonsterEmbed, createExplorationEndOnlyAtStartEmbed, createMonsterCampSkippedNextTurnEmbed, createExplorationErrorEmbed, createRaidBlockEmbed, createWaveBlockEmbed, regionColors, regionImages, getExploreCommandId, createWaveEmbed, getWaveCommandId, getItemCommandId, getExploreOutcomeColor, getExploreMapImageUrl } = require("../../embeds/embeds.js");
const { handleAutocomplete } = require("../../handlers/autocompleteHandler.js");

// ------------------- Image URLs ------------------
const EXPLORATION_IMAGE_FALLBACK = "https://via.placeholder.com/100x100";
const QUADRANT_MILESTONE_IMAGE = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const GROTTO_MAZE_LEGEND = "🟫 Entrance | 🟩 Exit | 🟦 Chest | 🟨 Trap | 🔴 Scrying Wall | ✖️ Used (trap/chest/wall) | 🟧 You are here | ⬜ Path | ⬛ Wall — Unexplored areas stay dark until you enter them.";
// Map maze embed outcome type to progress-log outcome for consistent color (see getExploreOutcomeColor in embeds.js)
const MAZE_OUTCOME_FOR_EMBED = {
  exit: "grotto_maze_success", bypassed: "grotto_maze_success", faster_path_open: "grotto_maze_success",
  chest: "grotto_maze_chest",
  pit_trap: "grotto_maze_trap", trap: "grotto_maze_trap", stalagmites: "grotto_maze_trap",
  battle: "grotto_maze_raid",
  scrying: "grotto_maze_scrying",
  collapse: "grotto_maze_success", step_back: "grotto_maze_success", nothing: "grotto",
  blocked: "grotto_maze_blocked",
};
function getMazeEmbedColor(outcomeType, regionColor) {
  const outcome = outcomeType ? (MAZE_OUTCOME_FOR_EMBED[outcomeType] || "grotto") : "grotto";
  return getExploreOutcomeColor(outcome, regionColor || "#00ff99");
}
/** Arrow for maze direction (North ↑, South ↓, East →, West ←) for embed display. */
function getMazeDirectionArrow(dir) {
  if (!dir || typeof dir !== "string") return "";
  const d = dir.toLowerCase();
  if (d === "north") return "↑ ";
  if (d === "south") return "↓ ";
  if (d === "east") return "→ ";
  if (d === "west") return "← ";
  return "";
}
/** Restore the expedition party pool to full when leaving a grotto (the grotto's blessing restores the party before they step back into the wilds). */
function restorePartyPoolOnGrottoExit(party) {
  if (!party) return;
  party.totalHearts = party.maxHearts;
  party.totalStamina = party.maxStamina;
  party.markModified("totalHearts");
  party.markModified("totalStamina");
  if (party.characters && Array.isArray(party.characters)) {
   for (const slot of party.characters) {
    if (typeof slot.maxHearts === "number") slot.currentHearts = slot.maxHearts;
    if (typeof slot.maxStamina === "number") slot.currentStamina = slot.maxStamina;
   }
   party.markModified("characters");
  }
}
const UNAPPRAISED_RELIC_IMAGE_URL = "https://static.wikia.nocookie.net/zelda_gamepedia_en/images/7/7c/HW_Sealed_Weapon_Icon.png/revision/latest?cb=20150918051232";
const RELIC_EMBED_BORDER_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
// Grotto embeds: two separate images. Found = grotto1; cleansed/cleared = grotto2. Maze trials use maze image instead of grotto2.
/** Grotto found embed: normal region context with this image (uncleansed). */
const GROTTO_BANNER_UNCLEANSED_URL = "https://storage.googleapis.com/tinglebot/Banners/grotto1.png";
/** Grotto cleansed/cleared embed: normal region context with this image. After cleansing, grotto embeds use this unless trial is maze. */
const GROTTO_BANNER_CLEANSED_URL = "https://storage.googleapis.com/tinglebot/Banners/grotto2.png";
/** Target Practice grotto thumbnail (balloon Korok). */
const TARGET_PRACTICE_THUMBNAIL_URL = "https://cdn.wikimg.net/en/zeldawiki/images/0/00/BotW_Balloon_Korok_Model.png";
/** Target Practice success embed thumbnail (Spirit Orb). */
const TARGET_PRACTICE_SUCCESS_THUMBNAIL_URL = "https://storage.googleapis.com/tinglebot/Items/ROTWspiritorb.png";
/** Thumbnail for any grotto trial completion (Spirit Orb reward). */
const GROTTO_CLEARED_THUMBNAIL_URL = "https://storage.googleapis.com/tinglebot/Items/ROTWspiritorb.png";
/** Grotto embed images when inside a grotto (randomly chosen). */
const GROTTO_INSIDE_BANNERS = [
  "https://storage.googleapis.com/tinglebot/Banners/grottobanner1.png",
  "https://storage.googleapis.com/tinglebot/Banners/grottobanner2.png",
  "https://storage.googleapis.com/tinglebot/Banners/grottobanner3.png",
];
function getRandomGrottoBanner() {
  return GROTTO_INSIDE_BANNERS[Math.floor(Math.random() * GROTTO_INSIDE_BANNERS.length)];
}

/** Grotto image that replaces the region banner (full size, no overlay). Uses region banner only for target dimensions. Returns { attachment, imageUrl } for embed.setImage and optional files. */
const GROTTO_FOUND_BANNER_NAME = "grotto-found-banner.png";
const GROTTO_CLEANSED_BANNER_NAME = "grotto-cleansed-banner.png";
async function generateGrottoBannerOverlay(party, overlayUrl, attachmentName) {
  const Jimp = require("jimp");
  const timeout = 12000;
  let bannerImg = null;
  let overlayImg = null;
  try {
    const regionBannerUrl = getExploreMapImageUrl(party, { highlight: true });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Grotto banner timeout")), timeout));
    const bannerPromise = Jimp.read(regionBannerUrl);
    bannerImg = await Promise.race([bannerPromise, timeoutPromise]);
    const overlayPromise = Jimp.read(overlayUrl);
    overlayImg = await Promise.race([overlayPromise, timeoutPromise]);
    const bw = bannerImg.bitmap.width || 0;
    const bh = bannerImg.bitmap.height || 0;
    const ow = overlayImg.bitmap.width || 0;
    const oh = overlayImg.bitmap.height || 0;
    if (!bw || !bh) return { attachment: null, imageUrl: overlayUrl };
    if (!ow || !oh) return { attachment: null, imageUrl: overlayUrl };
    // Resize grotto to full banner size so it replaces the region image (no overlay)
    overlayImg.resize(bw, bh);
    const buffer = await overlayImg.getBufferAsync(Jimp.MIME_PNG);
    const attachment = new AttachmentBuilder(buffer, { name: attachmentName });
    return { attachment, imageUrl: `attachment://${attachmentName}` };
  } catch (err) {
    logger.warn("EXPLORE", `[explore.js] Grotto banner composite failed: ${err?.message || err}`);
    return { attachment: null, imageUrl: overlayUrl };
  } finally {
    try {
      if (bannerImg && typeof bannerImg.dispose === "function") bannerImg.dispose();
      if (overlayImg && typeof overlayImg.dispose === "function") overlayImg.dispose();
    } catch (_) {}
  }
}

async function generateGrottoFoundBanner(party) {
  const result = await generateGrottoBannerOverlay(party, GROTTO_BANNER_UNCLEANSED_URL, GROTTO_FOUND_BANNER_NAME);
  return result.attachment;
}

/** Border image and color for "Not your turn" embeds. */
const NOT_YOUR_TURN_BORDER_URL = "https://storage.googleapis.com/tinglebot/Borders/border_orng.png";
const NOT_YOUR_TURN_COLOR = 0xFFA500; // orange

// ============================================================================
// ------------------- Constants & Configuration -------------------
// ============================================================================

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- enforcePreestablishedSecuredOnSquare ------------------
// Ensure pre-established path/village quadrants are always stored as
// { status: 'secured', noCamp: true } in the exploringMap collection.
async function enforcePreestablishedSecuredOnSquare(squareIdRaw) {
  try {
    const squareId = String(squareIdRaw || "").trim();
    if (!squareId) return;
    const regex = new RegExp(`^${squareId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$`, "i");
    const doc = await Square.findOne({ squareId: regex });
    if (!doc || !Array.isArray(doc.quadrants) || doc.quadrants.length === 0) return;
    let modified = false;
    for (const q of doc.quadrants) {
      const qId = String(q.quadrantId || "").trim().toUpperCase();
      if (!qId) continue;
      if (isPreestablishedSecured(squareId, qId) && (!q.noCamp || q.status !== "secured")) {
        q.noCamp = true;
        q.status = "secured";
        modified = true;
      }
    }
    if (modified) {
      doc.markModified("quadrants");
      try {
        doc.updatedAt = new Date();
      } catch {
        // ignore if path not present on schema
      }
      await doc.save();
      logger.info("EXPLORE", `[explore.js] Synced pre-established secured/noCamp quadrants for square ${squareId}`);
    }
  } catch (err) {
    logger.warn("EXPLORE", `[explore.js]⚠️ enforcePreestablishedSecuredOnSquare failed for ${squareIdRaw}: ${err?.message || err}`);
  }
}

// ------------------- usePartyOnlyForHeartsStamina ------------------
// During active expedition (or testing), hearts/stamina live only in party model; character DB updated at end -
function usePartyOnlyForHeartsStamina(party) {
  return party && party.status === "started";
}

// ------------------- appendExploreStat ------------------
// Append roll debug line to exploreStats.txt -
function appendExploreStat(line) {
  const filePath = path.join(__dirname, "..", "..", "exploreStats.txt");
  try {
    fs.appendFileSync(filePath, line + "\n");
  } catch (e) {
    logger.warn("EXPLORE", `[explore.js]⚠️ exploreStats write failed: ${e?.message || e}`);
  }
}

// ------------------- disableMessageButtonsOnTimeout ------------------
// When a collector ends by time with no collection, disable buttons on the message -
function disableMessageButtonsOnTimeout(message, disabledRow) {
  if (message?.editable) message.edit({ components: [disabledRow] }).catch(() => {});
}

// ------------------- getExplorationNextTurnContent ------------------
// Consistent "next turn" ping for exploration. next: { userId?, name? } -
function getExplorationNextTurnContent(next) {
  if (!next) return null;
  if (next.userId) return `<@${next.userId}> — **you're up next.**`;
  return `**${next.name || "Next"}** — **you're up next.**`;
}

// ------------------- resolveExplorationMonsterLoot ------------------
// Chuchu loot: Chuchu Jelly (or elemental variant) instead of Chuchu Egg -
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
// Build stamina/hearts cost object for progress log from pay result -
function buildCostsForLog(payResult) {
  if (!payResult) return {};
  const o = {};
  if (payResult.staminaPaid > 0) o.staminaLost = payResult.staminaPaid;
  if (payResult.heartsPaid > 0) o.heartsLost = payResult.heartsPaid;
  return o;
}

// ------------------- getTargetPracticeModifiers ------------------
// Modifiers from bow/slingshot, Hunter/Scout, weapon quality -
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

// ------------------- getTargetPracticeGearFlavor ------------------
// Flavor line when character has bow/slingshot or Hunter/Scout helping their aim.
function getTargetPracticeGearFlavor(character, outcomeType) {
  if (!character || typeof outcomeType !== "string") return "";
  const { failReduction, missReduction } = getTargetPracticeModifiers(character);
  if (failReduction === 0 && missReduction === 0) return "";
  const weaponName = (character?.gearWeapon?.name || "").trim();
  const job = (character?.job || "").trim();
  const isHunterOrScout = ["Hunter", "Hunter (Looting)", "Scout"].includes(job);
  const gearParts = [];
  if (weaponName) gearParts.push(weaponName);
  if (isHunterOrScout) gearParts.push(`${job} training`);
  const gearStr = gearParts.length > 0 ? gearParts.join(" and ") : "your gear";
  const yourGear = gearStr.startsWith("your ") ? gearStr : `your ${gearStr}`;
  if (outcomeType === "hit") return ` **Thanks to ${yourGear},** the shot landed true.`;
  if (outcomeType === "miss") return ` **${yourGear.charAt(0).toUpperCase() + yourGear.slice(1)}** gave you a better chance—still a narrow miss.`;
  if (outcomeType === "fail") return ` **Even with ${yourGear},** the Koroks had the last laugh this time.`;
  return "";
}

// ------------------- Village mapping (Raid: Rudania | Inariko | Vhintl) ------------------
const REGION_TO_VILLAGE = {
 eldin: "Rudania",
 lanayru: "Inariko",
 faron: "Vhintl",
};

// ------------------- Monster camp wave variety (weighted so beginner/2-monster are rarer) ------------------
function pickWeighted(items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of items) {
    r -= x.weight;
    if (r <= 0) return x.value;
  }
  return items[items.length - 1].value;
}
const MONSTER_CAMP_DIFFICULTY_WEIGHTS = [
  { value: 'beginner', weight: 1 }, { value: 'beginner+', weight: 1 },
  { value: 'easy', weight: 2 }, { value: 'easy+', weight: 2 }, { value: 'mixed-low', weight: 2 }, { value: 'mixed-medium', weight: 2 },
  { value: 'intermediate', weight: 2 }, { value: 'intermediate+', weight: 2 },
  { value: 'advanced', weight: 1 }, { value: 'advanced+', weight: 1 },
];
const MONSTER_CAMP_COUNT_WEIGHTS = [
  { value: 2, weight: 1 }, { value: 3, weight: 3 }, { value: 4, weight: 3 }, { value: 5, weight: 2 }, { value: 6, weight: 1 },
];

// ------------------- Paving bundles (virtual slots, 5 base items each) ------------------
const PAVING_BUNDLES = {
 "Eldin Ore Bundle": { baseItemName: "Eldin Ore", quantityPerSlot: 5 },
 "Wood Bundle": { baseItemName: "Wood", quantityPerSlot: 5 },
};

const DISABLE_EXPLORATION_RAIDS = false; // Set true to disable tier 5+ exploration raid encounters

// CAMP_ATTACK_CHANCE_* - Chance (0–1) that camping is interrupted by a monster attack. Explored/unexplored = 25%; secured = 5%.
const CAMP_ATTACK_CHANCE_UNSECURED = 0.25;
const CAMP_ATTACK_CHANCE_SECURED = 0.05;
// CAMP_ATTACK_BONUS_* - Extra chance when party has 0 stamina (exhausted camp = easier target). Added to unsecured chance, capped at CAMP_ATTACK_CHANCE_ZERO_STAMINA_CAP.
const CAMP_ATTACK_BONUS_WHEN_ZERO_STAMINA = 0.15;
const CAMP_ATTACK_CHANCE_ZERO_STAMINA_CAP = 0.5;
// CAMP_ATTACK_PROTECTION_* - Protection against consecutive camp attacks at 0 stamina to prevent quick party KO
const CAMP_ATTACK_PROTECTION_LOOKBACK = 2; // Check last N camp attempts
const CAMP_ATTACK_PROTECTION_THRESHOLD = 1; // If N or more were attacks, guarantee safe camp

const EXPLORATION_CHEST_RELIC_CHANCE = 0.02;

// ------------------- Roll outcome chances (must sum to 1) ------------------
const EXPLORATION_OUTCOME_CHANCES = {
  monster: 0.20,   // combat encounters
  item: 0.42,      // finding items (gather) — increased from 0.33
  explored: 0.215, // fallback when grotto can't be placed (square has grotto, at cap, etc.); absorbs grotto weight reduction
  fairy: 0.05,
  chest: 0.01,     // reduced: chests show up less often
  old_map: 0.01,   // less likely: map finds
  ruins: 0.04,
  relic: 0.005,
  camp: 0.02,      // safe space
  monster_camp: 0.04,
  grotto: 0.01,    // grotto discovery (~1% per roll; was 3%)
};

// ------------------- Hot Spring: chance to heal up to 25% of max party hearts when rolling in a Hot Spring quadrant (only when party has missing hearts) ------------------
const HOT_SPRING_HEAL_CHANCE = 0.25;
const HOT_SPRING_HEAL_FRACTION = 0.25;
// Camping in a hot-spring quadrant: extra hearts and/or stamina (rolled separately; same fraction cap as roll hot spring)
const HOT_SPRING_CAMP_EXTRA_BONUS_CHANCE = 0.75;

// ------------------- Retreat (tier 5+ raids): +5% per fail, cap 95% ------------------
const RETREAT_BASE_CHANCE = 0.5;
const RETREAT_BONUS_PER_FAIL = 0.05;
const RETREAT_CHANCE_CAP = 0.95;

// ------------------- calculateDistanceFromStart ------------------
// Calculates the distance (in squares) from current location to region starting location.
// Uses Manhattan distance (|Δcol| + |Δrow|) for simplicity and meaningful game progression.
// Square format: letter + number (e.g., H8, A1). Letter = column (A-J), Number = row (1-12).
function calculateDistanceFromStart(party) {
  if (!party?.region || !party?.square) {
    return 0;
  }

  const startPoint = START_POINTS_BY_REGION[party.region];
  if (!startPoint?.square) {
    return 0;
  }

  const startSquare = startPoint.square.toUpperCase();
  const currentSquare = (party.square || "").toUpperCase();

  // Parse square coordinates (e.g., "H8" -> col=7, row=8)
  const startCol = startSquare.charCodeAt(0) - 65; // A=0, B=1, etc.
  const startRow = parseInt(startSquare.slice(1), 10) || 0;
  const currentCol = currentSquare.charCodeAt(0) - 65;
  const currentRow = parseInt(currentSquare.slice(1), 10) || 0;

  // Manhattan distance in squares
  return Math.abs(currentCol - startCol) + Math.abs(currentRow - startRow);
}

// ------------------- calculateDangerLevel ------------------
// Calculates danger scaling based on distance from starting point (in squares).
// Danger increases as party travels further from home, decreases as they return.
// Used to increase monster encounters, monster tier, and camp attack chances.
function calculateDangerLevel(party) {
  const distance = calculateDistanceFromStart(party);

  // Distance factor: +5% danger per square from start (max +25%)
  // 0 squares = 0%, 1 square = 5%, 2 squares = 10%, 3 squares = 15%, 4 squares = 20%, 5+ squares = 25%
  const dangerBonus = Math.min(0.25, distance * 0.05);

  return {
    distance,
    dangerBonus, // max +25%
  };
}

// ------------------- shouldBlockItemForBalance ------------------
// Checks if this character should be blocked from getting an item due to
// having too many items compared to the party member with the fewest.
// Threshold: ±3 items difference triggers reroll to a different outcome.
const ITEM_BALANCE_THRESHOLD = 3;

function shouldBlockItemForBalance(party, rollingCharacter) {
  if (!party.gatheredItems || party.gatheredItems.length === 0 || !party.characters || party.characters.length <= 1) {
    return false;
  }

  // Count items per character
  const itemCounts = {};
  for (const pc of party.characters) {
    itemCounts[pc.name] = 0;
  }
  for (const item of party.gatheredItems) {
    const name = item.characterName;
    if (itemCounts[name] !== undefined) {
      itemCounts[name] += item.quantity || 1;
    }
  }

  const rollerCount = itemCounts[rollingCharacter.name] ?? 0;
  
  // Find the minimum item count among party members
  let minCount = Infinity;
  for (const pc of party.characters) {
    const count = itemCounts[pc.name] ?? 0;
    if (count < minCount) {
      minCount = count;
    }
  }

  // Block item if roller has more than threshold items above the minimum
  return (rollerCount - minCount) > ITEM_BALANCE_THRESHOLD;
}

const EXPLORE_STRUGGLE_CONTEXT = { commandName: "explore", operation: "struggle" };

// ------------------- getCombatBlockReply ------------------
// Consistent wave/raid gating for explore actions (roll/move/camp/end/etc.)
async function getCombatBlockReply(party, expeditionId, blockedAction, location) {
  if (!expeditionId) return null;
  const re = exactIRegex(expeditionId);
  const [activeRaid, activeWave] = await Promise.all([
    Raid.findOne({ expeditionId: { $regex: re }, status: "active" }),
    Wave.findOne({ expeditionId: { $regex: re }, status: "active" }),
  ]);
  if (activeRaid) return { embeds: [createRaidBlockEmbed(party, activeRaid.raidId, blockedAction, location)] };
  if (activeWave) return { embeds: [createWaveBlockEmbed(party, activeWave.waveId, blockedAction)] };
  return null;
}

// ------------------- payStaminaOrStruggle ------------------
// Pay cost from PARTY pool only: stamina first, then hearts (struggle) for shortfall.
// During a started expedition the pool (party.totalStamina / party.totalHearts) is authoritative;
// we never deduct from character.currentStamina or character.currentHearts for the cost.
async function payStaminaOrStruggle(party, characterIndex, staminaCost, options = {}) {
  if (!party || !party.characters || party.characters.length === 0) {
    return { ok: false, reason: "not_enough" };
  }
  const totalStamina = Math.max(0, Number(party.totalStamina) || 0);
  const totalHearts = Math.max(0, Number(party.totalHearts) || 0);
  const shortfall = Math.max(0, staminaCost - totalStamina);

  if (shortfall > 0 && totalHearts < shortfall) {
    return { ok: false, reason: "not_enough" };
  }

  const staminaPaid = Math.min(staminaCost, totalStamina);
  const heartsPaid = shortfall;

  const afterStamina = Math.max(0, totalStamina - staminaPaid);
  const afterHearts = Math.max(0, totalHearts - heartsPaid);

  const id = party.partyId ?? "?";
  const action = options.action ?? "pay";
  const cost = (staminaPaid > 0 ? `−${staminaPaid}🟩` : "") + (heartsPaid > 0 ? `−${heartsPaid}❤` : "") || "0";
  logger.info("EXPLORE", `[explore.js] id=${id} ${action} ❤${totalHearts} 🟩${totalStamina} ${cost} → ❤${afterHearts} 🟩${afterStamina}`);

  party.totalStamina = afterStamina;
  party.totalHearts = afterHearts;
  party.markModified("totalHearts");
  party.markModified("totalStamina");
  await party.save();
  return { ok: true, staminaPaid, heartsPaid };
}

// ------------------- Quadrant Hazards ------------------
// Hazards are stored on the map's quadrant doc (Square.quadrants[].hazards).
// Tuning: Light (per user selection)
const HAZARD_PROC_CHANCE = 0.20; // 20% chance per action
const HOT_COLD_STAMINA_PROC_CHANCE = 0.15; // 15% additional chance per action

async function getQuadrantHazards(squareId, quadrantId) {
  const s = String(squareId || "").trim();
  const q = String(quadrantId || "").trim().toUpperCase();
  if (!s || !q) return [];
  try {
    const mapSquare = await Square.findOne({ squareId: { $regex: exactIRegex(s) } }).lean();
    const quad = mapSquare?.quadrants?.find((qu) => String(qu?.quadrantId || "").trim().toUpperCase() === q);
    const raw = Array.isArray(quad?.hazards) ? quad.hazards : [];
    const norm = raw
      .map((h) => String(h || "").trim().toLowerCase())
      .filter(Boolean);
    return [...new Set(norm)];
  } catch (_) {
    return [];
  }
}

async function getQuadrantMeta(squareId, quadrantId) {
  const s = String(squareId || "").trim();
  const q = String(quadrantId || "").trim().toUpperCase();
  if (!s || !q) {
    return { terrain: [], hazards: [], items: [], monsters: [], bossMonsters: [], special: [] };
  }
  try {
    const mapSquare = await Square.findOne({ squareId: { $regex: exactIRegex(s) } }).lean();
    const quad = mapSquare?.quadrants?.find((qu) => String(qu?.quadrantId || "").trim().toUpperCase() === q);
    const normArr = (v) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);
    return {
      terrain: normArr(quad?.terrain),
      hazards: normArr(quad?.hazards).map((h) => h.toLowerCase()),
      items: normArr(quad?.items),
      monsters: normArr(quad?.monsters),
      bossMonsters: normArr(quad?.bossMonsters),
      special: normArr(quad?.special),
    };
  } catch (_) {
    return { terrain: [], hazards: [], items: [], monsters: [], bossMonsters: [], special: [] };
  }
}

/**
 * Roll and apply hazards for the party's current quadrant.
 * Returns: { applied: boolean, ko: boolean, heartsLost: number, staminaLost: number }
 */
async function maybeApplyQuadrantHazards(party, options = {}) {
  if (!party || party.status !== "started") return { applied: false, ko: false, heartsLost: 0, staminaLost: 0, hazardMessage: null };
  if ((party.totalHearts ?? 0) <= 0) return { applied: false, ko: true, heartsLost: 0, staminaLost: 0, hazardMessage: null };

  const squareId = options.squareId ?? party.square;
  const quadrantId = options.quadrantId ?? party.quadrant;
  const hazards = await getQuadrantHazards(squareId, quadrantId);
  if (!hazards.length) return { applied: false, ko: false, heartsLost: 0, staminaLost: 0, hazardMessage: null };

  const exploreElixir = party.exploreElixir;
  const location = `${String(squareId || "").trim().toUpperCase()} ${String(quadrantId || "").trim().toUpperCase()}`.trim();
  const at = options.at instanceof Date ? options.at : new Date();

  let heartsLostTotal = 0;
  let staminaLostTotal = 0;
  const hazardMessages = [];

  const totalHeartsBefore = Math.max(0, Number(party.totalHearts) || 0);
  const totalStaminaBefore = Math.max(0, Number(party.totalStamina) || 0);

  for (const hz of hazards) {
    // If the party used a hazard-resistance elixir this explore, skip hazards it counters
    if (exploreElixir?.type && elixirCountersExplorationHazard(exploreElixir.type, hz)) continue;

    if (hz === "thunder") {
      if (Math.random() < HAZARD_PROC_CHANCE) {
        const heartsLost = Math.min(1, Math.max(0, Number(party.totalHearts) || 0));
        if (heartsLost > 0) {
          party.totalHearts = Math.max(0, (Number(party.totalHearts) || 0) - heartsLost);
          heartsLostTotal += heartsLost;
          const msg = `⚡ **Thunder hazard** in ${location} — the party is electrocuted! (−${heartsLost} ❤️)`;
          hazardMessages.push(msg);
          pushProgressLog(party, "Party", "hazard_thunder", msg, undefined, { heartsLost }, at);
        }
      }
      continue;
    }

    if (hz === "hot" || hz === "cold") {
      let heartsLost = 0;
      let staminaLost = 0;

      if (Math.random() < HAZARD_PROC_CHANCE) {
        heartsLost = Math.min(1, Math.max(0, Number(party.totalHearts) || 0));
        if (heartsLost > 0) {
          party.totalHearts = Math.max(0, (Number(party.totalHearts) || 0) - heartsLost);
          heartsLostTotal += heartsLost;
        }
      }

      if (Math.random() < HOT_COLD_STAMINA_PROC_CHANCE) {
        staminaLost = Math.min(1, Math.max(0, Number(party.totalStamina) || 0));
        if (staminaLost > 0) {
          party.totalStamina = Math.max(0, (Number(party.totalStamina) || 0) - staminaLost);
          staminaLostTotal += staminaLost;
        }
      }

      if (heartsLost > 0 || staminaLost > 0) {
        const label = hz === "hot" ? "Hot" : "Cold";
        const parts = [];
        if (heartsLost > 0) parts.push(`−${heartsLost} ❤️`);
        if (staminaLost > 0) parts.push(`−${staminaLost} 🟩`);
        const msg = `🌡️ **${label} hazard** in ${location} — the elements sap the party. (${parts.join(", ")})`;
        hazardMessages.push(msg);
        pushProgressLog(
          party,
          "Party",
          hz === "hot" ? "hazard_hot" : "hazard_cold",
          msg,
          undefined,
          { ...(heartsLost > 0 ? { heartsLost } : {}), ...(staminaLost > 0 ? { staminaLost } : {}) },
          at
        );
      }
      continue;
    }
  }

  if (heartsLostTotal === 0 && staminaLostTotal === 0) {
    return { applied: false, ko: false, heartsLost: 0, staminaLost: 0, hazardMessage: null };
  }

  const totalHeartsAfter = Math.max(0, Number(party.totalHearts) || 0);
  const totalStaminaAfter = Math.max(0, Number(party.totalStamina) || 0);
  party.markModified("totalHearts");
  party.markModified("totalStamina");
  await party.save();

  logger.info(
    "EXPLORE",
    `[explore.js] hazards at ${location} ❤${totalHeartsBefore} 🟩${totalStaminaBefore} -> ❤${totalHeartsAfter} 🟩${totalStaminaAfter}`
  );

  const hazardMessage = hazardMessages.length > 0 ? hazardMessages.join("\n") : null;
  return { applied: true, ko: totalHeartsAfter <= 0, heartsLost: heartsLostTotal, staminaLost: staminaLostTotal, hazardMessage };
}

// ------------------- normalizeExpeditionId ------------------
// Autocomplete may send full string; extract partyId (before first "|")
function normalizeExpeditionId(value) {
 if (!value || typeof value !== "string") return value;
 const trimmed = value.trim();
 const pipe = trimmed.indexOf("|");
 return pipe === -1 ? trimmed : trimmed.slice(0, pipe).trim();
}

// ------------------- exactIRegex ------------------
// Exact, case-insensitive regex matcher for user-controlled strings (escapes regex metacharacters).
function escapeRegexLiteral(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function exactIRegex(value) {
  const v = String(value ?? "").trim();
  return new RegExp(`^${escapeRegexLiteral(v)}$`, "i");
}

// ------------------- normalizeCharacterName ------------------
// Autocomplete may send full display string (e.g. "Wren | Rudania | Hunter | ❤ 3 | 🟩 5"); use only the character name.
function normalizeCharacterName(value) {
 if (!value || typeof value !== "string") return (value || "").trim();
 const trimmed = value.trim();
 const pipe = trimmed.indexOf("|");
 return pipe === -1 ? trimmed : trimmed.slice(0, pipe).trim();
}

// Strip trailing " — ❤ …" from autocomplete/pasted labels. Require whitespace before em/en dash so
// in-name hyphens (e.g. Deep-Fried) are not treated as the label separator.
const EXPEDITION_ITEM_LABEL_SPLIT = /\s+[\u2014\u2013]\s+.*$/u;

function normalizeExpeditionItemNameKey(s) {
 if (!s || typeof s !== "string") return "";
 return s
  .trim()
  .normalize("NFKC")
  .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
  .replace(/\s+/g, " ")
  .toLowerCase();
}

// ------------------- findCharacterByNameAndUser ------------------
// Look up character by name and userId; checks both Character and ModCharacter.
async function findCharacterByNameAndUser(characterName, userId) {
 const name = normalizeCharacterName(characterName);
 if (!name || !userId) return null;
 let character = await Character.findOne({ name, userId });
 if (!character) character = await ModCharacter.findOne({ name, userId });
 return character || null;
}

// ------------------- getPartyPoolCaps ------------------
// Max party hearts/stamina = sum of each member's maxHearts/maxStamina. Pool must never exceed these when healing.
async function getPartyPoolCaps(party) {
 if (!party?.characters?.length) return { maxHearts: 0, maxStamina: 0 };

 // Fast path: prefer backfilled party-level caps when present.
 const partyMaxHearts = Number(party.maxHearts) || 0;
 const partyMaxStamina = Number(party.maxStamina) || 0;
 if (partyMaxHearts > 0 || partyMaxStamina > 0) {
  return { maxHearts: Math.max(0, partyMaxHearts), maxStamina: Math.max(0, partyMaxStamina) };
 }

 // Next best: sum per-slot max values if already present on party.characters.
 const hasSlotMaxes = party.characters.every(
  (pc) => typeof pc?.maxHearts === "number" && typeof pc?.maxStamina === "number"
 );
 if (hasSlotMaxes) {
  const maxHearts = party.characters.reduce((s, pc) => s + (pc.maxHearts ?? 0), 0);
  const maxStamina = party.characters.reduce((s, pc) => s + (pc.maxStamina ?? 0), 0);
  return { maxHearts, maxStamina };
 }

 // Fallback: compute from DB (supports both Character and ModCharacter).
 const ids = party.characters.map((pc) => pc?._id).filter(Boolean);
 if (ids.length === 0) return { maxHearts: 0, maxStamina: 0 };
 const [chars, modChars] = await Promise.all([
  Character.find({ _id: { $in: ids } }).select("maxHearts maxStamina").lean(),
  ModCharacter.find({ _id: { $in: ids } }).select("maxHearts maxStamina").lean(),
 ]);
 const all = [...(chars || []), ...(modChars || [])];
 let maxHearts = 0;
 let maxStamina = 0;
 for (const c of all) {
  maxHearts += Number(c?.maxHearts) || 0;
  maxStamina += Number(c?.maxStamina) || 0;
 }
 return { maxHearts, maxStamina };
}

// ------------------- ensurePartyMaxValues ------------------
// Backfill party.maxHearts/maxStamina and per-character max values if missing (for expeditions started before this feature).
// Also populates character-level maxHearts/maxStamina for embed fallback computation.
async function ensurePartyMaxValues(party, poolCaps) {
 if (!party || !poolCaps) return;
 let needsSave = false;
 // Backfill party-level max values
 if (!party.maxHearts || party.maxHearts === 0) {
  party.maxHearts = poolCaps.maxHearts;
  party.markModified("maxHearts");
  needsSave = true;
 }
 if (!party.maxStamina || party.maxStamina === 0) {
  party.maxStamina = poolCaps.maxStamina;
  party.markModified("maxStamina");
  needsSave = true;
 }
 // Backfill per-character max values
 if (party.characters?.length) {
  for (let i = 0; i < party.characters.length; i++) {
   const pc = party.characters[i];
   if (!pc.maxHearts || pc.maxHearts === 0 || !pc.maxStamina || pc.maxStamina === 0) {
    const char = await Character.findById(pc._id).select("maxHearts maxStamina").lean();
    if (char) {
     if (!pc.maxHearts || pc.maxHearts === 0) {
      party.characters[i].maxHearts = char.maxHearts ?? 0;
      needsSave = true;
     }
     if (!pc.maxStamina || pc.maxStamina === 0) {
      party.characters[i].maxStamina = char.maxStamina ?? 0;
      needsSave = true;
     }
    }
   }
  }
  if (needsSave) party.markModified("characters");
 }
 if (needsSave) {
  await party.save();
  logger.info("EXPLORE", `[explore.js] Backfilled max values for party ${party.partyId}: maxHearts=${party.maxHearts} maxStamina=${party.maxStamina}`);
 }
}

// ------------------- getExplorePageUrl ------------------
// Base dashboard URL + /explore/{expeditionId} for pin/report links.
function getExplorePageUrl(expeditionId) {
 const base = (process.env.DASHBOARD_URL || process.env.APP_URL || "https://tinglebot.xyz").replace(/\/$/, "");
 return `${base}/explore/${encodeURIComponent(expeditionId)}`;
}

// ------------------- createUnpinnedDiscoveriesBlockEmbed ------------------
// Shown when party has unpinned discoveries in current quadrant; blocks all explore actions until they set a pin.
async function createUnpinnedDiscoveriesBlockEmbed(party, expeditionId) {
 const location = `${party.square} ${party.quadrant}`;
 const embed = new EmbedBuilder()
  .setTitle("📍 Set a pin on the map first")
  .setColor(getExploreOutcomeColor("grotto", regionColors[party.region] || "#00ff99"))
  .setDescription(
   "You have discovery(ies) in this quadrant that aren't pinned yet. **You cannot roll, move, camp, use items, secure, end the expedition, or continue the grotto trial** until you set a pin on the explore page so they stay on the map when you leave."
  )
  .setImage("https://storage.googleapis.com/tinglebot/Borders/border_purp.png");
 addExplorationStandardFields(embed, {
  party,
  expeditionId,
  location,
  nextCharacter: party.characters?.[party.currentTurn] ?? null,
  showNextAndCommands: false,
  showRestSecureMove: false,
  hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
  hasUnpinnedDiscoveriesInQuadrant: true,
 });
 return embed;
}

// ------------------- createRelicDmEmbed ------------------
// DM embed for expedition relic found (roll or ruins).
function createRelicDmEmbed(characterName, location, relicIdStr, expeditionId) {
 return new EmbedBuilder()
  .setTitle("🔸 Expedition relic found")
  .setDescription(`**Unknown Relic** discovered by **${characterName}** in ${location}.\n\nTake it to an Inarikian Artist or Researcher to get it appraised.`)
  .setColor(0xe67e22)
  .setThumbnail(UNAPPRAISED_RELIC_IMAGE_URL)
  .setImage(RELIC_EMBED_BORDER_URL)
  .addFields(
   { name: "Relic ID", value: relicIdStr, inline: true },
   { name: "Expedition", value: `\`${expeditionId}\``, inline: true }
  )
  .setURL("https://rootsofthewild.com/mechanics/relics")
  .setFooter({ text: "Use /relic appraisal-request to get it appraised" });
}

// ------------------- sendRelicDmToParty ------------------
// Send relic DM embed to party user IDs; returns IDs where send failed.
async function sendRelicDmToParty(client, embed, userIds) {
 const failedUserIds = [];
 for (const uid of userIds) {
  try {
   const user = await client.users.fetch(uid).catch(() => null);
   if (user) {
    const sent = await user.send({ embeds: [embed] }).catch(() => null);
    if (!sent) failedUserIds.push(uid);
   }
  } catch (_) {
   failedUserIds.push(uid);
  }
 }
 return { failedUserIds };
}

// ------------------- createDisabledMonsterCampRow ------------------
// Disabled action row for monster camp choice (Mark it / Fight it / Leave it).
function createDisabledMonsterCampRow(expeditionId, characterIndex) {
 return new ActionRowBuilder().addComponents(
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
}

// ------------------- createDisabledYesNoRow ------------------
// Disabled action row for grotto/ruins yes-no choice. labels = { yes, no }.
function createDisabledYesNoRow(outcomeType, expeditionId, characterIndex, labels) {
 return new ActionRowBuilder().addComponents(
  new ButtonBuilder()
   .setCustomId(`explore_${outcomeType}_yes|${expeditionId}|${characterIndex}`)
   .setLabel(labels.yes)
   .setStyle(ButtonStyle.Success)
   .setDisabled(true),
  new ButtonBuilder()
   .setCustomId(`explore_${outcomeType}_no|${expeditionId}|${characterIndex}`)
   .setLabel(labels.no)
   .setStyle(ButtonStyle.Secondary)
   .setDisabled(true)
 );
}

// ------------------- grantExplorationChestLootToParty ------------------
// Grant chest loot to all party members (no stamina cost). Used by handleExplorationChestOpen and map-led chest on move.
// Caller is responsible for turn advance (handleExplorationChestOpen) or not (map-led).
async function grantExplorationChestLootToParty(party, location, interaction) {
 const allItems = await fetchAllItems();
 const lootLines = [];
 const mapDmSentKeys = new Set();
 const sendChestMapDm = async (charDoc, mapItemName) => {
  try {
   if (!interaction?.client || !charDoc || !mapItemName) return;
   const uid = charDoc.userId || interaction.user?.id;
   if (!uid) return;
   const dedupeKey = `${uid}:${mapItemName}`;
   if (mapDmSentKeys.has(dedupeKey)) return;
   mapDmSentKeys.add(dedupeKey);
   const mapDmEmbed = new EmbedBuilder()
    .setTitle("🗺️ Expedition map found")
    .setDescription(`**${mapItemName}** was found in a chest and saved to **${charDoc.name}**'s map collection. Take it to the Inariko Library to get it deciphered.`)
    .setThumbnail(OLD_MAP_ICON_URL)
    .setImage(MAP_EMBED_BORDER_URL)
    .addFields(
      { name: "Map", value: `**${mapItemName}**`, inline: true },
      { name: "Expedition", value: `\`${party.partyId}\``, inline: true }
    )
    .setURL(OLD_MAPS_LINK)
    .setColor(0x2ecc71)
    .setFooter({ text: "Roots of the Wild • Old Maps" });
   const user = await interaction.client.users.fetch(uid).catch(() => null);
   if (user) await user.send({ embeds: [mapDmEmbed] }).catch(() => {});
  } catch (_) {}
 };
 const squareStr = String(party.square || "").trim().toUpperCase();
 const quadrantStr = String(party.quadrant || "").trim().toUpperCase();
 const mapSquareForChest = await Square.findOne({ squareId: new RegExp(`^${String(party.square || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).lean();
 const regionStr = mapSquareForChest?.region ?? "";
 for (const pc of party.characters) {
  const char = await Character.findById(pc._id);
  if (!char) continue;
  let isRelic = Math.random() < EXPLORATION_CHEST_RELIC_CHANCE;
  if (isRelic && (await characterAlreadyFoundRelicThisExpedition(party, char.name, char._id))) isRelic = false;
  if (isRelic && (await characterHasPendingRelic(char))) isRelic = false;
  if (isRelic) {
   try {
    const savedRelic = await createRelic({
     name: "Unknown Relic",
     discoveredBy: char.name,
     characterId: char._id,
     discoveredDate: new Date(),
     locationFound: location,
     region: regionStr,
     square: squareStr,
     quadrant: quadrantStr,
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
      if (/^Map #\d+$/.test(fallback.itemName)) {
       await sendChestMapDm(char, fallback.itemName);
      }
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
    if (/^Map #\d+$/.test(item.itemName)) {
     await sendChestMapDm(char, item.itemName);
    }
   } catch (err) {
    handleInteractionError(err, interaction, { source: "explore.js chest open" });
    lootLines.push(`${char.name}: (failed to add item)`);
   }
  }
 }
 const nextCharacter = party.characters[party.currentTurn];
 const lootEmbed = new EmbedBuilder()
  .setTitle("📦 **Chest opened!**")
  .setColor(getExploreOutcomeColor("chest_open", regionColors[party.region] || "#00ff99"))
  .setImage(getExploreMapImageUrl(party, { highlight: true }));
 if (lootLines.length > 0) {
  lootEmbed.addFields({
   name: "Loot",
   value: lootLines.map((line) => `• ${line}`).join("\n"),
   inline: false,
  });
 } else {
  lootEmbed.setDescription("Nothing found inside.");
 }
 addExplorationStandardFields(lootEmbed, {
  party,
  expeditionId: party.partyId,
  location,
  nextCharacter: nextCharacter ?? null,
  showNextAndCommands: true,
  showRestSecureMove: false,
  ruinRestRecovered: 0,
  hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
  hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
 });
 await party.save();
 return { lootEmbed, lootLines, nextCharacter };
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

 const chestPayResult = await payStaminaOrStruggle(party, openerIndex, 1, { order: "openerFirst", openerIndex, action: "chest" });
 if (!chestPayResult.ok) return { notEnoughStamina: true };

 party.currentTurn = (party.currentTurn + 1) % n;
 await party.save(); // Always persist so dashboard shows current hearts/stamina/progress

 const { lootEmbed, lootLines, nextCharacter } = await grantExplorationChestLootToParty(party, location, interaction);
 const footerCost = (chestPayResult.heartsPaid ?? 0) > 0
  ? `−${chestPayResult.heartsPaid} heart(s) (struggle)`
  : "−1 stamina";
 lootEmbed.setFooter({ text: footerCost });
 const lootSummaryForLog = lootLines.length > 0
  ? lootLines
    .map((line) => line.replace(/<:[^:]+:\d+>/g, "").replace(/\s+/g, " ").trim())
    .join(" · ")
  : "Nothing found.";
 const chestCostsForLog = buildCostsForLog(chestPayResult);
 pushProgressLog(party, character.name, "chest_open", `Opened chest in **${location}**. **Found:** ${lootSummaryForLog}`, undefined, Object.keys(chestCostsForLog).length ? chestCostsForLog : undefined);
 await party.save();
 return { lootEmbed, party, nextCharacter };
}

// ------------------- Discovery constants (3-per-square limit) ------------------
const SPECIAL_OUTCOMES = ["monster_camp", "ruins", "grotto"];
const DISCOVERY_COUNT_OUTCOMES = [
  "monster_camp",
  "monster_camp_fight",
  "grotto",
  "grotto_found",
  "grotto_cleansed",
  "ruins",
  "ruins_found",
  "ruin_rest",
];
// When leaving a square, only discoveries that can be pinned (or historically were treated as such) should be eligible for cleanup.
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
const MAX_SPECIAL_EVENTS_PER_SQUARE = 3;
const DISCOVERY_REDUCE_CHANCE_WHEN_ANY = 0.25; // 75% less chance when square has 1+ discovery

// One find per expedition (grotto, ruins, or monster_camp); progressLog outcomes that consume the find
const FIND_OUTCOMES_ROLL = ["grotto", "ruins", "monster_camp"];
// Note: monster_camp_found removed - we now only log when user makes a choice (mark/fight/leave)
// monster_camp_skipped does NOT consume the find - user can still find another discovery after skipping
const FIND_OUTCOMES_LOGGED = ["grotto_found", "ruins_found", "monster_camp", "monster_camp_fight"];
function partyHasFindThisExpedition(party) {
  return (party.progressLog || []).some((e) => FIND_OUTCOMES_LOGGED.includes(String(e.outcome || "")));
}

// Location parsing used for discovery cleanup/pinning reminders. Keep aligned with dashboard parsing (supports "in" and "at").
const LOC_IN_MESSAGE_RE = /\s+(?:in|at)\s+([A-J](?:[1-9]|1[0-2]))\s+(Q[1-4])/i;

// ------------------- hasActiveGrottoAtLocation ------------------
// True if party has an open grotto trial at current location (must complete before roll/move/discovery)
async function hasActiveGrottoAtLocation(party, expeditionId) {
  const squareId = (party?.square && String(party.square).trim()) || "";
  const quadrantId = (party?.quadrant && String(party.quadrant).trim()) || "";
  if (!squareId || !quadrantId) return false;
  const leftSquare = (party?.leftGrottoSquare && String(party.leftGrottoSquare).trim()) || "";
  const leftQuadrant = (party?.leftGrottoQuadrant && String(party.leftGrottoQuadrant).trim()) || "";
  if (leftSquare && leftQuadrant && leftSquare === squareId && leftQuadrant === quadrantId) return false;
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
// Resolve grotto by optional name/id, or fall back to most recently unsealed.
// activeOnly: when true, only return grottos that are not cleared (status !== "cleared", completedAt null).
async function resolveGrottoAtLocation(squareId, quadrantId, expeditionId, grottoOption, activeOnly = false) {
 const baseQuery = {
  squareId: new RegExp(`^${String(squareId).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  quadrantId: new RegExp(`^${String(quadrantId).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  sealed: false,
 };
 if (activeOnly) {
  baseQuery.status = { $ne: "cleared" };
  baseQuery.completedAt = null;
 }
 if (grottoOption && String(grottoOption).trim()) {
  const val = String(grottoOption).trim();
  if (val === "none") return null;
  const byName = await Grotto.findOne({ ...baseQuery, name: new RegExp(`^${val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  if (byName) {
   if (activeOnly && (byName.status === "cleared" || byName.completedAt)) return null;
   return byName;
  }
  try {
   const byId = await Grotto.findById(val);
   const atLocation = byId && String(byId.squareId || "").trim().toLowerCase() === String(squareId || "").trim().toLowerCase() && String(byId.quadrantId || "").trim().toUpperCase() === String(quadrantId || "").trim().toUpperCase();
   if (byId && !byId.sealed && atLocation) {
    if (activeOnly && (byId.status === "cleared" || byId.completedAt)) return null;
    return byId;
   }
  } catch (_) {}
  // User supplied a name/id but it didn't match — don't fall back to "any grotto"
  return null;
 }
 return Grotto.findOne(baseQuery).sort({ unsealedAt: -1 });
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

// ------------------- getMazeActiveGrottoCommand ------------------
// Same as maze command mention, but when party is on an available scrying wall, appends " · Song of Scrying (action at wall)" for the Commands list.
function getMazeActiveGrottoCommand(mazeCmdId, grotto) {
  const base = `</explore grotto maze:${mazeCmdId}>`;
  const pathCells = grotto?.mazeState?.layout?.pathCells;
  const currentNode = grotto?.mazeState?.currentNode;
  if (!pathCells?.length || !currentNode) return base;
  const parts = currentNode.split(",").map((s) => parseInt(s, 10));
  const cx = parts[0];
  const cy = parts[1];
  if (isNaN(cx) || isNaN(cy)) return base;
  const currentCell = getPathCellAt(pathCells, cx, cy);
  const isScryingWall = currentCell && (currentCell.type === "mazep" || currentCell.type === "mazen");
  const usedScryingWalls = grotto.mazeState?.usedScryingWalls || [];
  const scryingWallAvailable = isScryingWall && !usedScryingWalls.includes(currentNode);
  return scryingWallAvailable ? `${base} · Song of Scrying (action at wall)` : base;
}

// ------------------- postGrottoMazeModVersion ------------------
// Posts the mod view (full map + solution path) to the mod channel
// options: { descriptionOverride } — if set, used as the main description (e.g. "Scrying wall was used! Here's the updated map.")
async function postGrottoMazeModVersion(client, layout, currentNode, grottoName, expeditionId, location, mazeState, options = {}) {
  if (!layout || !client) return;
  try {
   const modBuf = await renderMazeToBuffer(layout, { viewMode: "mod", currentNode, openedChests: mazeState?.openedChests, triggeredTraps: mazeState?.triggeredTraps, usedScryingWalls: mazeState?.usedScryingWalls });
   const modFiles = [new AttachmentBuilder(modBuf, { name: "maze-mod.png" })];
   const defaultDesc = `**${grottoName}** at ${location}\nExpedition: \`${expeditionId}\`\n\nFull map with correct path (light green), traps, chests, Scrying Walls, and party position.`;
   const description = options.descriptionOverride
     ? `**${grottoName}** at ${location}\nExpedition: \`${expeditionId}\`\n\n${options.descriptionOverride}`
     : defaultDesc;
   const modEmbed = new EmbedBuilder()
    .setTitle("🗺️ **Grotto: Maze — Mod view**")
    .setColor(0x9b59b6)
    .setDescription(description)
    .setImage("attachment://maze-mod.png")
    .addFields({ name: "Map legend", value: "🟫 Start | 🟩 Exit | 🟨 Trap | 🟦 Chest | 🔴 Scrying Wall | ⬜ Path | 🟧 You are here | 🟢 Correct path | ⬛ Wall", inline: false })
    .setTimestamp();
   const modChannelId = process.env.GROTTO_MAZE_MOD_CHANNEL_ID || "1473557438174330880";
   const channel = await client.channels.fetch(modChannelId).catch(() => null);
   if (channel) await channel.send({ embeds: [modEmbed], files: modFiles }).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Maze mod post failed: ${err?.message || err}`));
  } catch (err) {
   logger.warn("EXPLORE", `[explore.js]⚠️ Maze mod render failed: ${err?.message || err}`);
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

// ------------------- countRecentCampAttacks ------------------
// Count consecutive camp attacks (interrupted camps) going backwards from most recent.
// Stops counting once a successful (non-attacked) camp is found, effectively "resetting" after a safe camp.
// Used to prevent consecutive camp attacks at 0 stamina from KOing the party too easily.
// NOTE: Only check message text for "interrupted"/"attacked" - do NOT check heartsLost,
// because heartsLost can be from struggle mode payment (paying hearts to camp), not from monster damage.
function countRecentCampAttacks(party, lookback = CAMP_ATTACK_PROTECTION_LOOKBACK) {
 const log = party.progressLog;
 if (!log || !log.length) return 0;
 let campCount = 0;
 let attackCount = 0;
 for (let i = log.length - 1; i >= 0 && campCount < lookback; i--) {
  const e = log[i];
  if (e.outcome === "camp" || e.outcome === "safe_space") {
   campCount++;
   const msg = (e.message || "").toLowerCase();
   const wasAttacked = msg.includes("interrupted") || msg.includes("attacked");
   if (wasAttacked) {
    attackCount++;
   } else {
    // Successful camp found - stop counting; protection resets after a safe camp
    break;
   }
  }
 }
 return attackCount;
}

// ------------------- findExactMapSquareAndQuadrant ------------------
// Resolves square + quadrant case-insensitively and returns the exact stored squareId/quadrantId
// so map updates (explored/secure/reset) always match the DB. Returns null if not found.
async function findExactMapSquareAndQuadrant(squareId, quadrantId) {
 if (!squareId || !quadrantId) return null;
 const square = await Square.findOne({
  squareId: new RegExp(`^${String(squareId).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
 });
 if (!square || !square.quadrants || !square.quadrants.length) return null;
 const quadrant = square.quadrants.find(
  (q) => String(q.quadrantId || "").toUpperCase() === String(quadrantId).trim().toUpperCase()
 );
 if (!quadrant) return null;
 return { square, exactSquareId: square.squareId, exactQuadrantId: quadrant.quadrantId };
}

// ------------------- buildTestingEndAfterGrottoEmbed ------------------
// Testing only: end expedition immediately after grotto completion (same cleanup as "end" in testing mode).
// - Resets map state (quadrants unexplored, discoveries cleared, pins removed), deletes grottos, closes raids.
// - Does NOT persist Spirit Orbs or any character state (no addItemInventoryDatabase, no Character updates).
//   Spirit Orbs are persisted to inventory by callers (raid/explore).
// Returns the "Expedition: Returned Home" embed; caller must reply with it.
async function buildTestingEndAfterGrottoEmbed(party, expeditionId, characterName) {
 const characterIndex = party.characters.findIndex((c) => c.name === characterName);
 const idx = characterIndex >= 0 ? characterIndex : 0;
 const regionKeyEnd = (party.region || "").toLowerCase();
 const regionToVillage = { eldin: "rudania", lanayru: "inariko", faron: "vhintl" };
 const targetVillage = regionToVillage[regionKeyEnd] || "rudania";
 const villageLabelEnd = targetVillage.charAt(0).toUpperCase() + targetVillage.slice(1);
 const remainingHearts = Math.max(0, party.totalHearts ?? 0);
 const remainingStamina = Math.max(0, party.totalStamina ?? 0);
 const memberCount = (party.characters || []).length;
 const splitLinesEnd = [];
 if (memberCount > 0 && (remainingHearts > 0 || remainingStamina > 0)) {
  const memberMaxes = [];
  for (let i = 0; i < party.characters.length; i++) {
   const char = await Character.findById(party.characters[i]._id);
   memberMaxes.push({ maxH: char?.maxHearts ?? 0, maxS: char?.maxStamina ?? 0 });
  }
  const baseHearts = Math.floor(remainingHearts / memberCount);
  const baseStamina = Math.floor(remainingStamina / memberCount);
  const assignedHeartsArr = memberMaxes.map((m) => Math.min(m.maxH, baseHearts));
  const assignedStaminaArr = memberMaxes.map((m) => Math.min(m.maxS, baseStamina));
  let heartsLeft = remainingHearts - assignedHeartsArr.reduce((s, a) => s + a, 0);
  let staminaLeft = remainingStamina - assignedStaminaArr.reduce((s, a) => s + a, 0);
  const priorityOrder = Array.from({ length: memberCount }, (_, i) => (idx + i) % memberCount);
  while (heartsLeft > 0) {
   let gave = false;
   for (const i of priorityOrder) {
    if (heartsLeft <= 0) break;
    if (assignedHeartsArr[i] < memberMaxes[i].maxH) { assignedHeartsArr[i] += 1; heartsLeft -= 1; gave = true; }
   }
   if (!gave) break;
  }
  while (staminaLeft > 0) {
   let gave = false;
   for (const i of priorityOrder) {
    if (staminaLeft <= 0) break;
    if (assignedStaminaArr[i] < memberMaxes[i].maxS) { assignedStaminaArr[i] += 1; staminaLeft -= 1; gave = true; }
   }
   if (!gave) break;
  }
  for (let i = 0; i < party.characters.length; i++) {
   splitLinesEnd.push(`${party.characters[i].name || "Unknown"}: ${assignedHeartsArr[i]} ❤, ${assignedStaminaArr[i]} stamina`);
  }
 }
 // Reset map and expedition state only; no Character DB writes (no Spirit Orbs or hearts/stamina persist).
 await Grotto.deleteMany({ partyId: expeditionId }).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Testing end after grotto: Grotto delete: ${err?.message}`));
 const exploredThisRunEnd = party.exploredQuadrantsThisRun || [];
 for (const { squareId, quadrantId } of exploredThisRunEnd) {
  if (!squareId || !quadrantId) continue;
  const resolvedEnd = await findExactMapSquareAndQuadrant(squareId, quadrantId);
  if (resolvedEnd) {
   const { exactSquareId, exactQuadrantId } = resolvedEnd;
   await Square.updateOne(
    { squareId: exactSquareId, "quadrants.quadrantId": exactQuadrantId },
    { $set: { "quadrants.$[q].status": "unexplored", "quadrants.$[q].exploredBy": "", "quadrants.$[q].exploredAt": null } },
    { arrayFilters: [{ "q.quadrantId": exactQuadrantId }] }
   ).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Testing end after grotto: reset quadrant: ${err?.message}`));
   await Square.updateOne(
    { squareId: exactSquareId, "quadrants.quadrantId": exactQuadrantId },
    { $set: { "quadrants.$[q].discoveries": [] } },
    { arrayFilters: [{ "q.quadrantId": exactQuadrantId }] }
   ).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Testing end after grotto: clear discoveries: ${err?.message}`));
  }
 }
 const expeditionPins = await Pin.find({ partyId: String(expeditionId).trim() }).lean().catch(() => []);
 for (const pin of expeditionPins || []) {
  const key = pin.sourceDiscoveryKey;
  if (key && typeof key === "string") {
   const parts = key.split("|");
   const squareIdRaw = (parts[1] ?? "").trim();
   const quadrantId = (parts[2] ?? "").trim().toUpperCase();
   if (squareIdRaw && (quadrantId === "Q1" || quadrantId === "Q2" || quadrantId === "Q3" || quadrantId === "Q4")) {
    const squareIdRegex = new RegExp(`^${String(squareIdRaw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    await Square.updateOne(
     { squareId: squareIdRegex, "quadrants.quadrantId": quadrantId, "quadrants.discoveries.discoveryKey": key },
     { $set: { "quadrants.$[q].discoveries.$[d].pinned": false, "quadrants.$[q].discoveries.$[d].pinnedAt": null, "quadrants.$[q].discoveries.$[d].pinId": null } },
     { arrayFilters: [{ "q.quadrantId": quadrantId }, { "d.discoveryKey": key }] }
    ).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Testing end after grotto: unpin: ${err?.message}`));
   }
  }
  await Pin.findByIdAndDelete(pin._id).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Testing end after grotto: delete pin: ${err?.message}`));
 }
 if (Array.isArray(party.reportedDiscoveryKeys) && party.reportedDiscoveryKeys.length > 0) {
  party.reportedDiscoveryKeys = [];
  party.markModified("reportedDiscoveryKeys");
 }
 pushProgressLog(party, characterName, "end", `Expedition ended (testing: after grotto). Returned to ${villageLabelEnd}: ${(party.characters || []).map((c) => c.name).filter(Boolean).join(", ") || "—"}.`, undefined, undefined, new Date());
 pushProgressLog(party, characterName, "end_test_reset", "Testing mode: No changes were saved.", undefined, undefined, new Date());
 await closeRaidsForExpedition(expeditionId);
 party.status = "completed";
 party.outcome = "success";
 party.finalLocation = { square: party.square, quadrant: party.quadrant };
 party.endedAt = new Date();
 party.exploreElixir = undefined;
 party.markModified("exploreElixir");
 await party.save();
 const log = party.progressLog || [];
 const turnsOrActions = log.filter((e) => e.outcome !== "end").length;
 let itemsGathered = Array.isArray(party.gatheredItems) && party.gatheredItems.length > 0
  ? party.gatheredItems.reduce((sum, g) => sum + (typeof g.quantity === "number" ? g.quantity : 1), 0)
  : 0;
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
  else if (o === "old_map") highlightOutcomes.add("Old map found");
 }
 const highlightsList = [...highlightOutcomes];
 const highlightsValue = highlightsList.length > 0 ? highlightsList.map((h) => `• ${h}`).join("\n") : "";
 const reportUrl = getExplorePageUrl(expeditionId);
 const startTime = party.createdAt ? new Date(party.createdAt).getTime() : Date.now();
 const durationMs = Math.max(0, Date.now() - startTime);
 const durationMins = Math.floor(durationMs / 60000);
 const hours = Math.floor(durationMins / 60);
 const mins = durationMins % 60;
 const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
 const memberNamesEnd = (party.characters || []).map((c) => c.name).filter(Boolean);
 const membersTextEnd = memberNamesEnd.length > 0 ? memberNamesEnd.join(", ") : "—";
 const embed = new EmbedBuilder()
  .setTitle("🗺️ **Expedition: Returned Home**")
  .setColor(getExploreOutcomeColor("end", regionColors[party.region] || "#4CAF50"))
  .setDescription(
   `Expedition complete. You've returned safely to **${villageLabelEnd}**.\n\n` +
   `⚠️ **Testing mode:** Expedition ended after grotto. No changes were saved.`
  )
  .setImage(getExploreMapImageUrl(party, { highlight: true }));
 embed.addFields(
  { name: "👥 **Party**", value: membersTextEnd, inline: true },
  { name: "📊 **Actions**", value: String(turnsOrActions), inline: true },
  { name: "⏱️ **Duration**", value: durationText, inline: true }
 );
 if (splitLinesEnd.length > 0) {
  embed.addFields({ name: "❤️ **Hearts & stamina split**", value: splitLinesEnd.join("\n"), inline: false });
 }
 if (itemsGathered > 0) {
  embed.addFields({ name: "🎒 **Items gathered**", value: `**${itemsGathered}** item${itemsGathered !== 1 ? "s" : ""}`, inline: false });
 }
 if (highlightsValue) {
  embed.addFields({ name: "✨ **Highlights**", value: highlightsValue, inline: false });
 }
 embed.addFields({ name: "🔗 **Full report**", value: `[Open expedition report](${reportUrl})`, inline: false });
 return embed;
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

// Types stored on exploringMap that count toward MAX_SPECIAL_EVENTS_PER_SQUARE (aligned with SPECIAL_OUTCOMES).
const MAP_DISCOVERY_TYPES_FOR_CAP = new Set(["monster_camp", "grotto", "ruins"]);

// ------------------- countSpecialDiscoveriesOnMap ------------------
function countSpecialDiscoveriesOnMap(squareDoc) {
 if (!squareDoc?.quadrants || !Array.isArray(squareDoc.quadrants)) return 0;
 let n = 0;
 for (const q of squareDoc.quadrants) {
  const discoveries = q.discoveries;
  if (!Array.isArray(discoveries)) continue;
  for (const d of discoveries) {
   const t = String(d?.type || "").toLowerCase();
   if (MAP_DISCOVERY_TYPES_FOR_CAP.has(t)) n += 1;
  }
 }
 return n;
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

// ------------------- characterHasPendingRelic ------------------
// True if character has any relic that is unappraised (and not deteriorated) OR appraised but art not submitted.
// Such characters cannot find another relic until they complete the current one.
// Scoped by characterId (see relicOwnerMatchQuery); name-only legacy relics without characterId still match.
async function characterHasPendingRelic(character) {
 if (!character || (!character._id && !(character.name || "").toString().trim())) return false;
 try {
  const pending = await Relic.findOne({
   $and: [
    relicOwnerMatchQuery(character),
    {
     $or: [
      { appraised: false, deteriorated: false },
      { appraised: true, artSubmitted: false },
     ],
    },
   ],
  }).lean();
  return !!pending;
 } catch (err) {
  logger.warn("EXPLORE", `[explore.js]⚠️ Pending relic check failed: ${err?.message || err}`);
  return false;
 }
}

const REPORTABLE_DISCOVERY_OUTCOMES = new Set(["monster_camp", "ruins", "grotto"]);

// ------------------- pullGrottoDiscoveriesFromQuadrant ------------------
// Remove all grotto-type discoveries from a quadrant (so we can push a single one when reusing grotto doc).
async function pullGrottoDiscoveriesFromQuadrant(squareId, quadrantId) {
  if (!squareId || !quadrantId) return;
  const qd = String(quadrantId).trim().toUpperCase();
  await Square.updateOne(
    { squareId: new RegExp(`^${String(squareId).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    { $pull: { "quadrants.$[q].discoveries": { type: "grotto" } } },
    { arrayFilters: [{ "q.quadrantId": qd }] }
  ).catch(() => {});
}

// ------------------- pushDiscoveryToMap ------------------
// Add discovery to Square.quadrants[].discoveries for map display.
// Resolves square/quadrant via findExactMapSquareAndQuadrant so updates always match the DB; stores canonical discoveryKey (uppercase square|quadrant).
async function pushDiscoveryToMap(party, outcomeType, at, userId, options = {}) {
 if (party.status !== "started") return; // Do not update map when expedition is over
 const squareId = (party.square && String(party.square).trim()) || "";
 const quadrantId = (party.quadrant && String(party.quadrant).trim()) || "";
 if (!squareId || !quadrantId) return;
 const resolved = await findExactMapSquareAndQuadrant(squareId, quadrantId);
 if (!resolved) {
  logger.warn("EXPLORE", `[explore.js] pushDiscoveryToMap: no map square/quadrant found for ${squareId} ${quadrantId}; skipping map update`);
  return;
 }
 const { exactSquareId, exactQuadrantId } = resolved;
 const atDate = at instanceof Date ? at : new Date();
 const discoveryKey = `${outcomeType}|${exactSquareId}|${exactQuadrantId}|${atDate.toISOString()}`;
 const discovery = {
  type: outcomeType,
  discoveredBy: userId || party.leaderId || "",
  discoveredAt: atDate,
  discoveryKey,
 };
 if (options.name) discovery.name = options.name;
 if (options.campId) discovery.campId = options.campId;
 if (outcomeType === "grotto") {
  discovery.grottoStatus = options.grottoStatus ?? (options.name ? "cleansed" : "found");
  // Ensure only one grotto discovery per quadrant (avoid duplicates from dashboard pin fallback or double-push).
  await pullGrottoDiscoveriesFromQuadrant(exactSquareId, exactQuadrantId);
 }
 const updateResult = await Square.updateOne(
  { squareId: exactSquareId },
  { $push: { "quadrants.$[q].discoveries": discovery } },
  { arrayFilters: [{ "q.quadrantId": exactQuadrantId }] }
 );
 if (updateResult.matchedCount === 0) {
  logger.warn("EXPLORE", `[explore.js] pushDiscoveryToMap: update matched 0 documents for ${exactSquareId} ${exactQuadrantId}`);
 }
}

// ------------------- updateDiscoveryName ------------------
// Set name on an existing discovery (e.g. grotto when cleansed on revisit). Resolves square/quadrant so update matches the DB.
async function updateDiscoveryName(squareId, quadrantId, discoveryKey, name, options = {}) {
 if (!squareId || !quadrantId || !discoveryKey || !name) return;
 if (options.party && options.party.status !== "started") return; // Do not update map when expedition is over
 const resolved = await findExactMapSquareAndQuadrant(squareId, quadrantId);
 if (!resolved) return;
 const { exactSquareId, exactQuadrantId } = resolved;
 await Square.updateOne(
  { squareId: exactSquareId },
  { $set: { "quadrants.$[q].discoveries.$[d].name": name } },
  { arrayFilters: [{ "q.quadrantId": exactQuadrantId }, { "d.discoveryKey": discoveryKey }] }
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

// ------------------- getPartyWideInventory ------------------
// Returns party-wide inventory for grotto puzzles (items in any character's inventory, NOT loadout).
// Does NOT require items in exploring/loadout. Characters cannot transfer items during expedition.
// Returns: { totalByItem, slotQuantities: [{ slot, quantities: Map<key, number>, names: Map<key, string> }] }
async function getPartyWideInventory(party) {
  const totalByItem = new Map();
  const slotQuantities = [];
  for (const slot of party.characters || []) {
    try {
      const collection = await getCharacterInventoryCollectionWithModSupport(slot);
      const entries = await collection.find({ characterId: slot._id }).toArray();
      const quantities = new Map();
      const names = new Map();
      for (const entry of entries || []) {
        const name = (entry.itemName || "").trim();
        if (!name || name.toLowerCase() === "initial item") continue;
        const qty = entry.quantity || 0;
        if (qty <= 0) continue;
        const key = name.toLowerCase();
        const prev = quantities.get(key) || 0;
        quantities.set(key, prev + qty);
        if (!names.has(key)) names.set(key, name);
        totalByItem.set(key, (totalByItem.get(key) || 0) + qty);
      }
      slotQuantities.push({ slot, quantities, names });
    } catch (_) { /* skip */ }
  }
  return { totalByItem, slotQuantities };
}

// ------------------- partyHasLensOfTruth ------------------
// True if any party member has Lens of Truth as relic or inventory item (grottos + map reveal).
async function partyHasLensOfTruth(party) {
  return partyHasLensOfTruthRelic(party.characters || [], getCharacterInventoryCollectionWithModSupport);
}

// ------------------- handleGrottoCleanse ------------------
// Plume + 1 stamina; create Grotto, roll trial; blessing = immediate Spirit Orbs
async function handleGrottoCleanse(i, msg, party, expeditionId, characterIndex, location, disabledRow, nextCharacter, ruinRestRecovered) {
 const freshParty = await Party.findActiveByPartyId(expeditionId);
 if (!freshParty) {
  logger.warn("EXPLORE", `[explore.js]⚠️ Expedition not found: id=${expeditionId}`);
  await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition not found.")], ephemeral: true }).catch(() => {});
  return;
 }
 const squareIdCheck = (freshParty.square && String(freshParty.square).trim()) || "";
 const quadrantIdCheck = (freshParty.quadrant && String(freshParty.quadrant).trim()) || "";
 if (squareIdCheck && quadrantIdCheck) {
  const existingGrotto = await Grotto.findOne({ squareId: squareIdCheck, quadrantId: quadrantIdCheck });
  if (existingGrotto && String(existingGrotto.partyId || "").trim() === String(expeditionId || "").trim() && existingGrotto.status === "cleared") {
   const cleansedBanner = await generateGrottoBannerOverlay(freshParty, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
   const alreadyClearedEmbed = new EmbedBuilder()
    .setTitle("🗺️ **Grotto already cleared**")
    .setColor(getExploreOutcomeColor("grotto", regionColors[freshParty.region] || "#00ff99"))
    .setDescription("This grotto has already been **cleared** by your expedition (trial completed; it is sealed). No plume or stamina is used.\n\n" + GROTTO_CLEANSED_VS_CLEARED)
    .setImage(cleansedBanner.imageUrl);
   addExplorationStandardFields(alreadyClearedEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(freshParty) });
   await i.followUp({ embeds: [alreadyClearedEmbed], ...(cleansedBanner.attachment ? { files: [cleansedBanner.attachment] } : {}) }).catch(() => {});
   return;
  }
 }
 const grottoPayResult = await payStaminaOrStruggle(freshParty, characterIndex, 1, { order: "currentFirst", action: "grotto" });
 if (!grottoPayResult.ok) {
  const partyTotalStamina = Math.max(0, freshParty.totalStamina ?? 0);
  const partyTotalHearts = Math.max(0, freshParty.totalHearts ?? 0);
  const charName = freshParty.characters[characterIndex]?.name || "Party";
  const at = new Date();
  pushProgressLog(freshParty, charName, "grotto", `Found a grotto in ${location}; mark on map for later (need stamina or hearts to cleanse).`, undefined, undefined, at);
  await freshParty.save(); // Always persist so dashboard shows current hearts/stamina/progress
  const noStaminaEmbed = new EmbedBuilder()
   .setTitle("❌ Not enough stamina or hearts to cleanse the grotto")
   .setColor(getExploreOutcomeColor("grotto", regionColors[freshParty.region] || "#00ff99"))
   .setDescription("This grotto is still **uncleansed**. Party has " + partyTotalStamina + " 🟩 and " + partyTotalHearts + " ❤ (need 1 to cleanse). **Camp** to recover, or use hearts to **Struggle**. Mark it on the dashboard for later.\n\n" + GROTTO_CLEANSED_VS_CLEARED)
   .setImage(GROTTO_BANNER_UNCLEANSED_URL);
  addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(freshParty) });
  await i.followUp({ embeds: [noStaminaEmbed] }).catch(() => {});
  return;
 }
 const plumeHolder = await findGoddessPlumeHolder(freshParty);
 if (!plumeHolder) {
  const charName = freshParty.characters[characterIndex]?.name || "Party";
  const at = new Date();
  pushProgressLog(freshParty, charName, "grotto", `Found a grotto in ${location}; mark on map for later (no Goddess Plume to cleanse).`, undefined, undefined, at);
  await freshParty.save(); // Always persist so dashboard shows current hearts/stamina/progress
  const noPlumeEmbed = new EmbedBuilder()
   .setTitle("❌ No Goddess Plume to cleanse the grotto")
   .setColor(getExploreOutcomeColor("grotto", regionColors[freshParty.region] || "#00ff99"))
   .setDescription("This grotto is **uncleansed** — no one has a Goddess Plume in their expedition loadout. Add one before departing, then mark the grotto on the dashboard for later or continue exploring.\n\n" + GROTTO_CLEANSED_VS_CLEARED)
   .setImage(GROTTO_BANNER_UNCLEANSED_URL);
  addExplorationStandardFields(noPlumeEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(freshParty) });
  await i.followUp({ embeds: [noPlumeEmbed] }).catch(() => {});
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
 const resolvedLoc = await findExactMapSquareAndQuadrant(squareId, quadrantId);
 const exactSquareId = resolvedLoc?.exactSquareId ?? squareId;
 const exactQuadrantId = resolvedLoc?.exactQuadrantId ?? String(quadrantId).trim().toUpperCase();
 const discoveryKey = `grotto|${exactSquareId}|${exactQuadrantId}|${at.toISOString()}`;
 const usedGrottoNames = await Grotto.distinct("name").catch(() => []);
 const grottoName = getRandomGrottoNameUnused(usedGrottoNames);
 const trialType = rollGrottoTrialType();
 const puzzleState = trialType === 'puzzle' ? (() => {
  const cfg = rollPuzzleConfig();
  const s = { puzzleSubType: cfg.subType };
  if (cfg.subType === 'odd_structure') s.puzzleVariant = cfg.variant;
  else s.puzzleClueIndex = cfg.clueIndex;
  return s;
 })() : undefined;
 let grottoDoc = await Grotto.findOne({
  squareId: new RegExp(`^${String(exactSquareId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  quadrantId: new RegExp(`^${String(exactQuadrantId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
 });
 const reusedExistingGrotto = !!grottoDoc;
 if (grottoDoc) {
  grottoDoc.squareId = exactSquareId;
  grottoDoc.quadrantId = exactQuadrantId;
  grottoDoc.discoveryKey = discoveryKey;
  grottoDoc.name = grottoName;
  grottoDoc.sealed = false;
  grottoDoc.status = "cleansed";
  grottoDoc.trialType = trialType;
  grottoDoc.partyId = expeditionId;
  grottoDoc.unsealedAt = at;
  grottoDoc.unsealedBy = cleanseCharacter.name;
  grottoDoc.completedAt = null;
  grottoDoc.targetPracticeState = { turnIndex: 0, successCount: 0, failed: false, phase: 1 };
  grottoDoc.puzzleState = puzzleState || { puzzleSubType: null, puzzleVariant: null, puzzleClueIndex: null };
  grottoDoc.testOfPowerState = { raidStarted: false, raidId: null };
  grottoDoc.mazeState = { currentNode: "", steps: [], facing: "s", layout: undefined, openedChests: [], triggeredTraps: [], usedScryingWalls: [] };
  grottoDoc.markModified("targetPracticeState");
  grottoDoc.markModified("puzzleState");
  grottoDoc.markModified("testOfPowerState");
  await grottoDoc.save();
 } else {
  grottoDoc = new Grotto({
   squareId: exactSquareId,
   quadrantId: exactQuadrantId,
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
 }
 // pushDiscoveryToMap pulls existing grotto discoveries for this quadrant before pushing, so we only ever have one; it builds canonical discoveryKey from resolved location.
 await pushDiscoveryToMap(freshParty, "grotto", at, i.user?.id, { name: grottoName });
 const grottoCostsForLog = buildCostsForLog(grottoPayResult);
 pushProgressLog(freshParty, cleanseCharacter.name, "grotto_cleansed", `Cleansed grotto **${grottoName}** in ${location} (1 Goddess Plume + 1 stamina).`, undefined, Object.keys(grottoCostsForLog).length ? grottoCostsForLog : { staminaLost: 1 }, at);
 await freshParty.save(); // Always persist so dashboard shows current hearts/stamina/progress

 // Generate maze layout at cleanse time for maze trials so the embed can show the maze image
 if (trialType === "maze") {
  const generated = generateGrottoMaze({ width: 5, height: 5, entryType: "diagonal" });
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
  if (!freshParty.gatheredItems) freshParty.gatheredItems = [];
  for (const slot of freshParty.characters) {
   freshParty.gatheredItems.push({ characterId: slot._id, characterName: slot.name, itemName: "Spirit Orb", quantity: 1, emoji: "💫" });
  }
  freshParty.markModified("gatheredItems");
  await markGrottoCleared(grottoDoc);
  restorePartyPoolOnGrottoExit(freshParty);
  pushProgressLog(freshParty, cleanseCharacter.name, "grotto_blessing", `Blessing trial: each party member received a Spirit Orb.`, undefined, undefined, new Date());
  await freshParty.save(); // Always persist so dashboard shows current hearts/stamina/progress
  const blessingFlavor = getRandomBlessingFlavor();
  const cleansedBannerBlessing = await generateGrottoBannerOverlay(freshParty, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
  const explorePageUrlGrotto = getExplorePageUrl(expeditionId);
  const grottoCleansedEmbed = new EmbedBuilder()
   .setTitle("✅ **Grotto cleansed!**")
   .setColor(getExploreOutcomeColor("grotto_blessing", regionColors[freshParty.region] || "#00ff99"))
   .setDescription(
    `**${cleanseCharacter.name}** used a Goddess Plume and 1 stamina to **cleanse** **${grottoName}** in **${location}**.\n\n` +
    `The talismans fall away — the way is open.`
   )
   .setImage(cleansedBannerBlessing?.imageUrl ?? getRandomGrottoBanner())
   .setThumbnail(GROTTO_CLEARED_THUMBNAIL_URL);
  await i.followUp({ embeds: [grottoCleansedEmbed], ...(cleansedBannerBlessing?.attachment ? { files: [cleansedBannerBlessing.attachment] } : {}) }).catch(() => {});
  const blessingClearedEmbed = new EmbedBuilder()
   .setTitle("💫 **Grotto cleared — Blessing!**")
   .setColor(getExploreOutcomeColor("grotto_blessing", "#fbbf24"))
   .setDescription(
    `The grotto held a **blessing** — it is now **cleared**.\n\n` +
    blessingFlavor + `\n\n${GROTTO_CLEARED_FLAVOR}\n\nEach party member received a **Spirit Orb** 💫. Use the commands below to continue exploring.`
   )
   .setImage(cleansedBannerBlessing?.imageUrl ?? getRandomGrottoBanner())
   .setThumbnail(GROTTO_CLEARED_THUMBNAIL_URL);
  addExplorationStandardFields(blessingClearedEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, grottoExitCommands: true, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant), hasUnpinnedDiscoveriesInQuadrant: false });
  blessingClearedEmbed.addFields({
   name: "📍 **__Set pin on map__**",
   value: `You have discovery(ies) in this quadrant that aren't pinned yet. [Set a pin on the explore page](${explorePageUrlGrotto}) so they stay on the map when you leave.`,
   inline: false,
  });
  await i.followUp({ embeds: [blessingClearedEmbed], ...(cleansedBannerBlessing?.attachment ? { files: [cleansedBannerBlessing.attachment] } : {}) }).catch(() => {});
  if (getExplorationNextTurnContent(nextCharacter)) await i.followUp({ content: getExplorationNextTurnContent(nextCharacter) }).catch(() => {});
  return;
 }

 const trialLabel = getTrialLabel(trialType);
 const grottoCmdHint = getActiveGrottoCommand(trialType);
 let continueDesc = `**${cleanseCharacter.name}** used a Goddess Plume and 1 stamina to cleanse **${grottoName}** in **${location}**.\n\n**Trial: ${trialLabel}** — Complete it to receive a **Spirit Orb**. See **Commands** below.`;
 if (trialType === 'target_practice') continueDesc += '\n\n_Each action will take **1** 🟩 stamina._';
if (trialType === 'puzzle' && grottoDoc.puzzleState?.puzzleSubType) {
  const puzzleFlavor = getPuzzleFlavor(grottoDoc, getExploreCommandId());
  if (puzzleFlavor) continueDesc += `\n\n${puzzleFlavor}`;
}
 let trialMazeFiles = [];
 let trialMazeImg = getExploreMapImageUrl(freshParty, { highlight: true });
 if (trialType === "maze" && grottoDoc.mazeState?.layout) {
  try {
       const mazeBuf = await renderMazeToBuffer(grottoDoc.mazeState.layout, { viewMode: "member", currentNode: grottoDoc.mazeState.currentNode, visitedCells: grottoDoc.mazeState.visitedCells, openedChests: grottoDoc.mazeState.openedChests, triggeredTraps: grottoDoc.mazeState.triggeredTraps, usedScryingWalls: grottoDoc.mazeState.usedScryingWalls });
   trialMazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
   trialMazeImg = "attachment://maze.png";
   postGrottoMazeModVersion(i.client, grottoDoc.mazeState.layout, grottoDoc.mazeState.currentNode, grottoName, expeditionId, location, grottoDoc.mazeState);
  } catch (err) {
   logger.warn("EXPLORE", `[explore.js]⚠️ Maze render (cleanse): ${err?.message || err}`);
  }
 }
 const regionImageUrlTrial = getExploreMapImageUrl(freshParty, { highlight: true });
 const explorePageUrlTrial = getExplorePageUrl(expeditionId);
 let cleansedDesc = `**${cleanseCharacter.name}** used a Goddess Plume and 1 stamina to cleanse **${grottoName}** in **${location}**. The talismans fall away — the way is open.\n\n**Trial: ${trialLabel}** — Complete it to receive a Spirit Orb. See **Commands** below.`;
 if (trialType === "target_practice") cleansedDesc += "\n\n_Each action costs **1** 🟩 stamina._";
if (trialType === "puzzle" && grottoDoc.puzzleState?.puzzleSubType) {
  const puzzleFlavor = getPuzzleFlavor(grottoDoc, getExploreCommandId());
  if (puzzleFlavor) cleansedDesc += `\n\n${puzzleFlavor}`;
}
 const cleansedEmbed = new EmbedBuilder()
  .setTitle("✅ **Grotto cleansed!**")
  .setColor(getExploreOutcomeColor("grotto_cleansed", regionColors[freshParty.region] || "#00ff99"))
  .setDescription(cleansedDesc)
  .setImage(trialType === "maze" ? trialMazeImg : regionImageUrlTrial)
  .setThumbnail(GROTTO_BANNER_CLEANSED_URL);
 addExplorationStandardFields(cleansedEmbed, {
  party: freshParty,
  expeditionId,
  location,
  nextCharacter: trialType === "puzzle" ? null : nextCharacter,
  showNextAndCommands: true,
  showRestSecureMove: false,
  ruinRestRecovered,
  hasActiveGrotto: true,
  activeGrottoCommand: grottoCmdHint,
  hasUnpinnedDiscoveriesInQuadrant: false,
  compactGrottoCommands: true,
  grottoPuzzleAnyoneCanSubmit: trialType === "puzzle",
 });
 cleansedEmbed.addFields({
  name: "📍 **__Set pin on map__**",
  value: `You have discovery(ies) in this quadrant that aren't pinned yet. [Set a pin on the explore page](${explorePageUrlTrial}) so they stay on the map when you leave.`,
  inline: false,
 });
 if (trialType === "maze" && trialMazeFiles.length) cleansedEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
 const cleansedFiles = trialType === "maze" && trialMazeFiles.length ? trialMazeFiles : undefined;
 await i.followUp({ embeds: [cleansedEmbed], ...(cleansedFiles ? { files: cleansedFiles } : {}) }).catch(() => {});
 if (trialType !== "puzzle" && getExplorationNextTurnContent(nextCharacter)) await i.followUp({ content: getExplorationNextTurnContent(nextCharacter) }).catch(() => {});
}

// ------------------- applyBlightExposure ------------------
// Roll blight chance for each party member when revealing/traveling through blighted quadrant.
// Base chance: 15% per party member who isn't already blighted. Blight Candle halves the chance (7.5%).
// Returns: { blightedMembers: [{ name, roll }], safeMembers: [{ name, roll }] }
const BLIGHT_EXPOSURE_CHANCE = 0.15; // 15% chance to contract blight

async function applyBlightExposure(party, square, quadrant, reason, characterName, client = null, guild = null) {
 const location = `${square} ${quadrant}`;
 const prev = typeof party.blightExposure === "number" ? party.blightExposure : 0;
 const displayTotal = prev + 1;

 const hasBlightCandle = await partyHasRelic(party.characters || [], 'Blight Candle');
 const effectiveChance = hasBlightCandle ? BLIGHT_EXPOSURE_CHANCE * 0.5 : BLIGHT_EXPOSURE_CHANCE;
 
 const blightedMembers = [];
 const safeMembers = [];
 let candleConsumer = null; // first party member with Blight Candle to consume one use
 
 // Roll for each party member
 for (const partyChar of party.characters) {
  // Fetch the actual character document to check blight status
  let charDoc = null;
  try {
   charDoc = await Character.findById(partyChar._id);
   if (!charDoc) {
    charDoc = await ModCharacter.findById(partyChar._id);
   }
  } catch (err) {
   logger.warn("EXPLORE", `[explore.js] Could not fetch character ${partyChar.name} for blight check: ${err.message}`);
  }
  
  // Skip if character is already blighted
  if (charDoc?.blighted && charDoc?.blightStage > 0) {
   continue;
  }
  if (hasBlightCandle && !candleConsumer && (await characterHasRelic(partyChar._id, 'Blight Candle', partyChar.name))) {
   candleConsumer = partyChar;
  }
  
  // Roll for blight (effective chance: 15% or 7.5% with Blight Candle)
  const roll = Math.random();
  const contracted = roll < effectiveChance;
  const rollDisplay = Math.floor(roll * 100) + 1;
  
  if (contracted && charDoc) {
   blightedMembers.push({ name: partyChar.name, roll: rollDisplay });
   
   if (!false) {
    // Apply blight to this character
    try {
     await finalizeBlightApplication(charDoc, charDoc.userId, {
      client,
      guild,
      source: `Blighted quadrant (${location})`,
      alreadySaved: false
     });
     logger.info("EXPLORE", `[explore.js] ${partyChar.name} contracted blight from ${location} (roll: ${rollDisplay})`);
    } catch (blightErr) {
     logger.error("EXPLORE", `[explore.js] Failed to apply blight to ${partyChar.name}: ${blightErr.message}`);
    }
   }
  } else {
   safeMembers.push({ name: partyChar.name, roll: rollDisplay });
  }
 }
 
 // Increment exposure counter
 if (false) {
  const blightedNames = blightedMembers.map(m => `${m.name} (rolled ${m.roll})`).join(", ");
  const safeNames = safeMembers.map(m => `${m.name} (rolled ${m.roll})`).join(", ");
  const logMsg = blightedMembers.length > 0
   ? `Blight exposure at ${location}! **CONTRACTED:** ${blightedNames}. Safe: ${safeNames || "none"}.`
   : `Blight exposure at ${location}. All safe: ${safeNames || "none"}.`;
  pushProgressLog(party, characterName || "Party", "blight_exposure", logMsg, undefined, undefined);
  return { blightedMembers, safeMembers }; // No persist in testing mode
 }
 
 party.blightExposure = displayTotal;
 party.markModified("blightExposure");
 
 const blightedNames = blightedMembers.map(m => `${m.name} (rolled ${m.roll})`).join(", ");
 const safeNames = safeMembers.map(m => `${m.name} (rolled ${m.roll})`).join(", ");
 const logMsg = blightedMembers.length > 0
  ? `Blight exposure at ${location}! **CONTRACTED:** ${blightedNames}. Safe: ${safeNames || "none"}.`
  : `Blight exposure at ${location}. All safe: ${safeNames || "none"}.`;
 
 pushProgressLog(
  party,
  characterName || "Party",
  "blight_exposure",
  logMsg,
  undefined,
  undefined
 );
 if (hasBlightCandle && candleConsumer) {
  try {
   await consumeBlightCandleUse(candleConsumer._id, candleConsumer.name);
  } catch (e) {
   logger.warn("EXPLORE", `[explore.js] Blight Candle consume use failed: ${e?.message || e}`);
  }
 }
 await party.save();
 return { blightedMembers, safeMembers };
}

// ------------------- handleExpeditionFailed ------------------
// Full party KO: reset to start, apply debuff, reset explored quadrants.
// useFollowUp: if true, use followUp instead of editReply (when showing after another embed).
// Uses applyExpeditionFailedState from exploreModule for shared logic.
async function handleExpeditionFailed(party, interaction, useFollowUp = false) {
 const replyFn = useFollowUp ? interaction.followUp.bind(interaction) : interaction.editReply.bind(interaction);

 const result = await applyExpeditionFailedState(party, {
  failMessage: "Expedition failed — party lost all hearts.",
 });
 if (!result.success) {
  await replyFn("Expedition failed but could not resolve start location for region.");
  return;
 }

 const { party: updatedParty, villageLabel, locationStr, debuffDays } = result;
 const embed = new EmbedBuilder()
  .setTitle("💀 **Expedition: Expedition Failed — Party KO'd**")
  .setColor(0x8b0000)
  .setDescription(
  "The party lost all collective hearts. The expedition has failed.\n\n" +
  "**Return:** Party wakes in **" + villageLabel + "** (the village you began from) with 0 hearts and 0 stamina.\n\n" +
  "**Items:** All items brought on the expedition and any found during the expedition are lost.\n\n" +
  "**Map:** Any quadrants this expedition had marked as Explored return to Unexplored status.\n\n" +
  "**Recovery debuff:** For **" + debuffDays + " days**, characters cannot use healing or stamina items, cannot use healer services, and cannot join or go on expeditions. They must recover their strength. Certain boosting perks can remove this debuff early."
  )
  .setImage(getExploreMapImageUrl(updatedParty, { highlight: true }));
 addExplorationStandardFields(embed, {
  party: { partyId: updatedParty.partyId, totalHearts: 0, totalStamina: 0 },
  expeditionId: updatedParty.partyId,
  location: locationStr,
  nextCharacter: null,
  showNextAndCommands: false,
  showRestSecureMove: false,
  hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(updatedParty),
 });
 await replyFn({ embeds: [embed] });
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

// ------------------- hasAdjacentSecuredQuadrant ------------------
// Returns true if at least one quadrant adjacent to (square, quadrant) has status "secured" on the map.
async function hasAdjacentSecuredQuadrant(square, quadrant) {
 const adjacents = getAdjacentQuadrants(square, quadrant);
 if (!adjacents || !adjacents.length) return false;
 const uniqueSquareIds = [...new Set(adjacents.map((a) => normalizeSquareId(a.square)).filter(Boolean))];
 if (!uniqueSquareIds.length) return false;
 const squareDocs = await Square.find({
  $or: uniqueSquareIds.map((id) => ({ squareId: new RegExp(`^${String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })),
 });
 if (!squareDocs || !squareDocs.length) return false;
 const squareByNorm = {};
 for (const doc of squareDocs) {
  const norm = normalizeSquareId(doc.squareId);
  if (norm) squareByNorm[norm] = doc;
 }
 for (const adj of adjacents) {
  const normSquare = normalizeSquareId(adj.square);
  const normQuad = String(adj.quadrant || "").trim().toUpperCase();
  if (!normSquare || !normQuad) continue;
  const sqDoc = squareByNorm[normSquare];
  if (!sqDoc || !sqDoc.quadrants || !sqDoc.quadrants.length) continue;
  const q = sqDoc.quadrants.find((qu) => String(qu.quadrantId || "").toUpperCase() === normQuad);
  const effectiveStatus = getEffectiveQuadrantStatus(adj.square, adj.quadrant, q?.status);
  if (effectiveStatus === "secured") return true;
 }
 return false;
}

// ============================================================================
// ------------------- Expedition Command Definition -------------------
// ============================================================================

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
    .setDescription("Camp to recover hearts. 1 stamina unsecured, 0 secured. At 0 stamina recovers stamina.")
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
    .setDescription("End expedition and return home (only at starting quadrant). Finish before running out.")
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
        .setDescription("North, East, South, or West; or Song of Scrying when on a red cell")
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
    .addSubcommand((sub) =>
     sub
      .setName("leave")
      .setDescription("Leave the grotto without completing the trial; you can roll away or come back later")
      .addStringOption((o) => o.setName("id").setDescription("Expedition ID").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("charactername").setDescription("Your character name").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("grotto").setDescription("Grotto name at this location").setRequired(true).setAutocomplete(true))
    )
  ),

// ------------------- Command Execution Logic ------------------
// execute - main entry for /explore subcommands -
 async execute(interaction) {
  try {
   await interaction.deferReply();

   const subcommandGroup = interaction.options.getSubcommandGroup(false);
   const subcommand = interaction.options.getSubcommand(false);

   // ------------------- Grotto subcommands -------------------
   if (subcommandGroup === "grotto") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = normalizeCharacterName(interaction.options.getString("charactername"));
    const userId = interaction.user.id;
    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition ID not found.")] });
    const character = await findCharacterByNameAndUser(characterName, userId);
    if (!character) return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Character not found**", "Character not found or you do not own this character.")] });
    const location = `${party.square} ${party.quadrant}`;
    const squareId = (party.square && String(party.square).trim()) || "";
    const quadrantId = (party.quadrant && String(party.quadrant).trim()) || "";

    // Block grotto commands if there's an active raid for this expedition (except Test of Power grotto raids which ARE the raid)
    const activeRaidGrotto = await Raid.findOne({ expeditionId: { $regex: exactIRegex(expeditionId) }, status: "active" });
    if (activeRaidGrotto) {
     // If this is a Test of Power grotto raid, allow "continue" to show the raid info, but block other subcommands
     const isTestOfPowerRaid = !!activeRaidGrotto.grottoId;
     if (subcommand === "continue" && isTestOfPowerRaid) {
      // Allow continue - it will show the Test of Power raid info
     } else {
      return interaction.editReply({ embeds: [createRaidBlockEmbed(party, activeRaidGrotto.raidId, `grotto ${subcommand}`, location)] });
     }
    }

    // Block grotto commands if there's an active wave for this expedition
    const activeWaveGrotto = await Wave.findOne({
     expeditionId: { $regex: exactIRegex(expeditionId) },
     status: "active"
    });
    if (activeWaveGrotto) {
     return interaction.editReply({ embeds: [createWaveBlockEmbed(party, activeWaveGrotto.waveId, `grotto ${subcommand}`)] });
    }

    if (!SKIP_PIN_REQUIREMENT_FOR_TESTING) {
     const unpinnedGrotto = await hasUnpinnedDiscoveriesInQuadrant(party);
     if (unpinnedGrotto) {
      const blockEmbed = await createUnpinnedDiscoveriesBlockEmbed(party, expeditionId);
      return interaction.editReply({ embeds: [blockEmbed] });
     }
    }

    if (subcommand === "continue") {
     const grottoOption = interaction.options.getString("grotto");
     const grotto = await resolveGrottoAtLocation(squareId, quadrantId, expeditionId, grottoOption);
     if (!grotto) {
      return interaction.editReply({
       embeds: [createExplorationErrorEmbed("❌ **No active grotto trial**", "No active grotto trial at this location for this expedition. Make sure you have cleansed a grotto here and are in the same square and quadrant.", { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })],
      });
     }
     party.leftGrottoSquare = null;
     party.leftGrottoQuadrant = null;
     party.markModified("leftGrottoSquare");
     party.markModified("leftGrottoQuadrant");
     await party.save();
     if (grotto.trialType === "puzzle" && (grotto.puzzleState?.offeringAttempts ?? 0) >= 3 && grotto.puzzleState?.offeringApproved !== true) {
      grotto.puzzleState.offeringAttempts = 0;
      grotto.markModified("puzzleState");
      await grotto.save();
     }
    if (grotto.status === "cleared" || grotto.completedAt) {
      const rollCmdId = getExploreCommandId();
      const clearedBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
      const clearedEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto already cleared**")
       .setColor(getExploreOutcomeColor("grotto_revisit", regionColors[party.region] || "#00ff99"))
       .setDescription(`This grotto has already been **cleared** (trial completed; sealed). Use </explore roll:${rollCmdId}> to leave and continue exploring.`)
       .setImage(clearedBanner.imageUrl);
      addExplorationStandardFields(clearedEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      return interaction.editReply({ embeds: [clearedEmbed], ...(clearedBanner.attachment ? { files: [clearedBanner.attachment] } : {}) });
    }
     if (grotto.trialType === "puzzle" && grotto.puzzleState?.offeringSubmitted && grotto.puzzleState?.offeringApproved === true && !grotto.completedAt) {
      await markGrottoCleared(grotto);
      restorePartyPoolOnGrottoExit(party);
      for (const slot of party.characters) {
       if (!false) {
        try {
         await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Puzzle");
        } catch (err) {
         logger.warn("EXPLORE", `[explore.js]⚠️ Grotto puzzle Spirit Orb add failed: ${err?.message || err}`);
        }
       }
      }
      if (!party.gatheredItems) party.gatheredItems = [];
      for (const slot of party.characters) {
       party.gatheredItems.push({ characterId: slot._id, characterName: slot.name, itemName: "Spirit Orb", quantity: 1, emoji: "💫" });
      }
      party.markModified("gatheredItems");
      pushProgressLog(party, character.name, "grotto_puzzle_success", "Puzzle approved. Each party member received a Spirit Orb.", undefined, undefined, new Date());
      await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
      const flavor = getRandomPuzzleSuccessFlavor();
      const rollCmdId = getExploreCommandId();
      const approvedBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
      const approvedEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Puzzle — Approved!**")
       .setColor(getExploreOutcomeColor("grotto_puzzle_success", regionColors[party.region] || "#00ff99"))
       .setDescription(`**Correct!** ${flavor}\n\n${GROTTO_CLEARED_FLAVOR}\n\nGrotto is now **cleared**. Each party member received a **Spirit Orb** 💫. Use </explore roll:${rollCmdId}> to leave and continue exploring.`)
       .setImage(approvedBanner.imageUrl)
       .setThumbnail(GROTTO_CLEARED_THUMBNAIL_URL);
      addExplorationStandardFields(approvedEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      await interaction.editReply({ embeds: [approvedEmbed], ...(approvedBanner.attachment ? { files: [approvedBanner.attachment] } : {}) });
      if (false) {
       const endEmbed = await buildTestingEndAfterGrottoEmbed(party, expeditionId, character.name);
       await interaction.followUp({ embeds: [endEmbed] }).catch(() => {});
      }
      return;
     }
    if (grotto.trialType === "puzzle" && grotto.completedAt) {
      const rollCmdId = getExploreCommandId();
      const doneBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
      const doneEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Puzzle — Complete**")
       .setColor(getExploreOutcomeColor("grotto_puzzle_success", regionColors[party.region] || "#00ff99"))
       .setDescription(`${GROTTO_CLEARED_FLAVOR}\n\nGrotto **cleared**. Use </explore roll:${rollCmdId}> to leave and continue exploring.`)
       .setImage(doneBanner.imageUrl)
       .setThumbnail(GROTTO_CLEARED_THUMBNAIL_URL);
      addExplorationStandardFields(doneEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      return interaction.editReply({ embeds: [doneEmbed], ...(doneBanner.attachment ? { files: [doneBanner.attachment] } : {}) });
    }
     if (grotto.trialType === "puzzle" && (grotto.puzzleState?.offeringAttempts ?? 0) >= 3) {
      party.leftGrottoSquare = squareId;
      party.leftGrottoQuadrant = quadrantId;
      party.markModified("leftGrottoSquare");
      party.markModified("leftGrottoQuadrant");
      await party.save();
      const rollCmdId = getExploreCommandId();
      const leaveCmdId = getExploreCommandId();
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Puzzle attempts used**", `The party used all 3 puzzle attempts. The grotto is **not cleared** — it stays until someone submits the correct offering. Use </explore grotto leave:${leaveCmdId}> or </explore roll:${rollCmdId}> to leave. Come back later with </explore grotto continue> to get 3 more attempts.`, { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     if (grotto.trialType === "puzzle" && grotto.puzzleState?.offeringSubmitted && grotto.puzzleState?.offeringApproved === false) {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Puzzle offering denied**", `The puzzle offering was denied. Items offered are still consumed. You can try again (up to 3 attempts total) with </explore grotto puzzle:${getExploreCommandId()}> (items), or use </explore grotto leave:${getExploreCommandId()}> to leave and come back later (no more items consumed).`, { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     if (grotto.trialType === "test_of_power") {
      // Only one raid per grotto: check DB for active raid linked to this grotto (handles race / double continue)
      const existingGrottoRaid = await Raid.findOne({ grottoId: grotto._id, status: "active" });
      if (existingGrottoRaid) {
       const raidId = existingGrottoRaid.raidId;
       if (!grotto.testOfPowerState?.raidStarted || grotto.testOfPowerState.raidId !== raidId) {
        grotto.testOfPowerState = { raidStarted: true, raidId };
        grotto.markModified("testOfPowerState");
        await grotto.save();
       }
       const raidCmd = "</raid:1470659276287774734>";
       const inProgressBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
       const embedInProgress = new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Test of Power**")
        .setColor(getExploreOutcomeColor("grotto_maze_raid", regionColors[party.region] || "#00ff99"))
        .setDescription(`The grotto is **cleansed** and the trial has already begun. Use ${raidCmd} with Raid ID \`${raidId}\` to fight. When the monster is defeated, the grotto will be **cleared** and each party member will receive a Spirit Orb.`)
        .setImage(inProgressBanner.imageUrl);
       addExplorationStandardFields(embedInProgress, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: `${raidCmd} — Raid ID: \`${raidId}\``, hasUnpinnedDiscoveriesInQuadrant: false, compactGrottoCommands: true });
       return interaction.editReply({ embeds: [embedInProgress], ...(inProgressBanner.attachment ? { files: [inProgressBanner.attachment] } : {}) });
      }
      const raidStarted = grotto.testOfPowerState?.raidStarted && grotto.testOfPowerState?.raidId;
      if (raidStarted) {
       const raidId = grotto.testOfPowerState.raidId;
       const raidCmd = "</raid:1470659276287774734>";
       const inProgressBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
       const embedInProgress = new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Test of Power**")
        .setColor(getExploreOutcomeColor("grotto_maze_raid", regionColors[party.region] || "#00ff99"))
        .setDescription(`The grotto is **cleansed** and the trial has already begun. Use ${raidCmd} with Raid ID \`${raidId}\` to fight. When the monster is defeated, the grotto will be **cleared** and each party member will receive a Spirit Orb.`)
        .setImage(inProgressBanner.imageUrl);
       addExplorationStandardFields(embedInProgress, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: `${raidCmd} — Raid ID: \`${raidId}\``, hasUnpinnedDiscoveriesInQuadrant: false, compactGrottoCommands: true });
       return interaction.editReply({ embeds: [embedInProgress], ...(inProgressBanner.attachment ? { files: [inProgressBanner.attachment] } : {}) });
      }
      // Turn order: only the current turn character can start the Test of Power raid
      const characterIndex = party.characters.findIndex((c) => c.name === characterName);
      if (characterIndex === -1) {
       return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Not in expedition**", "Your character is not part of this expedition.", { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
      }
      if (party.currentTurn !== characterIndex) {
       const nextCharacter = party.characters[party.currentTurn];
       const notYourTurnEmbed = new EmbedBuilder()
        .setTitle("⏳ Not Your Turn")
        .setColor(NOT_YOUR_TURN_COLOR)
        .setDescription(`It's not your turn to start the trial.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}\n\nUse </explore grotto continue> when it's your turn to begin the Test of Power.`)
        .setImage(NOT_YOUR_TURN_BORDER_URL);
       return interaction.editReply({ embeds: [notYourTurnEmbed] });
      }
      // Use a random tier-5+ monster from MonsterModel (name, image, tier, hearts from DB)
      let monster = await getMonstersAboveTier(5);
      if (!monster) {
       return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Test of Power**", "Test of Power could not load a monster from the bestiary. Try again.", { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
      }
      monster = {
        name: monster.name,
        nameMapping: monster.nameMapping || (monster.name || "").replace(/\s+/g, ""),
        image: monster.image || "",
        tier: monster.tier ?? 5,
        hearts: monster.hearts ?? 10,
       };
      const village = REGION_TO_VILLAGE[party.region?.toLowerCase()] || "Inariko";
      const raidResult = await triggerRaid(monster, interaction, village, false, character, false, expeditionId, grotto._id);
      if (raidResult && raidResult.success) {
       grotto.testOfPowerState = grotto.testOfPowerState || {};
       grotto.testOfPowerState.raidStarted = true;
       grotto.testOfPowerState.raidId = raidResult.raidId;
       await grotto.save();
       const raidCmd = "</raid:1470659276287774734>";
       const grottoRaidBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
       const embedStarted = new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Test of Power — Raid Started**")
        .setColor(getExploreOutcomeColor("grotto_maze_raid", regionColors[party.region] || "#00ff99"))
        .setDescription(`A **${monster.name}** has appeared. Use ${raidCmd} with Raid ID \`${raidResult.raidId}\` to fight — when it's defeated, everyone gets a **Spirit Orb**.`)
        .setImage(grottoRaidBanner?.imageUrl ?? getExploreMapImageUrl(party, { highlight: true }));
       embedStarted.addFields({
        name: "⚔️ **__Trial__**",
        value: `**Test of Power** — Defeat the monster to clear the grotto and receive a Spirit Orb.`,
        inline: false,
       });
       addExplorationStandardFields(embedStarted, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: `${raidCmd} — Raid ID: \`${raidResult.raidId}\``, hasUnpinnedDiscoveriesInQuadrant: false, compactGrottoCommands: true });
       return interaction.editReply({ embeds: [embedStarted], ...(grottoRaidBanner?.attachment ? { files: [grottoRaidBanner.attachment] } : {}) });
      }
      const errMsg = raidResult?.error || "Could not start the raid. Try again.";
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Test of Power**", `Test of Power could not start the raid: ${errMsg}`, { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
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
      const flavor = getPuzzleFlavor(grotto, cmdId);
      if (flavor) {
       grottoDesc += `${flavor}\n\nSee **Commands** below.`;
      } else {
       grottoDesc += "Discuss with your group. Submit an offering (items); if correct, everyone gets Spirit Orbs. See **Commands** below.";
      }
     } else {
      const instructions = {
       target_practice: "Establish turn order. **Each shot costs 1 🟩 stamina.** Some misses can cause damage to the shooter. **3 hits** wins; **1 fail** ends the trial (use </explore roll> to leave). See **Commands** below.",
       test_of_power: "Boss battle — no backing out. Prepare and fight; spirit orbs on victory. (Test of Power flow uses raid-style encounter; ensure party is ready.)",
       maze: "Use North, East, South, or West to move, or Song of Scrying at a wall. See **Commands** below.",
      };
      grottoDesc += instructions[grotto.trialType] || `Complete the ${trialLabel} trial. See **Commands** below.`;
     }
     let continueMazeFiles = [];
     let continueMazeImg = getExploreMapImageUrl(party, { highlight: true });
     if (grotto.trialType === "maze" && grotto.mazeState?.layout) {
      try {
       const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: grotto.mazeState.currentNode, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
       continueMazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
       continueMazeImg = "attachment://maze.png";
      } catch (err) {
       logger.warn("EXPLORE", `[explore.js]⚠️ Maze render (continue): ${err?.message || err}`);
      }
     } else if (grotto.trialType !== "maze") {
      const continueBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
      continueMazeImg = continueBanner?.imageUrl ?? getRandomGrottoBanner();
      if (continueBanner?.attachment) continueMazeFiles = [continueBanner.attachment];
     }
     const embed = new EmbedBuilder()
      .setTitle(`🗺️ **Grotto: ${trialLabel}**`)
      .setColor(getExploreOutcomeColor("grotto_puzzle_success", regionColors[party.region] || "#00ff99"))
      .setDescription(grottoDesc)
      .setImage(continueMazeImg);
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location,
      nextCharacter: grotto.trialType === "puzzle" ? null : (party.characters[party.currentTurn] ?? null),
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasActiveGrotto: true,
      activeGrottoCommand: getActiveGrottoCommand(grotto.trialType),
      hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      grottoPuzzleAnyoneCanSubmit: grotto.trialType === "puzzle",
     });
    if (grotto.trialType === "maze" && continueMazeFiles.length) embed.setFooter({ text: GROTTO_MAZE_LEGEND });
     return interaction.editReply({ embeds: [embed], files: continueMazeFiles.length ? continueMazeFiles : undefined });
    }

    if (subcommand === "targetpractice") {
     const grottoOption = interaction.options.getString("grotto");
     const grotto = await resolveGrottoAtLocation(squareId, quadrantId, expeditionId, grottoOption, true);
     if (!grotto || grotto.trialType !== "target_practice") {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **No Target Practice grotto**", "No Target Practice grotto at this location for this expedition.", { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     if (grotto.status === "cleared" || grotto.completedAt) {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("🗺️ **Grotto already cleared**", "This grotto has already been cleared.", { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     // Ensure targetPracticeState exists (old grottos may lack it)
     if (!grotto.targetPracticeState || typeof grotto.targetPracticeState !== "object") {
      grotto.targetPracticeState = { turnIndex: 0, successCount: 0, failed: false, phase: 1 };
      grotto.markModified("targetPracticeState");
     }
     const TARGET_SUCCESSES_PHASE1 = 2;
     const TARGET_SUCCESSES = 3;
     const BASE_FAIL = 0.15;
     const BASE_MISS = 0.25;
     const BASE_FAIL_PHASE2 = 0.22;
     const BASE_MISS_PHASE2 = 0.33;
    const failedByThisExpedition = grotto.targetPracticeState?.failed && String(grotto.partyId || "").trim() === String(expeditionId || "").trim();
    if (failedByThisExpedition) {
      const cmdId = getExploreCommandId();
      const failedEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Target Practice — Already Failed**")
       .setColor(0x8b0000)
       .setDescription(
        "**Trial failed.** The party already failed this trial (this expedition). Use </explore roll:" + cmdId + "> to leave. Find another Target Practice grotto on a future expedition to try again."
       )
       .setThumbnail(TARGET_PRACTICE_THUMBNAIL_URL)
       .setImage(getRandomGrottoBanner());
      addExplorationStandardFields(failedEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      return interaction.editReply({ embeds: [failedEmbed] });
    }
    if (grotto.targetPracticeState?.failed && String(grotto.partyId || "").trim() !== String(expeditionId || "").trim()) {
     if (!grotto.targetPracticeState) grotto.targetPracticeState = { turnIndex: 0, successCount: 0, failed: false, phase: 1 };
     grotto.targetPracticeState.failed = false;
     grotto.targetPracticeState.successCount = 0;
     grotto.targetPracticeState.turnIndex = 0;
     grotto.targetPracticeState.phase = 1;
     grotto.partyId = expeditionId;
     grotto.markModified("targetPracticeState");
     grotto.markModified("partyId");
     await grotto.save();
    }
     const characterIndex = party.characters.findIndex((c) => c._id && c._id.toString() === character._id.toString());
     if (characterIndex === -1) {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Not in expedition**", "Character is not in this expedition party.", { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
    }
     const TARGET_PRACTICE_STAMINA_COST = 1;
     const payResult = await payStaminaOrStruggle(party, characterIndex, TARGET_PRACTICE_STAMINA_COST, { order: "currentFirst", action: "grotto_target_practice" });
     if (!payResult.ok) {
      const partyTotalStamina = Math.max(0, party.totalStamina ?? 0);
      const partyTotalHearts = Math.max(0, party.totalHearts ?? 0);
      return interaction.editReply({
       embeds: [
        new EmbedBuilder()
         .setTitle("❌ Not enough stamina or hearts")
         .setDescription(
          `Target Practice costs **${TARGET_PRACTICE_STAMINA_COST}** stamina per shot. Party has ${partyTotalStamina} 🟩 and ${partyTotalHearts} ❤. **Camp** to recover, or use hearts to **Struggle**.`
         )
         .setColor(0x8b0000)
         .setThumbnail(TARGET_PRACTICE_THUMBNAIL_URL),
       ],
      });
     }
     
     // Check if party is KO'd after paying (hearts reached 0 via struggle)
     if ((party.totalHearts ?? 0) <= 0 && payResult.heartsPaid > 0) {
      pushProgressLog(party, character.name, "ko", `Party KO'd after paying ${payResult.heartsPaid} heart(s) for target practice (struggle mode).`, undefined, { heartsLost: payResult.heartsPaid });
      await party.save();
      await handleExpeditionFailed(party, interaction);
      return;
     }
     
     const currentPhase = grotto.targetPracticeState.phase || 1;
     const isPhase2 = currentPhase === 2;
     const baseFail = isPhase2 ? BASE_FAIL_PHASE2 : BASE_FAIL;
     const baseMiss = isPhase2 ? BASE_MISS_PHASE2 : BASE_MISS;
     const { failReduction, missReduction } = getTargetPracticeModifiers(character);
     const failThreshold = Math.max(0.05, baseFail - failReduction);
     const missThreshold = Math.max(0.10, baseMiss - missReduction);
     const hitThreshold = failThreshold + missThreshold;
    const roll = Math.random();
    const rollPct = Math.round(roll * 100);
    const failPct = Math.round(failThreshold * 100);
    const hitPct = Math.round(hitThreshold * 100);
     const cmdId = getExploreCommandId();
     const cmdRoll = `</explore roll:${cmdId}>`;
     const cmdTargetPractice = `</explore grotto targetpractice:${cmdId}>`;

     if (roll < failThreshold) {
      grotto.targetPracticeState.failed = true;
      await grotto.save();
      pushProgressLog(party, character.name, "grotto_target_fail", `Target Practice: ${character.name} failed the roll. Party may return later.`, undefined, undefined, new Date());
      await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
      const outcome = getFailOutcome();
      const flavor = outcome.flavor.replace(/\{char\}/g, character.name) + getTargetPracticeGearFlavor(character, "fail");
      const successCount = grotto.targetPracticeState.successCount || 0;
      const phaseNoteFail = isPhase2 ? " **(Phase 2: precision)**" : "";
      const progressLine = `**Progress:** ✅ ${successCount}/${TARGET_SUCCESSES} hits${phaseNoteFail}`;
      const desc = `${flavor}\n\n**Roll:** ${rollPct}% — **fail** (need over ${failPct}% to avoid instant fail)  *(−1 🟩 stamina)*\n\n${progressLine}\n\n**Trial failed.** Use ${cmdRoll} to leave. You can’t retry this grotto this expedition; find another Target Practice on a future run.`;
      const embed = new EmbedBuilder()
       .setTitle(isPhase2 ? "🗺️ **Grotto: Target Practice — Phase 2 — Failed**" : "🗺️ **Grotto: Target Practice — Failed**")
       .setColor(0x8b0000)
       .setDescription(desc)
       .setThumbnail(TARGET_PRACTICE_THUMBNAIL_URL)
       .setImage(getRandomGrottoBanner());
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

     if (roll < hitThreshold) {
      const outcome = getMissOutcome();
      const flavor = outcome.flavor.replace(/\{char\}/g, character.name) + getTargetPracticeGearFlavor(character, "miss");
      const damageAmount = outcome.heartsLost ?? 0;
      let heartsLost = 0;
      if (damageAmount > 0) {
       const poolHearts = Math.max(0, party.totalHearts ?? 0);
       if (poolHearts >= damageAmount) {
        party.totalHearts = Math.max(0, poolHearts - damageAmount);
        party.markModified("totalHearts");
        heartsLost = damageAmount;
        await party.save();
       }
      }
      const damageNote = heartsLost > 0 ? ` **${character.name}** took ${heartsLost} ❤ damage.` : "";
      const sameShooter = party.characters[characterIndex];
      const successCount = grotto.targetPracticeState.successCount || 0;
      const phaseNoteMiss = isPhase2 ? " **(Phase 2: precision)**" : "";
      const progressLine = `**Progress:** ✅ ${successCount}/${TARGET_SUCCESSES} hits${phaseNoteMiss}`;
      const desc = `${flavor}\n\n**Roll:** ${rollPct}% — miss (need over ${hitPct}% to hit)  *(−1 🟩 stamina)*${damageNote}\n\n${progressLine}\n\n**Same shooter tries again** — **${sameShooter?.name ?? "—"}** in **Commands** below.`;
      const embed = new EmbedBuilder()
       .setTitle(isPhase2 ? "🗺️ **Grotto: Target Practice — Phase 2**" : "🗺️ **Grotto: Target Practice**")
       .setColor(getExploreOutcomeColor("grotto_puzzle_success", regionColors[party.region] || "#00ff99"))
       .setDescription(desc)
       .setThumbnail(TARGET_PRACTICE_THUMBNAIL_URL)
       .setImage(getRandomGrottoBanner())
       .setFooter({ text: "Each shot costs 1 🟩 stamina." });
      addExplorationStandardFields(embed, {
       party,
       expeditionId,
       location,
       nextCharacter: sameShooter ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: cmdTargetPractice,
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
       compactGrottoCommands: true,
     });
      await interaction.editReply({ embeds: [embed] });
      if (getExplorationNextTurnContent(sameShooter)) await interaction.followUp({ content: getExplorationNextTurnContent(sameShooter) }).catch(() => {});
      return;
     }

     const newSuccesses = (grotto.targetPracticeState.successCount || 0) + 1;
     grotto.targetPracticeState.successCount = newSuccesses;
     if (newSuccesses >= TARGET_SUCCESSES) {
      await markGrottoCleared(grotto);
      restorePartyPoolOnGrottoExit(party);
      for (const slot of party.characters) {
       if (!false) {
        try {
         await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Target Practice");
        } catch (err) {
         logger.warn("EXPLORE", `[explore.js]⚠️ Grotto target practice Spirit Orb: ${err?.message || err}`);
        }
       }
      }
      if (!party.gatheredItems) party.gatheredItems = [];
      for (const slot of party.characters) {
       party.gatheredItems.push({ characterId: slot._id, characterName: slot.name, itemName: "Spirit Orb", quantity: 1, emoji: "💫" });
      }
      party.markModified("gatheredItems");
      pushProgressLog(party, character.name, "grotto_target_success", `Target Practice completed. Each party member received a Spirit Orb.`, undefined, undefined, new Date());
      await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
      const outcome = getCompleteOutcome();
      const flavor = outcome.flavor.replace(/\{char\}/g, character.name) + getTargetPracticeGearFlavor(character, "hit");
      const progressBar3 = Array(TARGET_SUCCESSES).fill(0).map((_, i) => i < TARGET_SUCCESSES ? "🎯" : "○").join(" ");
      const progress3Desc = `${flavor}\n\n**Roll:** ${rollPct}% (need over ${hitPct}% to hit)  *(−1 🟩 stamina)*\n\n**Progress:** ${progressBar3}  (3/3 hits)\n\n**Trial complete!**`;
      const progress3Embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Target Practice**")
       .setColor(getExploreOutcomeColor("grotto_target_success", regionColors[party.region] || "#00ff99"))
       .setDescription(progress3Desc)
       .setThumbnail(TARGET_PRACTICE_THUMBNAIL_URL)
       .setImage(getRandomGrottoBanner());
      addExplorationStandardFields(progress3Embed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
     });
      await interaction.editReply({ embeds: [progress3Embed] });
      const successDesc = `**Grotto cleared.** Each party member received a **Spirit Orb** 💫. See **Commands** below.`;
      const successEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Target Practice — Success!**")
       .setColor(getExploreOutcomeColor("grotto_target_success", regionColors[party.region] || "#00ff99"))
       .setDescription(successDesc)
       .setThumbnail(TARGET_PRACTICE_SUCCESS_THUMBNAIL_URL)
       .setImage(getRandomGrottoBanner());
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
      await interaction.followUp({ embeds: [successEmbed] }).catch(() => {});
      if (false) {
       const endEmbed = await buildTestingEndAfterGrottoEmbed(party, expeditionId, character.name);
       await interaction.followUp({ embeds: [endEmbed] }).catch(() => {});
      }
      return;
     }
     if (newSuccesses === TARGET_SUCCESSES_PHASE1 && (grotto.targetPracticeState.phase || 1) === 1) {
      grotto.targetPracticeState.phase = 2;
      grotto.markModified("targetPracticeState");
      await grotto.save();
      const outcome = getSuccessOutcome();
      const flavor = outcome.flavor.replace(/\{char\}/g, character.name) + getTargetPracticeGearFlavor(character, "hit");
      const phase2HitPct = Math.round((Math.max(0.05, BASE_FAIL_PHASE2 - 0) + Math.max(0.10, BASE_MISS_PHASE2 - 0)) * 100);
      const progressBar = "🎯 🎯 ○";
      const desc = `${flavor}\n\n**Roll:** ${rollPct}% (need over ${hitPct}% to hit)  *(−1 🟩 stamina)*\n\n**Progress:** ${progressBar}  (2/3 hits)\n\nThe blimp darts around—**Phase 2: Precision round!** One more hit required; the next shot needs **over ${phase2HitPct}%** to land.\n\n**Next:** **${party.characters[(characterIndex + 1) % party.characters.length]?.name ?? "—"}** — see **Commands** below.`;
      const phase2Embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Target Practice — Phase 2**")
       .setColor(getExploreOutcomeColor("grotto_target_success", regionColors[party.region] || "#00ff99"))
       .setDescription(desc)
       .setThumbnail(TARGET_PRACTICE_THUMBNAIL_URL)
       .setImage(getRandomGrottoBanner())
       .setFooter({ text: "Phase 2: Precision — need higher roll to hit. Each shot costs 1 🟩 stamina." });
      const nextCharPhase2 = party.characters[(characterIndex + 1) % party.characters.length];
      addExplorationStandardFields(phase2Embed, {
       party,
       expeditionId,
       location,
       nextCharacter: nextCharPhase2 ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: cmdTargetPractice,
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
       compactGrottoCommands: true,
      });
      await interaction.editReply({ embeds: [phase2Embed] });
      if (getExplorationNextTurnContent(nextCharPhase2)) await interaction.followUp({ content: getExplorationNextTurnContent(nextCharPhase2) }).catch(() => {});
      return;
     }
     await grotto.save();
     const nextIdx = (characterIndex + 1) % party.characters.length;
     const nextChar = party.characters[nextIdx];
     const outcome = getSuccessOutcome();
     const flavor = outcome.flavor.replace(/\{char\}/g, character.name) + getTargetPracticeGearFlavor(character, "hit");
     const progressBar = Array(TARGET_SUCCESSES).fill(0).map((_, i) => (i < newSuccesses ? "🎯" : "○")).join(" ");
     const phaseNote = (grotto.targetPracticeState.phase || 1) === 2 ? " **(Phase 2: precision)**" : "";
     const desc = `${flavor}\n\n**Roll:** ${rollPct}% (need over ${hitPct}% to hit)  *(−1 🟩 stamina)*\n\n**Progress:** ${progressBar}  (${newSuccesses}/${TARGET_SUCCESSES} hits)${phaseNote}\n\n**Next:** **${nextChar?.name ?? "—"}** — see **Commands** below.`;
     const embed = new EmbedBuilder()
      .setTitle("🗺️ **Grotto: Target Practice**")
      .setColor(getExploreOutcomeColor("grotto_target_success", regionColors[party.region] || "#00ff99"))
      .setDescription(desc)
      .setThumbnail(TARGET_PRACTICE_THUMBNAIL_URL)
      .setImage(getRandomGrottoBanner())
      .setFooter({ text: "Each shot costs 1 🟩 stamina." });
     addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location,
      nextCharacter: nextChar ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasActiveGrotto: true,
      activeGrottoCommand: cmdTargetPractice,
      hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      compactGrottoCommands: true,
     });
     await interaction.editReply({ embeds: [embed] });
     if (getExplorationNextTurnContent(nextChar)) await interaction.followUp({ content: getExplorationNextTurnContent(nextChar) }).catch(() => {});
     return;
    }

    // Grotto puzzle: bot auto-approves/denies on submit (checkPuzzleOffer) and grants Spirit Orbs immediately when approved.
    // Dashboard PATCH grottos/[id]/puzzle is for staff override when offeringApproved was left null. "Continue" when already submitted only shows status (no double-grant).
    if (subcommand === "puzzle") {
     const grottoOption = interaction.options.getString("grotto");
     const grotto = await resolveGrottoAtLocation(squareId, quadrantId, expeditionId, grottoOption, true);
     if (!grotto || grotto.trialType !== "puzzle") {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **No Puzzle grotto**", "No Puzzle grotto at this location for this expedition.", { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     if (grotto.status === "cleared" || grotto.completedAt) {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("🗺️ **Grotto already cleared**", "This grotto has already been cleared.", { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     const puzzleAttempts = grotto.puzzleState?.offeringAttempts ?? 0;
     if (puzzleAttempts >= 3) {
      party.leftGrottoSquare = (party.square && String(party.square).trim()) || "";
      party.leftGrottoQuadrant = (party.quadrant && String(party.quadrant).trim()) || "";
      party.markModified("leftGrottoSquare");
      party.markModified("leftGrottoQuadrant");
      await party.save();
      const rollCmdId = getExploreCommandId();
      const leaveCmdId = getExploreCommandId();
      const noMoreBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
      const embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Puzzle — No More Attempts**")
       .setColor(getExploreOutcomeColor("grotto_puzzle_offering", regionColors[party.region] || "#00ff99"))
       .setDescription(
        "The party used all 3 attempts. The grotto is **not cleared** — it stays until someone submits the correct offering. Use </explore grotto leave:" + leaveCmdId + "> or </explore roll:" + rollCmdId + "> to leave. Come back later with </explore grotto continue> to get 3 more attempts."
       )
       .setImage(noMoreBanner?.imageUrl ?? getExploreMapImageUrl(party, { highlight: true }));
      addExplorationStandardFields(embed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      return interaction.editReply({ embeds: [embed], ...(noMoreBanner?.attachment ? { files: [noMoreBanner.attachment] } : {}) });
     }
     if (grotto.puzzleState.offeringSubmitted && grotto.puzzleState.offeringApproved === true) {
      const itemsStr = (grotto.puzzleState.offeringItems || []).join(", ");
      const rollCmdId = getExploreCommandId();
      const puzzleCompleteBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
      const embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Puzzle — Complete**")
       .setColor(getExploreOutcomeColor("grotto_puzzle_success", regionColors[party.region] || "#00ff99"))
       .setDescription(
        `An offering was already submitted (${itemsStr}) and approved. Everyone received a **Spirit Orb**. Use </explore roll:${rollCmdId}> to leave the grotto and continue exploring.`
       )
       .setImage(puzzleCompleteBanner?.imageUrl ?? getRandomGrottoBanner());
      addExplorationStandardFields(embed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      return interaction.editReply({ embeds: [embed], ...(puzzleCompleteBanner?.attachment ? { files: [puzzleCompleteBanner.attachment] } : {}) });
     }
     const itemsStr = interaction.options.getString("items");
     const parsedItems = parsePuzzleItems(itemsStr);
     if (!itemsStr?.trim() || parsedItems.length === 0) {
      const ensured = ensurePuzzleConfig(grotto);
      if (ensured !== grotto) {
       await ensured.save();
       Object.assign(grotto.puzzleState || {}, ensured.puzzleState);
      }
      const cmdId = getExploreCommandId();
      const flavor = getPuzzleFlavor(grotto, cmdId);
      const attemptsSoFar = grotto.puzzleState?.offeringAttempts ?? 0;
      const attemptsLeft = 3 - attemptsSoFar;
      let grottoDesc = flavor || `Discuss with your group. Determine what to offer and submit with </explore grotto puzzle:${cmdId}> (items). If correct, everyone gets Spirit Orbs.`;
      if (attemptsSoFar > 0 && attemptsLeft > 0) grottoDesc += `\n\n↳ Wrong attempts so far: **${attemptsSoFar}**. You have **${attemptsLeft}** attempt(s) left.`;
      const embed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Puzzle**")
       .setColor(getExploreOutcomeColor("grotto_puzzle_success", regionColors[party.region] || "#00ff99"))
       .setDescription(grottoDesc)
       .setImage(getRandomGrottoBanner());
      addExplorationStandardFields(embed, {
       party,
       expeditionId,
       location,
       nextCharacter: null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: `</explore grotto puzzle:${cmdId}>`,
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
       compactGrottoCommands: true,
       grottoPuzzleAnyoneCanSubmit: true,
      });
      return interaction.editReply({ embeds: [embed] });
     }
     // Validate: party must have each item in required quantity (in any character's inventory — NOT loadout)
     // Cannot transfer items between characters during expedition.
     let partyInv;
     try {
      partyInv = await getPartyWideInventory(party);
     } catch (err) {
      logger.warn("EXPLORE", `[explore.js]⚠️ Puzzle getPartyWideInventory failed: ${err?.message || err}`);
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Inventory error**", "Could not read party inventories. Try again or contact staff.", { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
    const checkResult = checkPuzzleOffer(grotto, parsedItems);
    // Use getPuzzleConsumeItems so we only take the required amount (e.g. Offering Statue = 1). When it returns empty (wrong item or type unknown), cap at 1 per item so we never over-consume.
    const capped = getPuzzleConsumeItems(grotto, parsedItems);
    const consumeItems = capped.length > 0
      ? capped
      : parsedItems.map((p) => ({ itemName: (p.itemName || "").trim(), quantity: Math.min(p.quantity || 1, 1) }));
     for (const { itemName, quantity } of consumeItems) {
      const key = itemName.trim().toLowerCase();
      const have = partyInv.totalByItem.get(key) || 0;
      if (have < quantity) {
       return interaction.editReply({
        embeds: [createExplorationErrorEmbed("❌ **Not enough items**", `Your party doesn't have enough **${itemName}** in anyone's inventory. ${checkResult.approved ? `The puzzle requires ${quantity}` : `You offered ${quantity}`} but the party has ${have} total. Items must be in a character's inventory (not loadout); no transfers during expedition.`, { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })],
       });
      }
     }
     // Allocate removals: submitter first, then others. No transfer — deduct from whoever has it.
     const submitterIndex = party.characters.findIndex((c) => c._id && c._id.toString() === character._id.toString());
     const orderedSlots = submitterIndex >= 0
      ? [party.characters[submitterIndex], ...party.characters.filter((_, i) => i !== submitterIndex)]
      : party.characters;
     const toRemove = [];
     for (const { itemName, quantity: need } of consumeItems) {
      let remaining = need;
      const key = itemName.trim().toLowerCase();
      for (const pc of orderedSlots) {
       if (remaining <= 0) break;
       const sq = partyInv.slotQuantities.find((s) => s.slot._id.toString() === pc._id.toString());
       if (!sq) continue;
       const charHave = sq.quantities.get(key) || 0;
       if (charHave <= 0) continue;
       const take = Math.min(remaining, charHave);
       if (take > 0) {
        const canonicalName = sq.names.get(key) || itemName;
        toRemove.push({ characterId: pc._id, itemName: canonicalName, quantity: take });
        remaining -= take;
       }
      }
     }
      if (!false) {
       try {
        for (const { characterId, itemName, quantity } of toRemove) {
         await removeItemInventoryDatabase(characterId, itemName, quantity, interaction, "Grotto puzzle offering");
        }
      } catch (err) {
       handleInteractionError(err, interaction, { source: "explore.js grotto puzzle removeItem" });
       return interaction.editReply({
         embeds: [createExplorationErrorEmbed("❌ **Inventory error**", `Could not remove one or more items from party inventories. ${err?.message || err}. If items were partially consumed, contact staff.`, { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })],
       }).catch(() => {});
      }
     }
     const displayItems = consumeItems.map((p) => (p.quantity > 1 ? `${p.itemName} x${p.quantity}` : p.itemName));
     if (checkResult.approved) {
      grotto.puzzleState.offeringSubmitted = true;
      grotto.puzzleState.offeringApproved = true;
      grotto.puzzleState.offeringItems = displayItems;
      grotto.puzzleState.offeringBy = character.name;
      grotto.puzzleState.offeredAt = new Date();
      await markGrottoCleared(grotto);
      restorePartyPoolOnGrottoExit(party);
      for (const slot of party.characters) {
       if (!false) {
        try {
         await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Puzzle");
        } catch (err) {
         logger.warn("EXPLORE", `[explore.js]⚠️ Grotto puzzle Spirit Orb add failed: ${err?.message || err}`);
        }
       }
      }
      if (!party.gatheredItems) party.gatheredItems = [];
      for (const slot of party.characters) {
       party.gatheredItems.push({ characterId: slot._id, characterName: slot.name, itemName: "Spirit Orb", quantity: 1, emoji: "💫" });
      }
      party.markModified("gatheredItems");
      pushProgressLog(party, character.name, "grotto_puzzle_success", "Puzzle approved. Each party member received a Spirit Orb.", undefined, undefined, new Date());
     }
     const wrongAttempts = (grotto.puzzleState?.offeringAttempts ?? 0) + (checkResult.approved ? 0 : 1);
     if (!checkResult.approved) {
      grotto.puzzleState.offeringAttempts = wrongAttempts;
      grotto.puzzleState.offeringItems = displayItems;
      grotto.puzzleState.offeringBy = character.name;
      grotto.puzzleState.offeredAt = new Date();
     }
     pushProgressLog(party, character.name, "grotto_puzzle_offering", `Puzzle offering submitted: ${displayItems.join(", ")}. ${checkResult.approved ? "Approved." : "Denied."}`, undefined, undefined, new Date());
     await grotto.save();
     await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
     if (checkResult.approved) {
      const flavor = getRandomPuzzleSuccessFlavor();
      const rollCmdId = getExploreCommandId();
      const puzzleSuccessBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
      const successEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Puzzle — Correct!**")
       .setColor(getExploreOutcomeColor("grotto_puzzle_success", regionColors[party.region] || "#00ff99"))
       .setDescription(
        `**${character.name}** submitted an offering: **${displayItems.join(", ")}**\n\n**Correct!** ${flavor}\n\n${GROTTO_CLEARED_FLAVOR}\n\nGrotto **cleared**. Each party member received a **Spirit Orb** 💫. Use </explore roll:${rollCmdId}> to leave and continue exploring.`
       )
       .setImage(puzzleSuccessBanner.imageUrl)
       .setThumbnail(GROTTO_CLEARED_THUMBNAIL_URL);
      addExplorationStandardFields(successEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      await interaction.editReply({ embeds: [successEmbed], ...(puzzleSuccessBanner.attachment ? { files: [puzzleSuccessBanner.attachment] } : {}) });
      if (false) {
       const endEmbed = await buildTestingEndAfterGrottoEmbed(party, expeditionId, character.name);
       await interaction.followUp({ embeds: [endEmbed] }).catch(() => {});
      }
      return;
     }
     const puzzleDeniedBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
     const cmdIdDenied = getExploreCommandId();
     const attemptsLeft = 3 - wrongAttempts;
     if (wrongAttempts >= 3) {
      party.leftGrottoSquare = (party.square && String(party.square).trim()) || "";
      party.leftGrottoQuadrant = (party.quadrant && String(party.quadrant).trim()) || "";
      party.markModified("leftGrottoSquare");
      party.markModified("leftGrottoQuadrant");
      await party.save();
      const leaveCmdId = getExploreCommandId();
      return interaction.editReply({
       embeds: [
        new EmbedBuilder()
         .setTitle("🗺️ **Grotto: Puzzle — No More Attempts**")
         .setColor(getExploreOutcomeColor("grotto_puzzle_offering", regionColors[party.region] || "#00ff99"))
         .setDescription(
          `**${character.name}** submitted an offering: **${displayItems.join(", ")}**\n\nThe offering was not correct. Items are consumed. **No attempts remaining.** The grotto is **not cleared** — it stays until someone submits the correct offering. Use </explore grotto leave:${leaveCmdId}> or </explore roll:${cmdIdDenied}> to leave. Come back later with </explore grotto continue> to get 3 more attempts.`
         )
         .setImage(puzzleDeniedBanner.imageUrl),
       ],
       ...(puzzleDeniedBanner.attachment ? { files: [puzzleDeniedBanner.attachment] } : {}),
      });
     }
     const wrongDescBase = `**${character.name}** submitted an offering: **${displayItems.join(", ")}**\n\nThe offering was not correct. Items are consumed. You have **${attemptsLeft}** attempt(s) left. Try again with </explore grotto puzzle:${cmdIdDenied}> (items), or use </explore grotto leave:${cmdIdDenied}> to leave and come back later (no more items consumed).`;
    const newClueText = getOfferingStatueClueText(grotto);
    const wrongDesc = newClueText
      ? `${wrongDescBase}\n\n*The statue shifts; new writing appears:*\n*${newClueText}*`
      : wrongDescBase;
    const tryAgainEmbed = new EmbedBuilder()
      .setTitle("🗺️ **Grotto: Puzzle — Wrong Offering**")
      .setColor(getExploreOutcomeColor("grotto_puzzle_offering", regionColors[party.region] || "#00ff99"))
      .setDescription(wrongDesc)
      .setImage(puzzleDeniedBanner.imageUrl);
     addExplorationStandardFields(tryAgainEmbed, {
      party,
      expeditionId,
      location,
      nextCharacter: null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasActiveGrotto: true,
      activeGrottoCommand: `</explore grotto puzzle:${cmdIdDenied}>`,
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      compactGrottoCommands: true,
      grottoPuzzleAnyoneCanSubmit: true,
     });
     return interaction.editReply({
      embeds: [tryAgainEmbed],
      ...(puzzleDeniedBanner.attachment ? { files: [puzzleDeniedBanner.attachment] } : {}),
     });
    }

    if (subcommand === "maze") {
     const mazeCmdId = getExploreCommandId();
     const grottoOption = interaction.options.getString("grotto");
     const grotto = await resolveGrottoAtLocation(squareId, quadrantId, expeditionId, grottoOption);
     if (!grotto || grotto.trialType !== "maze") {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **No Maze grotto**", "No Maze grotto at this location for this expedition.", { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     const characterIndex = party.characters.findIndex((c) => c.name === characterName);
     if (characterIndex === -1) return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Not in expedition**", "Your character is not part of this expedition.", { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     const layout = grotto.mazeState?.layout;
     let hasLayout = layout && layout.pathCells && layout.pathCells.length > 0 && layout.matrix && layout.matrix.length > 0;
     let layoutJustCreated = false;
     if (!hasLayout) {
      const generated = generateGrottoMaze({ width: 5, height: 5, entryType: 'diagonal' });
      if (!generated.pathCells || generated.pathCells.length === 0) {
       return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Maze error**", "Failed to generate the maze. Please try again.", { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
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
      let bypassMazeFiles = [];
      let bypassMazeImg = getExploreMapImageUrl(party, { highlight: true });
      try {
       const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: grotto.mazeState.currentNode, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
       bypassMazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
       bypassMazeImg = "attachment://maze.png";
      } catch (err) {
       logger.warn("EXPLORE", `[explore.js]⚠️ Maze render (bypass): ${err?.message || err}`);
      }
      const bypassEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Maze**")
       .setColor(getMazeEmbedColor(null, regionColors[party.region]))
       .setDescription("Someone in your party has a **Lens of Truth** in their inventory. You may bypass the maze for immediate Spirit Orbs (forgoing chests), or enter the maze as normal.")
       .setImage(bypassMazeImg);
      addExplorationStandardFields(bypassEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: false, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party), compactGrottoCommands: true });
      if (bypassMazeFiles.length) bypassEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
      const bypassMsg = await interaction.editReply({ embeds: [bypassEmbed], components: [bypassRow], files: bypassMazeFiles.length ? bypassMazeFiles : undefined });
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
         restorePartyPoolOnGrottoExit(freshParty);
         for (const slot of freshParty.characters) {
          if (slot._id && !false) {
           try {
            await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, i, "Grotto - Maze (Lens of Truth bypass)");
           } catch (err) {
            logger.warn("EXPLORE", `[explore.js]⚠️ Grotto maze bypass Spirit Orb: ${err?.message || err}`);
           }
          }
         }
         if (!freshParty.gatheredItems) freshParty.gatheredItems = [];
         for (const slot of freshParty.characters) {
          freshParty.gatheredItems.push({ characterId: slot._id, characterName: slot.name, itemName: "Spirit Orb", quantity: 1, emoji: "💫" });
         }
         freshParty.markModified("gatheredItems");
         pushProgressLog(freshParty, character.name, "grotto_maze_success", "Maze bypassed with Lens of Truth. Each party member received a Spirit Orb.", undefined, undefined, new Date());
         await freshParty.save(); // Always persist so dashboard shows current hearts/stamina/progress
         const rollCmdId = getExploreCommandId();
         const bypassClearedBanner = await generateGrottoBannerOverlay(freshParty, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
         const doneEmbed = new EmbedBuilder()
          .setTitle("🗺️ **Grotto: Maze — Bypassed**")
          .setColor(getMazeEmbedColor('bypassed', regionColors[freshParty.region]))
          .setDescription(`Your party used the **Lens of Truth** to see through the maze.\n\n${GROTTO_CLEARED_FLAVOR}\n\nGrotto **cleared**. Each party member received a **Spirit Orb** 💫. Use </explore roll:${rollCmdId}> to leave and continue exploring.`)
          .setImage(bypassClearedBanner.imageUrl)
          .setThumbnail(GROTTO_CLEARED_THUMBNAIL_URL);
         doneEmbed.setDescription(`Your party used the **Lens of Truth** to see through the maze.\n\n${GROTTO_CLEARED_FLAVOR}\n\nGrotto **cleared**. Each party member received a **Spirit Orb** 💫. Use </explore roll:${rollCmdId}> to leave and continue exploring.`);
         addExplorationStandardFields(doneEmbed, { party: freshParty, expeditionId, location: `${freshParty.square} ${freshParty.quadrant}`, nextCharacter: freshParty.characters[freshParty.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: false, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(freshParty) });
         await i.editReply({ embeds: [doneEmbed], components: [disabledRow], ...(bypassClearedBanner.attachment ? { files: [bypassClearedBanner.attachment] } : {}) }).catch(() => {});
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
         logger.warn("EXPLORE", `[explore.js]⚠️ Maze render failed: ${err?.message || err}`);
         enterEmbed.setImage(getExploreMapImageUrl(party, { highlight: true }));
        }
        addExplorationStandardFields(enterEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party), compactGrottoCommands: true });
        await i.editReply({ embeds: [enterEmbed], components: [disabledRow], files: enterFiles }).catch(() => {});
        const firstUp = party.characters[party.currentTurn] ?? null;
        if (getExplorationNextTurnContent(firstUp)) await i.followUp({ content: getExplorationNextTurnContent(firstUp) }).catch(() => {});
       }
       bypassCollector.stop();
      });
      bypassCollector.on("end", (collected, reason) => {
       if (collected.size === 0 && reason === "time") {
        const timeoutRow = new ActionRowBuilder().addComponents(
         new ButtonBuilder().setCustomId(`grotto_maze_bypass_yes|${expeditionId}|${grotto._id}`).setLabel("Bypass maze (Lens of Truth)").setStyle(ButtonStyle.Primary).setDisabled(true),
         new ButtonBuilder().setCustomId(`grotto_maze_bypass_no|${expeditionId}|${grotto._id}`).setLabel("Enter the maze").setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        disableMessageButtonsOnTimeout(bypassMsg, timeoutRow);
       }
      });
      return;
     }
     let action = (interaction.options.getString("action") || "").trim().toLowerCase();
     // Accept display format from dropdown (e.g. "→ east", "↑ north") by stripping arrow prefix
     const arrowPrefix = /^[↑↓←→]\s*/;
     if (arrowPrefix.test(action)) action = action.replace(arrowPrefix, "").trim();
     const validMazeActions = ["north", "south", "east", "west", "wall"];
     if (!validMazeActions.includes(action)) {
      const invalidActionEmbed = new EmbedBuilder()
       .setTitle("❌ **Invalid maze action**")
       .setColor(0xe74c3c)
       .setDescription("Please use the command and choose **North**, **East**, **South**, **West**, or **Song of Scrying (at wall)** from the action dropdown.");
      return interaction.editReply({ embeds: [invalidActionEmbed] });
     }
     if (action && party.currentTurn !== characterIndex) {
      const nextChar = party.characters[party.currentTurn];
      const notYourTurnEmbed = new EmbedBuilder()
       .setTitle("⏳ Not Your Turn")
       .setColor(NOT_YOUR_TURN_COLOR)
       .setDescription(`It's not your turn. **${nextChar?.name || "Next"}** is up. Use </explore grotto maze:${mazeCmdId}> when it's your turn.`)
       .setImage(NOT_YOUR_TURN_BORDER_URL);
      addExplorationStandardFields(notYourTurnEmbed, { party, expeditionId, location, nextCharacter: nextChar ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party), compactGrottoCommands: true });
      return interaction.editReply({ embeds: [notYourTurnEmbed] });
     }
     const matrix = grotto.mazeState.layout?.matrix || [];
     const pathCells = grotto.mazeState.layout?.pathCells || [];
     const currentNode = grotto.mazeState.currentNode || '';
     const facing = grotto.mazeState.facing || 's';

     let mazeFiles = [];
     let mazeImg = getExploreMapImageUrl(party, { highlight: true });
     if (grotto.mazeState?.layout) {
      try {
       const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: grotto.mazeState.currentNode, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
       mazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
       mazeImg = "attachment://maze.png";
      } catch (e) {
       logger.warn("EXPLORE", `[explore.js]⚠️ Maze render: ${e?.message}`);
      }
     }
     const mazeFirstEntryFlavor = layoutJustCreated ? getRandomMazeEntryFlavor() : null;

     if (action === "wall") {
      const [cx, cy] = (currentNode || '').split(',').map((n) => parseInt(n, 10));
      const currentCell = pathCells?.length && !isNaN(cx) && !isNaN(cy) ? getPathCellAt(pathCells, cx, cy) : null;
      const usedScryingWalls = grotto.mazeState?.usedScryingWalls || [];
      const scryingWallAlreadyUsed = currentCell && (currentCell.type === 'mazep' || currentCell.type === 'mazen') && usedScryingWalls.includes(currentNode);
      const isMazepCell = currentCell && (currentCell.type === 'mazep' || currentCell.type === 'mazen') && !scryingWallAlreadyUsed;

      if (!currentCell || currentCell.type !== 'mazep' && currentCell.type !== 'mazen') {
       const notOnWallEmbed = new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Maze**")
        .setColor(getMazeEmbedColor('blocked', regionColors[party.region]))
        .setDescription(`You must be **standing on a red cell** to use Song of Scrying. Move to a red cell first, then use the action.`)
        .setImage(mazeImg);
       addExplorationStandardFields(notOnWallEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party), compactGrottoCommands: true });
       if (mazeFiles.length) notOnWallEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
       return interaction.editReply({ embeds: [notOnWallEmbed], files: mazeFiles });
      }
      if (scryingWallAlreadyUsed) {
       const alreadyUsedEmbed = new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Maze**")
        .setColor(getMazeEmbedColor('blocked', regionColors[party.region]))
        .setDescription(`You've already used the Song of Scrying at this wall. Move on or try another direction.`)
        .setImage(mazeImg);
       addExplorationStandardFields(alreadyUsedEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party), compactGrottoCommands: true });
       if (mazeFiles.length) alreadyUsedEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
       return interaction.editReply({ embeds: [alreadyUsedEmbed], files: mazeFiles });
      }

      let outcome;
      let rollLabel = '';
      if (isMazepCell) {
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
      if (outcome.heartsLost > 0) {
       party.totalHearts = Math.max(0, (party.totalHearts ?? 0) - outcome.heartsLost);
       party.markModified("totalHearts");
       await party.save();
       
       // Check if party is KO'd after losing hearts in maze
       if ((party.totalHearts ?? 0) <= 0) {
        pushProgressLog(party, character.name, "ko", `Party KO'd after losing ${outcome.heartsLost} heart(s) in grotto maze.`, undefined, { heartsLost: outcome.heartsLost });
        await party.save();
        await handleExpeditionFailed(party, interaction);
        return;
       }
      }
      if (outcome.staminaCost > 0) {
       const payResult = await payStaminaOrStruggle(party, party.currentTurn, outcome.staminaCost, { action: "grotto_maze" });
       if (!payResult.ok) {
        return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Not enough stamina or hearts**", `Not enough stamina or hearts for maze cost (${outcome.staminaCost}). Party has ${party.totalStamina ?? 0} 🟩 and ${party.totalHearts ?? 0} ❤.`, { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
       }
       
       // Check if party is KO'd after paying (hearts reached 0 via struggle)
       if ((party.totalHearts ?? 0) <= 0 && payResult.heartsPaid > 0) {
        pushProgressLog(party, character.name, "ko", `Party KO'd after paying ${payResult.heartsPaid} heart(s) in grotto maze (struggle mode).`, undefined, { heartsLost: payResult.heartsPaid });
        await party.save();
        await handleExpeditionFailed(party, interaction);
        return;
       }
      }
      if (outcome.type === 'faster_path_open') {
       // Only when the wall is cleared: open it and mark it used (scrying wall only "does something" when cleared)
       const usedWalls = grotto.mazeState.usedScryingWalls || [];
       if (!usedWalls.includes(currentNode)) {
        grotto.mazeState.usedScryingWalls = [...usedWalls, currentNode];
        grotto.markModified("mazeState.usedScryingWalls");
       }
       removeScryingWall(matrix, cx, cy, facing);
       grotto.markModified("mazeState.layout.matrix");
       await grotto.save();
       try {
        const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: grotto.mazeState.currentNode, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
        mazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
        mazeImg = "attachment://maze.png";
       } catch (e) {}
       postGrottoMazeModVersion(interaction.client, grotto.mazeState.layout, grotto.mazeState.currentNode, grotto.name || "Grotto", expeditionId, location, grotto.mazeState, { descriptionOverride: "Scrying wall was used! Here's the updated map." });
      }
      if (outcome.type === 'collapse') {
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
         restorePartyPoolOnGrottoExit(party);
         for (const slot of party.characters) {
          if (!false) {
           try {
            await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Maze");
           } catch (err) {
            logger.warn("EXPLORE", `[explore.js]⚠️ Grotto maze exit Spirit Orb: ${err?.message || err}`);
           }
          }
         }
         if (!party.gatheredItems) party.gatheredItems = [];
         for (const slot of party.characters) {
          party.gatheredItems.push({ characterId: slot._id, characterName: slot.name, itemName: "Spirit Orb", quantity: 1, emoji: "💫" });
         }
         party.markModified("gatheredItems");
         pushProgressLog(party, character.name, "grotto_maze_success", "Maze trial complete. Each party member received a Spirit Orb.", undefined, undefined, new Date());
         party.currentTurn = (party.currentTurn + 1) % party.characters.length;
         party.markModified("currentTurn");
         await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
         try {
          const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "mod", currentNode: newKey, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
          mazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
          mazeImg = "attachment://maze.png";
         } catch (e) {}
         const nextCharExit = party.characters[party.currentTurn] ?? null;
         const exitDesc = (mazeFirstEntryFlavor ? mazeFirstEntryFlavor + "\n\n" : "") + outcome.flavor + "\n\n**Exit!**\n\n";
         const clearedSuffix = `${GROTTO_CLEARED_FLAVOR}\n\nGrotto **cleared**. Each party member received a **Spirit Orb** 💫. Use **roll** or **item** below to continue.`;
         const exitEmbed = new EmbedBuilder()
          .setTitle("🗺️ **Grotto: Maze — Exit!**")
          .setColor(getMazeEmbedColor('exit', regionColors[party.region]))
          .setDescription(exitDesc + clearedSuffix)
          .setImage(mazeImg)
          .setThumbnail(GROTTO_CLEARED_THUMBNAIL_URL);
         addExplorationStandardFields(exitEmbed, {
          party,
          expeditionId,
          location,
          nextCharacter: nextCharExit,
          showNextAndCommands: true,
          showRestSecureMove: false,
          hasActiveGrotto: false,
          grottoExitCommands: true,
          hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
          hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
         });
         if (mazeFiles.length) exitEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
         await interaction.editReply({ embeds: [exitEmbed], files: mazeFiles });
         if (getExplorationNextTurnContent(nextCharExit)) {
          await interaction.followUp({ content: getExplorationNextTurnContent(nextCharExit) }).catch(() => {});
         }
         return;
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
      // Maze battles: tier 4 and below only, inline encounter (no raid)
      if (outcome.type === 'battle' && outcome.battle) {
       const regionMonsters = await getMonstersByRegion(party.region?.toLowerCase());
       const tier4AndBelow = regionMonsters && regionMonsters.filter((m) => m.tier >= 1 && m.tier <= 4);
       const monster = (tier4AndBelow && tier4AndBelow.length > 0)
        ? tier4AndBelow[Math.floor(Math.random() * tier4AndBelow.length)]
        : null;
       if (monster) {
        const diceRoll = Math.floor(Math.random() * 100) + 1;
        const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character, diceRoll);
        const encounterOutcome = await getEncounterOutcome(
         character,
         monster,
         damageValue,
         adjustedRandomValue,
         attackSuccess,
         defenseSuccess,
         usePartyOnlyForHeartsStamina(party) ? { skipPersist: true } : {}
        );
        if (encounterOutcome.hearts > 0) {
         party.totalHearts = Math.max(0, (party.totalHearts ?? 0) - encounterOutcome.hearts);
         party.markModified("totalHearts");
        }
        let lootedItem = null;
        if (encounterOutcome.canLoot) {
         const items = await fetchItemsByMonster(monster.name);
         const rawItem = items.length > 0 ? items[Math.floor(Math.random() * items.length)] : null;
         lootedItem = await resolveExplorationMonsterLoot(monster.name, rawItem);
         if (lootedItem && !false) {
          try {
           await addItemInventoryDatabase(character._id, lootedItem.itemName, lootedItem.quantity ?? 1, interaction, "Grotto - Maze (Song of Scrying)");
          } catch (err) {
           logger.warn("EXPLORE", `[explore.js] Grotto maze scrying loot: ${err?.message || err}`);
          }
          if (!party.gatheredItems) party.gatheredItems = [];
          party.gatheredItems.push({ characterId: character._id?.toString?.() ?? String(character._id), characterName: character.name, itemName: lootedItem.itemName, quantity: lootedItem.quantity ?? 1, emoji: lootedItem.emoji ?? "" });
          party.markModified("gatheredItems");
         }
        }
        pushProgressLog(party, character.name, "grotto_maze_raid", `Song of Scrying: fought ${monster.name}. ${encounterOutcome.result}.${encounterOutcome.hearts > 0 ? ` Lost ${encounterOutcome.hearts} heart(s).` : ""}${encounterOutcome.canLoot ? " Got loot." : ""}`, lootedItem ? { itemName: lootedItem.itemName, emoji: lootedItem.emoji } : undefined, encounterOutcome.hearts > 0 ? { heartsLost: encounterOutcome.hearts } : undefined, new Date());
        party.currentTurn = (party.currentTurn + 1) % party.characters.length;
        party.markModified("currentTurn");
        await party.save();
        if ((party.totalHearts ?? 0) <= 0) {
         pushProgressLog(party, character.name, "ko", `Party KO'd after Song of Scrying battle in grotto maze.`, undefined, { heartsLost: encounterOutcome.hearts });
         await party.save();
         await handleExpeditionFailed(party, interaction);
         return;
        }
        const battleResultLine = encounterOutcome.hearts > 0
         ? `You fought a **${monster.name}** — ${encounterOutcome.result}. Lost ${encounterOutcome.hearts} heart(s).${lootedItem ? ` Found ${lootedItem.emoji ?? ""} **${lootedItem.itemName}**!` : ""}`
         : `You fought a **${monster.name}** — ${encounterOutcome.result}.${lootedItem ? ` Found ${lootedItem.emoji ?? ""} **${lootedItem.itemName}**!` : ""}`;
        wallRaidError = null;
        const nextCharScryingBattle = party.characters[party.currentTurn] ?? null;
        const ctaHintBattle = (outcome.ctaHint || "").replace(/<\/explore grotto maze>/g, `</explore grotto maze:${mazeCmdId}>`);
        const descBattle = `${mazeFirstEntryFlavor ? mazeFirstEntryFlavor + "\n\n" : ""}**${character.name}** sings the sequence on the wall...${rollLabel}\n\n**❌ Result: Failure** — The song didn't open the wall.\n\n${outcome.flavor}\n\n${battleResultLine}\n\n↳ **${ctaHintBattle}**`;
        const mazeEmbedBattle = new EmbedBuilder()
         .setTitle("🗺️ **Grotto: Maze — Song of Scrying**")
         .setColor(getMazeEmbedColor('battle', regionColors[party.region]))
         .setDescription(descBattle)
         .setImage(mazeImg);
        addExplorationStandardFields(mazeEmbedBattle, {
         party,
         expeditionId,
         location,
         nextCharacter: nextCharScryingBattle,
         showNextAndCommands: true,
         showRestSecureMove: false,
         hasActiveGrotto: true,
         activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto),
         hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
         compactGrottoCommands: true,
        });
        if (mazeFiles.length) mazeEmbedBattle.setFooter({ text: GROTTO_MAZE_LEGEND });
        await interaction.editReply({ embeds: [mazeEmbedBattle], files: mazeFiles });
        if (getExplorationNextTurnContent(nextCharScryingBattle)) await interaction.followUp({ content: getExplorationNextTurnContent(nextCharScryingBattle) }).catch(() => {});
        return;
       }
       wallRaidError = "No tier 1–4 monsters in region; continue exploring.";
      }
      const ctaHint = (outcome.ctaHint || "").replace(/<\/explore grotto maze>/g, `</explore grotto maze:${mazeCmdId}>`);
      const scryingResultLine = outcome.type === "faster_path_open"
        ? "**✅ Result: Success** — The wall and surrounding walls open up—a faster path is revealed!"
        : "**❌ Result: Failure** — The song didn't open the wall.";
      let desc = `${mazeFirstEntryFlavor ? mazeFirstEntryFlavor + "\n\n" : ""}**${character.name}** sings the sequence on the wall...${rollLabel}\n\n${scryingResultLine}\n\n${outcome.flavor}\n\n↳ **${ctaHint}**`;
      if (wallRaidError) desc += `\n\n⏰ **${wallRaidError}**`;
      const scryingLogMsg = outcome.type === 'faster_path_open' ? 'Song of Scrying: faster path opened.' : outcome.type === 'pit_trap' ? 'Song of Scrying: pit trap (lost hearts and stamina).' : outcome.type === 'collapse' ? 'Song of Scrying: passage collapsed, emerged on other side.' : outcome.type === 'step_back' ? 'Song of Scrying: stepped back.' : outcome.type === 'stalagmites' ? 'Song of Scrying: stalagmites fell (stamina cost).' : outcome.type === 'nothing' ? 'Song of Scrying: nothing happened.' : outcome.type === 'battle' ? `Song of Scrying: ${outcome.battle?.monsterLabel || 'construct'} appeared.` : 'Song of Scrying.';
      if (outcome.type !== 'battle' || wallRaidError) {
       pushProgressLog(party, character.name, "grotto_maze_scrying", scryingLogMsg, undefined, (outcome.heartsLost > 0 || outcome.staminaCost > 0) ? { heartsLost: outcome.heartsLost || undefined, staminaLost: outcome.staminaCost || undefined } : undefined, new Date());
       await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
      }
      if (!raidIdForEmbed) {
       party.currentTurn = (party.currentTurn + 1) % party.characters.length;
       party.markModified("currentTurn");
       await party.save();
      }
      const nextCharScrying = party.characters[party.currentTurn] ?? null;
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
       nextCharacter: nextCharScrying,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
       compactGrottoCommands: true,
      });
      if (mazeFiles.length) mazeEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
      await interaction.editReply({ embeds: [mazeEmbed], files: mazeFiles });
      if (getExplorationNextTurnContent(nextCharScrying)) await interaction.followUp({ content: getExplorationNextTurnContent(nextCharScrying) }).catch(() => {});
      return;
     }

     const dir = action;
     const displayDir = dir && dir.length ? dir.charAt(0).toUpperCase() + dir.slice(1).toLowerCase() : dir;
     const [cx, cy] = (currentNode || '').split(',').map((n) => parseInt(n, 10));
     if (isNaN(cx) || isNaN(cy)) {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Invalid maze position**", `Maze position is invalid. Re-enter the grotto with </explore grotto continue:${mazeCmdId}> and try again.`, { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     const nextResult = getNeighbourCoords(matrix, cx, cy, dir, facing);
     const destInPath = nextResult && pathCells?.length ? getPathCellAt(pathCells, nextResult.x, nextResult.y) : null;
     if (!nextResult || (pathCells?.length && !destInPath)) {
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
       .setDescription(blockedDesc + `There's a wall to the **${getMazeDirectionArrow(dir)}${displayDir}** — you can't move that way. ${ctaText}`)
       .setImage(mazeImg);
      addExplorationStandardFields(blockedEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
       compactGrottoCommands: true,
      });
      if (mazeFiles.length) blockedEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
      return interaction.editReply({ embeds: [blockedEmbed], files: mazeFiles });
     }
     const nextKey = `${nextResult.x},${nextResult.y}`;
     grotto.mazeState.currentNode = nextKey;
     grotto.mazeState.facing = nextResult.facing;
     if (!grotto.mazeState.steps) grotto.mazeState.steps = [];
     grotto.mazeState.steps.push(nextKey);
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
      restorePartyPoolOnGrottoExit(party);
      for (const slot of party.characters) {
       if (!false) {
        try {
         await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Maze");
        } catch (err) {
         logger.warn("EXPLORE", `[explore.js]⚠️ Grotto maze exit Spirit Orb: ${err?.message || err}`);
        }
       }
      }
      if (!party.gatheredItems) party.gatheredItems = [];
      for (const slot of party.characters) {
       party.gatheredItems.push({ characterId: slot._id, characterName: slot.name, itemName: "Spirit Orb", quantity: 1, emoji: "💫" });
      }
      party.markModified("gatheredItems");
      pushProgressLog(party, character.name, "grotto_maze_success", "Maze trial complete. Each party member received a Spirit Orb.", undefined, undefined, new Date());
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      party.markModified("currentTurn");
      await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
      try {
       const exitMazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "mod", currentNode: nextKey, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
       mazeFiles = [new AttachmentBuilder(exitMazeBuf, { name: "maze.png" })];
       mazeImg = "attachment://maze.png";
      } catch (e) {}
      const nextCharExitMove = party.characters[party.currentTurn] ?? null;
      const exitDesc = mazeFirstEntryFlavor ? `${mazeFirstEntryFlavor}\n\n` : "";
      const clearedSuffixMove = `Party reached the exit!\n\n${GROTTO_CLEARED_FLAVOR}\n\nGrotto **cleared**. Each party member received a **Spirit Orb** 💫. Use **roll** or **item** below to continue.`;
      const exitEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Maze — Exit!**")
       .setColor(getMazeEmbedColor('exit', regionColors[party.region]))
       .setDescription(exitDesc + clearedSuffixMove)
       .setImage(mazeImg)
       .setThumbnail(GROTTO_CLEARED_THUMBNAIL_URL);
      addExplorationStandardFields(exitEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: nextCharExitMove,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: false,
       grottoExitCommands: true,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      if (mazeFiles.length) exitEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
      await interaction.editReply({ embeds: [exitEmbed], files: mazeFiles });
      if (getExplorationNextTurnContent(nextCharExitMove)) {
       await interaction.followUp({ content: getExplorationNextTurnContent(nextCharExitMove) }).catch(() => {});
      }
      return;
     }

     if (cellType === 'trap') {
      const triggered = grotto.mazeState.triggeredTraps || [];
      if (!triggered.includes(nextKey)) {
       grotto.mazeState.triggeredTraps = [...triggered, nextKey];
       const trapRoll = Math.floor(Math.random() * 6) + 1;
      const trapOutcome = getGrottoMazeTrapOutcome(trapRoll);
      if (trapOutcome.heartsLost > 0) {
       party.totalHearts = Math.max(0, (party.totalHearts ?? 0) - trapOutcome.heartsLost);
       party.markModified("totalHearts");
       await party.save();
       
       // Check if party is KO'd after losing hearts in trap
       if ((party.totalHearts ?? 0) <= 0) {
        pushProgressLog(party, character.name, "ko", `Party KO'd after losing ${trapOutcome.heartsLost} heart(s) in grotto maze trap.`, undefined, { heartsLost: trapOutcome.heartsLost });
        await party.save();
        await handleExpeditionFailed(party, interaction);
        return;
       }
      }
      if (trapOutcome.staminaCost > 0) {
       const payResult = await payStaminaOrStruggle(party, party.currentTurn, trapOutcome.staminaCost, { action: "grotto_maze_trap" });
       if (!payResult.ok) {
        return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Not enough stamina or hearts**", `Not enough stamina or hearts for trap cost (${trapOutcome.staminaCost}). Party has ${party.totalStamina ?? 0} 🟩 and ${party.totalHearts ?? 0} ❤.`, { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
       }
       
       // Check if party is KO'd after paying (hearts reached 0 via struggle)
       if ((party.totalHearts ?? 0) <= 0 && payResult.heartsPaid > 0) {
        pushProgressLog(party, character.name, "ko", `Party KO'd after paying ${payResult.heartsPaid} heart(s) in grotto maze trap (struggle mode).`, undefined, { heartsLost: payResult.heartsPaid });
        await party.save();
        await handleExpeditionFailed(party, interaction);
        return;
       }
      }
      const heartsLost = trapOutcome.heartsLost ?? 0;
      const staminaCost = trapOutcome.staminaCost ?? 0;
      pushProgressLog(party, character.name, "grotto_maze_trap", `Maze trap triggered (moved ${displayDir}): ${trapOutcome.flavor?.split(".")[0] || "trap"}.`, undefined, heartsLost > 0 || staminaCost > 0 ? { heartsLost: heartsLost || undefined, staminaLost: staminaCost || undefined } : undefined, new Date());
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      party.markModified("currentTurn");
      await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
      await grotto.save();
      const nextCharTrap = party.characters[party.currentTurn] ?? null;
      const trapDesc = `${mazeFirstEntryFlavor ? mazeFirstEntryFlavor + "\n\n" : ""}**Party moved** **${getMazeDirectionArrow(dir)}${displayDir}** and triggered a trap!\n\n${trapOutcome.flavor}`;
      const trapEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Grotto: Maze — Trap!**")
       .setColor(getMazeEmbedColor('trap', regionColors[party.region]))
       .setDescription(trapDesc)
       .setImage(mazeImg)
       .setThumbnail("https://ssb.wiki.gallery/images/d/d8/PitfallSSBU.png");
      addExplorationStandardFields(trapEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: nextCharTrap,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
       compactGrottoCommands: true,
      });
      if (mazeFiles.length) trapEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
      await interaction.editReply({ embeds: [trapEmbed], files: mazeFiles });
      if (getExplorationNextTurnContent(nextCharTrap)) await interaction.followUp({ content: getExplorationNextTurnContent(nextCharTrap) }).catch(() => {});
      return;
      }
     }

     if (cellType === 'chest') {
      const opened = grotto.mazeState.openedChests || [];
      if (!opened.includes(nextKey)) {
       grotto.mazeState.openedChests = [...opened, nextKey];
       const allItemsForChest = await fetchAllItems();
       const chestLoot = getGrottoMazeChestLoot(allItemsForChest);
       let givenItemName = chestLoot.itemName;
       let givenEmoji = chestLoot.emoji || "📦";
       if (!false) {
        for (const slot of party.characters || []) {
         try {
          await addItemInventoryDatabase(slot._id, givenItemName, 1, interaction, "Grotto - Maze chest");
         } catch (err) {
          logger.warn("EXPLORE", `[explore.js]⚠️ Grotto maze chest (${givenItemName}) for ${slot.name}: ${err?.message || err}`);
          try {
           await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Maze chest");
          } catch (fallbackErr) {
           logger.warn("EXPLORE", `[explore.js]⚠️ Grotto maze chest fallback for ${slot.name}: ${fallbackErr?.message || fallbackErr}`);
          }
         }
        }
       }
       if (!usePartyOnlyForHeartsStamina(party)) {
        for (const slot of party.characters || []) {
         const charDoc = await Character.findById(slot._id);
         if (charDoc && party.characters) {
          const idx = party.characters.findIndex((c) => c._id && c._id.toString() === slot._id.toString());
          if (idx !== -1) party.characters[idx] = { ...party.characters[idx], ...charDoc.toObject?.() || charDoc };
         }
        }
       }
       await grotto.save();
       if (!party.gatheredItems) party.gatheredItems = [];
       for (const slot of party.characters || []) {
        party.gatheredItems.push({ characterId: slot._id?.toString?.() ?? String(slot._id), characterName: slot.name, itemName: givenItemName, quantity: 1, emoji: givenEmoji });
       }
       party.markModified("gatheredItems");
       const memberNames = (party.characters || []).map((c) => c.name).filter(Boolean);
       pushProgressLog(party, character.name, "grotto_maze_chest", `Party opened a maze chest (moved ${displayDir}); each member received ${givenItemName}.`, { itemName: givenItemName, emoji: givenEmoji }, undefined, new Date());
       // When chest gives a map, DM each party member's owner to take it to the library
       if (/^Map #\d+$/.test(givenItemName) && interaction.client) {
        const seenUserIds = new Set();
        for (const slot of party.characters || []) {
         const uid = slot.userId || (await Character.findById(slot._id).then((c) => c?.userId).catch(() => null)) || (await ModCharacter.findById(slot._id).then((c) => c?.userId).catch(() => null));
         if (uid && !seenUserIds.has(uid)) {
          seenUserIds.add(uid);
          const mapDmEmbed = new EmbedBuilder()
           .setTitle("🗺️ Map from grotto maze!")
           .setDescription(`**${givenItemName}** was found in a grotto maze chest and saved to your party's haul.\n\nTake it to the **Inariko Library** to get it deciphered. Use \`/map list\` to see your map collection, then \`/map appraisal-request\` to submit it.`)
           .setThumbnail(OLD_MAP_ICON_URL)
           .setURL(OLD_MAPS_LINK)
           .setColor(0x2ecc71)
           .setFooter({ text: "Roots of the Wild • Old Maps" });
          try {
           const user = await interaction.client.users.fetch(uid).catch(() => null);
           if (user) await user.send({ embeds: [mapDmEmbed] }).catch(() => {});
          } catch (_) {}
         }
        }
       }
       party.currentTurn = (party.currentTurn + 1) % party.characters.length;
       party.markModified("currentTurn");
       await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
       const nextCharChest = party.characters[party.currentTurn] ?? null;
       const chestDesc = mazeFirstEntryFlavor ? `${mazeFirstEntryFlavor}\n\n` : "";
       const chestReceiveLine = memberNames.length > 0
        ? memberNames.map((n) => `**${n}** receives ${givenEmoji} **${givenItemName}**`).join("\n") + "."
        : `Each party member receives ${givenEmoji} **${givenItemName}** from the chest.`;
       const chestEmbed = new EmbedBuilder()
        .setTitle("🗺️ **Grotto: Maze — 📦 Treasure Chest!**")
        .setColor(getMazeEmbedColor('chest', regionColors[party.region]))
        .setDescription(
          chestDesc +
          `**📦 Chest found!** Party moved **${getMazeDirectionArrow(dir)}${displayDir}** and discovered a treasure chest!\n\n` +
          chestReceiveLine
        )
        .setThumbnail("https://static.wikia.nocookie.net/zelda_gamepedia_en/images/0/0f/MM3D_Chest.png/revision/latest/scale-to-width/360?cb=20201125233413")
        .setImage(mazeImg);
       addExplorationStandardFields(chestEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextCharChest,
        showNextAndCommands: true,
        showRestSecureMove: false,
        hasActiveGrotto: true,
        activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto),
        hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
        compactGrottoCommands: true,
      });
       if (mazeFiles.length) chestEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
       await interaction.editReply({ embeds: [chestEmbed], files: mazeFiles });
       if (getExplorationNextTurnContent(nextCharChest)) await interaction.followUp({ content: getExplorationNextTurnContent(nextCharChest) }).catch(() => {});
       return;
      }
     }

     if (cellType === 'mazep' || cellType === 'mazen') {
      const usedWalls = grotto.mazeState.usedScryingWalls || [];
      if (!usedWalls.includes(nextKey)) {
       pushProgressLog(party, character.name, "grotto_maze_scrying_wall", `Party encountered a Scrying Wall (moved ${displayDir}). Use Song of Scrying to interact.`, undefined, undefined, new Date());
       party.currentTurn = (party.currentTurn + 1) % party.characters.length;
       party.markModified("currentTurn");
       await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
       await grotto.save();
       const nextCharRed = party.characters[party.currentTurn] ?? null;
       const redDesc = mazeFirstEntryFlavor ? `${mazeFirstEntryFlavor}\n\n` : "";
       const redEmbed = new EmbedBuilder()
        .setTitle(`🗺️ **Grotto: Maze — Scrying Wall**`)
        .setColor(getMazeEmbedColor('scrying', regionColors[party.region]))
        .setDescription(
          redDesc +
          `Party moved **${getMazeDirectionArrow(dir)}${displayDir}** and came upon a **wall covered in ancient musical notes!** The runes pulse faintly, awaiting a melody.\n\n` +
          `↳ **Use action: Song of Scrying at a wall** to see what happens!\n` +
          `💡 *A party member with the Entertainer job has a 50% higher chance of success.*`
        )
        .setImage(mazeImg);
       addExplorationStandardFields(redEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextCharRed,
        showNextAndCommands: true,
        showRestSecureMove: false,
        hasActiveGrotto: true,
        activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto),
        hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
        compactGrottoCommands: true,
      });
       if (mazeFiles.length) redEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
       await interaction.editReply({ embeds: [redEmbed], files: mazeFiles });
       if (getExplorationNextTurnContent(nextCharRed)) await interaction.followUp({ content: getExplorationNextTurnContent(nextCharRed) }).catch(() => {});
       return;
      }
     }

     // Random move events (flavor, small gather, or monster) — not tied to marked cells
     let randomEventPart = '';
     let corridorGatherLoot = null; // when type === 'gather', pass to single move log
     const randomEvent = getGrottoMazeRandomMoveEvent();
     if (randomEvent.type === 'monster') {
      const regionMonsters = await getMonstersByRegion(party.region?.toLowerCase());
      const manageable = regionMonsters && regionMonsters.filter((m) => m.tier >= 1 && m.tier <= 4);
      const monster = manageable && manageable.length > 0 ? manageable[Math.floor(Math.random() * manageable.length)] : null;
      const monsterFlavor = monster ? `A **${monster.name}** blocks the way!` : null;
      // Only tier 5+ start raids; tier 1–4 in maze are treated as "something stirs" (no raid)
      if (monster && (monster.tier == null || monster.tier >= 5)) {
       const village = REGION_TO_VILLAGE[party.region?.toLowerCase()] || "Inariko";
       const raidResult = await triggerRaid(monster, interaction, village, false, character, false, expeditionId);
       if (raidResult && raidResult.success) {
        pushProgressLog(party, character.name, "grotto_maze_raid", `Random encounter: ${monster.name}. Raid started.`, undefined, undefined, new Date());
        await grotto.save();
        await party.save();
        const raidCta = `Use </raid:1470659276287774734> with the Raid ID above. When the monster is defeated, continue with </explore grotto maze:${mazeCmdId}>.`;
        const raidEmbed = new EmbedBuilder()
         .setTitle("🗺️ **Grotto: Maze — Random encounter!**")
         .setColor(getMazeEmbedColor('battle', regionColors[party.region]))
         .setDescription((mazeFirstEntryFlavor ? mazeFirstEntryFlavor + "\n\n" : "") + `**Party moved** **${getMazeDirectionArrow(dir)}${displayDir}**.\n\n${monsterFlavor}\n\n↳ ${raidCta}`)
         .setImage(mazeImg);
        addExplorationStandardFields(raidEmbed, { party, expeditionId, location, nextCharacter: character, showNextAndCommands: true, showRestSecureMove: false, hasActiveGrotto: true, activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party), compactGrottoCommands: true });
        if (mazeFiles.length) raidEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
        await interaction.editReply({ embeds: [raidEmbed], files: mazeFiles });
        return;
       }
       randomEventPart = `${monsterFlavor}\n\n⏰ **${raidResult?.error || "Raid could not be started."}**`;
       pushProgressLog(party, character.name, "grotto_maze_raid", `Random encounter: ${monster.name} appeared but raid could not start.`, undefined, undefined, new Date());
      } else if (monster) {
       randomEventPart = "Something stirs in the dark—but it doesn't emerge. You move on.";
      } else {
       randomEventPart = "Something stirs in the dark—but it doesn't emerge. You move on.";
      }
     } else if (randomEvent.type === 'gather') {
      // Same logic as explore roll "item": region-filtered items, rarity-weighted (FV 50)
      const allItemsForGather = await fetchAllItems();
      const regionKey = party.region?.toLowerCase() || "";
      const availableItems = allItemsForGather.filter((item) => item[regionKey]);
      const weightedList = availableItems.length > 0 ? createWeightedItemList(availableItems, 50) : [];
      const selectedItem = weightedList.length > 0
       ? weightedList[Math.floor(Math.random() * weightedList.length)]
       : availableItems.length > 0 ? availableItems[Math.floor(Math.random() * availableItems.length)] : null;
      let givenItemName = selectedItem?.itemName ?? "Fairy";
      let givenEmoji = selectedItem?.emoji ?? "🧚";
      if (!false) {
       try {
        await addItemInventoryDatabase(character._id, givenItemName, 1, interaction, "Grotto - Maze (corridor)");
       } catch (err) {
        logger.warn("EXPLORE", `[explore.js] Grotto maze corridor gather: ${err?.message || err}`);
        try {
         await addItemInventoryDatabase(character._id, "Fairy", 1, interaction, "Grotto - Maze (corridor)");
         givenItemName = "Fairy";
         givenEmoji = "🧚";
        } catch (e) {}
       }
      }
      if (!party.gatheredItems) party.gatheredItems = [];
      party.gatheredItems.push({ characterId: character._id?.toString?.() ?? String(character._id), characterName: character.name, itemName: givenItemName, quantity: 1, emoji: givenEmoji });
      party.markModified("gatheredItems");
      corridorGatherLoot = { itemName: givenItemName, emoji: givenEmoji };
      // Corridor find is logged once as grotto_maze_move below (message includes "Along the way, X finds ...")
      if (/^Map #\d+$/.test(givenItemName) && interaction.client) {
       const uid = character.userId || (await Character.findById(character._id).then((c) => c?.userId).catch(() => null)) || interaction.user?.id;
       if (uid) {
        const mapDmEmbed = new EmbedBuilder()
         .setTitle("🗺️ Map from grotto maze!")
         .setDescription(`**${character.name}** found **${givenItemName}** in the maze and it was added to their haul.\n\nTake it to the **Inariko Library** to get it deciphered. Use \`/map list\` to see your map collection, then \`/map appraisal-request\` to submit it.`)
         .setThumbnail(OLD_MAP_ICON_URL)
         .setURL(OLD_MAPS_LINK)
         .setColor(0x2ecc71)
         .setFooter({ text: "Roots of the Wild • Old Maps" });
        try {
         const user = await interaction.client.users.fetch(uid).catch(() => null);
         if (user) await user.send({ embeds: [mapDmEmbed] }).catch(() => {});
        } catch (_) {}
       }
      }
      randomEventPart = `Along the way, **${character.name}** finds ${givenEmoji} **${givenItemName}**!`;
     } else if (randomEvent.type === 'flavor') {
      randomEventPart = randomEvent.flavor;
     }

     await grotto.save();
     const dirArrow = getMazeDirectionArrow(dir);
     const moveLogMessage = randomEventPart
      ? `Party moved ${dirArrow}${displayDir}. ${String(randomEventPart).replace(/\*\*/g, "").trim()}`
      : `Party moved ${dirArrow}${displayDir}.`;
     pushProgressLog(party, character.name, "grotto_maze_move", moveLogMessage, corridorGatherLoot || undefined, undefined, new Date());
     party.currentTurn = (party.currentTurn + 1) % party.characters.length;
     party.markModified("currentTurn");
     await party.save();
     const nextCharMove = party.characters[party.currentTurn] ?? null;
     const moveLine = `**Party moved ${dirArrow}${displayDir}.**`;
     const flavorBlock = randomEventPart
      ? (randomEvent.type === "flavor"
        ? `\n\n*${String(randomEventPart).replace(/\*\*/g, "").trim()}*`
        : `\n\n${randomEventPart}`)
      : "";
     const moveDesc = mazeFirstEntryFlavor ? `${mazeFirstEntryFlavor}\n\n${moveLine}` : moveLine;
     const moveEmbed = new EmbedBuilder()
      .setTitle(`🗺️ **Grotto: Maze — Moved ${displayDir}**`)
      .setColor(getMazeEmbedColor(null, regionColors[party.region]))
      .setDescription(moveDesc + flavorBlock)
      .setImage(mazeImg);
    addExplorationStandardFields(moveEmbed, {
       party,
       expeditionId,
       location,
       nextCharacter: nextCharMove,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: getMazeActiveGrottoCommand(mazeCmdId, grotto),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
       compactGrottoCommands: true,
      });
     if (mazeFiles.length) moveEmbed.setFooter({ text: GROTTO_MAZE_LEGEND });
     await interaction.editReply({ embeds: [moveEmbed], files: mazeFiles });
     if (getExplorationNextTurnContent(nextCharMove)) await interaction.followUp({ content: getExplorationNextTurnContent(nextCharMove) }).catch(() => {});
     return;
    }

    if (subcommand === "travel") {
     const locationStr = interaction.options.getString("location");
     const match = (locationStr || "").match(/^([A-Ja-j](?:[1-9]|1[0-2]))\s*(Q[1-4])$/i);
     if (!match) {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Invalid location**", "Provide location as square and quadrant, e.g. `H8 Q3`.", { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
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
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **No grotto at location**", "No grotto found at that location. The grotto must exist (cleansed or marked) at that square and quadrant.", { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
    const totalCost = 1;
    const payResult = await payStaminaOrStruggle(party, party.currentTurn, totalCost, { action: "grotto_travel" });
    if (!payResult.ok) {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Not enough stamina or hearts**", `Not enough stamina or hearts to travel to the grotto. Need ${totalCost} 🟩; party has ${party.totalStamina ?? 0} 🟩 and ${party.totalHearts ?? 0} ❤.`, { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
    }
    
    // Check if party is KO'd after paying (hearts reached 0 via struggle)
    if ((party.totalHearts ?? 0) <= 0 && payResult.heartsPaid > 0) {
     pushProgressLog(party, character.name, "ko", `Party KO'd after paying ${payResult.heartsPaid} heart(s) to travel to grotto (struggle mode).`, undefined, { heartsLost: payResult.heartsPaid });
     await party.save();
     await handleExpeditionFailed(party, interaction);
     return;
    }
    
    party.square = normSquare;
     party.quadrant = normQuad;
     party.leftGrottoSquare = null;
     party.leftGrottoQuadrant = null;
     party.markModified("leftGrottoSquare");
     party.markModified("leftGrottoQuadrant");
     await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
     pushProgressLog(party, character.name, "grotto_travel", `Party traveled to grotto at ${travelSquare} ${travelQuadrant} (−${totalCost} stamina).`, undefined, { staminaLost: totalCost }, new Date());
     const embed = new EmbedBuilder()
      .setTitle("🗺️ **Expedition: Arrived at Grotto**")
      .setColor(getExploreOutcomeColor("grotto_travel", regionColors[party.region] || "#00ff99"))
      .setDescription(`Party paid 1 🟩 and arrived at the grotto in **${travelSquare} ${travelQuadrant}**.\n\nIf the grotto is **uncleansed** (sealed), cleanse it with a Goddess Plume. If already **cleansed**, use </explore grotto continue:${getExploreCommandId()}> to enter the trial.`)
      .setImage(GROTTO_BANNER_UNCLEANSED_URL);
     addExplorationStandardFields(embed, { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party), actionCost: { staminaCost: payResult.staminaPaid ?? 0, heartsCost: payResult.heartsPaid ?? 0 } });
     return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "leave") {
     const grottoOption = interaction.options.getString("grotto");
     const grotto = await resolveGrottoAtLocation(squareId, quadrantId, expeditionId, grottoOption, true);
     if (!grotto) {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **No active grotto trial**", "No active grotto trial at this location for this expedition. You can only leave a grotto that is cleansed and not yet cleared.", { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     if (grotto.status === "cleared" || grotto.completedAt) {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("🗺️ **Grotto already cleared**", "This grotto is already cleared. Use </explore roll:" + getExploreCommandId() + "> to leave and continue exploring.", { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     party.leftGrottoSquare = squareId;
     party.leftGrottoQuadrant = quadrantId;
     party.markModified("leftGrottoSquare");
     party.markModified("leftGrottoQuadrant");
     await party.save();
     pushProgressLog(party, character.name, "grotto_leave", `Party left the grotto at ${location} without completing the trial.`, undefined, undefined, new Date());
     const rollCmdId = getExploreCommandId();
     const continueCmdId = getExploreCommandId();
     const leaveBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
     const leaveEmbed = new EmbedBuilder()
      .setTitle("🗺️ **Grotto: Left**")
      .setColor(getExploreOutcomeColor("grotto_puzzle_success", regionColors[party.region] || "#00ff99"))
      .setDescription(
       `The party left **${grotto.name || "the grotto"}** without completing the trial.\n\n` +
       `Use </explore roll:${rollCmdId}> to continue exploring from this square, or return later and use </explore grotto continue:${continueCmdId}> to re-enter and try again.`
      )
      .setImage(leaveBanner?.imageUrl ?? getRandomGrottoBanner());
     addExplorationStandardFields(leaveEmbed, {
      party,
      expeditionId,
      location,
      nextCharacter: party.characters[party.currentTurn] ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasActiveGrotto: false,
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
     });
     return interaction.editReply({ embeds: [leaveEmbed], ...(leaveBanner?.attachment ? { files: [leaveBanner.attachment] } : {}) });
    }

    return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Unknown subcommand**", "Unknown grotto subcommand.")] });
   }

   // ------------------- Revisit discovery (monster camp or grotto in current quadrant) -------------------
   if (subcommand === "discovery") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = normalizeCharacterName(interaction.options.getString("charactername"));
    const discoveryKey = (interaction.options.getString("discovery") || "").trim();
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition ID not found.")] });
    const character = await findCharacterByNameAndUser(characterName, userId);
    if (!character) return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Character not found**", "Character not found or you do not own this character.")] });
    const characterIndex = party.characters.findIndex((c) => c.name === characterName);
    if (characterIndex === -1) return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Not in expedition**", "Your character is not part of this expedition.", { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
    if (party.status !== "started") return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not started**", "This expedition has not been started yet.", { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
    if ((party.totalHearts ?? 0) <= 0) {
     await handleExpeditionFailed(party, interaction);
     return;
    }
    // Block discovery command if there's active combat for this expedition (must resolve first)
    const discoveryCombatBlock = await getCombatBlockReply(party, expeditionId, "discovery", `${party.square} ${party.quadrant}`);
    if (discoveryCombatBlock) return interaction.editReply(discoveryCombatBlock);

    if (!SKIP_PIN_REQUIREMENT_FOR_TESTING) {
     const unpinnedDiscovery = await hasUnpinnedDiscoveriesInQuadrant(party);
     if (unpinnedDiscovery) {
      const blockEmbed = await createUnpinnedDiscoveriesBlockEmbed(party, expeditionId);
      return interaction.editReply({ embeds: [blockEmbed] });
     }
    }

    const squareId = (party.square && String(party.square).trim()) || "";
    const quadrantId = (party.quadrant && String(party.quadrant).trim()) || "";
    if (!squareId || !quadrantId) {
      const exploreCmdIdLoc = getExploreCommandId();
      const rollMention = exploreCmdIdLoc ? `</explore roll:${exploreCmdIdLoc}>` : "`/explore roll`";
      const moveMention = exploreCmdIdLoc ? `</explore move:${exploreCmdIdLoc}>` : "`/explore move`";
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **No location**", `Expedition has no current location. Use ${rollMention} or ${moveMention} first.`, { party, expeditionId, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
    }

    const squareDoc = await Square.findOne({ squareId: new RegExp(`^${String(squareId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (!squareDoc || !squareDoc.quadrants) return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **No map data**", "No map data for this square.", { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
    const quadrant = squareDoc.quadrants.find((q) => String(q.quadrantId).toUpperCase() === quadrantId.toUpperCase());
    if (!quadrant) return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **No quadrant data**", "No quadrant data for your current location.", { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
    const discoveries = quadrant.discoveries || [];
    const discovery = discoveries.find((d) => d.discoveryKey === discoveryKey);
    if (!discovery) {
      const revisitable = (discoveries || []).filter((d) => {
        const t = String(d.type || "").toLowerCase();
        return t === "monster_camp" || t === "grotto";
      });
      const locationStr = `${party.square} ${party.quadrant}`;
      const discoveryNotFoundEmbed = new EmbedBuilder()
        .setTitle("📍 **Discovery not found**")
        .setColor(getExploreOutcomeColor("explored", regionColors[party.region] || "#9C27B0"))
        .setDescription(
          `The discovery you picked was **not found** in your current quadrant (**${locationStr}**).\n\n` +
          (discoveryKey
            ? `The value may be from another quadrant, or the list may have changed. `
            : `You must choose a discovery. `) +
          `Use **discovery** and pick one from the autocomplete list (it shows only monster camps and grottos in this quadrant).`
        )
        .setImage(getExploreMapImageUrl(party, { highlight: true }));
      if (revisitable.length > 0) {
        const listLines = revisitable.map((d) => {
          const t = String(d.type || "").toLowerCase();
          const label = t === "grotto" ? (d.name && String(d.name).trim() ? d.name : "Grotto") : "Monster camp";
          return `• **${label}**`;
        });
        discoveryNotFoundEmbed.addFields({
          name: `**Revisitable in ${locationStr}**`,
          value: listLines.join("\n") || "—",
          inline: false,
        });
      } else {
        discoveryNotFoundEmbed.addFields({
          name: "**No camps or grottos here**",
          value: `There are no monster camps or grottos to revisit in **${locationStr}**. Use </explore roll:${getExploreCommandId()}> or </explore move:${getExploreCommandId()}> to continue.`,
          inline: false,
        });
      }
      addExplorationStandardFields(discoveryNotFoundEmbed, {
        party,
        expeditionId,
        location: locationStr,
        nextCharacter: party.characters?.[party.currentTurn] ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
        hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      return interaction.editReply({ embeds: [discoveryNotFoundEmbed] });
    }
    const discoveryType = String(discovery.type || "").toLowerCase();
    if (discoveryType !== "monster_camp" && discoveryType !== "grotto") {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Invalid discovery type**", "You can only revisit monster camps and grottos. That discovery is not one of those.", { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
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
     const grottoCampBanner = grotto?.trialType === "maze" ? null : await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
     const grottoCampImg = grotto?.trialType === "maze" ? getExploreMapImageUrl(party, { highlight: true }) : (grottoCampBanner?.imageUrl ?? getRandomGrottoBanner());
     const grottoCampEmbed = new EmbedBuilder()
      .setTitle("🕳️ **Complete the grotto trial first**")
      .setColor(getExploreOutcomeColor("move", regionColors[party.region] || "#9C27B0"))
      .setDescription(
       `This grotto is **cleansed** (trial in progress). You cannot visit monster camps until the trial is **cleared**.\n\nUse **${grottoCmd}** for your turn.`
      )
      .setImage(grottoCampImg);
     addExplorationStandardFields(grottoCampEmbed, {
      party,
      expeditionId,
      location: `${party.square} ${party.quadrant}`,
      nextCharacter: party.characters?.[party.currentTurn] ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
     });
     return interaction.editReply({ embeds: [grottoCampEmbed], ...(grottoCampBanner?.attachment ? { files: [grottoCampBanner.attachment] } : {}) });
    }

    const location = `${party.square} ${party.quadrant}`;
    const nextCharacter = party.characters[party.currentTurn] ?? null;

    if (discoveryType === "monster_camp") {
     // In testing mode waves still run; damage/hearts use party totals only (no persist to Character DB)
     const regionKey = (party.region && String(party.region).trim()) || "Eldin";
     const regionCapitalized = regionKey.charAt(0).toUpperCase() + regionKey.slice(1).toLowerCase();
     let camp;
     try {
      if (discovery.campId) {
       camp = await MonsterCamp.findByCampId(discovery.campId);
       if (!camp) camp = await MonsterCamp.findOrCreate(squareId, quadrantId, regionCapitalized);
      } else {
       camp = await MonsterCamp.findOrCreate(squareId, quadrantId, regionCapitalized);
      }
     } catch (err) {
      logger.error("EXPLORE", `[explore.js]❌ monster_camp lookup: ${err?.message || err}`);
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Monster camp not found**", "Failed to find monster camp.", { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     const isFightable = await MonsterCamp.isFightable(camp);
     if (!isFightable) {
      pushProgressLog(party, character.name, "monster_camp_fight_blocked", `Found a monster camp in ${location}; camp recently cleared (wait for Blood Moon).`, undefined, undefined, new Date());
      await party.save();
      const cmdRoll = getExploreCommandId() ? `</explore roll:${getExploreCommandId()}>` : "`/explore roll`";
      const blockedEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Expedition: Monster Camp**")
       .setColor(getExploreOutcomeColor("monster_camp_fight_blocked", regionColors[party.region] || "#00ff99"))
       .setDescription(
        `🔴 **This camp was recently cleared.** Wait for the next Blood Moon to fight it again. Continue with ${cmdRoll}.`
       )
       .setImage(getExploreMapImageUrl(party, { highlight: true }));
      addExplorationStandardFields(blockedEmbed, { party, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered: undefined, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party) });
      return interaction.editReply({ embeds: [blockedEmbed] });
     }
     const village = REGION_TO_VILLAGE[regionKey?.toLowerCase()] || "Inariko";
     const difficultyGroup = pickWeighted(MONSTER_CAMP_DIFFICULTY_WEIGHTS);
     const monsterCount = pickWeighted(MONSTER_CAMP_COUNT_WEIGHTS);
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
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Wave failed to start**", `Failed to start wave: ${waveErr?.message || "Unknown error"}`, { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
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
     const firstCharNameRevisit = joinedNames[0] || null;
     const firstCharSlotRevisit = firstCharNameRevisit ? party.characters.find(c => c.name === firstCharNameRevisit) : null;
     const turnOrderNoteRevisit = joinedNames.length > 1
      ? `\n\n**Turn order:** ${joinedNames.map((n, i) => i === 0 ? `**${n}** (first)` : n).join(" → ")}`
      : "";
     const firstUpPingRevisit = firstCharSlotRevisit?.userId ? `\n\n<@${firstCharSlotRevisit.userId}> — **${firstCharNameRevisit}**, you're up first!` : "";
     await interaction.channel.send({
      content: `🌊 **MONSTER CAMP WAVE!** — Revisiting a camp at **${location}**!\n\n${joinNote}Use </wave:${getWaveCommandId()}> to take your turn (id: \`${waveId}\`). **The expedition pauses until the wave is complete.**\n</explore item:${getExploreCommandId()}> to heal during the wave!${turnOrderNoteRevisit}${firstUpPingRevisit}\n\n**Mark this camp on the map** from the expedition thread if you haven't already (so you can revisit it later).`,
      embeds: [waveEmbed],
     });
     if (failedJoins.length > 0) {
      logger.warn("EXPLORE", `[explore.js]⚠️ monster_camp: could not join wave: ${failedJoins.join("; ")}`);
     }
     pushProgressLog(party, character.name, "monster_camp_revisit", `Revisited monster camp at ${location}; wave ${waveId} started.`, undefined, undefined, new Date());
     await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
     const embed = new EmbedBuilder()
      .setTitle("🗺️ **Expedition: Revisiting Monster Camp**")
      .setColor(getExploreOutcomeColor("monster_camp_revisit", regionColors[party.region] || "#00ff99"))
      .setDescription(
       `Revisiting a monster camp at **${location}**. All party members must fight. Use </wave:${getWaveCommandId()}> (id: \`${waveId}\`). **Do not use </explore roll:${getExploreCommandId()}> until the wave is complete.**`
      )
      .setImage(getExploreMapImageUrl(party, { highlight: true }));
     addExplorationStandardFields(embed, { party, expeditionId, location, nextCharacter: null, showNextAndCommands: false, showRestSecureMove: false, hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party) });
     return interaction.editReply({ embeds: [embed] });
    }

    if (discoveryType === "grotto") {
     // Find any unsealed grotto at this location (one grotto per square/quadrant; may have been cleansed by this or a previous expedition)
     const grotto = await Grotto.findOne({
      squareId: exactIRegex(squareId),
      quadrantId: exactIRegex(quadrantId),
      sealed: false,
     }).sort({ unsealedAt: -1 });
     if (grotto) {
      const failedByThisExpedition = grotto.trialType === "target_practice" && grotto.targetPracticeState?.failed && String(grotto.partyId || "").trim() === String(expeditionId || "").trim();
      if (failedByThisExpedition) {
       const rollCmdId = getExploreCommandId();
       const failedRevisitBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
       const failedRevisitEmbed = new EmbedBuilder()
        .setTitle("🗺️ **Expedition: Grotto — Trial Failed**")
        .setColor(getExploreOutcomeColor("grotto_target_fail", regionColors[party.region] || "#00ff99"))
        .setDescription(
         `Party is at the grotto in **${location}**, but the **Target Practice** trial has **failed** (this expedition).\n\n` +
         `Use </explore roll:${rollCmdId}> to leave. You can’t retry this grotto this expedition; find another Target Practice on a future run.`
        )
        .setThumbnail(TARGET_PRACTICE_THUMBNAIL_URL)
        .setImage(failedRevisitBanner?.imageUrl ?? getRandomGrottoBanner());
       addExplorationStandardFields(failedRevisitEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: party.characters[party.currentTurn] ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
        hasActiveGrotto: false,
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
        hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
       });
       return interaction.editReply({ embeds: [failedRevisitEmbed], ...(failedRevisitBanner?.attachment ? { files: [failedRevisitBanner.attachment] } : {}) });
      }
      if (grotto.status === "cleared") {
       const rollCmdId = getExploreCommandId();
       const clearedRevisitBanner = await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
       const clearedRevisitEmbed = new EmbedBuilder()
        .setTitle("🗺️ **Expedition: Grotto already cleared**")
        .setColor(getExploreOutcomeColor("grotto_revisit", regionColors[party.region] || "#00ff99"))
        .setDescription(`This grotto has already been **cleared** (trial completed; sealed). Use </explore roll:${rollCmdId}> to continue exploring.`)
        .setImage(clearedRevisitBanner.imageUrl);
       addExplorationStandardFields(clearedRevisitEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: party.characters[party.currentTurn] ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
        hasActiveGrotto: false,
        hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
       });
       return interaction.editReply({ embeds: [clearedRevisitEmbed], ...(clearedRevisitBanner.attachment ? { files: [clearedRevisitBanner.attachment] } : {}) });
      }
      const trialLabel = getTrialLabel(grotto.trialType);
      const instructions = {
       blessing: "The grotto held a blessing. Everyone received a Spirit Orb!",
       target_practice: "**3 hits** wins, **1 fail** ends the trial. Each shot costs 1 🟩. See **Commands** below.",
       puzzle: "Submit an offering (items); staff will review. If approved, everyone gets Spirit Orbs. See **Commands** below.",
       maze: "Move North, East, South, or West; use Song of Scrying at a wall. See **Commands** below.",
      };
      const desc = (grotto.status === "cleared" && grotto.trialType === "blessing")
       ? GROTTO_ALREADY_CLEARED_BLESSING
       : (instructions[grotto.trialType] || `Complete the ${trialLabel} trial. See **Commands** below.`);
      let revisitMazeFiles = [];
      let revisitMazeImg = getExploreMapImageUrl(party, { highlight: true });
      if (grotto.trialType === "maze" && grotto.mazeState?.layout) {
       try {
        const mazeBuf = await renderMazeToBuffer(grotto.mazeState.layout, { viewMode: "member", currentNode: grotto.mazeState.currentNode, visitedCells: grotto.mazeState.visitedCells, openedChests: grotto.mazeState.openedChests, triggeredTraps: grotto.mazeState.triggeredTraps, usedScryingWalls: grotto.mazeState.usedScryingWalls });
        revisitMazeFiles = [new AttachmentBuilder(mazeBuf, { name: "maze.png" })];
        revisitMazeImg = "attachment://maze.png";
       } catch (err) {
        logger.warn("EXPLORE", `[explore.js]⚠️ Maze render (revisit): ${err?.message || err}`);
       }
      }
      const revisitCleansedBanner = grotto.trialType === "maze" ? null : await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
      const revisitImg = grotto.trialType === "maze" ? revisitMazeImg : (revisitCleansedBanner?.imageUrl ?? getRandomGrottoBanner());
      const embed = new EmbedBuilder()
       .setTitle(`🗺️ **Grotto: ${trialLabel}**`)
       .setColor(getExploreOutcomeColor("grotto_revisit", regionColors[party.region] || "#00ff99"))
       .setDescription(desc)
       .setImage(revisitImg);
      addExplorationStandardFields(embed, {
       party,
       expeditionId,
       location,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       hasActiveGrotto: true,
       activeGrottoCommand: getActiveGrottoCommand(grotto.trialType),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
       compactGrottoCommands: true,
      });
      if (grotto.trialType === "maze" && revisitMazeFiles.length) embed.setFooter({ text: GROTTO_MAZE_LEGEND });
      const revisitFiles = grotto.trialType === "maze" ? revisitMazeFiles : (revisitCleansedBanner?.attachment ? [revisitCleansedBanner.attachment] : []);
      return interaction.editReply({ embeds: [embed], files: revisitFiles.length ? revisitFiles : undefined });
     }
     let plumeHolder = await findGoddessPlumeHolder(party);
     if (!plumeHolder && false && party.characters?.length > 0) {
      const firstSlot = party.characters[0];
      const character = await Character.findById(firstSlot._id);
      if (character) plumeHolder = { characterIndex: 0, character };
     }
     if (!plumeHolder) {
      return interaction.editReply({
       embeds: [
        createExplorationErrorEmbed(
         "❌ **No Goddess Plume**",
         "No party member has a Goddess Plume in their expedition loadout to **open** (cleanse) this grotto.\n\n" +
         "**Add one to your loadout before departing**, or use </explore roll:" + getExploreCommandId() + "> and when you get a grotto here choose **Open** to cleanse with a plume.\n\n" +
         "_You only need a plume once to open a grotto. If you already opened it and failed the trial, select this discovery again to **revisit** — no second plume needed._\n\n" +
         GROTTO_STATUS_LEGEND,
         { party, expeditionId, location, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true }
        ),
       ],
      });
     }
     const grottoPayResult = await payStaminaOrStruggle(party, plumeHolder.characterIndex, 1, { order: "currentFirst", action: "grotto_plume" });
     if (!grottoPayResult.ok) {
      const partyTotalStamina = Math.max(0, party.totalStamina ?? 0);
      const partyTotalHearts = Math.max(0, party.totalHearts ?? 0);
      return interaction.editReply(
       `Not enough stamina or hearts to cleanse the grotto. Party has ${partyTotalStamina} 🟩 and ${partyTotalHearts} ❤ (need 1 total). Camp to recover or use hearts to Struggle.`
      );
     }
     if (!false) {
      const plumeIdx = (party.characters[plumeHolder.characterIndex].items || []).findIndex((it) => String(it.itemName || "").toLowerCase() === "goddess plume");
      if (plumeIdx !== -1) {
       party.characters[plumeHolder.characterIndex].items.splice(plumeIdx, 1);
       party.markModified("characters");
       await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
      }
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
      grottoDoc.targetPracticeState = { turnIndex: 0, successCount: 0, failed: false, phase: 1 };
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
      await updateDiscoveryName(squareId, quadrantId, discovery.discoveryKey, grottoName, { party });
      await updateDiscoveryGrottoStatus(squareId, quadrantId, discovery.discoveryKey, "cleansed", { party });
     }
     pushProgressLog(party, plumeHolder.character.name, "grotto_cleansed", `Cleansed grotto **${grottoName}** (revisit) in ${location} (1 Goddess Plume + 1 stamina).`, undefined, { staminaLost: 1 }, at);
     if (grottoDoc.trialType === "blessing") {
      await markGrottoCleared(grottoDoc);
      restorePartyPoolOnGrottoExit(party);
      for (const slot of party.characters) {
       if (!false) {
        try {
         await addItemInventoryDatabase(slot._id, "Spirit Orb", 1, interaction, "Grotto - Blessing (revisit)");
        } catch (err) {
         logger.warn("EXPLORE", `[explore.js]⚠️ Grotto revisit blessing Spirit Orb: ${err?.message || err}`);
        }
       }
      }
      if (!party.gatheredItems) party.gatheredItems = [];
      for (const slot of party.characters) {
       party.gatheredItems.push({ characterId: slot._id, characterName: slot.name, itemName: "Spirit Orb", quantity: 1, emoji: "💫" });
      }
      party.markModified("gatheredItems");
      pushProgressLog(party, plumeHolder.character.name, "grotto_blessing", "Blessing trial: each party member received a Spirit Orb.", undefined, undefined, new Date());
      await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
      const blessingFlavorRevisit = getRandomBlessingFlavor();
      const blessingEmbed = new EmbedBuilder()
       .setTitle("🗺️ **Expedition: Grotto cleansed (revisit)**")
       .setColor(getExploreOutcomeColor("grotto_blessing", regionColors[party.region] || "#00ff99"))
       .setDescription(
        `**${plumeHolder.character.name}** used a Goddess Plume and 1 stamina to **cleanse** **${grottoName}** in **${location}**. The grotto held a blessing — it is now **cleared**.\n\n` +
        blessingFlavorRevisit + `\n\n${GROTTO_CLEARED_FLAVOR}\n\nEach party member received a **Spirit Orb** 💫. Use the commands below to continue exploring.`
       )
       .setImage(getExploreMapImageUrl(party, { highlight: true }))
       .setThumbnail(GROTTO_BANNER_CLEANSED_URL);
      addExplorationStandardFields(blessingEmbed, { party, expeditionId, location, nextCharacter: party.characters[party.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, grottoExitCommands: true, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party) });
      const explorePageUrlRevisit = getExplorePageUrl(expeditionId);
      blessingEmbed.addFields({
       name: "📍 **__Set pin on webpage__**",
       value: `Set a pin for this grotto on the **explore/${expeditionId}** page: ${explorePageUrlRevisit}`,
       inline: false,
      });
      await interaction.editReply({ embeds: [blessingEmbed] });
      if (false) {
       const endEmbed = await buildTestingEndAfterGrottoEmbed(party, expeditionId, plumeHolder.character.name);
       await interaction.followUp({ embeds: [endEmbed] }).catch(() => {});
      }
      return;
     }
     const trialLabelRevisit = getTrialLabel(grottoDoc.trialType);
     const grottoCmdRevisit = getActiveGrottoCommand(grottoDoc.trialType);
     let continueDescRevisit = `**${plumeHolder.character.name}** used a Goddess Plume and 1 stamina to cleanse **${grottoName}** in **${location}**.\n\n**Trial: ${trialLabelRevisit}** — `;
     if (grottoDoc.trialType === 'puzzle' && grottoDoc.puzzleState?.puzzleSubType) {
      const puzzleFlavorRevisit = getPuzzleFlavor(grottoDoc, getExploreCommandId());
      if (puzzleFlavorRevisit) continueDescRevisit += `\n\n${puzzleFlavorRevisit}`;
      else continueDescRevisit += `Complete the trial to receive a **Spirit Orb**. Use ${grottoCmdRevisit} for your turn.`;
     } else {
      continueDescRevisit += `Complete the trial to receive a **Spirit Orb**. Use ${grottoCmdRevisit} for your turn.`;
     }
     if (grottoDoc.trialType === 'target_practice') continueDescRevisit += '\n\n_Each action will take **1** 🟩 stamina._';
     const continueEmbed = new EmbedBuilder()
      .setTitle("🗺️ **Expedition: Grotto cleansed (revisit)**")
      .setColor(getExploreOutcomeColor("grotto_cleansed", regionColors[party.region] || "#00ff99"))
      .setDescription(continueDescRevisit + "\n\n" + GROTTO_CLEANSED_VS_CLEARED)
      .setImage(getExploreMapImageUrl(party, { highlight: true }))
      .setThumbnail(GROTTO_BANNER_CLEANSED_URL);
     addExplorationStandardFields(continueEmbed, {
      party,
      expeditionId,
      location,
      nextCharacter: grottoDoc.trialType === "puzzle" ? null : nextCharacter,
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasActiveGrotto: true,
      activeGrottoCommand: grottoCmdRevisit,
      hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      grottoPuzzleAnyoneCanSubmit: grottoDoc.trialType === "puzzle",
     });
     const explorePageUrlRevisitTrial = getExplorePageUrl(expeditionId);
     continueEmbed.addFields({
      name: "📍 **__Set pin on webpage__**",
      value: `Set a pin for this grotto on the **explore/${expeditionId}** page: ${explorePageUrlRevisitTrial}`,
      inline: false,
     });
     return interaction.editReply({ embeds: [continueEmbed] });
    }

    return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Unknown discovery type**", "Unknown discovery type.")] });
   }

   // ------------------- Roll for Encounter -------------------
   if (subcommand === "roll") {
    try {
     const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
     const characterName = normalizeCharacterName(interaction.options.getString("charactername"));
     const userId = interaction.user.id;

     const party = await Party.findActiveByPartyId(expeditionId);
     if (!party) {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition ID not found.")] });
     }
     // Ensure pre-established secured/no-camp paths are persisted on the map for this square
     await enforcePreestablishedSecuredOnSquare(party.square);
     // Do NOT sync party from character DB here: we only persist to the character who paid (payStaminaOrStruggle).
     // Syncing would overwrite party slots with stale character docs and falsely restore stamina for other members.

     const character = await findCharacterByNameAndUser(characterName, userId);
     if (!character) {
      return interaction.editReply({
       embeds: [createExplorationErrorEmbed("❌ **Character not found**", "Character not found or you do not own this character.")]
      });
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

     // Block roll if character has an unappraised relic from before this expedition (must appraise before new explores).
     // Relics found during this run have discoveredDate >= party.createdAt — allow rolling until the expedition ends.
     if (character._id || (character.name || "").toString().trim()) {
      const relicBlockingParts = [
       relicOwnerMatchQuery(character),
       { appraised: false, deteriorated: false },
      ];
      if (party.createdAt) {
       relicBlockingParts.push({
        $or: [
         { discoveredDate: { $lt: party.createdAt } },
         { discoveredDate: null },
        ],
       });
      }
      const unappraisedRelic = await Relic.findOne({ $and: relicBlockingParts }).lean();
      if (unappraisedRelic) {
       return interaction.editReply({
        embeds: [createExplorationErrorEmbed(
         "❌ **Unappraised relic**",
         `**${character.name}** has an unappraised relic and must get it appraised before exploring. Take it to an Inarikian Artist or Researcher, or use NPC appraisal (500 tokens). Then you can roll again.`,
         { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true }
        )],
       });
      }
     }

     if (party.status !== "started") {
      return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not started**", "This expedition has not been started yet.", { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
     }
     // If party has 0 hearts but expedition still "started" (e.g. KO'd in raid and failure path didn't run), end it now
     if ((party.totalHearts ?? 0) <= 0) {
      await handleExpeditionFailed(party, interaction);
      return;
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
      const grottoRollBanner = grotto?.trialType === "maze" ? null : await generateGrottoBannerOverlay(party, getRandomGrottoBanner(), GROTTO_CLEANSED_BANNER_NAME);
      const grottoRollImg = grotto?.trialType === "maze" ? getExploreMapImageUrl(party, { highlight: true }) : (grottoRollBanner?.imageUrl ?? getRandomGrottoBanner());
      const grottoRollEmbed = new EmbedBuilder()
       .setTitle("🕳️ **Complete the grotto trial first**")
       .setColor(getExploreOutcomeColor("move", regionColors[party.region] || "#9C27B0"))
       .setDescription(
        `You cannot use </explore roll:${getExploreCommandId()}> until the trial is complete.\n\nUse **${grottoCmd}** for your turn.`
       )
       .setImage(grottoRollImg);
      addExplorationStandardFields(grottoRollEmbed, {
       party,
       expeditionId,
       location: `${party.square} ${party.quadrant}`,
       nextCharacter: party.characters?.[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
      });
      return interaction.editReply({ embeds: [grottoRollEmbed], ...(grottoRollBanner?.attachment ? { files: [grottoRollBanner.attachment] } : {}) });
     }

     if (!SKIP_PIN_REQUIREMENT_FOR_TESTING) {
      const unpinnedRoll = await hasUnpinnedDiscoveriesInQuadrant(party);
      if (unpinnedRoll) {
       const blockEmbed = await createUnpinnedDiscoveriesBlockEmbed(party, expeditionId);
       return interaction.editReply({ embeds: [blockEmbed] });
      }
     }

     // Block rolling if there's active combat for this expedition (must resolve first)
     const rollCombatBlock = await getCombatBlockReply(party, expeditionId, "roll", `${party.square} ${party.quadrant}`);
     if (rollCombatBlock) return interaction.editReply(rollCombatBlock);

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
        .setColor(NOT_YOUR_TURN_COLOR)
        .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`)
        .setImage(NOT_YOUR_TURN_BORDER_URL);
      return interaction.editReply({ embeds: [notYourTurnEmbed] });
    }

    // Quadrant hazards (per-action trigger, party pool)
    const hazardRollResult = await maybeApplyQuadrantHazards(party, { trigger: "roll" });
    if (hazardRollResult.ko) {
      await handleExpeditionFailed(party, interaction);
      return;
    }

    logger.info("EXPLORE", `[explore.js] id=${expeditionId ?? "?"} roll char=${characterName ?? "?"} ❤${party.totalHearts ?? 0} 🟩${party.totalStamina ?? 0}`);

     // Sync quadrant state from map so stamina cost matches canonical explored/secured status.
     // Roll cost is from PARTY quadrant state only: 2 (unexplored), 1 (explored), 0 (secured). Never use character stamina.
     const mapSquare = await Square.findOne({ squareId: party.square });
     let ruinRestRecovered = 0;
     let rollStaminaCost = party.quadrantState === "unexplored" ? 2 : party.quadrantState === "explored" ? 1 : 0;
     if (mapSquare && mapSquare.quadrants && mapSquare.quadrants.length) {
      const q = mapSquare.quadrants.find(
       (qu) => String(qu.quadrantId).toUpperCase() === String(party.quadrant || "").toUpperCase()
      );
      const effectiveStatus = getEffectiveQuadrantStatus(party.square, party.quadrant, q?.status);
      if (effectiveStatus === "explored" || effectiveStatus === "secured") {
       party.quadrantState = effectiveStatus;
       party.markModified("quadrantState");
       rollStaminaCost = effectiveStatus === "secured" ? 0 : 1;
      }
      // Quadrant stays unexplored until roll outcome "explored" (see DESIGN NOTE at top of file). Do NOT mark explored here.
      // Known ruin-rest spot: auto-recover stamina when rolling here again — only if THIS expedition found a camp here
      // Primary source: party.ruinRestQuadrants (stores stamina value); fallback: Square DB
      const ruinRestEntry = (party.ruinRestQuadrants || []).find(
       (r) => String(r?.squareId || "").toUpperCase() === String(party.square || "").toUpperCase() && String(r?.quadrantId || "").toUpperCase() === String(party.quadrant || "").toUpperCase()
      );
      const restStamina = ruinRestEntry?.stamina ?? (typeof q?.ruinRestStamina === "number" && q.ruinRestStamina > 0 ? q.ruinRestStamina : 0);
      if (restStamina > 0 && ruinRestEntry && character) {
       const add = restStamina;
       if (add > 0) {
        const caps = await getPartyPoolCaps(party);
        const poolStam = party.totalStamina ?? 0;
        party.totalStamina = Math.min(caps.maxStamina, poolStam + add);
        party.markModified("totalStamina");
        ruinRestRecovered = (party.totalStamina ?? 0) - poolStam;
        logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} ruin_rest 🟩${poolStam} +${ruinRestRecovered} → 🟩${party.totalStamina ?? 0}`);
        await party.save();
        const locationRuinRest = `${party.square} ${party.quadrant}`;
        pushProgressLog(party, character.name, "ruin_rest", `Known ruin-rest spot in ${locationRuinRest}: +${add} stamina.`, undefined, { staminaRecovered: add });
       }
      }
     }

     // Secured quadrants cannot be rolled — prompt to Move, Item, or Camp instead (or Move/Item only if no camp allowed)
     if (party.quadrantState === "secured") {
      const nextCharacter = party.characters[party.currentTurn];
      const location = `${party.square} ${party.quadrant}`;
      let noCampHere = isPreestablishedNoCamp(party.square, party.quadrant);
      if (!noCampHere) {
       const mapSquare = await Square.findOne({ squareId: party.square });
       if (mapSquare?.quadrants?.length) {
        const q = mapSquare.quadrants.find((qu) => String(qu.quadrantId).toUpperCase() === String(party.quadrant || "").toUpperCase());
        noCampHere = !!(q && q.noCamp);
       }
      }
      const actionsLine = noCampHere
       ? "Use **Move** to go to another quadrant or **Item** to use a healing item. You cannot camp in this quadrant."
       : "Use **Move** to go to another quadrant, **Item** to use a healing item, or **Camp** to rest and recover hearts.";
      const securedNoRollEmbed = new EmbedBuilder()
       .setTitle("🔒 **Quadrant Secured — No Roll**")
       .setColor(getExploreOutcomeColor("secure", regionColors[party.region] || "#FF9800"))
       .setDescription(
        `This quadrant (**${location}**) is already secured. You cannot roll here.\n\n${actionsLine}`
       )
       .setImage(getExploreMapImageUrl(party, { highlight: true }));
      addExplorationStandardFields(securedNoRollEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextCharacter ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
        commandsLast: true,
        ruinRestRecovered,
        hazardMessage: hazardRollResult?.hazardMessage ?? null,
        hideCampCommand: noCampHere,
      });
      addExplorationCommandsField(securedNoRollEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextCharacter ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
        showSecuredQuadrantOnly: true,
        hideCampCommand: noCampHere,
        isAtStartQuadrant: (() => {
          const start = START_POINTS_BY_REGION[party.region];
          return start && String(party.square || "").toUpperCase() === String(start.square || "").toUpperCase() && String(party.quadrant || "").toUpperCase() === String(start.quadrant || "").toUpperCase();
        })(),
      });
      return interaction.editReply({ embeds: [securedNoRollEmbed] });
     }

     const payResult = await payStaminaOrStruggle(party, characterIndex, rollStaminaCost, { order: "currentFirst", action: "roll" });
     if (!payResult.ok) {
      const partyStamina = party.totalStamina ?? 0;
      const partyHearts = party.totalHearts ?? 0;
      return interaction.editReply({
        embeds: [createExplorationErrorEmbed("❌ **Not enough stamina or hearts**", `Not enough stamina or hearts to roll. Party has **${partyStamina}** stamina and **${partyHearts}** hearts (need **${rollStaminaCost}**). Use hearts to pay for actions (1 heart = 1 stamina), or use items to recover.`, { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })],
      });
     }
     
     // Check if party is KO'd after paying (hearts reached 0 via struggle)
     if ((party.totalHearts ?? 0) <= 0 && payResult.heartsPaid > 0) {
      pushProgressLog(party, character.name, "ko", `Party KO'd after paying ${payResult.heartsPaid} heart(s) to roll (struggle mode).`, undefined, { heartsLost: payResult.heartsPaid });
      await party.save();
      await handleExpeditionFailed(party, interaction);
      return;
     }
     
     const rollCostsForLog = buildCostsForLog(payResult);
     const poolCaps = await getPartyPoolCaps(party);
     await ensurePartyMaxValues(party, poolCaps);
     const n = (party.characters || []).length;
     if (party.status === "started" && n > 0) {
      // Use party pool only; keep in-memory character and party slot in sync with pool share for display.
      const poolHearts = Math.max(0, party.totalHearts ?? 0);
      const poolStamina = Math.max(0, party.totalStamina ?? 0);
      const shareHearts = Math.floor(poolHearts / n);
      const shareStamina = Math.floor(poolStamina / n);
      character.currentHearts = shareHearts;
      character.currentStamina = shareStamina;
      if (party.characters[characterIndex]) {
       party.characters[characterIndex].currentHearts = shareHearts;
       party.characters[characterIndex].currentStamina = shareStamina;
       party.markModified("characters");
      }
     } else {
      character.currentStamina = party.characters[characterIndex].currentStamina;
      character.currentHearts = party.characters[characterIndex].currentHearts;
     }

     const location = `${party.square} ${party.quadrant}`;

     // Hot Spring: if quadrant has Hot Spring and party has room for hearts, chance to heal up to 25% of max hearts (no proc when full)
     let hotSpringMessage = null;
     const quadrantMeta = await getQuadrantMeta(party.square, party.quadrant);
     const hasHotSpring = (quadrantMeta.special || []).some((s) => String(s || "").toLowerCase() === "hot spring");
     if (hasHotSpring && (party.totalHearts ?? 0) < poolCaps.maxHearts && Math.random() < HOT_SPRING_HEAL_CHANCE) {
      const beforeHearts = Math.max(0, party.totalHearts ?? 0);
      const missing = poolCaps.maxHearts - beforeHearts;
      const rawCap = Math.floor(poolCaps.maxHearts * HOT_SPRING_HEAL_FRACTION);
      const healCap = Math.max(rawCap, 1);
      const hotSpringHealAmount = Math.min(missing, healCap);
      party.totalHearts = Math.min(poolCaps.maxHearts, beforeHearts + hotSpringHealAmount);
      party.markModified("totalHearts");
      await party.save();
      pushProgressLog(party, character.name, "hot_spring", `The hot springs in ${location} soothed the party. +${hotSpringHealAmount} ❤`, undefined, { heartsRecovered: hotSpringHealAmount }, new Date());
      hotSpringMessage = `The hot springs soothed the party. **+${hotSpringHealAmount} ❤**`;
      logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} hot_spring ❤${beforeHearts} +${hotSpringHealAmount} → ❤${party.totalHearts ?? 0}`);
     }

     // Calculate danger level based on distance from start
     const dangerLevel = calculateDangerLevel(party);

     // Single outcome per roll: one of monster, item, explored, fairy, chest, old_map, ruins, relic, camp, monster_camp, grotto (chances in EXPLORATION_OUTCOME_CHANCES)
     // Reroll if: explored twice in a row; or special (ruins/relic/camp/monster_camp/grotto) and square has 3 discoveries (progressLog and/or exploringMap); or grotto and square already has grotto; or special and discovery-reduce roll fails
     // Monster chance is boosted based on distance from start (dangerBonus added to monster chance, taken from item/explored)
     function rollOutcome() {
      // Build adjusted chances based on danger level
      const baseMonster = EXPLORATION_OUTCOME_CHANCES.monster;
      const baseItem = EXPLORATION_OUTCOME_CHANCES.item;
      const baseExplored = EXPLORATION_OUTCOME_CHANCES.explored;

      // Boost monster chance by dangerBonus, proportionally reduce item and explored
      const monsterBoost = dangerLevel.dangerBonus;
      const adjustedMonster = baseMonster + monsterBoost;
      // Reduce item and explored proportionally to maintain total = 1
      const reductionPool = baseItem + baseExplored;
      const itemReduction = reductionPool > 0 ? (baseItem / reductionPool) * monsterBoost : monsterBoost / 2;
      const exploredReduction = reductionPool > 0 ? (baseExplored / reductionPool) * monsterBoost : monsterBoost / 2;
      const adjustedItem = Math.max(0.05, baseItem - itemReduction);
      const adjustedExplored = Math.max(0.05, baseExplored - exploredReduction);

      const adjustedChances = {
       ...EXPLORATION_OUTCOME_CHANCES,
       monster: adjustedMonster,
       item: adjustedItem,
       explored: adjustedExplored,
      };

      const r = Math.random();
      let cum = 0;
      let outcome;
      for (const [name, chance] of Object.entries(adjustedChances)) {
       cum += chance;
       if (r < cum) { outcome = name; break; }
      }
      if (!outcome) outcome = Object.keys(adjustedChances).pop();
      appendExploreStat(`${new Date().toISOString()}\troll\tr=${r.toFixed(4)}\t${outcome}\tdist=${dangerLevel.distance}\tbonus=${(dangerLevel.dangerBonus * 100).toFixed(0)}%\t${location}`);
      return outcome;
     }
     let outcomeType = rollOutcome();
     const currentSquareNorm = normalizeSquareId(party.square);
     const lastOutcomeHere = getLastProgressOutcomeForLocation(party, party.square, party.quadrant);
     // Only use map doc that matches this square (avoid wrong square false positives)
     let mapSquareForGrotto = null;
     if (currentSquareNorm) {
      const found = await Square.findOne({ squareId: new RegExp(`^${String(party.square).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
      if (found && normalizeSquareId(found.squareId) === currentSquareNorm) mapSquareForGrotto = found;
     }
     const specialCount = Math.max(
      countSpecialEventsInSquare(party, party.square),
      countSpecialDiscoveriesOnMap(mapSquareForGrotto)
     );
     for (;;) {
      // Don't allow "explored" twice in a row at the same location
      if (outcomeType === "explored" && lastOutcomeHere === "explored") {
       const reason = "explored twice in a row at this location (blocked by rule)";
       outcomeType = rollOutcome();
       continue;
      }
      // Don't allow "explored" as the first roll after moving to a new quadrant (must have a meaningful outcome first)
      if (outcomeType === "explored" && (lastOutcomeHere === "move" || lastOutcomeHere === null)) {
       outcomeType = rollOutcome();
       continue;
      }
      // Item balance: if this character has 3+ more items than the party member with fewest, reroll
      if (outcomeType === "item" && shouldBlockItemForBalance(party, character)) {
       outcomeType = rollOutcome();
       continue;
      }
      // One find per expedition (grotto, ruins, or monster_camp); prevents farming
      if (FIND_OUTCOMES_ROLL.includes(outcomeType) && partyHasFindThisExpedition(party)) {
       outcomeType = lastOutcomeHere === "explored" ? "item" : "explored";
       break;
      }
      if (!SPECIAL_OUTCOMES.includes(outcomeType)) break;
      if (specialCount >= MAX_SPECIAL_EVENTS_PER_SQUARE) {
       const reason = `special discovery count for this square is ${specialCount} (max ${MAX_SPECIAL_EVENTS_PER_SQUARE}); only counted outcomes: monster_camp/grotto/ruins when accepted (monster_camp_skipped does not count)`;
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
      if (outcomeType === "relic" && (await characterHasPendingRelic(character))) {
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

     // Increment explore count for each party member (stats: how many explores this character has done)
     const partyCharacterIds = (party.characters || []).map((pc) => pc?._id).filter(Boolean);
     for (const charId of partyCharacterIds) {
      Character.updateOne({ _id: charId }, { $inc: { exploreCount: 1 } }).catch((err) => logger.warn("EXPLORE", `[explore.js] exploreCount increment Character: ${err?.message || err}`));
      ModCharacter.updateOne({ _id: charId }, { $inc: { exploreCount: 1 } }).catch((err) => logger.warn("EXPLORE", `[explore.js] exploreCount increment ModCharacter: ${err?.message || err}`));
     }

     if (outcomeType === "explored") {
      // Lucky find: if quadrant was ALREADY explored before this roll, 15% chance to refund stamina and recover 1-2 stamina
      let luckyFindRecovery = 0;
      const quadrantWasExplored = party.quadrantState === "explored";
      if (quadrantWasExplored && Math.random() < 0.15) {
       // Refund the stamina cost
       const refundAmount = payResult?.staminaPaid ?? 0;
       if (refundAmount > 0) {
        party.totalStamina = Math.min(poolCaps.maxStamina, (party.totalStamina ?? 0) + refundAmount);
        party.markModified("totalStamina");
       }
       // Recover 1-2 additional stamina
       luckyFindRecovery = Math.floor(Math.random() * 2) + 1;
       party.totalStamina = Math.min(poolCaps.maxStamina, (party.totalStamina ?? 0) + luckyFindRecovery);
       party.markModified("totalStamina");
       logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} lucky_find refund=${refundAmount} +recovery=${luckyFindRecovery} → 🟩${party.totalStamina ?? 0}`);
      }

      party.quadrantState = "explored";
      party.markModified("quadrantState");
      const exploredLogCosts = luckyFindRecovery > 0
       ? { staminaRecovered: (payResult?.staminaPaid ?? 0) + luckyFindRecovery }
       : (Object.keys(rollCostsForLog).length ? rollCostsForLog : undefined);
      pushProgressLog(party, character.name, "explored", luckyFindRecovery > 0
       ? `Lucky find! Explored the quadrant (${location}) and found a shortcut. No stamina cost, +${luckyFindRecovery} stamina recovered.`
       : `Explored the quadrant (${location}). Party can now Secure, Roll again, or Move.`, undefined, exploredLogCosts);
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save(); // Always persist so dashboard shows current hearts/stamina/progress

      // Mark quadrant as explored: (1) always record on party so exploredQuadrantsThisRun is correct; (2) update map DB when not testing.
      const normSquare = normalizeSquareId(party.square);
      const normQuad = String(party.quadrant || "").trim().toUpperCase();
      if (!party.exploredQuadrantsThisRun) party.exploredQuadrantsThisRun = [];
      const alreadyInRun = party.exploredQuadrantsThisRun.some(
        (e) => normalizeSquareId(e.squareId) === normSquare && String(e.quadrantId || "").trim().toUpperCase() === normQuad
      );
      if (!alreadyInRun) {
        party.exploredQuadrantsThisRun.push({ squareId: party.square, quadrantId: party.quadrant });
        party.markModified("exploredQuadrantsThisRun");
        await party.save();
      }

      // Mark quadrant as explored in the exploring map DB (collection 'exploringMap'). Only when expedition is still active.
      const currentPartyForMap = await Party.findActiveByPartyId(party.partyId);
      if (currentPartyForMap && currentPartyForMap.status === "started") {
        try {
          const squareDoc = await Square.findOne({
            squareId: new RegExp(`^${String(party.square).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
          });
          if (squareDoc && squareDoc.quadrants && squareDoc.quadrants.length) {
            const q = squareDoc.quadrants.find(
              (qu) => String(qu.quadrantId || "").toUpperCase() === normQuad
            );
            if (q) {
              const exactSquareId = squareDoc.squareId;
              const exactQuadrantId = q.quadrantId;
              const updateResult = await Square.updateOne(
                { squareId: exactSquareId, "quadrants.quadrantId": exactQuadrantId },
                {
                  $set: {
                    "quadrants.$.status": "explored",
                    "quadrants.$.exploredBy": interaction.user?.id || party.leaderId || "",
                    "quadrants.$.exploredAt": new Date(),
                  },
                }
              );
              if (updateResult.modifiedCount > 0) {
                logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} map ${exactSquareId} ${exactQuadrantId} → explored`);
              } else if (updateResult.matchedCount === 0) {
                logger.warn("EXPLORE", `[explore.js]⚠️ Map update no match: ${exactSquareId} ${exactQuadrantId}`);
              }
            } else {
              logger.warn("EXPLORE", `[explore.js]⚠️ Map update: quadrant not found in square ${party.square} ${party.quadrant}`);
            }
          } else {
            logger.warn("EXPLORE", `[explore.js]⚠️ Map update: could not find square for ${party.square}`);
          }
        } catch (mapErr) {
          logger.error("EXPLORE", `[explore.js]❌ Update map quadrant status: ${mapErr.message}`);
        }
      }

      // Blight message and exposure only happen when the party *enters* (moves into) a blighted quadrant, not when they explore it.

      const nextCharacter = party.characters[party.currentTurn];
      const startPoint = START_POINTS_BY_REGION[party.region];
      const isAtStartQuadrant = startPoint && String(party.square || "").toUpperCase() === String(startPoint.square || "").toUpperCase() && String(party.quadrant || "").toUpperCase() === String(startPoint.quadrant || "").toUpperCase();

      // Lucky find: different title and description
      // Quadrant Explored uses gold color + border image to stand out as a milestone prompt
      const embedTitle = luckyFindRecovery > 0
       ? `🍀 **Expedition: Lucky Find!**`
       : `✨ **Quadrant Explored!** ✨`;
      const embedDesc = luckyFindRecovery > 0
       ? `**${character.name}** found a shortcut in **${location}**! No stamina cost, and recovered **+${luckyFindRecovery} 🟩** stamina.`
       : `**${character.name}** has explored **${location}**!\n\n🔓 **New options unlocked:** You can now **Secure** this quadrant or **Move** to a new one.`;

      const embed = new EmbedBuilder()
       .setTitle(embedTitle)
       .setDescription(embedDesc)
       .setColor("#FFD700")
       .setImage(QUADRANT_MILESTONE_IMAGE);

      // For lucky find, show recovery instead of cost
      const exploredActionCost = luckyFindRecovery > 0
       ? { staminaCost: 0, heartsCost: 0 }
       : { staminaCost: payResult?.staminaPaid ?? 0, heartsCost: payResult?.heartsPaid ?? 0 };

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
        actionCost: exploredActionCost,
        maxHearts: poolCaps.maxHearts,
        maxStamina: poolCaps.maxStamina,
        hazardMessage: hazardRollResult?.hazardMessage ?? null,
        hotSpringMessage: hotSpringMessage ?? null,
      });

      // Add recovery field for lucky find
      if (luckyFindRecovery > 0) {
       embed.addFields({ name: "🍀 **__Lucky Find Recovery__**", value: `+${(payResult?.staminaPaid ?? 0) + luckyFindRecovery} 🟩 stamina (refund + bonus)`, inline: true });
      }

      await interaction.editReply({ embeds: [embed] });
      await interaction.followUp({ content: getExplorationNextTurnContent(nextCharacter) });
      return;
     }

     if (outcomeType === "fairy") {
      const fairyHealsOnSpot = Math.random() < 0.5;
      if (fairyHealsOnSpot) {
       let sumMaxHearts = 0;
       for (let i = 0; i < party.characters.length; i++) {
        const char = await Character.findById(party.characters[i]._id).lean();
        if (char) sumMaxHearts += char.maxHearts ?? 0;
       }
       const prevHearts = Math.max(0, party.totalHearts ?? 0);
       const totalHeartsRecovered = Math.max(0, sumMaxHearts - prevHearts);
       party.totalHearts = sumMaxHearts;
       party.markModified("totalHearts");
       pushProgressLog(party, character.name, "fairy", `A fairy appeared in ${location} and healed the party! All hearts restored (+${totalHeartsRecovered} ❤ from 1 fairy).`, undefined, { heartsRecovered: totalHeartsRecovered, ...rollCostsForLog });
       party.currentTurn = (party.currentTurn + 1) % party.characters.length;
       await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
       const nextChar = party.characters[party.currentTurn];
       const hasDiscFairy = await hasDiscoveriesInQuadrant(party.square, party.quadrant);
       const fairyEmbed = new EmbedBuilder()
        .setTitle(`🧚 **Expedition: A Fairy Appeared!**`)
        .setDescription(`**${character.name}** encountered a fairy in **${location}**! The fairy swept over the party, restoring everyone to full hearts.`)
        .setColor(getExploreOutcomeColor("fairy", regionColors[party.region] || "#E8D5F2"))
        .setThumbnail("https://via.placeholder.com/100x100")
        .setImage(getExploreMapImageUrl(party, { highlight: true }));
       addExplorationStandardFields(fairyEmbed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextChar ?? null,
        showNextAndCommands: true,
        showRestSecureMove: true,
        commandsLast: true,
        ruinRestRecovered,
        hasDiscoveriesInQuadrant: hasDiscFairy,
        actionCost: { staminaCost: payResult?.staminaPaid ?? 0, heartsCost: payResult?.heartsPaid ?? 0 },
        maxHearts: poolCaps.maxHearts,
        maxStamina: poolCaps.maxStamina,
        hazardMessage: hazardRollResult?.hazardMessage ?? null,
        hotSpringMessage: hotSpringMessage ?? null,
      });
       fairyEmbed.addFields(
        { name: "📋 **Recovery**", value: `Party fully healed! (+${totalHeartsRecovered} ❤️ total)`, inline: false },
       );
       addExplorationCommandsField(fairyEmbed, { party, expeditionId, location, nextCharacter: nextChar ?? null, showNextAndCommands: true, showFairyRollOnly: true, hasDiscoveriesInQuadrant: hasDiscFairy });
       await interaction.editReply({ embeds: [fairyEmbed] });
       await interaction.followUp({ content: getExplorationNextTurnContent(nextChar) });
       return;
      }
      const fairyItem = await ItemModel.findOne({ itemName: "Fairy" }).lean().catch(() => null) || { itemName: "Fairy", emoji: "🧚", image: null };
      pushProgressLog(party, character.name, "fairy", `Found a Fairy in ${location}.`, undefined, Object.keys(rollCostsForLog).length ? rollCostsForLog : undefined);
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
      const nextChar = party.characters[party.currentTurn];
      const embed = createExplorationItemEmbed(party, character, fairyItem, expeditionId, location, party.totalHearts, party.totalStamina, nextChar ?? null, true, ruinRestRecovered, await hasDiscoveriesInQuadrant(party.square, party.quadrant), await hasUnpinnedDiscoveriesInQuadrant(party), { staminaCost: payResult?.staminaPaid ?? 0, heartsCost: payResult?.heartsPaid ?? 0 }, poolCaps.maxHearts, poolCaps.maxStamina, undefined, hazardRollResult?.hazardMessage ?? null, hotSpringMessage ?? null);
      if (!party.gatheredItems) party.gatheredItems = [];
      party.gatheredItems.push({ characterId: character._id, characterName: character.name, itemName: "Fairy", quantity: 1, emoji: fairyItem.emoji || "🧚" });
      party.markModified("gatheredItems");
      await party.save(); // Persist gatheredItems so dashboard/expedition record shows the Fairy
      await interaction.editReply({ embeds: [embed] });
      await interaction.followUp({ content: getExplorationNextTurnContent(nextChar) });
      if (!false) {
       try {
        await addItemInventoryDatabase(character._id, "Fairy", 1, interaction, "Exploration");
       } catch (err) {
        handleInteractionError(err, interaction, { source: "explore.js fairy" });
       }
      }
      return;
     }

     if (outcomeType === "chest" || outcomeType === "old_map" || outcomeType === "ruins" || outcomeType === "relic" || outcomeType === "camp" || outcomeType === "monster_camp" || outcomeType === "grotto") {
      let failedNotifyUserIds = [];
      let failedNotifyEmbed = null;
      let campHeartsRecovered = 0;
      let campStaminaRecovered = 0;
      if (outcomeType === "camp") {
       // Safe space: add recovery to pool only; cap at combined party max
       campHeartsRecovered = Math.floor(Math.random() * 3) + 1;
       campStaminaRecovered = Math.floor(Math.random() * 2) + 1;
       const campCaps = await getPartyPoolCaps(party);
       await ensurePartyMaxValues(party, campCaps);
       const beforeHearts = party.totalHearts ?? 0;
       const beforeStamina = party.totalStamina ?? 0;
       party.totalHearts = Math.min(campCaps.maxHearts, Math.max(0, beforeHearts + campHeartsRecovered));
       party.totalStamina = Math.min(campCaps.maxStamina, Math.max(0, beforeStamina + campStaminaRecovered));
       party.markModified("totalHearts");
       party.markModified("totalStamina");
       logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} camp_outcome 🟩${beforeStamina} +${campStaminaRecovered} → 🟩${party.totalStamina ?? 0}`);
      }

      let chosenMapOldMap = null;
      let savedOldMapDoc = null;
      if (outcomeType === "old_map") {
       chosenMapOldMap = getRandomOldMap();
       if (!false) {
        try {
         savedOldMapDoc = await addOldMapToCharacter(
          { _id: character._id, userId: character.userId, name: character.name },
          chosenMapOldMap.number,
          location
         );
         if (savedOldMapDoc) {
          logger.info(
           "OLD_MAP",
           `[explore.js] old_map roll persisted expedition=${expeditionId} mapId=${savedOldMapDoc.mapId} _id=${savedOldMapDoc._id} characterId=${character._id} characterName=${character.name} userId=${character.userId} mapNumber=${chosenMapOldMap.number}`
          );
         } else {
          logger.warn(
           "OLD_MAP",
           `[explore.js] old_map roll addOldMapToCharacter returned null expedition=${expeditionId} character=${character?.name} mapNumber=${chosenMapOldMap?.number}`
          );
         }
        } catch (err) {
         logger.error(
          "EXPLORE",
          `[explore.js]❌ old_map_save_failed expedition=${expeditionId} character=${character?.name || "?"} map=${chosenMapOldMap?.number || "?"} location=${location} error=${err?.message || err}`
         );
         handleInteractionError(err, interaction, { source: "explore.js old_map" });
        }
       }
       // Add old map to gatheredItems for dashboard display only if persistence succeeded.
       if (savedOldMapDoc) {
        if (!party.gatheredItems) party.gatheredItems = [];
        party.gatheredItems.push({
         characterId: character._id,
         characterName: character.name,
         itemName: chosenMapOldMap ? `Map #${chosenMapOldMap.number}` : "Old Map",
         quantity: 1,
         emoji: "🗺️",
        });
        party.markModified("gatheredItems");
       }
       const mapIdStr = savedOldMapDoc?.mapId ? `\`${savedOldMapDoc.mapId}\`` : "—";
       // DM only the party member who found the map, not the whole party
       const finderUserId = party.characters[characterIndex]?.userId || interaction.user?.id;
       const mapDmUserIds = finderUserId ? [finderUserId] : [];
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
       if (client && savedOldMapDoc) {
        failedNotifyEmbed = dmEmbed;
        for (const uid of mapDmUserIds) {
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
       if (!false) {
        try {
         const squareStr = String(party.square || "").trim().toUpperCase();
         const quadrantStr = String(party.quadrant || "").trim().toUpperCase();
         const mapSquareForRelic = await Square.findOne({ squareId: new RegExp(`^${String(party.square || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).lean();
         const regionStr = mapSquareForRelic?.region ?? "";
         savedRelic = await createRelic({
          name: "Unknown Relic",
          discoveredBy: character.name,
          characterId: character._id,
          discoveredDate: new Date(),
          locationFound: location,
          region: regionStr,
          square: squareStr,
          quadrant: quadrantStr,
          appraised: false,
         });
        } catch (err) {
         logger.error("EXPLORE", `[explore.js]❌ createRelic (roll): ${err?.message || err}`);
        }
       }
       if (!party.gatheredItems) party.gatheredItems = [];
       party.gatheredItems.push({ characterId: character._id, characterName: character.name, itemName: "Unknown Relic", quantity: 1, emoji: "🔸" });
       // Only DM the discoverer, not all party members
       const relicUserIds = [character.userId].filter(Boolean);
       const relicIdStr = savedRelic?.relicId ? `\`${savedRelic.relicId}\`` : '—';
       const relicDmEmbed = createRelicDmEmbed(character.name, location, relicIdStr, expeditionId);
       if (interaction.client) {
        failedNotifyEmbed = relicDmEmbed;
        const { failedUserIds: relicFailed } = await sendRelicDmToParty(interaction.client, relicDmEmbed, relicUserIds);
        failedNotifyUserIds.push(...relicFailed);
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
      // Safe space = random roll event; camp = /explore camp command only
      const progressOutcome = outcomeType === "ruins" ? "ruins_found" : outcomeType === "camp" ? "safe_space" : outcomeType;
      // Ruins, monster camp: defer detailed progressLog until button choice (Yes = counts, No = skipped)
      // Grotto: log discovery immediately so dashboard shows it; choice (Yes/No) adds follow-up entries
      // For one-find-per-expedition: monster_camp and ruins only log when user chooses Yes (ruins_found when they explore, monster_camp when they mark/fight)
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
       // Persist immediately so one-find-per-expedition is enforced on next roll (and so button handlers see correct progressLog)
       if (outcomeType === "grotto") {
        await party.save();
       }
      }
      // Note: monster_camp and ruins do NOT log here - they log when the user chooses (mark/fight/leave for camp; Yes for ruins)
      // Choice outcomes: don't advance until they choose; "Next" and ping = roller. Non-choice: advance now.
      let nextCharacter;
      if (outcomeType === "monster_camp" || outcomeType === "chest" || outcomeType === "ruins" || outcomeType === "grotto") {
       nextCharacter = party.characters[party.currentTurn];
      } else {
       party.currentTurn = (party.currentTurn + 1) % party.characters.length;
       await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
       nextCharacter = party.characters[party.currentTurn];
      }

      let title, description;
      if (outcomeType === "monster_camp") {
       title = `🗺️ **Expedition: Monster Camp found!**`;
       description =
        `**${character.name}** found something unsettling in **${location}**.\n\n` +
        "Um....You found a Monster Camp of some kind....!!! What do you want to do?\n\n" +
        "**Mark it** — Add to map and fight later. **No extra stamina cost** (you already paid for the roll). Counts toward this square's 3 discovery limit.\n" +
        "**Fight it** — Add to map and fight now. **No extra stamina cost.** Same as Mark, but you fight the wave here; refightable after Blood Moon.\n" +
        `**Leave it** — Don't mark. Won't be recorded as a discovery. Continue with </explore roll:${getExploreCommandId()}>.`;
      } else if (outcomeType === "chest") {
       title = `🗺️ **Expedition: Chest found!**`;
       description =
        `**${character.name}** found a chest in **${location}**!\n\n` +
        "Open chest? Costs 1 stamina.\n\n" +
        "**Yes** — Open the chest (1 item per party member, relics possible).\n" +
        `**No** — Continue exploring with </explore roll:${getExploreCommandId()}>.`;
      } else if (outcomeType === "old_map") {
       const mapInfo = savedOldMapDoc
        ? (chosenMapOldMap
           ? `**${character.name}** found **Map #${chosenMapOldMap.number}** in **${location}**!\n\nThe script is faded and hard to read—you'll need to take it to the Inariko Library to get it deciphered.\n\n**Saved to ${character.name}'s map collection.**`
           : `**${character.name}** found an old map in **${location}**!\n\nThe script is faded and hard to read—you'll need to take it to the Inariko Library to get it deciphered.\n\n**Saved to ${character.name}'s map collection.**`)
        : (chosenMapOldMap
           ? `**${character.name}** found **Map #${chosenMapOldMap.number}** in **${location}**!\n\nThe script is faded and hard to read, but there was a storage issue and it was **not saved** to their map collection. Please report this in bot reports with expedition ID \`${expeditionId}\`.`
           : `**${character.name}** found an old map in **${location}**!\n\nThere was a storage issue and it was **not saved** to their map collection. Please report this in bot reports with expedition ID \`${expeditionId}\`.`);
       title = `🗺️ **Expedition: Old map found!**`;
       description =
        mapInfo + `\n\nFind out more [here](${OLD_MAPS_LINK}).\n\n↳ **Continue** ➾ See **Commands** below to take your turn.`;
      } else if (outcomeType === "ruins") {
       title = `🗺️ **Expedition: Ruins found!**`;
       description =
        `**${character.name}** found some ruins in **${location}**!\n\n` +
        "**Yes** — Explore the ruins (cost 3 stamina; counts toward discovery limit).\n" +
        `**No** — Ignore it. Won't be recorded as a discovery. Use </explore roll:${getExploreCommandId()}> to continue.`;
      } else if (outcomeType === "relic") {
       title = `🗺️ **Expedition: Relic found!**`;
       description =
        `**${character.name}** found something ancient in **${location}**.\n\n` +
        "You found a relic! What is this? Take it to an Inarikian Artist or Researcher to get this appraised. You can find more info [here](https://rootsofthewild.com/mechanics/relics).\n\n" +
        "↳ **Continue** ➾ See **Commands** below to take your turn.";
      } else if (outcomeType === "grotto") {
       title = `🗺️ **Expedition: Grotto found!**`;
       description =
        `**${character.name}** stumbled across something strange in **${location}**.\n\n` +
        "You stumble across an interesting looking stump with roots covered in talismans. More info about grottos can be found [here](https://rootsofthewild.com/mechanics/grottos).\n\n" +
        "**Mark on map** — Save for later (counts toward this square's 3 discovery limit).\n" +
        "**Open** — Cleanse the grotto now (1 Goddess Plume + 1 stamina).";
      } else if (outcomeType === "camp") {
       // Random event: safe space (instant recovery). Not the /explore camp command.
       const safeSpaceFlavorRoll = getRandomSafeSpaceFlavor(quadrantMeta);
       title = `🗺️ **Expedition: Found a safe space and rested!**`;
       description =
        `**${character.name}** found a safe space in **${location}** and rested!\n\n\`\`\`\n${safeSpaceFlavorRoll}\n\`\`\`\n\nRecovered ❤️ **${campHeartsRecovered}** heart(s) and 🟩 **${campStaminaRecovered}** stamina.`;
      }

      const mapOrBannerUrl = getExploreMapImageUrl(party, { highlight: true });
      const embed = new EmbedBuilder()
       .setTitle(title)
       .setDescription(description)
       .setColor(getExploreOutcomeColor("explored", regionColors[party.region] || "#00ff99"))
       .setImage(mapOrBannerUrl);
      if (outcomeType === "grotto") {
       embed.setThumbnail(GROTTO_BANNER_UNCLEANSED_URL);
      }
      if (outcomeType === "relic") {
       embed.setThumbnail(UNAPPRAISED_RELIC_IMAGE_URL);
      }
      addExplorationStandardFields(embed, {
        party,
        expeditionId,
        location,
        nextCharacter: nextCharacter ?? null,
        showNextAndCommands: true,
        showRestSecureMove: false,
        ruinRestRecovered,
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
        actionCost: { staminaCost: payResult?.staminaPaid ?? 0, heartsCost: payResult?.heartsPaid ?? 0 },
        maxHearts: poolCaps.maxHearts,
        maxStamina: poolCaps.maxStamina,
        hazardMessage: hazardRollResult?.hazardMessage ?? null,
        hotSpringMessage: hotSpringMessage ?? null,
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

      const msg = await interaction.editReply({
       embeds: [embed],
       components,
      });
      if (failedNotifyUserIds.length > 0 && failedNotifyEmbed) {
       await interaction.followUp({
        content: failedNotifyUserIds.map((uid) => `<@${uid}>`).join(" ") + " — Couldn't DM you:",
        embeds: [failedNotifyEmbed],
       }).catch(() => {});
      }
      // Only ping next person when there are no buttons — if there are buttons, wait until they click (handler will ping)
      if (components.length === 0 && nextCharacter?.userId) {
       await interaction.followUp({ content: getExplorationNextTurnContent(nextCharacter) });
      }

      if (isYesNoChoice || isMonsterCampChoice) {
       const expectedUserId = interaction.user.id;
       const collector = msg.createMessageComponentCollector({
        filter: (i) => i.user.id === expectedUserId,
        time: 5 * 60 * 1000,
        max: 1,
       });
       collector.on("collect", async (i) => {
        try {
        await i.deferUpdate();
        const isYes = i.customId.endsWith("_yes") || i.customId.includes("_yes|");
        let disabledRow;
        if (isMonsterCampChoice) {
         disabledRow = createDisabledMonsterCampRow(expeditionId, characterIndex);
        } else {
         const collectLabels = outcomeType === "grotto" ? { yes: "Open", no: "Mark on map" } : { yes: "Yes", no: "No" };
         disabledRow = createDisabledYesNoRow(outcomeType, expeditionId, characterIndex, collectLabels);
        }
        await msg.edit({ components: [disabledRow] }).catch(() => {});

        if (outcomeType === "ruins" && isYes) {
         // Disable Yes/No buttons immediately so the original message stays with greyed-out buttons
         await msg.edit({ embeds: [embed], components: [disabledRow] }).catch(() => {});
         // Ruins exploration: charge 3 stamina, then roll one of chest/camp/landmark/relic/old_map/star_fragment/blight/goddess_plume
         const freshParty = await Party.findActiveByPartyId(expeditionId);
         if (!freshParty) {
          await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition not found.")], ephemeral: true }).catch(() => {});
          return;
         }
         const parts = i.customId.split("|");
         const ruinsCharIndex = parts.length >= 3 && /^\d+$/.test(parts[2])
          ? Math.max(0, Math.min(parseInt(parts[2], 10), freshParty.characters.length - 1))
          : (freshParty.currentTurn - 1 + freshParty.characters.length) % freshParty.characters.length;
         const ruinsCharSlot = freshParty.characters[ruinsCharIndex];
         const ruinsCharacter = await Character.findById(ruinsCharSlot._id);
         if (!ruinsCharacter) {
          await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Character not found**", "Character not found or you do not own this character.")], ephemeral: true }).catch(() => {});
          return;
         }
         // Consume the one-find-per-expedition only when they choose to explore (not when they skip)
         pushProgressLog(freshParty, ruinsCharacter.name, "ruins_found", `Found ruins in ${location}; exploring (cost 3 stamina).`, undefined, undefined, new Date());
         await freshParty.save();
         const ruinsStaminaCost = 3;
         const ruinsPayResult = await payStaminaOrStruggle(freshParty, ruinsCharIndex, ruinsStaminaCost, { order: "currentFirst", action: "ruins" });
         if (!ruinsPayResult.ok) {
          const partyTotalStamina = Math.max(0, freshParty.totalStamina ?? 0);
          const partyTotalHearts = Math.max(0, freshParty.totalHearts ?? 0);
          const noStaminaEmbed = new EmbedBuilder()
           .setTitle("❌ Not enough stamina or hearts to explore the ruins")
           .setColor(getExploreOutcomeColor("ruins_explored", regionColors[freshParty.region] || "#00ff99"))
           .setDescription("Party has " + partyTotalStamina + " 🟩 and " + partyTotalHearts + " ❤ (need 3 total). **Camp** to recover, or use hearts to **Struggle** (1 heart = 1 stamina).")
           .setImage(getExploreMapImageUrl(freshParty, { highlight: true }));
          addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(freshParty) });
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

         // Weighted roll: chest 8, camp 4, relic 1, old_map 3, star_fragment 2, blight 1, goddess_plume 1 (total 20)
         const roll = Math.random() * 20;
         let ruinsOutcome;
         if (roll < 8) ruinsOutcome = "chest";
         else if (roll < 12) ruinsOutcome = "camp";
         else if (roll < 13) ruinsOutcome = "relic";
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
          ruinsOutcome = "camp";
         }
         if (ruinsOutcome === "relic" && (await characterHasPendingRelic(ruinsCharacter))) {
          ruinsOutcome = "camp";
         }
         const ruinsAt = new Date();
         // Only mark ruins on the map when it's a rest spot (camp); other outcomes don't add a pin
         if (ruinsOutcome === "camp") {
          await pushDiscoveryToMap(freshParty, "ruins", ruinsAt, i.user?.id);
         }
         if (ruinsOutcome === "chest") {
          resultDescription = summaryLine + `**${ruinsCharacter.name}** explored the ruins and found a chest!\n\nOpen chest? Costs 1 stamina.\n\n**Yes** — Open the chest (1 item per party member, relics possible).\n**No** — Continue exploring with </explore roll:${getExploreCommandId()}>.`;
          progressMsg += "Found a chest (open for 1 stamina).";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, ruinsCostsForLog);
         } else if (ruinsOutcome === "camp") {
          const recover = 1; // Always 1 stamina
          const ruinCaps = await getPartyPoolCaps(freshParty);
          freshParty.totalStamina = Math.min(ruinCaps.maxStamina, Math.max(0, (freshParty.totalStamina ?? 0) + recover));
          freshParty.markModified("totalStamina");
          const mapSquareId = (freshParty.square && String(freshParty.square).trim()) || "";
          const mapQuadrantId = (freshParty.quadrant && String(freshParty.quadrant).trim().toUpperCase()) || "";
          if (mapSquareId && mapQuadrantId) {
           if (!freshParty.ruinRestQuadrants) freshParty.ruinRestQuadrants = [];
           const alreadyHas = freshParty.ruinRestQuadrants.some(
            (r) => String(r?.squareId || "").toUpperCase() === mapSquareId.toUpperCase() && String(r?.quadrantId || "").toUpperCase() === mapQuadrantId
           );
           if (!alreadyHas) {
            freshParty.ruinRestQuadrants.push({ squareId: mapSquareId, quadrantId: mapQuadrantId, stamina: recover });
            freshParty.markModified("ruinRestQuadrants");
           }
          }
          await freshParty.save(); // Always persist so dashboard shows current hearts/stamina/progress
          if (!false && freshParty.status === "started") {
           try {
            const resolvedRuinRest = await findExactMapSquareAndQuadrant(freshParty.square, freshParty.quadrant);
            if (resolvedRuinRest) {
             const { exactSquareId, exactQuadrantId } = resolvedRuinRest;
             await Square.updateOne(
              { squareId: exactSquareId, "quadrants.quadrantId": exactQuadrantId },
              { $set: { "quadrants.$[q].ruinRestStamina": recover } },
              { arrayFilters: [{ "q.quadrantId": exactQuadrantId }] }
             );
            }
           } catch (mapErr) {
            logger.warn("EXPLORE", `[explore.js]⚠️ Mark ruin-rest on map: ${mapErr?.message || mapErr}`);
           }
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found a solid camp spot in the ruins and recovered **${recover}** 🟩 stamina. Remember to add it to the map for future expeditions!\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a camp spot; recovered 1 stamina.";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, { ...ruinsCostsForLog, staminaRecovered: recover });
          pushProgressLog(freshParty, ruinsCharacter.name, "ruin_rest", `Found a ruin rest spot in ${location}.`, undefined, undefined, ruinsAt);
         } else if (ruinsOutcome === "relic") {
          let ruinsSavedRelic = null;
          if (!false) {
           try {
            const squareStrRuins = String(freshParty.square || "").trim().toUpperCase();
            const quadrantStrRuins = String(freshParty.quadrant || "").trim().toUpperCase();
            const mapSquareForRuins = await Square.findOne({ squareId: new RegExp(`^${String(freshParty.square || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).lean();
            const regionStrRuins = mapSquareForRuins?.region ?? "";
            ruinsSavedRelic = await createRelic({
             name: "Unknown Relic",
             discoveredBy: ruinsCharacter.name,
             characterId: ruinsCharacter._id,
             discoveredDate: new Date(),
             locationFound: location,
             region: regionStrRuins,
             square: squareStrRuins,
             quadrant: quadrantStrRuins,
             appraised: false,
            });
           } catch (err) {
            logger.error("EXPLORE", `[explore.js]❌ createRelic (ruins): ${err?.message || err}`);
           }
          }
          if (!freshParty.gatheredItems) freshParty.gatheredItems = [];
          freshParty.gatheredItems.push({ characterId: ruinsCharacter._id, characterName: ruinsCharacter.name, itemName: "Unknown Relic", quantity: 1, emoji: "🔸" });
          const ruinsRelicIdStr = ruinsSavedRelic?.relicId ? `\`${ruinsSavedRelic.relicId}\`` : '—';
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found a relic in the ruins! (ID: ${ruinsRelicIdStr}) Take it to an Inarikian Artist or Researcher to get it appraised. More info [here](https://rootsofthewild.com/mechanics/relics).\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a relic (take to Artist/Researcher to appraise).";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, ruinsCostsForLog);
          pushProgressLog(freshParty, ruinsCharacter.name, "relic", `Found a relic in ${location}; take to Artist/Researcher to appraise.`, { itemName: "Unknown Relic", emoji: "🔸" }, undefined);
          // Only DM the discoverer, not all party members
          const relicUserIds = [ruinsCharacter.userId].filter(Boolean);
          const relicDmEmbed = createRelicDmEmbed(ruinsCharacter.name, location, ruinsRelicIdStr, expeditionId);
          if (i.client) {
           ruinsFailedNotifyEmbed = relicDmEmbed;
           const { failedUserIds: relicFailed } = await sendRelicDmToParty(i.client, relicDmEmbed, relicUserIds);
           ruinsFailedNotifyUserIds.push(...relicFailed);
          }
         } else if (ruinsOutcome === "old_map") {
          const chosenMap = getRandomOldMap();
          let ruinsSavedMapDoc = null;
          if (!false) {
           try {
            ruinsSavedMapDoc = await addOldMapToCharacter(
             { _id: ruinsCharacter._id, userId: ruinsCharacter.userId, name: ruinsCharacter.name },
             chosenMap.number,
             location
            );
            if (ruinsSavedMapDoc) {
             logger.info(
              "OLD_MAP",
              `[explore.js] ruins old_map persisted expedition=${expeditionId} mapId=${ruinsSavedMapDoc.mapId} _id=${ruinsSavedMapDoc._id} characterId=${ruinsCharacter._id} characterName=${ruinsCharacter.name} userId=${ruinsCharacter.userId} mapNumber=${chosenMap.number}`
             );
            } else {
             logger.warn(
              "OLD_MAP",
              `[explore.js] ruins addOldMapToCharacter returned null expedition=${expeditionId} character=${ruinsCharacter?.name} mapNumber=${chosenMap?.number}`
             );
            }
           } catch (err) {
            logger.error(
             "EXPLORE",
             `[explore.js]❌ ruins_old_map_save_failed expedition=${expeditionId} character=${ruinsCharacter?.name || "?"} map=${chosenMap?.number || "?"} location=${location} error=${err?.message || err}`
            );
            handleInteractionError(err, i, { source: "explore.js ruins old_map" });
           }
          }
          // Add old map to gatheredItems for dashboard display only if persistence succeeded.
          if (ruinsSavedMapDoc) {
           if (!freshParty.gatheredItems) freshParty.gatheredItems = [];
           freshParty.gatheredItems.push({
            characterId: ruinsCharacter._id,
            characterName: ruinsCharacter.name,
            itemName: `Map #${chosenMap.number}`,
            quantity: 1,
            emoji: "🗺️",
           });
           freshParty.markModified("gatheredItems");
          }
          const ruinsMapIdStr = ruinsSavedMapDoc?.mapId ? ` Map ID: \`${ruinsSavedMapDoc.mapId}\`.` : "";
          resultDescription = ruinsSavedMapDoc
           ? summaryLine + `**${ruinsCharacter.name}** found **Map #${chosenMap.number}** in the ruins! The script is faded and hard to read—take it to the Inariko Library to get it deciphered.\n\n**Saved to ${ruinsCharacter.name}'s map collection.**${ruinsMapIdStr} Find out more about maps [here](${OLD_MAPS_LINK}).\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`
           : summaryLine + `**${ruinsCharacter.name}** found **Map #${chosenMap.number}** in the ruins! The script is faded and hard to read, but there was a storage issue and it was **not saved** to their map collection. Please report this in bot reports with expedition ID \`${expeditionId}\`.\n\nFind out more about maps [here](${OLD_MAPS_LINK}).\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += ruinsSavedMapDoc
           ? `Found Map #${chosenMap.number}; saved to map collection. Take to Inariko Library to decipher.`
           : `Found Map #${chosenMap.number}; map persistence failed (not saved).`;
          lootForLog = { itemName: `Map #${chosenMap.number}`, emoji: "" };
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, lootForLog, ruinsCostsForLog);
          pushProgressLog(
           freshParty,
           ruinsCharacter.name,
           "old_map",
           ruinsSavedMapDoc
            ? `Found Map #${chosenMap.number} in ruins in ${location}; take to Inariko Library to decipher.`
            : `Found Map #${chosenMap.number} in ruins in ${location}; map was not saved due to persistence error.`,
           lootForLog,
           undefined,
           new Date()
          );
          // DM only the party member who found the map, not the whole party
          const ruinsFinderUserId = freshParty.characters[ruinsCharIndex]?.userId || i.user?.id;
          const ruinsMapDmUserIds = ruinsFinderUserId ? [ruinsFinderUserId] : [];
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
          if (client && ruinsSavedMapDoc) {
           ruinsFailedNotifyEmbed = dmEmbed;
           for (const uid of ruinsMapDmUserIds) {
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
          if (!false) {
           try {
            await addItemInventoryDatabase(ruinsCharacter._id, "Star Fragment", 1, i, "Exploration - Ruins");
           } catch (err) {
            handleInteractionError(err, i, { source: "explore.js ruins star_fragment" });
           }
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** collected a **Star Fragment** in the ruins!\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a Star Fragment.";
          lootForLog = { itemName: "Star Fragment", emoji: "" };
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, lootForLog, ruinsCostsForLog);
         } else if (ruinsOutcome === "blight") {
          const partyHadBlightCandle = await partyHasRelic(freshParty.characters || [], 'Blight Candle');
          const candleSave = partyHadBlightCandle && Math.random() < 0.5;
          if (candleSave) {
           try {
            await consumeBlightCandleUse(ruinsCharacter._id, ruinsCharacter.name);
           } catch (err) {
            logger.warn("EXPLORE", `[explore.js] Blight Candle consume (ruins save) failed: ${err?.message || err}`);
           }
           progressMsg += `Found blight; party's Blight Candle repelled it—narrow escape.`;
           resultDescription = summaryLine + `**${ruinsCharacter.name}** found **blight** in the ruins, but the party's **Blight Candle** flared and repelled it. Narrow escape!\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          } else {
           progressMsg += `Found blight; ${ruinsCharacter.name} is now blighted.`;
           if (!false) {
            try {
             await finalizeBlightApplication(ruinsCharacter, ruinsCharacter.userId, {
              client: i.client,
              guild: i.guild,
              source: "Ruins exploration",
              alreadySaved: false,
             });
            } catch (err) {
             handleInteractionError(err, i, { source: "explore.js ruins blight finalize" });
             logger.warn("EXPLORE", `[explore.js]⚠️ Ruins blight finalizeBlightApplication: ${err?.message || err}`);
            }
           }
           resultDescription = summaryLine + `**${ruinsCharacter.name}** found… **BLIGHT** in the ruins. They've been blighted! You can be healed by **Oracles, Sages & Dragons**. [Learn more about blight stages and healing](https://rootsofthewild.com/world/blight)\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          }
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, ruinsCostsForLog);
         } else {
          // goddess_plume
          if (!false) {
           try {
            await addItemInventoryDatabase(ruinsCharacter._id, "Goddess Plume", 1, i, "Exploration - Ruins");
           } catch (err) {
            handleInteractionError(err, i, { source: "explore.js ruins goddess_plume" });
           }
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** excavated a **Goddess Plume** from the ruins!\n\n↳ **Continue** ➾ </explore roll:${getExploreCommandId()}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Excavated a Goddess Plume.";
          lootForLog = { itemName: "Goddess Plume", emoji: "" };
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, lootForLog, ruinsCostsForLog);
         }
         // Persist progress log (incl. "ruins" entry for Report to town hall) before showing embed/buttons
         await freshParty.save(); // Always persist so dashboard shows current hearts/stamina/progress
         const finalParty = await Party.findActiveByPartyId(expeditionId);
         const ruinsPoolCaps = await getPartyPoolCaps(finalParty);
         const resultEmbed = new EmbedBuilder()
          .setTitle(resultTitle)
          .setDescription(resultDescription)
          .setColor(getExploreOutcomeColor("ruins_explored", regionColors[finalParty?.region] || "#00ff99"))
          .setImage(getExploreMapImageUrl(finalParty, { highlight: true }));
         addExplorationStandardFields(resultEmbed, {
          party: finalParty,
          expeditionId,
          location,
          nextCharacter: nextCharacter ?? null,
          showNextAndCommands: true,
          showRestSecureMove: false,
          ruinRestRecovered,
          hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(finalParty.square, finalParty.quadrant),
          actionCost: { staminaCost: ruinsPayResult?.staminaPaid ?? 0, heartsCost: ruinsPayResult?.heartsPaid ?? 0 },
          maxHearts: ruinsPoolCaps.maxHearts,
          maxStamina: ruinsPoolCaps.maxStamina,
        });
         // Only prompt to set a pin when ruins yielded a rest spot (camp); other outcomes are not placed on the map
         if (ruinsOutcome === "camp") {
          const explorePageUrl = getExplorePageUrl(expeditionId);
          resultEmbed.addFields({
           name: "📍 **__Set pin on webpage__**",
           value: `Set a pin for this discovery on the **explore/${expeditionId}** page: ${explorePageUrl}`,
           inline: false,
          });
         }

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
               .setDescription(`Something went wrong opening the chest. Try </explore roll:${getExploreCommandId()}> to continue.`)
               .setImage(getExploreMapImageUrl(fp, { highlight: true }));
              addExplorationStandardFields(errEmbed, { party: fp || {}, expeditionId, location, nextCharacter: fp?.characters?.[fp.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(fp?.square, fp?.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(fp) });
              await resultMsg.edit({ embeds: [errEmbed], components: [chestDisabledRow] }).catch(() => {});
              chestCollector.stop();
              return;
             }
             if (result.notEnoughStamina) {
              const fp = await Party.findActiveByPartyId(expeditionId);
              const noStamEmbed = new EmbedBuilder()
               .setTitle(resultTitle)
               .setColor(getExploreOutcomeColor("ruins_explored", regionColors[fp?.region] || "#00ff99"))
               .setDescription(resultDescription.split("\n\n")[0] + "\n\n❌ **Not enough stamina or hearts to open the chest.** Party has " + (fp?.totalStamina ?? 0) + " 🟩 and " + (fp?.totalHearts ?? 0) + " ❤ (need 1). **Camp** to recover, or use hearts to **Struggle** (1 heart = 1 stamina).")
               .setImage(getExploreMapImageUrl(fp, { highlight: true }));
              addExplorationStandardFields(noStamEmbed, { party: fp, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(fp.square, fp.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(fp) });
              await resultMsg.edit({ embeds: [noStamEmbed], components: [chestDisabledRow] }).catch(() => {});
              chestCollector.stop();
              return;
             }
            if (result?.lootEmbed) {
              const fp = await Party.findActiveByPartyId(expeditionId);
              const openedEmbed = new EmbedBuilder()
               .setTitle(resultTitle)
               .setColor(getExploreOutcomeColor("ruins_explored", regionColors[fp?.region] || "#00ff99"))
               .setDescription(resultDescription.split("\n\n")[0] + `\n\n**Chest opened!** Continue with </explore roll:${getExploreCommandId()}>.`)
               .setImage(getExploreMapImageUrl(fp, { highlight: true }));
              addExplorationStandardFields(openedEmbed, { party: fp, expeditionId, location, nextCharacter: result.nextCharacter ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(fp.square, fp.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(fp) });
              await resultMsg.edit({ embeds: [openedEmbed], components: [chestDisabledRow] }).catch(() => {});
              await ci.followUp({ embeds: [result.lootEmbed] }).catch(() => {});
              const next = result.nextCharacter;
              const whoNextContent = getExplorationNextTurnContent(next);
              if (whoNextContent) await ci.followUp({ content: whoNextContent }).catch(() => {});
            }
            } else {
             // Chest in ruins was skipped - advance turn
             const ruinsChestSkipParty = await Party.findActiveByPartyId(expeditionId);
             if (ruinsChestSkipParty && ruinsChestSkipParty.characters?.length > 0) {
              ruinsChestSkipParty.currentTurn = (ruinsChestSkipParty.currentTurn + 1) % ruinsChestSkipParty.characters.length;
              await ruinsChestSkipParty.save();
             }
             const nextAfterRuinsChestSkip = ruinsChestSkipParty?.characters?.[ruinsChestSkipParty.currentTurn] ?? null;
             const skipEmbed = new EmbedBuilder()
              .setTitle(resultTitle)
              .setColor(getExploreOutcomeColor("ruins_explored", regionColors[ruinsChestSkipParty?.region] || "#00ff99"))
              .setDescription(resultDescription.split("\n\n")[0] + `\n\n**Chest wasn't opened!** Continue with </explore roll:${getExploreCommandId()}>.`)
              .setImage(getExploreMapImageUrl(ruinsChestSkipParty, { highlight: true }));
             addExplorationStandardFields(skipEmbed, { party: ruinsChestSkipParty, expeditionId, location, nextCharacter: nextAfterRuinsChestSkip, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(ruinsChestSkipParty.square, ruinsChestSkipParty.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(ruinsChestSkipParty) });
             await resultMsg.edit({ embeds: [skipEmbed], components: [chestDisabledRow] }).catch(() => {});
             if (getExplorationNextTurnContent(nextAfterRuinsChestSkip)) await ci.followUp({ content: getExplorationNextTurnContent(nextAfterRuinsChestSkip) }).catch(() => {});
            }
            chestCollector.stop();
           });
           chestCollector.on("end", (collected, reason) => {
            if (reason === "time" && collected.size === 0) {
             disableMessageButtonsOnTimeout(resultMsg, chestDisabledRow);
            }
           });
          }
         } else {
          // Ruins exploration complete (non-chest outcomes) - advance turn only if no one else took a turn (e.g. item) in between
          const ruinsFinalParty = await Party.findActiveByPartyId(expeditionId);
          const ruinsClickerParts = i.customId.split("|");
          const ruinsClickerIndex = ruinsClickerParts.length >= 3 && /^\d+$/.test(ruinsClickerParts[2])
            ? Math.max(0, Math.min(parseInt(ruinsClickerParts[2], 10), (ruinsFinalParty?.characters?.length ?? 1) - 1))
            : -1;
          if (ruinsFinalParty && ruinsFinalParty.characters?.length > 0 && ruinsClickerIndex >= 0 && ruinsClickerIndex === ruinsFinalParty.currentTurn) {
           ruinsFinalParty.currentTurn = (ruinsFinalParty.currentTurn + 1) % ruinsFinalParty.characters.length;
           await ruinsFinalParty.save();
          }
          const ruinsNextChar = ruinsFinalParty?.characters?.[ruinsFinalParty.currentTurn] ?? null;

          await i.followUp({ embeds: [resultEmbed] }).catch(() => {});
          if (ruinsFailedNotifyUserIds.length > 0 && ruinsFailedNotifyEmbed) {
           await i.followUp({
            content: ruinsFailedNotifyUserIds.map((uid) => `<@${uid}>`).join(" ") + " — Couldn't DM you:",
            embeds: [ruinsFailedNotifyEmbed],
           }).catch(() => {});
          }
          await i.followUp({
            content: getExplorationNextTurnContent(ruinsNextChar),
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
            .setDescription(`Something went wrong opening the chest. Try </explore roll:${getExploreCommandId()}> to continue.`)
            .setImage(getExploreMapImageUrl(freshParty, { highlight: true }));
           addExplorationStandardFields(errEmbed, { party: freshParty || {}, expeditionId, location, nextCharacter: freshParty?.characters?.[freshParty.currentTurn] ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty?.square, freshParty?.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(freshParty) });
           await msg.edit({ embeds: [errEmbed], components: [disabledRow] }).catch(() => {});
           return;
          }
          if (result.notEnoughStamina) {
           const freshParty = await Party.findActiveByPartyId(expeditionId);
           const noStaminaEmbed = new EmbedBuilder()
            .setTitle("🗺️ **Expedition: Chest found!**")
            .setColor(regionColors[freshParty?.region] || "#00ff99")
            .setDescription(description.split("\n\n")[0] + "\n\n❌ **Not enough stamina or hearts to open the chest.** Party has " + (freshParty?.totalStamina ?? 0) + " 🟩 and " + (freshParty?.totalHearts ?? 0) + " ❤ (need 1). **Camp** to recover, or use hearts to **Struggle** (1 heart = 1 stamina).")
            .setImage(getExploreMapImageUrl(freshParty, { highlight: true }));
           addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(freshParty) });
           await msg.edit({ embeds: [noStaminaEmbed], components: [disabledRow] }).catch(() => {});
          return;
          }
          if (result?.lootEmbed) {
           const freshParty = await Party.findActiveByPartyId(expeditionId);
           const openedEmbed = new EmbedBuilder()
            .setTitle("🗺️ **Expedition: Chest opened!**")
            .setColor(regionColors[freshParty?.region] || "#00ff99")
            .setDescription(description.split("\n\n")[0] + `\n\n**Chest opened!** Continue with </explore roll:${getExploreCommandId()}>.`)
            .setImage(getExploreMapImageUrl(freshParty, { highlight: true }));
           addExplorationStandardFields(openedEmbed, { party: freshParty, expeditionId, location, nextCharacter: result.nextCharacter ?? null, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(freshParty) });
           await msg.edit({ embeds: [openedEmbed], components: [disabledRow] }).catch(() => {});
           await i.followUp({ embeds: [result.lootEmbed] }).catch(() => {});
           const next = result.nextCharacter;
           const whoNextContent = getExplorationNextTurnContent(next);
           if (whoNextContent) await i.followUp({ content: whoNextContent }).catch(() => {});
           return;
          }
          return;
         }
         party.currentTurn = (party.currentTurn + 1) % party.characters.length;
         await party.save();
         const nextAfterChestNo = party.characters[party.currentTurn];
         const skipEmbed = new EmbedBuilder()
          .setTitle("🗺️ **Expedition: Chest wasn't opened!**")
          .setColor(getExploreOutcomeColor("explored", regionColors[party.region] || "#00ff99"))
          .setDescription(description.split("\n\n")[0] + `\n\n**Chest wasn't opened!** Continue with </explore roll:${getExploreCommandId()}>.`)
          .setImage(getExploreMapImageUrl(party, { highlight: true }));
         addExplorationStandardFields(skipEmbed, { party, expeditionId, location, nextCharacter: nextAfterChestNo, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party) });
         await msg.edit({ embeds: [skipEmbed], components: [disabledRow] }).catch(() => {});
         if (getExplorationNextTurnContent(nextAfterChestNo)) await i.followUp({ content: getExplorationNextTurnContent(nextAfterChestNo) }).catch(() => {});
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
          party.currentTurn = (party.currentTurn + 1) % party.characters.length;
          await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
          const nextAfterChoice = party.characters[party.currentTurn];
          const explorePageUrlMark = getExplorePageUrl(expeditionId);
          const monsterCampEmbed = new EmbedBuilder()
           .setTitle("🗺️ **Expedition: Monster Camp found!**")
           .setColor(getExploreOutcomeColor("monster_camp", regionColors[party.region] || "#00ff99"))
           .setDescription(
            description.split("\n\n")[0] + "\n\n" +
            `✅ **Marked on map.** You can fight it when you return (or after the next Blood Moon if already cleared). Continue with </explore roll:${getExploreCommandId()}>.`
           )
           .setImage(getExploreMapImageUrl(party, { highlight: true }));
          monsterCampEmbed.addFields({
           name: "📍 **__Set pin on map__**",
           value: `Set a pin for this monster camp on the **explore/${expeditionId}** page so you can revisit it later: ${explorePageUrlMark}`,
           inline: false,
          });
          addExplorationStandardFields(monsterCampEmbed, { party, expeditionId, location, nextCharacter: nextAfterChoice, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party) });
          await msg.edit({ embeds: [monsterCampEmbed], components: [disabledRow] }).catch(() => {});
          if (getExplorationNextTurnContent(nextAfterChoice)) await i.followUp({ content: getExplorationNextTurnContent(nextAfterChoice) }).catch(() => {});
          return;
         }
         if (monsterCampChoice === "fight") {
          const freshParty = await Party.findActiveByPartyId(expeditionId);
          if (!freshParty) {
           await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition not found.")], ephemeral: true }).catch(() => {});
           return;
          }
          const squareId = (freshParty.square && String(freshParty.square).trim()) || "";
          const quadrantId = (freshParty.quadrant && String(freshParty.quadrant).trim()) || "";
          const regionKey = (freshParty.region && String(freshParty.region).trim()) || "Eldin";
          const regionCapitalized = regionKey.charAt(0).toUpperCase() + regionKey.slice(1).toLowerCase();
          let camp;
          try {
           camp = await MonsterCamp.createCamp(squareId, quadrantId, regionCapitalized);
          } catch (err) {
           logger.error("EXPLORE", `[explore.js]❌ MonsterCamp createCamp: ${err?.message || err}`);
           await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Monster camp failed**", "Failed to create monster camp.")], ephemeral: true }).catch(() => {});
           return;
          }
          const isFightable = await MonsterCamp.isFightable(camp);
          if (!isFightable) {
           pushProgressLog(freshParty, character.name, "monster_camp_fight_blocked", `Found a monster camp in ${location}; camp recently cleared (wait for Blood Moon).`, undefined, monsterCampCosts, at);
           await freshParty.save(); // Always persist so dashboard shows current hearts/stamina/progress
           const blockedEmbed = new EmbedBuilder()
            .setTitle("🗺️ **Expedition: Monster Camp found!**")
            .setColor(getExploreOutcomeColor("monster_camp_fight_blocked", regionColors[freshParty.region] || "#00ff99"))
            .setDescription(
             description.split("\n\n")[0] + "\n\n" +
             `🔴 **This camp was recently cleared.** Wait for the next Blood Moon to fight it again. Continue with </explore roll:${getExploreCommandId()}>.`
            )
            .setImage(getExploreMapImageUrl(freshParty, { highlight: true }));
          addExplorationStandardFields(blockedEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(freshParty) });
          await msg.edit({ embeds: [blockedEmbed], components: [disabledRow] }).catch(() => {});
          return;
          }
          await pushDiscoveryToMap(freshParty, "monster_camp", at, i.user?.id, { campId: camp.campId });
          const village = REGION_TO_VILLAGE[regionKey?.toLowerCase()] || "Inariko";
          const difficultyGroup = pickWeighted(MONSTER_CAMP_DIFFICULTY_WEIGHTS);
          const monsterCount = pickWeighted(MONSTER_CAMP_COUNT_WEIGHTS);
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
           await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Wave failed to start**", `Failed to start wave: ${waveErr?.message || "Unknown error"}`)], ephemeral: true }).catch(() => {});
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
          const firstCharName = joinedNames[0] || null;
          const firstCharSlot = firstCharName ? freshParty.characters.find(c => c.name === firstCharName) : null;
          const turnOrderNote = joinedNames.length > 1
           ? `\n\n**Turn order:** ${joinedNames.map((n, i) => i === 0 ? `**${n}** (first)` : n).join(" → ")}`
           : "";
          const firstUpPing = firstCharSlot?.userId ? `\n\n<@${firstCharSlot.userId}> — **${firstCharName}**, you're up first!` : "";
          await i.channel.send({
           content: `🌊 **MONSTER CAMP WAVE!** — A wave has been triggered at **${location}**!\n\n${joinNote}Use </wave:${getWaveCommandId()}> to take your turn (id: \`${waveId}\`). **The expedition pauses until the wave is complete.**\n</explore item:${getExploreCommandId()}> to heal during the wave!${turnOrderNote}${firstUpPing}`,
           embeds: [waveEmbed],
          });
          if (failedJoins.length > 0) {
           logger.warn("EXPLORE", `[explore.js]⚠️ Monster camp wave: could not join: ${failedJoins.join("; ")}`);
          }
          pushProgressLog(freshParty, character.name, "monster_camp_fight", `Found a monster camp in ${location}; started wave ${waveId}. All party members must fight. Set a pin on the explore page to revisit later.`, undefined, monsterCampCosts, at);
          await freshParty.save(); // Always persist so dashboard shows current hearts/stamina/progress
          const explorePageUrlFight = getExplorePageUrl(expeditionId);
          const monsterCampEmbed = new EmbedBuilder()
           .setTitle("🗺️ **Expedition: Monster Camp found!**")
           .setColor(getExploreOutcomeColor("monster_camp_fight", regionColors[freshParty.region] || "#00ff99"))
           .setDescription(
            description.split("\n\n")[0] + "\n\n" +
            `✅ **Fighting now!** All party members must fight. Use </wave:${getWaveCommandId()}> to take turns (id: \`${waveId}\`). **Do not use </explore roll:${getExploreCommandId()}> until the wave is complete.**\n\n📍 **Set a pin** on the explore page below so you can revisit this camp later.`
           )
           .setImage(getExploreMapImageUrl(freshParty, { highlight: true }));
          monsterCampEmbed.addFields({
           name: "📍 **Add this camp to the map**",
           value: `Set a pin for this monster camp on the **explore/${expeditionId}** page so you can revisit it later: ${explorePageUrlFight}`,
           inline: false,
          });
          addExplorationStandardFields(monsterCampEmbed, { party: freshParty, expeditionId, location, nextCharacter: null, showNextAndCommands: false, showRestSecureMove: false, ruinRestRecovered, hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(freshParty) });
          await msg.edit({ embeds: [monsterCampEmbed], components: [disabledRow] }).catch(() => {});
          return;
         }
         if (monsterCampChoice === "leave") {
          pushProgressLog(party, character.name, "monster_camp_skipped", `Found a monster camp in ${location}; didn't mark it (won't count toward discovery limit).`, undefined, monsterCampCosts, at);
          party.currentTurn = (party.currentTurn + 1) % party.characters.length;
          await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
          const nextAfterChoice = party.characters[party.currentTurn];
          const monsterCampEmbed = new EmbedBuilder()
           .setTitle("🗺️ **Expedition: Monster Camp found!**")
           .setColor(getExploreOutcomeColor("monster_camp_skipped", regionColors[party.region] || "#00ff99"))
           .setDescription(
            description.split("\n\n")[0] + "\n\n" +
            `✅ **${character.name} chose to ignore the monster camp.** Won't be recorded as a discovery (squares have 3 max). Continue with </explore roll:${getExploreCommandId()}>.`
           )
           .setImage(getExploreMapImageUrl(party, { highlight: true }));
          addExplorationStandardFields(monsterCampEmbed, { party, expeditionId, location, nextCharacter: nextAfterChoice, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party) });
          await msg.edit({ embeds: [monsterCampEmbed], components: [disabledRow] }).catch(() => {});
          if (nextAfterChoice) {
           await i.followUp({
            content: nextAfterChoice.userId ? `<@${nextAfterChoice.userId}>` : undefined,
            embeds: [createMonsterCampSkippedNextTurnEmbed(character.name, nextAfterChoice)],
           }).catch(() => {});
          }
          return;
         }
        }

        if (outcomeType === "grotto") {
         const at = new Date();
         await msg.edit({ components: [disabledRow] }).catch(() => {});
         if (isYes) {
          party.currentTurn = (party.currentTurn + 1) % party.characters.length;
          await party.save();
          const nextAfterChoice = party.characters[party.currentTurn];
          await handleGrottoCleanse(i, msg, party, expeditionId, characterIndex, location, disabledRow, nextAfterChoice, ruinRestRecovered);
          return;
         }
         // No = mark on map for later — send new result embed only; original "Grotto found" message stays
         await pushDiscoveryToMap(party, "grotto", at, i.user?.id);
         pushProgressLog(party, character.name, "grotto", `Found a grotto in ${location}; marked on map for later.`, undefined, undefined, at);
         party.currentTurn = (party.currentTurn + 1) % party.characters.length;
         await party.save();
         const nextAfterChoice = party.characters[party.currentTurn];
         const explorePageUrlNo = getExplorePageUrl(expeditionId);
         const resultEmbed = new EmbedBuilder()
          .setTitle("✅ **Marked on map**")
          .setColor(getExploreOutcomeColor("grotto", regionColors[party.region] || "#00ff99"))
          .setDescription(`**${character.name}** marked the grotto on the map for later. Continue with </explore roll:${getExploreCommandId()}>.`)
          .setImage(getExploreMapImageUrl(party, { highlight: true }));
         addExplorationStandardFields(resultEmbed, { party, expeditionId, location, nextCharacter: nextAfterChoice, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant), hasUnpinnedDiscoveriesInQuadrant: false });
         resultEmbed.addFields({
          name: "📍 **__Set pin on map__**",
          value: `Set a pin for this grotto on the [explore page](${explorePageUrlNo}) so it stays on the map.`,
          inline: false,
         });
         await i.followUp({ embeds: [resultEmbed] }).catch(() => {});
         if (nextAfterChoice?.userId) {
          await i.followUp({ content: getExplorationNextTurnContent(nextAfterChoice) || `<@${nextAfterChoice.userId}> — **you're up next.**` }).catch(() => {});
         }
         return;
        }

        if (outcomeType === "ruins" && !isYes) {
         const at = new Date();
         pushProgressLog(party, character.name, "ruins_skipped", `Found ruins in ${location}; didn't explore (won't count toward discovery limit).`, undefined, undefined, at);
         party.currentTurn = (party.currentTurn + 1) % party.characters.length;
         await party.save(); // Always persist so dashboard shows current hearts/stamina/progress
        }

        const nextForChoiceEmbed = (outcomeType === "ruins" && !isYes) ? party.characters[party.currentTurn] : nextCharacter;
        const intro = description.split("\n\n")[0];
        const choiceEmbed = new EmbedBuilder()
         .setTitle(title)
.setColor(getExploreOutcomeColor("explored", regionColors[party.region] || "#00ff99"))
  .setImage(getExploreMapImageUrl(party, { highlight: true }));
        if (outcomeType === "ruins") {
         choiceEmbed.setDescription(
          intro +
          "\n\n" +
          (isYes
           ? "✅ **You chose to explore the ruins!** (Cost 3 stamina.)"
           : `✅ **${character.name} didn't explore the ruins.**`)
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
          nextCharacter: nextForChoiceEmbed ?? null,
          showNextAndCommands: true,
          showRestSecureMove: false,
          ruinRestRecovered,
          hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
          hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
        });
        await msg.edit({ embeds: [choiceEmbed], components: [disabledRow] }).catch(() => {});
        if (outcomeType === "ruins" && !isYes && nextForChoiceEmbed?.userId) {
         await i.followUp({
          content: `**${character.name}** decided not to explore the ruins! ${getExplorationNextTurnContent(nextForChoiceEmbed) || `<@${nextForChoiceEmbed.userId}> — **you're up next.**`}`,
         }).catch(() => {});
        }
        collector.stop();
        } catch (collectErr) {
         logger.error("EXPLORE", `[explore.js]❌ Collector collect handler error: ${collectErr?.message || collectErr}`);
         collector.stop();
         if (i && !i.replied && !i.deferred) {
          const rollAgainCmd = getExploreCommandId() ? `Try </explore roll:${getExploreCommandId()}> again.` : "Try /explore roll again.";
          await i.reply({ content: `❌ Something went wrong processing your choice. ${rollAgainCmd}`, flags: 64 }).catch(() => {});
         } else if (i?.followUp) {
          await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Choice error**", `Something went wrong processing your choice. ${rollAgainCmd}`)], flags: 64 }).catch(() => {});
         }
        }
       });
       collector.on("end", async (collected, reason) => {
        if (reason === "time" && collected.size === 0) {
         const fp = await Party.findActiveByPartyId(expeditionId);
         if (fp) {
          if (outcomeType === "monster_camp") {
           pushProgressLog(fp, character.name, "monster_camp_skipped", `Found a monster camp in ${location}; choice timed out (not marked).`, undefined, Object.keys(rollCostsForLog).length ? rollCostsForLog : undefined, new Date());
           disableMessageButtonsOnTimeout(msg, createDisabledMonsterCampRow(expeditionId, characterIndex));
          } else if (outcomeType === "ruins") {
           pushProgressLog(fp, character.name, "ruins_skipped", `Found ruins in ${location}; choice timed out (left for later).`, undefined, undefined, new Date());
          } else if (outcomeType === "grotto") {
           pushProgressLog(fp, character.name, "grotto_skipped", `Found a grotto in ${location}; choice timed out (no action).`, undefined, undefined, new Date());
          } else if (outcomeType === "chest") {
           pushProgressLog(fp, character.name, "chest_skipped", `Found a chest in ${location}; choice timed out (wasn't opened).`, undefined, undefined, new Date());
          }
          if (fp.characters?.length > 0) {
           await fp.advanceTurn();
          } else {
           await fp.save();
          }
         }
         if (outcomeType !== "monster_camp") {
          const timeoutLabels = outcomeType === "grotto" ? { yes: "Open", no: "Mark on map" } : { yes: "Yes", no: "No" };
          disableMessageButtonsOnTimeout(msg, createDisabledYesNoRow(outcomeType, expeditionId, characterIndex, timeoutLabels));
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
       return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **No items**", "No items available for this region.")] });
      }

      const quadrantMetaForItem = await getQuadrantMeta(party.square, party.quadrant);
      const quadrantWeightedList = createQuadrantWeightedExplorationItemList(availableItems, 50, quadrantMetaForItem);
      let selectedItem;
      if (quadrantWeightedList.length > 0) {
       selectedItem = quadrantWeightedList[Math.floor(Math.random() * quadrantWeightedList.length)];
      } else {
       const hasQuadrantRestriction = (Array.isArray(quadrantMetaForItem.terrain) && quadrantMetaForItem.terrain.length > 0) ||
         (Array.isArray(quadrantMetaForItem.items) && quadrantMetaForItem.items.length > 0);
       if (!hasQuadrantRestriction) {
         const fallbackList = createWeightedItemList(availableItems, 50);
         selectedItem = fallbackList.length > 0
           ? fallbackList[Math.floor(Math.random() * fallbackList.length)]
           : availableItems[Math.floor(Math.random() * availableItems.length)];
       } else {
         const genericItems = availableItems.filter((item) => {
           if (!item || item.itemRarity == null) return false;
           const itemTerrain = Array.isArray(item.terrain) ? item.terrain.filter(Boolean) : [];
           const typeStrs = [].concat(item.type || [], item.subtype || [], item.category || []).map((s) => String(s).trim()).filter(Boolean);
           return itemTerrain.length === 0 && typeStrs.length === 0;
         });
         const genericList = genericItems.length > 0 ? createWeightedItemList(genericItems, 50) : [];
         if (genericList.length > 0) {
           selectedItem = genericList[Math.floor(Math.random() * genericList.length)];
         } else {
           const fallbackList = createWeightedItemList(availableItems, 50);
           selectedItem = fallbackList.length > 0
             ? fallbackList[Math.floor(Math.random() * fallbackList.length)]
             : availableItems[Math.floor(Math.random() * availableItems.length)];
         }
       }
      }

      appendExploreStat(`${new Date().toISOString()}\tfinal\titem\t${location}\trarity=${selectedItem.itemRarity ?? "?"}`);

      pushProgressLog(party, character.name, "item", `Found ${selectedItem.itemName} in ${location}.`, undefined, Object.keys(rollCostsForLog).length ? rollCostsForLog : undefined);
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save(); // Always persist so dashboard shows current hearts/stamina/progress

      const nextCharacter = party.characters[party.currentTurn];
      const itemFlavor = getExplorationFlavorText(quadrantMetaForItem, "item", { item: selectedItem });
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
       await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       await hasUnpinnedDiscoveriesInQuadrant(party),
       { staminaCost: payResult?.staminaPaid ?? 0, heartsCost: payResult?.heartsPaid ?? 0 },
       poolCaps.maxHearts,
       poolCaps.maxStamina,
       itemFlavor || undefined,
       hazardRollResult?.hazardMessage ?? null,
       hotSpringMessage ?? null
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
      await party.save(); // Always persist so dashboard shows current hearts/stamina/progress

      await interaction.editReply({ embeds: [embed] });
      await interaction.followUp({ content: getExplorationNextTurnContent(nextCharacter) });

      if (!false) {
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
      }
     } else if (outcomeType === "monster") {
      // Check if character has blight stage 3 or higher (monsters don't attack them)
      if (character.blighted && character.blightStage >= 3) {
        return interaction.editReply({
          embeds: [createExplorationErrorEmbed("❌ **Cannot encounter monsters**", `${character.name} cannot encounter monsters during exploration!\n\n<:blight_eye:805576955725611058> At **Blight Stage ${character.blightStage}**, monsters no longer attack your character. You cannot encounter monsters until you are healed.`, { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })],
          ephemeral: true
        });
      }

      const monsters = await getMonstersByRegion(party.region.toLowerCase());
      if (!monsters || monsters.length === 0) {
       return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **No monsters**", "No monsters available for this region.")] });
      }
      // Only tier 1–4 show up during exploration; tier 5+ do not start expedition raids from explore roll
      const monstersTier4AndBelow = monsters.filter((m) => m.tier >= 1 && m.tier <= 4);
      const monstersForEncounter = monstersTier4AndBelow.length > 0 ? monstersTier4AndBelow : monsters;

      const quadrantMetaForMonster = await getQuadrantMeta(party.square, party.quadrant);
      const quadrantMonsterBiasSet = new Set([
        ...(quadrantMetaForMonster.monsters || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean),
        ...(quadrantMetaForMonster.bossMonsters || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean)
      ]);
      const monstersBiased = applyQuadrantMonsterBias(monstersForEncounter, quadrantMonsterBiasSet);
      const selectedMonster = getExplorationMonsterFromList(monstersBiased, dangerLevel.dangerBonus);
      appendExploreStat(`${new Date().toISOString()}\tfinal\tmonster\t${location}\ttier=${selectedMonster.tier ?? "?"}\tdist=${dangerLevel.distance}\tbonus=${(dangerLevel.dangerBonus * 100).toFixed(0)}%`);

      if (selectedMonster.tier > 4 && !DISABLE_EXPLORATION_RAIDS) {
       logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} raid start ${selectedMonster.name} T${selectedMonster.tier}`);
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
        // Don't advance party.currentTurn — raid has its own turn order (first in raid = next in expedition order)
        await party.save(); // Always persist so dashboard shows current hearts/stamina/progress

        // Raid participant order is (triggerIdx+1)..triggerIdx so first in raid = next in expedition; use them for embed and ping
        const raidForNextRoll = await Raid.findOne({ raidId: battleId });
        const firstInRaidRoll = raidForNextRoll?.participants?.length ? (raidForNextRoll.participants[raidForNextRoll.currentTurn ?? 0] || raidForNextRoll.participants[0]) : null;
        const nextCharacterRaid = firstInRaidRoll ? { userId: firstInRaidRoll.userId, name: firstInRaidRoll.name } : character;
        const monsterFlavorRaid = getExplorationFlavorText(quadrantMetaForMonster, "monster", { monster: selectedMonster });
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
         await hasDiscoveriesInQuadrant(party.square, party.quadrant),
         await hasUnpinnedDiscoveriesInQuadrant(party),
         { staminaCost: payResult?.staminaPaid ?? 0, heartsCost: payResult?.heartsPaid ?? 0 },
         poolCaps.maxHearts,
         poolCaps.maxStamina,
         monsterFlavorRaid || undefined,
         hazardRollResult?.hazardMessage ?? null,
         hotSpringMessage ?? null
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

          if (!false) {
           await addItemInventoryDatabase(
            character._id,
            lootedItem.itemName,
            qty,
            interaction,
            "Exploration Loot"
           );
          }

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
          party.markModified("gatheredItems");
          await party.save();
         }
        }

        await interaction.editReply({ embeds: [embed] });
        // Do not followUp with @ "you're up next" — raidModule already pings in the raid thread to avoid double posts and double @s
       } catch (error) {
        handleInteractionError(error, interaction, { source: "explore.js" });
        logger.error("EXPLORE", `[explore.js]❌ Raid processing: ${error?.message || error}`);
        await interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Raid error**", "An error occurred during the raid.")] });
       }
      } else {

       const diceRoll = Math.floor(Math.random() * 100) + 1;
       const {
        damageValue,
        adjustedRandomValue,
        attackSuccess,
        defenseSuccess,
       } = calculateFinalValue(character, diceRoll);

       logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} encounter ${character.name} vs ${selectedMonster.name} T${selectedMonster.tier} roll=${diceRoll} adj=${adjustedRandomValue}`);

       const outcome = await getEncounterOutcome(
        character,
        selectedMonster,
        damageValue,
        adjustedRandomValue,
        attackSuccess,
        defenseSuccess,
        usePartyOnlyForHeartsStamina(party) ? { skipPersist: true } : {}
       );

       if (outcome.hearts > 0) {
        party.totalHearts = Math.max(0, (party.totalHearts ?? 0) - outcome.hearts);
        party.markModified("totalHearts");
        logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} encounter result=${outcome.result} −${outcome.hearts}❤ pool→❤${party.totalHearts} loot=${!!outcome.canLoot}`);
       } else {
        logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} encounter result=${outcome.result} no damage loot=${!!outcome.canLoot}`);
       }

       const partyKOd = party.totalHearts <= 0;

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
       await party.save(); // Always persist so dashboard shows current hearts/stamina/progress

       const nextCharacterTier = party.characters[party.currentTurn];
       const monsterFlavorWave = getExplorationFlavorText(quadrantMetaForMonster, "monster", { monster: selectedMonster });
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
        await hasDiscoveriesInQuadrant(party.square, party.quadrant),
        await hasUnpinnedDiscoveriesInQuadrant(party),
        { staminaCost: payResult?.staminaPaid ?? 0, heartsCost: payResult?.heartsPaid ?? 0 },
        poolCaps.maxHearts,
        poolCaps.maxStamina,
        monsterFlavorWave || undefined,
        hazardRollResult?.hazardMessage ?? null,
        hotSpringMessage ?? null
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

       if (outcome.hearts > 0 && party.totalHearts <= 0) {
        embed.addFields({
         name: "💀 **__Party KO'd__**",
         value: `The party lost **${outcome.hearts}** heart(s). A fairy or tonic must be used to revive (use </explore item:${getExploreCommandId()}> when the expedition prompts you).`,
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

        if (!false) {
         await addItemInventoryDatabase(
          character._id,
          lootedItem.itemName,
          qty,
          interaction,
          "Exploration Loot"
         );
        }

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
        party.markModified("gatheredItems");
        await party.save();
       }

       // If party is KO'd, don't show commands - just show the battle result
       if (!partyKOd) {
        addExplorationCommandsField(embed, {
         party,
         expeditionId,
         location,
         nextCharacter: nextCharacterTier ?? null,
         showNextAndCommands: true,
         showRestSecureMove: false,
         hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
        });
       }

       await interaction.editReply({ embeds: [embed] });

       // If party KO'd, show the failure embed as a follow-up after the monster encounter
       if (partyKOd) {
        await handleExpeditionFailed(party, interaction, true);
        return;
       }

       await interaction.followUp({ content: getExplorationNextTurnContent(nextCharacterTier) });
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
    const characterName = normalizeCharacterName(interaction.options.getString("charactername"));
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition ID not found.")] });
    }
    if (party.status !== "started") {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not active**", "This expedition is not active. You can only Secure during an active expedition.")] });
    }
    if ((party.totalHearts ?? 0) <= 0) {
     await handleExpeditionFailed(party, interaction);
     return;
    }
    // Block securing if there's an active raid for this expedition (must defeat or retreat first)
    const activeRaidSecure = await Raid.findOne({ expeditionId: { $regex: exactIRegex(expeditionId) }, status: "active" });
    if (activeRaidSecure) {
     return interaction.editReply({ embeds: [createRaidBlockEmbed(party, activeRaidSecure.raidId, "secure", `${party.square} ${party.quadrant}`)] });
    }

    // Block securing if there's an active wave for this expedition (must complete wave first)
    const activeWaveSecure = await Wave.findOne({ expeditionId: { $regex: exactIRegex(expeditionId) }, status: "active" });
    if (activeWaveSecure) {
     return interaction.editReply({ embeds: [createWaveBlockEmbed(party, activeWaveSecure.waveId, "secure")] });
    }

    if (!SKIP_PIN_REQUIREMENT_FOR_TESTING) {
     const unpinnedSecure = await hasUnpinnedDiscoveriesInQuadrant(party);
     if (unpinnedSecure) {
      const blockEmbed = await createUnpinnedDiscoveriesBlockEmbed(party, expeditionId);
      return interaction.editReply({ embeds: [blockEmbed] });
     }
    }

    const character = await findCharacterByNameAndUser(characterName, userId);
    if (!character) {
     return interaction.editReply({
      embeds: [createExplorationErrorEmbed("❌ **Character not found**", "Character not found or you do not own this character.")]
     });
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
       .setColor(NOT_YOUR_TURN_COLOR)
       .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`)
       .setImage(NOT_YOUR_TURN_BORDER_URL);
     return interaction.editReply({ embeds: [notYourTurnEmbed] });
    }

    // Quadrant hazards (per-action trigger, party pool)
    const hazardSecureResult = await maybeApplyQuadrantHazards(party, { trigger: "secure" });
    if (hazardSecureResult.ko) {
      await handleExpeditionFailed(party, interaction);
      return;
    }

    if (party.quadrantState !== "explored") {
     const locationSecure = `${party.square} ${party.quadrant}`;
     const nextChar = party.characters[party.currentTurn];
     const notExploredEmbed = new EmbedBuilder()
       .setTitle("🔒 Quadrant Not Explored")
       .setColor(getExploreOutcomeColor("secure", regionColors[party.region] || "#FF9800"))
       .setDescription(
         `You can only **Secure** quadrants that have been fully explored.\n\n` +
         `**${locationSecure}** has not been explored yet. Use **Explore** to reveal this quadrant, then you can secure it.`
       )
       .setImage(getExploreMapImageUrl(party, { highlight: true }));
     addExplorationStandardFields(notExploredEmbed, {
       party,
       expeditionId,
       location: locationSecure,
       nextCharacter: nextChar ?? null,
       showNextAndCommands: true,
       showRestSecureMove: true,
       commandsLast: true,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
       hazardMessage: hazardSecureResult?.hazardMessage ?? null,
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

    // Require at least one adjacent quadrant to be secured (or party at start quadrant)
    const isAtStartQuadrantSecure = (() => {
     const start = START_POINTS_BY_REGION[party.region];
     return start && String(party.square || "").toUpperCase() === String(start.square || "").toUpperCase() && String(party.quadrant || "").toUpperCase() === String(start.quadrant || "").toUpperCase();
    })();
    if (!isAtStartQuadrantSecure) {
     const hasAdjacent = await hasAdjacentSecuredQuadrant(party.square, party.quadrant);
     if (!hasAdjacent) {
      const locationSecure = `${party.square} ${party.quadrant}`;
      const nextChar = party.characters[party.currentTurn];
      const middleOfNowhereEmbed = new EmbedBuilder()
       .setTitle("🔒 Cannot Secure Here")
       .setColor(getExploreOutcomeColor("secure", regionColors[party.region] || "#FF9800"))
       .setDescription(
        `You cannot secure **${locationSecure}** in the middle of nowhere.\n\n` +
        `At least one quadrant adjacent to this one must already be **secured**. Secure your region's starting quadrant first, then expand from there. Use the commands below for your next action.`
       )
       .setImage(getExploreMapImageUrl(party, { highlight: true }));
      addExplorationStandardFields(middleOfNowhereEmbed, {
       party,
       expeditionId,
       location: locationSecure,
       nextCharacter: nextChar ?? null,
       showNextAndCommands: true,
       showRestSecureMove: true,
       commandsLast: true,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      addExplorationCommandsField(middleOfNowhereEmbed, {
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
      return interaction.editReply({ embeds: [middleOfNowhereEmbed] });
     }
    }

    // Check resources first — don't cost stamina if the party can't secure (no Wood/Eldin Ore)
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
      .setColor(getExploreOutcomeColor("secure", regionColors[party.region] || "#FF9800"))
      .setDescription(
        `To secure **${locationSecure}**, the party needs **Wood** and **Eldin Ore** (in someone's expedition loadout).\n\nContinue exploring to find these resources, then try **Secure** again. Use the commands below for your next action.`
      )
      .setImage(getExploreMapImageUrl(party, { highlight: true }));
     addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationSecure,
      nextCharacter: nextChar ?? null,
      showNextAndCommands: true,
      showRestSecureMove: true,
      commandsLast: true,
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      hazardMessage: hazardSecureResult?.hazardMessage ?? null,
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

    // Validate party has enough stamina/hearts to secure (5 total) - DO NOT deduct yet, only on confirmation
    const staminaCost = 5;
    const totalStamina = Math.max(0, Number(party.totalStamina) || 0);
    const totalHearts = Math.max(0, Number(party.totalHearts) || 0);
    const shortfall = Math.max(0, staminaCost - totalStamina);
    logger.info("EXPLORE", `[explore.js] Secure pre-check: partyId=${expeditionId} ❤${totalHearts} 🟩${totalStamina} need=${staminaCost} shortfall=${shortfall}`);
    if (shortfall > 0 && totalHearts < shortfall) {
     logger.info("EXPLORE", `[explore.js] Secure BLOCKED (not enough): partyId=${expeditionId} ❤${totalHearts} 🟩${totalStamina} shortfall=${shortfall} — NO HEARTS CONSUMED`);
     return interaction.editReply(
      `Not enough stamina or hearts to secure (need ${staminaCost} total). Party has ${totalStamina} stamina and ${totalHearts} hearts. **Camp** to recover stamina, or use hearts to **Struggle** (1 heart = 1 stamina).`
     );
    }

    // Confirmation: securing means no more rolls / items in this quadrant; grottos/ruins here that haven't been visited won't be explorable
    const locationSecure = `${party.square} ${party.quadrant}`;
    const confirmEmbed = new EmbedBuilder()
     .setTitle("⚠️ **Are you sure?**")
     .setColor(getExploreOutcomeColor("secure", regionColors[party.region] || "#FF9800"))
     .setDescription(
      `**Securing ${locationSecure}** will make this quadrant safe (no stamina cost to move here), but:\n\n` +
      "• **You will no longer be able to roll for encounters or items here.**\n" +
      "• Any **grottos** or **ruins** in this quadrant that you haven’t visited yet **cannot be explored** after securing.\n\n" +
      "Make sure you’re done exploring this area (and any discoveries in it) before you secure. Confirm or cancel below."
     )
     .setImage(getExploreMapImageUrl(party, { highlight: true }));
    addExplorationStandardFields(confirmEmbed, {
     party,
     expeditionId,
     location: locationSecure,
     nextCharacter: party.characters[party.currentTurn] ?? null,
     showNextAndCommands: false,
     hazardMessage: hazardSecureResult?.hazardMessage ?? null,
     showRestSecureMove: false,
     commandsLast: false,
     hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
    });
    const secureConfirmRow = new ActionRowBuilder().addComponents(
     new ButtonBuilder()
      .setCustomId(`explore_secure_confirm|${expeditionId}`)
      .setLabel("Yes, secure quadrant")
      .setStyle(ButtonStyle.Success),
     new ButtonBuilder()
      .setCustomId(`explore_secure_cancel|${expeditionId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
    );
    await interaction.editReply({ embeds: [confirmEmbed], components: [secureConfirmRow] });

    const expectedUserId = interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({
     filter: (i) => i.user.id === expectedUserId && (i.customId === `explore_secure_confirm|${expeditionId}` || i.customId === `explore_secure_cancel|${expeditionId}`),
     time: 60 * 1000,
     max: 1,
    });

    collector.on("collect", async (i) => {
     try {
      await i.deferUpdate();
      const disabledRow = new ActionRowBuilder().addComponents(
       new ButtonBuilder()
        .setCustomId(`explore_secure_confirm|${expeditionId}`)
        .setLabel("Yes, secure quadrant")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
       new ButtonBuilder()
        .setCustomId(`explore_secure_cancel|${expeditionId}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
      );
      await i.editReply({ components: [disabledRow] }).catch(() => {});

      if (i.customId.includes("_cancel")) {
       const cancelledEmbed = new EmbedBuilder()
        .setTitle("Secure cancelled")
        .setColor(getExploreOutcomeColor("secure", regionColors[party.region] || "#FF9800"))
        .setDescription("No changes made. You can continue exploring or secure again when ready.");
       addExplorationStandardFields(cancelledEmbed, {
        party,
        expeditionId,
        location: locationSecure,
        nextCharacter: party.characters[party.currentTurn] ?? null,
        showNextAndCommands: true,
        showRestSecureMove: true,
        commandsLast: true,
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       });
       addExplorationCommandsField(cancelledEmbed, {
        party,
        expeditionId,
        location: locationSecure,
        nextCharacter: party.characters[party.currentTurn] ?? null,
        showNextAndCommands: true,
        showRestSecureMove: true,
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
        isAtStartQuadrant: (() => {
         const start = START_POINTS_BY_REGION[party.region];
         return start && String(party.square || "").toUpperCase() === String(start.square || "").toUpperCase() && String(party.quadrant || "").toUpperCase() === String(start.quadrant || "").toUpperCase();
        })(),
       });
       await i.editReply({ embeds: [cancelledEmbed], components: [disabledRow] }).catch(() => {});
       collector.stop();
       return;
      }

      // Confirm: re-fetch and re-validate, then pay and secure
      const freshParty = await Party.findActiveByPartyId(expeditionId);
      if (!freshParty) {
       await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition not found. No changes made.")], ephemeral: true }).catch(() => {});
       collector.stop();
       return;
      }
      const freshCharIndex = freshParty.characters.findIndex((c) => c.userId === i.user.id);
      if (freshCharIndex === -1 || freshParty.currentTurn !== freshCharIndex) {
       await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Not your turn**", "It's not your turn or you're not in this expedition. No changes made.")], ephemeral: true }).catch(() => {});
       collector.stop();
       return;
      }
      if (freshParty.quadrantState !== "explored") {
       await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Cannot secure**", "This quadrant is no longer in a state that can be secured. No changes made.")], ephemeral: true }).catch(() => {});
       collector.stop();
       return;
      }
      const isAtStartConfirm = (() => {
       const start = START_POINTS_BY_REGION[freshParty.region];
       return start && String(freshParty.square || "").toUpperCase() === String(start.square || "").toUpperCase() && String(freshParty.quadrant || "").toUpperCase() === String(start.quadrant || "").toUpperCase();
      })();
      if (!isAtStartConfirm) {
       const hasAdjacentConfirm = await hasAdjacentSecuredQuadrant(freshParty.square, freshParty.quadrant);
       if (!hasAdjacentConfirm) {
        await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Cannot secure**", "This quadrant can no longer be secured (no adjacent secured quadrant). No changes made.")], ephemeral: true }).catch(() => {});
        collector.stop();
        return;
       }
      }
      const freshHasResources = requiredResources.every((resource) =>
       (freshParty.characters || []).flatMap((c) => c.items || []).some(
        (item) => item.itemName === resource || item.itemName === `${resource} Bundle`
       )
      );
      if (!freshHasResources) {
       await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Missing materials**", "Party no longer has Wood and Eldin Ore. No changes made.")], ephemeral: true }).catch(() => {});
       collector.stop();
       return;
      }

      const staminaCost = 5;
      const secureBeforeHearts = freshParty.totalHearts ?? 0;
      const secureBeforeStamina = freshParty.totalStamina ?? 0;
      logger.info("EXPLORE", `[explore.js] Secure confirm: partyId=${expeditionId} BEFORE ❤${secureBeforeHearts} 🟩${secureBeforeStamina} need=${staminaCost}`);
      const securePayResult = await payStaminaOrStruggle(freshParty, freshCharIndex, staminaCost, { order: "currentFirst", action: "secure_confirm" });
      if (!securePayResult.ok) {
       logger.info("EXPLORE", `[explore.js] Secure FAILED (payStaminaOrStruggle returned not ok): partyId=${expeditionId} ❤${freshParty.totalHearts ?? 0} 🟩${freshParty.totalStamina ?? 0} — payStaminaOrStruggle should NOT have consumed anything`);
       const noStaminaEmbed = new EmbedBuilder()
        .setTitle("Not enough stamina or hearts")
        .setColor(getExploreOutcomeColor("secure", regionColors[freshParty.region] || "#FF9800"))
        .setDescription(
          `Need ${staminaCost} total to secure. Party has ${freshParty.totalStamina ?? 0} stamina and ${freshParty.totalHearts ?? 0} hearts. **Camp** to recover or use hearts to **Struggle**.`
        )
        .setImage(getExploreMapImageUrl(freshParty, { highlight: true }));
       addExplorationStandardFields(noStaminaEmbed, {
        party: freshParty,
        expeditionId,
        location: `${freshParty.square} ${freshParty.quadrant}`,
        nextCharacter: freshParty.characters[freshParty.currentTurn] ?? null,
        showNextAndCommands: true,
        showRestSecureMove: true,
        commandsLast: true,
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant),
       });
       addExplorationCommandsField(noStaminaEmbed, {
        party: freshParty,
        expeditionId,
        location: `${freshParty.square} ${freshParty.quadrant}`,
        nextCharacter: freshParty.characters[freshParty.currentTurn] ?? null,
        showNextAndCommands: true,
        showRestSecureMove: true,
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(freshParty.square, freshParty.quadrant),
        isAtStartQuadrant: (() => {
         const start = START_POINTS_BY_REGION[freshParty.region];
         return start && String(freshParty.square || "").toUpperCase() === String(start.square || "").toUpperCase() && String(freshParty.quadrant || "").toUpperCase() === String(start.quadrant || "").toUpperCase();
        })(),
       });
       await i.editReply({ embeds: [noStaminaEmbed], components: [disabledRow] }).catch(() => {});
       collector.stop();
       return;
      }

      // Check if party is KO'd after paying (hearts reached 0 via struggle)
      if ((freshParty.totalHearts ?? 0) <= 0 && securePayResult.heartsPaid > 0) {
       const character = await findCharacterByNameAndUser(freshParty.characters[freshCharIndex].name, i.user.id);
       pushProgressLog(freshParty, character?.name || 'Party', "ko", `Party KO'd after paying ${securePayResult.heartsPaid} heart(s) to secure (struggle mode).`, undefined, { heartsLost: securePayResult.heartsPaid });
       await freshParty.save();
       await handleExpeditionFailed(freshParty, interaction);
       collector.stop();
       return;
      }

      const character = await findCharacterByNameAndUser(freshParty.characters[freshCharIndex].name, i.user.id);
      if (character) {
       character.currentStamina = freshParty.characters[freshCharIndex].currentStamina;
       character.currentHearts = freshParty.characters[freshCharIndex].currentHearts;
      }

      // Remove Wood and Eldin Ore (or their bundles) from the party loadout
      for (const resource of requiredResources) {
       for (let ci = 0; ci < freshParty.characters.length; ci++) {
        const idx = (freshParty.characters[ci].items || []).findIndex(
         (item) => item.itemName === resource || item.itemName === `${resource} Bundle`
        );
        if (idx !== -1) {
         freshParty.characters[ci].items.splice(idx, 1);
         break;
        }
       }
      }
      freshParty.markModified("characters");

      // Mark quadrant as secured in the canonical map (use exact stored ids for robust update). Only when expedition is still active.
      const resolvedSecure = await findExactMapSquareAndQuadrant(freshParty.square, freshParty.quadrant);
      if (resolvedSecure && freshParty.status === "started") {
       try {
        const { exactSquareId, exactQuadrantId } = resolvedSecure;
        const mapResult = await Square.updateOne(
         { squareId: exactSquareId, "quadrants.quadrantId": exactQuadrantId },
         { $set: { "quadrants.$[q].status": "secured" } },
         { arrayFilters: [{ "q.quadrantId": exactQuadrantId }] }
        );
        if (mapResult.matchedCount === 0) {
         logger.warn("EXPLORE", `[explore.js]⚠️ Secure map: no square for ${freshParty.square} ${freshParty.quadrant}`);
        } else {
         if (!freshParty.exploredQuadrantsThisRun) freshParty.exploredQuadrantsThisRun = [];
         const alreadyHas = freshParty.exploredQuadrantsThisRun.some(
          (r) => String(r?.squareId || "").toUpperCase() === exactSquareId.toUpperCase() && String(r?.quadrantId || "").toUpperCase() === exactQuadrantId.toUpperCase()
         );
         if (!alreadyHas) {
          freshParty.exploredQuadrantsThisRun.push({ squareId: exactSquareId, quadrantId: exactQuadrantId });
          freshParty.markModified("exploredQuadrantsThisRun");
         }
        }
       } catch (mapErr) {
        logger.error("EXPLORE", `[explore.js]❌ Update map to secured: ${mapErr.message}`);
       }
      } else if (resolvedSecure && freshParty.status !== "started") {
       // Expedition over — do not overwrite map
      } else if (!resolvedSecure) {
       logger.warn("EXPLORE", `[explore.js]⚠️ Secure map: could not find square/quadrant for ${freshParty.square} ${freshParty.quadrant}`);
      }

      freshParty.quadrantState = "secured";
      freshParty.markModified("quadrantState");
      freshParty.currentTurn = (freshParty.currentTurn + 1) % freshParty.characters.length;

      const secureCostsForLog = buildCostsForLog(securePayResult);
      pushProgressLog(
       freshParty,
       freshParty.characters[freshCharIndex].name,
       "secure",
       `Secured ${locationSecure} using Wood and Eldin Ore (-${staminaCost} party stamina). Quadrant secured; no stamina cost to explore here.`,
       undefined,
       Object.keys(secureCostsForLog).length ? secureCostsForLog : undefined
      );
      await freshParty.save();

      const nextCharacterSecure = freshParty.characters[freshParty.currentTurn];
      const embed = new EmbedBuilder()
       .setTitle(`🗺️ **Expedition: Secured ${locationSecure}**`)
       .setColor(getExploreOutcomeColor("secure", regionColors[freshParty.region] || "#FF9800"))
       .setDescription(
        `${freshParty.characters[freshCharIndex].name} secured the quadrant using resources (-${staminaCost} party stamina).`
       )
       .setImage(getExploreMapImageUrl(freshParty, { highlight: true }));
      addExplorationStandardFields(embed, {
       party: freshParty,
       expeditionId,
       location: locationSecure,
       nextCharacter: nextCharacterSecure ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       commandsLast: true,
       actionCost: { staminaCost: securePayResult.staminaPaid ?? 0, heartsCost: securePayResult.heartsPaid ?? 0 },
      });
      const explorePageUrlSecure = getExplorePageUrl(expeditionId);
      embed.addFields({
       name: "📋 **__Benefits__**",
       value: "Quadrant secured. No stamina cost to explore here, increased safety. You can draw your path on the dashboard before moving:\n🔗 " + explorePageUrlSecure,
       inline: false,
      });
      const startPointSecure = START_POINTS_BY_REGION[freshParty.region];
      const isAtStartQuadrantSecure =
       startPointSecure &&
       String(freshParty.square || "").toUpperCase() === String(startPointSecure.square || "").toUpperCase() &&
       String(freshParty.quadrant || "").toUpperCase() === String(startPointSecure.quadrant || "").toUpperCase();
      addExplorationCommandsField(embed, {
       party: freshParty,
       expeditionId,
       location: locationSecure,
       nextCharacter: nextCharacterSecure ?? null,
       showNextAndCommands: true,
       showRestSecureMove: false,
       showSecuredQuadrantOnly: true,
       isAtStartQuadrant: !!isAtStartQuadrantSecure,
      });

      await i.editReply({ embeds: [embed], components: [disabledRow] }).catch(() => {});
      await i.followUp({
       content: `**Next:** Camp, Item, or Move. ${getExplorationNextTurnContent(nextCharacterSecure)}`,
      }).catch(() => {});
      collector.stop();
     } catch (err) {
      logger.error("EXPLORE", `[explore.js]❌ Secure confirm: ${err?.message || err}`);
      collector.stop();
      await i.followUp({ embeds: [createExplorationErrorEmbed("❌ **Secure failed**", `Something went wrong. Please try ${getExploreCommandId() ? `</explore secure:${getExploreCommandId()}>` : "`/explore secure`"} again.`)], ephemeral: true }).catch(() => {});
     }
    });
    return;

    // ------------------- Move to Adjacent Quadrant -------------------
   } else if (subcommand === "move") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = normalizeCharacterName(interaction.options.getString("charactername"));
    const quadrantInput = interaction.options.getString("quadrant") || "";
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition ID not found.")] });
    }

    const character = await findCharacterByNameAndUser(characterName, userId);
    if (!character) {
     return interaction.editReply({
      embeds: [createExplorationErrorEmbed("❌ **Character not found**", "Character not found or you do not own this character.")]
     });
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
       .setColor(NOT_YOUR_TURN_COLOR)
       .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`)
       .setImage(NOT_YOUR_TURN_BORDER_URL);
     return interaction.editReply({ embeds: [notYourTurnEmbed] });
    }

    if (party.status !== "started") {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not started**", "This expedition has not been started yet.", { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
    }
    if ((party.totalHearts ?? 0) <= 0) {
     await handleExpeditionFailed(party, interaction);
     return;
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
     const grottoMoveEmbed = new EmbedBuilder()
      .setTitle("🕳️ **Complete the grotto trial first**")
      .setColor(getExploreOutcomeColor("move", regionColors[party.region] || "#9C27B0"))
      .setDescription(
       `You cannot use </explore move:${getExploreCommandId()}> until the trial is complete.\n\nUse **${grottoCmd}** for your turn.`
      )
      .setImage(getExploreMapImageUrl(party, { highlight: true }));
     addExplorationStandardFields(grottoMoveEmbed, {
      party,
      expeditionId,
      location: `${party.square} ${party.quadrant}`,
      nextCharacter: party.characters?.[party.currentTurn] ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
     });
     return interaction.editReply({ embeds: [grottoMoveEmbed] });
    }

    if (!SKIP_PIN_REQUIREMENT_FOR_TESTING) {
     const unpinnedMove = await hasUnpinnedDiscoveriesInQuadrant(party);
     if (unpinnedMove) {
      const blockEmbed = await createUnpinnedDiscoveriesBlockEmbed(party, expeditionId);
      return interaction.editReply({ embeds: [blockEmbed] });
     }
    }

    // Block moving if there's active combat for this expedition (must resolve first)
    const moveCombatBlock = await getCombatBlockReply(party, expeditionId, "move", `${party.square} ${party.quadrant}`);
    if (moveCombatBlock) return interaction.editReply(moveCombatBlock);

    // Sync quadrant state from map (exploringMap / Square model) — secured/explored on map means Move is allowed
    // DESIGN NOTE: Exploration state is SHARED across all expeditions via the map database.
    // - If a PREVIOUS expedition secured a quadrant, the current party can move through it freely (0 stamina).
    // - If a PREVIOUS expedition explored a quadrant, the current party sees it as explored (1 stamina to move).
    // - This is intentional: securing benefits all future expeditions, and exploration progress persists.
    // - The move command costs: 2 stamina (unexplored) → 1 stamina (explored) → 0 stamina (secured).
    const moveSquareId = String(party.square || "").trim();
    const moveSquareIdRegex = moveSquareId ? new RegExp(`^${moveSquareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") : null;
    const mapSquareForMove = moveSquareIdRegex ? await Square.findOne({ squareId: moveSquareIdRegex }) : null;
    if (mapSquareForMove?.quadrants?.length && party.square && party.quadrant) {
     const qMove = mapSquareForMove.quadrants.find(
      (qu) => String(qu.quadrantId).toUpperCase() === String(party.quadrant || "").toUpperCase()
     );
     const effectiveStatus = getEffectiveQuadrantStatus(party.square, party.quadrant, qMove?.status);
     if (effectiveStatus === "explored" || effectiveStatus === "secured") {
      party.quadrantState = effectiveStatus;
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
      .setColor(getExploreOutcomeColor("move", regionColors[party.region] || "#b91c1c"))
      .setDescription(
       "You can't use **Move** right now. This quadrant hasn't been explored yet.\n\n" +
       "Being in a quadrant doesn't mark it explored — only a roll that gives **Quadrant Explored!** does (then roll costs 1 stamina here).\n\n" +
       `Use </explore roll:${getExploreCommandId()}> to explore the current quadrant first. **Move** only becomes available when the expedition prompts you (e.g. after exploring, or when the quadrant is secured).`
      )
      .setImage(getExploreMapImageUrl(party, { highlight: true }));
     addExplorationStandardFields(moveBlockedEmbed, {
      party,
      expeditionId,
      location: `${party.square} ${party.quadrant}`,
      nextCharacter: party.characters[party.currentTurn] ?? null,
      showNextAndCommands: false,
      showRestSecureMove: false,
      hazardMessage: null,
     });
     return interaction.editReply({ embeds: [moveBlockedEmbed] });
    }
    if (quadrantState === "explored") {
     const lastOutcome = getLastProgressOutcomeForLocation(party, party.square, party.quadrant);
     // Only allow move after the "Quadrant Explored!" prompt at THIS location. "move" means we just arrived—we haven't explored here yet.
     const moveWasPrompted = lastOutcome === "explored";
     if (!moveWasPrompted) {
      const moveBlockedEmbed = new EmbedBuilder()
       .setTitle("🚫 **Move not available**")
       .setColor(getExploreOutcomeColor("move", regionColors[party.region] || "#b91c1c"))
       .setDescription(
        "You can't use **Move** right now. The expedition hasn't prompted you to move.\n\n" +
        `Use </explore roll:${getExploreCommandId()}> (or respond to the current prompt) until you see the **Quadrant Explored** menu with Roll, Item, Camp, Secure, and **Move**. Only then can you use **Move**.`
       )
       .setImage(getExploreMapImageUrl(party, { highlight: true }));
      addExplorationStandardFields(moveBlockedEmbed, {
       party,
       expeditionId,
       location: `${party.square} ${party.quadrant}`,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: false,
       showRestSecureMove: false,
       hazardMessage: null,
      });
      return interaction.editReply({ embeds: [moveBlockedEmbed] });
     }
    }

    // Quadrant hazards (per-action trigger) — applied after we've confirmed move is allowed, so hazard log doesn't overwrite "explored" as last outcome
    const hazardMoveResult = await maybeApplyQuadrantHazards(party, { trigger: "move" });
    if (hazardMoveResult.ko) {
     await handleExpeditionFailed(party, interaction);
     return;
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
     const currentLoc = `${currentSquare} ${currentQuadrant}`;
     const validOptions = adjacent.length > 0
      ? adjacent.map((a) => `**${a.square} ${a.quadrant}**`).join(", ")
      : "none (check map)";
     const invalidMoveEmbed = new EmbedBuilder()
      .setTitle("🚫 **Invalid move**")
      .setColor(getExploreOutcomeColor("move", regionColors[party.region] || "#b91c1c"))
      .setDescription(
       `You're at **${currentLoc}**. The quadrant you chose isn't next to that location.\n\n` +
       `**Valid moves from here:** ${validOptions}\n\n` +
       `Use **Move** again and pick one of the quadrants listed above (e.g. ${getExploreCommandId() ? `</explore move:${getExploreCommandId()}>` : "`/explore move`"} then enter the square and quadrant).`
      )
      .setImage(getExploreMapImageUrl(party, { highlight: true }));
     addExplorationStandardFields(invalidMoveEmbed, {
      party,
      expeditionId,
      location: currentLoc,
      nextCharacter: party.characters[party.currentTurn] ?? null,
      showNextAndCommands: true,
      showRestSecureMove: true,
      isAtStartQuadrant: START_POINTS_BY_REGION[party.region] &&
       String(party.square || "").toUpperCase() === String((START_POINTS_BY_REGION[party.region] || {}).square || "").toUpperCase() &&
       String(party.quadrant || "").toUpperCase() === String((START_POINTS_BY_REGION[party.region] || {}).quadrant || "").toUpperCase(),
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
     });
     return interaction.editReply({ embeds: [invalidMoveEmbed] });
    }

    // Move cost: 2 if unexplored, 1 if explored, 0 if secured (based on destination quadrant state)
    let destinationQuadrantState = "unexplored";
    let destQ = null;
    const destSquareIdNorm = String(newLocation.square || "").trim();
    const destSquareIdRegex = destSquareIdNorm ? new RegExp(`^${destSquareIdNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") : null;
    const destMapSquare = destSquareIdRegex ? await Square.findOne({ squareId: destSquareIdRegex }) : null;
    
    // Block movement if destination square is not in the database (uncharted territory)
    if (!destMapSquare) {
     return interaction.editReply(
      `**${newLocation.square}** is not a valid map square. Choose a different quadrant.`
     );
    }
    
    if (destMapSquare && destMapSquare.quadrants && destMapSquare.quadrants.length) {
     destQ = destMapSquare.quadrants.find(
      (qu) => String(qu.quadrantId).toUpperCase() === String(newLocation.quadrant).toUpperCase()
     );
     // Block movement to inaccessible quadrants (edge of map)
     if (destQ && destQ.status === "inaccessible") {
      const startPointInacc = START_POINTS_BY_REGION[party.region];
      const isAtStartInacc = startPointInacc &&
       String(party.square || "").toUpperCase() === String(startPointInacc.square || "").toUpperCase() &&
       String(party.quadrant || "").toUpperCase() === String(startPointInacc.quadrant || "").toUpperCase();
      const inaccessibleEmbed = new EmbedBuilder()
       .setTitle("🚫 **Quadrant inaccessible**")
       .setColor(getExploreOutcomeColor("move", regionColors[party.region] || "#b91c1c"))
       .setDescription(
        `**${newLocation.square} ${newLocation.quadrant}** is off the map (edge of the region).\n\n` +
        `Choose a different quadrant from the **Move** menu to continue your expedition.`
       )
       .setImage(getExploreMapImageUrl(party, { highlight: true }));
      addExplorationStandardFields(inaccessibleEmbed, {
       party,
       expeditionId,
       location: `${party.square} ${party.quadrant}`,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: true,
       isAtStartQuadrant: isAtStartInacc,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      return interaction.editReply({ embeds: [inaccessibleEmbed] });
     }
     // Block movement to squares outside allowed regions (only eldin, lanayru, faron are explorable)
     const destRegion = (destMapSquare.region || "").toLowerCase();
     const allowedRegions = ["eldin", "lanayru", "faron"];
     if (!allowedRegions.includes(destRegion)) {
      const startPointOut = START_POINTS_BY_REGION[party.region];
      const isAtStartOut = startPointOut &&
       String(party.square || "").toUpperCase() === String(startPointOut.square || "").toUpperCase() &&
       String(party.quadrant || "").toUpperCase() === String(startPointOut.quadrant || "").trim().toUpperCase();
      const outsideRegionEmbed = new EmbedBuilder()
       .setTitle("🚫 **Outside explorable regions**")
       .setColor(getExploreOutcomeColor("move", regionColors[party.region] || "#b91c1c"))
       .setDescription(
        `**${newLocation.square} ${newLocation.quadrant}** is outside the explorable regions. Expeditions can only travel within Eldin, Lanayru, and Faron.`
       )
       .setImage(getExploreMapImageUrl(party, { highlight: true }));
      addExplorationStandardFields(outsideRegionEmbed, {
       party,
       expeditionId,
       location: `${party.square} ${party.quadrant}`,
       nextCharacter: party.characters[party.currentTurn] ?? null,
       showNextAndCommands: true,
       showRestSecureMove: true,
       isAtStartQuadrant: isAtStartOut,
       hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
      return interaction.editReply({ embeds: [outsideRegionEmbed] });
     }
     if (destQ) {
      destinationQuadrantState = getEffectiveQuadrantStatus(newLocation.square, newLocation.quadrant, destQ.status);
     }
    }
    const moveWasReveal = destinationQuadrantState === "unexplored";
    const staminaCost = destinationQuadrantState === "secured" ? 0 : destinationQuadrantState === "unexplored" ? 2 : 1;

    // Block leaving the square until all quadrants (except inaccessible) are explored or secured
    // Exception: allow moving to the starting square (where they can end the expedition) even if current square isn't fully explored
    // IMPORTANT: This check happens BEFORE stamina is deducted so failed moves don't cost stamina
    const targetSquareNorm = String(newLocation.square || "").trim().toUpperCase();
    const currentSquareNorm = String(currentSquare || "").trim().toUpperCase();
    const startPoint = START_POINTS_BY_REGION[party.region];
    const isMovingToStart = startPoint &&
     targetSquareNorm === String(startPoint.square || "").trim().toUpperCase() &&
     String(newLocation.quadrant || "").toUpperCase() === String(startPoint.quadrant || "").trim().toUpperCase();

    // Exception: allow moving to a square that is fully explored (retreat/backtrack - "go back the way you came")
    // A square is only considered "fully explored" if it has at least some explorable quadrants and all of them are explored/secured
    // This prevents treating ocean squares (all inaccessible) as "fully explored" and bypassing the current square exploration requirement
    let isMovingToFullyExploredSquare = false;
    if (destMapSquare && destMapSquare.quadrants && destMapSquare.quadrants.length) {
     const squareIdDest = String(destMapSquare.squareId || "").trim().toUpperCase();
     const explorableQuadrants = destMapSquare.quadrants.filter((q) => {
      const effective = getEffectiveQuadrantStatus(squareIdDest, q.quadrantId, q.status);
      return effective !== "inaccessible";
     });
     const hasExplorableQuadrants = explorableQuadrants.length > 0;
     const allExplorableAreExplored = explorableQuadrants.every((q) => {
      const effective = getEffectiveQuadrantStatus(squareIdDest, q.quadrantId, q.status);
      return effective === "explored" || effective === "secured";
     });
     isMovingToFullyExploredSquare = hasExplorableQuadrants && allExplorableAreExplored;
    }

    if (targetSquareNorm !== currentSquareNorm && !isMovingToStart && !isMovingToFullyExploredSquare) {
     const currentMapSquare = await Square.findOne({ squareId: currentSquare });
     if (currentMapSquare && currentMapSquare.quadrants && currentMapSquare.quadrants.length) {
      const currentSquareIdNorm = String(currentMapSquare.squareId || currentSquare || "").trim().toUpperCase();
      const unexplored = currentMapSquare.quadrants
       .filter((q) => {
        const effective = getEffectiveQuadrantStatus(currentSquareIdNorm, q.quadrantId, q.status);
        return effective !== "inaccessible" && effective !== "explored" && effective !== "secured";
       })
       .map((q) => (q.quadrantId || "").trim().toUpperCase())
       .filter(Boolean);
      if (unexplored.length > 0) {
       const quadList = unexplored.join(", ");
       const locationMove = `${currentSquare} ${party.quadrant}`;
       const tryingDirection = (newLocation && newLocation.direction) ? newLocation.direction : null;
       const tryingTarget = newLocation ? `${newLocation.square} ${newLocation.quadrant}` : null;
       const cantLeaveEmbed = new EmbedBuilder()
        .setTitle("🚫 **Can't leave yet**")
        .setColor(getExploreOutcomeColor("move", regionColors[party.region] || "#b91c1c"))
        .setDescription(
         `You can't leave **${currentSquare}** until the whole square is explored.\n\n` +
         (tryingDirection && tryingTarget
          ? `**Trying to go:** ${tryingDirection} (to **${tryingTarget}**)\n\n`
          : "") +
         `**Still unexplored:** ${quadList}\n\n` +
         `Use the **Move** command again to explore the remaining quadrant(s), then you can move to an adjacent square.`
        )
        .setImage(getExploreMapImageUrl(party, { highlight: true }));
       const startCantLeave = START_POINTS_BY_REGION[party.region];
       const isAtStartCantLeave = startCantLeave &&
        String(party.square || "").toUpperCase() === String(startCantLeave.square || "").toUpperCase() &&
        String(party.quadrant || "").toUpperCase() === String(startCantLeave.quadrant || "").toUpperCase();
       addExplorationStandardFields(cantLeaveEmbed, {
        party,
        expeditionId,
        location: locationMove,
        nextCharacter: party.characters[party.currentTurn] ?? null,
        showNextAndCommands: true,
        showRestSecureMove: true,
        isAtStartQuadrant: isAtStartCantLeave,
        hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
       hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      });
       return interaction.editReply({ embeds: [cantLeaveEmbed] });
      }
     }
    }

    // Now that we've validated the move is allowed, deduct stamina
    let movePayResult = null;
    if (staminaCost > 0) {
     movePayResult = await payStaminaOrStruggle(party, characterIndex, staminaCost, { order: "currentFirst", action: "move" });
     if (!movePayResult.ok) {
      const partyStaminaMove = party.totalStamina ?? 0;
      const partyHeartsMove = party.totalHearts ?? 0;
      return interaction.editReply({
       embeds: [createExplorationErrorEmbed("❌ **Not enough stamina or hearts**", `Not enough stamina or hearts to move. Party has **${partyStaminaMove}** stamina and **${partyHeartsMove}** hearts (need **${staminaCost}**). Use hearts to pay for actions (1 heart = 1 stamina), or use items to recover.`, { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })],
      });
     }
     
     // Check if party is KO'd after paying (hearts reached 0 via struggle)
     if ((party.totalHearts ?? 0) <= 0 && movePayResult.heartsPaid > 0) {
      pushProgressLog(party, character.name, "ko", `Party KO'd after paying ${movePayResult.heartsPaid} heart(s) to move (struggle mode).`, undefined, { heartsLost: movePayResult.heartsPaid });
      await party.save();
      await handleExpeditionFailed(party, interaction);
      return;
     }
     
     const n = (party.characters || []).length;
     if (party.status === "started" && n > 0) {
      character.currentHearts = Math.floor((party.totalHearts ?? 0) / n);
      character.currentStamina = Math.floor((party.totalStamina ?? 0) / n);
     } else {
      character.currentStamina = party.characters[characterIndex].currentStamina;
      character.currentHearts = party.characters[characterIndex].currentHearts;
     }
    }
    const moveCostsForLog = staminaCost > 0 && movePayResult
     ? buildCostsForLog(movePayResult)
     : undefined;

    // When leaving a square, clear reportable discoveries in that square that were NOT pinned (not in reportedDiscoveryKeys). Marked discoveries are kept.
    const leavingSquare = String(currentSquare || "").trim().toUpperCase();
    const reportedSet = new Set(Array.isArray(party.reportedDiscoveryKeys) ? party.reportedDiscoveryKeys.filter((k) => typeof k === "string" && k.length > 0) : []);
    const GROTTO_CLEANUP_OUTCOMES = ["grotto", "grotto_found", "grotto_cleansed"];
    const isDiscoveryReportedForCleanup = (key, outcome, entrySquare, entryQuadrant) => {
     if (reportedSet.has(key)) return true;
     // Dashboard dedupes grottos (shows only cleansed/named); user pins one key (e.g. grotto_cleansed|G11|Q3|...). Treat all grotto-type entries in same square+quadrant as reported if any grotto key is pinned.
     if (GROTTO_CLEANUP_OUTCOMES.includes(outcome)) {
      for (const k of reportedSet) {
       const parts = String(k).split("|");
       if (parts.length >= 3 && GROTTO_CLEANUP_OUTCOMES.includes((parts[0] || "").trim()) && String(parts[1] || "").trim().toUpperCase() === entrySquare && String(parts[2] || "").trim().toUpperCase() === entryQuadrant) return true;
      }
     }
     return false;
    };
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
      if (isDiscoveryReportedForCleanup(key, e.outcome, entrySquare, entryQuadrant)) {
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

    // Keep fog clear for quadrants the party has visited (so the one they left stays clear)
    if (!party.visitedQuadrantsThisRun) party.visitedQuadrantsThisRun = [];
    const addVisited = (squareId, quadrantId) => {
      const sn = String(squareId || "").trim().toUpperCase();
      const qn = String(quadrantId || "").trim().toUpperCase();
      if (!sn || !qn) return;
      const already = party.visitedQuadrantsThisRun.some(
        (v) => String(v.squareId || "").trim().toUpperCase() === sn && String(v.quadrantId || "").trim().toUpperCase() === qn
      );
      if (!already) {
        party.visitedQuadrantsThisRun.push({ squareId: String(squareId), quadrantId: String(quadrantId) });
      }
    };
    addVisited(party.square, party.quadrant); // quadrant we're leaving stays clear
    addVisited(newLocation.square, newLocation.quadrant); // destination
    if (party.visitedQuadrantsThisRun.length > 0) party.markModified("visitedQuadrantsThisRun");

    party.square = newLocation.square;
    party.quadrant = newLocation.quadrant;
    party.leftGrottoSquare = null;
    party.leftGrottoQuadrant = null;
    party.markModified("leftGrottoSquare");
    party.markModified("leftGrottoQuadrant");
    if (destMapSquare && destMapSquare.region) {
     party.region = destMapSquare.region;
     party.markModified("region");
    }
    party.lastCampedAtQuadrant = null;
    party.markModified("lastCampedAtQuadrant");
    // DESIGN: Quadrant stays UNEXPLORED until the party gets the "Quadrant Explored!" prompt (roll outcome "explored").
    // Do NOT mark quadrant as explored on move — only the roll outcome "explored" marks it and updates the map. Fog of war is lifted for the current quadrant on the dashboard when the party moves there; status remains unexplored until the prompt.
    party.quadrantState = destinationQuadrantState;
    party.markModified("quadrantState");
    const locationMove = `${newLocation.square} ${newLocation.quadrant}`;
    const quadrantStateLabel = destinationQuadrantState === "secured" ? "secured" : destinationQuadrantState === "explored" ? "explored" : "unexplored";
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
    await party.save(); // Always persist so dashboard shows current hearts/stamina/progress

    // Check for blight from database quadrant.blighted field
    let blightResult = null;
    if (destQ && destQ.blighted === true) {
     blightResult = await applyBlightExposure(
      party,
      newLocation.square,
      newLocation.quadrant,
      moveWasReveal ? "reveal" : "travel",
      character.name,
      interaction.client,
      interaction.guild
     );
    }

    const nextCharacterMove = party.characters[party.currentTurn];
    const moveToUnexplored = moveWasReveal;
    // Move to unexplored quadrant uses gold color + border image as a milestone prompt
    let moveDescription = moveToUnexplored
     ? `The party has arrived at **${locationMove}**!\n\n📍 **New quadrant — use ${getExploreCommandId() ? `</explore roll:${getExploreCommandId()}>` : "`/explore roll`"} to continue!**`
     : `${character.name} led the party to **${locationMove}** (quadrant ${quadrantStateLabel}).`;
    
    // Add blight exposure warning if entering blighted quadrant
    if (destQ && destQ.blighted === true) {
     moveDescription += `\n\n☠️ **Blighted Area!** This quadrant is corrupted by malice.`;
     if (blightResult) {
      if (blightResult.blightedMembers.length > 0) {
       const blightedNames = blightResult.blightedMembers.map(m => `**${m.name}**`).join(", ");
       moveDescription += `\n\n💀 **BLIGHT CONTRACTED!** ${blightedNames} ${blightResult.blightedMembers.length === 1 ? "has" : "have"} been infected by the corruption! Use \`/blight status\` to check their condition.`;
      } else if (blightResult.safeMembers.length > 0) {
       moveDescription += ` The party resisted the corruption this time.`;
      }
     }
    }
    if (clearedCount > 0 && party.status === "started") {
     moveDescription += `\n\n⚠️ **${clearedCount} unmarked discovery(ies) in ${currentSquare} were forgotten.** Place pins on the dashboard before moving to keep them on the map.`;
    }

    let mapLedChestLootEmbed = null;
    // If this quadrant is an old map location: grant reward if any party member has appraised, unredeemed map (one-and-done)
    const quadWithMap = destMapSquare && destMapSquare.quadrants ? destMapSquare.quadrants.find(
      (qu) => String(qu.quadrantId).toUpperCase() === String(newLocation.quadrant).toUpperCase()
    ) : null;
    if (quadWithMap && quadWithMap.oldMapNumber != null) {
      const mapItemName = `Map #${quadWithMap.oldMapNumber}`;
      const leadsTo = (quadWithMap.oldMapLeadsTo || "chest").toLowerCase();
      const leadsToLabel = (quadWithMap.oldMapLeadsTo || "treasure").charAt(0).toUpperCase() + (quadWithMap.oldMapLeadsTo || "").slice(1).toLowerCase();
      const whoHasUnexpiredMap = [];
      try {
        for (const pc of party.characters) {
          const hasIt = await hasAppraisedUnexpiredOldMap({ _id: pc._id, name: pc.name, userId: pc.userId }, quadWithMap.oldMapNumber);
          if (hasIt) whoHasUnexpiredMap.push(pc);
        }
        if (whoHasUnexpiredMap.length > 0) {
          const mapOwnerCharRef = whoHasUnexpiredMap[0];
          const mapOwnerName = mapOwnerCharRef?.name || "Unknown";
          const redeemed = await findAndRedeemOldMap(
            { _id: mapOwnerCharRef?._id, name: mapOwnerCharRef?.name, userId: mapOwnerCharRef?.userId },
            quadWithMap.oldMapNumber
          );
          if (redeemed) {
            if (leadsTo === "chest") {
              const chestResult = await grantExplorationChestLootToParty(party, locationMove, interaction);
              mapLedChestLootEmbed = chestResult?.lootEmbed ?? null;
              pushProgressLog(party, mapOwnerName, "map_chest", `Map #${quadWithMap.oldMapNumber} led to a chest at **${locationMove}**. Opened.`, undefined, undefined);
              moveDescription += `\n\n🗺️ **Your map led you here!** **${mapOwnerName}**'s map revealed a **Chest** — opened!`;
            } else if (leadsTo === "relic") {
              const mapOwnerChar = party.characters.find((c) => c.name === mapOwnerName);
              const mapOwnerDoc = mapOwnerChar ? await Character.findById(mapOwnerChar._id) : null;
              if (mapOwnerDoc && (await characterHasPendingRelic(mapOwnerDoc))) {
                const allItemsMap = await fetchAllItems();
                if (allItemsMap && allItemsMap.length > 0) {
                  const fallbackItem = allItemsMap[Math.floor(Math.random() * allItemsMap.length)];
                  try {
                    await addItemInventoryDatabase(mapOwnerDoc._id, fallbackItem.itemName, 1, interaction, "Exploration Map");
                    if (!party.gatheredItems) party.gatheredItems = [];
                    party.gatheredItems.push({ characterId: mapOwnerDoc._id, characterName: mapOwnerDoc.name, itemName: fallbackItem.itemName, quantity: 1, emoji: fallbackItem.emoji || "" });
                    pushProgressLog(party, mapOwnerName, "map_chest", `Map #${quadWithMap.oldMapNumber} would have led to a relic at **${locationMove}**, but **${mapOwnerName}** is still carrying one (appraise or submit art first)—found **${fallbackItem.itemName}** instead.`, { itemName: fallbackItem.itemName, emoji: fallbackItem.emoji || "" }, undefined);
                    await party.save();
                    moveDescription += `\n\n🗺️ **Your map led you here!** **${mapOwnerName}**'s map would have revealed a relic, but they're still carrying one (get it appraised or submit your art first)—they found **${fallbackItem.itemName}** instead.`;
                  } catch (err) {
                    logger.warn("EXPLORE", `[explore.js] map-led relic→item grant: ${err?.message || err}`);
                    moveDescription += `\n\n🗺️ **Your map led you here!** **${mapOwnerName}**'s map would have revealed a relic, but they're still carrying one—grant failed.`;
                  }
                } else {
                  pushProgressLog(party, mapOwnerName, "map_chest", `Map #${quadWithMap.oldMapNumber} would have led to a relic at **${locationMove}**, but **${mapOwnerName}** is still carrying one (appraise or submit art first).`, undefined, undefined);
                  await party.save();
                  moveDescription += `\n\n🗺️ **Your map led you here!** **${mapOwnerName}**'s map would have revealed a relic, but they're still carrying one (get it appraised or submit your art first).`;
                }
              } else if (mapOwnerDoc) {
                try {
                  const squareStrMove = String(party.square || "").trim().toUpperCase();
                  const quadrantStrMove = String(party.quadrant || "").trim().toUpperCase();
                  const regionStrMove = destMapSquare?.region ?? "";
                  const savedRelic = await createRelic({
                    name: "Unknown Relic",
                    discoveredBy: mapOwnerDoc.name,
                    characterId: mapOwnerDoc._id,
                    discoveredDate: new Date(),
                    locationFound: locationMove,
                    region: regionStrMove,
                    square: squareStrMove,
                    quadrant: quadrantStrMove,
                    appraised: false,
                  });
                  if (!party.gatheredItems) party.gatheredItems = [];
                  party.gatheredItems.push({ characterId: mapOwnerDoc._id, characterName: mapOwnerDoc.name, itemName: "Unknown Relic", quantity: 1, emoji: "🔸" });
                  pushProgressLog(party, mapOwnerName, "relic", `Map #${quadWithMap.oldMapNumber} led to a relic at **${locationMove}**; take to Artist/Researcher to appraise.`, { itemName: "Unknown Relic", emoji: "🔸" }, undefined);
                  await party.save();
                  moveDescription += `\n\n🗺️ **Your map led you here!** **${mapOwnerName}**'s map revealed a **Relic** (${savedRelic?.relicId || "—"})!`;
                } catch (err) {
                  logger.error("EXPLORE", `[explore.js]❌ createRelic (map-led): ${err?.message || err}`);
                  moveDescription += `\n\n🗺️ **Your map led you here!** **${mapOwnerName}**'s map revealed a **Relic** (grant failed).`;
                }
              } else {
                moveDescription += `\n\n🗺️ **Your map led you here!** **${mapOwnerName}**'s map revealed a **Relic**!`;
              }
            } else if (leadsTo === "shrine") {
              await pushDiscoveryToMap(party, "shrine", new Date(), interaction.user?.id);
              pushProgressLog(party, mapOwnerName, "map_shrine", `Map #${quadWithMap.oldMapNumber} led to a shrine at **${locationMove}**.`, undefined, undefined);
              await party.save();
              moveDescription += `\n\n🗺️ **Your map led you here!** **${mapOwnerName}**'s map revealed a **Shrine** — discovery added to the map.`;
            } else if (leadsTo === "ruins") {
              await pushDiscoveryToMap(party, "ruins", new Date(), interaction.user?.id);
              pushProgressLog(party, mapOwnerName, "map_ruins", `Map #${quadWithMap.oldMapNumber} led to ruins at **${locationMove}**.`, undefined, undefined);
              await party.save();
              moveDescription += `\n\n🗺️ **Your map led you here!** **${mapOwnerName}**'s map revealed **Ruins** — discovery added to the map.`;
            } else {
              moveDescription += `\n\n🗺️ **Your map led you here!** **${mapOwnerName}**'s map revealed a **${leadsToLabel}**!`;
            }
          }
        } else {
          // Only mention "map location" if someone in the party has this map but hasn't appraised it yet
          const whoHasMapUnappraised = [];
          for (const pc of party.characters) {
            const hasMap = await hasOldMap({ _id: pc._id, name: pc.name, userId: pc.userId }, quadWithMap.oldMapNumber);
            const hasAppraised = await hasAppraisedOldMap({ _id: pc._id, name: pc.name, userId: pc.userId }, quadWithMap.oldMapNumber);
            if (hasMap && !hasAppraised) whoHasMapUnappraised.push(pc.name);
          }
          if (whoHasMapUnappraised.length > 0) {
            moveDescription += `\n\n🗺️ **Map location!** This area is marked on an old map. Get it appraised at the Inariko Library to discover what's here. More info: ${OLD_MAPS_LINK}`;
            // DM the move leader (person who ran /explore move) so they're notified; don't reveal map number or what it leads to until appraised
            const moveLeaderId = interaction.user?.id;
            if (moveLeaderId && interaction.client) {
              const mapLocationDmEmbed = new EmbedBuilder()
                .setTitle("🗺️ Map location")
                .setDescription(`You've entered an area marked on an old map (**${locationMove}**). Get a map appraised at the Inariko Library to discover what's here.`)
                .setThumbnail(OLD_MAP_ICON_URL)
                .setURL(OLD_MAPS_LINK)
                .setColor(0x2ecc71)
                .setFooter({ text: "Roots of the Wild • Old Maps" });
              try {
                const user = await interaction.client.users.fetch(moveLeaderId).catch(() => null);
                if (user) await user.send({ embeds: [mapLocationDmEmbed] }).catch(() => {});
              } catch (_) {}
            }
          }
        }
      } catch (invErr) {
        logger.warn("EXPLORE", `[explore.js]⚠️ Old map collection check: ${invErr?.message || invErr}`);
      }
    }

    // Move to unexplored quadrant: gold color; blighted quadrant: blight color + blight eye thumbnail
    const isBlightedQuadrant = !!(destQ && destQ.blighted === true);
    const moveEmbedColor = isBlightedQuadrant
     ? getExploreOutcomeColor("blight_exposure", "#641E16")
     : (moveToUnexplored ? "#FFD700" : getExploreOutcomeColor("move", regionColors[party.region] || "#2196F3"));
    const moveEmbedImage = getExploreMapImageUrl(party, { highlight: true });
    const moveEmbedTitle = moveToUnexplored
     ? `📍 **New Quadrant: ${newLocation.square} ${newLocation.quadrant}**`
     : `🗺️ **Expedition: Moved to ${newLocation.square} ${newLocation.quadrant}**`;

    const embed = new EmbedBuilder()
     .setTitle(moveEmbedTitle)
     .setColor(moveEmbedColor)
     .setDescription(moveDescription)
     .setImage(moveEmbedImage);
    if (isBlightedQuadrant) {
     embed.setThumbnail("https://cdn.discordapp.com/emojis/805576955725611058.png");
    }
    const moveToSecured = destinationQuadrantState === "secured";
    const moveIsAtStart = (() => {
     const regionKey = (party.region || "").toLowerCase();
     const start = START_POINTS_BY_REGION[regionKey];
     return start && String(party.square || "").toUpperCase() === String(start.square || "").toUpperCase() && String(party.quadrant || "").toUpperCase() === String(start.quadrant || "").toUpperCase();
    })();
    const noCampInDest = isPreestablishedNoCamp(newLocation.square, newLocation.quadrant) || (destQ && destQ.noCamp);
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
      actionCost: movePayResult ? { staminaCost: movePayResult.staminaPaid ?? 0, heartsCost: movePayResult.heartsPaid ?? 0 } : null,
      hazardMessage: hazardMoveResult?.hazardMessage ?? null,
      hideCampCommand: noCampInDest,
    });
    addExplorationCommandsField(embed, {
      party,
      expeditionId,
      location: locationMove,
      nextCharacter: nextCharacterMove ?? null,
      showNextAndCommands: true,
      showRestSecureMove: !moveToSecured && !moveToUnexplored,
      showMoveCommand: moveToSecured,
      showSecuredQuadrantOnly: moveToSecured,
      showMoveToUnexploredOnly: moveToUnexplored,
      hasDiscoveriesInQuadrant: hasDiscMove,
      isAtStartQuadrant: moveIsAtStart,
      hideCampCommand: noCampInDest,
    });

    await interaction.editReply({ embeds: [embed] });
    if (mapLedChestLootEmbed) await interaction.followUp({ embeds: [mapLedChestLootEmbed] }).catch(() => {});
    await interaction.followUp({ content: getExplorationNextTurnContent(nextCharacterMove) });

    // ------------------- Use Item (healing from expedition loadout) -------------------
   } else if (subcommand === "item") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = normalizeCharacterName(interaction.options.getString("charactername"));
    const itemName = interaction.options.getString("item");
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition ID not found.")] });
    }
    // Keep pre-established secured/no-camp paths in sync with the map DB
    await enforcePreestablishedSecuredOnSquare(party.square);

    const character = await findCharacterByNameAndUser(characterName, userId);
    if (!character) {
     return interaction.editReply({
      embeds: [createExplorationErrorEmbed("❌ **Character not found**", "Character not found or you do not own this character.")]
     });
    }

    const characterIndex = party.characters.findIndex(
     (c) =>
      c.name != null &&
      c.name.trim().toLowerCase() === (characterName || "").trim().toLowerCase()
    );
    if (characterIndex === -1) {
     return interaction.editReply(
      "Your character is not part of this expedition."
     );
    }

    if (party.status !== "started") {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not started**", "This expedition has not been started yet.", { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
    }
    if ((party.totalHearts ?? 0) <= 0) {
     await handleExpeditionFailed(party, interaction);
     return;
    }
    if (!SKIP_PIN_REQUIREMENT_FOR_TESTING) {
     const unpinnedItem = await hasUnpinnedDiscoveriesInQuadrant(party);
     if (unpinnedItem) {
      const blockEmbed = await createUnpinnedDiscoveriesBlockEmbed(party, expeditionId);
      return interaction.editReply({ embeds: [blockEmbed] });
     }
    }
    const partyChar = party.characters[characterIndex];
    // Normalize input: autocomplete display is "ItemName — ❤ N | 🟩 N"; if user pastes that, strip suffix so we match stored itemName
    const normalizedItemInput = (itemName || "").trim().replace(EXPEDITION_ITEM_LABEL_SPLIT, "").trim();
    const itemKey = normalizeExpeditionItemNameKey(normalizedItemInput);
    const itemIndex = partyChar.items.findIndex(
     (i) => i.itemName && normalizeExpeditionItemNameKey(i.itemName) === itemKey
    );
    if (itemIndex === -1) {
     const loadoutLines = (partyChar.items || [])
      .filter((i) => i.itemName)
      .map(
       (i) =>
        `• **${i.itemName}** — ❤️${i.modifierHearts || 0} | 🟩${i.staminaRecovered || 0}`
      )
      .join("\n");
     const tried = normalizedItemInput || (itemName || "").trim() || "—";
     const desc =
      `**${partyChar.name}** does not have **${tried}** in their expedition loadout (by item name).\n\n` +
      (loadoutLines
       ? `**Their loadout in this expedition:**\n${loadoutLines}\n\nPick the item from the **item** autocomplete, or check the dashboard loadout matches.`
       : `_No items are stored on this character in the expedition party data._`);
     return interaction.editReply({
      embeds: [
       createExplorationErrorEmbed("❌ **Item not in loadout**", desc, {
        party,
        expeditionId,
        location: `${party.square} ${party.quadrant}`,
        nextCharacter: party?.characters?.[party?.currentTurn] ?? null,
        showNextAndCommands: true,
       }),
      ],
     });
    }

    const carried = partyChar.items[itemIndex];
    const hearts = Math.max(0, carried.modifierHearts || 0);
    const stamina = Math.max(0, carried.staminaRecovered || 0);

    if (hearts === 0 && stamina === 0) {
     if (!isHazardResistanceElixir(carried.itemName)) {
      const isElixir = /elixir/i.test(carried.itemName || "");
      return interaction.editReply(
       isElixir
        ? `**${carried.itemName}** is a buff elixir (resistance/stat boost), not a healing item. Only **Electro**, **Fireproof**, and **Spicy Elixir** can be used during an expedition to protect the party from hazards for the rest of the explore.`
        : "That item can only be used when securing the quadrant (e.g. Wood Bundle, Eldin Ore Bundle)."
      );
     }
     // Hazard-resistance elixir: use for exploration protection (handled below)
    }

    // Pool-only: add item hearts/stamina to party pool; cap at combined party max
    const itemCaps = await getPartyPoolCaps(party);

    // Prevent wasting items when they would have no effect (only for healing/stamina items)
    const currentHearts = party.totalHearts ?? 0;
    const currentStamina = party.totalStamina ?? 0;
    const heartsAtMax = currentHearts >= itemCaps.maxHearts;
    const staminaAtMax = currentStamina >= itemCaps.maxStamina;
    const isHazardElixirUse = (hearts === 0 && stamina === 0) && isHazardResistanceElixir(carried.itemName);

    if (!isHazardElixirUse && hearts > 0 && stamina === 0 && heartsAtMax) {
     const fullHeartsEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle("❤️ Hearts are full")
      .setDescription(`Party is at **${currentHearts}/${itemCaps.maxHearts}** hearts. Save **${carried.itemName}** for when the party takes damage.\n\n_Your turn was **not** used — you can take another action._`);
     return interaction.editReply({ embeds: [fullHeartsEmbed], ephemeral: true });
    }

    if (!isHazardElixirUse && stamina > 0 && hearts === 0 && staminaAtMax) {
     const fullStaminaEmbed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle("🟩 Stamina is full")
      .setDescription(`Party is at **${currentStamina}/${itemCaps.maxStamina}** stamina. Save **${carried.itemName}** for when the party needs more.\n\n_Your turn was **not** used — you can take another action._`);
     return interaction.editReply({ embeds: [fullStaminaEmbed], ephemeral: true });
    }

    if (!isHazardElixirUse && hearts > 0 && stamina > 0 && heartsAtMax && staminaAtMax) {
     const fullPoolEmbed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle("❤️🟩 Hearts and stamina are full")
      .setDescription(`Party is at **${currentHearts}/${itemCaps.maxHearts}** ❤ and **${currentStamina}/${itemCaps.maxStamina}** 🟩. Save **${carried.itemName}** for later.\n\n_Your turn was **not** used — you can take another action._`);
     return interaction.editReply({ embeds: [fullPoolEmbed], ephemeral: true });
    }

    // Item = turn: during active wave/raid, only the current turn participant may use an item. Check before applying any effects.
    const activeWaveForItem = await Wave.findOne({ expeditionId: { $regex: exactIRegex(expeditionId) }, status: "active" });
    const activeRaidForItem = await Raid.findOne({ expeditionId: { $regex: exactIRegex(expeditionId) }, status: "active" });
    if (activeWaveForItem) {
     const waveCurrent = activeWaveForItem.participants?.[activeWaveForItem.currentTurn ?? 0];
     if (waveCurrent && waveCurrent.characterId && character._id && waveCurrent.characterId.toString() !== character._id.toString()) {
      const currentName = waveCurrent.name ?? "the current turn";
      const notYourTurnEmbed = new EmbedBuilder()
       .setColor(NOT_YOUR_TURN_COLOR)
       .setTitle("⏳ Not Your Turn")
       .setDescription(`Only **${currentName}** (current turn) can use an item. Wait for your turn in the wave, then use ${getExploreCommandId() ? `</explore item:${getExploreCommandId()}>` : "**/explore item**"}.`)
       .setImage(NOT_YOUR_TURN_BORDER_URL)
       .setFooter({ text: "Expedition" })
       .setTimestamp();
      return interaction.editReply({ embeds: [notYourTurnEmbed], ephemeral: true });
     }
    }
    if (activeRaidForItem) {
     const raidCurrent = activeRaidForItem.getCurrentTurnParticipant?.() ?? activeRaidForItem.participants?.[activeRaidForItem.currentTurn ?? 0];
     if (raidCurrent && raidCurrent.characterId && character._id && raidCurrent.characterId.toString() !== character._id.toString()) {
      const currentName = raidCurrent.name ?? "the current turn";
      const notYourTurnEmbed = new EmbedBuilder()
       .setColor(NOT_YOUR_TURN_COLOR)
       .setTitle("⏳ Not Your Turn")
       .setDescription(`Only **${currentName}** (current turn) can use an item. Wait for your turn in the raid, then use ${getExploreCommandId() ? `</explore item:${getExploreCommandId()}>` : "**/explore item**"}.`)
       .setImage(NOT_YOUR_TURN_BORDER_URL)
       .setFooter({ text: "Expedition" })
       .setTimestamp();
      return interaction.editReply({ embeds: [notYourTurnEmbed], ephemeral: true });
     }
    }

    // Normal exploration (no wave/raid): only the current expedition turn may use an item
    if (!activeWaveForItem && !activeRaidForItem) {
     const currentTurnIndex = party.currentTurn ?? 0;
     if (characterIndex !== currentTurnIndex) {
      const currentTurnChar = party.characters[currentTurnIndex];
      const currentName = currentTurnChar?.name ?? "the current turn";
      const notYourTurnEmbed = new EmbedBuilder()
       .setColor(NOT_YOUR_TURN_COLOR)
       .setTitle("⏳ Not Your Turn")
       .setDescription(`Only **${currentName}** can use an item. Wait for your turn, then use ${getExploreCommandId() ? `</explore item:${getExploreCommandId()}>` : "**/explore item**"}.`)
       .setImage(NOT_YOUR_TURN_BORDER_URL)
       .setFooter({ text: "Expedition" })
       .setTimestamp();
      return interaction.editReply({ embeds: [notYourTurnEmbed], ephemeral: true });
     }
    }

    const beforeHeartsItem = party.totalHearts ?? 0;
    const beforeStaminaItem = party.totalStamina ?? 0;
    if (hearts > 0) {
     party.totalHearts = Math.min(itemCaps.maxHearts, Math.max(0, beforeHeartsItem + hearts));
     party.markModified("totalHearts");
    }
    if (stamina > 0) {
     party.totalStamina = Math.min(itemCaps.maxStamina, Math.max(0, beforeStaminaItem + stamina));
     party.markModified("totalStamina");
     logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} item ${partyChar?.name ?? "?"} ${itemName ?? "?"} 🟩${beforeStaminaItem} +${stamina} → 🟩${party.totalStamina ?? 0}`);
    }
    if (isHazardElixirUse) {
     const elixirType = getElixirTypeByName(carried.itemName);
     party.exploreElixir = { type: elixirType, elixirName: carried.itemName };
     party.markModified("exploreElixir");
     logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} hazard elixir ${carried.itemName} used by ${partyChar?.name ?? "?"} — protection for rest of explore`);
    }

    // Always remove from party loadout so it appears used (testing: still no DB change to character inventory)
    partyChar.items.splice(itemIndex, 1);
    // Nested mutation (items array) lives under party.characters
    party.markModified("characters");

    // Log item use to InventoryLog so Dashboard Inventory All Transactions shows it
    const locationItem = `${party.square} ${party.quadrant}`;
    let itemRowForUsedItemEmbed = null;
    try {
      const itemForLog = await fetchItemByName(carried.itemName).catch(() => null) || { itemName: carried.itemName };
      itemRowForUsedItemEmbed = itemForLog;
      const interactionUrl = interaction.guildId && interaction.channelId && interaction.id
        ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
        : "";
      await logItemRemovalToDatabase(character, itemForLog, {
        quantity: 1,
        obtain: "Expedition (Used)",
        location: locationItem,
        link: interactionUrl
      });
    } catch (logErr) {
      logger.warn("EXPLORE", `[explore.js] Failed to log explore item use to InventoryLog: ${logErr?.message || logErr}`);
    }

    // During active wave/raid: only advance wave/raid turn, NOT expedition turn (dashboard stays correct)
    // Track the next turn participant from wave/raid for proper follow-up ping
    let combatNextTurnParticipant = null;
    if (!activeWaveForItem && !activeRaidForItem) {
     party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    }

    if (activeWaveForItem) {
      // Also advance wave turn during active wave
      try {
        await advanceWaveTurnOnItemUse(character._id);
        logger.info("EXPLORE", `[explore.js] Item used during wave — advanced wave turn`);
        // Re-fetch wave to get updated turn order
        const refreshedWave = await Wave.findOne({ waveId: activeWaveForItem.waveId });
        if (refreshedWave && refreshedWave.participants && refreshedWave.participants.length > 0) {
          const waveNextTurn = refreshedWave.currentTurn ?? 0;
          combatNextTurnParticipant = refreshedWave.participants[waveNextTurn] ?? null;
        }
      } catch (waveErr) {
        logger.warn("EXPLORE", `[explore.js]⚠️ advanceWaveTurnOnItemUse: ${waveErr?.message || waveErr}`);
      }
    } else if (activeRaidForItem) {
      // Also advance raid turn during active raid
      try {
        await advanceRaidTurnOnItemUse(character._id);
        logger.info("EXPLORE", `[explore.js] Item used during raid — advanced raid turn`);
        // Re-fetch raid to get updated turn order
        const refreshedRaid = await Raid.findOne({ raidId: activeRaidForItem.raidId });
        if (refreshedRaid && refreshedRaid.participants && refreshedRaid.participants.length > 0) {
          const raidNextTurn = refreshedRaid.currentTurn ?? 0;
          combatNextTurnParticipant = refreshedRaid.participants[raidNextTurn] ?? null;
        }
      } catch (raidErr) {
        logger.warn("EXPLORE", `[explore.js]⚠️ advanceRaidTurnOnItemUse: ${raidErr?.message || raidErr}`);
      }
    } else {
      logger.info("EXPLORE", `[explore.js] Item used outside combat — advanced expedition turn`);
    }

    const heartsText = hearts > 0 ? `+${hearts} ❤️` : "";
    const staminaText = stamina > 0 ? `+${stamina} 🟩` : "";
    const hazardProtectionText = isHazardElixirUse ? "Hazard protection for the rest of the expedition" : "";
    const effect = [heartsText, staminaText, hazardProtectionText].filter(Boolean).join(", ");

    // During active wave/raid, use combat turn order for "next" display; otherwise use expedition turn
    const nextCharacterItem = combatNextTurnParticipant
      ? { name: combatNextTurnParticipant.name, userId: combatNextTurnParticipant.userId }
      : (party.characters[party.currentTurn] ?? null);
    const progressMsg = isHazardElixirUse
     ? `${character.name} used ${carried.itemName} in ${locationItem} — the party is now protected against quadrant hazards for the rest of this expedition.`
     : `${character.name} used ${carried.itemName} in ${locationItem} (${[heartsText, staminaText].filter(Boolean).join(", ")}).`;
    pushProgressLog(party, character.name, "item", progressMsg, undefined, {
     ...(hearts > 0 ? { heartsRecovered: hearts } : {}),
     ...(stamina > 0 ? { staminaRecovered: stamina } : {}),
    });
    await party.save(); // Persist pool + loadout + progress log in one place

    const hazardLabel = isHazardElixirUse && party.exploreElixir?.type
     ? (party.exploreElixir.type === "electro" ? "thunder" : party.exploreElixir.type === "fireproof" ? "hot" : party.exploreElixir.type === "spicy" ? "cold" : "quadrant")
     : "";
    const embedDescription = isHazardElixirUse
     ? `${character.name} used **${carried.itemName}**. The party is now protected against **${hazardLabel}** hazards for the rest of this expedition.`
     : `${character.name} used **${carried.itemName}** (${[heartsText, staminaText].filter(Boolean).join(", ")}).`;
    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Used item — ${carried.itemName}**`)
     .setColor(getExploreOutcomeColor("item", regionColors[party.region] || "#4CAF50"))
     .setDescription(embedDescription)
     .setImage("https://storage.googleapis.com/tinglebot/Borders/border_green.png");
    const itemImg = itemRowForUsedItemEmbed?.image;
    if (itemImg && itemImg !== "No Image" && isValidImageUrl(itemImg)) {
     embed.setThumbnail(itemImg);
    }
    const hasDiscItem = await hasDiscoveriesInQuadrant(party.square, party.quadrant);
    const activeWaveIdForEmbed = activeWaveForItem?.waveId ?? null;
    // When in a grotto trial (no wave), show grotto command + item instead of roll/camp/discovery
    const atActiveGrottoForItem = !activeWaveForItem && (await hasActiveGrottoAtLocation(party, expeditionId));
    const grottoForItem = atActiveGrottoForItem ? await resolveGrottoAtLocation(party.square, party.quadrant, expeditionId, null, true) : null;
    const activeGrottoCommandForItem = grottoForItem
      ? (grottoForItem.trialType === "maze" ? getMazeActiveGrottoCommand(getExploreCommandId(), grottoForItem) : getActiveGrottoCommand(grottoForItem.trialType))
      : "";
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationItem,
      nextCharacter: nextCharacterItem,
      showNextAndCommands: true,
      showRestSecureMove: false,
      commandsLast: true,
      hasDiscoveriesInQuadrant: hasDiscItem,
      activeWaveId: activeWaveIdForEmbed,
      hasActiveGrotto: atActiveGrottoForItem,
      activeGrottoCommand: activeGrottoCommandForItem,
      compactGrottoCommands: atActiveGrottoForItem,
    });
    if (!atActiveGrottoForItem) {
     addExplorationCommandsField(embed, {
      party,
      expeditionId,
      location: locationItem,
      nextCharacter: nextCharacterItem,
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasDiscoveriesInQuadrant: hasDiscItem,
      activeWaveId: activeWaveIdForEmbed,
     });
    }

    await interaction.editReply({ embeds: [embed] });
    if (nextCharacterItem?.userId) {
     await interaction.followUp({ content: getExplorationNextTurnContent(nextCharacterItem) }).catch(() => {});
    }

    // ------------------- End Expedition (at starting quadrant) -------------------
   } else if (subcommand === "end") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = normalizeCharacterName(interaction.options.getString("charactername"));
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition ID not found.")] });
    }

    // Block ending if there's active combat for this expedition (must resolve first)
    const endCombatBlock = await getCombatBlockReply(party, expeditionId, "end", `${party.square} ${party.quadrant}`);
    if (endCombatBlock) return interaction.editReply(endCombatBlock);
    if (party.status === "started" && (party.totalHearts ?? 0) <= 0) {
     await handleExpeditionFailed(party, interaction);
     return;
    }

    if (!SKIP_PIN_REQUIREMENT_FOR_TESTING) {
     const unpinnedEnd = await hasUnpinnedDiscoveriesInQuadrant(party);
     if (unpinnedEnd) {
      const blockEmbed = await createUnpinnedDiscoveriesBlockEmbed(party, expeditionId);
      return interaction.editReply({ embeds: [blockEmbed] });
     }
    }

    const character = await findCharacterByNameAndUser(characterName, userId);
    if (!character) {
     return interaction.editReply({
      embeds: [createExplorationErrorEmbed("❌ **Character not found**", "Character not found or you do not own this character.")]
     });
    }

    const characterIndex = party.characters.findIndex(
     (c) => c.name === characterName
    );
    if (characterIndex === -1) {
     return interaction.editReply(
      "Your character is not part of this expedition."
     );
    }

    const regionKeyEnd = (party.region || "").toLowerCase();
    const startPoint = START_POINTS_BY_REGION[regionKeyEnd];
    if (!startPoint) {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Starting quadrant**", "Could not determine the starting quadrant for this region.")] });
    }
    const isAtStartQuadrant = String(party.square || "").toUpperCase() === String(startPoint.square || "").toUpperCase() &&
     String(party.quadrant || "").toUpperCase() === String(startPoint.quadrant || "").toUpperCase();
    if (!isAtStartQuadrant) {
     const location = `${party.square} ${party.quadrant}`;
     const nextCharacter = party.characters?.[party.currentTurn] ?? null;
     const endOnlyAtStartEmbed = createExplorationEndOnlyAtStartEmbed(party, expeditionId, location, nextCharacter, await hasUnpinnedDiscoveriesInQuadrant(party));
     return interaction.editReply({ embeds: [endOnlyAtStartEmbed] });
    }

    // Block ending if the current quadrant hasn't been explored yet (must get "Quadrant Explored!" prompt first)
    if (party.quadrantState !== "explored" && party.quadrantState !== "secured") {
     return interaction.editReply(
      "You must **explore this quadrant** before ending the expedition. Use </explore roll:" + getExploreCommandId() + "> until you get the **Quadrant Explored!** prompt, then you can end the expedition."
     );
    }

    const regionToVillage = {
     eldin: "rudania",
     lanayru: "inariko",
     faron: "vhintl",
    };
    const targetVillage = regionToVillage[regionKeyEnd];

    // Divide remaining hearts and stamina evenly among the group (each gets equal share, capped at max)
    const remainingHearts = Math.max(0, party.totalHearts ?? 0);
    const remainingStamina = Math.max(0, party.totalStamina ?? 0);
    const memberCount = (party.characters || []).length;
    const splitLinesEnd = [];
    if (!false) {
     if (memberCount > 0 && (remainingHearts > 0 || remainingStamina > 0)) {
      // Load max hearts/stamina for each character so we can respect caps when splitting
      const memberMaxes = [];
      for (let idx = 0; idx < party.characters.length; idx++) {
       const char = await Character.findById(party.characters[idx]._id);
       memberMaxes.push({
        maxH: char?.maxHearts ?? 0,
        maxS: char?.maxStamina ?? 0,
       });
      }
      const baseHearts = Math.floor(remainingHearts / memberCount);
      const baseStamina = Math.floor(remainingStamina / memberCount);
      const assignedHeartsArr = memberMaxes.map((m) => Math.min(m.maxH, baseHearts));
      const assignedStaminaArr = memberMaxes.map((m) => Math.min(m.maxS, baseStamina));
      let heartsLeft = remainingHearts - assignedHeartsArr.reduce((s, a) => s + a, 0);
      let staminaLeft = remainingStamina - assignedStaminaArr.reduce((s, a) => s + a, 0);
      // Distribute remainder to those who have room; prioritize character who ended, then wrap
      const priorityOrder = Array.from({ length: memberCount }, (_, i) => (characterIndex + i) % memberCount);
      while (heartsLeft > 0) {
       let gave = false;
       for (const idx of priorityOrder) {
        if (heartsLeft <= 0) break;
        if (assignedHeartsArr[idx] < memberMaxes[idx].maxH) {
         assignedHeartsArr[idx] += 1;
         heartsLeft -= 1;
         gave = true;
        }
       }
       if (!gave) break;
      }
      while (staminaLeft > 0) {
       let gave = false;
       for (const idx of priorityOrder) {
        if (staminaLeft <= 0) break;
        if (assignedStaminaArr[idx] < memberMaxes[idx].maxS) {
         assignedStaminaArr[idx] += 1;
         staminaLeft -= 1;
         gave = true;
        }
       }
       if (!gave) break;
      }
      for (let idx = 0; idx < party.characters.length; idx++) {
       const partyCharacter = party.characters[idx];
       const char = await Character.findById(partyCharacter._id);
       if (char) {
        const assignedHearts = assignedHeartsArr[idx];
        const assignedStamina = assignedStaminaArr[idx];
        char.currentHearts = assignedHearts;
        char.currentStamina = assignedStamina;
        char.currentVillage = targetVillage;
        await char.save();
        partyCharacter.currentHearts = char.currentHearts;
        partyCharacter.currentStamina = char.currentStamina;
        const name = partyCharacter.name || char.name || "Unknown";
        splitLinesEnd.push(`${name}: ${assignedHearts} ❤, ${assignedStamina} stamina`);
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
     // Do NOT reset quadrants on normal end — explored/secured state is persisted on the exploring map when they roll "explored" or use secure; keep it so the map stays updated.
    } else {
    // Testing mode: no character DB persist; revert all map state so the map is clean after the test
    if (memberCount > 0 && (remainingHearts > 0 || remainingStamina > 0)) {
      const memberMaxes = [];
      for (let idx = 0; idx < party.characters.length; idx++) {
       const char = await Character.findById(party.characters[idx]._id);
       memberMaxes.push({
        maxH: char?.maxHearts ?? 0,
        maxS: char?.maxStamina ?? 0,
       });
      }
      const baseHearts = Math.floor(remainingHearts / memberCount);
      const baseStamina = Math.floor(remainingStamina / memberCount);
      const assignedHeartsArr = memberMaxes.map((m) => Math.min(m.maxH, baseHearts));
      const assignedStaminaArr = memberMaxes.map((m) => Math.min(m.maxS, baseStamina));
      let heartsLeft = remainingHearts - assignedHeartsArr.reduce((s, a) => s + a, 0);
      let staminaLeft = remainingStamina - assignedStaminaArr.reduce((s, a) => s + a, 0);
      const priorityOrder = Array.from({ length: memberCount }, (_, i) => (characterIndex + i) % memberCount);
      while (heartsLeft > 0) {
       let gave = false;
       for (const idx of priorityOrder) {
        if (heartsLeft <= 0) break;
        if (assignedHeartsArr[idx] < memberMaxes[idx].maxH) {
         assignedHeartsArr[idx] += 1;
         heartsLeft -= 1;
         gave = true;
        }
       }
       if (!gave) break;
      }
      while (staminaLeft > 0) {
       let gave = false;
       for (const idx of priorityOrder) {
        if (staminaLeft <= 0) break;
        if (assignedStaminaArr[idx] < memberMaxes[idx].maxS) {
         assignedStaminaArr[idx] += 1;
         staminaLeft -= 1;
         gave = true;
        }
       }
       if (!gave) break;
      }
      for (let idx = 0; idx < party.characters.length; idx++) {
       const partyCharacter = party.characters[idx];
       splitLinesEnd.push(`${partyCharacter.name || "Unknown"}: ${assignedHeartsArr[idx]} ❤, ${assignedStaminaArr[idx]} stamina`);
      }
     }
     await Grotto.deleteMany({ partyId: expeditionId }).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Grotto delete on end: ${err?.message}`));
     // Revert every quadrant this expedition marked explored or secured back to unexplored (testing: map must be reverted when test is over)
     const exploredThisRunEnd = party.exploredQuadrantsThisRun || [];
     if (exploredThisRunEnd.length > 0) {
      for (const { squareId, quadrantId } of exploredThisRunEnd) {
       if (squareId && quadrantId) {
        const resolvedEnd = await findExactMapSquareAndQuadrant(squareId, quadrantId);
        if (resolvedEnd) {
         const { exactSquareId, exactQuadrantId } = resolvedEnd;
         await Square.updateOne(
          { squareId: exactSquareId, "quadrants.quadrantId": exactQuadrantId },
          { $set: { "quadrants.$[q].status": "unexplored", "quadrants.$[q].exploredBy": "", "quadrants.$[q].exploredAt": null } },
          { arrayFilters: [{ "q.quadrantId": exactQuadrantId }] }
         ).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Testing end: reset quadrant to unexplored: ${err?.message}`));
         // Clear all discoveries in this quadrant so the map is clean for the next test (grottos, camps, ruins, etc.)
         await Square.updateOne(
          { squareId: exactSquareId, "quadrants.quadrantId": exactQuadrantId },
          { $set: { "quadrants.$[q].discoveries": [] } },
          { arrayFilters: [{ "q.quadrantId": exactQuadrantId }] }
         ).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Testing end: clear discoveries: ${err?.message}`));
        }
       }
      }
     }
     // Remove pins placed during this expedition (testing: do not persist discovery pins)
     const expeditionPins = await Pin.find({ partyId: String(expeditionId).trim() }).lean().catch(() => []);
     for (const pin of expeditionPins || []) {
      const key = pin.sourceDiscoveryKey;
      if (key && typeof key === "string") {
       const parts = key.split("|");
       const squareIdRaw = (parts[1] ?? "").trim();
       const quadrantId = (parts[2] ?? "").trim().toUpperCase();
       if (squareIdRaw && (quadrantId === "Q1" || quadrantId === "Q2" || quadrantId === "Q3" || quadrantId === "Q4")) {
        const squareIdRegex = new RegExp(`^${String(squareIdRaw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
        await Square.updateOne(
         { squareId: squareIdRegex, "quadrants.quadrantId": quadrantId, "quadrants.discoveries.discoveryKey": key },
         { $set: { "quadrants.$[q].discoveries.$[d].pinned": false, "quadrants.$[q].discoveries.$[d].pinnedAt": null, "quadrants.$[q].discoveries.$[d].pinId": null } },
         { arrayFilters: [{ "q.quadrantId": quadrantId }, { "d.discoveryKey": key }] }
        ).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Testing end: unpin discovery: ${err?.message}`));
       }
      }
      await Pin.findByIdAndDelete(pin._id).catch((err) => logger.warn("EXPLORE", `[explore.js]⚠️ Testing end: delete pin: ${err?.message}`));
     }
     if (Array.isArray(party.reportedDiscoveryKeys) && party.reportedDiscoveryKeys.length > 0) {
      party.reportedDiscoveryKeys = [];
      party.markModified("reportedDiscoveryKeys");
     }
     // Clear progress log so the next test run has no discovery history
     if (party.progressLog && party.progressLog.length > 0) {
      party.progressLog = [];
      party.markModified("progressLog");
     }
    }

    const villageLabelEnd = targetVillage.charAt(0).toUpperCase() + targetVillage.slice(1);
    const memberNamesEnd = (party.characters || []).map((c) => c.name).filter(Boolean);
    const membersTextEnd = memberNamesEnd.length > 0 ? memberNamesEnd.join(", ") : "—";
    pushProgressLog(party, character.name, "end", `Expedition ended. Returned to ${villageLabelEnd}: ${membersTextEnd}.`, undefined, undefined);
    if (false) {
     pushProgressLog(party, character.name, "end_test_reset", "Testing mode: No changes were saved.", undefined, undefined);
    }

    await closeRaidsForExpedition(expeditionId);

    party.status = "completed";
    party.outcome = "success";
    party.finalLocation = { square: party.square, quadrant: party.quadrant };
    party.endedAt = new Date();
    party.exploreElixir = undefined;
    party.markModified("exploreElixir");
    await party.save(); // Always persist so dashboard shows current hearts/stamina/progress

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
      else if (o === "old_map") highlightOutcomes.add("Old map found");
    }
    const highlightsList = [...highlightOutcomes];
    const highlightsValue = highlightsList.length > 0 ? highlightsList.map((h) => `• ${h}`).join("\n") : "";

    const reportUrl = getExplorePageUrl(expeditionId);
    const testingResetNote = "";
    const startTime = party.createdAt ? new Date(party.createdAt).getTime() : Date.now();
    const durationMs = Math.max(0, Date.now() - startTime);
    const durationMins = Math.floor(durationMs / 60000);
    const hours = Math.floor(durationMins / 60);
    const mins = durationMins % 60;
    const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    const embed = new EmbedBuilder()
     .setTitle("🗺️ **Expedition: Returned Home**")
     .setColor(getExploreOutcomeColor("end", regionColors[party.region] || "#4CAF50"))
     .setDescription(
      `Expedition complete. You've returned safely to **${villageLabelEnd}**.` + testingResetNote
     )
     .setImage(getExploreMapImageUrl(party, { highlight: true }));

    embed.addFields(
     { name: "👥 **Party**", value: membersTextEnd, inline: true },
     { name: "📊 **Actions**", value: String(turnsOrActions), inline: true },
     { name: "⏱️ **Duration**", value: durationText, inline: true }
    );
    if (splitLinesEnd.length > 0) {
     embed.addFields({ name: "❤️ **Hearts & stamina split**", value: splitLinesEnd.join("\n"), inline: false });
    }
    if (itemsGathered > 0) {
     embed.addFields({ name: "🎒 **Items gathered**", value: `**${itemsGathered}** item${itemsGathered !== 1 ? "s" : ""}`, inline: false });
    }
    if (highlightsValue) {
     embed.addFields({ name: "✨ **Highlights**", value: highlightsValue, inline: false });
    }
    embed.addFields({ name: "🔗 **Full report**", value: `[Open expedition report](${reportUrl})`, inline: false });

    await interaction.editReply({ embeds: [embed] });

    // ------------------- Retreat (tier 5+ exploration raid only) -------------------
   } else if (subcommand === "retreat") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = normalizeCharacterName(interaction.options.getString("charactername"));
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition ID not found.")] });
    }

    const character = await findCharacterByNameAndUser(characterName, userId);
    if (!character) {
     return interaction.editReply({
      embeds: [createExplorationErrorEmbed("❌ **Character not found**", "Character not found or you do not own this character.")]
     });
    }

    const characterIndex = party.characters.findIndex((c) => c.name === characterName);
    if (characterIndex === -1) {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Not in expedition**", "Your character is not part of this expedition.", { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
    }

    if (party.status !== "started") {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not started**", "This expedition has not been started yet.", { party, expeditionId, location: party ? `${party.square} ${party.quadrant}` : undefined, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })] });
    }
    if ((party.totalHearts ?? 0) <= 0) {
     await handleExpeditionFailed(party, interaction);
     return;
    }
    const raid = await Raid.findOne({ expeditionId: { $regex: new RegExp(`^${party.partyId}$`, 'i') }, status: "active" });
    if (!raid) {
     return interaction.editReply({
      embeds: [createExplorationErrorEmbed("❌ **Cannot retreat**", `Your party is not in a tier 5+ monster battle. Use ${getExploreCommandId() ? `</explore retreat:${getExploreCommandId()}>` : "**/explore retreat**"} only during such a battle (when a tier 5+ encounter started a raid).`, { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })],
      ephemeral: true
     });
    }

    // Re-fetch raid immediately before turn check so we use latest persisted state (avoid stale currentTurn)
    const freshRaid = await Raid.findOne({ expeditionId: { $regex: new RegExp(`^${party.partyId}$`, 'i') }, status: "active" });
    const raidForTurn = freshRaid ?? raid;
    // Enforce turn order for retreat: use the raid's current turn (same as /raid "It's your turn"), not expedition party.currentTurn
    const raidCurrentTurnParticipant = raidForTurn.getCurrentTurnParticipant?.() ?? raidForTurn.participants?.[raidForTurn.currentTurn ?? 0];
    const isRaidTurnForRetreat = raidCurrentTurnParticipant && raidCurrentTurnParticipant.characterId && character._id && raidCurrentTurnParticipant.characterId.toString() === character._id.toString();
    if (!isRaidTurnForRetreat) {
     const nextCharacterName = raidCurrentTurnParticipant?.name ?? party.characters[party.currentTurn]?.name ?? "Unknown";
     const notYourTurnEmbed = new EmbedBuilder()
       .setTitle("⏳ Not Your Turn")
       .setColor(NOT_YOUR_TURN_COLOR)
       .setDescription(`It is not your turn to attempt retreat.\n\n**Next turn:** ${nextCharacterName}`)
       .setImage(NOT_YOUR_TURN_BORDER_URL);
     return interaction.editReply({ embeds: [notYourTurnEmbed] });
    }

    if (raid.grottoId) {
     return interaction.editReply({
      embeds: [createExplorationErrorEmbed("❌ **Cannot retreat**", "You cannot retreat from a Grotto Test of Power. Defeat the monster to continue your expedition.", { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })],
      ephemeral: true
     });
    }

    const retreatPayResult = await payStaminaOrStruggle(party, characterIndex, 1, { order: "currentFirst", action: "retreat" });
    if (!retreatPayResult.ok) {
     return interaction.editReply({
      embeds: [createExplorationErrorEmbed("❌ **Not enough stamina or hearts**", "Not enough stamina or hearts. A retreat attempt costs **1** (stamina or heart). The party has " + (party.totalStamina ?? 0) + " stamina and " + (party.totalHearts ?? 0) + " hearts. **Camp** to recover, or use hearts to **Struggle**.", { party, expeditionId, location: `${party.square} ${party.quadrant}`, nextCharacter: party?.characters?.[party?.currentTurn] ?? null, showNextAndCommands: true })],
     });
    }
    const retreatCostsForLog = buildCostsForLog(retreatPayResult);

    const failedAttempts = raid.failedRetreatAttempts ?? 0;
    const retreatChance = Math.min(RETREAT_BASE_CHANCE + failedAttempts * RETREAT_BONUS_PER_FAIL, RETREAT_CHANCE_CAP);
    const success = Math.random() < retreatChance;
    if (success) {
     await endExplorationRaidAsRetreat(raid, interaction.client);
     character.failedFleeAttempts = 0;
     if (!false) await character.save();
     // Log retreat attempt first, then raid_over outcome
     pushProgressLog(party, character.name, "retreat", "Party attempted to retreat and escaped.", undefined, retreatCostsForLog);
     pushProgressLog(party, "Raid", "raid_over", `The party escaped from ${raid.monster?.name || "the monster"}! Continue the expedition.`, undefined, undefined, new Date());
     await party.advanceTurn();
     const monsterName = raid.monster?.name || "the monster";
     const location = [party.square, party.quadrant].filter(Boolean).join(" ") || "Current location";
     const nextCharacter = party.characters[party.currentTurn] ?? null;
     const embed = new EmbedBuilder()
      .setTitle("🏃 **Retreat successful**")
      .setColor(getExploreOutcomeColor("raid_over", regionColors[party.region] || "#9C27B0"))
      .setDescription(`The party escaped from **${monsterName}**!`)
      .setImage("https://storage.googleapis.com/tinglebot/Borders/border_brown.png");
     addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location,
      nextCharacter,
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      actionCost: { staminaCost: retreatPayResult.staminaPaid ?? 0, heartsCost: retreatPayResult.heartsPaid ?? 0 },
     });
     await interaction.editReply({ embeds: [embed] });
     if (getExplorationNextTurnContent(nextCharacter)) await interaction.followUp({ content: getExplorationNextTurnContent(nextCharacter) }).catch(() => {});
     return;
    }

    raid.failedRetreatAttempts = (raid.failedRetreatAttempts ?? 0) + 1;
    await raid.save();

    character.failedFleeAttempts = (character.failedFleeAttempts ?? 0) + 1;
    if (!false) await character.save();

    pushProgressLog(party, character.name, "retreat_failed", "Party attempted to retreat but could not get away.", undefined, retreatCostsForLog);
    // Retreat attempt counts as a turn: advance raid turn so the next person is up (retreat or /raid)
    await cancelRaidTurnSkip(raid.raidId);
    await raid.advanceTurn();
    await scheduleRaidTurnSkip(raid.raidId);
    await party.save(); // Persist party so dashboard shows current hearts/stamina/progress

    const monsterName = raid.monster?.name || "the monster";
    const location = [party.square, party.quadrant].filter(Boolean).join(" ") || "Current location";
    const nextParticipant = raid.getCurrentTurnParticipant();
    const nextCharacter = nextParticipant ? { name: nextParticipant.name, userId: nextParticipant.userId } : null;
    const nextName = nextCharacter?.name ?? "Unknown";
    const cmdId = getExploreCommandId();
    const cmdRetreat = `</explore retreat:${cmdId}>`;
    const cmdItem = `</explore item:${cmdId}>`;
    const raidIdDisplay = raid.raidId || raid._id?.toString() || "—";
    const retreatFailedEmbed = new EmbedBuilder()
      .setTitle("🏃 **Retreat failed**")
      .setColor(getExploreOutcomeColor("retreat", regionColors[party.region] || "#FF9800"))
      .setDescription(
        `The party couldn't get away from **${monsterName}**!\n\n` +
        `**Try again:** ${cmdRetreat} with id \`${expeditionId}\` and your character — costs 1 stamina (or 1 heart if you're out of stamina).`
      )
      .setImage(getExploreMapImageUrl(party, { highlight: true }));
    addExplorationStandardFields(retreatFailedEmbed, {
      party,
      expeditionId,
      location,
      nextCharacter,
      showNextAndCommands: true,
      showRestSecureMove: false,
      actionCost: { staminaCost: retreatPayResult.staminaPaid ?? 0, heartsCost: retreatPayResult.heartsPaid ?? 0 },
    });
    retreatFailedEmbed.addFields({
      name: "📋 **__Commands__**",
      value:
        `**Next:** ${nextCharacter ? `<@${nextCharacter.userId}> (${nextName})` : nextName}\n\n` +
        `You're still in battle. You can only:\n\n` +
        `• **Retreat** — ${cmdRetreat}\n> Try again to escape. (Costs 1 stamina or 1 heart.) Use id: \`${expeditionId}\` and charactername: **${nextName}**\n\n` +
        `• **Item** — ${cmdItem}\n> Use a healing item from your expedition loadout. Restores hearts and/or stamina.\n\n` +
        `• **Keep fighting** — </raid:1470659276287774734> with Raid ID **${raidIdDisplay}**\n> Return to the battle.`,
      inline: false,
    });
    await interaction.editReply({ embeds: [retreatFailedEmbed] });
    if (getExplorationNextTurnContent(nextCharacter)) await interaction.followUp({ content: getExplorationNextTurnContent(nextCharacter) }).catch(() => {});
    return;
   // ------------------- Camp Command -------------------
   } else if (subcommand === "camp") {
    // /explore camp command: set up camp (costs stamina, party recovers). Distinct from roll outcome "safe space".
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = normalizeCharacterName(interaction.options.getString("charactername"));
    const userId = interaction.user.id;

    const party = await Party.findActiveByPartyId(expeditionId);
    if (!party) {
     return interaction.editReply({ embeds: [createExplorationErrorEmbed("❌ **Expedition not found**", "Expedition ID not found.")] });
    }
    // Keep pre-established secured/no-camp paths in sync with the map DB
    await enforcePreestablishedSecuredOnSquare(party.square);

    // Block camping if there's active combat for this expedition (must resolve first)
    const campCombatBlock = await getCombatBlockReply(party, expeditionId, "camp", `${party.square} ${party.quadrant}`);
    if (campCombatBlock) return interaction.editReply(campCombatBlock);
    if (party.status === "started" && (party.totalHearts ?? 0) <= 0) {
     await handleExpeditionFailed(party, interaction);
     return;
    }

    // Block camping while in a grotto trial — complete the trial or leave the grotto first
    const atActiveGrottoCamp = await hasActiveGrottoAtLocation(party, expeditionId);
    if (atActiveGrottoCamp) {
     const grotto = await resolveGrottoAtLocation(party.square, party.quadrant, expeditionId, null, true);
     const grottoCmd = grotto ? getActiveGrottoCommand(grotto.trialType) : `</explore grotto continue:${getExploreCommandId()}>`;
     const leaveCmdId = getExploreCommandId();
     const leaveCmd = leaveCmdId ? `</explore grotto leave:${leaveCmdId}>` : "`/explore grotto leave`";
     const grottoBlockEmbed = new EmbedBuilder()
      .setTitle("🚫 **No camping in a grotto**")
      .setColor(getExploreOutcomeColor("grotto_cleansed", regionColors[party.region] || "#9C27B0"))
      .setDescription(
       `You're inside a **grotto trial** at **${party.square} ${party.quadrant}**. You cannot camp here.\n\n` +
       `Use **${grottoCmd}** to take your turn in the trial, or **${leaveCmd}** to exit the grotto. Then you can move and camp in another quadrant.`
      )
      .setImage(getExploreMapImageUrl(party, { highlight: true }));
     addExplorationStandardFields(grottoBlockEmbed, {
      party,
      expeditionId: expeditionId || party.partyId,
      location: `${party.square} ${party.quadrant}`,
      nextCharacter: party.characters[party.currentTurn] ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      hasActiveGrotto: true,
      activeGrottoCommand: grottoCmd,
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party),
      compactGrottoCommands: true,
     });
     return interaction.editReply({ embeds: [grottoBlockEmbed] });
    }

    // No-camp check first: pre-established paths/villages and DB noCamp — block before character/turn/hazards
    const campMapSquare = await Square.findOne({ squareId: party.square });
    let campQuad = null;
    if (campMapSquare && campMapSquare.quadrants && campMapSquare.quadrants.length) {
     campQuad = campMapSquare.quadrants.find(
      (qu) => String(qu.quadrantId).toUpperCase() === String(party.quadrant || "").toUpperCase()
     );
    }
    if (isPreestablishedNoCamp(party.square, party.quadrant) || (campQuad && campQuad.noCamp)) {
     const locationNoCamp = `${party.square} ${party.quadrant}`;
     const noCampEmbed = new EmbedBuilder()
      .setTitle("🚫 **No camping here**")
      .setColor(getExploreOutcomeColor("secure", regionColors[party.region] || "#FF9800"))
      .setDescription(
       `**${locationNoCamp}** is a pre-established path or village. You can pass through safely, but you cannot camp here.\n\nUse **Move** to continue to another quadrant.`
      )
      .setImage(getExploreMapImageUrl(party, { highlight: true }));
     addExplorationStandardFields(noCampEmbed, {
      party,
      expeditionId: expeditionId || party.partyId,
      location: locationNoCamp,
      nextCharacter: party.characters[party.currentTurn] ?? null,
      showNextAndCommands: true,
      showRestSecureMove: true,
      hideCampCommand: true,
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
      hazardMessage: null,
     });
     return interaction.editReply({ embeds: [noCampEmbed] });
    }

    if (!SKIP_PIN_REQUIREMENT_FOR_TESTING) {
     const unpinnedCamp = await hasUnpinnedDiscoveriesInQuadrant(party);
     if (unpinnedCamp) {
      const blockEmbed = await createUnpinnedDiscoveriesBlockEmbed(party, expeditionId);
      return interaction.editReply({ embeds: [blockEmbed] });
     }
    }

    const character = await findCharacterByNameAndUser(characterName, userId);
    if (!character) {
     return interaction.editReply({
      embeds: [createExplorationErrorEmbed("❌ **Character not found**", "Character not found or you do not own this character.")]
     });
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
       .setColor(NOT_YOUR_TURN_COLOR)
       .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`)
       .setImage(NOT_YOUR_TURN_BORDER_URL);
     return interaction.editReply({ embeds: [notYourTurnEmbed] });
    }

    // Quadrant hazards (per-action trigger, party pool)
    const hazardCampResult = await maybeApplyQuadrantHazards(party, { trigger: "camp" });
    if (hazardCampResult.ko) {
     await handleExpeditionFailed(party, interaction);
     return;
    }

    // Sync quadrant state from map so stamina cost matches canonical explored/secured status
    if (campMapSquare && campMapSquare.quadrants && campMapSquare.quadrants.length && campQuad) {
     const effectiveCampStatus = getEffectiveQuadrantStatus(party.square, party.quadrant, campQuad.status);
     if (effectiveCampStatus === "explored" || effectiveCampStatus === "secured") {
      if (party.quadrantState !== effectiveCampStatus) {
       logger.info("EXPLORE", `[explore.js] Camp: synced quadrantState from map: ${party.quadrantState} → ${effectiveCampStatus}`);
       party.quadrantState = effectiveCampStatus;
       party.markModified("quadrantState");
      }
     }
    }

    const isSecured = party.quadrantState === "secured";
    // In a secured quadrant, only allow one camp per visit; they must move before camping here again.
    if (isSecured && party.lastCampedAtQuadrant &&
     String(party.lastCampedAtQuadrant.square || "").toUpperCase() === String(party.square || "").toUpperCase() &&
     String(party.lastCampedAtQuadrant.quadrant || "").toUpperCase() === String(party.quadrant || "").toUpperCase()) {
     const locationCampBlock = `${party.square} ${party.quadrant}`;
     const alreadyCampedEmbed = new EmbedBuilder()
      .setTitle("🏕️ **Already camped here**")
      .setColor(getExploreOutcomeColor("camp", regionColors[party.region] || "#4CAF50"))
      .setDescription(
       `You've already camped here! It's time to move on.\n\nUse **Move** to go to another quadrant—you can come back and camp here again later.`
      )
      .setImage(getExploreMapImageUrl(party, { highlight: true }));
     addExplorationStandardFields(alreadyCampedEmbed, {
      party,
      expeditionId: expeditionId || party.partyId,
      location: locationCampBlock,
      nextCharacter: party.characters[party.currentTurn] ?? null,
      showNextAndCommands: true,
      showRestSecureMove: true,
      hazardMessage: hazardCampResult?.hazardMessage ?? null,
      hideCampCommand: true,
      hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant),
     });
     return interaction.editReply({ embeds: [alreadyCampedEmbed] });
    }
    // Camp cost: unexplored = 2, explored = 1, secured = 0.
    const baseCampCost = party.quadrantState === "secured" ? 0 : party.quadrantState === "explored" ? 1 : 2;
    
    // At 0 stamina, camping still costs the normal amount but paid via hearts (struggle mechanic)
    const stuckInWild = (party.totalStamina ?? 0) === 0 && baseCampCost > 0;
    
    // Recovery: up to 25% hearts unsecured/50% secured; stamina reduced to 15% unsecured/35% secured
    const heartsPct = isSecured ? 0.5 : 0.25;
    const staminaPct = isSecured ? 0.35 : 0.15;
    const staminaCost = baseCampCost;

    // Calculate danger level based on distance from start
    const campDangerLevel = calculateDangerLevel(party);

    // Chance of monster attack when camping: explored/unexplored 25%, secured 5%. When no stamina or stuck in wild (camp costs 0), higher chance but capped at 50%.
    // Danger bonus adds to the camp attack chance (further from home = more dangerous camps)
    let campAttackChance = isSecured ? CAMP_ATTACK_CHANCE_SECURED : CAMP_ATTACK_CHANCE_UNSECURED;
    // Add danger bonus to camp attack chance (at max distance, adds up to 25% more chance)
    campAttackChance += campDangerLevel.dangerBonus;
    if (stuckInWild || (!isSecured && (party.totalStamina === 0 || (typeof party.totalStamina === "number" && party.totalStamina < 1)))) {
     campAttackChance = Math.min(CAMP_ATTACK_CHANCE_ZERO_STAMINA_CAP, campAttackChance + CAMP_ATTACK_BONUS_WHEN_ZERO_STAMINA);
    }
    // Protection: if party is at 0 stamina and has been attacked at camp recently, guarantee safe camp to prevent easy KO
    const recentCampAttacks = countRecentCampAttacks(party);
    if (stuckInWild && recentCampAttacks >= CAMP_ATTACK_PROTECTION_THRESHOLD) {
     campAttackChance = 0;
     logger.info("EXPLORE", `[explore.js] Camp protection: party at 0 stamina with ${recentCampAttacks} recent camp attack(s), guaranteeing safe camp`);
    }

    // Log camp attack chance calculation for debugging
    const baseChanceForLog = isSecured ? CAMP_ATTACK_CHANCE_SECURED : CAMP_ATTACK_CHANCE_UNSECURED;
    logger.info("EXPLORE", `[explore.js] id=${party.partyId} camp chance: base=${(baseChanceForLog * 100).toFixed(0)}% +danger=${(campDangerLevel.dangerBonus * 100).toFixed(0)}% (dist=${campDangerLevel.distance}) stuckInWild=${stuckInWild} final=${(campAttackChance * 100).toFixed(0)}% recentAttacks=${recentCampAttacks}`);

    const campRoll = Math.random();
    const canBeAttackedAtCamp = !(character.blighted && character.blightStage >= 3) && campRoll < campAttackChance;
    logger.info("EXPLORE", `[explore.js] id=${party.partyId} camp roll: ${(campRoll * 100).toFixed(1)}% < ${(campAttackChance * 100).toFixed(0)}% = ${canBeAttackedAtCamp ? "ATTACKED" : "safe"}`);
    if (canBeAttackedAtCamp) {
     const loc = `${party.square} ${party.quadrant}`;
     // Pay camp cost before monster attack (uses struggle mechanic if stamina is insufficient)
     let campAttackPayResult = null;
     if (staminaCost > 0) {
      campAttackPayResult = await payStaminaOrStruggle(party, party.currentTurn, staminaCost, { action: "camp" });
      if (!campAttackPayResult.ok) {
       return interaction.editReply(
        `Not enough stamina or hearts to camp. Camp costs **${staminaCost}** (stamina or hearts). The party has ${party.totalStamina ?? 0} stamina and ${party.totalHearts ?? 0} hearts.`
       );
      }
      // Check if party KO'd from paying camp cost
      if ((party.totalHearts ?? 0) <= 0 && (campAttackPayResult.heartsPaid ?? 0) > 0) {
       const struggleEmbed = new EmbedBuilder()
        .setTitle(`🏕️ **Camp attempt failed!**`)
        .setColor(0x8b0000)
        .setDescription(`**${character.name}** tried to set up camp, costing **${campAttackPayResult.heartsPaid} heart(s)** (struggle). The party had no hearts left to spare.\n\n💀 **Party KO'd**`)
        .setImage(getExploreMapImageUrl(party, { highlight: true }));
       await interaction.editReply({ embeds: [struggleEmbed] });
       pushProgressLog(party, character.name, "ko", `Party KO'd after paying ${campAttackPayResult.heartsPaid} heart(s) to camp (struggle mode).`, undefined, { heartsLost: campAttackPayResult.heartsPaid });
       await party.save();
       await handleExpeditionFailed(party, interaction, true);
       return;
      }
     }
     const campAttackStruggleHearts = campAttackPayResult?.heartsPaid ?? 0;
     const monsters = await getMonstersByRegion(party.region?.toLowerCase() || "");
     if (monsters && monsters.length > 0) {
      const quadrantMetaForCampMonster = await getQuadrantMeta(party.square, party.quadrant);
      const quadrantCampMonsterBiasSet = new Set([
        ...(quadrantMetaForCampMonster.monsters || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean),
        ...(quadrantMetaForCampMonster.bossMonsters || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean)
      ]);
      const monstersBiased = applyQuadrantMonsterBias(monsters, quadrantCampMonsterBiasSet);
      const selectedMonster = getExplorationMonsterFromList(monstersBiased, campDangerLevel.dangerBonus);
      logger.info("EXPLORE", `[explore.js] Camp attack: monster=${selectedMonster.name} tier=${selectedMonster.tier} dist=${campDangerLevel.distance} bonus=${(campDangerLevel.dangerBonus * 100).toFixed(0)}%`);
      if (selectedMonster.tier > 4 && !DISABLE_EXPLORATION_RAIDS) {
       try {
        // Save party before triggerRaid so the raid module sees updated totalHearts/totalStamina (after struggle cost)
        await party.save();
        const village = REGION_TO_VILLAGE[party.region?.toLowerCase()] || "Inariko";
        const raidResult = await triggerRaid(selectedMonster, interaction, village, false, character, false, expeditionId);
        if (raidResult && raidResult.success) {
         const raidCampMsg = campAttackStruggleHearts > 0
           ? `Camp at ${loc} was interrupted by a **${selectedMonster.name}**! Raid started. Lost ${campAttackStruggleHearts} heart(s) (struggle).`
           : `Camp at ${loc} was interrupted by a **${selectedMonster.name}**! Raid started.`;
         pushProgressLog(party, character.name, "camp", raidCampMsg, undefined, campAttackStruggleHearts > 0 ? { heartsLost: campAttackStruggleHearts } : undefined, new Date());
         await party.save();
         const battleId = raidResult.raidId;
         const raidData = raidResult.raidData || {};
         const monsterHearts = raidData.monster ? { current: raidData.monster.currentHearts, max: raidData.monster.maxHearts } : { current: selectedMonster.hearts, max: selectedMonster.hearts };
         const raidForNext = await Raid.findOne({ raidId: battleId });
         const firstInRaid = raidForNext?.participants?.length ? (raidForNext.participants[raidForNext.currentTurn ?? 0] || raidForNext.participants[0]) : null;
         const nextForEmbed = firstInRaid ? { userId: firstInRaid.userId, name: firstInRaid.name } : character;
         const campRaidActionCost = { staminaCost: campAttackPayResult?.staminaPaid ?? 0, heartsCost: campAttackStruggleHearts };
         const campMonsterFlavor = getExplorationFlavorText(quadrantMetaForCampMonster, "monster", { monster: selectedMonster });
         const embed = createExplorationMonsterEmbed(party, character, selectedMonster, expeditionId, loc, party.totalHearts, party.totalStamina, nextForEmbed, true, 0, await hasDiscoveriesInQuadrant(party.square, party.quadrant), await hasUnpinnedDiscoveriesInQuadrant(party), campRaidActionCost, poolCaps.maxHearts, poolCaps.maxStamina, campMonsterFlavor || undefined);
         embed.setTitle(`🏕️ **Camp interrupted!** — ${selectedMonster.name}`);
         const campRaidDesc = `**${character.name}** set up camp in **${loc}**, but a **${selectedMonster.name}** attacked! No rest — fight with </raid:1470659276287774734>.${campAttackStruggleHearts > 0 ? ` **−${campAttackStruggleHearts} ❤ (struggle)** for camping.` : ""}`;
         embed.setDescription((campMonsterFlavor || "") + campRaidDesc);
         embed.addFields(
          { name: "💙 __Monster Hearts__", value: `${monsterHearts.current}/${monsterHearts.max}`, inline: true },
          { name: "🆔 **__Raid ID__**", value: battleId, inline: true },
          { name: "⚔️ __Raid__", value: "Raid in progress...", inline: false }
         );
         addExplorationCommandsField(embed, { party, expeditionId, location: loc, nextCharacter: nextForEmbed, showNextAndCommands: true, showRestSecureMove: false, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party) });
         await interaction.editReply({ embeds: [embed] });
         await interaction.followUp({ content: getExplorationNextTurnContent(nextForEmbed) });
         return;
        }
       } catch (raidErr) {
        logger.warn("EXPLORE", `[explore.js]⚠️ Camp attack raid failed: ${raidErr?.message || raidErr}`);
       }
      }
      // Tier 1–4 or raid disabled: resolve encounter inline (no rest)
      const diceRoll = Math.floor(Math.random() * 100) + 1;
      const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character, diceRoll);
      logger.info("EXPLORE", `[explore.js] Camp-attack encounter: ${character.name} vs ${selectedMonster.name} tier=${selectedMonster.tier} | diceRoll=${diceRoll} adjustedRandomValue=${adjustedRandomValue} defenseSuccess=${defenseSuccess} skipPersist=${!!usePartyOnlyForHeartsStamina(party)}`);
      const outcome = await getEncounterOutcome(character, selectedMonster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, usePartyOnlyForHeartsStamina(party) ? { skipPersist: true } : {});
      logger.info("EXPLORE", `[explore.js] Camp-attack outcome: result=${outcome.result} hearts=${outcome.hearts ?? 0}`);
      if (outcome.hearts > 0) {
       party.totalHearts = Math.max(0, (party.totalHearts ?? 0) - outcome.hearts);
       party.markModified("totalHearts");
       logger.info("EXPLORE", `[explore.js] Camp-attack applying damage: pool -${outcome.hearts} hearts`);
      }
      const campPartyKOd = party.totalHearts <= 0;
      let lootedItem = null;
      if (outcome.canLoot) {
       const items = await fetchItemsByMonster(selectedMonster.name);
       const rawItem = items.length > 0 ? items[Math.floor(Math.random() * items.length)] : null;
       lootedItem = await resolveExplorationMonsterLoot(selectedMonster.name, rawItem);
      }
      const totalHeartsLost = campAttackStruggleHearts + (outcome.hearts || 0);
      let campAttackMsg = `Camp at ${loc} interrupted by **${selectedMonster.name}**! ${outcome.result}.`;
      if (totalHeartsLost > 0) {
       if (campAttackStruggleHearts > 0 && outcome.hearts > 0) campAttackMsg += ` Lost ${campAttackStruggleHearts} heart(s) (struggle) plus ${outcome.hearts} heart(s) from the monster.`;
       else if (campAttackStruggleHearts > 0) campAttackMsg += ` Lost ${campAttackStruggleHearts} heart(s) (struggle).`;
       else campAttackMsg += ` Lost ${outcome.hearts} heart(s).`;
      }
      if (outcome.canLoot) campAttackMsg += " Got loot.";
      const campAttackCosts = totalHeartsLost > 0 ? { heartsLost: totalHeartsLost } : undefined;
      pushProgressLog(party, character.name, "camp", campAttackMsg, lootedItem ? { itemName: lootedItem.itemName, emoji: lootedItem.emoji || "" } : undefined, campAttackCosts);
      if (lootedItem && !false) {
       try {
        await addItemInventoryDatabase(character._id, lootedItem.itemName, lootedItem.quantity ?? 1, interaction, "Exploration Loot");
       } catch (e) {}
      }
      if (lootedItem) {
       if (!party.gatheredItems) party.gatheredItems = [];
       party.gatheredItems.push({ characterId: character._id, characterName: character.name, itemName: lootedItem.itemName, quantity: lootedItem.quantity ?? 1, emoji: lootedItem.emoji ?? "" });
       party.markModified("gatheredItems");
      }
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save();
      const nextChar = party.characters[party.currentTurn];
      const campInterruptActionCost = { staminaCost: campAttackPayResult?.staminaPaid ?? 0, heartsCost: campAttackStruggleHearts };
      const campMonsterFlavorTier = getExplorationFlavorText(quadrantMetaForCampMonster, "monster", { monster: selectedMonster });
      const embed = createExplorationMonsterEmbed(party, character, selectedMonster, expeditionId, loc, party.totalHearts, party.totalStamina, nextChar ?? null, true, 0, await hasDiscoveriesInQuadrant(party.square, party.quadrant), await hasUnpinnedDiscoveriesInQuadrant(party), campInterruptActionCost, 0, 0, campMonsterFlavorTier || undefined);
      embed.setTitle(`🏕️ **Camp interrupted!** — ${selectedMonster.name}`);
      const campInterruptDesc = `**${character.name}** set up camp in **${loc}**, but a **${selectedMonster.name}** attacked! No rest.${campAttackStruggleHearts > 0 ? ` **−${campAttackStruggleHearts} ❤ (struggle)** for camping.` : ""}\n\n${outcome.result || "Battle resolved."}`;
      embed.setDescription((campMonsterFlavorTier || "") + campInterruptDesc);
      const hasEquippedWeapon = !!(character?.gearWeapon?.name);
      const hasEquippedArmor = !!(character?.gearArmor?.head?.name || character?.gearArmor?.chest?.name || character?.gearArmor?.legs?.name);
      const battleOutcomeDisplay = outcome.hearts > 0 ? generateDamageMessage(outcome.hearts) : (outcome.defenseSuccess ? generateDefenseBuffMessage(outcome.defenseSuccess, outcome.adjustedRandomValue, outcome.damageValue, hasEquippedArmor) : (outcome.attackSuccess ? generateAttackBuffMessage(outcome.attackSuccess, outcome.adjustedRandomValue, outcome.damageValue, hasEquippedWeapon) : generateVictoryMessage(outcome.adjustedRandomValue, outcome.defenseSuccess, outcome.attackSuccess)));
      embed.addFields({ name: "⚔️ __Battle Outcome__", value: battleOutcomeDisplay, inline: false });
      if (outcome.canLoot && lootedItem) embed.addFields({ name: "🎉 __Loot__", value: `${lootedItem.emoji || ""} **${lootedItem.itemName}**${(lootedItem.quantity ?? 1) > 1 ? ` x${lootedItem.quantity}` : ""}`, inline: false });
      // If party is KO'd, don't show commands
      if (!campPartyKOd) {
       addExplorationCommandsField(embed, { party, expeditionId, location: loc, nextCharacter: nextChar ?? null, showNextAndCommands: true, showRestSecureMove: false, hasDiscoveriesInQuadrant: await hasDiscoveriesInQuadrant(party.square, party.quadrant), hasUnpinnedDiscoveriesInQuadrant: await hasUnpinnedDiscoveriesInQuadrant(party) });
      } else {
       embed.addFields({ name: "💀 **__Party KO'd__**", value: `The party lost all hearts. The expedition has failed.`, inline: false });
      }
      await interaction.editReply({ embeds: [embed] });
      // If party KO'd, show the failure embed as a follow-up
      if (campPartyKOd) {
       await handleExpeditionFailed(party, interaction, true);
       return;
      }
      if (getExplorationNextTurnContent(nextChar)) await interaction.followUp({ content: getExplorationNextTurnContent(nextChar) });
      return;
     }
    }

    // Only charge stamina when camp succeeds (no interrupt). If camp was interrupted by a monster we returned above — never charge for a failed attempt.
    // Use payStaminaOrStruggle so if stamina < cost, the difference is paid with hearts (normal struggle)
    let campPayResult = null;
    if (!canBeAttackedAtCamp && staminaCost > 0) {
     campPayResult = await payStaminaOrStruggle(party, party.currentTurn, staminaCost, { action: "camp" });
     if (!campPayResult.ok) {
      return interaction.editReply(
       `Not enough stamina or hearts to camp. Camp costs **${staminaCost}** (stamina or hearts). The party has ${party.totalStamina ?? 0} stamina and ${party.totalHearts ?? 0} hearts.`
      );
     }
     // Check if party is KO'd after paying camp cost (hearts dropped to 0 via struggle)
     if ((party.totalHearts ?? 0) <= 0 && (campPayResult.heartsPaid ?? 0) > 0) {
      pushProgressLog(party, character.name, "ko", `Party KO'd after paying ${campPayResult.heartsPaid} heart(s) to camp (struggle mode).`, undefined, { heartsLost: campPayResult.heartsPaid });
      await party.save();
      await handleExpeditionFailed(party, interaction);
      return;
     }
    }

    // Pool-only: recovery is random, up to heartsPct/staminaPct of max (25% unsecured, 50% secured)
    // If hearts were paid to camp (struggle), skip heart recovery - only stamina is recovered
    const paidHeartsToStruggle = (campPayResult?.heartsPaid ?? 0) > 0;
    let totalHeartsRecovered = 0;
    let sumMaxHearts = 0;
    let sumMaxStamina = 0;
    for (let i = 0; i < party.characters.length; i++) {
     const char = await Character.findById(party.characters[i]._id);
     if (!char) continue;
     const maxHrt = char.maxHearts ?? 0;
     const maxStam = char.maxStamina ?? 0;
     sumMaxHearts += maxHrt;
     sumMaxStamina += maxStam;
     // Backfill per-character max values if missing
     if (!party.characters[i].maxHearts || party.characters[i].maxHearts === 0) {
      party.characters[i].maxHearts = maxHrt;
     }
     if (!party.characters[i].maxStamina || party.characters[i].maxStamina === 0) {
      party.characters[i].maxStamina = maxStam;
     }
     // Skip heart recovery if struggle was used (paid hearts to camp)
     if (!paidHeartsToStruggle) {
      const heartsCap = Math.floor(maxHrt * heartsPct);
      const heartsRecovered = heartsCap > 0 ? Math.floor(Math.random() * (heartsCap + 1)) : 0;
      totalHeartsRecovered += heartsRecovered;
     }
    }
    // Backfill party-level max values if missing
    if (!party.maxHearts || party.maxHearts === 0) {
     party.maxHearts = sumMaxHearts;
     party.markModified("maxHearts");
    }
    if (!party.maxStamina || party.maxStamina === 0) {
     party.maxStamina = sumMaxStamina;
     party.markModified("maxStamina");
    }
    party.markModified("characters");
    if (!paidHeartsToStruggle && totalHeartsRecovered < 1 && (party.totalHearts ?? 0) < sumMaxHearts) totalHeartsRecovered = 1;

    const quadrantMetaForCampFlavor = await getQuadrantMeta(party.square, party.quadrant);
    const campInHotSpring = (quadrantMetaForCampFlavor.special || []).some((s) => String(s || "").toLowerCase() === "hot spring");
    let hotSpringCampExtraHearts = 0;
    if (campInHotSpring && !paidHeartsToStruggle) {
     const projectedHearts = Math.min(sumMaxHearts, (party.totalHearts ?? 0) + totalHeartsRecovered);
     const missingAfterCamp = sumMaxHearts - projectedHearts;
     if (missingAfterCamp > 0 && Math.random() < HOT_SPRING_CAMP_EXTRA_BONUS_CHANCE) {
      const rawCapExtra = Math.floor(sumMaxHearts * HOT_SPRING_HEAL_FRACTION);
      const healCapExtra = Math.max(rawCapExtra, 1);
      hotSpringCampExtraHearts = Math.min(missingAfterCamp, healCapExtra);
      totalHeartsRecovered += hotSpringCampExtraHearts;
     }
    }

    // Stamina: random up to staminaPct of party max (25% unsecured, 50% secured).
    const poolStam = party.totalStamina ?? 0;
    const staminaRoom = Math.max(0, sumMaxStamina - poolStam);
    const staminaCap = Math.floor(sumMaxStamina * staminaPct);
    const staminaMaxRecover = Math.min(staminaRoom, staminaCap);
    let totalStaminaRecovered = staminaMaxRecover > 0 ? (1 + Math.floor(Math.random() * staminaMaxRecover)) : 0;
    let hotSpringCampExtraStamina = 0;
    if (campInHotSpring) {
     const projectedStam = Math.min(sumMaxStamina, poolStam + totalStaminaRecovered);
     const missingStamAfterCamp = sumMaxStamina - projectedStam;
     if (missingStamAfterCamp > 0 && Math.random() < HOT_SPRING_CAMP_EXTRA_BONUS_CHANCE) {
      const rawCapStam = Math.floor(sumMaxStamina * HOT_SPRING_HEAL_FRACTION);
      const stamHealCap = Math.max(rawCapStam, 1);
      hotSpringCampExtraStamina = Math.min(missingStamAfterCamp, stamHealCap);
      totalStaminaRecovered += hotSpringCampExtraStamina;
     }
    }
    party.totalHearts = Math.min(sumMaxHearts, Math.max(0, (party.totalHearts ?? 0) + totalHeartsRecovered));
    party.totalStamina = Math.min(sumMaxStamina, Math.max(0, (party.totalStamina ?? 0) + totalStaminaRecovered));
    party.markModified("totalHearts");
    party.markModified("totalStamina");
    if (totalStaminaRecovered > 0 || staminaCost > 0) {
     logger.info("EXPLORE", `[explore.js] id=${party.partyId ?? "?"} camp ${character?.name ?? "?"} 🟩${poolStam} cost=${staminaCost} +${totalStaminaRecovered} → 🟩${party.totalStamina ?? 0}`);
    }

    const locationCamp = `${party.square} ${party.quadrant}`;
    const struggleHeartsPaid = campPayResult?.heartsPaid ?? 0;
    const costsForLog = {
     ...(campPayResult?.staminaPaid > 0 && { staminaLost: campPayResult.staminaPaid }),
     ...(struggleHeartsPaid > 0 && { heartsLost: struggleHeartsPaid }),
     ...(totalHeartsRecovered > 0 && { heartsRecovered: totalHeartsRecovered }),
     ...(totalStaminaRecovered > 0 && { staminaRecovered: totalStaminaRecovered }),
    };
    const campCostDisplay = struggleHeartsPaid > 0 
     ? ` (-${struggleHeartsPaid} ❤ struggle${campPayResult?.staminaPaid > 0 ? `, -${campPayResult.staminaPaid} stamina` : ""})` 
     : (campPayResult?.staminaPaid > 0 ? ` (-${campPayResult.staminaPaid} stamina)` : "");
    const campLogStamina = campCostDisplay + (totalStaminaRecovered > 0 ? ` (+${totalStaminaRecovered} stamina)` : "");
    const hotSpringCampNote =
     hotSpringCampExtraHearts > 0 || hotSpringCampExtraStamina > 0
      ? ` Hot springs:${hotSpringCampExtraHearts > 0 ? ` +${hotSpringCampExtraHearts} ❤ extra` : ""}${hotSpringCampExtraHearts > 0 && hotSpringCampExtraStamina > 0 ? ";" : ""}${hotSpringCampExtraStamina > 0 ? ` +${hotSpringCampExtraStamina} stamina extra` : ""}.`
      : "";
    const campLogMessage = paidHeartsToStruggle
     ? `Camped at ${locationCamp}. Party recovered stamina only (no hearts due to struggle).${campLogStamina}`
     : `Camped at ${locationCamp}. Party recovered hearts.${hotSpringCampNote}${campLogStamina}`;
    pushProgressLog(
     party,
     character.name,
     "camp",
     campLogMessage,
     undefined,
     costsForLog
    );

    if (isSecured) {
     party.lastCampedAtQuadrant = { square: party.square, quadrant: party.quadrant };
     party.markModified("lastCampedAtQuadrant");
    }
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save(); // Always persist so dashboard shows current hearts/stamina/progress

    const nextCharacterCamp = party.characters[party.currentTurn];
    const recoveryParts = [
     ...(totalHeartsRecovered > 0 ? [`+${totalHeartsRecovered} ❤️`] : []),
     ...(totalStaminaRecovered > 0 ? [`+${totalStaminaRecovered} 🟩`] : [])
    ];
    const recoveryValue = recoveryParts.length > 0 ? `Party: ${recoveryParts.join(" ")}` : (paidHeartsToStruggle ? "Stamina only (no ❤️ recovery due to struggle)" : "");
    const campFlavor = getRandomCampFlavor(quadrantMetaForCampFlavor);
    const quadrantStateLabel = isSecured ? "secured" : (party.quadrantState === "explored" ? "explored" : "unexplored");
    const costNote = struggleHeartsPaid > 0
     ? ` (-${struggleHeartsPaid}❤ struggle${campPayResult?.staminaPaid > 0 ? `, -${campPayResult.staminaPaid}🟩` : ""} in ${quadrantStateLabel} quadrant)`
     : (staminaCost > 0 ? ` (-${staminaCost}🟩 in ${quadrantStateLabel} quadrant)` : " (0🟩 in secured quadrant)");
    const campTitle = `🗺️ **Expedition: Camp at ${locationCamp}**`;
    const embed = new EmbedBuilder()
     .setTitle(campTitle)
     .setColor(getExploreOutcomeColor("camp", regionColors[party.region] || "#4CAF50"))
     .setDescription(
      `${character.name} set up camp.${costNote}${
       hotSpringCampExtraHearts > 0 || hotSpringCampExtraStamina > 0
        ? `\n\n♨️ **Hot springs** —${
            hotSpringCampExtraHearts > 0 ? ` +**${hotSpringCampExtraHearts}** ❤` : ""
           }${
            hotSpringCampExtraHearts > 0 && hotSpringCampExtraStamina > 0 ? " ·" : ""
           }${
            hotSpringCampExtraStamina > 0 ? ` +**${hotSpringCampExtraStamina}** 🟩` : ""
           } extra recovery.`
        : ""
      }\n\n\`\`\`\n${campFlavor}\n\`\`\``
     )
     .setImage(getExploreMapImageUrl(party, { highlight: true }));
    const hasDiscCamp = await hasDiscoveriesInQuadrant(party.square, party.quadrant);
    const campIsAtStart = (() => {
      const start = START_POINTS_BY_REGION[party.region];
      return start && String(party.square || "").toUpperCase() === String(start.square || "").toUpperCase() && String(party.quadrant || "").toUpperCase() === String(start.quadrant || "").toUpperCase();
    })();
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationCamp,
      nextCharacter: nextCharacterCamp ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
      showSecuredQuadrantOnly: isSecured,
      commandsLast: true,
      hasDiscoveriesInQuadrant: hasDiscCamp,
      isAtStartQuadrant: campIsAtStart,
      actionCost: campPayResult ? { staminaCost: campPayResult.staminaPaid ?? 0, heartsCost: campPayResult.heartsPaid ?? 0 } : (staminaCost > 0 ? { staminaCost: staminaCost, heartsCost: 0 } : null),
      hazardMessage: hazardCampResult?.hazardMessage ?? null,
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
      showSecuredQuadrantOnly: isSecured,
      hasDiscoveriesInQuadrant: hasDiscCamp,
      isAtStartQuadrant: campIsAtStart,
    });

    await interaction.editReply({ embeds: [embed] });
    await interaction.followUp({ content: getExplorationNextTurnContent(nextCharacterCamp) });
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

 buildTestingEndAfterGrottoEmbed,
};
