// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const { fetchAnyCharacterByNameAndUserId } = require('@/database/db');
const { joinWave, processWaveTurn } = require('../../modules/waveModule');
const Wave = require('@/models/WaveModel');

// ============================================================================
// ---- Command Definition ----
// ============================================================================
module.exports = {
  data: new SlashCommandBuilder()
    .setName('wave')
    .setDescription('Join and participate in a monster wave')
    .addStringOption(option =>
      option
        .setName('id')
        .setDescription('The ID of the wave to join')
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
      let waveId = interaction.options.getString('id');
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;
      
      // Extract wave ID if user pasted the full description
      if (waveId.includes(' | ')) {
        waveId = waveId.split(' | ')[0];
      }

      // Fetch and validate character with user ownership (includes both regular and mod characters)
      const character = await fetchAnyCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        return interaction.editReply({
          content: `❌ Character "${characterName}" not found or doesn't belong to you. Please check the spelling and try again.`,
          ephemeral: true
        });
      }

      // Check wave exists and is active
      const waveData = await Wave.findOne({ waveId: waveId });
      if (!waveData) {
        const allWaves = await Wave.find({ status: 'active' }).select('waveId village currentMonster.name createdAt').limit(10);
        const activeWaveIds = allWaves.map(w => w.waveId).join(', ');
        
        const waveNotFoundEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Wave Not Found!')
          .setDescription(`The wave ID you entered could not be found.`)
          .addFields(
            {
              name: '🔍 Wave ID Entered',
              value: `\`${waveId}\``,
              inline: false
            },
            {
              name: '📋 Available Active Waves',
              value: activeWaveIds || 'None',
              inline: false
            },
            {
              name: '⚠️ Possible Issues',
              value: '• Check if you copied the wave ID correctly\n• The wave may have been completed\n• The wave may have failed\n• Check the wave announcement for the correct ID',
              inline: false
            }
          )
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: 'Wave System' })
          .setTimestamp();

        return interaction.editReply({
          embeds: [waveNotFoundEmbed],
          ephemeral: true
        });
      }

      if (waveData.status !== 'active') {
        return interaction.editReply({
          content: `❌ **Wave ${waveId} is no longer active!**\n\n**Status:** ${waveData.status}\n\n**Possible reasons:**\n• The wave has been completed by other players\n• The wave has failed (all participants KO'd)\n• The wave was manually ended by a moderator\n\n**To join a new wave:**\n• Wait for a new wave announcement\n• Check the village town hall for active waves\n• Use the wave ID from the most recent announcement`,
          ephemeral: true
        });
      }

      // Check if character is in the same village as the wave
      if (character.currentVillage.toLowerCase() !== waveData.village.toLowerCase()) {
        // Village emoji mapping
        const villageEmojis = {
          rudania: '<:rudania:899492917452890142>',
          inariko: '<:inariko:899493009073274920>',
          vhintl: '<:vhintl:899492879205007450>',
        };
        
        const currentVillageEmoji = villageEmojis[character.currentVillage.toLowerCase()] || '';
        const waveVillageEmoji = villageEmojis[waveData.village.toLowerCase()] || '';
        const capitalizeFirstLetter = (str) => str.charAt(0).toUpperCase() + str.slice(1);
        
        const wrongVillageEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Wrong Village!')
          .setDescription(`**${character.name}** must be in **${waveVillageEmoji} ${capitalizeFirstLetter(waveData.village)}** to participate in this wave.`)
          .addFields(
            {
              name: '__Current Location__',
              value: `${currentVillageEmoji} ${capitalizeFirstLetter(character.currentVillage)}`,
              inline: true
            },
            {
              name: '__Required Location__',
              value: `${waveVillageEmoji} ${capitalizeFirstLetter(waveData.village)}`,
              inline: true
            },
            {
              name: '__Wave ID__',
              value: `\`${waveId}\``,
              inline: false
            },
            {
              name: '__💡 Need to travel?__',
              value: 'Use `/travel` to move between villages.',
              inline: false
            }
          )
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: 'Wave System' })
          .setTimestamp();

        return interaction.editReply({
          embeds: [wrongVillageEmbed],
          ephemeral: true
        });
      }

      // Check if character has blight stage 3 or higher (monsters don't attack them)
      if (character.blighted && character.blightStage >= 3) {
        return interaction.editReply({
          content: `❌ **${character.name} cannot participate in waves!**\n\n<:blight_eye:805576955725611058> At **Blight Stage ${character.blightStage}**, monsters no longer attack your character. You cannot participate in waves until you are healed.`,
          ephemeral: true
        });
      }

      // Try to join the wave if not already participating
      let updatedWaveData = waveData;
      
      // Ensure participants array exists
      if (!waveData.participants) {
        console.warn(`[wave.js]: ⚠️ Wave ${waveId} has no participants array, initializing...`);
        waveData.participants = [];
      }
      
      // Additional safety check to ensure participants is an array
      if (!Array.isArray(waveData.participants)) {
        console.warn(`[wave.js]: ⚠️ Wave ${waveId} participants is not an array, initializing...`);
        waveData.participants = [];
      }
      
      // Check if user already has a character in this wave (by userId, not characterId)
      const existingParticipant = waveData.participants.find(p => 
        p.userId === character.userId
      );
      
      if (!existingParticipant) {
        try {
          const joinResult = await joinWave(character, waveId);
          updatedWaveData = joinResult.waveData;
        } catch (joinError) {
          console.error(`[wave.js]: ❌ Join wave error for ${character.name}:`, joinError);
          return interaction.editReply({
            content: `❌ **Failed to join wave:** ${joinError.message}\n\n**Character:** ${character.name}\n**Wave ID:** \`${waveId}\`\n**Current Village:** ${character.currentVillage}`,
            ephemeral: true
          });
        }
      } else {
        // User already has a character in this wave - find which one
        const existingCharacterName = existingParticipant.name;
        if (existingParticipant.characterId.toString() !== character._id.toString()) {
          // Different character - user already has another character in the wave
          return interaction.editReply({
            content: `❌ **You already have a character in this wave!**\n\n**Your character in this wave:** ${existingCharacterName}\n**Character you tried to join with:** ${character.name}\n\n**Note:** You can only have one character per wave. Use the character that's already participating to take your turn.`,
            ephemeral: true
          });
        }
        // Same character - they're already participating, just continue to process their turn
      }

      // Re-fetch wave to get latest turn order (other players may have taken turns)
      updatedWaveData = await Wave.findOne({ waveId: waveId });
      if (!updatedWaveData) {
        return interaction.editReply({ content: `❌ Wave \`${waveId}\` no longer found.`, ephemeral: true });
      }

      // ------------------- Strict turn order (like raids): only current turn may roll; mod characters can roll anytime. KO'd stay in order and get a turn to use a fairy. -------------------
      const myParticipant = updatedWaveData.participants?.find(p => p.characterId && p.characterId.toString() === character._id.toString());
      const isModInWave = myParticipant?.isModCharacter || character.isModCharacter;
      const currentTurnParticipant = updatedWaveData.getCurrentTurnParticipant();
      const Character = require('@/models/CharacterModel');
      let currentTurnIsKO = false;
      if (currentTurnParticipant) {
        const currentTurnChar = await Character.findById(currentTurnParticipant.characterId);
        currentTurnIsKO = currentTurnChar?.ko ?? false;
      }
      const isMyTurn = currentTurnParticipant && currentTurnParticipant.characterId.toString() === character._id.toString();

      // KO'd member's turn: prompt to use a fairy (don't process a roll)
      if (!isModInWave && isMyTurn && character.ko) {
        const { getItemCommandId, getWaveCommandId } = require('../../embeds/embeds.js');
        const koTurnEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('💀 KO\'d — it\'s your turn')
          .setDescription('You\'re knocked out and cannot attack.')
          .addFields(
            { name: 'What to do', value: `Use </item:${getItemCommandId()}> with a fairy to revive, then use </wave:${getWaveCommandId()}> to take your turn.`, inline: false },
            { name: 'Wave ID', value: `\`\`\`${waveId}\`\`\``, inline: false }
          )
          .setFooter({ text: `Wave ID: ${waveId}` })
          .setTimestamp();
        return interaction.editReply({ embeds: [koTurnEmbed], ephemeral: false });
      }

      // Not this player's turn
      if (!isModInWave && (!currentTurnParticipant || !isMyTurn)) {
        const { getWaveCommandId, getItemCommandId } = require('../../embeds/embeds.js');
        const whoseTurnBody = currentTurnParticipant
          ? currentTurnIsKO
            ? `It's **${currentTurnParticipant.name}**'s turn (KO'd — please use a fairy with </item:${getItemCommandId()}> first).`
            : `It's **${currentTurnParticipant.name}**'s turn. Use </wave:${getWaveCommandId()}> to take your turn.`
          : 'No valid turn order.';
        const intro = !existingParticipant
          ? `We've added you to the turn order! It's not your turn yet — you'll roll when it's your turn.\n\n${whoseTurnBody}`
          : `It's not your turn yet. Wait for your turn, then use </wave:${getWaveCommandId()}> to roll.\n\n${whoseTurnBody}`;
        const notYourTurnEmbed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('⏳ Not your turn')
          .setDescription(intro)
          .addFields({ name: 'Wave ID', value: `\`\`\`${waveId}\`\`\``, inline: false })
          .setFooter({ text: `Wave ID: ${waveId}` })
          .setTimestamp();
        const replyPayload = { embeds: [notYourTurnEmbed], ephemeral: true };
        if (currentTurnParticipant) replyPayload.content = `<@${currentTurnParticipant.userId}>`;
        return interaction.editReply(replyPayload);
      }

      // Process the wave turn
      const turnResult = await processWaveTurn(character, waveId, interaction, updatedWaveData);
      
      // Create embed for the turn result
      const { embed, koCharacters } = await createWaveTurnEmbed(character, waveId, turnResult, turnResult.waveData);

      const { getWaveCommandId, getItemCommandId } = require('../../embeds/embeds.js');
      const waveCommandContent = `</wave:${getWaveCommandId()}> to join • </item:${getItemCommandId()}> to heal`;

      // Check if wave was completed in this turn
      if (turnResult.waveData.status === 'completed') {
        // Send the final turn embed first
        await interaction.editReply({ content: waveCommandContent, embeds: [embed] });
        
        // Monster camp expeditions: skip generic "Wave Complete!" — handleWaveVictory sends "Monster camp defeated!" + @mention
        const isMonsterCampExpedition = turnResult.waveData.source === 'monster_camp' && turnResult.waveData.expeditionId;
        if (!isMonsterCampExpedition) {
          const { createWaveVictoryEmbed } = require('../../embeds/embeds.js');
          const victoryEmbed = createWaveVictoryEmbed(turnResult.waveData);
          await interaction.followUp({ embeds: [victoryEmbed], ephemeral: false });
        }
        
        // Handle wave victory (sends loot embed; for monster camp: "Monster camp defeated!" + @mention of next player)
        await handleWaveVictory(interaction, turnResult.waveData);
        return;
      }
      
      // Check if wave failed (all participants KO'd)
      if (turnResult.waveData.status === 'failed') {
        await interaction.editReply({ content: waveCommandContent, embeds: [embed] });
        return;
      }
      
      // Next turn participant (wave already advanced in processWaveTurn) — mention them so they get notified
      const participants = turnResult.waveData.participants || [];
      const nextTurnIndex = turnResult.waveData.currentTurn ?? 0;
      const nextTurnParticipant = participants[nextTurnIndex];
      const yourTurnMention = nextTurnParticipant?.userId ? `<@${nextTurnParticipant.userId}> it's your turn! ` : '';

      // Send the turn result embed (content ensures commands are clickable; mention next player)
      await interaction.editReply({ content: `${yourTurnMention}${waveCommandContent}`.trim() || waveCommandContent, embeds: [embed] });
      
      // Check if a monster was defeated in this turn (but wave continues)
      // The monster is defeated if battleResult shows 0 hearts AND wave is still active
      const monsterDefeatedThisTurn = turnResult.battleResult.monsterHearts?.current <= 0 && 
        turnResult.waveData.status === 'active';
      
      // If a monster was defeated (but wave continues), send a follow-up embed
      if (monsterDefeatedThisTurn) {
        console.log(`[wave.js]: 🎯 Monster defeated this turn, creating defeat embed for wave ${waveId}`);
        const { EmbedBuilder } = require('discord.js');
        const { monsterMapping } = require('@/models/MonsterModel');
        
        // Get the defeated monster - after advanceToNextMonster, currentMonsterIndex points to the next monster
        // So the defeated monster is at currentMonsterIndex - 1
        const defeatedMonsterIndex = turnResult.waveData.currentMonsterIndex - 1;
        const defeatedMonsters = turnResult.waveData.defeatedMonsters || [];
        console.log(`[wave.js]: 🔍 Defeat embed - Current monster index: ${turnResult.waveData.currentMonsterIndex}, Defeated monster index: ${defeatedMonsterIndex}, Total defeated: ${defeatedMonsters.length}`);
        
        // Validate the index is valid
        if (defeatedMonsterIndex >= 0 && defeatedMonsterIndex < turnResult.waveData.monsters.length) {
          // Get the monster from the monsters array using the calculated index
          const defeatedMonster = turnResult.waveData.monsters[defeatedMonsterIndex];
          console.log(`[wave.js]: ✅ Defeat embed - Found monster at index ${defeatedMonsterIndex}: ${defeatedMonster?.name || 'UNKNOWN'}`);
          
          if (defeatedMonster && defeatedMonster.name) {
            // Normalize nameMapping by removing spaces to match monsterMapping keys
            const normalizedNameMapping = (defeatedMonster.nameMapping || defeatedMonster.name).replace(/\s+/g, "");
            console.log(`[wave.js]: 🔍 Defeat embed - Normalized nameMapping: "${normalizedNameMapping}" (original: "${defeatedMonster.nameMapping || defeatedMonster.name}")`);
            const monsterDetails = monsterMapping && monsterMapping[normalizedNameMapping]
              ? monsterMapping[normalizedNameMapping]
              : { image: defeatedMonster.image };
            const monsterImage = monsterDetails.image || defeatedMonster.image || 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
            console.log(`[wave.js]: 🖼️ Defeat embed - Monster image: ${monsterImage.substring(0, 60)}...`);
            
            // Build turn order list
            const participants = turnResult.waveData.participants || [];
            const turnOrderLines = [];
            const Character = require('@/models/CharacterModel');
            
            for (let idx = 0; idx < participants.length; idx++) {
              const p = participants[idx];
              // Get current character state from database
              const currentCharacter = await Character.findById(p.characterId);
              const isKO = currentCharacter?.ko || false;
              
              if (isKO) {
                turnOrderLines.push(`${idx + 1}. ${p.name} 💀 (KO'd)`);
              } else {
                turnOrderLines.push(`${idx + 1}. ${p.name}`);
              }
            }
            
            const turnOrder = turnOrderLines.join('\n') || 'No participants';
            
            // Calculate wave number (which monster was defeated)
            const defeatedCount = defeatedMonsters.length;
            const totalMonsters = turnResult.waveData.monsters.length;
            
            // Get who defeated this monster (the last entry in defeatedMonsters should be the one just defeated)
            const lastDefeated = defeatedMonsters[defeatedCount - 1];
            const defeatedByName = lastDefeated?.defeatedBy?.name || 'Unknown';
            console.log(`[wave.js]: 👤 Defeat embed - Defeated by: ${defeatedByName} (from lastDefeated entry)`);
            
            const monsterDefeatedEmbed = new EmbedBuilder()
              .setColor('#00FF00') // Green for victory
              .setTitle(`✅ ${defeatedMonster.name} Defeated!`)
              .setDescription(`The monster has been defeated by **${defeatedByName}**! The wave continues...`)
              .addFields(
                {
                  name: `__Wave Progress__`,
                  value: `🌊 **Monster ${defeatedCount} of ${totalMonsters} defeated!**`,
                  inline: false
                },
                {
                  name: `__Turn Order__`,
                  value: turnOrder,
                  inline: false
                },
                {
                  name: 'Wave ID',
                  value: `\`\`\`${waveId}\`\`\``,
                  inline: false
                },
                {
                  name: 'Want to join in?',
                  value: `Use </wave:${require('../../embeds/embeds.js').getWaveCommandId()}> to join!`,
                  inline: false
                }
              )
              .setThumbnail(monsterImage)
              .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
              .setFooter({ text: `Wave ID: ${waveId}` })
              .setTimestamp();
            
            console.log(`[wave.js]: ✅ Defeat embed created for ${defeatedMonster.name} (defeated by ${defeatedByName}), sending follow-up message`);
            await interaction.followUp({ content: `${yourTurnMention}${waveCommandContent}`.trim() || waveCommandContent, embeds: [monsterDefeatedEmbed] });
            console.log(`[wave.js]: ✅ Defeat embed sent successfully`);
          } else {
            console.log(`[wave.js]: ⚠️ Defeat embed - Monster at index ${defeatedMonsterIndex} has no name, skipping embed`);
          }
        } else {
          console.log(`[wave.js]: ⚠️ Defeat embed - Invalid defeatedMonsterIndex: ${defeatedMonsterIndex} (monsters array length: ${turnResult.waveData.monsters.length})`);
        }
      } else {
        console.log(`[wave.js]: ℹ️ No monster was defeated this turn (or wave is not active), skipping defeat embed`);
      }
      
      return;

    } catch (error) {
      await handleInteractionError(error, interaction, {
        source: 'wave.js',
        waveId: interaction.options.getString('id'),
        characterName: interaction.options.getString('charactername')
      });
    }
  },
};

