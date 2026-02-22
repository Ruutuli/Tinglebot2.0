// ------------------- Seed Monster Elements -------------------
// This script assigns elemental types to all monsters in the database
// Run with: node bot/scripts/seedMonsterElements.js

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from bot/.env
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });
console.log('Loading .env from:', envPath);

// Element mapping based on monster name patterns
const ELEMENT_RULES = [
  // Fire element monsters
  { pattern: /fire/i, element: 'fire' },
  { pattern: /igneo/i, element: 'fire' },
  { pattern: /meteo/i, element: 'fire' },
  { pattern: /fire-breath/i, element: 'fire' },
  { pattern: /firebreath/i, element: 'fire' },
  
  // Ice element monsters
  { pattern: /ice/i, element: 'ice' },
  { pattern: /frost/i, element: 'ice' },
  { pattern: /blizzard/i, element: 'ice' },
  { pattern: /ice-breath/i, element: 'ice' },
  { pattern: /icebreath/i, element: 'ice' },
  { pattern: /snow/i, element: 'ice' },
  
  // Electric element monsters
  { pattern: /electric/i, element: 'electric' },
  { pattern: /thunder/i, element: 'electric' },
  
  // Water element monsters
  { pattern: /water/i, element: 'water' },
  
  // Earth element monsters
  { pattern: /stone/i, element: 'earth' },
  { pattern: /rock/i, element: 'earth' },
  { pattern: /talus/i, element: 'earth' }, // Base Talus are earth (overridden by Frost/Igneo)
  { pattern: /pebblit/i, element: 'earth' }, // Base Pebblits are earth (overridden by Frost/Igneo)
  { pattern: /molduga/i, element: 'earth' },
  { pattern: /molduking/i, element: 'earth' },
  
  // Undead element monsters (skeletal/cursed/gloom)
  { pattern: /cursed/i, element: 'undead' },
  { pattern: /stal/i, element: 'undead' }, // Stalkoblin, Stalmoblin, Stalizalfos, Stalnox
  { pattern: /gloom/i, element: 'undead' },
  { pattern: /gibdo/i, element: 'undead' },
  { pattern: /moth gibdo/i, element: 'undead' },
  
  // Wind element monsters
  { pattern: /sky/i, element: 'wind' },
  { pattern: /forest/i, element: 'wind' }, // Forest creatures use wind
];

