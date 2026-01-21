// ============================================================================
// ------------------- Statistics API Routes -------------------
// Routes for system statistics and analytics
// ============================================================================

const express = require('express');
const router = express.Router();
const Character = require('@/shared/models/CharacterModel');
const ModCharacter = require('@/shared/models/ModCharacterModel');
const User = require('@/shared/models/UserModel');
const Pet = require('@/shared/models/PetModel');
const Mount = require('@/shared/models/MountModel');
const VillageShops = require('@/shared/models/VillageShopsModel');
const Quest = require('@/shared/models/QuestModel');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('@/shared/utils/logger');
const { getCharacterInventoryCollection } = require('@/shared/database/db');

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

  // Prepare allCharacters with only necessary fields for detail views
  const allCharactersData = allCharacters.map(char => ({
    name: char.name,
    homeVillage: char.homeVillage,
    race: char.race,
    job: char.job
  }));

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
    allCharacters: allCharactersData,
    timestamp: Date.now()
  });
}));

// ------------------- Function: getQuestStats -------------------
// Returns comprehensive quest statistics and analytics
router.get('/quests', asyncHandler(async (req, res) => {
  try {
    // Get all quests
    const allQuests = await Quest.find({}).lean();
    
    // Get total legacy quests from all users and build leaderboard
    const usersWithLegacy = await User.find({
      'quests.legacy.totalTransferred': { $gt: 0 }
    }).select('discordId username nickname quests.legacy.totalTransferred').lean();
    
    const totalLegacyQuests = usersWithLegacy.reduce((sum, user) => {
      const legacyCount = user.quests?.legacy?.totalTransferred || 0;
      return sum + legacyCount;
    }, 0);
    
    // Top legacy quest participants leaderboard
    const legacyParticipants = usersWithLegacy
      .map(user => ({
        userId: user.discordId,
        username: user.nickname || user.username || user.discordId,
        count: user.quests?.legacy?.totalTransferred || 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    const totalQuests = allQuests.length;
    const totalAllTimeQuests = totalQuests + totalLegacyQuests;
    const activeQuests = allQuests.filter(q => q.status === 'active').length;
    const completedQuests = allQuests.filter(q => q.status === 'completed').length;
    
    // Quests per type
    const questsPerType = {};
    const questsByType = {};
    allQuests.forEach(q => {
      if (q.questType) {
        questsPerType[q.questType] = (questsPerType[q.questType] || 0) + 1;
        if (!questsByType[q.questType]) {
          questsByType[q.questType] = [];
        }
        questsByType[q.questType].push({
          questID: q.questID,
          title: q.title,
          questType: q.questType,
          location: q.location,
          status: q.status,
          date: q.date,
          postedAt: q.postedAt,
          createdAt: q.createdAt,
          participantCount: q.participants ? (typeof q.participants === 'object' && q.participants.size !== undefined ? q.participants.size : Object.keys(q.participants || {}).length) : 0
        });
      }
    });
    
    // Completion rates by type
    const completionRateByType = {};
    Object.keys(questsPerType).forEach(type => {
      const typeQuests = allQuests.filter(q => q.questType === type);
      const typeCompleted = typeQuests.filter(q => q.status === 'completed').length;
      completionRateByType[type] = typeQuests.length > 0
        ? ((typeCompleted / typeQuests.length) * 100).toFixed(1)
        : 0;
    });
    
    // Average participants per quest
    let totalParticipants = 0;
    allQuests.forEach(q => {
      if (q.participants) {
        const participantCount = typeof q.participants === 'object' && q.participants.size !== undefined 
          ? q.participants.size 
          : Object.keys(q.participants || {}).length;
        totalParticipants += participantCount;
      }
    });
    const avgParticipants = totalQuests > 0 ? (totalParticipants / totalQuests).toFixed(2) : 0;
    
    // Quest participation leaderboard (users with most quest participations)
    const userParticipationCount = {};
    allQuests.forEach(q => {
      if (q.participants) {
        const participants = typeof q.participants === 'object' && q.participants.size !== undefined
          ? Array.from(q.participants.values())
          : Object.values(q.participants || {});
        
        participants.forEach(participant => {
          if (participant && participant.userId) {
            userParticipationCount[participant.userId] = (userParticipationCount[participant.userId] || 0) + 1;
          }
        });
      }
    });
    
    const topParticipants = Object.entries(userParticipationCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));
    
    // Fetch usernames for top participants
    const topParticipantUserIds = topParticipants.map(t => t.userId);
    const users = await User.find({ discordId: { $in: topParticipantUserIds } })
      .select('discordId username nickname')
      .lean();
    
    const userMap = {};
    users.forEach(u => {
      userMap[u.discordId] = u.nickname || u.username || u.discordId;
    });
    
    const topParticipantsWithDetails = topParticipants.map(t => ({
      userId: t.userId,
      username: userMap[t.userId] || 'Unknown User',
      count: t.count
    }));
    
    // Quests by location/village
    const questsByLocation = {};
    allQuests.forEach(q => {
      if (q.location) {
        questsByLocation[q.location] = (questsByLocation[q.location] || 0) + 1;
      }
    });
    
    // Recent quests (last 20)
    const recentQuests = allQuests
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateB - dateA;
      })
      .slice(0, 20)
      .map(q => ({
        questID: q.questID,
        title: q.title,
        questType: q.questType,
        location: q.location,
        status: q.status,
        date: q.date,
        createdAt: q.createdAt
      }));
    
    res.json({
      totalQuests,
      totalLegacyQuests,
      totalAllTimeQuests,
      activeQuests,
      completedQuests,
      questsPerType,
      questsByType,
      completionRateByType,
      avgParticipants: parseFloat(avgParticipants),
      topParticipants: topParticipantsWithDetails,
      topLegacyParticipants: legacyParticipants,
      questsByLocation,
      recentQuests,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching quest stats', error, 'stats.js');
    res.status(500).json({ error: 'Failed to fetch quest stats' });
  }
}));

module.exports = router;

