// ------------------- Autocomplete Handler for Various Commands -------------------

// ------------------- Standard Libraries -------------------
const { MongoClient } = require("mongodb");

const { handleError } = require("../utils/globalErrorHandler");
// ------------------- Database Connections -------------------

// ------------------- Database Services -------------------
const {
 connectToInventories,
 connectToTinglebot,
 fetchAllCharacters,
 fetchAllCharactersExceptUser,
 fetchBlightedCharactersByUserId,
 fetchCharacterByName,
 fetchCharacterByNameAndUserId,
 fetchCharactersByUserId,
 getCharacterInventoryCollection,
 fetchCraftableItemsAndCheckMaterials,
 getCurrentVendingStockList,
} = require("../database/db");
// ------------------- Modules -------------------
const {
 capitalize,
 capitalizeFirstLetter,
 capitalizeWords,
} = require("../modules/formattingModule");
const {
 getGeneralJobsPage,
 getJobPerk,
 getVillageExclusiveJobs,
} = require("../modules/jobsModule");
const { getAllVillages } = require("../modules/locationsModule");
const {
 modCharacters,
 getModCharacterByName,
} = require("../modules/modCharacters");
const { normalPets, specialPets } = require("../modules/petModule");
const { getAllRaces } = require("../modules/raceModule");

// ------------------- Database Models -------------------
const Character = require("../models/CharacterModel");
const Item = require("../models/ItemModel");
const Mount = require("../models/MountModel");
const Party = require("../models/PartyModel");
const Pet = require("../models/PetModel");
const ShopStock = require("../models/ShopsModel");
const { Village } = require("../models/VillageModel");

// ============================================================================
// MAIN FUNCTION TO HANDLE AUTOCOMPLETE INTERACTIONS
// ============================================================================

