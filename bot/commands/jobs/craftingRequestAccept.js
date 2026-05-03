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
  fetchItemByName,
} = require('@/database/db');
const { executeWorkshopCommissionCraft } = require('@/services/workshopCommissionCraft');
const { generateUniqueId } = require('@/utils/uniqueIdUtils');
const logger = require('@/utils/logger');

const BORDER = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
const COMMUNITY_BOARD_CHANNEL_ID =
  process.env.COMMUNITY_BOARD_CHANNEL_ID || '651614266046152705';
const ACCEPT_EMBED_COLOR = 0x5d8aa8;
const GCS_PUBLIC_BASE = 'https://storage.googleapis.com/tinglebot';

function clipAnnounce(s, max) {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** Match dashboard `discordEmbedImageUrl` / public GCS paths for embed images. */
function discordEmbedImageUrlAnnounce(raw) {
  if (!raw || raw === 'No Image') return undefined;
  if (String(raw).startsWith(`${GCS_PUBLIC_BASE}/`)) return String(raw);
  if (String(raw).startsWith('https://') || String(raw).startsWith('http://')) return String(raw);
  const path = String(raw).replace(/^\/+/, '');
  return `${GCS_PUBLIC_BASE}/${path}`;
}

/**
 * Same copy + layout as `buildCraftingRequestAcceptedMessage` in `dashboard/lib/craftingRequestsNotify.ts`.
 * @param {Record<string, unknown>} opts
 * @returns {{ content: string, embed: import('discord.js').EmbedBuilder }}
 */
function buildCraftingRequestAcceptedAnnouncement(opts) {
  const rid = String(opts.requesterDiscordId ?? '').trim();
  const aid = String(opts.acceptorDiscordId ?? '').trim();
  const content = `<@${rid}> <@${aid}>`;

  const forOc = (opts.requesterCharacterName ?? '').trim() || 'Commissioner';
  const mongoRef = String(opts.requestId ?? '').trim();
  const pubCode = String(opts.commissionID ?? '').trim();
  const acceptIdDisplay = (pubCode || mongoRef).trim() || '—';

  const craftedQtyRaw = Number(opts.craftedQuantity);
  const craftedQty =
    Number.isFinite(craftedQtyRaw) && craftedQtyRaw >= 1 ? Math.round(craftedQtyRaw) : 1;
  const craftItemLabel = String(opts.craftItemName ?? '').trim() || 'Item';

  const lines = [
    `🔖 **Commission ID** · \`${acceptIdDisplay}\``,
    '',
    `🧾 **Recipe**`,
    `↳ *${opts.craftItemName}*`,
    '',
    `🎁 **Crafted**`,
    `↳ **${craftedQty}×** *${craftItemLabel}*`,
  ];
  if (craftedQty > 1) {
    const bonus = craftedQty - 1;
    lines.push(
      `↳ _Includes **+${bonus}** from a **crafting boost** (e.g. Entertainer — Song of Double Time). Bonus items used no extra recipe materials._`
    );
  }
  lines.push('');
  lines.push(`⚒️ **Crafter OC** · **${opts.acceptorCharacterName}**`);
  lines.push(`↳ <@${aid}>`);
  lines.push('');
  lines.push(`👤 **For OC** · **${forOc}**`);
  lines.push(`↳ <@${rid}>`);
  lines.push('');
  lines.push('— — — — — —');
  lines.push('');
  lines.push(`📦 **Items used**`);

  const mats = opts.materialsUsed ?? [];
  const maxMatLines = 18;
  if (mats.length > 0) {
    for (const m of mats.slice(0, maxMatLines)) {
      const q = Math.max(0, Math.round(Number(m.quantity) || 0));
      const label = String(m.itemName ?? '').trim() || '—';
      lines.push(`↳ **${q}×** ${label}`);
    }
    if (mats.length > maxMatLines) {
      lines.push(`↳ _…and ${mats.length - maxMatLines} more._`);
    }
  } else {
    lines.push(
      '↳ _No line-item breakdown returned — materials were still consumed from the commissioner._'
    );
  }

  lines.push('');
  lines.push('⚡ **Stamina**');
  const craftOc = (opts.acceptorCharacterName ?? '').trim() || 'Crafter';
  if (
    opts.crafterStaminaBefore != null &&
    opts.crafterStaminaAfter != null &&
    Number.isFinite(Number(opts.crafterStaminaBefore)) &&
    Number.isFinite(Number(opts.crafterStaminaAfter))
  ) {
    const used =
      opts.crafterStaminaUsed != null && Number.isFinite(opts.crafterStaminaUsed)
        ? Math.max(0, Math.round(Number(opts.crafterStaminaUsed)))
        : Math.max(
            0,
            Math.round(Number(opts.crafterStaminaBefore) - Number(opts.crafterStaminaAfter))
          );
    lines.push(
      `↳ **${craftOc}**'s stamina · ${Math.round(Number(opts.crafterStaminaBefore))} → ${Math.round(
        Number(opts.crafterStaminaAfter)
      )} _(used ${used} stamina)_`
    );
  } else {
    lines.push(`↳ **${craftOc}** — stamina was deducted when the craft completed.`);
  }

  if (
    String(opts.teacherCharacterName ?? '').trim() &&
    opts.teacherStaminaBefore != null &&
    opts.teacherStaminaAfter != null &&
    Number.isFinite(Number(opts.teacherStaminaBefore)) &&
    Number.isFinite(Number(opts.teacherStaminaAfter))
  ) {
    const tu =
      opts.teacherStaminaUsed != null && Number.isFinite(opts.teacherStaminaUsed)
        ? Math.max(0, Math.round(Number(opts.teacherStaminaUsed)))
        : Math.max(
            0,
            Math.round(Number(opts.teacherStaminaBefore) - Number(opts.teacherStaminaAfter))
          );
    const tn = String(opts.teacherCharacterName).trim();
    lines.push(
      `↳ **${tn}** (Teacher) stamina · ${Math.round(Number(opts.teacherStaminaBefore))} → ${Math.round(
        Number(opts.teacherStaminaAfter)
      )} _(used ${tu} stamina)_`
    );
  }

  lines.push('');
  lines.push('💰 **Payment**');
  lines.push(
    '↳ Send any agreed **payment** with the **gift** command (through the bot)—match what was listed on the workshop post and in the notes.'
  );

  if (String(opts.paymentOffer ?? '').trim()) {
    lines.push('');
    lines.push('💰 **Offer on the post**');
    lines.push(`↳ ${clipAnnounce(String(opts.paymentOffer).trim(), 280)}`);
  }

  let description = lines.join('\n');
  if (description.length > 4096) {
    description = `${description.slice(0, 4092)}…`;
  }

  const requesterIconUrl = discordEmbedImageUrlAnnounce(opts.requesterCharacterIcon);
  const acceptorIconUrl = discordEmbedImageUrlAnnounce(opts.acceptorCharacterIcon);
  const thumbUrl = discordEmbedImageUrlAnnounce(opts.craftItemImage);

  const authorName = forOc.slice(0, 256) || 'Commissioner';
  const crafterLabel = (opts.acceptorCharacterName ?? '').trim() || 'Crafter';

  const embed = new EmbedBuilder()
    .setTitle('✅ Workshop commission accepted')
    .setDescription(description)
    .setColor(ACCEPT_EMBED_COLOR)
    .setTimestamp(new Date())
    .setImage(BORDER);

  embed.setAuthor({
    name: authorName,
    ...(requesterIconUrl ? { iconURL: requesterIconUrl } : {}),
  });

  embed.setFooter({
    text: `🪵 ${crafterLabel} · crafter · ${acceptIdDisplay}`.slice(0, 2048),
    ...(acceptorIconUrl ? { iconURL: acceptorIconUrl } : {}),
  });

  if (thumbUrl) {
    embed.setThumbnail(thumbUrl);
  }

  return { content, embed };
}

/** Posts the rich “accepted” message to the workshop community board (same channel as dashboard `notifyCraftingRequestAccepted`). */
async function postCraftingRequestAcceptedToCommunityBoard(client, opts) {
  if (!COMMUNITY_BOARD_CHANNEL_ID || !client?.channels?.fetch) return;

  const { content, embed } = buildCraftingRequestAcceptedAnnouncement(opts);
  const channel = await client.channels.fetch(COMMUNITY_BOARD_CHANNEL_ID).catch(() => null);
  if (!channel || typeof channel.send !== 'function') {
    logger.warn('CRAFT_ACCEPT_ANNOUNCE', `Could not use community board channel ${COMMUNITY_BOARD_CHANNEL_ID}`);
    return;
  }

  const userIds = [
    String(opts.requesterDiscordId ?? '').trim(),
    String(opts.acceptorDiscordId ?? '').trim(),
  ].filter(Boolean);

  await channel.send({
    content,
    embeds: [embed],
    allowedMentions: { users: userIds },
  });
}

function isMongoObjectId24(s) {
  return /^[a-fA-F0-9]{24}$/.test(String(s || '').trim());
}

/** Strip quotes/backticks and `#` so pasted Discord/Markdown ids still resolve. */
function sanitizeCraftingAcceptToken(raw) {
  let s = String(raw ?? '').trim();
  while (
    (s.startsWith('`') && s.endsWith('`')) ||
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('#')) s = s.slice(1).trim();
  return s;
}

/** If the user pasted a dashboard URL or stray text, recover a 24-char hex id when present. */
function tryExtractObjectIdFromPastedRequestToken(raw) {
  const s = String(raw || '').trim();
  if (isMongoObjectId24(s)) return s;
  const m = s.match(/\b([a-fA-F0-9]{24})\b/);
  return m && isMongoObjectId24(m[1]) ? m[1] : null;
}

async function revertCraftingRequestToOpen(mongoRequestId, sourceTag) {
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await CraftingRequest.findByIdAndUpdate(mongoRequestId, {
        $set: {
          status: 'open',
          acceptedAt: null,
          acceptedByUserId: null,
          acceptedByCharacterId: null,
          acceptedByCharacterName: '',
        },
      }).exec();
      return { ok: true };
    } catch (e) {
      lastErr = e;
      logger.warn(
        sourceTag,
        `revertCraftingRequestToOpen attempt ${attempt + 1}/3 failed: ${e && e.message ? e.message : e}`
      );
      if (attempt < 2) await delay(120 * (attempt + 1));
    }
  }
  logger.error(
    sourceTag,
    `revertCraftingRequestToOpen FAILED for ${mongoRequestId} — commission may need manual reopen: ${lastErr && lastErr.message ? lastErr.message : lastErr}`
  );
  return { ok: false, lastError: lastErr };
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

