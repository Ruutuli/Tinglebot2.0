// ============================================================================
// 🌤️ Special Weather Command
// Allows characters to gather special items during special weather conditions
// ============================================================================

// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');

// ------------------- Database Services -------------------
const { fetchCharacterByNameAndUserId, fetchAllItems } = require('@/database/db.js');
const ItemModel = require('@/models/ItemModel');

// ------------------- Modules -------------------
const { createWeightedItemList } = require('../../modules/rngModule.js');
const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { syncToInventoryDatabase } = require('@/utils/inventoryUtils.js');
const weatherService = require('@/services/weatherService');
const { getWeatherWithoutGeneration, getCurrentPeriodBounds, getNextPeriodBounds, PERIOD_VALIDATION_TOLERANCE_MS } = weatherService;
const { canUseSpecialWeather, normalizeVillageName } = require('@/utils/specialWeatherUtils');
const { enforceJail } = require('@/utils/jailCheck.js');
const { checkInventorySync } = require('@/utils/characterUtils.js');
const { createGatherDebuffEmbed, createKOEmbed } = require('../../embeds/embeds.js');

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

// ------------------- Channel Mapping -------------------
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
    'Lightning Storm': 'Lightning crackles across the sky in a dangerous storm!',
    'Meteor Shower': 'Streaks of light race across the night sky, burning trails into the dark.',
    'Muggy': 'Thick, humid air clings to everything, dense with moisture.',
    'Rock Slide': 'Loose rock and debris tumble down the slopes with thunderous force.',
    'Default': 'The weather shifts unpredictably, creating a strange atmosphere.'
  };

  return flavorTexts[weatherLabel] || flavorTexts.Default;
}

async function generateBanner(village, weather) {
  return await weatherService.generateBanner(village, weather, { 
    enableCaching: true, 
    cacheDuration: 300000 // 5 minutes
  });
}

// ------------------- Error Embed Helpers -------------------
function createErrorEmbed(title, description, footer = null, color = 0x008B8B) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
  
  if (footer) {
    embed.setFooter({ text: footer });
  }
  
  return embed;
}

function createDetailedErrorEmbed(error, context = {}) {
  const characterName = context.characterName || 'Unknown';
  const village = context.village || 'Unknown';
  const timestamp = new Date().toISOString();
  
  // Extract error information
  const errorName = error?.name || 'Unknown Error';
  const errorMessage = error?.message || 'An unexpected error occurred';
  const errorCode = error?.code || 'N/A';
  const errorStack = error?.stack ? error.stack.split('\n').slice(0, 5).join('\n') : 'No stack trace available';
  
  // Determine error type
  let errorType = 'Unknown Error';
  let errorDescription = errorMessage;
  let suggestedFix = 'Please try again in a few moments. If the issue persists, contact support.';
  
  if (errorMessage.includes('Received one or more errors')) {
    errorType = 'Validation Error';
    errorDescription = 'A validation error occurred while processing your request. This usually happens when data format is incorrect.';
    suggestedFix = 'This is likely a bug. The error has been logged for review.';
  } else if (errorMessage.includes('MongoDB') || errorMessage.includes('database')) {
    errorType = 'Database Error';
    errorDescription = 'Failed to connect to or query the database.';
    suggestedFix = 'Please try again in a few moments. The database may be temporarily unavailable.';
  } else if (errorMessage.includes('Google Sheets') || errorMessage.includes('sheets')) {
    errorType = 'Inventory Sync Error';
    errorDescription = 'Failed to sync items to your inventory sheet.';
    suggestedFix = 'Your items may have been gathered but not synced. Check your inventory or try syncing manually.';
  } else if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
    errorType = 'Connection Timeout';
    errorDescription = 'The request took too long to complete.';
    suggestedFix = 'Please try again. The service may be experiencing high load.';
  } else if (errorMessage.includes('Permission denied') || errorMessage.includes('permission')) {
    errorType = 'Permission Error';
    errorDescription = 'The bot does not have permission to access required resources.';
    suggestedFix = 'Please ensure your inventory sheet is shared with the bot.';
  } else if (errorMessage.includes('Invalid') || errorMessage.includes('invalid')) {
    errorType = 'Invalid Data Error';
    errorDescription = errorMessage;
    suggestedFix = 'Please check your input and try again.';
  }
  
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('🐛 Special Weather Gathering Error')
    .setDescription(`*${characterName} looks confused as something goes wrong...*\n\n**An error occurred while gathering during special weather.**`)
    .addFields(
      {
        name: '📋 Error Type',
        value: `\`${errorType}\``,
        inline: true
      },
      {
        name: '🔢 Error Code',
        value: `\`${errorCode}\``,
        inline: true
      },
      {
        name: '📍 Context',
        value: `**Character:** ${characterName}\n**Village:** ${village}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: false
      },
      {
        name: '💬 Error Message',
        value: `\`\`\`${errorMessage.substring(0, 500)}\`\`\``,
        inline: false
      },
      {
        name: '🔧 Suggested Fix',
        value: suggestedFix,
        inline: false
      },
      {
        name: '📝 Technical Details',
        value: `**Error Name:** \`${errorName}\`\n**Timestamp:** \`${timestamp}\`\n\n*This error has been automatically logged for review.*`,
        inline: false
      }
    )
    .setFooter({ text: 'Bug Report • Error ID: ' + Date.now().toString(36).toUpperCase() })
    .setTimestamp();
  
  return embed;
}

