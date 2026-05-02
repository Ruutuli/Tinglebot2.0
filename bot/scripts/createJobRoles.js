// ============================================================================
// Create Discord roles for every job in jobData (names: "Job: <Name>").
// Merges JOB_*=<snowflake> into your .env (same file that defines DISCORD_TOKEN if found).
//
// Usage:
//   node bot/scripts/createJobRoles.js [--dry-run] [--no-write-env] [--env-file=path]
//
// Requires: DISCORD_TOKEN, GUILD_ID (.env in repo root and/or bot/)
// Bot needs Manage Roles on the server.
// ============================================================================

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const env = process.env.NODE_ENV || 'development';
const repoRoot = path.resolve(__dirname, '..', '..');
const botRoot = path.resolve(__dirname, '..');

// Match bot/index.js: root .env + bot/.env, then optional .env.<NODE_ENV> overlays (same as many scripts here)
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

const envFiles = envLayers.map((l) => l.file);

require('module-alias/register');
const moduleAlias = require('module-alias');
moduleAlias.addAlias('@', path.resolve(__dirname, '..'));

const { Client, GatewayIntentBits } = require('discord.js');
const { allJobs } = require('../data/jobData');
const { roles } = require('../modules/rolesModule');

const DRY_RUN = process.argv.includes('--dry-run');
const NO_WRITE_ENV = process.argv.includes('--no-write-env');
const envFileArg = process.argv.find((a) => a.startsWith('--env-file='));
const ENV_FILE_OVERRIDE = envFileArg ? envFileArg.slice('--env-file='.length).trim() : null;
const CREATE_DELAY_MS = 400;

const DISCORD_SNOWFLAKE = /^\d{17,20}$/;

/** Prefer the env file that already defines DISCORD_TOKEN; else first existing layer file; else bot/.env */
function pickEnvFileForWrite() {
  if (ENV_FILE_OVERRIDE) {
    return path.resolve(process.cwd(), ENV_FILE_OVERRIDE);
  }
  const ordered = [...envLayers].reverse().map((l) => l.file);
  for (const file of ordered) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/^\s*DISCORD_TOKEN\s*=/m.test(text)) return file;
  }
  for (const file of ordered) {
    if (fs.existsSync(file)) return file;
  }
  return path.join(botRoot, '.env');
}

/**
 * Upsert JOB_*=snowflake lines. Skips invalid values. Preserves CRLF when the file uses it.
 * @returns {{ written: boolean, path: string, count: number, skipped: number }}
 */
function mergeJobRoleEnvVars(targetPath, envLines) {
  const pairs = [];
  let skipped = 0;
  for (const line of envLines) {
    const eq = line.indexOf('=');
    if (eq === -1) {
      skipped++;
      continue;
    }
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!k.startsWith('JOB_')) {
      skipped++;
      continue;
    }
    if (!DISCORD_SNOWFLAKE.test(v)) {
      skipped++;
      continue;
    }
    pairs.push([k, v]);
  }

  if (pairs.length === 0) {
    return { written: false, path: targetPath, count: 0, skipped };
  }

  const raw = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
  const useCRLF = raw.includes('\r\n');
  let normalized = raw.replace(/\r\n/g, '\n');

  for (const [key, value] of pairs) {
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=.*$`, 'm');
    const newLine = `${key}=${value}`;
    if (re.test(normalized)) {
      normalized = normalized.replace(re, newLine);
    } else {
      if (normalized.length && !normalized.endsWith('\n')) normalized += '\n';
      normalized += `${newLine}\n`;
    }
  }

  const out = useCRLF ? normalized.replace(/\n/g, '\r\n') : normalized;
  fs.writeFileSync(targetPath, out, 'utf8');
  return { written: true, path: targetPath, count: pairs.length, skipped };
}

const jobRoleColorHex = roles.Jobs[0]?.color || '#5e626e';

function roleNameForJob(jobName) {
  return `Job: ${jobName}`;
}

/** Matches process.env keys used in character.js / componentHandler (JOB_ADVENTURER, JOB_FORTUNE_TELLER, …) */
function jobToEnvKey(jobName) {
  const suffix = jobName
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
  return `JOB_${suffix}`;
}

function hexToInt(hex) {
  const n = parseInt(String(hex).replace(/^#/, ''), 16);
  return Number.isFinite(n) ? n : 0x5e626e;
}

async function main() {
  if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is not set after loading .env');
    console.error('   Checked (in order):');
    for (const p of envFiles) {
      console.error(`   - ${p} ${fs.existsSync(p) ? '✓' : '— missing'}`);
    }
    process.exit(1);
  }
  if (!process.env.GUILD_ID) {
    console.error('❌ GUILD_ID is not set after loading .env');
    console.error('   Checked (in order):');
    for (const p of envFiles) {
      console.error(`   - ${p} ${fs.existsSync(p) ? '✓' : '— missing'}`);
    }
    process.exit(1);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  try {
    await client.login(process.env.DISCORD_TOKEN);
  } catch (e) {
    console.error('❌ Login failed:', e.message);
    process.exit(1);
  }

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.roles.fetch();

  const color = hexToInt(jobRoleColorHex);
  const lines = [];

  console.log(`Guild: ${guild.name} (${guild.id})`);
  console.log(`Jobs from jobData: ${allJobs.length}${DRY_RUN ? ' (dry-run)' : ''}\n`);

  for (const jobName of allJobs) {
    const discordName = roleNameForJob(jobName);
    const envKey = jobToEnvKey(jobName);
    const existing = guild.roles.cache.find((r) => r.name === discordName);

    if (existing) {
      lines.push(`${envKey}=${existing.id}`);
      console.log(`⏭  exists  ${discordName} → ${existing.id}`);
      continue;
    }

    if (DRY_RUN) {
      lines.push(`${envKey}=<create ${discordName}>`);
      console.log(`…  would create  ${discordName}`);
      continue;
    }

    const created = await guild.roles.create({
      name: discordName,
      color,
      reason: 'Tinglebot: job role bootstrap (createJobRoles.js)',
    });
    lines.push(`${envKey}=${created.id}`);
    console.log(`✅ created  ${discordName} → ${created.id}`);
    await new Promise((r) => setTimeout(r, CREATE_DELAY_MS));
  }

  console.log('\n--- JOB_* (role IDs) ---\n');
  console.log(lines.join('\n'));
  console.log('');

  if (DRY_RUN) {
    console.log('ℹ  Dry-run: did not change .env (placeholders are not real IDs).');
    console.log('   Run without --dry-run to create roles and merge JOB_* into .env automatically.\n');
  } else if (NO_WRITE_ENV) {
    console.log('ℹ  Skipped .env (--no-write-env).\n');
  } else {
    const target = pickEnvFileForWrite();
    const result = mergeJobRoleEnvVars(target, lines);
    if (result.written) {
      console.log(`✅ Wrote ${result.count} JOB_* entries to:\n   ${result.path}\n`);
      if (result.skipped > 0) {
        console.log(`   (${result.skipped} lines skipped — not valid snowflakes)\n`);
      }
    } else {
      console.warn('⚠  No JOB_* lines with valid role IDs to write.\n');
    }
  }

  await client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
