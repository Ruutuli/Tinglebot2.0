// ============================================================================
// 🖼️ Banner Generator
// Handles weather banner generation with overlays
// ============================================================================

const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');
const { AttachmentBuilder } = require('discord.js');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const BANNER_PATHS = {
  Rudania: [
    path.join(__dirname, 'assets', 'banners', 'Rudania1.png'),
    path.join(__dirname, 'assets', 'banners', 'Rudania2.png'),
    path.join(__dirname, 'assets', 'banners', 'Rudania3.png')
  ],
  Inariko: [
    path.join(__dirname, 'assets', 'banners', 'Inariko1.png'),
    path.join(__dirname, 'assets', 'banners', 'Inariko2.png'),
    path.join(__dirname, 'assets', 'banners', 'Inariko3.png')
  ],
  Vhintl: [
    path.join(__dirname, 'assets', 'banners', 'Vhintl1.png'),
    path.join(__dirname, 'assets', 'banners', 'Vhintl2.png'),
    path.join(__dirname, 'assets', 'banners', 'Vhintl3.png')
  ]
};

const OVERLAY_MAPPING = {
  'Rain': 'rain',
  'Light Rain': 'rain',
  'Heavy Rain': 'rain',
  'Thunderstorm': 'thunderstorm',
  'Snow': 'snow',
  'Light Snow': 'snow',
  'Heavy Snow': 'snow',
  'Blizzard': 'blizzard',
  'Sleet': 'sleet',
  'Hail': 'hail',
  'Fog': 'fog',
  'Cloudy': 'cloudy',
  'Thundersnow': 'thundersnow',
  'Cinder Storm': 'cinderstorm',
  'Blight Rain': 'blightrain',
  'Heat Lightning': 'heatlightning',
  'Rainbow': 'rainbow'
};

// ============================================================================
// ------------------- Banner Generation -------------------
// ============================================================================

// ---- Function: getRandomBanner ----
// Gets a random banner for the village
function getRandomBanner(village) {
  const banners = BANNER_PATHS[village];
  if (!banners || banners.length === 0) {
    console.error(`[bannerGenerator.js]: No banners found for village: ${village}`);
    return null;
  }
  return banners[Math.floor(Math.random() * banners.length)];
}

// ---- Function: getOverlayPath ----
// Gets the overlay path for a weather condition
function getOverlayPath(condition) {
  const overlayName = OVERLAY_MAPPING[condition];
  if (!overlayName) return null;
  
  const overlayPath = path.join(__dirname, 'assets', 'overlays', `ROOTS-${overlayName}.png`);
  return fs.existsSync(overlayPath) ? overlayPath : null;
}

// ---- Function: generateBanner ----
// Generates a banner with optional overlay composited using Jimp
async function generateBanner(village, weather) {
  try {
    // Get base banner
    const bannerPath = getRandomBanner(village);
    if (!bannerPath) {
      console.error(`[bannerGenerator.js]: Failed to get banner for ${village}`);
      return null;
    }

    // Check if we need an overlay
    const overlayPath = getOverlayPath(weather.precipitation.label);

    // Load banner image
    const bannerImg = await Jimp.read(bannerPath);

    if (overlayPath) {
      // Load overlay and composite
      const overlayImg = await Jimp.read(overlayPath);
      overlayImg.resize(bannerImg.bitmap.width, bannerImg.bitmap.height);
      bannerImg.composite(overlayImg, 0, 0, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 1,
        opacityDest: 1
      });
    }

    // Get buffer and create attachment
    const outName = `banner-${village.toLowerCase()}.png`;
    const buffer = await bannerImg.getBufferAsync(Jimp.MIME_PNG);
    const attachment = new AttachmentBuilder(buffer, { name: outName });
    return attachment;
  } catch (error) {
    console.error('[bannerGenerator.js]: Error generating banner:', error);
    return null;
  }
}

module.exports = {
  generateBanner: generateBanner // now async
}; 