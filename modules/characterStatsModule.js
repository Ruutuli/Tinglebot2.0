// ------------------- Import necessary modules -------------------
const Character = require('../models/CharacterModel');
const { createSimpleCharacterEmbed } = require('../embeds/characterEmbeds');

// ------------------- Function to update hearts (current and max) -------------------
const updateHearts = async (characterId, hearts) => {
  try {
    await Character.updateOne({ _id: characterId }, { $set: { currentHearts: hearts, maxHearts: hearts } });
  } catch (error) {
    throw error;
  }
};

// ------------------- Function to update stamina (current and max) -------------------
const updateStamina = async (characterId, stamina) => {
  try {
    await Character.updateOne({ _id: characterId }, { $set: { currentStamina: stamina, maxStamina: stamina } });
  } catch (error) {
    throw error;
  }
};

// ------------------- Function to update current hearts -------------------
const updateCurrentHearts = async (characterId, hearts) => {
  try {
    if (isNaN(hearts)) throw new Error(`Provided hearts value is NaN for character ID: ${characterId}`);
    await Character.updateOne({ _id: characterId }, { $set: { currentHearts: hearts } });
  } catch (error) {
    throw error;
  }
};

// ------------------- Function to update current stamina -------------------
const updateCurrentStamina = async (characterId, stamina, updateUsageDate = false) => {
  try {
    const updateData = { currentStamina: stamina };
    if (updateUsageDate) updateData.lastStaminaUsage = new Date();
    await Character.updateOne({ _id: characterId }, { $set: updateData });
  } catch (error) {
    throw error;
  }
};

// ------------------- Function to recover hearts -------------------
const recoverHearts = async (characterId, hearts, healerId = null) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    if (character.ko) {
      console.log(`[StatModule DEBUG] Character ${character.name} is KO'd. Validating healer...`);
      if (!healerId) {
        throw new Error(`${character.name} is KO'd and cannot heal without a healer.`);
      }

      const healer = await Character.findById(healerId);
      if (!healer) throw new Error('Healer not found.');
      const healerJob = healer.jobVoucherJob || healer.job; // Support job vouchers
      if (healerJob.toLowerCase() !== 'healer') {
        throw new Error(`Invalid healer or ${healer.name} is not a healer.`);
      }

      console.log(`[StatModule DEBUG] Reviving character ${character.name} with healer ${healer.name}.`);
      character.ko = false; // Revive the character
      character.currentHearts = Math.min(hearts, character.maxHearts);
    } else {
      character.currentHearts = Math.min(character.currentHearts + hearts, character.maxHearts);
    }

    await character.save();
    return createSimpleCharacterEmbed(character, `❤️ +${hearts} hearts recovered`);
  } catch (error) {
    console.error(`[characterStatsModule.js]: Error in recoverHearts: ${error.message}`);
    throw error;
  }
};



// ------------------- Function to recover stamina -------------------
const recoverStamina = async (characterId, stamina) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    const newStamina = Math.min(character.currentStamina + stamina, character.maxStamina);
    await updateCurrentStamina(characterId, newStamina);

    return createSimpleCharacterEmbed(character, `🟩 +${stamina} stamina recovered`);
  } catch (error) {
    throw error;
  }
};

// ------------------- Function to use hearts -------------------
const useHearts = async (characterId, hearts) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    if (character.ko) {
      console.log(`[StatModule DEBUG] Skipping heart deduction. Character ${character.name} is already KO'd.`);
      return; // Prevent redundant deduction if KO
    }

    const currentHearts = character.currentHearts;
    const newHearts = Math.max(currentHearts - hearts, 0);

    console.log(`[StatModule DEBUG] Deducting hearts for ${character.name}. Current: ${currentHearts}, Deducting: ${hearts}, Result: ${newHearts}`);

    await updateCurrentHearts(characterId, newHearts);

    if (newHearts === 0) {
      console.log(`[StatModule DEBUG] Triggering KO for ${character.name}`);
      await handleKO(characterId);
    }

    return createSimpleCharacterEmbed(character, `❤️ -${hearts} hearts used`);
  } catch (error) {
    console.error(`[characterStatsModule.js]: Error in useHearts: ${error.message}`);
    throw error;
  }
};