function createWeatherErrorEmbed(characterName, village, errorType) {
  const errorMessages = {
    notFound: {
      title: '❌ Invalid Channel',
      description: '**This command can only be used in a village\'s town hall channel.**',
      footer: 'Channel Restriction',
      color: 0xFF6B6B
    },
    invalidChannel: {
      title: '❌ Invalid Channel',
      description: '**This command can only be used in a village\'s town hall channel.**',
      footer: 'Channel Restriction',
      color: 0xFF6B6B
    },
    noWeather: {
      title: 'Weather Data Error',
      description: `*${characterName} looks up at the sky...*\n\n**Weather Data Error**\nUnable to retrieve weather data for ${village}.\n\nPlease try again in a few moments.`,
      footer: 'Weather Data Error',
      color: 0x008B8B
    },
    invalidWeather: {
      title: 'Weather Data Error',
      description: `*${characterName} looks up at the sky...*\n\n**Weather Data Error**\nThe weather data for ${village} appears to be incomplete.\n\nPlease try again in a few moments.`,
      footer: 'Weather Data Error',
      color: 0x008B8B
    },
    futurePeriod: {
      title: 'Weather Data Error',
      description: `*${characterName} looks up at the sky...*\n\n**Weather Data Error**\nThe retrieved weather data for ${village} appears to be from a future period.\n\nPlease try again in a few moments.`,
      footer: 'Weather Data Error',
      color: 0x008B8B
    },
    noSpecial: {
      title: 'No Special Weather Today!',
      description: `*${characterName} looks up at the sky...*\n\n**No Special Weather Today!**\nThere is no special weather in ${village} right now.\n\n⏰ **Wait until this village has special weather to use this command!**\n\nSpecial weather events are rare and unpredictable - keep an eye out for the next one!`,
      footer: 'Weather Check',
      color: 0x008B8B
    },
    malformed: {
      title: 'Weather Data Error',
      description: `*${characterName} looks up at the sky...*\n\n**Weather Data Error**\nThe special weather data for ${village} appears to be malformed.\n\nPlease try again in a few moments.`,
      footer: 'Weather Data Error',
      color: 0x008B8B
    },
    wrongVillage: {
      title: 'Wrong Village Location',
      description: `*${characterName} looks around confused...*\n\n**Wrong Village Location**\nYou must be in ${village} to gather during its special weather.`,
      footer: 'Location Check',
      color: 0x008B8B
    }
  };

  const config = errorMessages[errorType] || errorMessages.noWeather;
  return createErrorEmbed(config.title, config.description, config.footer, config.color);
}

