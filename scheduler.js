// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

// Core dependencies
const dotenv = require("dotenv");
const path = require("path");
const cron = require("node-cron");
const { v4: uuidv4 } = require("uuid");

// Discord.js
const { EmbedBuilder } = require("discord.js");

// Database models
const Character = require("./models/CharacterModel");
const Pet = require("./models/PetModel");
const Raid = require("./models/RaidModel");
const RuuGame = require("./models/RuuGameModel");
const HelpWantedQuest = require('./models/HelpWantedQuestModel');
const ItemModel = require('./models/ItemModel');

// Database functions
const {
 generateVendingStockList,
 resetPetRollsForAllCharacters,
 connectToInventories,
 getCharacterInventoryCollection,
 fetchItemByName,
} = require("./database/db");

// Handlers
const {
 postBlightRollCall,
 cleanupExpiredBlightRequests,
 checkExpiringBlightRequests,
 sendBlightReminders,
 checkMissedRolls,
} = require("./handlers/blightHandler");

// Scripts
const {
 sendBloodMoonAnnouncement,
 sendBloodMoonEndAnnouncement,
 isBloodMoonDay,
 renameChannels,
 revertChannelNames,
 cleanupOldTrackingData,
} = require("./scripts/bloodmoon");

// Modules
const { recoverDailyStamina } = require("./modules/characterStatsModule");
const { bloodmoonDates, convertToHyruleanDate } = require("./modules/calendarModule");
const { formatSpecificQuestsAsEmbedsByVillage, generateDailyQuests, isTravelBlockedByWeather, regenerateEscortQuest, regenerateArtWritingQuest } = require('./modules/helpWantedModule');
const { processMonthlyQuestRewards } = require('./modules/questRewardModule');

// Utilities
const { safeAppendDataToSheet, extractSpreadsheetId } = require('./utils/googleSheetsUtils');

// Services
const { getCurrentWeather, generateWeatherEmbed, getWeatherWithoutGeneration } = require("./services/weatherService");

// Utils
const { handleError } = require("./utils/globalErrorHandler");
const { sendUserDM } = require("./utils/messageUtils");
const { checkExpiredRequests } = require("./utils/expirationHandler");
const { isValidImageUrl } = require("./utils/validation");
const {
 cleanupExpiredEntries,
 cleanupExpiredHealingRequests,
 cleanupExpiredBoostingRequests,
 getBoostingStatistics,
 archiveOldBoostingRequests,
} = require("./utils/storage");
const {
 retryPendingSheetOperations,
 getPendingSheetOperationsCount,
} = require("./utils/googleSheetsUtils");

// Constants
const DEFAULT_IMAGE_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const HELP_WANTED_TEST_CHANNEL = process.env.HELP_WANTED_TEST_CHANNEL || '1391812848099004578';

// Channel mappings
const TOWNHALL_CHANNELS = {
 Rudania: process.env.RUDANIA_TOWNHALL,
 Inariko: process.env.INARIKO_TOWNHALL,
 Vhintl: process.env.VHINTL_TOWNHALL,
};

const BLOOD_MOON_CHANNELS = [
 process.env.RUDANIA_TOWNHALL,
 process.env.INARIKO_TOWNHALL,
 process.env.VHINTL_TOWNHALL,
];

// Monthly quest posting (uses existing postQuests function)
const { postQuests } = require('./scripts/questAnnouncements');

// ============================================================================
// ------------------- Environment Setup -------------------
// ============================================================================

const env = process.env.NODE_ENV || "development";
try {
 const envPath = path.resolve(process.cwd(), `.env.${env}`);
 dotenv.config({ path: envPath });
} catch (error) {
 console.error(`[scheduler.js]: Failed to load .env.${env}:`, error.message);
 dotenv.config();
}

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

function createCronJob(
 schedule,
 jobName,
 jobFunction,
 timezone = "America/New_York"
) {
 return cron.schedule(
  schedule,
  async () => {
   try {
    await jobFunction();
   } catch (error) {
    handleError(error, "scheduler.js");
    console.error(`[scheduler.js]: ${jobName} failed:`, error.message);
   }
  },
  { timezone }
 );
}

function createAnnouncementEmbed(title, description, thumbnail, image, footer) {
 const embed = new EmbedBuilder()
  .setColor("#88cc88")
  .setTitle(title)
  .setDescription(description)
  .setTimestamp()
  .setFooter({ text: footer });

 if (isValidImageUrl(thumbnail)) {
  embed.setThumbnail(thumbnail);
 } else {
  embed.setThumbnail(DEFAULT_IMAGE_URL);
 }

 if (isValidImageUrl(image)) {
  embed.setImage(image);
 } else {
  embed.setImage(DEFAULT_IMAGE_URL);
 }

 return embed;
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// Helper function to get the appropriate village channel ID
function getVillageChannelId(villageName) {
  // Capitalize the village name to match the TOWNHALL_CHANNELS keys
  const capitalizedVillage = villageName.charAt(0).toUpperCase() + villageName.slice(1).toLowerCase();
  return TOWNHALL_CHANNELS[capitalizedVillage] || HELP_WANTED_TEST_CHANNEL;
}

// ============================================================================
// ------------------- Weather Functions -------------------
// ============================================================================

// ------------------- Weather Helper Functions ------------------

async function postWeatherForVillage(client, village, checkExisting = false) {
 try {
  if (checkExisting) {
   const existingWeather = await getWeatherWithoutGeneration(village);
   if (existingWeather) {
    return false; // Weather already exists
   }
  }

  const weather = await getCurrentWeather(village);
  if (!weather) {
   console.error(`[scheduler.js]: ❌ Failed to get weather for ${village}`);
   return false;
  }

  const channelId = TOWNHALL_CHANNELS[village];
  const channel = client.channels.cache.get(channelId);

  if (!channel) {
   console.error(`[scheduler.js]: ❌ Channel not found: ${channelId}`);
   return false;
  }

  const { embed, files } = await generateWeatherEmbed(village, weather);
  await channel.send({ embeds: [embed], files });
  return true;
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Error posting weather for ${village}:`, error.message);
  handleError(error, "scheduler.js", {
   commandName: 'postWeatherForVillage',
   village: village
  });
  return false;
 }
}

async function processWeatherForAllVillages(client, checkExisting = false, context = '') {
 try {
  const villages = Object.keys(TOWNHALL_CHANNELS);
  let postedCount = 0;

  for (const village of villages) {
   const posted = await postWeatherForVillage(client, village, checkExisting);
   if (posted) postedCount++;
  }

  if (postedCount > 0) {
   const contextText = context ? ` ${context}` : '';
   console.log(`[scheduler.js]: ✅ Weather posted to ${postedCount}/${villages.length} villages${contextText}`);
  }

  return postedCount;
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Weather process failed${context ? ` (${context})` : ''}:`, error.message);
  handleError(error, "scheduler.js", {
   commandName: 'processWeatherForAllVillages',
   context: context
  });
  return 0;
 }
}

// ------------------- Main Weather Functions ------------------

async function postWeatherUpdate(client) {
 return await processWeatherForAllVillages(client, false, 'update');
}

async function checkAndPostWeatherIfNeeded(client) {
 return await processWeatherForAllVillages(client, true, 'backup check');
}

async function checkAndPostWeatherOnRestart(client) {
 try {
  const now = new Date();
  const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const currentHour = estTime.getHours();
  
  if (currentHour < 8) {
   console.log(`[scheduler.js]: ⏰ Too early for weather generation (${currentHour}:00 AM)`);
   return 0;
  }
  
  return await processWeatherForAllVillages(client, true, 'restart check');
 } catch (error) {
  console.error("[scheduler.js]: ❌ Restart weather check failed:", error.message);
  handleError(error, "scheduler.js", {
   commandName: 'checkAndPostWeatherOnRestart'
  });
  return 0;
 }
}

// ============================================================================
// ------------------- Cleanup Functions -------------------
// ============================================================================

// ------------------- Individual Cleanup Functions ------------------

async function cleanupExpiredRaids(client = null) {
 try {
  const expiredRaids = await Raid.findExpiredRaids();
  
  if (expiredRaids.length === 0) {
   return { expiredCount: 0 };
  }
  
  console.log(`[scheduler.js]: 🧹 Found ${expiredRaids.length} expired raid(s) to clean up`);
  
  const { EmbedBuilder } = require('discord.js');
  let cleanedCount = 0;
  
  for (const raid of expiredRaids) {
   try {
    console.log(`[scheduler.js]: ⏰ Processing expired raid ${raid.raidId} - ${raid.monster.name} in ${raid.village}`);
    
    // Mark raid as failed and KO all participants
    await raid.failRaid();
    
    // Send failure message if client is available
    if (client) {
     const failureEmbed = new EmbedBuilder()
       .setColor('#FF0000')
       .setTitle('💥 **Raid Failed!**')
       .setDescription(`The raid against **${raid.monster.name}** has failed!`)
       .addFields(
         {
           name: '__Monster Status__',
           value: `💙 **Hearts:** ${raid.monster.currentHearts}/${raid.monster.maxHearts}`,
           inline: false
         },
         {
           name: '__Participants__',
           value: (raid.participants && raid.participants.length > 0)
             ? raid.participants.map(p => `• **${p.name}** (${p.damage} hearts) - **KO'd**`).join('\n')
             : 'No participants',
           inline: false
         },
         {
           name: '__Failure__',
           value: (raid.participants && raid.participants.length > 0)
             ? `The raid timer expired! All participants have been knocked out! 💀`
             : `The monster caused havoc as no one defended the village from it and then ran off!`,
           inline: false
         }
       )
       .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
       .setFooter({ text: `Raid ID: ${raid.raidId}` })
       .setTimestamp();
     
     // Try to send to thread first, then channel
     let sent = false;
     if (raid.threadId) {
       try {
         const thread = await client.channels.fetch(raid.threadId);
         if (thread) {
           await thread.send({ embeds: [failureEmbed] });
           console.log(`[scheduler.js]: 💬 Failure message sent to raid thread ${raid.threadId}`);
           sent = true;
         }
       } catch (threadError) {
         console.error(`[scheduler.js]: ❌ Error sending failure message to thread:`, threadError);
       }
     }
     
     if (!sent && raid.channelId) {
       try {
         const channel = await client.channels.fetch(raid.channelId);
         if (channel) {
           await channel.send({ embeds: [failureEmbed] });
           console.log(`[scheduler.js]: 💬 Failure message sent to raid channel ${raid.channelId}`);
           sent = true;
         }
       } catch (channelError) {
         console.error(`[scheduler.js]: ❌ Error sending failure message to channel:`, channelError);
       }
     }
     
     if (!sent) {
       console.log(`[scheduler.js]: ⚠️ Could not send failure message for raid ${raid.raidId} - no valid channel found`);
     }
    }
    
    cleanedCount++;
    console.log(`[scheduler.js]: ✅ Cleaned up expired raid ${raid.raidId}`);
    
   } catch (raidError) {
    console.error(`[scheduler.js]: ❌ Error cleaning up raid ${raid.raidId}:`, raidError);
    handleError(raidError, "scheduler.js", {
     raidId: raid.raidId,
     functionName: 'cleanupExpiredRaids'
    });
   }
  }
  
  if (cleanedCount > 0) {
   console.log(`[scheduler.js]: 🧹 Cleaned up ${cleanedCount} expired raid(s)`);
  }
  
  return { expiredCount: cleanedCount };
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Error cleaning up expired raids:`, error);
  handleError(error, "scheduler.js");
  return { expiredCount: 0 };
 }
}

async function cleanupOldRuuGameSessions() {
 try {
  console.log(`[scheduler.js]: 🎲 Starting RuuGame session cleanup`);
  
  const result = await RuuGame.cleanupOldSessions();
  
  if (result.deletedCount === 0) {
   console.log(`[scheduler.js]: ✅ No old RuuGame sessions to clean up`);
   return result;
  }
  
  console.log(`[scheduler.js]: ✅ RuuGame cleanup completed - deleted ${result.deletedCount} sessions`);
  
  if (result.finishedCount > 0) {
   console.log(`[scheduler.js]: 🏆 Cleaned up ${result.finishedCount} completed games`);
  }
  if (result.expiredCount > 0) {
   console.log(`[scheduler.js]: ⏰ Cleaned up ${result.expiredCount} expired sessions`);
  }
  
  return result;
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Error cleaning up old RuuGame sessions:`, error);
  handleError(error, "scheduler.js");
  return { deletedCount: 0, finishedCount: 0, expiredCount: 0 };
 }
}

