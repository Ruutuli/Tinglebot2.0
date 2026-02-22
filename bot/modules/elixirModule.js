// ------------------- elixirModule.js -------------------
// This module manages the Breath of the Wild elixir system, including buff effects,
// and integration with existing game systems. Elixirs now work like job vouchers -
// they last until their effects are used in relevant activities.

// ============================================================================
// ------------------- Elixir Definitions -------------------
// ============================================================================

const ELIXIR_EFFECTS = {
  'Chilly Elixir': {
    type: 'chilly',
    description: 'Provides resistance to water attacks and reduces blight rain infection chance',
    effects: {
      waterResistance: 1.5,
      blightResistance: 1
    }
  },
  'Spicy Elixir': {
    type: 'spicy',
    description: 'Provides resistance to cold attacks from ice enemies',
    effects: {
      coldResistance: 1.5
    }
  },
  'Fireproof Elixir': {
    type: 'fireproof',
    description: 'Provides fire resistance against fire enemies',
    effects: {
      fireResistance: 1.5
    }
  },
  'Electro Elixir': {
    type: 'electro',
    description: 'Provides resistance to electrical attacks from electric enemies',
    effects: {
      electricResistance: 1.5
    }
  },
  'Enduring Elixir': {
    type: 'enduring',
    description: 'Temporarily extends stamina wheel by +1',
    effects: {
      staminaBoost: 1 // Adds +1 temporary stamina on top of max
    }
  },
  'Energizing Elixir': {
    type: 'energizing',
    description: 'Restores stamina for physical actions',
    effects: {
      staminaRecovery: 2
    }
  },
  'Hasty Elixir': {
    type: 'hasty',
    description: 'Cuts travel time in half',
    effects: {
      speedBoost: 1
    }
  },
  'Hearty Elixir': {
    type: 'hearty',
    description: 'Restores health and adds +3 temporary hearts',
    effects: {
      extraHearts: 3
    }
  },
  'Mighty Elixir': {
    type: 'mighty',
    description: 'Boosts attack power',
    effects: {
      attackBoost: 1.5
    }
  },
  'Tough Elixir': {
    type: 'tough',
    description: 'Boosts defense',
    effects: {
      defenseBoost: 1.5
    }
  },
  'Sneaky Elixir': {
    type: 'sneaky',
    description: 'Increases stealth ability for gathering, looting, and travel encounters, and boosts flee chance',
    effects: {
      stealthBoost: 1,
      fleeBoost: 1
    }
  }
};


// ============================================================================
// ------------------- Core Functions -------------------
// ============================================================================

// ------------------- Apply Elixir Buff -------------------
// Applies an elixir buff to a character
const applyElixirBuff = (character, elixirName) => {
  const elixir = ELIXIR_EFFECTS[elixirName];
  if (!elixir) {
    throw new Error(`Unknown elixir: ${elixirName}`);
  }

  // Update character buff - no levels or duration, just static effects
  character.buff = {
    active: true,
    type: elixir.type,
    effects: elixir.effects
  };

  // Apply immediate effects
  applyImmediateEffects(character, elixirName);

  return character;
};

// ------------------- Apply Immediate Effects -------------------
// Applies immediate effects when elixir is consumed
// Note: Most immediate effects are now handled by the database item consumption system
const applyImmediateEffects = (character, elixirName) => {
  const elixir = ELIXIR_EFFECTS[elixirName];
  
  switch (elixirName) {
    case 'Energizing Elixir':
      // Restore stamina when consumed
      if (elixir && elixir.effects && elixir.effects.staminaRecovery) {
        const staminaToRestore = elixir.effects.staminaRecovery;
        const previousStamina = character.currentStamina || 0;
        character.currentStamina = Math.min(
          character.maxStamina || 3, 
          previousStamina + staminaToRestore
        );
        console.log(`[elixirModule.js]: ⚡ Energizing Elixir restored ${staminaToRestore} stamina for ${character.name} (${previousStamina} → ${character.currentStamina})`);
      }
      break;
      
    case 'Enduring Elixir':
      // Temporarily extend stamina wheel
      if (elixir && elixir.effects && elixir.effects.staminaBoost) {
        const staminaBoost = elixir.effects.staminaBoost;
        character.maxStamina = (character.maxStamina || 3) + staminaBoost;
        character.currentStamina = (character.currentStamina || 0) + staminaBoost;
        console.log(`[elixirModule.js]: 🏃 Enduring Elixir extended stamina by +${staminaBoost} for ${character.name}`);
      }
      break;
      
    case 'Hearty Elixir':
      // Add extra temporary hearts
      if (elixir && elixir.effects && elixir.effects.extraHearts) {
        const extraHearts = elixir.effects.extraHearts;
        character.maxHearts = (character.maxHearts || 3) + extraHearts;
        character.currentHearts = (character.currentHearts || 3) + extraHearts;
        console.log(`[elixirModule.js]: ❤️ Hearty Elixir added +${extraHearts} temporary hearts for ${character.name}`);
      }
      break;
      
    default:
      // Other elixirs don't have immediate effects - they apply during activities
      break;
  }
};

