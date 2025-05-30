// ------------------- Import Section -------------------

// Standard Libraries
// (No standard libraries imported here)

// Third-Party Libraries
const { SlashCommandBuilder } = require("discord.js"); // Used to create slash commands for Discord bots
const { v4: uuidv4 } = require("uuid"); // Generates unique identifiers
require("dotenv").config();

// Database Services
const {
 fetchCharacterByNameAndUserId,
 fetchItemsByMonster,
} = require("../../database/db.js");
const { handleError } = require("../../utils/globalErrorHandler.js");

// Utilities
const {
 authorizeSheets,
 appendSheetData,
 safeAppendDataToSheet,
} = require("../../utils/googleSheetsUtils.js");
const {
 extractSpreadsheetId,
 isValidGoogleSheetsUrl,
} = require("../../utils/validation.js");
const { addItemInventoryDatabase } = require("../../utils/inventoryUtils.js");
const { isBloodMoonActive } = require("../../scripts/bloodmoon.js");
const { checkInventorySync } = require('../../utils/characterUtils');
const { enforceJail } = require('../../utils/jailCheck');

// Modules - Job, Location, Damage, and Formatting Logic
const { getJobPerk, isValidJob } = require("../../modules/jobsModule.js");
const { getVillageRegionByName } = require("../../modules/locationsModule.js");
const { getEncounterOutcome } = require("../../modules/encounterModule.js");
const { capitalizeWords } = require("../../modules/formattingModule.js");
const {
 activateJobVoucher,
 validateJobVoucher,
 fetchJobVoucherItem,
 deactivateJobVoucher,
 getJobVoucherErrorMessage
} = require("../../modules/jobVoucherModule.js"); // Importing jobVoucherModule

// Modules - RNG Logic
const {
 createWeightedItemList,
 getMonsterEncounterFromList,
 getMonstersByCriteria,
 calculateFinalValue,
 getRandomBloodMoonEncounter,
} = require("../../modules/rngModule.js");

// Event Handlers
const { triggerRaid } = require('../../modules/raidModule.js');

// Flavor Text and Messages
const {
 generateFinalOutcomeMessage,
 generateVictoryMessage,
 generateDamageMessage,
 generateDefenseBuffMessage,
 generateAttackBuffMessage,
} = require("../../modules/flavorTextModule.js");

// Embeds
const {
 createMonsterEncounterEmbed,
 createNoEncounterEmbed,
 createKOEmbed,
} = require("../../embeds/embeds.js");

// Models
const Character = require("../../models/CharacterModel.js");

// Character Stats
const { handleKO } = require("../../modules/characterStatsModule.js");

const villageChannels = {
 Rudania: process.env.RUDANIA_TOWN_HALL,
 Inariko: process.env.INARIKO_TOWN_HALL,
 Vhintl: process.env.VHINTL_TOWN_HALL,
};

// Modules - Weather Logic
const { getCurrentWeather } = require('../../modules/weatherModule.js');

// ------------------- Helper Functions -------------------
// Check if a daily roll is available for a specific activity
function canUseDailyRoll(character, activity) {
  // If character has an active job voucher, they can always use the command
  if (character.jobVoucher) {
    return true;
  }

  const now = new Date();
  // Compute the most recent 12:00 UTC (8am EST) rollover
  const rollover = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0));
  if (now < rollover) {
    // If before today's 12:00 UTC, use yesterday's 12:00 UTC
    rollover.setUTCDate(rollover.getUTCDate() - 1);
  }

  const lastRoll = character.dailyRoll?.[activity];
  if (!lastRoll) {
    console.log(`[loot.js]: 📅 No previous roll for ${activity}. Allowing action.`);
    return true;
  }

  const lastRollDate = new Date(lastRoll);
  console.log(`[loot.js]: 📅 now=${now.toISOString()} | lastRoll=${lastRollDate.toISOString()} | rollover=${rollover.toISOString()}`);
  return lastRollDate < rollover;
}

// Update the daily roll timestamp for an activity
async function updateDailyRoll(character, activity) {
  try {
    if (!character.dailyRoll) {
      character.dailyRoll = {};
    }
    const now = new Date().toISOString();
    character.dailyRoll[activity] = now;
    await character.save();
    console.log(`[loot.js]: ✅ Updated daily roll for ${activity} at ${now}`);
  } catch (error) {
    console.error(`[loot.js]: ❌ Failed to update daily roll for ${character.name}:`, error);
    throw error;
  }
}

