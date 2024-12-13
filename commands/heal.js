// ------------------- Import necessary modules -------------------
// Standard Library Imports
const { SlashCommandBuilder } = require('discord.js');

// Database Imports
const {  fetchCharacterByName,  fetchCharactersByUserId,} = require('../database/characterService');

// Utility Imports
const { v4: uuidv4 } = require('uuid');
const { capitalizeWords, capitalize, capitalizeFirstLetter } = require('../modules/formattingModule');
const { useStamina, recoverHearts } = require('../modules/characterStatsModule');

// Embed Imports
const { createHealEmbed, createHealingEmbed } = require('../embeds/mechanicEmbeds');

// Models
const { saveHealingRequestToStorage, cleanupExpiredHealingRequests, retrieveHealingRequestFromStorage, deleteHealingRequestFromStorage } = require('../utils/storage');

// ------------------- Main Heal Command Module -------------------
module.exports = {
  // ------------------- Command Data Definition -------------------
  data: new SlashCommandBuilder()
    .setName('heal')
    .setDescription('Handle healing interactions')
    .addSubcommand(subcommand =>
      subcommand
        .setName('request')
        .setDescription('Request healing for a character')
        .addStringOption(option =>
          option
            .setName('charactername')
            .setDescription('The name of the character to be healed')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption(option =>
          option
            .setName('hearts')
            .setDescription('Number of hearts to heal')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(option =>
          option
            .setName('payment')
            .setDescription('Describe the payment offered for healing (optional)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('healer')
            .setDescription('The name of the healer being requested (optional)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('fulfill')
        .setDescription('Fulfill a healing request')
        .addStringOption(option =>
          option
            .setName('requestid')
            .setDescription('The ID of the healing request to fulfill')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('healername')
            .setDescription('The name of the character performing the healing')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  // ------------------- Main Execute Function -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'request') {
      const characterName = interaction.options.getString('charactername');
      const heartsToHeal = interaction.options.getInteger('hearts');
      const paymentOffered = interaction.options.getString('payment') || 'No payment specified';
      const healerName = interaction.options.getString('healer');

      try {
        await interaction.deferReply();

        const characterToHeal = await fetchCharacterByName(characterName);
        if (!characterToHeal) {
          await interaction.editReply('❌ **Error:** Character to heal not found.');
          return;
        }

        const healingRequestId = `${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        const healingRequestData = {
          healingRequestId,
          characterRequesting: characterToHeal.name,
          village: characterToHeal.currentVillage,
          heartsToHeal,
          paymentOffered,
          healerName: healerName || null,
          requesterUserId: interaction.user.id, // Store the requester's user ID
          status: 'pending',
          timestamp: Date.now(),
        };

        saveHealingRequestToStorage(healingRequestId, healingRequestData);

        const embed = createHealEmbed(null, characterToHeal, heartsToHeal, paymentOffered, healingRequestId);

        const content = healerName
        ? `🔔 @${healerName}, **${characterToHeal.name}** is requesting healing from **${healerName}**!`
        : `🔔 @Job Perk: Healing, Healing request for any eligible healer in **${capitalizeFirstLetter(characterToHeal.currentVillage)}**!`;
      

        await interaction.followUp({
          content,
          embeds: [embed],
        });
      } catch (error) {
        console.error('❌ Error during healing request creation:', error.message);
        await interaction.editReply('❌ **Error:** An issue occurred while creating the healing request.');
      }
    }

    if (subcommand === 'fulfill') {
      const requestId = interaction.options.getString('requestid');
      const healerName = interaction.options.getString('healername');
    
      try {
        await interaction.deferReply();
    
        const healingRequest = retrieveHealingRequestFromStorage(requestId);
        if (!healingRequest) {
          await interaction.editReply(`❌ **Error:** No healing request found with ID **${requestId}**.`);
          return;
        }
    
        if (healingRequest.status !== 'pending') {
          await interaction.editReply(`❌ **Error:** Healing request **${requestId}** has already been fulfilled or expired.`);
          return;
        }
    
        const healerCharacter = await fetchCharacterByName(healerName);
        if (!healerCharacter) {
          await interaction.editReply(`❌ **Error:** Healer character **${healerName}** not found.`);
          return;
        }
    
        const characterToHeal = await fetchCharacterByName(healingRequest.characterRequesting);
        if (!characterToHeal) {
          await interaction.editReply(`❌ **Error:** The character to be healed, **${healingRequest.characterRequesting}**, could not be found.`);
          return;
        }
    
        if (healingRequest.village.toLowerCase() !== healerCharacter.currentVillage.toLowerCase()) {
          await interaction.editReply(
            `❌ The healing cannot be completed because **${characterToHeal.name}** is in **${capitalizeFirstLetter(healingRequest.village)}**, but **${healerCharacter.name}** is currently in **${capitalizeFirstLetter(healerCharacter.currentVillage)}**. Both must be in the same village for healing to occur.`
          );
          return;
        }
    
        const staminaCost = healingRequest.heartsToHeal;
        await useStamina(healerCharacter._id, staminaCost);
        await recoverHearts(characterToHeal._id, healingRequest.heartsToHeal, healerCharacter._id);
    
        healingRequest.status = 'fulfilled';
        saveHealingRequestToStorage(requestId, healingRequest);
    
        // Delete the fulfilled request from storage
        deleteHealingRequestFromStorage(requestId);
    
        const originalRequesterId = healingRequest.requesterUserId;
        const message = `<@${originalRequesterId}>, your character **${characterToHeal.name}** has been healed by **${healerCharacter.name}**!`;
        const embed = createHealingEmbed(healerCharacter, characterToHeal, healingRequest.heartsToHeal, staminaCost, requestId);
    
        await interaction.followUp({ content: message, embeds: [embed] });
    
      } catch (error) {
        console.error('❌ Error during healing request fulfillment:', error.message);
        await interaction.editReply('❌ **Error:** An issue occurred while fulfilling the healing request.');
      }
    }
  },    

  // ------------------- Autocomplete Handler -------------------
  async autocomplete(interaction) {
    await handleTradeAutocomplete(interaction);
  },
};