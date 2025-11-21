// ============================================================================
// ------------------- Extract Database Keywords Script -------------------
// Purpose: Extract all unique values from database to ensure accuracy in
//          database editor autocomplete and "contributes to" indicators
// ============================================================================

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load environment configuration
require('dotenv').config();

// Import all models
const Character = require('./models/CharacterModel');
const ModCharacter = require('./models/ModCharacterModel');
const Item = require('./models/ItemModel');
const Monster = require('./models/MonsterModel');
const HelpWantedQuest = require('./models/HelpWantedQuestModel');
const GeneralItem = require('./models/GeneralItemModel');

// ------------------- Connect to Database -------------------
async function connectDatabase() {
  try {
    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
      throw new Error('MONGODB_URI not found in environment variables');
    }
    
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
}

// ------------------- Extract Unique Values -------------------
async function extractUniqueValues(Model, fieldName) {
  try {
    const records = await Model.find({}).lean();
    const values = new Set();
    
    records.forEach(record => {
      const value = record[fieldName];
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          value.forEach(v => {
            if (v && typeof v === 'string') values.add(v);
          });
        } else if (typeof value === 'string') {
          values.add(value);
        }
      }
    });
    
    return Array.from(values).sort();
  } catch (error) {
    console.error(`❌ Error extracting ${fieldName}:`, error.message);
    return [];
  }
}

// ------------------- Extract Job Keywords -------------------
async function extractJobKeywords() {
  console.log('\n📋 Extracting job keywords...');
  
  // Get all job-related boolean fields from Item schema
  const itemSchema = Item.schema;
  const jobFields = [];
  
  itemSchema.eachPath((pathname) => {
    const schemaType = itemSchema.path(pathname);
    // Check if it's a boolean field that represents a job
    if (schemaType.instance === 'Boolean') {
      const fieldLower = pathname.toLowerCase();
      const possibleJobs = [
        'adventurer', 'artist', 'beekeeper', 'blacksmith', 'cook', 'craftsman',
        'farmer', 'fisherman', 'forager', 'gravekeeper', 'graveskeeper', 'guard',
        'maskmaker', 'rancher', 'herbalist', 'hunter', 'mercenary', 'miner',
        'researcher', 'scout', 'weaver', 'witch'
      ];
      
      if (possibleJobs.some(job => fieldLower === job || fieldLower.includes(job))) {
        jobFields.push(pathname.toLowerCase());
      }
    }
  });
  
  // Also get unique job values from Character and ModCharacter
  const characterJobs = await extractUniqueValues(Character, 'job');
  const modCharacterJobs = await extractUniqueValues(ModCharacter, 'job');
  
  const allJobs = new Set([...jobFields, ...characterJobs, ...modCharacterJobs]);
  
  console.log(`✅ Found ${allJobs.size} unique job keywords`);
  return Array.from(allJobs).sort();
}

// ------------------- Extract Monster Keywords -------------------
async function extractMonsterKeywords() {
  console.log('\n🐉 Extracting monster keywords...');
  
  // Get all monster-related boolean fields from Item schema
  const itemSchema = Item.schema;
  const monsterFields = [];
  
  itemSchema.eachPath((pathname) => {
    const schemaType = itemSchema.path(pathname);
    if (schemaType.instance === 'Boolean') {
      const fieldLower = pathname.toLowerCase();
      const monsterKeywords = [
        'bokoblin', 'chuchu', 'hinox', 'keese', 'lizalfos', 'lynel', 'moblin',
        'molduga', 'octorok', 'pebblit', 'talus', 'stal', 'wizzrobe', 'likelike',
        'evermean', 'gibdo', 'horriblin', 'gloomhands', 'frox'
      ];
      
      if (monsterKeywords.some(monster => fieldLower.includes(monster))) {
        monsterFields.push(pathname.toLowerCase());
      }
    }
  });
  
  // Also get monster names and species from Monster collection
  const monsterNames = await extractUniqueValues(Monster, 'name');
  const monsterSpecies = await extractUniqueValues(Monster, 'species');
  
  console.log(`✅ Found ${monsterFields.length} monster field keywords`);
  console.log(`✅ Found ${monsterNames.length} unique monster names`);
  console.log(`✅ Found ${monsterSpecies.length} unique monster species`);
  
  return {
    fields: monsterFields.sort(),
    names: monsterNames,
    species: monsterSpecies
  };
}

