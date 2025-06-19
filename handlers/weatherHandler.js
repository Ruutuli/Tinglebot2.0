// ============================================================================
// 🌤️ Weather Handler
// Simulates weather and provides utility functions for parsing, validation,
// and consistent formatting. Used across multiple modules.
// ============================================================================

// ------------------- Modules -------------------
// Local modules for seasons data, weather data, and modifier logic
const seasonsData = require('../data/seasonsData');
const weatherData = require('../data/weatherData');
const { weatherWeightModifiers } = require('../data/weatherData');
const Weather = require('../models/WeatherModel');
const { validateWeatherCombination, findWeatherEmoji } = require('../utils/weatherValidation');

// Helper to normalize season names
function normalizeSeason(season) {
  if (!season) return '';
  return season.charAt(0).toUpperCase() + season.slice(1).toLowerCase();
}

// ============================================================================
// ------------------- Weather History Memory -------------------
// Stores recent weather history by village for smoothing transitions
// ============================================================================
const weatherHistoryByVillage = {
  Rudania: [],
  Inariko: [],
  Vhintl: []
};

// ============================================================================
// ------------------- Utility Functions -------------------
// Generic helper utilities for randomness, parsing, and validation
// ============================================================================

// ------------------- Random Integer Generator -------------------
// Generates a random integer between min (inclusive) and max (exclusive).
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

// ------------------- Array Random Selection -------------------
// Selects a random element from an array.
function chooseRandom(array) {
  if (!array || array.length === 0) return null;
  return array[getRandomInt(0, array.length)];
}

// ------------------- Fahrenheit Parser -------------------
// Parses a "##°F" label and returns the numeric temperature.
function parseFahrenheit(label) {
  if (typeof label !== 'string') return null;
  const match = label.match(/(\d+)\s*°F/);
  return match ? parseInt(match[1], 10) : null;
}

