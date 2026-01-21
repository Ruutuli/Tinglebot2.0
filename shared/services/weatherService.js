// ============================================================================
// 🌤️ Weather Service
// Unified service layer for all weather operations
// Consolidates weather generation, retrieval, and banner creation
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
const { validateWeatherCombination, findWeatherEmoji } = require('../utils/weatherValidation');
const { convertToHyruleanDate } = require('../../bot/modules/calendarModule');
const path = require('path');
const fs = require('fs');
// Import jimp - it's installed in the root node_modules
const Jimp = require('jimp');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

// Memory monitor (optional - won't break if not initialized)
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

const VILLAGE_COLORS = {
  Rudania: 0xd7342a,
  Inariko: 0x277ecd,
  Vhintl: 0x25c059
};

const SEASON_ICONS = {
  spring: path.join(__dirname, '..', '..', 'bot', 'assets', 'seasons', 'spring.png'),
  summer: path.join(__dirname, '..', '..', 'bot', 'assets', 'seasons', 'summer.png'),
  fall: path.join(__dirname, '..', '..', 'bot', 'assets', 'seasons', 'fall.png'),
  winter: path.join(__dirname, '..', '..', 'bot', 'assets', 'seasons', 'winter.png')
};

const VILLAGE_ICONS = {
  Rudania: path.join(__dirname, '..', '..', 'bot', 'assets', 'icons', '[RotW] village crest_rudania_.png'),
  Inariko: path.join(__dirname, '..', '..', 'bot', 'assets', 'icons', '[RotW] village crest_inariko_.png'),
  Vhintl: path.join(__dirname, '..', '..', 'bot', 'assets', 'icons', '[RotW] village crest_vhintl_.png')
};

