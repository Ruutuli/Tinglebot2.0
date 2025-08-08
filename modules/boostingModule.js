// ============================================================================
// ------------------- Imports and Dependencies -------------------
// ============================================================================

const { fetchCharacterByName } = require("../database/db");
const Item = require("../models/ItemModel");
const generalCategories = require("../models/GeneralItemCategories");

// ============================================================================
// ------------------- Boost Effects Configuration -------------------
// ============================================================================

const boostingEffects = {
 "Fortune Teller": {
  Crafting: {
   name: "Foresight in Sales",
   description: "Items crafted while boosted by a Fortune Teller sell for 20% more tokens.",
  },
  Exploring: {
   name: "Premonition",
   description: "Reveals whether the next quadrant contains blight before exploring it.",
  },
  Gathering: {
   name: "Rarity Reversal",
   description: "While boosted, rare items have a significantly higher chance to be gathered.",
  },
  Healers: {
   name: "Predictive Healing",
   description: "The next healing action costs 50% less stamina, as the Fortune Teller foresaw the need.",
  },
  Looting: {
   name: "Fated Reroll",
   description: "If you take damage during looting, the system rerolls once for a potentially better outcome.",
  },
  Mounts: {
   name: "Rare Alignment",
   description: "The next time a mount appears, there is a +30% higher chance it will be a Rare Mount.",
  },
  Stealing: {
   name: "Predicted Opportunity",
   description: "Increases steal success rate by +20%, capped at 100%.",
  },
  Tokens: {
   name: "Fortunate Exchange",
   description: "Boosted by a Fortune Teller, you earn 10% more tokens when selling to shops.",
  },
  Traveling: {
   name: "Foresight Detour",
   description: "Predicts dangerous weather and avoids it, allowing travel when others would be blocked.",
  },
  Vending: {
   name: "Reserved Fortune",
   description: "Vendor may purchase one sold-out special item as if it was reserved for them by fate.",
  },
  Other: {
   name: "Weather Prediction",
   description: "Can use the command /boost other to predict the weather for the next day in one village.",
  },
 },

 Teacher: {
  Crafting: {
   name: "Crafting Duplication",
   description: "When boosted by a Teacher, successfully crafted items are created in double.",
  },
  Exploring: {
   name: "Study in Multiples",
   description: "Double the amount of any item found during exploration, if it's a non-combat result.",
  },
  Gathering: {
   name: "Practical Wisdom",
   description: "You always gather something useful for crafting or daily life — never junk.",
  },
  Healers: {
   name: "Temporary Fortitude",
   description: "Boosted by a Teacher, the next patient gains +2 temporary hearts that persist until they are next damaged.",
  },
  Looting: {
   name: "Combat Insight",
   description: "Add a flat +2 to your loot encounter roll to reflect knowledge of weak points.",
  },
  Mounts: {
   name: "Weather Wisdom",
   description: "While boosted by a Teacher, your mount can travel safely through dangerous weather that would block others.",
  },
  Stealing: {
   name: "Tactical Risk",
   description: "Boosted players are allowed one extra failed attempt before jail time is triggered.",
  },
  Tokens: {
   name: "Critique & Composition",
   description: "Visual works submitted while boosted earn 1.5x their token value.",
  },
  Traveling: {
   name: "Field Lesson",
   description: "Roll twice on road gathers and choose the better result.",
  },
  Vending: {
   name: "Efficient Haggling",
   description: "Vendor pays 20% fewer vending points during one restock.",
  },
 },

 Priest: {
  Crafting: {
   name: "Spiritual Efficiency",
   description: "Crafting while boosted by a Priest costs 20% less stamina.",
  },
  Exploring: {
   name: "Divine Protection",
   description: "Skip one blight exposure check during your next exploration attempt if blight is present.",
  },
  Gathering: {
   name: "Divine Favor",
   description: "Gathering while boosted by a Priest increases the chance of finding divine or spiritually attuned items.",
  },
  Healers: {
   name: "Spiritual Cleanse",
   description: "When boosted by a Priest, any active debuffs on the patient are removed during healing.",
  },
  Looting: {
   name: "Divine Test",
   description: "Ask for protection or challenge; a +5 or -5 modifier is randomly applied to your loot roll.",
  },
  Mounts: {
   name: "Blessed Attempt",
   description: "Your first failed mount attempt is automatically rerolled without costing stamina.",
  },
  Stealing: {
   name: "Merciful Sentence",
   description: "While boosted by a Priest, jail time is cut in half if caught.",
  },
  Tokens: {
   name: "Blessed Economy",
   description: "While boosted, you earn 10% more when selling to shops and pay 10% less when buying.",
  },
  Traveling: {
   name: "Restful Blessing",
   description: "When recovering during travel, gain +2 extra hearts.",
  },
  Vending: {
   name: "Blessed Restock",
   description: "When a vendor is boosted by a Priest, they receive a divine favor: +20 bonus points when collecting vending points this month.",
  },
 },

 Entertainer: {
  Crafting: {
   name: "Song of Double Time",
   description: "Boosted by an Entertainer, you can craft one extra job-voucher item.",
  },
  Exploring: {
   name: "Song of Soaring",
   description: "After exploring, instantly return to your current village's plaza via magical performance.",
  },
  Gathering: {
   name: "Minuet of Forest",
   description: "Gather one bonus item from a curated list of beautiful or performance-themed items, if available.",
  },
  Healers: {
   name: "Song of Healing",
   description: "Emotional and musical healing grants +1 bonus heart recovered when revived from 0 HP.",
  },
  Looting: {
   name: "Requiem of Spirit",
   description: "Monsters are dazzled by flair. Reduce any damage taken from an encounter by 1 heart (min 0).",
  },
  Mounts: {
   name: "Epona's Song",
   description: "You're more likely to tame a mount that fits the local region's style, folklore, or wildlife.",
  },
  Stealing: {
   name: "Elegy of Emptiness",
   description: "If the steal is successful, you're more likely to get a rare item.",
  },
  Tokens: {
   name: "Ballad of the Goddess",
   description: "When an Entertainer is present in a tracked RP or quest, all participants receive a bonus token reward.",
  },
  Traveling: {
   name: "Bolero of Fire",
   description: "If ambushed during travel, roll two escape attempts and take the better one.",
  },
  Vending: {
   name: "Song of Time",
   description: "Vendor may collect points at any point during the month.",
  },
  Other: {
   name: "Song of Storms",
   description: "Guaranteed Special Weather in one of the 3 villages the following day",
  },
 },

 Scholar: {
  Crafting: {
   name: "Resource Optimization",
   description: "When boosted by a Scholar, crafting consumes 20% fewer materials.",
  },
  Exploring: {
   name: "Historical Discovery",
   description: "25% chance to uncover a lore-related reward (e.g., ruins, tomes, or lore-tagged items) instead of a normal event.",
  },
  Gathering: {
   name: "Cross-Region Insight",
   description: "Gather from another village's item table without leaving your current location.",
  },
  Healers: {
   name: "Efficient Recovery",
   description: "Boosted by a Scholar, both the healer and recipient recover 1 stamina after the healing is complete.",
  },
  Looting: {
   name: "Double Haul",
   description: "If you win the encounter, collect 2x the normal loot quantity.",
  },
  Mounts: {
   name: "Tactical Recommendation",
   description: "When boosted by a Scholar, the mount embed highlights the recommended action based on the current environment.",
  },
  Stealing: {
   name: "Calculated Grab",
   description: "Gain +1 extra item if the steal is successful.",
  },
  Tokens: {
   name: "Research Stipend",
   description: "Written works submitted while boosted earn 1.5x their token value.",
  },
  Traveling: {
   name: "Travel Guide",
   description: "Gain one extra road gather result during the journey thanks to Scholar's guidance.",
  },
  Vending: {
   name: "Demand Forecast",
   description: "When boosted, the vendor receives a recommendation for 1 item that is rare across all player inventories — ideal for stocking.",
  },
 },
};

