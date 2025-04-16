// seedMonsters.js

// Import required modules and configurations
const path = require('path');
const { handleError } = require('../utils/globalErrorHandler');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Monster = require('../models/MonsterModel');
const { authorizeSheets, fetchSheetData, convertWixImageLinkForSheets } = require('../utils/googleSheetsUtils');
const { monsterMapping } = require('../models/MonsterModel'); // Import monsterMapping

// Function to connect to MongoDB
async function connectToMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI, {});
    console.log('🌐 Connected to MongoDB');
  } catch (error) {
    handleError(error, 'seedMonsters.js');

    console.error('❌ Could not connect to MongoDB...', error);
    throw error;
  }
}

// Function to parse monster data from a row in the Google Sheet
function parseSheetMonsterData(row) {
  const [
    name, image, species, type, tier, hearts, dmg, bloodmoon, locations, eldin, lanayru, faron,
    centralHyrule, gerudo, hebra, pathOfScarletLeaves, leafDewWay, exploreLocations, exploreEldin,
    exploreLanayru, exploreFaron, job, adventurer, guard, graveskeeper, hunter, mercenary, scout,
    animalBreederMeat, animalBreederLive, beekeeper, farmer, fisherman, forager, herbalist, miner
  ] = row;

  const locationArray = (locations || '').split('\n').map(loc => loc.trim()).filter(loc => loc);
  const exploreLocationArray = (exploreLocations || '').split('\n').map(loc => loc.trim()).filter(loc => loc);
  const jobArray = (job || '').split('\n').map(j => j.trim()).filter(j => j);

  // Find the nameMapping based on the name using monsterMapping
  const nameMappingKey = Object.keys(monsterMapping).find(key => monsterMapping[key] === name);
  const nameMappingValue = nameMappingKey ? nameMappingKey : 'unknownMonster';

  return {
    name: name || 'Unknown Monster',
    nameMapping: nameMappingValue,
    image: convertWixImageLinkForSheets(image), // Use the imported function
    species: species || 'Unknown',
    type: type || 'Unknown',
    tier: parseFloat(tier) || 1,
    hearts: parseFloat(hearts) || 0,
    dmg: parseFloat(dmg) || 0,
    bloodmoon: bloodmoon === '✔️',
    locations: locationArray,
    eldin: eldin === '✔️',
    lanayru: lanayru === '✔️',
    faron: faron === '✔️',
    centralHyrule: centralHyrule === '✔️',
    gerudo: gerudo === '✔️',
    hebra: hebra === '✔️',
    pathOfScarletLeaves: pathOfScarletLeaves === '✔️',
    leafDewWay: leafDewWay === '✔️',
    exploreLocations: exploreLocationArray,
    exploreEldin: exploreEldin === '✔️',
    exploreLanayru: exploreLanayru === '✔️',
    exploreFaron: exploreFaron === '✔️',
    job: jobArray,
    adventurer: adventurer === '✔️',
    guard: guard === '✔️',
    graveskeeper: graveskeeper === '✔️',
    hunter: hunter === '✔️',
    mercenary: mercenary === '✔️',
    scout: scout === '✔️',
    animalBreederMeat: animalBreederMeat === '✔️',
    animalBreederLive: animalBreederLive === '✔️',
    beekeeper: beekeeper === '✔️',
    farmer: farmer === '✔️',
    fisherman: fisherman === '✔️',
    forager: forager === '✔️',
    herbalist: herbalist === '✔️',
    miner: miner === '✔️'
  };
}

// Function to seed monsters to MongoDB
async function seedMonsters() {
  await connectToMongoDB();

  try {
    // Authorize and fetch data from Google Sheets
    const auth = await authorizeSheets();
    const spreadsheetId = '10Q1Vo-FGVqaaMAHNZsfLN66ECiEo8E1Z9IhHWArfcO0'; // Google Sheets ID
    const range = 'All Combined!A2:AK'; // Range to fetch (starting from the second row to skip headers)
    const sheetData = await fetchSheetData(auth, spreadsheetId, range);

    // Parse monster data from sheet data
    const monsters = sheetData.map(row => parseSheetMonsterData(row));

    // Save all monsters to MongoDB
    for (const monsterData of monsters) {
      await Monster.findOneAndUpdate(
        { name: monsterData.name },
        monsterData,
        { upsert: true, new: true }
      );
    }

    console.log('✅ Monsters successfully seeded to MongoDB');
  } catch (error) {
    handleError(error, 'seedMonsters.js');

    console.error('❌ Error seeding monsters:', error);
    throw error;
  } finally {
    mongoose.disconnect();
  }
}

// Execute the seeding function
seedMonsters().catch((error) => {
  console.error('❌ Error during monster seeding:', error);
  process.exit(1);
});

/*
Notes:
- Added comments for each section to explain their purpose.
- Organized imports and ensured proper error handling.
- Improved user messages with emojis for better clarity.
- Removed unnecessary console logs.
*/
