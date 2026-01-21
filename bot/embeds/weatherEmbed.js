// ============================================================================
// 🌤️ Weather Embed Generator
// Uses unified weather service for banner generation and embed creation
// ============================================================================

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { convertToHyruleanDate } = require('../modules/calendarModule');
const WeatherService = require('@app/shared/services/weatherService');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const VILLAGE_COLORS = {
  Rudania: 0xd7342a,
  Inariko: 0x277ecd,
  Vhintl: 0x25c059
};

const SEASON_ICONS = {
  spring: require('path').join(__dirname, '..', 'assets', 'seasons', 'spring.png'),
  summer: require('path').join(__dirname, '..', 'assets', 'seasons', 'summer.png'),
  fall: require('path').join(__dirname, '..', 'assets', 'seasons', 'fall.png'),
  winter: require('path').join(__dirname, '..', 'assets', 'seasons', 'winter.png')
};

const VILLAGE_ICONS = {
  Rudania: require('path').join(__dirname, '..', 'assets', 'icons', '[RotW] village crest_rudania_.png'),
  Inariko: require('path').join(__dirname, '..', 'assets', 'icons', '[RotW] village crest_inariko_.png'),
  Vhintl: require('path').join(__dirname, '..', 'assets', 'icons', '[RotW] village crest_vhintl_.png')
};

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Season Normalizer -------------------
function normalizeSeason(season) {
  if (!season) return 'spring';
  const s = season.toLowerCase();
  if (s === 'autumn') return 'fall';
  return s;
}

// ============================================================================
// ------------------- Weather Embed Generator -------------------
// ============================================================================

// ------------------- Generate Weather Embed -------------------
// Generates a weather embed with banner and all attachments using unified service
async function generateWeatherEmbed(village, weather, options = {}) {
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
        { name: 'Temperature', value: weather.temperature?.label || `${weather.temperature?.value || 'N/A'}°F`, inline: false },
        { name: 'Wind', value: weather.wind?.label || `${weather.wind?.speed || 'N/A'} mph ${weather.wind?.direction || 'N/A'}`, inline: false },
        { name: 'Precipitation', value: weather.precipitation?.label || 'N/A', inline: false }
      )
      .setThumbnail(`attachment://${seasonIconName}`)
      .setTimestamp();

    if (weather.special && weather.special.label) {
      const specialText = WeatherService.specialWeatherFlavorText(weather.special.label);
      embed.addFields({ 
        name: 'Special Weather', 
        value: `✨ ${weather.special.emoji || ''} ${weather.special.label}\n\n${specialText}`.trim() 
      });
    }

    // Use unified banner generation service
    const banner = await WeatherService.generateBanner(village, weather, options);
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

// ============================================================================
// ------------------- Exports -------------------
// ============================================================================

module.exports = {
  generateWeatherEmbed
}; 