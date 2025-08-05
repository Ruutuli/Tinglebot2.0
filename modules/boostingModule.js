// ============================================================================
// Boosting Module: Full Version
// This file is generated from the CSV "[RotW] Boosting Perk [2024] - Sheet8.csv"
// and includes every boosting job/mechanic from top to bottom.
// ============================================================================

// ------------------- Boosting Effects Definitions -------------------
// This object maps each boosting job to its various boost mechanics. The boost names 
// and descriptions have been updated exactly per the provided CSV data.
const boostingEffects = {
    // ========================================================================
    // Fortune Teller Boosting Effects
    // ========================================================================
    'Fortune Teller': {
      // ------------------- Crafting -------------------
      Crafting: {
        name: 'Foresight in Sales',
        description: 'Items crafted while boosted by a Fortune Teller sell for 20% more tokens.'
      },
      // ------------------- Exploring -------------------
      Exploring: {
        name: 'Premonition',
        description: 'Reveals whether the next quadrant contains blight before exploring it.'
      },
      // ------------------- Gathering -------------------
      Gathering: {
        name: 'Rarity Reversal',
        description: 'While boosted, rare items have a significantly higher chance to be gathered.'
      },
      // ------------------- Looting -------------------
      Looting: {
        name: 'Fated Reroll',
        description: 'If you take damage during looting, the system rerolls once for a potentially better outcome.'
      },
      // ------------------- Stealing -------------------
      Stealing: {
        name: 'Predicted Opportunity',
        description: 'Increases steal success rate by +20%, capped at 100%.'
      },
      // ------------------- Tokens -------------------
      Tokens: {
        name: 'Fortunate Exchange',
        description: 'Boosted by a Fortune Teller, you earn 10% more tokens when selling to shops.'
      },
      // ------------------- Traveling -------------------
      Traveling: {
        name: 'Foresight Detour',
        description: 'Predicts dangerous weather and avoids it, allowing travel when others would be blocked.'
      },
      // ------------------- Vending -------------------
      Vending: {
        name: 'Reserved Fortune',
        description: 'Vendor may purchase one sold-out special item as if it was reserved for them by fate.'
      },
      // ------------------- Other -------------------
      Other: {
        name: '',
        description: 'Can use the command /boost other to predict the weather for the next day in one village.'
      }
    },
    
    // ========================================================================
    // Teacher Boosting Effects
    // ========================================================================
    'Teacher': {
      // ------------------- Crafting -------------------
      Crafting: {
        name: 'Crafting Duplication',
        description: 'When boosted by a Teacher, successfully crafted items are created in double.'
      },
      // ------------------- Exploring -------------------
      Exploring: {
        name: 'Study in Multiples',
        description: 'Double the amount of any item found during exploration, if it\'s a non-combat result.'
      },
      // ------------------- Gathering -------------------
      Gathering: {
        name: 'Practical Wisdom',
        description: 'You always gather something useful for crafting or daily life — never junk.'
      },
      // ------------------- Healers -------------------
      Healers: {
        name: 'Temporary Fortitude',
        description: 'Boosted by a Teacher, the next patient gains +2 temporary hearts that persist until they are next damaged.'
      },
      // ------------------- Looting -------------------
      Looting: {
        name: 'Combat Insight',
        description: 'Add a flat +2 to your loot encounter roll to reflect knowledge of weak points.'
      },
      // ------------------- Stealing -------------------
      Stealing: {
        name: 'Tactical Risk',
        description: 'Boosted players are allowed one extra failed attempt before jail time is triggered.'
      },
      // ------------------- Tokens -------------------
      Tokens: {
        name: 'Critique & Composition',
        description: 'Visual works submitted while boosted earn 1.5x their token value.'
      },
      // ------------------- Traveling -------------------
      Traveling: {
        name: 'Field Lesson',
        description: 'Roll twice on road gathers and choose the better result.'
      },
      // ------------------- Vending -------------------
      Vending: {
        name: 'Efficient Haggling',
        description: 'Vendor pays 20% fewer vending points during one restock.'
      }
    },
    
    // ========================================================================
    // Priest Boosting Effects
    // ========================================================================
    'Priest': {
      // ------------------- Crafting -------------------
      Crafting: {
        name: 'Spiritual Efficiency',
        description: 'Crafting while boosted by a Priest costs 20% less stamina.'
      },
      // ------------------- Exploring -------------------
      Exploring: {
        name: 'Divine Protection',
        description: 'Skip one blight exposure check during your next exploration attempt if blight is present.'
      },
      // ------------------- Gathering -------------------
      Gathering: {
        name: 'Divine Favor',
        description: 'Gathering while boosted by a Priest increases the chance of finding divine or spiritually attuned items.'
      },
      // ------------------- Healers -------------------
      Healers: {
        name: 'Spiritual Cleanse',
        description: 'When boosted by a Priest, any active debuffs on the patient are removed during healing.'
      },
      // ------------------- Looting -------------------
      Looting: {
        name: 'Divine Test',
        description: 'Ask for protection or challenge; a +5 or -5 modifier is randomly applied to your loot roll.'
      },
      // ------------------- Stealing -------------------
      Stealing: {
        name: 'Merciful Sentence',
        description: 'While boosted by a Priest, jail time is cut in half if caught.'
      },
      // ------------------- Tokens -------------------
      Tokens: {
        name: 'Blessed Economy',
        description: 'While boosted, you earn 10% more when selling to shops and pay 10% less when buying.'
      },
      // ------------------- Traveling -------------------
      Traveling: {
        name: 'Restful Blessing',
        description: 'When recovering during travel, gain +2 extra hearts.'
      },
      // ------------------- Vending -------------------
      Vending: {
        name: 'Blessed Restock',
        description: 'When a vendor is boosted by a Priest, they receive a divine favor: +20 bonus points when collecting vending points this month.'
      }
    },
    
    // ========================================================================
    // Entertainer Boosting Effects
    // ========================================================================
    'Entertainer': {
      // ------------------- Crafting -------------------
      Crafting: {
        name: 'Song of Double Time',
        description: 'Boosted by an Entertainer, you can craft one extra job-voucher item.'
      },
      // ------------------- Exploring -------------------
      Exploring: {
        name: 'Song of Soaring',
        description: 'After exploring, instantly return to your current village\'s plaza via magical performance.'
      },
      // ------------------- Gathering -------------------
      Gathering: {
        name: 'Minuet of Forest',
        description: 'Gather one bonus item from a curated list of beautiful or performance-themed items, if available.'
      },
      // ------------------- Healers -------------------
      Healers: {
        name: 'Song of Healing',
        description: 'Emotional and musical healing grants +1 bonus heart recovered when revived from 0 HP.'
      },
      // ------------------- Looting -------------------
      Looting: {
        name: 'Requiem of Spirit',
        description: 'Monsters are dazzled by flair. Reduce any damage taken from an encounter by 1 heart (min 0).'
      },
      // ------------------- Mounts -------------------
      Mounts: {
        name: 'Epona\'s Song',
        description: 'You\'re more likely to tame a mount that fits the local region\'s style, folklore, or wildlife.'
      },
      // ------------------- Other -------------------
      Other: {
        name: 'Song of Storms',
        description: 'Garunteed Special Weather in one of the 3 villages the following day'
      },
      // ------------------- Tokens -------------------
      Tokens: {
        name: 'Ballad of the Goddess',
        description: 'When an Entertainer is present in a tracked RP or quest, all participants receive a bonus token reward.'
      },
      // ------------------- Traveling -------------------
      Traveling: {
        name: 'Bolero of Fire',
        description: 'If ambushed during travel, roll two escape attempts and take the better one.'
      },
      // ------------------- Vending -------------------
      Vending: {
        name: 'Song of Time',
        description: 'Vendor may collect points at any point during the month.'
      }
    },
    
    // ========================================================================
    // Scholar Boosting Effects
    // ========================================================================
    'Scholar': {
      // ------------------- Crafting -------------------
      Crafting: {
        name: 'Resource Optimization',
        description: 'When boosted by a Scholar, crafting consumes 20% fewer materials.'
      },
      // ------------------- Exploring -------------------
      Exploring: {
        name: 'Historical Discovery',
        description: '25% chance to uncover a lore-related reward (e.g., ruins, tomes, or lore-tagged items) instead of a normal event.'
      },
      // ------------------- Gathering -------------------
      Gathering: {
        name: 'Cross-Region Insight',
        description: 'Gather from another village\'s item table without leaving your current location.'
      },
      // ------------------- Healers -------------------
      Healers: {
        name: 'Efficient Recovery',
        description: 'Boosted by a Scholar, both the healer and recipient recover 1 🟩 stamina after the healing is complete.'
      },
      // ------------------- Looting -------------------
      Looting: {
        name: 'Double Haul',
        description: 'If you win the encounter, collect 2x the normal loot quantity.'
      },
      // ------------------- Mounts -------------------
      Mounts: {
        name: 'Tactical Recommendation',
        description: 'When boosted by a Scholar, the mount embed highlights the recommended action based on the current environment.'
      },
      // ------------------- Stealing -------------------
      Stealing: {
        name: 'Calculated Grab',
        description: 'Gain +1 extra item if the steal is successful.'
      },
      // ------------------- Tokens -------------------
      Tokens: {
        name: 'Research Stipend',
        description: 'Written works submitted while boosted earn 1.5x their token value.'
      },
      // ------------------- Traveling -------------------
      Traveling: {
        name: 'Travel Guide',
        description: 'Gain one extra road gather result during the journey thanks to Scholar\'s guidance.'
      },
      // ------------------- Vending -------------------
      Vending: {
        name: 'Demand Forecast',
        description: 'When boosted, the vendor receives a recommendation for 1 item that is rare across all player inventories — ideal for stocking.'
      }
    }
  };

