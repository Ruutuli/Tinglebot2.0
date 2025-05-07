const { v4: uuidv4 } = require('uuid');
const { getRandomMount, getRandomEnvironment, getMountRarity, getMountStamina } = require('./mountModule');
const { storeEncounter } = require('./mountModule');
const { handleError } = require('../utils/globalErrorHandler');
const fs = require('fs');
const path = require('path');

// Message activity tracking
const messageActivityMap = new Map(); // Map to store message activity per channel
const MESSAGE_THRESHOLD = 50; // Number of messages needed to trigger a random encounter
const ENCOUNTER_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const lastEncounterMap = new Map(); // Map to store last encounter time per channel
const MESSAGE_COOLDOWN = 5 * 60 * 1000; // 5 minutes cooldown between message counts
const lastMessageTimeMap = new Map(); // Map to store last message time per channel

// Monthly encounter tracking
const MONTHLY_DATA_PATH = path.join(__dirname, '..', 'data', 'monthly_encounters.json');
const MONTHLY_RESET_KEY = 'monthly_reset'; // Key for monthly reset check

// Load monthly encounter data from file
function loadMonthlyEncounterData() {
    try {
        if (fs.existsSync(MONTHLY_DATA_PATH)) {
            const data = JSON.parse(fs.readFileSync(MONTHLY_DATA_PATH, 'utf8'));
            return new Map(Object.entries(data));
        }
    } catch (error) {
        console.error('[randomMountEncounterModule]: Error loading monthly encounter data:', error);
    }
    return new Map();
}

// Save monthly encounter data to file
function saveMonthlyEncounterData(monthlyEncounterMap) {
    try {
        const data = Object.fromEntries(monthlyEncounterMap);
        fs.writeFileSync(MONTHLY_DATA_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('[randomMountEncounterModule]: Error saving monthly encounter data:', error);
    }
}

// Initialize monthly tracking
function initializeMonthlyTracking() {
    const now = new Date();
    const monthlyEncounterMap = loadMonthlyEncounterData();
    const lastReset = monthlyEncounterMap.get(MONTHLY_RESET_KEY) ? new Date(monthlyEncounterMap.get(MONTHLY_RESET_KEY)) : new Date(0);
    
    // Check if we need to reset monthly encounters
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
        monthlyEncounterMap.clear();
        monthlyEncounterMap.set(MONTHLY_RESET_KEY, now.toISOString());
        saveMonthlyEncounterData(monthlyEncounterMap);
    }
    
    return monthlyEncounterMap;
}

// Track message activity
function trackMessageActivity(channelId) {
    const now = Date.now();
    const lastMessageTime = lastMessageTimeMap.get(channelId) || 0;
    const lastEncounter = lastEncounterMap.get(channelId) || 0;
    
    // Check if enough time has passed since last message
    if (now - lastMessageTime < MESSAGE_COOLDOWN) {
        return false;
    }
    
    // Check if enough time has passed since last encounter
    if (now - lastEncounter < ENCOUNTER_COOLDOWN) {
        return false;
    }
    
    const currentCount = messageActivityMap.get(channelId) || 0;
    messageActivityMap.set(channelId, currentCount + 1);
    lastMessageTimeMap.set(channelId, now);
    
    // Check if we should trigger a random encounter
    if (currentCount + 1 >= MESSAGE_THRESHOLD) {
        messageActivityMap.set(channelId, 0); // Reset message count
        lastEncounterMap.set(channelId, now);
        return true; // Signal to create an encounter
    }
    return false;
}

