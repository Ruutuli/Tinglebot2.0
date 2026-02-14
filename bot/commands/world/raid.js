// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const { fetchAnyCharacterByNameAndUserId } = require('@/database/db');
const { joinRaid, processRaidTurn, checkRaidExpiration, leaveRaid, scheduleRaidTurnSkip } = require('../../modules/raidModule');
const { createRaidKOEmbed, createBlightRaidParticipationEmbed, getExploreCommandId } = require('../../embeds/embeds.js');
const Raid = require('@/models/RaidModel');
const { finalizeBlightApplication } = require('../../handlers/blightHandler');

// ============================================================================
// ---- Import Loot Functions ----
// ============================================================================
const { fetchItemsByMonster } = require('@/database/db');
const { createWeightedItemList, calculateFinalValue } = require('../../modules/rngModule');
const { addItemInventoryDatabase } = require('@/utils/inventoryUtils');
// Google Sheets validation removed
// Google Sheets functionality removed
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// ---- Import Inventory Sync Check ----
// ============================================================================
const { checkInventorySync } = require('@/utils/characterUtils');
const { enforceJail } = require('@/utils/jailCheck');

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
// Discord embed field limits (characters)
const EMBED_FIELD_VALUE_MAX = 1024;
const EMBED_FIELD_NAME_MAX = 256;

/** Truncates a string for embed field value/name to prevent Discord API validation errors */
function truncateEmbedField(str, maxLen = EMBED_FIELD_VALUE_MAX) {
  if (str == null || str === '') return '\u200b'; // Zero-width space for empty
  const s = String(str);
  return s.length > maxLen ? s.slice(0, maxLen - 3) + '...' : s;
}

