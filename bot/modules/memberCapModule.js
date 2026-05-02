// ============================================================================
// OC reservation intake + member cap tracker (Discord roster / slots)
// ============================================================================

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Character = require('@/models/CharacterModel');
const OcReservation = require('@/models/OcReservationModel');
const MemberCapTracker = require('@/models/MemberCapTrackerModel');
const { isVillageExclusiveJob } = require('@/modules/jobsModule');
const logger = require('@/utils/logger');

const FILE = 'MEMBER_CAP';

const BORDER_IMAGE =
  'https://storage.googleapis.com/tinglebot/Graphics/border.png';

const OC_RESERVE_CHANNEL_ID =
  process.env.OC_RESERVE_CHANNEL_ID || '814567241101475932';
const MEMBER_CAP_TRACKER_CHANNEL_ID =
  process.env.MEMBER_CAP_TRACKER_CHANNEL_ID || '658148069212422194';
/** Pin the live tracker message id (tried before Mongo + history scan). Override with MEMBER_CAP_TRACKER_MESSAGE_ID. */
const MEMBER_CAP_TRACKER_MESSAGE_ID_PIN =
  process.env.MEMBER_CAP_TRACKER_MESSAGE_ID || '1499474124291051530';
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

/**
 * Mod reaction → village: env/custom emoji IDs first, then emoji **name**
 * (`vhintl`, `rudania`, `inariko`) so reserves work even if emoji IDs changed on the server.
 */
