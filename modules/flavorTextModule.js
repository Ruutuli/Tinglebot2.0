// flavorTextModule.js

const { capitalizeVillageName } = require('../utils/stringUtils');

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

// Utility function to get a random message from an array
const getRandomMessage = (messages) => {
  return messages[Math.floor(Math.random() * messages.length)];
};

// Generic message generator for different contexts
const generateContextualMessage = (messageSets, context, damage = null) => {
  const messages = messageSets[context] || messageSets.default;
  
  if (damage !== null) {
    return getRandomMessage(messages[damage] || messages.default || ["No message available."]);
  }
  
  return getRandomMessage(messages);
};

// ============================================================================
// ------------------- Message Sets -------------------
// ============================================================================

// Combat message sets
const COMBAT_MESSAGES = {
  damage: {
    normal: {
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
      4: [
        "💥💀 A brutal assault! You lose ❤️❤️❤️❤️ 4 hearts!",
        "💥🌳 The monster's power is immense! Lose ❤️❤️❤️❤️ 4 hearts!",
        "💥💀 You're battered by the attack! Lose ❤️❤️❤️❤️ 4 hearts!",
        "💥⚔️ A crushing blow! Lose ❤️❤️❤️❤️ 4 hearts!",
        "🛡️💔 Your defenses are overwhelmed! Lose ❤️❤️❤️❤️ 4 hearts!",
        "⚡️😖 The impact is devastating! Lose ❤️❤️❤️❤️ 4 hearts!",
      ],
      5: [
        "💥💀 An overwhelming attack! You lose ❤️❤️❤️❤️❤️ 5 hearts!",
        "💥🌳 The monster's might is terrifying! Lose ❤️❤️❤️❤️❤️ 5 hearts!",
        "💥💀 You're nearly knocked down! Lose ❤️❤️❤️❤️❤️ 5 hearts!",
        "💥⚔️ A catastrophic strike! Lose ❤️❤️❤️❤️❤️ 5 hearts!",
        "🛡️💔 Your armor offers no protection! Lose ❤️❤️❤️❤️❤️ 5 hearts!",
        "⚡️😖 The force is unbearable! Lose ❤️❤️❤️❤️❤️ 5 hearts!",
      ],
      6: [
        "💥💀 A devastating assault! You lose ❤️❤️❤️❤️❤️❤️ 6 hearts!",
        "💥🌳 The monster's fury knows no bounds! Lose ❤️❤️❤️❤️❤️❤️ 6 hearts!",
        "💥💀 You're thrown to the ground! Lose ❤️❤️❤️❤️❤️❤️ 6 hearts!",
        "💥⚔️ An apocalyptic strike! Lose ❤️❤️❤️❤️❤️❤️ 6 hearts!",
        "🛡️💔 Nothing can stop this attack! Lose ❤️❤️❤️❤️❤️❤️ 6 hearts!",
        "⚡️😖 The world spins around you! Lose ❤️❤️❤️❤️❤️❤️ 6 hearts!",
      ],
      7: [
        "💥💀 A cataclysmic attack! You lose ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!",
        "💥🌳 The monster's power is beyond comprehension! Lose ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!",
        "💥💀 You're completely overwhelmed! Lose ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!",
        "💥⚔️ A world-ending strike! Lose ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!",
        "🛡️💔 All defenses are shattered! Lose ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!",
        "⚡️😖 Reality itself seems to bend! Lose ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!",
      ],
      8: [
        "💥💀 An annihilation-level attack! You lose ❤️❤️❤️❤️❤️❤️❤️❤️ 8 hearts!",
        "💥🌳 The monster's might defies reality! Lose ❤️❤️❤️❤️❤️❤️❤️❤️ 8 hearts!",
        "💥💀 You're obliterated by the force! Lose ❤️❤️❤️❤️❤️❤️❤️❤️ 8 hearts!",
        "💥⚔️ A universe-shattering strike! Lose ❤️❤️❤️❤️❤️❤️❤️❤️ 8 hearts!",
        "🛡️💔 Existence itself offers no protection! Lose ❤️❤️❤️❤️❤️❤️❤️❤️ 8 hearts!",
        "⚡️😖 Time and space seem to collapse! Lose ❤️❤️❤️❤️❤️❤️❤️❤️ 8 hearts!",
      ],
      KO: [
        "💥💀 Everything seems to be going wrong... you lose all hearts and the fight...",
        "💥💀 You couldn't withstand the attack... all hearts lost!",
        "💥💀 A devastating blow! You lose all hearts and fall...",
        "⭐🌷 Stars wink in front of your eyes. Your wounds throb painfully. You can't continue. You must retreat... all hearts lost!",
        "🛡️💔 Crushed by the monster's might... all hearts lost!",
        "⚡️😖 Overwhelmed... you lose all hearts and fall...",
      ],
    },
    helpWanted: {
      victoryEndings: [
        "But you still managed to defeat the monster... No loot though",
        "But somehow you pulled through and beat it... No loot though",
        "But you still came out on top... No loot though",
        "But you managed to take it down anyway... No loot though",
        "But you still got the job done... No loot though",
        "But you somehow defeated it despite the damage... No loot though",
        "But you still emerged victorious... No loot though",
        "But you managed to finish it off... No loot though",
        "But you still won the fight... No loot though",
        "But you somehow pulled off the victory... No loot though",
        "But you still managed to defeat the monster... No rewards though",
        "But somehow you pulled through and beat it... No rewards though",
        "But you still came out on top... No rewards though",
        "But you managed to take it down anyway... No rewards though",
        "But you still got the job done... No rewards though",
        "But you somehow defeated it despite the damage... No rewards though",
        "But you still emerged victorious... No rewards though",
        "But you managed to finish it off... No rewards though",
        "But you still won the fight... No rewards though",
        "But you somehow pulled off the victory... No rewards though",
        "But you still managed to defeat the monster... No spoils though",
        "But somehow you pulled through and beat it... No spoils though",
        "But you still came out on top... No spoils though",
        "But you managed to take it down anyway... No spoils though",
        "But you still got the job done... No spoils though",
        "But you somehow defeated it despite the damage... No spoils though",
        "But you still emerged victorious... No spoils though",
        "But you managed to finish it off... No spoils though",
        "But you still won the fight... No spoils though",
        "But you somehow pulled off the victory... No spoils though",
      ],
    },
  },
  victory: {
    normal: [
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
    ],
    modCharacter: [
      "🌟✨ With divine power, {characterName} the {modTitle} of {modType} effortlessly vanquishes the monster!",
      "👑💫 The {modTitle} of {modType} demonstrates their legendary prowess - the monster stands no chance!",
      "⚡️🔥 {characterName}'s {modTitle} powers surge forth, obliterating the monster with ease!",
      "🌙✨ Ancient {modType} magic flows through {characterName} as they dispatch the monster with grace!",
      "💎🌟 The {modTitle} of {modType} channels their divine authority - the monster crumbles before their might!",
      "🔮✨ {characterName} wields the power of a true {modTitle} - the monster is but dust in their wake!",
      "⭐️💫 With the wisdom of a {modTitle}, {characterName} turns the monster's own strength against it!",
      "🌺✨ The {modType} essence within {characterName} manifests - the monster is overwhelmed by pure divinity!",
      "⚔️🌟 {characterName} the {modTitle} demonstrates why they are feared and revered - the monster falls instantly!",
      "💫🔮 The {modTitle} of {modType} shows no mercy - the monster is reduced to nothing but memories!",
      "🌟💎 {characterName}'s {modType} heritage awakens - the monster's fate was sealed from the start!",
      "✨👑 The {modTitle} of {modType} moves with otherworldly precision - the monster never stood a chance!",
      "🔥💫 {characterName} channels the ancient power of their {modTitle} lineage - the monster is obliterated!",
      "🌙💎 The {modType} magic coursing through {characterName} is overwhelming - the monster is annihilated!",
      "⭐️✨ With the authority of a true {modTitle}, {characterName} dispatches the monster with divine efficiency!",
    ],
  },
  buff: {
    attack: {
      success: [
        "⚔️✨ Your weapon's power helped you secure the win!",
        "🛡️💪 Thanks to your weapon, you won with ease!",
        "🔮⚔️ Your weapon made the difference in your victory!",
        "⚔️🌺 Your years of training have paid off in full. The monster falls before you!",
      ],
      reduced: (reducedDamage, originalDamage) => [
        `💪✨ The monster attacked, but you fought back! Thanks to your weapon, you took ${originalDamage - reducedDamage} ❤️ less heart! Without it, you would have taken ${originalDamage} ❤️ hearts!`,
        `🛡️⚔️ The monster's attack was strong, but you fought back bravely! Your weapon's power reduced the damage to ${reducedDamage} ❤️ hearts! Originally, it was ${originalDamage} ❤️ hearts.`,
        `🔮🔥 The monster struck hard, but you retaliated! The attack was less severe thanks to your weapon, reducing the damage to ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`,
        `🗡️🌿 Your weapon redirects the monster's attack. It's just a scratch! Damage reduced ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`,
      ],
      koPrevented: (originalDamage) => [
        `💪✨ The monster attacked and almost knocked you out! Without your weapon, you would have been KO'd. Instead, you took ${originalDamage} ❤️ hearts of damage!`,
        `🛡️⚔️ A near-KO attack was thwarted by your weapon! You would have been knocked out, but you only took ${originalDamage} ❤️ hearts of damage!`,
        `🔮🔥 Your weapon saved you from a KO! The monster's attack was fierce, but you only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!`,
        `🚨🍃 Your instincts sense danger, giving you enough time to avoid a lethal blow! You only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!`,
      ],
    },
    defense: {
      success: [
        "🛡️✨ Your armor blocked the attack! No damage taken!",
        "⚔️🛡️ Thanks to your armor, you emerged unscathed!",
        "🔰💫 Your armor's protection made all the difference!",
        "🛡️🌱 You feel the strike, but no pain follows.",
      ],
      reduced: (reducedDamage, originalDamage) => [
        `💪✨ The monster attacked, but your armor absorbed the blow! You took ${originalDamage - reducedDamage} ❤️ less heart! Without it, you would have taken ${originalDamage} ❤️ hearts!`,
        `🛡️⚔️ The monster's attack was strong, but your armor held! You took ${reducedDamage} ❤️ hearts! Originally, it was ${originalDamage} ❤️ hearts.`,
        `🔰🔥 The monster struck hard, but your armor protected you! The attack was less severe, reducing the damage to ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`,
        `🛡️🌳 The monster's attack will undoubtedly bruise, but it could've been worse. The attack was less severe, reducing the damage to ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`,
      ],
      koPrevented: (originalDamage) => [
        `💪✨ The monster attacked and almost knocked you out! Without your armor, you would have been KO'd. Instead, you took ${originalDamage} ❤️ hearts of damage!`,
        `🛡️⚔️ A near-KO attack was thwarted by your armor! You would have been knocked out, but you only took ${originalDamage} ❤️ hearts of damage!`,
        `🔰🔥 Your armor saved you from a KO! The monster's attack was fierce, but you only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!`,
        `🚫🌿 The blow takes your breath away, but you're still standing! You only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!`,
      ],
    },
    combined: [
      "🗡️💫 Your gear turned the tide in your favor!",
      "🛡️⚔️ With your gear, you overcame all obstacles!",
      "🛡️💥 The power of your gear sealed your success!",
      "⚔️💎 Your gear's strength was the key to your win!",
      "🛡️🌟 Your finely crafted gear made all the difference!",
      "🗡️⚔️ Armed with your trusty gear, you claimed victory!",
    ],
  },
};

