// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// ------------------- Third-party Libraries -------------------
const { v4: uuidv4 } = require('uuid');

// ------------------- Database Services -------------------
const {fetchCharacterByNameAndUserId, updatePetRolls, upgradePetLevel, addPetToCharacter, updatePetToCharacter} = require('../database/characterService');
const { fetchAllItems } = require('../database/itemService');

// ------------------- Modules -------------------
const { createWeightedItemList } = require('../modules/rngModule');
const { getPerkField, getPetEmoji, getPetTableRollDescription, getFlavorText, getPetTypeData, petEmojiMap} = require('../modules/petModule');

// ------------------- Utility Functions -------------------
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, appendSheetData, extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/googleSheetsUtils');
const { uploadPetImage } = require('../utils/uploadUtils');

// ------------------- Database Models -------------------
const Pet = require('../models/PetModel');
const Character = require('../models/CharacterModel');

// ------------------- Helper Functions -------------------
function getUpgradeCost(newLevel) {
  if (newLevel === 1) return 5000;   // Cost to activate pet (upgrade from untrained to level 1)
  if (newLevel === 2) return 10000;  // Cost to upgrade from level 1 to level 2
  if (newLevel === 3) return 20000;  // Cost to upgrade from level 2 to level 3
  return Infinity;
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
    // ------------------- Subcommand: Add Pet or Edit Pet Image -------------------
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
        ))
         // ------------------- Subcommand: Retire -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('retire')
        .setDescription(' Retire your active pet')
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
    ),
  
  // ------------------- Command Execution Function -------------------
  // Handles execution of the pet command based on the chosen subcommand.
  async execute(interaction) {
    try {
      // ------------------- Retrieve Command Options -------------------
      // Get the user ID, character name, pet name, and subcommand from the interaction.
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
      // Check if a pet with the given name already exists in the character's pets.
      const existingPet = character.pets.find(pet => pet.name === petName);

      // ------------------- Subcommand: Add Pet or Update Pet Image -------------------
      if (subcommand === 'add') {
        // ------------------- Prevent Adding New Pet if an Active Pet Already Exists -------------------
        // If the pet does not exist and there is already an active pet, disallow adding a new one.
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

        // ------------------- Validate and Infer Pet Size -------------------
        let inferredSize;
        // For normal pets, infer size based on species name. For special pets, size is not inferred.
        if (category === 'normal') {
          // Infer size from species name (default to small if not specified).
          const lowerSpecies = species.toLowerCase();
          if (lowerSpecies.includes('small')) {
            inferredSize = 'small';
          } else if (lowerSpecies.includes('large')) {
            inferredSize = 'large';
          } else {
            inferredSize = 'small';
          }

          // ------------------- Validate Pet Type Against Inferred Size -------------------
          // Retrieve pet type data once for validations.
          const petTypeData = getPetTypeData(petType);
          if (!petTypeData) {
            return interaction.reply(`❌ **Unknown pet type \`${petType}\`.**`);
          }

          // Define allowed pet types based on inferred size.
          const largePetTypes = ['Conqueror', 'Guardian', 'Hunter', 'Roamer', 'Sentinel'];
          const smallPetTypes = ['Protector'];

          // If pet is inferred as small but the pet type requires a large pet.
          if (inferredSize === 'small' && largePetTypes.includes(petType)) {
            return interaction.reply(
              `❌ **Oops! A \`${species}\` pet cannot be of type \`${petType}\`.**\n` +
              `It requires a large pet with the following characteristics:\n` +
              `• **Roll Combination:** \`${petTypeData.rollCombination.join(', ')}\`\n` +
              `• **Description:** ${petTypeData.description}`
            );
          }
          // If pet is inferred as large but the pet type is meant for small pets.
          if (inferredSize === 'large' && smallPetTypes.includes(petType)) {
            return interaction.reply(`❌ **Only small pets can be of type \`${petType}\`.**`);
          }
          // Additional validation: Ensure a small pet's roll combination does not include the large-only roll "lgpetprey".
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
          // Additional validations for special pets can be added here.
        }

      // ------------------- Upload Pet Image to Google Cloud Storage -------------------
      // If an image attachment is provided, upload it using the uploadPetImage utility,
      // which saves the image to Google Cloud Storage and returns its public URL.
      let petImageUrl = '';
      if (imageAttachment) {
        try {
          petImageUrl = await uploadPetImage(imageAttachment.url, petName);
          console.log(`[pet.js]: logs - Image uploaded successfully. Public URL: ${petImageUrl}`);
        } catch (error) {
          console.error(`[pet.js]: logs - Error uploading image for pet "${petName}": ${error.message}`);
          return interaction.reply('❌ **Failed to upload image. Please try again later.**');
        }
      }

        // ------------------- Update Existing Pet (Edit Pet Image) -------------------
        if (existingPet) {
          // Update pet properties with new values.
          existingPet.species = species;
          // If category is normal, update size; otherwise, retain existing size.
          if (category === 'normal') {
            existingPet.size = inferredSize;
          }
          existingPet.level = level;
          existingPet.perks = [petType];
          // Update image URL if a new image is provided.
          existingPet.imageUrl = petImageUrl || existingPet.imageUrl;
          await updatePetToCharacter(character._id, petName, existingPet);
          // If no active pet is set, update currentActivePet.
          if (!character.currentActivePet) {
            await Character.findByIdAndUpdate(character._id, { currentActivePet: existingPet._id });
          }
          return interaction.reply(`✅ **Updated pet \`${petName}\` with new details.**`);
        } else {
          // ------------------- Add New Pet -------------------
          // Update the character document to include the new pet.
          await addPetToCharacter(character._id, petName, species, inferredSize, level, petType, petImageUrl);

          // Retrieve pet type data for the new pet.
          const petTypeData = getPetTypeData(petType);

          // Create a new pet document in the pet database.
          const newPet = await Pet.create({
            name: petName,
            species: species,
            petType: petType,
            level: level,
            rollsRemaining: 1,    // Default rolls remaining.
            owner: character._id,
            imageUrl: petImageUrl || '',
            rollCombination: petTypeData.rollCombination,   // Save roll combination data.
            tableDescription: petTypeData.description         // Save table description.
          });

          // ------------------- Update Character's Active Pet -------------------
          // Set the newly created pet as the active pet for the character.
          await Character.findByIdAndUpdate(character._id, { currentActivePet: newPet._id });

       // ------------------- Build and Send Success Embed (Updated) -------------------
          const rollsDisplay = '🔔'.repeat(newPet.rollsRemaining) + '🔕'.repeat(newPet.level - newPet.rollsRemaining);

          const successEmbed = new EmbedBuilder()
            .setAuthor({ name: character.name, iconURL: character.icon }) // Owner's info
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

      // ------------------- Verify Pet Existence for Roll and Upgrade -------------------
      // Determine whether the provided pet identifier is an ObjectId or a name.
      let pet;
      if (petName.match(/^[0-9a-fA-F]{24}$/)) {
        // The petName looks like an ObjectId.
        console.log(`[pet.js]: logs - petName "${petName}" looks like an ObjectId. Searching by _id.`);
        pet = await Pet.findOne({ _id: petName, owner: character._id });
      } else {
        // The petName is treated as a normal pet name.
        console.log(`[pet.js]: logs - petName "${petName}" does not look like an ObjectId. Searching by name.`);
        pet = await Pet.findOne({ name: petName, owner: character._id });
      }

      if (!pet) {
        console.error(`[pet.js]: logs - Pet with identifier "${petName}" not found for character ${characterName}`);
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

        // ------------------- Retrieve Perk Field for the Roll -------------------
        const perkField = getPerkField(chosenRoll);

        // ------------------- Fetch and Filter Available Items -------------------
        const availableItems = await fetchAllItems();
        const itemsBasedOnPerk = availableItems.filter(item => item[perkField] === true);
        if (itemsBasedOnPerk.length === 0) {
          return interaction.editReply(`⚠️ **No items available for the \`${chosenRoll}\` roll.**`);
        }

        // ------------------- Determine Random Item Based on Weighted List -------------------
        const weightedItems = createWeightedItemList(itemsBasedOnPerk);
        const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];

        // ------------------- Deduct Pet Roll -------------------
        // Calculate the new number of rolls remaining.
        const newRollsRemaining = pet.rollsRemaining - 1;
        console.log(`[pet.js]: logs - Deducting pet roll. Old rollsRemaining: ${pet.rollsRemaining}, New rollsRemaining: ${newRollsRemaining}`);

        // Update the pet's rolls remaining in the database.
        await updatePetRolls(character._id, petName, newRollsRemaining);

        // Update the local pet object for accurate embed information.
        pet.rollsRemaining = newRollsRemaining;

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
            pet.chosenRoll, 
            character.currentVillage,
            `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
            new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
            uuidv4()
          ]];
          await appendSheetData(auth, spreadsheetId, 'loggedInventory!A2:M', values);
        }

        // ------------------- Build Roll Result Embed -------------------
        const rollsRemainingAfterRoll = pet.rollsRemaining - 1; // Updated remaining rolls.
        const totalRolls = Math.min(pet.level, 3);
        const rollsUsed = totalRolls - newRollsRemaining;         

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
        // Maximum rolls available equals the pet's level (each level gives 1 roll)
        const maxRolls = pet.level;
        // Calculate used rolls: (if pet.level is 1 and pet.rollsRemaining is 0, usedRolls = 1)
        const usedRolls = maxRolls - pet.rollsRemaining;
        // Build icon: active rolls (🔔) and used (🔕)
        const rollsIcon = '🔔'.repeat(pet.rollsRemaining) + '🔕'.repeat(usedRolls);

        // ------------------- Determine Upgrade Cost -------------------
        let upgradeCost = "Max level reached";
        if (pet.level < 3) {
          const nextLevel = pet.level + 1;
          upgradeCost = getUpgradeCost(nextLevel) + " tokens";
        }

        // ------------------- Create and Send Roll Result Embed (Updated) -------------------
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
           
      // ------------------- Subcommand: Retire -------------------
            if (subcommand === 'retire') {
              await interaction.deferReply();
              // Check if pet is already retired.
              if (pet.status === 'retired') {
                return interaction.editReply(`❌ **${pet.name} is already retired.**`);
              }
              // Update pet status in the Pet collection.
              const updateResult = await Pet.updateOne(
                { _id: pet._id },
                { $set: { status: 'retired' } }
              );
              console.log(`[pet.js]: logs - Retired pet ${pet.name}. Modified documents: ${updateResult.modifiedCount || updateResult.nModified || 0}`);
              // If this pet is the active pet for the character, remove it.
              if (character.currentActivePet && character.currentActivePet.toString() === pet._id.toString()) {
                await Character.findByIdAndUpdate(character._id, { currentActivePet: null });
              }
              // Update the embedded pet record in the character document.
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
      // ------------------- Global Error Handling -------------------
      // Log any unexpected errors with extensive details.
      console.error(`[pet.js]: logs - Error executing pet command: ${error.message}`);
      console.error(`[pet.js]: logs - Stack trace: ${error.stack}`);
      return interaction.reply('❌ **An unexpected error occurred. Please try again later.**');
    }
  },
};
