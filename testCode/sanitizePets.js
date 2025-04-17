// sanitizePets.js

require('dotenv').config();
const mongoose = require('mongoose');
const { connectToTinglebot } = require('../database/connection');
const Pet = require('../models/PetModel');
const Character = require('../models/CharacterModel');

async function sanitizePets() {
  // 1. Connect to your Tinglebot database
  await connectToTinglebot();
  console.log('✅ Connected to Tinglebot DB');

  // 2. Delete all documents in the Pet collection
  const petResult = await Pet.deleteMany({});
  console.log(`🗑  Deleted ${petResult.deletedCount} pet document(s)`);

  // 3. Clear embedded pet data on every Character
  const charResult = await Character.updateMany(
    {},
    {
      $set: {
        pets: [],             // remove all pet subdocs
        currentActivePet: null
      }
    }
  );
  console.log(`🔄 Updated ${charResult.modifiedCount} character(s), cleared pet arrays`);

  // 4. (Optional) If you keep any pet‐related collections elsewhere, drop them here

  // 5. Exit
  console.log('🚀 Database sanitization complete. Exiting.');
  process.exit(0);
}

sanitizePets().catch(err => {
  console.error('❌ Sanitization failed:', err);
  process.exit(1);
});
