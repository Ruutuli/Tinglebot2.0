// ============================================================================
// OC reservation intake + member cap tracker (Discord roster / slots)
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const Character = require('@/models/CharacterModel');
const OcReservation = require('@/models/OcReservationModel');
const MemberCapTracker = require('@/models/MemberCapTrackerModel');
const logger = require('@/utils/logger');

const FILE = 'MEMBER_CAP';

const OC_RESERVE_CHANNEL_ID =
  process.env.OC_RESERVE_CHANNEL_ID || '814567241101475932';
const MEMBER_CAP_TRACKER_CHANNEL_ID =
  process.env.MEMBER_CAP_TRACKER_CHANNEL_ID || '658148069212422194';
const INACTIVE_ROLE_ID =
  process.env.INACTIVE_MEMBER_ROLE_ID || '788148064182730782';
const TRAVELER_ROLE_ID =
  process.env.TRAVELER_ROLE_ID || '788137818135330837';

const VILLAGES = ['rudania', 'inariko', 'vhintl'];

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
  let activeWithChars = 0;
  let inactiveWithChars = 0;

  for (const [uid, v] of primaryByUser) {
    if (!guild.members.cache.has(uid)) continue;
    const member = guild.members.cache.get(uid);
    const inactive = member?.roles.cache.has(INACTIVE_ROLE_ID) ?? false;
    villUserIds[v].push(uid);
    if (inactive) {
      inactiveWithChars++;
      inactivePerVillage[v]++;
    } else {
      activeWithChars++;
    }
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
    if (!m.roles.cache.has(TRAVELER_ROLE_ID)) continue;
    if (acceptedIds.has(m.id)) continue;
    if (reserveUserIds.has(m.id)) continue;
    travelerOnly++;
  }

  const reservationTotal = reservations.length;
  const grandTotal =
    activeWithChars + inactiveWithChars + travelerOnly + reservationTotal;

  return {
    caps,
    activeWithChars,
    inactiveWithChars,
    inactivePerVillage,
    villUserIds,
    reservedPerVillage,
    slotsRemaining,
    travelerOnly,
    reservationTotal,
    grandTotal,
  };
}

function formatTrackerMessage(snapshot, dateLabel) {
  const r = snapshot.inactivePerVillage.rudania;
  const i = snapshot.inactivePerVillage.inariko;
  const v = snapshot.inactivePerVillage.vhintl;
  const rudUsers = snapshot.villUserIds.rudania.length;
  const inaUsers = snapshot.villUserIds.inariko.length;
  const vhiUsers = snapshot.villUserIds.vhintl.length;
  const rr = snapshot.reservedPerVillage.rudania;
  const ir = snapshot.reservedPerVillage.inariko;
  const vr = snapshot.reservedPerVillage.vhintl;

  const lines = [
    `**Member Cap Tracker Update:** ${dateLabel}`,
    '',
    `${snapshot.activeWithChars} Active Members`,
    `${snapshot.inactiveWithChars} Inactive Members (${r} Rudania, ${i} Inariko, ${v} Vhintl)`,
    `${snapshot.travelerOnly} Traveler`,
    `${snapshot.reservationTotal} Reserve`,
    '',
    `**Total with Reserved OCs:** ${snapshot.grandTotal} Members`,
    '',
    '**Village Totals**',
    '',
    `:rudania: Rudania: ${rudUsers} in (${r} Inactive), ${rr} reserved — ${rudUsers + rr} Members (${snapshot.slotsRemaining.rudania} slots remaining)`,
    `:inariko: Inariko: ${inaUsers} in (${i} Inactive), ${ir} reserved — ${inaUsers + ir} Members (${snapshot.slotsRemaining.inariko} slots remaining)`,
    `:vhintl: Vhintl: ${vhiUsers} in (${v} Inactive), ${vr} reserved — ${vhiUsers + vr} Members (${snapshot.slotsRemaining.vhintl} slots remaining)`,
    '',
    `_Caps: Rudania ${snapshot.caps.rudania}, Inariko ${snapshot.caps.inariko}, Vhintl ${snapshot.caps.vhintl}. Tracker updates when reservations post or roles change (and periodically)._`,
  ];
  return lines.join('\n');
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
  const body = formatTrackerMessage(snapshot, dateLabel);

  let doc = await MemberCapTracker.findOne({ guildId: guild.id });
  let msg = null;
  if (doc?.messageId) {
    try {
      msg = await channel.messages.fetch(doc.messageId);
    } catch {
      msg = null;
    }
  }

  if (!msg) {
    msg = await channel.send(body);
    await MemberCapTracker.findOneAndUpdate(
      { guildId: guild.id },
      {
        guildId: guild.id,
        channelId: channel.id,
        messageId: msg.id,
      },
      { upsert: true }
    );
    logger.info(FILE, `Posted new member cap tracker message ${msg.id}`);
    return;
  }

  await msg.edit(body);
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
  '• **Full application (roster line):** at minimum **character name** and **home village** (Rudania / Inariko / Vhintl), e.g. `Name | Race | Village | Virtue | Job | Image` per the pinned template.';

async function handleOcReserveMessage(message, client) {
  if (!message.guild || message.channelId !== OC_RESERVE_CHANNEL_ID) return;

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
        `This is **not** saved as a slot reserve (that needs only two fields). ` +
        `Follow the pinned template for the rest, and submit through the dashboard when you’re ready.\n\n` +
        `_If you only wanted a **reserve**, delete this and repost:_ \`${appName} | ${villageDisplay(villageNorm)}\``,
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
    const slotDeltaForTarget =
      existingNorm === villageNorm ? 0 : 1;
    const pressure =
      snapshot.villUserIds[villageNorm].length +
      snapshot.reservedPerVillage[villageNorm] +
      slotDeltaForTarget;
    if (pressure > snapshot.caps[villageNorm]) {
      await message.reply({
        content: `❌ **${villageDisplay(villageNorm)} is full** for first-character reservations (${snapshot.caps[villageNorm]} slots). You don’t have an accepted character yet, so this village can’t hold another reserve.\n\nTry another village or wait for a slot to open.`,
      });
      return;
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
    .addFields(
      { name: 'CHARACTER NAME', value: characterName },
      { name: 'VILLAGE', value: villageDisplay(villageNorm) },
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

  if (dupChar) {
    reserveEmbed.addFields({
      name: 'NOTE',
      value:
        'A character with this name already exists in the database — mods may still follow up if this is intentional.',
    });
  }

  const reserveRecordedTip =
    `✅ **Reserve recorded** — tracker updated.\n\n` +
    `${TIP_RESERVE_VS_APP}`;

  await message.reply({
    content: reserveRecordedTip,
    embeds: [reserveEmbed],
    allowedMentions: { users: [message.author.id] },
  });

  await refreshMemberCapTracker(client).catch((err) =>
    logger.error(FILE, `Tracker refresh after reserve: ${err.message}`)
  );

  logger.info(
    FILE,
    `Reserve logged: ${characterName} → ${villageNorm} by ${message.author.tag}`
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
