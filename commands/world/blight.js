// ------------------- Import Section: Grouped based on standard and local modules -------------------
// Standard libraries (Discord.js builders)
const { SlashCommandBuilder } = require('@discordjs/builders');

const { handleError } = require('../../utils/globalErrorHandler');
// Local modules (blight handlers)
const { rollForBlightProgression, healBlight, submitHealingTask } = require('../../handlers/blightHandler');

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
            .setAutocomplete(true)) // Enable autocomplete for this option
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
            .setAutocomplete(true) // Enable autocomplete here
            .setRequired(false))
        .addStringOption(option =>
          option.setName('link')
            .setDescription('Provide the link to your writing or art submission (if required)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('tokens')
            .setDescription('Forfeit all tokens in exchange for healing')
            .setRequired(false))
    ),

  // ------------------- Command Execution Logic -------------------
  async execute(interaction) {
    const communityBoardChannelId = process.env.COMMUNITY_BOARD; // Fetch the Community Board ID from the environment variables

    // Check if the command is executed in the Community Board channel
    if (interaction.channelId !== communityBoardChannelId) {
      await interaction.reply({
        content: `❌ This command can only be used in the Community Board channel. Please go to <#${communityBoardChannelId}> to use this command.`,
        ephemeral: true, // Show the message only to the user who attempted the command
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'roll') {
      const characterName = interaction.options.getString('character_name'); // Fetch the character name
      await rollForBlightProgression(interaction, characterName); // Validate and execute the roll
    
    } else if (subcommand === 'heal') {
      const characterName = interaction.options.getString('character_name');
      const healerName = interaction.options.getString('healer_name');
      await healBlight(interaction, characterName, healerName);  

    } else if (subcommand === 'submit') {
      const submissionId = interaction.options.getString('submission_id');
      const item = interaction.options.getString('item'); // Get the item, if submitted
      const link = interaction.options.getString('link'); // Get the writing or art link, if submitted
      const tokens = interaction.options.getBoolean('tokens'); // Check if tokens forfeit option was selected
      await submitHealingTask(interaction, submissionId, item, link, tokens); // Pass all the inputs to the submit function
    }
  }
};