const BANNER_PATHS = {
  Rudania: [
    path.join(__dirname, '..', '..', 'bot', 'assets', 'banners', 'Rudania1.png'),
    path.join(__dirname, '..', '..', 'bot', 'assets', 'banners', 'Rudania2.png'),
    path.join(__dirname, '..', '..', 'bot', 'assets', 'banners', 'Rudania3.png')
  ],
  Inariko: [
    path.join(__dirname, '..', '..', 'bot', 'assets', 'banners', 'Inariko1.png'),
    path.join(__dirname, '..', '..', 'bot', 'assets', 'banners', 'Inariko2.png'),
    path.join(__dirname, '..', '..', 'bot', 'assets', 'banners', 'Inariko3.png')
  ],
  Vhintl: [
    path.join(__dirname, '..', '..', 'bot', 'assets', 'banners', 'Vhintl1.png'),
    path.join(__dirname, '..', '..', 'bot', 'assets', 'banners', 'Vhintl2.png'),
    path.join(__dirname, '..', '..', 'bot', 'assets', 'banners', 'Vhintl3.png')
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

// Banner cache for performance
const bannerCache = new Map();
const CACHE_DURATION = 60000; // 1 minute - reduced to prevent memory buildup
const MAX_CACHE_SIZE = 10; // Maximum number of cached banners - reduced to prevent memory leaks

// Cleanup banner cache periodically to prevent memory leaks
function cleanupBannerCache() {
  const now = Date.now();
  const entriesToDelete = [];
  
  // Remove expired entries
  for (const [key, value] of bannerCache.entries()) {
    if (now - value.timestamp >= CACHE_DURATION) {
      entriesToDelete.push(key);
    }
  }
  
  entriesToDelete.forEach(key => bannerCache.delete(key));
  
  // If cache is still too large, remove oldest entries aggressively
  if (bannerCache.size > MAX_CACHE_SIZE) {
    const sortedEntries = Array.from(bannerCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = sortedEntries.slice(0, bannerCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => bannerCache.delete(key));
  }
  
  // Update memory monitor with cache size
  if (memoryMonitor) {
    memoryMonitor.trackCache('bannerCache', bannerCache.size);
  }
  
  // Log if cache is getting large
  if (bannerCache.size > MAX_CACHE_SIZE * 0.8) {
    logger.warn('WTHR', `Banner cache is large: ${bannerCache.size}/${MAX_CACHE_SIZE} entries`);
  }
}

// Run cleanup every 1 minute to be more aggressive
setInterval(cleanupBannerCache, 60 * 1000);

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

// EST is UTC-5 (fixed offset for simplicity, not DST-aware)
const EST_OFFSET_HOURS = 5;
const EST_OFFSET_MS = EST_OFFSET_HOURS * 60 * 60 * 1000;

function getEasternReference(referenceDate = new Date()) {
  const baseDate = referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate);
  // Convert UTC to EST-equivalent by subtracting 5 hours
  const easternDate = new Date(baseDate.getTime() - EST_OFFSET_MS);
  const offsetMs = EST_OFFSET_MS; // Fixed offset
  return { easternDate, offsetMs };
}

/** Hour (0–23) in EST. Uses fixed UTC-5 offset. */
function getHourInEastern(date = new Date()) {
  // EST is UTC-5, so subtract 5 hours from UTC hour
  const utcHour = date.getUTCHours();
  const estHour = (utcHour - EST_OFFSET_HOURS + 24) % 24; // Handle negative wrap-around
  return estHour;
}

function getCurrentPeriodBounds(referenceDate = new Date()) {
  // Validate input
  if (!(referenceDate instanceof Date) || isNaN(referenceDate.getTime())) {
    console.error('[weatherService.js]: ❌ Invalid referenceDate provided to getCurrentPeriodBounds:', referenceDate);
    referenceDate = new Date(); // Fallback to now
  }

  // Weather day is 8am EST to 8am EST = 13:00 UTC to 13:00 UTC
  const currentHour = referenceDate.getUTCHours();
  const currentYear = referenceDate.getUTCFullYear();
  const currentMonth = referenceDate.getUTCMonth();
  const currentDay = referenceDate.getUTCDate();

  let startUTC, endUTC;

  if (currentHour >= 13) {
    // If it's 13:00 UTC or later (8am EST or later), period started at 13:00 UTC today
    startUTC = new Date(Date.UTC(currentYear, currentMonth, currentDay, 13, 0, 0, 0));
    // End is 13:00 UTC tomorrow
    endUTC = new Date(Date.UTC(currentYear, currentMonth, currentDay + 1, 13, 0, 0, 0));
  } else {
    // If it's before 13:00 UTC (before 8am EST), period started at 13:00 UTC yesterday
    startUTC = new Date(Date.UTC(currentYear, currentMonth, currentDay - 1, 13, 0, 0, 0));
    // End is 13:00 UTC today
    endUTC = new Date(Date.UTC(currentYear, currentMonth, currentDay, 13, 0, 0, 0));
  }

  // Validate calculated bounds
  if (isNaN(startUTC.getTime()) || isNaN(endUTC.getTime())) {
    console.error('[weatherService.js]: ❌ Invalid period bounds calculated', {
      referenceDate: referenceDate.toISOString(),
      startUTC: startUTC.toISOString(),
      endUTC: endUTC.toISOString()
    });
    throw new Error('Failed to calculate valid period bounds');
  }

  // Sanity check: end should be after start
  if (endUTC <= startUTC) {
    console.error('[weatherService.js]: ❌ Period bounds validation failed: end <= start', {
      startUTC: startUTC.toISOString(),
      endUTC: endUTC.toISOString()
    });
    throw new Error('Invalid period bounds: end time is not after start time');
  }

  return {
    startUTC,
    endUTC,
    startEastern,
    endEastern
  };
}

function getNextPeriodBounds(referenceDate = new Date()) {
  // Derive from current period + 24h so "next" is always the period after the current one.
  // Matches getCurrentPeriodBounds (including the "before 8 AM" adjustment).
  const current = getCurrentPeriodBounds(referenceDate);
  const msPerDay = 24 * 60 * 60 * 1000;

  const nextStartUTC = new Date(current.startUTC.getTime() + msPerDay);
  const nextEndUTC = new Date(current.endUTC.getTime() + msPerDay);
  const nextStartEastern = new Date(current.startEastern.getTime() + msPerDay);
  const nextEndEastern = new Date(current.endEastern.getTime() + msPerDay);

  // Validate calculated bounds
  if (isNaN(nextStartUTC.getTime()) || isNaN(nextEndUTC.getTime())) {
    console.error('[weatherService.js]: ❌ Invalid next period bounds calculated', {
      referenceDate: referenceDate.toISOString(),
      nextStartUTC: nextStartUTC.toISOString(),
      nextEndUTC: nextEndUTC.toISOString()
    });
    throw new Error('Failed to calculate valid next period bounds');
  }

  // Sanity check: next period should be after current period
  if (nextStartUTC <= current.startUTC || nextEndUTC <= current.endUTC) {
    console.error('[weatherService.js]: ❌ Next period bounds validation failed', {
      currentStart: current.startUTC.toISOString(),
      currentEnd: current.endUTC.toISOString(),
      nextStart: nextStartUTC.toISOString(),
      nextEnd: nextEndUTC.toISOString()
    });
    throw new Error('Invalid next period bounds: next period is not after current period');
  }

  return {
    startUTC: nextStartUTC,
    endUTC: nextEndUTC,
    startEastern: nextStartEastern,
    endEastern: nextEndEastern
  };
}

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

  const weather = await Weather.findOne(baseQuery).sort({ date: 1 });
  
  // Add debug logging to help troubleshoot
  if (!weather && onlyPosted) {
    console.log(`[weatherService.js]: No posted weather found for ${normalizedVillage} in period ${startUTC.toISOString()} to ${endUTC.toISOString()}`);
    // Try to find any weather in the period to see if it's a postedToDiscord issue
    const anyWeather = await Weather.findOne({
      village: normalizedVillage,
      date: dateRange
    }).sort({ date: 1 });
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
    console.warn('[weatherService.js]: No valid wind choices after filtering, using all options');
    return safeWeightedChoice(windOptions || [], weightMap);
  }
  
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
  
  // Fallback if filtering results in empty array
  if (!validPrecipitations || validPrecipitations.length === 0) {
    console.warn('[weatherService.js]: No valid precipitation choices after filtering, using all season options');
    const allPrecipitations = seasonData.Precipitation || [];
    if (allPrecipitations.length === 0) {
      console.error('[weatherService.js]: No precipitation options available for season');
      return null;
    }
    return safeWeightedChoice(allPrecipitations, weightMapping, modifierMap);
  }
  
  return safeWeightedChoice(validPrecipitations, weightMapping, modifierMap);
}

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
  
  // Fallback if filtering results in empty array
  if (!validSpecials || validSpecials.length === 0) {
    console.warn('[weatherService.js]: No valid special weather choices after filtering current conditions');
    return null; // Don't select invalid specials - skip special weather this time
  }
  
  return safeWeightedChoice(validSpecials, weightMapping, modifierMap);
}

