// ============================================================================
// Item Reseeding Script
// ============================================================================
// This script reads the CSV file and updates/creates items in the database
// It provides comprehensive logging of all actions, skipped items, and errors

const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const path = require('path');

// Import the Item model
const Item = require('../models/ItemModel');

// ============================================================================
// Configuration
// ============================================================================
const CSV_FILE_PATH = path.join(__dirname, '../ROTW_Tinglebot_Items_2025 - ALL ITEMS.csv');
const LOG_FILE_PATH = path.join(__dirname, '../logs/itemReseed.log');

// ============================================================================
// Logging Setup
// ============================================================================
const log = {
  info: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] INFO: ${message}`;
    console.log(logMessage);
    fs.appendFileSync(LOG_FILE_PATH, logMessage + '\n');
  },
  warn: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] WARN: ${message}`;
    console.warn(logMessage);
    fs.appendFileSync(LOG_FILE_PATH, logMessage + '\n');
  },
  error: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR: ${message}`;
    console.error(logMessage);
    fs.appendFileSync(LOG_FILE_PATH, logMessage + '\n');
  }
};

// ============================================================================
// Statistics Tracking
// ============================================================================
const stats = {
  totalRows: 0,
  processed: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
  skippedReasons: {},
  errorDetails: []
};

// ============================================================================
// Helper Functions
// ============================================================================

// Convert CSV boolean strings to actual booleans
function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === 'yes' || lower === '1';
  }
  return false;
}

// Parse array fields from CSV
function parseArrayField(value) {
  if (!value || value === 'None' || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // Handle comma-separated values
    return value.split(',').map(item => item.trim()).filter(item => item && item !== 'None');
  }
  return [value];
}

// Parse numeric fields
function parseNumber(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

// Parse special weather object
function parseSpecialWeather(row) {
  return {
    muggy: parseBoolean(row['specialWeather.muggy']),
    flowerbloom: parseBoolean(row['specialWeather.flowerbloom']),
    fairycircle: parseBoolean(row['specialWeather.fairycircle']),
    jubilee: parseBoolean(row['specialWeather.jubilee']),
    meteorShower: parseBoolean(row['specialWeather.meteorShower']),
    rockslide: parseBoolean(row['specialWeather.rockslide']),
    avalanche: parseBoolean(row['specialWeather.avalanche'])
  };
}

// Parse pet perk fields
function parsePetPerks(row) {
  return {
    petPerk: parseBoolean(row.petPerk),
    petperkobtain: parseArrayField(row['petperkobtain[0]']),
    petprey: parseBoolean(row.petprey),
    petforage: parseBoolean(row.petforage),
    lgpetprey: parseBoolean(row.lgpetprey),
    petmon: parseBoolean(row.petmon),
    petchu: parseBoolean(row.petchu),
    petfirechu: parseBoolean(row.petfirechu),
    peticechu: parseBoolean(row.peticechu),
    petelectricchu: parseBoolean(row.petelectricchu)
  };
}

// Parse location fields
function parseLocations(row) {
  return {
    centralHyrule: parseBoolean(row.centralHyrule),
    eldin: parseBoolean(row.eldin),
    faron: parseBoolean(row.faron),
    gerudo: parseBoolean(row.gerudo),
    hebra: parseBoolean(row.hebra),
    lanayru: parseBoolean(row.lanayru),
    pathOfScarletLeaves: parseBoolean(row.pathOfScarletLeaves),
    leafDewWay: parseBoolean(row.leafDewWay),
    rudaniaImg: row.rudaniaImg || '',
    inarikoImg: row.inarikoImg || '',
    vhintlImg: row.vhintlImg || ''
  };
}

// Parse job fields
function parseJobs(row) {
  return {
    adventurer: parseBoolean(row.adventurer),
    artist: parseBoolean(row.artist),
    beekeeper: parseBoolean(row.beekeeper),
    blacksmith: parseBoolean(row.blacksmith),
    cook: parseBoolean(row.cook),
    craftsman: parseBoolean(row.craftsman),
    farmer: parseBoolean(row.farmer),
    fisherman: parseBoolean(row.fisherman),
    forager: parseBoolean(row.forager),
    gravekeeper: parseBoolean(row.gravekeeper),
    guard: parseBoolean(row.guard),
    maskMaker: parseBoolean(row.maskMaker),
    rancher: parseBoolean(row.rancher),
    herbalist: parseBoolean(row.herbalist),
    hunter: parseBoolean(row.hunter),
    hunterLooting: parseBoolean(row.hunterLooting),
    mercenary: parseBoolean(row.mercenary),
    miner: parseBoolean(row.miner),
    researcher: parseBoolean(row.researcher),
    scout: parseBoolean(row.scout),
    weaver: parseBoolean(row.weaver),
    witch: parseBoolean(row.witch)
  };
}

// Parse monster fields
function parseMonsters(row) {
  return {
    blackBokoblin: parseBoolean(row.blackBokoblin),
    blueBokoblin: parseBoolean(row.blueBokoblin),
    cursedBokoblin: parseBoolean(row.cursedBokoblin),
    goldenBokoblin: parseBoolean(row.goldenBokoblin),
    silverBokoblin: parseBoolean(row.silverBokoblin),
    bokoblin: parseBoolean(row.bokoblin),
    electricChuchuLarge: parseBoolean(row.electricChuchuLarge),
    fireChuchuLarge: parseBoolean(row.fireChuchuLarge),
    iceChuchuLarge: parseBoolean(row.iceChuchuLarge),
    chuchuLarge: parseBoolean(row.chuchuLarge),
    electricChuchuMedium: parseBoolean(row.electricChuchuMedium),
    fireChuchuMedium: parseBoolean(row.fireChuchuMedium),
    iceChuchuMedium: parseBoolean(row.iceChuchuMedium),
    chuchuMedium: parseBoolean(row.chuchuMedium),
    electricChuchuSmall: parseBoolean(row.electricChuchuSmall),
    fireChuchuSmall: parseBoolean(row.fireChuchuSmall),
    iceChuchuSmall: parseBoolean(row.iceChuchuSmall),
    chuchuSmall: parseBoolean(row.chuchuSmall),
    blackHinox: parseBoolean(row.blackHinox),
    blueHinox: parseBoolean(row.blueHinox),
    hinox: parseBoolean(row.hinox),
    electricKeese: parseBoolean(row.electricKeese),
    fireKeese: parseBoolean(row.fireKeese),
    iceKeese: parseBoolean(row.iceKeese),
    keese: parseBoolean(row.keese),
    blackLizalfos: parseBoolean(row.blackLizalfos),
    blueLizalfos: parseBoolean(row.blueLizalfos),
    cursedLizalfos: parseBoolean(row.cursedLizalfos),
    electricLizalfos: parseBoolean(row.electricLizalfos),
    fireBreathLizalfos: parseBoolean(row.fireBreathLizalfos),
    goldenLizalfos: parseBoolean(row.goldenLizalfos),
    iceBreathLizalfos: parseBoolean(row.iceBreathLizalfos),
    silverLizalfos: parseBoolean(row.silverLizalfos),
    lizalfos: parseBoolean(row.lizalfos),
    blueManedLynel: parseBoolean(row.blueManedLynel),
    goldenLynel: parseBoolean(row.goldenLynel),
    silverLynel: parseBoolean(row.silverLynel),
    whiteManedLynel: parseBoolean(row.whiteManedLynel),
    lynel: parseBoolean(row.lynel),
    blackMoblin: parseBoolean(row.blackMoblin),
    blueMoblin: parseBoolean(row.blueMoblin),
    cursedMoblin: parseBoolean(row.cursedMoblin),
    goldenMoblin: parseBoolean(row.goldenMoblin),
    silverMoblin: parseBoolean(row.silverMoblin),
    moblin: parseBoolean(row.moblin),
    molduga: parseBoolean(row.molduga),
    molduking: parseBoolean(row.molduking),
    forestOctorok: parseBoolean(row.forestOctorok),
    rockOctorok: parseBoolean(row.rockOctorok),
    skyOctorok: parseBoolean(row.skyOctorok),
    snowOctorok: parseBoolean(row.snowOctorok),
    treasureOctorok: parseBoolean(row.treasureOctorok),
    waterOctorok: parseBoolean(row.waterOctorok),
    frostPebblit: parseBoolean(row.frostPebblit),
    igneoPebblit: parseBoolean(row.igneoPebblit),
    stonePebblit: parseBoolean(row.stonePebblit),
    stalizalfos: parseBoolean(row.stalizalfos),
    stalkoblin: parseBoolean(row.stalkoblin),
    stalmoblin: parseBoolean(row.stalmoblin),
    stalnox: parseBoolean(row.stalnox),
    frostTalus: parseBoolean(row.frostTalus),
    igneoTalus: parseBoolean(row.igneoTalus),
    luminousTalus: parseBoolean(row.luminousTalus),
    rareTalus: parseBoolean(row.rareTalus),
    stoneTalus: parseBoolean(row.stoneTalus),
    blizzardWizzrobe: parseBoolean(row.blizzardWizzrobe),
    electricWizzrobe: parseBoolean(row.electricWizzrobe),
    fireWizzrobe: parseBoolean(row.fireWizzrobe),
    iceWizzrobe: parseBoolean(row.iceWizzrobe),
    meteoWizzrobe: parseBoolean(row.meteoWizzrobe),
    thunderWizzrobe: parseBoolean(row.thunderWizzrobe),
    likeLike: parseBoolean(row.likeLike),
    evermean: parseBoolean(row.evermean),
    gibdo: parseBoolean(row.gibdo),
    horriblin: parseBoolean(row.horriblin),
    gloomHands: parseBoolean(row.gloomHands),
    bossBokoblin: parseBoolean(row.bossBokoblin),
    mothGibdo: parseBoolean(row.mothGibdo),
    littleFrox: parseBoolean(row.littleFrox),
    normalBokoblin: parseBoolean(row.normalBokoblin),
    normalGibdo: parseBoolean(row.normalGibdo),
    normalHinox: parseBoolean(row.normalHinox),
    normalHorriblin: parseBoolean(row.normalHorriblin),
    normalKeese: parseBoolean(row.normalKeese),
    normalLizalfos: parseBoolean(row.normalLizalfos),
    normalLynel: parseBoolean(row.normalLynel),
    normalMoblin: parseBoolean(row.normalMoblin)
  };
}

// Convert CSV row to item document
function csvRowToItem(row) {
  try {
    const item = {
      _id: row._id || undefined,
      itemName: row.itemName,
      image: row.image || 'No Image',
      imageType: row.imageType || 'No Image Type',
      emoji: row.emoji || '',
      itemRarity: parseNumber(row.itemRarity),
      category: parseArrayField(row['category[0]']),
      categoryGear: row.categoryGear || 'None',
      type: parseArrayField(row['type[0]']),
      subtype: parseArrayField(row['subtype[0]']),
      recipeTag: parseArrayField(row.recipeTag),
      buyPrice: parseNumber(row.buyPrice),
      sellPrice: parseNumber(row.sellPrice),
      modifierHearts: parseNumber(row.modifierHearts),
      staminaRecovered: parseNumber(row.staminaRecovered),
      stackable: parseBoolean(row.stackable),
      maxStackSize: parseNumber(row.maxStackSize),
      craftingMaterial: [], // TODO: Parse crafting materials if needed
      staminaToCraft: row.staminaToCraft || null,
      crafting: parseBoolean(row.crafting),
      craftingJobs: parseArrayField(row.craftingJobs),
      craftingTags: parseArrayField(row.craftingTags),
      gathering: parseBoolean(row.gathering),
      looting: parseBoolean(row.looting),
      vending: parseBoolean(row.vending),
      traveling: parseBoolean(row.traveling),
      exploring: parseBoolean(row.exploring),
      obtain: parseArrayField(row.obtain),
      obtainTags: parseArrayField(row.obtainTags),
      gatheringJobs: parseArrayField(row.gatheringJobs),
      gatheringTags: parseArrayField(row.gatheringTags),
      lootingJobs: parseArrayField(row.lootingJobs),
      lootingTags: parseArrayField(row.lootingTags),
      specialWeather: parseSpecialWeather(row),
      ...parsePetPerks(row),
      ...parseLocations(row),
      ...parseJobs(row),
      entertainerItems: parseBoolean(row.entertainerItems),
      divineItems: parseBoolean(row.divineItems),
      ...parseMonsters(row)
    };

    // Add category[1] if it exists
    if (row['category[1]'] && row['category[1]'] !== '') {
      item.category.push(row['category[1]']);
    }

    // Add type[1] and type[2] if they exist
    if (row['type[1]'] && row['type[1]'] !== '') {
      item.type.push(row['type[1]']);
    }
    if (row['type[2]'] && row['type[2]'] !== '') {
      item.type.push(row['type[2]']);
    }

    // Add subtype[1] if it exists
    if (row['subtype[1]'] && row['subtype[1]'] !== '') {
      item.subtype.push(row['subtype[1]']);
    }

    return item;
  } catch (error) {
    log.error(`Error converting CSV row to item: ${error.message}`);
    throw error;
  }
}

// Process a single item
async function processItem(itemData) {
  try {
    stats.processed++;
    
    // Check if item already exists
    const existingItem = await Item.findById(itemData._id);
    
    if (existingItem) {
      // Update existing item
      const updatedItem = await Item.findByIdAndUpdate(
        itemData._id,
        itemData,
        { new: true, runValidators: true }
      );
      stats.updated++;
      log.info(`Updated item: ${itemData.itemName} (ID: ${itemData._id})`);
      return updatedItem;
    } else {
      // Create new item
      const newItem = new Item(itemData);
      const savedItem = await newItem.save();
      stats.created++;
      log.info(`Created new item: ${itemData.itemName} (ID: ${savedItem._id})`);
      return savedItem;
    }
  } catch (error) {
    stats.errors++;
    const errorDetail = {
      itemName: itemData.itemName,
      error: error.message,
      data: itemData
    };
    stats.errorDetails.push(errorDetail);
    log.error(`Error processing item ${itemData.itemName}: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// Main Processing Function
