// ------------------- characterStatsModule.js -------------------
// This module manages character statistics such as hearts, stamina, defense, and attack.
// It provides functions to update, recover, and use these stats, as well as handling
// special conditions like KO (knockout) and exchanging Spirit Orbs.
// The module also generates Discord embed messages to display updated stats.


// ============================================================================
// Database Models
// ------------------- Importing database models -------------------
const Character = require('../models/CharacterModel');
const ModCharacter = require('../models/ModCharacterModel');

const { handleError } = require('../utils/globalErrorHandler');
const { info, success, debug } = require('../utils/logger');
// ============================================================================
// Discord.js Components
// ------------------- Importing Discord.js components -------------------
const { createSimpleCharacterEmbed } = require('../embeds/embeds.js');


// ============================================================================
// Character Statistics Update Functions
// ------------------- Update Hearts -------------------
// Updates both current and maximum hearts for a character.
const updateHearts = async (characterId, hearts) => {
  try {
    // Check if this is a mod character first
    const modCharacter = await ModCharacter.findById(characterId);
    if (modCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${modCharacter.name} - hearts update skipped (mod characters have unlimited hearts)`);
      return; // Mod characters don't need heart updates
    }
    
    await Character.updateOne({ _id: characterId }, { $set: { currentHearts: hearts, maxHearts: hearts } });
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'update_hearts',
      characterId: characterId
    });

    throw error;
  }
};

// ------------------- Update Stamina -------------------
// Updates both current and maximum stamina for a character.
const updateStamina = async (characterId, stamina) => {
  try {
    // Check if this is a mod character first
    const modCharacter = await ModCharacter.findById(characterId);
    if (modCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${modCharacter.name} - stamina update skipped (mod characters have unlimited stamina)`);
      return; // Mod characters don't need stamina updates
    }
    
    await Character.updateOne({ _id: characterId }, { $set: { currentStamina: stamina, maxStamina: stamina } });
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'update_stamina',
      characterId: characterId
    });

    throw error;
  }
};

// ------------------- Update Current Hearts -------------------
// Updates only the current hearts of a character. Throws an error if hearts is NaN.
const updateCurrentHearts = async (characterId, hearts) => {
  try {
    if (isNaN(hearts)) throw new Error(`Provided hearts value is NaN for character ID: ${characterId}`);
    
    // Check if this is a mod character first
    const modCharacter = await ModCharacter.findById(characterId);
    if (modCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${modCharacter.name} - hearts update skipped (mod characters have unlimited hearts)`);
      return; // Mod characters don't need heart updates
    }
    
    // Update regular character
    await Character.updateOne({ _id: characterId }, { $set: { currentHearts: hearts } });
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'update_current_hearts',
      characterId: characterId,
      heartsValue: hearts
    });

    throw error;
  }
};

// ------------------- Update Current Stamina -------------------
// Updates only the current stamina of a character. Optionally updates the last stamina usage date.
const updateCurrentStamina = async (characterId, stamina, updateUsageDate = false) => {
  try {
    // Check if this is a mod character first
    const modCharacter = await ModCharacter.findById(characterId);
    if (modCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${modCharacter.name} - stamina update skipped (mod characters have unlimited stamina)`);
      return; // Mod characters don't need stamina updates
    }
    
    const updateData = { currentStamina: stamina };
    if (updateUsageDate) updateData.lastStaminaUsage = new Date();
    await Character.updateOne({ _id: characterId }, { $set: updateData });
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'update_current_stamina',
      characterId: characterId,
      staminaValue: stamina,
      updateUsageDate: updateUsageDate
    });

    throw error;
  }
};


