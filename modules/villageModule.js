// ------------------- Village Module -------------------

// Placeholder for an in-memory storage of villages
const villages = {};

// ------------------- Function to Initialize a Village -------------------
function initializeVillage(villageName) {
    console.log(`[VILLAGE] Initializing village: ${villageName}`);
    if (!villages[villageName]) {
        villages[villageName] = {
            health: 100, // Default health value
            resources: 50, // Default resources value
        };
        console.log(`[VILLAGE] Village "${villageName}" initialized.`);
    } else {
        console.log(`[VILLAGE] Village "${villageName}" already exists.`);
    }
    return villages[villageName];
}

// ------------------- Function to Update Village Health -------------------
async function updateVillageHealth(villageName, healthChange) {
    console.log(`[VILLAGE] Updating health for village: ${villageName}, Change: ${healthChange}`);
    if (!villages[villageName]) {
        console.warn(`[VILLAGE] Village "${villageName}" does not exist. Initializing it now.`);
        initializeVillage(villageName);
    }
    villages[villageName].health = Math.max(villages[villageName].health + healthChange, 0); // Ensure health doesn't drop below 0
    console.log(`[VILLAGE] Village "${villageName}" health updated to ${villages[villageName].health}.`);
    return villages[villageName].health;
}

// ------------------- Function to Get Village Information -------------------
async function getVillageInfo(villageName) {
    console.log(`[VILLAGE] Retrieving information for village: ${villageName}`);
    if (!villages[villageName]) {
        console.warn(`[VILLAGE] Village "${villageName}" does not exist. Initializing it now.`);
        initializeVillage(villageName);
    }
    return villages[villageName];
}


// Function to calculate and update the level of a village
function calculateVillageLevel(villageName) {
    if (!villages[villageName]) {
        console.warn(`[VILLAGE] Village "${villageName}" does not exist. Initializing it now.`);
        initializeVillage(villageName);
    }

    const village = villages[villageName];
    const level = Math.floor((village.health + village.resources) / 50); // Example formula
    village.level = Math.max(level, 1); // Minimum level is 1
    console.log(`[VILLAGE] Village "${villageName}" level updated to ${village.level}.`);
    return village.level;
}


// Function to update village resources
async function updateVillageResources(villageName, resourceChange) {
    console.log(`[VILLAGE] Updating resources for village: ${villageName}, Change: ${resourceChange}`);
    if (!villages[villageName]) {
        console.warn(`[VILLAGE] Village "${villageName}" does not exist. Initializing it now.`);
        initializeVillage(villageName);
    }
    villages[villageName].resources = Math.max(villages[villageName].resources + resourceChange, 0); // Ensure resources don't drop below 0
    console.log(`[VILLAGE] Village "${villageName}" resources updated to ${villages[villageName].resources}.`);
    return villages[villageName].resources;
}


// ------------------- Exported Functions -------------------
module.exports = {
    initializeVillage,
    updateVillageHealth,
    getVillageInfo,
};