async function handleAutocomplete(interaction) {
 try {
  await connectToTinglebot(); // Ensure MongoDB connection

  const focusedOption = interaction.options.getFocused(true); // Get the focused option
  const commandName = interaction.commandName; // Get the command name

  // ------------------- BLIGHT Commands -------------------
  if (
   commandName === "blight" &&
   (focusedOption.name === "character_name" ||
    focusedOption.name === "healer_name")
  ) {
   await handleBlightCharacterAutocomplete(interaction, focusedOption);
  } else if (commandName === "blight" && focusedOption.name === "item") {
   await handleBlightItemAutocomplete(interaction, focusedOption);

   // ------------------- BOOSTING Commands -------------------
  } else if (commandName === "boosting" && focusedOption.name === "character") {
   await handleCharacterBasedCommandsAutocomplete(
    interaction,
    focusedOption,
    commandName
   );
  } else if (commandName === "boosting" && focusedOption.name === "booster") {
   await handleBoostingCharacterAutocomplete(interaction, focusedOption);

   // ------------------- CHANGEJOB Commands -------------------
  } else if (commandName === "changejob" && focusedOption.name === "newjob") {
   await handleChangeJobNewJobAutocomplete(interaction, focusedOption);

   // ------------------- Generic CHARACTER-BASED Commands (e.g., CHANGEJOB) -------------------
  } else if (
   commandName === "changejob" &&
   focusedOption.name === "charactername"
  ) {
   await handleCharacterBasedCommandsAutocomplete(
    interaction,
    focusedOption,
    commandName
   );

   // ------------------- COMBAT Commands -------------------

   // ------------------- CRAFTING Commands -------------------
  } else if (commandName === "crafting" && focusedOption.name === "itemname") {
   await handleCraftingAutocomplete(interaction, focusedOption);
  } else if (
   commandName === "crafting" &&
   focusedOption.name === "charactername"
  ) {
   await handleCharacterBasedCommandsAutocomplete(
    interaction,
    focusedOption,
    commandName
   );

   // ------------------- CREATECHARACTER Commands -------------------
  } else if (
   commandName === "createcharacter" &&
   focusedOption.name === "homevillage"
  ) {
   await handleCreateCharacterVillageAutocomplete(interaction, focusedOption);
  } else if (
   commandName === "createcharacter" &&
   focusedOption.name === "race"
  ) {
   await handleCreateCharacterRaceAutocomplete(interaction, focusedOption);

   // ------------------- CUSTOMWEAPON Commands -------------------
  } else if (
   commandName === "customweapon" &&
   interaction.options.getSubcommand() === "submit" &&
   focusedOption.name === "baseweapon"
  ) {
   await handleBaseWeaponAutocomplete(interaction);
  } else if (
   commandName === "customweapon" &&
   interaction.options.getSubcommand() === "submit" &&
   focusedOption.name === "subtype"
  ) {
   await handleSubtypeAutocomplete(interaction);

   // ------------------- DELIVER Commands -------------------
   if (commandName === "deliver") {
    const subcommand = interaction.options.getSubcommand();
    if (focusedOption.name === "sender") {
     // Handle autocomplete for sender in deliver command
     await handleCourierSenderAutocomplete(interaction, focusedOption);
     return;
    } else if (
     ["request", "vendingstock"].includes(subcommand) &&
     focusedOption.name === "courier"
    ) {
     // Handle autocomplete for courier selection in request or vendingstock subcommands
     await handleCourierAutocomplete(interaction, focusedOption);
     return;
    } else if (subcommand === "vendingstock") {
     if (focusedOption.name === "recipient") {
      // Handle autocomplete for vending stock recipient
      await handleVendingRecipientAutocomplete(interaction, focusedOption);
      return;
     } else if (focusedOption.name === "vendor") {
      // Handle autocomplete for vendor selection (or recipient alternatively)
      await handleRecipientAutocomplete(interaction, focusedOption);
      return;
     } else if (focusedOption.name === "vendoritem") {
      // Handle autocomplete for vendor item selection
      await handleVendorItemAutocomplete(interaction, focusedOption);
      return;
     }
    } else if (
     ["accept", "fulfill"].includes(subcommand) &&
     focusedOption.name === "courier"
    ) {
     // Handle autocomplete for courier acceptance in deliver command
     await handleCourierAcceptAutocomplete(interaction, focusedOption);
     return;
    } else if (subcommand === "request") {
     if (focusedOption.name === "recipient") {
      // Handle autocomplete for recipient in a deliver request
      await handleAllRecipientAutocomplete(interaction, focusedOption);
      return;
     } else if (focusedOption.name === "item") {
      // Handle autocomplete for item in a deliver request
      await handleDeliverItemAutocomplete(interaction, focusedOption);
      return;
     }
    }
   }

   // ------------------- EDITCHARACTER Commands -------------------
  } else if (
   commandName === "editcharacter" &&
   focusedOption.name === "updatedinfo"
  ) {
   await handleEditCharacterAutocomplete(interaction, focusedOption);

   // ------------------- EXPLORE Commands -------------------
  } else if (
   commandName === "explore" &&
   ["item1", "item2", "item3"].includes(focusedOption.name)
  ) {
   await handleExploreItemAutocomplete(interaction, focusedOption);
  } else if (
   commandName === "explore" &&
   focusedOption.name === "charactername"
  ) {
   await handleExploreRollCharacterAutocomplete(interaction, focusedOption);

   // ------------------- GEAR Commands -------------------
  } else if (commandName === "gear" && focusedOption.name === "itemname") {
   await handleGearAutocomplete(interaction, focusedOption);

   // ------------------- GIFT Commands -------------------
  } else if (commandName === "gift") {
   await handleGiftAutocomplete(interaction, focusedOption);

   // ------------------- HEAL Commands -------------------
  } else if (commandName === "heal") {
   await handleHealAutocomplete(interaction, focusedOption);

   // ------------------- ITEM Commands -------------------
  } else if (commandName === "item" && focusedOption.name === "itemname") {
    await handleItemAutocomplete(interaction);
   } else if (commandName === "item" && focusedOption.name === "charactername") {
    await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName);
   } else if (commandName === "item" && focusedOption.name === "jobname") {
    await handleItemJobVoucherAutocomplete(interaction, focusedOption);

   // ------------------- LOOKUP Commands -------------------
  } else if (
   commandName === "lookup" &&
   (focusedOption.name === "item" || focusedOption.name === "ingredient")
  ) {
   await handleLookupAutocomplete(interaction, focusedOption);

   // ------------------- MOD Commands -------------------
  } else if (
   commandName === "mod" &&
   interaction.options.getSubcommand() === "give" &&
   focusedOption.name === "character"
  ) {
   // /mod give — character autocomplete
   await handleModGiveCharacterAutocomplete(interaction, focusedOption);
  } else if (
   commandName === "mod" &&
   interaction.options.getSubcommand() === "give" &&
   focusedOption.name === "item"
  ) {
   // /mod give — item autocomplete
   await handleModGiveItemAutocomplete(interaction, focusedOption);
  } else if (
   commandName === "mod" &&
   interaction.options.getSubcommand() === "petlevel" &&
   focusedOption.name === "character"
  ) {
   // /mod petlevel — character autocomplete (needs a new helper)
   await handleModCharacterAutocomplete(interaction, focusedOption);
  } else if (
   commandName === "mod" &&
   interaction.options.getSubcommand() === "petlevel" &&
   focusedOption.name === "petname"
  ) {
   // /mod petlevel — pet-name autocomplete
   await handlePetNameAutocomplete(interaction, focusedOption);

   // ------------------- MOUNT/STABLE Commands -------------------
  } else if (
   (commandName === "mount" || commandName === "stable") &&
   focusedOption.name === "charactername"
  ) {
   await handleMountAutocomplete(interaction, focusedOption);
  } else if (
   (commandName === "mount" || commandName === "stable") &&
   focusedOption.name === "mountname"
  ) {
   await handleMountNameAutocomplete(interaction, focusedOption);

   // ------------------- PET Commands -------------------
  } else if (commandName === "pet") {
   if (focusedOption.name === "charactername") {
    await handleCharacterBasedCommandsAutocomplete(
     interaction,
     focusedOption,
     commandName
    );
   } else if (focusedOption.name === "petname") {
    await handlePetNameAutocomplete(interaction, focusedOption);
   } else if (focusedOption.name === "species") {
    await handlePetSpeciesAutocomplete(interaction, focusedOption);
   } else if (focusedOption.name === "rolltype") {
    await handlePetRollTypeAutocomplete(interaction, focusedOption);
   } else {
    await interaction.respond([]);
   }
   return;

   // ------------------- SHOPS Commands -------------------
  } else if (commandName === "shops" && focusedOption.name === "itemname") {
   await handleShopsAutocomplete(interaction, focusedOption);

   // ------------------- STEAL Commands -------------------
  } else if (
   commandName === "steal" &&
   focusedOption.name === "charactername"
  ) {
   await handleStealCharacterAutocomplete(interaction, focusedOption);
  } else if (commandName === "steal" && focusedOption.name === "target") {
   const npcChoices = [
    "Hank",
    "Sue",
    "Lukan",
    "Myti",
    "Cree",
    "Cece",
    "Walton",
    "Jengo",
    "Jasz",
    "Lecia",
    "Tye",
    "Lil Tim",
   ];
   const filteredNPCs = npcChoices.filter((choice) =>
    choice.toLowerCase().includes(focusedOption.value.toLowerCase())
   );
   await interaction.respond(
    filteredNPCs.map((choice) => ({ name: choice, value: choice }))
   );
  } else if (commandName === "steal" && focusedOption.name === "rarity") {
   const choices = ["common", "uncommon", "rare"];
   const filtered = choices.filter((choice) =>
    choice.startsWith(focusedOption.value.toLowerCase())
   );
   await interaction.respond(
    filtered.map((choice) => ({ name: choice, value: choice }))
   );

   // ------------------- TRADE Commands -------------------
  } else if (commandName === "trade") {
   if (focusedOption.name === "fromcharacter") {
    await handleTradeFromCharacterAutocomplete(interaction, focusedOption);
   } else if (focusedOption.name === "tocharacter") {
    await handleTradeToCharacterAutocomplete(interaction, focusedOption);
   } else if (["item1", "item2", "item3"].includes(focusedOption.name)) {
    await handleTradeItemAutocomplete(interaction, focusedOption);
   } else {
    await interaction.respond([]);
   }

   // ------------------- TRANSFER Commands -------------------
  } else if (commandName === "transfer") {
   // Autocomplete for transfer: route to the correct helper based on focusedOption
   if (["fromcharacter", "tocharacter"].includes(focusedOption.name)) {
    await handleTransferCharacterAutocomplete(interaction, focusedOption);
   } else if (["itema", "itemb", "itemc"].includes(focusedOption.name)) {
    await handleTransferItemAutocomplete(interaction, focusedOption);
   } else {
    await interaction.respond([]);
   }

   // ------------------- TRAVEL Commands -------------------
  } else if (
   commandName === "travel" &&
   focusedOption.name === "charactername"
  ) {
   await handleTravelAutocomplete(interaction, focusedOption);
  } else if (commandName === "travel" && focusedOption.name === "destination") {
   await handleVillageBasedCommandsAutocomplete(interaction, focusedOption);

   // ------------------- VENDING Commands -------------------
  } else if (commandName === "vending") {
   try {
    const subcommand = interaction.options.getSubcommand();
    const focusedOption = interaction.options.getFocused(true);

    if (subcommand === "restock" && focusedOption.name === "itemname") {
     await handleVendingRestockAutocomplete(interaction, focusedOption);
    } else if (subcommand === "barter" && focusedOption.name === "itemname") {
     await handleVendingBarterAutocomplete(interaction, focusedOption);
    } else if (subcommand === "editshop" && focusedOption.name === "itemname") {
     await handleVendingEditShopAutocomplete(interaction, focusedOption);
    } else if (
     subcommand === "viewshop" &&
     focusedOption.name === "charactername"
    ) {
     await handleViewVendingShopAutocomplete(interaction);
    } else if (focusedOption.name === "charactername") {
     // For other subcommands that need character autocomplete
     await handleCharacterBasedCommandsAutocomplete(
      interaction,
      focusedOption,
      "vending"
     );
    } else {
     await interaction.respond([]);
    }
   } catch (error) {
    handleError(error, "autocompleteHandler.js");
    await safeRespondWithError(interaction);
   }
  } else if (
   commandName === "village" &&
   focusedOption.name === "charactername"
  ) {
   await handleVillageUpgradeCharacterAutocomplete(interaction);
  } else if (commandName === "village" && focusedOption.name === "itemname") {
   await handleVillageMaterialsAutocomplete(interaction);

   // ------------------- VIEWINVENTORY Commands -------------------
  } else if (
   commandName === "viewinventory" &&
   focusedOption.name === "charactername"
  ) {
   await handleViewInventoryAutocomplete(interaction, focusedOption);

   // ------------------- Generic CHARACTER-BASED Autocomplete Commands -------------------
  } else if (
   [
    "changejob",
    "shops",
    "explore",
    "raid",
    "editcharacter",
    "deletecharacter",
    "setbirthday",
    "viewcharacter",
    "testinventorysetup",
    "syncinventory",
    "crafting",
    "gather",
    "loot",
    "gear",
    "customweapon",
    "pet",
   ].includes(commandName) &&
   focusedOption.name === "charactername"
  ) {
   await handleCharacterBasedCommandsAutocomplete(
    interaction,
    focusedOption,
    commandName
   );

   // ------------------- Default Case -------------------
  } else {
   await interaction.respond([]);
  }
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  // Catch and handle errors
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// HELPER & UTILITY FUNCTIONS
// ============================================================================

// ------------------- Helper Function to Filter and Respond with Choices -------------------
async function respondWithFilteredChoices(interaction, focusedOption, choices) {
 // Add this check at the beginning of the function
 if (!focusedOption || typeof focusedOption.value === "undefined") {
  // If focusedOption is missing or doesn't have a value property,
  // just return sorted choices without filtering
  const sortedChoices = [...choices]
   .sort((a, b) => a.name.localeCompare(b.name))
   .slice(0, 25);
  await interaction.respond(sortedChoices);
  return;
 }

 // The rest of the function remains the same
 const filteredChoices =
  focusedOption.value === ""
   ? choices.slice(0, 25)
   : choices
      .filter((choice) =>
       choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
      )
      .slice(0, 25);

 filteredChoices.sort((a, b) => a.name.localeCompare(b.name));
 await interaction.respond(filteredChoices);
}

// ------------------- Helper Function to Safely Respond with Error -------------------
async function safeRespondWithError(interaction) {
 try {
  await interaction.respond([]); // Respond with an empty array to avoid "Unknown interaction" error
 } catch (respondError) {
  handleError(respondError, "autocompleteHandler.js");

  // Error handling can be added here if needed
 }
}

// ============================================================================
// CHARACTER COMMANDS
// ============================================================================
// Handles autocomplete logic for commands that require selecting a user-owned character.
// Filters are applied depending on the command context.

// ------------------- Character Name Autocomplete (Generic) -------------------
async function handleCharacterBasedCommandsAutocomplete(
 interaction,
 focusedOption,
 commandName
) {
 try {
  const userId = interaction.user.id;

  let characters = await fetchCharactersByUserId(userId);

  if (commandName === "gather") {
   characters = characters.filter((character) => {
    const job = character.jobVoucher ? character.jobVoucherJob : character.job;
    const jobPerk = getJobPerk(job);
    return jobPerk && jobPerk.perks.includes("GATHERING");
   });
  } else if (commandName === "loot") {
   characters = characters.filter((character) => {
    const job = character.jobVoucher ? character.jobVoucherJob : character.job;
    const jobPerk = getJobPerk(job);
    return jobPerk && jobPerk.perks.includes("LOOTING");
   });
  } else if (commandName === "syncinventory") {
   characters = characters.filter((character) => !character.inventorySynced);
  }

  // No filtering for mount command
  if (commandName === "mount") {
   console.log("[Autocomplete]: Mount command does not require filtering.");
  }

  const choices = characters.map((character) => ({
    name: `${character.name} | ${capitalizeFirstLetter(character.currentVillage)} | ${capitalizeFirstLetter(character.job)}`,
    value: character.name,
   }));
   

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error(
   `[handleCharacterBasedCommandsAutocomplete]: Error handling ${commandName} autocomplete:`,
   error
  );
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// BLIGHT COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "blight" command.
// It includes suggestions for both blighted character names (and healers)
// and item autocomplete for blight-related autocompletion.

// ------------------- Blight Character Autocomplete -------------------
// Provides autocomplete suggestions for character names (and healers)
// in the "blight" command based on the user's input.
async function handleBlightCharacterAutocomplete(interaction, focusedOption) {
 try {
  // Extract the user ID from the interaction object
  const userId = interaction.user.id;

  // Provide suggestions based on which option is being autocompleted
  if (focusedOption.name === "character_name") {
   // Fetch blighted characters and format them to display "Name - Village"
   const blightedCharacters = await fetchBlightedCharactersByUserId(userId);
   const choices = blightedCharacters.map((character) => ({
    name: `${character.name} - ${capitalize(character.currentVillage)}`,
    value: character.name,
   }));
   // Respond with filtered character suggestions
   await respondWithFilteredChoices(interaction, focusedOption, choices);
  } else if (focusedOption.name === "healer_name") {
   // In case of healer suggestions, format the names similarly to include village info
   const choices = healers.map((healer) => ({
    name: `${healer.name} - ${capitalize(healer.village)}`,
    value: healer.name,
   }));
   // Respond with filtered healer suggestions
   await respondWithFilteredChoices(interaction, focusedOption, choices);
  }
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  // Log error and respond safely in case of failure
  console.error("[handleBlightCharacterAutocomplete]: Error occurred:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Blight Item Autocomplete -------------------
// Provides item suggestions for the "blight" command by gathering item
// requirements from mod characters and filtering them based on user input.
async function handleBlightItemAutocomplete(interaction, focusedOption) {
 try {
  // Initialize an array to store items that are relevant for healing requirements
  const allItems = [];

  // Loop over mod characters and add item requirements of type "item"
  modCharacters.forEach((character) => {
   character.getHealingRequirements().forEach((requirement) => {
    if (requirement.type === "item") {
     allItems.push(...requirement.items);
    }
   });
  });

  // Map items to a formatted string including quantity
  const choices = allItems.map((item) => `${item.name} x${item.quantity}`);

  // Filter the choices based on the user's current input
  const filteredChoices = choices.filter((choice) =>
   choice.toLowerCase().includes(focusedOption.value.toLowerCase())
  );

  // Limit the number of choices to meet Discord's maximum (up to 25)
  const limitedChoices = filteredChoices.slice(0, 25);

  // Respond with the final filtered list of item suggestions
  await interaction.respond(
   limitedChoices.map((choice) => ({
    name: choice,
    value: choice,
   }))
  );
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  // Log any errors and respond with an empty array on failure
  console.error(
   "[handleBlightItemAutocomplete]: Error during blight item autocomplete:",
   error
  );
  await interaction.respond([]);
 }
}

// ============================================================================
// BOOSTING COMMANDS
// ============================================================================

// ------------------- Boosting Character Autocomplete -------------------
async function handleBoostingCharacterAutocomplete(interaction, focusedOption) {
 try {
  const characters = await fetchAllCharacters();

  const boostJobs = [
   "Fortune Teller",
   "Teacher",
   "Priest",
   "Entertainer",
   "Scholar",
  ];

  const filteredCharacters = characters.filter((character) =>
   boostJobs.includes(character.job)
  );

  const choices = filteredCharacters.map((character) => ({
   name: `${character.name} - ${capitalize(character.currentVillage)} - ${
    character.job
   }`,
   value: character.name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleBoostingCharacterAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// CHANGEJOB COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "changejob" command.
// It includes suggestions for selecting a new job based on the character’s context,
// as well as for selecting the character whose job is to be changed.

// ------------------- New Job Autocomplete -------------------

async function handleChangeJobNewJobAutocomplete(interaction, focusedOption) {
  try {
   const userId = interaction.user.id;
   
   // Fix: fallback if characterName is empty
   const characterName = interaction.options.getString("charactername") || "";
 
   if (!characterName) {
    console.warn(`[handleChangeJobNewJobAutocomplete]: No character selected.`);
    await interaction.respond([]);
    return;
   }
 
   // Fetch the character by user and character name
   const character = await fetchCharacterByNameAndUserId(characterName, userId);
   if (!character) {
    console.warn(
     `[handleChangeJobNewJobAutocomplete]: Character not found for userId: ${userId}, characterName: ${characterName}`
    );
    await interaction.respond([]);
    return;
   }
 
   // Fetch general and village-specific jobs
   const generalJobs = getGeneralJobsPage(1).concat(getGeneralJobsPage(2));
   const villageJobs = getVillageExclusiveJobs(character.homeVillage);
 
   // Combine jobs
   const allJobs = [...generalJobs, ...villageJobs];
 
   // Filter jobs based on user typing
   const filteredJobs = allJobs.filter((job) =>
     job.toLowerCase().includes(focusedOption.value.toLowerCase())
   );
 
   // Format the filtered choices (capitalize words)
   const formattedChoices = filteredJobs.map((job) => ({
    name: capitalizeWords(job),
    value: job,
   }));
 
   // Respond with filtered choices (limit to 25)
   await interaction.respond(formattedChoices.slice(0, 25));
  } catch (error) {
   handleError(error, "autocompleteHandler.js");
 
   console.error(`[handleChangeJobNewJobAutocomplete] Error:`, error);
   await interaction.respond([]);
  }
 }
 
 // ------------------- Character Name Autocomplete for ChangeJob -------------------
 // Reuses the generic character-based autocomplete handler to suggest character names
 // for the "changejob" command.
 async function handleChangeJobCharacterAutocomplete(interaction, focusedOption) {
  try {
   const commandName = "changejob";
   await handleCharacterBasedCommandsAutocomplete(
    interaction,
    focusedOption,
    commandName
   );
  } catch (error) {
   handleError(error, "autocompleteHandler.js");
 
   console.error(
    "[handleChangeJobCharacterAutocomplete]: Error occurred:",
    error
   );
   await safeRespondWithError(interaction);
  }
 }
 

// ============================================================================
// COMBAT COMMANDS
// ============================================================================

// ============================================================================
// CRAFTING COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "crafting" command.
// It retrieves the character by name, verifies crafting eligibility based on
// job perks, fetches the character's inventory, determines which items can be
// crafted, and then filters these items based on user input.

// ------------------- Crafting Autocomplete -------------------
// Provides autocomplete suggestions for craftable items based on the character’s
// job and inventory.
async function handleCraftingAutocomplete(interaction, focusedOption) {
 try {
  // Extract user ID and character name from the interaction
  const userId = interaction.user.id;
  const characterName = interaction.options.getString("charactername");

  // Fetch all characters belonging to the user
  const characters = await fetchCharactersByUserId(userId);

  // Find the specific character from the list
  const character = characters.find((c) => c.name === characterName);
  if (!character) {
   // Respond with an empty array if the character is not found
   return await interaction.respond([]);
  }

  // Determine the character's job based on the Job Voucher or default job
  const job = character.jobVoucher ? character.jobVoucherJob : character.job;

  // Check the character's job perks to ensure crafting eligibility
  const jobPerk = getJobPerk(job);
  if (!jobPerk || !jobPerk.perks.includes("CRAFTING")) {
   // Respond with an empty array if the character cannot craft
   return await interaction.respond([]);
  }

  // Fetch the character's inventory
  const inventoryCollection = await getCharacterInventoryCollection(
   character.name
  );
  const characterInventory = await inventoryCollection.find().toArray();

  // Determine which items can be crafted based on the inventory
  const craftableItems = await fetchCraftableItemsAndCheckMaterials(
   characterInventory
  );
  if (craftableItems.length === 0) {
   // Respond with an empty array if no craftable items are found
   return await interaction.respond([]);
  }

  // Filter craftable items based on the character's job
  const filteredItems = craftableItems.filter((item) =>
   item.craftingTags.some((tag) => tag.toLowerCase() === job.toLowerCase())
  );
  if (filteredItems.length === 0) {
   // Respond with an empty array if no items match the character's job
   return await interaction.respond([]);
  }

  // Get the user's input value for dynamic filtering
  const inputValue = focusedOption.value.toLowerCase();

  // Filter items dynamically based on the user's input
  const matchingItems = filteredItems.filter((item) =>
   item.itemName.toLowerCase().includes(inputValue)
  );

  const MAX_CHOICES = 25; // Discord's maximum allowed autocomplete choices

  // Map matching items to autocomplete choices and limit to the maximum allowed
  const choices = matchingItems.slice(0, MAX_CHOICES).map((item) => ({
   name: item.itemName, // Display item name
   value: item.itemName, // Use item name as the value
  }));

  // Respond to the interaction with the filtered choices
  if (!interaction.responded) {
   await interaction.respond(choices);
  }
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  // Handle errors gracefully by responding with an empty array
  if (!interaction.responded) {
   await interaction.respond([]);
  }
 }
}

// ============================================================================
// CREATECHARACTER COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "createcharacter" command.
// It includes suggestions for selecting a home village and for choosing a race during character creation.

// ------------------- Create Character Village Autocomplete -------------------
// Provides autocomplete suggestions for available villages when creating a new character.
async function handleCreateCharacterVillageAutocomplete(
 interaction,
 focusedOption
) {
 try {
  // Retrieve all villages and format them for autocomplete
  const choices = getAllVillages().map((village) => ({
   name: village, // Display village name directly
   value: village, // Use the raw village value
  }));

  // Respond to the interaction with filtered village choices
  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  // Handle errors gracefully and respond with a safe error message
  await safeRespondWithError(interaction);
 }
}

// ------------------- Create Character Race Autocomplete -------------------
// Provides autocomplete suggestions for available races when creating a new character.
async function handleCreateCharacterRaceAutocomplete(
 interaction,
 focusedOption
) {
 try {
  // Retrieve all races and format them for autocomplete
  const choices = getAllRaces().map((race) => ({
   name: capitalize(race), // Display race name in a capitalized format
   value: race, // Use the raw race value
  }));

  // Respond to the interaction with filtered race choices
  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  // Handle errors gracefully and respond with a safe error message
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// CUSTOMWEAPON COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "customweapon" command.
// It provides suggestions for base weapon types and weapon subtypes during the
// weapon creation process.

// ------------------- Base Weapon Autocomplete -------------------
// Provides autocomplete suggestions for selecting a base weapon when creating a custom weapon.
async function handleBaseWeaponAutocomplete(interaction) {
 try {
  // List of available base weapon types
  const choices = ["1h", "2h", "Bow"].map((choice) => ({
   name: choice,
   value: choice,
  }));

  // Respond to the interaction with the base weapon choices
  await interaction.respond(choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleBaseWeaponAutocomplete]: Error occurred:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Subtype Autocomplete -------------------
// Provides autocomplete suggestions for weapon subtypes based on user input.
async function handleSubtypeAutocomplete(interaction) {
 try {
  // List of available weapon subtypes
  const choices = [
   "Sword",
   "Dagger",
   "Axe",
   "Spear",
   "Hammer",
   "Whip",
   "Gauntlet",
   "Katana",
   "Chakram",
   "Scythe",
  ]
   .filter((choice) =>
    choice
     .toLowerCase()
     .includes(interaction.options.getFocused().toLowerCase())
   )
   .map((choice) => ({
    name: choice,
    value: choice,
   }));

  // Respond with the filtered subtype choices
  await interaction.respond(choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleSubtypeAutocomplete]: Error occurred:", error);
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// DELIVER COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "deliver" command.
// It provides suggestions for sender selection, courier selection, recipients,
// deliverable items from inventory, and vendor stock items for vending deliveries.

// ------------------- Deliver: Sender Autocomplete -------------------
// Provides autocomplete suggestions for the user's own characters to act as senders.
async function handleCourierSenderAutocomplete(interaction, focusedOption) {
 const userId = interaction.user.id;
 await handleCharacterAutocomplete(
  interaction,
  focusedOption,
  () => fetchCharactersByUserId(userId),
  () => true,
  (c) => ({
   name: `${c.name} - ${capitalize(c.currentVillage)}`,
   value: c.name,
  })
 );
}

// ------------------- Deliver: Courier Autocomplete -------------------
// Provides autocomplete suggestions for any character with the "courier" job.
async function handleCourierAutocomplete(interaction, focusedOption) {
 await handleCharacterAutocomplete(
  interaction,
  focusedOption,
  fetchAllCharacters,
  (c) => c.job && c.job.toLowerCase() === "courier",
  (c) => ({
   name: `${c.name} - ${capitalize(c.currentVillage)}`,
   value: c.name,
  })
 );
}

// ------------------- Deliver: Recipient Autocomplete -------------------
// Provides autocomplete suggestions for all characters excluding the user's own.
async function handleRecipientAutocomplete(interaction, focusedOption) {
 const userId = interaction.user.id;
 await handleCharacterAutocomplete(
  interaction,
  focusedOption,
  () => fetchAllCharactersExceptUser(userId),
  () => true,
  (c) => ({
   name: `${c.name} - ${capitalize(c.currentVillage)}`,
   value: c.name,
  })
 );
}

// ------------------- Deliver: Courier Accept Autocomplete -------------------
// Provides autocomplete suggestions for user's characters with the "courier" job.
async function handleCourierAcceptAutocomplete(interaction, focusedOption) {
 const userId = interaction.user.id;
 await handleCharacterAutocomplete(
  interaction,
  focusedOption,
  () => fetchCharactersByUserId(userId),
  (c) => c.job && c.job.toLowerCase() === "courier",
  (c) => ({
   name: `${c.name} - ${capitalize(c.currentVillage)}`,
   value: c.name,
  })
 );
}

// ------------------- Deliver: Vending Recipient Autocomplete -------------------
// Provides autocomplete suggestions for user's characters with the "shopkeeper" or "merchant" job.
async function handleVendingRecipientAutocomplete(interaction, focusedOption) {
 const userId = interaction.user.id;
 await handleCharacterAutocomplete(
  interaction,
  focusedOption,
  () => fetchCharactersByUserId(userId),
  (c) => {
   const job = c.job ? c.job.toLowerCase() : "";
   return job === "shopkeeper" || job === "merchant";
  },
  (c) => ({
   name: `${c.name} - ${capitalize(c.job || "Unknown")} - ${capitalize(
    c.currentVillage || "Unknown"
   )}`,
   value: c.name,
  })
 );
}

// ------------------- Deliver: All Recipients Autocomplete -------------------
// Provides autocomplete suggestions for all characters in the database.
async function handleAllRecipientAutocomplete(interaction, focusedOption) {
 try {
  const characters = await fetchAllCharacters();
  const choices = characters.map((c) => ({
   name: `${c.name} - ${capitalize(c.currentVillage)}`,
   value: c.name,
  }));
  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error(
   "[courierAutocomplete.js]: logs -> Error in handleAllRecipientAutocomplete:",
   error
  );
  await safeRespondWithError(interaction);
 }
}

// ------------------- Deliver: Item Autocomplete -------------------
// Provides autocomplete suggestions for items in the sender's inventory.
async function handleDeliverItemAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const senderName = interaction.options.getString("sender");
  if (!senderName) return await interaction.respond([]);

  const senderCharacter = await fetchCharacterByNameAndUserId(
   senderName,
   userId
  );
  if (!senderCharacter) return await interaction.respond([]);

  const inventoryCollection = await getCharacterInventoryCollection(
   senderCharacter.name
  );
  const inventory = await inventoryCollection.find().toArray();

  const itemMap = new Map();
  for (const item of inventory) {
   itemMap.set(
    item.itemName,
    (itemMap.get(item.itemName) || 0) + item.quantity
   );
  }

  const choices = Array.from(itemMap.entries()).map(([name, qty]) => ({
   name: `${name} - QTY:${qty}`,
   value: name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error(
   "[courierAutocomplete.js]: logs -> Error in handleDeliverItemAutocomplete:",
   error
  );
  await safeRespondWithError(interaction);
 }
}

// ------------------- Deliver: Vendor Item Autocomplete -------------------
// Provides autocomplete suggestions for items from the village vendor stock.
async function handleVendorItemAutocomplete(interaction, focusedOption) {
 try {
  const courierName = interaction.options.getString("courier");
  const recipientName = interaction.options.getString("recipient");
  const searchQuery = focusedOption.value.toLowerCase();

  if (!courierName || !recipientName) return await interaction.respond([]);

  const courier = await fetchCharacterByName(courierName);
  const recipient = await fetchCharacterByName(recipientName);
  if (!courier || !recipient) return await interaction.respond([]);

  const village = courier.currentVillage?.toLowerCase()?.trim();
  const vendorType = recipient.job?.toLowerCase();

  const stockList = await getCurrentVendingStockList();
  if (!stockList?.stockList?.[village]) {
   return await interaction.respond([]);
  }

  const villageStock = stockList.stockList[village];

  const filteredItems = villageStock.filter(
   (item) =>
    item.vendingType?.toLowerCase() === vendorType &&
    item.itemName?.toLowerCase().includes(searchQuery)
  );

  const choices = filteredItems.slice(0, 25).map((item) => ({
   name: `${item.itemName} - ${item.points} pts`,
   value: item.itemName,
  }));

  if (interaction.deferred || interaction.replied || interaction.responded)
   return;
  await interaction.respond(choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error(
   "[courierAutocomplete.js]: logs -> Error in handleVendorItemAutocomplete:",
   error
  );
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// EDITCHARACTER COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "editcharacter" command.
// It provides suggestions based on the selected category (job, race, homeVillage, icon).

// ------------------- Edit Character Autocomplete -------------------
// Provides autocomplete suggestions for editing character attributes based on selected category.
async function handleEditCharacterAutocomplete(interaction, focusedOption) {
 try {
  // Extract the selected category from interaction options
  const category = interaction.options.getString("category");
  let choices = [];

  // Determine autocomplete choices based on the selected category
  if (category === "job") {
   choices = [
    { name: "General Jobs", value: "General Jobs" },
    { name: "Inariko Exclusive Jobs", value: "Inariko Exclusive Jobs" },
    { name: "Rudania Exclusive Jobs", value: "Rudania Exclusive Jobs" },
    { name: "Vhintl Exclusive Jobs", value: "Vhintl Exclusive Jobs" },
   ];
  } else if (category === "race") {
   choices = getAllRaces().map((race) => ({
    name: capitalize(race),
    value: race,
   }));
  } else if (category === "homeVillage") {
   choices = getAllVillages().map((village) => ({
    name: village,
    value: village,
   }));
  } else if (category === "icon") {
   choices = [
    { name: "Please upload a new icon", value: "Please upload a new icon" },
   ];
  }

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleEditCharacterAutocomplete]: Error occurred:", error);
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// EXPLORE COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "explore" command.
// It provides suggestions for healing items from a character's inventory and for
// selecting characters involved in an exploration roll.

// ------------------- Explore: Item Autocomplete -------------------
// Provides autocomplete suggestions for healing items from a character's inventory.
async function handleExploreItemAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const characterName = interaction.options.getString("charactername");

  if (!characterName) return await interaction.respond([]);

  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) return await interaction.respond([]);

  const inventoryCollection = await getCharacterInventoryCollection(
   character.name
  );
  const inventoryItems = await inventoryCollection.find().toArray();

  const itemIds = inventoryItems.map((item) => item.itemId);

  const healingItems = await ItemModel.find({
   _id: { $in: itemIds },
   itemName: { $ne: "Oil Jar" },
   $or: [
    { category: "Recipe" },
    { itemName: "Fairy" },
    { itemName: "Eldin Ore" },
    { itemName: "Wood" },
   ],
  })
   .lean()
   .exec();

  const choices = healingItems.map((item) => {
   const inventoryItem = inventoryItems.find(
    (inv) => inv.itemId.toString() === item._id.toString()
   );

   const quantityDisplay =
    item.itemName === "Eldin Ore"
     ? Math.floor(inventoryItem.quantity / 5)
     : item.itemName === "Wood"
     ? Math.floor(inventoryItem.quantity / 10)
     : inventoryItem.quantity;

   return {
    name: `${item.itemName} - Heals ${item.modifierHearts} ❤️ | ${item.staminaRecovered} 🟩 - Qty: ${quantityDisplay}`,
    value: inventoryItem.itemName,
   };
  });

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  await safeRespondWithError(interaction);
 }
}

// ------------------- Explore: Roll Character Autocomplete -------------------
// Provides autocomplete suggestions for characters involved in an exploration party.
async function handleExploreRollCharacterAutocomplete(
 interaction,
 focusedOption
) {
 try {
  const expeditionId = interaction.options.getString("id");
  console.log(`🔍 Expedition ID provided for Autocomplete: ${expeditionId}`);

  const parties = await Party.find().lean();
  console.log(
   `🗂️ All Parties in Database: ${JSON.stringify(parties, null, 2)}`
  );

  if (!expeditionId) {
   console.log("❌ Expedition ID is missing.");
   return await interaction.respond([]);
  }

  const party = await Party.findOne({ partyId: expeditionId }).lean();
  if (!party) {
   console.log("❌ No party found for the specified Expedition ID.");
   return await interaction.respond([]);
  }

  console.log(`✅ Party Data Retrieved: ${JSON.stringify(party, null, 2)}`);

  if (party.characters && party.characters.length > 0) {
   console.log(`🔍 Accessing characters in the expedition party:`);
   party.characters.forEach((character, index) => {
    console.log(
     `- Character ${index + 1}: ${JSON.stringify(character, null, 2)}`
    );
   });
  } else {
   console.log("❌ No characters found in the party for this expedition.");
  }

  const choices = party.characters.map((character) => ({
   name: character.name,
   value: character.name,
  }));

  console.log(
   `🚀 Returning Autocomplete Choices: ${JSON.stringify(choices, null, 2)}`
  );

  return await interaction.respond(choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("❌ Error during Autocomplete Process:", error);
  await interaction.respond([]);
 }
}

// ============================================================================
// GEAR COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "gear" command.
// It provides suggestions for gear items from a character's inventory,
// filtered based on gear type.

// ------------------- Gear Autocomplete -------------------
// Provides autocomplete suggestions for gear items based on specified type.
async function handleGearAutocomplete(interaction, focusedOption) {
 try {
  const characterName = interaction.options.getString("charactername");
  const type = interaction.options.getString("type");
  const userId = interaction.user.id;

  const characters = await fetchCharactersByUserId(userId);
  const character = characters.find((c) => c.name === characterName);
  if (!character) return await interaction.respond([]);

  const inventoryCollection = await getCharacterInventoryCollection(
   character.name
  );
  const characterInventory = await inventoryCollection.find().toArray();

  const filteredItems = characterInventory.filter((item) => {
   const categories = item.category
    .split(",")
    .map((cat) => cat.trim().toLowerCase());
   const subtypes = Array.isArray(item.subtype)
    ? item.subtype.map((st) => st.trim().toLowerCase())
    : item.subtype
    ? [item.subtype.trim().toLowerCase()]
    : [];

   if (type === "weapon") {
    return categories.includes("weapon") && !subtypes.includes("shield");
   } else if (type === "shield") {
    return subtypes.includes("shield");
   } else if (type === "head") {
    return (
     categories.includes("armor") && item.type.toLowerCase().includes("head")
    );
   } else if (type === "chest") {
    return (
     categories.includes("armor") && item.type.toLowerCase().includes("chest")
    );
   } else if (type === "legs") {
    return (
     categories.includes("armor") && item.type.toLowerCase().includes("legs")
    );
   }
   return false;
  });

  const items = filteredItems.map((item) => ({
   name: `${item.itemName} - QTY:${item.quantity}`,
   value: item.itemName,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, items);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// GIFT COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "gift" command.
// It provides suggestions for the sender, recipient, and items being gifted.

// ------------------- Gift Autocomplete -------------------
// Provides autocomplete suggestions for gifting characters and items.
async function handleGiftAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;

  if (focusedOption.name === "fromcharacter") {
   // Autocomplete for characters owned by the user (sender)
   const characters = await fetchCharactersByUserId(userId);
   const choices = characters.map((character) => ({
    name: `${character.name} - ${capitalize(character.currentVillage)}`,
    value: character.name,
   }));
   await respondWithFilteredChoices(interaction, focusedOption, choices);
  } else if (focusedOption.name === "tocharacter") {
   // Autocomplete for all characters excluding the user's own (recipient)
   const allCharacters = await fetchAllCharactersExceptUser(userId);
   const choices = allCharacters.map((character) => ({
    name: `${character.name} - ${capitalize(character.currentVillage)}`,
    value: character.name,
   }));
   await respondWithFilteredChoices(interaction, focusedOption, choices);
  } else if (["itema", "itemb", "itemc"].includes(focusedOption.name)) {
   // Autocomplete for inventory items from the sender
   const fromCharacterName = interaction.options.getString("fromcharacter");
   if (!fromCharacterName) return await interaction.respond([]);

   const fromCharacter = await fetchCharacterByNameAndUserId(
    fromCharacterName,
    userId
   );
   if (!fromCharacter) return await interaction.respond([]);

   const inventoryCollection = await getCharacterInventoryCollection(
    fromCharacter.name
   );
   const fromInventory = await inventoryCollection.find().toArray();

   const choices = fromInventory
   .filter((item) => item.itemName && item.itemName !== "Initial Item")
   .map((item) => ({
     name: `${capitalizeWords(item.itemName)} - QTY:${item.quantity}`,
     value: item.itemName,
   })); 

   await respondWithFilteredChoices(interaction, focusedOption, choices);
  }
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// HEAL COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "heal" command.
// It provides suggestions for character names, healer characters, and healer names
// based on user ownership and job roles.

// ------------------- Heal Autocomplete -------------------
// Provides autocomplete suggestions for healing requests based on context.
async function handleHealAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;

  if (focusedOption.name === "charactername") {
   // Autocomplete for characters owned by the user
   const userCharacters = await fetchCharactersByUserId(userId);
   const choices = userCharacters.map((character) => ({
    name: `${character.name} - ${capitalizeFirstLetter(
     character.currentVillage
    )}`,
    value: character.name,
   }));

   await respondWithFilteredChoices(interaction, focusedOption, choices);
  } else if (focusedOption.name === "healer") {
   // Autocomplete for all characters with Healer job
   const allCharacters = await fetchAllCharacters();
   const healerCharacters = allCharacters.filter(
    (character) =>
     character.job.toLowerCase() === "healer" ||
     (character.jobVoucher === true &&
      character.jobVoucherJob.toLowerCase() === "healer")
   );

   const choices = healerCharacters.map((character) => ({
    name: `${character.name} - ${capitalizeFirstLetter(
     character.currentVillage
    )}`,
    value: character.name,
   }));

   await respondWithFilteredChoices(interaction, focusedOption, choices);
  } else if (focusedOption.name === "healername") {
   // Autocomplete for user's own healers
   const userCharacters = await fetchCharactersByUserId(userId);
   const healerCharacters = userCharacters.filter(
    (character) =>
     character.job.toLowerCase() === "healer" ||
     (character.jobVoucher === true &&
      character.jobVoucherJob.toLowerCase() === "healer")
   );

   const choices = healerCharacters.map((character) => ({
    name: `${character.name} - ${capitalizeFirstLetter(
     character.currentVillage
    )}`,
    value: character.name,
   }));

   await respondWithFilteredChoices(interaction, focusedOption, choices);
  }
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error(
   "[handleHealAutocomplete]: Error handling heal autocomplete:",
   error
  );
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// ITEM COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "item" command family.
// It provides suggestions for item names from a character's inventory across:
// - General Item Usage
// - Healing Items
// - Job Voucher Items

// ------------------- Item Autocomplete -------------------
// Provides autocomplete suggestions for items in a character's inventory.
async function handleItemAutocomplete(interaction, focusedOption) {
  try {
   const userId = interaction.user.id;
   const subcommand = interaction.options.getSubcommand();
   const characterName = interaction.options.getString("charactername");
   const searchQuery = focusedOption?.value?.toLowerCase() || "";
 
   if (!characterName) return await interaction.respond([]);
 
   const character = await fetchCharacterByNameAndUserId(characterName, userId);
   if (!character) return await interaction.respond([]);
 
   const inventoryCollection = await getCharacterInventoryCollection(character.name);
   const inventoryItems = await inventoryCollection.find().toArray();
 
   let choices = [];
 
   if (subcommand !== "sell") {
     choices = inventoryItems
       .filter(item => 
         item.itemName &&
         item.itemName.toLowerCase().includes(searchQuery) &&
         item.itemName.toLowerCase() !== "initial item"
       )
       .map(item => ({
         name: `${capitalizeWords(item.itemName)} - Qty: ${item.quantity}`,
         value: item.itemName,
       }));
   } else {
     const itemNames = inventoryItems.map(item => item.itemName);
     const itemsFromDB = await Item.find({ itemName: { $in: itemNames } }).select("itemName sellPrice").lean();
 
     const itemsMap = new Map(itemsFromDB.map(item => [item.itemName, item.sellPrice]));
 
     choices = inventoryItems
       .filter(item => 
         item.itemName &&
         item.itemName.toLowerCase().includes(searchQuery) &&
         item.itemName.toLowerCase() !== "initial item"
       )
       .sort((a, b) => a.itemName.localeCompare(b.itemName))
       .map(item => ({
         name: `${capitalizeWords(item.itemName)} - Qty: ${item.quantity} - Sell: ${itemsMap.get(item.itemName) || "N/A"}`,
         value: item.itemName,
       }));
   }
 
   await interaction.respond(choices.slice(0, 25));
  } catch (error) {
   handleError(error, "autocompleteHandler.js");
   console.error("[handleItemAutocomplete]: Error:", error);
   if (!interaction.responded) await interaction.respond([]);
  }
 }

// ------------------- Item Job Voucher Autocomplete -------------------
// Provides autocomplete suggestions for Job Voucher items from a character's inventory.
async function handleItemJobVoucherAutocomplete(interaction, focusedOption) {
 try {
  const characterName = interaction.options.getString("charactername");
  if (!characterName) return await interaction.respond([]);

  const inventoryCollection = await getCharacterInventoryCollection(
   characterName
  );
  const inventoryItems = await inventoryCollection
   .find({ itemName: /Voucher/i })
   .toArray();

  const choices = inventoryItems.map((item) => ({
   name: `${item.itemName} - Qty: ${item.quantity}`,
   value: item.itemName,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleItemJobVoucherAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// LOOKUP COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "lookup" command.
// It provides suggestions for item names or ingredients based on user input.

// ------------------- Lookup Autocomplete -------------------
// Provides autocomplete suggestions for items or ingredients in the database.
async function handleLookupAutocomplete(interaction, focusedOption) {
 try {
  // Fetch all items from the database
  const items = await Item.find().select("itemName").exec();

  // Map items to choices
  const choices = items.map((item) => ({
   name: item.itemName,
   value: item.itemName,
  }));

  // Sort choices alphabetically
  choices.sort((a, b) => a.name.localeCompare(b.name));

  // Respond with filtered choices
  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error(
   "[handleLookupAutocomplete]: Error handling lookup autocomplete:",
   error
  );
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// MOD COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the “/mod” command.
// It provides suggestions for the “give” and “petlevel” subcommands.

// ------------------- /mod give: Character Autocomplete -------------------
async function handleModGiveCharacterAutocomplete(interaction, focusedOption) {
 try {
  // Map modCharacters to autocomplete choices
  const choices = modCharacters.map((character) => ({
   name: character.name, // Character name for display
   value: character.name, // Character name for value
  }));
  // Respond with filtered character choices
  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  console.error("[handleModGiveCharacterAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- /mod give: Item Autocomplete -------------------
async function handleModGiveItemAutocomplete(interaction, focusedOption) {
 try {
  const characterName = interaction.options.getString("character");
  if (!characterName) return await interaction.respond([]);
  // Fetch mod character details
  const character = getModCharacterByName(characterName);
  if (!character) return await interaction.respond([]);
  // Map mod character's inventory to autocomplete choices
  const choices = character.inventory.map((item) => ({
   name: `${item.name} - Qty: ${item.quantity}`, // Item name with quantity
   value: item.name, // Item name for value
  }));
  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  console.error("[handleModGiveItemAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- /mod petlevel: Character Autocomplete -------------------
async function handleModCharacterAutocomplete(interaction, focusedOption) {
 try {
  // Provides autocomplete suggestions for all characters (admin can target any)
  const characters = await fetchAllCharacters(); // make sure to import this from characterService
  const choices = characters.map((c) => ({
   name: c.name,
   value: c.name,
  }));
  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  console.error("[handleModCharacterAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// MOUNT & STABLE COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "mount" and "stable" commands.
// It provides suggestions for selecting characters who can interact with mounts,
// and for selecting owned mounts.

// ------------------- Mount Character Autocomplete -------------------
// Provides autocomplete suggestions for user-owned characters for mount/stable commands.
async function handleMountAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;

  const characters = await fetchCharactersByUserId(userId);

  const subcommand = interaction.options.getSubcommand();

  const choices = characters
   .filter((character) => {
    if (["retrieve", "store", "sell"].includes(subcommand)) {
     return true; // Include only characters with mounts for these subcommands
    } else if (subcommand === "view") {
     return true; // Include all characters
    } else if (subcommand === "encounter") {
     return true; // Include all owned characters for encounter
    }
    return false;
   })
   .map((character) => ({
    name: character.name,
    value: character.name,
   }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error(
   "[handleMountAutocomplete]: Error handling mount autocomplete:",
   error
  );
  await safeRespondWithError(interaction);
 }
}

// ------------------- Mount Name Autocomplete -------------------
// Provides autocomplete suggestions for mounts owned by a specific character.
async function handleMountNameAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const characterName = interaction.options.getString("charactername");

  if (!characterName) {
   await interaction.respond([]);
   return;
  }

  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
   await interaction.respond([]);
   return;
  }

  const mounts = await Mount.find({ owner: character.name });

  const choices = mounts
   .map((mount) => ({
    name: mount.name,
    value: mount.name,
   }))
   .slice(0, 25);

  await interaction.respond(choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("Error handling mount name autocomplete:", error);
  await interaction.respond([]);
 }
}

// ============================================================================
// PET COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "pet" command family.
// It provides suggestions for:
// - Pet Names owned by a character
// - Available Pet Species
// - Roll Types specific to a selected pet

// ------------------- Pet Name Autocomplete -------------------
async function handlePetNameAutocomplete(interaction, focusedOption) {
 const userId = interaction.user.id;

 // 1. Accept either the 'charactername' (pet cmd) or 'character' (mod cmd) option
 const rawInput =
  interaction.options.getString("charactername") ||
  interaction.options.getString("character");
 if (!rawInput) {
  console.log(
   "[autocompleteHandler.js]: logs - No character provided; responding with empty list."
  );
  return await interaction.respond([]);
 }

 // 2. Strip off any " – village – job" suffix
 const characterName = rawInput.split(" - ")[0];
 console.log(
  `[autocompleteHandler.js]: logs - Lookup pets for character "${characterName}".`
 );

 // 3. Fetch the character appropriately
 let character;
 if (interaction.commandName === "mod") {
  // Admin context: can target any character
  character = await fetchCharacterByName(characterName);
 } else {
  // Regular pet command: only your own characters
  character = await fetchCharacterByNameAndUserId(characterName, userId);
 }
 if (!character) {
  console.log(
   `[autocompleteHandler.js]: logs - Character "${characterName}" not found.`
  );
  return await interaction.respond([]);
 }

 // 4. Query active pets
 const pets = await Pet.find({ owner: character._id, status: "active" }).lean();
 if (!pets.length) {
  console.log(
   `[autocompleteHandler.js]: logs - No active pets for "${characterName}".`
  );
  return await interaction.respond([]);
 }

 // 5. Return pet names (so mod petlevel can match by name)
 const choices = pets.map((pet) => ({
  name: pet.name,
  value: pet.name,
 }));
 await respondWithFilteredChoices(interaction, focusedOption, choices);
}

// ------------------- Pet Species Autocomplete -------------------
async function handlePetSpeciesAutocomplete(interaction, focusedOption) {
 // grab the category they've already selected (defaults to 'normal')
 const category = interaction.options.getString("category") || "normal";

 // choose only the normal or special species
 const speciesList =
  category === "special" ? Object.keys(specialPets) : Object.keys(normalPets);

 // build your choices array
 const choices = speciesList.map((species) => ({
  name: species,
  value: species,
 }));

 // let your helper filter & respond
 await respondWithFilteredChoices(interaction, focusedOption, choices);
}

// ------------------- Pet Roll Type Autocomplete -------------------
async function handlePetRollTypeAutocomplete(interaction, focusedOption) {
 // 1. Get the character name (supports both /pet and /mod contexts)
 const rawCharacter =
  interaction.options.getString("charactername") ||
  interaction.options.getString("character");
 if (!rawCharacter) return await interaction.respond([]);
 const characterName = rawCharacter.split(" - ")[0];
 const userId = interaction.user.id;

 // 2. Fetch the character (only your own for /pet)
 const character = await fetchCharacterByNameAndUserId(characterName, userId);
 if (!character) return await interaction.respond([]);

 // 3. Get the pet’s name (not ID)
 const petName = interaction.options.getString("petname");
 if (!petName) return await interaction.respond([]);

 // 4. Look up the pet by owner & name
 const petDoc = await Pet.findOne({
  owner: character._id,
  name: petName,
 }).lean();
 if (!petDoc || !Array.isArray(petDoc.rollCombination)) {
  return await interaction.respond([]);
 }

 // 5. Build and return the roll-type choices
 const choices = petDoc.rollCombination.map((roll) => ({
  name: roll,
  value: roll,
 }));
 await respondWithFilteredChoices(interaction, focusedOption, choices);
}

// ============================================================================
// RELIC
// ============================================================================

// ============================================================================
// SHOPS COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "shops" command.
// It provides suggestions for:
// - Item names available for purchase
// - Item names from a character's inventory when selling

// ------------------- Shops Autocomplete -------------------
// Provides autocomplete suggestions for shop item names for buy/sell.
async function handleShopsAutocomplete(interaction, focusedOption) {
 try {
  const characterName = interaction.options.getString("charactername");
  const subcommand = interaction.options.getSubcommand();
  const searchQuery = focusedOption.value.toLowerCase();
  let choices = [];

  if (subcommand === "buy") {
   const items = await ShopStock.find()
    .sort({ itemName: 1 })
    .select("itemName quantity")
    .lean();

   choices = items
    .filter((item) => item.itemName.toLowerCase().includes(searchQuery))
    .map((item) => ({
     name: `${item.itemName} - Qty: ${item.quantity}`,
     value: item.itemName,
    }));
  } else if (subcommand === "sell") {
   const inventoryCollection = await getCharacterInventoryCollection(
    characterName
   );
   const inventoryItems = await inventoryCollection.find().toArray();

   const itemNames = inventoryItems.map((item) => item.itemName);
   const itemsFromDB = await Item.find({ itemName: { $in: itemNames } })
    .select("itemName sellPrice")
    .lean();

   const itemsMap = new Map(
    itemsFromDB.map((item) => [item.itemName, item.sellPrice])
   );

   choices = inventoryItems
    .filter((item) => item.itemName.toLowerCase().includes(searchQuery))
    .sort((a, b) => a.itemName.localeCompare(b.itemName))
    .map((item) => ({
     name: `${item.itemName} - Qty: ${item.quantity} - Sell: ${
      itemsMap.get(item.itemName) || "N/A"
     }`,
     value: item.itemName,
    }));
  }

  await interaction.respond(choices.slice(0, 25));
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error(
   "[handleShopsAutocomplete]: Error handling shops autocomplete:",
   error
  );
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// STEAL COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "steal" command.
// It provides suggestions for:
// - Character Names (user-owned characters)
// - NPC Targets
// - Rarity Types

// ------------------- Steal Character Name Autocomplete -------------------
async function handleStealCharacterAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const characters = await fetchCharactersByUserId(userId);

  const choices = characters.map((character) => ({
   name: character.name,
   value: character.name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleStealCharacterAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Steal Target NPC Autocomplete -------------------
async function handleStealTargetAutocomplete(interaction, focusedOption) {
 try {
  const npcChoices = [
   "Hank",
   "Sue",
   "Lukan",
   "Myti",
   "Cree",
   "Cece",
   "Walton",
   "Jengo",
   "Jasz",
   "Lecia",
   "Tye",
   "Lil Tim",
  ];

  const filteredNPCs = npcChoices.filter((choice) =>
   choice.toLowerCase().includes(focusedOption.value.toLowerCase())
  );

  await interaction.respond(
   filteredNPCs.map((choice) => ({
    name: choice,
    value: choice,
   }))
  );
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleStealTargetAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Steal Rarity Autocomplete -------------------
async function handleStealRarityAutocomplete(interaction, focusedOption) {
 try {
  const choices = ["common", "uncommon", "rare"];

  const filtered = choices.filter((choice) =>
   choice.startsWith(focusedOption.value.toLowerCase())
  );

  await interaction.respond(
   filtered.map((choice) => ({
    name: choice,
    value: choice,
   }))
  );
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleStealRarityAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// TRADE COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "trade" command.
// It provides suggestions for:
// - From Character (user-owned characters)
// - To Character (any character not owned by user)
// - Items from From Character's Inventory

// ------------------- Trade From Character Autocomplete -------------------
async function handleTradeFromCharacterAutocomplete(
 interaction,
 focusedOption
) {
 try {
  const userId = interaction.user.id;

  const characters = await fetchCharactersByUserId(userId);

  const choices = characters.map((character) => ({
   name: `${character.name} - ${capitalize(character.currentVillage)}`,
   value: character.name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleTradeFromCharacterAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Trade To Character Autocomplete -------------------
async function handleTradeToCharacterAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;

  const characters = await fetchAllCharactersExceptUser(userId);

  const choices = characters.map((character) => ({
   name: `${character.name} - ${capitalize(character.currentVillage)}`,
   value: character.name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleTradeToCharacterAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Trade Item Autocomplete -------------------
async function handleTradeItemAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const characterName = interaction.options.getString("fromcharacter");
  if (!characterName) return await interaction.respond([]);

  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) return await interaction.respond([]);

  const inventoryCollection = await getCharacterInventoryCollection(
   character.name
  );
  const inventory = await inventoryCollection.find().toArray();

  const choices = inventory.map((item) => ({
   name: `${item.itemName} - QTY:${item.quantity}`,
   value: item.itemName,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleTradeItemAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// TRANSFER COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "transfer" command.
// It provides suggestions for:
// - From Character (user-owned characters)
// - To Character (user-owned characters)
// - Items from From Character's Inventory

// ------------------- Transfer From/To Character Autocomplete -------------------
async function handleTransferCharacterAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const characters = await fetchCharactersByUserId(userId);

  const choices = characters.map((character) => ({
   name: character.name,
   value: character.name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleTransferCharacterAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Transfer Item Autocomplete -------------------
async function handleTransferItemAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const fromCharacterName = interaction.options.getString("fromcharacter");
  if (!fromCharacterName) return await interaction.respond([]);

  const fromCharacter = await fetchCharacterByNameAndUserId(
   fromCharacterName,
   userId
  );
  if (!fromCharacter) return await interaction.respond([]);

  const inventoryCollection = await getCharacterInventoryCollection(
   fromCharacter.name
  );
  const fromInventory = await inventoryCollection.find().toArray();

  // Merge duplicates: accumulate quantities per itemName
  const itemMap = new Map();
  fromInventory.forEach(({ itemName, quantity }) => {
   itemMap.set(itemName, (itemMap.get(itemName) || 0) + quantity);
  });

  const choices = Array.from(itemMap.entries()).map(([name, qty]) => ({
   name: `${name} - QTY:${qty}`,
   value: name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  console.error("[handleTransferItemAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// TRAVEL COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "travel" command.
// It provides suggestions for:
// - Character Names (user-owned characters)
// - Destination Villages

// ------------------- Travel Character Name Autocomplete -------------------
async function handleTravelAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;

  const characters = await fetchCharactersByUserId(userId);

  const choices = characters.map((character) => ({
   name: `${character.name} - ${capitalize(character.currentVillage)}`,
   value: character.name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleTravelAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Travel Destination Village Autocomplete -------------------
async function handleVillageBasedCommandsAutocomplete(
 interaction,
 focusedOption
) {
 try {
  const choices = getAllVillages().map((village) => ({
   name: village,
   value: village,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleVillageBasedCommandsAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// VENDING COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "vending" command family.
// It provides suggestions for:
// - Restock Items
// - Barter Items
// - Edit Shop Items
// - View Shop Characters

// ------------------- Vending Restock Autocomplete -------------------
async function handleVendingRestockAutocomplete(interaction, focusedOption) {
 try {
  const characterName = interaction.options.getString("charactername");
  if (!characterName) return await interaction.respond([]);

  const userId = interaction.user.id;
  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) return await interaction.respond([]);

  const stockList = await getCurrentVendingStockList();
  if (!stockList?.stockList) return await interaction.respond([]);

  const normalizedVillage = character.currentVillage.toLowerCase().trim();
  const villageStock = stockList.stockList[normalizedVillage] || [];

  const filteredVillageItems = villageStock.filter(
   (item) => item.vendingType.toLowerCase() === character.job.toLowerCase()
  );

  const limitedItems = (stockList.limitedItems || []).map((item) => ({
   ...item,
   formattedName: `${item.itemName} - ${item.points} points - Qty: ${item.stock}`,
  }));

  const allAvailableItems = [
   ...filteredVillageItems.map((item) => ({
    ...item,
    formattedName: `${item.itemName} - ${item.points} points`,
   })),
   ...limitedItems,
  ];

  const searchQuery = focusedOption.value.toLowerCase();
  const filteredItems = allAvailableItems
   .filter((item) => item.itemName.toLowerCase().includes(searchQuery))
   .map((item) => ({
    name: item.formattedName,
    value: item.itemName,
   }))
   .slice(0, 25);

  await interaction.respond(filteredItems);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleVendingRestockAutocomplete]: Error:", error);
  await interaction.respond([]);
 }
}

// ------------------- Vending Barter Autocomplete -------------------
async function handleVendingBarterAutocomplete(interaction, focusedOption) {
 try {
  const characterName = interaction.options.getString("charactername");
  if (!characterName) return await interaction.respond([]);

  const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
  await client.connect();
  const db = client.db("vending");
  const inventoryCollection = db.collection(characterName.toLowerCase());
  const items = await inventoryCollection.find({}).toArray();
  await client.close();

  if (!items.length) return await interaction.respond([]);

  const searchQuery = focusedOption.value.toLowerCase();
  const filteredItems = items
   .filter((item) => item.itemName.toLowerCase().includes(searchQuery))
   .map((item) => ({
    name: `${item.itemName} - Qty: ${item.stockQty}`,
    value: item.itemName,
   }))
   .slice(0, 25);

  await interaction.respond(filteredItems);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleVendingBarterAutocomplete]: Error:", error);
  await interaction.respond([]);
 }
}

// ------------------- Vending Edit Shop Autocomplete -------------------
async function handleVendingEditShopAutocomplete(interaction, focusedOption) {
 try {
  const characterName = interaction.options.getString("charactername");
  if (!characterName) return await interaction.respond([]);

  const userId = interaction.user.id;
  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) return await interaction.respond([]);

  const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
  await client.connect();
  const db = client.db("vending");
  const inventoryCollection = db.collection(characterName.toLowerCase());
  const shopItems = await inventoryCollection.find({}).toArray();
  await client.close();

  if (!shopItems.length) return await interaction.respond([]);

  const searchQuery = focusedOption.value.toLowerCase();
  const filteredItems = shopItems
   .filter((item) => item.itemName.toLowerCase().includes(searchQuery))
   .map((item) => ({
    name: `${item.itemName} - Qty: ${item.stockQty}`,
    value: item.itemName,
   }))
   .slice(0, 25);

  await interaction.respond(filteredItems);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleVendingEditShopAutocomplete]: Error:", error);
  await interaction.respond([]);
 }
}

// ------------------- Vending View Shop Autocomplete -------------------
async function handleViewVendingShopAutocomplete(interaction) {
 const focusedOption = interaction.options.getFocused(true);
 if (focusedOption.name !== "charactername") return;

 try {
  const targetJobs = ["merchant", "shopkeeper"];
  const characters = await Character.find({
   job: { $regex: new RegExp(`^(${targetJobs.join("|")})$`, "i") },
  });

  const choices = characters.map((character) => ({
   name: character.name,
   value: character.name,
  }));

  await interaction.respond(choices.slice(0, 25));
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleViewVendingShopAutocomplete]: Error:", error);
  await interaction.respond([]);
 }
}

// ============================================================================
// VILLAGE COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "village" command family.
// It provides suggestions for:
// - Character Names (user-owned characters within a village)
// - Material Items needed for village upgrades
// - Destination Villages (for travel)

// ------------------- Village Upgrade Character Autocomplete -------------------
async function handleVillageUpgradeCharacterAutocomplete(interaction) {
 const userId = interaction.user.id;
 const villageName = interaction.options.getString("name");

 try {
  if (!villageName) return await interaction.respond([]);

  const characters = await fetchCharactersByUserId(userId);
  const focusedValue = interaction.options.getFocused().toLowerCase();

  const choices = characters
   .filter(
    (character) =>
     character.homeVillage?.toLowerCase() === villageName.toLowerCase() &&
     character.name.toLowerCase().includes(focusedValue)
   )
   .map((character) => ({
    name: character.name,
    value: character.name,
   }));

  await interaction.respond(choices.slice(0, 25));
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleVillageUpgradeCharacterAutocomplete]: Error:", error);
  await interaction.respond([]);
 }
}

// ------------------- Village Materials Autocomplete -------------------
async function handleVillageMaterialsAutocomplete(interaction) {
 const focusedValue = interaction.options.getFocused();
 const villageName = interaction.options.getString("name");
 const characterName = interaction.options.getString("charactername");
 const userId = interaction.user.id;

 try {
  const village = await Village.findOne({
   name: { $regex: `^${villageName}$`, $options: "i" },
  });
  if (!village) return await interaction.respond([]);

  const nextLevel = village.level + 1;
  const materials =
   village.materials instanceof Map
    ? Object.fromEntries(village.materials)
    : village.materials;

  const requiredMaterials = Object.keys(materials).filter(
   (material) => materials[material].required?.[nextLevel] !== undefined
  );

  if (!characterName) return await interaction.respond([]);

  const character = await Character.findOne({
   userId,
   name: { $regex: `^${characterName}$`, $options: "i" },
  }).lean();
  if (!character) return await interaction.respond([]);

  const inventoriesConnection = await connectToInventories();
  const db = inventoriesConnection.useDb("inventories");
  const inventoryCollection = db.collection(character.name.toLowerCase());

  const inventoryItems = await inventoryCollection.find({}).toArray();
  const materialsMap = {};

  inventoryItems.forEach((item) => {
   const lowerName = item.itemName.toLowerCase();
   const matchedMaterial = requiredMaterials.find(
    (material) => material.toLowerCase() === lowerName
   );
   if (matchedMaterial) {
    if (!materialsMap[matchedMaterial]) materialsMap[matchedMaterial] = 0;
    materialsMap[matchedMaterial] += item.quantity;
   }
  });

  const filteredMaterials = Object.entries(materialsMap)
   .filter(([itemname]) =>
    itemname.toLowerCase().includes(focusedValue.toLowerCase())
   )
   .map(([itemname, quantity]) => ({
    name: `${itemname} (qty ${quantity})`,
    value: itemname,
   }));

  await interaction.respond(filteredMaterials.slice(0, 25));
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleVillageMaterialsAutocomplete]: Error:", error);
  await interaction.respond([]);
 }
}

// ============================================================================
// VIEWINVENTORY
// ============================================================================
// Handles autocomplete logic for viewing a character's inventory.
// This suggests all characters for selection by name.

// ------------------- Autocomplete: View Character Inventory -------------------
async function handleViewInventoryAutocomplete(interaction, focusedOption) {
 try {
  // Fetch all characters from the database
  const characters = await fetchAllCharacters();

  // Map characters to autocomplete choices
  const choices = characters.map((character) => ({
   name: character.name, // Display character name
   value: character._id.toString(), // Use character ID as value
  }));

  // Respond with filtered character choices
  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  // Log and handle errors gracefully
  console.error(
   "[handleViewInventoryAutocomplete]: Error handling inventory autocomplete:",
   error
  );
  await safeRespondWithError(interaction);
 }
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================
module.exports = {
 handleAutocomplete,

 // CHARACTER-BASED

 // BLIGHT
 handleBlightCharacterAutocomplete,
 handleBlightItemAutocomplete,

 // BOOSTING
 handleBoostingCharacterAutocomplete,

 // CHANGEJOB
 handleChangeJobNewJobAutocomplete,
 handleChangeJobCharacterAutocomplete,

 // COMBAT

 // CRAFTING
 handleCraftingAutocomplete,

 // CREATECHARACTER
 handleCreateCharacterVillageAutocomplete,
 handleCreateCharacterRaceAutocomplete,

 // CUSTOMWEAPON
 handleBaseWeaponAutocomplete,
 handleSubtypeAutocomplete,

 // DELIVER
 handleCourierSenderAutocomplete,
 handleCourierAutocomplete,
 handleRecipientAutocomplete,
 handleCourierAcceptAutocomplete,
 handleVendingRecipientAutocomplete,
 handleAllRecipientAutocomplete,
 handleDeliverItemAutocomplete,
 handleVendorItemAutocomplete,

 // EDITCHARACTER
 handleEditCharacterAutocomplete,

 // EXPLORE
 handleExploreItemAutocomplete,
 handleExploreRollCharacterAutocomplete,

 // GEAR
 handleGearAutocomplete,

 // GIFT
 handleGiftAutocomplete,

 // HEAL
 handleHealAutocomplete,

 // ITEM
 handleItemAutocomplete,
 handleItemJobVoucherAutocomplete,

 // LOOKUP
 handleLookupAutocomplete,

 // MODGIVE
 handleModGiveCharacterAutocomplete,
 handleModGiveItemAutocomplete,

 // MOUNT/STABLE
 handleMountAutocomplete,
 handleMountNameAutocomplete,

 // PET
 handlePetNameAutocomplete,
 handlePetSpeciesAutocomplete,
 handlePetRollTypeAutocomplete,

 // RELIC

 // SHOPS
 handleShopsAutocomplete,

 // STEAL
 handleStealCharacterAutocomplete,
 handleStealTargetAutocomplete,
 handleStealRarityAutocomplete,

 // TRADE
 handleTradeFromCharacterAutocomplete,
 handleTradeToCharacterAutocomplete,
 handleTradeItemAutocomplete,

 // TRANSFER
 handleTransferCharacterAutocomplete,
 handleTransferItemAutocomplete,

 // TRAVEL
 handleTravelAutocomplete,
 handleVillageBasedCommandsAutocomplete,

 // VENDING
 handleVendingRestockAutocomplete,
 handleVendingBarterAutocomplete,
 handleVendingEditShopAutocomplete,
 handleViewVendingShopAutocomplete,

 // VILLAGE
 handleVillageUpgradeCharacterAutocomplete,
 handleVillageMaterialsAutocomplete,

 // VIEWINVENTORY
 handleViewInventoryAutocomplete,

 handleCharacterBasedCommandsAutocomplete,
};
