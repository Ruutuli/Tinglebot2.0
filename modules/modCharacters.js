// ------------------- Module to store Mod OCs for Healing -------------------
// This module contains the Mod OCs and their respective village, category, type, owner, and dynamic healing requirements.

// ----- ORACLES -----
const modCharacters = [
  {
    name: 'Aemu',
    village: 'Rudania',
    category: 'Oracle',
    type: 'Power',
    owner: 'Ruu',
    iconUrl: 'https://storage.googleapis.com/tinglebot/Mod%20Characters/%5BRotW%5D%20modCharacters_Oracle_Power_Aemu%20ICON.png',
    getHealingRequirements: (characterName) => {
      return [
        {
          type: 'art',
          description: `**Aemu: Oracle of Power** asks you to draw your OC praying to the Goddess Statue in Rudania. Minimum requirement: Flat Colored Image. Let the light of Din shine on you through the flames!`
        },
        {
          type: 'writing',
          description: `**Aemu: Oracle of Power** wants you to write about how the virtue of power influenced part of your OC's life. 500 words or less. How has Din’s strength shaped them?`
        },
        {
          type: 'item',
          description: `**Aemu: Oracle of Power** stumbles over her words, clearly a bit flustered. "Oh, um! Okay, so I need these things... Ah, Hylia, what were they called again... OKAY, OKAY, SO..."\n\n
          - That orangey gem! You know, the shiny one? I need 5 of those!
          - Oh, or maybe... the ancient one? It’s more of a relic. I need ONE of those.
          - A reddish pearl... yes, that's it! I just need ONE of those.
          - Oh! Or a feather, but not just any feather... the one from the Goddess herself! I need ONE of those.
          - And if you can’t find any of that, how about something that fell from the stars? I need ONE of those!`,
                items: [
            { name: 'Amber', quantity: 5 },
            { name: 'Amber Relic', quantity: 1 },
            { name: 'Carmine Pearl', quantity: 1 },
            { name: 'Goddess Plume', quantity: 1 },
            { name: 'Star Fragment', quantity: 1 }
          ]
        }
      ];
    },
    roleplayResponse: (characterName) => 
      `Aemu grins brightly, full of confidence, but you can sense a hint of nervous energy. "Don't worry, **${characterName}**, I've got this! Together, we’ll beat this blight! Just, uh... make sure to keep faith in me, okay? I've got a lot to prove!"`
  },
  {
    name: 'Elde',
    village: 'Vhintl',
    category: 'Oracle',
    type: 'Courage',
    owner: 'Chari',
    iconUrl: 'https://storage.googleapis.com/tinglebot/Mod%20Characters/%5BRotW%5D%20modCharacters_Oracle_Courage_Elde%20ICON.png',
    getHealingRequirements: (characterName) => {
      return [
        {
          type: 'art',
          description: `**Elde, Oracle of Courage** asks you to draw your OC standing proud in the face of adversity, perhaps by the Goddess Statue of Farore. Show your bravery! Minimum requirement: Flat Colored Image.`
        },
        {
          type: 'writing',
          description: `**Elde, Oracle of Courage** asks you to write about how the virtue of courage influenced part of your OC's life. How have they used Farore’s courage to push forward? 500 words or less.`
        },
        {
          type: 'item',
          description: `**Elde, Oracle of Courage** requires an offering of ONE of the following Lizalfos or Lynel parts to heal **${characterName}**:`
          
          - "Any one part from a Lynel—just one will do."
          - "Lizalfos parts. But I need **50** of each.",
          items: [
            { name: 'Lizalfos Horn', quantity: 50 },
            { name: 'Lizalfos Talon', quantity: 50 },
            { name: 'Lizalfos Tail', quantity: 50 },
            { name: 'Icy Lizalfos Tail', quantity: 50 },
            { name: 'Red Lizalfos Tail', quantity: 50 },
            { name: 'Yellow Lizalfos Tail', quantity: 50 },
            { name: 'Lizalfos Arm', quantity: 50 },
            { name: 'Stal Skull', quantity: 50 },
            { name: 'Lynel Horn', quantity: 1 },
            { name: 'Lynel Guts', quantity: 1 },
            { name: 'Lynel Hoof', quantity: 1 }
          ]
        }
      ];
    },
    roleplayResponse: (characterName) => 
      `Elde stands tall, a protective presence. "You’ve been brave, **${characterName}**, and I will guide you through this. The forest has seen your courage, and so have I. Together, we will overcome this darkness."`
  },
  {
    name: 'Nihme',
    village: 'Inariko',
    category: 'Oracle',
    type: 'Wisdom',
    owner: 'Roots.Admin',
    iconUrl: 'https://storage.googleapis.com/tinglebot/Mod%20Characters/nihmeicon.png',
    getHealingRequirements: (characterName) => {
      return [
        {
          type: 'art',
          description: `**Nihme: Oracle of Wisdom** asks you to create an illustration showing your OC pondering a wise decision, perhaps at the feet of the Goddess Statue of Nayru. Minimum requirement: Clean Lineart or Colored Sketch.`
        },
        {
          type: 'writing',
          description: `**Nihme: Oracle of Wisdom** asks you to write about how your OC has learned an important lesson through wisdom. Share their journey of growth. 500 words or less.`
        },
        {
          type: 'item',
          description: `**Nihme: Oracle of Wisdom** smiles softly as she addresses you. "Ah! Yes, I can help you cleanse this blight, but I’ll need a few things. Can you provide me with 5 of one of these items? Take your time, no rush. You’ll know what they are when you see them."
          
          [Nihme hands you a parchment.](https://storage.googleapis.com/tinglebot/Nihme%20Request.png)`,
          items: [
            { name: 'Ancient Flower', quantity: 5 },
            { name: 'Blue Nightshade', quantity: 5 },
            { name: 'Silent Princess', quantity: 5 }
          ]
        }
      ];
    },
    roleplayResponse: (characterName) => 
      `Nihme peers over her book, a soft smile gracing her lips. "Oh, hello there, **${characterName}**. You need guidance? Well, I'm here to help. Let's tackle this blight together, one step at a time."`
  },

  // ----- DRAGONS -----
  {
    name: 'Sanskar',
    village: 'Inariko',
    category: 'Dragon',
    type: 'Wisdom',
    owner: 'Roots.Admin',
    iconUrl: 'https://storage.googleapis.com/tinglebot/Mod%20Characters/%5BRotW%5D%20modCharacters_Dragon_Wisdom_Sanskar_True%20Form%20ICON.png',
    getHealingRequirements: (characterName) => {
      return [
        {
          type: 'art',
          description: `**Sanskar, Dragon of Wisdom** asks you to draw your OC offering something to the dragon, whether it's sweets or conversation. Full body, full color required.`
        },
        {
          type: 'writing',
          description: `**Sanskar, Dragon of Wisdom** asks you to write about how your OC navigates the challenge of meeting a cold, condescending figure in place of the dragon. 500 words required.`
        },
        {
          type: 'item',
          description: `**Sanskar, Dragon of Wisdom** requires an offering of ONE of the following, but he won’t make it easy for you to guess what they are:
      
          - "Water from a creature of frost, cold enough to burn. I require ONE of these."
          - "Metal pure as the moon’s light, prized by merchants. I require FIVE of these."
          - "A gem of blue, as deep as the wisdom you seek. I require ONE of these."
          - "A frozen blob from creatures who thrive in the cold, deadly to the touch. I require FIFTY of these."
          - "The wing of a frozen bat, still cold enough to chill your bones. I require FIFTY of these."
          - "A piece of the heavens, fallen from the sky during the darkest nights. I require ONE of these."
          - "A rare treasure from beneath the waves, its colors shift like a dream. I require ONE of these."
          
      
      "Do you really expect me to tell you the names of these items? Ha! Use your wisdom."`,
          items: [
            { name: 'Freezard Water', quantity: 1 },
            { name: 'Silver Bar', quantity: 5 },
            { name: 'Sapphire', quantity: 1 },
            { name: 'White Chuchu Jelly', quantity: 50 },
            { name: 'Ice Keese Wing', quantity: 50 },
            { name: 'Star Fragment', quantity: 1 },
            { name: 'Rainbow Coral', quantity: 1 }
          ]
        }
      ];
    },
    roleplayResponse: (characterName) => 
      `Sanskar raises an eyebrow, amused. "You, **${characterName}, seek wisdom? Isn't that something you should already have? Prove your wisdom - and we'll see about your request."`
  },
  {
    name: 'Darune',
    village: 'Rudania',
    category: 'Dragon',
    type: 'Power',
    owner: 'Toki',
    iconUrl: 'https://storage.googleapis.com/tinglebot/Mod%20Characters/%5BRotW%5D%20modCharacters_Dragon_Power_Darune_True%20Form%20ICON.png',
    getHealingRequirements: (characterName) => {
      return [
        {
          type: 'art',
          description: `**Darune, Dragon of Power** demands that you draw your OC surrounded by flames, invoking his fiery power to cleanse the blight. Minimum requirement: Full Body, Full Color.`
        },
        {
          type: 'writing',
          description: `**Darune, Dragon of Power** asks you to write a tale of your OC harnessing their inner strength. Can they withstand the heat? 500 words.`
        },
        {
          type: 'item',
          description: `**Darune, Dragon of Power** requires an offering of ONE of the following treasures to satisfy his appetite for power and help cleanse **${characterName}**:`,
          items: [
            { name: 'Star Fragment', quantity: 1 },
            { name: 'Ruby', quantity: 5 },
            { name: 'Gold Nugget', quantity: 3 }
          ]
        }
      ];
    },
    roleplayResponse: (characterName) => 
      `Darune huffs, his fiery gaze focused on you. "You dare to seek my help, **${characterName}**? Fine. But know this—you'll owe me. Blight or no blight, I don’t offer my strength freely."`
  },
  {
    name: 'Foras',
    village: 'Vhintl',
    category: 'Dragon',
    type: 'Courage',
    owner: 'Chari',
    iconUrl: 'https://storage.googleapis.com/tinglebot/Mod%20Characters/%5BRotW%5D%20modCharacters_Dragon_Courage_Foras_True%20Form%20ICON.png',
    getHealingRequirements: (characterName) => {
      return [
        {
          type: 'art',
          description: `**Foras, Dragon of Courage** asks you to create a lively, full-color drawing of your OC standing tall with the wind in their hair, guided by Foras' courage. Full body, full color required.`
        },
        {
          type: 'writing',
          description: `**Foras, Dragon of Courage** wants to hear your OC’s tale of bravery and heart. How do they overcome their greatest fears? 500 words or less.`
        },
        {
          type: 'item',
          description: `**Foras, Dragon of Courage** requires an offering of ONE of the following to help cleanse **${characterName}**:`,
          items: [
            { name: 'Staminoka Bass', quantity: 5 },
            { name: 'Swift Violet', quantity: 5 },
            { name: 'Korok Seed', quantity: 10 }
          ]
        }
      ];
    },
    roleplayResponse: (characterName) => 
      `Foras chuckles warmly, ruffling his feathers. "Oh, **${characterName}**, don't worry! With my help, you’ll be back on your feet in no time. Now, tell me—how do you plan to repay me?"`
  },

  // ----- SAGES -----
  {
    name: 'Sahira',
    village: 'Rudania',
    category: 'Sage',
    type: 'Light',
    owner: 'Mata',
    iconUrl: 'https://storage.googleapis.com/tinglebot/Mod%20Characters/%5BRotW%5D%20modCharacters_Sage_Light_Sahira%20ICON.png',
    getHealingRequirements: (characterName) => {
      return [
        {
          type: 'art',
          description: `**Sahira: Sage of Light** asks you to draw yourself being healed. Minimum requirement: Line Art.`
        },
        {
          type: 'writing',
          description: `**Sahira: Sage of Light** asks you to write a short story of the healing. 500 words or less.`
        },
        {
          type: 'item',
          description: `"I, Warlock Queen and Sage of Light Sahira, ask for a humble tribute; Insects. I wish to study insects! Please present them to me! ... Any will do, really, just uh... please make sure not to hurt them?" `,
          items: [
            { name: 'Bladed Rhino Beetle', quantity: 3 },
            { name: 'Blessed Butterfly', quantity: 4 },
            { name: 'Cold Darner', quantity: 3 },
            { name: 'Deep Firefly', quantity: 3 },
            { name: 'Deku Hornet', quantity: 4 },
            { name: 'Eldin Roller', quantity: 3 },
            { name: 'Electric Darner', quantity: 4 },
            { name: 'Energetic Rhino Beetle', quantity: 5 },
            { name: 'Fabled Butterfly', quantity: 4 },
            { name: 'Fairy', quantity: 3 },
            { name: 'Faron Grasshopper', quantity: 4 },
            { name: 'Gerudo Dragonfly', quantity: 5 },
            { name: 'Golden Insect', quantity: 4 },
            { name: 'Lanayru Ant', quantity: 3 },
            { name: 'Mock Fairy', quantity: 4 },
            { name: 'Restless Cricket', quantity: 5 },
            { name: 'Rugged Rhino Beetle', quantity: 4 },
            { name: 'Sand Cicada', quantity: 3 },
            { name: 'Sky Stag Beetle', quantity: 4 },
            { name: 'Skyloft Mantis', quantity: 5 },
            { name: 'Smotherwing Butterfly', quantity: 4 },
            { name: 'Starry Firefly', quantity: 3 },
            { name: 'Summerwing Butterfly', quantity: 4 },
            { name: 'Sunset Firefly', quantity: 5 },
            { name: 'Thunderwing Butterfly', quantity: 4 },
            { name: 'Volcanic Ladybug', quantity: 3 },
            { name: 'Warm Darner', quantity: 4 },
            { name: 'Winterwing Butterfly', quantity: 5 },
            { name: 'Woodland Rhino Beetle', quantity: 4 }
          ]
        }
      ];
    },
    roleplayResponse: (characterName) => 
      `Sahira seems relieved it worked, before putting on a more serious face, "Your Warlock Queen has cured you, go in peace, subject!""`
  },
  {
    name: 'Korelii',
    village: 'Inariko',
    category: 'Sage',
    type: 'Water',
    owner: 'Mata',
    iconUrl: 'https://storage.googleapis.com/tinglebot/Mod%20Characters/%5BRotW%5D%20modCharacters_Sage_Water_Korelii%20ICON.png',
    getHealingRequirements: (characterName) => {
      return [
        {
          type: 'art',
          description: `**Korelii: Sage of Water** asks you to draw the story of how your OC came to be infected by blight. Minimum requirement: Line Art.`
        },
        {
          type: 'writing',
          description: `**Korelii: Sage of Water** asks you to write about how your OC became infected with blight. 500 words or less.`
        },
        {
          type: 'item',
          description: `"Oh hey there, Goro! Got any fish? My coral buddies need a bit of cleaning and its a real bother to get back there myself, Goro!"
          
          Offer up sea critters to Korelii!"`,
          items: [
            { name: 'Ancient Arowana', quantity: 3 },
            { name: 'Armored Carp', quantity: 4 },
            { name: 'Armored Porgy', quantity: 5 },
            { name: 'Bright-Eyed Crab', quantity: 4 },
            { name: 'Chillfin Trout', quantity: 3 },
            { name: 'Glowing Cave Fish', quantity: 4 },
            { name: 'Hearty Bass', quantity: 5 },
            { name: 'Hearty Blueshell Snail', quantity: 4 },
            { name: 'Hearty Salmon', quantity: 5 },
            { name: 'Hyrule Bass', quantity: 4 },
            { name: 'Ironshell Crab', quantity: 5 },
            { name: 'Mighty Carp', quantity: 3 },
            { name: 'Mighty Porgy', quantity: 4 },
            { name: 'Razorclaw Crab', quantity: 3 },
            { name: 'Sanke Carp', quantity: 4 },
            { name: 'Sizzlefin Trout', quantity: 3 },
            { name: 'Sneaky River Snail', quantity: 5 },
            { name: 'Staminoka Bass', quantity: 3 },
            { name: 'Stealthfin Trout', quantity: 5 },
            { name: 'Voltfin Trout', quantity: 3 }
          ]
        }
      ];
    },
    roleplayResponse: (characterName) => 
      `Korelii gives a proud grin, "There you go, Goro! All better! Keep safe now!" He offers a parting wave before trotting back into the waters."`
  },
  {
    name: 'Ginger-Sage',
    village: 'Vhintl',
    category: 'Sage',
    type: 'Forest',
    owner: 'Chari',
    iconUrl: 'https://storage.googleapis.com/tinglebot/Mod%20Characters/%5BRotW%5D%20modCharacters_Sage_Forest_Ginger%20ICON.png',
    getHealingRequirements: (characterName) => {
      return [
        {
          type: 'art',
          description: `**Ginger-Sage, Sage of Forest** asks you to draw your OC being healed by her with glowing vines. Must be at least clean lineart or colored sketch.`
        },
        {
          type: 'writing',
          description: `**Ginger-Sage, Sage of Forest** asks you to write about how your OC was healed by her glowing vines. 500 words or less.`
        },
        {
          type: 'item',
          description: `**Ginger-Sage, Sage of Forest** requires an offering of ONE of the following plants, herbs, or flowers to heal **${characterName}**:`,
          items: [
            { name: 'Acorn', quantity: 4 },
            { name: 'Ancient Flower', quantity: 3 },
            { name: 'Armoranth', quantity: 5 },
            { name: 'Blue Nightshade', quantity: 3 },
            { name: 'Brightbloom Seed', quantity: 3 },
            { name: 'Cane Sugar', quantity: 5 },
            { name: 'Carrumpkin', quantity: 3 },
            { name: 'Fortified Pumpkin', quantity: 3 },
            { name: 'Chickaloo Tree Nut', quantity: 3 },
            { name: 'Cool Safflina', quantity: 3 },
            { name: 'Electric Safflina', quantity: 3 },
            { name: 'Warm Safflina', quantity: 5 },
            { name: 'Endura Carrot', quantity: 4 },
            { name: 'Swift Carrot', quantity: 3 },
            { name: 'Hearty Radish', quantity: 3 },
            { name: 'Hylian Rice', quantity: 5 },
            { name: 'Hylian Tomato', quantity: 3 },
            { name: 'Hyrule Herb', quantity: 4 },
            { name: 'Ice Rose', quantity: 3 },
            { name: 'Kelp', quantity: 3 },
            { name: 'Mighty Thistle', quantity: 5 },
            { name: 'Muddle Bud', quantity: 3 },
            { name: 'Silent Princess', quantity: 3 },
            { name: 'Stambulb', quantity: 3 },
            { name: 'Sundelion', quantity: 4 },
            { name: 'Swift Violet', quantity: 3 },
            { name: 'Tabantha Wheat', quantity: 5 }
          ]
        }
      ];
    },
    roleplayResponse: (characterName) => 
      `Ginger-Sage beckons you to rest. "You look tired, **${characterName}**. Let my vines soothe you."`
  },

  {
    name: 'Sigrid',
    village: 'Inariko',
    category: 'Sage',
    type: 'Shadow',
    owner: 'Roots.Admin',
    iconUrl: 'https://storage.googleapis.com/tinglebot/Mod%20Characters/%5BRotW%5D%20modCharacters_Sage_Shadow_Sigrid%20ICON.png',
    getHealingRequirements: (characterName) => {
      return [
        {
          type: 'art',
          description: `**Sigrid: Sage of Shadow** asks you to draw a grayscale colored image with a focus on shadows.`
        },
        {
          type: 'writing',
          description: `**Sigrid: Sage of Shadow** asks you to write about how your OC experienced fear or shame due to their blight. 500 words.`
        },
        {
          type: 'item',
          description: `**Sigrid: Sage of Shadow** requires an offering of ONE of the following meat or hunting items to heal **${characterName}**:`,
          items: [
            { name: 'Raw Bird Drumstick', quantity: 3 },
            { name: 'Raw Bird Thigh', quantity: 4 },
            { name: 'Raw Whole Bird', quantity: 3 },
            { name: 'Raw Meat', quantity: 5 },
            { name: 'Raw Prime Meat', quantity: 3 },
            { name: 'Raw Gourmet Meat', quantity: 3 },
            { name: 'Bird Egg', quantity: 5 },
            { name: 'Leather', quantity: 4 },
            { name: 'Monster Fur', quantity: 3 },
            { name: 'Wool', quantity: 4 },
            { name: 'Rugged Horn', quantity: 5 },
            { name: 'Ornamental Skull', quantity: 1 },
            { name: 'Golden Skull', quantity: 1 }
          ]
        }
      ];
    },
    roleplayResponse: (characterName) => 
      `Sigrid watches from the shadows. "Fear is a powerful thing, **${characterName}**. But you can conquer it."`
}
];

// ------------------- Function to get Healers by Village -------------------
function getHealersByVillage(village) {
  return modCharacters.filter(character => character.village === village);
}

// ------------------- Function to get Mod Character by Name -------------------
// This function retrieves a mod character by their name
function getModCharacterByName(name) {
  return modCharacters.find(character => character.name.toLowerCase() === name.toLowerCase());
}

module.exports = {
  modCharacters,
  getHealersByVillage,
  getModCharacterByName,
};
