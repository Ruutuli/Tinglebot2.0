// ============================================================================
// Village roster report
// Run from bot directory:
//   node scripts/reportVillageRoster.js
//   node scripts/reportVillageRoster.js --csv
//   node scripts/reportVillageRoster.js --compact
//
// Rules (only these Discord roles — nothing from env):
//   Rudania  630837341124034580
//   Inariko  631507660524486657
//   Vhintl   631507736508629002
//
// 1. Check ONLY those role IDs on the member.
// 2. If none are present → village comes from **first accepted OC** (earliest _id), homeVillage.
// 3. Main OC / sheet home is always shown for reference; **village assignment** still uses resident
//    roles first, then first OC only when they have none of the three roles.
// 4. Voice-style counts = members who hold that village’s role (dual-role counted twice across villages).
//
// Requires: DISCORD_TOKEN, GUILD_ID, MONGODB_TINGLEBOT_URI or MONGODB_URI
// Optional: VILLAGE_ROSTER_EXCLUDED_USER_IDS=id,id — extra Discord user IDs omitted from counts/lists
//           (Roots.Admin is always omitted — matches bot HIBIKI_USER_ID).
// ============================================================================

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');

const verbose = process.argv.includes('--verbose');

const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const botEnvPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
  if (verbose) console.error('Loaded env:', rootEnvPath);
} else if (fs.existsSync(botEnvPath)) {
  dotenv.config({ path: botEnvPath });
  if (verbose) console.error('Loaded env:', botEnvPath);
}

const Character = require('../models/CharacterModel');

/** Village resident roles — ONLY these IDs (no env alternates). */
const RESIDENT_ROLE_IDS = {
  rudania: '630837341124034580',
  inariko: '631507660524486657',
  vhintl: '631507736508629002',
};

const INACTIVE_ROLE_ID =
  process.env.INACTIVE_MEMBER_ROLE_ID || '788148064182730782';

/** Roots.Admin — system account (same snowflake as HIBIKI_USER_ID elsewhere); not a roster member. */
const ROOTS_ADMIN_USER_ID = '668281042414600212';

function excludedFromRosterUserIds() {
  const ids = new Set([ROOTS_ADMIN_USER_ID]);
  String(process.env.VILLAGE_ROSTER_EXCLUDED_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((id) => ids.add(id));
  return ids;
}

const VILLAGE_ORDER = ['rudania', 'inariko', 'vhintl'];

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

function villageLabel(key) {
  if (key === 'rudania') return 'Rudania';
  if (key === 'inariko') return 'Inariko';
  if (key === 'vhintl') return 'Vhintl';
  return key || '—';
}

function memberHasResidentRoleForVillage(member, villageKey) {
  const rid = RESIDENT_ROLE_IDS[villageKey];
  return !!(rid && member.roles.cache.has(rid));
}

function villagesFromRoles(member) {
  const found = [];
  for (const v of VILLAGE_ORDER) {
    if (memberHasResidentRoleForVillage(member, v)) found.push(v);
  }
  return found;
}

/** How village was determined for roster listing. */
function rosterSource(residentKeys, mainOcHomeKey) {
  if (residentKeys.length >= 1) return 'resident_role';
  if (mainOcHomeKey) return 'first_oc';
  return 'none';
}

async function connectDb() {
  const uri = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_TINGLEBOT_URI or MONGODB_URI not set');
  if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
}

async function loadMainCharactersByUser(userIds) {
  const accepted = await Character.find({ status: 'accepted', userId: { $in: userIds } })
    .select({ userId: 1, name: 1, homeVillage: 1, _id: 1 })
    .lean();

  const byUser = new Map();
  for (const c of accepted) {
    if (!byUser.has(c.userId)) byUser.set(c.userId, []);
    byUser.get(c.userId).push(c);
  }
  const mainByUser = new Map();
  for (const [uid, list] of byUser) {
    list.sort((a, b) => String(a._id).localeCompare(String(b._id)));
    mainByUser.set(uid, list[0]);
  }
  return mainByUser;
}

function pad(s, w) {
  const t = String(s ?? '');
  return t.length >= w ? t.slice(0, w - 1) + '…' : t + ' '.repeat(w - t.length);
}

/** Extra hints for roster table (multi-role, OC shown for reference only). */
function memberNotes(r) {
  const bits = [];
  if (r.residentKeys.length > 1) bits.push('multi resident roles');
  if (r.residentKeys.length > 0 && r.mainCharacter !== '—')
    bits.push('OC info reference only');
  return bits.length ? bits.join('; ') : '';
}

/** Fixed-column ASCII table for roster rows (pipe borders). */
function printMemberTable(title, rowList) {
  const W = [20, 22, 18, 18, 16, 9, 6, 22];
  const headers = [
    'Display',
    'Tag',
    'User ID',
    'Resident roles',
    'Main OC',
    'Sheet',
    'Inact',
    'Notes',
  ];
  const sep =
    '+' + W.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const line = (cells) =>
    '| ' +
    cells.map((c, i) => pad(String(c ?? ''), W[i])).join(' | ') +
    ' |';

  console.log('');
  console.log(title);
  console.log(sep);
  console.log(line(headers));
  console.log(sep);
  if (!rowList.length) {
    console.log(
      line(['(none)', '', '', '', '', '', '', ''])
    );
  } else {
    for (const r of rowList) {
      console.log(
        line([
          r.displayName,
          r.username,
          r.userId,
          r.residentRolesHeld,
          r.mainCharacter,
          r.mainOcHomeOnSheet,
          r.inactive,
          memberNotes(r),
        ])
      );
    }
  }
  console.log(sep);
}

function sortRowsByDisplay(rows) {
  return [...rows].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
  );
}