async function cleanupFinishedMinigameSessions() {
 try {
  console.log(`[scheduler.js]: 🎮 Starting Minigame session cleanup`);
  
  const Minigame = require('./models/MinigameModel');
  const result = await Minigame.cleanupOldSessions();
  
  if (result.deletedCount === 0) {
   console.log(`[scheduler.js]: ✅ No finished Minigame sessions to clean up`);
   return result;
  }
  
  console.log(`[scheduler.js]: ✅ Minigame cleanup completed - deleted ${result.deletedCount} sessions`);
  
  if (result.finishedCount > 0) {
   console.log(`[scheduler.js]: 🏆 Cleaned up ${result.finishedCount} completed minigame sessions`);
  }
  
  return result;
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Error cleaning up finished Minigame sessions:`, error);
  handleError(error, "scheduler.js");
  return { deletedCount: 0, finishedCount: 0 };
 }
}

// ------------------- Combined Cleanup Functions ------------------

async function runDailyCleanupTasks(client) {
 try {
  console.log('[scheduler.js]: 🧹 Running daily cleanup tasks...');
  
  const results = await Promise.all([
   cleanupExpiredEntries(),
   cleanupExpiredHealingRequests(),
   checkExpiredRequests(client),
   cleanupExpiredBlightRequests(client),
   cleanupExpiredRaids(client),
   cleanupOldRuuGameSessions(),
   cleanupFinishedMinigameSessions(),
  ]);
  
  const blightResult = results[3];
  if (blightResult && typeof blightResult === 'object') {
   console.log(`[scheduler.js]: ✅ Daily blight cleanup - Expired: ${blightResult.expiredCount}, Notified: ${blightResult.notifiedUsers}, Deleted: ${blightResult.deletedCount}`);
  }
  
  return results;
 } catch (error) {
  console.error('[scheduler.js]: ❌ Error during daily cleanup:', error);
  handleError(error, 'scheduler.js');
  return [];
 }
}

// ============================================================================
// ------------------- Nitro Boost Rewards Functions -------------------
// ============================================================================

async function distributeMonthlyBoostRewards(client) {
  console.log('[scheduler.js]: 💎 Starting monthly Nitro boost reward distribution...');
  
  try {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      console.error('[scheduler.js]: ❌ Guild not found');
      return { success: false, error: 'Guild not found' };
    }

    // Fetch all members to ensure we have premium data
    await guild.members.fetch();
    
    // Get all members who are currently boosting
    const boosters = guild.members.cache.filter(member => member.premiumSince !== null);
    
    if (boosters.size === 0) {
      console.log('[scheduler.js]: ℹ️ No active boosters found');
      return { success: true, rewardedCount: 0, totalTokens: 0 };
    }
    
    console.log(`[scheduler.js]: 💎 Found ${boosters.size} active booster(s)`);
    
    const User = require('./models/UserModel');
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    let rewardedCount = 0;
    let totalTokensDistributed = 0;
    let alreadyRewardedCount = 0;
    let errorCount = 0;
    const rewardDetails = [];
    
    for (const [memberId, member] of boosters) {
      try {
        // Get or create user record
        const user = await User.getOrCreateUser(memberId);
        
        console.log(`[scheduler.js]: Processing ${member.user.tag} - Checking boost status...`);
        
        // Give boost rewards (flat 1000 tokens for anyone boosting)
        const result = await user.giveBoostRewards();
        
        if (result.success) {
          rewardedCount++;
          totalTokensDistributed += result.tokensReceived;
          rewardDetails.push({
            userId: memberId,
            username: member.user.tag,
            tokensReceived: result.tokensReceived
          });
          
          console.log(`[scheduler.js]: ✅ Rewarded ${member.user.tag} with ${result.tokensReceived} tokens for boosting`);
          
          // Send DM notification
          try {
            await member.send({
              content: `🎉 **Monthly Nitro Boost Reward!**\n\nThank you for boosting **Roots Of The Wild**!\n\n💎 You've received **${result.tokensReceived} tokens** for boosting the server this month.\n\n**New Balance:** ${result.newTokenBalance} tokens\n**Month:** ${currentMonth}\n\nYour support helps keep our server amazing! ✨`
            });
          } catch (dmError) {
            console.log(`[scheduler.js]: ⚠️ Could not send DM to ${member.user.tag} - user may have blocked DMs`);
          }
          
          // Send public announcement in boost rewards channel
          const boostAnnouncementChannelId = process.env.BOOST_ANNOUNCEMENT_CHANNEL || '651614266046152705';
          try {
            const announcementChannel = await client.channels.fetch(boostAnnouncementChannelId);
            if (announcementChannel) {
              const { EmbedBuilder } = require('discord.js');
              const announcementEmbed = new EmbedBuilder()
                .setColor('#ff73fa')
                .setTitle('💎 Nitro Boost Reward!')
                .setDescription(`Thank you for boosting **Roots Of The Wild**!`)
                .addFields(
                  { name: '🎉 Booster', value: `<@${memberId}>`, inline: false },
                  { name: '💰 Tokens Earned', value: `${result.tokensReceived} tokens`, inline: false },
                  { name: '📅 Month', value: currentMonth, inline: false }
                )
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
                .setFooter({ text: 'Boost the server to earn 1000 tokens every month!' })
                .setTimestamp();
              
              await announcementChannel.send({
                content: `<@${memberId}>`,
                embeds: [announcementEmbed]
              });
              
              console.log(`[scheduler.js]: 📢 Posted boost reward announcement for ${member.user.tag} in channel ${boostAnnouncementChannelId}`);
            }
          } catch (announcementError) {
            console.error(`[scheduler.js]: ❌ Error posting boost reward announcement for ${member.user.tag}:`, announcementError);
          }
        } else if (result.alreadyRewarded) {
          alreadyRewardedCount++;
          console.log(`[scheduler.js]: ℹ️ ${member.user.tag} already received boost rewards this month`);
        } else {
          errorCount++;
          console.error(`[scheduler.js]: ❌ Failed to reward ${member.user.tag}: ${result.message}`);
        }
        
      } catch (error) {
        errorCount++;
        console.error(`[scheduler.js]: ❌ Error processing boost reward for ${member.user.tag}:`, error);
      }
    }
    
    // Send summary to a log channel if configured
    const logChannelId = process.env.BOOST_LOG_CHANNEL || process.env.MOD_LOG_CHANNEL;
    if (logChannelId) {
      try {
        const logChannel = await client.channels.fetch(logChannelId);
        if (logChannel) {
          const { EmbedBuilder } = require('discord.js');
          const summaryEmbed = new EmbedBuilder()
            .setColor('#ff73fa')
            .setTitle('💎 Monthly Nitro Boost Rewards Distributed')
            .setDescription(`Automatic boost reward distribution completed for ${currentMonth}`)
            .addFields(
              { name: '✅ Rewarded', value: `${rewardedCount} booster(s)`, inline: true },
              { name: '💰 Total Tokens', value: `${totalTokensDistributed} tokens`, inline: true },
              { name: 'ℹ️ Already Rewarded', value: `${alreadyRewardedCount}`, inline: true },
              { name: '❌ Errors', value: `${errorCount}`, inline: true },
              { name: '📊 Total Boosters', value: `${boosters.size}`, inline: true },
              { name: '📅 Month', value: currentMonth, inline: true }
            )
            .setTimestamp();
          
          if (rewardDetails.length > 0) {
            const detailsText = rewardDetails
              .map(d => `• **${d.username}**: ${d.tokensReceived} tokens`)
              .join('\n');
            
            // Discord has a 1024 character limit per field, so split if needed
            if (detailsText.length <= 1024) {
              summaryEmbed.addFields({ name: '📋 Rewards Given', value: detailsText, inline: false });
            } else {
              summaryEmbed.addFields({ 
                name: '📋 Rewards Given', 
                value: `${rewardDetails.length} users rewarded (too many to list)`, 
                inline: false 
              });
            }
          }
          
          await logChannel.send({ embeds: [summaryEmbed] });
        }
      } catch (logError) {
        console.error('[scheduler.js]: ❌ Error sending boost reward summary to log channel:', logError);
      }
    }
    
    console.log(`[scheduler.js]: ✅ Boost reward distribution completed - Rewarded: ${rewardedCount}, Already Rewarded: ${alreadyRewardedCount}, Errors: ${errorCount}, Total Tokens: ${totalTokensDistributed}`);
    
    return {
      success: true,
      rewardedCount,
      alreadyRewardedCount,
      errorCount,
      totalTokens: totalTokensDistributed,
      totalBoosters: boosters.size
    };
    
  } catch (error) {
    console.error('[scheduler.js]: ❌ Error during boost reward distribution:', error);
    handleError(error, 'scheduler.js', {
      commandName: 'distributeMonthlyBoostRewards'
    });
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// ------------------- Birthday Functions -------------------
// ============================================================================

// Birthday role IDs
const BIRTHDAY_ROLE_ID = '658152196642308111';
const MOD_BIRTHDAY_ROLE_ID = '1095909468941864990';
const BIRTHDAY_ANNOUNCEMENT_CHANNEL_ID = '606004354419392513';

async function handleBirthdayRoleAssignment(client) {
  console.log(`[scheduler.js]: 🎂 Starting birthday role assignment check...`);
  
  try {
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const today = estNow.toISOString().slice(5, 10); // MM-DD format
    const month = estNow.getMonth() + 1;
    const day = estNow.getDate();
    
    console.log(`[scheduler.js]: 📅 Checking for birthdays on ${today} (EST: ${estNow.toLocaleString()})`);
    
    // Get all users with birthdays today
    const User = require('./models/UserModel');
    const usersWithBirthdays = await User.find({
      'birthday.month': month,
      'birthday.day': day
    });
    
    if (usersWithBirthdays.length === 0) {
      console.log(`[scheduler.js]: ℹ️ No users have birthdays today`);
      return;
    }
    
    console.log(`[scheduler.js]: 🎂 Found ${usersWithBirthdays.length} users with birthdays today`);
    
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      console.error(`[scheduler.js]: ❌ Guild not found`);
      return;
    }
    
    // Get the birthday roles
    const birthdayRole = guild.roles.cache.get(BIRTHDAY_ROLE_ID);
    const modBirthdayRole = guild.roles.cache.get(MOD_BIRTHDAY_ROLE_ID);
    
    if (!birthdayRole && !modBirthdayRole) {
      console.error(`[scheduler.js]: ❌ Birthday roles not found`);
      return;
    }
    
    let assignedCount = 0;
    const birthdayUsers = [];
    
    for (const user of usersWithBirthdays) {
      try {
        const member = await guild.members.fetch(user.discordId);
        if (!member) {
          console.log(`[scheduler.js]: ⚠️ Member ${user.discordId} not found in guild`);
          continue;
        }
        
        // Check if user is a mod (has mod permissions or specific mod roles)
        const isMod = member.permissions.has('ManageMessages') || 
                      member.permissions.has('Administrator') ||
                      member.roles.cache.some(role => role.name.toLowerCase().includes('mod') || role.name.toLowerCase().includes('admin'));
        
        const roleToAssign = isMod ? modBirthdayRole : birthdayRole;
        
        if (!roleToAssign) {
          console.log(`[scheduler.js]: ⚠️ Role not found for ${isMod ? 'mod' : 'regular'} user ${member.user.tag}`);
          continue;
        }
        
        // Remove any existing birthday roles first
        if (member.roles.cache.has(BIRTHDAY_ROLE_ID)) {
          await member.roles.remove(BIRTHDAY_ROLE_ID);
        }
        if (member.roles.cache.has(MOD_BIRTHDAY_ROLE_ID)) {
          await member.roles.remove(MOD_BIRTHDAY_ROLE_ID);
        }
        
        // Assign the appropriate role
        await member.roles.add(roleToAssign);
        assignedCount++;
        birthdayUsers.push({
          user: member.user,
          isMod: isMod,
          roleName: roleToAssign.name
        });
        
        console.log(`[scheduler.js]: ✅ Assigned ${roleToAssign.name} to ${member.user.tag} (${isMod ? 'mod' : 'regular'})`);
        
      } catch (error) {
        console.error(`[scheduler.js]: ❌ Error assigning birthday role to user ${user.discordId}:`, error);
      }
    }
    
    // Send birthday announcements if there are birthday users
    if (birthdayUsers.length > 0) {
      await sendBirthdayAnnouncements(client, birthdayUsers);
    }
    
    console.log(`[scheduler.js]: 🎂 Birthday role assignment completed - ${assignedCount} roles assigned`);
    
  } catch (error) {
    console.error(`[scheduler.js]: ❌ Error in birthday role assignment:`, error);
    handleError(error, "scheduler.js", {
      commandName: 'handleBirthdayRoleAssignment'
    });
  }
}

