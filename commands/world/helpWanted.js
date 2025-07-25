// ============================================================================
// ------------------- /helpwanted Command -------------------
// Handles quest completion for Help Wanted system
// ============================================================================

const { SlashCommandBuilder } = require('discord.js');
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
          opt.setName('character')
            .setDescription('Your character\'s name (if you have multiple)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('monsterhunt')
        .setDescription('Attempt a boss rush of monsters for a Help Wanted quest!')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('The quest ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('character')
            .setDescription('Your character\'s name (if you have multiple)')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    // ------------------- Monster Hunt Subcommand -------------------
    if (sub === 'monsterhunt') {
      const questId = interaction.options.getString('id');
      const characterName = interaction.options.getString('character');
      try {
        // ------------------- Fetch Quest -------------------
        const quest = await HelpWantedQuest.findOne({ questId });
        if (!quest) {
          return await interaction.reply({ content: '❌ Quest not found.', ephemeral: true });
        }
        if (quest.type !== 'monster') {
          return await interaction.reply({ content: '❌ This quest is not a monster hunt.', ephemeral: true });
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
          return await interaction.reply({ content: '❌ No monsters specified for this quest.', ephemeral: true });
        }
        if (monsterList.length === 0) {
          return await interaction.reply({ content: '❌ No monsters specified for this quest.', ephemeral: true });
        }
        console.log(`[helpWanted.js]: 🎯 Monster hunt quest - ${monsterList.length} monsters to fight: ${monsterList.join(', ')}`);
        // ------------------- Fetch Character and User -------------------
        const character = await Character.findOne({ userId: interaction.user.id, name: characterName });
        if (!character) {
          return await interaction.reply({ content: '❌ Character not found.', ephemeral: true });
        }
        
        // Check if user has already completed a Help Wanted quest today
        const { hasUserCompletedQuestToday } = require('../../modules/helpWantedModule');
        if (await hasUserCompletedQuestToday(interaction.user.id)) {
          return await interaction.reply({ 
            content: '❌ You have already completed a Help Wanted quest today. Only one quest per user per day is allowed.', 
            ephemeral: true 
          });
        }
        // ------------------- Eligibility Checks -------------------
        if (character.currentHearts === 0) {
          return await interaction.reply({ content: `❌ ${character.name} is KO'd and cannot participate.`, ephemeral: true });
        }
        if (character.debuff?.active) {
          return await interaction.reply({ content: `❌ ${character.name} is debuffed and cannot participate.`, ephemeral: true });
        }
        if (character.blightEffects?.noMonsters) {
          return await interaction.reply({ content: `❌ ${character.name} cannot fight monsters due to blight.`, ephemeral: true });
        }
        
        // ------------------- Stamina Check -------------------
        // Ensure stamina is a number (using currentStamina field)
        const currentStamina = parseInt(character.currentStamina) || 0;
        if (currentStamina < 1) {
          return await interaction.reply({ content: `❌ ${character.name} needs at least 1 stamina to attempt a monster hunt.`, ephemeral: true });
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
            await interaction.followUp({ content: `❌ Monster "${monsterName}" not found in database.`, ephemeral: true });
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
            user.helpWanted.completions.push({
              date: today,
              village: quest.village,
              questType: quest.type
            });
            await user.save();
            console.log(`[helpWanted.js]: ✅ Updated user tracking for ${interaction.user.tag}`);
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
        await interaction.reply({ content: '❌ An error occurred during the monster hunt. Please try again later.', ephemeral: true });
        return;
      }
    }
    if (sub === 'complete') {
      const characterName = interaction.options.getString('character');
      try {
        // ------------------- Fetch Character and User -------------------
        const character = await Character.findOne({
          userId: interaction.user.id,
          name: characterName
        });
        if (!character) {
          return await interaction.reply({ content: '❌ Character not found.', ephemeral: true });
        }

        const user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
          return await interaction.reply({ content: '❌ User not found.', ephemeral: true });
        }

        // ------------------- Cooldown Check -------------------
        const { hasUserCompletedQuestToday } = require('../../modules/helpWantedModule');
        if (await hasUserCompletedQuestToday(interaction.user.id)) {
          return await interaction.reply({ 
            content: '❌ You have already completed a Help Wanted quest today. Only one quest per user per day is allowed.', 
            ephemeral: true 
          });
        }

        // ------------------- Determine Native Village -------------------
        const nativeVillage = character.homeVillage;

        // ------------------- Fetch Today's Quest for Village -------------------
        const quest = await HelpWantedQuest.findOne({
          village: nativeVillage,
          date: new Date().toISOString().slice(0, 10)
        });
        if (!quest) {
          return await interaction.reply({ content: '❌ No Help Wanted quest found for your village today.', ephemeral: true });
        }

        // ------------------- Quest Status Check -------------------
        if (quest.completed) {
          return await interaction.reply({ 
            content: `❌ This quest has already been completed by <@${quest.completedBy?.userId || 'unknown'}>.`, 
            ephemeral: true 
          });
        }

        // ------------------- Quest Requirement Validation -------------------
        let requirementsMet = false;
        let validationMessage = '';

        switch (quest.type) {
          case 'item': {
            // TODO: Implement inventory checking logic
            validationMessage = `📦 **Item Quest:** Please ensure you have ${quest.requirements.amount}x ${quest.requirements.item} in your inventory.`;
            requirementsMet = true; // Placeholder - implement actual inventory check
            break;
          }
          case 'monster': {
            // TODO: Implement monster defeat tracking
            validationMessage = `🗡️ **Monster Quest:** Please ensure you have defeated ${quest.requirements.amount}x ${quest.requirements.monster}.`;
            requirementsMet = true; // Placeholder - implement actual monster tracking
            break;
          }
          case 'escort': {
            // TODO: Implement travel location checking
            validationMessage = `🛡️ **Escort Quest:** Please ensure you have traveled to ${quest.requirements.location}.`;
            requirementsMet = true; // Placeholder - implement actual travel check
            break;
          }
          case 'crafting': {
            // TODO: Implement crafting tracking
            validationMessage = `🔨 **Crafting Quest:** Please ensure you have crafted ${quest.requirements.amount}x ${quest.requirements.item}.`;
            requirementsMet = true; // Placeholder - implement actual crafting check
            break;
          }
          default:
            validationMessage = '❌ Unknown quest type.';
            requirementsMet = false;
        }

        if (!requirementsMet) {
          return await interaction.reply({ 
            content: `❌ Quest requirements not met.\n\n${validationMessage}`, 
            ephemeral: true 
          });
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
        user.helpWanted.completions.push({
          date: today,
          village: quest.village,
          questType: quest.type
        });
        await user.save();

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

        await interaction.reply({ embeds: [successEmbed], ephemeral: false });
        console.log(`[helpWanted.js]: ✅ Quest ${quest.questId} completed by ${character.name} (${interaction.user.tag})`);

      } catch (error) {
        handleError(error, 'helpWanted.js', {
          commandName: 'helpwanted complete',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          characterName: characterName
        });
        await interaction.reply({ content: '❌ An error occurred. Please try again later.', ephemeral: true });
      }
      return;
    } else {
      return;
    }
  }
}; 