// ============================================================================
// ------------------- Constants and Configuration -------------------
// ============================================================================

const BOOST_MULTIPLIERS = {
 FORTUNE_TELLER_CRAFTING: 1.2,
 FORTUNE_TELLER_TOKENS: 1.1,
 FORTUNE_TELLER_HEALING: 0.5,
 FORTUNE_TELLER_MOUNT_BONUS: 30,
 FORTUNE_TELLER_STEAL_BONUS: 20,
 TEACHER_TOKENS: 1.5,
 TEACHER_VENDING: 0.8,
 TEACHER_LOOT_BONUS: 2,
 TEACHER_STEAL_ATTEMPTS: 1,
 PRIEST_CRAFTING: 0.8,
 PRIEST_TOKENS_SELL: 1.1,
 PRIEST_TOKENS_BUY: 0.9,
 PRIEST_JAIL_TIME: 0.5,
 PRIEST_TRAVEL_HEALING: 2,
 PRIEST_VENDING_BONUS: 20,
 SCHOLAR_CRAFTING: 0.8,
 SCHOLAR_TOKENS: 1.5,
 SCHOLAR_TRAVEL_BONUS: 1,
};

const SPECIAL_WEATHER_TYPES = [
 "Avalanche",
 "Blight Rain", 
 "Drought",
 "Fairy Circle",
 "Flood",
 "Flower Bloom",
 "Jubilee",
 "Meteor Shower",
 "Muggy",
 "Rock Slide",
];

