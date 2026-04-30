// ============================================================================
// OC reservation intake + member cap tracker (Discord roster / slots)
// ============================================================================

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Character = require('@/models/CharacterModel');
const OcReservation = require('@/models/OcReservationModel');
const MemberCapTracker = require('@/models/MemberCapTrackerModel');
const logger = require('@/utils/logger');

const FILE = 'MEMBER_CAP';

const BORDER_IMAGE =
  'https://storage.googleapis.com/tinglebot/Graphics/border.png';

const OC_RESERVE_CHANNEL_ID =
  process.env.OC_RESERVE_CHANNEL_ID || '814567241101475932';
const MEMBER_CAP_TRACKER_CHANNEL_ID =
  process.env.MEMBER_CAP_TRACKER_CHANNEL_ID || '658148069212422194';
const INACTIVE_ROLE_ID =
  process.env.INACTIVE_MEMBER_ROLE_ID || '788148064182730782';
const TRAVELER_ROLE_ID =
  process.env.TRAVELER_ROLE_ID || '788137818135330837';

/** Discord resident roles only — matches scripts/reportVillageRoster.js (voice-style counts). */
const RESIDENT_ROLE_IDS = {
  rudania: '630837341124034580',
  inariko: '631507660524486657',
  vhintl: '631507736508629002',
};

const VILLAGES = ['rudania', 'inariko', 'vhintl'];

/** Villages this member holds a resident role for (same IDs as roster report). */
function villagesFromRoles(member) {
  const found = [];
  for (const v of VILLAGES) {
    const rid = RESIDENT_ROLE_IDS[v];
    if (rid && member.roles.cache.has(rid)) found.push(v);
  }
  return found;
}

/** Roots.Admin + optional env — same rule as scripts/reportVillageRoster.js. */
const ROOTS_ADMIN_USER_ID = '668281042414600212';

function excludedFromMemberCountsIds() {
  const ids = new Set([ROOTS_ADMIN_USER_ID]);
  String(process.env.VILLAGE_ROSTER_EXCLUDED_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((id) => ids.add(id));
  return ids;
}

/** Match embed title in buildTrackerEmbed — used to find an existing tracker post in-channel. */
const TRACKER_EMBED_TITLE = 'Member cap tracker';

/** Server custom emoji IDs for tracker + mod reactions (override via env). */
const VILLAGE_CUSTOM_EMOJI_ID = {
  rudania: process.env.MEMBER_CAP_EMOJI_RUDANIA_ID || '899492917452890142',
  inariko: process.env.MEMBER_CAP_EMOJI_INARIKO_ID || '899493009073274920',
  vhintl: process.env.MEMBER_CAP_EMOJI_VHINTL_ID || '899492879205007450',
};

function villageEmojiMarkup(key) {
  const name =
    key === 'rudania' ? 'rudania' : key === 'inariko' ? 'inariko' : 'vhintl';
  const id = VILLAGE_CUSTOM_EMOJI_ID[key];
  if (!id) return villageDisplay(key);
  return `<:${name}:${id}>`;
}

function villageEmojiIdToKey() {
  const map = {};
  for (const v of VILLAGES) {
    const id = VILLAGE_CUSTOM_EMOJI_ID[v];
    if (id) map[String(id)] = v;
  }
  return map;
}

function villageCaps() {
  return {
    rudania: parseInt(process.env.MEMBER_CAP_RUDANIA || '20', 10),
    inariko: parseInt(process.env.MEMBER_CAP_INARIKO || '20', 10),
    vhintl: parseInt(process.env.MEMBER_CAP_VHINTL || '20', 10),
  };
}

function normalizeVillage(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^:+/, '')
    .replace(/:$/, '');
  if (!s) return null;
  if (s === 'rudania') return 'rudania';
  if (s === 'inariko') return 'inariko';
  if (s === 'vhintl' || s === 'vhintle') return 'vhintl';
  return null;
}

/** Strip Discord mention-style custom emojis from a pipe-segment. */
function stripDiscordEmojiTokens(segment) {
  return String(segment || '')
    .replace(/<a?:[\w~]+:\d+>/gi, '')
    .trim();
}

