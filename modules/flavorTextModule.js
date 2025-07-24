// flavorTextModule.js

const { capitalizeVillageName } = require('../utils/stringUtils');

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
  ],
 };
 return getRandomMessage(messages[damage] || ["No damage taken."]);
};

// Victory Messages
// ================

// Messages for victory based on adjusted random value
const generateVictoryMessage = (
 randomValue,
 defenseSuccess = false,
 attackSuccess = false
) => {
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

const generateAttackBuffMessage = (
 attackSuccess,
 adjustedRandomValue,
 finalDamage
) => {
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
  `💪✨ The monster attacked, but you fought back! Thanks to your weapon, you took ${
   originalDamage - reducedDamage
  } ❤️ less heart! Without it, you would have taken ${originalDamage} ❤️ hearts!`,
  `🛡️⚔️ The monster's attack was strong, but you fought back bravely! Your weapon's power reduced the damage to ${reducedDamage} ❤️ hearts! Originally, it was ${originalDamage} ❤️ hearts.`,
  `🔮🔥 The monster struck hard, but you retaliated! The attack was less severe thanks to your weapon, reducing the damage to ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`,
  `🗡️🌿 Your weapon redirects the monster's attack. It's just a scratch! Damage reduced ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`,
 ];
 return getRandomMessage(messages);
};

const generateAttackBuffMessageKOPrevented = (originalDamage) => {
 const messages = [
  `💪✨ The monster attacked and almost knocked you out! Without your weapon, you would have been KO'd. Instead, you took ${originalDamage} ❤️ hearts of damage!`,
  `🛡️⚔️ A near-KO attack was thwarted by your weapon! You would have been knocked out, but you only took ${originalDamage} ❤️ hearts of damage!`,
  `🔮🔥 Your weapon saved you from a KO! The monster's attack was fierce, but you only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!`,
  `🚨🍃 Your instincts sense danger, giving you enough time to avoid a lethal blow! You only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!`,
 ];
 return getRandomMessage(messages);
};

// Defense Buff Messages
// =====================

const generateDefenseBuffMessage = (
 defenseSuccess,
 adjustedRandomValue,
 finalDamage
) => {
 const messages = [
  "🛡️✨ Your armor blocked the attack! No damage taken!",
  "⚔️🛡️ Thanks to your armor, you emerged unscathed!",
  "🔰💫 Your armor's protection made all the difference!",
  "🛡️🌱 You feel the strike, but no pain follows.",
 ];
 return getRandomMessage(messages);
};

const generateDefenseBuffMessageReduced = (reducedDamage, originalDamage) => {
 const messages = [
  `💪✨ The monster attacked, but your armor absorbed the blow! You took ${
   originalDamage - reducedDamage
  } ❤️ less heart! Without it, you would have taken ${originalDamage} ❤️ hearts!`,
  `🛡️⚔️ The monster's attack was strong, but your armor held! You took ${reducedDamage} ❤️ hearts! Originally, it was ${originalDamage} ❤️ hearts.`,
  `🔰🔥 The monster struck hard, but your armor protected you! The attack was less severe, reducing the damage to ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`,
  `🛡️🌳 The monster's attack will undoubtedly bruise, but it could've been worse. The attack was less severe, reducing the damage to ${reducedDamage} ❤️ hearts from the original ${originalDamage} ❤️ hearts!`,
 ];
 return getRandomMessage(messages);
};

