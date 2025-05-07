const { v4: uuidv4 } = require('uuid');
const { getRandomMount, getRandomEnvironment, getMountRarity, getMountStamina } = require('./mountModule');
const { storeEncounter } = require('./mountModule');
const { handleError } = require('../utils/globalErrorHandler');

// Message activity tracking
const messageActivityMap = new Map(); // Map to store message activity per channel
const MESSAGE_THRESHOLD = 50; // Number of messages needed to trigger a random encounter
const ENCOUNTER_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const lastEncounterMap = new Map(); // Map to store last encounter time per channel

// Monthly encounter tracking
const monthlyEncounterMap = new Map(); // Map to store monthly encounters per channel
const MONTHLY_RESET_KEY = 'monthly_reset'; // Key for monthly reset check

// Initialize monthly tracking
function initializeMonthlyTracking() {
    const now = new Date();
    const lastReset = monthlyEncounterMap.get(MONTHLY_RESET_KEY) || new Date(0);
    
    // Check if we need to reset monthly encounters
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
        monthlyEncounterMap.clear();
        monthlyEncounterMap.set(MONTHLY_RESET_KEY, now);
    }
}

// Track message activity
function trackMessageActivity(channelId) {
    const currentCount = messageActivityMap.get(channelId) || 0;
    messageActivityMap.set(channelId, currentCount + 1);
    
    // Check if we should trigger a random encounter
    if (currentCount + 1 >= MESSAGE_THRESHOLD) {
        const lastEncounter = lastEncounterMap.get(channelId) || 0;
        const now = Date.now();
        
        // Check if enough time has passed since last encounter
        if (now - lastEncounter >= ENCOUNTER_COOLDOWN) {
            messageActivityMap.set(channelId, 0); // Reset message count
            lastEncounterMap.set(channelId, now);
            return true; // Signal to create an encounter
        }
    }
    return false;
}

// Check if channel needs monthly encounter
function needsMonthlyEncounter(channelId) {
    const now = new Date();
    const lastMonthlyEncounter = monthlyEncounterMap.get(channelId);
    
    if (!lastMonthlyEncounter) {
        return true;
    }
    
    // Check if last encounter was in a different month
    return lastMonthlyEncounter.getMonth() !== now.getMonth() || 
           lastMonthlyEncounter.getFullYear() !== now.getFullYear();
}

// Create a random mount encounter
function createRandomMountEncounter(channelId, isMonthly = false) {
    try {
        initializeMonthlyTracking();
        
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
            createdAt: new Date(),
            isMonthly: isMonthly
        };
        
        // Store the encounter
        storeEncounter(encounterId, encounter);
        
        // Update monthly encounter tracking if this was a monthly encounter
        if (isMonthly) {
            monthlyEncounterMap.set(channelId, new Date());
        }
        
        return encounter;
    } catch (error) {
        handleError(error, 'randomMountEncounterModule.js');
        console.error('[randomMountEncounterModule]: Error creating random mount encounter:', error);
        return null;
    }
}

// Check and create encounters if needed
function checkAndCreateEncounter(channelId) {
    try {
        // First check if we need a monthly encounter
        if (needsMonthlyEncounter(channelId)) {
            return createRandomMountEncounter(channelId, true);
        }
        
        // Then check message activity
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