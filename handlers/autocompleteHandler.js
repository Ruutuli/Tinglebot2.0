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
 getVendingModel
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
const ShopStock = require("../models/VillageShopsModel");
const { Village } = require("../models/VillageModel");

// Add import at the top
const { NPCs } = require('../modules/stealingNPCSModule');

// Add safe response utility
async function safeAutocompleteResponse(interaction, choices) {
  try {
    if (interaction.responded) {
      console.log('[autocompleteHandler.js]: 🔄 Interaction already responded to');
      return;
    }

    // Set a shorter timeout for autocomplete responses
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Response timeout')), 2000)
    );

    await Promise.race([
      interaction.respond(choices),
      timeoutPromise
    ]);
  } catch (error) {
    handleError(error, 'autocompleteHandler.js', {
      operation: 'safeAutocompleteResponse',
      interactionId: interaction.id,
      choices: choices?.length || 0
    });

    if (error.code === 10062) {
      console.log('[autocompleteHandler.js]: ⚠️ Interaction already expired');
      return;
    }

    console.error('[autocompleteHandler.js]: ❌ Error:', error);
    try {
      if (!interaction.responded) {
        await interaction.respond([]).catch(() => {});
      }
    } catch (e) {
      // Ignore any errors from the fallback response
    }
  }
}

// ============================================================================
// MAIN FUNCTION TO HANDLE AUTOCOMPLETE INTERACTIONS
// ============================================================================

async function safeRespondWithError(interaction, error) {
  try {
    if (error.code === 10062) {
      console.warn("[autocompleteHandler.js]: ⚠️ Interaction expired or already responded to");
      return;
    }

    handleError(error, 'autocompleteHandler.js', {
      operation: 'safeRespondWithError',
      interactionId: interaction.id,
      errorCode: error.code,
      errorMessage: error.message
    });

    console.error("[autocompleteHandler.js]: ❌ Error handling autocomplete:", error);
    if (!interaction.responded) {
      await interaction.respond([]).catch(() => {});
    }
  } catch (replyError) {
    handleError(replyError, 'autocompleteHandler.js', {
      operation: 'safeRespondWithError',
      interactionId: interaction.id,
      originalError: error.message,
      errorCode: replyError.code
    });
    console.error("[autocompleteHandler.js]: ❌ Error sending error response:", replyError);
  }
}

// ============================================================================
// ------------------- MAIN AUTOCOMPLETE HANDLER -------------------
// Central handler for all autocomplete interactions, routing requests to specific
// command handlers based on command name and focused option.
// ============================================================================

// ------------------- Function: handleAutocomplete -------------------
// Routes autocomplete requests to appropriate handlers based on command and focused option
async function handleAutocomplete(interaction) {
    try {
        const commandName = interaction.commandName;
        const focusedOption = interaction.options.getFocused(true);

        // Add a check for interaction validity
        if (!interaction.isAutocomplete()) {
          console.warn('[autocompleteHandler.js]: ⚠️ Received non-autocomplete interaction');
          return;
        }

        console.log('[handleAutocomplete]: 🔄 Processing command', {
          commandName,
          focusedOption: focusedOption.name,
          hasSubcommand: interaction.options._subcommand !== undefined
        });

        switch (commandName) {
          // ... existing code ...

          // ------------------- Custom Weapon Command -------------------
          case "customweapon":
            if (interaction.options._subcommand) {
              const customWeaponSubcommand = interaction.options.getSubcommand();
              if (customWeaponSubcommand === "create") {
                if (focusedOption.name === "charactername") {
                  await handleCustomWeaponCharacterAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "weaponid") {
                  await handleCustomWeaponIdAutocomplete(interaction, focusedOption);
                }
              } else if (customWeaponSubcommand === "submit") {
                if (focusedOption.name === "charactername") {
                  await handleCustomWeaponCharacterAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "baseweapon") {
                  await handleBaseWeaponAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "subtype") {
                  await handleSubtypeAutocomplete(interaction, focusedOption);
                }
              }
            }
            break;

          // ------------------- Heal Command -------------------
          case "heal":
            await handleHealAutocomplete(interaction, focusedOption);
            break;

          // ------------------- Mod Command -------------------
          case "mod":
            if (interaction.options._subcommand) {
              const modSubcommand = interaction.options.getSubcommand();
              if (modSubcommand === "give") {
                if (focusedOption.name === "character") {
                  await handleModGiveCharacterAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "item") {
                  await handleModGiveItemAutocomplete(interaction, focusedOption);
                }
              }
            }
            break;

          // ------------------- Blight Command -------------------
          case "blight":
            if (interaction.options._subcommand) {
              const blightSubcommand = interaction.options.getSubcommand();
              console.log('[handleAutocomplete]: 📝 Processing blight command', {
                subcommand: blightSubcommand,
                focusedOption: focusedOption.name
              });
              
              if (blightSubcommand === "heal") {
                if (focusedOption.name === "character_name" || focusedOption.name === "healer_name") {
                  await handleBlightCharacterAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "item") {
                  await handleBlightItemAutocomplete(interaction, focusedOption);
                }
              } else if (blightSubcommand === "submit") {
                console.log('[handleAutocomplete]: 📝 Processing blight submit', {
                  focusedOption: focusedOption.name
                });
                if (focusedOption.name === "item") {
                  await handleBlightItemAutocomplete(interaction, focusedOption);
                }
              } else if (blightSubcommand === "roll") {
                if (focusedOption.name === "character_name") {
                  await handleBlightCharacterAutocomplete(interaction, focusedOption);
                }
              }
            }
            break;

          // ------------------- Crafting Command -------------------
          case "crafting":
            if (focusedOption.name === "charactername") {
              await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "crafting");
            } else if (focusedOption.name === "itemname") {
              await handleCraftingAutocomplete(interaction, focusedOption);
            }
            break;

          // ------------------- Character Command -------------------
          case "character":
            if (interaction.options._subcommandGroup) {
              const subcommandGroup = interaction.options.getSubcommandGroup(false);
              const subcommand = interaction.options.getSubcommand();
              
              if (subcommandGroup === "create") {
                if (focusedOption.name === "race") {
                  await handleCreateCharacterRaceAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "village") {
                  await handleCreateCharacterVillageAutocomplete(interaction, focusedOption);
                }
              }
            }
            break;

          // ------------------- Economy Command -------------------
          case "economy":
            await handleEconomyAutocomplete(interaction, focusedOption);
            break;

          // ------------------- Item Command -------------------
          case "item":
            if (focusedOption.name === "charactername") {
              await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "item");
            } else if (focusedOption.name === "itemname") {
              await handleItemAutocomplete(interaction, focusedOption);
            } else if (focusedOption.name === "jobname") {
              await handleItemJobNameAutocomplete(interaction, focusedOption);
            }
            break;

          // ------------------- Travel Command -------------------
          case "travel":
            await handleTravelAutocomplete(interaction);
            break;

          // ------------------- Gather Command -------------------
          case "gather":
            if (focusedOption.name === "charactername") {
              await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "gather");
            }
            break;

          // ------------------- Loot Command -------------------
          case "loot":
            if (focusedOption.name === "charactername") {
              await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "loot");
            }
            break;

          // ------------------- Mount Command -------------------
          case "mount":
            if (focusedOption.name === "charactername") {
              await handleMountAutocomplete(interaction, focusedOption);
            }
            break;

          // ------------------- Special Weather Command -------------------
          case "specialweather":
            if (focusedOption.name === "charactername") {
              await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "specialweather");
            }
            break;

          // ------------------- Pet Command -------------------
          case "pet":
            if (focusedOption.name === "charactername") {
              await handlePetCharacterAutocomplete(interaction, focusedOption);
            } else if (focusedOption.name === "petname") {
              await handlePetNameAutocomplete(interaction, focusedOption);
            } else if (focusedOption.name === "species") {
              await handlePetSpeciesAutocomplete(interaction, focusedOption);
            } else if (focusedOption.name === "rolltype") {
              await handlePetRollTypeAutocomplete(interaction, focusedOption);
            }
            break;

          // ------------------- Vending Command -------------------
          case "vending":
            if (interaction.options._subcommand) {
              const vendingSubcommand = interaction.options.getSubcommand();
              if (vendingSubcommand === "add") {
                await handleVendingAddAutocomplete(interaction, focusedOption);
              } else if (vendingSubcommand === "barter") {
                await handleVendingBarterAutocomplete(interaction, focusedOption);
              } else if (vendingSubcommand === "view") {
                await handleVendingViewAutocomplete(interaction, focusedOption);
              }
            }
            break;

          // ------------------- Stable Command -------------------
          case "stable":
            if (focusedOption.name === "charactername") {
              await handleStableCharacterAutocomplete(interaction, focusedOption);
            } else if (focusedOption.name === "mountname") {
              await handleMountNameAutocomplete(interaction, focusedOption);
            }
            break;

          // ------------------- Inventory Command -------------------
          case "inventory":
            if (focusedOption.name === "charactername") {
              await handleViewInventoryAutocomplete(interaction, focusedOption);
            }
            break;

          // ------------------- Lookup Command -------------------
          case "lookup":
            await handleLookupAutocomplete(interaction, focusedOption);
            break;

          // Steal command routing
          case 'steal':
            const stealSubcommand = interaction.options.getSubcommand(false);

            if (stealSubcommand === 'commit') {
                if (focusedOption.name === 'charactername') {
                    return await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName);
                }
                if (focusedOption.name === 'target') {
                    return await handleStealTargetAutocomplete(interaction, focusedOption);
                }
                if (focusedOption.name === 'rarity') {
                    return await handleStealRarityAutocomplete(interaction, focusedOption);
                }
            } else if (focusedOption.name === 'charactername') {
                return await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName);
            }
            break;

          // ... rest of existing code ...
        }
    } catch (error) {
        console.error('[autocompleteHandler.js]: ❌ Error in handleAutocomplete:', error);
        await safeRespondWithError(interaction);
    }
}

