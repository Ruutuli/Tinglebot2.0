// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { connectToTinglebot } = require('../database/db');
const Character = require('../models/CharacterModel');
const { handleError } = require('../utils/globalErrorHandler');

// ------------------- Database Normalization Script -------------------
async function normalizeJobs() {
  try {
    console.log('🔄 Starting job normalization process...');

    // Connect to main database
    await connectToTinglebot();
    console.log('✅ Connected to main database');

    // Define databases to process
    const databases = ['tinglebot', 'tinglebot_dev'];
    
    for (const dbName of databases) {
      console.log(`\n📊 Processing database: ${dbName}`);
      
      // Connect to the specific database
      const db = mongoose.connection.useDb(dbName);
      const itemsCollection = db.collection('items');
      
      // Print total items count
      const itemCount = await itemsCollection.countDocuments();
      console.log(`📦 Total items in ${dbName}.items: ${itemCount}`);

      // Print all unique job names before normalization
      const allJobsBefore = await Character.distinct('job');
      console.log(`📝 Unique job names in ${dbName} BEFORE normalization:`, allJobsBefore);

      // Regex to match all variants of AB/Animal Breeder jobs (case-insensitive, with/without parentheses)
      const abJobRegex = /^(ab|animal breeder)[\s\-_]*[\(]?\s*(live|meat)[\)]?$/i;

      // Find all characters with a job matching the regex
      const characters = await Character.find({ job: { $regex: abJobRegex } });
      console.log(`📊 Found ${characters.length} characters with old job names in ${dbName}`);
      characters.forEach(char => {
        console.log(`📝 Character found: ${char.name} (${char.job})`);
      });

      for (const character of characters) {
        console.log(`🔄 Updating character: ${character.name} (${character.job} -> Rancher)`);
        character.job = 'Rancher';
        character.jobDateChanged = new Date();
        
        // Update job history if it exists
        if (character.jobHistory) {
          character.jobHistory = character.jobHistory.map(history => {
            if (abJobRegex.test(history.job)) {
              return {
                ...history,
                job: 'Rancher',
                reason: history.reason || 'System Update: Job Consolidation'
              };
            }
            return history;
          });
        }

        await character.save();
        console.log(`✅ Updated character: ${character.name}`);
      }

      // Print all unique job names after normalization
      const allJobsAfter = await Character.distinct('job');
      console.log(`📝 Unique job names in ${dbName} AFTER normalization:`, allJobsAfter);

      // Update inventory records using the raw MongoDB driver
      const inventoriesDb = mongoose.connection.useDb('inventories');
      const inventoryCollection = inventoriesDb.collection('inventories');
      
      // Update inventory records (case-insensitive search)
      const inventoryUpdates = await inventoryCollection.updateMany(
        {
          $or: [
            { job: { $in: allJobsBefore } },
            { job: { $regex: new RegExp(allJobsBefore.join('|'), 'i') } }
          ]
        },
        { $set: { job: 'Rancher' } }
      );

      console.log(`📊 Updated ${inventoryUpdates.modifiedCount} inventory records in ${dbName}`);

      // --- Remove abLive and abMeat fields and add rancher: true ---
      const abFieldsItems = await itemsCollection.find({
        $or: [
          { abLive: { $exists: true } },
          { abMeat: { $exists: true } }
        ]
      }).toArray();
      
      let abFieldsUpdated = 0;
      for (const item of abFieldsItems) {
        await itemsCollection.updateOne(
          { _id: item._id },
          {
            $unset: { abLive: '', abMeat: '' },
            $set: { rancher: true }
          }
        );
        abFieldsUpdated++;
      }
      console.log(`📊 Removed abLive/abMeat and added rancher: true to ${abFieldsUpdated} items in ${dbName}`);

      // Update any monsters that might reference the old job names
      const monstersDb = mongoose.connection.useDb('monsters');
      const monstersCollection = monstersDb.collection('monsters');
      
      const monstersUpdates = await monstersCollection.updateMany(
        {
          $or: [
            { job: { $in: allJobsBefore } },
            { job: { $regex: new RegExp(allJobsBefore.join('|'), 'i') } }
          ]
        },
        { 
          $set: { 
            'job.$': 'Rancher',
            rancher: true
          }
        }
      );

      console.log(`📊 Updated ${monstersUpdates.modifiedCount} monster records in ${dbName}`);

      // Print summary for this database
      console.log(`\n📈 Summary for ${dbName}:`);
      console.log(`- Characters updated: ${characters.length}`);
      console.log(`- Inventory records updated: ${inventoryUpdates.modifiedCount}`);
      console.log(`- Items with abLive/abMeat updated: ${abFieldsUpdated}`);
      console.log(`- Monster records updated: ${monstersUpdates.modifiedCount}`);
    }

    console.log('\n✅ Job normalization completed successfully for all databases');
  } catch (error) {
    handleError(error, 'normalizeJobs.js');
    console.error('❌ Error during job normalization:', error);
  } finally {
    // Close database connections
    await mongoose.connection.close();
  }
}

// Run the normalization script
normalizeJobs().catch(console.error); 