// ------------------- Implementation Functions -------------------

// ------------------- Fortune Teller Implementations -------------------
function applyFortuneTellerCraftingBoost(basePrice) {
  return Math.floor(basePrice * 1.2);
}

function applyFortuneTellerStealingBoost(baseChance) {
  return Math.min(baseChance + 20, 100);
}

function applyFortuneTellerTokensBoost(baseTokens) {
  return Math.floor(baseTokens * 1.1);
}

function applyFortuneTellerTravelingBoost(weatherBlock) {
  // Override weather blocks for Fortune Teller
  return false;
}

function applyFortuneTellerGatheringBoost(gatherTable) {
  // COMPLETELY EXCLUDE rarity 1-2 items
  const validItems = gatherTable.filter(item => item.itemRarity && item.itemRarity >= 3);
  const excludedItems = gatherTable.filter(item => !item.itemRarity || item.itemRarity < 3);
  
  if (validItems.length === 0) {
    console.log(`[boostingModule.js] Fortune Teller Boost: No valid items (rarity 3+) found, returning original table`);
    return gatherTable;
  }
  
  // Find the highest available rarity in the valid items
  const maxRarity = Math.max(...validItems.map(item => item.itemRarity));
  
  // Categorize items by rarity tiers and apply dynamic weighting
  const boostedTable = [];
  const rarityGroups = {};
  
  validItems.forEach(item => {
    const rarity = item.itemRarity;
    if (!rarityGroups[rarity]) {
      rarityGroups[rarity] = [];
    }
    rarityGroups[rarity].push(item);
  });
  
  // Apply dynamic weighting based on highest available rarity
  Object.keys(rarityGroups).sort((a, b) => b - a).forEach(rarity => {
    const items = rarityGroups[rarity];
    const rarityNum = parseInt(rarity);
    
    // Calculate weight based on how close to the maximum rarity this group is
    let weight;
    if (maxRarity >= 8) {
      // If we have rarity 8+ items, use the original weighting system
      if (rarityNum >= 8) {
        weight = 10; // 10x weight for rarity 8-10
      } else if (rarityNum >= 5) {
        weight = 3;  // 3x weight for rarity 5-7
      } else {
        weight = 1;  // 1x weight for rarity 3-4
      }
    } else if (maxRarity >= 5) {
      // If highest is 5-7, boost the highest available rarities
      if (rarityNum >= 5) {
        weight = 8;  // 8x weight for highest available (5-7)
      } else {
        weight = 2;  // 2x weight for lower available (3-4)
      }
    } else {
      // If highest is 3-4, still give preference to higher rarity
      weight = rarityNum === maxRarity ? 5 : 1;
    }
    
    items.forEach(item => {
      for (let i = 0; i < weight; i++) {
        boostedTable.push(item);
      }
    });
  });
  
  console.log(`[boostingModule.js] Fortune Teller Boost: Excluded ${excludedItems.length} rarity 1-2 items, boosted ${validItems.length} items (max rarity: ${maxRarity})`);
  return boostedTable;
}

