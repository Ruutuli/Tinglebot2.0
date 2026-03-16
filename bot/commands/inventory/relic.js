// ============================================================================
// ------------------- Relic Command -------------------
// Manages relic appraisals and archival. When a relic is appraised it is immediately revealed.
// ============================================================================

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const {
  fetchRelicById,
  fetchRelicsByCharacter,
  appraiseRelic,
  fetchCharacterByNameAndUserId,
  getOrCreateToken,
  updateTokenBalance,
  fetchAllItems,
} = require('@/database/db.js');
const { addItemInventoryDatabase } = require('@/utils/inventoryUtils.js');
const { updateCurrentStamina } = require('../../modules/characterStatsModule.js');
const { rollRelicOutcome } = require('@/utils/relicUtils.js');
const RelicModel = require('@/models/RelicModel.js');
const RelicAppraisalRequest = require('@/models/RelicAppraisalRequestModel.js');
const ModCharacter = require('@/models/ModCharacterModel.js');
const { generateUniqueId } = require('@/utils/uniqueIdUtils.js');
const { getAppraisalText } = require('@/data/relicAppraisalText.js');

/** Image used for unappraised / unknown relics (HW Sealed Weapon Icon). */
const UNAPPRAISED_RELIC_IMAGE_URL = 'https://static.wikia.nocookie.net/zelda_gamepedia_en/images/7/7c/HW_Sealed_Weapon_Icon.png/revision/latest?cb=20150918051232';
/** Border image used on relic embeds (matches other bot embeds). */
const RELIC_EMBED_BORDER_URL = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
/** Token reward for turning in a duplicate relic (already discovered by another player). */
const DUPLICATE_RELIC_REWARD_TOKENS = 500;
/** Dashboard URL for Library Archives (submit relic art). */
const LIBRARY_ARCHIVES_URL = `${(process.env.DASHBOARD_URL || process.env.APP_URL || 'https://tinglebot.xyz').replace(/\/$/, '')}/library/archives`;
/** Roots of the Wild — Relic mechanics & rules (linked from all relic embeds). */
const RELIC_MECHANICS_URL = 'https://rootsofthewild.com/mechanics/relics';
/** Footer text for all relic embeds (includes rules link). */
const RELIC_EMBED_FOOTER = `Relics · ${RELIC_MECHANICS_URL}`;
/** Instructions for finder after appraisal (concise). Art: 500×500+ PNG, 1:1, transparent; due 2 months. */
const ART_INSTRUCTIONS = `Submit **original art** (500×500+ PNG, 1:1, transparent bg) to the [Library Archives](${LIBRARY_ARCHIVES_URL}) within **2 months**.`;
/** Intro line for embed when we show full appraisal text (so finder knows it's for art reference). */
const APPRAISAL_INTRO = '**Use this appraisal as reference when creating your art for the Library Archives.**\n\n';

/** Relic embed color (ocher/orange). Same for all relic embeds. */
const RELIC_EMBED_COLOR = 0xe67e22;

/** Apply consistent styling to any relic embed: color, thumbnail, image, footer, timestamp. */
function applyRelicEmbedStyle(embed) {
  return embed
    .setColor(RELIC_EMBED_COLOR)
    .setThumbnail(UNAPPRAISED_RELIC_IMAGE_URL)
    .setImage(RELIC_EMBED_BORDER_URL)
    .setFooter({ text: RELIC_EMBED_FOOTER })
    .setTimestamp();
}

function normalizeVillage(v) {
  return (v || '').trim().toLowerCase();
}

/** Items that restore hearts or stamina (for duplicate relic reward). Fetched once per call. */
async function getHealingOrStaminaItems() {
  const allItems = await fetchAllItems();
  if (!allItems || !Array.isArray(allItems)) return [];
  return allItems.filter(
    (item) =>
      item &&
      item.itemName &&
      ((Number(item.modifierHearts) > 0 || Number(item.staminaRecovered) > 0))
  );
}

