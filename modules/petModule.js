// ------------------- Define mappings and data for pet-related functionalities -------------------

// Mapping of pet perks to specific fields in the item database
const perkFieldMap = {
    petprey: 'petprey',
    petforage: 'petforage',
    lgpetprey: 'lgpetprey',
    petmon: 'petmon',
    petchu: 'petchu',
    petfirechu: 'petfirechu',
    peticechu: 'peticechu',
    petelectricchu: 'petelectricchu'
  };
  
  // Mapping of pet species to emojis for better visual representation
  const petEmojiMap = {
    badger: '🦡',
    bear: '🐻',
    bee: '🐝',
    bird: '🐦',
    boar: '🐗',
    butterfly: '🦋',
    cat: '🐱',
    'chain chomp': '🔗',
    chuchu: '🟢',
    chick: '🐤',
    chicken: '🐔',
    'choir frog': '🐸',
    cow: '🐄',
    crab: '🦀',
    crow: '🐦',
    deer: '🦌',
    dolphin: '🐬',
    dove: '🕊️',
    dragon: '🐉',
    duck: '🦆',
    eagle: '🦅',
    elephant: '🐘',
    fish: '🐟',
    flamingo: '🦩',
    fox: '🦊',
    frog: '🐸',
    giraffe: '🦒',
    goat: '🐐',
    gorilla: '🦍',
    horse: '🐴',
    hyena: '🦁',
    jellyfish: '🌊',
    kangaroo: '🦘',
    keese: '🦇',
    koala: '🐨',
    ladybug: '🐞',
    leopard: '🐆',
    lion: '🦁',
    llama: '🦙',
    lobster: '🦞',
    microbe: '🦠',
    meerkat: '🦦',
    monkey: '🐒',
    mosquito: '🦟',
    octopus: '🐙',
    otter: '🦦',
    owl: '🦉',
    ox: '🐂',
    parakeet: '🦜',
    parrot: '🦜',
    peacock: '🦚',
    pig: '🐖',
    'pol\'s voice': '🐰',
    rabbit: '🐰',
    raccoon: '🦝',
    ram: '🐏',
    rat: '🐀',
    rooster: '🐓',
    sheep: '🐑',
    skunk: '🦨',
    snake: '🐍',
    sparrow: '🐦',
    squirrel: '🐿️',
    swan: '🦢',
    turtle: '🐢',
    turkey: '🦃',
    vulture: '🦅',
    walltula: '🕷️',
    wolf: '🐺',
    'small birds': '🐦',
    'shockwing nightjar': '🌌',
    'pygmy octorok': '🐙',
  };
  
  // Descriptions for each pet table roll
  const petTableRollDescriptions = {
    petprey: 'Pet hunts small game',
    lgpetprey: 'Pet hunts larger game (large pets only)',
    petforage: 'Pet forages for plants & misc',
    petmon: 'Pet hunts small monsters & forages for parts'
  };
  
  // Randomized flavor text for different types of rolls
  const flavorText = {
    petprey: [
      "**{petName}** went on a little hunt and brought you back **{itemName}**!",
      "Your loyal **{petSpecies} {petName}** found **{itemName}** while hunting small game!",
      "**{petName}** pounced through the fields and returned with **{itemName}**!"
    ],
    lgpetprey: [
      "**{petName}** chased down a big catch and found **{itemName}**!",
      "After a mighty hunt, **{petName}** has returned with **{itemName}**!",
      "Your brave **{petSpecies} {petName}** conquered the hunt and brought back **{itemName}**!"
    ],
    petforage: [
      "{petName} foraged around and discovered {itemName}!",
      "On a quiet walk, {petName} stumbled upon {itemName}!",
      "Your curious {petSpecies} {petName} found {itemName} while foraging."
    ],
    petmon: [
      "{petName} tracked down a monster and brought back {itemName}!",
      "After a daring adventure, {petName} returned with {itemName} from the hunt!",
      "Your fierce {petSpecies} {petName} defeated a monster and found {itemName}!"
    ]
  };
  
  // ------------------- Helper Functions -------------------
  
  // Retrieve the correct field for the pet's perk
  const getPerkField = (perk) => perkFieldMap[perk] || null;
  
  // Retrieve the emoji associated with a pet species
  const getPetEmoji = (species) => petEmojiMap[species.toLowerCase()] || '🐾';
  
  // Get the description for a pet table roll based on perk
  const getPetTableRollDescription = (perk) => petTableRollDescriptions[perk] || 'Unknown perk';
  
  // Generate flavor text based on roll type, pet name, species, and item found
  const getFlavorText = (tableType, petName, petSpecies, itemName) => {
    const texts = flavorText[tableType] || ["{petName} returned with {itemName}!"];
    const chosenText = texts[Math.floor(Math.random() * texts.length)];
    return chosenText
      .replace("{petName}", petName)
      .replace("{petSpecies}", petSpecies)
      .replace("{itemName}", itemName);
  };
  
  module.exports = {
    getPerkField,
    getPetEmoji,
    getPetTableRollDescription,
    getFlavorText
  };
  