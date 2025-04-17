// ============================================================================
// 🌦️ Weather Data
// Contains emoji mappings and probability weights for all weather categories.
// This file supports all core simulation functionality.
// ============================================================================

// ------------------- Emoji Mappings -------------------

const temperatures = [
  { label: "0°F / -18°C - Frigid", emoji: "🥶" },
  { label: "8°F / -14°C - Freezing", emoji: "🐧" },
  { label: "24°F / -4°C - Cold", emoji: "☃️" },
  { label: "36°F / 2°C - Chilly", emoji: "🧊" },
  { label: "44°F / 6°C - Brisk", emoji: "🔷" },
  { label: "52°F / 11°C - Cool", emoji: "🆒" },
  { label: "61°F / 16°C - Mild", emoji: "😐" },
  { label: "72°F / 22°C - Perfect", emoji: "👌" },
  { label: "82°F / 28°C - Warm", emoji: "🌡️" },
  { label: "89°F / 32°C - Hot", emoji: "🌶️" },
  { label: "97°F / 36°C - Scorching", emoji: "🥵" },
  { label: "100°F / 38°C - Heat Wave", emoji: "💯" }
];

const winds = [
  { label: "< 2(km/h) // Calm", emoji: "😌" },
  { label: "2 - 12(km/h) // Breeze", emoji: "🎐" },
  { label: "13 - 30(km/h) // Moderate", emoji: "🍃" },
  { label: "31 - 40(km/h) // Fresh", emoji: "🌬️" },
  { label: "41 - 62(km/h) // Strong", emoji: "💫" },
  { label: "63 - 87(km/h) // Gale", emoji: "💨" },
  { label: "88 - 117(km/h) // Storm", emoji: "🌀" },
  { label: ">= 118(km/h) // Hurricane", emoji: "🌪️" }
];

const precipitations = [
  { label: "Blizzard", emoji: "❄️", conditions: { temperature: ["<= 24°F"], wind: [">= 41 km/h"] } },
  { label: "Cinder Storm", emoji: "🔥", conditions: { temperature: ["any"], wind: [">= 41 km/h"] } },
  { label: "Cloudy", emoji: "☁️", conditions: { temperature: ["any"], wind: ["< 63 km/h"] } },
  { label: "Fog", emoji: "🌫️", conditions: { temperature: ["any"], wind: ["< 63 km/h"] } },
  { label: "Hail", emoji: "☁️🧊", conditions: { temperature: ["any"], wind: ["any"] } },
  { label: "Heat Lightning", emoji: "🌡️⚡", conditions: { temperature: [">= 82°F"], wind: ["any"] } },
  { label: "Heavy Rain", emoji: "🌧️", conditions: { temperature: [">= 44°F"], wind: ["< 63 km/h"] } },
  { label: "Heavy Snow", emoji: "🌨️", conditions: { temperature: ["<= 36°F"], wind: ["< 63 km/h"] } },
  { label: "Light Rain", emoji: "☔", conditions: { temperature: [">= 44°F"], wind: ["< 63 km/h"] } },
  { label: "Light Snow", emoji: "🌨️", conditions: { temperature: ["<= 36°F"], wind: ["< 63 km/h"] } },
  { label: "Partly cloudy", emoji: "⛅", conditions: { temperature: ["any"], wind: ["< 63 km/h"] } },
  { label: "Rain", emoji: "🌧️", conditions: { temperature: [">= 44°F"], wind: ["< 63 km/h"] } },
  { label: "Rainbow", emoji: "🌈", conditions: { temperature: ["any"], wind: ["< 63 km/h"] } },
  { label: "Sleet", emoji: "☁️🧊", conditions: { temperature: [">= 36°F", "<= 44°F"], wind: ["any"] } },
  { label: "Snow", emoji: "🌨️", conditions: { temperature: ["<= 36°F"], wind: ["< 63 km/h"] } },
  { label: "Sun Shower", emoji: "🌦️", conditions: { temperature: [">= 44°F"], wind: ["< 63 km/h"] } },
  { label: "Sunny", emoji: "☀️", conditions: { temperature: ["any"], wind: ["any"] } },
  { label: "Thundersnow", emoji: "🌨️⚡", conditions: { temperature: ["<= 36°F"], wind: ["any"] } },
  { label: "Thunderstorm", emoji: "⛈️", conditions: { temperature: [">= 44°F"], wind: ["any"] } }
];

