const mongoose = require('mongoose');

const WeatherSchema = new mongoose.Schema({
  village: { 
    type: String, 
    required: true,
    enum: ['Rudania', 'Inariko', 'Vhintl']
  },
  date: { 
    type: Date, 
    required: true 
  },
  temperature: {
    label: String,
    emoji: String,
    probability: String
  },
  wind: {
    label: String,
    emoji: String,
    probability: String
  },
  precipitation: {
    label: String,
    emoji: String,
    probability: String
  },
  special: {
    label: String,
    emoji: String,
    probability: String
  },
  prediction: {
   lockedAt: Date,
   lockedById: String,
   lockedByName: String,
   targetCharacterId: String,
   targetCharacterName: String,
   viaBoost: Boolean,
   boostRequestId: String,
   periodStart: Date,
   periodEnd: Date
  },
  season: {
    type: String,
    required: true,
    enum: ['spring', 'summer', 'fall', 'winter']
  }
}, {
  timestamps: true
});

// Create compound index for quick lookups by village and date
WeatherSchema.index({ village: 1, date: 1 }, { unique: true });

// Static method to get weather for a specific village and date
WeatherSchema.statics.getWeather = async function(village, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return this.findOne({
    village,
    date: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  });
};

// Static method to save new weather
WeatherSchema.statics.saveWeather = async function(weatherData) {
  try {
    console.log(`[WeatherModel.js]: 🔄 Static saveWeather called for ${weatherData.village}`);
    console.log(`[WeatherModel.js]: 📊 Data received:`, {
      village: weatherData.village,
      date: weatherData.date,
      season: weatherData.season,
      hasTemperature: !!weatherData.temperature,
      hasWind: !!weatherData.wind,
      hasPrecipitation: !!weatherData.precipitation,
      hasSpecial: !!weatherData.special
    });
    
    const weather = new this(weatherData);
    console.log(`[WeatherModel.js]: ✅ Weather document created`);
    
    const savedWeather = await weather.save();
    console.log(`[WeatherModel.js]: ✅ Weather saved via static method, ID: ${savedWeather._id}`);
    
    return savedWeather;
  } catch (error) {
    console.error(`[WeatherModel.js]: ❌ Error in saveWeather static method:`, error);
    console.error(`[WeatherModel.js]: ❌ Error details:`, {
      message: error.message,
      code: error.code,
      name: error.name
    });
    throw error;
  }
};

// Static method to clear old weather data
WeatherSchema.statics.clearOldWeather = async function(daysToKeep = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  return this.deleteMany({
    date: { $lt: cutoffDate }
  });
};

// Static method to get recent weather history for a village
WeatherSchema.statics.getRecentWeather = async function(village, n = 3) {
  return this.find({ village })
    .sort({ date: -1 })
    .limit(n)
    .lean();
};

const Weather = mongoose.model('Weather', WeatherSchema);

module.exports = Weather; 