// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { connectToTinglebot } = require('../database/connection');
const moment = require('moment-timezone');
const Settings = require('../models/SettingsModel');

module.exports = {
  // ------------------- Command data definition -------------------
  data: new SlashCommandBuilder()
    .setName('setupbirthday')
    .setDescription('Set up the channel and timezone for birthday announcements')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel for birthday announcements')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('timezone')
        .setDescription('Timezone for birthday announcements (e.g., America/New_York)')
        .setRequired(true)),

  // ------------------- Execute command to set up the channel and timezone for birthday announcements -------------------
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const timezone = interaction.options.getString('timezone');

    // ------------------- Check if the user has administrator permissions -------------------
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '⛔ You do not have permission to use this command.', ephemeral: true });
    }

    // ------------------- Validate timezone -------------------
    if (!moment.tz.zone(timezone)) {
      return interaction.reply({ content: '❌ Invalid timezone. Please provide a valid timezone identifier (e.g., America/New_York).', ephemeral: true });
    }

    try {
      // ------------------- Connect to the Tinglebot database -------------------
      await connectToTinglebot();

      // ------------------- Update settings with the new channel and timezone -------------------
      await Settings.updateOne(
        { guildId: interaction.guild.id },
        { $set: { birthdayChannel: channel.id, timezone } },
        { upsert: true }
      );

      // ------------------- Reply to the interaction with a confirmation message -------------------
      await interaction.reply({ content: `🎉 Birthday announcements will be posted in ${channel} with timezone **${timezone}**.`, ephemeral: true });

    } catch (error) {
      // ------------------- Handle any errors that occur during execution -------------------
      await interaction.reply({ content: '❌ There was an error setting up birthday announcements. Please try again.', ephemeral: true });
    }
  }
};