/** Immediately reveal an appraised relic (roll outcome, update DB, handle duplicates). Returns { outcome, isDuplicate, duplicateRewardGiven, duplicateItemName, displayRelicId } or null. */
async function revealRelicImmediately(relicId, { finderOwnerUserId, interaction }) {
  const relic = await fetchRelicById(relicId);
  if (!relic || !relic.appraised) return null;
  if (relic.rollOutcome || relic.archived || relic.deteriorated) return null;

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

  let duplicateRewardGiven = false;
  let duplicateItemName = null;
  if (isDuplicate && updateData.archived && finderOwnerUserId) {
    const updatedRelic = await RelicModel.findById(relic._id);
    if (updatedRelic && !updatedRelic.duplicateRewardGiven) {
      await updateTokenBalance(finderOwnerUserId, DUPLICATE_RELIC_REWARD_TOKENS, {
        category: 'relic_duplicate_turn_in',
        description: 'Duplicate relic turn-in',
      });
      await RelicModel.findByIdAndUpdate(relic._id, { duplicateRewardGiven: true });
      duplicateRewardGiven = true;

      // Give finder's character a random food/healing/stamina item (if they have a character and we have interaction)
      if (relic.characterId && interaction) {
        try {
          const healingItems = await getHealingOrStaminaItems();
          if (healingItems.length > 0) {
            const randomItem = healingItems[Math.floor(Math.random() * healingItems.length)];
            const itemName = randomItem.itemName || randomItem.name;
            if (itemName) {
              await addItemInventoryDatabase(relic.characterId, itemName, 1, interaction, 'Duplicate Relic Turn-In');
              duplicateItemName = itemName;
            }
          }
        } catch (itemErr) {
          console.error('[relic.js] Duplicate relic random item reward failed:', itemErr?.message || itemErr);
        }
      }
    }
  }
  const displayRelicId = relic.relicId || relic._id;
  return { outcome, isDuplicate, duplicateRewardGiven, duplicateItemName, displayRelicId };
}

