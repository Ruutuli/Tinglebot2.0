// ============================================================================
// weather.js — Weather Component for Tinglebot Dashboard
// Purpose: Fetches and displays today's weather for all villages
// ============================================================================

// Weather data cache
let weatherCache = {
  data: null,
  timestamp: 0,
  CACHE_DURATION: 5 * 60 * 1000 // 5 minutes
};

// Weather day information
let currentWeatherDay = {
  start: null,
  end: null,
  displayText: ''
};

// Weather emoji mappings from weatherData.js
const weatherEmojis = {
  temperature: {
    "0°F / -18°C - Frigid": "🥶",
    "8°F / -14°C - Freezing": "🐧",
    "24°F / -4°C - Cold": "☃️",
    "36°F / 2°C - Chilly": "🧊",
    "44°F / 6°C - Brisk": "🔷",
    "52°F / 11°C - Cool": "🆒",
    "61°F / 16°C - Mild": "😐",
    "72°F / 22°C - Perfect": "👌",
    "82°F / 28°C - Warm": "🌡️",
    "89°F / 32°C - Hot": "🌶️",
    "97°F / 36°C - Scorching": "🥵",
    "100°F / 38°C - Heat Wave": "💯"
  },
  wind: {
    "< 2(km/h) // Calm": "😌",
    "2 - 12(km/h) // Breeze": "🎐",
    "13 - 30(km/h) // Moderate": "🍃",
    "31 - 40(km/h) // Fresh": "🌬️",
    "41 - 62(km/h) // Strong": "💫",
    "63 - 87(km/h) // Gale": "💨",
    "88 - 117(km/h) // Storm": "🌀",
    ">= 118(km/h) // Hurricane": "🌪️"
  },
  precipitation: {
    "Blizzard": "❄️",
    "Cinder Storm": "🔥",
    "Cloudy": "☁️",
    "Fog": "🌫️",
    "Hail": "☁️🧊",
    "Heat Lightning": "🌡️⚡",
    "Heavy Rain": "🌧️",
    "Heavy Snow": "🌨️",
    "Light Rain": "☔",
    "Light Snow": "🌨️",
    "Partly cloudy": "⛅",
    "Rain": "🌧️",
    "Rainbow": "🌈",
    "Sleet": "☁️🧊",
    "Snow": "🌨️",
    "Sun Shower": "🌦️",
    "Sunny": "☀️",
    "Thundersnow": "🌨️⚡",
    "Thunderstorm": "⛈️"
  },
  special: {
    "Avalanche": "🏔️",
    "Blight Rain": "🌧️🧿",
    "Drought": "🌵",
    "Fairy Circle": "🍄",
    "Flood": "🌊",
    "Flower Bloom": "🌼",
    "Jubilee": "🐟",
    "Meteor Shower": "☄️",
    "Muggy": "🐛",
    "Rock Slide": "⛏️"
  }
};

// Weather image mappings for fallback
const weatherImages = {
  temperature: {
    'Freezing': '/images/overlays/ROOTS-blizzard.png',
    'Cold': '/images/overlays/ROOTS-snow.png',
    'Cool': '/images/overlays/ROOTS-cloudy.png',
    'Warm': '/images/overlays/ROOTS-rainbow.png',
    'Hot': '/images/overlays/ROOTS-heatlightning.png',
    'Scorching': '/images/overlays/ROOTS-cinderstorm.png'
  },
  wind: {
    'Calm': '/images/overlays/ROOTS-cloudy.png',
    'Breeze': '/images/overlays/ROOTS-fog.png',
    'Windy': '/images/overlays/ROOTS-thunderstorm.png',
    'Storm': '/images/overlays/ROOTS-thunderstorm.png'
  },
  precipitation: {
    'None': '/images/overlays/ROOTS-cloudy.png',
    'Light Rain': '/images/overlays/ROOTS-rain.png',
    'Heavy Rain': '/images/overlays/ROOTS-rain.png',
    'Storm': '/images/overlays/ROOTS-thunderstorm.png',
    'Snow': '/images/overlays/ROOTS-snow.png',
    'Hail': '/images/overlays/ROOTS-hail.png'
  },
  special: {
    'None': '',
    'Muggy': '/images/overlays/ROOTS-fog.png',
    'Flowerbloom': '/images/overlays/ROOTS-flowerbloom.png',
    'Fairy Circle': '/images/overlays/ROOTS-fairycircle.png',
    'Jubilee': '/images/overlays/ROOTS-jubilee.png',
    'Meteor Shower': '/images/overlays/ROOTS-meteorshower.png',
    'Rockslide': '/images/overlays/ROOTS-rockslide.png',
    'Avalanche': '/images/overlays/ROOTS-blizzard.png'
  }
};

