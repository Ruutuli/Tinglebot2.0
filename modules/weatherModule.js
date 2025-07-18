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
const {
  parseFahrenheit,
  parseWind,
  getPrecipitationLabel,
  getSpecialCondition
} = require('../handlers/weatherHandler');

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

// ------------------- Smoothing Helpers -------------------
// Filters temperature options close to the previous temperature.
function getSmoothTemperatureChoices(currentTempF, seasonTemps, forceDrop = false) {
  // Increase maxDelta to allow more temperature variation
  const maxDelta = forceDrop ? 0 : 20; // Changed from 10 to 20
  return seasonTemps.filter(label => {
    const temp = parseFahrenheit(label);
    return temp !== null && Math.abs(temp - currentTempF) <= maxDelta;
  });
}
// Restricts wind options to adjacent values in the wind ranking.
function getSmoothWindChoices(currentWindLabel, seasonWinds) {
  const index = seasonWinds.indexOf(currentWindLabel);
  return [index - 1, index, index + 1]
    .filter(i => i >= 0 && i < seasonWinds.length)
    .map(i => seasonWinds[i]);
}
// Chooses temperature with smoothing and modifiers.
function getSmoothedTemperature(tempOptions, previous, hadStormYesterday, weightMap, modifierMap) {
  const prevTemp = parseFahrenheit(previous?.temperature?.label);
  const filtered = previous?.temperature?.label
    ? getSmoothTemperatureChoices(prevTemp, tempOptions, hadStormYesterday)
    : tempOptions;
  
  // Ensure we have valid temperature options
  if (!filtered || filtered.length === 0) {
    console.warn(`[weatherModule.js]: No valid temperature options found, using original options`);
    return safeWeightedChoice(tempOptions, weightMap, modifierMap);
  }
  
  return safeWeightedChoice(filtered, weightMap, modifierMap);
}
// Chooses wind with smoothing and modifiers.
function getSmoothedWind(windOptions, previous, weightMap) {
  const filtered = previous?.wind?.label
    ? getSmoothWindChoices(previous.wind?.label, windOptions)
    : windOptions;
  return safeWeightedChoice(filtered, weightMap);
}

