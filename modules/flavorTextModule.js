// flavorTextModule.js

// Utility Functions
// =================

// Utility function to get a random message from an array
const getRandomMessage = (messages) => {
  return messages[Math.floor(Math.random() * messages.length)];
};

// Damage Messages
// ===============

// Messages for damage taken
const generateDamageMessage = (damage) => {
  const messages = {
    1: [
      "💥💀 The monster attacks! You lose ❤️ 1 heart!",
      "🩹🌿 Just a scratch! Lose ❤️ 1 heart!",
      "💥💀 Ouch! That cost you ❤️ 1 heart!",
      "💥⚔️ A swift strike! Lose ❤️ 1 heart!",
      "🛡️💔 You couldn't dodge in time! Lose ❤️ 1 heart!",
      "⚡️😖 A painful blow! You lose ❤️ 1 heart!",
    ],
    2: [
      "💥💀 The monster strikes hard! You lose ❤️❤️ 2 hearts!",
      "💥💀 You suffer a heavy blow! Lose ❤️❤️ 2 hearts!",
      "🛡️🌱 A tough one, but it'll take more than that to keep you down! You lose ❤️❤️ 2 hearts!",
      "💥⚔️ The beast hits you hard! Lose ❤️❤️ 2 hearts!",
      "🛡️💔 A powerful attack! Lose ❤️❤️ 2 hearts!",
      "⚡️😖 You stagger from the blow! Lose ❤️❤️ 2 hearts!",
    ],
    3: [
      "💥💀 A fierce attack! You lose ❤️❤️❤️ 3 hearts!",
      "💥🌳 Your foe's strength is overwhelming! Lose ❤️❤️❤️ 3 hearts!",
      "💥💀 You barely stand after that hit! Lose ❤️❤️❤️ 3 hearts!",
      "💥⚔️ An earth-shattering strike! Lose ❤️❤️❤️ 3 hearts!",
      "🛡️💔 A devastating blow! Lose ❤️❤️❤️ 3 hearts!",
      "⚡️😖 You reel from the force! Lose ❤️❤️❤️ 3 hearts!",
    ],
    KO: [
      "💥💀 Everything seems to be going wrong... you lose all hearts and the fight...",
      "💥💀 You couldn't withstand the attack... all hearts lost!",
      "💥💀 A devastating blow! You lose all hearts and fall...",
      "⭐🌷 Stars wink in front of your eyes. Your wounds throb painfully. You can't continue. You must retreat... all hearts lost!",
      "🛡️💔 Crushed by the monster's might... all hearts lost!",
      "⚡️😖 Overwhelmed... you lose all hearts and fall...",
    ]
  };
  return getRandomMessage(messages[damage] || ["No damage taken."]);
};

// Victory Messages
// ================

// Messages for victory based on adjusted random value
const generateVictoryMessage = (randomValue, defenseSuccess = false, attackSuccess = false) => {
  const messages = [
    "😓⚔️ You barely scraped through, but it's a win!",
    "🙌✨ Just when it seemed bleak, you pulled through and won!",
    "🎉💪 A tough fight, but you emerged victorious!",
    "😅✨ Phew! That was close, but you won!",
    "👊🎊 Another victory in the bag! Well done!",
    "🔥💫 Monster vanquished! You win!",
    "🌟👑 What an impressive display! You win!",
    "💪🌟 Nothing can stop you! Another win!",
    "🌟💥 ★Fantastic job!! Another win in the books!★",
    "🎊🌟 A narrow escape, but a win nonetheless!",
    "🏆🎇 Just in the nick of time, you clinched a win!",
    "🛡️💪 It was touch and go, but you pulled off the victory!",
    "✨🔰 Another successful day on the battlefield! You win!",
    "👊🔥 That monster didn't stand a chance! You win!",
    "👏✨ Truly impressive! You win!",
    "🔥💪 You're an unstoppable force! Another win!",
    "🌟🌼 There is no courage without fear, and your enemies don't stand a chance against you.",
    "💪🌿 Your strength is formidable. Your foes fall before you with ease!",
    "🏆🌱 For a moment, the situation was tough, but you outwitted your foe and won the day!",
  ];

  return getRandomMessage(messages);
};

// Attack Buff Messages
// ====================

const generateAttackBuffMessage = (attackSuccess, adjustedRandomValue, finalDamage) => {
  const messages = [
    "⚔️✨ Your weapon's power helped you secure the win!",
    "🛡️💪 Thanks to your weapon, you won with ease!",
    "🔮⚔️ Your weapon made the difference in your victory!",
    "⚔️🌺 Your years of training have paid off in full. The monster falls before you!",
  ];
  return getRandomMessage(messages);
};

