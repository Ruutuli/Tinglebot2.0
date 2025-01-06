// ------------------- Gather Command Module -------------------
// This module handles the gathering of items based on the character's job and location.

// ------------------- Import Section -------------------

// Standard Libraries
const { SlashCommandBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');

// Database Services
const { fetchCharacterByNameAndUserId, fetchCharactersByUserId, updateCharacterById } = require('../database/characterService');
const { fetchAllItems, fetchItemsByMonster,fetchItemByName  } = require('../database/itemService');
const { fetchAllMonsters } = require('../database/monsterService');

// Modules
const { createWeightedItemList, calculateFinalValue } = require('../modules/rngModule');
const { generateVictoryMessage, generateDamageMessage, generateFinalOutcomeMessage } = require('../modules/flavorTextModule');
const { getEncounterOutcome } = require('../modules/damageModule');
const { getJobPerk, normalizeJobName, isValidJob } = require('../modules/jobsModule');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { useHearts, handleKO, updateCurrentHearts } = require('../modules/characterStatsModule');
const { capitalizeWords } = require('../modules/formattingModule');

// Utilities
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { isBloodMoonActive } = require('../scripts/bloodmoon');

// Embeds
const { createGatherEmbed, createMonsterEncounterEmbed } = require('../embeds/mechanicEmbeds');

// ------------------- Village Channels -------------------
const villageChannels = {
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Inariko: process.env.INARIKO_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL,
};

// ------------------- Command Definition -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('gather')
    .setDescription('Gather items based on your character\'s job and location')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)),

  // ------------------- Command Execution Logic -------------------
  async execute(interaction) {
    try {
      // Defer the reply to allow time for processing
      await interaction.deferReply();

      // Retrieve character name and user ID
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

// ------------------- Step 1: Validate Character -------------------
const character = await fetchCharacterByNameAndUserId(characterName, userId);
if (!character) {
  // If the character is not found or doesn't belong to the user
  await interaction.editReply({
    content: `❌ **Character ${characterName} not found or does not belong to you.**`,
  });
  return;
}

// Check if the character is debuffed
if (character.debuff?.active) {
  const debuffEndDate = new Date(character.debuff.endDate);
  const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000); // Convert to Unix timestamp
  await interaction.editReply({
    content: `❌ **${character.name} is currently debuffed and cannot gather.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
    ephemeral: true, // Keep this message private to the user
  });
  return;
}

// ------------------- Step 2: Validate Interaction Channel -------------------
const currentVillage = capitalizeWords(character.currentVillage); // Capitalize for consistency
const allowedChannel = villageChannels[currentVillage]; // Retrieve the allowed channel for the village

if (!allowedChannel || interaction.channelId !== allowedChannel) {
  // Provide the channel mention for clarity
  const channelMention = `<#${allowedChannel}>`;
  await interaction.editReply({
    content: `❌ **You can only use this command in the ${currentVillage} Town Hall channel!**\n📍 **Current Location:** ${currentVillage}\n💬 **Command Allowed In:** ${channelMention}`,
  });
  return;
}


// ------------------- Step 3: Validate Inventory -------------------
if (!character.inventorySynced) {
  // Notify the user if the inventory is not set up
  await interaction.editReply({
    content: `❌ **Inventory not set up.**\n🛠️ **Please use the required commands to initialize your inventory before gathering.**`,
    ephemeral: true, // Keep this message private to the user
  });
  return;
}

// ------------------- Step 4: Validate Job -------------------
let job = (character.jobVoucher === true || character.jobVoucher === "true") ? character.jobVoucherJob : character.job;
console.log(`[Gather Command]: Determined job for ${character.name} is "${job}"`);

// Validate job
if (!job || typeof job !== 'string' || !job.trim() || !isValidJob(job)) {
    console.log(`[Gather Command]: Invalid or unsupported job detected for ${character.name}. Job: "${job}"`);
    await interaction.editReply({
        content: `❌ **Oh no! ${character.name} can't gather as an invalid or unsupported job (${job || "None"}).**\n✨ **Why not try a Job Voucher to explore exciting new roles?**`,
        ephemeral: true,
    });
    return;
}

// Check for gathering perks
const jobPerk = getJobPerk(job);
console.log(`[Gather Command]: Retrieved job perks for ${job}:`, jobPerk);

if (!jobPerk || !jobPerk.perks.includes('GATHERING')) {
    console.log(`[Gather Command]: ${character.name} lacks gathering skills for job: "${job}"`);
    await interaction.editReply({
        content: `❌ **Hmm, ${character.name} can’t gather as a ${job} because they lack the necessary gathering skills.**\n🔄 **Consider switching to a role better suited for gathering, or use a Job Voucher to try something fresh!**`,
        ephemeral: true,
    });
    return;
}

// Handle active job voucher
if (character.jobVoucher) {
  console.log(`[Gather Command]: Job voucher detected for ${character.name}. Consuming voucher.`);
  character.jobVoucher = false;
  character.jobVoucherJob = null;
  await updateCharacterById(character._id, { jobVoucher: false, jobVoucherJob: null });

  // Fetch job voucher details from the database
  const jobVoucherItem = await fetchItemByName('Job Voucher');
  if (!jobVoucherItem) {
      console.error('[Gather Command]: Job Voucher item details could not be found in the database.');
      await interaction.followUp({
          content: `❌ **Error: Could not log Job Voucher usage. Please contact support.**`,
          ephemeral: true
      });
      return;
  }

  // Log job voucher usage to Google Sheets
  const inventoryLink = character.inventory || character.inventoryLink;
  if (typeof inventoryLink === 'string' && isValidGoogleSheetsUrl(inventoryLink)) {
      const spreadsheetId = extractSpreadsheetId(inventoryLink);
      const auth = await authorizeSheets();
      const range = 'loggedInventory!A2:M';
      const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
      const uniqueSyncId = uuidv4();

      const values = [
          [
              character.name,                        // Character Name
              jobVoucherItem.itemName,              // Item Name (Job Voucher)
              '-1',                                  // Quantity Used
              jobVoucherItem.category.join(', '),   // Category from database
              jobVoucherItem.type.join(', '),       // Type from database
              jobVoucherItem.subtype.join(', ') || '', // Subtype from database
              `Redeemed for gathering as ${job}`,   // Action/Use Description
              job,                                  // Associated Job
              '',                                   // Perk (if applicable)
              character.currentVillage,             // Village
              interactionUrl,                       // Link to interaction
              formattedDateTime,                    // Timestamp
              uniqueSyncId                          // Unique Sync ID
          ]
      ];

      await appendSheetData(auth, spreadsheetId, range, values);
  }
}


// ------------------- Step 5: Validate Region -------------------
const region = getVillageRegionByName(currentVillage); // Determine the region for the character's current village

if (!region) {
  // Notify the user if no region is found for the village
  await interaction.editReply({
    content: `❌ **No valid region found for the village ${currentVillage}.**\n📍 **Please check the character's current location and try again.**`,
  });
  return;
}

// ------------------- Helper Function: Generate Outcome Message -------------------
function generateOutcomeMessage(outcome) {
  // Check for KO result
  if (outcome.result === 'KO') {
    return generateDamageMessage('KO');
  }

  // Check for heart-related damage
  if (outcome.hearts) {
    return generateDamageMessage(outcome.hearts);
  }

  // Check for defense success
  if (outcome.defenseSuccess) {
    return generateDefenseBuffMessage(
      outcome.defenseSuccess,
      outcome.adjustedRandomValue,
      outcome.damageValue
    );
  }

  // Check for attack success
  if (outcome.attackSuccess) {
    return generateAttackBuffMessage(
      outcome.attackSuccess,
      outcome.adjustedRandomValue,
      outcome.damageValue
    );
  }

  // Check for victory or loot outcome
  if (outcome.result === 'Win!/Loot') {
    return generateVictoryMessage(
      outcome.adjustedRandomValue,
      outcome.defenseSuccess,
      outcome.attackSuccess
    );
  }

  // Generate a final outcome message if no specific condition is met
  return generateFinalOutcomeMessage(
    outcome.damageValue,
    outcome.defenseSuccess,
    outcome.attackSuccess,
    outcome.adjustedRandomValue,
    outcome.damageValue
  );
}

// ------------------- Helper Function: Generate Looted Item -------------------
function generateLootedItem(encounteredMonster, weightedItems) {
  // Select a random item from the weighted list
  const randomIndex = Math.floor(Math.random() * weightedItems.length);
  const lootedItem = { ...weightedItems[randomIndex] }; // Clone the item to avoid modifying the original

  // Special handling for Chuchu-type monsters
  if (encounteredMonster.name.includes('Chuchu')) {
    const jellyType = determineJellyType(encounteredMonster.name);
    const quantity = determineJellyQuantity(encounteredMonster.name);
    lootedItem.itemName = jellyType;
    lootedItem.quantity = quantity;
  } else {
    // Default quantity for non-Chuchu items
    lootedItem.quantity = 1;
  }

  return lootedItem;
}

// ------------------- Helper Function: Determine Jelly Type -------------------
function determineJellyType(monsterName) {
  if (monsterName.includes('Ice')) return 'White Chuchu Jelly';
  if (monsterName.includes('Fire')) return 'Red Chuchu Jelly';
  if (monsterName.includes('Electric')) return 'Yellow Chuchu Jelly';
  return 'Chuchu Jelly'; // Default type
}

// ------------------- Helper Function: Determine Jelly Quantity -------------------
function determineJellyQuantity(monsterName) {
  if (monsterName.includes('Large')) return 3;
  if (monsterName.includes('Medium')) return 2;
  return 1; // Default quantity
}

// ------------------- Encounter Determination -------------------

// Determine Blood Moon and encounter probabilities
const randomChance = Math.random();
const bloodMoonActive = isBloodMoonActive();

// Check for Blood Moon or Monster Encounter (25% chance for monsters during Blood Moon)
if (bloodMoonActive && randomChance < 0.25) {
  // Fetch all monsters and filter by region and tier
  const allMonsters = await fetchAllMonsters();
  const monstersByRegion = allMonsters.filter(
    monster => monster[region.toLowerCase()] && monster.tier >= 1 && monster.tier <= 4
  );

  if (monstersByRegion.length > 0) {
    // Randomly select a monster to encounter
    const encounteredMonster = monstersByRegion[Math.floor(Math.random() * monstersByRegion.length)];

    // Calculate encounter values
    const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);

    // Determine the outcome of the encounter
    const outcome = await getEncounterOutcome(
      character,
      encounteredMonster,
      damageValue,
      adjustedRandomValue,
      attackSuccess,
      defenseSuccess
    );

    // Deduct hearts if damage occurred
    if (outcome.hearts) {
      await useHearts(character._id, outcome.hearts);
      if (outcome.result === 'KO') {
        await handleKO(character._id); // Handle character knockout
      }
    }

    // Update the character's remaining hearts
    const heartsRemaining = Math.max(character.currentHearts - outcome.hearts, 0);
    await updateCurrentHearts(character._id, heartsRemaining);

    // Generate the encounter outcome message
    const outcomeMessage = generateOutcomeMessage(outcome);

    // Handle loot if the encounter was a victory
    if (outcome.canLoot && !outcome.hearts) {
      const items = await fetchItemsByMonster(encounteredMonster.name);
      const weightedItems = createWeightedItemList(items, adjustedRandomValue);

      if (weightedItems.length > 0) {
        const lootedItem = generateLootedItem(encounteredMonster, weightedItems);

        // Validate the inventory link
        const inventoryLink = character.inventory || character.inventoryLink;
        if (typeof inventoryLink !== 'string' || !isValidGoogleSheetsUrl(inventoryLink)) {
          const embed = createMonsterEncounterEmbed(
            character,
            encounteredMonster,
            outcomeMessage,
            heartsRemaining,
            lootedItem,
            bloodMoonActive
          );
          await interaction.editReply({
            content: `❌ **Invalid Google Sheets URL for "${character.name}".**`,
            embeds: [embed],
          });
          return;
        }

        // Log loot to the database and Google Sheets
        const spreadsheetId = extractSpreadsheetId(inventoryLink);
        const auth = await authorizeSheets();
        const range = 'loggedInventory!A2:M';
        const uniqueSyncId = uuidv4();
        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

        const values = [
          [
            character.name,
            lootedItem.itemName,
            lootedItem.quantity.toString(),
            lootedItem.category.join(', '),
            lootedItem.type.join(', '),
            lootedItem.subtype.join(', '),
            'Looted',
            character.job,
            '',
            character.currentVillage,
            interactionUrl,
            formattedDateTime,
            uniqueSyncId,
          ],
        ];

        await addItemInventoryDatabase(
          character._id,
          lootedItem.itemName,
          lootedItem.quantity,
          lootedItem.category.join(', '),
          lootedItem.type.join(', '),
          interaction
        );
        await appendSheetData(auth, spreadsheetId, range, values);

        // Reply with loot details
        const embed = createMonsterEncounterEmbed(
          character,
          encounteredMonster,
          outcomeMessage,
          heartsRemaining,
          lootedItem,
          bloodMoonActive
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }
    }

    // If no loot or other encounter outcome
    const embed = createMonsterEncounterEmbed(
      character,
      encounteredMonster,
      outcomeMessage,
      heartsRemaining,
      null,
      bloodMoonActive
    );
    await interaction.editReply({ embeds: [embed] });
    return;
  } else {
    // Handle the case where no monsters are found in the region
    await interaction.editReply({
      content: `⚠️ **No monsters found in the ${region} region during the Blood Moon.**`,
    });
    return;
  }

// ------------------- Normal Gathering Logic -------------------
} else {
  // When there is no Blood Moon or outside the 25% monster encounter chance
  const items = await fetchAllItems();

  // Filter items based on the character's job and region
  const availableItems = items.filter(item => {
    if (job === 'AB (Meat)') {
      return item.abMeat && item[region.toLowerCase()];
    } else if (job === 'AB (Live)') {
      return item.abLive && item[region.toLowerCase()];
    } else {
      const jobKey = normalizeJobName(job);
      return item[jobKey] && item[region.toLowerCase()];
    }
  });

  if (availableItems.length === 0) {
    await interaction.editReply({
      content: `⚠️ **No items available to gather in this location with the given job.**`,
    });
    return;
  }

  // ------------------- Weighted Item Selection -------------------
  // Create a weighted list of items based on rarity
  const weightedItems = createWeightedItemList(availableItems);

  // Select a random item from the weighted list
  const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];

  // ------------------- Update Inventory and Log Gathering -------------------
  // Add the gathered item to the character's inventory database
  const quantity = 1; // Assuming only 1 item is gathered per action
  await addItemInventoryDatabase(
    character._id,
    randomItem.itemName,
    quantity,
    randomItem.category.join(', '),
    randomItem.type.join(', '),
    interaction
  );

  // Validate the character's inventory link
  const inventoryLink = character.inventory || character.inventoryLink;
  if (typeof inventoryLink !== 'string' || !isValidGoogleSheetsUrl(inventoryLink)) {
    await interaction.editReply({
      content: `❌ **Invalid or missing Google Sheets URL for character ${characterName}.**`,
    });
    return;
  }

  // ------------------- Log Gathered Item to Google Sheets -------------------
  const spreadsheetId = extractSpreadsheetId(inventoryLink);
  const auth = await authorizeSheets();
  const range = 'loggedInventory!A2:M'; // Set the range for appending data to the Google Sheet
  const uniqueSyncId = uuidv4(); // Generate a unique sync ID for logging purposes
  const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`; // URL for referencing the interaction

  // Prepare the data to be appended to Google Sheets
  const values = [
    [
      character.name,                 // Character Name
      randomItem.itemName,            // Item Name
      quantity.toString(),            // Quantity of Item
      randomItem.category.join(', '), // Category
      randomItem.type.join(', '),     // Type
      randomItem.subtype.join(', '),  // Subtype
      'Gathering',                    // How the item was obtained
      character.job,                  // Job
      '',                             // Perk (optional)
      character.currentVillage,       // Location
      interactionUrl,                 // Link to the interaction
      formattedDateTime,              // Date/Time of gathering
      uniqueSyncId,                   // Unique Sync ID
    ],
  ];

  await appendSheetData(auth, spreadsheetId, range, values);

  // ------------------- Send Response to User -------------------
  // Create the embed message to display the gathered item and character details
  const embed = createGatherEmbed(character, randomItem);
  await interaction.editReply({ embeds: [embed] }); // Send the embed as a reply
}

// ------------------- Error Handling -------------------
} catch (error) {
  console.error(`[Gather Command Error]`, {
    message: error.message,
    stack: error.stack,
    interactionData: {
      userId: interaction.user.id,
      characterName: interaction.options.getString('charactername'),
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    },
  });

  // Notify the user of the error
  await interaction.editReply({
    content: `⚠️ **An error occurred during the gathering process. Debug info: ${error.message}.**`,
  });
 }
},

// ------------------- Autocomplete Handler -------------------
async autocomplete(interaction) {
  try {
    // Retrieve the focused option and user ID from the interaction
    const focusedOption = interaction.options.getFocused(true);
    const userId = interaction.user.id;

    if (focusedOption.name === 'charactername') {
      // Fetch all characters associated with the user
      const characters = await fetchCharactersByUserId(userId);

      // Log all fetched characters for debugging
      console.log('[Gather Autocomplete]: All fetched characters:', characters.map(c => c.name));

      // Filter characters based on gathering perks or active job vouchers
      const gatheringCharacters = characters.filter(character => {
        const jobPerk = getJobPerk(character.job);
        return (
          (jobPerk && jobPerk.perks.includes('GATHERING')) || 
          (character.jobVoucher === true || character.jobVoucher === "true")
        );
      });

      // Log eligible characters after filtering
      console.log('[Gather Autocomplete]: Eligible characters:', gatheringCharacters.map(c => c.name));

      // Create choices for the autocomplete dropdown
      const choices = gatheringCharacters.map(character => ({
        name: character.name,
        value: character.name,
      }));

      // Filter choices based on user input and limit to 25 options
      const filteredChoices = choices
        .filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .slice(0, 25);

      // Log the final filtered choices
      console.log('[Gather Autocomplete]: Final choices sent to user:', filteredChoices);

      // Respond with the filtered choices
      await interaction.respond(filteredChoices);
    }
  } catch (error) {
    // Log error details for debugging
    console.error(`[Autocomplete Handler Error]:`, {
      message: error.message,
      stack: error.stack,
    });

    // Respond with an empty array if an error occurs
    await interaction.respond([]);
  }
 }
};


// // ------------------- Helper Function: Generate Looted Item -------------------
// function generateLootedItem(encounteredMonster, weightedItems) {
//   const randomIndex = Math.floor(Math.random() * weightedItems.length);
//   const lootedItem = weightedItems[randomIndex];

//   if (encounteredMonster.name.includes('Chuchu')) {
//     const jellyType = encounteredMonster.name.includes('Ice')
//       ? 'White Chuchu Jelly'
//       : encounteredMonster.name.includes('Fire')
//       ? 'Red Chuchu Jelly'
//       : encounteredMonster.name.includes('Electric')
//       ? 'Yellow Chuchu Jelly'
//       : 'Chuchu Jelly';
//     const quantity = encounteredMonster.name.includes('Large')
//       ? 3
//       : encounteredMonster.name.includes('Medium')
//       ? 2
//       : 1;
//     lootedItem.itemName = jellyType;
//     lootedItem.quantity = quantity;
//   } else {
//     lootedItem.quantity = 1; // Default quantity for non-Chuchu items
//   }

//   return lootedItem;
// }