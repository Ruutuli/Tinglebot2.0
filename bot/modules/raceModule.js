// ------------------- Import necessary modules -------------------
const { capitalize } = require('../modules/formattingModule');

// Define a list of races with their display names and values
const races = [
  { name: 'Gerudo', value: 'gerudo' },
  { name: 'Goron', value: 'goron' },
  { name: 'Hylian', value: 'hylian' },
  { name: 'Keaton', value: 'keaton' },
  { name: 'Korok/Kokiri', value: 'korok/kokiri' },
  { name: 'Mixed', value: 'mixed' },
  { name: 'Mogma', value: 'mogma' },
  { name: 'Rito', value: 'rito' },
  { name: 'Sheikah', value: 'sheikah' },
  { name: 'Twili', value: 'twili' },
  { name: 'Zora', value: 'zora' }
].sort((a, b) => a.name.localeCompare(b.name)); // Sort races alphabetically for consistency

// ------------------- Race-related functions -------------------

// Fetch all races with names properly capitalized
const getAllRaces = () => races.map(race => capitalize(race.name));

// Validate if a race name is valid
const isValidRace = (raceName) => {
  return races.some(race => race.name.toLowerCase() === raceName.toLowerCase());
};

// Get the value of a race by its name
const getRaceValueByName = (name) => {
  const race = races.find(race => race.name.toLowerCase() === name.toLowerCase());
  return race ? race.value : null;
};

// ------------------- Error Handling Utility -------------------
const logError = (errorMessage) => {
  console.error(`[raceModule.js]: ${errorMessage}`);
};

// Example usage of error logging for invalid inputs
const getRaceValueOrLogError = (name) => {
  const value = getRaceValueByName(name);
  if (!value) {
    logError(`Invalid race name provided: ${name}`);
  }
  return value;
};

// ------------------- Exports -------------------
module.exports = {
  getAllRaces,
  isValidRace,
  getRaceValueByName,
  getRaceValueOrLogError
};

