const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { SlashCommandBuilder } = require("@discordjs/builders");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { fetchAllItems, fetchItemsByMonster } = require('@/database/db.js');
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
const {
 createExplorationItemEmbed,
 createExplorationMonsterEmbed,
 regionColors,
} = require("../../embeds/embeds.js");
const { handleAutocomplete } = require("../../handlers/autocompleteHandler.js");

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

function pushProgressLog(party, characterName, outcome, message) {
 if (!party.progressLog) party.progressLog = [];
 party.progressLog.push({
  at: new Date(),
  characterName: characterName || "Unknown",
  outcome,
  message: message || "",
 });
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
 const embed = new EmbedBuilder()
  .setTitle("💀 Expedition Failed — Party KO'd")
  .setColor(0x8b0000)
  .setDescription(
   "The party lost all hearts. The expedition has failed.\n\n" +
   "**Return:** Party is returned to the starting area for the region.\n" +
   "**Items:** All items brought on the expedition and any found during the expedition are lost.\n" +
   "**Party:** All members are KO'd with 0 stamina."
  )
  .addFields(
   { name: "📍 Returned to", value: `${start.square} ${start.quadrant} (${regionLabel} start)`, inline: true },
   { name: "🆔 Expedition ID", value: party.partyId, inline: true },
   { name: "❤️ Party Hearts", value: "0", inline: true },
   { name: "🟩 Party Stamina", value: "0", inline: true }
  );

 await interaction.editReply({ embeds: [embed] });
}

// Helper function for calculating new location
function calculateNewLocation(currentSquare, currentQuadrant, direction) {
 const quadrantMap = {
  Q1: { north: null, south: "Q3", east: "Q2", west: null },
  Q2: { north: null, south: "Q4", east: null, west: "Q1" },
  Q3: { north: "Q1", south: null, east: "Q4", west: null },
  Q4: { north: "Q2", south: null, east: null, west: "Q3" },
 };

 const currentQuadrantMoves = quadrantMap[currentQuadrant];
 if (!currentQuadrantMoves) return null;

 const newQuadrant = currentQuadrantMoves[direction];
 if (newQuadrant) {
  return { square: currentSquare, quadrant: newQuadrant };
 }

 return null;
}