const VILLAGES = ["Village A", "Village B", "Village C"];



// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

// Normalizes job name to match boostingEffects keys
function normalizeJobName(job) {
 return job
  .split(" ")
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
  .join(" ");
}

// Applies percentage-based boost with optional minimum/maximum bounds
function applyPercentageBoost(value, multiplier, minValue = 0, maxValue = null) {
 const result = Math.floor(value * multiplier);
 if (maxValue !== null) {
  return Math.min(result, maxValue);
 }
 return Math.max(result, minValue);
}

// Applies flat bonus with optional maximum bound
function applyFlatBonus(value, bonus, maxValue = null) {
 const result = value + bonus;
 if (maxValue !== null) {
  return Math.min(result, maxValue);
 }
 return result;
}

// Handles async database operations with error logging
async function safeDatabaseOperation(operation, errorMessage) {
 try {
  return await operation();
 } catch (error) {
  console.error(`[boostingModule.js] ${errorMessage}:`, error);
  return null;
 }
}

// Creates enhanced item table with weighted items
function createEnhancedItemTable(baseTable, itemsToAdd, weight = 2, rarity = 3) {
 const enhancedTable = [...baseTable];
 
 itemsToAdd.forEach((materialName) => {
  const exists = enhancedTable.some((item) => item.itemName === materialName);
  if (!exists) {
   enhancedTable.push({
    itemName: materialName,
    itemRarity: rarity,
    weight: weight,
    type: ["Material"],
    image: "No Image",
    emoji: "📦",
   });
  }
 });
 
 return enhancedTable;
}

// Processes divine items for Priest gathering boost
async function processDivineItems(baseTable) {
 const divineItems = await safeDatabaseOperation(
  () => Item.find({ divineItems: true }),
  "Error fetching divine items"
 );

 if (!divineItems || divineItems.length === 0) {
  return baseTable;
 }

 const combinedTable = [...baseTable];

 divineItems.forEach((divineItem) => {
  const existingIndex = combinedTable.findIndex(
   (item) => item.itemName === divineItem.itemName
  );

  if (existingIndex >= 0) {
   combinedTable[existingIndex].weight = (combinedTable[existingIndex].weight || 1) * 3;
   combinedTable[existingIndex].divineItems = true;
  } else {
   combinedTable.push({
    itemName: divineItem.itemName,
    itemRarity: divineItem.itemRarity || 5,
    weight: 3,
    type: divineItem.type || ["Natural"],
    image: divineItem.image,
    emoji: divineItem.emoji,
    divineItems: true,
   });
  }
 });

 return combinedTable;
}

// Processes entertainer items for Entertainer gathering boost
async function processEntertainerItems() {
 return await safeDatabaseOperation(
  () => Item.find({ entertainerItems: true }),
  "Error fetching entertainer items"
 ) || [];
}

// Analyzes inventory data for rare items
function analyzeRareItems(allInventories) {
 const itemCounts = {};
 allInventories.forEach((inventory) => {
  inventory.items.forEach((item) => {
   itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
  });
 });

 const rareItems = Object.entries(itemCounts)
  .filter(([, count]) => count <= 5)
  .sort(([, a], [, b]) => a - b);

 if (rareItems.length > 0) {
  return rareItems[0][0];
 }

 const sortedItems = Object.entries(itemCounts).sort(([, a], [, b]) => a - b);
 return sortedItems.length > 0 ? sortedItems[0][0] : null;
}

