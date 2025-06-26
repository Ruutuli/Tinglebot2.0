/* ============================================================================
// server.js
// Purpose: Express server for Tinglebot dashboard – handles API routes,
//          database operations, caching, and server management using db.js methods.
// ============================================================================ */

// ------------------- Section: Imports & Configuration -------------------
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const fetch = require('node-fetch');

// Import database methods from db.js
const {
  connectToTinglebot,
  connectToInventories,
  connectToVending,
  fetchAllCharacters,
  fetchCharacterById,
  fetchAllItems,
  fetchItemByName,
  fetchAllMonsters,
  fetchMonsterByName,
  getCharacterInventoryCollection,
  getTokenBalance,
  getUserById
} = require('../database/db');

// Import models
const Character = require('../models/CharacterModel');
const Quest = require('../models/QuestModel');
const Item = require('../models/ItemModel');
const Monster = require('../models/MonsterModel');
const User = require('../models/UserModel');
const Pet = require('../models/PetModel');
const Mount = require('../models/MountModel');
const VillageShops = require('../models/VillageShopsModel');
const Weather = require('../models/WeatherModel');
const { VendingRequest } = require('../models/VendingModel');
const { Village } = require('../models/VillageModel');
const Party = require('../models/PartyModel');
const Relic = require('../models/RelicModel');

// ------------------- Section: App Configuration -------------------
const app = express();
const PORT = process.env.PORT || 5001;

// Database connection options
const connectionOptions = {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  maxPoolSize: 10,
  minPoolSize: 5,
  retryWrites: true,
  retryReads: true,
  w: 'majority',
  wtimeoutMS: 2500,
  heartbeatFrequencyMS: 10000,
  maxIdleTimeMS: 60000,
  family: 4
};

// Connection variables
let inventoriesConnection = null;
let vendingConnection = null;

// ------------------- Section: Caching Configuration -------------------
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const inventoryCache = new Map();
const characterListCache = { 
  data: null, 
  timestamp: 0, 
  CACHE_DURATION: 10 * 60 * 1000 
};

// ------------------- Function: initializeCacheCleanup -------------------
// Sets up periodic cache cleanup to prevent memory leaks
const initializeCacheCleanup = () => {
  setInterval(() => {
    const now = Date.now();
    for (const [key, { timestamp }] of inventoryCache.entries()) {
      if (now - timestamp > CACHE_DURATION) {
        inventoryCache.delete(key);
      }
    }
  }, 5 * 60 * 1000); // Purge every 5 minutes
};

// ------------------- Section: Database Initialization -------------------

// ------------------- Function: initializeDatabases -------------------
// Establishes connections to all required databases using db.js methods
async function initializeDatabases() {
  try {
    console.log('[server.js]: 🔄 Connecting to databases...');
    
    // Connect to Tinglebot database using db.js method
    await connectToTinglebot();
    console.log('[server.js]: ✅ Tinglebot DB connected');
    
    // Connect to Inventories database using db.js method
    inventoriesConnection = await connectToInventories();
    console.log('[server.js]: ✅ Inventories DB connected');
    
    // Connect to Vending database using db.js method
    vendingConnection = await connectToVending();
    console.log('[server.js]: ✅ Vending DB connected');
    
    console.log('[server.js]: 🎯 All databases connected successfully');
  } catch (error) {
    console.error('[server.js]: ❌ Database connection error:', error);
    throw error;
  }
}

// ------------------- Section: Express Middleware -------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// ------------------- Section: Page Routes -------------------

// ------------------- Function: serveIndexPage -------------------
// Serves the main dashboard page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ------------------- Section: API Routes -------------------

