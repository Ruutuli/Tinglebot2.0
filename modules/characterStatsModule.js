// ------------------- characterStatsModule.js -------------------
// This module manages character statistics such as hearts, stamina, defense, and attack.
// It provides functions to update, recover, and use these stats, as well as handling
// special conditions like KO (knockout) and exchanging Spirit Orbs.
// The module also generates Discord embed messages to display updated stats.


// ============================================================================
// Database Models
// ------------------- Importing database models -------------------
const Character = require('../models/CharacterModel');

const { handleError } = require('../utils/globalErrorHandler');
// ============================================================================
// Discord.js Components
// ------------------- Importing Discord.js components -------------------
const { createSimpleCharacterEmbed } = require('../embeds/embeds');


// ============================================================================
// Character Statistics Update Functions
// ------------------- Update Hearts -------------------
// Updates both current and maximum hearts for a character.
const updateHearts = async (characterId, hearts) => {
  try {
    await Character.updateOne({ _id: characterId }, { $set: { currentHearts: hearts, maxHearts: hearts } });
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

    throw error;
  }
};

// ------------------- Update Stamina -------------------
// Updates both current and maximum stamina for a character.
const updateStamina = async (characterId, stamina) => {
  try {
    await Character.updateOne({ _id: characterId }, { $set: { currentStamina: stamina, maxStamina: stamina } });
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

    throw error;
  }
};

// ------------------- Update Current Hearts -------------------
// Updates only the current hearts of a character. Throws an error if hearts is NaN.
const updateCurrentHearts = async (characterId, hearts) => {
  try {
    if (isNaN(hearts)) throw new Error(`Provided hearts value is NaN for character ID: ${characterId}`);
    await Character.updateOne({ _id: characterId }, { $set: { currentHearts: hearts } });
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

    throw error;
  }
};

// ------------------- Update Current Stamina -------------------
// Updates only the current stamina of a character. Optionally updates the last stamina usage date.
const updateCurrentStamina = async (characterId, stamina, updateUsageDate = false) => {
  try {
    const updateData = { currentStamina: stamina };
    if (updateUsageDate) updateData.lastStaminaUsage = new Date();
    await Character.updateOne({ _id: characterId }, { $set: updateData });
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

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
    handleError(error, 'characterStatsModule.js');

    console.error(`[characterStatsModule.js]: logs Error in recoverHearts: ${error.message}`);
    throw error;
  }
};

// ------------------- Recover Stamina -------------------
// Recovers stamina for a character by adding the specified stamina value,
// ensuring it does not exceed the maximum stamina.
const recoverStamina = async (characterId, stamina) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    const newStamina = Math.min(character.currentStamina + stamina, character.maxStamina);
    await updateCurrentStamina(characterId, newStamina);

    return createSimpleCharacterEmbed(character, `🟩 +${stamina} stamina recovered`);
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

    throw error;
  }
};


// ============================================================================
// Usage Functions
// ------------------- Use Hearts -------------------
// Deducts hearts from a character. If hearts drop to 0, triggers KO handling.
const useHearts = async (characterId, hearts) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    if (character.ko) {
      console.log(`[characterStatsModule.js]: 💀 Skipping heart deduction. Character ${character.name} is already KO'd.`);
      return; // Prevent redundant deduction if already KO
    }

    const currentHearts = character.currentHearts;
    const newHearts = Math.max(currentHearts - hearts, 0);

    console.log(`[characterStatsModule.js]: ❤️ Deducting hearts for ${character.name}. Current: ${currentHearts}, Deducting: ${hearts}, Result: ${newHearts}`);

    await updateCurrentHearts(characterId, newHearts);

    if (newHearts === 0) {
      console.log(`[characterStatsModule.js]: 💀 Triggering KO for ${character.name}`);
      await handleKO(characterId);
    }

    return createSimpleCharacterEmbed(character, `❤️ -${hearts} hearts used`);
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

    console.error(`[characterStatsModule.js]: logs Error in useHearts: ${error.message}`);
    throw error;
  }
};

// ------------------- Use Stamina -------------------
// Deducts stamina from a character. If stamina reaches 0, returns a message indicating exhaustion.
const useStamina = async (characterId, stamina) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    const newStamina = Math.max(character.currentStamina - stamina, 0);
    await updateCurrentStamina(characterId, newStamina, true);

    // Check if stamina is exhausted.
    if (newStamina === 0) {
      console.log(`[characterStatsModule.js]: ⚠️ ${character.name} has run out of stamina!`);
      return { message: `⚠️ ${character.name} has no stamina left!`, exhausted: true };
    }

    return { message: `🟩 -${stamina} stamina used`, exhausted: false };
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

    throw error;
  }
};