function rowsWithResidentRole(rows, villageKey) {
  return sortRowsByDisplay(rows.filter((r) => r.residentKeys.includes(villageKey)));
}

function rowsOcOnlyForVillage(rows, villageKey) {
  return sortRowsByDisplay(
    rows.filter((r) => r.residentKeys.length === 0 && r.mainOcHomeKey === villageKey)
  );
}

/** Roster bucket: has role for V OR (no roles + first OC home V). */
function rosterCountForVillage(rows, villageKey) {
  return rows.filter(
    (r) =>
      r.residentKeys.includes(villageKey) ||
      (r.residentKeys.length === 0 && r.mainOcHomeKey === villageKey)
  ).length;
}

function printGroupedReport(guild, rows) {
  console.log('');
  console.log('========================================================================');
  console.log('  Village roster');
  console.log('========================================================================');
  console.log(`Guild: ${guild.name}  ·  id ${guild.id}`);
  console.log(`Humans (non-bot): ${rows.length}`);
  console.log('');
  console.log('Resident role IDs used (ONLY these — no other IDs checked):');
  console.log(`  Rudania  ${RESIDENT_ROLE_IDS.rudania}`);
  console.log(`  Inariko  ${RESIDENT_ROLE_IDS.inariko}`);
  console.log(`  Vhintl   ${RESIDENT_ROLE_IDS.vhintl}`);
  console.log(`Inactive marker role: ${INACTIVE_ROLE_ID}`);
  console.log('');

  console.log('--- Has this resident role (voice-channel style) ---');
  for (const key of VILLAGE_ORDER) {
    const label = villageLabel(key);
    const n = rows.filter((r) => r.residentKeys.includes(key)).length;
    console.log(`  ${label.padEnd(8)} ${String(n).padStart(3)}`);
  }
  const multi = rows.filter((r) => r.residentKeys.length > 1);
  console.log(`  ${'(multi)'.padEnd(8)} ${String(multi.length).padStart(3)}   has 2+ of the roles above`);

  const noResidentAmongThree = rows.filter((r) => r.residentKeys.length === 0);
  console.log(
    `  ${'(no role)'.padEnd(8)} ${String(noResidentAmongThree.length).padStart(3)}   none of the three roles`
  );

  console.log('');
  console.log('--- Roster bucket (role OR first OC when no role) ---');
  for (const key of VILLAGE_ORDER) {
    const label = villageLabel(key);
    const n = rosterCountForVillage(rows, key);
    console.log(`  ${label.padEnd(8)} ${String(n).padStart(3)}`);
  }

  const noRoleNoOc = rows.filter((r) => r.rosterSource === 'none');
  console.log(
    `  ${'(empty)'.padEnd(8)} ${String(noRoleNoOc.length).padStart(3)}   no role + no accepted OC village`
  );

  const inactiveRows = rows.filter((r) => r.inactive === 'yes');
  console.log('');
  console.log('--- Inactive marker role (guild humans above) ---');
  console.log(
    `  Role ID ${INACTIVE_ROLE_ID}  ·  marked inactive here: ${inactiveRows.length}`
  );
  console.log(
    '  (If this number is lower than Discord’s member list with that role, check env INACTIVE_MEMBER_ROLE_ID.)'
  );
  printMemberTable(
    ` ALL MEMBERS WITH INACTIVE ROLE (${inactiveRows.length})`,
    sortRowsByDisplay(inactiveRows)
  );

  for (const key of VILLAGE_ORDER) {
    const label = villageLabel(key);
    const roleList = rowsWithResidentRole(rows, key);
    const ocList = rowsOcOnlyForVillage(rows, key);
    if (!roleList.length && !ocList.length) continue;

    console.log('');
    console.log('='.repeat(76));
    console.log(` ${label.toUpperCase()}`);
    console.log('='.repeat(76));

    if (roleList.length) {
      printMemberTable(
        ` [ Resident role ${RESIDENT_ROLE_IDS[key]} ] (${roleList.length})`,
        roleList
      );
    }

    if (ocList.length) {
      printMemberTable(
        ` [ First OC only — no resident role ] (${ocList.length})`,
        ocList
      );
    }
  }

  if (noRoleNoOc.length) {
    console.log('');
    console.log('='.repeat(76));
    console.log(` NO ROLE AND NO ACCEPTED OC VILLAGE (${noRoleNoOc.length})`);
    console.log('='.repeat(76));
    printMemberTable(
      ' No resident role + no accepted OC Rudania/Inariko/Vhintl home',
      sortRowsByDisplay(noRoleNoOc)
    );
  }

  console.log('');
}

