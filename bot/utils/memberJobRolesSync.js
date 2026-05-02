// ============================================================================
// Sync a member's Discord job + job-perk roles to match all accepted OCs in DB.
// Used by slash commands, components, and character delete — keep maps aligned
// with bot/handlers/componentHandler.js JOB_* / JOB_PERK_* env vars.
// ============================================================================

const {
  connectToTinglebot,
  fetchCharactersByUserId,
  fetchModCharactersByUserId,
} = require('../database/db');
const { getJobPerk } = require('../modules/jobsModule');

function getJobRoleIdMap() {
  return {
    Adventurer: process.env.JOB_ADVENTURER,
    Artist: process.env.JOB_ARTIST,
    Bandit: process.env.JOB_BANDIT,
    Beekeeper: process.env.JOB_BEEKEEPER,
    Blacksmith: process.env.JOB_BLACKSMITH,
    Cook: process.env.JOB_COOK,
    Courier: process.env.JOB_COURIER,
    Craftsman: process.env.JOB_CRAFTSMAN,
    Farmer: process.env.JOB_FARMER,
    Fisherman: process.env.JOB_FISHERMAN,
    Forager: process.env.JOB_FORAGER,
    'Fortune Teller': process.env.JOB_FORTUNE_TELLER,
    Graveskeeper: process.env.JOB_GRAVESKEEPER,
    Guard: process.env.JOB_GUARD,
    Healer: process.env.JOB_HEALER,
    Herbalist: process.env.JOB_HERBALIST,
    Hunter: process.env.JOB_HUNTER,
    'Mask Maker': process.env.JOB_MASK_MAKER,
    Merchant: process.env.JOB_MERCHANT,
    Mercenary: process.env.JOB_MERCENARY,
    Miner: process.env.JOB_MINER,
    Oracle: process.env.JOB_ORACLE,
    Priest: process.env.JOB_PRIEST,
    Rancher: process.env.JOB_RANCHER,
    Researcher: process.env.JOB_RESEARCHER,
    Sage: process.env.JOB_SAGE,
    Scout: process.env.JOB_SCOUT,
    Scholar: process.env.JOB_SCHOLAR,
    Shopkeeper: process.env.JOB_SHOPKEEPER,
    Stablehand: process.env.JOB_STABLEHAND,
    Teacher: process.env.JOB_TEACHER,
    Villager: process.env.JOB_VILLAGER,
    Weaver: process.env.JOB_WEAVER,
    Witch: process.env.JOB_WITCH,
    Dragon: process.env.JOB_DRAGON,
    Entertainer: process.env.JOB_ENTERTAINER,
  };
}

function getJobPerkIdMap() {
  return {
    LOOTING: process.env.JOB_PERK_LOOTING,
    STEALING: process.env.JOB_PERK_STEALING,
    ENTERTAINING: process.env.JOB_PERK_ENTERTAINING,
    DELIVERING: process.env.JOB_PERK_DELIVERING,
    HEALING: process.env.JOB_PERK_HEALING,
    GATHERING: process.env.JOB_PERK_GATHERING,
    CRAFTING: process.env.JOB_PERK_CRAFTING,
    BOOST: process.env.JOB_PERK_BOOST || process.env.JOB_PERK_BOOSTING,
    VENDING: process.env.JOB_PERK_VENDING,
  };
}

function jobToRoleId(jobName, jobRoleIdMap) {
  if (!jobName || typeof jobName !== 'string') return null;
  const trimmed = jobName.trim();
  if (!trimmed) return null;
  if (jobRoleIdMap[trimmed]) return jobRoleIdMap[trimmed];
  const lower = trimmed.toLowerCase();
  const key = Object.keys(jobRoleIdMap).find((k) => k.toLowerCase() === lower);
  return key ? jobRoleIdMap[key] : null;
}

function collectDesiredRoleIds(acceptedOcs, jobRoleIdMap, jobPerkIdMap) {
  const jobIds = new Set();
  const perkIds = new Set();

  for (const oc of acceptedOcs) {
    const jid = jobToRoleId(oc.job, jobRoleIdMap);
    if (jid) jobIds.add(jid);

    const perkInfo = getJobPerk(oc.job);
    const perks = perkInfo?.perks || [];
    for (const perk of perks) {
      const pid = jobPerkIdMap[perk];
      if (pid) perkIds.add(pid);
    }
  }

  return { jobIds, perkIds };
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} discordUserId
 * @param {string} [reason] Audit log reason
 * @returns {Promise<void>}
 */
async function syncMemberJobAndPerkRoles(guild, discordUserId, reason = 'Tinglebot: sync OC job roles') {
  await connectToTinglebot();
  await guild.roles.fetch();

  const [chars, modChars] = await Promise.all([
    fetchCharactersByUserId(discordUserId, ['name', 'job', 'status']),
    fetchModCharactersByUserId(discordUserId, ['name', 'job', 'status']),
  ]);

  const acceptedOcs = [
    ...chars.filter((c) => c.status === 'accepted').map((c) => ({ name: c.name, job: c.job })),
    ...modChars.filter((c) => c.status === 'accepted').map((c) => ({ name: c.name, job: c.job })),
  ];

  const member = await guild.members.fetch(discordUserId).catch(() => null);
  if (!member || member.user?.bot) return;

  const jobRoleIdMap = getJobRoleIdMap();
  const jobPerkIdMap = getJobPerkIdMap();

  const managedJobIds = new Set(Object.values(jobRoleIdMap).filter(Boolean));
  const managedPerkIds = new Set(Object.values(jobPerkIdMap).filter(Boolean));

  const { jobIds: desiredJobIds, perkIds: desiredPerkIds } = collectDesiredRoleIds(
    acceptedOcs,
    jobRoleIdMap,
    jobPerkIdMap
  );

  const have = member.roles.cache;
  const toRemove = new Set();
  const toAdd = new Set();

  for (const rid of managedJobIds) {
    if (have.has(rid) && !desiredJobIds.has(rid)) toRemove.add(rid);
  }
  for (const rid of desiredJobIds) {
    if (!have.has(rid)) toAdd.add(rid);
  }
  for (const rid of managedPerkIds) {
    if (have.has(rid) && !desiredPerkIds.has(rid)) toRemove.add(rid);
  }
  for (const rid of desiredPerkIds) {
    if (!have.has(rid)) toAdd.add(rid);
  }

  for (const rid of toRemove) {
    const role = guild.roles.cache.get(rid);
    if (role) await member.roles.remove(role, reason).catch(() => {});
  }
  for (const rid of toAdd) {
    const role = guild.roles.cache.get(rid);
    if (role) await member.roles.add(role, reason).catch(() => {});
  }
}

module.exports = {
  syncMemberJobAndPerkRoles,
  getJobRoleIdMap,
  getJobPerkIdMap,
  collectDesiredRoleIds,
  jobToRoleId,
};
