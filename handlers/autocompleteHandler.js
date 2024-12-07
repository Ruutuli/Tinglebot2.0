// ------------------- Autocomplete Handler for Various Commands -------------------

// Import necessary modules and functions
const { connectToTinglebot } = require('../database/connection');
const { fetchUserIdByUsername } = require('../database/userService');
const {
  fetchCharactersByUserId,
  fetchCharacterByNameAndUserId,
  getCharacterInventoryCollection,
  fetchAllCharactersExceptUser,
  fetchCharacterByName,
  fetchAllCharacters
} = require('../database/characterService');
const { fetchItemByName, fetchCraftableItemsAndCheckMaterials } = require('../database/itemService');
const Item = require('../models/ItemModel');
const { getAllRaces } = require('../modules/raceModule');
const { getJobPerk } = require('../modules/jobsModule');
const { getAllVillages } = require('../modules/locationsModule');
const { capitalize } = require('../modules/formattingModule');
const { getModCharacterByName, modCharacters } = require('../modules/modCharacters');
const { loadBlightSubmissions } = require('../handlers/blightHandler');
const { distractionItems, staminaRecoveryItems } = require('../modules/mountModule');
const ItemModel = require('../models/ItemModel')
const Party = require('../models/PartyModel');

// ------------------- Main Function to Handle Autocomplete Interactions -------------------
async function handleAutocomplete(interaction) {
  try {
    await connectToTinglebot(); // Ensure MongoDB connection

    const focusedOption = interaction.options.getFocused(true); // Get the focused option from the interaction
    const commandName = interaction.commandName; // Get the command name from the interaction

// ------------------- Route based on command name and focused option -------------------
if (commandName === 'vending') {
  await handleVendingAutocomplete(interaction, focusedOption);
}  else if (commandName === 'blight' && focusedOption.name === 'character_name') {
    await handleBlightCharacterAutocomplete(interaction, focusedOption);
} else if (commandName === 'transfer') {
  await handleTransferAutocomplete(interaction, focusedOption);
} else if (commandName === 'gift') {
  await handleGiftAutocomplete(interaction, focusedOption);
} else if (commandName === 'trade') {
  await handleTradeAutocomplete(interaction, focusedOption);
} else if (commandName === 'lookup' && (focusedOption.name === 'item' || focusedOption.name === 'ingredient')) {
  await handleLookupAutocomplete(interaction, focusedOption);
} else if (commandName === 'viewinventory' && focusedOption.name === 'charactername') {
  await handleViewInventoryAutocomplete(interaction, focusedOption);
} else if (commandName === 'mount' && focusedOption.name === 'charactername') {
  await handleMountAutocomplete(interaction, focusedOption);
} else if (commandName === 'travel' && focusedOption.name === 'charactername') {
  await handleTravelAutocomplete(interaction, focusedOption);
} else if (['explore','test', 'editcharacter', 'deletecharacter', 'setbirthday', 'viewcharacter', 'testinventorysetup', 'syncinventory', 'crafting', 'gather', 'loot', 'gear'].includes(commandName) && focusedOption.name === 'charactername') {
  await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName);
} else if (commandName === 'gear' && focusedOption.name === 'itemname') {
  await handleGearAutocomplete(interaction, focusedOption);
} else if (commandName === 'crafting' && focusedOption.name === 'itemname') {
  await handleCraftingAutocomplete(interaction, focusedOption);
} else if (commandName === 'editcharacter' && focusedOption.name === 'updatedinfo') {
  await handleEditCharacterAutocomplete(interaction, focusedOption);
} else if (commandName === 'createcharacter' && focusedOption.name === 'race') {
  await handleCreateCharacterRaceAutocomplete(interaction, focusedOption);
} else if (commandName === 'createcharacter' && focusedOption.name === 'homevillage') {
  await handleCreateCharacterVillageAutocomplete(interaction, focusedOption);
} else if (commandName === 'itemheal') {
  await handleItemHealAutocomplete(interaction, focusedOption);
} else if (commandName === 'heal') {
  await handleHealAutocomplete(interaction, focusedOption);
} else if (commandName === 'travel' && focusedOption.name === 'destination') {
  await handleVillageBasedCommandsAutocomplete(interaction, focusedOption);
} else if (commandName === 'blight' && focusedOption.name === 'item') {
  console.log('Handling blight item autocomplete...');
  await handleBlightItemAutocomplete(interaction, focusedOption); 
} else if (commandName === 'blight' && focusedOption.name === 'character_name') {
  await handleBlightCharacterAutocomplete(interaction, focusedOption); 
} else if (commandName === 'explore' && ['item1', 'item2', 'item3'].includes(focusedOption.name)) {
  await handleExploreItemAutocomplete(interaction, focusedOption); // New handler for explore items
} else if (commandName === 'explore' && focusedOption.name === 'charactername') {
  await handleExploreRollCharacterAutocomplete(interaction, focusedOption);
} else if (commandName === 'steal' && focusedOption.name === 'target') {
  // Handle the /steal command's target option autocomplete
  const npcChoices = [
    'NPC - Hank the Herbalist',
    'NPC - Sue the Fisherman',
    'NPC - Lukan the Orchard Keeper',
    'NPC - Myti the Scout',
    'NPC - Cree the Monster Hunter',
    'NPC - Cece the Mushroom Forager',
    'NPC - Walton the Korok',
    'NPC - Jengo the Miner',
    'NPC - Jasz the Hunter',
    'NPC - Lecia the Scholar',
    'NPC - Tye the Botanist',
    'NPC - Lil Tim the Cucco'
  ];
  const filteredNPCs = npcChoices.filter(choice => choice.toLowerCase().includes(focusedOption.value.toLowerCase()));
  await interaction.respond(filteredNPCs.map(choice => ({ name: choice, value: choice })));
} else if (commandName === 'steal' && focusedOption.name === 'rarity') {
  // Handle the /steal command's rarity option autocomplete
  const choices = ['common', 'uncommon', 'rare'];
  const filtered = choices.filter(choice => choice.startsWith(focusedOption.value.toLowerCase()));
  await interaction.respond(filtered.map(choice => ({ name: choice, value: choice })));
} else {
  await interaction.respond([]);
}

} catch (error) {
  // Catch and handle errors
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

// ------------------- Command-Specific Autocomplete Handlers -------------------

// Handles autocomplete for 'vending' command
async function handleVendingAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    if (focusedOption.name === 'charactername') {
      const characters = await fetchCharactersByUserId(userId);
      const vendingCharacters = characters.filter(character => ['Merchant', 'Shopkeeper'].includes(character.job));
      const choices = vendingCharacters.map(character => ({
        name: character.name,
        value: character.name
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles autocomplete for 'crafting' command
async function handleCraftingAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername'); // Get character name from options
    const characters = await fetchCharactersByUserId(userId); // Fetch user characters
    const character = characters.find(c => c.name === characterName); // Find the selected character

    if (!character || !getJobPerk(character.job).perks.includes('CRAFTING')) {
      return await interaction.respond([]); // Respond with empty if character or perk not found
    }

    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const characterInventory = await inventoryCollection.find().toArray();
    const craftableItems = await fetchCraftableItemsAndCheckMaterials(characterInventory);

    const filteredItems = craftableItems.filter(item => item.craftingTags.includes(character.job.toLowerCase()));
    const choices = filteredItems.map(item => ({
      name: item.itemName,
      value: item.itemName
    }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles autocomplete for 'itemheal' command
async function handleItemHealAutocomplete(interaction, focusedOption) {
  try {
      const userId = interaction.user.id;

      if (focusedOption.name === 'charactername') {
          // Fetch characters by userId
          const characters = await fetchCharactersByUserId(userId);

          // Map characters to the appropriate format for autocompletion
          const choices = characters.map(character => ({
              name: character.name,
              value: character.name
          }));

          // Filter based on user input (if any) and respond with choices
          await respondWithFilteredChoices(interaction, focusedOption, choices);

      } else if (focusedOption.name === 'itemname') {
          // Handle item autocomplete logic
          const characterName = interaction.options.getString('charactername');
          if (!characterName) return await interaction.respond([]);

          const character = await fetchCharacterByNameAndUserId(characterName, userId);
          if (!character) return await interaction.respond([]);

          const inventoryCollection = await getCharacterInventoryCollection(character.name);
          const inventory = await inventoryCollection.find().toArray();

          // Ensure recipe category items and fairy items are included
          const choices = inventory
              .filter(item => 
                  (item.category && item.category.includes('Recipe')) || 
                  item.itemName.toLowerCase() === 'fairy'
              )
              .map(item => ({
                  name: `${item.itemName} - QTY:${item.quantity}`,
                  value: item.itemName
              }));

          await respondWithFilteredChoices(interaction, focusedOption, choices);
      }
  } catch (error) {
      await safeRespondWithError(interaction);
  }
}



// Handles autocomplete for 'transfer' command
async function handleTransferAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;

    if (focusedOption.name === 'fromcharacter' || focusedOption.name === 'tocharacter') {
      const characters = await fetchCharactersByUserId(userId);
      const choices = characters.map(character => ({
        name: character.name,
        value: character.name
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (['itema', 'itemb', 'itemc'].includes(focusedOption.name)) {
      const fromCharacterName = interaction.options.getString('fromcharacter');
      if (!fromCharacterName) return await interaction.respond([]);

      const fromCharacter = await fetchCharacterByNameAndUserId(fromCharacterName, userId);
      if (!fromCharacter) return await interaction.respond([]);

      const inventoryCollection = await getCharacterInventoryCollection(fromCharacter.name);
      const fromInventory = await inventoryCollection.find().toArray();
      const choices = fromInventory.map(item => ({
        name: `${item.itemName} - QTY:${item.quantity}`,
        value: item.itemName
      }));

      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles autocomplete for 'gift' command
async function handleGiftAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;

    if (focusedOption.name === 'fromcharacter') {
      const characters = await fetchCharactersByUserId(userId);
      const choices = characters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`,
        value: character.name
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (focusedOption.name === 'tocharacter') {
      const allCharacters = await fetchAllCharactersExceptUser(userId);
      const choices = allCharacters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`,
        value: character.name
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (['itema', 'itemb', 'itemc'].includes(focusedOption.name)) {
      const fromCharacterName = interaction.options.getString('fromcharacter');
      if (!fromCharacterName) return await interaction.respond([]);

      const fromCharacter = await fetchCharacterByNameAndUserId(fromCharacterName, userId);
      if (!fromCharacter) return await interaction.respond([]);

      const inventoryCollection = await getCharacterInventoryCollection(fromCharacter.name);
      const fromInventory = await inventoryCollection.find().toArray();
      const choices = fromInventory.map(item => ({
        name: `${item.itemName} - QTY:${item.quantity}`,
        value: item.itemName
      }));

      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles autocomplete for 'trade' command
async function handleTradeAutocomplete(interaction) {
  try {
    const userId = interaction.user.id;
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'fromcharacter') {
      const characters = await fetchCharactersByUserId(userId);
      const choices = characters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`,
        value: character.name
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (focusedOption.name === 'tocharacter') {
      const allCharacters = await fetchAllCharactersExceptUser(userId);
      const choices = allCharacters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`,
        value: character.name
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (['item1', 'item2', 'item3'].includes(focusedOption.name)) {
      const characterName = interaction.options.getString('fromcharacter');
      if (!characterName) return await interaction.respond([]);

      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) return await interaction.respond([]);

      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const characterInventory = await inventoryCollection.find().toArray();
      const choices = characterInventory.map(item => ({
        name: `${item.itemName} - QTY:${item.quantity}`,
        value: item.itemName
      }));

      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles autocomplete for 'lookup' command
async function handleLookupAutocomplete(interaction, focusedOption) {
  try {
    const items = await Item.find().select('itemName').exec(); // Fetch items from the database
    const choices = items.map(item => ({
      name: item.itemName,
      value: item.itemName
    }));

    // Sort choices alphabetically
    choices.sort((a, b) => a.name.localeCompare(b.name));
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles autocomplete for 'viewinventory' command
async function handleViewInventoryAutocomplete(interaction, focusedOption) {
  try {
    const characters = await fetchAllCharacters(); // Fetch all characters from the database
    const choices = characters.map(character => ({
      name: character.name,
      value: character._id.toString()
    }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles character-based commands autocomplete -------------------
async function handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName) {
  try {
    const userId = interaction.user.id; // Get the user ID from the interaction
    let characters = await fetchCharactersByUserId(userId); // Fetch characters by user ID

    // Apply filters based on specific commands
    if (commandName === 'crafting') {
      characters = characters.filter(character => {
        const jobPerk = getJobPerk(character.job);
        return jobPerk && jobPerk.perks.includes('CRAFTING');
      });
    } else if (commandName === 'gather') {
      characters = characters.filter(character => {
        const jobPerk = getJobPerk(character.job);
        return jobPerk && jobPerk.perks.includes('GATHERING');
      });
    } else if (commandName === 'loot') {
      characters = characters.filter(character => {
        const jobPerk = getJobPerk(character.job);
        return jobPerk && jobPerk.perks.includes('LOOTING');
      });
    } else if (commandName === 'syncinventory') {
      characters = characters.filter(character => !character.inventorySynced);
    }

    // If the command is "mount", no filtering is necessary, just return all characters
    if (commandName === 'mount') {
      // No specific filters needed, use all characters
    }

    // Format the choices for Discord's autocomplete response
    const choices = characters.map(character => ({
      name: character.name,
      value: character.name
    }));

    // Send the filtered choices as an autocomplete response
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}


// Handles village-based commands
async function handleVillageBasedCommandsAutocomplete(interaction, focusedOption) {
  try {
    const choices = getAllVillages().map(village => ({
      name: village,
      value: village
    }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles 'gear' command autocomplete
async function handleGearAutocomplete(interaction, focusedOption) {
  try {
    const characterName = interaction.options.getString('charactername');
    const type = interaction.options.getString('type');
    const userId = interaction.user.id;

    const characters = await fetchCharactersByUserId(userId);
    const character = characters.find(c => c.name === characterName);
    if (!character) return await interaction.respond([]);

    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const characterInventory = await inventoryCollection.find().toArray();

    const filteredItems = characterInventory.filter(item => {
      const categories = item.category.split(',').map(cat => cat.trim().toLowerCase());
      const subtypes = Array.isArray(item.subtype) ? item.subtype.map(st => st.trim().toLowerCase()) : (item.subtype ? [item.subtype.trim().toLowerCase()] : []);

      if (type === 'weapon') {
        return categories.includes('weapon') && !subtypes.includes('shield');
      } else if (type === 'shield') {
        return subtypes.includes('shield');
      } else if (type === 'head') {
        return categories.includes('armor') && item.type.toLowerCase().includes('head');
      } else if (type === 'chest') {
        return categories.includes('armor') && item.type.toLowerCase().includes('chest');
      } else if (type === 'legs') {
        return categories.includes('armor') && item.type.toLowerCase().includes('legs');
      }
      return false;
    });

    const items = filteredItems.map(item => ({
      name: `${item.itemName} - QTY:${item.quantity}`,
      value: item.itemName
    }));

    await respondWithFilteredChoices(interaction, focusedOption, items);
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles 'editcharacter' command updated info autocomplete
async function handleEditCharacterAutocomplete(interaction, focusedOption) {
  try {
    const category = interaction.options.getString('category');
    let choices = [];

    if (category === 'job') {
      choices = [
        { name: 'General Jobs', value: 'General Jobs' },
        { name: 'Inariko Exclusive Jobs', value: 'Inariko Exclusive Jobs' },
        { name: 'Rudania Exclusive Jobs', value: 'Rudania Exclusive Jobs' },
        { name: 'Vhintl Exclusive Jobs', value: 'Vhintl Exclusive Jobs' }
      ];
    } else if (category === 'race') {
      choices = getAllRaces().map(race => ({ name: capitalize(race), value: race }));
    } else if (category === 'homeVillage') {
      choices = getAllVillages().map(village => ({ name: village, value: village }));
    } else if (category === 'icon') {
      choices = [{ name: 'Please upload a new icon', value: 'Please upload a new icon' }];
    }

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles 'createcharacter' command race autocomplete
async function handleCreateCharacterRaceAutocomplete(interaction, focusedOption) {
  try {
    const choices = getAllRaces().map(race => ({
      name: capitalize(race),
      value: race
    }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles 'createcharacter' command home village autocomplete
async function handleCreateCharacterVillageAutocomplete(interaction, focusedOption) {
  try {
    const choices = getAllVillages().map(village => ({
      name: village,
      value: village
    }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles 'heal' command autocomplete
async function handleHealAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;

    if (focusedOption.name === 'charactername') {
      const characters = await fetchCharactersByUserId(userId);
      const choices = characters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`,
        value: character.name
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (focusedOption.name === 'healer') {
      const allCharacters = await fetchAllCharacters();
      const healerCharacters = allCharacters.filter(character => character.job.toLowerCase() === 'healer');
      const choices = healerCharacters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`,
        value: character.name
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (['item1', 'item2', 'item3'].includes(focusedOption.name)) {
      const characterName = interaction.options.getString('charactername');
      if (!characterName) return await interaction.respond([]);

      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) return await interaction.respond([]);

      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventory = await inventoryCollection.find().toArray();

      const itemNames = inventory.map(item => item.itemName);
      const items = await Item.find({ itemName: { $in: itemNames } }).exec();

      const choices = items.map(item => {
        const inventoryItem = inventory.find(i => i.itemName === item.itemName);
        let displayText = `${item.itemName} - QTY:${inventoryItem.quantity}`;
        return { name: displayText, value: item.itemName };
      });

      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// Handles 'travel' command autocomplete
async function handleTravelAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characters = await fetchCharactersByUserId(userId);
    const choices = characters.map(character => ({
      name: `${character.name} - ${capitalize(character.currentVillage)}`,
      value: character.name
    }));

    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}
// ------------------- Mount Autocomplete Logic -------------------
async function handleMountAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;  // Get the user ID from the interaction
    const characters = await fetchCharactersByUserId(userId);  // Fetch all characters for the user

    // Map characters to autocomplete choices including their name and current village
    const choices = characters.map(character => ({
      name: `${character.name} - ${capitalize(character.currentVillage)}`,  // Character name and village
      value: character.name  // The value to be used in the command
    }));

    // Filter based on user input and respond with filtered choices
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    await safeRespondWithError(interaction);  // Handle errors gracefully
  }
}

// ------------------- Blight Character Autocomplete Logic -------------------
async function handleBlightCharacterAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id; // Get the user ID from the interaction
    const characters = await fetchCharactersByUserId(userId); // Fetch all characters belonging to the user

    // Filter characters to include only those with blighted status
    const blightedCharacters = characters.filter(character => character.blighted === true);

    // Map characters to the format required by Discord's autocomplete
    const choices = blightedCharacters.map(character => ({
      name: character.name,
      value: character.name,
    }));

    // Filter choices based on user input
    const filteredChoices = focusedOption.value === ''
      ? choices.slice(0, 25) // Show up to 25 characters if no input is provided
      : choices.filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);

    // Respond with the filtered character names
    await interaction.respond(filteredChoices);

  } catch (error) {
    console.error('Error handling blight character autocomplete:', error);
    await interaction.respond([]); // Respond with an empty array in case of error
  }
}

// ------------------- Blight Item Autocomplete Logic -------------------
async function handleBlightItemAutocomplete(interaction, focusedOption) {
  try {
    console.log('Blight item autocomplete triggered'); // Log when autocomplete is triggered

    // Fetch all mod characters and their healing items
    const allItems = [];

    // Loop through all characters and collect their item-type healing requirements
    modCharacters.forEach(character => {
      character.getHealingRequirements().forEach(requirement => {
        if (requirement.type === 'item') {
          allItems.push(...requirement.items);
        }
      });
    });

    console.log('All healing items:', allItems); // Log all items

    // Filter and respond with matching item choices (based on what the user types)
    const choices = allItems.map(item => `${item.name} x${item.quantity}`);
    const filteredChoices = choices.filter(choice =>
      choice.toLowerCase().includes(focusedOption.value.toLowerCase())
    );

    // Ensure no more than 25 items are returned
    const limitedChoices = filteredChoices.slice(0, 25);

    await interaction.respond(limitedChoices.map(choice => ({
      name: choice,
      value: choice
    })));
  } catch (error) {
    console.error('Error during blight item autocomplete:', error);
    await interaction.respond([]); // Return empty array in case of an error
  }
}

// ------------------- New Handler for Explore Items -------------------
async function handleExploreItemAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');
    
    if (!characterName) return await interaction.respond([]);

    // Fetch the character by name and user ID
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) return await interaction.respond([]);

    // Fetch the character's inventory
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const inventoryItems = await inventoryCollection.find().toArray();

    // Retrieve the item IDs from the inventory
    const itemIds = inventoryItems.map(item => item.itemId);

    // Fetch items with healing properties, excluding 'Oil Jar'
    const healingItems = await ItemModel.find({
      _id: { $in: itemIds },
      itemName: { $ne: 'Oil Jar' }, // Exclude 'Oil Jar'
      $or: [
        { category: 'Recipe' },
        { itemName: 'Fairy' },
        { itemName: 'Eldin Ore' },
        { itemName: 'Wood' }
      ]
    }).lean().exec();

    // Prepare choices for autocomplete with healing details and quantity
    const choices = healingItems.map(item => {
      const inventoryItem = inventoryItems.find(inv => inv.itemId.toString() === item._id.toString());
      const quantityDisplay = item.itemName === 'Eldin Ore' ? Math.floor(inventoryItem.quantity / 5) 
                           : item.itemName === 'Wood' ? Math.floor(inventoryItem.quantity / 10) 
                           : inventoryItem.quantity;
      return {
        name: `${item.itemName} - Heals ${item.modifierHearts} ❤️ | ${item.staminaRecovered} 🟩 - Qty: ${quantityDisplay}`,
        value: inventoryItem.itemName
      };
    });

    // Respond with filtered choices
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    await safeRespondWithError(interaction);
  }
}

// ------------------- Enhanced Logging for Expedition Character Autocomplete -------------------
async function handleExploreRollCharacterAutocomplete(interaction, focusedOption) {
  try {
    const expeditionId = interaction.options.getString('id');
    console.log(`🔍 Expedition ID provided for Autocomplete: ${expeditionId}`);

    // Adding Logging to List All Parties for Troubleshooting
    const parties = await Party.find().lean();
    console.log(`🗂️ All Parties in Database: ${JSON.stringify(parties, null, 2)}`);

    if (!expeditionId) {
      console.log('❌ Expedition ID is missing.');
      return await interaction.respond([]);
    }

    // Fetch the party directly from the database using the expedition ID
    const party = await Party.findOne({ partyId: expeditionId }).lean();  // Using lean() for raw object response
    if (!party) {
      console.log('❌ No party found for the specified Expedition ID.');
      return await interaction.respond([]);
    }

    // Log party data to verify contents
    console.log(`✅ Party Data Retrieved: ${JSON.stringify(party, null, 2)}`);

    // Explicitly log each character in the party for detailed inspection
    if (party.characters && party.characters.length > 0) {
      console.log(`🔍 Accessing characters in the expedition party:`);
      party.characters.forEach((character, index) => {
        console.log(`- Character ${index + 1}: ${JSON.stringify(character, null, 2)}`);
      });
    } else {
      console.log('❌ No characters found in the party for this expedition.');
    }

    // Map the characters in the party to autocomplete choices
    const choices = party.characters.map(character => ({
      name: character.name,
      value: character.name
    }));

    console.log(`🚀 Returning Autocomplete Choices: ${JSON.stringify(choices, null, 2)}`);

    // Respond with only the character names from the party
    return await interaction.respond(choices);
  } catch (error) {
    console.error('❌ Error during Autocomplete Process:', error);
    await interaction.respond([]);
  }
}


// ------------------- Export Functions -------------------
module.exports = {
  handleAutocomplete,
  handleMountAutocomplete,
  handleTransferAutocomplete,
  handleGiftAutocomplete,
  handleTradeAutocomplete,
  handleLookupAutocomplete,
  handleViewInventoryAutocomplete,
  handleCharacterBasedCommandsAutocomplete,
  handleVillageBasedCommandsAutocomplete,
  handleGearAutocomplete,
  handleCraftingAutocomplete,
  handleEditCharacterAutocomplete,
  handleCreateCharacterRaceAutocomplete,
  handleCreateCharacterVillageAutocomplete,
  handleItemHealAutocomplete,
  handleHealAutocomplete,
  handleTravelAutocomplete,
  handleVendingAutocomplete,
  handleBlightCharacterAutocomplete,
  handleExploreItemAutocomplete,
  handleExploreRollCharacterAutocomplete
  
};
