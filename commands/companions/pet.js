// ------------------- Discord.js Components -------------------
// These are used to build and send embeds and slash commands.
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

// ------------------- Third-party Libraries -------------------
// Used for generating unique identifiers.
const { v4: uuidv4 } = require("uuid");

// ------------------- Database Services -------------------
// Functions for interacting with character and pet data stored in the database.
const {
 fetchCharacterByNameAndUserId,
 updatePetRolls,
 upgradePetLevel,
 addPetToCharacter,
 updatePetToCharacter,
 fetchAllItems,
 getTokenBalance,
 updateTokenBalance,
} = require("../../database/db");

// ------------------- Modules -------------------
// Modules used for random item rolls, pet formatting, and retrieving pet-related data.
const { createWeightedItemList } = require("../../modules/rngModule");
const {
 getPerkField,
 getPetEmoji,
 getFlavorText,
 getPetTypeData,
 petTypeData,
 canSpeciesPerformPetType,
 speciesRollPermissions,
 getRollsDisplay,
 findPetByIdentifier,
 handlePetImageUpload,
 validatePetSpeciesCompatibility,
} = require("../../modules/petModule");

// ------------------- Utility Functions -------------------
// Helper utilities for inventory management, Google Sheets API interaction, and image uploads.
const { addItemInventoryDatabase } = require("../../utils/inventoryUtils");
const {
 authorizeSheets,
 appendSheetData,
 extractSpreadsheetId,
 isValidGoogleSheetsUrl,
 safeAppendDataToSheet,
} = require("../../utils/googleSheetsUtils");
const { uploadPetImage } = require("../../utils/uploadUtils");
const { checkInventorySync } = require("../../utils/characterUtils");
const { handleError } = require('../../utils/globalErrorHandler');
const { enforceJail } = require('../../utils/jailCheck');
const { characterExistsNotOwned } = require('../../utils/validation');


// ------------------- Database Models -------------------
// Data schemas for pet and character documents.
const Pet = require("../../models/PetModel");
const Character = require("../../models/CharacterModel");

// ------------------- Helper Functions -------------------
// Calculates the upgrade cost based on the pet's new level.
function getUpgradeCost(newLevel) {
 if (newLevel === 1) return 5000; // Cost to activate pet (upgrade from untrained to level 1)
 if (newLevel === 2) return 10000; // Cost to upgrade from level 1 to level 2
 if (newLevel === 3) return 20000; // Cost to upgrade from level 2 to level 3
 return Infinity;
}

// ------------------- Helper function for error handling -------------------
function handlePetError(error, interaction, context = {}) {
  // Log error to console with full context
  console.error("==========================================");
  console.error(`[pet.js]: ❌ Error in ${context.commandName || 'pet'} command`);
  console.error(`[pet.js]: User: ${context.userTag || 'Unknown'} (${context.userId || 'Unknown'})`);
  console.error(`[pet.js]: Error Message: ${error.message}`);
  console.error(`[pet.js]: Stack Trace: ${error.stack}`);
  if (context.options) {
    console.error(`[pet.js]: Command Options:`, context.options);
  }
  console.error("==========================================");

  // Send error message to user
  const errorMessage = "❌ **An unexpected error occurred. Please try again later.**";
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ content: errorMessage, flags: 64 });
  } else {
    return interaction.reply({ content: errorMessage, flags: 64 });
  }
}

// Add this helper function at the top of the file, after the imports
function isValidUrl(string) {
  if (!string || typeof string !== 'string') return false;
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// ------------------- URL Sanitization Helper -------------------
const sanitizeUrl = (url) => {
  if (!url) return "https://i.imgur.com/placeholder.png";
  try {
    const encodedUrl = encodeURI(url).replace(/!/g, '%21');
    const urlObj = new URL(encodedUrl);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:' ? encodedUrl : "https://i.imgur.com/placeholder.png";
  } catch (_) {
    console.error(`[pet.js]: ❌ Error sanitizing URL: ${url}`);
    return "https://i.imgur.com/placeholder.png";
  }
};

// ------------------- Pet Image URL Encoding Helper -------------------
const encodePetImageUrl = (petImageUrl) => {
  if (!petImageUrl) return null;
  try {
    // Split the URL into base and filename parts
    const lastSlashIndex = petImageUrl.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      const baseUrl = petImageUrl.substring(0, lastSlashIndex + 1);
      const filename = petImageUrl.substring(lastSlashIndex + 1);
      const encodedFilename = encodeURIComponent(filename);
      const encodedUrl = baseUrl + encodedFilename;
      return encodedUrl;
    }
  } catch (error) {
    console.error(`[pet.js]: ❌ Error encoding pet image URL: ${error.message}`);
  }
  return null;
};

// ============================================================================
// ------------------- Slash Command Definition for Pets -------------------
// This object defines the pet slash command and its subcommands (roll, upgrade, add, edit,)
// ============================================================================