// ------------------- Teacher Implementations -------------------
function applyTeacherCraftingBoost(craftedItem) {
  // Duplicate the crafted item quantity
  if (craftedItem && craftedItem.quantity) {
    craftedItem.quantity += 1;
  }
  return craftedItem;
}

function applyTeacherExploringBoost(exploredItem) {
  // Double the amount of non-combat items found
  if (exploredItem && exploredItem.quantity && !exploredItem.isCombat) {
    exploredItem.quantity += 1;
  }
  return exploredItem;
}

function applyTeacherGatheringBoost(gatherTable) {
  console.log(`[boostingModule.js] Teacher Gathering Boost - Input table has ${gatherTable.length} items`);
  
  // Filter for useful items (Material, Cooking, Potion tags)
  const usefulItems = gatherTable.filter(item => 
    item.tags && (item.tags.includes('Material') || item.tags.includes('Cooking') || item.tags.includes('Potion'))
  );
  
  console.log(`[boostingModule.js] Teacher Gathering Boost - Found ${usefulItems.length} useful items`);
  
  if (usefulItems.length > 0) {
    console.log(`[boostingModule.js] Teacher Gathering Boost - Returning filtered useful items`);
    return usefulItems;
  } else {
    console.log(`[boostingModule.js] Teacher Gathering Boost - No useful items found, returning original table`);
    return gatherTable;
  }
}

