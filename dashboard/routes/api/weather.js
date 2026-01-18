// ============================================================================
// ------------------- Weather API Routes -------------------
// Routes for weather data and statistics
// ============================================================================

const express = require('express');
const router = express.Router();
const Weather = require('../../../shared/models/WeatherModel');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../../shared/utils/logger');

// ------------------- Function: getWeatherDayBounds -------------------
// Calculates the start and end of the current weather day (8am to 7:59am EST)
// Returns UTC timestamps for database queries
// Uses the same logic as getCurrentPeriodBounds in weatherService.js
function getWeatherDayBounds() {
  const EST_TZ = 'America/New_York';
  
  // Helper to get eastern reference date and offset (same as weatherService.js)
  const getEasternReference = (referenceDate = new Date()) => {
    const baseDate = referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate);
    const easternDate = new Date(baseDate.toLocaleString('en-US', { timeZone: EST_TZ }));
    const offsetMs = baseDate.getTime() - easternDate.getTime();
    return { easternDate, offsetMs };
  };
  
  // Helper to get hour in EST/EDT
  const getHourInEastern = (date = new Date()) => {
    return parseInt(
      new Intl.DateTimeFormat('en-CA', { timeZone: EST_TZ, hour: '2-digit', hour12: false }).format(date),
      10
    );
  };
  
  const now = new Date();
  const { easternDate, offsetMs } = getEasternReference(now);
  
  // Calculate start of current weather period (8am EST)
  const startEastern = new Date(easternDate);
  startEastern.setHours(8, 0, 0, 0);
  
  // If it's before 8am EST, the period started yesterday at 8am EST
  if (getHourInEastern(now) < 8) {
    startEastern.setDate(startEastern.getDate() - 1);
  }
  
  // Calculate end of current weather period (7:59:59.999am EST next day)
  const endEastern = new Date(startEastern);
  endEastern.setDate(endEastern.getDate() + 1);
  endEastern.setHours(7, 59, 59, 999);
  
  // Convert to UTC using the offset
  const weatherDayStart = new Date(startEastern.getTime() + offsetMs);
  const weatherDayEnd = new Date(endEastern.getTime() + offsetMs);
  
  return { weatherDayStart, weatherDayEnd };
}

// ------------------- Function: getTodayWeather -------------------
// Returns today's weather for all villages (using 8am-7:59am EST weather day)
router.get('/today', asyncHandler(async (req, res) => {
  const { weatherDayStart, weatherDayEnd } = getWeatherDayBounds();
  
  logger.info('WEATHER_API', `Fetching weather for period: ${weatherDayStart.toISOString()} to ${weatherDayEnd.toISOString()}`);
  
  // Get weather for all villages for the current weather day
  // Include only posted weather (exclude future/scheduled weather that hasn't been posted yet)
  const weatherQuery = {
    date: {
      $gte: weatherDayStart,
      $lt: weatherDayEnd
    },
    $or: [
      { postedToDiscord: true },
      { postedToDiscord: { $exists: false } } // Include legacy docs without the field
    ]
  };
  
  logger.info('WEATHER_API', `Query: ${JSON.stringify(weatherQuery)}`);
  
  const weatherData = await Weather.find(weatherQuery).lean();
  
  logger.info('WEATHER_API', `Found ${weatherData.length} weather records in period`);
  
  // Log all villages found for debugging
  weatherData.forEach(w => {
    logger.info('WEATHER_API', `Weather record: village="${w.village}", date=${w.date?.toISOString()}`);
  });
  
  // Helper to normalize village name (same as weatherService.js)
  const normalizeVillageName = (name) => {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  };
  
  // Organize by village - use case-insensitive matching
  const weatherByVillage = {};
  const villages = ['Rudania', 'Inariko', 'Vhintl'];
  
  villages.forEach(village => {
    // Normalize the search village name
    const normalizedVillage = normalizeVillageName(village);
    
    // Find weather record with case-insensitive village name match
    const villageWeather = weatherData.find(w => {
      const normalizedDbVillage = normalizeVillageName(w.village);
      return normalizedDbVillage === normalizedVillage;
    });
    
    weatherByVillage[village] = villageWeather || null;
    if (villageWeather) {
      logger.info('WEATHER_API', `Found weather for ${village}: ${villageWeather.date?.toISOString()}`);
    } else {
      logger.warn('WEATHER_API', `No weather found for ${village} (searched for normalized: "${normalizedVillage}")`);
    }
  });
  
  res.json({
    date: weatherDayStart,
    villages: weatherByVillage
  });
}));

// ------------------- Function: getWeatherHistory -------------------
// Returns weather history for a specific village
router.get('/history/:village', asyncHandler(async (req, res) => {
  const { village } = req.params;
  const limit = parseInt(req.query.limit) || 30;
  
  const weatherHistory = await Weather.find({ village })
    .sort({ date: -1 })
    .limit(limit)
    .lean();
  
  res.json({ data: weatherHistory });
}));

// ------------------- Function: getWeatherStats -------------------
// Returns weather statistics
router.get('/stats', asyncHandler(async (req, res) => {
  const villages = ['Rudania', 'Inariko', 'Vhintl'];
  const stats = {};
  
  for (const village of villages) {
    const villageWeather = await Weather.find({ village }).lean();
    const weatherTypes = {};
    
    villageWeather.forEach(w => {
      const type = w.weatherType || 'unknown';
      weatherTypes[type] = (weatherTypes[type] || 0) + 1;
    });
    
    stats[village] = {
      totalDays: villageWeather.length,
      weatherTypes
    };
  }
  
  res.json({ stats });
}));

module.exports = router;






