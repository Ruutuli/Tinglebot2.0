// ------------------- Autocomplete Handler for Various Commands -------------------

// ------------------- Autocomplete Handler for Various Commands -------------------

// ------------------- Standard Libraries -------------------
const { MongoClient } = require("mongodb");

// ------------------- Database Connections -------------------
const { connectToInventories, connectToTinglebot } = require('../database/connection');

// ------------------- Database Services -------------------
const {
  fetchAllCharacters,
  fetchAllCharactersExceptUser,
  fetchBlightedCharactersByUserId,
  fetchCharacterByName,
  fetchCharacterByNameAndUserId,
  fetchCharactersByUserId,
  getCharacterInventoryCollection
} = require('../database/characterService');
const {
  fetchAllItems,
  fetchCraftableItemsAndCheckMaterials,
  fetchItemByName,
  fetchItemsByCategory
} = require('../database/itemService');
const { fetchUserIdByUsername } = require('../database/userService');
const {
  connectToDatabase,
  getCurrentVendingStockList,
  updateItemStockByName,
  updateVendingStock,
  VILLAGE_ICONS,
  VILLAGE_IMAGES
} = require("../database/vendingService");
const { connectToVendingDatabase } = require('./vendingHandler');

// ------------------- Modules -------------------
const { capitalize, capitalizeFirstLetter } = require('../modules/formattingModule');
const { getGeneralJobsPage, getJobPerk, getVillageExclusiveJobs } = require('../modules/jobsModule');
const { getAllVillages } = require('../modules/locationsModule');
const { modCharacters, getModCharacterByName } = require('../modules/modCharacters');
const { distractionItems, staminaRecoveryItems } = require('../modules/mountModule');
const { petEmojiMap, getPetTypeData } = require('../modules/petModule');
const { getAllRaces } = require('../modules/raceModule');

// ------------------- Database Models -------------------
const Character = require('../models/CharacterModel');
const initializeInventoryModel = require('../models/InventoryModel');
const Item = require('../models/ItemModel');
const Mount = require('../models/MountModel');
const Party = require('../models/PartyModel');
const Pet = require('../models/PetModel');
const ShopStock = require('../models/ShopsModel');
const VendingModel = require('../models/VendingModel');
const { Village } = require('../models/VillageModel');

// ------------------- Handlers -------------------
const { loadBlightSubmissions } = require('../handlers/blightHandler');

// ------------------- Utility Functions -------------------
// None in this case

// ------------------- Main Function to Handle Autocomplete Interactions -------------------
async function handleAutocomplete(interaction) {
  try {
    await connectToTinglebot(); // Ensure MongoDB connection

    const focusedOption = interaction.options.getFocused(true); // Get the focused option from the interaction
    const commandName = interaction.commandName; // Get the command name from the interaction

// ============================================================================
// ------------------- Route Handler for Command Autocomplete -------------------
// This function routes based on the command name and focused option,
// handling autocomplete responses for various commands.
// ============================================================================

    // ------------------- BLIGHT Commands -------------------
    // Handles autocomplete for blight commands: character/healer names and items.
    if (commandName === 'blight' && (focusedOption.name === 'character_name' || focusedOption.name === 'healer_name')) {
      await handleBlightCharacterAutocomplete(interaction, focusedOption);
    } else if (commandName === 'blight' && focusedOption.name === 'item') {
      await handleBlightItemAutocomplete(interaction, focusedOption);

    // ------------------- CHANGEJOB Commands -------------------
    // Handles autocomplete for changejob command for new job selection and character names.
    } else if (commandName === 'changejob' && focusedOption.name === 'newjob') {
      await handleChangeJobNewJobAutocomplete(interaction, focusedOption);
    } else if (commandName === 'changejob' && focusedOption.name === 'charactername') {
      await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName);

    // ------------------- COMBAT Commands -------------------
    // Handles autocomplete for combat command: attacker and defender selection.
  } else if (commandName === 'combat') {
    await handleCombatAutocomplete(interaction, focusedOption);
  
    // ------------------- CRAFTING Commands -------------------
    // Handles autocomplete for crafting command: item names and character names.
    } else if (commandName === 'crafting' && focusedOption.name === 'itemname') {
      await handleCraftingAutocomplete(interaction, focusedOption);
    } else if (commandName === 'crafting' && focusedOption.name === 'charactername') {
      await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName);

    // ------------------- CREATECHARACTER Commands -------------------
    // Handles autocomplete for createcharacter command: home village and race selection.
    } else if (commandName === 'createcharacter' && focusedOption.name === 'homevillage') {
      await handleCreateCharacterVillageAutocomplete(interaction, focusedOption);
    } else if (commandName === 'createcharacter' && focusedOption.name === 'race') {
      await handleCreateCharacterRaceAutocomplete(interaction, focusedOption);

    // ------------------- CUSTOMWEAPON Commands -------------------
    // Handles autocomplete for customweapon submission: base weapon and subtype selection.
    } else if (commandName === 'customweapon' && interaction.options.getSubcommand() === 'submit' && focusedOption.name === 'baseweapon') {
      await handleBaseWeaponAutocomplete(interaction);
    } else if (commandName === 'customweapon' && interaction.options.getSubcommand() === 'submit' && focusedOption.name === 'subtype') {
      await handleSubtypeAutocomplete(interaction);

    // ------------------- DELIVER Commands -------------------
    // Handles autocomplete for deliver command across multiple subcommands and options.
    } else if (commandName === 'deliver' && focusedOption.name === 'sender') {
      await handleCourierSenderAutocomplete(interaction, focusedOption);
    } else if (commandName === 'deliver' && ['request', 'vendingstock'].includes(interaction.options.getSubcommand()) && focusedOption.name === 'courier') {
      await handleCourierAutocomplete(interaction, focusedOption);
    } else if (commandName === 'deliver' && interaction.options.getSubcommand() === 'vendingstock' && focusedOption.name === 'recipient') {
      await handleVendingRecipientAutocomplete(interaction, focusedOption);
    } else if (commandName === 'deliver' && interaction.options.getSubcommand() === 'vendingstock' && focusedOption.name === 'vendor') {
      await handleRecipientAutocomplete(interaction, focusedOption); // Alternatively, a distinct handleVendorAutocomplete could be used
    } else if (commandName === 'deliver' && interaction.options.getSubcommand() === 'vendingstock' && focusedOption.name === 'vendoritem') {
      await handleVendorItemAutocomplete(interaction, focusedOption);
    } else if (commandName === 'deliver' && ['accept', 'fulfill'].includes(interaction.options.getSubcommand()) && focusedOption.name === 'courier') {
      await handleCourierAcceptAutocomplete(interaction, focusedOption);
    } else if (commandName === 'deliver' && interaction.options.getSubcommand() === 'request' && focusedOption.name === 'recipient') {
      await handleAllRecipientAutocomplete(interaction, focusedOption);
    } else if (commandName === 'deliver' && interaction.options.getSubcommand() === 'request' && focusedOption.name === 'item') {
      await handleDeliverItemAutocomplete(interaction, focusedOption);

    // ------------------- EDITCHARACTER Commands -------------------
    // Handles autocomplete for editcharacter command: updated character info.
    } else if (commandName === 'editcharacter' && focusedOption.name === 'updatedinfo') {
      await handleEditCharacterAutocomplete(interaction, focusedOption);

    // ------------------- EXPLORE Commands -------------------
    // Handles autocomplete for explore command: item selection and character roll.
    } else if (commandName === 'explore' && ['item1', 'item2', 'item3'].includes(focusedOption.name)) {
      await handleExploreItemAutocomplete(interaction, focusedOption);
    } else if (commandName === 'explore' && focusedOption.name === 'charactername') {
      await handleExploreRollCharacterAutocomplete(interaction, focusedOption);

    // ------------------- GEAR Commands -------------------
  } else if (commandName === 'gear' && focusedOption.name === 'charactername') {
    await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName);
  
  } else if (commandName === 'gear' && focusedOption.name === 'itemname') {
    await handleGearAutocomplete(interaction, focusedOption);  

    // ------------------- GIFT Commands -------------------
    // Handles autocomplete for gift command.
    } else if (commandName === 'gift') {
      await handleGiftAutocomplete(interaction, focusedOption);

    // ------------------- HEAL Commands -------------------
    // Handles autocomplete for heal command.
    } else if (commandName === 'heal') {
      await handleHealAutocomplete(interaction, focusedOption);

    // ------------------- ITEM Commands -------------------
    // Handles autocomplete for item command: job vouchers and healing.
    } else if (commandName === 'item' && focusedOption.name === 'jobname') {
      await handleItemJobVoucherAutocomplete(interaction, focusedOption);
    } else if (commandName === 'item') {
      await handleItemHealAutocomplete(interaction, focusedOption);

    // ------------------- LOOKUP Commands -------------------
    // Handles autocomplete for lookup command: item and ingredient lookup.
    } else if (commandName === 'lookup' && (focusedOption.name === 'item' || focusedOption.name === 'ingredient')) {
      await handleLookupAutocomplete(interaction, focusedOption);

    // ------------------- MODGIVE Commands -------------------
    // Handles autocomplete for modgive command: character and item selection.
    } else if (commandName === 'modgive' && (focusedOption.name === 'character' || focusedOption.name === 'charactername')) {
      await handleModGiveCharacterAutocomplete(interaction, focusedOption);
    } else if (commandName === 'modgive' && focusedOption.name === 'item') {
      await handleModGiveItemAutocomplete(interaction, focusedOption);

    // ------------------- MOUNT/STABLE Commands -------------------
    // Handles autocomplete for mount and stable commands: character and mount names.
    } else if ((commandName === 'mount' || commandName === 'stable') && focusedOption.name === 'charactername') {
      await handleMountAutocomplete(interaction, focusedOption);
    } else if ((commandName === 'mount' || commandName === 'stable') && focusedOption.name === 'mountname') {
      await handleMountNameAutocomplete(interaction, focusedOption);

    // ------------------- PET Commands -------------------
    // Handles autocomplete for pet command.
    } else if (commandName === 'pet') {
      await handlePetAutocomplete(interaction, focusedOption);

    // ------------------- SHOPS Commands -------------------
    // Handles autocomplete for shops command: item names.
    } else if (commandName === 'shops' && focusedOption.name === 'itemname') {
      await handleShopsAutocomplete(interaction, focusedOption);

    // ------------------- RELICS Commands -------------------
  } else if (commandName === 'relic' && focusedOption.name === 'character') {
    await handleRelicOwnerAutocomplete(interaction, focusedOption);
    return;
  } else if (commandName === 'relic' && focusedOption.name === 'appraiser') {
    await handleRelicAppraiserAutocomplete(interaction, focusedOption);
    return;
    
    // ------------------- STEAL Commands -------------------
    // Handles autocomplete for steal command: character name, target selection, and rarity.
    } else if (commandName === 'steal') {
      await handleStealAutocomplete(interaction, focusedOption);

    // ------------------- TRADE Commands -------------------
    // Handles autocomplete for trade command.
    } else if (commandName === 'trade') {
      await handleTradeAutocomplete(interaction, focusedOption);

    // ------------------- TRANSFER Commands -------------------
    // Handles autocomplete for transfer command.
    } else if (commandName === 'transfer') {
      await handleTransferAutocomplete(interaction, focusedOption);

    // ------------------- TRAVEL Commands -------------------
    // Handles autocomplete for travel command: character names and destination selection.
    } else if (commandName === 'travel') {
      if (focusedOption.name === 'charactername') {
        await handleTravelAutocomplete(interaction, focusedOption);
      } else if (focusedOption.name === 'destination') {
        await handleVillageBasedCommandsAutocomplete(interaction, focusedOption);
      }

    // ------------------- VENDING Commands -------------------
    // Handles autocomplete for vending command.
    } else if (commandName === 'vending') {
      await handleVendingAutocomplete(interaction, focusedOption);

    // ------------------- VILLAGE Commands -------------------
    // Handles autocomplete for village command: character and item names.
    } else if (commandName === 'village') {
      if (focusedOption.name === 'charactername') {
        await handleVillageUpgradeCharacterAutocomplete(interaction);
      } else if (focusedOption.name === 'itemname') {
        await handleVillageMaterialsAutocomplete(interaction);
      }

    // ------------------- VIEWINVENTORY Commands -------------------
    // Handles autocomplete for viewinventory command: character names.
    } else if (commandName === 'viewinventory' && focusedOption.name === 'charactername') {
      await handleViewInventoryAutocomplete(interaction, focusedOption);

    // ------------------- CHARACTER-BASED Autocomplete -------------------
    // Handles autocomplete for all commands that use a character name or require character selection.
    const characterBasedCommands = [
      'changejob', 'shops', 'explore', 'raid', 'editcharacter', 'deletecharacter',
      'setbirthday', 'viewcharacter', 'testinventorysetup', 'syncinventory',
      'crafting', 'gather', 'loot', 'gear', 'customweapon', 'pet', 'spiritorbs'
    ];    

    if (characterBasedCommands.includes(commandName) && ['charactername', 'character'].includes(focusedOption.name)) {
      await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName);
    }

    // ------------------- Fallback -------------------
    // If no conditions match, respond with an empty autocomplete array.
    } else {
      await interaction.respond([]);
    }
    
  } catch (error) {
    // ------------------- Error Handling -------------------
    // Log error with detailed information and respond with an error message.
    console.error('[autocompleteHandler.js]: logs', error);
    await safeRespondWithError(interaction);
  }
}


