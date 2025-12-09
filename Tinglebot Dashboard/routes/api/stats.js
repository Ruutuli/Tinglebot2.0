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
const { getCharacterInventoryCollection } = require('../../database/db');

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

// ------------------- Function: countSpiritOrbsBatch -------------------
// Counts spirit orbs for multiple characters efficiently
async function countSpiritOrbsBatch(characterNames) {
  const spiritOrbCounts = {};
  
  for (const characterName of characterNames) {
    try {
      if (!characterName || typeof characterName !== 'string') {
        spiritOrbCounts[characterName] = 0;
        continue;
      }
      
      const col = await getCharacterInventoryCollection(characterName);
      const spiritOrbItem = await col.findOne({ 
        itemName: { $regex: /^spirit\s*orb$/i } 
      });
      const count = spiritOrbItem ? spiritOrbItem.quantity || 0 : 0;
      spiritOrbCounts[characterName] = count;
    } catch (error) {
      console.warn(`[stats.js]: ⚠️ Error counting spirit orbs for ${characterName}:`, error.message);
      spiritOrbCounts[characterName] = 0;
    }
  }
  
  return spiritOrbCounts;
}

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
  perVillageAgg.forEach(r => {
    if (charactersPerVillage[r._id] !== undefined) charactersPerVillage[r._id] = r.count;
  });
  
  // Add mod characters to village counts
  Object.keys(charactersPerVillage).forEach(village => {
    charactersPerVillage[village] += (modCharactersPerVillage[village] || 0);
  });

  // Get characters per race (including mod characters)
  const perRaceAgg = await Character.aggregate([
    { 
      $match: { 
        race: { 
          $exists: true, 
          $ne: null, 
          $ne: '',
          $ne: 'undefined',
          $ne: 'null',
          $ne: 'Unknown',
          $ne: 'unknown'
        },
        name: { $nin: ['Tingle', 'Tingle test', 'John'] }
      } 
    },
    { $group: { _id: "$race", count: { $sum: 1 } } }
  ]);
  
  // Also count mod characters per race
  const modCharactersPerRace = {};
  modCharacters.forEach(char => {
    if (char && char.race && 
        typeof char.race === 'string' &&
        char.race !== 'undefined' && 
        char.race !== 'null' && 
        char.race !== 'Unknown' && 
        char.race !== 'unknown' &&
        char.race.trim() !== '') {
      modCharactersPerRace[char.race] = (modCharactersPerRace[char.race] || 0) + 1;
    }
  });
  
  const charactersPerRace = {};
  perRaceAgg.forEach(r => {
    if (r && r._id && 
        typeof r._id === 'string' &&
        r._id !== 'undefined' && 
        r._id !== 'null' && 
        r._id !== 'Unknown' && 
        r._id !== 'unknown' &&
        r._id.trim() !== '') {
      charactersPerRace[r._id] = r.count;
    }
  });
  
  // Add mod characters to race counts
  Object.keys(modCharactersPerRace).forEach(race => {
    charactersPerRace[race] = (charactersPerRace[race] || 0) + modCharactersPerRace[race];
  });

  // Get characters per job (including mod characters)
  const perJobAgg = await Character.aggregate([
    { $match: { 
      job: { $exists: true, $ne: null, $ne: '' },
      name: { $nin: ['Tingle', 'Tingle test', 'John'] }
    } },
    { $project: { job: { $toLower: { $ifNull: ["$job", "unknown"] } } } },
    { $group: { _id: { $concat: [{ $toUpper: { $substr: ["$job", 0, 1] } }, { $substr: ["$job", 1, { $strLenCP: "$job" }] }] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  
  // Also count mod characters per job
  const modCharactersPerJob = {};
  modCharacters.forEach(char => {
    if (char && char.job && 
        typeof char.job === 'string' &&
        char.job !== 'undefined' && 
        char.job !== 'null' && 
        char.job !== 'Unknown' && 
        char.job !== 'unknown' &&
        char.job.trim() !== '') {
      const jobKey = char.job.charAt(0).toUpperCase() + char.job.slice(1).toLowerCase();
      modCharactersPerJob[jobKey] = (modCharactersPerJob[jobKey] || 0) + 1;
    }
  });
  
  const charactersPerJob = {};
  perJobAgg.forEach(r => {
    if (r && r._id && 
        typeof r._id === 'string' &&
        r._id !== 'undefined' && 
        r._id !== 'null' && 
        r._id !== 'unknown' && 
        r._id !== 'Unknown' &&
        r._id.trim() !== '') {
      charactersPerJob[r._id] = r.count;
    }
  });
  
  // Add mod characters to job counts
  Object.keys(modCharactersPerJob).forEach(job => {
    charactersPerJob[job] = (charactersPerJob[job] || 0) + modCharactersPerJob[job];
  });

  // Get upcoming birthdays (including mod characters)
  const today = new Date();
  const thisYr = today.getFullYear();
  const allBday = await Character.find({ 
    birthday: { $exists: true, $ne: '' },
    name: { $nin: ['Tingle', 'Tingle test', 'John'] }
  }, { name: 1, birthday: 1 }).lean();
  
  // Add mod character birthdays
  const modBday = modCharacters.filter(c => c && c.birthday && typeof c.birthday === 'string' && c.birthday !== '').map(c => ({
    name: c.name,
    birthday: c.birthday
  }));
  
  const allBirthdays = [...allBday, ...modBday];
  const upcoming = allBirthdays
    .filter(c => c && c.birthday && typeof c.birthday === 'string' && c.birthday.length >= 5)
    .map(c => {
      try {
        const mmdd = c.birthday.slice(-5);
        let next = isNaN(Date.parse(`${thisYr}-${mmdd}`))
          ? null
          : new Date(`${thisYr}-${mmdd}`);
        if (next && next < today) next.setFullYear(thisYr + 1);
        return { name: c.name, birthday: c.birthday, nextBirthday: next };
      } catch (error) {
        console.warn(`[stats.js]: ⚠️ Error processing birthday for ${c.name}:`, error.message);
        return { name: c.name, birthday: c.birthday, nextBirthday: null };
      }
    })
    .filter(c => c.nextBirthday && (c.nextBirthday - today) <= (30 * 24 * 60 * 60 * 1000))
    .sort((a, b) => a.nextBirthday - b.nextBirthday);

  // Get visiting counts and details (including mod characters)
  const villages = ['rudania', 'inariko', 'vhintl'];
  const visitingAgg = await Character.aggregate([
    { $match: { 
      currentVillage: { $in: villages }, 
      homeVillage: { $in: villages, $ne: null }, 
      $expr: { $ne: ['$currentVillage', '$homeVillage'] },
      name: { $nin: ['Tingle', 'Tingle test', 'John'] }
    } },
    { $group: { _id: '$currentVillage', count: { $sum: 1 } } }
  ]);
  
  // Also count mod characters visiting other villages
  const modVisitingCounts = { rudania: 0, inariko: 0, vhintl: 0 };
  modCharacters.forEach(char => {
    if (char && char.currentVillage && char.homeVillage && 
        typeof char.currentVillage === 'string' &&
        typeof char.homeVillage === 'string' &&
        villages.includes(char.currentVillage.toLowerCase()) && 
        villages.includes(char.homeVillage.toLowerCase()) &&
        char.currentVillage.toLowerCase() !== char.homeVillage.toLowerCase()) {
      const currentVillage = char.currentVillage.toLowerCase();
      modVisitingCounts[currentVillage]++;
    }
  });
  
  const visitingCounts = { rudania: 0, inariko: 0, vhintl: 0 };
  visitingAgg.forEach(r => visitingCounts[r._id] = r.count);
  
  // Add mod character visiting counts
  Object.keys(visitingCounts).forEach(village => {
    visitingCounts[village] += modVisitingCounts[village];
  });

  // Get detailed visiting characters
  const visitingCharacters = await Character.find(
    { 
      currentVillage: { $in: villages }, 
      homeVillage: { $in: villages, $ne: null }, 
      $expr: { $ne: ['$currentVillage', '$homeVillage'] },
      name: { $nin: ['Tingle', 'Tingle test', 'John'] }
    },
    { name: 1, currentVillage: 1, homeVillage: 1 }
  ).lean();

  // Add mod characters visiting other villages
  const modVisitingCharacters = modCharacters.filter(char => 
    char && char.currentVillage && char.homeVillage && 
    typeof char.currentVillage === 'string' &&
    typeof char.homeVillage === 'string' &&
    villages.includes(char.currentVillage.toLowerCase()) && 
    villages.includes(char.homeVillage.toLowerCase()) &&
    char.currentVillage.toLowerCase() !== char.homeVillage.toLowerCase()
  ).map(char => ({
    name: char.name,
    currentVillage: char.currentVillage,
    homeVillage: char.homeVillage
  }));

  // Group visiting characters by current village
  const visitingDetails = { rudania: [], inariko: [], vhintl: [] };
  [...visitingCharacters, ...modVisitingCharacters].forEach(char => {
    if (char && char.currentVillage && typeof char.currentVillage === 'string') {
      const currentVillage = char.currentVillage.toLowerCase();
      if (visitingDetails[currentVillage]) {
        visitingDetails[currentVillage].push({
          name: char.name || 'Unknown',
          homeVillage: char.homeVillage || 'Unknown'
        });
      }
    }
  });

  // Get top characters by various stats
  const getTop = async (field) => {
    const top = await Character.find({ 
      [field]: { $gt: 0 },
      name: { $nin: ['Tingle', 'Tingle test', 'John'] }
    })
      .sort({ [field]: -1 })
      .limit(5)
      .select({ name: 1, [field]: 1 })
      .lean();
    
    if (!top.length) return { names: [], values: [], value: 0 };
    
    // Return all top characters with their individual values
    const names = top.map(c => c.name);
    const values = top.map(c => c[field]);
    
    return { names, values, value: top[0][field] };
  };

  // Get top characters by stamina and hearts (from character model)
  const [mostStamina, mostHearts] = await Promise.all([
    getTop('maxStamina'),
    getTop('maxHearts')
  ]);

  // Get top characters by spirit orbs (from inventory, including mod characters)
  let mostOrbs = { names: [], values: [], value: 0 };
  try {
    const regularCharacterNames = regularCharacters.map(c => c.name).filter(name => name);
    const modCharacterNames = modCharacters.map(c => c.name).filter(name => name);
    const allCharacterNames = [...regularCharacterNames, ...modCharacterNames];
    
    if (allCharacterNames.length > 0) {
      const spiritOrbCounts = await countSpiritOrbsBatch(allCharacterNames);
      
      // Sort characters by spirit orb count and get top 5
      const charactersWithOrbs = Object.entries(spiritOrbCounts)
        .filter(([_, count]) => count > 0)
        .sort(([_, a], [__, b]) => b - a)
        .slice(0, 5);
      
      if (charactersWithOrbs.length > 0) {
        mostOrbs = {
          names: charactersWithOrbs.map(([name, _]) => name),
          values: charactersWithOrbs.map(([_, count]) => count),
          value: charactersWithOrbs[0][1]
        };
      }
    }
  } catch (spiritOrbError) {
    console.warn('[stats.js]: ⚠️ Error counting spirit orbs for stats, using defaults:', spiritOrbError.message);
  }

  // Get special character counts (mod characters are immune to negative effects)
  const [kodCount, blightedCount, debuffedCount, jailedCount] = await Promise.all([
    Character.countDocuments({ ko: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } }),
    Character.countDocuments({ blighted: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } }),
    Character.countDocuments({ 'debuff.active': true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } }),
    Character.countDocuments({ inJail: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } })
  ]);

  // Get debuffed characters details
  const debuffedCharacters = await Character.find(
    { 'debuff.active': true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } },
    { name: 1, 'debuff.endDate': 1 }
  ).lean();

  // Get KO'd and blighted characters details
  const kodCharacters = await Character.find(
    { ko: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } },
    { name: 1, lastRollDate: 1, ko: 1 }
  ).lean();
  const blightedCharacters = await Character.find(
    { blighted: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } },
    { name: 1, blightedAt: 1, blighted: 1 }
  ).lean();

  // Get jailed characters details
  const jailedCharacters = await Character.find(
    { inJail: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } },
    { name: 1, jailReleaseTime: 1, currentVillage: 1, homeVillage: 1 }
  ).lean();

  // Get mod character statistics
  const modCharacterStats = {
    totalModCharacters: modCharacters.length,
    modCharactersPerType: {},
    modCharactersPerVillage: {}
  };
  
  // Count mod characters by type
  modCharacters.forEach(char => {
    if (char && char.modType) {
      modCharacterStats.modCharactersPerType[char.modType] = (modCharacterStats.modCharactersPerType[char.modType] || 0) + 1;
    }
    if (char && char.homeVillage && typeof char.homeVillage === 'string') {
      const village = char.homeVillage.toLowerCase();
      modCharacterStats.modCharactersPerVillage[village] = (modCharacterStats.modCharactersPerVillage[village] || 0) + 1;
    }
  });

  res.json({
    totalCharacters,
    charactersPerVillage,
    charactersPerRace,
    charactersPerJob,
    upcomingBirthdays: upcoming,
    visitingCounts,
    visitingDetails,
    mostStaminaChar: mostStamina,
    mostHeartsChar: mostHearts,
    mostOrbsChar: mostOrbs,
    kodCount,
    blightedCount,
    debuffedCount,
    jailedCount,
    debuffedCharacters,
    kodCharacters,
    blightedCharacters,
    jailedCharacters,
    modCharacterStats,
    timestamp: Date.now()
  });
}));

module.exports = router;