// Refactored simulateWeightedWeather to use DB-backed history
async function simulateWeightedWeather(village, season) {
  const seasonKey = capitalizeFirstLetter(season);
  const villageData = seasonsData[village];
  if (!villageData || !villageData.seasons[seasonKey]) {
    console.error(`[weatherModule.js]: No season data found for ${village} in ${seasonKey}`);
    return null;
  }
  const seasonInfo = villageData.seasons[seasonKey];
  const weightModifiers = weatherWeightModifiers[village]?.[seasonKey] || {};
  validateWeightModifiers(village, seasonKey, weightModifiers);
  
  // Fetch last 3 weather entries for smoothing
  const history = await Weather.getRecentWeather(village, 3);
  const previous = history[0] || {};
  const secondPrevious = history[1] || {};
  const cloudyStreak = [previous, secondPrevious]
    .filter(w => ['Cloudy', 'Partly cloudy'].includes(w?.precipitation?.label))
    .length;
  const rainStreak = history.slice(0, 3)
    .filter(w => ['Rain', 'Light Rain', 'Heavy Rain', 'Thunderstorm']
    .includes(w?.precipitation?.label))
    .length;
  const hadStormYesterday = ['Thunderstorm', 'Heavy Rain'].includes(previous.precipitation?.label);
  
  // Temperature
  const temperatureLabel = getSmoothedTemperature(
    seasonInfo.Temperature,
    previous,
    hadStormYesterday,
    temperatureWeights,
    weightModifiers.temperature || {}
  );
  
  const simTemp = parseFahrenheit(temperatureLabel);
  
  // Wind
  const windLabel = getSmoothedWind(
    seasonInfo.Wind,
    previous,
    windWeights
  );
  const simWind = parseWind(windLabel);
  
  // Precipitation
  const precipitationLabel = getPrecipitationLabel(
    seasonInfo,
    simTemp,
    simWind,
    cloudyStreak,
    precipitationWeights,
    weightModifiers.precipitation || {}
  );
  
  // Validate that we have valid labels
  if (!temperatureLabel || !windLabel || !precipitationLabel) {
    console.error(`[weatherModule.js]: Failed to generate weather labels for ${village}`);
    return null;
  }
  
  // Special weather
  let specialLabel = null;
  let special = null;
  
  if (seasonInfo.Special.length) {
    specialLabel = getSpecialCondition(
      seasonInfo,
      simTemp,
      simWind,
      precipitationLabel,
      rainStreak,
      specialWeights,
      weightModifiers.special || {}
    );
    
    if (specialLabel) {
      const specialObj = specials.find(s => s.label === specialLabel);
      special = {
        label: specialObj.label,
        emoji: specialObj.emoji,
        probability: '10%'
      };
    }
  }
  
  // Probabilities
  const tempProbability = calculateCandidateProbability(seasonInfo.Temperature, temperatureWeights, temperatureLabel, weightModifiers.temperature);
  const windProbability = calculateCandidateProbability(seasonInfo.Wind, windWeights, windLabel, weightModifiers.wind);
  const precipProbability = calculateCandidateProbability(seasonInfo.Precipitation, precipitationWeights, precipitationLabel, weightModifiers.precipitation);
  const specialProbability = special ? calculateCandidateProbability(seasonInfo.Special, specialWeights, special.label, weightModifiers.special) : 0;
  
  const result = {
    village,
    date: new Date(),
    season: season.toLowerCase(),
    temperature: {
      label: temperatureLabel,
      emoji: temperatures.find(t => t.label === temperatureLabel)?.emoji || '🌡️',
      probability: `${tempProbability.toFixed(1)}%`
    },
    wind: {
      label: windLabel,
      emoji: winds.find(w => w.label === windLabel)?.emoji || '💨',
      probability: `${windProbability.toFixed(1)}%`
    },
    precipitation: {
      label: precipitationLabel,
      emoji: precipitations.find(p => p.label === precipitationLabel)?.emoji || '🌧️',
      probability: `${precipProbability.toFixed(1)}%`
    }
  };
  
  // Validate the result object
  if (!result.temperature.label || !result.wind.label || !result.precipitation.label) {
    console.error(`[weatherModule.js]: Invalid weather result object:`, result);
    return null;
  }
  
  if (special) {
    result.special = {
      label: special.label,
      emoji: special.emoji,
      probability: `${specialProbability.toFixed(1)}%`
    };
  }
  

  
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

// Safe weighted choice function that never returns undefined
function safeWeightedChoice(candidates, weightMapping, modifierMap = {}) {
  if (!candidates || candidates.length === 0) {
    console.error('[weatherModule.js]: No candidates provided to weightedChoice');
    return null;
  }
  
  let totalWeight = 0;
  const weightedCandidates = candidates.map(candidate => {
    const baseWeight = weightMapping[candidate] ?? 0.01;
    const modifier = modifierMap[candidate] ?? 1;
    const weight = baseWeight * modifier;
    totalWeight += weight;
    return { candidate, weight };
  });

  if (totalWeight <= 0) {
    console.warn('[weatherModule.js]: Total weight is 0 or negative, selecting random candidate');
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  let threshold = Math.random() * totalWeight;
  for (const { candidate, weight } of weightedCandidates) {
    threshold -= weight;
    if (threshold < 0) {
      return candidate;
    }
  }
  
  // Fallback to last candidate if something goes wrong
  const result = candidates[candidates.length - 1];
  if (!result) {
    console.error('[weatherModule.js]: Failed to select candidate, returning first option');
    return candidates[0];
  }
  
  return result;
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
  
  return humidities[weather] || 50;
}

// ------------------- Get Weather Without Generation -------------------
// Gets the current weather for a village without generating new weather
async function getWeatherWithoutGeneration(village) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    
    // Get current time in EST/EDT
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    // Calculate the start of the current weather period (8am EST/EDT of the current day)
    const startOfPeriod = new Date(estTime);
    startOfPeriod.setHours(8, 0, 0, 0);
    
    // If current time is before 8am EST/EDT, use previous day's 8am as start
    if (estTime.getHours() < 8) {
      startOfPeriod.setDate(startOfPeriod.getDate() - 1);
    }
    
    // Calculate the end of the current weather period (7:59:59 AM EST/EDT of the next day)
    const endOfPeriod = new Date(startOfPeriod);
    endOfPeriod.setDate(endOfPeriod.getDate() + 1);
    endOfPeriod.setHours(7, 59, 59, 999);
    
    // Convert EST/EDT times to UTC for database query
    const startOfPeriodUTC = new Date(startOfPeriod.getTime() - (startOfPeriod.getTimezoneOffset() * 60000));
    const endOfPeriodUTC = new Date(endOfPeriod.getTime() - (endOfPeriod.getTimezoneOffset() * 60000));
    
    // Get weather from the current period
    const weather = await Weather.findOne({
      village: normalizedVillage,
      date: {
        $gte: startOfPeriodUTC,
        $lte: endOfPeriodUTC
      }
    });
    
    if (!weather) {
      return null;
    }
    
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
    
    // Get current time in EST/EDT
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    // Calculate the start of the current weather period (8am EST/EDT of the current day)
    const startOfPeriod = new Date(estTime);
    startOfPeriod.setHours(8, 0, 0, 0);
    
    // If current time is before 8am EST/EDT, use previous day's 8am as start
    if (estTime.getHours() < 8) {
      startOfPeriod.setDate(startOfPeriod.getDate() - 1);
    }
    
    // Calculate the end of the current weather period (7:59:59 AM EST/EDT of the next day)
    const endOfPeriod = new Date(startOfPeriod);
    endOfPeriod.setDate(endOfPeriod.getDate() + 1);
    endOfPeriod.setHours(7, 59, 59, 999);
    
    // Convert EST/EDT times to UTC for database query
    const startOfPeriodUTC = new Date(startOfPeriod.getTime() - (startOfPeriod.getTimezoneOffset() * 60000));
    const endOfPeriodUTC = new Date(endOfPeriod.getTime() - (endOfPeriod.getTimezoneOffset() * 60000));
    
    // Get weather from the current period
    console.log(`[weatherModule.js]: 🔍 Searching for existing weather for ${normalizedVillage}`);
    console.log(`[weatherModule.js]: 📅 Search period: ${startOfPeriodUTC.toISOString()} to ${endOfPeriodUTC.toISOString()}`);
    
    let weather = await Weather.findOne({
      village: normalizedVillage,
      date: {
        $gte: startOfPeriodUTC,
        $lte: endOfPeriodUTC
      }
    });
    
    if (weather) {
      console.log(`[weatherModule.js]: ✅ Found existing weather for ${normalizedVillage}:`, {
        id: weather._id,
        date: weather.date,
        temperature: weather.temperature?.label,
        precipitation: weather.precipitation?.label,
        special: weather.special?.label || 'None'
      });
    } else {
      console.log(`[weatherModule.js]: ❌ No existing weather found for ${normalizedVillage}`);
    }
    
    // Only generate new weather if none exists for the current period
    if (!weather) {
      console.log(`[weatherModule.js]: 🌤️ No existing weather found for ${normalizedVillage}, generating new weather`);
      const season = getCurrentSeason();
      const capitalizedSeason = capitalizeFirstLetter(season);
      console.log(`[weatherModule.js]: 📅 Current season: ${season}, capitalized: ${capitalizedSeason}`);
      
      // Try to generate valid weather with retry limit
      let newWeather = null;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        attempts++;
        console.log(`[weatherModule.js]: 🔄 Attempt ${attempts} to generate weather for ${normalizedVillage}`);
        newWeather = await simulateWeightedWeather(normalizedVillage, capitalizedSeason);
        
        if (!newWeather) {
          console.error(`[weatherModule.js]: Failed to generate weather for ${village} on attempt ${attempts}`);
          if (attempts === maxAttempts) {
            throw new Error(`Failed to generate weather for ${village} after ${maxAttempts} attempts`);
          }
          continue;
        }
        
        console.log(`[weatherModule.js]: ✅ Weather generated successfully on attempt ${attempts}:`, {
          temperature: newWeather.temperature?.label,
          wind: newWeather.wind?.label,
          precipitation: newWeather.precipitation?.label,
          special: newWeather.special?.label || 'None'
        });
        
        // Add date and season to weather data
        newWeather.date = new Date();
        newWeather.season = season;

        // Validate weather combination
        if (validateWeatherCombination(newWeather)) {
          break;
        } else {
          if (attempts === maxAttempts) {
            console.warn(`[weatherModule.js]: Failed to generate valid weather after ${maxAttempts} attempts, removing special weather`);
            newWeather.special = null;
          }
        }
      }
      
      // If all attempts failed, create fallback weather
      if (!newWeather) {
        console.warn(`[weatherModule.js]: Creating fallback weather for ${normalizedVillage}`);
        newWeather = {
          village: normalizedVillage,
          date: new Date(),
          season: season,
          temperature: {
            label: '72°F / 22°C - Perfect',
            emoji: '🌡️',
            probability: '100%'
          },
          wind: {
            label: '2 - 12(km/h) // Breeze',
            emoji: '💨',
            probability: '100%'
          },
          precipitation: {
            label: 'Sunny',
            emoji: '☀️',
            probability: '100%'
          }
        };
      }
      
      // Save new weather
      console.log(`[weatherModule.js]: 💾 About to save new weather for ${normalizedVillage}`);
      weather = await saveWeather(newWeather);
      console.log(`[weatherModule.js]: ✅ Weather saved and retrieved:`, {
        id: weather._id,
        village: weather.village,
        date: weather.date,
        temperature: weather.temperature?.label,
        precipitation: weather.precipitation?.label,
        special: weather.special?.label || 'None'
      });
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
    console.log(`[weatherModule.js]: 🔄 Attempting to save weather for ${weatherData.village}`);
    console.log(`[weatherModule.js]: 📊 Weather data to save:`, {
      village: weatherData.village,
      date: weatherData.date,
      season: weatherData.season,
      temperature: weatherData.temperature?.label,
      wind: weatherData.wind?.label,
      precipitation: weatherData.precipitation?.label,
      special: weatherData.special?.label || 'None'
    });
    
    // Check database connection
    console.log(`[weatherModule.js]: 🔌 Checking database connection...`);
    console.log(`[weatherModule.js]: 📡 Mongoose connection state: ${mongoose.connection.readyState}`);
    console.log(`[weatherModule.js]: 🗄️ Database name: ${mongoose.connection.name}`);
    
    const weather = new Weather(weatherData);
    console.log(`[weatherModule.js]: ✅ Weather model created successfully`);
    
    const savedWeather = await weather.save();
    console.log(`[weatherModule.js]: ✅ Weather saved successfully to database`);
    console.log(`[weatherModule.js]: 📝 Saved weather ID: ${savedWeather._id}`);
    
    return savedWeather;
  } catch (error) {
    console.error('[weatherModule.js]: ❌ Error saving weather:', error);
    console.error('[weatherModule.js]: ❌ Error details:', {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack
    });
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