// ============================================================================
// ---- Import Loot Functions ----
// ============================================================================
const { fetchItemsByMonster, fetchAllItems } = require('@/database/db');
const { createWeightedItemList } = require('../../modules/rngModule');
const { addItemInventoryDatabase } = require('@/utils/inventoryUtils');
const Party = require('@/models/PartyModel');
const { addExplorationStandardFields, regionColors, regionImages } = require('../../embeds/embeds.js');
const { syncPartyMemberStats } = require('../../modules/exploreModule');
// Google Sheets functionality removed

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ---- Function: createWaveTurnEmbed ----
// Creates an embed showing the results of a wave turn
async function createWaveTurnEmbed(character, waveId, turnResult, waveData) {
  const { battleResult, participant } = turnResult;
  
  // Calculate progress first to determine which monster was just fought
  const defeatedCount = waveData.defeatedMonsters?.length || 0;
  const wasMonsterJustDefeated = battleResult.monsterHearts?.current <= 0;
  
  // Determine which monster to display:
  // - If a monster was just defeated, advanceToNextMonster has already been called,
  //   so currentMonster is the NEXT monster. We need the one that was just fought.
  // - Otherwise, use currentMonster (the active one being fought)
  let monsterToDisplay;
  if (wasMonsterJustDefeated) {
    // Get the monster that was just defeated (it's at index defeatedCount - 1)
    const defeatedMonsterIndex = defeatedCount - 1;
    monsterToDisplay = waveData.monsters[defeatedMonsterIndex];
    console.log(`[wave.js]: 🔍 Turn embed - Monster just defeated, using defeated monster at index ${defeatedMonsterIndex}: ${monsterToDisplay?.name || 'UNKNOWN'}`);
  } else {
    // Use the current active monster
    monsterToDisplay = waveData.currentMonster;
    console.log(`[wave.js]: 🔍 Turn embed - No monster defeated, using current monster: ${monsterToDisplay?.name || 'UNKNOWN'}`);
  }
  
  if (!monsterToDisplay) {
    console.error(`[wave.js]: ⚠️ Turn embed - Could not determine monster to display (wasMonsterJustDefeated: ${wasMonsterJustDefeated}, defeatedCount: ${defeatedCount})`);
    // Fallback to currentMonster
    monsterToDisplay = waveData.currentMonster;
  }

  // Get monster image from monsterMapping
  const { monsterMapping } = require('@/models/MonsterModel');
  // Normalize nameMapping by removing spaces to match monsterMapping keys
  const normalizedNameMapping = (monsterToDisplay.nameMapping || monsterToDisplay.name).replace(/\s+/g, "");
  console.log(`[wave.js]: 🔍 Turn embed - Normalized nameMapping: "${normalizedNameMapping}" (original: "${monsterToDisplay.nameMapping || monsterToDisplay.name}")`);
  const monsterDetails = monsterMapping && monsterMapping[normalizedNameMapping]
    ? monsterMapping[normalizedNameMapping]
    : { image: monsterToDisplay.image };
  const monsterImage = monsterDetails.image || monsterToDisplay.image || 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
  console.log(`[wave.js]: 🖼️ Turn embed - Monster image: ${monsterImage.substring(0, 60)}...`);

  // Get character icon (if available)
  const characterIcon = character.icon || 'https://storage.googleapis.com/tinglebot/Graphics/border.png';

  // Build turn order list
  const participants = waveData.participants || [];
  const currentTurnIndex = waveData.currentTurn || 0;
  
  // Create turn order
  const turnOrderLines = [];
  const koCharacters = [];
  
  // Get current character states from database
  const Character = require('@/models/CharacterModel');
  
  // Get the effective current turn participant (skipping KO'd participants)
  const effectiveCurrentTurnParticipant = await waveData.getEffectiveCurrentTurnParticipant();
  const effectiveCurrentTurnIndex = participants.findIndex(p => p.characterId.toString() === effectiveCurrentTurnParticipant?.characterId?.toString());
  
  for (let idx = 0; idx < participants.length; idx++) {
    const p = participants[idx];
    const isEffectiveCurrentTurn = idx === effectiveCurrentTurnIndex;
    
    // Get current character state from database
    const currentCharacter = await Character.findById(p.characterId);
    const isKO = currentCharacter?.ko || false;
    
    if (isKO) {
      koCharacters.push(p.name);
      turnOrderLines.push(`${idx + 1}. ${p.name} 💀 (KO'd)`);
    } else if (isEffectiveCurrentTurn) {
      turnOrderLines.push(`${idx + 1}. ${p.name}`);
    } else {
      turnOrderLines.push(`${idx + 1}. ${p.name}`);
    }
  }
  
  const turnOrder = turnOrderLines.join('\n');
  
  // Calculate progress (defeatedCount and wasMonsterJustDefeated already calculated above)
  // When a monster is defeated, advanceToNextMonster increments currentMonsterIndex
  // So we use defeatedCount to show the monster that was just defeated
  // Otherwise, use currentMonsterIndex + 1 for the current monster
  const currentMonsterNumber = wasMonsterJustDefeated ? defeatedCount : (waveData.currentMonsterIndex + 1);
  const totalMonsters = waveData.monsters.length;
  const progress = `Monster ${currentMonsterNumber} of ${totalMonsters}`;

  // Determine embed color based on outcome
  let color = '#00FF00'; // Green for success
  if (battleResult.playerHearts.current <= 0) {
    color = '#FF0000'; // Red for KO
  } else if (battleResult.hearts <= 0) {
    color = '#FFFF00'; // Yellow for no damage
  }

  // Get participant's total damage dealt (cumulative across all monsters)
  const currentParticipant = participants.find(p => p.characterId.toString() === character._id.toString());
  const totalDamageDealt = currentParticipant?.damage || 0;
  
  // Use the updated monster hearts from battleResult (this has the correct value after the battle)
  const updatedMonsterCurrentHearts = battleResult.monsterHearts?.current ?? monsterToDisplay.currentHearts;
  const updatedMonsterMaxHearts = battleResult.monsterHearts?.max ?? monsterToDisplay.maxHearts;
  
  // Calculate total damage to current monster (from all participants)
  const totalMonsterDamage = updatedMonsterMaxHearts - updatedMonsterCurrentHearts;
  
  // Calculate character damage taken this turn
  const characterHeartsBefore = battleResult.characterHeartsBefore || battleResult.playerHearts.max;
  const characterDamageTaken = characterHeartsBefore - battleResult.playerHearts.current;
  
  // Determine if monster was defeated
  const monsterDefeated = updatedMonsterCurrentHearts <= 0;
  const monsterStatusText = monsterDefeated 
    ? `💀 **DEFEATED!** (0/${updatedMonsterMaxHearts} hearts)` 
    : `💙 **Hearts:** ${updatedMonsterCurrentHearts}/${updatedMonsterMaxHearts}`;
  
  // Use battleResult.outcome which contains the flavor text from processRaidBattle
  // Only add monster defeat message if needed
  let outcomeDescription = '';
  if (monsterDefeated) {
    outcomeDescription = `✅ **${monsterToDisplay.name} has been defeated!**\n\n`;
  }
  
  // Use the flavor text from battleResult.outcome (which comes from processRaidBattle)
  if (battleResult.outcome) {
    outcomeDescription += battleResult.outcome;
    // Add separator line after damage flavor text
    outcomeDescription += `\n${'─'.repeat(50)}\n`;
  } else {
    outcomeDescription += 'Battle completed';
  }
  
  // Build full description with wave number at top (use the calculated currentMonsterNumber)
  const fullDescription = `🌊 **MONSTER WAVE ${currentMonsterNumber}/${totalMonsters}**\n\n${outcomeDescription}\n🌊 **Wave Battle:** Fight through multiple monsters in sequence! Like raids, but with waves of monsters.`;
  
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`⚔️ ${character.name}'s Wave Turn`)
    .setAuthor({ name: character.name, iconURL: characterIcon })
    .setDescription(fullDescription)
    .addFields(
      {
        name: `__${progress} - ${monsterToDisplay.name} Status__`,
        value: `${monsterStatusText}\n⭐ **Tier:** ${monsterToDisplay.tier}\n📊 **Total Damage Taken:** ${totalMonsterDamage}/${updatedMonsterMaxHearts} hearts`,
        inline: false
      },
      {
        name: `__${character.name} Status__`,
        value: `❤️ **Hearts:** ${battleResult.playerHearts.current}/${battleResult.playerHearts.max}${characterDamageTaken > 0 ? `\n💔 **Damage Taken This Turn:** ${characterDamageTaken} heart${characterDamageTaken > 1 ? 's' : ''}` : ''}`,
        inline: false
      },
      {
        name: `__Damage to Monster This Turn__`,
        value: `⚔️ **${battleResult.hearts}** heart${battleResult.hearts !== 1 ? 's' : ''} dealt${totalDamageDealt > 0 ? `\n📈 **Your Total Damage (All Monsters):** ${totalDamageDealt} hearts` : ''}`,
        inline: false
      },
      {
        name: `__Roll Details__`,
        value: `🎲 **Roll:** ${battleResult.originalRoll} → ${Math.round(battleResult.adjustedRandomValue)}\n${battleResult.attackSuccess && battleResult.attackStat > 0 ? `⚔️ **ATK +${Math.round(battleResult.attackStat * 1.8)} (${battleResult.attackStat} attack)` : ''}${battleResult.defenseSuccess && battleResult.defenseStat > 0 ? `${battleResult.attackSuccess && battleResult.attackStat > 0 ? ' | ' : ''}🛡️ **DEF +${Math.round(battleResult.defenseStat * 0.7)} (${battleResult.defenseStat} defense)` : ''}`,
        inline: false
      },
      {
        name: `__Wave Progress__`,
        value: `🌊 **Monsters Defeated:** ${waveData.defeatedMonsters?.length || 0}/${waveData.monsters.length}\n👥 **Participants:** ${participants.length}`,
        inline: false
      },
      {
        name: `__Turn Order__`,
        value: turnOrder || 'No participants',
        inline: false
      },
      {
        name: 'Wave ID',
        value: `\`\`\`${waveId}\`\`\``,
        inline: false
      },
      {
        name: 'Want to join in?',
        value: `Use </wave:${require('../../embeds/embeds.js').getWaveCommandId()}> to join!`,
        inline: false
      },
    )
    .setThumbnail(monsterImage)
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setFooter({ text: `Wave ID: ${waveId}` })
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

