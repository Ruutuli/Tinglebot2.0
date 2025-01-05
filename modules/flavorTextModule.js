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
const getNoEncounterMessage = (currentVillage) => {
    // Normalize the village name to avoid case-sensitivity issues
    const villageKey = currentVillage ? currentVillage.toLowerCase() : 'default';

    // Village-specific messages
    const villageMessages = {
        rudania: [
            "🔥 The air is warm, and no monsters disturb the peace.",
            "🔥⚒️ The forges hum, but the valley is quiet. No monsters today.",
            "🌋 A distant rumble from the volcano, but no threats nearby.",
            "🎉 The sounds of celebration drown out any sign of danger.",
            "🪓 The farmlands are safe, and no monsters prowl.",
        ],
        inariko: [
            "💦 The river flows quietly. No monsters are here.",
            "🏞️ Peaceful waters surround you, undisturbed by threats.",
            "📖 The wisdom of the past guards this place. No danger today.",
            "🌀 The gentle whirl of the waterwheel is all you hear.",
            "❄️ The crisp mountain air carries no sign of danger.",
        ],
        vhintl: [
            "🌿 The forest whispers softly, but no monsters reply.",
            "🕸️ Even the Skulltulas seem to sleep today. All is calm.",
            "🌧️ The rain falls gently through the trees, masking all sound.",
            "🪶 A Rito song drifts through the canopy, warding off danger.",
            "🍃 The mists of the forest conceal no threats today.",
        ],
        default: [
            "🌲🕊️ A quiet day. No monsters were encountered.",
            "🌿☀️ The area is peaceful. No monsters in sight.",
            "🌸🌼 Nothing stirs. No monsters to be found.",
            "🌳🦋 All is calm. No monsters appear.",
        ],
    };

    // Return messages for the specific village or fallback to default
    const messages = villageMessages[villageKey] || villageMessages.default;
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
'Ancient Parts': { action: 'found', color: '#CC7722' },
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

const generateGatherFlavorText = (itemType) => {
  const typeToFlavorText = {
    '1h': [
        "⚔️ A well-worn tool, etched with marks of countless journeys, was unearthed.",
        "🛡️ A dependable one-handed weapon, sturdy and true, was found.",
        "⚔️ This blade carries the weight of forgotten tales.",
        "🗡️ A finely crafted tool, its balance perfect for swift action."
    ],
    '2h': [
        "⚔️ A heavy two-handed weapon, forged for strength, was uncovered.",
        "💪 This tool, built for power, whispers of battles long past.",
        "⚔️ A mighty find, its weight a testament to its craftsmanship.",
        "🪓 A weapon of the ancients, built for enduring strength, was discovered."
    ],
    'Ancient Parts': [
        "🔮 Relics of a bygone era, humming with faint energy, were gathered.",
        "🏺 Fragments of the past, their purpose lost to time, were carefully collected.",
        "🔧 Strange components, worn by ages yet intricate in design, were uncovered.",
        "🌌 Echoes of forgotten civilizations linger in these ancient mechanisms."
    ],
    'Creature': [
        "🌾 The lands yielded curious creatures, elusive and fleeting.",
        "🌿 Hidden within the leaves, the secrets of nature stirred and were caught.",
        "🍃 The wilderness offered glimpses of life, quick and unpredictable.",
        "✨ Among the grasses and shadows, living treasures were carefully gathered.",
        "🪴 Creatures moved in harmony with the land, their presence a fleeting mystery."
    ],
    'Dairy': [
        "🥛 Rich and wholesome dairy, a gift from gentle hands, was collected.",
        "🧀 The day's yield included provisions crafted with care and tradition.",
        "🍶 Fresh and nourishing, the bounty speaks of peaceful homesteads.",
        "🐄 The livestock’s offerings, simple yet vital, ensured a good harvest."
    ],
    'Fish': [
        "🎣 The shimmering waters surrendered their hidden bounty.",
        "🐟 Quick and silent, the river’s life was skillfully caught.",
        "🌊 The depths revealed their secrets, glimmering and fleeting.",
        "✨ The tranquil waters whispered of abundance, offering their treasures."
    ],
    'Fruit': [
        "🍎 The trees offered their bounty, ripe and fragrant with the season's best.",
        "🍇 Sweet and vibrant, the fruits of the land were gathered with care.",
        "🍊 Hidden among the leaves, nature’s flavors were plentiful and inviting.",
        "🌿 The orchard whispered of life’s abundance, yielding its colorful harvest."
    ],
    'Meat': [
        "🍖 The land provided its sustenance, a reminder of nature’s cycle.",
        "🐄 The fields and pastures yielded provisions essential to the journey ahead.",
        "🍗 Carefully prepared, this resource will sustain even the most arduous travels.",
        "🥩 The fruits of careful labor ensured a hearty supply for the days ahead."
    ],
    'Monster': [
        "👹 The remnants of a defeated foe bore rare and curious materials.",
        "🔮 Echoes of dark magic lingered in the remains, now collected.",
        "👾 The battle's spoils included components shrouded in mystery.",
        "🌌 Strange remnants, imbued with power, tell of an ancient conflict."
    ],
    'Mushroom': [
        "🍄 The forest floor offered its earthy treasures, rich and varied.",
        "🌧️ Shrouded in mist, hidden fungi thrived and were gently gathered.",
        "🌲 Quiet corners of the wild held delicate and valuable mushrooms.",
        "🌿 The damp earth revealed its bounty, fragrant and full of life."
    ],
    'Natural': [
        "🌳 The land yielded its gifts, timeless and versatile.",
        "🪵 A harvest of materials, raw and brimming with potential, was gathered.",
        "🌿 The land offered resources, their use bound only by imagination.",
        "🌱 Nature’s offerings spoke of resilience and quiet abundance."
    ],
    'Ore': [
        "⛏️ Deep within the rock, shimmering stones awaited discovery.",
        "💎 Precious minerals, the lifeblood of the mountains, were unearthed.",
        "🏔️ The veins of the earth gave forth their treasures, long hidden.",
        "🌋 The glow of raw ore hinted at ancient secrets, locked within stone."
    ],
    'Plant': [
        "🌿 Vibrant herbs and plants whispered of hidden knowledge.",
        "🍃 The forest floor revealed its botanical riches, delicate and rare.",
        "🌱 The land yielded flora both useful and mysterious.",
        "🌻 The land’s greenery spoke of life’s quiet persistence and beauty."
    ],
    'Protein': [
        "🥩 A vital source of strength was carefully gathered and prepared.",
        "🍗 The provisions ensured sustenance for journeys yet to come.",
        "🍖 The bounty, simple yet nourishing, was a gift from the land.",
        "🐾 Nature’s energy, preserved in its purest form, was secured."
    ],
    'default': [
        "✨ The search was fruitful, yielding items of value and wonder.",
        "💼 The hard work uncovered treasures hidden by time and nature.",
        "🏞️ The land revealed its secrets, shared with those who sought them.",
        "🌟 Quiet effort brought forth a bounty of unexpected riches.",
        "💡 Among the ordinary, extraordinary finds awaited discovery.",
        "🏔️ The journey was rewarded with a wealth of resources and promise."
    ],
};


  // Use the provided type, or fall back to the default if the type is unknown
  const flavorOptions = typeToFlavorText[itemType] || typeToFlavorText['default'];

  // Randomly select a flavor text from the options
  return getRandomMessage(flavorOptions || ["A successful gathering trip!"]);
};

const generateCraftingFlavorText = (job) => {
  console.log(`[generateCraftingFlavorText]: Job provided: ${job}`);
  
  const jobToFlavorText = {
    researcher: [
      "📚 With keen focus, the Researcher transcribed their findings into a practical creation.",
      "🔍 Experimentation and study bore fruit, crafting something of great potential.",
      "🌟 Guided by knowledge, the Researcher brought an innovative idea to life."
    ],
    blacksmith: [
      "⚒️ The Blacksmith worked tirelessly, the hammer's rhythm echoing through the forge.",
      "🔥 Sparks danced in the air as molten metal took shape under the Blacksmith's hand.",
      "🛡️ After hours of labor, the Blacksmith unveiled a creation fit to withstand Hyrule's fiercest battles."
    ],
    "mask maker": [
      "🎭 In the Mask Maker's hands, ordinary materials transformed into something mystical.",
      "🖌️ Each brushstroke carried intent, weaving stories into the mask’s design.",
      "🌟 The Mask Maker’s craft captured the spirit of a forgotten legend."
    ],
    weaver: [
      "🧵 The Weaver's loom hummed softly, threads intertwining into a tapestry of purpose.",
      "🪡 With precision and patience, the Weaver created a fabric imbued with meaning.",
      "✨ Each stitch told a story, the Weaver's art weaving past and present together."
    ],
    artist: [
      "🌟 The Artist's masterpiece shimmered with emotion, as if Hyrule itself had inspired it."
    ],
    cook: [
      "🍳 The Cook's kitchen bustled with energy, aromas hinting at something delicious to come.",
      "🧂 With a steady hand, the Cook crafted a dish both hearty and full of flavor.",
      "🍲 As the pot simmered, the Cook smiled, knowing the meal would fortify even the bravest adventurer."
    ],
    craftsman: [
      "🛠️ The Craftsman’s tools danced across the workbench, shaping raw materials into something extraordinary.",
      "🔧 Each motion was deliberate, as if the Craftsman could see the finished piece before it began.",
      "✨ By the end of the day, the Craftsman stood back to admire their elegant and functional creation."
    ],
    witch: [
      "🔮 The Witch's cauldron bubbled, its contents glowing faintly with magical energy.",
      "🌙 Chanting softly, the Witch infused the brew with ancient knowledge and power.",
      "🧹 A swirl of light marked the completion of the Witch’s spellbound creation."
    ],
    default: [
      "✨ With effort and care, a new creation was brought into the world.",
      "🔧 Through determination, a simple idea became a reality.",
      "🌟 Creativity and skill combined to forge something extraordinary."
    ]
  };

  const normalizedJob = job.trim().toLowerCase();
  const jobToFlavorTextNormalized = Object.fromEntries(
    Object.entries(jobToFlavorText).map(([key, value]) => [key.toLowerCase(), value])
  );

  const flavorOptions = jobToFlavorTextNormalized[normalizedJob] || jobToFlavorTextNormalized['default'];
  return getRandomMessage(flavorOptions || ["A successful crafting session!"]);
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
  generateGatherFlavorText,
  generateCraftingFlavorText
};