async function sendBirthdayAnnouncements(client, birthdayUsers) {
  try {
    const announcementChannel = client.channels.cache.get(BIRTHDAY_ANNOUNCEMENT_CHANNEL_ID);
    if (!announcementChannel) {
      console.error(`[scheduler.js]: ❌ Birthday announcement channel not found`);
      return;
    }
    
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const realWorldDate = estNow.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
    });
    const hyruleanDate = convertToHyruleanDate(estNow);
    
    // Create birthday messages
    const birthdayMessages = [
      "May Din's fiery blessing fill your birthday with the **Power** to overcome any challenge that comes your way!",
      "On this nameday, may Nayru's profound **Wisdom** guide you towards new heights of wisdom and understanding!",
      "As you celebrate another year, may Farore's steadfast **Courage** inspire you to embrace every opportunity with bravery and grace!",
    ];
    
    for (const birthdayUser of birthdayUsers) {
      try {
        const randomMessage = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];
        
        const embed = new EmbedBuilder()
          .setColor("#FF709B")
          .setTitle(`🎉 Happy Birthday, ${birthdayUser.user.displayName}! 🎉`)
          .setDescription(`${randomMessage}\n\n🎂 **It's ${birthdayUser.user.displayName}'s birthday today!** 🎂`)
          .addFields(
            { 
              name: "📅 Real-World Date", 
              value: realWorldDate, 
              inline: true 
            },
            { 
              name: "🗓️ Hyrulean Date", 
              value: hyruleanDate, 
              inline: true 
            },
            {
              name: "🎁 Special Birthday Features",
              value: `• **Birthday role** assigned: ${birthdayUser.roleName}\n• **Birthday rewards** available with \`/birthday claim\`\n• **1500 tokens OR 75% shop discount**`,
              inline: false
            }
          )
          .setThumbnail(birthdayUser.user.displayAvatarURL({ dynamic: true }))
          .setImage("https://storage.googleapis.com/tinglebot/Graphics/bday.png")
          .setFooter({ 
            text: `Happy Birthday, ${birthdayUser.user.displayName}! 🎂`,
            icon_url: client.user.displayAvatarURL()
          })
          .setTimestamp();
        
        // Send @everyone announcement
        await announcementChannel.send({
          content: `@everyone 🎉 **It's ${birthdayUser.user.displayName}'s birthday today!** 🎉`,
          embeds: [embed]
        });
        
        console.log(`[scheduler.js]: 🎂 Sent birthday announcement for ${birthdayUser.user.displayName}`);
        
      } catch (error) {
        console.error(`[scheduler.js]: ❌ Error sending birthday announcement for ${birthdayUser.user.displayName}:`, error);
      }
    }
    
  } catch (error) {
    console.error(`[scheduler.js]: ❌ Error in birthday announcements:`, error);
    handleError(error, "scheduler.js", {
      commandName: 'sendBirthdayAnnouncements'
    });
  }
}

async function handleBirthdayRoleRemoval(client) {
  console.log(`[scheduler.js]: 🧹 Starting birthday role cleanup...`);
  
  try {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      console.error(`[scheduler.js]: ❌ Guild not found`);
      return;
    }
    
    // Get all members with birthday roles
    const birthdayRole = guild.roles.cache.get(BIRTHDAY_ROLE_ID);
    const modBirthdayRole = guild.roles.cache.get(MOD_BIRTHDAY_ROLE_ID);
    
    let removedCount = 0;
    
    if (birthdayRole) {
      const membersWithBirthdayRole = birthdayRole.members;
      for (const [memberId, member] of membersWithBirthdayRole) {
        try {
          await member.roles.remove(birthdayRole);
          removedCount++;
          console.log(`[scheduler.js]: 🧹 Removed birthday role from ${member.user.tag}`);
        } catch (error) {
          console.error(`[scheduler.js]: ❌ Error removing birthday role from ${member.user.tag}:`, error);
        }
      }
    }
    
    if (modBirthdayRole) {
      const membersWithModBirthdayRole = modBirthdayRole.members;
      for (const [memberId, member] of membersWithModBirthdayRole) {
        try {
          await member.roles.remove(modBirthdayRole);
          removedCount++;
          console.log(`[scheduler.js]: 🧹 Removed mod birthday role from ${member.user.tag}`);
        } catch (error) {
          console.error(`[scheduler.js]: ❌ Error removing mod birthday role from ${member.user.tag}:`, error);
        }
      }
    }
    
    console.log(`[scheduler.js]: 🧹 Birthday role cleanup completed - ${removedCount} roles removed`);
    
  } catch (error) {
    console.error(`[scheduler.js]: ❌ Error in birthday role cleanup:`, error);
    handleError(error, "scheduler.js", {
      commandName: 'handleBirthdayRoleRemoval'
    });
  }
}