/**
 * Persist a public **K######** on legacy open rows (matches dashboard `ensureCraftingRequestCommissionId`).
 * Used by `/crafting accept` autocomplete so choices are never Mongo `_id` when a K code can exist.
 */
async function ensureCraftingRequestCommissionId(CraftingRequestModel, doc) {
  const existing =
    typeof doc.commissionID === 'string' && doc.commissionID.trim()
      ? doc.commissionID.trim()
      : '';
  if (existing) return existing;

  const oid = doc._id;

  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = generateUniqueId('K');
    try {
      const updated = await CraftingRequestModel.findOneAndUpdate(
        {
          _id: oid,
          $or: [{ commissionID: null }, { commissionID: { $exists: false } }, { commissionID: '' }],
        },
        { $set: { commissionID: candidate } },
        { new: true, lean: true }
      ).exec();
      const cid =
        updated &&
        typeof updated === 'object' &&
        typeof updated.commissionID === 'string' &&
        updated.commissionID.trim()
          ? updated.commissionID.trim()
          : '';
      if (cid) return cid;
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? e.code : undefined;
      if (code !== 11000) throw e;
    }
    const refetch = await CraftingRequestModel.findById(oid).select('commissionID').lean().exec();
    const rid =
      refetch &&
      typeof refetch === 'object' &&
      typeof refetch.commissionID === 'string' &&
      refetch.commissionID.trim()
        ? refetch.commissionID.trim()
        : '';
    if (rid) return rid;
  }

  const last = await CraftingRequestModel.findById(oid).select('commissionID').lean().exec();
  if (
    last &&
    typeof last === 'object' &&
    typeof last.commissionID === 'string' &&
    last.commissionID.trim()
  ) {
    return last.commissionID.trim();
  }

  throw new Error('Could not assign workshop commission ID');
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
  let id = sanitizeCraftingAcceptToken(parts[0]);
  const extractedOid = tryExtractObjectIdFromPastedRequestToken(id);
  if (!isValidRequestLookupToken(id) && extractedOid) id = extractedOid;
  const characterName = parts.slice(1).join(' ');
  if (!isValidRequestLookupToken(id)) return { kind: 'bad_id' };
  return { kind: 'accept', requestId: id, characterName };
}