// ------------------- Extract Location Keywords -------------------
async function extractLocationKeywords() {
  console.log('\n🗺️ Extracting location keywords...');
  
  // Get location fields from schema
  const locations = [
    'eldin', 'lanayru', 'faron', 'centralhyrule', 'gerudo', 'hebra',
    'pathofscarletleaves', 'leafdewway'
  ];
  
  console.log(`✅ Found ${locations.length} location keywords`);
  return locations;
}

// ------------------- Extract Other Keywords -------------------
async function extractOtherKeywords() {
  console.log('\n📦 Extracting other keywords...');
  
  const pronouns = await extractUniqueValues(Character, 'pronouns');
  const races = await extractUniqueValues(Character, 'race');
  const villages = ['Rudania', 'Inariko', 'Vhintl']; // Standard villages
  const npcNames = await extractUniqueValues(HelpWantedQuest, 'npcName');
  const categories = await extractUniqueValues(GeneralItem, 'category');
  
  // Extract from Item model
  const itemCategories = await extractUniqueValues(Item, 'category');
  const itemTypes = await extractUniqueValues(Item, 'type');
  const itemSubtypes = await extractUniqueValues(Item, 'subtype');
  
  // ModCharacter specific
  const modTitles = await extractUniqueValues(ModCharacter, 'modTitle');
  const modTypes = await extractUniqueValues(ModCharacter, 'modType');
  const modOwners = await extractUniqueValues(ModCharacter, 'modOwner');
  
  console.log(`✅ Found ${pronouns.length} pronouns`);
  console.log(`✅ Found ${races.length} races`);
  console.log(`✅ Found ${npcNames.length} NPC names`);
  console.log(`✅ Found ${categories.length} general categories`);
  console.log(`✅ Found ${itemCategories.length} item categories`);
  console.log(`✅ Found ${itemTypes.length} item types`);
  console.log(`✅ Found ${modTitles.length} mod titles`);
  
  return {
    pronouns,
    races,
    villages,
    npcNames,
    generalCategories: categories,
    itemCategories,
    itemTypes,
    itemSubtypes,
    modTitles,
    modTypes,
    modOwners
  };
}

// ------------------- Main Execution -------------------
async function main() {
  console.log('🔍 Starting database keyword extraction...\n');
  
  await connectDatabase();
  
  const jobs = await extractJobKeywords();
  const monsters = await extractMonsterKeywords();
  const locations = await extractLocationKeywords();
  const other = await extractOtherKeywords();
  
  const keywords = {
    extractedAt: new Date().toISOString(),
    jobs,
    monsters,
    locations,
    pronouns: other.pronouns,
    races: other.races,
    villages: other.villages,
    npcNames: other.npcNames,
    generalCategories: other.generalCategories,
    itemCategories: other.itemCategories,
    itemTypes: other.itemTypes,
    itemSubtypes: other.itemSubtypes,
    modTitles: other.modTitles,
    modTypes: other.modTypes,
    modOwners: other.modOwners
  };
  
  // Write to file
  const outputPath = path.join(__dirname, 'public', 'js', 'databaseKeywords.json');
  fs.writeFileSync(outputPath, JSON.stringify(keywords, null, 2));
  
  console.log('\n✅ Keywords extracted successfully!');
  console.log(`📝 Saved to: ${outputPath}`);
  console.log('\n📊 Summary:');
  console.log(`   - Jobs: ${jobs.length}`);
  console.log(`   - Monster Fields: ${monsters.fields.length}`);
  console.log(`   - Monster Names: ${monsters.names.length}`);
  console.log(`   - Locations: ${locations.length}`);
  console.log(`   - Pronouns: ${other.pronouns.length}`);
  console.log(`   - Races: ${other.races.length}`);
  console.log(`   - NPC Names: ${other.npcNames.length}`);
  console.log(`   - Item Categories: ${other.itemCategories.length}`);
  console.log(`   - Item Types: ${other.itemTypes.length}`);
  console.log(`   - Mod Titles: ${other.modTitles.length}`);
  
  await mongoose.connection.close();
  console.log('\n🔒 Database connection closed');
  process.exit(0);
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

