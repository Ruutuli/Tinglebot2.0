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
    description: 'Grants blight rain resistance',
    effects: {
      blightResistance: 1
    }
  },
  'Electro Elixir': {
    type: 'electro',
    description: 'Provides resistance to electrical attacks from electric enemies',
    effects: {
      electricResistance: 1,
      defenseBoost: 0.5 // Small defense boost against electric enemies
    }
  },
  'Enduring Elixir': {
    type: 'enduring',
    description: 'Temporarily extends stamina wheel by +1',
    effects: {
      staminaBoost: 1, // Adds +1 temporary stamina on top of max
      staminaRecovery: 1
    }
  },
  'Energizing Elixir': {
    type: 'energizing',
    description: 'Restores stamina for physical actions',
    effects: {
      staminaRecovery: 2
    }
  },
  'Fireproof Elixir': {
    type: 'fireproof',
    description: 'Provides fire resistance against fire enemies',
    effects: {
      fireResistance: 1
    }
  },
  'Hasty Elixir': {
    type: 'hasty',
    description: 'Cuts travel time in half',
    effects: {
      speedBoost: 1,
      staminaRecovery: 0.3
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
  'Sneaky Elixir': {
    type: 'sneaky',
    description: 'Increases stealth ability for gathering, looting, and travel encounters, and boosts flee chance',
    effects: {
      stealthBoost: 1,
      fleeBoost: 1
    }
  },
  'Spicy Elixir': {
    type: 'spicy',
    description: 'Provides cold resistance and effectiveness against ice monsters',
    effects: {
      coldResistance: 1,
      iceEffectiveness: 1
    }
  },
  'Tough Elixir': {
    type: 'tough',
    description: 'Boosts defense',
    effects: {
      defenseBoost: 1.5
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
    // Hearty Elixir, Enduring Elixir, Energizing Elixir, and other elixirs now rely on database item consumption
    // for immediate effects (staminaRecovered, modifierHearts, etc.)
    // The hardcoded code only handles special effects like temporary stamina capacity and extra hearts
  }
};

// ------------------- Check if Elixir Should Be Consumed -------------------
// Checks if an elixir effect should be consumed based on the activity
const shouldConsumeElixir = (character, activity, context = {}) => {
  if (!character.buff?.active) return false;
  
  const buffType = character.buff.type;
  
  switch (buffType) {
    case 'chilly':
      // Consume when encountering blight rain
      return context.blightRain === true;
      
    case 'electro':
      // Consume when encountering electric enemies
      return activity === 'combat' && context.monster?.name?.includes('Electric') ||
             activity === 'helpWanted' && context.monster?.name?.includes('Electric') ||
             activity === 'raid' && context.monster?.name?.includes('Electric');
      
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
             activity === 'raid' && context.monster?.name?.includes('Fire');
      
    case 'hasty':
      // Consume when moving or traveling
      return activity === 'travel';
      
    case 'hearty':
      // Consume when taking damage or in combat
      return activity === 'combat' || activity === 'helpWanted' || activity === 'raid';
      
    case 'mighty':
      // Consume when attacking
      return activity === 'combat' || activity === 'helpWanted' || activity === 'raid';
      
    case 'sneaky':
      // Consume when gathering, looting, or traveling (stealth helps avoid encounters)
      return activity === 'gather' || activity === 'loot' || activity === 'travel';
      
    case 'spicy':
      // Consume when encountering cold weather or ice monsters
      return (activity === 'travel' && context.weather?.includes('Cold')) ||
             (activity === 'travel' && context.weather?.includes('Chilly')) ||
             (activity === 'combat' && context.monster?.name?.includes('Ice')) ||
             (activity === 'helpWanted' && context.monster?.name?.includes('Ice')) ||
             (activity === 'raid' && context.monster?.name?.includes('Ice'));
      
    case 'tough':
      // Consume when taking damage
      return activity === 'combat' || activity === 'helpWanted' || activity === 'raid';
      
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
      defenseBoost: 0
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
  getAllElixirTypes
};

