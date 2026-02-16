// ============================================================================
// 🌤️ Weather Service
// Unified service layer for all weather operations
// Consolidates weather generation, retrieval, and banner creation
// ============================================================================

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

// Node.js built-ins
const fs = require('fs');
const path = require('path');

// Discord.js
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');

// Third-party
const Jimp = require('jimp');
const mongoose = require('mongoose');

// Local modules
const Weather = require('../models/WeatherModel');
const { convertToHyruleanDate } = require('../modules/calendarModule');
const { 
  checkNumericCondition, 
  findWeatherEmoji, 
  parseFahrenheit, 
  parseWind, 
  precipitationMatches, 
  validateWeatherCombination 
} = require('../utils/weatherValidation');

// Data files
const { 
  precipitations, 
  precipitationWeights, 
  specials, 
  specialWeights, 
  temperatureWeights, 
  temperatures, 
  weatherWeightModifiers, 
  windWeights, 
  winds 
} = require('../data/weatherData');
const seasonsData = require('../data/seasonsData');

// Optional memory monitor
let memoryMonitor = null;
try {
  const { getMemoryMonitor } = require('../utils/memoryMonitor');
  memoryMonitor = getMemoryMonitor();
} catch (err) {
  // Memory monitor not available, continue without it
}

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

// ------------------- Path Helpers ------------------
// Get asset path helper -
function getAssetPath(subpath) {
  return path.join(__dirname, '..', 'assets', subpath);
}

const VILLAGE_COLORS = {
  Rudania: 0xd7342a,
  Inariko: 0x277ecd,
  Vhintl: 0x25c059
};

const SEASON_ICONS = {
  spring: getAssetPath('seasons/spring.png'),
  summer: getAssetPath('seasons/summer.png'),
  fall: getAssetPath('seasons/fall.png'),
  winter: getAssetPath('seasons/winter.png')
};

const VILLAGE_ICONS = {
  Rudania: getAssetPath('icons/[RotW] village crest_rudania_.png'),
  Inariko: getAssetPath('icons/[RotW] village crest_inariko_.png'),
  Vhintl: getAssetPath('icons/[RotW] village crest_vhintl_.png')
};

