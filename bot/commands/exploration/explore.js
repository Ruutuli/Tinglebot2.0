const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { SlashCommandBuilder } = require("@discordjs/builders");
const { EmbedBuilder } = require("discord.js");
const { fetchAllItems, fetchItemsByMonster } = require('@/database/db.js');
const {
 calculateFinalValue,
 getMonstersByRegion,
} = require("../../modules/rngModule.js");
const { getEncounterOutcome } = require("../../modules/encounterModule.js");
const {
 storeRaidProgress,
 getRaidProgressById,
} = require("../../modules/raidModule.js");
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
} = require("../../embeds/embeds.js");
const { generateUniqueId } = require("../../utils/uniqueIdUtils.js");

// ------------------- Utility Functions -------------------

const regionColors = {
 eldin: "#FF0000",
 lanayru: "#0000FF",
 faron: "#008000",
 central_hyrule: "#00FFFF",
 gerudo: "#FFA500",
 hebra: "#800080",
};
const regionImage =
 "https://storage.googleapis.com/tinglebot/Graphics/border.png";

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
    .setName("setup")
    .setDescription("Setup a new exploration party")
    .addStringOption((option) =>
     option
      .setName("region")
      .setDescription("Select the region for exploration")
      .setRequired(true)
      .addChoices(
       { name: "Eldin", value: "eldin" },
       { name: "Lanayru", value: "lanayru" },
       { name: "Faron", value: "faron" }
      )
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("join")
    .setDescription("Join an expedition party")
    .addStringOption((option) =>
     option
      .setName("id")
      .setDescription("Expedition ID to join")
      .setRequired(true)
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
      .setName("item1")
      .setDescription("First item")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("item2")
      .setDescription("Second item")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("item3")
      .setDescription("Third item")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("start")
    .setDescription("Start the expedition")
    .addStringOption((option) =>
     option
      .setName("id")
      .setDescription("Expedition ID to start")
      .setRequired(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("roll")
    .setDescription("Roll for a random encounter")
    .addStringOption((option) =>
     option.setName("id").setDescription("Expedition ID").setRequired(true)
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
    .setDescription("Rest at current location to recover stamina")
    .addStringOption((option) =>
     option.setName("id").setDescription("Expedition ID").setRequired(true)
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
     option.setName("id").setDescription("Expedition ID").setRequired(true)
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
    .setName("continue")
    .setDescription("Continue exploring the same quadrant")
    .addStringOption((option) =>
     option.setName("id").setDescription("Expedition ID").setRequired(true)
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
     option.setName("id").setDescription("Expedition ID").setRequired(true)
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
    .setName("retreat")
    .setDescription("Return to starting village")
    .addStringOption((option) =>
     option.setName("id").setDescription("Expedition ID").setRequired(true)
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
     option.setName("id").setDescription("Expedition ID").setRequired(true)
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

   // ------------------- Expedition Setup -------------------
   if (subcommand === "setup") {
    const region = interaction.options.getString("region");
    const startPoints = {
     lanayru: { square: "G4", quadrant: "Q2" },
     eldin: { square: "D3", quadrant: "Q3" },
     faron: { square: "H6", quadrant: "Q4" },
    };
    const startPoint = startPoints[region];
    const partyId = generateUniqueId("E");

    const party = new Party({
     leaderId: interaction.user.id,
     region,
     square: startPoint.square,
     quadrant: startPoint.quadrant,
     partyId,
     characters: [],
     status: "open",
     currentTurn: 0,
     totalStamina: 0,
     totalHearts: 0,
     gatheredItems: [],
     quadrantState: "unexplored",
    });
    await party.save();

    const embed = new EmbedBuilder()
     .setTitle(
      `🗺️ **Expedition Started in ${
       region.charAt(0).toUpperCase() + region.slice(1)
      }!**`
     )
     .setColor(regionColors[region] || "#00ff99")
     .setImage(regionImage)
     .setDescription(
      `**${interaction.user.tag}** is leading an expedition in the **${
       region.charAt(0).toUpperCase() + region.slice(1)
      }** region! 🎉\n\n`
     )
     .addFields(
      { name: "🆔 **__Expedition ID__**", value: partyId, inline: true },
      {
       name: "📍 **__Starting Location__**",
       value: `${startPoint.square} ${startPoint.quadrant}`,
       inline: true,
      },
      {
       name: "⏱️ **__Join the Expedition__**",
       value: `You have **15 minutes** to join!\n\n**To join, use:**\n\`\`\`\n/explore join id:${partyId} charactername: item1: item2: item3:\n\`\`\``,
       inline: false,
      },
      {
       name: "✨ **__Get Ready__**",
       value: `Once ready, use the following to start:\n\`\`\`\n/explore start id:${partyId}\n\`\`\``,
       inline: false,
      }
     )
     .setFooter({ text: "🧭 Happy exploring!" });

    const message = await interaction.reply({
     embeds: [embed],
     fetchReply: true,
    });
    party.messageId = message.id;
    await party.save();

    // ------------------- Join Expedition -------------------
   } else if (subcommand === "join") {
    const expeditionId = interaction.options.getString("id");
    const characterName = interaction.options.getString("charactername");
    const itemNames = [
     interaction.options.getString("item1").split(" - ")[0],
     interaction.options.getString("item2").split(" - ")[0],
     interaction.options.getString("item3").split(" - ")[0],
    ];
    const userId = interaction.user.id;

    const party = await Party.findOne({ partyId: expeditionId }).lean();
    const character = await Character.findOne({ name: characterName, userId });

    if (!party || !character) {
     return interaction.reply("Expedition ID or character not found.");
    }

    if (party.status !== "open") {
     return interaction.reply("This expedition has already started.");
    }

    if (party.characters.length >= 4) {
     return interaction.reply(
      "This expedition already has the maximum number of participants (4)."
     );
    }

    const hasCharacterInParty = party.characters.some(
     (char) => char.userId === userId
    );

    if (hasCharacterInParty) {
     return interaction.reply(
      "You already have a character in this expedition."
     );
    }

    if (await enforceJail(interaction, character)) {
     return;
    }

    try {
     await checkInventorySync(character);
    } catch (error) {
     await interaction.reply({
      content: error.message,
      ephemeral: true,
     });
     return;
    }

    const regionToVillage = {
     eldin: "rudania",
     lanayru: "inariko",
     faron: "vhintl",
    };

    const requiredVillage = regionToVillage[party.region];
    if (character.currentVillage.toLowerCase() !== requiredVillage) {
     return interaction.reply(
      `Your character must be in ${
       requiredVillage.charAt(0).toUpperCase() + requiredVillage.slice(1)
      } to join this expedition.`
     );
    }

    if (!character.name || typeof character.name !== "string") {
     console.error(
      `[ERROR] Character name is invalid or undefined for Character ID: ${character._id}`
     );
     return interaction.reply(
      "**Character name is invalid or missing. Please check your character settings.**"
     );
    }

    if (!character.icon || !character.icon.startsWith("http")) {
     console.warn(
      `[WARN] Character icon is invalid or undefined for Character ID: ${character._id}. Defaulting to placeholder.`
     );
     character.icon = "https://via.placeholder.com/100";
    }

    const items = [];
    for (const itemName of itemNames) {
     const foundItems = await ItemModel.find({
      itemName: itemName,
      categoryGear: { $nin: ["Weapon", "Armor"] },
      $and: [
       {
        $or: [
         { modifierHearts: { $gt: 0 } },
         { staminaRecovered: { $gt: 0 } },
         { itemName: "Eldin Ore" },
         { itemName: "Wood" },
        ],
       },
       {
        $or: [
         { itemName: "Eldin Ore" },
         { itemName: "Wood" },
         { crafting: true },
         { itemName: /Fairy/i },
        ],
       },
      ],
     })
      .lean()
      .exec();
     if (foundItems.length > 0) {
      items.push(foundItems[0]);
     }
    }

    if (items.length < 3) {
     return interaction.reply(
      "Invalid items selected. Please ensure you have 3 valid exploration items."
     );
    }

    const characterData = {
     _id: character._id,
     userId: character.userId,
     name: character.name,
     currentHearts: character.currentHearts,
     currentStamina: character.currentStamina,
     icon: character.icon,
     items: items.map((item) => ({
      itemName: item.itemName,
      modifierHearts: item.modifierHearts || 0,
      staminaRecovered: item.staminaRecovered || 0,
      emoji: item.emoji || "🔹",
     })),
    };

    await Party.updateOne(
     { partyId: expeditionId },
     {
      $push: { characters: characterData },
      $inc: {
       totalHearts: character.currentHearts,
       totalStamina: character.currentStamina,
      },
     }
    );

    const updatedParty = await Party.findOne({ partyId: expeditionId });

    let totalHearts = 0;
    let totalStamina = 0;
    const membersFields = updatedParty.characters.map((char) => {
     totalHearts += char.currentHearts || 0;
     totalStamina += char.currentStamina || 0;

     const charItems = char.items
      .map(
       (item) =>
        `${item.emoji || "🔹"} ${item.itemName} - Heals ${
         item.modifierHearts || 0
        } ❤️ | ${item.staminaRecovered || 0} 🟩`
      )
      .join("\n");

     return {
      name: `🔹 __**${char.name}**__ ❤️ ${char.currentHearts || 0} | 🟩 ${
       char.currentStamina || 0
      }`,
      value: `>>> ${charItems}\n`,
      inline: false,
     };
    });

    const embedFields = [
     { name: "🆔 **__Expedition ID__**", value: expeditionId, inline: true },
     {
      name: "📍 **__Starting Location__**",
      value: `${updatedParty.square} ${updatedParty.quadrant}`,
      inline: true,
     },
     { name: "\u200B", value: "\u200B", inline: true },
     { name: "❤️ **__Party Hearts__**", value: `${totalHearts}`, inline: true },
     {
      name: "🟩 **__Party Stamina__**",
      value: `${totalStamina}`,
      inline: true,
     },
     { name: "\u200B", value: "\u200B", inline: true },
     { name: "\u200B", value: `\`\`\`\n          \n\`\`\``, inline: false },
     ...membersFields,
    ];

    if (updatedParty.characters.length < 4) {
     embedFields.push({
      name: "⏱️ **__Join the Expedition__**",
      value: `Use the command below until 4 members join or expedition starts:\n\`\`\`\n/explore join id:${expeditionId} charactername: item1: item2: item3:\n\`\`\``,
      inline: false,
     });
    }

    embedFields.push({
     name: "✨ **__Get Ready__**",
     value: `Once ready, use the following to start:\n\`\`\`\n/explore start id:${expeditionId}\n\`\`\``,
     inline: false,
    });

    const updatedEmbed = new EmbedBuilder()
     .setTitle(
      `🗺️ **Expedition in ${
       updatedParty.region.charAt(0).toUpperCase() +
       updatedParty.region.slice(1)
      }**`
     )
     .setColor(regionColors[updatedParty.region] || "#00ff99")
     .setImage(regionImage)
     .setDescription(
      `**${interaction.user.tag}** is leading an expedition in the **${
       updatedParty.region.charAt(0).toUpperCase() +
       updatedParty.region.slice(1)
      }** region! 🎉\n\n`
     )
     .addFields(embedFields)
     .setFooter({ text: "🧭 Happy exploring!" });

    try {
     const originalMessage = await interaction.channel.messages.fetch(
      updatedParty.messageId
     );
     await originalMessage.edit({ embeds: [updatedEmbed] });
     await interaction.reply({
      content: `${characterName} has joined the expedition with their items!`,
      ephemeral: true,
     });
    } catch (error) {
     handleInteractionError(error, interaction, { source: "explore.js" });
     await interaction.reply({
      content: `${characterName} has joined the expedition, but I could not update the original message.`,
      ephemeral: true,
     });
    }

    // ------------------- Start Expedition -------------------
   } else if (subcommand === "start") {
    const expeditionId = interaction.options.getString("id");
    const party = await Party.findOne({ partyId: expeditionId });

    if (!party) {
     return interaction.reply("Expedition ID not found.");
    }

    if (party.status !== "open") {
     return interaction.reply("This expedition has already started.");
    }

    if (party.characters.length === 0) {
     return interaction.reply(
      "Cannot start an expedition with no participants."
     );
    }

    if (interaction.user.id !== party.leaderId) {
     return interaction.reply(
      "Only the expedition leader can start the expedition."
     );
    }

    let leaderIndex = party.characters.findIndex(
     (char) => char.name === interaction.options.getString("charactername")
    );

    if (leaderIndex === -1) {
     const userCharacters = await Character.find({
      userId: interaction.user.id,
     }).lean();
     const userCharacterNames = userCharacters.map((char) => char.name);

     leaderIndex = party.characters.findIndex((char) =>
      userCharacterNames.includes(char.name)
     );
    }

    party.currentTurn = leaderIndex !== -1 ? leaderIndex : 0;
    party.status = "started";
    await party.save();
    try {
     const originalMessage = await interaction.channel.messages.fetch(
      party.messageId
     );

     let totalHearts = 0;
     let totalStamina = 0;

     const membersFields = party.characters.map((char) => {
      totalHearts += char.currentHearts || 0;
      totalStamina += char.currentStamina || 0;

      const charItems = char.items
       .map(
        (item) =>
         `${item.emoji || "🔹"} ${item.itemName} - Heals ${
          item.modifierHearts || 0
         } ❤️ | ${item.staminaRecovered || 0} 🟩`
       )
       .join("\n");

      return {
       name: `🔹 __**${char.name}**__ ❤️ ${char.currentHearts || 0} | 🟩 ${
        char.currentStamina || 0
       }`,
       value: `>>> ${charItems}\n`,
       inline: false,
      };
     });

     const startedEmbed = new EmbedBuilder()
      .setTitle(
       `🗺️ **Expedition Started in ${
        party.region.charAt(0).toUpperCase() + party.region.slice(1)
       }!**`
      )
      .setColor(regionColors[party.region] || "#00ff99")
      .setImage(regionImage)
      .setDescription(
       `**${
        interaction.user.tag
       }** has officially started the expedition in the **${
        party.region.charAt(0).toUpperCase() + party.region.slice(1)
       }** region! 🚀\n\n`
      )
      .addFields(
       { name: "🆔 **__Expedition ID__**", value: expeditionId, inline: true },
       {
        name: "📍 **__Starting Location__**",
        value: `${party.square} ${party.quadrant}`,
        inline: true,
       },
       {
        name: "📋 **__Quadrant State__**",
        value: `${party.quadrantState || "unexplored"}`,
        inline: true,
       },
       {
        name: "❤️ **__Party Hearts__**",
        value: `${totalHearts}`,
        inline: true,
       },
       {
        name: "🟩 **__Party Stamina__**",
        value: `${totalStamina}`,
        inline: true,
       },
       {
        name: "🎮 **__Next Turn__**",
        value: party.characters[0]?.name || "Unknown",
        inline: true,
       },
       { name: "\u200B", value: `\`\`\`\n          \n\`\`\``, inline: false },
       ...membersFields
      )
      .setFooter({ text: "🧭 Adventure awaits!" });

     await originalMessage.edit({ embeds: [startedEmbed] });
     await interaction.reply({
      content: `Expedition started! Use \`/explore roll id:${expeditionId} charactername:${
       party.characters[0]?.name || "<character_name>"
      }\` to begin!`,
      ephemeral: false,
     });
    } catch (error) {
     handleInteractionError(error, interaction, { source: "explore.js" });
     await interaction.reply({
      content: `Expedition started, but I could not update the original message. Use \`/explore roll id:${expeditionId} charactername:<character_name>\` to begin!`,
      ephemeral: false,
     });
    }

    // ------------------- Roll for Encounter -------------------
   } else if (subcommand === "roll") {
    try {
     await interaction.deferReply();

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

     const encounterType = Math.random() < 0.7 ? "monster" : "item";
     const location = `${party.square} ${party.quadrant}`;

     if (encounterType === "item") {
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
       party.totalStamina,
       party.characters
        .flatMap((char) => char.items)
        .map((item) => `${item.emoji || "🔹"} ${item.itemName}`)
        .join(", ")
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

      const exploreChance = Math.random();
      if (exploreChance > 0.7 || party.quadrantState !== "unexplored") {
       party.quadrantState = "explored";

       embed.addFields({
        name: "Quadrant Explored!",
        value:
         "You have successfully explored this quadrant. You can now:\n- Rest (3 stamina)\n- Secure Quadrant (5 stamina + resources)\n- Continue to next quadrant (2 stamina)",
        inline: false,
       });
      }

      party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      await party.save();

      embed.addFields({
       name: "🎮 **__Next Turn__**",
       value: party.characters[party.currentTurn]?.name || "Unknown",
       inline: true,
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
     } else if (encounterType === "monster") {
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
       const battleId = Date.now().toString();

       const monsterHearts = {
        max: selectedMonster.hearts,
        current: selectedMonster.hearts,
       };

       await storeRaidProgress(
        character,
        selectedMonster,
        selectedMonster.tier,
        monsterHearts,
        `Raid started: ${character.name} vs ${selectedMonster.name}`
       );

       try {
        const raidResult = await triggerRaid(
         selectedMonster,
         interaction,
         null,
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

        await new Promise((resolve) => setTimeout(resolve, 2000));

        const battleProgress = await getRaidProgressById(battleId);
        if (!battleProgress) {
         console.error(
          `[ERROR] No battle progress found for Battle ID: ${battleId}`
         );
         await interaction.editReply(
          "**An error occurred retrieving raid progress.**"
         );
         return;
        }

        const monsterDefeated = battleProgress.monsterHearts?.current === 0;

        const embed = createExplorationMonsterEmbed(
         party,
         character,
         selectedMonster,
         expeditionId,
         location,
         party.totalHearts,
         party.totalStamina,
         party.characters
          .flatMap((char) => char.items)
          .map((item) => `${item.emoji || "🔹"} ${item.itemName}`)
          .join(", ")
        );

        embed.addFields(
         {
          name: `💙 __Monster Hearts__`,
          value: `${battleProgress.monsterHearts.current}/${battleProgress.monsterHearts.max}`,
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

         const exploreChance = Math.random();
         if (exploreChance > 0.3 || party.quadrantState !== "unexplored") {
          party.quadrantState = "explored";
          embed.addFields({
           name: "Quadrant Explored!",
           value:
            "You have successfully explored this quadrant. You can now:\n- Rest (3 stamina)\n- Secure Quadrant (5 stamina + resources)\n- Continue to next quadrant (2 stamina)",
           inline: false,
          });
         }
        }

        party.currentTurn = (party.currentTurn + 1) % party.characters.length;
        await party.save();

        embed.addFields({
         name: "🎮 **__Next Turn__**",
         value: party.characters[party.currentTurn]?.name || "Unknown",
         inline: true,
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
       }

       const embed = createExplorationMonsterEmbed(
        party,
        character,
        selectedMonster,
        expeditionId,
        location,
        party.totalHearts,
        party.totalStamina,
        party.characters
         .flatMap((char) => char.items)
         .map((item) => `${item.emoji || "🔹"} ${item.itemName}`)
         .join(", ")
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
         name: "📍 **__Current Location__**",
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

        const exploreChance = Math.random();
        if (exploreChance > 0.3 || party.quadrantState !== "unexplored") {
         party.quadrantState = "explored";
         embed.addFields({
          name: "Quadrant Explored!",
          value:
           "You have successfully explored this quadrant. You can now:\n- Rest (3 stamina)\n- Secure Quadrant (5 stamina + resources)\n- Continue to next quadrant (2 stamina)",
          inline: false,
         });
        }
       }

       party.currentTurn = (party.currentTurn + 1) % party.characters.length;
       await party.save();

       embed.addFields({
        name: "🎮 **__Next Turn__**",
        value: party.characters[party.currentTurn]?.name || "Unknown",
        inline: true,
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
    const staminaRecovered = Math.min(
     5,
     character.maxStamina - character.currentStamina
    );
    character.currentStamina = Math.min(
     character.maxStamina,
     character.currentStamina + staminaRecovered
    );
    await character.save();

    party.totalStamina = party.characters.reduce((total, char) => {
     if (char.name === character.name) {
      char.currentStamina = character.currentStamina;
      return total + character.currentStamina;
     }
     return total + char.currentStamina;
    }, 0);

    party.currentTurn = (party.currentTurn + 1) % party.characters.length;
    await party.save();

    const embed = new EmbedBuilder()
     .setTitle(`Rest at ${party.square} ${party.quadrant}`)
     .setColor("#4CAF50")
     .setDescription(
      `${character.name} rested and recovered ${staminaRecovered} stamina (-${staminaCost} party stamina)`
     )
     .addFields(
      {
       name: "Character Stamina",
       value: `${character.currentStamina}/${character.maxStamina}`,
       inline: true,
      },
      { name: "Party Stamina", value: `${party.totalStamina}`, inline: true },
      {
       name: "Next Turn",
       value: party.characters[party.currentTurn]?.name || "Unknown",
       inline: true,
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

    // ------------------- Continue Same Quadrant -------------------
   } else if (subcommand === "continue") {
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

    if (party.quadrantState === "unexplored") {
     return interaction.editReply(
      "You must explore this quadrant first using /explore roll."
     );
    }

    const staminaCost = party.quadrantState === "secured" ? 0 : 1;
    if (party.totalStamina < staminaCost) {
     return interaction.editReply(
      `Not enough party stamina! Required: ${staminaCost}, Available: ${party.totalStamina}`
     );
    }

    party.totalStamina -= staminaCost;
    await party.save();

    const encounterType = Math.random() < 0.7 ? "monster" : "item";
    const location = `${party.square} ${party.quadrant}`;

    if (encounterType === "item") {
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
      party.totalStamina,
      party.characters
       .flatMap((char) => char.items)
       .map((item) => `${item.emoji || ""} ${item.itemName}`)
       .join(", ")
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

     party.currentTurn = (party.currentTurn + 1) % party.characters.length;
     await party.save();

     embed.addFields({
      name: "Next Turn",
      value: party.characters[party.currentTurn]?.name || "Unknown",
      inline: true,
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
      console.error(`Could not add item to inventory: ${error.message}`);
     }
    } else {
     const monsters = await getMonstersByRegion(party.region.toLowerCase());
     if (!monsters || monsters.length === 0) {
      return interaction.editReply("No monsters available for this region.");
     }

     const selectedMonster =
      monsters[Math.floor(Math.random() * monsters.length)];

     const diceRoll = Math.floor(Math.random() * 100) + 1;
     const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } =
      calculateFinalValue(character, diceRoll);
     const outcome = await getEncounterOutcome(
      character,
      selectedMonster,
      damageValue,
      adjustedRandomValue,
      attackSuccess,
      defenseSuccess
     );

     // ------------------- Elixir Consumption Logic -------------------
     // Check if elixirs should be consumed based on the exploration encounter
     try {
       const { shouldConsumeElixir, consumeElixirBuff, getActiveBuffEffects } = require('../../modules/elixirModule');
       
       // Check for active elixir buffs before consumption
       const activeBuff = getActiveBuffEffects(character);
       if (activeBuff) {
         console.log(`[explore.js]: 🧪 ${character.name} has active elixir buff: ${character.buff.type}`);
         
         // Log specific elixir effects that might help
         if (activeBuff.fireResistance > 0 && selectedMonster.name.includes('Fire')) {
           console.log(`[explore.js]: 🔥 Fireproof Elixir active! ${character.name} has +${activeBuff.fireResistance} fire resistance against ${selectedMonster.name}`);
         }
         if (activeBuff.coldResistance > 0 && selectedMonster.name.includes('Ice')) {
           console.log(`[explore.js]: ❄️ Spicy Elixir active! ${character.name} has +${activeBuff.coldResistance} cold resistance against ${selectedMonster.name}`);
         }
         if (activeBuff.electricResistance > 0 && selectedMonster.name.includes('Electric')) {
           console.log(`[explore.js]: ⚡ Electro Elixir active! ${character.name} has +${activeBuff.electricResistance} electric resistance against ${selectedMonster.name}`);
         }
         if (activeBuff.defenseBoost > 0) {
           console.log(`[explore.js]: 🛡️ Tough Elixir active! ${character.name} has +${activeBuff.defenseBoost} defense boost`);
         }
         if (activeBuff.attackBoost > 0) {
           console.log(`[explore.js]: ⚔️ Mighty Elixir active! ${character.name} has +${activeBuff.attackBoost} attack boost`);
         }
       }
       
       if (shouldConsumeElixir(character, 'combat', { monster: selectedMonster })) {
         const consumedElixirType = character.buff.type;
         
         console.log(`[explore.js]: 🧪 Elixir consumed for ${character.name} during exploration encounter with ${selectedMonster.name}`);
   
         
         // Log what the elixir protected against
         if (consumedElixirType === 'fireproof' && selectedMonster.name.includes('Fire')) {
           console.log(`[explore.js]: 🔥 Fireproof Elixir protected ${character.name} from fire damage during encounter with ${selectedMonster.name}`);
         } else if (consumedElixirType === 'spicy' && selectedMonster.name.includes('Ice')) {
           console.log(`[explore.js]: ❄️ Spicy Elixir protected ${character.name} from ice damage during encounter with ${selectedMonster.name}`);
         } else if (consumedElixirType === 'electro' && selectedMonster.name.includes('Electric')) {
           console.log(`[explore.js]: ⚡ Electro Elixir protected ${character.name} from electric damage during encounter with ${selectedMonster.name}`);
         } else if (consumedElixirType === 'tough') {
           console.log(`[explore.js]: 🛡️ Tough Elixir provided defense boost for ${character.name} during encounter`);
         } else if (consumedElixirType === 'mighty') {
           console.log(`[explore.js]: ⚔️ Mighty Elixir provided attack boost for ${character.name} during encounter`);
         }
         
         consumeElixirBuff(character);
         
         // Update character in database to persist the consumed elixir
         await character.save();
       } else if (character.buff?.active) {
         // Log when elixir is not used due to conditions not met
         console.log(`[explore.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
       }
     } catch (elixirError) {
       console.error(`[explore.js]: ⚠️ Warning - Elixir consumption failed:`, elixirError);
       // Don't fail the exploration if elixir consumption fails
     }

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
     }

     const embed = createExplorationMonsterEmbed(
      party,
      character,
      selectedMonster,
      expeditionId,
      location,
      party.totalHearts,
      party.totalStamina,
      party.characters
       .flatMap((char) => char.items)
       .map((item) => `${item.emoji || ""} ${item.itemName}`)
       .join(", ")
     );

     embed.addFields(
      {
       name: "Hearts",
       value: `${character.currentHearts}/${character.maxHearts}`,
       inline: true,
      },
      { name: "Battle Outcome", value: outcome.result, inline: false }
     );

     if (outcome.canLoot) {
      const items = await fetchItemsByMonster(selectedMonster.name);
      const lootedItem =
       items.length > 0
        ? items[Math.floor(Math.random() * items.length)]
        : null;

      if (lootedItem) {
       embed.addFields({
        name: "Loot Found",
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

     party.currentTurn = (party.currentTurn + 1) % party.characters.length;
     await party.save();

     embed.addFields({
      name: "Next Turn",
      value: party.characters[party.currentTurn]?.name || "Unknown",
      inline: true,
     });

     await interaction.editReply({ embeds: [embed] });
    }

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
};
