// ============================================================================
// Standard Libraries
// ============================================================================
// (No built‑in Node.js modules needed in this file)

// ============================================================================
// Discord.js Components
// ============================================================================
// ------------------- Slash Command Builder & Permissions -------------------
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// ============================================================================
// Utility Functions
// ============================================================================
// ------------------- Global Error Handler -------------------
const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Inventory Utilities -------------------
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');

// ============================================================================
// Database Services
// ============================================================================
// ------------------- Character Service -------------------
const {
  fetchCharacterByName,
  fetchCharacterByNameAndUserId,
  updatePetToCharacter,
} = require('../database/characterService');
// ------------------- Item Service -------------------
const { fetchItemByName } = require('../database/itemService');

// ============================================================================
// Database Models
// ============================================================================
// ------------------- Pet Model -------------------
const Pet = require('../models/PetModel');

// ============================================================================
// Slash Command Definition
// ============================================================================
// ------------------- /mod Command with Subcommands -------------------
// Provides admin utilities to give items or override pet levels.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🛠️ Admin utilities: give items or override pet levels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // Subcommand: give an item to a character
    .addSubcommand((sub) =>
      sub
        .setName('give')
        .setDescription('🎁 Give an item to a character')
        .addStringOption((opt) =>
          opt
            .setName('character')
            .setDescription('Name of the target character')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('item')
            .setDescription('Name of the item to give')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName('quantity')
            .setDescription('Amount of the item to give')
            .setRequired(true)
        )
    )

    // Subcommand: override a pet's level for a character
    .addSubcommand((sub) =>
      sub
        .setName('petlevel')
        .setDescription("🐾 Override a pet's level for a character")
        .addStringOption((opt) =>
          opt
            .setName('character')
            .setDescription('Name of the character owner')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('petname')
            .setDescription("Name of the pet to override")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName('level')
            .setDescription('New level value for the pet')
            .setRequired(true)
        )
    ),

  // ========================================================================
  // Command Execution Handler
  // ========================================================================
  async execute(interaction) {
    try {
      // ------------------- Acknowledge Interaction -------------------
      await interaction.deferReply({ ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      // ======================================================================
      // Give Item to Character
      // ======================================================================
      if (subcommand === 'give') {
        // ------------------- Parse & Validate Options -------------------
        const userId = interaction.user.id;
        const charName = interaction.options.getString('character');
        const itemName = interaction.options.getString('item');
        const quantity = interaction.options.getInteger('quantity');

        if (quantity < 1) {
          return interaction.editReply(
            '❌ You must specify a quantity of at least **1**.'
          );
        }

        // ------------------- Fetch Character & Item -------------------
        const character = await fetchCharacterByNameAndUserId(
          charName,
          userId
        );
        if (!character) {
          return interaction.editReply(
            `❌ Character **${charName}** not found for your account.`
          );
        }

        const item = await fetchItemByName(itemName);
        if (!item) {
          return interaction.editReply(
            `❌ Item **${itemName}** does not exist.`
          );
        }

        // ------------------- Apply Inventory Update -------------------
        await addItemInventoryDatabase(
          character._id,
          itemName,
          quantity,
          interaction,
          'Admin Give'
        );

        return interaction.editReply(
          `✅ Successfully gave **${quantity}× ${itemName}** to **${character.name}**.`
        );
      }

      // ======================================================================
      // Override Pet Level
      // ======================================================================
      if (subcommand === 'petlevel') {
        // ------------------- Parse Options -------------------
        const charName = interaction.options.getString('character');
        const petName = interaction.options.getString('petname');
        const newLevel = interaction.options.getInteger('level');

        // ------------------- Fetch Character -------------------
        const character = await fetchCharacterByName(charName);
        if (!character) {
          return interaction.editReply(
            `❌ Character **${charName}** not found in database.`
          );
        }

        // ------------------- Fetch & Update Pet -------------------
        const petDoc = await Pet.findOne({
          owner: character._id,
          name: petName,
        });
        if (!petDoc) {
          return interaction.editReply(
            `❌ Pet **${petName}** not found for **${character.name}**.`
          );
        }

        // Set level and sync rollsRemaining to match
        petDoc.level = newLevel;
        petDoc.rollsRemaining = newLevel;
        await petDoc.save();

        // ------------------- Sync Embedded Pet Data -------------------
        const updatedPet = petDoc.toObject();
        delete updatedPet._id;
        await updatePetToCharacter(
          character._id,
          petName,
          updatedPet
        );

        return interaction.editReply(
          `✅ Pet **${petName}** level and rolls set to **${newLevel}** for **${character.name}**.`
        );
      }


      // ------------------- Unknown Subcommand Fallback -------------------
      return interaction.editReply('❌ Unknown subcommand specified.');
    } catch (error) {
      // ------------------- Error Handling & Logging -------------------
      console.error('[mod.js]: logs', error);
      handleError(error, 'mod.js');
      return interaction.editReply(
        '❌ An unexpected error occurred while executing the command.'
      );
    }
  },
};