const BANNER_PATHS = {
  Rudania: [
    getAssetPath('banners/Rudania1.png'),
    getAssetPath('banners/Rudania2.png'),
    getAssetPath('banners/Rudania3.png')
  ],
  Inariko: [
    getAssetPath('banners/Inariko1.png'),
    getAssetPath('banners/Inariko2.png'),
    getAssetPath('banners/Inariko3.png')
  ],
  Vhintl: [
    getAssetPath('banners/Vhintl1.png'),
    getAssetPath('banners/Vhintl2.png'),
    getAssetPath('banners/Vhintl3.png')
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
  'Lightning Storm': 'thunderstorm',
};


// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

// ------------------- Helper Functions ------------------
// Normalize village name to proper case -
function normalizeVillageName(name) {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// Get current season based on date -
function getCurrentSeason(referenceDate = new Date()) {
  const month = referenceDate.getMonth() + 1;
  const day = referenceDate.getDate();
  
  // Spring: March 21 - June 20
  if (month === 3 && day >= 21) return 'spring';
  if (month >= 4 && month <= 5) return 'spring';
  if (month === 6 && day <= 20) return 'spring';
  
  // Summer: June 21 - September 20
  if (month === 6 && day >= 21) return 'summer';
  if (month >= 7 && month <= 8) return 'summer';
  if (month === 9 && day <= 20) return 'summer';
  
  // Fall: September 21 - December 20
  if (month === 9 && day >= 21) return 'fall';
  if (month >= 10 && month <= 11) return 'fall';
  if (month === 12 && day <= 20) return 'fall';
  
  // Winter: December 21 - March 20
  return 'winter';
}

function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

function normalizeSeason(season) {
  if (!season) return 'spring';
  const s = season.toLowerCase();
  if (s === 'autumn') return 'fall';
  if (s === 'fall') return 'fall';
  return s;
}

// Get current period bounds (1pm UTC to 12:59pm UTC next day) -
function getCurrentPeriodBounds(referenceDate = new Date()) {
  // Validate input
  if (!(referenceDate instanceof Date) || isNaN(referenceDate.getTime())) {
    console.error('[weatherService.js]❌ Invalid referenceDate provided to getCurrentPeriodBounds:', referenceDate);
    referenceDate = new Date(); // Fallback to now
  }

  // Weather day is 1pm UTC (13:00) to 12:59pm UTC (12:59:59) the next day
  const currentHour = referenceDate.getUTCHours();
  const currentMinute = referenceDate.getUTCMinutes();
  const currentYear = referenceDate.getUTCFullYear();
  const currentMonth = referenceDate.getUTCMonth();
  const currentDay = referenceDate.getUTCDate();

  let startUTC, endUTC;

  if (currentHour > 13 || (currentHour === 13 && currentMinute >= 0)) {
    // If it's 1:00pm UTC or later, period started at 1:00pm UTC today
    startUTC = new Date(Date.UTC(currentYear, currentMonth, currentDay, 13, 0, 0, 0));
    // End is 12:59:59pm UTC tomorrow
    endUTC = new Date(Date.UTC(currentYear, currentMonth, currentDay + 1, 12, 59, 59, 999));
  } else {
    // If it's before 1:00pm UTC, period started at 1:00pm UTC yesterday
    startUTC = new Date(Date.UTC(currentYear, currentMonth, currentDay - 1, 13, 0, 0, 0));
    // End is 12:59:59pm UTC today
    endUTC = new Date(Date.UTC(currentYear, currentMonth, currentDay, 12, 59, 59, 999));
  }

  // Validate calculated bounds
  if (isNaN(startUTC.getTime()) || isNaN(endUTC.getTime())) {
    console.error('[weatherService.js]❌ Invalid period bounds calculated', {
      referenceDate: referenceDate.toISOString(),
      startUTC: startUTC.toISOString(),
      endUTC: endUTC.toISOString()
    });
    throw new Error('Failed to calculate valid period bounds');
  }

  // Sanity check: end should be after start
  if (endUTC <= startUTC) {
    console.error('[weatherService.js]❌ Period bounds validation failed: end <= start', {
      startUTC: startUTC.toISOString(),
      endUTC: endUTC.toISOString()
    });
    throw new Error('Invalid period bounds: end time is not after start time');
  }

  return {
    startUTC,
    endUTC
  };
}

// Get next period bounds -
function getNextPeriodBounds(referenceDate = new Date()) {
  // Derive from current period + 24h so "next" is always the period after the current one.
  // Matches getCurrentPeriodBounds (including the "before 8 AM" adjustment).
  const current = getCurrentPeriodBounds(referenceDate);
  const msPerDay = 24 * 60 * 60 * 1000;

  const nextStartUTC = new Date(current.startUTC.getTime() + msPerDay);
  const nextEndUTC = new Date(current.endUTC.getTime() + msPerDay);

  // Validate calculated bounds
  if (isNaN(nextStartUTC.getTime()) || isNaN(nextEndUTC.getTime())) {
    console.error('[weatherService.js]❌ Invalid next period bounds calculated', {
      referenceDate: referenceDate.toISOString(),
      nextStartUTC: nextStartUTC.toISOString(),
      nextEndUTC: nextEndUTC.toISOString()
    });
    throw new Error('Failed to calculate valid next period bounds');
  }

  // Sanity check: next period should be after current period
  if (nextStartUTC <= current.startUTC || nextEndUTC <= current.endUTC) {
    console.error('[weatherService.js]❌ Next period bounds validation failed', {
      currentStart: current.startUTC.toISOString(),
      currentEnd: current.endUTC.toISOString(),
      nextStart: nextStartUTC.toISOString(),
      nextEnd: nextEndUTC.toISOString()
    });
    throw new Error('Invalid next period bounds: next period is not after current period');
  }

  return {
    startUTC: nextStartUTC,
    endUTC: nextEndUTC
  };
}

// Find weather for specified period -
async function findWeatherForPeriod(village, startUTC, endUTC, options = {}) {
  const { exclusiveEnd = false, onlyPosted = false } = options;
  const normalizedVillage = normalizeVillageName(village);

  const dateRange = exclusiveEnd
    ? { $gte: startUTC, $lt: endUTC }
    : { $gte: startUTC, $lte: endUTC };

  // Build query - start with base conditions
  let baseQuery = {
    village: normalizedVillage,
    date: dateRange
  };
  
  // If onlyPosted is true, add condition to only get posted weather
  // Use $or to match either postedToDiscord: true OR the field doesn't exist (legacy records)
  if (onlyPosted) {
    // Exclude future/scheduled weather (e.g. Song of Storms) that hasn't been posted yet
    // Use $and to properly combine the base query with the $or condition
    baseQuery = {
      $and: [
        { village: normalizedVillage },
        { date: dateRange },
        {
          $or: [
            { postedToDiscord: true },
            { postedToDiscord: { $exists: false } }
          ]
        }
      ]
    };
  }

  // Sort by date descending (newest first) to get the most recent weather in the range
  // This ensures we get today's weather instead of yesterday's when the range includes both
  const weather = await Weather.findOne(baseQuery).sort({ date: -1 });
  
  // Add debug logging to help troubleshoot
  if (!weather && onlyPosted) {
    console.log(`[weatherService.js]: No posted weather found for ${normalizedVillage} in period ${startUTC.toISOString()} to ${endUTC.toISOString()}`);
    // Try to find any weather in the period to see if it's a postedToDiscord issue
    const anyWeather = await Weather.findOne({
      village: normalizedVillage,
      date: dateRange
    }).sort({ date: -1 });
    if (anyWeather) {
      console.log(`[weatherService.js]: Found weather but postedToDiscord=${anyWeather.postedToDiscord}, ID=${anyWeather._id}`);
    } else {
      console.log(`[weatherService.js]: No weather found at all for ${normalizedVillage} in this period`);
    }
  }

  // Basic validation
  if (weather && (!weather.village || !weather.date)) {
    return null;
  }

  return weather;
}


// ------------------- Weighted Choice Functions -------------------
function safeWeightedChoice(candidates, weightMapping, modifierMap = {}) {
  if (!candidates || candidates.length === 0) {
    console.error('[weatherService.js]❌ No candidates provided to weightedChoice');
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
    console.warn('[weatherService.js]: Total weight is 0 or negative, selecting random candidate');
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  let threshold = Math.random() * totalWeight;
  for (const { candidate, weight } of weightedCandidates) {
    threshold -= weight;
    if (threshold < 0) {
      return candidate;
    }
  }
  
  const result = candidates[candidates.length - 1];
  if (!result) {
    console.error('[weatherService.js]❌ Failed to select candidate, returning first option');
    return candidates[0];
  }
  
  return result;
}

// Calculate probability for selected candidate -
function calculateCandidateProbability(candidates, weightMapping, selectedCandidate, modifierMap = {}) {
  const totalWeight = candidates.reduce((sum, candidate) => {
    const base = weightMapping[candidate] ?? 0.01;
    const mod = modifierMap?.[candidate] ?? 1;
    return sum + (base * mod);
  }, 0);
  const selectedWeight = (weightMapping[selectedCandidate] ?? 0.01) * (modifierMap?.[selectedCandidate] ?? 1);
  return (selectedWeight / totalWeight) * 100;
}

// ------------------- Smoothing Functions -------------------
function getSmoothTemperatureChoices(currentTempF, seasonTemps, forceDrop = false) {
  const maxDelta = forceDrop ? 0 : 20;
  return seasonTemps.filter(label => {
    const temp = parseFahrenheit(label);
    return temp !== null && Math.abs(temp - currentTempF) <= maxDelta;
  });
}

function getSmoothWindChoices(currentWindLabel, seasonWinds) {
  const index = seasonWinds.indexOf(currentWindLabel);
  return [index - 1, index, index + 1]
    .filter(i => i >= 0 && i < seasonWinds.length)
    .map(i => seasonWinds[i]);
}

// Get smoothed temperature selection -
function getSmoothedTemperature(tempOptions, previous, hadStormYesterday, weightMap, modifierMap) {
  const prevTemp = parseFahrenheit(previous?.temperature?.label);
  const filtered = previous?.temperature?.label
    ? getSmoothTemperatureChoices(prevTemp, tempOptions, hadStormYesterday)
    : tempOptions;
  
  // Fallback if filtering results in empty array
  if (!filtered || filtered.length === 0) {
    console.warn('[weatherService.js]: No valid temperature choices after filtering, using all options');
    return safeWeightedChoice(tempOptions || [], weightMap, modifierMap);
  }
  
  return safeWeightedChoice(filtered, weightMap, modifierMap);
}

function getSmoothedWind(windOptions, previous, weightMap) {
  const prevWind = previous?.wind?.label;
  const filtered = prevWind
    ? getSmoothWindChoices(prevWind, windOptions)
    : windOptions;
  
  // Fallback if filtering results in empty array
  if (!filtered || filtered.length === 0) {
    console.warn('[weatherService.js]⚠️ No valid wind choices after filtering, using all options');
    return safeWeightedChoice(windOptions || [], weightMap);
  }
  
  return safeWeightedChoice(filtered, weightMap);
}

// ------------------- Weather Generation Functions -------------------
// Get precipitation label based on conditions -
function getPrecipitationLabel(seasonData, simTemp, simWind, cloudyStreak, weightMapping, modifierMap = {}) {
  const validPrecipitations = seasonData.Precipitation.filter(label => {
    const precipObj = precipitations.find(p => p.label === label);
    if (!precipObj || !precipObj.conditions) return true;
    
    const { temperature: tempConds, wind: windConds } = precipObj.conditions;
    
    // Check temperature conditions
    if (tempConds && !tempConds.includes('any')) {
      const tempValid = tempConds.every(cond => checkNumericCondition(simTemp, cond));
      if (!tempValid) return false;
    }
    
    // Check wind conditions
    if (windConds && !windConds.includes('any')) {
      const windValid = windConds.every(cond => checkNumericCondition(simWind, cond));
      if (!windValid) return false;
    }
    
    return true;
  });
  
  // Fallback if filtering results in empty array
  if (!validPrecipitations || validPrecipitations.length === 0) {
    console.warn('[weatherService.js]⚠️ No valid precipitation choices after filtering, using all season options');
    const allPrecipitations = seasonData.Precipitation || [];
    if (allPrecipitations.length === 0) {
      console.error('[weatherService.js]❌ No precipitation options available for season');
      return null;
    }
    return safeWeightedChoice(allPrecipitations, weightMapping, modifierMap);
  }
  
  return safeWeightedChoice(validPrecipitations, weightMapping, modifierMap);
}

// Get special condition based on weather state -
function getSpecialCondition(seasonData, simTemp, simWind, precipLabel, rainStreak, weightMapping, modifierMap = {}, previousWeather = null) {
  const validSpecials = seasonData.Special.filter(label => {
    // Prevent consecutive blight rain days
    if (label === "Blight Rain" && previousWeather?.special?.label === "Blight Rain") {
      return false;
    }
    
    const specialObj = specials.find(s => s.label === label);
    if (!specialObj || !specialObj.conditions) return true;
    
    const { temperature: tempConds, wind: windConds, precipitation: precipConds } = specialObj.conditions;
    
    // Check temperature conditions
    if (tempConds && !tempConds.includes('any')) {
      const tempValid = tempConds.every(cond => checkNumericCondition(simTemp, cond));
      if (!tempValid) return false;
    }
    
    // Check wind conditions
    if (windConds && !windConds.includes('any')) {
      const windValid = windConds.every(cond => checkNumericCondition(simWind, cond));
      if (!windValid) return false;
    }
    
    // Check precipitation conditions
    if (precipConds && !precipConds.includes('any')) {
      const precipValid = precipConds.some(cond => precipitationMatches(precipLabel, cond));
      if (!precipValid) return false;
    }
    
    return true;
  });
  
  // Fallback if filtering results in empty array
  if (!validSpecials || validSpecials.length === 0) {
    console.warn('[weatherService.js]⚠️ No valid special weather choices after filtering current conditions');
    return null;
  }
  
  return safeWeightedChoice(validSpecials, weightMapping, modifierMap);
}

// ============================================================================
// ------------------- Core Weather Generation -------------------
// ============================================================================

// ------------------- Unified Weather Generator ------------------
// Simulate weighted weather for village and season -
async function simulateWeightedWeather(village, season, options = {}) {
  const {
    useDatabaseHistory = true
  } = options;
  
  // Convert 'fall' to 'autumn' for data lookup since seasonsData uses 'Autumn'
  const lookupSeason = season.toLowerCase() === 'fall' ? 'autumn' : season.toLowerCase();
  const seasonKey = capitalizeFirstLetter(lookupSeason);
  const villageData = seasonsData[village];
  if (!villageData || !villageData.seasons[seasonKey]) {
    console.error(`[weatherService.js]: No season data found for ${village} in ${seasonKey}`);
    return null;
  }
  
  const seasonInfo = villageData.seasons[seasonKey];
  // Use the lookup season key for weight modifiers since they use 'Autumn'
  const weightModifiers = weatherWeightModifiers[village]?.[seasonKey] || {};
  
  // Get history based on configuration
  let history = [];
  if (useDatabaseHistory) {
    try {
      history = await Weather.getRecentWeather(village, 3);
    } catch (error) {
      console.error(`[weatherService.js]❌ Failed to get database history for ${village}:`, error);
      history = [];
    }
  }
  
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
    console.error(`[weatherService.js]: Failed to generate weather labels for ${village}`);
    return null;
  }
  
  // Special weather
  let specialLabel = null;
  let special = null;
  
  if (seasonInfo.Special.length && Math.random() < 0.3) {
    specialLabel = getSpecialCondition(
      seasonInfo,
      simTemp,
      simWind,
      precipitationLabel,
      rainStreak,
      specialWeights,
      weightModifiers.special || {},
      previous
    );
    
    if (specialLabel) {
      const specialObj = specials.find(s => s.label === specialLabel);
      if (specialObj) {
        special = {
          label: specialObj.label,
          emoji: specialObj.emoji,
          probability: '10%'
        };
      } else {
        console.warn(`[weatherService.js]⚠️ Special weather label "${specialLabel}" not found in specials array for ${village}`);
      }
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
    console.error(`[weatherService.js]: Invalid weather result object:`, result);
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

// ============================================================================
// ------------------- Weather Retrieval -------------------
// ============================================================================

// ------------------- Weather Lookup Helpers ------------------
// Validate weather is for current period (not future) -
function isValidCurrentPeriodWeather(weather, now, startOfNextPeriodUTC) {
  if (!weather) return false;
  const weatherDate = weather.date instanceof Date ? weather.date : new Date(weather.date);
  const oneHourFromNow = now.getTime() + (60 * 60 * 1000);
  // If weather is for future period (more than 1 hour in future), it's Song of Storms - don't return it
  return !(weatherDate.getTime() > oneHourFromNow && weatherDate >= startOfNextPeriodUTC);
}

// Save weather with duplicate handling -
async function saveWeatherWithDuplicateHandling(normalizedVillage, normalizedDate, newWeather, periodSearchStart, startOfNextPeriodUTC) {
  try {
    // Extra safety: if DB isn't connected, don't proceed (prevents “posted but not saved” confusion).
    // In practice the bot should connect during initialization, but this makes failures explicit.
    if (mongoose.connection?.readyState !== 1) {
      throw new Error(
        `MongoDB not connected (readyState=${mongoose.connection?.readyState}). Cannot save weather for ${normalizedVillage}.`
      );
    }

    const savedWeather = await Weather.findOneAndUpdate(
      {
        village: normalizedVillage,
        date: normalizedDate
      },
      // Insert-only: never overwrite an existing weather record for the day.
      // This prevents races/fallbacks from mutating the source-of-truth doc.
      { $setOnInsert: newWeather },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    // Verify persistence by re-checking existence via _id (one extra read, once per village/day).
    if (!savedWeather?._id) {
      throw new Error(`Weather save returned no _id for ${normalizedVillage}`);
    }
    const persisted = await Weather.exists({ _id: savedWeather._id });
    if (!persisted) {
      throw new Error(`Weather save verification failed for ${normalizedVillage} (id=${savedWeather._id})`);
    }
    
    console.log(`[weatherService.js]✅ Generated and saved new weather for ${normalizedVillage} period (ID: ${savedWeather._id}, Date: ${savedWeather.date.toISOString()})`);
    return savedWeather;
  } catch (saveError) {
    // If save failed (e.g., duplicate key error), try to find the existing weather
    if (saveError.code === 11000 || saveError.name === 'MongoServerError') {
      console.warn(`[weatherService.js]⚠️ Duplicate weather detected for ${normalizedVillage}, fetching existing record`);
      
      // Try range query first (most reliable - catches weather with different period calculations)
      const existingWeatherByRange = await findWeatherForPeriod(normalizedVillage, periodSearchStart, startOfNextPeriodUTC, {
        exclusiveEnd: true,
        onlyPosted: false
      });
      
      if (existingWeatherByRange) {
        console.log(`[weatherService.js]✅ Found existing weather by range query (ID: ${existingWeatherByRange._id})`);
        return existingWeatherByRange;
      }
      
      // Fallback to exact date match
      const existingWeather = await Weather.findOne({
        village: normalizedVillage,
        date: normalizedDate
      });
      
      if (existingWeather) {
        console.log(`[weatherService.js]✅ Found existing weather by exact date match (ID: ${existingWeather._id})`);
        return existingWeather;
      }
      
      console.error(`[weatherService.js]❌ Failed to save weather and could not find existing:`, saveError);
      throw saveError;
    }
    
    console.error(`[weatherService.js]❌ Failed to save weather to database:`, saveError);
    throw saveError;
  }
}

// Generate and save new weather for period -
async function generateAndSaveWeather(normalizedVillage, normalizedDate, season, periodSearchStart, startOfNextPeriodUTC) {
  const newWeather = await simulateWeightedWeather(normalizedVillage, season, { useDatabaseHistory: true });
  
  if (!newWeather) {
    throw new Error(`Failed to generate weather for ${normalizedVillage}`);
  }
  
  newWeather.date = normalizedDate;
  newWeather.season = season;
  newWeather.postedToDiscord = false;
  
  return await saveWeatherWithDuplicateHandling(normalizedVillage, normalizedDate, newWeather, periodSearchStart, startOfNextPeriodUTC);
}

// ------------------- Mark Weather As Posted ------------------
// Updates weather document after posting to Discord (postedToDiscord, postedAt).
async function markWeatherAsPosted(village, weather) {
  const normalizedVillage = normalizeVillageName(village);
  const id = weather?._id;
  if (!id) {
    console.warn('[weatherService.js]⚠️ markWeatherAsPosted: no _id on weather, skipping update');
    return null;
  }
  const now = new Date();
  const updated = await Weather.findByIdAndUpdate(
    id,
    { $set: { postedToDiscord: true, postedAt: now } },
    { new: true }
  );
  if (updated) {
    console.log(`[weatherService.js]✅ Marked weather as posted for ${normalizedVillage} (ID: ${id})`);
  }
  return updated;
}

// ------------------- Mark Weather As PM Posted ------------------
// Updates weather document after evening repost to Discord (pmPostedToDiscord, pmPostedAt).
async function markWeatherAsPmPosted(village, weather) {
  const normalizedVillage = normalizeVillageName(village);
  const id = weather?._id;
  if (!id) {
    console.warn('[weatherService.js]⚠️ markWeatherAsPmPosted: no _id on weather, skipping update');
    return null;
  }
  const now = new Date();
  const updated = await Weather.findByIdAndUpdate(
    id,
    { $set: { pmPostedToDiscord: true, pmPostedAt: now } },
    { new: true }
  );
  if (updated) {
    console.log(`[weatherService.js]✅ Marked weather as PM-posted for ${normalizedVillage} (ID: ${id})`);
  }
  return updated;
}

// ------------------- Get Weather Without Generation ------------------
// Get weather without generating new if missing -
async function getWeatherWithoutGeneration(village, options = {}) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    const now = new Date();

    const { startUTC: startOfPeriodUTC } = getCurrentPeriodBounds(now);
    const { startUTC: startOfNextPeriodUTC } = getNextPeriodBounds(now);

    // Use a range that starts 24 hours before the period start to catch weather saved with different timezone/date calculations
    // This handles cases where weather was saved with EST dates but we're now using UTC
    const periodSearchStart = new Date(startOfPeriodUTC);
    periodSearchStart.setUTCHours(periodSearchStart.getUTCHours() - 24); // Look back 24 hours to catch timezone mismatches

    // Add debug logging
    if (options.onlyPosted) {
      console.log(`[weatherService.js]🔍 Looking for posted weather for ${normalizedVillage} in period ${periodSearchStart.toISOString()} to ${startOfNextPeriodUTC.toISOString()}`);
    }

    // Use exclusive upper bound to avoid picking up next period's weather
    const weather = await findWeatherForPeriod(normalizedVillage, periodSearchStart, startOfNextPeriodUTC, {
      exclusiveEnd: true,
      onlyPosted: options.onlyPosted
    });

    // Validate that the found weather is actually for the current period (not from the lookback window)
    // This ensures we don't return yesterday's weather when today's should be active
    if (weather) {
      const weatherDate = weather.date instanceof Date ? weather.date : new Date(weather.date);
      // Check if weather date is actually within the current period bounds (not just in the wide search range)
      if (weatherDate < startOfPeriodUTC) {
        // Weather is from before the current period started, it's old weather
        console.log(`[weatherService.js]⚠️ Found weather for ${normalizedVillage} but it's from before current period (weather date: ${weatherDate.toISOString()}, period start: ${startOfPeriodUTC.toISOString()}), ignoring`);
        if (options.onlyPosted) {
          console.log(`[weatherService.js]⚠️ No posted weather found for ${normalizedVillage} in current period`);
        }
        return null;
      }
      console.log(`[weatherService.js]✅ Found weather for ${normalizedVillage}: ID=${weather._id}, date=${weather.date?.toISOString()}, postedToDiscord=${weather.postedToDiscord}`);
    } else if (options.onlyPosted) {
      console.log(`[weatherService.js]⚠️ No posted weather found for ${normalizedVillage}`);
    }

    return weather;
  } catch (error) {
    console.error('[weatherService.js]❌ Error getting weather:', error);
    throw error;
  }
}

// ------------------- Get Current Weather -------------------
async function getCurrentWeather(village) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    const now = new Date();

    const { startUTC: startOfPeriodUTC } = getCurrentPeriodBounds(now);
    const { startUTC: startOfNextPeriodUTC } = getNextPeriodBounds(now);

    // Normalize date to exact start of period (same as how we save it)
    // This ensures we find weather that was saved with normalized dates
    const normalizedDate = new Date(startOfPeriodUTC);
    normalizedDate.setMilliseconds(0);

    // FIRST: Check for existing weather using date range (covers entire period)
    // This is more reliable than exact match because period calculation may vary slightly
    // Use a range that starts 24 hours before the period start to catch weather saved with different timezone/date calculations
    // This handles cases where weather was saved with EST dates but we're now using UTC
    const periodSearchStart = new Date(startOfPeriodUTC);
    periodSearchStart.setUTCHours(periodSearchStart.getUTCHours() - 24); // Look back 24 hours to catch timezone mismatches
    
    let weather = await findWeatherForPeriod(normalizedVillage, periodSearchStart, startOfNextPeriodUTC, {
      exclusiveEnd: true,
      onlyPosted: false // Get current period weather even if not posted yet
    });

    // SECOND: If not found by range, try exact normalized date (for newly saved weather)
    if (!weather) {
      weather = await Weather.findOne({
        village: normalizedVillage,
        date: normalizedDate
      });
    }
    
    // Validate weather is actually for current period (not yesterday via lookback, and not future)
    if (weather) {
      const weatherDate = weather.date instanceof Date ? weather.date : new Date(weather.date);
      // Reject anything before current period start (lookback can accidentally return yesterday)
      if (weatherDate < startOfPeriodUTC) {
        console.log(
          `[weatherService.js]⚠️ Found weather for ${normalizedVillage} but it's before current period (weather date: ${weatherDate.toISOString()}, period start: ${startOfPeriodUTC.toISOString()}), ignoring`
        );
        weather = null;
      } else if (weatherDate >= startOfNextPeriodUTC) {
        // Should never happen due to our exclusive end searches, but keep this guard explicit.
        weather = null;
      } else if (!isValidCurrentPeriodWeather(weather, now, startOfNextPeriodUTC)) {
        // Excludes future/scheduled (Song of Storms) docs
        weather = null;
      }
    }
    
    // Generate new weather if none exists or if we filtered out future weather
    if (!weather) {
      // Final check: Try range query one more time (race condition protection)
      const finalCheck = await findWeatherForPeriod(normalizedVillage, periodSearchStart, startOfNextPeriodUTC, {
        exclusiveEnd: true,
        onlyPosted: false
      });
      
      if (finalCheck) {
        const finalDate = finalCheck.date instanceof Date ? finalCheck.date : new Date(finalCheck.date);
        const isInCurrentPeriod = finalDate >= startOfPeriodUTC && finalDate < startOfNextPeriodUTC;
        if (isInCurrentPeriod && isValidCurrentPeriodWeather(finalCheck, now, startOfNextPeriodUTC)) {
        console.log(`[weatherService.js]✅ Found existing weather for ${normalizedVillage} period (ID: ${finalCheck._id}), using it instead of generating new`);
        weather = finalCheck;
        } else if (!isInCurrentPeriod && finalCheck) {
          console.log(
            `[weatherService.js]⚠️ Final check found weather outside current period for ${normalizedVillage} (date: ${finalDate.toISOString()}), generating new instead`
          );
        }
      }

      if (!weather) {
        console.log(`[weatherService.js]🔄 No existing weather found for ${normalizedVillage} period, generating new weather for date: ${startOfPeriodUTC.toISOString()}`);
        const season = getCurrentSeason();
        weather = await generateAndSaveWeather(normalizedVillage, normalizedDate, season, periodSearchStart, startOfNextPeriodUTC);
      }
    }
    
    return weather;
  } catch (error) {
    console.error('[weatherService.js]: ❌ Error in getCurrentWeather:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Banner Generation -------------------
// ============================================================================
// ------------------- Deterministic Banner Helpers ------------------
// Keep AM/PM posts visually consistent by deriving a stable banner from the saved record.
function stableHash32(input) {
  const str = String(input ?? '');
  // FNV-1a 32-bit
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getBannerForWeather(village, weather) {
  const banners = BANNER_PATHS[village];
  if (!banners || banners.length === 0) {
    console.error(`[weatherService.js]❌ No banners found for village: ${village}`);
    return null;
  }
  const idPart = weather?._id ? String(weather._id) : '';
  let datePart = '';
  if (weather?.date) {
    const d = weather.date instanceof Date ? weather.date : new Date(weather.date);
    datePart = Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const seed = `${village}|${idPart || datePart || 'no-seed'}`;
  const idx = stableHash32(seed) % banners.length;
  return banners[idx];
}

// ------------------- Get Overlay Path ------------------
// Get overlay path for weather condition -
function getOverlayPath(condition) {
  const overlayName = OVERLAY_MAPPING[condition];
  if (!overlayName) {
    return null;
  }
  const overlayPath = getAssetPath(`overlays/ROOTS-${overlayName}.png`);
  const exists = fs.existsSync(overlayPath);
  return exists ? overlayPath : null;
}

// ------------------- Unified Banner Generator -------------------
async function generateBanner(village, weather, options = {}) {
  const {
    timeout = 10000
  } = options;
  
  try {

    const bannerPath = getBannerForWeather(village, weather);
    if (!bannerPath) {
      console.error(`[weatherService.js]: Failed to get banner for ${village}`);
      return null;
    }
    if (!fs.existsSync(bannerPath)) {
      console.error(`[weatherService.js]: Banner file does not exist: ${bannerPath}`);
      return null;
    }
    
    // Special weather overlay takes priority
    let overlayPath = null;
    if (weather.special && weather.special.label) {
      overlayPath = getOverlayPath(weather.special.label);
    }
    // Fallback to precipitation overlay if no special overlay
    if (!overlayPath) {
      overlayPath = getOverlayPath(weather.precipitation.label);
    }
    
    // Add timeout to prevent infinite loops
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Image processing timeout')), timeout);
    });

    const bannerPromise = Jimp.read(bannerPath);
    const bannerImg = await Promise.race([bannerPromise, timeoutPromise]);
    
    let overlayImg = null;
    try {
      if (overlayPath) {
        const overlayPromise = Jimp.read(overlayPath);
        overlayImg = await Promise.race([overlayPromise, timeoutPromise]);
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
      const banner = new AttachmentBuilder(buffer, { name: outName });
      
      return banner;
    } catch (overlayError) {
      console.error(`[weatherService.js]❌ Error loading/compositing overlay: ${overlayError.message}`);
      // Still return banner even if overlay fails
      const outName = `banner-${village.toLowerCase()}.png`;
      const buffer = await bannerImg.getBufferAsync(Jimp.MIME_PNG);
      return new AttachmentBuilder(buffer, { name: outName });
    } finally {
      // Explicitly dispose Jimp images to free memory
      try {
        if (bannerImg && typeof bannerImg.dispose === 'function') {
          bannerImg.dispose();
        }
        if (overlayImg && typeof overlayImg.dispose === 'function') {
          overlayImg.dispose();
        }
      } catch (disposeError) {
        // Ignore disposal errors - images may already be disposed
      }
    }
  } catch (error) {
    console.error('[weatherService.js]: Error generating banner:', error);
    return null;
  }
}

// ============================================================================
// ------------------- Embed Generation -------------------
// ============================================================================

// ------------------- Special Weather Flavor Text ------------------
// Get flavor text for special weather conditions -
function specialWeatherFlavorText(weatherType, character = null) {
  const HIBIKI_USER_ID = "668281042414600212";
  const isHibiki = character && character.userId === HIBIKI_USER_ID;
  
  // Only give Hibiki special flavor text for Blight Rain
  if (isHibiki && weatherType === "Blight Rain") {
    return "The rain falls, and you know it can't touch you... you've been here before...";
  }
  
  const weatherTextMap = {
    "Avalanche": "There has been an avalanche and some roads are blocked! Travel to and from this village today is impossible. All residents and visitors may use </specialweather:1379838613356806315> to help clear the road! You might just find something interesting while you work...",
    "Drought": "A drought has dried up the smaller vegetation surrounding the village... any plants or mushrooms rolled today are found dead and will not be gathered.",
    "Fairy Circle": "Fairy circles have popped up all over Hyrule! All residents and visitors may use </specialweather:1379838613356806315> to gather mushrooms today!",
    "Flood": "There has been a flood! Traveling to and from this village is impossible today due to the danger.",
    "Flower Bloom": "An overabundance of plants and flowers have been spotted growing in and around the village! All residents and visitors may use </specialweather:1379838613356806315> to gather today!",
    "Jubilee": "Fish are practically jumping out of the water! All residents and visitors may use </specialweather:1379838613356806315> to catch some fish!",
    "Meteor Shower": "Shooting stars have been spotted streaking through the sky! Quick, all residents and visitors make a wish and use </specialweather:1379838613356806315> for a chance to find a star fragment!",
    "Muggy": "Oof! Sure is humid today! Critters are out and about more than usual. All residents and visitors may use </specialweather:1379838613356806315> to catch some critters!",
    "Rock Slide": "Oh no, there's been a rock slide! Traveling to and from this village is impossible today. All residents and visitors may use </specialweather:1379838613356806315> to help clear the road! You might just find something interesting while you work...",
    "Blight Rain": "Blighted rain falls from the sky, staining the ground and creating sickly maroon-tinged puddles... any character who gathers, loots, or travels in this village today risks exposure to the blight. The corruption spreads through contact with the tainted rain.",
    "Lightning Storm": "Lightning crackles across the sky in a dangerous storm! The storm is unpredictable and dangerous - any character who gathers, loots, or travels in this village today risks being struck by lightning!"
  };

  return weatherTextMap[weatherType] || "Unknown weather condition.";
}

// ------------------- Schedule Special Weather Helpers ------------------
// Find or create weather document for next period -
async function findOrCreateWeatherForNextPeriod(normalizedVillage, startOfNextPeriodUTC, endOfNextPeriodUTC, seasonForPeriod) {
  // First try to find existing weather
  let weatherDoc = await findWeatherForPeriod(
    normalizedVillage,
    startOfNextPeriodUTC,
    endOfNextPeriodUTC,
    { exclusiveEnd: true, onlyPosted: false }
  );

  if (weatherDoc) {
    return weatherDoc;
  }

  // Double-check for existing weather to prevent race conditions
  const existingCheck = await Weather.findOne({
    village: normalizedVillage,
    date: {
      $gte: startOfNextPeriodUTC,
      $lt: endOfNextPeriodUTC
    }
  });
  
  if (existingCheck) {
    return existingCheck;
  }

  // Generate new weather
  const generatedWeather = await simulateWeightedWeather(normalizedVillage, seasonForPeriod, {
    useDatabaseHistory: true
  });

  if (!generatedWeather) {
    throw new Error(`Failed to generate baseline weather for ${normalizedVillage}.`);
  }

  // Prepare weather data
  const weatherData = {
    village: normalizedVillage,
    date: startOfNextPeriodUTC,
    season: seasonForPeriod,
    temperature: generatedWeather.temperature,
    wind: generatedWeather.wind,
    precipitation: generatedWeather.precipitation,
    postedToDiscord: false
  };
  
  try {
    weatherDoc = await Weather.findOneAndUpdate(
      {
        village: normalizedVillage,
        date: {
          $gte: startOfNextPeriodUTC,
          $lt: endOfNextPeriodUTC
        }
      },
      weatherData,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );
  } catch (saveError) {
    // If save failed due to duplicate, fetch the existing record
    if (saveError.code === 11000 || saveError.name === 'MongoServerError') {
      console.warn(`[weatherService.js]⚠️ Duplicate weather detected for ${normalizedVillage} next period, fetching existing`);
      weatherDoc = await Weather.findOne({
        village: normalizedVillage,
        date: {
          $gte: startOfNextPeriodUTC,
          $lt: endOfNextPeriodUTC
        }
      });
      if (!weatherDoc) {
        throw new Error(`Failed to save weather and could not find existing record for ${normalizedVillage}`);
      }
    } else {
      throw saveError;
    }
  }

  return weatherDoc;
}

// Check if guaranteed special weather already exists -
function hasGuaranteedSpecial(weatherDoc) {
  const existingSpecialProbability = weatherDoc?.special?.probability;
  return existingSpecialProbability &&
    typeof existingSpecialProbability === 'string' &&
    existingSpecialProbability.toLowerCase().includes('guaranteed');
}

// ------------------- Schedule Guaranteed Special Weather ------------------
// Schedules guaranteed special weather for the next period -
async function scheduleSpecialWeather(village, specialLabel, options = {}) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    if (!normalizedVillage) {
      throw new Error('A village is required to schedule special weather.');
    }

    const normalizedLabel = String(specialLabel || '').trim();
    if (!normalizedLabel) {
      throw new Error('A special weather label is required to schedule special weather.');
    }

    const specialEntry = specials.find(
      (entry) => entry.label.toLowerCase() === normalizedLabel.toLowerCase()
    );

    if (!specialEntry) {
      throw new Error(`Unknown special weather label "${specialLabel}".`);
    }

    // Get next period bounds
    const now = new Date();
    const { startUTC: startOfNextPeriodUTC, endUTC: endOfNextPeriodUTC } = getNextPeriodBounds(now);

    // Find or create weather document for next period
    let weatherDoc = await findWeatherForPeriod(
      normalizedVillage,
      startOfNextPeriodUTC,
      endOfNextPeriodUTC,
      { exclusiveEnd: true, onlyPosted: false }
    );

    const seasonForPeriod = getCurrentSeason(startOfNextPeriodUTC);

    if (!weatherDoc) {
      // Double-check for existing weather to prevent race conditions
      const existingCheck = await Weather.findOne({
        village: normalizedVillage,
        date: {
          $gte: startOfNextPeriodUTC,
          $lt: endOfNextPeriodUTC
        }
      });
      
      if (existingCheck) {
        weatherDoc = existingCheck;
      } else {
        const generatedWeather = await simulateWeightedWeather(normalizedVillage, seasonForPeriod, {
          useDatabaseHistory: true
        });

        if (!generatedWeather) {
          throw new Error(`Failed to generate baseline weather for ${normalizedVillage}.`);
        }

        // Use findOneAndUpdate with upsert to atomically create weather and prevent duplicates
        const weatherData = {
          village: normalizedVillage,
          date: startOfNextPeriodUTC,
          season: seasonForPeriod,
          temperature: generatedWeather.temperature,
          wind: generatedWeather.wind,
          precipitation: generatedWeather.precipitation,
          postedToDiscord: false
        };
        
        try {
          weatherDoc = await Weather.findOneAndUpdate(
            {
              village: normalizedVillage,
              date: {
                $gte: startOfNextPeriodUTC,
                $lt: endOfNextPeriodUTC
              }
            },
            weatherData,
            {
              upsert: true,
              new: true,
              setDefaultsOnInsert: true
            }
          );
        } catch (saveError) {
          // If save failed due to duplicate, fetch the existing record
          if (saveError.code === 11000 || saveError.name === 'MongoServerError') {
            console.warn(`[weatherService.js]: Duplicate weather detected for ${normalizedVillage} next period, fetching existing`);
            weatherDoc = await Weather.findOne({
              village: normalizedVillage,
              date: {
                $gte: startOfNextPeriodUTC,
                $lt: endOfNextPeriodUTC
              }
            });
            if (!weatherDoc) {
              throw new Error(`Failed to save weather and could not find existing record for ${normalizedVillage}`);
            }
          } else {
            throw saveError;
          }
        }
      }
    } else {
      weatherDoc.postedToDiscord = false;
      if (!weatherDoc.season) {
        weatherDoc.season = seasonForPeriod;
      }
    }

    // Check if guaranteed special already exists
    const existingSpecialProbability = weatherDoc?.special?.probability;
    const hasGuaranteedSpecial =
      existingSpecialProbability &&
      typeof existingSpecialProbability === 'string' &&
      existingSpecialProbability.toLowerCase().includes('guaranteed');

    if (hasGuaranteedSpecial) {
      throw new Error(
        `${normalizedVillage} already has guaranteed special weather scheduled for the next period.`
      );
    }

    // Set special weather
    weatherDoc.special = {
      label: specialEntry.label,
      emoji: specialEntry.emoji,
      probability: 'Guaranteed (Song of Storms)'
    };

    const savedWeather = await weatherDoc.save();


    const serializedWeather =
      typeof savedWeather.toObject === 'function' ? savedWeather.toObject() : savedWeather;

    return {
      weather: serializedWeather,
      startOfPeriod: startOfNextPeriodUTC,
      endOfPeriod: endOfNextPeriodUTC
    };
  } catch (error) {
    console.error('[weatherService.js]: ❌ Error scheduling special weather:', error);
    throw error;
  }
}

// ------------------- Generate Weather Embed ------------------
// Generate Discord embed for weather -
async function generateWeatherEmbed(village, weather, options = {}) {
  try {
    // Validate weather object structure
    if (!weather) {
      throw new Error('Weather object is null or undefined');
    }
    if (!weather.temperature || !weather.temperature.label) {
      throw new Error(`Invalid weather object: missing temperature.label for ${village}`);
    }
    if (!weather.wind || !weather.wind.label) {
      throw new Error(`Invalid weather object: missing wind.label for ${village}`);
    }
    if (!weather.precipitation || !weather.precipitation.label) {
      throw new Error(`Invalid weather object: missing precipitation.label for ${village}`);
    }
    
    // Validate village constants exist
    if (!VILLAGE_COLORS[village]) {
      throw new Error(`No color defined for village: ${village}`);
    }
    if (!VILLAGE_ICONS[village]) {
      throw new Error(`No icon path defined for village: ${village}`);
    }
    
    // Use the original season for icon lookup since SEASON_ICONS expects 'fall'
    const seasonKey = weather.season || 'spring';
    const seasonIconPath = SEASON_ICONS[seasonKey];
    if (!seasonIconPath) {
      throw new Error(`No season icon path for season: ${seasonKey}`);
    }
    if (!fs.existsSync(seasonIconPath)) {
      throw new Error(`Season icon file does not exist: ${seasonIconPath}`);
    }
    const seasonIconName = `${seasonKey}.png`;
    const seasonAttachment = new AttachmentBuilder(seasonIconPath, { name: seasonIconName });
    const crestIconPath = VILLAGE_ICONS[village];
    if (!fs.existsSync(crestIconPath)) {
      throw new Error(`Village icon file does not exist: ${crestIconPath}`);
    }
    const crestIconName = `crest_${village.toLowerCase()}.png`;
    const crestAttachment = new AttachmentBuilder(crestIconPath, { name: crestIconName });
    const tempEmoji = weather.temperature.emoji || '🌡️';
    const windEmoji = weather.wind.emoji || '💨';
    const precipEmoji = weather.precipitation.emoji || '🌧️';
    const specialEmoji = weather.special && weather.special.emoji ? weather.special.emoji : '';
    const emojiSummary = `${tempEmoji}${windEmoji}${precipEmoji}${specialEmoji}`;
    const displayDateRaw = weather?.date instanceof Date ? weather.date : new Date(weather?.date);
    const displayDate = Number.isNaN(displayDateRaw.getTime()) ? new Date() : displayDateRaw;
    const hyruleanDate = convertToHyruleanDate(displayDate);
    const dateLine = `**Hyrulean Date: ${hyruleanDate}**`;
    const title = options.title || `${village}'s Daily Weather Forecast`;
    const embed = new EmbedBuilder()
      .setColor(VILLAGE_COLORS[village])
      .setTitle(title)
      .setDescription(`${emojiSummary}\n\n${dateLine}`)
      .setAuthor({ name: `${village} Town Hall`, iconURL: `attachment://${crestIconName}` })
      .addFields(
        { name: 'Temperature', value: weather.temperature?.label || `${weather.temperature?.value || 'N/A'}°F`, inline: false },
        { name: 'Wind', value: weather.wind?.label || `${weather.wind?.speed || 'N/A'} mph ${weather.wind?.direction || 'N/A'}`, inline: false },
        { name: 'Precipitation', value: weather.precipitation?.label || 'N/A', inline: false }
      )
      .setThumbnail(`attachment://${seasonIconName}`)
      .setTimestamp(displayDate);

    if (weather.special && weather.special.label) {
      const specialText = specialWeatherFlavorText(weather.special.label);
      embed.addFields({ 
        name: 'Special Weather', 
        value: `✨ ${weather.special.emoji || ''} ${weather.special.label}\n\n${specialText}`.trim() 
      });
    }

    const banner = await generateBanner(village, weather, options);
    if (banner) {
      embed.setImage(`attachment://${banner.name}`);
    }
    const files = banner ? [banner, seasonAttachment, crestAttachment] : [seasonAttachment, crestAttachment];
    return {
      embed,
      files
    };
  } catch (error) {
    console.error('[weatherService.js]❌ Error generating weather embed:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Weather Damage Calculation -------------------
// ============================================================================

// ------------------- Calculate Weather Damage -------------------
// Calculates village damage based on wind, precipitation, and special weather conditions
// Returns an object with total damage and breakdown by category
function calculateWeatherDamage(weather) {
  if (!weather) {
    return { total: 0, wind: 0, precipitation: 0, special: 0 };
  }

  let windDamage = 0;
  let precipitationDamage = 0;
  let specialDamage = 0;

  // Wind damage (chip damage from structural strain)
  if (weather.wind && weather.wind.label) {
    const windLabel = weather.wind.label;
    if (windLabel === "41 - 62(km/h) // Strong") {
      windDamage = 1;
    } else if (windLabel === "63 - 87(km/h) // Gale") {
      windDamage = 1;
    } else if (windLabel === "88 - 117(km/h) // Storm") {
      windDamage = 1;
    } else if (windLabel === ">= 118(km/h) // Hurricane") {
      windDamage = 2;
    }
  }

  // Precipitation damage
  if (weather.precipitation && weather.precipitation.label) {
    const precipLabel = weather.precipitation.label;
    if (precipLabel === "Heavy Snow") {
      precipitationDamage = 2;
    } else if (precipLabel === "Blizzard") {
      precipitationDamage = 5;
    } else if (precipLabel === "Hail") {
      precipitationDamage = 3;
    }
  }

  // Special weather damage
  if (weather.special && weather.special.label) {
    const specialLabel = weather.special.label;
    switch (specialLabel) {
      case "Blight Rain":
        specialDamage = 25;
        break;
      case "Avalanche":
        specialDamage = 15;
        break;
      case "Rock Slide":
        specialDamage = 15;
        break;
      case "Flood":
        specialDamage = 20;
        break;
      case "Lightning Storm":
        specialDamage = 5;
        break;
      default:
        specialDamage = 0;
    }
  }

  const total = windDamage + precipitationDamage + specialDamage;

  return {
    total,
    wind: windDamage,
    precipitation: precipitationDamage,
    special: specialDamage
  };
}

// ============================================================================
// ------------------- Public API -------------------
// ============================================================================

module.exports = {
  // Core weather operations
  getCurrentWeather,
  getWeatherWithoutGeneration,
  simulateWeightedWeather,
  markWeatherAsPosted,
  markWeatherAsPmPosted,

  // Banner and embed generation
  generateBanner,
  generateWeatherEmbed,
  specialWeatherFlavorText,

  // Utility functions
  getCurrentSeason,
  getCurrentPeriodBounds,
  getNextPeriodBounds,
  findWeatherForPeriod,
  normalizeVillageName,
  parseFahrenheit,
  parseWind,
  scheduleSpecialWeather,

  // Weather damage calculation
  calculateWeatherDamage
}; 