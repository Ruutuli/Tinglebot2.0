// ============================================================================
// ------------------- generateCharacterGuessQuest.js -------------------
// Test script: generates a single character-guess Help Wanted quest in a
// random village (or the village passed as first CLI arg) and saves it to the DB.
// Run from repo root: node bot/scripts/generateCharacterGuessQuest.js [Rudania|Inariko|Vhintl]
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

const { connectToTinglebot } = require('@/database/db');
const HelpWantedQuest = require('@/models/HelpWantedQuestModel');
const { generateCharacterGuessQuestForTesting, VILLAGES } = require('@/modules/helpWantedModule');

async function main() {
  const villageArg = process.argv[2];
  const village = villageArg && VILLAGES.includes(villageArg) ? villageArg : null;

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
  console.log('-------------------------------------\n');
  console.log('Use /helpwanted guess with this quest ID to test. Natives of', doc.village, 'only.\n');

  const mongoose = require('mongoose');
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  const mongoose = require('mongoose');
  mongoose.connection.close().then(() => process.exit(1));
});
