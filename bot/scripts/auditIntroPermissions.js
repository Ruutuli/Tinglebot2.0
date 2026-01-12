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
  if (permissions.has(PermissionFlagsBits.ViewChannels)) perms.push('View Channels');
  if (permissions.has(PermissionFlagsBits.SendMessages)) perms.push('Send Messages');
  if (permissions.has(PermissionFlagsBits.ReadMessageHistory)) perms.push('Read Message History');
  if (permissions.has(PermissionFlagsBits.ViewServerMembers)) perms.push('View Server Members');
  return perms.length > 0 ? perms.join(', ') : 'None';
}

function getPermissionState(overwrites, roleId) {
  const overwrite = overwrites.find(o => o.id === roleId);
  if (!overwrite) return 'No overwrite (inherits)';
  
  const allow = [];
  const deny = [];
  
  if (overwrite.allow.has(PermissionFlagsBits.ViewChannels)) allow.push('View Channels');
  if (overwrite.allow.has(PermissionFlagsBits.SendMessages)) allow.push('Send Messages');
  if (overwrite.allow.has(PermissionFlagsBits.ReadMessageHistory)) allow.push('Read Message History');
  
  if (overwrite.deny.has(PermissionFlagsBits.ViewChannels)) deny.push('View Channels');
  if (overwrite.deny.has(PermissionFlagsBits.SendMessages)) deny.push('Send Messages');
  if (overwrite.deny.has(PermissionFlagsBits.ReadMessageHistory)) deny.push('Read Message History');
  
  if (allow.length === 0 && deny.length === 0) return 'No overwrite (inherits)';
  return `Allow: ${allow.join(', ') || 'None'} | Deny: ${deny.join(', ') || 'None'}`;
}

// ============================================================================
// ------------------- Main Audit Function -------------------
// ============================================================================

async function auditPermissions() {
  try {
    console.log('🔍 Starting permission audit...\n');
    
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Bot logged in as ${client.user.tag}\n`);
    
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('❌ No guild found!');
      process.exit(1);
    }
    
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
      const canViewMembers = travelerRole.permissions.has(PermissionFlagsBits.ViewServerMembers);
      console.log(`\nTraveler Role:`);
      console.log(`   View Server Members: ${canViewMembers ? '✅ ALLOW' : '❌ DENY'}`);
    }
    
    if (verifiedRole) {
      const canViewMembers = verifiedRole.permissions.has(PermissionFlagsBits.ViewServerMembers);
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
        console.log(`     ${getPermissionState(introChannel.permissionOverwrites.cache.array(), TRAVELER_ROLE_ID)}`);
      } else {
        console.log(`     No overwrite (inherits from role/server)`);
      }
      
      console.log(`\n   Verified Role Overwrite:`);
      if (verifiedOverwrite) {
        console.log(`     ${getPermissionState(introChannel.permissionOverwrites.cache.array(), VERIFIED_ROLE_ID)}`);
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
    
    channels.forEach(channel => {
      const travelerOverwrite = channel.permissionOverwrites.cache.get(TRAVELER_ROLE_ID);
      const verifiedOverwrite = channel.permissionOverwrites.cache.get(VERIFIED_ROLE_ID);
      
      if (travelerOverwrite) {
        channelsWithTravelerOverwrite.push({
          name: channel.name,
          id: channel.id,
          state: getPermissionState(channel.permissionOverwrites.cache.array(), TRAVELER_ROLE_ID)
        });
        
        // Check if Traveler can view this channel
        if (travelerOverwrite.allow.has(PermissionFlagsBits.ViewChannels) || 
            (!travelerOverwrite.deny.has(PermissionFlagsBits.ViewChannels) && travelerRole?.permissions.has(PermissionFlagsBits.ViewChannels))) {
          channelsTravelerCanSee.push(channel.name);
        }
      }
      
      if (verifiedOverwrite) {
        channelsWithVerifiedOverwrite.push({
          name: channel.name,
          id: channel.id,
          state: getPermissionState(channel.permissionOverwrites.cache.array(), VERIFIED_ROLE_ID)
        });
      }
      
      // Check if Verified can view this channel (inherits or explicit allow)
      if (verifiedRole) {
        const canView = verifiedOverwrite 
          ? verifiedOverwrite.allow.has(PermissionFlagsBits.ViewChannels) || 
            (!verifiedOverwrite.deny.has(PermissionFlagsBits.ViewChannels) && verifiedRole.permissions.has(PermissionFlagsBits.ViewChannels))
          : verifiedRole.permissions.has(PermissionFlagsBits.ViewChannels);
        
        if (canView) {
          channelsVerifiedCanSee.push(channel.name);
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
    
    if (travelerRole && travelerRole.permissions.has(PermissionFlagsBits.ViewServerMembers)) {
      issues.push('Traveler role should NOT have "View Server Members" permission');
      recommendations.push('Remove "View Server Members" from Traveler role');
    }
    
    if (verifiedRole && !verifiedRole.permissions.has(PermissionFlagsBits.ViewServerMembers)) {
      issues.push('Verified role should have "View Server Members" permission');
      recommendations.push('Add "View Server Members" to Verified role');
    }
    
    if (introChannel) {
      const travelerOverwrite = introChannel.permissionOverwrites.cache.get(TRAVELER_ROLE_ID);
      const canViewIntro = travelerOverwrite 
        ? travelerOverwrite.allow.has(PermissionFlagsBits.ViewChannels)
        : false;
      
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
