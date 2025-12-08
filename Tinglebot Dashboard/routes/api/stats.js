// ============================================================================
// ------------------- Statistics API Routes -------------------
// Routes for system statistics and analytics
// ============================================================================

const express = require('express');
const router = express.Router();
const Character = require('../../models/CharacterModel');
const ModCharacter = require('../../models/ModCharacterModel');
const User = require('../../models/UserModel');
const Pet = require('../../models/PetModel');
const Mount = require('../../models/MountModel');
const VillageShops = require('../../models/VillageShopsModel');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// ------------------- Function: getTinglebotStats -------------------
// Returns statistics for Tinglebot system data
router.get('/tinglebot', asyncHandler(async (req, res) => {
  const [totalUsers, activePets, totalMounts, villageShops] = await Promise.all([
    User.countDocuments(),
    Pet.countDocuments({ status: 'active' }),
    Mount.countDocuments(),
    VillageShops.countDocuments()
  ]);
  res.json({ totalUsers, activePets, totalMounts, villageShops });
}));

// ------------------- Function: getCharacterStats -------------------
// Returns comprehensive character statistics and analytics
router.get('/characters', asyncHandler(async (req, res) => {
  // Get both regular and mod characters for total count
  const [regularCharacters, modCharacters] = await Promise.all([
    Character.find({ name: { $nin: ['Tingle', 'Tingle test', 'John'] } }).lean(),
    ModCharacter.find({}).lean()
  ]);
  
  const totalCharacters = regularCharacters.length + modCharacters.length;
  const allCharacters = [...regularCharacters, ...modCharacters];

  // Get characters per village (including mod characters)
  const perVillageAgg = await Character.aggregate([
    { $match: { 
      homeVillage: { $exists: true, $ne: null },
      name: { $nin: ['Tingle', 'Tingle test', 'John'] }
    } },
    { $group: { _id: { $toLower: { $ifNull: ["$homeVillage", "unknown"] } }, count: { $sum: 1 } } }
  ]);
  
  // Also count mod characters per village
  const modCharactersPerVillage = {};
  modCharacters.forEach(char => {
    if (char && char.homeVillage && typeof char.homeVillage === 'string') {
      const village = char.homeVillage.toLowerCase();
      modCharactersPerVillage[village] = (modCharactersPerVillage[village] || 0) + 1;
    }
  });
  
  const charactersPerVillage = { rudania: 0, inariko: 0, vhintl: 0 };
  perVillageAgg.forEach(item => {
    const village = item._id.toLowerCase();
    if (charactersPerVillage.hasOwnProperty(village)) {
      charactersPerVillage[village] = item.count + (modCharactersPerVillage[village] || 0);
    }
  });
  
  // Add mod characters that weren't in the aggregation
  Object.keys(modCharactersPerVillage).forEach(village => {
    if (charactersPerVillage.hasOwnProperty(village)) {
      charactersPerVillage[village] = (charactersPerVillage[village] || 0) + modCharactersPerVillage[village];
    }
  });

  // Get characters per race
  const raceCounts = {};
  allCharacters.forEach(char => {
    if (char.race) {
      raceCounts[char.race] = (raceCounts[char.race] || 0) + 1;
    }
  });

  // Get characters per job
  const jobCounts = {};
  allCharacters.forEach(char => {
    if (char.job) {
      jobCounts[char.job] = (jobCounts[char.job] || 0) + 1;
    }
  });

  res.json({
    totalCharacters,
    charactersPerVillage,
    raceCounts,
    jobCounts,
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;

