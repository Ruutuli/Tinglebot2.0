// ============================================================================
// Blupee minigame: spawns, /minigame blupee, weighted outcomes
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const TableRoll = require('@/models/TableRollModel');
const TempData = require('@/models/TempDataModel');
const User = require('@/models/UserModel');
const TokenTransaction = require('@/models/TokenTransactionModel');
const { connectToTinglebot } = require('@/database/db');
const { getMinigameCommandId } = require('../embeds/embeds');
const logger = require('@/utils/logger');
const { handleInteractionError } = require('@/utils/globalErrorHandler');

const BLUPEE_TABLE_NAME = 'blupee';
const TEST_CHANNEL_ID = '1391812848099004578';
const SYSTEM_CREATOR = 'blupee-system';
const BLUPEE_CATCH_TOKEN_REWARD = 25;
/** How long a Blupee “round” stays active (Mongo TTL + roll eligibility). */
const BLUPEE_SPAWN_DURATION_MS = 15 * 60 * 1000;
/** Auto-spawn waves per UTC day during April (Easter event). */
const BLUPEE_AUTO_SPAWNS_PER_DAY = 6;

const BLUPEE_IMAGES = [
  'https://64.media.tumblr.com/e0644def9e3c93975b8f8de49b42d366/d494ff443666a7d7-67/s540x810/2b403639169328c797fbf9e2a2783a3647079448.gif',
  'https://i.pinimg.com/originals/78/e1/d8/78e1d874b06b19f489f2523cd83f4592.gif',
  'https://64.media.tumblr.com/828cdb665990cdb4cda2c4f362eec1b1/0b9e671beb2a906d-f2/s540x810/d26fe1a63bedcb4c9add204130c35a946d07cc1b.gif',
  'https://64.media.tumblr.com/78454595799c875b107225fad59fb315/00c87817d9aa4503-99/s540x810/43343e7ec06d213cf6d5487c4b58fe47fee9f07f.gif',
  'https://64.media.tumblr.com/78454595799c875b107225fad59fb315/00c87817d9aa4503-99/s540x810/43343e7ec06d213cf6d5487c4b58fe47fee9f07f.gif',
  'https://64.media.tumblr.com/1e3643683dc05caa10df5ed6ead9f47b/e3bf8acc8fca22af-33/s640x960/f3f6f20581030ef92b70dfce760ae5ffaff61cbb.gif',
  'https://i.pinimg.com/originals/78/e1/d8/78e1d874b06b19f489f2523cd83f4592.gif'
];
const BLUPEE_FALLBACK_IMAGE = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';

function getTownHallIdSet() {
  const ids = new Set(
    [process.env.RUDANIA_TOWNHALL, process.env.INARIKO_TOWNHALL, process.env.VHINTL_TOWNHALL].filter(Boolean)
  );
  return ids;
}

function getBlupeeVillageFromStateKey(stateKey) {
  if (!stateKey) return null;
  if (stateKey === process.env.RUDANIA_TOWNHALL) return 'Rudania';
  if (stateKey === process.env.INARIKO_TOWNHALL) return 'Inariko';
  if (stateKey === process.env.VHINTL_TOWNHALL) return 'Vhintl';
  return null;
}

function isBlupeeGloballyEnabled() {
  return String(process.env.BLUPEE_ENABLED || '').toLowerCase() === 'true';
}

/** April auto-spawns require BLUPEE_ENABLED; optional BLUPEE_AUTO_SPAWN=false to disable only the scheduler. */
function isBlupeeAutoSpawnEnabled() {
  if (!isBlupeeGloballyEnabled()) return false;
  const v = process.env.BLUPEE_AUTO_SPAWN;
  if (v === undefined || v === '') return true;
  return String(v).toLowerCase() === 'true';
}

function isAprilUtc(date) {
  return date.getUTCMonth() === 3;
}

function utcDateKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function endOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function randomDistinctMinutes(count, maxExclusive) {
  const set = new Set();
  while (set.size < count) {
    set.add(Math.floor(Math.random() * maxExclusive));
  }
  return [...set].sort((a, b) => a - b);
}

