// ============================================================================
// ------------------- Imports and Dependencies -------------------
// ============================================================================
 
const { fetchCharacterByName } = require('@/database/db');
const Item = require('@/models/ItemModel');
const generalCategories = require('@/models/GeneralItemCategories');
const logger = require('@/utils/logger');

// ============================================================================
// ------------------- Boost Effects Configuration -------------------
// ============================================================================

const boostingEffects = {
 "Fortune Teller": {
  Crafting: {
   name: "Foresight in Sales",
   description: "The seer scripts the sale in advance—freshly crafted goods earn 20% more tokens once you bring them to market.",
  },
  // Exploring: {
  //  name: "Premonition",
  //  description: "A crystal vision reveals whether the next quadrant hides blight before anyone dares to step across the line.",
  // },
  Gathering: {
   name: "Rarity Reversal",
   description: "Rare treasures feel the pull of destiny, dramatically increasing the odds that high-rarity finds surface in your haul.",
  },
  Healers: {
   name: "Predictive Healing",
   description: "Forewarned medics conserve effort; the next healing action costs 50% less stamina (rounded up) thanks to the teller’s cue.",
  },
  Looting: {
   name: "Fated Reroll",
   description: "Should looting go poorly and you take damage, fate compels a single reroll in search of a kinder result.",
  },
  // Mounts: {
  //  name: "Rare Alignment",
  //  description: "When the next mount appears, destiny nudges the odds by +30% toward a rare-blooded companion.",
  // },
  Stealing: {
   name: "Predicted Opportunity",
   description: "The teller marks the perfect moment—steal success chance rises by +20%, without exceeding a flawless score.",
  },
  Tokens: {
   name: "Fortunate Exchange",
   description: "Trade forecasts ensure 10% extra tokens whenever you sell your wares to village shops.",
  },
  Traveling: {
   name: "Foresight Detour",
   description: "Their charted detour nullifies weather roadblocks, letting the party travel even when conditions say to stay put.",
  },
  // Vending: {
  //  name: "Reserved Fortune",
  //  description: "A fortune card reserves one sold-out special item so you may purchase it as though your name was on the ledger.",
  // },
  Other: {
   name: "Weather Prediction",
   description: "Use `/boost other` to lock in tomorrow’s weather forecast for any single village the moment the reading is given.",
  },
 },

 Teacher: {
  Crafting: {
   name: "Stamina Assistance",
   description: "The mentor loans up to 3 stamina, splitting a crafting action’s cost between Teacher and student.",
  },
  // Exploring: {
  //  name: "Study in Multiples",
  //  description: "For non-combat finds, the student catalogs one additional copy of whatever the expedition uncovered.",
  // },
  Gathering: {
   name: "Practical Wisdom",
   description: "Lesson plans filter the table so you only gather useful supplies for crafting or village life—never junk.",
  },
  Healers: {
   name: "Temporary Fortitude",
   description: "The Teacher’s bracing guidance grants +2 temporary hearts that last until the patient is next harmed.",
  },
  Looting: {
   name: "Combat Insight",
   description: "Combat notes bump the loot roll by 20%, reflecting studied weak points and clever timing.",
  },
  // Mounts: {
  //  name: "Weather Wisdom",
  //  description: "Field journals outline the safe route, allowing mounted travel even when storms would ground everyone else.",
  // },
  Stealing: {
   name: "Tactical Risk",
   description: "The mentor intervenes once, granting an extra failed attempt before the guards haul you to jail.",
  },
  Tokens: {
   name: "Critique & Composition",
   description: "Structured critiques elevate visual submissions, boosting the final token payout by 50%.",
  },
  Traveling: {
   name: "Field Lesson",
   description: "On the road they review two gather results, keeping whichever holds the higher rarity.",
  },
  // Vending: {
  //  name: "Efficient Haggling",
  //  description: "Sharp math during restock saves 20% of the vending points that would normally be spent.",
  // },
 },

 Priest: {
  Crafting: {
   name: "Spiritual Efficiency",
   description: "Sacred rhythm trims crafting stamina by 30%, always saving at least 1 so long as the task costs 2 or more.",
  },
  // Exploring: {
  //  name: "Divine Protection",
  //  description: "A blessing wards your next exploration, skipping one blight exposure check if corruption is present.",
  // },
  Gathering: {
   name: "Divine Favor",
   description: "Prayers weight the table toward consecrated relics and other spiritually attuned finds.",
  },
  Healers: {
   name: "Spiritual Cleanse",
   description: "A purifying rite strips away every active debuff from the patient during the healing.",
  },
  Looting: {
   name: "Divine Blessing",
   description: "Divine Blessing commands the loot tables to hand over the highest-tier treasure the monster carried.",
  },
  // Mounts: {
  //  name: "Blessed Attempt",
  //  description: "If the first taming attempt falters, the blessing resets it once without costing extra stamina.",
  // },
  Stealing: {
   name: "Merciful Sentence",
   description: "Mercy tempers justice—any jail sentence from a failed steal is cut in half.",
  },
  Tokens: {
   name: "Blessed Economy",
   description: "Markets treat you kindly: sell orders pay 10% more tokens, and purchases cost 10% fewer.",
  },
  Traveling: {
   name: "Restful Blessing",
   description: "When you rest on the road, gain +2 additional hearts from the priest’s gentle hymn.",
  },
  // Vending: {
  //  name: "Blessed Restock",
  //  description: "Temple tithe delivers +20 bonus vending points the next time you collect for the month.",
  // },
 },

 Entertainer: {
  Crafting: {
   name: "Song of Double Time",
   description: "The Entertainer conducts the Song of Double Time, producing one extra crafted item with no extra cost.",
  },
  // Exploring: {
  //  name: "Song of Soaring",
  //  description: "After exploring, the performance of the Song of Soaring carries everyone straight back to the village plaza.",
  // },
  Gathering: {
   name: "Minuet of Forest",
   description: "The Minuet of Forest swaps in a trove of performer-marked curios so you can snag a bonus themed item when available.",
  },
  Healers: {
   name: "Song of Healing",
   description: "A stirring refrain restores +1 extra heart whenever someone rises from 0 HP.",
  },
  Looting: {
   name: "Requiem of Spirit",
   description: "Show-stopping flourishes dazzle foes, reducing incoming damage by 1 heart per two monster tiers (works in raids).",
  },
  // Mounts: {
  //  name: "Epona's Song",
  //  description: "Epona’s Song raises the weight of fitting mounts, making region-appropriate companions more likely to answer.",
  // },
  Stealing: {
   name: "Elegy of Emptiness",
   description: "If the steal succeeds, higher-tier loot entries have doubled weight, making rarer prizes likelier.",
  },
  Tokens: {
   name: "Ballad of the Goddess",
   description: "Passive effect. When an Entertainer is present in a tracked RP quest, all participants automatically receive the bonus token reward.",
   passive: true,
  },
  Traveling: {
   name: "Bolero of Fire",
   description: "If ambushed on the road, the Bolero grants two escape rolls—keep the stronger result.",
  },
  // Vending: {
  //  name: "Song of Time",
  //  description: "Song of Time lets vendors collect their points at any moment in the month without waiting for schedule windows.",
  // },
  Other: {
   name: "Song of Storms",
   description: "Song of Storms designates one of the three villages for guaranteed special weather the following day.",
  },
 },

 Scholar: {
  Crafting: {
   name: "Resource Optimization",
   description: "Resource ledgers trim material needs by 30% on recipes requiring more than one total unit, with sensible rounding.",
  },
  // Exploring: {
  //  name: "Historical Discovery",
  //  description: "There’s a 25% chance to swap your result for a lore discovery—ruins, tomes, or other story-rich rewards flagged with bonuses.",
  // },
  Gathering: {
   name: "Cross-Region Insight",
   description: "Specify a distant village and the Scholar will pull that settlement’s gather table without anyone needing to travel.",
  },
  Healers: {
   name: "Efficient Recovery",
   description: "Academic breathing drills return 1 stamina to both healer and recipient after the action, up to their maximums.",
  },
  Looting: {
   name: "Double Haul",
   description: "Field notes secure twice the usual quantity from a successful loot encounter.",
  },
  // Mounts: {
  //  name: "Tactical Recommendation",
  //  description: "The Scholar writes the mount embed note, highlighting the recommended approach for the current terrain.",
  // },
  Stealing: {
   name: "Calculated Grab",
   description: "Ledgers leave space for one more trinket—add +1 extra item whenever the steal succeeds.",
  },
  Tokens: {
   name: "Research Stipend",
   description: "Research grants bump written submissions by 50% when the tokens are tallied.",
  },
  Traveling: {
   name: "Travel Guide",
   description: "A penned itinerary adds +1 to the number of road gather results you receive during the journey.",
  },
  // Vending: {
  //  name: "Demand Forecast",
  //  description: "Their census of inventories surfaces whichever stock item is rarest across players, ready for your next restock.",
  // },
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
 TEACHER_LOOT_MULTIPLIER: 1.2,
 TEACHER_STEAL_ATTEMPTS: 1,
 PRIEST_CRAFTING: 0.7, // 30% reduction
 PRIEST_TOKENS_SELL: 1.1,
 PRIEST_TOKENS_BUY: 0.9,
 PRIEST_JAIL_TIME: 0.5,
 PRIEST_TRAVEL_HEALING: 2,
 PRIEST_VENDING_BONUS: 20,
 SCHOLAR_CRAFTING: 0.7, // 30% reduction
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
  "Lightning Storm",
  "Meteor Shower",
  "Muggy",
  "Rock Slide",
];

// Note: Keep this list in sync with boosting command usage expectations.
const VILLAGES = ["Rudania", "Inariko", "Vhintl"];



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
  logger.error('BOOST', `${errorMessage}: ${error.message}`);
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
 const tagPriestDivineItem = (itemEntry, sourceEntry = null) => {
  if (!itemEntry) {
   return itemEntry;
  }

  itemEntry.divineItems = true;
  itemEntry.priestBoostItem = true;

  if (sourceEntry) {
   if (
    sourceEntry.type &&
    (!Array.isArray(itemEntry.type) || itemEntry.type.length === 0)
   ) {
    itemEntry.type = Array.isArray(sourceEntry.type)
     ? [...sourceEntry.type]
     : [sourceEntry.type];
   }

   if (sourceEntry.image && !itemEntry.image) {
    itemEntry.image = sourceEntry.image;
   }

   if (sourceEntry.emoji && !itemEntry.emoji) {
    itemEntry.emoji = sourceEntry.emoji;
   }
  }

  return itemEntry;
 };

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
   const existingItem = combinedTable[existingIndex];
   existingItem.weight = (existingItem.weight || 1) * 3;
   tagPriestDivineItem(existingItem, divineItem);
  } else {
   combinedTable.push(
    tagPriestDivineItem({
    itemName: divineItem.itemName,
    itemRarity: divineItem.itemRarity || 5,
    weight: 3,
    type: divineItem.type || ["Natural"],
    image: divineItem.image,
    emoji: divineItem.emoji,
   }, divineItem)
   );
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

function applyFortuneTellerTokensBoost(baseTokens, isBuying = false) {
 if (isBuying) {
  return baseTokens;
 }
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

function applyFortuneTellerLootingBoost(lootResult) {
 // Only handle structured loot results (to avoid duplicate logs when called with numeric rolls or items)
 const isStructuredResult = lootResult && typeof lootResult === 'object' && 'damageValue' in lootResult;
 if (!isStructuredResult) {
  return lootResult;
 }
 
 logger.info('BOOST', `🔮 Fortune Teller Looting Boost - Fated Reroll`);
 
 // Check if damage was taken - if so, trigger reroll
 if (lootResult.damageValue && lootResult.damageValue > 0) {
  logger.info('BOOST', `🔮 Damage detected (${lootResult.damageValue}) - triggering Fated Reroll`);
  
  // Mark that reroll was triggered
  return {
   ...lootResult,
   shouldReroll: true,
   rerollTriggered: true,
   originalDamage: lootResult.damageValue,
   message: "🔮 Fated Reroll activated! Rolling again for a potentially better outcome..."
  };
 }
 
 // No damage taken - skip noisy info log to prevent duplicates
 return lootResult;
}

function applyFortuneTellerGatheringBoost(gatherTable) {
logger.debug('BOOST', `🔮 Fortune Teller Gathering Boost - Input: ${gatherTable.length} items`);
 
 // Only include rarity 4+ items for dramatic rarity reversal effect
 const validItems = gatherTable.filter((item) => item.itemRarity && item.itemRarity >= 4);
logger.debug('BOOST', `🔮 Valid items (rarity ≥ 4): ${validItems.length} items`);

 if (validItems.length === 0) {
  logger.debug('BOOST', `🔮 No valid items found (rarity 4+) - returning original table`);
  return gatherTable;
 }

 const maxRarity = Math.max(...validItems.map((item) => item.itemRarity));
logger.debug('BOOST', `🔮 Max rarity in table: ${maxRarity}`);
 
 const boostedTable = [];
 const rarityGroups = {};

 validItems.forEach((item) => {
  const rarity = item.itemRarity;
  if (!rarityGroups[rarity]) {
   rarityGroups[rarity] = [];
  }
  rarityGroups[rarity].push(item);
 });

logger.debug('BOOST', `🔮 Rarity groups: ${Object.keys(rarityGroups).map(r => `${r}: ${rarityGroups[r].length} items`).join(', ')}`);

 // Progressive scaling: Rarity 10 gets highest weight, then 9, 8, 7, etc.
 Object.keys(rarityGroups)
  .sort((a, b) => b - a)
  .forEach((rarity) => {
   const items = rarityGroups[rarity];
   const rarityNum = parseInt(rarity);

   // Progressive weight scaling: 10=20x, 9=18x, 8=16x, 7=14x, 6=12x, 5=10x, 4=8x, 3=6x, 2=4x, 1=2x
   const weight = (rarityNum * 2);
   
  logger.debug('BOOST', `🔮 Rarity ${rarityNum}: ${items.length} items → weight ${weight}`);
   
   // Log sample items for this rarity
   const sampleItems = items.slice(0, 2).map(item => item.itemName);
  logger.debug('BOOST', `🔮 Sample items for rarity ${rarityNum}: ${sampleItems.join(', ')}`);

   items.forEach((item) => {
    for (let i = 0; i < weight; i++) {
     boostedTable.push(item);
    }
   });
  });

logger.debug('BOOST', `🔮 Fortune Teller boost complete - Output: ${boostedTable.length} items (${(boostedTable.length / gatherTable.length).toFixed(2)}x multiplier)`);
 return boostedTable;
}

// ============================================================================
// ------------------- Teacher Boost Functions -------------------
// ============================================================================

function applyTeacherCraftingBoost(craftedItem) {
 // Teacher boost no longer doubles quantity - only provides stamina sharing
 // Stamina sharing is handled directly in crafting.js
 return craftedItem;
}

function applyTeacherExploringBoost(exploredItem) {
 // Handle both number input (quantity) and object input (item with quantity)
 if (typeof exploredItem === 'number') {
  return exploredItem + 1;
 }
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
 
 // Create a set of all useful item names for efficient lookup
 const usefulItemNames = new Set([
   ...topMaterials,
   ...Object.values(generalCategoryItems).flat()
 ]);
 
 // Filter the original table to only include useful items
 const filteredTable = gatherTable.filter(item => {
   return usefulItemNames.has(item.itemName);
 });
 
 // Create a new table with only useful items
 const enhancedTable = [...filteredTable];
 
 // Add top materials if they're not already in the filtered table
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
 
 // Add general category items if they're not already in the filtered table
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
 // Add +2 temporary hearts directly to currentHearts (can exceed maxHearts)
 // Store tempHearts to track temporary hearts for display
 if (healedCharacter.tempHearts === undefined) {
  healedCharacter.tempHearts = 0;
 }
 healedCharacter.tempHearts += 2;
 healedCharacter.currentHearts += 2; // Add directly to currentHearts (can exceed maxHearts)
 return healedCharacter;
}

function applyTeacherLootingBoost(adjustedRoll) {
 return applyPercentageBoost(adjustedRoll, BOOST_MULTIPLIERS.TEACHER_LOOT_MULTIPLIER);
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

function applyPriestCraftingBoost(baseValue, context = {}) {
 const isStaminaContext = context?.type === 'stamina' || context == null;

 if (!isStaminaContext || typeof baseValue !== 'number') {
  return baseValue;
 }

 const baseStaminaCost = baseValue;

 // Special case: 1 stamina items get no reduction
 if (baseStaminaCost === 1) {
  return 1;
 }
 
 // Apply 30% reduction
 const reducedCost = Math.ceil(baseStaminaCost * BOOST_MULTIPLIERS.PRIEST_CRAFTING);
 
 // Ensure at least 1 stamina is saved (unless original cost is 1)
 const minimumSavings = 1;
 const maxAllowedCost = Math.max(1, baseStaminaCost - minimumSavings);
 
 return Math.min(reducedCost, maxAllowedCost);
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
 // Priest Divine Favor is handled in loot selection, not roll modification
 // Return the original roll unchanged
 return adjustedRoll;
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

function applyEntertainerCraftingBoost(craftedItem, context = {}) {
 if (context && context.type === 'stamina') {
  return craftedItem;
 }
 // Handle both number input (quantity) and object input (item with quantity)
 // For crafting boost: add 1 extra item at no cost
 if (typeof craftedItem === 'number') {
  return craftedItem + 1;
 }
 if (craftedItem && craftedItem.quantity) {
  craftedItem.quantity += 1;
 }
 return craftedItem;
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
 const entertainerItems = await processEntertainerItems();

 // Ensure we always return an array so calling code can safely iterate.
 if (!Array.isArray(regionItems)) {
  return entertainerItems.length > 0 ? entertainerItems : [];
 }

 // Filter regionItems to only include items marked as entertainerItems: true
 const filteredRegionItems = regionItems.filter((item) => item.entertainerItems === true);

 // If no entertainer items are configured, return empty array (Entertainer boost requires entertainer items)
 if (!entertainerItems.length) {
  return filteredRegionItems.length > 0 ? filteredRegionItems : [];
 }

 // Start with filtered region items (only those with entertainerItems: true)
 const mergedItems = [...filteredRegionItems];
 const existingNames = new Set(filteredRegionItems.map((item) => item.itemName));
 const regionItemNames = new Set(regionItems.map((item) => item.itemName));

 // Only add global entertainer items that are already in the current job+region table.
 // This prevents weapons/other items with entertainerItems: true from appearing in the
 // wrong gather table (e.g. Boko Bow in Vhintl Forager).
 entertainerItems.forEach((item) => {
  if (!existingNames.has(item.itemName) && regionItemNames.has(item.itemName)) {
   const fromRegion = regionItems.find((r) => r.itemName === item.itemName);
   mergedItems.push(fromRegion || item);
  }
 });

 // Only return items that explicitly have entertainerItems === true (no weapons or non-marked items)
 return mergedItems.filter((item) => item && item.entertainerItems === true);
}

function applyEntertainerHealingBoost(baseHealing, wasKO) {
 return wasKO ? baseHealing + 1 : baseHealing;
}

function applyEntertainerLootingBoost(damageTaken, monsterTier = 1) {
 // Scale damage reduction based on monster tier
 // Tier 1-2: -1 heart
 // Tier 3-4: -2 hearts
 // Tier 5-6: -3 hearts
 // Tier 7-8: -4 hearts
 // Tier 9-10: -5 hearts
 const damageReduction = Math.ceil(monsterTier / 2);
 return Math.max(0, damageTaken - damageReduction);
}

function applyEntertainerTokensBoost(participants) {
 return participants;
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

function applyScholarCraftingBoost(materialCosts, craftQuantity = 1) {
 // Only process if materialCosts is an array (materials)
 // If it's not an array (e.g., stamina cost or quantity), return unchanged
 if (!Array.isArray(materialCosts)) {
  return materialCosts;
 }
 
 const { info, success } = require('@/utils/logger');
 
 // Only apply reduction if total material needed (per-item quantity * craft quantity) is more than 1
 const result = materialCosts.map((material) => {
  const originalQuantity = material.quantity;
  const totalNeeded = originalQuantity * craftQuantity;
  
  // If total needed is 1 or less, don't apply reduction
  if (totalNeeded <= 1) {
   info('BOOST', `Scholar boost: ${material.itemName} - total needed ${totalNeeded} (≤ 1), no reduction applied`);
   return material;
  }
  
  // Apply 30% reduction to the TOTAL needed
  const reducedTotal = Math.floor(totalNeeded * BOOST_MULTIPLIERS.SCHOLAR_CRAFTING);
  
  // Ensure reduced total is at least 1 (but less than original if reduction applied)
  const finalTotal = Math.max(1, reducedTotal);
  
  // Calculate per-item quantity from reduced total
  // For multiple items, we distribute the reduced total evenly
  // If reduced total would result in less than 1 per item, keep it at 1 per item
  // This ensures all items have the material requirement, though full savings may not be realized
  // in cases where reduced total < craft quantity
  let finalQuantity;
  if (craftQuantity === 1) {
   // Single item crafting: use the reduced total directly
   finalQuantity = finalTotal;
  } else {
   // Multiple items: calculate per-item requirement
   // Round up to ensure proper distribution (may result in slight overshoot when reducedTotal < craftQuantity)
   const perItemFraction = finalTotal / craftQuantity;
   finalQuantity = Math.ceil(perItemFraction);
   // But ensure it's at least 1 per item
   finalQuantity = Math.max(1, finalQuantity);
  }
  
  const savings = totalNeeded - (finalQuantity * craftQuantity);
  if (savings > 0) {
   success('BOOST', `Scholar boost: ${material.itemName} - saved ${savings} (from ${totalNeeded} to ${finalQuantity * craftQuantity})`);
  }
  
  return {
   ...material,
   quantity: finalQuantity,
   originalQuantity: originalQuantity, // Store original for savings calculation
   savings: savings, // Store savings amount
  };
 });
 
 return result;
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

 if (healer && healer.currentStamina < healer.maxStamina) {
  healer.currentStamina = Math.min(healer.currentStamina + 1, healer.maxStamina);
 }
 if (recipient && recipient.currentStamina < recipient.maxStamina) {
  recipient.currentStamina = Math.min(recipient.currentStamina + 1, recipient.maxStamina);
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

function applyScholarTravelingBoost(travelData) {
 // Numeric travel values (resting hearts, escape checks, weather flags) should
 // remain untouched by the Scholar boost; the calling flow handles the bonus work.
 if (!Array.isArray(travelData)) {
  return travelData;
 }

 // For gather tables, return a shallow copy so callers can append additional rolls
 // without mutating the original array reference.
 return [...travelData];
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
  logger.error('BOOST', `Could not find character "${characterName}"`);
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
  if (character) {
   actualJob = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;
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
   case "Looting": return applyFortuneTellerLootingBoost(data);
   case "Mounts": return applyFortuneTellerMountsBoost(data);
   case "Stealing": return applyFortuneTellerStealingBoost(data);
  case "Tokens": return applyFortuneTellerTokensBoost(data, additionalData);
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
   case "Crafting": return applyPriestCraftingBoost(data, additionalData);
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
  const entertainerBoost = boostingEffects[normalizedJob][category];
  if (entertainerBoost && entertainerBoost.passive) {
   logger.info('BOOST', `Entertainer passive boost "${category}" acknowledged; no active effect applied.`);
   return data;
  }
  switch (category) {
   case "Crafting": return applyEntertainerCraftingBoost(data, additionalData);
   case "Exploring": return applyEntertainerExploringBoost(data);
   case "Gathering": return await applyEntertainerGatheringBoost(data);
   case "Healers": return applyEntertainerHealingBoost(data, additionalData);
   case "Looting": return applyEntertainerLootingBoost(data, additionalData);
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
   case "Crafting": return applyScholarCraftingBoost(data, additionalData);
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
 normalizeJobName,
 getBoostEffect,
 getBoostEffectByCharacter,
 applyBoostEffect,
 boostingEffects,
 applyFortuneTellerCraftingBoost,
 applyFortuneTellerExploringBoost,
 applyFortuneTellerGatheringBoost,
 applyFortuneTellerHealingBoost,
 applyFortuneTellerLootingBoost,
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