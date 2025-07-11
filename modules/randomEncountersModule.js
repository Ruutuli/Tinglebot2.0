// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const { ChannelType } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const { getMonstersAboveTierByRegion } = require('../database/db');
const { getVillageRegionByName } = require('./locationsModule');
const { triggerRaid } = require('./raidModule');
const { capitalizeVillageName } = require('../utils/stringUtils');

// ============================================================================
// ---- Constants ----
// ============================================================================
const MESSAGE_THRESHOLD = 100;            // Number of messages to trigger an encounter
const MIN_ACTIVE_USERS = 4;               // Minimum unique users required for an encounter
const TIME_WINDOW = 30 * 60 * 1000;      // 30 minutes in milliseconds
const CHECK_INTERVAL = 20 * 1000;        // Check every 20 seconds

// Village channel mappings
const villageChannels = {
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Inariko: process.env.INARIKO_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL,
};

// Temporary raid channel - all raids will happen here
const TEMP_RAID_CHANNEL_ID = '1391812848099004578';

// ============================================================================
// ---- Message Activity Tracking ----
// ============================================================================

// Tracks message timestamps and unique users in each channel
const messageActivity = new Map();

// ---- Function: trackMessageActivity ----
// Tracks message activity for random encounter triggering
function trackMessageActivity(channelId, userId, isBot, username) {
  if (isBot) return; // Ignore bot messages

  const currentTime = Date.now();

  if (!messageActivity.has(channelId)) {
    messageActivity.set(channelId, { messages: [], users: new Set() });
  }

  const activity = messageActivity.get(channelId);

  // Filter out messages older than TIME_WINDOW and add the current message timestamp
  activity.messages = activity.messages
    .filter((timestamp) => currentTime - timestamp <= TIME_WINDOW)
    .concat(currentTime);

  // Add the user to the set of active users
  activity.users.add(userId);
  messageActivity.set(channelId, activity);
}

// ============================================================================
// ---- Encounter Triggering Functions ----
// ============================================================================

// ---- Function: checkForRandomEncounters ----
// Checks for random encounter conditions and triggers raids
async function checkForRandomEncounters(client) {
  const currentTime = Date.now();

  for (const [channelId, activity] of messageActivity.entries()) {
    // Remove outdated messages
    activity.messages = activity.messages.filter(
      (timestamp) => currentTime - timestamp <= TIME_WINDOW
    );

    const messageCount = activity.messages.length;
    const uniqueUserCount = activity.users.size;
    const meetsThreshold = messageCount >= MESSAGE_THRESHOLD && uniqueUserCount >= MIN_ACTIVE_USERS;

    if (meetsThreshold) {
      console.log(`[randomEncountersModule.js]: 🐉 Triggering encounter for channel: ${channelId}`);
      
      // Reset the activity for the channel
      messageActivity.set(channelId, { messages: [], users: new Set() });

      // Use the temporary raid channel
      const raidChannel = client.channels.cache.get(TEMP_RAID_CHANNEL_ID);

      if (raidChannel && raidChannel.type === ChannelType.GuildText) {
        await triggerRandomEncounter(raidChannel, client);
      }
    }
  }
}

// ---- Function: triggerRandomEncounter ----
// Triggers a random encounter raid
async function triggerRandomEncounter(channel, client) {
  try {
    // Use a random village for the monster selection
    const villages = Object.keys(villageChannels);
    const selectedVillage = villages[Math.floor(Math.random() * villages.length)];
    
    // Get the village region
    const villageRegion = getVillageRegionByName(selectedVillage);

    // Select a monster above tier 5 from the region
    const monster = await getMonstersAboveTierByRegion(5, villageRegion);
    if (!monster || !monster.name || !monster.tier) {
      console.error(`[randomEncountersModule.js]: ❌ No eligible monsters found for region: ${villageRegion}`);
      await channel.send(`❌ **No eligible monsters found for ${selectedVillage} region.**`);
      return;
    }

    // Create a dummy interaction for the raid trigger
    const dummyInteraction = {
      channel: channel,
      client: client,
      user: { id: 'system', tag: 'System' }
    };

    // Trigger the raid
    const result = await triggerRaid(monster, dummyInteraction, selectedVillage, false);

    if (!result || !result.success) {
      console.error(`[randomEncountersModule.js]: ❌ Failed to trigger random encounter: ${result?.error || 'Unknown error'}`);
      return;
    }

    console.log(`[randomEncountersModule.js]: 🐉 Random encounter raid triggered - ${monster.name} (T${monster.tier}) in ${selectedVillage}`);

  } catch (error) {
    handleError(error, 'randomEncountersModule.js', {
      functionName: 'triggerRandomEncounter',
      selectedVillage: selectedVillage,
      monsterName: monster?.name
    });
    console.error('[randomEncountersModule.js]: ❌ Error triggering encounter:', error);
  }
}

// ============================================================================
// ---- Initialization Function ----
// ============================================================================

// ---- Function: initializeRandomEncounters ----
// Initializes the random encounter system
function initializeRandomEncounters(client) {
  // Set up message tracking
  client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    trackMessageActivity(
      message.channel.id,
      message.author.id,
      message.author.bot,
      message.author.username
    );
  });

  // Start periodic encounter checks
  setInterval(() => {
    checkForRandomEncounters(client).catch(error => {
      console.error('[randomEncountersModule.js]: ❌ Encounter check failed:', error);
      handleError(error, 'randomEncountersModule.js');
    });
  }, CHECK_INTERVAL);

  console.log(`[randomEncountersModule.js]: ✅ Random encounter system initialized`);
}

// ============================================================================
// ---- Exports ----
// ============================================================================

module.exports = {
  initializeRandomEncounters,
  trackMessageActivity,
  checkForRandomEncounters,
  triggerRandomEncounter
}; 