function getRandomBlupeeImageUrl() {
  const candidate = BLUPEE_IMAGES[Math.floor(Math.random() * BLUPEE_IMAGES.length)];
  return candidate || BLUPEE_FALLBACK_IMAGE;
}

function generateBlupeeSessionId() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `B${rand}`;
}

async function getOrCreateDailyScheduleDoc() {
  const now = new Date();
  const key = utcDateKey(now);
  let doc = await TempData.findByTypeAndKey('blupeeDailySchedule', key);
  if (doc) return doc;

  const slots = randomDistinctMinutes(BLUPEE_AUTO_SPAWNS_PER_DAY, 1440);
  const expiresAt = endOfUtcDay(now);
  await TempData.create({
    type: 'blupeeDailySchedule',
    key,
    expiresAt,
    data: {
      slots,
      fired: slots.map(() => false)
    }
  });
  doc = await TempData.findByTypeAndKey('blupeeDailySchedule', key);
  const slotLabel = slots
    .map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
    .join(', ');
  logger.info('BLUPEE', `Daily auto-spawn schedule ${key} UTC (${BLUPEE_AUTO_SPAWNS_PER_DAY} random times): ${slotLabel}`);
  return doc;
}

/**
 * Agenda: every minute. In April, when BLUPEE_ENABLED (+ BLUPEE_AUTO_SPAWN), spawns at 6 random UTC times per day in each town hall.
 */
async function runBlupeeAutoSpawnTick(client) {
  const now = new Date();
  if (!isAprilUtc(now) || !isBlupeeAutoSpawnEnabled()) return;

  await connectToTinglebot();

  const doc = await getOrCreateDailyScheduleDoc();
  if (!doc?.data?.slots?.length) return;

  const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  const slots = doc.data.slots;
  const fired = [...(doc.data.fired || [])];
  const idx = slots.findIndex((s, i) => s === minuteOfDay && !fired[i]);
  if (idx === -1) return;

  const guildId = process.env.GUILD_ID;
  if (!guildId || !client) {
    logger.warn('BLUPEE', 'Auto-spawn skipped: missing GUILD_ID or Discord client');
    return;
  }

  let guild;
  try {
    guild = await client.guilds.fetch(guildId);
  } catch (e) {
    logger.warn('BLUPEE', `Auto-spawn guild fetch failed: ${e.message}`);
    return;
  }

  const hallIds = [
    process.env.RUDANIA_TOWNHALL,
    process.env.INARIKO_TOWNHALL,
    process.env.VHINTL_TOWNHALL
  ].filter(Boolean);

  for (const id of hallIds) {
    try {
      const ch = await guild.channels.fetch(id);
      if (ch?.isTextBased()) await postBlupeeSpawn(ch);
    } catch (e) {
      logger.warn('BLUPEE', `Auto-spawn failed for channel ${id}: ${e.message}`);
    }
  }

  fired[idx] = true;
  await TempData.findOneAndUpdate(
    { type: 'blupeeDailySchedule', key: doc.key },
    { $set: { 'data.fired': fired } }
  );
  logger.success('BLUPEE', `Auto-spawn wave ${idx + 1}/${slots.length} (${utcDateKey(now)} UTC)`);
}

function testChannelRequiresSpawn() {
  return String(process.env.BLUPEE_TEST_REQUIRE_SPAWN || '').toLowerCase() === 'true';
}

function getRupeeTallySeasonKey(now = new Date()) {
  // Easter/Blupee event happens in April, but keep key by year for easier winner lookups.
  return `${now.getUTCFullYear()}`;
}

function getRupeeTallyDocKey(userId, seasonKey = getRupeeTallySeasonKey()) {
  return `${seasonKey}:${userId}`;
}