// No encounter message sets
const NO_ENCOUNTER_MESSAGES = {
  rudania: [
    "🔥 The valley holds steady. No monsters in sight.",
    "⚒️ The forge burns, but the roads stay quiet.",
    "🌋 The mountain watches silently. No threats today.",
    "🎉 Daily life carries on—no signs of trouble.",
    "🪓 Fields are tended, borders are clear. All is calm.",
  ],
  inariko: [
    "💦 The river runs smooth. No disturbances reported.",
    "🏞️ Still waters surround the village. No threats nearby.",
    "📖 Stories are shared, not battles. The day is quiet.",
    "🌀 The wheel turns, steady and uneventful.",
    "❄️ The cool air carries no movement from the wilds.",
  ],
  vhintl: [
    "🌿 No rustle but the wind. The woods are still.",
    "🕸️ Even the quiet corners hold no danger today.",
    "🪶 A distant melody carries through the trees. No threats linger.",
    "🍃 Hidden paths are clear. Nothing stirs in the undergrowth.",
    "🌲 The forest watches, but no monsters cross its edge.",
  ],
  default: [
    "🕊️ A calm day—no danger to speak of.",
    "🌿 All paths remained clear. No monsters seen.",
    "🌸 No movement but your own. It's quiet out here.",
    "🌳 The area holds steady. Nothing hostile found.",
  ],
};



// ============================================================================
// ------------------- Core Message Generators -------------------
// ============================================================================

// Damage Messages
const generateDamageMessage = (damage) => {
  return generateContextualMessage(COMBAT_MESSAGES.damage, 'normal', damage);
};

