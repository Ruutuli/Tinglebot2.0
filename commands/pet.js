// ------------------- Discord.js Components -------------------
// These are used to build and send embeds and slash commands.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Third-party Libraries -------------------
// Used for generating unique identifiers.
const { v4: uuidv4 } = require('uuid');

// ------------------- Database Services -------------------
// Functions for interacting with character and pet data stored in the database.
const { 
  fetchCharacterByNameAndUserId, 
  updatePetRolls, 
  upgradePetLevel, 
  addPetToCharacter, 
  updatePetToCharacter 
} = require('../database/characterService');
const { fetchAllItems } = require('../database/itemService');

// ------------------- Modules -------------------
// Modules used for random item rolls, pet formatting, and retrieving pet-related data.
const { createWeightedItemList } = require('../modules/rngModule');
const { getPerkField, getPetEmoji, getPetTableRollDescription, getFlavorText, getPetTypeData } = require('../modules/petModule');

// ------------------- Utility Functions -------------------
// Helper utilities for inventory management, Google Sheets API interaction, and image uploads.
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, appendSheetData, extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/googleSheetsUtils');
const { uploadPetImage } = require('../utils/uploadUtils');

// ------------------- Database Models -------------------
// Data schemas for pet and character documents.
const Pet = require('../models/PetModel');
const Character = require('../models/CharacterModel');

// ------------------- Helper Functions -------------------
// Calculates the upgrade cost based on the pet's new level.
function getUpgradeCost(newLevel) {
  if (newLevel === 1) return 5000;   // Cost to activate pet (upgrade from untrained to level 1)
  if (newLevel === 2) return 10000;  // Cost to upgrade from level 1 to level 2
  if (newLevel === 3) return 20000;  // Cost to upgrade from level 2 to level 3
  return Infinity;
}

// ============================================================================
// ------------------- Slash Command Definition for Pets -------------------
// This object defines the pet slash command and its subcommands (roll, upgrade, add, edit, retire).
// ============================================================================

