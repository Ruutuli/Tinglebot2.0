// ============================================================================
// 🌤️ Weather Module
// Handles getting current weather data for villages
// ============================================================================

const mongoose = require('mongoose');

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

// ------------------- Get Current Weather -------------------
// Gets the current weather for a village
async function getCurrentWeather(village) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const normalizedVillage = normalizeVillageName(village);
    const weather = await Weather.findOne({
      village: normalizedVillage,
      date: today
    });
    return weather;
  } catch (error) {
    console.error('[weatherModule.js]: Error getting current weather:', error);
    throw error;
  }
}

// ------------------- Save Weather -------------------
// Saves weather data for a village
async function saveWeather(village, weatherData) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const normalizedVillage = normalizeVillageName(village);
    await Weather.findOneAndUpdate(
      { village: normalizedVillage, date: today },
      { ...weatherData, village: normalizedVillage, date: today },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error('[weatherModule.js]: Error saving weather:', error);
    throw error;
  }
}

module.exports = {
  getCurrentWeather,
  saveWeather
}; 