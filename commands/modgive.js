// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const { fetchCharacterByNameAndUserId } = require('../database/characterService');
const { fetchItemByName } = require('../database/itemService');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modgive')
    .setDescription('📦 Give an item to a character (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admin-only command
    .addStringOption(option =>
      option.setName('character')
        .setDescription('The name of the character to receive the item')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('item')
        .setDescription('The item to give')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option.setName('quantity')
        .setDescription('The quantity of the item to give')
        .setRequired(true)
    ),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
    
            const userId = interaction.user.id;
            const characterName = interaction.options.getString('character');
            const itemName = interaction.options.getString('item');
            const quantity = interaction.options.getInteger('quantity');
    
            console.log(`[modgive]: Command received - Character: ${characterName}, Item: ${itemName}, Quantity: ${quantity}`);
    
            if (quantity <= 0) {
                return interaction.editReply({ content: '❌ **Invalid quantity. You must give at least 1 item.**', ephemeral: true });
            }
    
            const character = await fetchCharacterByNameAndUserId(characterName, userId);
            if (!character) {
                return interaction.editReply({ content: `❌ **Character "${characterName}" not found.**`, ephemeral: true });
            }
            console.log(`[modgive]: Found character: ${character.name}, ID: ${character._id}`);
    
            const item = await fetchItemByName(itemName);
            if (!item) {
                return interaction.editReply({ content: `❌ **Item "${itemName}" not found.**`, ephemeral: true });
            }
            console.log(`[modgive]: Found item: ${item.itemName}, ID: ${item._id}`);
    
            const result = await addItemInventoryDatabase(character._id, itemName, quantity, interaction, 'Admin Give');
            console.log(`[modgive]: addItemInventoryDatabase result: ${result}`);
    
            return interaction.editReply({
                content: `✅ **Successfully gave ${quantity}x "${itemName}" to ${character.name}!** 🎁`,
                ephemeral: true,
            });
    
        } catch (error) {
    handleError(error, 'modgive.js');

            console.error('[modgive]: Error giving item:', error);
            return interaction.editReply({ content: '❌ **An error occurred while processing the command.**', ephemeral: true });
        }
    }
    
    
};

async function handleAutocomplete(interaction) {
    try {
      await connectToTinglebot(); // Ensure MongoDB connection
      const focusedOption = interaction.options.getFocused(true);
      const commandName = interaction.commandName;
  
      if (commandName === 'modgive') {
        if (focusedOption.name === 'character') {
          await handleModGiveCharacterAutocomplete(interaction, focusedOption);
        } else if (focusedOption.name === 'item') {
          await handleModGiveItemAutocomplete(interaction, focusedOption);
        }
      } else {
        await interaction.respond([]);
      }
    } catch (error) {
    handleError(error, 'modgive.js');

      console.error('[handleAutocomplete]: Error handling autocomplete:', error);
      await safeRespondWithError(interaction);
    }
  }
  