// ------------------- Helper Function to Safely Respond with Error -------------------
async function safeRespondWithError(interaction) {
  try {
    await interaction.respond([]); // Respond with an empty array to avoid "Unknown interaction" error
  } catch (respondError) {
    // Error handling can be added here if needed
  }
}

// ------------------- Helper Function to Filter and Respond with Choices -------------------
async function respondWithFilteredChoices(interaction, focusedOption, choices) {
  const filteredChoices = focusedOption.value === ''
    ? choices.slice(0, 25) // Return up to 25 options if no input is provided
    : choices.filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25); // Filter based on input

  filteredChoices.sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically
  await interaction.respond(filteredChoices); // Send the filtered choices
}

// ============================================================================
// BLIGHT
// ============================================================================
// ------------------- Character & Healer Autocomplete Handler -------------------

async function handleBlightCharacterAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Extract the User ID from the interaction -------------------
    const userId = interaction.user.id;

    // ------------------- Autocomplete for Blighted Character Names -------------------
    if (focusedOption.name === 'character_name') {
      // Fetch characters associated with the user and format names with village
      const blightedCharacters = await fetchBlightedCharactersByUserId(userId);
      const choices = blightedCharacters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`, // Format: Name - Village
        value: character.name,
      }));

      // Respond with filtered choices based on user input
      await respondWithFilteredChoices(interaction, focusedOption, choices);

    // ------------------- Autocomplete for Healer Names -------------------
    } else if (focusedOption.name === 'healer_name') {
      // Format healer names with their village
      const choices = healers.map(healer => ({
        name: `${healer.name} - ${capitalize(healer.village)}`, // Format: Name - Village
        value: healer.name,
      }));

      // Respond with filtered choices based on user input
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

  } catch (error) {
    // ------------------- Log any unexpected errors for debugging -------------------
    console.error('[blightAutocompleteHandlers.js]: logs -> Error in handleBlightCharacterAutocomplete:', error);

    // ------------------- Gracefully inform the user of a failure -------------------
    await safeRespondWithError(interaction);
  }
}

// ------------------- Blight Item Autocomplete Handler -------------------

async function handleBlightItemAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Collect all healing items from mod characters -------------------
    const allItems = [];

    // Traverse mod characters to find healing requirements of type 'item'
    modCharacters.forEach(character => {
      character.getHealingRequirements().forEach(requirement => {
        if (requirement.type === 'item') {
          allItems.push(...requirement.items); // Add all relevant items
        }
      });
    });

    // ------------------- Format item choices with quantity -------------------
    const choices = allItems.map(item => `${item.name} x${item.quantity}`);

    // ------------------- Filter choices based on user's input -------------------
    const filteredChoices = choices.filter(choice =>
      choice.toLowerCase().includes(focusedOption.value.toLowerCase())
    );

    // ------------------- Limit to 25 results to match Discord's requirement -------------------
    const limitedChoices = filteredChoices.slice(0, 25);

    // ------------------- Respond with filtered item choices -------------------
    await interaction.respond(
      limitedChoices.map(choice => ({
        name: choice,   // Format: Item name xQuantity
        value: choice,  // Use same string as value
      }))
    );

  } catch (error) {
    // ------------------- Log error and return safe fallback -------------------
    console.error('[blightAutocompleteHandlers.js]: logs -> Error in handleBlightItemAutocomplete:', error);
    await interaction.respond([]); // Empty response on error
  }
}

// ============================================================================
// CHANGEJOB
// ============================================================================
// Handles job name autocompletion for the "new job" input when a user changes a character's job.

async function handleChangeJobNewJobAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Extract User ID and Character Name -------------------
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');

    // ------------------- Fetch Character Based on Name and User -------------------
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      console.warn(`[changeJobAutocomplete.js]: logs -> Character not found for userId: ${userId}, characterName: ${characterName}`);
      await interaction.respond([]); // Return empty autocomplete result
      return;
    }

    // ------------------- Retrieve Available Jobs -------------------
    const generalJobs = getGeneralJobsPage(1).concat(getGeneralJobsPage(2)); // Retrieve general jobs across pages
    const villageJobs = getVillageExclusiveJobs(character.homeVillage); // Village-specific job list

    // ------------------- Merge and Filter Job List -------------------
    const allJobs = [...generalJobs, ...villageJobs]; // Combine general and village jobs
    const filteredJobs = focusedOption.value
      ? allJobs.filter(job =>
          job.toLowerCase().includes(focusedOption.value.toLowerCase())
        )
      : allJobs;

    // ------------------- Format and Limit Choices for Autocomplete -------------------
    const formattedChoices = filteredJobs.map(job => ({
      name: job,   // Job name displayed in the dropdown
      value: job,  // Value sent when selected
    }));

    await interaction.respond(formattedChoices.slice(0, 25)); // Discord limit: 25 options

  } catch (error) {
    // ------------------- Log Unexpected Error and Fail Gracefully -------------------
    console.error('[changeJobAutocomplete.js]: logs -> Error in handleChangeJobNewJobAutocomplete:', error);
    await interaction.respond([]); // Respond with an empty result on error
  }
}

// ============================================================================
// COMBAT
// ============================================================================
// Handles attacker and defender character autocompletion for the /combat command.
// Handles autocomplete for commands requiring character name input.

async function handleCombatAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const commandName = interaction.commandName;

    // ------------------- Handle Autocomplete for Attacker -------------------
    if (focusedOption.name === 'attacker') {
      // Use shared character-based autocomplete handler
      return await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName);
    }

    // ------------------- Handle Autocomplete for Defender -------------------
    if (focusedOption.name === 'defender') {
      const attackerName = interaction.options.getString('attacker');
      if (!attackerName) return await interaction.respond([]);

      const attackerCharacter = await fetchCharacterByNameAndUserId(attackerName, userId);
      if (!attackerCharacter) return await interaction.respond([]);

      // Fetch characters in the same village (excluding attacker)
      const allCharacters = await fetchAllCharacters();
      const villageCharacters = allCharacters.filter(c =>
        c.currentVillage.toLowerCase() === attackerCharacter.currentVillage.toLowerCase() &&
        c.name.toLowerCase() !== attackerCharacter.name.toLowerCase()
      );

      // Format choices: Name - Village
      const choices = villageCharacters.map(c => ({
        name: `${c.name} - ${c.currentVillage}`,
        value: c.name
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

  } catch (error) {
    console.error('[combatAutocomplete.js]: logs -> Error in handleCombatAutocomplete:', error);
    await interaction.respond([]);
  }
}
// ============================================================================
// CRAFTING
// ============================================================================
// Handles autocomplete logic for the 'crafting' command, filtering items that 
// a character is eligible to craft based on their job, inventory, and input.

async function handleCraftingAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Extract User and Character Info -------------------
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');

    // ------------------- Retrieve User's Characters -------------------
    const characters = await fetchCharactersByUserId(userId);

    // ------------------- Find the Character Matching the Name -------------------
    const character = characters.find(c => c.name === characterName);
    if (!character) {
      return await interaction.respond([]);
    }

    // ------------------- Determine Character's Job (from voucher or default) -------------------
    const job = character.jobVoucher ? character.jobVoucherJob : character.job;

    // ------------------- Validate Job Eligibility for Crafting -------------------
    const jobPerk = getJobPerk(job);
    if (!jobPerk || !jobPerk.perks.includes('CRAFTING')) {
      return await interaction.respond([]);
    }

    // ------------------- Fetch Character's Inventory -------------------
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const characterInventory = await inventoryCollection.find().toArray();

    // ------------------- Get Craftable Items Based on Inventory Materials -------------------
    const craftableItems = await fetchCraftableItemsAndCheckMaterials(characterInventory);
    if (craftableItems.length === 0) {
      return await interaction.respond([]);
    }

    // ------------------- Filter Items Based on Character's Job Tags -------------------
    const filteredItems = craftableItems.filter(item =>
      item.craftingTags.some(tag => tag.toLowerCase() === job.toLowerCase())
    );
    if (filteredItems.length === 0) {
      return await interaction.respond([]);
    }

    // ------------------- Filter Based on User Input -------------------
    const inputValue = focusedOption.value.toLowerCase();
    const matchingItems = filteredItems.filter(item =>
      item.itemName.toLowerCase().includes(inputValue)
    );

    // ------------------- Format and Limit Choices to 25 -------------------
    const MAX_CHOICES = 25;
    const choices = matchingItems.slice(0, MAX_CHOICES).map(item => ({
      name: item.itemName,
      value: item.itemName,
    }));

    // ------------------- Respond with Filtered Autocomplete Choices -------------------
    if (!interaction.responded) {
      await interaction.respond(choices);
    }

  } catch (error) {
    // ------------------- Handle Errors Gracefully -------------------
    console.error('[craftingAutocomplete.js]: logs -> Error in handleCraftingAutocomplete:', error);
    if (!interaction.responded) {
      await interaction.respond([]);
    }
  }
}

// ============================================================================
// CREATECHARACTER
// ============================================================================
// Handles race autocomplete for the character creation command.
// Handles village name autocomplete for the character creation command.

// -------------------  Character Creation: Race Autocomplete -------------------
async function handleCreateCharacterRaceAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Retrieve and Format Race Options -------------------
    const races = getAllRaces();
    const choices = races.map(race => ({
      name: capitalize(race), // Capitalized display name (e.g., "Elf")
      value: race              // Raw value used by backend (e.g., "elf")
    }));

    // ------------------- Respond with Filtered Choices -------------------
    await respondWithFilteredChoices(interaction, focusedOption, choices);

  } catch (error) {
    // ------------------- Handle Errors Gracefully -------------------
    console.error('[characterCreationAutocomplete.js]: logs -> Error in handleCreateCharacterRaceAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- 🏘️ Character Creation: Village Autocomplete -------------------
async function handleCreateCharacterVillageAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Retrieve and Format Village Options -------------------
    const villages = getAllVillages();
    const choices = villages.map(village => ({
      name: village,  // Display name (no need to capitalize)
      value: village  // Raw value used internally
    }));

    // ------------------- Respond with Filtered Choices -------------------
    await respondWithFilteredChoices(interaction, focusedOption, choices);

  } catch (error) {
    // ------------------- Handle Errors Gracefully -------------------
    console.error('[characterCreationAutocomplete.js]: logs -> Error in handleCreateCharacterVillageAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// CUSTOMWEAPON
// ============================================================================
// Handles autocomplete for selecting a base weapon by name.
// Handles autocomplete for weapon subtypes (e.g., "Sword", "Axe").

// -------------------  Autocomplete: Base Weapon Names -------------------
async function handleBaseWeaponAutocomplete(interaction) {
  try {
    const focusedValue = interaction.options.getFocused(); // User input for filtering

    // ------------------- Fetch Weapons from Database -------------------
    const items = await fetchItemsByCategory('Weapon');
    if (!items || items.length === 0) {
      console.warn('[weaponAutocomplete.js]: logs -> No weapons found in the database.');
      return await interaction.respond([]); // Return empty response
    }

    // ------------------- Filter and Format Choices -------------------
    const choices = items
      .filter(item =>
        item.itemName.toLowerCase().includes(focusedValue.toLowerCase())
      )
      .slice(0, 25) // Discord limit
      .map(item => ({
        name: item.itemName,
        value: item.itemName,
      }));

    // ------------------- Respond with Filtered Weapon Names -------------------
    await interaction.respond(choices);

  } catch (error) {
    console.error('[weaponAutocomplete.js]: logs -> Error in handleBaseWeaponAutocomplete:', error);
    await interaction.respond([]); // Fallback response on error
  }
}

// ------------------- 🧩 Autocomplete: Weapon Subtypes -------------------
async function handleSubtypeAutocomplete(interaction) {
  try {
    const focusedValue = interaction.options.getFocused(); // User input for filtering

    // ------------------- Fetch Weapons to Extract Subtypes -------------------
    const items = await fetchItemsByCategory('Weapon');
    if (!items || items.length === 0) {
      console.warn('[weaponAutocomplete.js]: logs -> No weapons found in the database.');
      return await interaction.respond([]);
    }

    // ------------------- Extract and Deduplicate Subtypes -------------------
    const subtypes = [...new Set(items.flatMap(item => item.subtype))];

    // ------------------- Filter Subtypes Based on Input -------------------
    const filteredSubtypes = subtypes
      .filter(subtype =>
        subtype && subtype.toLowerCase().includes(focusedValue.toLowerCase())
      )
      .slice(0, 25); // Discord limit

    // ------------------- Format Subtypes for Discord -------------------
    const choices = filteredSubtypes.map(subtype => ({
      name: subtype,
      value: subtype,
    }));

    // ------------------- Respond with Filtered Subtypes -------------------
    await interaction.respond(choices);

  } catch (error) {
    console.error('[weaponAutocomplete.js]: logs -> Error in handleSubtypeAutocomplete:', error);
    await interaction.respond([]); // Fallback response on error
  }
}

// ============================================================================
// DELIVER
// ============================================================================
// Handles sender, courier, recipient, and item autocompletion for delivery-related commands

// ------------------- Autocomplete: Sender (User-Owned Characters) -------------------
async function handleCourierSenderAutocomplete(interaction, focusedOption) {
  const userId = interaction.user.id;
  await handleCharacterAutocomplete(
    interaction,
    focusedOption,
    () => fetchCharactersByUserId(userId),
    () => true,
    c => ({
      name: `${c.name} - ${capitalize(c.currentVillage)}`,
      value: c.name
    })
  );
}

// ------------------- Autocomplete: Courier (All Couriers) -------------------
async function handleCourierAutocomplete(interaction, focusedOption) {
  await handleCharacterAutocomplete(
    interaction,
    focusedOption,
    fetchAllCharacters,
    c => c.job && c.job.toLowerCase() === 'courier',
    c => ({
      name: `${c.name} - ${capitalize(c.currentVillage)}`,
      value: c.name
    })
  );
}

// ------------------- Autocomplete: Recipient (Exclude User's Characters) -------------------
async function handleRecipientAutocomplete(interaction, focusedOption) {
  const userId = interaction.user.id;
  await handleCharacterAutocomplete(
    interaction,
    focusedOption,
    () => fetchAllCharactersExceptUser(userId),
    () => true,
    c => ({
      name: `${c.name} - ${capitalize(c.currentVillage)}`,
      value: c.name
    })
  );
}

// ------------------- Autocomplete: Courier (User-Owned Couriers for Accept Subcommand) -------------------
async function handleCourierAcceptAutocomplete(interaction, focusedOption) {
  const userId = interaction.user.id;
  await handleCharacterAutocomplete(
    interaction,
    focusedOption,
    () => fetchCharactersByUserId(userId),
    c => c.job && c.job.toLowerCase() === 'courier',
    c => ({
      name: `${c.name} - ${capitalize(c.currentVillage)}`,
      value: c.name
    })
  );
}

// ------------------- Autocomplete: Vending Recipient (Shopkeeper/Merchant User-Owned) -------------------
async function handleVendingRecipientAutocomplete(interaction, focusedOption) {
  const userId = interaction.user.id;
  await handleCharacterAutocomplete(
    interaction,
    focusedOption,
    () => fetchCharactersByUserId(userId),
    c => {
      const job = c.job ? c.job.toLowerCase() : '';
      return job === 'shopkeeper' || job === 'merchant';
    },
    c => ({
      name: `${c.name} - ${capitalize(c.job || 'Unknown')} - ${capitalize(c.currentVillage || 'Unknown')}`,
      value: c.name
    })
  );
}

// ------------------- Autocomplete: All Characters (No Filtering) -------------------
async function handleAllRecipientAutocomplete(interaction, focusedOption) {
  try {
    const characters = await fetchAllCharacters();
    const choices = characters.map(c => ({
      name: `${c.name} - ${capitalize(c.currentVillage)}`,
      value: c.name
    }));
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[courierAutocomplete.js]: logs -> Error in handleAllRecipientAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Autocomplete: Deliver Items (From Sender's Inventory) -------------------
async function handleDeliverItemAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const senderName = interaction.options.getString('sender');
    if (!senderName) return await interaction.respond([]);

    const senderCharacter = await fetchCharacterByNameAndUserId(senderName, userId);
    if (!senderCharacter) return await interaction.respond([]);

    const inventoryCollection = await getCharacterInventoryCollection(senderCharacter.name);
    const inventory = await inventoryCollection.find().toArray();

    // Group by item name and total quantities
    const itemMap = new Map();
    for (const item of inventory) {
      const name = item.itemName;
      itemMap.set(name, (itemMap.get(name) || 0) + item.quantity);
    }

    // Format inventory items for response
    const choices = Array.from(itemMap.entries()).map(([name, qty]) => ({
      name: `${name} - QTY:${qty}`,
      value: name
    }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[courierAutocomplete.js]: logs -> Error in handleDeliverItemAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Autocomplete: Vendor Items (Based on Vending Stock) -------------------
async function handleVendorItemAutocomplete(interaction, focusedOption) {
  try {
    const courierName = interaction.options.getString('courier');
    const recipientName = interaction.options.getString('recipient');
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

    const filteredItems = villageStock.filter(item =>
      item.vendingType?.toLowerCase() === vendorType &&
      item.itemName?.toLowerCase().includes(searchQuery)
    );

    const choices = filteredItems.slice(0, 25).map(item => ({
      name: `${item.itemName} - ${item.points} pts`,
      value: item.itemName,
    }));

    await interaction.respond(choices);
  } catch (error) {
    console.error('[courierAutocomplete.js]: logs -> Error in handleVendorItemAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// EDITCHARACTER
// ============================================================================
// Handles autocomplete for editing character fields like job, race, village, and icon.

async function handleEditCharacterAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Retrieve Selected Category -------------------
    const category = interaction.options.getString('category');
    let choices = [];

    // ------------------- Autocomplete Options Based on Category -------------------
    if (category === 'job') {
      // Suggest job type categories
      choices = [
        { name: 'General Jobs', value: 'General Jobs' },
        { name: 'Inariko Exclusive Jobs', value: 'Inariko Exclusive Jobs' },
        { name: 'Rudania Exclusive Jobs', value: 'Rudania Exclusive Jobs' },
        { name: 'Vhintl Exclusive Jobs', value: 'Vhintl Exclusive Jobs' },
      ];

    } else if (category === 'race') {
      // Suggest available races with capitalization
      choices = getAllRaces().map(race => ({
        name: capitalize(race),
        value: race
      }));

    } else if (category === 'homeVillage') {
      // Suggest available villages
      choices = getAllVillages().map(village => ({
        name: village,
        value: village
      }));

    } else if (category === 'icon') {
      // Placeholder option for uploading a new icon
      choices = [{
        name: 'Please upload a new icon',
        value: 'Please upload a new icon'
      }];
    }

    // ------------------- Respond with Filtered Choices -------------------
    await respondWithFilteredChoices(interaction, focusedOption, choices);

  } catch (error) {
    // ------------------- Log and Handle Errors Gracefully -------------------
    console.error('[editCharacterAutocomplete.js]: logs -> Error in handleEditCharacterAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// EXPLORE
// ============================================================================.
// Autocomplete handler for selecting usable healing items during exploration.
// Autocomplete handler for selecting a character participating in an expedition.

// -------------------  Explore: Item Autocomplete -------------------
async function handleExploreItemAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');

    // ------------------- Validate Required Input -------------------
    if (!characterName) return await interaction.respond([]);

    // ------------------- Fetch Character -------------------
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) return await interaction.respond([]);

    // ------------------- Retrieve Character Inventory -------------------
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const inventoryItems = await inventoryCollection.find().toArray();
    const itemIds = inventoryItems.map(item => item.itemId);

    // ------------------- Fetch Valid Explore Items -------------------
    const healingItems = await ItemModel.find({
      _id: { $in: itemIds },
      itemName: { $ne: 'Oil Jar' }, // Exclude specific item
      $or: [
        { category: 'Recipe' },
        { itemName: 'Fairy' },
        { itemName: 'Eldin Ore' },
        { itemName: 'Wood' },
      ],
    }).lean().exec();

    // ------------------- Format Item Autocomplete Choices -------------------
    const choices = healingItems.map(item => {
      const inventoryItem = inventoryItems.find(
        inv => inv.itemId.toString() === item._id.toString()
      );

      const quantityDisplay = item.itemName === 'Eldin Ore'
        ? Math.floor(inventoryItem.quantity / 5)
        : item.itemName === 'Wood'
        ? Math.floor(inventoryItem.quantity / 10)
        : inventoryItem.quantity;

      return {
        name: `${item.itemName} - Heals ${item.modifierHearts} ❤️ | ${item.staminaRecovered} 🟩 - Qty: ${quantityDisplay}`,
        value: inventoryItem.itemName,
      };
    });

    await respondWithFilteredChoices(interaction, focusedOption, choices);

  } catch (error) {
    console.error('[exploreAutocomplete.js]: logs -> Error in handleExploreItemAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// -------------------  Explore: Roll Character Autocomplete -------------------
async function handleExploreRollCharacterAutocomplete(interaction, focusedOption) {
  try {
    const expeditionId = interaction.options.getString('id');
    if (!expeditionId) return await interaction.respond([]);

    // ------------------- Retrieve Party by Expedition ID -------------------
    const party = await Party.findOne({ partyId: expeditionId }).lean();
    if (!party || !Array.isArray(party.characters) || party.characters.length === 0) {
      return await interaction.respond([]);
    }

    // ------------------- Format Character Choices -------------------
    const choices = party.characters.map(character => ({
      name: character.name,
      value: character.name,
    }));

    await interaction.respond(choices);

  } catch (error) {
    console.error('[exploreAutocomplete.js]: logs -> Error in handleExploreRollCharacterAutocomplete:', error);
    await interaction.respond([]);
  }
}

// ============================================================================
// GEAR
// ============================================================================
// Provides autocomplete suggestions for equippable gear based on type.
// Types supported: weapon, shield, head, chest, legs

async function handleGearAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Extract Input Parameters -------------------
    const characterName = interaction.options.getString('charactername');
    const type = interaction.options.getString('type');
    const userId = interaction.user.id;

    // ------------------- Fetch Character -------------------
    const characters = await fetchCharactersByUserId(userId);
    const character = characters.find(c => c.name === characterName);
    if (!character) return await interaction.respond([]);

    // ------------------- Fetch Character Inventory -------------------
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const characterInventory = await inventoryCollection.find().toArray();

    // ------------------- Filter Inventory Based on Gear Type -------------------
    const filteredItems = characterInventory.filter(item => {
      const categories = item.category?.split(',').map(cat => cat.trim().toLowerCase()) || [];
      const subtypes = Array.isArray(item.subtype)
        ? item.subtype.map(st => st.trim().toLowerCase())
        : item.subtype
        ? [item.subtype.trim().toLowerCase()]
        : [];

      const itemType = item.type?.toLowerCase() || '';

      switch (type) {
        case 'weapon':
          return categories.includes('weapon') && !subtypes.includes('shield');
        case 'shield':
          return subtypes.includes('shield');
        case 'head':
          return categories.includes('armor') && itemType.includes('head');
        case 'chest':
          return categories.includes('armor') && itemType.includes('chest');
        case 'legs':
          return categories.includes('armor') && itemType.includes('legs');
        default:
          return false;
      }
    });

    // ------------------- Format Autocomplete Choices -------------------
    const choices = filteredItems.map(item => ({
      name: `${item.itemName} - QTY:${item.quantity}`,
      value: item.itemName
    }));

    // ------------------- Respond with Filtered Gear -------------------
    await respondWithFilteredChoices(interaction, focusedOption, choices);

  } catch (error) {
    console.error('[gearAutocomplete.js]: logs -> Error in handleGearAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// GIFT
// ============================================================================
// Handles autocomplete for gifting: selecting characters and items.
// Supports: fromcharacter, tocharacter, itema, itemb, itemc

async function handleGiftAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;

    // ------------------- Autocomplete: From Character (Owned by User) -------------------
    if (focusedOption.name === 'fromcharacter') {
      const characters = await fetchCharactersByUserId(userId);

      const choices = characters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`,
        value: character.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Autocomplete: To Character (Not Owned by User) -------------------
    if (focusedOption.name === 'tocharacter') {
      const allCharacters = await fetchAllCharactersExceptUser(userId);

      const choices = allCharacters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`,
        value: character.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Autocomplete: Items (itema, itemb, itemc) -------------------
    if (['itema', 'itemb', 'itemc'].includes(focusedOption.name)) {
      const fromCharacterName = interaction.options.getString('fromcharacter');
      if (!fromCharacterName) return await interaction.respond([]);

      const fromCharacter = await fetchCharacterByNameAndUserId(fromCharacterName, userId);
      if (!fromCharacter) return await interaction.respond([]);

      const inventoryCollection = await getCharacterInventoryCollection(fromCharacter.name);
      const fromInventory = await inventoryCollection.find().toArray();

      const choices = fromInventory.map(item => ({
        name: `${item.itemName} - QTY:${item.quantity}`,
        value: item.itemName,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

  } catch (error) {
    console.error('[giftAutocomplete.js]: logs -> Error in handleGiftAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// HEAL
// ============================================================================
// Handles autocomplete for healing requests including charactername, healer, and healername fields.

async function handleHealAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;

    // ------------------- Autocomplete: User's Characters for Heal Target -------------------
    if (focusedOption.name === 'charactername') {
      const userCharacters = await fetchCharactersByUserId(userId);

      const choices = userCharacters.map(character => ({
        name: `${character.name} - ${capitalizeFirstLetter(character.currentVillage)}`,
        value: character.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Helper: Determine if Character is a Healer -------------------
    const isHealer = (character) =>
      character.job?.toLowerCase() === 'healer' ||
      (character.jobVoucher === true && character.jobVoucherJob?.toLowerCase() === 'healer');

    // ------------------- Autocomplete: Global Healers -------------------
    if (focusedOption.name === 'healer') {
      const allCharacters = await fetchAllCharacters();
      const healerCharacters = allCharacters.filter(isHealer);

      const choices = healerCharacters.map(character => ({
        name: `${character.name} - ${capitalizeFirstLetter(character.currentVillage)}`,
        value: character.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Autocomplete: User-Owned Healers -------------------
    if (focusedOption.name === 'healername') {
      const userCharacters = await fetchCharactersByUserId(userId);
      const healerCharacters = userCharacters.filter(isHealer);

      const choices = healerCharacters.map(character => ({
        name: `${character.name} - ${capitalizeFirstLetter(character.currentVillage)}`,
        value: character.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

  } catch (error) {
    console.error('[autocompleteHandler.js]: logs -> Error in handleHealAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// ITEM
// ============================================================================
// Suggests jobs (general + village-specific) when using a Job Voucher item.
// Handles autocomplete for healing-related item usage.
// Supports 'charactername' and 'itemname' fields.

// ------------------- Item Job Voucher Autocomplete -------------------
async function handleItemJobVoucherAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');

    // ------------------- Guard: Ensure character name is provided -------------------
    if (!characterName) {
      console.warn('[itemAutocomplete.js]: logs -> No character name provided.');
      return await interaction.respond([]);
    }

    // ------------------- Fetch Character -------------------
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      console.warn(`[itemAutocomplete.js]: logs -> Character not found for userId: ${userId}, name: ${characterName}`);
      return await interaction.respond([]);
    }

    // ------------------- Fetch Available Jobs -------------------
    const generalJobs = getGeneralJobsPage(1).concat(getGeneralJobsPage(2));
    const villageJobs = getVillageExclusiveJobs(character.currentVillage);
    const allJobs = [...generalJobs, ...villageJobs];

    // ------------------- Filter and Format Job List -------------------
    const filteredJobs = focusedOption.value
      ? allJobs.filter(job =>
          job.toLowerCase().includes(focusedOption.value.toLowerCase())
        )
      : allJobs;

    const formattedChoices = filteredJobs.map(job => ({
      name: job,
      value: job,
    }));

    // ------------------- Respond with Filtered Job List -------------------
    await interaction.respond(formattedChoices.slice(0, 25));

  } catch (error) {
    console.error('[itemAutocomplete.js]: logs -> Error in handleItemJobVoucherAutocomplete:', error);
    await interaction.respond([]);
  }
}

// -------------------  Item Heal Autocomplete ----------------
async function handleItemHealAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;

    // ------------------- Autocomplete: Character Name -------------------
    if (focusedOption.name === 'charactername') {
      const characters = await fetchCharactersByUserId(userId);
      const choices = characters.map(character => ({
        name: character.name,
        value: character.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Autocomplete: Healing Item Name -------------------
    if (focusedOption.name === 'itemname') {
      const characterName = interaction.options.getString('charactername');
      if (!characterName) return await interaction.respond([]);

      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) return await interaction.respond([]);

      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventory = await inventoryCollection.find().toArray();

      // ------------------- Filter Relevant Healing Items -------------------
      const validItems = inventory.filter(item =>
        (item.category && item.category.includes('Recipe')) ||
        item.itemName.toLowerCase() === 'fairy' ||
        item.itemName.toLowerCase() === 'job voucher'
      );

      const choices = validItems.map(item => ({
        name: `${item.itemName} - QTY:${item.quantity}`,
        value: item.itemName,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

  } catch (error) {
    console.error('[itemAutocomplete.js]: logs -> Error in handleItemHealAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// LOOKUP
// ============================================================================
// Provides autocomplete suggestions when looking up item names from the database.

async function handleLookupAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Fetch All Item Names -------------------
    const items = await Item.find().select('itemName').exec();

    // ------------------- Map Items to Discord Autocomplete Format -------------------
    const choices = items.map(item => ({
      name: item.itemName,
      value: item.itemName,
    }));

    // ------------------- Sort Alphabetically -------------------
    choices.sort((a, b) => a.name.localeCompare(b.name));

    // ------------------- Respond with Filtered & Sorted List -------------------
    await respondWithFilteredChoices(interaction, focusedOption, choices);

  } catch (error) {
    console.error('[autocompleteHandler.js]: logs -> Error in handleLookupAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// MODGIVE
// ============================================================================
// Used by /modgive to search for characters across all players.
// Used by /modgive to search for any item by name.

// -------------------  ModGive: Character Autocomplete -------------------
async function handleModGiveCharacterAutocomplete(interaction, focusedOption) {
  try {
    const characters = await fetchAllCharacters();
    if (!characters || characters.length === 0) return await interaction.respond([]);

    const searchQuery = focusedOption.value.toLowerCase();

    const filteredCharacters = characters
      .filter(character => character.name.toLowerCase().includes(searchQuery))
      .map(character => ({
        name: character.name,
        value: character.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 25); // Discord limit

    await interaction.respond(filteredCharacters);

  } catch (error) {
    console.error('[modGiveAutocomplete.js]: logs -> Error in handleModGiveCharacterAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- ModGive: Item Autocomplete -------------------

async function handleModGiveItemAutocomplete(interaction, focusedOption) {
  try {
    const items = await fetchAllItems();
    if (!items || items.length === 0) return await interaction.respond([]);

    const searchQuery = focusedOption.value.toLowerCase();

    const filteredItems = items
      .filter(item => item.itemName.toLowerCase().includes(searchQuery))
      .map(item => ({
        name: item.itemName,
        value: item.itemName,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 25); // Discord limit

    await interaction.respond(filteredItems);

  } catch (error) {
    console.error('[modGiveAutocomplete.js]: logs -> Error in handleModGiveItemAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// MOUNT/STABLE
// ============================================================================
// Handles character name autocomplete for mount subcommands (store, retrieve, sell, view, encounter).
// Autocomplete for mount names owned by a specific character.

// ------------------- 🐎 Mount Autocomplete: Character Selection -------------------
async function handleMountAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    // ------------------- Fetch User's Characters -------------------
    const characters = await fetchCharactersByUserId(userId);
    if (!characters || characters.length === 0) return await interaction.respond([]);

    // ------------------- Filter Characters by Subcommand -------------------
    const choices = characters
      .filter(character => {
        switch (subcommand) {
          case 'store':
          case 'retrieve':
          case 'sell':
          case 'view':
          case 'encounter':
            return true; // Currently all include all user characters
          default:
            return false;
        }
      })
      .map(character => ({
        name: character.name,
        value: character.name,
      }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);

  } catch (error) {
    console.error('[mountAutocomplete.js]: logs -> Error in handleMountAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- 🐴 Mount Autocomplete: Mount Name Selection -------------------
async function handleMountNameAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');

    // ------------------- Validate Character Name -------------------
    if (!characterName) return await interaction.respond([]);

    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) return await interaction.respond([]);

    // ------------------- Fetch Mounts Owned by Character -------------------
    const mounts = await Mount.find({ owner: character.name }).lean();
    if (!mounts || mounts.length === 0) return await interaction.respond([]);

    // ------------------- Format Mount Autocomplete Choices -------------------
    const choices = mounts
      .map(mount => ({
        name: mount.name,
        value: mount.name,
      }))
      .slice(0, 25); // Discord limit

    await interaction.respond(choices);

  } catch (error) {
    console.error('[mountAutocomplete.js]: logs -> Error in handleMountNameAutocomplete:', error);
    await interaction.respond([]);
  }
}

// ============================================================================
// PET
// ============================================================================
// Handles autocomplete logic for pet-related fields:
// - petname: pets owned by character
// - species: species types from petEmojiMap
// - rolltype: valid roll types for selected pet

async function handlePetAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const commandName = interaction.commandName;

    // ------------------- Autocomplete: Pet Name -------------------
    if (focusedOption.name === 'petname') {
      const characterName = interaction.options.getString('charactername');
      if (!characterName) return await interaction.respond([]);

      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) return await interaction.respond([]);

      const activePets = await Pet.find({ owner: character._id, status: 'active' }).exec();
      if (!activePets || activePets.length === 0) return await interaction.respond([]);

      const choices = activePets.map(pet => ({
        name: pet.name,
        value: pet._id.toString(),
      }));

      const filtered = choices
        .filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .slice(0, 25);

      return await interaction.respond(filtered);
    }

    // ------------------- Autocomplete: Pet Species -------------------
    if (focusedOption.name === 'species') {
      const speciesList = Object.keys(petEmojiMap);
      const choices = speciesList.map(species => ({
        name: species,
        value: species,
      }));

      const filtered = choices
        .filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .slice(0, 25);

      return await interaction.respond(filtered);
    }

    // ------------------- Autocomplete: Roll Type -------------------
    if (focusedOption.name === 'rolltype') {
      const characterName = interaction.options.getString('charactername');
      const petId = interaction.options.getString('petname');
      if (!characterName || !petId) return await interaction.respond([]);

      const pet = await Pet.findById(petId).exec();
      if (!pet || !Array.isArray(pet.rollCombination)) return await interaction.respond([]);

      const choices = pet.rollCombination.map(roll => ({
        name: roll,
        value: roll,
      }));

      const filtered = choices
        .filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .slice(0, 25);

      return await interaction.respond(filtered);
    }

  } catch (error) {
    console.error('[petAutocomplete.js]: logs -> Error in handlePetAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// RELIC
// ============================================================================
// This module provides autocomplete handlers for relic commands.
// It supports:
//   • Autocompletion for the 'character' option (relic owner)
//   • Autocompletion for the 'appraiser' option (either "NPC" or characters
//     with the Artist or Researcher job who reside in Inariko)

// ------------------- Autocomplete for Relic Owner -------------------
// Returns only characters owned by the user.
async function handleRelicOwnerAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    // Fetch characters owned by the current user.
    const characters = await fetchCharactersByUserId(userId);
    // Map to choices with name and value.
    const choices = characters.map(c => ({
      name: `${c.name} - ${capitalize(c.currentVillage)}`,
      value: c.name,
    }));
    // Filter based on the input, if any.
    const filtered = focusedOption.value
      ? choices.filter(choice =>
          choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
        )
      : choices;
    // Discord allows a maximum of 25 autocomplete choices.
    await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[relicAutocomplete.js] Error in handleRelicOwnerAutocomplete:', error);
    await interaction.respond([]);
  }
}

// ------------------- Autocomplete for Relic Appraiser -------------------
// Returns "NPC" and characters whose job (or voucher job) is Artist or Researcher, provided they reside in Inariko.
async function handleRelicAppraiserAutocomplete(interaction, focusedOption) {
  try {
    // Start with NPC as a default option.
    let choices = [{ name: 'NPC', value: 'NPC' }];
    // Fetch all characters from the system.
    const allCharacters = await fetchAllCharacters();
    // Filter characters: must live in Inariko and have a job of 'artist' or 'researcher' (checking both job and jobVoucherJob).
    const validAppraisers = allCharacters.filter(c => {
      const job = (c.job || '').toLowerCase();
      const voucherJob = (c.jobVoucherJob || '').toLowerCase();
      const village = (c.currentVillage || '').toLowerCase();
      return village === 'inariko' &&
             (job === 'artist' || job === 'researcher' ||
              voucherJob === 'artist' || voucherJob === 'researcher');
    });
    // Map filtered appraisers to autocomplete choices.
    const appraiserChoices = validAppraisers.map(c => ({
      name: `${c.name} - Inariko`,
      value: c.name,
    }));
    choices = choices.concat(appraiserChoices);
    // Filter choices based on the focused input.
    const filtered = focusedOption.value
      ? choices.filter(choice =>
          choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
        )
      : choices;
    await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[relicAutocomplete.js] Error in handleRelicAppraiserAutocomplete:', error);
    await interaction.respond([]);
  }
}

// ============================================================================
// SHOPS
// ============================================================================
// Handles autocomplete suggestions for shop interactions (`buy` and `sell`).

async function handleShopsAutocomplete(interaction, focusedOption) {
  try {
    const characterName = interaction.options.getString('charactername');
    const subcommand = interaction.options.getSubcommand();
    const searchQuery = focusedOption.value.toLowerCase();
    let choices = [];

    // ------------------- Subcommand: Buy -------------------
    if (subcommand === 'buy') {
      const items = await ShopStock.find()
        .sort({ itemName: 1 })
        .select('itemName quantity')
        .lean();

      choices = items
        .filter(item => item.itemName.toLowerCase().includes(searchQuery))
        .map(item => ({
          name: `${item.itemName} - Qty: ${item.quantity}`,
          value: item.itemName,
        }));
    }

    // ------------------- Subcommand: Sell -------------------
    else if (subcommand === 'sell') {
      const inventoryCollection = await getCharacterInventoryCollection(characterName);
      const inventoryItems = await inventoryCollection.find().toArray();

      const itemNames = inventoryItems.map(item => item.itemName);
      const itemsFromDB = await ItemModel.find({ itemName: { $in: itemNames } })
        .select('itemName sellPrice')
        .lean();

      const itemsMap = new Map(itemsFromDB.map(item => [item.itemName, item.sellPrice]));

      choices = inventoryItems
        .filter(item => item.itemName.toLowerCase().includes(searchQuery))
        .sort((a, b) => a.itemName.localeCompare(b.itemName))
        .map(item => ({
          name: `${item.itemName} - Qty: ${item.quantity} - Sell: ${itemsMap.get(item.itemName) || 'N/A'}`,
          value: item.itemName,
        }));
    }

    // ------------------- Respond with Filtered Choices -------------------
    await interaction.respond(choices.slice(0, 25));

  } catch (error) {
    console.error('[shopAutocomplete.js]: logs -> Error in handleShopsAutocomplete:', error);
    if (!interaction.responded) {
      await interaction.respond([]);
    }
  }
}

// ============================================================================
// STEAL
// ============================================================================
// Handles autocomplete for:
// - charactername: user's Bandit characters
// - target: player or NPC options
// - rarity: fixed rarity values

async function handleStealAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const commandName = interaction.commandName;

    // ------------------- Autocomplete: Bandit Character Name -------------------
    if (focusedOption.name === 'charactername') {
      const characters = await fetchCharactersByUserId(userId);

      const banditCharacters = characters.filter(character =>
        character.job.toLowerCase() === 'bandit' &&
        character.name.toLowerCase().includes(focusedOption.value.toLowerCase())
      );

      const choices = banditCharacters.slice(0, 25).map(character => ({
        name: character.name,
        value: character.name,
      }));

      return await interaction.respond(choices);
    }

    // ------------------- Autocomplete: Target (Player or NPC) -------------------
    if (focusedOption.name === 'target') {
      const targetType = interaction.options.getString('targettype');

      if (targetType === 'player') {
        const thiefName = interaction.options.getString('charactername');
        if (!thiefName) return await interaction.respond([]);

        const thiefCharacter = await fetchCharacterByName(thiefName);
        if (!thiefCharacter) return await interaction.respond([]);

        const allCharacters = await fetchAllCharacters();
        const filteredCharacters = allCharacters.filter(character =>
          character.currentVillage.toLowerCase() === thiefCharacter.currentVillage.toLowerCase() &&
          character.name.toLowerCase() !== thiefCharacter.name.toLowerCase() &&
          character.name.toLowerCase().includes(focusedOption.value.toLowerCase())
        );

        const choices = filteredCharacters.slice(0, 25).map(character => ({
          name: `${character.name} - ${character.currentVillage}`,
          value: character.name,
        }));

        return await interaction.respond(choices);
      } else {
        const npcChoices = [
          'Hank', 'Sue', 'Lukan', 'Myti', 'Cree', 'Cece',
          'Walton', 'Jengo', 'Jasz', 'Lecia', 'Tye', 'Lil Tim',
        ];

        const filteredNPCs = npcChoices
          .filter(name => name.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .map(name => ({ name, value: name }));

        return await interaction.respond(filteredNPCs);
      }
    }

    // ------------------- Autocomplete: Rarity -------------------
    if (focusedOption.name === 'rarity') {
      const rarities = ['common', 'uncommon', 'rare'];
      const filtered = rarities
        .filter(r => r.startsWith(focusedOption.value.toLowerCase()))
        .map(r => ({ name: r, value: r }));

      return await interaction.respond(filtered);
    }

  } catch (error) {
    console.error('[stealAutocomplete.js]: logs -> Error in handleStealAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// TRADE
// ============================================================================
// Handles autocomplete for trading between characters and selecting items.
// Fields: fromcharacter, tocharacter, item1, item2, item3
async function handleTradeAutocomplete(interaction) {
  try {
    const userId = interaction.user.id;
    const focusedOption = interaction.options.getFocused(true);

    // ------------------- Autocomplete: User's Characters -------------------
    if (focusedOption.name === 'fromcharacter') {
      const characters = await fetchCharactersByUserId(userId);

      const choices = characters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`,
        value: character.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Autocomplete: Other Characters -------------------
    if (focusedOption.name === 'tocharacter') {
      const allCharacters = await fetchAllCharactersExceptUser(userId);

      const choices = allCharacters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`,
        value: character.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Autocomplete: Items to Trade -------------------
    if (['item1', 'item2', 'item3'].includes(focusedOption.name)) {
      const fromCharacterName = interaction.options.getString('fromcharacter');
      if (!fromCharacterName) return await interaction.respond([]);

      const character = await fetchCharacterByNameAndUserId(fromCharacterName, userId);
      if (!character) return await interaction.respond([]);

      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventory = await inventoryCollection.find().toArray();

      const choices = inventory.map(item => ({
        name: `${item.itemName} - QTY:${item.quantity}`,
        value: item.itemName,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

  } catch (error) {
    console.error('[tradeAutocomplete.js]: logs -> Error in handleTradeAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// TRANSFER
// ============================================================================
// Handles autocomplete for transferring items between user-owned characters.
// Fields: fromcharacter, tocharacter, itema, itemb, itemc

async function handleTransferAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Extract User Context -------------------
    const userId = interaction.user.id;

    // ------------------- Autocomplete: Character Names -------------------
    if (focusedOption.name === 'fromcharacter' || focusedOption.name === 'tocharacter') {
      const characters = await fetchCharactersByUserId(userId);

      const choices = characters.map(character => ({
        name: character.name,
        value: character.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Autocomplete: Items from "fromcharacter" -------------------
    if (['itema', 'itemb', 'itemc'].includes(focusedOption.name)) {
      const fromCharacterName = interaction.options.getString('fromcharacter');
      if (!fromCharacterName) return await interaction.respond([]);

      const fromCharacter = await fetchCharacterByNameAndUserId(fromCharacterName, userId);
      if (!fromCharacter) return await interaction.respond([]);

      const inventoryCollection = await getCharacterInventoryCollection(fromCharacter.name);
      const fromInventory = await inventoryCollection.find().toArray();

      const choices = fromInventory.map(item => ({
        name: `${item.itemName} - QTY:${item.quantity}`,
        value: item.itemName,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

  } catch (error) {
    // ------------------- Error Handling -------------------
    console.error('[transferAutocomplete.js]: logs -> Error in handleTransferAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// TRAVEL
// ============================================================================
// Handles autocomplete for character selection in the travel command.
async function handleTravelAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Extract User ID -------------------
    const userId = interaction.user.id;

    // ------------------- Fetch Characters Owned by User -------------------
    const characters = await fetchCharactersByUserId(userId);
    if (!characters || characters.length === 0) {
      return await interaction.respond([]);
    }

    // ------------------- Format Character Choices -------------------
    const choices = characters.map(character => ({
      name: `${character.name} - ${capitalize(character.currentVillage)}`,
      value: character.name,
    }));

    // ------------------- Respond with Filtered Results -------------------
    await respondWithFilteredChoices(interaction, focusedOption, choices);

  } catch (error) {
    // ------------------- Error Handling -------------------
    console.error('[travelAutocomplete.js]: logs -> Error in handleTravelAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// VENDING
// ============================================================================

async function handleVendingAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    // ------------------- Subcommand: barter -------------------
    if (subcommand === "barter") {
      if (focusedOption.name === "charactername") {
        const characters = await fetchCharactersByUserId(userId);
        if (!characters?.length) return await interaction.respond([]);

        const choices = characters.map((character) => ({
          name: `${character.name} (${character.currentVillage})`,
          value: character.name,
        }));

        return await respondWithFilteredChoices(interaction, focusedOption, choices);
      }

      if (focusedOption.name === "vendorcharacter") {
        try {
          const vendors = await Character.find({
            vendorType: { $regex: /^(merchant|shopkeeper)$/i },
          }).lean();

          if (!vendors?.length) return await interaction.respond([]);

          const choices = vendors.map((vendor) => ({
            name: `${vendor.name} (${vendor.currentVillage})`,
            value: vendor.name,
          }));

          return await respondWithFilteredChoices(interaction, focusedOption, choices);
        } catch (error) {
          console.error("[autocompleteHandler.js]: Error fetching vendor characters:", error);
          return await interaction.respond([]);
        }
      }

      if (focusedOption.name === "itemname") {
        const vendorCharacter = interaction.options.getString("vendorcharacter");
        if (!vendorCharacter) return await interaction.respond([]);

        try {
          const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI);
          await client.connect();

          const db = client.db("vending");
          const items = await db.collection(vendorCharacter.toLowerCase()).find({}).toArray();
          await client.close();

          if (!items?.length) return await interaction.respond([]);

          const search = focusedOption.value.toLowerCase();
          const filteredItems = items
            .filter((item) => item.itemName.toLowerCase().includes(search))
            .map((item) => ({
              name: `${item.itemName} - Qty: ${item.stockQty}`,
              value: item.itemName,
            }))
            .slice(0, 25);

          return await interaction.respond(filteredItems);
        } catch (error) {
          console.error("[autocompleteHandler.js]: Error fetching inventory for vendor:", error);
          return await interaction.respond([]);
        }
      }
    }

    // ------------------- Subcommand: pouch -------------------
    if (subcommand === "pouch" && focusedOption.name === "charactername") {
      const characters = await fetchCharactersByUserId(userId);
      const vendingCharacters = characters.filter((c) =>
        ["merchant", "shopkeeper"].includes(c.job?.toLowerCase())
      );

      if (!vendingCharacters?.length) return await interaction.respond([]);

      const choices = vendingCharacters.map((c) => ({
        name: `${c.name} (${c.currentVillage})`,
        value: c.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Subcommand: sync -------------------
    if (subcommand === "sync" && focusedOption.name === "charactername") {
      const characters = await fetchCharactersByUserId(userId);
      const eligible = characters.filter((c) =>
        ["shopkeeper", "merchant"].includes(c.job?.toLowerCase())
      );

      if (!eligible?.length) return await interaction.respond([]);

      const choices = eligible.map((c) => ({
        name: `${c.name} (${c.currentVillage})`,
        value: c.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Subcommand: viewshop -------------------
    if (subcommand === "viewshop" && focusedOption.name === "charactername") {
      const characters = await Character.find({ vendingSetup: true });
      if (!characters?.length) return await interaction.respond([]);

      const choices = characters.map((c) => ({
        name: `${c.name} (${c.currentVillage})`,
        value: c.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Subcommand: editshop -------------------
    if (subcommand === "editshop") {
      if (focusedOption.name === "charactername") {
        const characters = await fetchCharactersByUserId(userId);
        const eligible = characters.filter((c) =>
          ["shopkeeper", "merchant"].includes(c.job?.toLowerCase())
        );

        if (!eligible?.length) return await interaction.respond([]);

        const choices = eligible.map((c) => ({
          name: `${c.name} (${c.currentVillage})`,
          value: c.name,
        }));

        return await respondWithFilteredChoices(interaction, focusedOption, choices);
      }

      if (focusedOption.name === "itemname") {
        const characterName = interaction.options.getString("charactername");
        if (!characterName) return await interaction.respond([]);

        try {
          const character = await Character.findOne({ name: characterName });
          if (!character) return await interaction.respond([]);

          const client = await connectToVendingDatabase();
          const db = client.db("vending");
          const items = await db.collection(characterName.toLowerCase()).find({}).toArray();

          const search = focusedOption.value.toLowerCase();

          const results = [
            {
              name: "Shop Image (Set your shop image)",
              value: "Shop Image",
            },
            ...items
              .filter((i) => i.itemName.toLowerCase().includes(search))
              .map((i) => ({
                name: `${i.itemName} - Qty: ${i.stockQty}`,
                value: i.itemName,
              })),
          ];

          return await interaction.respond(results.slice(0, 25));
        } catch (error) {
          console.error("[autocompleteHandler.js]: Error fetching items for editshop:", error);
          return await interaction.respond([]);
        }
      }
    }

    // ------------------- Subcommand: restock -------------------
    if (subcommand === "restock") {
      if (focusedOption.name === "charactername") {
        const characters = await fetchCharactersByUserId(userId);
        const vendingCharacters = characters.filter((c) =>
          ["merchant", "shopkeeper"].includes(c.job?.toLowerCase())
        );

        if (!vendingCharacters?.length) return await interaction.respond([]);

        const choices = vendingCharacters.map((c) => ({
          name: `${c.name} (${c.currentVillage})`,
          value: c.name,
        }));

        return await respondWithFilteredChoices(interaction, focusedOption, choices);
      }

      if (focusedOption.name === "itemname") {
        return await handleVendingRestockAutocomplete(interaction, focusedOption);
      }
    }

    // ------------------- Subcommand: collect_points -------------------
    if (subcommand === "collect_points" && focusedOption.name === "charactername") {
      const characters = await fetchCharactersByUserId(userId);
      const eligible = characters.filter((c) =>
        ["shopkeeper", "merchant"].includes(c.job?.toLowerCase())
      );

      if (!eligible?.length) return await interaction.respond([]);

      const choices = eligible.map((c) => ({
        name: `${c.name} (${c.currentVillage})`,
        value: c.name,
      }));

      return await respondWithFilteredChoices(interaction, focusedOption, choices);
    }

    // ------------------- Fallback -------------------
    return await interaction.respond([]);
  } catch (error) {
    console.error("[autocompleteHandler.js]: Error in handleVendingAutocomplete:", error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Restock Autocomplete Handler -------------------
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
    console.error("[autocompleteHandler.js]: Error in handleVendingRestockAutocomplete:", error);
    await interaction.respond([]);
  }
}

// ------------------- Barter Autocomplete Handler -------------------
async function handleVendingBarterAutocomplete(interaction, focusedOption) {
  try {
    const characterName = interaction.options.getString("charactername");
    if (!characterName) return await interaction.respond([]);

    const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI);
    await client.connect();

    const db = client.db("vending");
    const inventoryCollection = db.collection(characterName.toLowerCase());
    const items = await inventoryCollection.find({}).toArray();
    await client.close();

    if (!items?.length) return await interaction.respond([]);

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
    console.error("[autocompleteHandler.js]: Error in handleVendingBarterAutocomplete:", error);
    await interaction.respond([]);
  }
}

// ------------------- Edit Shop Autocomplete Handler -------------------

async function handleVendingEditShopAutocomplete(interaction, focusedOption) {
  try {
    const characterName = interaction.options.getString("charactername");
    if (!characterName) return await interaction.respond([]);

    const userId = interaction.user.id;
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) return await interaction.respond([]);

    const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI);
    await client.connect();

    const db = client.db("vending");
    const inventoryCollection = db.collection(characterName.toLowerCase());
    const shopItems = await inventoryCollection.find({}).toArray();
    await client.close();

    if (!shopItems?.length) return await interaction.respond([]);

    const searchQuery = focusedOption.value.toLowerCase();
    const filteredItems = shopItems
      .filter((item) => item.itemName.toLowerCase().includes(searchQuery))
      .map((item) => ({
        name: `${item.itemName}`,
        value: item.itemName,
      }))
      .slice(0, 25);

    await interaction.respond(filteredItems);
  } catch (error) {
    console.error("[autocompleteHandler.js]: Error in handleVendingEditShopAutocomplete:", error);
    await interaction.respond([]);
  }
}

// ------------------- View Vending Shop Autocomplete Handler -------------------

async function handleViewVendingShopAutocomplete(interaction) {
  const focusedOption = interaction.options.getFocused(true);
  if (focusedOption.name !== "charactername") return;

  try {
    const characters = await Character.find({
      job: { $regex: /^(merchant|shopkeeper)$/i },
    });

    const choices = characters.map((character) => ({
      name: character.name,
      value: character.name,
    }));

    await interaction.respond(choices.slice(0, 25));
  } catch (error) {
    console.error("[autocompleteHandler.js]: Error in handleViewVendingShopAutocomplete:", error);
    await interaction.respond([]);
  }
}

// ============================================================================
// VILLAGE
// ============================================================================
// These functions handle autocomplete for village-related interactions such as
// selecting villages, materials for upgrades, and eligible characters.

// ------------------- Handles autocomplete for village-based commands -------------------
async function handleVillageBasedCommandsAutocomplete(interaction, focusedOption) {
  try {
    const choices = getAllVillages().map(village => ({
      name: village,
      value: village,
    }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[handleVillageBasedCommandsAutocomplete]: Error handling village autocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for materials needed to upgrade a village -------------------
async function handleVillageMaterialsAutocomplete(interaction) {
  const focusedValue = interaction.options.getFocused(); // User input
  const villageName = interaction.options.getString('name');
  const characterName = interaction.options.getString('charactername');
  const userId = interaction.user.id;

  console.log(`[villageAutocomplete]: User: ${userId}, Village: ${villageName}, Character: ${characterName}, Input: "${focusedValue}"`);

  try {
    const village = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });
    if (!village) {
      console.warn(`[villageAutocomplete]: Village "${villageName}" not found.`);
      return interaction.respond([]);
    }

    const nextLevel = village.level + 1;
    const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;
    const requiredMaterials = Object.keys(materials).filter(
      mat => materials[mat].required?.[nextLevel] !== undefined
    );

    if (!requiredMaterials.length) {
      console.warn(`[villageAutocomplete]: No required materials for level ${nextLevel}.`);
      return interaction.respond([]);
    }

    if (!characterName) {
      console.warn('[villageAutocomplete]: No character name provided.');
      return interaction.respond([]);
    }

    const character = await Character.findOne({
      userId,
      name: { $regex: `^${characterName}$`, $options: 'i' }
    }).lean();

    if (!character) {
      console.warn(`[villageAutocomplete]: Character "${characterName}" not found for user ${userId}.`);
      return interaction.respond([]);
    }

    const inventoryDb = (await connectToInventories()).useDb('inventories');
    const inventoryCollection = inventoryDb.collection(character.name.toLowerCase());
    const inventoryItems = await inventoryCollection.find({}).toArray();

    const materialsMap = {};

    inventoryItems.forEach(item => {
      const matchedMaterial = requiredMaterials.find(
        material => material.toLowerCase() === item.itemName.toLowerCase()
      );
      if (matchedMaterial) {
        materialsMap[matchedMaterial] = (materialsMap[matchedMaterial] || 0) + item.quantity;
      }
    });

    const filteredChoices = Object.entries(materialsMap)
      .filter(([name]) => name.toLowerCase().includes(focusedValue.toLowerCase()))
      .map(([name, qty]) => ({
        name: `${name} (qty ${qty})`,
        value: name,
      }));

    console.log(`[villageAutocomplete]: Responding with ${filteredChoices.length} options.`);
    await interaction.respond(filteredChoices.slice(0, 25));
  } catch (error) {
    console.error('[handleVillageMaterialsAutocomplete]: Error:', error);
    await interaction.respond([]);
  }
}

// ------------------- Handles autocomplete for selecting upgrade-eligible characters -------------------
async function handleVillageUpgradeCharacterAutocomplete(interaction) {
  const userId = interaction.user.id;
  const villageName = interaction.options.getString('name');

  try {
    if (!villageName) {
      console.warn('[handleVillageUpgradeCharacterAutocomplete]: No village name provided.');
      return interaction.respond([]);
    }

    const characters = await fetchCharactersByUserId(userId);
    const focusedValue = interaction.options.getFocused().toLowerCase();

    const eligibleCharacters = characters
      .filter(character =>
        character.homeVillage?.toLowerCase() === villageName.toLowerCase() &&
        character.name.toLowerCase().includes(focusedValue)
      )
      .map(character => ({
        name: character.name,
        value: character.name,
      }));

    await interaction.respond(eligibleCharacters.slice(0, 25));
  } catch (error) {
    console.error('[handleVillageUpgradeCharacterAutocomplete]: Error:', error);
    await interaction.respond([]);
  }
}

// ============================================================================
// VIEWINVENTORY
// ============================================================================

// ------------------- Handles autocomplete for viewing character inventory -------------------
async function handleViewInventoryAutocomplete(interaction, focusedOption) {
  try {
    // ------------------- Fetch all characters from the database -------------------
    const characters = await fetchAllCharacters();

    // ------------------- Map character names and IDs into choices -------------------
    const choices = characters.map(character => ({
      name: character.name,                  // Display character name in the dropdown
      value: character._id.toString(),       // Use the character's unique ID as the value
    }));

    // ------------------- Respond with filtered results based on user input -------------------
    await respondWithFilteredChoices(interaction, focusedOption, choices);

  } catch (error) {
    // ------------------- Handle errors gracefully and log them -------------------
    console.error('[autocompleteHandler.js]: Error in handleViewInventoryAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// CHARACTER-BASED
// ============================================================================
async function handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName) {
  try {
    // ------------------- Get the Discord user ID initiating the interaction -------------------
    const userId = interaction.user.id;

    // ------------------- Fetch all characters belonging to the user -------------------
    let characters = await fetchCharactersByUserId(userId);

    // ------------------- Apply command-specific character filtering -------------------
    if (commandName === 'crafting') {
      // Filter for characters with the CRAFTING perk (includes job voucher check)
      characters = characters.filter(character => {
        const job = character.jobVoucher ? character.jobVoucherJob : character.job;
        const jobPerk = getJobPerk(job);
        return jobPerk && jobPerk.perks.includes('CRAFTING');
      });

      console.log('[autocompleteHandler.js]: Eligible characters for crafting:', characters.map(c => c.name));

    } else if (commandName === 'gather') {
      // Filter for characters with the GATHERING perk
      characters = characters.filter(character => {
        const job = character.jobVoucher ? character.jobVoucherJob : character.job;
        const jobPerk = getJobPerk(job);
        return jobPerk && jobPerk.perks.includes('GATHERING');
      });

      console.log('[autocompleteHandler.js]: Eligible characters for gathering:', characters.map(c => c.name));

    } else if (commandName === 'loot') {
      // Filter for characters with the LOOTING perk
      characters = characters.filter(character => {
        const job = character.jobVoucher ? character.jobVoucherJob : character.job;
        const jobPerk = getJobPerk(job);
        return jobPerk && jobPerk.perks.includes('LOOTING');
      });

    } else if (commandName === 'syncinventory') {
      // Filter for characters whose inventory is not yet synced
      characters = characters.filter(character => !character.inventorySynced);

      console.log('[autocompleteHandler.js]: Characters needing inventory sync:', characters.map(c => c.name));
    }

    // ------------------- No filter is applied for the mount command -------------------
    if (commandName === 'mount') {
      console.log('[autocompleteHandler.js]: Mount command does not require filtering.');
    }

    // ------------------- Format character names for Discord's autocomplete menu -------------------
    const choices = characters.map(character => ({
      name: character.name,              // Display name in the suggestion list
      value: character.name              // Use name as the selected value
    }));

    // ------------------- Send the filtered choices as autocomplete response -------------------
    await respondWithFilteredChoices(interaction, focusedOption, choices);

  } catch (error) {
    // ------------------- Gracefully handle any errors and notify the user -------------------
    console.error(`[autocompleteHandler.js]: Error in handleCharacterBasedCommandsAutocomplete for "${commandName}":`, error);
    await safeRespondWithError(interaction);
  }
}

// ============================================================================
// ------------------- 🔁 Shared Character Autocomplete Helper -------------------
// Generic utility to handle character autocomplete using provided fetch, filter, and format functions.
// ============================================================================

async function handleCharacterAutocomplete(interaction, focusedOption, fetchFn, filterFn, formatFn) {
  try {
    const characters = await fetchFn();
    const filteredCharacters = characters.filter(filterFn);
    const choices = filteredCharacters.map(formatFn);

    await respondWithFilteredChoices(interaction, focusedOption, choices);

  } catch (error) {
    console.error('[autocompleteHelpers.js]: logs -> Error in handleCharacterAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Export Functions -------------------
module.exports = {
  handleAutocomplete,

 // BLIGHT
  handleBlightCharacterAutocomplete,
  handleBlightItemAutocomplete,

// CHANGEJOB
  handleChangeJobNewJobAutocomplete,

// COMBAT
  handleCombatAutocomplete,

// CRAFTING
  handleCraftingAutocomplete,

// CREATECHARACTER
  handleCreateCharacterRaceAutocomplete,
  handleCreateCharacterVillageAutocomplete,

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
  handleItemHealAutocomplete,
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
  handlePetAutocomplete,

// RELIC
  handleRelicOwnerAutocomplete,
  handleRelicAppraiserAutocomplete,

// SHOPS
  handleShopsAutocomplete,

// STEAL
  handleStealAutocomplete,

// TRADE
  handleTradeAutocomplete,

// TRANSFER
  handleTransferAutocomplete,

// TRAVEL
  handleTravelAutocomplete,

// VENDING
  handleVendingAutocomplete,
  handleViewVendingShopAutocomplete,
  handleVendingEditShopAutocomplete,
  handleVendingRestockAutocomplete,
  handleVendingBarterAutocomplete,

// VILLAGE
  handleVillageBasedCommandsAutocomplete,
  handleVillageMaterialsAutocomplete,
  handleVillageUpgradeCharacterAutocomplete,


// VIEWINVENTORY
  handleViewInventoryAutocomplete,

// CHARACTER-BASED
  handleCharacterBasedCommandsAutocomplete,
















 

 




};

