// ============================================================================
// ------------------- Weather API Routes -------------------
// Routes for weather data and statistics
// ============================================================================

const express = require('express');
const router = express.Router();
const Weather = require('../../models/WeatherModel');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// ------------------- Function: getWeatherDayBounds -------------------
// Calculates the start and end of the current weather day (8am to 8am)
function getWeatherDayBounds() {
  const now = new Date();
  const currentHour = now.getHours();
  
  let weatherDayStart, weatherDayEnd;
  
  if (currentHour >= 8) {
    // If it's 8am or later, the weather day started at 8am today
    weatherDayStart = new Date(now);
    weatherDayStart.setHours(8, 0, 0, 0);
    
    weatherDayEnd = new Date(now);
    weatherDayEnd.setDate(weatherDayEnd.getDate() + 1);
    weatherDayEnd.setHours(8, 0, 0, 0);
  } else {
    // If it's before 8am, the weather day started at 8am yesterday
    weatherDayStart = new Date(now);
    weatherDayStart.setDate(weatherDayStart.getDate() - 1);
    weatherDayStart.setHours(8, 0, 0, 0);
    
    weatherDayEnd = new Date(now);
    weatherDayEnd.setHours(8, 0, 0, 0);
  }
  
  return { weatherDayStart, weatherDayEnd };
}

// ------------------- Function: getTodayWeather -------------------
// Returns today's weather for all villages (using 8am-8am weather day)
router.get('/today', asyncHandler(async (req, res) => {
  const { weatherDayStart, weatherDayEnd } = getWeatherDayBounds();
  
  // Get weather for all villages for the current weather day
  const weatherData = await Weather.find({
    date: {
      $gte: weatherDayStart,
      $lt: weatherDayEnd
    }
  }).lean();
  
  // Organize by village
  const weatherByVillage = {};
  const villages = ['Rudania', 'Inariko', 'Vhintl'];
  
  villages.forEach(village => {
    const villageWeather = weatherData.find(w => w.village === village);
    weatherByVillage[village] = villageWeather || null;
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