// ============================================================================
// ------------------- Fortune Teller Boost Functions -------------------
// ============================================================================

function applyFortuneTellerCraftingBoost(basePrice) {
 return applyPercentageBoost(basePrice, BOOST_MULTIPLIERS.FORTUNE_TELLER_CRAFTING);
}

function applyFortuneTellerExploringBoost(quadrantData) {
 if (quadrantData && quadrantData.hasBlight !== undefined) {
  return {
   ...quadrantData,
   blightRevealed: true,
   message: "🔮 Premonition reveals: This quadrant contains blight!",
  };
 }
 return quadrantData;
}

function applyFortuneTellerHealingBoost(baseStaminaCost) {
 return Math.ceil(baseStaminaCost * BOOST_MULTIPLIERS.FORTUNE_TELLER_HEALING);
}

function applyFortuneTellerMountsBoost(baseMountChance) {
 return applyFlatBonus(baseMountChance, BOOST_MULTIPLIERS.FORTUNE_TELLER_MOUNT_BONUS, 100);
}

function applyFortuneTellerStealingBoost(baseChance) {
 return applyFlatBonus(baseChance, BOOST_MULTIPLIERS.FORTUNE_TELLER_STEAL_BONUS, 100);
}

function applyFortuneTellerTokensBoost(baseTokens) {
 return applyPercentageBoost(baseTokens, BOOST_MULTIPLIERS.FORTUNE_TELLER_TOKENS);
}

function applyFortuneTellerTravelingBoost(weatherBlock) {
 return false;
}

function applyFortuneTellerVendingBoost(itemStock) {
 return { ...itemStock, canBypassSoldOut: true, bypassCount: 1 };
}

function applyFortuneTellerOtherBoost(villageWeatherData) {
 if (!villageWeatherData.nextDayWeather) {
  const weatherTypes = ["sunny", "rainy", "stormy", "foggy", "clear"];
  villageWeatherData.nextDayWeather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
  villageWeatherData.weatherPredicted = true;
 }
 return villageWeatherData;
}

function applyFortuneTellerGatheringBoost(gatherTable) {
 const validItems = gatherTable.filter((item) => item.itemRarity && item.itemRarity >= 3);

 if (validItems.length === 0) {
  return gatherTable;
 }

 const maxRarity = Math.max(...validItems.map((item) => item.itemRarity));
 const boostedTable = [];
 const rarityGroups = {};

 validItems.forEach((item) => {
  const rarity = item.itemRarity;
  if (!rarityGroups[rarity]) {
   rarityGroups[rarity] = [];
  }
  rarityGroups[rarity].push(item);
 });

 Object.keys(rarityGroups)
  .sort((a, b) => b - a)
  .forEach((rarity) => {
   const items = rarityGroups[rarity];
   const rarityNum = parseInt(rarity);

   let weight;
   if (maxRarity >= 8) {
    if (rarityNum >= 8) {
     weight = 10;
    } else if (rarityNum >= 5) {
     weight = 3;
    } else {
     weight = 1;
    }
   } else if (maxRarity >= 5) {
    if (rarityNum >= 5) {
     weight = 8;
    } else {
     weight = 2;
    }
   } else {
    weight = rarityNum === maxRarity ? 5 : 1;
   }

   items.forEach((item) => {
    for (let i = 0; i < weight; i++) {
     boostedTable.push(item);
    }
   });
  });

 return boostedTable;
}

// ============================================================================
// ------------------- Teacher Boost Functions -------------------
// ============================================================================

function applyTeacherCraftingBoost(craftedItem) {
 if (craftedItem && craftedItem.quantity) {
  craftedItem.quantity += 1;
 }
 return craftedItem;
}

function applyTeacherExploringBoost(exploredItem) {
 if (exploredItem && exploredItem.quantity && !exploredItem.isCombat) {
  exploredItem.quantity += 1;
 }
 return exploredItem;
}

function applyTeacherMountsBoost(weatherConditions) {
 return { ...weatherConditions, canTravel: true, weatherOverridden: true };
}

