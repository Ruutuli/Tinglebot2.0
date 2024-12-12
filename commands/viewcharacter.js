// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder } = require('discord.js');
const { fetchCharacterByNameAndUserId, fetchCharactersByUserId } = require('../database/characterService');
const { createCharacterEmbed, createVendorEmbed, createCharacterGearEmbed } = require('../embeds/characterEmbeds');
const { getJobPerk } = require('../modules/jobsModule');
const ItemModel = require('../models/ItemModel');

module.exports = {
  // ------------------- Slash command definition -------------------
  data: new SlashCommandBuilder()
    .setName('viewcharacter')
    .setDescription('View an existing character')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)),

  // ------------------- Execute command to view a character -------------------
  async execute(interaction) {
    try {
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      // Fetch the character using the name and user ID
      const character = await fetchCharacterByNameAndUserId(characterName, userId);

      // Check if the character exists and belongs to the user
      if (!character) {
        await interaction.reply({ content: `❌ Character **${characterName}** not found or does not belong to you.`, ephemeral: true });
        return;
      }

      // Create the character embed
      
      const characterEmbed = createCharacterEmbed(character);

      // Fetch item details from the database
      const itemNames = [
        character.gearWeapon?.name,
        character.gearShield?.name,
        character.gearArmor?.head?.name,
        character.gearArmor?.chest?.name,
        character.gearArmor?.legs?.name
      ].filter(Boolean); // Filter out null/undefined values

      const itemDetails = await ItemModel.find({ itemName: { $in: itemNames } });

      const getItemDetail = (itemName) => {
        const item = itemDetails.find(detail => detail.itemName === itemName);
        return item ? `${item.emoji} ${item.itemName} [+${item.modifierHearts}]` : 'N/A';
      };

      // Organize gear by type with details
      const gearMap = {
        head: character.gearArmor?.head ? `> ${getItemDetail(character.gearArmor.head.name)}` : '> N/A',
        chest: character.gearArmor?.chest ? `> ${getItemDetail(character.gearArmor.chest.name)}` : '> N/A',
        legs: character.gearArmor?.legs ? `> ${getItemDetail(character.gearArmor.legs.name)}` : '> N/A',
        weapon: character.gearWeapon ? `> ${getItemDetail(character.gearWeapon.name)}` : '> N/A',
        shield: character.gearShield ? `> ${getItemDetail(character.gearShield.name)}` : '> N/A',
      };

      // Create the gear embed
      const gearEmbed = createCharacterGearEmbed(character, gearMap, 'all');

      // Add vendor embed only if the character's job has the vending perk
      const jobPerkInfo = getJobPerk(character.job);
      const embeds = [characterEmbed, gearEmbed];

      if (jobPerkInfo?.perks.includes('VENDING') && character.vendorType) {
        const vendorEmbed = createVendorEmbed(character);
        if (vendorEmbed) embeds.push(vendorEmbed);
      }

      // Reply with the embeds
      await interaction.reply({ embeds, ephemeral: true });

    } catch (error) {
      console.error('Error executing viewcharacter command:', error);
      await interaction.reply({ content: '❌ An error occurred while fetching the character.', ephemeral: true });
    }
  },

  // ------------------- Autocomplete function for character names -------------------
  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      const userId = interaction.user.id;

      if (focusedOption.name === 'charactername') {
        // Fetch all characters for the user
        const characters = await fetchCharactersByUserId(userId);

        // Map character names to their IDs
        const choices = characters.map(character => ({
          name: character.name,
          value: character.name // Use character name as the value
        }));

        // Filter and respond with the top 25 matching choices
        const filteredChoices = choices.filter(choice =>
          choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);

        await interaction.respond(filteredChoices);
      }
    } catch (error) {
      await interaction.respond([]);
    }
  }
};