function villageFromReactionEmoji(emoji) {
  if (!emoji) return null;
  if (emoji.id) {
    const byId = villageEmojiIdToKey()[String(emoji.id)];
    if (byId) return byId;
  }
  const byName = normalizeVillage(emoji.name);
  if (byName && VILLAGES.includes(byName)) return byName;
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

/** Shown when a post in the OC reserve channel does not match the required template. */
const OC_CHANNEL_FORMAT_REMINDER =
  'Please make sure your format is:\n`Name | race | village | Job | Virtue`\n' +
  '*(Village must be **Rudania**, **Inariko**, or **Vhintl**.)*\n\n' +
  '_This bot reminder will be **deleted and reposted** within the next **5 minutes**._';

const OC_FORMAT_REMINDER_REPOST_MS = 5 * 60 * 1000;

/** Sends the format reminder, then deletes and reposts the same reminder once after 5 minutes. */
async function sendOcFormatReminderWithRepost(channel, authorId) {
  const content = `<@${authorId}> ${OC_CHANNEL_FORMAT_REMINDER}`;
  const payload = {
    content,
    allowedMentions: { users: [authorId] },
  };
  let sent;
  try {
    sent = await channel.send(payload);
  } catch {
    return;
  }
  setTimeout(async () => {
    try {
      await sent.delete().catch(() => {});
      await channel.send(payload);
    } catch (err) {
      logger.warn(FILE, `OC format reminder repost: ${err.message}`);
    }
  }, OC_FORMAT_REMINDER_REPOST_MS);
}

/**
 * Valid: `Name | race | village | Job | Virtue` — at least five fields; home village in the **third** field.
 * @param {string | undefined} rawLine First non-empty line of the message.
 */
function isValidOcReserveChannelPost(rawLine) {
  if (!rawLine || !String(rawLine).trim()) return false;
  if (!rawLine.includes('|')) return false;
  const parts = rawLine.split('|').map((p) => p.trim());
  if (parts.length < 5) return false;
  if (!parts[0] || !parts[1] || !parts[2] || !parts[3] || !parts[4]) return false;
  return !!extractVillageFromSegment(parts[2]);
}

/** General jobs are allowed in any village; village-exclusive jobs must match `villageNorm`. */
function villageJobMatchesHome(jobRaw, villageNorm) {
  if (!jobRaw || !String(jobRaw).trim() || !villageNorm) return false;
  const exclusive = isVillageExclusiveJob(jobRaw);
  if (!exclusive) return true;
  return exclusive === villageNorm;
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

  const rosterHeadcountTotal =
    snapshot.activeWithChars + snapshot.inactiveGuildWide;

  const overview =
    `**${snapshot.activeWithChars}** active\n` +
    `**${snapshot.inactiveGuildWide}** inactive\n` +
    `**${rosterHeadcountTotal}** total`;

  const fmtVillageBlock = (
    key,
    totalToward,
    inactiveCt,
    reserved,
    slotsLeft
  ) => {
    const em = villageEmojiMarkup(key);
    const label = villageDisplay(key);
    const activeCt = Math.max(0, totalToward - inactiveCt);
    return (
      `${em} **${label}** - ${slotsLeft} slots free\n` +
      `> ${activeCt} Active\n` +
      `> ${inactiveCt} Inactive\n` +
      `> ${totalToward} Total\n` +
      `> ${reserved} reserved`
    );
  };

  const rudBlock = fmtVillageBlock(
    'rudania',
    rudUsers,
    r,
    rr,
    snapshot.slotsRemaining.rudania
  );
  const inaBlock = fmtVillageBlock(
    'inariko',
    inaUsers,
    i,
    ir,
    snapshot.slotsRemaining.inariko
  );
  const vhiBlock = fmtVillageBlock(
    'vhintl',
    vhiUsers,
    v,
    vr,
    snapshot.slotsRemaining.vhintl
  );

  const villagesCombined = `${rudBlock}\n\n${inaBlock}\n\n${vhiBlock}`;

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

/** Match embed title on tracker posts (trimmed — Discord sometimes pads). */
function trackerEmbedTitleMatches(message) {
  const title = message.embeds?.[0]?.title?.trim();
  return title === TRACKER_EMBED_TITLE;
}

/**
 * Reuse the live tracker message: try pinned + DB ids first, then paginate channel history.
 */
async function resolveTrackerMessage(channel, client, candidateIds) {
  const botId = client.user.id;
  const ids = [
    ...new Set(
      (Array.isArray(candidateIds) ? candidateIds : [candidateIds])
        .filter(Boolean)
        .map(String)
    ),
  ];

  for (const storedMessageId of ids) {
    try {
      const m = await channel.messages.fetch(storedMessageId);
      if (m?.author?.id !== botId) {
        logger.warn(
          FILE,
          `Tracker candidate ${storedMessageId} is not from this bot — trying next`
        );
        continue;
      }
      if (!trackerEmbedTitleMatches(m)) {
        logger.warn(
          FILE,
          `Tracker candidate ${storedMessageId} title mismatch (expected "${TRACKER_EMBED_TITLE}") — trying next`
        );
        continue;
      }
      return m;
    } catch {
      logger.warn(
        FILE,
        `Could not fetch tracker candidate ${storedMessageId} — trying next`
      );
    }
  }

  try {
    let before = undefined;
    const limitPerPage = 100;
    const maxPages = 25;

    for (let page = 0; page < maxPages; page++) {
      const batch = await channel.messages.fetch({
        limit: limitPerPage,
        ...(before ? { before } : {}),
      });
      if (!batch.size) break;

      for (const m of batch.values()) {
        if (m.author?.id !== botId) continue;
        if (trackerEmbedTitleMatches(m)) return m;
      }

      const oldest = [...batch.values()].reduce((a, c) =>
        BigInt(c.id) < BigInt(a.id) ? c : a
      );
      before = oldest.id;
      if (batch.size < limitPerPage) break;
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
  const candidateIds = [MEMBER_CAP_TRACKER_MESSAGE_ID_PIN, doc?.messageId].filter(
    Boolean
  );
  let msg = await resolveTrackerMessage(channel, client, candidateIds);

  if (!msg) {
    msg = await channel.send(payload);
    logger.warn(
      FILE,
      `No existing tracker found after scanning channel — posted NEW message ${msg.id}. Delete duplicates if needed.`
    );
  } else {
    await msg.edit(payload);
    logger.info(FILE, `Updated member cap tracker message ${msg.id}`);
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

/**
 * Travelers hold a slot reserve in DB; once they receive a Rudania/Inariko/Vhintl **resident Discord role**,
 * remove that reserve so the tracker counts them only as roster members (not reserved + member).
 */
async function removeOcReserveWhenPromotedToResident(oldMember, newMember) {
  const hadResident = villagesFromRoles(oldMember).length > 0;
  const hasResident = villagesFromRoles(newMember).length > 0;
  if (hadResident || !hasResident) return;

  const result = await OcReservation.deleteOne({
    userId: newMember.id,
    guildId: newMember.guild.id,
  });
  if (result.deletedCount > 0) {
    logger.info(
      FILE,
      `Removed slot reserve for ${newMember.user.tag} (${newMember.id}) — resident village Discord role added`
    );
  }
}

const TIP_RESERVE_VS_APP =
  '**This channel is for OC roster reserves.** Post one line: `Name | race | village | Job | Virtue` (village: **Rudania**, **Inariko**, or **Vhintl**). Village-exclusive jobs must match that village.\n' +
  '• **Mods** can react with a village emoji (<:rudania:…>, <:inariko:…>, <:vhintl:…>) to log a reserve manually when needed.';

const MOD_ROLE_ID_DEFAULT = process.env.MOD_ROLE_ID || '606128760655183882';

async function reactRosterPostWithVillageEmoji(message, villageNorm) {
  const id = VILLAGE_CUSTOM_EMOJI_ID[villageNorm];
  try {
    if (id) {
      const name =
        villageNorm === 'rudania'
          ? 'rudania'
          : villageNorm === 'inariko'
            ? 'inariko'
            : 'vhintl';
      await message.react({ id, name });
    }
  } catch (err) {
    logger.warn(FILE, `Roster village react failed: ${err.message}`);
  }
}

async function memberCanModerateReserves(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (MOD_ROLE_ID_DEFAULT && member.roles.cache.has(MOD_ROLE_ID_DEFAULT)) return true;
  return false;
}

/**
 * Persist reservation + tracker refresh. Optional embed/reply unless `silentSuccess`.
 */
async function executeReservationFlow(message, client, options) {
  const {
    villageNorm,
    characterName,
    suppressReserveTips,
    replyIntro,
    moderatorMember,
    silentSuccess = false,
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

  // Member self-serve reserves only: enforce slot caps for applicants without an accepted OC yet.
  // Mod emoji reaction is an override — no cap check (legacy / staff discretion).
  if (userCharCount === 0 && !moderatorMember) {
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

  if (!silentSuccess) {
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
  }

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

    const villageNorm = villageFromReactionEmoji(reaction.emoji);
    if (!villageNorm) return;

    let moderator = msg.guild.members.cache.get(user.id);
    if (!moderator) moderator = await msg.guild.members.fetch(user.id).catch(() => null);
    if (!(await memberCanModerateReserves(moderator))) return;

    if (msg.author.bot) return;

    const rawLine = msg.content.split('\n').map((l) => l.trim()).find(Boolean);

    let characterName;
    if (rawLine) {
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
        characterName = rawLine.slice(0, 80).trim();
        if (!characterName) {
          await msg.reply({
            content:
              '❌ **Mod reserve:** Couldn’t read a character name — use the roster line format `Name | race | village | Job | Virtue` (or a plain first line).',
          }).catch(() => {});
          return;
        }
      }
    } else {
      // No post body — village is taken only from the mod’s reaction; infer OC name from applicant’s guild identity.
      let authorMember = msg.member;
      if (!authorMember) {
        authorMember = await msg.guild.members.fetch(msg.author.id).catch(() => null);
      }
      const fallback =
        (authorMember?.displayName && authorMember.displayName.trim()) ||
        msg.author.globalName?.trim() ||
        msg.author.username ||
        '';
      characterName = fallback.slice(0, 80);
      if (!characterName) {
        await msg.reply({
          content:
            '❌ **Mod reserve:** Empty message — couldn’t infer an OC name from this member.',
        }).catch(() => {});
        return;
      }
    }

    await executeReservationFlow(msg, client, {
      villageNorm,
      characterName,
      moderatorMember: moderator,
      silentSuccess: true,
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

  if (!isValidOcReserveChannelPost(rawLine)) {
    await sendOcFormatReminderWithRepost(message.channel, message.author.id);
    return;
  }

  const parts = rawLine.split('|').map((p) => p.trim());
  const appName = parts[0];
  const villageNorm = extractVillageFromSegment(parts[2]);
  const jobField = parts[3];

  if (!appName) {
    await message.reply({
      content:
        `❌ **Character name missing** — put the **OC name first** (before the first \`|\`).\n\n${TIP_RESERVE_VS_APP}`,
    });
    return;
  }

  if (!villageNorm || !VILLAGES.includes(villageNorm)) {
    await message.reply({
      content:
        `❌ **Village** in the third field must be **Rudania**, **Inariko**, or **Vhintl**.\n\n${TIP_RESERVE_VS_APP}`,
    });
    return;
  }

  if (!villageJobMatchesHome(jobField, villageNorm)) {
    const exclusive = isVillageExclusiveJob(jobField);
    const need = exclusive ? villageDisplay(exclusive) : 'your home village';
    await message.reply({
      content:
        `❌ **Job and village don’t match** — **${jobField.trim()}** is tied to **${need}**, but your home village is **${villageDisplay(villageNorm)}**. Fix the line or pick a general job.\n\n${TIP_RESERVE_VS_APP}`,
    });
    return;
  }

  if (appName.length > 80) {
    await message.reply({
      content: '❌ Character name is too long (max 80 characters).',
    });
    return;
  }

  const reserveResult = await executeReservationFlow(message, client, {
    villageNorm,
    characterName: appName,
    moderatorMember: null,
    silentSuccess: true,
  });

  if (!reserveResult?.ok) return;

  await reactRosterPostWithVillageEmoji(message, villageNorm);
  try {
    await message.react('✅');
  } catch (err) {
    logger.warn(FILE, `Roster checkmark react failed: ${err.message}`);
  }
  logger.info(
    FILE,
    `Roster reserve OK: ${appName} → ${villageNorm} by ${message.author.tag} — tracker, village react, ✅`
  );
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

  client.on('guildMemberUpdate', async (oldM, newM) => {
    const gid = process.env.GUILD_ID;
    if (!gid || newM.guild.id !== gid) return;

    try {
      await removeOcReserveWhenPromotedToResident(oldM, newM);
    } catch (err) {
      logger.warn(FILE, `Reserve cleanup on resident role: ${err.message}`);
    }

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
