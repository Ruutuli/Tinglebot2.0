// ------------------- Seed Item Elements -------------------
// This script assigns elemental types to weapons in the database
// Run with: node bot/scripts/getElementalWeapons.js

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// Load environment variables - try root .env first, then bot/.env as fallback
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const botEnvPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(botEnvPath)) {
  dotenv.config({ path: botEnvPath });
}

// Helper function to get MongoDB URI (same pattern as database.js)
const getMongoUri = () => {
  return process.env.MONGODB_TINGLEBOT_URI_PROD 
      || process.env.MONGODB_TINGLEBOT_URI
      || process.env.MONGODB_URI;
};

// Element patterns to identify elemental weapons
const ELEMENT_PATTERNS = {
  fire: [/fire/i, /flame/i, /igneo/i, /meteo/i, /volcanic/i, /blazing/i, /inferno/i, /ember/i],
  ice: [/ice/i, /frost/i, /frozen/i, /blizzard/i, /glacial/i, /frigid/i, /snow/i, /cold/i],
  electric: [/electric/i, /thunder/i, /lightning/i, /shock/i, /volt/i, /storm/i],
  water: [/water/i, /aqua/i, /ocean/i, /sea/i, /tidal/i],
  wind: [/wind/i, /gust/i, /cyclone/i, /tornado/i, /aerial/i],
  earth: [/stone/i, /rock/i, /earth/i, /boulder/i, /quake/i],
  undead: [/cursed/i, /dark/i, /shadow/i, /gloom/i, /demon/i],
  light: [/light/i, /radiant/i, /luminous/i, /divine/i, /holy/i, /sacred/i],
  tech: [/ancient/i, /sheikah/i, /guardian/i],
};

function determineElement(itemName) {
  const lowerName = itemName.toLowerCase();
  
  for (const [element, patterns] of Object.entries(ELEMENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerName)) {
        return element;
      }
    }
  }
  
  return 'none';
}

async function seedItemElements() {
  try {
    // Connect to MongoDB
    const mongoUri = getMongoUri();
    if (!mongoUri) {
      throw new Error('MongoDB URI not found. Please set MONGODB_TINGLEBOT_URI_PROD, MONGODB_TINGLEBOT_URI, or MONGODB_URI');
    }
    
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB\n');
    
    // Get Item model
    const Item = require('../models/ItemModel');
    
    // Query for weapons (categoryGear is 'Weapon' or subtype includes weapon types)
    const weaponSubtypes = ['Sword', 'Bow', 'Spear', 'Club', 'Axe', 'Hammer', 'Dagger', 'Staff', 'Wand', 'Rod', 'Arrow', 'Shield'];
    
    const weapons = await Item.find({
      $or: [
        { categoryGear: 'Weapon' },
        { subtype: { $in: weaponSubtypes } },
        { type: { $in: ['Weapon'] } }
      ]
    }).sort({ itemName: 1 });
    
    console.log(`Found ${weapons.length} total weapons\n`);
    
    let updated = 0;
    let skipped = 0;
    const elementCounts = {};
    
    for (const weapon of weapons) {
      const newElement = determineElement(weapon.itemName);
      
      // Track element distribution
      elementCounts[newElement] = (elementCounts[newElement] || 0) + 1;
      
      if (weapon.element !== newElement) {
        weapon.element = newElement;
        await weapon.save();
        console.log(`  Updated: ${weapon.itemName} -> ${newElement}`);
        updated++;
      } else {
        skipped++;
      }
    }
    
    // Display results
    console.log('\n' + '='.repeat(60));
    console.log('SEED SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total weapons: ${weapons.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Already correct: ${skipped}`);
    console.log('\nElement distribution:');
    Object.entries(elementCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([element, count]) => {
        console.log(`  ${element}: ${count}`);
      });
    
    // Export data as JSON for reference
    const elementalWeapons = {};
    for (const weapon of weapons) {
      const element = weapon.element || 'none';
      if (!elementalWeapons[element]) {
        elementalWeapons[element] = [];
      }
      elementalWeapons[element].push({
        name: weapon.itemName,
        subtype: weapon.subtype,
        rarity: weapon.itemRarity,
        attack: weapon.modifierHearts,
        emoji: weapon.emoji || ''
      });
    }
    
    const outputData = {
      totalWeapons: weapons.length,
      updated,
      skipped,
      elementCounts,
      elementalWeapons
    };
    
    const outputPath = path.resolve(__dirname, 'elementalWeapons.json');
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\nData exported to: ${outputPath}`);
    
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
    
  } catch (error) {
    console.error('Error seeding item elements:', error);
    process.exit(1);
  }
}

// Run the function
seedItemElements();