async function incrementBlupeeRupeeTally(userId) {
  const seasonKey = getRupeeTallySeasonKey();
  const key = getRupeeTallyDocKey(userId, seasonKey);
  const nextYearStart = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0));

  const updated = await TempData.findOneAndUpdate(
    { type: 'blupeeRupeeTally', key },
    {
      $inc: { 'data.count': 1 },
      $setOnInsert: {
        type: 'blupeeRupeeTally',
        key,
        expiresAt: nextYearStart,
        data: {
          userId,
          seasonKey,
          count: 0
        }
      }
    },
    { upsert: true, new: true }
  );

  return {
    seasonKey,
    total: updated?.data?.count || 1
  };
}

async function getBlupeeStatsSnapshot(userId, limit = 10) {
  const seasonKey = getRupeeTallySeasonKey();
  const keyPrefix = `${seasonKey}:`;
  const docs = await TempData.find({
    type: 'blupeeRupeeTally',
    key: new RegExp(`^${keyPrefix}`),
    expiresAt: { $gt: new Date() }
  }).lean();

  const ranked = docs
    .map((d) => ({
      userId: d?.data?.userId || String(d.key || '').slice(keyPrefix.length),
      count: Number(d?.data?.count || 0)
    }))
    .filter((r) => r.userId && Number.isFinite(r.count) && r.count > 0)
    .sort((a, b) => b.count - a.count);

  const top = ranked.slice(0, Math.max(1, limit));
  const meIndex = ranked.findIndex((r) => r.userId === userId);
  const me = meIndex >= 0 ? ranked[meIndex] : null;

  return {
    seasonKey,
    leaderboard: top,
    totalHunters: ranked.length,
    me: me
      ? {
          userId: me.userId,
          count: me.count,
          rank: meIndex + 1
        }
      : {
          userId,
          count: 0,
          rank: null
        }
  };
}

async function awardBlupeeCatchTokens(userId) {
  const user = await User.findOne({ discordId: userId });
  if (!user) {
    throw new Error(`User not found for token reward: ${userId}`);
  }

  const balanceBefore = user.tokens || 0;
  const balanceAfter = balanceBefore + BLUPEE_CATCH_TOKEN_REWARD;
  user.tokens = balanceAfter;
  await user.save();

  try {
    await TokenTransaction.createTransaction({
      userId: String(userId),
      amount: BLUPEE_CATCH_TOKEN_REWARD,
      type: 'earned',
      category: 'blupee',
      description: 'Blupee catch reward',
      link: '',
      balanceBefore,
      balanceAfter
    });
  } catch (logErr) {
    logger.warn('BLUPEE', `Failed to log Blupee token transaction for ${userId}: ${logErr.message}`);
  }

  return {
    amount: BLUPEE_CATCH_TOKEN_REWARD,
    balanceAfter
  };
}

/** Consolidate threads with their town hall / test channel parent for one shared round. */
function getBlupeeStateKeyFromIds(channelId, parentId) {
  const halls = getTownHallIdSet();
  if (parentId && halls.has(parentId)) return parentId;
  if (halls.has(channelId)) return channelId;
  if (channelId === TEST_CHANNEL_ID) return channelId;
  if (parentId === TEST_CHANNEL_ID) return TEST_CHANNEL_ID;
  return channelId;
}

function getBlupeeStateKey(interaction) {
  return getBlupeeStateKeyFromIds(interaction.channelId, interaction.channel?.parentId ?? null);
}

function isTestContext(interaction) {
  const cid = interaction.channelId;
  const pid = interaction.channel?.parentId;
  return cid === TEST_CHANNEL_ID || pid === TEST_CHANNEL_ID;
}

function isTownHallContext(interaction) {
  const cid = interaction.channelId;
  const pid = interaction.channel?.parentId;
  const halls = getTownHallIdSet();
  return halls.has(cid) || (pid && halls.has(pid));
}

function getBlupeeCommandMention() {
  const cmdId = getMinigameCommandId();
  return cmdId ? `</minigame blupee:${cmdId}>` : '`/minigame blupee`';
}

