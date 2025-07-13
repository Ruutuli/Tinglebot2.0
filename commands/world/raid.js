// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler');
const { fetchCharacterByNameAndUserId } = require('../../database/db');
const { joinRaid, processRaidTurn, checkRaidExpiration } = require('../../modules/raidModule');

// ============================================================================
// ---- Import Loot Functions ----
// ============================================================================
const { fetchItemsByMonster } = require('../../database/db');
const { createWeightedItemList, calculateFinalValue } = require('../../modules/rngModule');
const { addItemInventoryDatabase } = require('../../utils/inventoryUtils');
const { isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../../utils/validation');
const { authorizeSheets, safeAppendDataToSheet } = require('../../utils/googleSheetsUtils');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// ---- Import Inventory Sync Check ----
// ============================================================================
const { checkInventorySync } = require('../../utils/characterUtils');

// ============================================================================
// ---- Constants ----
// ============================================================================
// Village resident role IDs
const VILLAGE_RESIDENT_ROLES = {
  'Rudania': '907344585238409236',
  'Inariko': '907344454854266890', 
  'Vhintl': '907344092491554906'
};

// Village visiting role IDs
const VILLAGE_VISITING_ROLES = {
  'Rudania': '1379850030856405185',
  'Inariko': '1379850102486863924', 
  'Vhintl': '1379850161794056303'
};

// ============================================================================
// ---- Command Definition ----
// ============================================================================
module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Join and participate in a raid')
    .addStringOption(option =>
      option
        .setName('raidid')
        .setDescription('The ID of the raid to join')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('charactername')
        .setDescription('The name of your character')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  // ============================================================================
  // ---- Command Execution ----
  // ============================================================================
  async execute(interaction) {
    try {
      await interaction.deferReply();

      // Get command options
      const raidId = interaction.options.getString('raidid');
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      // Fetch and validate character with user ownership
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        return interaction.editReply({
          content: `❌ Character "${characterName}" not found or doesn't belong to you. Please check the spelling and try again.`,
          ephemeral: true
        });
      }

      // ------------------- Check Inventory Sync -------------------
      try {
        await checkInventorySync(character);
      } catch (error) {
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000, // Red color
            title: '❌ Inventory Not Synced',
            description: error.message,
            fields: [
              {
                name: 'How to Fix',
                value: '1. Use `/inventory test` to test your inventory\n2. Use `/inventory sync` to sync your inventory'
              }
            ],
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Inventory Sync Required'
            }
          }],
          ephemeral: true
        });
        return;
      }

      // Check if character is KO'd
      if (character.ko) {
        return interaction.editReply({
          content: `❌ ${character.name} is KO'd and cannot participate in raids.`,
          ephemeral: true
        });
      }

      // Check raid expiration and get raid data
      const raidData = await checkRaidExpiration(raidId);
      if (!raidData) {
        // Get all active raids for debugging
        const { Raid } = require('../../models/RaidModel');
        const allRaids = await Raid.find({ status: 'active' }).select('raidId village monster.name createdAt').limit(10);
        const activeRaidIds = allRaids.map(r => r.raidId).join(', ');
        
        return interaction.editReply({
          content: `❌ **Raid not found!**\n\n**Raid ID you entered:** \`${raidId}\`\n\n**Available active raids:** ${activeRaidIds || 'None'}\n\n**Possible issues:**\n• Check if you copied the raid ID correctly\n• The raid may have expired (15-minute time limit)\n• The raid may have been completed\n• Check the raid announcement for the correct ID`,
          ephemeral: true
        });
      }

      if (raidData.status !== 'active') {
        return interaction.editReply({
          content: `❌ **Raid ${raidId} is no longer active!**\n\n**Status:** ${raidData.status}\n\n**Possible reasons:**\n• The raid has been completed by other players\n• The raid has expired (15-minute time limit)\n• The raid was manually ended by a moderator\n\n**To join a new raid:**\n• Wait for a new raid announcement\n• Check the village town hall for active raids\n• Use the raid ID from the most recent announcement`,
          ephemeral: true
        });
      }

      // Check if character is in the same village as the raid
      if (character.currentVillage.toLowerCase() !== raidData.village.toLowerCase()) {
        return interaction.editReply({
          content: `❌ ${character.name} must be in ${raidData.village} to participate in this raid. Current location: ${character.currentVillage}`,
          ephemeral: true
        });
      }

      // Try to join the raid if not already participating
      let updatedRaidData = raidData;
      const existingParticipant = raidData.participants.find(p => 
        p.characterId.toString() === character._id.toString()
      );
      
      if (!existingParticipant) {
        try {
          const joinResult = await joinRaid(character, raidId);
          updatedRaidData = joinResult.raidData;
        } catch (joinError) {
          console.error(`[raid.js]: ❌ Join raid error for ${character.name}:`, joinError);
          return interaction.editReply({
            content: `❌ **Failed to join raid:** ${joinError.message}\n\n**Character:** ${character.name}\n**Raid ID:** \`${raidId}\`\n**Current Village:** ${character.currentVillage}`,
            ephemeral: true
          });
        }
      } else {
        console.log(`[raid.js]: ✅ Character ${character.name} is already in raid ${raidId}, processing turn directly`);
      }

      // Process the raid turn
      const turnResult = await processRaidTurn(character, raidId, interaction, updatedRaidData);
      
      // Create embed for the turn result
      const embed = createRaidTurnEmbed(character, raidId, turnResult, updatedRaidData);

      // Check if monster was defeated in this turn
      if (turnResult.raidData.monster.currentHearts <= 0 && turnResult.raidData.status === 'completed') {
        // Send the final turn embed first
        await interaction.editReply({ embeds: [embed] });
        
        // Then handle raid victory (which will send a follow-up)
        await handleRaidVictory(interaction, turnResult.raidData, turnResult.raidData.monster);
        return;
      }
      
      // Send the turn result embed
      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      handleError(error, 'raid.js', {
        commandName: 'raid',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        raidId: interaction.options.getString('raidid'),
        characterName: interaction.options.getString('charactername')
      });
      
      console.error(`[raid.js]: ❌ Error processing raid command:`, error);
      
      const errorMessage = error.message || 'An unexpected error occurred';
      return interaction.editReply({
        content: `❌ Error: ${errorMessage}`,
        ephemeral: true
      });
    }
  },
};

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ---- Function: getVillageRoleMention ----
// Gets the proper role mention for a village (both resident and visiting)
function getVillageRoleMention(village) {
  const residentRoleId = VILLAGE_RESIDENT_ROLES[village];
  const visitingRoleId = VILLAGE_VISITING_ROLES[village];
  
  if (residentRoleId && visitingRoleId) {
    return `<@&${residentRoleId}> <@&${visitingRoleId}>`;
  } else if (residentRoleId) {
    return `<@&${residentRoleId}>`;
  } else {
    return `@${village} residents`;
  }
}

