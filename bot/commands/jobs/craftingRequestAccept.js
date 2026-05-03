// ============================================================================
// Prefix command: accept dashboard-posted workshop commissions from Discord.
// Usage:
//   ?crafting accept <requestMongoId> <your crafter OC name>
//   ?crafting request accept <requestMongoId> <your crafter OC name>
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
  if (!/^[a-fA-F0-9]{24}$/.test(id)) return { kind: 'bad_id' };
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
        '`?crafting accept <requestId> <your OC name>`\n' +
        '`?crafting request accept <requestId> <your OC name>`\n\n' +
        '• **requestId** — the commission id from the workshop board / dashboard URL (`crafting-requests`).\n' +
        '• **your OC name** — the character taking the job (must match job/village rules).\n\n' +
        '_You cannot accept your own commission._'
    )
    .setImage(BORDER)
    .setFooter({ text: 'Requests are created on the website — this command only accepts.' });
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
        .setDescription('Use the **24-character** Mongo id from the dashboard (same as in the commission URL).')
    );
    return true;
  }

  const { requestId, characterName } = parsed;

  await connectToTinglebot();

  const reqDoc = await CraftingRequest.findById(requestId).exec();
  if (!reqDoc || reqDoc.status !== 'open') {
    await reply(
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Commission not available')
        .setDescription('That request was not found or is no longer **open**.')
    );
    return true;
  }

  const acceptorDiscordId = message.author.id;
  if (reqDoc.requesterDiscordId === acceptorDiscordId) {
    await reply(
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Cannot accept')
        .setDescription('You cannot accept your own workshop commission.')
    );
    return true;
  }

  const acceptor = await fetchCharacterForDiscordUser(characterName, acceptorDiscordId);
  if (!acceptor) {
    await reply(
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Character not found')
        .setDescription(`No OC named **${characterName.trim()}** on your roster for this Discord account.`)
    );
    return true;
  }

  const acceptorCharacterId = String(acceptor._id);

  const requesterChar = await fetchCharacterForDiscordUser(
    reqDoc.requesterCharacterName,
    reqDoc.requesterDiscordId
  );
  if (!requesterChar) {
    await reply(
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Commissioner OC missing')
        .setDescription('Could not load the commissioner character from the database.')
    );
    return true;
  }

  const villageCheck = workshopVillagesCompatible(
    requesterChar.name,
    requesterChar.currentVillage,
    acceptor.name,
    acceptor.currentVillage
  );
  if (!villageCheck.ok) {
    await reply(
      new EmbedBuilder().setColor(0xe74c3c).setTitle('Village mismatch').setDescription(villageCheck.error)
    );
    return true;
  }

  if (reqDoc.targetMode === 'specific') {
    const tid = reqDoc.targetCharacterId ? String(reqDoc.targetCharacterId) : '';
    if (!tid || tid !== acceptorCharacterId) {
      await reply(
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('Named commission only')
          .setDescription(
            `This post is for a **specific** crafter OC — **${acceptor.name}** is not the named artisan.`
          )
      );
      return true;
    }
  }

  const acceptedAt = new Date();
  const reserved = await CraftingRequest.findOneAndUpdate(
    {
      _id: requestId,
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
    await reply(
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Could not lock commission')
        .setDescription('Someone else may have accepted it first, or you cannot accept your own request.')
    );
    return true;
  }

  const revertToOpen = async () => {
    await CraftingRequest.findByIdAndUpdate(requestId, {
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
    logger.error('CRAFT_ACCEPT_PREFIX', `executeWorkshopCommissionCraft threw: ${e.message}`);
    await revertToOpen();
    await reply(
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Craft failed')
        .setDescription(`Something went wrong running the craft — commission was **re-opened**.\n\`${e.message}\``)
    );
    return true;
  }

  if (!craftResult.ok) {
    await revertToOpen();
    const errEmb = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Craft blocked')
      .setDescription(craftResult.error || 'Commission was re-opened.');
    if (craftResult.code) errEmb.setFooter({ text: String(craftResult.code) });
    await reply(errEmb);
    return true;
  }

  logger.info(
    'CRAFT_ACCEPT_PREFIX',
    `${message.author.tag} accepted ${requestId} as ${acceptor.name} — ${reserved.craftItemName}`
  );

  await reply(
    new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Workshop commission complete')
      .setDescription(
        `**${reserved.craftItemName}** crafted for **${reserved.requesterCharacterName}**.\n` +
          `Quantity: **${craftResult.craftedQuantity ?? 1}** · Your stamina paid: **${craftResult.crafterStaminaPaid ?? '—'}**`
      )
      .setImage(BORDER)
  );
  return true;
}

module.exports = {
  parseCraftingAcceptPrefix,
  tryHandleCraftingAcceptPrefixMessage,
};
