// ------------------- Import necessary modules -------------------
// Group imports into standard libraries, third-party, and local modules
const { SlashCommandBuilder } = require('discord.js');
const { fetchCharacterByName, fetchCharactersByUserId, fetchCharacterByNameAndUserId } = require('../database/characterService');
const { v4: uuidv4 } = require('uuid');
const { capitalizeWords, capitalizeFirstLetter } = require('../modules/formattingModule');
const { useStamina, recoverHearts } = require('../modules/characterStatsModule');
const { 
  saveHealingRequestToStorage, 
  cleanupExpiredHealingRequests, 
  retrieveHealingRequestFromStorage, 
  deleteHealingRequestFromStorage 
} = require('../utils/storage');
const { createHealEmbed, createHealingEmbed } = require('../embeds/mechanicEmbeds');

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

// ------------------- Handle /heal request -------------------
if (subcommand === 'request') {
  const characterName = interaction.options.getString('charactername');
  const heartsToHeal = interaction.options.getInteger('hearts');
  const paymentOffered = interaction.options.getString('payment') || 'No payment specified';
  const healerName = interaction.options.getString('healer');

  try {
      await interaction.deferReply();

      const characterToHeal = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
      const healerCharacter = healerName ? await fetchCharacterByName(healerName) : null;

      // Ensure the character exists and belongs to the user
      if (!characterToHeal) {
          await interaction.editReply('❌ **Error:** This character does not belong to you!');
          return;
      }

      // Check if requested hearts exceed the character's max hearts
      if (heartsToHeal > characterToHeal.maxHearts) {
          await interaction.editReply(
              `❌ **Error:** You cannot request healing for more hearts than **${characterToHeal.name}**'s maximum hearts (**${characterToHeal.maxHearts}**).`
          );
          return;
      }

      // Check if the character is already at full health
      if (characterToHeal.currentHearts === characterToHeal.maxHearts) {
          await interaction.editReply(
              `❌ **Error:** **${characterToHeal.name}** is already at full health with **${characterToHeal.currentHearts}/${characterToHeal.maxHearts}** hearts.`
          );
          return;
      }

      // Check if the character or healer is debuffed
      if (characterToHeal.debuff?.active) {
          const debuffEndDate = new Date(characterToHeal.debuff.endDate);
          const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
          await interaction.editReply(
              `❌ **Error:** Healing cannot be requested because **${characterToHeal.name}** is currently affected by a debuff. Please wait until the debuff expires.\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`
          );
          return;
      }

      if (healerCharacter && healerCharacter.debuff?.active) {
          const debuffEndDate = new Date(healerCharacter.debuff.endDate);
          const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
          await interaction.editReply(
              `❌ **Error:** Healing cannot be requested because **${healerCharacter.name}** is currently affected by a debuff. Please wait until the debuff expires.\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`
          );
          return;
      }

      // Check if the healer has enough stamina
      if (healerCharacter && healerCharacter.currentStamina < heartsToHeal) {
          await interaction.editReply(
              `😴 **Oops!** **${healerCharacter.name}** only has **${healerCharacter.currentStamina}** stamina and cannot heal your requested **${heartsToHeal}** hearts. Come back later when **${healerCharacter.name}** has rested!`
          );
          return;
      }

      // Ensure both characters are in the same village
      if (healerCharacter && healerCharacter.currentVillage.toLowerCase() !== characterToHeal.currentVillage.toLowerCase()) {
          await interaction.editReply(
              `❌ Healing request cannot be created because **${characterToHeal.name}** is in **${capitalizeFirstLetter(characterToHeal.currentVillage)}**, while **${healerCharacter.name}** is in **${capitalizeFirstLetter(healerCharacter.currentVillage)}**. Both must be in the same village.`
          );
          return;
      }

      // Create and save the healing request
      const healingRequestId = Math.random().toString(36).substr(2, 6).toUpperCase();
      const healingRequestData = {
          healingRequestId,
          characterRequesting: characterToHeal.name,
          village: characterToHeal.currentVillage,
          heartsToHeal,
          paymentOffered,
          healerName: healerName || null,
          requesterUserId: interaction.user.id,
          status: 'pending',
          timestamp: Date.now(),
      };

      const embed = createHealEmbed(null, characterToHeal, heartsToHeal, paymentOffered, healingRequestId);

      // Send the embed and save the message ID
      const sentMessage = await interaction.followUp({
          content: healerName
              ? `🔔 <@${interaction.user.id}>, **${characterToHeal.name}** is requesting healing from **${healerName}**!`
              : `🔔 @Job Perk: Healing, Healing request for any eligible healer in **${capitalizeFirstLetter(characterToHeal.currentVillage)}**!`,
          embeds: [embed],
      });

      // Save the message ID in the healing request data
      healingRequestData.messageId = sentMessage.id;
      saveHealingRequestToStorage(healingRequestId, healingRequestData);
  } catch (error) {
      console.error('[heal.js]: Error during healing request creation:', error.message);
      await interaction.editReply('❌ **Error:** An issue occurred while creating the healing request.');
  }
}

    // ------------------- Handle /heal fulfill -------------------