// ------------------- Validation Functions -------------------
async function validateChannel(interaction) {
  const channelId = interaction.channelId;
  const validChannels = Object.values(VILLAGE_CHANNELS);
  
  if (!validChannels.includes(channelId)) {
    const embed = createErrorEmbed(
      '❌ Invalid Channel',
      '**This command can only be used in a village\'s town hall channel.**',
      'Channel Restriction',
      0xFF6B6B
    );
    embed.addFields([{
      name: '🏛️ Valid Town Hall Channels',
      value: `🔥 <#${VILLAGE_CHANNELS.Rudania}> (Rudania)\n💧 <#${VILLAGE_CHANNELS.Inariko}> (Inariko)\n🌱 <#${VILLAGE_CHANNELS.Vhintl}> (Vhintl)`,
      inline: false
    }]);
    embed.setTimestamp();
    
    await interaction.editReply({ embeds: [embed], ephemeral: true });
    return { valid: false, village: null };
  }

  const village = Object.entries(VILLAGE_CHANNELS).find(([_, id]) => id === channelId)?.[0];
  if (!village) {
    await interaction.editReply({ content: '❌ **Invalid town hall channel.**', ephemeral: true });
    return { valid: false, village: null };
  }

  return { valid: true, village };
}

async function validateCharacter(characterName, userId) {
  let character = await fetchCharacterByNameAndUserId(characterName, userId);
  
  if (!character) {
    const { fetchModCharacterByNameAndUserId } = require('@/database/db');
    character = await fetchModCharacterByNameAndUserId(characterName, userId);
  }

  if (!character) {
    return { valid: false, character: null };
  }

  await checkInventorySync(character);
  return { valid: true, character };
}

async function validateCharacterState(interaction, character, now) {
  const jailCheck = await enforceJail(interaction, character);
  if (jailCheck) {
    return { valid: false };
  }

  if (character.ko) {
    const embed = createKOEmbed(
      character,
      `> ${character.name} is currently KOed and cannot gather.\n> 💤 Let them rest and recover before gathering again.`
    );
    await interaction.editReply({ embeds: [embed], ephemeral: true });
    return { valid: false };
  }

  if (character.debuff?.active) {
    const debuffEndDate = new Date(character.debuff.endDate);
    if (debuffEndDate <= now) {
      character.debuff.active = false;
      character.debuff.endDate = null;
      await character.save();
    } else {
      const debuffEmbed = createGatherDebuffEmbed(character);
      await interaction.editReply({ embeds: [debuffEmbed], ephemeral: true });
      return { valid: false };
    }
  }

  return { valid: true };
}

function validateWeather(weather, village, periodBounds) {
  if (!weather) {
    return { valid: false, error: 'notFound' };
  }

  if (!weather.date || !weather.temperature || !weather.precipitation) {
    return { valid: false, error: 'invalidWeather' };
  }

  const weatherDate = weather.date instanceof Date ? weather.date : new Date(weather.date);
  
  if (weatherDate >= periodBounds.nextPeriodStart) {
    return { valid: false, error: 'futurePeriod' };
  }

  if (!weather.special) {
    return { valid: false, error: 'noSpecial' };
  }

  if (!weather.special.label) {
    return { valid: false, error: 'malformed' };
  }

  return { valid: true, weatherDate };
}

// ------------------- Weather Retrieval -------------------
async function getWeatherForVillage(village, now) {
  const { startUTC: startOfPeriodUTC } = getCurrentPeriodBounds(now);
  const { startUTC: startOfNextPeriodUTC } = getNextPeriodBounds(now);
  
  // Special weather uses DB truth for the current period (it should not depend on Discord posting success).
  const weather = await getWeatherWithoutGeneration(village);

  return { weather, periodBounds: { startOfPeriodUTC, startOfNextPeriodUTC } };
}