// ------------------- Wind Parser -------------------
// Extracts numeric wind speed from a string label.
function parseWind(label) {
  const match = label.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// ------------------- Numeric Condition Checker -------------------
// Evaluates numeric conditions (e.g., ">50") against a value.
function checkNumericCondition(value, condition) {
  const match = condition.match(/(<=|<|>=|>)(\s*\d+)/);
  if (!match) return true;
  const [, operator, numStr] = match;
  const num = parseFloat(numStr);
  switch (operator) {
    case '<': return value < num;
    case '<=': return value <= num;
    case '>': return value > num;
    case '>=': return value >= num;
    default: return true;
  }
}

// ============================================================================
// ------------------- Precipitation & Special Helpers -------------------
// Aliases and matching logic for precipitation and special conditions
// ============================================================================
const precipitationAliases = {
  rain: ['Rain', 'Light Rain', 'Heavy Rain', 'Sun Shower', 'Thunderstorm'],
  snow: ['Snow', 'Light Snow', 'Heavy Snow', 'Thundersnow']
};

// ------------------- Precipitation Matcher -------------------
// Checks if a precipitation label matches a condition alias or exact match.
function precipitationMatches(label, condition) {
  const normalizedLabel = label.toLowerCase();
  const normalizedCond = condition.toLowerCase();
  
  // Handle "any" condition
  if (normalizedCond === 'any') return true;
  
  // Handle precipitation aliases
  if (precipitationAliases[normalizedCond]) {
    return precipitationAliases[normalizedCond]
      .some(alias => alias.toLowerCase() === normalizedLabel);
  }
  
  // Handle exact matches
  return normalizedLabel === normalizedCond;
}

// ------------------- Candidate Precipitation Validator -------------------
// Determines if a precipitation candidate is valid based on temperature and wind.
function candidateMatches(candidateLabel, simTemp, simWind) {
  const candidateObj = findWeatherEmoji('precipitations', candidateLabel);
  if (!candidateObj || !candidateObj.conditions) return true;
  
  const { temperature: tempConds, wind: windConds } = candidateObj.conditions;
  
  // Handle temperature conditions
  const tempOK = !tempConds || tempConds.every(cond => {
    if (cond === 'any') return true;
    return checkNumericCondition(simTemp, cond);
  });
  
  // Handle wind conditions
  const windOK = !windConds || windConds.every(cond => {
    if (cond === 'any') return true;
    return checkNumericCondition(simWind, cond);
  });
  
  return tempOK && windOK;
}

// ------------------- Special Condition Validator -------------------
// Determines if a special weather candidate is valid based on temperature, wind, and precipitation.
function specialCandidateMatches(candidateLabel, simTemp, simWind, precipLabel) {
  const candidateObj = findWeatherEmoji('specials', candidateLabel);
  if (!candidateObj || !candidateObj.conditions) return true;
  
  const { temperature: tempConds, wind: windConds, precipitation: precipConds } = candidateObj.conditions;
  
  // Handle temperature conditions
  const tempOK = !tempConds || tempConds.every(cond => {
    if (cond === 'any') return true;
    return checkNumericCondition(simTemp, cond);
  });
  
  // Handle wind conditions
  const windOK = !windConds || windConds.every(cond => {
    if (cond === 'any') return true;
    return checkNumericCondition(simWind, cond);
  });
  
  // Handle precipitation conditions
  const precipOK = !precipConds || precipConds.some(cond => {
    if (cond === 'any') return true;
    return precipitationMatches(precipLabel, cond);
  });

  // Log validation details for debugging
  if (!tempOK || !windOK || !precipOK) {
    console.log(`[weatherHandler.js]: Special weather validation failed for ${candidateLabel}:`, {
      temperature: { conditions: tempConds, value: simTemp, valid: tempOK },
      wind: { conditions: windConds, value: simWind, valid: windOK },
      precipitation: { conditions: precipConds, value: precipLabel, valid: precipOK }
    });
  }
  
  return tempOK && windOK && precipOK;
}

// ============================================================================
// ------------------- Weighted Selection Utilities -------------------
// Provides tools for probability-based selections and scoring
// ============================================================================
  
// ------------------- Weighted Choice Selector -------------------
// Selects a candidate from a list based on weighted probabilities.
function weightedChoice(candidates, weightMapping, modifierMap = {}) {
  let totalWeight = 0;
  const weightedCandidates = candidates.map(candidate => {
    const baseWeight = weightMapping[candidate] ?? 0.01;
    const modifier = modifierMap[candidate] ?? 1;
    const weight = baseWeight * modifier;
    totalWeight += weight;
    return { candidate, weight };
  });

  let threshold = Math.random() * totalWeight;
  for (const { candidate, weight } of weightedCandidates) {
    threshold -= weight;
    if (threshold < 0) return candidate;
  }
  return candidates[candidates.length - 1];
}

// ------------------- Probability Calculator -------------------
// Calculates the probability percentage for a selected candidate.
function calculateCandidateProbability(candidates, weightMapping, selectedCandidate, modifierMap = {}) {
  const totalWeight = candidates.reduce((sum, candidate) => {
    const base = weightMapping[candidate] ?? 0.01;
    const mod = modifierMap[candidate] ?? 1;
    return sum + (base * mod);
  }, 0);
  const selectedWeight = (weightMapping[selectedCandidate] ?? 0.01) * (modifierMap[selectedCandidate] ?? 1);
  return (selectedWeight / totalWeight) * 100;
}

// ============================================================================
// ------------------- Dynamic Condition Labelers -------------------
// Selects precipitation and special conditions with dynamic weighting
// ============================================================================

// ------------------- Precipitation Label Selector -------------------
// Selects precipitation label based on seasonData, temperature, wind, and dynamic weights.
function getPrecipitationLabel(seasonData, simTemp, simWind, cloudyStreak, weightMapping, modifierMap = {}) {
  // First filter out invalid candidates based on conditions
  const validCandidates = seasonData.Precipitation.filter(label => 
    candidateMatches(label, simTemp, simWind)
  );
  
  // If no valid candidates, return null to indicate no valid precipitation
  if (validCandidates.length === 0) {
    console.warn('[weatherHandler.js]: No valid precipitation candidates found');
    return null;
  }
  
  const adjustedWeights = { ...weightMapping };
  if (cloudyStreak > 0) {
    const boostFactor = 1 + cloudyStreak * 0.5;
    ['Rain', 'Light Rain', 'Heavy Rain', 'Thunderstorm'].forEach(label => {
      adjustedWeights[label] = (adjustedWeights[label] ?? 0.01) * boostFactor;
    });
  }
  
  const selectedLabel = weightedChoice(validCandidates, adjustedWeights, modifierMap);
  return selectedLabel;
}

// ------------------- Special Condition Selector -------------------
// Selects special weather condition based on dynamic rules (e.g., floods after rain).
function getSpecialCondition(seasonData, simTemp, simWind, precipLabel, rainStreak, weightMapping, modifierMap = {}) {
  if (!seasonData.Special.length || Math.random() >= 0.3) return null;
  
  // Filter out invalid special conditions based on current weather
  const validSpecials = seasonData.Special.filter(specialType => 
    specialCandidateMatches(specialType, simTemp, simWind, precipLabel)
  );
  
  if (validSpecials.length === 0) {
    console.log(`[weatherHandler.js]: No valid special conditions for current weather:`, {
      temperature: simTemp,
      wind: simWind,
      precipitation: precipLabel
    });
    return null;
  }
  
  const adjustedWeights = { ...weightMapping };
  if (rainStreak >= 2) {
    const boostFactor = rainStreak >= 3 ? 2 : 1.5;
    ['Flood'].forEach(label => {
      adjustedWeights[label] = (adjustedWeights[label] ?? 0.01) * boostFactor;
    });
  }
  
  const selectedSpecial = weightedChoice(validSpecials, adjustedWeights, modifierMap);
  
  // Log special weather selection details
  console.log(`[weatherHandler.js]: Selected special weather: ${selectedSpecial}`, {
    temperature: simTemp,
    wind: simWind,
    precipitation: precipLabel,
    validSpecials: validSpecials.length
  });
  
  return selectedSpecial;
}

// ============================================================================
// ------------------- Simulation: Weighted -------------------
// Main exported function for weighted simulation with smoothing and modifiers
// ============================================================================
  
// ------------------- Weight Modifier Validator -------------------
// Validates that weight modifiers are within expected ranges and logs any issues
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
    console.warn(`[weatherHandler.js]: Weight modifier issues for ${village} in ${season}:`, issues);
  }
  
  return issues.length === 0;
}