function canUseBlupeeHere(interaction) {
  if (isTestContext(interaction)) return true;
  if (isTownHallContext(interaction)) return isBlupeeGloballyEnabled();
  return false;
}

function buildTableEntries() {
  const thumbs = BLUPEE_IMAGES;
  return [
    {
      weight: 1,
      item: 'BLUPEE_OUTCOME:mud',
      flavor:
        'You slipped in mud,_ At least you hope it is..._ you have to go home and wash up, no more rolling from you!! 🛑',
      thumbnailImage: thumbs[0]
    },
    {
      weight: 1,
      item: 'BLUPEE_OUTCOME:mud',
      flavor:
        'You dive heroically... straight into a puddle. The Blupee watches in silent judgment. You are done for this round. 🛑',
      thumbnailImage: thumbs[0]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        "... You don't even get close! The blupee runs off!<:blupee:679149916077031424> ",
      thumbnailImage: thumbs[1]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'Sneak attack! You tiptoe towards the glowing creature...but -SNAP- you step on a branch...it runs. <:blupee:679149916077031424> ',
      thumbnailImage: thumbs[2]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'CHARGE! You rush in, arms stretched out to catch the strange rabbit shaped animal! You lunge! But - oof... you miss... <:blupee:679149916077031424> ',
      thumbnailImage: thumbs[3]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        "You don't know how, but you felt its fur on your fingertips this time! Sadly it still got away....<:blupee:679149916077031424> ",
      thumbnailImage: thumbs[4]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'You throw a perfectly timed net. Unfortunately, you forgot to bring a net. The Blupee applauds your imagination and vanishes.',
      thumbnailImage: thumbs[6]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'You whisper, "pspspsps" like it is a housecat. The Blupee is deeply offended and teleports two feet away, then ten more.',
      thumbnailImage: thumbs[5]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'You execute a flawless combat roll, stand up dramatically, and realize you rolled in the wrong direction. Blupee gone.',
      thumbnailImage: thumbs[2]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'You hold out a carrot like bait. The Blupee sniffs it, judges your strategy, and disappears in sparkles.',
      thumbnailImage: thumbs[1]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'You prepare an advanced hunter stance you saw in a book. The Blupee waits politely for the pose to finish, then leaves.',
      thumbnailImage: thumbs[3]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'You leap from behind a pillar with perfect timing. The Blupee had already moved three seconds ago.',
      thumbnailImage: thumbs[4]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'You try to reason with it: "Please be captured." The Blupee considers this and chooses "no."',
      thumbnailImage: thumbs[6]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'For one glorious moment, you are certain this will work. For one equally glorious moment, the Blupee is gone.',
      thumbnailImage: thumbs[5]
    },
    {
      weight: 7,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'You sprint after the glow, corner it, and reach out-then your boot squeaks. It bolts. Loudly.',
      thumbnailImage: thumbs[2]
    },
    {
      weight: 6,
      item: 'BLUPEE_OUTCOME:miss',
      flavor:
        'You toss your cloak like a net, strike a heroic pose, and reveal you have successfully captured... absolutely nothing.',
      thumbnailImage: thumbs[0]
    },
    {
      weight: 1,
      item: 'BLUPEE_OUTCOME:catch',
      flavor:
        "YOU GOT IT! You wrap your arms around it's tiny glowing body before...POOF -  It's gone. It left something behind though! <:rupee:605910444267536385>",
      thumbnailImage: thumbs[5]
    }
  ];
}

async function ensureBlupeeTable() {
  const entries = buildTableEntries();
  let table = await TableRoll.findOne({ name: BLUPEE_TABLE_NAME });
  if (!table) {
    table = new TableRoll({
      name: BLUPEE_TABLE_NAME,
      entries,
      createdBy: SYSTEM_CREATOR,
      isActive: true,
      maxRollsPerDay: 0
    });
  } else {
    table.entries = entries;
    table.isActive = true;
    table.maxRollsPerDay = 0;
    table.markModified('entries');
  }
  await table.save();
}