/**
 * Resolve a village from one roster field, e.g. "Rudania", "Rudania:rudania:", "vhintl :foo:".
 */
function extractVillageFromSegment(segment) {
  const cleaned = stripDiscordEmojiTokens(segment);
  if (!cleaned) return null;

  const tryNorm = (s) => normalizeVillage(s);
  let n = tryNorm(cleaned);
  if (n) return n;

  for (const chunk of cleaned.split(':')) {
    n = tryNorm(chunk);
    if (n) return n;
  }

  for (const chunk of cleaned.split(/\s+/)) {
    n = tryNorm(chunk.replace(/[^\w]/g, ''));
    if (n) return n;
  }

  return null;
}

function findVillageInApplicationParts(parts) {
  for (let i = 0; i < parts.length; i++) {
    const v = extractVillageFromSegment(parts[i]);
    if (v) return v;
  }
  return null;
}

function villageDisplay(key) {
  if (key === 'rudania') return 'Rudania';
  if (key === 'inariko') return 'Inariko';
  if (key === 'vhintl') return 'Vhintl';
  return key;
}

/** Accepted playable characters only (same rule as travel handler). */
function acceptedCharacterQuery() {
  return { status: 'accepted' };
}

/**
 * Primary village = home village of the user's earliest accepted character (by ObjectId).
 */
async function buildPrimaryVillageByUser() {
  const accepted = await Character.find(acceptedCharacterQuery())
    .select({ userId: 1, homeVillage: 1, _id: 1 })
    .lean();

  const byUser = new Map();
  for (const c of accepted) {
    if (!byUser.has(c.userId)) byUser.set(c.userId, []);
    byUser.get(c.userId).push(c);
  }

  const primary = new Map();
  for (const [uid, list] of byUser) {
    list.sort((a, b) => String(a._id).localeCompare(String(b._id)));
    const hv = normalizeVillage(list[0].homeVillage);
    if (hv && VILLAGES.includes(hv)) primary.set(uid, hv);
  }
  return primary;
}

async function countAcceptedCharacters(userId) {
  return Character.countDocuments({ ...acceptedCharacterQuery(), userId });
}