const generateAttackBuffMessageReduced = (reducedDamage, originalDamage) => {
  const messages = [
    `💪✨ The monster attacked, but you fought back! Thanks to your weapon, you took ${originalDamage - reducedDamage} ❤️ less heart! Without it, you would have taken ${originalDamage} ❤️ hearts!`,
    `🛡️⚔️ The monster's attack was strong, but you fought back bravely! Your weapon's power reduced the damage to ${reducedDamage} ❤️ hearts! Originally, it was ${originalDamage} ❤️ hearts.`,
    `🔮🔥 The monster struck hard, but you retaliated! The attack was less severe thanks to your weapon, reducing the damage to ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`,
    `🗡️🌿 Your weapon redirects the monster's attack. It's just a scratch! Damage reduced ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`
  ];
  return getRandomMessage(messages);
};

const generateAttackBuffMessageKOPrevented = (originalDamage) => {
  const messages = [
    `💪✨ The monster attacked and almost knocked you out! Without your weapon, you would have been KO'd. Instead, you took ${originalDamage} ❤️ hearts of damage!`,
    `🛡️⚔️ A near-KO attack was thwarted by your weapon! You would have been knocked out, but you only took ${originalDamage} ❤️ hearts of damage!`,
    `🔮🔥 Your weapon saved you from a KO! The monster's attack was fierce, but you only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!`,
    `🚨🍃 Your instincts sense danger, giving you enough time to avoid a lethal blow! You only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!`
  ];
  return getRandomMessage(messages);
};

// Defense Buff Messages
// =====================

const generateDefenseBuffMessage = (defenseSuccess, adjustedRandomValue, finalDamage) => {
  const messages = [
    "🛡️✨ Your armor blocked the attack! No damage taken!",
    "⚔️🛡️ Thanks to your armor, you emerged unscathed!",
    "🔰💫 Your armor's protection made all the difference!",
    "🛡️🌱 You feel the strike, but no pain follows."
  ];
  return getRandomMessage(messages);
};

const generateDefenseBuffMessageReduced = (reducedDamage, originalDamage) => {
  const messages = [
    `💪✨ The monster attacked, but your armor absorbed the blow! You took ${originalDamage - reducedDamage} ❤️ less heart! Without it, you would have taken ${originalDamage} ❤️ hearts!`,
    `🛡️⚔️ The monster's attack was strong, but your armor held! You took ${reducedDamage} ❤️ hearts! Originally, it was ${originalDamage} ❤️ hearts.`,
    `🔰🔥 The monster struck hard, but your armor protected you! The attack was less severe, reducing the damage to ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`,
    `🛡️🌳 The monster's attack will undoubtedly bruise, but it could've been worse. The attack was less severe, reducing the damage to ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`
  ];
  return getRandomMessage(messages);
};

const generateDefenseBuffMessageKOPrevented = (originalDamage) => {
  const messages = [
    `💪✨ The monster attacked and almost knocked you out! Without your armor, you would have been KO'd. Instead, you took ${originalDamage} ❤️ hearts of damage!`,
    `🛡️⚔️ A near-KO attack was thwarted by your armor! You would have been knocked out, but you only took ${originalDamage} ❤️ hearts of damage!`,
    `🔰🔥 Your armor saved you from a KO! The monster's attack was fierce, but you only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!`
    `🚫🌿 The blow takes your breath away, but you're still standing! You only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!`
  ];
  return getRandomMessage(messages);
};

// Combined Attack and Defense Buff Messages
// =========================================

const generateAttackAndDefenseBuffMessage = (isVictory) => {
  const messages = [
    "🗡️💫 Your gear turned the tide in your favor!",
    "🛡️⚔️ With your gear, you overcame all obstacles!",
    "🛡️💥 The power of your gear sealed your success!",
    "⚔️💎 Your gear's strength was the key to your win!",
    "🛡️🌟 Your finely crafted gear made all the difference!",
    "🗡️⚔️ Armed with your trusty gear, you claimed victory!",
  ];
  return getRandomMessage(messages);
};

// No Encounter Messages
// =====================

// Messages for no encounter
const getNoEncounterMessage = () => {
  const messages = [
    "🌲🕊️ A quiet day. No monsters were encountered.",
    "🌿☀️ The area is peaceful. No monsters in sight.",
    "🌸🌼 Nothing stirs. No monsters to be found.",
    "🌳🦋 All is calm. No monsters appear.",
    "🌲🕊️ A serene day with no threats.",
    "🌸🌼 Peaceful surroundings; no monsters encountered.",
    "🌿🦋 You hear the wind rustling through the trees, but nothing more.",
    "🌸🦋 A butterfly lands upon a flower. There is no danger today.",
    "🌼🌿 The birds are singing. You are at peace.",
  ];
  return getRandomMessage(messages);
};

