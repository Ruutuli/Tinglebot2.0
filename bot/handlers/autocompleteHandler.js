// ============================================================================
// ------------------- Imports -------------------
// This section handles all required imports organized by group and alphabetized.
// ============================================================================

// ------------------- Standard Libraries -------------------
const { MongoClient } = require("mongodb");

// ------------------- Database Connections -------------------
const {
 connectToInventories,
 connectToTinglebot
} = require('../database/db-bot');
const dbConfig = require("../config/database-bot");

// ------------------- Database Services -------------------
const {
 fetchAllCharacters,
 fetchAllCharactersExceptUser,
 fetchAllModCharacters,
 fetchBlightedCharactersByUserId,
 fetchCharacterByName,
 fetchCharacterByNameAndUserId,
 fetchCharactersByUserId,
 fetchCraftableItemsAndCheckMaterials,
 fetchModCharactersByUserId,
 getCharacterInventoryCollection,
 getCurrentVendingStockList,
 getVendingModel
} = require('../database/db-bot');

// ------------------- Utilities -------------------
const logger = require("../utils/logger");

// ------------------- Custom Modules -------------------
const {
 capitalize,
 capitalizeFirstLetter,
 capitalizeWords
} = require("../modules/formattingModule");
const {
 getGeneralJobsPage,
 getJobPerk,
 getVillageExclusiveJobs,
 jobPerks
} = require("../modules/jobsModule");
const { getAllVillages } = require("../modules/locationsModule");
const {
 getModCharacterByName,
 modCharacters
} = require("../modules/modCharacters");
const { normalPets, specialPets, speciesRollPermissions } = require("../modules/petModule");
const { getAllRaces } = require("../modules/raceModule");
const { NPCs } = require("../modules/NPCsModule");

// ------------------- Utility Functions -------------------
const { handleError } = require("../utils/globalErrorHandler");

// ------------------- Database Models -------------------
const Character = require("../../models/CharacterModel");
const Item = require("../../models/ItemModel");
const Mount = require("../../models/MountModel");
const Party = require("../../models/PartyModel");
const Pet = require("../../models/PetModel");
const Quest = require("../../models/QuestModel");
const ShopStock = require("../../models/VillageShopsModel");
const TableRoll = require("../../models/TableRollModel");
const TempData = require("../../models/TempDataModel");
const { VendingRequest } = require("../../models/VendingModel");
const { Village } = require("../../models/VillageModel");
const generalCategories = require("../../models/GeneralItemCategories");


// Add safe response utility
async function safeAutocompleteResponse(interaction, choices) {
  try {
    // Check if interaction is still valid
    if (!interaction.isAutocomplete()) {
      logger.warn('INTERACTION', 'Not an autocomplete interaction');
      return;
    }

    // Check if already responded
    if (interaction.responded) {
      logger.warn('INTERACTION', 'Already responded');
      return;
    }

    // Set a timeout for autocomplete responses (Discord's limit is 3 seconds)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Response timeout')), 2500)
    );

    // Try to respond with the choices
    await Promise.race([
      interaction.respond(choices),
      timeoutPromise
    ]);
  } catch (error) {
    // Log the error
    logger.error('INTERACTION', 'Autocomplete response error');
    
    // Handle specific error cases
    if (error.code === 10062 || error.message === 'Response timeout') {
      logger.info('INTERACTION', 'Autocomplete expired/timeout');
      return;
    }
  }
}

// ------------------- Choice Name Validation Helper -------------------
// Ensures autocomplete choice names meet Discord's requirements (1-100 characters)
function validateChoiceName(choice, maxLength = 100) {
  if (!choice.name || choice.name.length === 0) {
    return { ...choice, name: "Unknown Character" };
  }
  
  if (choice.name.length > maxLength) {
    // Truncate to maxLength-3 characters and add "..." to indicate truncation
    return { ...choice, name: choice.name.substring(0, maxLength - 3) + "..." };
  }
  
  return choice;
}

// ------------------- Safe Autocomplete Response with Validation -------------------
// Wraps interaction.respond with validation and error handling
async function safeRespondWithValidation(interaction, choices) {
  try {
    // Validate all choices to ensure they meet Discord's requirements
    const validatedChoices = choices.map(choice => validateChoiceName(choice));
    
    // Check if interaction is still valid
    if (!interaction.isAutocomplete()) {
      logger.warn('INTERACTION', 'Not an autocomplete interaction');
      return;
    }

    // Check if already responded
    if (interaction.responded) {
      logger.warn('INTERACTION', 'Already responded');
      return;
    }

    // Set a timeout for autocomplete responses (Discord's limit is 3 seconds)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Response timeout')), 2500)
    );

    // Try to respond with the validated choices
    await Promise.race([
      interaction.respond(validatedChoices),
      timeoutPromise
    ]);
  } catch (error) {
    // Log the error with context
    logger.error('INTERACTION', 'Validation error in autocomplete');
    
    // Log the choices that were being processed for debugging
    if (choices && choices.length > 0) {
      logger.info('INTERACTION', `Problematic choices: ${choices.length} items`);
    }
    
    // Handle specific error cases
    if (error.code === 10062 || error.message === 'Response timeout') {
      logger.info('INTERACTION', 'Autocomplete expired/timeout');
      return;
    }
    
    // Try to send an empty response as fallback
    try {
      if (!interaction.responded && interaction.isAutocomplete()) {
        await interaction.respond([]).catch(() => {});
      }
    } catch (e) {
      logger.error('INTERACTION', 'Fallback response failed');
    }
  }
}

// ============================================================================
// MAIN FUNCTION TO HANDLE AUTOCOMPLETE INTERACTIONS
// ============================================================================

async function safeRespondWithError(interaction, error) {
  try {
    if (!interaction.responded && interaction.isAutocomplete()) {
      // Check if interaction is still valid before responding
      if (interaction.isRepliable()) {
        await interaction.respond([]);
      }
    }
  } catch (respondError) {
    // Log the specific error for debugging
    if (respondError.code === 10062) {
      logger.warn('INTERACTION', 'Interaction expired, ignoring response attempt');
    } else {
      logger.error('INTERACTION', 'Error in safeRespondWithError');
    }
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
        // Simple validation
        if (!interaction?.isAutocomplete() || interaction.responded) {
            return;
        }

        const commandName = interaction.commandName;
        const focusedOption = interaction.options.getFocused(true);

        // Route to internal handler
        await handleAutocompleteInternal(interaction, commandName, focusedOption);
    } catch (error) {
        // Enhanced error handling
        try {
            if (!interaction.responded && interaction.isRepliable()) {
                await interaction.respond([]);
            }
        } catch (respondError) {
            if (respondError.code === 10062) {
                console.log('[autocompleteHandler.js]: Main handler - interaction expired, ignoring response attempt');
            } else {
                console.error('[autocompleteHandler.js]: Main handler - respond error:', respondError.message);
            }
        }
    }
}

