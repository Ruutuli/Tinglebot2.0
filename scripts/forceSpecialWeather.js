// ============================================================================
// Force Special Weather Utility
// Sets a special weather condition for a village for today
// ============================================================================

require('dotenv').config();
const mongoose = require('mongoose');
const { saveWeather } = require('../modules/weatherModule');
const { specials } = require('../data/weatherData');

const MONGODB_URI = process.env.MONGODB_URI || 'your-mongo-uri-here';

async function forceSpecialWeather(village, specialLabel) {
  await mongoose.connect(MONGODB_URI);

  // Find the special weather object by label
  const special = specials.find(s => s.label.toLowerCase() === specialLabel.toLowerCase());
  if (!special) {
    console.error('Special weather not found:', specialLabel);
    process.exit(1);
  }

  // Example weather data (customize as needed)
  const weatherData = {
    temperature: { label: '72°F / 22°C - Perfect', emoji: '👌', probability: '100%' },
    wind: { label: '2 - 12(km/h) // Breeze', emoji: '🎐', probability: '100%' },
    precipitation: { label: 'Sunny', emoji: '☀️', probability: '100%' },
    special: { label: special.label, emoji: special.emoji, probability: '100%' }
  };

  await saveWeather(village, weatherData);
  console.log(`✅ Forced special weather "${special.label}" in ${village} for today.`);
  process.exit(0);
}

// Usage: node scripts/forceSpecialWeather.js Rudania "Flower Bloom"
const [,, village, ...specialArr] = process.argv;
const specialLabel = specialArr.join(' ');
if (!village || !specialLabel) {
  console.log('Usage: node scripts/forceSpecialWeather.js <Village> <SpecialLabel>');
  process.exit(1);
}

forceSpecialWeather(village, specialLabel); 