const generateDefenseBuffMessageKOPrevented = (originalDamage) => {
 const messages = [
  `💪✨ The monster attacked and almost knocked you out! Without your armor, you would have been KO'd. Instead, you took ${originalDamage} ❤️ hearts of damage!`,
  `🛡️⚔️ A near-KO attack was thwarted by your armor! You would have been knocked out, but you only took ${originalDamage} ❤️ hearts of damage!`,
  `🔰🔥 Your armor saved you from a KO! The monster's attack was fierce, but you only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!``🚫🌿 The blow takes your breath away, but you're still standing! You only took ${originalDamage} ❤️ hearts of damage instead of being knocked out!`,
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
    const villageKey = currentVillage ? capitalizeVillageName(currentVillage).toLowerCase() : "default";

    // Village-specific messages
const villageMessages = {
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
    "🌸 No movement but your own. It’s quiet out here.",
    "🌳 The area holds steady. Nothing hostile found.",
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
  "🛡️🌟 Thanks to your armor, you emerged victorious! ",
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
const generateFinalOutcomeMessage = (
 randomValue,
 defenseSuccess = false,
 attackSuccess = false,
 adjustedRandomValue = 0,
 finalDamage = 0
) => {
 console.log(
  `[DEBUG3] Input to generateFinalOutcomeMessage - randomValue: ${randomValue}, defenseSuccess: ${defenseSuccess}, attackSuccess: ${attackSuccess}, adjustedRandomValue: ${adjustedRandomValue}, finalDamage: ${finalDamage}`
 );

 let message;

 if (attackSuccess) {
  message = generateAttackBuffMessage(
   defenseSuccess,
   attackSuccess,
   adjustedRandomValue,
   finalDamage
  );
 } else if (defenseSuccess) {
  message = generateDefenseBuffMessage(
   defenseSuccess,
   attackSuccess,
   adjustedRandomValue
  );
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
    "🐾 They don’t stay still long, but they’re in the basket now.",
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
    "🍇 Sweet and full, these won’t last long in the sun.",
    "🍊 A good bunch—unblemished and easy to carry.",
    "🌿 Found low on the branches, hiding in plain sight.",
   ],
   Meat: [
    "🍖 A solid cut, fresh and ready for the fire.",
    "🥩 Enough to feed a few or fill a pack.",
    "🍗 Skinned and cleaned, just needs a cook.",
    "🥓 Stashed quickly—this won’t stay fresh forever.",
    "🍖 No frills, just something to roast or trade.",
    "🥩 Bagged up, heavy and useful.",
    "🍗 Plenty for now. Hopefully enough for later.",
    "🥓 Straight from the field, nothing wasted.",
   ],
   Monster: [
    "👹 The creature’s remains hold strange materials of interest.",
    "🔮 What’s left behind isn’t just scrap—it hums with energy.",
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
    "🪨 Uncut and gritty—exactly what’s needed for smelting.",
   ],
   Plant: [
    "🌿 Useful herbs and greens, gathered with care.",
    "🍃 Picked before they wilted—still potent.",
    "🌱 Recognizable by scent alone—good for tinctures or meals.",
    "🌻 These will dry out quick, but there’s time to use them.",
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
    "📚 Most folks would walk right past it—but you didn’t.",
   ],
  };

 // Use the provided type, or fall back to the default if the type is unknown
 const flavorOptions =
  typeToFlavorText[itemType] || typeToFlavorText["default"];

 // Randomly select a flavor text from the options
 return getRandomMessage(flavorOptions || ["A successful gathering trip!"]);
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
    "👁️ There’s something in the eyeholes—you swear it’s watching back.",
  ],
  weaver: [
    "🧵 Warp set, shuttle flying—cloth grows by steady habit.",
    "🪡 Tight weave, clean selvedge; this will hold up in the wilds.",
    "📐 Pattern nods to old motifs without making a fuss about it.",
  ],
  artist: [
    "🖼️ Sketch to line, line to color—the piece landed where it needed to.",
    "🎨 It doesn’t shout; it just makes you look twice.",
    "✍️ Finished, signed, and ready to hang (or haggle over).",
  ],
  cook: [
    "🍳 Knife work, pan heat; nothing fancy, just solid food.",
    "🧂 Seasoned right and cooked through—travel rations upgraded.",
    "🍲 Stew thickened slow; smells good enough to pull folks off the road.",
  ],
  craftsman: [
    "🛠️ Measure twice, cut once; the fit came out clean.",
    "🔧 Scrap to useful—now it’s a tool you’ll actually reach for.",
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

 const flavorOptions =
  jobToFlavorText[normalizedJob] ||
  jobToFlavorText["default"];
 return getRandomMessage(flavorOptions || ["A successful crafting session!"]);
};

// ============================================================================
// Blight-Affected Roll Flavor Text
// ============================================================================

// ------------------- Function: generateBlightRollFlavorText -------------------
// Generates flavor text for when blight affects combat rolls
function generateBlightRollFlavorText(blightStage, rollType = 'combat') {
  const blightMessages = {
    stage2: {
      combat: [
        "💀 The blight's corruption courses through your veins, making your movements more erratic but somehow more powerful...",
        "🩸 Your blight-infected blood burns with unnatural energy, amplifying your combat prowess.",
        "🌑 The dark influence of blight seems to enhance your reflexes, though at what cost?",
        "⚡ The corruption within you crackles with energy, turning your pain into power.",
        "🖤 Your blight-stained soul resonates with the monster's essence, creating an eerie synergy."
      ],
      loot: [
        "💀 The blight's influence seems to guide your hands to the most valuable spoils...",
        "🩸 Your corrupted senses detect hidden treasures that others might miss.",
        "🌑 The dark energy within you resonates with the monster's remains, revealing secrets.",
        "⚡ Your blight-enhanced perception uncovers rare materials in the carnage.",
        "🖤 The corruption in your blood draws you to the most potent remnants."
      ]
    },
    stage3: {
      combat: [
        "💀 The blight's grip tightens, but your desperation fuels an unnatural strength...",
        "🩸 Your corrupted blood burns with feverish intensity, driving you to fight harder.",
        "🌑 The dark influence has taken hold, but you channel it into devastating attacks.",
        "⚡ Your blight-stained soul crackles with malevolent energy, turning fear into fury.",
        "🖤 The corruption within you resonates with the monster's own darkness."
      ],
      loot: [
        "💀 The blight's corruption seems to attract the most potent remnants...",
        "🩸 Your feverish state heightens your awareness of valuable materials.",
        "🌑 The dark energy within you draws you to the most powerful spoils.",
        "⚡ Your blight-enhanced senses detect rare components others would miss.",
        "🖤 The corruption in your blood resonates with the monster's essence."
      ]
    },
    stage4: {
      combat: [
        "💀 The blight's corruption has reached a critical point, but you channel its power into devastating strikes...",
        "🩸 Your blood burns with the fever of corruption, driving you to fight with desperate strength.",
        "🌑 The dark influence has consumed much of your being, but you wield it as a weapon.",
        "⚡ Your blight-stained soul pulses with malevolent energy, turning your agony into power.",
        "🖤 The corruption within you has become a dark force that even monsters fear."
      ],
      loot: [
        "💀 The blight's corruption has reached such intensity that it draws the most potent remnants to you...",
        "🩸 Your feverish corruption heightens your awareness of the most valuable materials.",
        "🌑 The dark energy within you has become a beacon for powerful spoils.",
        "⚡ Your blight-enhanced senses detect rare components that pulse with dark energy.",
        "🖤 The corruption in your blood has become a magnet for the most potent remnants."
      ]
    },
    stage5: {
      combat: [
        "💀 The blight's corruption has reached terminal levels, but you channel its overwhelming power into devastating attacks...",
        "🩸 Your blood burns with the fever of approaching death, driving you to fight with desperate, unnatural strength.",
        "🌑 The dark influence has nearly consumed your being, but you wield it as a weapon of pure destruction.",
        "⚡ Your blight-stained soul pulses with malevolent energy, turning your agony into overwhelming power.",
        "🖤 The corruption within you has become a force of pure darkness that even the strongest monsters fear."
      ],
      loot: [
        "💀 The blight's corruption has reached such intensity that it draws the most potent remnants to you like a beacon...",
        "🩸 Your feverish corruption has become so intense that it heightens your awareness of the most valuable materials.",
        "🌑 The dark energy within you has become a powerful beacon for the most potent spoils.",
        "⚡ Your blight-enhanced senses detect rare components that pulse with dark energy, drawn to your corruption.",
        "🖤 The corruption in your blood has become a powerful magnet for the most potent remnants."
      ]
    }
  };

  const stageKey = `stage${blightStage}`;
  const messages = blightMessages[stageKey]?.[rollType] || blightMessages.stage2[rollType];
  
  return getRandomMessage(messages);
}

// ------------------- Function: generateBlightVictoryFlavorText -------------------
// Generates flavor text for victories achieved with blight-affected rolls
function generateBlightVictoryFlavorText(blightStage) {
  const victoryMessages = {
    stage2: [
      "💀 Despite the blight's corruption, you emerge victorious, though the cost is clear...",
      "🩸 Your blight-enhanced strength carried you to victory, but at what price?",
      "🌑 The dark influence within you proved to be both a curse and a weapon.",
      "⚡ Your corrupted blood burned with energy, turning your pain into power for this victory.",
      "🖤 The blight's corruption resonated with the monster's essence, creating an eerie victory."
    ],
    stage3: [
      "💀 The blight's grip tightens, but your desperation and corrupted strength secured victory...",
      "🩸 Your feverish corruption drove you to fight harder, achieving victory through unnatural means.",
      "🌑 The dark influence has taken hold, but you channeled it into devastating attacks for victory.",
      "⚡ Your blight-stained soul crackled with malevolent energy, turning fear into fury for victory.",
      "🖤 The corruption within you resonated with the monster's own darkness, securing your victory."
    ],
    stage4: [
      "💀 The blight's corruption has reached critical levels, but you channeled its power into overwhelming victory...",
      "🩸 Your blood burned with the fever of corruption, driving you to fight with desperate strength for victory.",
      "🌑 The dark influence has consumed much of your being, but you wielded it as a weapon of victory.",
      "⚡ Your blight-stained soul pulsed with malevolent energy, turning your agony into power for victory.",
      "🖤 The corruption within you has become a dark force that even monsters fear, securing your victory."
    ],
    stage5: [
      "💀 The blight's corruption has reached terminal levels, but you channeled its overwhelming power into devastating victory...",
      "🩸 Your blood burned with the fever of approaching death, driving you to fight with desperate, unnatural strength for victory.",
      "🌑 The dark influence has nearly consumed your being, but you wielded it as a weapon of pure destruction for victory.",
      "⚡ Your blight-stained soul pulsed with malevolent energy, turning your agony into overwhelming power for victory.",
      "🖤 The corruption within you has become a force of pure darkness that even the strongest monsters fear, securing your victory."
    ]
  };

  const stageKey = `stage${blightStage}`;
  const messages = victoryMessages[stageKey] || victoryMessages.stage2;
  
  return getRandomMessage(messages);
}

// ------------------- Function: generateBlightLootFlavorText -------------------
// Generates flavor text for loot obtained with blight-affected rolls
function generateBlightLootFlavorText(blightStage, itemType) {
  const baseFlavorText = generateGatherFlavorText(itemType);
  
  const blightPrefixes = {
    stage2: [
      "💀 The blight's corruption guided your hands to ",
      "🩸 Your blight-enhanced senses detected ",
      "🌑 The dark influence within you drew you to ",
      "⚡ Your corrupted blood resonated with ",
      "🖤 The corruption in your veins attracted "
    ],
    stage3: [
      "💀 The blight's corruption intensified, leading you to ",
      "🩸 Your feverish corruption heightened your awareness of ",
      "🌑 The dark energy within you became a beacon for ",
      "⚡ Your blight-enhanced perception uncovered ",
      "🖤 The corruption in your blood resonated with "
    ],
    stage4: [
      "💀 The blight's corruption has reached critical levels, drawing you to ",
      "🩸 Your feverish corruption has become so intense that it revealed ",
      "🌑 The dark energy within you has become a powerful beacon for ",
      "⚡ Your blight-enhanced senses detected ",
      "🖤 The corruption in your blood has become a magnet for "
    ],
    stage5: [
      "💀 The blight's corruption has reached terminal levels, irresistibly drawing you to ",
      "🩸 Your feverish corruption has become so overwhelming that it revealed ",
      "🌑 The dark energy within you has become an irresistible beacon for ",
      "⚡ Your blight-enhanced senses detected ",
      "🖤 The corruption in your blood has become an overwhelming magnet for "
    ]
  };

  const stageKey = `stage${blightStage}`;
  const prefixes = blightPrefixes[stageKey] || blightPrefixes.stage2;
  const prefix = getRandomMessage(prefixes);
  
  return prefix + baseFlavorText.toLowerCase();
}

// ------------------- Function: generateBlightSubmissionExpiryFlavorText -------------------
// Generates flavorful lore text for expired or abandoned blight healing submissions
function generateBlightSubmissionExpiryFlavorText(characterName, healerName, blightStage, taskType) {
  const expiryMessages = {
    stage2: [
      `💀 The healing request for **${characterName}** has expired. ${healerName}'s patience has worn thin, and the opportunity for gentle healing has passed. The blight's corruption continues to spread unchecked.`,
      `🩸 Time has run out for **${characterName}**'s healing. ${healerName} can no longer offer their aid, and the blight's grip tightens with each passing moment.`,
      `🌑 The healing window has closed for **${characterName}**. ${healerName} has moved on to other patients, leaving the blight's corruption to fester and grow stronger.`,
      `⚡ The chance for healing has slipped away for **${characterName}**. ${healerName}'s offer has expired, and the blight's influence continues to spread through their veins.`,
      `🖤 The healing opportunity for **${characterName}** has been lost. ${healerName} can no longer provide their aid, and the blight's corruption deepens its hold.`
    ],
    stage3: [
      `💀 The healing request for **${characterName}** has expired. ${healerName}'s concern grows as the blight's corruption reaches more critical levels, making future healing attempts more challenging.`,
      `🩸 Time has run out for **${characterName}**'s healing. ${healerName} watches helplessly as the blight's corruption intensifies, spreading deeper into their being.`,
      `🌑 The healing window has closed for **${characterName}**. ${healerName} fears the blight's corruption may soon reach a point of no return, making recovery increasingly difficult.`,
      `⚡ The chance for healing has slipped away for **${characterName}**. ${healerName} knows that with each passing moment, the blight's corruption becomes more entrenched and dangerous.`,
      `🖤 The healing opportunity for **${characterName}** has been lost. ${healerName} worries that the blight's corruption may soon reach critical levels that could prove fatal.`
    ],
    stage4: [
      `💀 The healing request for **${characterName}** has expired. ${healerName} is gravely concerned as the blight's corruption has reached critical levels, making any future healing attempts extremely dangerous.`,
      `🩸 Time has run out for **${characterName}**'s healing. ${healerName} fears the blight's corruption may soon reach terminal levels, with little hope for recovery.`,
      `🌑 The healing window has closed for **${characterName}**. ${healerName} knows that the blight's corruption has reached a critical point where any delay could prove fatal.`,
      `⚡ The chance for healing has slipped away for **${characterName}**. ${healerName} watches in horror as the blight's corruption continues to spread, reaching ever more dangerous levels.`,
      `🖤 The healing opportunity for **${characterName}** has been lost. ${healerName} fears that the blight's corruption may soon reach terminal levels, making recovery nearly impossible.`
    ],
    stage5: [
      `💀 The healing request for **${characterName}** has expired. ${healerName} is devastated as the blight's corruption has reached terminal levels, making any healing attempt extremely risky and potentially fatal.`,
      `🩸 Time has run out for **${characterName}**'s healing. ${healerName} knows that the blight's corruption has reached terminal levels, where even the most skilled healing may not be enough.`,
      `🌑 The healing window has closed for **${characterName}**. ${healerName} fears that the blight's corruption has reached a point where recovery may be impossible, and death is imminent.`,
      `⚡ The chance for healing has slipped away for **${characterName}**. ${healerName} watches in despair as the blight's corruption reaches terminal levels, with little hope for survival.`,
      `🖤 The healing opportunity for **${characterName}** has been lost. ${healerName} knows that the blight's corruption has reached terminal levels, making any attempt at healing a desperate gamble with life itself.`
    ]
  };

  const stageKey = `stage${blightStage}`;
  const messages = expiryMessages[stageKey] || expiryMessages.stage2;
  const baseMessage = getRandomMessage(messages);

  // Add task-specific consequences
  const taskConsequences = {
    'writing': ` Your writing task remains incomplete. Please use \`/blight heal\` to request a new healing task.`,
    'art': ` Your art task remains incomplete. Please use \`/blight heal\` to request a new healing task.`,
    'item': ` Your item submission remains incomplete. Please use \`/blight heal\` to request a new healing task.`,
    'tokens': ` Your token forfeiture remains incomplete. Please use \`/blight heal\` to request a new healing task.`
  };

  const consequence = taskConsequences[taskType] || ` Your healing task remains incomplete. Please use \`/blight heal\` to request a new healing task.`;

  return baseMessage + consequence;
}

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
 generateCraftingFlavorText,
 // Blight Flavor Text
 generateBlightRollFlavorText,
 generateBlightVictoryFlavorText,
 generateBlightLootFlavorText,
 generateBlightSubmissionExpiryFlavorText,
};