async function executeBirthdayAnnouncements(client) {
 console.log(`[scheduler.js]: 🎂 Starting birthday announcement check...`);
 
 const now = new Date();
 const estNow = new Date(
  now.toLocaleString("en-US", { timeZone: "America/New_York" })
 );
 const today = estNow.toISOString().slice(5, 10);
 const guildIds = [process.env.GUILD_ID];
 
 console.log(`[scheduler.js]: 📅 Checking for birthdays on ${today} (EST: ${estNow.toLocaleString()})`);

 const guildChannelMap = {
  [process.env.GUILD_ID]:
   process.env.BIRTHDAY_CHANNEL_ID || "606004354419392513",
 };

 const birthdayMessages = [
  "May Din's fiery blessing fill your birthday with the **Power** to overcome any challenge that comes your way!",
  "On this nameday, may Nayru's profound **Wisdom** guide you towards new heights of wisdom and understanding!",
  "As you celebrate another year, may Farore's steadfast **Courage** inspire you to embrace every opportunity with bravery and grace!",
 ];

 const realWorldDate = estNow.toLocaleString("en-US", {
  month: "long",
  day: "numeric",
 });
 const hyruleanDate = convertToHyruleanDate(estNow);

 let announcedCount = 0;

 for (const guildId of guildIds) {
  const birthdayChannelId = guildChannelMap[guildId];
  console.log(`[scheduler.js]: 🏰 Guild ID: ${guildId}, Birthday Channel ID: ${birthdayChannelId}`);
  
  if (!birthdayChannelId) {
   console.log(`[scheduler.js]: ❌ No birthday channel ID found for guild ${guildId}`);
   continue;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
   console.log(`[scheduler.js]: ❌ Guild ${guildId} not found in cache`);
   continue;
  }

  const announcementChannel = guild.channels.cache.get(birthdayChannelId);
  if (!announcementChannel) {
   console.log(`[scheduler.js]: ❌ Birthday channel ${birthdayChannelId} not found in guild ${guildId}`);
   continue;
  }

  console.log(`[scheduler.js]: ✅ Found birthday channel: ${announcementChannel.name} (${birthdayChannelId})`);
  
  const characters = await Character.find({ birthday: today });
  console.log(`[scheduler.js]: 👥 Found ${characters.length} characters with birthday on ${today}`);
  
  // Also check for mod characters with birthdays
  const ModCharacter = require('./models/ModCharacterModel');
  const modCharacters = await ModCharacter.find({ birthday: today });
  console.log(`[scheduler.js]: 👑 Found ${modCharacters.length} mod characters with birthday on ${today}`);
  
  if (characters.length > 0) {
   console.log(`[scheduler.js]: 🎂 Characters with birthdays today:`, characters.map(c => `${c.name} (${c.birthday})`));
  } else {
   // Debug: Check if there are any characters with birthdays at all
   const allCharactersWithBirthdays = await Character.find({ birthday: { $exists: true, $ne: null } });
   console.log(`[scheduler.js]: 🔍 Total characters with birthdays: ${allCharactersWithBirthdays.length}`);
   if (allCharactersWithBirthdays.length > 0) {
    console.log(`[scheduler.js]: 📅 Sample birthday formats:`, allCharactersWithBirthdays.slice(0, 5).map(c => `${c.name}: ${c.birthday}`));
   }
  }
  
  if (modCharacters.length > 0) {
   console.log(`[scheduler.js]: 🎂 Mod characters with birthdays today:`, modCharacters.map(c => `${c.name} (${c.birthday})`));
  }

  for (const character of characters) {
   try {
    const user = await client.users.fetch(character.userId);
    const randomMessage =
     birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];

    // Give character a random birthday gift (1% chance for Spirit Orb, 99% chance for cake)
    const isLuckyRoll = Math.random() < 0.01; // 1% chance
    let giftItemName = '';
    let giftGiven = null;
    let isRareGift = false;

    if (isLuckyRoll) {
      giftItemName = 'Spirit Orb';
      isRareGift = true;
    } else {
      const cakeOptions = ['Carrot Cake', 'Monster Cake', 'Nut Cake', 'Fruit Cake'];
      giftItemName = cakeOptions[Math.floor(Math.random() * cakeOptions.length)];
    }

    try {
      // Connect to inventories database
      await connectToInventories();
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      
      // Check if the gift item exists in the ItemModel
      const giftItem = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${giftItemName}$`, 'i') } });
      
      if (giftItem) {
        const currentDate = new Date();
        const itemLocation = character.currentVillage || character.homeVillage || "Unknown";
        
        // Check if character already has this item in inventory
        const existingItem = await inventoryCollection.findOne({
          characterId: character._id,
          itemName: { $regex: new RegExp(`^${giftItemName}$`, 'i') }
        });

        if (existingItem) {
          // Increment quantity
          await inventoryCollection.updateOne(
            { _id: existingItem._id },
            { $inc: { quantity: 1 } }
          );
        } else {
          // Insert new gift item with metadata from database
          await inventoryCollection.insertOne({
            characterId: character._id,
            itemName: giftItem.itemName,
            itemId: giftItem._id,
            quantity: 1,
            category: Array.isArray(giftItem.category) ? giftItem.category.join(", ") : giftItem.category,
            type: Array.isArray(giftItem.type) ? giftItem.type.join(", ") : giftItem.type,
            subtype: Array.isArray(giftItem.subtype) ? giftItem.subtype.join(", ") : giftItem.subtype,
            location: itemLocation,
            date: currentDate,
            obtain: "Gift",
            synced: ""
          });
        }
        
        giftGiven = giftItem.itemName;
        
        if (isRareGift) {
          console.log(`[scheduler.js]: ✨🎁 RARE! ${character.name} got a ${giftItem.itemName} for their birthday! (1% chance)`);
        } else {
          console.log(`[scheduler.js]: 🎂 Gave ${character.name} a ${giftItem.itemName} for their birthday`);
        }

        // Log to Google Sheets if character has inventory URL
        if (character.inventory) {
          try {
            const spreadsheetId = extractSpreadsheetId(character.inventory);
            if (spreadsheetId) {
              const sheetRow = [
                character.name,
                giftItem.itemName,
                1, // quantity
                Array.isArray(giftItem.category) ? giftItem.category.join(", ") : giftItem.category,
                Array.isArray(giftItem.type) ? giftItem.type.join(", ") : giftItem.type,
                Array.isArray(giftItem.subtype) ? giftItem.subtype.join(", ") : giftItem.subtype,
                "Gift", // obtain
                "", // job
                "", // perk
                itemLocation,
                isRareGift ? "Birthday Gift (RARE - 1%!)" : "Birthday Gift", // link/description
                currentDate.toISOString(),
                uuidv4() // Confirmed Sync ID
              ];

              await safeAppendDataToSheet(
                character.inventory,
                character,
                'loggedInventory!A:M',
                [sheetRow],
                null,
                { skipValidation: true, context: { commandName: 'birthday', userTag: 'System', userId: character.userId } }
              );
              
              console.log(`[scheduler.js]: 📝 Logged birthday gift to ${character.name}'s inventory sheet`);
            }
          } catch (sheetError) {
            console.error(`[scheduler.js]: ⚠️ Failed to log gift to sheet for ${character.name}:`, sheetError.message);
            // Don't throw - sheet logging is not critical
          }
        }
      } else {
        console.warn(`[scheduler.js]: ⚠️ Gift item "${giftItemName}" not found in database`);
      }
    } catch (giftError) {
      console.error(`[scheduler.js]: ❌ Error giving birthday gift to ${character.name}:`, giftError.message);
    }

    const embed = new EmbedBuilder()
     .setColor("#FF709B")
     .setTitle(`Happy Birthday, ${character.name}!`)
     .setDescription(randomMessage)
     .addFields(
      { name: "Real-World Date", value: realWorldDate, inline: true },
      { name: "Hyrulean Date", value: hyruleanDate, inline: true }
     )
     .setThumbnail(character.icon)
     .setImage("https://storage.googleapis.com/tinglebot/Graphics/bday.png")
     .setFooter({ text: `${character.name} belongs to ${user.username}!` })
     .setTimestamp();

    // Add gift field if gift was successfully given
    if (giftGiven) {
      if (isRareGift) {
        embed.addFields({
          name: "✨ **RARE BIRTHDAY GIFT!** ✨",
          value: `> 🎊 **WOW!** ${character.name} received a **${giftGiven}**! (1% chance!) 🎊`,
          inline: false
        });
      } else {
        embed.addFields({
          name: "🎁 Birthday Gift",
          value: `> ${character.name} received a **${giftGiven}**!`,
          inline: false
        });
      }
    }

    await announcementChannel.send({ embeds: [embed] });
    announcedCount++;
   } catch (error) {
    handleError(error, "scheduler.js");
    console.error(
     `[scheduler.js]: Failed to announce birthday for ${character.name}: ${error.message}`
    );
   }
  }

  // Process mod character birthdays
  for (const modCharacter of modCharacters) {
   try {
    const user = await client.users.fetch(modCharacter.userId);
    const randomMessage =
     birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];

    const embed = new EmbedBuilder()
     .setColor("#FF709B")
     .setTitle(`Happy Birthday, ${modCharacter.name}!`)
     .setDescription(`${randomMessage}\n\n✨ **${modCharacter.modTitle} of ${modCharacter.modType}** ✨`)
     .addFields(
      { name: "Real-World Date", value: realWorldDate, inline: true },
      { name: "Hyrulean Date", value: hyruleanDate, inline: true },
      { name: "👑 Mod Character", value: `> **${modCharacter.modTitle} of ${modCharacter.modType}**`, inline: false }
     )
     .setThumbnail(modCharacter.icon)
     .setImage("https://storage.googleapis.com/tinglebot/Graphics/bday.png")
     .setFooter({ text: `${modCharacter.name} belongs to ${user.username}!` })
     .setTimestamp();

    await announcementChannel.send({ embeds: [embed] });
    announcedCount++;
    console.log(`[scheduler.js]: 🎂👑 Announced birthday for mod character ${modCharacter.name}`);
   } catch (error) {
    handleError(error, "scheduler.js");
    console.error(
     `[scheduler.js]: Failed to announce birthday for mod character ${modCharacter.name}: ${error.message}`
    );
   }
  }
 }

 if (announcedCount > 0) {
  console.log(`[scheduler.js]: 🎂 Announced ${announcedCount} birthdays`);
 }
}

// ============================================================================
// ------------------- Job Functions -------------------
// ============================================================================

async function handleJailRelease(client) {
 const now = new Date();
 const charactersToRelease = await Character.find({
  inJail: true,
  jailReleaseTime: { $lte: now },
 });

 if (charactersToRelease.length === 0) {
  return;
 }

 let releasedCount = 0;

 for (const character of charactersToRelease) {
  character.inJail = false;
  character.failedStealAttempts = 0;
  character.jailReleaseTime = null;
  await character.save();

  const releaseEmbed = createAnnouncementEmbed(
   "Town Hall Proclamation",
   `The town hall doors creak open and a voice rings out:\n\n> **${character.name}** has served their time and is hereby released from jail.\n\nMay you walk the path of virtue henceforth.`,
   character.icon,
   "https://storage.googleapis.com/tinglebot/Graphics/border.png",
   "Town Hall Records • Reformed & Released"
  );

  // Post announcement in character's current village town hall channel
  try {
   const villageChannelId = getVillageChannelId(character.currentVillage);
   const villageChannel = await client.channels.fetch(villageChannelId);
   
   if (villageChannel) {
    await villageChannel.send({
     content: `<@${character.userId}>, your character **${character.name}** has been released from jail.`,
     embeds: [releaseEmbed],
    });
    releasedCount++;
    console.log(`[scheduler.js]: 🔓 Posted jail release for ${character.name} in ${character.currentVillage} town hall`);
   } else {
    console.error(`[scheduler.js]: ❌ Could not find town hall channel for ${character.currentVillage} (ID: ${villageChannelId})`);
   }
  } catch (error) {
   console.error(`[scheduler.js]: ❌ Error posting jail release for ${character.name} in ${character.currentVillage}:`, error.message);
  }

  const dmSent = await sendUserDM(
   character.userId,
   `**Town Hall Notice**\n\nYour character **${character.name}** has been released from jail. Remember, a fresh start awaits you!`,
   client
  );
  
  if (!dmSent) {
    console.log(`[scheduler.js]: ℹ️ Could not send jail release DM to user ${character.userId} for ${character.name} - user may have blocked DMs`);
  }
 }

 if (releasedCount > 0) {
  console.log(`[scheduler.js]: 🔓 Released ${releasedCount} characters from jail`);
 }
}

