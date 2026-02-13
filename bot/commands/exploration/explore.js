const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { SlashCommandBuilder } = require("@discordjs/builders");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { fetchAllItems, fetchItemsByMonster, createRelic } = require('@/database/db.js');
const {
 calculateFinalValue,
 getMonstersByRegion,
} = require("../../modules/rngModule.js");
const { getEncounterOutcome } = require("../../modules/encounterModule.js");
const {
 generateVictoryMessage,
 generateDamageMessage,
 generateDefenseBuffMessage,
 generateAttackBuffMessage,
 generateFinalOutcomeMessage,
} = require("../../modules/flavorTextModule.js");
const { handleKO, healKoCharacter } = require("../../modules/characterStatsModule.js");
const { triggerRaid } = require("../../modules/raidModule.js");
const { addItemInventoryDatabase } = require('@/utils/inventoryUtils.js');
const { addOldMapToCharacter, hasOldMap } = require('@/utils/oldMapUtils.js');
const { checkInventorySync } = require('@/utils/characterUtils.js');
const { enforceJail } = require('@/utils/jailCheck');
const Party = require('@/models/PartyModel.js');
const Character = require('@/models/CharacterModel.js');
const ItemModel = require('@/models/ItemModel.js');
const Square = require('@/models/mapModel.js');
const MapModule = require('@/modules/mapModule.js');
const {
 addExplorationStandardFields,
 addExplorationCommandsField,
 createExplorationItemEmbed,
 createExplorationMonsterEmbed,
 regionColors,
 regionImages,
 EXPLORE_CMD_ID,
} = require("../../embeds/embeds.js");

const EXPLORATION_IMAGE_FALLBACK = "https://via.placeholder.com/100x100";
const { handleAutocomplete } = require("../../handlers/autocompleteHandler.js");
const { getRandomOldMap, OLD_MAPS_LINK } = require("../../data/oldMaps.js");

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
const DISABLE_EXPLORATION_RAIDS = true;

const EXPLORATION_CHEST_RELIC_CHANCE = 0.08;

// Autocomplete can show "E402960 | Lanayru | started | H8 Q2"; value sent may be that full string. Use only the partyId (before first "|").
function normalizeExpeditionId(value) {
 if (!value || typeof value !== "string") return value;
 const trimmed = value.trim();
 const pipe = trimmed.indexOf("|");
 return pipe === -1 ? trimmed : trimmed.slice(0, pipe).trim();
}

