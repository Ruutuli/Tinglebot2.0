// ============================================================================
// ------------------- Give All Members 500 Tokens Script -------------------
// Purpose: Give every member in the server 500 tokens, DM them with an embed,
//          and log as a transaction.
// Usage: node bot/scripts/giveAllMembers500Tokens.js [--dry-run]
//
// Requires: GUILD_ID, DISCORD_TOKEN, and database env vars in .env
// ============================================================================

const path = require('path');
const dotenv = require('dotenv');

const env = process.env.NODE_ENV || 'development';
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const envSpecificPath = path.resolve(__dirname, '..', '..', `.env.${env}`);
if (require('fs').existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath });
} else {
  dotenv.config({ path: rootEnvPath });
}

require('module-alias/register');
const moduleAlias = require('module-alias');
moduleAlias.addAlias('@', path.resolve(__dirname, '..'));

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const DatabaseConnectionManager = require('../database/connectionManager');
const { updateTokenBalance } = require('../database/db');
const logger = require('../utils/logger');

const TOKEN_AMOUNT = 500;
const DM_DELAY_MS = 1500; // Rate limit: ~1.5s between DMs

const embedDescription = [
  "Hey! Here's **500 tokens**! 💠",
  "",
  "We decided going forward all new members will get 500 tokens when joining to help them get started!",
  "If you're an older member, consider this a thank you for being one of our members!",
  "",
  "Enjoy!"
].join('\n');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is not set');
    process.exit(1);
  }
  if (!process.env.GUILD_ID) {
    console.error('❌ GUILD_ID is not set');
    process.exit(1);
  }

  logger.info('TOKEN_GRANT', 'Initializing...');
  await DatabaseConnectionManager.initialize();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages
    ]
  });

  await new Promise((resolve, reject) => {
    client.once('ready', resolve);
    client.once('error', reject);
    client.login(process.env.DISCORD_TOKEN);
  });

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  if (!guild) {
    logger.error('TOKEN_GRANT', 'Guild not found');
    process.exit(1);
  }

  const members = await guild.members.fetch();
  const humanMembers = members.filter(m => !m.user.bot);

  logger.info('TOKEN_GRANT', `Found ${humanMembers.size} non-bot members${dryRun ? ' (DRY RUN)' : ''}`);

  let success = 0;
  let failed = 0;

  for (const [, member] of humanMembers) {
    const userId = member.id;
    const tag = member.user.tag;

    try {
      if (!dryRun) {
        await updateTokenBalance(userId, TOKEN_AMOUNT, {
          category: 'member_grant',
          description: '500 token welcome/thank-you grant',
          link: ''
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('💠 500 Tokens!')
        .setDescription(embedDescription)
        .setColor(0x9b59b6)
        .setTimestamp();

      if (!dryRun) {
        try {
          await member.send({ embeds: [embed] });
        } catch (dmErr) {
          logger.warn('TOKEN_GRANT', `Could not DM ${tag}: ${dmErr.message}`);
          // Tokens were already added; count as success
        }
      }

      success++;
      logger.info('TOKEN_GRANT', `${dryRun ? '[DRY RUN] ' : ''}✅ ${tag} (${userId})`);
    } catch (err) {
      failed++;
      logger.error('TOKEN_GRANT', `❌ ${tag} (${userId}): ${err.message}`);
    }

    if (!dryRun && success + failed < humanMembers.size) {
      await new Promise(r => setTimeout(r, DM_DELAY_MS));
    }
  }

  logger.info('TOKEN_GRANT', `Done. Success: ${success}, Failed: ${failed}${dryRun ? ' (DRY RUN - no changes made)' : ''}`);
  await client.destroy();
  await DatabaseConnectionManager.closeAll();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  logger.error('TOKEN_GRANT', `Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
