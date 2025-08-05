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
        description: 'While boosted, rare items (Rarity 8–10) have a significantly higher chance to be gathered.'
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
        description: 'Double the amount of any item found during exploration, if it’s a non-combat result.'
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
        description: 'After exploring, instantly return to your current village’s plaza via magical performance.'
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
        name: 'Epona’s Song',
        description: 'You’re more likely to tame a mount that fits the local region\'s style, folklore, or wildlife.'
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
        description: 'Gather from another village’s item table without leaving your current location.'
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
        description: 'Gain one extra road gather result during the journey thanks to Scholar’s guidance.'
      },
      // ------------------- Vending -------------------
      Vending: {
        name: 'Demand Forecast',
        description: 'When boosted, the vendor receives a recommendation for 1 item that is rare across all player inventories — ideal for stocking.'
      }
    }
  };
  
  // ------------------- Function to Get Boost Effect -------------------
  // Retrieves a boost perk given a job and category. Returns null if not found.
  function getBoostEffect(job, category) {
    // Normalize job name to match the keys in boostingEffects
    const normalizedJob = job.charAt(0).toUpperCase() + job.slice(1).toLowerCase();
    const jobBoosts = boostingEffects[normalizedJob];
    if (!jobBoosts) return null;
    const boost = jobBoosts[category];
    return boost || null;
  }
  
  // ------------------- Module Exports -------------------
  // Exports the boosting effects and function for use in other modules.
  module.exports = {
    getBoostEffect,
    boostingEffects
  };
  