async function snapshotOccupancy(guild, primaryByUser, reserveUserIds) {
  const caps = villageCaps();
  const inactivePerVillage = { rudania: 0, inariko: 0, vhintl: 0 };
  const villUserIds = { rudania: [], inariko: [], vhintl: [] };
  /** Members counted via Discord resident role only (pass 1). */
  const residentRoleMembersCount = { rudania: 0, inariko: 0, vhintl: 0 };
  /** Inactive members with no resident role, bucketed by first accepted OC home (pass 2). */
  const ocInactiveSlotCount = { rudania: 0, inariko: 0, vhintl: 0 };
  let activeWithChars = 0;
  let inactiveWithChars = 0;
  const excludedIds = excludedFromMemberCountsIds();

  let inactiveGuildWide = 0;
  for (const m of guild.members.cache.values()) {
    if (m.user.bot) continue;
    if (excludedIds.has(m.id)) continue;
    if (m.roles.cache.has(INACTIVE_ROLE_ID)) inactiveGuildWide++;
  }

  // Pass 1 — Discord resident roles (voice-style); inactive + role counts per village.
  for (const m of guild.members.cache.values()) {
    if (m.user.bot) continue;
    if (excludedIds.has(m.id)) continue;
    const keys = villagesFromRoles(m);
    if (!keys.length) continue;

    const inactive = m.roles.cache.has(INACTIVE_ROLE_ID);
    if (inactive) inactiveWithChars++;
    else activeWithChars++;

    for (const v of keys) {
      villUserIds[v].push(m.id);
      residentRoleMembersCount[v]++;
      if (inactive) inactivePerVillage[v]++;
    }
  }

  // Pass 2 — inactive, no resident role: village from first accepted OC (matches roster script).
  // Still occupies a village slot toward cap.
  for (const m of guild.members.cache.values()) {
    if (m.user.bot) continue;
    if (excludedIds.has(m.id)) continue;
    if (!m.roles.cache.has(INACTIVE_ROLE_ID)) continue;
    if (villagesFromRoles(m).length > 0) continue;

    const pv = primaryByUser.get(m.id);
    if (!pv || !VILLAGES.includes(pv)) continue;

    villUserIds[pv].push(m.id);
    inactivePerVillage[pv]++;
    ocInactiveSlotCount[pv]++;
    inactiveWithChars++;
  }

  const reservations = await OcReservation.find({ guildId: guild.id })
    .select({ village: 1 })
    .lean();
  const reservedPerVillage = { rudania: 0, inariko: 0, vhintl: 0 };
  for (const r of reservations) {
    const vv = normalizeVillage(r.village);
    if (vv && reservedPerVillage[vv] !== undefined) reservedPerVillage[vv]++;
  }

  const slotsRemaining = {};
  for (const v of VILLAGES) {
    const used =
      villUserIds[v].length + reservedPerVillage[v];
    slotsRemaining[v] = caps[v] - used;
  }

  const acceptedIds = new Set(primaryByUser.keys());
  let travelerOnly = 0;
  for (const m of guild.members.cache.values()) {
    if (m.user.bot) continue;
    if (excludedIds.has(m.id)) continue;
    if (!m.roles.cache.has(TRAVELER_ROLE_ID)) continue;
    if (acceptedIds.has(m.id)) continue;
    if (reserveUserIds.has(m.id)) continue;
    // Exclude anyone already counted under a village resident role (avoids double-count in totals).
    if (villagesFromRoles(m).length > 0) continue;
    travelerOnly++;
  }

  const reservationTotal = reservations.length;
  const grandTotal =
    activeWithChars + inactiveWithChars + travelerOnly + reservationTotal;

  return {
    caps,
    activeWithChars,
    inactiveWithChars,
    inactiveGuildWide,
    inactivePerVillage,
    residentRoleMembersCount,
    ocInactiveSlotCount,
    villUserIds,
    reservedPerVillage,
    slotsRemaining,
    travelerOnly,
    reservationTotal,
    grandTotal,
  };
}