// Specific overrides for monsters that need exact matching
const ELEMENT_OVERRIDES = {
  // Fire monsters
  'Fire Chuchu (Large)': 'fire',
  'Fire Chuchu (Medium)': 'fire',
  'Fire Chuchu (Small)': 'fire',
  'Fire Keese': 'fire',
  'Fire Wizzrobe': 'fire',
  'Fire-breath Lizalfos': 'fire',
  'Igneo Pebblit': 'fire',
  'Igneo Talus': 'fire',
  'Meteo Wizzrobe': 'fire',
  
  // Ice monsters
  'Ice Chuchu (Large)': 'ice',
  'Ice Chuchu (Medium)': 'ice',
  'Ice Chuchu (Small)': 'ice',
  'Ice Keese': 'ice',
  'Ice Wizzrobe': 'ice',
  'Ice-breath Lizalfos': 'ice',
  'Frost Pebblit': 'ice',
  'Frost Talus': 'ice',
  'Blizzard Wizzrobe': 'ice',
  'Snow Octorok': 'ice',
  
  // Electric monsters
  'Electric Chuchu (Large)': 'electric',
  'Electric Chuchu (Medium)': 'electric',
  'Electric Chuchu (Small)': 'electric',
  'Electric Keese': 'electric',
  'Electric Lizalfos': 'electric',
  'Electric Wizzrobe': 'electric',
  'Thunder Wizzrobe': 'electric',
  
  // Water monsters
  'Water Octorok': 'water',
  
  // Earth monsters
  'Stone Pebblit': 'earth',
  'Stone Talus': 'earth',
  'Rare Talus': 'earth',
  'Luminous Talus': 'earth',
  'Rock Octorok': 'earth',
  'Molduga': 'earth',
  'Molduking': 'earth',
  
  // Undead monsters (skeletal/cursed/gloom)
  'Cursed Bokoblin': 'undead',
  'Cursed Lizalfos': 'undead',
  'Cursed Moblin': 'undead',
  'Stalkoblin': 'undead',
  'Stalmoblin': 'undead',
  'Stalizalfos': 'undead',
  'Stalnox': 'undead',
  'Gloom Hands': 'undead',
  'Gibdo': 'undead',
  'Moth Gibdo': 'undead',
  'Horriblin': 'undead',
  
  // Wind monsters
  'Sky Octorok': 'wind',
  'Forest Octorok': 'wind',
  
  // Golden variants (no special element - just stronger physical)
  'Golden Bokoblin': 'none',
  'Golden Lizalfos': 'none',
  'Golden Moblin': 'none',
  'Golden Lynel': 'none',
  
  // None (standard/physical monsters)
  'Bokoblin': 'none',
  'Blue Bokoblin': 'none',
  'Black Bokoblin': 'none',
  'Silver Bokoblin': 'none',
  'Boss Bokoblin': 'none',
  'Moblin': 'none',
  'Blue Moblin': 'none',
  'Black Moblin': 'none',
  'Silver Moblin': 'none',
  'Lizalfos': 'none',
  'Blue Lizalfos': 'none',
  'Black Lizalfos': 'none',
  'Silver Lizalfos': 'none',
  'Lynel': 'none',
  'Blue-Maned Lynel': 'none',
  'White-maned Lynel': 'none',
  'Silver Lynel': 'none',
  'Hinox': 'none',
  'Blue Hinox': 'none',
  'Black Hinox': 'none',
  'Keese': 'none',
  'Chuchu (Large)': 'none',
  'Chuchu (Medium)': 'none',
  'Chuchu (Small)': 'none',
  'Treasure Octorok': 'none',
  'Like Like': 'none',
  'Evermean': 'none',
  'Little Frox': 'none',
  'Yiga Blademaster': 'none',
  'Yiga Footsoldier': 'none',
};

function determineElement(monsterName) {
  // First check explicit overrides
  if (ELEMENT_OVERRIDES[monsterName]) {
    return ELEMENT_OVERRIDES[monsterName];
  }
  
  // Then check pattern rules (more specific patterns should be checked first)
  // Sort patterns by specificity (longer patterns first)
  const sortedRules = [...ELEMENT_RULES].sort((a, b) => 
    b.pattern.source.length - a.pattern.source.length
  );
  
  for (const rule of sortedRules) {
    if (rule.pattern.test(monsterName)) {
      return rule.element;
    }
  }
  
  return 'none';
}

async function seedMonsterElements() {
  try {
    // Connect to MongoDB (check multiple possible env var names)
    const mongoUri = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MongoDB URI not found. Set MONGODB_TINGLEBOT_URI or MONGODB_URI in your .env file');
    }
    
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    // Get Monster model
    const Monster = require('../models/MonsterModel');
    
    // Fetch all monsters
    const monsters = await Monster.find({});
    console.log(`Found ${monsters.length} monsters to update`);
    
    let updated = 0;
    let skipped = 0;
    const elementCounts = {};
    
    for (const monster of monsters) {
      const newElement = determineElement(monster.name);
      
      // Track element distribution
      elementCounts[newElement] = (elementCounts[newElement] || 0) + 1;
      
      if (monster.element !== newElement) {
        monster.element = newElement;
        await monster.save();
        console.log(`  Updated: ${monster.name} -> ${newElement}`);
        updated++;
      } else {
        skipped++;
      }
    }
    
    console.log('\n--- Summary ---');
    console.log(`Total monsters: ${monsters.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Already correct: ${skipped}`);
    console.log('\nElement distribution:');
    Object.entries(elementCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([element, count]) => {
        console.log(`  ${element}: ${count}`);
      });
    
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
    
  } catch (error) {
    console.error('Error seeding monster elements:', error);
    process.exit(1);
  }
}

// Run the seed function
seedMonsterElements();
