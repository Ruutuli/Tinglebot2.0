// ============================================================================
// 🌤️ Weather Module
// Handles getting current weather data for villages
// ============================================================================

const mongoose = require('mongoose');
const Weather = require('../models/WeatherModel');

// Helper to capitalize village names
function normalizeVillageName(name) {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// Helper to get current season
function getCurrentSeason() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

// Helper to capitalize season names
function capitalizeSeason(season) {
  if (!season) return '';
  return season.charAt(0).toUpperCase() + season.slice(1).toLowerCase();
}

// Simulate weighted weather based on village and season
function simulateWeightedWeather(village, season) {
  // Default weather probabilities
  const weatherProbabilities = {
    spring: { sunny: 0.4, cloudy: 0.3, rainy: 0.3 },
    summer: { sunny: 0.6, cloudy: 0.2, rainy: 0.2 },
    fall: { sunny: 0.3, cloudy: 0.4, rainy: 0.3 },
    winter: { sunny: 0.2, cloudy: 0.3, snowy: 0.5 }
  };

  // Get probabilities for current season
  const probabilities = weatherProbabilities[season.toLowerCase()] || weatherProbabilities.spring;
  
  // Generate random number
  const random = Math.random();
  let cumulativeProbability = 0;
  
  // Determine weather based on probabilities
  for (const [weather, probability] of Object.entries(probabilities)) {
    cumulativeProbability += probability;
    if (random <= cumulativeProbability) {
      return {
        village,
        weather,
        temperature: getTemperatureForWeather(weather, season),
        humidity: getHumidityForWeather(weather)
      };
    }
  }
  
  // Fallback to sunny weather
  return {
    village,
    weather: 'sunny',
    temperature: getTemperatureForWeather('sunny', season),
    humidity: getHumidityForWeather('sunny')
  };
}

// Helper to get temperature based on weather and season
function getTemperatureForWeather(weather, season) {
  const baseTemps = {
    spring: { sunny: 65, cloudy: 60, rainy: 55 },
    summer: { sunny: 85, cloudy: 80, rainy: 75 },
    fall: { sunny: 70, cloudy: 65, rainy: 60 },
    winter: { sunny: 40, cloudy: 35, snowy: 30 }
  };
  
  return baseTemps[season.toLowerCase()]?.[weather] || 70;
}

// Helper to get humidity based on weather
function getHumidityForWeather(weather) {
  const humidities = {
    sunny: 40,
    cloudy: 60,
    rainy: 80,
    snowy: 70
  };
  
  return humidities[weather] || 50;
}

// ------------------- Get Current Weather -------------------
// Gets the current weather for a village, generating new weather if needed
async function getCurrentWeather(village) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    const now = new Date();
    
    // Check if we need to generate new weather (after 8 AM)
    const shouldGenerateNew = now.getHours() >= 8;
    
    // Get today's weather
    let weather = await Weather.findOne({
      village: normalizedVillage,
      date: {
        $gte: new Date(now.setHours(0, 0, 0, 0)),
        $lt: new Date(now.setHours(23, 59, 59, 999))
      }
    });
    
    // If no weather exists or it's after 8 AM, generate new weather
    if (!weather || shouldGenerateNew) {
      const season = getCurrentSeason();
      const capitalizedSeason = capitalizeSeason(season);
      console.log(`Generating new weather for ${village} in ${season} season`);
      const newWeather = simulateWeightedWeather(normalizedVillage, capitalizedSeason);
      
      // Add date and season to weather data
      newWeather.date = now;
      newWeather.season = season; // Keep lowercase for database
      
      // Save new weather
      weather = await saveWeather(newWeather);
    }
    
    return weather;
  } catch (error) {
    console.error('[weatherModule.js]: ❌ Error getting current weather:', error);
    throw error;
  }
}

// ------------------- Save Weather -------------------
// Saves weather data to the database
async function saveWeather(weatherData) {
  try {
    const weather = new Weather(weatherData);
    await weather.save();
    return weather;
  } catch (error) {
    console.error('[weatherModule.js]: ❌ Error saving weather:', error);
    throw error;
  }
}

// ------------------- Clear Old Weather -------------------
// Cleans up old weather data
async function clearOldWeather() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep last 7 days
    
    await Weather.deleteMany({
      date: { $lt: cutoffDate }
    });
  } catch (error) {
    console.error('[weatherModule.js]: Error clearing old weather:', error);
    throw error;
  }
}

module.exports = {
  getCurrentWeather,
  saveWeather,
  clearOldWeather,
  simulateWeightedWeather
}; 