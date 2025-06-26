// ============================================================================
// 01-imports — Required Libraries, ENV Config, Constants
// ============================================================================
require('dotenv').config();

// Suppress MongoDB driver warnings
const originalWarn = console.warn;
console.warn = function filterWarnings(msg) {
    if (msg.includes('useNewUrlParser') || msg.includes('useUnifiedTopology')) {
        return;
    }
    originalWarn.apply(console, arguments);
};

const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const fetch = require('node-fetch');
const Character = require('../models/CharacterModel');
const Quest = require('../models/QuestModel');
const Item = require('../models/ItemModel');
const Monster = require('../models/MonsterModel');
const User = require('../models/UserModel');
const Pet = require('../models/PetModel');
const Mount = require('../models/MountModel');
const VillageShops = require('../models/VillageShopsModel');
const Weather = require('../models/WeatherModel');
const Vending = require('../models/VendingModel');
const Village = require('../models/VillageModel');
const Party = require('../models/PartyModel');
const Relic = require('../models/RelicModel');
const Inventory = require('../models/InventoryModel');
const { normalizeJobName } = require('../modules/jobsModule');
const initializeInventoryModel = require('../models/InventoryModel');
const { connectToInventories, getCharacterInventoryCollection } = require('../database/db');
const app = express();
const PORT = process.env.PORT || 5001;

// Add cache configuration at the top with other constants
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const inventoryCache = new Map();
const characterListCache = {
    data: null,
    timestamp: 0,
    CACHE_DURATION: 10 * 60 * 1000 // 10 minutes
};

// Add cache cleanup interval
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of inventoryCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            inventoryCache.delete(key);
        }
    }
}, 5 * 60 * 1000); // Check every 5 minutes

// Define Inventory Schema
const inventorySchema = new mongoose.Schema({
    characterId: mongoose.Schema.Types.ObjectId,
    itemId: mongoose.Schema.Types.ObjectId,
    itemName: String,
    quantity: Number,
    category: String,
    type: String,
    subtype: [String],
    job: String,
    perk: String,
    location: String,
    link: String,
    date: Date,
    obtain: String,
    synced: String
});

// Create Inventory model
const InventoryModel = mongoose.model('Inventory', inventorySchema);

// ============================================================================
// 02-setup — Express App Initialization, Middleware, Static Files
// ============================================================================
// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// Discord Strategy
if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    passport.use(new DiscordStrategy({
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/auth/discord/callback',
        scope: ['identify', 'guilds']
    }, (accessToken, refreshToken, profile, done) => {
        return done(null, profile);
    }));
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css'), {
    setHeaders: (res, path) => {
        res.setHeader('Content-Type', 'text/css');
    }
}));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Auth middleware
const isAuthenticated = (req, res, next) => {
    // Temporarily disable authentication
    return next();
    // if (req.isAuthenticated()) {
    //     return next();
    // }
    // res.redirect('/login');
};

// ============================================================================
// 03-database — DB Connection, Schemas, Models
// ============================================================================
// Initialize MongoDB connections
async function initializeDatabases() {
    try {
        console.log('[server.js]: 🔄 Connecting to databases...');

        // Connect to main database
        await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI_PROD);
        console.log('[server.js]: 🎯 Tinglebot database connected successfully');

        // Connect to inventories database
        const inventoriesConnection = await mongoose.createConnection(process.env.MONGODB_INVENTORIES_URI_PROD);
        console.log('[server.js]: 🎯 Inventories database connected successfully');

        // Connect to vending database
        const vendingConnection = await mongoose.createConnection(process.env.MONGODB_VENDING_URI_PROD);
        console.log('[server.js]: 🎯 Vending database connected successfully');

        return { inventoriesConnection, vendingConnection };
    } catch (error) {
        console.error('[server.js]: ❌ Database connection error:', error);
        throw error;
    }
}

// Call database initialization
initializeDatabases();

