// ============================================================================
// Blupee minigame: spawns, /minigame blupee, weighted outcomes
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const TableRoll = require('@/models/TableRollModel');
const TempData = require('@/models/TempDataModel');
const User = require('@/models/UserModel');
const ModCharacter = require('@/models/ModCharacterModel');
const TokenTransaction = require('@/models/TokenTransactionModel');
const Quest = require('@/models/QuestModel');
const { connectToTinglebot } = require('@/database/db');
const { getMinigameCommandId } = require('../embeds/embeds');
const logger = require('@/utils/logger');
const { handleInteractionError } = require('@/utils/globalErrorHandler');

const BLUPEE_TABLE_NAME = 'blupee';
/** Interactive Blupee season quests are recognized by title (not quest table-roll metadata). */
const BLUPEE_QUEST_TITLE_RE = /\bblupee\b/i;
const TEST_CHANNEL_ID = '1391812848099004578';
const SYSTEM_CREATOR = 'blupee-system';
const BLUPEE_CATCH_TOKEN_REWARD = 25;
// Mods get a small near-miss upgrade to keep catch rare.
// With totalWeight=100 and base catch only at ticket=100 (1%), upgrading ticket=99 with 25%
// makes overall catch chance ~1% + 0.25% = 1.25% (about 25% more likely).
const BLUPEE_MOD_NEAR_MISS_UPGRADE_PROB = 0.25;
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

function normalizeSnowflake(id) {
  if (id == null || id === '') return null;
  return String(id).trim();
}

function getTownHallIdSet() {
  const ids = new Set(
    [process.env.RUDANIA_TOWNHALL, process.env.INARIKO_TOWNHALL, process.env.VHINTL_TOWNHALL]
      .filter(Boolean)
      .map((x) => normalizeSnowflake(x))
  );
  return ids;
}