module.exports = {
  // ------------------- Command Data Definition -------------------
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Manage your pets and their abilities')
    // ------------------- Subcommand: Roll -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('roll')
        .setDescription('Roll for items with your pet')
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
    // ------------------- Subcommand: Add Pet -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription(' Add a new pet or update an existing pet’s image')
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
        .addAttachmentOption(option =>
          option.setName('image')
            .setDescription('Upload an image of the pet (optional)')
            .setRequired(false)
        ))
    // ------------------- Subcommand: Edit Pet Image -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit your pet’s image')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Enter your character’s name')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('petname')
            .setDescription('Enter the pet’s name')
            .setRequired(true)
            .setAutocomplete(true))
        .addAttachmentOption(option =>
          option.setName('image')
            .setDescription('Upload a new image of the pet')
            .setRequired(true)
        ))
    // ------------------- Subcommand: Retire -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('retire')
        .setDescription('Retire your active pet')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Enter your character’s name')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('petname')
            .setDescription('Enter the pet’s name to retire')
            .setRequired(true)
            .setAutocomplete(true))

            // ------------------- Subcommand: View -------------------
    ),

  // ------------------- Command Execution Function -------------------
  // This function handles executing the pet command based on the chosen subcommand.
  async execute(interaction) {
    try {
      // ------------------- Retrieve Command Options -------------------
      // Extract the user's ID, character name, pet name, and the subcommand.
      const userId = interaction.user.id;

      // strip off any " – village – job" suffix if someone pastes the full label
      const rawCharacter = interaction.options.getString('charactername');
      const characterName = rawCharacter.split(' - ')[0];
      
      const petName    = interaction.options.getString('petname');
      const subcommand = interaction.options.getSubcommand();

      // ------------------- Fetch Character Data -------------------
      // Retrieve the character associated with the user.
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        return interaction.reply('❌ **Character not found. Please ensure your character exists.**');
      }
      
      // ------------------- Initialize Pets Array -------------------
      // Ensure the character has a pets array.
      if (!character.pets) character.pets = [];
      
      // ------------------- Check for Existing Pet -------------------
      // Find the pet by name in the character’s pets array.
      const existingPet = character.pets.find(pet => pet.name === petName);

      // ------------------- Subcommand: Add Pet or Update Pet Details -------------------
      if (subcommand === 'add') {
        // If adding a new pet, prevent adding if an active pet already exists.
        if (!existingPet && character.currentActivePet) {
          return interaction.reply('❌ **You already have an active pet. Please update your current pet instead of adding a new one.**');
        }

        // ------------------- Retrieve Additional Options -------------------
        // Get species, category, starting level, pet type, and optional image attachment.
        const species = interaction.options.getString('species');
        const category = interaction.options.getString('category');
        const petType = interaction.options.getString('pettype');
        const imageAttachment = interaction.options.getAttachment('image');

        // ------------------- Validate and Infer Pet Size -------------------
        // For normal pets, infer size based on the species name.
        let inferredSize;
        if (category === 'normal') {
          const lowerSpecies = species.toLowerCase();
          if (lowerSpecies.includes('small')) {
            inferredSize = 'small';
          } else if (lowerSpecies.includes('large')) {
            inferredSize = 'large';
          } else {
            inferredSize = 'small';
          }

          // ------------------- Validate Pet Type Against Inferred Size -------------------
          const petTypeData = getPetTypeData(petType);
          if (!petTypeData) {
            return interaction.reply(`❌ **Unknown pet type \`${petType}\`.**`);
          }

          const largePetTypes = ['Conqueror', 'Guardian', 'Hunter', 'Roamer', 'Sentinel'];
          const smallPetTypes = ['Protector'];

          if (inferredSize === 'small' && largePetTypes.includes(petType)) {
            return interaction.reply(
              `❌ **Oops! A \`${species}\` pet cannot be of type \`${petType}\`.**\n` +
              `It requires a large pet with the following characteristics:\n` +
              `• **Roll Combination:** \`${petTypeData.rollCombination.join(', ')}\`\n` +
              `• **Description:** ${petTypeData.description}`
            );
          }
          if (inferredSize === 'large' && smallPetTypes.includes(petType)) {
            return interaction.reply(`❌ **Only small pets can be of type \`${petType}\`.**`);
          }
          if (inferredSize === 'small' && petTypeData.rollCombination.includes('lgpetprey')) {
            return interaction.reply(
              `❌ **Oops! The \`${species}\` pet cannot be of type \`${petType}\` because its roll combination includes \`lgpetprey\`.**\n` +
              `Required Characteristics:\n` +
              `• **Roll Combination:** \`${petTypeData.rollCombination.join(', ')}\`\n` +
              `• **Description:** ${petTypeData.description}`
            );
          }
        } else {
          // ------------------- Special Pet Validations -------------------
          // Add any additional validations for special pets here.
        }

        // ------------------- Upload Pet Image (If Provided) -------------------
        let petImageUrl = '';
        if (imageAttachment) {
          try {
            petImageUrl = await uploadPetImage(imageAttachment.url, petName);
            console.log(`[pet.js]: logs - Image uploaded successfully. Public URL: ${petImageUrl}`);
          } catch (error) {
    handleError(error, 'pet.js');

            console.error(`[pet.js]: logs - Error uploading image for pet "${petName}": ${error.message}`);
            return interaction.reply('❌ **Failed to upload image. Please try again later.**');
          }
        }

        // ------------------- Update Existing Pet or Add New Pet -------------------
        if (existingPet) {
          // ------------------- Update Existing Pet Details -------------------
          existingPet.species = species;
          if (category === 'normal') {
            existingPet.size = inferredSize;
          }
          existingPet.perks = [petType];
          // Update image only if a new URL is provided.
          existingPet.imageUrl = petImageUrl || existingPet.imageUrl;
          await updatePetToCharacter(character._id, petName, existingPet);
          if (!character.currentActivePet) {
            await Character.findByIdAndUpdate(character._id, { currentActivePet: existingPet._id });
          }
          return interaction.reply(`✅ **Updated pet \`${petName}\` with new details.**`);
        } else {
        // ------------------- Add New Pet to the Character -------------------
        await addPetToCharacter(character._id, petName, species, inferredSize, 0,      petType, petImageUrl);
        const petTypeData = getPetTypeData(petType);
        const newPet = await Pet.create({
          ownerName: character.name,
          owner: character._id,
          name: petName,
          species,
          petType,
          level: 0,           
          rollsRemaining: 0,
          imageUrl: petImageUrl || '',
          rollCombination: petTypeData.rollCombination,
          tableDescription: petTypeData.description
        });

        // ———————————————— NEW: set this pet as the character's active pet ————————————————
        await Character.findByIdAndUpdate(
          character._id,
          { currentActivePet: newPet._id }
        );


          // ------------------- Build and Send Success Embed for Adding Pet -------------------
          const rollsDisplay = '🔔'.repeat(newPet.rollsRemaining) + '🔕'.repeat(newPet.level - newPet.rollsRemaining);
          const successEmbed = new EmbedBuilder()
            .setAuthor({ name: character.name, iconURL: character.icon })
            .setTitle('🎉 Pet Added Successfully')
            .setDescription(`Pet \`${petName}\` the **${species}** has been added as type \`${petType}\`.`)
            .addFields(
              { name: '__Pet Name__', value: `> ${petName}`, inline: true },
              { name: '__Owner__', value: `> ${character.name}`, inline: true },
              { name: '__Pet Level & Rolls__', value: `> Level ${newPet.level} | ${rollsDisplay}`, inline: true },
              { name: '__Pet Species__', value: `> ${getPetEmoji(species)} ${species}`, inline: true },
              { name: '__Pet Type__', value: `> ${petType}`, inline: true },
              { name: 'Roll Combination', value: petTypeData.rollCombination.join(', '), inline: false },
              { name: 'Description', value: petTypeData.description, inline: false }
            )
            .setImage(petImageUrl || 'https://via.placeholder.com/150')
            .setColor('#00FF00');
          return interaction.reply({ embeds: [successEmbed] });
        }
      }

      // ------------------- Subcommand: Edit Pet Image -------------------
// This branch handles updating the image of an existing pet.
if (subcommand === 'edit') {
  // Retrieve the image attachment.
  const imageAttachment = interaction.options.getAttachment('image');
  if (!imageAttachment) {
    return interaction.reply('❌ **Please upload an image to update your pet.**');
  }

  // Verify pet exists in the database
  const petDoc = await Pet.findOne({ name: petName, owner: character._id });
  if (!petDoc) {
    return interaction.reply(`❌ **Pet \`${petName}\` not found. Please add it first with \`/pet add\`.**`);
  }

  // Attempt to upload the new image
  let petImageUrl = '';
  try {
    petImageUrl = await uploadPetImage(imageAttachment.url, petName);
    console.log(`[pet.js]: logs - Image uploaded successfully. URL: ${petImageUrl}`);
  } catch (error) {
    handleError(error, 'pet.js');
    console.error(`[pet.js]: logs - Error uploading image: ${error.message}`);
    return interaction.reply('❌ **Failed to upload image. Please try again later.**');
  }

  // Update the pet's image and save changes
  petDoc.imageUrl = petImageUrl;
  await updatePetToCharacter(character._id, petName, petDoc);
  return interaction.reply(`✅ **Updated the image for pet \`${petName}\`.**`);
}


      // ------------------- Verify Pet Existence for Roll, Upgrade, and Retire -------------------
      // Determine if the pet exists in the Pet collection by checking its ID or name.
      let pet;
      if (petName.match(/^[0-9a-fA-F]{24}$/)) {
        console.log(`[pet.js]: logs - petName "${petName}" looks like an ObjectId. Searching by _id.`);
        pet = await Pet.findOne({ _id: petName, owner: character._id });
      } else {
        console.log(`[pet.js]: logs - petName "${petName}" does not look like an ObjectId. Searching by name.`);
        pet = await Pet.findOne({ name: petName, owner: character._id });
      }

      if (!pet) {
        console.error(`[pet.js]: logs - Pet with identifier "${petName}" not found for character ${characterName}`);
        return interaction.reply(`❌ **Pet \`${petName}\` not found. Please add the pet first using the \`/pet add\` command.**`);
      }

      // ------------------- Subcommand: Roll -------------------
      if (subcommand === 'roll') {
        // ------------------- Defer Reply for Longer Operations -------------------
        await interaction.deferReply();

        // ------------------- Check Available Pet Rolls -------------------
        if (pet.rollsRemaining <= 0) {
          return interaction.editReply('❌ **Your pet has no rolls left this week.**');
        }

        // ------------------- Verify Inventory Setup -------------------
        if (!character.inventorySynced) {
          return interaction.reply({
            content: `❌ **Inventory not set up for "${character.name}". Please initialize your inventory using the appropriate commands.**`,
            ephemeral: true,
          });
        }

        // ------------------- Determine Roll Combination and Type -------------------
        const petTypeData = getPetTypeData(pet.petType);
        if (!petTypeData) {
          console.error(`[pet.js]: logs - Unknown pet type for pet with name ${petName}`);
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

        // ------------------- Get Perk Field and Filter Items -------------------
        const perkField = getPerkField(chosenRoll);
        const availableItems = await fetchAllItems();
        const itemsBasedOnPerk = availableItems.filter(item => item[perkField] === true);
        if (itemsBasedOnPerk.length === 0) {
          return interaction.editReply(`⚠️ **No items available for the \`${chosenRoll}\` roll.**`);
        }

        // ------------------- Determine Random Item -------------------
        const weightedItems = createWeightedItemList(itemsBasedOnPerk);
        const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];

        // ------------------- Deduct Pet Roll and Update Database -------------------
        const newRollsRemaining = pet.rollsRemaining - 1;
        console.log(`[pet.js]: logs - Deducting pet roll. Old rollsRemaining: ${pet.rollsRemaining}, New rollsRemaining: ${newRollsRemaining}`);
        await updatePetRolls(character._id, petName, newRollsRemaining);
        pet.rollsRemaining = newRollsRemaining;
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
            pet.chosenRoll, 
            character.currentVillage,
            `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
            new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
            uuidv4()
          ]];
          await appendSheetData(auth, spreadsheetId, 'loggedInventory!A2:M', values);
        }

        // ------------------- Build Roll Result Embed -------------------
        const totalRolls = Math.min(pet.level, 3);
        const usedRolls = totalRolls - newRollsRemaining;
        const petEmoji = getPetEmoji(pet.species);
        const tableDescription = getPetTableRollDescription(chosenRoll);
        const flavorTextMessage = getFlavorText(chosenRoll, pet.name, pet.species, randomItem.itemName);

        console.log(`[pet.js]: logs - Building roll embed with ${newRollsRemaining} rolls remaining.`);

        // ------------------- Determine Embed Color Based on Village -------------------
        const villageName = character.currentVillage.charAt(0).toUpperCase() + character.currentVillage.slice(1).toLowerCase();
        const villageColors = {
          Rudania: '#d7342a',
          Inariko: '#277ecd',
          Vhintl: '#25c059'
        };
        const embedColor = villageColors[villageName] || '#00FF00';

        // ------------------- Calculate Roll Display -------------------
        const maxRolls = pet.level;
        const usedRollsDisplay = maxRolls - pet.rollsRemaining;
        const rollsIcon = '🔔'.repeat(pet.rollsRemaining) + '🔕'.repeat(usedRollsDisplay);

        // ------------------- Determine Upgrade Cost for Display -------------------
        let upgradeCost = "Max level reached";
        if (pet.level < 3) {
          const nextLevel = pet.level + 1;
          upgradeCost = getUpgradeCost(nextLevel) + " tokens";
        }

        // ------------------- Create and Send Roll Result Embed -------------------
        const rollEmbed = new EmbedBuilder()
          .setAuthor({ name: character.name, iconURL: character.icon })
          .setThumbnail(pet.imageUrl || 'https://via.placeholder.com/150')
          .setTitle(`${character.name}'s Pet Roll - ${pet.name} | Level ${pet.level}`)
          .setColor(embedColor)
          .setDescription(flavorTextMessage)
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
          .addFields(
            { name: '__Pet Name__', value: `> ${pet.name}`, inline: false },
            { name: '__Pet Species__', value: `> ${petEmoji} ${pet.species}`, inline: true },
            { name: '__Pet Type__', value: `> ${pet.petType}`, inline: true },
            { name: '__Rolls & Level__', value: `> ${rollsIcon} | ${pet.level}`, inline: true },
            { name: '__Village__', value: `> ${character.currentVillage}`, inline: true },
            { name: '__Table__', value: `> \`${chosenRoll}\``, inline: true },
            { name: '__Item Gathered__', value: `> ${randomItem.emoji || ''} ${randomItem.itemName}`, inline: true },
            { name: '__Character Inventory__', value: `> [Inventory Link](${character.inventory})`, inline: false }
          )
          .setFooter({ text: `${pet.rollsRemaining} rolls left this week | Pet Rolls reset every Sunday at midnight!` });
        return interaction.editReply({ embeds: [rollEmbed] });
      }

      // ------------------- Subcommand: Upgrade -------------------
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

      // ------------------- Subcommand: Retire -------------------
      if (subcommand === 'retire') {
        await interaction.deferReply();
        if (pet.status === 'retired') {
          return interaction.editReply(`❌ **${pet.name} is already retired.**`);
        }
        const updateResult = await Pet.updateOne(
          { _id: pet._id },
          { $set: { status: 'retired' } }
        );
        console.log(`[pet.js]: logs - Retired pet ${pet.name}. Modified documents: ${updateResult.modifiedCount || updateResult.nModified || 0}`);
        if (character.currentActivePet && character.currentActivePet.toString() === pet._id.toString()) {
          await Character.findByIdAndUpdate(character._id, { currentActivePet: null });
        }
        const updatedPetData = { ...pet.toObject(), status: 'retired' };
        await updatePetToCharacter(character._id, pet.name, updatedPetData);
        const retireEmbed = new EmbedBuilder()
          .setAuthor({ name: character.name, iconURL: character.icon })
          .setTitle(`Pet Retired - ${pet.name}`)
          .setColor('#FF0000')
          .setDescription(`Your pet **${pet.name}** has been retired.\nYou can now add a new pet to your character.`)
          .setFooter({ text: 'Pet retired successfully.' });
        return interaction.editReply({ embeds: [retireEmbed] });
      }

    } catch (error) {
    handleError(error, 'pet.js');

      // ------------------- Global Error Handling -------------------
      // Log detailed error information and return a user-friendly error message.
      console.error(`[pet.js]: logs - Error executing pet command: ${error.message}`);
      console.error(`[pet.js]: logs - Stack trace: ${error.stack}`);
      return interaction.reply('❌ **An unexpected error occurred. Please try again later.**');
    }
  },
};
