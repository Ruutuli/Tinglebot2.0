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
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();
  
  // Spring: March 20 - June 19
  // Summer: June 20 - September 21
  // Fall: September 22 - December 20
  // Winter: December 21 - March 19
  
  if (month === 2 && day >= 20 || month === 3 || month === 4 || month === 5 && day < 20) {
    return 'spring';
  }
  if (month === 5 && day >= 20 || month === 6 || month === 7 || month === 8 && day < 22) {
    return 'summer';
  }
  if (month === 8 && day >= 22 || month === 9 || month === 10 || month === 11 && day < 21) {
    return 'fall';
  }
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
  console.log(`[weatherModule.js]: Weather probabilities for ${village} in ${season}:`, probabilities);
  
  // Generate random number
  const random = Math.random();
  let cumulativeProbability = 0;
  
  // Determine weather based on probabilities
  for (const [weather, probability] of Object.entries(probabilities)) {
    cumulativeProbability += probability;
    if (random <= cumulativeProbability) {
      const temp = getTemperatureForWeather(weather, season);
      const result = {
        village,
        temperature: {
          label: `${temp}°F`,
          emoji: '🌡️',
          probability: '100%'
        },
        wind: {
          label: `${getWindSpeed(weather)} mph ${getWindDirection()}`,
          emoji: '💨',
          probability: '100%'
        },
        precipitation: {
          label: capitalizeFirstLetter(weather),
          emoji: getWeatherEmoji(weather),
          probability: '100%'
        },
        season: season.toLowerCase()
      };
      console.log(`[weatherModule.js]: Generated weather for ${village}:`, result);
      return result;
    }
  }
  
  // Fallback to sunny weather
  const temp = getTemperatureForWeather('sunny', season);
  const fallback = {
    village,
    temperature: {
      label: `${temp}°F`,
      emoji: '🌡️',
      probability: '100%'
    },
    wind: {
      label: `${getWindSpeed('sunny')} mph ${getWindDirection()}`,
      emoji: '💨',
      probability: '100%'
    },
    precipitation: {
      label: 'Sunny',
      emoji: '☀️',
      probability: '100%'
    },
    season: season.toLowerCase()
  };
  console.log(`[weatherModule.js]: Using fallback weather for ${village}:`, fallback);
  return fallback;
}

// Helper to get wind speed based on weather
function getWindSpeed(weather) {
  const speeds = {
    sunny: 5,
    cloudy: 8,
    rainy: 12,
    snowy: 15
  };
  return speeds[weather] || 5;
}

// Helper to get random wind direction
function getWindDirection() {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.floor(Math.random() * directions.length)];
}

// Helper to get weather emoji
function getWeatherEmoji(weather) {
  const emojis = {
    sunny: '☀️',
    cloudy: '☁️',
    rainy: '🌧️',
    snowy: '❄️'
  };
  return emojis[weather] || '☀️';
}

// Helper to capitalize first letter
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Helper to get temperature based on weather and season
function getTemperatureForWeather(weather, season) {
  const baseTemps = {
    spring: { sunny: 65, cloudy: 60, rainy: 55 },
    summer: { sunny: 85, cloudy: 80, rainy: 75 },
    fall: { sunny: 70, cloudy: 65, rainy: 60 },
    winter: { sunny: 40, cloudy: 35, snowy: 30 }
  };
  
  const temp = baseTemps[season.toLowerCase()]?.[weather] || 70;
  console.log(`[weatherModule.js]: Temperature for ${weather} in ${season}: ${temp}°F`);
  return temp;
}

// Helper to get humidity based on weather
function getHumidityForWeather(weather) {
  const humidities = {
    sunny: 40,
    cloudy: 60,
    rainy: 80,
    snowy: 70
  };
  
  const humidity = humidities[weather] || 50;
  console.log(`[weatherModule.js]: Humidity for ${weather}: ${humidity}%`);
  return humidity;
}

// ------------------- Get Current Weather -------------------
// Gets the current weather for a village, generating new weather if needed
async function getCurrentWeather(village) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    const now = new Date();
    
    // Check if we need to generate new weather (after 8 AM)
    const shouldGenerateNew = now.getHours() >= 8;
    console.log(`[weatherModule.js]: Checking weather for ${village} (normalized: ${normalizedVillage})`);
    console.log(`[weatherModule.js]: Should generate new weather: ${shouldGenerateNew}`);
    
    // Get today's weather
    let weather = await Weather.findOne({
      village: normalizedVillage,
      date: {
        $gte: new Date(now.setHours(0, 0, 0, 0)),
        $lt: new Date(now.setHours(23, 59, 59, 999))
      }
    });
    
    console.log(`[weatherModule.js]: Found existing weather:`, weather);
    
    // If no weather exists or it's after 8 AM, generate new weather
    if (!weather || shouldGenerateNew) {
      const season = getCurrentSeason();
      const capitalizedSeason = capitalizeSeason(season);
      console.log(`[weatherModule.js]: Generating new weather for ${village} in ${season} season`);
      const newWeather = simulateWeightedWeather(normalizedVillage, capitalizedSeason);
      
      // Add date and season to weather data
      newWeather.date = new Date();
      newWeather.season = season;
      
      console.log(`[weatherModule.js]: Saving new weather data:`, newWeather);
      
      // Save new weather
      weather = await saveWeather(newWeather);
      console.log(`[weatherModule.js]: Saved weather data:`, weather);
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