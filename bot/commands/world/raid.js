// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { handleInteractionError } = require('../../../shared/utils/globalErrorHandler');
const { fetchAnyCharacterByNameAndUserId } = require('../../../shared/database/db');
const { joinRaid, processRaidTurn, checkRaidExpiration } = require('../../modules/raidModule');
const { createRaidKOEmbed, createBlightRaidParticipationEmbed } = require('../../embeds/embeds.js');
const Raid = require('../../../shared/models/RaidModel');

// ============================================================================
// ---- Import Loot Functions ----
// ============================================================================
const { fetchItemsByMonster } = require('../../../shared/database/db');
const { createWeightedItemList, calculateFinalValue } = require('../../modules/rngModule');
const { addItemInventoryDatabase } = require('../../../shared/utils/inventoryUtils');
const { isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../../../shared/utils/validation');
const { authorizeSheets, safeAppendDataToSheet } = require('../../../shared/utils/googleSheetsUtils');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// ---- Import Inventory Sync Check ----
// ============================================================================
const { checkInventorySync } = require('../../../shared/utils/characterUtils');

// ============================================================================
// ---- Raid Loot System ----
// ============================================================================
// High damage dealers in raids are guaranteed high rarity items:
// - 8+ hearts damage: Legendary items (rarity 10)
// - 6+ hearts damage: Rare items (rarity 8+)
// - 4+ hearts damage: Uncommon items (rarity 6+)
// - 2+ hearts damage: Better common items (rarity 4+)
// - Each participant gets weighted items based on their damage performance

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

// Universal raid role for all villages (replaces resident + visiting during raids)
const UNIVERSAL_RAID_ROLE = '1205321558671884328';

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
        .setAutocomplete(true)
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
      let raidId = interaction.options.getString('raidid');
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;
      
      // Extract raid ID if user pasted the full description
      if (raidId.includes(' | ')) {
        raidId = raidId.split(' | ')[0];
      }

      // Fetch and validate character with user ownership (includes both regular and mod characters)
      const character = await fetchAnyCharacterByNameAndUserId(characterName, userId);
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
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Inventory Sync Required'
            }
          }],
          ephemeral: true
        });
        return;
      }

      // Note: KO'd characters can still take turns in raids (KO status is handled during combat)

      // Check raid expiration and get raid data
      const raidData = await checkRaidExpiration(raidId);
      if (!raidData) {
        // Get all active raids for debugging
        const allRaids = await Raid.find({ status: 'active' }).select('raidId village monster.name createdAt').limit(10);
        const activeRaidIds = allRaids.map(r => r.raidId).join(', ');
        
        const raidNotFoundEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Raid Not Found!')
          .setDescription(`The raid ID you entered could not be found.`)
          .addFields(
            {
              name: '🔍 Raid ID Entered',
              value: `\`${raidId}\``,
              inline: false
            },
            {
              name: '📋 Available Active Raids',
              value: activeRaidIds || 'None',
              inline: false
            },
            {
              name: '⚠️ Possible Issues',
              value: '• Check if you copied the raid ID correctly\n• The raid may have expired (20-minute time limit)\n• The raid may have been completed\n• Check the raid announcement for the correct ID',
              inline: false
            }
          )
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: 'Raid System' })
          .setTimestamp();

        return interaction.editReply({
          embeds: [raidNotFoundEmbed],
          ephemeral: true
        });
      }

      if (raidData.status !== 'active') {
        return interaction.editReply({
          content: `❌ **Raid ${raidId} is no longer active!**\n\n**Status:** ${raidData.status}\n\n**Possible reasons:**\n• The raid has been completed by other players\n• The raid has expired (20-minute time limit)\n• The raid was manually ended by a moderator\n\n**To join a new raid:**\n• Wait for a new raid announcement\n• Check the village town hall for active raids\n• Use the raid ID from the most recent announcement`,
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

      // Check if character has blight stage 3 or higher (monsters don't attack them)
      if (character.blighted && character.blightStage >= 3) {
        return interaction.editReply({
          embeds: [createBlightRaidParticipationEmbed(character)],
          ephemeral: true
        });
      }

      // Try to join the raid if not already participating
      let updatedRaidData = raidData;
      
      // Ensure participants array exists
      if (!raidData.participants) {
        console.warn(`[raid.js]: ⚠️ Raid ${raidId} has no participants array, initializing...`);
        raidData.participants = [];
      }
      
      // Additional safety check to ensure participants is an array
      if (!Array.isArray(raidData.participants)) {
        console.warn(`[raid.js]: ⚠️ Raid ${raidId} participants is not an array, initializing...`);
        raidData.participants = [];
      }
      
      const existingParticipant = raidData.participants.find(p => 
        p.characterId.toString() === character._id.toString()
      );
      
      let blightRainMessage = null;
      if (!existingParticipant) {
        try {
          const joinResult = await joinRaid(character, raidId);
          updatedRaidData = joinResult.raidData;
          blightRainMessage = joinResult.blightRainMessage;
        } catch (joinError) {
          console.error(`[raid.js]: ❌ Join raid error for ${character.name}:`, joinError);
          return interaction.editReply({
            content: `❌ **Failed to join raid:** ${joinError.message}\n\n**Character:** ${character.name}\n**Raid ID:** \`${raidId}\`\n**Current Village:** ${character.currentVillage}`,
            ephemeral: true
          });
        }
      } else {
        // Character already in raid logged only in debug mode
      }

      // Log turn order info for debugging (but don't enforce)
      const currentTurnParticipant = updatedRaidData.getCurrentTurnParticipant();
      // Turn processing details logged only in debug mode

      // Process the raid turn
      const turnResult = await processRaidTurn(character, raidId, interaction, updatedRaidData);
      
      // Create embed for the turn result using the updated raid data from turnResult
      const { embed, koCharacters } = await createRaidTurnEmbed(character, raidId, turnResult, turnResult.raidData);

      // Check if monster was defeated in this turn
      if (turnResult.raidData.monster.currentHearts <= 0 && turnResult.raidData.status === 'completed') {
        // Send the final turn embed first
        const finalResponse = { embeds: [embed] };
        if (blightRainMessage) {
          finalResponse.content = blightRainMessage;
        }
        await interaction.editReply(finalResponse);
        
        // Send immediate victory embed before loot processing
        const { createRaidVictoryEmbed } = require('../../embeds/embeds.js');
        const victoryEmbed = createRaidVictoryEmbed(
          turnResult.raidData.monster.name, 
          turnResult.raidData.monster.image
        );
        
        const immediateVictoryMessage = await interaction.followUp({
          embeds: [victoryEmbed],
          ephemeral: false
        });
        
        // Then handle raid victory (which will send a follow-up)
        await handleRaidVictory(interaction, turnResult.raidData, turnResult.raidData.monster);
        return;
      }
      
      // Send the turn result embed without user mention
      const response = { embeds: [embed] };
      
      // Add blight rain message if present
      if (blightRainMessage) {
        response.content = blightRainMessage;
      }
      
      return interaction.editReply(response);

    } catch (error) {
      await handleInteractionError(error, interaction, {
        source: 'raid.js',
        raidId: interaction.options.getString('raidid'),
        characterName: interaction.options.getString('charactername')
      });
    }
  },
};

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ---- Function: calculateDamageFromRoll ----
// Calculates monster damage based on roll value and monster tier (without equipment bonuses)
// This matches the logic from encounterModule.js
function calculateDamageFromRoll(roll, monsterTier) {
  if (monsterTier <= 4) {
    // Low tier logic from getEncounterOutcome
    if (roll <= 25) {
      return monsterTier;
    } else if (roll <= 50) {
      return monsterTier === 1 ? 0 : monsterTier - 1;
    } else if (roll <= 75) {
      return monsterTier <= 2 ? 0 : monsterTier - 2;
    } else {
      return 0; // Win/loot
    }
  } else {
    // High tier logic - all tiers 5-10 use the same damage ranges
    // Based on the encounter module logic
    if (roll <= 9) {
      return 0; // Character takes damage, monster takes 0
    } else if (roll <= 18) {
      return 0; // Character takes damage, monster takes 0
    } else if (roll <= 27) {
      return 0; // Character takes damage, monster takes 0
    } else if (roll <= 36) {
      return 0; // Character takes damage, monster takes 0
    } else if (roll <= 45) {
      return 0; // Character takes damage, monster takes 0 (tiers 7-10)
    } else if (roll <= 54) {
      return 0; // Character takes damage, monster takes 0
    } else if (roll <= 63) {
      return 0; // Character takes damage, monster takes 0
    } else if (roll <= 72) {
      return 1; // Monster takes 1 damage
    } else if (roll <= 81) {
      return 1; // Monster takes 1 damage
    } else if (roll <= 90) {
      return 2; // Monster takes 2 damage
    } else {
      return 3; // Monster takes 3 damage
    }
  }
}

