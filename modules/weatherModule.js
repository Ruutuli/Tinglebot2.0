// ============================================================================
// 🌤️ Weather Module
// Handles getting current weather data for villages
// ============================================================================

const mongoose = require('mongoose');
const TempData = require('../models/TempDataModel');

// ------------------- Weather Schema -------------------
const WeatherSchema = new mongoose.Schema({
  village: { type: String, required: true },
  date: { type: Date, required: true },
  temperature: {
    label: String,
    emoji: String,
    probability: String
  },
  wind: {
    label: String,
    emoji: String,
    probability: String
  },
  precipitation: {
    label: String,
    emoji: String,
    probability: String
  },
  special: {
    label: String,
    emoji: String,
    probability: String
  }
});

// Create index for quick lookups
WeatherSchema.index({ village: 1, date: 1 });

const Weather = mongoose.model('Weather', WeatherSchema);

// Helper to capitalize village names
function normalizeVillageName(name) {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// Helper to get cache key (YYYY-MM-DD)
function getCacheKey(date) {
  return date.toISOString().split('T')[0];
}

// ------------------- Get Current Weather -------------------
// Gets the current weather for a village, using TempData for caching
async function getCurrentWeather(village) {
  try {
    // Create date at UTC midnight for June 2nd
    const today = new Date('2025-06-02T00:00:00.000Z');
    const normalizedVillage = normalizeVillageName(village);
    const cacheKey = `weather_${normalizedVillage}_${getCacheKey(today)}`;

    // Check TempData cache first
    const cachedWeather = await TempData.findByTypeAndKey('weather', cacheKey);
    if (cachedWeather) {
      return cachedWeather.data;
    }

    // If not in cache, get from database using exact date match
    const weather = await Weather.findOne({
      village: normalizedVillage,
      date: today
    });

    if (weather) {
      // Set expiration to end of current day (UTC)
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);

      await TempData.create({
        type: 'weather',
        key: cacheKey,
        data: weather,
        expiresAt: tomorrow
      });
    }

    return weather;
  } catch (error) {
    console.error('[weatherModule.js]: ❌ Error getting current weather:', error);
    throw error;
  }
}

// ------------------- Save Weather -------------------
// Saves weather data for a village and updates TempData cache
async function saveWeather(village, weatherData) {
  try {
    // Check if this is from the correct bot
    if (weatherData.botId && weatherData.botId !== '603960955839447050') {
      console.log('[weatherModule.js]: Skipping weather save for non-main bot');
      return null;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const normalizedVillage = normalizeVillageName(village);
    const cacheKey = `weather_${normalizedVillage}_${getCacheKey(today)}`;

    // Save to database
    const savedWeather = await Weather.findOneAndUpdate(
      { village: normalizedVillage, date: today },
      { ...weatherData, village: normalizedVillage, date: today },
      { upsert: true, new: true }
    );

    // Set expiration to end of current day
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    // Update TempData cache only if we successfully saved to Weather collection
    if (savedWeather) {
      await TempData.findOneAndUpdate(
        { type: 'weather', key: cacheKey },
        {
          type: 'weather',
          key: cacheKey,
          data: savedWeather,
          expiresAt: tomorrow
        },
        { upsert: true, new: true }
      );
    }

    return savedWeather;
  } catch (error) {
    console.error('[weatherModule.js]: Error saving weather:', error);
    throw error;
  }
}

// ------------------- Clear Weather Cache -------------------
// Clears the weather cache for a specific village or all villages
async function clearWeatherCache(village = null) {
  try {
    if (village) {
      const normalizedVillage = normalizeVillageName(village);
      await TempData.deleteMany({
        type: 'weather',
        key: new RegExp(`^weather_${normalizedVillage}_`)
      });
    } else {
      await TempData.deleteMany({ type: 'weather' });
    }
  } catch (error) {
    console.error('[weatherModule.js]: Error clearing weather cache:', error);
    throw error;
  }
}

module.exports = {
  getCurrentWeather,
  saveWeather,
  clearWeatherCache
}; 