// ------------------- Function to handle KO -------------------
const handleKO = async (characterId) => {
  try {
    console.log(`[StatModule DEBUG] Handling KO for Character ID ${characterId}`);
    await Character.updateOne({ _id: characterId }, { $set: { ko: true, currentHearts: 0 } });
    console.log(`[characterStatsModule.js]: Character ID ${characterId} is KO'd.`);
  } catch (error) {
    console.error(`[characterStatsModule.js]: Error in handleKO: ${error.message}`);
    throw error;
  }
};

// ------------------- Function to use stamina -------------------
const useStamina = async (characterId, stamina) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    const newStamina = Math.max(character.currentStamina - stamina, 0);
    await updateCurrentStamina(characterId, newStamina, true);

    // Check if stamina is 0
    if (newStamina === 0) {
      console.log(`${character.name} is exhausted! The mount runs off.`);
      return { message: `**${character.name}** is exhausted! The mount runs off. Better luck next time!`, exhausted: true };
    }

    return { message: `🟩 -${stamina} stamina used`, exhausted: false };
  } catch (error) {
    throw error;
  }
};

// ------------------- Function to exchange Spirit Orbs for hearts or stamina -------------------
const exchangeSpiritOrbs = async (characterId, type) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');
    if (character.spiritOrbs < 4) throw new Error('Not enough Spirit Orbs to exchange.');

    character.spiritOrbs -= 4;
    if (type === 'hearts') {
      character.maxHearts += 1;
      character.currentHearts += 1;
    } else if (type === 'stamina') {
      character.maxStamina += 1;
      character.currentStamina += 1;
    }

    await character.save();
    return createSimpleCharacterEmbed(character, `Exchanged 4 Spirit Orbs for ${type}`);
  } catch (error) {
    throw error;
  }
};

// ------------------- Function to recover daily stamina -------------------
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
    throw error;
  }
};

// ------------------- Function to heal KO character -------------------
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
    throw error;
  }
};

// ------------------- Function to update character defense -------------------
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
    throw error;
  }
};

// ------------------- Function to update character attack -------------------
const updateCharacterAttack = async (characterId) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    const totalAttack = character.gearWeapon?.stats?.get('modifierHearts') || 0;

    await Character.updateOne({ _id: characterId }, { $set: { attack: totalAttack } });
  } catch (error) {
    throw error;
  }
};

// ------------------- Function to check and use stamina -------------------
const checkAndUseStamina = async (character, staminaCost) => {
  try {
      if (character.currentStamina < staminaCost) {
          throw new Error(`❌ Not enough stamina. Required: ${staminaCost}, Available: ${character.currentStamina}`);
      }

      character.currentStamina -= staminaCost;
      await character.save(); // Save character data after deducting stamina

      // Fetch updated character data to ensure consistency
      const updatedCharacter = await Character.findById(character._id);
      return updatedCharacter.currentStamina;
  } catch (error) {
      console.error(`[characterStatsModule.js]: Error updating stamina for character: ${error.message}`);
      throw error;
  }
};


// ------------------- Function to check if stamina is 0 and handle accordingly -------------------
const handleZeroStamina = async (characterId) => {
  try {
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');

    if (character.currentStamina === 0) {
      // Notify or perform an action when stamina is 0
      console.log(`⚠️ ${character.name} has run out of stamina!`);
      // You can add further actions here, like sending a message, restricting certain actions, etc.
      return `⚠️ ${character.name} has no stamina left!`;
    }

    return `${character.name} has ${character.currentStamina} stamina remaining.`;
  } catch (error) {
    console.error(`Error checking stamina for character: ${error.message}`);
    throw error;
  }
};

// ------------------- Export all functions -------------------
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