// ---- Function: getVillageRoleMention ----
// Gets the proper role mention for raids - uses universal raid role for all villages
function getVillageRoleMention(village) {
  // Use universal raid role for all village raids
  return `<@&${UNIVERSAL_RAID_ROLE}>`;
}

// ---- Function: createRaidTurnEmbed ----
// Creates an embed showing the results of a raid turn
async function createRaidTurnEmbed(character, raidId, turnResult, raidData) {
  const { battleResult, participant } = turnResult;
  const { monster } = raidData;

  // Get monster image from monsterMapping
  const { monsterMapping } = require('../../../shared/models/MonsterModel');
  const monsterDetails = monsterMapping && monsterMapping[monster.nameMapping]
    ? monsterMapping[monster.nameMapping]
    : { image: monster.image };
  const monsterImage = monsterDetails.image || monster.image || 'https://storage.googleapis.com/tinglebot/Graphics/border.png';

  // Get character icon (if available)
  const characterIcon = character.icon || 'https://storage.googleapis.com/tinglebot/Graphics/border.png';

  // Build turn order list with current turn indicator
  const participants = raidData.participants || [];
  const currentTurnIndex = raidData.currentTurn || 0;
  
  // Turn order display details logged only in debug mode
  
  // Create turn order with current turn indicator
  const turnOrderLines = [];
  const koCharacters = [];
  
  // Get current character states from database
  const Character = require('../../../shared/models/CharacterModel');
  
  // Get the effective current turn participant (skipping KO'd participants)
  const effectiveCurrentTurnParticipant = await raidData.getEffectiveCurrentTurnParticipant();
  const effectiveCurrentTurnIndex = participants.findIndex(p => p.characterId.toString() === effectiveCurrentTurnParticipant?.characterId?.toString());
  
  for (let idx = 0; idx < participants.length; idx++) {
    const p = participants[idx];
    const isCurrentTurn = idx === currentTurnIndex;
    const isEffectiveCurrentTurn = idx === effectiveCurrentTurnIndex;
    
    // Get current character state from database
    const currentCharacter = await Character.findById(p.characterId);
    const isKO = currentCharacter?.ko || false;
    
    // Participant status logged only in debug mode
    
    if (isKO) {
      koCharacters.push(p.name);
      turnOrderLines.push(`${idx + 1}. ${p.name} 💀 (KO'd)`);
            } else if (isEffectiveCurrentTurn) {
          // Show turn indicator on the effective current turn participant
          turnOrderLines.push(`${idx + 1}. ${p.name}`);
        } else {
      turnOrderLines.push(`${idx + 1}. ${p.name}`);
    }
  }
  
  const turnOrder = turnOrderLines.join('\n');
  // Final turn order display logged only in debug mode
  
  // User mention removed - not working as intended

  // Calculate remaining time
  const now = new Date();
  const expiresAt = new Date(raidData.expiresAt);
  const timeRemaining = expiresAt.getTime() - now.getTime();
  
  // Format remaining time
  let timeString = '';
  if (timeRemaining > 0) {
    const minutes = Math.floor(timeRemaining / (1000 * 60));
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
    timeString = `${minutes}m ${seconds}s remaining`;
  } else {
    timeString = '⏰ Time expired!';
  }

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
    .setDescription(battleResult.outcome || 'Battle completed')
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
        name: `__Roll Details__`,
        value: `🎲 **Roll:** ${battleResult.originalRoll} → ${Math.round(battleResult.adjustedRandomValue)}\n${battleResult.attackSuccess && battleResult.attackStat > 0 ? `⚔️ **ATK +${Math.round(battleResult.attackStat * 1.8)} (${battleResult.attackStat} attack)` : ''}${battleResult.defenseSuccess && battleResult.defenseStat > 0 ? `${battleResult.attackSuccess && battleResult.attackStat > 0 ? ' | ' : ''}🛡️ **DEF +${Math.round(battleResult.defenseStat * 0.7)} (${battleResult.defenseStat} defense)` : ''}`,
        inline: false
      },
      {
        name: `__Turn Order__`,
        value: turnOrder || 'No participants',
        inline: false
      },
      {
        name: `__⏰ Time Remaining__`,
        value: `**${timeString}**`,
        inline: false
      },
      {
        name: 'Raid ID',
        value: `\`\`\`${raidId}\`\`\``,
        inline: false
      },
      {
        name: 'Want to join in?',
        value: 'Use </raid:1433351189269053455> to join!',
        inline: false
      },


    )
    .setThumbnail(monsterImage)
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setFooter({ 
      text: `Raid ID: ${raidId} • Use /raid to take your turn! • Use /item to heal characters!` 
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

  return { embed, koCharacters };
}

// ---- Function: handleRaidVictory ----
// Handles raid victory with loot distribution for all participants
// Includes error handling that skips failed characters and notifies mods
async function handleRaidVictory(interaction, raidData, monster) {
  try {
    const participants = raidData.participants || [];
    console.log(`[raid.js]: 🎉 Raid victory! Processing loot for ${participants.length} participants`);
    
    // Fetch items for the monster
    const items = await fetchItemsByMonster(monster.name);
    
    // Process loot for each participant
    const lootResults = [];
    const failedCharacters = [];
    const blightedCharacters = [];
    const Character = require('../../../shared/models/CharacterModel');
    const User = require('../../../shared/models/UserModel');
    
    for (const participant of participants) {
      try {
        // Fetch the character's current data - check both regular and mod characters
        let character = await Character.findById(participant.characterId);
        if (!character) {
          // Try to find as mod character
          const ModCharacter = require('../../../shared/models/ModCharacterModel');
          character = await ModCharacter.findById(participant.characterId);
        }
        
        if (!character) {
          console.log(`[raid.js]: ⚠️ Character ${participant.name} not found in either collection, skipping loot`);
          failedCharacters.push({
            name: participant.name,
            reason: 'Character not found in database'
          });
          continue;
        }
        
        // Create weighted items based on this participant's damage performance
        // Higher damage = better final value = better item pool
        // This ensures high damage dealers get access to higher rarity items
        const finalValue = Math.min(100, Math.max(1, participant.damage * 10)); // Scale damage to 1-100 range
        const weightedItems = createWeightedItemList(items, finalValue);
        
        // Generate loot for this participant based on damage dealt
        const lootedItem = await generateLootedItem(monster, weightedItems, participant.damage);
        
        if (!lootedItem) {
          console.log(`[raid.js]: ⚠️ No lootable items found for ${participant.name}, skipping loot`);
          failedCharacters.push({
            name: participant.name,
            reason: 'No lootable items found'
          });
          continue;
        }

        // Add to inventory if character has valid inventory link
        if (character.inventory && isValidGoogleSheetsUrl(character.inventory)) {
          try {
            await addItemInventoryDatabase(
              character._id,
              lootedItem.itemName,
              lootedItem.quantity,
              interaction,
              "Raid Loot"
            );
            
            // Note: Google Sheets sync is handled by addItemInventoryDatabase
            
            // Determine loot quality indicator based on damage
            let qualityIndicator = '';
            if (participant.damage >= 10) {
              qualityIndicator = ' 🔥'; // High damage = fire emoji
            } else if (participant.damage >= 5) {
              qualityIndicator = ' ⚡'; // Medium damage = lightning emoji
            } else if (participant.damage >= 2) {
              qualityIndicator = ' ✨'; // Low damage = sparkle emoji
            }
            
            lootResults.push(`**${character.name}**${qualityIndicator} got ${lootedItem.emoji || ''} **${lootedItem.itemName}** × ${lootedItem.quantity}!`);
            
          } catch (error) {
            console.error(`[raid.js]: ❌ Error processing loot for ${character.name}:`, error);
            console.error(`[raid.js]: 📊 Character details:`, {
              name: character.name,
              userId: character.userId,
              hasInventory: !!character.inventory,
              inventoryUrl: character.inventory,
              isModCharacter: character.isModCharacter,
              characterType: character.constructor?.name || 'Unknown'
            });
            
            // Add to failed characters list
            failedCharacters.push({
              name: character.name,
              reason: `Inventory sync failed: ${error.message}`,
              lootedItem: lootedItem
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
            
            lootResults.push(`**${character.name}**${qualityIndicator} got ${lootedItem.emoji || ''} **${lootedItem.itemName}** × ${lootedItem.quantity}! *(inventory sync failed)*`);
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
          
          lootResults.push(`**${character.name}**${qualityIndicator} got ${lootedItem.emoji || ''} **${lootedItem.itemName}** × ${lootedItem.quantity}! *(no inventory link)*`);
        }
        
        // ------------------- Gloom Hands Blight Effect -------------------
        // Check if this was a Gloom Hands raid and apply 25% blight chance
        if (monster.nameMapping === 'gloomHands' && Math.random() < 0.25) {
          // Only apply blight if character isn't already blighted
          if (!character.blighted) {
            try {
              // Apply blight to character
              character.blighted = true;
              character.blightedAt = new Date();
              character.blightStage = 1;
              character.blightPaused = false;
              await character.save();
              
              // Assign blight role to character owner
              const guild = interaction.guild;
              if (guild) {
                const member = await guild.members.fetch(character.userId);
                await member.roles.add('798387447967907910');
                console.log(`[raid.js]: ✅ Added blight role to user ${character.userId} for character ${character.name} (Gloom Hands effect)`);
              }
              
              // Update user's blightedcharacter status
              const user = await User.findOne({ discordId: character.userId });
              if (user) {
                user.blightedcharacter = true;
                await user.save();
              }
              
              blightedCharacters.push(character.name);
              console.log(`[raid.js]: 🧿 Character ${character.name} was blighted by Gloom Hands effect`);
              
            } catch (blightError) {
              console.error(`[raid.js]: ❌ Error applying blight to ${character.name}:`, blightError);
            }
          } else {
            console.log(`[raid.js]: ⚠️ Character ${character.name} is already blighted, skipping Gloom Hands blight effect`);
          }
        }
        
      } catch (error) {
        console.error(`[raid.js]: ❌ Error processing participant ${participant.name}:`, error);
        
        // Add to failed characters list
        failedCharacters.push({
          name: participant.name,
          reason: `General error: ${error.message}`
        });
        
        lootResults.push(`**${participant.name}** - *Error processing loot*`);
      }
    }
    
    // Create participant list
    const participantList = participants.map(p => `• **${p.name}** (${p.damage} hearts)`).join('\n');
    
    // Get monster image from monsterMapping
    const { monsterMapping } = require('../../../shared/models/MonsterModel');
    const monsterDetails = monsterMapping && monsterMapping[monster.nameMapping] 
      ? monsterMapping[monster.nameMapping] 
      : { image: monster.image };
    const monsterImage = monsterDetails.image || monster.image || 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
    
    // Create victory embed
    const victoryEmbed = new EmbedBuilder()
      .setColor('#FFD700') // Gold color for victory
      .setTitle(`🎉 **${monster.name} Defeated!**`)
      .setDescription(`The raid has been completed successfully! Here's what everyone got:`)
      .addFields(
        {
          name: '__Raid Summary__',
          value: `🎯 **Total Damage:** ${raidData.analytics.totalDamage} hearts\n👥 **Participants:** ${participants.length}\n⏱️ **Duration:** ${Math.floor((raidData.analytics.endTime - raidData.analytics.startTime) / 1000 / 60)}m`,
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
        }
      );
    
    // Add blight information if any characters were blighted by Gloom Hands
    if (blightedCharacters.length > 0) {
      victoryEmbed.addFields({
        name: '<:blight_eye:805576955725611058> **Gloom Hands Blight Effect**',
        value: `The following characters have been **blighted** by the Gloom Hands encounter:\n${blightedCharacters.map(name => `• **${name}**`).join('\n')}\n\nYou can be healed by **Oracles, Sages & Dragons**\n▹ [Blight Information](https://rootsofthewild.com/world/blight)`,
        inline: false
      });
    }
    
    victoryEmbed
      .setThumbnail(monsterImage)
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
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
    
    // Notify mods if there were any failed loot processing
    if (failedCharacters.length > 0) {
      try {
        // Get mod channel or use the current channel
        const modChannel = interaction.client.channels.cache.find(channel => 
          channel.name === 'mod-logs' || channel.name === 'mod-logs' || channel.name === 'admin'
        ) || interaction.channel;
        
        const failedLootEmbed = new EmbedBuilder()
          .setColor('#FF6B6B') // Red color for warnings
          .setTitle(`⚠️ Raid Loot Processing Issues`)
          .setDescription(`Some characters had issues receiving their raid loot. Please investigate:`)
          .addFields(
            {
              name: '__Failed Characters__',
              value: failedCharacters.map(fc => 
                `• **${fc.name}**: ${fc.reason}${fc.lootedItem ? ` (${fc.lootedItem.itemName} × ${fc.lootedItem.quantity})` : ''}`
              ).join('\n'),
              inline: false
            },
            {
              name: '__Raid Details__',
              value: `**Monster:** ${monster.name}\n**Raid ID:** ${raidData.raidId}\n**Channel:** <#${interaction.channelId}>\n**Message:** ${interaction.url}`,
              inline: false
            }
          )
          .setTimestamp();
        
        await modChannel.send({ embeds: [failedLootEmbed] });
        console.log(`[raid.js]: ⚠️ Sent loot processing failure notification to mods for ${failedCharacters.length} characters`);
        
      } catch (error) {
        console.error(`[raid.js]: ❌ Error notifying mods about loot processing failures:`, error);
      }
    }
    
  } catch (error) {
    handleInteractionError(error, 'raid.js', {
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
// High damage dealers are guaranteed high rarity items
async function generateLootedItem(monster, weightedItems, damageDealt = 0) {
  // Determine target rarity based on damage dealt
  let targetRarity = 1; // Default to common
  
  if (damageDealt >= 8) {
    targetRarity = 10; // Legendary items for top damage dealers
  } else if (damageDealt >= 6) {
    targetRarity = 8; // Rare items for high damage dealers
  } else if (damageDealt >= 4) {
    targetRarity = 6; // Uncommon items for medium damage dealers
  } else if (damageDealt >= 2) {
    targetRarity = 4; // Better common items for low damage dealers
  }
  
  // Filter items by target rarity, with fallback to lower rarities if needed
  let selectionPool = weightedItems.filter(item => item.itemRarity >= targetRarity);
  
  // If no items found at target rarity, fallback to lower rarities
  if (selectionPool.length === 0) {
    // Try to find items at least 2 rarity levels below target
    const fallbackRarity = Math.max(1, targetRarity - 2);
    selectionPool = weightedItems.filter(item => item.itemRarity >= fallbackRarity);
    
    // If still no items, use all available items
    if (selectionPool.length === 0) {
      selectionPool = weightedItems;
    }
    
    console.log(`[raid.js]: ⚠️ Fallback loot selection for ${damageDealt} damage - target: ${targetRarity}, fallback: ${fallbackRarity}, available: ${selectionPool.length} items`);
  }
  
  if (selectionPool.length === 0) {
    return null;
  }
  
  // Select item from the filtered pool
  const randomIndex = Math.floor(Math.random() * selectionPool.length);
  const lootedItem = { ...selectionPool[randomIndex] };
  
  // Log the rarity selection for debugging
  console.log(`[raid.js]: 🎯 Loot selection for ${damageDealt} damage - Target rarity: ${targetRarity}, Selected rarity: ${lootedItem.itemRarity}, Item: ${lootedItem.itemName}`);

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
    
    // Fetch the correct emoji from the database for the jelly type
    try {
      const ItemModel = require('../../../shared/models/ItemModel');
      const jellyItem = await ItemModel.findOne({ itemName: jellyType }).select('emoji');
      if (jellyItem && jellyItem.emoji) {
        lootedItem.emoji = jellyItem.emoji;
      }
    } catch (error) {
      console.error(`[raid.js]: Error fetching emoji for ${jellyType}:`, error);
      // Keep the original emoji if there's an error
    }
  } else {
    lootedItem.quantity = 1; // Default quantity for non-Chuchu items
  }

  return lootedItem;
}