async function handleExplorationChestOpen(interaction, expeditionId, location) {
 const party = await Party.findOne({ partyId: expeditionId });
 if (!party) return null;
 if (party.totalStamina < 1) return { notEnoughStamina: true };

 // Deduct from the character who just acted (found the chest) - currentTurn was already advanced
 const characterIndex = (party.currentTurn - 1 + party.characters.length) % party.characters.length;
 const partyChar = party.characters[characterIndex];
 const character = await Character.findById(partyChar._id);
 if (!character) return null;

 const staminaCost = 1;
 character.currentStamina = Math.max(0, (character.currentStamina ?? 0) - staminaCost);
 await character.save();
 party.characters[characterIndex].currentStamina = character.currentStamina;
 party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
 party.currentTurn = (party.currentTurn + 1) % party.characters.length;
 await party.save();

 const allItems = await fetchAllItems();
 const lootLines = [];
 for (const pc of party.characters) {
  const char = await Character.findById(pc._id);
  if (!char) continue;
  const isRelic = Math.random() < EXPLORATION_CHEST_RELIC_CHANCE;
  if (isRelic) {
   try {
    await createRelic({
     name: "Unknown Relic",
     discoveredBy: char.name,
     discoveredDate: new Date(),
     locationFound: location,
     appraised: false,
    });
    lootLines.push(`${char.name}: 🔸 Unknown Relic`);
   } catch (err) {
    console.error("[explore.js] createRelic error:", err?.message || err);
    if (allItems && allItems.length > 0) {
     const fallback = allItems[Math.floor(Math.random() * allItems.length)];
     try {
      await addItemInventoryDatabase(char._id, fallback.itemName, 1, interaction, "Exploration Chest");
      lootLines.push(`${char.name}: ${fallback.emoji || "📦"} ${fallback.itemName}`);
     } catch (_) {}
    }
   }
  } else {
   if (!allItems || allItems.length === 0) {
    lootLines.push(`${char.name}: (no items available)`);
    continue;
   }
   const item = allItems[Math.floor(Math.random() * allItems.length)];
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
 const lootValue = lootLines.length > 0 ? lootLines.join("\n") : "Nothing found.";
 const resultEmbed = new EmbedBuilder()
  .setTitle("🗺️ **Expedition: Chest opened!**")
  .setDescription(
   `Chest opened! Here is what was found!\n\n${lootValue}\n\n(-1 stamina)\n\n↳ **Continue** ➾ Use </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`
  )
  .setColor(regionColors[party.region] || "#00ff99")
  .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
 addExplorationStandardFields(resultEmbed, {
  party,
  expeditionId,
  location,
  nextCharacter: nextCharacter ?? null,
  showNextAndCommands: true,
  showRestSecureMove: false,
 });
 pushProgressLog(party, character.name, "chest_open", `Opened chest in ${location}; loot: ${lootLines.join("; ")}.`, undefined, { staminaLost: staminaCost });
 return { embed: resultEmbed, party, nextCharacter };
}

/** Outcomes that count toward the per-square special-event limit (reportable on map). */
const SPECIAL_OUTCOMES = ["monster_camp", "ruins", "grotto"];
const MAX_SPECIAL_EVENTS_PER_SQUARE = 3;

/** Parse square from progress message like "Found X in H8 Q2; ..." -> "H8". */
const LOC_IN_MESSAGE_RE = /\s+in\s+([A-J](?:[1-9]|1[0-2]))\s+Q[1-4]/i;

function countSpecialEventsInSquare(party, square) {
 if (!party.progressLog || !Array.isArray(party.progressLog)) return 0;
 const sq = String(square || "").trim().toUpperCase();
 if (!sq) return 0;
 let count = 0;
 for (const e of party.progressLog) {
  if (!SPECIAL_OUTCOMES.includes(e.outcome)) continue;
  const m = LOC_IN_MESSAGE_RE.exec(e.message || "");
  if (m && m[1] && String(m[1]).trim().toUpperCase() === sq) count += 1;
 }
 return count;
}

function pushProgressLog(party, characterName, outcome, message, loot, costs) {
 if (!party.progressLog) party.progressLog = [];
 const entry = {
  at: new Date(),
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

async function handleExpeditionFailed(party, interaction) {
 const start = START_POINTS_BY_REGION[party.region];
 if (!start) {
  await interaction.editReply("Expedition failed but could not resolve start location for region.");
  return;
 }

 for (const partyChar of party.characters) {
  const char = await Character.findById(partyChar._id);
  if (char) {
   await handleKO(char._id);
   char.currentStamina = 0;
   await char.save();
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

 const regionLabel = (party.region || "").charAt(0).toUpperCase() + (party.region || "").slice(1);
 const locationStr = `${start.square} ${start.quadrant} (${regionLabel} start)`;
 const embed = new EmbedBuilder()
  .setTitle("💀 **Expedition: Expedition Failed — Party KO'd**")
  .setColor(0x8b0000)
  .setDescription(
   "The party lost all hearts. The expedition has failed.\n\n" +
   "**Return:** Party is returned to the starting area for the region.\n" +
   "**Items:** All items brought on the expedition and any found during the expedition are lost.\n" +
   "**Party:** All members are KO'd with 0 stamina."
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
    .setName("rest")
    .setDescription("Rest at current location (3 stamina) — heals all party hearts, revives KO'd")
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
    .setName("retreat")
    .setDescription("Return to starting village")
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
  ),

 // ------------------- Command Execution Logic -------------------
 async execute(interaction) {
  try {
   await interaction.deferReply();

   const subcommand = interaction.options.getSubcommand();
   console.log(
    `Executing subcommand: ${subcommand}, User ID: ${interaction.user.id}`
   );

   // ------------------- Roll for Encounter -------------------
   if (subcommand === "roll") {
    try {
     const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
     const characterName = interaction.options.getString("charactername");
     const userId = interaction.user.id;

     const party = await Party.findOne({ partyId: expeditionId });
     if (!party) {
      return interaction.editReply("Expedition ID not found.");
     }

     const character = await Character.findOne({ name: characterName, userId });
     if (!character) {
      return interaction.editReply(
       "Character not found or you do not own this character."
      );
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
        .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`);
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
        } catch (mapErr) {
         console.error("[explore.js] Failed to mark quadrant explored on roll sync:", mapErr.message);
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
        character.currentStamina = curStam + add;
        await character.save();
        party.characters[characterIndex].currentStamina = character.currentStamina;
        party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
        await party.save();
        ruinRestRecovered = add;
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

     if (party.totalStamina < staminaCost) {
      return interaction.editReply(
       `Not enough party stamina! Required: ${staminaCost}, Available: ${party.totalStamina}`
      );
     }

    // Apply roll cost to current character so party totals stay correct when recalc'd later (e.g. after monster fight)
    const currentStamina = typeof character.currentStamina === "number" ? character.currentStamina : (character.maxStamina ?? 0);
    character.currentStamina = Math.max(0, currentStamina - staminaCost);
    await character.save();
    party.characters[characterIndex].currentStamina = character.currentStamina;
    party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
    party.totalHearts = party.characters.reduce((s, c) => s + (c.currentHearts ?? 0), 0);
    await party.save();

     const location = `${party.square} ${party.quadrant}`;

     // Single outcome per roll: one of monster, item, explored, fairy, chest, old_map, ruins, relic, camp, monster_camp, grotto
     // Reroll if we get a special place (monster_camp/ruins/grotto) and this square already has 3
     function rollOutcome() {
      const r = Math.random();
      if (r < 0.45) return "monster";
      if (r < 0.67) return "item";
      if (r < 0.82) return "explored";
      if (r < 0.86) return "fairy";
      if (r < 0.87) return "chest";
      if (r < 0.88) return "old_map";
      if (r < 0.94) return "ruins";
      if (r < 0.945) return "relic";
      if (r < 0.985) return "camp";
      if (r < 0.995) return "monster_camp";
      return "grotto";
     }
     let outcomeType = rollOutcome();
     const specialCount = countSpecialEventsInSquare(party, party.square);
     while (SPECIAL_OUTCOMES.includes(outcomeType) && specialCount >= MAX_SPECIAL_EVENTS_PER_SQUARE) {
      outcomeType = rollOutcome();
     }

     if (outcomeType === "explored") {
      party.quadrantState = "explored";
      party.markModified("quadrantState");
      pushProgressLog(party, character.name, "explored", `Explored the quadrant (${location}). Party can now Rest, Secure, Roll again, or Move.`, undefined, staminaCost > 0 ? { staminaLost: staminaCost } : undefined);
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
         console.warn("[explore.js] Map update: no square found for", mapSquareId, "quadrant", mapQuadrantId);
        } else if (result.modifiedCount === 0) {
         console.warn("[explore.js] Map update: square found but quadrant not updated for", mapSquareId, mapQuadrantId);
        }
       }
      } catch (mapErr) {
       console.error("[explore.js] Failed to update map quadrant status:", mapErr.message);
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
       .setDescription(`**${character.name}** has explored this area (**${location}**). Use the commands below to take your turn, or rest, secure, or move.`)
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
       party.totalHearts = party.characters.reduce((s, c) => s + (c.currentHearts ?? 0), 0);
       party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
       pushProgressLog(party, character.name, "fairy", `A fairy appeared in ${location} and healed the party! All hearts restored.`, undefined, { heartsRecovered: totalHeartsRecovered });
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
      pushProgressLog(party, character.name, "fairy", `Found a Fairy in ${location}.`, undefined, staminaCost > 0 ? { staminaLost: staminaCost } : undefined);
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
       }
       party.totalHearts = party.characters.reduce((s, c) => s + (c.currentHearts ?? 0), 0);
       party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
      }

      let chosenMapOldMap = null;
      if (outcomeType === "old_map") {
       chosenMapOldMap = getRandomOldMap();
       const mapItemName = `Map #${chosenMapOldMap.number}`;
       try {
        await addOldMapToCharacter(character.name, chosenMapOldMap.number, location);
       } catch (err) {
        handleInteractionError(err, interaction, { source: "explore.js old_map" });
       }
       const userIds = [...new Set((party.characters || []).map((c) => c.userId).filter(Boolean))];
       const dmContent = `🗺️ **Expedition map found** (expedition \`${expeditionId}\`)\n\n**${mapItemName}** found and saved to **${character.name}**'s map collection. Take it to the Inariko Library to get it deciphered. More info: ${OLD_MAPS_LINK}`;
       const client = interaction.client;
       if (client) {
        for (const uid of userIds) {
         try {
          const user = await client.users.fetch(uid).catch(() => null);
          if (user) await user.send(dmContent).catch(() => {});
         } catch (_) {}
        }
       }
      }

      const progressMessages = {
       chest: `Found a chest in ${location} (open for 1 stamina).`,
       old_map: chosenMapOldMap ? `Found Map #${chosenMapOldMap.number} in ${location}; saved to ${character.name}'s map collection. Take to Inariko Library to decipher.` : `Found an old map in ${location}; take to Inariko Library to decipher.`,
       ruins: `Found ruins in ${location} (explore for 3 stamina or skip).`,
       relic: `Found a relic in ${location}; take to Artist/Researcher to appraise.`,
       camp: `Found a safe space in ${location} and rested. Recovered ${campHeartsRecovered} heart(s), ${campStaminaRecovered} stamina.`,
       monster_camp: `Found a monster camp in ${location}; report to town hall to mark on map.`,
       grotto: `Found a grotto in ${location} (cleanse for 1 plume + 1 stamina or mark for later).`,
      };
      const chestRuinsCosts =
       staminaCost > 0 || outcomeType === "camp"
        ? {
            ...(staminaCost > 0 && { staminaLost: staminaCost }),
            ...(outcomeType === "camp" && { heartsRecovered: campHeartsRecovered, staminaRecovered: campStaminaRecovered }),
          }
        : undefined;
      pushProgressLog(
       party,
       character.name,
       outcomeType,
       progressMessages[outcomeType] || `Found something in ${location}.`,
       outcomeType === "old_map" && chosenMapOldMap ? { itemName: `Map #${chosenMapOldMap.number}`, emoji: "" } : undefined,
       chestRuinsCosts
      );
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save();
      const nextCharacter = party.characters[party.currentTurn];

      let title, description;
      if (outcomeType === "monster_camp") {
       title = `🗺️ **Expedition: Monster Camp found!**`;
       description =
        `**${character.name}** found something unsettling in **${location}**.\n\n` +
        "Um....You found a Monster Camp of some kind....!!! But you aren't ready to face what's there. Report it back to the town hall to have it marked on the map for later.\n\n" +
        "↳ **Continue** ➾ See **Commands** below to take your turn.";
      } else if (outcomeType === "chest") {
       title = `🗺️ **Expedition: Chest found!**`;
       description =
        `**${character.name}** found a chest in **${location}**!\n\n` +
        "Open chest? Costs 1 stamina.\n\n" +
        "**Yes** — Open the chest (1 item per party member, relics possible).\n" +
        `**No** — Continue exploring with </explore roll:${EXPLORE_CMD_ID}>.`;
      } else if (outcomeType === "old_map") {
       const mapInfo = chosenMapOldMap
        ? `**${character.name}** found **Map #${chosenMapOldMap.number}** in **${location}**!\n\nThe script is faded and hard to read—you'll need to take it to the Inariko Library to get it deciphered.\n\n**Saved to ${character.name}'s map collection.**`
        : `**${character.name}** discovered something unusual in **${location}**.\n\nYou found a really old map! You have no idea what you're looking at when you open it. Take it to the Inariko Library to get it deciphered.`;
       title = `🗺️ **Expedition: Old map found!**`;
       description =
        mapInfo + `\n\nFind out more [here](${OLD_MAPS_LINK}).\n\n↳ **Continue** ➾ See **Commands** below to take your turn.`;
      } else if (outcomeType === "ruins") {
       title = `🗺️ **Expedition: Ruins found!**`;
       description =
        `**${character.name}** found some ruins in **${location}**!\n\n` +
        "You found some ruins! Do you want to explore them?\n\n" +
        "**Yes** — Explore ruins (cost 3 stamina).\n" +
        `**No** — Continue exploring with </explore roll:${EXPLORE_CMD_ID}>.`;
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
        "**Yes** — Use the grotto flow when available (cost 1 goddess plume + 1 stamina).\n" +
        `**No** (mark it on the map for later!) — Continue exploring with </explore roll:${EXPLORE_CMD_ID}>.`;
      } else if (outcomeType === "camp") {
       title = `🗺️ **Expedition: Found a safe space and rested!**`;
       description = `**${character.name}** found a safe space in **${location}** and rested! Recovered ❤️ **${campHeartsRecovered}** heart(s) and 🟩 **${campStaminaRecovered}** stamina.`;
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
      let components = [];
      if (isYesNoChoice) {
       const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
         .setCustomId(`explore_${outcomeType}_yes|${expeditionId}`)
         .setLabel("Yes")
         .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
         .setCustomId(`explore_${outcomeType}_no|${expeditionId}`)
         .setLabel("No")
         .setStyle(ButtonStyle.Secondary)
       );
       components = [row];
      }

      const msg = await interaction.editReply({ embeds: [embed], components });
      await interaction.followUp({ content: `<@${nextCharacter.userId}> it's your turn now` });

      if (isYesNoChoice) {
       const collector = msg.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 5 * 60 * 1000,
        max: 1,
       });
       collector.on("collect", async (i) => {
        await i.deferUpdate();
        const isYes = i.customId.endsWith("_yes") || i.customId.includes("_yes|");
        const disabledRow = new ActionRowBuilder().addComponents(
         new ButtonBuilder()
          .setCustomId(`explore_${outcomeType}_yes|${expeditionId}`)
          .setLabel("Yes")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
         new ButtonBuilder()
          .setCustomId(`explore_${outcomeType}_no|${expeditionId}`)
          .setLabel("No")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
        );

        if (outcomeType === "ruins" && isYes) {
         // Disable Yes/No buttons immediately so the original message stays with greyed-out buttons
         await i.update({ embeds: [embed], components: [disabledRow] }).catch(() => {});
         await msg.edit({ embeds: [embed], components: [disabledRow] }).catch(() => {});
         // Ruins exploration: charge 3 stamina, then roll one of chest/camp/landmark/relic/old_map/star_fragment/blight/goddess_plume
         const freshParty = await Party.findOne({ partyId: expeditionId });
         if (!freshParty) {
          await i.followUp({ embeds: [new EmbedBuilder().setTitle("Error").setDescription("Expedition not found.").setColor(0xff0000)], ephemeral: true }).catch(() => {});
          return;
         }
         const ruinsCharIndex = (freshParty.currentTurn - 1 + freshParty.characters.length) % freshParty.characters.length;
         const ruinsCharSlot = freshParty.characters[ruinsCharIndex];
         const ruinsCharacter = await Character.findById(ruinsCharSlot._id);
         if (!ruinsCharacter) {
          await i.followUp({ embeds: [new EmbedBuilder().setTitle("Error").setDescription("Character not found.").setColor(0xff0000)], ephemeral: true }).catch(() => {});
          return;
         }
         const ruinsStaminaCost = 3;
         const currentStamina = typeof ruinsCharacter.currentStamina === "number" ? ruinsCharacter.currentStamina : (ruinsCharacter.maxStamina ?? 0);
         if (currentStamina < ruinsStaminaCost) {
          const noStaminaEmbed = new EmbedBuilder()
           .setTitle(title)
           .setColor(regionColors[freshParty.region] || "#00ff99")
           .setDescription(description.split("\n\n")[0] + "\n\n❌ **Not enough stamina to explore the ruins.** " + ruinsCharacter.name + " has " + currentStamina + " 🟩 (need 3). Continue with </explore roll>.")
           .setImage(regionImages[freshParty.region] || EXPLORATION_IMAGE_FALLBACK);
          addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
          await msg.edit({ embeds: [noStaminaEmbed], components: [disabledRow] }).catch(() => {});
          return;
         }
         ruinsCharacter.currentStamina = Math.max(0, currentStamina - ruinsStaminaCost);
         await ruinsCharacter.save();
         freshParty.characters[ruinsCharIndex].currentStamina = ruinsCharacter.currentStamina;
         freshParty.totalStamina = freshParty.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);
         await freshParty.save();

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
         const summaryLine = `The party explored the ruins in **${location}** (−3 stamina).\n\n`;
         let resultDescription = "";
         let progressMsg = `Explored ruins in ${location} (-3 stamina). `;
         let lootForLog = undefined;

         if (ruinsOutcome === "chest") {
          resultDescription = summaryLine + `**${ruinsCharacter.name}** explored the ruins and found a chest!\n\nOpen chest? Costs 1 stamina.\n\n**Yes** — Open the chest (1 item per party member, relics possible).\n**No** — Continue exploring with </explore roll:${EXPLORE_CMD_ID}>.`;
          progressMsg += "Found a chest (open for 1 stamina).";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, { staminaLost: ruinsStaminaCost });
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
           console.warn("[explore.js] Failed to mark ruin-rest on map:", mapErr?.message || mapErr);
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found a solid camp spot in the ruins and recovered **${recover}** 🟩 stamina. Remember to add it to the map for future expeditions!\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a camp spot; recovered 1 stamina.";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, { staminaLost: ruinsStaminaCost, staminaRecovered: recover });
         } else if (ruinsOutcome === "landmark") {
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found nothing special in the ruins—but an interesting landmark. It's been marked on the map.\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found an interesting landmark (marked on map).";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, { staminaLost: ruinsStaminaCost });
         } else if (ruinsOutcome === "relic") {
          try {
           await createRelic({
            name: "Unknown Relic",
            discoveredBy: ruinsCharacter.name,
            discoveredDate: new Date(),
            locationFound: location,
            appraised: false,
          });
          } catch (err) {
           console.error("[explore.js] createRelic error:", err?.message || err);
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found a relic in the ruins! Take it to an Inarikian Artist or Researcher to get it appraised. More info [here](https://www.rootsofthewild.com/relics).\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a relic (take to Artist/Researcher to appraise).";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, { staminaLost: ruinsStaminaCost });
         } else if (ruinsOutcome === "old_map") {
          const chosenMap = getRandomOldMap();
          const mapItemName = `Map #${chosenMap.number}`;
          try {
           await addOldMapToCharacter(ruinsCharacter.name, chosenMap.number, location);
          } catch (err) {
           handleInteractionError(err, i, { source: "explore.js ruins old_map" });
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found **Map #${chosenMap.number}** in the ruins! The script is faded and hard to read—take it to the Inariko Library to get it deciphered.\n\n**Saved to ${ruinsCharacter.name}'s map collection.** Find out more about maps [here](${OLD_MAPS_LINK}).\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += `Found ${mapItemName}; saved to map collection. Take to Inariko Library to decipher.`;
          lootForLog = { itemName: mapItemName, emoji: "" };
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, lootForLog, { staminaLost: ruinsStaminaCost });
          // DM all expedition members (no coordinates until appraised)
          const userIds = [...new Set((freshParty.characters || []).map((c) => c.userId).filter(Boolean))];
          const dmContent = `🗺️ **Expedition map found** (expedition \`${expeditionId}\`)\n\n**${mapItemName}** found and saved to **${ruinsCharacter.name}**'s map collection. Take it to the Inariko Library to get it deciphered. More info: ${OLD_MAPS_LINK}`;
          const client = i.client;
          if (client) {
           for (const uid of userIds) {
            try {
             const user = await client.users.fetch(uid).catch(() => null);
             if (user) await user.send(dmContent).catch(() => {});
            } catch (_) {}
           }
          }
         } else if (ruinsOutcome === "star_fragment") {
          try {
           await addItemInventoryDatabase(ruinsCharacter._id, "Star Fragment", 1, i, "Exploration - Ruins");
          } catch (err) {
           handleInteractionError(err, i, { source: "explore.js ruins star_fragment" });
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** collected a **Star Fragment** in the ruins!\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a Star Fragment.";
          lootForLog = { itemName: "Star Fragment", emoji: "" };
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, lootForLog, { staminaLost: ruinsStaminaCost });
         } else if (ruinsOutcome === "blight") {
          ruinsCharacter.blighted = true;
          if (!ruinsCharacter.blightedAt) ruinsCharacter.blightedAt = new Date();
          if (!ruinsCharacter.blightStage || ruinsCharacter.blightStage === 0) {
           ruinsCharacter.blightStage = 1;
           ruinsCharacter.blightEffects = { rollMultiplier: 1.0, noMonsters: false, noGathering: false };
          }
          await ruinsCharacter.save();
          resultDescription = summaryLine + `**${ruinsCharacter.name}** found… **BLIGHT** in the ruins. You're blighted! Use the </blight:...> command for healing and info.\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found blight; character is now blighted.";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, { staminaLost: ruinsStaminaCost });
         } else {
          // goddess_plume
          try {
           await addItemInventoryDatabase(ruinsCharacter._id, "Goddess Plume", 1, i, "Exploration - Ruins");
          } catch (err) {
           handleInteractionError(err, i, { source: "explore.js ruins goddess_plume" });
          }
          resultDescription = summaryLine + `**${ruinsCharacter.name}** excavated a **Goddess Plume** from the ruins!\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Excavated a Goddess Plume.";
          lootForLog = { itemName: "Goddess Plume", emoji: "" };
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, lootForLog, { staminaLost: ruinsStaminaCost });
         }
         const finalParty = await Party.findOne({ partyId: expeditionId });
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
           new ButtonBuilder().setCustomId(`explore_chest_yes|${expeditionId}`).setLabel("Yes").setStyle(ButtonStyle.Success),
           new ButtonBuilder().setCustomId(`explore_chest_no|${expeditionId}`).setLabel("No").setStyle(ButtonStyle.Secondary)
          );
          const chestDisabledRow = new ActionRowBuilder().addComponents(
           new ButtonBuilder().setCustomId(`explore_chest_yes|${expeditionId}`).setLabel("Yes").setStyle(ButtonStyle.Success).setDisabled(true),
           new ButtonBuilder().setCustomId(`explore_chest_no|${expeditionId}`).setLabel("No").setStyle(ButtonStyle.Secondary).setDisabled(true)
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
            if (ci.customId.endsWith("_yes")) {
             const result = await handleExplorationChestOpen(ci, expeditionId, location);
             if (result?.notEnoughStamina) {
              const fp = await Party.findOne({ partyId: expeditionId });
              const noStamEmbed = new EmbedBuilder()
               .setTitle(resultTitle)
               .setColor(regionColors[fp?.region] || "#00ff99")
               .setDescription(resultDescription.split("\n\n")[0] + "\n\n❌ **Not enough stamina to open the chest.** Party has " + (fp?.totalStamina ?? 0) + " 🟩 (need 1). Continue with </explore roll> or rest/camp first.")
               .setImage(regionImages[fp?.region] || EXPLORATION_IMAGE_FALLBACK);
              addExplorationStandardFields(noStamEmbed, { party: fp, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
              await ci.update({ embeds: [noStamEmbed], components: [chestDisabledRow] }).catch(() => {});
              return;
             }
             if (result?.embed) {
              await ci.update({ embeds: [result.embed], components: [chestDisabledRow] }).catch(() => {});
              if (result.nextCharacter?.userId) await ci.followUp({ content: `<@${result.nextCharacter.userId}> it's your turn now` }).catch(() => {});
             }
            } else {
             const skipEmbed = new EmbedBuilder()
              .setTitle(resultTitle)
              .setColor(regionColors[finalParty?.region] || "#00ff99")
              .setDescription(resultDescription.split("\n\n")[0] + `\n\n✅ **You left the chest.** Continue with </explore roll:${EXPLORE_CMD_ID}>.`)
              .setImage(regionImages[finalParty?.region] || EXPLORATION_IMAGE_FALLBACK);
             addExplorationStandardFields(skipEmbed, { party: finalParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
             await ci.update({ embeds: [skipEmbed], components: [chestDisabledRow] }).catch(() => {});
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
          const result = await handleExplorationChestOpen(i, expeditionId, location);
          if (result?.notEnoughStamina) {
           const freshParty = await Party.findOne({ partyId: expeditionId });
           const noStaminaEmbed = new EmbedBuilder()
            .setTitle(title)
            .setColor(regionColors[freshParty?.region] || "#00ff99")
            .setDescription(description.split("\n\n")[0] + "\n\n❌ **Not enough stamina to open the chest.** Party has " + (freshParty?.totalStamina ?? 0) + " 🟩 (need 1). Continue with </explore roll> or rest/camp first.")
            .setImage(regionImages[freshParty?.region] || EXPLORATION_IMAGE_FALLBACK);
           addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
           await i.update({ embeds: [noStaminaEmbed], components: [disabledRow] }).catch(() => {});
          return;
          }
          if (result?.embed) {
           await i.update({ embeds: [result.embed], components: [disabledRow] }).catch(() => {});
           if (result.nextCharacter?.userId) {
            await i.followUp({ content: `<@${result.nextCharacter.userId}> it's your turn now` }).catch(() => {});
           }
           return;
          }
          return;
         }
         const skipEmbed = new EmbedBuilder()
          .setTitle(title)
          .setColor(regionColors[party.region] || "#00ff99")
          .setDescription(description.split("\n\n")[0] + `\n\n✅ **You left the chest.** Continue with </explore roll:${EXPLORE_CMD_ID}>.`)
          .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
         addExplorationStandardFields(skipEmbed, { party, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false, ruinRestRecovered });
         await i.update({ embeds: [skipEmbed], components: [disabledRow] });
        return;
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
           : `✅ **You left the ruins for later.** Continue with </explore roll:${EXPLORE_CMD_ID}>.`)
         );
        } else {
         choiceEmbed.setDescription(
          intro +
          "\n\n" +
          (isYes
           ? "✅ **You'll attempt to cleanse the grotto!** (Cost 1 goddess plume + 1 stamina — grotto flow TBD.)"
           : `✅ **You marked it on the map for later.** Continue with </explore roll:${EXPLORE_CMD_ID}>.`)
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
        await i.update({ embeds: [choiceEmbed], components: [disabledRow] });
       });
       collector.on("end", (collected, reason) => {
        if (reason === "time" && collected.size === 0 && msg.editable) {
         const timeoutDisabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_yes|${expeditionId}`)
           .setLabel("Yes")
           .setStyle(ButtonStyle.Success)
           .setDisabled(true),
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_no|${expeditionId}`)
           .setLabel("No")
           .setStyle(ButtonStyle.Secondary)
           .setDisabled(true)
         );
         msg.edit({ components: [timeoutDisabledRow] }).catch(() => {});
        }
       });
      }
      return;
     }

     if (outcomeType === "item") {
      const allItems = await fetchAllItems();
      const availableItems = allItems.filter(
       (item) => item[party.region.toLowerCase()]
      );

      if (availableItems.length === 0) {
       return interaction.editReply("No items available for this region.");
      }

      const selectedItem =
       availableItems[Math.floor(Math.random() * availableItems.length)];

      pushProgressLog(party, character.name, "item", `Found ${selectedItem.itemName} in ${location}.`, undefined, staminaCost > 0 ? { staminaLost: staminaCost } : undefined);
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
       console.error(
        `[ERROR] Could not add item to inventory: ${error.message}`
       );
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

      const selectedMonster =
       monsters[Math.floor(Math.random() * monsters.length)];
      console.log(
       `[explore.js]: Encounter: ${selectedMonster.name} (Tier ${selectedMonster.tier})`
      );

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
          console.error(`[ERROR] Raid cooldown active during exploration: ${raidResult.error}`);
          await interaction.editReply(
           `⏰ **${raidResult.error}**\n\n🗺️ **The monster has retreated due to recent raid activity. Try exploring again later.**`
          );
         } else {
          console.error(`[ERROR] Failed to trigger raid for battle: ${raidResult?.error || 'Unknown error'}`);
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

        pushProgressLog(party, character.name, "raid", `Encountered ${selectedMonster.name} (tier ${selectedMonster.tier}) in ${location}. Raid started.`, undefined, staminaCost > 0 ? { staminaLost: staminaCost } : undefined);
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
        console.error(`[ERROR] Raid processing failed:`, error);
        await interaction.editReply("**An error occurred during the raid.**");
       }
      } else {
       console.log(
        `[explore.js]: Encounter: ${selectedMonster.name} (Tier ${selectedMonster.tier})`
       );

       const diceRoll = Math.floor(Math.random() * 100) + 1;
       const {
        damageValue,
        adjustedRandomValue,
        attackSuccess,
        defenseSuccess,
       } = calculateFinalValue(character, diceRoll);
       console.log(
        `[explore.js]: Battle Stats - Damage: ${damageValue}, Roll: ${adjustedRandomValue}/100`
       );

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
         console.log(
          `[explore.js]: ${character.name} has been defeated by ${selectedMonster.name}!`
         );
         await handleKO(character._id);
        }

        await character.save();

        party.characters[characterIndex].currentHearts = character.currentHearts;
        party.characters[characterIndex].currentStamina = character.currentStamina;
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
        outcome.hearts > 0 || staminaCost > 0
         ? { ...(outcome.hearts > 0 && { heartsLost: outcome.hearts }), ...(staminaCost > 0 && { staminaLost: staminaCost }) }
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
       const battleOutcomeDisplay = (() => {
        if (outcome.hearts && outcome.hearts > 0) {
         return outcome.result === "KO" ? generateDamageMessage("KO") : generateDamageMessage(outcome.hearts);
        }
        if (outcome.defenseSuccess) {
         return generateDefenseBuffMessage(outcome.defenseSuccess, outcome.adjustedRandomValue, outcome.damageValue);
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
        return generateFinalOutcomeMessage(outcome.damageValue || 0, outcome.defenseSuccess || false, outcome.attackSuccess || false, outcome.adjustedRandomValue || 0, outcome.damageValue || 0);
       })();
       embed.addFields({ name: `⚔️ __Battle Outcome__`, value: battleOutcomeDisplay, inline: false });

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
     console.error(`[Roll Command Error]`, error);
     await interaction.editReply(
      "An error occurred while processing the roll command."
     );
    }

    // ------------------- Rest Command -------------------
   } else if (subcommand === "rest") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const userId = interaction.user.id;

    const party = await Party.findOne({ partyId: expeditionId });
    if (!party) {
     return interaction.editReply("Expedition ID not found.");
    }

    const character = await Character.findOne({ name: characterName, userId });
    if (!character) {
     return interaction.editReply(
      "Character not found or you do not own this character."
     );
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
       .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`);
     return interaction.editReply({ embeds: [notYourTurnEmbed] });
    }

    if (
     party.quadrantState !== "explored" &&
     party.quadrantState !== "secured"
    ) {
     return interaction.editReply(
      "You can only rest in explored or secured quadrants."
     );
    }

    const staminaCost = 3;
    if (party.totalStamina < staminaCost) {
     return interaction.editReply(
      `Not enough party stamina! Required: ${staminaCost}, Available: ${party.totalStamina}`
     );
    }

    // Apply rest cost to current character so party total stays correct
    const restCharStamina = typeof character.currentStamina === "number" ? character.currentStamina : (character.maxStamina ?? 0);
    character.currentStamina = Math.max(0, restCharStamina - staminaCost);
    await character.save();
    party.characters[characterIndex].currentStamina = character.currentStamina;

    let revivedCount = 0;
    for (let i = 0; i < party.characters.length; i++) {
     const partyChar = party.characters[i];
     const char = await Character.findById(partyChar._id);
     if (char) {
      if (char.currentHearts === 0) revivedCount++;
      char.currentHearts = char.maxHearts;
      await char.save();
      party.characters[i].currentHearts = char.currentHearts;
     }
    }
    party.totalHearts = party.characters.reduce(
     (sum, c) => sum + (c.currentHearts ?? 0),
     0
    );
    party.totalStamina = party.characters.reduce(
     (sum, c) => sum + (c.currentStamina ?? 0),
     0
    );

    pushProgressLog(
     party,
     character.name,
     "rest",
     `Rested at ${party.square} ${party.quadrant}. All party hearts healed.${revivedCount > 0 ? ` Revived ${revivedCount} KO'd member(s).` : ""} (-${staminaCost} stamina)`,
     undefined,
     { staminaLost: staminaCost }
    );
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    const nextCharacterRest = party.characters[party.currentTurn];
    const locationRest = `${party.square} ${party.quadrant}`;
    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Rest at ${locationRest}**`)
     .setColor(regionColors[party.region] || "#4CAF50")
     .setDescription(
      `${character.name} rested. All party hearts healed.${revivedCount > 0 ? ` Revived ${revivedCount} KO'd member(s).` : ""} (-${staminaCost} party stamina)`
     )
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationRest,
      nextCharacter: nextCharacterRest ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
    });

    await interaction.editReply({ embeds: [embed] });
    await interaction.followUp({ content: `<@${nextCharacterRest.userId}> it's your turn now` });

    // ------------------- Secure Quadrant Command -------------------
   } else if (subcommand === "secure") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const userId = interaction.user.id;

    const party = await Party.findOne({ partyId: expeditionId });
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
       .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`);
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
    if (party.totalStamina < staminaCost) {
     return interaction.editReply(
      `Not enough party stamina! Required: ${staminaCost}, Available: ${party.totalStamina}`
     );
    }

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

    // Apply secure cost to current character so party total stays correct
    const secureCharStamina = typeof character.currentStamina === "number" ? character.currentStamina : (character.maxStamina ?? 0);
    character.currentStamina = Math.max(0, secureCharStamina - staminaCost);
    await character.save();
    party.characters[characterIndex].currentStamina = character.currentStamina;
    party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);

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
       console.warn("[explore.js] Secure map update: no square found for", mapSquareId, "quadrant", mapQuadrantId);
      }
     } catch (mapErr) {
      console.error("[explore.js] Failed to update map quadrant status to secured:", mapErr.message);
     }
    }

    party.quadrantState = "secured";
    party.markModified("quadrantState");
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;

    const locationSecure = `${party.square} ${party.quadrant}`;
    pushProgressLog(
     party,
     character.name,
     "secure",
     `Secured ${locationSecure} using Wood and Eldin Ore (-${staminaCost} party stamina). Quadrant secured; no stamina cost to explore here.`,
     undefined,
     { staminaLost: staminaCost }
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
    embed.addFields({
      name: "📋 **__Benefits__**",
      value: "Quadrant secured. No stamina cost to explore here, increased safety.",
      inline: false,
     });
    const explorePageUrl = `${(process.env.DASHBOARD_URL || process.env.APP_URL || "https://tinglebot.xyz").replace(/\/$/, "")}/explore/${encodeURIComponent(expeditionId)}`;
    embed.addFields({
      name: "📋 **__Draw path (do this now)__**",
      value: `**Check the dashboard** — open the explore page, **download the square image**, draw your path, and **upload it**. You **cannot do this later**; you must do it **before you move**.\n\n🔗 ${explorePageUrl}`,
      inline: false,
     });
    addExplorationCommandsField(embed, {
      party,
      expeditionId,
      location: locationSecure,
      nextCharacter: nextCharacterSecure ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
    });

    await interaction.editReply({ embeds: [embed] });
    await interaction.followUp({
      content: `**Draw your path now:** Check the dashboard → download the square image, draw your path, and upload it. You must do this **before you move** (you cannot do it later). ${explorePageUrl}\n\n<@${nextCharacterSecure.userId}> it's your turn now`,
    });

    // ------------------- Move to Adjacent Quadrant -------------------
   } else if (subcommand === "move") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const quadrantInput = interaction.options.getString("quadrant") || "";
    const userId = interaction.user.id;

    const party = await Party.findOne({ partyId: expeditionId });
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
       .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`);
     return interaction.editReply({ embeds: [notYourTurnEmbed] });
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

    // Move cost: 1 stamina if destination is already explored or secured, 2 if unexplored
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
    const staminaCost = destinationQuadrantState === "unexplored" ? 2 : 1;
    if (party.totalStamina < staminaCost) {
     return interaction.editReply(
      `Not enough party stamina! Required: ${staminaCost}, Available: ${party.totalStamina}`
     );
    }

    // Block leaving the square until all quadrants (except inaccessible) are explored or secured
    const targetSquareNorm = String(newLocation.square || "").trim().toUpperCase();
    const currentSquareNorm = String(currentSquare || "").trim().toUpperCase();
    if (targetSquareNorm !== currentSquareNorm) {
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
       return interaction.editReply(
        `Oops! Can't leave until **${currentSquare}** is explored! The following quads are still unexplored: **${quadList}**.`
       );
      }
     }
    }

    // When leaving a square, clear any reportable discoveries (monster_camp, ruins, grotto) in that square from progressLog — unmarked discoveries are considered lost
    const leavingSquare = String(currentSquare || "").trim().toUpperCase();
    let clearedCount = 0;
    if (leavingSquare && party.progressLog && Array.isArray(party.progressLog)) {
     const before = party.progressLog.length;
     party.progressLog = party.progressLog.filter((e) => {
      if (!SPECIAL_OUTCOMES.includes(e.outcome)) return true;
      const m = LOC_IN_MESSAGE_RE.exec(e.message || "");
      if (!m || !m[1]) return true;
      const entrySquare = String(m[1]).trim().toUpperCase();
      if (entrySquare !== leavingSquare) return true;
      clearedCount += 1;
      return false;
     });
     if (clearedCount > 0) party.markModified("progressLog");
    }

    // Apply move cost to current character so party total stays correct
    const moveCharStamina = typeof character.currentStamina === "number" ? character.currentStamina : (character.maxStamina ?? 0);
    character.currentStamina = Math.max(0, moveCharStamina - staminaCost);
    await character.save();
    party.characters[characterIndex].currentStamina = character.currentStamina;
    party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);

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
      } catch (mapErr) {
       console.error("[explore.js] Failed to mark quadrant explored on move:", mapErr.message);
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
     `Moved ${directionLabel} **${locationMove}** (quadrant ${quadrantStateLabel}). (-${staminaCost} stamina)`,
     undefined,
     { staminaLost: staminaCost }
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
          const hasIt = await hasOldMap(pc.name, quadWithMap.oldMapNumber);
          if (hasIt) whoHasMap.push(pc.name);
        }
        if (whoHasMap.length > 0) {
          moveDescription += `\n\n🗺️ **Map location!** This area is marked on **${mapItemName}**. ${whoHasMap.join(", ")} ${whoHasMap.length === 1 ? "has" : "have"} the map — you've found the location of a **${leadsToLabel}**! More info: ${OLD_MAPS_LINK}`;
        }
      } catch (invErr) {
        console.warn("[explore.js] Could not check old map collection:", invErr?.message || invErr);
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

    const party = await Party.findOne({ partyId: expeditionId });
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

    await character.save();
    await party.save();

    const heartsText = hearts > 0 ? `+${hearts} ❤️` : "";
    const staminaText = stamina > 0 ? `+${stamina} 🟩` : "";
    const effect = [heartsText, staminaText].filter(Boolean).join(", ");
    const locationItem = `${party.square} ${party.quadrant}`;

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
      nextCharacter: null,
      showNextAndCommands: false,
      showRestSecureMove: false,
    });

    await interaction.editReply({ embeds: [embed] });

    // ------------------- Retreat to Village -------------------
   } else if (subcommand === "retreat") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const userId = interaction.user.id;

    const party = await Party.findOne({ partyId: expeditionId });
    if (!party) {
     return interaction.editReply("Expedition ID not found.");
    }

    const character = await Character.findOne({ name: characterName, userId });
    if (!character) {
     return interaction.editReply(
      "Character not found or you do not own this character."
     );
    }

    if (interaction.user.id !== party.leaderId) {
     return interaction.editReply(
      "Only the expedition leader can order a retreat."
     );
    }

    const regionToVillage = {
     eldin: "rudania",
     lanayru: "inariko",
     faron: "vhintl",
    };

    const targetVillage = regionToVillage[party.region];

    for (const partyCharacter of party.characters) {
     const char = await Character.findById(partyCharacter._id);
     if (char) {
      char.currentVillage = targetVillage;
      await char.save();
     }
    }

    party.status = "completed";
    await party.save();

    const villageLabel = targetVillage.charAt(0).toUpperCase() + targetVillage.slice(1);
    const memberNames = (party.characters || []).map((c) => c.name).filter(Boolean);
    const membersText = memberNames.length > 0 ? memberNames.join(", ") : "—";
    const retreatExpeditionId = party.partyId;
    const retreatReportBaseUrl = process.env.DASHBOARD_URL || process.env.APP_URL || "https://www.rootsofthewild.com";
    const retreatReportUrl = `${retreatReportBaseUrl.replace(/\/$/, "")}/explore/${retreatExpeditionId}`;
    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Returned Home**`)
     .setColor(regionColors[party.region] || "#FF5722")
     .setDescription(
      `The expedition has ended.\n\n` +
      `**Returned to ${villageLabel}:**\n${membersText}\n\n` +
      `**View the expedition report here:** [Open expedition report](${retreatReportUrl})`
     )
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);

    await interaction.editReply({ embeds: [embed] });

    // ------------------- End Expedition (at starting quadrant) -------------------
   } else if (subcommand === "end") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const userId = interaction.user.id;

    const party = await Party.findOne({ partyId: expeditionId });
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
      "You can only end the expedition when at the starting quadrant for your region. Use **Retreat** to leave from elsewhere, or **Move** to return to the start first."
     );
    }

    const regionToVillage = {
     eldin: "rudania",
     lanayru: "inariko",
     faron: "vhintl",
    };
    const targetVillage = regionToVillage[party.region];

    // Divide remaining party stamina among all members (each gets equal share, capped at maxStamina)
    const remainingStamina = Math.max(0, party.totalStamina ?? 0);
    const memberCount = (party.characters || []).length;
    if (memberCount > 0 && remainingStamina > 0) {
     const perMember = Math.floor(remainingStamina / memberCount);
     const remainder = remainingStamina % memberCount;
     for (let idx = 0; idx < party.characters.length; idx++) {
      const partyCharacter = party.characters[idx];
      const char = await Character.findById(partyCharacter._id);
      if (char) {
       const share = perMember + (idx < remainder ? 1 : 0);
       const current = typeof char.currentStamina === "number" ? char.currentStamina : 0;
       const max = char.maxStamina ?? current;
       char.currentStamina = Math.min(max, current + share);
       char.currentVillage = targetVillage;
       await char.save();
      }
     }
    } else {
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
       ).catch((err) => console.error("[explore.js] Return item to owner:", err.message));
      }
     }
    }

    party.status = "completed";
    await party.save();

    const villageLabel = targetVillage.charAt(0).toUpperCase() + targetVillage.slice(1);
    const memberNames = (party.characters || []).map((c) => c.name).filter(Boolean);
    const membersText = memberNames.length > 0 ? memberNames.join(", ") : "—";
    const reportBaseUrl = process.env.DASHBOARD_URL || process.env.APP_URL || "https://www.rootsofthewild.com";
    const reportUrl = `${reportBaseUrl.replace(/\/$/, "")}/explore/${expeditionId}`;
    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Returned Home**`)
     .setColor(regionColors[party.region] || "#4CAF50")
     .setDescription(
      `The expedition has ended.\n\n` +
      `**Returned to ${villageLabel}:**\n${membersText}\n\n` +
      `**View the expedition report here:** [Open expedition report](${reportUrl})`
     )
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);

    await interaction.editReply({ embeds: [embed] });

    // ------------------- Camp Command -------------------
   } else if (subcommand === "camp") {
    const expeditionId = normalizeExpeditionId(interaction.options.getString("id"));
    const characterName = interaction.options.getString("charactername");
    const userId = interaction.user.id;

    const party = await Party.findOne({ partyId: expeditionId });
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
       .setDescription(`It is not your turn.\n\n**Next turn:** ${nextCharacter?.name || "Unknown"}`);
     return interaction.editReply({ embeds: [notYourTurnEmbed] });
    }

    const isSecured = party.quadrantState === "secured";
    const staminaCost = isSecured ? 0 : 3;
    const heartsPct = isSecured ? 0.5 : 0.25;

    if (staminaCost > 0 && party.totalStamina < staminaCost) {
     return interaction.editReply(
      `Not enough party stamina to camp here. Requires ${staminaCost} stamina (secured quadrants cost 0).`
     );
    }

    if (staminaCost > 0) {
     const campChar = party.characters[characterIndex];
     const campCharDoc = await Character.findById(campChar._id);
     if (campCharDoc) {
      campCharDoc.currentStamina = Math.max(0, (campCharDoc.currentStamina ?? 0) - staminaCost);
      await campCharDoc.save();
      party.characters[characterIndex].currentStamina = campCharDoc.currentStamina;
     }
    }

    const recoveryPerMember = [];
    for (let i = 0; i < party.characters.length; i++) {
     const partyChar = party.characters[i];
     const char = await Character.findById(partyChar._id);
     if (char) {
      const maxHrt = char.maxHearts ?? 0;
      const heartsRecovered = Math.floor(maxHrt * heartsPct);
      recoveryPerMember.push({ name: char.name, hearts: heartsRecovered });
      char.currentHearts = Math.min(char.maxHearts, char.currentHearts + heartsRecovered);
      party.characters[i].currentHearts = char.currentHearts;
      await char.save();
     }
    }
    party.totalStamina = party.characters.reduce((sum, c) => sum + (c.currentStamina ?? 0), 0);
    party.totalHearts = party.characters.reduce((sum, c) => sum + (c.currentHearts ?? 0), 0);

    const locationCamp = `${party.square} ${party.quadrant}`;
    const totalHeartsRecovered = recoveryPerMember.reduce((s, r) => s + r.hearts, 0);
    const costsForLog = staminaCost > 0 ? { staminaLost: staminaCost, heartsRecovered: totalHeartsRecovered } : { heartsRecovered: totalHeartsRecovered };
    pushProgressLog(
     party,
     character.name,
     "camp",
     `Camped at ${locationCamp}. Party recovered hearts (${Math.round(heartsPct * 100)}% of max).${staminaCost > 0 ? ` (-${staminaCost} stamina)` : ""}`,
     undefined,
     costsForLog
    );

    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    const nextCharacterCamp = party.characters[party.currentTurn];
    const recoveryValue = recoveryPerMember
     .map((r) => `${r.name}: +${r.hearts} ❤️`)
     .join("\n");
    const campNote = isSecured ? "The secured quadrant made for a restful night." : "The party rested.";
    const costNote = staminaCost > 0 ? ` (-${staminaCost} stamina)` : "";
    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Camp at ${locationCamp}**`)
     .setColor(regionColors[party.region] || "#4CAF50")
     .setDescription(
      `${character.name} set up camp. ${campNote}${costNote}`
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
