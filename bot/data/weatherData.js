// ============================================================================
// ------------------- Weather Data Configuration -------------------
// Purpose: Weather emoji mappings, probability weights, and weight modifiers
// - Defines emoji representations for all weather types (temperature, wind, precipitation, special)
// - Contains base probability weights for weather selection
// - Provides village/season-specific weight modifiers for weather simulation
// Used by: weatherService.js, weatherValidation.js
// Related: seasonsData.js (contains valid weather options per season/village)
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

// One emoji per row (used in embeds, UI, and town-hall name hints). Labels must match every
// `Special: [...]` entry across villages/seasons in seasonsData.js (currently 12 types).
const specials = [
  { label: "Avalanche", emoji: "🏔️", conditions: { temperature: ["<= 36°F"], wind: ["any"], precipitation: ["snow"] } },
  { label: "Blight Rain", emoji: "🩸", conditions: { temperature: [">= 44°F"], wind: ["any"], precipitation: ["rain"] } },
  { label: "Drought", emoji: "🌵", conditions: { temperature: [">= 97°F"], wind: ["any"], precipitation: ["sunny"] } },
  { label: "Fairy Circle", emoji: "🍄", conditions: { temperature: [">= 52°F"], wind: ["< 63 km/h"], precipitation: ["sunny", "partly cloudy"] } },
  { label: "Flood", emoji: "🌊", conditions: { temperature: [">= 24°F"], wind: ["any"], precipitation: ["Heavy Rain"] } },
  { label: "Flower Bloom", emoji: "🌼", conditions: { temperature: [">= 72°F"], wind: ["any"], precipitation: ["any"] } },
  { label: "Jubilee", emoji: "🐟", conditions: { temperature: ["any"], wind: ["any"], precipitation: ["any"] } },
  { label: "Lightning Storm", emoji: "⚡", conditions: { temperature: [">= 44°F"], wind: ["any"], precipitation: ["Thunderstorm"] } },
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
  "Fairy Circle": 0.08,
  "Flood": 0.2,
  "Flower Bloom": 0.2,
  "Jubilee": 0.02,
  "Lightning Storm": 0.12,
  "Meteor Shower": 0.12,
  "Muggy": 0.3,
  "Rock Slide": 0.005
};

// ============================================================================
// ------------------- Weight Modifiers -------------------
// ============================================================================