// Season images
const seasonImages = {
  'spring': '/images/seasons/spring.png',
  'summer': '/images/seasons/summer.png',
  'fall': '/images/seasons/fall.png',
  'winter': '/images/seasons/winter.png'
};

// Village crest images
const villageCrests = {
  'Rudania': '/images/icons/[RotW] village crest_rudania_.png',
  'Inariko': '/images/icons/[RotW] village crest_inariko_.png',
  'Vhintl': '/images/icons/[RotW] village crest_vhintl_.png'
};



// ============================================================================
// Weather Data Functions
// ============================================================================

/**
 * Fetches today's weather data from the API
 */
async function fetchTodayWeather() {
  try {
    const response = await fetch('/api/weather/today');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Update weather day information
    if (data.weatherDayStart && data.weatherDayEnd) {
      currentWeatherDay.start = new Date(data.weatherDayStart);
      currentWeatherDay.end = new Date(data.weatherDayEnd);
      currentWeatherDay.displayText = formatWeatherDayDisplay(currentWeatherDay.start, currentWeatherDay.end);
    }
    
    // Update cache
    weatherCache.data = data;
    weatherCache.timestamp = Date.now();
    
    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Gets cached weather data or fetches new data if cache is expired
 */
async function getTodayWeather() {
  const now = Date.now();
  
  // Check if cache is valid
  if (weatherCache.data && (now - weatherCache.timestamp) < weatherCache.CACHE_DURATION) {
    return weatherCache.data;
  }
  
  // Fetch fresh data
  return await fetchTodayWeather();
}

// ============================================================================
// Weather Display Functions
// ============================================================================

// Helper: Get random banner for a village
function getRandomBanner(village) {
  const banners = {
    Rudania: [
      '/images/banners/Rudania1.png',
      '/images/banners/Rudania2.png',
      '/images/banners/Rudania3.png'
    ],
    Inariko: [
      '/images/banners/Inariko1.png',
      '/images/banners/Inariko2.png',
      '/images/banners/Inariko3.png'
    ],
    Vhintl: [
      '/images/banners/Vhintl1.png',
      '/images/banners/Vhintl2.png',
      '/images/banners/Vhintl3.png'
    ]
  };
  const arr = banners[village];
  if (!arr) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

// Overlay mapping (from weatherEmbed.js)
const overlayMapping = {
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
  'Rainbow': 'rainbow',
  'Flower Bloom': 'flowerbloom',
  'Fairy Circle': 'fairycircle',
  'Meteor Shower': 'meteorshower',
  'Jubilee': 'jubilee',
  'Drought': 'drought',
  'Flood': 'flood',
};

function getOverlayImage(weatherData) {
  // Special weather overlay takes priority
  if (weatherData.special && weatherData.special.label && overlayMapping[weatherData.special.label]) {
    return `/images/overlays/ROOTS-${overlayMapping[weatherData.special.label]}.png`;
  }
  // Fallback to precipitation overlay
  if (weatherData.precipitation && weatherData.precipitation.label && overlayMapping[weatherData.precipitation.label]) {
    return `/images/overlays/ROOTS-${overlayMapping[weatherData.precipitation.label]}.png`;
  }
  return null;
}

/**
 * Creates a weather card for a village
 */
function createWeatherCard(village, weatherData) {
  const bannerImg = getRandomBanner(village);
  const overlayImg = weatherData ? getOverlayImage(weatherData) : null;
  const weatherDayBadge = getWeatherDayBadgeText();
  
  if (!weatherData) {
    return `
      <div class="weather-card weather-card-${village.toLowerCase()}">
        <div class="weather-card-header new-header-layout weather-header-has-bg">
          ${bannerImg ? `<img src="${bannerImg}" class="weather-header-banner" alt="${village} banner" />` : ''}
          ${overlayImg ? `<img src="${overlayImg}" class="weather-header-overlay" alt="Weather overlay" />` : ''}
          <div class="weather-header-left">
            <span class="weather-badge weather-badge-today">${weatherDayBadge}</span>
          </div>
          <div class="weather-header-center">
            <img src="${villageCrests[village]}" alt="${village} Crest" class="weather-village-crest" />
            <span class="weather-village-name"><strong>${village}</strong></span>
          </div>
          <div class="weather-header-right">
            <span class="weather-badge weather-badge-season">
              <img src="${seasonImages['summer']}" alt="Summer" class="weather-badge-season-img" />
              <span>Summer</span>
            </span>
          </div>
        </div>
        <div class="weather-card-content">
          <div class="weather-no-data">
            <i class="fas fa-cloud-question"></i>
            <p>No weather data available</p>
          </div>
        </div>
      </div>
    `;
  }

  const { temperature, wind, precipitation, special, season } = weatherData;
  const cardOverlay = special?.label && special.label !== 'None' 
    ? getWeatherOverlay(special.label, 'special')
    : getWeatherOverlay(precipitation?.label, 'precipitation') || getWeatherOverlay(temperature?.label, 'temperature');

  return `
    <div class="weather-card weather-card-${village.toLowerCase()}">
      ${cardOverlay ? `<img src="${cardOverlay}" alt="Weather overlay" class="weather-card-overlay" />` : ''}
      <div class="weather-card-header new-header-layout weather-header-has-bg">
        ${bannerImg ? `<img src="${bannerImg}" class="weather-header-banner" alt="${village} banner" />` : ''}
        ${overlayImg ? `<img src="${overlayImg}" class="weather-header-overlay" alt="Weather overlay" />` : ''}
        <div class="weather-header-left">
          <span class="weather-badge weather-badge-today">${weatherDayBadge}</span>
        </div>
        <div class="weather-header-center">
          <img src="${villageCrests[village]}" alt="${village} Crest" class="weather-village-crest" />
          <span class="weather-village-name"><strong>${village}</strong></span>
        </div>
        <div class="weather-header-right">
          <span class="weather-badge weather-badge-season">
            <img src="${seasonImages[season]}" alt="${season}" class="weather-badge-season-img" />
            <span>${season.charAt(0).toUpperCase() + season.slice(1)}</span>
          </span>
        </div>
      </div>
      <div class="weather-card-content">
        <div class="weather-main"></div>
        <div class="weather-details">
          <div class="weather-detail-item">
            <div class="weather-detail-label">
              <i class="fas fa-thermometer-half"></i>
              <span>Temperature</span>
            </div>
            <div class="weather-detail-value">
              <span class="weather-emoji">${weatherEmojis.temperature[temperature?.label] || '🌡️'}</span>
              <span class="weather-text">${temperature?.label || 'Unknown'}</span>
            </div>
          </div>
          <div class="weather-detail-item">
            <div class="weather-detail-label">
              <i class="fas fa-wind"></i>
              <span>Wind</span>
            </div>
            <div class="weather-detail-value">
              <span class="weather-emoji">${weatherEmojis.wind[wind?.label] || '💨'}</span>
              <span class="weather-text">${wind?.label || 'Unknown'}</span>
            </div>
          </div>
          <div class="weather-detail-item">
            <div class="weather-detail-label">
              <i class="fas fa-cloud-rain"></i>
              <span>Precipitation</span>
            </div>
            <div class="weather-detail-value">
              <span class="weather-emoji">${weatherEmojis.precipitation[precipitation?.label] || '☀️'}</span>
              <span class="weather-text">${precipitation?.label || 'None'}</span>
            </div>
          </div>
          ${special?.label && special.label !== 'None' ? `
            <div class="weather-detail-item weather-special">
              <div class="weather-detail-label">
                <i class="fas fa-star"></i>
                <span>Special</span>
              </div>
              <div class="weather-detail-value">
                <span class="weather-emoji">${weatherEmojis.special[special.label] || '✨'}</span>
                <span class="weather-text">${special.label}</span>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Gets the appropriate overlay image for a weather condition
 */
function getWeatherOverlay(condition, type) {
  if (!condition) return null;
  
  const overlayMap = {
    temperature: {
      "0°F / -18°C - Frigid": "/images/overlays/ROOTS-blizzard.png",
      "8°F / -14°C - Freezing": "/images/overlays/ROOTS-blizzard.png",
      "24°F / -4°C - Cold": "/images/overlays/ROOTS-snow.png",
      "36°F / 2°C - Chilly": "/images/overlays/ROOTS-snow.png",
      "44°F / 6°C - Brisk": "/images/overlays/ROOTS-cloudy.png",
      "52°F / 11°C - Cool": "/images/overlays/ROOTS-cloudy.png",
      "61°F / 16°C - Mild": "/images/overlays/ROOTS-rainbow.png",
      "72°F / 22°C - Perfect": "/images/overlays/ROOTS-rainbow.png",
      "82°F / 28°C - Warm": "/images/overlays/ROOTS-rainbow.png",
      "89°F / 32°C - Hot": "/images/overlays/ROOTS-heatlightning.png",
      "97°F / 36°C - Scorching": "/images/overlays/ROOTS-cinderstorm.png",
      "100°F / 38°C - Heat Wave": "/images/overlays/ROOTS-cinderstorm.png"
    },
    wind: {
      "< 2(km/h) // Calm": "/images/overlays/ROOTS-cloudy.png",
      "2 - 12(km/h) // Breeze": "/images/overlays/ROOTS-fog.png",
      "13 - 30(km/h) // Moderate": "/images/overlays/ROOTS-fog.png",
      "31 - 40(km/h) // Fresh": "/images/overlays/ROOTS-thunderstorm.png",
      "41 - 62(km/h) // Strong": "/images/overlays/ROOTS-thunderstorm.png",
      "63 - 87(km/h) // Gale": "/images/overlays/ROOTS-thunderstorm.png",
      "88 - 117(km/h) // Storm": "/images/overlays/ROOTS-thunderstorm.png",
      ">= 118(km/h) // Hurricane": "/images/overlays/ROOTS-thunderstorm.png"
    },
    precipitation: {
      "Blizzard": "/images/overlays/ROOTS-blizzard.png",
      "Cinder Storm": "/images/overlays/ROOTS-cinderstorm.png",
      "Cloudy": "/images/overlays/ROOTS-cloudy.png",
      "Fog": "/images/overlays/ROOTS-fog.png",
      "Hail": "/images/overlays/ROOTS-hail.png",
      "Heat Lightning": "/images/overlays/ROOTS-heatlightning.png",
      "Heavy Rain": "/images/overlays/ROOTS-rain.png",
      "Heavy Snow": "/images/overlays/ROOTS-snow.png",
      "Light Rain": "/images/overlays/ROOTS-rain.png",
      "Light Snow": "/images/overlays/ROOTS-snow.png",
      "Partly cloudy": "/images/overlays/ROOTS-cloudy.png",
      "Rain": "/images/overlays/ROOTS-rain.png",
      "Rainbow": "/images/overlays/ROOTS-rainbow.png",
      "Sleet": "/images/overlays/ROOTS-sleet.png",
      "Snow": "/images/overlays/ROOTS-snow.png",
      "Sun Shower": "/images/overlays/ROOTS-rain.png",
      "Sunny": "/images/overlays/ROOTS-cloudy.png",
      "Thundersnow": "/images/overlays/ROOTS-thundersnow.png",
      "Thunderstorm": "/images/overlays/ROOTS-thunderstorm.png"
    },
    special: {
      "Avalanche": "/images/overlays/ROOTS-blizzard.png",
      "Blight Rain": "/images/overlays/ROOTS-blightrain.png",
      "Drought": "/images/overlays/ROOTS-cloudy.png",
      "Fairy Circle": "/images/overlays/ROOTS-fairycircle.png",
      "Flood": "/images/overlays/ROOTS-rain.png",
      "Flower Bloom": "/images/overlays/ROOTS-flowerbloom.png",
      "Jubilee": "/images/overlays/ROOTS-jubilee.png",
      "Meteor Shower": "/images/overlays/ROOTS-meteorshower.png",
      "Muggy": "/images/overlays/ROOTS-fog.png",
      "Rock Slide": "/images/overlays/ROOTS-rockslide.png"
    }
  };
  
  return overlayMap[type]?.[condition] || null;
}

/**
 * Renders the weather section on the dashboard
 */
async function renderWeatherSection() {
  try {
    const weatherContainer = document.getElementById('weather-section');
      if (!weatherContainer) {  
      return;
    }

    // Show loading state
    weatherContainer.innerHTML = `
      <div class="weather-loading">
        <div class="loading-spinner"></div>
        <p>Loading weather data...</p>
      </div>
    `;

    // Fetch weather data
    const weatherData = await getTodayWeather();
    
    // Create weather cards
    const villages = ['Rudania', 'Inariko', 'Vhintl'];
    const weatherCards = villages.map(village => 
      createWeatherCard(village, weatherData.villages[village])
    ).join('');

    // Create weather day display text
    const weatherDayText = currentWeatherDay.displayText || 'Loading...';

    // Render the weather section
    weatherContainer.innerHTML = `
      <div class="weather-header">
        <div class="weather-header-info">
          <h2>Today's Weather</h2>
          <div class="weather-day-range">
            <i class="fas fa-clock"></i>
            <span>${weatherDayText}</span>
          </div>
        </div>
        <div class="weather-header-actions">
          <button class="weather-stats-button" onclick="showWeatherStats()">
            <i class="fas fa-chart-bar"></i>
            <span>View Statistics</span>
          </button>
        </div>
      </div>
      <div class="weather-grid">
        ${weatherCards}
      </div>
    `;

  } catch (error) {
    console.error('[weather.js]: ❌ Error rendering weather section:', error);
    
    const weatherContainer = document.getElementById('weather-section');
    if (weatherContainer) {
      weatherContainer.innerHTML = `
        <div class="weather-error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load weather data</p>
        </div>
      `;
    }
  }
}

// ============================================================================
// Event Listeners and Initialization
// ============================================================================

/**
 * Initializes the weather component
 */
function initWeather() {
  
  // Render weather section when dashboard is shown
  document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the dashboard section
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && dashboardSection.style.display !== 'none') {
      renderWeatherSection();
    }
  });
}

// Initialize when module loads
initWeather();

// ============================================================================
// Weather Day Calculation Functions
// ============================================================================

/**
 * Calculates the current weather day bounds (8am to 8am)
 */
function calculateWeatherDayBounds() {
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

/**
 * Formats the weather day for display
 */
function formatWeatherDayDisplay(weatherDayStart, weatherDayEnd) {
  const startDate = new Date(weatherDayStart);
  const endDate = new Date(weatherDayEnd);
  
  // Format the dates to show 8am-8am regardless of timezone
  // We'll use a more explicit format to ensure 8am is displayed as 8am
  const startFormatted = startDate.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric'
  }) + ' 8:00 AM';
  
  const endFormatted = endDate.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric'
  }) + ' 8:00 AM';
  
  return `${startFormatted} - ${endFormatted}`;
}

