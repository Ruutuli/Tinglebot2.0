// ------------------- Import necessary modules -------------------
const { capitalize } = require('../modules/formattingModule'); // Shared utility for capitalization

// ------------------- Location data and initialization -------------------
const locations = {
  Regions: {
    Eldin: {},
    Lanayru: {},
    Faron: {},
    CentralHyrule: {},
    Gerudo: {},
    Hebra: {},
  },
  Villages: {
    Rudania: { region: 'Eldin', color: '#d7342a', emoji: '<:rudania:899492917452890142>' },
    Inariko: { region: 'Lanayru', color: '#277ecd', emoji: '<:inariko:899493009073274920>' },
    Vhintl: { region: 'Faron', color: '#25c059', emoji: '<:vhintl:899492879205007450>' },
  },
  Roads: {
    PathOfScarletLeaves: { from: 'Rudania', to: 'Inariko' },
    LeafDewWay: { from: 'Inariko', to: 'Vhintl' },
  },
};

// Extract village names and ensure capitalization
const validVillages = Object.keys(locations.Villages).map(capitalize);

// ------------------- Village-related functions -------------------

// Get all village names with proper capitalization
const getAllVillages = () => validVillages;

// Get village color by name, ensuring capitalization
const getVillageColorByName = (name) => {
  const villageName = capitalize(name);
  return locations.Villages[villageName]?.color || null;
};

// Get village emoji by name, ensuring capitalization
const getVillageEmojiByName = (name) => {
  const villageName = capitalize(name);
  return locations.Villages[villageName]?.emoji || null;
};

// Validate if the village name is valid
const isValidVillage = (village) => {
  return validVillages.includes(capitalize(village));
};

// Get the region of a village by its name, ensuring capitalization
const getVillageRegionByName = (name) => {
  const villageName = capitalize(name);
  return locations.Villages[villageName]?.region || null;
};

// ------------------- Logging Utility -------------------
const logError = (errorMessage) => {
  console.error(`[locationsModule.js]: ${errorMessage}`);
};

// ------------------- Exports -------------------
module.exports = {
  locations,
  getAllVillages,
  getVillageColorByName,
  getVillageEmojiByName,
  isValidVillage,
  getVillageRegionByName,
};