// ============================================================================
// 04-auth — Authentication Logic
// ============================================================================
// Add authentication middleware here
// Example: app.use(authMiddleware);

// ============================================================================
// 05-routes — API and Page Routes
// ============================================================================
// Serve the main dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
    passport.authenticate('discord', {
        failureRedirect: '/login'
    }), 
    (req, res) => {
        res.redirect('/');
    }
);

app.get('/auth/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/login');
    });
});

// API Routes
app.get('/api/user', isAuthenticated, (req, res) => {
    res.json(req.user);
});

app.get('/api/activities', (req, res) => {
    // Sample activity data
    res.json([
        {
            type: 'command',
            text: 'User used /help command',
            timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString()
        },
        {
            type: 'join',
            text: 'New server joined: Gaming Community',
            timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString()
        },
        {
            type: 'error',
            text: 'Command failed: /play (Invalid URL)',
            timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString()
        }
    ]);
});

app.get('/api/commands', (req, res) => {
    // Sample command data
    res.json([
        {
            name: 'help',
            description: 'Shows all available commands',
            usage: '/help [command]',
            usageCount: 1500
        },
        {
            name: 'play',
            description: 'Plays music from YouTube',
            usage: '/play <url>',
            usageCount: 800
        },
        {
            name: 'ping',
            description: 'Shows bot latency',
            usage: '/ping',
            usageCount: 2000
        }
    ]);
});

app.get('/api/rootsofthewild/stats', async (req, res) => {
    try {
        await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI_PROD, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        const [
            totalCharacters,
            activeQuests,
            totalItems,
            activeMonsters
        ] = await Promise.all([
            Character.countDocuments(),
            Quest.countDocuments({ status: 'active' }),
            Item.countDocuments(),
            Monster.countDocuments({ isActive: true })
        ]);

        res.json({
            totalCharacters,
            activeQuests,
            totalItems,
            activeMonsters
        });
    } catch (error) {
        console.error('Error fetching RootsOfTheWildstats:', error);
        res.status(500).json({ error: 'Failed to fetch RootsOfTheWildstatistics' });
    }
});

app.get('/api/tinglebot/stats', async (req, res) => {
    try {
        await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI_PROD, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        const [
            totalUsers,
            activePets,
            totalMounts,
            villageShops
        ] = await Promise.all([
            User.countDocuments(),
            Pet.countDocuments({ isActive: true }),
            Mount.countDocuments(),
            VillageShops.countDocuments()
        ]);

        res.json({
            totalUsers,
            activePets,
            totalMounts,
            villageShops
        });
    } catch (error) {
        console.error('Error fetching Tinglebot stats:', error);
        res.status(500).json({ error: 'Failed to fetch Tinglebot statistics' });
    }
});

// Model-related endpoints
app.get('/api/models/counts', async (req, res) => {
    try {
        const modelMap = {
            character: { model: Character, db: 'tinglebot' },
            weather: { model: Weather, db: 'tinglebot' },
            monster: { model: Monster, db: 'tinglebot' },
            pet: { model: Pet, db: 'tinglebot' },
            mount: { model: Mount, db: 'tinglebot' },
            item: { model: Item, db: 'tinglebot' },
            party: { model: Party, db: 'tinglebot' },
            relic: { model: Relic, db: 'tinglebot' },
            quest: { model: Quest, db: 'tinglebot' },
            inventory: { model: null, db: 'inventories' },
            vending: { model: Vending, db: 'vending' }
        };

        // Initialize counts object with all models set to 0
        const counts = Object.keys(modelMap).reduce((acc, key) => {
            acc[key] = 0;
            return acc;
        }, {});

        // Fetch counts for each model
        const countPromises = Object.entries(modelMap).map(async ([key, { model, db }]) => {
            try {
                let count;
                if (db === 'tinglebot') {
                    count = await model.countDocuments();
                } else if (db === 'inventories') {
                    try {
                        // Connect directly to inventories database
                        const inventoriesConnection = await mongoose.createConnection(process.env.MONGODB_INVENTORIES_URI_PROD);
                        
                        // Define the inventory schema
                        const inventorySchema = new mongoose.Schema({
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
                        });

                        const InventoryModel = inventoriesConnection.model('Inventory', inventorySchema);
                        count = await InventoryModel.countDocuments();
                        await inventoriesConnection.close();
                    } catch (error) {
                        console.error(`[server.js]: ❌ Error counting inventory:`, error);
                        count = 0;
                    }
                } else if (db === 'vending') {
                    try {
                        count = await Vending.countDocuments();
                    } catch (error) {
                        console.error(`[server.js]: ❌ Error counting vending:`, error);
                        count = 0;
                    }
                }
                counts[key] = count;
            } catch (error) {
                console.error(`[server.js]: ❌ Error counting ${key}:`, error);
                // Keep the default 0 count for failed models
            }
        });

        await Promise.all(countPromises);
        res.json(counts);
    } catch (error) {
        console.error('[server.js]: ❌ Error in /api/models/counts:', error);
        res.status(500).json({ 
            error: 'Failed to fetch model counts',
            details: error.message
        });
    }
});

