// ============================================================================
// 🌤️ Special Weather Command
// Allows characters to gather special items during special weather conditions
// ============================================================================

// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');

// ------------------- Database Services -------------------
const { fetchCharacterByNameAndUserId, fetchAllItems } = require('../database/db.js');

// ------------------- Modules -------------------
const { createWeightedItemList } = require('../modules/rngModule.js');
const { handleError } = require('../utils/globalErrorHandler.js');
const { syncToInventoryDatabase, SOURCE_TYPES } = require('../utils/inventoryUtils.js');
const { getWeatherWithoutGeneration } = require('../modules/weatherModule.js');
const { enforceJail } = require('../utils/jailCheck.js');
const { checkInventorySync } = require('../utils/characterUtils.js');

// ------------------- Constants -------------------
const DEFAULT_IMAGE_URL = 'https://storage.googleapis.com/tinglebot/Graphics/Default-Footer.png';

const VILLAGE_COLORS = {
  Rudania: 0xd7342a,
  Inariko: 0x277ecd,
  Vhintl: 0x25c059
};

const VILLAGE_IMAGES = {
  Inariko: "https://storage.googleapis.com/tinglebot/Graphics/Inariko-Footer.png",
  Rudania: "https://storage.googleapis.com/tinglebot/Graphics/Rudania-Footer.png",
  Vhintl: "https://storage.googleapis.com/tinglebot/Graphics/Vhintl-Footer.png"
};

const OVERLAY_MAPPING = {
  'Flower Bloom': 'flowerbloom',
  'Fairy Circle': 'fairycircle',
  'Meteor Shower': 'meteorshower',
  'Jubilee': 'jubilee',
  'Drought': 'drought',
  'Flood': 'flood',
  'Avalanche': 'avalanche',
  'Blight Rain': 'blightrain',
  'Muggy': 'muggy',
  'Rock Slide': 'rockslide'
};

// Mapping special weather to regular weather overlays
const SPECIAL_TO_REGULAR_OVERLAY = {
  'Avalanche': 'blizzard',
  'Blight Rain': 'blightrain',
  'Drought': 'sunny',
  'Fairy Circle': 'sunny',
  'Flood': 'heavyrain',
  'Flower Bloom': 'rainbow',
  'Jubilee': 'sunny',
  'Meteor Shower': 'sunny',
  'Muggy': 'fog',
  'Rock Slide': 'sunny'
};

// Add banner cache
const bannerCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Add channel mapping
const VILLAGE_CHANNELS = {
  Rudania: process.env.RUDANIA_TOWNHALL,
  Inariko: process.env.INARIKO_TOWNHALL,
  Vhintl: process.env.VHINTL_TOWNHALL
};