// ------------------- Expedition Command Definition -------------------
module.exports = {
 data: new SlashCommandBuilder()
  .setName("explore")
  .setDescription("Manage exploration parties")
  .addSubcommand((subcommand) =>
   subcommand
    .setName("roll")
    .setDescription("Roll for an encounter (first time or again in same quadrant)")
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
      .setName("direction")
      .setDescription("Direction to move")
      .setRequired(true)
      .addChoices(
       { name: "North", value: "north" },
       { name: "South", value: "south" },
       { name: "East", value: "east" },
       { name: "West", value: "west" }
      )
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
    .addIntegerOption((option) =>
     option
      .setName("duration")
      .setDescription("Hours to camp (1-8)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(8)
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
     const expeditionId = interaction.options.getString("id");
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

    party.totalStamina -= staminaCost;
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
      pushProgressLog(party, character.name, "explored", `Explored the quadrant (${location}). Party can now Rest, Secure, Roll again, or Move.`);
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save();
      const nextCharacter = party.characters[party.currentTurn];
      const nextName = nextCharacter?.name || "Unknown";
      const embed = new EmbedBuilder()
       .setTitle(`🗺️ **Expedition: Quadrant Explored!**`)
       .setDescription(
        `**${character.name}** has explored this area (**${location}**). The party can now choose what to do next.`
       )
       .setColor(regionColors[party.region] || "#00ff99")
       .addFields(
        { name: "🆔 **__Expedition ID__**", value: expeditionId, inline: true },
        { name: "📍 **__Quadrant__**", value: location, inline: true },
        { name: "❤️ **__Party Hearts__**", value: `${party.totalHearts}`, inline: true },
        { name: "🟩 **__Party Stamina__**", value: `${party.totalStamina}`, inline: true },
        {
         name: "**What you can do next**",
         value:
          "• **Rest** (3 stamina) — `/explore rest` — heal all party hearts, revive KO'd\n• **Secure** quadrant — `/explore secure` (5 stamina + resources)\n• **Roll** again — `/explore roll` (1 stamina in same quadrant)\n• **Move** to next quadrant — `/explore move` (2 stamina)",
         inline: false,
        },
        {
         name: "➡️ **__What to do next__**",
         value: `**Next turn:** ${nextName}\n**Command:** Use \`/explore roll\` with **Expedition ID** \`${expeditionId}\` and **Character** \`${nextName}\` (or \`/explore rest\`, \`/explore secure\`, \`/explore move\` when it's your turn).`,
         inline: false,
        }
       );
      await interaction.editReply({ embeds: [embed] });
      return;
     }

     if (outcomeType === "chest" || outcomeType === "old_map" || outcomeType === "ruins" || outcomeType === "relic" || outcomeType === "camp" || outcomeType === "monster_camp" || outcomeType === "grotto") {
      const progressMessages = {
       chest: `Found a chest in ${location} (open for 1 stamina).`,
       old_map: `Found an old map in ${location}; take to Inariko Library to decipher.`,
       ruins: `Found ruins in ${location} (explore for 3 stamina or skip).`,
       relic: `Found a relic in ${location}; take to Artist/Researcher to appraise.`,
       camp: `Found a camp site in ${location}.`,
       monster_camp: `Found a monster camp in ${location}; report to town hall to mark on map.`,
       grotto: `Found a grotto in ${location} (cleanse for 1 plume + 1 stamina or mark for later).`,
      };
      pushProgressLog(party, character.name, outcomeType, progressMessages[outcomeType] || `Found something in ${location}.`);
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save();
      const nextCharacter = party.characters[party.currentTurn];
      const nextName = nextCharacter?.name || "Unknown";
      const nextTurnValue = `**Next turn:** ${nextName}\n**Command:** Use \`/explore roll\` with **Expedition ID** \`${expeditionId}\` and **Character** \`${nextName}\` to take your turn.`;

      let title, description;
      if (outcomeType === "monster_camp") {
       title = `🗺️ **Expedition: Monster Camp found!**`;
       description =
        `**${character.name}** found something unsettling in **${location}**.\n\n` +
        "Um....You found a Monster Camp of some kind....!!! But you aren't ready to face what's there. Report it back to the town hall to have it marked on the map for later.\n\n" +
        "↳ **Continue** ➾ Use `/explore roll` with this Expedition ID to take your turn.";
      } else if (outcomeType === "chest") {
       title = `🗺️ **Expedition: Chest found!**`;
       description =
        `**${character.name}** found a chest in **${location}**!\n\n` +
        "You found a chest! Use the chest flow to open it (cost 1 stamina).\n\n" +
        "↳ **Continue** ➾ Use `/explore roll` with this Expedition ID to take your turn.";
      } else if (outcomeType === "old_map") {
       title = `🗺️ **Expedition: Old map found!**`;
       description =
        `**${character.name}** discovered something unusual in **${location}**.\n\n` +
        "You found a really old map! You have no idea what you're looking at when you open it. Take it to the Inariko Library to get it deciphered. You can find out more info [here](https://www.rootsofthewild.com/oldmaps).\n\n" +
        "↳ **Continue** ➾ Use `/explore roll` with this Expedition ID to take your turn.";
      } else if (outcomeType === "ruins") {
       title = `🗺️ **Expedition: Ruins found!**`;
       description =
        `**${character.name}** found some ruins in **${location}**!\n\n` +
        "You found some ruins! Do you want to explore them?\n\n" +
        "**Yes** — Use the ruins flow when available (cost 3 stamina).\n" +
        "**No** — Continue exploring with `/explore roll`.";
      } else if (outcomeType === "relic") {
       title = `🗺️ **Expedition: Relic found!**`;
       description =
        `**${character.name}** found something ancient in **${location}**.\n\n` +
        "You found a relic! What is this? Take it to an Inarikian Artist or Researcher to get this appraised. You can find more info [here](https://www.rootsofthewild.com/relics).\n\n" +
        "↳ **Continue** ➾ Use `/explore roll` with this Expedition ID to take your turn.";
      } else if (outcomeType === "grotto") {
       title = `🗺️ **Expedition: Grotto found!**`;
       description =
        `**${character.name}** stumbled across something strange in **${location}**.\n\n` +
        "You stumble across an interesting looking stump with roots covered in talismans, do you have the means to cleanse them? More info about grottos can be found [here](https://www.rootsofthewild.com/grottos).\n\n" +
        "**Yes** — Use the grotto flow when available (cost 1 goddess plume + 1 stamina).\n" +
        "**No** (mark it on the map for later!) — Continue exploring with `/explore roll`.";
      } else {
       title = `🗺️ **Expedition: ${character.name} found a camp!**`;
       description = `**${character.name}** discovered a camp site in **${location}**.`;
      }

      const embed = new EmbedBuilder()
       .setTitle(title)
       .setDescription(description)
       .setColor(regionColors[party.region] || "#00ff99")
       .addFields(
        { name: "🆔 **__Expedition ID__**", value: expeditionId, inline: true },
        { name: "📍 **__Quadrant__**", value: location, inline: true },
        { name: "➡️ **__What to do next__**", value: nextTurnValue, inline: false }
       );

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

      const replyPayload = { embeds: [embed], components };
      const msg = await interaction.editReply(replyPayload);

      if (isYesNoChoice) {
       const collector = msg.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 5 * 60 * 1000,
        max: 1,
       });
       collector.on("collect", async (i) => {
        await i.deferUpdate();
        const isYes = i.customId.endsWith("_yes");
        const intro = description.split("\n\n")[0];
        const choiceEmbed = new EmbedBuilder()
         .setTitle(title)
         .setColor(regionColors[party.region] || "#00ff99")
         .addFields(
          { name: "🆔 **__Expedition ID__**", value: expeditionId, inline: true },
          { name: "📍 **__Quadrant__**", value: location, inline: true },
          { name: "➡️ **__What to do next__**", value: nextTurnValue, inline: false }
         );
        if (outcomeType === "ruins") {
         choiceEmbed.setDescription(
          intro +
          "\n\n" +
          (isYes
           ? "✅ **You chose to explore the ruins!** (Cost 3 stamina — ruins flow TBD.)"
           : "✅ **You left the ruins for later.** Continue with `/explore roll`.")
         );
        } else {
         choiceEmbed.setDescription(
          intro +
          "\n\n" +
          (isYes
           ? "✅ **You'll attempt to cleanse the grotto!** (Cost 1 goddess plume + 1 stamina — grotto flow TBD.)"
           : "✅ **You marked it on the map for later.** Continue with `/explore roll`.")
         );
        }
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
        await interaction.editReply({ embeds: [choiceEmbed], components: [disabledRow] });
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
         interaction.editReply({ components: [disabledRow] }).catch(() => {});
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

      const embed = createExplorationItemEmbed(
       party,
       character,
       selectedItem,
       expeditionId,
       location,
       party.totalHearts,
       party.totalStamina
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

      pushProgressLog(party, character.name, "item", `Found ${selectedItem.itemName} in ${location}.`);
      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save();

      const nextCharacter = party.characters[party.currentTurn];
      const nextName = nextCharacter?.name || "Unknown";
      embed.addFields({
       name: "➡️ **__What to do next__**",
       value: `**Next turn:** ${nextName}\n**Command:** Use \`/explore roll\` with **Expedition ID** \`${expeditionId}\` and **Character** \`${nextName}\` to take your turn.`,
       inline: false,
      });

      await interaction.editReply({ embeds: [embed] });

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

      if (selectedMonster.tier > 4) {
       try {
        const village = REGION_TO_VILLAGE[party.region?.toLowerCase()] || "Inariko";
        const raidResult = await triggerRaid(
         selectedMonster,
         interaction,
         village,
         false,
         character
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

        const embed = createExplorationMonsterEmbed(
         party,
         character,
         selectedMonster,
         expeditionId,
         location,
         party.totalHearts,
         party.totalStamina
        );

        embed.addFields(
         {
          name: `💙 __Monster Hearts__`,
          value: `${monsterHearts.current}/${monsterHearts.max}`,
          inline: true,
         },
         { name: "🆔 **__Raid ID__**", value: battleId, inline: true },
         {
          name: "🆔 **__Expedition ID__**",
          value: expeditionId || "Unknown",
          inline: true,
         },
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

        pushProgressLog(party, character.name, "raid", `Encountered ${selectedMonster.name} (tier ${selectedMonster.tier}) in ${location}. Raid started.`);
        party.currentTurn = (party.currentTurn + 1) % party.characters.length;
        await party.save();

        const nextCharacterRaid = party.characters[party.currentTurn];
        const nextNameRaid = nextCharacterRaid?.name || "Unknown";
        embed.addFields({
         name: "➡️ **__What to do next__**",
         value: `**Next turn:** ${nextNameRaid}\n**Command:** Use \`/explore roll\` with **Expedition ID** \`${expeditionId}\` and **Character** \`${nextNameRaid}\` to take your turn.`,
         inline: false,
        });

        await interaction.editReply({ embeds: [embed] });
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

       const embed = createExplorationMonsterEmbed(
        party,
        character,
        selectedMonster,
        expeditionId,
        location,
        party.totalHearts,
        party.totalStamina
      );

      embed.addFields(
        {
         name: `❤️ __${character.name} Hearts__`,
         value: `${character.currentHearts}/${character.maxHearts}`,
         inline: true,
        },
        {
         name: "🆔 **__Expedition ID__**",
         value: expeditionId || "Unknown",
         inline: true,
        },
        {
         name: "📍 **__Quadrant__**",
         value: location || "Unknown Location",
         inline: true,
        },
        { name: `⚔️ __Battle Outcome__`, value: outcome.result, inline: false }
       );

       if (outcome.canLoot) {
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

       const monsterMsg = outcome.hearts > 0
        ? `Fought ${selectedMonster.name} in ${location}. ${outcome.result}. Lost ${outcome.hearts} heart(s).${outcome.canLoot ? " Got loot." : ""}`
        : `Fought ${selectedMonster.name} in ${location}. ${outcome.result}.${outcome.canLoot ? " Got loot." : ""}`;
       pushProgressLog(party, character.name, "monster", monsterMsg);
       party.currentTurn = (party.currentTurn + 1) % party.characters.length;
       await party.save();

       const nextCharacterTier = party.characters[party.currentTurn];
       const nextNameTier = nextCharacterTier?.name || "Unknown";
       embed.addFields({
        name: "➡️ **__What to do next__**",
        value: `**Next turn:** ${nextNameTier}\n**Command:** Use \`/explore roll\` with **Expedition ID** \`${expeditionId}\` and **Character** \`${nextNameTier}\` to take your turn.`,
        inline: false,
       });

       await interaction.editReply({ embeds: [embed] });
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
    const expeditionId = interaction.options.getString("id");
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

    party.totalStamina -= staminaCost;

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
     `Rested at ${party.square} ${party.quadrant}. All party hearts healed.${revivedCount > 0 ? ` Revived ${revivedCount} KO'd member(s).` : ""} (-${staminaCost} stamina)`
    );
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    const nextNameRest = party.characters[party.currentTurn]?.name || "Unknown";
    const embed = new EmbedBuilder()
     .setTitle(`Rest at ${party.square} ${party.quadrant}`)
     .setColor("#4CAF50")
     .setDescription(
      `${character.name} rested. All party hearts healed.${revivedCount > 0 ? ` Revived ${revivedCount} KO'd member(s).` : ""} (-${staminaCost} party stamina)`
     )
     .addFields(
      { name: "❤️ **__Party Hearts__**", value: `${party.totalHearts}`, inline: true },
      { name: "🟩 **__Party Stamina__**", value: `${party.totalStamina}`, inline: true },
      {
       name: "➡️ **__What to do next__**",
       value: `**Next turn:** ${nextNameRest}\n**Command:** Use \`/explore roll\` with **Expedition ID** \`${expeditionId}\` and **Character** \`${nextNameRest}\` (or \`/explore rest\`, \`/explore secure\`, \`/explore move\` when it's your turn).`,
       inline: false,
      }
     );

    await interaction.editReply({ embeds: [embed] });

    // ------------------- Secure Quadrant Command -------------------
   } else if (subcommand === "secure") {
    const expeditionId = interaction.options.getString("id");
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
     return interaction.editReply(
      "Party needs Wood and Eldin Ore to secure this quadrant."
     );
    }

    party.totalStamina -= staminaCost;
    party.quadrantState = "secured";
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    const embed = new EmbedBuilder()
     .setTitle(`Secured ${party.square} ${party.quadrant}`)
     .setColor("#FF9800")
     .setDescription(
      `${character.name} secured the quadrant using resources (-${staminaCost} party stamina)`
     )
     .addFields(
      { name: "Quadrant Status", value: "Secured", inline: true },
      { name: "Party Stamina", value: `${party.totalStamina}`, inline: true },
      {
       name: "Benefits",
       value: "No stamina cost to explore, increased safety",
       inline: false,
      },
      {
       name: "Next Turn",
       value: party.characters[party.currentTurn]?.name || "Unknown",
       inline: true,
      }
     );

    await interaction.editReply({ embeds: [embed] });

    // ------------------- Move to Adjacent Quadrant -------------------
   } else if (subcommand === "move") {
    const expeditionId = interaction.options.getString("id");
    const characterName = interaction.options.getString("charactername");
    const direction = interaction.options.getString("direction");
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

    const newLocation = calculateNewLocation(
     currentSquare,
     currentQuadrant,
     direction
    );

    if (!newLocation) {
     return interaction.editReply(
      "Cannot move in that direction from current location."
     );
    }

    party.totalStamina -= staminaCost;
    party.square = newLocation.square;
    party.quadrant = newLocation.quadrant;
    party.quadrantState = "unexplored";
    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    const embed = new EmbedBuilder()
     .setTitle(
      `Moved ${direction.charAt(0).toUpperCase() + direction.slice(1)}`
     )
     .setColor("#2196F3")
     .setDescription(
      `${character.name} led the party to ${newLocation.square} ${newLocation.quadrant}`
     )
     .addFields(
      {
       name: "New Location",
       value: `${newLocation.square} ${newLocation.quadrant}`,
       inline: true,
      },
      { name: "Quadrant Status", value: "Unexplored", inline: true },
      { name: "Party Stamina", value: `${party.totalStamina}`, inline: true },
      {
       name: "Next Turn",
       value: party.characters[party.currentTurn]?.name || "Unknown",
       inline: true,
      }
     );

    await interaction.editReply({ embeds: [embed] });

    // ------------------- Use Item (healing from expedition loadout) -------------------
   } else if (subcommand === "item") {
    const expeditionId = interaction.options.getString("id");
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

    const embed = new EmbedBuilder()
     .setTitle(`Used item: ${carried.itemName}`)
     .setColor("#4CAF50")
     .setDescription(
      `${character.name} used **${carried.itemName}** (${effect}).`
     )
     .addFields(
      {
       name: `${character.name} Hearts`,
       value: `${character.currentHearts}/${character.maxHearts}`,
       inline: true,
      },
      {
       name: `${character.name} Stamina`,
       value: `${character.currentStamina}/${character.maxStamina}`,
       inline: true,
      },
      { name: "Party Hearts", value: `${party.totalHearts}`, inline: true },
      { name: "Party Stamina", value: `${party.totalStamina}`, inline: true }
     );

    await interaction.editReply({ embeds: [embed] });

    // ------------------- Retreat to Village -------------------
   } else if (subcommand === "retreat") {
    const expeditionId = interaction.options.getString("id");
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

    const embed = new EmbedBuilder()
     .setTitle("Expedition Retreat")
     .setColor("#FF5722")
     .setDescription(
      `${character.name} ordered a retreat. All party members return to ${
       targetVillage.charAt(0).toUpperCase() + targetVillage.slice(1)
      }.`
     )
     .addFields({
      name: "Items Gathered",
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
    const expeditionId = interaction.options.getString("id");
    const characterName = interaction.options.getString("charactername");
    const duration = interaction.options.getInteger("duration");
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

    const staminaPerHour = 2;
    const heartsPerHour = 1;
    const totalStaminaRecovered = duration * staminaPerHour;
    const totalHeartsRecovered = duration * heartsPerHour;

    for (const partyChar of party.characters) {
     const char = await Character.findById(partyChar._id);
     if (char) {
      char.currentStamina = Math.min(
       char.maxStamina,
       char.currentStamina +
        Math.floor(totalStaminaRecovered / party.characters.length)
      );
      char.currentHearts = Math.min(
       char.maxHearts,
       char.currentHearts +
        Math.floor(totalHeartsRecovered / party.characters.length)
      );
      await char.save();
     }
    }

    const updatedCharacters = await Character.find({
     _id: { $in: party.characters.map((char) => char._id) },
    });

    party.totalStamina = updatedCharacters.reduce(
     (total, char) => total + char.currentStamina,
     0
    );
    party.totalHearts = updatedCharacters.reduce(
     (total, char) => total + char.currentHearts,
     0
    );

    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    const embed = new EmbedBuilder()
     .setTitle(`Camp at ${party.square} ${party.quadrant}`)
     .setColor("#4CAF50")
     .setDescription(
      `${character.name} set up camp for ${duration} hours. The party rested and recovered.`
     )
     .addFields(
      {
       name: "Recovery",
       value: `+${Math.floor(
        totalStaminaRecovered / party.characters.length
       )} stamina, +${Math.floor(
        totalHeartsRecovered / party.characters.length
       )} hearts per member`,
       inline: false,
      },
      { name: "Party Stamina", value: `${party.totalStamina}`, inline: true },
      { name: "Party Hearts", value: `${party.totalHearts}`, inline: true },
      {
       name: "Next Turn",
       value: party.characters[party.currentTurn]?.name || "Unknown",
       inline: true,
      }
     );

    await interaction.editReply({ embeds: [embed] });
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
