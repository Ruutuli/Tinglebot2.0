// ------------------- Import Section: Grouped based on standard and local modules -------------------
// Standard libraries (Discord.js builders)
const { SlashCommandBuilder } = require('@discordjs/builders');

// Local modules (blight handlers)
const { 
  rollForBlightProgression, 
  healBlight, 
  submitHealingTask, 
  viewBlightHistory,
  validateCharacterOwnership 
} = require('../../handlers/blightHandler');
const { fetchCharacterByNameAndUserId, getCharacterBlightHistory } = require('../../database/db.js');
const { getModCharacterByName } = require('../../modules/modCharacters');
const { retrieveBlightRequestFromStorage } = require('../../utils/storage');

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
            .setAutocomplete(true))
    )
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
            .setMaxValue(25))),

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
      const characterName = interaction.options.getString('character_name');
      const character = await validateCharacterOwnership(interaction, characterName);
      if (!character) return;
      
      const limit = interaction.options.getInteger('limit') || 10;
      await viewBlightHistory(interaction, characterName, limit);
    }
  },

  // ============================================================================
  // ---- Autocomplete Handler for /blight submit item ----
  // Suggests valid items for the healer and character for the current submission.
  // ============================================================================

  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      if (interaction.options.getSubcommand() !== 'submit' || focusedOption.name !== 'item') return;
      const submissionId = interaction.options.getString('submission_id');
      if (!submissionId) return interaction.respond([]);
      const submission = await retrieveBlightRequestFromStorage(submissionId);
      if (!submission) return interaction.respond([]);
      if (submission.taskType !== 'item') return interaction.respond([]);
      const healer = getModCharacterByName(submission.healerName);
      if (!healer) return interaction.respond([]);
      const healingItems = healer.getHealingRequirements(submission.characterName)
        .find((req) => req.type === 'item').items;
      const input = focusedOption.value?.toLowerCase() || '';
      const choices = healingItems
        .map(i => `${i.name} x${i.quantity}`)
        .filter(str => str.toLowerCase().includes(input))
        .slice(0, 25)
        .map(str => ({ name: str, value: str }));
      await interaction.respond(choices);
    } catch (err) {
      await interaction.respond([]);
    }
  }
};
