// ============================================================================
// ------------------- Entertainer Items Seeding Script -------------------
// ============================================================================
// This script updates existing items with the entertainerItems flag
// for the Entertainer boost functionality.

const mongoose = require('mongoose');
require('dotenv').config();

// Import the Item model
const Item = require('../models/ItemModel');

// List of items that should be flagged as entertainerItems
const entertainerItemNames = [
  'Aurora Stone',
  'Blin Bling', 
  'Dazzlefruit',
  'Fabled Butterfly',
  'Fairy Dust',
  'Gold Dust',
  'Golden Apple',
  'Hylian Tomato',
  'Monster Horn',
  'Pretty Plume',
  'Silver Dust',
  'Crystal Skull',
  'Frilly Fabric',
  'Golden Skull',
  'Lace',
  'Ornamental Skull',
  'Silk',
  'Vintage Linen',
  'Wild berry'
];

async function seedEntertainerItems() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Update items with entertainerItems flag
    const updateResult = await Item.updateMany(
      { itemName: { $in: entertainerItemNames } },
      { $set: { entertainerItems: true } }
    );

    console.log(`✅ Updated ${updateResult.modifiedCount} items with entertainerItems flag`);

    // Verify the updates by fetching the updated items
    const updatedItems = await Item.find({ entertainerItems: true });
    console.log('\n📋 Items with entertainerItems flag:');
    updatedItems.forEach(item => {
      console.log(`  - ${item.itemName}`);
    });

    // Check for any items in our list that weren't found
    const foundItemNames = updatedItems.map(item => item.itemName);
    const notFoundItems = entertainerItemNames.filter(name => !foundItemNames.includes(name));
    
    if (notFoundItems.length > 0) {
      console.log('\n⚠️  Items not found in database:');
      notFoundItems.forEach(name => {
        console.log(`  - ${name}`);
      });
    }

    console.log('\n✅ Entertainer items seeding completed!');

  } catch (error) {
    console.error('❌ Error seeding entertainer items:', error);
  } finally {
    // Close the database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the seeding function
seedEntertainerItems(); 