function applyTeacherGatheringBoost(gatherTable) {
 // Top materials that should always be available when Teacher is boosting
 const topMaterials = [
   'Leather', 'Eldin Ore', 'Wood', 'Rock Salt', 'Goat Butter', 'Cotton', 
   'Hylian Rice', 'Iron bar', 'Tabantha Wheat', 'Wool', 'Fresh Milk', 
   'Goron Ore', 'Luminous Stone', 'Bird Egg', 'Goron Spice', 'Chuchu Jelly', 
   'Gold Dust'
 ];
 
 // General categories that should be expanded
 const generalCategoryItems = {
   'Any Plant': generalCategories['Any Plant'] || [],
   'Any Seafood': generalCategories['Any Seafood'] || [],
   'Any Mushroom': generalCategories['Any Mushroom'] || []
 };
 
 // Create a new table that includes the original items plus guaranteed top materials
 const enhancedTable = [...gatherTable];
 
 // Add top materials if they're not already in the table
 topMaterials.forEach(materialName => {
   const exists = enhancedTable.some(item => item.itemName === materialName);
   if (!exists) {
     enhancedTable.push({
       itemName: materialName,
       itemRarity: 3, // Default rarity for materials
       weight: 2, // Give them higher weight
       type: ['Material'],
       image: 'No Image',
       emoji: '📦'
     });
   }
 });
 
 // Add general category items if they're not already in the table
 Object.entries(generalCategoryItems).forEach(([categoryName, items]) => {
   items.forEach(itemName => {
     const exists = enhancedTable.some(item => item.itemName === itemName);
     if (!exists) {
       enhancedTable.push({
         itemName: itemName,
         itemRarity: 3, // Default rarity for materials
         weight: 1.5, // Slightly higher weight
         type: ['Material'],
         image: 'No Image',
         emoji: '📦'
       });
     }
   });
 });
 
 return enhancedTable;
}

function applyTeacherHealingBoost(healedCharacter) {
 if (healedCharacter.tempHearts === undefined) {
  healedCharacter.tempHearts = 0;
 }
 healedCharacter.tempHearts += 2;
 return healedCharacter;
}

function applyTeacherLootingBoost(adjustedRoll) {
 return applyFlatBonus(adjustedRoll, BOOST_MULTIPLIERS.TEACHER_LOOT_BONUS, 100);
}

function applyTeacherStealingBoost(failedAttempts) {
 return failedAttempts + BOOST_MULTIPLIERS.TEACHER_STEAL_ATTEMPTS;
}

function applyTeacherTokensBoost(baseTokens) {
 return applyPercentageBoost(baseTokens, BOOST_MULTIPLIERS.TEACHER_TOKENS);
}

function applyTeacherTravelingBoost(roadGathers) {
 if (roadGathers && roadGathers.length >= 2) {
  const firstRoll = roadGathers[0];
  const secondRoll = roadGathers[1];

  const firstRarity = firstRoll.rarity || firstRoll.itemRarity || 0;
  const secondRarity = secondRoll.rarity || secondRoll.itemRarity || 0;

  return firstRarity > secondRarity ? firstRoll : secondRoll;
 }
 return roadGathers;
}

function applyTeacherVendingBoost(baseCost) {
 return Math.ceil(baseCost * BOOST_MULTIPLIERS.TEACHER_VENDING);
}

// ============================================================================
// ------------------- Priest Boost Functions -------------------
// ============================================================================

function applyPriestCraftingBoost(baseStaminaCost) {
 return Math.ceil(baseStaminaCost * BOOST_MULTIPLIERS.PRIEST_CRAFTING);
}

function applyPriestExploringBoost(blightExposure) {
 return false;
}

function applyPriestMountsBoost(mountAttempt) {
 return { ...mountAttempt, hasReroll: true, rerollUsed: false };
}

async function applyPriestGatheringBoost(gatherTable) {
 return await processDivineItems(gatherTable);
}

function applyPriestHealingBoost(patient) {
 if (patient.debuff && patient.debuff.active) {
  patient.debuff.active = false;
  patient.debuff.endDate = null;
 }
 return patient;
}