const generateHelpWantedDamageMessage = (damage) => {
  const victoryEnding = getRandomMessage(COMBAT_MESSAGES.damage.helpWanted.victoryEndings);
  const baseMessages = COMBAT_MESSAGES.damage.normal;
  
  if (damage === 'KO') {
    return getRandomMessage(baseMessages.KO);
  }
  
  const baseMessage = getRandomMessage(baseMessages[damage] || baseMessages[1]);
  return `${baseMessage} ${victoryEnding}`;
};

// Victory Messages
const generateVictoryMessage = (randomValue, defenseSuccess = false, attackSuccess = false) => {
  return getRandomMessage(COMBAT_MESSAGES.victory.normal);
};

const generateModCharacterVictoryMessage = (characterName, modTitle, modType) => {
  const message = getRandomMessage(COMBAT_MESSAGES.victory.modCharacter);
  return message
    .replace('{characterName}', characterName)
    .replace('{modTitle}', modTitle)
    .replace('{modType}', modType);
};

// Attack Buff Messages
const generateAttackBuffMessage = (attackSuccess, adjustedRandomValue, finalDamage) => {
  return getRandomMessage(COMBAT_MESSAGES.buff.attack.success);
};

const generateAttackBuffMessageReduced = (reducedDamage, originalDamage) => {
  const messages = COMBAT_MESSAGES.buff.attack.reduced(reducedDamage, originalDamage);
  return getRandomMessage(messages);
};

const generateAttackBuffMessageKOPrevented = (originalDamage) => {
  const messages = COMBAT_MESSAGES.buff.attack.koPrevented(originalDamage);
  return getRandomMessage(messages);
};

// Defense Buff Messages
const generateDefenseBuffMessage = (defenseSuccess, adjustedRandomValue, finalDamage) => {
  return getRandomMessage(COMBAT_MESSAGES.buff.defense.success);
};

const generateDefenseBuffMessageReduced = (reducedDamage, originalDamage) => {
  const messages = COMBAT_MESSAGES.buff.defense.reduced(reducedDamage, originalDamage);
  return getRandomMessage(messages);
};

const generateDefenseBuffMessageKOPrevented = (originalDamage) => {
  const messages = COMBAT_MESSAGES.buff.defense.koPrevented(originalDamage);
  return getRandomMessage(messages);
};

const generateDefenseBuffVictoryMessage = () => {
  return getRandomMessage(COMBAT_MESSAGES.buff.defense.success);
};

// Combined Buff Messages
const generateAttackAndDefenseBuffMessage = (isVictory) => {
  return getRandomMessage(COMBAT_MESSAGES.buff.combined);
};

// No Encounter Messages
const getNoEncounterMessage = (currentVillage) => {
  const villageKey = currentVillage ? capitalizeVillageName(currentVillage).toLowerCase() : "default";
  const messages = NO_ENCOUNTER_MESSAGES[villageKey] || NO_ENCOUNTER_MESSAGES.default;
  return getRandomMessage(messages);
};

// ============================================================================
// ------------------- Miscellaneous Messages -------------------
// ============================================================================

const getNoItemsFoundMessage = (character, randomMonster) => {
  return `🎉 ${character.name} defeated the ${randomMonster.name} but found no items to loot.`;
};

const getFailedToDefeatMessage = (character, randomMonster, originalDamage) => {
  return `${character.name} blocked the attack! You would have taken ${originalDamage} ❤️ hearts of damage but your gear protected you! You got away from the fight with no injuries.`;
};

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

// ============================================================================
// ------------------- Type Action Map -------------------
// ============================================================================

// Function to get the article 'a' or 'an' for an item based on its name
function getArticleForItem(itemName) {
  const vowels = ["A", "E", "I", "O", "U"];
  return vowels.includes(itemName.charAt(0).toUpperCase()) ? "an" : "a";
}

// Map for actions and colors based on item types
const typeActionMap = {
  "1h": { action: "got", color: "#FF5733" },
  "2h": { action: "got", color: "#33FF57" },
  Chest: { action: "donned", color: "#3357FF" },
  Legs: { action: "equipped", color: "#FF33A1" },
  Natural: { action: "collected", color: "#D2B48C" },
  Ore: { action: "excavated", color: "#708090" },
  "Ancient Parts": { action: "found", color: "#CC7722" },
  Creature: { action: "captured", color: "#008080" },
  Mushroom: { action: "foraged", color: "#FF0000" },
  Plant: { action: "picked", color: "#00FF00" },
  Fish: { action: "caught", color: "#0000FF" },
  Fruit: { action: "harvested", color: "#FFC0CB" },
  Meat: { action: "butchered", color: "#8B0000" },
  Monster: { action: "found", color: "#FF00FF" },
  Dairy: { action: "processed", color: "#FFFFFF" },
  Protein: { action: "gathered some", color: "#FFA500" },
  Sweets: { action: "collected some", color: "#FFFF00" },
  Grain: { action: "reaped some", color: "#A52A2A" },
  Vegetable: { action: "harvested", color: "#00FF00" },
  Fungi: { action: "foraged", color: "#FF0000" },
  Seafood: { action: "caught some", color: "#0000FF" },
  Special: { action: "acquired a special", color: "#800080" },
  Head: { action: "put on", color: "#FFD700" },
  Bow: { action: "aimed with", color: "#ADFF2F" },
  Potion: { action: "brewed", color: "#7FFF00" },
  Inedible: { action: "found an inedible", color: "#696969" },
};

// ============================================================================
// ------------------- Gathering and Crafting Flavor Text -------------------
// ============================================================================

