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
  const weather = new this(weatherData);
  return weather.save();
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