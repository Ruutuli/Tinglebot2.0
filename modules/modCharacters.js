const { handleError } = require('../utils/globalErrorHandler');

// ------------------- Module to store Mod OCs for Healing -------------------
// This module contains the Mod OCs and their respective village, category, type, owner, and dynamic healing requirements.

// ------------------- Oracles -------------------
//---------------- Aemu ----------------
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
                description: `**Aemu: Oracle of Power** stumbles over her words, clearly a bit flustered. "Oh, um! Okay, so I need these things... Ah, Hylia, what were they called again... OKAY, OKAY, SO..."

- That orangey gem! You know, the shiny one? I need **5 of those!**
- Oh, or maybe... the ancient one? It’s more of a relic. I need **1 of those.**
- A reddish pearl... yes, that's it! I just need **1 of those.**
- Oh! Or a feather, but not just any feather... the one from the Goddess herself! I need **1 of those.**
- And if you can’t find any of that, how about something that fell from the stars? I need **1 of those!**`,
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

    roleplayResponseBefore: (characterName) => {
        return `Aemu grins brightly, full of confidence, but you can sense a hint of nervous energy. "Don't worry, **${characterName}**, I've got this! Together, we’ll beat this blight! Just, uh... make sure to keep faith in me, okay? I've got a lot to prove!"`;
    },
    roleplayResponseAfter: (characterName) => {
        return `Aemu beams with pride as the blight fades away. "We did it, **${characterName}**! The power of Din has restored you! Keep that strength with you, okay? You've got this!"`;
    }
    
},

//---------------- Elde ----------------
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
              description: `A carved wooden statue of Farore, worn with time and painted in layers of golds and greens can be found tucked away in an old tree house within Vhintl most of the year, often still adorned with flowers. 
The space is fairly unassuming and is rarely without a few korok or fairies loitering about. Draw your OC visiting the goddess statue, or even draw them getting healed by **Elde, Oracle of Courage** (in either form)! 
Elde's healing magic occurs through a warm touch of fingers or nubs that dissipates and expels blight in a ripple of golden-green light from the point of contact. Minimum requirement: Flat Colored Image!`
          },
          {
              type: 'writing',
              description: `**Elde, Oracle of Courage** asks you to write about how your character exhibited the virtue of courage, or how the virtue of courage influenced part of their life. 
Is the ability to stand strong in the face of frightful things something they value? At least 500 words!`
          },
          {
              type: 'item',
              description: `**Elde, Oracle of Courage** wouldn't hesitate to heal those they strive to protect and certainly wouldn't ask for compensation, however it would be rude not to thank them! 
A little fairy gives you some hints as to what you could offer:
- "Any one part from one of those big tough Lynels—just one will do. Elde’s been studying them, they think that stuff is pretty neat."
- "Lizalfos parts, from the kinds found in and around the forest. But we need **50 of each!** Show Elde how much you’re helping!"
- "Did you know Elde has a favourite Beetle? It has great big mandibles and is the colour of the sky, but it’s not easy to find. You should bring back a few of them, perhaps **5 would do?**"`,
              items: [
                  { name: 'Lizalfos Horn', quantity: 50 },
                  { name: 'Lizalfos Talon', quantity: 50 },
                  { name: 'Lizalfos Tail', quantity: 50 },
                  { name: 'Yellow Lizalfos Tail', quantity: 50 },
                  { name: 'Lizalfos Arm', quantity: 50 },
                  { name: 'Lynel Hoof', quantity: 1 },
                  { name: 'Lynel Horn', quantity: 1 },
                  { name: 'Lynel Guts', quantity: 1 },
                  { name: 'Sky Stag Beetle', quantity: 5 }
              ]
          }
      ];
  },

  roleplayResponseBefore: (characterName) => {
    return `Elde rests perched above on a tree branch, silently eyeing you as you approach. 
Did you find them... or did they find you? Regardless, their quiet presence seems reassuring. 
"... ${characterName}, right? I can sense the blight on you, let me help with that."`;
},
roleplayResponseAfter: (characterName) => {
    return `Elde offers a small, knowing smile as the blight is dispelled. "Courage brought you here, **${characterName}**, and courage will guide you forward."`;
}

},

//---------------- Nihme ----------------
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
              type: 'writing',
              description: `**Nihme: Oracle of Wisdom** asks you to document your symptoms up to this point, every experience with blight is different, and studying it further will do well for others. 
How has your character been dealing with blight at their stage? Even behavioral changes should not be dismissed! These records will be kept in the library for future reference. 500 words or less.`
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

  roleplayResponseBefore: (characterName) => {
    return `Nihme peers over her book, a soft smile gracing her lips. "Oh, hello there, **${characterName}**. You need guidance? Well, I'm here to help. Let's tackle this blight together, one step at a time."`;
},
roleplayResponseAfter: (characterName) => {
    return `Nihme nods approvingly, closing her book. "The blight is gone, **${characterName}**, but the lessons it taught you remain. Use them wisely."`;
}

},

