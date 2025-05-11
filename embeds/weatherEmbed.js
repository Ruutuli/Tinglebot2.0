// ============================================================================
// 🌤️ Weather Embed Generator & Banner Generator
// Combines embed generation and banner compositing for Discord weather reports
// ============================================================================

// ---- Imports ----
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { convertToHyruleanDate } = require('../modules/calendarModule');

// ---- Constants ----
const VILLAGE_COLORS = {
  Rudania: 0xd7342a,
  Inariko: 0x277ecd,
  Vhintl: 0x25c059
};

const SEASON_ICONS = {
  spring: path.join(__dirname, '..', 'assets', 'seasons', 'spring.png'),
  summer: path.join(__dirname, '..', 'assets', 'seasons', 'summer.png'),
  fall: path.join(__dirname, '..', 'assets', 'seasons', 'fall.png'),
  winter: path.join(__dirname, '..', 'assets', 'seasons', 'winter.png')
};

const VILLAGE_ICONS = {
  Rudania: path.join(__dirname, '..', 'assets', 'icons', '[RotW] village crest_rudania_.png'),
  Inariko: path.join(__dirname, '..', 'assets', 'icons', '[RotW] village crest_inariko_.png'),
  Vhintl: path.join(__dirname, '..', 'assets', 'icons', '[RotW] village crest_vhintl_.png')
};

const BANNER_PATHS = {
  Rudania: [
    path.join(__dirname, '..', 'assets', 'banners', 'Rudania1.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Rudania2.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Rudania3.png')
  ],
  Inariko: [
    path.join(__dirname, '..', 'assets', 'banners', 'Inariko1.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Inariko2.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Inariko3.png')
  ],
  Vhintl: [
    path.join(__dirname, '..', 'assets', 'banners', 'Vhintl1.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Vhintl2.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Vhintl3.png')
  ]
};

const OVERLAY_MAPPING = {
  'Rain': 'rain',
  'Light Rain': 'rain',
  'Heavy Rain': 'rain',
  'Thunderstorm': 'thunderstorm',
  'Snow': 'snow',
  'Light Snow': 'snow',
  'Heavy Snow': 'snow',
  'Blizzard': 'blizzard',
  'Sleet': 'sleet',
  'Hail': 'hail',
  'Fog': 'fog',
  'Cloudy': 'cloudy',
  'Thundersnow': 'thundersnow',
  'Cinder Storm': 'cinderstorm',
  'Blight Rain': 'blightrain',
  'Heat Lightning': 'heatlightning',
  'Rainbow': 'rainbow',
  'Flower Bloom': 'flowerbloom',
  'Fairy Circle': 'fairycircle',
  'Meteor Shower': 'meteorshower',
  'Jubilee': 'jubilee',
  'Drought': 'drought',
  'Flood': 'flood',

};

// ---- Helper: Normalize Season ----
function normalizeSeason(season) {
  if (!season) return 'spring';
  const s = season.toLowerCase();
  if (s === 'autumn') return 'fall';
  return s;
}

// ---- Banner Generation ----
function getRandomBanner(village) {
  const banners = BANNER_PATHS[village];
  if (!banners || banners.length === 0) {
    console.error(`[weatherEmbed.js]: No banners found for village: ${village}`);
    return null;
  }
  return banners[Math.floor(Math.random() * banners.length)];
}

function getOverlayPath(condition) {
  const overlayName = OVERLAY_MAPPING[condition];
  if (!overlayName) return null;
  const overlayPath = path.join(__dirname, 'assets', 'overlays', `ROOTS-${overlayName}.png`);
  return fs.existsSync(overlayPath) ? overlayPath : null;
}

// ---- Function: generateBanner ----
// Generates a banner with optional overlay composited using Jimp
async function generateBanner(village, weather) {
  try {
    const bannerPath = getRandomBanner(village);
    if (!bannerPath) {
      console.error(`[weatherEmbed.js]: Failed to get banner for ${village}`);
      return null;
    }
    const overlayPath = getOverlayPath(weather.precipitation.label);
    
    // Add timeout to prevent infinite loops
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Image processing timeout')), 10000);
    });

    const bannerPromise = Jimp.read(bannerPath);
    const bannerImg = await Promise.race([bannerPromise, timeoutPromise]);
    
    if (overlayPath) {
      const overlayPromise = Jimp.read(overlayPath);
      const overlayImg = await Promise.race([overlayPromise, timeoutPromise]);
      
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
    }
    
    const outName = `banner-${village.toLowerCase()}.png`;
    const buffer = await bannerImg.getBufferAsync(Jimp.MIME_PNG);
    return new AttachmentBuilder(buffer, { name: outName });
  } catch (error) {
    console.error('[weatherEmbed.js]: Error generating banner:', error);
    return null;
  }
}

// ---- Function: generateWeatherEmbed ----
// Generates a weather embed with banner and all attachments
async function generateWeatherEmbed(village, weather) {
  try {
    const seasonKey = normalizeSeason(weather.season);
    const seasonIconPath = SEASON_ICONS[seasonKey];
    const seasonIconName = `${seasonKey}.png`;
    const seasonAttachment = new AttachmentBuilder(seasonIconPath, { name: seasonIconName });
    const crestIconPath = VILLAGE_ICONS[village];
    const crestIconName = `crest_${village.toLowerCase()}.png`;
    const crestAttachment = new AttachmentBuilder(crestIconPath, { name: crestIconName });
    const tempEmoji = weather.temperature.emoji || '🌡️';
    const windEmoji = weather.wind.emoji || '💨';
    const precipEmoji = weather.precipitation.emoji || '🌧️';
    const specialEmoji = weather.special && weather.special.emoji ? weather.special.emoji : '';
    const emojiSummary = `${tempEmoji}${windEmoji}${precipEmoji}${specialEmoji}`;
    const now = new Date();
    const hyruleanDate = convertToHyruleanDate(now);
    const dateLine = `**Hyrulean Date: ${hyruleanDate}**`;
    const embed = new EmbedBuilder()
      .setColor(VILLAGE_COLORS[village])
      .setTitle(`${village}'s Daily Weather Forecast`)
      .setDescription(`${emojiSummary}\n\n${dateLine}`)
      .setAuthor({ name: `${village} Town Hall`, iconURL: `attachment://${crestIconName}` })
      .addFields(
        { name: 'Temperature', value: weather.temperature.label || `${weather.temperature.value}°F`, inline: false },
        { name: 'Wind', value: weather.wind.label || `${weather.wind.speed} mph ${weather.wind.direction}`, inline: false },
        { name: 'Precipitation', value: weather.precipitation.label, inline: false }
      )
      .setThumbnail(`attachment://${seasonIconName}`)
      .setTimestamp();
    if (weather.special && weather.special.label) {
      embed.addFields({ name: 'Special', value: `✨ ${weather.special.emoji || ''} ${weather.special.label}`.trim() });
    }
    const banner = await generateBanner(village, weather);
    if (banner) {
      embed.setImage(`attachment://${banner.name}`);
    }
    const files = banner ? [banner, seasonAttachment, crestAttachment] : [seasonAttachment, crestAttachment];
    return {
      embed,
      files
    };
  } catch (error) {
    console.error('[weatherEmbed.js]: Error generating weather embed:', error);
    throw error;
  }
}

module.exports = {
  generateWeatherEmbed
}; 