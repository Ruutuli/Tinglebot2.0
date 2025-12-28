// formattingModule.js

// Color definitions for different item types
const typeColors = {
  '1h': '#FF5733', '2h': '#33FF57', 'Chest': '#3357FF', 'Legs': '#FF33A1', 'Natural': '#D2B48C',
  'Ore': '#708090', 'Ancient Parts': '#CC7722', 'Creature': '#008080', 'Mushroom': '#FF0000',
  'Plant': '#00FF00', 'Fish': '#0000FF', 'Fruit': '#FFC0CB', 'Meat': '#8B0000',
  'Monster': '#FF00FF', 'Dairy': '#FFFFFF', 'Protein': '#FFA500', 'Sweets': '#FFFF00',
  'Grain': '#A52A2A', 'Vegetable': '#00FF00', 'Fungi': '#FF0000', 'Seafood': '#0000FF',
  'Special': '#800080', 'Head': '#FFD700', 'Bow': '#ADFF2F', 'Potion': '#7FFF00',
  'Inedible': '#696969', 'Recipe': '#00CC00'
};

// Function to get color based on item category
function getCategoryColor(category) {
  const categoryColors = {
    'Weapon': '#CC0000',      // Muted Red
    'Armor': '#0000CC',       // Muted Blue
    'Recipe': '#00CC00',      // Muted Green
    'Misc': '#CCCC00',        // Muted Yellow
    'Material': '#999999',    // Muted Grey
    'Default': '#CCCCCC'      // Muted Light Grey
  };

  // Ensure category is iterable
  if (!Array.isArray(category)) {
    category = [category];
  }

  for (const cat of category) {
    if (categoryColors[cat]) {
      return categoryColors[cat];
    }
  }
  return categoryColors['Default'];
}

// Function to generate a random color in hexadecimal format
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// Function to return a specified color or a random color if no color is specified
function getEmbedColor(color) {
  return color || getRandomColor();
}

// String manipulation functions
const capitalizeWords = (string) => {
  if (!string) return '';
  return string.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

function capitalize(str) {
  if (typeof str !== 'string') return '';
  return str.split('/').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('/');
}

function capitalizeFirstLetter(str) {
  if (typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function toLowerCase(str) {
  if (typeof str !== 'string') return '';
  return str.toLowerCase();
}

function toUpperCase(str) {
  if (typeof str !== 'string') return '';
  return str.toUpperCase();
}

function trim(str) {
  if (typeof str !== 'string') return '';
  return str.trim();
}

function replaceAll(str, search, replacement) {
  if (typeof str !== 'string') return '';
  return str.split(search).join(replacement);
}

function split(str, delimiter) {
  if (typeof str !== 'string') return [];
  return str.split(delimiter);
}

function join(arr, delimiter) {
  if (!Array.isArray(arr)) return '';
  return arr.join(delimiter);
}

// Date and time formatting function
function formatDateTime(date) {
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  };
  return new Intl.DateTimeFormat('en-US', options).format(new Date(date)).replace(',', ' |') + ' EST';
}


// Export module
module.exports = {
  typeColors,
  getCategoryColor,
  getRandomColor,
  getEmbedColor,
  capitalizeWords,
  capitalize,
  capitalizeFirstLetter,
  toLowerCase,
  toUpperCase,
  trim,
  replaceAll,
  split,
  join,
  formatDateTime,
};
