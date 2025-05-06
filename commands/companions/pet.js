// ------------------- Discord.js Components -------------------
// These are used to build and send embeds and slash commands.
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { handleError } = require("../../utils/globalErrorHandler");
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

// ============================================================================
// ------------------- Slash Command Definition for Pets -------------------
// This object defines the pet slash command and its subcommands (roll, upgrade, add, edit, retire).
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
      .setDescription("Enter your character’s name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("petname")
      .setDescription("Enter your pet’s name")
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
    .setDescription("⬆️ Upgrade your pet’s level")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Enter your character’s name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("petname")
      .setDescription("Enter your pet’s name")
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
    .setDescription(" Add a new pet or update an existing pet’s image")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Enter your character’s name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("petname")
      .setDescription("Enter the pet’s name")
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
    .setDescription("Edit your pet’s image")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Enter your character’s name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("petname")
      .setDescription("Enter the pet’s name")
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
  // ------------------- Subcommand: Retire -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("retire")
    .setDescription("Retire your active pet")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Enter your character’s name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("petname")
      .setDescription("Enter the pet’s name to retire")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  // ------------------- Subcommand: View -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("view")
    .setDescription("View details for one of your pets")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Enter your character’s name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("petname")
      .setDescription("Enter your pet’s name")
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
   // ------------------- Retrieve Command Options -------------------
   // Extract the user's ID, character name, pet name, and the subcommand.
   const userId = interaction.user.id;

   // strip off any " – village – job" suffix if someone pastes the full label
   const rawCharacter = interaction.options.getString("charactername");
   const characterName = rawCharacter.split(" - ")[0];

   const petName = interaction.options.getString("petname");
   const subcommand = interaction.options.getSubcommand();

   // ------------------- Fetch Character Data -------------------
   // Retrieve the character associated with the user.
   const character = await fetchCharacterByNameAndUserId(characterName, userId);
   if (!character) {
    return interaction.reply(
     "❌ **Character not found. Please ensure your character exists.**"
    );
   }

   // ------------------- Initialize Pets Array -------------------
   // Ensure the character has a pets array.
   if (!character.pets) character.pets = [];

   // ------------------- Check for Existing Pet -------------------
   // Find the pet by name in the character’s pets array.
   const existingPet = character.pets.find((pet) => pet.name === petName);

   // ------------------- Subcommand: Add Pet or Update Pet Details -------------------
if (subcommand === "add") {
  // If adding a new pet, prevent adding if an active pet already exists.
  if (!existingPet && character.currentActivePet) {
    return interaction.reply(
      "❌ **You already have an active pet. Please update your current pet instead of adding a new one.**"
    );
  }

  // ------------------- Retrieve Additional Options -------------------
  const species = interaction.options.getString("species");
  const category = interaction.options.getString("category");
  const petType = interaction.options.getString("pettype");
  const imageAttachment = interaction.options.getAttachment("image");

  // Normalize species for lookup
  const normalizedSpeciesKey = species.toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
  const allowedRolls = speciesRollPermissions[normalizedSpeciesKey];

  // ------------------- Validate Species -------------------
  
  if (!allowedRolls) {
    return interaction.reply(`❌ **Unknown or unsupported species \`${species}\`. Please select a valid species.**`);
  }

// Validate petTypeData existence
const selectedPetTypeData = getPetTypeData(petType);
if (!selectedPetTypeData) {
  return interaction.reply(`❌ **Unknown or unsupported pet type \`${petType}\`.**`);
}

// Validate Species Compatibility with Pet Type
if (!canSpeciesPerformPetType(normalizedSpeciesKey, petType)) {
  const allowedRollsFormatted = allowedRolls.map((roll) => `\`${roll}\``).join(", ");
  const validPetTypes = Object.keys(petTypeData).filter((type) =>
    canSpeciesPerformPetType(normalizedSpeciesKey, type)
  );
  const validPetTypesFormatted = validPetTypes.length > 0 ? validPetTypes.map((type) => `\`${type}\``).join(", ") : "None";

  return interaction.reply(
    `❌ **The selected species \`${species}\` cannot be assigned to the pet type \`${petType}\`.**\n\n` +
    `__Allowed Rolls__: ${allowedRollsFormatted}\n` +
    `__Compatible Pet Types__: ${validPetTypesFormatted}\n\n` +
    `👉 **Please choose a compatible pet type based on your species' available rolls.**`
  );
}

  // ------------------- Upload Pet Image (If Provided) -------------------
  let petImageUrl = "";
  if (imageAttachment) {
    try {
      petImageUrl = await uploadPetImage(imageAttachment.url, petName);
      console.log(`[pet.js]: logs - Image uploaded successfully. Public URL: ${petImageUrl}`);
    } catch (error) {
      handleError(error, "pet.js");
      console.error(`[pet.js]: logs - Error uploading image for pet "${petName}": ${error.message}`);
      return interaction.reply("❌ **Failed to upload image. Please try again later.**");
    }
  }

  // ------------------- Update Existing Pet or Add New Pet -------------------
  if (existingPet) {
    existingPet.species = species;
    existingPet.perks = [petType];
    existingPet.imageUrl = petImageUrl || existingPet.imageUrl;
    await updatePetToCharacter(character._id, petName, existingPet);

    if (!character.currentActivePet) {
      await Character.findByIdAndUpdate(character._id, { currentActivePet: existingPet._id });
    }

    return interaction.reply(`✅ **Updated pet \`${petName}\` with new details.**`);
  } else {
    await addPetToCharacter(character._id, petName, species, 0, petType, petImageUrl);

    const newPet = await Pet.create({
      ownerName: character.name,
      owner: character._id,
      name: petName,
      species,
      petType,
      level: 0,
      rollsRemaining: 0,
      imageUrl: petImageUrl || "",
      rollCombination: selectedPetTypeData.rollCombination,
      tableDescription: selectedPetTypeData.description,
    });
    

    await Character.findByIdAndUpdate(character._id, { currentActivePet: newPet._id });

    const rollsDisplay = "🔔".repeat(newPet.rollsRemaining) + "🔕".repeat(newPet.level - newPet.rollsRemaining);
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
        { name: "Roll Combination", value: selectedPetTypeData.rollCombination.join(", "), inline: false },
        { name: "Description",      value: selectedPetTypeData.description,               inline: false }
      )
      .setImage(petImageUrl || "https://via.placeholder.com/150")
      .setColor("#00FF00");

    return interaction.reply({ embeds: [successEmbed] });
  }
}

   // ------------------- Subcommand: Edit Pet Image -------------------
   // This branch handles updating the image of an existing pet.
   if (subcommand === "edit") {
    // Retrieve the image attachment.
    const imageAttachment = interaction.options.getAttachment("image");
    if (!imageAttachment) {
     return interaction.reply(
      "❌ **Please upload an image to update your pet.**"
     );
    }

    // Verify pet exists in the database
    const petDoc = await Pet.findOne({ name: petName, owner: character._id });
    if (!petDoc) {
     return interaction.reply(
      `❌ **Pet \`${petName}\` not found. Please add it first with \`/pet add\`.**`
     );
    }

    // Attempt to upload the new image
    let petImageUrl = "";
    try {
     petImageUrl = await uploadPetImage(imageAttachment.url, petName);
     console.log(
      `[pet.js]: logs - Image uploaded successfully. URL: ${petImageUrl}`
     );
    } catch (error) {
     handleError(error, "pet.js");
     console.error(`[pet.js]: logs - Error uploading image: ${error.message}`);
     return interaction.reply(
      "❌ **Failed to upload image. Please try again later.**"
     );
    }

    // Update the pet's image and save changes
    petDoc.imageUrl = petImageUrl;
    await updatePetToCharacter(character._id, petName, petDoc);

    // Build and send embed showing updated pet
    const editEmbed = new EmbedBuilder()
     .setAuthor({ name: character.name, iconURL: character.icon })
     .setTitle(`Pet Image Updated — ${petDoc.name}`)
     .setThumbnail(petDoc.imageUrl)
     .addFields(
      { name: "Name", value: `\`${petDoc.name}\``, inline: true },
      { name: "Species", value: petDoc.species, inline: true },
      { name: "Type", value: petDoc.petType, inline: true },
      { name: "Level", value: `${petDoc.level}`, inline: true },
      {
       name: "Rolls Remaining",
       value: `${petDoc.rollsRemaining}`,
       inline: true,
      }
     )
     .setImage(petDoc.imageUrl)
     .setColor("#00FF00");

    return interaction.reply({ embeds: [editEmbed] });
   }

   // ------------------- Verify Pet Existence for Roll, Upgrade, and Retire -------------------
   // Determine if the pet exists in the Pet collection by checking its ID or name.
   let pet;
   if (petName.match(/^[0-9a-fA-F]{24}$/)) {
    console.log(
     `[pet.js]: logs - petName "${petName}" looks like an ObjectId. Searching by _id.`
    );
    pet = await Pet.findOne({ _id: petName, owner: character._id });
   } else {
    console.log(
     `[pet.js]: logs - petName "${petName}" does not look like an ObjectId. Searching by name.`
    );
    pet = await Pet.findOne({ name: petName, owner: character._id });
   }

   if (!pet) {
    console.error(
     `[pet.js]: logs - Pet with identifier "${petName}" not found for character ${characterName}`
    );
    return interaction.reply(
     `❌ **Pet \`${petName}\` not found. Please add the pet first using the \`/pet add\` command.**`
    );
   }

   // ------------------- Subcommand: Roll -------------------
   if (subcommand === "roll") {
    // ------------------- Defer Reply for Longer Operations -------------------
    await interaction.deferReply();

// ------------------- Check Available Pet Rolls -------------------
if (pet.rollsRemaining <= 0) {
  return interaction.editReply(
    "❌ Your pet has no rolls left this week. Rolls reset every Sunday. You can increase your roll limit by training your pet! [Learn more](#)"
  );
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
    const newRollsRemaining = pet.rollsRemaining - 1;
    console.log(
     `[pet.js]: logs - Deducting pet roll. Old rollsRemaining: ${pet.rollsRemaining}, New rollsRemaining: ${newRollsRemaining}`
    );
    await updatePetRolls(character._id, petName, newRollsRemaining);
    pet.rollsRemaining = newRollsRemaining;
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
     await safeAppendDataToSheet(character.inventory, character, "loggedInventory!A2:M", values);
    }

    // ------------------- Build Roll Result Embed -------------------
    const flavorTextMessage = getFlavorText(
     chosenRoll,
     pet.name,
     pet.species,
     randomItem.itemName
    );

    console.log(
     `[pet.js]: logs - Building roll embed with ${newRollsRemaining} rolls remaining.`
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
    const usedRollsDisplay = maxRolls - pet.rollsRemaining;
    const rollsIcon =
     "🔔".repeat(pet.rollsRemaining) + "🔕".repeat(usedRollsDisplay);

    // ------------------- Create and Send Roll Result Embed -------------------
    const rollEmbed = new EmbedBuilder()
     .setAuthor({ name: character.name, iconURL: character.icon })
     .setThumbnail(pet.imageUrl || "https://via.placeholder.com/150")
     .setTitle(
      `${character.name}'s Pet Roll - ${pet.name} | Level ${pet.level}`
     )
     .setColor(embedColor)
     .setDescription(flavorTextMessage)
     .setImage(
      "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png"
     )
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
       value: `> ${rollsIcon} | ${pet.level}`,
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
    return interaction.reply(
      `❌ **Your pet is already at the maximum level (Level 3). No further upgrades are possible.**`
    );
  }
  return interaction.reply(
    `❌ **You can only upgrade from level ${pet.level} to level ${pet.level + 1}.**`
  );
}


    const userId = interaction.user.id;
    const balance = await getTokenBalance(userId);
    const cost = getUpgradeCost(targetLevel);

    // check balance
    if (balance < cost) {
     return interaction.reply(
      `❌ **You only have ${balance} tokens, but upgrading to level ${targetLevel} costs ${cost}.**`
     );
    }

    // deduct tokens
    await updateTokenBalance(userId, -cost);

    // perform the upgrade
    await upgradePetLevel(character._id, petName, targetLevel);
    await updatePetRolls(character._id, petName, targetLevel);

    return interaction.reply(
     `✅ **${pet.name} is now level ${targetLevel}!**\n` +
      `💰 Spent ${cost} tokens — you have ${balance - cost} left.\n` +
      `🎲 Rolls remaining set to ${targetLevel}.`
    );
   }

   // ------------------- Subcommand: Retire -------------------
   if (subcommand === "retire") {
    await interaction.deferReply();
    if (pet.status === "retired") {
     return interaction.editReply(`❌ **${pet.name} is already retired.**`);
    }
    const updateResult = await Pet.updateOne(
     { _id: pet._id },
     { $set: { status: "retired" } }
    );
    console.log(
     `[pet.js]: logs - Retired pet ${pet.name}. Modified documents: ${
      updateResult.modifiedCount || updateResult.nModified || 0
     }`
    );
    if (
     character.currentActivePet &&
     character.currentActivePet.toString() === pet._id.toString()
    ) {
     await Character.findByIdAndUpdate(character._id, {
      currentActivePet: null,
     });
    }
    const updatedPetData = { ...pet.toObject(), status: "retired" };
    await updatePetToCharacter(character._id, pet.name, updatedPetData);
    const retireEmbed = new EmbedBuilder()
    .setAuthor({ name: character.name, iconURL: character.icon })
    .setTitle(`Pet Retired - ${pet.name}`)
    .setColor("#FF0000")
    .setDescription(
     `Your pet **${pet.name}** has been retired.\nYou can now add a new pet to your character.`
    )
    .setImage(pet.imageUrl || "https://via.placeholder.com/150")
    .setFooter({ text: "Pet retired successfully." });   
    return interaction.editReply({ embeds: [retireEmbed] });
   }

   // ------------------- Subcommand: View Pet -------------------
   if (subcommand === "view") {
    // Fetch the pet document
    const petDoc = await Pet.findOne({ name: petName, owner: character._id });
    if (!petDoc) {
     return interaction.reply(
      `❌ **Pet \`${petName}\` not found. Please add it first with \`/pet add\`.**`
     );
    }

    // Prepare rolls display
    const rollsDisplay =
     "🔔".repeat(petDoc.rollsRemaining) +
     "🔕".repeat(petDoc.level - petDoc.rollsRemaining);

    // Get pet type data for combination & description
    const petTypeData = getPetTypeData(petDoc.petType);

    // Build the embed
    const viewEmbed = new EmbedBuilder()
     .setAuthor({ name: character.name, iconURL: character.icon })
     .setTitle(`🐾 ${petDoc.name} — Details`)
     .setThumbnail(petDoc.imageUrl || "https://via.placeholder.com/150")
     .addFields(
      { name: "__Pet Name__", value: `> ${petDoc.name}`, inline: true },
      { name: "__Owner__", value: `> ${character.name}`, inline: true },
      {
       name: "__Pet Level & Rolls__",
       value: `> Level ${petDoc.level} | ${rollsDisplay}`,
       inline: true,
      },
      {
       name: "__Pet Species__",
       value: `> ${getPetEmoji(petDoc.species)} ${petDoc.species}`,
       inline: true,
      },
      { name: "__Pet Type__", value: `> ${petDoc.petType}`, inline: true },
      {
       name: "Roll Combination",
       value: petTypeData.rollCombination.join(", "),
       inline: false,
      },
      { name: "Description", value: petTypeData.description, inline: false }
     )
     .setImage(petDoc.imageUrl || "https://via.placeholder.com/150")
     .setColor("#00FF00");

    return interaction.reply({ embeds: [viewEmbed] });
   }
  } catch (error) {
   handleError(error, "pet.js");

   // ------------------- Global Error Handling -------------------
   // Log detailed error information and return a user-friendly error message.
   console.error(
    `[pet.js]: logs - Error executing pet command: ${error.message}`
   );
   console.error(`[pet.js]: logs - Stack trace: ${error.stack}`);
   return interaction.reply(
    "❌ **An unexpected error occurred. Please try again later.**"
   );
  }
 },
};
