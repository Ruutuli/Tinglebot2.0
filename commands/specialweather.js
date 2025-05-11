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
const { syncItem, SOURCE_TYPES } = require('../utils/itemSyncUtils.js');
const { getCurrentWeather } = require('../modules/weatherModule.js');

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

function generateGatherFlavorText(itemType) {
  const flavorTexts = {
    'Creature': 'A rare creature appears during this special weather!',
    'Material': 'A special material has been revealed by the weather!',
    'Plant': 'The weather has caused a unique plant to bloom!',
    'Fish': 'The weather has attracted a special fish!',
    'Insect': 'A rare insect has been drawn out by the weather!',
    'Default': 'Something special has appeared due to the weather!'
  };
  return flavorTexts[itemType] || flavorTexts.Default;
}

function getOverlayPath(condition) {
  const overlayName = OVERLAY_MAPPING[condition];
  if (!overlayName) {
    console.log(`[specialweather.js]: No overlay mapping found for condition: ${condition}`);
    return null;
  }
  
  const overlayPath = path.join(__dirname, '..', 'assets', 'overlays', `ROOTS-${overlayName}.png`);
  console.log(`[specialweather.js]: Looking for overlay at: ${overlayPath}`);
  
  if (fs.existsSync(overlayPath)) {
    console.log(`[specialweather.js]: Found PNG overlay`);
    return overlayPath;
  }
  
  console.log(`[specialweather.js]: No overlay found for ${condition}`);
  return null;
}

async function generateBanner(village, weather) {
  try {
    const bannerUrl = VILLAGE_IMAGES[village];
    if (!bannerUrl) {
      console.error(`[specialweather.js]: No banner URL found for village: ${village}`);
      return null;
    }
    const overlayPath = getOverlayPath(weather.special.label);
    console.log('[specialweather.js]: Banner URL:', bannerUrl);
    console.log('[specialweather.js]: Overlay path:', overlayPath);
    
    const bannerImg = await Jimp.read(bannerUrl);
    
    if (overlayPath) {
      const overlayImg = await Jimp.read(overlayPath);
      overlayImg.resize(bannerImg.bitmap.width, bannerImg.bitmap.height);
      bannerImg.composite(overlayImg, 0, 0, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 1,
        opacityDest: 1
      });
    }
    
    const outName = `banner-${village.toLowerCase()}.png`;
    const buffer = await bannerImg.getBufferAsync(Jimp.MIME_PNG);
    return new AttachmentBuilder(buffer, { name: outName });
  } catch (error) {
    console.error('[specialweather.js]: Error generating banner:', error);
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
  
  // Generate banner with overlay
  const banner = await generateBanner(currentVillage, weather);
  
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
  const flavorText = generateGatherFlavorText(item.type[0]);

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
      { name: 'Special Weather', value: `${weather.special.emoji} ${weather.special.label}`, inline: true },
      { name: 'Location', value: currentVillage, inline: true }
    );

  if (banner) {
    embed.setImage(`attachment://${banner.name}`);
  }

  return { embed, files: banner ? [banner] : [] };
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
    try {
      await interaction.deferReply();

      const characterName = interaction.options.getString('charactername');
      const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
      
      if (!character) {
        await interaction.editReply({
          content: `❌ **Character ${characterName} not found or does not belong to you.**`,
        });
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
        const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
        await interaction.editReply({
          content: `❌ **${character.name} is currently debuffed and cannot gather.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
          ephemeral: true,
        });
        return;
      }

      // Get current weather for the village
      const currentVillage = character.currentVillage.charAt(0).toUpperCase() + character.currentVillage.slice(1).toLowerCase();
      const weather = await getCurrentWeather(currentVillage);
      console.log('[specialweather.js]: Weather fetched:', weather);
      
      if (!weather || !weather.special) {
        await interaction.editReply({
          content: `❌ **There is no special weather in ${currentVillage} right now.**\n✨ **Special weather is required to use this command.**`,
        });
        return;
      }

      // Get special weather items
      const items = await fetchAllItems();
      
      // Convert special weather label to the corresponding field name
      const specialWeatherField = weather.special.label.toLowerCase()
        .replace(/\s+/g, '') // Remove spaces
        .replace(/[^a-z0-9]/g, ''); // Remove special characters

      // Filter items that are available for this special weather (ignoring location)
      const specialWeatherItems = items.filter(item => 
        item.specialWeather && 
        item.specialWeather[specialWeatherField] === true
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
        category: randomItem.category,
        type: randomItem.type,
        subtype: randomItem.subtype || ['None']
      };

      // Sync item using itemSyncUtils
      await syncItem(character, itemToSync, interaction, SOURCE_TYPES.GATHERING);

      // Create and send embed
      const { embed, files } = await createSpecialWeatherEmbed(character, randomItem, weather);
      await interaction.editReply({ embeds: [embed], files });

    } catch (error) {
      handleError(error, 'specialweather.js');
      console.error(`[specialweather.js]: Error during special weather gathering:`, error);
      await interaction.editReply({
        content: error.message || `⚠️ **An error occurred during special weather gathering.**`,
      });
    }
  },
}; 