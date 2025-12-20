// ============================================================================
// 🌤️ Weather Service
// Unified service layer for all weather operations
// Consolidates weather generation, retrieval, and banner creation
// ============================================================================

const mongoose = require('mongoose');
const Weather = require('../../models/WeatherModel');
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
const { validateWeatherCombination, findWeatherEmoji } = require('../utils/weatherValidation');
const { convertToHyruleanDate } = require('../modules/calendarModule');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const VILLAGE_COLORS = {
  Rudania: 0xd7342a,
  Inariko: 0x277ecd,
  Vhintl: 0x25c059
};

const SEASON_ICONS = {
  spring: path.join(__dirname, '..', 'assets', 'seasons', 'spring.png'),
  summer: path.join(__dirname, '..', 'assets', 'seasons', 'summer.png'),
  fall: path.join(__dirname, '..', 'assets', 'seasons', 'fall.png'),
  winter: path.join(__dirname, '..', 'assets', 'seasons', 'winter.png')
};

const VILLAGE_ICONS = {
  Rudania: path.join(__dirname, '..', 'assets', 'icons', '[RotW] village crest_rudania_.png'),
  Inariko: path.join(__dirname, '..', 'assets', 'icons', '[RotW] village crest_inariko_.png'),
  Vhintl: path.join(__dirname, '..', 'assets', 'icons', '[RotW] village crest_vhintl_.png')
};

const BANNER_PATHS = {
  Rudania: [
    path.join(__dirname, '..', 'assets', 'banners', 'Rudania1.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Rudania2.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Rudania3.png')
  ],
  Inariko: [
    path.join(__dirname, '..', 'assets', 'banners', 'Inariko1.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Inariko2.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Inariko3.png')
  ],
  Vhintl: [
    path.join(__dirname, '..', 'assets', 'banners', 'Vhintl1.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Vhintl2.png'),
    path.join(__dirname, '..', 'assets', 'banners', 'Vhintl3.png')
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
};

// Banner cache for performance
const bannerCache = new Map();
const CACHE_DURATION = 300000; // 5 minutes
const LEGACY_PERIOD_FALLBACK_MS = 8 * 60 * 60 * 1000; // 8 hours

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

// ------------------- Helper Functions -------------------
function normalizeVillageName(name) {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

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

function getEasternReference(referenceDate = new Date()) {
  const baseDate = referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate);
  const easternDate = new Date(baseDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const offsetMs = baseDate.getTime() - easternDate.getTime();
  return { easternDate, offsetMs };
}

function getCurrentPeriodBounds(referenceDate = new Date()) {
  const { easternDate, offsetMs } = getEasternReference(referenceDate);

  const startEastern = new Date(easternDate);
  startEastern.setHours(8, 0, 0, 0);

  if (easternDate.getHours() < 8) {
    startEastern.setDate(startEastern.getDate() - 1);
  }

  const endEastern = new Date(startEastern);
  endEastern.setDate(endEastern.getDate() + 1);
  endEastern.setHours(7, 59, 59, 999);

  return {
    startUTC: new Date(startEastern.getTime() + offsetMs),
    endUTC: new Date(endEastern.getTime() + offsetMs),
    startEastern,
    endEastern
  };
}

function getNextPeriodBounds(referenceDate = new Date()) {
  const { easternDate, offsetMs } = getEasternReference(referenceDate);

  const startEastern = new Date(easternDate);
  startEastern.setHours(8, 0, 0, 0);
  startEastern.setDate(startEastern.getDate() + 1);

  const endEastern = new Date(startEastern);
  endEastern.setDate(endEastern.getDate() + 1);
  endEastern.setHours(7, 59, 59, 999);

  return {
    startUTC: new Date(startEastern.getTime() + offsetMs),
    endUTC: new Date(endEastern.getTime() + offsetMs),
    startEastern,
    endEastern
  };
}

async function findWeatherForPeriod(village, startUTC, endUTC, options = {}) {
  const { legacyFallback = true, fallbackWindowMs = LEGACY_PERIOD_FALLBACK_MS } = options;
  const normalizedVillage = normalizeVillageName(village);

  let weather = await Weather.findOne({
    village: normalizedVillage,
    date: {
      $gte: startUTC,
      $lte: endUTC
    }
  });

  if (!weather && legacyFallback) {
    const legacyWeather = await Weather.findOne({
      village: normalizedVillage,
      date: {
        $gte: new Date(startUTC.getTime() - fallbackWindowMs),
        $lte: new Date(endUTC.getTime() - fallbackWindowMs)
      }
    });

    if (legacyWeather) {
      legacyWeather.date = startUTC;

      if (legacyWeather.prediction) {
        legacyWeather.prediction.periodStart = startUTC;
        legacyWeather.prediction.periodEnd = endUTC;
        legacyWeather.markModified('prediction');
      }

      weather = await legacyWeather.save();
      console.log(`[weatherService.js]: ℹ️ Realigned legacy weather record for ${normalizedVillage} to new UTC window.`);
    }
  }

  return weather;
}

// ------------------- Weather Data Parsing -------------------
function parseFahrenheit(label) {
  if (!label) return 0;
  const match = label.match(/(\d+)°F/);
  return match ? parseInt(match[1]) : 0;
}

function parseWind(label) {
  if (!label) return 0;
  
  // Handle "< 2(km/h) // Calm" format
  const lessThanMatch = label.match(/< (\d+)/);
  if (lessThanMatch) {
    const value = parseInt(lessThanMatch[1], 10);
    return Math.max(0, value - 1);
  }
  
  // Handle ">= 118(km/h) // Hurricane" format
  const greaterThanMatch = label.match(/>= (\d+)/);
  if (greaterThanMatch) {
    return parseInt(greaterThanMatch[1], 10);
  }
  
  // Handle "2 - 12(km/h) // Breeze" format (range)
  const rangeMatch = label.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    return Math.round((min + max) / 2);
  }
  
  // Handle single number format
  const singleMatch = label.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1], 10);
  }
  
  return 0;
}