module.exports = {
 // ------------------- Command Data Definition -------------------
 data: new SlashCommandBuilder()
  .setName("pet")
  .setDescription("Manage your pets and their abilities")
  // ------------------- Subcommand: Roll -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("roll")
    .setDescription("Roll for items with your pet")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Enter your character's name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("petname")
      .setDescription("Enter your pet's name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("rolltype")
      .setDescription("Select a specific roll type (optional)")
      .setRequired(false)
      .setAutocomplete(true)
    )
  )
  // ------------------- Subcommand: Upgrade -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("upgrade")
    .setDescription("⬆️ Upgrade your pet's level")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Enter your character's name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("petname")
      .setDescription("Enter your pet's name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("level")
      .setDescription("Enter the level to upgrade to")
      .setRequired(true)
      .addChoices(
       { name: "Level 1", value: 1 },
       { name: "Level 2", value: 2 },
       { name: "Level 3", value: 3 }
      )
    )
  )
  // ------------------- Subcommand: Add Pet -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("add")
    .setDescription(" Add a new pet or update an existing pet's image")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Enter your character's name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("petname")
      .setDescription("Enter the pet's name")
      .setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("category")
      .setDescription("Select the pet category: Normal 🐾 or Special ✨")
      .setRequired(true)
      .addChoices(
       { name: "Normal", value: "normal" },
       { name: "Special", value: "special" }
      )
    )
    .addStringOption((option) =>
     option
      .setName("species")
      .setDescription(
       "Select the species of the pet. For Special category, choose from special pet options."
      )
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("pettype")
      .setDescription("Select the pet type for the pet")
      .setRequired(true)
             .addChoices(
        { name: "Chuchu", value: "Chuchu" },
        { name: "Fire Chuchu", value: "FireChuchu" },
        { name: "Ice Chuchu", value: "IceChuchu" },
        { name: "Electric Chuchu", value: "ElectricChuchu" },
        { name: "Conqueror", value: "Conqueror" },
        { name: "Explorer", value: "Explorer" },
        { name: "Forager", value: "Forager" },
        { name: "Guardian", value: "Guardian" },
        { name: "Hunter", value: "Hunter" },
        { name: "Nomad", value: "Nomad" },
        { name: "Omnivore", value: "Omnivore" },
        { name: "Protector", value: "Protector" },
        { name: "Prowler", value: "Prowler" },
        { name: "Ranger", value: "Ranger" },
        { name: "Roamer", value: "Roamer" },
        { name: "Scavenger", value: "Scavenger" },
        { name: "Sentinel", value: "Sentinel" },
        { name: "Tracker", value: "Tracker" }
       )
    )
    .addAttachmentOption((option) =>
     option
      .setName("image")
      .setDescription("Upload an image of the pet (optional)")
      .setRequired(false)
    )
  )
  // ------------------- Subcommand: Edit Pet Image -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("edit")
    .setDescription("Edit your pet's image")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Enter your character's name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("petname")
      .setDescription("Enter the pet's name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addAttachmentOption((option) =>
     option
      .setName("image")
      .setDescription("Upload a new image of the pet")
      .setRequired(true)
    )
  )
  // ------------------- Subcommand: View Pet -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("view")
    .setDescription("View details for one of your pets")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Enter your character's name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("petname")
      .setDescription("Enter your pet's name")
      .setRequired(true)
      .setAutocomplete(true)
    )
  ),

