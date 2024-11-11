// locationsModule.js

// Define locations, villages, and roads
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
    Rudania: { region: 'Eldin', color: '#d7342a' },
    Inariko: { region: 'Lanayru', color: '#277ecd' },
    Vhintl: { region: 'Faron', color: '#25c059' },
  },
  Roads: {
    PathOfScarletLeaves: { from: 'Rudania', to: 'Inariko' },
    LeafDewWay: { from: 'Inariko', to: 'Vhintl' },
  },
};

const validVillages = ['Rudania', 'Inariko', 'Vhintl'];

// Get all village names
function getAllVillages() {
  return validVillages;
}

// Get village color by name
const getVillageColorByName = (name) => {
  return locations.Villages[capitalizeFirstLetter(name)]?.color || null;
};

// Validate if the village name is valid
function isValidVillage(village) {
  return validVillages.map(v => v.toLowerCase()).includes(village.toLowerCase());
}

// Get the region of a village by its name
const getVillageRegionByName = (name) => {
  const village = locations.Villages[capitalizeFirstLetter(name)];
  return village ? village.region : null;
};

const capitalizeFirstLetter = (string) => {
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
};

module.exports = {
  locations,
  getAllVillages,
  getVillageColorByName,
  isValidVillage,
  getVillageRegionByName,
};
