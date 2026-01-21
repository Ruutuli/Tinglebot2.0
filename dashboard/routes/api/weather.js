// ============================================================================
// ------------------- Weather API Routes -------------------
// Routes for weather data and statistics
// ============================================================================

const express = require('express');
const router = express.Router();
const Weather = require('@app/shared/models/WeatherModel');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('@app/shared/utils/logger');

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
  
  logger.info('WEATHER_BOUNDS', `Current time: ${now.toISOString()}, Eastern date: ${easternDate.toISOString()}, Offset: ${offsetMs}ms (${Math.round(offsetMs / (60 * 60 * 1000))} hours)`);
  
  // Calculate start of current weather period (8am EST)
  const startEastern = new Date(easternDate);
  startEastern.setHours(8, 0, 0, 0);
  
  // If it's before 8am EST, the period started yesterday at 8am EST
  const currentHourEastern = getHourInEastern(now);
  if (currentHourEastern < 8) {
    startEastern.setDate(startEastern.getDate() - 1);
  }
  
  logger.info('WEATHER_BOUNDS', `Current hour in EST: ${currentHourEastern}, Start Eastern: ${startEastern.toISOString()}`);
  
  // Recalculate offset for the startEastern date to handle DST correctly
  const { offsetMs: startOffsetMs } = getEasternReference(startEastern);
  
  // Calculate end of current weather period (7:59:59.999am EST next day)
  const endEastern = new Date(startEastern);
  endEastern.setDate(endEastern.getDate() + 1);
  endEastern.setHours(7, 59, 59, 999);
  
  logger.info('WEATHER_BOUNDS', `End Eastern: ${endEastern.toISOString()}`);
  
  // Recalculate offset for the endEastern date to handle DST correctly
  const { offsetMs: endOffsetMs } = getEasternReference(endEastern);
  
  // Convert to UTC using the offset calculated for each specific date
  const weatherDayStart = new Date(startEastern.getTime() + startOffsetMs);
  const weatherDayEnd = new Date(endEastern.getTime() + endOffsetMs);
  
  logger.info('WEATHER_BOUNDS', `Calculated UTC bounds - Start: ${weatherDayStart.toISOString()}, End: ${weatherDayEnd.toISOString()}`);
  logger.info('WEATHER_BOUNDS', `Offsets used - Start: ${startOffsetMs}ms, End: ${endOffsetMs}ms`);
  
  return { weatherDayStart, weatherDayEnd };
}

// ------------------- Function: getTodayWeather -------------------
// Returns today's weather for all villages (using 8am-7:59am EST weather day)
router.get('/today', asyncHandler(async (req, res) => {
  const { weatherDayStart, weatherDayEnd } = getWeatherDayBounds();
  
  logger.info('WEATHER_API', `Fetching weather for period: ${weatherDayStart.toISOString()} to ${weatherDayEnd.toISOString()}`);
  
  // Get weather for all villages for the current weather day
  // Include only posted weather (exclude future/scheduled weather that hasn't been posted yet)
  // Add a small buffer (1 second) to account for any timing precision issues
  const bufferMs = 1000; // 1 second buffer
  const queryStart = new Date(weatherDayStart.getTime() - bufferMs);
  const queryEnd = new Date(weatherDayEnd.getTime() + bufferMs);
  
  const weatherQuery = {
    date: {
      $gte: queryStart,
      $lt: queryEnd
    },
    $or: [
      { postedToDiscord: true },
      { postedToDiscord: { $exists: false } } // Include legacy docs without the field
    ]
  };
  
  logger.info('WEATHER_API', `Query date range: ${queryStart.toISOString()} to ${queryEnd.toISOString()}`);
  
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
  
  for (const village of villages) {
    // Normalize the search village name
    const normalizedVillage = normalizeVillageName(village);
    
    // First, try to find weather record in the current period with case-insensitive village name match
    let villageWeather = weatherData.find(w => {
      const normalizedDbVillage = normalizeVillageName(w.village);
      return normalizedDbVillage === normalizedVillage;
    });
    
    // If no weather found in the exact period, look for the most recent posted weather for this village
    if (!villageWeather) {
      logger.warn('WEATHER_API', `No weather found for ${village} in current period, searching for most recent posted weather...`);
      
      // Try exact village name first (since enum guarantees exact match)
      let fallbackWeather = await Weather.findOne({
        village: village, // Exact match (enum guarantees this format)
        $or: [
          { postedToDiscord: true },
          { postedToDiscord: { $exists: false } }
        ]
      })
        .sort({ date: -1 }) // Get most recent
        .lean();
      
      // If still not found, try case-insensitive match (for legacy data or edge cases)
      if (!fallbackWeather) {
        fallbackWeather = await Weather.findOne({
          village: { $regex: new RegExp(`^${normalizedVillage}$`, 'i') },
          $or: [
            { postedToDiscord: true },
            { postedToDiscord: { $exists: false } }
          ]
        })
          .sort({ date: -1 })
          .lean();
      }
      
      if (fallbackWeather) {
        logger.info('WEATHER_API', `Found fallback weather for ${village}: ${fallbackWeather.date?.toISOString()}, postedToDiscord: ${fallbackWeather.postedToDiscord}`);
        villageWeather = fallbackWeather;
      } else {
        logger.warn('WEATHER_API', `No posted weather found for ${village} at all. Checking if any weather exists (posted or not)...`);
        
        // Last resort: check if any weather exists at all for debugging
        const anyWeather = await Weather.findOne({ village: village })
          .sort({ date: -1 })
          .lean();
        if (anyWeather) {
          logger.warn('WEATHER_API', `Found unposted weather for ${village}: date=${anyWeather.date?.toISOString()}, postedToDiscord=${anyWeather.postedToDiscord}`);
        } else {
          logger.warn('WEATHER_API', `No weather records exist in database for ${village}`);
        }
      }
    } else {
      logger.info('WEATHER_API', `Found weather for ${village} in current period: ${villageWeather.date?.toISOString()}`);
    }
    
    weatherByVillage[village] = villageWeather || null;
  }
  
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






