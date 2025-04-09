// ============================================================================
// Discord.js Components
// ============================================================================
// ------------------- Import SlashCommandBuilder from discord.js -------------------
const { SlashCommandBuilder } = require('discord.js');

// ============================================================================
// Database Services (Local Modules)
// ============================================================================
// ------------------- Import Database Service functions for Relic operations -------------------
// Removed unused fetchRelicsByCharacter.
const { 
  fetchRelicById, 
  archiveRelic, 
  appraiseRelic,
  createRelic
} = require('../database/relicService');

// ============================================================================
// Utility Functions (Local Modules)
// ============================================================================
// ------------------- Import utility function to generate unique IDs -------------------
const { generateUniqueId } = require('../utils/uniqueIdUtils');
// ------------------- Import utility functions for submission storage operations -------------------
const { saveSubmissionToStorage, retrieveSubmissionFromStorage, deleteSubmissionFromStorage } = require('../utils/storage.js');

// ============================================================================
// Command Definition for Relic Operations
// ============================================================================
// ------------------- Define the /relic command and its subcommands -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('relic')
    .setDescription('📜 Manage Relic Appraisals and Archival')

    // ------------------- /relic info: View info on an appraised relic -------------------
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('View info on an appraised relic')
        .addStringOption(opt =>
          opt.setName('relic_id')
            .setDescription('Relic ID')
            .setRequired(true))
    )

    // ------------------- /relic submit: Submit an appraised relic to the archives -------------------
    .addSubcommand(sub =>
      sub.setName('submit')
        .setDescription('Submit an appraised relic to the archives')
        .addStringOption(opt =>
          opt.setName('relic_id')
            .setDescription('Appraised Relic ID')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('image_url')
            .setDescription('PNG image URL for the relic (must be 1:1 and at least 500x500)')
            .setRequired(true))
    )

    // ------------------- /relic appraisalrequest: Request appraisal for a found relic -------------------
    .addSubcommand(sub =>
      sub.setName('appraisalrequest')
        .setDescription('Request appraisal for a found relic (Discovery is via /explore – integration pending)')
        .addStringOption(opt =>
          opt.setName('character')
            .setDescription('Name of the relic owner')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(opt =>
          opt.setName('relic_id')
            .setDescription('ID of the relic to be appraised')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('appraiser')
            .setDescription('Name of the intended appraiser')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(opt =>
          opt.setName('payment')
            .setDescription('Payment offered for appraisal')
            .setRequired(true))
    )

    // ------------------- /relic appraisalaccept: Accept an appraisal request and process appraisal -------------------
    .addSubcommand(sub =>
      sub.setName('appraisalaccept')
        .setDescription('Accept an appraisal request and process appraisal (automatic table roll)')
        .addStringOption(opt =>
          opt.setName('appraiser')
            .setDescription('Name of the appraiser (must match request)')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(opt =>
          opt.setName('appraisal_id')
            .setDescription('ID of the appraisal request to accept')
            .setRequired(true))
    )

    // ------------------- /relic test: Assign a random unappraised relic to a character for testing -------------------
    .addSubcommand(sub =>
      sub.setName('test')
        .setDescription('Test: Assign a random unappraised relic to a character')
        .addStringOption(opt =>
          opt.setName('character')
            .setDescription('Name of the character')
            .setRequired(true))
    ),

  // ============================================================================
  // Command Execution Handler for Relic Operations
  // ============================================================================
  async execute(interaction) {
    // ------------------- Determine which subcommand was invoked -------------------
    const sub = interaction.options.getSubcommand();

    try {
      // ------------------------------------------------------------------------
      // /relic test: Assign a random unappraised relic to a character for testing
      // ------------------------------------------------------------------------
      if (sub === 'test') {
        await interaction.deferReply(); // Defer reply to prevent timeout.

        // ------------------- Generate a random location for relic discovery -------------------
        const character = interaction.options.getString('character');
        const locations = ['Forgotten Ruins', 'Ancient Forest', 'Mysterious Cave', 'Abandoned Temple'];
        const randomLocation = locations[Math.floor(Math.random() * locations.length)];

        // ------------------- Create relic data object with provided details -------------------
        const relicData = {
          name: 'Unappraised Relic',
          discoveredBy: character,
          locationFound: randomLocation,
          discoveredDate: new Date()
        };

        // ------------------- Save the new relic to the database -------------------
        const relic = await createRelic(relicData);
        return interaction.editReply(`🗺️ **Test Relic Given to ${character}!**
> **Relic ID:** \`${relic._id}\`
> **Location:** ${randomLocation}

*You can now use /relic appraisalrequest to request its appraisal.*`);
      }
      // ------------------------------------------------------------------------
      // /relic info: View information on an appraised relic
      // ------------------------------------------------------------------------
      else if (sub === 'info') {
        const relicId = interaction.options.getString('relic_id');
        const relic = await fetchRelicById(relicId);
        if (!relic) {
          return interaction.reply({ content: '❌ No relic found by that ID.', ephemeral: true });
        }
        if (!relic.appraised) {
          return interaction.reply({ content: '❌ This relic has not been appraised yet.', ephemeral: true });
        }
        // ------------------- Construct an embed message with relic details -------------------
        const embed = {
          title: `${relic.name} (\`${relic._id}\`)`,
          description: relic.appraisalDescription,
          fields: [
            { name: 'Discovered By', value: relic.discoveredBy, inline: true },
            { name: 'Location', value: relic.locationFound || 'Unknown', inline: true },
            { name: 'Appraised By', value: relic.appraisedBy || '—', inline: true },
            { name: 'Art Submitted', value: relic.artSubmitted ? '✅' : '❌', inline: true },
            { name: 'Archived', value: relic.archived ? '✅' : '❌', inline: true },
            { name: 'Deteriorated', value: relic.deteriorated ? '⚠️ Yes' : 'No', inline: true },
          ]
        };
        return interaction.reply({ embeds: [embed] });
      }
      // ------------------------------------------------------------------------
      // /relic submit: Submit an appraised relic to the archives
      // ------------------------------------------------------------------------
      else if (sub === 'submit') {
        const relicId = interaction.options.getString('relic_id');
        const imageUrl = interaction.options.getString('image_url');
        const relic = await fetchRelicById(relicId);
        if (!relic) {
          return interaction.reply({ content: '❌ Relic not found.', ephemeral: true });
        }
        if (!relic.appraised) {
          return interaction.reply({ content: '❌ Only appraised relics can be submitted to the archives.', ephemeral: true });
        }
        if (relic.archived) {
          return interaction.reply({ content: '❌ This relic has already been submitted to the archives.', ephemeral: true });
        }
        // ------------------- Archive the relic with the provided image URL -------------------
        const updatedRelic = await archiveRelic(relicId, imageUrl);
        if (!updatedRelic) {
          return interaction.reply({ content: '❌ Failed to update the relic.', ephemeral: true });
        }
        return interaction.reply(`🖼️ **Relic submitted to the archives!** View: ${imageUrl}`);
      }
      // ------------------------------------------------------------------------
      // /relic appraisalrequest: Request appraisal for a found relic
      // ------------------------------------------------------------------------
      else if (sub === 'appraisalrequest') {
        await interaction.deferReply(); // Defer reply to prevent timeout.

        // ------------------- Retrieve options and generate a unique appraisal request -------------------
        const character = interaction.options.getString('character');
        const relicId = interaction.options.getString('relic_id');
        const appraiser = interaction.options.getString('appraiser');
        const payment = interaction.options.getString('payment');
        const appraisalId = generateUniqueId('A');

        // ------------------- Build appraisal request data object -------------------
        const appraisalData = {
          type: "appraisalRequest",
          character,
          relic_id: relicId,
          appraiser,
          payment,
          createdAt: Date.now()
        };

        // ------------------- Save the appraisal request to persistent storage -------------------
        saveSubmissionToStorage(appraisalId, appraisalData);

        return interaction.editReply(`📜 Appraisal request created!
> **Appraisal ID:** \`${appraisalId}\`
> Owner: **${character}**
> Intended Appraiser: **${appraiser}**
> Payment: **${payment}**

*(Note: Discovery is handled by /explore – integration pending.)*`);
      }
      // ------------------------------------------------------------------------
      // /relic appraisalaccept: Accept an appraisal request and process appraisal with automatic table roll
      // ------------------------------------------------------------------------
      else if (sub === 'appraisalaccept') {
        await interaction.deferReply(); // Defer reply to prevent timeout.

        // ------------------- Retrieve provided appraiser name and appraisal request ID -------------------
        const providedAppraiser = interaction.options.getString('appraiser');
        const appraisalId = interaction.options.getString('appraisal_id');

        // ------------------- Retrieve the appraisal request from persistent storage -------------------
        const request = retrieveSubmissionFromStorage(appraisalId);
        if (!request) {
          return interaction.editReply({ content: `❌ No appraisal request found with ID \`${appraisalId}\`.`, ephemeral: true });
        }

        // ------------------- Validate appraiser name with a case-insensitive check -------------------
        if (request.appraiser.toLowerCase() !== providedAppraiser.toLowerCase()) {
          return interaction.editReply({ content: `❌ Appraiser mismatch. This request is assigned to **${request.appraiser}**.`, ephemeral: true });
        }

        // ------------------- Execute automatic table roll to determine appraisal outcome -------------------
        const outcomes = [
          'a blank',
          'an ancient scroll',
          'a mystical amulet',
          'a weathered coin'
        ];
        const randomOutcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        const autoDescription = `Item appraised! It's ${randomOutcome}!`;

        // ------------------- Update the relic with appraisal details and outcome -------------------
        const updatedRelic = await appraiseRelic(request.relic_id, providedAppraiser, autoDescription, randomOutcome);
        if (!updatedRelic) {
          return interaction.editReply({ content: '❌ Failed to update relic appraisal. Please check the relic ID.', ephemeral: true });
        }

        // ------------------- Remove the processed appraisal request from storage -------------------
        deleteSubmissionFromStorage(appraisalId);

        return interaction.editReply(`📜 **Relic appraised by ${providedAppraiser}!**
> ${autoDescription}
> **Relic ID:** \`${request.relic_id}\``);
      }
      // ------------------------------------------------------------------------
      // Unknown subcommand: Respond when an invalid subcommand is used
      // ------------------------------------------------------------------------
      else {
        return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
      }
    } catch (error) {
      // ------------------- Log errors with file identifier and return a generic error message -------------------
      console.error('[relic.js]: ❌ Error executing relic command:', error);
      return interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
    }
  }
};