// ------------------- Check if Elixir Should Be Consumed -------------------
// Checks if an elixir effect should be consumed based on the activity
const shouldConsumeElixir = (character, activity, context = {}) => {
  if (!character.buff?.active) return false;
  
  const buffType = character.buff.type;
  
  switch (buffType) {
    case 'chilly':
      // Consume when encountering water/wet enemies
      return activity === 'combat' && context.monster?.name?.includes('Water') ||
             activity === 'helpWanted' && context.monster?.name?.includes('Water') ||
             activity === 'raid' && context.monster?.name?.includes('Water') ||
             activity === 'loot' && context.monster?.name?.includes('Water');
      
    case 'electro':
      // Consume when encountering electric enemies
      return activity === 'combat' && context.monster?.name?.includes('Electric') ||
             activity === 'helpWanted' && context.monster?.name?.includes('Electric') ||
             activity === 'raid' && context.monster?.name?.includes('Electric') ||
             activity === 'loot' && context.monster?.name?.includes('Electric');
      
    case 'enduring':
      // Consume when using stamina for movement or actions
      return activity === 'travel' || activity === 'gather' || activity === 'loot';
      
    case 'energizing':
      // Consume when performing physical actions
      return activity === 'gather' || activity === 'loot' || activity === 'crafting';
      
    case 'fireproof':
      // Consume when encountering fire enemies
      return activity === 'combat' && context.monster?.name?.includes('Fire') ||
             activity === 'helpWanted' && context.monster?.name?.includes('Fire') ||
             activity === 'raid' && context.monster?.name?.includes('Fire') ||
             activity === 'loot' && context.monster?.name?.includes('Fire');
      
    case 'hasty':
      // Consume when moving or traveling
      return activity === 'travel';
      
    case 'hearty':
      // Consume when taking damage or in combat
      return activity === 'combat' || activity === 'helpWanted' || activity === 'raid';
      
    case 'mighty':
      // Consume when attacking
      return activity === 'combat' || activity === 'helpWanted' || activity === 'raid' || activity === 'loot';
      
    case 'sneaky':
      // Consume when gathering, looting, or traveling (stealth helps avoid encounters)
      return activity === 'gather' || activity === 'loot' || activity === 'travel';
      
    case 'spicy':
      // Consume when encountering ice monsters
      return (activity === 'combat' && context.monster?.name?.includes('Ice')) ||
             (activity === 'helpWanted' && context.monster?.name?.includes('Ice')) ||
             (activity === 'raid' && context.monster?.name?.includes('Ice')) ||
             (activity === 'loot' && context.monster?.name?.includes('Ice'));
      
    case 'tough':
      // Consume when taking damage
      return activity === 'combat' || activity === 'helpWanted' || activity === 'raid' || activity === 'loot';
      
    default:
      return false;
  }
};

// ------------------- Consume Elixir Buff -------------------
// Consumes an elixir buff when its effects are used
const consumeElixirBuff = (character) => {
  if (!character.buff?.active) return false;
  
  // Remove temporary hearts from Hearty Elixir
  if (character.buff.type === 'hearty' && character.buff.effects.extraHearts > 0) {
    character.currentHearts = Math.max(character.maxHearts, character.currentHearts - character.buff.effects.extraHearts);
  }
  
  // Remove temporary stamina boost from Enduring Elixir
  if (character.buff.type === 'enduring' && character.buff.effects.staminaBoost > 0) {
    // Reduce maxStamina back to original value
    character.maxStamina = Math.max(1, character.maxStamina - character.buff.effects.staminaBoost);
    // Ensure currentStamina doesn't exceed the new maxStamina
    character.currentStamina = Math.min(character.currentStamina, character.maxStamina);
  }
  
  // Reset buff
  character.buff = {
    active: false,
    type: null,
    effects: {
      blightResistance: 0,
      electricResistance: 0,
      staminaBoost: 0,
      staminaRecovery: 0,
      fireResistance: 0,
      speedBoost: 0,
      extraHearts: 0,
      attackBoost: 0,
      stealthBoost: 0,
      fleeBoost: 0,
      coldResistance: 0,
      iceEffectiveness: 0,
      defenseBoost: 0,
      waterResistance: 0
    }
  };
  
  return true; // Buff was consumed
};

// ------------------- Remove Expired Buffs -------------------
// Legacy function - now just checks if buff is active
// Elixirs no longer expire by time
const removeExpiredBuffs = (character) => {
  // Elixirs no longer expire by time - they must be consumed
  return false;
};