const generateGatherFlavorText = (itemType) => {
  const typeToFlavorText = {
    "1h": [
      "⚔️ A reliable one-handed blade, worn but ready for use.",
      "🛡️ Balanced and sturdy—well-suited for quick strikes and defense.",
      "🗡️ Light in the hand, with signs of careful craftsmanship.",
      "🔧 A compact tool made for action, not ceremony.",
    ],
    "2h": [
      "⚔️ A broad weapon with real heft, built for power.",
      "💪 Heavy, slow, but strong—a tool for clearing the way.",
      "🪓 This one's made to leave a mark and hold its own.",
      "🔨 Thick grip, long reach. Not subtle, but effective.",
    ],
    "Ancient Parts": [
      "🔮 Odd remnants from a forgotten time, still humming with purpose.",
      "🏺 These pieces once served a machine now long gone.",
      "🔧 Complex bits and pieces, built to outlast their makers.",
      "📡 Still intact—barely—and not built by modern hands.",
    ],
    Creature: [
      "🌾 Unusual lifeforms gathered from the edges of the wild.",
      "🌿 Small and strange, these creatures thrive where few tread.",
      "🍃 Collected quickly, before they slipped out of reach.",
      "🪴 Elusive and light-footed—barely caught in time.",
      "🐾 They don't stay still long, but they're in the basket now.",
    ],
    Dairy: [
      "🥛 Clean and fresh, the result of a practiced hand.",
      "🧀 Carefully collected, set aside for preserving or trade.",
      "🍶 Nourishing, simple, and always in demand.",
      "🐄 The yield was small but reliable—just enough.",
    ],
    Fish: [
      "🎣 Pulled from the water with a steady hand.",
      "🐟 Slippery and quick, but not quick enough.",
      "🌊 Caught clean—gills still twitching.",
      "🪣 Added to the day's haul, still glinting in the light.",
    ],
    Fruit: [
      "🍎 Ripe and ready, picked at just the right moment.",
      "🍇 Sweet and full, these won't last long in the sun.",
      "🍊 A good bunch—unblemished and easy to carry.",
      "🌿 Found low on the branches, hiding in plain sight.",
    ],
    Meat: [
      "🍖 A solid cut, fresh and ready for the fire.",
      "🥩 Enough to feed a few or fill a pack.",
      "🍗 Skinned and cleaned, just needs a cook.",
      "🥓 Stashed quickly—this won't stay fresh forever.",
      "🍖 No frills, just something to roast or trade.",
      "🥩 Bagged up, heavy and useful.",
      "🍗 Plenty for now. Hopefully enough for later.",
      "🥓 Straight from the field, nothing wasted.",
    ],
    Monster: [
      "👹 The creature's remains hold strange materials of interest.",
      "🔮 What's left behind isn't just scrap—it hums with energy.",
      "👾 Gnarled pieces, clearly touched by something unnatural.",
      "🩸 Tough hide, brittle claw—still worth something.",
    ],
    Mushroom: [
      "🍄 Found nestled near tree roots, firm and intact.",
      "🌲 A good collection—some edible, some… probably not.",
      "🌿 Easy to miss, but worth the stoop to gather.",
      "🧺 Plucked carefully—delicate, but useful.",
    ],
    Natural: [
      "🌳 A small haul of wood, stone, and other basics.",
      "🪵 Gathered from the land, no tools wasted.",
      "🌿 Rough, raw, and ready to be shaped into something better.",
      "🌱 Good stock for crafting or trade.",
    ],
    Ore: [
      "⛏️ A solid find, chipped loose from the rock face.",
      "💎 Raw and unpolished, but valuable all the same.",
      "🏔️ Tough to reach, but worth the weight.",
      "🪨 Uncut and gritty—exactly what's needed for smelting.",
    ],
    Plant: [
      "🌿 Useful herbs and greens, gathered with care.",
      "🍃 Picked before they wilted—still potent.",
      "🌱 Recognizable by scent alone—good for tinctures or meals.",
      "🌻 These will dry out quick, but there's time to use them.",
    ],
    Protein: [
      "🥩 Cleaned and stored, ready to be cooked or traded.",
      "🍗 Light enough to carry, but filling enough to matter.",
      "🍖 A solid source of strength, plain and simple.",
      "🐾 Bagged up and good to go—nothing wasted.",
    ],
    default: [
      "🧺 A worthwhile haul with more than a few useful finds.",
      "📦 Packed up and ready—plenty of good material here.",
      "🏞️ Not the rarest day, but not a wasted one either.",
      "🔍 Practical, serviceable, and well worth the time.",
      "⚙️ A solid collection—tools, parts, and odds and ends.",
      "📚 Most folks would walk right past it—but you didn't.",
    ],
  };

  // Use the provided type, or fall back to the default if the type is unknown
  const flavorOptions = typeToFlavorText[itemType] || typeToFlavorText["default"];

  // Get base flavor text (Scholar boost flavor is handled separately in the boost effect section)
  const baseFlavorText = getRandomMessage(flavorOptions || ["A successful gathering trip!"]);
  
  return baseFlavorText;
};

const generateCraftingFlavorText = (job) => {
  console.log(`[generateCraftingFlavorText]: Job provided: ${job}`);

  const jobToFlavorText = {
    researcher: [
      "📚 Notes became schematics; schematics became something you can actually use.",
      "🔍 Field data translated into a working proof of concept.",
      "🧪 Curiosity ran the numbers, then built the prototype.",
    ],
    blacksmith: [
      "⚒️ Hammer, heat, repeat. Metal drew into form under practiced strikes.",
      "🔥 From coal bed to quench, the piece took its temper and purpose.",
      "🛡️ Built to take a beating—the forge mark still cooling on the steel.",
    ],
    "mask maker": [
      "🎭 Cut, carve, fit. A new face takes shape with its own intent.",
      "🖌️ Pigment and lacquer set; another story you can wear.",
      "👁️ There's something in the eyeholes—you swear it's watching back.",
    ],
    weaver: [
      "🧵 Warp set, shuttle flying—cloth grows by steady habit.",
      "🪡 Tight weave, clean selvedge; this will hold up in the wilds.",
      "📐 Pattern nods to old motifs without making a fuss about it.",
    ],
    artist: [
      "🖼️ Sketch to line, line to color—the piece landed where it needed to.",
      "🎨 It doesn't shout; it just makes you look twice.",
      "✍️ Finished, signed, and ready to hang (or haggle over).",
    ],
    cook: [
      "🍳 Knife work, pan heat; nothing fancy, just solid food.",
      "🧂 Seasoned right and cooked through—travel rations upgraded.",
      "🍲 Stew thickened slow; smells good enough to pull folks off the road.",
    ],
    craftsman: [
      "🛠️ Measure twice, cut once; the fit came out clean.",
      "🔧 Scrap to useful—now it's a tool you'll actually reach for.",
      "📦 No ornament, all utility. Exactly what was needed.",
    ],
    witch: [
      "🔮 Herb, ash, stir clockwise. The mix settled into a usable draught.",
      "🌙 Low words, steady focus; the charm holds.",
      "🧹 When the steam cleared, the reagents agreed to work together.",
    ],
    default: [
      "🪧 Put in the time; got something workable.",
      "📦 Started as an idea, ended as gear.",
      "⚙️ Not pretty, but it does the job.",
    ],
  };

  // Normalize the job string
  const normalizedJob = typeof job === 'string' ? job.trim().toLowerCase() : 'default';

  const flavorOptions = jobToFlavorText[normalizedJob] || jobToFlavorText["default"];
  return getRandomMessage(flavorOptions || ["A successful crafting session!"]);
};

// ============================================================================
// ------------------- Blight-Affected Roll Flavor Text -------------------
// ============================================================================

