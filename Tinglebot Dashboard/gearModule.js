// ------------------- gearModule.js -------------------
// This module handles classification and analysis of gear data,
// including weapon type, mod levels, and flurry thresholds.

// ============================================================================
// Identify gear type from item categoryGear or category
function getGearType(item) {
  const category = item.categoryGear || (item.category && item.category[0]);
  if (!category) return null;

  const normalized = category.toLowerCase();
  if (normalized === 'weapon') return 'weapon';
  if (normalized === 'shield') return 'shield';
  if (['armor', 'head', 'chest', 'legs'].includes(normalized)) return 'armor';

  return null;
}

// ============================================================================
// Determine weapon style from type array
function getWeaponStyle(item) {
  if (!item || !item.type) return null;

  const typeArray = Array.isArray(item.type) ? item.type : [item.type];
  if (!typeArray.length) return null;

  const types = typeArray
    .filter(Boolean)
    .map((t) => String(t).toLowerCase());
  if (types.includes('2h')) return '2h';
  if (types.includes('bow')) return 'bow';
  if (types.includes('1h')) return '1h';
  return null;
}

// ============================================================================
// Get gear modifier level (mod level)
// NEW FUNCTION: Returns the modifier level from the item’s modifierHearts property.
function getGearModLevel(item) {
  if (!item || !item.stats) return 0;
  if (typeof item.stats.get === 'function') {
    const value = item.stats.get("modifierHearts");
    return typeof value === "number" ? value : 0;
  } else {
    return typeof item.stats.modifierHearts === 'number' ? item.stats.modifierHearts : 0;
  }
}

// ============================================================================
// Get flurry rush crit thresholds based on weapon style
function getFlurryThresholds(style) {
  switch (style) {
    case '1h': return [6];                // d6 crits on 6
    case '2h': return [11, 12];           // 2d6 crits on high rolls
    case 'bow': return [20, 21, 22, 23, 24]; // high-end multi-die crits
    default: return [];
  }
}

// ============================================================================
// Exports
module.exports = {
  getGearType,
  getWeaponStyle,
  getGearModLevel,
  getFlurryThresholds
};
