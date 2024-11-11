// raceModule.js

const { capitalize } = require('../modules/formattingModule'); // Importing capitalize function

// List of races with their display names and values
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
].sort((a, b) => a.name.localeCompare(b.name)); // Ensure sorting by name

// Get all races with their names properly capitalized
const getAllRaces = () => races.map(race => capitalize(race.name));

// Check if a given race name is valid
const isValidRace = (raceName) => races.some(race => race.name.toLowerCase() === raceName.toLowerCase());

// Get the race value by its name
const getRaceValueByName = (name) => {
  const race = races.find(race => race.name.toLowerCase() === name.toLowerCase());
  return race ? race.value : null;
};

module.exports = {
  getAllRaces,
  isValidRace,
  getRaceValueByName
};

/*
Notes:
- Added comments to describe the purpose of each function.
- Ensured proper handling of race names with capitalization.
- Sorted races by name for consistent display.
*/
