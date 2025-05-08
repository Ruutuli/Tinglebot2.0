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

// ------------------- Emoji Finder -------------------
// Finds the corresponding emoji object for a category and label.
function findWeatherEmoji(category, label) {
  const items = weatherData[category];
  if (!items) return null;
  return items.find(item => item.label === label) || null;
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
  if (normalizedCond === 'any') return true;
  if (precipitationAliases[normalizedCond]) {
    return precipitationAliases[normalizedCond]
      .some(alias => alias.toLowerCase() === normalizedLabel);
  }
  return normalizedLabel === normalizedCond;
}

// ------------------- Candidate Precipitation Validator -------------------
// Determines if a precipitation candidate is valid based on temperature and wind.
function candidateMatches(candidateLabel, simTemp, simWind) {
  const candidateObj = findWeatherEmoji('precipitations', candidateLabel);
  if (!candidateObj || !candidateObj.conditions) return true;
  const { temperature: tempConds, wind: windConds } = candidateObj.conditions;
  const tempOK = !tempConds || tempConds.every(cond => checkNumericCondition(simTemp, cond));
  const windOK = !windConds || windConds.every(cond => checkNumericCondition(simWind, cond));
  return tempOK && windOK;
}

// ------------------- Special Condition Validator -------------------
// Determines if a special weather candidate is valid based on temperature, wind, and precipitation.
function specialCandidateMatches(candidateLabel, simTemp, simWind, precipLabel) {
  const candidateObj = findWeatherEmoji('specials', candidateLabel);
  if (!candidateObj || !candidateObj.conditions) return true;
  const { temperature: tempConds, wind: windConds, precipitation: precipConds } = candidateObj.conditions;
  const tempOK = !tempConds || tempConds.every(cond => cond.toLowerCase() === 'any' || checkNumericCondition(simTemp, cond));
  const windOK = !windConds || windConds.every(cond => cond.toLowerCase() === 'any' || checkNumericCondition(simWind, cond));
  const precipOK = !precipConds || precipConds.some(cond => precipitationMatches(precipLabel, cond));
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
  const validCandidates = seasonData.Precipitation.filter(label => candidateMatches(label, simTemp, simWind));
  const pool = validCandidates.length ? validCandidates : seasonData.Precipitation;

  const adjustedWeights = { ...weightMapping };
  if (cloudyStreak > 0) {
    const boostFactor = 1 + cloudyStreak * 0.5;
    ['Rain', 'Light Rain', 'Heavy Rain', 'Thunderstorm'].forEach(label => {
      adjustedWeights[label] = (adjustedWeights[label] ?? 0.01) * boostFactor;
    });
  }
  return weightedChoice(pool, adjustedWeights, modifierMap);
}

// ------------------- Special Condition Selector -------------------
// Selects special weather condition based on dynamic rules (e.g., floods after rain).
function getSpecialCondition(seasonData, simTemp, simWind, precipLabel, rainStreak, weightMapping, modifierMap = {}) {
  if (!seasonData.Special.length || Math.random() >= 0.3) return null;

  const adjustedWeights = { ...weightMapping };
  if (rainStreak >= 2) {
    const boostFactor = rainStreak >= 3 ? 2 : 1.5;
    ['Flood'].forEach(label => {
      adjustedWeights[label] = (adjustedWeights[label] ?? 0.01) * boostFactor;
    });
  }

  for (let i = 0; i < 5; i++) {
    const candidate = weightedChoice(seasonData.Special, adjustedWeights, modifierMap);
    if (specialCandidateMatches(candidate, simTemp, simWind, precipLabel)) {
      return candidate;
    }
  }
  return null;
}

// ============================================================================
// ------------------- Simulation: Weighted -------------------
// Main exported function for weighted simulation with smoothing and modifiers
// ============================================================================
  
// ------------------- Weighted Weather Simulator -------------------
// Simulates weather with weighting, smoothing, and modifiers.
function simulateWeightedWeather(village, season) {
  try {
    if (!seasonsData[village]) {
      console.error('[weatherHandler.js]: Unknown village:', village);
      throw new Error(`[weatherHandler.js]: Unknown village: ${village}`);
    }
    const seasonData = seasonsData[village].seasons[season];
    if (!seasonData) {
      console.error('[weatherHandler.js]: Unknown season for village:', village, season);
      throw new Error(`[weatherHandler.js]: Unknown season "${season}" for village "${village}"`);
    }

    // ------------------- Modifiers -------------------
    const tempMods = weatherWeightModifiers[village]?.[season]?.temperature || {};
    const precipMods = weatherWeightModifiers[village]?.[season]?.precipitation || {};
    const specialMods = weatherWeightModifiers[village]?.[season]?.special || {};

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

    // ------------------- Logging -------------------
    console.log(`[WeatherSim] ${village} (${season})`);
    console.log(`  Temperature: ${temperatureLabel} (${temperatureProbability.toFixed(1)}%)`);
    console.log(`  Wind: ${windLabel} (${windProbability.toFixed(1)}%)`);
    console.log(`  Precipitation: ${precipitationLabel} (${precipitationProbability.toFixed(1)}%)`);
    if (specialConsidered) {
      if (specialLabel) {
        console.log(`  Special: ${specialLabel} (${specialProbability.toFixed(1)}%)`);
      } else {
        console.log(`  Special: None selected. Reason: ${specialReason}`);
      }
    } else {
      console.log(`  Special: Not considered. Reason: ${specialReason}`);
    }

    // ------------------- Update History -------------------
    updateWeatherHistory(village, {
      temperature: { label: temperatureLabel },
      wind: { label: windLabel },
      precipitation: { label: precipitationLabel },
      special: specialLabel ? { label: specialLabel } : null
    });

    return {
      village,
      season,
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
function updateWeatherHistory(village, weatherResult) {
  weatherHistoryByVillage[village] = weatherHistoryByVillage[village].slice(-2);
  weatherHistoryByVillage[village].push(weatherResult);
}

// ============================================================================
// ------------------- Exports -------------------
// Export core simulation methods and utility functions
// ============================================================================
module.exports = {
  chooseRandom,
  checkNumericCondition,
  findWeatherEmoji,
  getRandomInt,
  parseFahrenheit,
  parseWind,
  precipitationMatches,
  simulateWeightedWeather
};
