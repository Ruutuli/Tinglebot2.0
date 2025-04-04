// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const ShopStock = require('../models/ShopsModel'); // Import ShopStock model
require('dotenv').config();

// ------------------- Connect to MongoDB -------------------
async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error);
    process.exit(1);
  }
}

// ------------------- Shop Stock Data -------------------
const shopItems = [
  { itemName: 'Pet Training Lv.3', quantity: 9993 },
  { itemName: 'Pet Training Lv.1', quantity: 9992 },
  { itemName: 'Mount Registration', quantity: 9988 },
  { itemName: 'Job Voucher', quantity: 8904 },
  { itemName: 'Bokoblin Fang', quantity: 83 },
  { itemName: 'Ironshroom', quantity: 82 },
  { itemName: 'Cane Sugar', quantity: 75 },
  { itemName: 'Korok Leaf', quantity: 68 },
  { itemName: 'Mock Fairy', quantity: 53 },
  { itemName: 'Hearty Truffle', quantity: 51 },
  { itemName: 'Apple', quantity: 49 },
  { itemName: 'Tree Branch', quantity: 43 },
  { itemName: 'Bright-Eyed Crab', quantity: 31 },
  { itemName: 'Cucco Feathers', quantity: 28 },
  { itemName: 'Ancient Spring', quantity: 26 },
  { itemName: 'Mighty Carp', quantity: 25 },
  { itemName: 'Hearty Bass', quantity: 24 },
  { itemName: 'Raw Bird Drumstick', quantity: 23 },
  { itemName: 'Sweet Shroom', quantity: 23 },
  { itemName: 'Armored Porgy', quantity: 23 },
  { itemName: 'Flint', quantity: 22 },
  { itemName: 'Stal Skull', quantity: 22 },
  { itemName: 'Lizard Tail', quantity: 21 },
  { itemName: 'Staminoka Bass', quantity: 20 },
  { itemName: 'Armored Carp', quantity: 20 },
  { itemName: 'Ironshell Crab', quantity: 19 },
  { itemName: 'Emerald', quantity: 19 },
  { itemName: 'Octorok Tentacle', quantity: 18 },
  { itemName: 'Razorclaw Crab', quantity: 17 },
  { itemName: 'Boko Bat', quantity: 17 },
  { itemName: 'Amethyst', quantity: 17 },
  { itemName: 'Ancient Gear', quantity: 17 },
  { itemName: 'Raw Bird Thigh', quantity: 16 },
  { itemName: 'Deep-Fried Thigh', quantity: 16 },
  { itemName: 'Mighty Porgy', quantity: 15 },
  { itemName: 'Boko Bow', quantity: 15 },
  { itemName: 'Zapshroom', quantity: 15 },
  { itemName: 'Keese Eyeball', quantity: 14 },
  { itemName: 'Amber', quantity: 14 },
  { itemName: 'Rushroom', quantity: 14 },
  { itemName: 'Boko Club', quantity: 14 },
  { itemName: 'Bokoblin Arm', quantity: 14 },
  { itemName: 'Ruby', quantity: 14 },
  { itemName: 'Octorok Eyeball', quantity: 13 },
  { itemName: 'Razorshroom', quantity: 13 },
  { itemName: 'Bird Egg', quantity: 13 },
  { itemName: 'Lizalfos Talon', quantity: 13 },
  { itemName: 'Dazzlefruit', quantity: 13 },
  { itemName: 'Bokoblin Horn', quantity: 12 },
  { itemName: 'Copious Fish Skewers', quantity: 12 },
  { itemName: 'Hyrule Bass', quantity: 12 },
  { itemName: 'Octo Balloon', quantity: 12 },
  { itemName: 'Lizalfos Horn', quantity: 12 },
  { itemName: 'Boko Spear', quantity: 12 },
  { itemName: 'Hyrule Herb', quantity: 11 },
  { itemName: 'Fire Keese Wing', quantity: 11 },
  { itemName: 'Bird Feather', quantity: 11 },
  { itemName: 'Ancient Shaft', quantity: 11 },
  { itemName: 'Brightcap', quantity: 11 },
  { itemName: 'Opal', quantity: 11 },
  { itemName: 'Lizal Spear', quantity: 10 },
  { itemName: 'Hylian Shroom', quantity: 10 },
  { itemName: 'Roasted Hearty Salmon', quantity: 10 },
  { itemName: 'Starry Firefly', quantity: 10 },
  { itemName: 'Lizal Shield', quantity: 10 },
  { itemName: 'Thornberry', quantity: 10 },
  { itemName: 'Frilly Fabric', quantity: 10 },
  { itemName: 'Sunshroom', quantity: 10 },
  { itemName: 'Roasted Trout', quantity: 9 },
  { itemName: 'Stamella Shroom', quantity: 9 },
  { itemName: 'Silent Shroom', quantity: 9 },
  { itemName: 'Keese Wing', quantity: 9 },
  { itemName: 'Moblin Arm', quantity: 9 },
  { itemName: 'Moblin Fang', quantity: 9 },
  { itemName: 'Moblin Horn', quantity: 9 },
  { itemName: 'Meat Skewer', quantity: 9 },
];

// ------------------- Seed shop items -------------------
async function seedShops() {
  await connectToDatabase();

  try {
    for (const item of shopItems) {
      const numericQuantity = parseInt(item.quantity, 10); // Ensure numeric
      await ShopStock.updateOne(
        { itemName: item.itemName },
        { $set: { quantity: numericQuantity } },
        { upsert: true }
      );
      
    }

    console.log('✅ Shop items seeded successfully with numeric quantities!');
  } catch (error) {
    console.error('❌ Error seeding shop items:', error);
  } finally {
    mongoose.disconnect();
  }
}


// ------------------- Run the seed function -------------------
seedShops();