function parseOutcome(item) {
  if (!item || typeof item !== 'string') return null;
  const m = item.match(/^BLUPEE_OUTCOME:(mud|miss|catch)$/);
  return m ? m[1] : null;
}

function buildBlupeeEmbed({ outcome, flavorBody, extraFooter, inventoryNote, actorName, rollLine, actorIconUrl, sessionLine }) {
  const safeActor = (actorName || '').trim();
  const header = safeActor ? `**${safeActor}** tried to catch the Blupee!` : 'You attempt to catch a Blupee!';
  const flavorLine = (flavorBody || '').trim();
  const sections = [header];
  if (flavorLine) sections.push(flavorLine);
  if (rollLine) sections.push(rollLine);
  if (sessionLine) sections.push(sessionLine);
  if (extraFooter) sections.push(extraFooter);
  if (inventoryNote) sections.push(inventoryNote);
  const description = sections.join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription(description)
    .setTimestamp();

  if (actorIconUrl) embed.setThumbnail(actorIconUrl);
  embed.setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
  embed.setFooter({ text: 'Blupee' });
  return embed;
}

function buildBlupeeRollLine(rollResult) {
  const rollValue = Number(rollResult?.rollValue);
  const totalWeight = Number(rollResult?.table?.totalWeight);
  if (!Number.isFinite(rollValue) || !Number.isFinite(totalWeight) || totalWeight <= 0) return null;
  const ticket = Math.max(1, Math.min(totalWeight, Math.floor(rollValue) + 1));
  return `🎲 **Roll:** ${ticket} / ${totalWeight}`;
}

/** Remove the spawn announcement message after a catch (best-effort). */
async function deleteSpawnAnnouncementMessage(client, stateKey, messageId) {
  if (!client || !messageId) return;
  try {
    const ch = await client.channels.fetch(stateKey).catch(() => null);
    if (!ch?.isTextBased()) return;
    const msg = await ch.messages.fetch(messageId).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  } catch (_) {
    /* ignore */
  }
}

