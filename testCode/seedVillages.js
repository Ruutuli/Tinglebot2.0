// ------------------- Import required modules -------------------
const mongoose = require('mongoose');
const { Village } = require('../models/VillageModel');
require('dotenv').config();

// ------------------- Connect to MongoDB -------------------
async function connectToMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Could not connect to MongoDB...', error);
    throw error;
  }
}

// ------------------- Village Data -------------------
const villageData = [
  {
    name: 'Rudania',
    region: 'Eldin',
    color: '#d7342a',
    emoji: '<:rudania:899492917452890142>',
    health: 100, // Health for level 1
    currentTokens:15000, 
    level: 1,
    materials: {
      Wood: { current: 125, required: { 2: 250, 3: 500 } },
      "Eldin Ore": { current: 100, required: { 2: 200, 3: 250 } },
      "Goron Ore": { current: 50, required: { 2: 100, 3: 200 } },
      "Fancy Fabric": { current: 0, required: { 3: 50 } },
      "Dinraal's Claw": { current: 0, required: { 3: 1 } },
      "Shard of Dinraal's Fang": { current: 0, required: { 3: 1 } },
      "Shard of Dinraal's Horn": { current: 0, required: { 3: 1 } },
      "Goddess Plume": { current: 0, required: { 3: 1 } },
    },
  },
  {
    name: 'Inariko',
    region: 'Lanayru',
    color: '#277ecd',
    emoji: '<:inariko:899493009073274920>',
    health: 100, // Health for level 1
    currentTokens:15000, 
    level: 1,
    materials: {
      Wood: { current: 125, required: { 2: 250, 3: 500 } },
      "Silver Ore": { current: 100, required: { 2: 200, 3: 250 } },
      "Luminous Stone": { current: 0, required: { 3: 100 } },
      "Silver Thread": { current: 25, required: { 2: 50, 3: 50 } },
      "Naydra's Claw": { current: 0, required: { 3: 1 } },
      "Shard of Naydra's Fang": { current: 0, required: { 3: 1 } },
      "Shard of Naydra's Horn": { current: 0, required: { 3: 1 } },
      "Goddess Plume": { current: 0, required: { 3: 1 } },
    },
  },
  {
    name: 'Vhintl',
    region: 'Faron',
    color: '#25c059',
    emoji: '<:vhintl:899492879205007450>',
    health: 100, // Health for level 1
    currentTokens:15000, 
    level: 1,
    materials: {
      Wood: { current: 125, required: { 2: 250, 3: 500 } },
      "Tree Branch": { current: 100, required: { 2: 200, 3: 250 } },
      "Korok Leaf": { current: 25, required: { 2: 50, 3: 100 } },
      "Vintage Linen": { current: 0, required: { 3: 50 } },
      "Farosh's Claw": { current: 0, required: { 3: 1 } },
      "Shard of Farosh's Fang": { current: 0, required: { 3: 1 } },
      "Shard of Farosh's Horn": { current: 0, required: { 3: 1 } },
      "Goddess Plume": { current: 0, required: { 3: 1 } },
    },
  },
];

// ------------------- Seed Villages -------------------
async function seedVillages() {
  await connectToMongoDB();

  try {
    for (const village of villageData) {
      const existingVillage = await Village.findOne({ name: village.name });
      if (!existingVillage) {
        await Village.create(village);
        console.log(`✅ Village "${village.name}" created successfully.`);
      } else {
        console.log(`ℹ️ Village "${village.name}" already exists.`);
      }
    }
    console.log('✅ All villages seeded successfully.');
  } catch (error) {
    console.error('❌ Error seeding villages:', error);
  } finally {
    mongoose.disconnect();
  }
}

// ------------------- Execute the seed function -------------------
seedVillages().catch((error) => {
  console.error('❌ Error during village seeding:', error);
  process.exit(1);
});