// ============================================================================
async function processCSV() {
  log.info('Starting item reseeding process...');
  log.info(`CSV file: ${CSV_FILE_PATH}`);
  
  // Ensure logs directory exists
  const logsDir = path.dirname(LOG_FILE_PATH);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // Clear previous log
  fs.writeFileSync(LOG_FILE_PATH, '');
  
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv())
      .on('data', (row) => {
        stats.totalRows++;
        results.push(row);
      })
      .on('end', async () => {
        log.info(`CSV parsing complete. Found ${stats.totalRows} rows.`);
        
        try {
          // Process items in batches to avoid memory issues
          const batchSize = 50;
          for (let i = 0; i < results.length; i += batchSize) {
            const batch = results.slice(i, i + batchSize);
            log.info(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(results.length / batchSize)}`);
            
            for (const row of batch) {
              try {
                // Skip rows without item name
                if (!row.itemName || row.itemName.trim() === '') {
                  stats.skipped++;
                  const reason = 'No item name';
                  stats.skippedReasons[reason] = (stats.skippedReasons[reason] || 0) + 1;
                  log.warn(`Skipped row ${stats.totalRows}: ${reason}`);
                  continue;
                }
                
                // Convert CSV row to item data
                const itemData = csvRowToItem(row);
                
                // Process the item
                await processItem(itemData);
                
              } catch (error) {
                stats.skipped++;
                const reason = error.message;
                stats.skippedReasons[reason] = (stats.skippedReasons[reason] || 0) + 1;
                log.warn(`Skipped row ${stats.totalRows}: ${reason}`);
              }
            }
          }
          
          // Print final statistics
          printFinalStats();
          
          resolve();
        } catch (error) {
          log.error(`Error during processing: ${error.message}`);
          reject(error);
        }
      })
      .on('error', (error) => {
        log.error(`Error reading CSV file: ${error.message}`);
        reject(error);
      });
  });
}

// ============================================================================
// Statistics and Reporting
// ============================================================================
function printFinalStats() {
  log.info('='.repeat(60));
  log.info('ITEM RESEEDING COMPLETE');
  log.info('='.repeat(60));
  log.info(`Total CSV rows: ${stats.totalRows}`);
  log.info(`Processed: ${stats.processed}`);
  log.info(`Created: ${stats.created}`);
  log.info(`Updated: ${stats.updated}`);
  log.info(`Skipped: ${stats.skipped}`);
  log.info(`Errors: ${stats.errors}`);
  
  if (Object.keys(stats.skippedReasons).length > 0) {
    log.info('\nSkipped Reasons:');
    Object.entries(stats.skippedReasons).forEach(([reason, count]) => {
      log.info(`  ${reason}: ${count}`);
    });
  }
  
  if (stats.errorDetails.length > 0) {
    log.info('\nError Details:');
    stats.errorDetails.forEach((detail, index) => {
      log.info(`  ${index + 1}. ${detail.itemName}: ${detail.error}`);
    });
  }
  
  log.info('\nCheck the log file for detailed information:');
  log.info(LOG_FILE_PATH);
}

// ============================================================================
// Main Execution
// ============================================================================
async function main() {
  try {
    // Connect to MongoDB
    log.info('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tinglebot');
    log.info('Connected to MongoDB');
    
    // Process the CSV
    await processCSV();
    
    log.info('Item reseeding completed successfully!');
  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    log.info('Database connection closed');
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

module.exports = { processCSV, csvRowToItem };