function applyPriestLootingBoost(adjustedRoll) {
 const modifier = Math.random() < 0.5 ? 5 : -5;
 return Math.max(0, Math.min(100, adjustedRoll + modifier));
}

function applyPriestStealingBoost(jailTime) {
 return Math.ceil(jailTime * BOOST_MULTIPLIERS.PRIEST_JAIL_TIME);
}

function applyPriestTokensBoost(baseTokens, isBuying = false) {
 if (isBuying) {
  return Math.ceil(baseTokens * BOOST_MULTIPLIERS.PRIEST_TOKENS_BUY);
 } else {
  return Math.floor(baseTokens * BOOST_MULTIPLIERS.PRIEST_TOKENS_SELL);
 }
}

function applyPriestTravelingBoost(baseHealing) {
 return baseHealing + BOOST_MULTIPLIERS.PRIEST_TRAVEL_HEALING;
}

function applyPriestVendingBoost(basePoints) {
 return basePoints + BOOST_MULTIPLIERS.PRIEST_VENDING_BONUS;
}

// ============================================================================
// ------------------- Entertainer Boost Functions -------------------
// ============================================================================

function applyEntertainerCraftingBoost(voucherCraftCount) {
 return voucherCraftCount + 1;
}

function applyEntertainerExploringBoost(explorationResult) {
 return {
  ...explorationResult,
  fastTravelAvailable: true,
  returnLocation: "village_plaza",
  message: "🎵 Song of Soaring activated! You can instantly return to the village plaza.",
 };
}

function applyEntertainerStealingBoost(stealResult) {
 if (stealResult.success && stealResult.lootTable) {
  const boostedTable = stealResult.lootTable.map((item) => {
   if (item.tier >= 3) {
    return { ...item, weight: (item.weight || 1) * 2 };
   }
   return item;
  });
  return { ...stealResult, lootTable: boostedTable };
 }
 return stealResult;
}

function applyEntertainerMountsBoost(regionMounts) {
 return regionMounts.map((mount) => ({
  ...mount,
  weight: mount.weight * 1.3,
 }));
}

async function applyEntertainerGatheringBoost(regionItems) {
 return await processEntertainerItems();
}

function applyEntertainerHealingBoost(baseHealing, wasKO) {
 return wasKO ? baseHealing + 1 : baseHealing;
}

function applyEntertainerLootingBoost(damageTaken) {
 return Math.max(0, damageTaken - 1);
}

function applyEntertainerTokensBoost(participants) {
 return participants.map((participant) => ({
  ...participant,
  tokens: (participant.tokens || 0) + 20,
 }));
}

function applyEntertainerTravelingBoost(escapeRolls) {
 if (escapeRolls && escapeRolls.length >= 2) {
  return Math.max(escapeRolls[0], escapeRolls[1]);
 }
 return escapeRolls;
}

function applyEntertainerVendingBoost(collectionTime) {
 return true;
}

function applyEntertainerOtherBoost(villageData) {
 const selectedVillage = VILLAGES[Math.floor(Math.random() * VILLAGES.length)];
 const specialWeather = SPECIAL_WEATHER_TYPES[Math.floor(Math.random() * SPECIAL_WEATHER_TYPES.length)];

 return {
  ...villageData,
  guaranteedWeather: {
   village: selectedVillage,
   weather: specialWeather,
   active: true,
  },
 };
}

// ============================================================================
// ------------------- Scholar Boost Functions -------------------
// ============================================================================

function applyScholarCraftingBoost(materialCosts) {
 return materialCosts.map((material) => ({
  ...material,
  quantity: Math.ceil(material.quantity * BOOST_MULTIPLIERS.SCHOLAR_CRAFTING),
 }));
}

function applyScholarExploringBoost(exploreResult) {
 if (Math.random() < 0.25) {
  return {
   type: "lore",
   description: "Historical discovery found!",
   loreItem: true,
   bonusReward: true,
  };
 }
 return exploreResult;
}

function applyScholarMountsBoost(environment) {
 const recommendations = {
  'Tall Grass': 'Sneak',
  'Forest': 'Distract',
  'Mountain': 'Approach',
  'Water': 'Wait',
  'Cave': 'Sneak'
 };
 return recommendations[environment] || 'Approach';
}

function applyScholarGatheringBoost(gatheringData, targetRegion) {
 return gatheringData;
}

