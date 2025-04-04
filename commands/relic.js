//  relic.js

// ------------------- Third-Party Imports -------------------
const { SlashCommandBuilder } = require('discord.js');

// ------------------- Local Module Imports -------------------
// Importing relic service functions for database operations.
const { 
  createRelic, 
  fetchRelicsByCharacter, 
  appraiseRelic, 
  archiveRelic, 
  markRelicDeteriorated, 
  fetchRelicById, 
  fetchArchivedRelics 
} = require('../database/relicService');

// ------------------- Command Definition -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('relic')
    .setDescription('📜 Manage Relics discovered during exploration.')
    .addSubcommand(sub =>
      sub.setName('discover')
        .setDescription('Log a new relic discovery tied to a character')
        .addStringOption(opt =>
          opt.setName('character').setDescription('Name of the character').setRequired(true))
        .addStringOption(opt =>
          opt.setName('location').setDescription('Where it was found (optional)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('appraise')
        .setDescription('Appraise a relic')
        .addStringOption(opt =>
          opt.setName('relic_id').setDescription('Relic ID').setRequired(true))
        .addStringOption(opt =>
          opt.setName('appraiser').setDescription('Name of the appraising character').setRequired(true))
        .addStringOption(opt =>
          opt.setName('description').setDescription('Description after appraisal').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('submitart')
        .setDescription('Submit final relic art')
        .addStringOption(opt =>
          opt.setName('relic_id').setDescription('Relic ID').setRequired(true))
        .addStringOption(opt =>
          opt.setName('image_url').setDescription('PNG image URL').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('archive')
        .setDescription('Archive a relic (mod only)')
        .addStringOption(opt =>
          opt.setName('relic_id').setDescription('Relic ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('View a relic by ID or character')
        .addStringOption(opt =>
          opt.setName('relic_id').setDescription('Relic ID').setRequired(false))
        .addStringOption(opt =>
          opt.setName('character').setDescription('Character who discovered it').setRequired(false))
    ),

  // ------------------- Command Execution -------------------
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      // ------------------- Relic Discovery -------------------
      if (sub === 'discover') {
        const character = interaction.options.getString('character');
        const location = interaction.options.getString('location') || 'Unknown';

        // Create a new relic entry with discovery details.
        const relic = await createRelic({ 
          name: 'Unappraised Relic', 
          discoveredBy: character, 
          locationFound: location 
        });
        return interaction.reply(`🗺️ **Relic discovered!** ID: \`${relic._id}\``);

      // ------------------- Relic Appraisal -------------------
      } else if (sub === 'appraise') {
        const relicId = interaction.options.getString('relic_id');
        const appraiser = interaction.options.getString('appraiser');
        const description = interaction.options.getString('description');

        // Update relic with appraisal details.
        const relic = await appraiseRelic(relicId, appraiser, description);
        if (!relic) return interaction.reply({ content: '❌ Relic not found.', ephemeral: true });

        return interaction.reply(`📜 **Relic appraised by ${appraiser}**!\n> ${description}`);

      // ------------------- Relic Art Submission -------------------
      } else if (sub === 'submitart') {
        const relicId = interaction.options.getString('relic_id');
        const imageUrl = interaction.options.getString('image_url');

        // Archive relic after art submission.
        const relic = await archiveRelic(relicId, imageUrl);
        if (!relic) return interaction.reply({ content: '❌ Relic not found.', ephemeral: true });

        return interaction.reply(`🖼️ **Art submitted and archived!** View: ${imageUrl}`);

      // ------------------- Manual Archiving (Mod Only) -------------------
      } else if (sub === 'archive') {
        const relicId = interaction.options.getString('relic_id');
        // Archive relic (assuming art has already been submitted).
        const relic = await archiveRelic(relicId, '');
        return interaction.reply(`📚 **Relic archived.** ID: \`${relicId}\``);

      // ------------------- Retrieve Relic Information -------------------
      } else if (sub === 'info') {
        const relicId = interaction.options.getString('relic_id');
        const character = interaction.options.getString('character');
        let results = [];

        if (relicId) {
          const relic = await fetchRelicById(relicId);
          if (!relic) return interaction.reply({ content: '❌ No relic found by that ID.', ephemeral: true });
          results = [relic];
        } else if (character) {
          results = await fetchRelicsByCharacter(character);
          if (results.length === 0) return interaction.reply({ content: `❌ No relics found for **${character}**.`, ephemeral: true });
        } else {
          return interaction.reply({ content: '❌ Please provide either a relic ID or character name.', ephemeral: true });
        }

        // Construct embeds to display relic details.
        const embeds = results.map(r => ({
          title: `${r.name} (\`${r._id}\`)`,
          description: r.appraised ? r.appraisalDescription : '*Not appraised yet*',
          fields: [
            { name: 'Discovered By', value: r.discoveredBy, inline: true },
            { name: 'Location', value: r.locationFound || 'Unknown', inline: true },
            { name: 'Appraised By', value: r.appraisedBy || '—', inline: true },
            { name: 'Art Submitted', value: r.artSubmitted ? '✅' : '❌', inline: true },
            { name: 'Archived', value: r.archived ? '✅' : '❌', inline: true },
            { name: 'Deteriorated', value: r.deteriorated ? '⚠️ Yes' : 'No', inline: true },
          ]
        }));

        return interaction.reply({ embeds });

      // ------------------- Unknown Subcommand -------------------
      } else {
        return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
      }
    } catch (error) {
      console.error('[relic.js]: ❌ Error executing relic command:', error);
      return interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
    }
  }
};