// Modify the inventory endpoint to use caching
app.get('/api/models/inventory', async (req, res) => {
    try {
        console.log('\n[server.js]: ==========================================');
        console.log('[server.js]: 🔄 Starting inventory fetch request');
        console.log('[server.js]: ==========================================\n');

        // Send initial loading state immediately
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Transfer-Encoding': 'chunked'
        });
        res.write(JSON.stringify({ status: 'loading' }));

        // Get pagination parameters
        const limit = parseInt(req.query.limit) || 1000;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        // Get the database object using native MongoDB driver with optimized settings
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI_PROD, {
            maxPoolSize: 10,
            minPoolSize: 5,
            serverSelectionTimeoutMS: 30000,
            connectTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            retryWrites: true,
            retryReads: true,
            w: 'majority',
            wtimeoutMS: 2500,
            heartbeatFrequencyMS: 10000,
            maxIdleTimeMS: 60000,
            family: 4
        });

        await client.connect();
        const db = client.db('inventories');

        // Use cached character list if fresh
        let collections;
        if (characterListCache.data && Date.now() - characterListCache.timestamp < characterListCache.CACHE_DURATION) {
            collections = characterListCache.data;
            console.log('✅ Used cached character list');
        } else {
            collections = await db.listCollections().toArray();
            collections = collections
                .map(c => c.name)
                .filter(name => !name.startsWith('system.') && name !== 'inventories');
            
            characterListCache.data = collections;
            characterListCache.timestamp = Date.now();
            console.log('✅ Updated character list cache');
        }

        // Process collections in smaller batches for better performance
        const BATCH_SIZE = 5; // Reduced batch size for faster initial response
        let allItems = [];
        
        for (let i = 0; i < collections.length; i += BATCH_SIZE) {
            const batch = collections.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(async (collectionName) => {
                const items = await db.collection(collectionName)
                    .find()
                    .project({ itemName: 1, quantity: 1, type: 1, category: 1 })
                    .toArray();
                return items.map(item => ({
                    ...item,
                    characterName: collectionName
                }));
            });
            
            const batchResults = await Promise.all(batchPromises);
            allItems.push(...batchResults.flat());

            // Send progress update after each batch
            if (i + BATCH_SIZE < collections.length) {
                res.write(JSON.stringify({
                    status: 'loading',
                    progress: Math.round((i + BATCH_SIZE) / collections.length * 100)
                }));
            }
        }

        // Pagination logic
        const paginatedItems = allItems.slice(skip, skip + limit);

        await client.close();

        // Send the final data
        res.write(JSON.stringify({
            status: 'complete',
            data: paginatedItems,
            pagination: {
                total: allItems.length,
                page,
                limit,
                pages: Math.ceil(allItems.length / limit)
            }
        }));
        res.end();
    } catch (error) {
        console.error('\n[server.js]: ==========================================');
        console.error('[server.js]: ❌ Error fetching inventory data:');
        console.error('----------------------------------------');
        console.error('Error:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        console.error('----------------------------------------');
        console.error('[server.js]: ==========================================\n');
        res.write(JSON.stringify({ 
            status: 'error',
            error: 'Failed to fetch inventory data',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }));
        res.end();
    }
});