// ------------------- Command Definition -------------------

// Define the `loot` slash command, allowing users to loot items based on their character's job and location
module.exports = {
 data: new SlashCommandBuilder()
  .setName("loot") // Command name
  .setDescription("Loot items based on your character's job and location") // Description of the command
  .addStringOption((option) =>
   option
    .setName("charactername")
    .setDescription("The name of the character")
    .setRequired(true)
    .setAutocomplete(true)
  ),

 // ------------------- Main Execution Logic -------------------
 async execute(interaction) {
  try {
   await interaction.deferReply();

   // ------------------- Step 1: Validate Character -------------------
   const characterName = interaction.options.getString("charactername"); // Fetch the character name from user input
   const userId = interaction.user.id; // Get the ID of the interacting user

   const character = await fetchCharacterByNameAndUserId(characterName, userId);
   if (!character) {
    await interaction.editReply({
     content: `❌ **Character "${characterName}" not found or doesn't belong to you!**`,
    });
    return;
   }

   // Check if character is in jail
   if (await enforceJail(interaction, character)) {
     return;
   }

   // ------------------- Step 2: Validate Interaction Channel -------------------
   let currentVillage = capitalizeWords(character.currentVillage); // Capitalize village name for consistency
   let allowedChannel = villageChannels[currentVillage]; // Get the allowed channel from environment variables

   // If using a job voucher for a village-exclusive job, override to required village
   if (character.jobVoucher && character.jobVoucherJob) {
     const voucherPerk = getJobPerk(character.jobVoucherJob);
     if (voucherPerk && voucherPerk.village) {
       const requiredVillage = capitalizeWords(voucherPerk.village);
       currentVillage = requiredVillage;
       allowedChannel = villageChannels[requiredVillage];
     }
   }

   if (!allowedChannel || interaction.channelId !== allowedChannel) {
    const channelMention = `<#${allowedChannel}>`;
    await interaction.editReply({
     content: `❌ **You can only use this command in the ${currentVillage} Town Hall channel!**\n${characterName} is currently in ${capitalizeWords(character.currentVillage)}! This command must be used in ${channelMention}.`,
    });
    return;
   }

   // ---- Blight Rain Infection Check ----
   const weather = await getCurrentWeather(character.currentVillage);
   if (weather?.special?.label === 'Blight Rain') {
     if (character.blighted) {
       const alreadyMsg =
         "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
         `◈ Your character **${character.name}** braved the blight rain, but they're already blighted... guess it doesn't matter! ◈`;
       await interaction.editReply({ content: alreadyMsg, ephemeral: false });
     } else if (Math.random() < 0.75) {
       const blightMsg =
         "<:blight_eye:805576955725611058> **Blight Infection!**\n\n" +
         `◈ Oh no... your character **${character.name}** has come into contact with the blight rain and has been **blighted**! ◈\n\n` +
         "You can be healed by **Oracles, Sages & Dragons**  \n" +
         "▹ [Blight Information](https://www.rootsofthewild.com/blight)  \n" +
         "▹ [Currently Available Blight Healers](https://discord.com/channels/603960955839447050/651614266046152705/845481974671736842)\n\n" +
         "**STAGE 1:**  \n" +
         "Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.\n\n" +
         "> **Starting tomorrow, you'll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n" +
         "> *You will not be penalized for missing today's blight roll if you were just infected.*";
       await interaction.editReply({ content: blightMsg, ephemeral: false });
       // Update character in DB
       character.blighted = true;
       character.blightedAt = new Date();
       character.blightStage = 1;
       
       await character.save();
       // Assign blighted role
       const guild = interaction.guild;
       if (guild) {
         const member = await guild.members.fetch(interaction.user.id);
         await member.roles.add('1314750575933653022');
       }
     } else {
       const safeMsg =
         "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
         `◈ Your character **${character.name}** braved the blight rain but managed to avoid infection this time! ◈\n` +
         "You feel lucky... but be careful out there.";
       await interaction.editReply({ content: safeMsg, ephemeral: false });
     }
   }

   // Check inventory sync before proceeding
   try {
     await checkInventorySync(character);
   } catch (error) {
     await interaction.editReply({
       content: error.message,
       ephemeral: true
     });
     return;
   }

   // ------------------- Step 3: Check Hearts and Job Validity -------------------
   if (character.currentHearts === 0) {
    const embed = createKOEmbed(character); // Create embed for KO status
    await interaction.editReply({ embeds: [embed] });
    return;
   }

   // Check for job voucher and daily roll AFTER all other validations
   if (character.jobVoucher) {
     console.log(`[Loot Command]: 🔄 Active job voucher found for ${character.name}`);
   } else {
     console.log(`[Loot Command]: 🔄 No active job voucher for ${character.name}`);
     
     // Check if loot has been used today
     const canLoot = canUseDailyRoll(character, 'loot');
     
     if (!canLoot) {
       const nextRollover = new Date();
       nextRollover.setUTCHours(12, 0, 0, 0); // 8AM EST = 12:00 UTC
       if (nextRollover < new Date()) {
         nextRollover.setUTCDate(nextRollover.getUTCDate() + 1);
       }
       const unixTimestamp = Math.floor(nextRollover.getTime() / 1000);
       
       await interaction.editReply({
         embeds: [{
           color: 0x008B8B, // Dark cyan color
           description: `*${character.name} seems exhausted from their earlier looting...*\n\n**Daily looting limit reached.**\nThe next opportunity to loot will be available at <t:${unixTimestamp}:F>.\n\n*Tip: A job voucher would allow you to loot again today.*`,
           footer: {
             text: 'Daily Activity Limit'
           }
         }],
         ephemeral: true,
       });
       return;
     }

     // Update daily roll AFTER all validations pass
     try {
       await updateDailyRoll(character, 'loot');
     } catch (error) {
       console.error(`[Loot Command]: ❌ Failed to update daily roll:`, error);
       await interaction.editReply({
         content: `❌ **An error occurred while updating your daily roll. Please try again.**`,
         ephemeral: true,
       });
       return;
     }
   }

   if (character.debuff?.active) {
    const debuffEndDate = new Date(character.debuff.endDate);
    const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
    await interaction.editReply({
     content: `❌ **${character.name} is currently debuffed and cannot loot. Please wait until the debuff expires.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
     ephemeral: true,
    });
    return;
   }

   // Check for blight stage 4 effect (no gathering)
   if (character.blightEffects?.noGathering) {
    await interaction.editReply({
     content: `❌ **${character.name}** cannot gather items due to advanced blight stage.`,
     ephemeral: true
    });
    return;
   }

   // Determine job based on jobVoucher or default job
   let job =
    character.jobVoucher && character.jobVoucherJob
     ? character.jobVoucherJob
     : character.job;
   console.log(`[loot.js]: 🔄 Job determined for ${character.name}: "${job}"`);

   // Validate job
   if (!job || typeof job !== "string" || !job.trim() || !isValidJob(job)) {
    console.error(
     `[loot.js]: ❌ Invalid job "${job}" for ${character.name}`
    );
    await interaction.editReply({
     content: getJobVoucherErrorMessage('MISSING_SKILLS', {
       characterName: character.name,
       jobName: job || "None"
     }).message,
     ephemeral: true,
    });
    return;
   }

   // Validate job voucher (without consuming it)
   let voucherCheck;
   if (character.jobVoucher) {
     console.log(`[loot.js]: 🎫 Validating job voucher for ${character.name}`);
     voucherCheck = await validateJobVoucher(character, job, 'LOOTING');
     if (!voucherCheck.success) {
       await interaction.editReply({
         content: voucherCheck.message,
         ephemeral: true,
       });
       return;
     }
     console.log(`[loot.js]: ✅ Job voucher validation successful for ${character.name}`);
   }

   // Validate job perks
   const jobPerk = getJobPerk(job);
   console.error(`[Loot Command]: Retrieved job perks for ${job}:`, jobPerk);

   if (!jobPerk || !jobPerk.perks.includes("LOOTING")) {
    console.error(
     `[Loot Command]: ${character.name} lacks looting skills for job: "${job}"`
    );
    await interaction.editReply({
     content: getJobVoucherErrorMessage('MISSING_SKILLS', {
       characterName: character.name,
       jobName: job
     }).message,
     ephemeral: true,
    });
    return;
   }

   // ------------------- Step 4: Determine Region and Encounter -------------------
   const region = getVillageRegionByName(currentVillage); // Get the region based on village
   if (!region) {
    // Reply if no region is found for the village
    console.log(`[LOOT] No region found for village: ${currentVillage}`);
    await interaction.editReply({
     content: `❌ **No region found for village "${currentVillage}".**`,
    });
    return;
   }

   // ------------------- Step 4: Blood Moon Encounter Handling -------------------
   const bloodMoonActive = isBloodMoonActive(); // Determine Blood Moon status
   let encounteredMonster;

   if (bloodMoonActive) {
    try {
     // Handle Blood Moon-specific encounter logic
     const encounterType = getRandomBloodMoonEncounter();

     // Normalize the encounter type
     const normalizedEncounterType = encounterType.trim().toLowerCase();

     // Handle "no encounter" cases
     if (
      normalizedEncounterType === "noencounter" ||
      normalizedEncounterType === "no encounter"
     ) {
      const embed = createNoEncounterEmbed(character, true); // Pass `true` for Blood Moon
      await interaction.followUp({ embeds: [embed] });
      return;
     }

     // Process other encounter types (tiers)
     const tier = parseInt(normalizedEncounterType.replace("tier", ""), 10);
     if (isNaN(tier)) {
      await interaction.followUp(
       `🌕 **Blood Moon is active, but no valid monsters could be determined.**`
      );
      return;
     }

     // Fetch and filter monsters matching the criteria
     const monstersByCriteria = await getMonstersByCriteria(
      currentVillage,
      job
     );
     const filteredMonsters = monstersByCriteria.filter(
      (monster) => monster.tier === tier
     );

     // Proceed if a monster is found; else attempt reroll logic
     if (filteredMonsters.length > 0) {
      encounteredMonster =
       filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];

      if (encounteredMonster.tier > 4) {
       await triggerRaid(
        character,
        encounteredMonster,
        interaction,
        null,
        true
       ); // Pass `true` for Blood Moon
       return;
      }
     } else {
      await handleBloodMoonRerolls(
       interaction,
       monstersByCriteria,
       tier,
       character,
       job,
       currentVillage,
       true // Blood Moon status
      );
      return; // Stop if reroll is needed and executed
     }
    } catch (error) {
     handleError(error, "loot.js");
     await interaction.followUp(
      `🌕 **Blood Moon is active, but an error occurred while determining an encounter.**`
     );
     return;
    }
   } else {
    // ------------------- Normal Encounter Logic -------------------
    encounteredMonster = await handleNormalEncounter(
     interaction,
     currentVillage,
     job,
     character,
     bloodMoonActive
    );

    if (!encounteredMonster) {
     // Send a "No Encounter" embed to the user
     const embed = createNoEncounterEmbed(character, bloodMoonActive); // Blood Moon is inactive here
     await interaction.editReply({ embeds: [embed] });
     return; // Stop execution after "No Encounter"
    }
   }
   await processLootingLogic(
    interaction,
    character,
    encounteredMonster,
    bloodMoonActive
   );

   // ------------------- Deactivate Job Voucher -------------------
   if (character.jobVoucher && !voucherCheck?.skipVoucher) {
     const deactivationResult = await deactivateJobVoucher(character._id);
     if (!deactivationResult.success) {
       console.error(`[Loot Command]: ❌ Failed to deactivate job voucher for ${character.name}`);
     }
   }

   // Remove duplicate daily roll update since we now do it at the start
   console.log(`[loot.js]: ✅ Loot command completed successfully for ${character.name}`);

  } catch (error) {
   handleError(error, "loot.js");
   await interaction.editReply({
    content: `❌ **An error occurred during the loot command execution.**`,
   });
  }
 },
};

// ------------------- Blood Moon Rerolls Logic -------------------
async function handleBloodMoonRerolls(
 interaction,
 monstersByCriteria,
 tier,
 character,
 job,
 currentVillage,
 bloodMoonActive
) {
 let rerollCount = 0;
 const maxRerolls = 5; // Limit the number of rerolls to prevent infinite loops

 while (rerollCount < maxRerolls) {
  const rerollTier = Math.floor(Math.random() * 10) + 1; // Randomly choose a tier (1-10)
  const rerolledMonsters = monstersByCriteria.filter(
   (monster) => monster.tier === rerollTier
  );

  if (rerolledMonsters.length > 0) {
   const encounteredMonster =
    rerolledMonsters[Math.floor(Math.random() * rerolledMonsters.length)];

   if (encounteredMonster.tier > 4) {
    await triggerRaid(
     character,
     encounteredMonster,
     interaction,
     null,
     bloodMoonActive
    ); // Let triggerRaid handle thread creation
    return;
   } else {
    await processLootingLogic(
     interaction,
     character,
     encounteredMonster,
     bloodMoonActive
    );
    return; // End reroll processing after looting
   }
  }

  rerollCount++;
 }

 // If rerolls are exhausted and no monster is found
 await interaction.followUp(
  `🌕 **Blood Moon is active: No suitable monster could be found after multiple attempts.**`
 );
 return null;
}

// ------------------- Normal Encounter Logic -------------------
async function handleNormalEncounter(interaction, currentVillage, job, character, bloodMoonActive) {
  // Check for blight stage 3 effect (no monsters)
  if (character.blightEffects?.noMonsters) {
    const embed = createNoEncounterEmbed(character, bloodMoonActive);
    await interaction.editReply({ embeds: [embed] });
    return null;
  }

  const monstersByCriteria = await getMonstersByCriteria(currentVillage, job);
  if (monstersByCriteria.length === 0) {
    const embed = createNoEncounterEmbed(character, bloodMoonActive); // Send "No Encounter" embed
    await interaction.editReply({ embeds: [embed] });
    return null;
  }

  const encounterResult = await getMonsterEncounterFromList(monstersByCriteria);
  if (encounterResult.encounter === "No Encounter") {
    const embed = createNoEncounterEmbed(character, bloodMoonActive); // Send "No Encounter" embed
    await interaction.editReply({ embeds: [embed] });
    return null;
  }

  const encounteredMonster =
    encounterResult.monsters[
      Math.floor(Math.random() * encounterResult.monsters.length)
    ];

  // Return the final encountered monster
  return encounteredMonster;
}


// ------------------- Looting Logic -------------------
async function processLootingLogic(
 interaction,
 character,
 encounteredMonster,
 bloodMoonActive
) {
 try {
  const items = await fetchItemsByMonster(encounteredMonster.name);

  // Step 1: Calculate Encounter Outcome
  const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } =
   calculateFinalValue(character);

  const weightedItems = createWeightedItemList(items, adjustedRandomValue);
  const outcome = await getEncounterOutcome(
   character,
   encounteredMonster,
   damageValue,
   adjustedRandomValue,
   attackSuccess,
   defenseSuccess
  );

  // Step 2: Handle KO Logic (if not already handled in getEncounterOutcome)
  const updatedCharacter = await Character.findById(character._id);
  if (!updatedCharacter) {
   throw new Error(
    `Unable to find updated character with ID ${character._id}`
   );
  }

  if (updatedCharacter.currentHearts === 0 && !updatedCharacter.ko) {
   await handleKO(updatedCharacter._id);
  }

  // Step 3: Generate Outcome Message
  const outcomeMessage = generateOutcomeMessage(outcome);

  // Step 4: Loot Item Logic
  if (outcome.canLoot && weightedItems.length > 0) {
   const lootedItem = generateLootedItem(encounteredMonster, weightedItems);

   const inventoryLink = character.inventory || character.inventoryLink;
   if (
    typeof inventoryLink !== "string" ||
    !isValidGoogleSheetsUrl(inventoryLink)
   ) {
    const embed = createMonsterEncounterEmbed(
     character,
     encounteredMonster,
     outcomeMessage,
     updatedCharacter.currentHearts,
     lootedItem,
     bloodMoonActive
    );
    await interaction.editReply({
     content: `❌ **Invalid Google Sheets URL for "${character.name}".**`,
     embeds: [embed],
    });
    return;
   }

   const spreadsheetId = extractSpreadsheetId(inventoryLink);
   const auth = await authorizeSheets();
   const range = "loggedInventory!A2:M";
   const uniqueSyncId = uuidv4();
   const formattedDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
   });
   const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

   const values = [
    [
     character.name,
     lootedItem.itemName,
     lootedItem.quantity.toString(),
     lootedItem.category.join(", "),
     lootedItem.type.join(", "),
     lootedItem.subtype.join(", "),
     "Looted",
     character.job,
     "",
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
    lootedItem.category.join(", "),
    lootedItem.type.join(", "),
    interaction
   );

   // —— Wrap the Sheets append in its own try/catch ——
   try {
    if (character?.name && character?.inventory && character?.userId) {
    await safeAppendDataToSheet(character.inventory, character, range, values, undefined, { 
        skipValidation: true,
        context: {
            commandName: 'loot',
            userTag: interaction.user.tag,
            userId: interaction.user.id,
            characterName: character.name,
            spreadsheetId: extractSpreadsheetId(character.inventory),
            range: range,
            sheetType: 'inventory',
            options: {
                monsterName: encounteredMonster.name,
                itemName: lootedItem.itemName,
                quantity: lootedItem.quantity,
                bloodMoonActive: bloodMoonActive
            }
        }
    });
} else {
    console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
}

   } catch (sheetError) {
    console.error(`[LOOT] Google Sheets append error: ${sheetError.message}`);
    await interaction.editReply({
     content:
      `❌ **Failed to write to your Google Sheet.**\n` +
      `> Make sure your **Inventory** link is a valid Google Sheets URL ` +
      `and that you've shared the sheet with the service account ` +
      `(the "client_email" in service_account.json).`,
     ephemeral: true,
    });
    return;
   }

   const embed = createMonsterEncounterEmbed(
    character,
    encounteredMonster,
    outcomeMessage,
    updatedCharacter.currentHearts,
    lootedItem,
    bloodMoonActive
   );
   await interaction.editReply({ embeds: [embed] });
   // ------------------- Update Last Loot Timestamp -------------------
character.lastLootedAt = new Date().toISOString();
await character.save();

  } else {
   const embed = createMonsterEncounterEmbed(
    character,
    encounteredMonster,
    outcomeMessage,
    updatedCharacter.currentHearts,
    null,
    bloodMoonActive
   );
   await interaction.editReply({ embeds: [embed] });
   // ------------------- Update Last Loot Timestamp -------------------
character.lastLootedAt = new Date().toISOString();
await character.save();

  }
 } catch (error) {
  handleError(error, "loot.js");
  await interaction.editReply({
   content: `❌ **An error occurred while processing the loot.**`,
  });
 }
}