async function fetchCharacterForDiscordUser(characterName, discordUserId, sourceTag = 'CRAFT_ACCEPT_CHAR') {
  try {
    let c = await fetchCharacterByNameAndUserId(characterName, discordUserId);
    if (!c) c = await fetchModCharacterByNameAndUserId(characterName, discordUserId);
    return c;
  } catch (e) {
    logger.warn(sourceTag, `character lookup failed for "${characterName}": ${e.message}`);
    return null;
  }
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
 * @param {{ requestId: string, characterName: string, userId: string, userTag?: string, sourceTag?: string, client?: import('discord.js').Client | null }} opts
 * @returns {Promise<import('discord.js').EmbedBuilder>}
 */
async function runWorkshopCraftingAccept({
  requestId: requestIdRaw,
  characterName: characterNameRaw,
  userId: acceptorDiscordId,
  userTag,
  sourceTag = 'CRAFT_ACCEPT',
  client = null,
}) {
  let requestToken = sanitizeCraftingAcceptToken(requestIdRaw);
  const extractedOid = tryExtractObjectIdFromPastedRequestToken(requestToken);
  if (!isValidRequestLookupToken(requestToken) && extractedOid) {
    requestToken = extractedOid;
  }
  const characterName = String(characterNameRaw || '').trim();

  if (!isValidRequestLookupToken(requestToken)) {
    logger.warn(
      sourceTag,
      `[CRAFT_ACCEPT_INVALID_TOKEN] acceptor=${acceptorDiscordId} tokenLen=${requestToken.length} token=${JSON.stringify(
        requestToken
      )} (expected K + 6 digits, or 24-char hex ObjectId)`
    );
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

  try {
    await connectToTinglebot();
  } catch (e) {
    logger.error(sourceTag, `connectToTinglebot failed: ${e.message}`);
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Database unavailable')
      .setDescription(
        'Could not reach the game database. Wait a moment and try again. If this persists, ping staff.'
      );
  }

  let reqDoc;
  try {
    reqDoc = await findCraftingRequestForAccept(requestToken);
  } catch (e) {
    logger.error(sourceTag, `findCraftingRequestForAccept failed: ${e.message}`);
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Lookup failed')
      .setDescription('Could not load that commission from the database. Try again in a few seconds.');
  }
  if (!reqDoc || reqDoc.status !== 'open') {
    const isOid = isMongoObjectId24(requestToken);
    const codeNorm = normalizeWorkshopCommissionCode(requestToken);
    const lookupMode = isOid ? 'byObjectId' : codeNorm ? `byCommissionID:${codeNorm}` : 'unknown';
    const reason = !reqDoc ? 'not_found_in_db' : `wrong_status:${reqDoc.status}`;
    const detail = reqDoc
      ? `docId=${String(reqDoc._id)} storedCommissionID=${reqDoc.commissionID ?? 'null'} status=${reqDoc.status}`
      : 'no_matching_document';
    logger.warn(
      sourceTag,
      `[CRAFT_ACCEPT_UNAVAILABLE] reason=${reason} lookupMode=${lookupMode} ${detail} token=${JSON.stringify(
        requestToken
      )} acceptor=${acceptorDiscordId}`
    );
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

  const acceptor = await fetchCharacterForDiscordUser(characterName, acceptorDiscordId, sourceTag);
  if (!acceptor) {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Character not found')
      .setDescription(`No OC named **${characterName.trim()}** on your roster for this Discord account.`);
  }

  const acceptorCharacterId = String(acceptor._id);

  const requesterChar = await fetchCharacterForDiscordUser(
    reqDoc.requesterCharacterName,
    reqDoc.requesterDiscordId,
    sourceTag
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
  let reserved;
  try {
    reserved = await CraftingRequest.findOneAndUpdate(
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
  } catch (e) {
    logger.error(sourceTag, `findOneAndUpdate reserve commission failed: ${e.message}`);
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Could not reserve commission')
      .setDescription('Database error while locking this request. Try again shortly.');
  }

  if (!reserved) {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Could not lock commission')
      .setDescription('Someone else may have accepted it first, or you cannot accept your own request.');
  }

  const revertToOpen = async () => revertCraftingRequestToOpen(mongoRequestId, sourceTag);

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
      craftItemMongoId: reserved.craftItemMongoId ?? null,
      elixirTier: reserved.elixirTier ?? null,
      elixirMaterialSelections: elixirSels,
    });
  } catch (e) {
    logger.error(sourceTag, `executeWorkshopCommissionCraft threw: ${e.message}`);
    const rev = await revertToOpen();
    const emb = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Craft failed')
      .setDescription(`Something went wrong running the craft — commission was **re-opened**.\n\`${e.message}\``);
    const foot = [];
    if (!rev.ok) foot.push('If it still shows as taken, ask staff to reopen it.');
    if (foot.length) emb.setFooter({ text: foot.join(' ') });
    return emb;
  }

  if (!craftResult.ok) {
    const rev = await revertToOpen();
    const errEmb = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Craft blocked')
      .setDescription(craftResult.error || 'Commission was re-opened.');
    const foot = [];
    if (craftResult.code) foot.push(String(craftResult.code));
    if (!rev.ok) foot.push('Revert may have failed — staff may need to reopen.');
    if (foot.length) errEmb.setFooter({ text: foot.slice(0, 2).join(' · ') });
    return errEmb;
  }

  logger.info(
    sourceTag,
    `${userTag || acceptorDiscordId} accepted ${mongoRequestId} as ${acceptor.name} — ${reserved.craftItemName}`
  );

  if (client && typeof client.channels?.fetch === 'function') {
    try {
      let craftItemImage;
      try {
        const itemDoc = await fetchItemByName(reserved.craftItemName);
        if (itemDoc && typeof itemDoc.image === 'string') {
          craftItemImage = itemDoc.image;
        }
      } catch (itemErr) {
        logger.warn(sourceTag, `fetchItemByName for accept announce: ${itemErr.message}`);
      }
      await postCraftingRequestAcceptedToCommunityBoard(client, {
        requestId: mongoRequestId,
        commissionID: reserved.commissionID ? String(reserved.commissionID) : undefined,
        requesterDiscordId: reserved.requesterDiscordId,
        acceptorDiscordId,
        acceptorCharacterName: acceptor.name,
        craftItemName: reserved.craftItemName,
        craftedQuantity: craftResult.craftedQuantity ?? 1,
        requesterCharacterName: reserved.requesterCharacterName,
        paymentOffer: reserved.paymentOffer,
        craftItemImage,
        materialsUsed: craftResult.materialsUsed,
        crafterStaminaBefore: craftResult.crafterStaminaBefore ?? null,
        crafterStaminaAfter: craftResult.crafterStaminaAfter ?? null,
        crafterStaminaUsed: craftResult.crafterStaminaUsed ?? null,
        teacherCharacterName: craftResult.teacherCharacterName,
        teacherStaminaBefore: craftResult.teacherStaminaBefore ?? null,
        teacherStaminaAfter: craftResult.teacherStaminaAfter ?? null,
        teacherStaminaUsed: craftResult.teacherStaminaUsed ?? null,
        requesterCharacterIcon: requesterChar.icon,
        acceptorCharacterIcon: acceptor.icon,
      });
    } catch (annErr) {
      logger.warn(sourceTag, `Community board accepted embed failed: ${annErr.message}`);
    }
  }

  const qty = Math.max(1, Math.round(Number(craftResult.craftedQuantity) || 1));
  const boosterNote =
    qty > 1
      ? `\n_Bonus output includes **+${qty - 1}** from a crafting boost (e.g. Song of Double Time)._`
      : '';

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('Workshop commission complete')
    .setDescription(
      `**${reserved.craftItemName}** crafted for **${reserved.requesterCharacterName}**.\n` +
        `Quantity: **${qty}** · Your stamina paid: **${craftResult.crafterStaminaPaid ?? '—'}**` +
        boosterNote
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
    client: message.client,
  });
  await reply(embed);
  return true;
}

module.exports = {
  parseCraftingAcceptPrefix,
  tryHandleCraftingAcceptPrefixMessage,
  runWorkshopCraftingAccept,
  usageEmbed,
  ensureCraftingRequestCommissionId,
};