// ---- Function: createRaidTurnEmbed ----
// Creates an embed showing the results of a raid turn
function createRaidTurnEmbed(character, raidId, turnResult, raidData) {
  const { battleResult, participant } = turnResult;
  const { monster } = raidData;

  // Get monster image from monsterMapping
  const { monsterMapping } = require('../../models/MonsterModel');
  const monsterDetails = monsterMapping && monsterMapping[monster.nameMapping]
    ? monsterMapping[monster.nameMapping]
    : { image: monster.image };
  const monsterImage = monsterDetails.image || monster.image || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';

  // Get character icon (if available)
  const characterIcon = character.icon || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';

  // Build turn order list
  const turnOrder = raidData.participants.map((p, idx) => `${idx + 1}. ${p.name}`).join('\n');

  // Determine embed color based on outcome
  let color = '#00FF00'; // Green for success
  if (battleResult.playerHearts.current <= 0) {
    color = '#FF0000'; // Red for KO
  } else if (battleResult.hearts <= 0) {
    color = '#FFFF00'; // Yellow for no damage
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`⚔️ ${character.name}'s Raid Turn`)
    .setAuthor({ name: character.name, iconURL: characterIcon })
    .setDescription(battleResult.outcome)
    .addFields(
      {
        name: `__${monster.name} Status__`,
        value: `💙 **Hearts:** ${monster.currentHearts}/${monster.maxHearts}`,
        inline: false
      },
      {
        name: `__${character.name} Status__`,
        value: `❤️ **Hearts:** ${battleResult.playerHearts.current}/${battleResult.playerHearts.max}`,
        inline: false
      },
      {
        name: `__Damage Dealt__`,
        value: `⚔️ **${battleResult.hearts}** hearts`,
        inline: false
      },
      {
        name: `__Turn Order__`,
        value: turnOrder || 'No participants',
        inline: false
      },
      {
        name: 'Raid ID',
        value: `\`\`\`${raidId}\`\`\``,
        inline: false
      },
      {
        name: 'Want to join in?',
        value: 'Use </raid:1392945628002259014> to join!',
        inline: false
      },


    )
    .setThumbnail(monsterImage)
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setFooter({ 
      text: `Raid ID: ${raidId} • Use /raid to take your turn! Please respect turn order. • Use /item to heal characters!` 
    })
    .setTimestamp();

  // Add KO warning if character is down
  if (battleResult.playerHearts.current <= 0) {
    embed.addFields({
      name: 'KO',
      value: `💥 **${character.name} has been knocked out and cannot continue!**`,
      inline: false
    });
  }

  return embed;
}