// Blight message sets
const BLIGHT_MESSAGES = {
  stage2: {
    combat: [
      "💀 A surge of unnatural strength courses through your limbs—the Blight is spreading, and you're starting to feel powerful.",
      "🩸 Your fever burns low, but your muscles twitch with uncanny speed. The infection sharpens your instincts.",
      "🌑 The Blight whispers through your bloodstream, turning your nausea into a cold, focused fury.",
      "⚡ The corruption claws at your core, but your strikes land harder than ever before.",
      "🖤 A strange clarity overtakes you. It's not you fighting—it's something deeper, darker."
    ],
    loot: [
      "💀 Your fingers move with eerie confidence—the Blight seems to guide your search.",
      "🩸 Beneath your skin, something writhes. You feel drawn to materials others overlook.",
      "🌑 A pulse of Malice runs through you as your hands uncover hidden remnants.",
      "⚡ You sift through the carnage with precision born of something... else.",
      "🖤 The corruption inside you leads you to the most potent fragments left behind."
    ],
    victory: [
      "💀 Despite the blight's corruption, you emerge victorious, though the cost is clear...",
      "🩸 Your blight-enhanced strength carried you to victory, but at what price?",
      "🌑 The dark influence within you proved to be both a curse and a weapon.",
      "⚡ Your corrupted blood burned with energy, turning your pain into power for this victory.",
      "🖤 The blight's corruption resonated with the monster's essence, creating an eerie victory."
    ],
    expiry: [
      "💀 The healing request for **{characterName}** has expired. {healerName}'s patience has worn thin, and the opportunity for gentle healing has passed. The blight's corruption continues to spread unchecked.",
      "🩸 Time has run out for **{characterName}**'s healing. {healerName} can no longer offer their aid, and the blight's grip tightens with each passing moment.",
      "🌑 The healing window has closed for **{characterName}**. {healerName} has moved on to other patients, leaving the blight's corruption to fester and grow stronger.",
      "⚡ The chance for healing has slipped away for **{characterName}**. {healerName}'s offer has expired, and the blight's influence continues to spread through their veins.",
      "🖤 The healing opportunity for **{characterName}** has been lost. {healerName} can no longer provide their aid, and the blight's corruption deepens its hold."
    ],
    prefix: [
      "💀 The blight's corruption guided your hands to ",
      "🩸 Your blight-enhanced senses detected ",
      "🌑 The dark influence within you drew you to ",
      "⚡ Your corrupted blood resonated with ",
      "🖤 The corruption in your veins attracted "
    ],
    rollBoost: [
      "💀 The Blight's corruption surges through you, enhancing your combat prowess beyond normal limits.",
      "🩸 Your feverish corruption sharpens your reflexes, making you faster and more precise.",
      "🌑 The dark energy within you amplifies your strength, turning a mediocre roll into something formidable.",
      "⚡ Your blight-stained blood burns with unnatural power, boosting your performance significantly.",
      "🖤 The corruption in your veins resonates with the monster's essence, enhancing your combat abilities."
    ]
  },
  stage3: {
    combat: [
      "💀 The Blight is no longer content to linger—it floods your veins, fueling every swing.",
      "🩸 You laugh, or scream—it's hard to tell. The hallucinations blur with your battle frenzy.",
      "🌑 The monsters don't attack you anymore. Maybe they recognize you as kin.",
      "⚡ Your reflexes are too fast, too sharp. Something ancient is helping you strike.",
      "🖤 You feel no pain—just momentum. The Blight is your blade, and you are its vessel."
    ],
    loot: [
      "💀 A haze clouds your vision, yet your hands find treasure with uncanny ease.",
      "🩸 The fever intensifies, but so does your luck. Valuable remnants seem to call out to you.",
      "🌑 The Malice inside you resonates with what's left behind. You know what's useful.",
      "⚡ Your senses warp, stretching beyond human limits. You *see* what others miss.",
      "🖤 You no longer search—*it* finds you. The Blight chooses what you take."
    ],
    victory: [
      "💀 The blight's grip tightens, but your desperation and corrupted strength secured victory...",
      "🩸 Your feverish corruption drove you to fight harder, achieving victory through unnatural means.",
      "🌑 The dark influence has taken hold, but you channeled it into devastating attacks for victory.",
      "⚡ Your blight-stained soul crackled with malevolent energy, turning fear into fury for victory.",
      "🖤 The corruption within you resonated with the monster's own darkness, securing your victory."
    ],
    expiry: [
      "💀 The healing request for **{characterName}** has expired. {healerName}'s concern grows as the blight's corruption reaches more critical levels, making future healing attempts more challenging.",
      "🩸 Time has run out for **{characterName}**'s healing. {healerName} watches helplessly as the blight's corruption intensifies, spreading deeper into their being.",
      "🌑 The healing window has closed for **{characterName}**. {healerName} fears the blight's corruption may soon reach a point of no return, making recovery increasingly difficult.",
      "⚡ The chance for healing has slipped away for **{characterName}**. {healerName} knows that with each passing moment, the blight's corruption becomes more entrenched and dangerous.",
      "🖤 The healing opportunity for **{characterName}** has been lost. {healerName} worries that the blight's corruption may soon reach critical levels that could prove fatal."
    ],
    prefix: [
      "💀 The blight's corruption intensified, leading you to ",
      "🩸 Your feverish corruption heightened your awareness of ",
      "🌑 The dark energy within you became a beacon for ",
      "⚡ Your blight-enhanced perception uncovered ",
      "🖤 The corruption in your blood resonated with "
    ],
    rollBoost: [
      "💀 The Blight's corruption has intensified, dramatically amplifying your combat abilities beyond human limits.",
      "🩸 Your feverish corruption has reached new heights, making you unnaturally fast and precise.",
      "🌑 The dark energy within you has grown stronger, turning even a poor roll into a devastating attack.",
      "⚡ Your blight-stained blood pulses with malevolent power, significantly boosting your performance.",
      "🖤 The corruption in your veins has deepened, resonating powerfully with the monster's essence."
    ]
  },
  stage4: {
    combat: [
      "💀 Your eyes burn like Malice, your heart pounds with something inhuman. You're no longer entirely yourself.",
      "🩸 Your body betrays you with every motion—but in doing so, grants terrifying speed.",
      "🌑 The rage is endless, the strength unholy. Every strike is a scream you can't voice.",
      "⚡ Your soul howls with the Blight's power, each hit a flash of destruction.",
      "🖤 The monsters cower now. They see their future in your eyes, and it terrifies them."
    ],
    loot: [
      "💀 The air bends around you. The Blight draws rarest spoils into your path like a magnet.",
      "🩸 Your presence corrupts the land itself—and in the wreckage, riches bloom.",
      "🌑 You walk among the remains, and the strongest remnants cling to you like flies to rot.",
      "⚡ The Blight inside you trembles with hunger. It knows what is valuable, and it *takes* it.",
      "🖤 You no longer scavenge. You *absorb*. The loot surrenders to your dark resonance."
    ],
    victory: [
      "💀 The blight's corruption has reached critical levels, but you channeled its power into overwhelming victory...",
      "🩸 Your blood burned with the fever of corruption, driving you to fight with desperate strength for victory.",
      "🌑 The dark influence has consumed much of your being, but you wielded it as a weapon of victory.",
      "⚡ Your blight-stained soul pulsed with malevolent energy, turning your agony into power for victory.",
      "🖤 The corruption within you has become a dark force that even monsters fear, securing your victory."
    ],
    expiry: [
      "💀 The healing request for **{characterName}** has expired. {healerName} is gravely concerned as the blight's corruption has reached critical levels, making any future healing attempts extremely dangerous.",
      "🩸 Time has run out for **{characterName}**'s healing. {healerName} fears the blight's corruption may soon reach terminal levels, with little hope for recovery.",
      "🌑 The healing window has closed for **{characterName}**. {healerName} knows that the blight's corruption has reached a critical point where any delay could prove fatal.",
      "⚡ The chance for healing has slipped away for **{characterName}**. {healerName} watches in horror as the blight's corruption continues to spread, reaching ever more dangerous levels.",
      "🖤 The healing opportunity for **{characterName}** has been lost. {healerName} fears that the blight's corruption may soon reach terminal levels, making recovery nearly impossible."
    ],
    prefix: [
      "💀 The blight's corruption has reached critical levels, drawing you to ",
      "🩸 Your feverish corruption has become so intense that it revealed ",
      "🌑 The dark energy within you has become a powerful beacon for ",
      "⚡ Your blight-enhanced senses detected ",
      "🖤 The corruption in your blood has become a magnet for "
    ],
    rollBoost: [
      "💀 The Blight's corruption has reached critical levels, transforming your combat abilities into something truly monstrous.",
      "🩸 Your feverish corruption has become overwhelming, making you faster and stronger than any normal being.",
      "🌑 The dark energy within you has reached its absolute peak, turning even the weakest roll into a devastating force.",
      "⚡ Your blight-stained blood burns with pure malevolence, dramatically amplifying your performance.",
      "🖤 The corruption in your veins has become an irresistible force of darkness that all monsters instinctively fear."
    ]
  },
  stage5: {
    combat: [
      "💀 You are a weapon now—wielded by the Blight itself. Your victory is its will made manifest.",
      "🩸 Your body burns with feverish death, but your blows carry the weight of calamity.",
      "🌑 There is no you. Only the corruption, howling through sinew and bone.",
      "⚡ You do not fight—you *obliterate*. The Blight has fully claimed its host.",
      "🖤 Darkness radiates from you. Even monsters recoil from the twisted power you now wield."
    ],
    loot: [
      "💀 The remains twist and shift in your presence, offering themselves to the corruption within.",
      "🩸 What's left behind is drawn to your decay, as if knowing its fate lies with you.",
      "🌑 No hand moves—but still the treasures come. The Blight has made you its beacon.",
      "⚡ Spoils seep toward you, as though alive and eager to be tainted.",
      "🖤 You are no longer a scavenger—you are the Blight's chosen harvester."
    ],
    victory: [
      "💀 The blight's corruption has reached terminal levels, but you channeled its overwhelming power into devastating victory...",
      "🩸 Your blood burned with the fever of approaching death, driving you to fight with desperate, unnatural strength for victory.",
      "🌑 The dark influence has nearly consumed your being, but you wielded it as a weapon of pure destruction for victory.",
      "⚡ Your blight-stained soul pulsed with malevolent energy, turning your agony into overwhelming power for victory.",
      "🖤 The corruption within you has become a force of pure darkness that even the strongest monsters fear, securing your victory."
    ],
    expiry: [
      "💀 The healing request for **{characterName}** has expired. {healerName} is devastated as the blight's corruption has reached terminal levels, making any healing attempt extremely risky and potentially fatal.",
      "🩸 Time has run out for **{characterName}**'s healing. {healerName} knows that the blight's corruption has reached terminal levels, where even the most skilled healing may not be enough.",
      "🌑 The healing window has closed for **{characterName}**. {healerName} fears that the blight's corruption has reached a point where recovery may be impossible, and death is imminent.",
      "⚡ The chance for healing has slipped away for **{characterName}**. {healerName} watches in despair as the blight's corruption reaches terminal levels, with little hope for survival.",
      "🖤 The healing opportunity for **{characterName}** has been lost. {healerName} knows that the blight's corruption has reached terminal levels, making any attempt at healing a desperate gamble with life itself."
    ],
    prefix: [
      "💀 The blight's corruption has reached terminal levels, irresistibly drawing you to ",
      "🩸 Your feverish corruption has become so overwhelming that it revealed ",
      "🌑 The dark energy within you has become an irresistible beacon for ",
      "⚡ Your blight-enhanced senses detected ",
      "🖤 The corruption in your blood has become an overwhelming magnet for "
    ],
    rollBoost: [
      "💀 The Blight's corruption has reached terminal levels, making you a living weapon of pure destruction.",
      "🩸 Your feverish corruption has become overwhelming, transforming you into something beyond human comprehension.",
      "🌑 The dark energy within you has reached its absolute peak, making every action devastatingly effective.",
      "⚡ Your blight-stained blood burns with pure malevolence, amplifying your abilities to supernatural levels.",
      "🖤 The corruption in your veins has become an irresistible force of darkness that all monsters instinctively fear."
    ]
  }
};

