// ============================================================================
// 🌤️ Weather Module
// Handles getting current weather data for villages
// ============================================================================

const mongoose = require('mongoose');
const Weather = require('../models/WeatherModel');
const { 
  temperatures, 
  winds, 
  precipitations, 
  specials, 
  temperatureWeights, 
  windWeights, 
  precipitationWeights, 
  specialWeights, 
  weatherWeightModifiers 
} = require('../data/weatherData');
const seasonsData = require('../data/seasonsData');
const { validateWeatherCombination } = require('../utils/weatherValidation');

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

// Helper to capitalize first letter
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Helper function to validate weight modifiers
function validateWeightModifiers(village, season, modifiers) {
  const issues = [];
  
  // Check temperature modifiers
  if (modifiers.temperature) {
    Object.entries(modifiers.temperature).forEach(([temp, mod]) => {
      if (mod < 0 || mod > 5) {
        issues.push(`Invalid temperature modifier for ${temp}: ${mod} (should be between 0 and 5)`);
      }
    });
  }
  
  // Check precipitation modifiers
  if (modifiers.precipitation) {
    Object.entries(modifiers.precipitation).forEach(([precip, mod]) => {
      if (mod < 0 || mod > 5) {
        issues.push(`Invalid precipitation modifier for ${precip}: ${mod} (should be between 0 and 5)`);
      }
    });
  }
  
  // Check special weather modifiers
  if (modifiers.special) {
    Object.entries(modifiers.special).forEach(([special, mod]) => {
      if (mod < 0 || mod > 5) {
        issues.push(`Invalid special weather modifier for ${special}: ${mod} (should be between 0 and 5)`);
      }
    });
  }
  
  if (issues.length > 0) {
    console.warn(`[weatherModule.js]: Weight modifier issues for ${village} in ${season}:`, issues);
  }
  
  return issues.length === 0;
}

// Simulate weighted weather based on village and season
function simulateWeightedWeather(village, season) {
  const seasonKey = capitalizeFirstLetter(season);
  const villageData = seasonsData[village];
  
  if (!villageData || !villageData.seasons[seasonKey]) {
    console.error(`[weatherModule.js]: No season data found for ${village} in ${seasonKey}`);
    return null;
  }

  const seasonInfo = villageData.seasons[seasonKey];
  const weightModifiers = weatherWeightModifiers[village]?.[seasonKey] || {};
  
  // Validate weight modifiers
  validateWeightModifiers(village, seasonKey, weightModifiers);
  
  // Get available options for this village and season
  const availableTemps = seasonInfo.Temperature;
  const availableWinds = seasonInfo.Wind;
  const availablePrecip = seasonInfo.Precipitation;
  const availableSpecial = seasonInfo.Special;

  // Apply weight modifiers to temperature selection
  const tempWeights = availableTemps.map(temp => {
    const baseWeight = temperatureWeights[temp] || 1;
    const modifier = weightModifiers.temperature?.[temp] || 1;
    return baseWeight * modifier;
  });
  const tempIndex = weightedRandom(availableTemps.length, tempWeights);
  const temp = availableTemps[tempIndex];
  const tempData = temperatures.find(t => t.label === temp) || { label: temp, emoji: '🌡️' };

  // Apply weight modifiers to wind selection
  const calculatedWindWeights = availableWinds.map(wind => {
    const baseWeight = windWeights[wind] || 1;
    const modifier = weightModifiers.wind?.[wind] || 1;
    return baseWeight * modifier;
  });
  const windIndex = weightedRandom(availableWinds.length, calculatedWindWeights);
  const wind = availableWinds[windIndex];
  const windData = winds.find(w => w.label === wind) || { label: wind, emoji: '💨' };

  // Apply weight modifiers to precipitation selection
  const precipWeights = availablePrecip.map(precip => {
    const baseWeight = precipitationWeights[precip] || 1;
    const modifier = weightModifiers.precipitation?.[precip] || 1;
    return baseWeight * modifier;
  });
  const precipIndex = weightedRandom(availablePrecip.length, precipWeights);
  const precip = availablePrecip[precipIndex];
  const precipData = precipitations.find(p => p.label === precip) || { label: precip, emoji: '🌧️' };

  // Apply weight modifiers to special weather selection
  let special = null;
  if (availableSpecial && availableSpecial.length > 0) {
    const calculatedSpecialWeights = availableSpecial.map(specialType => {
      const baseWeight = specialWeights[specialType] || 0.1;
      const modifier = weightModifiers.special?.[specialType] || 1;
      return baseWeight * modifier;
    });
    const specialIndex = weightedRandom(availableSpecial.length, calculatedSpecialWeights);
    const specialType = availableSpecial[specialIndex];
    const specialData = specials.find(s => s.label === specialType);
    if (specialData) {
      special = {
        label: specialData.label,
        emoji: specialData.emoji,
        probability: '10%'
      };
    }
  }

  // Calculate probabilities
  const tempProbability = calculateCandidateProbability(availableTemps, temperatureWeights, temp, weightModifiers.temperature);
  const windProbability = calculateCandidateProbability(availableWinds, windWeights, wind, weightModifiers.wind);
  const precipProbability = calculateCandidateProbability(availablePrecip, precipitationWeights, precip, weightModifiers.precipitation);
  const specialProbability = special ? calculateCandidateProbability(availableSpecial, specialWeights, special.label, weightModifiers.special) : 0;

  const result = {
    village,
    date: new Date(),
    season: season.toLowerCase(),
    temperature: {
      label: tempData.label,
      emoji: tempData.emoji,
      probability: `${tempProbability.toFixed(1)}%`
    },
    wind: {
      label: windData.label,
      emoji: windData.emoji,
      probability: `${windProbability.toFixed(1)}%`
    },
    precipitation: {
      label: precipData.label,
      emoji: precipData.emoji,
      probability: `${precipProbability.toFixed(1)}%`
    }
  };

  if (special) {
    result.special = {
      label: special.label,
      emoji: special.emoji,
      probability: `${specialProbability.toFixed(1)}%`
    };
  }

  console.log(`[weatherModule.js]: Generated weather for ${village}:`, result);
  return result;
}