// Internal autocomplete handler function
async function handleAutocompleteInternal(interaction, commandName, focusedOption) {
    try {
        // Check if interaction is still valid (3 second timeout)
        const interactionAge = Date.now() - interaction.createdTimestamp;
        if (interactionAge > 2500) { // 2.5 second safety margin
            console.log('[autocompleteHandler.js]: Interaction too old, skipping response');
            return;
        }

        switch (commandName) {

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
              } else if (modSubcommand === "petlevel") {
                if (focusedOption.name === "character") {
                  await handleModPetLevelCharacterAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "petname") {
                  await handleModPetLevelPetNameAutocomplete(interaction, focusedOption);
                }
              } else if (modSubcommand === "forceresetpetrolls") {
                if (focusedOption.name === "character") {
                  await handleModPetLevelCharacterAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "petname") {
                  await handleModPetLevelPetNameAutocomplete(interaction, focusedOption);
                }
              } else if (modSubcommand === "resetrolls") {
                if (focusedOption.name === "character") {
                  await handleModGiveCharacterAutocomplete(interaction, focusedOption);
                }
              } else if (modSubcommand === "vendingreset") {
                if (focusedOption.name === "character") {
                  await handleModGiveCharacterAutocomplete(interaction, focusedOption);
                }
          } else if (modSubcommand === "stealreset") {
            if (focusedOption.name === "character") {
              try {
                // Fetch all characters for moderator targeting
                const allCharacters = await fetchAllCharacters();
                const focusedValue = focusedOption?.value?.toString().toLowerCase() || "";

                // Map characters to choices
                let choices = allCharacters.map((char) => ({
                  name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
                  value: char.name,
                }));

                // Always include a special NPC option to reset all NPC cooldowns
                const npcChoice = { name: 'NPC (Reset all NPC cooldowns)', value: 'NPC' };

                // Filter choices based on user input
                choices = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));

                // Prepend NPC option if it matches filter or if input is empty/starts with 'npc'
                if (!focusedValue || 'npc'.startsWith(focusedValue) || npcChoice.name.toLowerCase().includes(focusedValue)) {
                  choices = [npcChoice, ...choices];
                }

                // Limit to 25 results
                await interaction.respond(choices.slice(0, 25));
              } catch (error) {
                try { await interaction.respond([]); } catch (_) {}
              }
            }
              } else if (modSubcommand === "shopadd") {
                if (focusedOption.name === "itemname") {
                  await handleModGiveItemAutocomplete(interaction, focusedOption);
                }
              } else if (modSubcommand === "trigger-raid") {
                if (focusedOption.name === "monster") {
                  await handleTier5PlusMonsterAutocomplete(interaction, focusedOption);
                }
              } else if (modSubcommand === "blight") {
                if (focusedOption.name === "character") {
                  await handleModBlightCharacterAutocomplete(interaction, focusedOption);
                }
              } else if (modSubcommand === "blightpause") {
                if (focusedOption.name === "character") {
                  await handleModBlightedCharacterAutocomplete(interaction, focusedOption);
                }
              } else if (modSubcommand === "blightunpause") {
                if (focusedOption.name === "character") {
                  await handleModBlightedCharacterAutocomplete(interaction, focusedOption);
                }
              } else if (modSubcommand === "blightstatus") {
                if (focusedOption.name === "character") {
                  await handleModBlightedCharacterAutocomplete(interaction, focusedOption);
                }
              } else if (modSubcommand === "blightoverride") {
                if (focusedOption.name === "target") {
                  await handleBlightOverrideTargetAutocomplete(interaction, focusedOption);
                }
              } else if (modSubcommand === "minigame") {
                if (focusedOption.name === "session_id") {
                  await handleMinigameSessionIdAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "character") {
                  await handleModMinigameCharacterAutocomplete(interaction, focusedOption);
                }
              } else if (modSubcommand === "rpposts") {
                if (focusedOption.name === "questid") {
                  await handleQuestIdAutocomplete(interaction, focusedOption);
                }
              }
            }
            break;

          // ------------------- Blight Command -------------------
          case "blight":
            if (interaction.options._subcommand) {
              const blightSubcommand = interaction.options.getSubcommand();
              
              if (blightSubcommand === "heal") {
                if (focusedOption.name === "character_name" || focusedOption.name === "healer_name") {
                  await handleBlightCharacterAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "item") {
                  await handleBlightItemAutocomplete(interaction, focusedOption);
                }
              } else if (blightSubcommand === "submit") {
                if (focusedOption.name === "item") {
                  await handleBlightItemAutocomplete(interaction, focusedOption);
                }
              } else if (blightSubcommand === "roll") {
                if (focusedOption.name === "character_name") {
                  await handleBlightCharacterAutocomplete(interaction, focusedOption);
                }
              } else if (blightSubcommand === "history") {
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
            await handleTravelAutocomplete(interaction, focusedOption);
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

          // ------------------- Minigame Command -------------------
          case "minigame":
            if (focusedOption.name === "character") {
              await handleMinigameCharacterAutocomplete(interaction, focusedOption);
            } else if (focusedOption.name === "session_id") {
              await handleMinigameSessionIdAutocomplete(interaction, focusedOption);
            } else if (focusedOption.name === "questid") {
              await handleQuestIdAutocomplete(interaction, focusedOption);
            } else if (focusedOption.name === "target") {
              await handleMinigameTargetAutocomplete(interaction, focusedOption);
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

          // ------------------- Gear Command -------------------
          case "gear":
            if (focusedOption.name === "charactername") {
              await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "gear");
            } else if (focusedOption.name === "itemname") {
              await handleGearAutocomplete(interaction, focusedOption);
            }
            break;

          // ------------------- Raid Command -------------------
          case "raid":
            if (focusedOption.name === "raidid") {
              await handleRaidIdAutocomplete(interaction, focusedOption);
            } else if (focusedOption.name === "charactername") {
              await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "raid");
            }
            break;

          // ------------------- Vending Command -------------------
          case "vending":
            const vendingSubcommand = interaction.options.getSubcommand(false);
            
            // Handle charactername autocomplete for all subcommands
            if (focusedOption.name === "charactername") {
              if (vendingSubcommand === "barter") {
                // For barter, show user's own characters
                await handleVendingBarterAutocomplete(interaction, focusedOption);
              } else if (vendingSubcommand === "view") {
                // For view, show all vendor characters with shops
                await handleVendingViewAutocomplete(interaction, focusedOption);
              } else if (vendingSubcommand === "collect_points" || vendingSubcommand === "restock" || 
                         vendingSubcommand === "pouch" || vendingSubcommand === "edit") {
                // For these commands, show user's own vendor characters
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
              }
            } 
            // Handle itemname autocomplete
            else if (focusedOption.name === "itemname") {
              if (vendingSubcommand === "restock") {
                await handleVendorItemAutocomplete(interaction, focusedOption);
              } else if (vendingSubcommand === "barter") {
                await handleVendingBarterAutocomplete(interaction, focusedOption);
              }
            }
            // Handle slot autocomplete
            else if (focusedOption.name === "slot" && (vendingSubcommand === "restock" || vendingSubcommand === "edit")) {
              await handleSlotAutocomplete(interaction, focusedOption);
            }
            // Handle vendorcharacter autocomplete
            else if (focusedOption.name === "vendorcharacter" && vendingSubcommand === "barter") {
              await handleVendingBarterAutocomplete(interaction, focusedOption);
            }
            // Handle barter item autocomplete (buyer's inventory for barter)
            else if ((focusedOption.name === "barter_item_1" || 
                      focusedOption.name === "barter_item_2" || 
                      focusedOption.name === "barter_item_3") && 
                     vendingSubcommand === "barter") {
              await handleVendingOfferAutocomplete(interaction, focusedOption);
            }
            // Handle fulfillmentid autocomplete
            else if (focusedOption.name === "fulfillmentid" && vendingSubcommand === "accept") {
              await handleVendingAcceptFulfillmentIdAutocomplete(interaction, focusedOption);
            }
            break;

          // ------------------- Stable Command -------------------
          case "stable":
            const subcommand = interaction.options.getSubcommand();

            if (focusedOption.name === "charactername") {
              await handleStableCharacterAutocomplete(interaction, focusedOption);
            } else if (focusedOption.name === "name") {
              await handleStableMountNameAutocomplete(interaction, focusedOption);
            } else {
              // Unknown focused option
            }
            break;
          // ------------------- Cancel Voucher Command -------------------
          case "cancelvoucher":
            if (focusedOption.name === "charactername") {
              await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "cancelvoucher");
            }
            break;

          // ------------------- Inventory Command -------------------
          case "inventory":
            if (focusedOption.name === "charactername") {
              await handleViewInventoryAutocomplete(interaction, focusedOption);
            }
            break;

          // ------------------- Transfer All Command -------------------
          case "transfer-all":
            if (focusedOption.name === "from" || focusedOption.name === "to") {
              await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "transfer-all");
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

          // ------------------- Handle Spirit Orb Character Autocomplete -------------------
          case 'spiritorbs':
            await handleSpiritOrbCharacterAutocomplete(interaction, focusedOption);
            return;

          // ------------------- Help Wanted Command -------------------
          case 'helpwanted':
            if (interaction.options._subcommand) {
              const helpWantedSubcommand = interaction.options.getSubcommand();
              if (helpWantedSubcommand === 'complete') {
                if (focusedOption.name === 'questid') {
                  await handleHelpWantedQuestIdAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === 'character') {
                  await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, 'helpwanted');
                }
              } else if (helpWantedSubcommand === 'monsterhunt') {
                if (focusedOption.name === 'id') {
                  await handleHelpWantedQuestIdAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === 'character') {
                  await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, 'helpwanted');
                }
              } else if (helpWantedSubcommand === 'exchange') {
                if (focusedOption.name === 'character') {
                  await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, 'helpwanted');
                }
              }
            }
            break;

          // ------------------- Boosting Command -------------------
          case "boosting":
            if (interaction.options._subcommand) {
              const boostingSubcommand = interaction.options.getSubcommand();
              if (boostingSubcommand === "request") {
                if (focusedOption.name === "character") {
                  await handleBoostingRequestCharacterAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "booster") {
                  await handleBoostingRequestBoosterAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "village") {
                  await handleBoostingVillageAutocomplete(interaction, focusedOption);
                }
              } else if (boostingSubcommand === "accept") {
                if (focusedOption.name === "character") {
                  await handleBoostingAcceptCharacterAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "requestid") {
                  await handleBoostingRequestIdAutocomplete(interaction, focusedOption);
                }
              } else if (boostingSubcommand === "status") {
                if (focusedOption.name === "charactername") {
                  await handleBoostingStatusCharacterAutocomplete(interaction, focusedOption);
                }
              } else if (boostingSubcommand === "other") {
                if (focusedOption.name === "charactername") {
                  await handleBoostingOtherCharacterAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "village") {
                  await handleBoostingVillageAutocomplete(interaction, focusedOption);
                }
              } else if (boostingSubcommand === "cancel") {
                if (focusedOption.name === "requestid") {
                  await handleBoostingCancelRequestIdAutocomplete(interaction, focusedOption);
                }
              }
            }
            break;

          // ------------------- Submit Command -------------------
          case "submit":
            if (focusedOption.name === "collab") {
              await handleSubmitCollabAutocomplete(interaction, focusedOption);
            } else if (focusedOption.name === "tagged_characters") {
              await handleTaggedCharactersAutocomplete(interaction, focusedOption);
            }
            break;

          // ------------------- Table Roll Command -------------------
          case "tableroll":
            if (interaction.options._subcommand) {
              const tablerollSubcommand = interaction.options.getSubcommand();
              if (tablerollSubcommand === "view" || tablerollSubcommand === "roll" || tablerollSubcommand === "edit" || tablerollSubcommand === "delete" || tablerollSubcommand === "duplicate") {
                if (focusedOption.name === "name") {
                  await handleTableRollNameAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "charactername") {
                  await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "tableroll");
                }
              }
            }
            break;

          // ------------------- Quest Command -------------------
          case "quest":
            if (interaction.options._subcommand) {
              const questSubcommand = interaction.options.getSubcommand();
              if (questSubcommand === "join") {
                if (focusedOption.name === "questid") {
                  await handleQuestIdAutocomplete(interaction, focusedOption);
                } else if (focusedOption.name === "charactername") {
                  await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "quest");
                }
              } else if (questSubcommand === "leave") {
                if (focusedOption.name === "questid") {
                  await handleQuestIdAutocomplete(interaction, focusedOption);
                }
              } else if (questSubcommand === "postcount") {
                if (focusedOption.name === "questid") {
                  await handleQuestIdAutocomplete(interaction, focusedOption);
                }
              } else if (questSubcommand === "turnin") {
                if (focusedOption.name === "character") {
                  await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, "quest");
                }
              }
            }
            break;

          // ------------------- Mod Character Command -------------------
          // Note: ModCharacter autocomplete is handled locally in the command file
          break;
        }
    } catch (error) {
        // Simple error handling
        try {
            if (!interaction.responded) {
                await interaction.respond([]);
            }
        } catch (respondError) {
            // Ignore respond errors - interaction likely expired
        }
    }
}

// ============================================================================
// HELPER & UTILITY FUNCTIONS
// ============================================================================

// ------------------- Helper Function to Filter and Respond with Choices -------------------
async function respondWithFilteredChoices(interaction, focusedOption, choices) {
  try {
    // Check if interaction is already responded to
    if (interaction.responded) {
      console.log('[autocompleteHandler.js]: ⚠️ Interaction already responded to in respondWithFilteredChoices');
      return;
    }

    // Check if interaction is still valid
    if (!interaction.isAutocomplete()) {
      console.log('[autocompleteHandler.js]: ⚠️ Interaction is not an autocomplete interaction in respondWithFilteredChoices');
      return;
    }

    const focusedValue = focusedOption?.value?.toLowerCase() || '';

    // Validate and sanitize choices to ensure they meet Discord's requirements
    const validatedChoices = choices.map(choice => {
      // Ensure name is between 1-100 characters as required by Discord
      if (!choice.name || choice.name.length === 0) {
        return { ...choice, name: "Unknown Character" };
      }
      
      if (choice.name.length > 100) {
        // Truncate to 97 characters and add "..." to indicate truncation
        return { ...choice, name: choice.name.substring(0, 97) + "..." };
      }
      
      return choice;
    });

    const filteredChoices = validatedChoices
      .filter(choice => choice.name.toLowerCase().includes(focusedValue))
      .slice(0, 25);

    // Set a timeout for autocomplete responses (Discord's limit is 3 seconds)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Response timeout')), 2500)
    );

    // Try to respond with the filtered choices
    await Promise.race([
      interaction.respond(filteredChoices),
      timeoutPromise
    ]);
  } catch (error) {
    // Handle specific error cases silently
    if (error.code === 10062 || error.message === 'Response timeout') {
      console.log('[autocompleteHandler.js]: ⚠️ Response timeout or expired interaction in respondWithFilteredChoices');
      return;
    }

    // Log other errors with more context
    console.error('[autocompleteHandler.js]: ❌ Error in respondWithFilteredChoices:', error);
    
    // Log the choices that were being processed for debugging
    if (choices && choices.length > 0) {
      console.error('[autocompleteHandler.js]: ❌ Problematic choices:', choices.map(c => ({
        name: c.name,
        nameLength: c.name?.length || 0,
        value: c.value
      })));
    }
    
    // Try to send an empty response as fallback
    try {
      if (!interaction.responded && interaction.isAutocomplete()) {
        await interaction.respond([]).catch(() => {});
      }
    } catch (e) {
      console.error('[autocompleteHandler.js]: ❌ Error sending fallback response in respondWithFilteredChoices:', e);
    }
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

  // Fetch all characters owned by the user (both regular and mod characters)
                const characters = await fetchCharactersByUserId(userId);
                const modCharacters = await fetchModCharactersByUserId(userId);
                
                // Combine regular characters and mod characters
                const allCharacters = [...characters, ...modCharacters];
                
  // Map all characters to choices with their basic info
  const choices = allCharacters.map((character) => ({
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
  await safeRespondWithError(interaction, error);
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
    // For other blight commands (roll, history), show all characters owned by the user
    const characters = await fetchCharactersByUserId(userId);
    const modCharacters = await fetchModCharactersByUserId(userId);
    
    // Combine regular characters and mod characters
    const allCharacters = [...characters, ...modCharacters];
    
    const choices = allCharacters.map((character) => ({
      name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
      value: character.name,
    }));
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  }
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  console.error("[handleBlightCharacterAutocomplete]: Error occurred:", error);
  await safeRespondWithError(interaction, error);
 }
}

// ------------------- Mod Blight Character Autocomplete -------------------
// Provides character suggestions for the "/mod blight" command by showing
// all characters in the database for moderators to select from.
async function handleModBlightCharacterAutocomplete(interaction, focusedOption) {
  try {
    // For mod blight command, show ALL characters in the database
    const allCharacters = await fetchAllCharacters();
    
    const choices = allCharacters.map((character) => ({
      name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
      value: character.name,
    }));
    
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleModBlightCharacterAutocomplete]: Error occurred:", error);
    await safeRespondWithError(interaction, error);
  }
}

// ------------------- Mod Blighted Character Autocomplete -------------------
// Provides character suggestions for blight-related commands by fetching
// only blighted characters from the database for moderators to select from.
async function handleModBlightedCharacterAutocomplete(interaction, focusedOption) {
  try {
    // For blightpause/blightunpause commands, show only blighted characters
    const allCharacters = await fetchAllCharacters();
    const blightedCharacters = allCharacters.filter(character => character.blighted);
    
    const choices = blightedCharacters.map((character) => {
      let status = '';
      if (character.blightPaused) {
        const pauseInfo = character.blightPauseInfo || {};
        const reason = pauseInfo.reason ? ` | ${pauseInfo.reason}` : '';
        status = ` | ⏸️ PAUSED${reason}`;
      } else {
        status = ` | ▶️ ACTIVE`;
      }
      
      // Build the full name and truncate if it exceeds Discord's 100 character limit
      let fullName = `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)} | Blight Stage ${character.blightStage}${status}`;
      
      // If the name is too long, truncate it intelligently
      if (fullName.length > 100) {
        // Try to keep the most important parts: character name and blight stage
        const baseName = `${character.name} | Blight Stage ${character.blightStage}`;
        if (baseName.length > 100) {
          // If even the base name is too long, truncate the character name
          const maxCharNameLength = 100 - ` | Blight Stage ${character.blightStage}`.length;
          fullName = `${character.name.substring(0, maxCharNameLength)}... | Blight Stage ${character.blightStage}`;
        } else {
          // Add status if it fits
          const remainingSpace = 100 - baseName.length;
          if (status.length <= remainingSpace) {
            fullName = baseName + status;
          } else {
            fullName = baseName;
          }
        }
      }
      
      return {
        name: fullName,
        value: character.name,
      };
    });
    
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleModBlightedCharacterAutocomplete]: Error occurred:", error);
    await safeRespondWithError(interaction, error);
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
              allHealingItems.add({
                name: item.name,
                quantity: item.quantity
              });
            });
          }
        });
      });

      // Convert to array and filter based on user input
      const input = focusedOption.value?.toLowerCase() || '';
      const choices = Array.from(allHealingItems)
        .filter(item => item.name.toLowerCase().includes(input))
        .map(item => ({
          name: `${item.name} | ${item.quantity} required`,
          value: `${item.name} x${item.quantity}`
        }))
        .slice(0, 25);

      await safeRespondWithValidation(interaction, choices);
      return;
    }

    // Handle other blight commands that need item autocomplete
    const characterName = interaction.options.getString("character_name");
    const healerName = interaction.options.getString("healer_name");

    if (!characterName || !healerName) {
      await interaction.respond([]);
      return;
    }

    // Get the healer character
    const healer = await fetchCharacterByName(healerName);
    if (!healer) {
      await interaction.respond([]);
      return;
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
          name: `${item.itemName} | ${requiredItem.quantity} required`,
          value: item.itemName
        };
      });

    await safeRespondWithValidation(interaction, choices.slice(0, 25));
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleBlightItemAutocomplete]: ❌ Error occurred:", error);
    // Don't try to respond again if there was an error
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
  await safeRespondWithError(interaction, error);
 }
}

