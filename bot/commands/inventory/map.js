// ============================================================================
// ------------------- Map Command -------------------
// Old map appraisal: list, request (Scholar or NPC), accept (Scholar, 3 stamina).
// NPC: 500 tokens deducted immediately, map appraised and owner DM'd — no mod approval.
// PC: Scholar uses /map appraisal-accept in Inariko (3 stamina), then owner is DM'd.
// ============================================================================

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const {
  fetchCharacterByNameAndUserId,
  getOrCreateToken,
  updateTokenBalance,
} = require('@/database/db.js');
const { updateCurrentStamina } = require('../../modules/characterStatsModule.js');
const { getCharacterOldMapsWithDetails, findOldMapByIdOrMapId } = require('@/utils/oldMapUtils.js');
const { getOldMapByNumber, OLD_MAPS_LINK, OLD_MAP_ICON_URL } = require('@/data/oldMaps.js');

/** Border image for map embeds (matches other bot embeds). */
const MAP_EMBED_BORDER_URL = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
const { sendDiscordDM } = require('@/utils/notificationService.js');
const OldMapFound = require('@/models/OldMapFoundModel.js');
const MapAppraisalRequest = require('@/models/MapAppraisalRequestModel.js');
const ModCharacter = require('@/models/ModCharacterModel.js');

