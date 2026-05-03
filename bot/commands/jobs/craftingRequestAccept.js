// ============================================================================
// Accept dashboard-posted workshop commissions from Discord.
// - Prefix: ?crafting accept <requestMongoId> <your crafter OC name>
// - Slash: /crafting accept
// Posting new commissions stays on the website only.
// ============================================================================

'use strict';

const mongoose = require('mongoose');
const { EmbedBuilder } = require('discord.js');
const CraftingRequest = require('@/models/CraftingRequestModel');
const {
  connectToTinglebot,
  fetchCharacterByNameAndUserId,
  fetchModCharacterByNameAndUserId,
} = require('@/database/db');
const { executeWorkshopCommissionCraft } = require('@/services/workshopCommissionCraft');
const logger = require('@/utils/logger');

const BORDER = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';

function isMongoObjectId24(s) {
  return /^[a-fA-F0-9]{24}$/.test(String(s || '').trim());
}

/** Same pattern as questID / generateUniqueId — workshop commissions use prefix K + 6 digits */
function normalizeWorkshopCommissionCode(raw) {
  const t = String(raw || '').trim();
  if (!/^[A-Za-z][0-9]{6}$/.test(t)) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function isValidRequestLookupToken(id) {
  return isMongoObjectId24(id) || normalizeWorkshopCommissionCode(id) !== null;
}

async function findCraftingRequestForAccept(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;
  if (isMongoObjectId24(raw)) {
    return CraftingRequest.findById(raw).exec();
  }
  const code = normalizeWorkshopCommissionCode(raw);
  if (!code) return null;
  return CraftingRequest.findOne({ commissionID: code }).exec();
}

function parseCraftingAcceptPrefix(raw) {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t.startsWith('?')) return { kind: 'noop' };
  let rest = t.slice(1).trim();
  if (!rest.toLowerCase().startsWith('crafting')) return { kind: 'noop' };
  rest = rest.slice('crafting'.length).trim();
  if (!rest || rest.toLowerCase() === 'help') return { kind: 'help' };
  if (rest.toLowerCase().startsWith('request')) {
    rest = rest.slice('request'.length).trim();
  }
  if (!rest.toLowerCase().startsWith('accept')) return { kind: 'help' };
  rest = rest.slice('accept'.length).trim();
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { kind: 'help' };
  const id = parts[0];
  const characterName = parts.slice(1).join(' ');
  if (!isValidRequestLookupToken(id)) return { kind: 'bad_id' };
  return { kind: 'accept', requestId: id, characterName };
}

async function fetchCharacterForDiscordUser(characterName, discordUserId) {
  let c = await fetchCharacterByNameAndUserId(characterName, discordUserId);
  if (!c) c = await fetchModCharacterByNameAndUserId(characterName, discordUserId);
  return c;
}

function workshopVillagesCompatible(nameA, villageA, nameB, villageB) {
  const av = String(villageA ?? '').trim().toLowerCase();
  const bv = String(villageB ?? '').trim().toLowerCase();
  if (!av || !bv) {
    return {
      ok: false,
      error: `Village data missing. Both OCs need a current village. **${nameA}:** ${String(villageA || '').trim() || '—'} · **${nameB}:** ${String(villageB || '').trim() || '—'}`,
    };
  }
  if (av !== bv) {
    return {
      ok: false,
      error: `**${nameA}** is in **${String(villageA).trim()}** but **${nameB}** is in **${String(villageB).trim()}**. Workshop commissions require the same village.`,
    };
  }
  return { ok: true };
}

function usageEmbed() {
  return new EmbedBuilder()
    .setColor(0x5d8aa8)
    .setTitle('📋 Workshop commission — accept (Discord)')
    .setDescription(
      'New commissions are posted on the **dashboard only**. To fulfill one from Discord as your crafter OC:\n\n' +
        '`/crafting accept` — slash command (**request_id** + **charactername**)\n' +
        '`?crafting accept <requestId> <your OC name>` — text command\n' +
        '`?crafting request accept <requestId> <your OC name>`\n\n' +
        '• **request id** — workshop code (**K** + 6 digits, e.g. `K384521`) or legacy 24-character id from the URL.\n' +
        '• **your OC name** — the character taking the job (must match job/village rules).\n\n' +
        '_You cannot accept your own commission._'
    )
    .setImage(BORDER)
    .setFooter({ text: 'Requests are created on the website — this command only accepts.' });
}

/**
 * Shared accept flow for prefix and `/crafting accept` slash.
 * @param {{ requestId: string, characterName: string, userId: string, userTag?: string, sourceTag?: string }} opts
 * @returns {Promise<import('discord.js').EmbedBuilder>}
 */
