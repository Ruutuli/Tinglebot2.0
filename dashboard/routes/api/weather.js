// ============================================================================
// ------------------- Weather API Routes -------------------
// Routes for weather data and statistics
// ============================================================================

const express = require('express');
const router = express.Router();
const Weather = require('@/shared/models/WeatherModel');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('@/shared/utils/logger');
const { getWeatherWithoutGeneration } = require('@/shared/services/weatherService');

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
  const currentHourEastern = getHourInEastern(now);
  if (currentHourEastern < 8) {
    startEastern.setDate(startEastern.getDate() - 1);
  }
  
  // Recalculate offset for the startEastern date to handle DST correctly
  const { offsetMs: startOffsetMs } = getEasternReference(startEastern);
  
  // Calculate end of current weather period (7:59:59.999am EST next day)
  const endEastern = new Date(startEastern);
  endEastern.setDate(endEastern.getDate() + 1);
  endEastern.setHours(7, 59, 59, 999);
  
  // Recalculate offset for the endEastern date to handle DST correctly
  const { offsetMs: endOffsetMs } = getEasternReference(endEastern);
  
  // Convert to UTC using the offset calculated for each specific date
  const weatherDayStart = new Date(startEastern.getTime() + startOffsetMs);
  const weatherDayEnd = new Date(endEastern.getTime() + endOffsetMs);
  
  return { weatherDayStart, weatherDayEnd };
}