// ============================================================================
// ------------------- Blight Function Generators -------------------
// ============================================================================

const generateBlightRollFlavorText = (blightStage, rollType = 'combat') => {
  const stageKey = `stage${blightStage}`;
  const messages = BLIGHT_MESSAGES[stageKey]?.[rollType] || BLIGHT_MESSAGES.stage2[rollType];
  return getRandomMessage(messages);
};

const generateBlightVictoryFlavorText = (blightStage) => {
  const stageKey = `stage${blightStage}`;
  const messages = BLIGHT_MESSAGES[stageKey]?.victory || BLIGHT_MESSAGES.stage2.victory;
  return getRandomMessage(messages);
};

const generateBlightLootFlavorText = (blightStage, itemType) => {
  const baseFlavorText = generateGatherFlavorText(itemType);
  const stageKey = `stage${blightStage}`;
  const prefixes = BLIGHT_MESSAGES[stageKey]?.prefix || BLIGHT_MESSAGES.stage2.prefix;
  const prefix = getRandomMessage(prefixes);
  return prefix + baseFlavorText.toLowerCase();
};

const generateBlightSubmissionExpiryFlavorText = (characterName, healerName, blightStage, taskType) => {
  const stageKey = `stage${blightStage}`;
  const messages = BLIGHT_MESSAGES[stageKey]?.expiry || BLIGHT_MESSAGES.stage2.expiry;
  const baseMessage = getRandomMessage(messages)
    .replace('{characterName}', characterName)
    .replace('{healerName}', healerName);

  // Add task-specific consequences
  const taskConsequences = {
    'writing': ` Your writing task remains incomplete. Please use \`/blight heal\` to request a new healing task.`,
    'art': ` Your art task remains incomplete. Please use \`/blight heal\` to request a new healing task.`,
    'item': ` Your item submission remains incomplete. Please use \`/blight heal\` to request a new healing task.`,
    'tokens': ` Your token forfeiture remains incomplete. Please use \`/blight heal\` to request a new healing task.`
  };

  const consequence = taskConsequences[taskType] || ` Your healing task remains incomplete. Please use \`/blight heal\` to request a new healing task.`;

  return baseMessage + consequence;
};

