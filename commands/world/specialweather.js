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
const { fetchCharacterByNameAndUserId, fetchAllItems } = require('../../database/db.js');
const ItemModel = require('../../models/ItemModel');

// ------------------- Modules -------------------
const { createWeightedItemList } = require('../../modules/rngModule.js');
const { handleInteractionError } = require('../../utils/globalErrorHandler.js');
const { syncToInventoryDatabase, SOURCE_TYPES } = require('../../utils/inventoryUtils.js');
const { getWeatherWithoutGeneration } = require('../../services/weatherService');
const WeatherService = require('../../services/weatherService');
const { enforceJail } = require('../../utils/jailCheck.js');
const { checkInventorySync } = require('../../utils/characterUtils.js');
const { createGatherDebuffEmbed } = require('../../embeds/embeds.js');

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
    'Fairy Circle': 'Mystical lights dance in a perfect circle upon the ground.',
    'Flood': 'Waters rise and overflow their banks, covering the lowlands.',
    'Flower Bloom': 'Colorful flowers bloom in great abundance across the land.',
    'Jubilee': 'Celebration fills the air as special festivities take place.',
    'Meteor Shower': 'Stars streak across the night sky in brilliant flashes.',
    'Muggy': 'Humid air clings heavy and thick, making movement sluggish.',
    'Rock Slide': 'Stones tumble down from the heights, scattering debris.'
  };
  
  return flavorTexts[weatherLabel] || 'The weather is unusual today.';
}

async function loadBannerFromCache(weatherType) {
  const cacheKey = weatherType.toLowerCase();
  const cached = bannerCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    return cached.buffer;
  }
  
  try {
    const overlayName = OVERLAY_MAPPING[weatherType] || 'default';
    const overlayPath = path.join(__dirname, '../../assets/overlays', `${overlayName}.png`);
    
    if (!fs.existsSync(overlayPath)) {
      console.warn(`Overlay not found: ${overlayPath}`);
      return null;
    }
    
    const baseImage = await Jimp.read(DEFAULT_IMAGE_URL);
    const overlay = await Jimp.read(overlayPath);
    
    // Resize overlay to match base image if needed
    if (overlay.bitmap.width !== baseImage.bitmap.width || overlay.bitmap.height !== baseImage.bitmap.height) {
      overlay.resize(baseImage.bitmap.width, baseImage.bitmap.height);
    }
    
    // Composite overlay onto base
    baseImage.composite(overlay, 0, 0, {
      mode: Jimp.BLEND_SOURCE_OVER,
      opacitySource: 0.7,
      opacityDest: 1
    });
    
    const buffer = await baseImage.getBufferAsync(Jimp.MIME_PNG);
    
    // Cache the result
    bannerCache.set(cacheKey, {
      buffer: buffer,
      timestamp: Date.now()
    });
    
    return buffer;
  } catch (error) {
    console.error(`Error loading banner for ${weatherType}:`, error);
    return null;
  }
}

// ------------------- Command Data -------------------
const data = new SlashCommandBuilder()
  .setName('specialweather')
  .setDescription('Gather special items during special weather conditions')
  .addStringOption(option =>
    option.setName('charactername')
      .setDescription('The name of the character')
      .setRequired(true)
      .setAutocomplete(true));

// ------------------- Execute Function -------------------
async function execute(interaction) {
  try {
    await interaction.deferReply();
    
    // Check if user is jailed
    const jailCheck = await enforceJail(interaction);
    if (jailCheck.jailed) {
      return interaction.editReply({ embeds: [jailCheck.embed] });
    }
    
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');
    
    // Fetch character
    let character = await fetchCharacterByNameAndUserId(characterName, userId);
    
    // If not found as regular character, try as mod character
    if (!character) {
      const { fetchModCharacterByNameAndUserId } = require('../../database/db');
      character = await fetchModCharacterByNameAndUserId(characterName, userId);
    }
    
    if (!character) {
      return interaction.editReply({ 
        content: `❌ **Character ${characterName} not found or does not belong to you.**` 
      });
    }
    
    // Check inventory sync
    const syncCheck = await checkInventorySync(character, userId);
    if (syncCheck.needsSync) {
      return interaction.editReply({ embeds: [syncCheck.embed] });
    }
    
    // Get current weather and check for special weather
    const currentWeather = await getWeatherWithoutGeneration(character.currentVillage);
    if (!currentWeather) {
      return interaction.editReply({
        content: `❌ Unable to retrieve weather information for **${character.currentVillage}**.`
      });
    }
    
    // Check if there's special weather active
    if (!currentWeather.special || !currentWeather.special.label) {
      return interaction.editReply({
        content: `❌ There is no special weather currently active in **${character.currentVillage}**. Check the weather with \`/helpwanted\` or \`/travel\`.`
      });
    }
    
    const weatherLabel = currentWeather.special.label;
    
    // Check stamina
    if (character.stats.stamina < 10) {
      const debuffEmbed = await createGatherDebuffEmbed(character, 'stamina');
      return interaction.editReply({ embeds: [debuffEmbed] });
    }
    
    // Get all items
    const allItems = await fetchAllItems();
    
    // Filter items by special weather type
    const weatherItems = allItems.filter(item => {
      if (!item.specialWeather || !Array.isArray(item.specialWeather)) {
        return false;
      }
      return item.specialWeather.includes(weatherLabel);
    });
    
    if (weatherItems.length === 0) {
      return interaction.editReply({
        content: `❌ No items are available for **${weatherLabel}** weather.`
      });
    }
    
    // Create weighted list and select item
    const weightedList = createWeightedItemList(weatherItems);
    const selectedItem = weightedList[Math.floor(Math.random() * weightedList.length)];
    
    // Deduct stamina
    character.stats.stamina -= 10;
    await character.save();
    
    // Add item to inventory
    const inventoryCollection = await require('../../database/db').getCharacterInventoryCollection();
    await syncToInventoryDatabase(
      character._id.toString(),
      selectedItem.name,
      1,
      SOURCE_TYPES.SPECIAL_WEATHER_GATHER,
      inventoryCollection
    );
    
    // Load banner image
    const bannerBuffer = await loadBannerFromCache(weatherLabel);
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle(`🌤️ Special Weather Gathering: ${weatherLabel}`)
      .setDescription(generateGatherFlavorText(weatherLabel))
      .addFields(
        { name: 'Item Found', value: `**${getArticleForItem(selectedItem.name)} ${selectedItem.name}**`, inline: false },
        { name: 'Stamina Used', value: '10', inline: true },
        { name: 'Remaining Stamina', value: character.stats.stamina.toString(), inline: true }
      )
      .setColor(VILLAGE_COLORS[character.currentVillage] || 0x3498db)
      .setFooter({ 
        text: `Village: ${character.currentVillage}`,
        iconURL: VILLAGE_IMAGES[character.currentVillage] || DEFAULT_IMAGE_URL
      })
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setTimestamp();
    
    // Prepare reply
    const replyOptions = { embeds: [embed] };
    
    // Add banner as attachment if available
    if (bannerBuffer) {
      const attachment = new AttachmentBuilder(bannerBuffer, { name: 'weather-banner.png' });
      replyOptions.files = [attachment];
      embed.setThumbnail('attachment://weather-banner.png');
    } else {
      embed.setThumbnail(selectedItem.imageUrl || DEFAULT_IMAGE_URL);
    }
    
    return interaction.editReply(replyOptions);
    
  } catch (error) {
    return handleInteractionError(interaction, error, {
      command: 'specialweather',
      userId: interaction.user.id
    });
  }
}

module.exports = {
  data,
  execute
};

