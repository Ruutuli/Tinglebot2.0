// ============================================================================
// INTRO PERMISSIONS AUDIT SCRIPT
// ============================================================================
// Read-only script to check current permission state for Traveler and Verified roles
// This script does NOT make any changes, only reports current state

const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
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
  const VIEW_MEMBERS_BIT = BigInt(0x1000000);
  
  try {
    if (permissions.has(PermissionFlagsBits.ViewChannels)) perms.push('View Channels');
  } catch (e) {
    // Permission flag doesn't exist, skip
  }
  
  try {
    if (permissions.has(PermissionFlagsBits.SendMessages)) perms.push('Send Messages');
  } catch (e) {
    // Permission flag doesn't exist, skip
  }
  
  try {
    if (permissions.has(PermissionFlagsBits.ReadMessageHistory)) perms.push('Read Message History');
  } catch (e) {
    // Permission flag doesn't exist, skip
  }
  
  // Check for View Server Members permission using bitfield (0x1000000 = 16777216)
  // This is more reliable than using constant names which may vary by version
  try {
    if ((permissions.bitfield & VIEW_MEMBERS_BIT) !== 0n) {
      perms.push('View Server Members');
    }
  } catch (e) {
    // Error reading bitfield, skip
  }
  
  return perms.length > 0 ? perms.join(', ') : 'None';
}

function getPermissionState(overwrites, roleId) {
  const overwrite = overwrites.find(o => o.id === roleId);
  if (!overwrite) return 'No overwrite (inherits)';
  
  const allow = [];
  const deny = [];
  
  // Permission bit values
  const VIEW_CHANNELS_BIT = BigInt(0x400);
  const SEND_MESSAGES_BIT = BigInt(0x800);
  const READ_MESSAGE_HISTORY_BIT = BigInt(0x10000);
  
  // Check allow permissions using bitfield
  try {
    if ((overwrite.allow.bitfield & VIEW_CHANNELS_BIT) !== 0n) allow.push('View Channels');
    if ((overwrite.allow.bitfield & SEND_MESSAGES_BIT) !== 0n) allow.push('Send Messages');
    if ((overwrite.allow.bitfield & READ_MESSAGE_HISTORY_BIT) !== 0n) allow.push('Read Message History');
  } catch (e) {
    // Error reading allow permissions
  }
  
  // Check deny permissions using bitfield
  try {
    if ((overwrite.deny.bitfield & VIEW_CHANNELS_BIT) !== 0n) deny.push('View Channels');
    if ((overwrite.deny.bitfield & SEND_MESSAGES_BIT) !== 0n) deny.push('Send Messages');
    if ((overwrite.deny.bitfield & READ_MESSAGE_HISTORY_BIT) !== 0n) deny.push('Read Message History');
  } catch (e) {
    // Error reading deny permissions
  }
  
  if (allow.length === 0 && deny.length === 0) return 'No overwrite (inherits)';
  return `Allow: ${allow.join(', ') || 'None'} | Deny: ${deny.join(', ') || 'None'}`;
}

// ============================================================================
// ------------------- Main Audit Function -------------------
// ============================================================================