// ------------------- Helper Function: Generate Outcome Message -------------------
function generateOutcomeMessage(outcome) {
 if (outcome.hearts) {
  return outcome.result === "KO"
   ? generateDamageMessage("KO")
   : generateDamageMessage(outcome.hearts);
 } else if (outcome.defenseSuccess) {
  return generateDefenseBuffMessage(
   outcome.defenseSuccess,
   outcome.adjustedRandomValue,
   outcome.damageValue
  );
 } else if (outcome.attackSuccess) {
  return generateAttackBuffMessage(
   outcome.attackSuccess,
   outcome.adjustedRandomValue,
   outcome.damageValue
  );
 } else if (outcome.result === "Win!/Loot") {
  return generateVictoryMessage(
   outcome.adjustedRandomValue,
   outcome.defenseSuccess,
   outcome.attackSuccess
  );
 }
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
 const randomIndex = Math.floor(Math.random() * weightedItems.length);
 const lootedItem = weightedItems[randomIndex];

 if (encounteredMonster.name.includes("Chuchu")) {
  let jellyType;
  if (encounteredMonster.name.includes('Ice')) {
    jellyType = 'White Chuchu Jelly';
  } else if (encounteredMonster.name.includes('Fire')) {
    jellyType = 'Red Chuchu Jelly';
  } else if (encounteredMonster.name.includes('Electric')) {
    jellyType = 'Yellow Chuchu Jelly';
  } else {
    jellyType = 'Chuchu Jelly';
  }
  const quantity = encounteredMonster.name.includes("Large")
   ? 3
   : encounteredMonster.name.includes("Medium")
   ? 2
   : 1;
  lootedItem.itemName = jellyType;
  lootedItem.quantity = quantity;
 } else {
  lootedItem.quantity = 1; // Default quantity for non-Chuchu items
 }

 return lootedItem;
}
