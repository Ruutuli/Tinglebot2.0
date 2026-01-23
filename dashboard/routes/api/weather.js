// ============================================================================
// ------------------- Weather API Routes -------------------
// Routes for weather data and statistics
// ============================================================================

const express = require('express');
const router = express.Router();
const Weather = require('../../models/WeatherModel.js');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger.js');
const { getWeatherWithoutGeneration } = require('../../services/weatherService.js');

// ------------------- Function: getWeatherDayBounds -------------------
// Calculates the start and end of the current weather day (1pm to 12:59pm UTC)
// Returns UTC timestamps for database queries
// Weather day is 1pm UTC (13:00) to 12:59pm UTC (12:59:59) the next day
function getWeatherDayBounds() {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const currentDay = now.getUTCDate();
  
  let weatherDayStart, weatherDayEnd;
  
  if (currentHour > 13 || (currentHour === 13 && currentMinute >= 0)) {
    // If it's 1:00pm UTC or later, period started at 1:00pm UTC today
    weatherDayStart = new Date(Date.UTC(currentYear, currentMonth, currentDay, 13, 0, 0, 0));
    // End is 12:59:59pm UTC tomorrow
    weatherDayEnd = new Date(Date.UTC(currentYear, currentMonth, currentDay + 1, 12, 59, 59, 999));
  } else {
    // If it's before 1:00pm UTC, period started at 1:00pm UTC yesterday
    weatherDayStart = new Date(Date.UTC(currentYear, currentMonth, currentDay - 1, 13, 0, 0, 0));
    // End is 12:59:59pm UTC today
    weatherDayEnd = new Date(Date.UTC(currentYear, currentMonth, currentDay, 12, 59, 59, 999));
  }
  
  return { weatherDayStart, weatherDayEnd };
}

// ------------------- Function: getTodayWeather -------------------
// Returns today's weather for all villages (using 1pm-12:59pm UTC weather day)
// Uses the same weather service function as the bot to ensure consistency
router.get('/today', asyncHandler(async (req, res) => {
  const { weatherDayStart, weatherDayEnd } = getWeatherDayBounds();
  
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
    try {
      // FIRST: Try exact date match (most reliable - matches how weather is saved)
      let weather = await Weather.findOne({
        village: village,
        date: normalizedDate,
        postedToDiscord: true
      });
      
      if (!weather) {
        // SECOND: Try date within same second (catches weather saved with milliseconds)
        weather = await Weather.findOne({
          village: village,
          date: { $gte: dateRangeStart, $lte: dateRangeEnd },
          postedToDiscord: true
        });
      }
      
      if (!weather) {
        // THIRD: Try exact date without postedToDiscord requirement
        weather = await Weather.findOne({
          village: village,
          date: normalizedDate
        });
      }
      
      if (!weather) {
        // FOURTH: Try same-second range without postedToDiscord requirement
        weather = await Weather.findOne({
          village: village,
          date: { $gte: dateRangeStart, $lte: dateRangeEnd }
        });
      }
      
      if (!weather) {
        // FIFTH: Try wider range (24 hours before period start) to catch timezone mismatches
        const wideRangeStart = new Date(weatherDayStart);
        wideRangeStart.setUTCHours(wideRangeStart.getUTCHours() - 24);
        weather = await Weather.findOne({
          village: village,
          date: { $gte: wideRangeStart, $lte: weatherDayEnd },
          postedToDiscord: true
        });
      }
      
      if (!weather) {
        // SIXTH: Use weather service function (range query as fallback)
        weather = await getWeatherWithoutGeneration(village, { onlyPosted: true });
      }
      
      if (!weather) {
        // SEVENTH: Try without onlyPosted filter
        logger.warn('WEATHER', `No posted weather found for ${village}, trying without onlyPosted filter`);
        weather = await getWeatherWithoutGeneration(village, { onlyPosted: false });
        if (weather) {
          logger.warn('WEATHER', `Found unposted weather for ${village} - postedToDiscord=${weather.postedToDiscord}`);
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
            weatherDateStr = String(weather.date || 'unknown');
          }
          
          logger.debug('WEATHER', `Found weather for ${village} - ID: ${weather._id?.toString()}, date: ${weatherDateStr}`);
        } catch (processError) {
          logger.error('WEATHER', `Error processing weather data for ${village}: ${processError.message || processError}`);
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
  
  const villagesFound = Object.keys(weatherByVillage).filter(v => weatherByVillage[v] !== null).length;
  logger.debug('WEATHER', `Returning weather data: ${villagesFound}/${villages.length} villages found`);
  
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
// Returns weather statistics/history for all villages
router.get('/stats', asyncHandler(async (req, res) => {
  const villages = ['Rudania', 'Inariko', 'Vhintl'];
  const days = parseInt(req.query.days) || 30;
  
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const villagesData = {};
  
  for (const village of villages) {
    try {
      // Fetch weather history for the specified number of days
      const villageWeather = await Weather.find({ 
        village,
        date: { $gte: startDate, $lte: endDate }
      })
        .sort({ date: -1 })
        .lean();
      
      // Convert dates to ISO strings for JSON serialization
      const formattedWeather = villageWeather.map(w => {
        const weatherObj = { ...w };
        if (weatherObj.date instanceof Date) {
          weatherObj.date = weatherObj.date.toISOString();
        }
        if (weatherObj.postedAt instanceof Date) {
          weatherObj.postedAt = weatherObj.postedAt.toISOString();
        }
        return weatherObj;
      });
      
      villagesData[village] = formattedWeather;
    } catch (error) {
      logger.error('WEATHER', `Error fetching weather stats for ${village}: ${error.message || error}`);
      villagesData[village] = [];
    }
  }
  
  res.json({ villages: villagesData });
}));

module.exports = router;