function applyTeacherHealingBoost(healedCharacter) {
  // Add +2 temporary hearts
  if (healedCharacter.tempHearts === undefined) {
    healedCharacter.tempHearts = 0;
  }
  healedCharacter.tempHearts += 2;
  return healedCharacter;
}

function applyTeacherLootingBoost(adjustedRoll) {
  return Math.min(adjustedRoll + 2, 100);
}

function applyTeacherStealingBoost(failedAttempts) {
  // Allow one extra failed attempt
  return failedAttempts + 1;
}

function applyTeacherTokensBoost(baseTokens) {
  return Math.floor(baseTokens * 1.5);
}

function applyTeacherTravelingBoost(roadGathers) {
  // Roll twice and choose better result
  if (roadGathers && roadGathers.length >= 2) {
    const firstRoll = roadGathers[0];
    const secondRoll = roadGathers[1];
    
    // Handle cases where rarity might not be available
    const firstRarity = firstRoll.rarity || firstRoll.itemRarity || 0;
    const secondRarity = secondRoll.rarity || secondRoll.itemRarity || 0;
    
    console.log(`[boostingModule.js] Teacher Traveling Boost - Comparing rarities: ${firstRarity} vs ${secondRarity}`);
    
    return firstRarity > secondRarity ? firstRoll : secondRoll;
  }
  return roadGathers;
}

function applyTeacherVendingBoost(baseCost) {
  return Math.ceil(baseCost * 0.8);
}

// ------------------- Priest Implementations -------------------
function applyPriestCraftingBoost(baseStaminaCost) {
  return Math.ceil(baseStaminaCost * 0.8);
}

function applyPriestExploringBoost(blightExposure) {
  // Skip blight exposure check
  return false;
}

async function applyPriestGatheringBoost(gatherTable) {
  // Priest boost adds divine items to the existing gather table and makes them 3x more likely
  try {
    const Item = require('../models/ItemModel');
    const divineItems = await Item.find({ divineItems: true });
    
    console.log(`[boostingModule.js] Priest Gathering Boost - Found ${divineItems.length} divine/spiritual items globally`);
    
    if (divineItems.length === 0) {
      console.log(`[boostingModule.js] Priest Gathering Boost - No divine items found, returning original table`);
      return gatherTable;
    }
    
    // Create a new table that includes both original items and divine items
    const combinedTable = [...gatherTable];
    
    // Add divine items to the table with 3x weight
    divineItems.forEach(divineItem => {
      // Check if the divine item is already in the gather table
      const existingIndex = combinedTable.findIndex(item => item.itemName === divineItem.itemName);
      
      if (existingIndex >= 0) {
        // If it exists, increase its weight by 3x
        combinedTable[existingIndex].weight = (combinedTable[existingIndex].weight || 1) * 3;
        console.log(`[boostingModule.js] Priest Gathering Boost - Increased weight for existing divine item: ${divineItem.itemName}`);
      } else {
        // If it doesn't exist, add it with 3x weight
        combinedTable.push({
          itemName: divineItem.itemName,
          itemRarity: divineItem.itemRarity || 5,
          weight: 3, // 3x more likely to be found
          type: divineItem.type || ['Natural'],
          image: divineItem.image,
          emoji: divineItem.emoji,
          divineItems: true
        });
        console.log(`[boostingModule.js] Priest Gathering Boost - Added divine item: ${divineItem.itemName}`);
      }
    });
    
    console.log(`[boostingModule.js] Priest Gathering Boost - Combined table: ${gatherTable.length} original + ${divineItems.length} divine items`);
    return combinedTable;
  } catch (error) {
    console.error('[boostingModule.js] Error fetching divine items:', error);
    return gatherTable;
  }
}