async function handleDebuffExpiry(client) {
  const now = new Date();
  // Get current time in EST
  const estDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  // Create midnight EST in UTC (5 AM UTC = midnight EST)
  const midnightEST = new Date(Date.UTC(estDate.getFullYear(), estDate.getMonth(), estDate.getDate(), 5, 0, 0, 0));
  
  const charactersWithActiveDebuffs = await Character.find({
    "debuff.active": true,
    "debuff.endDate": { $lte: midnightEST },
  });

  if (charactersWithActiveDebuffs.length > 0) {
    console.log(`[scheduler.js]: 🧹 Expiring debuffs for ${charactersWithActiveDebuffs.length} characters`);
    
    for (const character of charactersWithActiveDebuffs) {
      character.debuff.active = false;
      character.debuff.endDate = null;
      await character.save();

      const dmSent = await sendUserDM(
        character.userId,
        `Your character **${character.name}**'s week-long debuff has ended! You can now heal them with items or a Healer.`,
        client
      );
      
      if (!dmSent) {
        console.log(`[scheduler.js]: ℹ️ Could not send debuff expiry DM to user ${character.userId} for ${character.name} - user may have blocked DMs`);
      }
    }
  }
}

async function handleBuffExpiry(client) {
  const now = new Date();
  // Get current time in EST
  const estDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  // Create midnight EST in UTC (5 AM UTC = midnight EST)
  const midnightEST = new Date(Date.UTC(estDate.getFullYear(), estDate.getMonth(), estDate.getDate(), 5, 0, 0, 0));
  
  const charactersWithActiveBuffs = await Character.find({
    "buff.active": true,
    "buff.endDate": { $lte: midnightEST },
  });

  if (charactersWithActiveBuffs.length > 0) {
    console.log(`[scheduler.js]: 🧹 Expiring buffs for ${charactersWithActiveBuffs.length} characters`);
    
    for (const character of charactersWithActiveBuffs) {
      character.buff.active = false;
      character.buff.endDate = null;
      await character.save();

      const dmSent = await sendUserDM(
        character.userId,
        `Your character **${character.name}**'s buff has ended! You can now heal them with items or a Healer.`,
        client
      );
      
      if (!dmSent) {
        console.log(`[scheduler.js]: ℹ️ Could not send buff expiry DM to user ${character.userId} for ${character.name} - user may have blocked DMs`);
      }
    }
  }
}

async function resetDailyRolls(client) {
 try {
  const characters = await Character.find({});
  let resetCount = 0;

  for (const character of characters) {
   if (character.dailyRoll && character.dailyRoll.size > 0) {
    character.dailyRoll = new Map();
    character.markModified("dailyRoll");
    await character.save();
    resetCount++;
   }
  }

  if (resetCount > 0) {
   console.log(`[scheduler.js]: 🔄 Reset daily rolls for ${resetCount} characters`);
  }
 } catch (error) {
  handleError(error, "scheduler.js");
  console.error(
   `[scheduler.js]: Failed to reset daily rolls: ${error.message}`
  );
 }
}

async function resetPetLastRollDates(client) {
 try {
  const result = await Pet.updateMany(
   { status: "active" },
   { $set: { lastRollDate: null } }
  );
  if (result.modifiedCount > 0) {
   console.log(
    `[scheduler.js]: 🐾 Reset lastRollDate for ${result.modifiedCount} pets`
   );
  }
 } catch (error) {
  handleError(error, "scheduler.js");
  console.error(
   `[scheduler.js]: Failed to reset pet lastRollDates: ${error.message}`
  );
 }
}

// ============================================================================
// ------------------- Blight Functions -------------------
// ============================================================================

function setupBlightScheduler(client) {
 createCronJob("0 20 * * *", "Blight Roll Call", async () => {
  try {
   await postBlightRollCall(client);
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: Blight roll call failed:", error.message);
  }
 });

 createCronJob("0 20 * * *", "Check Missed Rolls", () =>
  checkMissedRolls(client)
 );

 createCronJob(
  "0 0 * * *",
  "Cleanup Expired Blight Requests",
  async () => {
    try {
      console.log('[scheduler.js]: 🧹 Starting blight request cleanup');
      const result = await cleanupExpiredBlightRequests(client);
      console.log(`[scheduler.js]: ✅ Blight cleanup complete - Expired: ${result.expiredCount}, Notified: ${result.notifiedUsers}, Deleted: ${result.deletedCount}`);
    } catch (error) {
      handleError(error, 'scheduler.js');
      console.error('[scheduler.js]: ❌ Error during blight cleanup:', error);
    }
  }
 );

 createCronJob(
  "0 */12 * * *",
  "Check Expiring Blight Requests",
  async () => {
    try {
      console.log('[scheduler.js]: ⚠️ Running blight expiration warning check');
      const result = await checkExpiringBlightRequests(client);
      console.log(`[scheduler.js]: ✅ Blight warning check complete - Warned: ${result.warnedUsers}`);
    } catch (error) {
      handleError(error, 'scheduler.js');
      console.error('[scheduler.js]: ❌ Error during blight warning check:', error);
    }
  }
 );

 createCronJob(
  "0 */4 * * *",
  "Send Blight Reminders",
  async () => {
    try {
      console.log('[scheduler.js]: 📢 Running comprehensive blight reminder check');
      const result = await sendBlightReminders(client);
      console.log(`[scheduler.js]: ✅ Blight reminder check complete - Death: ${result.deathWarnings}, Healing: ${result.healingWarnings}`);
    } catch (error) {
      handleError(error, 'scheduler.js');
      console.error('[scheduler.js]: ❌ Error during blight reminder check:', error);
    }
  }
 );
}

// ============================================================================
// ------------------- Boosting Functions -------------------
// ============================================================================

async function setupBoostingScheduler(client) {
 createCronJob("0 0 * * *", "Boost Cleanup", async () => {
  try {
   console.log("[scheduler.js]: 🧹 Starting boost cleanup");
   
   // Clean up old file-based boosting requests
   const stats = cleanupExpiredBoostingRequests();
   
   // Clean up TempData boosting requests
   const TempData = require('./models/TempDataModel');
   const tempDataResult = await TempData.cleanupByType('boosting');
   
   console.log(
    `[scheduler.js]: ✅ Boost cleanup complete - Expired requests: ${stats.expiredRequests}, Expired boosts: ${stats.expiredBoosts}, TempData boosting deleted: ${tempDataResult.deletedCount || 0}`
   );
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error during boost cleanup:", error);
  }
 });

 createCronJob("0 2 * * 0", "Weekly Boost Archive", async () => {
  try {
   console.log("[scheduler.js]: 📦 Running weekly boost archive");
   const stats = archiveOldBoostingRequests(30);
   console.log(
    `[scheduler.js]: ✅ Archive complete - Archived: ${stats.archived}, Remaining: ${stats.remaining}`
   );
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error during weekly archive:", error);
  }
 });

 createCronJob("0 0 * * *", "Daily Boost Statistics", async () => {
  try {
   const stats = getBoostingStatistics();
   console.log("[scheduler.js]: 📊 Daily boost statistics:", stats);
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error getting boost statistics:", error);
  }
 });

 // Additional cleanup every 6 hours for TempData boosting requests
 createCronJob("0 */6 * * *", "TempData Boost Cleanup", async () => {
  try {
   console.log("[scheduler.js]: 🧹 Starting TempData boost cleanup");
   const TempData = require('./models/TempDataModel');
   const result = await TempData.cleanupByType('boosting');
   console.log(`[scheduler.js]: ✅ TempData boost cleanup complete - Deleted: ${result.deletedCount || 0}`);
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error during TempData boost cleanup:", error);
  }
 });

 // Hourly cleanup for boosting data to ensure expired boosts are removed quickly
 createCronJob("0 * * * *", "Hourly Boost Cleanup", async () => {
  try {
   console.log("[scheduler.js]: 🧹 Starting hourly boost cleanup");
   const TempData = require('./models/TempDataModel');
   const result = await TempData.cleanupByType('boosting');
   if (result.deletedCount > 0) {
     console.log(`[scheduler.js]: ✅ Hourly boost cleanup complete - Deleted: ${result.deletedCount}`);
   }
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error during hourly boost cleanup:", error);
  }
 });
}

// ============================================================================
// ------------------- Weather Scheduler -------------------
// ============================================================================

function setupWeatherScheduler(client) {
 // Primary weather update at 8:00am EST (1:00pm UTC during EST, 12:00pm UTC during EDT)
 createCronJob("0 8 * * *", "Daily Weather Update", () =>
  postWeatherUpdate(client),
  "America/New_York"
 );
 
 // Backup weather check at 8:15am EST to ensure weather was posted
 createCronJob("15 8 * * *", "Backup Weather Check", () =>
  checkAndPostWeatherIfNeeded(client),
  "America/New_York"
 );
}

// ============================================================================
// ------------------- Help Wanted Functions -------------------
// ============================================================================

// ------------------- Quest Generation Functions ------------------

async function checkAndGenerateDailyQuests() {
  try {
    const todaysQuests = await require('./modules/helpWantedModule').getTodaysQuests();
    
    if (todaysQuests.length === 0) {
      console.log('[scheduler.js]: 📝 Generating new daily quests...');
      await generateDailyQuests();
      console.log('[scheduler.js]: ✅ Daily quests generated');
    }
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkAndGenerateDailyQuests'
    });
    console.error('[scheduler.js]: ❌ Error checking/generating daily quests:', error);
  }
}