// ------------------- Handle /heal fulfill -------------------
if (subcommand === 'fulfill') {
  const requestId = interaction.options.getString('requestid');
  const healerName = interaction.options.getString('healername');

  try {
      await interaction.deferReply();

      // Retrieve the healing request
      const healingRequest = retrieveHealingRequestFromStorage(requestId);
      if (!healingRequest) {
          await interaction.editReply(`❌ **Error:** No healing request found with ID **${requestId}**.`);
          return;
      }

      if (healingRequest.status !== 'pending') {
          await interaction.editReply(
              `❌ **Error:** Healing request **${requestId}** has already been fulfilled or expired.`
          );
          return;
      }

      // Fetch the healer's character
      const healerCharacter = await fetchCharacterByNameAndUserId(healerName, interaction.user.id);
      if (!healerCharacter) {
          await interaction.editReply(`❌ **Error:** You do not own the healer character **${healerName}**!`);
          return;
      }

      if (healerCharacter.job.toLowerCase() !== 'healer') {
          await interaction.editReply(
              `❌ **Error:** Only characters with the **Healer** job can fulfill healing requests.`
          );
          return;
      }

      // Fetch the character to be healed
      const characterToHeal = await fetchCharacterByName(healingRequest.characterRequesting);
      if (!characterToHeal) {
          await interaction.editReply(
              `❌ **Error:** The character to be healed, **${healingRequest.characterRequesting}**, could not be found.`
          );
          return;
      }

      // Check for debuffs preventing healing
      if (characterToHeal.debuff?.active) {
          await interaction.editReply(
              `❌ **Error:** Healing cannot be completed because **${characterToHeal.name}** is currently affected by a debuff. Please wait until the debuff expires.`
          );
          return;
      }

      // Verify healer and character are in the same village
      if (healingRequest.village.toLowerCase() !== healerCharacter.currentVillage.toLowerCase()) {
          await interaction.editReply(
              `❌ Healing cannot be completed because **${characterToHeal.name}** is in **${capitalizeFirstLetter(healingRequest.village)}**, while **${healerCharacter.name}** is in **${capitalizeFirstLetter(healerCharacter.currentVillage)}**. Both must be in the same village.`
          );
          return;
      }

      // Verify the healer matches the specific request, if applicable
      if (healingRequest.healerName && healingRequest.healerName !== healerCharacter.name) {
          await interaction.editReply(
              `❌ **Error:** This healing request is specifically for **${healingRequest.healerName}**, not **${healerCharacter.name}**.`
          );
          return;
      }

      // Check healer's stamina
      const staminaCost = healingRequest.heartsToHeal;
      if (healerCharacter.currentStamina < staminaCost) {
          await interaction.editReply(
              `❌ **Oops!** Healing cannot be completed because **${healerCharacter.name}**'s stamina is too low. Let them rest and try again later!`
          );
          return;
      }

      // Process healing
      await useStamina(healerCharacter._id, staminaCost);
      await recoverHearts(characterToHeal._id, healingRequest.heartsToHeal, healerCharacter._id);

      // Mark request as fulfilled and remove it from storage
      healingRequest.status = 'fulfilled';
      saveHealingRequestToStorage(requestId, healingRequest);

      // Edit the original request message
      const channel = interaction.channel;
      const originalMessage = await channel.messages.fetch(healingRequest.messageId);

      if (originalMessage) {
          const updatedEmbed = createHealEmbed(
              healerCharacter,
              characterToHeal,
              healingRequest.heartsToHeal,
              healingRequest.paymentOffered,
              null, // No Request ID since fulfilled
              true  // Mark as fulfilled
          );

          await originalMessage.edit({
              embeds: [updatedEmbed],
          });
      }

      // Notify requester and send the fulfilled embed
      const originalRequesterId = healingRequest.requesterUserId;
      const message = `<@${originalRequesterId}>, your character **${characterToHeal.name}** has been healed by **${healerCharacter.name}**!`;

      const embed = createHealingEmbed(
          healerCharacter,             // Healer's details
          characterToHeal,             // Character being healed
          healingRequest.heartsToHeal, // Hearts healed
          staminaCost,                 // Stamina used
          `Healed by: **${healerCharacter.name}**` // Fulfillment message
      );

      await interaction.followUp({ content: message, embeds: [embed] });
  } catch (error) {
      console.error('[heal.js]: Error during healing request fulfillment:', error.message);
      await interaction.editReply('❌ **Error:** An issue occurred while fulfilling the healing request.');
  }
}

  },

  // ------------------- Autocomplete Handler -------------------
  async autocomplete(interaction) {
    await handleTradeAutocomplete(interaction);
  },
};
