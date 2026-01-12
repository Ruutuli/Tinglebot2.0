// ============================================================================
// MIGRATE EXISTING MEMBERS TO VERIFIED ROLE
// ============================================================================
// Script to grant Verified role to all existing members
// This ensures current members don't lose access when permissions change

const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

// Constants
const VERIFIED_ROLE_ID = '1460099245347700962';
const TRAVELER_ROLE_ID = '788137818135330837';

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ============================================================================
// ------------------- Main Migration Function -------------------
// ============================================================================

async function migrateExistingMembers() {
  try {
    console.log('🔄 Starting migration of existing members...\n');
    
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Bot logged in as ${client.user.tag}\n`);
    
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('❌ No guild found!');
      process.exit(1);
    }
    
    console.log(`📊 Migrating members in: ${guild.name} (${guild.id})\n`);
    console.log('='.repeat(80));
    
    // ========================================================================
    // Verify Roles Exist
    // ========================================================================
    const verifiedRole = guild.roles.cache.get(VERIFIED_ROLE_ID);
    
    if (!verifiedRole) {
      console.error(`❌ Verified role not found (ID: ${VERIFIED_ROLE_ID})`);
      console.error('   Please create the Verified role first!');
      process.exit(1);
    }
    
    console.log(`✅ Verified Role: ${verifiedRole.name}`);
    console.log(`   Current members with role: ${verifiedRole.members.size}\n`);
    
    // ========================================================================
    // Fetch All Members
    // ========================================================================
    console.log('👥 Fetching all guild members...');
    const members = await guild.members.fetch();
    console.log(`✅ Found ${members.size} total members\n`);
    
    // ========================================================================
    // Process Members
    // ========================================================================
    console.log('🔄 Processing members...\n');
    console.log('-'.repeat(80));
    
    let alreadyVerified = 0;
    let newlyVerified = 0;
    let errors = 0;
    let skipped = 0;
    
    const membersArray = Array.from(members.values());
    
    for (let i = 0; i < membersArray.length; i++) {
      const member = membersArray[i];
      
      try {
        // Skip bots
        if (member.user.bot) {
          skipped++;
          continue;
        }
        
        // Check if already has Verified role
        if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
          alreadyVerified++;
          if (alreadyVerified <= 5) {
            console.log(`✅ ${member.user.tag} - Already has Verified role`);
          }
          continue;
        }
        
        // Grant Verified role
        await member.roles.add(verifiedRole, 'Intro verification system: Grant Verified role to existing member');
        newlyVerified++;
        
        console.log(`✅ ${member.user.tag} - Granted Verified role`);
        
        // Rate limit protection - Discord allows 50 role updates per 10 seconds
        if ((i + 1) % 50 === 0) {
          console.log(`⏸️  Rate limit protection: Waiting 11 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 11000));
        } else {
          // Small delay between each member
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        errors++;
        console.error(`❌ Error processing ${member.user.tag}: ${error.message}`);
        
        // If rate limited, wait longer
        if (error.message.includes('rate limit') || error.code === 429) {
          console.log('⏸️  Rate limited! Waiting 60 seconds...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      }
    }
    
    // ========================================================================
    // Summary
    // ========================================================================
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 MIGRATION SUMMARY');
    console.log('-'.repeat(80));
    console.log(`✅ Already had Verified role: ${alreadyVerified}`);
    console.log(`✅ Newly granted Verified role: ${newlyVerified}`);
    console.log(`⏭️  Skipped (bots): ${skipped}`);
    if (errors > 0) {
      console.log(`❌ Errors: ${errors}`);
    }
    
    const totalProcessed = alreadyVerified + newlyVerified + skipped;
    console.log(`\n📊 Total processed: ${totalProcessed} / ${members.size}`);
    
    // Refresh role member count
    await verifiedRole.members.fetch();
    console.log(`\n✅ Verified role now has ${verifiedRole.members.size} members`);
    
    console.log('\n✅ Migration complete!');
    console.log('\n💡 Next steps:');
    console.log('   1. Run updateIntroPermissions.js to configure channel permissions');
    console.log('   2. Verify existing members can still access all channels');
    console.log('   3. Test the intro verification flow with a new member');
    
    console.log('\n' + '='.repeat(80));
    
    await client.destroy();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during migration:', error);
    await client.destroy();
    process.exit(1);
  }
}

// Run migration
migrateExistingMembers();
