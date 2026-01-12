/* ============================================================================
// server.js
// Purpose: Express server for Tinglebot dashboard – handles API routes,
//          database operations, caching, and server management using db.js methods.
// ============================================================================ */

// ------------------- Section: Imports & Configuration -------------------
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fetch = require('node-fetch');
const { MongoClient, ObjectId } = require('mongodb');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const { getDiscordGateway } = require('../shared/utils/discordGateway');
const MessageTracking = require('../shared/models/MessageTrackingModel');
const compression = require('compression');
const multer = require('multer');
const fs = require('fs').promises;
const crypto = require('crypto');
const session = require('express-session');
const MongoStore = require('connect-mongo');

// Import database methods from db.js
const {
  connectToTinglebot,
  connectToInventories,
  connectToInventoriesNative,
  connectToVending,
  fetchAllCharacters,
  fetchCharactersByUserId,
  fetchCharacterById,
  fetchAllItems,
  fetchItemByName,
  fetchAllMonsters,
  fetchMonsterByName,
  getCharacterInventoryCollection,
  getTokenBalance,
  getUserById,
  getOrCreateUser,
  getCurrentVendingStockList,
  getLimitedItems
} = require('./database/db');

// Import models
const Character = require('../shared/models/CharacterModel');
const ModCharacter = require('../shared/models/ModCharacterModel');
const Quest = require('../shared/models/QuestModel');
const Item = require('../shared/models/ItemModel');
const Monster = require('../shared/models/MonsterModel');
const User = require('../shared/models/UserModel');
const Pet = require('../shared/models/PetModel');
const Mount = require('../shared/models/MountModel');
const VillageShops = require('../shared/models/VillageShopsModel');
const Weather = require('../shared/models/WeatherModel');
const { VendingRequest } = require('../shared/models/VendingModel');
const { initializeVendingStockModel, getVendingStockModel } = require('../shared/models/VendingStockModel');
const Square = require('../shared/models/mapModel');
const { Village } = require('../shared/models/VillageModel');
const Party = require('../shared/models/PartyModel');
const Relic = require('../shared/models/RelicModel');
const CharacterOfWeek = require('../shared/models/CharacterOfWeekModel');
const Relationship = require('../shared/models/RelationshipModel');
const Raid = require('../shared/models/RaidModel');
const StealStats = require('../shared/models/StealStatsModel');
const BlightRollHistory = require('../shared/models/BlightRollHistoryModel');
const { getGearType, getWeaponStyle } = require('./gearModule');

// Import calendar module
const calendarModule = require('../bot/modules/calendarModule');

// Import pretty logger utility
const logger = require('../shared/utils/logger');

// Import Google Sheets utilities
const googleSheets = require('../shared/utils/googleSheetsUtils');
const { google } = require('googleapis');

// Import route modules
const characterRoutes = require('./routes/api/characters');
const itemRoutes = require('./routes/api/items');
const inventoryRoutes = require('./routes/api/inventory');
const weatherRoutes = require('./routes/api/weather');
const statsRoutes = require('./routes/api/stats');

// Import middleware
const { errorHandler, asyncHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger, errorLogger } = require('./middleware/requestLogger');
const { generalLimiter } = require('./middleware/rateLimiter');

// ------------------- Section: App Configuration -------------------
const app = express();
const PORT = process.env.PORT || 5001;

// ------------------- Section: Environment Configuration -------------------
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'true';

// Trust proxy for production environments (Railway, etc.)
if (isProduction) {
  app.set('trust proxy', 1);
}

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
// Import improved cache management
const {
  inventoryCache,
  characterListCache,
  characterDataCache,
  spiritOrbCache
} = require('../shared/utils/cache');

// Cache duration constants (in milliseconds)
const SPIRIT_ORB_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Legacy cache structure for backward compatibility (will be migrated gradually)
// These are now managed by the Cache utility above

// ------------------- Section: Database Initialization -------------------

// ------------------- Function: runMigrations -------------------
// Runs database migrations to update existing data
async function runMigrations() {
  try {
    logger.info('Running database migrations...', 'server.js');
    
    // Migration: Update homes pins color to lime green
    const Pin = require('../shared/models/PinModel');
    
    // Update from old gold color
    const result1 = await Pin.updateMany(
      { category: 'homes', color: '#FFD700' },
      { $set: { color: '#C5FF00' } }
    );
    
    // Update from cyan color
    const result2 = await Pin.updateMany(
      { category: 'homes', color: '#09A98E' },
      { $set: { color: '#C5FF00' } }
    );
    
    // Update from previous house color
    const result3 = await Pin.updateMany(
      { category: 'homes', color: '#EDAF12' },
      { $set: { color: '#C5FF00' } }
    );
    
    const totalUpdated = result1.modifiedCount + result2.modifiedCount + result3.modifiedCount;
    
    if (totalUpdated > 0) {
      logger.success(`Updated ${totalUpdated} homes pins to use lime green color #C5FF00`, 'server.js');
    } else {
      logger.info('No homes pins needed color update', 'server.js');
    }
    
  } catch (error) {
    logger.error('Migration failed:', error);
    // Don't throw error - migrations shouldn't break server startup
  }
}

// ------------------- Function: initializeDatabases -------------------
// Establishes connections to all required databases using db.js methods
async function initializeDatabases() {
  try {
    logger.divider('DATABASE INITIALIZATION');
    
    // Connect to Tinglebot database using db.js method
    await connectToTinglebot();
    logger.database('Connected to Tinglebot database', 'server.js');
    
    // Initialize VendingStock model (uses tinglebot database)
    try {
      await initializeVendingStockModel();
      logger.database('Initialized VendingStock model', 'server.js');
    } catch (vendingStockError) {
      logger.warn(`Failed to initialize VendingStock model: ${vendingStockError.message}`, 'server.js');
    }
    
    // Connect to Inventories database using db.js method
    try {
      inventoriesConnection = await connectToInventories();
      logger.database('Connected to Inventories database', 'server.js');
    } catch (inventoryError) {
      logger.warn(`Failed to connect to Inventories database: ${inventoryError.message}`, 'server.js');
      // Continue without inventories connection - spirit orb counting will fail gracefully
    }
    
    // Connect to Vending database using db.js method
    try {
      vendingConnection = await connectToVending();
      logger.database('Connected to Vending database', 'server.js');
    } catch (vendingError) {
      logger.warn(`Failed to connect to Vending database: ${vendingError.message}`, 'server.js');
      // Continue without vending connection
    }
    
    logger.success('All databases connected successfully!', 'server.js');
    
    // Run database migrations
    await runMigrations();
    
    logger.divider();
    
  } catch (error) {   
    logger.error('Database initialization failed', error);
    throw error;
  }
}

// ------------------- Section: Express Middleware -------------------
// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "https://kit.fontawesome.com", "https://cdn.jsdelivr.net", "https://unpkg.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://kit.fontawesome.com", "https://ka-f.fontawesome.com", "https://use.fontawesome.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      "img-src": ["'self'", "data:", "https://kit.fontawesome.com", "https://ka-f.fontawesome.com", "https://use.fontawesome.com", "https://cdn.discordapp.com", "https://storage.googleapis.com", "https://static.wixstatic.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      "font-src": ["'self'", "data:", "https://kit.fontawesome.com", "https://ka-f.fontawesome.com", "https://use.fontawesome.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      "connect-src": ["'self'", "https://kit.fontawesome.com", "https://ka-f.fontawesome.com", "https://use.fontawesome.com", "https://discord.com", "https://storage.googleapis.com", "https://cdn.jsdelivr.net", "https://unpkg.com"],
      "frame-ancestors": ["'none'"],
      "upgrade-insecure-requests": [],
      "script-src-attr": ["'unsafe-inline'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Additional security headers
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
app.use(helmet.noSniff());
app.use(helmet.frameguard({ action: "deny" }));
app.use(helmet.referrerPolicy({ policy: "no-referrer-when-downgrade" }));
// Permissions Policy header (restricts access to browser features)
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
  next();
});

// Compression middleware
app.use(compression());

// CORS and other middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : (isProduction ? ['https://tinglebot.xyz', 'https://www.tinglebot.xyz'] : ['http://localhost:5001', 'http://localhost:3000', 'http://127.0.0.1:5001', 'http://127.0.0.1:3000']);

// Helper function to check if request is for static file
function isStaticFile(path) {
  return path.startsWith('/js/') || 
         path.startsWith('/css/') || 
         path.startsWith('/images/') ||
         path.startsWith('/manifest/') ||
         path.endsWith('.js') ||
         path.endsWith('.css') ||
         path.endsWith('.png') ||
         path.endsWith('.jpg') ||
         path.endsWith('.jpeg') ||
         path.endsWith('.gif') ||
         path.endsWith('.svg') ||
         path.endsWith('.ico') ||
         path.endsWith('.json') ||
         path.endsWith('.woff') ||
         path.endsWith('.woff2') ||
         path.endsWith('.ttf');
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like same-origin requests, mobile apps, or curl requests)
    // Same-origin requests don't send an Origin header, so we should allow them
    if (!origin) {
      return callback(null, true);
    }
    
    // In development, allow all localhost and 127.0.0.1 origins
    if (!isProduction) {
      // Explicitly check for localhost and 127.0.0.1 with any port
      if (origin.startsWith('http://localhost') || 
          origin.startsWith('http://127.0.0.1') ||
          origin.startsWith('https://localhost') ||
          origin.startsWith('https://127.0.0.1')) {
        return callback(null, true);
      }
      // In development, be very permissive - allow all origins
      return callback(null, true);
    }
    
    // In production, check against allowed origins
    // Also check if origin matches localhost patterns (fallback)
    if (allowedOrigins.indexOf(origin) !== -1 ||
        origin.startsWith('http://localhost') || 
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('https://localhost') ||
        origin.startsWith('https://127.0.0.1')) {
      callback(null, true);
    } else {
      // Log the blocked origin for debugging
      logger.warn(`CORS blocked origin: ${origin}`, 'server.js');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow credentials in CORS requests
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------- Session Configuration -------------------
// Get MongoDB URI for session store (using same connection as Tinglebot database)
const getMongoUri = () => {
  return process.env.MONGODB_TINGLEBOT_URI_PROD 
    || process.env.MONGODB_TINGLEBOT_URI
    || process.env.MONGODB_URI;
};

app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-change-in-production',
  resave: false,
  saveUninitialized: true, // Changed to true to ensure session cookie is set immediately
  name: 'connect.sid', // Use default express-session cookie name
  store: MongoStore.create({
    mongoUrl: getMongoUri(),
    ttl: 30 * 24 * 60 * 60, // 30 days
    autoRemove: 'native'
  }),
  cookie: {
    secure: false, // Disable secure cookies for localhost (HTTP). Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax', // Use 'lax' for localhost, 'none' only needed for cross-origin in production with HTTPS
    path: '/' // Ensure cookie is available for all paths
  }
}));

// ------------------- Authentication Middleware -------------------
// Populates req.user from req.session.user and adds req.isAuthenticated()
app.use((req, res, next) => {
  // Populate req.user from session
  if (req.session && req.session.user) {
    req.user = req.session.user;
  }
  
  // Add isAuthenticated function (similar to passport.js)
  req.isAuthenticated = function() {
    return !!(this.session && this.session.user);
  };
  
  next();
});

// Serve static files (excluding /map route which needs authentication)
app.use((req, res, next) => {
  if (req.path === '/map' || req.path === '/map.html') {
    return next(); // Skip static serving for map routes
  }
  express.static(path.join(__dirname, 'public'))(req, res, next);
});
app.use('/images', express.static(path.join(__dirname, 'images')));

// Multer configuration for icon uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'images'));
  },
  filename: function (req, file, cb) {
    // Create a unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'character-icon-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed!'), false);
      return;
    }
    cb(null, true);
  }
});

// Multer configuration for pin image uploads to Google Cloud Storage
const pinImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed!'), false);
      return;
    }
    // Additional validation for image types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed!'), false);
      return;
    }
    cb(null, true);
  }
});

// Helper function to upload pin image to Google Cloud Storage
async function uploadPinImageToGCS(file, pinId) {
  try {
    if (!file) return null;
    
    const bucket = require('../shared/config/gcsService');
    const fileName = `tinglebot/mapUserImages/${pinId}_${Date.now()}_${Math.round(Math.random() * 1E9)}`;
    
    const fileUpload = bucket.file(fileName);
    
    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
          pinId: pinId
        }
      }
      // Removed public: true - using uniform bucket-level access instead of legacy ACLs
    });
    
    return new Promise((resolve, reject) => {
      stream.on('error', (error) => {
        logger.error('Error uploading pin image to GCS', error, 'server.js');
        reject(error);
      });
      
      stream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${process.env.GCP_BUCKET_NAME}/${fileName}`;
        resolve(publicUrl);
      });
      
      stream.end(file.buffer);
    });
  } catch (error) {
    logger.error('Error in uploadPinImageToGCS', error, 'server.js');
    throw error;
  }
}

// HTTPS redirect middleware (only in production)
if (isProduction) {
  app.use((req, res, next) => {
    const xfProto = req.headers["x-forwarded-proto"];
    if (xfProto && xfProto !== "https") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ------------------- Section: Page Routes -------------------

// ------------------- Function: serveIndexPage -------------------
// Serves the main dashboard page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ------------------- Function: serveMapPage -------------------
// Serves the fullscreen interactive map page (public access)
app.get('/map', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'map.html'));
});

app.get('/map.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'map.html'));
});

app.get('/inventories', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'inventories.html'));
});

app.get('/inventories.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'inventories.html'));
});

// ------------------- Section: Request Logging -------------------
// Add request logging middleware
app.use(requestLogger);

// ------------------- Section: Rate Limiting -------------------
// Apply rate limiting to API routes
app.use('/api', generalLimiter);
// ------------------- Section: Route Mounting -------------------
// Mount route modules
app.use('/api/characters', characterRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/stats', statsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'Server is running'
  });
});

// Check if marker image is empty
app.get('/api/check-marker/:markerType/:squareId', async (req, res) => {
  try {
    const { markerType, squareId } = req.params;
    
    // Map marker types to their folder names
    const markerFolders = {
      'rudania': 'MAP_0001s_0000_Rudania-Marker',
      'inariko': 'MAP_0001s_0001_Inariko-Marker', 
      'vhintl': 'MAP_0001s_0002_Vhintl-Marker'
    };
    
    const folder = markerFolders[markerType];
    if (!folder) {
      return res.status(400).json({ 
        error: 'Invalid marker type', 
        validTypes: Object.keys(markerFolders) 
      });
    }
    
    const markerUrl = `https://storage.googleapis.com/tinglebot/maps/squares/${folder}/${folder}_${squareId}.png`;
    
    // Make HEAD request to check if image exists and get size
    const response = await fetch(markerUrl, { method: 'HEAD' });
    
    if (!response.ok) {
      return res.json({ 
        markerType,
        squareId, 
        exists: false, 
        isEmpty: true,
        reason: 'Image not found or inaccessible'
      });
    }
    
    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type');
    
    // If it's a PNG but very small (likely empty), mark as empty
    // Use 80,000+ bytes threshold for substantial marker content
    if (contentType === 'image/png' && contentLength && parseInt(contentLength) < 80000) {
      return res.json({ 
        markerType,
        squareId, 
        exists: true, 
        isEmpty: true,
        size: contentLength,
        reason: 'Image too small (less than 80KB - likely empty)'
      });
    }
    
    res.json({ 
      markerType,
      squareId, 
      exists: true, 
      isEmpty: false,
      size: contentLength,
      contentType: contentType
    });
    
  } catch (error) {
    console.error(`Error checking marker for ${req.params.squareId}:`, error);
    res.json({ 
      squareId: req.params.squareId, 
      exists: false, 
      isEmpty: true,
      reason: 'Error checking image',
      error: error.message
    });
  }
});

// Village bounds endpoint - check if village bounds image exists and has content
app.get('/api/check-village-bounds/:village/:color/:squareId', async (req, res) => {
  try {
    const { village, color, squareId } = req.params;
    
    // Map village and color to their folder names
    const villageBoundsFolders = {
      'inariko': {
        'cyan': 'MAP_0002s_0000s_0000_CIRCLE-INARIKO-CYAN',
        'pink': 'MAP_0002s_0000s_0001_CIRCLE-INARIKO-PINK'
      },
      'vhintl': {
        'cyan': 'MAP_0002s_0001s_0000_CIRCLE-VHINTL-CYAN',
        'pink': 'MAP_0002s_0001s_0001_CIRCLE-VHINTL-PINK'
      },
      'rudania': {
        'cyan': 'MAP_0002s_0002s_0000_CIRCLE-RUDANIA-CYAN',
        'pink': 'MAP_0002s_0002s_0001_CIRCLE-RUDANIA-PINK'
      }
    };
    
    const folder = villageBoundsFolders[village]?.[color];
    if (!folder) {
      return res.status(400).json({ 
        error: 'Invalid village or color', 
        validVillages: Object.keys(villageBoundsFolders),
        validColors: ['cyan', 'pink']
      });
    }
    
    const boundsUrl = `https://storage.googleapis.com/tinglebot/maps/squares/${folder}/${folder}_${squareId}.png`;
    
    // Make HEAD request to check if image exists and get size
    const response = await fetch(boundsUrl, { method: 'HEAD' });
    
    if (!response.ok) {
      return res.json({ 
        village,
        color,
        squareId, 
        exists: false, 
        isEmpty: true,
        reason: 'Image not found or inaccessible'
      });
    }
    
    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type');
    
    // If it's a PNG but very small (likely empty), mark as empty
    // Use 25,000+ bytes threshold for substantial village bounds content
    if (contentType === 'image/png' && contentLength && parseInt(contentLength) < 25000) {
      return res.json({ 
        village,
        color,
        squareId, 
        exists: true, 
        isEmpty: true,
        size: contentLength,
        reason: 'Image too small (less than 25KB - likely empty)'
      });
    }
    
    res.json({ 
      village,
      color,
      squareId, 
      exists: true, 
      isEmpty: false,
      size: contentLength,
      contentType: contentType
    });
    
  } catch (error) {
    console.error(`Error checking village bounds for ${req.params.squareId}:`, error);
    res.json({ 
      squareId: req.params.squareId, 
      exists: false, 
      isEmpty: true,
      reason: 'Error checking image',
      error: error.message
    });
  }
});

// Regions names endpoint - check if regions names image exists and has content
app.get('/api/check-regions-names/:squareId', async (req, res) => {
  try {
    const { squareId } = req.params;
    
    const regionsUrl = `https://storage.googleapis.com/tinglebot/maps/squares/MAP_0001s_0004_REGIONS-NAMES/MAP_0001s_0004_REGIONS-NAMES_${squareId}.png`;
    
    // Make HEAD request to check if image exists and get size
    const response = await fetch(regionsUrl, { method: 'HEAD' });
    
    if (!response.ok) {
      return res.json({ 
        squareId, 
        exists: false, 
        isEmpty: true,
        reason: 'Image not found or inaccessible'
      });
    }
    
    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type');
    
    // If it's a PNG but very small (likely empty), mark as empty
    // Use 25,000+ bytes threshold for substantial regions names content
    if (contentType === 'image/png' && contentLength && parseInt(contentLength) < 25000) {
      return res.json({ 
        squareId, 
        exists: true, 
        isEmpty: true,
        size: contentLength,
        reason: 'Image too small (less than 25KB - likely empty)'
      });
    }
    
    res.json({ 
      squareId, 
      exists: true, 
      isEmpty: false,
      size: contentLength,
      contentType: contentType
    });
    
  } catch (error) {
    console.error(`Error checking regions names for ${req.params.squareId}:`, error);
    res.json({ 
      squareId: req.params.squareId, 
      exists: false, 
      isEmpty: true,
      reason: 'Error checking image',
      error: error.message
    });
  }
});

// Region borders endpoint - check if region borders image exists and has content
app.get('/api/check-region-borders/:squareId', async (req, res) => {
  try {
    const { squareId } = req.params;
    
    const bordersUrl = `https://storage.googleapis.com/tinglebot/maps/squares/MAP_0001s_0003_Region-Borders/MAP_0001s_0003_Region-Borders_${squareId}.png`;
    
    // Make HEAD request to check if image exists and get size
    const response = await fetch(bordersUrl, { method: 'HEAD' });
    
    if (!response.ok) {
      return res.json({ 
        squareId, 
        exists: false, 
        isEmpty: true,
        reason: 'Image not found or inaccessible'
      });
    }
    
    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type');
    
    // If it's a PNG but very small (likely empty), mark as empty
    // Use 25,000+ bytes threshold for substantial region borders content
    if (contentType === 'image/png' && contentLength && parseInt(contentLength) < 25000) {
      return res.json({ 
        squareId, 
        exists: true, 
        isEmpty: true,
        size: contentLength,
        reason: 'Image too small (less than 25KB - likely empty)'
      });
    }
    
    res.json({ 
      squareId, 
      exists: true, 
      isEmpty: false,
      size: contentLength,
      contentType: contentType
    });
    
  } catch (error) {
    console.error(`Error checking region borders for ${req.params.squareId}:`, error);
    res.json({ 
      squareId: req.params.squareId, 
      exists: false, 
      isEmpty: true,
      reason: 'Error checking image',
      error: error.message
    });
  }
});

// Paths/roads endpoint - check if paths/roads image exists and has content
app.get('/api/check-paths-roads/:pathType/:squareId', async (req, res) => {
  try {
    const { pathType, squareId } = req.params;
    
    // Map path types to their folder names
    const pathFolders = {
      'psl': 'MAP_0003s_0000_PSL',
      'ldw': 'MAP_0003s_0001_LDW',
      'otherPaths': 'MAP_0003s_0002_Other-Paths'
    };
    
    const folder = pathFolders[pathType];
    if (!folder) {
      return res.status(400).json({ 
        error: 'Invalid path type', 
        validTypes: Object.keys(pathFolders) 
      });
    }
    
    const pathUrl = `https://storage.googleapis.com/tinglebot/maps/squares/${folder}/${folder}_${squareId}.png`;
    
    // Make HEAD request to check if image exists and get size
    const response = await fetch(pathUrl, { method: 'HEAD' });
    
    if (!response.ok) {
      return res.json({ 
        pathType,
        squareId, 
        exists: false, 
        isEmpty: true,
        reason: 'Image not found or inaccessible'
      });
    }
    
    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type');
    
    // If it's a PNG but very small (likely empty), mark as empty
    // Use 25,000+ bytes threshold for substantial paths/roads content
    if (contentType === 'image/png' && contentLength && parseInt(contentLength) < 25000) {
      return res.json({ 
        pathType,
        squareId, 
        exists: true, 
        isEmpty: true,
        size: contentLength,
        reason: 'Image too small (less than 25KB - likely empty)'
      });
    }
    
    res.json({ 
      pathType,
      squareId, 
      exists: true, 
      isEmpty: false,
      size: contentLength,
      contentType: contentType
    });
    
  } catch (error) {
    console.error(`Error checking paths/roads for ${req.params.squareId}:`, error);
    res.json({ 
      squareId: req.params.squareId, 
      exists: false, 
      isEmpty: true,
      reason: 'Error checking image',
      error: error.message
    });
  }
});

// Test API page
app.get('/test-api', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-api.html'));
});

// Marker test page
app.get('/test-markers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-markers.html'));
});

// Privacy page
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

// Contact page
app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// ------------------- Function: serveDashboardPage -------------------
// Serves the main dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ------------------- Section: API Routes -------------------

// ------------------- Health Check Endpoint -------------------
app.get('/api/health', (req, res) => {
  // Always return 200 OK - server is running even if databases aren't ready
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      tinglebot: mongoose.connection.readyState === 1 ? 'connected' : 'initializing',
      inventories: inventoriesConnection ? 'connected' : 'initializing',
      vending: vendingConnection ? 'connected' : 'initializing'
    },
    models: {
      character: Character ? 'loaded' : 'not loaded',
      user: User ? 'loaded' : 'not loaded'
    }
  };
  
  res.status(200).json(health);
});

// ------------------- User Authentication Status -------------------

// ------------------- Section: User Lookup API Routes -------------------

// ------------------- Function: searchUsers -------------------
// Search users by username or Discord ID
app.get('/api/users/search', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters long' });
    }

    const searchRegex = new RegExp(query, 'i');
    
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { discordId: searchRegex }
      ]
    })
    .select('discordId username discriminator avatar tokens characterSlot status createdAt nickname')
    .sort({ createdAt: -1, discordId: 1 })
    .limit(50)
    .lean();

    // Get character counts for each user
    const usersWithCharacters = await Promise.all(
      users.map(async (user) => {
        const characterCount = await Character.countDocuments({ 
          userId: user.discordId,
          name: { $nin: ['Tingle', 'Tingle test', 'John'] }
        });
        return {
          ...user,
          characterCount
        };
      })
    );

    res.json({ users: usersWithCharacters });
  } catch (error) {
    logger.error('Error searching users', error, 'server.js');
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// ------------------- Function: getAllUsers -------------------
// Get all users with pagination
app.get('/api/users', async (req, res) => {
  try {
    const allItems = req.query.all === 'true';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get all unique users
    const allUsers = await User.aggregate([
      {
        $group: {
          _id: '$discordId',
          username: { $first: '$username' },
          nickname: { $first: '$nickname' },
          discriminator: { $first: '$discriminator' },
          avatar: { $first: '$avatar' },
          tokens: { $first: '$tokens' },
          characterSlot: { $first: '$characterSlot' },
          status: { $first: '$status' },
          createdAt: { $first: '$createdAt' }
        }
      },
      {
        $sort: { createdAt: -1, _id: 1 }
      }
    ]);

    // If all=true, return all users without pagination
    if (allItems) {
      const usersWithCharacters = await Promise.all(
        allUsers.map(async (user) => {
          const characterCount = await Character.countDocuments({ 
            userId: user._id,
            name: { $nin: ['Tingle', 'Tingle test', 'John'] }
          });
          return {
            discordId: user._id,
            username: user.username,
            nickname: user.nickname,
            discriminator: user.discriminator,
            avatar: user.avatar,
            tokens: user.tokens,
            characterSlot: user.characterSlot,
            status: user.status,
            createdAt: user.createdAt,
            characterCount
          };
        })
      );

      return res.json({ users: usersWithCharacters });
    }

    // Apply pagination
    const totalUsers = allUsers.length;
    const paginatedUsers = allUsers.slice(skip, skip + limit);

    // Get character counts for paginated users
    const usersWithCharacters = await Promise.all(
      paginatedUsers.map(async (user) => {
        const characterCount = await Character.countDocuments({ 
          userId: user._id,
          name: { $nin: ['Tingle', 'Tingle test', 'John'] }
        });
        return {
          discordId: user._id,
          username: user.username,
          nickname: user.nickname,
          discriminator: user.discriminator,
          avatar: user.avatar,
          tokens: user.tokens,
          characterSlot: user.characterSlot,
          status: user.status,
          createdAt: user.createdAt,
          characterCount
        };
      })
    );

    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      users: usersWithCharacters,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    logger.error('Error fetching users', error, 'server.js');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ------------------- Function: getUserDetails -------------------
// Get detailed user information including characters
app.get('/api/users/:discordId', async (req, res) => {
  try {
    const { discordId } = req.params;

    const user = await User.findOne({ discordId })
      .select('discordId username discriminator avatar tokens characterSlot status createdAt nickname')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's characters
    const characters = await Character.find({ 
      userId: discordId,
      name: { $nin: ['Tingle', 'Tingle test', 'John'] }
    })
      .select('name icon job homeVillage currentVillage race inventory appLink _id currentHearts maxHearts currentStamina maxStamina')
      .lean();

    res.json({
      user: {
        ...user,
        characterCount: characters.length
      },
      characters
    });
  } catch (error) {
    logger.error('Error fetching user details', error, 'server.js');
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
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


// ------------------- Section: Statistics API Routes -------------------

// ------------------- Function: getRootsOfTheWildStats -------------------
// Returns statistics for Roots of the Wild game data
app.get('/api/rootsofthewild/stats', async (req, res) => {
  try {
    // Count active quests that haven't expired
    const allActiveQuests = await Quest.find({ status: 'active' }).select('timeLimit postedAt createdAt').lean();
    const trulyActiveQuests = allActiveQuests.filter(quest => !checkQuestExpiration(quest));
    
    const [totalCharacters, totalItems, activeMonsters] = await Promise.all([
      Character.countDocuments({ name: { $nin: ['Tingle', 'Tingle test', 'John'] } }),
      Item.countDocuments(),
      Monster.countDocuments({ isActive: true })
    ]);
    
    const activeQuests = trulyActiveQuests.length;
    res.json({ totalCharacters, activeQuests, totalItems, activeMonsters });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch RootsOfTheWild stats' });
  }
});

// ------------------- Function: getTinglebotStats -------------------
// Returns statistics for Tinglebot system data
app.get('/api/tinglebot/stats', async (req, res) => {
  try {
    const [totalUsers, activePets, totalMounts, villageShops] = await Promise.all([
      User.countDocuments(),
              Pet.countDocuments({ status: 'active' }),
      Mount.countDocuments(),
      VillageShops.countDocuments()
    ]);
    res.json({ totalUsers, activePets, totalMounts, villageShops });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Tinglebot statistics' });
  }
});

// ------------------- Function: getCharacterStats -------------------
// Returns comprehensive character statistics and analytics
app.get('/api/stats/characters', async (req, res) => {
  try {
    // Get both regular and mod characters for total count
    const [regularCharacters, modCharacters] = await Promise.all([
      Character.find({ name: { $nin: ['Tingle', 'Tingle test', 'John'] } }).lean(),
      ModCharacter.find({}).lean()
    ]);
    
    const totalCharacters = regularCharacters.length + modCharacters.length;
    const allCharacters = [...regularCharacters, ...modCharacters];

    // Get characters per village (including mod characters)
    const perVillageAgg = await Character.aggregate([
      { $match: { 
        homeVillage: { $exists: true, $ne: null },
        name: { $nin: ['Tingle', 'Tingle test', 'John'] }
      } },
      { $group: { _id: { $toLower: { $ifNull: ["$homeVillage", "unknown"] } }, count: { $sum: 1 } } }
    ]);
    
    // Also count mod characters per village
    const modCharactersPerVillage = {};
    modCharacters.forEach(char => {
      if (char && char.homeVillage && typeof char.homeVillage === 'string') {
        const village = char.homeVillage.toLowerCase();
        modCharactersPerVillage[village] = (modCharactersPerVillage[village] || 0) + 1;
      }
    });
    
    const charactersPerVillage = { rudania: 0, inariko: 0, vhintl: 0 };
    perVillageAgg.forEach(r => {
      if (charactersPerVillage[r._id] !== undefined) charactersPerVillage[r._id] = r.count;
    });
    
    // Add mod characters to village counts
    Object.keys(charactersPerVillage).forEach(village => {
      charactersPerVillage[village] += (modCharactersPerVillage[village] || 0);
    });

    // Get characters per race (including mod characters)
    const perRaceAgg = await Character.aggregate([
      { 
        $match: { 
          race: { 
            $exists: true, 
            $ne: null, 
            $ne: '',
            $ne: 'undefined',
            $ne: 'null',
            $ne: 'Unknown',
            $ne: 'unknown'
          },
          name: { $nin: ['Tingle', 'Tingle test', 'John'] }
        } 
      },
      { $group: { _id: "$race", count: { $sum: 1 } } }
    ]);
    
    // Also count mod characters per race
    const modCharactersPerRace = {};
    modCharacters.forEach(char => {
      if (char && char.race && 
          typeof char.race === 'string' &&
          char.race !== 'undefined' && 
          char.race !== 'null' && 
          char.race !== 'Unknown' && 
          char.race !== 'unknown' &&
          char.race.trim() !== '') {
        modCharactersPerRace[char.race] = (modCharactersPerRace[char.race] || 0) + 1;
      }
    });
    
    const charactersPerRace = {};
    perRaceAgg.forEach(r => {
      if (r && r._id && 
          typeof r._id === 'string' &&
          r._id !== 'undefined' && 
          r._id !== 'null' && 
          r._id !== 'Unknown' && 
          r._id !== 'unknown' &&
          r._id.trim() !== '') {
        charactersPerRace[r._id] = r.count;
      }
    });
    
    // Add mod characters to race counts
    Object.keys(modCharactersPerRace).forEach(race => {
      charactersPerRace[race] = (charactersPerRace[race] || 0) + modCharactersPerRace[race];
    });



    // Get characters per job (including mod characters)
    const perJobAgg = await Character.aggregate([
      { $match: { 
        job: { $exists: true, $ne: null, $ne: '' },
        name: { $nin: ['Tingle', 'Tingle test', 'John'] }
      } },
      { $project: { job: { $toLower: { $ifNull: ["$job", "unknown"] } } } },
      { $group: { _id: { $concat: [{ $toUpper: { $substr: ["$job", 0, 1] } }, { $substr: ["$job", 1, { $strLenCP: "$job" }] }] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Also count mod characters per job
    const modCharactersPerJob = {};
    modCharacters.forEach(char => {
      if (char && char.job && 
          typeof char.job === 'string' &&
          char.job !== 'undefined' && 
          char.job !== 'null' && 
          char.job !== 'Unknown' && 
          char.job !== 'unknown' &&
          char.job.trim() !== '') {
        const jobKey = char.job.charAt(0).toUpperCase() + char.job.slice(1).toLowerCase();
        modCharactersPerJob[jobKey] = (modCharactersPerJob[jobKey] || 0) + 1;
      }
    });
    
    const charactersPerJob = {};
    perJobAgg.forEach(r => {
      if (r && r._id && 
          typeof r._id === 'string' &&
          r._id !== 'undefined' && 
          r._id !== 'null' && 
          r._id !== 'unknown' && 
          r._id !== 'Unknown' &&
          r._id.trim() !== '') {
        charactersPerJob[r._id] = r.count;
      }
    });
    
    // Add mod characters to job counts
    Object.keys(modCharactersPerJob).forEach(job => {
      charactersPerJob[job] = (charactersPerJob[job] || 0) + modCharactersPerJob[job];
    });


    // Get upcoming birthdays (including mod characters)
    const today = new Date();
    const thisYr = today.getFullYear();
    const allBday = await Character.find({ 
      birthday: { $exists: true, $ne: '' },
      name: { $nin: ['Tingle', 'Tingle test', 'John'] }
    }, { name: 1, birthday: 1 }).lean();
    
    // Add mod character birthdays
    const modBday = modCharacters.filter(c => c && c.birthday && typeof c.birthday === 'string' && c.birthday !== '').map(c => ({
      name: c.name,
      birthday: c.birthday
    }));
    
    const allBirthdays = [...allBday, ...modBday];
    const upcoming = allBirthdays
      .filter(c => c && c.birthday && typeof c.birthday === 'string' && c.birthday.length >= 5)
      .map(c => {
        try {
          const mmdd = c.birthday.slice(-5);
          let next = isNaN(Date.parse(`${thisYr}-${mmdd}`))
            ? null
            : new Date(`${thisYr}-${mmdd}`);
          if (next && next < today) next.setFullYear(thisYr + 1);
          return { name: c.name, birthday: c.birthday, nextBirthday: next };
        } catch (error) {
          console.warn(`[server.js]: ⚠️ Error processing birthday for ${c.name}:`, error.message);
          return { name: c.name, birthday: c.birthday, nextBirthday: null };
        }
      })
      .filter(c => c.nextBirthday && (c.nextBirthday - today) <= (30 * 24 * 60 * 60 * 1000))
      .sort((a, b) => a.nextBirthday - b.nextBirthday);

    // Get visiting counts and details (including mod characters)
    const villages = ['rudania', 'inariko', 'vhintl'];
    const visitingAgg = await Character.aggregate([
      { $match: { 
        currentVillage: { $in: villages }, 
        homeVillage: { $in: villages, $ne: null }, 
        $expr: { $ne: ['$currentVillage', '$homeVillage'] },
        name: { $nin: ['Tingle', 'Tingle test', 'John'] }
      } },
      { $group: { _id: '$currentVillage', count: { $sum: 1 } } }
    ]);
    
    // Also count mod characters visiting other villages
    const modVisitingCounts = { rudania: 0, inariko: 0, vhintl: 0 };
    modCharacters.forEach(char => {
      if (char && char.currentVillage && char.homeVillage && 
          typeof char.currentVillage === 'string' &&
          typeof char.homeVillage === 'string' &&
          villages.includes(char.currentVillage.toLowerCase()) && 
          villages.includes(char.homeVillage.toLowerCase()) &&
          char.currentVillage.toLowerCase() !== char.homeVillage.toLowerCase()) {
        const currentVillage = char.currentVillage.toLowerCase();
        modVisitingCounts[currentVillage]++;
      }
    });
    
    const visitingCounts = { rudania: 0, inariko: 0, vhintl: 0 };
    visitingAgg.forEach(r => visitingCounts[r._id] = r.count);
    
    // Add mod character visiting counts
    Object.keys(visitingCounts).forEach(village => {
      visitingCounts[village] += modVisitingCounts[village];
    });

    // Get detailed visiting characters
    const visitingCharacters = await Character.find(
      { 
        currentVillage: { $in: villages }, 
        homeVillage: { $in: villages, $ne: null }, 
        $expr: { $ne: ['$currentVillage', '$homeVillage'] },
        name: { $nin: ['Tingle', 'Tingle test', 'John'] }
      },
      { name: 1, currentVillage: 1, homeVillage: 1 }
    ).lean();

    // Add mod characters visiting other villages
    const modVisitingCharacters = modCharacters.filter(char => 
      char && char.currentVillage && char.homeVillage && 
      typeof char.currentVillage === 'string' &&
      typeof char.homeVillage === 'string' &&
      villages.includes(char.currentVillage.toLowerCase()) && 
      villages.includes(char.homeVillage.toLowerCase()) &&
      char.currentVillage.toLowerCase() !== char.homeVillage.toLowerCase()
    ).map(char => ({
      name: char.name,
      currentVillage: char.currentVillage,
      homeVillage: char.homeVillage
    }));

    // Group visiting characters by current village
    const visitingDetails = { rudania: [], inariko: [], vhintl: [] };
    [...visitingCharacters, ...modVisitingCharacters].forEach(char => {
      if (char && char.currentVillage && typeof char.currentVillage === 'string') {
        const currentVillage = char.currentVillage.toLowerCase();
        if (visitingDetails[currentVillage]) {
          visitingDetails[currentVillage].push({
            name: char.name || 'Unknown',
            homeVillage: char.homeVillage || 'Unknown'
          });
        }
      }
    });

    // Get top characters by various stats
    const getTop = async (field) => {
      const top = await Character.find({ 
        [field]: { $gt: 0 },
        name: { $nin: ['Tingle', 'Tingle test', 'John'] }
      })
        .sort({ [field]: -1 })
        .limit(5)
        .select({ name: 1, [field]: 1 })
        .lean();
      
      if (!top.length) return { names: [], value: 0 };
      
      // Return all top characters with their individual values
      const names = top.map(c => c.name);
      const values = top.map(c => c[field]);
      
      return { names, values, value: top[0][field] }; // Keep 'value' for backward compatibility
    };

    // Get top characters by stamina and hearts (from character model)
    const [mostStamina, mostHearts] = await Promise.all([
      getTop('maxStamina'),
      getTop('maxHearts')
    ]);

    // Get top characters by spirit orbs (from inventory, including mod characters)
    let mostOrbs = { names: [], values: [], value: 0 };
    try {
      const regularCharacterNames = regularCharacters.map(c => c.name).filter(name => name);
      const modCharacterNames = modCharacters.map(c => c.name).filter(name => name);
      const allCharacterNames = [...regularCharacterNames, ...modCharacterNames];
      
      if (allCharacterNames.length > 0) {
        const spiritOrbCounts = await countSpiritOrbsBatch(allCharacterNames);
        
        // Sort characters by spirit orb count and get top 5
        const charactersWithOrbs = Object.entries(spiritOrbCounts)
          .filter(([_, count]) => count > 0)
          .sort(([_, a], [__, b]) => b - a)
          .slice(0, 5);
        
        if (charactersWithOrbs.length > 0) {
          mostOrbs = {
            names: charactersWithOrbs.map(([name, _]) => name),
            values: charactersWithOrbs.map(([_, count]) => count),
            value: charactersWithOrbs[0][1]
          };
        }
      }
    } catch (spiritOrbError) {
      console.warn('[server.js]: ⚠️ Error counting spirit orbs for stats, using defaults:', spiritOrbError.message);
      // Continue with default empty values
    }

    // Get special character counts (mod characters are immune to negative effects)
    const [kodCount, blightedCount, debuffedCount, jailedCount] = await Promise.all([
      Character.countDocuments({ ko: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } }),
      Character.countDocuments({ blighted: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } }),
      Character.countDocuments({ 'debuff.active': true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } }),
      Character.countDocuments({ inJail: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } })
    ]);

    // Get debuffed characters details
    const debuffedCharacters = await Character.find(
      { 'debuff.active': true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } },
      { name: 1, 'debuff.endDate': 1 }
    ).lean();

    // Get KO'd and blighted characters details
    const kodCharacters = await Character.find(
      { ko: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } },
      { name: 1, lastRollDate: 1, ko: 1 }
    ).lean();
    const blightedCharacters = await Character.find(
      { blighted: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } },
      { name: 1, blightedAt: 1, blighted: 1 }
    ).lean();

    // Get jailed characters details
    const jailedCharacters = await Character.find(
      { inJail: true, name: { $nin: ['Tingle', 'Tingle test', 'John'] } },
      { name: 1, jailReleaseTime: 1, currentVillage: 1, homeVillage: 1 }
    ).lean();

    // Get mod character statistics
    const modCharacterStats = {
      totalModCharacters: modCharacters.length,
      modCharactersPerType: {},
      modCharactersPerVillage: {}
    };
    
    // Count mod characters by type
    modCharacters.forEach(char => {
      if (char && char.modType) {
        modCharacterStats.modCharactersPerType[char.modType] = (modCharacterStats.modCharactersPerType[char.modType] || 0) + 1;
      }
      if (char && char.homeVillage && typeof char.homeVillage === 'string') {
        const village = char.homeVillage.toLowerCase();
        modCharacterStats.modCharactersPerVillage[village] = (modCharacterStats.modCharactersPerVillage[village] || 0) + 1;
      }
    });

    res.json({
      totalCharacters,
      charactersPerVillage,
      charactersPerRace,
      charactersPerJob,
      upcomingBirthdays: upcoming,
      visitingCounts,
      visitingDetails,
      mostStaminaChar: mostStamina,
      mostHeartsChar: mostHearts,
      mostOrbsChar: mostOrbs,
      kodCount,
      blightedCount,
      debuffedCount,
      jailedCount,
      debuffedCharacters,
      kodCharacters,
      blightedCharacters,
      jailedCharacters,
      modCharacterStats,
      timestamp: Date.now() // Add timestamp for cache busting
    });
  } catch (error) {
    logger.error('Error fetching character stats', error, 'server.js');
    console.error('[server.js]: Full error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      error: 'Failed to fetch character stats',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ------------------- Function: getStealCooldowns -------------------
// Returns steal cooldown information for a character
app.get('/api/steal/cooldowns/:characterId', async (req, res) => {
  try {
    const { characterId } = req.params;
    const userId = req.user.discordId;

    // Find character and verify ownership
    let character = await Character.findById(characterId).lean();
    if (!character) {
      character = await ModCharacter.findById(characterId).lean();
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Verify ownership
    if (character.userId && character.userId.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Helper function to format cooldown time
    const formatCooldownTime = (timeLeft) => {
      const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
      const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      
      if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
      } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else {
        return `${minutes}m`;
      }
    };

    const cooldowns = {
      npcs: [],
      players: []
    };

    // Get all NPCs
    const NPC = require('../shared/models/NPCModel');
    const allNPCs = await NPC.find({});
    
    for (const npc of allNPCs) {
      // Check global protection
      let globalCooldown = null;
      if (npc.stealProtection?.isProtected && !npc.isProtectionExpired()) {
        const timeLeft = npc.getProtectionTimeLeft();
        globalCooldown = {
          active: true,
          timeLeft: timeLeft,
          formatted: formatCooldownTime(timeLeft),
          type: 'global'
        };
      }

      // Check personal lockout
      let personalCooldown = null;
      const personalLockout = npc.personalLockouts?.find(lockout => 
        lockout.characterId.toString() === characterId && 
        lockout.lockoutEndTime > new Date()
      );
      
      if (personalLockout) {
        const timeLeft = personalLockout.lockoutEndTime.getTime() - Date.now();
        personalCooldown = {
          active: true,
          timeLeft: timeLeft,
          formatted: formatCooldownTime(timeLeft),
          type: 'personal'
        };
      }

      // Only include NPCs that have at least one active cooldown
      if (globalCooldown || personalCooldown) {
        cooldowns.npcs.push({
          name: npc.name,
          global: globalCooldown,
          personal: personalCooldown
        });
      }
    }

    // Get all player characters that have protection
    const protectedCharacters = await Character.find({
      'stealProtection.isProtected': true,
      _id: { $ne: characterId } // Exclude self
    });

    for (const char of protectedCharacters) {
      // Check if protection is still active
      if (char.stealProtection?.isProtected && !char.isProtectionExpired()) {
        const timeLeft = char.getProtectionTimeLeft();
        if (timeLeft > 0) {
          cooldowns.players.push({
            name: char.name,
            global: {
              active: true,
              timeLeft: timeLeft,
              formatted: formatCooldownTime(timeLeft),
              type: 'global'
            }
          });
        }
      }
    }

    // Sort by name
    cooldowns.npcs.sort((a, b) => a.name.localeCompare(b.name));
    cooldowns.players.sort((a, b) => a.name.localeCompare(b.name));

    res.json(cooldowns);
  } catch (error) {
    logger.error('Error fetching steal cooldowns', error, 'server.js');
    res.status(500).json({ 
      error: 'Failed to fetch steal cooldowns',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ------------------- Function: getHWQStats -------------------
// Returns comprehensive Help Wanted Quest statistics
app.get('/api/stats/hwqs', async (req, res) => {
  try {
    // Fetch all HWQs
    const allHWQs = await HelpWantedQuest.find({}).lean();
    
    const totalQuests = allHWQs.length;
    const completedQuests = allHWQs.filter(q => q.completed).length;
    const activeQuests = totalQuests - completedQuests;
    const completionRate = totalQuests > 0 ? ((completedQuests / totalQuests) * 100).toFixed(1) : 0;
    
    // Count unique users who have completed quests
    const uniqueCompleters = new Set();
    allHWQs.forEach(q => {
      if (q.completed && q.completedBy && q.completedBy.userId) {
        uniqueCompleters.add(q.completedBy.userId);
      }
    });
    const uniqueCompleterCount = uniqueCompleters.size;
    
    // Quests per village
    const questsPerVillage = { Rudania: 0, Inariko: 0, Vhintl: 0 };
    allHWQs.forEach(q => {
      if (q.village) {
        questsPerVillage[q.village] = (questsPerVillage[q.village] || 0) + 1;
      }
    });
    
    // Quests per type
    const questsPerType = {};
    allHWQs.forEach(q => {
      if (q.type) {
        questsPerType[q.type] = (questsPerType[q.type] || 0) + 1;
      }
    });
    
    // Quests per NPC
    const questsPerNPC = {};
    allHWQs.forEach(q => {
      if (q.npcName) {
        questsPerNPC[q.npcName] = (questsPerNPC[q.npcName] || 0) + 1;
      }
    });
    
    // Top NPCs who requested the most quests
    const topNPCs = Object.entries(questsPerNPC)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([npc, count]) => ({ npc, count }));
    
    // Completion stats per user with detailed breakdown
    const completionsPerUser = {};
    const userQuestDetails = {};
    
    allHWQs.forEach(q => {
      if (q.completed && q.completedBy && q.completedBy.userId) {
        const userId = q.completedBy.userId;
        const characterId = q.completedBy.characterId;
        
        // Count total completions
        completionsPerUser[userId] = (completionsPerUser[userId] || 0) + 1;
        
        // Track detailed quest info per user
        if (!userQuestDetails[userId]) {
          userQuestDetails[userId] = {
            byType: {},
            byVillage: {},
            byCharacter: {},
            characters: new Set()
          };
        }
        
        // Count by type
        userQuestDetails[userId].byType[q.type] = (userQuestDetails[userId].byType[q.type] || 0) + 1;
        
        // Count by village
        userQuestDetails[userId].byVillage[q.village] = (userQuestDetails[userId].byVillage[q.village] || 0) + 1;
        
        // Count by character
        if (characterId) {
          userQuestDetails[userId].byCharacter[characterId] = (userQuestDetails[userId].byCharacter[characterId] || 0) + 1;
          userQuestDetails[userId].characters.add(characterId);
        }
      }
    });
    
    // Top completers
    const topCompleters = Object.entries(completionsPerUser)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));
    
    // Fetch usernames for top completers
    const topCompleterUserIds = topCompleters.map(t => t.userId);
    const users = await User.find({ discordId: { $in: topCompleterUserIds } })
      .select('discordId username nickname')
      .lean();
    
    const userMap = {};
    users.forEach(u => {
      userMap[u.discordId] = u.nickname || u.username || u.discordId;
    });
    
    // Get all unique character IDs from top completers
    const allCharacterIds = new Set();
    topCompleterUserIds.forEach(userId => {
      if (userQuestDetails[userId]) {
        userQuestDetails[userId].characters.forEach(charId => allCharacterIds.add(charId));
      }
    });
    
    // Fetch character names
    const characters = await Character.find({ _id: { $in: Array.from(allCharacterIds) } })
      .select('_id name job')
      .lean();
    
    const characterMap = {};
    characters.forEach(c => {
      characterMap[c._id.toString()] = { name: c.name, job: c.job };
    });
    
    const topCompletersWithDetails = topCompleters.map(t => {
      const details = userQuestDetails[t.userId] || {};
      
      // Find favorite quest type
      const typeEntries = Object.entries(details.byType || {});
      const favoriteType = typeEntries.length > 0 
        ? typeEntries.sort(([,a], [,b]) => b - a)[0][0]
        : null;
      
      // Find most used character
      const charEntries = Object.entries(details.byCharacter || {});
      const topCharacterId = charEntries.length > 0
        ? charEntries.sort(([,a], [,b]) => b - a)[0][0]
        : null;
      const topCharacter = topCharacterId ? characterMap[topCharacterId] : null;
      
      return {
        userId: t.userId,
        username: userMap[t.userId] || 'Unknown User',
        count: t.count,
        favoriteType: favoriteType,
        topCharacter: topCharacter,
        topCharacterId: topCharacterId,
        uniqueCharacters: details.characters ? details.characters.size : 0,
        byVillage: details.byVillage || {},
        byType: details.byType || {},
        byCharacter: details.byCharacter || {}
      };
    });
    
    // Completion rate by village
    const completionRateByVillage = {};
    ['Rudania', 'Inariko', 'Vhintl'].forEach(village => {
      const villageQuests = allHWQs.filter(q => q.village === village);
      const villageCompleted = villageQuests.filter(q => q.completed).length;
      completionRateByVillage[village] = villageQuests.length > 0 
        ? ((villageCompleted / villageQuests.length) * 100).toFixed(1)
        : 0;
    });
    
    // Completion rate by type
    const completionRateByType = {};
    Object.keys(questsPerType).forEach(type => {
      const typeQuests = allHWQs.filter(q => q.type === type);
      const typeCompleted = typeQuests.filter(q => q.completed).length;
      completionRateByType[type] = typeQuests.length > 0
        ? ((typeCompleted / typeQuests.length) * 100).toFixed(1)
        : 0;
    });
    
    // Group quests by type for detail views
    const questsByType = {};
    allHWQs.forEach(q => {
      if (q.type) {
        if (!questsByType[q.type]) {
          questsByType[q.type] = [];
        }
        questsByType[q.type].push({
          questId: q.questId,
          village: q.village,
          npcName: q.npcName,
          type: q.type,
          completed: q.completed || false,
          date: q.date
        });
      }
    });
    
    // Group quests by NPC for detail views
    const questsByNPC = {};
    allHWQs.forEach(q => {
      if (q.npcName) {
        if (!questsByNPC[q.npcName]) {
          questsByNPC[q.npcName] = [];
        }
        questsByNPC[q.npcName].push({
          questId: q.questId,
          village: q.village,
          npcName: q.npcName,
          type: q.type,
          completed: q.completed || false,
          date: q.date
        });
      }
    });
    
    res.json({
      totalQuests,
      completedQuests,
      activeQuests,
      completionRate,
      uniqueCompleterCount,
      questsPerVillage,
      questsPerType,
      questsByType,
      questsByNPC,
      topNPCs,
      topCompleters: topCompletersWithDetails,
      completionRateByVillage,
      completionRateByType,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error fetching HWQ stats', error, 'server.js');
    res.status(500).json({ error: 'Failed to fetch HWQ stats' });
  }
});



// ------------------- Function: getCalendarData -------------------
// Returns calendar data including Hyrulean calendar and Blood Moon dates
app.get('/api/calendar', async (req, res) => {
  try {

    
    // Get data from calendar module
    const hyruleanCalendar = calendarModule.hyruleanCalendar;
    const bloodmoonDates = calendarModule.bloodmoonDates;
    
    // Get all birthdays for calendar display
    const allBirthdays = await Character.find({ 
      birthday: { $exists: true, $ne: '' },
      name: { $nin: ['Tingle', 'Tingle test', 'John'] }
    }, { name: 1, birthday: 1, icon: 1 }).lean();
    const calendarBirthdays = allBirthdays
      .filter(c => c.birthday && typeof c.birthday === 'string' && c.birthday.length >= 5)
      .map(c => {
        const mmdd = c.birthday.slice(-5);
        return { name: c.name, birthday: mmdd, icon: c.icon };
      });
    
    // Get current date info
    const today = new Date();
    const currentHyruleanMonth = calendarModule.getHyruleanMonth(today);
    const isBloodmoonToday = calendarModule.isBloodmoon(today);
    const hyruleanDate = calendarModule.convertToHyruleanDate(today);
    
    res.json({
      hyruleanCalendar,
      bloodmoonDates,
      birthdays: calendarBirthdays,
      currentDate: {
        real: today.toISOString().split('T')[0],
        hyrulean: hyruleanDate,
        hyruleanMonth: currentHyruleanMonth,
        isBloodmoon: isBloodmoonToday
      }
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching calendar data:', error);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

// ------------------- Section: Model API Routes -------------------

// ------------------- Function: getModelCounts -------------------
// Returns count of documents for all models
app.get('/api/models/counts', async (req, res) => {
  try {

    
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
        
      } catch (error) {
        console.error(`[server.js]: ❌ Error getting ${key} count:`, error.message);
        // Keep 0 on error
      }
    }));
    
    
    res.json(counts);
  } catch (error) {
    console.error('[server.js]: ❌ Error in /api/models/counts:', error);
    res.status(500).json({ error: 'Failed to get model counts', details: error.message });
  }
});

// ------------------- Function: getInventoryData -------------------
// Returns inventory data with streaming support for large datasets
app.get('/api/models/inventory', async (req, res) => {
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
    }

    await client.close();

    const paginated = allItems.slice(skip, skip + limit);
    
    
    
    res.json({
      data: paginated,
      pagination: {
        total: allItems.length,
        page, 
        limit,
        pages: Math.ceil(allItems.length / limit)
      }
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching inventory:', error);
    res.status(500).json({
      error: 'Failed to fetch inventory',
      details: error.message
    });
  }
});

// ------------------- Function: getVendingShopsData -------------------
// Returns vending inventory data for all vendors
app.get('/api/models/vendingShops', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 1000;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    
    if (!vendingConnection || !vendingConnection.db) {
      return res.status(500).json({ error: 'Vending database connection not available' });
    }
    
    const db = vendingConnection.db;
    
    // List all collections in the vending database (each character has their own collection)
    const collections = await db.listCollections().toArray();
    const collectionNames = collections
      .map(c => c.name)
      .filter(n => !n.startsWith('system.') && n !== 'vending_stock');
    
    console.log(`[server.js]: Found ${collectionNames.length} vending shop collections`);
    
    // Fetch character data (icon and shopImage) for all characters
    const characterDataMap = {};
    try {
      await connectToTinglebot();
      const uniqueCharacterNames = [...new Set(collectionNames)];
      for (const characterName of uniqueCharacterNames) {
        try {
          // Try regular character first
          let character = await Character.findOne({ name: characterName }, { 
            icon: 1, 
            shopImage: 1, 
            vendingSetup: 1,
            vendorType: 1,
            currentVillage: 1,
            shopLink: 1,
            vendingPoints: 1
          }).lean();
          if (!character) {
            // Try mod character
            character = await ModCharacter.findOne({ name: characterName }, { 
              icon: 1, 
              shopImage: 1, 
              vendingSetup: 1,
              vendorType: 1,
              currentVillage: 1,
              shopLink: 1,
              vendingPoints: 1
            }).lean();
          }
          if (character) {
            characterDataMap[characterName] = {
              icon: character.icon || null,
              shopImage: character.vendingSetup?.shopImage || character.shopImage || null,
              vendorType: character.vendorType || null,
              currentVillage: character.currentVillage || null,
              shopLink: character.vendingSetup?.shopLink || character.shopLink || null,
              vendingPoints: character.vendingPoints || 0
            };
          }
        } catch (error) {
          console.warn(`[server.js]: Error fetching character data for ${characterName}:`, error.message);
        }
      }
    } catch (error) {
      console.warn(`[server.js]: Error fetching character data:`, error.message);
    }
    
    // Process collections in batches
    const BATCH_SIZE = 5;
    let allItems = [];
    for (let i = 0; i < collectionNames.length; i += BATCH_SIZE) {
      const batch = collectionNames.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(async characterName => {
        try {
          const items = await db.collection(characterName)
            .find()
            .project({ 
              itemName: 1, 
              stockQty: 1, 
              costEach: 1, 
              tokenPrice: 1, 
              slot: 1,
              date: 1,
              pointsSpent: 1
            })
            .toArray();
          const characterData = characterDataMap[characterName] || {};
          return items.map(it => ({ 
            ...it, 
            characterName,
            characterIcon: characterData.icon || null,
            shopImage: characterData.shopImage || null,
            vendorType: characterData.vendorType || null,
            currentVillage: characterData.currentVillage || null,
            shopLink: characterData.shopLink || null,
            vendingPoints: characterData.vendingPoints || 0
          }));
        } catch (error) {
          console.warn(`[server.js]: Error fetching items for ${characterName}:`, error.message);
          return [];
        }
      }));
      allItems.push(...results.flat());
    }
    
    const paginated = allItems.slice(skip, skip + limit);
    
    res.json({
      data: paginated,
      pagination: {
        total: allItems.length,
        page, 
        limit,
        pages: Math.ceil(allItems.length / limit)
      }
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching vending shops:', error);
    res.status(500).json({
      error: 'Failed to fetch vending shops',
      details: error.message
    });
  }
});

// ------------------- Function: getModelData -------------------
// Returns paginated data for any model type with filtering support
app.get('/api/models/:modelType', async (req, res) => {
  try {
    const { modelType } = req.params;

    
    const page = parseInt(req.query.page) || 1;
    const defaultLimit = 15; // Default items per page
    const requestedLimit = parseInt(req.query.limit);
    const limit = (requestedLimit && requestedLimit > 0 && requestedLimit <= 100) ? requestedLimit : defaultLimit;
    const skip = (page - 1) * limit;
    const allItems = req.query.all === 'true';
    
    // Support custom sorting
    const sortField = req.query.sort || (modelType === 'quest' ? 'postedAt' : 'itemName');
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    // Check if this is a filtered request for items
    const isFilteredRequest = modelType === 'item' && (
      req.query.search || 
      req.query.category || 
      req.query.type || 
      req.query.subtype || 
      req.query.jobs || 
      req.query.locations ||
      req.query.sources ||
      // Check for monster boolean fields
      Object.keys(req.query).some(key => 
        ['bokoblin', 'blackBokoblin', 'blueBokoblin', 'cursedBokoblin', 'goldenBokoblin', 'silverBokoblin',
         'chuchuLarge', 'electricChuchuLarge', 'fireChuchuLarge', 'iceChuchuLarge',
         'chuchuMedium', 'electricChuchuMedium', 'fireChuchuMedium', 'iceChuchuMedium',
         'chuchuSmall', 'electricChuchuSmall', 'fireChuchuSmall', 'iceChuchuSmall',
         'hinox', 'blackHinox', 'blueHinox',
         'keese', 'electricKeese', 'fireKeese', 'iceKeese',
         'lizalfos', 'blackLizalfos', 'blueLizalfos', 'cursedLizalfos', 'electricLizalfos', 
         'fireBreathLizalfos', 'goldenLizalfos', 'iceBreathLizalfos', 'silverLizalfos',
         'lynel', 'blueManedLynel', 'goldenLynel', 'silverLynel', 'whiteManedLynel',
         'moblin', 'blackMoblin', 'blueMoblin', 'cursedMoblin', 'goldenMoblin', 'silverMoblin',
         'molduga', 'molduking',
         'forestOctorok', 'rockOctorok', 'skyOctorok', 'snowOctorok', 'treasureOctorok', 'waterOctorok',
         'frostPebblit', 'igneoPebblit', 'stonePebblit',
         'stalizalfos', 'stalkoblin', 'stalmoblin', 'stalnox',
         'frostTalus', 'igneoTalus', 'luminousTalus', 'rareTalus', 'stoneTalus',
         'blizzardWizzrobe', 'electricWizzrobe', 'fireWizzrobe', 'iceWizzrobe', 'meteoWizzrobe', 'thunderWizzrobe',
         'likeLike', 'evermean', 'gibdo', 'horriblin', 'gloomHands', 'bossBokoblin', 'mothGibdo', 'littleFrox'].includes(key)
      )
    );

    let Model, query = {};
    
    // Map model type to corresponding model
    switch (modelType) {
      case 'character':
        Model = Character;
        if (!Character) {
          console.error(`[server.js]: ❌ Character model not initialized`);
          return res.status(500).json({ error: 'Character model not available' });
        }
        // For character requests, we'll handle both regular and mod characters specially
        break;
      case 'item':
        Model = Item;
        break;
      case 'monster':
        Model = Monster;
        query = {};
        break;
      case 'pet':
        Model = Pet;
        query = { status: 'active' };
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
      case 'villageShops':
        Model = VillageShops;
        break;
      case 'quest':
        Model = Quest;
        // Filter out completed and expired quests for dashboard display
        // Only show active quests that haven't expired
        query = { status: 'active' };
        break;
      case 'helpwantedquest':
      case 'HelpWantedQuest':
        Model = HelpWantedQuest;
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
      case 'vending':
        // Vending uses vending_stock collection from tinglebot database
        try {
          // Ensure VendingStock model is initialized
          const VendingStock = getVendingStockModel();
          
          // Check if specific month/year is requested
          const requestedMonth = parseInt(req.query.month);
          const requestedYear = parseInt(req.query.year);
          
          let stockData;
          
          if (requestedMonth && requestedYear) {
            // Fetch specific month/year
            console.log(`[server.js]: 🔍 Querying vending stock for month: ${requestedMonth}, year: ${requestedYear}`);
            stockData = await VendingStock.findOne({ month: requestedMonth, year: requestedYear });
            if (!stockData) {
              stockData = await VendingStock.findOne({ month: requestedMonth });
            }
          } else {
            // Default: get current month/year
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();
            
            console.log(`[server.js]: 🔍 Querying vending stock for month: ${currentMonth}, year: ${currentYear} using tinglebot database`);
            
            // First try to get current month/year's stock (for documents with year field)
            stockData = await VendingStock.findOne({ month: currentMonth, year: currentYear });
            
            // If no match, try to find by month only (for documents without year field)
            if (!stockData) {
              stockData = await VendingStock.findOne({ month: currentMonth });
              if (stockData) {
                console.log(`[server.js]: ✅ Found stock for month ${currentMonth} (no year field, created: ${stockData.createdAt})`);
              }
            } else {
              console.log(`[server.js]: ✅ Found stock for current month/year ${currentMonth}/${currentYear}`);
            }
            
            // If still no current month stock found, get the most recent stock entry
            if (!stockData) {
              console.log(`[server.js]: ⚠️ No stock found for current month/year (${currentMonth}/${currentYear}), fetching most recent stock...`);
              stockData = await VendingStock.findOne({}).sort({ createdAt: -1 });
              if (stockData) {
                console.log(`[server.js]: ✅ Found stock for month ${stockData.month}, year ${stockData.year || 'N/A'} (created: ${stockData.createdAt})`);
              }
            }
          }
          
          if (!stockData) {
            return res.json({
              data: [],
              pagination: {
                page: 1,
                pages: 1,
                total: 0,
                limit: 15
              }
            });
          }
          
          // Convert to plain object and ensure proper formatting
          const stockDataObj = stockData.toObject();
          
          // Convert ObjectId to string for JSON serialization
          if (stockDataObj._id && stockDataObj._id.toString) {
            stockDataObj._id = stockDataObj._id.toString();
          }
          
          // Ensure stockList is properly formatted as a plain object (not Map)
          if (stockDataObj.stockList) {
            // Convert Map to object if needed
            if (stockDataObj.stockList instanceof Map) {
              stockDataObj.stockList = Object.fromEntries(stockDataObj.stockList);
            }
          }
          
          // Convert Date to ISO string for JSON serialization
          if (stockDataObj.createdAt && stockDataObj.createdAt instanceof Date) {
            stockDataObj.createdAt = stockDataObj.createdAt.toISOString();
          }
          
          // Return the stock data
          return res.json({
            data: [stockDataObj],
            pagination: {
              page: 1,
              pages: 1,
              total: 1,
              limit: 1
            }
          });
        } catch (error) {
          console.error(`[server.js]: ❌ Error fetching vending stock:`, error);
          return res.status(500).json({ error: 'Failed to fetch vending stock', details: error.message });
        }
      default:
        return res.status(400).json({ error: 'Invalid model type' });
    }

    if (!Model) {
      console.error(`[server.js]: ❌ Model not found for type: ${modelType}`);
      return res.status(500).json({ error: `Model not initialized for type: ${modelType}` });
    }

    // Ensure database connection is available
    // For vending, check vendingConnection; for inventory, check inventoriesConnection; otherwise check main connection
    if (modelType === 'vending') {
      if (!vendingConnection || vendingConnection.readyState !== 1) {
        console.error(`[server.js]: ❌ Vending database not connected. State: ${vendingConnection?.readyState || 'null'}`);
        return res.status(500).json({ error: 'Vending database connection not available' });
      }
    } else if (modelType === 'inventory') {
      if (!inventoriesConnection || inventoriesConnection.readyState !== 1) {
        console.error(`[server.js]: ❌ Inventories database not connected. State: ${inventoriesConnection?.readyState || 'null'}`);
        return res.status(500).json({ error: 'Inventories database connection not available' });
      }
    } else {
      if (mongoose.connection.readyState !== 1) {
        console.error(`[server.js]: ❌ Database not connected. State: ${mongoose.connection.readyState}`);
        return res.status(500).json({ error: 'Database connection not available' });
      }
    }

    // For filtered item requests or all=true requests, return all items

    if (isFilteredRequest || allItems) {

      
      // Build query for item filtering
      if (modelType === 'item') {
        // Handle monster boolean fields
        const monsterFields = [
          'bokoblin', 'blackBokoblin', 'blueBokoblin', 'cursedBokoblin', 'goldenBokoblin', 'silverBokoblin',
          'chuchuLarge', 'electricChuchuLarge', 'fireChuchuLarge', 'iceChuchuLarge',
          'chuchuMedium', 'electricChuchuMedium', 'fireChuchuMedium', 'iceChuchuMedium',
          'chuchuSmall', 'electricChuchuSmall', 'fireChuchuSmall', 'iceChuchuSmall',
          'hinox', 'blackHinox', 'blueHinox',
          'keese', 'electricKeese', 'fireKeese', 'iceKeese',
          'lizalfos', 'blackLizalfos', 'blueLizalfos', 'cursedLizalfos', 'electricLizalfos', 
          'fireBreathLizalfos', 'goldenLizalfos', 'iceBreathLizalfos', 'silverLizalfos',
          'lynel', 'blueManedLynel', 'goldenLynel', 'silverLynel', 'whiteManedLynel',
          'moblin', 'blackMoblin', 'blueMoblin', 'cursedMoblin', 'goldenMoblin', 'silverMoblin',
          'molduga', 'molduking',
          'forestOctorok', 'rockOctorok', 'skyOctorok', 'snowOctorok', 'treasureOctorok', 'waterOctorok',
          'frostPebblit', 'igneoPebblit', 'stonePebblit',
          'stalizalfos', 'stalkoblin', 'stalmoblin', 'stalnox',
          'frostTalus', 'igneoTalus', 'luminousTalus', 'rareTalus', 'stoneTalus',
          'blizzardWizzrobe', 'electricWizzrobe', 'fireWizzrobe', 'iceWizzrobe', 'meteoWizzrobe', 'thunderWizzrobe',
          'likeLike', 'evermean', 'gibdo', 'horriblin', 'gloomHands', 'bossBokoblin', 'mothGibdo', 'littleFrox'
        ];
        
        // Add monster field filters to query
        monsterFields.forEach(field => {
          if (req.query[field] === 'true') {
            query[field] = true;
          }
        });
      }
      
      let allItemsData;
      let filteredData;
      
      if (modelType === 'character') {
        // For characters, fetch both regular and mod characters
        const [regularCharacters, modCharacters] = await Promise.all([
          Character.find({}).lean(),
          ModCharacter.find({}).lean()
        ]);
        
        // Combine both character types
        allItemsData = [...regularCharacters, ...modCharacters];
        
        // List of characters to exclude from dashboard
        const excludedCharacters = ['Tingle', 'Tingle test', 'John'];
        
        filteredData = allItemsData.filter(character => 
          !excludedCharacters.includes(character.name)
        );
      } else {
        // For non-character models, use the standard approach
        allItemsData = await Model.find(query)
          .sort(modelType === 'item' ? { itemName: 1 } : {})
          .lean();
        
        // For quests, filter out expired quests
        if (modelType === 'quest') {
          filteredData = allItemsData.filter(quest => !checkQuestExpiration(quest));
        } else {
          filteredData = allItemsData;
        }
      }
      
      // For characters, we need to populate user information even for all=true requests
      let finalData = filteredData;
      if (modelType === 'character') {
        // Check cache first
        const now = Date.now();
        if (characterDataCache.data && (now - characterDataCache.timestamp) < characterDataCache.CACHE_DURATION) {
          finalData = characterDataCache.data;
        } else {
          // Get unique user IDs from regular characters (mod characters don't need user lookup)
          const regularCharacterUserIds = filteredData
            .filter(char => !char.isModCharacter)
            .map(char => char.userId);
          const userIds = [...new Set(regularCharacterUserIds)];
          
          // Fetch user information for all unique user IDs in one query
          const users = await User.find({ discordId: { $in: userIds } }, { 
            discordId: 1, 
            username: 1, 
            discriminator: 1 
          }).lean();
          
          // Create a map for quick lookup
          const userMap = {};
          users.forEach(user => {
            userMap[user.discordId] = user;
          });
            
          // Transform character data
          finalData = filteredData.map(character => {
            // Keep icon URL as-is (no transformation needed)
            
            // Handle mod characters differently for user information
            if (character.isModCharacter) {
              // For mod characters, use modOwner field and set special owner info
              character.owner = {
                username: character.modOwner || 'Mod',
                discriminator: null,
                displayName: character.modOwner || 'Mod Character'
              };
            } else {
              // For regular characters, use standard user lookup
              const user = userMap[character.userId];
              if (user) {
                character.owner = {
                  username: user.username,
                  discriminator: user.discriminator,
                  displayName: user.username || 'Unknown User'
                };
              } else {
                character.owner = {
                  username: 'Unknown',
                  discriminator: null,
                  displayName: 'Unknown User'
                };
              }
            }
            
            // Initialize spirit orbs (will be updated below)
            character.spiritOrbs = 0;
            
            return character;
          });
          
                // Get spirit orb counts for all characters in one batch
      if (inventoriesConnection) {
        try {
          const characterNames = finalData.map(char => char.name);
          const spiritOrbCounts = await countSpiritOrbsBatch(characterNames);
          
          // Update spirit orb counts
          finalData.forEach(character => {
            character.spiritOrbs = spiritOrbCounts[character.name] || 0;
          });
        } catch (spiritOrbError) {
          console.warn('[server.js]: ⚠️ Error counting spirit orbs, using defaults:', spiritOrbError.message);
          finalData.forEach(character => {
            character.spiritOrbs = 0;
          });
        }
      } else {
        // No inventories connection, use defaults
        finalData.forEach(character => {
          character.spiritOrbs = 0;
        });
      }
          
          // Cache the processed data
          characterDataCache.data = finalData;
          characterDataCache.timestamp = now;
        }
        

      }
      
      res.json({
        data: finalData,
        pagination: {
          page: 1,
          pages: 1,
          total: finalData.length,
          limit: finalData.length
        }
      });
      return;
    }

    // Get total count for pagination
    const total = await Model.countDocuments(query);
    const pages = Math.ceil(total / limit);



    // Fetch paginated data with custom sorting
    const sortOptions = {};
    if (modelType === 'item') {
      sortOptions.itemName = 1;
    } else if (modelType === 'quest' && sortField) {
      sortOptions[sortField] = sortOrder;
    }
    
    let data = await Model.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean();
    
    // For quests, filter out expired quests even in paginated requests
    if (modelType === 'quest') {
      data = data.filter(quest => !checkQuestExpiration(quest));
    }



    // Transform icon URLs for characters and populate user information
    if (modelType === 'character') {
      try {
        // Check cache first for paginated requests
        const now = Date.now();
        if (characterDataCache.data && (now - characterDataCache.timestamp) < characterDataCache.CACHE_DURATION) {
          // Use cached data and apply pagination
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          data = characterDataCache.data.slice(startIndex, endIndex);
        } else {
          // Get unique user IDs from characters
          const userIds = [...new Set(data.map(char => char.userId))];
          
          // Fetch user information for all unique user IDs in one query
          const users = await User.find({ discordId: { $in: userIds } }, { 
            discordId: 1, 
            username: 1, 
            discriminator: 1 
          }).lean();
          
          // Create a map for quick lookup
          const userMap = {};
          users.forEach(user => {
            userMap[user.discordId] = user;
          });
          
          // Transform character data
          data.forEach(character => {
            // Keep icon URL as-is (no transformation needed)
            
            // Add user information
            const user = userMap[character.userId];
            if (user) {
              character.owner = {
                username: user.username,
                discriminator: user.discriminator,
                displayName: user.username || 'Unknown User'
              };
            } else {
              character.owner = {
                username: 'Unknown',
                discriminator: null,
                displayName: 'Unknown User'
              };
            }
            
            // Initialize spirit orbs (will be updated below)
            character.spiritOrbs = 0;
          });
          
          // Get spirit orb counts for all characters in one batch
          if (inventoriesConnection) {
            try {
              const characterNames = data.map(char => char.name);
              const spiritOrbCounts = await countSpiritOrbsBatch(characterNames);
              
              // Update spirit orb counts
              data.forEach(character => {
                character.spiritOrbs = spiritOrbCounts[character.name] || 0;
              });
            } catch (spiritOrbError) {
              console.warn('[server.js]: ⚠️ Error counting spirit orbs, using defaults:', spiritOrbError.message);
              data.forEach(character => {
                character.spiritOrbs = 0;
              });
            }
          } else {
            // No inventories connection, use defaults
            data.forEach(character => {
              character.spiritOrbs = 0;
            });
          }
        }
      } catch (error) {
        console.error(`[server.js]: ❌ Error processing character data:`, error);
        // Continue with basic data without spirit orb counts
        data.forEach(character => {
          character.spiritOrbs = 0;
          if (!character.owner) {
            character.owner = {
              username: 'Unknown',
              discriminator: null,
              displayName: 'Unknown User'
            };
          }
        });
      }
    }

    
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
    const count = await Character.countDocuments({ name: { $nin: ['Tingle', 'Tingle test', 'John'] } });
    res.json({ count });
  } catch (error) {
    console.error('[server.js]: ❌ Failed to fetch character count:', error);
    res.status(500).json({ error: 'Failed to fetch character count' });
  }
});

// ------------------- Function: debugCharacterModel -------------------
// Debug endpoint for character model issues
app.get('/api/debug/character-model', async (req, res) => {
  try {
    const debug = {
      modelLoaded: !!Character,
      databaseConnected: mongoose.connection.readyState === 1,
      inventoriesConnected: !!inventoriesConnection,
      characterCount: null,
      sampleCharacter: null
    };
    
    if (debug.modelLoaded && debug.databaseConnected) {
      try {
        debug.characterCount = await Character.countDocuments({ name: { $nin: ['Tingle', 'Tingle test', 'John'] } });
        debug.sampleCharacter = await Character.findOne().lean();
      } catch (dbError) {
        debug.databaseError = dbError.message;
      }
    }
    
    res.json(debug);
  } catch (error) {
    console.error('[server.js]: ❌ Debug endpoint error:', error);
    res.status(500).json({ error: 'Debug endpoint failed', details: error.message });
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
    logger.error('Error fetching character', error, 'server.js');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: getUserCharacters -------------------
// Returns all characters belonging to the authenticated user (including mod characters)
app.get('/api/user/characters', async (req, res) => {
  try {
    // Check authentication
    if (!req.session?.user?.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.session.user.discordId;
    
    const regularCharacters = await Character.find({ userId }).lean();
    const modCharacters = await ModCharacter.find({ userId }).lean();
    
    // Combine both character types
    const characters = [...regularCharacters, ...modCharacters];
    
    // Initialize spirit orbs count for characters
    characters.forEach(character => {
      // Count spirit orbs from inventory (replace character model field)
      character.spiritOrbs = 0; // Will be updated with actual count from inventory
    });
    
    // Get spirit orb counts for all characters
    const characterNames = characters.map(char => char.name);
    const spiritOrbCounts = await countSpiritOrbsBatch(characterNames);
    
    // Update spirit orb counts
    characters.forEach(character => {
      character.spiritOrbs = spiritOrbCounts[character.name] || 0;
    });
    
    res.json({ data: characters });
  } catch (error) {
    logger.error('Error fetching user characters', error, 'server.js');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: checkQuestExpiration -------------------
// Helper function to check if a quest has expired based on timeLimit and postedAt/createdAt
// Works with plain objects (from .lean() queries)
function checkQuestExpiration(quest) {
  if (!quest.timeLimit) {
    return false;
  }
  
  const startDate = quest.postedAt || quest.createdAt;
  if (!startDate) {
    return false;
  }
  
  const now = new Date();
  const startDateTime = new Date(startDate);
  const timeLimit = quest.timeLimit.toLowerCase();
  
  const TIME_MULTIPLIERS = {
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000
  };
  
  let durationMs = 0;
  
  if (timeLimit.includes('month')) {
    const months = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
    durationMs = months * TIME_MULTIPLIERS.MONTH;
  } else if (timeLimit.includes('week')) {
    const weeks = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
    durationMs = weeks * TIME_MULTIPLIERS.WEEK;
  } else if (timeLimit.includes('day')) {
    const days = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
    durationMs = days * TIME_MULTIPLIERS.DAY;
  } else if (timeLimit.includes('hour')) {
    const hours = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
    durationMs = hours * TIME_MULTIPLIERS.HOUR;
  }
  
  const expirationTime = new Date(startDateTime.getTime() + durationMs);
  return now > expirationTime;
}

// ------------------- Function: getUserQuestParticipation -------------------
// Returns quest participation summaries for the authenticated user
app.get('/api/user/quests', async (req, res) => {
  try {
    // Check authentication
    if (!req.session?.user?.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.session.user.discordId;
    const participantField = `participants.${userId}`;

    const quests = await Quest.find({
      [participantField]: { $exists: true }
    })
      .select('questID title questType status location date timeLimit postedAt createdAt updatedAt completionReason participants requiredVillage tokenReward collabAllowed')
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean();

    const participationEntries = quests
      .map((quest) => {
        const participants = quest.participants || {};
        const participant =
          participants[userId] ||
          (typeof participants.get === 'function' ? participants.get(userId) : null);

        if (!participant) {
          return null;
        }

        const submissionsCount = Array.isArray(participant.submissions)
          ? participant.submissions.length
          : participant.submissions || 0;

        return {
          id: quest._id,
          questCode: quest.questID,
          title: quest.title,
          questType: quest.questType,
          questStatus: quest.status,
          location: quest.location,
          date: quest.date,
          timeLimit: quest.timeLimit,
          requiredVillage: participant.requiredVillage || quest.requiredVillage || null,
          postedAt: quest.postedAt,
          createdAt: quest.createdAt,
          completionReason: quest.completionReason || null,
          tokenReward: quest.tokenReward,
          collabAllowed: quest.collabAllowed,
          participant: {
            status: participant.progress || 'active',
            joinedAt: participant.joinedAt,
            completedAt: participant.completedAt,
            rewardedAt: participant.rewardedAt,
            tokensEarned: participant.tokensEarned || 0,
            itemsEarned: participant.itemsEarned || [],
            rpPostCount: participant.rpPostCount || 0,
            submissions: submissionsCount,
            successfulRolls: participant.successfulRolls || 0,
            lastUpdated: participant.updatedAt || quest.updatedAt,
            disqualifiedAt: participant.disqualifiedAt || null,
            disqualificationReason: participant.disqualificationReason || null
          }
        };
      })
      .filter(Boolean);

    const toTimestamp = (value) => (value ? new Date(value).getTime() : 0);

    // Filter out expired quests - only show truly active quests
    const activeQuests = participationEntries
      .filter((entry) => {
        // Check participant status and quest status
        const isParticipantActive = entry.participant.status === 'active';
        const isQuestActive = entry.questStatus === 'active';
        
        // Check if quest has expired based on time limit
        const questData = quests.find(q => q._id.toString() === entry.id.toString());
        const isExpired = questData ? checkQuestExpiration(questData) : false;
        
        // Only include if participant is active, quest is active, AND quest hasn't expired
        return isParticipantActive && isQuestActive && !isExpired;
      })
      .sort((a, b) => toTimestamp(b.participant.joinedAt || b.postedAt || b.date) - toTimestamp(a.participant.joinedAt || a.postedAt || a.date))
      .slice(0, 5);

    const recentCompletions = participationEntries
      .filter((entry) => ['completed', 'rewarded'].includes(entry.participant.status))
      .sort((a, b) => toTimestamp(b.participant.completedAt || b.participant.rewardedAt) - toTimestamp(a.participant.completedAt || a.participant.rewardedAt))
      .slice(0, 5);

    const pendingRewards = participationEntries.filter(
      (entry) => entry.participant.status === 'completed' && !entry.participant.rewardedAt
    ).length;

    // Filter participations to exclude expired or inactive quests for active display
    // This ensures the frontend only shows truly active quests when grouping by date
    const activeParticipations = participationEntries.filter((entry) => {
      const isParticipantActive = entry.participant.status === 'active';
      const isQuestActive = entry.questStatus === 'active';
      const questData = quests.find(q => q._id.toString() === entry.id.toString());
      const isExpired = questData ? checkQuestExpiration(questData) : false;
      return isParticipantActive && isQuestActive && !isExpired;
    });

    res.json({
      totalParticipations: participationEntries.length,
      pendingRewards,
      activeQuests,
      recentCompletions,
      participations: participationEntries,
      activeParticipations: activeParticipations // Add filtered list for frontend
    });
  } catch (error) {
    logger.error('Error fetching user quests', error, 'server.js');
    res.status(500).json({ error: 'Failed to load quest data' });
  }
});

// ------------------- Function: exportCharacterData -------------------
// Exports all data related to a specific character for backup/download purposes
app.get('/api/characters/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.discordId;
    
    // Find the character and verify ownership (check both regular and mod characters)
    let character = await Character.findOne({ _id: id, userId }).lean();
    let isModCharacter = false;
    
    if (!character) {
      character = await ModCharacter.findOne({ _id: id, userId }).lean();
      isModCharacter = true;
    }
    
    if (!character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }
    
      logger.info('server.js', `Exporting data for character ${character.name} (${character._id})`);
    
    // Initialize export data object
    const exportData = {
      exportDate: new Date().toISOString(),
      exportedBy: userId,
      character: character,
      isModCharacter: isModCharacter
    };
    
    // Fetch inventory data
    try {
      const collectionName = character.name.trim().toLowerCase();
      const inventoriesDb = await connectToInventoriesNative();
      const inventoryCollection = inventoriesDb.collection(collectionName);
      const inventoryItems = await inventoryCollection.find().toArray();
      exportData.inventory = inventoryItems;
      logger.success(`Found ${inventoryItems.length} inventory items`, 'server.js');
    } catch (error) {
      logger.warn(`Error fetching inventory: ${error.message}`, 'server.js');
      exportData.inventory = [];
    }
    
    // Fetch pets
    try {
      const pets = await Pet.find({ 
        $or: [
          { owner: character._id },
          { discordId: userId }
        ]
      }).lean();
      exportData.pets = pets;
      logger.success(`Found ${pets.length} pets`, 'server.js');
    } catch (error) {
      logger.warn(`Error fetching pets: ${error.message}`, 'server.js');
      exportData.pets = [];
    }
    
    // Fetch mounts
    try {
      const mounts = await Mount.find({ 
        $or: [
          { characterId: character._id },
          { discordId: userId }
        ]
      }).lean();
      exportData.mounts = mounts;
      logger.success(`Found ${mounts.length} mounts`, 'server.js');
    } catch (error) {
      logger.warn(`Error fetching mounts: ${error.message}`, 'server.js');
      exportData.mounts = [];
    }
    
    // Fetch relationships
    try {
      const relationships = await Relationship.find({
        $or: [
          { characterId: character._id },
          { targetCharacterId: character._id }
        ]
      }).lean();
      exportData.relationships = relationships;
      logger.success(`Found ${relationships.length} relationships`, 'server.js');
    } catch (error) {
      logger.warn(`Error fetching relationships: ${error.message}`, 'server.js');
      exportData.relationships = [];
    }
    
    // Fetch quests (where character is a participant)
    try {
      const quests = await Quest.find({
        [`participants.${userId}`]: { $exists: true }
      }).lean();
      exportData.quests = quests;
      logger.success(`Found ${quests.length} quests`, 'server.js');
    } catch (error) {
      logger.warn(`Error fetching quests: ${error.message}`, 'server.js');
      exportData.quests = [];
    }
    
    // Fetch parties
    try {
      const parties = await Party.find({
        'characters.userId': userId
      }).lean();
      exportData.parties = parties;
      console.log(`[server.js]: ✅ Found ${parties.length} parties`);
    } catch (error) {
      console.warn(`[server.js]: ⚠️ Error fetching parties:`, error.message);
      exportData.parties = [];
    }
    
    // Fetch raids
    try {
      const raids = await Raid.find({
        'participants.userId': userId
      }).lean();
      exportData.raids = raids;
      console.log(`[server.js]: ✅ Found ${raids.length} raids`);
    } catch (error) {
      console.warn(`[server.js]: ⚠️ Error fetching raids:`, error.message);
      exportData.raids = [];
    }
    
    // Fetch steal stats
    try {
      const stealStats = await StealStats.findOne({ characterId: character._id }).lean();
      exportData.stealStats = stealStats || null;
      console.log(`[server.js]: ✅ Found steal stats`);
    } catch (error) {
      console.warn(`[server.js]: ⚠️ Error fetching steal stats:`, error.message);
      exportData.stealStats = null;
    }
    
    // Fetch blight roll history
    try {
      const blightHistory = await BlightRollHistory.find({ characterId: character._id }).lean();
      exportData.blightHistory = blightHistory;
      console.log(`[server.js]: ✅ Found ${blightHistory.length} blight history entries`);
    } catch (error) {
      console.warn(`[server.js]: ⚠️ Error fetching blight history:`, error.message);
      exportData.blightHistory = [];
    }
    
    console.log(`[server.js]: ✅ Successfully exported all data for character ${character.name}`);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${character.name}_data_export_${Date.now()}.json"`);
    res.json(exportData);
    
  } catch (error) {
    console.error('[server.js]: ❌ Error exporting character data:', error);
    res.status(500).json({ error: 'Failed to export character data', details: error.message });
  }
});

// ------------------- Function: exportAllUserData -------------------
// Exports all data for a user including all their characters
app.get('/api/user/export-all', async (req, res) => {
  try {
    const userId = req.user.discordId;
    
    console.log(`[server.js]: 📦 Exporting all data for user ${userId}`);
    
    // Initialize export data object
    const exportData = {
      exportDate: new Date().toISOString(),
      userId: userId,
      characters: []
    };
    
    // Fetch user data
    try {
      const user = await User.findOne({ discordId: userId }).lean();
      exportData.user = user;
      console.log(`[server.js]: ✅ Found user data`);
    } catch (error) {
      console.warn(`[server.js]: ⚠️ Error fetching user data:`, error.message);
      exportData.user = null;
    }
    
    // Fetch all characters (both regular and mod characters)
    const regularCharacters = await Character.find({ userId }).lean();
    const modCharacters = await ModCharacter.find({ userId }).lean();
    const allCharacters = [...regularCharacters, ...modCharacters];
    
    console.log(`[server.js]: 📋 Found ${allCharacters.length} characters (${regularCharacters.length} regular, ${modCharacters.length} mod)`);
    
    // For each character, fetch all related data
    for (const character of allCharacters) {
      const characterData = {
        character: character,
        isModCharacter: modCharacters.includes(character)
      };
      
      // Fetch inventory data
      try {
        const collectionName = character.name.trim().toLowerCase();
        const inventoriesDb = await connectToInventoriesNative();
        const inventoryCollection = inventoriesDb.collection(collectionName);
        const inventoryItems = await inventoryCollection.find().toArray();
        characterData.inventory = inventoryItems;
        console.log(`[server.js]: ✅ Found ${inventoryItems.length} inventory items for ${character.name}`);
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Error fetching inventory for ${character.name}:`, error.message);
        characterData.inventory = [];
      }
      
      // Fetch pets
      try {
        const pets = await Pet.find({ 
          $or: [
            { owner: character._id },
            { discordId: userId }
          ]
        }).lean();
        characterData.pets = pets;
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Error fetching pets for ${character.name}:`, error.message);
        characterData.pets = [];
      }
      
      // Fetch mounts
      try {
        const mounts = await Mount.find({ 
          $or: [
            { characterId: character._id },
            { discordId: userId }
          ]
        }).lean();
        characterData.mounts = mounts;
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Error fetching mounts for ${character.name}:`, error.message);
        characterData.mounts = [];
      }
      
      // Fetch relationships
      try {
        const relationships = await Relationship.find({
          $or: [
            { characterId: character._id },
            { targetCharacterId: character._id }
          ]
        }).lean();
        characterData.relationships = relationships;
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Error fetching relationships for ${character.name}:`, error.message);
        characterData.relationships = [];
      }
      
      // Fetch quests
      try {
        const quests = await Quest.find({
          [`participants.${userId}`]: { $exists: true }
        }).lean();
        characterData.quests = quests;
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Error fetching quests for ${character.name}:`, error.message);
        characterData.quests = [];
      }
      
      // Fetch steal stats
      try {
        const stealStats = await StealStats.findOne({ characterId: character._id }).lean();
        characterData.stealStats = stealStats || null;
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Error fetching steal stats for ${character.name}:`, error.message);
        characterData.stealStats = null;
      }
      
      // Fetch blight roll history
      try {
        const blightHistory = await BlightRollHistory.find({ characterId: character._id }).lean();
        characterData.blightHistory = blightHistory;
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Error fetching blight history for ${character.name}:`, error.message);
        characterData.blightHistory = [];
      }
      
      exportData.characters.push(characterData);
    }
    
    // Fetch parties for the user (not character-specific)
    try {
      const parties = await Party.find({
        'characters.userId': userId
      }).lean();
      exportData.parties = parties;
      console.log(`[server.js]: ✅ Found ${parties.length} parties`);
    } catch (error) {
      console.warn(`[server.js]: ⚠️ Error fetching parties:`, error.message);
      exportData.parties = [];
    }
    
    // Fetch raids for the user (not character-specific)
    try {
      const raids = await Raid.find({
        'participants.userId': userId
      }).lean();
      exportData.raids = raids;
      console.log(`[server.js]: ✅ Found ${raids.length} raids`);
    } catch (error) {
      console.warn(`[server.js]: ⚠️ Error fetching raids:`, error.message);
      exportData.raids = [];
    }
    
    console.log(`[server.js]: ✅ Successfully exported all data for user ${userId} (${allCharacters.length} characters)`);
    
    res.json(exportData);
    
  } catch (error) {
    console.error('[server.js]: ❌ Error exporting user data:', error);
    res.status(500).json({ error: 'Failed to export user data', details: error.message });
  }
});

// ------------------- Function: updateCharacterProfile -------------------
// Updates character profile information (editable fields only)
app.patch('/api/characters/:id/profile', upload.single('icon'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.discordId;
    const { age, pronouns, height, birthday, canBeStolenFrom } = req.body;
    
    // Find the character and verify ownership
    const character = await Character.findOne({ _id: id, userId });
    
    if (!character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }
    
    // Validate birthday format (MM-DD)
    if (birthday !== undefined && birthday !== null && birthday !== '') {
      const birthdayRegex = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
      if (!birthdayRegex.test(birthday)) {
        return res.status(400).json({ error: 'Birthday must be in MM-DD format (e.g., 01-15)' });
      }
    }
    
    // Handle icon upload
    if (req.file) {
      // Delete old icon file if it exists and is not the default
      if (character.icon && !character.icon.includes('ankleicon') && !character.icon.includes('http')) {
        try {
          const oldIconPath = path.join(__dirname, 'images', character.icon);
          await fs.unlink(oldIconPath).catch(() => {}); // Ignore errors if file doesn't exist
        } catch (err) {
          console.log('[server.js]: Could not delete old icon:', err.message);
        }
      }
      
      // Set new icon filename
      character.icon = req.file.filename;
    }
    
    // Update only the allowed fields
    if (age !== undefined && age !== '') {
      character.age = parseInt(age) || null;
    }
    
    if (pronouns !== undefined) {
      character.pronouns = pronouns;
    }
    
    if (height !== undefined && height !== '') {
      character.height = parseInt(height) || null;
    }
    
    if (birthday !== undefined) {
      character.birthday = birthday;
    }
    
    // Handle permanent steal protection opt-out
    if (canBeStolenFrom !== undefined) {
      // Convert string 'true'/'false' to boolean
      const canBeStolen = canBeStolenFrom === 'true' || canBeStolenFrom === true;
      character.canBeStolenFrom = canBeStolen;
    }
    
    await character.save();
    
    res.json({ 
      message: 'Character profile updated successfully',
      character: {
        _id: character._id,
        name: character.name,
        age: character.age,
        pronouns: character.pronouns,
        height: character.height,
        birthday: character.birthday,
        icon: character.icon,
        canBeStolenFrom: character.canBeStolenFrom
      }
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error updating character profile:', error);
    res.status(500).json({ error: 'Failed to update character profile' });
  }
});

// ------------------- Function: getCharacterOfWeek -------------------
// Returns the current character of the week
app.get('/api/character-of-week', async (req, res) => {
  try {
    
    
    const currentCharacter = await CharacterOfWeek.findOne({ isActive: true })
      .populate('characterId')
      .sort({ startDate: -1 })
      .lean();
    
    if (!currentCharacter) {

      return res.json({ 
        data: null, 
        message: 'No character of the week currently selected' 
      });
    }
    
    // Keep icon URL as-is (no transformation needed)
    
    // Calculate rotation information
    const now = new Date();
    const nextRotation = getNextSundayMidnight(currentCharacter.startDate);
    const timeUntilRotation = nextRotation.getTime() - now.getTime();
    
    const daysUntilRotation = Math.floor(timeUntilRotation / (1000 * 60 * 60 * 24));
    const hoursUntilRotation = Math.floor((timeUntilRotation % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const isSunday = now.getUTCDay() === 0;
    
    // Add rotation info to the response
    currentCharacter.rotationInfo = {
      nextRotation: nextRotation.toISOString(),
      daysUntilRotation,
      hoursUntilRotation,
      isSunday,
      timeUntilRotation
    };
    
    
    res.json({ data: currentCharacter });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching character of the week:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: setCharacterOfWeek -------------------
// Sets a new character of the week (admin only)
app.post('/api/character-of-week', async (req, res) => {
  try {
    const { characterId, featuredReason } = req.body;
    
    if (!characterId) {
      return res.status(400).json({ error: 'Character ID is required' });
    }
    
    // Check if user has admin role in Discord
    let isAdmin = false;
    const guildId = process.env.PROD_GUILD_ID;
    
    if (guildId && req.user) {
      try {
        const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
          headers: {
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const memberData = await response.json();
          const roles = memberData.roles || [];
          const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
          if (!ADMIN_ROLE_ID) {
            isAdmin = false;
          } else {
            isAdmin = roles.includes(ADMIN_ROLE_ID);
          }
        }
      } catch (error) {
        console.error('[server.js]: Error checking admin status:', error);
        isAdmin = false;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    // Verify character exists
    const character = await Character.findById(characterId);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    // Deactivate current character of the week
    await CharacterOfWeek.updateMany(
      { isActive: true },
      { isActive: false }
    );
    
    // Calculate end date (next Sunday midnight)
    const startDate = new Date();
    const endDate = getNextSundayMidnight(startDate);
    
    // Create new character of the week
    const newCharacterOfWeek = new CharacterOfWeek({
      characterId: character._id,
      characterName: character.name,
      userId: character.userId,
      startDate,
      endDate,
      isActive: true,
      featuredReason: featuredReason || 'Admin selection'
    });
    
    await newCharacterOfWeek.save();
    
    
    res.json({ 
      data: newCharacterOfWeek,
      message: `Character of the week set to ${character.name}` 
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error setting character of the week:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: getRandomCharacterOfWeek -------------------
// Automatically selects a random character for the week
app.post('/api/character-of-week/random', async (req, res) => {
  try {
    // Check if user has admin role in Discord
    let isAdmin = false;
    const guildId = process.env.PROD_GUILD_ID;
    
    if (guildId && req.user) {
      try {
        const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
          headers: {
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const memberData = await response.json();
          const roles = memberData.roles || [];
          const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
          if (!ADMIN_ROLE_ID) {
            isAdmin = false;
          } else {
            isAdmin = roles.includes(ADMIN_ROLE_ID);
          }
        }
      } catch (error) {
        console.error('[server.js]: Error checking admin status:', error);
        isAdmin = false;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    // Use the same rotation logic to ensure fair character selection
    await rotateCharacterOfWeek();
    
    const newCharacter = await CharacterOfWeek.findOne({ isActive: true }).populate('characterId');
    
    res.json({ 
      data: newCharacter,
      message: `Randomly selected character of the week: ${newCharacter.characterName}` 
    });
    
  } catch (error) {
    console.error('[server.js]: ❌ Error in getRandomCharacterOfWeek:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: triggerFirstCharacterOfWeek -------------------
// Manually triggers the first character of the week (for testing)
app.post('/api/character-of-week/trigger-first', async (req, res) => {
  try {
    // Check if user has admin role in Discord
    let isAdmin = false;
    const guildId = process.env.PROD_GUILD_ID;
    
    if (guildId && req.user) {
      try {
        const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
          headers: {
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const memberData = await response.json();
          const roles = memberData.roles || [];
          const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
          if (!ADMIN_ROLE_ID) {
            isAdmin = false;
          } else {
            isAdmin = roles.includes(ADMIN_ROLE_ID);
          }
        }
      } catch (error) {
        console.error('[server.js]: Error checking admin status:', error);
        isAdmin = false;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    // Check if there's already an active character of the week
    const existingCharacter = await CharacterOfWeek.findOne({ isActive: true });
    if (existingCharacter) {
      return res.json({ 
        data: existingCharacter,
        message: `Character of the week already exists: ${existingCharacter.characterName}` 
      });
    }
    
    // Use the same rotation logic to ensure fair character selection
    await rotateCharacterOfWeek();
    
    const newCharacter = await CharacterOfWeek.findOne({ isActive: true }).populate('characterId');
    
    res.json({ 
      data: newCharacter,
      message: `Manually triggered first character of the week: ${newCharacter.characterName}` 
    });
    
  } catch (error) {
    console.error('[server.js]: ❌ Error triggering first character of the week:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// ------------------- Relationships API Routes -------------------
// ============================================================================

// ------------------- Function: getCharacterRelationships -------------------
// Returns all relationships for a specific character (both directions)
app.get('/api/relationships/character/:characterId', async (req, res) => {
  try {
    const { characterId } = req.params;
    if (!req.user || !req.user.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userId = req.user.discordId;
    
    // Verify the character belongs to the authenticated user (check both regular and mod characters)
    let character = await Character.findOne({ _id: characterId, userId });
    if (!character) {
      character = await ModCharacter.findOne({ _id: characterId, userId });
    }
    if (!character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }
    
    // Get relationships where this character is the initiator (characterId)
    const outgoingRelationships = await Relationship.find({ characterId })
      .sort({ createdAt: -1 })
      .lean();
    
    // Get relationships where this character is the target (targetCharacterId)
    const incomingRelationships = await Relationship.find({ targetCharacterId: characterId })
      .sort({ createdAt: -1 })
      .lean();
    
    // Manually populate character data for both regular and mod characters
    const populateCharacterData = async (relationships, targetField) => {
      for (const relationship of relationships) {
        const targetId = relationship[targetField];
        
        // Try to find in regular characters first
        let foundCharacter = await Character.findById(targetId)
          .select('name race job currentVillage homeVillage icon isModCharacter modTitle modType')
          .lean();
        
        // If not found, try mod characters
        if (!foundCharacter) {
          foundCharacter = await ModCharacter.findById(targetId)
            .select('name race job currentVillage homeVillage icon isModCharacter modTitle modType')
            .lean();
        }
        
        // Set the populated data
        if (foundCharacter) {
          relationship[targetField] = foundCharacter;
        }
      }
    };
    
    // Populate character data for both outgoing and incoming relationships
    await populateCharacterData(outgoingRelationships, 'targetCharacterId');
    await populateCharacterData(incomingRelationships, 'characterId');
    
    // Transform incoming relationships to match the expected format
    const transformedIncomingRelationships = incomingRelationships.map(rel => ({
      ...rel,
      // Swap the fields to maintain consistency with outgoing relationships
      originalCharacterId: rel.characterId,
      originalTargetCharacterId: rel.targetCharacterId,
      characterId: rel.targetCharacterId, // This character is now the "characterId"
      targetCharacterId: rel.characterId, // The other character is now the "targetCharacterId"
      isIncoming: true, // Flag to identify incoming relationships
      originalCharacterName: rel.characterName,
      originalTargetCharacterName: rel.targetCharacterName,
      characterName: rel.targetCharacterName, // This character's name
      targetCharacterName: rel.characterName // The other character's name
    }));
    
    // Combine both types of relationships
    const allRelationships = [...outgoingRelationships, ...transformedIncomingRelationships];
    
    res.json({ relationships: allRelationships });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching character relationships:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: createRelationship -------------------
// Creates a new relationship between characters
app.post('/api/relationships', async (req, res) => {
  try {
    const { characterId, targetCharacterId, characterName, targetCharacterName, relationshipType, notes } = req.body;
    const userId = req.user.discordId;
    
    // Validate required fields
    if (!characterId || !targetCharacterId || !relationshipType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Verify the character belongs to the authenticated user (check both regular and mod characters)
    let character = await Character.findOne({ _id: characterId, userId });
    if (!character) {
      character = await ModCharacter.findOne({ _id: characterId, userId });
    }
    if (!character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }
    
    // Verify target character exists (check both regular and mod characters)
    let targetCharacterExists = await Character.findById(targetCharacterId);
    if (!targetCharacterExists) {
      targetCharacterExists = await ModCharacter.findById(targetCharacterId);
    }
    if (!targetCharacterExists) {
      return res.status(404).json({ error: 'Target character not found' });
    }
    
    // Check if relationship already exists between these characters for this user
    const existingRelationship = await Relationship.findOne({ 
      userId,
      characterId, 
      targetCharacterId
    });
    
    if (existingRelationship) {
      return res.status(409).json({ error: 'Relationship already exists between these characters' });
    }
    
    // Create new relationship
    
    const relationship = new Relationship({
      userId,
      characterId,
      targetCharacterId,
      characterName,
      targetCharacterName,
      relationshipTypes: Array.isArray(relationshipType) ? relationshipType : [relationshipType],
      notes: notes || ''
    });
    
    await relationship.save();
    
    // Manually populate target character info for response
    let populatedTargetCharacter = await Character.findById(targetCharacterId)
      .select('name race job currentVillage homeVillage icon isModCharacter modTitle modType')
      .lean();
    
    if (!populatedTargetCharacter) {
      populatedTargetCharacter = await ModCharacter.findById(targetCharacterId)
        .select('name race job currentVillage homeVillage icon isModCharacter modTitle modType')
        .lean();
    }
    
    const relationshipObj = relationship.toObject();
    if (populatedTargetCharacter) {
      relationshipObj.targetCharacterId = populatedTargetCharacter;
    }
    
    res.status(201).json({ 
      message: 'Relationship created successfully',
      relationship: relationshipObj
    });
  } catch (error) {
    console.error('[server.js]: Error creating relationship:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Relationship already exists between these characters' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: updateRelationship -------------------
// Updates an existing relationship
app.put('/api/relationships/:relationshipId', async (req, res) => {
  try {
    const { relationshipId } = req.params;
    const { characterId, targetCharacterId, characterName, targetCharacterName, relationshipType, notes } = req.body;
    const userId = req.user.discordId;
    
    // Validate required fields
    if (!characterId || !targetCharacterId || !relationshipType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Find the relationship and verify ownership
    const relationship = await Relationship.findOne({ _id: relationshipId, userId });
    if (!relationship) {
      return res.status(404).json({ error: 'Relationship not found or access denied' });
    }
    
    // Verify the character belongs to the authenticated user (check both regular and mod characters)
    let character = await Character.findOne({ _id: characterId, userId });
    if (!character) {
      character = await ModCharacter.findOne({ _id: characterId, userId });
    }
    if (!character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }
    
    // Verify target character exists (check both regular and mod characters)
    let targetCharacterExists = await Character.findById(targetCharacterId);
    if (!targetCharacterExists) {
      targetCharacterExists = await ModCharacter.findById(targetCharacterId);
    }
    if (!targetCharacterExists) {
      return res.status(404).json({ error: 'Target character not found' });
    }
    
    // Check if changing the target character would create a conflict with another relationship
    if (relationship.targetCharacterId.toString() !== targetCharacterId) {
      const existingRelationship = await Relationship.findOne({ 
        userId,
        characterId, 
        targetCharacterId
      });
      
      if (existingRelationship && existingRelationship._id.toString() !== relationshipId) {
        return res.status(409).json({ error: 'Relationship already exists between these characters' });
      }
    }
    
    // Update the relationship
    relationship.targetCharacterId = targetCharacterId;
    relationship.characterName = characterName;
    relationship.targetCharacterName = targetCharacterName;
    relationship.relationshipTypes = Array.isArray(relationshipType) ? relationshipType : [relationshipType];
    relationship.notes = notes || '';
    
    await relationship.save();
    
    // Manually populate target character info for response
    let populatedTargetCharacter = await Character.findById(relationship.targetCharacterId)
      .select('name race job currentVillage homeVillage icon isModCharacter modTitle modType')
      .lean();
    
    if (!populatedTargetCharacter) {
      populatedTargetCharacter = await ModCharacter.findById(relationship.targetCharacterId)
        .select('name race job currentVillage homeVillage icon isModCharacter modTitle modType')
        .lean();
    }
    
    const relationshipObj = relationship.toObject();
    if (populatedTargetCharacter) {
      relationshipObj.targetCharacterId = populatedTargetCharacter;
    }
    
    res.json({ 
      message: 'Relationship updated successfully',
      relationship: relationshipObj
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error updating relationship:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Relationship already exists between these characters' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: deleteRelationship -------------------
// Deletes a relationship
app.delete('/api/relationships/:relationshipId', async (req, res) => {
  try {
    const { relationshipId } = req.params;
    const userId = req.user.discordId;
    
    // Find and verify the relationship belongs to the authenticated user
    const relationship = await Relationship.findOne({ _id: relationshipId, userId });
    if (!relationship) {
      return res.status(404).json({ error: 'Relationship not found or access denied' });
    }
    
    await Relationship.findByIdAndDelete(relationshipId);
    
    res.json({ message: 'Relationship deleted successfully' });
  } catch (error) {
    console.error('[server.js]: ❌ Error deleting relationship:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: getAllRelationships -------------------
// Returns all relationships and characters for the "View All Relationships" feature
app.get('/api/relationships/all', async (req, res) => {
  try {
    console.log('[server.js]: 🌍 /api/relationships/all endpoint called');
    
    // Get ALL relationships (not just the user's) - optimized to avoid N+1 queries
    const relationships = await Relationship.find({})
      .sort({ createdAt: -1 })
      .lean();
    
    console.log('[server.js]: 🌍 Found relationships:', relationships.length);
    
    // Get all characters in parallel (both regular and mod characters)
    const [regularCharacters, modCharacters] = await Promise.all([
      Character.find({})
        .select('name race job currentVillage homeVillage icon userId isModCharacter')
        .sort({ name: 1 })
        .lean(),
      ModCharacter.find({})
        .select('name race job currentVillage homeVillage icon userId isModCharacter modTitle modType')
        .sort({ name: 1 })
        .lean()
    ]);
    
    console.log('[server.js]: 🌍 Found regular characters:', regularCharacters.length);
    console.log('[server.js]: 🌍 Found mod characters:', modCharacters.length);
    
    // Create a lookup map for efficient character finding
    const characterMap = new Map();
    
    // Add regular characters to map
    regularCharacters.forEach(char => {
      characterMap.set(char._id.toString(), char);
    });
    
    // Add mod characters to map (will override regular characters if same ID)
    modCharacters.forEach(char => {
      characterMap.set(char._id.toString(), char);
    });
    
    // Efficiently populate character data using the lookup map
    relationships.forEach(relationship => {
      // Populate characterId
      if (relationship.characterId) {
        const charId = relationship.characterId.toString();
        const foundCharacter = characterMap.get(charId);
        if (foundCharacter) {
          relationship.characterId = foundCharacter;
        }
      }
      
      // Populate targetCharacterId
      if (relationship.targetCharacterId) {
        const targetId = relationship.targetCharacterId.toString();
        const foundCharacter = characterMap.get(targetId);
        if (foundCharacter) {
          relationship.targetCharacterId = foundCharacter;
        }
      }
    });
    
    // Combine both character types
    const characters = [...regularCharacters, ...modCharacters];
    
    console.log('[server.js]: 🌍 Total characters:', characters.length);
    
    // Keep icon URLs as-is (no transformation needed for characters or relationships)
    
    console.log('[server.js]: 🌍 Sending response with', characters.length, 'characters and', relationships.length, 'relationships');
    
    res.json({ 
      relationships,
      characters
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching all relationships:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: getCharactersForRelationships -------------------
// Returns all characters for relationship selection (including mod characters)
app.get('/api/characters', async (req, res) => {
  try {
    const regularCharacters = await Character.find({})
      .select('name race job currentVillage homeVillage icon userId isModCharacter')
      .sort({ name: 1 })
      .lean();
    
    const modCharacters = await ModCharacter.find({})
      .select('name race job currentVillage homeVillage icon userId isModCharacter modTitle modType')
      .sort({ name: 1 })
      .lean();
    
    // Combine both character types
    const characters = [...regularCharacters, ...modCharacters];
    
    // Keep icon URLs as-is (no transformation needed)
    
    res.json({ characters });
  } catch (error) {
    logger.error('Error fetching characters for relationships', error, 'server.js');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: setupWeeklyCharacterRotation -------------------
// Sets up the weekly character rotation scheduler and initializes on server start
const setupWeeklyCharacterRotation = async () => {
  logger.schedule('Setting up weekly character rotation scheduler');
  
  // Check if there's already an active character of the week
  const existingCharacter = await CharacterOfWeek.findOne({ isActive: true });
  
  if (existingCharacter) {
    logger.character(`Current character of the week: ${existingCharacter.characterName}`);
    
    // Check if the existing character should be rotated based on Sunday midnight schedule
    const shouldRotate = checkIfShouldRotate(existingCharacter.startDate);
    
    if (shouldRotate) {
      logger.event('Rotating character of the week...');
      await rotateCharacterOfWeek();
    }
  } else {
    logger.info('No active character found, creating first character of the week');
    await rotateCharacterOfWeek();
  }
  
  // Setup weekly scheduler for Sunday midnight EST
  scheduleNextSundayMidnightRotation();
};

// ------------------- Function: checkIfShouldRotate -------------------
// Checks if the character should be rotated based on Sunday midnight schedule
const checkIfShouldRotate = (startDate) => {
  const now = new Date();
  const start = new Date(startDate);
  
  // Get the next Sunday midnight EST from the start date
  const nextSundayMidnight = getNextSundayMidnight(start);
  
  // If current time is past the next Sunday midnight, rotate
  return now >= nextSundayMidnight;
};

// ------------------- Function: getNextSundayMidnight -------------------
// Gets the next Sunday midnight EST from a given date
const getNextSundayMidnight = (fromDate) => {
  const date = new Date(fromDate);
  
  // Set to EST timezone (UTC-5, or UTC-4 during daylight saving)
  // For simplicity, we'll use UTC-5 (EST) - you may want to handle DST properly
  const estOffset = -5 * 60 * 60 * 1000; // 5 hours in milliseconds
  
  // Get the day of week (0 = Sunday, 1 = Monday, etc.)
  const dayOfWeek = date.getUTCDay();
  
  // Calculate days until next Sunday
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  
  // Create the next Sunday midnight EST
  const nextSunday = new Date(date);
  nextSunday.setUTCDate(date.getUTCDate() + daysUntilSunday);
  nextSunday.setUTCHours(5, 0, 0, 0); // 5 AM UTC = 12 AM EST
  
  return nextSunday;
};

// ------------------- Function: scheduleNextSundayMidnightRotation -------------------
// Schedules the next rotation for Sunday midnight EST
const scheduleNextSundayMidnightRotation = () => {
  const now = new Date();
  const nextSundayMidnight = getNextSundayMidnight(now);
  
  const timeUntilNextRotation = nextSundayMidnight.getTime() - now.getTime();
  
  setTimeout(async () => {
    try {
      logger.event('Executing scheduled character rotation');
      await rotateCharacterOfWeek();
      
      // Schedule the next rotation
      scheduleNextSundayMidnightRotation();
      
    } catch (error) {
      logger.error('Error in scheduled weekly character rotation', error);
      // Schedule next rotation even if this one failed
      scheduleNextSundayMidnightRotation();
    }
  }, timeUntilNextRotation);
};

// ============================================================================
// ------------------- Section: Map System API Routes -------------------

// Serve local map files
app.use('/map-files', express.static('2025 Map Stuff'));

// Get map layers (using mapModel data)
app.get('/api/map/layers', async (req, res) => {
  try {
    // Get basic layers plus exploration squares
    const squares = await Square.getVisibleSquares();
    
    const layers = [
      { 
        id: 'base', 
        name: 'Base Map', 
        type: 'tile', 
        visible: true, 
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' 
      },
      { 
        id: 'exploration', 
        name: 'Exploration Squares', 
        type: 'overlay', 
        visible: true,
        squares: squares.map(square => ({
          id: square.squareId || square.id,
          region: square.region || 'Unknown',
          status: square.status || 'unexplored',
          center: square.mapCoordinates?.center || square.center,
          bounds: square.mapCoordinates?.bounds || square.bounds,
          image: square.image || '/images/placeholder-square.png',
          progress: square.getExplorationProgress ? square.getExplorationProgress() : { explored: 0, total: 4, percentage: 0 }
        }))
      },
      { id: 'villages', name: 'Villages', type: 'marker', visible: false },
      { id: 'quests', name: 'Quests', type: 'marker', visible: false },
      { id: 'weather', name: 'Weather', type: 'overlay', visible: false }
    ];
    
    res.set({
      'Cache-Control': 'public, max-age=300', // 5 minutes cache
      'ETag': `"map-layers-${Date.now()}"`
    });
    
    res.json(layers);
  } catch (error) {
    console.error('[server.js]: Error fetching map layers:', error);
    res.status(500).json({ error: 'Failed to fetch map layers' });
  }
});


// Get exploration square details
app.get('/api/map/squares/:squareId', async (req, res) => {
  try {
    const { squareId } = req.params;
    const square = await Square.findOne({ squareId: squareId });
    
    if (!square) {
      return res.status(404).json({ error: 'Square not found' });
    }
    
    res.json({
      squareId: square.squareId,
      region: square.region,
      status: square.status,
      quadrants: square.quadrants,
      image: square.image,
      mapCoordinates: square.mapCoordinates,
      progress: square.getExplorationProgress ? square.getExplorationProgress() : { explored: 0, total: 4, percentage: 0 },
      totalDiscoveries: square.getTotalDiscoveries ? square.getTotalDiscoveries() : 0
    });
  } catch (error) {
    console.error('[server.js]: Error fetching square details:', error);
    res.status(500).json({ error: 'Failed to fetch square details' });
  }
});

// Get user's pins
app.get('/api/map/user-pins', async (req, res) => {
  try {
    const userId = req.user.discordId;
    
    const user = await User.findOne({ discordId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const pins = user.getMapPins();
    res.json(pins);
  } catch (error) {
    console.error('[server.js]: Error fetching user pins:', error);
    res.status(500).json({ error: 'Failed to fetch user pins' });
  }
});

// Create a new user pin
app.post('/api/map/user-pins', pinImageUpload.single('image'), async (req, res) => {
  try {
    const userId = req.user.discordId;
    
    const user = await User.findOne({ discordId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { title, description, lat, lng, icon, color } = req.body;
    
    // Validate required fields
    if (!title || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Title and coordinates (lat, lng) are required' });
    }
    
    const pinData = {
      title,
      description: description || '',
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      icon: icon || 'fas fa-thumbtack',
      color: color || '#FFD700'
    };
    
    // Handle image upload if provided
    if (req.file) {
      try {
        const imageUrl = await uploadPinImageToGCS(req.file, `user_pin_${Date.now()}`);
        if (imageUrl) {
          pinData.imageUrl = imageUrl;
        }
      } catch (uploadError) {
        console.error('[server.js]: Error uploading user pin image:', uploadError);
        // Don't fail the pin creation if image upload fails
      }
    }
    
    const result = await user.addMapPin(pinData);
    
    res.status(201).json(result);
  } catch (error) {
    console.error('[server.js]: Error creating user pin:', error);
    res.status(500).json({ error: 'Failed to create user pin' });
  }
});

// Delete a user pin
app.delete('/api/map/user-pins/:pinId', async (req, res) => {
  try {
    const userId = req.user.discordId;
    const { pinId } = req.params;
    
    const user = await User.findOne({ discordId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const result = await user.removeMapPin(pinId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('[server.js]: Error deleting user pin:', error);
    res.status(500).json({ error: 'Failed to delete user pin' });
  }
});



// ============================================================================
// ------------------- Section: Daily Reset Reminder Scheduler -------------------
// Sends daily reset reminders at 8am EST every day
// ============================================================================

// ------------------- Function: getNext8amEST -------------------
// Gets the next 8am EST from current time
const getNext8amEST = (fromDate) => {
  const date = new Date(fromDate);
  
  // 8 AM EST = 1 PM UTC (during standard time) or 12 PM UTC (during daylight saving)
  // We'll use 1 PM UTC = 8 AM EST for consistency
  const next8am = new Date(date);
  next8am.setUTCHours(13, 0, 0, 0); // 1 PM UTC = 8 AM EST
  
  // If we've already passed 8am today, schedule for tomorrow
  if (date >= next8am) {
    next8am.setUTCDate(next8am.getUTCDate() + 1);
  }
  
  return next8am;
};

// ------------------- Function: scheduleNext8amReminder -------------------
// Schedules the next daily reset reminder for 8am EST
const scheduleNext8amReminder = () => {
  const now = new Date();
  const next8am = getNext8amEST(now);
  
  const timeUntilNext8am = next8am.getTime() - now.getTime();
  
  const hours = Math.floor(timeUntilNext8am / (1000 * 60 * 60));
  const minutes = Math.floor((timeUntilNext8am % (1000 * 60 * 60)) / (1000 * 60));
  logger.schedule(`Next daily reset reminder: ${next8am.toLocaleString('en-US', { timeZone: 'America/New_York' })} (${hours}h ${minutes}m)`);
  
  setTimeout(async () => {
    try {
      logger.event('Executing scheduled daily reset reminder');
      await notificationService.sendDailyResetReminders();
      
      // Schedule the next reminder
      scheduleNext8amReminder();
      
    } catch (error) {
      logger.error('Error in scheduled daily reset reminder', error);
      // Schedule next reminder even if this one failed
      scheduleNext8amReminder();
    }
  }, timeUntilNext8am);
};

// ------------------- Function: setupDailyResetReminders -------------------
// Sets up the daily reset reminder scheduler
const setupDailyResetReminders = () => {
  logger.schedule('Setting up daily reset reminder scheduler (8am EST)');
  scheduleNext8amReminder();
};

// ============================================================================
// ------------------- Section: Blood Moon Alert Scheduler -------------------
// Sends blood moon alerts at midnight the day before blood moon starts
// ============================================================================

// ------------------- Function: getNextMidnightEST -------------------
// Gets the next midnight EST from current time
const getNextMidnightEST = (fromDate) => {
  const date = new Date(fromDate);
  
  // Midnight EST = 5 AM UTC (during standard time) or 4 AM UTC (during daylight saving)
  // We'll use 5 AM UTC = Midnight EST for consistency
  const nextMidnight = new Date(date);
  nextMidnight.setUTCHours(5, 0, 0, 0); // 5 AM UTC = Midnight EST
  
  // If we've already passed midnight today, schedule for tomorrow
  if (date >= nextMidnight) {
    nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
  }
  
  return nextMidnight;
};

// ------------------- Function: checkIfTodayIsBeforeBloodMoon -------------------
// Checks if today is the day before a blood moon event
const checkIfTodayIsBeforeBloodMoon = () => {
  const { bloodmoonDates } = require('../bot/modules/calendarModule');
  
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const today = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
  
  if (!bloodmoonDates || !Array.isArray(bloodmoonDates)) {
    return false;
  }
  
  for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const bloodMoonDate = new Date(today.getFullYear(), month - 1, day);
    const dayBefore = new Date(bloodMoonDate);
    dayBefore.setDate(bloodMoonDate.getDate() - 1);
    
    if (today.getTime() === dayBefore.getTime()) {
      return true;
    }
  }
  
  return false;
};

// ------------------- Function: scheduleNextMidnightBloodMoonCheck -------------------
// Schedules the next blood moon check at midnight EST
const scheduleNextMidnightBloodMoonCheck = () => {
  const now = new Date();
  const nextMidnight = getNextMidnightEST(now);
  
  const timeUntilMidnight = nextMidnight.getTime() - now.getTime();
  
  const hours = Math.floor(timeUntilMidnight / (1000 * 60 * 60));
  const minutes = Math.floor((timeUntilMidnight % (1000 * 60 * 60)) / (1000 * 60));
  logger.schedule(`Next blood moon check: ${nextMidnight.toLocaleString('en-US', { timeZone: 'America/New_York' })} (${hours}h ${minutes}m)`);
  
  setTimeout(async () => {
    try {
      logger.event('Executing blood moon check at midnight');
      
      // Check if today is the day before blood moon
      if (checkIfTodayIsBeforeBloodMoon()) {
        logger.custom('🌑', 'Today is the day before Blood Moon! Sending alerts...', '\x1b[35m');
        
        const bloodMoonData = {
          description: '⚠️ **Beware!** Tonight the Blood Moon starts at **8 PM EST**!',
          fields: [
            {
              name: '🌙 Blood Moon Event',
              value: 'The ominous red glow will appear in the sky starting at 8 PM EST tonight. Prepare yourself!',
              inline: false
            },
            {
              name: '⏰ Start Time',
              value: '8:00 PM EST',
              inline: true
            },
            {
              name: '📅 Duration',
              value: 'Until 8:00 AM EST',
              inline: true
            },
            {
              name: '💀 Warning',
              value: 'Monsters will be more dangerous during this period. Stay safe!',
              inline: false
            }
          ]
        };
        
        await notificationService.sendBloodMoonAlerts(bloodMoonData);
      }
      
      // Schedule the next check
      scheduleNextMidnightBloodMoonCheck();
      
    } catch (error) {
      logger.error('Error in scheduled blood moon check', error);
      // Schedule next check even if this one failed
      scheduleNextMidnightBloodMoonCheck();
    }
  }, timeUntilMidnight);
};

// ------------------- Function: setupBloodMoonAlerts -------------------
// Sets up the blood moon alert scheduler
const setupBloodMoonAlerts = () => {
  logger.schedule('Setting up blood moon alert scheduler (midnight EST)');
  scheduleNextMidnightBloodMoonCheck();
};

// ============================================================================
// ------------------- Section: Blight Call Notification Scheduler -------------------
// Sends blight call notifications 15 minutes before the daily blight call at 8pm EST
// ============================================================================

// ------------------- Function: getNext745pmEST -------------------
// Gets the next 7:45pm EST from current time
const getNext745pmEST = (fromDate) => {
  const date = new Date(fromDate);
  
  // 7:45 PM EST = 12:45 AM UTC next day (during standard time, UTC-5)
  // 7:45 PM EDT = 11:45 PM UTC (during daylight saving, UTC-4)
  // We'll use 0:45 UTC (12:45 AM) = 7:45 PM EST for consistency
  const next745pm = new Date(date);
  next745pm.setUTCHours(0, 45, 0, 0); // 0:45 UTC = 7:45 PM EST (or 8:45 PM EDT)
  
  // If we've already passed 7:45pm today, schedule for tomorrow
  if (date >= next745pm) {
    next745pm.setUTCDate(next745pm.getUTCDate() + 1);
  }
  
  return next745pm;
};

// ------------------- Function: scheduleNextBlightCallNotification -------------------
// Schedules the next blight call notification for 7:45pm EST (15 minutes before 8pm)
const scheduleNextBlightCallNotification = () => {
  const now = new Date();
  const next745pm = getNext745pmEST(now);
  
  const timeUntilNext745pm = next745pm.getTime() - now.getTime();
  
  const hours = Math.floor(timeUntilNext745pm / (1000 * 60 * 60));
  const minutes = Math.floor((timeUntilNext745pm % (1000 * 60 * 60)) / (1000 * 60));
  logger.schedule(`Next blight call notification: ${next745pm.toLocaleString('en-US', { timeZone: 'America/New_York' })} (${hours}h ${minutes}m)`);
  
  setTimeout(async () => {
    try {
      logger.event('Executing scheduled blight call notification');
      await notificationService.sendBlightCallNotifications();
      
      // Schedule the next notification
      scheduleNextBlightCallNotification();
      
    } catch (error) {
      logger.error('Error in scheduled blight call notification', error);
      // Schedule next notification even if this one failed
      scheduleNextBlightCallNotification();
    }
  }, timeUntilNext745pm);
};

// ------------------- Function: setupBlightCallNotifications -------------------
// Sets up the blight call notification scheduler
const setupBlightCallNotifications = () => {
  logger.schedule('Setting up blight call notification scheduler (7:45pm EST)');
  scheduleNextBlightCallNotification();
};

// ------------------- Function: rotateCharacterOfWeek -------------------
// Helper function to rotate the character of the week
const rotateCharacterOfWeek = async () => {
  try {
    // Get all active characters
    const characters = await Character.find({}).lean();
    
    if (characters.length === 0) {
      console.log('[server.js]: No characters found for rotation');
      return;
    }
    
    // Get all characters that have ever been featured
    const allFeaturedCharacters = await CharacterOfWeek.find({}).distinct('characterId');
    
    // Find characters that have never been featured
    const neverFeaturedCharacters = characters.filter(char => 
      !allFeaturedCharacters.includes(char._id.toString())
    );
    
    // If there are characters that have never been featured, prioritize them
    if (neverFeaturedCharacters.length > 0) {
      const randomCharacter = neverFeaturedCharacters[Math.floor(Math.random() * neverFeaturedCharacters.length)];
      await createNewCharacterOfWeek(randomCharacter);
      return;
    }
    
    // If all characters have been featured at least once, find the one featured longest ago
    const characterLastFeaturedDates = {};
    
    // Initialize all characters with a very old date (in case they've never been featured)
    characters.forEach(char => {
      characterLastFeaturedDates[char._id.toString()] = new Date(0);
    });
    
    // Get the most recent featured date for each character
    const featuredHistory = await CharacterOfWeek.find({}).sort({ startDate: -1 });
    featuredHistory.forEach(entry => {
      const charId = entry.characterId.toString();
      if (characterLastFeaturedDates[charId] && entry.startDate > characterLastFeaturedDates[charId]) {
        characterLastFeaturedDates[charId] = entry.startDate;
      }
    });
    
    // Find the character featured longest ago
    let oldestFeaturedCharacter = null;
    let oldestDate = new Date();
    
    for (const [charId, lastFeaturedDate] of Object.entries(characterLastFeaturedDates)) {
      if (lastFeaturedDate < oldestDate) {
        oldestDate = lastFeaturedDate;
        oldestFeaturedCharacter = characters.find(char => char._id.toString() === charId);
      }
    }
    
    if (oldestFeaturedCharacter) {
      await createNewCharacterOfWeek(oldestFeaturedCharacter);
    } else {
      console.log('[server.js]: Could not determine character to feature');
    }
    
  } catch (error) {
    console.error('[server.js]: Error in rotateCharacterOfWeek:', error);
    throw error;
  }
};

// ------------------- Function: createNewCharacterOfWeek -------------------
// Helper function to create a new character of the week entry
const createNewCharacterOfWeek = async (character) => {
  try {
    // Deactivate current character of the week
    await CharacterOfWeek.updateMany(
      { isActive: true },
      { isActive: false }
    );
    
    // Calculate start and end dates based on Sunday midnight schedule
    const startDate = new Date();
    const endDate = getNextSundayMidnight(startDate);
    
    // Create new character of the week
    const newCharacterOfWeek = new CharacterOfWeek({
      characterId: character._id,
      characterName: character.name,
      userId: character.userId,
      startDate,
      endDate,
      isActive: true,
      featuredReason: 'Weekly rotation'
    });
    
    await newCharacterOfWeek.save();
    
    console.log(`[server.js]: Successfully rotated to new character of the week: ${character.name}`);
    
  } catch (error) {
    console.error('[server.js]: ❌ Error in createNewCharacterOfWeek:', error);
    throw error;
  }
};

// ------------------- Function: triggerFirstCharacterOfWeekSimple -------------------
// Simple trigger for first character of the week (no auth required for testing)
app.post('/api/character-of-week/trigger-simple', async (req, res) => {
  try {
    
    // Check if there's already an active character of the week
    const existingCharacter = await CharacterOfWeek.findOne({ isActive: true });
    if (existingCharacter) {
      
      // Check if the existing character should be rotated based on Sunday midnight schedule
      const shouldRotate = checkIfShouldRotate(existingCharacter.startDate);
      
      if (shouldRotate) {
        console.log('[server.js]: 🔄 Triggering rotation due to Sunday midnight schedule');
        await rotateCharacterOfWeek();
        const newCharacter = await CharacterOfWeek.findOne({ isActive: true }).populate('characterId');
        return res.json({ 
          data: newCharacter,
          message: `Rotated character of the week: ${newCharacter.characterName}` 
        });
      } else {
        const now = new Date();
        const nextRotation = getNextSundayMidnight(existingCharacter.startDate);
        const daysUntilRotation = (nextRotation - now) / (1000 * 60 * 60 * 24);
        
        return res.json({ 
          data: existingCharacter,
          message: `Character of the week already exists: ${existingCharacter.characterName} (${daysUntilRotation.toFixed(1)} days until Sunday midnight rotation)` 
        });
      }
    }
    
    // Get all active characters
    const characters = await Character.find({}).lean();
    
    if (characters.length === 0) {    
      return res.status(404).json({ error: 'No characters found' });
    }
    
    
    // Use the rotation function to create the first character
    await rotateCharacterOfWeek();
    
    const newCharacter = await CharacterOfWeek.findOne({ isActive: true }).populate('characterId');
    
    res.json({ 
      data: newCharacter,
      message: `Created character of the week: ${newCharacter.characterName}` 
    });
  } catch (error) { 
    console.error('[server.js]: ❌ Error in triggerFirstCharacterOfWeekSimple:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: getCharacterRotationStatus -------------------
// Returns the current status of character rotation for debugging
app.get('/api/character-of-week/rotation-status', async (req, res) => {
  try {
    // Get all characters
    const characters = await Character.find({}).lean();
    
    // Get all featured characters with their last featured date
    const featuredHistory = await CharacterOfWeek.find({}).sort({ startDate: -1 });
    
    // Build rotation status
    const rotationStatus = {
      totalCharacters: characters.length,
      characters: characters.map(char => {
        const charHistory = featuredHistory.filter(entry => 
          entry.characterId.toString() === char._id.toString()
        );
        
        const lastFeatured = charHistory.length > 0 ? charHistory[0].startDate : null;
        const featuredCount = charHistory.length;
        
        return {
          id: char._id,
          name: char.name,
          lastFeatured: lastFeatured,
          featuredCount: featuredCount,
          daysSinceLastFeatured: lastFeatured ? 
            Math.floor((Date.now() - new Date(lastFeatured).getTime()) / (1000 * 60 * 60 * 24)) : 
            null
        };
      }),
      currentCharacter: null,
      nextRotation: null
    };
    
    // Get current active character
    const currentCharacter = await CharacterOfWeek.findOne({ isActive: true });
    if (currentCharacter) {
      rotationStatus.currentCharacter = {
        id: currentCharacter.characterId,
        name: currentCharacter.characterName,
        startDate: currentCharacter.startDate,
        endDate: currentCharacter.endDate
      };
      
      rotationStatus.nextRotation = getNextSundayMidnight(currentCharacter.startDate);
    }
    
    // Sort characters by last featured date (oldest first)
    rotationStatus.characters.sort((a, b) => {
      if (!a.lastFeatured && !b.lastFeatured) return 0;
      if (!a.lastFeatured) return -1;
      if (!b.lastFeatured) return 1;
      return new Date(a.lastFeatured) - new Date(b.lastFeatured);
    });
    
    res.json({ 
      data: rotationStatus,
      message: 'Character rotation status retrieved successfully'
    });
    
  } catch (error) {
    console.error('[server.js]: ❌ Error getting character rotation status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: getGuildMemberInfo -------------------
// Returns Discord guild member information including join date
app.get('/api/user/guild-info', async (req, res) => {
  try {
    // Check authentication
    if (!req.session?.user?.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.session.user.discordId;
    const guildId = process.env.PROD_GUILD_ID;
    
    if (!guildId) {
      console.error('[server.js]: ❌ PROD_GUILD_ID not configured');
      return res.status(500).json({ error: 'Guild ID not configured' });
    }
    
    
    // Fetch guild member information from Discord API
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return res.json({ 
          joinedAt: null, 
          message: 'User not found in guild',
          inGuild: false 
        });
      }
      throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
    }
    
    const memberData = await response.json();
    const joinedAt = memberData.joined_at ? new Date(memberData.joined_at) : null;
    
    
    res.json({
      joinedAt: joinedAt ? joinedAt.toISOString() : null,
      inGuild: true,
      roles: memberData.roles || [],
      nick: memberData.nick || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch guild member information' });
  }
});

// ------------------- Function: getGuildInfo -------------------
// Returns general guild information
app.get('/api/guild/info', async (req, res) => {
  try {
    const guildId = process.env.PROD_GUILD_ID;
    const RESIDENT_ROLE = '788137728943325185';
    const INACTIVE_ROLE = '788148064182730782';
    if (!guildId) {
      console.error('[server.js]: ❌ PROD_GUILD_ID not configured');
      return res.status(500).json({ error: 'Guild ID not configured' });
    }
    // Fetch guild information
    const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    if (!guildResponse.ok) {
      throw new Error(`Discord API error: ${guildResponse.status} ${guildResponse.statusText}`);
    }
    const guildData = await guildResponse.json();
    // Get guild icon URL if available
    const iconUrl = guildData.icon 
      ? `https://cdn.discordapp.com/icons/${guildId}/${guildData.icon}.png`
      : null;
    // Fetch all members
    let after = null;
    let allMembers = [];
    let hasMore = true;
    while (hasMore) {
      const url = new URL(`https://discord.com/api/v10/guilds/${guildId}/members`);
      url.searchParams.set('limit', '1000');
      if (after) url.searchParams.set('after', after);
      const membersResponse = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      if (!membersResponse.ok) {
        throw new Error(`Discord API error: ${membersResponse.status} ${membersResponse.statusText}`);
      }
      const members = await membersResponse.json();
      allMembers = allMembers.concat(members);
      if (members.length < 1000) {
        hasMore = false;
      } else {
        after = members[members.length - 1].user.id;
      }
    }
    // Count residents and inactive
    let residentCount = 0;
    let inactiveCount = 0;
    
    for (const member of allMembers) {
      const roles = member.roles || [];
      if (roles.includes(RESIDENT_ROLE)) {
        residentCount++;
      }
      if (roles.includes(INACTIVE_ROLE)) {
        inactiveCount++;
      }
    }
    
    res.json({
      id: guildData.id,
      name: guildData.name,
      description: guildData.description || 'A community server for Tinglebot users to play together, share experiences, and enjoy the RPG system.',
      icon: iconUrl,
      memberCount: residentCount,
      inactiveCount,
      features: guildData.features || []
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch guild information' });
  }
});

// ------------------- Function: joinGuild -------------------
// Generates an invite link for the guild
app.post('/api/guild/join', async (req, res) => {
  try {
    const guildId = process.env.PROD_GUILD_ID;
    
    if (!guildId) {
      console.error('[server.js]: ❌ PROD_GUILD_ID not configured');
      return res.status(500).json({ error: 'Guild ID not configured' });
    }
    
    
    // Create an invite link for the guild
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/invites`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        max_age: 0, // Never expires
        max_uses: 0, // Unlimited uses
        temporary: false,
        unique: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
    }
    
    const inviteData = await response.json();
    const inviteUrl = `https://discord.gg/${inviteData.code}`;
    
    
    res.json({
      success: true,
      inviteUrl: inviteUrl,
      code: inviteData.code,
      expiresAt: inviteData.expires_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate guild invite link' });
  }
});

// ------------------- Function: getServerActivity -------------------
// Returns server activity statistics
app.get('/api/guild/activity', async (req, res) => {
  try {
    const guildId = process.env.PROD_GUILD_ID;
    
    if (!guildId) {
      return res.status(500).json({ error: 'Guild ID not configured' });
    }
    
    // Fetch guild data
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }
    
    const guildData = await response.json();
    
    // Get real-time data from Gateway
    const gateway = getDiscordGateway();
    const presences = await gateway.getGuildPresences(guildId);
    const voiceCount = await gateway.getVoiceChannelMembers(guildId);
    
    // Get message count for today
    const messagesToday = await MessageTracking.getTodayMessageCount(guildId);
    
    res.json({
      onlineCount: presences ? (presences.online + presences.idle + presences.dnd) : (guildData.approximate_presence_count || 0),
      voiceCount: voiceCount,
      messagesToday: messagesToday,
      boostCount: guildData.premium_subscription_count || 0
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching server activity:', error);
    res.status(500).json({ error: 'Failed to fetch server activity' });
  }
});

// ------------------- Function: getOnlineMembers -------------------
// Returns list of online members
app.get('/api/guild/online-members', async (req, res) => {
  try {
    const guildId = process.env.PROD_GUILD_ID;
    
    if (!guildId) {
      return res.status(500).json({ error: 'Guild ID not configured' });
    }
    
    // Fetch guild members
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }
    
    const members = await response.json();
    
    // Format member data (limited to first 50)
    const formattedMembers = members.slice(0, 50).map(member => ({
      id: member.user.id,
      username: member.user.username,
      discriminator: member.user.discriminator,
      avatar: member.user.avatar 
        ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png`
        : null,
      status: 'online',
      activity: null
    }));
    
    res.json({
      members: formattedMembers
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching online members:', error);
    res.status(500).json({ error: 'Failed to fetch online members' });
  }
});

// ------------------- Function: getServerStats -------------------
// Returns server statistics
app.get('/api/guild/stats', async (req, res) => {
  try {
    const guildId = process.env.PROD_GUILD_ID;
    
    if (!guildId) {
      return res.status(500).json({ error: 'Guild ID not configured' });
    }
    
    // Fetch guild data
    const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
      }
    });
    
    if (!guildResponse.ok) {
      throw new Error(`Discord API error: ${guildResponse.status}`);
    }
    
    const guildData = await guildResponse.json();
    
    // Fetch channels
    const channelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
      }
    });
    
    let textChannels = 0;
    let voiceChannels = 0;
    
    if (channelsResponse.ok) {
      const channels = await channelsResponse.json();
      textChannels = channels.filter(c => c.type === 0).length;
      voiceChannels = channels.filter(c => c.type === 2).length;
    }
    
    // Fetch members for latest member
    const membersResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
      }
    });
    
    let latestMember = 'N/A';
    if (membersResponse.ok) {
      const members = await membersResponse.json();
      if (members.length > 0) {
        latestMember = members[members.length - 1].user.username;
      }
    }
    
    // Calculate server age
    const createdTimestamp = Number(BigInt(guildData.id) >> BigInt(22)) + 1420070400000;
    const serverAge = calculateServerAge(createdTimestamp);
    
    // Get owner info
    const ownerResponse = await fetch(`https://discord.com/api/v10/users/${guildData.owner_id}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
      }
    });
    
    let serverOwner = 'N/A';
    if (ownerResponse.ok) {
      const owner = await ownerResponse.json();
      serverOwner = owner.username;
    }
    
    res.json({
      textChannels,
      voiceChannels,
      rolesCount: guildData.roles?.length || 0,
      serverAge,
      latestMember,
      serverOwner
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching server stats:', error);
    res.status(500).json({ error: 'Failed to fetch server stats' });
  }
});

// Helper function to calculate server age
function calculateServerAge(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const years = Math.floor(days / 365);
  const remainingDays = days % 365;
  
  if (years > 0) {
    return `${years} year${years !== 1 ? 's' : ''}, ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
  }
  return `${days} day${days !== 1 ? 's' : ''}`;
}

// ------------------- Function: getRoleDistribution -------------------
// Returns role distribution data
app.get('/api/guild/roles', async (req, res) => {
  try {
    const guildId = process.env.PROD_GUILD_ID;
    
    if (!guildId) {
      return res.status(500).json({ error: 'Guild ID not configured' });
    }
    
    // Fetch guild with roles
    const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
      }
    });
    
    if (!guildResponse.ok) {
      throw new Error(`Discord API error: ${guildResponse.status}`);
    }
    
    const guildData = await guildResponse.json();
    
    // Fetch members to count role assignments
    const membersResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
      }
    });
    
    if (!membersResponse.ok) {
      throw new Error(`Discord API error: ${membersResponse.status}`);
    }
    
    const members = await membersResponse.json();
    
    // Count unique members per role
    const roleCounts = {};
    members.forEach(member => {
      member.roles.forEach(roleId => {
        roleCounts[roleId] = (roleCounts[roleId] || 0) + 1;
      });
    });
    
    // Format role data
    const roles = guildData.roles
      .filter(role => role.name !== '@everyone')
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#99aab5',
        memberCount: roleCounts[role.id] || 0,
        position: role.position
      }))
      .filter(role => role.memberCount > 0);
    
    res.json({ roles });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching role distribution:', error);
    res.status(500).json({ error: 'Failed to fetch role distribution' });
  }
});

// ------------------- Function: getDiscordEvents -------------------
// Returns upcoming Discord events
app.get('/api/guild/events', async (req, res) => {
  try {
    const guildId = process.env.PROD_GUILD_ID;
    
    if (!guildId) {
      return res.status(500).json({ error: 'Guild ID not configured' });
    }
    
    // Fetch scheduled events
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/scheduled-events?with_user_count=true`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
      }
    });
    
    if (!response.ok) {
      return res.json({ events: [] });
    }
    
    const eventsData = await response.json();
    
    // Format event data
    const events = eventsData
      .filter(event => event.status !== 3)
      .map(event => ({
        id: event.id,
        name: event.name,
        description: event.description,
        startTime: event.scheduled_start_time,
        endTime: event.scheduled_end_time,
        location: event.entity_metadata?.location || 'Discord',
        interestedCount: event.user_count || 0,
        status: event.status
      }));
    
    res.json({ events });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching Discord events:', error);
    res.json({ events: [] });
  }
});

// ------------------- Function: getAnnouncements -------------------
// Returns recent announcements from announcement channels
app.get('/api/guild/announcements', async (req, res) => {
  try {
    const guildId = process.env.PROD_GUILD_ID;
    
    if (!guildId) {
      return res.status(500).json({ error: 'Guild ID not configured' });
    }
    
    // Get announcement channel ID
    const announcementChannelId = process.env.ANNOUNCEMENT_CHANNEL_ID || '606004354419392513';
    
    if (!announcementChannelId) {
      return res.json({ announcements: [] });
    }
    
    // Fetch recent messages from announcement channel
    const response = await fetch(`https://discord.com/api/v10/channels/${announcementChannelId}/messages?limit=5`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
      }
    });
    
    if (!response.ok) {
      return res.json({ announcements: [] });
    }
    
    const messages = await response.json();
    
    // Format announcement data
    const announcements = messages.map(msg => ({
      id: msg.id,
      content: msg.content,
      contentPreview: msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''),
      isTruncated: msg.content.length > 200,
      authorName: msg.author.username,
      authorAvatar: msg.author.avatar 
        ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png`
        : null,
      timestamp: msg.timestamp
    }));
    
    res.json({ announcements });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching announcements:', error);
    res.json({ announcements: [] });
  }
});

// ------------------- Section: Image Proxy Routes -------------------

// ------------------- Function: proxyImage -------------------
// Proxies images from Google Cloud Storage with caching headers
app.get('/api/images/*', async (req, res) => {
  try {
    // Get the full path after /api/images/
    const fullPath = req.params[0];
    const url = `https://storage.googleapis.com/tinglebot/${fullPath}`;

    
    const response = await fetch(url);
    if (!response.ok) {

      throw new Error('Image not found');
    }
    
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Content-Type', response.headers.get('content-type'));
    res.set('Cache-Control', 'public, max-age=31536000');
    
    response.body.pipe(res);
  } catch (error) {

    res.status(404).send('Image not found');
  }
});

// ------------------- Section: Admin User Management -------------------

// Get user activity data for admin management
app.get('/api/admin/users/activity', async (req, res) => {
  try {
    // Check if user is authenticated and has admin role
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has admin role in Discord
    let isAdmin = false;
    const guildId = process.env.PROD_GUILD_ID;
    
    if (guildId && req.user) {
      try {
        const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
          headers: {
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const memberData = await response.json();
          const roles = memberData.roles || [];
          const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
          if (!ADMIN_ROLE_ID) {
            isAdmin = false;
          } else {
            isAdmin = roles.includes(ADMIN_ROLE_ID);
          }
        } else {
          console.warn(`[server.js]: Discord API error: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.error('[server.js]: Error checking admin status:', error);
        isAdmin = false;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get all users with their message activity data
    const totalUsers = await User.countDocuments();
    
    if (totalUsers === 0) {
      return res.json({
        users: [],
        summary: {
          total: 0,
          active: 0,
          inactive: 0,
          activePercentage: 0
        },
        threshold: {
          threeMonthsAgo: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          currentTime: new Date().toISOString()
        }
      });
    }
    
    // Declare users variable outside try block so it's accessible throughout the function
    let users = [];
    
    try {
      users = await User.aggregate([
        {
          $group: {
            _id: '$discordId',
            username: { $first: '$username' },
            discriminator: { $first: '$discriminator' },
            avatar: { $first: '$avatar' },
            tokens: { $first: '$tokens' },
            characterSlot: { $first: '$characterSlot' },
            status: { $first: '$status' },
            createdAt: { $first: '$createdAt' },
            lastMessageContent: { $first: '$lastMessageContent' },
            lastMessageTimestamp: { $first: '$lastMessageTimestamp' }
          }
        },
        {
          $sort: { lastMessageTimestamp: -1, username: 1 }
        }
      ]);
    } catch (aggregationError) {
      console.error('[server.js]: Error in user aggregation:', aggregationError);
      return res.status(500).json({ error: 'Failed to aggregate user data' });
    }

    // Get character counts and Discord roles for each user
    const usersWithCharacters = await Promise.all(
      users.map(async (user) => {
        let characterCount = 0;
        let discordRoles = user.roles || [];
        
        try {
          characterCount = await Character.countDocuments({ 
            userId: user._id, // Use _id from aggregated result (which is discordId due to $group)
            name: { $nin: ['Tingle', 'Tingle test', 'John'] }
          });
        } catch (error) {
          console.warn(`[server.js]: ⚠️ Error counting characters for user ${user._id}:`, error.message);
          characterCount = 0;
        }
        
        // Always fetch Discord roles from Discord API since they're not stored in the database
        try {
          const guildId = process.env.PROD_GUILD_ID;
          const botToken = process.env.DISCORD_TOKEN;
          
          if (guildId && botToken) {
            const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${user._id}`, {
              headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const memberData = await response.json();
              discordRoles = memberData.roles || [];
            } else if (response.status === 429) {
              // Rate limited - skip this user's roles for now
              discordRoles = [];
            } else {
              discordRoles = [];
            }
          } else {
            discordRoles = [];
          }
          
          // Add a small delay to avoid hitting Discord API rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          discordRoles = [];
        }
        
        return {
          discordId: user._id, // Map _id back to discordId for frontend compatibility
          username: user.username,
          discriminator: user.discriminator,
          avatar: user.avatar,
          tokens: user.tokens,
          characterSlot: user.characterSlot,
          status: user.status,
          createdAt: user.createdAt,
          lastMessageContent: user.lastMessageContent,
          lastMessageTimestamp: user.lastMessageTimestamp,
          roles: discordRoles,
          characterCount
        };
      })
    );

    // Calculate activity status based on Discord roles and 3-month threshold
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const INACTIVE_ROLE_ID = '788148064182730782';

    const usersWithActivity = usersWithCharacters.map(user => {
      // Check Discord roles first to determine if user is inactive
      let isActive = true; // Default to active
      let daysSinceLastMessage = null;
      let timestampStatus = 'unknown';
      let discordRoleStatus = 'unknown';
      
      // Check if user has the inactive role
      if (user.roles && Array.isArray(user.roles)) {
        if (user.roles.includes(INACTIVE_ROLE_ID)) {
          isActive = false;
          discordRoleStatus = 'inactive_role';
        } else {
          discordRoleStatus = 'active_role';
        }
      } else {
        discordRoleStatus = 'no_roles_data';
        // If no roles data, fall back to timestamp-based logic
        if (user.lastMessageTimestamp) {
          try {
            const timestamp = new Date(user.lastMessageTimestamp);
            if (!isNaN(timestamp.getTime())) {
              daysSinceLastMessage = Math.floor((Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24));
              isActive = timestamp > threeMonthsAgo;
              timestampStatus = 'valid';
            } else {
              timestampStatus = 'invalid_date';
            }
          } catch (error) {
            timestampStatus = 'error_parsing';
          }
        } else {
          timestampStatus = 'no_timestamp';
        }

        // Fallback: if no valid timestamp, use status field or default to inactive
        if (timestampStatus !== 'valid') {
          isActive = user.status === 'active';
          daysSinceLastMessage = null;
        }
      }

      return {
        discordId: user.discordId,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        tokens: user.tokens,
        characterSlot: user.characterSlot,
        status: user.status,
        createdAt: user.createdAt,
        lastMessageContent: user.lastMessageContent,
        lastMessageTimestamp: user.lastMessageTimestamp,
        characterCount: user.characterCount,
        isActive,
        daysSinceLastMessage,
        activityStatus: isActive ? 'active' : 'inactive',
        timestampStatus, // Add this for debugging
        discordRoleStatus, // Add this for debugging
        lastMessageFormatted: user.lastMessageTimestamp 
          ? new Date(user.lastMessageTimestamp).toLocaleString()
          : 'Never'
      };
    });

    // Get counts
    const activeCount = usersWithActivity.filter(u => u.isActive).length;
    const inactiveCount = usersWithActivity.filter(u => !u.isActive).length;
    const totalCount = usersWithActivity.length;

    // Log summary only if there are issues
    const timestampIssues = usersWithActivity.filter(u => u.discordRoleStatus === 'no_roles_data' && u.timestampStatus !== 'valid');
    if (timestampIssues.length > 0) {
      console.warn(`[server.js]: ${timestampIssues.length} users have timestamp issues - consider updating Discord bot`);
    }

    res.json({
      users: usersWithActivity,
      summary: {
        total: totalCount,
        active: activeCount,
        inactive: inactiveCount,
        activePercentage: totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0
      },
      threshold: {
        threeMonthsAgo: threeMonthsAgo.toISOString(),
        currentTime: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[server.js]: Error fetching user activity data:', error);
    res.status(500).json({ error: 'Failed to fetch user activity data' });
  }
});

// Update user activity status manually
app.post('/api/admin/users/update-status', async (req, res) => {
  try {
    // Check if user is authenticated and has admin role
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has admin role in Discord
    let isAdmin = false;
    const guildId = process.env.PROD_GUILD_ID;
    if (guildId && req.user) {
      try {
        const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
          headers: {
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const memberData = await response.json();
          const roles = memberData.roles || [];
          const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
          if (!ADMIN_ROLE_ID) {
            isAdmin = false;
          } else {
            isAdmin = roles.includes(ADMIN_ROLE_ID);
          }
        }
      } catch (error) {
        console.error('[server.js]: Error checking admin status:', error);
        isAdmin = false;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { discordId, status } = req.body;
    
    if (!discordId || !status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    // Update user status
    const result = await User.updateMany(
      { discordId },
      { 
        status,
        statusChangedAt: new Date()
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'User not found or no changes made' });
    }

    res.json({ 
      success: true,
      message: `User status updated to ${status}`,
      updatedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('[server.js]: Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});



// Function to check user's Discord activity via multiple methods
async function checkUserDiscordActivity(discordId) {
  try {
    const guildId = process.env.PROD_GUILD_ID;
    const botToken = process.env.DISCORD_TOKEN;
    
    if (!guildId || !botToken) {
      throw new Error('Missing Discord configuration');
    }

    // Method 1: Check recent messages (if bot has access)
    let messageActivity = null;
    try {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/messages/search?author_id=${discordId}&limit=10`, {
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const recentMessages = data.messages || [];
        if (recentMessages.length > 0) {
          const lastMessage = recentMessages[0];
          messageActivity = {
            content: lastMessage.content,
            timestamp: lastMessage.timestamp,
            channelId: lastMessage.channel_id,
            messageCount: recentMessages.length
          };
        }
      }
    } catch (error) {
      console.warn(`[server.js]: ⚠️ Could not fetch messages for ${discordId}:`, error.message);
    }

    // Method 2: Check user's presence/status
    let presenceActivity = null;
    try {
      const presenceResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, {
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (presenceResponse.ok) {
        const memberData = await presenceResponse.json();
        presenceActivity = {
          joinedAt: memberData.joined_at,
          roles: memberData.roles,
          avatar: memberData.avatar,
          nick: memberData.nick
        };
      }
    } catch (error) {
      console.warn(`[server.js]: ⚠️ Could not fetch member data for ${discordId}:`, error.message);
    }

    // Method 3: Check database for any stored activity data
    let databaseActivity = null;
    try {
      const user = await User.findOne({ discordId });
      if (user) {
        databaseActivity = {
          lastMessageTimestamp: user.lastMessageTimestamp,
          lastMessageContent: user.lastMessageContent,
          status: user.status,
          createdAt: user.createdAt
        };
      }
    } catch (error) {
      console.warn(`[server.js]: ⚠️ Could not fetch database data for ${discordId}:`, error.message);
    }

    // Combine all methods to determine activity
    const now = new Date();
    let lastActivity = null;
    let daysSinceLastActivity = null;
    let activitySource = 'unknown';
    let isActive = false;

    // Priority: Discord messages > Database > Presence
    if (messageActivity) {
      lastActivity = new Date(messageActivity.timestamp);
      daysSinceLastActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
      activitySource = 'discord_messages';
      isActive = daysSinceLastActivity <= 90;
    } else if (databaseActivity?.lastMessageTimestamp) {
      lastActivity = new Date(databaseActivity.lastMessageTimestamp);
      daysSinceLastActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
      activitySource = 'database';
      isActive = daysSinceLastActivity <= 90;
    } else if (presenceActivity?.joinedAt) {
      // If no message activity, check if they joined recently
      const joinedAt = new Date(presenceActivity.joinedAt);
      const daysSinceJoined = Math.floor((now - joinedAt) / (1000 * 60 * 60 * 24));
      if (daysSinceJoined <= 30) {
        // New member, consider them active
        lastActivity = joinedAt;
        daysSinceLastActivity = 0;
        activitySource = 'new_member';
        isActive = true;
      }
    }

    return {
      discordId,
      lastMessage: messageActivity,
      presence: presenceActivity,
      database: databaseActivity,
      lastActivity: lastActivity?.toISOString(),
      daysSinceLastActivity,
      activitySource,
      isActive,
      confidence: messageActivity ? 'high' : (databaseActivity?.lastMessageTimestamp ? 'medium' : 'low')
    };

  } catch (error) {
    console.error(`[server.js]: ❌ Error checking Discord activity for ${discordId}:`, error);
    return {
      discordId,
      error: error.message,
      isActive: false,
      confidence: 'none'
    };
  }
}

// Quick fix endpoint to manually update a user's timestamp (for testing)
app.post('/api/admin/users/update-timestamp', async (req, res) => {
  try {
    // Check if user is authenticated and has admin role
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has admin role in Discord
    let isAdmin = false;
    const guildId = process.env.PROD_GUILD_ID;
    if (guildId && req.user) {
      try {
        const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
          headers: {
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const memberData = await response.json();
          const roles = memberData.roles || [];
          const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
          if (!ADMIN_ROLE_ID) {
            isAdmin = false;
          } else {
            isAdmin = roles.includes(ADMIN_ROLE_ID);
          }
        }
      } catch (error) {
        console.error('[server.js]: Error checking admin status:', error);
        isAdmin = false;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { discordId, timestamp } = req.body;
    
    if (!discordId) {
      return res.status(400).json({ error: 'Discord ID is required' });
    }

    // Use provided timestamp or current time
    const newTimestamp = timestamp ? new Date(timestamp) : new Date();
    
    console.log(`[server.js]: 🔄 Admin updating timestamp for user ${discordId} to ${newTimestamp.toISOString()}`);

    // Update user timestamp
    const result = await User.updateMany(
      { discordId },
      { 
        lastMessageTimestamp: newTimestamp,
        lastMessageContent: 'Manually updated by admin'
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'User not found or no changes made' });
    }

    res.json({ 
      success: true,
      message: `User timestamp updated to ${newTimestamp.toISOString()}`,
      updatedCount: result.modifiedCount,
      newTimestamp: newTimestamp.toISOString()
    });

  } catch (error) {
    console.error('[server.js]: ❌ Error updating user timestamp:', error);
    res.status(500).json({ error: 'Failed to update user timestamp' });
  }
});

// ------------------- Section: Inventory API Routes -------------------

const INVENTORY_UPDATE_FIELDS = [
  'quantity',
  'location',
  'job',
  'perk',
  'obtain',
  'fortuneTellerBoost',
  'notes',
  'synced'
];

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalizeInventoryItem(item = {}, characterContext = null) {
  const quantity = Number(item.quantity);
  const normalizedQuantity = Number.isFinite(quantity) ? quantity : 0;
  let subtype = [];
  if (Array.isArray(item.subtype)) {
    subtype = item.subtype.filter(Boolean);
  } else if (typeof item.subtype === 'string' && item.subtype.trim().length > 0) {
    subtype = item.subtype.split(',').map(sub => sub.trim()).filter(Boolean);
  }

  const normalizedCharacterId = item.characterId
    ? (typeof item.characterId === 'string' ? item.characterId : item.characterId.toString())
    : characterContext?._id?.toString() || null;

  const normalizedItemId = item.itemId
    ? (typeof item.itemId === 'string' ? item.itemId : item.itemId.toString?.() ?? item.itemId)
    : null;

  return {
    id: item._id ? item._id.toString() : null,
    characterId: normalizedCharacterId,
    itemId: normalizedItemId,
    itemName: item.itemName || 'Unknown Item',
    quantity: normalizedQuantity,
    category: item.category || '',
    type: item.type || '',
    subtype,
    job: item.job || characterContext?.job || '',
    perk: item.perk || '',
    location: item.location || characterContext?.currentVillage || '',
    obtain: item.obtain || '',
    date: item.date || null,
    craftedAt: item.craftedAt || null,
    gatheredAt: item.gatheredAt || null,
    fortuneTellerBoost: Boolean(item.fortuneTellerBoost),
    synced: item.synced || '',
    notes: item.notes || ''
  };
}

async function getOwnedCharacter(characterId, userId) {
  const character = await fetchCharacterById(characterId);
  if (!character) {
    return { error: { status: 404, message: 'Character not found' } };
  }

  if (String(character.userId) !== String(userId)) {
    return { error: { status: 403, message: 'Character does not belong to the authenticated user' } };
  }

  return { character };
}

function normalizeGearSlotData(slot) {
  if (!slot || !slot.name) {
    return null;
  }

  let stats = {};
  if (slot.stats instanceof Map) {
    stats = Object.fromEntries(slot.stats);
  } else if (slot.stats && typeof slot.stats === 'object') {
    stats = typeof slot.stats.toObject === 'function' ? slot.stats.toObject() : { ...slot.stats };
  }

  return {
    name: slot.name,
    stats
  };
}

function extractCharacterGear(character) {
  const gearArmor = character.gearArmor || {};
  return {
    weapon: normalizeGearSlotData(character.gearWeapon),
    shield: normalizeGearSlotData(character.gearShield),
    armor: {
      head: normalizeGearSlotData(gearArmor.head),
      chest: normalizeGearSlotData(gearArmor.chest),
      legs: normalizeGearSlotData(gearArmor.legs)
    }
  };
}

const GEAR_SLOT_FIELD_MAP = {
  weapon: 'gearWeapon',
  shield: 'gearShield',
  armor_head: 'gearArmor.head',
  armor_chest: 'gearArmor.chest',
  armor_legs: 'gearArmor.legs'
};

const ARMOR_SLOT_KEYWORDS = {
  armor_head: [
    'head',
    'helmet',
    'helm',
    'mask',
    'cap',
    'earrings',
    'headdress',
    'bandanna',
    'headband',
    'circlet',
    'hood',
    'headpiece',
    'veil'
  ].map((value) => value.toLowerCase()),
  armor_chest: [
    'chest',
    'torso',
    'armor',
    'shirt',
    'tunic',
    'cuirass',
    'doublet',
    'top',
    'uniform',
    'spaulder',
    'guard',
    'robe',
    'gear'
  ].map((value) => value.toLowerCase()),
  armor_legs: [
    'legs',
    'pants',
    'boots',
    'greaves',
    'legwear',
    'leg wraps',
    'tights',
    'sirwal',
    'trousers'
  ].map((value) => value.toLowerCase())
};

const WEAPON_STYLE_KEYWORDS = {
  bow: ['bow', 'longbow', 'shortbow', 'arrow'].map((value) => value.toLowerCase()),
  oneHanded: [
    '1h'
  ].map((value) => value.toLowerCase()),
  twoHanded: [
    '2h'
  ].map((value) => value.toLowerCase())
};

const SHIELD_KEYWORDS = ['shield', 'buckler', 'guard'].map((value) => value.toLowerCase());

function normalizeGearSlotKey(slot = '') {
  const key = String(slot || '').trim().toLowerCase();
  if (!key) {
    return null;
  }

  if (key === 'weapon') return 'weapon';
  if (key === 'shield') return 'shield';
  if (['armor_head', 'armorhead', 'head', 'head_armor', 'helmet'].includes(key)) return 'armor_head';
  if (['armor_chest', 'armorchest', 'chest', 'chest_armor', 'torso'].includes(key)) return 'armor_chest';
  if (['armor_legs', 'armorlegs', 'legs', 'leg_armor', 'pants'].includes(key)) return 'armor_legs';

  return null;
}

async function buildGearPayloadFromInventoryItem(item = {}) {
  if (!item.itemName) {
    return null;
  }

  const stats = extractNumericStatsFromInventory(item);

  const needsModifierHydration = !Number.isFinite(stats.modifierHearts) || stats.modifierHearts === 0;
  if (needsModifierHydration) {
    const canonical = await Item.findOne({ itemName: item.itemName }).lean();
    if (canonical && Number.isFinite(canonical?.modifierHearts) && canonical.modifierHearts !== 0) {
      stats.modifierHearts = canonical.modifierHearts;
    }
    if (canonical && Number.isFinite(canonical?.staminaRecovered) && canonical.staminaRecovered !== 0) {
      stats.staminaRecovered = canonical.staminaRecovered;
    }
    if (canonical && Number.isFinite(canonical?.staminaToCraft) && canonical.staminaToCraft !== 0) {
      stats.staminaToCraft = canonical.staminaToCraft;
    }
  }

  if (!Object.keys(stats).length) {
    stats.modifierHearts = 0;
  }

  return {
    name: item.itemName,
    stats
  };
}

function extractNumericStatsFromInventory(item = {}) {
  const stats = {};

  const addStat = (key, value) => {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue !== 0) {
      stats[key] = numericValue;
    }
  };

  const numericFields = ['modifierHearts', 'attack', 'defense', 'staminaRecovered', 'staminaToCraft'];
  numericFields.forEach((field) => addStat(field, item[field]));

  if (item.stats) {
    let statEntries = item.stats;
    if (typeof item.stats.toObject === 'function') {
      statEntries = item.stats.toObject();
    } else if (item.stats instanceof Map) {
      statEntries = Object.fromEntries(item.stats.entries());
    }
    Object.entries(statEntries || {}).forEach(([key, value]) => addStat(key, value));
  }

  return stats;
}

function isItemEligibleForSlot(item = {}, slotKey) {
  if (!item || !slotKey) {
    return false;
  }
  const tags = collectItemTags(item);
  const gearType = getGearType(item);
  if (slotKey === 'weapon') {
    const styleFromTags = determineWeaponStyle(tags);
    const styleFromModel = getWeaponStyle(item);
    if (isShieldItem(tags) || gearType === 'shield') {
      return false;
    }
    return Boolean(styleFromTags || styleFromModel);
  }
  if (slotKey === 'shield') {
    return gearType === 'shield' || isShieldItem(tags);
  }
  if (slotKey.startsWith('armor_')) {
    if (gearType !== 'armor') {
      return false;
    }
    return isArmorItemForSlot(tags, slotKey);
  }
  return false;
}

function collectItemTags(item = {}) {
  const normalizeList = (value) => {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }
    return [value];
  };

  const toLowerSet = (arr) => new Set(arr.map((entry) => String(entry).toLowerCase()));

  return {
    categories: toLowerSet([
      ...normalizeList(item.category),
      ...normalizeList(item.categoryGear)
    ]),
    types: toLowerSet(normalizeList(item.type)),
    subtypes: toLowerSet(normalizeList(item.subtype))
  };
}

function determineWeaponStyle(tags = {}) {
  if (!tags) {
    return null;
  }
  if (matchKeywords(tags.types, WEAPON_STYLE_KEYWORDS.bow)
    || matchKeywords(tags.subtypes, WEAPON_STYLE_KEYWORDS.bow)
    || tags.categories.has('bow')) {
    return 'bow';
  }
  if (matchKeywords(tags.types, WEAPON_STYLE_KEYWORDS.twoHanded)
    || matchKeywords(tags.subtypes, WEAPON_STYLE_KEYWORDS.twoHanded)) {
    return '2h';
  }
  if (matchKeywords(tags.types, WEAPON_STYLE_KEYWORDS.oneHanded)
    || matchKeywords(tags.subtypes, WEAPON_STYLE_KEYWORDS.oneHanded)
    || tags.categories.has('weapon')) {
    return '1h';
  }
  return null;
}

function isShieldItem(tags = {}) {
  if (!tags) {
    return false;
  }
  return (
    tags.categories.has('shield')
    || matchKeywords(tags.types, SHIELD_KEYWORDS)
    || matchKeywords(tags.subtypes, SHIELD_KEYWORDS)
  );
}

function isArmorItemForSlot(tags = {}, slotKey = '') {
  if (!tags || !slotKey.startsWith('armor_')) {
    return false;
  }
  if (!tags.categories.has('armor')) {
    return false;
  }
  const slotKeywords = ARMOR_SLOT_KEYWORDS[slotKey] || [];
  const typeMatches = matchKeywords(tags.types, slotKeywords);
  const subtypeMatches = matchKeywords(tags.subtypes, slotKeywords);

  if (typeMatches || subtypeMatches) {
    return true;
  }

  const linkKeywords = [
    ...slotKeywords,
    ...(slotKey === 'armor_legs' ? ['legs'] : []),
    ...(slotKey === 'armor_head' ? ['head'] : []),
    ...(slotKey === 'armor_chest' ? ['chest', 'torso'] : [])
  ];
  return matchKeywords(tags.categories, linkKeywords);
}

function matchKeywords(set = new Set(), keywords = []) {
  if (!set || !keywords || !keywords.length) {
    return false;
  }
  return keywords.some((keyword) => set.has(keyword));
}

function buildCharacterGearUpdate(slotKey, gearPayload) {
  const fieldPath = GEAR_SLOT_FIELD_MAP[slotKey];
  if (!fieldPath) {
    throw new Error(`Unsupported gear slot: ${slotKey}`);
  }

  return {
    $set: {
      [fieldPath]: gearPayload
    }
  };
}

function buildCharacterGearClearUpdate(slotKey) {
  const fieldPath = GEAR_SLOT_FIELD_MAP[slotKey];
  if (!fieldPath) {
    throw new Error(`Unsupported gear slot: ${slotKey}`);
  }

  const update = {};
  update[fieldPath] = null;

  return {
    $unset: update
  };
}

async function buildUserInventoryResponse(userId) {
  const characters = await fetchCharactersByUserId(userId);

  if (!characters || characters.length === 0) {
    return {
      characters: [],
      aggregates: {
        totalQuantity: 0,
        uniqueItems: 0,
        items: []
      }
    };
  }

  const aggregateMap = new Map();
  const itemNames = new Set();
  let totalQuantity = 0;
  const characterPayloads = [];

  for (const character of characters) {
    try {
      const collection = await getCharacterInventoryCollection(character.name);
      const rawItems = await collection.find().toArray();
      const normalizedItems = rawItems.map(item => normalizeInventoryItem(item, character));
      const characterQuantity = normalizedItems.reduce((sum, invItem) => sum + invItem.quantity, 0);
      totalQuantity += characterQuantity;

      normalizedItems.forEach(invItem => {
        if (invItem.itemName) {
          itemNames.add(invItem.itemName);
        }
        const key = invItem.itemName ? invItem.itemName.toLowerCase() : invItem.id;
        if (!aggregateMap.has(key)) {
          aggregateMap.set(key, {
            itemName: invItem.itemName || 'Unknown Item',
            itemId: invItem.itemId,
            categories: new Set(),
            types: new Set(),
            subtypes: new Set(),
            hasFortuneBoost: false,
            totalQuantity: 0,
            instances: []
          });
        }

        const aggregateEntry = aggregateMap.get(key);
        aggregateEntry.totalQuantity += invItem.quantity;
        if (invItem.category) {
          aggregateEntry.categories.add(invItem.category);
        }
        if (invItem.type) {
          aggregateEntry.types.add(invItem.type);
        }
        invItem.subtype?.forEach(sub => aggregateEntry.subtypes.add(sub));
        if (invItem.fortuneTellerBoost) {
          aggregateEntry.hasFortuneBoost = true;
        }
        aggregateEntry.instances.push({
          inventoryId: invItem.id,
          characterId: invItem.characterId,
          characterName: character.name,
          quantity: invItem.quantity,
          location: invItem.location,
          job: invItem.job,
          perk: invItem.perk,
          obtain: invItem.obtain,
          fortuneTellerBoost: invItem.fortuneTellerBoost
        });
      });

      characterPayloads.push({
        id: character._id.toString(),
        name: character.name,
        icon: character.icon,
        job: character.job,
        race: character.race,
        currentVillage: character.currentVillage,
        homeVillage: character.homeVillage,
        totalQuantity: characterQuantity,
        uniqueItems: normalizedItems.length,
        categories: [...new Set(normalizedItems.map(item => item.category).filter(Boolean))],
        inventory: normalizedItems,
        gear: extractCharacterGear(character)
      });
    } catch (error) {
      console.warn(`[server.js]: ⚠️ Error loading inventory for ${character.name}:`, error.message);
      characterPayloads.push({
        id: character._id.toString(),
        name: character.name,
        icon: character.icon,
        job: character.job,
        race: character.race,
        currentVillage: character.currentVillage,
        homeVillage: character.homeVillage,
        totalQuantity: 0,
        uniqueItems: 0,
        categories: [],
        inventory: [],
        gear: extractCharacterGear(character),
        error: 'Failed to load inventory'
      });
    }
  }

  let aggregateItems = Array.from(aggregateMap.values());
  let imageMap = {};

  if (itemNames.size > 0) {
    const itemsMeta = await Item.find(
      { itemName: { $in: Array.from(itemNames) } },
      { itemName: 1, image: 1 }
    ).lean();

    imageMap = itemsMeta.reduce((acc, doc) => {
      acc[doc.itemName] = doc.image;
      return acc;
    }, {});
  }

  aggregateItems = aggregateItems.map(entry => ({
    itemName: entry.itemName,
    itemId: entry.itemId,
    totalQuantity: entry.totalQuantity,
    categories: Array.from(entry.categories),
    types: Array.from(entry.types),
    subtypes: Array.from(entry.subtypes),
    hasFortuneBoost: entry.hasFortuneBoost,
    image: entry.itemName && imageMap[entry.itemName] ? imageMap[entry.itemName] : null,
    instances: entry.instances
  }));

  aggregateItems.sort((a, b) => a.itemName.localeCompare(b.itemName));

  return {
    characters: characterPayloads,
    aggregates: {
      totalQuantity,
      uniqueItems: aggregateItems.length,
      items: aggregateItems
    }
  };
}

function buildItemNameQuery(itemName) {
  if (!itemName) {
    return { itemName: '' };
  }
  const safeName = escapeRegex(String(itemName).trim());
  return { itemName: { $regex: new RegExp(`^${safeName}$`, 'i') } };
}

app.get('/api/inventories/me', async (req, res) => {
  try {
    // Check authentication
    if (!req.session?.user?.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const payload = await buildUserInventoryResponse(req.session.user.discordId);
    res.json(payload);
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching user inventories:', error);
    res.status(500).json({ error: 'Failed to load inventory data', details: error.message });
  }
});

app.post('/api/inventories/transfer', async (req, res) => {
  try {
    // Check authentication
    if (!req.session?.user?.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { sourceCharacterId, targetCharacterId, itemId, quantity } = req.body;

    if (!sourceCharacterId || !targetCharacterId || !itemId) {
      return res.status(400).json({ error: 'sourceCharacterId, targetCharacterId, and itemId are required' });
    }

    if (sourceCharacterId === targetCharacterId) {
      return res.status(400).json({ error: 'Source and target characters must be different' });
    }

    const transferQuantity = Number(quantity);
    if (!Number.isFinite(transferQuantity) || transferQuantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    const userId = req.session.user.discordId;
    const [sourceResult, targetResult] = await Promise.all([
      getOwnedCharacter(sourceCharacterId, userId),
      getOwnedCharacter(targetCharacterId, userId)
    ]);

    if (sourceResult.error) {
      return res.status(sourceResult.error.status).json({ error: sourceResult.error.message });
    }
    if (targetResult.error) {
      return res.status(targetResult.error.status).json({ error: targetResult.error.message });
    }

    const sourceCharacter = sourceResult.character;
    const targetCharacter = targetResult.character;

    let sourceItemObjectId;
    try {
      sourceItemObjectId = new ObjectId(itemId);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid itemId' });
    }

    const inventoriesDb = await connectToInventoriesNative();
    const sourceCollection = inventoriesDb.collection(sourceCharacter.name.trim().toLowerCase());
    const targetCollection = inventoriesDb.collection(targetCharacter.name.trim().toLowerCase());

    const sourceItem = await sourceCollection.findOne({ _id: sourceItemObjectId });
    if (!sourceItem) {
      return res.status(404).json({ error: 'Source inventory item not found' });
    }

    const availableQuantity = Number(sourceItem.quantity) || 0;
    if (transferQuantity > availableQuantity) {
      return res.status(400).json({ error: 'Transfer quantity exceeds available quantity' });
    }

    const remainingQuantity = availableQuantity - transferQuantity;
    if (remainingQuantity === 0) {
      await sourceCollection.deleteOne({ _id: sourceItemObjectId });
    } else {
      await sourceCollection.updateOne(
        { _id: sourceItemObjectId },
        { $set: { quantity: remainingQuantity } }
      );
    }

    const targetQuery = buildItemNameQuery(sourceItem.itemName);
    let destinationItem = await targetCollection.findOne(targetQuery);

    const transferNote = buildTransferObtainNote(sourceCharacter.name);

    if (destinationItem) {
      await targetCollection.updateOne(
        { _id: destinationItem._id },
        {
          $inc: { quantity: transferQuantity },
          $set: { obtain: transferNote }
        }
      );
      destinationItem = await targetCollection.findOne({ _id: destinationItem._id });
    } else {
      const { _id, characterId, ...rest } = sourceItem;
      const newItem = {
        ...rest,
        characterId: targetCharacter._id,
        quantity: transferQuantity,
        job: targetCharacter.job || rest.job || '',
        location: targetCharacter.currentVillage || rest.location || '',
        date: new Date(),
        obtain: transferNote
      };
      const insertResult = await targetCollection.insertOne(newItem);
      destinationItem = await targetCollection.findOne({ _id: insertResult.insertedId });
    }

    const updatedSourceItem = remainingQuantity === 0
      ? null
      : await sourceCollection.findOne({ _id: sourceItemObjectId });

    res.json({
      success: true,
      transfer: {
        sourceCharacterId: sourceCharacterId.toString(),
        targetCharacterId: targetCharacterId.toString(),
        sourceInventoryId: sourceItemObjectId.toString(),
        quantity: transferQuantity,
        sourceItem: updatedSourceItem ? normalizeInventoryItem(updatedSourceItem, sourceCharacter) : null,
        destinationItem: destinationItem ? normalizeInventoryItem(destinationItem, targetCharacter) : null
      }
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error transferring inventory item:', error);
    res.status(500).json({ error: 'Failed to transfer item', details: error.message });
  }
});

function buildTransferObtainNote(sourceName) {
  const timestamp = new Date().toLocaleDateString();
  return `Transferred from ${sourceName} on ${timestamp}`;
}

function mergeObtainValue(existingValue, note) {
  return note;
}

app.patch('/api/inventories/:characterId/items/:itemId', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { characterId, itemId } = req.params;
    const character = await fetchCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    let targetObjectId;
    try {
      targetObjectId = new ObjectId(itemId);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid itemId' });
    }

    const updates = {};
    for (const field of INVENTORY_UPDATE_FIELDS) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    if (updates.quantity !== undefined) {
      const newQuantity = Number(updates.quantity);
      if (!Number.isFinite(newQuantity) || newQuantity < 0) {
        return res.status(400).json({ error: 'Quantity must be a non-negative number' });
      }
      updates.quantity = newQuantity;
    }

    if (updates.quantity === 0) {
      const inventoriesDb = await connectToInventoriesNative();
      const collection = inventoriesDb.collection(character.name.trim().toLowerCase());
      const deleteResult = await collection.deleteOne({ _id: targetObjectId });

      if (deleteResult.deletedCount === 0) {
        return res.status(404).json({ error: 'Inventory item not found' });
      }

      return res.json({ success: true, deleted: true });
    }

    if (updates.fortuneTellerBoost !== undefined) {
      updates.fortuneTellerBoost = Boolean(updates.fortuneTellerBoost);
    }

    ['location', 'job', 'perk', 'obtain', 'notes', 'synced'].forEach(field => {
      if (updates[field] !== undefined && updates[field] !== null) {
        updates[field] = String(updates[field]);
      }
    });

    const inventoriesDb = await connectToInventoriesNative();
    const collection = inventoriesDb.collection(character.name.trim().toLowerCase());
    const result = await collection.findOneAndUpdate(
      { _id: targetObjectId },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json({
      success: true,
      item: normalizeInventoryItem(result.value, character)
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error updating inventory item:', error);
    res.status(500).json({ error: 'Failed to update inventory item', details: error.message });
  }
});

app.delete('/api/inventories/:characterId/items/:itemId', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { characterId, itemId } = req.params;
    const character = await fetchCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    let targetObjectId;
    try {
      targetObjectId = new ObjectId(itemId);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid itemId' });
    }

    const inventoriesDb = await connectToInventoriesNative();
    const collection = inventoriesDb.collection(character.name.trim().toLowerCase());
    const result = await collection.deleteOne({ _id: targetObjectId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json({ success: true, deleted: true });
  } catch (error) {
    console.error('[server.js]: ❌ Error deleting inventory item:', error);
    res.status(500).json({ error: 'Failed to delete inventory item', details: error.message });
  }
});

app.patch('/api/characters/:characterId/gear', async (req, res) => {
  try {
    const { characterId } = req.params;
    const { slot, inventoryId } = req.body || {};

    const normalizedSlot = normalizeGearSlotKey(slot);
    if (!normalizedSlot) {
      return res.status(400).json({ error: 'Invalid gear slot provided' });
    }

    const ownership = await getOwnedCharacter(characterId, req.user.discordId);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ error: ownership.error.message });
    }

    const character = ownership.character;

    const inventoriesDb = await connectToInventoriesNative();
    const collection = inventoriesDb.collection(character.name.trim().toLowerCase());
    let gearPayload = null;
    let inventoryObjectId = null;

    if (inventoryId) {
      try {
        inventoryObjectId = new ObjectId(inventoryId);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid inventoryId' });
      }

      const inventoryItem = await collection.findOne({ _id: inventoryObjectId });

      if (!inventoryItem) {
        return res.status(404).json({ error: 'Inventory item not found' });
      }

      let canonicalItem = await Item.findOne({ itemName: inventoryItem.itemName }).lean();
      if (!canonicalItem && inventoryItem.itemName) {
        canonicalItem = await Item.findOne({ itemName: new RegExp(`^${inventoryItem.itemName}$`, 'i') }).lean();
      }
      const combinedItem = canonicalItem ? { ...canonicalItem, ...inventoryItem } : inventoryItem;

      if (!isItemEligibleForSlot(combinedItem, normalizedSlot)) {
        return res.status(400).json({ error: `Item cannot be equipped in the ${normalizedSlot.replace('_', ' ')} slot.` });
      }

      gearPayload = await buildGearPayloadFromInventoryItem(combinedItem);
      if (!gearPayload) {
        return res.status(400).json({ error: 'Item cannot be equipped' });
      }
    }

    const previouslyEquipped = await collection
      .find({ equippedSlot: normalizedSlot })
      .project({ _id: 1 })
      .toArray();
    const clearedInventoryIds = previouslyEquipped.map((doc) => doc._id.toString());

    if (clearedInventoryIds.length) {
      await collection.updateMany(
        { equippedSlot: normalizedSlot },
        {
          $unset: { equippedSlot: '' },
          $set: { isEquipped: false }
        }
      );
    }

    if (inventoryObjectId) {
      await collection.updateOne(
        { _id: inventoryObjectId },
        {
          $set: {
            equippedSlot: normalizedSlot,
            isEquipped: true
          }
        }
      );
    }

    const gearUpdate = inventoryObjectId
      ? buildCharacterGearUpdate(normalizedSlot, gearPayload)
      : buildCharacterGearClearUpdate(normalizedSlot);

    await Character.updateOne({ _id: character._id }, gearUpdate);

    const refreshedCharacter = await fetchCharacterById(character._id);
    if (!refreshedCharacter) {
      return res.status(404).json({ error: 'Character not found after update' });
    }

    res.json({
      success: true,
      slot: normalizedSlot,
      equippedInventoryId: inventoryObjectId ? inventoryObjectId.toString() : null,
      clearedInventoryIds,
      gear: extractCharacterGear(refreshedCharacter)
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error equipping gear:', error);
    console.error('[server.js]: Error stack:', error.stack);
    console.error('[server.js]: Request params:', { characterId: req.params.characterId, slot: req.body?.slot, inventoryId: req.body?.inventoryId });
    res.status(500).json({ error: 'Failed to update gear', details: error.message });
  }
});

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
    
    
    res.json(inventoryData);
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching inventory data:', error);
    res.status(500).json({ error: 'Failed to fetch inventory data', details: error.message });
  }
});

// ------------------- Section: Gallery API Routes -------------------

// ------------------- Function: testGalleryEndpoint -------------------
// Test endpoint to verify gallery routes are working
app.get('/api/gallery/test', (req, res) => {
  res.json({ message: 'Gallery API is working!', timestamp: new Date().toISOString() });
});

// ------------------- Function: getGallerySubmissions -------------------
// Returns approved submissions for the gallery
app.get('/api/gallery/submissions', async (req, res) => {
  try {
    const { category, sort, page = 1, limit = 50 } = req.query;
    
    // Build query
    const query = {};
    if (category && category !== 'all') {
      query.category = category;
    }
    
    // Build sort
    let sortOptions = {};
    switch (sort) {
      case 'oldest':
        sortOptions = { approvedAt: 1 };
        break;
      case 'tokens':
        sortOptions = { finalTokenAmount: -1 };
        break;
      case 'newest':
      default:
        sortOptions = { approvedAt: -1 };
        break;
    }
    
    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Fetch submissions
    const submissions = await ApprovedSubmission.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    
    // Get total count for pagination
    const totalCount = await ApprovedSubmission.countDocuments(query);
    
    res.json({
      submissions,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalItems: totalCount,
        itemsPerPage: limitNum
      }
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching gallery submissions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch gallery submissions', 
      details: error.message 
    });
  }
});

// ------------------- Function: updateGallerySubmission -------------------
// Updates a gallery submission (title, description, tagged characters)
app.put('/api/gallery/submissions/:submissionId', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { title, description, taggedCharacters } = req.body;
    
    console.log('Updating submission:', {
      submissionId,
      title,
      description,
      taggedCharacters
    });
    
    // Find and update the submission
    const submission = await ApprovedSubmission.findOneAndUpdate(
      { submissionId },
      { 
        title,
        description,
        taggedCharacters: taggedCharacters || [],
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    console.log('Submission updated successfully:', {
      submissionId: submission.submissionId,
      title: submission.title,
      taggedCharacters: submission.taggedCharacters
    });
    
    res.json({ 
      message: 'Submission updated successfully',
      submission 
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error updating gallery submission:', error);
    res.status(500).json({ 
      error: 'Failed to update submission', 
      details: error.message 
    });
  }
});

// ------------------- Function: getCharacterInventory -------------------
// Returns inventory data for specific characters
app.get('/api/inventory/characters', async (req, res) => {
  try {
    const { characters } = req.query;
    
    if (!characters) {
      return res.status(400).json({ error: 'Characters parameter is required' });
    }
    
    const characterNames = characters.split(',').map(name => name.trim());
    
    const inventoryData = [];
    
    for (const characterName of characterNames) {
      try {
        const col = await getCharacterInventoryCollection(characterName);
        const inv = await col.find().toArray();
        // Fetch all item names in this inventory
        const itemNames = inv.map(item => item.itemName);
        // Fetch all item docs in one go
        const itemDocs = await Item.find({ itemName: { $in: itemNames } }, { itemName: 1, image: 1 }).lean();
        const itemImageMap = {};
        itemDocs.forEach(doc => { itemImageMap[doc.itemName] = doc.image; });
        // Attach image to each inventory item
        inventoryData.push(...inv.map(item => ({
          ...item,
          characterName,
          image: itemImageMap[item.itemName] || 'No Image'
        })));
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Error fetching inventory for character ${characterName}:`, error.message);
        continue;
      }
    }
    
    res.json({ data: inventoryData });
  } catch (error) {
    logger.error('Error fetching character inventory data', error, 'server.js');
    res.status(500).json({ error: 'Failed to fetch character inventory data', details: error.message });
  }
});

// ------------------- Function: getVendingInventory -------------------
// Returns vending inventory for a character from vendingInventories collection
app.get('/api/characters/:characterId/vending', async (req, res) => {
  try {
    const { characterId } = req.params;
    if (!req.user || !req.user.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userId = req.user.discordId;

    // Find character (check both regular and mod characters)
    let character = await Character.findById(characterId);
    if (!character) {
      character = await ModCharacter.findById(characterId);
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Verify character belongs to user
    if (character.userId !== userId) {
      return res.status(403).json({ error: 'You do not have permission to view this character' });
    }

    // Get items from vending database using VendingInventory model
    let items = [];
    try {
      const { initializeVendingInventoryModel } = require('../shared/models/VendingModel');
      const VendingInventory = await initializeVendingInventoryModel(character.name);
      const vendingItems = await VendingInventory.find({ characterName: character.name }).lean();
      items = vendingItems;
      logger.success(`Found ${items.length} vending items for ${character.name}`, 'server.js');
      if (items.length > 0) {
        logger.debug(`Sample item for ${character.name}`, items[0], 'server.js');
      }
    } catch (vendingDbError) {
      logger.warn(`Could not read from vending database: ${vendingDbError.message}`, 'server.js');
      logger.error('Vending DB error stack', vendingDbError.stack, 'server.js');
    }

    // Calculate slot usage - count items, not cumulative slotsUsed
    const usedSlots = items.length;

    // Calculate total slots
    const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
    const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
    const vendorType = character.vendorType?.toLowerCase() || character.job?.toLowerCase() || 'shopkeeper';
    const pouchType = character.shopPouch?.toLowerCase() || character.vendingSetup?.pouchType?.toLowerCase() || 'none';
    const baseSlots = baseSlotLimits[vendorType] || 0;
    const pouchSlots = pouchCapacities[pouchType] || 0;
    const totalSlots = baseSlots + pouchSlots;

    res.json({
      character: {
        _id: character._id,
        name: character.name,
        vendorType: vendorType,
        pouchType: pouchType,
        vendingPoints: character.vendingPoints || 0,
        slots: {
          total: totalSlots,
          used: usedSlots,
          available: totalSlots - usedSlots
        }
      },
      items: items.map(item => ({
        _id: item._id || item._id?.toString(),
        itemName: item.itemName,
        itemId: item.itemId || item.itemId?.toString(),
        stockQty: item.stockQty,
        costEach: item.costEach || 0,
        tokenPrice: item.tokenPrice,
        artPrice: item.artPrice,
        otherPrice: item.otherPrice,
        tradesOpen: item.tradesOpen || item.barterOpen || false,
        barterOpen: item.barterOpen !== undefined ? item.barterOpen : (item.tradesOpen || false),
        slot: item.slot,
        slotsUsed: item.slotsUsed,
        date: item.date
      }))
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching vending inventory:', error);
    res.status(500).json({ error: 'Failed to fetch vending inventory', details: error.message });
  }
});

// ------------------- Function: setupVendingShop -------------------
// One-time setup endpoint to import vending data from old method
app.post('/api/characters/:characterId/vending/setup', async (req, res) => {
  try {
    const { characterId } = req.params;
    const userId = req.user.discordId;
    const { items, pouchType, vendingPoints, shopImage } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }
    if (!pouchType) {
      return res.status(400).json({ error: 'Pouch type is required' });
    }

    // Validate pouch type
    const validPouchTypes = ['none', 'bronze', 'silver', 'gold'];
    if (!validPouchTypes.includes(pouchType.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid pouch type. Must be: none, bronze, silver, or gold' });
    }

    // Find character (check both regular and mod characters)
    let character = await Character.findById(characterId);
    if (!character) {
      character = await ModCharacter.findById(characterId);
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Verify character belongs to user
    if (character.userId !== userId) {
      return res.status(403).json({ error: 'You do not have permission to set up this character' });
    }

    // Check if already set up (one-time only)
    if (character.vendingSetup?.setupDate) {
      return res.status(400).json({ error: 'This character has already been set up. Setup can only be done once.' });
    }

    // Validate job
    const job = character.job?.toLowerCase();
    if (job !== 'shopkeeper' && job !== 'merchant') {
      return res.status(400).json({ error: 'Character must be a Shopkeeper or Merchant to set up vending' });
    }

    // Use items directly from request body
    const parsedRows = items;

    // Set pouch size based on pouch type
    const pouchSizes = {
      none: 0,
      bronze: 15,
      silver: 30,
      gold: 50
    };

    // Set vendor type based on job
    const vendorType = job === 'shopkeeper' ? 'shopkeeper' : 'merchant';

    // Initialize vending inventory model
    const { initializeVendingInventoryModel } = require('../shared/models/VendingModel');
    const VendingInventory = await initializeVendingInventoryModel(character.name);

    // First, validate all items before saving any
    const validationErrors = [];
    const validItems = [];

    for (const row of parsedRows) {
      try {
        // Find item by name
        const item = await Item.findOne({ itemName: row.itemName });
        if (!item) {
          validationErrors.push(`Item "${row.itemName}" not found in database`);
          continue;
        }

        // Validate stack size
        const stockQty = parseInt(row.stockQty) || 1;
        const isStackable = item.stackable || false;
        const maxStackSize = item.maxStackSize || 10;

        if (!isStackable && stockQty > 1) {
          validationErrors.push(`Item "${row.itemName}" is not stackable. Stock quantity must be 1, but ${stockQty} was provided.`);
          continue;
        }

        if (isStackable && stockQty > maxStackSize) {
          validationErrors.push(`Item "${row.itemName}" has a maximum stack size of ${maxStackSize}, but ${stockQty} was provided.`);
          continue;
        }

        // Item is valid, add to validItems array
        validItems.push({ row, item, stockQty });
      } catch (error) {
        console.error(`[server.js]: Error validating item "${row.itemName}":`, error);
        validationErrors.push(`Failed to validate "${row.itemName}": ${error.message}`);
      }
    }

    // If there are validation errors, return early without saving anything
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation errors occurred. No items were saved.',
        errors: validationErrors
      });
    }

    // All items validated successfully - now save them
    // First, get existing slots to avoid conflicts
    const existingItems = await VendingInventory.find({ characterName: character.name });
    const usedSlots = new Set(existingItems.map(item => item.slot).filter(Boolean));
    
    // Calculate total available slots
    const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
    const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
    const baseSlots = baseSlotLimits[vendorType] || 0;
    const pouchSlots = pouchCapacities[pouchType.toLowerCase()] || 0;
    const totalSlots = baseSlots + pouchSlots;

    const importedItems = [];
    const errors = [];
    let currentSlot = 1;

    for (const { row, item, stockQty } of validItems) {
      try {
        // Parse boolean for tradesOpen
        const tradesOpen = typeof row.tradesOpen === 'string' 
          ? (row.tradesOpen.toLowerCase() === 'true' || row.tradesOpen.toLowerCase() === 'yes')
          : Boolean(row.tradesOpen);

        // Calculate slots needed for this item (for slotsUsed field)
        const isStackable = item.stackable || false;
        const maxStackSize = item.maxStackSize || 10;
        let slotsUsed = 1;
        if (isStackable) {
          slotsUsed = Math.ceil(stockQty / maxStackSize);
        } else {
          slotsUsed = stockQty;
        }

        // Auto-assign slot if none specified
        let assignedSlot = row.slot ? row.slot.trim() : null;
        if (!assignedSlot || assignedSlot === '') {
          // Find first available slot
          let slotFound = false;
          for (let i = currentSlot; i <= totalSlots; i++) {
            const slotName = `Slot ${i}`;
            if (!usedSlots.has(slotName)) {
              assignedSlot = slotName;
              usedSlots.add(slotName);
              currentSlot = i + 1;
              slotFound = true;
              break;
            }
          }
          if (!slotFound) {
            errors.push(`No available slots for "${row.itemName}". You have used all ${totalSlots} slots.`);
            continue;
          }
        } else {
          // Validate manually specified slot
          const slotNumber = parseInt(assignedSlot.replace(/[^0-9]/g, ''));
          if (isNaN(slotNumber) || slotNumber < 1 || slotNumber > totalSlots) {
            errors.push(`Invalid slot number "${assignedSlot}" for "${row.itemName}". You have ${totalSlots} total slots available.`);
            continue;
          }
          // Normalize slot format
          if (!assignedSlot.startsWith('Slot ')) {
            assignedSlot = `Slot ${slotNumber}`;
          }
          // Check if slot is already used
          if (usedSlots.has(assignedSlot)) {
            errors.push(`Slot "${assignedSlot}" is already occupied. Cannot add "${row.itemName}" to the same slot.`);
            continue;
          }
          usedSlots.add(assignedSlot);
        }

        // Create vending inventory entry
        const vendingItem = new VendingInventory({
          characterName: character.name,
          itemName: row.itemName,
          itemId: item._id,
          stockQty: stockQty,
          costEach: parseFloat(row.costEach) || 0,
          pointsSpent: parseFloat(row.pointsSpent) || 0,
          boughtFrom: row.boughtFrom || null,
          tokenPrice: typeof row.tokenPrice === 'string' ? parseFloat(row.tokenPrice.replace(/[^0-9.-]/g, '')) || 0 : parseFloat(row.tokenPrice) || 0,
          artPrice: row.artPrice || 'N/A',
          otherPrice: row.otherPrice || 'N/A',
          tradesOpen: tradesOpen,
          slot: assignedSlot,
          date: row.date ? (row.date instanceof Date ? row.date : new Date(row.date)) : new Date(),
          slotsUsed: slotsUsed
        });

        await vendingItem.save();
        importedItems.push(row.itemName);
      } catch (error) {
        console.error(`[server.js]: Error importing item "${row.itemName}":`, error);
        errors.push(`Failed to import "${row.itemName}": ${error.message}`);
      }
    }

    // If there are errors during saving, rollback by deleting saved items
    if (errors.length > 0) {
      // Delete any items that were saved before the error
      try {
        for (const itemName of importedItems) {
          await VendingInventory.deleteOne({ 
            characterName: character.name, 
            itemName: itemName 
          });
        }
      } catch (rollbackError) {
        console.error('[server.js]: Error rolling back saved items:', rollbackError);
      }

      return res.status(500).json({
        error: 'Error saving items. No items were saved.',
        errors: errors
      });
    }

    // Only mark setup as complete if there are no errors
    if (errors.length > 0) {
      // If there are errors, don't mark setup as complete
      // Return error response with validation errors
      return res.status(400).json({
        error: 'Validation errors occurred. Setup was not completed.',
        errors: errors,
        imported: importedItems.length
      });
    }

    // All items saved successfully - mark setup as complete
    const pouchSize = pouchSizes[pouchType.toLowerCase()];
    const updateData = {
      vendingSetup: {
        pouchType: pouchType.toLowerCase(),
        shopImage: shopImage || null,
        setupDate: new Date()
      },
      vendingPoints: vendingPoints || 0,
      shopPouch: pouchType.toLowerCase(),
      pouchSize: pouchSize,
      vendorType: vendorType,
      vendingSync: false
    };

    await (character.constructor === Character ? Character : ModCharacter).findByIdAndUpdate(characterId, updateData);

    res.json({
      success: true,
      message: `Successfully set up vending shop for ${character.name}`,
      imported: importedItems.length
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error setting up vending shop:', error);
    res.status(500).json({ error: 'Failed to set up vending shop', details: error.message });
  }
});

// ------------------- Function: addVendingItem -------------------
// Adds an item to vending inventory and removes it from character inventory
app.post('/api/characters/:characterId/vending/items', async (req, res) => {
  try {
    const { characterId } = req.params;
    const userId = req.user.discordId;
    const { itemName, stockQty, tokenPrice, artPrice, otherPrice, barterOpen, slot } = req.body;

    // Validate required fields
    if (!itemName || !stockQty) {
      return res.status(400).json({ error: 'Item name and stock quantity are required' });
    }

    // Find character (check both regular and mod characters)
    let character = await Character.findById(characterId);
    if (!character) {
      character = await ModCharacter.findById(characterId);
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Verify character belongs to user
    if (character.userId !== userId) {
      return res.status(403).json({ error: 'You do not have permission to modify this character' });
    }

    // Check if character has vending setup
    if (!character.vendingSetup?.setupDate) {
      return res.status(400).json({ error: 'Character must set up vending shop first' });
    }

    // Find item in database to get maxStackSize
    const item = await Item.findOne({ itemName: itemName.trim() });
    if (!item) {
      return res.status(400).json({ error: `Item "${itemName}" not found in database` });
    }

    // Validate stack size
    const stockQtyNum = parseInt(stockQty);
    const isStackable = item.stackable || false;
    const maxStackSize = item.maxStackSize || 10;

    if (!isStackable && stockQtyNum > 1) {
      return res.status(400).json({ 
        error: `Item "${itemName}" is not stackable. Stock quantity must be 1, but ${stockQtyNum} was provided.` 
      });
    }

    if (isStackable && stockQtyNum > maxStackSize) {
      return res.status(400).json({ 
        error: `Item "${itemName}" has a maximum stack size of ${maxStackSize}, but ${stockQtyNum} was provided.` 
      });
    }

    // Check if character has enough items in inventory
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const inventoryItem = await inventoryCollection.findOne({
      characterId: character._id,
      itemName: { $regex: new RegExp(`^${itemName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (!inventoryItem || inventoryItem.quantity < stockQtyNum) {
      return res.status(400).json({ 
        error: `Not enough ${itemName} in inventory. Available: ${inventoryItem?.quantity || 0}, Requested: ${stockQtyNum}` 
      });
    }

    // Remove items from character inventory
    const newQuantity = inventoryItem.quantity - stockQtyNum;
    if (newQuantity <= 0) {
      // Remove the item entirely
      await inventoryCollection.deleteOne({
        characterId: character._id,
        itemName: inventoryItem.itemName
      });
    } else {
      // Update quantity
      await inventoryCollection.updateOne(
        { characterId: character._id, itemName: inventoryItem.itemName },
        { $inc: { quantity: -stockQtyNum } }
      );
    }

    // Initialize vending inventory model
    const { initializeVendingInventoryModel } = require('../shared/models/VendingModel');
    const VendingInventory = await initializeVendingInventoryModel(character.name);

    // Calculate slots used
    let slotsUsed = 1;
    if (isStackable) {
      slotsUsed = Math.ceil(stockQtyNum / maxStackSize);
    } else {
      slotsUsed = stockQtyNum;
    }

    // Check if item already exists in vending inventory (same slot or no slot)
    const existingItem = slot 
      ? await VendingInventory.findOne({ characterName: character.name, itemName: itemName.trim(), slot: slot })
      : await VendingInventory.findOne({ characterName: character.name, itemName: itemName.trim(), slot: { $exists: false } });

    if (existingItem) {
      // Update existing item
      await VendingInventory.updateOne(
        { _id: existingItem._id },
        {
          $inc: { stockQty: stockQtyNum },
          $set: {
            tokenPrice: tokenPrice !== null && tokenPrice !== undefined ? tokenPrice : existingItem.tokenPrice,
            artPrice: artPrice && artPrice.trim() !== '' ? artPrice : existingItem.artPrice,
            otherPrice: otherPrice && otherPrice.trim() !== '' ? otherPrice : existingItem.otherPrice,
            barterOpen: barterOpen !== undefined ? barterOpen : existingItem.barterOpen,
            tradesOpen: barterOpen !== undefined ? barterOpen : existingItem.tradesOpen,
            slotsUsed: slotsUsed
          }
        }
      );
    } else {
      // Create new vending item
      await VendingInventory.create({
        characterName: character.name,
        itemName: itemName.trim(),
        itemId: item._id,
        stockQty: stockQtyNum,
        costEach: 0,
        pointsSpent: 0,
        boughtFrom: character.currentVillage || 'Unknown',
        tokenPrice: tokenPrice !== null && tokenPrice !== undefined ? tokenPrice : null,
        artPrice: artPrice && artPrice.trim() !== '' ? artPrice : null,
        otherPrice: otherPrice && otherPrice.trim() !== '' ? otherPrice : null,
            tradesOpen: barterOpen !== undefined ? barterOpen : false,
            barterOpen: barterOpen !== undefined ? barterOpen : false,
        slot: slot && slot.trim() !== '' ? slot.trim() : null,
        date: new Date(),
        slotsUsed: slotsUsed,
        isPersonalItem: true,
        source: 'personal_inventory'
      });
    }

    // Log transaction for vendor move
    try {
      const user = await User.findOne({ discordId: userId });
      const fulfillmentId = `vendor_move_${uuidv4()}`;
      const vendorTransaction = new VendingRequest({
        fulfillmentId: fulfillmentId,
        userCharacterName: character.name,
        vendorCharacterName: character.name,
        itemName: itemName.trim(),
        quantity: stockQtyNum,
        paymentMethod: 'inventory_transfer',
        notes: `Vendor moved ${stockQtyNum}x ${itemName} from personal inventory to vending shop`,
        buyerId: userId,
        buyerUsername: user?.username || character.name,
        date: new Date(),
        status: 'completed',
        processedAt: new Date(),
        transactionType: 'vendor_move',
        sourceInventory: 'personal_inventory'
      });
      await vendorTransaction.save();
      console.log(`[server.js]: ✅ Logged vendor move transaction: ${fulfillmentId}`);
    } catch (txError) {
      console.error('[server.js]: ⚠️ Failed to log vendor move transaction:', txError);
      // Don't fail the request if transaction logging fails
    }

    console.log(`[server.js]: ✅ Added ${stockQtyNum}x ${itemName} to ${character.name}'s vending shop and removed from inventory`);
    console.log(`[server.js]: Barter open value: ${barterOpen}, tradesOpen: ${barterOpen || false}`);

    res.json({
      success: true,
      message: `Successfully added ${stockQtyNum}x ${itemName} to vending shop`,
      item: {
        itemName: itemName.trim(),
        stockQty: stockQtyNum,
        removedFromInventory: true
      }
    });

  } catch (error) {
    console.error('[server.js]: ❌ Error adding vending item:', error);
    res.status(500).json({ 
      error: 'Failed to add item to vending shop', 
      details: error.message 
    });
  }
});

// ------------------- Function: restockVendingItem -------------------
// Restocks an existing vending item using vending points, or creates it from vending stock if it doesn't exist
app.post('/api/characters/:characterId/vending/restock', async (req, res) => {
  try {
    const { characterId } = req.params;
    const userId = req.user.discordId;
    const { itemId, itemName, quantity, slot, costEach, tokenPrice, artPrice, otherPrice } = req.body;

    if (!itemName || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid restock request. Item name and quantity are required.' });
    }

    // Validate that at least one price is set (for new items)
    if (!itemId) {
      const hasTokenPrice = tokenPrice !== null && tokenPrice !== undefined && tokenPrice > 0;
      const hasArtPrice = artPrice && artPrice.trim() !== '' && artPrice.trim() !== 'N/A';
      const hasOtherPrice = otherPrice && otherPrice.trim() !== '' && otherPrice.trim() !== 'N/A';

      if (!hasTokenPrice && !hasArtPrice && !hasOtherPrice) {
        return res.status(400).json({ error: 'At least one price must be set (Token Price, Art Price, or Other Price). Items cannot be sold without at least one price.' });
      }
    }

    // Find character (check both regular and mod characters)
    let character = await Character.findById(characterId);
    if (!character) {
      character = await ModCharacter.findById(characterId);
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Verify character belongs to user
    if (character.userId !== userId) {
      return res.status(403).json({ error: 'You do not have permission to modify this character' });
    }

    // Check if character has vending setup
    if (!character.vendingSetup?.setupDate) {
      return res.status(400).json({ error: 'Character must set up vending shop first' });
    }

    // Get character job type (check vendorType first, then job field)
    const characterJob = (character.vendorType || character.job || '').toLowerCase().trim();
    const isShopkeeper = characterJob === 'shopkeeper';
    
    // Shopkeepers can only restock from their home village
    if (isShopkeeper) {
      const homeVillage = (character.homeVillage || '').toLowerCase().trim();
      const currentVillage = (character.currentVillage || '').toLowerCase().trim();
      
      if (!homeVillage) {
        return res.status(400).json({ error: 'Shopkeeper must have a home village set' });
      }
      
      if (currentVillage !== homeVillage) {
        return res.status(403).json({ 
          error: `Shopkeepers can only restock items from their home village. You are currently in ${character.currentVillage || 'unknown'}, but your home village is ${character.homeVillage || 'unknown'}.`,
          message: `Please travel to your home village (${character.homeVillage}) using the Discord command: \`/travel charactername:${character.name} destination:${character.homeVillage} mode:on foot\``
        });
      }
    }

    // Initialize vending inventory model
    const { initializeVendingInventoryModel } = require('../shared/models/VendingModel');
    const VendingInventory = await initializeVendingInventoryModel(character.name);

    // Find the existing item
    let vendingItem;
    let pointCost = costEach;
    
    try {
      if (itemId && itemId.match(/^[0-9a-fA-F]{24}$/)) {
        vendingItem = await VendingInventory.findById(itemId);
      }
      if (!vendingItem) {
        vendingItem = await VendingInventory.findOne({ 
          characterName: character.name, 
          itemName: itemName,
          ...(slot ? { slot: slot } : {})
        });
      }
    } catch (error) {
      console.error('[server.js]: Error finding vending item:', error);
      return res.status(500).json({ error: 'Error finding vending item', details: error.message });
    }

    // Track if this is a new item creation
    let isNewItem = false;

    // Get item details (needed for stack size validation in both branches)
    const itemDetails = await Item.findOne({ itemName });
    const isCustomItem = !itemDetails;

    // Validate stack size upfront (before processing)
    if (!isCustomItem && itemDetails) {
      const isStackable = itemDetails.stackable || false;
      const maxStackSize = itemDetails.maxStackSize || 10;
      
      if (!isStackable && quantity > 1) {
        return res.status(400).json({ 
          error: `Item "${itemName}" is not stackable. Quantity must be 1, but ${quantity} was provided.` 
        });
      }
      
      if (isStackable && quantity > maxStackSize) {
        return res.status(400).json({ 
          error: `Item "${itemName}" has a maximum stack size of ${maxStackSize} per slot. Cannot restock ${quantity} items in a single slot.` 
        });
      }

      // If a specific slot is provided and item exists in that slot, check if restocking would exceed maxStackSize
      if (slot && vendingItem && vendingItem.slot === slot) {
        const currentStock = vendingItem.stockQty || 0;
        const newTotal = currentStock + quantity;
        
        if (isStackable && newTotal > maxStackSize) {
          return res.status(400).json({ 
            error: `Cannot restock ${quantity} items in ${slot}. Current stock: ${currentStock}, max stack size: ${maxStackSize}. Adding ${quantity} would exceed the maximum (${newTotal} > ${maxStackSize}). Please restock ${maxStackSize - currentStock} or fewer items, or use a different slot.` 
          });
        }
      }
    }

    // If item doesn't exist, check if it's available in vending stock
    // BUT: If the user is providing a slot, they might be trying to restock an item that's not in current stock
    // In that case, we should allow it if they have the item in their inventory or if it's a custom item
    if (!vendingItem) {
      // First, check if item exists in character's personal inventory (for custom items)
      if (!inventoriesConnection) {
        return res.status(500).json({ error: 'Inventories database connection not available' });
      }
      
      // Get or create the Inventory model
      let Inventory;
      if (inventoriesConnection.models['Inventory']) {
        Inventory = inventoriesConnection.models['Inventory'];
      } else {
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
          craftedAt: { type: Date },
          gatheredAt: { type: Date },
          obtain: { type: String, default: '' },
          synced: { type: String, unique: true }
        });
        Inventory = inventoriesConnection.model('Inventory', inventorySchema);
      }
      
      const inventoryItem = await Inventory.findOne({ 
        characterId: character._id,
        itemName: itemName
      });

      // If item exists in inventory, allow restocking (it's a custom item)
      if (inventoryItem) {
        isNewItem = true;
        // We'll create the vending item below - skip vending stock check
      } else {
        // Get vending stock list to check if item is available
        const stockList = await getCurrentVendingStockList();
        if (!stockList?.stockList) {
          return res.status(404).json({ error: 'Vending stock not available. Item not found in your shop or in vending stock.' });
        }

        // Shopkeepers can only restock from their home village; Merchants can use current village
        const normalizedVillage = isShopkeeper 
          ? (character.homeVillage || '').toLowerCase().trim()
          : (character.currentVillage || character.homeVillage || '').toLowerCase().trim();
        const villageStock = stockList.stockList[normalizedVillage] || [];
        const limitedItems = stockList.limitedItems || [];
        
        logger.debug(`Looking for item "${itemName}" in vending stock`, {
          village: normalizedVillage,
          characterJob: characterJob,
          villageStockCount: villageStock.length,
          limitedItemsCount: limitedItems.length,
          availableVillages: Object.keys(stockList.stockList || {}),
          characterName: character.name
        }, 'server.js');
        
        // First check village stock (Merchant/Shopkeeper items)
        // Match by item name and vendingType (if character has a job)
        let itemDoc = villageStock.find(item => {
          const itemNameMatch = item.itemName.toLowerCase().trim() === itemName.toLowerCase().trim();
          if (!itemNameMatch) return false;
          
          // If character has a job, match by vendingType
          if (characterJob) {
            const itemVendingType = (item.vendingType || '').toLowerCase().trim();
            return itemVendingType === characterJob;
          }
          // If no job specified, match any item
          return true;
        });
        
        // If not found in village stock, check if item exists but with wrong vendingType
        if (!itemDoc && characterJob) {
          const itemWithWrongType = villageStock.find(item => 
            item.itemName.toLowerCase().trim() === itemName.toLowerCase().trim()
          );
          if (itemWithWrongType) {
            logger.debug(`Item "${itemName}" found but with wrong vendingType:`, {
              foundType: itemWithWrongType.vendingType,
              requiredType: characterJob,
              item: itemWithWrongType
            }, 'server.js');
          }
        }
        
        // If not found in village stock, check Limited items (available to both Shopkeepers and Merchants)
        if (!itemDoc) {
          itemDoc = limitedItems.find(item => 
            item.itemName.toLowerCase().trim() === itemName.toLowerCase().trim()
          );
        }
        
        // For merchants, also check other villages' stock (they can travel)
        if (!itemDoc && !isShopkeeper) {
          const allVillages = Object.keys(stockList.stockList || {});
          for (const otherVillage of allVillages) {
            if (otherVillage === normalizedVillage) continue; // Already checked
            const otherVillageStock = stockList.stockList[otherVillage] || [];
            const foundInOtherVillage = otherVillageStock.find(item => {
              const itemNameMatch = item.itemName.toLowerCase().trim() === itemName.toLowerCase().trim();
              if (!itemNameMatch) return false;
              if (characterJob) {
                const itemVendingType = (item.vendingType || '').toLowerCase().trim();
                return itemVendingType === characterJob;
              }
              return true;
            });
            if (foundInOtherVillage) {
              logger.debug(`Item "${itemName}" found in different village:`, {
                foundIn: otherVillage,
                currentVillage: normalizedVillage,
                item: foundInOtherVillage
              }, 'server.js');
              // Don't set itemDoc - merchant needs to be in that village to restock
              break;
            }
          }
        }

        if (!itemDoc) {
          // If user provided a slot explicitly, they might be restocking a custom item or item from previous stock
          // Check if item exists in character's inventory as a fallback
          if (slot) {
            // Already checked inventoryItem above, so if we're here, it doesn't exist
            // Log more details for debugging
            const availableItems = villageStock.map(item => `${item.itemName} (${item.vendingType || 'no type'})`).join(', ');
            const availableItemNames = villageStock.map(item => item.itemName).join(', ');
            logger.error(`Item "${itemName}" not found.`, null, 'server.js');
            logger.debug(`Item search details:`, {
              village: normalizedVillage,
              characterJob: characterJob,
              availableItems: availableItemNames || 'None',
              allItems: availableItems || 'None',
              limitedItemNames: limitedItems.map(item => item.itemName).join(', ') || 'None',
              searchedItemName: itemName
            }, 'server.js');
            return res.status(404).json({ 
              error: `Item "${itemName}" not found in vending stock for ${character.currentVillage || character.homeVillage || 'your village'} or in Limited items.`,
              details: characterJob ? `Looking for ${characterJob} items in ${normalizedVillage}` : `Looking in ${normalizedVillage}`,
              debug: {
                village: normalizedVillage,
                characterJob: characterJob,
                availableItems: availableItemNames || 'None'
              }
            });
          } else {
            // Log more details for debugging
            const availableItems = villageStock.map(item => `${item.itemName} (${item.vendingType || 'no type'})`).join(', ');
            const availableItemNames = villageStock.map(item => item.itemName).join(', ');
            logger.error(`Item "${itemName}" not found.`, null, 'server.js');
            logger.debug(`Item search details:`, {
              village: normalizedVillage,
              characterJob: characterJob,
              availableItems: availableItemNames || 'None',
              allItems: availableItems || 'None',
              limitedItemNames: limitedItems.map(item => item.itemName).join(', ') || 'None',
              searchedItemName: itemName
            }, 'server.js');
            return res.status(404).json({ 
              error: `Item "${itemName}" not found in vending stock for ${character.currentVillage || character.homeVillage || 'your village'} or in Limited items.`,
              details: characterJob ? `Looking for ${characterJob} items in ${normalizedVillage}` : `Looking in ${normalizedVillage}`,
              debug: {
                village: normalizedVillage,
                characterJob: characterJob,
                availableItems: availableItemNames || 'None'
              }
            });
          }
        } else {
          // Item found in vending stock, mark as new item
          isNewItem = true;
        }
      }

      // Calculate slot limits
      const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
      const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
      const vendorType = character.vendorType?.toLowerCase() || character.job?.toLowerCase() || 'shopkeeper';
      const pouchType = character.shopPouch?.toLowerCase() || character.vendingSetup?.pouchType?.toLowerCase() || 'none';
      const baseSlots = baseSlotLimits[vendorType] || 0;
      const pouchSlots = pouchCapacities[pouchType] || 0;
      const totalSlots = baseSlots + pouchSlots;

      // Find next available slot
      const allItems = await VendingInventory.find({ characterName: character.name });
      const occupiedSlots = new Set(allItems.map(item => item.slot).filter(Boolean));
      
      let newSlot = slot;
      if (!newSlot) {
        // Try to find existing slot with same item that has room (for stackable items)
        if (!isCustomItem && itemDetails) {
          const maxStackSize = itemDetails.maxStackSize || 10;
          const isStackable = itemDetails.stackable;
          
          if (isStackable) {
            // Find existing slot with same item that has room for the full quantity
            const existingItemSlot = allItems.find(item => {
              if (item.itemName === itemName && item.slot) {
                const newTotal = item.stockQty + quantity;
                return newTotal <= maxStackSize;
              }
              return false;
            });
            if (existingItemSlot) {
              // Found existing item in stackable slot with room for all items
              vendingItem = existingItemSlot;
              newSlot = existingItemSlot.slot;
            }
          }
        }
        
        // If no stacking slot found, find first available empty slot
        if (!newSlot) {
          for (let i = 1; i <= totalSlots; i++) {
            const slotName = `Slot ${i}`;
            if (!occupiedSlots.has(slotName)) {
              newSlot = slotName;
              break;
            }
          }
        }
      }

      if (!newSlot && !vendingItem) {
        return res.status(400).json({ error: 'No available slots in your shop. Please remove an item first.' });
      }

      // Use cost from stock if not provided (stock uses 'points' field)
      // For custom items from inventory, use the provided costEach
      let itemDoc = null;
      if (!inventoryItem) {
        // Get vending stock to find itemDoc for cost
        const stockList = await getCurrentVendingStockList();
        if (stockList?.stockList) {
          const normalizedVillage = (character.currentVillage || character.homeVillage || '').toLowerCase().trim();
          const villageStock = stockList.stockList[normalizedVillage] || [];
          const limitedItems = stockList.limitedItems || [];
          const characterJob = (character.vendorType || character.job || '').toLowerCase().trim();
          
          itemDoc = villageStock.find(item => {
            const itemNameMatch = item.itemName.toLowerCase().trim() === itemName.toLowerCase().trim();
            if (!itemNameMatch) return false;
            if (characterJob) {
              const itemVendingType = (item.vendingType || '').toLowerCase().trim();
              return itemVendingType === characterJob;
            }
            return true;
          });
          
          if (!itemDoc) {
            itemDoc = limitedItems.find(item => 
              item.itemName.toLowerCase().trim() === itemName.toLowerCase().trim()
            );
          }
        }
      }
      
      pointCost = pointCost || (itemDoc ? itemDoc.points : 0) || 0;
      
      if (!pointCost || pointCost <= 0) {
        return res.status(400).json({ error: 'This item cannot be restocked. No cost per item is set in vending stock.' });
      }

      // If we found an existing item in a stackable slot, skip creation (will increment below)
      // Otherwise, create new vending item
      if (!vendingItem) {
        isNewItem = true;
        vendingItem = new VendingInventory({
          characterName: character.name,
          itemName: itemName,
          itemId: itemDetails?._id || (itemDoc ? itemDoc.itemId : null) || null,
          stockQty: quantity,
          costEach: pointCost,
          pointsSpent: pointCost * quantity,
          boughtFrom: character.currentVillage || character.homeVillage || 'Unknown',
          slot: newSlot,
          date: new Date(),
          slotsUsed: isCustomItem ? quantity : (itemDetails?.stackable ? Math.ceil(quantity / (itemDetails.maxStackSize || 10)) : quantity),
          tokenPrice: tokenPrice !== null && tokenPrice !== undefined ? tokenPrice : null,
          artPrice: artPrice && artPrice.trim() !== '' && artPrice.trim() !== 'N/A' ? artPrice.trim() : null,
          otherPrice: otherPrice && otherPrice.trim() !== '' && otherPrice.trim() !== 'N/A' ? otherPrice.trim() : null
        });

        await vendingItem.save();
        console.log(`[server.js]: ✅ ${character.name} created and restocked ${quantity} × ${itemName} for ${pointCost * quantity} points`);
      }
    } else {
      // Item exists - use its costEach
      pointCost = vendingItem.costEach;
      
      if (!pointCost || pointCost <= 0) {
        return res.status(400).json({ error: 'This item cannot be restocked. No cost per item is set.' });
      }

      // Calculate total cost
      const totalCost = pointCost * quantity;

      // Check if character has enough vending points
      if (character.vendingPoints < totalCost) {
        return res.status(400).json({ 
          error: `Insufficient vending points. Required: ${totalCost}, Available: ${character.vendingPoints}` 
        });
      }

      // If item already existed (not newly created), update it by incrementing
      if (!isNewItem && vendingItem._id) {
        // Validate stack size when incrementing existing item
        if (!isCustomItem && itemDetails) {
          const isStackable = itemDetails.stackable || false;
          const maxStackSize = itemDetails.maxStackSize || 10;
          
          if (isStackable) {
            const currentStock = vendingItem.stockQty || 0;
            const newTotal = currentStock + quantity;
            
            if (newTotal > maxStackSize) {
              return res.status(400).json({ 
                error: `Cannot restock ${quantity} items. Current stock: ${currentStock}, max stack size: ${maxStackSize}. Adding ${quantity} would exceed the maximum (${newTotal} > ${maxStackSize}). Please restock ${maxStackSize - currentStock} or fewer items, or use a different slot.` 
              });
            }
          } else {
            // Non-stackable items - each item must be in its own slot
            if (vendingItem.stockQty > 0) {
              return res.status(400).json({ 
                error: `Item "${itemName}" is not stackable and already has stock in this slot. Cannot add more items to the same slot.` 
              });
            }
          }
        }

        const updateData = {
          $inc: { 
            stockQty: quantity,
            pointsSpent: totalCost
          },
          $set: {
            date: new Date(),
            boughtFrom: character.currentVillage || character.homeVillage || 'Unknown'
          }
        };

        // Update prices if provided (only if they're not null/undefined)
        if (tokenPrice !== null && tokenPrice !== undefined) {
          updateData.$set.tokenPrice = tokenPrice;
        }
        if (artPrice !== null && artPrice !== undefined && artPrice.trim() !== '') {
          updateData.$set.artPrice = artPrice.trim();
        }
        if (otherPrice !== null && otherPrice !== undefined && otherPrice.trim() !== '') {
          updateData.$set.otherPrice = otherPrice.trim();
        }

        // Update slotsUsed if item is stackable
        if (!isCustomItem && itemDetails && itemDetails.stackable) {
          const maxStackSize = itemDetails.maxStackSize || 10;
          const updatedStock = (vendingItem.stockQty || 0) + quantity;
          updateData.$set.slotsUsed = Math.ceil(updatedStock / maxStackSize);
        }

        await VendingInventory.findByIdAndUpdate(vendingItem._id, updateData);
        // Reload to get updated stockQty
        vendingItem = await VendingInventory.findById(vendingItem._id);
      }

      // Deduct vending points from character
      character.vendingPoints -= totalCost;
      await character.save();

      // Log transaction for vendor purchase
      try {
        const user = await User.findOne({ discordId: userId });
        const fulfillmentId = `vendor_purchase_${uuidv4()}`;
        const vendorTransaction = new VendingRequest({
          fulfillmentId: fulfillmentId,
          userCharacterName: character.name,
          vendorCharacterName: character.name,
          itemName: itemName,
          quantity: quantity,
          paymentMethod: 'vending_points',
          notes: `Vendor restocked ${quantity}x ${itemName} from vending stock`,
          buyerId: userId,
          buyerUsername: user?.username || character.name,
          date: new Date(),
          status: 'completed',
          processedAt: new Date(),
          transactionType: 'vendor_purchase',
          pointsSpent: totalCost
        });
        await vendorTransaction.save();
        console.log(`[server.js]: ✅ Logged vendor purchase transaction: ${fulfillmentId}`);
      } catch (txError) {
        console.error('[server.js]: ⚠️ Failed to log vendor purchase transaction:', txError);
        // Don't fail the request if transaction logging fails
      }

      console.log(`[server.js]: ✅ ${character.name} restocked ${quantity} × ${itemName} for ${totalCost} points`);

      res.json({
        success: true,
        message: `Successfully restocked ${quantity} × ${itemName}`,
        totalCost: totalCost,
        newStockQty: vendingItem.stockQty,
        remainingPoints: character.vendingPoints
      });
    }
  } catch (error) {
    console.error('[server.js]: ❌ Error restocking vending item:', error);
    res.status(500).json({ error: 'Failed to restock item', details: error.message });
  }
});

// ------------------- Function: updateVendingItem -------------------
// Updates an existing vending item
app.patch('/api/characters/:characterId/vending/items/:itemId', async (req, res) => {
  try {
    const { characterId, itemId } = req.params;
    const userId = req.user.discordId;
    const { stockQty, tokenPrice, artPrice, otherPrice, barterOpen, slot } = req.body;

    // Find character (check both regular and mod characters)
    let character = await Character.findById(characterId);
    if (!character) {
      character = await ModCharacter.findById(characterId);
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Verify character belongs to user
    if (character.userId !== userId) {
      return res.status(403).json({ error: 'You do not have permission to modify this character' });
    }

    // Check if character has vending setup
    if (!character.vendingSetup?.setupDate) {
      return res.status(400).json({ error: 'Character must set up vending shop first' });
    }

    // Initialize vending inventory model
    const { initializeVendingInventoryModel } = require('../shared/models/VendingModel');
    const VendingInventory = await initializeVendingInventoryModel(character.name);

    // Find the item - handle both ObjectId and string formats
    let vendingItem;
    try {
      // Try as ObjectId first if it's a valid ObjectId format
      if (itemId && typeof itemId === 'string' && itemId.match(/^[0-9a-fA-F]{24}$/)) {
        try {
          vendingItem = await VendingInventory.findById(itemId);
        } catch (idError) {
          // If findById fails, try findOne with ObjectId
          vendingItem = await VendingInventory.findOne({ _id: new ObjectId(itemId) });
        }
      }
      
      // If not found, try as string or other formats
      if (!vendingItem) {
        try {
          vendingItem = await VendingInventory.findOne({ _id: itemId });
        } catch (strError) {
          // Try with ObjectId conversion
          try {
            vendingItem = await VendingInventory.findOne({ _id: new ObjectId(itemId) });
          } catch (objIdError) {
            console.error('[server.js]: All attempts to find item failed:', objIdError);
          }
        }
      }
    } catch (error) {
      console.error('[server.js]: Error finding vending item:', error);
      return res.status(500).json({ error: 'Error searching for vending item', details: error.message, itemId: itemId });
    }

    if (!vendingItem) {
      return res.status(404).json({ error: 'Vending item not found', itemId: itemId });
    }

    // Find item in database to validate stack size if stockQty is being updated
    if (stockQty !== undefined) {
      const item = await Item.findOne({ itemName: vendingItem.itemName });
      if (item) {
        const stockQtyNum = parseInt(stockQty);
        const isStackable = item.stackable || false;
        const maxStackSize = item.maxStackSize || 10;

        if (!isStackable && stockQtyNum > 1) {
          return res.status(400).json({ 
            error: `Item "${vendingItem.itemName}" is not stackable. Stock quantity must be 1, but ${stockQtyNum} was provided.` 
          });
        }

        if (isStackable && stockQtyNum > maxStackSize) {
          return res.status(400).json({ 
            error: `Item "${vendingItem.itemName}" has a maximum stack size of ${maxStackSize}, but ${stockQtyNum} was provided.` 
          });
        }

        // Calculate slots used
        let slotsUsed = 1;
        if (isStackable) {
          slotsUsed = Math.ceil(stockQtyNum / maxStackSize);
        } else {
          slotsUsed = stockQtyNum;
        }
        vendingItem.slotsUsed = slotsUsed;
      }
      vendingItem.stockQty = parseInt(stockQty);
    }

    // Update other fields
    if (tokenPrice !== undefined) {
      vendingItem.tokenPrice = tokenPrice !== null ? parseFloat(tokenPrice) : null;
    }
    if (artPrice !== undefined) {
      vendingItem.artPrice = artPrice && artPrice.trim() !== '' ? artPrice.trim() : null;
    }
    if (otherPrice !== undefined) {
      vendingItem.otherPrice = otherPrice && otherPrice.trim() !== '' ? otherPrice.trim() : null;
    }
    if (barterOpen !== undefined) {
      vendingItem.tradesOpen = Boolean(barterOpen);
      vendingItem.barterOpen = Boolean(barterOpen);
    }
    if (slot !== undefined) {
      vendingItem.slot = slot && slot.trim() !== '' ? slot.trim() : null;
    }

    await vendingItem.save();

    res.json({
      success: true,
      message: 'Vending item updated successfully',
      item: vendingItem
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error updating vending item:', error);
    res.status(500).json({ error: 'Failed to update vending item', details: error.message });
  }
});

// ------------------- Function: deleteVendingItem -------------------
// Deletes a vending item
app.delete('/api/characters/:characterId/vending/items/:itemId', async (req, res) => {
  try {
    const { characterId, itemId } = req.params;
    const userId = req.user.discordId;

    // Find character (check both regular and mod characters)
    let character = await Character.findById(characterId);
    if (!character) {
      character = await ModCharacter.findById(characterId);
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Verify character belongs to user
    if (character.userId !== userId) {
      return res.status(403).json({ error: 'You do not have permission to modify this character' });
    }

    // Check if character has vending setup
    if (!character.vendingSetup?.setupDate) {
      return res.status(400).json({ error: 'Character must set up vending shop first' });
    }

    // Initialize vending inventory model
    const { initializeVendingInventoryModel } = require('../shared/models/VendingModel');
    const VendingInventory = await initializeVendingInventoryModel(character.name);

    // Find and delete the item
    let deleteResult;
    try {
      deleteResult = await VendingInventory.findByIdAndDelete(itemId);
    } catch (error) {
      // Try finding by string ID if ObjectId fails
      deleteResult = await VendingInventory.findOneAndDelete({ _id: itemId });
    }

    if (!deleteResult) {
      return res.status(404).json({ error: 'Vending item not found' });
    }

    res.json({
      success: true,
      message: 'Vending item deleted successfully'
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error deleting vending item:', error);
    res.status(500).json({ error: 'Failed to delete vending item', details: error.message });
  }
});

// ------------------- Function: updateShopImage -------------------
// Updates the shop banner image for a character
app.patch('/api/characters/:characterId/vending/shop-image', async (req, res) => {
  try {
    const { characterId } = req.params;
    const userId = req.user.discordId;
    const { shopImage } = req.body;

    // Find character (check both regular and mod characters)
    let character = await Character.findById(characterId);
    if (!character) {
      character = await ModCharacter.findById(characterId);
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Verify character belongs to user
    if (character.userId !== userId) {
      return res.status(403).json({ error: 'You do not have permission to modify this character' });
    }

    // Check if character has vending setup
    if (!character.vendingSetup?.setupDate) {
      return res.status(400).json({ error: 'Character must set up vending shop first' });
    }

    // Update shop image
    const updateData = {
      'vendingSetup.shopImage': shopImage || null
    };

    await (character.constructor === Character ? Character : ModCharacter).findByIdAndUpdate(characterId, updateData);

    res.json({
      success: true,
      message: 'Shop banner image updated successfully',
      shopImage: shopImage || null
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error updating shop banner image:', error);
    res.status(500).json({ error: 'Failed to update shop banner image', details: error.message });
  }
});

// ------------------- Function: getInventorySummary -------------------
// Returns inventory summary (counts) for all characters
app.get('/api/inventory/summary', async (req, res) => {
  try {
    
    
    const characters = await fetchAllCharacters();
    const summary = [];

    for (const char of characters) {
      try {
        const col = await getCharacterInventoryCollection(char.name);
        const items = await col.find().toArray();
        
        const totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const uniqueItems = items.length;
        
        summary.push({
          characterName: char.name,
          icon: char.icon,
          totalItems,
          uniqueItems,
          categories: [...new Set(items.map(item => item.category).filter(Boolean))],
          types: [...new Set(items.map(item => item.type).filter(Boolean))]
        });
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Error fetching inventory summary for character ${char.name}:`, error.message);
        // Add character with zero items
        summary.push({
          characterName: char.name,
          icon: char.icon,
          totalItems: 0,
          uniqueItems: 0,
          categories: [],
          types: []
        });
      }
    }
    

    res.json({ data: summary });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching inventory summary:', error);
    res.status(500).json({ error: 'Failed to fetch inventory summary', details: error.message });
  }
});

// ------------------- Function: getItemsData -------------------
// Returns all items data
app.get('/api/items', async (req, res) => {
  try {
    const items = await fetchAllItems();
    
    res.json(items);
  } catch (error) {
    logger.error('Error fetching items data', error, 'server.js');
    res.status(500).json({ error: 'Failed to fetch items data', details: error.message });
  }
});


// ------------------- Function: searchInventoryByItem -------------------
// Searches inventory for specific item across all characters
app.post('/api/inventory/item', async (req, res) => {
  
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
    logger.error('Error searching inventory by item', error, 'server.js');
    res.status(500).json({ error: 'Failed to fetch inventory data' });
  }
});

// ------------------- Section: Weather API Routes -------------------

// ------------------- Function: getWeatherDayBounds -------------------
// Calculates the start and end of the current weather day (8am to 8am)
function getWeatherDayBounds() {
  const now = new Date();
  const currentHour = now.getHours();
  
  let weatherDayStart, weatherDayEnd;
  
  if (currentHour >= 8) {
    // If it's 8am or later, the weather day started at 8am today
    weatherDayStart = new Date(now);
    weatherDayStart.setHours(8, 0, 0, 0);
    
    weatherDayEnd = new Date(now);
    weatherDayEnd.setDate(weatherDayEnd.getDate() + 1);
    weatherDayEnd.setHours(8, 0, 0, 0);
  } else {
    // If it's before 8am, the weather day started at 8am yesterday
    weatherDayStart = new Date(now);
    weatherDayStart.setDate(weatherDayStart.getDate() - 1);
    weatherDayStart.setHours(8, 0, 0, 0);
    
    weatherDayEnd = new Date(now);
    weatherDayEnd.setHours(8, 0, 0, 0);
  }
  
  return { weatherDayStart, weatherDayEnd };
}

// ------------------- Function: getTodayWeather -------------------
// Returns today's weather for all villages (using 8am-8am weather day)
app.get('/api/weather/today', async (req, res) => {
  try {
    
    
    const { weatherDayStart, weatherDayEnd } = getWeatherDayBounds();
    
    
    
    // Get weather for all villages for the current weather day
    const weatherData = await Weather.find({
      date: {
        $gte: weatherDayStart,
        $lt: weatherDayEnd
      }
    }).lean();
    
    // Organize by village
    const weatherByVillage = {};
    const villages = ['Rudania', 'Inariko', 'Vhintl'];
    
    villages.forEach(village => {
      const villageWeather = weatherData.find(w => w.village === village);
      weatherByVillage[village] = villageWeather || null;
    });
    
    
    res.json({
      date: weatherDayStart.toISOString(),
      weatherDayStart: weatherDayStart.toISOString(),
      weatherDayEnd: weatherDayEnd.toISOString(),
      villages: weatherByVillage
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching today\'s weather:', error);
    res.status(500).json({ error: 'Failed to fetch weather data', details: error.message });
  }
});

// ------------------- Function: getWeatherHistory -------------------
// Returns recent weather history for a specific village
app.get('/api/weather/history/:village', async (req, res) => {
  try {
    const { village } = req.params;
    const days = parseInt(req.query.days) || 7;
    
    // Determine the current season
    const currentSeason = calendarModule.getCurrentSeason();
    
    
    // Only fetch weather for the current season
    const history = await Weather.getRecentWeather(village, days, currentSeason);
    
    
    res.json({
      village,
      history,
      days,
      season: currentSeason
    });
  } catch (error) {
    console.error(`[server.js]: ❌ Error fetching weather history for ${req.params.village}:`, error);
    res.status(500).json({ error: 'Failed to fetch weather history', details: error.message });
  }
});

// ------------------- Function: getWeatherStats -------------------
// Returns weather statistics for all villages
app.get('/api/weather/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    logger.api(`Fetching weather stats for ${days} days`, 'server.js');
    
    const villages = ['Rudania', 'Inariko', 'Vhintl'];
    const statsData = {};
    
    for (const village of villages) {
      const history = await Weather.getRecentWeather(village, days);
      statsData[village] = history;
      logger.api(`Fetched ${history.length} weather records for ${village}`, 'server.js');
    }
    
    const totalRecords = Object.values(statsData).reduce((sum, data) => sum + data.length, 0);
    logger.api(`Returning weather stats: ${totalRecords} total records across ${villages.length} villages`, 'server.js');
    
    res.json({
      days,
      villages: statsData,
      totalRecords
    });
  } catch (error) {
    logger.error(`Error fetching weather statistics: ${error.message}`, error, 'server.js');
    res.status(500).json({ error: 'Failed to fetch weather statistics', details: error.message });
  }
});

// ------------------- Function: getCalendarSeason -------------------
// Returns the current season based on the calendar module
app.get('/api/calendar/season', (req, res) => {
  try {
    const currentSeason = calendarModule.getCurrentSeason();
    res.json({ 
      season: currentSeason,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[server.js]: ❌ Error getting current season:`, error);
    res.status(500).json({ error: 'Failed to get current season', details: error.message });
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

// ------------------- Section: Suggestions API -------------------
// Test endpoint to verify suggestions API is working
app.get('/api/suggestions/test', (req, res) => {
  res.json({ 
    message: 'Suggestions API is working',
    timestamp: new Date().toISOString()
  });
});

// Add middleware to log all requests to /api/suggestions
app.use('/api/suggestions', (req, res, next) => {
  console.log('🚀 MIDDLEWARE: Request to /api/suggestions detected');
  console.log('🚀 Method:', req.method);
  console.log('🚀 Headers:', req.headers);
  console.log('🚀 Body:', req.body);
  next();
});

// Add general request logging for debugging
app.use((req, res, next) => {
  if (req.url.includes('suggestion') || req.method === 'POST') {
    console.log('📡 GENERAL REQUEST:', req.method, req.url, new Date().toISOString());
  }
  next();
});

// Handle suggestion submissions and post to Discord
app.post('/api/suggestions', async (req, res) => {
  console.log('🔥 ===== SUGGESTION ENDPOINT HIT =====');
  console.log('🔥 Request received at:', new Date().toISOString());
  
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
    (req.connection.socket ? req.connection.socket.remoteAddress : null) || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  
  console.log('[server.js]: 📝 Suggestion submission received:', { 
    body: req.body,
    clientIP: clientIP,
    userAgent: userAgent,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.user) {
      console.warn('🚫 SECURITY: Unauthenticated suggestion submission attempt');
      console.warn('🌐 IP:', clientIP);
      console.warn('🔍 Session info:', {
        isAuthenticated: !!req.session.user,
        hasUser: !!req.user,
        sessionID: req.sessionID,
        userAgent: req.headers['user-agent']
      });
      console.warn('⏰ Timestamp:', new Date().toISOString());
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with Discord to submit suggestions.' 
      });
    }

    // Check if user is member of the required guild
    const requiredGuildId = '603960955839447050';
    const guildId = process.env.PROD_GUILD_ID;
    
    if (!guildId) {
      console.error('[server.js]: ❌ PROD_GUILD_ID not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Verify guild membership
    try {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('[server.js]: 🚫 User not in guild:', {
            discordId: req.user.discordId,
            username: req.user.username,
            clientIP: clientIP
          });
          return res.status(403).json({ 
            error: 'You must be a member of the Discord server to submit suggestions.' 
          });
        }
        throw new Error(`Discord API error: ${response.status}`);
      }
      
      console.log('[server.js]: ✅ Guild membership verified for user:', {
        discordId: req.user.discordId,
        username: req.user.username
      });
    } catch (error) {
      console.error('[server.js]: ❌ Error verifying guild membership:', error);
      return res.status(500).json({ error: 'Failed to verify server membership' });
    }

    const { category, title, description } = req.body;
    
    // Validate required fields
    if (!category || !title || !description) {
      console.log('[server.js]: 🚫 Missing required fields from user:', {
        discordId: req.user.discordId,
        username: req.user.username,
        clientIP: clientIP
      });
      return res.status(400).json({ 
        error: 'Missing required fields: category, title, and description are required' 
      });
    }

    // Security: Block links and script tags
    console.log('🔍 Running security validation checks...');
    const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/gi;
    const scriptRegex = /<script[^>]*>.*?<\/script>/gi;
    const scriptTagRegex = /<script[^>]*>/gi;
    
    console.log('🔍 Checking for links in title/description...');
    if (linkRegex.test(title) || linkRegex.test(description)) {
      console.warn('🚫 SECURITY: Link submission attempt blocked');
      console.warn('👤 User:', req.user.username, `(${req.user.discordId})`);
      console.warn('🌐 IP:', clientIP);
      console.warn('📝 Title:', title);
      console.warn('📄 Description:', description);
      console.warn('🔍 Link detected in:', {
        title: linkRegex.test(title),
        description: linkRegex.test(description)
      });
      console.warn('⏰ Timestamp:', new Date().toISOString());
      return res.status(400).json({ 
        error: 'Links are not allowed in suggestions. Please remove any URLs or website addresses.' 
      });
    }
    
    console.log('🔍 Checking for script tags in title/description...');
    if (scriptRegex.test(title) || scriptRegex.test(description) || 
        scriptTagRegex.test(title) || scriptTagRegex.test(description)) {
      console.error('🚨 CRITICAL SECURITY: Script injection attempt blocked');
      console.error('👤 User:', req.user.username, `(${req.user.discordId})`);
      console.error('🌐 IP:', clientIP);
      console.error('📝 Title:', title);
      console.error('📄 Description:', description);
      console.error('🔍 Script detected in:', {
        title: scriptRegex.test(title) || scriptTagRegex.test(title),
        description: scriptRegex.test(description) || scriptTagRegex.test(description)
      });
      console.error('⏰ Timestamp:', new Date().toISOString());
      console.error('🚨 This is a potential XSS attack attempt!');
      return res.status(400).json({ 
        error: 'Script tags are not allowed in suggestions.' 
      });
    }

    console.log('✅ Security validation passed - no malicious content detected');

    // Create suggestion object
    const suggestion = {
      category,
      title,
      description,
      timestamp: new Date().toISOString(),
      submittedAt: new Date(),
      userId: req.user.discordId,
      username: req.user.username
    };

    console.log('[server.js]: ✅ Valid suggestion from authenticated user:', {
      discordId: req.user.discordId,
      username: req.user.username,
      category: category,
      titleLength: title.length,
      descriptionLength: description.length,
      clientIP: clientIP
    });

    // Format category for better display
    const formatCategory = (cat) => {
      const categoryMap = {
        'features': '🚀 New Features',
        'improvements': '⚡ Server Improvements',
        'mechanics': '🎮 Game Mechanics',
        'jobs': '💼 Job System',
        'mounts': '🐎 Mounts & Pets',
        'exploration': '🗺️ Exploration & Expeditions',
        'events': '🎉 Event Suggestions',
        'content': '📚 Content Ideas',
        'chat': '💬 Chat & Channels',
        'moderation': '🛡️ Moderation & Rules',
        'bugs': '🐛 Bug Reports',
        'accessibility': '♿ Accessibility',
        'other': '📝 Other'
      };
      return categoryMap[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
    };

    // Post to Discord channel
    const discordChannelId = '1381479893090566144';
    const embed = {
      title: '💡 New Suggestion Submitted',
      description: 'A new anonymous suggestion has been submitted.',
      color: 0x00a3da, // Blue color matching your theme
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      fields: [
        {
          name: '__📋 Category__',
          value: `> ${formatCategory(category)}`,
          inline: true
        },
        {
          name: '__📝 Title__',
          value: `> **${title}**`,
          inline: false
        },
        {
          name: '__📄 Description__',
          value: (() => {
            // Split by newlines, trim each line, filter out empty lines
            const lines = description.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            // Add > to the beginning of each line
            const formattedLines = lines.map(line => `> ${line}`);
            // Join with actual newlines (not \n string)
            const formattedDescription = formattedLines.join('\n');
            
            const maxLength = 1024;
            if (formattedDescription.length > maxLength) {
              // Find the last complete line that fits within the limit
              let truncated = '';
              for (let i = 0; i < formattedLines.length; i++) {
                const testLine = truncated + (truncated ? '\n' : '') + formattedLines[i];
                if (testLine.length <= maxLength - 3) {
                  truncated = testLine;
                } else {
                  break;
                }
              }
              return truncated + '...';
            }
            return formattedDescription;
          })(),
          inline: false
        },
        {
          name: '__💭 Want to Suggest Something?__',
          value: `> [Click here to submit your own suggestion!](https://tinglebot.xyz/#suggestion-box-section)`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: '💡 Note: All suggestions are posted publicly and will be answered in the server.'
      }
    };

    // Send to Discord
    const discordResponse = await fetch(`https://discord.com/api/v10/channels/${discordChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    });

    if (!discordResponse.ok) {
      console.error('[server.js]: ❌ Discord API error:', {
        status: discordResponse.status,
        statusText: discordResponse.statusText,
        discordId: req.user.discordId,
        username: req.user.username,
        clientIP: clientIP
      });
      throw new Error(`Discord API error: ${discordResponse.status}`);
    }

    console.log('[server.js]: ✅ Suggestion posted to Discord successfully:', {
      discordId: req.user.discordId,
      username: req.user.username,
      category: category,
      title: title,
      clientIP: clientIP,
      timestamp: new Date().toISOString()
    });

    // Return success response
    res.json({ 
      success: true, 
      message: 'Suggestion submitted successfully and posted to Discord',
      suggestionId: Date.now() // Simple ID for reference
    });

  } catch (error) {
    console.error('[server.js]: ❌ Error submitting suggestion:', {
      error: error.message,
      stack: error.stack,
      clientIP: clientIP,
      userAgent: userAgent,
      userId: req.user?.discordId || 'unauthenticated',
      username: req.user?.username || 'unauthenticated',
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: 'Failed to submit suggestion',
      details: error.message 
    });
  }
});

// ------------------- Section: Member Lore API -------------------
// Test endpoint to verify member lore API is working
app.get('/api/member-lore/test', (req, res) => {
  res.json({ 
    message: 'Member Lore API is working',
    timestamp: new Date().toISOString()
  });
});

// Add middleware to log all requests to /api/member-lore
app.use('/api/member-lore', (req, res, next) => {
  console.log('🚀 MIDDLEWARE: Request to /api/member-lore detected');
  console.log('🚀 Method:', req.method);
  console.log('🚀 Headers:', req.headers);
  console.log('🚀 Body:', req.body);
  next();
});

// Handle member lore submissions and post to Discord
app.post('/api/member-lore', async (req, res) => {
  console.log('🔥 ===== MEMBER LORE ENDPOINT HIT =====');
  console.log('🔥 Request received at:', new Date().toISOString());
  
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
    (req.connection.socket ? req.connection.socket.remoteAddress : null) || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  
  console.log('[server.js]: 📝 Member lore submission received:', { 
    body: req.body,
    clientIP: clientIP,
    userAgent: userAgent,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.user) {
      console.warn('🚫 SECURITY: Unauthenticated lore submission attempt');
      console.warn('🌐 IP:', clientIP);
      console.warn('📝 Member Name:', req.body.memberName);
      console.warn('📄 Topic:', req.body.topic);
      console.warn('🔍 Session info:', {
        isAuthenticated: !!req.session.user,
        hasUser: !!req.user,
        sessionID: req.sessionID,
        userAgent: req.headers['user-agent']
      });
      console.warn('⏰ Timestamp:', new Date().toISOString());
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with Discord to submit lore.' 
      });
    }

    // Check if user is member of the required guild
    const guildId = process.env.PROD_GUILD_ID;
    
    if (!guildId) {
      console.error('[server.js]: ❌ PROD_GUILD_ID not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Verify guild membership
    try {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('[server.js]: 🚫 User not in guild:', {
            discordId: req.user.discordId,
            username: req.user.username,
            clientIP: clientIP
          });
          return res.status(403).json({ 
            error: 'You must be a member of the Discord server to submit lore.' 
          });
        }
        throw new Error(`Discord API error: ${response.status}`);
      }
      
      console.log('[server.js]: ✅ Guild membership verified for user:', {
        discordId: req.user.discordId,
        username: req.user.username
      });
    } catch (error) {
      console.error('[server.js]: ❌ Error verifying guild membership:', error);
      return res.status(500).json({ error: 'Failed to verify server membership' });
    }

    const { memberName, topic, description } = req.body;
    
    // Validate required fields
    if (!memberName || !topic || !description) {
      console.log('[server.js]: 🚫 Missing required fields from user:', {
        discordId: req.user.discordId,
        username: req.user.username,
        clientIP: clientIP
      });
      return res.status(400).json({ 
        error: 'Missing required fields: memberName, topic, and description are required' 
      });
    }

    // Security: Block links and script tags
    console.log('🔍 Running security validation checks...');
    const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/gi;
    const scriptRegex = /<script[^>]*>.*?<\/script>/gi;
    const scriptTagRegex = /<script[^>]*>/gi;
    
    console.log('🔍 Checking for links in memberName/topic/description...');
    if (linkRegex.test(memberName) || linkRegex.test(topic) || linkRegex.test(description)) {
      console.warn('🚫 SECURITY: Link submission attempt blocked');
      console.warn('👤 User:', req.user.username, `(${req.user.discordId})`);
      console.warn('🌐 IP:', clientIP);
      console.warn('📝 Member Name:', memberName);
      console.warn('📄 Topic:', topic);
      console.warn('📄 Description:', description);
      console.warn('🔍 Link detected in:', {
        memberName: linkRegex.test(memberName),
        topic: linkRegex.test(topic),
        description: linkRegex.test(description)
      });
      console.warn('⏰ Timestamp:', new Date().toISOString());
      return res.status(400).json({ 
        error: 'Links are not allowed in lore submissions. Please remove any URLs or website addresses.' 
      });
    }
    
    console.log('🔍 Checking for script tags in memberName/topic/description...');
    if (scriptRegex.test(memberName) || scriptRegex.test(topic) || scriptRegex.test(description) || 
        scriptTagRegex.test(memberName) || scriptTagRegex.test(topic) || scriptTagRegex.test(description)) {
      console.error('🚨 CRITICAL SECURITY: Script injection attempt blocked');
      console.error('👤 User:', req.user.username, `(${req.user.discordId})`);
      console.error('🌐 IP:', clientIP);
      console.error('📝 Member Name:', memberName);
      console.error('📄 Topic:', topic);
      console.error('📄 Description:', description);
      console.error('🔍 Script detected in:', {
        memberName: scriptRegex.test(memberName) || scriptTagRegex.test(memberName),
        topic: scriptRegex.test(topic) || scriptTagRegex.test(topic),
        description: scriptRegex.test(description) || scriptTagRegex.test(description)
      });
      console.error('⏰ Timestamp:', new Date().toISOString());
      console.error('🚨 This is a potential XSS attack attempt!');
      return res.status(400).json({ 
        error: 'Script tags are not allowed in lore submissions.' 
      });
    }

    console.log('✅ Security validation passed - no malicious content detected');

    // Save to database
    const MemberLore = require('../shared/models/MemberLoreModel');
    const loreSubmission = new MemberLore({
      memberName: memberName.trim(),
      topic: topic.trim(),
      description: description.trim(),
      userId: req.user.discordId,
      timestamp: new Date()
    });

    await loreSubmission.save();
    console.log('[server.js]: ✅ Lore saved to database:', {
      loreId: loreSubmission._id,
      discordId: req.user.discordId,
      username: req.user.username,
      memberName: memberName,
      topic: topic,
      clientIP: clientIP
    });

    // Create lore object for Discord
    const lore = {
      memberName,
      topic,
      description,
      timestamp: new Date().toISOString(),
      submittedAt: new Date(),
      userId: req.user.discordId,
      username: req.user.username,
      loreId: loreSubmission._id
    };

    console.log('[server.js]: ✅ Valid lore from authenticated user:', {
      discordId: req.user.discordId,
      username: req.user.username,
      memberName: memberName,
      topic: topic,
      descriptionLength: description.length,
      clientIP: clientIP
    });

    // Post to Discord channel
    const discordChannelId = '1381479893090566144'; // Same channel as suggestions
    const embed = {
      title: '📜 New Member Lore Submitted',
      description: 'A new lore submission has been submitted for review.',
      color: 0x8B4513, // Brown color for lore theme
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      fields: [
        {
          name: '__👤 Member Name__',
          value: `> **${memberName}**`,
          inline: true
        },
        {
          name: '__📋 Topic__',
          value: `> **${topic}**`,
          inline: true
        },
        {
          name: '__📜 Lore Description__',
          value: (() => {
            // Split by newlines, trim each line, filter out empty lines
            const lines = description.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            // Add > to the beginning of each line
            const formattedLines = lines.map(line => `> ${line}`);
            // Join with actual newlines (not \n string)
            const formattedDescription = formattedLines.join('\n');
            
            const maxLength = 1024;
            if (formattedDescription.length > maxLength) {
              // Find the last complete line that fits within the limit
              let truncated = '';
              for (let i = 0; i < formattedLines.length; i++) {
                const testLine = truncated + (truncated ? '\n' : '') + formattedLines[i];
                if (testLine.length <= maxLength - 3) {
                  truncated = testLine;
                } else {
                  break;
                }
              }
              return truncated + '...';
            }
            return formattedDescription;
          })(),
          inline: false
        },
        {
          name: '__📝 Want to Submit Lore?__',
          value: `> [Click here to submit your own lore!](https://tinglebot.xyz/#member-lore-section)`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: '📜 Note: All lore submissions are reviewed by moderators before being added to the world.'
      }
    };

    // Send to Discord
    const discordResponse = await fetch(`https://discord.com/api/v10/channels/${discordChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    });

    if (!discordResponse.ok) {
      console.error('[server.js]: ❌ Discord API error:', {
        status: discordResponse.status,
        statusText: discordResponse.statusText,
        discordId: req.user.discordId,
        username: req.user.username,
        clientIP: clientIP
      });
      throw new Error(`Discord API error: ${discordResponse.status}`);
    }

    console.log('[server.js]: ✅ Lore posted to Discord successfully:', {
      discordId: req.user.discordId,
      username: req.user.username,
      memberName: memberName,
      topic: topic,
      clientIP: clientIP,
      timestamp: new Date().toISOString()
    });

    // Return success response
    res.json({ 
      success: true, 
      message: 'Lore submitted successfully and posted to Discord for review',
      loreId: loreSubmission._id
    });

  } catch (error) {
    console.error('[server.js]: ❌ Error submitting lore:', {
      error: error.message,
      stack: error.stack,
      clientIP: clientIP,
      userAgent: userAgent,
      userId: req.user?.discordId || 'unauthenticated',
      username: req.user?.username || 'unauthenticated',
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: 'Failed to submit lore',
      details: error.message 
    });
  }
});

// ------------------- Section: Security Headers -------------------
// Set security headers for all responses
app.use((req, res, next) => {
  // Content Security Policy - Block remote scripts by default
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://kit.fontawesome.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://kit.fontawesome.com https://fonts.googleapis.com",
    "font-src 'self' https://kit.fontawesome.com https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://discord.com https://api.discord.com https://cdn.jsdelivr.net",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "media-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', cspDirectives);
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Strict Transport Security (HTTPS only)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
});

// ------------------- Section: Security Audit System -------------------

// Security patterns to detect malicious content
const SECURITY_PATTERNS = {
  // Script injection patterns
  scriptTags: /<script[^>]*>.*?<\/script>/gi,
  scriptTagOpen: /<script[^>]*>/gi,
  javascriptProtocol: /javascript:/gi,
  dataProtocol: /data:text\/html/gi,
  
  // Link patterns (potential phishing/malware)
  suspiciousLinks: /(https?:\/\/[^\s]*\.(tk|ml|ga|cf|click|download|exe|zip|rar|7z))/gi,
  ipAddresses: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/gi,
  
  // SQL injection patterns
  sqlInjection: /(union\s+select|drop\s+table|delete\s+from|insert\s+into|update\s+set|or\s+1\s*=\s*1)/gi,
  
  // XSS patterns
  xssPatterns: /(on\w+\s*=|eval\s*\(|expression\s*\(|url\s*\(|@import)/gi,
  
  // Command injection patterns
  commandInjection: /(;|\||&|\$\(|\`|cmd|powershell|bash|sh)/gi,
  
  // Suspicious file extensions
  suspiciousFiles: /\.(exe|bat|cmd|ps1|sh|php|asp|jsp|py|rb|pl)$/gi,
  
  // Base64 encoded content (potential payload)
  base64Content: /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi
};

// Fields to scan in each model
const SCANNABLE_FIELDS = {
  User: ['username', 'email', 'googleSheetsUrl', 'tokenTracker', 'lastMessageContent'],
  Character: ['name', 'pronouns', 'race', 'homeVillage', 'currentVillage', 'job', 'icon', 'birthday'],
  ApprovedSubmission: ['title', 'fileName', 'description', 'fileUrl', 'messageUrl'],
  Quest: ['title', 'description', 'questType', 'location', 'timeLimit', 'itemReward', 'specialNote'],
  Item: ['itemName', 'image', 'imageType', 'emoji'],
  Monster: ['name', 'description', 'image'],
  Village: ['name', 'description'],
  Weather: ['name', 'description'],
  Pet: ['name', 'description'],
  Mount: ['name', 'description'],
  Relic: ['name', 'description'],
  Party: ['name', 'description'],
  Relationship: ['description'],
  Inventory: ['itemName'],
  Vending: ['itemName', 'description'],
  VillageShops: ['itemName', 'description'],
  TableRoll: ['itemName', 'description'],
  StealStats: ['itemName'],
  BloodMoonTracking: ['description'],
  BlightRollHistory: ['description'],
  HelpWantedQuest: ['title', 'description', 'village', 'questType'],
  CharacterOfWeek: ['name', 'description'],
  ModCharacter: ['name', 'description'],
  RuuGame: ['name', 'description'],
  TempData: ['data']
};

// Security audit function
async function performSecurityAudit() {
  logger.debug('Starting comprehensive security audit...');
  const auditResults = {
    timestamp: new Date().toISOString(),
    totalRecordsScanned: 0,
    suspiciousRecords: [],
    criticalIssues: [],
    warnings: [],
    summary: {}
  };

  try {
    // Scan each model for malicious content
    for (const [modelName, fields] of Object.entries(SCANNABLE_FIELDS)) {
      try {
        const ModelModule = require(`./models/${modelName}Model.js`);
        logger.debug('Scanning ' + modelName + ' model...');
        
        // Handle models that export initialization functions vs direct models
        let Model;
        if (typeof ModelModule === 'function') {
          // This is an initialization function, get the model from MODEL_REGISTRY
          Model = MODEL_REGISTRY[modelName];
          if (!Model) {
            logger.error('server.js', 'Error scanning ' + modelName + ': Model not found in registry');
            continue;
          }
        } else {
          Model = ModelModule;
        }
        
        const records = await Model.find({}).lean();
        auditResults.totalRecordsScanned += records.length;
        
        for (const record of records) {
          const recordIssues = [];
          
          for (const field of fields) {
            if (record[field] && typeof record[field] === 'string') {
              const fieldValue = record[field];
              
              // Check each security pattern
              for (const [patternName, pattern] of Object.entries(SECURITY_PATTERNS)) {
                if (pattern.test(fieldValue)) {
                  const issue = {
                    model: modelName,
                    recordId: record._id,
                    field: field,
                    pattern: patternName,
                    value: fieldValue.substring(0, 200) + (fieldValue.length > 200 ? '...' : ''),
                    severity: getSeverity(patternName),
                    timestamp: new Date().toISOString()
                  };
                  
                  recordIssues.push(issue);
                  
                  if (issue.severity === 'critical') {
                    auditResults.criticalIssues.push(issue);
                  } else {
                    auditResults.warnings.push(issue);
                  }
                }
              }
            }
          }
          
          if (recordIssues.length > 0) {
            auditResults.suspiciousRecords.push({
              model: modelName,
              recordId: record._id,
              issues: recordIssues
            });
          }
        }
        
        logger.success('Scanned ' + records.length + ' ' + modelName + ' records');
      } catch (error) {
        logger.error('server.js', 'Error scanning ' + modelName + ': ' + error.message, error);
        auditResults.warnings.push({
          model: modelName,
          error: error.message,
          severity: 'warning'
        });
      }
    }
    
    // Generate summary
    auditResults.summary = {
      totalRecords: auditResults.totalRecordsScanned,
      suspiciousRecords: auditResults.suspiciousRecords.length,
      criticalIssues: auditResults.criticalIssues.length,
      warnings: auditResults.warnings.length,
      riskLevel: auditResults.criticalIssues.length > 0 ? 'HIGH' : 
                 auditResults.warnings.length > 5 ? 'MEDIUM' : 'LOW'
    };
    
    console.log('[server.js]: ✅ Security audit completed:', auditResults.summary);
    return auditResults;
    
  } catch (error) {
    console.error('[server.js]: ❌ Security audit failed:', error);
    throw error;
  }
}

// Determine severity of security issue
function getSeverity(patternName) {
  const criticalPatterns = ['scriptTags', 'scriptTagOpen', 'javascriptProtocol', 'sqlInjection', 'commandInjection'];
  const highPatterns = ['xssPatterns', 'dataProtocol', 'suspiciousFiles'];
  
  if (criticalPatterns.includes(patternName)) return 'critical';
  if (highPatterns.includes(patternName)) return 'high';
  return 'medium';
}

// Admin endpoint to run security audit
app.get('/api/admin/security-audit', async (req, res) => {
  try {
    // Check if user is admin
    const guildId = process.env.PROD_GUILD_ID;
    if (guildId) {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        const roles = memberData.roles || [];
        const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
        
        if (!ADMIN_ROLE_ID || !roles.includes(ADMIN_ROLE_ID)) {
          return res.status(403).json({ error: 'Admin access required' });
        }
      } else {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }
    
    console.log('[server.js]: 🔍 Admin security audit requested by:', req.user.username);
    const auditResults = await performSecurityAudit();
    
    res.json({
      success: true,
      audit: auditResults
    });
    
  } catch (error) {
    console.error('[server.js]: ❌ Security audit endpoint error:', error);
    res.status(500).json({ 
      error: 'Security audit failed',
      details: error.message 
    });
  }
});

// Codebase security scan function
async function performCodebaseSecurityScan() {
  console.log('[server.js]: 🔍 Starting codebase security scan...');
  const fs = require('fs').promises;
  const path = require('path');
  
  const codebaseResults = {
    timestamp: new Date().toISOString(),
    filesScanned: 0,
    suspiciousFiles: [],
    criticalIssues: [],
    warnings: []
  };

  try {
    // Directories to scan
    const scanDirectories = [
      './public/js',
      './public/css', 
      './models',
      './utils',
      './config'
    ];
    
    // File extensions to scan
    const scanExtensions = ['.js', '.html', '.css', '.json'];
    
    // Suspicious patterns in code
    const codePatterns = {
      evalUsage: /eval\s*\(/gi,
      functionConstructor: /new\s+Function\s*\(/gi,
      innerHTML: /\.innerHTML\s*=/gi,
      documentWrite: /document\.write\s*\(/gi,
      suspiciousUrls: /(https?:\/\/[^\s]*\.(tk|ml|ga|cf|click|download|exe|zip|rar|7z))/gi,
      hardcodedSecrets: /(password|secret|key|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
      suspiciousImports: /import\s+.*from\s+['"][^'"]*\.(tk|ml|ga|cf)['"]/gi,
      base64Decode: /atob\s*\(|Buffer\.from.*base64/gi,
      shellCommands: /(exec|spawn|system|shell)\s*\(/gi
    };
    
    for (const dir of scanDirectories) {
      try {
        const files = await fs.readdir(dir, { withFileTypes: true });
        
        for (const file of files) {
          if (file.isFile() && scanExtensions.some(ext => file.name.endsWith(ext))) {
            const filePath = path.join(dir, file.name);
            codebaseResults.filesScanned++;
            
            try {
              const content = await fs.readFile(filePath, 'utf8');
              const fileIssues = [];
              
              for (const [patternName, pattern] of Object.entries(codePatterns)) {
                const matches = content.match(pattern);
                if (matches) {
                  const issue = {
                    file: filePath,
                    pattern: patternName,
                    matches: matches.length,
                    severity: getCodeSeverity(patternName),
                    timestamp: new Date().toISOString()
                  };
                  
                  fileIssues.push(issue);
                  
                  if (issue.severity === 'critical') {
                    codebaseResults.criticalIssues.push(issue);
                  } else {
                    codebaseResults.warnings.push(issue);
                  }
                }
              }
              
              if (fileIssues.length > 0) {
                codebaseResults.suspiciousFiles.push({
                  file: filePath,
                  issues: fileIssues
                });
              }
              
            } catch (error) {
              console.warn(`[server.js]: ⚠️ Could not read file ${filePath}:`, error.message);
            }
          }
        }
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Could not scan directory ${dir}:`, error.message);
      }
    }
    
    console.log(`[server.js]: ✅ Codebase scan completed. Scanned ${codebaseResults.filesScanned} files`);
    return codebaseResults;
    
  } catch (error) {
    console.error('[server.js]: ❌ Codebase security scan failed:', error);
    throw error;
  }
}

// Determine severity of code security issue
function getCodeSeverity(patternName) {
  const criticalPatterns = ['evalUsage', 'functionConstructor', 'shellCommands'];
  const highPatterns = ['innerHTML', 'documentWrite', 'suspiciousUrls', 'hardcodedSecrets'];
  
  if (criticalPatterns.includes(patternName)) return 'critical';
  if (highPatterns.includes(patternName)) return 'high';
  return 'medium';
}

// Cleanup malicious content from database
async function cleanupMaliciousContent(issues) {
  console.log('[server.js]: 🧹 Starting malicious content cleanup...');
  const cleanupResults = {
    timestamp: new Date().toISOString(),
    recordsCleaned: 0,
    recordsDeleted: 0,
    errors: []
  };

  try {
    for (const issue of issues) {
      try {
        const Model = require(`./models/${issue.model}Model.js`);
        
        if (issue.severity === 'critical') {
          // For critical issues, delete the entire record
          await Model.findByIdAndDelete(issue.recordId);
          cleanupResults.recordsDeleted++;
          console.log(`[server.js]: 🗑️ Deleted critical record ${issue.recordId} from ${issue.model}`);
        } else {
          // For other issues, sanitize the field
          const record = await Model.findById(issue.recordId);
          if (record && record[issue.field]) {
            // Remove malicious content and replace with safe placeholder
            record[issue.field] = '[CONTENT REMOVED - SECURITY RISK]';
            await record.save();
            cleanupResults.recordsCleaned++;
            console.log(`[server.js]: 🧹 Sanitized field ${issue.field} in ${issue.model} record ${issue.recordId}`);
          }
        }
      } catch (error) {
        console.error(`[server.js]: ❌ Error cleaning up ${issue.model} record ${issue.recordId}:`, error.message);
        cleanupResults.errors.push({
          model: issue.model,
          recordId: issue.recordId,
          error: error.message
        });
      }
    }
    
    console.log('[server.js]: ✅ Malicious content cleanup completed:', cleanupResults);
    return cleanupResults;
    
  } catch (error) {
    console.error('[server.js]: ❌ Malicious content cleanup failed:', error);
    throw error;
  }
}

// Admin endpoint to clean up malicious content
app.post('/api/admin/security-cleanup', async (req, res) => {
  try {
    // Check if user is admin
    const guildId = process.env.PROD_GUILD_ID;
    if (guildId) {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        const roles = memberData.roles || [];
        const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
        
        if (!ADMIN_ROLE_ID || !roles.includes(ADMIN_ROLE_ID)) {
          return res.status(403).json({ error: 'Admin access required' });
        }
      } else {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }
    
    console.log('[server.js]: 🧹 Security cleanup requested by:', req.user.username);
    
    // First run a security audit to get current issues
    const auditResults = await performSecurityAudit();
    const allIssues = [...auditResults.criticalIssues, ...auditResults.warnings];
    
    if (allIssues.length === 0) {
      return res.json({
        success: true,
        message: 'No malicious content found to clean up',
        cleanup: { recordsCleaned: 0, recordsDeleted: 0 }
      });
    }
    
    // Clean up the malicious content
    const cleanupResults = await cleanupMaliciousContent(allIssues);
    
    res.json({
      success: true,
      message: `Security cleanup completed. Cleaned ${cleanupResults.recordsCleaned} records, deleted ${cleanupResults.recordsDeleted} records.`,
      cleanup: cleanupResults
    });
    
  } catch (error) {
    console.error('[server.js]: ❌ Security cleanup endpoint error:', error);
    res.status(500).json({ 
      error: 'Security cleanup failed',
      details: error.message 
    });
  }
});

// Combined security audit endpoint
app.get('/api/admin/security-audit-full', async (req, res) => {
  try {
    // Check if user is admin
    const guildId = process.env.PROD_GUILD_ID;
    if (guildId) {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        const roles = memberData.roles || [];
        const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
        
        if (!ADMIN_ROLE_ID || !roles.includes(ADMIN_ROLE_ID)) {
          return res.status(403).json({ error: 'Admin access required' });
        }
      } else {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }
    
    console.log('[server.js]: 🔍 Full security audit requested by:', req.user.username);
    
    // Run both database and codebase scans
    const [databaseAudit, codebaseAudit] = await Promise.all([
      performSecurityAudit(),
      performCodebaseSecurityScan()
    ]);
    
    const fullAuditResults = {
      timestamp: new Date().toISOString(),
      database: databaseAudit,
      codebase: codebaseAudit,
      overallRiskLevel: 'LOW'
    };
    
    // Determine overall risk level
    const totalCritical = databaseAudit.criticalIssues.length + codebaseAudit.criticalIssues.length;
    const totalWarnings = databaseAudit.warnings.length + codebaseAudit.warnings.length;
    
    if (totalCritical > 0) {
      fullAuditResults.overallRiskLevel = 'CRITICAL';
    } else if (totalWarnings > 10) {
      fullAuditResults.overallRiskLevel = 'HIGH';
    } else if (totalWarnings > 5) {
      fullAuditResults.overallRiskLevel = 'MEDIUM';
    }
    
    res.json({
      success: true,
      audit: fullAuditResults
    });
    
  } catch (error) {
    console.error('[server.js]: ❌ Full security audit endpoint error:', error);
    res.status(500).json({ 
      error: 'Full security audit failed',
      details: error.message 
    });
  }
});

// File integrity monitoring system
async function performFileIntegrityCheck() {
  console.log('[server.js]: 🔍 Starting file integrity check...');
  const fs = require('fs').promises;
  const path = require('path');
  const crypto = require('crypto');
  
  const integrityResults = {
    timestamp: new Date().toISOString(),
    filesChecked: 0,
    unexpectedFiles: [],
    modifiedFiles: [],
    suspiciousFiles: [],
    errors: []
  };

  try {
    // Critical directories to monitor
    const criticalDirs = [
      './public',
      './models',
      './utils',
      './config'
    ];
    
    // Suspicious file patterns
    const suspiciousPatterns = [
      /\.php$/i,
      /\.asp$/i,
      /\.jsp$/i,
      /\.py$/i,
      /\.rb$/i,
      /\.pl$/i,
      /\.sh$/i,
      /\.bat$/i,
      /\.cmd$/i,
      /\.exe$/i,
      /\.dll$/i,
      /\.so$/i,
      /\.dylib$/i,
      /\.phtml$/i,
      /\.php3$/i,
      /\.php4$/i,
      /\.php5$/i,
      /\.pht$/i,
      /\.phtm$/i,
      /\.shtml$/i,
      /\.htaccess$/i,
      /\.htpasswd$/i,
      /\.user\.ini$/i,
      /\.env$/i,
      /config\.php$/i,
      /wp-config\.php$/i,
      /\.bak$/i,
      /\.backup$/i,
      /\.old$/i,
      /\.tmp$/i,
      /\.temp$/i
    ];
    
    // Expected file extensions for this project
    const expectedExtensions = ['.js', '.html', '.css', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
    
    for (const dir of criticalDirs) {
      try {
        const files = await fs.readdir(dir, { withFileTypes: true, recursive: true });
        
        for (const file of files) {
          if (file.isFile()) {
            const filePath = path.join(dir, file.name);
            integrityResults.filesChecked++;
            
            // Check for suspicious file extensions
            const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(file.name));
            const hasExpectedExt = expectedExtensions.some(ext => file.name.endsWith(ext));
            
            if (isSuspicious) {
              integrityResults.suspiciousFiles.push({
                file: filePath,
                reason: 'Suspicious file extension',
                timestamp: new Date().toISOString()
              });
            } else if (!hasExpectedExt && !file.name.includes('.')) {
              // Files without extensions might be suspicious
              integrityResults.unexpectedFiles.push({
                file: filePath,
                reason: 'Unexpected file type',
                timestamp: new Date().toISOString()
              });
            }
            
            // Check file modification time (files modified in last 24 hours)
            try {
              const stats = await fs.stat(filePath);
              const now = new Date();
              const fileTime = new Date(stats.mtime);
              const hoursSinceModified = (now - fileTime) / (1000 * 60 * 60);
              
              if (hoursSinceModified < 24) {
                integrityResults.modifiedFiles.push({
                  file: filePath,
                  modifiedAt: fileTime.toISOString(),
                  hoursAgo: Math.round(hoursSinceModified * 100) / 100,
                  size: stats.size
                });
              }
            } catch (error) {
              integrityResults.errors.push({
                file: filePath,
                error: error.message
              });
            }
          }
        }
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Could not scan directory ${dir}:`, error.message);
        integrityResults.errors.push({
          directory: dir,
          error: error.message
        });
      }
    }
    
    console.log(`[server.js]: ✅ File integrity check completed. Checked ${integrityResults.filesChecked} files`);
    return integrityResults;
    
  } catch (error) {
    console.error('[server.js]: ❌ File integrity check failed:', error);
    throw error;
  }
}

// Log monitoring for compromise indicators
async function performLogAnalysis() {
  console.log('[server.js]: 🔍 Starting log analysis...');
  const fs = require('fs').promises;
  
  const logResults = {
    timestamp: new Date().toISOString(),
    suspiciousActivities: [],
    failedLogins: [],
    unusualRequests: [],
    errors: []
  };

  try {
    // Patterns to look for in logs
    const suspiciousPatterns = {
      failedLogins: /(failed|invalid|unauthorized|denied).*login/i,
      sqlInjection: /(union|select|drop|delete|insert|update).*(from|table|database)/i,
      xssAttempts: /<script|javascript:|on\w+\s*=/i,
      pathTraversal: /\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c/i,
      commandInjection: /(;|\||&|\$\(|\`|cmd|powershell|bash|sh)/i,
      suspiciousUserAgents: /(bot|crawler|scanner|hack|exploit|inject)/i,
      suspiciousIPs: /(127\.0\.0\.1|0\.0\.0\.0|localhost)/i
    };
    
    // Check for recent error logs or access logs
    const logFiles = [
      './logs/error.log',
      './logs/access.log',
      './logs/app.log',
      './error.log',
      './access.log'
    ];
    
    for (const logFile of logFiles) {
      try {
        const exists = await fs.access(logFile).then(() => true).catch(() => false);
        if (exists) {
          const content = await fs.readFile(logFile, 'utf8');
          const lines = content.split('\n').slice(-1000); // Check last 1000 lines
          
          for (const line of lines) {
            for (const [patternName, pattern] of Object.entries(suspiciousPatterns)) {
              if (pattern.test(line)) {
                logResults.suspiciousActivities.push({
                  logFile: logFile,
                  pattern: patternName,
                  line: line.substring(0, 200),
                  timestamp: new Date().toISOString()
                });
              }
            }
          }
        }
      } catch (error) {
        logResults.errors.push({
          logFile: logFile,
          error: error.message
        });
      }
    }
    
    console.log(`[server.js]: ✅ Log analysis completed. Found ${logResults.suspiciousActivities.length} suspicious activities`);
    return logResults;
    
  } catch (error) {
    console.error('[server.js]: ❌ Log analysis failed:', error);
    throw error;
  }
}

// Credential rotation and access audit system
async function performAccessAudit() {
  console.log('[server.js]: 🔍 Starting access audit...');
  
  const accessResults = {
    timestamp: new Date().toISOString(),
    adminUsers: [],
    recentLogins: [],
    suspiciousAccess: [],
    recommendations: []
  };

  try {
    // Get all users with admin roles
    const User = require('../shared/models/UserModel.js');
    const users = await User.find({}).lean();
    
    for (const user of users) {
      // Check if user has been active recently
      const lastActive = user.statusChangedAt || user.createdAt;
      const daysSinceActive = (new Date() - new Date(lastActive)) / (1000 * 60 * 60 * 24);
      
      if (daysSinceActive < 7) {
        accessResults.recentLogins.push({
          username: user.username,
          discordId: user.discordId,
          lastActive: lastActive,
          daysSinceActive: Math.round(daysSinceActive * 100) / 100,
          status: user.status
        });
      }
      
      // Flag users who haven't been active for a long time
      if (daysSinceActive > 90) {
        accessResults.suspiciousAccess.push({
          username: user.username,
          discordId: user.discordId,
          lastActive: lastActive,
          daysSinceActive: Math.round(daysSinceActive * 100) / 100,
          reason: 'Inactive for extended period'
        });
      }
    }
    
    // Generate recommendations
    if (accessResults.suspiciousAccess.length > 0) {
      accessResults.recommendations.push('Review and potentially disable inactive user accounts');
    }
    
    if (accessResults.recentLogins.length > 10) {
      accessResults.recommendations.push('Consider implementing additional authentication measures');
    }
    
    accessResults.recommendations.push('Rotate Discord bot tokens and API keys regularly');
    accessResults.recommendations.push('Review and audit admin role assignments');
    accessResults.recommendations.push('Implement two-factor authentication where possible');
    
    console.log(`[server.js]: ✅ Access audit completed. Found ${accessResults.recentLogins.length} recent logins`);
    return accessResults;
    
  } catch (error) {
    console.error('[server.js]: ❌ Access audit failed:', error);
    throw error;
  }
}

// Credential rotation and access management
app.get('/api/admin/credential-audit', async (req, res) => {
  try {
    // Check if user is admin
    const guildId = process.env.PROD_GUILD_ID;
    if (guildId) {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        const roles = memberData.roles || [];
        const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
        
        if (!ADMIN_ROLE_ID || !roles.includes(ADMIN_ROLE_ID)) {
          return res.status(403).json({ error: 'Admin access required' });
        }
      } else {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }
    
    console.log('[server.js]: 🔑 Credential audit requested by:', req.user.username);
    
    const credentialAudit = {
      timestamp: new Date().toISOString(),
      environmentVariables: [],
      recommendations: [],
      criticalActions: []
    };
    
    // Check environment variables for potential security issues
    const envVars = [
      'DISCORD_TOKEN',
      'DISCORD_CLIENT_ID',
      'DISCORD_CLIENT_SECRET',
      'MONGODB_URI',
      'ADMIN_ROLE_ID',
      'PROD_GUILD_ID',
      'SESSION_SECRET'
    ];
    
    for (const envVar of envVars) {
      const value = process.env[envVar];
      if (value) {
        credentialAudit.environmentVariables.push({
          name: envVar,
          hasValue: true,
          length: value.length,
          isSecure: value.length >= 32, // Basic security check
          lastRotated: 'Unknown', // Would need to track this
          needsRotation: false // Would need to implement rotation tracking
        });
      } else {
        credentialAudit.environmentVariables.push({
          name: envVar,
          hasValue: false,
          critical: ['DISCORD_TOKEN', 'MONGODB_URI', 'SESSION_SECRET'].includes(envVar)
        });
      }
    }
    
    // Generate recommendations
    credentialAudit.recommendations.push('Rotate Discord bot token every 90 days');
    credentialAudit.recommendations.push('Rotate session secret every 30 days');
    credentialAudit.recommendations.push('Review and audit admin role assignments monthly');
    credentialAudit.recommendations.push('Implement credential rotation tracking system');
    credentialAudit.recommendations.push('Use environment-specific credentials');
    credentialAudit.recommendations.push('Implement two-factor authentication for admin accounts');
    
    // Check for missing critical credentials
    const missingCritical = credentialAudit.environmentVariables.filter(env => 
      env.critical && !env.hasValue
    );
    
    if (missingCritical.length > 0) {
      credentialAudit.criticalActions.push('CRITICAL: Missing required environment variables');
    }
    
    res.json({
      success: true,
      audit: credentialAudit
    });
    
  } catch (error) {
    console.error('[server.js]: ❌ Credential audit error:', error);
    res.status(500).json({ 
      error: 'Credential audit failed',
      details: error.message 
    });
  }
});

// Combined comprehensive security check
app.get('/api/admin/security-comprehensive', async (req, res) => {
  try {
    // Check if user is admin
    const guildId = process.env.PROD_GUILD_ID;
    if (guildId) {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        const roles = memberData.roles || [];
        const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
        
        if (!ADMIN_ROLE_ID || !roles.includes(ADMIN_ROLE_ID)) {
          return res.status(403).json({ error: 'Admin access required' });
        }
      } else {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }
    
    console.log('[server.js]: 🔍 Comprehensive security check requested by:', req.user.username);
    
    // Run all security checks in parallel
    const [databaseAudit, codebaseAudit, fileIntegrity, logAnalysis, accessAudit] = await Promise.all([
      performSecurityAudit(),
      performCodebaseSecurityScan(),
      performFileIntegrityCheck(),
      performLogAnalysis(),
      performAccessAudit()
    ]);
    
    const comprehensiveResults = {
      timestamp: new Date().toISOString(),
      database: databaseAudit,
      codebase: codebaseAudit,
      fileIntegrity: fileIntegrity,
      logAnalysis: logAnalysis,
      accessAudit: accessAudit,
      overallRiskLevel: 'LOW',
      criticalActions: []
    };
    
    // Determine overall risk level and critical actions
    const totalCritical = databaseAudit.criticalIssues.length + codebaseAudit.criticalIssues.length;
    const totalSuspicious = fileIntegrity.suspiciousFiles.length + logAnalysis.suspiciousActivities.length;
    
    if (totalCritical > 0) {
      comprehensiveResults.overallRiskLevel = 'CRITICAL';
      comprehensiveResults.criticalActions.push('IMMEDIATE: Address critical security issues in database and codebase');
    }
    
    if (fileIntegrity.suspiciousFiles.length > 0) {
      comprehensiveResults.criticalActions.push('URGENT: Remove suspicious files from server');
    }
    
    if (logAnalysis.suspiciousActivities.length > 5) {
      comprehensiveResults.criticalActions.push('HIGH: Multiple suspicious activities detected in logs');
    }
    
    if (accessAudit.suspiciousAccess.length > 0) {
      comprehensiveResults.criticalActions.push('MEDIUM: Review inactive user accounts');
    }
    
    res.json({
      success: true,
      security: comprehensiveResults
    });
    
  } catch (error) {
    logger.error('❌ Comprehensive security check error', error, 'server.js');
    res.status(500).json({ 
      error: 'Comprehensive security check failed',
      details: error.message 
    });
  }
});

// Automated security audit (runs daily)
setInterval(async () => {
  try {
    logger.schedule('Running automated security audit...', 'server.js');
    const [databaseAudit, codebaseAudit, fileIntegrity, logAnalysis, accessAudit] = await Promise.all([
      performSecurityAudit(),
      performCodebaseSecurityScan(),
      performFileIntegrityCheck(),
      performLogAnalysis(),
      performAccessAudit()
    ]);
    
    // Log critical issues immediately
    const totalCritical = databaseAudit.criticalIssues.length + codebaseAudit.criticalIssues.length;
    const totalSuspicious = fileIntegrity.suspiciousFiles.length + logAnalysis.suspiciousActivities.length;
    
    if (totalCritical > 0 || totalSuspicious > 0) {
      const criticalDetails = {
        databaseIssues: databaseAudit.criticalIssues.length,
        codebaseIssues: codebaseAudit.criticalIssues.length,
        suspiciousFiles: fileIntegrity.suspiciousFiles.length,
        suspiciousActivities: logAnalysis.suspiciousActivities.length,
        totalCritical,
        totalSuspicious
      };
      logger.error(`🚨 CRITICAL SECURITY ISSUES DETECTED:\n${JSON.stringify(criticalDetails, null, 2)}`, null, 'server.js');
    }
    
    // Log summary
    const auditSummary = {
      database: databaseAudit.summary,
      codebase: {
        filesScanned: codebaseAudit.filesScanned,
        suspiciousFiles: codebaseAudit.suspiciousFiles.length,
        criticalIssues: codebaseAudit.criticalIssues.length,
        warnings: codebaseAudit.warnings.length
      },
      fileIntegrity: {
        filesChecked: fileIntegrity.filesChecked,
        suspiciousFiles: fileIntegrity.suspiciousFiles.length,
        unexpectedFiles: fileIntegrity.unexpectedFiles.length,
        modifiedFiles: fileIntegrity.modifiedFiles.length
      },
      logAnalysis: {
        suspiciousActivities: logAnalysis.suspiciousActivities.length
      },
      accessAudit: {
        recentLogins: accessAudit.recentLogins.length,
        suspiciousAccess: accessAudit.suspiciousAccess.length
      }
    };
    logger.info(`📊 Daily security audit summary:\n${JSON.stringify(auditSummary, null, 2)}`, 'server.js');
    
  } catch (error) {
    logger.error('❌ Automated security audit failed', error, 'server.js');
  }
}, 24 * 60 * 60 * 1000); // Run every 24 hours

// ------------------- Section: Authentication Routes -------------------
// Discord OAuth Login
app.get('/auth/discord', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    logger.error('DISCORD_CLIENT_ID not configured', 'server.js');
    return res.status(500).json({ error: 'OAuth not configured' });
  }

  const redirectUri = `${req.protocol}://${req.get('host')}/auth/discord/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  
  // Ensure session exists before setting state
  if (!req.session) {
    logger.error('[OAuth Init] No session object available', 'server.js');
    return res.status(500).json({ error: 'Session not available' });
  }
  
  req.session.oauthState = state;
  
  logger.info(`[OAuth Init] Setting OAuth state: ${state}`, 'server.js');
  logger.info(`[OAuth Init] Session ID: ${req.sessionID}`, 'server.js');
  logger.info(`[OAuth Init] Cookie will be set: ${JSON.stringify(req.session.cookie)}`, 'server.js');
  logger.info(`[OAuth Init] Redirect URI: ${redirectUri}`, 'server.js');

  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent('identify email')}&` +
    `state=${state}`;

  // Save session before redirecting
  req.session.save((err) => {
    if (err) {
      logger.error('[OAuth Init] Failed to save session before redirect', err, 'server.js');
      return res.status(500).json({ error: 'Failed to initialize session' });
    }
    logger.info(`[OAuth Init] Session saved successfully. Session ID: ${req.sessionID}`, 'server.js');
    res.redirect(discordAuthUrl);
  });
});

// Discord OAuth Callback
app.get('/auth/discord/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    logger.info(`[OAuth Callback] Received callback with code: ${code ? 'present' : 'missing'}, state: ${state || 'missing'}`, 'server.js');
    logger.info(`[OAuth Callback] Session ID: ${req.sessionID}`, 'server.js');
    logger.info(`[OAuth Callback] Cookies received: ${req.headers.cookie || 'none'}`, 'server.js');
    logger.info(`[OAuth Callback] Session exists: ${!!req.session}`, 'server.js');
    logger.info(`[OAuth Callback] Stored OAuth state: ${req.session?.oauthState || 'missing'}`, 'server.js');

    if (!code) {
      logger.warn('[OAuth Callback] No authorization code received', 'server.js');
      return res.redirect('/?error=no_code');
    }

    // Verify state to prevent CSRF attacks
    if (!state || state !== req.session.oauthState) {
      logger.warn(`[OAuth Callback] Invalid OAuth state parameter. Expected: ${req.session.oauthState || 'none'}, Received: ${state || 'none'}`, 'server.js');
      logger.warn(`[OAuth Callback] Session exists: ${!!req.session}, Session keys: ${req.session ? Object.keys(req.session).join(', ') : 'none'}`, 'server.js');
      return res.redirect('/?error=invalid_state');
    }

    logger.info('[OAuth Callback] State validation passed', 'server.js');

    // Clear the state from session
    delete req.session.oauthState;

    if (!clientId || !clientSecret) {
      logger.error('Discord OAuth credentials not configured', 'server.js');
      return res.redirect('/?error=oauth_not_configured');
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/auth/discord/callback`;

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error(`Discord token exchange failed: ${errorText}`, 'server.js');
      return res.redirect('/?error=token_exchange_failed');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    logger.info('[OAuth Callback] Successfully exchanged code for access token', 'server.js');

    // Fetch user info from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      logger.error(`[OAuth Callback] Failed to fetch user info from Discord: ${errorText}`, 'server.js');
      return res.redirect('/?error=fetch_user_failed');
    }

    const userData = await userResponse.json();
    logger.info(`[OAuth Callback] Successfully fetched user data for Discord ID: ${userData.id}, Username: ${userData.username}`, 'server.js');

    // Store user data in session
    req.session.user = {
      discordId: userData.id,
      username: userData.username,
      discriminator: userData.discriminator,
      avatar: userData.avatar,
      email: userData.email,
      globalName: userData.global_name
    };
    logger.info(`[OAuth Callback] Stored user data in session. Session ID: ${req.sessionID}`, 'server.js');

    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        logger.error('[OAuth Callback] Failed to save session', err, 'server.js');
        return res.redirect('/?error=session_save_failed');
      }
      logger.info('[OAuth Callback] Session saved successfully, redirecting to home', 'server.js');
      res.redirect('/');
    });
  } catch (error) {
    logger.error('OAuth callback error', error, 'server.js');
    res.redirect('/?error=oauth_error');
  }
});

// Logout route
app.get('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error('Failed to destroy session', err, 'server.js');
      return res.redirect('/?error=logout_failed');
    }
    res.redirect('/');
  });
});

// ------------------- Section: Admin Access Helper -------------------

// ------------------- Function: checkAdminAccess -------------------
// Checks if the user in the request has admin privileges
// Uses session caching to reduce Discord API calls and handle rate limits
async function checkAdminAccess(req) {
  try {
    // Check if user is authenticated
    const user = req.session?.user || req.user;
    if (!user || !user.discordId) {
      logger.info('[checkAdminAccess] No user or discordId in request', 'server.js');
      return false;
    }

    const guildId = process.env.PROD_GUILD_ID;
    const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

    if (!guildId || !ADMIN_ROLE_ID) {
      logger.warn(`[checkAdminAccess] Missing config: guildId=${!!guildId}, ADMIN_ROLE_ID=${!!ADMIN_ROLE_ID}`, 'server.js');
      return false;
    }

    // Check session cache first (cache for 5 minutes to reduce API calls)
    const cacheKey = `adminStatus_${user.discordId}`;
    const cacheTimestampKey = `adminStatusTimestamp_${user.discordId}`;
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    if (req.session[cacheKey] !== undefined) {
      const cacheTime = req.session[cacheTimestampKey] || 0;
      const now = Date.now();
      
      // If cache is still valid, return cached value
      if (now - cacheTime < CACHE_DURATION) {
        logger.info(`[checkAdminAccess] Using cached admin status for user ${user.discordId}: ${req.session[cacheKey]}`, 'server.js');
        return req.session[cacheKey];
      }
    }

    // Fetch user's roles from Discord
    try {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const memberData = await response.json();
        const roles = memberData.roles || [];
        // Convert both to strings for reliable comparison
        const adminRoleIdStr = String(ADMIN_ROLE_ID);
        const hasAdminRole = roles.some(roleId => String(roleId) === adminRoleIdStr);
        
        // Cache the result in session
        req.session[cacheKey] = hasAdminRole;
        req.session[cacheTimestampKey] = Date.now();
        
        logger.info(`[checkAdminAccess] User ${user.discordId} admin check: ${hasAdminRole} (roles: ${roles.length}, looking for: ${adminRoleIdStr})`, 'server.js');
        return hasAdminRole;
      } else if (response.status === 429) {
        // Rate limited - use cached value if available, otherwise return false
        const errorData = await response.json().catch(() => ({}));
        const retryAfter = errorData.retry_after || 1;
        
        logger.warn(`[checkAdminAccess] Discord API rate limited (429). Retry after: ${retryAfter}s. Using cached value if available.`, 'server.js');
        
        // If we have a cached value, use it even if expired
        if (req.session[cacheKey] !== undefined) {
          logger.info(`[checkAdminAccess] Using expired cache due to rate limit for user ${user.discordId}: ${req.session[cacheKey]}`, 'server.js');
          return req.session[cacheKey];
        }
        
        // No cache available, return false
        return false;
      } else {
        const errorText = await response.text();
        logger.warn(`[checkAdminAccess] Discord API error: ${response.status} ${response.statusText} - ${errorText}`, 'server.js');
        
        // On other errors, use cached value if available
        if (req.session[cacheKey] !== undefined) {
          logger.info(`[checkAdminAccess] Using cached value due to API error for user ${user.discordId}: ${req.session[cacheKey]}`, 'server.js');
          return req.session[cacheKey];
        }
        
        return false;
      }
    } catch (error) {
      logger.error(`[checkAdminAccess] Error checking admin status: ${error.message}`, 'server.js');
      
      // On network errors, use cached value if available
      if (req.session[cacheKey] !== undefined) {
        logger.info(`[checkAdminAccess] Using cached value due to network error for user ${user.discordId}: ${req.session[cacheKey]}`, 'server.js');
        return req.session[cacheKey];
      }
      
      return false;
    }
  } catch (error) {
    logger.error(`[checkAdminAccess] Error in checkAdminAccess: ${error.message}`, 'server.js');
    return false;
  }
}

// ------------------- Section: User Settings API Routes -------------------

// Get current user
app.get('/api/user', async (req, res) => {
  logger.info(`[API /api/user] Session ID: ${req.sessionID}, Has user: ${!!req.session.user}`, 'server.js');
  if (req.session.user) {
    logger.info(`[API /api/user] Returning authenticated user: ${req.session.user.discordId}`, 'server.js');
    
    // Check admin status
    const isAdmin = await checkAdminAccess(req);
    
    res.json({
      isAuthenticated: true,
      user: req.session.user,
      isAdmin: isAdmin
    });
  } else {
    logger.info('[API /api/user] No user in session, returning unauthenticated', 'server.js');
    res.json({
      isAuthenticated: false,
      user: null,
      isAdmin: false
    });
  }
});

// NOTE: User settings routes removed - authentication system removed
// These routes require req.user which no longer exists after auth removal

app.get('/api/user/settings', (req, res) => {
  res.status(401).json({ error: 'Authentication required' });
});

app.put('/api/user/settings', (req, res) => {
  res.status(401).json({ error: 'Authentication required' });
});

/* COMMENTED OUT - AUTH REMOVED
// Original user settings routes commented out since authentication removed
app.get('/api/user/settings', async (req, res) => {
  try {
    const user = await User.findOne({ discordId: req.user?.discordId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return settings with defaults if not set
    const settings = user.settings || {
      theme: 'dark',
      fontSize: 'medium',
      highContrast: false,
      imageQuality: 'medium',
      animationSpeed: 'normal',
      dateFormat: 'MM/DD/YYYY',
      timezone: 'auto',
      currencyFormat: 'USD',
      numberFormat: 'comma',
      itemsPerPage: 24,
      defaultSort: 'date-desc',
      bloodMoonAlerts: false,
      dailyResetReminders: false,
      weatherNotifications: false,
      characterWeekUpdates: false,
      blightCallNotifications: false,
      debuffEndNotifications: false,
      dailyWeatherNotifications: false,
      activityLogging: true,
      dataRetention: 90,
      profileVisibility: 'friends'
    };
    
    res.json({ 
      success: true,
      settings 
    });
  } catch (error) {
    console.error('[server.js]: Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

// Update user settings
app.put('/api/user/settings', async (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings' });
    }
    
    // Get current user settings before updating (to detect what changed)
    const currentUser = await User.findOne({ discordId: req.user.discordId });
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const oldSettings = currentUser.settings || {};
    
    // Validate and prepare settings to update
    const validSettings = [
      'theme', 'fontSize', 'highContrast', 'imageQuality', 'animationSpeed',
      'dateFormat', 'timezone', 'currencyFormat', 'numberFormat',
      'itemsPerPage', 'defaultSort',
      'bloodMoonAlerts', 'dailyResetReminders', 'weatherNotifications', 'characterWeekUpdates',
      'blightCallNotifications', 'debuffEndNotifications', 'dailyWeatherNotifications',
      'activityLogging', 'dataRetention', 'profileVisibility'
    ];
    
    const settingsToUpdate = {};
    const notificationTypes = ['bloodMoonAlerts', 'dailyResetReminders', 'weatherNotifications', 'characterWeekUpdates', 'blightCallNotifications', 'debuffEndNotifications', 'dailyWeatherNotifications'];
    const notificationsEnabled = [];
    
    for (const key of validSettings) {
      if (key in settings) {
        // Type conversion based on field
        if (['highContrast', 'bloodMoonAlerts', 'dailyResetReminders', 'weatherNotifications', 'characterWeekUpdates', 'blightCallNotifications', 'debuffEndNotifications', 'dailyWeatherNotifications', 'activityLogging'].includes(key)) {
          settingsToUpdate[`settings.${key}`] = Boolean(settings[key]);
          
          // Check if notification was just enabled (changed from false to true)
          if (notificationTypes.includes(key)) {
            const wasEnabled = oldSettings[key] === true;
            const isNowEnabled = Boolean(settings[key]) === true;
            
            if (!wasEnabled && isNowEnabled) {
              notificationsEnabled.push(key);
            }
          }
        } else if (['itemsPerPage', 'dataRetention'].includes(key)) {
          settingsToUpdate[`settings.${key}`] = parseInt(settings[key]) || settings[key];
        } else {
          settingsToUpdate[`settings.${key}`] = settings[key];
        }
      }
    }
    
    // Update user settings in database
    const user = await User.findOneAndUpdate(
      { discordId: req.user.discordId },
      { $set: settingsToUpdate },
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    logger.success(`Updated settings for user ${user.username || user.discordId}`, 'server.js');
    
    // Send confirmation DMs for newly enabled notifications (don't await - send in background)
    if (notificationsEnabled.length > 0) {
      logger.info(`Sending confirmation DMs for: ${notificationsEnabled.join(', ')}`);
      
      // Send DMs in the background (don't wait for completion)
      notificationsEnabled.forEach(notificationType => {
        notificationService.sendNotificationEnabledConfirmation(req.user.discordId, notificationType)
          .catch(err => {
            console.error(`[server.js]: Error sending confirmation for ${notificationType}:`, err);
          });
      });
    }
    
    res.json({ 
      success: true,
      message: 'Settings updated successfully',
      settings: user.settings 
    });
  } catch (error) {
    console.error('[server.js]: Error updating user settings:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});
*/

// Update user nickname
app.patch('/api/user/nickname', async (req, res) => {
  try {
    const { nickname } = req.body;
    
    // Validate nickname (optional field, can be empty)
    if (nickname !== undefined && nickname !== null) {
      // If provided, must be a string and not too long
      if (typeof nickname !== 'string') {
        return res.status(400).json({ error: 'Nickname must be a string' });
      }
      
      if (nickname.length > 50) {
        return res.status(400).json({ error: 'Nickname must be 50 characters or less' });
      }
    }
    
    // Update user nickname in database
    const user = await User.findOneAndUpdate(
      { discordId: req.user.discordId },
      { $set: { nickname: nickname || '' } },
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    logger.success(`Updated nickname for user ${user.username || user.discordId} to "${nickname || '(empty)'}"`);
    
    res.json({ 
      success: true,
      message: 'Nickname updated successfully',
      nickname: user.nickname
    });
  } catch (error) {
    console.error('[server.js]: Error updating user nickname:', error);
    res.status(500).json({ error: 'Failed to update nickname' });
  }
});

// ------------------- Section: Blupee Hunt System -------------------

// Claim blupee reward
app.post('/api/blupee/claim', async (req, res) => {
  try {
    // Check authentication
    if (!req.session?.user?.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const user = await User.findOne({ discordId: req.session.user.discordId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Initialize blupeeHunt if it doesn't exist
    if (!user.blupeeHunt) {
      user.blupeeHunt = {
        lastClaimed: null,
        totalClaimed: 0,
        claimHistory: [],
        dailyCount: 0,
        dailyResetDate: null
      };
    }
    
    const now = new Date();
    const DAILY_LIMIT = 5;
    const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    // Initialize daily tracking if not exists
    if (user.blupeeHunt.dailyCount === undefined) {
      user.blupeeHunt.dailyCount = 0;
      user.blupeeHunt.dailyResetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      await user.save();
    }
    
    // Check if we need to reset daily count (new day since last reset)
    const dailyResetDate = user.blupeeHunt.dailyResetDate ? new Date(user.blupeeHunt.dailyResetDate) : null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Only reset if it's actually a new day
    if (!dailyResetDate || dailyResetDate.getTime() !== today.getTime()) {
      console.log(`[server.js]: Resetting daily count for user ${user.username || user.discordId} - was ${user.blupeeHunt.dailyCount}, reset date was ${dailyResetDate}, new date is ${today}`);
      user.blupeeHunt.dailyCount = 0;
      user.blupeeHunt.dailyResetDate = today;
      await user.save(); // Save the reset immediately
    }
    
    // Check daily limit (5 per day) BEFORE incrementing
    if (user.blupeeHunt.dailyCount >= DAILY_LIMIT) {
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const timeUntilReset = tomorrow.getTime() - now.getTime();
      const hoursRemaining = Math.floor(timeUntilReset / (60 * 60 * 1000));
      const minutesRemaining = Math.floor((timeUntilReset % (60 * 60 * 1000)) / (60 * 1000));
      
      return res.status(429).json({ 
        success: false,
        error: 'Daily limit reached',
        message: `You've reached your daily limit of ${DAILY_LIMIT} blupees! Resets in ${hoursRemaining}h ${minutesRemaining}m`,
        dailyLimitReached: true,
        dailyCount: user.blupeeHunt.dailyCount,
        dailyLimit: DAILY_LIMIT,
        resetIn: timeUntilReset
      });
    }
    
    // Check for 30-minute cooldown
    const lastClaimed = user.blupeeHunt.lastClaimed;
    
    if (lastClaimed) {
      const timeSinceLastClaim = now - new Date(lastClaimed);
      if (timeSinceLastClaim < COOLDOWN_MS) {
        const cooldownRemaining = Math.ceil((COOLDOWN_MS - timeSinceLastClaim) / 1000);
        const minutesRemaining = Math.floor(cooldownRemaining / 60);
        const secondsRemaining = cooldownRemaining % 60;
        return res.status(429).json({ 
          success: false,
          error: 'Blupee on cooldown',
          message: `Please wait ${minutesRemaining}m ${secondsRemaining}s before catching another blupee!`,
          cooldownRemaining,
          dailyCount: user.blupeeHunt.dailyCount,
          dailyLimit: DAILY_LIMIT
        });
      }
    }
    
    // Award tokens
    const tokensAwarded = 10;
    user.tokens = (user.tokens || 0) + tokensAwarded;
    
    // Update blupee hunt tracking
    user.blupeeHunt.lastClaimed = now;
    user.blupeeHunt.totalClaimed = (user.blupeeHunt.totalClaimed || 0) + 1;
    user.blupeeHunt.dailyCount = (user.blupeeHunt.dailyCount || 0) + 1;
    user.blupeeHunt.claimHistory.push({
      tokensReceived: tokensAwarded,
      timestamp: now
    });
    
    await user.save();
    
    logger.success(`User ${user.username || user.discordId} claimed a blupee! (+${tokensAwarded} tokens, Daily: ${user.blupeeHunt.dailyCount}/${DAILY_LIMIT}, Total: ${user.blupeeHunt.totalClaimed})`);
    logger.debug('Daily count after claim: ' + user.blupeeHunt.dailyCount + ', reset date: ' + user.blupeeHunt.dailyResetDate);
    
    // Log to Google Sheets if user has a token tracker
    if (user.tokenTracker && googleSheets.isValidGoogleSheetsUrl(user.tokenTracker)) {
      try {
        const newRow = [
          'Dashboard - Blupee Catch',
          '',
          'Other',
          'earned',
          `${tokensAwarded}`
        ];
        await googleSheets.safeAppendDataToSheet(
          user.tokenTracker,
          user,
          'loggedTracker!B7:F',
          [newRow],
          null,
          { skipValidation: false }
        );
        logger.success(`Blupee catch logged to Google Sheets for user ${user.username || user.discordId}`);
      } catch (sheetError) {
        // Don't fail the entire request if Google Sheets logging fails
        const errorMessage = sheetError?.message || sheetError?.toString() || 'Unknown error';
        
        console.log('[server.js]: 🔍 Caught error while logging to Google Sheets:', errorMessage);
        
        // Only log as error if it's not a credential issue (which is expected in local dev)
        if (errorMessage.includes('credentials') || 
            errorMessage.includes('No key or keyFile') || 
            errorMessage.includes('authentication failed') ||
            errorMessage.includes('functionality disabled')) {
          // Silently skip - this is expected in local dev without credentials
          console.log('[server.js]: ℹ️ Google Sheets logging skipped (not configured in this environment)');
        } else {
          console.error('[server.js]: ❌ Unexpected error logging blupee to Google Sheets:', errorMessage);
          logger.error('server.js', `Failed to log blupee catch to Google Sheets for user ${user.username || user.discordId}: ${errorMessage}`);
        }
      }
    }
    
    res.json({
      success: true,
      message: `You found a blupee! +${tokensAwarded} tokens!`,
      tokensAwarded,
      newTokenBalance: user.tokens,
      totalBlupeesFound: user.blupeeHunt.totalClaimed,
      dailyCount: user.blupeeHunt.dailyCount,
      dailyLimit: DAILY_LIMIT,
      dailyRemaining: DAILY_LIMIT - user.blupeeHunt.dailyCount
    });
  } catch (error) {
    console.error('[server.js]: Error claiming blupee:', error);
    res.status(500).json({ error: 'Failed to claim blupee reward' });
  }
});

// Get blupee status (check if user can claim)
app.get('/api/blupee/status', async (req, res) => {
  try {
    // Check authentication
    if (!req.session?.user?.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const user = await User.findOne({ discordId: req.session.user.discordId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const DAILY_LIMIT = 5;
    const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes in milliseconds
    const now = new Date();
    
    // Initialize blupeeHunt if it doesn't exist
    if (!user.blupeeHunt) {
      return res.json({
        canClaim: true,
        totalClaimed: 0,
        lastClaimed: null,
        cooldownRemaining: 0,
        dailyCount: 0,
        dailyLimit: DAILY_LIMIT,
        dailyRemaining: DAILY_LIMIT,
        dailyLimitReached: false
      });
    }
    
    // Initialize daily tracking if not exists
    if (user.blupeeHunt.dailyCount === undefined) {
      user.blupeeHunt.dailyCount = 0;
      user.blupeeHunt.dailyResetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      await user.save();
    }
    
    // Check if we need to reset daily count (new day since last reset)
    const dailyResetDate = user.blupeeHunt.dailyResetDate ? new Date(user.blupeeHunt.dailyResetDate) : null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Only reset if it's actually a new day
    if (!dailyResetDate || dailyResetDate.getTime() !== today.getTime()) {
      console.log(`[server.js]: STATUS - Resetting daily count for user ${user.username || user.discordId} - was ${user.blupeeHunt.dailyCount}, reset date was ${dailyResetDate}, new date is ${today}`);
      user.blupeeHunt.dailyCount = 0;
      user.blupeeHunt.dailyResetDate = today;
      await user.save();
    }
    
    const dailyCount = user.blupeeHunt.dailyCount || 0;
    const dailyLimitReached = dailyCount >= DAILY_LIMIT;
    
    let canClaim = true;
    let cooldownRemaining = 0;
    let resetIn = 0;
    
    // Check daily limit first
    if (dailyLimitReached) {
      canClaim = false;
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      resetIn = tomorrow.getTime() - now.getTime();
    }
    
    // Check for 30-minute cooldown
    const lastClaimed = user.blupeeHunt.lastClaimed;
    
    if (lastClaimed && !dailyLimitReached) {
      const timeSinceLastClaim = now - new Date(lastClaimed);
      if (timeSinceLastClaim < COOLDOWN_MS) {
        canClaim = false;
        cooldownRemaining = Math.ceil((COOLDOWN_MS - timeSinceLastClaim) / 1000); // seconds remaining
      }
    }
    
    res.json({
      canClaim,
      totalClaimed: user.blupeeHunt.totalClaimed || 0,
      lastClaimed: user.blupeeHunt.lastClaimed,
      cooldownRemaining,
      dailyCount,
      dailyLimit: DAILY_LIMIT,
      dailyRemaining: Math.max(0, DAILY_LIMIT - dailyCount),
      dailyLimitReached,
      resetIn
    });
  } catch (error) {
    console.error('[server.js]: Error checking blupee status:', error);
    res.status(500).json({ error: 'Failed to check blupee status' });
  }
});

// ------------------- Section: Notification API Routes -------------------

const notificationService = require('../shared/utils/notificationService');

// Send Blood Moon alerts
app.post('/api/notifications/blood-moon', async (req, res) => {
  try {
    // Check if user is admin
    const guildId = process.env.PROD_GUILD_ID;
    let isAdmin = false;
    
    if (guildId) {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        const roles = memberData.roles || [];
        const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
        isAdmin = ADMIN_ROLE_ID && roles.includes(ADMIN_ROLE_ID);
      }
    }
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { description, fields } = req.body;
    
    const stats = await notificationService.sendBloodMoonAlerts({
      description,
      fields
    });
    
    res.json({
      success: true,
      message: 'Blood Moon alerts sent',
      stats
    });
  } catch (error) {
    console.error('[server.js]: Error sending Blood Moon alerts:', error);
    res.status(500).json({ error: 'Failed to send Blood Moon alerts' });
  }
});

// Send Daily Reset reminders
app.post('/api/notifications/daily-reset', async (req, res) => {
  try {
    // Check if user is admin
    const guildId = process.env.PROD_GUILD_ID;
    let isAdmin = false;
    
    if (guildId) {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        const roles = memberData.roles || [];
        const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
        isAdmin = ADMIN_ROLE_ID && roles.includes(ADMIN_ROLE_ID);
      }
    }
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const stats = await notificationService.sendDailyResetReminders();
    
    res.json({
      success: true,
      message: 'Daily Reset reminders sent',
      stats
    });
  } catch (error) {
    console.error('[server.js]: Error sending Daily Reset reminders:', error);
    res.status(500).json({ error: 'Failed to send Daily Reset reminders' });
  }
});

// Send Weather notifications
app.post('/api/notifications/weather', async (req, res) => {
  try {
    // Check if user is admin
    const guildId = process.env.PROD_GUILD_ID;
    let isAdmin = false;
    
    if (guildId) {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        const roles = memberData.roles || [];
        const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
        isAdmin = ADMIN_ROLE_ID && roles.includes(ADMIN_ROLE_ID);
      }
    }
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { type, description, village, duration, fields } = req.body;
    
    const stats = await notificationService.sendWeatherNotifications({
      type,
      description,
      village,
      duration,
      fields
    });
    
    res.json({
      success: true,
      message: 'Weather notifications sent',
      stats
    });
  } catch (error) {
    console.error('[server.js]: Error sending Weather notifications:', error);
    res.status(500).json({ error: 'Failed to send Weather notifications' });
  }
});

// Send Character of Week notifications
app.post('/api/notifications/character-of-week', async (req, res) => {
  try {
    // Check if user is admin
    const guildId = process.env.PROD_GUILD_ID;
    let isAdmin = false;
    
    if (guildId) {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        const roles = memberData.roles || [];
        const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
        isAdmin = ADMIN_ROLE_ID && roles.includes(ADMIN_ROLE_ID);
      }
    }
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, description, icon, fields } = req.body;
    
    const stats = await notificationService.sendCharacterOfWeekNotifications({
      name,
      description,
      icon,
      fields
    });
    
    res.json({
      success: true,
      message: 'Character of Week notifications sent',
      stats
    });
  } catch (error) {
    console.error('[server.js]: Error sending Character of Week notifications:', error);
    res.status(500).json({ error: 'Failed to send Character of Week notifications' });
  }
});

// ------------------- Section: Data Export API Routes -------------------

// Export character data
app.get('/api/characters/export', async (req, res) => {
  try {
    const characters = await Character.find({}).lean();
    const modCharacters = await ModCharacter.find({}).lean();
    
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      characters: characters,
      modCharacters: modCharacters,
      totalCount: characters.length + modCharacters.length
    };
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting character data:', error);
    res.status(500).json({ error: 'Failed to export character data' });
  }
});

// Export inventory data
app.get('/api/inventory/export', async (req, res) => {
  try {
    const inventories = await getCharacterInventoryCollection().find({}).toArray();
    
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      inventories: inventories,
      totalCount: inventories.length
    };
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting inventory data:', error);
    res.status(500).json({ error: 'Failed to export inventory data' });
  }
});

// Export relationship data
app.get('/api/relationships/export', async (req, res) => {
  try {
    const relationships = await Relationship.find({}).lean();
    
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      relationships: relationships,
      totalCount: relationships.length
    };
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting relationship data:', error);
    res.status(500).json({ error: 'Failed to export relationship data' });
  }
});

// Export all user data (requires authentication)
app.get('/api/user/export-all', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.discordId;
    
    // Get user's characters
    const characters = await Character.find({ userId: userId }).lean();
    const modCharacters = await ModCharacter.find({ userId: userId }).lean();
    
    // Get user's inventory
    const inventories = await getCharacterInventoryCollection().find({ userId: userId }).toArray();
    
    // Get user's relationships
    const relationships = await Relationship.find({ 
      $or: [
        { character1Id: { $in: characters.map(c => c._id) } },
        { character2Id: { $in: characters.map(c => c._id) } }
      ]
    }).lean();
    
    // Get user's profile
    const userProfile = await User.findOne({ discordId: userId }).lean();
    
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      user: {
        discordId: userId,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar
      },
      characters: characters,
      modCharacters: modCharacters,
      inventories: inventories,
      relationships: relationships,
      profile: userProfile,
      summary: {
        totalCharacters: characters.length + modCharacters.length,
        totalInventories: inventories.length,
        totalRelationships: relationships.length
      }
    };
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting user data:', error);
    res.status(500).json({ error: 'Failed to export user data' });
  }
});

// ------------------- Section: Leveling System API Routes -------------------

// Get user's level and rank information
app.get('/api/user/levels/rank', async (req, res) => {
  try {
    if (!req.user || !req.user.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const user = await User.findOne({ discordId: req.user.discordId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get leveling data
    const leveling = user.leveling || {
      xp: 0,
      level: 1,
      lastMessageTime: null,
      totalMessages: 0
    };
    
    // Calculate progress to next level
    const progress = user.getProgressToNextLevel();
    
    // Get rank (position on leaderboard)
    const higherRankedUsers = await User.countDocuments({
      $or: [
        { 'leveling.level': { $gt: leveling.level } },
        { 
          'leveling.level': leveling.level,
          'leveling.xp': { $gt: leveling.xp }
        }
      ]
    });
    const rank = higherRankedUsers + 1;
    
    // Get exchange information
    const exchangeInfo = user.getExchangeableLevels();
    
    res.json({
      success: true,
      level: leveling.level,
      xp: leveling.xp,
      totalMessages: leveling.totalMessages,
      rank: rank,
      progress: progress,
      exchange: exchangeInfo,
      hasImportedFromMee6: leveling.hasImportedFromMee6 || false,
      importedMee6Level: leveling.importedMee6Level || null
    });
  } catch (error) {
    console.error('[server.js]: Error fetching user level rank:', error);
    res.status(500).json({ error: 'Failed to fetch level rank' });
  }
});

// Get leaderboard
app.get('/api/levels/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const limitCapped = Math.min(Math.max(limit, 5), 50); // Between 5 and 50
    
    const topUsers = await User.find({})
      .sort({ 'leveling.level': -1, 'leveling.xp': -1 })
      .limit(limitCapped)
      .select('discordId username discriminator avatar leveling nickname')
      .lean();
    
    // Format the response
    const leaderboard = topUsers.map((user, index) => ({
      rank: index + 1,
      discordId: user.discordId,
      username: user.username || 'Unknown',
      nickname: user.nickname || '',
      discriminator: user.discriminator || '0000',
      avatar: user.avatar,
      level: user.leveling?.level || 1,
      xp: user.leveling?.xp || 0,
      totalMessages: user.leveling?.totalMessages || 0
    }));
    
    res.json({
      success: true,
      leaderboard: leaderboard,
      total: leaderboard.length
    });
  } catch (error) {
    console.error('[server.js]: Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ------------------- Section: Token Transaction API Routes -------------------

// Helper function to read transactions from Google Sheets
async function readTransactionsFromGoogleSheets(userId, tokenTrackerUrl) {
  try {
    if (!tokenTrackerUrl || !googleSheets.isValidGoogleSheetsUrl(tokenTrackerUrl)) {
      console.log(`[server.js]: ⚠️ Invalid or missing token tracker URL for user ${userId}`);
      return [];
    }
    
    console.log(`[server.js]: 📊 Reading Google Sheets for user ${userId}`);
    const auth = await googleSheets.authorizeSheets();
    const spreadsheetId = googleSheets.extractSpreadsheetId(tokenTrackerUrl);
    console.log(`[server.js]: 📊 Spreadsheet ID: ${spreadsheetId}`);
    
    // Get the actual sheet name to handle any spacing issues
    // Use Google Sheets API to find the sheet by title
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const loggedTrackerSheet = spreadsheet.data.sheets.find(sheet => 
      sheet.properties.title.trim().toLowerCase() === 'loggedtracker'
    );
    
    if (!loggedTrackerSheet) {
      console.warn(`[server.js]: ⚠️ Sheet 'loggedTracker' not found for user ${userId}`);
      return [];
    }
    
    const actualSheetName = loggedTrackerSheet.properties.title;
    const range = `${actualSheetName}!B7:F`;
    console.log(`[server.js]: 📊 Reading range: ${range}`);
    const sheetData = await googleSheets.readSheetData(auth, spreadsheetId, range);
    console.log(`[server.js]: 📊 Sheet data rows: ${sheetData?.length || 0}`);
    
    // Validate headers
    if (!sheetData || sheetData.length < 2) {
      console.log(`[server.js]: ⚠️ No data rows found (only ${sheetData?.length || 0} rows)`);
      return []; // No data rows
    }
    
    // Parse transactions from sheet data (skip header row)
    const transactions = [];
    let runningBalance = 0; // We'll need to calculate this
    
    // First pass: calculate balances
    sheetData.slice(1).forEach((row) => {
      if (row.length < 5) return;
      const amount = parseInt(row[4]);
      if (isNaN(amount)) return;
      
      if (row[3] === "earned") {
        runningBalance += amount;
      } else if (row[3] === "spent") {
        runningBalance -= Math.abs(amount);
      }
    });
    
    // Reset and create transactions with proper balances
    runningBalance = 0;
    sheetData.slice(1).forEach((row, idx) => {
      if (row.length < 5) return;
      const amount = parseInt(row[4]);
      if (isNaN(amount)) return;
      
      const type = row[3]?.toLowerCase();
      if (type !== 'earned' && type !== 'spent') return;
      
      const balanceBefore = runningBalance;
      if (type === "earned") {
        runningBalance += amount;
      } else {
        runningBalance -= Math.abs(amount);
      }
      
      transactions.push({
        _id: `sheet_${userId}_${idx}`, // Temporary ID for sheet transactions
        userId: userId,
        amount: type === 'earned' ? amount : -Math.abs(amount),
        type: type,
        category: row[2] || '',
        description: row[0] || '',
        link: row[1] || '',
        balanceBefore: balanceBefore,
        balanceAfter: runningBalance,
        timestamp: new Date(), // We don't have timestamp in sheet, use current
        dayKey: new Date().toISOString().split('T')[0],
        source: 'google_sheets' // Mark as from Google Sheets
      });
    });
    
    console.log(`[server.js]: ✅ Parsed ${transactions.length} transactions from Google Sheets`);
    if (transactions.length > 0) {
      console.log(`[server.js]: 📋 Sample transaction:`, {
        type: transactions[0].type,
        amount: transactions[0].amount,
        description: transactions[0].description,
        category: transactions[0].category
      });
    }
    
    // Return in reverse order (newest first)
    return transactions.reverse();
  } catch (error) {
    console.error(`[server.js]: Error reading token transactions from Google Sheets for user ${userId}:`, error);
    return []; // Return empty array on error
  }
}

// Get user's token transaction summary
app.get('/api/tokens/summary', async (req, res) => {
  try {
    // Check authentication
    if (!req.session?.user?.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.session.user.discordId;
    const user = await User.findOne({ discordId: userId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get summary from TokenTransaction model
    let dbSummary = { totalEarned: 0, totalSpent: 0, netTokens: 0, earnedCount: 0, spentCount: 0, totalTransactions: 0 };
    try {
      dbSummary = await TokenTransaction.getUserTransactionSummary(userId);
    } catch (error) {
      console.warn('[server.js]: Error getting token summary from database, using defaults:', error.message);
    }
    
    // Also read from Google Sheets if available
    let sheetTransactions = [];
    if (user.tokenTracker) {
      sheetTransactions = await readTransactionsFromGoogleSheets(userId, user.tokenTracker);
      
      // Calculate totals from Google Sheets
      const sheetEarned = sheetTransactions
        .filter(t => t.type === 'earned')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const sheetSpent = sheetTransactions
        .filter(t => t.type === 'spent')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      // Merge with database summary (prefer database for newer transactions)
      dbSummary.totalEarned = Math.max(dbSummary.totalEarned, sheetEarned);
      dbSummary.totalSpent = Math.max(dbSummary.totalSpent, sheetSpent);
      dbSummary.totalTransactions = dbSummary.totalTransactions + sheetTransactions.length;
      dbSummary.earnedCount += sheetTransactions.filter(t => t.type === 'earned').length;
      dbSummary.spentCount += sheetTransactions.filter(t => t.type === 'spent').length;
      dbSummary.netTokens = dbSummary.totalEarned - dbSummary.totalSpent;
    }
    
    res.json({
      success: true,
      currentBalance: user.tokens || 0,
      totalEarned: dbSummary.totalEarned,
      totalSpent: dbSummary.totalSpent,
      netTokens: dbSummary.netTokens,
      earnedCount: dbSummary.earnedCount,
      spentCount: dbSummary.spentCount,
      totalTransactions: dbSummary.totalTransactions,
      firstTransactionDate: dbSummary.firstTransactionDate,
      lastTransactionDate: dbSummary.lastTransactionDate,
      hasTokenTracker: !!user.tokenTracker
    });
  } catch (error) {
    console.error('[server.js]: Error fetching token summary:', error);
    res.status(500).json({ error: 'Failed to fetch token summary' });
  }
});

// Get user's token transactions
app.get('/api/tokens/transactions', async (req, res) => {
  try {
    // Check authentication
    if (!req.session?.user?.discordId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.session.user.discordId;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    const type = req.query.type; // 'earned', 'spent', or undefined (all)
    
    console.log(`[server.js]: 🔍 Fetching token transactions for user ${userId}`, {
      limit,
      skip,
      type: type || 'all'
    });
    
    const user = await User.findOne({ discordId: userId });
    if (!user) {
      console.warn(`[server.js]: ⚠️ User not found: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get transactions from database
    const query = { userId: userId };
    if (type && (type === 'earned' || type === 'spent')) {
      query.type = type;
    }
    
    let dbTransactions = [];
    let dbTotal = 0;
    try {
      dbTransactions = await TokenTransaction.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(skip)
        .lean();
      dbTotal = await TokenTransaction.countDocuments(query);
      logger.success(`Database transactions found: ${dbTransactions.length} (total: ${dbTotal})`, 'server.js');
    } catch (error) {
      logger.error('Error getting transactions from database', error, 'server.js');
    }
    
    // Also read from Google Sheets if available and we need more data
    let sheetTransactions = [];
    if (user.tokenTracker && (dbTransactions.length < limit || skip === 0)) {
      console.log(`[server.js]: 📊 Reading from Google Sheets tracker: ${user.tokenTracker ? 'yes' : 'no'}`);
      try {
        sheetTransactions = await readTransactionsFromGoogleSheets(userId, user.tokenTracker);
        console.log(`[server.js]: ✅ Google Sheets transactions found: ${sheetTransactions.length}`);
        
        // Filter by type if needed
        if (type && (type === 'earned' || type === 'spent')) {
          sheetTransactions = sheetTransactions.filter(t => t.type === type);
          console.log(`[server.js]: 📊 Filtered to ${type}: ${sheetTransactions.length} transactions`);
        }
        
        // Merge with database transactions
        // Create a map of database transaction IDs to avoid duplicates
        const dbTransactionMap = new Map();
        dbTransactions.forEach(t => {
          // Use a combination of description, amount, and type as key for deduplication
          const key = `${t.description}_${t.amount}_${t.type}_${t.timestamp?.toISOString()}`;
          dbTransactionMap.set(key, t);
        });
        
        // Add sheet transactions that don't duplicate database ones
        const mergedTransactions = [...dbTransactions];
        sheetTransactions.forEach(sheetTx => {
          const key = `${sheetTx.description}_${sheetTx.amount}_${sheetTx.type}_${sheetTx.timestamp?.toISOString()}`;
          if (!dbTransactionMap.has(key)) {
            mergedTransactions.push(sheetTx);
          }
        });
        
        // Sort by timestamp (newest first) and limit
        mergedTransactions.sort((a, b) => {
          const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return dateB - dateA;
        });
        
        const allTransactions = mergedTransactions.slice(skip, skip + limit);
        const totalTransactions = mergedTransactions.length;
        
        console.log(`[server.js]: ✅ Returning merged transactions: ${allTransactions.length} (total: ${totalTransactions})`);
        return res.json({
          success: true,
          transactions: allTransactions,
          total: totalTransactions,
          limit: limit,
          skip: skip,
          hasMore: (skip + limit) < totalTransactions,
          sources: {
            database: dbTransactions.length,
            googleSheets: sheetTransactions.length,
            total: totalTransactions
          }
        });
      } catch (sheetError) {
        console.error('[server.js]: ❌ Error reading from Google Sheets:', sheetError);
        // Continue with database transactions only
      }
    }
    
    // Return database transactions only
    console.log(`[server.js]: ✅ Returning database-only transactions: ${dbTransactions.length} (total: ${dbTotal})`);
    res.json({
      success: true,
      transactions: dbTransactions,
      total: dbTotal,
      limit: limit,
      skip: skip,
      hasMore: (skip + limit) < dbTotal,
      sources: {
        database: dbTransactions.length,
        googleSheets: 0,
        total: dbTotal
      }
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching token transactions:', error);
    res.status(500).json({ error: 'Failed to fetch token transactions', details: error.message });
  }
});

// Get user's vending transactions
// ------------------- Endpoint: Get Available Vending Stock Months -------------------
app.get('/api/vending/months', async (req, res) => {
  try {
    const VendingStock = getVendingStockModel();
    
    // Fetch all unique month/year combinations, sorted by most recent first
    const allStock = await VendingStock.find({})
      .select('month year createdAt')
      .sort({ createdAt: -1 })
      .lean();
    
    // Create unique month/year combinations
    const monthMap = new Map();
    allStock.forEach(stock => {
      const key = `${stock.month}-${stock.year || new Date(stock.createdAt).getFullYear()}`;
      if (!monthMap.has(key)) {
        monthMap.set(key, {
          month: stock.month,
          year: stock.year || new Date(stock.createdAt).getFullYear(),
          createdAt: stock.createdAt
        });
      }
    });
    
    // Convert to array and sort by year/month descending
    const months = Array.from(monthMap.values()).sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
    
    return res.json({ months });
  } catch (error) {
    console.error(`[server.js]: ❌ Error fetching available months:`, error);
    return res.status(500).json({ error: 'Failed to fetch available months', details: error.message });
  }
});

app.get('/api/vending/transactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    const status = req.query.status; // 'pending', 'completed', 'failed', 'expired', or undefined (all)
    const role = req.query.role; // 'buyer' or 'vendor' to filter by role
    
    logger.debug(`Fetching vending transactions for user ${req.user.discordId}`, {
      limit,
      skip,
      status: status || 'all',
      role: role || 'all'
    }, 'server.js');
    
    const user = await User.findOne({ discordId: req.user.discordId });
    if (!user) {
      console.warn(`[server.js]: ⚠️ User not found: ${req.user.discordId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's characters
    const userCharacters = await fetchCharactersByUserId(req.user.discordId);
    const characterNames = userCharacters.map(char => char.name);
    
    // Build query
    const query = {};
    
    // Filter by role (buyer or vendor)
    if (role === 'buyer') {
      query.userCharacterName = { $in: characterNames };
    } else if (role === 'vendor') {
      query.vendorCharacterName = { $in: characterNames };
    } else {
      // Get all transactions where user is either buyer or vendor
      query.$or = [
        { userCharacterName: { $in: characterNames } },
        { vendorCharacterName: { $in: characterNames } }
      ];
    }
    
    // Filter by status if provided
    if (status && ['pending', 'processing', 'completed', 'failed', 'expired'].includes(status)) {
      query.status = status;
    }
    
    // Get transactions from database
    let transactions = [];
    let total = 0;
    try {
      transactions = await VendingRequest.find(query)
        .sort({ date: -1 })
        .limit(limit)
        .skip(skip)
        .lean();
      total = await VendingRequest.countDocuments(query);
      logger.success(`Database transactions found: ${transactions.length} (total: ${total})`, 'server.js');
    } catch (error) {
      logger.error('Error getting transactions from database', error, 'server.js');
      return res.status(500).json({ error: 'Failed to fetch transactions from database', details: error.message });
    }
    
    // Format transactions with role information
    const formattedTransactions = transactions.map(tx => ({
      _id: tx._id,
      fulfillmentId: tx.fulfillmentId,
      userCharacterName: tx.userCharacterName,
      vendorCharacterName: tx.vendorCharacterName,
      itemName: tx.itemName,
      quantity: tx.quantity,
      paymentMethod: tx.paymentMethod,
      offeredItem: tx.offeredItem,
      offeredItems: tx.offeredItems || [],
      offeredItemsWithQty: tx.offeredItemsWithQty || [],
      artLink: tx.artLink,
      notes: tx.notes || '',
      buyerId: tx.buyerId,
      buyerUsername: tx.buyerUsername,
      date: tx.date,
      processedAt: tx.processedAt,
      status: tx.status || 'pending',
      expiresAt: tx.expiresAt,
      transactionType: tx.transactionType || 'purchase',
      pointsSpent: tx.pointsSpent,
      sourceInventory: tx.sourceInventory,
      // Determine user's role in this transaction
      userRole: characterNames.includes(tx.userCharacterName) ? 'buyer' : 'vendor',
      otherParty: characterNames.includes(tx.userCharacterName) ? tx.vendorCharacterName : tx.userCharacterName
    }));
    
    res.json({
      success: true,
      transactions: formattedTransactions,
      total: total,
      limit: limit,
      skip: skip,
      hasMore: (skip + limit) < total
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching vending transactions:', error);
    res.status(500).json({ error: 'Failed to fetch vending transactions', details: error.message });
  }
});

// Get global token statistics (admin only)
app.get('/api/tokens/global-stats', async (req, res) => {
  try {
    // Check if user is admin
    const guildId = process.env.PROD_GUILD_ID;
    let isAdmin = false;
    
    if (guildId) {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        const roles = memberData.roles || [];
        const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
        isAdmin = ADMIN_ROLE_ID && roles.includes(ADMIN_ROLE_ID);
      }
    }
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const stats = await TokenTransaction.getGlobalTokenStats();
    
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('[server.js]: Error fetching global token stats:', error);
    res.status(500).json({ error: 'Failed to fetch global token stats' });
  }
});

// ------------------- Endpoint: Blupee Leaderboard -------------------
app.get('/api/levels/blupee-leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const limitCapped = Math.min(Math.max(limit, 5), 50); // Between 5 and 50
    
    const topBlupeeHunters = await User.find({ 'blupeeHunt.totalClaimed': { $gt: 0 } })
      .sort({ 'blupeeHunt.totalClaimed': -1 })
      .limit(limitCapped)
      .select('discordId username discriminator avatar nickname blupeeHunt')
      .lean();
    
    // Format the response
    const leaderboard = topBlupeeHunters.map((user, index) => ({
      rank: index + 1,
      discordId: user.discordId,
      username: user.username || 'Unknown',
      discriminator: user.discriminator || '0000',
      nickname: user.nickname,
      avatar: user.avatar,
      totalBlupeesCaught: user.blupeeHunt?.totalClaimed || 0,
      lastClaimed: user.blupeeHunt?.lastClaimed || null
    }));
    
    res.json({
      success: true,
      leaderboard: leaderboard,
      total: leaderboard.length
    });
  } catch (error) {
    console.error('[server.js]: Error fetching blupee leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch blupee leaderboard' });
  }
});

// Get individual user level details
app.get('/api/levels/user/:discordId', async (req, res) => {
  try {
    const { discordId } = req.params;
    
    const user = await User.findOne({ discordId: discordId })
      .select('discordId username discriminator avatar leveling nickname')
      .lean();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const leveling = user.leveling || {
      xp: 0,
      level: 1,
      lastMessageTime: null,
      totalMessages: 0
    };
    
    // Calculate progress to next level using cumulative XP
    const currentLevel = leveling.level;
    const totalXP = leveling.xp;
    
    // Helper function to get XP required for a specific level
    const getXPForLevel = (level) => {
      if (level < 1) return 0;
      return Math.floor(5 * Math.pow(level, 2) + 50 * level + 100);
    };
    
    // Calculate cumulative XP needed to reach current level
    let cumulativeXPForCurrentLevel = 0;
    for (let i = 2; i <= currentLevel; i++) {
      cumulativeXPForCurrentLevel += getXPForLevel(i);
    }
    
    // XP needed for next level
    const xpNeededForNextLevel = getXPForLevel(currentLevel + 1);
    
    // Progress within current level
    const progressXP = totalXP - cumulativeXPForCurrentLevel;
    const clampedProgress = Math.max(0, Math.min(progressXP, xpNeededForNextLevel));
    const percentage = Math.min(100, Math.max(0, Math.round((clampedProgress / xpNeededForNextLevel) * 100)));
    
    // Get rank (position on leaderboard)
    const higherRankedUsers = await User.countDocuments({
      $or: [
        { 'leveling.level': { $gt: leveling.level } },
        { 
          'leveling.level': leveling.level,
          'leveling.xp': { $gt: leveling.xp }
        }
      ]
    });
    const rank = higherRankedUsers + 1;
    
    res.json({
      success: true,
      discordId: user.discordId,
      username: user.username || 'Unknown',
      nickname: user.nickname || '',
      discriminator: user.discriminator || '0000',
      avatar: user.avatar,
      level: leveling.level,
      xp: leveling.xp,
      totalMessages: leveling.totalMessages,
      rank: rank,
      progress: {
        current: clampedProgress,
        needed: xpNeededForNextLevel,
        percentage: percentage
      }
    });
  } catch (error) {
    console.error('[server.js]: Error fetching user level details:', error);
    res.status(500).json({ error: 'Failed to fetch user level details' });
  }
});

// Get exchange status and perform exchange
app.post('/api/user/levels/exchange', async (req, res) => {
  try {
    const user = await User.findOne({ discordId: req.user.discordId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Perform the exchange
    const exchangeResult = await user.exchangeLevelsForTokens();
    
    if (!exchangeResult.success) {
      return res.json(exchangeResult);
    }
    
    // Update token balance
    user.tokens = (user.tokens || 0) + exchangeResult.tokensReceived;
    await user.save();
    
    res.json({
      ...exchangeResult,
      newTokenBalance: user.tokens
    });
  } catch (error) {
    console.error('[server.js]: Error performing level exchange:', error);
    res.status(500).json({ error: 'Failed to perform level exchange' });
  }
});

// Get exchange status only (no exchange)
app.get('/api/user/levels/exchange-status', async (req, res) => {
  try {
    const user = await User.findOne({ discordId: req.user.discordId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const exchangeInfo = user.getExchangeableLevels();
    
    res.json({
      success: true,
      ...exchangeInfo,
      currentTokenBalance: user.tokens || 0,
      totalLevelsExchanged: user.leveling?.totalLevelsExchanged || 0
    });
  } catch (error) {
    console.error('[server.js]: Error fetching exchange status:', error);
    res.status(500).json({ error: 'Failed to fetch exchange status' });
  }
});

// ------------------- Section: Village Shops Management API -------------------

// ------------------- Endpoint: Get village shop items for restocking -------------------
app.get('/api/village-shops/:village', async (req, res) => {
  try {
    const { village } = req.params;
    const normalizedVillage = village.toLowerCase().trim();

    // Get current vending stock list
    const stockData = await getCurrentVendingStockList();
    
    if (!stockData || !stockData.stockList) {
      return res.json({
        success: true,
        items: [],
        message: 'No vending stock available for this month'
      });
    }

    // Get items for the specific village
    const villageItems = stockData.stockList[normalizedVillage] || [];
    
    // Get limited items (available to all villages)
    const limitedItems = await getLimitedItems();

    res.json({
      success: true,
      items: villageItems.map(item => ({
        itemName: item.itemName,
        costEach: item.points || item.costEach || 0, // Use 'points' field from stock
        vendingType: item.vendingType || null, // Merchant or Shopkeeper
        itemId: item.itemId?.toString() || null,
        emoji: item.emoji || null
      })),
      limitedItems: (limitedItems || []).map(item => ({
        itemName: item.itemName,
        costEach: item.points || 0,
        vendingType: 'Limited',
        stock: item.stock || 0,
        itemId: item.itemId?.toString() || null,
        emoji: item.emoji || null
      })),
      village: normalizedVillage,
      month: stockData.month
    });
  } catch (error) {
    console.error('[server.js]: Error fetching village shop items:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch village shop items',
      details: error.message 
    });
  }
});

// ------------------- Endpoint: Get all village shop items -------------------
app.get('/api/admin/village-shops', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 20, search = '', category = '', village = '' } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (category) {
      query.category = { $in: [category] };
    }
    
    if (village) {
      // Note: Village is not directly stored in VillageShops, but we can filter by itemName patterns
      // This is a simplified approach - you might want to add a village field to the schema
      query.itemName = { $regex: village, $options: 'i' };
    }

    const [items, total] = await Promise.all([
      VillageShops.find(query)
        .populate('itemId', 'itemName image')
        .sort({ itemName: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      VillageShops.countDocuments(query)
    ]);

    res.json({
      items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[server.js]: Error fetching village shop items:', error);
    res.status(500).json({ error: 'Failed to fetch village shop items' });
  }
});

// ------------------- Endpoint: Get single village shop item -------------------
app.get('/api/admin/village-shops/:id', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const item = await VillageShops.findById(req.params.id).populate('itemId', 'itemName image');
    
    if (!item) {
      return res.status(404).json({ error: 'Village shop item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('[server.js]: Error fetching village shop item:', error);
    res.status(500).json({ error: 'Failed to fetch village shop item' });
  }
});

// ------------------- Endpoint: Create new village shop item -------------------
app.post('/api/admin/village-shops', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Find the item by name to get the itemId
    const item = await Item.findOne({ itemName: req.body.itemName });
    if (!item) {
      return res.status(400).json({ error: 'Item not found. Please ensure the item exists in the database.' });
    }

    const shopItemData = {
      ...req.body,
      itemId: item._id,
      // Copy relevant fields from the base item
      category: item.category || ['Misc'],
      type: item.type || ['Unknown'],
      subtype: item.subtype || ['None'],
      buyPrice: item.buyPrice || 0,
      sellPrice: item.sellPrice || 0,
      itemRarity: item.itemRarity || 1,
      emoji: item.emoji || '',
      image: item.image || 'No Image',
      imageType: item.imageType || 'No Image Type'
    };

    const shopItem = new VillageShops(shopItemData);
    await shopItem.save();

    console.log(`[server.js]: ✅ Admin ${req.user.username} created village shop item:`, shopItem._id);
    
    res.status(201).json({
      success: true,
      item: shopItem
    });
  } catch (error) {
    console.error('[server.js]: Error creating village shop item:', error);
    res.status(500).json({ 
      error: 'Failed to create village shop item',
      details: error.message,
      validationErrors: error.errors 
    });
  }
});

// ------------------- Endpoint: Update village shop item -------------------
app.put('/api/admin/village-shops/:id', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const updateData = { ...req.body };
    
    // Ensure array fields are properly formatted
    if (updateData.category && !Array.isArray(updateData.category)) {
      updateData.category = [updateData.category];
    }
    if (updateData.type && !Array.isArray(updateData.type)) {
      updateData.type = [updateData.type];
    }
    if (updateData.subtype && !Array.isArray(updateData.subtype)) {
      updateData.subtype = [updateData.subtype];
    }

    const item = await VillageShops.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({ error: 'Village shop item not found' });
    }

    console.log(`[server.js]: ✅ Admin ${req.user.username} updated village shop item:`, item._id);
    
    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('[server.js]: Error updating village shop item:', error);
    res.status(500).json({ 
      error: 'Failed to update village shop item',
      details: error.message,
      validationErrors: error.errors 
    });
  }
});

// ------------------- Endpoint: Delete village shop item -------------------
app.delete('/api/admin/village-shops/:id', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const item = await VillageShops.findByIdAndDelete(req.params.id);
    
    if (!item) {
      return res.status(404).json({ error: 'Village shop item not found' });
    }

    console.log(`[server.js]: ✅ Admin ${req.user.username} deleted village shop item:`, item._id);
    
    res.json({
      success: true,
      message: 'Village shop item deleted successfully'
    });
  } catch (error) {
    console.error('[server.js]: Error deleting village shop item:', error);
    res.status(500).json({ error: 'Failed to delete village shop item' });
  }
});

// ------------------- Section: Admin Database Editor -------------------

// ------------------- Import AuditLog model for audit logging -------------------
const AuditLog = require('../shared/models/AuditLogModel');

// ------------------- Import all remaining models for database management -------------------
const ApprovedSubmission = require('../shared/models/ApprovedSubmissionModel');
const BloodMoonTracking = require('../shared/models/BloodMoonTrackingModel');
const GeneralItem = require('../shared/models/GeneralItemModel');
const HelpWantedQuest = require('../shared/models/HelpWantedQuestModel');
const Inventory = require('../shared/models/InventoryModel');
const MemberLore = require('../shared/models/MemberLoreModel');
const Minigame = require('../shared/models/MinigameModel');
const NPC = require('../shared/models/NPCModel');
const RuuGame = require('../shared/models/RuuGameModel');
const TableModel = require('../shared/models/TableModel');
const TableRoll = require('../shared/models/TableRollModel');
const TempData = require('../shared/models/TempDataModel');
const TokenTransaction = require('../shared/models/TokenTransactionModel');
// Note: Raid, StealStats, and BlightRollHistory are imported at the top of the file

// ------------------- Model Registry -------------------
// Maps model names to their Mongoose models
const MODEL_REGISTRY = {
  'ApprovedSubmission': ApprovedSubmission,
  'BlightRollHistory': BlightRollHistory,
  'BloodMoonTracking': BloodMoonTracking,
  'Character': Character,
  'CharacterOfWeek': CharacterOfWeek,
  'GeneralItem': GeneralItem,
  'HelpWantedQuest': HelpWantedQuest,
  'Inventory': Inventory,
  'Item': Item,
  'MemberLore': MemberLore,
  'Minigame': Minigame,
  'ModCharacter': ModCharacter,
  'Monster': Monster,
  'Mount': Mount,
  'NPC': NPC,
  'Party': Party,
  'Pet': Pet,
  'Quest': Quest,
  'Raid': Raid,
  'Relationship': Relationship,
  'Relic': Relic,
  'RuuGame': RuuGame,
  'StealStats': StealStats,
  'TableModel': TableModel,
  'TableRoll': TableRoll,
  'TempData': TempData,
  'TokenTransaction': TokenTransaction,
  'User': User,
  'VendingRequest': VendingRequest,
  'Village': Village,
  'VillageShops': VillageShops,
  'Weather': Weather
};

// ------------------- Helper: Get Model with Special Handling -------------------
// Helper function to get the appropriate model, handling special cases like Inventory
const getModelForAdmin = (modelName) => {
  if (modelName === 'Inventory') {
    // Inventory uses a separate database connection
    if (!inventoriesConnection) {
      throw new Error('Inventories database connection not available');
    }
    
    // Check if the model already exists to avoid "Cannot overwrite model" error
    if (inventoriesConnection.models['Inventory']) {
      return inventoriesConnection.models['Inventory'];
    }
    
    // Create the model dynamically using the inventories connection
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
      craftedAt: { type: Date },
      gatheredAt: { type: Date },
      obtain: { type: String, default: '' },
      synced: { type: String, unique: true }
    });
    
    return inventoriesConnection.model('Inventory', inventorySchema);
  }
  
  // For all other models, return from registry
  return MODEL_REGISTRY[modelName];
};

// ------------------- Helper: Validate Record Data -------------------
// Comprehensive validation for record data before create/update
//
async function validateRecordData(modelName, recordData, schema, isUpdate = false) {
  const errors = {};
  const fieldErrors = {};
  
  // Fields to exclude from required validation (handled specially)
  const excludedFromRequired = ['pronouns', 'race', 'homeVillage', 'job', 'jobVoucher'];
  
  // Iterate through schema paths
  schema.eachPath((pathname, schematype) => {
    // Skip internal mongoose fields
    if (pathname === '_id' || pathname === '__v') return;
    
    const value = recordData[pathname];
    const isRequired = schematype.isRequired;
    const hasValue = value !== null && value !== undefined && value !== '';
    const hasDefault = schematype.defaultValue !== undefined;
    
    // Check required fields (unless excluded or has default)
    if (isRequired && !hasValue && !hasDefault && !excludedFromRequired.includes(pathname)) {
      if (!isUpdate || (isUpdate && hasValue === false)) {
        fieldErrors[pathname] = `${pathname} is required`;
        return;
      }
    }
    
    // Skip validation if field is not provided in update
    if (isUpdate && !hasValue && !isRequired) {
      return;
    }
    
    // Skip validation if value is empty and field is optional
    if (!hasValue && !isRequired) {
      return;
    }
    
    // Validate based on type
    const instanceType = schematype.instance;
    const enumValues = schematype.enumValues;
    
    // Validate enum values
    if (enumValues && enumValues.length > 0 && hasValue) {
      if (!enumValues.includes(value)) {
        fieldErrors[pathname] = `${pathname} must be one of: ${enumValues.join(', ')}`;
        return;
      }
    }
    
    // Validate by type
    switch (instanceType) {
      case 'String':
        if (hasValue && typeof value !== 'string') {
          fieldErrors[pathname] = `${pathname} must be a string`;
        } else if (hasValue && typeof value === 'string') {
          // Check minlength/maxlength if specified in schema options
          const options = schematype.options || {};
          if (options.minlength !== undefined && value.length < options.minlength) {
            fieldErrors[pathname] = `${pathname} must be at least ${options.minlength} characters`;
          }
          if (options.maxlength !== undefined && value.length > options.maxlength) {
            fieldErrors[pathname] = `${pathname} must be no more than ${options.maxlength} characters`;
          }
        }
        break;
        
      case 'Number':
        if (hasValue && (typeof value !== 'number' || isNaN(value))) {
          fieldErrors[pathname] = `${pathname} must be a valid number`;
        } else if (hasValue && typeof value === 'number') {
          // Check min/max if specified in schema options
          const options = schematype.options || {};
          if (options.min !== undefined && value < options.min) {
            fieldErrors[pathname] = `${pathname} must be at least ${options.min}`;
          }
          if (options.max !== undefined && value > options.max) {
            fieldErrors[pathname] = `${pathname} must be no more than ${options.max}`;
          }
        }
        break;
        
      case 'Boolean':
        if (hasValue && typeof value !== 'boolean') {
          // Try to coerce string booleans
          if (value === 'true' || value === 'false') {
            // Will be handled by mongoose
          } else {
            fieldErrors[pathname] = `${pathname} must be a boolean`;
          }
        }
        break;
        
      case 'Date':
        if (hasValue) {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            fieldErrors[pathname] = `${pathname} must be a valid date`;
          }
        }
        break;
        
      case 'ObjectID':
        if (hasValue) {
          if (!mongoose.Types.ObjectId.isValid(value)) {
            fieldErrors[pathname] = `${pathname} must be a valid ObjectId`;
          }
        }
        break;
        
      case 'Array':
        if (hasValue && !Array.isArray(value)) {
          fieldErrors[pathname] = `${pathname} must be an array`;
        }
        break;
        
      case 'Map':
      case 'Object':
        // These types require objects
        if (hasValue && typeof value !== 'object' || Array.isArray(value)) {
          fieldErrors[pathname] = `${pathname} must be an object`;
        }
        break;
        
      case 'Mixed':
        // Mixed type accepts any value (number, string, boolean, object, array, null)
        // No validation needed - it's intentionally flexible
        break;
    }
  });
  
  // Return validation result
  if (Object.keys(fieldErrors).length > 0) {
    errors.fieldErrors = fieldErrors;
    errors.hasErrors = true;
  } else {
    errors.hasErrors = false;
  }
  
  return errors;
}

// ------------------- Helper: Validate References -------------------
// Validate that ObjectId references point to existing records
//
async function validateReferences(modelName, recordData, schema) {
  const errors = {};
  const fieldErrors = {};
  const validationPromises = [];
  
  // Iterate through schema paths to find reference fields
  schema.eachPath((pathname, schematype) => {
    if (pathname === '_id' || pathname === '__v') return;
    
    const value = recordData[pathname];
    const hasValue = value !== null && value !== undefined && value !== '';
    
    // Check if this field has a ref (reference to another model)
    const refModelName = schematype.options?.ref;
    if (refModelName && hasValue) {
      // Handle array of references
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (item && mongoose.Types.ObjectId.isValid(item)) {
            const refModel = MODEL_REGISTRY[refModelName];
            if (refModel) {
              validationPromises.push(
                refModel.findById(item).lean().then(found => {
                  if (!found) {
                    fieldErrors[`${pathname}[${index}]`] = `Referenced ${refModelName} with ID ${item} does not exist`;
                  }
                }).catch(() => {
                  fieldErrors[`${pathname}[${index}]`] = `Invalid ${refModelName} reference: ${item}`;
                })
              );
            }
          }
        });
      } else if (mongoose.Types.ObjectId.isValid(value)) {
        // Single reference
        const refModel = MODEL_REGISTRY[refModelName];
        if (refModel) {
          validationPromises.push(
            refModel.findById(value).lean().then(found => {
              if (!found) {
                fieldErrors[pathname] = `Referenced ${refModelName} with ID ${value} does not exist`;
              }
            }).catch(() => {
              fieldErrors[pathname] = `Invalid ${refModelName} reference: ${value}`;
            })
          );
        }
      }
    }
  });
  
  // Wait for all reference validations to complete
  await Promise.all(validationPromises);
  
  if (Object.keys(fieldErrors).length > 0) {
    errors.fieldErrors = fieldErrors;
    errors.hasErrors = true;
  } else {
    errors.hasErrors = false;
  }
  
  return errors;
}

// ------------------- Helper: Log Admin Action -------------------
// Log admin actions to audit trail
//
async function logAdminAction(req, action, modelName, recordId, changes, recordName = null) {
  try {
    const user = req.user || req.session?.user;
    if (!user) {
      console.warn('[server.js]: ⚠️ Cannot log admin action: no user in request');
      return;
    }
    
    // Get the user's Discord ID
    const discordId = user.discordId || user.id;
    if (!discordId) {
      console.warn('[server.js]: ⚠️ Cannot log admin action: no discordId in user object');
      return;
    }
    
    // Get or create the user in database to ensure we have a MongoDB _id
    let dbUser = null;
    try {
      dbUser = await getOrCreateUser(discordId, user.username || user.global_name || 'Unknown');
      if (!dbUser || !dbUser._id) {
        console.warn('[server.js]: ⚠️ Could not get or create user for audit log');
        return;
      }
    } catch (dbError) {
      console.warn('[server.js]: ⚠️ Could not get or create user for audit log:', dbError.message);
      return;
    }
    
    const ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    const auditLog = new AuditLog({
      adminUserId: dbUser._id,
      adminUsername: user.username || user.global_name || dbUser.username || 'unknown',
      adminDiscordId: discordId,
      action: action,
      modelName: modelName,
      recordId: recordId,
      recordName: recordName,
      changes: changes,
      ipAddress: ipAddress,
      userAgent: userAgent,
      timestamp: new Date()
    });
    
    await auditLog.save();
    console.log(`[server.js]: 📝 Audit log created for ${action} on ${modelName}/${recordId} by ${user.username || user.global_name || discordId}`);
  } catch (error) {
    // Don't fail the request if audit logging fails, but log the error
    console.error('[server.js]: ❌ Error creating audit log:', error);
  }
}

// ------------------- Helper: Get Record Name/Identifier -------------------
// Get a human-readable identifier for a record (for audit logs)
//
function getRecordIdentifier(record, modelName) {
  // Try common identifier fields
  const identifierFields = ['name', 'title', 'username', 'itemName', 'characterName'];
  
  for (const field of identifierFields) {
    if (record[field]) {
      return String(record[field]);
    }
  }
  
  // Fallback to ID
  return record._id ? String(record._id) : null;
}

// ------------------- Endpoint: Get all available models -------------------
app.get('/api/admin/db/models', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const models = Object.keys(MODEL_REGISTRY).sort();
    res.json({ models });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// ------------------- Endpoint: Get audit logs -------------------
// IMPORTANT: This route must come BEFORE /api/admin/db/:modelName to avoid route conflicts
app.get('/api/admin/db/audit-logs', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ 
        error: 'Admin access required',
        code: 'PERMISSION_ERROR'
      });
    }
    
    const {
      adminUserId,
      adminUsername,
      modelName,
      action,
      recordId,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const filters = {
      adminUserId,
      adminUsername,
      modelName,
      action,
      recordId,
      startDate,
      endDate,
      limit: parseInt(limit),
      skip
    };
    
    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === '') {
        delete filters[key];
      }
    });
    
    const logs = await AuditLog.getAuditLogs(filters);
    
    // Get total count for pagination
    const countQuery = {};
    if (adminUserId) countQuery.adminUserId = adminUserId;
    if (adminUsername) countQuery.adminUsername = { $regex: adminUsername, $options: 'i' };
    if (modelName) countQuery.modelName = modelName;
    if (action) countQuery.action = action;
    if (recordId) countQuery.recordId = recordId;
    if (startDate || endDate) {
      countQuery.timestamp = {};
      if (startDate) countQuery.timestamp.$gte = new Date(startDate);
      if (endDate) countQuery.timestamp.$lte = new Date(endDate);
    }
    
    const total = await AuditLog.countDocuments(countQuery);
    
    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching audit logs:', error);
    res.status(500).json({
      error: 'Failed to fetch audit logs',
      code: 'SERVER_ERROR',
      details: error.message
    });
  }
});

// ------------------- Endpoint: Get model schema -------------------
app.get('/api/admin/db/schema/:modelName', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { modelName } = req.params;
    const Model = getModelForAdmin(modelName);
    
    if (!Model) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    // Extract schema information
    const schema = Model.schema;
    const fields = {};
    
    schema.eachPath((pathname, schematype) => {
      // Skip internal mongoose fields
      if (pathname === '_id' || pathname === '__v') return;
      
      fields[pathname] = {
        type: schematype.instance,
        required: schematype.isRequired || false,
        default: schematype.defaultValue,
        enum: schematype.enumValues,
        ref: schematype.options?.ref,
        isArray: Array.isArray(schematype.options?.type)
      };
    });
    
    res.json({ 
      modelName,
      fields 
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching schema:', error);
    res.status(500).json({ error: 'Failed to fetch schema', details: error.message });
  }
});

// ------------------- Endpoint: List records (with pagination) -------------------
app.get('/api/admin/db/:modelName', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { modelName } = req.params;
    const { page = 1, limit = 50, search = '', sortBy = '_id', sortOrder = 'desc' } = req.query;
    
    const Model = getModelForAdmin(modelName);
    
    if (!Model) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    // Special handling for Inventory: return characters grouped by inventory
    if (modelName === 'Inventory') {
      console.log('[server.js]: 🎒 Loading Inventory - fetching characters with inventory collections');
      
      // Get the inventories database connection
      const inventoriesDb = await connectToInventoriesNative();
      
      // List all collections in the inventories database
      const collections = await inventoriesDb.listCollections().toArray();
      const collectionNames = collections
        .map(col => col.name)
        .filter(name => !name.startsWith('system.') && name !== 'items' && name !== 'vending_stock');
      
      console.log('[server.js]: Found', collectionNames.length, 'inventory collections');
      
      // Find matching characters
      const allCharacters = await fetchAllCharacters();
      const charactersWithInventory = allCharacters.filter(char => {
        const collectionName = char.name ? char.name.trim().toLowerCase() : '';
        return collectionNames.includes(collectionName);
      });
      
      console.log('[server.js]: Found', charactersWithInventory.length, 'characters with inventory');
      
      // Apply search filter
      let filteredCharacters = charactersWithInventory;
      if (search) {
        filteredCharacters = charactersWithInventory.filter(char => 
          char.name && char.name.toLowerCase().includes(search.toLowerCase())
        );
      }
      
      // Sort by character name
      filteredCharacters.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      // Apply pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const paginatedCharacters = filteredCharacters.slice(skip, skip + parseInt(limit));
      
      // Get item counts for each character
      const records = await Promise.all(paginatedCharacters.map(async (char) => {
        const collectionName = char.name.trim().toLowerCase();
        try {
          const collection = inventoriesDb.collection(collectionName);
          const itemCount = await collection.countDocuments();
          return {
            _id: char._id,
            characterName: char.name,
            characterId: char._id,
            itemCount: itemCount,
            icon: char.icon
          };
        } catch (err) {
          console.error(`[server.js]: Error counting items for ${char.name}:`, err);
          return {
            _id: char._id,
            characterName: char.name,
            characterId: char._id,
            itemCount: 0,
            icon: char.icon
          };
        }
      }));
      
      console.log('[server.js]: ✅ Returning', records.length, 'character inventories');
      
      return res.json({
        records,
        pagination: {
          total: filteredCharacters.length,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(filteredCharacters.length / parseInt(limit))
        }
      });
    }
    
    // Build search query for non-Inventory models
    let query = {};
    if (search) {
      // Try to search across common text fields for other models
      const textFields = ['name', 'title', 'itemName', 'description', 'username', 'discordId'];
      const orConditions = [];
      
      for (const field of textFields) {
        if (Model.schema.path(field)) {
          orConditions.push({ [field]: { $regex: search, $options: 'i' } });
        }
      }
      
      if (orConditions.length > 0) {
        query = { $or: orConditions };
      }
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    
    // Fetch records
    const records = await Model.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await Model.countDocuments(query);
    
    res.json({
      records,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching records:', error);
    res.status(500).json({ error: 'Failed to fetch records', details: error.message });
  }
});

// ------------------- Endpoint: Get single record by ID -------------------
app.get('/api/admin/db/:modelName/:id', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { modelName, id } = req.params;
    const Model = getModelForAdmin(modelName);
    
    if (!Model) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    // Special handling for Inventory: return all items for the character
    if (modelName === 'Inventory') {
      // id is actually a characterId - find the character
      const character = await fetchCharacterById(id);
      
      if (!character) {
        return res.status(404).json({ error: 'Character not found' });
      }
      
      // Get the character's inventory collection
      const collectionName = character.name.trim().toLowerCase();
      const inventoriesDb = await connectToInventoriesNative();
      const inventoryCollection = inventoriesDb.collection(collectionName);
      
      // Get all items from the character's collection
      const inventoryItems = await inventoryCollection.find().sort({ itemName: 1 }).toArray();
      
      console.log(`[server.js]: Found ${inventoryItems.length} items for ${character.name}`);
      
      // Return character info with their inventory items
      return res.json({ 
        record: {
          _id: character._id,
          characterId: character._id,
          characterName: character.name,
          icon: character.icon,
          items: inventoryItems
        }
      });
    }
    
    const record = await Model.findById(id).lean();
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    res.json({ record });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching record:', error);
    res.status(500).json({ error: 'Failed to fetch record', details: error.message });
  }
});

// ------------------- Endpoint: Create new record -------------------
app.post('/api/admin/db/:modelName', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ 
        error: 'Admin access required',
        code: 'PERMISSION_ERROR'
      });
    }
    
    const { modelName } = req.params;
    const Model = getModelForAdmin(modelName);
    
    if (!Model) {
      return res.status(404).json({ 
        error: 'Model not found',
        code: 'MODEL_NOT_FOUND'
      });
    }
    
    const schema = Model.schema;
    
    // Validate record data
    const validationErrors = await validateRecordData(modelName, req.body, schema, false);
    if (validationErrors.hasErrors) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: 'One or more fields failed validation',
        fieldErrors: validationErrors.fieldErrors
      });
    }
    
    // Validate references
    const referenceErrors = await validateReferences(modelName, req.body, schema);
    if (referenceErrors.hasErrors) {
      return res.status(400).json({
        error: 'Reference validation failed',
        code: 'REFERENCE_ERROR',
        details: 'One or more referenced records do not exist',
        fieldErrors: referenceErrors.fieldErrors
      });
    }
    
    const record = new Model(req.body);
    await record.save();
    
    const recordObj = record.toObject();
    const recordName = getRecordIdentifier(recordObj, modelName);
    
    // Log audit action
    await logAdminAction(req, 'CREATE', modelName, record._id, recordObj, recordName);
    
    console.log(`[server.js]: ✅ Admin ${req.user.username} created ${modelName} record:`, record._id);
    
    res.status(201).json({ 
      success: true,
      record: recordObj
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error creating record:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const fieldErrors = {};
      Object.keys(error.errors || {}).forEach(key => {
        fieldErrors[key] = error.errors[key].message;
      });
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.message,
        fieldErrors
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create record', 
      code: 'SERVER_ERROR',
      details: error.message
    });
  }
});

// ------------------- Endpoint: Update record -------------------
app.put('/api/admin/db/:modelName/:id', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ 
        error: 'Admin access required',
        code: 'PERMISSION_ERROR'
      });
    }
    
    const { modelName, id } = req.params;
    const Model = getModelForAdmin(modelName);
    
    if (!Model) {
      return res.status(404).json({ 
        error: 'Model not found',
        code: 'MODEL_NOT_FOUND'
      });
    }
    
    // Log what we're updating
    const user = req.user || req.session?.user;
    const username = user?.username || 'unknown';
    console.log(`[server.js]: 📝 Admin ${username} updating ${modelName} record:`, id);
    console.log(`[server.js]: 📝 Update payload:`, JSON.stringify(req.body, null, 2));
    
    // Find the record first
    const record = await Model.findById(id);
    
    if (!record) {
      return res.status(404).json({ 
        error: 'Record not found',
        code: 'RECORD_NOT_FOUND'
      });
    }
    
    // Store before state for audit log
    const beforeState = record.toObject();
    const recordName = getRecordIdentifier(beforeState, modelName);
    
    // For Character model, handle currentVillage specially to prevent default function from overriding
    if (modelName === 'Character' && req.body.currentVillage !== undefined) {
      // If currentVillage is explicitly provided (even if empty string), ensure it's saved
      // Convert empty string to null to allow clearing the field
      if (req.body.currentVillage === '') {
        req.body.currentVillage = null;
      }
    }
    
    const schema = Model.schema;
    
    // Prepare update data (only fields that are being updated)
    const updateData = {};
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== '__v') {
        updateData[key] = req.body[key];
      }
    });
    
    // Validate update data
    const validationErrors = await validateRecordData(modelName, updateData, schema, true);
    if (validationErrors.hasErrors) {
      console.log('[server.js]: ❌ Validation failed for', modelName, ':', validationErrors.fieldErrors);
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: 'One or more fields failed validation',
        fieldErrors: validationErrors.fieldErrors
      });
    }
    
    // Validate references in update data
    const referenceErrors = await validateReferences(modelName, updateData, schema);
    if (referenceErrors.hasErrors) {
      return res.status(400).json({
        error: 'Reference validation failed',
        code: 'REFERENCE_ERROR',
        details: 'One or more referenced records do not exist',
        fieldErrors: referenceErrors.fieldErrors
      });
    }
    
    // Update all provided fields
    Object.keys(updateData).forEach(key => {
      record.set(key, updateData[key]);
    });
    
    // Explicitly save the record to ensure it's persisted
    await record.save();
    
    // Get after state for audit log
    const afterState = record.toObject();
    const changes = {
      before: beforeState,
      after: afterState
    };
    
    // Log audit action
    await logAdminAction(req, 'UPDATE', modelName, id, changes, recordName);
    
    console.log(`[server.js]: ✅ Successfully updated ${modelName} record:`, id);
    if (modelName === 'Character' && req.body.currentVillage !== undefined) {
      console.log(`[server.js]: Updated currentVillage to:`, record.currentVillage);
    }
    
    // Return the updated record
    const updatedRecord = await Model.findById(id).lean();
    
    res.json({ 
      success: true,
      record: updatedRecord 
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error updating record:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const fieldErrors = {};
      Object.keys(error.errors || {}).forEach(key => {
        fieldErrors[key] = error.errors[key].message;
      });
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.message,
        fieldErrors
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update record', 
      code: 'SERVER_ERROR',
      details: error.message
    });
  }
});

// ------------------- Endpoint: Delete record -------------------
app.delete('/api/admin/db/:modelName/:id', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ 
        error: 'Admin access required',
        code: 'PERMISSION_ERROR'
      });
    }
    
    const { modelName, id } = req.params;
    const Model = getModelForAdmin(modelName);
    
    if (!Model) {
      return res.status(404).json({ 
        error: 'Model not found',
        code: 'MODEL_NOT_FOUND'
      });
    }
    
    // Get record before deleting for audit log
    const record = await Model.findById(id).lean();
    
    if (!record) {
      return res.status(404).json({ 
        error: 'Record not found',
        code: 'RECORD_NOT_FOUND'
      });
    }
    
    const recordName = getRecordIdentifier(record, modelName);
    
    // Delete the record
    await Model.findByIdAndDelete(id);
    
    // Log audit action (log the deleted record data)
    await logAdminAction(req, 'DELETE', modelName, id, record, recordName);
    
    console.log(`[server.js]: ⚠️ Admin ${req.user.username} deleted ${modelName} record:`, id);
    
    res.json({ 
      success: true,
      message: 'Record deleted successfully' 
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error deleting record:', error);
    res.status(500).json({ 
      error: 'Failed to delete record', 
      code: 'SERVER_ERROR',
      details: error.message 
    });
  }
});

// ------------------- Endpoint: Bulk Delete records -------------------
app.post('/api/admin/db/:modelName/bulk-delete', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ 
        error: 'Admin access required',
        code: 'PERMISSION_ERROR'
      });
    }
    
    const { modelName } = req.params;
    const { recordIds } = req.body;
    
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        details: 'recordIds must be a non-empty array'
      });
    }
    
    const Model = getModelForAdmin(modelName);
    
    if (!Model) {
      return res.status(404).json({ 
        error: 'Model not found',
        code: 'MODEL_NOT_FOUND'
      });
    }
    
    // Validate all IDs exist and get records for audit logging
    const records = await Model.find({ _id: { $in: recordIds } }).lean();
    const foundIds = records.map(r => String(r._id));
    const notFoundIds = recordIds.filter(id => !foundIds.includes(String(id)));
    
    if (notFoundIds.length > 0) {
      return res.status(404).json({
        error: 'Some records not found',
        code: 'RECORD_NOT_FOUND',
        details: `${notFoundIds.length} record(s) not found`,
        notFoundIds
      });
    }
    
    // Delete all records
    const deleteResult = await Model.deleteMany({ _id: { $in: recordIds } });
    
    // Log audit action for each deleted record
    for (const record of records) {
      const recordName = getRecordIdentifier(record, modelName);
      await logAdminAction(req, 'DELETE', modelName, record._id, record, recordName);
    }
    
    console.log(`[server.js]: ⚠️ Admin ${req.user.username} bulk deleted ${deleteResult.deletedCount} ${modelName} record(s)`);
    
    res.json({
      success: true,
      deleted: deleteResult.deletedCount,
      message: `Successfully deleted ${deleteResult.deletedCount} record(s)`
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error bulk deleting records:', error);
    res.status(500).json({
      error: 'Failed to bulk delete records',
      code: 'SERVER_ERROR',
      details: error.message
    });
  }
});

// ------------------- Endpoint: Import records -------------------
app.post('/api/admin/db/:modelName/import', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ 
        error: 'Admin access required',
        code: 'PERMISSION_ERROR'
      });
    }
    
    const { modelName } = req.params;
    const { records } = req.body;
    
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        details: 'records must be a non-empty array'
      });
    }
    
    const Model = getModelForAdmin(modelName);
    
    if (!Model) {
      return res.status(404).json({ 
        error: 'Model not found',
        code: 'MODEL_NOT_FOUND'
      });
    }
    
    const schema = Model.schema;
    const results = {
      imported: 0,
      failed: []
    };
    
    // Validate and import each record
    for (let i = 0; i < records.length; i++) {
      const recordData = records[i];
      
      try {
        // Remove _id if present (to allow creating new records)
        delete recordData._id;
        delete recordData.__v;
        
        // Validate record data
        const validationErrors = await validateRecordData(modelName, recordData, schema, false);
        if (validationErrors.hasErrors) {
          results.failed.push({
            index: i,
            error: 'Validation failed',
            fieldErrors: validationErrors.fieldErrors
          });
          continue;
        }
        
        // Validate references
        const referenceErrors = await validateReferences(modelName, recordData, schema);
        if (referenceErrors.hasErrors) {
          results.failed.push({
            index: i,
            error: 'Reference validation failed',
            fieldErrors: referenceErrors.fieldErrors
          });
          continue;
        }
        
        // Create record
        const record = new Model(recordData);
        await record.save();
        
        // Log audit action
        const recordObj = record.toObject();
        const recordName = getRecordIdentifier(recordObj, modelName);
        await logAdminAction(req, 'CREATE', modelName, record._id, recordObj, recordName);
        
        results.imported++;
      } catch (error) {
        results.failed.push({
          index: i,
          error: error.message || 'Unknown error'
        });
      }
    }
    
    console.log(`[server.js]: ✅ Admin ${req.user.username} imported ${results.imported} ${modelName} record(s), ${results.failed.length} failed`);
    
    res.json({
      success: true,
      imported: results.imported,
      failed: results.failed.length,
      failedRecords: results.failed
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error importing records:', error);
    res.status(500).json({
      error: 'Failed to import records',
      code: 'SERVER_ERROR',
      details: error.message
    });
  }
});

// ------------------- Special Inventory Item Endpoints -------------------

// Update a single inventory item
app.put('/api/admin/db/Inventory/item/:characterId/:itemId', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { characterId, itemId } = req.params;
    
    // Get the character to find their inventory collection
    const character = await fetchCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    // Get the character's inventory collection
    const collectionName = character.name.trim().toLowerCase();
    const inventoriesDb = await connectToInventoriesNative();
    const inventoryCollection = inventoriesDb.collection(collectionName);
    
    // Update the item
    const { ObjectId } = require('mongodb');
    const result = await inventoryCollection.updateOne(
      { _id: new ObjectId(itemId) },
      { $set: req.body }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    console.log(`[server.js]: ✅ Admin ${req.user.username} updated inventory item:`, itemId, 'for', character.name);
    
    res.json({ 
      success: true,
      message: 'Item updated successfully'
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error updating inventory item:', error);
    res.status(500).json({ 
      error: 'Failed to update inventory item', 
      details: error.message 
    });
  }
});

// Delete a single inventory item
app.delete('/api/admin/db/Inventory/item/:characterId/:itemId', async (req, res) => {
  try {
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { characterId, itemId } = req.params;
    
    // Get the character to find their inventory collection
    const character = await fetchCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    // Get the character's inventory collection
    const collectionName = character.name.trim().toLowerCase();
    const inventoriesDb = await connectToInventoriesNative();
    const inventoryCollection = inventoriesDb.collection(collectionName);
    
    // Delete the item
    const { ObjectId } = require('mongodb');
    const result = await inventoryCollection.deleteOne(
      { _id: new ObjectId(itemId) }
    );
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    console.log(`[server.js]: ⚠️ Admin ${req.user.username} deleted inventory item:`, itemId, 'from', character.name);
    
    res.json({ 
      success: true,
      message: 'Inventory item deleted successfully' 
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error deleting inventory item:', error);
    res.status(500).json({ 
      error: 'Failed to delete inventory item', 
      details: error.message 
    });
  }
});

// ------------------- Section: Error Handling Middleware -------------------
// Use centralized error handler
app.use(errorLogger); // Log errors with request context
app.use(errorHandler); // Handle errors and send responses

// ============================================================================
// ------------------- Section: Pin Management API -------------------
// Handles user-created map pins with authentication and permissions
// ============================================================================

// Import Pin model
const Pin = require('../shared/models/PinModel');

// ------------------- Function: checkUserAccess -------------------
// Helper function to check if user has access to pin operations
async function checkUserAccess(req) {
  // Check if user is authenticated (same pattern as checkAdminAccess)
  const user = req.session?.user || req.user;
  if (!user || !user.discordId) {
    return { hasAccess: false, error: 'Authentication required' };
  }
  
  const guildId = process.env.PROD_GUILD_ID;
  if (!guildId) {
    return { hasAccess: false, error: 'Server configuration error' };
  }
  
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${user.discordId}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { hasAccess: false, error: 'You must be a member of the Discord server to use pins.' };
      }
      throw new Error(`Discord API error: ${response.status}`);
    }
    
    return { hasAccess: true };
  } catch (error) {
    console.error('[server.js]: ❌ Error checking user access for pins:', error);
    return { hasAccess: false, error: 'Failed to verify server membership' };
  }
}

// ------------------- GET /api/pins -------------------
// Get all pins (public + user's private pins)
app.get('/api/pins', async (req, res) => {
  try {
    const accessCheck = await checkUserAccess(req);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }
    
    const user = req.session?.user || req.user;
    const pins = await Pin.getUserPins(user.discordId, true);
    res.json({ success: true, pins });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching pins:', error);
    res.status(500).json({ error: 'Failed to fetch pins' });
  }
});

// ------------------- GET /api/pins/user -------------------
// Get only user's own pins
app.get('/api/pins/user', async (req, res) => {
  try {
    const accessCheck = await checkUserAccess(req);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }
    
    const user = req.session?.user || req.user;
    const pins = await Pin.getUserPins(user.discordId, false);
    res.json({ success: true, pins });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching user pins:', error);
    res.status(500).json({ error: 'Failed to fetch user pins' });
  }
});

// ------------------- POST /api/pins -------------------
// Create a new pin
app.post('/api/pins', pinImageUpload.single('image'), async (req, res) => {
  try {
    const accessCheck = await checkUserAccess(req);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }
    
    const { name, description, icon, color, category, isPublic } = req.body;
    
    // Handle case where category might be an array (due to FormData duplication)
    const normalizedCategory = Array.isArray(category) ? category[0] : category;
    
    // Parse coordinates from FormData (it's sent as a JSON string)
    let coordinates;
    try {
      coordinates = JSON.parse(req.body.coordinates);
    } catch (error) {
      return res.status(400).json({ 
        error: 'Invalid coordinates format' 
      });
    }
    
    // Validate required fields
    if (!name || !coordinates || !coordinates.lat || !coordinates.lng) {
      return res.status(400).json({ 
        error: 'Missing required fields: name and coordinates are required' 
      });
    }
    
    // Validate coordinates (map uses custom coordinate system: 0-20000 for lat, 0-24000 for lng)
    if (coordinates.lat < 0 || coordinates.lat > 20000 || 
        coordinates.lng < 0 || coordinates.lng > 24000) {
      return res.status(400).json({ 
        error: 'Invalid coordinates' 
      });
    }
    
    // Create new pin
    const user = req.session?.user || req.user;
    const pin = new Pin({
      name: name.trim(),
      description: description ? description.trim() : '',
      coordinates: {
        lat: coordinates.lat,
        lng: coordinates.lng
      },
      icon: icon || 'fas fa-home',
      color: color || '#00A3DA',
      category: normalizedCategory || 'homes',
      isPublic: isPublic !== false, // Default to true
      createdBy: user._id,
      discordId: user.discordId
    });
    
    // Manually calculate and set gridLocation as backup
    if (pin.coordinates && pin.coordinates.lat !== undefined && pin.coordinates.lng !== undefined) {
      const { lat, lng } = pin.coordinates;
      const colIndex = Math.floor(lng / 2400); // 0-9 for A-J
      const rowIndex = Math.floor(lat / 1666); // 0-11 for 1-12
      const clampedColIndex = Math.max(0, Math.min(9, colIndex));
      const clampedRowIndex = Math.max(0, Math.min(11, rowIndex));
      const col = String.fromCharCode(65 + clampedColIndex); // A-J
      const row = clampedRowIndex + 1; // 1-12
      pin.gridLocation = col + row;
    }
    
    await pin.save();
    
    // Upload image to Google Cloud Storage if provided
    if (req.file) {
      try {
        const imageUrl = await uploadPinImageToGCS(req.file, pin._id);
        if (imageUrl) {
          pin.imageUrl = imageUrl;
          await pin.save();
        }
      } catch (uploadError) {
        console.error('[server.js]: Error uploading pin image:', uploadError);
        // Don't fail the pin creation if image upload fails
      }
    }
    
    // Populate creator info
    await pin.populate('creator', 'username avatar discriminator');
    
    res.status(201).json({ 
      success: true, 
      pin,
      message: 'Pin created successfully' 
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error creating pin:', error);
    res.status(500).json({ error: 'Failed to create pin' });
  }
});

// ------------------- PUT /api/pins/:id -------------------
// Update a pin (only by owner)
app.put('/api/pins/:id', pinImageUpload.single('image'), async (req, res) => {
  try {
    const accessCheck = await checkUserAccess(req);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }
    
    const pinId = req.params.id;
    const pin = await Pin.findById(pinId);
    
    if (!pin) {
      return res.status(404).json({ error: 'Pin not found' });
    }
    
    // Check if user can modify this pin
    const user = req.session?.user || req.user;
    if (!pin.canUserModify(user.discordId)) {
      return res.status(403).json({ error: 'You can only edit your own pins' });
    }
    
    const { name, description, icon, color, category, isPublic } = req.body;
    
    // Handle case where category might be an array (due to FormData duplication)
    const normalizedCategory = Array.isArray(category) ? category[0] : category;
    
    // Update fields if provided
    if (name !== undefined) pin.name = name.trim();
    if (description !== undefined) pin.description = description.trim();
    if (icon !== undefined) pin.icon = icon;
    if (color !== undefined) pin.color = color;
    if (category !== undefined) pin.category = normalizedCategory;
    if (isPublic !== undefined) pin.isPublic = isPublic;
    
    // Handle image upload if provided
    if (req.file) {
      try {
        const imageUrl = await uploadPinImageToGCS(req.file, pin._id);
        if (imageUrl) {
          pin.imageUrl = imageUrl;
        }
      } catch (uploadError) {
        console.error('[server.js]: Error uploading pin image:', uploadError);
        // Don't fail the pin update if image upload fails
      }
    }
    
    pin.updatedAt = new Date();
    await pin.save();
    
    // Populate creator info
    await pin.populate('creator', 'username avatar discriminator');
    
    res.json({ 
      success: true, 
      pin,
      message: 'Pin updated successfully' 
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error updating pin:', error);
    res.status(500).json({ error: 'Failed to update pin' });
  }
});

// ------------------- PUT /api/pins/:id/coordinates -------------------
// Update pin coordinates (only by owner)
app.put('/api/pins/:id/coordinates', async (req, res) => {
  try {
    const accessCheck = await checkUserAccess(req);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }
    
    const pinId = req.params.id;
    const pin = await Pin.findById(pinId);
    
    if (!pin) {
      return res.status(404).json({ error: 'Pin not found' });
    }
    
    // Check if user can modify this pin
    const user = req.session?.user || req.user;
    if (!pin.canUserModify(user.discordId)) {
      return res.status(403).json({ error: 'You can only edit your own pins' });
    }
    
    const { coordinates } = req.body;
    
    // Validate coordinates
    if (!coordinates || coordinates.lat === undefined || coordinates.lng === undefined) {
      return res.status(400).json({ error: 'Coordinates are required' });
    }
    
    // Validate coordinates (map uses custom coordinate system: 0-20000 for lat, 0-24000 for lng)
    if (coordinates.lat < 0 || coordinates.lat > 20000 || 
        coordinates.lng < 0 || coordinates.lng > 24000) {
      return res.status(400).json({ 
        error: 'Invalid coordinates' 
      });
    }
    
    // Update coordinates
    pin.coordinates.lat = coordinates.lat;
    pin.coordinates.lng = coordinates.lng;
    
    // Recalculate grid location
    const { lat, lng } = pin.coordinates;
    const colIndex = Math.floor(lng / 2400); // 0-9 for A-J
    const rowIndex = Math.floor(lat / 1666); // 0-11 for 1-12
    const clampedColIndex = Math.max(0, Math.min(9, colIndex));
    const clampedRowIndex = Math.max(0, Math.min(11, rowIndex));
    const col = String.fromCharCode(65 + clampedColIndex); // A-J
    const row = clampedRowIndex + 1; // 1-12
    pin.gridLocation = col + row;
    
    pin.updatedAt = new Date();
    await pin.save();
    
    // Populate creator info
    await pin.populate('creator', 'username avatar discriminator');
    
    res.json({ 
      success: true, 
      pin,
      message: 'Pin coordinates updated successfully' 
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error updating pin coordinates:', error);
    res.status(500).json({ error: 'Failed to update pin coordinates' });
  }
});

// ------------------- DELETE /api/pins/:id -------------------
// Delete a pin (only by owner)
app.delete('/api/pins/:id', async (req, res) => {
  try {
    const accessCheck = await checkUserAccess(req);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }
    
    const pinId = req.params.id;
    const pin = await Pin.findById(pinId);
    
    if (!pin) {
      return res.status(404).json({ error: 'Pin not found' });
    }
    
    // Check if user can modify this pin
    const user = req.session?.user || req.user;
    if (!pin.canUserModify(user.discordId)) {
      return res.status(403).json({ error: 'You can only delete your own pins' });
    }
    
    await Pin.findByIdAndDelete(pinId);
    
    res.json({ 
      success: true, 
      message: 'Pin deleted successfully' 
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error deleting pin:', error);
    res.status(500).json({ error: 'Failed to delete pin' });
  }
});

// ------------------- GET /api/pins/location/:gridLocation -------------------
// Get pins by grid location
app.get('/api/pins/location/:gridLocation', async (req, res) => {
  try {
    const accessCheck = await checkUserAccess(req);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }
    
    const { gridLocation } = req.params;
    
    // Validate grid location format
    if (!/^[A-J]([1-9]|1[0-2])$/.test(gridLocation)) {
      return res.status(400).json({ error: 'Invalid grid location format' });
    }
    
    const pins = await Pin.getPinsByLocation(gridLocation);
    res.json({ success: true, pins });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching pins by location:', error);
    res.status(500).json({ error: 'Failed to fetch pins by location' });
  }
});

// ------------------- GET /api/pins/category/:category -------------------
// Get pins by category
app.get('/api/pins/category/:category', async (req, res) => {
  try {
    const accessCheck = await checkUserAccess(req);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }
    
    const { category } = req.params;
    const validCategories = ['homes', 'farms', 'shops', 'points-of-interest'];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    
    const pins = await Pin.getPinsByCategory(category, true);
    res.json({ success: true, pins });
  } catch (error) {
    console.error('[server.js]: ❌ Error fetching pins by category:', error);
    res.status(500).json({ error: 'Failed to fetch pins by category' });
  }
});

// ------------------- POST /api/pins/migrate-house-colors -------------------
// Migration endpoint to update existing house pins to new color
app.post('/api/pins/migrate-house-colors', async (req, res) => {
  try {
    const accessCheck = await checkUserAccess(req);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }
    
    // Update all pins with category 'homes' to new lime green color
    const result1 = await Pin.updateMany(
      { 
        category: 'homes',
        color: '#09A98E'  // Old cyan color
      },
      { 
        $set: { 
          color: '#C5FF00',  // New lime green color
          updatedAt: new Date()
        }
      }
    );
    
    const result2 = await Pin.updateMany(
      { 
        category: 'homes',
        color: '#EDAF12'  // Old house color
      },
      { 
        $set: { 
          color: '#C5FF00',  // New lime green color
          updatedAt: new Date()
        }
      }
    );
    
    const result3 = await Pin.updateMany(
      { 
        category: 'homes',
        color: '#FFD700'  // Old gold color
      },
      { 
        $set: { 
          color: '#C5FF00',  // New lime green color
          updatedAt: new Date()
        }
      }
    );
    
    const totalUpdated = result1.modifiedCount + result2.modifiedCount + result3.modifiedCount;
    
    console.log(`[server.js]: ✅ Updated ${totalUpdated} house pins to new color #C5FF00`);
    
    res.json({ 
      success: true, 
      message: `Successfully updated ${totalUpdated} house pins to new color #C5FF00`,
      modifiedCount: totalUpdated
    });
  } catch (error) {
    console.error('[server.js]: ❌ Error migrating house pin colors:', error);
    res.status(500).json({ error: 'Failed to migrate house pin colors' });
  }
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
  // Display startup banner
  logger.banner('TINGLEBOT DASHBOARD', 'Initializing server components...');
  
  // Initialize cache cleanup (safe operation)
  try {
    initializeCacheCleanup();
  } catch (err) {
    logger.warn('server.js', 'Cache cleanup initialization failed');
  }
  
  // Start server FIRST so health checks pass immediately
  // Bind to 0.0.0.0 for Railway/Docker deployments
  // This MUST succeed or we exit
  try {
    app.listen(PORT, '0.0.0.0', () => {
      const env = process.env.NODE_ENV || 'development';
      logger.ready(PORT, env);
      logger.info('server.js', `Server is listening on 0.0.0.0:${PORT}`);
      
      // Show nodemon watching message
      if (process.env.NODE_ENV !== 'production') {
        logger.info('server.js', '👀 Watching for file changes... (type "rs" to restart)');
      }
    });
  } catch (error) {
    logger.error('server.js', 'CRITICAL: Failed to start HTTP server', error);
    process.exit(1);
  }
  
  // Initialize databases in background (non-blocking, failures are non-fatal)
  initializeDatabases().catch(err => {
    logger.error('server.js', 'Database initialization failed - some features will be limited', err);
  });
  
  // Initialize background tasks (non-blocking, failures are non-fatal)
  Promise.all([
    setupWeeklyCharacterRotation(),
    Promise.resolve(setupDailyResetReminders()),
    Promise.resolve(setupBloodMoonAlerts()),
    Promise.resolve(setupBlightCallNotifications())
  ]).then(() => {
    logger.divider('SCHEDULERS INITIALIZED');
  }).catch(err => {
    logger.error('server.js', 'Error initializing schedulers', err);
  });
  
  // Initialize Discord Gateway (non-blocking, failures are non-fatal)
  const gateway = getDiscordGateway();
  gateway.connect().then(gatewayConnected => {
    if (gatewayConnected) {
      logger.info('server.js', 'Discord Gateway connected successfully');
    } else {
      logger.warn('server.js', 'Discord Gateway failed to connect - some features will be limited');
    }
  }).catch(err => {
    logger.warn('server.js', 'Discord Gateway connection error - some features will be limited', err);
  });
};

// ------------------- Section: Graceful Shutdown -------------------

// ------------------- Function: gracefulShutdown -------------------
// Handles graceful shutdown of the server and database connections
const gracefulShutdown = async () => {
  // Close all database connections
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  
  if (inventoriesConnection) {
    await inventoriesConnection.close();
  }
  
  if (vendingConnection) {
    await vendingConnection.close();
  }
  
  process.exit(0);
};

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start the server
startServer();

// ------------------- Function: countSpiritOrbs -------------------
// Counts spirit orbs from a character's inventory
async function countSpiritOrbs(characterName) {
  try {
    const col = await getCharacterInventoryCollection(characterName);
    const spiritOrbItem = await col.findOne({ 
      itemName: { $regex: /^spirit\s*orb$/i } 
    });
    return spiritOrbItem ? spiritOrbItem.quantity || 0 : 0;
  } catch (error) {
    console.warn(`[server.js]: Error counting spirit orbs for ${characterName}:`, error.message);
    return 0;
  }
}

// ------------------- Function: countSpiritOrbsBatch -------------------
// Counts spirit orbs for multiple characters efficiently with caching
async function countSpiritOrbsBatch(characterNames) {
  const spiritOrbCounts = {};
  const now = Date.now();
  
  // Check cache first
  const uncachedCharacters = [];
  for (const characterName of characterNames) {
    const cached = spiritOrbCache.get(characterName);
    // Cache class handles TTL automatically, so if cached exists, it's valid
    if (cached && cached.timestamp && (now - cached.timestamp) < SPIRIT_ORB_CACHE_DURATION) {
      spiritOrbCounts[characterName] = cached.count;
    } else {
      uncachedCharacters.push(characterName);
    }
  }
  
  // Only query database for uncached characters
  if (uncachedCharacters.length > 0) {
    for (const characterName of uncachedCharacters) {
      try {
        // Ensure characterName is valid
        if (!characterName || typeof characterName !== 'string') {
          console.warn(`[server.js]: Invalid character name for spirit orb count: ${characterName}`);
          spiritOrbCounts[characterName] = 0;
          continue;
        }
        
        const col = await getCharacterInventoryCollection(characterName);
        const spiritOrbItem = await col.findOne({ 
          itemName: { $regex: /^spirit\s*orb$/i } 
        });
        const count = spiritOrbItem ? spiritOrbItem.quantity || 0 : 0;
        
        // Cache the result
        spiritOrbCache.set(characterName, {
          count,
          timestamp: now
        });
        
        spiritOrbCounts[characterName] = count;
      } catch (error) {
        console.warn(`[server.js]: ⚠️ Error counting spirit orbs for ${characterName}:`, error.message);
        spiritOrbCounts[characterName] = 0;
      }
    }
  }
  
  return spiritOrbCounts;
}

// ------------------- Function: testSundayMidnightCalculation -------------------
// Test endpoint to verify Sunday midnight calculation (for debugging)
app.get('/api/test-sunday-midnight', async (req, res) => {
  try {
    const now = new Date();
    const nextSunday = getNextSundayMidnight(now);
    const timeUntilNext = nextSunday.getTime() - now.getTime();
    
    const result = {
      currentTime: now.toISOString(),
      currentTimeEST: now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
      nextSundayMidnight: nextSunday.toISOString(),
      nextSundayMidnightEST: nextSunday.toLocaleString('en-US', { timeZone: 'America/New_York' }),
      timeUntilNext: {
        milliseconds: timeUntilNext,
        hours: Math.floor(timeUntilNext / (1000 * 60 * 60)),
        minutes: Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60)),
        days: Math.floor(timeUntilNext / (1000 * 60 * 60 * 24))
      },
      currentDayOfWeek: now.getUTCDay(),
      isSunday: now.getUTCDay() === 0
    };
    
    res.json(result);
  } catch (error) {
    console.error('[server.js]: ❌ Error in test endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: testDailyResetSchedule -------------------
// Test endpoint to verify next 8am reminder schedule (for debugging)
app.get('/api/test-daily-reset', async (req, res) => {
  try {
    const now = new Date();
    const next8am = getNext8amEST(now);
    const timeUntilNext = next8am.getTime() - now.getTime();
    
    const result = {
      currentTime: now.toISOString(),
      currentTimeEST: now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
      next8amEST: next8am.toISOString(),
      next8amESTLocal: next8am.toLocaleString('en-US', { timeZone: 'America/New_York' }),
      timeUntilNext: {
        milliseconds: timeUntilNext,
        hours: Math.floor(timeUntilNext / (1000 * 60 * 60)),
        minutes: Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((timeUntilNext % (1000 * 60)) / 1000)
      }
    };
    
    res.json(result);
  } catch (error) {
    console.error('[server.js]: ❌ Error in test endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Function: testBloodMoonSchedule -------------------
// Test endpoint to verify blood moon alert schedule (for debugging)
app.get('/api/test-blood-moon', async (req, res) => {
  try {
    const now = new Date();
    const nextMidnight = getNextMidnightEST(now);
    const timeUntilNext = nextMidnight.getTime() - now.getTime();
    const isTodayBeforeBloodMoon = checkIfTodayIsBeforeBloodMoon();
    
    const result = {
      currentTime: now.toISOString(),
      currentTimeEST: now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
      nextMidnightEST: nextMidnight.toISOString(),
      nextMidnightESTLocal: nextMidnight.toLocaleString('en-US', { timeZone: 'America/New_York' }),
      isTodayDayBeforeBloodMoon: isTodayBeforeBloodMoon,
      willAlertAtNextMidnight: isTodayBeforeBloodMoon,
      timeUntilNext: {
        milliseconds: timeUntilNext,
        hours: Math.floor(timeUntilNext / (1000 * 60 * 60)),
        minutes: Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((timeUntilNext % (1000 * 60)) / 1000)
      }
    };
    
    res.json(result);
  } catch (error) {
    console.error('[server.js]: ❌ Error in test endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// ------------------- Section: Admin Database Management -------------------
// Provides CRUD operations for all database models (admin-only)
// ============================================================================

