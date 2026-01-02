// ============================================================================
// fix_winter_ball_embed.js
// Purpose: Fix Winter Ball 2026 quest embed to show participants
// ============================================================================

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function fixWinterBallEmbed() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database\n');

    const Quest = require('./shared/models/QuestModel');
    
    // Find the Winter Ball quest
    const questID = 'Q343559';
    const quest = await Quest.findOne({ questID });
    
    if (!quest) {
      console.error(`❌ Quest ${questID} not found in database`);
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`📋 Found quest: ${quest.title}`);
    console.log(`   Quest ID: ${quest.questID}`);
    console.log(`   Status: ${quest.status}`);
    console.log(`   Message ID: ${quest.messageID}`);
    console.log(`   Participants: ${quest.participants ? Object.keys(quest.participants).length : 0}`);
    
    if (!quest.messageID) {
      console.error('❌ Quest has no messageID, cannot update embed');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Initialize Discord client
    console.log('\n🔌 Initializing Discord client...');
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    await client.login(process.env.DISCORD_TOKEN);
    
    // Wait for client to be ready
    await new Promise((resolve) => {
      client.once('ready', resolve);
    });
    
    console.log('✅ Discord client ready\n');

    // Get the quest command module
    const questCommand = require('./bot/commands/world/quest');
    
    // Get the guild
    const guildId = quest.guildId || '603960955839447050';
    const guild = await client.guilds.fetch(guildId);
    
    if (!guild) {
      console.error(`❌ Guild ${guildId} not found`);
      await client.destroy();
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`📝 Updating embed for quest ${questID}...`);
    
    // Update the embed
    const result = await questCommand.updateQuestEmbed(guild, quest, client, 'fix_script');
    
    if (result.success) {
      console.log('✅ Successfully updated quest embed!');
      console.log(`   Reason: ${result.reason}`);
    } else {
      console.error('❌ Failed to update quest embed');
      console.error(`   Reason: ${result.reason || result.error}`);
    }

    // Cleanup
    await client.destroy();
    await mongoose.disconnect();
    
    console.log('\n✅ Script completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixWinterBallEmbed();

