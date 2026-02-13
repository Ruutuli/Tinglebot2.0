const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { SlashCommandBuilder } = require("@discordjs/builders");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { fetchAllItems, fetchItemsByMonster, createRelic } = require('@/database/db.js');
const {
 calculateFinalValue,
 getMonstersByRegion,
} = require("../../modules/rngModule.js");
const { getEncounterOutcome } = require("../../modules/encounterModule.js");
const { handleKO } = require("../../modules/characterStatsModule.js");
const { triggerRaid } = require("../../modules/raidModule.js");
const { addItemInventoryDatabase } = require('@/utils/inventoryUtils.js');
const { checkInventorySync } = require('@/utils/characterUtils.js');
const { enforceJail } = require('@/utils/jailCheck');
const Party = require('@/models/PartyModel.js');
const Character = require('@/models/CharacterModel.js');
const ItemModel = require('@/models/ItemModel.js');
const Square = require('@/models/mapModel.js');
const MapModule = require('@/modules/mapModule.js');
const {
 addExplorationStandardFields,
 createExplorationItemEmbed,
 createExplorationMonsterEmbed,
 regionColors,
 regionImages,
 EXPLORE_CMD_ID,
} = require("../../embeds/embeds.js");

const EXPLORATION_IMAGE_FALLBACK = "https://via.placeholder.com/100x100";
const { handleAutocomplete } = require("../../handlers/autocompleteHandler.js");
const { getRandomOldMap, OLD_MAPS_LINK } = require("../../data/oldMaps.js");
const DatabaseConnectionManager = require("../../database/connectionManager.js");

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

