// ============================================================================
// 🌤️ Weather Embed Generator
// Creates formatted embeds for weather reports with images
// ============================================================================

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { generateBanner } = require('./bannerGenerator');
const { convertToHyruleanDate } = require('../modules/calendarModule');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const VILLAGE_COLORS = {
  Rudania: 0xFF6B6B,  // Red
  Inariko: 0x4ECDC4,  // Teal
  Vhintl: 0x45B7D1    // Blue
};

const SEASON_ICONS = {
  spring: '.weather/assets/seasons/spring.png',
  summer: '.weather/assets/seasons/summer.png',
  fall: '.weather/assets/seasons/fall.png',
  winter: '.weather/assets/seasons/winter.png'
};

const VILLAGE_ICONS = {
  Rudania: '.weather/assets/icons/[RotW] village crest_rudania_.png',
  Inariko: '.weather/assets/icons/[RotW] village crest_inariko_.png',
  Vhintl: '.weather/assets/icons/[RotW] village crest_vhintl_.png'
};

// ============================================================================
// ------------------- Embed Generation -------------------
// ============================================================================

// Helper to normalize season
function normalizeSeason(season) {
  if (!season) return 'spring';
  const s = season.toLowerCase();
  if (s === 'autumn') return 'fall';
  return s;
}

// ---- Function: generateWeatherEmbed ----
// Generates a weather embed with banner
async function generateWeatherEmbed(village, weather) {
  try {
    // Normalize season for icon lookup
    const seasonKey = normalizeSeason(weather.season);
    const seasonIconPath = SEASON_ICONS[seasonKey];
    const seasonIconName = `${seasonKey}.png`;
    const seasonAttachment = new AttachmentBuilder(seasonIconPath, { name: seasonIconName });

    // Village crest icon
    const crestIconPath = VILLAGE_ICONS[village];
    const crestIconName = `crest_${village.toLowerCase()}.png`;
    const crestAttachment = new AttachmentBuilder(crestIconPath, { name: crestIconName });

    // Compose emoji summary
    const tempEmoji = weather.temperature.emoji || '🌡️';
    const windEmoji = weather.wind.emoji || '💨';
    const precipEmoji = weather.precipitation.emoji || '🌧️';
    const specialEmoji = weather.specialConditions && weather.specialConditions.length > 0 ? '✨' : '';
    const emojiSummary = `${tempEmoji}${windEmoji}${precipEmoji}${specialEmoji}`;

    // Get real and Hyrulean date
    const now = new Date();
    const realDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const hyruleanDate = convertToHyruleanDate(now);
    const dateLine = `Real Date: ${realDate}, Hyrulean Date: ${hyruleanDate}`;

    // Create base embed
    const embed = new EmbedBuilder()
      .setColor(VILLAGE_COLORS[village])
      .setTitle(`${village}'s Daily Weather Forecast`)
      .setDescription(`${emojiSummary}\n${dateLine}`)
      .setAuthor({ name: `${village} Town Hall`, iconURL: `attachment://${crestIconName}` })
      .addFields(
        { name: 'Temperature', value: weather.temperature.label || `${weather.temperature.value}°F`, inline: false },
        { name: 'Wind', value: weather.wind.label || `${weather.wind.speed} mph ${weather.wind.direction}`, inline: false },
        { name: 'Precipitation', value: weather.precipitation.label, inline: false }
      )
      .setThumbnail(`attachment://${seasonIconName}`)
      .setTimestamp();

    // Add special conditions if any
    if (weather.specialConditions && weather.specialConditions.length > 0) {
      embed.addFields({ name: 'Special', value: `✨ ${weather.specialConditions.join(', ')}` });
    }

    // Generate banner (now async)
    const banner = await generateBanner(village, weather);
    if (banner) {
      embed.setImage(`attachment://${banner.name}`);
    }
    
    // Return all attachments
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