/** Resolve relic appraisal request by MongoDB _id or short ID (e.g. A473582). */
async function findRelicAppraisalRequestById(id) {
  if (!id) return null;
  const str = String(id).trim();
  if (/^A\d{6}$/.test(str)) {
    return await RelicAppraisalRequest.findOne({ appraisalRequestId: str });
  }
  if (/^A\d+$/.test(str)) {
    return await RelicAppraisalRequest.findOne({ appraisalRequestId: str });
  }
  if (/^[a-fA-F0-9]{24}$/.test(str)) {
    return await RelicAppraisalRequest.findById(str);
  }
  return null;
}

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('relic')
    .setDescription('Manage relic appraisals and archival')

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
          opt.setName('relic_id').setDescription('Relic ID (e.g. R473582 or MongoDB _id)').setRequired(true)
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
          opt.setName('relic_id').setDescription('Relic ID (e.g. R473582)').setRequired(true).setAutocomplete(true)
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
          opt.setName('request_id').setDescription('Appraisal request ID (e.g. A473582)').setRequired(true)
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

      const deferSubs = ['list', 'appraisal-request', 'appraisal-accept'];
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
          const status = r.deteriorated ? '⚠️ Deteriorated' : r.archived ? '✅ Archived' : r.appraised ? '🎲 Revealed' : '🔸 Unappraised';
          return `• \`${id}\` — ${status}${r.rollOutcome ? ` — **${r.rollOutcome}**` : ''}`;
        });
        const embed = applyRelicEmbedStyle(
          new EmbedBuilder()
            .setTitle(`📜 Relics: ${characterName}`)
            .setDescription(lines.join('\n'))
        );
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
        const displayRelicId = relic.relicId || relic._id;
        const embed = applyRelicEmbedStyle(
          new EmbedBuilder()
            .setTitle(`📜 ${relic.rollOutcome || relic.name}`)
            .setDescription(relic.appraisalDescription || 'No description.')
            .addFields(
              { name: 'Relic ID', value: `\`${displayRelicId}\``, inline: true },
              { name: 'Discovered By', value: relic.discoveredBy || '—', inline: true },
              { name: 'Location', value: relic.locationFound || 'Unknown', inline: true },
              { name: 'Appraised By', value: relic.appraisedBy || '—', inline: true },
              { name: 'Art Submitted', value: relic.artSubmitted ? '✅' : '❌', inline: true },
              { name: 'Archived', value: relic.archived ? '✅' : '❌', inline: true },
              { name: 'Deteriorated', value: relic.deteriorated ? '⚠️ Yes' : 'No', inline: true }
            )
        );
        return (interaction.deferred ? interaction.editReply : interaction.reply).call(interaction, { embeds: [embed] });
      }

      // ------------------- /relic appraisal-request -------------------
      if (sub === 'appraisal-request') {
        const characterNameRaw = interaction.options.getString('character');
        const characterName = characterNameRaw && characterNameRaw.includes('|') ? characterNameRaw.split('|')[0].trim() : (characterNameRaw || '').trim();
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
        if ((relic.discoveredBy || '').toLowerCase() !== characterName.toLowerCase()) {
          return interaction.editReply({ content: `❌ This relic was discovered by **${relic.discoveredBy}**, not ${characterName}.` });
        }

        const finderChar = await fetchCharacterByNameAndUserId(characterName, interaction.user.id) ||
          await ModCharacter.findOne({ name: new RegExp(`^${characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
            .then(m => m && String(m.userId) === interaction.user.id ? m : null);
        if (!finderChar) {
          return interaction.editReply({ content: '❌ You must own the character who found the relic.' });
        }

        const npcAppraisal = appraiser.trim().toLowerCase() === 'npc';
        if (!npcAppraisal && (appraiser || '').trim().toLowerCase() === characterName.toLowerCase()) {
          return interaction.editReply({ content: '❌ You cannot assign the same character who found the relic as the appraiser.' });
        }
        if (npcAppraisal) {
          const user = await getOrCreateToken(interaction.user.id);
          const balance = user?.tokens ?? 0;
          if (balance < 500) {
            return interaction.editReply({ content: '❌ NPC appraisal costs 500 tokens. You do not have enough.' });
          }
        }

        const existing = await RelicAppraisalRequest.findOne({
          relicMongoId: relic._id,
          status: 'pending',
        });
        if (existing) {
          const existingId = existing.appraisalRequestId || existing._id;
          return interaction.editReply({
            content: `❌ An appraisal request for this relic is already pending.\n> **Request ID:** \`${existingId}\`\n> **Appraiser:** ${existing.appraiserName || '—'}\nWait for it to be processed, or check the dashboard.`,
          });
        }

        const appraisalRequestId = generateUniqueId('A');
        const request = new RelicAppraisalRequest({
          appraisalRequestId,
          relicId: relic.relicId || String(relic._id),
          relicMongoId: relic._id,
          characterName,
          finderOwnerUserId: interaction.user.id,
          appraiserName: appraiser,
          npcAppraisal,
          payment,
          status: npcAppraisal ? 'approved' : 'pending',
        });
        await request.save();

        if (npcAppraisal) {
          await updateTokenBalance(interaction.user.id, -500, {
            category: 'relic_npc_appraisal',
            description: 'NPC relic appraisal',
          });
          const npcDescription = 'Appraised by an NPC.';
          await appraiseRelic(relic._id, 'NPC', npcDescription, null, { npcAppraisal: true });
          request.appraisalDescription = npcDescription;
          request.updatedAt = new Date();
          await request.save();

          const revealResult = await revealRelicImmediately(relic._id, { finderOwnerUserId: interaction.user.id, interaction });
          if (!revealResult) {
            const displayRelicId = relic.relicId || relic._id;
            const userEmbed = applyRelicEmbedStyle(
              new EmbedBuilder()
                .setTitle('📜 Relic appraised by NPC')
                .setDescription('Your relic has been appraised. **500 tokens** deducted.')
                .addFields(
                  { name: 'Relic ID', value: `\`${displayRelicId}\``, inline: true },
                  { name: 'Request ID', value: `\`${appraisalRequestId}\``, inline: true },
                  { name: 'Payment', value: '500 tokens', inline: true }
                )
            );
            return interaction.editReply({ embeds: [userEmbed] });
          }
          const { outcome, isDuplicate, duplicateRewardGiven, duplicateItemName, displayRelicId } = revealResult;
          const fullAppraisal = getAppraisalText(outcome.name);
          const descriptionForEmbed = fullAppraisal ? APPRAISAL_INTRO + fullAppraisal : outcome.description;
          let submitInstructions = isDuplicate
            ? (duplicateRewardGiven
              ? `Duplicate — submitted to archives. No art needed. You received **${DUPLICATE_RELIC_REWARD_TOKENS} tokens**.`
              : 'Duplicate — submitted to archives. No art needed.')
            : ART_INSTRUCTIONS + ` Use Relic ID \`${displayRelicId}\` when submitting.`;
          if (isDuplicate && duplicateItemName) {
            submitInstructions += ` A healing/stamina item (**${duplicateItemName}**) was added to your finder's inventory.`;
          }
          const userEmbed = applyRelicEmbedStyle(
            new EmbedBuilder()
              .setTitle(`📜 Relic appraised by NPC — ${outcome.name}`)
              .setDescription(descriptionForEmbed)
              .addFields(
                { name: 'Relic', value: outcome.name, inline: true },
                { name: 'Relic ID', value: `\`${displayRelicId}\``, inline: true },
                { name: 'Duplicate?', value: isDuplicate ? 'Yes' : 'No', inline: true },
                { name: 'Next step', value: submitInstructions, inline: false }
              )
          );
          return interaction.editReply({ embeds: [userEmbed] });
        }

        const displayRequestId = request.appraisalRequestId || request._id;
        const displayPayment = payment || 'None';
        const userEmbed = applyRelicEmbedStyle(
          new EmbedBuilder()
            .setTitle('📜 Appraisal request created')
            .setDescription('An Artist or Researcher in Inariko can use `/relic appraisal-accept` to appraise (costs 3 stamina).')
            .addFields(
              { name: 'Request ID', value: `\`${displayRequestId}\``, inline: true },
              { name: 'Relic ID', value: `\`${relic.relicId || relic._id}\``, inline: true },
              { name: 'Finder', value: characterName, inline: true },
              { name: 'Appraiser', value: appraiser, inline: true },
              { name: 'Payment', value: displayPayment, inline: true },
              { name: 'Next step', value: 'Use `/relic appraisal-accept` in Inariko with the Request ID above.', inline: false }
            )
        );

        return interaction.editReply({ embeds: [userEmbed] });
      }

      // ------------------- /relic appraisal-accept -------------------
      if (sub === 'appraisal-accept') {
        const appraiserName = interaction.options.getString('appraiser');
        const requestId = interaction.options.getString('request_id');
        const description = interaction.options.getString('description');

        const request = await findRelicAppraisalRequestById(requestId);
        if (!request) {
          return interaction.editReply({ content: '❌ Appraisal request not found. Use the Request ID (e.g. A473582) from the request.' });
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

        const revealResult = await revealRelicImmediately(request.relicMongoId || request.relicId, {
          finderOwnerUserId: request.finderOwnerUserId,
          interaction,
        });
        if (!revealResult) {
          return interaction.editReply({
            content: `📜 **Relic appraised by ${appraiserName}!**\n> ${description}\n> **Relic ID:** \`${request.relicId}\``,
          });
        }
        const { outcome, isDuplicate, duplicateRewardGiven, duplicateItemName, displayRelicId } = revealResult;
        const fullAppraisal = getAppraisalText(outcome.name);
        const descriptionForEmbed = fullAppraisal ? APPRAISAL_INTRO + fullAppraisal : outcome.description;
        let submitInstructions = isDuplicate
          ? (duplicateRewardGiven
            ? `Duplicate — submitted to archives. No art needed. Finder received **${DUPLICATE_RELIC_REWARD_TOKENS} tokens**.`
            : 'Duplicate — submitted to archives. No art needed.')
          : ART_INSTRUCTIONS + ` Use Relic ID \`${displayRelicId}\` when submitting.`;
        if (isDuplicate && duplicateItemName) {
          submitInstructions += ` A healing/stamina item (**${duplicateItemName}**) was added to the finder's inventory.`;
        }
        const embed = applyRelicEmbedStyle(
          new EmbedBuilder()
            .setTitle(`📜 Relic appraised by ${appraiserName} — ${outcome.name}`)
            .setDescription(descriptionForEmbed)
            .addFields(
              { name: 'Relic', value: outcome.name, inline: true },
              { name: 'Relic ID', value: `\`${displayRelicId}\``, inline: true },
              { name: 'Duplicate?', value: isDuplicate ? 'Yes' : 'No', inline: true },
              { name: 'Next step', value: submitInstructions, inline: false }
            )
        );
        return interaction.editReply({ embeds: [embed] });
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