async function rollBlupee(interaction, character, requestedSessionId) {
  const userId = interaction.user.id;
  const stateKey = getBlupeeStateKey(interaction);
  const actorName = character?.name || character?.characterName || null;
  const actorIconUrl = character?.icon || null;
  const actorLabel = String(actorName || character?.characterID || character?._id || '').trim();
  const actorKey = actorLabel.toLowerCase();

  if (!canUseBlupeeHere(interaction)) {
    return interaction.editReply({
      content:
        '❌ **Blupee** can only be rolled in a village town hall (when the event is enabled) or in the designated test channel.'
    });
  }

  const spawnDoc = await TempData.findByTypeAndKey('blupeeSpawn', stateKey);
  if (!spawnDoc || spawnDoc.data?.virtual) {
    return interaction.editReply({
      content:
        '❌ No Blupee is active here yet. Wait for a moderator to spawn one, or the next scheduled spawn.'
    });
  }

  const participantState = { ...(spawnDoc.data?.participantState || {}) };
  const participantCharacterMap = { ...(spawnDoc.data?.participantCharacterMap || {}) };
  const spawnSessionId = String(spawnDoc.data?.sessionId || '').trim() || null;
  const sessionLine = spawnSessionId ? `🧾 **Session ID:** \`${spawnSessionId}\`` : null;
  const activeVillage = getBlupeeVillageFromStateKey(stateKey);
  const characterVillage = String(character?.currentVillage || character?.homeVillage || '').trim();
  const requestedId = String(requestedSessionId || '').trim();
  if (!requestedId) {
    return interaction.editReply({
      content: '❌ You must provide a Blupee session ID (example: `B123456`).'
    });
  }
  if (!spawnSessionId || requestedId.toUpperCase() !== spawnSessionId.toUpperCase()) {
    return interaction.editReply({
      content:
        `❌ Session ID mismatch. Active Blupee session here is **${spawnSessionId || 'unknown'}**. Use ${getBlupeeCommandMention()} with \`id: ${spawnSessionId || 'BXXXXXX'}\`.`
    });
  }
  if (activeVillage) {
    if (!characterVillage || characterVillage.toLowerCase() !== activeVillage.toLowerCase()) {
      return interaction.editReply({
        content:
          `❌ **${actorName || 'That character'}** is not currently in **${activeVillage}**. Move them there before attempting this Blupee session.`
      });
    }
  }
  const prev = participantState[userId];
  if (prev === 'mud') {
    return interaction.editReply({
      content:
        '❌ You slipped in mud last time — **no more rolling for you this round**. Try again after the next Blupee spawn!'
    });
  }
  if (!actorLabel) {
    return interaction.editReply({
      content: '❌ Could not resolve your character for this Blupee roll. Please try again.'
    });
  }
  const lockedCharacter = participantCharacterMap[userId];
  if (lockedCharacter && String(lockedCharacter).trim().toLowerCase() !== actorKey) {
    const lockEmbed = new EmbedBuilder()
      .setColor(0xff4d4f)
      .setTitle('❌ Character Locked For This Blupee Session')
      .setDescription(
        `You already used **${lockedCharacter}** for Blupee session **${spawnSessionId || 'current'}**.\n\nYou must keep using the same character until this spawn ends.`
      )
      .setTimestamp()
      .setFooter({ text: 'Blupee' });
    return interaction.editReply({
      embeds: [lockEmbed]
    });
  }
  if (!lockedCharacter) {
    participantCharacterMap[userId] = actorLabel;
    await TempData.findOneAndUpdate(
      { type: 'blupeeSpawn', key: stateKey },
      { $set: { 'data.participantCharacterMap': participantCharacterMap } },
      { upsert: false }
    );
  }

  let rollResult;
  try {
    rollResult = await TableRoll.rollOnTable(BLUPEE_TABLE_NAME);
  } catch (err) {
    handleInteractionError(err, 'blupeeModule.js', {
      commandName: 'minigame blupee',
      userId: interaction.user.id
    });
    return interaction.editReply({
      content: '❌ Could not roll the Blupee table. Try again shortly.'
    });
  }

  const entry = rollResult.result;
  const outcome = parseOutcome(entry.item);
  const flavorBody = entry.flavor || '';
  const rollLine = buildBlupeeRollLine(rollResult);

  if (outcome === 'miss') {
    const embed = buildBlupeeEmbed({
      outcome: 'miss',
      flavorBody,
      extraFooter: `try again! ${getBlupeeCommandMention()}`,
      inventoryNote: null,
      actorName,
      rollLine,
      actorIconUrl,
      sessionLine
    });
    return interaction.editReply({ embeds: [embed] });
  }

  if (outcome === 'mud') {
    participantState[userId] = 'mud';
    await TempData.findOneAndUpdate(
      { type: 'blupeeSpawn', key: stateKey },
      { $set: { 'data.participantState': participantState, 'data.messageId': spawnDoc.data?.messageId ?? null, 'data.virtual': !!spawnDoc.data?.virtual } },
      { upsert: false }
    );

    const embed = buildBlupeeEmbed({
      outcome: 'mud',
      flavorBody,
      extraFooter:
        'No more rolling for you this round, try again next time!',
      inventoryNote: null,
      actorName,
      rollLine,
      actorIconUrl,
      sessionLine
    });
    return interaction.editReply({ embeds: [embed] });
  }

  if (outcome === 'catch') {
    const deleted = await TempData.findOneAndDelete({ type: 'blupeeSpawn', key: stateKey });
    if (!deleted) {
      return interaction.editReply({
        content:
          '❌ This Blupee spawn already ended — someone else caught it, or it despawned.'
      });
    }

    let inventoryParts = [];
    try {
      const tokenReward = await awardBlupeeCatchTokens(userId);
      const tally = await incrementBlupeeRupeeTally(userId);
      inventoryParts.push(
        `✅ **+${tokenReward.amount} tokens** awarded. Your balance is now **${tokenReward.balanceAfter}**.`,
        `✅ **+1 Blupee rupee** added to your internal tally. You now have **${tally.total}** for season **${tally.seasonKey}**.`
      );
    } catch (tallyErr) {
      handleInteractionError(tallyErr, 'blupeeModule.js', {
        commandName: 'blupee catch rewards',
        userId
      });
      inventoryParts = ['⚠️ Blupee was caught, but token/rupee reward update failed. A mod should adjust your rewards manually.'];
    }
    if (spawnSessionId) {
      inventoryParts.push(`🧾 **Session:** \`${spawnSessionId}\``);
    }

    await deleteSpawnAnnouncementMessage(interaction.client, stateKey, deleted.data?.messageId);

    const embed = buildBlupeeEmbed({
      outcome: 'catch',
      flavorBody,
      extraFooter:
        '**This spawn is over for everyone** — the Blupee is gone! Most rupees at event end wins the prize.',
      inventoryNote: inventoryParts.join('\n'),
      actorName,
      rollLine,
      actorIconUrl,
      sessionLine
    });
    return interaction.editReply({ embeds: [embed] });
  }

  return interaction.editReply({
    content: '❌ Unexpected Blupee outcome — notify a developer.'
  });
}