// ------------------- Helper Functions -------------------
function capitalizeWords(str) {
  return str.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function getArticleForItem(itemName) {
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  const firstLetter = itemName.charAt(0).toLowerCase();
  return vowels.includes(firstLetter) ? 'an' : 'a';
}

function isValidImageUrl(url) {
  return url && typeof url === 'string' && url.startsWith('http');
}

function generateGatherFlavorText(weatherLabel) {
  const flavorTexts = {
    'Avalanche': 'Heavy snow crashes down the mountainside in a roaring slide.',
    'Blight Rain': 'Dark clouds pour with unnatural rain that stings the earth.',
    'Drought': 'The air is dry and cracked earth stretches as far as the eye can see.',
    'Fairy Circle': 'Whimsical patterns of mushrooms dot the ground under a strange stillness.',
    'Flood': 'Waters swell past their banks, rushing across the land in waves.',
    'Flower Bloom': 'Every field is bursting with vibrant petals under the warm breeze.',
    'Jubilee': 'The weather is calm and festive, carrying a sense of celebration.',
    'Meteor Shower': 'Streaks of light race across the night sky, burning trails into the dark.',
    'Muggy': 'Thick, humid air clings to everything, dense with moisture.',
    'Rock Slide': 'Loose rock and debris tumble down the slopes with thunderous force.',
    'Default': 'The weather shifts unpredictably, creating a strange atmosphere.'
  };

  return flavorTexts[weatherLabel] || flavorTexts.Default;
}

function getOverlayPath(condition) {
  const overlayName = OVERLAY_MAPPING[condition];
  let overlayPath = null;
  
  if (overlayName) {
    overlayPath = path.join(__dirname, '..', 'assets', 'overlays', `ROOTS-${overlayName}.png`);
    if (fs.existsSync(overlayPath)) {
      return overlayPath;
    }
  }
  
  // If no direct overlay found or file doesn't exist, try fallback
  const fallbackOverlay = SPECIAL_TO_REGULAR_OVERLAY[condition];
  
  if (fallbackOverlay) {
    const fallbackPath = path.join(__dirname, '..', 'assets', 'overlays', `ROOTS-${fallbackOverlay}.png`);
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
  }
  
  console.warn(`[specialweather.js]: ⚠️ No overlay found for ${condition}`);
  return null;
}

async function generateBanner(village, weather) {
  try {
    // Check cache first
    const cacheKey = `${village}-${weather.special.label}`;
    const cachedBanner = bannerCache.get(cacheKey);
    if (cachedBanner && Date.now() - cachedBanner.timestamp < CACHE_DURATION) {
      return cachedBanner.banner;
    }

    const bannerUrl = VILLAGE_IMAGES[village];
    if (!bannerUrl) {
      console.error(`[specialweather.js]: ❌ No banner URL found for village: ${village}`);
      return null;
    }

    const overlayPath = getOverlayPath(weather.special.label);
    if (!overlayPath) {
      return null;
    }

    // Add timeout to prevent infinite loops
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Image processing timeout')), 3000); // Reduced timeout further
    });

    // Process images in parallel
    const [bannerImg, overlayImg] = await Promise.all([
      Promise.race([Jimp.read(bannerUrl), timeoutPromise]),
      Promise.race([Jimp.read(overlayPath), timeoutPromise])
    ]);

    // Validate image dimensions before processing
    if (bannerImg.bitmap.width > 0 && bannerImg.bitmap.height > 0) {
      overlayImg.resize(bannerImg.bitmap.width, bannerImg.bitmap.height);
      bannerImg.composite(overlayImg, 0, 0, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 1,
        opacityDest: 1
      });
    } else {
      throw new Error('Invalid image dimensions');
    }

    const outName = `banner-${village.toLowerCase()}.png`;
    const buffer = await bannerImg.getBufferAsync(Jimp.MIME_PNG);
    const banner = new AttachmentBuilder(buffer, { name: outName });

    // Cache the banner
    bannerCache.set(cacheKey, {
      banner,
      timestamp: Date.now()
    });

    return banner;
  } catch (error) {
    console.error(`[specialweather.js]: ❌ Error generating banner: ${error.message}`);
    return null;
  }
}

// ------------------- Embed Creation -------------------
const createSpecialWeatherEmbed = async (character, item, weather) => {
  const currentVillage = capitalizeWords(character.currentVillage);
  const isVisiting = character.homeVillage.toLowerCase() !== character.currentVillage.toLowerCase();
  const locationPrefix = isVisiting
    ? `${capitalizeWords(character.homeVillage)} ${capitalizeWords(character.job)} is visiting ${currentVillage}`
    : `${currentVillage} ${capitalizeWords(character.job)}`;

  const embedColor = VILLAGE_COLORS[currentVillage] || 0x000000;
  
  // Get the best available image URL for the thumbnail
  let thumbnailUrl = DEFAULT_IMAGE_URL;
  if (item.image && isValidImageUrl(item.image)) {
    thumbnailUrl = item.image;
  } else if (item.inarikoImg && isValidImageUrl(item.inarikoImg)) {
    thumbnailUrl = item.inarikoImg;
  } else if (item.rudaniaImg && isValidImageUrl(item.rudaniaImg)) {
    thumbnailUrl = item.rudaniaImg;
  } else if (item.vhintlImg && isValidImageUrl(item.vhintlImg)) {
    thumbnailUrl = item.vhintlImg;
  }

  const article = getArticleForItem(item.itemName);
  const flavorText = generateGatherFlavorText(weather.special.label);

  const embed = new EmbedBuilder()
    .setTitle(`${locationPrefix}: ${character.name} found ${article} ${item.itemName} during ${weather.special.label}!`)
    .setDescription(flavorText)
    .setColor(embedColor)
    .setAuthor({
      name: `${character.name} 🔗`,
      iconURL: character.icon || DEFAULT_IMAGE_URL,
      url: character.inventory || ''
    })
    .setThumbnail(thumbnailUrl)
    .addFields(
      { name: 'Special Weather', value: `${weather.special.emoji || '✨'} ${weather.special.label}`, inline: true },
      { name: 'Location', value: currentVillage, inline: true }
    );

  return { embed, files: [] };
};