// Check if channel needs monthly encounter
function needsMonthlyEncounter(channelId) {
    const now = new Date();
    const village = getVillageFromChannelId(channelId);
    
    if (!village) {
        console.error('[randomMountEncounterModule]: Invalid channel ID for monthly encounter');
        return false;
    }
    
    const monthlyEncounterMap = loadMonthlyEncounterData();
    const villageKey = `village_${village.toLowerCase()}`;
    const lastMonthlyEncounter = monthlyEncounterMap.get(villageKey);
    
    if (!lastMonthlyEncounter) {
        return true;
    }
    
    // Check if last encounter was in a different month
    const lastEncounterDate = new Date(lastMonthlyEncounter);
    return lastEncounterDate.getMonth() !== now.getMonth() || 
           lastEncounterDate.getFullYear() !== now.getFullYear();
}

// Create a random mount encounter
function createRandomMountEncounter(channelId, isMonthly = false) {
    try {
        const monthlyEncounterMap = initializeMonthlyTracking();
        const now = new Date();
        
        // For monthly encounters, check if this village already had one this month
        if (isMonthly) {
            const village = getVillageFromChannelId(channelId);
            if (!village) {
                console.error('[randomMountEncounterModule]: Invalid channel ID for monthly encounter');
                return null;
            }
            
            // Check if this village already had a monthly encounter
            const villageKey = `village_${village.toLowerCase()}`;
            if (monthlyEncounterMap.has(villageKey)) {
                const lastEncounter = new Date(monthlyEncounterMap.get(villageKey));
                
                // Only allow if it's a different month
                if (lastEncounter.getMonth() === now.getMonth() && 
                    lastEncounter.getFullYear() === now.getFullYear()) {
                    return null; // Village already had its monthly encounter this month
                }
            }
            
            // Mark this village as having had its monthly encounter
            monthlyEncounterMap.set(villageKey, now.toISOString());
            saveMonthlyEncounterData(monthlyEncounterMap);
        }
        
        // Generate random mount data
        const randomMount = getRandomMount();
        const rarity = getMountRarity();
        const mountStamina = getMountStamina(randomMount.level, rarity.isRare);
        const environment = getRandomEnvironment(randomMount.village);
        
        const encounterId = uuidv4();
        const encounter = {
            id: encounterId,
            mountType: randomMount.mount,
            mountLevel: randomMount.level,
            village: randomMount.village,
            rarity: rarity.isRare ? 'Rare' : 'Regular',
            mountStamina: mountStamina,
            environment: environment,
            users: [],
            createdAt: now,
            isMonthly: isMonthly
        };
        
        // Store the encounter
        storeEncounter(encounterId, encounter);
        
        return encounter;
    } catch (error) {
        handleError(error, 'randomMountEncounterModule.js');
        console.error('[randomMountEncounterModule]: Error creating random mount encounter:', error);
        return null;
    }
}

// Helper function to get village from channel ID
function getVillageFromChannelId(channelId) {
    if (channelId === process.env.RUDANIA_TOWN_HALL) return 'Rudania';
    if (channelId === process.env.INARIKO_TOWN_HALL) return 'Inariko';
    if (channelId === process.env.VHINTL_TOWN_HALL) return 'Vhintl';
    return null;
}

// Check and create encounters if needed
function checkAndCreateEncounter(channelId) {
    try {
        const village = getVillageFromChannelId(channelId);
        
        // If this is a village channel, only check for monthly encounters
        if (village) {
            if (needsMonthlyEncounter(channelId)) {
                const monthlyEncounter = createRandomMountEncounter(channelId, true);
                if (monthlyEncounter) {
                    return monthlyEncounter;
                }
            }
            return null; // Don't create random encounters in village channels
        }
        
        // For non-village channels, only check for random encounters
        if (trackMessageActivity(channelId)) {
            return createRandomMountEncounter(channelId, false);
        }
        
        return null;
    } catch (error) {
        handleError(error, 'randomMountEncounterModule.js');
        console.error('[randomMountEncounterModule]: Error checking for encounters:', error);
        return null;
    }
}

module.exports = {
    checkAndCreateEncounter,
    trackMessageActivity,
    needsMonthlyEncounter,
    createRandomMountEncounter
}; 