// ============================================================================
// Recovery Functions
// ------------------- Recover Hearts -------------------
// Recovers hearts for a character. If the character is KO, it validates the healer
// and revives the character with the specified number of hearts.
const recoverHearts = async (characterId, hearts, healerId = null) => {
  try {
    // Check if this is a mod character first
    const modCharacter = await ModCharacter.findById(characterId);
    if (modCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${modCharacter.name} - heart recovery skipped (mod characters have unlimited hearts)`);
      return createSimpleCharacterEmbed(modCharacter, `❤️ Mod character - no heart recovery needed`);
    }
    
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    if (character.ko) {
      console.log(`[characterStatsModule.js]: 💀 Character ${character.name} is KO'd. Validating healer...`);
      if (!healerId) {
        throw new Error(`${character.name} is KO'd and cannot heal without a healer.`);
      }

      const healer = await Character.findById(healerId);
      if (!healer) throw new Error('Healer not found.');
      const healerJob = healer.jobVoucherJob || healer.job; // Support job vouchers
      if (healerJob.toLowerCase() !== 'healer') {
        throw new Error(`Invalid healer or ${healer.name} is not a healer.`);
      }

      console.log(`[characterStatsModule.js]: 🔄 Reviving character ${character.name} with healer ${healer.name}.`);
      character.ko = false; // Revive the character
      character.currentHearts = Math.min(hearts, character.maxHearts);
    } else {
      character.currentHearts = Math.min(character.currentHearts + hearts, character.maxHearts);
    }

    await character.save();
    return createSimpleCharacterEmbed(character, `❤️ +${hearts} hearts recovered`);
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'recover_hearts',
      characterId: characterId,
      heartsToRecover: hearts,
      healerId: healerId
    });

    console.error(`[characterStatsModule.js]: logs Error in recoverHearts: ${error.message}`);
    throw error;
  }
};

// ------------------- Recover Stamina -------------------
// Recovers stamina for a character by adding the specified stamina value,
// ensuring it does not exceed the maximum stamina.
const recoverStamina = async (characterId, stamina) => {
  try {
    // Check if this is a mod character first
    const modCharacter = await ModCharacter.findById(characterId);
    if (modCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${modCharacter.name} - stamina recovery skipped (mod characters have unlimited stamina)`);
      return createSimpleCharacterEmbed(modCharacter, `🟩 Mod character - no stamina recovery needed`);
    }
    
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    const newStamina = Math.min(character.currentStamina + stamina, character.maxStamina);
    await updateCurrentStamina(characterId, newStamina);

    return createSimpleCharacterEmbed(character, `🟩 +${stamina} stamina recovered`);
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'recover_stamina',
      characterId: characterId,
      staminaToRecover: stamina
    });

    throw error;
  }
};


// ============================================================================
// Usage Functions
// ------------------- Use Hearts -------------------
// Deducts hearts from a character. If hearts drop to 0, triggers KO handling.
const useHearts = async (characterId, hearts, context = {}) => {
  try {
    // First check if this is a mod character
    const modCharacter = await ModCharacter.findById(characterId);
    if (modCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${modCharacter.name} is immune to heart loss.`);
      return createSimpleCharacterEmbed(modCharacter, `❤️ Mod character - no hearts lost`);
    }

    // If not a mod character, check regular character collection
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    // Double-check if this is a mod character
    if (character.isModCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${character.name} is immune to heart loss.`);
      return createSimpleCharacterEmbed(character, `❤️ Mod character - no hearts lost`);
    }

    if (character.ko) {
      console.log(`[characterStatsModule.js]: 💀 Skipping heart deduction. Character ${character.name} is already KO'd.`);
      return; // Prevent redundant deduction if already KO
    }

    const currentHearts = character.currentHearts;
    const newHearts = Math.max(currentHearts - hearts, 0);

    // Heart deduction logged only in debug mode

    await updateCurrentHearts(characterId, newHearts);

    if (newHearts === 0) {
      info('CHARACTER', `Triggering KO for ${character.name}`);
      await handleKO(characterId, context);
    }

    return createSimpleCharacterEmbed(character, `❤️ -${hearts} hearts used`);
  } catch (error) {
    handleError(error, 'characterStatsModule.js', context);

    console.error(`[characterStatsModule.js]: logs Error in useHearts: ${error.message}`);
    throw error;
  }
};