/**
 * Gets the appropriate badge text for the weather day
 */
function getWeatherDayBadgeText() {
  const now = new Date();
  const currentHour = now.getHours();
  
  if (currentHour >= 8) {
    return 'Today';
  } else {
    return 'Today';
  }
}

// ============================================================================
// Global Functions for Weather Statistics
// ============================================================================

/**
 * Shows the weather statistics page
 */
async function showWeatherStats() {
  try {
    
    // Hide dashboard, show model details view
    const dashboardSection = document.getElementById('dashboard-section');
    const modelDetailsPage = document.getElementById('model-details-page');
    const title = document.getElementById('model-details-title');
    const contentDiv = document.getElementById('model-details-data');
    const backButton = document.querySelector('.back-button');

    if (!dashboardSection || !modelDetailsPage || !title || !contentDiv || !backButton) {
      throw new Error('Required DOM elements not found');
    }

    // Update URL with hash
    window.history.pushState({ section: 'weatherstats' }, '', '#weatherstats');
    
    // Reinitialize blupee system when viewing weather stats
    if (window.reinitializeBlupee) {
      window.reinitializeBlupee();
    }

    dashboardSection.style.display = 'none';
    modelDetailsPage.style.display = 'block';
    title.textContent = 'Weather Statistics';
    contentDiv.innerHTML = '';

    // Setup back button handler
    backButton.onclick = () => {
      // Update URL when going back
      window.history.pushState({ section: 'dashboard-section' }, '', '/');
      
      // Reinitialize blupee when going back
      if (window.reinitializeBlupee) {
        window.reinitializeBlupee();
      }
      
      modelDetailsPage.style.display = 'none';
      dashboardSection.style.display = 'block';
    };

    // Initialize weather statistics page
    if (window.weatherStats && window.weatherStats.initializeWeatherStatsPage) {
      await window.weatherStats.initializeWeatherStatsPage();
    } else {
      console.error('[weather.js]: ❌ Weather stats module not available');
      contentDiv.innerHTML = `
        <div class="weather-stats-error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Weather statistics module not available</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('[weather.js]: ❌ Error showing weather statistics:', error);
  }
}

window.renderWeatherSection = renderWeatherSection;
window.showWeatherStats = showWeatherStats; 