// ------------------- Weighted Choice Functions -------------------
function safeWeightedChoice(candidates, weightMapping, modifierMap = {}) {
  if (!candidates || candidates.length === 0) {
    console.error('[weatherService.js]: No candidates provided to weightedChoice');
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
    console.error('[weatherService.js]: Failed to select candidate, returning first option');
    return candidates[0];
  }
  
  return result;
}

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

function getSmoothedTemperature(tempOptions, previous, hadStormYesterday, weightMap, modifierMap) {
  const prevTemp = parseFahrenheit(previous?.temperature?.label);
  const filtered = previous?.temperature?.label
    ? getSmoothTemperatureChoices(prevTemp, tempOptions, hadStormYesterday)
    : tempOptions;
  return safeWeightedChoice(filtered, weightMap, modifierMap);
}

function getSmoothedWind(windOptions, previous, weightMap) {
  const prevWind = previous?.wind?.label;
  const filtered = prevWind
    ? getSmoothWindChoices(prevWind, windOptions)
    : windOptions;
  return safeWeightedChoice(filtered, weightMap);
}

// ------------------- Weather Generation Functions -------------------
function getPrecipitationLabel(seasonData, simTemp, simWind, cloudyStreak, weightMapping, modifierMap = {}) {
  const validPrecipitations = seasonData.Precipitation.filter(label => {
    const precipObj = precipitations.find(p => p.label === label);
    if (!precipObj || !precipObj.conditions) return true;
    
    const { temperature: tempConds, wind: windConds } = precipObj.conditions;
    
    // Check temperature conditions
    if (tempConds && !tempConds.includes('any')) {
      const tempValid = tempConds.every(cond => {
        const match = cond.match(/([<>=]+)\s*(\d+)/);
        if (!match) return true;
        const [_, operator, num] = match;
        const compareValue = parseInt(num);
        
        switch (operator) {
          case '<=': return simTemp <= compareValue;
          case '>=': return simTemp >= compareValue;
          case '<': return simTemp < compareValue;
          case '>': return simTemp > compareValue;
          case '==': return simTemp === compareValue;
          default: return true;
        }
      });
      if (!tempValid) return false;
    }
    
    // Check wind conditions
    if (windConds && !windConds.includes('any')) {
      const windValid = windConds.every(cond => {
        const match = cond.match(/([<>=]+)\s*(\d+)/);
        if (!match) return true;
        const [_, operator, num] = match;
        const compareValue = parseInt(num);
        
        switch (operator) {
          case '<=': return simWind <= compareValue;
          case '>=': return simWind >= compareValue;
          case '<': return simWind < compareValue;
          case '>': return simWind > compareValue;
          case '==': return simWind === compareValue;
          default: return true;
        }
      });
      if (!windValid) return false;
    }
    
    return true;
  });
  
  return safeWeightedChoice(validPrecipitations, weightMapping, modifierMap);
}