function buildTrackerEmbed(snapshot, dateLabel) {
  const r = snapshot.inactivePerVillage.rudania;
  const i = snapshot.inactivePerVillage.inariko;
  const v = snapshot.inactivePerVillage.vhintl;
  const rudUsers = snapshot.villUserIds.rudania.length;
  const inaUsers = snapshot.villUserIds.inariko.length;
  const vhiUsers = snapshot.villUserIds.vhintl.length;
  const rr = snapshot.reservedPerVillage.rudania;
  const ir = snapshot.reservedPerVillage.inariko;
  const vr = snapshot.reservedPerVillage.vhintl;

  const rrRole = snapshot.residentRoleMembersCount.rudania;
  const irRole = snapshot.residentRoleMembersCount.inariko;
  const vrRole = snapshot.residentRoleMembersCount.vhintl;
  const rrOc = snapshot.ocInactiveSlotCount.rudania;
  const irOc = snapshot.ocInactiveSlotCount.inariko;
  const vrOc = snapshot.ocInactiveSlotCount.vhintl;

  const overview =
    `**${snapshot.activeWithChars}** active · resident Discord role (unique)\n` +
    `**${snapshot.inactiveGuildWide}** inactive · server-wide (inactive marker)\n` +
    `**${snapshot.inactiveWithChars}** inactive · counted toward a village (${r} Rudania · ${i} Inariko · ${v} Vhintl) _(role **or** first OC if no resident role)_\n\n` +
    `**${snapshot.travelerOnly}** traveler-only · **${snapshot.reservationTotal}** reserve\n\n` +
    `**Total with Reserved OCs:** **${snapshot.grandTotal}** members`;

  const fmtVillageBlock = (
    key,
    totalToward,
    inactiveCt,
    residentRoleCt,
    ocInactiveCt,
    reserved,
    slotsLeft
  ) => {
    const vsCap = totalToward + reserved;
    const em = villageEmojiMarkup(key);
    return (
      `${em} **${villageDisplay(key)}**\n` +
      `\`${totalToward}\` toward cap (\`${inactiveCt}\` inactive) — \`${residentRoleCt}\` resident role · \`${ocInactiveCt}\` inactive·first OC\n` +
      `\`${reserved}\` reserved → **${vsCap}** vs cap · **${slotsLeft}** slots left`
    );
  };

  const rudBlock = fmtVillageBlock(
    'rudania',
    rudUsers,
    r,
    rrRole,
    rrOc,
    rr,
    snapshot.slotsRemaining.rudania
  );
  const inaBlock = fmtVillageBlock(
    'inariko',
    inaUsers,
    i,
    irRole,
    irOc,
    ir,
    snapshot.slotsRemaining.inariko
  );
  const vhiBlock = fmtVillageBlock(
    'vhintl',
    vhiUsers,
    v,
    vrRole,
    vrOc,
    vr,
    snapshot.slotsRemaining.vhintl
  );

  const villagesCombined =
    `${rudBlock}\n\n${inaBlock}\n\n${vhiBlock}\n\n` +
    `_Per village inactive (above): inactive marker **and** attributed via resident role **or** first accepted OC when they have no resident role._`;

  return new EmbedBuilder()
    .setColor(0xc9a227)
    .setTitle(TRACKER_EMBED_TITLE)
    .setDescription(`**Update ·** ${dateLabel}`)
    .setImage(BORDER_IMAGE)
    .addFields(
      { name: 'Server snapshot', value: overview, inline: false },
      { name: 'Village totals', value: villagesCombined, inline: false },
      {
        name: 'Caps',
        value:
          `${villageEmojiMarkup('rudania')} ${snapshot.caps.rudania} · ` +
          `${villageEmojiMarkup('inariko')} ${snapshot.caps.inariko} · ` +
          `${villageEmojiMarkup('vhintl')} ${snapshot.caps.vhintl}`,
        inline: false,
      }
    )
    .setTimestamp();
}

/**
 * Reuse the live tracker message: DB id first, then scan channel for our embed title.
 * Avoids duplicate posts when the DB row is missing or the message id is stale.
 */
async function resolveTrackerMessage(channel, client, storedMessageId) {
  if (storedMessageId) {
    try {
      const m = await channel.messages.fetch(storedMessageId);
      if (m?.author?.id === client.user.id) return m;
    } catch {
      /* deleted, lost access, or wrong channel */
    }
  }

  try {
    const recent = await channel.messages.fetch({ limit: 75 });
    for (const m of recent.values()) {
      if (m.author?.id !== client.user.id) continue;
      const title = m.embeds?.[0]?.title;
      if (title === TRACKER_EMBED_TITLE) return m;
    }
  } catch (err) {
    logger.warn(FILE, `Tracker channel scan failed: ${err.message}`);
  }

  return null;
}

async function refreshMemberCapTracker(client) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    logger.warn(FILE, 'GUILD_ID unset; skipping member cap tracker refresh');
    return;
  }

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    logger.warn(FILE, 'Could not fetch guild for member cap tracker');
    return;
  }

  await guild.members.fetch().catch(() => null);

  const primaryByUser = await buildPrimaryVillageByUser();
  const reserveUserIds = new Set(await OcReservation.distinct('userId', { guildId: guild.id }));
  const snapshot = await snapshotOccupancy(guild, primaryByUser, reserveUserIds);

  const channel = await client.channels.fetch(MEMBER_CAP_TRACKER_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    logger.warn(FILE, `Tracker channel missing or not text: ${MEMBER_CAP_TRACKER_CHANNEL_ID}`);
    return;
  }

  const dateLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
  const embed = buildTrackerEmbed(snapshot, dateLabel);
  const payload = { embeds: [embed], content: null };

  const doc = await MemberCapTracker.findOne({ guildId: guild.id });
  let msg = await resolveTrackerMessage(channel, client, doc?.messageId);

  if (!msg) {
    msg = await channel.send(payload);
    logger.info(FILE, `Posted new member cap tracker message ${msg.id}`);
  } else {
    await msg.edit(payload);
  }

  await MemberCapTracker.findOneAndUpdate(
    { guildId: guild.id },
    {
      guildId: guild.id,
      channelId: channel.id,
      messageId: msg.id,
    },
    { upsert: true }
  );
}