function printCompactTable(rows) {
  console.log('\n=== Compact ===\n');
  const wName = 26;
  const wRoles = 22;
  const wSrc = 14;
  const wMain = 16;
  console.log(
    `${pad('Display', wName)} ${pad('Resident roles', wRoles)} ${pad('Source', wSrc)} ${pad('OC home', wMain)} In`
  );
  console.log('-'.repeat(wName + wRoles + wSrc + wMain + 8));
  const sorted = sortRowsByDisplay(rows);
  for (const r of sorted) {
    console.log(
      `${pad(r.displayName, wName)} ${pad(r.residentRolesHeld, wRoles)} ${pad(r.rosterSource, wSrc)} ${pad(r.mainOcHomeOnSheet, wMain)} ${r.inactive}`
    );
  }
}

function buildRows(humans, mainByUser) {
  const rows = [];
  for (const member of humans) {
    const residentKeys = villagesFromRoles(member);
    const main = mainByUser.get(member.id) || null;
    const mainName = main ? main.name : '—';
    const mainHomeRaw = main ? normalizeVillage(main.homeVillage) : null;
    const mainHomeLabel = mainHomeRaw ? villageLabel(mainHomeRaw) : '—';

    const inactive = member.roles.cache.has(INACTIVE_ROLE_ID) ? 'yes' : 'no';
    const rs = rosterSource(residentKeys, mainHomeRaw);

    rows.push({
      displayName: member.displayName,
      username: member.user.tag,
      userId: member.id,
      inactive,
      residentKeys,
      residentRolesHeld: residentKeys.length
        ? residentKeys.map(villageLabel).join(' + ')
        : '—',
      rosterSource: rs,
      mainCharacter: mainName,
      mainOcHomeOnSheet: mainHomeLabel,
      mainOcHomeKey: mainHomeRaw,
    });
  }
  return rows;
}

async function main() {
  const asCsv = process.argv.includes('--csv');
  const compact = process.argv.includes('--compact');

  if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN not set');
    process.exit(1);
  }
  if (!process.env.GUILD_ID) {
    console.error('❌ GUILD_ID not set');
    process.exit(1);
  }

  await connectDb();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  await new Promise((resolve, reject) => {
    client.once('ready', resolve);
    client.once('error', reject);
    client.login(process.env.DISCORD_TOKEN);
  });

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.members.fetch();

  const excludedIds = excludedFromRosterUserIds();
  const humans = [...guild.members.cache.values()].filter(
    (m) => !m.user.bot && !excludedIds.has(m.id)
  );
  const userIds = humans.map((m) => m.id);
  const mainByUser = await loadMainCharactersByUser(userIds);

  const rows = buildRows(humans, mainByUser);

  if (asCsv) {
    const headers = [
      'displayName',
      'username',
      'userId',
      'inactive',
      'rudaniaRole630837341124034580',
      'inarikoRole631507660524486657',
      'vhintlRole631507736508629002',
      'residentRolesHeld',
      'rosterSource',
      'mainCharacter',
      'mainOcHomeOnSheet',
    ];
    console.log(headers.join(','));
    for (const r of sortRowsByDisplay(rows)) {
      const line = [
        r.displayName,
        r.username,
        r.userId,
        r.inactive,
        r.residentKeys.includes('rudania') ? 'yes' : 'no',
        r.residentKeys.includes('inariko') ? 'yes' : 'no',
        r.residentKeys.includes('vhintl') ? 'yes' : 'no',
        r.residentRolesHeld,
        r.rosterSource,
        r.mainCharacter,
        r.mainOcHomeOnSheet,
      ];
      console.log(line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    }
  } else if (compact) {
    printCompactTable(rows);
  } else {
    printGroupedReport(guild, rows);
  }

  await mongoose.disconnect().catch(() => {});
  client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