app.get('/api/models/:modelName', async (req, res) => {
    try {
        const { modelName } = req.params;
        const modelMap = {
            character: Character,
            weather: Weather,
            monster: Monster,
            pet: Pet,
            mount: Mount,
            vending: Vending,
            item: Item,
            village: Village,
            party: Party,
            relic: Relic,
            quest: Quest,
            inventory: Inventory
        };

        const Model = modelMap[modelName];
        if (!Model) {
            return res.status(404).json({ error: 'Model not found' });
        }

        // If no page/limit is specified, return all items (for dashboard bulk load)
        const MAX_LIMIT = 10000;
        const page = req.query.page ? parseInt(req.query.page) : 1;
        const limit = req.query.limit ? Math.min(parseInt(req.query.limit), MAX_LIMIT) : MAX_LIMIT;
        const skip = (page - 1) * limit;
        
        // Get total count for pagination info
        const totalCount = await Model.countDocuments();

        // Fetch paginated data with sorting
        const data = await Model.find()
            .sort({ itemName: 1 }) // Sort by itemName alphabetically
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Special handling for items to log and verify data
        if (modelName === 'item') {
        }
        
        // Return both data and pagination info
        res.json({
            data,
            pagination: {
                total: totalCount,
                page,
                limit,
                pages: Math.ceil(totalCount / limit)
            }
        });
    } catch (error) {
        console.error(`Error fetching ${req.params.modelName} data:`, error);
        res.status(500).json({ error: 'Failed to fetch model data' });
    }
});