// ------------------- Item Selection Functions -------------------
function getSpecialWeatherFieldName(weatherLabel) {
  const specialWeatherField = weatherLabel
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
  
  return specialWeatherField === 'meteorshower' ? 'meteorShower' : specialWeatherField;
}

function getSpecialWeatherItems(items, fieldName) {
  return items.filter(item => 
    item.specialWeather && 
    item.specialWeather[fieldName] === true
  );
}

function createWarningEmbed(weather, village) {
  const warningMessages = {
    "Flood": {
      title: `🌊 **${weather.special.label} Warning**`,
      description: `**No special items to gather in ${village} during ${weather.special.label}.**\n\n⚠️ **Exercise caution when:**\n• **Traveling** - Risk of flood exposure\n\n🌊 The floodwaters create dangerous conditions. Consider waiting for the waters to recede.`
    },
    "Blight Rain": {
      title: `🌧️🧿 **${weather.special.label} Warning**`,
      description: `**No special items to gather in ${village} during ${weather.special.label}.**\n\n⚠️ **Exercise caution when:**\n• **Traveling** - Risk of blight exposure\n\n<:blight_eye:805576955725611058> The blighted rain creates dangerous conditions. Consider waiting for clearer weather.`
    },
    "Lightning Storm": {
      title: `⚡⛈️ **${weather.special.label} Warning**`,
      description: `**No special items to gather in ${village} during ${weather.special.label}.**\n\nLightning crackles across the sky in a dangerous storm! The storm is unpredictable and dangerous - any character who gathers, loots, or travels in this village today risks being struck by lightning!`
    },
    "Avalanche": {
      title: `🏔️ **${weather.special.label} Warning**`,
      description: `**No special items to gather in ${village} during ${weather.special.label}.**\n\n⚠️ **Exercise caution when:**\n• **Traveling** - Risk of avalanche exposure\n\n🏔️ The avalanche debris creates dangerous conditions. Consider waiting for safer conditions.`
    },
    "Drought": {
      title: `🌵 **${weather.special.label} Warning**`,
      description: `**No special items to gather in ${village} during ${weather.special.label}.**\n\n⚠️ **Exercise caution when:**\n• **Traveling** - Risk of dehydration\n\n🌵 The drought creates harsh conditions. Consider waiting for more favorable weather.`
    },
    "Rock Slide": {
      title: `⛏️ **${weather.special.label} Warning**`,
      description: `**No special items to gather in ${village} during ${weather.special.label}.**\n\n⚠️ **Exercise caution when:**\n• **Traveling** - Risk of rock slide exposure\n\n⛏️ The rock slide debris creates dangerous conditions. Consider waiting for safer conditions.`
    }
  };

  const warningConfig = warningMessages[weather.special.label] || {
    title: `⚠️ **${weather.special.label} Warning**`,
    description: `**No special items to gather in ${village} during ${weather.special.label}.**\n\n⚠️ **Exercise caution when:**\n• **Traveling** - Risk of weather exposure\n\n⚠️ The weather conditions create dangerous situations. Consider waiting for better conditions.`
  };

  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle(warningConfig.title)
    .setDescription(warningConfig.description)
    .setThumbnail('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setFooter({ text: `${village} Weather Advisory` })
    .setTimestamp();
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

  // Fetch item rarity from database
  let itemRarity = 1; // Default to common
  try {
    const itemFromDb = await ItemModel.findOne({ itemName: item.itemName }).select('itemRarity');
    if (itemFromDb && itemFromDb.itemRarity) {
      itemRarity = itemFromDb.itemRarity;
    }
  } catch (error) {
    console.error(`[specialweather.js]: ❌ Error fetching item rarity for ${item.itemName}:`, error);
  }

  // Add rarity to footer
  embed.setFooter({ text: `Rarity: ${itemRarity}` });

  return { embed, files: [] };
};

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
    const now = new Date();
    let channelVillage = null; // Declare at top level for error handling
    try {
      await interaction.deferReply();

      const channelValidation = await validateChannel(interaction);
      if (!channelValidation.valid) {
        return;
      }
      channelVillage = channelValidation.village;

      const characterName = interaction.options.getString('charactername');
      const characterValidation = await validateCharacter(characterName, interaction.user.id);
      if (!characterValidation.valid) {
        await interaction.editReply({
          content: `❌ **Character ${characterName} not found or does not belong to you.**`
        });
        return;
      }
      const character = characterValidation.character;

      const stateValidation = await validateCharacterState(interaction, character, now);
      if (!stateValidation.valid) {
        return;
      }

      const isModerator = ['inarikomod', 'rudaniamod', 'vhintlmod'].includes(character.name.toLowerCase());
      if ((!isModerator && !character.isModCharacter) && !canUseSpecialWeather(character, channelVillage)) {
        const embed = createErrorEmbed(
          'Period Activity Limit',
          `*${character.name} has found all the special weather had to offer in ${channelVillage} this period!*\n\n**Period special weather gathering limit reached for ${channelVillage}.**\nYou've already gathered during special weather in ${channelVillage} this period (8am–7:59am EST). Special weather events are rare and unpredictable - keep an eye out for the next one!`,
          'Period Activity Limit'
        );
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        return;
      }

      const { weather, periodBounds } = await getWeatherForVillage(channelVillage, now);
      
      if (!weather) {
        const embed = createWeatherErrorEmbed(character.name, channelVillage, 'noWeather');
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        return;
      }

      const weatherValidation = validateWeather(weather, channelVillage, periodBounds);
      if (!weatherValidation.valid) {
        const embed = createWeatherErrorEmbed(character.name, channelVillage, weatherValidation.error);
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (character.currentVillage.toLowerCase() !== channelVillage.toLowerCase()) {
        const embed = createWeatherErrorEmbed(character.name, channelVillage, 'wrongVillage');
        embed.setDescription(`${embed.data.description}\n\n🗺️ **Current Location:** ${character.currentVillage}`);
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        return;
      }

      const items = await fetchAllItems();
      const fieldName = getSpecialWeatherFieldName(weather.special.label);
      const specialWeatherItems = getSpecialWeatherItems(items, fieldName);

      if (specialWeatherItems.length === 0) {
        const warningEmbed = createWarningEmbed(weather, channelVillage);
        await interaction.editReply({ embeds: [warningEmbed] });
        return;
      }

      const weightedItems = createWeightedItemList(specialWeatherItems);
      const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];
      
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

      await syncToInventoryDatabase(character, itemToSync, interaction);

      if (!character.specialWeatherUsage) {
        character.specialWeatherUsage = new Map();
      }
      character.specialWeatherUsage.set(normalizeVillageName(channelVillage), now);
      character.markModified('specialWeatherUsage');
      await character.save();

      const { embed, files } = await createSpecialWeatherEmbed(character, randomItem, weather);
      const banner = await generateBanner(channelVillage, weather);
      if (banner) {
        embed.setImage(`attachment://${banner.name}`);
        files.push(banner);
      }

      await interaction.editReply({ embeds: [embed], files: files });

    } catch (error) {
      // Always log the error for debugging
      const characterName = interaction.options.getString('charactername') || 'Unknown';
      
      const context = {
        commandName: '/specialweather',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        characterName: characterName,
        village: channelVillage || 'Unknown',
        guildId: interaction.guildId,
        channelId: interaction.channelId
      };
      
      handleInteractionError(error, 'specialweather.js', context);

      // Create detailed error embed for all other errors
      const errorEmbed = createDetailedErrorEmbed(error, context);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } else if (interaction.deferred) {
          await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
        } else if (interaction.replied) {
          await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (replyError) {
        if (replyError.code !== 10062) {
          // Log if it's not just an expired interaction
          console.error(`[specialweather.js]: ❌ Failed to send error embed:`, replyError);
        } else {
          console.warn(`[specialweather.js]: ⚠️ Interaction expired for user ${interaction.user.tag}`);
        }
      }
    }
  },
}; 