// ------------------- Get Active Buff Effects -------------------
// Returns the current active buff effects for a character
const getActiveBuffEffects = (character) => {
  if (!character.buff?.active) {
    return null;
  }
  return character.buff.effects;
};

// ------------------- Check Buff Status -------------------
// Checks if a character has a specific type of buff active
const hasBuffType = (character, buffType) => {
  return character.buff?.active && character.buff.type === buffType;
};

// ------------------- Get Buff Duration -------------------
// Returns remaining buff duration - now always returns "Until Used"
const getBuffDuration = (character) => {
  if (!character.buff?.active) {
    return 0;
  }
  return 'Until Used'; // Elixirs now last until consumed
};

// ------------------- Calculate Buffed Stats -------------------
// Calculates character stats with active buffs applied
const calculateBuffedStats = (character) => {
  const stats = {
    attack: character.attack || 0,
    defense: character.defense || 0,
    currentHearts: character.currentHearts || 0,
    maxHearts: character.maxHearts || 0,
    currentStamina: character.currentStamina || 0,
    maxStamina: character.maxStamina || 0
  };

  if (character.buff?.active) {
    const effects = character.buff.effects;
    
    // Apply attack boost
    if (effects.attackBoost > 0) {
      stats.attack += effects.attackBoost;
    }
    
    // Apply defense boost
    if (effects.defenseBoost > 0) {
      stats.defense += effects.defenseBoost;
    }
    
    // Apply stamina boost
    if (effects.staminaBoost > 0) {
      stats.maxStamina += effects.staminaBoost;
      // Note: staminaBoost only affects maxStamina, not currentStamina
      // This creates the "temporary extra stamina" effect
    }
    
    // Apply extra hearts
    if (effects.extraHearts > 0) {
      stats.maxHearts += effects.extraHearts;
      stats.currentHearts += effects.extraHearts;
    }
  }

  return stats;
};

// ------------------- Get Elixir Info -------------------
// Returns information about a specific elixir
const getElixirInfo = (elixirName) => {
  return ELIXIR_EFFECTS[elixirName] || null;
};

// ------------------- Get All Elixir Types -------------------
// Returns all available elixir types
const getAllElixirTypes = () => {
  return Object.keys(ELIXIR_EFFECTS);
};

// ------------------- Get Monster Element -------------------
// Determines a monster's element from its element field or name
const getMonsterElement = (monster) => {
  if (!monster) return 'none';
  
  // First check the element field on the monster
  if (monster.element && monster.element !== 'none') {
    return monster.element;
  }
  
  // Fallback to name-based detection for backwards compatibility
  const name = monster.name || '';
  
  // Fire elements
  if (/fire|igneo|meteo/i.test(name)) return 'fire';
  
  // Ice elements
  if (/ice|frost|blizzard|snow/i.test(name)) return 'ice';
  
  // Electric elements
  if (/electric|thunder/i.test(name)) return 'electric';
  
  // Water elements
  if (/water/i.test(name)) return 'water';
  
  // Earth elements
  if (/stone|rock|moldug/i.test(name)) return 'earth';
  
  // Undead elements
  if (/cursed|stal(?!k)|gloom|gibdo/i.test(name)) return 'undead';
  
  // Wind elements
  if (/sky|forest/i.test(name)) return 'wind';
  
  return 'none';
};

// ------------------- Get Resistance For Element -------------------
// Maps element types to the resistance buff needed to counter them
const getResistanceForElement = (element) => {
  switch (element) {
    case 'fire': return 'fireResistance';
    case 'ice': return 'coldResistance';
    case 'electric': return 'electricResistance';
    case 'water': return 'waterResistance';
    case 'earth': return null; // No elixir currently counters earth
    case 'undead': return 'blightResistance'; // Chilly elixir provides some undead resistance
    case 'wind': return null; // No elixir currently counters wind
    default: return null;
  }
};

// ------------------- Check Elixir Counters Element -------------------
// Checks if character's active elixir provides resistance against a monster's element
const elixirCountersMonster = (character, monster) => {
  const buffEffects = getActiveBuffEffects(character);
  if (!buffEffects) return false;
  
  const monsterElement = getMonsterElement(monster);
  const resistanceKey = getResistanceForElement(monsterElement);
  
  if (!resistanceKey) return false;
  
  return buffEffects[resistanceKey] > 0;
};

// ============================================================================
// ------------------- Elemental Combat System -------------------
// ============================================================================