async function generateDailyQuestsAtMidnight() {
  try {
    console.log('[scheduler.js]: 🌙 Midnight quest generation starting...');
    await generateDailyQuests();
    console.log('[scheduler.js]: ✅ Midnight quest generation completed');
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'generateDailyQuestsAtMidnight'
    });
    console.error('[scheduler.js]: ❌ Error during midnight quest generation:', error);
  }
}

async function handleQuestExpirationAtMidnight(client = null) {
  try {
    console.log('[scheduler.js]: ⏰ Midnight quest expiration check starting...');
    
    const { updateQuestEmbed } = require('./modules/helpWantedModule');
    
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    
    const expiredQuests = await HelpWantedQuest.find({
      date: yesterdayDate,
      completed: false,
      messageId: { $ne: null }
    });
    
    if (expiredQuests.length === 0) {
      console.log('[scheduler.js]: ✅ No quests to expire from yesterday');
      return;
    }
    
    console.log(`[scheduler.js]: 📋 Found ${expiredQuests.length} quests to mark as expired`);
    
    let updatedCount = 0;
    for (const quest of expiredQuests) {
      try {
        await updateQuestEmbed(client, quest);
        updatedCount++;
        console.log(`[scheduler.js]: ✅ Updated expired quest embed for ${quest.village} (${quest.questId})`);
      } catch (error) {
        console.error(`[scheduler.js]: ❌ Failed to update expired quest embed for ${quest.questId}:`, error);
      }
    }
    
    console.log(`[scheduler.js]: ✅ Quest expiration completed - ${updatedCount}/${expiredQuests.length} quests updated`);
    
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'handleQuestExpirationAtMidnight'
    });
    console.error('[scheduler.js]: ❌ Error during quest expiration check:', error);
  }
}

// ============================================================================
// ------------------- Function: checkQuestCompletions -------------------
// Checks all active quests for completion using unified system
// ============================================================================
async function checkQuestCompletions(client) {
  try {
    console.log('[scheduler.js]: 🔍 Checking quest completions...');
    
    const Quest = require('./models/QuestModel');
    const questRewardModule = require('./modules/questRewardModule');
    
    const activeQuests = await Quest.find({ status: 'active' });
    
    if (activeQuests.length === 0) {
      console.log('[scheduler.js]: ✅ No active quests to check');
      return;
    }
    
    console.log(`[scheduler.js]: 📋 Found ${activeQuests.length} active quests to check`);
    
    let completedCount = 0;
    let processedCount = 0;
    
    for (const quest of activeQuests) {
      try {
        const completionResult = await quest.checkAutoCompletion(true); // Force check for scheduler
        
        if (completionResult.completed && completionResult.needsRewardProcessing) {
          completedCount++;
          console.log(`[scheduler.js]: ✅ Quest "${quest.title}" completed: ${completionResult.reason}`);
          
          // Distribute rewards if quest was completed
          if (completionResult.reason === 'all_participants_completed' || completionResult.reason === 'time_expired') {
            await questRewardModule.processQuestCompletion(quest.questID);
            
            // Mark completion as processed to prevent duplicates
            await quest.markCompletionProcessed();
          }
        } else if (completionResult.completed) {
          console.log(`[scheduler.js]: ℹ️ Quest "${quest.title}" already processed: ${completionResult.reason}`);
        }
        
        processedCount++;
      } catch (error) {
        console.error(`[scheduler.js]: ❌ Error checking quest ${quest.questID}:`, error);
      }
    }
    
    console.log(`[scheduler.js]: ✅ Quest completion check finished - ${completedCount} completed, ${processedCount} processed`);
    
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkQuestCompletions'
    });
    console.error('[scheduler.js]: ❌ Error during quest completion check:', error);
  }
}

// ============================================================================
// ------------------- Function: checkVillageTracking -------------------
// Checks village locations for all active RP quest participants
// ============================================================================
async function checkVillageTracking(client) {
  try {
    console.log('[scheduler.js]: 🏘️ Starting village tracking check...');
    
    const Quest = require('./models/QuestModel');
    
    // Find all active RP quests
    const activeRPQuests = await Quest.find({ 
      status: 'active', 
      questType: 'RP',
      requiredVillage: { $exists: true, $ne: null }
    });
    
    if (activeRPQuests.length === 0) {
      console.log('[scheduler.js]: ✅ No active RP quests with village requirements to check');
      return;
    }
    
    console.log(`[scheduler.js]: 📋 Found ${activeRPQuests.length} active RP quests with village requirements`);
    
    let totalChecked = 0;
    let totalDisqualified = 0;
    
    for (const quest of activeRPQuests) {
      try {
        console.log(`[scheduler.js]: 🏘️ Checking village locations for quest "${quest.title}" (${quest.questID})`);
        
        const villageCheckResult = await quest.checkAllParticipantsVillages();
        totalChecked += villageCheckResult.checked;
        totalDisqualified += villageCheckResult.disqualified;
        
        if (villageCheckResult.disqualified > 0) {
          console.log(`[scheduler.js]: ⚠️ Disqualified ${villageCheckResult.disqualified} participants from quest "${quest.title}" for village violations`);
          
          // Check if quest should be completed after disqualifications
          const completionResult = await quest.checkAutoCompletion(true);
          if (completionResult.completed && completionResult.needsRewardProcessing) {
            console.log(`[scheduler.js]: ✅ Quest "${quest.title}" completed after village disqualifications: ${completionResult.reason}`);
            
            // Distribute rewards if quest was completed
            const questRewardModule = require('./modules/questRewardModule');
            await questRewardModule.processQuestCompletion(quest.questID);
            await quest.markCompletionProcessed();
          }
        }
        
        // Save quest after village checks
        await quest.save();
        
      } catch (error) {
        console.error(`[scheduler.js]: ❌ Error checking village locations for quest ${quest.questID}:`, error);
      }
    }
    
    console.log(`[scheduler.js]: ✅ Village tracking check completed - ${totalChecked} participants checked, ${totalDisqualified} disqualified`);
    
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkVillageTracking'
    });
    console.error('[scheduler.js]: ❌ Error during village tracking check:', error);
  }
}

// ------------------- Quest Posting Helper Functions ------------------

async function handleEscortQuestWeather(quest) {
  if (quest.type === 'escort') {
    const travelBlocked = await isTravelBlockedByWeather(quest.village);
    if (travelBlocked) {
      console.log(`[scheduler.js]: 🌤️ Regenerating escort quest ${quest.questId} for ${quest.village} due to travel-blocking weather`);
      try {
        await regenerateEscortQuest(quest);
        console.log(`[scheduler.js]: ✅ Successfully regenerated quest ${quest.questId} as ${quest.type} quest`);
        return true;
      } catch (error) {
        console.error(`[scheduler.js]: ❌ Failed to regenerate escort quest ${quest.questId}:`, error);
        return false;
      }
    }
  }
  return true;
}

async function postQuestToChannel(client, quest, context = '') {
  try {
    const embedsByVillage = await formatSpecificQuestsAsEmbedsByVillage([quest]);
    const embed = embedsByVillage[quest.village];
    
    if (!embed) return false;
    
    const villageChannelId = getVillageChannelId(quest.village);
    const channel = await client.channels.fetch(villageChannelId);
    
    if (!channel) {
      console.log(`[scheduler.js]: ❌ Could not fetch channel for ${quest.village} (ID: ${villageChannelId})`);
      return false;
    }
    
    const message = await channel.send({ embeds: [embed] });
    const updatedQuest = await HelpWantedQuest.findOneAndUpdate(
      { _id: quest._id, messageId: null },
      { 
        messageId: message.id,
        channelId: channel.id
      },
      { new: true }
    );
    
    if (updatedQuest) {
      console.log(`[scheduler.js]: ✅ Posted quest ${quest.questId} for ${quest.village}${context}`);
      return true;
    } else {
      console.log(`[scheduler.js]: ℹ️ Quest ${quest.questId} was already posted by another process, skipping`);
      return false;
    }
  } catch (error) {
    console.error(`[scheduler.js]: ❌ Error posting quest ${quest.questId}:`, error);
    return false;
  }
}

// ------------------- Quest Posting Functions ------------------

async function checkAndPostMissedQuests(client) {
  try {
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = estTime.getHours();
    const currentMinute = estTime.getMinutes();
    
    // Check if it's after 12pm EST - if so, don't post art/writing quests
    const isAfterNoon = currentHour >= 12;
    
    const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    const unpostedQuests = await HelpWantedQuest.find({
      date: today,
      messageId: null
    });
    
    if (!unpostedQuests.length) {
      console.log(`[scheduler.js]: ℹ️ No missed quests to post during startup`);
      return 0;
    }
    
    // Regenerate art and writing quests if it's after 12pm EST
    let processedQuests = unpostedQuests;
    if (isAfterNoon) {
      const artWritingQuests = unpostedQuests.filter(quest => quest.type === 'art' || quest.type === 'writing');
      if (artWritingQuests.length > 0) {
        console.log(`[scheduler.js]: ⏰ After 12pm EST (${currentHour}:00) - Regenerating ${artWritingQuests.length} art/writing quest(s) to ensure adequate completion time`);
        
        // Regenerate each art/writing quest
        for (const quest of artWritingQuests) {
          try {
            await regenerateArtWritingQuest(quest);
            console.log(`[scheduler.js]: ✅ Regenerated ${quest.type} quest ${quest.questId} for ${quest.village}`);
          } catch (error) {
            console.error(`[scheduler.js]: ❌ Failed to regenerate quest ${quest.questId}:`, error);
          }
        }
      }
    }
    
    if (!processedQuests.length) {
      console.log(`[scheduler.js]: ℹ️ No missed quests to post during startup`);
      return 0;
    }
    
    const shuffledQuests = processedQuests.sort(() => Math.random() - 0.5);
    let posted = 0;
    
    for (const quest of shuffledQuests) {
      const scheduledTime = quest.scheduledPostTime;
      if (!scheduledTime) continue;
      
      const parts = scheduledTime.split(' ');
      if (parts.length !== 5) continue;
      
      const scheduledMinute = parseInt(parts[0]);
      const scheduledHour = parseInt(parts[1]);
      const scheduledTimeInMinutes = scheduledHour * 60 + scheduledMinute;
      const currentTimeInMinutes = currentHour * 60 + currentMinute;
      
      if (currentTimeInMinutes >= scheduledTimeInMinutes) {
        const weatherHandled = await handleEscortQuestWeather(quest);
        if (!weatherHandled) continue;
        
        const context = ` in ${quest.village} town hall (was scheduled for ${scheduledHour}:${scheduledMinute.toString().padStart(2, '0')})`;
        const success = await postQuestToChannel(client, quest, context);
        if (success) posted++;
      }
    }
    
    if (posted > 0) {
      console.log(`[scheduler.js]: 📤 Posted ${posted} missed quests during startup`);
    }
    
    return posted;
  } catch (error) {
    handleError(error, 'scheduler.js', { commandName: 'checkAndPostMissedQuests' });
    console.error('[scheduler.js]: ❌ Error checking for missed quests:', error);
    return 0;
  }
}