/** Splits long text into multiple embed fields (max 1024 chars each). Splits on newlines when possible. */
function splitIntoEmbedFields(text, baseName, maxLen = EMBED_FIELD_VALUE_MAX) {
  if (text == null || text === '') return [{ name: baseName, value: '\u200b', inline: false }];
  const s = String(text);
  if (s.length <= maxLen) return [{ name: baseName, value: s, inline: false }];
  const lines = s.split('\n');
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const candidate = current ? current + '\n' + line : line;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      // If single line exceeds maxLen, hard-split it
      if (line.length > maxLen) {
        for (let i = 0; i < line.length; i += maxLen) {
          chunks.push(line.slice(i, i + maxLen));
        }
        current = '';
      } else {
        current = line;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.map((value, i) => ({
    name: chunks.length > 1 ? `${baseName} (${i + 1}/${chunks.length})` : baseName,
    value,
    inline: false
  }));
}
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
    .setDescription('Join a raid or take your turn. New joiners are added at the end of turn order.')
    .addStringOption(option =>
      option
        .setName('raidid')
        .setDescription('The ID of the raid')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('charactername')
        .setDescription('The name of your character')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('Join/take turn (default) or leave the raid')
        .setRequired(false)
        .addChoices(
          { name: 'Leave raid', value: 'leave' }
        )
    ),

  // ============================================================================
  // ---- Command Execution ----
  // ============================================================================
  async execute(interaction) {
    try {
      const action = interaction.options.getString('action');
      if (action === 'leave') {
        return await this.handleLeave(interaction);
      }
      return await this.handleJoin(interaction);
    } catch (error) {
      await handleInteractionError(error, interaction, {
        source: 'raid.js',
        raidId: interaction.options.getString('raidid'),
        characterName: interaction.options.getString('charactername')
      });
    }
  },

  // ============================================================================
  // ---- handleLeave ----
  // ============================================================================
  async handleLeave(interaction) {
    await interaction.deferReply();
    let raidId = interaction.options.getString('raidid');
    const characterName = interaction.options.getString('charactername');
    const userId = interaction.user.id;
    if (raidId.includes(' | ')) raidId = raidId.split(' | ')[0];

    const character = await fetchAnyCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      return interaction.editReply({
        content: `❌ Character "${characterName}" not found or doesn't belong to you.`,
        ephemeral: true
      });
    }

    try {
      const result = await leaveRaid(character, raidId, { client: interaction.client });
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Left raid')
        .setDescription(`**${character.name}** has left the raid.${result.eligibleForLoot ? ' They will still receive loot if the raid succeeds (1+ damage or 3+ rounds).' : ''}`)
        .addFields(
          { name: 'Raid ID', value: `\`${raidId}\``, inline: false }
        )
        .setFooter({ text: 'Raid System' })
        .setTimestamp();
      const embeds = [embed];
      if (result.nextTurnMention) {
        embeds.push(
          new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚔️ It\'s your turn')
            .setDescription(`It's your turn — use </raid:1470659276287774734> to roll.`)
            .setFooter({ text: 'Raid System' })
            .setTimestamp()
        );
      }
      const content = result.nextTurnMention || null;
      return interaction.editReply({ content, embeds });
    } catch (err) {
      return interaction.editReply({
        content: `❌ **Leave failed:** ${err.message}`,
        ephemeral: true
      });
    }
  },

  // ============================================================================
  // ---- handleJoin (join + take turn) ----
  // ============================================================================
  async handleJoin(interaction) {
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

      // ------------------- Check Jail Status -------------------
      if (await enforceJail(interaction, character)) {
        return;
      }

      // ------------------- Check Inventory Sync -------------------
      // (no longer required, but kept for compatibility)
      await checkInventorySync(character);

      // KO'd characters cannot join raids (blocked in joinRaid); existing participants who get KO'd during combat are skipped in turn order

      // Check raid expiration and get raid data
      const raidData = await checkRaidExpiration(raidId, interaction.client);
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
            },
            {
              name: '__To join a raid__',
              value: 'Use </raid:1470659276287774734> with a valid raid ID from an announcement.',
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
        const raidInactiveEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle(`❌ Raid ${raidId} is no longer active!`)
          .addFields(
            {
              name: '__Status__',
              value: raidData.status,
              inline: false
            },
            {
              name: '__Possible reasons__',
              value: '• The raid has been completed by other players\n• The raid has expired (20-minute time limit)\n• The raid was manually ended by a moderator',
              inline: false
            },
            {
              name: '__To join a new raid__',
              value: '• Wait for a new raid announcement\n• Check the village town hall for active raids\n• Use </raid:1470659276287774734> with the raid ID from the most recent announcement',
              inline: false
            }
          )
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: 'Raid System' })
          .setTimestamp();
        return interaction.editReply({
          embeds: [raidInactiveEmbed],
          ephemeral: true
        });
      }

      // Check if character is in the same village as the raid
      if (character.currentVillage.toLowerCase() !== raidData.village.toLowerCase()) {
        const villageEmojis = {
          rudania: '<:rudania:899492917452890142>',
          inariko: '<:inariko:899493009073274920>',
          vhintl: '<:vhintl:899492879205007450>',
        };
        const currentVillageEmoji = villageEmojis[character.currentVillage.toLowerCase()] || '';
        const raidVillageEmoji = villageEmojis[raidData.village.toLowerCase()] || '';
        const capitalizeFirstLetter = (str) => str.charAt(0).toUpperCase() + str.slice(1);

        const wrongVillageEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Wrong Village!')
          .setDescription(`**${character.name}** must be in **${raidVillageEmoji} ${capitalizeFirstLetter(raidData.village)}** to participate in this raid.`)
          .addFields(
            {
              name: '__Current Location__',
              value: `${currentVillageEmoji} ${capitalizeFirstLetter(character.currentVillage)}`,
              inline: true
            },
            {
              name: '__Required Location__',
              value: `${raidVillageEmoji} ${capitalizeFirstLetter(raidData.village)}`,
              inline: true
            },
            {
              name: '__Raid ID__',
              value: `\`${raidId}\``,
              inline: false
            },
            {
              name: '__💡 Need to travel?__',
              value: 'Use `/travel` to move between villages.',
              inline: false
            }
          )
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: 'Raid System' })
          .setTimestamp();

        return interaction.editReply({
          embeds: [wrongVillageEmbed],
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

      // Check raid participant cap (max 10) before attempting to join (mod characters can join at any time)
      const MAX_RAID_PARTICIPANTS = 10;
      if (!existingParticipant && !character.isModCharacter && raidData.participants.length >= MAX_RAID_PARTICIPANTS) {
        const raidFullEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Raid is full!')
          .setDescription(`This raid has reached the maximum of **${MAX_RAID_PARTICIPANTS} participants**. (${raidData.participants.length}/${MAX_RAID_PARTICIPANTS})`)
          .addFields({
            name: '__Try again__',
            value: 'Try joining another raid when one is announced! Use </raid:1470659276287774734> with a different raid ID.',
            inline: false
          })
          .setFooter({ text: 'Raid System' })
          .setTimestamp();
        return interaction.editReply({
          embeds: [raidFullEmbed],
          ephemeral: true
        });
      }
      
      let blightRainMessage = null;
      if (!existingParticipant) {
        try {
          const joinResult = await joinRaid(character, raidId, {
            client: interaction.client,
            guild: interaction.guild
          });
          updatedRaidData = joinResult.raidData;
          blightRainMessage = joinResult.blightRainMessage;
        } catch (joinError) {
          const message = (joinError && typeof joinError.message === 'string') ? joinError.message : (typeof joinError === 'string' ? joinError : 'Unable to join raid.');
          console.error(`[raid.js]: ❌ Join raid error for ${character.name}:`, joinError);
          if (message === 'You already have a character participating in this raid') {
            const alreadyInRaidEmbed = new EmbedBuilder()
              .setColor('#FFA500')
              .setTitle('👋 Already in This Raid!')
              .setDescription(`Hey! You already have a character participating in this raid.`)
              .addFields(
                {
                  name: '__Character__',
                  value: character.name,
                  inline: true
                },
                {
                  name: '__Raid ID__',
                  value: `\`${raidId}\``,
                  inline: true
                },
                {
                  name: '__Current Village__',
                  value: character.currentVillage,
                  inline: true
                },
                {
                  name: '__💡 What to do?__',
                  value: 'Use </raid:1470659276287774734> again to take your turn, or join with a different character.',
                  inline: false
                }
              )
              .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
              .setFooter({ text: 'Raid System' })
              .setTimestamp();
            return interaction.editReply({
              embeds: [alreadyInRaidEmbed],
              ephemeral: true
            });
          }
          if (message.includes("KO'd") || message.includes('cannot join the raid')) {
            const koCantJoinEmbed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Can\'t join — character is KO\'d')
              .setDescription(`**${character.name}** is knocked out and must be healed before joining a raid.`)
              .addFields(
                {
                  name: '__What to do__',
                  value: `Use </item:1463789335626125378> to use a healing item on **${character.name}**, then use </raid:1470659276287774734> to join again.`,
                  inline: false
                },
                {
                  name: '__Raid ID__',
                  value: `\`${raidId}\``,
                  inline: true
                },
                {
                  name: '__Village__',
                  value: character.currentVillage,
                  inline: true
                }
              )
              .setFooter({ text: 'Raid System' })
              .setTimestamp();
            return interaction.editReply({
              embeds: [koCantJoinEmbed],
              ephemeral: true
            });
          }
          const failedJoinEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Failed to join raid')
            .setDescription(message)
            .addFields(
              { name: '__Character__', value: character.name, inline: true },
              { name: '__Raid ID__', value: `\`${raidId}\``, inline: true },
              { name: '__Current Village__', value: character.currentVillage, inline: true },
              {
                name: '__Try again__',
                value: 'Use </raid:1470659276287774734> with the correct raid ID and character.',
                inline: false
              }
            )
            .setFooter({ text: 'Raid System' })
            .setTimestamp();
          return interaction.editReply({
            embeds: [failedJoinEmbed],
            ephemeral: true
          });
        }
      } else {
        // Character already in raid
      }

      // When someone new joins: start or reset the 1-minute skip timer for the current turn holder (so they get a full minute; mid-raid join no longer wrongly skips them).
      if (!existingParticipant && updatedRaidData.participants?.length > 0) {
        await scheduleRaidTurnSkip(raidId);
      }

      const myParticipant = updatedRaidData.participants?.find(p => p.characterId && p.characterId.toString() === character._id.toString());
      const isModInRaid = myParticipant && (myParticipant.isModCharacter || character.isModCharacter);

      // ------------------- Strict turn order: only the current turn may roll (mod characters can roll anytime). KO'd stay in order and get a turn to use a fairy or leave. -------------------
      const currentTurnParticipant = updatedRaidData.getCurrentTurnParticipant();
      const Character = require('@/models/CharacterModel');
      let currentTurnIsKO = false;
      if (currentTurnParticipant) {
        const currentTurnChar = await Character.findById(currentTurnParticipant.characterId);
        currentTurnIsKO = currentTurnChar?.ko ?? false;
      }
      const isMyTurn = currentTurnParticipant && currentTurnParticipant.characterId.toString() === character._id.toString();

      // KO'd member's turn: prompt to use a fairy or leave (don't process a roll)
      if (!isModInRaid && isMyTurn && character.ko) {
        await scheduleRaidTurnSkip(raidId);
        const koTurnEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('💀 KO\'d — it\'s your turn')
          .setDescription('You\'re knocked out.')
          .addFields(
            {
              name: 'What to do',
              value: 'Please use a fairy with </item:1463789335626125378>.',
              inline: false
            },
            {
              name: 'Leave the raid',
              value: 'Use </raid:1470659276287774734> (raidid, charactername, action: Leave raid).',
              inline: false
            },
            {
              name: '⏰ Time',
              value: 'You have 1 minute.',
              inline: false
            },
            {
              name: 'New joiners',
              value: '**New characters can join the raid now** (added at the end of turn order).',
              inline: false
            }
          )
          .setFooter({ text: 'Raid System' })
          .setTimestamp();
        return interaction.editReply({
          embeds: [koTurnEmbed],
          ephemeral: false
        });
      }

      if (!isModInRaid && (!currentTurnParticipant || !isMyTurn)) {
        const whoseTurnBody = currentTurnParticipant
          ? currentTurnIsKO
            ? `It's **${currentTurnParticipant.name}**'s turn (KO'd — please use a fairy with </item:1463789335626125378> or leave with </raid:1470659276287774734> raidid, charactername, action: Leave raid). You have 1 minute.`
            : `It's **${currentTurnParticipant.name}**'s turn. You have 1 minute to roll. Use </raid:1470659276287774734> to take your turn.`
          : 'No valid turn order.';
        const intro = !existingParticipant
          ? `We've added you to the turn order! It's not your turn yet — you'll roll when it's your turn. Use </raid:1470659276287774734> when it's your turn.\n\n${whoseTurnBody}`
          : `It's not your turn yet. You're already in the turn order — wait for your turn, then use </raid:1470659276287774734> to roll.\n\n${whoseTurnBody}`;
        const notYourTurnEmbed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('⏳ Not your turn')
          .setDescription(intro)
          .setFooter({ text: 'Raid System' })
          .setTimestamp();
        const replyPayload = { embeds: [notYourTurnEmbed], ephemeral: true };
        if (currentTurnParticipant) replyPayload.content = `<@${currentTurnParticipant.userId}>`;
        return interaction.editReply(replyPayload);
      }

      // Process the raid turn (cancel any pending skip job for this raid; raidModule will schedule new 1-minute timer after)
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
      
      // Send the turn result embed only (no @mention in same message)
      const firstResponse = { embeds: [embed] };
      if (blightRainMessage) firstResponse.content = blightRainMessage;
      await interaction.editReply(firstResponse);

      // Separate follow-up: @mention in content, turn message in embed (so @ is outside embed)
      const nextParticipant = turnResult.raidData.getCurrentTurnParticipant();
      if (nextParticipant) {
        const nextChar = await Character.findById(nextParticipant.characterId);
        const nextIsKO = nextChar?.ko ?? false;
        const nextTurnEmbed = new EmbedBuilder()
          .setColor(nextIsKO ? '#FF0000' : '#00FF00')
          .setTitle(nextIsKO ? '💀 KO\'d — it\'s your turn' : '⚔️ It\'s your turn')
          .setDescription(
            nextIsKO
              ? `**${nextParticipant.name}** — you're knocked out.\n\nPlease use a fairy with </item:1463789335626125378>.\nLeave the raid with </raid:1470659276287774734> (raidid, charactername, action: Leave raid).\n\nYou have 1 minute.\n\n**New characters can join the raid now** (added at the end of turn order).`
              : `**${nextParticipant.name}** — you have 1 minute to roll. Use </raid:1470659276287774734> to take your turn.`
          )
          .setFooter({ text: 'Raid System' })
          .setTimestamp();
        await interaction.followUp({
          content: `<@${nextParticipant.userId}>`,
          embeds: [nextTurnEmbed],
          ephemeral: false
        });
      }
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
  const { monsterMapping } = require('@/models/MonsterModel');
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
  const Character = require('@/models/CharacterModel');
  
  // Current turn is by index (KO'd participants stay in order and get a turn)
  for (let idx = 0; idx < participants.length; idx++) {
    const p = participants[idx];
    const isCurrentTurn = idx === currentTurnIndex;

    // Get current character state from database
    const currentCharacter = await Character.findById(p.characterId);
    const isKO = currentCharacter?.ko || false;

    if (isKO) koCharacters.push(p.name);
    if (isKO) {
      turnOrderLines.push(`${idx + 1}. ${p.name} 💀 (KO'd)${isCurrentTurn ? ' ← current' : ''}`);
    } else {
      turnOrderLines.push(`${idx + 1}. ${p.name}${isCurrentTurn ? ' ← current' : ''}`);
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
        value: 'Use </raid:1470659276287774734> to join (new players are added at the end of turn order).',
        inline: false
      },


    )
    .setThumbnail(monsterImage)
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setFooter({ 
      text: `Raid ID: ${raidId}` 
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
// Handles raid victory with loot distribution for eligible participants only
// Eligible: 1+ damage OR 3+ rounds participated; plus anyone in lootEligibleRemoved (left/removed but was eligible)
async function handleRaidVictory(interaction, raidData, monster) {
  try {
    const participants = raidData.participants || [];
    const lootEligibleRemoved = raidData.lootEligibleRemoved || [];
    const eligibleParticipants = participants.filter(
      p => (p.damage >= 1) || ((p.roundsParticipated || 0) >= 3)
    );
    const lootRecipients = [...eligibleParticipants, ...lootEligibleRemoved];
    console.log(`[raid.js]: 🎉 Raid victory! Processing loot for ${lootRecipients.length} eligible recipients (${eligibleParticipants.length} in raid, ${lootEligibleRemoved.length} left/removed)`);
    
    // Fetch items for the monster
    const items = await fetchItemsByMonster(monster.name);
    
    // Process loot for each eligible recipient only
    const lootResults = [];
    const failedCharacters = [];
    const blightedCharacters = [];
    const Character = require('@/models/CharacterModel');
    const User = require('@/models/UserModel');
    
    for (const participant of lootRecipients) {
      try {
        // Fetch the character's current data - check both regular and mod characters
        let character = await Character.findById(participant.characterId);
        if (!character) {
          // Try to find as mod character
          const ModCharacter = require('@/models/ModCharacterModel');
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

        // Add to inventory if character has inventory link (Google Sheets validation removed)
        if (character.inventory) {
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
            // Use shared finalize helper - each step has its own try/catch for resilience
            const finalizeResult = await finalizeBlightApplication(
              character,
              character.userId,
              {
                client: interaction.client,
                guild: interaction.guild,
                source: 'Gloom Hands encounter',
                alreadySaved: false
              }
            );
            
            if (finalizeResult.characterSaved) {
              blightedCharacters.push(character.name);
              console.log(`[raid.js]: 🧿 Character ${character.name} was blighted by Gloom Hands effect`);
              console.log(`[raid.js]: Finalize result - Saved: ${finalizeResult.characterSaved}, Role: ${finalizeResult.roleAdded}, User: ${finalizeResult.userFlagSet}, DM: ${finalizeResult.dmSent}`);
            } else {
              console.error(`[raid.js]: ❌ Failed to save blight for ${character.name} - character may not be properly blighted`);
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
    
    // Create participant list (current participants; loot went to eligible only: 1+ damage or 3+ rounds, plus left/removed eligible)
    const participantList = participants.map(p => `• **${p.name}** (${p.damage} hearts)`).join('\n');
    const leftEligibleList = lootEligibleRemoved.length > 0
      ? '\n*Also received loot (left/removed but eligible):* ' + lootEligibleRemoved.map(p => p.name).join(', ')
      : '';
    
    // Get monster image from monsterMapping
    const { monsterMapping } = require('@/models/MonsterModel');
    const monsterDetails = monsterMapping && monsterMapping[monster.nameMapping] 
      ? monsterMapping[monster.nameMapping] 
      : { image: monster.image };
    const monsterImage = monsterDetails.image || monster.image || 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
    
    // Build embed fields (split long content to avoid Discord 1024-char limit)
    const lootText = lootResults.length > 0 ? lootResults.join('\n') : 'No loot was found.';
    const victoryFields = [
      {
        name: '__Raid Summary__',
        value: truncateEmbedField(`🎯 **Total Damage:** ${raidData.analytics.totalDamage} hearts\n👥 **Participants:** ${participants.length}\n⏱️ **Duration:** ${Math.floor((raidData.analytics.endTime - raidData.analytics.startTime) / 1000 / 60)}m`),
        inline: false
      },
      ...splitIntoEmbedFields((participantList || 'No participants found.') + leftEligibleList, '__Participants__'),
      ...splitIntoEmbedFields(lootText, '__Loot Distribution__')
    ];
    const victoryEmbed = new EmbedBuilder()
      .setColor('#FFD700') // Gold color for victory
      .setTitle(`🎉 **${monster.name} Defeated!**`)
      .setDescription(`The raid has been completed successfully! Here's what everyone got:`)
      .addFields(victoryFields);
    
    // Add blight information if any characters were blighted by Gloom Hands
    if (blightedCharacters.length > 0) {
      const blightValue = `The following characters have been **blighted** by the Gloom Hands encounter:\n${blightedCharacters.map(name => `• **${name}**`).join('\n')}\n\nYou can be healed by **Oracles, Sages & Dragons**\n▹ [Blight Information](https://rootsofthewild.com/world/blight)`;
      victoryEmbed.addFields(splitIntoEmbedFields(blightValue, '<:blight_eye:805576955725611058> **Gloom Hands Blight Effect**'));
    }
    
    victoryEmbed
      .setThumbnail(monsterImage)
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setFooter({ text: `Raid ID: ${raidData.raidId}` })
      .setTimestamp();

    // Expedition raid: add clear "raid over — use /explore roll" so party knows to continue
    if (raidData.expeditionId) {
      const cmdRoll = `</explore roll:${getExploreCommandId()}>`;
      victoryEmbed.addFields({
        name: '🗺️ **Raid over — continue your expedition**',
        value: `Use ${cmdRoll} with id \`${raidData.expeditionId}\` and your character to continue.`,
        inline: false
      });
    }

    // Send victory embed to the raid thread (if it exists)
    if (raidData.threadId) {
      try {
        const thread = await interaction.client.channels.fetch(raidData.threadId);
        if (thread) {
          // Expedition raid: send a separate message first so "raid over, use /explore roll" is obvious
          if (raidData.expeditionId) {
            const cmdRoll = `</explore roll:${getExploreCommandId()}>`;
            await thread.send(`**Raid over!** Please use ${cmdRoll} with id \`${raidData.expeditionId}\` to continue your expedition.`);
          }
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
        
        const failedCharsValue = failedCharacters.map(fc =>
          `• **${fc.name}**: ${fc.reason}${fc.lootedItem ? ` (${fc.lootedItem.itemName} × ${fc.lootedItem.quantity})` : ''}`
        ).join('\n');
        const raidDetailsValue = `**Monster:** ${monster.name}\n**Raid ID:** ${raidData.raidId}\n**Channel:** <#${interaction.channelId}>\n**Message:** ${interaction.url}`;
        const failedLootFields = [
          ...splitIntoEmbedFields(failedCharsValue || 'No details available', '__Failed Characters__'),
          ...splitIntoEmbedFields(raidDetailsValue, '__Raid Details__')
        ];
        const failedLootEmbed = new EmbedBuilder()
          .setColor('#FF6B6B') // Red color for warnings
          .setTitle(`⚠️ Raid Loot Processing Issues`)
          .setDescription(`Some characters had issues receiving their raid loot. Please investigate:`)
          .addFields(failedLootFields)
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
      const ItemModel = require('@/models/ItemModel');
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
