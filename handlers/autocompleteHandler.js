// ------------------- Autocomplete Handler for Various Commands -------------------

// ------------------- Standard Libraries -------------------

// None in this case

// ------------------- Discord.js Components -------------------

// None in this case

// ------------------- Database Connections -------------------
const { connectToTinglebot } = require('../database/connection');
const { MongoClient } = require("mongodb"); // Ensure MongoClient is imported for database access

// ------------------- Database Services -------------------
const { fetchUserIdByUsername } = require('../database/userService');
const {
  fetchBlightedCharactersByUserId,
  fetchCharactersByUserId,
  fetchCharacterByNameAndUserId,
  getCharacterInventoryCollection,
  fetchAllCharactersExceptUser,
  fetchCharacterByName,
  fetchAllCharacters
} = require('../database/characterService');
const { fetchItemByName, fetchCraftableItemsAndCheckMaterials } = require('../database/itemService');
const { getCurrentVendingStockList, updateItemStockByName, updateVendingStock, VILLAGE_ICONS, VILLAGE_IMAGES } = require("../database/vendingService");
const { connectToInventories } = require('../database/connection');

// ------------------- Database Models -------------------
const Item = require('../models/ItemModel');
const ItemModel = require('../models/ItemModel'); // Duplicate import removed
const Party = require('../models/PartyModel');
const ShopStock = require('../models/ShopsModel');
const Character = require('../models/CharacterModel')
const Mount = require('../models/MountModel');
const { Village } = require('../models/VillageModel');
const initializeInventoryModel = require('../models/InventoryModel');

// ------------------- Modules -------------------
const { getAllRaces } = require('../modules/raceModule');
const { getJobPerk, getGeneralJobsPage, getVillageExclusiveJobs } = require('../modules/jobsModule');
const { getAllVillages } = require('../modules/locationsModule');
const { capitalize, capitalizeFirstLetter } = require('../modules/formattingModule');
const { getModCharacterByName, modCharacters } = require('../modules/modCharacters');
const { distractionItems, staminaRecoveryItems } = require('../modules/mountModule');

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