async function checkAndPostScheduledQuests(client, cronTime) {
  try {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    
    // Check if it's after 12pm EST - if so, don't post art/writing quests
    const estHour = parseInt(now.toLocaleString('en-US', {timeZone: 'America/New_York', hour: 'numeric', hour12: false}));
    const isAfterNoon = estHour >= 12;
    
    const questsToPost = await HelpWantedQuest.find({
      date: today,
      scheduledPostTime: cronTime,
      messageId: null
    });
    
    if (!questsToPost.length) {
      console.log(`[scheduler.js]: ℹ️ No quests scheduled for ${cronTime} on ${today}`);
      return 0;
    }
    
    // Regenerate art and writing quests if it's after 12pm EST
    let processedQuests = questsToPost;
    if (isAfterNoon) {
      const artWritingQuests = questsToPost.filter(quest => quest.type === 'art' || quest.type === 'writing');
      if (artWritingQuests.length > 0) {
        console.log(`[scheduler.js]: ⏰ After 12pm EST (${estHour}:00) - Regenerating ${artWritingQuests.length} art/writing quest(s) to ensure adequate completion time`);
        
        // Regenerate each art/writing quest
        for (const quest of artWritingQuests) {
          try {
            await regenerateArtWritingQuest(quest);
            console.log(`[scheduler.js]: ✅ Regenerated ${quest.type} quest ${quest.questId} for ${quest.village}`);
          } catch (error) {
            console.error(`[scheduler.js]: ❌ Failed to regenerate quest ${quest.questId}:`, error);
          }
        }
      }
    }
    
    if (!processedQuests.length) {
      console.log(`[scheduler.js]: ℹ️ No quests to post for ${cronTime} on ${today}`);
      return 0;
    }
    
    const shuffledQuests = processedQuests.sort(() => Math.random() - 0.5);
    let posted = 0;
    
    for (const quest of shuffledQuests) {
      const weatherHandled = await handleEscortQuestWeather(quest);
      if (!weatherHandled) continue;
      
      const parts = cronTime.split(' ');
      const scheduledMinute = parseInt(parts[0]);
      const scheduledHour = parseInt(parts[1]);
      const context = ` in ${quest.village} town hall at ${scheduledHour}:${scheduledMinute.toString().padStart(2, '0')} (scheduled time: ${cronTime})`;
      
      const success = await postQuestToChannel(client, quest, context);
      if (success) posted++;
    }
    
    if (posted > 0) {
      console.log(`[scheduler.js]: 📤 Posted ${posted} scheduled quests for ${cronTime}`);
    }
    
    return posted;
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkAndPostScheduledQuests',
      scheduledTime: cronTime
    });
    console.error('[scheduler.js]: ❌ Error checking and posting scheduled quests:', error);
    return 0;
  }
}

function setupHelpWantedFixedScheduler(client) {
  const { FIXED_CRON_TIMES } = require('./modules/helpWantedModule');
  
  // Schedule all 24 time slots for full 24-hour coverage
  // The variable buffer (3-6 hours) is handled in the quest generation logic
  FIXED_CRON_TIMES.forEach(cronTime => {
    createCronJob(
      cronTime,
      `Help Wanted Board Check - ${cronTime}`,
      () => checkAndPostScheduledQuests(client, cronTime),
      'America/New_York'
    );
  });
  
  console.log(`[scheduler.js]: ✅ Help Wanted scheduler configured with ${FIXED_CRON_TIMES.length} time slots (full 24-hour coverage with variable 3-6 hour buffer in quest generation)`);
}

// ============================================================================
// ------------------- Blood Moon Functions -------------------
// ============================================================================

// ------------------- Blood Moon Helper Functions ------------------

async function sendBloodMoonAnnouncementsToChannels(client, message) {
 const channels = BLOOD_MOON_CHANNELS.filter(channelId => channelId);
 let successCount = 0;

 for (const channelId of channels) {
  try {
   await sendBloodMoonAnnouncement(client, channelId, message);
   successCount++;
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error(`[scheduler.js]: ❌ Blood Moon announcement failed for channel ${channelId}: ${error.message}`);
  }
 }

 return successCount;
}

// ------------------- Main Blood Moon Functions ------------------

async function handleBloodMoonStart(client) {
  console.log(`[scheduler.js]: 🌕 Starting Blood Moon start check at 8 PM EST`);

  // Check if today is specifically the day BEFORE a Blood Moon (not the actual day or day after)
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const today = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
  
  let isDayBeforeBloodMoon = false;
  
  for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const bloodMoonDate = new Date(today.getFullYear(), month - 1, day);
    const dayBefore = new Date(bloodMoonDate);
    dayBefore.setDate(bloodMoonDate.getDate() - 1);
    
    if (today.getTime() === dayBefore.getTime()) {
      isDayBeforeBloodMoon = true;
      console.log(`[scheduler.js]: 📅 Today is the day before Blood Moon (${bloodMoonDate.toDateString()})`);
      break;
    }
  }
  
  if (isDayBeforeBloodMoon) {
   console.log(`[scheduler.js]: 🌕 Sending Blood Moon rising announcement - processing channels`);
   await renameChannels(client);

   const successCount = await sendBloodMoonAnnouncementsToChannels(
    client, 
    "The Blood Moon rises at nightfall! Beware!"
   );
   
   console.log(`[scheduler.js]: ✅ Blood Moon start announcements sent to ${successCount}/${BLOOD_MOON_CHANNELS.length} channels`);
  } else {
   console.log(`[scheduler.js]: 📅 Not the day before Blood Moon - no announcement needed`);
  }

  console.log(`[scheduler.js]: ✅ Blood Moon start check completed`);
}

async function handleBloodMoonEnd(client) {
  console.log(`[scheduler.js]: 🌙 Starting Blood Moon end check at 8 AM EST`);

  const wasBloodMoonYesterday = checkBloodMoonTransition();
  
  if (wasBloodMoonYesterday && !isBloodMoonDay()) {
   console.log(`[scheduler.js]: 🌙 Blood Moon has ended - transitioning from Blood Moon period`);
   await revertChannelNames(client);

   const successCount = await sendBloodMoonEndAnnouncementsToChannels(client);
   console.log(`[scheduler.js]: ✅ Blood Moon end announcements sent to ${successCount}/${BLOOD_MOON_CHANNELS.length} channels`);
  } else {
   console.log(`[scheduler.js]: 📅 No Blood Moon transition detected - no end announcement needed`);
  }

  console.log(`[scheduler.js]: ✅ Blood Moon end check completed`);
}

// ------------------- Blood Moon Transition Helper ------------------

function checkBloodMoonTransition() {
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const today = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  
  if (!bloodmoonDates || !Array.isArray(bloodmoonDates)) {
    return false;
  }
  
  for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const currentYearBloodMoonDate = new Date(today.getFullYear(), month - 1, day);
    const dayBefore = new Date(currentYearBloodMoonDate);
    dayBefore.setDate(currentYearBloodMoonDate.getDate() - 1);
    const dayAfter = new Date(currentYearBloodMoonDate);
    dayAfter.setDate(currentYearBloodMoonDate.getDate() + 1);
    
    if (yesterday >= dayBefore && yesterday <= dayAfter) {
      const yesterdayHour = 23; // Assume 8 AM check means yesterday ended at 8 AM
      let wasActiveYesterday = false;
      
      if (yesterday.getTime() === dayBefore.getTime()) {
        wasActiveYesterday = yesterdayHour >= 20; // 8 PM or later
      } else if (yesterday.getTime() === currentYearBloodMoonDate.getTime()) {
        wasActiveYesterday = true; // Full day active
      } else if (yesterday.getTime() === dayAfter.getTime()) {
        wasActiveYesterday = yesterdayHour < 8; // Before 8 AM
      }
      
      if (wasActiveYesterday) {
        return true;
      }
    }
  }
  
  return false;
}

async function sendBloodMoonEndAnnouncementsToChannels(client) {
  const channels = BLOOD_MOON_CHANNELS.filter(channelId => channelId);
  let successCount = 0;

  for (const channelId of channels) {
   try {
    await sendBloodMoonEndAnnouncement(client, channelId);
    successCount++;
   } catch (error) {
    handleError(error, "scheduler.js");
    console.error(`[scheduler.js]: ❌ Blood Moon end announcement failed for channel ${channelId}: ${error.message}`);
   }
  }

  return successCount;
}

// ============================================================================
// ------------------- Scheduler Initialization -------------------
// ============================================================================

// ------------------- Startup Functions ------------------

async function checkAndDistributeMonthlyBoostRewards(client) {
  try {
    console.log('[scheduler.js]: 💎 Checking if monthly boost rewards need to be distributed...');
    
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentDay = now.getDate();
    
    // Only auto-distribute if we're past the 1st of the month
    if (currentDay === 1) {
      console.log('[scheduler.js]: ℹ️ Today is the 1st - scheduled job will handle distribution');
      return;
    }
    
    // Check if any users have already received rewards this month
    const User = require('./models/UserModel');
    const sampleUsers = await User.find({ 
      'boostRewards.lastRewardMonth': currentMonth 
    }).limit(1);
    
    if (sampleUsers.length > 0) {
      console.log(`[scheduler.js]: ℹ️ Boost rewards already distributed for ${currentMonth}`);
      return;
    }
    
    // No rewards distributed yet this month - run distribution
    console.log(`[scheduler.js]: 💎 No rewards found for ${currentMonth} - running distribution now...`);
    const result = await distributeMonthlyBoostRewards(client);
    
    if (result.success) {
      console.log(`[scheduler.js]: ✅ Startup boost reward distribution completed - Rewarded: ${result.rewardedCount}, Total Tokens: ${result.totalTokens}`);
    } else {
      console.error(`[scheduler.js]: ❌ Startup boost reward distribution failed:`, result.error);
    }
    
  } catch (error) {
    console.error('[scheduler.js]: ❌ Error checking/distributing monthly boost rewards:', error);
    handleError(error, 'scheduler.js', {
      commandName: 'checkAndDistributeMonthlyBoostRewards'
    });
  }
}