function applyScholarHealingBoost(healingData) {
 const { healer, recipient } = healingData;

 if (healer && healer.stamina < healer.maxStamina) {
  healer.stamina = Math.min(healer.stamina + 1, healer.maxStamina);
 }
 if (recipient && recipient.stamina < recipient.maxStamina) {
  recipient.stamina = Math.min(recipient.stamina + 1, recipient.maxStamina);
 }
 return { healer, recipient };
}

function applyScholarLootingBoost(lootedItem) {
 if (lootedItem && lootedItem.quantity) {
  lootedItem.quantity *= 2;
 }
 return lootedItem;
}

function applyScholarStealingBoost(stolenItem) {
 if (stolenItem && stolenItem.quantity) {
  stolenItem.quantity += 1;
 }
 return stolenItem;
}

function applyScholarTokensBoost(baseTokens) {
 return applyPercentageBoost(baseTokens, BOOST_MULTIPLIERS.SCHOLAR_TOKENS);
}

function applyScholarTravelingBoost(roadGathers) {
 return roadGathers + BOOST_MULTIPLIERS.SCHOLAR_TRAVEL_BONUS;
}

function applyScholarVendingBoost(allInventories) {
 return analyzeRareItems(allInventories);
}

// ============================================================================
// ------------------- Core Boost Functions -------------------
// ============================================================================

function getBoostEffect(job, category) {
 const normalizedJob = normalizeJobName(job);
 const jobBoosts = boostingEffects[normalizedJob];
 if (!jobBoosts) return null;
 const boost = jobBoosts[category];
 return boost || null;
}

async function getBoostEffectByCharacter(characterName, category) {
 const character = await safeDatabaseOperation(
  () => fetchCharacterByName(characterName),
  `Error getting boost effect for character "${characterName}"`
 );

 if (!character) {
  console.error(`[boostingModule.js]: Error - Could not find character "${characterName}"`);
  return null;
 }

 return getBoostEffect(character.job, category);
}