const specials = [
  { label: "Avalanche", emoji: "🏔️", conditions: { temperature: ["<= 36°F"], wind: ["any"], precipitation: ["snow"] } },
  { label: "Blight Rain", emoji: "🌧️🧿", conditions: { temperature: [">= 44°F"], wind: ["any"], precipitation: ["rain"] } },
  { label: "Drought", emoji: "🌵", conditions: { temperature: [">= 97°F"], wind: ["any"], precipitation: ["sunny"] } },
  { label: "Fairy Circle", emoji: "🍄", conditions: { temperature: ["any"], wind: ["any"], precipitation: ["any"] } },
  { label: "Flood", emoji: "🌊", conditions: { temperature: [">= 24°F"], wind: ["any"], precipitation: ["Heavy Rain"] } },
  { label: "Flower Bloom", emoji: "🌼", conditions: { temperature: [">= 72°F"], wind: ["any"], precipitation: ["any"] } },
  { label: "Jubilee", emoji: "🐟", conditions: { temperature: ["any"], wind: ["any"], precipitation: ["any"] } },
  { label: "Meteor Shower", emoji: "☄️", conditions: { temperature: ["any"], wind: ["any"], precipitation: ["sunny"] } },
  { label: "Muggy", emoji: "🐛", conditions: { temperature: [">= 72°F"], wind: ["any"], precipitation: ["rain", "fog", "cloudy"] } },
  { label: "Rock Slide", emoji: "⛏️", conditions: { temperature: ["any"], wind: ["any"], precipitation: ["any"] } }
];

// ============================================================================
// 🌦️ Weather Data
// Contains visual emoji mappings and probability weights for simulation.
// ============================================================================

const temperatureWeights = {
  "0°F / -18°C - Frigid": 0.05,
  "8°F / -14°C - Freezing": 0.05,
  "24°F / -4°C - Cold": 0.05,
  "36°F / 2°C - Chilly": 0.1,
  "44°F / 6°C - Brisk": 0.15,
  "52°F / 11°C - Cool": 0.2,
  "61°F / 16°C - Mild": 0.25,
  "72°F / 22°C - Perfect": 0.15,
  "82°F / 28°C - Warm": 0.07,
  "89°F / 32°C - Hot": 0.02,
  "97°F / 36°C - Scorching": 0.01,
  "100°F / 38°C - Heat Wave": 0.005
};

const windWeights = {
  "< 2(km/h) // Calm": 0.3,
  "2 - 12(km/h) // Breeze": 0.25,
  "13 - 30(km/h) // Moderate": 0.2,
  "31 - 40(km/h) // Fresh": 0.1,
  "41 - 62(km/h) // Strong": 0.07,
  "63 - 87(km/h) // Gale": 0.05,
  "88 - 117(km/h) // Storm": 0.02,
  ">= 118(km/h) // Hurricane": 0.01
};

const precipitationWeights = {
  "Blizzard": 0.005,
  "Cinder Storm": 0.005,
  "Cloudy": 0.2,
  "Fog": 0.05,
  "Hail": 0.05,
  "Heat Lightning": 0.01,
  "Heavy Rain": 0.1,
  "Heavy Snow": 0.05,
  "Light Rain": 0.15,
  "Light Snow": 0.1,
  "Partly cloudy": 0.1,
  "Rain": 0.1,
  "Rainbow": 0.01,
  "Sleet": 0.01,
  "Snow": 0.05,
  "Sun Shower": 0.05,
  "Sunny": 0.3,
  "Thundersnow": 0.005,
  "Thunderstorm": 0.01
};

const specialWeights = {
  "Avalanche": 0.05,
  "Blight Rain": 0.1,
  "Drought": 0.1,
  "Fairy Circle": 0.2,
  "Flood": 0.1,
  "Flower Bloom": 0.15,
  "Jubilee": 0.05,
  "Meteor Shower": 0.1,
  "Muggy": 0.1,
  "Rock Slide": 0.05
};


// ============================================================================
// ------------------- Exports -------------------
// Combines all emoji data and weights for use in simulation
// ============================================================================

module.exports = {
  precipitationWeights,
  precipitations,
  specialWeights,
  specials,
  temperatureWeights,
  temperatures,
  windWeights,
  winds
};