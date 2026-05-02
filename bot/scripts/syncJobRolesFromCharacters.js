// ============================================================================
// Sync Discord job + job-perk roles from the database (accepted OCs only).
// Skips users with User.status === 'inactive' and optionally members with the
// inactive Discord role (INACTIVE_MEMBER_ROLE_ID).
//
// Usage:
//   node bot/scripts/syncJobRolesFromCharacters.js [--dry-run] [--verbose]
//
// Requires: DISCORD_TOKEN, GUILD_ID, MONGODB_TINGLEBOT_URI or MONGODB_URI
// Bot: GuildMembers intent; Manage Roles; role hierarchy above assigned roles.
//
// Keep jobRoleIdMap / jobPerkIdMap in sync with bot/handlers/componentHandler.js
// ============================================================================

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');

const env = process.env.NODE_ENV || 'development';
const repoRoot = path.resolve(__dirname, '..', '..');
const botRoot = path.resolve(__dirname, '..');

const envLayers = [
  { file: path.join(repoRoot, '.env'), override: false },
  { file: path.join(botRoot, '.env'), override: true },
  { file: path.join(repoRoot, `.env.${env}`), override: true },
  { file: path.join(botRoot, `.env.${env}`), override: true },
];

for (const { file, override } of envLayers) {
  if (fs.existsSync(file)) {
    dotenv.config({ path: file, override });
  }
}

require('module-alias/register');
const moduleAlias = require('module-alias');
moduleAlias.addAlias('@', botRoot);

const User = require('../models/UserModel');
const Character = require('../models/CharacterModel');
const ModCharacter = require('../models/ModCharacterModel');
const { getJobPerk } = require('../modules/jobsModule');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const MEMBER_DELAY_MS = 450;

/** Same keys as componentHandler / character.js (process.env at runtime). */
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
  const direct = jobRoleIdMap[trimmed];
  if (direct) return direct;
  const lower = trimmed.toLowerCase();
  const key = Object.keys(jobRoleIdMap).find((k) => k.toLowerCase() === lower);
  return key ? jobRoleIdMap[key] : null;
}

function collectDesiredRoleIds(acceptedOcs, jobRoleIdMap, jobPerkIdMap) {
  const jobIds = new Set();
  const perkIds = new Set();
  const unknownJobs = [];

  for (const oc of acceptedOcs) {
    const jid = jobToRoleId(oc.job, jobRoleIdMap);
    if (jid) jobIds.add(jid);
    else unknownJobs.push({ name: oc.name, job: oc.job });

    const perkInfo = getJobPerk(oc.job);
    const perks = perkInfo?.perks || [];
    for (const perk of perks) {
      const pid = jobPerkIdMap[perk];
      if (pid) perkIds.add(pid);
    }
  }

  return { jobIds, perkIds, unknownJobs };
}

async function connectDb() {
  const uri = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_TINGLEBOT_URI or MONGODB_URI not set');
  if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
}

function inactiveRoleId() {
  return process.env.INACTIVE_MEMBER_ROLE_ID || null;
}

async function syncMemberRoles(member, desiredJobIds, desiredPerkIds, managedJobIds, managedPerkIds) {
  const have = member.roles.cache;
  const toRemoveSet = new Set();
  const toAddSet = new Set();

  for (const rid of managedJobIds) {
    if (have.has(rid) && !desiredJobIds.has(rid)) toRemoveSet.add(rid);
  }
  for (const rid of desiredJobIds) {
    if (!have.has(rid)) toAddSet.add(rid);
  }

  for (const rid of managedPerkIds) {
    if (have.has(rid) && !desiredPerkIds.has(rid)) toRemoveSet.add(rid);
  }
  for (const rid of desiredPerkIds) {
    if (!have.has(rid)) toAddSet.add(rid);
  }

  const toRemove = [...toRemoveSet];
  const toAdd = [...toAddSet];

  if (DRY_RUN) {
    return { toRemove, toAdd, changed: toRemove.length + toAdd.length > 0 };
  }

  for (const rid of toRemove) {
    const role = member.guild.roles.cache.get(rid);
    if (role) await member.roles.remove(role, 'syncJobRolesFromCharacters.js').catch(() => {});
  }
  for (const rid of toAdd) {
    const role = member.guild.roles.cache.get(rid);
    if (role) await member.roles.add(role, 'syncJobRolesFromCharacters.js').catch(() => {});
  }

  return { toRemove, toAdd, changed: toRemove.length + toAdd.length > 0 };
}