function normalizeVillage(v) {
  return (v || '').trim().toLowerCase();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('map')
    .setDescription('List old maps and manage map appraisal requests')

    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription("List a character's old maps (appraised and unappraised)")
        .addStringOption(opt =>
          opt.setName('character').setDescription('Character who owns the maps').setRequired(true).setAutocomplete(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('appraisal-request')
        .setDescription('Request appraisal for an old map (Scholar or NPC)')
        .addStringOption(opt =>
          opt.setName('character').setDescription('Character who owns the map').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('map_id').setDescription('Unappraised map (from /map list)').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('appraiser').setDescription('PC Scholar or NPC').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('payment').setDescription('Payment offered (from inventory)').setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('appraisal-accept')
        .setDescription('Accept a map appraisal request (Scholar in Inariko; costs 3 stamina)')
        .addStringOption(opt =>
          opt.setName('appraiser').setDescription('Your character (Scholar)').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('request_id').setDescription('Map appraisal request ID (MongoDB _id)').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('description').setDescription('Optional note about the appraisal').setRequired(false)
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
        const ephemeral = sub === 'list';
        await interaction.deferReply({ ephemeral });
      }

      // ------------------- /map list -------------------
      if (sub === 'list') {
        const characterName = interaction.options.getString('character');
        const char = await fetchCharacterByNameAndUserId(characterName, interaction.user.id) ||
          await ModCharacter.findOne({ name: new RegExp(`^${characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
            .then(m => m && String(m.userId) === interaction.user.id ? m : null);
        if (!char) {
          return interaction.editReply({ content: '❌ You must own that character.' });
        }
        const maps = await getCharacterOldMapsWithDetails(characterName);
        if (maps.length === 0) {
          const emptyEmbed = new EmbedBuilder()
            .setTitle(`🗺️ Old maps — ${characterName}`)
            .setDescription(`**${characterName}** has no old maps. Find maps during exploration or in ruins.`)
            .setThumbnail(OLD_MAP_ICON_URL)
            .setImage(MAP_EMBED_BORDER_URL)
            .setURL(OLD_MAPS_LINK)
            .setColor(0x2ecc71)
            .setFooter({ text: 'More info' });
          return interaction.editReply({ embeds: [emptyEmbed] });
        }
        const appraised = maps.filter((m) => m.appraised);
        const unappraised = maps.filter((m) => !m.appraised);
        const appraisedLines = appraised.length
          ? appraised.map((m) => `• **Map #${m.mapNumber}** — deciphered`).join('\n')
          : '—';
        const unappraisedLines = unappraised.length
          ? unappraised.map((m) => {
              const id = (m.mapId || m._id).toString();
              const where = m.locationFound || 'exploration';
              const date = m.foundAt ? new Date(m.foundAt).toLocaleDateString() : '—';
              return `• \`${id}\` — Map #? (${where}, ${date})`;
            }).join('\n')
          : '—';
        const embed = new EmbedBuilder()
          .setTitle(`🗺️ Old maps — ${characterName}`)
          .setThumbnail(OLD_MAP_ICON_URL)
          .setImage(MAP_EMBED_BORDER_URL)
          .setURL(OLD_MAPS_LINK)
          .setColor(0x2ecc71)
          .addFields(
            { name: 'Deciphered', value: appraisedLines, inline: false },
            { name: 'Unidentified (need appraisal)', value: unappraisedLines, inline: false }
          )
          .setFooter({ text: unappraised.length ? 'Use map_id from an unidentified line in /map appraisal-request' : 'All maps deciphered' });
        return interaction.editReply({ embeds: [embed] });
      }

      // ------------------- /map appraisal-request -------------------
      if (sub === 'appraisal-request') {
        const characterName = interaction.options.getString('character');
        const mapIdStr = interaction.options.getString('map_id');
        const appraiser = interaction.options.getString('appraiser');
        const payment = interaction.options.getString('payment') || '';

        const char = await fetchCharacterByNameAndUserId(characterName, interaction.user.id) ||
          await ModCharacter.findOne({ name: new RegExp(`^${characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
            .then(m => m && String(m.userId) === interaction.user.id ? m : null);
        if (!char) {
          return interaction.editReply({ content: '❌ You must own the character who owns the map.' });
        }

        const mapDoc = await findOldMapByIdOrMapId(mapIdStr);
        if (!mapDoc) {
          return interaction.editReply({ content: '❌ Map not found. Use a map ID (e.g. M12345) from `/map list`.' });
        }
        if (String(mapDoc.characterName).toLowerCase() !== characterName.toLowerCase()) {
          return interaction.editReply({ content: '❌ That map does not belong to this character.' });
        }
        if (mapDoc.appraised) {
          return interaction.editReply({ content: '❌ This map has already been appraised.' });
        }
        if (appraiser.trim().toLowerCase() !== 'npc' && (appraiser || '').trim().toLowerCase() === characterName.toLowerCase()) {
          return interaction.editReply({ content: '❌ You cannot assign the same character who owns the map as the appraiser.' });
        }

        const existing = await MapAppraisalRequest.findOne({
          oldMapFoundId: mapDoc._id,
          status: 'pending',
        });
        if (existing) {
          return interaction.editReply({ content: '❌ An appraisal request for this map is already pending.' });
        }

        const npcAppraisal = appraiser.trim().toLowerCase() === 'npc';
        if (npcAppraisal) {
          const user = await getOrCreateToken(interaction.user.id);
          const balance = user?.tokens ?? 0;
          if (balance < 500) {
            return interaction.editReply({
              content: '❌ NPC appraisal costs 500 tokens. You do not have enough.',
            });
          }
        }

        const request = new MapAppraisalRequest({
          oldMapFoundId: mapDoc._id,
          mapOwnerCharacterName: characterName,
          mapOwnerUserId: interaction.user.id,
          appraiserName: appraiser,
          npcAppraisal,
          payment,
          status: npcAppraisal ? 'approved' : 'pending',
        });
        await request.save();

        if (npcAppraisal) {
          await updateTokenBalance(interaction.user.id, -500, {
            category: 'map_npc_appraisal',
            description: 'NPC map appraisal',
          });
          mapDoc.appraised = true;
          mapDoc.appraisedAt = new Date();
          mapDoc.appraisedBy = 'NPC';
          await mapDoc.save();

          request.updatedAt = new Date();
          await request.save();

          const mapInfo = getOldMapByNumber(mapDoc.mapNumber);
          const coordinates = mapInfo ? mapInfo.coordinates : '—';
          const mapLabel = `Map #${mapDoc.mapNumber}`;
          let dmDesc = `Your old map has been deciphered by an NPC.\n\n**${mapLabel}**\n**Coordinates:** ${coordinates}`;
          if (mapInfo && mapInfo.leadsTo) dmDesc += `\n**Leads to:** ${mapInfo.leadsTo}`;
          const dmEmbed = {
            title: '🗺️ Map appraised — your coordinates',
            description: dmDesc,
            color: 0x2ecc71,
            thumbnail: { url: OLD_MAP_ICON_URL },
            footer: { text: 'Roots of the Wild • Old Maps' },
            url: OLD_MAPS_LINK,
          };
          const dmSent = await sendDiscordDM(interaction.user.id, dmEmbed);
          request.coordinatesDmSentAt = dmSent ? new Date() : null;
          request.updatedAt = new Date();
          await request.save();

          const leadsTo = mapInfo?.leadsTo ? `\n**Leads to:** ${mapInfo.leadsTo}` : '';
          const successEmbed = new EmbedBuilder()
            .setTitle('🗺️ Map appraised by NPC!')
            .setDescription(`Your old map has been deciphered. **500 tokens** have been deducted.`)
            .setThumbnail(OLD_MAP_ICON_URL)
            .setImage(MAP_EMBED_BORDER_URL)
            .setColor(0x2ecc71)
            .setURL(OLD_MAPS_LINK)
            .addFields(
              { name: 'Map', value: mapLabel, inline: true },
              { name: 'Coordinates', value: coordinates, inline: true },
              { name: 'DM', value: dmSent ? 'You have been DMed with the coordinates.' : 'Could not DM you (you may have DMs disabled).', inline: false }
            )
            .setFooter({ text: 'Roots of the Wild • Old Maps' });
          if (leadsTo) successEmbed.setDescription(successEmbed.data.description + leadsTo);
          return interaction.editReply({ embeds: [successEmbed] });
        }

        return interaction.editReply({
          content: `📜 **Map appraisal request created!**\n> **Request ID:** \`${request._id}\`\n> Owner: **${characterName}**\n> Appraiser: **${appraiser}**\n> Payment: ${payment || 'None'}\n*(A Scholar in Inariko can use \`/map appraisal-accept\` to appraise.)*`,
        });
      }

      // ------------------- /map appraisal-accept -------------------
      if (sub === 'appraisal-accept') {
        const appraiserName = interaction.options.getString('appraiser');
        const requestId = interaction.options.getString('request_id');

        const request = await MapAppraisalRequest.findById(requestId);
        if (!request) {
          return interaction.editReply({ content: '❌ Map appraisal request not found.' });
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
        if (appraiserChar.job !== 'Scholar') {
          return interaction.editReply({ content: '❌ Only Scholars can appraise maps.' });
        }
        const village = normalizeVillage(appraiserChar.currentVillage);
        if (village !== 'inariko') {
          return interaction.editReply({ content: '❌ The appraiser must reside in Inariko.' });
        }
        if (String(request.appraiserName).toLowerCase() !== appraiserName.toLowerCase()) {
          return interaction.editReply({ content: `❌ This request is assigned to **${request.appraiserName}**, not ${appraiserName}.` });
        }

        const otherPending = await MapAppraisalRequest.findOne({
          appraiserName: new RegExp(`^${appraiserName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          status: 'pending',
          _id: { $ne: request._id },
        });
        if (otherPending) {
          return interaction.editReply({ content: '❌ A Scholar may only appraise one map at a time. Finish or cancel the other request first.' });
        }

        const stamina = appraiserChar.currentStamina ?? 0;
        if (stamina < 3) {
          return interaction.editReply({ content: '❌ Appraisal costs 3 stamina. The appraiser does not have enough.' });
        }

        const mapDoc = await OldMapFound.findById(request.oldMapFoundId);
        if (!mapDoc) {
          return interaction.editReply({ content: '❌ Map record not found.' });
        }
        if (mapDoc.appraised) {
          return interaction.editReply({ content: '❌ This map has already been appraised.' });
        }

        const newStamina = Math.max(0, (appraiserChar.currentStamina ?? 0) - 3);
        await updateCurrentStamina(appraiserChar._id, newStamina, true);

        mapDoc.appraised = true;
        mapDoc.appraisedAt = new Date();
        mapDoc.appraisedBy = appraiserName;
        await mapDoc.save();

        request.status = 'approved';
        request.modApprovedBy = interaction.user.id;
        request.modApprovedAt = new Date();
        request.updatedAt = new Date();
        await request.save();

        const mapInfo = getOldMapByNumber(mapDoc.mapNumber);
        const coordinates = mapInfo ? mapInfo.coordinates : '—';
        const mapLabel = `Map #${mapDoc.mapNumber}`;
        let dmDesc = `Your old map has been deciphered by **${appraiserName}**.\n\n**${mapLabel}**\n**Coordinates:** ${coordinates}`;
        if (mapInfo && mapInfo.leadsTo) {
          dmDesc += `\n**Leads to:** ${mapInfo.leadsTo}`;
        }
        const dmEmbed = {
          title: '🗺️ Map appraised — your coordinates',
          description: dmDesc,
          color: 0x2ecc71,
          thumbnail: { url: OLD_MAP_ICON_URL },
          footer: { text: 'Roots of the Wild • Old Maps' },
          url: OLD_MAPS_LINK,
        };
        const dmSent = await sendDiscordDM(request.mapOwnerUserId, dmEmbed);
        request.coordinatesDmSentAt = dmSent ? new Date() : null;
        request.updatedAt = new Date();
        await request.save();

        const leadsToLine = mapInfo?.leadsTo ? `\n**Leads to:** ${mapInfo.leadsTo}` : '';
        const pcSuccessEmbed = new EmbedBuilder()
          .setTitle(`🗺️ Map appraised by ${appraiserName}!`)
          .setDescription(`${mapLabel} has been deciphered.${leadsToLine}`)
          .setThumbnail(OLD_MAP_ICON_URL)
          .setImage(MAP_EMBED_BORDER_URL)
          .setColor(0x2ecc71)
          .setURL(OLD_MAPS_LINK)
          .addFields(
            { name: 'Map', value: mapLabel, inline: true },
            { name: 'Coordinates', value: coordinates, inline: true },
            { name: 'Map owner', value: dmSent ? 'DMed with coordinates.' : 'Could not DM (may have DMs disabled).', inline: false }
          )
          .setFooter({ text: 'Roots of the Wild • Old Maps' });
        return interaction.editReply({ embeds: [pcSuccessEmbed] });
      }

      return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    } catch (error) {
      handleInteractionError(error, 'map.js');
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: '❌ Something went wrong.' }).catch(() => {});
      }
      return interaction.reply({ content: '❌ Something went wrong.', ephemeral: true }).catch(() => {});
    }
  },
};
