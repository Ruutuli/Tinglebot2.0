// ------------------- Standard Libraries -------------------
// (None used in this file)

// ------------------- Third-party Libraries -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js'); // Discord API for command building and embeds
const { v4: uuidv4 } = require('uuid'); // UUID library for generating unique IDs

// ------------------- Local Modules -------------------
// Character service functions for fetching and updating character data
const { 
  fetchCharacterByNameAndUserId, 
  updatePetRolls, 
  upgradePetLevel, 
  addPetToCharacter, 
  updatePetToCharacter 
} = require('../database/characterService');

// Item service functions for retrieving item data
const { fetchAllItems } = require('../database/itemService');

// RNG module for weighted selection of items
const { createWeightedItemList } = require('../modules/rngModule');

// Inventory utility functions for managing character inventory
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');

// Google Sheets utility functions for logging roll details
const { 
  authorizeSheets, 
  appendSheetData, 
  extractSpreadsheetId, 
  isValidGoogleSheetsUrl 
} = require('../utils/googleSheetsUtils');

// Pet module utilities for retrieving pet perk fields, emojis, flavor texts, and pet type data
const { 
  getPerkField, 
  getPetEmoji, 
  getPetTableRollDescription, 
  getFlavorText, 
  getPetTypeData,
  petEmojiMap
} = require('../modules/petModule');

// Utility function for uploading pet images
const { uploadPetImage } = require('../utils/uploadUtils');

// Mongoose models for Pet and Character
const Pet = require('../models/PetModel');
const Character = require('../models/CharacterModel');

// ------------------- Helper Functions -------------------
// Calculate the cost for upgrading a pet based on the new level.
// (Example: Level 2 upgrade costs 20 tokens, since cost = newLevel * 10)
function getUpgradeCost(newLevel) {
  return newLevel * 10;
}