// ------------------- Route based on command name and focused option -------------------
if (commandName === 'blight' && focusedOption.name === 'character_name' || focusedOption.name === 'healer_name') {
  await handleBlightCharacterAutocomplete(interaction, focusedOption);
} else if (commandName === 'blight' && focusedOption.name === 'item') {
  await handleBlightItemAutocomplete(interaction, focusedOption);
} else if (commandName === 'crafting' && focusedOption.name === 'itemname') {
  await handleCraftingAutocomplete(interaction, focusedOption);
} else if (commandName === 'changejob' && focusedOption.name === 'newjob') {
  await handleChangeJobNewJobAutocomplete(interaction, focusedOption);
} else if (commandName === 'createcharacter' && focusedOption.name === 'homevillage') {
  await handleCreateCharacterVillageAutocomplete(interaction, focusedOption);
} else if (commandName === 'createcharacter' && focusedOption.name === 'race') {
  await handleCreateCharacterRaceAutocomplete(interaction, focusedOption);
} else if (commandName === 'editcharacter' && focusedOption.name === 'updatedinfo') {
  await handleEditCharacterAutocomplete(interaction, focusedOption);
} else if (['changejob', 'shops', 'explore', 'raid', 'editcharacter', 'deletecharacter', 'setbirthday', 'viewcharacter', 'testinventorysetup', 'syncinventory', 'crafting', 'gather', 'loot', 'gear'].includes(commandName) && focusedOption.name === 'charactername') {
  await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName);
} else if (commandName === 'explore' && ['item1', 'item2', 'item3'].includes(focusedOption.name)) {
  await handleExploreItemAutocomplete(interaction, focusedOption);
} else if (commandName === 'explore' && focusedOption.name === 'charactername') {
  await handleExploreRollCharacterAutocomplete(interaction, focusedOption);
} else if (commandName === 'gear' && focusedOption.name === 'itemname') {
  await handleGearAutocomplete(interaction, focusedOption);
} else if (commandName === 'gift') {
  await handleGiftAutocomplete(interaction, focusedOption);
} else if (commandName === 'heal') {
  await handleHealAutocomplete(interaction, focusedOption);
} else if (commandName === 'item') {
  if (focusedOption.name === 'jobname') {
      await handleItemJobVoucherAutocomplete(interaction, focusedOption); // New handler for jobname
  } else {
      await handleItemHealAutocomplete(interaction, focusedOption); // Existing handler for other options
  }
} else if (commandName === 'lookup' && (focusedOption.name === 'item' || focusedOption.name === 'ingredient')) {
  await handleLookupAutocomplete(interaction, focusedOption);
} else if ((commandName === 'stable' || commandName === 'mount') && focusedOption.name === 'charactername') {
  await handleMountAutocomplete(interaction, focusedOption); // Autocomplete for all characters
} else if ((commandName === 'stable' || commandName === 'mount') && focusedOption.name === 'mountname') {
  await handleMountNameAutocomplete(interaction, focusedOption); // Autocomplete for stored mounts only
} else if (commandName === 'shops' && focusedOption.name === 'itemname') {
  await handleShopsAutocomplete(interaction, focusedOption);
} else if (commandName === 'trade') {
  await handleTradeAutocomplete(interaction, focusedOption);
} else if (commandName === 'transfer') {
  await handleTransferAutocomplete(interaction, focusedOption);
} else if (commandName === 'travel' && focusedOption.name === 'charactername') {
  await handleTravelAutocomplete(interaction, focusedOption);
} else if (commandName === 'travel' && focusedOption.name === 'destination') {
  await handleVillageBasedCommandsAutocomplete(interaction, focusedOption);
} else if (commandName === 'village' && focusedOption.name === 'itemname') {
  await handleVillageMaterialsAutocomplete(interaction);
} else if (commandName === 'village' && focusedOption.name === 'charactername') {
  await handleVillageUpgradeCharacterAutocomplete(interaction);
} else if (commandName === 'viewinventory' && focusedOption.name === 'charactername') {
  await handleViewInventoryAutocomplete(interaction, focusedOption);
} else if (commandName === 'vending') {
  await handleVendingAutocomplete(interaction, focusedOption);
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

// ------------------- Blight Character Autocomplete Logic -------------------
async function handleBlightCharacterAutocomplete(interaction, focusedOption) {
  try {
    //format Extract the user ID from the interaction object
    const userId = interaction.user.id;

    if (focusedOption.name === 'character_name') {
      //format Fetches blighted characters for the user and formats their names to include village names
      const blightedCharacters = await fetchBlightedCharactersByUserId(userId);
      const choices = blightedCharacters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`, //format Format: "Name - Village"
        value: character.name,
      }));

      //format Respond with filtered character choices
      await respondWithFilteredChoices(interaction, focusedOption, choices);

    } else if (focusedOption.name === 'healer_name') {
      //format Formats healer names to include their village names
      const choices = healers.map(healer => ({
        name: `${healer.name} - ${capitalize(healer.village)}`, //format Format: "Name - Village"
        value: healer.name,
      }));

      //format Respond with filtered healer choices
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } catch (error) {
    //format Logs the error with a clear message for debugging
    console.error('[handleBlightCharacterAutocomplete]: Error occurred:', error);

    //format Respond safely to the user in case of errors
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for blight items -------------------
async function handleBlightItemAutocomplete(interaction, focusedOption) {
  try {
    //format Initialize an array to collect all mod character healing items
    const allItems = [];

    //format Loop through mod characters to gather item-type healing requirements
    modCharacters.forEach(character => {
      character.getHealingRequirements().forEach(requirement => {
        if (requirement.type === 'item') {
          allItems.push(...requirement.items); //format Add all items matching the requirement type
        }
      });
    });

    //format Map all items to formatted strings with quantity
    const choices = allItems.map(item => `${item.name} x${item.quantity}`);

    //format Filter choices based on user input
    const filteredChoices = choices.filter(choice =>
      choice.toLowerCase().includes(focusedOption.value.toLowerCase())
    );

    //format Limit the number of results to 25 to comply with Discord's constraints
    const limitedChoices = filteredChoices.slice(0, 25);

    //format Respond with filtered and limited item choices
    await interaction.respond(
      limitedChoices.map(choice => ({
        name: choice, //format Display item name and quantity
        value: choice, //format Use the formatted string as value
      }))
    );
  } catch (error) {
    //format Log and handle errors gracefully
    console.error('[handleBlightItemAutocomplete]: Error during blight item autocomplete:', error);
    await interaction.respond([]); //format Return an empty response in case of an error
  }
}

// ------------------- Handles character-based commands autocomplete -------------------
async function handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName) {
  try {
    // Extract the user ID from the interaction
    const userId = interaction.user.id;

    // Fetch characters associated with the user ID
    let characters = await fetchCharactersByUserId(userId);

    // Apply filters based on the specific command
    if (commandName === 'crafting') {
      characters = characters.filter(character => {
          const jobPerk = getJobPerk(character.job);
          // Include characters with crafting perks or an active job voucher
          return (jobPerk && jobPerk.perks.includes('CRAFTING')) || (character.jobVoucher && character.jobVoucher !== false);
      });

      // Log characters eligible for crafting
    } else       if (commandName === 'gather') {
      characters = characters.filter(character => {
          const jobPerk = getJobPerk(character.job);
          return (jobPerk && jobPerk.perks.includes('GATHERING')) || (character.jobVoucher && character.jobVoucher !== false);
      });

      console.log('[Autocomplete]: Eligible characters for gathering:', characters.map(c => c.name));
  
      // Log characters eligible for gathering or with job vouchers
    } else if (commandName === 'loot') {
      characters = characters.filter(character => {
          const jobPerk = getJobPerk(character.job);
          return jobPerk && jobPerk.perks.includes('LOOTING') || (character.jobVoucher && character.jobVoucher !== false);
      });

      // Log characters eligible for looting
    } else if (commandName === 'syncinventory') {
      characters = characters.filter(character => !character.inventorySynced); // Filter unsynced inventories
    }

    // No filtering required for the "mount" command
    if (commandName === 'mount') {
    }

    // Format the choices for Discord's autocomplete response
    const choices = characters.map(character => ({
      name: character.name, // Display character name
      value: character.name, // Use character name as the value
    }));

    // Send the filtered choices as an autocomplete response
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    // Handle errors gracefully
    console.error(`[Autocomplete Handler]: Error handling ${commandName} autocomplete:`, error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for 'crafting' command -------------------

async function handleCraftingAutocomplete(interaction, focusedOption) {
  try {
      // Extract user ID and character name from the interaction
      const userId = interaction.user.id;
      const characterName = interaction.options.getString('charactername');

      // Fetch all characters belonging to the user
      const characters = await fetchCharactersByUserId(userId);

      // Find the specific character from the list
      const character = characters.find(c => c.name === characterName);
      if (!character) {
          // Respond with an empty array if the character is not found
          return await interaction.respond([]);
      }

      // Determine the character's job based on the Job Voucher or default job
      const job = character.jobVoucher ? character.jobVoucherJob : character.job;

      // Check the character's job perks to ensure crafting eligibility
      const jobPerk = getJobPerk(job);
      if (!jobPerk || !jobPerk.perks.includes('CRAFTING')) {
          // Respond with an empty array if the character cannot craft
          return await interaction.respond([]);
      }

      // Fetch the character's inventory
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const characterInventory = await inventoryCollection.find().toArray();

      // Determine which items can be crafted based on the inventory
      const craftableItems = await fetchCraftableItemsAndCheckMaterials(characterInventory);
      if (craftableItems.length === 0) {
          // Respond with an empty array if no craftable items are found
          return await interaction.respond([]);
      }

      // Filter craftable items based on the character's job
      const filteredItems = craftableItems.filter(item =>
          item.craftingTags.some(tag => tag.toLowerCase() === job.toLowerCase())
      );
      if (filteredItems.length === 0) {
          // Respond with an empty array if no items match the character's job
          return await interaction.respond([]);
      }

      // Get the user's input value for dynamic filtering
      const inputValue = focusedOption.value.toLowerCase();

      // Filter items dynamically based on the user's input
      const matchingItems = filteredItems.filter(item =>
          item.itemName.toLowerCase().includes(inputValue)
      );

      const MAX_CHOICES = 25; // Discord's maximum allowed autocomplete choices

      // Map matching items to autocomplete choices and limit to the maximum allowed
      const choices = matchingItems.slice(0, MAX_CHOICES).map(item => ({
          name: item.itemName, // Display item name
          value: item.itemName, // Use item name as the value
      }));

      // Respond to the interaction with the filtered choices
      if (!interaction.responded) {
          await interaction.respond(choices);
      }
  } catch (error) {
      // Handle errors gracefully by responding with an empty array
      if (!interaction.responded) {
          await interaction.respond([]);
      }
  }
}

// ------------------- Handles autocomplete for creating character race -------------------
async function handleCreateCharacterRaceAutocomplete(interaction, focusedOption) {
  try {
    //format Retrieve all races and format them for autocomplete
    const choices = getAllRaces().map(race => ({
      name: capitalize(race), //format Display race name in a capitalized format
      value: race, //format Use the raw race value
    }));

    //format Respond to the interaction with filtered race choices
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    //format Handle errors gracefully and respond with a safe error message
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for creating character village -------------------
async function handleCreateCharacterVillageAutocomplete(interaction, focusedOption) {
  try {
    //format Retrieve all villages and format them for autocomplete
    const choices = getAllVillages().map(village => ({
      name: village, //format Display village name directly
      value: village, //format Use the raw village value
    }));

    //format Respond to the interaction with filtered village choices
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    //format Handle errors gracefully and respond with a safe error message
    await safeRespondWithError(interaction);
  }
}
// ------------------- Handles autocomplete for editing character attributes -------------------
async function handleEditCharacterAutocomplete(interaction, focusedOption) {
  try {
    //format Retrieve the selected category from interaction options
    const category = interaction.options.getString('category');
    let choices = []; //format Initialize choices array

    //format Define autocomplete choices based on the selected category
    if (category === 'job') {
      choices = [
        { name: 'General Jobs', value: 'General Jobs' },
        { name: 'Inariko Exclusive Jobs', value: 'Inariko Exclusive Jobs' },
        { name: 'Rudania Exclusive Jobs', value: 'Rudania Exclusive Jobs' },
        { name: 'Vhintl Exclusive Jobs', value: 'Vhintl Exclusive Jobs' },
      ];
    } else if (category === 'race') {
      //format Generate race options with capitalized names
      choices = getAllRaces().map(race => ({
        name: capitalize(race),
        value: race,
      }));
    } else if (category === 'homeVillage') {
      //format Generate village options
      choices = getAllVillages().map(village => ({
        name: village,
        value: village,
      }));
    } else if (category === 'icon') {
      //format Provide a placeholder choice for uploading a new icon
      choices = [{ name: 'Please upload a new icon', value: 'Please upload a new icon' }];
    }

    //format Respond to the interaction with the filtered choices
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    //format Handle errors gracefully and respond with a safe error message
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for exploring items -------------------
async function handleExploreItemAutocomplete(interaction, focusedOption) {
  try {
    //format Extract user ID and character name from the interaction
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');

    //format Return empty response if character name is not provided
    if (!characterName) return await interaction.respond([]);

    //format Fetch the character by name and user ID
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) return await interaction.respond([]);

    //format Fetch the character's inventory
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const inventoryItems = await inventoryCollection.find().toArray();

    //format Retrieve item IDs from the inventory
    const itemIds = inventoryItems.map(item => item.itemId);

    //format Fetch items with healing properties, excluding 'Oil Jar'
    const healingItems = await ItemModel.find({
      _id: { $in: itemIds },
      itemName: { $ne: 'Oil Jar' }, //format Exclude 'Oil Jar'
      $or: [
        { category: 'Recipe' },
        { itemName: 'Fairy' },
        { itemName: 'Eldin Ore' },
        { itemName: 'Wood' },
      ],
    })
      .lean()
      .exec();

    //format Prepare choices for autocomplete with healing details and quantity
    const choices = healingItems.map(item => {
      const inventoryItem = inventoryItems.find(
        inv => inv.itemId.toString() === item._id.toString()
      );

      //format Calculate quantity display based on item-specific rules
      const quantityDisplay =
        item.itemName === 'Eldin Ore'
          ? Math.floor(inventoryItem.quantity / 5)
          : item.itemName === 'Wood'
          ? Math.floor(inventoryItem.quantity / 10)
          : inventoryItem.quantity;

      return {
        name: `${item.itemName} - Heals ${item.modifierHearts} ❤️ | ${item.staminaRecovered} 🟩 - Qty: ${quantityDisplay}`,
        value: inventoryItem.itemName,
      };
    });

    //format Respond with filtered choices
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    //format Handle errors gracefully and respond with a safe error message
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for exploring roll character -------------------
async function handleExploreRollCharacterAutocomplete(interaction, focusedOption) {
  try {
    //format Extract the expedition ID from interaction options
    const expeditionId = interaction.options.getString('id');
    console.log(`🔍 Expedition ID provided for Autocomplete: ${expeditionId}`);

    //format Log all parties in the database for troubleshooting purposes
    const parties = await Party.find().lean();
    console.log(`🗂️ All Parties in Database: ${JSON.stringify(parties, null, 2)}`);

    //format Respond with an empty array if expedition ID is missing
    if (!expeditionId) {
      console.log('❌ Expedition ID is missing.');
      return await interaction.respond([]);
    }

    //format Fetch the party from the database using the expedition ID
    const party = await Party.findOne({ partyId: expeditionId }).lean(); //format Using lean() for lightweight response
    if (!party) {
      console.log('❌ No party found for the specified Expedition ID.');
      return await interaction.respond([]);
    }

    //format Log retrieved party data for verification
    console.log(`✅ Party Data Retrieved: ${JSON.stringify(party, null, 2)}`);

    //format Log detailed character information if characters exist in the party
    if (party.characters && party.characters.length > 0) {
      console.log(`🔍 Accessing characters in the expedition party:`);
      party.characters.forEach((character, index) => {
        console.log(`- Character ${index + 1}: ${JSON.stringify(character, null, 2)}`);
      });
    } else {
      console.log('❌ No characters found in the party for this expedition.');
    }

    //format Map characters to autocomplete choices
    const choices = party.characters.map(character => ({
      name: character.name, //format Display character name
      value: character.name, //format Use character name as value
    }));

    console.log(`🚀 Returning Autocomplete Choices: ${JSON.stringify(choices, null, 2)}`);

    //format Respond with the character choices
    return await interaction.respond(choices);
  } catch (error) {
    //format Log the error and respond with an empty array
    console.error('❌ Error during Autocomplete Process:', error);
    await interaction.respond([]);
  }
}

// ------------------- Handles autocomplete for character gear -------------------
async function handleGearAutocomplete(interaction, focusedOption) {
  try {
    //format Extract required options and user ID from the interaction
    const characterName = interaction.options.getString('charactername');
    const type = interaction.options.getString('type');
    const userId = interaction.user.id;

    //format Fetch all characters for the user and find the specified character
    const characters = await fetchCharactersByUserId(userId);
    const character = characters.find(c => c.name === characterName);
    if (!character) return await interaction.respond([]);

    //format Fetch the character's inventory
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const characterInventory = await inventoryCollection.find().toArray();

    //format Filter inventory items based on the type of gear specified
    const filteredItems = characterInventory.filter(item => {
      const categories = item.category.split(',').map(cat => cat.trim().toLowerCase());
      const subtypes = Array.isArray(item.subtype)
        ? item.subtype.map(st => st.trim().toLowerCase())
        : item.subtype
        ? [item.subtype.trim().toLowerCase()]
        : [];

      if (type === 'weapon') {
        return categories.includes('weapon') && !subtypes.includes('shield'); //format Include weapons but exclude shields
      } else if (type === 'shield') {
        return subtypes.includes('shield'); //format Include shields
      } else if (type === 'head') {
        return categories.includes('armor') && item.type.toLowerCase().includes('head'); //format Include head armor
      } else if (type === 'chest') {
        return categories.includes('armor') && item.type.toLowerCase().includes('chest'); //format Include chest armor
      } else if (type === 'legs') {
        return categories.includes('armor') && item.type.toLowerCase().includes('legs'); //format Include leg armor
      }
      return false; //format Exclude items that do not match any category
    });

    //format Map filtered items to autocomplete choices
    const items = filteredItems.map(item => ({
      name: `${item.itemName} - QTY:${item.quantity}`, //format Display item name and quantity
      value: item.itemName, //format Use item name as value
    }));

    //format Respond with the filtered choices
    await respondWithFilteredChoices(interaction, focusedOption, items);
  } catch (error) {
    //format Handle errors gracefully and respond with a safe error message
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for character gear -------------------
async function handleGearAutocomplete(interaction, focusedOption) {
  try {
    //format Extract required options and user ID from the interaction
    const characterName = interaction.options.getString('charactername');
    const type = interaction.options.getString('type');
    const userId = interaction.user.id;

    //format Fetch all characters for the user and find the specified character
    const characters = await fetchCharactersByUserId(userId);
    const character = characters.find(c => c.name === characterName);
    if (!character) return await interaction.respond([]);

    //format Fetch the character's inventory
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const characterInventory = await inventoryCollection.find().toArray();

    //format Filter inventory items based on the type of gear specified
    const filteredItems = characterInventory.filter(item => {
      const categories = item.category.split(',').map(cat => cat.trim().toLowerCase());
      const subtypes = Array.isArray(item.subtype)
        ? item.subtype.map(st => st.trim().toLowerCase())
        : item.subtype
        ? [item.subtype.trim().toLowerCase()]
        : [];

      if (type === 'weapon') {
        return categories.includes('weapon') && !subtypes.includes('shield'); //format Include weapons but exclude shields
      } else if (type === 'shield') {
        return subtypes.includes('shield'); //format Include shields
      } else if (type === 'head') {
        return categories.includes('armor') && item.type.toLowerCase().includes('head'); //format Include head armor
      } else if (type === 'chest') {
        return categories.includes('armor') && item.type.toLowerCase().includes('chest'); //format Include chest armor
      } else if (type === 'legs') {
        return categories.includes('armor') && item.type.toLowerCase().includes('legs'); //format Include leg armor
      }
      return false; //format Exclude items that do not match any category
    });

    //format Map filtered items to autocomplete choices
    const items = filteredItems.map(item => ({
      name: `${item.itemName} - QTY:${item.quantity}`, //format Display item name and quantity
      value: item.itemName, //format Use item name as value
    }));

    //format Respond with the filtered choices
    await respondWithFilteredChoices(interaction, focusedOption, items);
  } catch (error) {
    //format Handle errors gracefully and respond with a safe error message
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for gifting items and characters -------------------
async function handleGiftAutocomplete(interaction, focusedOption) {
  try {
    //format Extract user ID from the interaction
    const userId = interaction.user.id;

    if (focusedOption.name === 'fromcharacter') {
      //format Fetch characters owned by the user and format them for autocomplete
      const characters = await fetchCharactersByUserId(userId);
      const choices = characters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`, //format Include character name and village
        value: character.name, //format Use character name as the value
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (focusedOption.name === 'tocharacter') {
      //format Fetch all characters except the user's characters
      const allCharacters = await fetchAllCharactersExceptUser(userId);
      const choices = allCharacters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`, //format Include character name and village
        value: character.name, //format Use character name as the value
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (['itema', 'itemb', 'itemc'].includes(focusedOption.name)) {
      //format Fetch the "from character" specified in the interaction
      const fromCharacterName = interaction.options.getString('fromcharacter');
      if (!fromCharacterName) return await interaction.respond([]);

      //format Fetch the details of the specified "from character"
      const fromCharacter = await fetchCharacterByNameAndUserId(fromCharacterName, userId);
      if (!fromCharacter) return await interaction.respond([]);

      //format Fetch the inventory of the "from character"
      const inventoryCollection = await getCharacterInventoryCollection(fromCharacter.name);
      const fromInventory = await inventoryCollection.find().toArray();

      //format Map the inventory items to autocomplete choices
      const choices = fromInventory.map(item => ({
        name: `${item.itemName} - QTY:${item.quantity}`, //format Include item name and quantity
        value: item.itemName, //format Use item name as the value
      }));

      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } catch (error) {
    //format Handle errors gracefully and respond with a safe error message
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for healing requests -------------------
async function handleHealAutocomplete(interaction, focusedOption) {
  try {
    //format Extract user ID from the interaction
    const userId = interaction.user.id;

    //format Autocomplete for 'charactername' (target character for the heal request)
    if (focusedOption.name === 'charactername') {
      const userCharacters = await fetchCharactersByUserId(userId); //format Fetch user's characters
      const choices = userCharacters.map(character => ({
        name: `${character.name} - ${capitalizeFirstLetter(character.currentVillage)}`, //format Display character name and current village
        value: character.name, //format Use character name as value
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);

    //format Autocomplete for 'healer' (global healers available for /heal request)
    } else if (focusedOption.name === 'healer') {
      const allCharacters = await fetchAllCharacters(); //format Fetch all characters globally
      const healerCharacters = allCharacters.filter(character => character.job.toLowerCase() === 'healer'); //format Filter only healers
      const choices = healerCharacters.map(character => ({
        name: `${character.name} - ${capitalizeFirstLetter(character.currentVillage)}`, //format Display character name and current village
        value: character.name, //format Use character name as value
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);

    //format Autocomplete for 'healername' (user-owned healers for /heal fulfill request)
    } else if (focusedOption.name === 'healername') {
      const userCharacters = await fetchCharactersByUserId(userId); //format Fetch user's characters
      const healerCharacters = userCharacters.filter(character => character.job.toLowerCase() === 'healer'); //format Filter only healers
      const choices = healerCharacters.map(character => ({
        name: `${character.name} - ${capitalizeFirstLetter(character.currentVillage)}`, //format Display character name and current village
        value: character.name, //format Use character name as value
      }));
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } catch (error) {
    //format Handle errors gracefully and log them for debugging
    console.error('[autocompleteHandler.js]: Error handling heal autocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for item healing requests -------------------
async function handleItemHealAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;

    if (focusedOption.name === 'charactername') {
      // Fetch characters owned by the user
      const characters = await fetchCharactersByUserId(userId);

      // Map characters to the appropriate format for autocomplete
      const choices = characters.map(character => ({
        name: character.name, // Display character name
        value: character.name, // Use character name as value
      }));

      // Filter choices based on user input and respond
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (focusedOption.name === 'itemname') {
      // Handle item autocomplete logic for the selected character
      const characterName = interaction.options.getString('charactername');
      if (!characterName) return await interaction.respond([]);

      // Fetch the specified character's details
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) return await interaction.respond([]);

      // Fetch the character's inventory
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventory = await inventoryCollection.find().toArray();

      // Include items like "Job Voucher" and other special items
      const choices = inventory
        .filter(item =>
          (item.category && item.category.includes('Recipe')) || // Include recipes
          item.itemName.toLowerCase() === 'fairy' || // Include "Fairy" item
          item.itemName.toLowerCase() === 'job voucher' // Include "Job Voucher"
        )
        .map(item => ({
          name: `${item.itemName} - QTY:${item.quantity}`, // Display item name and quantity
          value: item.itemName, // Use item name as value
        }));

      // Respond with filtered item choices
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } catch (error) {
    console.error('[autocompleteHandler.js]: Error handling item autocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for item lookup -------------------
async function handleLookupAutocomplete(interaction, focusedOption) {
  try {
    //format Fetch all items from the database, selecting only their names
    const items = await Item.find().select('itemName').exec();

    //format Map items to the appropriate format for autocomplete
    const choices = items.map(item => ({
      name: item.itemName, //format Display item name
      value: item.itemName, //format Use item name as value
    }));

    //format Sort choices alphabetically for easier user navigation
    choices.sort((a, b) => a.name.localeCompare(b.name));

    //format Respond with filtered and sorted item choices
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    //format Log and handle errors gracefully
    console.error('[autocompleteHandler.js]: Error handling lookup autocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for mount and stable selection -------------------
async function handleMountAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;

    // Fetch all characters associated with the user
    const characters = await fetchCharactersByUserId(userId);

    // Determine the subcommand being used
    const subcommand = interaction.options.getSubcommand();

    // Apply specific filtering for different subcommands
    const choices = characters
      .filter(character => {
        if (subcommand === 'retrieve' || subcommand === 'store' || subcommand === 'sell') {
          // Include only characters with mounts for these subcommands
          return true;
        } else if (subcommand === 'view') {
          // Include all characters for view
          return true;
        } else if (subcommand === 'encounter') {
          // Include only characters owned by the user (specific for encounter)
          return true;
        }
        return false; // Default case (shouldn't trigger)
      })
      .map(character => ({
        name: character.name, // Show character name
        value: character.name, // Use character name as value
      }));

    // Filter choices and respond
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    console.error('[handleMountAutocomplete]: Error handling mount autocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for shop interactions -------------------
async function handleShopsAutocomplete(interaction, focusedOption) {
  try {
    //format Extract required options from the interaction
    const characterName = interaction.options.getString('charactername');
    const subcommand = interaction.options.getSubcommand();
    const searchQuery = focusedOption.value.toLowerCase(); //format Get the user's current input
    let choices = [];

    if (subcommand === 'buy') {
      //format Fetch and prepare items available for buying, sorted alphabetically
      const items = await ShopStock.find().sort({ itemName: 1 }).select('itemName quantity').lean();

      //format Filter items based on the search query
      choices = items
        .filter(item => item.itemName.toLowerCase().includes(searchQuery))
        .map(item => ({
          name: `${item.itemName} - Qty: ${item.quantity}`, //format Display item name and quantity
          value: item.itemName, //format Use item name as value
        }));
    } else if (subcommand === 'sell') {
      //format Fetch inventory items for selling
      const inventoryCollection = await getCharacterInventoryCollection(characterName);
      const inventoryItems = await inventoryCollection.find().toArray();

      //format Fetch sell prices for all inventory items in a single query
      const itemNames = inventoryItems.map(item => item.itemName);
      const itemsFromDB = await ItemModel.find({ itemName: { $in: itemNames } }).select('itemName sellPrice').lean();

      //format Map items for quick lookup by item name
      const itemsMap = new Map(itemsFromDB.map(item => [item.itemName, item.sellPrice]));

      //format Enrich inventory items with sell prices, filter, and sort based on the search query
      choices = inventoryItems
        .filter(item => item.itemName.toLowerCase().includes(searchQuery))
        .sort((a, b) => a.itemName.localeCompare(b.itemName)) //format Sort items alphabetically
        .map(item => ({
          name: `${item.itemName} - Qty: ${item.quantity} - Sell: ${itemsMap.get(item.itemName) || 'N/A'}`, //format Include item name, quantity, and sell price
          value: item.itemName, //format Use item name as value
        }));
    }

    //format Respond with up to 25 filtered and sorted choices
    await interaction.respond(choices.slice(0, 25));
  } catch (error) {
    //format Log and handle errors gracefully
    console.error('[handleShopsAutocomplete]: Error fetching items for autocomplete:', error);

    //format Ensure interaction is responded to in case of an error
    if (!interaction.responded) {
      await interaction.respond([]);
    }
  }
}

// ------------------- Handles autocomplete for trading items and characters -------------------
async function handleTradeAutocomplete(interaction) {
  try {
    //format Extract user ID and focused option from the interaction
    const userId = interaction.user.id;
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'fromcharacter') {
      //format Fetch characters owned by the user
      const characters = await fetchCharactersByUserId(userId);

      //format Map characters to autocomplete choices
      const choices = characters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`, //format Display character name and current village
        value: character.name, //format Use character name as value
      }));

      //format Respond with filtered character choices
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (focusedOption.name === 'tocharacter') {
      //format Fetch all characters except those owned by the user
      const allCharacters = await fetchAllCharactersExceptUser(userId);

      //format Map characters to autocomplete choices
      const choices = allCharacters.map(character => ({
        name: `${character.name} - ${capitalize(character.currentVillage)}`, //format Display character name and current village
        value: character.name, //format Use character name as value
      }));

      //format Respond with filtered character choices
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (['item1', 'item2', 'item3'].includes(focusedOption.name)) {
      //format Fetch the "from character" specified in the interaction
      const characterName = interaction.options.getString('fromcharacter');
      if (!characterName) return await interaction.respond([]);

      //format Fetch the specified character's details
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) return await interaction.respond([]);

      //format Fetch the inventory of the specified character
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const characterInventory = await inventoryCollection.find().toArray();

      //format Map inventory items to autocomplete choices
      const choices = characterInventory.map(item => ({
        name: `${item.itemName} - QTY:${item.quantity}`, //format Display item name and quantity
        value: item.itemName, //format Use item name as value
      }));

      //format Respond with filtered inventory item choices
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } catch (error) {
    //format Log and handle errors gracefully
    console.error('[handleTradeAutocomplete]: Error handling trade autocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for transferring items -------------------
async function handleTransferAutocomplete(interaction, focusedOption) {
  try {
    //format Extract user ID from the interaction
    const userId = interaction.user.id;

    if (focusedOption.name === 'fromcharacter' || focusedOption.name === 'tocharacter') {
      //format Fetch characters owned by the user
      const characters = await fetchCharactersByUserId(userId);

      //format Map characters to autocomplete choices
      const choices = characters.map(character => ({
        name: character.name, //format Display character name
        value: character.name, //format Use character name as value
      }));

      //format Respond with filtered character choices
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    } else if (['itema', 'itemb', 'itemc'].includes(focusedOption.name)) {
      //format Fetch the "from character" specified in the interaction
      const fromCharacterName = interaction.options.getString('fromcharacter');
      if (!fromCharacterName) return await interaction.respond([]);

      //format Fetch the specified character's details
      const fromCharacter = await fetchCharacterByNameAndUserId(fromCharacterName, userId);
      if (!fromCharacter) return await interaction.respond([]);

      //format Fetch the inventory of the "from character"
      const inventoryCollection = await getCharacterInventoryCollection(fromCharacter.name);
      const fromInventory = await inventoryCollection.find().toArray();

      //format Map inventory items to autocomplete choices
      const choices = fromInventory.map(item => ({
        name: `${item.itemName} - QTY:${item.quantity}`, //format Display item name and quantity
        value: item.itemName, //format Use item name as value
      }));

      //format Respond with filtered inventory item choices
      await respondWithFilteredChoices(interaction, focusedOption, choices);
    }
  } catch (error) {
    //format Log and handle errors gracefully
    console.error('[handleTransferAutocomplete]: Error handling transfer autocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for travel selection -------------------
async function handleTravelAutocomplete(interaction, focusedOption) {
  try {
    //format Extract user ID from the interaction
    const userId = interaction.user.id;

    //format Fetch characters owned by the user
    const characters = await fetchCharactersByUserId(userId);

    //format Map characters to autocomplete choices
    const choices = characters.map(character => ({
      name: `${character.name} - ${capitalize(character.currentVillage)}`, //format Display character name and current village
      value: character.name, //format Use character name as value
    }));

    //format Respond with filtered character choices
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    //format Log and handle errors gracefully
    console.error('[handleTravelAutocomplete]: Error handling travel autocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for vending characters and items -------------------
async function handleVendingAutocomplete(interaction, focusedOption) {
  try {
      const userId = interaction.user.id; // Extract user ID from the interaction
      const subcommand = interaction.options.getSubcommand(); // Get the subcommand (e.g., restock, barter, editshop, pouch, sync, viewshop)

      console.log('[handleVendingAutocomplete]: Interaction received.', {
          focusedOptionName: focusedOption.name,
          subcommand,
          userId,
      });

      if (subcommand === 'barter') {
          if (focusedOption.name === 'charactername') {
              console.log('[handleVendingAutocomplete]: Handling charactername autocomplete for barter.');

              // Fetch characters owned by the user
              const characters = await fetchCharactersByUserId(userId);
              if (!characters || characters.length === 0) {
                  console.warn('[handleVendingAutocomplete]: No characters found for the user.');
                  return await interaction.respond([]);
              }

              // Map user characters to autocomplete choices
              const choices = characters.map(character => ({
                  name: `${character.name} (${character.currentVillage})`,
                  value: character.name,
              }));

              await respondWithFilteredChoices(interaction, focusedOption, choices); // Respond with user characters
          } else if (focusedOption.name === 'vendorcharacter') {
              console.log('[handleVendingAutocomplete]: Handling vendorcharacter autocomplete.');

              try {
                  // Fetch vendor characters (merchant/shopkeeper) by vendorType
                  const vendors = await Character.find({
                      vendorType: { $regex: /^(merchant|shopkeeper)$/i }, // Case-insensitive match
                  }).lean(); // Use lean for lightweight queries

                  if (!vendors || vendors.length === 0) {
                      console.warn('[handleVendingAutocomplete]: No vendor characters found.');
                      return await interaction.respond([]);
                  }

                  // Map vendor characters to autocomplete choices
                  const choices = vendors.map(vendor => ({
                      name: `${vendor.name} (${vendor.currentVillage})`,
                      value: vendor.name,
                  }));

                  await respondWithFilteredChoices(interaction, focusedOption, choices); // Respond with vendor characters
              } catch (error) {
                  console.error('[handleVendingAutocomplete]: Error fetching vendor characters:', error);
                  await interaction.respond([]);
              }
          } else if (focusedOption.name === 'itemname') {
              console.log(`[handleVendingAutocomplete]: Handling itemname autocomplete for barter.`);

              const vendorCharacter = interaction.options.getString('vendorcharacter');
              if (!vendorCharacter) {
                  console.warn('[handleVendingAutocomplete]: No vendor character selected.');
                  return await interaction.respond([]);
              }

              try {
                  // Connect to the vending database
                  const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
                  await client.connect();
                  const db = client.db('vending');
                  const inventoryCollection = db.collection(vendorCharacter.toLowerCase());

                  // Fetch items from the vendor's inventory
                  const items = await inventoryCollection.find({}).toArray();

                  if (!items || items.length === 0) {
                      console.warn(`[handleVendingAutocomplete]: No items found for vendor '${vendorCharacter}'.`);
                      await client.close();
                      return await interaction.respond([]);
                  }

                  // Filter items based on user input
                  const searchQuery = focusedOption.value.toLowerCase();
                  const filteredItems = items
                      .filter(item => item.itemName.toLowerCase().includes(searchQuery))
                      .map(item => ({
                          name: `${item.itemName} - Qty: ${item.stockQty}`, // Display item name and quantity
                          value: item.itemName, // Use item name as the value
                      }))
                      .slice(0, 25); // Limit to 25 results

                  await client.close(); // Close the database connection
                  await interaction.respond(filteredItems); // Respond with filtered items
              } catch (error) {
                  console.error('[handleVendingAutocomplete]: Error fetching inventory for vendor:', error);
                  await interaction.respond([]);
              }
          } else {
              console.warn(`[handleVendingAutocomplete]: Unsupported focused option '${focusedOption.name}' for subcommand 'barter'.`);
              await interaction.respond([]);
          }
      } else if (subcommand === 'pouch') {
          if (focusedOption.name === 'charactername') {
              console.log('[handleVendingAutocomplete]: Handling charactername autocomplete for pouch.');

              // Fetch vending characters owned by the user
              const characters = await fetchCharactersByUserId(userId);

              const vendingCharacters = characters.filter(character =>
                  ['merchant', 'shopkeeper'].includes(character.job?.toLowerCase())
              );

              if (!vendingCharacters || vendingCharacters.length === 0) {
                  console.warn('[handleVendingAutocomplete]: No vending characters found for the user.');
                  return await interaction.respond([]);
              }

              // Map vending characters to autocomplete choices
              const choices = vendingCharacters.map(character => ({
                  name: `${character.name} (${character.currentVillage})`,
                  value: character.name,
              }));

              await respondWithFilteredChoices(interaction, focusedOption, choices); // Respond with vending characters
          } else {
              console.warn(`[handleVendingAutocomplete]: Unsupported focused option '${focusedOption.name}' for subcommand 'pouch'.`);
              await interaction.respond([]);
          }
      } else if (subcommand === 'sync') {
          if (focusedOption.name === 'charactername') {
              console.log('[handleVendingAutocomplete]: Handling charactername autocomplete for sync.');

              // Fetch characters owned by the user
              const characters = await fetchCharactersByUserId(userId);
              if (!characters || characters.length === 0) {
                  console.warn('[handleVendingAutocomplete]: No characters found for the user.');
                  return await interaction.respond([]);
              }

              // Filter characters based on vendingSync status
              const unsyncedCharacters = characters.filter(character => !character.vendingSync);
              const choices = unsyncedCharacters.map(character => ({
                  name: `${character.name}`,
                  value: character.name,
              }));

              await respondWithFilteredChoices(interaction, focusedOption, choices); // Respond with unsynced characters
          } else {
              console.warn(`[handleVendingAutocomplete]: Unsupported focused option '${focusedOption.name}' for subcommand 'sync'.`);
              await interaction.respond([]);
          }
      } else if (subcommand === 'viewshop') {
          if (focusedOption.name === 'charactername') {
              console.log('[handleVendingAutocomplete]: Handling charactername autocomplete for viewshop.');

              // Fetch characters owned by the user
              const characters = await Character.find({ vendingSetup: true }); // Only fetch characters with vendingSetup true
              if (!characters || characters.length === 0) {
                  console.warn('[handleVendingAutocomplete]: No characters found with vending setup enabled.');
                  return await interaction.respond([]);
              }

              // Map characters to autocomplete choices
              const choices = characters.map(character => ({
                  name: `${character.name} (${character.currentVillage})`,
                  value: character.name,
              }));

              await respondWithFilteredChoices(interaction, focusedOption, choices); // Respond with characters for viewshop
          } else {
              console.warn(`[handleVendingAutocomplete]: Unsupported focused option '${focusedOption.name}' for subcommand 'viewshop'.`);
              await interaction.respond([]);
          }
      } else {
          console.warn(`[handleVendingAutocomplete]: Unsupported subcommand '${subcommand}' or option name '${focusedOption.name}'.`);
          await interaction.respond([]);
      }
  } catch (error) {
      console.error('[handleVendingAutocomplete]: Error handling vending autocomplete:', error);
      await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for vending restock items -------------------
async function handleVendingRestockAutocomplete(interaction, focusedOption) {
  try {
    const characterName = interaction.options.getString('charactername');
    if (!characterName) {
      return await interaction.respond([]); // No character selected
    }

    const userId = interaction.user.id; // Get user ID

    // Fetch the character and validate
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      console.warn(`[handleVendingRestockAutocomplete]: Character '${characterName}' not found.`);
      return await interaction.respond([]);
    }

    // Fetch the current vending stock list
    const stockList = await getCurrentVendingStockList();
    if (!stockList || !stockList.stockList) {
      console.warn(`[handleVendingRestockAutocomplete]: No stock list found.`);
      return await interaction.respond([]);
    }

    // Get the character's current village and normalize the name
    const normalizedVillage = character.currentVillage.toLowerCase().trim();
    const villageStock = stockList.stockList[normalizedVillage] || [];

    // Filter items based on character's job and vending type
    const filteredVillageItems = villageStock.filter(
      item => item.vendingType.toLowerCase() === character.job.toLowerCase()
    );

    // Format limited items to include stock quantity
    const limitedItems = (stockList.limitedItems || []).map(item => ({
      ...item,
      formattedName: `${item.itemName} - ${item.points} points - Qty: ${item.stock}`,
    }));

    // Combine village items and formatted limited items
    const allAvailableItems = [
      ...filteredVillageItems.map(item => ({
        ...item,
        formattedName: `${item.itemName} - ${item.points} points`, // Format for village items
      })),
      ...limitedItems, // Add formatted limited items
    ];

    // Filter items based on the user's input
    const searchQuery = focusedOption.value.toLowerCase();
    const filteredItems = allAvailableItems
      .filter(item => item.itemName.toLowerCase().includes(searchQuery)) // Filter by item name
      .map(item => ({
        name: item.formattedName, // Display formatted name
        value: item.itemName, // Use itemName as value
      }))
      .slice(0, 25); // Limit to 25 results

    await interaction.respond(filteredItems); // Respond with filtered items
  } catch (error) {
    console.error('[handleVendingRestockAutocomplete]: Error:', error);
    await interaction.respond([]); // Respond with empty array on error
  }
}

// ------------------- Handles autocomplete for vending barter items -------------------
async function handleVendingBarterAutocomplete(interaction, focusedOption) {
  try {
    const characterName = interaction.options.getString('charactername');
    if (!characterName) {
      return await interaction.respond([]); // No character selected
    }

    // Connect to the vending database
    const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
    await client.connect();
    const db = client.db('vending'); // Database containing vending collections

    // Access the collection named after the character
    const inventoryCollection = db.collection(characterName.toLowerCase());
    const items = await inventoryCollection.find({}).toArray(); // Fetch all items

    if (!items || items.length === 0) {
      await client.close();
      return await interaction.respond([]); // No items found in the collection
    }

    // Filter items based on user input
    const searchQuery = focusedOption.value.toLowerCase();
    const filteredItems = items
      .filter(item => item.itemName.toLowerCase().includes(searchQuery)) // Filter by item name
      .map(item => ({
        name: `${item.itemName} - Qty: ${item.stockQty}`, // Display item name and quantity
        value: item.itemName, // Use item name as the value
      }))
      .slice(0, 25); // Limit to 25 results

    await client.close(); // Close the database connection
    await interaction.respond(filteredItems); // Respond with filtered items
  } catch (error) {
    console.error('[handleVendingBarterAutocomplete]: Error:', error);
    await interaction.respond([]); // Respond with empty array on error
  }
}

// ------------------- Handles autocomplete for vending view shop -------------------
async function handleViewVendingShopAutocomplete(interaction) {
  const focusedOption = interaction.options.getFocused(true);
  if (focusedOption.name !== 'charactername') return;

  try {
      // Define target job names for vending characters
      const targetJobs = ['merchant', 'shopkeeper'];

      // Fetch characters with vending jobs using case-insensitive comparison
      const characters = await Character.find({
          job: { $regex: new RegExp(`^(${targetJobs.join('|')})$`, 'i') } // Regex for case-insensitive match
      });

      // Filter and map results for autocomplete
      const choices = characters.map(character => ({
          name: character.name,
          value: character.name
      }));

      await interaction.respond(choices.slice(0, 25)); // Limit to 25 results
  } catch (error) {
      console.error('[handleViewVendingShopAutocomplete]: Error:', error);
      await interaction.respond([]);
  }
}

// ------------------- Handles autocomplete for vending editshop items -------------------
async function handleVendingEditShopAutocomplete(interaction, focusedOption) {
  try {
      const characterName = interaction.options.getString('charactername');
      if (!characterName) {
          return await interaction.respond([]); // No character selected
      }

      const userId = interaction.user.id; // Get user ID

      // Fetch the character and validate
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
          console.warn(`[handleVendingEditShopAutocomplete]: Character '${characterName}' not found.`);
          return await interaction.respond([]);
      }

      // Connect to the vending database
      const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
      await client.connect();
      const db = client.db('vending');
      const inventoryCollection = db.collection(characterName.toLowerCase());

      // Fetch all items in the character's shop inventory
      const shopItems = await inventoryCollection.find({}).toArray();
      if (!shopItems || shopItems.length === 0) {
          console.warn(`[handleVendingEditShopAutocomplete]: No items found in '${characterName}'s shop.`);
          await client.close();
          return await interaction.respond([]);
      }

      // Filter items based on user input
      const searchQuery = focusedOption.value.toLowerCase();
      const filteredItems = shopItems
          .filter(item => item.itemName.toLowerCase().includes(searchQuery))
          .map(item => ({
              name: `${item.itemName}`,
              value: item.itemName,
          }))
          .slice(0, 25); // Limit to 25 results

      await client.close();
      await interaction.respond(filteredItems); // Respond with filtered items
  } catch (error) {
      console.error('[handleVendingEditShopAutocomplete]: Error:', error);
      await interaction.respond([]); // Respond with empty array on error
  }
}


// ------------------- Handles autocomplete for viewing character inventory -------------------
async function handleViewInventoryAutocomplete(interaction, focusedOption) {
  try {
    //format Fetch all characters from the database
    const characters = await fetchAllCharacters();

    //format Map characters to autocomplete choices
    const choices = characters.map(character => ({
      name: character.name, //format Display character name
      value: character._id.toString(), //format Use character ID as value
    }));

    //format Respond with filtered character choices
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    //format Log and handle errors gracefully
    console.error('[handleViewInventoryAutocomplete]: Error handling inventory autocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for village-based commands -------------------
async function handleVillageBasedCommandsAutocomplete(interaction, focusedOption) {
  try {
    //format Fetch all villages and map them to autocomplete choices
    const choices = getAllVillages().map(village => ({
      name: village, //format Display village name
      value: village, //format Use village name as value
    }));

    //format Respond with filtered village choices
    await respondWithFilteredChoices(interaction, focusedOption, choices);
  } catch (error) {
    //format Log and handle errors gracefully
    console.error('[handleVillageBasedCommandsAutocomplete]: Error handling village autocomplete:', error);
    await safeRespondWithError(interaction);
  }
}

// ------------------- Handles autocomplete for mount names -------------------
async function handleMountNameAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');

    // Ensure a character name is provided
    if (!characterName) {
      await interaction.respond([]);
      return;
    }

    // Fetch the character by name and user ID
    const character = await fetchCharacterByNameAndUserId(characterName, userId);

    // Ensure the character exists
    if (!character) {
      await interaction.respond([]);
      return;
    }

    // Fetch only mounts belonging to the character
    const mounts = await Mount.find({ owner: character.name });

    // Map mounts to autocomplete choices
    const choices = mounts.map(mount => ({
      name: mount.name, // Display mount name
      value: mount.name // Use mount name as value
    })).slice(0, 25); // Limit to 25 results

    await interaction.respond(choices);
  } catch (error) {
    console.error('Error handling mount name autocomplete:', error);
    await interaction.respond([]);
  }
}

// ------------------- handle Village Materials Autocomplete -------------------
async function handleVillageMaterialsAutocomplete(interaction) {
  const focusedValue = interaction.options.getFocused(); // User input
  const villageName = interaction.options.getString('name');
  const characterName = interaction.options.getString('charactername'); // Selected character name
  const userId = interaction.user.id;

  console.log(`[autocomplete] Triggered for user: ${userId}, village: ${villageName}, character: ${characterName}, input: "${focusedValue}"`);

  try {
      // Fetch village details
      const village = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });
      if (!village) {
          console.warn(`[autocomplete] Village "${villageName}" not found.`);
          return interaction.respond([]);
      }

      const nextLevel = village.level + 1;

      // Extract required materials
      const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;
      const requiredMaterials = Object.keys(materials).filter(
          (materialName) => materials[materialName].required?.[nextLevel] !== undefined
      );

      if (!requiredMaterials.length) {
          console.warn(`[autocomplete] No required materials for level ${nextLevel}.`);
          return interaction.respond([]);
      }

      // Validate character name
      if (!characterName) {
          console.warn(`[autocomplete] No character name provided.`);
          return interaction.respond([]);
      }

      const character = await Character.findOne({ userId, name: { $regex: `^${characterName}$`, $options: 'i' } }).lean();
      if (!character) {
          console.warn(`[autocomplete] Character "${characterName}" not found for user: ${userId}.`);
          return interaction.respond([]);
      }

      const inventoriesConnection = await connectToInventories();
      const db = inventoriesConnection.useDb('inventories');
      const inventoryCollection = db.collection(character.name.toLowerCase());

      // Fetch character's inventory
      const inventoryItems = await inventoryCollection.find({}).toArray();
      const materialsMap = {};

      // Match inventory items with required materials
      inventoryItems.forEach((item) => {
          const lowerCaseItemName = item.itemName.toLowerCase();
          const matchingMaterial = requiredMaterials.find((material) => material.toLowerCase() === lowerCaseItemName);

          if (matchingMaterial) {
              if (!materialsMap[matchingMaterial]) {
                  materialsMap[matchingMaterial] = 0;
              }
              materialsMap[matchingMaterial] += item.quantity;
          }
      });

      // Combine duplicates and format response
      const filteredMaterials = Object.entries(materialsMap)
          .filter(([itemname]) => itemname.toLowerCase().includes(focusedValue.toLowerCase()))
          .map(([itemname, quantity]) => ({
              name: `${itemname} (qty ${quantity})`,
              value: itemname,
          }));

      console.log(`[autocomplete] Responding with ${filteredMaterials.length} options.`);
      await interaction.respond(filteredMaterials.slice(0, 25)); // Respond with up to 25 matches
  } catch (error) {
      console.error(`[autocomplete] Error:`, error);
      await interaction.respond([]); // Safely respond with no results
  }
}

// ------------------- handle Village Upgrade Character Autocomplete -------------------
async function handleVillageUpgradeCharacterAutocomplete(interaction) {
  const userId = interaction.user.id;
  const villageName = interaction.options.getString('name'); // Get the selected village name

  try {
      if (!villageName) {
          console.warn('[handleVillageUpgradeCharacterAutocomplete]: No village name provided.');
          return interaction.respond([]);
      }

      const characters = await fetchCharactersByUserId(userId);

      const focusedValue = interaction.options.getFocused().toLowerCase();
      const choices = characters
          .filter(character => 
              character.homeVillage?.toLowerCase() === villageName.toLowerCase() && 
              character.name.toLowerCase().includes(focusedValue)
          )
          .map(character => ({
              name: `${character.name}`,
              value: character.name
          }));

      await interaction.respond(choices.slice(0, 25)); // Respond with up to 25 matches
  } catch (error) {
      console.error('[handleVillageUpgradeCharacterAutocomplete]: Error:', error);
      await interaction.respond([]); // Safely respond with no results
  }
}

// ------------------- handle Change Job New Job Autocomplete -------------------
async function handleChangeJobNewJobAutocomplete(interaction, focusedOption) {
  try {
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');

    // Fetch the character
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      console.warn(`[handleChangeJobNewJobAutocomplete] Character not found for userId: ${userId}, characterName: ${characterName}`);
      await interaction.respond([]);
      return;
    }
    // Fetch general and village-specific jobs
    const generalJobs = getGeneralJobsPage(1).concat(getGeneralJobsPage(2));
    const villageJobs = getVillageExclusiveJobs(character.homeVillage);

    // Combine and filter jobs
    const allJobs = [...generalJobs, ...villageJobs];
    const filteredJobs = focusedOption.value
      ? allJobs.filter(job =>
          job.toLowerCase().includes(focusedOption.value.toLowerCase())
        )
      : allJobs;
    // Respond with filtered jobs (limit to 25)
    const formattedChoices = filteredJobs.map(job => ({
      name: job,
      value: job,
    }));

    await interaction.respond(formattedChoices.slice(0, 25));
  } catch (error) {
    console.error(`[handleChangeJobNewJobAutocomplete] Error:`, error);
    await interaction.respond([]);
  }
}

// ------------------- handle Item Job Voucher Autocomplete -------------------
async function handleItemJobVoucherAutocomplete(interaction, focusedOption) {
  try {
      const userId = interaction.user.id;
      const characterName = interaction.options.getString('charactername');

      if (!characterName) {
          console.warn(`[handleItemJobVoucherAutocomplete] No character name provided.`);
          await interaction.respond([]);
          return;
      }

      // Fetch the character details
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
          console.warn(`[handleItemJobVoucherAutocomplete] Character not found for userId: ${userId}, characterName: ${characterName}`);
          await interaction.respond([]);
          return;
      }

      // Fetch general and current village-specific jobs
      const generalJobs = getGeneralJobsPage(1).concat(getGeneralJobsPage(2)); // General jobs
      const villageJobs = getVillageExclusiveJobs(character.currentVillage); // Jobs for the current village

      // Combine and filter jobs
      const allJobs = [...generalJobs, ...villageJobs];
      const filteredJobs = focusedOption.value
          ? allJobs.filter(job =>
              job.toLowerCase().includes(focusedOption.value.toLowerCase())
          )
          : allJobs;

      // Format and respond with filtered job options (limit to 25)
      const formattedChoices = filteredJobs.map(job => ({
          name: job,
          value: job,
      }));

      await interaction.respond(formattedChoices.slice(0, 25));
  } catch (error) {
      console.error(`[handleItemJobVoucherAutocomplete] Error:`, error);
      await interaction.respond([]); // Respond with an empty array in case of error
  }
}

// ------------------- Export Functions -------------------
module.exports = {
  handleAutocomplete,
  handleBlightCharacterAutocomplete,
  handleBlightItemAutocomplete,
  handleCharacterBasedCommandsAutocomplete,
  handleCraftingAutocomplete,
  handleCreateCharacterRaceAutocomplete,
  handleCreateCharacterVillageAutocomplete,
  handleEditCharacterAutocomplete,
  handleExploreItemAutocomplete,
  handleExploreRollCharacterAutocomplete,
  handleGearAutocomplete,
  handleGiftAutocomplete,
  handleHealAutocomplete,
  handleItemHealAutocomplete,
  handleLookupAutocomplete,
  handleMountAutocomplete,
  handleShopsAutocomplete,
  handleTradeAutocomplete,
  handleTransferAutocomplete,
  handleTravelAutocomplete,
  handleVendingAutocomplete,
  handleVendingRestockAutocomplete,
  handleVendingBarterAutocomplete,
  handleViewInventoryAutocomplete,
  handleViewVendingShopAutocomplete,
  handleVendingEditShopAutocomplete,
  handleVillageBasedCommandsAutocomplete,
  handleMountNameAutocomplete,
  handleVillageMaterialsAutocomplete,
  handleVillageUpgradeCharacterAutocomplete,
  handleChangeJobNewJobAutocomplete,
  handleItemJobVoucherAutocomplete
};

