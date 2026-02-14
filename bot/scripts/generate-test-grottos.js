// ============================================================================
// Generate test grottos (DB only) and post a summary to a Discord channel.
// Independent of exploration: creates Grotto docs so a party at that location
// can use /explore grotto continue and run trials (e.g. maze).
//
// Usage (from project root):
//   node bot/scripts/generate-test-grottos.js
//   node bot/scripts/generate-test-grottos.js --square H8 --quadrant Q2 --trial maze --party-id MY-EXPEDITION-ID
//
// Env:
//   MONGODB_URI or MONGODB_TINGLEBOT_URI  - MongoDB connection
//   DISCORD_TOKEN                         - Bot token (to post to channel)
//   TEST_GROTTO_CHANNEL_ID=1391812848099004578  - Channel to post to (default)
//   TEST_EXPEDITION_ID                    - Default partyId for created grottos (optional; use --party-id if not set)
// ============================================================================

const path = require('path');
const fs = require('fs');

const rootEnv = path.resolve(__dirname, '..', '..', '.env');
const botEnv = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(rootEnv)) require('dotenv').config({ path: rootEnv });
else if (fs.existsSync(botEnv)) require('dotenv').config({ path: botEnv });

require('module-alias/register');
const moduleAlias = require('module-alias');
moduleAlias.addAlias('@', path.resolve(__dirname, '..'));

const mongoose = require('mongoose');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const GROTTO_CHANNEL_ID = process.env.TEST_GROTTO_CHANNEL_ID || '1391812848099004578';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    square: 'H8',
    quadrant: 'Q2',
    trial: 'maze',
    partyId: process.env.TEST_EXPEDITION_ID || null,
    count: 1,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--square' && args[i + 1]) { out.square = args[i + 1]; i++; }
    else if (args[i] === '--quadrant' && args[i + 1]) { out.quadrant = args[i + 1]; i++; }
    else if (args[i] === '--trial' && args[i + 1]) { out.trial = args[i + 1]; i++; }
    else if (args[i] === '--party-id' && args[i + 1]) { out.partyId = args[i + 1]; i++; }
    else if (args[i] === '--count' && args[i + 1]) { out.count = Math.max(1, parseInt(args[i + 1], 10) || 1); i++; }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const uri = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set MONGODB_URI or MONGODB_TINGLEBOT_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const Grotto = require('@/models/GrottoModel.js');
  const Square = require('@/models/mapModel.js');
  const { rollGrottoTrialType, getTrialLabel } = require('@/data/grottoTrials.js');

  const trialType = ['blessing', 'target_practice', 'puzzle', 'test_of_power', 'maze'].includes(args.trial)
    ? args.trial
    : rollGrottoTrialType();
  const squareId = String(args.square).trim().toUpperCase();
  const quadrantId = String(args.quadrant).trim().toUpperCase();

  if (!args.partyId) {
    console.warn('No --party-id or TEST_EXPEDITION_ID set. Grotto will be created with partyId: null.');
    console.warn('Exploration looks up grotto by partyId; use a real expedition ID to test /explore grotto continue.');
  }

  const created = [];
  const at = new Date();
  const discoveryKey = `grotto|${squareId}|${quadrantId}|${at.toISOString()}`;

  for (let i = 0; i < args.count; i++) {
    const quad = args.count === 1 ? quadrantId : `Q${(i % 4) + 1}`;
    const key = args.count === 1 ? discoveryKey : `grotto|${squareId}|${quad}|${at.toISOString()}-${i}`;
    const existing = await Grotto.findOne({ squareId, quadrantId: quad });
    if (existing) {
      console.log(`Grotto already exists at ${squareId} ${quad}; skipping.`);
      created.push({ squareId, quadrantId: quad, skipped: true });
      continue;
    }
    const grottoDoc = new Grotto({
      squareId,
      quadrantId: quad,
      discoveryKey: key,
      sealed: false,
      trialType: args.count === 1 ? trialType : rollGrottoTrialType(),
      partyId: args.partyId || null,
      unsealedAt: at,
      unsealedBy: 'generate-test-grottos.js',
    });
    await grottoDoc.save();
    created.push({
      squareId,
      quadrantId: quad,
      trialType: grottoDoc.trialType,
      id: grottoDoc._id.toString(),
    });
    console.log(`Created grotto at ${squareId} ${quad} (${grottoDoc.trialType})`);
  }

  const firstCreated = created.find(c => !c.skipped);
  if (firstCreated) {
    try {
      await Square.updateOne(
        { squareId },
        { $push: { 'quadrants.$[q].discoveries': { type: 'grotto', discoveredAt: at, discoveryKey: `grotto|${squareId}|${firstCreated.quadrantId}|${at.toISOString()}` } } },
        { arrayFilters: [{ 'q.quadrantId': firstCreated.quadrantId }] }
      );
    } catch (e) {
      console.warn('Could not update map discovery (square/quadrant may not exist):', e.message);
    }
  }

  if (!process.env.DISCORD_TOKEN) {
    console.log('DISCORD_TOKEN not set; skipping channel post.');
    await mongoose.connection.close();
    process.exit(0);
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(process.env.DISCORD_TOKEN);

  const channel = await client.channels.fetch(GROTTO_CHANNEL_ID).catch(() => null);
  if (channel) {
    const lines = created.filter(c => !c.skipped).map(c => `**${c.squareId} ${c.quadrantId}** — ${getTrialLabel(c.trialType)}`);
    const expeditionNote = args.partyId
      ? `Use expedition ID \`${args.partyId}\` and move your party to the location(s) above, then </explore grotto continue>.`
      : 'Set TEST_EXPEDITION_ID or pass --party-id and ensure your party is at the grotto location, then use </explore grotto continue>.';
    const embed = new EmbedBuilder()
      .setTitle('Test grottos created')
      .setColor(0x00ff99)
      .setDescription(
        (lines.length ? lines.join('\n') + '\n\n' : 'No new grottos (already existed).\n\n') +
        expeditionNote
      )
      .setTimestamp();
    await channel.send({ embeds: [embed] });
    console.log(`Posted to channel ${GROTTO_CHANNEL_ID}`);
  } else {
    console.warn(`Could not find channel ${GROTTO_CHANNEL_ID}`);
  }

  client.destroy();
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
