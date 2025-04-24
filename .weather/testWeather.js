// .weather/runWeightedWeather.js

const {
  simulateWeightedWeather,
  findWeatherEmoji,
  chooseRandom
} = require('./weatherHandler');
const seasonsData = require('./seasonsData');

/**
 * Convert Fahrenheit string ("##°F") to Celsius integer
 */
function fahrenheitToCelsius(label) {
  const f = parseInt(label, 10);
  return Math.round((f - 32) * 5 / 9);
}

/**
 * Pretty‐print a weighted weather simulation
 */
function printWeightedWeather(village, season) {
  // Validate
  if (!seasonsData[village]) {
    console.error(`❌ No weather data for village "${village}".`);
    return;
  }
  if (!seasonsData[village].seasons[season]) {
    console.error(`❌ "${village}" has no season "${season}".`);
    return;
  }

  // Run simulation
  const result = simulateWeightedWeather(village, season);
  const { temperature, wind, precipitation, special } = result;

  // Look up any extra descriptions (if provided in your weatherData)
  const tempMeta = findWeatherEmoji('temperatures', temperature.label) || {};
  const windMeta = findWeatherEmoji('winds', wind.label) || {};

  const tempC = fahrenheitToCelsius(temperature.label);
  const tempDesc = tempMeta.description || '';
  const windDesc = windMeta.description || '';

  console.log('============================================================');
  console.log(`🌍 Village:       ${result.village}`);
  console.log(`🍃 Season:        ${result.season}`);
  console.log('------------------------------------------------------------');
  console.log(
    `🌡️  Temperature:   ${temperature.label} / ${tempC}°C` +
    (tempDesc ? ` - ${tempDesc}` : '') +
    ` ${temperature.emoji}`
  );
  console.log(
    `🌬️ Wind:          ${wind.label}` +
    (windDesc ? ` // ${windDesc}` : '') +
    ` ${wind.emoji}`
  );
  console.log(`🌧️ Precipitation: ${precipitation.label} ${precipitation.emoji}`);
  console.log(
    `✨ Special:       ${special ? `${special.label} ${special.emoji}` : 'None'}`
  );
  console.log('============================================================');
}

// ─── Pick a random valid village & season ─────────────────────────────────

const villages = Object.keys(seasonsData);

let village, season;
do {
  village = chooseRandom(villages);
  const seasons = Object.keys(seasonsData[village].seasons);
  season = chooseRandom(seasons);
  // if you ever support villages without all seasons,
  // this loop will skip invalid combos
} while (!seasonsData[village]?.seasons?.[season]);

// ─── Run & print ─────────────────────────────────────────────────────────

printWeightedWeather(village, season);