// ------------------- Use Stamina -------------------
// Deducts stamina from a character. Returns exhausted: true if the character doesn't have enough stamina BEFORE deducting.
// If the character has enough stamina, it will be deducted and exhausted: false is returned (even if stamina reaches 0 after use).
const useStamina = async (characterId, stamina, context = {}) => {
  try {
    // First check if this is a mod character
    const modCharacter = await ModCharacter.findById(characterId);
    if (modCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${modCharacter.name} is immune to stamina loss.`);
      return { message: `🟩 Mod character - no stamina lost`, exhausted: false };
    }

    // If not a mod character, check regular character collection
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    // Double-check if this is a mod character
    if (character.isModCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${character.name} is immune to stamina loss.`);
      return { message: `🟩 Mod character - no stamina lost`, exhausted: false };
    }

    // Check if character has enough stamina BEFORE deducting
    if (character.currentStamina < stamina) {
      console.log(`[characterStatsModule.js]: ⚠️ ${character.name} doesn't have enough stamina! Required: ${stamina}, Available: ${character.currentStamina}`);
      return { message: `⚠️ ${character.name} doesn't have enough stamina! Required: ${stamina}, Available: ${character.currentStamina}`, exhausted: true };
    }

    // Deduct stamina and update database
    const newStamina = Math.max(character.currentStamina - stamina, 0);
    await updateCurrentStamina(characterId, newStamina, true);

    // If stamina reaches 0 after use, log it but don't mark as exhausted
    // (they successfully used the stamina they had)
    if (newStamina === 0) {
      console.log(`[characterStatsModule.js]: ⚠️ ${character.name} has run out of stamina after using ${stamina} stamina.`);
    }

    return { message: `🟩 -${stamina} stamina used`, exhausted: false };
  } catch (error) {
    handleError(error, 'characterStatsModule.js', context);

    throw error;
  }
};


// ============================================================================
// KO and Exchange Functions
// ------------------- Handle KO -------------------
// Handles a KO state by setting the character's KO flag and current hearts to 0.
const handleKO = async (characterId, context = {}) => {
  try {
    info('CHARACTER', `Handling KO for Character ID ${characterId}`);
    
    // First check if this is a mod character
    const modCharacter = await ModCharacter.findById(characterId);
    if (modCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${modCharacter.name} is immune to KO.`);
      return; // Mod characters cannot be KO'd
    }
    
    // If not a mod character, check regular character collection
    const character = await Character.findById(characterId);
    if (!character) {
      console.log(`[characterStatsModule.js]: ❌ Character not found for KO handling: ${characterId}`);
      return;
    }
    
    // Double-check if this is a mod character
    if (character.isModCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${character.name} is immune to KO.`);
      return; // Mod characters cannot be KO'd
    }
    
    await Character.updateOne({ _id: characterId }, { $set: { ko: true, currentHearts: 0 } });
    success('CHARACTER', `Character ID ${characterId} is KO'd`);
  } catch (error) {
    handleError(error, 'characterStatsModule.js', context);
    console.error(`[characterStatsModule.js]: ❌ Error in handleKO: ${error.message}`);
    throw error;
  }
};

// ------------------- Exchange Spirit Orbs -------------------
// Exchanges Spirit Orbs for an increase in either hearts or stamina.
const exchangeSpiritOrbs = async (characterId, type) => {
  let orbCount;
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    // Dynamically require the character service function.
    const { getCharacterInventoryCollection } = require('../database/db');
    const inventoryCollection = await getCharacterInventoryCollection(character.name);

    // Atomic update: deduct 4 only if quantity >= 4 to prevent race conditions
    const orbFilter = { characterId: characterId, itemName: { $regex: /^spirit orb$/i }, quantity: { $gte: 4 } };
    const updatedOrb = await inventoryCollection.findOneAndUpdate(
      orbFilter,
      { $inc: { quantity: -4 } },
      { returnDocument: 'after' }
    );

    if (!updatedOrb) {
      const currentOrb = await inventoryCollection.findOne({
        characterId: characterId,
        itemName: { $regex: /^spirit orb$/i }
      });
      orbCount = currentOrb?.quantity || 0;
      throw new Error(`${character.name} only has ${orbCount} Spirit Orb(s). You need at least 4 to exchange.`);
    }
    orbCount = (updatedOrb.quantity || 0) + 4;

    if ((updatedOrb.quantity || 0) <= 0) {
      await inventoryCollection.deleteOne({ _id: updatedOrb._id });
    }

    if (type === 'hearts') {
      character.maxHearts += 1;
      character.currentHearts = character.maxHearts;
    } else if (type === 'stamina') {
      character.maxStamina += 1;
      character.currentStamina = character.maxStamina;
    }

    await character.save();
    return character;
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'exchange_spirit_orbs',
      characterId: characterId,
      orbType: type,
      orbCount: orbCount
    });

    console.error(`[characterStatsModule.js]: logs Error in exchangeSpiritOrbs: ${error.message}`);
    throw error;
  }
};