async function runStartupChecks(client) {
 try {
  console.log(`[scheduler.js]: 🚀 Running startup checks...`);
  
  // Raid expiration check (critical - do this first in case bot restarted during a raid)
  console.log(`[scheduler.js]: 🐉 Checking for expired raids...`);
  await cleanupExpiredRaids(client);
  
  // Blood Moon startup check
  const isBloodMoonActive = isBloodMoonDay();
  if (isBloodMoonActive) {
   await renameChannels(client);
   const successCount = await sendBloodMoonAnnouncementsToChannels(
    client, 
    "The Blood Moon is upon us! Beware!"
   );
   console.log(`[scheduler.js]: 🌕 Blood Moon startup announcements sent to ${successCount}/${BLOOD_MOON_CHANNELS.length} channels`);
  } else {
   await revertChannelNames(client);
  }

  // Check and distribute monthly boost rewards if not done yet this month
  await checkAndDistributeMonthlyBoostRewards(client);

  // Character and quest startup tasks
  await Promise.all([
   handleDebuffExpiry(client),
   handleBuffExpiry(client),
   checkAndGenerateDailyQuests(),
   checkAndPostMissedQuests(client),
   handleQuestExpirationAtMidnight(client)
  ]);

  console.log(`[scheduler.js]: ✅ Startup completed`);
 } catch (error) {
  handleError(error, "scheduler.js");
  console.error(`[scheduler.js]: ❌ Startup checks failed: ${error.message}`);
 }
}

// ------------------- Scheduler Setup Functions ------------------

function setupDailyTasks(client) {
 // Daily tasks at midnight
 createCronJob("0 0 * * *", "jail release check", () => handleJailRelease(client));
 createCronJob("0 0 * * *", "reset pet last roll dates", () => resetPetLastRollDates(client));
 createCronJob("0 0 * * *", "birthday role assignment", () => handleBirthdayRoleAssignment(client));
 createCronJob("0 0 * * *", "birthday announcements", () => executeBirthdayAnnouncements(client));
 createCronJob("0 0 * * *", "midnight quest generation", () => generateDailyQuestsAtMidnight());
 createCronJob("0 0 * * *", "quest expiration check", () => handleQuestExpirationAtMidnight(client));
 createCronJob("0 0 * * *", "request expiration and cleanup", () => runDailyCleanupTasks(client));
 
 // Daily tasks at 1 AM - remove birthday roles from previous day
 createCronJob("0 1 * * *", "birthday role cleanup", () => handleBirthdayRoleRemoval(client));

 // Daily tasks at 8 AM
 createCronJob("0 8 * * *", "reset daily rolls", () => resetDailyRolls(client));
 createCronJob("0 8 * * *", "daily stamina recovery", () => recoverDailyStamina(client));

 // Daily tasks at 5 AM
 createCronJob("0 5 * * *", "debuff expiry check", () => handleDebuffExpiry(client));
 createCronJob("0 5 * * *", "buff expiry check", () => handleBuffExpiry(client));
 createCronJob("0 5 * * *", "reset global steal protections", () => {
  console.log(`[scheduler.js]: 🛡️ Starting global steal protection reset`);
  try {
   const { resetAllStealProtections } = require('./commands/jobs/steal.js');
   resetAllStealProtections();
   console.log(`[scheduler.js]: ✅ Global steal protections reset completed`);
  } catch (error) {
   console.error(`[scheduler.js]: ❌ Error resetting global steal protections:`, error);
  }
 }, "America/New_York");

 // Weekly tasks
 createCronJob("0 0 * * 0", "weekly pet rolls reset", () => resetPetRollsForAllCharacters(client));

 // Monthly tasks
 createCronJob("0 0 1 * *", "monthly vending stock generation", () => generateVendingStockList(client));
 createCronJob("0 0 1 * *", "monthly nitro boost rewards", async () => {
  try {
   console.log('[scheduler.js]: 💎 Starting monthly Nitro boost reward distribution (1st of month)...');
   const result = await distributeMonthlyBoostRewards(client);
   console.log(`[scheduler.js]: ✅ Nitro boost rewards distributed - Rewarded: ${result.rewardedCount}, Already Rewarded: ${result.alreadyRewardedCount}, Errors: ${result.errorCount}, Total Tokens: ${result.totalTokens}`);
  } catch (error) {
   handleError(error, 'scheduler.js');
   console.error('[scheduler.js]: ❌ Monthly Nitro boost reward distribution failed:', error.message);
  }
 });
 // Monthly quest reward distribution - runs at 11:59 PM daily, but only processes on last day of month
 createCronJob("59 23 * * *", "monthly quest reward distribution", async () => {
  try {
   // Check if today is the last day of the month
   const now = new Date();
   const tomorrow = new Date(now);
   tomorrow.setDate(tomorrow.getDate() + 1);
   
   // If tomorrow is the 1st, then today is the last day of the month
   if (tomorrow.getDate() === 1) {
    console.log('[scheduler.js]: 🏆 Starting monthly quest reward distribution (last day of month)...');
    const result = await processMonthlyQuestRewards();
    console.log(`[scheduler.js]: ✅ Monthly quest rewards distributed - Processed: ${result.processed}, Rewarded: ${result.rewarded}, Errors: ${result.errors}`);
   } else {
    console.log('[scheduler.js]: ℹ️ Not last day of month, skipping monthly quest reward distribution');
   }
  } catch (error) {
   handleError(error, 'scheduler.js');
   console.error('[scheduler.js]: ❌ Monthly quest reward distribution failed:', error.message);
  }
 });

 // Periodic raid expiration check (every 5 minutes) to ensure raids timeout even if bot restarts
 createCronJob("*/5 * * * *", "raid expiration check", async () => {
  try {
   const result = await cleanupExpiredRaids(client);
   if (result.expiredCount > 0) {
    console.log(`[scheduler.js]: ⏰ Periodic raid check - ${result.expiredCount} raid(s) expired`);
   }
  } catch (error) {
   handleError(error, 'scheduler.js');
   console.error('[scheduler.js]: ❌ Periodic raid expiration check failed:', error);
  }
 });

 // Hourly tasks
 createCronJob("0 */6 * * *", "quest completion check", () => checkQuestCompletions(client));
 createCronJob("0 */2 * * *", "village tracking check", () => checkVillageTracking(client)); // Every 2 hours
 createCronJob("0 1 * * *", "blood moon tracking cleanup", () => {
  console.log(`[scheduler.js]: 🧹 Starting Blood Moon tracking cleanup`);
  cleanupOldTrackingData();
  console.log(`[scheduler.js]: ✅ Blood Moon tracking cleanup completed`);
 });
}

function setupQuestPosting(client) {
 // Quest posting check - runs on 1st of month at midnight
 createCronJob("0 0 1 * *", "quest posting check", async () => {
  try {
   process.env.TEST_CHANNEL_ID = '706880599863853097';
   delete require.cache[require.resolve('./scripts/questAnnouncements')];
   const { postQuests } = require('./scripts/questAnnouncements');
   await postQuests(client);
  } catch (error) {
   handleError(error, 'scheduler.js');
   console.error('[scheduler.js]: ❌ Quest posting check failed:', error.message);
  }
 }, "America/New_York");
}

function setupBloodMoonScheduling(client) {
 createCronJob("0 20 * * *", "blood moon start announcement", () => handleBloodMoonStart(client), "America/New_York");
 createCronJob("0 8 * * *", "blood moon end announcement", () => handleBloodMoonEnd(client), "America/New_York");
}

function setupGoogleSheetsRetry() {
 createCronJob("*/15 * * * *", "retry pending Google Sheets operations", async () => {
  try {
   const pendingCount = await getPendingSheetOperationsCount();
   if (pendingCount > 0) {
    console.log(`[scheduler.js]: 🔄 Retrying ${pendingCount} pending Google Sheets operations`);
    const result = await retryPendingSheetOperations();
    if (result.success) {
     console.log(`[scheduler.js]: ✅ Retry completed: ${result.retried} successful, ${result.failed} failed`);
    } else {
     console.error(`[scheduler.js]: ❌ Retry failed: ${result.error}`);
    }
   } else {
    console.log(`[scheduler.js]: ✅ No pending Google Sheets operations to retry`);
   }
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error(`[scheduler.js]: ❌ Google Sheets retry task failed: ${error.message}`);
  }
 }, "America/New_York");
}

// ------------------- Main Initialization Function ------------------

function initializeScheduler(client) {
 if (!client || !client.isReady()) {
  console.error("[scheduler.js]: ❌ Invalid or unready Discord client provided to scheduler");
  return;
 }

 // Run startup checks
 runStartupChecks(client);

 // Setup all schedulers
 setupDailyTasks(client);
 setupQuestPosting(client);
 setupBloodMoonScheduling(client);
 setupGoogleSheetsRetry();

 // Initialize specialized schedulers
 setupBlightScheduler(client);
 setupBoostingScheduler(client);
 setupWeatherScheduler(client);
 setupHelpWantedFixedScheduler(client);
 
 // Check and post weather on restart if needed
 (async () => {
   try {
     await checkAndPostWeatherOnRestart(client);
   } catch (error) {
     console.error(`[scheduler.js]: ❌ Restart weather check failed:`, error.message);
     handleError(error, "scheduler.js", {
       commandName: 'initializeScheduler',
       operation: 'restartWeatherCheck'
     });
   }
 })();

 console.log("[scheduler.js]: ✅ All scheduled tasks initialized");
}

module.exports = {
 initializeScheduler,
 setupBlightScheduler,
 setupBoostingScheduler,
 setupWeatherScheduler,
 postWeatherUpdate,
 checkAndPostWeatherIfNeeded,
 checkAndPostWeatherOnRestart,
 executeBirthdayAnnouncements,
 handleBirthdayRoleAssignment,
 handleBirthdayRoleRemoval,
 sendBirthdayAnnouncements,
 handleJailRelease,
 handleDebuffExpiry,
 handleBuffExpiry,
 resetDailyRolls,
 resetPetLastRollDates,
 checkAndGenerateDailyQuests,
 generateDailyQuestsAtMidnight,
 checkAndPostMissedQuests,
 cleanupOldRuuGameSessions,
 cleanupExpiredRaids,
 distributeMonthlyBoostRewards,
 checkAndDistributeMonthlyBoostRewards,
};