// ---- Function: handleRaidVictory ----
// Handles raid victory with loot distribution for all participants
async function handleRaidVictory(interaction, raidData, monster) {
  try {
    console.log(`[raid.js]: 🎉 Raid victory! Processing loot for ${raidData.participants.length} participants`);
    
    // Fetch items for the monster
    const items = await fetchItemsByMonster(monster.name);
    const weightedItems = createWeightedItemList(items, 50); // Use middle-range roll for raid loot
    
    // Process loot for each participant
    const lootResults = [];
    const Character = require('../../models/CharacterModel');
    
    for (const participant of raidData.participants) {
      try {
        // Fetch the character's current data
        const character = await Character.findById(participant.characterId);
        if (!character) {
          console.log(`[raid.js]: ⚠️ Character ${participant.name} not found, skipping loot`);
          continue;
        }
        
        // Generate loot for this participant based on damage dealt
        const lootedItem = generateLootedItem(monster, weightedItems, participant.damage);
        
        // Add to inventory if character has valid inventory link
        if (character.inventory && isValidGoogleSheetsUrl(character.inventory)) {
          try {
            await addItemInventoryDatabase(
              character._id,
              lootedItem.itemName,
              lootedItem.quantity,
              lootedItem.category.join(", "),
              lootedItem.type.join(", "),
              interaction
            );
            
            // Add to Google Sheets
            const spreadsheetId = extractSpreadsheetId(character.inventory);
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
                "Raid Loot",
                character.job,
                "",
                character.currentVillage,
                interactionUrl,
                formattedDateTime,
                uniqueSyncId,
              ],
            ];

            await safeAppendDataToSheet(character.inventory, character, range, values, undefined, {
              skipValidation: true,
              context: {
                commandName: 'raid',
                userTag: interaction.user.tag,
                userId: interaction.user.id,
                characterName: character.name,
                spreadsheetId: extractSpreadsheetId(character.inventory),
                range: range,
                sheetType: 'inventory',
                options: {
                  monsterName: monster.name,
                  itemName: lootedItem.itemName,
                  quantity: lootedItem.quantity,
                  raidId: raidData.raidId
                }
              }
            });
            
            // Determine loot quality indicator based on damage
            let qualityIndicator = '';
            if (participant.damage >= 10) {
              qualityIndicator = ' 🔥'; // High damage = fire emoji
            } else if (participant.damage >= 5) {
              qualityIndicator = ' ⚡'; // Medium damage = lightning emoji
            } else if (participant.damage >= 2) {
              qualityIndicator = ' ✨'; // Low damage = sparkle emoji
            }
            
            lootResults.push(`**${character.name}** (${participant.damage} hearts)${qualityIndicator} got ${lootedItem.emoji || ''} **${lootedItem.itemName}** × ${lootedItem.quantity}!`);
            
          } catch (error) {
            console.error(`[raid.js]: ❌ Error processing loot for ${character.name}:`, error);
            // Determine loot quality indicator based on damage
            let qualityIndicator = '';
            if (participant.damage >= 10) {
              qualityIndicator = ' 🔥'; // High damage = fire emoji
            } else if (participant.damage >= 5) {
              qualityIndicator = ' ⚡'; // Medium damage = lightning emoji
            } else if (participant.damage >= 2) {
              qualityIndicator = ' ✨'; // Low damage = sparkle emoji
            }
            
            lootResults.push(`**${character.name}** (${participant.damage} hearts)${qualityIndicator} got ${lootedItem.emoji || ''} **${lootedItem.itemName}** × ${lootedItem.quantity}! *(inventory sync failed)*`);
          }
        } else {
          // Character doesn't have valid inventory, but still show loot
          // Determine loot quality indicator based on damage
          let qualityIndicator = '';
          if (participant.damage >= 10) {
            qualityIndicator = ' 🔥'; // High damage = fire emoji
          } else if (participant.damage >= 5) {
            qualityIndicator = ' ⚡'; // Medium damage = lightning emoji
          } else if (participant.damage >= 2) {
            qualityIndicator = ' ✨'; // Low damage = sparkle emoji
          }
          
          lootResults.push(`**${character.name}** (${participant.damage} hearts)${qualityIndicator} got ${lootedItem.emoji || ''} **${lootedItem.itemName}** × ${lootedItem.quantity}! *(no inventory link)*`);
        }
        
      } catch (error) {
        console.error(`[raid.js]: ❌ Error processing participant ${participant.name}:`, error);
        lootResults.push(`**${participant.name}** - *Error processing loot*`);
      }
    }
    
    // Create participant list
    const participantList = raidData.participants.map(p => `• **${p.name}** (${p.damage} hearts)`).join('\n');
    
    // Get monster image from monsterMapping
    const { monsterMapping } = require('../../models/MonsterModel');
    const monsterDetails = monsterMapping && monsterMapping[monster.nameMapping] 
      ? monsterMapping[monster.nameMapping] 
      : { image: monster.image };
    const monsterImage = monsterDetails.image || monster.image || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';
    
    // Create victory embed
    const victoryEmbed = new EmbedBuilder()
      .setColor('#FFD700') // Gold color for victory
      .setTitle(`🎉 **${monster.name} Defeated!**`)
      .setDescription(`The raid has been completed successfully! Here's what everyone got:`)
      .addFields(
        {
          name: '__Raid Summary__',
          value: `🎯 **Total Damage:** ${raidData.analytics.totalDamage} hearts\n👥 **Participants:** ${raidData.participants.length}\n⏱️ **Duration:** ${Math.floor((raidData.analytics.endTime - raidData.analytics.startTime) / 1000)}s`,
          inline: false
        },
        {
          name: '__Participants__',
          value: participantList || 'No participants found.',
          inline: false
        },
        {
          name: '__Loot Distribution__',
          value: lootResults.length > 0 ? lootResults.join('\n') : 'No loot was found.',
          inline: false
        },
        {
          name: '__Loot System Explanation__',
          value: `**Damage-Based Loot System:**\n🔥 **10+ hearts damage** = 3x better loot chances\n⚡ **5-9 hearts damage** = 2x better loot chances\n✨ **2-4 hearts damage** = 1.5x better loot chances\n• **0-1 hearts damage** = Base loot chances\n\n*Higher damage dealers get more copies of rare items in their loot pool!*`,
          inline: false
        }
      )
      .setThumbnail(monsterImage)
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .setFooter({ text: `Raid ID: ${raidData.raidId}` })
      .setTimestamp();
    
    // Send victory embed to the raid thread (if it exists)
    if (raidData.threadId) {
      try {
        const thread = await interaction.client.channels.fetch(raidData.threadId);
        if (thread) {
          await thread.send({ embeds: [victoryEmbed] });
          console.log(`[raid.js]: ✅ Victory embed sent to raid thread`);
        }
      } catch (error) {
        console.error(`[raid.js]: ❌ Error sending victory embed to thread:`, error);
        console.log(`[raid.js]: ⚠️ Thread may not exist or be accessible`);
      }
    } else {
      console.log(`[raid.js]: ⚠️ No thread ID found for raid ${raidData.raidId} - victory embed will only be sent to the original interaction`);
      // Only send to original interaction if no thread exists
      await interaction.followUp({ embeds: [victoryEmbed] });
    }
    
  } catch (error) {
    handleError(error, 'raid.js', {
      functionName: 'handleRaidVictory',
      raidId: raidData.raidId,
      monsterName: monster.name
    });
    console.error(`[raid.js]: ❌ Error handling raid victory:`, error);
    
    // Send a simple victory message if the full victory handling fails
    await interaction.editReply({
      content: `🎉 **${monster.name} has been defeated!** The raid is complete!`,
      ephemeral: false
    });
  }
}

