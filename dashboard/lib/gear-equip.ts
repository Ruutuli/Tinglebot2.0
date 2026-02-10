// ============================================================================
// ------------------- Gear Equipping Logic -------------------
// Handles weapon/shield/armor equipping with conflict resolution
// ============================================================================

export type WeaponType = "1h" | "2h" | "bow";
export type ArmorSlot = "head" | "chest" | "legs";
export type GearSlot = "weapon" | "shield" | ArmorSlot;

export type ItemData = {
  _id: unknown;
  itemName?: string;
  categoryGear?: string;
  type?: string[];
  subtype?: string[];
  modifierHearts?: number;
};

export type EquippedGear = {
  gearWeapon?: { name: string; stats: Map<string, number> | Record<string, number> };
  gearShield?: { name: string; stats: Map<string, number> | Record<string, number> };
  gearArmor?: {
    head?: { name: string; stats: Map<string, number> | Record<string, number> };
    chest?: { name: string; stats: Map<string, number> | Record<string, number> };
    legs?: { name: string; stats: Map<string, number> | Record<string, number> };
  };
};

/**
 * Determine weapon type from item data
 * Checks the 'type' array for "1h", "2h", or "Bow"
 * Only returns a type if categoryGear is "Weapon"
 */
export function getWeaponType(item: ItemData): WeaponType | null {
  const category = (item.categoryGear || "").toLowerCase();
  if (category !== "weapon") return null;
  
  const types = (item.type || []).map(t => String(t).toLowerCase());
  const subtypes = (item.subtype || []).map(s => String(s).toLowerCase());
  
  // Check for bow in subtype or type
  if (subtypes.some(s => s.includes("bow")) || types.some(t => t.includes("bow"))) {
    return "bow";
  }
  
  // Check for 2h
  if (types.some(t => t === "2h" || t.includes("2h"))) {
    return "2h";
  }
  
  // Check for 1h
  if (types.some(t => t === "1h" || t.includes("1h"))) {
    return "1h";
  }
  
  return null;
}

/**
 * Check if item is a weapon
 */
export function isWeapon(item: ItemData): boolean {
  const category = (item.categoryGear || "").toLowerCase();
  return category === "weapon" || getWeaponType(item) !== null;
}

/**
 * Check if item is a shield
 */
export function isShield(item: ItemData): boolean {
  const category = (item.categoryGear || "").toLowerCase();
  const subtypes = (item.subtype || []).map(s => String(s).toLowerCase());
  return category === "shield" || subtypes.some(s => s.includes("shield"));
}

/**
 * Check if item is armor and get its slot
 */
export function getArmorSlot(item: ItemData): ArmorSlot | null {
  const category = (item.categoryGear || "").toLowerCase();
  if (category !== "armor") return null;
  
  const types = (item.type || []).map(t => String(t).toLowerCase());
  
  if (types.some(t => t === "head")) return "head";
  if (types.some(t => t === "chest")) return "chest";
  if (types.some(t => t === "legs")) return "legs";
  
  return null;
}

export type GearSlotsForNormalize = {
  gearWeapon?: { name: string; stats: Map<string, number> | Record<string, number> } | null;
  gearShield?: { name: string; stats: Map<string, number> | Record<string, number> } | null;
};

export type GetItemByName = (
  name: string
) => Promise<{ categoryGear?: string; type?: string[]; subtype?: string[] } | null>;

/**
 * Normalize gear so weapon slot never contains a shield and shield slot never contains a weapon.
 * Mutates and returns the same gear object. Call before persisting character gear.
 */
export async function normalizeGearSlots(
  gear: GearSlotsForNormalize,
  getItemByName: GetItemByName
): Promise<GearSlotsForNormalize> {
  if (gear.gearWeapon?.name) {
    const doc = await getItemByName(gear.gearWeapon.name);
    if (doc && isShield(doc)) {
      if (!gear.gearShield) {
        gear.gearShield = { name: gear.gearWeapon.name, stats: gear.gearWeapon.stats };
      }
      gear.gearWeapon = undefined;
    }
  }
  if (gear.gearShield?.name) {
    const doc = await getItemByName(gear.gearShield.name);
    if (doc && getWeaponType(doc) !== null) {
      gear.gearShield = undefined;
    }
  }
  return gear;
}

/**
 * Equip an item, handling all conflict rules
 * Returns updated gear object
 * 
 * @param item - The item to equip
 * @param currentGear - Current equipped gear
 * @param currentWeaponItem - Optional: The item data for currently equipped weapon (needed to check if it's 2H/bow when equipping shield)
 */