function applyPriestHealingBoost(patient) {
  // Remove active debuffs
  if (patient.debuff && patient.debuff.active) {
    patient.debuff.active = false;
    patient.debuff.endDate = null;
  }
  return patient;
}

function applyPriestLootingBoost(adjustedRoll) {
  // Apply +5 or -5 modifier randomly
  const modifier = Math.random() < 0.5 ? 5 : -5;
  return Math.max(0, Math.min(100, adjustedRoll + modifier));
}

function applyPriestStealingBoost(jailTime) {
  return Math.ceil(jailTime * 0.5);
}

function applyPriestTokensBoost(baseTokens, isBuying = false) {
  if (isBuying) {
    return Math.ceil(baseTokens * 0.9); // Pay 10% less
  } else {
    return Math.floor(baseTokens * 1.1); // Earn 10% more
  }
}

function applyPriestTravelingBoost(baseHealing) {
  return baseHealing + 2;
}

function applyPriestVendingBoost(basePoints) {
  return basePoints + 20;
}

// ------------------- Entertainer Implementations -------------------
function applyEntertainerCraftingBoost(voucherCraftCount) {
  // Allow one extra voucher craft
  return voucherCraftCount + 1;
}

async function applyEntertainerGatheringBoost(regionItems) {
  // Entertainer boost provides bonus items regardless of region
  // Fetch all entertainer items directly from the database
  try {
    const Item = require('../models/ItemModel');
    const entertainerItems = await Item.find({ entertainerItems: true });
    
    console.log(`[boostingModule.js] Entertainer Gathering Boost - Found ${entertainerItems.length} entertainer-themed items globally`);
    
    // Return the entertainer items for potential bonus selection
    // The actual bonus logic will be handled in the gather command
    return entertainerItems;
  } catch (error) {
    console.error('[boostingModule.js] Error fetching entertainer items:', error);
    return [];
  }
}

function applyEntertainerHealingBoost(baseHealing, wasKO) {
  // Add +1 heart if revived from KO
  return wasKO ? baseHealing + 1 : baseHealing;
}

function applyEntertainerLootingBoost(damageTaken) {
  // Reduce damage by 1 heart (minimum 0)
  return Math.max(0, damageTaken - 1);
}

function applyEntertainerMountsBoost(regionMounts) {
  // Increase regional mount weighting by 30%
  return regionMounts.map(mount => ({
    ...mount,
    weight: mount.weight * 1.3
  }));
}

function applyEntertainerTokensBoost(participants) {
  // Add +20 tokens to all participants
  return participants.map(participant => ({
    ...participant,
    tokens: (participant.tokens || 0) + 20
  }));
}

function applyEntertainerTravelingBoost(escapeRolls) {
  // Take the better of two escape attempts
  if (escapeRolls && escapeRolls.length >= 2) {
    return Math.max(escapeRolls[0], escapeRolls[1]);
  }
  return escapeRolls;
}

function applyEntertainerVendingBoost(collectionTime) {
  // Allow collection at any time
  return true;
}

// ------------------- Scholar Implementations -------------------
function applyScholarCraftingBoost(materialCosts) {
  // Reduce material costs by 20%
  return materialCosts.map(material => ({
    ...material,
    quantity: Math.ceil(material.quantity * 0.8)
  }));
}

function applyScholarExploringBoost(exploreResult) {
  // 25% chance for lore-related reward
  if (Math.random() < 0.25) {
    return { type: 'lore', description: 'Historical discovery found!' };
  }
  return exploreResult;
}

function applyScholarGatheringBoost(gatheringData, targetRegion) {
  // Let the player select or default to a secondary region's gather table if boost is active. Still respects job requirements.
  // This function returns the target region for cross-region gathering
  const currentRegion = typeof gatheringData === 'string' ? gatheringData : 'Inariko';
  
  // If no target region specified, default to a different region
  if (!targetRegion) {
    const regions = ['Inariko', 'Rudania', 'Vhintl'];
    const currentIndex = regions.indexOf(currentRegion);
    // Default to next region in rotation
    targetRegion = regions[(currentIndex + 1) % regions.length];
  }
  
  return targetRegion;
}