// ============================================================================
// HELPER & UTILITY FUNCTIONS
// ============================================================================

// ------------------- Helper Function to Filter and Respond with Choices -------------------
async function respondWithFilteredChoices(interaction, focusedOption, choices) {
  try {
    const focusedValue = focusedOption?.value?.toLowerCase() || '';

    const filteredChoices = choices
      .filter(choice => choice.name.toLowerCase().includes(focusedValue))
      .slice(0, 25);

    return await safeAutocompleteResponse(interaction, filteredChoices);
  } catch (error) {
    handleError(error, 'autocompleteHandler.js', {
      operation: 'respondWithFilteredChoices',
      interactionId: interaction.id,
      focusedOption: focusedOption?.name,
      choicesCount: choices?.length || 0
    });
    return await safeRespondWithError(interaction, error);
  }
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

  // Fetch all characters owned by the user
  const characters = await fetchCharactersByUserId(userId);

  // Map all characters to choices with their basic info
  const choices = characters.map((character) => ({
   name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
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
  const userId = interaction.user.id;
  const subcommand = interaction.options.getSubcommand();
  const focusedName = focusedOption.name;

  if (subcommand === 'heal') {
    if (focusedName === 'character_name') {
      // For character_name, show blighted characters
      const blightedCharacters = await fetchBlightedCharactersByUserId(userId);
      const choices = blightedCharacters.map((character) => ({
        name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
        value: character.name,
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (focusedName === 'healer_name') {
      // For healer_name, show all characters with Healer job
      const allCharacters = await fetchAllCharacters();
      const healerCharacters = allCharacters.filter(
        (character) =>
          character.job.toLowerCase() === "healer" ||
          (character.jobVoucher === true &&
            character.jobVoucherJob.toLowerCase() === "healer")
      );

      const choices = healerCharacters.map((character) => ({
        name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
        value: character.name,
      }));

      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } else if (subcommand === 'submit') {
    // For submit command, show characters with pending blight submissions
    const blightedCharacters = await fetchBlightedCharactersByUserId(userId);
    const choices = blightedCharacters.map((character) => ({
      name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
      value: character.name,
    }));
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } else {
    // For other blight commands, show blighted characters
    const blightedCharacters = await fetchBlightedCharactersByUserId(userId);
    const choices = blightedCharacters.map((character) => ({
      name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
      value: character.name,
    }));
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  }
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  console.error("[handleBlightCharacterAutocomplete]: Error occurred:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Blight Item Autocomplete -------------------
// Provides item suggestions for the "blight" command by gathering item
// requirements from mod characters and filtering them based on user input.
async function handleBlightItemAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'submit') {
      // Get all mod characters
      const allModCharacters = modCharacters;

      // Collect all possible healing items from all mod characters
      const allHealingItems = new Set();
      allModCharacters.forEach(character => {
        const requirements = character.getHealingRequirements();
        requirements.forEach(req => {
          if (req.type === 'item' && req.items) {
            req.items.forEach(item => {
              allHealingItems.add(`${item.name} x${item.quantity}`);
            });
          }
        });
      });

      // Convert to array and filter based on user input
      const input = focusedOption.value?.toLowerCase() || '';
      const choices = Array.from(allHealingItems)
        .filter(choice => choice.toLowerCase().includes(input))
        .map(choice => ({
          name: choice,
          value: choice
        }))
        .slice(0, 25);

      return await interaction.respond(choices);
    } else {
      // Handle other blight commands that need item autocomplete
      const characterName = interaction.options.getString("character_name");
      const healerName = interaction.options.getString("healer_name");

      if (!characterName || !healerName) {
        return await interaction.respond([]);
      }

      // Get the healer character
      const healer = await fetchCharacterByName(healerName);
      if (!healer) {
        return await interaction.respond([]);
      }

      // Get the healer's inventory
      const inventoryCollection = await getCharacterInventoryCollection(healer.name);
      const inventoryItems = await inventoryCollection.find().toArray();

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

      // Create a map of required items
      const requiredItems = new Map(
        allItems.map(item => [item.name.toLowerCase(), item])
      );

      // Filter inventory items that match required items
      const choices = inventoryItems
        .filter(item => {
          const itemName = item.itemName.toLowerCase();
          return requiredItems.has(itemName) && 
                 item.itemName.toLowerCase().includes(focusedOption.value.toLowerCase());
        })
        .map(item => {
          const requiredItem = requiredItems.get(item.itemName.toLowerCase());
          return {
            name: `${item.itemName} - Qty: ${item.quantity} (Required: ${requiredItem.quantity})`,
            value: item.itemName
          };
        });

      await interaction.respond(choices.slice(0, 25));
    }
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleBlightItemAutocomplete]: ❌ Error occurred:", error);
    await safeRespondWithError(interaction);
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
// It includes suggestions for selecting a new job based on the character's context,
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
async function handleChangeJobCharacterAutocomplete(
 interaction,
 focusedOption
) {
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

// Add cache for job perks and craftable items with longer TTL
const jobPerksCache = new Map();
const craftableItemsCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ------------------- Crafting Autocomplete -------------------
// Provides autocomplete suggestions for craftable items based on the character's
// job and inventory.
async function handleCraftingAutocomplete(interaction, focusedOption) {
  try {
    // Extract user ID and character name from the interaction
    const userId = interaction.user.id;
    const characterName = interaction.options.getString("charactername");
    const searchQuery = focusedOption.value?.toLowerCase() || "";

    // Check cache first for this character's craftable items
    const cacheKey = `${characterName}_${userId}`;
    let craftableItems = craftableItemsCache.get(cacheKey);
    
    if (!craftableItems) {
      // Fetch character and check job perks in parallel
      const [character, allCraftableItems] = await Promise.all([
        fetchCharacterByNameAndUserId(characterName, userId),
        Item.find({
          craftingTags: { $exists: true }
        })
        .select('itemName craftingTags')
        .lean()
      ]);

      if (!character) {
        return await safeAutocompleteResponse(interaction, []);
      }

      // Determine the character's job
      const job = character.jobVoucher ? character.jobVoucherJob : character.job;

      // Check job perks cache
      let jobPerk = jobPerksCache.get(job);
      if (!jobPerk) {
        jobPerk = getJobPerk(job);
        if (jobPerk) {
          jobPerksCache.set(job, jobPerk);
          setTimeout(() => jobPerksCache.delete(job), CACHE_TTL);
        }
      }

      if (!jobPerk || !jobPerk.perks.includes("CRAFTING")) {
        return await safeAutocompleteResponse(interaction, []);
      }

      // Filter items by job and cache them
      craftableItems = allCraftableItems.filter(item => 
        item.craftingTags.some(tag => tag.toLowerCase() === job.toLowerCase())
      );
      
      craftableItemsCache.set(cacheKey, craftableItems);
      setTimeout(() => craftableItemsCache.delete(cacheKey), CACHE_TTL);
    }

    // Filter items by search query and limit to 25
    const filteredItems = craftableItems
      .filter(item => item.itemName.toLowerCase().includes(searchQuery))
      .slice(0, 25)
      .map(item => ({
        name: item.itemName,
        value: item.itemName
      }));

    await safeAutocompleteResponse(interaction, filteredItems);
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    await safeAutocompleteResponse(interaction, []);
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

// ------------------- Custom Weapon Character Autocomplete -------------------
// Provides autocomplete suggestions for selecting a character when creating a custom weapon.
async function handleCustomWeaponCharacterAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    
    // Ensure focusedValue is a string and has a default value
    const focusedValue = focusedOption?.value?.toString() || '';
    
    const choices = characters
      .filter(char => char.name.toLowerCase().includes(focusedValue.toLowerCase()))
      .map(char => ({
        name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
        value: char.name
      }));
    return await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[handleCustomWeaponCharacterAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Custom Weapon ID Autocomplete -------------------
// Provides autocomplete suggestions for selecting an approved weapon ID.
async function handleCustomWeaponIdAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');
    if (!characterName) return await interaction.respond([]);

    // Get all submissions from storage
    const allSubmissions = getAllSubmissions();
    
    // Filter for approved weapons that haven't been crafted yet
    const approvedWeapons = allSubmissions.filter(sub => 
      sub.status === 'approved' && 
      !sub.crafted &&
      sub.characterName === characterName
    );

    const choices = approvedWeapons.map(weapon => ({
      name: `${weapon.weaponName} (ID: ${weapon.itemId})`,
      value: weapon.itemId
    }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[handleCustomWeaponIdAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Base Weapon Autocomplete -------------------
// Provides autocomplete suggestions for selecting a base weapon when creating a custom weapon.
async function handleBaseWeaponAutocomplete(interaction, focusedOption) {
 try {
  // Fetch all weapons from the database
  const weapons = await Item.find({
    categoryGear: 'Weapon',
    itemName: { $regex: focusedOption.value, $options: 'i' }
  })
  .sort({ itemName: 1 })
  .limit(25)
  .lean();

  // Map weapons to autocomplete choices
  const choices = weapons.map(weapon => ({
    name: `${weapon.itemName} (${weapon.type?.join('/') || 'Unknown'})`,
    value: weapon.itemName
  }));

  // Respond with the filtered weapon choices
  await interaction.respond(choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  console.error("[handleBaseWeaponAutocomplete]: Error occurred:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Subtype Autocomplete -------------------
// Provides autocomplete suggestions for selecting a weapon subtype when creating a custom weapon.
async function handleSubtypeAutocomplete(interaction, focusedOption) {
 try {
  // Fetch all weapons from the database
  const weapons = await Item.find({
    categoryGear: 'Weapon'
  })
  .select('subtype')
  .lean();

  // Extract and deduplicate subtypes
  const uniqueSubtypes = [...new Set(
    weapons
      .flatMap(weapon => weapon.subtype || [])
      .filter(subtype => 
        subtype && 
        subtype.toLowerCase().includes(focusedOption.value.toLowerCase())
      )
  )]
  .sort()
  .slice(0, 25); // Discord has a limit of 25 choices

  // Map subtypes to autocomplete choices
  const choices = uniqueSubtypes.map(subtype => ({
    name: subtype,
    value: subtype
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
    const characterName = interaction.options.getString("charactername");
    if (!characterName) return await interaction.respond([]);

    const userId = interaction.user.id;
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) return await interaction.respond([]);

    const village = character.currentVillage?.toLowerCase()?.trim();
    const vendorType = character.job?.toLowerCase();
    const searchQuery = focusedOption.value?.toLowerCase() || "";

    // Get current vending stock
    const stockList = await getCurrentVendingStockList();
    let vendorItems = [];
    let limitedItems = [];

    // Only show regular items for this vendor's type and village
    if (stockList?.stockList?.[village]) {
      vendorItems = stockList.stockList[village].filter(
        (item) =>
          item.vendingType?.toLowerCase() === vendorType &&
          item.itemName?.toLowerCase().includes(searchQuery)
      );
    }

    // Only show limited items if in stock
    if (stockList?.limitedItems && interaction.commandName === "vending" && interaction.options.getSubcommand() === "add") {
      limitedItems = stockList.limitedItems
        .filter(item =>
          item.itemName?.toLowerCase().includes(searchQuery) &&
          item.stock > 0
        )
        .map(item => ({
          ...item,
          isLimited: true,
          vendingType: vendorType
        }));
    }

    // Combine and format all items
    const allItems = [...vendorItems, ...limitedItems];
    const choices = allItems.map(item => ({
      name: `${item.itemName} - ${item.points} pts${item.isLimited ? ` (Limited - Qty: ${item.stock})` : ''}`,
      value: item.itemName
    }));

    await interaction.respond(choices.slice(0, 25));
  } catch (error) {
    console.error("[handleVendorItemAutocomplete]: Error:", error);
    await interaction.respond([]);
  }
}

// ============================================================================
// ECONOMY COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "economy" command.
// It provides suggestions for the subcommands "trade", "gift", "shop-buy", "shop-sell", and "transfer".

// ============================================================================
// ------------------- ECONOMY COMMANDS -------------------
// Handles autocomplete interactions for economy-related commands including:
// - Trade: Character selection and item trading
// - Gift: Character and item gifting
// - Shop: Buying and selling items
// - Transfer: Moving items between characters
// ============================================================================

// ------------------- Function: handleEconomyAutocomplete -------------------
// Main handler for economy command autocomplete, routes to specific subcommand handlers
async function handleEconomyAutocomplete(interaction, focusedOption) {
  try {
    const subcommand = interaction.options.getSubcommand();
    const focusedValue = focusedOption?.value?.toLowerCase() || '';

    switch (subcommand) {
      case 'trade':
        return await handleTradeAutocomplete(interaction, focusedOption, focusedValue);
      case 'gift':
        return await handleGiftAutocomplete(interaction, focusedOption, focusedValue);
      case 'shop-buy':
      case 'shop-sell':
        return await handleShopAutocomplete(interaction, focusedOption, focusedValue);
      case 'transfer':
        return await handleTransferAutocomplete(interaction, focusedOption, focusedValue);
    }
  } catch (error) {
    console.error('[handleEconomyAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleTradeAutocomplete -------------------
// Handles autocomplete for trade command's character and item selection
async function handleTradeAutocomplete(interaction, focusedOption, focusedValue) {
  if (focusedOption.name === 'fromcharacter') {
    return await handleTradeFromCharacterAutocomplete(interaction, focusedValue);
  } else if (focusedOption.name === 'tocharacter') {
    return await handleTradeToCharacterAutocomplete(interaction, focusedValue);
  } else if (['item1', 'item2', 'item3'].includes(focusedOption.name)) {
    return await handleTradeItemAutocomplete(interaction, focusedValue);
  }
}

// ------------------- Function: handleTradeFromCharacterAutocomplete -------------------
// Provides autocomplete for selecting the source character in a trade
async function handleTradeFromCharacterAutocomplete(interaction, focusedValue) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    const choices = characters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleTradeFromCharacterAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleTradeToCharacterAutocomplete -------------------
// Provides autocomplete for selecting the target character in a trade
async function handleTradeToCharacterAutocomplete(interaction, focusedValue) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchAllCharactersExceptUser(userId);
    const choices = characters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleTradeToCharacterAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleTradeItemAutocomplete -------------------
// Provides autocomplete for selecting items to trade
async function handleTradeItemAutocomplete(interaction, focusedValue) {
  try {
    const fromCharacter = interaction.options.getString('fromcharacter');
    if (!fromCharacter) return await interaction.respond([]);
    const inventoryCollection = await getCharacterInventoryCollection(fromCharacter);
    const items = await inventoryCollection.find().toArray();
    // Aggregate by name, exclude 'Initial Item'
    const itemMap = new Map();
    for (const item of items) {
      if (!item.itemName || item.itemName.toLowerCase() === 'initial item') continue;
      const key = item.itemName.trim().toLowerCase();
      if (!itemMap.has(key)) {
        itemMap.set(key, { name: item.itemName, quantity: item.quantity });
      } else {
        itemMap.get(key).quantity += item.quantity;
      }
    }
    const choices = Array.from(itemMap.values()).map(item => ({
      name: `${capitalizeWords(item.name)} (Qty: ${item.quantity})`,
      value: item.name
    }));
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleTradeItemAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ============================================================================
// ------------------- GIFT COMMANDS -------------------
// Handles autocomplete interactions for the gift command, including:
// - Character selection (from/to)
// - Item selection with quantity tracking
// ============================================================================

// ------------------- Function: handleGiftAutocomplete -------------------
// Main router for gift command autocomplete, delegates to specific handlers
async function handleGiftAutocomplete(interaction, focusedOption, focusedValue) {
  try {
    if (focusedOption.name === 'fromcharacter') {
      return await handleGiftFromCharacterAutocomplete(interaction, focusedValue);
    } else if (focusedOption.name === 'tocharacter') {
      return await handleGiftToCharacterAutocomplete(interaction, focusedValue);
    } else if (['itema', 'itemb', 'itemc'].includes(focusedOption.name)) {
      return await handleGiftItemAutocomplete(interaction, focusedValue);
    }
  } catch (error) {
    console.error('[handleGiftAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleGiftFromCharacterAutocomplete -------------------
// Provides autocomplete for selecting the source character in a gift
async function handleGiftFromCharacterAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    const choices = characters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const focusedValue = focusedOption?.value?.toString().toLowerCase() || '';
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleGiftFromCharacterAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleGiftToCharacterAutocomplete -------------------
// Provides autocomplete for selecting the target character in a gift
async function handleGiftToCharacterAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchAllCharactersExceptUser(userId);
    const choices = characters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const focusedValue = focusedOption?.value?.toString().toLowerCase() || '';
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleGiftToCharacterAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleGiftItemAutocomplete -------------------
// Provides autocomplete for selecting items to gift with quantity tracking
async function handleGiftItemAutocomplete(interaction, focusedValue) {
  try {
    const fromCharacter = interaction.options.getString('fromcharacter');
    if (!fromCharacter) return await interaction.respond([]);
    const inventoryCollection = await getCharacterInventoryCollection(fromCharacter);
    const items = await inventoryCollection.find().toArray();
    // Aggregate by name, exclude 'Initial Item'
    const itemMap = new Map();
    for (const item of items) {
      if (!item.itemName || item.itemName.toLowerCase() === 'initial item') continue;
      const key = item.itemName.trim().toLowerCase();
      if (!itemMap.has(key)) {
        itemMap.set(key, { name: item.itemName, quantity: item.quantity });
      } else {
        itemMap.get(key).quantity += item.quantity;
      }
    }
    const choices = Array.from(itemMap.values()).map(item => ({
      name: `${capitalizeWords(item.name)} (Qty: ${item.quantity})`,
      value: item.name
    }));
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleGiftItemAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleShopBuyItemAutocomplete -------------------
// Provides autocomplete for selecting items to buy from the shop
async function handleShopBuyItemAutocomplete(interaction, focusedValue) {
  try {
    const characterName = interaction.options.getString('charactername');
    if (!characterName) {
      console.log('[handleShopBuyItemAutocomplete]: No character name provided');
      return await interaction.respond([]);
    }

    const userId = interaction.user.id;
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      console.log(`[handleShopBuyItemAutocomplete]: Character ${characterName} not found or doesn't belong to user ${userId}`);
      return await interaction.respond([]);
    }

    // Get items from the village's shop using ShopStock model
    const villageShopItems = await ShopStock.find({
      stock: { $gt: 0 },
      itemName: { $regex: new RegExp(focusedValue, 'i') }
    }).sort({ itemName: 1 }).limit(25);

    console.log(`[handleShopBuyItemAutocomplete]: Found ${villageShopItems.length} items in shop for ${characterName}`);

    if (villageShopItems.length === 0) {
      console.log(`[handleShopBuyItemAutocomplete]: No items found matching "${focusedValue}"`);
      return await interaction.respond([{
        name: 'No items found in shop',
        value: 'no_items_found'
      }]);
    }

    const choices = villageShopItems.map(item => ({
      name: `${item.itemName} - ${item.buyPrice} tokens${item.stock ? ` (Stock: ${item.stock})` : ''}`,
      value: item.itemName
    }));

    await interaction.respond(choices);
  } catch (error) {
    console.error('[handleShopBuyItemAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleShopAutocomplete -------------------
// Routes shop command autocomplete to appropriate handlers
async function handleShopAutocomplete(interaction, focusedOption, focusedValue) {
  if (focusedOption.name === 'charactername') {
    return await handleShopCharacterAutocomplete(interaction, focusedValue);
  } else if (focusedOption.name === 'itemname') {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'shop-buy') {
      return await handleShopBuyItemAutocomplete(interaction, focusedValue);
    } else {
      return await handleShopItemAutocomplete(interaction, focusedValue);
    }
  }
}

// ------------------- Function: handleShopCharacterAutocomplete -------------------
// Provides autocomplete for selecting character in shop commands
async function handleShopCharacterAutocomplete(interaction, focusedValue) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    const choices = characters
      .filter(char => char.name.toLowerCase().includes(focusedValue))
      .map(char => ({
        name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
        value: char.name
      }));
    return await respondWithFilteredChoices(interaction, focusedValue, choices);
  } catch (error) {
    console.error('[handleShopCharacterAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleShopItemAutocomplete -------------------
// Provides autocomplete for selecting items in shop commands
async function handleShopItemAutocomplete(interaction, focusedValue) {
  try {
    const character = interaction.options.getString('charactername');
    if (!character) return await interaction.respond([]);

    const inventoryCollection = await getCharacterInventoryCollection(character);
    const items = await inventoryCollection
      .find({ itemName: { $regex: focusedValue, $options: 'i' } })
      .toArray();

    const choices = items.map(item => ({
      name: `${item.itemName} (Qty: ${item.quantity})`,
      value: item.itemName
    }));
    return await respondWithFilteredChoices(interaction, focusedValue, choices);
  } catch (error) {
    console.error('[handleShopItemAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleTransferAutocomplete -------------------
// Routes transfer command autocomplete to appropriate handlers
async function handleTransferAutocomplete(interaction, focusedOption, focusedValue) {
  if (focusedOption.name === 'fromcharacter') {
    return await handleTransferFromCharacterAutocomplete(interaction, focusedValue);
  } else if (focusedOption.name === 'tocharacter') {
    return await handleTransferToCharacterAutocomplete(interaction, focusedValue);
  } else if (['itema', 'itemb', 'itemc'].includes(focusedOption.name)) {
    return await handleTransferItemAutocomplete(interaction, focusedValue);
  }
}

// ------------------- Function: handleTransferFromCharacterAutocomplete -------------------
// Provides autocomplete for selecting the source character in a transfer
async function handleTransferFromCharacterAutocomplete(interaction, focusedValue) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    const choices = characters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleTransferFromCharacterAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleTransferToCharacterAutocomplete -------------------
// Provides autocomplete for selecting the target character in a transfer
async function handleTransferToCharacterAutocomplete(interaction, focusedValue) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    const choices = characters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleTransferToCharacterAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleTransferItemAutocomplete -------------------
// Provides autocomplete for selecting items to transfer
async function handleTransferItemAutocomplete(interaction, focusedValue) {
  try {
    const fromCharacter = interaction.options.getString('fromcharacter');
    if (!fromCharacter) return await interaction.respond([]);
    const inventoryCollection = await getCharacterInventoryCollection(fromCharacter);
    const items = await inventoryCollection.find().toArray();
    // Aggregate by name, exclude 'Initial Item'
    const itemMap = new Map();
    for (const item of items) {
      if (!item.itemName || item.itemName.toLowerCase() === 'initial item') continue;
      const key = item.itemName.trim().toLowerCase();
      if (!itemMap.has(key)) {
        itemMap.set(key, { name: item.itemName, quantity: item.quantity });
      } else {
        itemMap.get(key).quantity += item.quantity;
      }
    }
    const choices = Array.from(itemMap.values()).map(item => ({
      name: `${capitalizeWords(item.name)} (Qty: ${item.quantity})`,
      value: item.name
    }));
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleTransferItemAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Item Autocomplete -------------------
// Provides autocomplete suggestions for items in a character's inventory.
async function handleItemAutocomplete(interaction, focusedOption) {
  try {
   const userId = interaction.user.id;
   const focusedName = focusedOption.name;
   const characterName = interaction.options.getString("charactername");
   const searchQuery = focusedOption.value?.toLowerCase() || "";
 
   if (!characterName) return await interaction.respond([]);
 
   const character = await fetchCharacterByNameAndUserId(characterName, userId);
   if (!character) return await interaction.respond([]);
 
   const inventoryCollection = await getCharacterInventoryCollection(
    character.name
   );
   const inventoryItems = await inventoryCollection.find().toArray();
 
   let choices = [];
 
   // Only fetch subcommand if autocompleting itemname
   if (focusedName === "itemname") {
    const subcommand = interaction.options.getSubcommand(false); // Pass false to prevent crash
 
    if (subcommand !== "sell") {
     // --- Updated Healing Item + Voucher Filter ---
     const itemNames = inventoryItems.map((item) => item.itemName);
 
     const allowedItems = await Item.find({
      itemName: { $in: itemNames },
      $or: [
       { "recipeTag.0": { $exists: true } }, // has at least one tag (healing)
       { itemName: "Fairy" },
       { itemName: "Job Voucher" },
      ],
     })
      .select("itemName")
      .lean();
 
     const allowedNames = new Set(
      allowedItems.map((item) => item.itemName.toLowerCase())
     );
 
     choices = inventoryItems
      .filter(
       (item) =>
        item.itemName &&
        allowedNames.has(item.itemName.toLowerCase()) &&
        item.itemName.toLowerCase().includes(searchQuery)
      )
      .map((item) => ({
       name: `${capitalizeWords(item.itemName)} - Qty: ${item.quantity}`,
       value: item.itemName,
      }));
    } else {
     const itemNames = inventoryItems.map((item) => item.itemName);
     const itemsFromDB = await Item.find({ itemName: { $in: itemNames } })
      .select("itemName sellPrice")
      .lean();
     const itemsMap = new Map(
      itemsFromDB.map((item) => [item.itemName, item.sellPrice])
     );
 
     choices = inventoryItems
      .filter(
       (item) =>
        item.itemName &&
        item.itemName.toLowerCase().includes(searchQuery) &&
        item.itemName.toLowerCase() !== "initial item"
      )
      .sort((a, b) => a.itemName.localeCompare(b.itemName))
      .map((item) => ({
       name: `${capitalizeWords(item.itemName)} - Qty: ${
        item.quantity
       } - Sell: ${itemsMap.get(item.itemName) || "N/A"}`,
       value: item.itemName,
      }));
    }
   } else {
    // If we're not focusing itemname, don't do anything fancy
    choices = inventoryItems
     .filter(
      (item) =>
       item.itemName && item.itemName.toLowerCase().includes(searchQuery)
     )
     .map((item) => ({
      name: `${capitalizeWords(item.itemName)} - Qty: ${item.quantity}`,
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
 
 // ------------------- Job Voucher Job Name Autocomplete -------------------
 
 async function handleItemJobNameAutocomplete(interaction, focusedOption) {
  try {
    // Get all jobs from all categories
    const allJobs = [
      ...getGeneralJobsPage(1),
      ...getGeneralJobsPage(2),
      ...getVillageExclusiveJobs('inariko'),
      ...getVillageExclusiveJobs('rudania'),
      ...getVillageExclusiveJobs('vhintl')
    ];

    // Remove duplicates and sort
    const uniqueJobs = [...new Set(allJobs)].sort();

    // Filter jobs based on user's typing
    const searchQuery = focusedOption.value?.toLowerCase() || "";
    const filteredJobs = uniqueJobs.filter((job) =>
      job.toLowerCase().includes(searchQuery)
    );

    // Format autocomplete choices
    const formattedChoices = filteredJobs.map((job) => ({
      name: capitalizeWords(job),
      value: job,
    }));

    await interaction.respond(formattedChoices.slice(0, 25));
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleItemJobNameAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
  }
 }

// ------------------- Shops Autocomplete -------------------
async function handleShopsAutocomplete(interaction, focusedOption) {
  try {
   const subcommand = interaction.options.getSubcommand();
   const searchQuery = focusedOption.value.toLowerCase();
   let choices = [];
 
   if (subcommand === "shop-buy") {
    const items = await ShopStock.find()
     .sort({ itemName: 1 })
     .select("itemName stock")
     .lean();
 
    choices = items
     .filter((item) => item.itemName.toLowerCase().includes(searchQuery))
     .map((item) => ({
      name: `${item.itemName} - Stock: ${item.stock}`,
      value: item.itemName,
     }));
   } else if (subcommand === "shop-sell") {
    const characterName = interaction.options.getString("charactername");
    if (!characterName) return await interaction.respond([]);
 
    const inventoryCollection = await getCharacterInventoryCollection(
     characterName
    );
    const inventoryItems = await inventoryCollection.find().toArray();
 
    choices = inventoryItems
     .filter((item) => item.itemName.toLowerCase().includes(searchQuery))
     .map((item) => ({
      name: `${item.itemName} - Qty: ${item.quantity}`,
      value: item.itemName,
     }));
   }
 
   await interaction.respond(choices.slice(0, 25));
  } catch (error) {
   handleError(error, "autocompleteHandler.js");
 
   console.error("[handleShopsAutocomplete]: Error:", error);
   await safeRespondWithError(interaction);
  }
 }

 // ------------------- Trade To Character Autocomplete -------------------
async function handleTradeToCharacterAutocomplete(interaction, focusedOption) {
  try {
   const userId = interaction.user.id;
 
   const characters = await fetchAllCharactersExceptUser(userId);
 
   const choices = characters.map((character) => ({
    name: `${character.name} | ${capitalize(character.currentVillage)}`,
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
   const fromCharacter = interaction.options.getString('fromcharacter');
   if (!fromCharacter) return await interaction.respond([]);
 
   const inventoryCollection = await getCharacterInventoryCollection(fromCharacter);
   const items = await inventoryCollection
     .find({ itemName: { $regex: (focusedOption?.value?.toString() || ''), $options: 'i' } })
     .toArray();
 
   const choices = items.map(item => ({
     name: `${item.itemName} (Qty: ${item.quantity})`,
     value: item.itemName
   }));
   return await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
   console.error('[handleTransferItemAutocomplete]: Error:', error);
   return await safeRespondWithError(interaction);
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
  } else if (category === "homeVillage" || category === "Village") {
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

async function handleExploreRollCharacterAutocomplete(
 interaction,
 focusedOption
) {
 try {
  const userId = interaction.user.id;
  const expeditionId = interaction.options.getString("id");

  if (!expeditionId) {
   return await interaction.respond([]);
  }

  const party = await Party.findOne({ partyId: expeditionId }).lean();
  if (!party) {
   return await interaction.respond([
    { name: "Expedition not found", value: "none" },
   ]);
  }

  const userCharacters = await fetchCharactersByUserId(userId);
  const userCharacterNames = userCharacters.map((char) => char.name);

  const userPartyCharacters = party.characters.filter((partyChar) =>
   userCharacterNames.includes(partyChar.name)
  );

  if (userPartyCharacters.length === 0) {
   return await interaction.respond([
    { name: "You don't have any characters in this expedition", value: "none" },
   ]);
  }

  const currentTurnCharacter = party.characters[party.currentTurn];

  const choices = userPartyCharacters.map((char) => {
   const isTurn = currentTurnCharacter && char.name === currentTurnCharacter.name;
   return {
    name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)} | ❤️ ${char.currentHearts || 0} | 🟩 ${char.currentStamina || 0}${isTurn ? " (Current Turn)" : ""}`,
    value: char.name,
   };
  });

  const filtered = choices.filter((choice) =>
   choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
  );

  return await interaction.respond(
   filtered.length > 0 ? filtered.slice(0, 25) : choices.slice(0, 25)
  );
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  console.error("Error during explore roll character autocomplete:", error);
  await interaction.respond([]);
 }
}

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

  const healingItems = await Item.find({
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

async function handleExploreCharacterAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const expeditionId = interaction.options.getString("id");

  const userCharacters = await fetchCharactersByUserId(userId);

  if (!expeditionId) {
   const choices = userCharacters.map((char) => ({
    name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
    value: char.name,
   }));

   const filtered = choices.filter((choice) =>
    choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
   );

   return await interaction.respond(filtered.slice(0, 25));
  }

  const party = await Party.findOne({ partyId: expeditionId });
  if (!party) {
   return await interaction.respond([
    { name: "Expedition not found", value: "none" },
   ]);
  }

  const regionToVillage = {
   eldin: "rudania",
   lanayru: "inariko",
   faron: "vhintl",
  };

  const requiredVillage = regionToVillage[party.region];
  if (!requiredVillage) {
   return await interaction.respond([
    { name: "Invalid expedition region", value: "none" },
   ]);
  }

  const eligibleCharacters = userCharacters.filter(
   (char) =>
    char.currentVillage.toLowerCase() === requiredVillage.toLowerCase() &&
    char.inventorySynced === true
  );

  if (eligibleCharacters.length === 0) {
   return await interaction.respond([
    {
     name: `You need a character in ${
      requiredVillage.charAt(0).toUpperCase() + requiredVillage.slice(1)
     } to join this expedition`,
     value: "none",
    },
   ]);
  }

  const choices = eligibleCharacters.map((char) => ({
   name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)} | ❤️ ${char.currentHearts} | 🟩 ${char.currentStamina}`,
   value: char.name,
  }));

  const filtered = choices.filter((choice) =>
   choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
  );

  return await interaction.respond(filtered.slice(0, 25));
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  console.error("Error during explore character autocomplete:", error);
  await interaction.respond([]);
 }
}

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
    ? item.category.split(",").map((cat) => cat.trim().toLowerCase())
    : [];
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
     categories.includes("armor") && item.type?.toLowerCase()?.includes("head")
    );
   } else if (type === "chest") {
    return (
     categories.includes("armor") && item.type?.toLowerCase()?.includes("chest")
    );
   } else if (type === "legs") {
    return (
     categories.includes("armor") && item.type?.toLowerCase()?.includes("legs")
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

// ------------------- Quest ID Autocomplete -------------------
async function handleQuestIdAutocomplete(interaction, focusedOption) {
  try {
      // Fetch active quests from the database
      const quests = await Quest.find({ status: 'active' }).lean();
      
      // Format quest choices for autocomplete
      const choices = quests.map(quest => ({
          name: `${quest.questID} - ${quest.title} (${quest.location})`,
          value: quest.questID
      }));
      
      // Respond with filtered quest choices
      await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
      handleError(error, "autocompleteHandler.js");
      console.error("[handleQuestIdAutocomplete]: Error:", error);
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
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'request') {
    if (focusedOption.name === "charactername") {
      // Autocomplete for characters owned by the user
      const userCharacters = await fetchCharactersByUserId(userId);
      const choices = userCharacters.map((character) => ({
        name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
        value: character.name,
      }));

      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (focusedOption.name === "hearts") {
      // For hearts, we'll show common healing amounts
      const choices = [
        { name: "1 Heart", value: 1 },
        { name: "2 Hearts", value: 2 },
        { name: "3 Hearts", value: 3 },
        { name: "4 Hearts", value: 4 },
        { name: "5 Hearts", value: 5 }
      ];
      await interaction.respond(choices);
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
        name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
        value: character.name,
      }));

      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } else if (subcommand === 'fulfill') {
    if (focusedOption.name === "healername") {
      // Autocomplete for user's own healers
      const userCharacters = await fetchCharactersByUserId(userId);
      const healerCharacters = userCharacters.filter(
        (character) =>
          character.job.toLowerCase() === "healer" ||
          (character.jobVoucher === true &&
            character.jobVoucherJob.toLowerCase() === "healer")
      );

      const choices = healerCharacters.map((character) => ({
        name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
        value: character.name,
      }));

      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
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
// LOOKUP COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "lookup" command.
// It provides suggestions for item names or ingredients based on user input.

// ------------------- Lookup Autocomplete -------------------
// Provides autocomplete suggestions for items or ingredients in the database.
async function handleLookupAutocomplete(interaction, focusedOption) {
  try {
    const focusedValue = focusedOption.value;

    // Route based on the focused option name
    if (focusedOption.name === 'item') {
      return await handleLookupItemAutocomplete(interaction, focusedValue);
    } else if (focusedOption.name === 'ingredient') {
      return await handleLookupIngredientAutocomplete(interaction, focusedValue);
    }

    return await interaction.respond([]);
  } catch (error) {
    console.error('[handleLookupAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleLookupItemAutocomplete -------------------
// Provides autocomplete for all items in the database
async function handleLookupItemAutocomplete(interaction, focusedValue) {
  try {
    const items = await Item.find()
      .sort({ itemName: 1 })
      .select('itemName')
      .lean();

    if (items.length === 0) {
      return await interaction.respond([]);
    }

    const choices = items
      .filter(item => item.itemName.toLowerCase().includes(focusedValue.toLowerCase()))
      .map(item => ({
        name: capitalizeWords(item.itemName),
        value: item.itemName
      }));

    if (choices.length === 0) {
      return await interaction.respond([]);
    }

    // Create a focusedOption object to match the expected parameter
    const focusedOption = {
      value: focusedValue,
      name: 'item'
    };

    return await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[handleLookupItemAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleLookupIngredientAutocomplete -------------------
// Provides autocomplete for ingredients in the database
async function handleLookupIngredientAutocomplete(interaction, focusedValue) {
  try {
    // Query for items that are either ingredients or raw materials
    const items = await Item.find({
      $or: [
        { type: { $regex: /ingredient/i } },
        { category: { $regex: /(ingredients|raw materials)/i } },
        { recipeTag: { $exists: true } }  // Also include items that can be used in recipes
      ]
    })
      .sort({ itemName: 1 })
      .select('itemName')
      .lean();

    if (items.length === 0) {
      return await interaction.respond([]);
    }

    const choices = items
      .filter(item => item.itemName.toLowerCase().includes(focusedValue.toLowerCase()))
      .map(item => ({
        name: capitalizeWords(item.itemName),
        value: item.itemName
      }));

    if (choices.length === 0) {
      return await interaction.respond([]);
    }

    // Create a focusedOption object to match the expected parameter
    const focusedOption = {
      value: focusedValue,
      name: 'ingredient'
    };

    return await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[handleLookupIngredientAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

// ============================================================================
// MOD COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "/mod" command.
// It provides suggestions for the "/give" and "/petlevel" subcommands.

// ------------------- /mod give: Character Autocomplete -------------------
async function handleModGiveCharacterAutocomplete(interaction, focusedOption) {
  try {
    // Fetch all characters from the database
    const characters = await fetchAllCharacters();
    
    // Ensure focusedValue is a string and has a default value
    const focusedValue = focusedOption?.value?.toString() || '';
    
    // Map characters to autocomplete choices
    const choices = characters
      .filter(char => char.name.toLowerCase().includes(focusedValue.toLowerCase()))
      .map(char => ({
        name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
        value: char.name
      }));

    // Respond with filtered choices (limit to 25)
    await interaction.respond(choices.slice(0, 25));
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleModGiveCharacterAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- /mod give: Item Autocomplete -------------------
async function handleModGiveItemAutocomplete(interaction, focusedOption) {
 try {
  // Fetch all items from the database
  const items = await Item.find()
    .sort({ itemName: 1 })
    .select('itemName')
    .lean();

  // Map items to autocomplete choices
  const choices = items.map((item) => ({
   name: capitalizeWords(item.itemName),
   value: item.itemName
  }));

  // Filter based on user input
  const searchQuery = focusedOption.value?.toLowerCase() || "";
  const filteredChoices = choices.filter(choice => 
   choice.name.toLowerCase().includes(searchQuery)
  );

  // Respond with filtered choices (limit to 25)
  await interaction.respond(filteredChoices.slice(0, 25));
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
    name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
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

// ------------------- Stable Character Autocomplete -------------------
// Provides autocomplete suggestions for user-owned characters with mounts for stable commands
async function handleStableCharacterAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    const subcommand = interaction.options.getSubcommand();

    // For sell command, only show characters that have mounts
    let filteredCharacters = characters;
    if (subcommand === "sell") {
      const charactersWithMounts = await Promise.all(
        characters.map(async (character) => {
          const mounts = await Mount.find({ owner: character.name });
          return mounts.length > 0 ? character : null;
        })
      );
      filteredCharacters = charactersWithMounts.filter(Boolean);
    }

    const choices = filteredCharacters.map((character) => ({
      name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
      value: character.name,
    }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleStableCharacterAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
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

// ------------------- Pet Character Name Autocomplete -------------------
async function handlePetCharacterAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    
    // Ensure focusedValue is a string and has a default value
    const focusedValue = focusedOption?.value?.toString() || '';
    
    const choices = characters
      .filter(char => char.name.toLowerCase().includes(focusedValue.toLowerCase()))
      .map(char => ({
        name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
        value: char.name
      }));
    return await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[handlePetCharacterAutocomplete]: Error:', error);
    return await safeRespondWithError(interaction);
  }
}

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

 // 4. Query pets based on subcommand
 const subcommand = interaction.options.getSubcommand();
 let pets;
 if (subcommand === "add") {
  // For add command, show no pets since we're adding a new one
  return await interaction.respond([]);
 } else if (subcommand === "retire") {
  // For retire command, only show active pets
  pets = await Pet.find({ owner: character._id, status: "active" }).lean();
 } else {
  // For other commands (roll, upgrade, view, edit), show all pets
  pets = await Pet.find({ owner: character._id }).lean();
 }

 if (!pets.length) {
  console.log(
   `[autocompleteHandler.js]: logs - No pets found for "${characterName}".`
  );
  return await interaction.respond([]);
 }

 // 5. Return pet names with status indicator
 const choices = pets.map((pet) => ({
  name: `${pet.name}${pet.status === "active" ? " (Active)" : " (Inactive)"}`,
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

 // 3. Get the pet's name (not ID)
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
        const targetType = interaction.options.getString('targettype');

        if (targetType === 'npc') {
            const npcNames = Object.keys(NPCs);
            const filteredNPCs = npcNames.filter(npc => 
                npc.toLowerCase().includes(focusedOption.value.toLowerCase())
            );

            const choices = filteredNPCs.map(npc => {
                const flavorText = NPCs[npc].flavorText;
                const roleMatch = flavorText.match(/, the ([^,]+),/);
                let role = roleMatch ? roleMatch[1] : '';
                
                if (npc === 'Lil Tim') {
                    role = 'Cucco';
                }
                
                return {
                    name: `${npc} | ${role}`,
                    value: npc
                };
            });

            await safeAutocompleteResponse(interaction, choices);
        } else if (targetType === 'player') {
            const characters = await Character.find({ canBeStolenFrom: true });
            const filteredCharacters = characters.filter(char => 
                char.name.toLowerCase().includes(focusedOption.value.toLowerCase())
            );

            const choices = filteredCharacters.map(char => ({
                name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
                value: char.name
            }));

            await safeAutocompleteResponse(interaction, choices);
        }
    } catch (error) {
        await safeRespondWithError(interaction);
    }
}

// ------------------- Steal Rarity Autocomplete -------------------
async function handleStealRarityAutocomplete(interaction, focusedOption) {
    try {
        const choices = ['common', 'uncommon', 'rare'];
        const filtered = choices.filter((choice) =>
            choice.toLowerCase().startsWith(focusedOption.value.toLowerCase())
        );

        await interaction.respond(
            filtered.map((choice) => ({
                name: choice.charAt(0).toUpperCase() + choice.slice(1),
                value: choice
            }))
        );
    } catch (error) {
        handleError(error, "autocompleteHandler.js");
        console.error("[handleStealRarityAutocomplete]: Error:", error);
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
async function handleTravelAutocomplete(interaction) {
 const focusedOption = interaction.options.getFocused(true);
 const userId = interaction.user.id;

 if (focusedOption.name === "charactername") {
  const characters = await fetchCharactersByUserId(userId);
  const filtered = characters
   .filter((char) =>
    char.name.toLowerCase().includes(focusedOption.value.toLowerCase())
   )
   .map((char) => ({
    name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
    value: char.name,
   }));
  await interaction.respond(filtered.slice(0, 25));
 }

 if (focusedOption.name === "destination") {
  const villages = getAllVillages(); // CORRECTED to your function
  const filtered = villages
   .filter((village) =>
    village.toLowerCase().includes(focusedOption.value.toLowerCase())
   )
   .map((village) => ({
    name: village.charAt(0).toUpperCase() + village.slice(1),
    value: village.toLowerCase(),
   }));
  await interaction.respond(filtered.slice(0, 25));
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
// - Add Items to Shop
// - Select Shop Slots

// ------------------- Function: getVendorItems -------------------
// Fetches vendor items based on character's village and job type
async function getVendorItems(village, vendorType, searchQuery) {
  const stockList = await getCurrentVendingStockList();
  if (!stockList?.stockList?.[village]) return [];

  const villageStock = stockList.stockList[village];
  return villageStock.filter(
    (item) =>
      item.vendingType?.toLowerCase() === vendorType?.toLowerCase() &&
      item.itemName?.toLowerCase().includes(searchQuery?.toLowerCase())
  );
}

// ------------------- Function: formatVendorItems -------------------
// Formats vendor items for autocomplete display with optional stock quantity
function formatVendorItems(items, includeStock = false) {
  return items.slice(0, 25).map((item) => ({
    name: `${item.itemName} - ${item.points} pts${includeStock ? ` - Qty: ${item.stock}` : ''}`,
    value: item.itemName,
  }));
}

// ------------------- Function: calculateAvailableSlots -------------------
// Calculates total available shop slots based on character's job and pouch type
function calculateAvailableSlots(character) {
  const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
  const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
  const baseSlots = baseSlotLimits[character.job?.toLowerCase()] || 0;
  const extraSlots = pouchCapacities[character.shopPouch?.toLowerCase()] || 0;
  return baseSlots + extraSlots;
}

// ------------------- Function: handleVendingAddAutocomplete -------------------
// Routes autocomplete requests for vending add command based on focused option
async function handleVendingAddAutocomplete(interaction, focusedOption) {
  try {
    const focusedName = focusedOption.name;
    switch (focusedName) {
      case 'charactername':
        const userId = interaction.user.id;
        const characters = await fetchCharactersByUserId(userId);
        
        // Filter for characters with vending jobs
        const vendorCharacters = characters.filter(char => {
          const job = char.job?.toLowerCase();
          return job === 'shopkeeper' || job === 'merchant';
        });
        
        const choices = vendorCharacters.map(char => ({
          name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
          value: char.name
        }));
        
        await respondWithFilteredChoices(interaction, focusedOption, choices);
        break;
      case 'itemname':
        await handleVendorItemAutocomplete(interaction, focusedOption);
        break;
      case 'slot':
        await handleSlotAutocomplete(interaction, focusedOption);
        break;
      default:
        await interaction.respond([]);
    }
  } catch (error) {
    console.error("[handleVendingAddAutocomplete]: Error:", error);
    await interaction.respond([]);
  }
}

// ------------------- Function: handleVendorItemAutocomplete -------------------
// Provides autocomplete suggestions for items available to vendor characters
async function handleVendorItemAutocomplete(interaction, focusedOption) {
  try {
    const characterName = interaction.options.getString("charactername");
    if (!characterName) return await interaction.respond([]);

    const userId = interaction.user.id;
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) return await interaction.respond([]);

    const village = character.currentVillage?.toLowerCase()?.trim();
    const vendorType = character.job?.toLowerCase();
    const searchQuery = focusedOption.value?.toLowerCase() || "";

    // Get current vending stock
    const stockList = await getCurrentVendingStockList();
    let vendorItems = [];
    let limitedItems = [];

    // Only show regular items for this vendor's type and village
    if (stockList?.stockList?.[village]) {
      vendorItems = stockList.stockList[village].filter(
        (item) =>
          item.vendingType?.toLowerCase() === vendorType &&
          item.itemName?.toLowerCase().includes(searchQuery)
      );
    }

    // Only show limited items if in stock
    if (stockList?.limitedItems && interaction.commandName === "vending" && interaction.options.getSubcommand() === "add") {
      limitedItems = stockList.limitedItems
        .filter(item =>
          item.itemName?.toLowerCase().includes(searchQuery) &&
          item.stock > 0
        )
        .map(item => ({
          ...item,
          isLimited: true,
          vendingType: vendorType
        }));
    }

    // Combine and format all items
    const allItems = [...vendorItems, ...limitedItems];
    const choices = allItems.map(item => ({
      name: `${item.itemName} - ${item.points} pts${item.isLimited ? ` (Limited - Qty: ${item.stock})` : ''}`,
      value: item.itemName
    }));

    await interaction.respond(choices.slice(0, 25));
  } catch (error) {
    console.error("[handleVendorItemAutocomplete]: Error:", error);
    await interaction.respond([]);
  }
}

// ------------------- Function: handleSlotAutocomplete -------------------
// Provides autocomplete suggestions for shop slots with current contents
async function handleSlotAutocomplete(interaction, focusedOption) {
  try {
    const characterName = interaction.options.getString('charactername');
    if (!characterName) return await interaction.respond([]);

    const userId = interaction.user.id;
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) return await interaction.respond([]);

    const totalSlots = calculateAvailableSlots(character);

    // Get used slots with their items
    const vendingClient = new MongoClient(process.env.MONGODB_INVENTORIES_URI);
    await vendingClient.connect();
    const vendCollection = vendingClient.db('vendingInventories').collection(characterName.toLowerCase());
    const items = await vendCollection.find({}).toArray();
    await vendingClient.close();

    // Create a map of slot => item info
    const slotMap = new Map();
    for (const item of items) {
      if (!item.slot) continue;
      if (slotMap.has(item.slot)) {
        const existing = slotMap.get(item.slot);
        if (existing.itemName === item.itemName) {
          existing.qty += item.stockQty;
        } else {
          slotMap.set(item.slot, { itemName: "❌ Multiple Items", qty: null });
        }
      } else {
        // Fetch stackable info for this item
        let stackable = false;
        let maxStackSize = 1;
        try {
          const itemDoc = await Item.findOne({ itemName: item.itemName });
          if (itemDoc) {
            stackable = itemDoc.stackable;
            maxStackSize = itemDoc.maxStackSize || 1;
          }
        } catch (e) {}
        slotMap.set(item.slot, { itemName: item.itemName, qty: item.stockQty, stackable, maxStackSize });
      }
    }

    // Generate slot options
    const slotChoices = [];
    for (let i = 1; i <= totalSlots; i++) {
      const slotName = `Slot ${i}`;
      const slotInfo = slotMap.get(slotName);
      
      if (slotInfo) {
        let fullness;
        if (slotInfo.qty === null) {
          fullness = `🚫 Conflict`;
        } else if (slotInfo.stackable) {
          fullness = `${Math.min(slotInfo.qty, slotInfo.maxStackSize)}/${slotInfo.maxStackSize}`;
        } else {
          fullness = `${slotInfo.qty}/1`;
        }
        slotChoices.push({
          name: `${slotName} – ${slotInfo.itemName} – ${fullness}`,
          value: slotName
        });
      } else {
        slotChoices.push({
          name: `${slotName} – (Empty)`,
          value: slotName
        });
      }
    }

    // Filter based on user input
    const searchQuery = focusedOption.value.toLowerCase();
    const filteredSlots = slotChoices
      .filter(slot => slot.name.toLowerCase().includes(searchQuery))
      .slice(0, 25);

    await interaction.respond(filteredSlots);
  } catch (error) {
    console.error('[handleSlotAutocomplete]: Error:', error);
    await interaction.respond([]);
  }
}

// ------------------- Function: handleVendorCharacterAutocomplete -------------------
// Provides autocomplete suggestions for characters with merchant/shopkeeper jobs
async function handleVendorCharacterAutocomplete(interaction) {
  try {
    const focusedValue = interaction.options.getFocused();

    const matchingCharacters = await Character.find({
      name: { $regex: new RegExp(focusedValue, 'i') },
      job: { $regex: /^(shopkeeper|merchant)$/i }
    }).limit(25);

    const results = matchingCharacters.map((char) => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));

    return await interaction.respond(results);
  } catch (error) {
    console.error('[handleVendorCharacterAutocomplete]:', error);
    return await interaction.respond([]);
  }
}

// ------------------- Function: handleVendingBarterAutocomplete -------------------
// Provides autocomplete suggestions for items in a vendor's shop during barter
async function handleVendingBarterAutocomplete(interaction, focusedOption) {
  try {

    const subcommand = interaction.options.getSubcommand();
    const focusedName = focusedOption.name;
    const searchQuery = focusedOption.value?.toLowerCase() || "";

    // Handle character name autocomplete (user's characters)
    if (focusedName === 'charactername') {
      const userId = interaction.user.id;
      const characters = await fetchAllCharacters();
      
      // Filter for user's characters
      const userCharacters = characters.filter(char => char.userId === userId);
      
      const choices = userCharacters.map(char => ({
        name: `${char.name} | ${char.currentVillage || 'No Village'} | ${char.job || 'No Job'}`,
        value: char.name
      }));

      const filteredChoices = choices.filter(choice => 
        choice.name.toLowerCase().includes(searchQuery)
      );

      await interaction.respond(filteredChoices.slice(0, 25));
      return;
    }

    // Handle vendor character autocomplete (all vendors)
    if (focusedName === 'vendorcharacter') {
      const characters = await fetchAllCharacters();
      
      // Filter for only characters with vending jobs and completed setup
      const vendorCharacters = characters.filter(character => {
        const job = character.job?.toLowerCase();
        return (job === 'shopkeeper' || job === 'merchant') && 
               character.vendingSetup?.shopLink && 
               character.vendingSync;
      });

      const choices = vendorCharacters.map(char => ({
        name: `${char.name} | ${char.currentVillage || 'No Village'} | ${char.job}`,
        value: char.name
      }));

      const filteredChoices = choices.filter(choice => 
        choice.name.toLowerCase().includes(searchQuery)
      );

      await interaction.respond(filteredChoices.slice(0, 25));
      return;
    }

    // Handle item name autocomplete
    if (focusedName === 'itemname') {
      let targetCharacter;
      
      if (subcommand === 'edit') {
        // For edit command, use charactername (your own shop)
        targetCharacter = interaction.options.getString("charactername");
      } else {
        // For barter command, use vendorcharacter (the shop you're buying from)
        targetCharacter = interaction.options.getString("vendorcharacter");
      }

      if (!targetCharacter) {
        await interaction.respond([]);
        return;
      }

      // Get character
      const character = await fetchCharacterByName(targetCharacter);
      if (!character) {
        await interaction.respond([]);
        return;
      }

      // Get items from character's vending inventory
      const vendingClient = new MongoClient(process.env.MONGODB_INVENTORIES_URI);
      await vendingClient.connect();
      const vendCollection = vendingClient.db('vendingInventories').collection(targetCharacter.toLowerCase());
      const vendingItems = await vendCollection.find({}).toArray();
      await vendingClient.close();

      // Filter and format items
      const filteredItems = vendingItems.filter(item =>
        item.itemName?.toLowerCase().includes(searchQuery)
      );

      // Format items based on subcommand
      const choices = filteredItems.map(item => {
        if (subcommand === 'edit') {
          // For edit command, show slot | item | qty format
          return {
            name: `${item.slot || 'Unknown'} | ${item.itemName} | Qty:${item.stockQty ?? '0'}`,
            value: item.itemName
          };
        } else {
          // For barter command, show full details
          return {
            name: `${item.slot || 'Unknown Slot'} | ${item.itemName} | Qty:${item.stockQty ?? 'undefined'} | Token:${item.tokenPrice || 'N/A'} | Art:${item.artPrice || 'N/A'}`,
            value: item.itemName
          };
        }
      });

      await interaction.respond(choices.slice(0, 25));
      return;
    }

    // Default empty response
    await interaction.respond([]);
  } catch (error) {
    // Handle specific error types
    if (error.code === 10062) {
      console.log('[handleVendingBarterAutocomplete]: Interaction already expired');
      return;
    }

    console.error("[handleVendingBarterAutocomplete]: Error:", error);
    try {
      await interaction.respond([]).catch(() => {});
    } catch (e) {
      // Ignore any errors from the fallback response
    }
  }
}

// ------------------- Function: handleVendingViewAutocomplete -------------------
// Provides autocomplete suggestions for viewing a vendor's shop
async function handleVendingViewAutocomplete(interaction, focusedOption) {
  try {
    // Fetch all characters from the database
    const characters = await fetchAllCharacters();

    // Filter for only characters with vending jobs and completed setup
    const vendorCharacters = characters.filter(character => {
      const job = character.job?.toLowerCase();
      return (job === 'shopkeeper' || job === 'merchant') && 
             character.vendingSetup?.shopLink && 
             character.vendingSync;
    });

    // Map characters to autocomplete choices with formatted display
    const choices = vendorCharacters.map((character) => ({
      name: `${character.name} | ${character.currentVillage || 'No Village'} | ${character.job}`,
      value: character.name
    }));

    // Filter based on user input
    const searchQuery = focusedOption.value?.toLowerCase() || "";
    const filteredChoices = choices.filter(choice => 
      choice.name.toLowerCase().includes(searchQuery)
    );

    await interaction.respond(filteredChoices.slice(0, 25));
  } catch (error) {
    console.error("[handleVendingViewAutocomplete]: Error:", error);
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
  const userId = interaction.user.id;

  // Fetch only characters owned by the user
  const characters = await fetchCharactersByUserId(userId);

  // Map characters to autocomplete choices with formatted display
  const choices = characters.map((character) => ({
   name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
   value: character.name
  }));

  // Filter based on user input
  const searchQuery = focusedOption.value?.toLowerCase() || "";
  const filteredChoices = choices.filter(choice => 
   choice.name.toLowerCase().includes(searchQuery)
  );

  // Respond with filtered choices (limit to 25)
  await interaction.respond(filteredChoices.slice(0, 25));
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
 handleEconomyAutocomplete,
 handleCharacterBasedCommandsAutocomplete,
 handleExploreCharacterAutocomplete,
 handleQuestIdAutocomplete,

 // ------------------- Character-Based Functions -------------------
 // ------------------- Blight Functions -------------------
 handleBlightCharacterAutocomplete,
 handleBlightItemAutocomplete,

 // ------------------- Boosting Functions -------------------
 handleBoostingCharacterAutocomplete,

 // ------------------- Change Job Functions -------------------
 handleChangeJobNewJobAutocomplete,
 handleChangeJobCharacterAutocomplete,

 // ------------------- Combat Functions -------------------

 // ------------------- Crafting Functions -------------------
 handleCraftingAutocomplete,

 // ------------------- Create Character Functions -------------------
 handleCreateCharacterVillageAutocomplete,
 handleCreateCharacterRaceAutocomplete,

 // ------------------- Custom Weapon Functions -------------------
 handleBaseWeaponAutocomplete,
 handleSubtypeAutocomplete,
 handleCustomWeaponCharacterAutocomplete,
 handleCustomWeaponIdAutocomplete,

 // ------------------- Deliver Functions -------------------
 handleCourierSenderAutocomplete,
 handleCourierAutocomplete,
 handleRecipientAutocomplete,
 handleCourierAcceptAutocomplete,
 handleVendingRecipientAutocomplete,
 handleAllRecipientAutocomplete,
 handleDeliverItemAutocomplete,
 handleVendorItemAutocomplete,
 handleVendorCharacterAutocomplete,

 // ------------------- Edit Character Functions -------------------
 handleEditCharacterAutocomplete,

 // ------------------- Explore Functions -------------------
 handleExploreItemAutocomplete,
 handleExploreRollCharacterAutocomplete,

 // ------------------- Gear Functions -------------------
 handleGearAutocomplete,

 // ------------------- Gift Functions -------------------
 handleGiftAutocomplete,

 // ------------------- Heal Functions -------------------
 handleHealAutocomplete,

 // ------------------- Item Functions -------------------
 handleItemAutocomplete,
 handleItemJobVoucherAutocomplete,
 handleItemJobNameAutocomplete,

 // ------------------- Lookup Functions -------------------
 handleLookupAutocomplete,

 // ------------------- Mod Give Functions -------------------
 handleModGiveCharacterAutocomplete,
 handleModGiveItemAutocomplete,

 // ------------------- Mount/Stable Functions -------------------
 handleMountAutocomplete,
 handleMountNameAutocomplete,
 handleStableCharacterAutocomplete,

 // ------------------- Pet Functions -------------------
 handlePetNameAutocomplete,
 handlePetSpeciesAutocomplete,
 handlePetRollTypeAutocomplete,

 // ------------------- Relic Functions -------------------

 // ------------------- Shops Functions -------------------
 handleShopsAutocomplete,

 // ------------------- Steal Functions -------------------
 handleStealCharacterAutocomplete,
 handleStealTargetAutocomplete,
 handleStealRarityAutocomplete,

 // ------------------- Trade Functions -------------------
 handleTradeToCharacterAutocomplete,
 handleTradeItemAutocomplete,

 // ------------------- Transfer Functions -------------------
 handleTransferCharacterAutocomplete,
 handleTransferItemAutocomplete,

 // ------------------- Travel Functions -------------------
 handleTravelAutocomplete,
 handleVillageBasedCommandsAutocomplete,

 // ------------------- Vending Functions -------------------
 handleSlotAutocomplete,
 handleVendingAddAutocomplete,
 handleVendingBarterAutocomplete,
 handleVendingViewAutocomplete,

 // ------------------- Village Functions -------------------


 // ------------------- View Inventory Functions -------------------
 handleViewInventoryAutocomplete,
 handlePetCharacterAutocomplete,

 // ------------------- Shop Buy Functions -------------------
 handleShopBuyItemAutocomplete,
};


