// ============================================================================
// INTRO PERMISSIONS UPDATE SCRIPT
// ============================================================================
// Script to configure all channel permissions for Traveler and Verified roles
// This script MAKES CHANGES to your Discord server permissions

const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

// Constants
const TRAVELER_ROLE_ID = '788137818135330837';
const VERIFIED_ROLE_ID = '1460099245347700962';
const INTRO_CHANNEL_ID = '795200689918836736';

// Verified role can post in these channels
const VERIFIED_POST_CHANNELS = [
  '606004405128527873', // 🔔》faqs
  '606134571456659475', // 💬》gossip-stone
  '1135739981890068520' // 💬》mossy-stone
];

// INFO section channels (Verified can view all, but only post in faqs)
// From server data: parent category is 606004294310690847
const INFO_SECTION_CHANNELS = [
  '795200689918836736', // 🔔》intro
  '1404982928412246076', // 🔔》suggestions
  '788106986327506994', // 🔔》rules
  '814567241101475932', // 🔔》roster
  '606004405128527873', // 🔔》faqs
  '641858948802150400'  // 🔔》sheikah-slate
];

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

function formatPermissions(permissions) {
  const perms = [];
  if (permissions.has(PermissionFlagsBits.ViewChannels)) perms.push('View Channels');
  if (permissions.has(PermissionFlagsBits.SendMessages)) perms.push('Send Messages');
  if (permissions.has(PermissionFlagsBits.ReadMessageHistory)) perms.push('Read Message History');
  if (permissions.has(PermissionFlagsBits.ViewServerMembers)) perms.push('View Server Members');
  return perms.length > 0 ? perms.join(', ') : 'None';
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// ------------------- Main Update Function -------------------
// ============================================================================

async function updatePermissions() {
  try {
    console.log('🔧 Starting permission update...\n');
    
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Bot logged in as ${client.user.tag}\n`);
    
    // Wait for guilds to be ready
    await client.guilds.fetch();
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('❌ No guild found!');
      process.exit(1);
    }
    
    // Fetch full guild data including channels and roles
    await guild.fetch();
    await guild.channels.fetch();
    await guild.roles.fetch();
    
    console.log(`📊 Updating permissions for: ${guild.name} (${guild.id})\n`);
    console.log('='.repeat(80));
    
    // ========================================================================
    // Verify Roles Exist
    // ========================================================================
    const travelerRole = guild.roles.cache.get(TRAVELER_ROLE_ID);
    const verifiedRole = guild.roles.cache.get(VERIFIED_ROLE_ID);
    
    if (!travelerRole) {
      console.error(`❌ Traveler role not found (ID: ${TRAVELER_ROLE_ID})`);
      process.exit(1);
    }
    
    if (!verifiedRole) {
      console.error(`❌ Verified role not found (ID: ${VERIFIED_ROLE_ID})`);
      process.exit(1);
    }
    
    console.log(`✅ Traveler Role: ${travelerRole.name} (${travelerRole.members.size} members)`);
    console.log(`✅ Verified Role: ${verifiedRole.name} (${verifiedRole.members.size} members)\n`);
    
    // ========================================================================
    // Update Server-Level Permissions
    // ========================================================================
    console.log('🌐 UPDATING SERVER-LEVEL PERMISSIONS');
    console.log('-'.repeat(80));
    
    // Update Traveler role - remove View Server Members
    // View Server Members bit: 0x1000000 (16777216)
    const VIEW_MEMBERS_BIT = BigInt(0x1000000);
    try {
      const currentPerms = travelerRole.permissions.bitfield;
      const newPerms = currentPerms & ~VIEW_MEMBERS_BIT; // Remove the bit
      await travelerRole.setPermissions(newPerms.toString(), 'Intro verification system: Traveler role should not see member list');
      console.log('✅ Removed "View Server Members" from Traveler role');
    } catch (error) {
      console.error(`❌ Error updating Traveler role permissions: ${error.message}`);
    }
    
    // Update Verified role - add View Server Members
    try {
      const currentPerms = verifiedRole.permissions.bitfield;
      const newPerms = currentPerms | VIEW_MEMBERS_BIT; // Add the bit
      await verifiedRole.setPermissions(newPerms.toString(), 'Intro verification system: Verified role should see member list');
      console.log('✅ Added "View Server Members" to Verified role');
    } catch (error) {
      console.error(`❌ Error updating Verified role permissions: ${error.message}`);
    }
    
    await sleep(1000); // Rate limit protection
    
    // ========================================================================
    // Update Channel Permissions
    // ========================================================================
    console.log('\n📁 UPDATING CHANNEL PERMISSIONS');
    console.log('-'.repeat(80));
    
    const channels = guild.channels.cache.filter(ch => 
      ch.type === ChannelType.GuildText || 
      ch.type === ChannelType.GuildVoice ||
      ch.type === ChannelType.GuildForum
    );
    
    const introChannel = guild.channels.cache.get(INTRO_CHANNEL_ID);
    
    if (!introChannel) {
      console.error(`❌ Intro channel not found (ID: ${INTRO_CHANNEL_ID})`);
    }
    
    let channelsUpdated = 0;
    let channelsSkipped = 0;
    let errors = 0;
    
    console.log(`\n📝 Processing ${channels.size} channels...\n`);
    
    for (const [channelId, channel] of channels) {
      try {
        const isIntroChannel = channelId === INTRO_CHANNEL_ID;
        const channelName = channel.name;
        
        // Get current overwrites
        const currentOverwrites = channel.permissionOverwrites.cache;
        const travelerOverwrite = currentOverwrites.get(TRAVELER_ROLE_ID);
        const verifiedOverwrite = currentOverwrites.get(VERIFIED_ROLE_ID);
        
        // Prepare new overwrites
        const newOverwrites = [];
        
        // Permission bit values
        const VIEW_CHANNELS_BIT = BigInt(0x400);
        const SEND_MESSAGES_BIT = BigInt(0x800);
        const READ_MESSAGE_HISTORY_BIT = BigInt(0x10000);
        
        const isVerifiedPostChannel = VERIFIED_POST_CHANNELS.includes(channelId);
        const isInfoSectionChannel = INFO_SECTION_CHANNELS.includes(channelId);
        
        // For Traveler role
        if (isIntroChannel) {
          // Intro channel: Allow View Channel and Send Messages
          newOverwrites.push({
            id: TRAVELER_ROLE_ID,
            type: 0, // Role
            allow: Number(VIEW_CHANNELS_BIT | SEND_MESSAGES_BIT | READ_MESSAGE_HISTORY_BIT),
            deny: 0
          });
        } else {
          // All other channels: Deny View Channel
          newOverwrites.push({
            id: TRAVELER_ROLE_ID,
            type: 0, // Role
            allow: 0,
            deny: Number(VIEW_CHANNELS_BIT)
          });
        }
        
        // For Verified role
        // All channels: Allow View Channel
        let verifiedAllowBits = VIEW_CHANNELS_BIT;
        let verifiedDenyBits = BigInt(0);
        
        // For INFO section and post channels, also allow Read Message History
        if (isInfoSectionChannel || isVerifiedPostChannel) {
          verifiedAllowBits = verifiedAllowBits | READ_MESSAGE_HISTORY_BIT;
        }
        
        // Only allow Send Messages in specific post channels
        if (isVerifiedPostChannel) {
          verifiedAllowBits = verifiedAllowBits | SEND_MESSAGES_BIT;
        } else {
          // Deny Send Messages in all other channels (including INFO section channels that aren't post channels)
          verifiedDenyBits = SEND_MESSAGES_BIT;
        }
        
        newOverwrites.push({
          id: VERIFIED_ROLE_ID,
          type: 0, // Role
          allow: Number(verifiedAllowBits),
          deny: Number(verifiedDenyBits)
        });
        
        // Check if changes are needed
        let needsUpdate = false;
        
        // Check Traveler overwrite
        if (isIntroChannel) {
          if (!travelerOverwrite) {
            needsUpdate = true;
          } else {
            const canView = (travelerOverwrite.allow.bitfield & VIEW_CHANNELS_BIT) !== 0n;
            const canSend = (travelerOverwrite.allow.bitfield & SEND_MESSAGES_BIT) !== 0n;
            if (!canView || !canSend) {
              needsUpdate = true;
            }
          }
        } else {
          if (!travelerOverwrite) {
            needsUpdate = true;
          } else {
            const deniedView = (travelerOverwrite.deny.bitfield & VIEW_CHANNELS_BIT) !== 0n;
            if (!deniedView) {
              needsUpdate = true;
            }
          }
        }
        
        // Check Verified overwrite
        if (!verifiedOverwrite) {
          needsUpdate = true;
        } else {
          const canView = (verifiedOverwrite.allow.bitfield & VIEW_CHANNELS_BIT) !== 0n;
          const canReadHistory = (verifiedOverwrite.allow.bitfield & READ_MESSAGE_HISTORY_BIT) !== 0n;
          const canSend = (verifiedOverwrite.allow.bitfield & SEND_MESSAGES_BIT) !== 0n;
          const deniedSend = (verifiedOverwrite.deny.bitfield & SEND_MESSAGES_BIT) !== 0n;
          
          // Should be able to view and read history for INFO/post channels
          if ((isInfoSectionChannel || isVerifiedPostChannel) && (!canView || !canReadHistory)) {
            needsUpdate = true;
          }
          
          // Check send messages permission
          if (isVerifiedPostChannel) {
            // Should be able to send in post channels
            if (!canSend || deniedSend) {
              needsUpdate = true;
            }
          } else {
            // Should NOT be able to send in other channels (including other INFO section channels)
            if (canSend || !deniedSend) {
              needsUpdate = true;
            }
          }
        }
        
        if (needsUpdate) {
          // Apply overwrites
          for (const overwrite of newOverwrites) {
            try {
              await channel.permissionOverwrites.edit(overwrite.id, {
                allow: overwrite.allow,
                deny: overwrite.deny
              }, { reason: 'Intro verification system: Configure role permissions' });
            } catch (error) {
              // If edit fails, try creating new overwrite
              try {
                await channel.permissionOverwrites.create(overwrite.id, {
                  allow: overwrite.allow,
                  deny: overwrite.deny
                }, { reason: 'Intro verification system: Configure role permissions' });
              } catch (createError) {
                throw error; // Throw original error if both fail
              }
            }
          }
          
          channelsUpdated++;
          console.log(`✅ Updated: ${channelName}${isIntroChannel ? ' (INTRO CHANNEL)' : ''}`);
        } else {
          channelsSkipped++;
          if (channelsSkipped <= 5) {
            console.log(`⏭️  Skipped: ${channelName} (already configured)`);
          }
        }
        
        // Rate limit protection
        await sleep(100);
        
      } catch (error) {
        errors++;
        console.error(`❌ Error updating channel ${channel.name}: ${error.message}`);
      }
    }
    
    if (channelsSkipped > 5) {
      console.log(`⏭️  ... and ${channelsSkipped - 5} more channels (already configured)`);
    }
    
    // ========================================================================
    // Update @everyone role (server-wide default)
    // ========================================================================
    console.log('\n👥 UPDATING @EVERYONE ROLE');
    console.log('-'.repeat(80));
    
    const everyoneRole = guild.roles.everyone;
    try {
      // Deny View Channels for @everyone by default
      // View Channels bit: 0x400 (1024)
      const VIEW_CHANNELS_BIT = BigInt(0x400);
      const currentPerms = everyoneRole.permissions.bitfield;
      const newPerms = currentPerms & ~VIEW_CHANNELS_BIT; // Remove the bit
      await everyoneRole.setPermissions(newPerms.toString(), 'Intro verification system: Default deny View Channels for @everyone');
      console.log('✅ Denied "View Channels" for @everyone role (default)');
    } catch (error) {
      console.error(`❌ Error updating @everyone role: ${error.message}`);
    }
    
    // ========================================================================
    // Summary
    // ========================================================================
    console.log('\n\n📋 SUMMARY');
    console.log('-'.repeat(80));
    console.log(`✅ Channels updated: ${channelsUpdated}`);
    console.log(`⏭️  Channels skipped: ${channelsSkipped}`);
    if (errors > 0) {
      console.log(`❌ Errors: ${errors}`);
    }
    console.log('\n✅ Permission update complete!');
    console.log('\n💡 Next steps:');
    console.log('   1. Run auditIntroPermissions.js to verify changes');
    console.log('   2. Test with a test account that has Traveler role');
    console.log('   3. Verify Traveler can only see intro channel');
    console.log('   4. Verify Verified role can see all channels');
    
    console.log('\n' + '='.repeat(80));
    
    await client.destroy();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during update:', error);
    await client.destroy();
    process.exit(1);
  }
}

// Run update
updatePermissions();
