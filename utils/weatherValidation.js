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
  
  // Handle "< 2(km/h) // Calm" format
  const lessThanMatch = label.match(/< (\d+)/);
  if (lessThanMatch) {
    const value = parseInt(lessThanMatch[1], 10);
    return Math.max(0, value - 1); // Return value less than the threshold
  }
  
  // Handle ">= 118(km/h) // Hurricane" format
  const greaterThanMatch = label.match(/>= (\d+)/);
  if (greaterThanMatch) {
    return parseInt(greaterThanMatch[1], 10);
  }
  
  // Handle "2 - 12(km/h) // Breeze" format (range)
  const rangeMatch = label.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    return Math.round((min + max) / 2); // Return average of range
  }
  
  // Handle single number format
  const singleMatch = label.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1], 10);
  }
  
  return 0;
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
  
  const normalizedLabel = label.toLowerCase();
  const normalizedCondition = condition.toLowerCase();
  
  if (normalizedCondition === 'sunny') return normalizedLabel === 'sunny';
  if (normalizedCondition === 'rain') return ['rain', 'light rain', 'heavy rain'].includes(normalizedLabel);
  if (normalizedCondition === 'snow') return ['snow', 'light snow', 'heavy snow', 'blizzard'].includes(normalizedLabel);
  if (normalizedCondition === 'fog') return normalizedLabel === 'fog';
  if (normalizedCondition === 'cloudy') return normalizedLabel === 'cloudy';
  
  return normalizedLabel === normalizedCondition;
}

// ------------------- Weather Combination Validator -------------------
// Validates that weather combinations are valid according to the rules
function validateWeatherCombination(weather) {
  const issues = [];
  
  // Check precipitation conditions FIRST (most important)
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
  
  if (issues.length > 0) {
    console.warn(`[weatherValidation.js]: Weather validation failed:`, {
      weather: {
        temperature: weather.temperature?.label,
        wind: weather.wind?.label,
        precipitation: weather.precipitation?.label,
        special: weather.special?.label
      },
      issues: issues
    });
    return false;
  }
  
  return true;
}

module.exports = {
  validateWeatherCombination,
  findWeatherEmoji
}; 