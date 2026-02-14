// ============================================================================
// ------------------- Relic Command -------------------
// Manages relic appraisals, reveal (replaces /tableroll relic), and archival.
// ============================================================================

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const {
  fetchRelicById,
  fetchRelicsByCharacter,
  appraiseRelic,
  archiveRelic,
  fetchCharacterByName,
  fetchCharacterByNameAndUserId,
  fetchAnyCharacterByNameAndUserId,
  getOrCreateToken,
  updateTokenBalance,
} = require('@/database/db.js');
const { updateCurrentStamina } = require('../../modules/characterStatsModule.js');
const { rollRelicOutcome } = require('@/utils/relicUtils.js');
const RelicModel = require('@/models/RelicModel.js');
const RelicAppraisalRequest = require('@/models/RelicAppraisalRequestModel.js');
const Character = require('@/models/CharacterModel.js');
const ModCharacter = require('@/models/ModCharacterModel.js');

function normalizeVillage(v) {
  return (v || '').trim().toLowerCase();
}

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('relic')
    .setDescription('Manage relic appraisals, reveal outcomes, and archival')

    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List relics discovered by a character')
        .addStringOption(opt =>
          opt.setName('character').setDescription('Character who discovered the relics').setRequired(true).setAutocomplete(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('View info on an appraised relic')
        .addStringOption(opt =>
          opt.setName('relic_id').setDescription('Relic ID (e.g. R12345 or MongoDB _id)').setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('reveal')
        .setDescription('Reveal what relic was found (after mod-approved appraisal)')
        .addStringOption(opt =>
          opt.setName('relic_id').setDescription('Relic ID to reveal').setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('submit')
        .setDescription('Submit art for an appraised relic to the archives')
        .addStringOption(opt =>
          opt.setName('relic_id').setDescription('Appraised Relic ID').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('image_url').setDescription('PNG image URL (1:1, min 500x500, transparent bg)').setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('appraisal-request')
        .setDescription('Request appraisal for a found relic')
        .addStringOption(opt =>
          opt.setName('character').setDescription('Character who found the relic').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('relic_id').setDescription('Relic ID (e.g. R12345)').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('appraiser').setDescription('PC Artist/Researcher or NPC').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('payment').setDescription('Payment offered (from inventory)').setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('appraisal-accept')
        .setDescription('Accept an appraisal request (Artist/Researcher in Inariko; costs 3 stamina)')
        .addStringOption(opt =>
          opt.setName('appraiser').setDescription('Your character (appraiser)').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('request_id').setDescription('Appraisal request ID (MongoDB _id)').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('description').setDescription('Appraisal description of the relic').setRequired(true)
        )
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (Date.now() - interaction.createdTimestamp > 2500) {
        return interaction.reply({ content: '❌ Interaction expired. Please try again.', ephemeral: true });
      }

      const deferSubs = ['list', 'reveal', 'submit', 'appraisal-request', 'appraisal-accept'];
      if (deferSubs.includes(sub)) {
        await interaction.deferReply();
      }

      // ------------------- /relic list -------------------
      if (sub === 'list') {
        const characterName = interaction.options.getString('character');
        const relics = await fetchRelicsByCharacter(characterName);
        if (!relics || relics.length === 0) {
          return interaction.editReply({ content: `❌ No relics found for **${characterName}**.` });
        }
        const lines = relics.map(r => {
          const id = r.relicId || r._id;
          const status = r.deteriorated ? '⚠️ Deteriorated' : r.archived ? '✅ Archived' : r.appraised ? (r.rollOutcome ? '🎲 Revealed' : '⏳ Awaiting reveal') : '🔸 Unappraised';
          return `• \`${id}\` — ${status}${r.rollOutcome ? ` — **${r.rollOutcome}**` : ''}`;
        });
        const embed = new EmbedBuilder()
          .setTitle(`📜 Relics: ${characterName}`)
          .setDescription(lines.join('\n'))
          .setColor(0xe67e22);
        return interaction.editReply({ embeds: [embed] });
      }

      // ------------------- /relic info -------------------
      if (sub === 'info') {
        const relicId = interaction.options.getString('relic_id');
        const relic = await fetchRelicById(relicId);
        if (!relic) {
          return interaction.reply({ content: '❌ No relic found by that ID.', ephemeral: true });
        }
        if (!relic.appraised) {
          return interaction.reply({ content: '❌ This relic has not been appraised yet.', ephemeral: true });
        }
        const embed = new EmbedBuilder()
          .setTitle(`${relic.rollOutcome || relic.name} (\`${relic.relicId || relic._id}\`)`)
          .setDescription(relic.appraisalDescription || 'No description.')
          .addFields(
            { name: 'Discovered By', value: relic.discoveredBy || '—', inline: true },
            { name: 'Location', value: relic.locationFound || 'Unknown', inline: true },
            { name: 'Appraised By', value: relic.appraisedBy || '—', inline: true },
            { name: 'Art Submitted', value: relic.artSubmitted ? '✅' : '❌', inline: true },
            { name: 'Archived', value: relic.archived ? '✅' : '❌', inline: true },
            { name: 'Deteriorated', value: relic.deteriorated ? '⚠️ Yes' : 'No', inline: true }
          )
          .setColor(0xe67e22);
        return (interaction.deferred ? interaction.editReply : interaction.reply).call(interaction, { embeds: [embed] });
      }

      // ------------------- /relic reveal -------------------
      if (sub === 'reveal') {
        const relicId = interaction.options.getString('relic_id');
        const relic = await fetchRelicById(relicId);
        if (!relic) {
          return interaction.editReply({ content: '❌ No relic found by that ID.' });
        }
        if (!relic.appraised) {
          return interaction.editReply({ content: '❌ This relic must be appraised before you can reveal it.' });
        }
        if (relic.rollOutcome) {
          return interaction.editReply({ content: `❌ This relic has already been revealed: **${relic.rollOutcome}**` });
        }
        if (relic.archived || relic.deteriorated) {
          return interaction.editReply({ content: '❌ This relic cannot be revealed (archived or deteriorated).' });
        }

        const char = await fetchCharacterByNameAndUserId(relic.discoveredBy, interaction.user.id) ||
          await (async () => {
            const mod = await ModCharacter.findOne({ name: new RegExp(`^${relic.discoveredBy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
            return mod && String(mod.userId) === interaction.user.id ? mod : null;
          })();
        if (!char) {
          return interaction.editReply({ content: '❌ Only the owner of the character who found this relic can reveal it.' });
        }

        const isAlreadyDiscovered = async (relicName) => {
          const existing = await RelicModel.findOne({ rollOutcome: relicName });
          return !!existing;
        };

        const result = await rollRelicOutcome({ isArchived: isAlreadyDiscovered });
        const { outcome, isDuplicate } = result;

        const updateData = {
          name: outcome.name,
          rollOutcome: outcome.name,
          appraisalDescription: relic.appraisalDescription || outcome.description,
        };
        if (isDuplicate) {
          const existingArchived = await RelicModel.findOne({ rollOutcome: outcome.name, archived: true });
          if (existingArchived) {
            updateData.duplicateOf = existingArchived._id;
            updateData.artSubmitted = true;
            updateData.archived = true;
          }
        }

        await RelicModel.findByIdAndUpdate(relic._id, updateData);

        const embed = new EmbedBuilder()
          .setTitle(`🔸 Relic Revealed: ${outcome.name}`)
          .setDescription(outcome.description)
          .addFields(
            { name: 'Relic', value: outcome.name, inline: true },
            { name: 'Duplicate?', value: isDuplicate ? 'Yes (no art required)' : 'No', inline: true },
            { name: 'Next Step', value: isDuplicate ? 'Relic submitted as duplicate.' : 'Provide art and use `/relic submit` to archive.', inline: false }
          )
          .setColor(0xe67e22);
        return interaction.editReply({ embeds: [embed] });
      }

      // ------------------- /relic submit -------------------
      if (sub === 'submit') {
        const relicId = interaction.options.getString('relic_id');
        const imageUrl = interaction.options.getString('image_url');
        const relic = await fetchRelicById(relicId);
        if (!relic) {
          return interaction.editReply({ content: '❌ Relic not found.' });
        }
        if (!relic.appraised) {
          return interaction.editReply({ content: '❌ Only appraised relics can be submitted.' });
        }
        if (!relic.rollOutcome) {
          return interaction.editReply({ content: '❌ Reveal the relic first with `/relic reveal`.' });
        }
        if (relic.archived) {
          return interaction.editReply({ content: '❌ This relic has already been submitted to the archives.' });
        }

        const char = await fetchCharacterByNameAndUserId(relic.discoveredBy, interaction.user.id) ||
          await ModCharacter.findOne({ name: new RegExp(`^${relic.discoveredBy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
            .then(m => m && String(m.userId) === interaction.user.id ? m : null);
        if (!char) {
          return interaction.editReply({ content: '❌ Only the owner of the character who found this relic can submit it.' });
        }

        const updated = await archiveRelic(relicId, imageUrl);
        if (!updated) {
          return interaction.editReply({ content: '❌ Failed to archive the relic.' });
        }
        return interaction.editReply({ content: `🖼️ **Relic submitted to the archives!** [View image](${imageUrl})` });
      }

      // ------------------- /relic appraisal-request -------------------
      if (sub === 'appraisal-request') {
        const characterName = interaction.options.getString('character');
        const relicId = interaction.options.getString('relic_id');
        const appraiser = interaction.options.getString('appraiser');
        const payment = interaction.options.getString('payment') || '';

        const relic = await fetchRelicById(relicId);
        if (!relic) {
          return interaction.editReply({ content: '❌ Relic not found.' });
        }
        if (relic.appraised) {
          return interaction.editReply({ content: '❌ This relic has already been appraised.' });
        }
        if (relic.deteriorated) {
          return interaction.editReply({ content: '❌ This relic has deteriorated and cannot be appraised.' });
        }
        if (relic.discoveredBy !== characterName) {
          return interaction.editReply({ content: `❌ This relic was discovered by **${relic.discoveredBy}**, not ${characterName}.` });
        }

        const finderChar = await fetchCharacterByNameAndUserId(characterName, interaction.user.id) ||
          await ModCharacter.findOne({ name: new RegExp(`^${characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
            .then(m => m && String(m.userId) === interaction.user.id ? m : null);
        if (!finderChar) {
          return interaction.editReply({ content: '❌ You must own the character who found the relic.' });
        }

        const npcAppraisal = appraiser.trim().toLowerCase() === 'npc';
        if (npcAppraisal) {
          const user = await getOrCreateToken(interaction.user.id);
          const balance = user?.tokens ?? 0;
          if (balance < 500) {
            return interaction.editReply({ content: '❌ NPC appraisal costs 500 tokens. You do not have enough. Mod will deduct when approving on dashboard.' });
          }
        }

        const existing = await RelicAppraisalRequest.findOne({
          relicMongoId: relic._id,
          status: 'pending',
        });
        if (existing) {
          return interaction.editReply({ content: '❌ An appraisal request for this relic is already pending.' });
        }

        const request = new RelicAppraisalRequest({
          relicId: relic.relicId || String(relic._id),
          relicMongoId: relic._id,
          characterName,
          finderOwnerUserId: interaction.user.id,
          appraiserName: appraiser,
          npcAppraisal,
          payment,
          status: 'pending',
        });
        await request.save();

        const modNote = npcAppraisal ? '\n*(NPC appraisal: 500 tokens will be deducted when a mod approves on the dashboard.)*' : '\n*(An Artist or Researcher in Inariko can use `/relic appraisal-accept` to appraise.)*';
        return interaction.editReply({
          content: `📜 **Appraisal request created!**\n> **Request ID:** \`${request._id}\`\n> Owner: **${characterName}**\n> Appraiser: **${appraiser}**\n> Payment: ${payment || 'None'}${modNote}`,
        });
      }

      // ------------------- /relic appraisal-accept -------------------
      if (sub === 'appraisal-accept') {
        const appraiserName = interaction.options.getString('appraiser');
        const requestId = interaction.options.getString('request_id');
        const description = interaction.options.getString('description');

        const request = await RelicAppraisalRequest.findById(requestId);
        if (!request) {
          return interaction.editReply({ content: '❌ Appraisal request not found.' });
        }
        if (request.status !== 'pending') {
          return interaction.editReply({ content: '❌ This request has already been processed.' });
        }
        if (request.npcAppraisal) {
          return interaction.editReply({ content: '❌ NPC appraisals are approved on the dashboard only.' });
        }

        const appraiserChar = await fetchCharacterByNameAndUserId(appraiserName, interaction.user.id) ||
          await ModCharacter.findOne({ name: new RegExp(`^${appraiserName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
            .then(m => m && String(m.userId) === interaction.user.id ? m : null);
        if (!appraiserChar) {
          return interaction.editReply({ content: '❌ You must own the appraiser character.' });
        }
        if (appraiserChar.job !== 'Artist' && appraiserChar.job !== 'Researcher') {
          return interaction.editReply({ content: '❌ Only Artists or Researchers can appraise relics.' });
        }
        const village = normalizeVillage(appraiserChar.currentVillage);
        if (village !== 'inariko') {
          return interaction.editReply({ content: '❌ The appraiser must reside in Inariko.' });
        }
        if (String(request.appraiserName).toLowerCase() !== appraiserName.toLowerCase()) {
          return interaction.editReply({ content: `❌ This request is assigned to **${request.appraiserName}**, not ${appraiserName}.` });
        }

        const stamina = appraiserChar.currentStamina ?? 0;
        if (stamina < 3) {
          return interaction.editReply({ content: '❌ Appraisal costs 3 stamina. The appraiser does not have enough.' });
        }

        const newStamina = Math.max(0, (appraiserChar.currentStamina ?? 0) - 3);
        await updateCurrentStamina(appraiserChar._id, newStamina, true);
        await appraiseRelic(request.relicMongoId || request.relicId, appraiserName, description, null, { npcAppraisal: false });
        request.status = 'approved';
        request.appraisalDescription = description;
        request.modApprovedBy = interaction.user.id;
        request.modApprovedAt = new Date();
        request.updatedAt = new Date();
        await request.save();

        return interaction.editReply({
          content: `📜 **Relic appraised by ${appraiserName}!**\n> ${description}\n> **Relic ID:** \`${request.relicId}\`\n\nThe finder can now use \`/relic reveal relic_id:${request.relicId}\` to reveal what relic it is.`,
        });
      }

      return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    } catch (error) {
      handleInteractionError(error, 'relic.js');
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: '❌ Something went wrong.' }).catch(() => {});
      }
      return interaction.reply({ content: '❌ Something went wrong.', ephemeral: true }).catch(() => {});
    }
  },
};