// Autocomplete can show "E402960 | Lanayru | started | H8 Q2"; value sent may be that full string. Use only the partyId (before first "|").
function normalizeExpeditionId(value) {
 if (!value || typeof value !== "string") return value;
 const trimmed = value.trim();
 const pipe = trimmed.indexOf("|");
 return pipe === -1 ? trimmed : trimmed.slice(0, pipe).trim();
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
      return interaction.editReply(
       `It is not your turn. Next turn: ${nextCharacter?.name || "Unknown"}`
      );
     }

     // Sync quadrant state from map so stamina cost matches canonical explored/secured status
     const mapSquare = await Square.findOne({ squareId: party.square });
     if (mapSquare && mapSquare.quadrants && mapSquare.quadrants.length) {
      const q = mapSquare.quadrants.find(
       (qu) => String(qu.quadrantId).toUpperCase() === String(party.quadrant || "").toUpperCase()
      );
      if (q && (q.status === "explored" || q.status === "secured")) {
       party.quadrantState = q.status;
       party.markModified("quadrantState");
      }
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

     // Single outcome per roll: one of monster, raid, item, explored, chest, old_map, ruins, relic, camp, monster_camp, grotto
     const outcomeRoll = Math.random();
     let outcomeType;
     if (outcomeRoll < 0.45) outcomeType = "monster";
     else if (outcomeRoll < 0.70) outcomeType = "item";
     else if (outcomeRoll < 0.85) outcomeType = "explored";
     else if (outcomeRoll < 0.86) outcomeType = "chest";
     else if (outcomeRoll < 0.87) outcomeType = "old_map";
     else if (outcomeRoll < 0.93) outcomeType = "ruins";
     else if (outcomeRoll < 0.935) outcomeType = "relic";
     else if (outcomeRoll < 0.985) outcomeType = "camp";
     else if (outcomeRoll < 0.995) outcomeType = "monster_camp";
     else outcomeType = "grotto";

     if (outcomeType === "explored") {
      party.quadrantState = "explored";
      party.markModified("quadrantState");
      pushProgressLog(party, character.name, "explored", `Explored the quadrant (${location}). Party can now Rest, Secure, Roll again, or Move.`, undefined, staminaCost > 0 ? { staminaLost: staminaCost } : undefined);
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save();

      // Mark quadrant as explored in the canonical map (exploringMap)
      try {
       const mapSquareId = (party.square && String(party.square).trim()) || "";
       const mapQuadrantId = (party.quadrant && String(party.quadrant).trim().toUpperCase()) || "";
       if (mapSquareId && mapQuadrantId) {
        const result = await Square.updateOne(
         { squareId: mapSquareId, "quadrants.quadrantId": mapQuadrantId },
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

      const nextCharacter = party.characters[party.currentTurn];
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
      });
      await interaction.editReply({ embeds: [embed] });
      await interaction.followUp({ content: `<@${nextCharacter.userId}> it's your turn now` });
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
       undefined,
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
        `↳ **Continue** ➾ Use </explore roll:${EXPLORE_CMD_ID}> with this Expedition ID to take your turn.`;
      } else if (outcomeType === "chest") {
       title = `🗺️ **Expedition: Chest found!**`;
       description =
        `**${character.name}** found a chest in **${location}**!\n\n` +
        "You found a chest! Use the chest flow to open it (cost 1 stamina).\n\n" +
        `↳ **Continue** ➾ Use </explore roll:${EXPLORE_CMD_ID}> with this Expedition ID to take your turn.`;
      } else if (outcomeType === "old_map") {
       title = `🗺️ **Expedition: Old map found!**`;
       description =
        `**${character.name}** discovered something unusual in **${location}**.\n\n` +
        "You found a really old map! You have no idea what you're looking at when you open it. Take it to the Inariko Library to get it deciphered. You can find out more info [here](https://www.rootsofthewild.com/oldmaps).\n\n" +
        `↳ **Continue** ➾ Use </explore roll:${EXPLORE_CMD_ID}> with this Expedition ID to take your turn.`;
      } else if (outcomeType === "ruins") {
       title = `🗺️ **Expedition: Ruins found!**`;
       description =
        `**${character.name}** found some ruins in **${location}**!\n\n` +
        "You found some ruins! Do you want to explore them?\n\n" +
        "**Yes** — Use the ruins flow when available (cost 3 stamina).\n" +
        `**No** — Continue exploring with </explore roll:${EXPLORE_CMD_ID}>.`;
      } else if (outcomeType === "relic") {
       title = `🗺️ **Expedition: Relic found!**`;
       description =
        `**${character.name}** found something ancient in **${location}**.\n\n` +
        "You found a relic! What is this? Take it to an Inarikian Artist or Researcher to get this appraised. You can find more info [here](https://www.rootsofthewild.com/relics).\n\n" +
        `↳ **Continue** ➾ Use </explore roll:${EXPLORE_CMD_ID}> with this Expedition ID to take your turn.`;
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
      });

      const isYesNoChoice = outcomeType === "ruins" || outcomeType === "grotto";
      let components = [];
      if (isYesNoChoice) {
       const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
         .setCustomId(`explore_${outcomeType}_yes`)
         .setLabel("Yes")
         .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
         .setCustomId(`explore_${outcomeType}_no`)
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
        const isYes = i.customId.endsWith("_yes");
        const disabledRow = new ActionRowBuilder().addComponents(
         new ButtonBuilder()
          .setCustomId(`explore_${outcomeType}_yes`)
          .setLabel("Yes")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
         new ButtonBuilder()
          .setCustomId(`explore_${outcomeType}_no`)
          .setLabel("No")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
        );

        if (outcomeType === "ruins" && isYes) {
         // Ruins exploration: charge 3 stamina, then roll one of chest/camp/landmark/relic/old_map/star_fragment/blight/goddess_plume
         const freshParty = await Party.findOne({ partyId: expeditionId });
         if (!freshParty) {
          await i.update({ embeds: [new EmbedBuilder().setTitle("Error").setDescription("Expedition not found.").setColor(0xff0000)], components: [disabledRow] }).catch(() => {});
          return;
         }
         const ruinsCharIndex = (freshParty.currentTurn - 1 + freshParty.characters.length) % freshParty.characters.length;
         const ruinsCharSlot = freshParty.characters[ruinsCharIndex];
         const ruinsCharacter = await Character.findById(ruinsCharSlot._id);
         if (!ruinsCharacter) {
          await i.update({ embeds: [new EmbedBuilder().setTitle("Error").setDescription("Character not found.").setColor(0xff0000)], components: [disabledRow] }).catch(() => {});
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
          addExplorationStandardFields(noStaminaEmbed, { party: freshParty, expeditionId, location, nextCharacter, showNextAndCommands: true, showRestSecureMove: false });
          await i.update({ embeds: [noStaminaEmbed], components: [disabledRow] }).catch(() => {});
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
         let resultDescription = "";
         let progressMsg = `Explored ruins in ${location} (-3 stamina). `;
         let lootForLog = undefined;

         if (ruinsOutcome === "chest") {
          resultDescription = `**${ruinsCharacter.name}** explored the ruins and found a chest! Use the chest flow to open it (cost 1 stamina).\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
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
          resultDescription = `**${ruinsCharacter.name}** found a solid camp spot in the ruins and recovered **${recover}** 🟩 stamina. Remember to add it to the map for future expeditions!\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a camp spot; recovered 1 stamina.";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, { staminaLost: ruinsStaminaCost, staminaRecovered: recover });
         } else if (ruinsOutcome === "landmark") {
          resultDescription = `**${ruinsCharacter.name}** found nothing special in the ruins—but an interesting landmark. It's been marked on the map.\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
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
          resultDescription = `**${ruinsCharacter.name}** found a relic in the ruins! Take it to an Inarikian Artist or Researcher to get it appraised. More info [here](https://www.rootsofthewild.com/relics).\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found a relic (take to Artist/Researcher to appraise).";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, { staminaLost: ruinsStaminaCost });
         } else if (ruinsOutcome === "old_map") {
          const chosenMap = getRandomOldMap();
          const mapItemName = `Map #${chosenMap.number}`;
          const leadsToLabel = chosenMap.leadsTo.charAt(0).toUpperCase() + chosenMap.leadsTo.slice(1);
          try {
           await addItemInventoryDatabase(ruinsCharacter._id, mapItemName, 1, i, "Exploration - Ruins");
          } catch (err) {
           handleInteractionError(err, i, { source: "explore.js ruins old_map" });
          }
          resultDescription = `**${ruinsCharacter.name}** found **Map #${chosenMap.number}** in the ruins!\n\n${chosenMap.flavorText}\n\nFind out more about maps [here](${OLD_MAPS_LINK}).\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += `Found ${mapItemName} (leads to ${chosenMap.leadsTo} at ${chosenMap.coordinates}).`;
          lootForLog = { itemName: mapItemName, emoji: "" };
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, lootForLog, { staminaLost: ruinsStaminaCost });
          // DM all expedition members with the map location
          const userIds = [...new Set((freshParty.characters || []).map((c) => c.userId).filter(Boolean))];
          const dmContent = `🗺️ **Expedition map found** (expedition \`${expeditionId}\`)\n\n**${mapItemName}** leads to **${leadsToLabel}** at **${chosenMap.coordinates}**.\n\nMore info: ${OLD_MAPS_LINK}`;
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
          resultDescription = `**${ruinsCharacter.name}** collected a **Star Fragment** in the ruins!\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
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
          resultDescription = `**${ruinsCharacter.name}** found… **BLIGHT** in the ruins. You're blighted! Use the </blight:...> command for healing and info.\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
          progressMsg += "Found blight; character is now blighted.";
          pushProgressLog(freshParty, ruinsCharacter.name, "ruins_explored", progressMsg, undefined, { staminaLost: ruinsStaminaCost });
         } else {
          // goddess_plume
          try {
           await addItemInventoryDatabase(ruinsCharacter._id, "Goddess Plume", 1, i, "Exploration - Ruins");
          } catch (err) {
           handleInteractionError(err, i, { source: "explore.js ruins goddess_plume" });
          }
          resultDescription = `**${ruinsCharacter.name}** excavated a **Goddess Plume** from the ruins!\n\n↳ **Continue** ➾ </explore roll:${EXPLORE_CMD_ID}> — id: \`${expeditionId}\` charactername: **${nextCharacter?.name ?? "—"}**`;
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
        });
         await i.update({ embeds: [resultEmbed], components: [disabledRow] }).catch(() => {});
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
           ? "✅ **You chose to explore the ruins!** (Cost 3 stamina — ruins flow TBD.)"
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
        });
        await i.update({ embeds: [choiceEmbed], components: [disabledRow] });
       });
       collector.on("end", (collected, reason) => {
        if (reason === "time" && collected.size === 0 && msg.editable) {
         const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_yes`)
           .setLabel("Yes")
           .setStyle(ButtonStyle.Success)
           .setDisabled(true),
          new ButtonBuilder()
           .setCustomId(`explore_${outcomeType}_no`)
           .setLabel("No")
           .setStyle(ButtonStyle.Secondary)
           .setDisabled(true)
         );
         msg.edit({ components: [disabledRow] }).catch(() => {});
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
       true
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
         true
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
         const lootedItem =
          items.length > 0
           ? items[Math.floor(Math.random() * items.length)]
           : null;

         if (lootedItem) {
          embed.addFields({
           name: `🎉 __Loot Found__`,
           value: `${lootedItem.emoji || ""} **${lootedItem.itemName}**`,
           inline: false,
          });

          await addItemInventoryDatabase(
           character._id,
           lootedItem.itemName,
           1,
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
           quantity: 1,
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
        lootedItem =
         items.length > 0
          ? items[Math.floor(Math.random() * items.length)]
          : null;
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
        true
       );

       embed.addFields(
        {
         name: `❤️ __${character.name} Hearts__`,
         value: `${character.currentHearts}/${character.maxHearts}`,
         inline: true,
        },
        { name: `⚔️ __Battle Outcome__`, value: outcome.result, inline: false }
       );

       if (outcome.canLoot && lootedItem) {
        embed.addFields({
         name: `🎉 __Loot Found__`,
         value: `${lootedItem.emoji || ""} **${lootedItem.itemName}**`,
         inline: false,
        });

        await addItemInventoryDatabase(
         character._id,
         lootedItem.itemName,
         1,
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
         quantity: 1,
         emoji: lootedItem.emoji || "",
        });
       }

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
     return interaction.editReply(
      `It is not your turn. Next turn: ${nextCharacter?.name || "Unknown"}`
     );
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
     return interaction.editReply(
      `It is not your turn. Next turn: ${nextCharacter?.name || "Unknown"}`
     );
    }

    if (party.quadrantState !== "explored") {
     return interaction.editReply("You can only secure explored quadrants.");
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
     availableResources.some((item) => item.itemName === resource)
    );

    if (!hasResources) {
     const embed = new EmbedBuilder()
      .setTitle("🚫 Cannot Secure Quadrant")
      .setColor(regionColors[party.region] || "#FF9800")
      .setDescription(
        "Party needs Wood and Eldin Ore to secure this quadrant.\n\nPlease continue to roll."
      );
     return interaction.editReply({ embeds: [embed] });
    }

    // Apply secure cost to current character so party total stays correct
    const secureCharStamina = typeof character.currentStamina === "number" ? character.currentStamina : (character.maxStamina ?? 0);
    character.currentStamina = Math.max(0, secureCharStamina - staminaCost);
    await character.save();
    party.characters[characterIndex].currentStamina = character.currentStamina;
    party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);

    party.quadrantState = "secured";
    party.markModified("quadrantState");
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    const nextCharacterSecure = party.characters[party.currentTurn];
    const locationSecure = `${party.square} ${party.quadrant}`;
    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Secured ${locationSecure}**`)
     .setColor(regionColors[party.region] || "#FF9800")
     .setDescription(
      `${character.name} secured the quadrant using resources (-${staminaCost} party stamina).`
     )
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK)
     .addFields({
      name: "📋 **__Benefits__**",
      value: "Quadrant secured. No stamina cost to explore here, increased safety.",
      inline: false,
     });
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationSecure,
      nextCharacter: nextCharacterSecure ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
    });

    await interaction.editReply({ embeds: [embed] });
    await interaction.followUp({ content: `<@${nextCharacterSecure.userId}> it's your turn now` });

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
     return interaction.editReply(
      `It is not your turn. Next turn: ${nextCharacter?.name || "Unknown"}`
     );
    }

    const staminaCost = 2;
    if (party.totalStamina < staminaCost) {
     return interaction.editReply(
      `Not enough party stamina! Required: ${staminaCost}, Available: ${party.totalStamina}`
     );
    }

    const currentSquare = party.square;
    const currentQuadrant = party.quadrant;
    const adjacent = getAdjacentQuadrants(currentSquare, currentQuadrant);

    // Parse "H8 Q1" or "H8 Q2" format
    const trimmed = quadrantInput.trim();
    const spaceIdx = trimmed.lastIndexOf(" ");
    const targetSquare = spaceIdx > 0 ? trimmed.slice(0, spaceIdx).trim().toUpperCase() : trimmed.toUpperCase();
    const targetQuadrant = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1).trim().toUpperCase() : null;

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

    // Apply move cost to current character so party total stays correct
    const moveCharStamina = typeof character.currentStamina === "number" ? character.currentStamina : (character.maxStamina ?? 0);
    character.currentStamina = Math.max(0, moveCharStamina - staminaCost);
    await character.save();
    party.characters[characterIndex].currentStamina = character.currentStamina;
    party.totalStamina = party.characters.reduce((s, c) => s + (c.currentStamina ?? 0), 0);

    party.square = newLocation.square;
    party.quadrant = newLocation.quadrant;
    // Sync quadrant state from map: if this quadrant is already explored/secured, party gets that state (1 or 0 stamina to roll)
    let mapQuadrantState = "unexplored";
    const mapSquare = await Square.findOne({ squareId: newLocation.square });
    if (mapSquare && mapSquare.quadrants && mapSquare.quadrants.length) {
     const q = mapSquare.quadrants.find(
      (qu) => String(qu.quadrantId).toUpperCase() === String(newLocation.quadrant).toUpperCase()
     );
     if (q && (q.status === "explored" || q.status === "secured")) {
      mapQuadrantState = q.status;
     }
    }
    party.quadrantState = mapQuadrantState;
    party.markModified("quadrantState");
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    const nextCharacterMove = party.characters[party.currentTurn];
    const locationMove = `${newLocation.square} ${newLocation.quadrant}`;
    const quadrantStateLabel = mapQuadrantState === "secured" ? "secured" : mapQuadrantState === "explored" ? "explored" : "unexplored";
    let moveDescription = `${character.name} led the party to **${locationMove}** (quadrant ${quadrantStateLabel}).`;

    // If this quadrant is an old map location, check if any party member has that map and show prompt
    const quadWithMap = mapSquare && mapSquare.quadrants ? mapSquare.quadrants.find(
      (qu) => String(qu.quadrantId).toUpperCase() === String(newLocation.quadrant).toUpperCase()
    ) : null;
    if (quadWithMap && quadWithMap.oldMapNumber != null) {
      const mapItemName = `Map #${quadWithMap.oldMapNumber}`;
      const leadsToLabel = (quadWithMap.oldMapLeadsTo || "treasure").charAt(0).toUpperCase() + (quadWithMap.oldMapLeadsTo || "").slice(1);
      const whoHasMap = [];
      try {
        for (const pc of party.characters) {
          const invColl = await DatabaseConnectionManager.getInventoryCollection(pc.name);
          const entry = await invColl.findOne({
            itemName: new RegExp(`^${mapItemName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
            quantity: { $gt: 0 }
          });
          if (entry) whoHasMap.push(pc.name);
        }
        if (whoHasMap.length > 0) {
          moveDescription += `\n\n🗺️ **Map location!** This area is marked on **${mapItemName}**. ${whoHasMap.join(", ")} ${whoHasMap.length === 1 ? "has" : "have"} the map — you've found the location of a **${leadsToLabel}**! More info: ${OLD_MAPS_LINK}`;
        }
      } catch (invErr) {
        console.warn("[explore.js] Could not check inventory for old map prompt:", invErr?.message || invErr);
      }
    }

    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Moved to ${newLocation.square} ${newLocation.quadrant}**`)
     .setColor(regionColors[party.region] || "#2196F3")
     .setDescription(moveDescription)
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
    addExplorationStandardFields(embed, {
      party,
      expeditionId,
      location: locationMove,
      nextCharacter: nextCharacterMove ?? null,
      showNextAndCommands: true,
      showRestSecureMove: false,
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
    const locationRetreat = `${party.square} ${party.quadrant} → ${villageLabel}`;
    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Retreat**`)
     .setColor(regionColors[party.region] || "#FF5722")
     .setDescription(
      `${character.name} ordered a retreat. All party members return to **${villageLabel}**.`
     )
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK);
    addExplorationStandardFields(embed, {
      party,
      expeditionId: party.partyId,
      location: locationRetreat,
      nextCharacter: null,
      showNextAndCommands: false,
      showRestSecureMove: false,
    });
    embed.addFields({
      name: "📦 **__Items Gathered__**",
      value:
       party.gatheredItems?.length > 0
        ? party.gatheredItems
           .map(
            (item) =>
             `${item.emoji} ${item.itemName} x${item.quantity} (${item.characterName})`
           )
           .join("\n")
        : "None",
      inline: false,
     });

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
     return interaction.editReply(
      `It is not your turn. Next turn: ${nextCharacter?.name || "Unknown"}`
     );
    }

    if (party.quadrantState !== "secured") {
     return interaction.editReply("You can only camp in secured quadrants.");
    }

    const recoveryPerMember = [];

    for (let i = 0; i < party.characters.length; i++) {
     const partyChar = party.characters[i];
     const char = await Character.findById(partyChar._id);
     if (char) {
      const staminaRecovered = Math.floor(Math.random() * 4) + 1;
      const heartsRecovered = Math.floor(Math.random() * 4) + 1;
      recoveryPerMember.push({ name: char.name, stamina: staminaRecovered, hearts: heartsRecovered });
      char.currentStamina = Math.min(char.maxStamina, char.currentStamina + staminaRecovered);
      char.currentHearts = Math.min(char.maxHearts, char.currentHearts + heartsRecovered);
      party.characters[i].currentStamina = char.currentStamina;
      party.characters[i].currentHearts = char.currentHearts;
      await char.save();
     }
    }
    party.totalStamina = party.characters.reduce((sum, c) => sum + (c.currentStamina ?? 0), 0);
    party.totalHearts = party.characters.reduce((sum, c) => sum + (c.currentHearts ?? 0), 0);

    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    const nextCharacterCamp = party.characters[party.currentTurn];
    const locationCamp = `${party.square} ${party.quadrant}`;
    const recoveryValue = recoveryPerMember
     .map((r) => `${r.name}: +${r.stamina} 🟩, +${r.hearts} ❤️`)
     .join("\n");
    const embed = new EmbedBuilder()
     .setTitle(`🗺️ **Expedition: Camp at ${locationCamp}**`)
     .setColor(regionColors[party.region] || "#4CAF50")
     .setDescription(
      `${character.name} set up camp. The party rested and recovered.`
     )
     .setImage(regionImages[party.region] || EXPLORATION_IMAGE_FALLBACK)
     .addFields({
      name: "📋 **__Recovery__**",
      value: recoveryValue,
      inline: false,
     });
    addExplorationStandardFields(embed, {
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