// ------------------- Special Weather Usage Helper -------------------
function getESTTime() {
  const now = new Date();
  
  // Use Intl.DateTimeFormat to get the time in EST/EDT
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  
  // Parse the formatted date string back into a Date object
  const parts = formatter.formatToParts(now);
  const values = {};
  parts.forEach(part => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });
  
  // Create a new date in EST/EDT
  const estTime = new Date(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );
  
  return estTime;
}

function canUseSpecialWeather(character, village) {
  const lastUsage = character.specialWeatherUsage?.get(village);
  if (!lastUsage) return true;

  // Get current time in EST/EDT
  const now = getESTTime();
  
  // Get the start of the current weather period (8am EST/EDT of the current day)
  const startOfPeriod = new Date(now);
  startOfPeriod.setHours(8, 0, 0, 0);
  
  // If current time is before 8am EST/EDT, use previous day's 8am as start
  if (now.getHours() < 8) {
    startOfPeriod.setDate(startOfPeriod.getDate() - 1);
  }

  // Get the end of the current weather period (7:59:59 AM EST/EDT of the next day)
  const endOfPeriod = new Date(startOfPeriod);
  endOfPeriod.setDate(endOfPeriod.getDate() + 1);
  endOfPeriod.setHours(7, 59, 59, 999);

  // Convert lastUsage to EST/EDT for comparison
  const lastUsageEST = new Date(lastUsage);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  
  const parts = formatter.formatToParts(lastUsageEST);
  const values = {};
  parts.forEach(part => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });
  
  const lastUsageESTDate = new Date(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );

  // Check if last usage was before the start of the current period
  return lastUsageESTDate < startOfPeriod;
}

function getNextAvailableTime(lastUsage) {
  // Convert lastUsage to EST/EDT using the same method
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  
  const parts = formatter.formatToParts(lastUsage);
  const values = {};
  parts.forEach(part => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });
  
  const lastUsageEST = new Date(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );
  
  // Set to 8am EST/EDT of the next day
  const nextAvailable = new Date(lastUsageEST);
  nextAvailable.setHours(8, 0, 0, 0);
  nextAvailable.setDate(nextAvailable.getDate() + 1);
  return nextAvailable;
}