// Elemental advantage matrix: element -> list of elements it's strong against
const ELEMENTAL_ADVANTAGES = {
  fire: ['ice', 'wind'],           // Fire melts ice, burns through wind
  ice: ['water', 'electric'],      // Ice freezes water, insulates electricity
  electric: ['water', 'wind'],     // Electric shocks water, disrupts wind
  water: ['fire', 'earth'],        // Water extinguishes fire, erodes earth
  wind: ['earth', 'undead'],       // Wind scatters earth, blows away undead
  earth: ['electric', 'fire'],     // Earth grounds electric, smothers fire
  undead: ['ice', 'water'],        // Undead resist cold, function in water
  light: ['undead'],               // Light banishes undead
  tech: ['earth', 'wind'],         // Tech overcomes nature
};

// Elemental weakness matrix: element -> list of elements it's weak to
const ELEMENTAL_WEAKNESSES = {
  fire: ['water', 'earth'],
  ice: ['fire'],
  electric: ['earth'],
  water: ['electric', 'ice'],
  wind: ['fire', 'electric'],
  earth: ['water', 'wind'],
  undead: ['light', 'fire', 'wind'],
  light: [],  // Light has no elemental weaknesses
  tech: ['electric', 'water'],
};

// Roll bonus percentages
const ELEMENTAL_ADVANTAGE_BONUS = 0.15;   // +15% roll bonus when weapon is strong vs monster
const ELEMENTAL_WEAKNESS_PENALTY = 0.10;  // -10% roll penalty when weapon is weak vs monster

// ------------------- Get Weapon Element -------------------
// Extracts element from a weapon item (checks element field or falls back to name)
const getWeaponElement = (weapon) => {
  if (!weapon) return 'none';
  
  // Check the element field first
  if (weapon.element && weapon.element !== 'none') {
    return weapon.element;
  }
  
  // Fallback to name-based detection
  const name = weapon.name || weapon.itemName || '';
  
  if (/fire|flame|igneo|meteo|volcanic|blazing|inferno|ember/i.test(name)) return 'fire';
  if (/ice|frost|frozen|blizzard|glacial|frigid|snow|cold/i.test(name)) return 'ice';
  if (/electric|thunder|lightning|shock|volt|storm/i.test(name)) return 'electric';
  if (/water|aqua|ocean|sea|tidal/i.test(name)) return 'water';
  if (/wind|gust|cyclone|tornado|aerial/i.test(name)) return 'wind';
  if (/stone|rock|earth|boulder|quake/i.test(name)) return 'earth';
  if (/cursed|dark|shadow|gloom|demon/i.test(name)) return 'undead';
  if (/light|radiant|luminous|divine|holy|sacred/i.test(name)) return 'light';
  if (/ancient|sheikah|guardian/i.test(name)) return 'tech';
  
  return 'none';
};

// ------------------- Check Elemental Advantage -------------------
// Returns the advantage relationship between weapon and monster elements
const getElementalAdvantage = (weaponElement, monsterElement) => {
  if (weaponElement === 'none' || monsterElement === 'none') {
    return { hasAdvantage: false, hasDisadvantage: false, bonus: 0 };
  }
  
  const advantages = ELEMENTAL_ADVANTAGES[weaponElement] || [];
  const weaknesses = ELEMENTAL_WEAKNESSES[weaponElement] || [];
  
  if (advantages.includes(monsterElement)) {
    return { 
      hasAdvantage: true, 
      hasDisadvantage: false, 
      bonus: ELEMENTAL_ADVANTAGE_BONUS 
    };
  }
  
  if (weaknesses.includes(monsterElement)) {
    return { 
      hasAdvantage: false, 
      hasDisadvantage: true, 
      bonus: -ELEMENTAL_WEAKNESS_PENALTY 
    };
  }
  
  return { hasAdvantage: false, hasDisadvantage: false, bonus: 0 };
};

// ------------------- Calculate Elemental Combat Bonus -------------------
// Main function to calculate combat bonus based on weapon vs monster elements
const calculateElementalCombatBonus = (character, monster) => {
  const weapon = character?.gearWeapon;
  const weaponElement = getWeaponElement(weapon);
  const monsterElement = getMonsterElement(monster);
  
  const result = getElementalAdvantage(weaponElement, monsterElement);
  
  return {
    weaponElement,
    monsterElement,
    ...result,
    weaponName: weapon?.name || weapon?.itemName || 'Unarmed'
  };
};

// ============================================================================
// ------------------- Export Functions -------------------
// ============================================================================

module.exports = {
  ELIXIR_EFFECTS,
  applyElixirBuff,
  applyImmediateEffects,
  shouldConsumeElixir,
  consumeElixirBuff,
  removeExpiredBuffs,
  getActiveBuffEffects,
  hasBuffType,
  getBuffDuration,
  calculateBuffedStats,
  getElixirInfo,
  getAllElixirTypes,
  getMonsterElement,
  getResistanceForElement,
  elixirCountersMonster,
  getWeaponElement,
  getElementalAdvantage,
  calculateElementalCombatBonus,
  ELEMENTAL_ADVANTAGE_BONUS,
  ELEMENTAL_WEAKNESS_PENALTY
};