const generateBlightRollBoostFlavorText = (blightStage, originalRoll, adjustedRoll) => {
  const stageKey = `stage${blightStage}`;
  const messages = BLIGHT_MESSAGES[stageKey]?.rollBoost || BLIGHT_MESSAGES.stage2.rollBoost;
  const baseMessage = getRandomMessage(messages);
  
  // Calculate the improvement
  const improvement = adjustedRoll - originalRoll;
  const multiplier = (adjustedRoll / originalRoll).toFixed(1);
  
  // Add specific details about the improvement
  let improvementText = '';
  if (improvement > 0) {
    improvementText = `\n\n💀 **Blight Boost Applied:** Your roll was enhanced from ${originalRoll} to ${adjustedRoll} (${multiplier}x multiplier). The corruption within you amplified your combat abilities, making you ${improvement} points stronger than normal.`;
  }
  
  return baseMessage + improvementText;
};

// ============================================================================
// ------------------- Special Flavor Text -------------------
// ============================================================================

const generateDivineItemFlavorText = () => {
  const divineFlavorTexts = BOOST_FLAVOR_MESSAGES.Priest.Gathering;
  
  return getRandomMessage(divineFlavorTexts);
};

const generateTeacherGatheringFlavorText = () => {
  const teacherFlavorTexts = BOOST_FLAVOR_MESSAGES.Teacher.Gathering;
  
  return getRandomMessage(teacherFlavorTexts);
};

// ============================================================================
// ------------------- Boost Flavor Text Messages -------------------
// ============================================================================