// ============================================================================
// KO and Exchange Functions
// ------------------- Handle KO -------------------
// Handles a KO state by setting the character's KO flag and current hearts to 0.
const handleKO = async (characterId) => {
  try {
    console.log(`[characterStatsModule.js]: 💀 Handling KO for Character ID ${characterId}`);
    await Character.updateOne({ _id: characterId }, { $set: { ko: true, currentHearts: 0 } });
    console.log(`[characterStatsModule.js]: ✅ Character ID ${characterId} is KO'd.`);
  } catch (error) {
    handleError(error, 'characterStatsModule.js');
    console.error(`[characterStatsModule.js]: ❌ Error in handleKO: ${error.message}`);
    throw error;
  }
};

// ------------------- Exchange Spirit Orbs -------------------
// Exchanges Spirit Orbs for an increase in either hearts or stamina.
const exchangeSpiritOrbs = async (characterId, type) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    // Dynamically require the character service function.
    const { getCharacterInventoryCollection } = require('../database/db');
    const inventoryCollection = await getCharacterInventoryCollection(character.name);

    const orbEntry = await inventoryCollection.findOne({
      characterId: characterId,
      itemName: { $regex: /^spirit orb$/i }
    });

    const orbCount = orbEntry?.quantity || 0;
    if (orbCount < 4) {
      throw new Error(`${character.name} only has ${orbCount} Spirit Orb(s). You need at least 4 to exchange.`);
    }

    orbEntry.quantity -= 4;
    if (orbEntry.quantity <= 0) {
      await inventoryCollection.deleteOne({ _id: orbEntry._id });
    } else {
      await inventoryCollection.updateOne(
        { _id: orbEntry._id },
        { $set: { quantity: orbEntry.quantity } }
      );
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
    handleError(error, 'characterStatsModule.js');

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
    for (const character of characters) {
      if ((!character.lastStaminaUsage || character.lastStaminaUsage.toDateString() !== now.toDateString()) && character.currentStamina < character.maxStamina) {
        const newStamina = Math.min(character.currentStamina + 1, character.maxStamina);
        await updateCurrentStamina(character._id, newStamina);
      }
    }
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

    throw error;
  }
};

// ------------------- Heal KO Character -------------------
// Heals a KO'd character using a healer and revives them.
const healKoCharacter = async (characterId, healerId = null) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');
    if (!character.ko) throw new Error(`${character.name} is not KO'd.`);

    if (healerId) {
      const healer = await Character.findById(healerId);
      if (!healer) throw new Error('Healer not found.');
      if (healer.job !== 'Healer') throw new Error(`${healer.name} is not a healer.`);
    }

    await updateCurrentHearts(characterId, 1);
    await Character.updateOne({ _id: characterId }, { $set: { ko: false } });
    return createSimpleCharacterEmbed(character, `❤️ ${character.name} has been revived.`);
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

    throw error;
  }
};


// ============================================================================
// Stat Update Functions
// ------------------- Update Character Defense -------------------
// Updates the character's defense based on equipped gear.
const updateCharacterDefense = async (characterId) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    let totalDefense = 0;
    if (character.gearArmor) {
      totalDefense += character.gearArmor.head?.stats?.get('modifierHearts') || 0;
      totalDefense += character.gearArmor.chest?.stats?.get('modifierHearts') || 0;
      totalDefense += character.gearArmor.legs?.stats?.get('modifierHearts') || 0;
    }
    if (character.gearShield?.stats) {
      totalDefense += character.gearShield.stats.get('modifierHearts') || 0;
    }

    await Character.updateOne({ _id: characterId }, { $set: { defense: totalDefense } });
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

    throw error;
  }
};

// ------------------- Update Character Attack -------------------
// Updates the character's attack based on equipped weapon stats.
const updateCharacterAttack = async (characterId) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    const totalAttack = character.gearWeapon?.stats?.get('modifierHearts') || 0;
    await Character.updateOne({ _id: characterId }, { $set: { attack: totalAttack } });
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

    throw error;
  }
};


// ============================================================================
// Stamina Management Functions
// ------------------- Check and Use Stamina -------------------
// Checks if a character has enough stamina, deducts it if possible, and returns the updated stamina.
const checkAndUseStamina = async (character, staminaCost) => {
  try {
      if (character.currentStamina < staminaCost) {
          throw new Error(`❌ Not enough stamina. Required: ${staminaCost}, Available: ${character.currentStamina}`);
      }

      character.currentStamina -= staminaCost;
      await character.save();

      const updatedCharacter = await Character.findById(character._id);
      return updatedCharacter.currentStamina;
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

      console.error(`[characterStatsModule.js]: logs Error updating stamina for character: ${error.message}`);
      throw error;
  }
};

// ------------------- Handle Zero Stamina -------------------
// Checks if a character's stamina is 0 and returns an appropriate message.
const handleZeroStamina = async (characterId) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    if (character.currentStamina === 0) {
      console.log(`[characterStatsModule.js]: ⚠️ ${character.name} has run out of stamina!`);
      return `⚠️ ${character.name} has no stamina left!`;
    }
    return `${character.name} has ${character.currentStamina} stamina remaining.`;
  } catch (error) {
    handleError(error, 'characterStatsModule.js');

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