async function applyBoostEffect(job, category, data, additionalData = null) {
 let actualJob = job;
 if (job && !boostingEffects[job]) {
  const character = await safeDatabaseOperation(
   () => fetchCharacterByName(job),
   `Error fetching character for job "${job}"`
  );
  if (character && character.job) {
   actualJob = character.job;
  }
 }

 const normalizedJob = normalizeJobName(actualJob);

 // Fortune Teller boosts
 if (normalizedJob === "Fortune Teller") {
  switch (category) {
   case "Crafting": return applyFortuneTellerCraftingBoost(data);
   case "Exploring": return applyFortuneTellerExploringBoost(data);
   case "Gathering": return applyFortuneTellerGatheringBoost(data);
   case "Healers": return applyFortuneTellerHealingBoost(data);
   case "Looting": return data;
   case "Mounts": return applyFortuneTellerMountsBoost(data);
   case "Stealing": return applyFortuneTellerStealingBoost(data);
   case "Tokens": return applyFortuneTellerTokensBoost(data);
   case "Traveling": return applyFortuneTellerTravelingBoost(data);
   case "Vending": return applyFortuneTellerVendingBoost(data);
   case "Other": return applyFortuneTellerOtherBoost(data);
   default: return data;
  }
 }

 // Teacher boosts
 if (normalizedJob === "Teacher") {
  switch (category) {
   case "Crafting": return applyTeacherCraftingBoost(data);
   case "Exploring": return applyTeacherExploringBoost(data);
   case "Gathering": return applyTeacherGatheringBoost(data);
   case "Healers": return applyTeacherHealingBoost(data);
   case "Looting": return applyTeacherLootingBoost(data);
   case "Mounts": return applyTeacherMountsBoost(data);
   case "Stealing": return applyTeacherStealingBoost(data);
   case "Tokens": return applyTeacherTokensBoost(data);
   case "Traveling": return applyTeacherTravelingBoost(data);
   case "Vending": return applyTeacherVendingBoost(data);
   default: return data;
  }
 }

 // Priest boosts
 if (normalizedJob === "Priest") {
  switch (category) {
   case "Crafting": return applyPriestCraftingBoost(data);
   case "Exploring": return applyPriestExploringBoost(data);
   case "Gathering": return await applyPriestGatheringBoost(data);
   case "Healers": return applyPriestHealingBoost(data);
   case "Looting": return applyPriestLootingBoost(data);
   case "Mounts": return applyPriestMountsBoost(data);
   case "Stealing": return applyPriestStealingBoost(data);
   case "Tokens": return applyPriestTokensBoost(data, additionalData);
   case "Traveling": return applyPriestTravelingBoost(data);
   case "Vending": return applyPriestVendingBoost(data);
   default: return data;
  }
 }

 // Entertainer boosts
 if (normalizedJob === "Entertainer") {
  switch (category) {
   case "Crafting": return applyEntertainerCraftingBoost(data);
   case "Exploring": return applyEntertainerExploringBoost(data);
   case "Gathering": return await applyEntertainerGatheringBoost(data);
   case "Healers": return applyEntertainerHealingBoost(data, additionalData);
   case "Looting": return applyEntertainerLootingBoost(data);
   case "Mounts": return applyEntertainerMountsBoost(data);
   case "Stealing": return applyEntertainerStealingBoost(data);
   case "Tokens": return applyEntertainerTokensBoost(data);
   case "Traveling": return applyEntertainerTravelingBoost(data);
   case "Vending": return applyEntertainerVendingBoost(data);
   case "Other": return applyEntertainerOtherBoost(data);
   default: return data;
  }
 }

 // Scholar boosts
 if (normalizedJob === "Scholar") {
  switch (category) {
   case "Crafting": return applyScholarCraftingBoost(data);
   case "Exploring": return applyScholarExploringBoost(data);
   case "Gathering": return applyScholarGatheringBoost(data, additionalData);
   case "Healers": return applyScholarHealingBoost(data);
   case "Looting": return applyScholarLootingBoost(data);
   case "Mounts": return applyScholarMountsBoost(data);
   case "Stealing": return applyScholarStealingBoost(data);
   case "Tokens": return applyScholarTokensBoost(data);
   case "Traveling": return applyScholarTravelingBoost(data);
   case "Vending": return applyScholarVendingBoost(data);
   default: return data;
  }
 }

 return data;
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
 getBoostEffect,
 getBoostEffectByCharacter,
 applyBoostEffect,
 boostingEffects,
 applyFortuneTellerCraftingBoost,
 applyFortuneTellerExploringBoost,
 applyFortuneTellerGatheringBoost,
 applyFortuneTellerHealingBoost,
 applyFortuneTellerMountsBoost,
 applyFortuneTellerStealingBoost,
 applyFortuneTellerTokensBoost,
 applyFortuneTellerTravelingBoost,
 applyFortuneTellerVendingBoost,
 applyFortuneTellerOtherBoost,
 applyTeacherCraftingBoost,
 applyTeacherExploringBoost,
 applyTeacherGatheringBoost,
 applyTeacherHealingBoost,
 applyTeacherLootingBoost,
 applyTeacherMountsBoost,
 applyTeacherStealingBoost,
 applyTeacherTokensBoost,
 applyTeacherTravelingBoost,
 applyTeacherVendingBoost,
 applyPriestCraftingBoost,
 applyPriestExploringBoost,
 applyPriestGatheringBoost,
 applyPriestHealingBoost,
 applyPriestLootingBoost,
 applyPriestMountsBoost,
 applyPriestStealingBoost,
 applyPriestTokensBoost,
 applyPriestTravelingBoost,
 applyPriestVendingBoost,
 applyEntertainerCraftingBoost,
 applyEntertainerExploringBoost,
 applyEntertainerGatheringBoost,
 applyEntertainerHealingBoost,
 applyEntertainerLootingBoost,
 applyEntertainerMountsBoost,
 applyEntertainerStealingBoost,
 applyEntertainerTokensBoost,
 applyEntertainerTravelingBoost,
 applyEntertainerVendingBoost,
 applyEntertainerOtherBoost,
 applyScholarCraftingBoost,
 applyScholarExploringBoost,
 applyScholarGatheringBoost,
 applyScholarHealingBoost,
 applyScholarLootingBoost,
 applyScholarMountsBoost,
 applyScholarStealingBoost,
 applyScholarTokensBoost,
 applyScholarTravelingBoost,
 applyScholarVendingBoost,
};