// ------------------- Weighted Weather Simulator -------------------
// Simulates weather with weighting, smoothing, and modifiers.
function simulateWeightedWeather(village, season) {
  try {
    if (!seasonsData[village]) {
      console.error('[weatherHandler.js]: Unknown village:', village);
      throw new Error(`[weatherHandler.js]: Unknown village: ${village}`);
    }

    // Normalize season name to match seasonsData format
    const normalizedSeason = normalizeSeason(season);
    const seasonData = seasonsData[village].seasons[normalizedSeason];
    if (!seasonData) {
      console.error('[weatherHandler.js]: Unknown season for village:', village, normalizedSeason);
      throw new Error(`[weatherHandler.js]: Unknown season "${normalizedSeason}" for village "${village}"`);
    }

    // ------------------- Modifiers -------------------
    const tempMods = weatherWeightModifiers[village]?.[normalizedSeason]?.temperature || {};
    const precipMods = weatherWeightModifiers[village]?.[normalizedSeason]?.precipitation || {};
    const specialMods = weatherWeightModifiers[village]?.[normalizedSeason]?.special || {};
    
    // Validate weight modifiers
    validateWeightModifiers(village, normalizedSeason, {
      temperature: tempMods,
      precipitation: precipMods,
      special: specialMods
    });

    // ------------------- History & Streaks -------------------
    const history = weatherHistoryByVillage[village] || [];
    const previous = history[history.length - 1] || {};
    const secondPrevious = history[history.length - 2] || {};
    const cloudyStreak = [previous, secondPrevious]
      .filter(w => ['Cloudy', 'Partly cloudy'].includes(w?.precipitation?.label))
      .length;
    const rainStreak = history.slice(-3)
      .filter(w => ['Rain', 'Light Rain', 'Heavy Rain', 'Thunderstorm']
      .includes(w?.precipitation?.label))
      .length;
    const hadStormYesterday = ['Thunderstorm', 'Heavy Rain'].includes(previous.precipitation?.label);

    // ------------------- Temperature -------------------
    const temperatureLabel = getSmoothedTemperature(
      seasonData.Temperature,
      previous,
      hadStormYesterday,
      weatherData.temperatureWeights,
      tempMods
    );
    const simTemp = parseFahrenheit(temperatureLabel);

    // ------------------- Wind -------------------
    const windLabel = getSmoothedWind(
      seasonData.Wind,
      previous,
      weatherData.windWeights
    );
    const simWind = parseWind(windLabel);

    // ------------------- Precipitation -------------------
    const precipitationLabel = getPrecipitationLabel(
      seasonData,
      simTemp,
      simWind,
      cloudyStreak,
      weatherData.precipitationWeights,
      precipMods
    );

    // ------------------- Special Conditions -------------------
    let specialLabel = null;
    let specialConsidered = false;
    let specialReason = '';
    if (seasonData.Special.length && Math.random() < 0.3) {
      specialConsidered = true;
      specialLabel = getSpecialCondition(
        seasonData,
        simTemp,
        simWind,
        precipitationLabel,
        rainStreak,
        weatherData.specialWeights,
        specialMods
      );
      if (!specialLabel) {
        specialReason = 'No valid special met the conditions.';
      }
    } else if (!seasonData.Special.length) {
      specialReason = 'No specials defined for this season.';
    } else {
      specialReason = 'Random chance did not allow special weather today.';
    }

    // ------------------- Probability Calculations -------------------
    const temperatureProbability = calculateCandidateProbability(
      seasonData.Temperature,
      weatherData.temperatureWeights,
      temperatureLabel,
      tempMods
    );
    const windProbability = calculateCandidateProbability(
      seasonData.Wind,
      weatherData.windWeights,
      windLabel
    );
    const precipitationProbability = calculateCandidateProbability(
      seasonData.Precipitation,
      weatherData.precipitationWeights,
      precipitationLabel,
      precipMods
    );
    const specialProbability = specialLabel
      ? calculateCandidateProbability(seasonData.Special, weatherData.specialWeights, specialLabel, specialMods)
      : 0;

    // ------------------- Emoji Decoration -------------------
    const temperatureObj = findWeatherEmoji('temperatures', temperatureLabel);
    const windObj = findWeatherEmoji('winds', windLabel);
    const precipitationObj = findWeatherEmoji('precipitations', precipitationLabel);
    const specialObj = specialLabel ? findWeatherEmoji('specials', specialLabel) : null;

    // ------------------- Update History -------------------
    const weatherResult = {
      village,
      season: season.toLowerCase(), // Store lowercase season
      temperature: {
        label: temperatureLabel,
        emoji: temperatureObj?.emoji || '',
        probability: `${temperatureProbability.toFixed(1)}%`
      },
      wind: {
        label: windLabel,
        emoji: windObj?.emoji || '',
        probability: `${windProbability.toFixed(1)}%`
      },
      precipitation: {
        label: precipitationLabel,
        emoji: precipitationObj?.emoji || '',
        probability: `${precipitationProbability.toFixed(1)}%`
      },
      special: specialLabel
        ? {
            label: specialLabel,
            emoji: specialObj?.emoji || '',
            probability: `${specialProbability.toFixed(1)}%`
          }
        : null
    };

    console.log(`[weatherHandler.js]: Generated weather for ${village}:`, weatherResult);
    return weatherResult;
  } catch (error) {
    console.error('[weatherHandler.js]: simulateWeightedWeather error:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Smoothing Helpers -------------------
// Provides functions to smooth temperature and wind based on recent history
// ============================================================================
  
// ------------------- Temperature Smoothing Choices -------------------
// Filters temperature options close to the previous temperature.
function getSmoothTemperatureChoices(currentTempF, seasonTemps, forceDrop = false) {
  const maxDelta = forceDrop ? 0 : 10;
  return seasonTemps.filter(label => {
    const temp = parseFahrenheit(label);
    return temp !== null && Math.abs(temp - currentTempF) <= maxDelta;
  });
}

// ------------------- Wind Smoothing Choices -------------------
// Restricts wind options to adjacent values in the wind ranking.
function getSmoothWindChoices(currentWindLabel, seasonWinds) {
  const index = seasonWinds.indexOf(currentWindLabel);
  return [index - 1, index, index + 1]
    .filter(i => i >= 0 && i < seasonWinds.length)
    .map(i => seasonWinds[i]);
}

// ============================================================================
// ------------------- Smoothing Wrappers -------------------
// Wraps smoothing + weighting for temperature and wind
// ============================================================================
  
// ------------------- Smoothed Temperature Selector -------------------
// Chooses temperature with smoothing and modifiers.
function getSmoothedTemperature(tempOptions, previous, hadStormYesterday, weightMap, modifierMap) {
  const prevTemp = parseFahrenheit(previous?.temperature?.label);
  const filtered = previous?.temperature?.label
    ? getSmoothTemperatureChoices(prevTemp, tempOptions, hadStormYesterday)
    : tempOptions;
  return weightedChoice(filtered, weightMap, modifierMap);
}

// ------------------- Smoothed Wind Selector -------------------
// Chooses wind with smoothing and modifiers.
function getSmoothedWind(windOptions, previous, weightMap) {
  const filtered = previous?.wind?.label
    ? getSmoothWindChoices(previous.wind?.label, windOptions)
    : windOptions;
  return weightedChoice(filtered, weightMap);
}

// ============================================================================
// ------------------- Weather History Updater -------------------
// Maintains rolling history for smoothing transitions
// ============================================================================
  
// ------------------- History Updater -------------------
// Updates weather history buffer for a village.
async function updateWeatherHistory(village, weatherResult) {
  // Try to generate valid weather with retry limit
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    // Validate weather combination
    if (validateWeatherCombination(weatherResult)) {
      console.log(`[weatherHandler.js]: Valid weather generated on attempt ${attempts}`);
      break;
    } else {
      console.log(`[weatherHandler.js]: Invalid weather generated on attempt ${attempts}, retrying...`);
      if (attempts === maxAttempts) {
        console.warn(`[weatherHandler.js]: Failed to generate valid weather after ${maxAttempts} attempts, removing special weather`);
        weatherResult.special = null;
      } else {
        // Regenerate the entire weather for this attempt
        const season = weatherResult.season;
        const normalizedSeason = normalizeSeason(season);
        const seasonData = seasonsData[village].seasons[normalizedSeason];
        
        // Regenerate temperature, wind, and precipitation
        const tempMods = weatherWeightModifiers[village]?.[normalizedSeason]?.temperature || {};
        const precipMods = weatherWeightModifiers[village]?.[normalizedSeason]?.precipitation || {};
        const specialMods = weatherWeightModifiers[village]?.[normalizedSeason]?.special || {};
        
        const history = weatherHistoryByVillage[village] || [];
        const previous = history[history.length - 1] || {};
        const hadStormYesterday = ['Thunderstorm', 'Heavy Rain'].includes(previous.precipitation?.label);
        
        // Regenerate temperature
        const temperatureLabel = getSmoothedTemperature(
          seasonData.Temperature,
          previous,
          hadStormYesterday,
          weatherData.temperatureWeights,
          tempMods
        );
        const simTemp = parseFahrenheit(temperatureLabel);
        
        // Regenerate wind
        const windLabel = getSmoothedWind(
          seasonData.Wind,
          previous,
          weatherData.windWeights
        );
        const simWind = parseWind(windLabel);
        
        // Regenerate precipitation
        const cloudyStreak = [previous]
          .filter(w => ['Cloudy', 'Partly cloudy'].includes(w?.precipitation?.label))
          .length;
        const precipitationLabel = getPrecipitationLabel(
          seasonData,
          simTemp,
          simWind,
          cloudyStreak,
          weatherData.precipitationWeights,
          precipMods
        );
        
        // Regenerate special weather
        let specialLabel = null;
        if (seasonData.Special.length && Math.random() < 0.3) {
          const rainStreak = history.slice(-3)
            .filter(w => ['Rain', 'Light Rain', 'Heavy Rain', 'Thunderstorm']
            .includes(w?.precipitation?.label))
            .length;
          specialLabel = getSpecialCondition(
            seasonData,
            simTemp,
            simWind,
            precipitationLabel,
            rainStreak,
            weatherData.specialWeights,
            specialMods
          );
        }
        
        // Update weather result with new values
        const temperatureObj = findWeatherEmoji('temperatures', temperatureLabel);
        const windObj = findWeatherEmoji('winds', windLabel);
        const precipitationObj = findWeatherEmoji('precipitations', precipitationLabel);
        const specialObj = specialLabel ? findWeatherEmoji('specials', specialLabel) : null;
        
        weatherResult.temperature = {
          label: temperatureLabel,
          emoji: temperatureObj?.emoji || '',
          probability: weatherResult.temperature.probability
        };
        weatherResult.wind = {
          label: windLabel,
          emoji: windObj?.emoji || '',
          probability: weatherResult.wind.probability
        };
        weatherResult.precipitation = {
          label: precipitationLabel,
          emoji: precipitationObj?.emoji || '',
          probability: weatherResult.precipitation.probability
        };
        weatherResult.special = specialLabel
          ? {
              label: specialLabel,
              emoji: specialObj?.emoji || '',
              probability: weatherResult.special?.probability || '10%'
            }
          : null;
      }
    }
  }

  weatherHistoryByVillage[village] = weatherHistoryByVillage[village].slice(-2);
  weatherHistoryByVillage[village].push(weatherResult);
  
  // Add required fields to weather data before saving
  const weatherDataWithRequiredFields = {
    village: village,
    date: new Date(),
    season: weatherResult.season.toLowerCase(),
    temperature: {
      label: weatherResult.temperature.label,
      emoji: weatherResult.temperature.emoji,
      probability: weatherResult.temperature.probability
    },
    wind: {
      label: weatherResult.wind.label,
      emoji: weatherResult.wind.emoji,
      probability: weatherResult.wind.probability
    },
    precipitation: {
      label: weatherResult.precipitation.label,
      emoji: weatherResult.precipitation.emoji,
      probability: weatherResult.precipitation.probability
    }
  };

  // Add special weather if it exists
  if (weatherResult.special) {
    weatherDataWithRequiredFields.special = {
      label: weatherResult.special.label,
      emoji: weatherResult.special.emoji,
      probability: weatherResult.special.probability
    };
  }
  
  // Save weather to database using Weather model's static method
  await Weather.saveWeather(weatherDataWithRequiredFields);
}

// ============================================================================
// ------------------- Exports -------------------
// Export core simulation methods and utility functions
// ============================================================================
module.exports = {
  simulateWeightedWeather,
  getRandomInt,
  chooseRandom,
  parseFahrenheit,
  parseWind,
  checkNumericCondition,
  findWeatherEmoji,
  precipitationMatches,
  candidateMatches,
  specialCandidateMatches,
  weightedChoice,
  calculateCandidateProbability,
  getPrecipitationLabel,
  getSpecialCondition,
  getSmoothTemperatureChoices,
  getSmoothWindChoices,
  getSmoothedTemperature,
  getSmoothedWind,
  updateWeatherHistory,
  validateWeatherCombination
};