async function main() {
  if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is not set');
    process.exit(1);
  }
  if (!process.env.GUILD_ID) {
    console.error('❌ GUILD_ID is not set');
    process.exit(1);
  }

  const jobRoleIdMap = getJobRoleIdMap();
  const jobPerkIdMap = getJobPerkIdMap();

  const managedJobIds = new Set(
    Object.values(jobRoleIdMap).filter((id) => id && String(id).length > 0)
  );
  const managedPerkIds = new Set(
    Object.values(jobPerkIdMap).filter((id) => id && String(id).length > 0)
  );

  await connectDb();

  const inactiveRid = inactiveRoleId();

  const activeUsers = await User.find({ status: { $ne: 'inactive' } })
    .select({ discordId: 1, status: 1 })
    .lean();

  const discordIds = activeUsers.map((u) => u.discordId).filter(Boolean);
  const idSet = new Set(discordIds);

  const [chars, modChars] = await Promise.all([
    Character.find({ userId: { $in: discordIds }, status: 'accepted' })
      .select({ userId: 1, name: 1, job: 1 })
      .lean(),
    ModCharacter.find({ userId: { $in: discordIds }, status: 'accepted' })
      .select({ userId: 1, name: 1, job: 1 })
      .lean(),
  ]);

  const ocsByUser = new Map();
  for (const id of discordIds) {
    ocsByUser.set(id, []);
  }
  for (const c of chars) {
    if (!idSet.has(c.userId)) continue;
    ocsByUser.get(c.userId).push({ kind: 'oc', name: c.name, job: c.job });
  }
  for (const c of modChars) {
    if (!idSet.has(c.userId)) continue;
    ocsByUser.get(c.userId).push({ kind: 'mod', name: c.name, job: c.job });
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  await new Promise((resolve, reject) => {
    client.once('ready', resolve);
    client.once('error', reject);
    client.login(process.env.DISCORD_TOKEN);
  });

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.roles.fetch();

  let processed = 0;
  let skippedInactiveRole = 0;
  let skippedNotInGuild = 0;
  let updated = 0;
  let errors = 0;
  const unknownJobWarnings = [];

  console.log(
    `Active users (DB): ${activeUsers.length} | Accepted OCs: ${chars.length} | Accepted mod OCs: ${modChars.length}${DRY_RUN ? ' | DRY-RUN' : ''}\n`
  );

  for (const u of activeUsers) {
    const discordId = u.discordId;
    if (!discordId) continue;

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member || member.user?.bot) {
      skippedNotInGuild++;
      continue;
    }

    if (inactiveRid && member.roles.cache.has(inactiveRid)) {
      skippedInactiveRole++;
      if (VERBOSE) console.log(`⏭ skip (inactive role) ${member.user.tag} (${discordId})`);
      continue;
    }

    const acceptedOcs = ocsByUser.get(discordId) || [];
    const { jobIds, perkIds, unknownJobs } = collectDesiredRoleIds(acceptedOcs, jobRoleIdMap, jobPerkIdMap);

    if (unknownJobs.length) {
      unknownJobWarnings.push({ discordId, tag: member.user.tag, unknownJobs });
    }

    try {
      const { toRemove, toAdd, changed } = await syncMemberRoles(
        member,
        jobIds,
        perkIds,
        managedJobIds,
        managedPerkIds
      );
      if (changed) {
        updated++;
        if (VERBOSE) {
          console.log(
            `${member.user.tag}: ${acceptedOcs.map((o) => `${o.name} (${o.job})`).join('; ') || 'no accepted OCs'}`
          );
          if (toRemove.length) console.log(`   - remove ${toRemove.join(', ')}`);
          if (toAdd.length) console.log(`   + add ${toAdd.join(', ')}`);
        } else if (!VERBOSE && (toRemove.length || toAdd.length)) {
          const addNames = toAdd.map((id) => guild.roles.cache.get(id)?.name || id).join(', ');
          const remNames = toRemove.map((id) => guild.roles.cache.get(id)?.name || id).join(', ');
          const parts = [];
          if (toAdd.length) parts.push(`+ ${addNames}`);
          if (toRemove.length) parts.push(`- ${remNames}`);
          console.log(`✓ ${member.user.tag}: ${parts.join(' | ')}`);
        }
      } else if (VERBOSE && acceptedOcs.length) {
        console.log(`— ok ${member.user.tag}: ${acceptedOcs.map((o) => `${o.name} (${o.job})`).join('; ')}`);
      }
    } catch (e) {
      errors++;
      console.error(`❌ ${member.user.tag}: ${e.message}`);
    }

    processed++;
    await new Promise((r) => setTimeout(r, MEMBER_DELAY_MS));
  }

  console.log('\n--- summary ---');
  console.log(`Processed members: ${processed}`);
  console.log(`Updated (role changes${DRY_RUN ? ' would occur' : ''}): ${updated}`);
  console.log(`Skipped (not in guild / bot): ${skippedNotInGuild}`);
  console.log(`Skipped (inactive Discord role): ${skippedInactiveRole}`);
  console.log(`Errors: ${errors}`);

  if (unknownJobWarnings.length) {
    console.log(`\n⚠ Users with job names missing from JOB_* env map: ${unknownJobWarnings.length}`);
    for (const row of unknownJobWarnings.slice(0, 25)) {
      console.log(`   ${row.tag}: ${row.unknownJobs.map((j) => `${j.name}→${j.job}`).join('; ')}`);
    }
    if (unknownJobWarnings.length > 25) console.log(`   … and ${unknownJobWarnings.length - 25} more`);
  }

  await mongoose.connection.close().catch(() => {});
  await client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