// ------------------- Command Definition -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('specialweather')
    .setDescription('Gather special items during special weather conditions')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)),

  // ------------------- Command Execution Logic -------------------
  async execute(interaction) {
    try {
      await interaction.deferReply();

      // Check if command is used in a valid town hall channel
      const channelId = interaction.channelId;
      const validChannels = Object.values(VILLAGE_CHANNELS);
      if (!validChannels.includes(channelId)) {
        await interaction.editReply({
          content: `❌ **This command can only be used in a village's town hall channel.**\n🏛️ **Valid channels:**\n- <#${VILLAGE_CHANNELS.Rudania}> (Rudania)\n- <#${VILLAGE_CHANNELS.Inariko}> (Inariko)\n- <#${VILLAGE_CHANNELS.Vhintl}> (Vhintl)`,
          ephemeral: true
        });
        return;
      }

      // Get the village from the channel ID
      const channelVillage = Object.entries(VILLAGE_CHANNELS).find(([_, id]) => id === channelId)?.[0];
      if (!channelVillage) {
        await interaction.editReply({
          content: `❌ **Invalid town hall channel.**`,
          ephemeral: true
        });
        return;
      }

      const characterName = interaction.options.getString('charactername');
      const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
      
      if (!character) {
        await interaction.editReply({
          content: `❌ **Character ${characterName} not found or does not belong to you.**`,
        });
        return;
      }

      // Check inventory sync before proceeding
      await checkInventorySync(character);

      // Check if character is in jail
      const jailCheck = await enforceJail(character, 'gather during special weather');
      if (jailCheck) {
        await interaction.editReply({ content: jailCheck, ephemeral: true });
        return;
      }

      // Check if character is KOed
      if (character.isKO) {
        await interaction.editReply({
          content: `❌ **${character.name} is currently KOed and cannot gather.**\n💤 **Let them rest and recover before gathering again.**`,
          ephemeral: true,
        });
        return;
      }

      // Check if character is debuffed
      if (character.debuff?.active) {
        const debuffEndDate = new Date(character.debuff.endDate);
        
        // Convert to EST and set to midnight for display
        const estDate = new Date(debuffEndDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        estDate.setHours(0, 0, 0, 0);
        
        // Convert back to UTC for Discord timestamp
        const utcDate = new Date(estDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const unixTimestamp = Math.floor(utcDate.getTime() / 1000);
        
        await interaction.editReply({
          content: `❌ **${character.name} is currently debuffed and cannot gather.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
          ephemeral: true,
        });
        return;
      }

      // Check if character has already gathered during special weather in this village today
      const isModerator = ['inarikomod', 'rudaniamod', 'vhintlmod'].includes(character.name.toLowerCase());
      if (!isModerator && !canUseSpecialWeather(character, channelVillage)) {
        const lastUsage = character.specialWeatherUsage.get(channelVillage);
        const nextGather = getNextAvailableTime(lastUsage);
        const unixTimestamp = Math.floor(nextGather.getTime() / 1000);
        
        await interaction.editReply({
          embeds: [{
            color: 0x008B8B, // Dark cyan color
            description: `*${character.name} has found all the special weather had to offer in ${channelVillage} today!*\n\n**Daily special weather gathering limit reached for ${channelVillage}.**\nYou've already gathered during special weather in ${channelVillage} today. Special weather events are rare and unpredictable - keep an eye out for the next one!\n\n⏰ **Next available:** <t:${unixTimestamp}:R>`,
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Daily Activity Limit'
            }
          }],
          ephemeral: true,
        });
        return;
      }

      // Get current weather for the village
      const currentVillage = channelVillage; // Use the village from the channel
      const weather = await getWeatherWithoutGeneration(currentVillage);


      
      if (!weather) {
        console.error(`[specialweather.js]: ❌ No weather data found for ${currentVillage}`);
        await interaction.editReply({
          embeds: [{
            color: 0x008B8B,
            description: `*${character.name} looks up at the sky...*\n\n**Weather Data Error**\nUnable to retrieve weather data for ${currentVillage}.\n\nPlease try again in a few moments.`,
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Weather Data Error'
            }
          }],
          ephemeral: true
        });
        return;
      }

      if (!weather.special) {
        console.log(`[specialweather.js]: ⚠️ No special weather object found for ${currentVillage}`);
        await interaction.editReply({
          embeds: [{
            color: 0x008B8B,
            description: `*${character.name} looks up at the sky...*\n\n**No Special Weather Detected**\nThere is no special weather in ${currentVillage} right now.\n\n✨ **Special weather is required to use this command.**`,
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Weather Check'
            }
          }],
          ephemeral: true
        });
        return;
      }

      if (!weather.special.label) {
        console.error(`[specialweather.js]: ❌ Special weather object found but no label for ${currentVillage}`);
        await interaction.editReply({
          embeds: [{
            color: 0x008B8B,
            description: `*${character.name} looks up at the sky...*\n\n**Weather Data Error**\nThe special weather data for ${currentVillage} appears to be incomplete.\n\nPlease try again in a few moments.`,
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Weather Data Error'
            }
          }],
          ephemeral: true
        });
        return;
      }

      console.log(`[specialweather.js]: ✅ Special weather detected: ${weather.special.label}`);

      // Check if character is in the correct village
      if (character.currentVillage.toLowerCase() !== currentVillage.toLowerCase()) {
        await interaction.editReply({
          embeds: [{
            color: 0x008B8B, // Dark cyan color
            description: `*${character.name} looks around confused...*\n\n**Wrong Village Location**\nYou must be in ${currentVillage} to gather during its special weather.\n\n🗺️ **Current Location:** ${character.currentVillage}`,
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Location Check'
            }
          }],
          ephemeral: true
        });
        return;
      }

      // Get special weather items
      const items = await fetchAllItems();
      
      // Convert special weather label to the corresponding field name
      const specialWeatherField = weather.special.label
        .toLowerCase()
        .replace(/\s+/g, '') // Remove spaces
        .replace(/[^a-z0-9]/g, ''); // Remove special characters

      // Special case for meteorShower
      const fieldName = specialWeatherField === 'meteorshower' ? 'meteorShower' : specialWeatherField;

      // Filter items that are available for this special weather (ignoring location)
      const specialWeatherItems = items.filter(item => 
        item.specialWeather && 
        item.specialWeather[fieldName] === true
      );

      if (specialWeatherItems.length === 0) {
        await interaction.editReply({
          content: `❌ **No special items available in ${currentVillage} during ${weather.special.label}.**`,
        });
        return;
      }

      // Select and gather item
      const weightedItems = createWeightedItemList(specialWeatherItems);
      const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];
      
      // Format item for syncing
      const itemToSync = {
        itemName: randomItem.itemName,
        quantity: 1,
        category: Array.isArray(randomItem.category) ? randomItem.category : [randomItem.category],
        type: Array.isArray(randomItem.type) ? randomItem.type : [randomItem.type],
        subtype: Array.isArray(randomItem.subtype) ? randomItem.subtype : (randomItem.subtype ? [randomItem.subtype] : []),
        obtain: `Special Weather: ${weather.special.label}`,
        date: new Date(),
        link: `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
      };

      // Sync item using itemSyncUtils
      await syncToInventoryDatabase(character, itemToSync, interaction);

      // Update last special weather gather time
      character.lastSpecialWeatherGather = new Date();
      await character.save();

      // Update special weather usage for this village
      if (!character.specialWeatherUsage) {
        character.specialWeatherUsage = new Map();
      }
      character.specialWeatherUsage.set(channelVillage, new Date());
      await character.save();

      // Create and send embed
      const { embed, files } = await createSpecialWeatherEmbed(character, randomItem, weather);
      
      // Generate banner and add it to the embed
      const banner = await generateBanner(currentVillage, weather);
      if (banner) {
        embed.setImage(`attachment://${banner.name}`);
        files.push(banner);
      }

      // Send response with embed and banner
      await interaction.editReply({ 
        embeds: [embed], 
        files: files 
      });

    } catch (error) {
      // Only log errors that aren't inventory sync related
      if (!error.message.includes('inventory is not synced')) {
        handleError(error, 'specialweather.js', {
          commandName: '/specialweather',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          characterName: interaction.options.getString('charactername')
        });
      }

      // Provide more specific error messages based on the error type
      let errorMessage;
      if (error.message.includes('inventory is not synced')) {
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000, // Red color
            title: '❌ Inventory Not Synced',
            description: error.message,
            fields: [
              {
                name: 'How to Fix',
                value: '1. Use `/inventory test` to test your inventory\n2. Use `/inventory sync` to sync your inventory'
              }
            ],
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Inventory Sync Required'
            }
          }],
          ephemeral: true
        });
        return;
      } else if (error.message.includes('MongoDB')) {
        errorMessage = '❌ **Database connection error.** Please try again in a few moments.';
      } else if (error.message.includes('Google Sheets')) {
        errorMessage = '❌ **Inventory sync error.** Your items were gathered but may not appear in your inventory sheet immediately.';
      } else if (error.message.includes('ETIMEDOUT') || error.message.includes('Connect Timeout')) {
        errorMessage = '❌ **Connection timeout.** Please try again in a few moments.';
      } else if (error.message.includes('Permission denied')) {
        errorMessage = '❌ **Permission denied.** Please make sure your inventory sheet is shared with the bot.';
      } else if (error.message.includes('Invalid Google Sheets URL')) {
        errorMessage = '❌ **Invalid inventory sheet URL.** Please check your character\'s inventory sheet link.';
      } else {
        errorMessage = `❌ **Error during special weather gathering:** ${error.message}`;
      }

      if (errorMessage) {
        await interaction.editReply({
          content: errorMessage,
          ephemeral: true
        });
      }
    }
  },
}; 