// ------------------- Boosting Request Character Autocomplete -------------------
async function handleBoostingRequestCharacterAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const characters = await fetchCharactersByUserId(userId);
  const modCharacters = await fetchModCharactersByUserId(userId);
  
  // Combine regular characters and mod characters
  const allCharacters = [...characters, ...modCharacters];

  const choices = allCharacters.map((character) => ({
   name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
   value: character.name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleBoostingRequestCharacterAutocomplete]: Error:", error);
  await safeRespondWithError(interaction, error);
 }
}

// ------------------- Boosting Request Booster Autocomplete -------------------
async function handleBoostingRequestBoosterAutocomplete(interaction, focusedOption) {
 try {
  const characters = await fetchAllCharacters();

  // Get all jobs that have the BOOST perk
  const boostJobs = jobPerks
   .filter(job => job.perk === 'BOOST')
   .map(job => job.job);

  const filteredCharacters = characters.filter((character) => {
   return boostJobs.some(boostJob => 
     boostJob.toLowerCase() === character.job.toLowerCase()
   );
  });

  const choices = filteredCharacters.map((character) => ({
   name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
   value: character.name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleBoostingRequestBoosterAutocomplete]: Error:", error);
  await safeRespondWithError(interaction, error);
 }
}

// ------------------- Boosting Accept Character Autocomplete -------------------
async function handleBoostingAcceptCharacterAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const requestId = interaction.options.getString('requestid');
  const characters = await fetchCharactersByUserId(userId);
  const modCharacters = await fetchModCharactersByUserId(userId);
  
  // Combine regular characters and mod characters
  const allCharacters = [...characters, ...modCharacters];

  let filteredCharacters = allCharacters;
  
  // If a request ID is provided, filter to only show the specific character for that request
  if (requestId) {
    const requestData = await TempData.findByTypeAndKey('boosting', requestId);
    
    if (requestData && requestData.data && requestData.data.boostingCharacter) {
      filteredCharacters = allCharacters.filter(char => 
        char.name.toLowerCase() === requestData.data.boostingCharacter.toLowerCase()
      );
    }
  } else {
    // No request ID selected, show all characters with BOOST perk that have pending requests
    const boostJobs = jobPerks
      .filter(job => job.perk === 'BOOST')
      .map(job => job.job);

    filteredCharacters = allCharacters.filter((character) =>
      boostJobs.some(boostJob => 
        boostJob.toLowerCase() === character.job.toLowerCase()
      )
    );
  }

  const choices = filteredCharacters.map((character) => ({
   name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
   value: character.name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  logger.error('AUTOCOMPLETE', 'Error handling boosting accept character autocomplete', error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Boosting Status Character Autocomplete -------------------
async function handleBoostingStatusCharacterAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const characters = await fetchCharactersByUserId(userId);
  const modCharacters = await fetchModCharactersByUserId(userId);
  
  // Combine regular characters and mod characters
  const allCharacters = [...characters, ...modCharacters];

  const choices = allCharacters.map((character) => ({
   name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
   value: character.name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  console.error("[handleBoostingStatusCharacterAutocomplete]: Error:", error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Boosting Other Character Autocomplete -------------------
async function handleBoostingOtherCharacterAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  const [charactersResult, modCharactersResult] = await Promise.all([
   fetchCharactersByUserId(userId),
   fetchModCharactersByUserId(userId),
  ]);

  const characters = charactersResult || [];
  const modCharacters = modCharactersResult || [];
  const allCharacters = [...characters, ...modCharacters];

  const choices = allCharacters.map((character) => ({
   name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
   value: character.name,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

  logger.error('AUTOCOMPLETE', 'Error handling boosting other character autocomplete', error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Boosting Request ID Autocomplete -------------------
async function handleBoostingRequestIdAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  
  // Get all boosting requests from TempData
  const allBoostingData = await TempData.findAllByType('boosting');
  
  // Get user's characters to check ownership of boosting characters
  const characters = await fetchCharactersByUserId(userId);
  const modCharacters = await fetchModCharactersByUserId(userId);
  const allCharacters = [...characters, ...modCharacters];
  const userCharacterNames = allCharacters.map(char => char.name.toLowerCase());
  
  // Filter for pending requests where the user owns the boosting character
  const validRequests = allBoostingData
    .filter(tempData => {
      const requestData = tempData.data;
      const isPending = requestData.status === 'pending';
      const hasBooster = !!requestData.boostingCharacter;
      const ownsBooster = userCharacterNames.includes(requestData.boostingCharacter?.toLowerCase());
      return isPending && hasBooster && ownsBooster;
    })
    .map(tempData => tempData.data)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Most recent first
  
  // Create autocomplete choices
  const choices = validRequests.map(request => {
    const timeAgo = request.timestamp 
      ? Math.floor((Date.now() - request.timestamp) / (1000 * 60)) + 'm ago'
      : '';
    return {
      name: `${request.boostRequestId} | ${request.targetCharacter} ← ${request.boostingCharacter} | ${request.category} ${timeAgo}`,
      value: request.boostRequestId
    };
  });
  
  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  
  logger.error('AUTOCOMPLETE', 'Error handling boosting request ID autocomplete', error);
  await safeRespondWithError(interaction);
 }
}

// ------------------- Boosting Cancel Request ID Autocomplete -------------------
async function handleBoostingCancelRequestIdAutocomplete(interaction, focusedOption) {
 try {
  const userId = interaction.user.id;
  
  // Get all boosting requests from TempData
  const allBoostingData = await TempData.findAllByType('boosting');
  // Get user's characters to check ownership of target characters (requesters)
  const characters = await fetchCharactersByUserId(userId);
  const modCharacters = await fetchModCharactersByUserId(userId);
  const allCharacters = [...characters, ...modCharacters];
  const userCharacterNames = allCharacters.map(char => char.name.toLowerCase());
  
  const currentTime = Date.now();
  
  // Filter for pending and accepted requests where the user owns the target character (the requester)
  const validRequests = allBoostingData
    .filter(tempData => {
      const requestData = tempData.data;
      const isPendingOrAccepted = requestData.status === 'pending' || requestData.status === 'accepted';
      const hasTarget = !!requestData.targetCharacter;
      const ownsTarget = userCharacterNames.includes(requestData.targetCharacter?.toLowerCase());
      
      // For pending requests, check if not expired
      // For accepted requests, check if boost hasn't expired
      const notExpired = requestData.status === 'pending' 
        ? (!requestData.expiresAt || currentTime <= requestData.expiresAt)
        : (!requestData.boostExpiresAt || currentTime <= requestData.boostExpiresAt);
      
      return isPendingOrAccepted && hasTarget && ownsTarget && notExpired;
    })
    .map(tempData => tempData.data)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Most recent first
  
  // Create autocomplete choices
  const choices = validRequests.map(request => {
    const timeAgo = request.timestamp 
      ? Math.floor((Date.now() - request.timestamp) / (1000 * 60)) + 'm ago'
      : '';
    const statusText = request.status === 'accepted' ? '[ACTIVE]' : '[PENDING]';
    return {
      name: `${request.boostRequestId} | ${request.targetCharacter} → ${request.boostingCharacter} | ${request.category} ${statusText} ${timeAgo}`,
      value: request.boostRequestId
    };
  });
  
  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  
  console.error('AUTOCOMPLETE', 'Error handling boosting cancel request ID autocomplete', error);
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

    // For inventory-dependent crafting, skip cache to ensure fresh inventory data
    // Check cache first for this character's craftable items
    const cacheKey = `${characterName}_${userId}`;
    let craftableItems = craftableItemsCache.get(cacheKey);
    
    // Skip cache for crafting autocomplete since inventory changes frequently
    craftableItems = null;
    
    // Fetch character first to get stamina
    let character = await fetchCharacterByNameAndUserId(characterName, userId);
    
    if (!craftableItems) {
      // Fetch inventory and check job perks in parallel
      const [allCraftableItems, inventoryCollection] = await Promise.all([
        Item.find({
          crafting: true
        })
        .select('itemName craftingTags craftingMaterial cook blacksmith craftsman maskMaker researcher weaver artist witch staminaToCraft')
        .lean(),
        getCharacterInventoryCollection(characterName)
      ]);

      if (!character) {
        return await safeAutocompleteResponse(interaction, []);
      }

      // Get character's inventory
      const inventory = await inventoryCollection.find().toArray();

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

      if (!jobPerk || (!jobPerk.perks.includes("CRAFTING") && !jobPerk.perks.includes("ALL"))) {
        return await safeAutocompleteResponse(interaction, []);
      }

      // Filter items by job first using boolean fields
      const jobFilteredItems = allCraftableItems.filter(item => {
        const jobLower = job.toLowerCase();
        
        // Special handling for mod characters with ALL perks (Oracle, Sage, Dragon)
        if (jobPerk.perks.includes("ALL")) {
          return true; // Can craft anything
        }
        
        // Map job names to their corresponding boolean fields
        const jobFieldMap = {
          'cook': 'cook',
          'blacksmith': 'blacksmith',
          'craftsman': 'craftsman',
          'mask maker': 'maskMaker',
          'researcher': 'researcher',
          'weaver': 'weaver',
          'artist': 'artist',
          'witch': 'witch'
        };
        
        const jobField = jobFieldMap[jobLower];
        return jobField && item[jobField] === true;
      });

      // Then filter by inventory availability
      craftableItems = jobFilteredItems.filter(item => {
        // Check if character has all required materials for at least 1 quantity
        for (const material of item.craftingMaterial) {
          const requiredQty = material.quantity;
          let ownedQty = 0;

          if (generalCategories[material.itemName]) {
            // Check category items
            ownedQty = inventory.filter(invItem => 
              generalCategories[material.itemName].includes(invItem.itemName)
            ).reduce((sum, inv) => sum + inv.quantity, 0);
          } else {
            // Check specific item
            ownedQty = inventory.filter(invItem => 
              invItem.itemName === material.itemName
            ).reduce((sum, inv) => sum + inv.quantity, 0);
          }

          if (ownedQty < requiredQty) {
            return false; // Missing required material
          }
        }
        return true; // Has all required materials
      });
      
      // Don't cache crafting results since inventory changes frequently
      // craftableItemsCache.set(cacheKey, craftableItems);
      // setTimeout(() => craftableItemsCache.delete(cacheKey), CACHE_TTL);
    }

    // Filter items by search query and limit to 25
    // Get character's current stamina
    const characterStamina = character ? (character.currentStamina || 0) : 0;

    const filteredItems = craftableItems
      .filter(item => {
        // Filter by search query - check if it matches item name (without stamina info)
        const itemNameLower = item.itemName.toLowerCase();
        return itemNameLower.includes(searchQuery);
      })
      .slice(0, 25)
      .map(item => {
        const staminaCost = item.staminaToCraft !== null && item.staminaToCraft !== undefined ? item.staminaToCraft : 0;
        const nameWithStamina = `${item.itemName} - 🟩 ${staminaCost} | Has: ${characterStamina}`;
        return {
          name: nameWithStamina,
          value: item.itemName  // Keep the original item name as the value
        };
      });

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

// ------------------- Boosting Village Autocomplete -------------------
// Provides autocomplete suggestions for target villages in Scholar Gathering boosts.
async function handleBoostingVillageAutocomplete(
 interaction,
 focusedOption
) {
 try {
  const characterName = interaction.options.getString('character') || interaction.options.getString('charactername');
  const boosterName = interaction.options.getString('booster');
  const category = interaction.options.getString('category');

  let boosterCharacter = null;
  let currentVillage = null;

  if (boosterName) {
   boosterCharacter = await fetchCharacterByName(boosterName);
  }

  if (characterName) {
   const character = await fetchCharacterByName(characterName);
   currentVillage = character?.currentVillage || null;
  }

  const isScholarGathering = boosterCharacter?.job === 'Scholar' && category === 'Gathering';
  const allVillages = getAllVillages();

  const availableVillages =
   isScholarGathering && typeof currentVillage === 'string'
    ? allVillages.filter((village) => village.toLowerCase() !== currentVillage.toLowerCase())
    : allVillages;

  const labelSuffix = isScholarGathering ? 'Required for Scholar Gathering' : 'Optional target village';

  const choices = availableVillages.map((village) => ({
   name: `${village} (${labelSuffix})`,
   value: village,
  }));

  await respondWithFilteredChoices(interaction, focusedOption, choices);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");

 logger.error('AUTOCOMPLETE', 'Error handling boosting village autocomplete', error);

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
  const races = getAllRaces();
  
  // Add Dragon race for mod characters only
  if (interaction.commandName === 'modcharacter') {
    races.push('dragon');
  }
  
  const choices = races.map((race) => ({
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
                const modCharacters = await fetchModCharactersByUserId(userId);
                
                // Combine regular characters and mod characters
                const allCharacters = [...characters, ...modCharacters];
                
    // Ensure focusedValue is a string and has a default value
    const focusedValue = focusedOption?.value?.toString() || '';
    
    const choices = allCharacters
      .filter(char => char.name.toLowerCase().includes(focusedValue.toLowerCase()))
      .map(char => ({
                  name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
                  value: char.name
                }));
    return await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[handleCustomWeaponCharacterAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
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
    await safeRespondWithError(interaction);
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

    // Only show limited items if in stock - for both "add" and "restock" subcommands
    const vendingSubcommand = interaction.options.getSubcommand();
    if (stockList?.limitedItems && interaction.commandName === "vending" && (vendingSubcommand === "add" || vendingSubcommand === "restock")) {
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
    await safeRespondWithError(interaction);
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
    const modCharacters = await fetchModCharactersByUserId(userId);
    
    // Combine regular characters and mod characters
    const allCharacters = [...characters, ...modCharacters];
    
    const choices = allCharacters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleTradeFromCharacterAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleTradeToCharacterAutocomplete -------------------
// Provides autocomplete for selecting the target character in a trade
async function handleTradeToCharacterAutocomplete(interaction, focusedValue) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchAllCharactersExceptUser(userId);
    const allModCharacters = await fetchAllModCharacters();
    
    // Combine regular characters and all mod characters
    const allCharacters = [...characters, ...allModCharacters];
    
    const choices = allCharacters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const searchTerm = (focusedValue || '').toLowerCase();
    const filtered = choices.filter(choice => 
      choice.name.toLowerCase().includes(searchTerm) || 
      choice.value.toLowerCase().includes(searchTerm)
    );
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleTradeToCharacterAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
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
    
    // Aggregate by name, exclude 'Initial Item' and items with quantity <= 0
    const itemMap = new Map();
    for (const item of items) {
      if (!item.itemName || item.itemName.toLowerCase() === 'initial item') continue;
      if (item.quantity <= 0) continue; // Skip items with zero quantity
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
    
    // Convert search term to lowercase for case-insensitive matching
    const searchTerm = (focusedValue || '').toLowerCase().trim();
    
    // More flexible filtering that matches any part of the item name
    const filtered = choices.filter(choice => 
      choice.name.toLowerCase().includes(searchTerm) || 
      choice.value.toLowerCase().includes(searchTerm)
    );
    
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleTradeItemAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
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
      return await handleGiftFromCharacterAutocomplete(interaction, focusedOption);
    } else if (focusedOption.name === 'tocharacter') {
      return await handleGiftToCharacterAutocomplete(interaction, focusedOption);
    } else if (['itema', 'itemb', 'itemc'].includes(focusedOption.name)) {
      return await handleGiftItemAutocomplete(interaction, focusedOption);
    }
  } catch (error) {
    console.error('[handleGiftAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleGiftFromCharacterAutocomplete -------------------
// Provides autocomplete for selecting the source character in a gift
async function handleGiftFromCharacterAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    const modCharacters = await fetchModCharactersByUserId(userId);
    
    // Combine regular characters and mod characters
    const allCharacters = [...characters, ...modCharacters];
    
    const choices = allCharacters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const focusedValue = focusedOption?.value?.toString().toLowerCase() || '';
    const filtered = choices.filter(choice => 
      choice.name.toLowerCase().includes(focusedValue) || 
      choice.value.toLowerCase().includes(focusedValue)
    );
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleGiftFromCharacterAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleGiftToCharacterAutocomplete -------------------
// Provides autocomplete for selecting the target character in a gift
async function handleGiftToCharacterAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchAllCharactersExceptUser(userId);
    const allModCharacters = await fetchAllModCharacters();
    
    // Combine regular characters and all mod characters
    const allCharacters = [...characters, ...allModCharacters];
    
    const choices = allCharacters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const focusedValue = focusedOption?.value?.toString().toLowerCase() || '';
    const filtered = choices.filter(choice => 
      choice.name.toLowerCase().includes(focusedValue) || 
      choice.value.toLowerCase().includes(focusedValue)
    );
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleGiftToCharacterAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
    }
}

// ------------------- Function: handleGiftItemAutocomplete -------------------
// Provides autocomplete for selecting items to gift with quantity tracking
async function handleGiftItemAutocomplete(interaction, focusedOption) {
  try {
    const fromCharacter = interaction.options.getString('fromcharacter');
    if (!fromCharacter) return await interaction.respond([]);
    const inventoryCollection = await getCharacterInventoryCollection(fromCharacter);
    const items = await inventoryCollection.find().toArray();
    // Aggregate by name, exclude 'Initial Item' and items with quantity <= 0
    const itemMap = new Map();
    for (const item of items) {
      if (!item.itemName || item.itemName.toLowerCase() === 'initial item') continue;
      if (item.quantity <= 0) continue;
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
    const focusedValue = focusedOption?.value?.toString().toLowerCase() || '';
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleGiftItemAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleShopBuyItemAutocomplete -------------------
// Provides autocomplete for selecting items to buy from the shop
async function handleShopBuyItemAutocomplete(interaction, focusedValue) {
  try {
    const characterName = interaction.options.getString('charactername');
    if (!characterName) {
      return await interaction.respond([]);
    }

    const userId = interaction.user.id;
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      return await interaction.respond([]);
    }

    // Get items from the village's shop using ShopStock model
    const villageShopItems = await ShopStock.find({
      stock: { $gt: 0 },
      itemName: { $regex: new RegExp(focusedValue, 'i') }
    }).sort({ itemName: 1 }).limit(25);

    if (villageShopItems.length === 0) {
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
    
    // Create a focusedOption object to match the expected parameter
    const focusedOption = {
      value: focusedValue,
      name: 'character'
    };
    
    return await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[handleShopCharacterAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleShopItemAutocomplete -------------------
// Provides autocomplete for selecting items in shop commands
async function handleShopItemAutocomplete(interaction, focusedValue) {
  try {
    const character = interaction.options.getString('charactername');
    if (!character) return await interaction.respond([]);

    const inventoryCollection = await getCharacterInventoryCollection(character);
    // Escape special regex characters in the search value
    const escapedValue = focusedValue.replace(/[.*+?^${}()|[\\]/g, '\\$&');
    const searchQuery = focusedValue.toLowerCase();
    
    // Get all inventory items
    const inventoryItems = await inventoryCollection
      .find({ quantity: { $gt: 0 } })
      .toArray();

    // Filter items matching search query and exclude 'Initial Item'
    const filteredItems = inventoryItems.filter(
      (item) => 
        item.itemName && 
        item.itemName.toLowerCase() !== 'initial item' &&
        item.itemName.toLowerCase().includes(searchQuery) &&
        (item.quantity || 0) > 0
    );

    // Aggregate items by name AND properties (crafted, Fortune Teller boost)
    // Items with different properties should be kept separate
    const itemMap = new Map();
    for (const item of filteredItems) {
      // Check if item is crafted (by date or by obtain field)
      const obtainMethod = (item.obtain || '').toString().toLowerCase();
      const isCrafted = !!item.craftedAt || obtainMethod.includes("crafting") || obtainMethod.includes("crafted");
      const hasFortuneTellerBoost = !!item.fortuneTellerBoost;
      
      // Create a unique key that includes name, crafting status, and boost status
      // This ensures items with different properties are kept separate
      const key = `${item.itemName.trim().toLowerCase()}-${isCrafted ? 'crafted' : 'regular'}-${hasFortuneTellerBoost ? 'boosted' : 'normal'}`;
      
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          name: item.itemName,
          quantity: item.quantity || 0,
          isCrafted: isCrafted,
          hasFortuneTellerBoost: hasFortuneTellerBoost,
        });
      } else {
        // Only aggregate if they have the same properties
        const existing = itemMap.get(key);
        existing.quantity += (item.quantity || 0);
      }
    }

    // Convert to array and sort alphabetically
    const aggregatedItems = Array.from(itemMap.values()).sort((a, b) => 
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );

    // Format choices with indicators
    const choices = aggregatedItems.map((item) => {
      let indicators = '';
      if (item.isCrafted) indicators += '🔨 ';
      if (item.hasFortuneTellerBoost) indicators += '🔮 ';
      // If no special indicators, use box emoji for regular items
      if (!indicators) indicators = '📦 ';
      
      return {
        name: `${indicators}${item.name} - Qty: ${item.quantity}`,
        value: item.name
      };
    });
    
    // Create a focusedOption object to match the expected parameter
    const focusedOption = {
      value: focusedValue,
      name: 'item'
    };
    
    return await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[handleShopItemAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
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
    const modCharacters = await fetchModCharactersByUserId(userId);
    
    // Combine regular characters and mod characters
    const allCharacters = [...characters, ...modCharacters];
    
    const choices = allCharacters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleTransferFromCharacterAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleTransferToCharacterAutocomplete -------------------
// Provides autocomplete for selecting the target character in a transfer
async function handleTransferToCharacterAutocomplete(interaction, focusedValue) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    const modCharacters = await fetchModCharactersByUserId(userId);
    
    // Combine regular characters and mod characters
    const allCharacters = [...characters, ...modCharacters];
    
    const choices = allCharacters.map(char => ({
      name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
      value: char.name
    }));
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[handleTransferToCharacterAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
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

    const searchTerm = focusedValue?.toLowerCase().trim() || '';
    const allItems = Array.from(itemMap.values());
    const filteredItems = allItems.filter(item => 
      item.name.toLowerCase().includes(searchTerm)
    );

    const choices = filteredItems.map(item => ({
      name: `${capitalizeWords(item.name)} (Qty: ${item.quantity})`,
      value: item.name
    }));

    await interaction.respond(
      choices.slice(0, 25).map(choice => ({
        name: choice.name,
        value: choice.value
      }))
    );
  } catch (error) {
    console.error('[handleTransferItemAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Item Autocomplete -------------------
// Provides autocomplete suggestions for items in a character's inventory.
async function handleItemAutocomplete(interaction, focusedOption) {
  try {
    // Check if interaction is still valid (3 second timeout)
    const interactionAge = Date.now() - interaction.createdTimestamp;
    if (interactionAge > 2500) { // 2.5 second safety margin
      console.log('[handleItemAutocomplete]: Interaction too old, skipping response');
      return;
    }

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

      // --- Process items with crafting status (keep crafted and non-crafted separate) ---
      const processedItems = inventoryItems
        .filter(item => item.quantity > 0)
        .map(item => {
          const obtainMethod = (item.obtain || '').toString().toLowerCase();
          const isCrafted = obtainMethod.includes("crafting") || obtainMethod.includes("crafted");
          
          return {
            name: item.itemName?.toLowerCase(),
            quantity: item.quantity,
            isCrafted: isCrafted,
            obtain: item.obtain || 'Unknown'
          };
        })
        .filter(item => item.name); // Remove items without names

      if (subcommand === "sell") {
        const itemNames = processedItems.map(item => item.name);
        const itemsFromDB = await Item.find({ itemName: { $in: itemNames } })
          .select("itemName sellPrice")
          .lean();
        const itemsMap = new Map(
          itemsFromDB.map((item) => [item.itemName.toLowerCase(), item.sellPrice])
        );

        choices = processedItems
          .filter(item => 
            item.name.includes(searchQuery) &&
            item.name !== "initial item"
          )
          .sort((a, b) => {
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0) return nameCompare;
            return a.isCrafted ? 1 : -1; // Non-crafted first
          })
          .map(item => {
            const craftingIcon = item.isCrafted ? '🔨' : '📦';
            const sellPrice = itemsMap.get(item.name) || "N/A";
            return {
              name: `${craftingIcon} ${capitalizeWords(item.name)} (Qty: ${item.quantity}) - Sell: ${sellPrice}`,
              value: item.name,
            };
          });
      } else {
        // For non-sell subcommands, show all items in inventory
        choices = processedItems
          .filter(item => 
            item.name.includes(searchQuery) &&
            item.name !== "initial item"
          )
          .sort((a, b) => {
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0) return nameCompare;
            return a.isCrafted ? 1 : -1; // Non-crafted first
          })
          .map(item => {
            const craftingIcon = item.isCrafted ? '🔨' : '📦';
            return {
              name: `${craftingIcon} ${capitalizeWords(item.name)} (Qty: ${item.quantity})`,
              value: item.name,
            };
          });
      }
    } else {
      // If we're not focusing itemname, don't do anything fancy
      // --- Aggregate item quantities by item name (case-insensitive) ---
      const itemTotals = {};
      for (const item of inventoryItems) {
        const name = item.itemName?.toLowerCase();
        if (!name) continue;
        if (!itemTotals[name]) itemTotals[name] = 0;
        itemTotals[name] += item.quantity;
      }
      choices = Object.entries(itemTotals)
        .filter(([name]) => name.includes(searchQuery))
        .map(([name, total]) => ({
          name: `${capitalizeWords(name)} - Qty: ${total}`,
          value: name,
        }));
    }

    await interaction.respond(choices.slice(0, 25));
  } catch (error) {
    // Handle "Unknown interaction" errors gracefully
    if (error.code === 10062) {
      console.log('[handleItemAutocomplete]: Interaction expired, ignoring response attempt');
      return;
    }
    
    handleError(error, "autocompleteHandler.js");
    console.error("[handleItemAutocomplete]: Error:", error);
    
    if (!interaction.responded) {
      try {
        await interaction.respond([]);
      } catch (respondError) {
        if (respondError.code === 10062) {
          console.log('[handleItemAutocomplete]: Interaction expired during error response');
        }
      }
    }
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
 
    // Filter items matching search query and exclude 'Initial Item'
    const filteredItems = inventoryItems.filter(
     (item) => 
      item.itemName && 
      item.itemName.toLowerCase() !== 'initial item' &&
      item.itemName.toLowerCase().includes(searchQuery) &&
      (item.quantity || 0) > 0
    );
 
    // Aggregate items by name AND properties (crafted, Fortune Teller boost)
    // Items with different properties should be kept separate
    const itemMap = new Map();
    for (const item of filteredItems) {
      // Check if item is crafted (by date or by obtain field)
      const obtainMethod = (item.obtain || '').toString().toLowerCase();
      const isCrafted = !!item.craftedAt || obtainMethod.includes("crafting") || obtainMethod.includes("crafted");
      const hasFortuneTellerBoost = !!item.fortuneTellerBoost;
      
      // Create a unique key that includes name, crafting status, and boost status
      // This ensures items with different properties are kept separate
      const key = `${item.itemName.trim().toLowerCase()}-${isCrafted ? 'crafted' : 'regular'}-${hasFortuneTellerBoost ? 'boosted' : 'normal'}`;
      
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          name: item.itemName,
          quantity: item.quantity || 0,
          isCrafted: isCrafted,
          hasFortuneTellerBoost: hasFortuneTellerBoost,
        });
      } else {
        // Only aggregate if they have the same properties
        const existing = itemMap.get(key);
        existing.quantity += (item.quantity || 0);
      }
    }

    // Convert to array and sort alphabetically
    const aggregatedItems = Array.from(itemMap.values()).sort((a, b) => 
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );

    // Format choices with indicators
    choices = aggregatedItems.map((item) => {
      let indicators = '';
      if (item.isCrafted) indicators += '🔨 ';
      if (item.hasFortuneTellerBoost) indicators += '🔮 ';
      // If no special indicators, use box emoji for regular items
      if (!indicators) indicators = '📦 ';
      
      return {
        name: `${indicators}${item.name} - Qty: ${item.quantity}`,
        value: item.name,
      };
    });
   }
 
   await interaction.respond(choices.slice(0, 25));
  } catch (error) {
   handleError(error, "autocompleteHandler.js");
 
   console.error("[handleShopsAutocomplete]: Error:", error);
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
    name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)} | ❤️ ${char.currentHearts || 0} | 🟩 ${char.currentStamina || 0}`,
    value: char.name,
   };
  });

  const filtered = choices.filter((choice) =>
   choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
  );

  return await safeRespondWithValidation(
   interaction,
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
  const modCharacters = await fetchModCharactersByUserId(userId);
  
  // Combine regular characters and mod characters
  const allCharacters = [...userCharacters, ...modCharacters];

  if (!expeditionId) {
   const choices = allCharacters.map((char) => ({
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

  const eligibleCharacters = allCharacters.filter(
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

  return await safeRespondWithValidation(interaction, filtered.slice(0, 25));
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
   // Only show items with quantity > 0
   if (item.quantity <= 0) return false;
   
   // Handle category - could be string or array
   const categories = Array.isArray(item.category) 
     ? item.category 
     : (typeof item.category === 'string' ? item.category.split(",").map(cat => cat.trim().toLowerCase()) : []);
   
   // Handle subtype - could be string or array
   const subtypes = Array.isArray(item.subtype)
     ? item.subtype.map(st => st.trim().toLowerCase())
     : (typeof item.subtype === 'string' ? [item.subtype.trim().toLowerCase()] : []);

   if (type === "weapon") {
    return categories.includes("weapon") && !subtypes.includes("shield");
   } else if (type === "shield") {
    return subtypes.includes("shield");
   } else if (type === "head") {
    return categories.includes("armor") && item.type?.toLowerCase()?.includes("head");
   } else if (type === "chest") {
    return categories.includes("armor") && item.type?.toLowerCase()?.includes("chest");
   } else if (type === "legs") {
    return categories.includes("armor") && item.type?.toLowerCase()?.includes("legs");
   }
   return false;
  });

  const items = filteredItems.map((item) => ({
   name: `${item.itemName} - QTY:${item.quantity}`,
   value: item.itemName,
  }));
  
  // Debug: Log specific items with + character
  const plusItems = items.filter(item => item.value.includes('+'));
  if (plusItems.length > 0) {
    console.log(`[handleGearAutocomplete]: Items with + character:`, plusItems.map(item => ({
      name: item.name,
      value: item.value,
      valueCharCodes: Array.from(item.value).map(c => c.charCodeAt(0)).join(', ')
    })));
  }

  await respondWithFilteredChoices(interaction, focusedOption, items);
 } catch (error) {
  handleError(error, "autocompleteHandler.js");
  console.error("[handleGearAutocomplete]: Error:", error);
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

// ------------------- Help Wanted Quest ID Autocomplete -------------------
async function handleHelpWantedQuestIdAutocomplete(interaction, focusedOption) {
  try {
      // Fetch only available Help Wanted quests (not completed, not expired)
      const HelpWantedQuest = require('../../models/HelpWantedQuestModel');
      const now = new Date();
      const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
      
      const quests = await HelpWantedQuest.find({ 
        completed: false,
        date: today
      }).lean();
      
      // Format quest choices for autocomplete with Quest | Village | Type format
      const choices = quests.map(quest => ({
          name: `${quest.questId} | ${quest.village} | ${quest.type}`, // Quest | Village | Type format
          value: quest.questId // Still use just the quest ID as the value
      }));
      
      // Respond with filtered quest choices
      await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
      handleError(error, "autocompleteHandler.js");
      console.error("[handleHelpWantedQuestIdAutocomplete]: Error:", error);
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

  if (subcommand === 'aid') {
    if (focusedOption.name === "healername") {
      // Autocomplete for user's own healers
      const userCharacters = await fetchCharactersByUserId(userId);
      const modCharacters = await fetchModCharactersByUserId(userId);
      
      // Combine regular characters and mod characters
      const allCharacters = [...userCharacters, ...modCharacters];
      
      const healerCharacters = allCharacters.filter(
        (character) =>
          character.job.toLowerCase() === "healer" ||
          (character.jobVoucher === true &&
            character.jobVoucherJob.toLowerCase() === "healer")
      );

      const choices = healerCharacters.map((character) => ({
        name: `${character.name} - ${character.currentStamina}/${character.maxStamina} 🟩`,
        value: character.name,
                }));
                
                await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (focusedOption.name === "target") {
      // Autocomplete for all characters (can heal any character)
      const allCharacters = await fetchAllCharacters();
      
      const choices = allCharacters.map((character) => ({
        name: `${character.name} - ${character.currentHearts}/${character.maxHearts} ❤️`,
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
    }
  } else if (subcommand === 'request') {
    if (focusedOption.name === "charactername") {
      // Autocomplete for characters owned by the user
      const userCharacters = await fetchCharactersByUserId(userId);
      const modCharacters = await fetchModCharactersByUserId(userId);
      
      // Combine regular characters and mod characters
      const allCharacters = [...userCharacters, ...modCharacters];
      
      const choices = allCharacters.map((character) => ({
        name: `${character.name} - ${character.currentHearts}/${character.maxHearts} ❤️`,
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
        name: `${character.name} - ${character.currentStamina}/${character.maxStamina} 🟩`,
        value: character.name,
                }));
                
                await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } else if (subcommand === 'fulfill') {
    if (focusedOption.name === "healername") {
      // Autocomplete for user's own healers
      const userCharacters = await fetchCharactersByUserId(userId);
      const modCharacters = await fetchModCharactersByUserId(userId);
      
      // Combine regular characters and mod characters
      const allCharacters = [...userCharacters, ...modCharacters];
      
      const healerCharacters = allCharacters.filter(
        (character) =>
          character.job.toLowerCase() === "healer" ||
          (character.jobVoucher === true &&
            character.jobVoucherJob.toLowerCase() === "healer")
      );

      const choices = healerCharacters.map((character) => ({
        name: `${character.name} - ${character.currentStamina}/${character.maxStamina} 🟩`,
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
    const subcommand = interaction.options.getSubcommand();

    // Route based on the subcommand and focused option name
    if (subcommand === 'item' && focusedOption.name === 'name') {
      return await handleLookupItemAutocomplete(interaction, focusedValue);
    } else if (subcommand === 'ingredient' && focusedOption.name === 'name') {
      return await handleLookupIngredientAutocomplete(interaction, focusedValue);
    } else if (subcommand === 'crafting' && focusedOption.name === 'charactername') {
      return await handleLookupCraftingAutocomplete(interaction, focusedValue);
    }

    return await interaction.respond([]);
  } catch (error) {
    console.error('[handleLookupAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
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
    await safeRespondWithError(interaction);
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
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleLookupCraftingAutocomplete -------------------
// Provides autocomplete for character names when checking crafting options
async function handleLookupCraftingAutocomplete(interaction, focusedValue) {
  try {
    const userId = interaction.user.id;
    
    // Get all characters belonging to the user
    const characters = await Character.find({ userId })
      .sort({ name: 1 })
      .select('name currentVillage job')
      .lean();

    if (characters.length === 0) {
      return await interaction.respond([]);
    }

    const choices = characters
      .filter(character => character.name.toLowerCase().includes(focusedValue.toLowerCase()))
      .map(character => ({
        name: `${character.name} | ${capitalize(character.currentVillage || 'Unknown')} | ${capitalize(character.job || 'Unknown')}`,
        value: character.name
      }));

    if (choices.length === 0) {
      return await interaction.respond([]);
    }

    // Respond with filtered choices (limit to 25)
    await interaction.respond(choices.slice(0, 25));
  } catch (error) {
    console.error('[handleLookupCraftingAutocomplete]: Error:', error);
    await safeRespondWithError(interaction);
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
async function handleModPetLevelCharacterAutocomplete(interaction, focusedOption) {
  try {
    // Provides autocomplete suggestions for all characters (admin can target any)
    const characters = await fetchAllCharacters();
    const choices = characters.map((c) => ({
      name: `${c.name} | ${capitalize(c.currentVillage)} | ${capitalize(c.job)}`,
      value: c.name,
    }));
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleModPetLevelCharacterAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- /mod petlevel: Pet Name Autocomplete -------------------
async function handleModPetLevelPetNameAutocomplete(interaction, focusedOption) {
  try {
    const characterName = interaction.options.getString("character");
    if (!characterName) return await interaction.respond([]);

    // Get character from database
    const character = await fetchCharacterByName(characterName);
    if (!character) return await interaction.respond([]);

    // Get all pets for this character
    const pets = await Pet.find({ owner: character._id }).lean();

    if (!pets.length) {
      return await interaction.respond([]);
    }

    // Return pet names with species and level info
    const choices = pets.map((pet) => ({
      name: `${pet.name} | ${pet.species} | ${pet.petType} | Level ${pet.level}`,
      value: pet.name,
    }));
    
    await safeRespondWithValidation(interaction, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleModPetLevelPetNameAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- /mod petlevel: Character Autocomplete (Legacy) -------------------
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
// MOUNT COMMANDS
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

// ------------------- Minigame Character Autocomplete -------------------
// Provides autocomplete suggestions for characters in minigame commands.
async function handleMinigameCharacterAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    
    const choices = characters
      .filter((character) => {
        // Include all characters for minigame participation
        return true;
      })
      .map((character) => ({
        name: `${character.name} | ${capitalize(character.currentVillage)} | ${capitalize(character.job)}`,
        value: character.name,
      }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error(
      "[handleMinigameCharacterAutocomplete]: Error handling minigame character autocomplete:",
      error
    );
    await safeRespondWithError(interaction);
  }
}

// ------------------- Mod Minigame Character Autocomplete -------------------
// Provides autocomplete suggestions for characters in the current minigame session.
async function handleModMinigameCharacterAutocomplete(interaction, focusedOption) {
  try {
    // Get the session ID from the interaction options
    const sessionIdOption = interaction.options.getString('session_id');
    if (!sessionIdOption) {
      await respondWithFilteredChoices(interaction, focusedOption, []);
      return;
    }

    // Extract session ID from autocomplete format if needed
    const sessionIdMatch = sessionIdOption.match(/A\d+/);
    const cleanSessionId = sessionIdMatch ? sessionIdMatch[0] : sessionIdOption;

    // Find the minigame session
    const Minigame = require('../../models/MinigameModel');
    const session = await Minigame.findOne({
      sessionId: cleanSessionId,
      gameType: 'theycame',
      status: { $in: ['waiting', 'active'] }
    });

    if (!session) {
      await respondWithFilteredChoices(interaction, focusedOption, []);
      return;
    }

    // Get characters from the session
    const choices = session.players.map(player => ({
      name: `${player.characterName} | ${player.username}`,
      value: player.characterName,
    }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error(
      "[handleModMinigameCharacterAutocomplete]: Error handling mod minigame character autocomplete:",
      error
    );
    await safeRespondWithError(interaction);
  }
}

// ------------------- Minigame Session ID Autocomplete -------------------
// Provides autocomplete suggestions for active minigame session IDs
async function handleMinigameSessionIdAutocomplete(interaction, focusedOption) {
  try {
    const Minigame = require('../../models/MinigameModel');
    const searchQuery = focusedOption.value?.toLowerCase() || '';
    
    // Find active minigame sessions
    const sessions = await Minigame.find({
      gameType: 'theycame',
      status: { $in: ['waiting', 'active'] }
    }).sort({ createdAt: -1 }).limit(25);
    
    const choices = sessions
      .filter((session) => {
        return session.sessionId.toLowerCase().includes(searchQuery);
      })
      .map((session) => {
        const statusEmoji = session.status === 'waiting' ? '⏳' : '⚔️';
        const playerCount = session.players ? session.players.length : 0;
        const createdAt = new Date(session.createdAt).toLocaleDateString();
        
        return {
          name: `${statusEmoji} ${session.sessionId} | ${playerCount} players | Created: ${createdAt}`,
          value: session.sessionId,
        };
      });

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error(
      "[handleMinigameSessionIdAutocomplete]: Error handling minigame session ID autocomplete:",
      error
    );
    await safeRespondWithError(interaction);
  }
}

// ------------------- Minigame Target Autocomplete -------------------
// Provides autocomplete suggestions for active alien targets in a minigame session
async function handleMinigameTargetAutocomplete(interaction, focusedOption) {
  try {
    const Minigame = require('../../models/MinigameModel');
    let sessionId = interaction.options.getString('session_id');
    const searchQuery = focusedOption.value?.toLowerCase() || '';
    
    if (!sessionId) {
      await interaction.respond([]);
      return;
    }
    
    // Extract session ID from the full display text if needed
    // Handle cases where sessionId might be "⚔ A947783 | 1 players | Expires: 9/6/2025"
    const sessionIdMatch = sessionId.match(/A\d+/);
    if (sessionIdMatch) {
      sessionId = sessionIdMatch[0];
    }
    
    // Find the specific session
    const session = await Minigame.findOne({
      sessionId: sessionId,
      gameType: 'theycame',
      status: { $in: ['waiting', 'active'] }
    });
    
    if (!session || !session.gameData || !session.gameData.aliens) {
      logger.warn('AUTOCOMPLETE', `No session found for ${sessionId}`);
      await interaction.respond([]);
      return;
    }
    
    // Get active aliens (not defeated)
    const activeAliens = session.gameData.aliens.filter(alien => !alien.defeated);
    
    let choices = activeAliens
      .filter((alien) => {
        return alien.id.toLowerCase().includes(searchQuery);
      })
      .map((alien) => {
        const ringNames = ['Outer', 'Middle', 'Inner'];
        const ringName = ringNames[alien.ring - 1] || 'Unknown';
        const difficulty = alien.ring === 1 ? 5 : alien.ring === 2 ? 4 : 3;
        
        return {
          name: `👾 ${alien.id} | ${ringName} Ring | Difficulty: ${difficulty}+`,
          value: alien.id,
        };
      })
      .slice(0, 25); // Limit to 25 choices
    
    // If no active aliens, provide some example targets for reference
    if (choices.length === 0) {
      const exampleTargets = [
        { name: '👾 1A | Outer Ring | Difficulty: 5+', value: '1A' },
        { name: '👾 1B | Outer Ring | Difficulty: 5+', value: '1B' },
        { name: '👾 2A | Middle Ring | Difficulty: 4+', value: '2A' },
        { name: '👾 2B | Middle Ring | Difficulty: 4+', value: '2B' },
        { name: '👾 3A | Inner Ring | Difficulty: 3+', value: '3A' },
        { name: '👾 3B | Inner Ring | Difficulty: 3+', value: '3B' }
      ];
      
      choices = exampleTargets.filter(target => 
        target.value.toLowerCase().includes(searchQuery) || 
        target.name.toLowerCase().includes(searchQuery)
      ).slice(0, 10);
    }

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error(
      "[handleMinigameTargetAutocomplete]: Error handling minigame target autocomplete:",
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
// ------------------- STABLE COMMANDS -------------------
// Autocomplete handlers for /stable command:
// Includes character, mount, pet, and unified name suggestion.
// ============================================================================

// ------------------- Shared Formatter Functions -------------------
// Used to reduce redundancy when formatting autocomplete choices.

function formatCharacterChoice(character) {
  return {
    name: `${character.name} | ${character.currentVillage || 'Unknown'} | ${character.job || 'Unknown'}`,
    value: character.name
  };
}

function formatMountChoice(mount) {
  return {
    name: `🟫 ${mount.name} | ${mount.species} | ${mount.level}`,
    value: mount.name
  };
}

function formatPetChoice(pet) {
  return {
    name: `🟪 ${pet.name} | ${pet.species} | ${pet.petType} | Lv.${pet.level}`,
    value: pet.name
  };
}

// ------------------- Function: handleStableCharacterAutocomplete -------------------
// Suggests user-owned characters formatted as Name | Village | Job.
async function handleStableCharacterAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const searchQuery = focusedOption.value.toLowerCase();
    const characters = await Character.find({ userId });

    const choices = characters
      .map(formatCharacterChoice)
      .filter(choice => choice.name.toLowerCase().includes(searchQuery));

    await safeRespondWithValidation(interaction, choices);
  } catch (error) {
    console.error('[autocompleteHandler]: Error in handleStableCharacterAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleStableMountNameAutocomplete -------------------
// Suggests mounts and pets owned by selected character for /stable store autocomplete.
async function handleStableMountNameAutocomplete(interaction, focusedOption) {
  try {
    const characterNameRaw = interaction.options.getString("charactername");
    const subcommand = interaction.options.getSubcommand();

    if (!characterNameRaw) {
      return await interaction.respond([]);
    }

    // Extract just the name part if it includes village and job
    const cleanCharacterName = characterNameRaw.split('|')[0].trim();

    // Get character from database
    const character = await Character.findOne({ name: cleanCharacterName });
    if (!character) {   
        return await interaction.respond([]);
    }

    // Get stable
    const stable = await Stable.findOne({ characterId: character._id });
    if (!stable) {
        return await interaction.respond([]);
    }

    let mounts = [];
    let pets = [];

    if (subcommand === 'retrieve') {
        // For retrieve, only show stored companions
        const storedMountIds = stable.storedMounts.map(m => m.mountId);
        const storedPetIds = stable.storedPets.map(p => p.petId);
        
        [mounts, pets] = await Promise.all([
            Mount.find({ _id: { $in: storedMountIds } }),
            Pet.find({ _id: { $in: storedPetIds } })
        ]);
    } else if (subcommand === 'sell') {
        // For sell, show all owned companions that aren't already for sale
        // This includes both active and stored companions
        const storedMountIds = stable.storedMounts.map(m => m.mountId);
        const storedPetIds = stable.storedPets.map(p => p.petId);
        
        [mounts, pets] = await Promise.all([
            Mount.find({
                $or: [
                    { owner: cleanCharacterName, status: { $ne: 'for_sale' } },
                    { _id: { $in: storedMountIds }, status: { $ne: 'for_sale' } }
                ]
            }),
            Pet.find({
                $or: [
                    { ownerName: cleanCharacterName, status: { $ne: 'for_sale' } },
                    { _id: { $in: storedPetIds }, status: { $ne: 'for_sale' } }
                ]
            })
        ]);
    } else {
        // For other commands, show all owned companions
        [mounts, pets] = await Promise.all([
            Mount.find({ owner: cleanCharacterName }),
            Pet.find({ ownerName: cleanCharacterName })
        ]);
    }

    // Format choices with status indicators
    const mountChoices = mounts.map(mount => ({
      name: `🐴 ${mount.name} | ${mount.species} | ${mount.level}${mount.status === 'stored' ? ' (Stored)' : ''}`,
      value: mount.name
    }));
    const petChoices = pets.map(pet => ({
      name: `🐾 ${pet.name} | ${pet.species} | ${pet.petType} | Lv.${pet.level}${pet.status === 'stored' ? ' (Stored)' : ''}`,
      value: pet.name
    }));

    // Filter by user input
    const query = focusedOption.value?.toLowerCase() || "";
    const choices = [...mountChoices, ...petChoices]
      .filter(choice => choice.name.toLowerCase().includes(query))
      .slice(0, 25);

    await safeRespondWithValidation(interaction, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js", {
      operation: "handleStableMountNameAutocomplete",
      userId: interaction.user.id,
      interactionId: interaction.id
    });
    console.error(`[autocompleteHandler.js]: ❌ Error in handleStableMountNameAutocomplete: ${error.stack}`);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleStablePetNameAutocomplete -------------------
// Suggests pets owned by selected character with species and level.
async function handleStablePetNameAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characterName = interaction.options.getString("charactername");
    if (!characterName) return await interaction.respond([]);

    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) return await interaction.respond([]);

    const pets = await Pet.find({ owner: character._id });
    const query = focusedOption.value?.toLowerCase() || "";

    const choices = pets
      .map(formatPetChoice)
      .filter(choice => choice.name.toLowerCase().includes(query))
      .slice(0, 25);

    await safeRespondWithValidation(interaction, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js", {
      operation: "handleStablePetNameAutocomplete",
      character: characterName,
      userId: interaction.user.id
    });
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleStableNameAutocomplete -------------------
// Suggests both mounts and pets in a single dropdown for a given character.
async function handleStableNameAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characterName = interaction.options.getString("charactername");
    if (!characterName) return await interaction.respond([]);

    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) return await interaction.respond([]);

    const [mounts, pets] = await Promise.all([
      Mount.find({ owner: character.name }),
      Pet.find({ owner: character._id })
    ]);

    const query = focusedOption.value?.toLowerCase() || "";

    const choices = [...mounts.map(formatMountChoice), ...pets.map(formatPetChoice)]
      .filter(choice => choice.name.toLowerCase().includes(query))
      .slice(0, 25);

    await safeRespondWithValidation(interaction, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js", {
      operation: "handleStableNameAutocomplete",
      character: characterName,
      userId: interaction.user.id
    });
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
    await safeRespondWithError(interaction);
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
 } else if (subcommand === "store") {
  // For store command, only show active pets
  pets = await Pet.find({ owner: character._id, status: "active" }).lean();
 } else if (subcommand === "roll") {
  // For roll command, only show active pets (not stored)
  pets = await Pet.find({ owner: character._id, status: "active" }).lean();
 } else {
  // For other commands (upgrade, view, edit), show all pets
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
  name: `${pet.name} | ${pet.petType}`,
  value: pet.name,
 }));
                await respondWithFilteredChoices(interaction, focusedOption, choices);
}

// ------------------- Pet Species Autocomplete -------------------
async function handlePetSpeciesAutocomplete(interaction, focusedOption) {
 // grab the category they've already selected (defaults to 'normal')
 const category = interaction.options.getString("category") || "normal";

 // choose only the normal or special species
 let speciesList;
 if (category === "special") {
  // Include special pets plus smallspecial and largespecial
  speciesList = [...Object.keys(specialPets), 'smallspecial', 'largespecial'];
 } else {
  // Normal pets only
  speciesList = Object.keys(normalPets);
 }

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
                const profession = NPCs[npc].profession;
                let role = profession;
                
                if (npc === 'Lil Tim') {
                    role = 'Cucco';
                }
                
                return {
                    name: `${npc} | ${role}`,
                    value: npc
                };
            }).slice(0, 25); // Limit to 25 choices

            await safeRespondWithValidation(interaction, choices);
        } else if (targetType === 'player') {
            const characters = await Character.find({ canBeStolenFrom: true });
            const filteredCharacters = characters.filter(char => 
                char.name.toLowerCase().includes(focusedOption.value.toLowerCase())
            );

            const choices = filteredCharacters.map(char => ({
                  name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
                  value: char.name
                })).slice(0, 25); // Limit to 25 choices
                
            await safeRespondWithValidation(interaction, choices);
        }
    } catch (error) {
        handleError(error, "autocompleteHandler.js", {
            commandName: "steal",
            userTag: interaction.user.tag,
            userId: interaction.user.id,
            options: {
                targetType: interaction.options.getString('targettype'),
                focusedValue: focusedOption.value
            }
        });
        console.error(`[autocompleteHandler.js]: ❌ Error in handleStealTargetAutocomplete:`, error);
        await safeRespondWithError(interaction);
    }
}

// ------------------- Steal Rarity Autocomplete -------------------
async function handleStealRarityAutocomplete(interaction, focusedOption) {
    try {
        const choices = ['common', 'uncommon'];
        const filtered = choices.filter((choice) =>
            choice.toLowerCase().startsWith(focusedOption.value.toLowerCase())
        ).slice(0, 25); // Limit to 25 choices

        await interaction.respond(
            filtered.map(choice => ({
                name: choice.charAt(0).toUpperCase() + choice.slice(1),
                value: choice
            }))
        );
    } catch (error) {
        handleError(error, "autocompleteHandler.js", {
            commandName: "steal",
            userId: interaction.user.id,
            options: {
                focusedValue: focusedOption.value
            }
        });
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
async function handleTravelAutocomplete(interaction, focusedOption) {
  try {
    // Safety check: ensure interaction is valid and not already responded to
    if (!interaction || !interaction.isAutocomplete()) {
      console.log('[autocompleteHandler.js]: ⚠️ Invalid interaction in handleTravelAutocomplete');
      return;
    }

    if (interaction.responded) {
      console.log('[autocompleteHandler.js]: ⚠️ Interaction already responded to in handleTravelAutocomplete');
      return;
    }

    if (focusedOption.name === "charactername") {
      try {
        const characters = await fetchCharactersByUserId(interaction.user.id);
        
        if (!characters || characters.length === 0) {
          return await safeAutocompleteResponse(interaction, []);
        }

        const choices = characters.map(char => ({
          name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
          value: char.name
        }));
        
        return await safeAutocompleteResponse(interaction, choices);
      } catch (fetchError) {
        console.error('[autocompleteHandler.js]: ❌ Error fetching characters:', fetchError);
        await safeRespondWithError(interaction);
      }
    } else if (focusedOption.name === "destination") {
      try {
        const villages = getAllVillages();
        
        if (!villages || !Array.isArray(villages) || villages.length === 0) {
          console.warn('[autocompleteHandler.js]: ⚠️ No villages found or invalid village data');
          return await safeAutocompleteResponse(interaction, []);
        }

        const choices = villages.map(village => ({
          name: capitalize(village),
          value: village.toLowerCase()
        }));
        
        return await safeAutocompleteResponse(interaction, choices);
      } catch (villageError) {
        console.error('[autocompleteHandler.js]: ❌ Error fetching villages:', villageError);
        await safeRespondWithError(interaction, villageError);
      }
    } else {
      return await safeAutocompleteResponse(interaction, []);
    }
  } catch (error) {
    console.error('[autocompleteHandler.js]: ❌ Error in handleTravelAutocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Travel Destination Village Autocomplete -------------------
async function handleVillageBasedCommandsAutocomplete(
 interaction,
 focusedOption
) {
 try {
  // Safety check: ensure interaction is valid and not already responded to
  if (!interaction || !interaction.isAutocomplete()) {
    console.log('[autocompleteHandler.js]: ⚠️ Invalid interaction in handleVillageBasedCommandsAutocomplete');
    return;
  }

  if (interaction.responded) {
    console.log('[autocompleteHandler.js]: ⚠️ Interaction already responded to in handleVillageBasedCommandsAutocomplete');
    return;
  }

  const villages = getAllVillages();
  
  if (!villages || !Array.isArray(villages) || villages.length === 0) {
    console.warn('[autocompleteHandler.js]: ⚠️ No villages found or invalid village data in handleVillageBasedCommandsAutocomplete');
    return await safeAutocompleteResponse(interaction, []);
  }

  const choices = villages.map((village) => ({
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
  // Check both shopPouch and vendingSetup.pouchType (dashboard method)
  const pouchType = character.shopPouch?.toLowerCase() || character.vendingSetup?.pouchType?.toLowerCase();
  const extraSlots = pouchCapacities[pouchType] || 0;
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

    // Only show limited items if in stock - for both "add" and "restock" subcommands
    const vendingSubcommand = interaction.options.getSubcommand();
    if (stockList?.limitedItems && interaction.commandName === "vending" && (vendingSubcommand === "add" || vendingSubcommand === "restock")) {
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

    // Get used slots with their items
    if (!dbConfig.vending) {
      return await interaction.respond([]);
    }
    
    const { initializeVendingInventoryModel } = require('../../models/VendingModel');
    const VendingInventory = await initializeVendingInventoryModel(characterName);
    const items = await VendingInventory.find({}).lean();

    // Create a map of slot => item info (only slots with items)
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

    // Calculate total available slots
    const totalSlots = calculateAvailableSlots(character);

    // Generate slot options - show ALL slots, including empty ones
    const slotChoices = [];
    for (let i = 1; i <= totalSlots; i++) {
      const slotName = `Slot ${i}`;
      const slotInfo = slotMap.get(slotName);
      
      if (slotInfo) {
        // Slot has an item
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
        // Slot is empty
        slotChoices.push({
          name: `${slotName} – Empty`,
          value: slotName
        });
      }
    }
    
    // Sort slots by slot number for better UX
    slotChoices.sort((a, b) => {
      const aNum = parseInt(a.value.match(/\d+/)?.[0] || '0', 10);
      const bNum = parseInt(b.value.match(/\d+/)?.[0] || '0', 10);
      return aNum - bNum;
    });

    // Enhanced filtering with search functionality for Discord's 25 choice limit
    const searchQuery = (focusedOption.value || '').toLowerCase().trim();
    
    let filteredSlots;
    if (!searchQuery) {
      // If no search query, show first 25 slots
      filteredSlots = slotChoices.slice(0, 25);
    } else {
      // Filter slots based on search query
      // Users can search by: slot number (e.g., "4", "slot 4"), item name, or any part of the display
      filteredSlots = slotChoices
        .map(slot => {
          // Extract slot number and item name for better matching
          const slotNum = slot.value.match(/\d+/)?.[0] || '';
          const itemName = slot.name.split('–')[1]?.trim() || '';
          
          // Calculate match score for prioritization
          let score = 0;
          const lowerName = slot.name.toLowerCase();
          
          // Exact slot number match gets highest priority
          if (slotNum === searchQuery || `slot ${slotNum}` === searchQuery) {
            score = 1000;
          }
          // Slot number starts with query
          else if (slotNum.startsWith(searchQuery)) {
            score = 500;
          }
          // Item name starts with query (including "empty")
          else if (itemName.toLowerCase().startsWith(searchQuery)) {
            score = 300;
          }
          // Match "empty" slots
          else if (itemName.toLowerCase() === 'empty' && (searchQuery === 'empty' || searchQuery === 'e')) {
            score = 250;
          }
          // Slot number contains query
          else if (slotNum.includes(searchQuery)) {
            score = 200;
          }
          // Item name contains query
          else if (itemName.toLowerCase().includes(searchQuery)) {
            score = 100;
          }
          // Any part of the name contains query
          else if (lowerName.includes(searchQuery)) {
            score = 50;
          }
          
          return { slot, score };
        })
        .filter(item => item.score > 0) // Only include matches
        .sort((a, b) => b.score - a.score) // Sort by match score (best matches first)
        .map(item => item.slot) // Extract just the slot choices
        .slice(0, 25); // Limit to Discord's 25 choice limit
    }

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
                const characters = await fetchCharactersByUserId(userId);
                
    const choices = characters.map(char => ({
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
      
      // Filter for only characters with vendor types (vendor/merchant/shopkeeper) in either vendorType or job
      const vendorCharacters = characters.filter(character => {
        const vendorType = character.vendorType?.toLowerCase();
        const job = character.job?.toLowerCase();
        const validVendorTypes = ['vendor', 'merchant', 'shopkeeper'];
        return validVendorTypes.includes(vendorType) || validVendorTypes.includes(job);
                });
                
                const choices = vendorCharacters.map(char => ({
        name: `${char.name} | ${char.currentVillage || 'No Village'} | ${char.vendorType || char.job || 'Vendor'}`,
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
      if (!dbConfig.vending) {
        await interaction.respond([]);
        return;
      }
      
      const { initializeVendingInventoryModel } = require('../../models/VendingModel');
      const VendingInventory = await initializeVendingInventoryModel(targetCharacter);
      const vendingItems = await VendingInventory.find({}).lean();

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

// ------------------- Function: handleVendingOfferAutocomplete -------------------
// Provides autocomplete suggestions for items from the buyer's inventory for barter offers
async function handleVendingOfferAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const buyerCharacterName = interaction.options.getString("charactername");
    const searchQuery = focusedOption.value?.toLowerCase() || "";

    // Need the buyer's character name to get their inventory
    if (!buyerCharacterName) {
      await interaction.respond([]);
      return;
    }

    // Get the buyer's character to verify ownership
    const buyerCharacter = await fetchCharacterByNameAndUserId(buyerCharacterName, userId);
    if (!buyerCharacter) {
      await interaction.respond([]);
      return;
    }

    // Get items from buyer's inventory
    const inventoryCollection = await getCharacterInventoryCollection(buyerCharacterName);
    const items = await inventoryCollection.find().toArray();

    // Aggregate by name, exclude 'Initial Item' and items with quantity <= 0
    const itemMap = new Map();
    for (const item of items) {
      if (!item.itemName || item.itemName.toLowerCase() === 'initial item') continue;
      if (item.quantity <= 0) continue; // Skip items with zero quantity
      const key = item.itemName.trim().toLowerCase();
      if (!itemMap.has(key)) {
        itemMap.set(key, { name: item.itemName, quantity: item.quantity });
      } else {
        itemMap.get(key).quantity += item.quantity;
      }
    }

    // Format choices with quantity
    const choices = Array.from(itemMap.values()).map(item => ({
      name: `${capitalizeWords(item.name)} (Qty: ${item.quantity})`,
      value: item.name
    }));

    // Filter based on search query
    const filtered = choices.filter(choice => 
      choice.name.toLowerCase().includes(searchQuery) || 
      choice.value.toLowerCase().includes(searchQuery)
    );

    await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    // Handle specific error types
    if (error.code === 10062) {
      console.log('[handleVendingOfferAutocomplete]: Interaction already expired');
      return;
    }

    console.error("[handleVendingOfferAutocomplete]: Error:", error);
    try {
      await interaction.respond([]).catch(() => {});
    } catch (e) {
      // Ignore any errors from the fallback response
    }
  }
}

// ------------------- Function: handleVendingViewAutocomplete -------------------
// Provides autocomplete suggestions for viewing a vendor's shop
// Shows all vendors (shopkeeper/merchant) in the system
async function handleVendingViewAutocomplete(interaction, focusedOption) {
  try {
    // Fetch all characters from the database
    const characters = await fetchAllCharacters();

    // Filter for all characters with vending jobs (shopkeeper or merchant)
    // This shows all vendors in the system regardless of setup status
    const vendorCharacters = characters.filter(character => {
      const job = character.job?.toLowerCase();
      return job === 'shopkeeper' || job === 'merchant';
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

    await safeRespondWithValidation(interaction, filteredChoices.slice(0, 25));
  } catch (error) {
    console.error("[handleVendingViewAutocomplete]: Error:", error);
    await safeAutocompleteResponse(interaction, []);
  }
}

// ------------------- Function: handleVendingAcceptFulfillmentIdAutocomplete -------------------
// Provides autocomplete suggestions for fulfillment IDs when accepting vending requests
async function handleVendingAcceptFulfillmentIdAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const searchQuery = focusedOption.value?.toLowerCase() || "";
    
    // Get all characters owned by the user (these are potential vendors)
    const userCharacters = await fetchCharactersByUserId(userId);
    const vendorCharacterNames = userCharacters.map(char => char.name);
    
    if (vendorCharacterNames.length === 0) {
      await interaction.respond([]);
      return;
    }
    
    // Find all pending vending requests where the vendor is one of the user's characters
    // Exclude completed, expired, and failed requests
    const pendingRequests = await VendingRequest.find({
      vendorCharacterName: { $in: vendorCharacterNames },
      status: { $in: ['pending', 'processing'] } // Only show pending or processing requests
    }).sort({ date: -1 }).limit(50); // Get most recent 50 requests
    
    // Filter and format requests based on search query
    const choices = pendingRequests
      .filter(request => {
        // Match against fulfillment ID, item name, buyer name, or buyer username
        const fulfillmentIdMatch = request.fulfillmentId?.toLowerCase().includes(searchQuery);
        const itemNameMatch = request.itemName?.toLowerCase().includes(searchQuery);
        const buyerNameMatch = request.userCharacterName?.toLowerCase().includes(searchQuery);
        const buyerUsernameMatch = request.buyerUsername?.toLowerCase().includes(searchQuery);
        
        return fulfillmentIdMatch || itemNameMatch || buyerNameMatch || buyerUsernameMatch;
      })
      .map(request => {
        // Format: "FulfillmentID | Item xQty | Buyer | Payment"
        const paymentEmoji = request.paymentMethod === 'tokens' ? '💰' : 
                            request.paymentMethod === 'art' ? '🎨' : '🔄';
        const paymentDisplay = request.paymentMethod === 'tokens' ? 'Tokens' : 
                              request.paymentMethod === 'art' ? 'Art' : 'Barter';
        
        return {
          name: `${request.fulfillmentId} | ${request.itemName} ×${request.quantity} | ${request.userCharacterName} | ${paymentEmoji} ${paymentDisplay}`,
          value: request.fulfillmentId
        };
      });
    
    await interaction.respond(choices.slice(0, 25));
  } catch (error) {
    console.error("[handleVendingAcceptFulfillmentIdAutocomplete]: Error:", error);
    try {
      await interaction.respond([]);
    } catch (e) {
      // Ignore errors if interaction already expired
    }
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
    
    // Fetch both regular characters and mod characters owned by the user
    const [characters, modCharacters] = await Promise.all([
      fetchCharactersByUserId(userId),
      fetchModCharactersByUserId(userId)
    ]);

    // Map regular characters to autocomplete choices with formatted display
    const regularChoices = characters.map((character) => ({
      name: `${character.name} | ${capitalize(character.currentVillage || 'No Village')} | ${capitalize(character.job || 'No Job')}`,
      value: character.name
    }));

    // Map mod characters to autocomplete choices with formatted display (including mod title)
    const modChoices = modCharacters.map((character) => ({
      name: `${character.name} | ${capitalize(character.currentVillage || 'No Village')} | ${character.modTitle} (${character.modType})`,
      value: character.name
    }));

    // Combine all choices
    const allChoices = [...regularChoices, ...modChoices];

    // Sort choices alphabetically by name
    allChoices.sort((a, b) => a.name.localeCompare(b.name));

    // Filter based on user input
    const searchQuery = focusedOption.value?.toLowerCase() || "";
    const filteredChoices = allChoices.filter(choice => 
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

// ------------------- Handle Spirit Orb Character Autocomplete -------------------
async function handleSpiritOrbCharacterAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const searchQuery = focusedOption.value.toLowerCase();

    const characters = await Character.find({
      userId,
      name: { $regex: searchQuery, $options: 'i' }
    }).limit(25);

    const choices = characters.map(character => ({
      name: `${character.name} | ${capitalize(character.currentVillage || 'Unknown')} | ${capitalize(character.job || 'Unknown')}`,
      value: character.name
    }));

    await safeRespondWithValidation(interaction, choices);
  } catch (error) {
    handleError(error, 'autocompleteHandler.js');
    await safeRespondWithError(interaction, error);
  }
}

// ============================================================================
// MOD CHARACTER COMMANDS
// ============================================================================
// This section handles autocomplete interactions for the "/modcharacter" command.
// It provides suggestions for job selection and mod character names.

// ------------------- Mod Character Job Autocomplete -------------------
// Provides autocomplete suggestions for job selection when creating mod characters.
async function handleModCharacterJobAutocomplete(interaction, focusedOption) {
  try {
    // Get all jobs from all categories
    const generalJobs1 = getGeneralJobsPage(1);
    const generalJobs2 = getGeneralJobsPage(2);
    const inarikoJobs = getVillageExclusiveJobs('inariko');
    const rudaniaJobs = getVillageExclusiveJobs('rudania');
    const vhintlJobs = getVillageExclusiveJobs('vhintl');
    
    const allJobs = [
      ...generalJobs1,
      ...generalJobs2,
      ...inarikoJobs,
      ...rudaniaJobs,
      ...vhintlJobs
    ];

    // Add mod character titles as valid jobs
    const modTitles = ['Oracle', 'Dragon', 'Sage'];
    allJobs.push(...modTitles);

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
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleMonsterAutocomplete -------------------
// Provides autocomplete suggestions for monster names
async function handleMonsterAutocomplete(interaction, focusedOption) {
  try {
    const Monster = require('../../models/MonsterModel');
    const searchQuery = focusedOption.value.toLowerCase();
    
    // Fetch monsters from database
    const monsters = await Monster.find({
      $or: [
        { name: { $regex: searchQuery, $options: 'i' } },
        { nameMapping: { $regex: searchQuery, $options: 'i' } }
      ]
    }).limit(25);
    
    const choices = monsters.map(monster => ({
      name: `${monster.name} (T${monster.tier})`,
      value: monster.name
    }));

    await safeRespondWithValidation(interaction, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleMonsterAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleSubmitCollabAutocomplete -------------------
// Provides autocomplete suggestions for collaboration partners in submit command
async function handleSubmitCollabAutocomplete(interaction, focusedOption) {
  try {
    const searchQuery = focusedOption.value?.toLowerCase() || '';
    
    // Get all members in the guild
    const guild = interaction.guild;
    if (!guild) {
      return await safeAutocompleteResponse(interaction, []);
    }

    // Fetch all members from the guild
    const members = await guild.members.fetch();
    
    // Filter members based on search query and exclude the current user
    const filteredMembers = members
      .filter(member => {
        const memberName = member.user.username.toLowerCase();
        const memberDisplayName = member.displayName.toLowerCase();
        const currentUserId = interaction.user.id;
        
        // Exclude the current user and include only those matching the search
        return member.id !== currentUserId && 
               (memberName.includes(searchQuery) || memberDisplayName.includes(searchQuery));
      })
      .slice(0, 25); // Limit to 25 choices

    // Format choices for autocomplete
    const choices = filteredMembers.map(member => ({
      name: `${member.displayName} (@${member.user.username})`,
      value: `<@${member.id}>`
    }));

    await safeRespondWithValidation(interaction, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleSubmitCollabAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleTaggedCharactersAutocomplete -------------------
// Provides autocomplete suggestions for ALL characters when tagging in submissions
async function handleTaggedCharactersAutocomplete(interaction, focusedOption) {
  try {
    const searchQuery = focusedOption.value?.toLowerCase() || '';
    
    // Fetch ALL characters from the database (not just user-owned)
    const characters = await fetchAllCharacters();
    
    // Filter characters based on search query
    const filteredCharacters = characters
      .filter(character => {
        const characterName = character.name.toLowerCase();
        return characterName.includes(searchQuery);
      })
      .slice(0, 25); // Discord limit
    
    
    // Map characters to choices (just character names)
    const choices = filteredCharacters.map(character => ({
      name: character.name,
      value: character.name
    }));
    
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleTaggedCharactersAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleTier5PlusMonsterAutocomplete -------------------
// Provides autocomplete suggestions for tier 5+ monster names
async function handleTier5PlusMonsterAutocomplete(interaction, focusedOption) {
  try {
    const Monster = require('../../models/MonsterModel');
    const searchQuery = focusedOption.value.toLowerCase();
    
    // Fetch tier 5+ monsters from database
    const monsters = await Monster.find({
      tier: { $gte: 5 },
      $or: [
        { name: { $regex: searchQuery, $options: 'i' } },
        { nameMapping: { $regex: searchQuery, $options: 'i' } }
      ]
    }).limit(25);
    
    const choices = monsters.map(monster => ({
      name: `${monster.name} (T${monster.tier})`,
      value: monster.name
    }));

    await safeRespondWithValidation(interaction, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleTier5PlusMonsterAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Function: handleBlightOverrideTargetAutocomplete -------------------
// Provides autocomplete suggestions for blight override targets (characters, villages, or "all")
async function handleBlightOverrideTargetAutocomplete(interaction, focusedOption) {
  try {
    const action = interaction.options.getString('action');
    const searchQuery = focusedOption.value?.toLowerCase() || '';
    
    let choices = [];

    if (action === 'wipe_all' || action === 'set_all_level') {
      // For all-target actions, suggest "all" as the only option
      choices = [
        { name: 'All Characters', value: 'all' }
      ];
    } else if (action === 'wipe_village' || action === 'set_village_level') {
      // For village-target actions, suggest village names
      const villages = ['rudania', 'inariko', 'vhintl'];
      choices = villages
        .filter(village => village.toLowerCase().includes(searchQuery))
        .map(village => ({
          name: capitalize(village),
          value: village
        }));
    } else if (action === 'wipe_character' || action === 'set_character_level') {
      // For character-target actions, suggest all characters
      const characters = await fetchAllCharacters();
      choices = characters
        .filter(char => char.name.toLowerCase().includes(searchQuery))
        .map(char => ({
          name: `${char.name} | ${capitalize(char.currentVillage)} | ${capitalize(char.job)}`,
          value: char.name
        }))
        .slice(0, 25); // Limit to 25 choices
    }

    await safeRespondWithValidation(interaction, choices);
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleBlightOverrideTargetAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Mod Character Name Autocomplete -------------------
// Provides autocomplete suggestions for mod character names owned by the user.
async function handleModCharacterNameAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    
    // Fetch mod characters owned by the user
    const modCharacters = await fetchModCharactersByUserId(userId);
    
    if (!modCharacters || modCharacters.length === 0) {
      return await interaction.respond([]);
    }

    // Map mod characters to autocomplete choices
    const choices = modCharacters.map((character) => ({
      name: `${character.name} | ${character.modTitle} of ${character.modType}`,
      value: character.name,
    }));

    // Filter based on user input
    const searchQuery = focusedOption.value?.toLowerCase() || "";
    const filteredChoices = choices.filter(choice => 
      choice.name.toLowerCase().includes(searchQuery)
    );

    await interaction.respond(filteredChoices.slice(0, 25));
  } catch (error) {
    // Simple error handling - just try to respond with empty array
    try {
      if (!interaction.responded) {
        await interaction.respond([]);
      }
    } catch (respondError) {
      // Ignore respond errors - interaction likely expired
    }
  }
}

// ------------------- Mod Character Functions -------------------
handleModCharacterJobAutocomplete,
handleModCharacterNameAutocomplete,

// ------------------- Raid Functions -------------------
handleRaidIdAutocomplete,

// ------------------- Table Roll Functions -------------------
handleTableRollNameAutocomplete,

// ------------------- Submit Functions -------------------
handleSubmitCollabAutocomplete,

module.exports = {
 handleAutocomplete,
 handleEconomyAutocomplete,
 handleCharacterBasedCommandsAutocomplete,
 handleExploreCharacterAutocomplete,
 handleQuestIdAutocomplete,
 handleHelpWantedQuestIdAutocomplete,

 // ------------------- Character-Based Functions -------------------
 // ------------------- Blight Functions -------------------
 handleBlightCharacterAutocomplete,
 handleBlightItemAutocomplete,

 // ------------------- Boosting Functions -------------------
   handleBoostingCharacterAutocomplete,
  handleBoostingRequestCharacterAutocomplete,
  handleBoostingRequestBoosterAutocomplete,
  handleBoostingVillageAutocomplete,
  handleBoostingAcceptCharacterAutocomplete,
  handleBoostingRequestIdAutocomplete,
  handleBoostingStatusCharacterAutocomplete,
 handleBoostingOtherCharacterAutocomplete,

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

// ------------------- Mod PetLevel Functions -------------------
handleModPetLevelCharacterAutocomplete,
handleModPetLevelPetNameAutocomplete,

 // ------------------- Mod Character Functions -------------------
 handleModCharacterJobAutocomplete,
 handleModCharacterNameAutocomplete,

 // ------------------- Submit Functions -------------------
 handleSubmitCollabAutocomplete,

// ------------------- Monster Functions -------------------
handleMonsterAutocomplete,
handleTier5PlusMonsterAutocomplete,

// ------------------- Blight Override Functions -------------------
handleBlightOverrideTargetAutocomplete,

 // ------------------- Mount/Stable Functions -------------------
 handleMountAutocomplete,
 handleMountNameAutocomplete,
 
 // ------------------- Minigame Functions -------------------
 handleMinigameCharacterAutocomplete,
 handleModMinigameCharacterAutocomplete,
 
 handleStableCharacterAutocomplete,
 handleStableMountNameAutocomplete,
 handleStablePetNameAutocomplete,

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

// ------------------- Table Roll Name Autocomplete -------------------
// Provides autocomplete suggestions for table roll names.
async function handleTableRollNameAutocomplete(interaction, focusedOption) {
  try {
    // Import the TableRoll model
    const TableRoll = require('../../models/TableRollModel');
    
    // Get the search query from the focused option
    const searchQuery = focusedOption.value?.toLowerCase() || "";
    
    // Find active table rolls
    const tableRolls = await TableRoll.find({ 
      isActive: true
    }).select('name createdBy totalWeight entries createdAt').limit(25);
    
    if (!tableRolls || tableRolls.length === 0) {
      return await interaction.respond([]);
    }

    // Map table rolls to autocomplete choices - just show the table name
    const choices = tableRolls.map((table) => {
      return {
        name: table.name,
        value: table.name,
      };
    });

    // Filter based on user input (search by name)
    const filteredChoices = choices.filter(choice => 
      choice.name.toLowerCase().includes(searchQuery)
    );

    await interaction.respond(filteredChoices.slice(0, 25));
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleTableRollNameAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Raid ID Autocomplete -------------------
// Provides autocomplete suggestions for active raid IDs.
async function handleRaidIdAutocomplete(interaction, focusedOption) {
  try {
    // Import the Raid model
    const Raid = require('../../models/RaidModel');
    
    // Get the search query from the focused option
    const searchQuery = focusedOption.value?.toLowerCase() || "";
    
    // Find active raids
    const activeRaids = await Raid.find({ 
      status: 'active',
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).select('raidId village monster.name monster.tier createdAt').limit(25);
    
    if (!activeRaids || activeRaids.length === 0) {
      return await interaction.respond([]);
    }

    // Map raids to autocomplete choices
    const choices = activeRaids.map((raid) => {
      const villageName = raid.village;
      const monsterName = raid.monster.name;
      const tier = raid.monster.tier;
      const raidId = raid.raidId;
      
      return {
        name: `${raidId} | ${monsterName} (T${tier}) in ${villageName}`,
        value: raidId,
      };
    });

    // Filter based on user input (search by raid ID, monster name, or village)
    const filteredChoices = choices.filter(choice => 
      choice.name.toLowerCase().includes(searchQuery) ||
      choice.value.toLowerCase().includes(searchQuery)
    );

    await interaction.respond(filteredChoices.slice(0, 25));
  } catch (error) {
    handleError(error, "autocompleteHandler.js");
    console.error("[handleRaidIdAutocomplete]: Error:", error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Mod Character Functions -------------------


