// ============================================================================
// seed_yiga_monsters.js
// Purpose: Seed Yiga Blademaster and Yiga Footsoldier monsters to database
// ============================================================================

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const DatabaseConnectionManager = require('./shared/database/connectionManager');
const MonsterModel = require('./shared/models/MonsterModel');

// ============================================================================
// ------------------- Main Seed Function -------------------
// ============================================================================

async function seedYigaMonsters() {
  try {
    console.log('🌱 Starting Yiga monsters seed...\n');

    // Connect to tinglebot database
    console.log('📡 Connecting to database...');
    await DatabaseConnectionManager.connectToTinglebot();
    console.log('✅ Connected to database\n');

    // Get monster mapping for reference
    const { monsterMapping } = require('./shared/models/MonsterModel');

    // Define the two Yiga monsters
    const yigaMonsters = [
      {
        name: 'Yiga Footsoldier',
        nameMapping: 'yigaFootsoldier',
        image: monsterMapping.yigaFootsoldier.image,
        species: 'Yiga',
        type: 'Humanoid',
        tier: 3,
        hearts: 6,
        dmg: 1,
        bloodmoon: false,
        locations: ['Eldin', 'Lanayru', 'Faron', 'Central Hyrule', 'Gerudo', 'Hebra', 'Path of Scarlet Leaves', 'Leaf Dew Way'],
        eldin: true,
        lanayru: true,
        faron: true,
        centralHyrule: true,
        gerudo: true,
        hebra: true,
        pathOfScarletLeaves: true,
        leafDewWay: true,
        exploreLocations: ['Eldin', 'Lanayru', 'Faron'],
        exploreEldin: true,
        exploreLanayru: true,
        exploreFaron: true,
        job: [],
        adventurer: false,
        guard: false,
        graveskeeper: false,
        hunter: false,
        mercenary: false,
        scout: false,
        rancher: false,
        beekeeper: false,
        farmer: false,
        fisherman: false,
        forager: false,
        herbalist: false,
        miner: false
      },
      {
        name: 'Yiga Blademaster',
        nameMapping: 'yigaBlademaster',
        image: monsterMapping.yigaBlademaster.image,
        species: 'Yiga',
        type: 'Humanoid',
        tier: 6,
        hearts: 12,
        dmg: 2,
        bloodmoon: false,
        locations: ['Eldin', 'Lanayru', 'Faron', 'Central Hyrule', 'Gerudo', 'Hebra', 'Path of Scarlet Leaves', 'Leaf Dew Way'],
        eldin: true,
        lanayru: true,
        faron: true,
        centralHyrule: true,
        gerudo: true,
        hebra: true,
        pathOfScarletLeaves: true,
        leafDewWay: true,
        exploreLocations: ['Eldin', 'Lanayru', 'Faron'],
        exploreEldin: true,
        exploreLanayru: true,
        exploreFaron: true,
        job: [],
        adventurer: false,
        guard: false,
        graveskeeper: false,
        hunter: false,
        mercenary: false,
        scout: false,
        rancher: false,
        beekeeper: false,
        farmer: false,
        fisherman: false,
        forager: false,
        herbalist: false,
        miner: false
      }
    ];

    // Insert or update monsters
    for (const monsterData of yigaMonsters) {
      const existingMonster = await MonsterModel.findOne({ name: monsterData.name });
      
      if (existingMonster) {
        console.log(`⚠️  Monster "${monsterData.name}" already exists, updating...`);
        Object.assign(existingMonster, monsterData);
        await existingMonster.save();
        console.log(`✅ Updated ${monsterData.name} (tier ${monsterData.tier})\n`);
      } else {
        const newMonster = new MonsterModel(monsterData);
        await newMonster.save();
        console.log(`✅ Created ${monsterData.name} (tier ${monsterData.tier})\n`);
      }
    }

    // Update items to drop from these monsters
    console.log('🔧 Updating items to drop from Yiga monsters...');
    await updateItemDrops();
    console.log('✅ Items updated\n');

    console.log('🎉 Yiga monsters seed completed successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding Yiga monsters:', error);
    throw error;
  } finally {
    // Close database connection
    await DatabaseConnectionManager.closeAllConnections();
    console.log('📡 Database connections closed');
    process.exit(0);
  }
}

// ============================================================================
// ------------------- Update Item Drops -------------------
// ============================================================================

async function updateItemDrops() {
  try {
    // Connect to inventories database for items
    const db = await DatabaseConnectionManager.connectToInventoriesForItems();
    
    // Items that should drop from Yiga monsters
    const yigaItems = [
      'Demon Carver',
      'Duplex Bow',
      'Mighty Bananas',
      'Vicious Sickle',
      'Eightfold Blade'
    ];

    // Update each item
    for (const itemName of yigaItems) {
      const item = await db.collection('items').findOne({ itemName: itemName });
      
      if (!item) {
        console.log(`⚠️  Item "${itemName}" not found in database, skipping...`);
        continue;
      }

      // Update the item to drop from both Yiga monsters
      const updateResult = await db.collection('items').updateOne(
        { itemName: itemName },
        {
          $set: {
            yigaBlademaster: true,
            yigaFootsoldier: true
          },
          $addToSet: {
            monsterList: { $each: ['Yiga Blademaster', 'Yiga Footsoldier'] }
          }
        }
      );

      if (updateResult.modifiedCount > 0) {
        console.log(`✅ Updated "${itemName}" to drop from Yiga monsters`);
      } else {
        console.log(`ℹ️  "${itemName}" already configured for Yiga monsters`);
      }
    }
  } catch (error) {
    console.error('❌ Error updating item drops:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Run Seed -------------------
// ============================================================================

seedYigaMonsters().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