async function runWorkshopCraftingAccept({
  requestId: requestIdRaw,
  characterName: characterNameRaw,
  userId: acceptorDiscordId,
  userTag,
  sourceTag = 'CRAFT_ACCEPT',
}) {
  const requestToken = String(requestIdRaw || '').trim();
  const characterName = String(characterNameRaw || '').trim();

  if (!isValidRequestLookupToken(requestToken)) {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Invalid request id')
      .setDescription(
        'Use the workshop commission code (**K** + 6 digits, e.g. `K384521`) from the board, or the legacy **24-character** id from the dashboard URL.'
      );
  }
  if (!characterName) {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Character required')
      .setDescription('Choose the **crafter OC** taking this job.');
  }

  await connectToTinglebot();

  const reqDoc = await findCraftingRequestForAccept(requestToken);
  if (!reqDoc || reqDoc.status !== 'open') {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Commission not available')
      .setDescription('That request was not found or is no longer **open**.');
  }

  if (reqDoc.requesterDiscordId === acceptorDiscordId) {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Cannot accept')
      .setDescription('You cannot accept your own workshop commission.');
  }

  const acceptor = await fetchCharacterForDiscordUser(characterName, acceptorDiscordId);
  if (!acceptor) {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Character not found')
      .setDescription(`No OC named **${characterName.trim()}** on your roster for this Discord account.`);
  }

  const acceptorCharacterId = String(acceptor._id);

  const requesterChar = await fetchCharacterForDiscordUser(
    reqDoc.requesterCharacterName,
    reqDoc.requesterDiscordId
  );
  if (!requesterChar) {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Commissioner OC missing')
      .setDescription('Could not load the commissioner character from the database.');
  }

  const villageCheck = workshopVillagesCompatible(
    requesterChar.name,
    requesterChar.currentVillage,
    acceptor.name,
    acceptor.currentVillage
  );
  if (!villageCheck.ok) {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Village mismatch')
      .setDescription(villageCheck.error);
  }

  if (reqDoc.targetMode === 'specific') {
    const tid = reqDoc.targetCharacterId ? String(reqDoc.targetCharacterId) : '';
    if (!tid || tid !== acceptorCharacterId) {
      return new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Named commission only')
        .setDescription(
          `This post is for a **specific** crafter OC — **${acceptor.name}** is not the named artisan.`
        );
    }
  }

  const mongoRequestId = String(reqDoc._id);
  const acceptedAt = new Date();
  const reserved = await CraftingRequest.findOneAndUpdate(
    {
      _id: mongoRequestId,
      status: 'open',
      requesterDiscordId: { $ne: acceptorDiscordId },
    },
    {
      $set: {
        status: 'accepted',
        acceptedAt,
        acceptedByUserId: acceptorDiscordId,
        acceptedByCharacterId: new mongoose.Types.ObjectId(acceptorCharacterId),
        acceptedByCharacterName: acceptor.name,
      },
    },
    { new: true }
  ).exec();

  if (!reserved) {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Could not lock commission')
      .setDescription('Someone else may have accepted it first, or you cannot accept your own request.');
  }

  const revertToOpen = async () => {
    await CraftingRequest.findByIdAndUpdate(mongoRequestId, {
      $set: {
        status: 'open',
        acceptedAt: null,
        acceptedByUserId: null,
        acceptedByCharacterId: null,
        acceptedByCharacterName: '',
      },
    }).exec();
  };

  const elixirSels = Array.isArray(reserved.elixirMaterialSelections)
    ? reserved.elixirMaterialSelections.map((s) => ({
        inventoryDocumentId: s.inventoryDocumentId,
        maxQuantity: s.maxQuantity,
      }))
    : [];

  let craftResult;
  try {
    craftResult = await executeWorkshopCommissionCraft({
      crafterUserId: acceptorDiscordId,
      crafterCharacterId: acceptorCharacterId,
      commissionerDiscordId: reserved.requesterDiscordId,
      commissionerCharacterName: reserved.requesterCharacterName,
      craftItemName: reserved.craftItemName,
      elixirTier: reserved.elixirTier ?? null,
      elixirMaterialSelections: elixirSels,
    });
  } catch (e) {
    logger.error(sourceTag, `executeWorkshopCommissionCraft threw: ${e.message}`);
    await revertToOpen();
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Craft failed')
      .setDescription(`Something went wrong running the craft — commission was **re-opened**.\n\`${e.message}\``);
  }

  if (!craftResult.ok) {
    await revertToOpen();
    const errEmb = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Craft blocked')
      .setDescription(craftResult.error || 'Commission was re-opened.');
    if (craftResult.code) errEmb.setFooter({ text: String(craftResult.code) });
    return errEmb;
  }

  logger.info(
    sourceTag,
    `${userTag || acceptorDiscordId} accepted ${mongoRequestId} as ${acceptor.name} — ${reserved.craftItemName}`
  );

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('Workshop commission complete')
    .setDescription(
      `**${reserved.craftItemName}** crafted for **${reserved.requesterCharacterName}**.\n` +
        `Quantity: **${craftResult.craftedQuantity ?? 1}** · Your stamina paid: **${craftResult.crafterStaminaPaid ?? '—'}**`
    )
    .setImage(BORDER);
}

async function tryHandleCraftingAcceptPrefixMessage(message) {
  const parsed = parseCraftingAcceptPrefix(message.content);
  if (parsed.kind === 'noop') return false;

  const reply = async (embed) => {
    try {
      await message.reply({ embeds: [embed] });
    } catch (e) {
      logger.warn('CRAFT_ACCEPT_PREFIX', `reply failed: ${e.message}`);
      await message.channel.send({ embeds: [embed] }).catch(() => {});
    }
  };

  if (parsed.kind === 'help') {
    await reply(usageEmbed());
    return true;
  }
  if (parsed.kind === 'bad_id') {
    await reply(
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Invalid request id')
        .setDescription(
          'Use the workshop code (**K** + 6 digits) from the board embed, or the legacy **24-character** id from the dashboard URL.'
        )
    );
    return true;
  }

  const { requestId, characterName } = parsed;
  const embed = await runWorkshopCraftingAccept({
    requestId,
    characterName,
    userId: message.author.id,
    userTag: message.author.tag,
    sourceTag: 'CRAFT_ACCEPT_PREFIX',
  });
  await reply(embed);
  return true;
}

module.exports = {
  parseCraftingAcceptPrefix,
  tryHandleCraftingAcceptPrefixMessage,
  runWorkshopCraftingAccept,
  usageEmbed,
};