// Miscellaneous Messages
// ======================

// Messages for defense buff victory
const generateDefenseBuffVictoryMessage = () => {
  const messages = [
    "🛡️🎉 Your armor helped you secure the win!!",
    "🛡️✨ With your armor's protection, victory is yours!",
    "🛡️🌟 Thanks to your armor, you emerged victorious! "
  ];
  return getRandomMessage(messages);
};

// Messages for no items found after victory
const getNoItemsFoundMessage = (character, randomMonster) => {
  return `🎉 ${character.name} defeated the ${randomMonster.name} but found no items to loot.`;
};

// Messages for failed defeat after blocking the attack
const getFailedToDefeatMessage = (character, randomMonster, originalDamage) => {
  return `${character.name} blocked the attack! You would have taken ${originalDamage} ❤️ hearts of damage but your gear protected you! You got away from the fight with no injuries.`;
};

// Final Outcome Messages
// ======================

// Modified function to include check for attack buff
const generateFinalOutcomeMessage = (randomValue, defenseSuccess = false, attackSuccess = false, adjustedRandomValue = 0, finalDamage = 0) => {
  console.log(`[DEBUG3] Input to generateFinalOutcomeMessage - randomValue: ${randomValue}, defenseSuccess: ${defenseSuccess}, attackSuccess: ${attackSuccess}, adjustedRandomValue: ${adjustedRandomValue}, finalDamage: ${finalDamage}`);

  let message;

  if (attackSuccess) {
    message = generateAttackBuffMessage(defenseSuccess, attackSuccess, adjustedRandomValue, finalDamage);
  } else if (defenseSuccess) {
    message = generateDefenseBuffMessage(defenseSuccess, attackSuccess, adjustedRandomValue);
  } else {
    message = generateDamageMessage(finalDamage);
  }

  console.log(`[DEBUG4] Output from generateFinalOutcomeMessage: ${message}`);
  return message;
};


// Type Action Map
// ===============

// Function to get the article 'a' or 'an' for an item based on its name
function getArticleForItem(itemName) {
  const vowels = ['A', 'E', 'I', 'O', 'U'];
  return vowels.includes(itemName.charAt(0).toUpperCase()) ? 'an' : 'a';
}

// Map for actions and colors based on item types
const typeActionMap = {
'1h': { action: 'got', color: '#FF5733' },
'2h': { action: 'got', color: '#33FF57' },
'Chest': { action: 'donned', color: '#3357FF' },
'Legs': { action: 'equipped', color: '#FF33A1' },
'Natural': { action: 'collected', color: '#D2B48C' },
'Ore': { action: 'excavated', color: '#708090' },
'Ancient Parts': { action: 'found an ancient', color: '#CC7722' },
'Creature': { action: 'captured', color: '#008080' },
'Mushroom': { action: 'foraged', color: '#FF0000' },
'Plant': { action: 'picked', color: '#00FF00' },
'Fish': { action: 'caught', color: '#0000FF' },
'Fruit': { action: 'harvested', color: '#FFC0CB' },
'Meat': { action: 'butchered', color: '#8B0000' },
'Monster': { action: 'found', color: '#FF00FF' },
'Dairy': { action: 'processed', color: '#FFFFFF' },
'Protein': { action: 'gathered some', color: '#FFA500' },
'Sweets': { action: 'collected some', color: '#FFFF00' },
'Grain': { action: 'reaped some', color: '#A52A2A' },
'Vegetable': { action: 'harvested', color: '#00FF00' },
'Fungi': { action: 'foraged', color: '#FF0000' },
'Seafood': { action: 'caught some', color: '#0000FF' },
'Special': { action: 'acquired a special', color: '#800080' },
'Head': { action: 'put on', color: '#FFD700' },
'Bow': { action: 'aimed with', color: '#ADFF2F' },
'Potion': { action: 'brewed', color: '#7FFF00' },
'Inedible': { action: 'found an inedible', color: '#696969' },
};

// Module Exports
// ==============

module.exports = {
  // No Encounter
  getNoEncounterMessage,
  // Damage
  generateDamageMessage,
  // Victory
  generateVictoryMessage,
  // Attack Buff
  generateAttackBuffMessage,
  generateAttackBuffMessageReduced,
  generateAttackBuffMessageKOPrevented,
  // Defense Buff
  generateDefenseBuffMessage,
  generateDefenseBuffMessageReduced,
  generateDefenseBuffMessageKOPrevented,
  generateDefenseBuffVictoryMessage,
  // Combined Buff
  generateAttackAndDefenseBuffMessage,
  // Miscellaneous
  getNoItemsFoundMessage,
  getFailedToDefeatMessage,
  generateFinalOutcomeMessage,
  // Type Action Map
  typeActionMap,
  getArticleForItem,
};