// ------------------- Function: healthCheck -------------------
// Provides system health status and connection information
app.get('/api/health', async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      connections: {
        tinglebot: mongoose.connection.readyState === 1,
        inventories: inventoriesConnection ? inventoriesConnection.readyState === 1 : false,
        vending: vendingConnection ? vendingConnection.readyState === 1 : false
      },
      models: {
        character: !!Character,
        item: !!Item,
        user: !!User,
        pet: !!Pet,
        weather: !!Weather,
        vending: !!VendingRequest
      }
    };
    
    console.log('[server.js]: 🏥 Health check:', health);
    res.json(health);
  } catch (error) {
    console.error('[server.js]: ❌ Health check failed:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ------------------- Function: getUserInfo -------------------
// Returns basic user information for dashboard
app.get('/api/user', (req, res) => {
  res.json({ username: 'Admin' });
});

// ------------------- Function: getActivities -------------------
// Returns mock activity data for dashboard
app.get('/api/activities', (_, res) => {
  res.json([
    { type: 'command', text: 'User used /help command', timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
    { type: 'join', text: 'New server joined: Gaming Community', timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
    { type: 'error', text: 'Command failed: /play (Invalid URL)', timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString() }
  ]);
});

// ------------------- Function: getCommands -------------------
// Returns command usage statistics
app.get('/api/commands', (_, res) => {
  res.json([
    { name: 'help', description: 'Shows all available commands', usage: '/help [command]', usageCount: 1500 },
    { name: 'play', description: 'Plays music from YouTube', usage: '/play <url>', usageCount: 800 },
    { name: 'ping', description: 'Shows bot latency', usage: '/ping', usageCount: 2000 }
  ]);
});

// ------------------- Section: Statistics API Routes -------------------

// ------------------- Function: getRootsOfTheWildStats -------------------
// Returns statistics for Roots of the Wild game data
app.get('/api/rootsofthewild/stats', async (req, res) => {
  try {
    const [totalCharacters, activeQuests, totalItems, activeMonsters] = await Promise.all([
      Character.countDocuments(),
      Quest.countDocuments({ status: 'active' }),
      Item.countDocuments(),
      Monster.countDocuments({ isActive: true })
    ]);
    res.json({ totalCharacters, activeQuests, totalItems, activeMonsters });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching RootsOfTheWild stats:', error);
    res.status(500).json({ error: 'Failed to fetch RootsOfTheWild stats' });
  }
});

// ------------------- Function: getTinglebotStats -------------------
// Returns statistics for Tinglebot system data
app.get('/api/tinglebot/stats', async (req, res) => {
  try {
    const [totalUsers, activePets, totalMounts, villageShops] = await Promise.all([
      User.countDocuments(),
      Pet.countDocuments({ isActive: true }),
      Mount.countDocuments(),
      VillageShops.countDocuments()
    ]);
    res.json({ totalUsers, activePets, totalMounts, villageShops });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching Tinglebot stats:', error);
    res.status(500).json({ error: 'Failed to fetch Tinglebot statistics' });
  }
});

// ------------------- Function: getCharacterStats -------------------
// Returns comprehensive character statistics and analytics
app.get('/api/stats/characters', async (req, res) => {
  try {
    const totalCharacters = await Character.countDocuments();

    // Get characters per village
    const perVillageAgg = await Character.aggregate([
      { $match: { homeVillage: { $exists: true, $ne: null } } },
      { $group: { _id: { $toLower: { $ifNull: ["$homeVillage", "unknown"] } }, count: { $sum: 1 } } }
    ]);
    const charactersPerVillage = { rudania: 0, inariko: 0, vhintl: 0 };
    perVillageAgg.forEach(r => {
      if (charactersPerVillage[r._id] !== undefined) charactersPerVillage[r._id] = r.count;
    });

    // Get characters per race
    const perRaceAgg = await Character.aggregate([{ $group: { _id: "$race", count: { $sum: 1 } } }]);
    const charactersPerRace = {};
    perRaceAgg.forEach(r => charactersPerRace[r._id || 'Unknown'] = r.count);

    // Get characters per job
    const perJobAgg = await Character.aggregate([
      { $project: { job: { $toLower: { $ifNull: ["$job", "unknown"] } } } },
      { $group: { _id: { $concat: [{ $toUpper: { $substr: ["$job", 0, 1] } }, { $substr: ["$job", 1, { $strLenCP: "$job" }] }] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    const charactersPerJob = {};
    perJobAgg.forEach(r => charactersPerJob[r._id] = r.count);

    // Get upcoming birthdays
    const today = new Date();
    const thisYr = today.getFullYear();
    const allBday = await Character.find({ birthday: { $exists: true, $ne: '' } }, { name: 1, birthday: 1 }).lean();
    const upcoming = allBday.map(c => {
      const mmdd = c.birthday.slice(-5);
      let next = isNaN(Date.parse(`${thisYr}-${mmdd}`))
        ? null
        : new Date(`${thisYr}-${mmdd}`);
      if (next && next < today) next.setFullYear(thisYr + 1);
      return { name: c.name, birthday: c.birthday, nextBirthday: next };
    })
      .filter(c => c.nextBirthday && (c.nextBirthday - today) <= (30 * 24 * 60 * 60 * 1000))
      .sort((a, b) => a.nextBirthday - b.nextBirthday);

    // Get visiting counts
    const villages = ['rudania', 'inariko', 'vhintl'];
    const visitingAgg = await Character.aggregate([
      { $match: { currentVillage: { $in: villages }, homeVillage: { $in: villages, $ne: null }, $expr: { $ne: ['$currentVillage', '$homeVillage'] } } },
      { $group: { _id: '$currentVillage', count: { $sum: 1 } } }
    ]);
    const visitingCounts = { rudania: 0, inariko: 0, vhintl: 0 };
    visitingAgg.forEach(r => visitingCounts[r._id] = r.count);

    // Get top characters by various stats
    const getTop = async (field) => {
      const top = await Character.find({ [field]: { $gt: 0 } }).sort({ [field]: -1 }).limit(1).lean();
      if (!top.length) return { names: [], value: 0 };
      const val = top[0][field];
      const names = (await Character.find({ [field]: val }, { name: 1 }).limit(3).lean()).map(c => c.name);
      return { names, value: val };
    };

    const [mostStamina, mostHearts, mostOrbs] = await Promise.all([
      getTop('maxStamina'),
      getTop('maxHearts'),
      getTop('spiritOrbs')
    ]);

    // Get special character counts
    const [kodCount, blightedCount] = await Promise.all([
      Character.countDocuments({ ko: true }),
      Character.countDocuments({ blighted: true })
    ]);

    res.json({
      totalCharacters,
      charactersPerVillage,
      charactersPerRace,
      charactersPerJob,
      upcomingBirthdays: upcoming,
      visitingCounts,
      mostStaminaChar: mostStamina,
      mostHeartsChar: mostHearts,
      mostOrbsChar: mostOrbs,
      kodCount,
      blightedCount
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching character stats:', error);
    res.status(500).json({ error: 'Failed to fetch character stats' });
  }
});

// ------------------- Section: Model API Routes -------------------

// ------------------- Function: getModelCounts -------------------
// Returns count of documents for all models
app.get('/api/models/counts', async (req, res) => {
  try {
    console.log('[server.js]: 📊 Getting model counts...');
    
    const modelMap = {
      character: { model: Character, connection: mongoose.connection },
      weather: { model: Weather, connection: mongoose.connection },
      monster: { model: Monster, connection: mongoose.connection },
      pet: { model: Pet, connection: mongoose.connection },
      mount: { model: Mount, connection: mongoose.connection },
      item: { model: Item, connection: mongoose.connection },
      party: { model: Party, connection: mongoose.connection },
      relic: { model: Relic, connection: mongoose.connection },
      quest: { model: Quest, connection: mongoose.connection },
      inventory: { model: null, connection: inventoriesConnection },
      vending: { model: VendingRequest, connection: vendingConnection }
    };
    
    const counts = Object.fromEntries(Object.keys(modelMap).map(k => [k, 0]));
    
    await Promise.all(Object.entries(modelMap).map(async ([key, { model, connection }]) => {
      try {
        if (key === 'inventory') {
          // Handle inventory collections separately
          const Inv = connection.model('Inventory', new mongoose.Schema({
            characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', required: true },
            itemName: { type: String, required: true },
            itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
            quantity: { type: Number, default: 1 },
            category: { type: String },
            type: { type: String },
            subtype: { type: String },
            job: { type: String },
            perk: { type: String },
            location: { type: String },
            date: { type: Date },
            obtain: { type: String, default: '' },
            synced: { type: String, unique: true }
          }));
          counts[key] = await Inv.countDocuments();
        } else {
          counts[key] = await model.countDocuments();
        }
        console.log(`[server.js]: ✅ ${key} count: ${counts[key]}`);
      } catch (error) {
        console.error(`[server.js]: ❌ Error getting ${key} count:`, error.message);
        // Keep 0 on error
      }
    }));
    
    console.log('[server.js]: 📊 Model counts completed');
    res.json(counts);
  } catch (error) {
    console.error('[server.js]: ❌ Error in /api/models/counts:', error);
    res.status(500).json({ error: 'Failed to get model counts', details: error.message });
  }
});

// ------------------- Function: getInventoryData -------------------
// Returns inventory data with streaming support for large datasets
app.get('/api/models/inventory', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked'
  });
  res.write(JSON.stringify({ status: 'loading' }));

  try {
    const limit = parseInt(req.query.limit) || 1000;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI_PROD, connectionOptions);
    await client.connect();
    const db = client.db('inventories');

    // Get character collections
    let collections = characterListCache.data;
    if (!collections || Date.now() - characterListCache.timestamp > characterListCache.CACHE_DURATION) {
      collections = (await db.listCollections().toArray())
        .map(c => c.name)
        .filter(n => !n.startsWith('system.') && n !== 'inventories');
      characterListCache.data = collections;
      characterListCache.timestamp = Date.now();
    }

    // Process collections in batches
    const BATCH_SIZE = 5;
    let allItems = [];
    for (let i = 0; i < collections.length; i += BATCH_SIZE) {
      const batch = collections.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(async name => {
        const items = await db.collection(name)
          .find()
          .project({ itemName: 1, quantity: 1, type: 1, category: 1 })
          .toArray();
        return items.map(it => ({ ...it, characterName: name }));
      }));
      allItems.push(...results.flat());

      if (i + BATCH_SIZE < collections.length) {
        res.write(JSON.stringify({
          status: 'loading',
          progress: Math.round((i + BATCH_SIZE) / collections.length * 100)
        }));
      }
    }

    await client.close();

    const paginated = allItems.slice(skip, skip + limit);
    res.write(JSON.stringify({
      status: 'complete',
      data: paginated,
      pagination: {
        total: allItems.length,
        page, limit,
        pages: Math.ceil(allItems.length / limit)
      }
    }));
    res.end();
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching inventory:', error);
    res.write(JSON.stringify({
      status: 'error',
      error: 'Failed to fetch inventory',
      details: error.message
    }));
    res.end();
  }
});

// ------------------- Function: getModelData -------------------
// Returns paginated data for any model type with filtering support
app.get('/api/models/:modelType', async (req, res) => {
  try {
    const { modelType } = req.params;
    console.log(`[server.js]: 🔍 Fetching ${modelType} data...`);
    
    const page = parseInt(req.query.page) || 1;
    const limit = 12; // Items per page
    const skip = (page - 1) * limit;
    const allItems = req.query.all === 'true';

    // Check if this is a filtered request for items
    const isFilteredRequest = modelType === 'item' && (
      req.query.search || 
      req.query.category || 
      req.query.type || 
      req.query.subtype || 
      req.query.jobs || 
      req.query.locations ||
      req.query.sources
    );

    let Model, query = {};
    
    // Map model type to corresponding model
    switch (modelType) {
      case 'character':
        Model = Character;
        break;
      case 'item':
        Model = Item;
        break;
      case 'monster':
        Model = Monster;
        query = { isActive: true };
        break;
      case 'pet':
        Model = Pet;
        query = { isActive: true };
        break;
      case 'mount':
        Model = Mount;
        break;
      case 'village':
        Model = Village;
        break;
      case 'party':
        Model = Party;
        break;
      case 'relic':
        Model = Relic;
        break;
      case 'inventory':
        // Create inventory model dynamically for the inventories connection
        Model = inventoriesConnection ? inventoriesConnection.model('Inventory', new mongoose.Schema({
          characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', required: true },
          itemName: { type: String, required: true },
          itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
          quantity: { type: Number, default: 1 },
          category: { type: String },
          type: { type: String },
          subtype: { type: String },
          job: { type: String },
          perk: { type: String },
          location: { type: String },
          date: { type: Date },
          obtain: { type: String, default: '' },
          synced: { type: String, unique: true }
        })) : null;
        break;
      default:
        return res.status(400).json({ error: 'Invalid model type' });
    }

    if (!Model) {
      console.error(`[server.js]: ❌ Model not found for type: ${modelType}`);
      return res.status(500).json({ error: `Model not initialized for type: ${modelType}` });
    }

    // For filtered item requests or all=true requests, return all items
    if (isFilteredRequest || allItems) {
      console.log(`[server.js]: 🔍 ${allItems ? 'All items' : 'Filtered'} request detected, returning all items`);
      const allItemsData = await Model.find(query)
        .sort({ itemName: 1 })
        .lean();
      
      console.log(`[server.js]: ✅ Successfully fetched ${allItemsData.length} ${modelType} records (all items)`);
      res.json({
        data: allItemsData,
        pagination: {
          page: 1,
          pages: 1,
          total: allItemsData.length,
          limit: allItemsData.length
        }
      });
      return;
    }

    // Get total count for pagination
    const total = await Model.countDocuments(query);
    const pages = Math.ceil(total / limit);

    // Fetch paginated data
    const data = await Model.find(query)
      .sort(modelType === 'item' ? { itemName: 1 } : {})
      .skip(skip)
      .limit(limit)
      .lean();

    // Transform icon URLs for characters
    if (modelType === 'character') {
      data.forEach(character => {
        if (character.icon && character.icon.startsWith('https://storage.googleapis.com/tinglebot/')) {
          // Extract the filename from the Google Cloud Storage URL
          const filename = character.icon.split('/').pop();
          // Replace with our proxy URL
          character.icon = filename;
        }
      });
    }

    console.log(`[server.js]: ✅ Successfully fetched ${data.length} ${modelType} records (page ${page}/${pages})`);
    res.json({
      data,
      pagination: {
        page,
        pages,
        total,
        limit
      }
    });
  } catch (error) {
    console.error(`[server.js]: ❌ Error fetching ${req.params.modelType} data:`, error);
    res.status(500).json({ error: `Failed to fetch ${req.params.modelType} data`, details: error.message });
  }
});

// ------------------- Section: Character API Routes -------------------

// ------------------- Function: getCharacterCount -------------------
// Returns total number of characters
app.get('/api/character-count', async (_, res) => {
  try {
    const count = await Character.countDocuments();
    res.json({ count });
  } catch (error) {
    console.error('[server.js]: ❌ Failed to fetch character count:', error);
    res.status(500).json({ error: 'Failed to fetch character count' });
  }
});

// ------------------- Function: getCharacterIcon -------------------
// Returns character icon URL by character ID
app.get('/api/character/:id/icon', async (req, res) => {
  try {
    const char = await Character.findById(req.params.id);
    if (!char) return res.status(404).json({ error: 'Character not found' });
    res.json({ icon: char.icon });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching character icon:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: getCharacterById -------------------
// Returns character data by character ID
app.get('/api/character/:id', async (req, res) => {
  try {
    const char = await Character.findById(req.params.id);
    if (!char) return res.status(404).json({ error: 'Character not found' });
    res.json({ ...char.toObject(), icon: char.icon });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching character:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Section: Image Proxy Routes -------------------

// ------------------- Function: proxyImage -------------------
// Proxies images from Google Cloud Storage with caching headers
app.get('/api/images/:filename', async (req, res) => {
  try {
    const url = `https://storage.googleapis.com/tinglebot/${req.params.filename}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Image not found');
    
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Content-Type', response.headers.get('content-type'));
    res.set('Cache-Control', 'public, max-age=31536000');
    
    response.body.pipe(res);
  } catch (error) {
    console.error('[server.js]: ❌ Error proxying image:', error);
    res.status(404).send('Image not found');
  }
});

// ------------------- Section: Inventory API Routes -------------------

// ------------------- Function: getInventoryData -------------------
// Returns all inventory data across all characters
app.get('/api/inventory', async (req, res) => {
  try {
    const characters = await fetchAllCharacters();
    const inventoryData = [];

    for (const char of characters) {
      try {
        const col = await getCharacterInventoryCollection(char.name);
        const inv = await col.find().toArray();
        inventoryData.push(...inv.map(item => ({ ...item, characterName: char.name })));
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Error fetching inventory for character ${char.name}:`, error.message);
        continue;
      }
    }
    
    console.log(`[server.js]: ✅ Successfully fetched ${inventoryData.length} inventory items`);
    res.json(inventoryData);
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching inventory data:', error);
    res.status(500).json({ error: 'Failed to fetch inventory data', details: error.message });
  }
});

// ------------------- Function: getItemsData -------------------
// Returns all items data
app.get('/api/items', async (req, res) => {
  try {
    const items = await fetchAllItems();
    console.log(`[server.js]: ✅ Successfully fetched ${items.length} items`);
    res.json(items);
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching items data:', error);
    res.status(500).json({ error: 'Failed to fetch items data', details: error.message });
  }
});

// ------------------- Function: searchInventoryByItem -------------------
// Searches inventory for specific item across all characters
app.post('/api/inventory/item', async (req, res) => {
  console.log('[server.js]: 📥 INVENTORY POST REQUEST RECEIVED');
  const { itemName } = req.body;
  try {
    const characters = await fetchAllCharacters();
    const inventoryData = [];

    for (const char of characters) {
      try {
        const col = await getCharacterInventoryCollection(char.name);
        const inv = await col.find().toArray();
        const entry = inv.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
        if (entry) {
          inventoryData.push({ characterName: char.name, quantity: entry.quantity });
        }
      } catch {
        continue;
      }
    }
    res.json(inventoryData);
  } catch (error) {
    console.error('[server.js]: ❌ ERROR OCCURRED:', error);
    res.status(500).json({ error: 'Failed to fetch inventory data' });
  }
});

// ------------------- Section: Utility Functions -------------------

// ------------------- Function: formatUptime -------------------
// Converts milliseconds into 'Xd Xh Xm' string format
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ${minutes % 60}m`;
}

// ------------------- Section: Error Handling Middleware -------------------
app.use((err, req, res, next) => {
  console.error('[server.js]: ❌ Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Handle 404s - only for API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  // For non-API routes, serve index.html (SPA fallback)
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ------------------- Section: Server Startup -------------------

// ------------------- Function: startServer -------------------
// Initializes the server and starts listening on the specified port
const startServer = async () => {
  try {
    // Initialize cache cleanup
    initializeCacheCleanup();
    
    // Initialize databases
    await initializeDatabases();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`[server.js]: 🚀 Dashboard server running on port ${PORT}`);
      console.log(`[server.js]: 📝 Visit http://localhost:${PORT} to view the dashboard`);
    });
  } catch (error) {
    console.error('[server.js]: ❌ Failed to start server:', error);
    process.exit(1);
  }
};

// ------------------- Section: Graceful Shutdown -------------------

// ------------------- Function: gracefulShutdown -------------------
// Handles graceful shutdown of the server and database connections
const gracefulShutdown = async () => {
  console.log('[server.js]: 🔄 Shutting down gracefully...');
  
  // Close all database connections
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('[server.js]: ✅ Tinglebot connection closed');
  }
  
  if (inventoriesConnection) {
    await inventoriesConnection.close();
    console.log('[server.js]: ✅ Inventories connection closed');
  }
  
  if (vendingConnection) {
    await vendingConnection.close();
    console.log('[server.js]: ✅ Vending connection closed');
  }
  
  console.log('[server.js]: 🏁 Server shutdown complete');
  process.exit(0);
};

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start the server
startServer();