// ------------------- Dragons -------------------

//---------------- Sanskar  ----------------
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

  roleplayResponseBefore: (characterName) => {
    return `Sanskar raises an eyebrow, amused. "You, **${characterName}**, seek wisdom? Isn't that something you should already have? Prove your wisdom - and we'll see about your request."`;
},
roleplayResponseAfter: (characterName) => {
    return `Sanskar smirks, his eyes glowing faintly. "You’ve been healed, **${characterName}**."`;
}

},

//---------------- Darune ----------------
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
    roleplayResponseBefore: (characterName) => {
        return `Darune huffs, his fiery gaze focused on you. "You dare to seek my help, **${characterName}**? Fine. But know this—you'll owe me. Blight or no blight, I don’t offer my strength freely."`;
    },
    roleplayResponseAfter: (characterName) => {
        return `A soothing warmth washes over you, healing you of your blighted affliction. Darune's golden gaze observes you, making sure that everything seems alright. When they are sure you are now fine, their lips pull back into a smug grin, "Perfection, **${characterName}**, if I do say so myself.~ Do you not agree?" Before you can answer, he quiets you with a raised dragons claw, "Now, be a good human, and try not to become blighted again, hm?"`;
    }
    
  },

  //---------------- Foras ---------------- 
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
                description: `**Foras, Dragon of Courage** asks you to draw your character seeking out the dragon of courage to be healed by their soothing wind magic! 
Foras is rather spontaneous and doesn't stay in one spot for long. Will you depict your OC trekking through Faron's overgrown plant life on the forest floor, crossing Vhintl's reliable rope bridges, standing tall with the wind in their hair.... or perhaps you wish to draw them actually encountering the eccentric dragon in either their humanoid or great dragon form...! Minimum requirements: Full Color image.`
            },
            {
                type: 'writing',
                description: `**Courage comes in all forms!** Share with **Foras, Dragon of Courage** and write about a time your character exhibited emotional courage! 
Perhaps explore what they felt, or if they overcame their struggle, or even if they learned from their experience. Did they have any trouble? Perhaps they leaned on someone to help them through? Write at least 500 words!`
            },
            {
                type: 'item',
                description: `**Foras, Dragon of Courage** is quite prone to chatter as they fuss over **${characterName}**...! Perhaps your OC could offer them a gift to show their gratitude! A fairy provides you with some clues as to what you could leave them!:

- "Foras has a favourite fruit! It's red, naturally insulated and kinda looks like it's covered in scales, perfect for a dragon! But Foras is big, we might need like... 50 of them!”
- "Did you know Foras is fond of the koroks? Some say they come from the same place. You should bring Foras some of those leaves they like! Maybe like.. 10 of them just to be safe!"
- "Oh Foras might like some flowers, I hear there's some purple ones that like to grow way up high! 5 of these should do!”
- "Here's a secret, Foras has a favourite dish. You should bring them some of that heart soup, they'll totally love it, hehe! 1 bowl should do. Or 2 Omelets made of veggies, I hear they like that too!"
- "Oh yeah, you could give Foras a shiny rock!! Either 1 of those green gemstones, or 1 of those special rainbow feather rocks, but those are a lot harder to find! Hmm.. maybe just like.. 50 feathers from those silly farm birds might work just as well?"`,
                items: [
                    { name: 'Voltfruit', quantity: 50 },
                    { name: 'Cucco Feathers', quantity: 50 },
                    { name: 'Korok Leaf', quantity: 10 },
                    { name: 'Swift Violet', quantity: 5 },
                    { name: 'Vegetable Omelet', quantity: 2 },
                    { name: 'Creamy Heart Soup', quantity: 1 },
                    { name: 'Emerald', quantity: 1 },
                    { name: 'Goddess Plume', quantity: 1 }
                ]
            }
        ];
    },

    roleplayResponseBefore: (characterName) => {
        return `Foras chuckles warmly, ruffling their feathers. "Oh, **${characterName}**, don't worry! With my help, you’ll be back on your feet in no time. I quite enjoy helping after all! In fact this one time I— Oh what’s this? An offering for me?"`;
    },
    roleplayResponseAfter: (characterName) => {
        return `Foras twirls in the air with joy. "It’s done, **${characterName}**! That blight didn’t stand a chance. Go on, live boldly!"`;
    }
    
},

  // ------------------- Sages -------------------

  //---------------- Sahira ----------------
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
                description: `**Sahira: Sage of Light** asks you to draw yourself being healed. Show my great and mighty power! And how grateful you are! … Please emphasise the gratefulness, if you can! … You may smile. Minimum requirement: Line Art.`
            },
            {
                type: 'writing',
                description: `**Sahira: Sage of Light** asks you to write a short story of the healing. Are you coming in as an old friend? Are you in awe of the majesty at display? Are you conflicted and having a panic attack on aunty’s doorstep? 500 words or less.`
            },
            {
                type: 'item',
                description: `"I, Warlock Queen and Sage of Light Sahira, ask for a humble tribute; Insects. I wish to study insects! Please present them to me! ... Any will do, really, just uh... please make sure not to hurt them?"`,
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
        roleplayResponseBefore: (characterName) => {
            return `Sahira adjusts her crown with dramatic flair. "Ah, **${characterName}**, you seek the blessing of light? Very well. Prepare to witness the magnificence of your Warlock Queen!"`;
        },
        roleplayResponseAfter: (characterName) => {
            return `Sahira seems relieved it worked, before putting on a more serious face, "Your Warlock Queen has cured you, go in peace, subject!"`;
        }
},

  //---------------- Korelii ----------------
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
                description: `**Korelii: Sage of Water** asks you to draw the story of how your OC came to be infected by blight. Show the moment, if you can, or maybe the immediate aftermath even! Goro, I just kinda like any old art, really! Minimum requirement: Line Art.`
            },
            {
                type: 'writing',
                description: `**Korelii: Sage of Water** asks you to write about how your OC became infected with blight. Tell me the story, Goro! Did you make a mistake? Or were you helping someone? Did it just sneak up on you? Anything to learn from all this, Goro? 500 words or less.`
            },
            {
                type: 'item',
                description: `"Oh hey there, Goro! Got any fish? My coral buddies need a bit of cleaning and it's a real bother to get back there myself, Goro! Offer up sea critters to Korelii!"`,
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

        roleplayResponseBefore: (characterName) => {
            return `Korelii greets you with a proud grin. "Ah, **${characterName}**! You look like you’ve been through a lot, Goro. Let’s take care of that blight for you."`;
        },
        roleplayResponseAfter: (characterName) => {
            return `Korelii gives a proud grin, "There you go, Goro! All better! Keep safe now!" He offers a parting wave before trotting back into the waters.`;
        }
},

  //---------------- Ginger ----------------
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
                description: `**Ginger-Sage, Sage of Forest** is concerned and will usher you to sit or lay down on her meager wooden furniture if you come to her hollow, or on the ground where you stand otherwise and she will tend to your blight with glowing vines. Draw something related to your OC's healing, be it how the blighting came to be, how they came to be healed, or anything in between! Must be at least clean lineart or colored sketch.`
            },
            {
                type: 'writing',
                description: `**Ginger-Sage, Sage of Forest** is concerned and will usher you to sit or lay down on her meager wooden furniture if you come to her hollow, or on the ground where you stand otherwise and she will tend to your blight with glowing vines. Write 500 words or less related to your blighting or healing!`
            },
            {
                type: 'item',
                description: `**Ginger-Sage, Sage of Forest** is concerned and will usher you to sit or lay down so that she may tend to your blight with glowing vines. Thank her with a gift! She is always looking for new stock of herbs and flowers from all over Hyrule! Any one type of Plant in a bundle will do!`,
                items: [
                    { name: 'Acorn', quantity: 4 },
                    { name: 'Ancient Flower', quantity: 3 },
                    { name: 'Armoranth', quantity: 5 },
                    { name: 'Blue Nightshade', quantity: 3 },
                    { name: 'Brightbloom Seed', quantity: 3 },
                    { name: 'Cane Sugar', quantity: 5 },
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

    roleplayResponseBefore: (characterName) => {
        return `Ginger-Sage beckons you to sit and rest. "You look tired, **${characterName}**. Let me help you."`;
    },
    roleplayResponseAfter: (characterName) => {
        return `Ginger-Sage gently pats your hand as the blight dissipates. "There, **${characterName}**. The forest always watches over its own. Be kind to it in return."`;
    }
},

  //---------------- Sigrid ----------------
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
                description: `**Sigrid: Sage of Shadow** asks you to draw a grayscale colored image with a focus on shadows. Minimum requirement: Grayscale, Clean Lineart.`
            },
            {
                type: 'writing',
                description: `**Sigrid: Sage of Shadow** asks you to write about how your OC may have experienced any fear or perhaps shame due to their blight sickness. Is this something that affected them? 500 words or less.`
            },
            {
                type: 'item',
                description: `**Sigrid: Sage of Shadow** could always use a hand feeding the people of Inariko (and Sute). Provide him with an offering of Hunted items:`,
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

    roleplayResponseBefore: (characterName) => {
        return `Sigrid watches from the shadows. "Fear is a powerful thing, **${characterName}**. But you can conquer it. Only then will the blight relinquish its hold on you."`;
    },
    roleplayResponseAfter: (characterName) => {
        return `Sigrid steps back into the shadows as the blight fades. "It's done, **${characterName}**. Remember, only by facing the darkness can you truly find the light."`;
    }
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
