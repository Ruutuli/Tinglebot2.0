// ============================================================================
// ------------------- generateCharacterGuessQuest.js -------------------
// Test script: generates a single character-guess Help Wanted quest in a
// random village (or the village passed as first CLI arg), saves it to the DB,
// and posts it to that village's town hall Discord channel.
// Run from repo root: node bot/scripts/generateCharacterGuessQuest.js [Rudania|Inariko|Vhintl]
// Requires: DISCORD_TOKEN and RUDANIA_TOWNHALL / INARIKO_TOWNHALL / VHINTL_TOWNHALL in env.
// ============================================================================

const path = require('path');
const fs = require('fs');

// Load env (root .env or bot/.env)
const rootEnv = path.resolve(__dirname, '..', '..', '.env');
const botEnv = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(rootEnv)) {
  require('dotenv').config({ path: rootEnv });
} else if (fs.existsSync(botEnv)) {
  require('dotenv').config({ path: botEnv });
}

require('module-alias/register');
const moduleAlias = require('module-alias');
moduleAlias.addAlias('@', path.resolve(__dirname, '..'));

const { Client, GatewayIntentBits } = require('discord.js');
const { connectToTinglebot } = require('@/database/db');
const HelpWantedQuest = require('@/models/HelpWantedQuestModel');
const { generateCharacterGuessQuestForTesting, VILLAGES, postQuestToDiscord } = require('@/modules/helpWantedModule');

const mongoose = require('mongoose');

async function main() {
  const villageArg = process.argv[2];
  const village = villageArg && VILLAGES.includes(villageArg) ? villageArg : null;

  if (!process.env.DISCORD_TOKEN) {
    console.error('Error: DISCORD_TOKEN is not set. Set it in .env to post to Discord.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await connectToTinglebot();

  console.log('Generating character-guess quest...');
  const questData = await generateCharacterGuessQuestForTesting(village);

  const doc = new HelpWantedQuest(questData);
  await doc.save();

  console.log('\n--- Character-guess quest created ---');
  console.log('Quest ID:', doc.questId);
  console.log('Village:', doc.village);
  console.log('NPC:', doc.npcName);
  console.log('Clue type:', doc.requirements?.clueType);
  console.log('Answer (for testing):', doc.requirements?.characterName);
  if (doc.requirements?.clueType === 'snippets' && doc.requirements?.snippets?.length) {
    console.log('Snippets count:', doc.requirements.snippets.length);
  }
  if (doc.requirements?.clueType === 'icon-zoom' && doc.requirements?.zoomedIconUrl) {
    console.log('Zoomed icon URL:', doc.requirements.zoomedIconUrl);
  }
  console.log('-------------------------------------');
  console.log('Logging in to Discord to post to town hall...');

  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  await new Promise((resolve, reject) => {
    client.once('ready', async () => {
      try {
        const message = await postQuestToDiscord(client, doc);
        if (message) {
          console.log('Posted to channel. Message ID:', message.id);
        } else {
          console.warn('Failed to post quest to Discord (check channel IDs in env).');
        }
      } catch (e) {
        console.error('Error posting to Discord:', e.message);
      }
      client.destroy();
      resolve();
    });
    client.once('error', (err) => {
      console.error('Discord client error:', err.message);
      client.destroy();
      reject(err);
    });
    client.login(process.env.DISCORD_TOKEN).catch(reject);
  });

  console.log('Use /helpwanted guess with this quest ID to test. Natives of', doc.village, 'only.\n');
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  mongoose.connection.close().then(() => process.exit(1));
});