function getBlupeeVillageFromStateKey(stateKey) {
  const sk = normalizeSnowflake(stateKey);
  if (!sk) return null;
  if (sk === normalizeSnowflake(process.env.RUDANIA_TOWNHALL)) return 'Rudania';
  if (sk === normalizeSnowflake(process.env.INARIKO_TOWNHALL)) return 'Inariko';
  if (sk === normalizeSnowflake(process.env.VHINTL_TOWNHALL)) return 'Vhintl';
  return null;
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
 * Agenda: every minute. In April, spawns at 6 random UTC times per day in each town hall.
 */
async function runBlupeeAutoSpawnTick(client) {
  const now = new Date();
  if (!isAprilUtc(now)) return;

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
        'data.userId': userId,
        'data.seasonKey': seasonKey,
        // Do not set data.count on insert; $inc updates it safely and avoids Mongo path conflicts.
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
  const cid = normalizeSnowflake(channelId);
  const pid = normalizeSnowflake(parentId);
  const testId = normalizeSnowflake(TEST_CHANNEL_ID);
  if (pid && halls.has(pid)) return pid;
  if (cid && halls.has(cid)) return cid;
  if (cid && testId && cid === testId) return cid;
  if (pid && testId && pid === testId) return testId;
  return cid || channelId;
}

/** True if channel or parent is a configured town hall or test channel (including thread → hall). */
function isBlupeeHallGeography(channelId, parentId) {
  const halls = getTownHallIdSet();
  const cid = normalizeSnowflake(channelId);
  const pid = normalizeSnowflake(parentId);
  const testId = normalizeSnowflake(TEST_CHANNEL_ID);
  if (!cid) return false;
  return (
    halls.has(cid) ||
    (pid && halls.has(pid)) ||
    (testId && (cid === testId || pid === testId))
  );
}

/**
 * Slash commands in threads often omit parentId on interaction.channel (partial / cache).
 * Only skip API fetch when used directly in a town hall or test channel (not a thread under it).
 */
async function resolveBlupeeChannelIdsForInteraction(interaction) {
  const channelId = interaction.channelId;
  if (!channelId) return { channelId: null, parentId: null };

  const halls = getTownHallIdSet();
  const cid = normalizeSnowflake(channelId);
  const testId = normalizeSnowflake(TEST_CHANNEL_ID);
  let parentId = normalizeSnowflake(interaction.channel?.parentId ?? null);

  // Used in the town hall or test channel itself (not a thread) — key is this channel
  if (halls.has(cid) || (testId && cid === testId)) {
    return { channelId, parentId };
  }

  const client = interaction.client;
  let guild = interaction.guild;
  if (!guild && interaction.guildId) {
    guild = await client.guilds.fetch(interaction.guildId).catch(() => null);
  }

  const fetchChannel = async () => {
    if (guild?.channels?.fetch) {
      const ch = await guild.channels.fetch(channelId).catch(() => null);
      if (ch?.parentId != null) return ch;
    }
    if (client?.channels?.fetch) {
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (ch?.parentId != null) return ch;
    }
    return null;
  };

  const fetched = await fetchChannel();
  if (fetched?.parentId != null) {
    parentId = normalizeSnowflake(fetched.parentId);
  }

  if (parentId == null && interaction.channel && typeof interaction.channel.fetch === 'function') {
    try {
      const refetched = await interaction.channel.fetch();
      if (refetched?.parentId != null) parentId = normalizeSnowflake(refetched.parentId);
    } catch (_) {
      /* ignore */
    }
  }

  return { channelId, parentId };
}

async function getBlupeeStateKey(interaction) {
  const { channelId, parentId } = await resolveBlupeeChannelIdsForInteraction(interaction);
  return getBlupeeStateKeyFromIds(channelId, parentId);
}

function isTestContextIds(channelId, parentId) {
  const testId = normalizeSnowflake(TEST_CHANNEL_ID);
  const cid = normalizeSnowflake(channelId);
  const pid = normalizeSnowflake(parentId);
  return (testId && cid === testId) || (testId && pid === testId);
}

function canUseBlupeeAt(channelId, parentId) {
  if (isTestContextIds(channelId, parentId)) return true;
  if (isBlupeeHallGeography(channelId, parentId)) return true;
  return false;
}

function getBlupeeCommandMention() {
  const cmdId = getMinigameCommandId();
  return cmdId ? `</minigame blupee:${cmdId}>` : '`/minigame blupee`';
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

function buildBlupeeRollLine(rollResult, outcome = null, ticketOverride = null) {
  const rollValue = Number(rollResult?.rollValue);
  const totalWeight = Number(rollResult?.table?.totalWeight);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null;

  const baseTicket = Number.isFinite(rollValue)
    ? Math.max(1, Math.min(totalWeight, Math.floor(rollValue) + 1))
    : 1;
  const ticket = ticketOverride != null ? ticketOverride : baseTicket;
  const resultLabel =
    outcome === 'catch'
      ? 'Catch!'
      : outcome === 'mud'
        ? 'Mud!'
        : outcome === 'miss'
          ? 'Miss!'
          : 'Result';
  return `🎲 **Roll:** ${ticket} / ${totalWeight}\n📌 **Result:** ${resultLabel}`;
}

/**
 * Blupee season quests: active Interactive quests whose title includes “Blupee”.
 * Catching uses `/minigame blupee` only; no `/tableroll` or quest `tableRollName` is involved in eligibility.
 */
function isBlupeeHuntInteractiveQuest(quest) {
  return BLUPEE_QUEST_TITLE_RE.test(String(quest?.title ?? ''));
}

/**
 * Active Interactive Blupee (title-matched) quest with this user as an active participant.
 */
async function findActiveBlupeeQuestParticipation(userId) {
  try {
    const quests = await Quest.find({
      status: 'active',
      questType: 'Interactive',
      [`participants.${userId}`]: { $exists: true }
    });
    for (const quest of quests) {
      if (!isBlupeeHuntInteractiveQuest(quest)) continue;
      const participant = quest.participants.get(userId);
      if (participant && participant.progress === 'active') {
        return { quest, participant };
      }
    }
  } catch (err) {
    logger.warn('BLUPEE', `findActiveBlupeeQuestParticipation: ${err?.message || err}`);
  }
  return null;
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
  const { channelId, parentId } = await resolveBlupeeChannelIdsForInteraction(interaction);
  const stateKey = getBlupeeStateKeyFromIds(channelId, parentId);
  const actorName = character?.name || character?.characterName || null;
  const actorIconUrl = character?.icon || null;
  const actorLabel = String(actorName || character?.characterID || character?._id || '').trim();
  const actorKey = actorLabel.toLowerCase();

  if (!canUseBlupeeAt(channelId, parentId)) {
    return interaction.editReply({
      content:
        '❌ **Blupee** can only be rolled in a village town hall or in the designated test channel — including **threads** under those halls.'
    });
  }

  if (!isTestContextIds(channelId, parentId)) {
    const questCtx = await findActiveBlupeeQuestParticipation(userId);
    if (!questCtx) {
      const joinQuestEmbed = new EmbedBuilder()
        .setColor(0xff4d4f)
        .setTitle('❌ Join the Blupee Quest First')
        .setDescription(
          'Town-hall Blupee catches require an **active** **Interactive** quest on the board whose title includes **Blupee** ' +
          '(e.g. “One Blupee, Two Blupee”). Use **`/minigame blupee`** to catch — not `/tableroll`.\n\n' +
          'We could not find a matching quest participation for your account.'
        )
        .addFields(
          {
            name: '1 · Find the quest',
            value:
              'On the **quest board**, join this event’s **Interactive** quest — the listing whose **title includes Blupee**.',
            inline: false
          },
          {
            name: '2 · Enroll with `/quest join`',
            value:
              'Run **`/quest join`** and provide:\n' +
              '• **Quest ID** — copy the ID from the board entry for this event’s Blupee quest\n' +
              '• **Character name** — the character you will use with `/minigame blupee` (must match when you catch)',
            inline: false
          },
          {
            name: '3 · Try again here',
            value:
              'Once the quest shows you as **active**, return to this town hall (or the correct channel) and use `/minigame blupee` with the session ID from the spawn message.',
            inline: false
          }
        )
        .setTimestamp()
        .setFooter({ text: 'Blupee' });
      return interaction.editReply({ embeds: [joinQuestEmbed] });
    }
    const qChar = String(questCtx.participant.characterName || '').trim().toLowerCase();
    const rollChar = String(actorLabel || '').trim().toLowerCase();
    if (qChar && rollChar && qChar !== rollChar) {
      return interaction.editReply({
        content:
          `❌ You joined the quest as **${questCtx.participant.characterName}**. Use that character with \`/minigame blupee\`, or leave the quest and rejoin if you need a different character.`
      });
    }
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
  const activeVillage = String(spawnDoc.data?.village || getBlupeeVillageFromStateKey(stateKey) || '').trim() || null;
  const characterVillage = String(character?.currentVillage || character?.homeVillage || '').trim();
  // Bonus and village validation bypasses should apply ONLY to real mod characters
  // that exist in the modcharacters collection.
  const isModCharacter = Boolean(character?._id && await ModCharacter.exists({ _id: character._id }));
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
  if (activeVillage && !isModCharacter) {
    if (!characterVillage || characterVillage.toLowerCase() !== activeVillage.toLowerCase()) {
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

      const villageLockEmbed = new EmbedBuilder()
        .setColor(0xff4d4f)
        .setTitle('❌ Wrong Village For This Blupee Session')
        .setDescription(
          `**${actorName || 'That character'}** is currently in **${characterVillage || 'Unknown'}**.\nThis Blupee session is active in **${activeVillage}**.\n\nMove the character to **${activeVillage}** first, then try again.`
        )
        .setTimestamp()
        .setFooter({ text: 'Blupee' });
      return interaction.editReply({
        embeds: [villageLockEmbed]
      });
    }
  }
  const prev = participantState[userId];
  if (prev === 'mud') {
    const mudLockEmbed = new EmbedBuilder()
      .setColor(0xff4d4f)
      .setTitle('🛑 Mudged — No More Rolls This Spawn')
      .setDescription(
        `You slipped in mud last time.\n\nNo more rolling for you this round.\nTry again after the next Blupee spawn!`
      )
      .setTimestamp()
      .setFooter({ text: 'Blupee' });

    return interaction.editReply({
      embeds: [mudLockEmbed]
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
  let outcome = parseOutcome(entry.item);
  let flavorBody = entry.flavor || '';
  const totalWeight = Number(rollResult?.table?.totalWeight);
  const baseRollValue = Number(rollResult?.rollValue);
  const baseTicket = Number.isFinite(baseRollValue)
    ? Math.max(1, Math.min(totalWeight, Math.floor(baseRollValue) + 1))
    : 1;

  let effectiveTicket = baseTicket;
  // Mods have a small near-miss upgrade so catching stays mostly rare.
  // Example with totalWeight=100: base catch occurs at ticket=100 (1%).
  // Upgrading ticket=99 with 25% probability adds ~0.25% more catches (=~25% more likely).
  if (isModCharacter && baseTicket === totalWeight - 1) {
    if (Math.random() < BLUPEE_MOD_NEAR_MISS_UPGRADE_PROB) {
      effectiveTicket = totalWeight;
    }
  }

  // Only a 100 effective ticket catches the Blupee.
  const finalOutcome =
    effectiveTicket === totalWeight
      ? 'catch'
      : outcome === 'mud'
        ? 'mud'
        : 'miss';

  if (isModCharacter && finalOutcome === 'catch' && outcome !== 'catch') {
    flavorBody =
      "You surge forward with uncanny timing and snatch the Blupee before it can blink. POOF — it's gone, but it left rewards behind!";
  }

  outcome = finalOutcome;
  let rollLine = buildBlupeeRollLine(rollResult, outcome, effectiveTicket);

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
    let rewardsApplied = true;
    try {
      const tokenReward = await awardBlupeeCatchTokens(userId);
      const tally = await incrementBlupeeRupeeTally(userId);
      inventoryParts.push(
        `✅ **+${tokenReward.amount} tokens** awarded. Your balance is now **${tokenReward.balanceAfter}**.`,
        `✅ **+1 Blupee rupee** added to your internal tally. You now have **${tally.total}** for season **${tally.seasonKey}**.`
      );
    } catch (tallyErr) {
      rewardsApplied = false;
      handleInteractionError(tallyErr, 'blupeeModule.js', {
        commandName: 'blupee catch rewards',
        userId
      });
      inventoryParts = ['⚠️ Reward update failed, so this catch was not finalized. The Blupee remains active — please try again.'];
    }

    if (!rewardsApplied) {
      // Restore the spawn so a failed reward write does not consume the event.
      await TempData.findOneAndUpdate(
        { type: 'blupeeSpawn', key: stateKey },
        {
          $set: {
            type: 'blupeeSpawn',
            key: stateKey,
            expiresAt: deleted.expiresAt || new Date(Date.now() + BLUPEE_SPAWN_DURATION_MS),
            data: deleted.data || {
              sessionId: spawnSessionId,
              messageId: null,
              virtual: false,
              participantState: {},
              participantCharacterMap: {}
            }
          }
        },
        { upsert: true }
      );

      const failEmbed = buildBlupeeEmbed({
        outcome: 'miss',
        flavorBody: 'The Blupee slips free while the reward ledger glitches.',
        extraFooter: `try again! ${getBlupeeCommandMention()}`,
        inventoryNote: inventoryParts.join('\n'),
        actorName,
        rollLine,
        actorIconUrl,
        sessionLine
      });
      return interaction.editReply({ embeds: [failEmbed] });
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

/** Discord thread name max length */
const BLUPEE_THREAD_NAME_MAX = 100;
const BLUPEE_THREAD_CREATE_ATTEMPTS = 3;
const BLUPEE_THREAD_RETRY_DELAY_MS = 500;

/**
 * Creates a public thread on the spawn message. Retries startThread, then falls back to channel.threads.create.
 * Returns null only if every path fails (caller should clean up the spawn message).
 */
async function createBlupeeSessionThread(channel, msg, sessionId) {
  const threadName = `🐰 | Blupee ${sessionId}`.slice(0, BLUPEE_THREAD_NAME_MAX);
  const baseOpts = {
    name: threadName,
    autoArchiveDuration: 60,
    reason: 'Blupee session thread'
  };

  for (let i = 0; i < BLUPEE_THREAD_CREATE_ATTEMPTS; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, BLUPEE_THREAD_RETRY_DELAY_MS));
    try {
      if (typeof msg.startThread === 'function') {
        const t = await msg.startThread(baseOpts);
        if (t?.id) return t;
      }
    } catch (e) {
      logger.warn(
        'BLUPEE',
        `startThread attempt ${i + 1}/${BLUPEE_THREAD_CREATE_ATTEMPTS} failed (${sessionId}): ${e.message || e}`
      );
    }
  }

  const parent = msg.channel?.isTextBased?.() ? msg.channel : channel;
  try {
    if (parent?.threads?.create && msg.id) {
      const t = await parent.threads.create({
        ...baseOpts,
        startMessageId: msg.id
      });
      if (t?.id) return t;
    }
  } catch (e) {
    logger.warn('BLUPEE', `threads.create fallback failed (${sessionId}): ${e.message || e}`);
  }

  return null;
}

async function postBlupeeSpawn(channel, options = {}) {
  const imageUrl = getRandomBlupeeImageUrl();
  const stateKey = getBlupeeStateKeyForDiscordChannel(channel);
  const sessionId = generateBlupeeSessionId();
  const forcedVillage = String(options.forcedVillage || '').trim() || null;
  const villageName = forcedVillage || getBlupeeVillageFromStateKey(stateKey);
  const locationLine = villageName ? `📍 **Village:** ${villageName}` : '📍 **Location:** Test / non-village context';

  const baseDescription =
    `✨ A Blupee has been spotted in **${villageName || 'this area'}**! Quick — try to catch it!\n\n${locationLine}\n🧾 **Session ID:** \`${sessionId}\`\nUse ${getBlupeeCommandMention()} with:\n\`id: ${sessionId}\`\n\`charactername: <your character>\`\n\n**First successful catch ends this spawn for everyone** (or it despawns after **15 minutes** if nobody catches it).`;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('✨ A Blupee appears!')
    .setDescription(baseDescription)
    .setImage(imageUrl || BLUPEE_FALLBACK_IMAGE)
    .setFooter({ text: 'Despawns in 15 minutes · Blupee event' })
    .setTimestamp();

  const msg = await channel.send({ embeds: [embed] });
  const thread = await createBlupeeSessionThread(channel, msg, sessionId);

  if (!thread?.id) {
    await msg.delete().catch(() => {});
    throw new Error(
      'Could not create a Blupee session thread. Grant the bot **Create Public Threads** and **Send Messages** in this channel (and use a text or announcement channel).'
    );
  }

  const guildId = channel.guildId || msg.guildId;
  const spawnUrl = typeof msg.url === 'string' ? msg.url : null;
  const linkBits = [];
  if (guildId) {
    linkBits.push(`🧵 [**Jump to session thread**](https://discord.com/channels/${guildId}/${thread.id})`);
  }
  if (spawnUrl) {
    linkBits.push(`[**Jump to spawn**](${spawnUrl})`);
  }
  if (linkBits.length) {
    const withLinks = EmbedBuilder.from(embed).setDescription(`${baseDescription}\n\n${linkBits.join(' · ')}`);
    await msg.edit({ embeds: [withLinks] }).catch((editErr) => {
      logger.warn('BLUPEE', `Failed to add Blupee jump links to spawn embed: ${editErr.message || editErr}`);
    });
  }

  const noticeChannel = thread;

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
          threadId: thread.id,
          village: villageName,
          messageId: msg.id,
          virtual: false,
          participantState: {},
          participantCharacterMap: {}
        }
      }
    },
    { upsert: true }
  );

  scheduleBlupeeTimeoutNotice(noticeChannel, stateKey, sessionId);

  return { message: msg, stateKey, sessionId, threadId: thread.id };
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

function scheduleBlupeeTimeoutNotice(channel, stateKey, sessionId) {
  if (!channel) return;
  setTimeout(async () => {
    try {
      // Only announce timeout if this exact spawn session is still active.
      const timedOut = await TempData.findOneAndDelete({
        type: 'blupeeSpawn',
        key: stateKey,
        'data.sessionId': sessionId
      });
      if (!timedOut) return;

      const liveChannel = await channel.client.channels.fetch(channel.id).catch(() => null);
      if (!liveChannel?.isTextBased()) return;

      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xff4d4f)
        .setTitle('💨 The Blupee Ran Off!')
        .setDescription(`Blupee session **${sessionId}** has ended — it's over!!`)
        .setTimestamp()
        .setFooter({ text: 'Blupee' });

      await liveChannel.send({ embeds: [timeoutEmbed] }).catch(() => {});
    } catch (err) {
      logger.warn('BLUPEE', `Timeout notice failed for session ${sessionId}: ${err.message}`);
    }
  }, BLUPEE_SPAWN_DURATION_MS);
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
  runBlupeeAutoSpawnTick,
  getBlupeeStateKey,
  getBlupeeStatsSnapshot
};
