// const { v4: uuidv4 } = require('uuid');
// const { getRandomMount, getRandomEnvironment, getMountRarity, getMountStamina } = require('./mountModule');
// const { storeEncounter } = require('./mountModule');
// const { handleError } = require('@app/shared/utils/globalErrorHandler');
// const TempData = require('@app/shared/models/TempDataModel');

// // Message activity tracking
// const messageActivityMap = new Map(); // Map to store message activity per channel
// const MESSAGE_THRESHOLD = 50; // Number of messages needed to trigger a random encounter
// const ENCOUNTER_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
// const lastEncounterMap = new Map(); // Map to store last encounter time per channel
// const MESSAGE_COOLDOWN = 5 * 60 * 1000; // 5 minutes cooldown between message counts
// const lastMessageTimeMap = new Map(); // Map to store last message time per channel

// // Monthly encounter tracking
// const MONTHLY_RESET_KEY = 'monthly_mount_encounter_reset'; // Key for monthly mount encounter reset

// // Load monthly encounter data from MongoDB
// async function loadMonthlyEncounterData() {
//     try {
//         const monthlyData = await TempData.findAllByType('monthly_mount');
//         const data = {};
//         for (const entry of monthlyData) {
//             data[entry.key] = entry.data;
//         }
//         return new Map(Object.entries(data));
//     } catch (error) {
//         console.error('[randomMountEncounterModule]: Error loading monthly encounter data:', error);
//         return new Map();
//     }
// }

// // Save monthly encounter data to MongoDB
// async function saveMonthlyEncounterData(monthlyEncounterMap) {
//     try {
//         const now = new Date();
//         const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
//         for (const [key, value] of monthlyEncounterMap.entries()) {
//             await TempData.findOneAndUpdate(
//                 { type: 'monthly_mount', key },
//                 { data: value, expiresAt: endOfMonth },
//                 { upsert: true, new: true }
//             );
//         }
//     } catch (error) {
//         console.error('[randomMountEncounterModule]: Error saving monthly encounter data:', error);
//     }
// }

// // Initialize monthly tracking
// async function initializeMonthlyTracking() {
//     const now = new Date();
//     const monthlyEncounterMap = await loadMonthlyEncounterData();
//     let lastReset;
//     if (monthlyEncounterMap.has(MONTHLY_RESET_KEY)) {
//         lastReset = new Date(monthlyEncounterMap.get(MONTHLY_RESET_KEY));
//     } else {
//         lastReset = null;
//     }
//     if (!lastReset || now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
//         for (const key of Array.from(monthlyEncounterMap.keys())) {
//             if (key !== MONTHLY_RESET_KEY) {
//                 monthlyEncounterMap.delete(key);
//             }
//         }
//         monthlyEncounterMap.set(MONTHLY_RESET_KEY, now.toISOString());
//         await saveMonthlyEncounterData(monthlyEncounterMap);
//     }
//     return monthlyEncounterMap;
// }

// // Track message activity
// function trackMessageActivity(channelId) {
//     const now = Date.now();
//     const lastMessageTime = lastMessageTimeMap.get(channelId) || 0;
//     const lastEncounter = lastEncounterMap.get(channelId) || 0;
    
//     // Check if enough time has passed since last message
//     if (now - lastMessageTime < MESSAGE_COOLDOWN) {
//         return false;
//     }
    
//     // Check if enough time has passed since last encounter
//     if (now - lastEncounter < ENCOUNTER_COOLDOWN) {
//         return false;
//     }
    
//     const currentCount = messageActivityMap.get(channelId) || 0;
//     messageActivityMap.set(channelId, currentCount + 1);
//     lastMessageTimeMap.set(channelId, now);
    
//     // Check if we should trigger a random encounter
//     if (currentCount + 1 >= MESSAGE_THRESHOLD) {
//         messageActivityMap.set(channelId, 0); // Reset message count
//         lastEncounterMap.set(channelId, now);
//         return true; // Signal to create an encounter
//     }
//     return false;
// }

// // Check if channel needs monthly encounter
// async function needsMonthlyEncounter(channelId) {
//     const now = new Date();
//     const village = getVillageFromChannelId(channelId);
//     if (!village) {
//         console.error('[randomMountEncounterModule]: Invalid channel ID for monthly encounter');
//         return false;
//     }
//     const monthlyEncounterMap = await loadMonthlyEncounterData();
//     const villageKey = `village_${village.toLowerCase()}`;
//     const lastMonthlyEncounter = monthlyEncounterMap.get(villageKey);

//     if (!lastMonthlyEncounter) {
//         return true;
//     }

//     const lastEncounterDate = new Date(lastMonthlyEncounter);
//     const isDifferentMonth = lastEncounterDate.getMonth() !== now.getMonth() || 
//                             lastEncounterDate.getFullYear() !== now.getFullYear();
    
//     // Check if at least a week has passed since the last encounter
//     const oneWeekInMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
//     const timeSinceLastEncounter = now.getTime() - lastEncounterDate.getTime();
//     const hasWeekPassed = timeSinceLastEncounter >= oneWeekInMs;

//     // Only return true if it's a different month AND at least a week has passed
//     return isDifferentMonth && hasWeekPassed;
// }

// // Create a random mount encounter
// async function createRandomMountEncounter(channelId, isMonthly = false) {
//     try {
//         const monthlyEncounterMap = await initializeMonthlyTracking();
//         const now = new Date();
        
