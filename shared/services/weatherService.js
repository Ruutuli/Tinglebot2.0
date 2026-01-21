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
const LEGACY_PERIOD_FALLBACK_MS = 8 * 60 * 60 * 1000; // 8 hours
const PERIOD_VALIDATION_TOLERANCE_MS = 5 * 1000; // 5 seconds - tolerance for timing differences in period calculation

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

const EST_TZ = 'America/New_York';

function getEasternReference(referenceDate = new Date()) {
  const baseDate = referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate);
  const easternDate = new Date(baseDate.toLocaleString('en-US', { timeZone: EST_TZ }));
  const offsetMs = baseDate.getTime() - easternDate.getTime();
  return { easternDate, offsetMs };
}

/** Hour (0–23) in EST/EDT. Codebase uses America/New_York for all weather periods. */
function getHourInEastern(date = new Date()) {
  return parseInt(
    new Intl.DateTimeFormat('en-CA', { timeZone: EST_TZ, hour: '2-digit', hour12: false }).format(date),
    10
  );
}

function getCurrentPeriodBounds(referenceDate = new Date()) {
  // Validate input
  if (!(referenceDate instanceof Date) || isNaN(referenceDate.getTime())) {
    console.error('[weatherService.js]: ❌ Invalid referenceDate provided to getCurrentPeriodBounds:', referenceDate);
    referenceDate = new Date(); // Fallback to now
  }

  const { easternDate, offsetMs } = getEasternReference(referenceDate);

  const startEastern = new Date(easternDate);
  startEastern.setHours(8, 0, 0, 0);

  if (getHourInEastern(referenceDate) < 8) {
    startEastern.setDate(startEastern.getDate() - 1);
  }

  const endEastern = new Date(startEastern);
  endEastern.setDate(endEastern.getDate() + 1);
  endEastern.setHours(7, 59, 59, 999);

  // Recalculate offset for end date to handle DST transitions correctly
  const { offsetMs: endOffsetMs } = getEasternReference(endEastern);

  const startUTC = new Date(startEastern.getTime() + offsetMs);
  const endUTC = new Date(endEastern.getTime() + endOffsetMs);

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
  const { legacyFallback = true, fallbackWindowMs = LEGACY_PERIOD_FALLBACK_MS, exclusiveEnd = false, onlyPosted = false } = options;
  const normalizedVillage = normalizeVillageName(village);

  const dateRange = exclusiveEnd
    ? { $gte: startUTC, $lt: endUTC }
    : { $gte: startUTC, $lte: endUTC };

  const baseQuery = { village: normalizedVillage, date: dateRange };
  if (onlyPosted) {
    // Exclude future/scheduled weather (e.g. Song of Storms) that hasn't been posted yet.
    // Include: postedToDiscord true, or legacy docs without the field.
    // This will automatically exclude postedToDiscord: false documents.
    baseQuery.$or = [
      { postedToDiscord: true },
      { postedToDiscord: { $exists: false } }
    ];
  }

  let weather = await Weather.findOne(baseQuery).sort({ date: 1 });

  // Period validation: ensure retrieved weather is actually within the requested bounds
  if (weather && onlyPosted) {
    const weatherDate = weather.date instanceof Date ? weather.date : new Date(weather.date);
    const isValidDate = exclusiveEnd
      ? (weatherDate >= startUTC && weatherDate < endUTC)
      : (weatherDate >= startUTC && weatherDate <= endUTC);
    
    if (!isValidDate) {
      console.warn(`[weatherService.js]: ⚠️ Retrieved weather outside period bounds for ${normalizedVillage}`, {
        weatherDate: weatherDate.toISOString(),
        startUTC: startUTC.toISOString(),
        endUTC: endUTC.toISOString(),
        exclusiveEnd,
        postedToDiscord: weather.postedToDiscord,
        hasSpecial: !!weather.special,
        specialLabel: weather.special?.label || 'none'
      });
      weather = null; // Reject weather outside bounds
    } else {
      console.log(`[weatherService.js]: ✅ Valid weather retrieved for ${normalizedVillage}`, {
        weatherDate: weatherDate.toISOString(),
        postedToDiscord: weather.postedToDiscord,
        hasSpecial: !!weather.special,
        specialLabel: weather.special?.label || 'none',
        onlyPosted
      });
    }
  }

  if (!weather && legacyFallback) {
    const legacyQuery = {
      village: normalizedVillage,
      date: {
        $gte: new Date(startUTC.getTime() - fallbackWindowMs),
        $lte: new Date(endUTC.getTime() - fallbackWindowMs)
      }
    };
    if (onlyPosted) {
      legacyQuery.$or = [
        { postedToDiscord: true },
        { postedToDiscord: { $exists: false } }
      ];
    }
    const legacyWeather = await Weather.findOne(legacyQuery);

    if (legacyWeather) {
      // Validate legacy weather is actually within current period bounds before using it
      const legacyDate = legacyWeather.date instanceof Date ? legacyWeather.date : new Date(legacyWeather.date);
      const legacyIsInBounds = exclusiveEnd
        ? (legacyDate >= startUTC && legacyDate < endUTC)
        : (legacyDate >= startUTC && legacyDate <= endUTC);

      if (!legacyIsInBounds && legacyDate >= endUTC) {
        // Legacy weather is from future period - reject it to prevent next period leaks
        console.warn(`[weatherService.js]: ⚠️ Legacy weather rejected: outside current period bounds for ${normalizedVillage}`, {
          legacyDate: legacyDate.toISOString(),
          startUTC: startUTC.toISOString(),
          endUTC: endUTC.toISOString()
        });
        return null;
      }

      // Check if the legacy weather's date is already close to the target period
      // If it's within 1 hour of the start, it was likely already realigned
      const timeDiff = Math.abs(legacyDate.getTime() - startUTC.getTime());
      const oneHourMs = 60 * 60 * 1000;
      
      // Only realign if the date is significantly different AND the legacy date is before the period start
      // Don't realign if legacy date is in the future (next period) - that should have been caught above
      if (timeDiff > oneHourMs && legacyDate < startUTC) {
        // Realign to period start only if legacy is from past period
        // Use a timestamp to ensure exact match
        const targetDate = new Date(startUTC.getTime());
        legacyWeather.date = targetDate;

        if (legacyWeather.prediction) {
          legacyWeather.prediction.periodStart = targetDate;
          legacyWeather.prediction.periodEnd = endUTC;
          legacyWeather.markModified('prediction');
        }

        // Save the realigned weather
        try {
          weather = await legacyWeather.save();
          
          // Verify the saved date is within bounds (with tolerance for timing differences)
          const savedDate = weather.date instanceof Date ? weather.date : new Date(weather.date);
          const toleranceMs = PERIOD_VALIDATION_TOLERANCE_MS;
          const savedIsValid = exclusiveEnd
            ? (savedDate >= new Date(startUTC.getTime() - toleranceMs) && savedDate < endUTC)
            : (savedDate >= new Date(startUTC.getTime() - toleranceMs) && savedDate <= endUTC);
          
          if (!savedIsValid) {
            console.warn(`[weatherService.js]: ⚠️ Realigned date is outside bounds after save for ${normalizedVillage}`, {
              savedDate: savedDate.toISOString(),
              startUTC: startUTC.toISOString(),
              endUTC: endUTC.toISOString(),
              exclusiveEnd
            });
            weather = null;
          } else {
            console.log(`[weatherService.js]: ℹ️ Realigned legacy weather record for ${normalizedVillage} to new UTC window.`);
          }
        } catch (saveError) {
          console.error(`[weatherService.js]: ❌ Error saving realigned weather for ${normalizedVillage}:`, saveError);
          weather = null;
        }
      } else if (legacyDate >= startUTC && legacyDate < endUTC) {
        // Date is already within bounds - use it without realignment
        weather = legacyWeather;
      } else {
        // Legacy date is outside bounds and shouldn't be realigned - reject it
        console.warn(`[weatherService.js]: ⚠️ Legacy weather date cannot be realigned for ${normalizedVillage}`, {
          legacyDate: legacyDate.toISOString(),
          startUTC: startUTC.toISOString(),
          endUTC: endUTC.toISOString(),
          timeDiffHours: (timeDiff / oneHourMs).toFixed(2)
        });
        weather = null;
      }

      // Final validation after legacy handling
      if (weather && onlyPosted) {
        const finalDate = weather.date instanceof Date ? weather.date : new Date(weather.date);
        
        // Validate date is valid
        if (isNaN(finalDate.getTime())) {
          console.error(`[weatherService.js]: ❌ Invalid date in legacy weather for ${normalizedVillage}`, {
            date: weather.date,
            type: typeof weather.date
          });
          weather = null;
        } else {
          // Use tolerance for timing differences in period calculation
          const toleranceMs = PERIOD_VALIDATION_TOLERANCE_MS;
          const periodStartWithTolerance = new Date(startUTC.getTime() - toleranceMs);
          const finalIsValid = exclusiveEnd
            ? (finalDate >= periodStartWithTolerance && finalDate < endUTC)
            : (finalDate >= periodStartWithTolerance && finalDate <= endUTC);
          
          if (!finalIsValid) {
            console.warn(`[weatherService.js]: ⚠️ Legacy weather rejected after realignment: outside period bounds for ${normalizedVillage}`, {
              finalDate: finalDate.toISOString(),
              startUTC: startUTC.toISOString(),
              periodStartWithTolerance: periodStartWithTolerance.toISOString(),
              endUTC: endUTC.toISOString(),
              exclusiveEnd
            });
            weather = null;
          }
        }
      }
    }
  }

  // Final database consistency check: validate weather structure before returning
  if (weather) {
    // Check for required fields
    if (!weather.village || !weather.date) {
      console.error(`[weatherService.js]: ❌ Weather document missing required fields for ${normalizedVillage}`, {
        hasVillage: !!weather.village,
        hasDate: !!weather.date,
        weatherKeys: Object.keys(weather)
      });
      return null;
    }

    // Validate date is a valid Date object or can be converted to one
    const weatherDate = weather.date instanceof Date ? weather.date : new Date(weather.date);
    if (isNaN(weatherDate.getTime())) {
      console.error(`[weatherService.js]: ❌ Weather document has invalid date for ${normalizedVillage}`, {
        date: weather.date,
        type: typeof weather.date
      });
      return null;
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
async function getWeatherWithoutGeneration(village, options = {}) {
  try {
    const normalizedVillage = normalizeVillageName(village);
    const now = new Date();

    console.log(`[weatherService.js]: 🔍 Getting weather for ${normalizedVillage}`, {
      onlyPosted: options.onlyPosted,
      timestamp: now.toISOString()
    });

    const { startUTC: startOfPeriodUTC } = getCurrentPeriodBounds(now);
    const { startUTC: startOfNextPeriodUTC } = getNextPeriodBounds(now);

    console.log(`[weatherService.js]: 📅 Period bounds calculated for ${normalizedVillage}`, {
      periodStart: startOfPeriodUTC.toISOString(),
      nextPeriodStart: startOfNextPeriodUTC.toISOString(),
      onlyPosted: options.onlyPosted
    });

    // Use exclusive upper bound (next period's start) so we never pick up the next period's
    // weather (e.g. tomorrow's Song of Storms Rock Slide when today is Muggy).
    // onlyPosted: when true, exclude future/scheduled weather (e.g. Song of Storms) that
    // hasn't been posted yet — use for gathering/specialweather so players only get
    // the in-effect (posted) weather for the current period.
    const weather = await findWeatherForPeriod(normalizedVillage, startOfPeriodUTC, startOfNextPeriodUTC, {
      exclusiveEnd: true,
      onlyPosted: options.onlyPosted
    });

    // Validate that returned weather is for the current period (not future)
    if (weather) {
      const weatherDate = weather.date instanceof Date ? weather.date : new Date(weather.date);
      
      // Ensure weather is within current period bounds
      // Use tolerance on lower bound to account for timing differences when period bounds are recalculated
      const periodStartWithTolerance = new Date(startOfPeriodUTC.getTime() - PERIOD_VALIDATION_TOLERANCE_MS);
      if (weatherDate < periodStartWithTolerance || weatherDate >= startOfNextPeriodUTC) {
        console.error('[weatherService.js]: ❌ Retrieved weather outside current period bounds', {
          village: normalizedVillage,
          weatherDate: weatherDate.toISOString(),
          periodStart: startOfPeriodUTC.toISOString(),
          periodStartWithTolerance: periodStartWithTolerance.toISOString(),
          nextPeriodStart: startOfNextPeriodUTC.toISOString(),
          onlyPosted: options.onlyPosted,
          postedToDiscord: weather.postedToDiscord,
          hasSpecial: !!weather.special,
          specialLabel: weather.special?.label || 'none'
        });
        return null; // Reject weather from future periods
      }

      // Additional validation: ensure weather date is not in the future (within reasonable margin for clock skew)
      // However, if the weather date is within the current period bounds, it's valid even if it's ahead of current time
      // This can happen when the period starts at 8 AM EST (13:00 UTC) and current time is earlier
      const nowPlusMargin = new Date(now.getTime() + (5 * 60 * 1000)); // 5 minute margin for clock skew
      const maxFutureAllowed = new Date(startOfPeriodUTC.getTime() + (24 * 60 * 60 * 1000)); // Allow up to 24h into period
      
      if (weatherDate > nowPlusMargin && weatherDate > maxFutureAllowed) {
        console.warn('[weatherService.js]: ⚠️ Retrieved weather is significantly in the future', {
          village: normalizedVillage,
          weatherDate: weatherDate.toISOString(),
          currentTime: now.toISOString(),
          periodStart: startOfPeriodUTC.toISOString(),
          timeDiffMs: weatherDate.getTime() - now.getTime(),
          timeDiffHours: ((weatherDate.getTime() - now.getTime()) / (60 * 60 * 1000)).toFixed(2)
        });
        // Still allow it if within period bounds, but log warning
      } else if (weatherDate > nowPlusMargin) {
        // Weather is in the future but within the period - this is expected for period start times
        console.log('[weatherService.js]: ℹ️ Weather date is in future but within period bounds (expected for period start)', {
          village: normalizedVillage,
          weatherDate: weatherDate.toISOString(),
          currentTime: now.toISOString(),
          periodStart: startOfPeriodUTC.toISOString()
        });
      }

      console.log(`[weatherService.js]: ✅ Successfully retrieved weather for ${normalizedVillage}`, {
        weatherDate: weatherDate.toISOString(),
        postedToDiscord: weather.postedToDiscord,
        hasSpecial: !!weather.special,
        specialLabel: weather.special?.label || 'none',
        onlyPosted: options.onlyPosted
      });
    } else {
      console.log(`[weatherService.js]: ℹ️ No weather found for ${normalizedVillage}`, {
        onlyPosted: options.onlyPosted,
        periodStart: startOfPeriodUTC.toISOString(),
        nextPeriodStart: startOfNextPeriodUTC.toISOString()
      });
    }

    return weather;
  } catch (error) {
    console.error('[weatherService.js]: ❌ Error getting weather:', error);
    console.error('[weatherService.js]: Error details:', {
      village,
      onlyPosted: options.onlyPosted,
      stack: error.stack
    });
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

    // Use exclusive upper bound so we never pick up the next period's weather.
    let weather = await findWeatherForPeriod(normalizedVillage, startOfPeriodUTC, startOfNextPeriodUTC, {
      exclusiveEnd: true
    });
    
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
        newWeather.date = startOfPeriodUTC;
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

    // Song of Storms: special weather is always for the NEXT period, never the current one.
    // All weather periods are EST/EDT (America/New_York): 8:00 AM to 7:59:59 AM the next day.
    const now = new Date();
    const raw = getNextPeriodBounds(now);
    const startOfNextPeriodUTC = raw.startUTC;
    const endOfNextPeriodUTC = raw.endUTC;
    const startOfNextPeriod = raw.startEastern;

    // Validate that the next period is in the future (never schedule for the current period)
    if (startOfNextPeriodUTC <= now) {
      console.error('[weatherService.js]: ❌ Date calculation error in scheduleSpecialWeather', {
        currentTime: now.toISOString(),
        nextPeriodStart: startOfNextPeriodUTC.toISOString(),
        village: normalizedVillage
      });
      throw new Error('Calculated next period is not in the future. This indicates a date calculation error.');
    }

    // Additional validation: ensure the scheduled date is clearly in the future period
    const timeUntilNextPeriod = startOfNextPeriodUTC.getTime() - now.getTime();
    const oneHourMs = 60 * 60 * 1000;
    if (timeUntilNextPeriod < oneHourMs) {
      console.warn('[weatherService.js]: ⚠️ Warning: Scheduled weather is very close to current time', {
        timeUntilNextPeriodMs: timeUntilNextPeriod,
        timeUntilNextPeriodHours: (timeUntilNextPeriod / oneHourMs).toFixed(2),
        village: normalizedVillage
      });
    }

    console.log('[weatherService.js]: 🎵 Song of Storms: scheduling special for next period', {
      currentTimeUTC: now.toISOString(),
      nextPeriodStartUTC: startOfNextPeriodUTC.toISOString(),
      nextPeriodEndUTC: endOfNextPeriodUTC.toISOString(),
      village: normalizedVillage,
      specialLabel: normalizedLabel,
      timeUntilNextPeriodMs: startOfNextPeriodUTC.getTime() - now.getTime(),
      timeUntilNextPeriodHours: ((startOfNextPeriodUTC.getTime() - now.getTime()) / (60 * 60 * 1000)).toFixed(2)
    });

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
        precipitation: generatedWeather.precipitation,
        postedToDiscord: false  // Explicitly mark future weather as not posted
      });
    } else {
      // Existing weather doc for next period - ensure it's marked as not posted
      // This prevents future weather from being accessible via onlyPosted: true filter
      if (!weatherDoc.postedToDiscord) {
        weatherDoc.postedToDiscord = false;
      }
      if (!weatherDoc.season) {
        weatherDoc.season = seasonForPeriod;
      }
    }

    const existingSpecialLabel = weatherDoc?.special?.label;
    const existingSpecialProbability = weatherDoc?.special?.probability;
    // Song of Storms overwrites a naturally rolled special for the next period;
    // only blocks when a guaranteed special is already set.
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
    console.log('[weatherService.js]: ✅ Song of Storms weather document created', {
      village: normalizedVillage,
      special: specialEntry.label,
      date: savedWeather.date?.toISOString() || startOfNextPeriodUTC.toISOString(),
      postedToDiscord: savedWeather.postedToDiscord,
      hasSpecial: !!savedWeather.special,
      specialLabel: savedWeather.special?.label
    });

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
  
  // Constants
  PERIOD_VALIDATION_TOLERANCE_MS,
  
  // Cache management
  bannerCache
}; 