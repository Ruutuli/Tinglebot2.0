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
        // ------------------- Fetch Character -------------------
        const character = await Character.findOne({ userId: interaction.user.id, name: characterName });
        if (!character) {
          return await interaction.reply({ content: '❌ Character not found.', ephemeral: true });
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
        // ------------------- Sequential Monster Fights -------------------
        const { fetchItemsByMonster } = require('../../database/db.js');
        const { calculateFinalValue, createWeightedItemList } = require('../../modules/rngModule.js');
        const { getEncounterOutcome } = require('../../modules/encounterModule.js');
        const { handleKO, updateCurrentHearts } = require('../../modules/characterStatsModule.js');
        const { generateVictoryMessage, generateDamageMessage, generateFinalOutcomeMessage, generateDefenseBuffMessage, generateAttackBuffMessage } = require('../../modules/flavorTextModule.js');
        const { createMonsterEncounterEmbed, createKOEmbed } = require('../../embeds/embeds.js');
        
        await interaction.deferReply();
        
        let summary = [];
        let defeatedAll = true;
        let heartsRemaining = character.currentHearts;
        let currentMonsterIndex = 0;
        let isFirstBattle = true;
        
        console.log(`[helpWanted.js]: 🏃 Starting monster hunt for ${character.name} - ${heartsRemaining} hearts remaining`);
        
        for (const monsterName of monsterList) {
          currentMonsterIndex++;
          console.log(`[helpWanted.js]: ⚔️ Battle ${currentMonsterIndex}/${monsterList.length} - ${character.name} vs ${monsterName} (${heartsRemaining} hearts remaining)`);
          
          // Fetch full monster data by name
          const { fetchMonsterByName } = require('../../database/db.js');
          const monster = await fetchMonsterByName(monsterName);
          if (!monster) {
            console.error(`[helpWanted.js]: ❌ Monster "${monsterName}" not found in database`);
            await interaction.editReply({ content: `❌ Monster "${monsterName}" not found in database.`, ephemeral: true });
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
              
              if (isFirstBattle) {
                await interaction.editReply({ embeds: [koEmbed] });
              } else {
                await interaction.followUp({ embeds: [koEmbed] });
              }
              
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
            
            if (isFirstBattle) {
              await interaction.editReply({ embeds: [battleEmbed] });
              isFirstBattle = false;
            } else {
              await interaction.followUp({ embeds: [battleEmbed] });
            }
            
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
          console.log(`[helpWanted.js]: ✅ Quest ${questId} completed by ${character.name}`);
        } else {
          console.log(`[helpWanted.js]: ❌ Quest ${questId} failed - ${character.name} was KO'd`);
        }
        
        // ------------------- Final Summary -------------------
        console.log(`[helpWanted.js]: 📋 Monster hunt summary for ${character.name}:`);
        summary.forEach((battle, index) => {
          console.log(`[helpWanted.js]:   ${index + 1}. ${battle.monster} - ${battle.result}: ${battle.message}`);
        });
        
        // Send final summary message as a follow-up
        let resultMsg = defeatedAll ? `✅ **${character.name} defeated all ${monsterList.length} monsters! Quest completed.**` : `❌ **${character.name} was KO'd after defeating ${currentMonsterIndex - 1} monsters. Quest failed.**`;
        let details = summary.map((s, index) => `**${index + 1}. ${s.monster}:** ${s.message}`).join('\n');
        await interaction.followUp({ content: `${resultMsg}\n\n${details}`, ephemeral: true });
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
    if (sub !== 'complete') return;

    const characterName = interaction.options.getString('character');
    try {
      // ------------------- Fetch Character -------------------
      // TODO: Fetch character by name and user ID
      const character = await Character.findOne({
        userId: interaction.user.id,
        name: characterName
      });
      if (!character) {
        return await interaction.reply({ content: '❌ Character not found.', ephemeral: true });
      }

      // ------------------- Fetch User -------------------
      const user = await User.findOne({ discordId: interaction.user.id });
      if (!user) {
        return await interaction.reply({ content: '❌ User not found.', ephemeral: true });
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

      // ------------------- Eligibility Checks (Stubs) -------------------
      // TODO: Check if quest is already completed
      // TODO: Check if character is native to village
      // TODO: Check if user/character has already completed a quest today
      // TODO: Check for cooldowns

      // ------------------- Quest Requirement Validation (Stubs) -------------------
      // TODO: Validate quest requirements based on quest.type
      // - Item: check inventory
      // - Monster: check battle log
      // - Crafting: check crafted-by
      // - Escort: check travel log

      // ------------------- On Success: Mark Quest Completed (Stub) -------------------
      // TODO: Mark quest as completed, update user/character records

      // ------------------- Respond to User -------------------
      await interaction.reply({ content: '✅ (Stub) Quest completion logic will go here.', ephemeral: true });
    } catch (error) {
      handleError(error, 'helpWanted.js', {
        commandName: 'helpwanted complete',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        characterName: characterName
      });
      await interaction.reply({ content: '❌ An error occurred. Please try again later.', ephemeral: true });
    }
  }
}; 