// ============================================================================
// ------------------- Command Execution Function -------------------
// Handles executing the pet command based on the chosen subcommand.
// ============================================================================

 async execute(interaction) {
  try {
    // Defer the reply at the start
    await interaction.deferReply();

    const userId = interaction.user.id;
    const rawCharacter = interaction.options.getString("charactername");
    const characterName = rawCharacter.split(" - ")[0];
    const petName = interaction.options.getString("petname");
    const subcommand = interaction.options.getSubcommand();

    // Fetch character data
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      return interaction.editReply({
        content: `❌ **Character \`${characterName}\` not found.**`,
        ephemeral: true
      });
    }

    // Verify character ownership
    if (character.userId !== userId) {
      console.error(
        `[pet.js]: logs - Character "${characterName}" exists but belongs to a different user`
      );
      return interaction.editReply({
        content: `❌ **Character \`${characterName}\` belongs to a different user. You can only manage pets for your own characters.**`,
        ephemeral: true
      });
    }

    // Jail check removed - pets can be used regardless of character status

    // ------------------- Check for Existing Pet -------------------
    // Find the pet by name in the character's pets array.
    const existingPet = await Pet.findOne({ owner: character._id, name: petName });

    // ------------------- Subcommand: Add Pet or Update Pet Details -------------------
    if (subcommand === "add") {
      // If adding a new pet, prevent adding if an active pet already exists.
      const existingActivePet = await Pet.findOne({ owner: character._id, status: 'active' });
      if (!existingPet && existingActivePet) {
        const activePetEmbed = new EmbedBuilder()
          .setAuthor({ name: character.name, iconURL: character.icon })
          .setTitle("❌ Active Pet Found")
          .setDescription("You already have an active pet and cannot add another one at this time.")
          .addFields(
            { 
              name: "🐾 Current Active Pet", 
              value: `\`${existingActivePet.name}\` the ${existingActivePet.species}`, 
              inline: true 
            },
            { 
              name: "📋 Pet Type", 
              value: `\`${existingActivePet.petType}\``, 
              inline: true 
            },
            { 
              name: "📊 Level", 
              value: `Level ${existingActivePet.level}`, 
              inline: true 
            }
          )
          .setColor("#FF6B35")
          .setImage(sanitizeUrl("https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png"))
          .setFooter({ 
            text: "Please store your pet in the stables (feature coming soon) before adding a new one" 
          });
        
        return interaction.editReply({ embeds: [activePetEmbed], ephemeral: true });
      }

      // ------------------- Retrieve Additional Options -------------------
      const species = interaction.options.getString("species");
      const category = interaction.options.getString("category");
      const petType = interaction.options.getString("pettype");
      const imageAttachment = interaction.options.getAttachment("image");

      // Validate species and pet type compatibility
      const validationResult = validatePetSpeciesCompatibility(species, petType);
      if (!validationResult.isValid) {
        // Create a nicely formatted embed for validation errors
        const errorEmbed = new EmbedBuilder()
          .setAuthor({ name: character.name, iconURL: character.icon })
          .setTitle("❌ Pet Species Compatibility Error")
          .setDescription(validationResult.error)
          .setColor("#FF0000");
        
        // Add fields for detailed information if available
        if (validationResult.allowedRolls) {
          const petEmoji = getPetEmoji(validationResult.species);
          errorEmbed.addFields(
            { 
              name: `${petEmoji} Species`, 
              value: `\`${validationResult.species}\``, 
              inline: true 
            },
            { 
              name: "🎯 Selected Type", 
              value: `\`${validationResult.petType}\``, 
              inline: true 
            },
            { 
              name: "🎲 Allowed Rolls", 
              value: validationResult.allowedRolls, 
              inline: false 
            },
            { 
              name: "🐾 Compatible Pet Types", 
              value: validationResult.compatiblePetTypes, 
              inline: false 
            }
          );
        } else if (validationResult.species) {
          // Handle unknown species error
          const petEmoji = getPetEmoji(validationResult.species);
          errorEmbed.addFields(
            { 
              name: `${petEmoji} Species`, 
              value: `\`${validationResult.species}\``, 
              inline: true 
            }
          );
        } else if (validationResult.petType) {
          // Handle unknown pet type error
          errorEmbed.addFields(
            { 
              name: "🎯 Selected Type", 
              value: `\`${validationResult.petType}\``, 
              inline: true 
            }
          );
        }
        
        errorEmbed.setFooter({ 
          text: "Please choose a compatible pet type based on your species' available rolls" 
        });
        
        return interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
      }

      // ------------------- Upload Pet Image (If Provided) -------------------
      let petImageUrl = "";
      try {
        petImageUrl = await handlePetImageUpload(imageAttachment, petName);
      } catch (error) {
        return interaction.editReply({
          content: error.message,
          ephemeral: true
        });
      }

      // ------------------- Update Existing Pet or Add New Pet -------------------
      if (existingPet) {
        existingPet.species = species;
        existingPet.petType = petType;
        existingPet.imageUrl = petImageUrl || existingPet.imageUrl;
        await existingPet.save();

        if (!character.currentActivePet) {
          await Character.findByIdAndUpdate(character._id, { currentActivePet: existingPet._id });
        }

        return interaction.editReply({
          content: `✅ **Updated pet \`${petName}\` with new details.**`,
          ephemeral: true
        });
      } else {
        // Get pet type data before creating the pet
        const petTypeData = getPetTypeData(petType);
        if (!petTypeData) {
          return interaction.editReply({
            content: "❌ **Invalid pet type selected.**",
            ephemeral: true
          });
        }

        const newPet = await Pet.create({
          ownerName: character.name,
          owner: character._id,
          name: petName,
          species,
          petType,
          level: 0,
          rollsRemaining: 0,
          imageUrl: petImageUrl || "",
          rollCombination: petTypeData.rollCombination,
          tableDescription: petTypeData.description,
          discordId: character.userId
        });
        
        await Character.findByIdAndUpdate(character._id, { currentActivePet: newPet._id });

        const rollsDisplay = getRollsDisplay(newPet.rollsRemaining, newPet.level);
        const successEmbed = new EmbedBuilder()
          .setAuthor({ name: character.name, iconURL: character.icon })
          .setTitle("🎉 Pet Added Successfully")
          .setDescription(`Pet \`${petName}\` the **${species}** has been added as type \`${petType}\`.`)
          .addFields(
            { name: "__Pet Name__", value: `> ${petName}`, inline: true },
            { name: "__Owner__", value: `> ${character.name}`, inline: true },
            { name: "__Pet Level & Rolls__", value: `> Level ${newPet.level} | ${rollsDisplay}`, inline: true },
            { name: "__Pet Species__", value: `> ${getPetEmoji(species)} ${species}`, inline: true },
            { name: "__Pet Type__", value: `> ${petType}`, inline: true },
            { name: "Roll Combination", value: petTypeData.rollCombination.join(", "), inline: false },
            { name: "Description", value: petTypeData.description, inline: false }
          )
          .setImage(sanitizeUrl(encodePetImageUrl(petImageUrl) || petImageUrl))
          .setColor("#00FF00");

        return interaction.editReply({ embeds: [successEmbed] });
      }
    }

    // ------------------- Subcommand: Edit Pet Image -------------------
    if (subcommand === "edit") {
      // Retrieve the image attachment.
      const imageAttachment = interaction.options.getAttachment("image");
      if (!imageAttachment) {
        return interaction.editReply({
          content: "❌ **Please upload an image to update your pet.**",
          ephemeral: true
        });
      }

      // Verify pet exists in the database
      const petDoc = await findPetByIdentifier(petName, character._id);
      if (!petDoc) {
        return interaction.editReply({
          content: `❌ **Pet \`${petName}\` not found. Please add it first with \`/pet add\`.**`,
          ephemeral: true
        });
      }

      // Attempt to upload the new image
      try {
        const petImageUrl = await handlePetImageUpload(imageAttachment, petName);
        petDoc.imageUrl = petImageUrl;
        
        // Update both the Pet model and Character model
        await Pet.updateOne(
          { _id: petDoc._id },
          { $set: { imageUrl: petImageUrl } }
        );
        await updatePetToCharacter(character._id, petName, petDoc);

        // Encode and sanitize the URL before using it in the embed
        const encodedImageUrl = encodePetImageUrl(petDoc.imageUrl);
        const sanitizedImageUrl = sanitizeUrl(encodedImageUrl || petDoc.imageUrl);

        // ------------------- Determine Embed Color Based on Village -------------------
        const villageName =
         character.currentVillage.charAt(0).toUpperCase() +
         character.currentVillage.slice(1).toLowerCase();
        const villageColors = {
         Rudania: "#d7342a",
         Inariko: "#277ecd",
         Vhintl: "#25c059",
        };
        const embedColor = villageColors[villageName] || "#00FF00";

        // ------------------- Calculate Rolls Display -------------------
        const petEmoji = getPetEmoji(petDoc.species);
        const rollsDisplay = getRollsDisplay(petDoc.rollsRemaining || 0, petDoc.level || 0);

        // Build and send embed showing updated pet
        const editEmbed = new EmbedBuilder()
          .setAuthor({ name: character.name, iconURL: character.icon })
          .setTitle(`🖼️ Pet Image Updated — ${petDoc.name}`)
          .setThumbnail(sanitizedImageUrl)
          .setColor(embedColor)
          .setDescription(`✅ **${petDoc.name}**'s image has been successfully updated!`)
          .setImage(sanitizeUrl("https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png"))
          .addFields(
            { name: "__Pet Name__", value: `> ${petDoc.name}`, inline: true },
            { name: "__Owner__", value: `> ${character.name}`, inline: true },
            { name: "__Village__", value: `> ${character.currentVillage}`, inline: true },
            {
              name: "__Pet Species__",
              value: `> ${petEmoji} ${petDoc.species}`,
              inline: true,
            },
            { name: "__Pet Type__", value: `> ${petDoc.petType}`, inline: true },
            { name: "__Status__", value: `> ${petDoc.status === 'active' ? '🟢 Active' : '🔵 Stored'}`, inline: true },
            {
              name: "__Current Level__",
              value: `> Level ${petDoc.level || 0}`,
              inline: true,
            },
            {
              name: "__Rolls Available__",
              value: `> ${rollsDisplay}`,
              inline: true,
            }
          )
          .setFooter({
            text: `Pet image updated successfully!`,
            iconURL: character.icon
          });

        return interaction.editReply({ embeds: [editEmbed] });
      } catch (error) {
        console.error(`[pet.js]: ❌ Error updating pet image:`, error);
        return interaction.editReply({
          content: `❌ **An error occurred while updating the image for ${petDoc.name}. Please try again later.**`,
          ephemeral: true
        });
      }
    }

    // ------------------- Verify Pet Existence for Roll, Upgrade,  -------------------
    // Find pet by identifier (ID or name)
    const pet = await findPetByIdentifier(petName, character._id, 'active');

    if (!pet) {
      console.error(
        `[pet.js]: logs - Pet with identifier "${petName}" not found for character ${characterName}`
      );
      return interaction.editReply({
        content: `❌ **Pet \`${petName}\` not found for character \`${characterName}\`. Please check the pet name and try again.**`,
        ephemeral: true
      });
    }

    // Verify pet ownership
    if (pet.owner.toString() !== character._id.toString()) {
      console.error(
        `[pet.js]: logs - Pet "${petName}" exists but belongs to a different character`
      );
      return interaction.editReply({
        content: `❌ **Pet \`${petName}\` belongs to a different character. Please check the pet name and try again.**`,
        ephemeral: true
      });
    }

    // Check if pet is stored
    if (pet.status === 'stored') {
      return interaction.editReply({
        content: `❌ **Pet \`${petName}\` is currently stored and cannot perform actions.**`,
        ephemeral: true
      });
    }

    // ------------------- Subcommand: Roll -------------------
    if (subcommand === "roll") {
     // ------------------- Check Pet Status -------------------
     if (pet.status === "stored") {
       return interaction.editReply(
         `❌ **${pet.name}** is currently stored! You need to retrieve them first before they can roll.`
       );
     }

     // ------------------- Check Available Pet Rolls -------------------
     if (pet.rollsRemaining <= 0) {
       return interaction.editReply(
         "❌ Your pet has no rolls left this week. Rolls reset every Sunday. You can increase your roll limit by training your pet! [Learn more](#)"
       );
     }

     // ------------------- Check Last Roll Date -------------------
     const now = new Date();
     const lastRoll = pet.lastRollDate ? new Date(pet.lastRollDate) : null;
     const isSameDay = lastRoll && 
       lastRoll.getFullYear() === now.getFullYear() &&
       lastRoll.getMonth() === now.getMonth() &&
       lastRoll.getDate() === now.getDate();

     if (isSameDay) {
       // Create a beautiful embed for the pet cooldown error
       const cooldownEmbed = new EmbedBuilder()
         .setAuthor({ name: character.name, iconURL: character.icon })
         .setTitle("😴 Pet Needs Rest")
         .setDescription(`${pet.name} is exhausted from today's adventures and needs time to recover.`)
         .setThumbnail(sanitizeUrl(encodePetImageUrl(pet.imageUrl) || pet.imageUrl))
         .addFields(
           { 
             name: "🐾 Pet Name", 
             value: `> ${pet.name}`, 
             inline: true 
           },
           { 
             name: "🦊 Species", 
             value: `> ${pet.species}`, 
             inline: true 
           },
           { 
             name: "📊 Level", 
             value: `> Level ${pet.level}`, 
             inline: true 
           },
           { 
             name: "🎲 Rolls Remaining", 
             value: `> ${pet.rollsRemaining} rolls this week`, 
             inline: true 
           },
           { 
             name: "⏰ Last Roll", 
             value: `> Today at ${lastRoll.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}`, 
             inline: true 
           },
           { 
             name: "🔄 Next Available", 
             value: `> Tomorrow at 8:00 AM`, 
             inline: true 
           }
         )
         .setColor("#FF6B35")
         .setImage("https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png")
         .setFooter({ 
           text: "Pets can only roll once per day and reset at 8:00 AM daily" 
         });
       
       return interaction.editReply({ embeds: [cooldownEmbed], ephemeral: true });
     }

     // ------------------- Check Inventory Sync -------------------
     try {
       await checkInventorySync(character);
     } catch (error) {
       // Check if this is an inventory sync error and create an embed for it
       if (error.message.includes('inventory is not synced')) {
         const inventorySyncEmbed = new EmbedBuilder()
           .setAuthor({ name: character.name, iconURL: character.icon })
           .setTitle("❌ Inventory Sync Required")
           .setDescription(`${character.name}'s inventory needs to be synchronized before your pet can perform actions.`)
           .addFields(
             { 
               name: "🔧 Required Steps", 
               value: "1. Use `/inventory test` to test your inventory\n2. Use `/inventory sync` to sync it", 
               inline: false 
             },
             { 
               name: "📋 Why This Happens", 
               value: "Your inventory data needs to be synchronized with the database to ensure accurate item tracking.", 
               inline: false 
             }
           )
           .setColor("#FF6B35")
           .setImage("https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png")
           .setFooter({ 
             text: "Please sync your inventory and try again" 
           });
         
         return interaction.editReply({ embeds: [inventorySyncEmbed], ephemeral: true });
       }
       
       // For other errors, use the original error message
       await interaction.editReply({
         content: error.message,
         ephemeral: true
       });
       return;
     }

     // ------------------- Determine Roll Combination and Type -------------------
     const petTypeData = getPetTypeData(pet.petType);
     if (!petTypeData) {
      console.error(
       `[pet.js]: logs - Unknown pet type for pet with name ${petName}`
      );
      return interaction.editReply(
       "❌ **Unknown pet type configured for this pet.**"
      );
     }
     const rollCombination = petTypeData.rollCombination;
     const userRollType = interaction.options.getString("rolltype");
     let chosenRoll;
     if (userRollType) {
      if (!rollCombination.includes(userRollType)) {
       return interaction.editReply(
        `❌ **Invalid roll type. Available roll types: ${rollCombination.join(
         ", "
        )}**`
       );
      }
      chosenRoll = userRollType;
     } else {
      chosenRoll =
       rollCombination[Math.floor(Math.random() * rollCombination.length)];
     }

     // ------------------- Get Perk Field and Filter Items -------------------
     const perkField = getPerkField(chosenRoll);
     const availableItems = await fetchAllItems();
     const itemsBasedOnPerk = availableItems.filter(
      (item) => item[perkField] === true
     );
     if (itemsBasedOnPerk.length === 0) {
      return interaction.editReply(
       `⚠️ **No items available for the \`${chosenRoll}\` roll.**`
      );
     }

     // ------------------- Determine Random Item -------------------
     const weightedItems = createWeightedItemList(itemsBasedOnPerk);
     const randomItem =
      weightedItems[Math.floor(Math.random() * weightedItems.length)];

     // ------------------- Deduct Pet Roll and Update Database -------------------
     // Deduct the roll
     const newRollsRemaining = Math.max(0, pet.rollsRemaining - 1);
     await updatePetRolls(character._id, petName, newRollsRemaining);
     pet.rollsRemaining = newRollsRemaining;
     
     // Only set lastRollDate after a successful roll
     pet.lastRollDate = now;
     await Pet.updateOne(
       { _id: pet._id },
       { $set: { lastRollDate: now } }
     );
     const quantity = 1;
     await addItemInventoryDatabase(
      character._id,
      randomItem.itemName,
      quantity,
      interaction
     );

     // ------------------- Log Roll Details to Google Sheets (if applicable) -------------------
     const inventoryLink = character.inventory || character.inventoryLink;
     if (isValidGoogleSheetsUrl(inventoryLink)) {
      const spreadsheetId = extractSpreadsheetId(inventoryLink);
      const auth = await authorizeSheets();
      const values = [
       [
        character.name,
        randomItem.itemName,
        quantity.toString(),
        randomItem.category.join(", "),
        randomItem.type.join(", "),
        randomItem.subtype.join(", "),
        "Pet Roll",
        character.job,
        pet.chosenRoll,
        character.currentVillage,
        `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
        uuidv4(),
       ],
      ];
      await safeAppendDataToSheet(character.inventory, character, "loggedInventory!A2:M", values, undefined, { 
        skipValidation: true,
        context: {
          commandName: 'pet',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          characterName: character.name,
          spreadsheetId: extractSpreadsheetId(character.inventory),
          range: 'loggedInventory!A2:M',
          sheetType: 'inventory',
          options: {
            petName: pet.name,
            petSpecies: pet.species,
            petType: pet.petType,
            petLevel: pet.level,
            chosenRoll: pet.chosenRoll,
            itemName: randomItem.itemName,
            quantity: quantity
          }
        }
      });
     }

     // ------------------- Build Roll Result Embed -------------------
     const flavorTextMessage = getFlavorText(
      chosenRoll,
      pet.name,
      pet.species,
      randomItem.itemName
     );

     // ------------------- Determine Embed Color Based on Village -------------------
     const villageName =
      character.currentVillage.charAt(0).toUpperCase() +
      character.currentVillage.slice(1).toLowerCase();
     const villageColors = {
      Rudania: "#d7342a",
      Inariko: "#277ecd",
      Vhintl: "#25c059",
     };
     const embedColor = villageColors[villageName] || "#00FF00";

     // ------------------- Calculate Roll Display -------------------
     const maxRolls = pet.level;
     const petEmoji = getPetEmoji(pet.species);
     const rollsDisplay = getRollsDisplay(pet.rollsRemaining, pet.level);

     // ------------------- Create and Send Roll Result Embed -------------------
     const rollEmbed = new EmbedBuilder()
      .setAuthor({ name: `${pet.name} the ${pet.species}`, iconURL: sanitizeUrl(encodePetImageUrl(pet.imageUrl) || pet.imageUrl) })
      .setThumbnail(sanitizeUrl(randomItem.image || "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png"))
      .setTitle(
       `${character.name}'s Pet Roll - ${pet.name} | Level ${pet.level}`
      )
      .setColor(embedColor)
      .setDescription(flavorTextMessage)
      .setImage(sanitizeUrl("https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png"))
      .addFields(
       { name: "__Pet Name__", value: `> ${pet.name}`, inline: false },
       {
        name: "__Pet Species__",
        value: `> ${petEmoji} ${pet.species}`,
        inline: true,
       },
       { name: "__Pet Type__", value: `> ${pet.petType}`, inline: true },
       {
        name: "__Rolls & Level__",
        value: `> ${rollsDisplay} | ${pet.level}`,
        inline: true,
       },
       {
        name: "__Village__",
        value: `> ${character.currentVillage}`,
        inline: true,
       },
       { name: "__Table__", value: `> \`${chosenRoll}\``, inline: true },
       {
        name: "__Item Gathered__",
        value: `> ${randomItem.emoji || ""} ${randomItem.itemName}`,
        inline: true,
       },
       {
        name: "__Character Inventory__",
        value: `> [Inventory Link](${character.inventory})`,
        inline: false,
       }
      )
      .setFooter({
       text: `${pet.rollsRemaining} rolls left this week | Pet Rolls reset every Sunday at midnight!`,
       iconURL: character.icon
      });
     return interaction.editReply({ embeds: [rollEmbed] });
    }

    // ------------------- Subcommand: Upgrade -------------------
    if (subcommand === "upgrade") {
     const targetLevel = interaction.options.getInteger("level");

     // only allow levels 1–3
     // enforce +1 only
     if (targetLevel !== pet.level + 1) {
       if (pet.level === 3) {
         return interaction.editReply(
           `❌ **Your pet is already at the maximum level (Level 3). No further upgrades are possible.**`
         );
       }
       return interaction.editReply(
         `❌ **You can only upgrade from level ${pet.level} to level ${pet.level + 1}.**`
       );
     }

     const userId = interaction.user.id;
     const balance = await getTokenBalance(userId);
     const cost = getUpgradeCost(targetLevel);

     // check balance
     if (balance < cost) {
       return interaction.editReply(
         `❌ **You only have ${balance} tokens, but upgrading to level ${targetLevel} costs ${cost}.**`
       );
     }

     // deduct tokens
     await updateTokenBalance(userId, -cost);

     // perform the upgrade
     await upgradePetLevel(character._id, petName, targetLevel);
     // Don't call updatePetRolls here as it sets lastRollDate
     // The upgradePetLevel function already sets rollsRemaining to the new level

     // Log to token tracker sheet if available
     const User = require("../../models/UserModel");
     const { safeAppendDataToSheet } = require("../../utils/googleSheetsUtils");
     const user = await User.findOne({ discordId: userId });
     if (user && user.tokenTracker) {
       const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
       const tokenRow = [
         `${pet.name} - Pet Upgrade to Level ${targetLevel}`,
         interactionUrl,
         "pet upgrade",
         "spent",
         `-${cost}`
       ];
       try {
         await safeAppendDataToSheet(user.tokenTracker, user, "loggedTracker!B7:F", [tokenRow], undefined, { skipValidation: true });
       } catch (sheetError) {
         console.error(`[pet.js]: ❌ Error logging pet upgrade to token tracker:`, sheetError);
       }
     }

     // ------------------- Determine Embed Color Based on Village -------------------
     const villageName =
      character.currentVillage.charAt(0).toUpperCase() +
      character.currentVillage.slice(1).toLowerCase();
     const villageColors = {
      Rudania: "#d7342a",
      Inariko: "#277ecd",
      Vhintl: "#25c059",
     };
     const embedColor = villageColors[villageName] || "#00FF00";

     // ------------------- Calculate Roll Display -------------------
     const petEmoji = getPetEmoji(pet.species);
     const rollsDisplay = getRollsDisplay(targetLevel, targetLevel);

     // ------------------- Create and Send Upgrade Success Embed -------------------
     const upgradeEmbed = new EmbedBuilder()
      .setAuthor({ name: character.name, iconURL: character.icon })
      .setTitle(`⬆️ Pet Upgrade Successful — ${pet.name}`)
      .setThumbnail(sanitizeUrl(encodePetImageUrl(pet.imageUrl) || pet.imageUrl))
      .setColor(embedColor)
      .setDescription(`🎉 **${pet.name}** has successfully advanced to **Level ${targetLevel}!**`)
      .setImage(sanitizeUrl("https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png"))
             .addFields(
        { name: "__Pet Name__", value: `> ${pet.name}`, inline: true },
        { name: "__Owner__", value: `> ${character.name}`, inline: true },
        { name: "__Previous Level__", value: `> Level ${pet.level}`, inline: true },
        { name: "__New Level__", value: `> Level ${targetLevel}`, inline: true },
        {
         name: "__Pet Species__",
         value: `> ${petEmoji} ${pet.species}`,
         inline: true,
        },
        { name: "__Pet Type__", value: `> ${pet.petType}`, inline: true },
        {
         name: "__New Rolls__",
         value: `> ${rollsDisplay}`,
         inline: true,
        },
        {
         name: "__Token Cost__",
         value: `> 💰 ${cost.toLocaleString()} tokens spent`,
         inline: true,
        },
        {
         name: "__Remaining Balance__",
         value: `> 💰 ${(balance - cost).toLocaleString()} tokens`,
         inline: true,
        },
        {
         name: "__Village__",
         value: `> ${character.currentVillage}`,
         inline: true,
        }
       )
      .setFooter({
       text: `Pet upgraded successfully! Rolls reset every Sunday at midnight.`,
       iconURL: character.icon
      });

     // Add token tracker link if available
     if (user && user.tokenTracker) {
       upgradeEmbed.addFields({
        name: "__Token Tracker__",
        value: `> [View Token Tracker](${user.tokenTracker})`,
        inline: false,
       });
     }

     return interaction.editReply({ embeds: [upgradeEmbed] });
    }

    // ------------------- Subcommand: View Pet -------------------
    if (subcommand === "view") {
      try {
        // Find pet directly using Pet model - ensure we get fresh data
        // Force a fresh database fetch to avoid cached data
        const pet = await Pet.findOne({
          owner: character._id,
          name: petName
        }).exec();

        if (!pet) {
          return interaction.editReply({
            content: `❌ **Pet \`${petName}\` not found for character \`${character.name}\`.**`,
            ephemeral: true
          });
        }

        const petTypeData = getPetTypeData(pet.petType);
        
        // ------------------- Determine Embed Color Based on Village -------------------
        const villageName =
         character.currentVillage.charAt(0).toUpperCase() +
         character.currentVillage.slice(1).toLowerCase();
        const villageColors = {
         Rudania: "#d7342a",
         Inariko: "#277ecd",
         Vhintl: "#25c059",
        };
        const embedColor = villageColors[villageName] || "#00FF00";

        // ------------------- Check Roll Status -------------------
        const now = new Date();
        const lastRoll = pet.lastRollDate ? new Date(pet.lastRollDate) : null;
        const isSameDay = lastRoll && 
          lastRoll.getFullYear() === now.getFullYear() &&
          lastRoll.getMonth() === now.getMonth() &&
          lastRoll.getDate() === now.getDate();
        
        let rollStatus = "🟢 Available";
        let rollStatusDescription = "Ready to roll today!";
        
        if (isSameDay) {
          rollStatus = "🔴 Used Today";
          rollStatusDescription = `Last rolled at ${lastRoll.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}`;
        } else if (pet.rollsRemaining <= 0) {
          rollStatus = "🟡 No Rolls Left";
          rollStatusDescription = "Rolls reset every Sunday at midnight";
        }

        // ------------------- Calculate Rolls Display Based on Today's Usage -------------------
        let rollsDisplay;
        if (isSameDay) {
          // If pet rolled today, show remaining rolls as available (🔔) and one as used (🔕)
          // For a Level 3 pet that rolled today: should show 🔔🔔🔕 (2 remaining, 1 used today)
          // The pet has used 1 roll today, so show (level - 1) available bells + 1 used bell
          const availableRolls = Math.max(0, pet.level - 1); // Level 3 pet that rolled = 2 available
          const usedToday = 1;
          rollsDisplay = "🔔".repeat(availableRolls) + "🔕".repeat(usedToday);
        } else {
          // Normal display based on rolls remaining vs level
          rollsDisplay = getRollsDisplay(pet.rollsRemaining || 0, pet.level || 0);
        }

        // ------------------- Calculate Next Upgrade Info -------------------
        let upgradeInfo = "🎉 Maximum Level Reached!";
        let upgradeCost = "N/A";
        
        if (pet.level < 3) {
          const nextLevel = pet.level + 1;
          const cost = getUpgradeCost(nextLevel);
          upgradeInfo = `Level ${nextLevel} (${cost.toLocaleString()} tokens)`;
          upgradeCost = `${cost.toLocaleString()} tokens`;
        }
        
        const viewEmbed = new EmbedBuilder()
          .setAuthor({ name: character.name, iconURL: character.icon })
          .setTitle(`🐾 ${pet.name} — Pet Details`)
          .setThumbnail(sanitizeUrl(encodePetImageUrl(pet.imageUrl) || pet.imageUrl))
          .setColor(embedColor)
          .setImage(sanitizeUrl("https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png"))
          .addFields(
            { name: "__Pet Name__", value: `> ${pet.name}`, inline: true },
            { name: "__Owner__", value: `> ${character.name}`, inline: true },
            { name: "__Village__", value: `> ${character.currentVillage}`, inline: true },
            {
              name: "__Pet Species__",
              value: `> ${getPetEmoji(pet.species)} ${pet.species}`,
              inline: true,
            },
            { name: "__Pet Type__", value: `> ${pet.petType}`, inline: true },
            { name: "__Status__", value: `> ${pet.status === 'active' ? '🟢 Active' : '🔵 Stored'}`, inline: true },
            {
              name: "__Current Level__",
              value: `> Level ${pet.level || 0}`,
              inline: true,
            },
            {
              name: "__Rolls Available__",
              value: `> ${rollsDisplay}`,
              inline: true,
            },
            {
              name: "__Roll Status__",
              value: `> ${rollStatus}`,
              inline: true,
            },
            {
              name: "__Next Upgrade__",
              value: `> ${upgradeInfo}`,
              inline: true,
            },
            {
              name: "🎲 Available Roll Types",
              value: petTypeData.rollCombination.join(", "),
              inline: false,
            },
            {
              name: "📝 Pet Description",
              value: petTypeData.description,
              inline: false,
            }
          )
          .setFooter({
            text: rollStatusDescription,
            iconURL: character.icon
          });

        return interaction.editReply({ embeds: [viewEmbed] });
      } catch (error) {
        console.error(`[pet.js]: ❌ Error viewing pet:`, error);
        return interaction.editReply({
          content: `❌ **An error occurred while viewing your pet. Please try again later.**`,
          ephemeral: true
        });
      }
    }
  } catch (error) {
    handleError(error, 'pet.js');
    console.error(`[pet.js]: ❌ Error during pet command execution:`, error);

    try {
      await interaction.editReply({
        content: '❌ **An error occurred while processing your pet command. Please try again later.**',
        ephemeral: true
      });
    } catch (replyError) {
      console.error(`[pet.js]: ❌ Error sending error response:`, replyError);
    }
  }
 },
};