let trackerRefreshTimer = null;
function scheduleTrackerRefresh(client, ms = 45000) {
  if (trackerRefreshTimer) clearTimeout(trackerRefreshTimer);
  trackerRefreshTimer = setTimeout(async () => {
    trackerRefreshTimer = null;
    try {
      await refreshMemberCapTracker(client);
    } catch (err) {
      logger.error(FILE, `Debounced tracker refresh failed: ${err.message}`);
    }
  }, ms);
}

const TIP_RESERVE_VS_APP =
  '**This channel is for reserves and full roster posts.**\n' +
  '• **Slot reserve (bot tracks it):** exactly **Character Name | Village** — only two fields, nothing else.\n' +
  '• **Mods may also react** with a village emoji (<:rudania:…>, <:inariko:…>, <:vhintl:…>) on someone’s roster post to log that reserve.\n' +
  '• **Full application (roster line):** at minimum **character name** and **home village** (Rudania / Inariko / Vhintl), e.g. `Name | Race | Village | Virtue | Job | Image` per the pinned template.';

const MOD_ROLE_ID_DEFAULT = process.env.MOD_ROLE_ID || '606128760655183882';

async function memberCanModerateReserves(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (MOD_ROLE_ID_DEFAULT && member.roles.cache.has(MOD_ROLE_ID_DEFAULT)) return true;
  return false;
}

/**
 * Persist reservation + announcement embed + tracker refresh (member posts & mod reactions).
 */
