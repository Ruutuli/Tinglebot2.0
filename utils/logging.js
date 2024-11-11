// logging.js

const logMessage = (prefix, message) => {
    console.log(`${prefix} ${message}`);
};

const logSectionStart = (sectionName) => {
    console.log(`------------------🔹${sectionName}🔹------------------------`);
};

const logCommandStart = (userId) => {
    console.log(`🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻🔻`);
    console.log(`🟢 Loot command started by user: ${userId}`);
    console.log(`----------------------------------------------`);
};

const logCommandEnd = () => {
    console.log(`🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺🔺`);
};

const logMonstersFetched = (prefix, monsters, village, job) => {
    console.log(`${prefix} ✅ Fetched ${monsters.length} monsters for village ${village} and job ${job}`);
    console.log(`${prefix} 🔍 Monsters: ${monsters.map(monster => monster.name).join(', ')}`);
};

const logEncounterResult = (prefix, encounter, monsters) => {
    console.log(`${prefix} ✅ Encounter determined: ${encounter}`);
    if (monsters.length > 0) {
        console.log(`${prefix} ✅ Monster encounter: ${encounter}, Monsters: ${monsters.map(monster => monster.name).join(', ')}`);
    }
};

const logItemsFetched = (prefix, items) => {
    items.forEach(item => {
        console.log(`${prefix} 📦 Fetched item: ${item.itemName}`);
    });
};

const logFinalValueCalculation = (prefix, initialValue, adjustedValue) => {
    console.log(`${prefix} 🔄 Calculating Final Value (Damage Value: ${initialValue})`);
    console.log(`${prefix} 🔄 Applying buffs: Initial Value = ${initialValue}, Adjusted Value = ${adjustedValue}`);
    console.log(`${prefix} 🔄 Adjusted Random Value: ${adjustedValue}`);
};

const logAdjustedWeights = (prefix, adjustedWeights) => {
    console.log(`${prefix} Adjusted Weights:`, JSON.stringify(adjustedWeights, null, 2));
};

const logItemValidity = (prefix, item) => {
    console.log(`${prefix} Item: ${item.itemName}, Rarity: ${item.itemRarity}, Valid: true`);
};

const logWeightedItemListCreated = (prefix, listLength) => {
    console.log(`${prefix} ✅ Created weighted item list with ${listLength} entries.`);
};

const logEncounterOutcome = (prefix, outcome) => {
    console.log(`${prefix} ✅ Encounter outcome: ${outcome}`);
};

const logFinalOutcome = (prefix, message, heartsRemaining, lootedItem) => {
    console.log(`${prefix} ✅ Final Outcome Message: ${message}`);
    console.log(`${prefix} ❤️ Hearts Remaining: ${heartsRemaining}`);
    if (lootedItem) {
        console.log(`${prefix} 📝 Selected Loot Item: ${lootedItem.itemName}, Quantity: ${lootedItem.quantity}`);
    }
};

const logError = (prefix, error, userId) => {
    console.error(`${prefix} ❌ Error executing loot command: ${error.message} for user: ${userId}`);
};

const logDetailedCalculation = (prefix, damageValue, defenseBuff, attackBuff, adjustedRandomValue) => {
    console.log(`----------------------------------------------`);
    console.log(`${prefix} 🧮 Calculation Section`);
    console.log(`${prefix} Damage Value (DV): ${damageValue}`);
    console.log(`${prefix} Defense Buff (DEF): ${defenseBuff}`);
    console.log(`${prefix} Attack Buff (ATK): ${attackBuff}`);
    console.log(`${prefix} ${damageValue} DV + ${defenseBuff} DEF + ${attackBuff} ATK = ${adjustedRandomValue} FV`);
    console.log(`----------------------------------------------`);
};

const logLootSelectionProcess = (prefix, selectedItem, weightedItems) => {
    console.log(`${prefix} 🔄 Weighted item selection process:`);
    const itemCount = {};
    weightedItems.forEach(item => {
        itemCount[item.itemName] = (itemCount[item.itemName] || 0) + 1;
    });
    Object.entries(itemCount).forEach(([itemName, count]) => {
        const item = weightedItems.find(i => i.itemName === itemName);
        console.log(`${prefix} Item: ${itemName} || Weighted Quantity: ${count} || Rarity: ${item.itemRarity}`);
    });
    console.log(`${prefix} 📝 Selected Item: ${selectedItem.itemName}, Quantity: ${selectedItem.quantity}, Rarity: ${selectedItem.itemRarity}`);
};

module.exports = {
    logMessage,
    logSectionStart,
    logCommandStart,
    logCommandEnd,
    logMonstersFetched,
    logEncounterResult,
    logItemsFetched,
    logFinalValueCalculation,
    logAdjustedWeights,
    logItemValidity,
    logWeightedItemListCreated,
    logEncounterOutcome,
    logFinalOutcome,
    logError,
    logDetailedCalculation,
    logLootSelectionProcess
};
