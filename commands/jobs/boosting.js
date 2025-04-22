// ------------------- Standard Libraries -------------------
// Import third-party libraries considered as standard for the project.
const { v4: uuidv4 } = require('uuid');


const { handleError } = require('../../utils/globalErrorHandler');
// ------------------- Discord.js Components -------------------
// Import components from discord.js for handling slash commands and embeds.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');


// ------------------- Database Services -------------------
// Import database service functions for character lookups.
const { fetchCharacterByNameAndUserId, fetchCharacterByName } = require('../../database/db');


// ------------------- Modules -------------------
// Import custom modules for boosting logic and job-related functionalities.
const { getBoostEffect } = require('../../modules/boostingModule');
const { getJobPerk } = require('../../modules/jobsModule');
// Note: The capitalizeWords function was removed because it was unused.


// ------------------- Utility Functions -------------------
// Import utility functions for persistent storage of boost requests.
const { saveBoostingRequestToStorage, retrieveBoostingRequestFromStorage } = require('../../utils/storage');


// ============================================================================
// ------------------- Boosting Command Definition -------------------
// This module defines the /boosting slash command and its subcommands.
// It handles both the boost request initiation and the acceptance/fulfillment flows.
module.exports = {
  // Define the slash command using Discord.js's builder.
  data: new SlashCommandBuilder()
    .setName('boosting')
    .setDescription('Manage character boosts')
    // ------------------- /boosting request Subcommand -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('request')
        .setDescription('Request a character to boost you')
        .addStringOption(option =>
          option.setName('character')
            .setDescription('Your character (the one receiving the boost)')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('booster')
            .setDescription('Name of the character who will provide the boost')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('category')
            .setDescription('Category to be boosted')
            .setRequired(true)
            .addChoices(
              { name: 'Looting', value: 'Looting' },
              { name: 'Gathering', value: 'Gathering' },
              { name: 'Crafting', value: 'Crafting' },
              { name: 'Healers', value: 'Healers' },
              { name: 'Stealing', value: 'Stealing' },
              { name: 'Vending', value: 'Vending' },
              { name: 'Tokens', value: 'Tokens' },
              { name: 'Exploring', value: 'Exploring' },
              { name: 'Traveling', value: 'Traveling' },
              { name: 'Mounts', value: 'Mounts' },
              { name: 'Other', value: 'Other' }
            )
        )
    )
    // ------------------- /boosting accept Subcommand -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('accept')
        .setDescription('Accept and fulfill a boost request')
        .addStringOption(option =>
          option.setName('requestid')
            .setDescription('The ID of the boost request')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('character')
            .setDescription('Your boosting character')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  // ------------------- Execute Function -------------------
  // This function executes the appropriate logic based on the subcommand used.
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // ------------------- Handle /boosting request Subcommand -------------------
    if (subcommand === 'request') {
      // Retrieve inputs from the user.
      const characterName = interaction.options.getString('character');
      const boosterName = interaction.options.getString('booster');
      const category = interaction.options.getString('category');
      const userId = interaction.user.id;

      // Fetch characters from the database.
      const targetCharacter = await fetchCharacterByNameAndUserId(characterName, userId);
      const boosterCharacter = await fetchCharacterByName(boosterName);
      const boosterJob = boosterCharacter.job;
      const boost = getBoostEffect(boosterJob, category);

      // Error if either character is not found.
      if (!targetCharacter || !boosterCharacter) {
        console.error(`[boosting.js]: logs Error - One or both characters could not be found. Inputs: character="${characterName}", booster="${boosterName}"`);
        await interaction.reply({
          content: '❌ One or both characters could not be found.',
          ephemeral: true
        });
        return;
      }

      // Ensure both characters are in the same village.
      if (targetCharacter.currentVillage.toLowerCase() !== boosterCharacter.currentVillage.toLowerCase()) {
        console.error(`[boosting.js]: logs Error - Characters are in different villages. Target: ${targetCharacter.currentVillage}, Booster: ${boosterCharacter.currentVillage}`);
        await interaction.reply({
          content: '❌ Both characters must be in the same village.',
          ephemeral: true
        });
        return;
      }

      // Define categories exempt from job perk validation.
      const exemptCategories = ['Tokens', 'Exploring', 'Traveling', 'Mounts', 'Other'];

      // Validate that the target character's job supports the boost category if not exempt.
      if (!exemptCategories.includes(category)) {
        const jobPerk = getJobPerk(targetCharacter.job);
        if (!jobPerk || !jobPerk.perks.includes(category.toUpperCase())) {
          console.error(`[boosting.js]: logs Error - Job "${targetCharacter.job}" does not support boost category "${category}" for character "${targetCharacter.name}".`);
          await interaction.reply({
            content: `❌ **${targetCharacter.name}** cannot request a boost for **${category}** because their job (**${targetCharacter.job}**) does not support it.`,
            ephemeral: true
          });
          return;
        }
      }

      // Generate a unique boost request ID.
      const boostRequestId = uuidv4().slice(0, 8).toUpperCase();
      // Create a boost request data object with all necessary details.
      const requestData = {
        boostRequestId,
        targetCharacter: targetCharacter.name,
        boostingCharacter: boosterCharacter.name,
        category,
        status: 'pending',
        requesterUserId: userId,
        village: targetCharacter.currentVillage,
        timestamp: Date.now()
      };

      // Save the boost request to persistent storage.
      saveBoostingRequestToStorage(boostRequestId, requestData);

      // Build an embed to display the boost request details.
      const embed = new EmbedBuilder()
      .setTitle('🌀 Boost Request Created')
      .addFields(
        { name: 'Requested By', value: targetCharacter.name, inline: true },
        { name: 'Booster', value: boosterCharacter.name, inline: true },
        { name: 'Booster Job', value: boosterJob, inline: true },
        { name: 'Category', value: category },
        { name: 'Boost Effect', value: `*${boost.name}* — ${boost.description}` },
        { name: 'Request ID', value: boostRequestId }
      )
      .setColor('#6f42c1')
      .setFooter({ text: 'Waiting for booster to accept...' });
    

      // Inform the user that the boost request has been created.
      await interaction.reply({
        content: `🌀 Boost request created. Ask **${boosterCharacter.name}** to run \`/boosting accept\`.`,
        embeds: [embed]
      });

    // ------------------- Handle /boosting accept Subcommand -------------------
    } else if (subcommand === 'accept') {
      // Retrieve inputs from the user.
      const requestId = interaction.options.getString('requestid');
      const boosterName = interaction.options.getString('character');
      const userId = interaction.user.id;

      // Fetch the boost request from storage.
      const requestData = retrieveBoostingRequestFromStorage(requestId);
      if (!requestData) {
        console.error(`[boosting.js]: logs Error - Invalid boost request ID "${requestId}".`);
        await interaction.reply({
          content: '❌ Invalid request ID.',
          ephemeral: true
        });
        return;
      }

      // Ensure the boost request is still pending.
      if (requestData.status !== 'pending') {
        console.error(`[boosting.js]: logs Error - Boost request "${requestId}" is not pending (status: ${requestData.status}).`);
        await interaction.reply({
          content: '❌ This request has already been fulfilled or expired.',
          ephemeral: true
        });
        return;
      }

      // Verify that the user owns the boosting character.
      const booster = await fetchCharacterByNameAndUserId(boosterName, userId);
      if (!booster) {
        console.error(`[boosting.js]: logs Error - User does not own boosting character "${boosterName}".`);
        await interaction.reply({
          content: `❌ You do not own the boosting character "${boosterName}".`,
          ephemeral: true
        });
        return;
      }

      // Confirm that the provided boosting character matches the one in the request.
      if (booster.name !== requestData.boostingCharacter) {
        console.error(`[boosting.js]: logs Error - Mismatch in boosting character. Request designated for "${requestData.boostingCharacter}", but provided "${booster.name}".`);
        await interaction.reply({
          content: `❌ This request was made for **${requestData.boostingCharacter}**, not **${booster.name}**.`,
          ephemeral: true
        });
        return;
      }

      // Retrieve the boost effect for the booster based on their job and the request category.
      const boost = getBoostEffect(booster.job, requestData.category);
      if (!boost) {
        console.error(`[boosting.js]: logs Error - No boost effect found for job "${booster.job}" and category "${requestData.category}".`);
        await interaction.reply({
          content: `❌ No boost found for job "${booster.job}" in category "${requestData.category}".`,
          ephemeral: true
        });
        return;
      }

      // Mark the boost request as fulfilled.
      requestData.status = 'fulfilled';
      // Save the updated boost request to storage.
      saveBoostingRequestToStorage(requestId, requestData);

      // Build an embed to display the fulfilled boost details.
      const embed = new EmbedBuilder()
      .setTitle(`✅ Boost Applied: ${boost.name}`)
      .addFields(
        { name: 'Boosted By', value: booster.name, inline: true },
        { name: 'Booster Job', value: booster.job, inline: true },
        { name: 'Target', value: requestData.targetCharacter, inline: true },
        { name: 'Category', value: requestData.category },
        { name: 'Effect', value: boost.description }
      )
      .setColor('#00cc99')
      .setFooter({ text: `Boost fulfilled by ${booster.name}` });

      // Inform the user that the boost has been successfully applied.
      await interaction.reply({
        content: `✅ Boost has been applied!`,
        embeds: [embed]
      });
    }
  }
};