// ============================================================================
// ------------------- Core Weather Generation -------------------
// ============================================================================

// ------------------- Unified Weather Generator -------------------
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
  }
  
  return result;
}

// ============================================================================
// ------------------- Weather Retrieval -------------------
// ============================================================================

// ------------------- Get Weather Without Generation -------------------
async function getWeatherWithoutGeneration(village, options = {}) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    const now = new Date();

    const { startUTC: startOfPeriodUTC } = getCurrentPeriodBounds(now);
    const { startUTC: startOfNextPeriodUTC } = getNextPeriodBounds(now);

    // Use a range that starts slightly before the period start to catch weather saved with different period calculations
    // This ensures we find weather even if the period calculation varies slightly
    const periodSearchStart = new Date(startOfPeriodUTC);
    periodSearchStart.setSeconds(periodSearchStart.getSeconds() - 1); // Include 1 second before period start

    // Add debug logging
    if (options.onlyPosted) {
      console.log(`[weatherService.js]: Looking for posted weather for ${normalizedVillage} in period ${periodSearchStart.toISOString()} to ${startOfNextPeriodUTC.toISOString()}`);
    }

    // Use exclusive upper bound to avoid picking up next period's weather
    const weather = await findWeatherForPeriod(normalizedVillage, periodSearchStart, startOfNextPeriodUTC, {
      exclusiveEnd: true,
      onlyPosted: options.onlyPosted
    });

    if (weather) {
      console.log(`[weatherService.js]: ✅ Found weather for ${normalizedVillage}: ID=${weather._id}, date=${weather.date?.toISOString()}, postedToDiscord=${weather.postedToDiscord}`);
    } else if (options.onlyPosted) {
      console.log(`[weatherService.js]: ⚠️ No posted weather found for ${normalizedVillage}`);
    }

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
    const now = new Date();

    const { startUTC: startOfPeriodUTC } = getCurrentPeriodBounds(now);
    const { startUTC: startOfNextPeriodUTC } = getNextPeriodBounds(now);

    // Normalize date to exact start of period (same as how we save it)
    // This ensures we find weather that was saved with normalized dates
    const normalizedDate = new Date(startOfPeriodUTC);
    normalizedDate.setMilliseconds(0);

    // FIRST: Check for existing weather using date range (covers entire period)
    // This is more reliable than exact match because period calculation may vary slightly
    // Use a range that starts slightly before the period start to catch weather saved with different period calculations
    const periodSearchStart = new Date(startOfPeriodUTC);
    periodSearchStart.setSeconds(periodSearchStart.getSeconds() - 1); // Include 1 second before period start
    
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
    
    // Validate weather is actually for current period (not future)
    if (weather) {
      const weatherDate = weather.date instanceof Date ? weather.date : new Date(weather.date);
      // If weather is for future period (more than 1 hour in future), it's Song of Storms - don't return it
      const oneHourFromNow = now.getTime() + (60 * 60 * 1000);
      if (weatherDate.getTime() > oneHourFromNow && weatherDate >= startOfNextPeriodUTC) {
        // This is future period weather (Song of Storms), don't return it
        weather = null;
      }
    }
    
    // Generate new weather if none exists or if we filtered out future weather
    if (!weather) {
      // Final check: Try range query one more time (race condition protection)
      // This catches weather that might have been saved between our checks
      const finalCheck = await findWeatherForPeriod(normalizedVillage, periodSearchStart, startOfNextPeriodUTC, {
        exclusiveEnd: true,
        onlyPosted: false
      });
      
      if (finalCheck) {
        // Weather exists, use it instead of generating new
        console.log(`[weatherService.js]: ✅ Found existing weather for ${normalizedVillage} period (ID: ${finalCheck._id}), using it instead of generating new`);
        weather = finalCheck;
      } else {
        console.log(`[weatherService.js]: 🔄 No existing weather found for ${normalizedVillage} period, generating new weather for date: ${startOfPeriodUTC.toISOString()}`);
        // No weather exists, generate new
        const season = getCurrentSeason();
        const newWeather = await simulateWeightedWeather(normalizedVillage, season, { useDatabaseHistory: true });
        
        if (!newWeather) {
          throw new Error(`Failed to generate weather for ${village}`);
        }
        
        // Use the already-normalized date (no need to normalize again)
        newWeather.date = normalizedDate;
        newWeather.season = season;
        newWeather.postedToDiscord = false; // Ensure it's marked as not posted

        // Save to database using findOneAndUpdate with upsert to prevent duplicates
        // Use exact date match (not range) to work with unique index on {village: 1, date: 1}
        // This atomically checks if weather exists and creates it if it doesn't
        try {
          const savedWeather = await Weather.findOneAndUpdate(
            {
              village: normalizedVillage,
              date: normalizedDate
            },
            newWeather,
            {
              upsert: true,
              new: true,
              setDefaultsOnInsert: true
            }
          );
          
          weather = savedWeather;
          console.log(`[weatherService.js]: ✅ Generated and saved new weather for ${normalizedVillage} period (ID: ${savedWeather._id}, Date: ${savedWeather.date.toISOString()})`);
        } catch (saveError) {
          // If save failed (e.g., duplicate key error), try to find the existing weather using range query
          if (saveError.code === 11000 || saveError.name === 'MongoServerError') {
            console.warn(`[weatherService.js]: Duplicate weather detected for ${village}, fetching existing record`);
            // Try range query first (most reliable - catches weather with different period calculations)
            const existingWeatherByRange = await findWeatherForPeriod(normalizedVillage, periodSearchStart, startOfNextPeriodUTC, {
              exclusiveEnd: true,
              onlyPosted: false
            });
            if (existingWeatherByRange) {
              weather = existingWeatherByRange;
              console.log(`[weatherService.js]: ✅ Found existing weather by range query (ID: ${existingWeatherByRange._id})`);
            } else {
              // Fallback to exact date match
              const existingWeather = await Weather.findOne({
                village: normalizedVillage,
                date: normalizedDate
              });
              if (existingWeather) {
                weather = existingWeather;
                console.log(`[weatherService.js]: ✅ Found existing weather by exact date match (ID: ${existingWeather._id})`);
              } else {
                console.error(`[weatherService.js]: ❌ Failed to save weather and could not find existing:`, saveError);
                throw saveError;
              }
            }
          } else {
            console.error(`[weatherService.js]: ❌ Failed to save weather to database:`, saveError);
            throw saveError;
          }
        }
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
  const overlayPath = path.join(__dirname, '..', '..', 'bot', 'assets', 'overlays', `ROOTS-${overlayName}.png`);
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
      
      // Cache if enabled
      if (enableCaching) {
        // Cleanup cache before adding new entry to prevent unbounded growth
        cleanupBannerCache();
        
        const cacheKey = `${village}-${weather.special?.label || weather.precipitation?.label}`;
        bannerCache.set(cacheKey, {
          banner,
          timestamp: Date.now()
        });
        
        // Update memory monitor with cache size
        if (memoryMonitor) {
          memoryMonitor.trackCache('bannerCache', bannerCache.size);
        }
      }
      
      return banner;
    } catch (overlayError) {
      console.error(`[weatherService.js]: ❌ Error loading/compositing overlay: ${overlayError.message}`);
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

// ------------------- Special Weather Flavor Text -------------------
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

// ------------------- Schedule Guaranteed Special Weather -------------------
/**
 * Schedules guaranteed special weather for the **next** period (8am–7:59am EST).
 * Song of Storms and any caller of this function schedule special weather for the next period
 * only; the current period is never modified.
 *
 * @param {string} village - Village name (Rudania, Inariko, Vhintl)
 * @param {string} specialLabel - Special weather label from weatherData.specials
 * @param {object} [options] - { triggeredBy, recipient, source }
 * @returns {Promise<{ weather, startOfPeriod, endOfPeriod }>}
 */
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
    const { startUTC: startOfNextPeriodUTC, endUTC: endOfNextPeriodUTC, startEastern: startOfNextPeriod } = getNextPeriodBounds(now);

    // Find or create weather document for next period
    let weatherDoc = await findWeatherForPeriod(
      normalizedVillage,
      startOfNextPeriodUTC,
      endOfNextPeriodUTC,
      { exclusiveEnd: true, onlyPosted: false }
    );

    const seasonForPeriod = getCurrentSeason(startOfNextPeriod);

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

    // Schedule Agenda job to post weather at period start
    try {
      const { getAgenda } = require('../../bot/scheduler/agenda');
      const agenda = getAgenda();
      if (agenda) {
        await agenda.schedule(startOfNextPeriodUTC, 'postScheduledSpecialWeather', {
          village: normalizedVillage
        });
      }
    } catch (agendaError) {
      // Agenda scheduling is optional - weather will still be posted by cron job
      console.warn('[weatherService.js]: Could not schedule Agenda job for special weather posting:', agendaError.message);
    }

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