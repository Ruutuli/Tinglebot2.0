// ------------------- Import Necessary Modules and Services -------------------

// Discord.js imports
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const { handleError } = require('../../utils/globalErrorHandler.js');
const { checkInventorySync } = require('../../utils/characterUtils.js');
// Local service and module imports
const { fetchCharacterByNameAndUserId, fetchMonsterByName } = require('../../database/db.js');
const { processBattle } = require('../../modules/encounterModule.js');
const { 
    getRaidProgressById, 
    updateRaidProgress
} = require('../../modules/raidModule.js');
const { saveBattleProgressToStorage } = require('../../utils/storage.js');
const { monsterMapping } = require('../../models/MonsterModel.js');
const { processLoot } = require('../../modules/lootModule.js');
const {
  createKOEmbed,
} = require('../../embeds/embeds.js');

// ------------------- Command Setup -------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Join or process an ongoing raid to fight a powerful monster.')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Raid ID to check progress or join')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of your character')
        .setRequired(true)
        .setAutocomplete(true)),

// ------------------- Main Execution Function -------------------
async execute(interaction) {
  try {
      // ------------------- Defer the Reply -------------------
      await interaction.deferReply();

      // Extract options from the interaction
      const battleId = interaction.options.getString('id');
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      // ------------------- Fetch the Character -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character || !character.name) {
          console.log("[ERROR] Character not found.");
          await interaction.editReply('❌ **Character not found.**');
          return;
      }

      try {
        await checkInventorySync(character);
      } catch (error) {
        await interaction.editReply({
          content: error.message,
          ephemeral: true
        });
        return;
      }

      if (character.currentHearts <= 0 || character.ko) {
          console.log(`[ERROR] Character ${character.name} is KO'd.`);

          const koEmbed = createKOEmbed(character);
          await interaction.editReply({
              content: `❌ **${character.name} is KO'd and cannot take any further actions.**`,
              embeds: [koEmbed], // Add KO embed here
          });

          return;
      }

      // ------------------- Retrieve Existing Raid Progress -------------------
      const battleProgress = await getRaidProgressById(battleId);
      if (!battleProgress) {
          console.error(`[ERROR] No battle progress found for Battle ID: ${battleId}`);
          await interaction.editReply('❌ **An error occurred during the battle: Battle progress not found.**');
          return;
      }

      // Check if raid has expired
      const raidStartTime = battleProgress.startTime;
      const raidDuration = 15 * 60 * 1000; // 15 minutes in milliseconds
      const currentTime = Date.now();
      
      if (currentTime - raidStartTime > raidDuration) {
          console.log(`[raid.js]: ⚠️ Raid ${battleId} has expired. Start time: ${raidStartTime}, Current time: ${currentTime}`);
          await interaction.editReply('❌ **This raid has ended. You cannot join or continue an expired raid.**');
          return;
      }

      // Check if character is in the correct village
      const monster = await fetchMonsterByName(battleProgress.monster);
      if (!monster) {
          console.log("[ERROR] Monster not found.");
          await interaction.editReply('❌ **The monster in this raid could not be found.**');
          return;
      }

      // Get the village where the raid is taking place
      const raidVillage = battleProgress.villageId;
      if (character.currentVillage !== raidVillage) {
          console.log(`[raid.js]: ⚠️ Character ${character.name} is not in the raid's village. Current: ${character.currentVillage}, Required: ${raidVillage}`);
          await interaction.editReply(`❌ **You must be in ${raidVillage} to participate in this raid.**`);
          return;
      }

      const currentMonster = await fetchMonsterByName(battleProgress.monster);
      if (!currentMonster) {
          console.log("[ERROR] Monster not found.");
          await interaction.editReply('❌ **The monster in this raid could not be found.**');
          return;
      }

      // ------------------- Check for Existing User Entry -------------------
      const existingUserCharacter = battleProgress.characters.find(
        (char) => char.userId === userId && char.name !== characterName
    );
    
    if (existingUserCharacter) {
        console.log(`[ERROR] User ${userId} already has a character (${existingUserCharacter.name}) in the raid.`);
        await interaction.editReply(
            `❌ **You already have a character ("${existingUserCharacter.name}") in this raid. You cannot join with another character.**`
        );
        return;
    }

      // ------------------- Generate a Random Dice Roll -------------------
      const originalRoll = Math.floor(Math.random() * 100) + 1;

      try {
          // ------------------- Process the Battle -------------------
            console.log(`[raid.js]: 🔄 Starting battle process for ${character.name} (ID: ${character.userId})`);
            const battleOutcome = await processBattle(character, currentMonster, battleId, originalRoll, interaction);

            if (!battleOutcome || typeof battleOutcome !== 'object') {
                console.error(`[raid.js]: ❌ Invalid battle outcome for ${character.name}:`, battleOutcome);
                await interaction.editReply('⚠️ **An error occurred during the battle.**');
                return;
            }

            console.log(`[raid.js]: 📊 Battle outcome for ${character.name}:`, {
                result: battleOutcome.result,
                adjustedRoll: battleOutcome.adjustedRandomValue,
                attackSuccess: battleOutcome.attackSuccess,
                defenseSuccess: battleOutcome.defenseSuccess,
                newMonsterHearts: battleOutcome.newMonsterHeartsCurrent
            });

            // Ensure battleResult is defined, with a fallback value
            const {
                result: battleResult = 'No result available.',
                adjustedRandomValue = originalRoll,
                attackSuccess = false,
                defenseSuccess = false,
                newMonsterHeartsCurrent
            } = battleOutcome;

            let buffMessage = '';

            if (attackSuccess || defenseSuccess) {
                const buffSource = attackSuccess ? 'weapon' : 'armor';
                buffMessage = `🛡️ **Your ${buffSource} helped!**\n\n`;
            }

            // ------------------- Update Monster Hearts After Battle -------------------
            if (newMonsterHeartsCurrent !== undefined) {
                // Extract character data from Mongoose document
                const characterData = character.toObject ? character.toObject() : character;
                console.log(`[raid.js]: 🔄 Updating raid progress for ${characterData.name}`, {
                    battleId,
                    newHearts: newMonsterHeartsCurrent,
                    characterId: characterData.userId,
                    characterData: characterData // Log full character data for debugging
                });

                const { updateRaidProgress } = require('../../modules/raidModule');
                const updateData = {
                    hearts: newMonsterHeartsCurrent,
                    character: {
                        userId: characterData.userId,
                        name: characterData.name,
                        currentHearts: characterData.currentHearts,
                        maxHearts: characterData.maxHearts,
                        monster: {
                            name: currentMonster.name,
                            hearts: currentMonster.hearts,
                            tier: currentMonster.tier
                        }
                    }
                };
                console.log(`[raid.js]: 📦 Update data:`, updateData);
                
                await updateRaidProgress(battleId, battleResult, updateData);
            } else {
                console.warn(`[raid.js]: ⚠️ No monster hearts update for ${character.name} - newMonsterHeartsCurrent is undefined`);
            }

        // ------------------- Create Embed -------------------
          console.log(`[raid.js]: 🔄 Retrieving updated battle progress for ${battleId}`);
          const updatedBattleProgress = await getRaidProgressById(battleId);
          
          // Initialize monsterHearts if missing
          if (updatedBattleProgress && !updatedBattleProgress.monsterHearts) {
              console.log(`[raid.js]: 🔄 Initializing missing monsterHearts for battle ${battleId}`);
              updatedBattleProgress.monsterHearts = {
                  current: currentMonster.hearts,
                  max: currentMonster.hearts
              };
              await saveBattleProgressToStorage(battleId, updatedBattleProgress);
          }

          console.log(`[raid.js]: 📊 Updated battle progress:`, {
              exists: !!updatedBattleProgress,
              hasMonsterHearts: !!updatedBattleProgress?.monsterHearts,
              currentHearts: updatedBattleProgress?.monsterHearts?.current,
              maxHearts: updatedBattleProgress?.monsterHearts?.max
          });

          if (!updatedBattleProgress || !updatedBattleProgress.monsterHearts) {
              console.error(`[raid.js]: ❌ Invalid battle progress data for ID: ${battleId}`, {
                  progress: updatedBattleProgress,
                  hasMonsterHearts: !!updatedBattleProgress?.monsterHearts
              });
              await interaction.editReply('⚠️ **An error occurred while retrieving battle progress.**');
              return;
          }

          const monsterHeartsCurrent = updatedBattleProgress.monsterHearts.current;
          const monsterHeartsMax = updatedBattleProgress.monsterHearts.max;

          if (typeof monsterHeartsCurrent !== 'number' || typeof monsterHeartsMax !== 'number') {
              console.error(`[raid.js]: ❌ Invalid monster hearts data for ID: ${battleId}`);
              await interaction.editReply('⚠️ **An error occurred while processing monster hearts.**');
              return;
          }

          const monsterData = monsterMapping[currentMonster.nameMapping] || {};
          const monsterImage = monsterData.image || currentMonster.image || 'https://via.placeholder.com/150';

          console.log(`[raid.js]: 🔄 Creating battle embed for ${character.name}'s turn`);

          const embed = new EmbedBuilder()
              .setAuthor({ 
                  name: `${character.name}'s Turn!`, 
                  iconURL: character.icon || 'https://via.placeholder.com/50' // Fallback icon if character icon is missing 
              })
              .setTitle(`⚔️ **Battle Continues!**`)
              .setDescription(
                  `${battleResult}\n${buffMessage}\n` +
                  `📢 **Commands to Engage:**\n` +
                  `> 🔥 **Continue the Raid:** Use </raid:1319247998412132384> \n` +
                  `> 💊 **Heal During Raid:** Use </item:1306176789755858979> \n`
              )
              .addFields(
                  { name: `💙 __Monster Hearts__`, value: `> ${monsterHeartsCurrent} / ${monsterHeartsMax}`, inline: false },
                  { name: `❤️ __${character.name} Hearts__`, value: `> ${character.currentHearts} / ${character.maxHearts}`, inline: false },
                  { name: `🎲 __Dice Roll__`, value: `> ${originalRoll} -> ${adjustedRandomValue}`, inline: false },
                  { 
                      name: `🔢 __Battle ID__`, 
                      value: `\`\`\`${battleId}\`\`\``, 
                      inline: false 
                  },
                  { name: `📜 __Turn Order__`, value: updatedBattleProgress.characters.map((char) => `> ${char.name}`).join('\n'), inline: false }
              )
              .setThumbnail(monsterImage.startsWith('http') ? monsterImage : 'https://via.placeholder.com/150') // Ensure valid thumbnail
              .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Main image
              .setFooter({ text: "⚠️ Act Quickly! You have 10 minutes to complete this raid!" })
              .setColor('#FF4500');

          // Add thumbnail if the monster image is valid
          if (monsterImage && monsterImage.startsWith('http')) {
              embed.setThumbnail(monsterImage);
          }

          // Post the embed
          await interaction.editReply({ embeds: [embed] });

          // Check if monster is defeated
          if (updatedBattleProgress.monsterHearts.current <= 0) {
              await processLoot(updatedBattleProgress, currentMonster, interaction, battleId);
          }
      } catch (error) {
    handleError(error, 'raid.js');

          console.error('[ERROR] Error during battle processing:', error);
          await interaction.editReply('⚠️ **An error occurred during the battle.**');
      }
  } catch (error) {
    handleError(error, 'raid.js');

      console.error('[ERROR] Error executing command:', error);
      await interaction.editReply('⚠️ **An error occurred.**');
  }
},

};
