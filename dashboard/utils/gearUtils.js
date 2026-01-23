// ============================================================================
// ------------------- Gear Utilities -------------------
// Shared functions for handling character gear setup and stat calculation
// ============================================================================

const { fetchItemByName } = require('../database/db');

/**
 * Get modifierHearts from stats (handles both Map and plain object)
 * @param {Map|Object|null} stats - Stats object or Map
 * @returns {number} - Modifier hearts value
 */
function getModifierHearts(stats) {
  if (!stats) return 0;
  
  // Handle Map
  if (stats instanceof Map) {
    return stats.get('modifierHearts') || 0;
  }
  
  // Handle plain object
  if (typeof stats === 'object') {
    return stats.modifierHearts || 0;
  }
  
  return 0;
}

/**
 * Setup gear from starter item names
 * @param {Object} gearData - Object with starterWeapon, starterShield, starterArmorChest, starterArmorLegs
 * @returns {Promise<Object>} - Object with gearWeapon, gearShield, gearArmor
 */
async function setupGearFromItems(gearData) {
  const { starterWeapon, starterShield, starterArmorChest, starterArmorLegs } = gearData;
  
  let gearWeapon = null;
  let gearShield = null;
  let gearArmor = {
    head: null,
    chest: null,
    legs: null
  };
  
  if (starterWeapon) {
    const weaponItem = await fetchItemByName(starterWeapon);
    if (weaponItem) {
      gearWeapon = {
        name: weaponItem.itemName,
        stats: { modifierHearts: weaponItem.modifierHearts || 0 },
        type: Array.isArray(weaponItem.type) ? weaponItem.type[0] : weaponItem.type || null
      };
    }
  }
  
  if (starterShield) {
    const shieldItem = await fetchItemByName(starterShield);
    if (shieldItem) {
      gearShield = {
        name: shieldItem.itemName,
        stats: { modifierHearts: shieldItem.modifierHearts || 0 },
        subtype: Array.isArray(shieldItem.subtype) ? shieldItem.subtype[0] : shieldItem.subtype || null
      };
    }
  }
  
  if (starterArmorChest) {
    const chestItem = await fetchItemByName(starterArmorChest);
    if (chestItem) {
      gearArmor.chest = {
        name: chestItem.itemName,
        stats: { modifierHearts: chestItem.modifierHearts || 0 }
      };
    }
  }
  
  if (starterArmorLegs) {
    const legsItem = await fetchItemByName(starterArmorLegs);
    if (legsItem) {
      gearArmor.legs = {
        name: legsItem.itemName,
        stats: { modifierHearts: legsItem.modifierHearts || 0 }
      };
    }
  }
  
  return {
    gearWeapon,
    gearShield,
    gearArmor
  };
}

/**
 * Update gear from item names (for editing)
 * @param {Object} currentGear - Current gear object
 * @param {Object} gearData - Object with starterWeapon, starterShield, starterArmorChest, starterArmorLegs
 * @returns {Promise<Object>} - Updated gear object
 */
async function updateGearFromItems(currentGear, gearData) {
  const { starterWeapon, starterShield, starterArmorChest, starterArmorLegs } = gearData;
  
  let gearWeapon = currentGear.gearWeapon || null;
  let gearShield = currentGear.gearShield || null;
  let gearArmor = currentGear.gearArmor || {
    head: null,
    chest: null,
    legs: null
  };
  
  if (starterWeapon !== undefined) {
    if (starterWeapon) {
      const weaponItem = await fetchItemByName(starterWeapon);
      if (weaponItem) {
        gearWeapon = {
          name: weaponItem.itemName,
          stats: { modifierHearts: weaponItem.modifierHearts || 0 },
          type: Array.isArray(weaponItem.type) ? weaponItem.type[0] : weaponItem.type || null
        };
      }
    } else {
      gearWeapon = null;
    }
  }
  
  if (starterShield !== undefined) {
    if (starterShield) {
      const shieldItem = await fetchItemByName(starterShield);
      if (shieldItem) {
        gearShield = {
          name: shieldItem.itemName,
          stats: { modifierHearts: shieldItem.modifierHearts || 0 },
          subtype: Array.isArray(shieldItem.subtype) ? shieldItem.subtype[0] : shieldItem.subtype || null
        };
      }
    } else {
      gearShield = null;
    }
  }
  
  if (starterArmorChest !== undefined) {
    if (starterArmorChest) {
      const chestItem = await fetchItemByName(starterArmorChest);
      if (chestItem) {
        gearArmor.chest = {
          name: chestItem.itemName,
          stats: { modifierHearts: chestItem.modifierHearts || 0 }
        };
      }
    } else {
      gearArmor.chest = null;
    }
  }
  
  if (starterArmorLegs !== undefined) {
    if (starterArmorLegs) {
      const legsItem = await fetchItemByName(starterArmorLegs);
      if (legsItem) {
        gearArmor.legs = {
          name: legsItem.itemName,
          stats: { modifierHearts: legsItem.modifierHearts || 0 }
        };
      }
    } else {
      gearArmor.legs = null;
    }
  }
  
  return {
    gearWeapon,
    gearShield,
    gearArmor
  };
}

/**
 * Calculate character stats from gear
 * @param {Object} gear - Gear object with gearWeapon, gearShield, gearArmor
 * @returns {{attack: number, defense: number}} - Calculated stats
 */
function calculateGearStats(gear) {
  const { gearWeapon, gearShield, gearArmor } = gear;
  
  // Calculate defense from armor and shield
  let totalDefense = 0;
  if (gearArmor) {
    totalDefense += getModifierHearts(gearArmor.head?.stats);
    totalDefense += getModifierHearts(gearArmor.chest?.stats);
    totalDefense += getModifierHearts(gearArmor.legs?.stats);
  }
  if (gearShield?.stats) {
    totalDefense += getModifierHearts(gearShield.stats);
  }
  
  // Calculate attack from weapon
  const totalAttack = getModifierHearts(gearWeapon?.stats);
  
  return {
    attack: totalAttack,
    defense: totalDefense
  };
}

module.exports = {
  getModifierHearts,
  setupGearFromItems,
  updateGearFromItems,
  calculateGearStats
};