async function executeReservationFlow(message, client, options) {
  const {
    villageNorm,
    characterName,
    suppressReserveTips,
    replyIntro,
    moderatorMember,
  } = options;

  await message.guild.members.fetch().catch(() => null);

  const existingReserve = await OcReservation.findOne({
    userId: message.author.id,
    guildId: message.guild.id,
  }).lean();

  const userCharCount = await countAcceptedCharacters(message.author.id);
  const primaryByUser = await buildPrimaryVillageByUser();
  const reserveUserIds = new Set(
    await OcReservation.distinct('userId', { guildId: message.guild.id })
  );
  const snapshot = await snapshotOccupancy(message.guild, primaryByUser, reserveUserIds);

  if (userCharCount === 0) {
    const existingNorm = existingReserve
      ? normalizeVillage(existingReserve.village)
      : null;
    const slotDeltaForTarget = existingNorm === villageNorm ? 0 : 1;
    const pressure =
      snapshot.villUserIds[villageNorm].length +
      snapshot.reservedPerVillage[villageNorm] +
      slotDeltaForTarget;
    if (pressure > snapshot.caps[villageNorm]) {
      await message.reply({
        content: `❌ **${villageDisplay(villageNorm)} is full** for first-character reservations (${snapshot.caps[villageNorm]} slots). Applicant doesn’t have an accepted character yet.`,
      }).catch(() => {});
      return { ok: false, reason: 'full' };
    }
  }

  await OcReservation.findOneAndUpdate(
    { userId: message.author.id },
    {
      userId: message.author.id,
      characterName,
      village: villageNorm,
      guildId: message.guild.id,
      sourceChannelId: message.channel.id,
      sourceMessageId: message.id,
    },
    { upsert: true, new: true }
  );

  const dupChar = await Character.findOne({
    ...acceptedCharacterQuery(),
    name: new RegExp(`^${characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  }).lean();

  const reserveEmbed = new EmbedBuilder()
    .setColor(0xd889a4)
    .setTitle('OC RESERVATION')
    .setImage(BORDER_IMAGE)
    .addFields(
      { name: 'CHARACTER NAME', value: characterName },
      {
        name: 'VILLAGE',
        value: `${villageEmojiMarkup(villageNorm)} ${villageDisplay(villageNorm)}`,
      },
      {
        name: 'APPLICANT',
        value: `${message.author} (${message.author.tag})`,
      },
      {
        name: 'DATE OF RESERVE',
        value: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
      },
      {
        name: 'ORIGINAL MESSAGE',
        value: `[Jump](${message.url})`,
      }
    );

  if (moderatorMember) {
    reserveEmbed.addFields({
      name: 'LOGGED BY',
      value: `${moderatorMember.user.tag} (${moderatorMember.id})`,
    });
  }

  if (dupChar) {
    reserveEmbed.addFields({
      name: 'NOTE',
      value:
        'A character with this name already exists in the database — mods may still follow up if this is intentional.',
    });
  }

  const tipSuffix = suppressReserveTips ? '' : `\n\n${TIP_RESERVE_VS_APP}`;
  await message.reply({
    content: `${replyIntro}${tipSuffix}`,
    embeds: [reserveEmbed],
    allowedMentions: { users: [message.author.id] },
  }).catch(() => {});

  await refreshMemberCapTracker(client).catch((err) =>
    logger.error(FILE, `Tracker refresh after reserve: ${err.message}`)
  );

  logger.info(
    FILE,
    `Reserve logged: ${characterName} → ${villageNorm} for ${message.author.tag}${moderatorMember ? ` by mod ${moderatorMember.user.tag}` : ''}`
  );

  return { ok: true };
}

async function handleModReserveReaction(reaction, user, client) {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => null);
    if (reaction.message.partial) await reaction.message.fetch().catch(() => null);

    const msg = reaction.message;
    if (!msg.guild || msg.channelId !== OC_RESERVE_CHANNEL_ID) return;

    const emojiId = reaction.emoji.id;
    if (!emojiId) return;

    const villageNorm = villageEmojiIdToKey()[String(emojiId)];
    if (!villageNorm) return;

    let moderator = msg.guild.members.cache.get(user.id);
    if (!moderator) moderator = await msg.guild.members.fetch(user.id).catch(() => null);
    if (!(await memberCanModerateReserves(moderator))) return;

    if (msg.author.bot) return;

    const rawLine = msg.content.split('\n').map((l) => l.trim()).find(Boolean);
    if (!rawLine) {
      await msg.reply({
        content:
          `❌ **Mod reserve:** That message has no text to use as the OC name — members should post **Character Name | Village**, or mods can react on a **legacy** post with the OC name on the first line.`,
      }).catch(() => {});
      return;
    }

    let characterName;
    if (rawLine.includes('|')) {
      const parts = rawLine.split('|').map((p) => p.trim());
      characterName = parts[0];
      if (!characterName || characterName.length > 80) {
        await msg.reply({
          content:
            '❌ **Mod reserve:** The first field must be the **character name** (max 80 characters).',
        }).catch(() => {});
        return;
      }
    } else {
      // Mod village emoji = override: village comes from the reaction (legacy reserves / old posts).
      characterName = rawLine.slice(0, 80).trim();
      if (!characterName) {
        await msg.reply({
          content:
            `❌ **Mod reserve:** Couldn’t read a character name — use text on the first line, or **Name | Village**.`,
        }).catch(() => {});
        return;
      }
    }

    const intro =
      `✅ **Reserve saved** (${villageEmojiMarkup(villageNorm)} **${villageDisplay(villageNorm)}**) via mod reaction by **${moderator.displayName}**.`;

    await executeReservationFlow(msg, client, {
      villageNorm,
      characterName,
      suppressReserveTips: true,
      replyIntro: intro,
      moderatorMember: moderator,
    });
  } catch (err) {
    logger.error(FILE, `Mod reserve reaction: ${err.message}`);
  }
}

async function handleOcReserveMessage(message, client) {
  if (!message.guild || message.channelId !== OC_RESERVE_CHANNEL_ID) return;
  if (message.author.bot) return;

  const rawLine = message.content
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!rawLine || !rawLine.includes('|')) return;

  const parts = rawLine.split('|').map((p) => p.trim());

  if (parts.length < 2) {
    await message.reply({
      content:
        `❌ **Need at least two fields** separated by \`|\`.\n\n${TIP_RESERVE_VS_APP}`,
    });
    return;
  }

  // Long lines = roster / full application (e.g. Name | Race | Rudania:... | Virtue | Job | Image)
  if (parts.length >= 3) {
    const appName = parts[0];
    if (!appName) {
      await message.reply({
        content:
          `❌ **Character name missing** — put the **OC name first** (before the first \`|\`).\n\n${TIP_RESERVE_VS_APP}`,
      });
      return;
    }
    const villageNorm = findVillageInApplicationParts(parts.slice(1));
    if (!villageNorm) {
      await message.reply({
        content:
          `❌ **Couldn’t find a home village** (Rudania, Inariko, or Vhintl) in your line. Full roster posts must include **name** and **village** at minimum.\n\n${TIP_RESERVE_VS_APP}`,
      });
      return;
    }

    await message.reply({
      content:
        `✅ **Roster line looks OK** — I read **${appName}** and **${villageDisplay(villageNorm)}**.\n\n` +
        `This is **not** saved as a slot reserve (that needs only two fields, or a mod ${villageEmojiMarkup(villageNorm)} reaction). ` +
        `Follow the pinned template for the rest, and submit through the dashboard when you’re ready.\n\n` +
        `_If you only wanted a **reserve**, delete this and repost:_ \`${appName} | ${villageDisplay(villageNorm)}\`\n` +
        `_Mods:_ react with **${villageEmojiMarkup(villageNorm)}** on this message to log **${appName}** as a reserve for **${villageDisplay(villageNorm)}**.`,
      allowedMentions: { users: [] },
    });
    return;
  }

  // Strict two-part line → slot reserve
  const characterName = parts[0];
  const villageNorm = extractVillageFromSegment(parts[1]);

  if (!characterName) {
    await message.reply({
      content: `❌ **Character name missing** before the first \`|\`.\n\n${TIP_RESERVE_VS_APP}`,
    });
    return;
  }

  if (!villageNorm) {
    await message.reply({
      content:
        `❌ **"${parts[1]}"** isn’t a recognized village.\n\n` +
        `**Reserve:** \`Character Name | Rudania\` (or Inariko / Vhintl)\n` +
        `**Full application:** add more fields — e.g. \`Name | Race | Rudania | …\`\n\n` +
        TIP_RESERVE_VS_APP,
    });
    return;
  }

  if (characterName.length > 80) {
    await message.reply({
      content: '❌ Character name is too long (max 80 characters).',
    });
    return;
  }

  await executeReservationFlow(message, client, {
    villageNorm,
    characterName,
    suppressReserveTips: false,
    replyIntro: '✅ **Reserve recorded** — tracker updated.',
    moderatorMember: null,
  });
}