export function equipItem(
  item: ItemData,
  currentGear: EquippedGear,
  currentWeaponItem?: ItemData
): EquippedGear {
  const newGear = { ...currentGear };
  
  // Deep copy gearArmor if it exists
  if (currentGear.gearArmor) {
    newGear.gearArmor = { ...currentGear.gearArmor };
  } else {
    newGear.gearArmor = {};
  }
  
  const weaponType = getWeaponType(item);
  const armorSlot = getArmorSlot(item);
  const itemName = item.itemName || "Unknown";
  const modifierHearts = item.modifierHearts || 0;
  
  // Handle weapon equipping
  if (weaponType) {
    // For weapons, modifierHearts = attack (stored as modifierHearts for consistency with bot)
    const stats = new Map<string, number>([["modifierHearts", modifierHearts]]);
    // Equip the weapon
    newGear.gearWeapon = { name: itemName, stats };
    
    // Auto-unequip conflicts
    if (weaponType === "2h" || weaponType === "bow") {
      // 2H weapons and bows use both hands - unequip shield
      delete newGear.gearShield;
    }
    
    if (weaponType === "1h") {
      // 1H weapon replaces 2H weapon (already handled by setting gearWeapon)
      // Shield can stay equipped
    }
    
    // Bows replace melee weapons (already handled by setting gearWeapon)
  }
  
  // Handle shield equipping
  if (isShield(item)) {
    // For shields, modifierHearts = defense (stored as modifierHearts for consistency with bot)
    const stats = new Map<string, number>([["modifierHearts", modifierHearts]]);
    // Equip the shield
    newGear.gearShield = { name: itemName, stats };
    
    // Auto-unequip conflicts
    // If we have the current weapon item data, check its type
    if (currentWeaponItem) {
      const currentWeaponType = getWeaponType(currentWeaponItem);
      // If current weapon is 2H or bow, unequip it
      if (currentWeaponType === "2h" || currentWeaponType === "bow") {
        delete newGear.gearWeapon;
      }
    }
    // Note: If currentWeaponItem is not provided, we can't determine weapon type
    // The caller should provide it when equipping shields
  }
  
  // Handle armor equipping
  if (armorSlot) {
    // For armor, modifierHearts = defense (stored as modifierHearts for consistency with bot)
    const stats = new Map<string, number>([["modifierHearts", modifierHearts]]);
    // Equip armor in the specific slot (replaces previous item in that slot)
    newGear.gearArmor![armorSlot] = { name: itemName, stats };
  }
  
  return newGear;
}

/**
 * Helper function to get modifierHearts from stats (handles both Map and plain object)
 */
function getModifierHearts(stats: Map<string, number> | Record<string, number> | undefined): number {
  if (!stats) return 0;
  
  // Handle Map objects
  if (stats instanceof Map) {
    // Try "modifierHearts" first (actual storage format)
    const modHearts = stats.get("modifierHearts");
    if (modHearts != null) return modHearts;
    // Fallback to "attack" or "defense" for backward compatibility
    return stats.get("attack") || stats.get("defense") || 0;
  }
  
  // Handle plain objects
  if (typeof stats === "object" && stats !== null) {
    // Try "modifierHearts" first (actual storage format)
    if ("modifierHearts" in stats) {
      const value = (stats as Record<string, unknown>).modifierHearts;
      return typeof value === "number" ? value : 0;
    }
    // Fallback to "attack" or "defense" for backward compatibility
    const attack = (stats as Record<string, unknown>).attack;
    const defense = (stats as Record<string, unknown>).defense;
    if (typeof attack === "number") return attack;
    if (typeof defense === "number") return defense;
  }
  
  return 0;
}

/**
 * Calculate total attack from equipped gear
 * Attack = weapon's modifierHearts value
 */
export function calculateAttack(gear: EquippedGear): number {
  if (!gear.gearWeapon) return 0;
  return getModifierHearts(gear.gearWeapon.stats);
}

/**
 * Calculate total defense from equipped gear
 * Defense = Head + Chest + Legs + Shield modifierHearts values
 */
export function calculateDefense(gear: EquippedGear): number {
  let defense = 0;
  
  if (gear.gearArmor?.head) {
    defense += getModifierHearts(gear.gearArmor.head.stats);
  }
  
  if (gear.gearArmor?.chest) {
    defense += getModifierHearts(gear.gearArmor.chest.stats);
  }
  
  if (gear.gearArmor?.legs) {
    defense += getModifierHearts(gear.gearArmor.legs.stats);
  }
  
  if (gear.gearShield) {
    defense += getModifierHearts(gear.gearShield.stats);
  }
  
  return defense;
}

/**
 * Recalculate and update attack/defense stats on a character document
 * This should be called after any gear changes
 */
export function recalculateStats(character: {
  gearWeapon?: { name: string; stats: Map<string, number> | Record<string, number> };
  gearShield?: { name: string; stats: Map<string, number> | Record<string, number> };
  gearArmor?: {
    head?: { name: string; stats: Map<string, number> | Record<string, number> };
    chest?: { name: string; stats: Map<string, number> | Record<string, number> };
    legs?: { name: string; stats: Map<string, number> | Record<string, number> };
  };
  attack?: number;
  defense?: number;
}): void {
  const gear: EquippedGear = {
    gearWeapon: character.gearWeapon,
    gearShield: character.gearShield,
    gearArmor: character.gearArmor,
  };
  
  character.attack = calculateAttack(gear);
  character.defense = calculateDefense(gear);
}

/**
 * Validate if an item can be equipped with current gear
 * Returns error message if not, null if valid
 * 
 * @param item - The item to equip
 * @param currentGear - Current equipped gear
 * @param currentWeaponItem - Optional: The item data for currently equipped weapon (needed to check if it's 2H/bow when equipping shield)
 */
export function validateEquip(
  item: ItemData,
  currentGear: EquippedGear,
  currentWeaponItem?: ItemData
): string | null {
  const weaponType = getWeaponType(item);
  
  // Check weapon + shield conflicts
  if (weaponType === "2h" && currentGear.gearShield) {
    // This is handled by auto-unequip, but we can warn
    return null; // Will auto-unequip shield
  }
  
  if (weaponType === "bow" && currentGear.gearShield) {
    // This is handled by auto-unequip, but we can warn
    return null; // Will auto-unequip shield
  }
  
  if (isShield(item)) {
    // If we have the current weapon item data, check its type
    if (currentWeaponItem) {
      const currentWeaponType = getWeaponType(currentWeaponItem);
      if (currentWeaponType === "2h" || currentWeaponType === "bow") {
        // This is handled by auto-unequip
        return null; // Will auto-unequip weapon
      }
    }
    // If we don't have the weapon item data, we can't validate, but it's still valid
    // (the equipItem function will handle it)
  }
  
  return null; // Valid
}