// ---- Function: handleWaveVictory ----
// Handles wave victory with loot distribution for eligible participants
async function handleWaveVictory(interaction, waveData) {
  try {
    // Monster camp completion hook: mark camp as defeated so it's not fightable until next Blood Moon
    if (waveData.source === 'monster_camp' && waveData.monsterCampId) {
      try {
        const MonsterCamp = require('@/models/MonsterCampModel');
        const camp = await MonsterCamp.findOne({ campId: waveData.monsterCampId });
        if (camp) {
          camp.lastDefeatedAt = new Date();
          await camp.save();
          console.log(`[wave.js]: 🏕️ Monster camp ${waveData.monsterCampId} marked as defeated (refightable after next Blood Moon)`);
        }
      } catch (monsterCampErr) {
        console.error(`[wave.js]: ⚠️ Failed to update MonsterCamp ${waveData.monsterCampId}:`, monsterCampErr?.message || monsterCampErr);
      }
    }

    // Process loot: one item per defeated monster, given to the character who defeated it
    const defeatedMonsters = waveData.defeatedMonsters || [];
    const lootResults = [];
    const failedCharacters = [];
    const Character = require('@/models/CharacterModel');
    const User = require('@/models/UserModel');
    
    // Track which participants got loot (for summary)
    const participantsWhoGotLoot = new Set();
    // Track which monsters each participant defeated
    const killsByParticipant = new Map(); // Map<participantName, Array<monsterName>>
    
    console.log(`[wave.js]: 🎉 Wave victory! Starting loot distribution for wave ${waveData.waveId}`);
    console.log(`[wave.js]: 📊 Wave stats - Total monsters: ${waveData.monsters.length}, Defeated: ${defeatedMonsters.length}, Participants: ${waveData.participants.length}`);
    
    // Process each defeated monster individually - one item per monster
    for (let i = 0; i < defeatedMonsters.length; i++) {
      const defeated = defeatedMonsters[i];
      console.log(`[wave.js]: 🎯 Processing monster ${i + 1}/${defeatedMonsters.length} - Index: ${defeated.monsterIndex}`);
      
      if (!defeated.defeatedBy || !defeated.defeatedBy.characterId) {
        console.log(`[wave.js]: ⚠️ [${i + 1}/${defeatedMonsters.length}] Monster at index ${defeated.monsterIndex} has no defeatedBy info, skipping`);
        continue;
      }
      
      const monster = waveData.monsters[defeated.monsterIndex];
      if (!monster) {
        console.log(`[wave.js]: ⚠️ [${i + 1}/${defeatedMonsters.length}] Monster at index ${defeated.monsterIndex} not found in monsters array, skipping`);
        continue;
      }
      
      console.log(`[wave.js]: 👹 [${i + 1}/${defeatedMonsters.length}] Monster: ${monster.name} (Tier ${monster.tier}) - Defeated by: ${defeated.defeatedBy.name} (${defeated.defeatedBy.characterId})`);
      
      // Track who killed what
      const defeaterName = defeated.defeatedBy.name;
      if (!killsByParticipant.has(defeaterName)) {
        killsByParticipant.set(defeaterName, []);
      }
      killsByParticipant.get(defeaterName).push(monster.name);
      
      try {
        // Fetch the character who defeated this monster
        console.log(`[wave.js]: 🔍 [${i + 1}/${defeatedMonsters.length}] Fetching character data for ${defeated.defeatedBy.name}...`);
        let character = await Character.findById(defeated.defeatedBy.characterId);
        if (!character) {
          // Try to find as mod character
          console.log(`[wave.js]: 🔍 [${i + 1}/${defeatedMonsters.length}] Not found in Character collection, trying ModCharacter...`);
          const ModCharacter = require('@/models/ModCharacterModel');
          character = await ModCharacter.findById(defeated.defeatedBy.characterId);
        }
        
        if (!character) {
          console.log(`[wave.js]: ⚠️ [${i + 1}/${defeatedMonsters.length}] Character ${defeated.defeatedBy.name} not found in either collection, skipping loot for ${monster.name}`);
          failedCharacters.push({
            name: defeated.defeatedBy.name,
            reason: 'Character not found in database',
            monster: monster.name
          });
          continue;
        }
        
        console.log(`[wave.js]: ✅ [${i + 1}/${defeatedMonsters.length}] Character found: ${character.name} (${character._id})`);
        
        // Get items for this specific monster
        console.log(`[wave.js]: 📦 [${i + 1}/${defeatedMonsters.length}] Fetching items for ${monster.name}...`);
        const items = await fetchItemsByMonster(monster.name);
        if (!items || items.length === 0) {
          console.log(`[wave.js]: ⚠️ [${i + 1}/${defeatedMonsters.length}] No items found for ${monster.name}, skipping loot`);
          continue;
        }
        console.log(`[wave.js]: 📦 [${i + 1}/${defeatedMonsters.length}] Found ${items.length} items for ${monster.name}`);
        
        // Find the participant data to get their damage (for quality indicator)
        const participant = waveData.participants.find(p => 
          p.characterId.toString() === defeated.defeatedBy.characterId.toString()
        );
        const participantDamage = participant?.damage || 0;
        console.log(`[wave.js]: 📊 [${i + 1}/${defeatedMonsters.length}] Participant damage: ${participantDamage} hearts`);
        
        // Create weighted items based on this participant's damage performance
        const finalValue = Math.min(100, Math.max(1, participantDamage * 10)); // Scale damage to 1-100 range
        console.log(`[wave.js]: ⚖️ [${i + 1}/${defeatedMonsters.length}] Creating weighted items (finalValue: ${finalValue})...`);
        const weightedItems = createWeightedItemList(items, finalValue);
        console.log(`[wave.js]: ⚖️ [${i + 1}/${defeatedMonsters.length}] Created ${weightedItems.length} weighted items`);
        
        // Generate one loot item for this monster
        console.log(`[wave.js]: 🎲 [${i + 1}/${defeatedMonsters.length}] Generating loot item...`);
        const lootedItem = await generateWaveLootedItem(weightedItems, participantDamage);
        
        if (!lootedItem) {
          console.log(`[wave.js]: ⚠️ [${i + 1}/${defeatedMonsters.length}] No lootable items found for ${monster.name}, skipping loot`);
          failedCharacters.push({
            name: character.name,
            reason: 'No lootable items found',
            monster: monster.name
          });
          continue;
        }
        
        console.log(`[wave.js]: 🎁 [${i + 1}/${defeatedMonsters.length}] Generated loot: ${lootedItem.itemName} × ${lootedItem.quantity} (Rarity: ${lootedItem.itemRarity || 'unknown'})`);
        

        // Add to inventory if character has inventory link
        if (character.inventory) {
          try {
            console.log(`[wave.js]: 💾 [${i + 1}/${defeatedMonsters.length}] Adding ${lootedItem.itemName} × ${lootedItem.quantity} to ${character.name}'s inventory...`);
            await addItemInventoryDatabase(
              character._id,
              lootedItem.itemName,
              lootedItem.quantity,
              interaction,
              "Wave Loot"
            );
            console.log(`[wave.js]: ✅ [${i + 1}/${defeatedMonsters.length}] Successfully added ${lootedItem.itemName} to ${character.name}'s inventory`);
            
            // Determine loot quality indicator based on damage
            let qualityIndicator = '';
            if (participantDamage >= 10) {
              qualityIndicator = ' 🔥'; // High damage = fire emoji
            } else if (participantDamage >= 5) {
              qualityIndicator = ' ⚡'; // Medium damage = lightning emoji
            } else if (participantDamage >= 2) {
              qualityIndicator = ' ✨'; // Low damage = sparkle emoji
            }
            
            lootResults.push(`**${character.name}**${qualityIndicator} got ${lootedItem.emoji || ''} **${lootedItem.itemName}** × ${lootedItem.quantity}!`);
            participantsWhoGotLoot.add(character.name);
            console.log(`[wave.js]: ✅ [${i + 1}/${defeatedMonsters.length}] Successfully processed loot for ${character.name} (${monster.name})`);
            
          } catch (error) {
            console.error(`[wave.js]: ❌ [${i + 1}/${defeatedMonsters.length}] Error adding loot to inventory for ${character.name} (${monster.name}):`, error);
            console.error(`[wave.js]: ❌ [${i + 1}/${defeatedMonsters.length}] Error details:`, {
              characterName: character.name,
              characterId: character._id,
              itemName: lootedItem.itemName,
              quantity: lootedItem.quantity,
              errorMessage: error.message,
              errorStack: error.stack
            });
            
            // Add to failed characters list
            failedCharacters.push({
              name: character.name,
              reason: `Inventory sync failed: ${error.message}`,
              lootedItem: lootedItem,
              monster: monster.name
            });
            
            // Determine loot quality indicator based on damage
            let qualityIndicator = '';
            if (participantDamage >= 10) {
              qualityIndicator = ' 🔥';
            } else if (participantDamage >= 5) {
              qualityIndicator = ' ⚡';
            } else if (participantDamage >= 2) {
              qualityIndicator = ' ✨';
            }
            
            lootResults.push(`**${character.name}**${qualityIndicator} got ${lootedItem.emoji || ''} **${lootedItem.itemName}** × ${lootedItem.quantity}! *(inventory sync failed)*`);
            participantsWhoGotLoot.add(character.name);
          }
        } else {
          // Character doesn't have valid inventory, but still show loot
          console.log(`[wave.js]: ⚠️ [${i + 1}/${defeatedMonsters.length}] ${character.name} has no valid inventory link, but loot will still be shown`);
          let qualityIndicator = '';
          if (participantDamage >= 10) {
            qualityIndicator = ' 🔥';
          } else if (participantDamage >= 5) {
            qualityIndicator = ' ⚡';
          } else if (participantDamage >= 2) {
            qualityIndicator = ' ✨';
          }
          
          lootResults.push(`**${character.name}**${qualityIndicator} got ${lootedItem.emoji || ''} **${lootedItem.itemName}** × ${lootedItem.quantity}! *(no inventory link)*`);
          participantsWhoGotLoot.add(character.name);
          console.log(`[wave.js]: ✅ [${i + 1}/${defeatedMonsters.length}] Processed loot for ${character.name} (no inventory link)`);
        }
        
      } catch (error) {
        console.error(`[wave.js]: ❌ [${i + 1}/${defeatedMonsters.length}] Error processing loot for monster ${monster.name} (defeated by ${defeated.defeatedBy.name}):`, error);
        console.error(`[wave.js]: ❌ [${i + 1}/${defeatedMonsters.length}] Error details:`, {
          monsterName: monster.name,
          monsterIndex: defeated.monsterIndex,
          defeatedByName: defeated.defeatedBy.name,
          defeatedByCharacterId: defeated.defeatedBy.characterId,
          errorMessage: error.message,
          errorStack: error.stack
        });
        
        // Add to failed characters list
        failedCharacters.push({
          name: defeated.defeatedBy.name,
          reason: `General error: ${error.message}`,
          monster: monster.name
        });
        
        lootResults.push(`**${defeated.defeatedBy.name}** - *Error processing loot for ${monster.name}*`);
      }
    }
    
    // Participant chest reward: each participant gets to open a chest and receive 1 random item (like exploration chests)
    const allItems = await fetchAllItems();
    if (allItems && allItems.length > 0 && waveData.participants && waveData.participants.length > 0) {
      const ModCharacter = require('@/models/ModCharacterModel');
      const seenCharacterIds = new Set();
      for (const participant of waveData.participants) {
        const charIdStr = participant.characterId.toString();
        if (seenCharacterIds.has(charIdStr)) continue;
        seenCharacterIds.add(charIdStr);
        try {
          let char = await Character.findById(participant.characterId);
          if (!char) char = await ModCharacter.findById(participant.characterId);
          if (!char || !char.inventory) continue;
          const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
          await addItemInventoryDatabase(char._id, randomItem.itemName, 1, interaction, "Wave Victory Chest");
          const emoji = randomItem.emoji || '📦';
          lootResults.push(`**${participant.name}** 📦 opened a chest and found ${emoji} **${randomItem.itemName}**!`);
          participantsWhoGotLoot.add(participant.name);
        } catch (chestErr) {
          console.error(`[wave.js]: ⚠️ Chest reward failed for ${participant.name}:`, chestErr?.message || chestErr);
          lootResults.push(`**${participant.name}** 📦 opened a chest but something went wrong.`);
        }
      }
    }
    
    // Log summary
    console.log(`[wave.js]: 📊 Loot distribution complete for wave ${waveData.waveId}`);
    console.log(`[wave.js]: 📊 Summary - Items distributed: ${lootResults.length}, Participants with loot: ${participantsWhoGotLoot.size}, Failed: ${failedCharacters.length}`);
    if (lootResults.length > 0) {
      console.log(`[wave.js]: 📊 Loot results:`, lootResults.map(r => r.replace(/\*\*/g, '').replace(/__/g, '')));
    }
    if (failedCharacters.length > 0) {
      console.log(`[wave.js]: ⚠️ Failed characters:`, failedCharacters.map(fc => `${fc.name} (${fc.monster}): ${fc.reason}`));
    }
    
    // Create participant list (all participants, showing damage even if they didn't get loot)
    // Split into chunks that fit within Discord's 1024 character limit
    const MAX_FIELD_VALUE_LENGTH = 1024;
    const participantLines = waveData.participants
      .map(participant => `• **${participant.name}** (${participant.damage || 0} hearts)`);
    
    const participantFields = [];
    if (participantLines.length > 0) {
      let currentChunk = [];
      
      for (const participantLine of participantLines) {
        // Calculate what the length would be if we add this line
        const testChunk = [...currentChunk, participantLine];
        const testValue = testChunk.join('\n');
        
        // If adding this line would exceed the limit and we have items in current chunk, save it
        if (testValue.length > MAX_FIELD_VALUE_LENGTH && currentChunk.length > 0) {
          // Save current chunk as a field
          const fieldValue = currentChunk.join('\n');
          participantFields.push({
            name: participantFields.length === 0 ? '__Participants__' : `__Participants (${participantFields.length + 1})__`,
            value: fieldValue,
            inline: false
          });
          // Start new chunk with the current item
          currentChunk = [participantLine];
        } else {
          // Add to current chunk (safe to add)
          currentChunk.push(participantLine);
        }
      }
      
      // Add remaining chunk if any
      if (currentChunk.length > 0) {
        const fieldValue = currentChunk.join('\n');
        // Safety check: if even the last chunk is too long, split it further
        if (fieldValue.length > MAX_FIELD_VALUE_LENGTH) {
          // Split by newlines and create multiple fields
          const lines = fieldValue.split('\n');
          let tempChunk = [];
          
          for (const line of lines) {
            const testChunk = [...tempChunk, line];
            const testValue = testChunk.join('\n');
            
            if (testValue.length > MAX_FIELD_VALUE_LENGTH && tempChunk.length > 0) {
              participantFields.push({
                name: participantFields.length === 0 ? '__Participants__' : `__Participants (${participantFields.length + 1})__`,
                value: tempChunk.join('\n'),
                inline: false
              });
              tempChunk = [line];
            } else {
              tempChunk.push(line);
            }
          }
          
          // Add final temp chunk
          if (tempChunk.length > 0) {
            participantFields.push({
              name: participantFields.length === 0 ? '__Participants__' : `__Participants (${participantFields.length + 1})__`,
              value: tempChunk.join('\n'),
              inline: false
            });
          }
        } else {
          participantFields.push({
            name: participantFields.length === 0 ? '__Participants__' : `__Participants (${participantFields.length + 1})__`,
            value: fieldValue,
            inline: false
          });
        }
      }
    } else {
      // No participants, add single field
      participantFields.push({
        name: '__Participants__',
        value: 'No participants found.',
        inline: false
      });
    }
    
    // Create kills list showing who defeated which monsters
    // Split into chunks that fit within Discord's 1024 character limit
    const killsLines = Array.from(killsByParticipant.entries())
      .map(([participantName, monsters]) => {
        const monsterList = monsters.map(m => `• ${m}`).join('\n');
        return `**${participantName}** defeated:\n${monsterList}`;
      });
    
    const killsFields = [];
    if (killsLines.length > 0) {
      let currentChunk = [];
      
      for (const killLine of killsLines) {
        // Calculate what the length would be if we add this line
        const testChunk = [...currentChunk, killLine];
        const testValue = testChunk.join('\n\n');
        
        // If adding this line would exceed the limit and we have items in current chunk, save it
        if (testValue.length > MAX_FIELD_VALUE_LENGTH && currentChunk.length > 0) {
          // Save current chunk as a field
          const fieldValue = currentChunk.join('\n\n');
          killsFields.push({
            name: killsFields.length === 0 ? '__Monster Kills__' : `__Monster Kills (${killsFields.length + 1})__`,
            value: fieldValue,
            inline: false
          });
          // Start new chunk with the current item
          currentChunk = [killLine];
        } else {
          // Add to current chunk (safe to add)
          currentChunk.push(killLine);
        }
      }
      
      // Add remaining chunk if any
      if (currentChunk.length > 0) {
        const fieldValue = currentChunk.join('\n\n');
        // Safety check: if even the last chunk is too long, split it further
        if (fieldValue.length > MAX_FIELD_VALUE_LENGTH) {
          // Split by double newlines (participant sections) and create multiple fields
          const sections = fieldValue.split('\n\n');
          let tempChunk = [];
          
          for (const section of sections) {
            const testChunk = [...tempChunk, section];
            const testValue = testChunk.join('\n\n');
            
            if (testValue.length > MAX_FIELD_VALUE_LENGTH && tempChunk.length > 0) {
              killsFields.push({
                name: killsFields.length === 0 ? '__Monster Kills__' : `__Monster Kills (${killsFields.length + 1})__`,
                value: tempChunk.join('\n\n'),
                inline: false
              });
              tempChunk = [section];
            } else {
              tempChunk.push(section);
            }
          }
          
          // Add final temp chunk
          if (tempChunk.length > 0) {
            killsFields.push({
              name: killsFields.length === 0 ? '__Monster Kills__' : `__Monster Kills (${killsFields.length + 1})__`,
              value: tempChunk.join('\n\n'),
              inline: false
            });
          }
        } else {
          killsFields.push({
            name: killsFields.length === 0 ? '__Monster Kills__' : `__Monster Kills (${killsFields.length + 1})__`,
            value: fieldValue,
            inline: false
          });
        }
      }
    } else {
      // No kills, add single field
      killsFields.push({
        name: '__Monster Kills__',
        value: 'No kills tracked.',
        inline: false
      });
    }
    
    // Split loot results into chunks that fit within Discord's 1024 character limit
    const lootFields = [];
    
    if (lootResults.length > 0) {
      let currentChunk = [];
      
      for (const lootResult of lootResults) {
        // Calculate what the length would be if we add this line
        const testChunk = [...currentChunk, lootResult];
        const testValue = testChunk.join('\n');
        
        // If adding this line would exceed the limit and we have items in current chunk, save it
        if (testValue.length > MAX_FIELD_VALUE_LENGTH && currentChunk.length > 0) {
          // Save current chunk as a field
          const fieldValue = currentChunk.join('\n');
          lootFields.push({
            name: lootFields.length === 0 ? '__Loot Distribution__' : `__Loot Distribution (${lootFields.length + 1})__`,
            value: fieldValue,
            inline: false
          });
          // Start new chunk with the current item
          currentChunk = [lootResult];
        } else {
          // Add to current chunk (safe to add)
          currentChunk.push(lootResult);
        }
      }
      
      // Add remaining chunk if any
      if (currentChunk.length > 0) {
        const fieldValue = currentChunk.join('\n');
        // Safety check: if even the last chunk is too long, split it further
        if (fieldValue.length > MAX_FIELD_VALUE_LENGTH) {
          // Split by newlines and create multiple fields
          const lines = fieldValue.split('\n');
          let tempChunk = [];
          
          for (const line of lines) {
            const testChunk = [...tempChunk, line];
            const testValue = testChunk.join('\n');
            
            if (testValue.length > MAX_FIELD_VALUE_LENGTH && tempChunk.length > 0) {
              lootFields.push({
                name: lootFields.length === 0 ? '__Loot Distribution__' : `__Loot Distribution (${lootFields.length + 1})__`,
                value: tempChunk.join('\n'),
                inline: false
              });
              tempChunk = [line];
            } else {
              tempChunk.push(line);
            }
          }
          
          // Add final temp chunk
          if (tempChunk.length > 0) {
            lootFields.push({
              name: lootFields.length === 0 ? '__Loot Distribution__' : `__Loot Distribution (${lootFields.length + 1})__`,
              value: tempChunk.join('\n'),
              inline: false
            });
          }
        } else {
          lootFields.push({
            name: lootFields.length === 0 ? '__Loot Distribution__' : `__Loot Distribution (${lootFields.length + 1})__`,
            value: fieldValue,
            inline: false
          });
        }
      }
    } else {
      // No loot, add single field
      lootFields.push({
        name: '__Loot Distribution__',
        value: 'No loot was found.',
        inline: false
      });
    }
    
    // Create victory embed with loot
    let victoryEmbed;
    let monsterCampContent = null; // For monster camp: message content with @mention of next player
    const isMonsterCampExpedition = waveData.source === 'monster_camp' && waveData.expeditionId;
    if (isMonsterCampExpedition) {
      // Monster camp in exploration: "OK defeated! Here who is next. Keep exploring."
      const party = await Party.findActiveByPartyId(waveData.expeditionId);
      if (party) {
        await syncPartyMemberStats(party);
        const location = party.square && party.quadrant ? `${party.square} ${party.quadrant}` : 'Unknown';
        const nextCharacter = party.characters?.[party.currentTurn] ?? null;
        victoryEmbed = new EmbedBuilder()
          .setColor(regionColors[party.region] || '#00ff99')
          .setTitle('🗺️ **Monster camp defeated!**')
          .setDescription(`All monsters cleared! Here's who is next. **Keep exploring.**`)
          .addFields(
            {
              name: '__Wave Summary__',
              value: `🎯 **Total Damage:** ${waveData.analytics.totalDamage} hearts\n👥 **Participants:** ${waveData.participants.length}\n🎁 **Items:** ${lootResults.length}`,
              inline: false
            },
            ...participantFields,
            ...lootFields
          )
          .setImage(regionImages[party.region] || 'https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setTimestamp();
        addExplorationStandardFields(victoryEmbed, {
          party,
          expeditionId: waveData.expeditionId,
          location,
          nextCharacter,
          showNextAndCommands: true,
          showRestSecureMove: false
        });
        // Store for sending: content with @mention so next player gets notified
        monsterCampContent = nextCharacter?.userId
          ? `<@${nextCharacter.userId}> 🗺️ **Monster camp defeated!** It's your turn — keep exploring.`
          : null;
      } else {
        // Party not found, fall back to standard embed
        victoryEmbed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🎉 **Wave Complete!**')
          .setDescription(`All **${waveData.analytics.totalMonsters} monsters** have been defeated! Here's what everyone got:`)
          .addFields(
            { name: '__Wave Summary__', value: `🎯 **Total Damage:** ${waveData.analytics.totalDamage} hearts\n👥 **Participants:** ${waveData.participants.length}\n🎁 **Items Distributed:** ${lootResults.length}\n⏱️ **Duration:** ${Math.floor((waveData.analytics.duration || 0) / 1000 / 60)}m`, inline: false },
            ...participantFields,
            ...killsFields,
            ...lootFields
          )
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: `Wave ID: ${waveData.waveId}` })
          .setTimestamp();
      }
    } else {
      victoryEmbed = new EmbedBuilder()
        .setColor('#FFD700') // Gold color for victory
        .setTitle(`🎉 **Wave Complete!**`)
        .setDescription(`All **${waveData.analytics.totalMonsters} monsters** have been defeated! Here's what everyone got:`)
        .addFields(
          {
            name: '__Wave Summary__',
            value: `🎯 **Total Damage:** ${waveData.analytics.totalDamage} hearts\n👥 **Participants:** ${waveData.participants.length}\n🎁 **Items Distributed:** ${lootResults.length}\n⏱️ **Duration:** ${Math.floor((waveData.analytics.duration || 0) / 1000 / 60)}m`,
            inline: false
          },
          ...participantFields,
          ...killsFields,
          ...lootFields
        )
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .setFooter({ text: `Wave ID: ${waveData.waveId}` })
        .setTimestamp();
    }
    
    // Send victory embed to the wave thread (if it exists) or followUp
    const sendPayload = monsterCampContent ? { content: monsterCampContent, embeds: [victoryEmbed] } : { embeds: [victoryEmbed] };
    if (waveData.threadId) {
      try {
        // Validate thread exists and is accessible
        const thread = await interaction.client.channels.fetch(waveData.threadId);
        if (thread && thread.isThread && !thread.archived) {
          await thread.send(sendPayload);
          console.log(`[wave.js]: ✅ Victory embed sent to wave thread ${waveData.threadId}`);
        } else {
          console.warn(`[wave.js]: ⚠️ Thread ${waveData.threadId} is not accessible or is archived`);
          await interaction.followUp(sendPayload);
        }
      } catch (error) {
        console.error(`[wave.js]: ❌ Error sending victory embed to thread ${waveData.threadId}:`, error);
        await interaction.followUp(sendPayload);
      }
    } else {
      console.log(`[wave.js]: ⚠️ No thread ID found for wave ${waveData.waveId} - victory embed will only be sent to the original interaction`);
      await interaction.followUp(sendPayload);
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
          .setTitle(`⚠️ Wave Loot Processing Issues`)
          .setDescription(`Some characters had issues receiving their wave loot. Please investigate:`)
          .addFields(
            {
              name: '__Failed Characters__',
              value: failedCharacters.map(fc => 
                `• **${fc.name}**${fc.monster ? ` (${fc.monster})` : ''}: ${fc.reason}${fc.lootedItem ? ` (${fc.lootedItem.itemName} × ${fc.lootedItem.quantity})` : ''}`
              ).join('\n'),
              inline: false
            },
            {
              name: '__Wave Details__',
              value: `**Wave ID:** ${waveData.waveId}\n**Channel:** <#${interaction.channelId}>\n**Message:** ${interaction.url}`,
              inline: false
            }
          )
          .setTimestamp();
        
        await modChannel.send({ embeds: [failedLootEmbed] });
        console.log(`[wave.js]: ⚠️ Sent loot processing failure notification to mods for ${failedCharacters.length} characters`);
        
      } catch (error) {
        console.error(`[wave.js]: ❌ Error notifying mods about loot processing failures:`, error);
      }
    }
    
  } catch (error) {
    handleInteractionError(error, 'wave.js', {
      functionName: 'handleWaveVictory',
      waveId: waveData.waveId,
      participantCount: waveData.participants?.length || 0,
      defeatedMonsters: waveData.defeatedMonsters?.length || 0
    });
    console.error(`[wave.js]: ❌ Error handling wave victory for wave ${waveData.waveId} (${waveData.participants?.length || 0} participants, ${waveData.defeatedMonsters?.length || 0} monsters defeated):`, error);
    
    // Send a simple victory message if the full victory handling fails
    try {
      await interaction.followUp({
        content: `🎉 **Wave Complete!** All monsters have been defeated! (Note: There was an error processing loot distribution. Please contact a moderator.)`,
        ephemeral: false
      });
    } catch (followUpError) {
      console.error(`[wave.js]: ❌ Error sending fallback victory message:`, followUpError);
    }
  }
}

// ---- Function: generateWaveLootedItem ----
// Generates looted item for wave participants based on total damage dealt
// Similar to raid loot generation
async function generateWaveLootedItem(weightedItems, damageDealt = 0) {
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
    
    console.log(`[wave.js]: ⚠️ Fallback loot selection for ${damageDealt} damage - target: ${targetRarity}, fallback: ${fallbackRarity}, available: ${selectionPool.length} items`);
  }
  
  if (selectionPool.length === 0) {
    return null;
  }
  
  // Select item from the filtered pool
  const randomIndex = Math.floor(Math.random() * selectionPool.length);
  const lootedItem = { ...selectionPool[randomIndex] };
  
  // Log the rarity selection for debugging
  console.log(`[wave.js]: 🎯 Loot selection for ${damageDealt} damage - Target rarity: ${targetRarity}, Selected rarity: ${lootedItem.itemRarity}, Item: ${lootedItem.itemName}`);
  
  // Default quantity
  lootedItem.quantity = 1;
  
  return lootedItem;
}

