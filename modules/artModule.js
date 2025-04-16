const { handleError } = require('../utils/globalErrorHandler');

// ------------------- Base Token Values -------------------
// These are the base token costs for different art categories
const baseTokens = {
  chibi: 15,
  headshot: 10,
  waistup: 15,
  fullbody: 20,
  other: 5
};

// ------------------- Type Multipliers -------------------
// Multipliers applied based on the complexity or type of the subject
const typeMultipliers = {
  simple: 0.5,
  complex: 2,
  humanoid: 1,
  anthro: 1.5,
  other: 0.5
};

// ------------------- Product Multipliers -------------------
// Multipliers applied based on the style of the art
const productMultipliers = {
  sketch: 0.5,
  lineArt: 1,
  monochrome: 2,
  flatColor: 3,
  fullColor: 4,
  pixel: 4,
  painted: 5
};

// ------------------- Add-Ons -------------------
// Additional costs for props and backgrounds
const addOns = {
  simpleProp: 15,
  complexProp: 20,
  simpleBg: 20,
  complexBg: 40
};

// ------------------- Special Works ------------------- 
// Additional costs for special works like comics and animation
const specialWorks = {
  comicSimple: 10,
  comicComplex: 20,
  frameSimple: 10,
  frameComplex: 20,
};

// ------------------- Export all constants -------------------
module.exports = {
  baseTokens,
  typeMultipliers,
  productMultipliers,
  addOns,
  specialWorks
};