// ============================================================================
// Daily Recovery Functions
// ------------------- Recover Daily Stamina -------------------
// Recovers stamina for all characters daily if they haven't used stamina today.
const recoverDailyStamina = async () => {
  try {
    const characters = await Character.find({});
    const now = new Date();
    // EST is UTC-5, subtract 5 hours
    const estNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const today = `${estNow.getUTCFullYear()}-${String(estNow.getUTCMonth() + 1).padStart(2, '0')}-${String(estNow.getUTCDate()).padStart(2, '0')}`;
    
    // Get yesterday's date in EST
    const yesterday = new Date(estNow.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;

    info('SYNC', `Starting daily stamina recovery for ${today}`);

    let recoveredCount = 0;
    let skippedCount = 0;
    
    for (const character of characters) {
      try {
        if (!character.lastStaminaUsage) {
          // If no last usage, they can recover
          if (character.currentStamina < character.maxStamina) {
            const newStamina = Math.min(character.currentStamina + 1, character.maxStamina);
            await updateCurrentStamina(character._id, newStamina);
            recoveredCount++;
            debug('SYNC', `Recovered stamina for ${character.name} (no previous usage)`);
          }
          continue;
        }

        // Convert lastStaminaUsage to EST-equivalent for comparison (UTC-5)
        const lastUsage = new Date(character.lastStaminaUsage.getTime() - 5 * 60 * 60 * 1000);
        const lastUsageDate = `${lastUsage.getUTCFullYear()}-${String(lastUsage.getUTCMonth() + 1).padStart(2, '0')}-${String(lastUsage.getUTCDate()).padStart(2, '0')}`;

        // Only recover if:
        // 1. Last usage was NOT yesterday (must be before yesterday)
        // 2. Current stamina is below max
        if (lastUsageDate < yesterdayStr && character.currentStamina < character.maxStamina) {
          const newStamina = Math.min(character.currentStamina + 1, character.maxStamina);
          await updateCurrentStamina(character._id, newStamina);
          recoveredCount++;
          debug('SYNC', `Recovered stamina for ${character.name} (last usage: ${lastUsageDate})`);
        } else {
          skippedCount++;
        }
      } catch (error) {
        console.error(`[characterStatsModule.js]: ❌ Error processing stamina recovery for ${character.name}:`, error.message);
      }
    }
    
    success('SYNC', `Stamina recovery complete: ${recoveredCount} recovered, ${skippedCount} skipped`);
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'recover_daily_stamina',
      date: today
    });
    throw error;
  }
};