async function auditPermissions() {
  try {
    // Constants
    const VIEW_MEMBERS_BIT = BigInt(0x1000000);
    
    console.log('🔍 Starting permission audit...\n');
    
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
    
    console.log(`📊 Auditing permissions for: ${guild.name} (${guild.id})\n`);
    console.log('='.repeat(80));
    
    // ========================================================================
    // Role Information
    // ========================================================================
    console.log('\n📋 ROLE INFORMATION');
    console.log('-'.repeat(80));
    
    const travelerRole = guild.roles.cache.get(TRAVELER_ROLE_ID);
    const verifiedRole = guild.roles.cache.get(VERIFIED_ROLE_ID);
    
    if (!travelerRole) {
      console.error(`❌ Traveler role not found (ID: ${TRAVELER_ROLE_ID})`);
    } else {
      const travelerMembers = travelerRole.members.size;
      console.log(`\n✅ Traveler Role (${TRAVELER_ROLE_ID}):`);
      console.log(`   Name: ${travelerRole.name}`);
      console.log(`   Position: ${travelerRole.position}`);
      console.log(`   Members: ${travelerMembers}`);
      console.log(`   Permissions: ${formatPermissions(travelerRole.permissions)}`);
    }
    
    if (!verifiedRole) {
      console.error(`❌ Verified role not found (ID: ${VERIFIED_ROLE_ID})`);
    } else {
      const verifiedMembers = verifiedRole.members.size;
      console.log(`\n✅ Verified Role (${VERIFIED_ROLE_ID}):`);
      console.log(`   Name: ${verifiedRole.name}`);
      console.log(`   Position: ${verifiedRole.position}`);
      console.log(`   Members: ${verifiedMembers}`);
      console.log(`   Permissions: ${formatPermissions(verifiedRole.permissions)}`);
    }
    
    // Check role hierarchy
    if (travelerRole && verifiedRole) {
      const hierarchy = verifiedRole.position > travelerRole.position 
        ? 'Verified is ABOVE Traveler (correct)' 
        : 'Traveler is ABOVE Verified (should be reversed)';
      console.log(`\n📊 Role Hierarchy: ${hierarchy}`);
    }
    
    // ========================================================================
    // Server-Level Permissions
    // ========================================================================
    console.log('\n\n🌐 SERVER-LEVEL PERMISSIONS');
    console.log('-'.repeat(80));
    
    if (travelerRole) {
      const canViewMembers = (travelerRole.permissions.bitfield & VIEW_MEMBERS_BIT) !== 0n;
      console.log(`\nTraveler Role:`);
      console.log(`   View Server Members: ${canViewMembers ? '✅ ALLOW' : '❌ DENY'}`);
    }
    
    if (verifiedRole) {
      const canViewMembers = (verifiedRole.permissions.bitfield & VIEW_MEMBERS_BIT) !== 0n;
      console.log(`\nVerified Role:`);
      console.log(`   View Server Members: ${canViewMembers ? '✅ ALLOW' : '❌ DENY'}`);
    }
    
    // ========================================================================
    // Channel Permissions
    // ========================================================================
    console.log('\n\n📁 CHANNEL PERMISSIONS');
    console.log('-'.repeat(80));
    
    const channels = guild.channels.cache.filter(ch => ch.type === 0 || ch.type === 2); // Text and Voice channels
    const introChannel = guild.channels.cache.get(INTRO_CHANNEL_ID);
    
    console.log(`\n📝 Total channels to check: ${channels.size}`);
    
    // Check intro channel specifically
    if (introChannel) {
      console.log(`\n🎯 INTRO CHANNEL (${INTRO_CHANNEL_ID}):`);
      console.log(`   Name: ${introChannel.name}`);
      console.log(`   Type: ${introChannel.type === 0 ? 'Text' : 'Voice'}`);
      
      const travelerOverwrite = introChannel.permissionOverwrites.cache.get(TRAVELER_ROLE_ID);
      const verifiedOverwrite = introChannel.permissionOverwrites.cache.get(VERIFIED_ROLE_ID);
      
      console.log(`\n   Traveler Role Overwrite:`);
      if (travelerOverwrite) {
        console.log(`     ${getPermissionState(Array.from(introChannel.permissionOverwrites.cache.values()), TRAVELER_ROLE_ID)}`);
      } else {
        console.log(`     No overwrite (inherits from role/server)`);
      }
      
      console.log(`\n   Verified Role Overwrite:`);
      if (verifiedOverwrite) {
        console.log(`     ${getPermissionState(Array.from(introChannel.permissionOverwrites.cache.values()), VERIFIED_ROLE_ID)}`);
      } else {
        console.log(`     No overwrite (inherits from role/server)`);
      }
    } else {
      console.log(`\n❌ Intro channel not found (ID: ${INTRO_CHANNEL_ID})`);
    }
    
    // Check all channels for Traveler and Verified overwrites
    const channelsWithTravelerOverwrite = [];
    const channelsWithVerifiedOverwrite = [];
    const channelsTravelerCanSee = [];
    const channelsVerifiedCanSee = [];
    
    const VIEW_CHANNELS_BIT = BigInt(0x400);
    
    channels.forEach(channel => {
      const travelerOverwrite = channel.permissionOverwrites.cache.get(TRAVELER_ROLE_ID);
      const verifiedOverwrite = channel.permissionOverwrites.cache.get(VERIFIED_ROLE_ID);
      
      if (travelerOverwrite) {
        channelsWithTravelerOverwrite.push({
          name: channel.name,
          id: channel.id,
          state: getPermissionState(Array.from(channel.permissionOverwrites.cache.values()), TRAVELER_ROLE_ID)
        });
        
        // Check if Traveler can view this channel using bitfield
        try {
          const canViewAllow = (travelerOverwrite.allow.bitfield & VIEW_CHANNELS_BIT) !== 0n;
          const canViewDeny = (travelerOverwrite.deny.bitfield & VIEW_CHANNELS_BIT) !== 0n;
          const roleCanView = travelerRole ? (travelerRole.permissions.bitfield & VIEW_CHANNELS_BIT) !== 0n : false;
          
          if (canViewAllow || (!canViewDeny && roleCanView)) {
            channelsTravelerCanSee.push(channel.name);
          }
        } catch (e) {
          // Error checking permissions, skip
        }
      }
      
      if (verifiedOverwrite) {
        channelsWithVerifiedOverwrite.push({
          name: channel.name,
          id: channel.id,
          state: getPermissionState(Array.from(channel.permissionOverwrites.cache.values()), VERIFIED_ROLE_ID)
        });
      }
      
      // Check if Verified can view this channel (inherits or explicit allow) using bitfield
      if (verifiedRole) {
        try {
          let canView = false;
          if (verifiedOverwrite) {
            const canViewAllow = (verifiedOverwrite.allow.bitfield & VIEW_CHANNELS_BIT) !== 0n;
            const canViewDeny = (verifiedOverwrite.deny.bitfield & VIEW_CHANNELS_BIT) !== 0n;
            const roleCanView = (verifiedRole.permissions.bitfield & VIEW_CHANNELS_BIT) !== 0n;
            canView = canViewAllow || (!canViewDeny && roleCanView);
          } else {
            canView = (verifiedRole.permissions.bitfield & VIEW_CHANNELS_BIT) !== 0n;
          }
          
          if (canView) {
            channelsVerifiedCanSee.push(channel.name);
          }
        } catch (e) {
          // Error checking permissions, skip
        }
      }
    });
    
    console.log(`\n\n📊 Channels with Traveler overwrite: ${channelsWithTravelerOverwrite.length}`);
    if (channelsWithTravelerOverwrite.length > 0) {
      channelsWithTravelerOverwrite.forEach(ch => {
        console.log(`   - ${ch.name} (${ch.id}): ${ch.state}`);
      });
    }
    
    console.log(`\n📊 Channels with Verified overwrite: ${channelsWithVerifiedOverwrite.length}`);
    if (channelsWithVerifiedOverwrite.length > 0) {
      channelsWithVerifiedOverwrite.forEach(ch => {
        console.log(`   - ${ch.name} (${ch.id}): ${ch.state}`);
      });
    }
    
    console.log(`\n👁️  Channels Traveler can see: ${channelsTravelerCanSee.length}`);
    if (channelsTravelerCanSee.length > 0 && channelsTravelerCanSee.length <= 20) {
      channelsTravelerCanSee.forEach(name => console.log(`   - ${name}`));
    } else if (channelsTravelerCanSee.length > 20) {
      console.log(`   (Showing first 20 of ${channelsTravelerCanSee.length})`);
      channelsTravelerCanSee.slice(0, 20).forEach(name => console.log(`   - ${name}`));
    }
    
    console.log(`\n👁️  Channels Verified can see: ${channelsVerifiedCanSee.length}`);
    if (channelsVerifiedCanSee.length > 0 && channelsVerifiedCanSee.length <= 20) {
      channelsVerifiedCanSee.forEach(name => console.log(`   - ${name}`));
    } else if (channelsVerifiedCanSee.length > 20) {
      console.log(`   (Showing first 20 of ${channelsVerifiedCanSee.length})`);
      channelsVerifiedCanSee.slice(0, 20).forEach(name => console.log(`   - ${name}`));
    }
    
    // ========================================================================
    // Summary and Recommendations
    // ========================================================================
    console.log('\n\n📋 SUMMARY & RECOMMENDATIONS');
    console.log('-'.repeat(80));
    
    const issues = [];
    const recommendations = [];
    
    if (!travelerRole) {
      issues.push('Traveler role not found');
    }
    
    if (!verifiedRole) {
      issues.push('Verified role not found');
    }
    
    if (travelerRole && verifiedRole && verifiedRole.position <= travelerRole.position) {
      issues.push('Verified role should be positioned ABOVE Traveler role in Discord');
      recommendations.push('Move Verified role above Traveler role in server settings');
    }
    
    if (travelerRole) {
      const canViewMembers = (travelerRole.permissions.bitfield & VIEW_MEMBERS_BIT) !== 0n;
      if (canViewMembers) {
        issues.push('Traveler role should NOT have "View Server Members" permission');
        recommendations.push('Remove "View Server Members" from Traveler role');
      }
    }
    
    if (verifiedRole) {
      const canViewMembers = (verifiedRole.permissions.bitfield & VIEW_MEMBERS_BIT) !== 0n;
      if (!canViewMembers) {
        issues.push('Verified role should have "View Server Members" permission');
        recommendations.push('Add "View Server Members" to Verified role');
      }
    }
    
    if (introChannel) {
      const travelerOverwrite = introChannel.permissionOverwrites.cache.get(TRAVELER_ROLE_ID);
      let canViewIntro = false;
      if (travelerOverwrite) {
        try {
          const VIEW_CHANNELS_BIT = BigInt(0x400);
          canViewIntro = (travelerOverwrite.allow.bitfield & VIEW_CHANNELS_BIT) !== 0n;
        } catch (e) {
          // Error checking permissions
        }
      }
      
      if (!canViewIntro) {
        issues.push('Traveler role cannot view intro channel');
        recommendations.push('Add "View Channel" permission for Traveler role on intro channel');
      }
    }
    
    if (channelsTravelerCanSee.length > 1) {
      issues.push(`Traveler role can see ${channelsTravelerCanSee.length} channels (should only see intro channel)`);
      recommendations.push('Deny "View Channel" for Traveler role on all channels except intro channel');
    }
    
    if (issues.length > 0) {
      console.log('\n⚠️  ISSUES FOUND:');
      issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
    } else {
      console.log('\n✅ No issues found!');
    }
    
    if (recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      recommendations.forEach((rec, i) => console.log(`   ${i + 1}. ${rec}`));
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Audit complete!\n');
    
    await client.destroy();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during audit:', error);
    await client.destroy();
    process.exit(1);
  }
}

// Run audit
auditPermissions();