//         // For monthly encounters, check if this village already had one this month
//         if (isMonthly) {
//             const village = getVillageFromChannelId(channelId);
//             if (!village) {
//                 console.error('[randomMountEncounterModule]: Invalid channel ID for monthly encounter');
//                 return null;
//             }
            
//             // Check if this village already had a monthly encounter
//             const villageKey = `village_${village.toLowerCase()}`;
//             const lastEncounter = monthlyEncounterMap.get(villageKey);
            
//             if (lastEncounter) {
//                 const lastEncounterDate = new Date(lastEncounter);
//                 // Only allow if it's a different month
//                 if (lastEncounterDate.getMonth() === now.getMonth() && 
//                     lastEncounterDate.getFullYear() === now.getFullYear()) {
//                     console.log(`[randomMountEncounterModule]: Village ${village} already had a monthly encounter this month`);
//                     return null; // Village already had its monthly encounter this month
//                 }
//             }
            
//             // Mark this village as having had its monthly encounter
//             monthlyEncounterMap.set(villageKey, now.toISOString());
//             await saveMonthlyEncounterData(monthlyEncounterMap);
//             console.log(`[randomMountEncounterModule]: Created new monthly encounter for ${village}`);
//         }
        
//         // Get the village from channel ID
//         const village = getVillageFromChannelId(channelId);
//         if (!village) {
//             console.error('[randomMountEncounterModule]: Invalid channel ID for encounter');
//             return null;
//         }
        
//         // Generate random mount data
//         const randomMount = getRandomMount(village);
//         const rarity = getMountRarity();
//         const mountStamina = getMountStamina(randomMount.level, rarity.isRare);
//         const environment = getRandomEnvironment(village);
        
//         const encounterId = uuidv4();
//         const encounter = {
//             id: encounterId,
//             mountType: randomMount.mount,
//             mountLevel: randomMount.level,
//             village: village, // Use the village from channel ID
//             rarity: rarity.isRare ? 'Rare' : 'Regular',
//             mountStamina: mountStamina,
//             environment: environment,
//             users: [],
//             createdAt: now,
//             isMonthly: isMonthly
//         };
        
//         // Store the encounter
//         await storeEncounter(encounterId, encounter);
        
//         return encounter;
//     } catch (error) {
//         handleError(error, 'randomMountEncounterModule.js');
//         console.error('[randomMountEncounterModule]: Error creating random mount encounter:', error);
//         return null;
//     }
// }

// // Helper function to get village from channel ID
// function getVillageFromChannelId(channelId) {
//     if (channelId === process.env.RUDANIA_TOWN_HALL) return 'Rudania';
//     if (channelId === process.env.INARIKO_TOWN_HALL) return 'Inariko';
//     if (channelId === process.env.VHINTL_TOWN_HALL) return 'Vhintl';
//     return null;
// }

// // Check and create encounters if needed
// async function checkAndCreateEncounter(channelId) {
//     try {
//         const village = getVillageFromChannelId(channelId);
//         if (village) {
//             const needsEncounter = await needsMonthlyEncounter(channelId);
//             if (needsEncounter) {
//                 // Random chance to create a monthly encounter (e.g., 10% chance)
//                 const shouldCreateEncounter = Math.random() < 0.1;
//                 if (shouldCreateEncounter) {
//                     const monthlyEncounter = await createRandomMountEncounter(channelId, true);
//                     if (monthlyEncounter) {
//                         return monthlyEncounter;
//                     }
//                 }
//             }
//             return null; // Don't create random encounters in village channels
//         }
//         // For non-village channels, only check for random encounters
//         if (trackMessageActivity(channelId)) {
//             return await createRandomMountEncounter(channelId, false);
//         }
//         return null;
//     } catch (error) {
//         handleError(error, 'randomMountEncounterModule.js');
//         console.error('[randomMountEncounterModule]: Error checking for encounters:', error);
//         return null;
//     }
// }

// // ---- Function: checkExpiredEncounters ----
// // Checks for any random encounters that have expired during downtime
// async function checkExpiredEncounters(client) {
//   try {
//     const now = Date.now();
//     const encounters = await TempData.findAllByType('mount_encounter');

//     for (const encounter of encounters) {
//       const encounterTime = new Date(encounter.data.timestamp).getTime();
//       if (now - encounterTime > ENCOUNTER_COOLDOWN) {
//         // Delete expired encounter
//         await TempData.deleteById(encounter._id);
        
//         // Reset message count for the channel
//         const channelId = encounter.data.channelId;
//         messageActivityMap.set(channelId, 0);
//         lastEncounterMap.delete(channelId);
//       }
//     }

//     // Check monthly encounter tracking
//     const monthlyData = await TempData.findAllByType('monthly');
//     const currentMonth = new Date().getMonth();
//     const currentYear = new Date().getFullYear();

//     for (const data of monthlyData) {
//       const lastReset = new Date(data.data.lastReset);
//       if (lastReset.getMonth() !== currentMonth || lastReset.getFullYear() !== currentYear) {
//         // Reset monthly tracking
//         data.data = { lastReset: new Date() };
//         await data.save();
//       }
//     }

//     console.log(`[randomMountEncounterModule.js]: ✅ Checked ${encounters.length} random encounters`);
//   } catch (error) {
//     handleError(error, 'randomMountEncounterModule.js');
//     console.error('[randomMountEncounterModule.js]: ❌ Error checking expired encounters:', error.message);
//   }
// }

// module.exports = {
//     checkAndCreateEncounter,
//     trackMessageActivity,
//     needsMonthlyEncounter,
//     createRandomMountEncounter,
//     checkExpiredEncounters
// }; 