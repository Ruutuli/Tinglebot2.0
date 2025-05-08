// ============================================================================
// 🌤️ Weather Embed Generator
// Creates formatted embeds for weather reports with images
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const { generateBanner } = require('./bannerGenerator');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const VILLAGE_COLORS = {
  Rudania: 0xFF6B6B,  // Red
  Inariko: 0x4ECDC4,  // Teal
  Vhintl: 0x45B7D1    // Blue
};

const SEASON_ICONS = {
  spring: './assets/seasons/spring.png',
  summer: './assets/seasons/summer.png',
  fall: './assets/seasons/fall.png',
  winter: './assets/seasons/winter.png'
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
    // Create base embed
    const embed = new EmbedBuilder()
      .setColor(VILLAGE_COLORS[village])
      .setTitle(`${village} Weather Report`)
      .setDescription(`Current weather conditions for ${village}`)
      .addFields(
        { name: '🌡️ Temperature', value: weather.temperature.label || `${weather.temperature.value}°F`, inline: true },
        { name: '💨 Wind', value: weather.wind.label || `${weather.wind.speed} mph ${weather.wind.direction}`, inline: true },
        { name: '💧 Precipitation', value: weather.precipitation.label, inline: true }
      )
      .setThumbnail(SEASON_ICONS[seasonKey])
      .setTimestamp();

    // Add special conditions if any
    if (weather.specialConditions && weather.specialConditions.length > 0) {
      embed.addFields({ name: '⚠️ Special Conditions', value: weather.specialConditions.join(', ') });
    }

    // Generate banner (now async)
    const banner = await generateBanner(village, weather);
    if (banner) {
      embed.setImage(`attachment://${banner.name}`);
    }
    
    return {
      embed,
      files: banner ? [banner] : []
    };
  } catch (error) {
    console.error('[weatherEmbed.js]: Error generating weather embed:', error);
    throw error;
  }
}

module.exports = {
  generateWeatherEmbed
}; 