// ------------------- Heal KO Character -------------------
// Heals a KO'd character using a healer and revives them.
const healKoCharacter = async (characterId, healerId = null) => {
  try {
    // Check if this is a mod character first
    const modCharacter = await ModCharacter.findById(characterId);
    if (modCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${modCharacter.name} - KO healing skipped (mod characters cannot be KO'd)`);
      return createSimpleCharacterEmbed(modCharacter, `❤️ Mod character - no KO healing needed`);
    }
    
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');
    if (!character.ko) throw new Error(`${character.name} is not KO'd.`);

    if (healerId) {
      const healer = await Character.findById(healerId);
      if (!healer) throw new Error('Healer not found.');
      if (healer.job !== 'Healer') throw new Error(`${healer.name} is not a healer.`);
    }

    await updateCurrentHearts(characterId, 1);
    
    // Only remove debuff if a healer is performing the healing
    // Fairies and items should NOT be able to remove debuffs
    const updateData = { ko: false };
    if (healerId) {
      // Healer is performing the healing - debuff removal happens in healing flow
      // Don't remove debuff here, let the healing system handle it (especially Priest boost)
      // This prevents fairies from accidentally clearing debuffs
    }
    
    await Character.updateOne({ _id: characterId }, { $set: updateData });
    return createSimpleCharacterEmbed(character, `❤️ ${character.name} has been revived.`);
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'heal_ko_character',
      characterId: characterId,
      healerId: healerId
    });

    throw error;
  }
};


// ============================================================================
// Stat Update Functions
// ------------------- Gear stat model -------------------
// Gear stat value comes from item modifierHearts; on the character, weapon contributes to attack, armor/shield to defense.
// Each gear slot (weapon, shield, head, chest, legs) contributes at most once.
// Stats use modifierHearts (or "attack" for weapons) - both keys supported for backward compatibility.
// No stacking: only one item per slot, each slot adds its value to the total.
// ------------------- Helper: Get modifierHearts from stats (handles both Map and plain object) -------------------
const getModifierHearts = (stats) => {
  if (!stats) return 0;
  // Handle Map (e.g. from dashboard gear-equip which uses "attack"/"defense" keys)
  if (stats instanceof Map) {
    const modHearts = stats.get('modifierHearts');
    if (modHearts != null) return modHearts;
    return stats.get('attack') || stats.get('defense') || 0;
  }
  // Handle plain object
  if (typeof stats === 'object') {
    if (stats.modifierHearts != null) return stats.modifierHearts;
    return stats.attack || stats.defense || 0;
  }
  return 0;
};

// ------------------- Helper: Get character for stat update (shared by defense/attack) -------------------
// Returns the character document (regular or mod) so callers can persist defense/attack. Throws if not found.
const getCharacterForStatUpdate = async (characterId) => {
  if (Character.db && Character.db.readyState !== 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (Character.db.readyState !== 1) {
      throw new Error('Character model database connection not ready');
    }
  }

  const character = await Promise.race([
    Character.findById(characterId),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Character query timeout')), 5000))
  ]);

  if (character && character.isModCharacter) {
    return character;
  }

  if (!character) {
    try {
      if (ModCharacter.db && ModCharacter.db.readyState === 1) {
        const modCharacter = await Promise.race([
          ModCharacter.findById(characterId),
          new Promise((_, reject) => setTimeout(() => reject(new Error('ModCharacter query timeout')), 2000))
        ]);
        if (modCharacter) {
          return modCharacter;
        }
      }
    } catch (modError) {
      // ModCharacter query failed; fall through and throw Character not found
    }
    throw new Error('Character not found');
  }

  return character;
};

// Helper: true if the document is a mod character (for choosing Character vs ModCharacter update)
const isModCharacterDoc = (doc) =>
  doc && (doc.isModCharacter === true || (doc.constructor && doc.constructor.modelName === 'ModCharacter'));

// ------------------- Update Character Defense -------------------
// Updates the character's defense based on equipped gear.
const updateCharacterDefense = async (characterId) => {
  let totalDefense = 0;
  try {
    const character = await getCharacterForStatUpdate(characterId);
    if (!character) return;

    totalDefense = 0;
    if (character.gearArmor) {
      totalDefense += getModifierHearts(character.gearArmor.head?.stats);
      totalDefense += getModifierHearts(character.gearArmor.chest?.stats);
      totalDefense += getModifierHearts(character.gearArmor.legs?.stats);
    }
    if (character.gearShield?.stats) {
      totalDefense += getModifierHearts(character.gearShield.stats);
    }

    const updateOp = ModCharacter.updateOne({ _id: characterId }, { $set: { defense: totalDefense } });
    const regularOp = Character.updateOne({ _id: characterId }, { $set: { defense: totalDefense } });
    await Promise.race([
      isModCharacterDoc(character) ? updateOp : regularOp,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Character update timeout')), 5000))
    ]);
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'update_character_defense',
      characterId: characterId,
      totalDefense: totalDefense
    });

    throw error;
  }
};

