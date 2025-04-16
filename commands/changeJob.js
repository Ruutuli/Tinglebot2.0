// ------------------- Change Job Command for Characters -------------------
// This file allows users to change their character's job once per month for a token cost.
// It connects to the database, validates the job change request, deducts tokens,
// logs the transaction in Google Sheets, updates the character record, and returns an informative embed.

// ------------------- Discord.js Components -------------------
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Database Connections -------------------
const { connectToTinglebot } = require('../database/connection');

// ------------------- Database Services -------------------
const { fetchCharacterByNameAndUserId, updateCharacterById } = require('../database/characterService');
const { getOrCreateToken, updateTokenBalance } = require('../database/tokenService');

// ------------------- Modules -------------------
const { getVillageColorByName, getVillageEmojiByName } = require('../modules/locationsModule');
const { handleChangeJobNewJobAutocomplete, handleCharacterBasedCommandsAutocomplete } = require('../handlers/autocompleteHandler');

// ------------------- Utility Functions -------------------
const { canChangeJob } = require('../utils/validation');

// ------------------- Google Sheets API -------------------
const { appendSheetData, authorizeSheets, extractSpreadsheetId } = require('../utils/googleSheetsUtils');

// ------------------- Database Models -------------------
const Character = require('../models/CharacterModel');

// ------------------- Constants -------------------
const DEFAULT_IMAGE_URL = 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';

module.exports = {
  // ------------------- Command Data Definition -------------------
  data: new SlashCommandBuilder()
    .setName('changejob')
    .setDescription('Change the job of your character (Costs 500 tokens, once per month)')
    .addStringOption(option =>
      option
        .setName('charactername')
        .setDescription('The name of your character')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('newjob')
        .setDescription('The new job you want for your character')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  // ------------------- Command Execution -------------------
  async execute(interaction) {
    // Defer the reply to allow time for processing
    await interaction.deferReply({ ephemeral: true });

    try {
      // ------------------- Extract and Validate Input -------------------
      const userId = interaction.user.id;
      const characterName = interaction.options.getString('charactername');
      const newJob = interaction.options.getString('newjob');

      // ------------------- Connect to Database -------------------
      await connectToTinglebot();

      // ------------------- Fetch Character Data -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        return interaction.followUp({
          content: `❌ **Character "${characterName}"** not found or does not belong to you.`,
          ephemeral: true
        });
      }
      const previousJob = character.job || "Unknown";

      // ------------------- Validate Job Change Eligibility -------------------
      const jobValidation = await canChangeJob(character, newJob);
      if (!jobValidation.valid) {
        return interaction.followUp({ content: jobValidation.message, ephemeral: true });
      }

      // ------------------- Check Cooldown (Once per Month) -------------------
      const currentTime = Date.now();
      const oneMonth = 30 * 24 * 60 * 60 * 1000;
      const lastJobChangeDate = character.jobDateChanged || 0;

      if (currentTime - new Date(lastJobChangeDate).getTime() < oneMonth) {
        const remainingDays = Math.ceil((oneMonth - (currentTime - new Date(lastJobChangeDate).getTime())) / (24 * 60 * 60 * 1000));
        return interaction.followUp({
          content: `⚠️ You can only change jobs once per month. Please wait **${remainingDays}** more day(s).`,
          ephemeral: true
        });
      }

      // ------------------- Verify and Deduct Tokens -------------------
      const userTokens = await getOrCreateToken(userId);
      if (userTokens.tokens < 500) {
        return interaction.followUp({
          content: `❌ You need **500 tokens** to change your character's job. Current balance: **${userTokens.tokens} tokens**.`,
          ephemeral: true
        });
      }
      // Deduct 500 tokens from the user's balance
      await updateTokenBalance(userId, -500);

      // ------------------- Log Token Deduction to Google Sheets -------------------
      if (userTokens.tokenTracker) {
        const spreadsheetId = extractSpreadsheetId(userTokens.tokenTracker);
        const auth = await authorizeSheets();
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const tokenRow = [
          `${character.name} - Job Change`,
          interactionUrl,
          'job change',
          'spent',
          `-500`
        ];
        await appendSheetData(auth, spreadsheetId, 'loggedTracker!B7:F', [tokenRow]);
      }

      // ------------------- Update Character Record -------------------
      character.job = newJob;
      character.lastJobChange = currentTime;
      character.jobDateChanged = new Date(currentTime); // Record the timestamp of job change

      // Append the job change to the character's job history
      character.jobHistory = character.jobHistory || [];
      character.jobHistory.push({
        job: newJob,
        changedAt: new Date(currentTime),
      });

      // Save the updated character record
      await character.save();

      // ------------------- Build and Send Response Embed -------------------
      const villageColor = getVillageColorByName(character.homeVillage) || '#4CAF50';
      const villageEmoji = getVillageEmojiByName(character.homeVillage) || '🏡';
      const nextJobChangeDate = new Date(currentTime + oneMonth).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const embed = new EmbedBuilder()
        .setTitle(`${villageEmoji} Job Change Notification`)
        .setDescription(
          `Resident **${character.name}** has formally submitted their notice of job change from **${previousJob}** to **${newJob}**.\n\n` +
          `The **${character.homeVillage} Town Hall** wishes you the best in your new endeavors!`
        )
        .addFields(
          { name: '👤 __Name__', value: character.name, inline: true },
          { name: '🏡 __Home Village__', value: character.homeVillage, inline: true },
          { name: '​', value: '​', inline: true },
          { name: '📅 __Last Job Change__', value: new Date(character.jobDateChanged).toLocaleDateString(), inline: true },
          { name: '🔄 __Next Change Available__', value: nextJobChangeDate, inline: true }
        )
        .setColor(villageColor)
        .setThumbnail(character.icon)
        .setImage(DEFAULT_IMAGE_URL)
        .setTimestamp();

      // Send the embed as a follow-up response
      return interaction.followUp({ embeds: [embed], ephemeral: true });

    } catch (error) {
    handleError(error, 'changeJob.js');

      // ------------------- Error Handling -------------------
      console.error('[changejob.js]: Error changing job:', error);
      return interaction.followUp({
        content: '❌ An error occurred while processing your request. Please try again later.',
        ephemeral: true
      });
    }
  },

  // ------------------- Autocomplete Handler -------------------
  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true);

      if (focusedOption.name === 'charactername') {
        await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, 'changejob');
      } else if (focusedOption.name === 'newjob') {
        await handleChangeJobNewJobAutocomplete(interaction, focusedOption);
      } else {
        await interaction.respond([]);
      }
    } catch (error) {
    handleError(error, 'changeJob.js');

      console.error('[changejob.js]: Error handling autocomplete:', error);
      await interaction.respond([]);
    }
  }
};