app.get('/api/stats/characters', async (req, res) => {
    try {
        // Ensure we're connected to the database
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI_PROD, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
        }

        const totalCharacters = await Character.countDocuments();
        
        // Characters per Village
        const perVillageAgg = await Character.aggregate([
            { $match: { homeVillage: { $exists: true, $ne: null } } },
            { 
                $group: { 
                    _id: { 
                        $toLower: { 
                            $ifNull: ["$homeVillage", "unknown"] 
                        } 
                    }, 
                    count: { $sum: 1 } 
                } 
            }
        ]);
        
        const charactersPerVillage = {
            rudania: 0,
            inariko: 0,
            vhintl: 0
        };
        
        perVillageAgg.forEach(row => {
            const villageName = row._id.toLowerCase();
            if (villageName === 'rudania' || villageName === 'inariko' || villageName === 'vhintl') {
                charactersPerVillage[villageName] = row.count;
            }
        });

        // Characters per Race
        const perRaceAgg = await Character.aggregate([
            { $group: { _id: '$race', count: { $sum: 1 } } }
        ]);
        const charactersPerRace = {};
        perRaceAgg.forEach(row => {
            charactersPerRace[row._id || 'Unknown'] = row.count;
        });

        // Debug: First check what jobs exist in the database
        const jobDebug = await Character.find({}, { job: 1, _id: 0 }).lean();

        // Debug: Check if any characters have jobs
        const hasJobs = await Character.findOne({ job: { $exists: true } });

        // Characters per Job - Fixed aggregation
        const perJobAgg = await Character.aggregate([
            {
                $project: {
                    job: {
                        $ifNull: [
                            {
                                $toLower: "$job" // First convert to lowercase
                            },
                            "unknown"
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: {
                        $concat: [
                            { $toUpper: { $substr: ["$job", 0, 1] } }, // Capitalize first letter
                            { $substr: ["$job", 1, { $strLenCP: "$job" }] } // Rest of the string
                        ]
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);
         
        const charactersPerJob = {};
        perJobAgg.forEach(row => {
            if (row._id) {
                charactersPerJob[row._id] = row.count;
            }
        });


        // --- Upcoming Birthdays (next 30 days) ---
        const today = new Date();
        const thisYear = today.getFullYear();
        const allBirthdays = await Character.find({ birthday: { $exists: true, $ne: '' } }, { name: 1, birthday: 1 }).lean();
        // Parse and filter for next 30 days
        const birthdayList = allBirthdays.map(c => {
            let b = c.birthday;
            let nextBirthday;
            if (b && b.length >= 5) {
                let mmdd = b.length === 5 ? b : b.slice(5);
                let next = new Date(`${thisYear}-${mmdd}`);
                if (isNaN(next.getTime())) next = null;
                if (next && next < today) next.setFullYear(thisYear + 1);
                nextBirthday = next;
            }
            return { name: c.name, birthday: c.birthday, nextBirthday };
        }).filter(c => c.nextBirthday && (c.nextBirthday - today) / (1000 * 60 * 60 * 24) <= 30 && (c.nextBirthday - today) >= 0)
          .sort((a, b) => a.nextBirthday - b.nextBirthday);

        // --- Visiting Counts (aggregation, only count as visiting the village they are currently in, if not home) ---
        const villages = ['rudania', 'inariko', 'vhintl'];
        const visitingAgg = await Character.aggregate([
          {
            $match: {
              currentVillage: { $in: villages },
              homeVillage: { $in: villages, $ne: null },
              $expr: { $ne: ['$currentVillage', '$homeVillage'] }
            }
          },
          {
            $group: {
              _id: '$currentVillage',
              count: { $sum: 1 }
            }
          }
        ]);
        const visitingCounts = { rudania: 0, inariko: 0, vhintl: 0 };
        visitingAgg.forEach(row => {
          visitingCounts[row._id] = row.count;
        });


        // --- Most Stamina (up to 3 tied) ---
        const maxStamina = await Character.find({ maxStamina: { $exists: true, $ne: null, $gt: 0 } }).sort({ maxStamina: -1 }).limit(1).lean();
        let mostStaminaChar = { names: [], value: 0 };
        if (maxStamina.length > 0) {
            const topValue = maxStamina[0].maxStamina;
            const topChars = await Character.find({ maxStamina: topValue }, { name: 1 }).limit(3).lean();
            mostStaminaChar = { names: topChars.map(c => c.name), value: topValue };
        }
        // --- Most Hearts (up to 3 tied) ---
        const maxHearts = await Character.find({ maxHearts: { $exists: true, $ne: null, $gt: 0 } }).sort({ maxHearts: -1 }).limit(1).lean();
        let mostHeartsChar = { names: [], value: 0 };
        if (maxHearts.length > 0) {
            const topValue = maxHearts[0].maxHearts;
            const topChars = await Character.find({ maxHearts: topValue }, { name: 1 }).limit(3).lean();
            mostHeartsChar = { names: topChars.map(c => c.name), value: topValue };
        }
        // --- Most Spirit Orbs (up to 3 tied) ---
        const maxOrbs = await Character.find({ spiritOrbs: { $exists: true, $ne: null, $gt: 0 } }).sort({ spiritOrbs: -1 }).limit(1).lean();
        let mostOrbsChar = { names: [], value: 0 };
        if (maxOrbs.length > 0) {
            const topValue = maxOrbs[0].spiritOrbs;
            const topChars = await Character.find({ spiritOrbs: topValue }, { name: 1 }).limit(3).lean();
            mostOrbsChar = { names: topChars.map(c => c.name), value: topValue };
        }

        // --- KO'd and Blighted Counts ---
        const kodCount = await Character.countDocuments({ ko: true });
        const blightedCount = await Character.countDocuments({ blighted: true });

        const response = {
            totalCharacters,
            charactersPerVillage,
            charactersPerRace,
            charactersPerJob,
            upcomingBirthdays: birthdayList,
            visitingCounts,
            mostStaminaChar,
            mostHeartsChar,
            mostOrbsChar,
            kodCount,
            blightedCount
        };
        
        res.json(response);
    } catch (err) {
        console.error('Error fetching character stats:', err);
        res.status(500).json({ error: 'Failed to fetch character stats' });
    }
});

// ------------------- Character Count API Endpoint -------------------
app.get('/api/character-count', async (req, res) => {
    try {
        const count = await Character.countDocuments();
        res.json({ count });
    } catch (error) {
        console.error('[server.js]: Failed to fetch character count:', error);
        res.status(500).json({ error: 'Failed to fetch character count' });
    }
});

// Add this route to handle character icons
app.get('/api/character/:id/icon', async (req, res) => {
    try {
        const character = await Character.findById(req.params.id);
        if (!character) {
            return res.status(404).json({ error: 'Character not found' });
        }
        res.json({ icon: character.icon });
    } catch (error) {
        console.error('Error fetching character icon:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update the character data route to include icon information
app.get('/api/character/:id', async (req, res) => {
    try {
        const character = await Character.findById(req.params.id);
        if (!character) {
            return res.status(404).json({ error: 'Character not found' });
        }
        res.json({
            ...character.toObject(),
            icon: character.icon
        });
    } catch (error) {
        console.error('Error fetching character:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Image proxy endpoint
app.get('/api/images/:filename', async (req, res) => {
    try {
        const imageUrl = `https://storage.googleapis.com/tinglebot/${req.params.filename}`;
        const response = await fetch(imageUrl);
        
        if (!response.ok) {
            throw new Error('Image not found');
        }

        // Set appropriate headers
        res.set('Content-Type', response.headers.get('content-type'));
        res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        
        // Stream the image
        response.body.pipe(res);
    } catch (error) {
        console.error('Error proxying image:', error);
        res.status(404).send('Image not found');
    }
});

// Inventory API endpoint
app.post('/api/inventory/item', async (req, res) => {
    console.log('\n==========================================');
    console.log('📥 INVENTORY POST REQUEST RECEIVED');
    console.log('==========================================');


    const { itemName } = req.body;


    try {
        console.log('[server.js]: 🔄 Connecting to databases...');
        const inventoriesConnection = await connectToInventories();
        console.log('✅ Connected to database');

        // Get all characters
        const characters = await Character.find().lean().exec();

        const inventoryData = [];
        for (const char of characters) {
            try {
                const inventoryCollection = await getCharacterInventoryCollection(char.name);
                const inventory = await inventoryCollection.find().toArray();

                const itemEntry = inventory.find(item => 
                    item.itemName.toLowerCase() === itemName.toLowerCase()
                );

                if (itemEntry) {
                    inventoryData.push({
                        characterName: char.name,
                        quantity: itemEntry.quantity
                    });
                }
            } catch (error) {
                console.error(`❌ Error checking ${char.name}'s inventory:`, error);
                // Continue with next character even if one fails
                continue;
            }
        }

        res.json(inventoryData);
    } catch (error) {
        console.error('\n❌ ERROR OCCURRED:');
        console.log('==========================================');
        console.error('Error details:', error);
        console.log('==========================================\n');
        res.status(500).json({ error: 'Failed to fetch inventory data' });
    }
});

// 404 handler - must be after all other routes
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ============================================================================
// 06-utilities — Helper Functions, Logging, Formatters
// ============================================================================
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    return `${days}d ${hours % 24}h ${minutes % 60}m`;
}

// ============================================================================
// 07-error-handling — Catch-Alls and Error Middleware
// ============================================================================
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ============================================================================
// 08-server-start — Start Listening on Port
// ============================================================================
app.listen(PORT, () => {
    console.log('\n[server.js]: 🚀 Dashboard server running on port', PORT);
    console.log('[server.js]: 📝 Visit http://localhost:' + PORT + ' to view the dashboard\n');
});