// ------------------- Exported Slash Command Definition -------------------
module.exports = {
  // ------------------- Command Data Definition -------------------
  // Defines the "pet" slash command with subcommands: roll, upgrade, and add.
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Manage your pets and their abilities')
    // ------------------- Subcommand: Roll -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('roll')
        .setDescription('🎲 Roll for items with your pet')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Enter your character’s name')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('petname')
            .setDescription('Enter your pet’s name')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('rolltype')
            .setDescription('Select a specific roll type (optional)')
            .setRequired(false)
            .setAutocomplete(true))
    )
    // ------------------- Subcommand: Upgrade -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('upgrade')
        .setDescription('⬆️ Upgrade your pet’s level')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Enter your character’s name')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('petname')
            .setDescription('Enter your pet’s name')
            .setRequired(true))
    )
    // ------------------- Subcommand: Add Pet (or Update Pet Image) -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('➕ Add a new pet or update an existing pet’s image')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Enter your character’s name')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('petname')
            .setDescription('Enter the pet’s name')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('category')
            .setDescription('Select the pet category: Normal 🐾 or Special ✨')
            .setRequired(true)
            .addChoices(
              { name: 'Normal', value: 'normal' },
              { name: 'Special', value: 'special' }
            ))
        .addStringOption(option =>
          option.setName('species')
            .setDescription('Select the species of the pet. For Special category, choose from special pet options.')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('pettype')
            .setDescription('Select the pet type for the pet')
            .setRequired(true)
            .addChoices(
              { name: 'Chuchu', value: 'Chuchu' },
              { name: 'Conqueror', value: 'Conqueror' },
              { name: 'Explorer', value: 'Explorer' },
              { name: 'Forager', value: 'Forager' },
              { name: 'Guardian', value: 'Guardian' },
              { name: 'Hunter', value: 'Hunter' },
              { name: 'Nomad', value: 'Nomad' },
              { name: 'Omnivore', value: 'Omnivore' },
              { name: 'Protector', value: 'Protector' },
              { name: 'Prowler', value: 'Prowler' },
              { name: 'Ranger', value: 'Ranger' },
              { name: 'Roamer', value: 'Roamer' },
              { name: 'Scavenger', value: 'Scavenger' },
              { name: 'Sentinel', value: 'Sentinel' },
              { name: 'Tracker', value: 'Tracker' }
            ))
        .addIntegerOption(option =>
          option.setName('level')
            .setDescription('Select the starting level of the pet')
            .setRequired(true)
            .addChoices(
              { name: '1', value: 1 },
              { name: '2', value: 2 },
              { name: '3', value: 3 }
            ))
        .addAttachmentOption(option =>
          option.setName('image')
            .setDescription('Upload an image of the pet (optional)')
            .setRequired(false)
        )),
  
  // ------------------- Command Execution Function -------------------
  // Handles execution of the pet command based on the chosen subcommand.
  async execute(interaction) {
    try {
      // ------------------- Retrieve Command Options -------------------
      // Get user ID, character name, pet name, and subcommand from the interaction.
      const userId = interaction.user.id;
      const characterName = interaction.options.getString('charactername');
      const petName = interaction.options.getString('petname');
      const subcommand = interaction.options.getSubcommand();

      // ------------------- Fetch Character Data -------------------
      // Retrieve character data using the provided character name and user ID.
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        return interaction.reply('❌ **Character not found. Please ensure your character exists.**');
      }
      
      // ------------------- Ensure Pets Array is Defined -------------------
      if (!character.pets) character.pets = [];
      
      // ------------------- Check for Existing Pet -------------------
      // Find if a pet with the given name already exists in the character's pets.
      const existingPet = character.pets.find(pet => pet.name === petName);

      // ------------------- Subcommand: Add Pet or Update Pet Image -------------------
      if (subcommand === 'add') {
        // ------------------- Prevent Adding New Pet if an Active Pet Already Exists -------------------
        // If the pet does not already exist and the character already has an active pet, disallow adding a new one.
        if (!existingPet && character.currentActivePet) {
          return interaction.reply('❌ **You already have an active pet. Please update your current pet instead of adding a new one.**');
        }

        // ------------------- Retrieve Additional Options -------------------
        // Get species, category, starting level, pet type, and optional image attachment from the interaction.
        const species = interaction.options.getString('species');
        const category = interaction.options.getString('category');
        const level = interaction.options.getInteger('level');
        const petType = interaction.options.getString('pettype');
        const imageAttachment = interaction.options.getAttachment('image');

        // ------------------- Validate Pet Category and Infer Size -------------------
        // For Normal pets, infer size based on species name; for Special pets, size is not inferred.
        let inferredSize;
        if (category === 'normal') {
          const lowerSpecies = species.toLowerCase();
          if (lowerSpecies.includes('small')) {
            inferredSize = 'small';
          } else if (lowerSpecies.includes('large')) {
            inferredSize = 'large';
          } else {
            inferredSize = 'small'; // Default to small if no indicator is found
          }

          // Define size restrictions for normal pet types.
          const largePetTypes = ['Conqueror', 'Guardian', 'Hunter', 'Roamer', 'Sentinel'];
          const smallPetTypes = ['Protector'];
          if (inferredSize === 'small' && largePetTypes.includes(petType)) {
            const petTypeData = getPetTypeData(petType);
            return interaction.reply(
              `❌ **Oops! ${species} pet species can't be a \`${petType}\`.**\n` +
              `They require a large pet with the following characteristics:\n` +
              `• Roll Combination: \`${petTypeData.rollCombination.join(', ')}\`\n` +
              `• Description: ${petTypeData.description}`
            );
          }
          if (inferredSize === 'large' && smallPetTypes.includes(petType)) {
            return interaction.reply(`❌ **Only small pets can be of type \`${petType}\`.**`);
          }

          // Additional validation: Ensure a small pet's roll combination does not include the large-only roll "lgpetprey".
          const petTypeData = getPetTypeData(petType);
          if (!petTypeData) {
            return interaction.reply(`❌ **Unknown pet type \`${petType}\`.**`);
          }
          if (inferredSize === 'small' && petTypeData.rollCombination.includes('lgpetprey')) {
            return interaction.reply(
              `❌ **Oops! The ${species} pet species can't be a \`${petType}\` because its roll combination includes \`lgpetprey\`.**\n` +
              `Required Characteristics:\n` +
              `• Roll Combination: \`${petTypeData.rollCombination.join(', ')}\`\n` +
              `• Description: ${petTypeData.description}`
            );
          }
        } else {
          // ------------------- Special Pet Validations (if needed) -------------------
          // For Special pets, additional validations can be added here.
        }

        // ------------------- Upload Pet Image if Provided -------------------
        let petImageUrl = '';
        if (imageAttachment) {
          try {
            petImageUrl = await uploadPetImage(imageAttachment.url, petName);
          } catch (error) {
            console.error(`[pet.js]: logs - Error uploading image for pet "${petName}": ${error.message}`);
            return interaction.reply('❌ **Failed to upload image. Please try again later.**');
          }
        }

        // ------------------- Update Existing Pet (Edit Pet Image) -------------------
        if (existingPet) {
          // Update pet properties with new values
          existingPet.species = species;
          existingPet.size = inferredSize;
          existingPet.level = level;
          existingPet.perks = [petType];
          existingPet.imageUrl = petImageUrl || existingPet.imageUrl;
          await updatePetToCharacter(character._id, petName, existingPet);
          // Ensure the current active pet is updated if not already set
          if (!character.currentActivePet) {
            await Character.findByIdAndUpdate(character._id, { currentActivePet: existingPet._id });
          }
          return interaction.reply(`✅ **Updated pet \`${petName}\` with new details.**`);
        } else {
          // ------------------- Add New Pet -------------------
          // First, update the character document to include the new pet.
          await addPetToCharacter(character._id, petName, species, inferredSize, level, petType, petImageUrl);

          // Retrieve the pet type data (roll combination and description) for the new pet.
          const petTypeData = getPetTypeData(petType);

          // Create a new pet document in the pet database.
          const newPet = await Pet.create({
            name: petName,
            species: species,
            petType: petType,
            level: level,
            rollsRemaining: 1,    // Default rolls remaining
            owner: character._id,
            imageUrl: petImageUrl || '',
            rollCombination: petTypeData.rollCombination,   // Save roll combination data
            tableDescription: petTypeData.description         // Save table description
          });

          // ------------------- Update Character's Active Pet -------------------
          // Set the newly created pet as the active pet for the character.
          await Character.findByIdAndUpdate(character._id, { currentActivePet: newPet._id });

          // ------------------- Build and Send Success Embed -------------------
          const successEmbed = new EmbedBuilder()
            .setTitle('🎉 Pet Added Successfully')
            .setDescription(`Pet \`${petName}\` the **${species}** has been added as type \`${petType}\`.`)
            .addFields(
              { name: 'Roll Combination', value: petTypeData.rollCombination.join(', '), inline: false },
              { name: 'Description', value: petTypeData.description, inline: false }
            )
            .setColor('#00FF00');
          return interaction.reply({ embeds: [successEmbed] });
        }
      }

// ------------------- Verify Pet Existence for Roll and Upgrade -------------------
// Instead of looking in character.pets, fetch the pet document from the Pet collection using the pet's name.
console.log(`[pet.js]: logs - Verifying pet with name: ${petName} for character: ${characterName}`);
const pet = await Pet.findOne({ name: petName, owner: character._id });
if (!pet) {
  console.error(`[pet.js]: logs - Pet with name "${petName}" not found for character ${characterName}`);
  return interaction.reply(`❌ **Pet \`${petName}\` not found. Please add the pet first using the \`/pet add\` command.**`);
}


      // ------------------- Subcommand: Roll -------------------
      if (subcommand === 'roll') {
        // ------------------- Defer Reply -------------------
        await interaction.deferReply();

        // ------------------- Check Available Pet Rolls -------------------
        if (pet.rollsRemaining <= 0) {
          return interaction.editReply('❌ **Your pet has no rolls left this week.**');
        }

        // ------------------- Check Inventory Sync -------------------
        if (!character.inventorySynced) {
          return interaction.reply({
            content: `❌ **Inventory not set up for "${character.name}". Please initialize your inventory using the appropriate commands.**`,
            ephemeral: true,
          });
        }

        // ------------------- Determine Roll Based on Pet Type -------------------
        // Retrieve pet type data using the pet's petType.
        const petTypeData = getPetTypeData(pet.petType);
        if (!petTypeData) {
          console.error(`[pet.js]: logs - Unknown pet type for pet with ID ${petName}`);
          return interaction.editReply('❌ **Unknown pet type configured for this pet.**');
        }
        const rollCombination = petTypeData.rollCombination;
        const userRollType = interaction.options.getString('rolltype');
        let chosenRoll;
        if (userRollType) {
          if (!rollCombination.includes(userRollType)) {
            return interaction.editReply(`❌ **Invalid roll type. Available roll types: ${rollCombination.join(', ')}**`);
          }
          chosenRoll = userRollType;
        } else {
          chosenRoll = rollCombination[Math.floor(Math.random() * rollCombination.length)];
        }

        // ------------------- Retrieve Perk Field for the Roll -------------------
        // Get the correct perk field based on the chosen roll.
        const perkField = getPerkField(chosenRoll);

        // ------------------- Fetch and Filter Available Items -------------------
        // Retrieve all items and filter based on the perk field being true.
        const availableItems = await fetchAllItems();
        const itemsBasedOnPerk = availableItems.filter(item => item[perkField] === true);
        if (itemsBasedOnPerk.length === 0) {
          return interaction.editReply(`⚠️ **No items available for the \`${chosenRoll}\` roll.**`);
        }

        // ------------------- Determine Random Item Based on Weighted List -------------------
        const weightedItems = createWeightedItemList(itemsBasedOnPerk);
        const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];

        // ------------------- Deduct Pet Roll -------------------
        await updatePetRolls(character._id, petName, pet.rollsRemaining - 1);

        // ------------------- Add Item to Inventory -------------------
        const quantity = 1;
        await addItemInventoryDatabase(character._id, randomItem.itemName, quantity, interaction);

        // ------------------- Log Roll Details to Google Sheets (if applicable) -------------------
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
            pet.petType, // Updated: using pet.petType instead of pet.perks[0]
            character.currentVillage,
            `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
            new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
            uuidv4()
          ]];
          await appendSheetData(auth, spreadsheetId, 'loggedInventory!A2:M', values);
        }

        // ------------------- Build Roll Result Embed -------------------
        const rollsRemainingAfterRoll = pet.rollsRemaining - 1; // Update remaining rolls
        const totalRolls = Math.min(pet.level, 3);
        const rollsUsed = totalRolls - rollsRemainingAfterRoll;
        const rollsIcon = '🔔'.repeat(Math.max(0, rollsRemainingAfterRoll)) + '🔕'.repeat(Math.max(0, rollsUsed));

        const petEmoji = getPetEmoji(pet.species);
        const tableDescription = getPetTableRollDescription(chosenRoll);
        const flavorTextMessage = getFlavorText(chosenRoll, pet.name, pet.species, randomItem.itemName);

        // ------------------- Determine Embed Color Based on Village -------------------
        const villageName = character.currentVillage.charAt(0).toUpperCase() + character.currentVillage.slice(1).toLowerCase();
        const villageColors = {
          Rudania: '#d7342a',
          Inariko: '#277ecd',
          Vhintl: '#25c059'
        };
        const embedColor = villageColors[villageName] || '#00FF00';

        // ------------------- Create and Send Roll Result Embed -------------------
        const embed = new EmbedBuilder()
          .setAuthor({ name: character.name, iconURL: character.icon })
          .setTitle(`${character.name}'s Pet Roll | Level ${pet.level}`)
          .setColor(embedColor)
          .setDescription(flavorTextMessage)
          .setThumbnail(pet.imageUrl || 'https://via.placeholder.com/150')
          .addFields(
            { name: 'Pet Type', value: `${petEmoji} ${pet.species}`, inline: true },
            { name: 'Rolls Available', value: `${rollsIcon}`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Pet Table Rolled', value: `\`${chosenRoll}\``, inline: true },
            { name: 'Item Gathered', value: `${randomItem.emoji || ''} ${randomItem.itemName}`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Character Inventory', value: `[Inventory Link](${character.inventory})`, inline: false }
          )
          .setFooter({ text: `${rollsRemainingAfterRoll} rolls left this week | Pet Rolls reset every Sunday at midnight!` })
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

        return interaction.editReply({ embeds: [embed] });
      }

      // ------------------- Subcommand: Upgrade -------------------
      if (subcommand === 'upgrade') {
        // ------------------- Check if Pet is Already at Maximum Level -------------------
        if (pet.level >= 3) {
          return interaction.reply(`❌ **${pet.name} is already at max level.**`);
        }

        // ------------------- Verify Sufficient Tokens for Upgrade -------------------
        const tokens = character.tokens;
        const cost = getUpgradeCost(pet.level + 1);
        if (tokens < cost) {
          return interaction.reply(`❌ **You don't have enough tokens to upgrade ${pet.name}.**`);
        }

        // ------------------- Upgrade Pet's Level -------------------
        await upgradePetLevel(character._id, petName, pet.level + 1);
        return interaction.reply(`✅ **${pet.name} has been upgraded to level ${pet.level + 1}.**`);
      }

    } catch (error) {
      // ------------------- Global Error Handling -------------------
      // Log any unexpected errors with extensive details.
      console.error(`[pet.js]: logs - Error executing pet command: ${error.message}`);
      return interaction.reply('❌ **An unexpected error occurred. Please try again later.**');
    }
  },
};
