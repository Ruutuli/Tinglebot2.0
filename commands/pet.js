// ------------------- Import necessary libraries and modules -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchCharacterByNameAndUserId, updatePetRolls, upgradePetLevel, addPetToCharacter, updatePetToCharacter } = require('../database/characterService');
const { fetchAllItems } = require('../database/itemService');
const { createWeightedItemList } = require('../modules/rngModule');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, appendSheetData, extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/googleSheetsUtils');
const { getPerkField, getPetEmoji, getPetTableRollDescription, getFlavorText } = require('../modules/petModule');
const { uploadPetImage } = require('../utils/uploadUtils'); // Import the modified upload function
const { v4: uuidv4 } = require('uuid');

// ------------------- Command Definition -------------------
// This section defines the 'pet' slash command with subcommands for roll, upgrade, and add functionalities.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Manage your pets and their abilities')
    .addSubcommand(subcommand =>
      subcommand
        .setName('roll')
        .setDescription('Roll for items with your pet')
        .addStringOption(option => 
          option.setName('charactername')
            .setDescription('Your character’s name')
            .setRequired(true))
        .addStringOption(option => 
          option.setName('petname')
            .setDescription('Your pet’s name')
            .setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('upgrade')
        .setDescription('Upgrade your pet’s level')
        .addStringOption(option => 
          option.setName('charactername')
            .setDescription('Your character’s name')
            .setRequired(true))
        .addStringOption(option => 
          option.setName('petname')
            .setDescription('Your pet’s name')
            .setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add or update a pet with an image')
        .addStringOption(option => 
          option.setName('charactername')
            .setDescription('Your character’s name')
            .setRequired(true))
        .addStringOption(option => 
          option.setName('petname')
            .setDescription('Name of the pet')
            .setRequired(true))
        .addStringOption(option => 
          option.setName('species')
            .setDescription('Species of the pet')
            .setRequired(true))
        .addStringOption(option => 
          option.setName('size')
            .setDescription('Size of the pet (small or large)')
            .setRequired(true)
            .addChoices(
              { name: 'small', value: 'small' },
              { name: 'large', value: 'large' }
            ))
        .addIntegerOption(option => 
          option.setName('level')
            .setDescription('Starting level of the pet')
            .setRequired(true))
        .addStringOption(option => 
          option.setName('perk')
            .setDescription('Perk type for the pet')
            .setRequired(true)
            .addChoices(
              { name: 'lgpetprey', value: 'lgpetprey' },
              { name: 'petforage', value: 'petforage' },
              { name: 'petmon', value: 'petmon' },
              { name: 'petprey', value: 'petprey' }
            ))
        .addAttachmentOption(option => 
          option.setName('image')
            .setDescription('Upload an image of the pet')
            .setRequired(false)) // Image is optional
    ),

  // ------------------- Command Execution -------------------
 // Handles the execution of each subcommand (roll, upgrade, add) based on user interaction.
 async execute(interaction) {
  const userId = interaction.user.id;
  const characterName = interaction.options.getString('charactername');
  const petName = interaction.options.getString('petname');
  const subcommand = interaction.options.getSubcommand();

  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
    return interaction.reply('❌ **Character not found.**');
  }

  // Find the specified pet by name
  const pet = character.pets.find(p => p.name === petName);
  if (!pet) {
    return interaction.reply(`❌ **Pet ${petName} not found.**`);
  }
    // ------------------- Handle 'add' Subcommand -------------------
    // Adds a new pet to a character or updates existing pet information.
    if (subcommand === 'add') {
      const species = interaction.options.getString('species');
      const size = interaction.options.getString('size');
      const level = interaction.options.getInteger('level');
      const perk = interaction.options.getString('perk');
      const imageAttachment = interaction.options.getAttachment('image'); // Optional attachment for image

      if (size === 'small' && perk === 'lgpetprey') {
        return interaction.reply('❌ **Only large pets can have the `lgpetprey` perk.**');
      }

      let petImageUrl = '';
      if (imageAttachment) {
        try {
          petImageUrl = await uploadPetImage(imageAttachment.url, petName); // Upload attachment and get URL
        } catch (error) {
          return interaction.reply('❌ **Failed to upload image. Please try again.**');
        }
      }

      const existingPet = character.pets.find(pet => pet.name === petName);
      if (existingPet) {
        existingPet.species = species;
        existingPet.size = size;
        existingPet.level = level;
        existingPet.perks = [perk];
        existingPet.imageUrl = petImageUrl || existingPet.imageUrl;
        await updatePetToCharacter(character._id, petName, existingPet);
        return interaction.reply(`✅ **Updated pet ${petName} with new details.**`);
      } else {
        await addPetToCharacter(character._id, petName, species, size, level, perk, petImageUrl);
        return interaction.reply(`✅ **Pet ${petName} the ${species} (${size}) has been added with perk ${perk}.**`);
      }
    }

    // ------------------- Handle 'roll' Subcommand -------------------
    // Rolls for an item using a pet, adds it to inventory, and logs it to Google Sheets.
    if (subcommand === 'roll') {
      await interaction.deferReply();

      if (pet.rollsRemaining <= 0) {
        return interaction.editReply('❌ **Pet has no rolls left this week.**');
      }

      const availableItems = await fetchAllItems();
      const perkField = getPerkField(pet.perks[0]);
      const itemsBasedOnPerk = availableItems.filter(item => item[perkField] === true);

      if (itemsBasedOnPerk.length === 0) {
        return interaction.editReply(`⚠️ **No items available for the ${pet.perks[0]} perk.**`);
      }

      const weightedItems = createWeightedItemList(itemsBasedOnPerk);
      const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];
// Deduct one roll after using the roll command
await updatePetRolls(character._id, petName, pet.rollsRemaining - 1);

      const quantity = 1;
      await addItemInventoryDatabase(character._id, randomItem.itemName, quantity, interaction);

      const inventoryLink = character.inventory || character.inventoryLink;
      if (isValidGoogleSheetsUrl(inventoryLink)) {
        const spreadsheetId = extractSpreadsheetId(inventoryLink);
        const auth = await authorizeSheets();
        const values = [[
          character.name,
          randomItem.itemName,
          quantity.toString(),
          randomItem.category.join(', '),
          randomItem.type.join(', '),
          randomItem.subtype.join(', '),
          'Pet Roll',
          character.job,
          pet.perks[0],
          character.currentVillage,
          `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
          new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
          uuidv4()
        ]];
        await appendSheetData(auth, spreadsheetId, 'loggedInventory!A2:M', values);
      }

// Recalculate rolls remaining after deduction
const rollsRemainingAfterRoll = pet.rollsRemaining - 1; // This reflects the rolls left after usage
const totalRolls = Math.min(pet.level, 3);
const rollsUsed = totalRolls - rollsRemainingAfterRoll;
const rollsIcon = '🔔'.repeat(Math.max(0, rollsRemainingAfterRoll)) + '🔕'.repeat(Math.max(0, rollsUsed));


      const petEmoji = getPetEmoji(pet.species);
      const tableDescription = getPetTableRollDescription(pet.perks[0]);
      const flavorText = getFlavorText(pet.perks[0], pet.name, pet.species, randomItem.itemName);

      const villageName = character.currentVillage.charAt(0).toUpperCase() + character.currentVillage.slice(1).toLowerCase();

      // Village color mapping
      const villageColors = {
        Rudania: '#d7342a',
        Inariko: '#277ecd',
        Vhintl: '#25c059'
      };
      const embedColor = villageColors[villageName] || '#00FF00';

      const embed = new EmbedBuilder()
        .setAuthor({ name: character.name, iconURL: character.icon })
        .setTitle(`${character.name}'s Pet Roll | Level ${pet.level}`)
        .setColor(embedColor)
        .setDescription(flavorText)
        .setThumbnail(pet.imageUrl || 'https://via.placeholder.com/150') // Pet image or placeholder
        .addFields(
          { name: 'Pet Type', value: `${petEmoji} ${pet.species}`, inline: true },
          { name: 'Rolls Available', value: `${rollsIcon}`, inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
          { name: 'Pet Table Rolled', value: `${pet.perks[0]}`, inline: true },
          { name: 'Item Gathered', value: `${randomItem.emoji || ''} ${randomItem.itemName}`, inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
          { name: 'Character Inventory', value: `[Inventory Link](${character.inventory})`, inline: false }
        )
        .setFooter({ text: `${rollsRemainingAfterRoll} rolls left this week | Pet Rolls reset every Sunday at midnight!` })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

      return interaction.editReply({ embeds: [embed] });
    }

    // ------------------- Handle 'upgrade' Subcommand -------------------
    // Upgrades the pet's level, given the character has enough tokens.
    if (subcommand === 'upgrade') {
      if (pet.level >= 3) {
        return interaction.reply(`❌ **${pet.name} is already at max level.**`);
      }

      const tokens = character.tokens;
      const cost = getUpgradeCost(pet.level + 1);
      if (tokens < cost) {
        return interaction.reply(`❌ **You don't have enough tokens to upgrade ${pet.name}.**`);
      }

      await upgradePetLevel(character._id, petName, pet.level + 1);
      return interaction.reply(`✅ **${pet.name} has been upgraded to level ${pet.level + 1}.**`);
    }
  },
};