function getSpecialCondition(seasonData, simTemp, simWind, precipLabel, rainStreak, weightMapping, modifierMap = {}) {
  const validSpecials = seasonData.Special.filter(label => {
    const specialObj = specials.find(s => s.label === label);
    if (!specialObj || !specialObj.conditions) return true;
    
    const { temperature: tempConds, wind: windConds, precipitation: precipConds } = specialObj.conditions;
    
    // Check temperature conditions
    if (tempConds && !tempConds.includes('any')) {
      const tempValid = tempConds.every(cond => {
        const match = cond.match(/([<>=]+)\s*(\d+)/);
        if (!match) return true;
        const [_, operator, num] = match;
        const compareValue = parseInt(num);
        
        switch (operator) {
          case '<=': return simTemp <= compareValue;
          case '>=': return simTemp >= compareValue;
          case '<': return simTemp < compareValue;
          case '>': return simTemp > compareValue;
          case '==': return simTemp === compareValue;
          default: return true;
        }
      });
      if (!tempValid) return false;
    }
    
    // Check wind conditions
    if (windConds && !windConds.includes('any')) {
      const windValid = windConds.every(cond => {
        const match = cond.match(/([<>=]+)\s*(\d+)/);
        if (!match) return true;
        const [_, operator, num] = match;
        const compareValue = parseInt(num);
        
        switch (operator) {
          case '<=': return simWind <= compareValue;
          case '>=': return simWind >= compareValue;
          case '<': return simWind < compareValue;
          case '>': return simWind > compareValue;
          case '==': return simWind === compareValue;
          default: return true;
        }
      });
      if (!windValid) return false;
    }
    
    // Check precipitation conditions
    if (precipConds && !precipConds.includes('any')) {
      const normalizedPrecip = precipLabel.toLowerCase();
      const precipValid = precipConds.some(cond => {
        const normalizedCond = cond.toLowerCase();
        
        if (normalizedCond === 'sunny') return normalizedPrecip === 'sunny';
        if (normalizedCond === 'rain') return ['rain', 'light rain', 'heavy rain'].includes(normalizedPrecip);
        if (normalizedCond === 'snow') return ['snow', 'light snow', 'heavy snow', 'blizzard'].includes(normalizedPrecip);
        if (normalizedCond === 'fog') return normalizedPrecip === 'fog';
        if (normalizedCond === 'cloudy') return normalizedPrecip === 'cloudy';
        
        return normalizedPrecip === normalizedCond;
      });
      if (!precipValid) return false;
    }
    
    return true;
  });
  
  return safeWeightedChoice(validSpecials, weightMapping, modifierMap);
}

// ============================================================================
// ------------------- Core Weather Generation -------------------
// ============================================================================

// ------------------- Unified Weather Generator -------------------
async function simulateWeightedWeather(village, season, options = {}) {
  const {
    useDatabaseHistory = true,
    maxRetries = 10,
    validateResult = true
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
      console.error(`[weatherService.js]: Failed to get database history for ${village}:`, error);
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
      weightModifiers.special || {}
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
        console.warn(`[weatherService.js]: Special weather label "${specialLabel}" not found in specials array for ${village}`);
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
    console.log(`[weatherService.js]: ✨ Special weather generated for ${village}: ${special.label}`);
  }
  
  // Validate weather combination if requested
  if (validateResult && !validateWeatherCombination(result)) {
    console.warn(`[weatherService.js]: Invalid weather combination generated for ${village}`);
    // Note: We keep special weather even if validation fails to ensure it's saved to database
    // The special weather was generated according to the rules and should be preserved
  }
  
  return result;
}

// ============================================================================
// ------------------- Weather Retrieval -------------------
// ============================================================================

// ------------------- Get Weather Without Generation -------------------
async function getWeatherWithoutGeneration(village) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    
    // Get current time in EST/EDT
    const { startUTC: startOfPeriodUTC, endUTC: endOfPeriodUTC } = getCurrentPeriodBounds();
    
    // Get weather from the current period with legacy fallback support
    const weather = await findWeatherForPeriod(normalizedVillage, startOfPeriodUTC, endOfPeriodUTC);
    
    return weather;
  } catch (error) {
    console.error('[weatherService.js]: ❌ Error getting weather:', error);
    throw error;
  }
}