function getBlupeeStateKeyForDiscordChannel(channel) {
  return getBlupeeStateKeyFromIds(channel.id, channel.parentId);
}

async function postBlupeeSpawn(channel) {
  const imageUrl = getRandomBlupeeImageUrl();
  const stateKey = getBlupeeStateKeyForDiscordChannel(channel);
  const sessionId = generateBlupeeSessionId();
  const villageName = getBlupeeVillageFromStateKey(stateKey);
  const locationLine = villageName ? `📍 **Village:** ${villageName}` : '📍 **Location:** Test / non-village context';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('✨ A Blupee appears!')
    .setDescription(
      `A glowing creature darts through the town hall… Quick — try to catch it!\n\n${locationLine}\n🧾 **Session ID:** \`${sessionId}\`\nUse ${getBlupeeCommandMention()} with:\n\`id: ${sessionId}\`\n\`charactername: <your character>\`\n\n**First successful catch ends this spawn for everyone** (or it despawns after **15 minutes** if nobody catches it).`
    )
    .setImage(imageUrl || BLUPEE_FALLBACK_IMAGE)
    .setFooter({ text: 'Despawns in 15 minutes · Blupee event' })
    .setTimestamp();

  const msg = await channel.send({ embeds: [embed] });

  const expiresAt = new Date(Date.now() + BLUPEE_SPAWN_DURATION_MS);
  await TempData.findOneAndUpdate(
    { type: 'blupeeSpawn', key: stateKey },
    {
      $set: {
        type: 'blupeeSpawn',
        key: stateKey,
        expiresAt,
        data: {
          sessionId,
          messageId: msg.id,
          virtual: false,
          participantState: {},
          participantCharacterMap: {}
        }
      }
    },
    { upsert: true }
  );

  return { message: msg, stateKey, sessionId };
}

async function getBlupeeStatusSnapshot(stateKey) {
  const doc = await TempData.findByTypeAndKey('blupeeSpawn', stateKey);
  if (!doc) {
    return { active: false, virtual: false, messageId: null, sessionId: null };
  }
  return {
    active: true,
    virtual: !!doc.data?.virtual,
    messageId: doc.data?.messageId || null,
    sessionId: doc.data?.sessionId || null
  };
}

module.exports = {
  BLUPEE_TABLE_NAME,
  TEST_CHANNEL_ID,
  BLUPEE_AUTO_SPAWNS_PER_DAY,
  ensureBlupeeTable,
  rollBlupee,
  postBlupeeSpawn,
  getBlupeeStateKeyForDiscordChannel,
  getBlupeeStatusSnapshot,
  isBlupeeGloballyEnabled,
  isBlupeeAutoSpawnEnabled,
  runBlupeeAutoSpawnTick,
  testChannelRequiresSpawn,
  getBlupeeStateKey,
  getBlupeeStatsSnapshot
};
