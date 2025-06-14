// ============================================================================
// 🌤️ Weather Validation
// Contains validation functions for weather combinations
// ============================================================================

const { temperatures, winds, precipitations, specials } = require('../data/weatherData');

// Helper to find weather emoji
function findWeatherEmoji(category, label) {
  if (!label) return null;
  
  let data;
  switch (category) {
    case 'temperatures':
      data = temperatures;
      break;
    case 'winds':
      data = winds;
      break;
    case 'precipitations':
      data = precipitations;
      break;
    case 'specials':
      data = specials;
      break;
    default:
      return null;
  }
  
  return data.find(item => item.label === label) || null;
}

// Helper to parse Fahrenheit from label
function parseFahrenheit(label) {
  if (!label) return 0;
  const match = label.match(/(\d+)°F/);
  return match ? parseInt(match[1]) : 0;
}

// Helper to parse wind speed from label
function parseWind(label) {
  if (!label) return 0;
  const match = label.match(/(\d+)\s*-\s*(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// Helper to check numeric conditions
function checkNumericCondition(value, condition) {
  if (!condition) return true;
  if (condition === 'any') return true;
  
  const match = condition.match(/([<>=]+)\s*(\d+)/);
  if (!match) return true;
  
  const [_, operator, num] = match;
  const compareValue = parseInt(num);
  
  switch (operator) {
    case '<=': return value <= compareValue;
    case '>=': return value >= compareValue;
    case '<': return value < compareValue;
    case '>': return value > compareValue;
    case '==': return value === compareValue;
    default: return true;
  }
}

// Helper to check precipitation matches
function precipitationMatches(label, condition) {
  if (!label || !condition) return true;
  if (condition === 'any') return true;
  if (condition === 'sunny') return label === 'Sunny';
  if (condition === 'rain') return ['Rain', 'Light Rain', 'Heavy Rain'].includes(label);
  if (condition === 'snow') return ['Snow', 'Light Snow', 'Heavy Snow', 'Blizzard'].includes(label);
  return label === condition;
}

// ------------------- Weather Combination Validator -------------------
// Validates that weather combinations are valid according to the rules
function validateWeatherCombination(weather) {
  const issues = [];
  
  // Check special weather conditions
  if (weather.special) {
    const specialObj = findWeatherEmoji('specials', weather.special.label);
    if (specialObj && specialObj.conditions) {
      const { temperature: tempConds, wind: windConds, precipitation: precipConds } = specialObj.conditions;
      
      // Check temperature conditions
      if (tempConds && !tempConds.includes('any')) {
        const temp = parseFahrenheit(weather.temperature.label);
        const tempValid = tempConds.every(cond => checkNumericCondition(temp, cond));
        if (!tempValid) {
          issues.push(`Invalid temperature ${temp}°F for ${weather.special.label} (requires ${tempConds.join(', ')})`);
        }
      }
      
      // Check wind conditions
      if (windConds && !windConds.includes('any')) {
        const wind = parseWind(weather.wind.label);
        const windValid = windConds.every(cond => checkNumericCondition(wind, cond));
        if (!windValid) {
          issues.push(`Invalid wind speed ${wind} km/h for ${weather.special.label} (requires ${windConds.join(', ')})`);
        }
      }
      
      // Check precipitation conditions
      if (precipConds && !precipConds.includes('any')) {
        const precipValid = precipConds.some(cond => precipitationMatches(weather.precipitation.label, cond));
        if (!precipValid) {
          issues.push(`Invalid precipitation ${weather.precipitation.label} for ${weather.special.label} (requires ${precipConds.join(', ')})`);
        }
      }
    }
  }
  
  // Check precipitation conditions
  const precipObj = findWeatherEmoji('precipitations', weather.precipitation.label);
  if (precipObj && precipObj.conditions) {
    const { temperature: tempConds, wind: windConds } = precipObj.conditions;
    
    // Check temperature conditions
    if (tempConds && !tempConds.includes('any')) {
      const temp = parseFahrenheit(weather.temperature.label);
      const tempValid = tempConds.every(cond => checkNumericCondition(temp, cond));
      if (!tempValid) {
        issues.push(`Invalid temperature ${temp}°F for ${weather.precipitation.label} (requires ${tempConds.join(', ')})`);
      }
    }
    
    // Check wind conditions
    if (windConds && !windConds.includes('any')) {
      const wind = parseWind(weather.wind.label);
      const windValid = windConds.every(cond => checkNumericCondition(wind, cond));
      if (!windValid) {
        issues.push(`Invalid wind speed ${wind} km/h for ${weather.precipitation.label} (requires ${windConds.join(', ')})`);
      }
    }
  }
  
  if (issues.length > 0) {
    return false;
  }
  
  return issues.length === 0;
}

module.exports = {
  validateWeatherCombination,
  findWeatherEmoji
}; 