function registerMemberCapTracking(client) {
  client.on('messageCreate', async (message) => {
    try {
      await handleOcReserveMessage(message, client);
    } catch (err) {
      logger.error(FILE, `Reserve handler: ${err.message}`);
    }
  });

  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      await handleModReserveReaction(reaction, user, client);
    } catch (err) {
      logger.error(FILE, `Reserve reaction handler: ${err.message}`);
    }
  });

  client.on('guildMemberUpdate', (oldM, newM) => {
    const gid = process.env.GUILD_ID;
    if (!gid || newM.guild.id !== gid) return;
    const roleIdsOld = new Set(oldM.roles.cache.keys());
    const roleIdsNew = new Set(newM.roles.cache.keys());
    let changed = roleIdsOld.size !== roleIdsNew.size;
    if (!changed) {
      for (const id of roleIdsOld) {
        if (!roleIdsNew.has(id)) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;
    scheduleTrackerRefresh(client);
  });

  setInterval(() => {
    refreshMemberCapTracker(client).catch((err) =>
      logger.warn(FILE, `Periodic tracker refresh: ${err.message}`)
    );
  }, 15 * 60 * 1000);
}

async function bootstrapMemberCapTracker(client) {
  await refreshMemberCapTracker(client);
}

module.exports = {
  registerMemberCapTracking,
  bootstrapMemberCapTracker,
  refreshMemberCapTracker,
};
