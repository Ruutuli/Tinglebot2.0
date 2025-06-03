// ------------------- Import Section: Grouped based on standard and local modules -------------------
// Standard libraries (Discord.js builders)
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');

// Local modules (blight handlers)
const { 
  rollForBlightProgression, 
  healBlight, 
  submitHealingTask, 
  viewBlightHistory,
  validateCharacterOwnership,
  loadBlightSubmissions
} = require('../../handlers/blightHandler');
const { fetchCharacterByNameAndUserId, getCharacterBlightHistory } = require('../../database/db.js');
const { getModCharacterByName } = require('../../modules/modCharacters');
const { retrieveBlightRequestFromStorage } = require('../../utils/storage');
const Character = require('../../models/CharacterModel');

// ------------------- Define the Blight Command -------------------
// This command manages blight progression, healing, and submission of healing tasks.
module.exports = {
  // ------------------- Set up the slash command with subcommands -------------------
  data: new SlashCommandBuilder()
    .setName('blight')
    .setDescription('Manage blight progression, healing, and submissions.')

    // ------------------- Subcommand: Roll for blight progression -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('roll')
        .setDescription('Roll for blight progression for a specific character')
        .addStringOption(option =>
          option.setName('character_name')
            .setDescription('The name of the character to roll for blight progression')
            .setRequired(true)
            .setAutocomplete(true)))
    // ------------------- Subcommand: Heal a character from blight -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('heal')
        .setDescription('Request blight healing from a Mod Character')
        .addStringOption(option =>
          option.setName('character_name')
            .setDescription('The name of the character to heal from blight')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('healer_name')
            .setDescription('Select the healer performing the healing')
            .setRequired(true)
            .addChoices(
              { name: 'Aemu - Rudania', value: 'Aemu' },
              { name: 'Darune - Rudania', value: 'Darune' },
              { name: 'Elde - Vhintl', value: 'Elde' },
              { name: 'Foras - Vhintl', value: 'Foras' },
              { name: 'Ginger - Vhintl', value: 'Ginger-Sage' },
              { name: 'Korelii - Inariko', value: 'Korelii' },
              { name: 'Nihme - Inariko', value: 'Nihme' },
              { name: 'Sahira - Rudania', value: 'Sahira' },
              { name: 'Sanskar - Inariko', value: 'Sanskar' },
              { name: 'Sigrid - Inariko', value: 'Sigrid' }
            )))

    // ------------------- Subcommand: Submit a completed task for blight healing -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('submit')
        .setDescription('Submit a completed task for healing a character from blight')
        .addStringOption(option =>
          option.setName('submission_id')
            .setDescription('The submission ID you received when the task was assigned')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('item')
            .setDescription('The item you are offering for healing (if required)')
            .setAutocomplete(true)
            .setRequired(false))
        .addStringOption(option =>
          option.setName('link')
            .setDescription('Provide the link to your writing or art submission (if required)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('tokens')
            .setDescription('Forfeit all tokens in exchange for healing')
            .setRequired(false)))

    // ------------------- Subcommand: View blight history -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('history')
        .setDescription('View the blight history for a character')
        .addStringOption(option =>
          option.setName('character_name')
            .setDescription('The name of the character to view blight history for')
            .setRequired(true)
            .setAutocomplete(true))
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of history entries to show (default: 10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25)))

    // ------------------- Subcommand: View blighted roster -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('roster')
        .setDescription('View a list of all currently blighted characters')
        .addBooleanOption(option =>
          option.setName('show_expired')
            .setDescription('Include expired healing requests (default: false)')
            .setRequired(false))),

  // ------------------- Command Execution Logic -------------------
  async execute(interaction) {
    const communityBoardChannelId = process.env.COMMUNITY_BOARD;

    // Check if the command is executed in the Community Board channel
    if (interaction.channelId !== communityBoardChannelId) {
      await interaction.reply({
        content: `❌ This command can only be used in the Community Board channel. Please go to <#${communityBoardChannelId}> to use this command.`,
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'roll') {
      const characterName = interaction.options.getString('character_name');
      const character = await validateCharacterOwnership(interaction, characterName);
      if (!character) return;
      
      await interaction.deferReply();
      await rollForBlightProgression(interaction, characterName);
    
    } else if (subcommand === 'heal') {
      const characterName = interaction.options.getString('character_name');
      const character = await validateCharacterOwnership(interaction, characterName);
      if (!character) return;
      
      const healerName = interaction.options.getString('healer_name');
      await healBlight(interaction, characterName, healerName);
        
    } else if (subcommand === 'submit') {
      const submissionId = interaction.options.getString('submission_id');
      const item = interaction.options.getString('item');
      const link = interaction.options.getString('link');
      const tokens = interaction.options.getBoolean('tokens');
      await submitHealingTask(interaction, submissionId, item, link, tokens);
      
    } else if (subcommand === 'history') {
      await interaction.deferReply();
      const characterName = interaction.options.getString('character_name');
      const character = await validateCharacterOwnership(interaction, characterName);
      if (!character) return;
      
      const limit = interaction.options.getInteger('limit') || 10;
      await viewBlightHistory(interaction, characterName, limit);

    } else if (subcommand === 'roster') {
      await interaction.deferReply();
      
      try {
        // Get all blighted characters
        const blightedCharacters = await Character.find({ blighted: true });
        
        if (blightedCharacters.length === 0) {
          await interaction.editReply({
            content: '✅ There are currently no blighted characters in the world.',
            ephemeral: true
          });
          return;
        }

        // Get all blight submissions
        const blightSubmissions = await loadBlightSubmissions();
        const showExpired = interaction.options.getBoolean('show_expired') || false;

        // Group characters by village
        const charactersByVillage = blightedCharacters.reduce((acc, char) => {
          const village = char.currentVillage || 'Unknown Village';
          if (!acc[village]) {
            acc[village] = [];
          }
          acc[village].push(char);
          return acc;
        }, {});

        // Create the main embed
        const embed = new EmbedBuilder()
          .setColor('#AD1457')
          .setTitle('📋 Blighted Characters Roster')
          .setDescription(`Total Blighted Characters: ${blightedCharacters.length}`)
          .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
          .setFooter({ text: 'Blighted Characters Roster' })
          .setTimestamp();

        // Add fields for each village
        for (const [village, characters] of Object.entries(charactersByVillage)) {
          let villageField = '';
          
          for (const char of characters) {
            // Get submission status
            const submission = Object.values(blightSubmissions).find(
              sub => sub.characterName === char.name && 
              (showExpired ? true : sub.status === 'pending')
            );

            // Get stage emoji
            const stageEmoji = char.blightStage === 5 ? '☠️' : 
                             char.blightStage === 4 ? '💀' :
                             char.blightStage === 3 ? '👻' :
                             char.blightStage === 2 ? '🎯' : '⚠️';

            // Format character info
            villageField += `${stageEmoji} **${char.name}** - Stage ${char.blightStage}\n`;
            
            if (submission) {
              const status = submission.status === 'pending' ? '🔄' : '⏰';
              const timeLeft = submission.status === 'pending' ? 
                `(<t:${Math.floor(new Date(submission.expiresAt).getTime() / 1000)}:R>)` : 
                '(Expired)';
              villageField += `└ ${status} Pending healing from **${submission.healerName}** ${timeLeft}\n`;
            }

            if (char.blightStage === 5 && char.deathDeadline) {
              villageField += `└ ⚰️ Death deadline: <t:${Math.floor(char.deathDeadline.getTime() / 1000)}:R>\n`;
            }

            villageField += '\n';
          }

          // Split field if too long
          if (villageField.length > 1024) {
            const chunks = villageField.match(/.{1,1024}/g) || [];
            for (let i = 0; i < chunks.length; i++) {
              embed.addFields({
                name: i === 0 ? `🏰 ${village}` : `${village} (continued)`,
                value: chunks[i]
              });
            }
          } else {
            embed.addFields({
              name: `🏰 ${village}`,
              value: villageField
            });
          }
        }

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('[blight.js]: ❌ Error fetching blighted roster:', error);
        await interaction.editReply({
          content: '❌ An error occurred while fetching the blighted roster.',
          ephemeral: true
        });
      }
    }
  }
};
