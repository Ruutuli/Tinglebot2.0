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
    
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('❌ No guild found!');
      process.exit(1);
    }
    
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
    try {
      await travelerRole.setPermissions(
        travelerRole.permissions.remove(PermissionFlagsBits.ViewServerMembers),
        'Intro verification system: Traveler role should not see member list'
      );
      console.log('✅ Removed "View Server Members" from Traveler role');
    } catch (error) {
      console.error(`❌ Error updating Traveler role permissions: ${error.message}`);
    }
    
    // Update Verified role - add View Server Members
    try {
      await verifiedRole.setPermissions(
        verifiedRole.permissions.add(PermissionFlagsBits.ViewServerMembers),
        'Intro verification system: Verified role should see member list'
      );
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
        
        // For Traveler role
        if (isIntroChannel) {
          // Intro channel: Allow View Channel and Send Messages
          newOverwrites.push({
            id: TRAVELER_ROLE_ID,
            type: 0, // Role
            allow: [
              PermissionFlagsBits.ViewChannels,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ],
            deny: []
          });
        } else {
          // All other channels: Deny View Channel
          newOverwrites.push({
            id: TRAVELER_ROLE_ID,
            type: 0, // Role
            allow: [],
            deny: [PermissionFlagsBits.ViewChannels]
          });
        }
        
        // For Verified role - allow View Channel on all channels
        // (inherits other permissions from role/server)
        newOverwrites.push({
          id: VERIFIED_ROLE_ID,
          type: 0, // Role
          allow: [PermissionFlagsBits.ViewChannels],
          deny: []
        });
        
        // Check if changes are needed
        let needsUpdate = false;
        
        // Check Traveler overwrite
        if (isIntroChannel) {
          if (!travelerOverwrite || 
              !travelerOverwrite.allow.has(PermissionFlagsBits.ViewChannels) ||
              !travelerOverwrite.allow.has(PermissionFlagsBits.SendMessages)) {
            needsUpdate = true;
          }
        } else {
          if (!travelerOverwrite || 
              !travelerOverwrite.deny.has(PermissionFlagsBits.ViewChannels)) {
            needsUpdate = true;
          }
        }
        
        // Check Verified overwrite
        if (!verifiedOverwrite || 
            !verifiedOverwrite.allow.has(PermissionFlagsBits.ViewChannels)) {
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          // Apply overwrites
          for (const overwrite of newOverwrites) {
            await channel.permissionOverwrites.edit(overwrite.id, {
              allow: overwrite.allow,
              deny: overwrite.deny
            }, { reason: 'Intro verification system: Configure role permissions' });
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
      await everyoneRole.setPermissions(
        everyoneRole.permissions.remove(PermissionFlagsBits.ViewChannels),
        'Intro verification system: Default deny View Channels for @everyone'
      );
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