// ---- Function: generateLootedItem ----
// Generates looted item for raid participants based on damage dealt
function generateLootedItem(monster, weightedItems, damageDealt = 0) {
  if (weightedItems.length === 0) {
    return {
      itemName: 'nothing',
      quantity: 0,
      category: ['Misc'],
      type: ['Misc'],
      subtype: ['Misc'],
      emoji: ''
    };
  }
  
  // Calculate damage-based loot multiplier
  // More damage = better chance of rare items
  let lootMultiplier = 1;
  if (damageDealt >= 10) {
    lootMultiplier = 3; // High damage dealers get 3x better loot chances
  } else if (damageDealt >= 5) {
    lootMultiplier = 2; // Medium damage dealers get 2x better loot chances
  } else if (damageDealt >= 2) {
    lootMultiplier = 1.5; // Low damage dealers get 1.5x better loot chances
  }
  // 0-1 damage = 1x multiplier (base chance)
  
  // Create weighted selection based on damage
  const weightedSelection = [];
  for (let i = 0; i < weightedItems.length; i++) {
    const item = weightedItems[i];
    // Higher damage = more copies of rare items in the selection pool
    const copies = Math.floor(lootMultiplier * (item.itemRarity || 1));
    for (let j = 0; j < copies; j++) {
      weightedSelection.push(item);
    }
  }
  
  // If no items in weighted selection, fall back to original
  const selectionPool = weightedSelection.length > 0 ? weightedSelection : weightedItems;
  const randomIndex = Math.floor(Math.random() * selectionPool.length);
  const lootedItem = { ...selectionPool[randomIndex] };

  // Handle Chuchu special case
  if (monster.name.includes("Chuchu")) {
    let jellyType;
    if (monster.name.includes('Ice')) {
      jellyType = 'White Chuchu Jelly';
    } else if (monster.name.includes('Fire')) {
      jellyType = 'Red Chuchu Jelly';
    } else if (monster.name.includes('Electric')) {
      jellyType = 'Yellow Chuchu Jelly';
    } else {
      jellyType = 'Chuchu Jelly';
    }
    const quantity = monster.name.includes("Large")
      ? 3
      : monster.name.includes("Medium")
      ? 2
      : 1;
    lootedItem.itemName = jellyType;
    lootedItem.quantity = quantity;
    lootedItem.emoji = '<:Chuchu_Jelly:744755431175356416>';
  } else {
    lootedItem.quantity = 1; // Default quantity for non-Chuchu items
  }

  return lootedItem;
}