// ------------------- Update Character Attack -------------------
// Updates the character's attack based on equipped weapon stats.
const updateCharacterAttack = async (characterId) => {
  let totalAttack = 0;
  try {
    const character = await getCharacterForStatUpdate(characterId);
    if (!character) return;

    totalAttack = getModifierHearts(character.gearWeapon?.stats) || 0;

    const updateOp = ModCharacter.updateOne({ _id: characterId }, { $set: { attack: totalAttack } });
    const regularOp = Character.updateOne({ _id: characterId }, { $set: { attack: totalAttack } });
    await Promise.race([
      isModCharacterDoc(character) ? updateOp : regularOp,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Character update timeout')), 5000))
    ]);
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'update_character_attack',
      characterId: characterId,
      totalAttack: totalAttack
    });

    throw error;
  }
};


// ============================================================================
// Stamina Management Functions
// ------------------- Check and Use Stamina -------------------
// Checks if a character has enough stamina, deducts it if possible, and returns the updated stamina.
const checkAndUseStamina = async (character, staminaCost) => {
  try {
      // Check if this is a mod character (also check ModCharacter collection)
      const modCharacter = await ModCharacter.findById(character._id);
      if (modCharacter || character.isModCharacter) {
          console.log(`[characterStatsModule.js]: 👑 Mod character ${character.name} is immune to stamina loss.`);
          return character.currentStamina; // Return current stamina without deduction
      }

      if (character.currentStamina < staminaCost) {
          throw new Error(`❌ Not enough stamina. Required: ${staminaCost}, Available: ${character.currentStamina}`);
      }

      character.currentStamina -= staminaCost;
      await character.save();

      const updatedCharacter = await Character.findById(character._id);
      return updatedCharacter.currentStamina;
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'check_and_use_stamina',
      characterId: character._id,
      characterName: character.name,
      staminaCost: staminaCost
    });

      console.error(`[characterStatsModule.js]: logs Error updating stamina for character: ${error.message}`);
      throw error;
  }
};

// ------------------- Handle Zero Stamina -------------------
// Checks if a character's stamina is 0 and returns an appropriate message.
const handleZeroStamina = async (characterId) => {
  try {
    // Check if this is a mod character first
    const modCharacter = await ModCharacter.findById(characterId);
    if (modCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${modCharacter.name} has unlimited stamina.`);
      return `${modCharacter.name} has unlimited stamina as a mod character.`;
    }
    
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    // Double-check if this is a mod character
    if (character.isModCharacter) {
      console.log(`[characterStatsModule.js]: 👑 Mod character ${character.name} has unlimited stamina.`);
      return `${character.name} has unlimited stamina as a mod character.`;
    }

    if (character.currentStamina === 0) {
      console.log(`[characterStatsModule.js]: ⚠️ ${character.name} has run out of stamina!`);
      return `⚠️ ${character.name} has no stamina left!`;
    }
    return `${character.name} has ${character.currentStamina} stamina remaining.`;
  } catch (error) {
    handleError(error, 'characterStatsModule.js', {
      operation: 'handle_zero_stamina',
      characterId: characterId
    });

    console.error(`[characterStatsModule.js]: logs Error checking stamina for character: ${error.message}`);
    throw error;
  }
};


// ============================================================================
// Module Exports
// ------------------- Exporting all functions -------------------
module.exports = {
  updateHearts,
  updateStamina,
  updateCurrentHearts,
  updateCurrentStamina,
  recoverHearts,
  recoverStamina,
  useHearts,
  useStamina,
  handleKO,
  exchangeSpiritOrbs,
  recoverDailyStamina,
  healKoCharacter,
  updateCharacterDefense,
  updateCharacterAttack,
  checkAndUseStamina,
  handleZeroStamina,
};
