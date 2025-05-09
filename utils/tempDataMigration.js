const fs = require('fs');
const path = require('path');
const { connectToTinglebot } = require('../database/db');
const TempData = require('../models/TempDataModel');
const { handleError } = require('./globalErrorHandler');

// Connect to tingletemp database
async function connectToTempDb() {
  try {
    const connection = await connectToTinglebot();
    connection.useDb('tingletemp');
    return connection;
  } catch (error) {
    handleError(error, 'tempDataMigration.js');
    throw error;
  }
}

// Migrate healing requests
async function migrateHealingRequests() {
  try {
    const filePath = path.join(__dirname, '../data/healingRequests.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, request] of Object.entries(data)) {
      await TempData.create({
        key,
        type: 'healing',
        data: request
      });
    }
    
    console.log('✅ Successfully migrated healing requests');
  } catch (error) {
    handleError(error, 'tempDataMigration.js');
    console.error('❌ Error migrating healing requests:', error);
  }
}

// Migrate vending requests
async function migrateVendingRequests() {
  try {
    const filePath = path.join(__dirname, '../data/vendingRequests.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, request] of Object.entries(data)) {
      await TempData.create({
        key,
        type: 'vending',
        data: request
      });
    }
    
    console.log('✅ Successfully migrated vending requests');
  } catch (error) {
    handleError(error, 'tempDataMigration.js');
    console.error('❌ Error migrating vending requests:', error);
  }
}

// Migrate boosting requests
async function migrateBoostingRequests() {
  try {
    const filePath = path.join(__dirname, '../data/boostingRequests.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, request] of Object.entries(data)) {
      await TempData.create({
        key,
        type: 'boosting',
        data: request
      });
    }
    
    console.log('✅ Successfully migrated boosting requests');
  } catch (error) {
    handleError(error, 'tempDataMigration.js');
    console.error('❌ Error migrating boosting requests:', error);
  }
}

// Migrate battle progress
async function migrateBattleProgress() {
  try {
    const filePath = path.join(__dirname, '../data/battleProgress.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, battle] of Object.entries(data)) {
      await TempData.create({
        key,
        type: 'battle',
        data: battle
      });
    }
    
    console.log('✅ Successfully migrated battle progress');
  } catch (error) {
    handleError(error, 'tempDataMigration.js');
    console.error('❌ Error migrating battle progress:', error);
  }
}

// Migrate encounters
async function migrateEncounters() {
  try {
    const filePath = path.join(__dirname, '../data/encounter.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, encounter] of Object.entries(data)) {
      await TempData.create({
        key,
        type: 'encounter',
        data: encounter
      });
    }
    
    console.log('✅ Successfully migrated encounters');
  } catch (error) {
    handleError(error, 'tempDataMigration.js');
    console.error('❌ Error migrating encounters:', error);
  }
}

// Migrate blight requests
async function migrateBlightRequests() {
  try {
    const filePath = path.join(__dirname, '../data/blight.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, request] of Object.entries(data)) {
      await TempData.create({
        key,
        type: 'blight',
        data: request
      });
    }
    
    console.log('✅ Successfully migrated blight requests');
  } catch (error) {
    handleError(error, 'tempDataMigration.js');
    console.error('❌ Error migrating blight requests:', error);
  }
}

// Migrate monthly encounters
async function migrateMonthlyEncounters() {
  try {
    const filePath = path.join(__dirname, '../data/monthly_encounters.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, encounter] of Object.entries(data)) {
      await TempData.create({
        key,
        type: 'monthly',
        data: encounter
      });
    }
    
    console.log('✅ Successfully migrated monthly encounters');
  } catch (error) {
    handleError(error, 'tempDataMigration.js');
    console.error('❌ Error migrating monthly encounters:', error);
  }
}

// Run all migrations
async function runMigrations() {
  try {
    await connectToTempDb();
    console.log('🔄 Starting temporary data migration...');
    
    await migrateHealingRequests();
    await migrateVendingRequests();
    await migrateBoostingRequests();
    await migrateBattleProgress();
    await migrateEncounters();
    await migrateBlightRequests();
    await migrateMonthlyEncounters();
    
    console.log('✅ All migrations completed successfully');
  } catch (error) {
    handleError(error, 'tempDataMigration.js');
    console.error('❌ Migration failed:', error);
  }
}

// Cleanup old entries
async function cleanupOldEntries(maxAgeInMs = 86400000) {
  try {
    await connectToTempDb();
    const result = await TempData.cleanup(maxAgeInMs);
    console.log(`✅ Cleaned up ${result.deletedCount} old entries`);
    return result;
  } catch (error) {
    handleError(error, 'tempDataMigration.js');
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

module.exports = {
  runMigrations,
  cleanupOldEntries,
  migrateHealingRequests,
  migrateVendingRequests,
  migrateBoostingRequests,
  migrateBattleProgress,
  migrateEncounters,
  migrateBlightRequests,
  migrateMonthlyEncounters
}; 