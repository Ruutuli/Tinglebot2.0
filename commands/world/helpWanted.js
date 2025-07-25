// ============================================================================
// ------------------- /helpwanted Command -------------------
// Handles quest completion for Help Wanted system
// ============================================================================

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler');
const Character = require('../../models/CharacterModel');
const User = require('../../models/UserModel');
const { getTodaysQuests } = require('../../modules/helpWantedModule');
const HelpWantedQuest = require('../../models/HelpWantedQuestModel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('helpwanted')
    .setDescription('Complete your village Help Wanted quest!')
    .addSubcommand(sub =>
      sub.setName('complete')
        .setDescription('Attempt to complete today\'s Help Wanted quest for your character.')
        .addStringOption(opt =>
          opt.setName('questid')
            .setDescription('The quest ID to complete')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('character')
            .setDescription('Your character\'s name (if you have multiple)')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('monsterhunt')
        .setDescription('Attempt a boss rush of monsters for a Help Wanted quest!')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('The quest ID')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('character')
            .setDescription('Your character\'s name (if you have multiple)')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    // ------------------- Monster Hunt Subcommand -------------------
    if (sub === 'monsterhunt') {
      const questId = interaction.options.getString('id');
      const characterName = interaction.options.getString('character');
      
      // Defer the reply to extend interaction timeout
      await interaction.deferReply({ ephemeral: true });
      
      try {
        // ------------------- Fetch Quest -------------------
        const quest = await HelpWantedQuest.findOne({ questId });
        if (!quest) {
          return await interaction.editReply({ content: '❌ Quest not found.' });
        }
        if (quest.type !== 'monster') {
          return await interaction.editReply({ content: '❌ This quest is not a monster hunt.' });
        }
        // ------------------- Get Monster List -------------------
        let monsterList = [];
        if (Array.isArray(quest.requirements.monsters)) {
          monsterList = quest.requirements.monsters;
        } else if (quest.requirements.monster) {
          // Handle amount field for single monster quests
          const amount = quest.requirements.amount || 1;
          monsterList = Array(amount).fill(quest.requirements.monster);
        } else {
          return await interaction.editReply({ content: '❌ No monsters specified for this quest.' });
        }
        if (monsterList.length === 0) {
          return await interaction.editReply({ content: '❌ No monsters specified for this quest.' });
        }
        console.log(`[helpWanted.js]: 🎯 Monster hunt quest - ${monsterList.length} monsters to fight: ${monsterList.join(', ')}`);
        // ------------------- Fetch Character and User -------------------
        const character = await Character.findOne({ userId: interaction.user.id, name: characterName });
        if (!character) {
          return await interaction.editReply({ content: '❌ Character not found.' });
        }
        
                 // Check if user has already completed a Help Wanted quest today
         const { hasUserCompletedQuestToday } = require('../../modules/helpWantedModule');
         if (await hasUserCompletedQuestToday(interaction.user.id)) {
           return await interaction.editReply({ 
             content: '🕐 **Daily Quest Cooldown Active!**\n\nYou\'ve already completed a Help Wanted quest today. Each adventurer can only take on **one quest per day** to maintain balance in the realm.\n\n⏰ **Next Quest Available:** Tomorrow at midnight (EST)\n💡 **Tip:** Use this time to rest, gather resources, or help other adventurers!'
           });
         }
        // ------------------- Eligibility Checks -------------------
        if (character.currentHearts === 0) {
          return await interaction.editReply({ content: `❌ ${character.name} is KO'd and cannot participate.` });
        }
        if (character.debuff?.active) {
          return await interaction.editReply({ content: `❌ ${character.name} is debuffed and cannot participate.` });
        }
                 if (character.blightEffects?.noMonsters) {
           return await interaction.editReply({ content: `❌ ${character.name} cannot fight monsters due to blight.` });
         }
         
         // ------------------- Village Check -------------------
         if (character.currentVillage.toLowerCase() !== quest.village.toLowerCase()) {
           return await interaction.editReply({ 
             content: `❌ **Wrong Village!**\n\n**${character.name}** is currently in **${character.currentVillage}**, but this quest is for **${quest.village}**.\n\n🏠 **Home Village:** ${character.homeVillage}\n📍 **Current Location:** ${character.currentVillage}\n🎯 **Quest Village:** ${quest.village}\n\n**Characters must be in their home village to complete Help Wanted quests.**\n\n💡 **Need to travel?** Use \`/travel\` to move between villages.`
           });
         }
        
        // ------------------- Stamina Check -------------------
        // Ensure stamina is a number (using currentStamina field)
        const currentStamina = parseInt(character.currentStamina) || 0;
        if (currentStamina < 1) {
          return await interaction.editReply({ content: `❌ ${character.name} needs at least 1 stamina to attempt a monster hunt.` });
        }
        // ------------------- Sequential Monster Fights -------------------
        const { fetchItemsByMonster } = require('../../database/db.js');
        const { calculateFinalValue, createWeightedItemList } = require('../../modules/rngModule.js');
        const { getEncounterOutcome } = require('../../modules/encounterModule.js');
        const { handleKO, updateCurrentHearts } = require('../../modules/characterStatsModule.js');
        const { generateVictoryMessage, generateDamageMessage, generateFinalOutcomeMessage, generateDefenseBuffMessage, generateAttackBuffMessage } = require('../../modules/flavorTextModule.js');
        const { createMonsterEncounterEmbed, createKOEmbed } = require('../../embeds/embeds.js');
        const { addItemInventoryDatabase } = require('../../utils/inventoryUtils.js');
        const { isValidGoogleSheetsUrl, safeAppendDataToSheet } = require('../../utils/googleSheetsUtils.js');
        
        // ------------------- Helper Function: Generate Looted Item -------------------
        function generateLootedItem(encounteredMonster, weightedItems) {
          const randomIndex = Math.floor(Math.random() * weightedItems.length);
          const lootedItem = { ...weightedItems[randomIndex] };
          
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
            lootedItem.emoji = '<:Chuchu_Jelly:744755431175356416>';
          } else {
            lootedItem.quantity = 1;
          }
          
          return lootedItem;
        }
        
        await interaction.deferReply();
        
        // ------------------- Deduct Stamina and Announce Hunt Start -------------------
        const newStamina = Math.max(0, currentStamina - 1);
        character.currentStamina = newStamina;
        await character.save();
        console.log(`[helpWanted.js]: ⚡ ${character.name} spent 1 stamina for monster hunt - ${newStamina} remaining`);
        
        // Send initial announcement
        const { EmbedBuilder } = require('discord.js');
        const startEmbed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(`🗡️ Monster Hunt Begins!`)
          .setDescription(`**${character.name}** has embarked on a dangerous hunt for quest **${questId}**!\n\n🎯 **Target:** ${monsterList.length} ${monsterList[0]}${monsterList.length > 1 ? 's' : ''} threatening the area\n⚡ **Stamina Cost:** 1\n❤️ **Starting Hearts:** ${character.currentHearts}\n\n*The hunt is on! Can they survive the challenge?*`)
          .setFooter({ text: `Quest ID: ${questId}` })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [startEmbed] });
        
        let summary = [];
        let defeatedAll = true;
        let heartsRemaining = character.currentHearts;
        let currentMonsterIndex = 0;
        let totalLoot = [];
        
        console.log(`[helpWanted.js]: 🏃 Starting monster hunt for ${character.name} - ${heartsRemaining} hearts remaining`);
        
        for (const monsterName of monsterList) {
          currentMonsterIndex++;
          console.log(`[helpWanted.js]: ⚔️ Battle ${currentMonsterIndex}/${monsterList.length} - ${character.name} vs ${monsterName} (${heartsRemaining} hearts remaining)`);
          
          // Fetch full monster data by name
          const { fetchMonsterByName } = require('../../database/db.js');
          const monster = await fetchMonsterByName(monsterName);
          if (!monster) {
            console.error(`[helpWanted.js]: ❌ Monster "${monsterName}" not found in database`);
            await interaction.followUp({ content: `❌ Monster "${monsterName}" not found in database.`, flags: 64 });
            return;
          }
          console.log(`[helpWanted.js]: 🐉 Fetched monster data for ${monsterName} - Tier: ${monster.tier}, Hearts: ${monster.hearts}`);
          
          // Fetch monster items
          const items = await fetchItemsByMonster(monsterName);
          
          // Simulate encounter
          const diceRoll = Math.floor(Math.random() * 100) + 1;
          console.log(`[helpWanted.js]: 🎲 Dice roll for ${monsterName}: ${diceRoll}/100`);
          
          const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character, diceRoll);
          console.log(`[helpWanted.js]: 📊 Combat values for ${monsterName} - Damage: ${damageValue}, Adjusted: ${adjustedRandomValue}, Attack: ${attackSuccess}, Defense: ${defenseSuccess}`);
          
          const outcome = await getEncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);
          console.log(`[helpWanted.js]: 🎯 Encounter outcome for ${monsterName} - Result: ${outcome.result}, Hearts: ${outcome.hearts || 0}, Can Loot: ${outcome.canLoot}`);
          
          // Generate outcome message
          let outcomeMessage;
          if (outcome.hearts) {
            outcomeMessage = outcome.result === "KO" ? generateDamageMessage("KO") : generateDamageMessage(outcome.hearts);
          } else if (outcome.defenseSuccess) {
            outcomeMessage = generateDefenseBuffMessage(outcome.defenseSuccess, adjustedRandomValue, damageValue);
          } else if (outcome.attackSuccess) {
            outcomeMessage = generateAttackBuffMessage(outcome.attackSuccess, adjustedRandomValue, damageValue);
          } else if (outcome.result === "Win!/Loot") {
            outcomeMessage = generateVictoryMessage(adjustedRandomValue, outcome.defenseSuccess, outcome.attackSuccess);
          } else {
            outcomeMessage = generateFinalOutcomeMessage(damageValue, outcome.defenseSuccess, outcome.attackSuccess, adjustedRandomValue, damageValue);
          }
          
          // Update hearts
          if (outcome.hearts) {
            heartsRemaining = Math.max(heartsRemaining - outcome.hearts, 0);
            await updateCurrentHearts(character._id, heartsRemaining);
            console.log(`[helpWanted.js]: ❤️ ${character.name} lost ${outcome.hearts} hearts - ${heartsRemaining} remaining`);
            
            if (heartsRemaining === 0) {
              await handleKO(character._id);
              console.log(`[helpWanted.js]: 💀 ${character.name} has been KO'd by ${monsterName}`);
              
              // Send KO embed for this battle
              const koEmbed = createMonsterEncounterEmbed(
                character,
                monster,
                outcomeMessage,
                0,
                null,
                false,
                adjustedRandomValue
              );
              
              await interaction.followUp({ embeds: [koEmbed] });
              
              summary.push({ monster: monsterName, result: 'KO', message: outcomeMessage });
              defeatedAll = false;
              break;
            } else {
              summary.push({ monster: monsterName, result: 'Damaged', message: outcomeMessage });
            }
          } else if (outcome.defenseSuccess) {
            summary.push({ monster: monsterName, result: 'Defended', message: outcomeMessage });
          } else if (outcome.attackSuccess) {
            summary.push({ monster: monsterName, result: 'Attacked', message: outcomeMessage });
          } else if (outcome.result === 'Win!/Loot') {
            summary.push({ monster: monsterName, result: 'Victory', message: outcomeMessage });
            
            // ------------------- Handle Loot for Defeated Monsters -------------------
            if (outcome.canLoot && items.length > 0) {
              const weightedItems = createWeightedItemList(items, adjustedRandomValue);
              if (weightedItems.length > 0) {
                const lootedItem = generateLootedItem(monster, weightedItems);
                totalLoot.push({ monster: monsterName, item: lootedItem });
                console.log(`[helpWanted.js]: 🎁 ${character.name} looted ${lootedItem.itemName} (x${lootedItem.quantity}) from ${monsterName}`);
                
                // Add to character's inventory (if they have a valid inventory link)
                const inventoryLink = character.inventory || character.inventoryLink;
                if (inventoryLink && isValidGoogleSheetsUrl(inventoryLink)) {
                  try {
                    await addItemInventoryDatabase(
                      character._id,
                      lootedItem.itemName,
                      lootedItem.quantity,
                      lootedItem.category.join(", "),
                      lootedItem.type.join(", "),
                      interaction
                    );
                    
                    // Update Google Sheets
                    const { extractSpreadsheetId, authorizeSheets } = require('../../utils/googleSheetsUtils');
                    const { v4: uuidv4 } = require('uuid');
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
                        "Monster Hunt",
                        character.job,
                        "",
                        character.currentVillage,
                        interactionUrl,
                        formattedDateTime,
                        uniqueSyncId,
                      ],
                    ];

                    await safeAppendDataToSheet(inventoryLink, character, range, values, undefined, {
                      skipValidation: true,
                      context: {
                        commandName: 'helpwanted monsterhunt',
                        userTag: interaction.user.tag,
                        userId: interaction.user.id,
                        characterName: character.name,
                        spreadsheetId: extractSpreadsheetId(inventoryLink),
                        range: range,
                        sheetType: 'inventory',
                        options: {
                          monsterName: monsterName,
                          itemName: lootedItem.itemName,
                          quantity: lootedItem.quantity,
                          questId: questId
                        }
                      }
                    });
                  } catch (error) {
                    console.error(`[helpWanted.js]: ❌ Failed to add loot to inventory:`, error);
                  }
                }
              }
            }
          } else {
            summary.push({ monster: monsterName, result: 'Other', message: outcomeMessage });
          }
          
          // Send embed for this battle (unless it was a KO)
          if (heartsRemaining > 0) {
            const battleEmbed = createMonsterEncounterEmbed(
              character,
              monster,
              outcomeMessage,
              heartsRemaining,
              null,
              false,
              adjustedRandomValue
            );
            
            await interaction.followUp({ embeds: [battleEmbed] });
            
            // Add a small delay between battles for readability
            if (currentMonsterIndex < monsterList.length) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        // ------------------- Mark Quest Completed if All Defeated -------------------
        if (defeatedAll) {
          quest.completed = true;
          quest.completedBy = { userId: interaction.user.id, characterId: character._id, timestamp: new Date().toISOString() };
          await quest.save();
          
                     // Update user's Help Wanted tracking
           const user = await User.findOne({ discordId: interaction.user.id });
           if (user) {
             const today = new Date().toISOString().slice(0, 10);
             user.helpWanted.lastCompletion = today;
             user.helpWanted.totalCompletions = (user.helpWanted.totalCompletions || 0) + 1;
             user.helpWanted.completions.push({
               date: today,
               village: quest.village,
               questType: quest.type
             });
             await user.save();
             console.log(`[helpWanted.js]: ✅ Updated user tracking for ${interaction.user.tag} - Total completions: ${user.helpWanted.totalCompletions}`);
           }
          
          // Update the quest embed to show completion
          const { updateQuestEmbed } = require('../../modules/helpWantedModule');
          await updateQuestEmbed(interaction.client, quest, quest.completedBy);
          
          console.log(`[helpWanted.js]: ✅ Quest ${questId} completed by ${character.name}`);
        } else {
          console.log(`[helpWanted.js]: ❌ Quest ${questId} failed - ${character.name} was KO'd`);
        }
        
        // ------------------- Final Summary -------------------
        console.log(`[helpWanted.js]: 📋 Monster hunt summary for ${character.name}:`);
        summary.forEach((battle, index) => {
          console.log(`[helpWanted.js]:   ${index + 1}. ${battle.monster} - ${battle.result}: ${battle.message}`);
        });
        
        // Send final summary message as a follow-up embed
        
        let resultMsg = defeatedAll ? 
          `🎉 **${character.name} has successfully completed the monster hunt!**\n\nAll ${monsterList.length} monsters have been defeated and the quest is complete.` : 
          `💀 **${character.name} was defeated during the monster hunt.**\n\nThey managed to defeat ${currentMonsterIndex - 1} out of ${monsterList.length} monsters before being KO'd.`;
        let details = summary.map((s, index) => `**${index + 1}.** ${s.monster}\n> ${s.message}`).join('\n\n');
        
        // Create loot summary with proper item emojis if any items were looted
        let lootSummary = '';
        if (totalLoot.length > 0) {
          // Import necessary modules for item formatting
          const ItemModel = require('../../models/ItemModel');
          const { formatItemDetails } = require('../../embeds/embeds.js');
          
          // Fetch emojis for all looted items
          const formattedLoot = await Promise.all(
            totalLoot.map(async (loot) => {
              const itemDetails = await ItemModel.findOne({ 
                itemName: loot.item.itemName 
              }).select('emoji');
              const emoji = itemDetails?.emoji || '🔹';
              return formatItemDetails(loot.item.itemName, loot.item.quantity, emoji);
            })
          );
          
          lootSummary = formattedLoot.join('\n');
        }
        
        // Import village color function for consistent styling
        const { getVillageColorByName } = require('../../modules/locationsModule');
        const villageColor = getVillageColorByName(character.currentVillage) || (defeatedAll ? 0x00FF00 : 0xFF0000);
        
        const summaryEmbed = new EmbedBuilder()
          .setColor(villageColor) // Use village color for consistency
          .setTitle(`🗡️ Monster Hunt Results - ${character.name}`)
          .setDescription(resultMsg)
          .setAuthor({
            name: `${character.name} 🔗`,
            iconURL: character.icon || 'https://via.placeholder.com/128',
            url: character.inventory || ''
          })
          .setThumbnail(character.icon || 'https://via.placeholder.com/128')
          .addFields(
            { 
              name: defeatedAll ? '🏆 Battle Summary' : '💀 Hunt Summary', 
              value: details, 
              inline: false 
            }
          )
          .addFields(
            { 
              name: '📊 Statistics', 
              value: `❤️ **Hearts Remaining:** ${heartsRemaining}\n⚔️ **Monsters Defeated:** ${defeatedAll ? monsterList.length : currentMonsterIndex - 1}/${monsterList.length}\n⚡ **Stamina Used:** 1\n🎯 **Quest Progress:** ${defeatedAll ? '✅ COMPLETED' : '❌ FAILED'}`, 
              inline: true 
            }
          )
          .setFooter({ text: `${character.currentVillage} Monster Hunt | Quest ID: ${questId} | ${new Date().toLocaleString()}` })
          .setTimestamp()
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');
        
        // Add loot field if there was any loot
        if (lootSummary) {
          summaryEmbed.addFields({ 
            name: `💎 Loot Gained (${totalLoot.length} items)`, 
            value: lootSummary, 
            inline: false 
          });
        }
        
        await interaction.followUp({ embeds: [summaryEmbed], ephemeral: false });
        return;
      } catch (error) {
        handleError(error, 'helpWanted.js', {
          commandName: 'helpwanted monsterhunt',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          questId,
          characterName
        });
        
        await interaction.editReply({ content: '❌ An error occurred during the monster hunt. Please try again later.' });
        return;
      }
    }
    if (sub === 'complete') {
      const questId = interaction.options.getString('questid');
      const characterName = interaction.options.getString('character');
      
      // Defer the reply to extend interaction timeout
      await interaction.deferReply({ ephemeral: false });
      
      try {
        // ------------------- Fetch Quest by ID -------------------
        const quest = await HelpWantedQuest.findOne({ questId });
        if (!quest) {
          return await interaction.editReply({ content: '❌ Quest not found.' });
        }

        // ------------------- Fetch Character and User -------------------
        const character = await Character.findOne({
          userId: interaction.user.id,
          name: characterName
        });
        if (!character) {
          return await interaction.editReply({ content: '❌ Character not found.' });
        }

        const user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
          return await interaction.editReply({ content: '❌ User not found.' });
        }

                 // ------------------- Cooldown Check -------------------
         const { hasUserCompletedQuestToday } = require('../../modules/helpWantedModule');
         if (await hasUserCompletedQuestToday(interaction.user.id)) {
           return await interaction.editReply({ 
             content: '🕐 **Daily Quest Cooldown Active!**\n\nYou\'ve already completed a Help Wanted quest today. Each adventurer can only take on **one quest per day** to maintain balance in the realm.\n\n⏰ **Next Quest Available:** Tomorrow at midnight (server time)\n💡 **Tip:** Use this time to rest, gather resources, or help other adventurers!'
           });
         }

        // ------------------- Quest Status Check -------------------
        if (quest.completed) {
          return await interaction.editReply({ 
            content: `❌ This quest has already been completed by <@${quest.completedBy?.userId || 'unknown'}>.`
          });
        }
        
        // ------------------- Village Check -------------------
        if (character.currentVillage.toLowerCase() !== quest.village.toLowerCase()) {
          return await interaction.editReply({ 
            content: `❌ **Wrong Village!**\n\n**${character.name}** is currently in **${character.currentVillage}**, but this quest is for **${quest.village}**.\n\n🏠 **Home Village:** ${character.homeVillage}\n📍 **Current Location:** ${character.currentVillage}\n🎯 **Quest Village:** ${quest.village}\n\n**Characters must be in their home village to complete Help Wanted quests.**\n\n💡 **Need to travel?** Use \`/travel\` to move between villages.`
          });
        }

        // ------------------- Quest Requirement Validation -------------------
        console.log(`[helpWanted.js]: 🔍 Starting quest requirements validation for ${character.name} (${interaction.user.tag})`);
        console.log(`[helpWanted.js]: 📋 Quest: ${quest.questId} - ${quest.type} quest for ${quest.village}`);
        console.log(`[helpWanted.js]: 🎯 Requirements: ${JSON.stringify(quest.requirements)}`);
        
        let requirementsMet = false;
        let validationMessage = '';

        switch (quest.type) {
          case 'item': {
            // ------------------- Item Quest Validation -------------------
            // Check if character has the required items in their inventory
            // Check database inventory for items only
            const { connectToInventories } = require('../../database/db');
            
            let totalQuantity = 0;
            let matchingItems = [];
            
            // ------------------- Check Database Inventory -------------------
            try {
              const inventoriesConnection = await connectToInventories();
              const db = inventoriesConnection.useDb('inventories');
              const collectionName = character.name.toLowerCase();
              const inventoryCollection = db.collection(collectionName);
              
              // Search for items in database
              const dbItems = await inventoryCollection.find({
                characterId: character._id,
                itemName: { $regex: new RegExp(quest.requirements.item, 'i') }
              }).toArray();
              
              for (const item of dbItems) {
                totalQuantity += item.quantity || 0;
                matchingItems.push(`${item.itemName} (${item.quantity}x, source: ${item.obtain})`);
              }
              console.log(`[helpWanted.js]: 🔍 Database inventory scan for ${character.name}`);
              console.log(`[helpWanted.js]: 📦 Database items found: ${dbItems.length} items`);
            } catch (error) {
              console.error(`[helpWanted.js]: ❌ Error checking database inventory:`, error);
            }
            
            // ------------------- Validate Requirements -------------------
            if (totalQuantity >= quest.requirements.amount) {
              validationMessage = `📦 **Item Quest:** ✅ ${character.name} has ${totalQuantity}x ${quest.requirements.item} (required: ${quest.requirements.amount}x)`;
              requirementsMet = true;
            } else {
              validationMessage = `📦 **Item Quest:** ❌ ${character.name} has ${totalQuantity}x ${quest.requirements.item} but needs ${quest.requirements.amount}x`;
              requirementsMet = false;
            }
            break;
          }
          case 'monster': {
            // ------------------- Monster Quest Validation -------------------
            // For monster quests, we'll use the monsterhunt subcommand instead
            // This validation is mainly for non-hunt monster quests (if any exist)
            validationMessage = `🗡️ **Monster Quest:** This quest requires defeating monsters. Please use the \`/helpwanted monsterhunt\` command instead.`;
            requirementsMet = false; // Force use of monsterhunt subcommand
            break;
          }
          case 'escort': {
            // ------------------- Escort Quest Validation -------------------
            // Check if character has traveled to the required location
            const requiredLocation = quest.requirements.location?.toLowerCase();
            const currentLocation = character.currentVillage?.toLowerCase();
            
            if (!requiredLocation) {
              validationMessage = `🛡️ **Escort Quest:** ❌ Quest requirements are incomplete - no location specified.`;
              requirementsMet = false;
              break;
            }
            
            if (currentLocation === requiredLocation) {
              validationMessage = `🛡️ **Escort Quest:** ✅ ${character.name} is currently in ${quest.requirements.location}`;
              requirementsMet = true;
            } else {
              validationMessage = `🛡️ **Escort Quest:** ❌ ${character.name} is in ${character.currentVillage} but needs to be in ${quest.requirements.location}. Use \`/travel\` to move.`;
              requirementsMet = false;
            }
            break;
          }
          case 'crafting': {
            // ------------------- Crafting Quest Validation -------------------
            // Check if character has crafted the required items
            // Check database inventory for crafted items only
            const { connectToInventories } = require('../../database/db');
            
            let totalCraftedQuantity = 0;
            let matchingItems = [];
            
            // ------------------- Check Database Inventory -------------------
            try {
              const inventoriesConnection = await connectToInventories();
              const db = inventoriesConnection.useDb('inventories');
              const collectionName = character.name.toLowerCase();
              const inventoryCollection = db.collection(collectionName);
              
              // Search for crafted items in database
              const dbItems = await inventoryCollection.find({
                characterId: character._id,
                itemName: { $regex: new RegExp(quest.requirements.item, 'i') },
                obtain: { $regex: /crafting/i }
              }).toArray();
              
              for (const item of dbItems) {
                totalCraftedQuantity += item.quantity || 0;
                matchingItems.push(`${item.itemName} (${item.quantity}x, source: ${item.obtain})`);
              }
              
              console.log(`[helpWanted.js]: 🔍 Database inventory scan for ${character.name}`);
              console.log(`[helpWanted.js]: 📦 Database crafted items found: ${dbItems.length} items`);
            } catch (error) {
              console.error(`[helpWanted.js]: ❌ Error checking database inventory:`, error);
            }
            
            console.log(`[helpWanted.js]: 🔍 Crafting quest inventory scan for ${character.name}`);
            console.log(`[helpWanted.js]: 🎯 Looking for: ${quest.requirements.item}`);
            console.log(`[helpWanted.js]: 📦 Total matching crafted items found: ${matchingItems.length > 0 ? matchingItems.join(', ') : 'None'}`);
            console.log(`[helpWanted.js]: 📊 Total crafted quantity: ${totalCraftedQuantity}`);
            
            if (totalCraftedQuantity >= quest.requirements.amount) {
              validationMessage = `🔨 **Crafting Quest:** ✅ ${character.name} has crafted ${totalCraftedQuantity}x ${quest.requirements.item} (required: ${quest.requirements.amount}x)`;
              requirementsMet = true;
              console.log(`[helpWanted.js]: ✅ Crafting quest requirements met - ${character.name} has ${totalCraftedQuantity}x ${quest.requirements.item}`);
            } else {
              validationMessage = `🔨 **Crafting Quest:** ❌ ${character.name} has crafted ${totalCraftedQuantity}x ${quest.requirements.item} but needs ${quest.requirements.amount}x. Use \`/crafting\` to craft more.`;
              requirementsMet = false;
              console.log(`[helpWanted.js]: ❌ Crafting quest requirements failed - ${character.name} has ${totalCraftedQuantity}x ${quest.requirements.item}, needs ${quest.requirements.amount}x`);
              console.log(`[helpWanted.js]: 📊 Crafting Quest Details - Item: ${quest.requirements.item}, Required: ${quest.requirements.amount}, Found: ${totalCraftedQuantity}`);
            }
            break;
          }
          default:
            validationMessage = '❌ Unknown quest type.';
            requirementsMet = false;
        }

        if (!requirementsMet) {
          // ------------------- Log Quest Requirements Failure -------------------
          console.log(`[helpWanted.js]: ❌ Quest requirements not met for ${character.name} (${interaction.user.tag})`);
          console.log(`[helpWanted.js]: 📋 Quest Details - ID: ${quest.questId}, Type: ${quest.type}, Village: ${quest.village}`);
          console.log(`[helpWanted.js]: 🔍 Requirements Check - ${validationMessage}`);
          console.log(`[helpWanted.js]: 👤 Character Status - Hearts: ${character.currentHearts}, Village: ${character.currentVillage}, Debuff: ${character.debuff?.active || false}`);
          
          return await interaction.editReply({ 
            content: `❌ Quest requirements not met.\n\n${validationMessage}`
          });
        }

        // ------------------- Remove Items for Crafting and Item Quests -------------------
        if (quest.type === 'crafting' || quest.type === 'item') {
          try {
            console.log(`[helpWanted.js]: 🗑️ Removing items for ${quest.type} quest completion`);
            
            // Import required modules
            const { connectToInventories } = require('../../database/db');
            const { removeItemInventoryDatabase } = require('../../utils/inventoryUtils');
            const { safeAppendDataToSheet } = require('../../utils/googleSheetsUtils');
            
            // Connect to inventory database
            const inventoriesConnection = await connectToInventories();
            const db = inventoriesConnection.useDb('inventories');
            const collectionName = character.name.toLowerCase();
            const inventoryCollection = db.collection(collectionName);
            
            // Find items to remove
            let itemsToRemove = [];
            
            if (quest.type === 'crafting') {
              // For crafting quests, find crafted items
              const dbItems = await inventoryCollection.find({
                characterId: character._id,
                itemName: { $regex: new RegExp(quest.requirements.item, 'i') },
                obtain: { $regex: /crafting/i }
              }).toArray();
              
              itemsToRemove = dbItems;
            } else if (quest.type === 'item') {
              // For item quests, find any matching items
              const dbItems = await inventoryCollection.find({
                characterId: character._id,
                itemName: { $regex: new RegExp(quest.requirements.item, 'i') }
              }).toArray();
              
              itemsToRemove = dbItems;
            }
            
            // Remove items from database
            let totalRemoved = 0;
            const itemsToLog = [];
            
            for (const item of itemsToRemove) {
              if (totalRemoved >= quest.requirements.amount) break;
              
              const remainingToRemove = quest.requirements.amount - totalRemoved;
              const quantityToRemove = Math.min(item.quantity, remainingToRemove);
              
              // Remove from database
              const removed = await removeItemInventoryDatabase(
                character._id, 
                item.itemName, 
                quantityToRemove, 
                interaction, 
                quest.type === 'crafting' ? 'Quest (Crafting)' : 'Quest (Item)'
              );
              
              if (removed) {
                totalRemoved += quantityToRemove;
                itemsToLog.push({
                  itemName: item.itemName,
                  quantity: quantityToRemove,
                  obtain: item.obtain
                });
                
                console.log(`[helpWanted.js]: ✅ Removed ${quantityToRemove}x ${item.itemName} from ${character.name}'s inventory`);
              }
            }
            
            // Item removals are now automatically logged to Google Sheets by removeItemInventoryDatabase function
            
            console.log(`[helpWanted.js]: ✅ Successfully removed ${totalRemoved}x ${quest.requirements.item} for quest completion`);
            
          } catch (removalError) {
            console.error(`[helpWanted.js]: ❌ Error removing items for quest completion:`, removalError);
            return await interaction.editReply({ 
              content: `❌ Failed to remove items from inventory. Please try again later.`
            });
          }
        }

        // ------------------- Mark Quest Completed -------------------
        quest.completed = true;
        quest.completedBy = { 
          userId: interaction.user.id, 
          characterId: character._id, 
          timestamp: new Date().toISOString() 
        };
        await quest.save();

        // ------------------- Update User Tracking -------------------
        const today = new Date().toISOString().slice(0, 10);
        user.helpWanted.lastCompletion = today;
        user.helpWanted.totalCompletions = (user.helpWanted.totalCompletions || 0) + 1;
        user.helpWanted.completions.push({
          date: today,
          village: quest.village,
          questType: quest.type
        });
        await user.save();
        console.log(`[helpWanted.js]: ✅ Updated user tracking for ${interaction.user.tag} - Total completions: ${user.helpWanted.totalCompletions}`);

        // ------------------- Update Quest Embed -------------------
        const { updateQuestEmbed } = require('../../modules/helpWantedModule');
        await updateQuestEmbed(interaction.client, quest, quest.completedBy);

        // ------------------- Success Response -------------------
        const successEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ Quest Completed!')
          .setDescription(`**${character.name}** has successfully completed the Help Wanted quest for **${quest.village}**!`)
          .addFields(
            { name: 'Quest Type', value: quest.type.charAt(0).toUpperCase() + quest.type.slice(1), inline: true },
            { name: 'Village', value: quest.village, inline: true },
            { name: 'Completed By', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setFooter({ text: `Quest ID: ${quest.questId}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });
        console.log(`[helpWanted.js]: ✅ Quest ${quest.questId} completed by ${character.name} (${interaction.user.tag})`);

      } catch (error) {
        handleError(error, 'helpWanted.js', {
          commandName: 'helpwanted complete',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          characterName: characterName,
          questId: questId
        });
        
        await interaction.editReply({ content: '❌ An error occurred. Please try again later.' });
      }
      return;
    } else {
      return;
    }
  }
}; 