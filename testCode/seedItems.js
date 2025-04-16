// ------------------- Import required modules and configurations -------------------
const path = require('path');
const { handleError } = require('../utils/globalErrorHandler');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Load environment variables
const mongoose = require('mongoose');
const Item = require('../models/ItemModel'); // Item model for MongoDB
const { authorizeSheets, fetchSheetData, convertWixImageLinkForSheets } = require('../utils/googleSheetsUtils'); // Utility functions for Google Sheets
const { monsterMapping } = require('../models/MonsterModel'); // Monster data mappings

// ------------------- Function to connect to MongoDB -------------------
async function connectToMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI, {}); // Connect to MongoDB using environment URI
    console.log('🌐 Connected to MongoDB');
  } catch (error) {
    handleError(error, 'seedItems.js');

    console.error('❌ Could not connect to MongoDB...', error);
    throw error; // Throw error if connection fails
  }
}

// ------------------- Function to capitalize the first letter of a string -------------------
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1); // Capitalizes the first letter of a string
}

// ------------------- Function to parse item data from a row in the Google Sheet -------------------
function parseSheetItemData(row) {
  const [
    itemName, image, imageType, itemRarity, category, categoryGear, categoryRef, type, subtype,
    recipeTag, starter, craftingMaterial, buyPrice, sellPrice, staminaToCraft, modifierHearts,
    staminaRecovered, flawed, obtain, obtainTags, crafting, gathering, looting, vending, traveling,
    specialWeather, petPerk, exploring, craftingJobs, craftingTags, artist, blacksmith, cook,
    craftsman, maskMaker, researcher, weaver, witch, locations, locationsTags, eldin, rudaniaImg,
    lanayru, inarikoImg, faron, vhintlImg, centralHyrule, gerudo, hebra, pathOfScarletLeaves,
    leafDewWay, gatheringJobs, gatheringTags, abMeat, abLive, beekeeper, farmer, fisherman,
    forager, herbalist, hunter, miner, monsterList, lootingJobs, lootingTags, adventurer, guard,
    gravekeeper, hunterLooting, mercenary, scout, allJobs, allJobsTags, gear, emoji,
    blackBokoblin, blueBokoblin, cursedBokoblin, goldenBokoblin, silverBokoblin, bokoblin,
    electricChuchuLarge, fireChuchuLarge, iceChuchuLarge, chuchuLarge,
    electricChuchuMedium, fireChuchuMedium, iceChuchuMedium, chuchuMedium,
    electricChuchuSmall, fireChuchuSmall, iceChuchuSmall, chuchuSmall,
    blackHinox, blueHinox, hinox,
    electricKeese, fireKeese, iceKeese, keese,
    blackLizalfos, blueLizalfos, cursedLizalfos, electricLizalfos, fireBreathLizalfos, goldenLizalfos,
    iceBreathLizalfos, silverLizalfos, lizalfos,
    blueManedLynel, goldenLynel, silverLynel, whiteManedLynel, lynel,
    blackMoblin, blueMoblin, cursedMoblin, goldenMoblin, silverMoblin, moblin,
    molduga, molduking,
    forestOctorok, rockOctorok, skyOctorok, snowOctorok, treasureOctorok, waterOctorok,
    frostPebblit, igneoPebblit, stonePebblit, stalizalfos, stalkoblin, stalmoblin, stalnox,
    frostTalus, igneoTalus, luminousTalus, rareTalus, stoneTalus, blizzardWizzrobe, electricWizzrobe,
    fireWizzrobe, iceWizzrobe, meteoWizzrobe, thunderWizzrobe, likeLike, evermean, gibdo, horriblin,
    gloomHands, bossBokoblin, mothGibdo, littleFrox, petPerkObtain, petprey, petforage, lgpetprey, 
    petmon, petchu, petfirechu, peticechu, petelectricchu // All fields in exact order
  ] = row;

 // Split relevant fields into arrays for easier manipulation
 const categories = (category || '').split(',').map(c => c.trim()).filter(c => c);
 const types = (type || '').split(',').map(t => t.trim()).filter(t => t);
 const subtypes = (subtype || '').split(',').map(st => st.trim()).filter(st => st);
 const recipeTags = (recipeTag || '').split(',').map(tag => tag.trim()).filter(tag => tag);
 const obtainMethods = (obtain || '').split('\n').map(obtain => obtain.trim()).filter(obtain => obtain);
 const obtainTagsArray = (obtainTags || '').split(',').map(t => t.trim()).filter(t => t);
 const craftingJobsArray = (craftingJobs || '').split(',').map(job => job.trim()).filter(job => job);
 const craftingTagsArray = (craftingTags || '').split(',').map(tag => tag.trim()).filter(tag => tag);
 const locationsArray = (locations || '').split(',').map(loc => loc.trim()).filter(loc => loc);
 const locationsTagsArray = (locationsTags || '').split(',').map(loc => loc.trim()).filter(loc => loc);
 const gatheringJobsArray = (gatheringJobs || '').split(',').map(job => job.trim()).filter(job => job);
 const gatheringTagsArray = (gatheringTags || '').split(',').map(tag => tag.trim()).filter(tag => tag);
 const allJobsArray = (allJobs || '').split(',').map(job => job.trim()).filter(job => job);
 const allJobsTagsArray = (allJobsTags || '').split(',').map(tag => tag.trim()).filter(tag => tag);
 const monsterListArray = (monsterList || '').split(',').map(monster => monster.trim()).filter(monster => monster);
 const lootingJobsArray = (lootingJobs || '').split(',').map(job => job.trim()).filter(job => job);
 const lootingTagsArray = (lootingTags || '').split(',').map(tag => tag.trim()).filter(tag => tag);
 const petPerkArray = (petPerkObtain || '').split(',').map(tag => tag.trim()).filter(tag => tag);

 // Parse crafting materials
 const craftingMaterials = (craftingMaterial || '').split('\n').map(line => {
   const [materialName, quantity] = line.split(' ⨯ ');
   return { itemName: materialName?.trim() || '', quantity: parseInt(quantity?.trim()) || 0 };
 }).filter(mat => mat.itemName !== '' && mat.quantity > 0);

  // Map monster drops from the monsterMapping object
  const monsterDrops = [];
  for (const [key, value] of Object.entries(monsterMapping)) {
    if (eval(key) === '✔️') {
      monsterDrops.push(value);
    }
  }

  // Return the structured data
  return {
    itemName: itemName || 'Unknown Item',
    image: convertWixImageLinkForSheets(image || 'No Image'),
    imageType: convertWixImageLinkForSheets(imageType || 'Unknown'),
    itemRarity: parseInt(itemRarity) || 0,
    category: categories,
    categoryGear: categoryGear || 'None',
    categoryRef: categoryRef || 'None', // Added Category Ref
    type: types,
    subtype: subtypes,
    recipeTag: recipeTags,
    starter: starter === '✔️', // Added Starter
    craftingMaterial: craftingMaterials,
    buyPrice: parseFloat(buyPrice) || 0,
    sellPrice: parseFloat(sellPrice) || 0,
    staminaToCraft: !isNaN(parseFloat(staminaToCraft)) ? parseFloat(staminaToCraft) : null,
    modifierHearts: parseInt(modifierHearts) || 0,
    staminaRecovered: parseInt(staminaRecovered) || 0,
    flawed: flawed === '✔️', // Added Flawed
    obtain: obtainMethods,
    obtainTags: obtainTagsArray,
    crafting: crafting === '✔️',
    gathering: gathering === '✔️',
    looting: looting === '✔️',
    vending: vending === '✔️',
    traveling: traveling === '✔️',
    specialWeather: specialWeather === '✔️',
    petPerk: petPerk === '✔️',
    exploring: exploring === '✔️',
    craftingJobs: craftingJobsArray,
    craftingTags: craftingTagsArray,
    artist: artist === '✔️',
    blacksmith: blacksmith === '✔️',
    cook: cook === '✔️',
    craftsman: craftsman === '✔️',
    maskMaker: maskMaker === '✔️',
    researcher: researcher === '✔️',
    weaver: weaver === '✔️',
    witch: witch === '✔️',
    locations: locationsArray,
    locationsTags: locationsTagsArray,
    eldin: eldin === '✔️',
    rudaniaImg: convertWixImageLinkForSheets(rudaniaImg || 'No Image'),
    lanayru: lanayru === '✔️',
    inarikoImg: convertWixImageLinkForSheets(inarikoImg || 'No Image'),
    faron: faron === '✔️',
    vhintlImg: convertWixImageLinkForSheets(vhintlImg || 'No Image'),
    centralHyrule: centralHyrule === '✔️',
    gerudo: gerudo === '✔️',
    hebra: hebra === '✔️',
    pathOfScarletLeaves: pathOfScarletLeaves === '✔️',
    leafDewWay: leafDewWay === '✔️',
    gatheringJobs: gatheringJobsArray,
    gatheringTags: gatheringTagsArray,
    abMeat: abMeat === '✔️',
    abLive: abLive === '✔️',
    beekeeper: beekeeper === '✔️',
    farmer: farmer === '✔️',
    fisherman: fisherman === '✔️',
    forager: forager === '✔️',
    herbalist: herbalist === '✔️',
    hunter: hunter === '✔️',
    miner: miner === '✔️',
    monsterList: monsterListArray,
    lootingJobs: lootingJobsArray,
    lootingTags: lootingTagsArray,
    adventurer: adventurer === '✔️',
    guard: guard === '✔️',
    gravekeeper: gravekeeper === '✔️',
    hunterLooting: hunterLooting === '✔️',
    mercenary: mercenary === '✔️',
    scout: scout === '✔️',
    allJobs: allJobsArray,
    allJobsTags: allJobsTagsArray,
    gear: gear === '✔️',
    emoji: emoji || '',

    // Monster flags
    blackBokoblin: blackBokoblin === '✔️',
    blueBokoblin: blueBokoblin === '✔️',
    cursedBokoblin: cursedBokoblin === '✔️',
    goldenBokoblin: goldenBokoblin === '✔️',
    silverBokoblin: silverBokoblin === '✔️',
    bokoblin: bokoblin === '✔️',
    electricChuchuLarge: electricChuchuLarge === '✔️',
    fireChuchuLarge: fireChuchuLarge === '✔️',
    iceChuchuLarge: iceChuchuLarge === '✔️',
    chuchuLarge: chuchuLarge === '✔️',
    electricChuchuMedium: electricChuchuMedium === '✔️',
    fireChuchuMedium: fireChuchuMedium === '✔️',
    iceChuchuMedium: iceChuchuMedium === '✔️',
    chuchuMedium: chuchuMedium === '✔️',
    electricChuchuSmall: electricChuchuSmall === '✔️',
    fireChuchuSmall: fireChuchuSmall === '✔️',
    iceChuchuSmall: iceChuchuSmall === '✔️',
    chuchuSmall: chuchuSmall === '✔️',
    blackHinox: blackHinox === '✔️',
    blueHinox: blueHinox === '✔️',
    hinox: hinox === '✔️',
    electricKeese: electricKeese === '✔️',
    fireKeese: fireKeese === '✔️',
    iceKeese: iceKeese === '✔️',
    keese: keese === '✔️',
    blackLizalfos: blackLizalfos === '✔️',
    blueLizalfos: blueLizalfos === '✔️',
    cursedLizalfos: cursedLizalfos === '✔️',
    electricLizalfos: electricLizalfos === '✔️',
    fireBreathLizalfos: fireBreathLizalfos === '✔️',
    goldenLizalfos: goldenLizalfos === '✔️',
    iceBreathLizalfos: iceBreathLizalfos === '✔️',
    silverLizalfos: silverLizalfos === '✔️',
    lizalfos: lizalfos === '✔️',
    blueManedLynel: blueManedLynel === '✔️',
    goldenLynel: goldenLynel === '✔️',
    silverLynel: silverLynel === '✔️',
    whiteManedLynel: whiteManedLynel === '✔️',
    lynel: lynel === '✔️',
    blackMoblin: blackMoblin === '✔️',
    blueMoblin: blueMoblin === '✔️',
    cursedMoblin: cursedMoblin === '✔️',
    goldenMoblin: goldenMoblin === '✔️',
    silverMoblin: silverMoblin === '✔️',
    moblin: moblin === '✔️',
    molduga: molduga === '✔️',
    molduking: molduking === '✔️',
    forestOctorok: forestOctorok === '✔️',
    rockOctorok: rockOctorok === '✔️',
    skyOctorok: skyOctorok === '✔️',
    snowOctorok: snowOctorok === '✔️',
    treasureOctorok: treasureOctorok === '✔️',
    waterOctorok: waterOctorok === '✔️',
    frostPebblit: frostPebblit === '✔️',
    igneoPebblit: igneoPebblit === '✔️',
    stonePebblit: stonePebblit === '✔️',
    stalizalfos: stalizalfos === '✔️',
    stalkoblin: stalkoblin === '✔️',
    stalmoblin: stalmoblin === '✔️',
    stalnox: stalnox === '✔️',
    frostTalus: frostTalus === '✔️',
    igneoTalus: igneoTalus === '✔️',
    luminousTalus: luminousTalus === '✔️',
    rareTalus: rareTalus === '✔️',
    stoneTalus: stoneTalus === '✔️',
    blizzardWizzrobe: blizzardWizzrobe === '✔️',
    electricWizzrobe: electricWizzrobe === '✔️',
    fireWizzrobe: fireWizzrobe === '✔️',
    iceWizzrobe: iceWizzrobe === '✔️',
    meteoWizzrobe: meteoWizzrobe === '✔️',
    thunderWizzrobe: thunderWizzrobe === '✔️',
    likeLike: likeLike === '✔️',
    evermean: evermean === '✔️',
    gibdo: gibdo === '✔️',
    horriblin: horriblin === '✔️',
    gloomHands: gloomHands === '✔️',
    bossBokoblin: bossBokoblin === '✔️',
    mothGibdo: mothGibdo === '✔️',
    littleFrox: littleFrox === '✔️',
    
    // Pet-related fields
    petPerkObtain: petPerkArray,  
    petprey: petprey === '✔️',
    petforage: petforage === '✔️',
    lgpetprey: lgpetprey === '✔️',
    petmon: petmon === '✔️',
    petchu: petchu === '✔️',
    petfirechu: petfirechu === '✔️',
    peticechu: peticechu === '✔️',
    petelectricchu: petelectricchu === '✔️'
  };
}