// Helper function to calculate probability
function calculateCandidateProbability(candidates, weightMapping, selectedCandidate, modifierMap = {}) {
  const totalWeight = candidates.reduce((sum, candidate) => {
    const base = weightMapping[candidate] ?? 0.01;
    const mod = modifierMap?.[candidate] ?? 1;
    return sum + (base * mod);
  }, 0);
  const selectedWeight = (weightMapping[selectedCandidate] ?? 0.01) * (modifierMap?.[selectedCandidate] ?? 1);
  return (selectedWeight / totalWeight) * 100;
}

// Helper function for weighted random selection
function weightedRandom(length, weights) {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return i;
    }
  }
  
  return length - 1;
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

// Helper to get temperature based on weather and season
function getTemperatureForWeather(weather, season) {
  const baseTemps = {
    spring: { sunny: 65, cloudy: 60, rainy: 55 },
    summer: { sunny: 85, cloudy: 80, rainy: 75 },
    fall: { sunny: 70, cloudy: 65, rainy: 60 },
    winter: { sunny: 40, cloudy: 35, snowy: 30 }
  };
  
  const temp = baseTemps[season.toLowerCase()]?.[weather] || 70;
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

// ------------------- Get Weather Without Generation -------------------
// Gets the current weather for a village without generating new weather
async function getWeatherWithoutGeneration(village) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    const now = new Date();
    
    // Get today's weather
    const weather = await Weather.findOne({
      village: normalizedVillage,
      date: {
        $gte: new Date(now.setHours(0, 0, 0, 0)),
        $lt: new Date(now.setHours(23, 59, 59, 999))
      }
    });
    
    return weather;
  } catch (error) {
    console.error('[weatherModule.js]: ❌ Error getting weather:', error);
    throw error;
  }
}

// ------------------- Get Current Weather -------------------
// Gets the current weather for a village, generating new weather if needed
async function getCurrentWeather(village) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    const now = new Date();
    
    // Get today's weather
    let weather = await getWeatherWithoutGeneration(normalizedVillage);
    
    // Only generate new weather if none exists for today
    if (!weather) {
      const season = getCurrentSeason();
      const capitalizedSeason = capitalizeFirstLetter(season);
      const newWeather = simulateWeightedWeather(normalizedVillage, capitalizedSeason);
      
      if (!newWeather) {
        throw new Error(`Failed to generate weather for ${village}`);
      }
      
      // Add date and season to weather data
      newWeather.date = new Date();
      newWeather.season = season;

      // Validate weather combination before saving
      if (!validateWeatherCombination(newWeather)) {
        newWeather.special = null;
      }
      
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
  getWeatherWithoutGeneration,
  saveWeather,
  clearOldWeather,
  simulateWeightedWeather
}; 