// ------------------- Function: getTodayWeather -------------------
// Returns today's weather for all villages (using 8am-7:59am EST weather day)
// Uses the same weather service function as the bot to ensure consistency
router.get('/today', asyncHandler(async (req, res) => {
  console.log('[weather.js API]: 🌤️ Weather API /today endpoint called');
  const { weatherDayStart, weatherDayEnd } = getWeatherDayBounds();
  console.log('[weather.js API]: 📅 Searching for weather in period:', {
    start: weatherDayStart.toISOString(),
    end: weatherDayEnd.toISOString()
  });
  
  // Use the same weather service function as the bot to ensure we get the correct weather
  // This ensures consistency between what's posted and what's displayed on the dashboard
  const weatherByVillage = {};
  const villages = ['Rudania', 'Inariko', 'Vhintl'];
  
  // Normalize date to exact start of period (same as how weather is saved)
  const normalizedDate = new Date(weatherDayStart);
  normalizedDate.setMilliseconds(0);
  
  // Create a range for the same second (to catch weather saved with milliseconds)
  const dateRangeStart = new Date(normalizedDate);
  const dateRangeEnd = new Date(normalizedDate);
  dateRangeEnd.setMilliseconds(999);
  
  for (const village of villages) {
    console.log(`[weather.js API]: 🔍 Fetching weather for ${village}...`);
    try {
      // FIRST: Try exact date match (most reliable - matches how weather is saved)
      let weather = await Weather.findOne({
        village: village,
        date: normalizedDate,
        postedToDiscord: true
      });
      
      if (weather) {
        console.log(`[weather.js API]: ${village} - Found by exact date match (ID: ${weather._id})`);
      } else {
        // SECOND: Try date within same second (catches weather saved with milliseconds)
        weather = await Weather.findOne({
          village: village,
          date: { $gte: dateRangeStart, $lte: dateRangeEnd },
          postedToDiscord: true
        });
        
        if (weather) {
          console.log(`[weather.js API]: ${village} - Found by same-second range (ID: ${weather._id}, date: ${weather.date?.toISOString()})`);
        } else {
          // THIRD: Try exact date without postedToDiscord requirement
          weather = await Weather.findOne({
            village: village,
            date: normalizedDate
          });
          
          if (weather) {
            console.log(`[weather.js API]: ${village} - Found by exact date (unposted, ID: ${weather._id})`);
          } else {
            // FIFTH: Try same-second range without postedToDiscord requirement
            weather = await Weather.findOne({
              village: village,
              date: { $gte: dateRangeStart, $lte: dateRangeEnd }
            });
            
            if (weather) {
              console.log(`[weather.js API]: ${village} - Found by same-second range (unposted, ID: ${weather._id})`);
            } else {
              // SIXTH: Use weather service function (range query as fallback)
              weather = await getWeatherWithoutGeneration(village, { onlyPosted: true });
              console.log(`[weather.js API]: ${village} - Range query (onlyPosted=true):`, weather ? `Found (ID: ${weather._id})` : 'Not found');
              
              // SEVENTH: Try without onlyPosted filter
              if (!weather) {
                console.log(`[weather.js API]: ⚠️ No posted weather found for ${village}, trying without onlyPosted filter`);
                logger.warn('weather.js', `No posted weather found for ${village}, trying without onlyPosted filter`);
                weather = await getWeatherWithoutGeneration(village, { onlyPosted: false });
                console.log(`[weather.js API]: ${village} - Range query (onlyPosted=false):`, weather ? `Found (ID: ${weather._id}, postedToDiscord=${weather.postedToDiscord})` : 'Not found');
                if (weather) {
                  logger.warn('weather.js', `Found unposted weather for ${village} - postedToDiscord=${weather.postedToDiscord}, postedAt=${weather.postedAt}`);
                }
              }
            }
          }
        }
      }
      
      if (weather) {
        try {
          // Convert mongoose document to plain object if needed
          const weatherObj = weather.toObject ? weather.toObject() : weather;
          
          // Ensure date is properly serialized - handle various date formats
          if (weatherObj.date) {
            if (weatherObj.date instanceof Date) {
              weatherObj.date = weatherObj.date.toISOString();
            } else if (typeof weatherObj.date === 'string') {
              // Already a string, keep it
            } else if (weatherObj.date.$date) {
              // MongoDB extended JSON format
              weatherObj.date = new Date(weatherObj.date.$date).toISOString();
            }
          }
          
          // Serialize nested date fields if they exist
          if (weatherObj.postedAt) {
            if (weatherObj.postedAt instanceof Date) {
              weatherObj.postedAt = weatherObj.postedAt.toISOString();
            } else if (weatherObj.postedAt.$date) {
              weatherObj.postedAt = new Date(weatherObj.postedAt.$date).toISOString();
            }
          }
          
          weatherByVillage[village] = weatherObj;
          
          // Safe date formatting for logging
          let weatherDateStr = 'unknown';
          try {
            if (weather.date) {
              if (weather.date instanceof Date) {
                weatherDateStr = weather.date.toISOString();
              } else if (typeof weather.date === 'string') {
                weatherDateStr = weather.date;
              } else if (weather.date.$date) {
                weatherDateStr = new Date(weather.date.$date).toISOString();
              }
            }
          } catch (dateError) {
            console.warn(`[weather.js API]: Error formatting date for ${village}:`, dateError.message);
            weatherDateStr = String(weather.date || 'unknown');
          }
          
          console.log(`[weather.js API]: ✅ Found weather for ${village} - ID: ${weather._id?.toString()}, date: ${weatherDateStr}, postedToDiscord: ${weather.postedToDiscord}`);
          // Only log if message is defined to avoid logger errors
          if (weatherDateStr) {
            logger.info('weather.js', `Found weather for ${village} - ID: ${weather._id?.toString()}, date: ${weatherDateStr}, postedToDiscord: ${weather.postedToDiscord}`);
          }
        } catch (processError) {
          console.error(`[weather.js API]: ❌ Error processing weather data for ${village}:`, processError);
          logger.error(`Error processing weather data for ${village}: ${processError.message || processError}`);
          // Still try to add the raw weather object
          weatherByVillage[village] = weather.toObject ? weather.toObject() : weather;
        }
      } else {
        // Log when weather is not found to help debug - include the date range being searched
        console.log(`[weather.js API]: ❌ No weather found for ${village} in current period`);
        console.log(`[weather.js API]:    Period range: ${weatherDayStart.toISOString()} to ${weatherDayEnd.toISOString()}`);
        console.log(`[weather.js API]:    Normalized date searched: ${normalizedDate.toISOString()}`);
        logger.warn('weather.js', `No weather found for ${village} in current period (${weatherDayStart.toISOString()} to ${weatherDayEnd.toISOString()})`);
        weatherByVillage[village] = null;
      }
    } catch (error) {
      console.error(`[weather.js API]: ❌ Error fetching weather for ${village}:`, error.message || error);
      logger.error('weather.js', `Error fetching weather for ${village}: ${error.message || error}`);
      weatherByVillage[village] = null;
    }
  }
  
  console.log('[weather.js API]: 📤 Returning weather data:', {
    date: weatherDayStart.toISOString(),
    villagesFound: Object.keys(weatherByVillage).filter(v => weatherByVillage[v] !== null).length,
    totalVillages: villages.length
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