// ------------------- Function to seed items to MongoDB -------------------
async function seedItems() {
  await connectToMongoDB(); // Connect to MongoDB

  try {
    // Authorize and fetch data from Google Sheets
    const auth = await authorizeSheets();
    const spreadsheetId = '1OW7_HD3ZsEys19nVRPjqWNg2i0jt5es4lBJvEZJMnSw'; // Google Sheets ID
    const range = 'All for Wix!A2:FG'; // Range to fetch (starting from the second row to skip headers)
    const sheetData = await fetchSheetData(auth, spreadsheetId, range);

    // Parse item data from sheet data
    const items = sheetData.map((row) => parseSheetItemData(row));

    // Retrieve all item IDs from MongoDB for crafting materials mapping
    const allItems = await Item.find();
    const itemIdMap = allItems.reduce((acc, item) => {
      acc[item.itemName] = { _id: item._id.toString(), itemName: item.itemName };
      return acc;
    }, {});

    // Save all items to MongoDB, updating existing ones or adding new ones
    for (const itemData of items) {
      // First, find the existing item by itemName
      const existingItem = await Item.findOne({ itemName: itemData.itemName });

      if (existingItem) {
        // Remove all fields except for _id and itemName
        const itemId = existingItem._id;

        // Update the document by removing all fields except itemName and _id
        await Item.updateOne(
          { _id: itemId },
          { $unset: { 
            image: "", imageType: "", itemRarity: "", category: "", categoryGear: "", 
            type: "", subtype: "", recipeTag: "", craftingMaterial: "", buyPrice: "", 
            sellPrice: "", staminaToCraft: "", modifierHearts: "", staminaRecovered: "", 
            obtain: "", obtainTags: "", crafting: "", gathering: "", looting: "", vending: "", 
            traveling: "", specialWeather: "", petPerk: "", exploring: "", craftingJobs: "", 
            craftingTags: "", artist: "", blacksmith: "", cook: "", craftsman: "", maskMaker: "", 
            researcher: "", weaver: "", witch: "", locations: "", locationsTags: "", 
            emoji: "", blackBokoblin: "", blueBokoblin: "", cursedBokoblin: "", goldenBokoblin: "", 
            silverBokoblin: "", bokoblin: "", electricChuchuLarge: "", fireChuchuLarge: "", 
            iceChuchuLarge: "", chuchuLarge: "", electricChuchuMedium: "", fireChuchuMedium: "", 
            iceChuchuMedium: "", chuchuMedium: "", electricChuchuSmall: "", fireChuchuSmall: "", 
            iceChuchuSmall: "", chuchuSmall: "", blackHinox: "", blueHinox: "", hinox: "", 
            electricKeese: "", fireKeese: "", iceKeese: "", keese: "", blackLizalfos: "", 
            blueLizalfos: "", cursedLizalfos: "", electricLizalfos: "", fireBreathLizalfos: "", 
            goldenLizalfos: "", iceBreathLizalfos: "", silverLizalfos: "", lizalfos: "", 
            blueManedLynel: "", goldenLynel: "", silverLynel: "", whiteManedLynel: "", lynel: "", 
            blackMoblin: "", blueMoblin: "", cursedMoblin: "", goldenMoblin: "", silverMoblin: "", 
            moblin: "", molduga: "", molduking: "", forestOctorok: "", rockOctorok: "", 
            skyOctorok: "", snowOctorok: "", treasureOctorok: "", waterOctorok: "", frostPebblit: "", 
            igneoPebblit: "", stonePebblit: "", stalizalfos: "", stalkoblin: "", stalmoblin: "", 
            stalnox: "", frostTalus: "", igneoTalus: "", luminousTalus: "", rareTalus: "", 
            stoneTalus: "", blizzardWizzrobe: "", electricWizzrobe: "", fireWizzrobe: "", 
            iceWizzrobe: "", meteoWizzrobe: "", thunderWizzrobe: "", likeLike: "", evermean: "", 
            gibdo: "", horriblin: "", gloomHands: "", bossBokoblin: "", mothGibdo: "", littleFrox: "", 
            petprey: "", petforage: "", lgpetprey: "", petmon: "", petchu: "", petfirechu: "", 
            peticechu: "", petelectricchu: "", petperkobtain: ""
          }}
        );

        // Re-add the fields from itemData, while preserving itemName and _id
        await Item.updateOne(
          { _id: itemId },
          { $set: itemData }
        );
      } else {
        // Insert new item if it doesn't already exist
        await Item.create(itemData);
      }
    }

    // ------------------- Update items with crafting materials -------------------
    for (const itemData of items) {
      const originalItem = sheetData.find((row) => row[0] === itemData.itemName);
      if (!originalItem) continue;

      // Track added item names to avoid duplicates
      const addedItemNames = new Set();

      const craftingMaterials = (originalItem[11] || '').split('\n').map((line) => {
        const [item, quantity] = line.split(' ⨯ ');
        const itemName = item.trim();

        // If the item name is exactly as "Any Category", we use it directly
        if (itemName.startsWith('Any ')) {
          return { itemName, quantity: parseInt(quantity.trim()) || 0 };
        }

        const itemInfo = itemIdMap[itemName];
        if (itemInfo && quantity && !addedItemNames.has(itemName)) {
          addedItemNames.add(itemName);
          return { _id: itemInfo._id, itemName: itemInfo.itemName, quantity: parseInt(quantity.trim()) || 0 };
        }
        return null;
      }).filter((mat) => mat && mat.itemName && mat.quantity);

      if (craftingMaterials.length > 0) {
        // Use $set to ensure the entire array is updated correctly
        await Item.findOneAndUpdate(
          { itemName: itemData.itemName },
          { $set: { craftingMaterial: craftingMaterials } }, // Use $set to update crafting materials
          { upsert: true, new: true }
        );
      }
    }

    console.log('✅ Items successfully seeded/updated in MongoDB');
  } catch (error) {
    handleError(error, 'seedItems.js');

    console.error('❌ Error seeding/updating items:', error);
    throw error;
  } finally {
    mongoose.disconnect(); // Disconnect from MongoDB when done
  }
}

// ------------------- Execute the seeding function -------------------
seedItems().catch((error) => {
  console.error('❌ Error during item seeding:', error);
  process.exit(1); // Exit the process if there's an error
});