// ------------------- Get Current Weather -------------------
async function getCurrentWeather(village) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    
    // Get current time in EST/EDT
    const { startUTC: startOfPeriodUTC, endUTC: endOfPeriodUTC } = getCurrentPeriodBounds();
    
    // Get weather from the current period
    let weather = await findWeatherForPeriod(normalizedVillage, startOfPeriodUTC, endOfPeriodUTC);
    
    // Only generate new weather if none exists for the current period
    if (!weather) {
      const season = getCurrentSeason();
      
      // Try to generate valid weather with retry limit
      let newWeather = null;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        attempts++;
        newWeather = await simulateWeightedWeather(normalizedVillage, season, { useDatabaseHistory: true });
        
        if (!newWeather) {
          if (attempts === maxAttempts) {
            throw new Error(`Failed to generate weather for ${village} after ${maxAttempts} attempts`);
          }
          continue;
        }
        
        // Add date and season to weather data
        newWeather.date = new Date();
        newWeather.season = season;

        // Validate weather combination
        if (validateWeatherCombination(newWeather)) {
          break;
        } else {
          if (attempts === maxAttempts) {
            // Note: We keep special weather even if validation fails to ensure it's saved to database
            // The special weather was generated according to the rules and should be preserved
            console.warn(`[weatherService.js]: Max attempts reached, keeping special weather despite validation failure`);
          }
        }
      }
      
      if (newWeather) {
        // Save to database
        try {
          const weatherDoc = new Weather(newWeather);
          weather = await weatherDoc.save();
        } catch (saveError) {
          console.error(`[weatherService.js]: ❌ Failed to save weather to database:`, saveError);
          // Return the generated weather even if save fails
          weather = newWeather;
        }
      } else {
        throw new Error(`Failed to generate weather for ${village} after ${maxAttempts} attempts`);
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

// ------------------- Banner Helper Functions -------------------
function getRandomBanner(village) {
  const banners = BANNER_PATHS[village];
  if (!banners || banners.length === 0) {
    console.error(`[weatherService.js]: No banners found for village: ${village}`);
    return null;
  }
  return banners[Math.floor(Math.random() * banners.length)];
}

function getOverlayPath(condition) {
  const overlayName = OVERLAY_MAPPING[condition];
  if (!overlayName) {
    return null;
  }
  const overlayPath = path.join(__dirname, '..', 'assets', 'overlays', `ROOTS-${overlayName}.png`);
  const exists = fs.existsSync(overlayPath);
  return exists ? overlayPath : null;
}

// ------------------- Unified Banner Generator -------------------
async function generateBanner(village, weather, options = {}) {
  const {
    enableCaching = false,
    cacheDuration = CACHE_DURATION,
    timeout = 10000
  } = options;
  
  try {
    // Check cache first if enabled
    if (enableCaching) {
      const cacheKey = `${village}-${weather.special?.label || weather.precipitation?.label}`;
      const cachedBanner = bannerCache.get(cacheKey);
      if (cachedBanner && Date.now() - cachedBanner.timestamp < cacheDuration) {
        return cachedBanner.banner;
      }
    }

    const bannerPath = getRandomBanner(village);
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
    
    if (overlayPath) {
      try {
        const overlayPromise = Jimp.read(overlayPath);
        const overlayImg = await Promise.race([overlayPromise, timeoutPromise]);
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
      } catch (overlayError) {
        console.error(`[weatherService.js]: ❌ Error loading/compositing overlay: ${overlayError.message}`);
      }
    }
    
    const outName = `banner-${village.toLowerCase()}.png`;
    const buffer = await bannerImg.getBufferAsync(Jimp.MIME_PNG);
    const banner = new AttachmentBuilder(buffer, { name: outName });
    
    // Cache if enabled
    if (enableCaching) {
      const cacheKey = `${village}-${weather.special?.label || weather.precipitation?.label}`;
      bannerCache.set(cacheKey, {
        banner,
        timestamp: Date.now()
      });
    }
    
    return banner;
  } catch (error) {
    console.error('[weatherService.js]: Error generating banner:', error);
    return null;
  }
}

// ============================================================================
// ------------------- Embed Generation -------------------
// ============================================================================

// ------------------- Special Weather Flavor Text -------------------
function specialWeatherFlavorText(weatherType, character = null) {
  const HIBIKI_USER_ID = "668281042414600212";
  const isHibiki = character && character.userId === HIBIKI_USER_ID;
  
  // Only give Hibiki special flavor text for Blight Rain
  if (isHibiki && weatherType === "Blight Rain") {
    return "The rain falls, and you know it can't touch you... you've been here before...";
  }
  
  const weatherTextMap = {
    "Avalanche": "There has been an avalanche and some roads are blocked! Travel to and from this village today is impossible.",
    "Drought": "A drought has dried up the smaller vegetation surrounding the village... any plants or mushrooms rolled today are found dead and will not be gathered.",
    "Fairy Circle": "Fairy circles have popped up all over Hyrule! All residents and visitors may use </specialweather:1379838613356806315> to gather mushrooms today!",
    "Flood": "There has been a flood! Traveling to and from this village is impossible today due to the danger.",
    "Flower Bloom": "An overabundance of plants and flowers have been spotted growing in and around the village! All residents and visitors may use </specialweather:1379838613356806315> to gather today!",
    "Jubilee": "Fish are practically jumping out of the water! All residents and visitors may use </specialweather:1379838613356806315> to catch some fish!",
    "Meteor Shower": "Shooting stars have been spotted streaking through the sky! Quick, all residents and visitors make a wish and use </specialweather:1379838613356806315> for a chance to find a star fragment!",
    "Muggy": "Oof! Sure is humid today! Critters are out and about more than usual. All residents and visitors may use </specialweather:1379838613356806315> to catch some critters!",
    "Rock Slide": "Oh no, there's been a rock slide! Traveling to and from this village is impossible today. All residents and visitors may use </specialweather:1379838613356806315> to help clear the road! You might just find something interesting while you work...",
    "Blight Rain": "Blighted rain falls from the sky, staining the ground and creating sickly maroon-tinged puddles... any character who gathers, loots, or travels in this village today risks exposure to the blight. The corruption spreads through contact with the tainted rain."
  };

  return weatherTextMap[weatherType] || "Unknown weather condition.";
}

// ------------------- Schedule Guaranteed Special Weather -------------------
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

    const {
      startUTC: startOfNextPeriodUTC,
      endUTC: endOfNextPeriodUTC,
      startEastern: startOfNextPeriod
    } = getNextPeriodBounds();

    let weatherDoc = await findWeatherForPeriod(
      normalizedVillage,
      startOfNextPeriodUTC,
      endOfNextPeriodUTC
    );

    let generatedWeather = null;
    const seasonForPeriod = getCurrentSeason(startOfNextPeriod);

    if (!weatherDoc) {
      generatedWeather = await simulateWeightedWeather(normalizedVillage, seasonForPeriod, {
        useDatabaseHistory: true
      });

      if (!generatedWeather) {
        throw new Error(`Failed to generate baseline weather for ${normalizedVillage}.`);
      }

      weatherDoc = new Weather({
        village: normalizedVillage,
        date: startOfNextPeriodUTC,
        season: seasonForPeriod,
        temperature: generatedWeather.temperature,
        wind: generatedWeather.wind,
        precipitation: generatedWeather.precipitation
      });
    } else if (!weatherDoc.season) {
      weatherDoc.season = seasonForPeriod;
    }

    const existingSpecialLabel = weatherDoc?.special?.label;
    const existingSpecialProbability = weatherDoc?.special?.probability;
    const hasGuaranteedSpecial =
      existingSpecialLabel &&
      typeof existingSpecialProbability === 'string' &&
      existingSpecialProbability.toLowerCase().includes('guaranteed');

    if (hasGuaranteedSpecial) {
      const error = new Error(
        `${normalizedVillage} already has guaranteed special weather scheduled for the next period.`
      );
      error.code = 'SPECIAL_WEATHER_ALREADY_SET';
      error.village = normalizedVillage;
      error.existingSpecial = existingSpecialLabel;
      console.warn(
        '[weatherService.js]: ⚠️ Attempt to reschedule Song of Storms special rejected',
        {
          village: normalizedVillage,
          existingSpecial: existingSpecialLabel,
          probability: existingSpecialProbability
        }
      );
      throw error;
    }

    weatherDoc.special = {
      label: specialEntry.label,
      emoji: specialEntry.emoji,
      probability: 'Guaranteed (Song of Storms)'
    };

    const savedWeather = await weatherDoc.save();

    const logContext = {
      village: normalizedVillage,
      special: specialEntry.label,
      startOfPeriod: startOfNextPeriodUTC.toISOString(),
      triggeredBy: options.triggeredBy || 'Unknown',
      recipient: options.recipient || null,
      source: options.source || 'Song of Storms'
    };

    console.log('[weatherService.js]: 🎵 Scheduled special weather', logContext);

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

// ------------------- Generate Weather Embed -------------------
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
    console.error('[weatherService.js]: Error generating weather embed:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Public API -------------------
// ============================================================================

module.exports = {
  // Core weather operations
  getCurrentWeather,
  getWeatherWithoutGeneration,
  simulateWeightedWeather,
  
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
  
  // Cache management
  bannerCache
}; 