// Boost-specific flavor text messages
const BOOST_FLAVOR_MESSAGES = {
  // Job-specific boost messages
  Scholar: {
    Gathering: (targetRegion) => [
      `📚 Thanks to your boost, you gathered this item that is normally found in ${targetRegion}!`,
      `🎓 Your scholarly insight revealed treasures from ${targetRegion}!`,
      `📖 The Scholar's knowledge of ${targetRegion} led to this discovery!`,
      `🔍 Cross-region expertise uncovered ${targetRegion}'s hidden bounty!`,
      `📚 The Scholar's research of ${targetRegion} proved invaluable!`,
      `🎓 Thanks to scholarly wisdom, ${targetRegion} shared its secrets!`,
      `📖 Your boost granted access to ${targetRegion}'s natural resources!`,
      `🔍 The Scholar's guidance revealed ${targetRegion}'s hidden treasures!`,
      `📚 Academic knowledge of ${targetRegion} made this gathering possible!`,
      `🎓 Scholarly expertise unlocked ${targetRegion}'s natural wealth!`,
      `📖 Your boost tapped into ${targetRegion}'s regional specialties!`,
      `🔍 The Scholar's insight revealed ${targetRegion}'s local treasures!`,
      `📚 Thanks to your boost, you accessed ${targetRegion}'s unique resources!`,
      `🎓 Scholarly knowledge of ${targetRegion} led to this valuable find!`,
      `📖 Your boost revealed ${targetRegion}'s regional bounty!`,
      `🔍 The Scholar's expertise uncovered ${targetRegion}'s hidden gems!`,
      `📚 Cross-region insight revealed ${targetRegion}'s natural treasures!`,
      `🎓 Thanks to your boost, you discovered ${targetRegion}'s local specialties!`,
      `📖 Scholarly wisdom granted access to ${targetRegion}'s resources!`,
      `🔍 Your boost unlocked ${targetRegion}'s regional knowledge!`,
      `📚 The Scholar's research revealed ${targetRegion}'s hidden wealth!`,
      `🎓 Academic expertise made ${targetRegion}'s treasures accessible!`,
      `📖 Your boost tapped into ${targetRegion}'s natural knowledge!`,
      `🔍 Scholarly insight revealed ${targetRegion}'s local bounty!`
    ],
    Crafting: [
      "📚 Scholarly research enhances your crafting, resulting in superior quality.",
      "🎓 Academic knowledge improves your technique, creating exceptional items.",
      "📖 Your studies pay off as you craft with scholarly precision.",
      "🔍 Research-backed methods produce outstanding results."
    ],
    Exploring: [
      "📚 Your scholarly knowledge guides your exploration, revealing hidden secrets.",
      "🎓 Academic expertise enhances your discoveries, uncovering rare findings.",
      "📖 The Scholar's wisdom illuminates your path through unknown territories.",
      "🔍 Research-based exploration leads to exceptional discoveries."
    ],
    default: [
      "📚 Scholarly knowledge enhances your abilities, providing an academic edge.",
      "🎓 Your studies pay off as you perform with scholarly precision.",
      "📖 Academic expertise improves your technique in all endeavors.",
      "🔍 Research-backed methods produce superior results."
    ]
  },
  Teacher: {
    Gathering: [
      "📚 The Teacher's wisdom guided your hand to this practical material.",
      "🎓 Thanks to your Teacher's guidance, you found something truly useful.",
      "📖 The Teacher's knowledge revealed the value in what others might overlook.",
      "🔍 Your Teacher's insight led you to gather something worth crafting with.",
      "📚 Practical wisdom ensured you collected materials that serve a purpose.",
      "🎓 The Teacher's guidance helped you avoid junk and find real value.",
      "📖 Your Teacher's knowledge revealed the hidden usefulness in this material.",
      "🔍 Thanks to scholarly guidance, you gathered something worth keeping.",
      "📚 The Teacher's wisdom ensured you found materials for crafting or daily life.",
      "🎓 Your Teacher's insight led you to practical, valuable materials.",
      "📖 Scholarly knowledge helped you distinguish useful items from junk.",
      "🔍 The Teacher's guidance revealed materials that serve a real purpose.",
      "📚 Thanks to your Teacher, you gathered something truly worthwhile.",
      "🎓 The Teacher's wisdom ensured you found materials worth the effort.",
      "📖 Your Teacher's knowledge led you to practical, usable materials.",
      "🔍 Scholarly guidance helped you avoid waste and find real value."
    ],
    Crafting: [
      "🎓 The Teacher's guidance improves your crafting technique, creating practical items.",
      "📚 Educational wisdom enhances your ability to craft useful tools and gear.",
      "📖 Your teaching experience pays off as you create items with practical value.",
      "🔍 Practical knowledge ensures your crafted items serve real purposes."
    ],
    default: [
      "🎓 The Teacher's wisdom enhances your abilities with practical knowledge.",
      "📚 Educational experience improves your technique in all endeavors.",
      "📖 Your teaching background provides practical insights for better results.",
      "🔍 Practical wisdom ensures your efforts produce useful outcomes."
    ]
  },
  Priest: {
    Gathering: [
      "🙏 Blessed by divine favor, this item radiates with sacred energy.",
      "✨ A gift from the heavens, found after meeting with a priest.",
      "🌟 Touched by the divine, this item carries ancient blessings.",
      "💫 Sacred and pure, this item seems to glow with inner light.",
      "🙏 The priest's blessing has revealed this divine treasure.",
      "✨ Divine intervention has guided your hand to this sacred item.",
      "🌟 Blessed by the gods, this item hums with spiritual power.",
      "💫 A holy relic, discovered through divine guidance.",
      "🙏 The priest's prayers have led you to this blessed find.",
      "✨ Sacred energy flows through this divinely-gifted item.",
      "🌟 A heavenly blessing has revealed this spiritual treasure.",
      "💫 Touched by the divine, this item carries ancient wisdom.",
      "🙏 Blessed by the priest's guidance, this sacred item is yours.",
      "✨ Divine favor has shone upon your gathering efforts.",
      "🌟 A holy blessing has revealed this spiritual artifact.",
      "💫 Sacred and pure, this item glows with divine energy."
    ],
    Crafting: [
      "🙏 Divine blessing enhances your crafting, creating items of sacred quality.",
      "✨ Holy favor improves your technique, resulting in spiritually significant items.",
      "🌟 Sacred energy guides your hands as you craft with divine inspiration.",
      "💫 The Priest's blessing ensures your crafted items carry spiritual significance."
    ],
    default: [
      "🙏 Divine blessing enhances your abilities with sacred power.",
      "✨ Holy favor improves your technique with spiritual guidance.",
      "🌟 Sacred energy illuminates your path to better results.",
      "💫 The Priest's blessing ensures your efforts carry divine significance."
    ]
  },
  Entertainer: {
    Gathering: [
      "🎭 The Entertainer's charm attracts extra treasures, leading to bonus discoveries.",
      "🎪 Performance magic enhances your gathering, revealing additional valuable items.",
      "🎨 Artistic flair guides your search, uncovering extra resources with style.",
      "🎪 The Entertainer's presence brings good fortune, resulting in bonus finds.",
      "🎭 Charismatic energy enhances your gathering, leading to extra discoveries.",
      "🎪 Performance skills improve your luck, revealing additional valuable items.",
      "🎨 Creative spirit guides your hands to bonus treasures.",
      "🎪 The Entertainer's magic ensures you find extra resources with flair."
    ],
    Looting: [
      "🎭 Your performance dazzles monsters, reducing the damage they inflict.",
      "🎪 The Entertainer's flair confuses enemies, softening their blows.",
      "🎨 Theatrical presence distracts monsters, making their attacks less effective.",
      "🎭 Showmanship mesmerizes foes, weakening their assault.",
      "🎪 Performance magic shields you from the worst of enemy attacks.",
      "🎨 Your artistic flair leaves monsters bewildered, reducing their impact.",
      "🎭 The Entertainer's charm deflects some of the monster's fury.",
      "🎪 Captivating performance reduces the monster's effectiveness in battle."
    ],
    default: [
      "🎭 The Entertainer's charm enhances your abilities with extra flair.",
      "🎪 Performance magic improves your technique with artistic style.",
      "🎨 Creative energy guides your efforts to better results.",
      "🎪 The Entertainer's presence brings good fortune to all endeavors."
    ]
  },
  FortuneTeller: {
    default: [
      "🔮 Mystical insight enhances your abilities with prophetic knowledge.",
      "✨ Fortune's favor improves your technique with magical guidance.",
      "🌟 Mystical energy illuminates your path to better results.",
      "💫 The Fortune Teller's vision ensures your efforts are blessed with good luck."
    ]
  },
  default: [
    "⚡ Boosted abilities enhance your performance with extra power.",
    "✨ Enhanced skills improve your technique for better results.",
    "🌟 Boosted energy guides your efforts to superior outcomes.",
    "💫 Enhanced abilities ensure your actions are more effective."
  ]
};

// ============================================================================
// ------------------- Boost Flavor Text Generators -------------------
// ============================================================================

const generateBoostFlavorText = (boosterJob, category = 'default', options = null) => {
  const jobMessages = BOOST_FLAVOR_MESSAGES[boosterJob] || BOOST_FLAVOR_MESSAGES.default;
  let categoryMessages = jobMessages[category] || jobMessages.default || BOOST_FLAVOR_MESSAGES.default;

  // Scholar Gathering: categoryMessages is a function expecting targetRegion
  if (boosterJob === 'Scholar' && category === 'Gathering' && typeof categoryMessages === 'function') {
    const targetRegion = options?.targetRegion || null;
    return getRandomMessage(categoryMessages(targetRegion));
  }

  return getRandomMessage(categoryMessages);
};

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
  // No Encounter
  getNoEncounterMessage,
  // Damage
  generateDamageMessage,
  generateHelpWantedDamageMessage,
  // Victory
  generateVictoryMessage,
  generateModCharacterVictoryMessage,
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
  generateGatherFlavorText,
  generateCraftingFlavorText,
  // Blight Flavor Text
  generateBlightRollFlavorText,
  generateBlightVictoryFlavorText,
  generateBlightLootFlavorText,
  generateBlightSubmissionExpiryFlavorText,
  generateBlightRollBoostFlavorText,
  generateDivineItemFlavorText,
  generateTeacherGatheringFlavorText,
  // Boost Flavor Text
  generateBoostFlavorText,
};