function applyScholarHealingBoost(healingData) {
  // Both recover 1 stamina
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
  // Double loot quantity
  if (lootedItem && lootedItem.quantity) {
    lootedItem.quantity *= 2;
  }
  return lootedItem;
}

function applyScholarMountsBoost(environment) {
  // Return recommended action based on environment
  const recommendations = {
    'Tall Grass': 'Sneak',
    'Forest': 'Distract',
    'Mountain': 'Approach',
    'Water': 'Wait',
    'Cave': 'Sneak'
  };
  return recommendations[environment] || 'Approach';
}

function applyScholarStealingBoost(stolenItem) {
  // Add +1 extra item
  if (stolenItem && stolenItem.quantity) {
    stolenItem.quantity += 1;
  }
  return stolenItem;
}

function applyScholarTokensBoost(baseTokens) {
  return Math.floor(baseTokens * 1.5);
}

function applyScholarTravelingBoost(roadGathers) {
  // Add one extra gather result
  return roadGathers + 1;
}

function applyScholarVendingBoost(allInventories) {
  // Find rarest in-demand item
  const itemCounts = {};
  allInventories.forEach(inventory => {
    inventory.items.forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
    });
  });
  
  console.log(`[boostingModule.js] Scholar Vending Boost - Analyzing ${Object.keys(itemCounts).length} unique items`);
  
  // Find items with low global quantity but high crafting use
  const rareItems = Object.entries(itemCounts)
    .filter(([name, count]) => count <= 5) // Rare items
    .sort(([,a], [,b]) => a - b);
  
  console.log(`[boostingModule.js] Scholar Vending Boost - Found ${rareItems.length} rare items (count <= 5)`);
  
  if (rareItems.length > 0) {
    const recommendedItem = rareItems[0][0];
    console.log(`[boostingModule.js] Scholar Vending Boost - Recommending: ${recommendedItem} (count: ${rareItems[0][1]})`);
    return recommendedItem;
  }
  
  // If no rare items found, recommend the least common item available
  const sortedItems = Object.entries(itemCounts).sort(([,a], [,b]) => a - b);
  if (sortedItems.length > 0) {
    const fallbackItem = sortedItems[0][0];
    console.log(`[boostingModule.js] Scholar Vending Boost - No rare items found, recommending least common: ${fallbackItem} (count: ${sortedItems[0][1]})`);
    return fallbackItem;
  }
  
  console.log(`[boostingModule.js] Scholar Vending Boost - No items found to recommend`);
  return null;
}

// ------------------- Function to Get Boost Effect -------------------
// Retrieves a boost perk given a job and category. Returns null if not found.
function getBoostEffect(job, category) {
  // Normalize job name to match the keys in boostingEffects
  // Handle multi-word job names properly
  const normalizedJob = job.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
  
  const jobBoosts = boostingEffects[normalizedJob];
  if (!jobBoosts) return null;
  const boost = jobBoosts[category];
  return boost || null;
}

// ------------------- Function to Get Boost Effect by Character Name -------------------
// Retrieves a boost perk given a character name and category. Returns null if not found.
// This is a helper function for commands that have character names instead of job names.
async function getBoostEffectByCharacter(characterName, category) {
  try {
    const { fetchCharacterByName } = require('../database/db');
    const character = await fetchCharacterByName(characterName);
    if (!character) {
      console.error(`[boostingModule.js]: Error - Could not find character "${characterName}"`);
      return null;
    }
    return getBoostEffect(character.job, category);
  } catch (error) {
    console.error(`[boostingModule.js]: Error getting boost effect for character "${characterName}":`, error);
    return null;
  }
}