const weatherWeightModifiers = {
  Rudania: {
    Winter: {
      temperature: {
        "24°F / -4°C - Cold": 0.2,
        "36°F / 2°C - Chilly": 0.4,
        "44°F / 6°C - Brisk": 0.8,
        "52°F / 11°C - Cool": 1.4,
        "61°F / 16°C - Mild": 1.6,
        "72°F / 22°C - Perfect": 1.8
      },
      precipitation: {
        "Snow": 0.1,
        "Light Snow": 0.1,
        "Rain": 1.5,
        "Light Rain": 1.4,
        "Heavy Rain": 1.3,
        "Sunny": 1.5,
        "Fog": 1.1,
        "Cinder Storm": 2.0
      },
      special: {
        "Blight Rain": 0.1
      }
    },
    Summer: {
      temperature: {
        "72°F / 22°C - Perfect": 0.8,
        "82°F / 28°C - Warm": 1.4,
        "89°F / 32°C - Hot": 1.8,
        "97°F / 36°C - Scorching": 2.2,
        "100°F / 38°C - Heat Wave": 2.5
      },
      precipitation: {
        "Cinder Storm": 2.5,
        "Sunny": 1.8,
        "Rain": 0.6
      }
    },
    Spring: {
      temperature: {
        "61°F / 16°C - Mild": 1.4,
        "72°F / 22°C - Perfect": 1.6,
        "82°F / 28°C - Warm": 1.3
      },
      precipitation: {
        "Cinder Storm": 1.8,
        "Sunny": 1.5,
        "Rain": 1.2
      }
    },
    Autumn: {
      temperature: {
        "52°F / 11°C - Cool": 1.3,
        "61°F / 16°C - Mild": 1.5,
        "72°F / 22°C - Perfect": 1.6
      },
      precipitation: {
        "Cinder Storm": 1.4,
        "Fog": 1.5,
        "Sunny": 1.4,
        "Rain": 1.3
      }
    }
  },
  Inariko: {
    Winter: {
      temperature: {
        "0°F / -18°C - Frigid": 1.8,
        "8°F / -14°C - Freezing": 1.6,
        "24°F / -4°C - Cold": 1.5,
        "36°F / 2°C - Chilly": 1.2,
        "44°F / 6°C - Brisk": 0.8
      },
      precipitation: {
        "Blizzard": 2.8,
        "Heavy Snow": 2.5,
        "Snow": 2.2,
        "Light Snow": 2.0,
        "Fog": 1.4,
        "Cloudy": 1.0
      },
      special: {
        "Avalanche": 1.2,
        "Blight Rain": 0.1
      }
    },
    Spring: {
      temperature: {
        "44°F / 6°C - Brisk": 1.4,
        "52°F / 11°C - Cool": 1.3,
        "61°F / 16°C - Mild": 1.1,
        "72°F / 22°C - Perfect": 0.7
      },
      precipitation: {
        "Fog": 2.0,
        "Rain": 1.4,
        "Cloudy": 1.5,
        "Light Rain": 1.3
      },
      special: {
        "Flower Bloom": 1.8,
        // Rare Blight vs Jubilee on rainy spring days (otherwise Blight dominates the valid pool).
        "Blight Rain": 0.05
      }
    },
    Summer: {
      temperature: {
        "61°F / 16°C - Mild": 1.4,
        "72°F / 22°C - Perfect": 1.2,
        "82°F / 28°C - Warm": 0.6
      },
      precipitation: {
        "Rain": 1.5,
        "Thunderstorm": 1.4,
        "Fog": 1.9,
        "Cloudy": 1.3
      },
      special: {
        "Flower Bloom": 1.4
      }
    },
    Autumn: {
      temperature: {
        "36°F / 2°C - Chilly": 1.4,
        "44°F / 6°C - Brisk": 1.3,
        "52°F / 11°C - Cool": 1.2
      },
      precipitation: {
        "Fog": 2.0,
        "Snow": 2.0,
        "Cloudy": 1.2,
        "Light Snow": 1.8
      }
    }
  },
  Vhintl: {
    Winter: {
      temperature: {
        "36°F / 2°C - Chilly": 1.3,
        "44°F / 6°C - Brisk": 1.2,
        "52°F / 11°C - Cool": 1.1
      },
      precipitation: {
        "Fog": 2.0,
        "Rain": 1.6,
        "Heavy Rain": 1.4,
        "Thunderstorm": 1.3,
        "Light Rain": 1.5,
        "Cloudy": 1.4,
        "Sunny": 0.25,
        "Light Snow": 0.2,
        "Thundersnow": 0.1
      },
      special: {
        "Blight Rain": 0.05,
        "Lightning Storm": 1.5
      }
    },
    Spring: {
      temperature: {
        "61°F / 16°C - Mild": 1.3,
        "72°F / 22°C - Perfect": 1.4,
        "82°F / 28°C - Warm": 1.2
      },
      precipitation: {
        "Rain": 1.6,
        "Thunderstorm": 1.8,
        "Fog": 1.5,
        "Heavy Rain": 1.4,
        "Light Rain": 1.3,
        "Sunny": 0.3
      },
      special: {
        "Blight Rain": 0.05,
        "Muggy": 1.6,
        "Lightning Storm": 1.4
      }
    },
    Summer: {
      temperature: {
        "82°F / 28°C - Warm": 1.6,
        "89°F / 32°C - Hot": 1.4,
        "97°F / 36°C - Scorching": 1.0
      },
      precipitation: {
        "Thunderstorm": 2.2,
        "Heavy Rain": 1.8,
        "Fog": 1.6,
        "Rain": 1.5,
        "Light Rain": 1.4,
        "Sunny": 0.3
      },
      special: {
        "Blight Rain": 0.05,
        "Muggy": 2.2,
        "Lightning Storm": 1.8
      }
    },
    Autumn: {
      temperature: {
        "61°F / 16°C - Mild": 1.3,
        "72°F / 22°C - Perfect": 1.3
      },
      precipitation: {
        "Fog": 1.8,
        "Rain": 1.6,
        "Thunderstorm": 1.7,
        "Heavy Rain": 1.4,
        "Sunny": 0.35
      },
      special: {
        "Blight Rain": 0.05,
        "Lightning Storm": 1.5
      }
    }
  }
};

// ============================================================================
// ------------------- Exports -------------------
// Combines all emoji data, weights, and modifiers for use in simulation
// ============================================================================

module.exports = {
  precipitationWeights,
  precipitations,
  specialWeights,
  specials,
  temperatureWeights,
  temperatures,
  windWeights,
  winds,
  weatherWeightModifiers
};