// ------------------- Function to Apply Boost Effect -------------------
// Applies the appropriate boost effect based on job and category
async function applyBoostEffect(job, category, data, additionalData = null) {
  console.log(`[boostingModule.js] applyBoostEffect called with job: "${job}", category: "${category}"`);
  
  // Check if the job parameter is actually a character name and get their job
  let actualJob = job;
  if (job && !boostingEffects[job]) {
    // This might be a character name, try to get their job
    try {
      const { fetchCharacterByName } = require('../database/db');
      const character = await fetchCharacterByName(job);
      if (character && character.job) {
        console.log(`[boostingModule.js] Resolved character "${job}" to job "${character.job}"`);
        actualJob = character.job;
      }
    } catch (error) {
      console.log(`[boostingModule.js] Could not resolve character "${job}" to job, using as-is`);
    }
  }
  
  // Handle multi-word job names properly
  const normalizedJob = actualJob.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
  
  console.log(`[boostingModule.js] Normalized job name: "${normalizedJob}"`);
  
  switch (normalizedJob) {
    case 'Fortune Teller':
      console.log(`[boostingModule.js] Applying Fortune Teller boost for category: ${category}`);
      switch (category) {
        case 'Crafting': return applyFortuneTellerCraftingBoost(data);
        case 'Gathering': return applyFortuneTellerGatheringBoost(data);
        case 'Stealing': return applyFortuneTellerStealingBoost(data);
        case 'Tokens': return applyFortuneTellerTokensBoost(data);
        case 'Traveling': return applyFortuneTellerTravelingBoost(data);
        default: 
          console.log(`[boostingModule.js] No Fortune Teller boost found for category: ${category}`);
          return data;
      }
    case 'Teacher':
      switch (category) {
        case 'Crafting': return applyTeacherCraftingBoost(data);
        case 'Exploring': return applyTeacherExploringBoost(data);
        case 'Gathering': return applyTeacherGatheringBoost(data);
        case 'Healers': return applyTeacherHealingBoost(data);
        case 'Looting': return applyTeacherLootingBoost(data);
        case 'Stealing': return applyTeacherStealingBoost(data);
        case 'Tokens': return applyTeacherTokensBoost(data);
        case 'Traveling': return applyTeacherTravelingBoost(data);
        case 'Vending': return applyTeacherVendingBoost(data);
        default: return data;
      }
    case 'Priest':
      switch (category) {
        case 'Crafting': return applyPriestCraftingBoost(data);
        case 'Exploring': return applyPriestExploringBoost(data);
        case 'Gathering': return await applyPriestGatheringBoost(data);
        case 'Healers': return applyPriestHealingBoost(data);
        case 'Looting': return applyPriestLootingBoost(data);
        case 'Stealing': return applyPriestStealingBoost(data);
        case 'Tokens': return applyPriestTokensBoost(data, additionalData);
        case 'Traveling': return applyPriestTravelingBoost(data);
        case 'Vending': return applyPriestVendingBoost(data);
        default: return data;
      }
    case 'Entertainer':
      switch (category) {
        case 'Crafting': return applyEntertainerCraftingBoost(data);
        case 'Gathering': return await applyEntertainerGatheringBoost(data);
        case 'Healers': return applyEntertainerHealingBoost(data, additionalData);
        case 'Looting': return applyEntertainerLootingBoost(data);
        case 'Mounts': return applyEntertainerMountsBoost(data);
        case 'Tokens': return applyEntertainerTokensBoost(data);
        case 'Traveling': return applyEntertainerTravelingBoost(data);
        case 'Vending': return applyEntertainerVendingBoost(data);
        default: return data;
      }
    case 'Scholar':
      switch (category) {
        case 'Crafting': return applyScholarCraftingBoost(data);
        case 'Exploring': return applyScholarExploringBoost(data);
        case 'Gathering': return applyScholarGatheringBoost(data, additionalData);
        case 'Healers': return applyScholarHealingBoost(data);
        case 'Looting': return applyScholarLootingBoost(data);
        case 'Mounts': return applyScholarMountsBoost(data);
        case 'Stealing': return applyScholarStealingBoost(data);
        case 'Tokens': return applyScholarTokensBoost(data);
        case 'Traveling': return applyScholarTravelingBoost(data);
        case 'Vending': return applyScholarVendingBoost(data);
        default: return data;
      }
    default:
      return data;
  }
}

// ------------------- Module Exports -------------------
// Exports the boosting effects and functions for use in other modules.
module.exports = {
  getBoostEffect,
  getBoostEffectByCharacter,
  applyBoostEffect,
  boostingEffects,
  // Individual boost functions for direct use
  applyFortuneTellerCraftingBoost,
  applyFortuneTellerGatheringBoost,
  applyFortuneTellerStealingBoost,
  applyFortuneTellerTokensBoost,
  applyFortuneTellerTravelingBoost,
  applyTeacherCraftingBoost,
  applyPriestCraftingBoost,
  applyPriestGatheringBoost,
  applyEntertainerCraftingBoost,
  applyEntertainerGatheringBoost,
  applyScholarCraftingBoost
};
  