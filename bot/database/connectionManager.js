// ============================================================================
// ------------------- Database Connection Manager -------------------
// Purpose: Centralized connection management for all MongoDB databases
// - Manages connections to tinglebot, inventories, vending, and items databases
// - Provides connection pooling, health monitoring, and automatic reconnection
// - Optimized for Railway deployment with sequential connection strategy
// - Handles both Mongoose and native MongoClient connections
// Used by: index.js, agenda.js, autocompleteHandler.js, blightHandler.js, vendingHandler.js
// Dependencies: retryStrategy.js, healthMonitor.js, config/database.js
// ============================================================================

const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const path = require('path');
const dbConfig = require('../config/database');
const { retryOperation } = require('./retryStrategy');
const { checkConnectionHealth, startHealthChecks, stopHealthChecks } = require('./healthMonitor');

// ============================================================================
// ------------------- Logger & Error Handler Setup -------------------
// ============================================================================

let logger = null;
let handleError = null;
let resetErrorCounter = null;

try {
  logger = require('../utils/logger');
} catch (e) {
  // Fallback logger
  logger = {
    success: (cat, msg) => console.log(`[${cat}] ✅ ${msg}`),
    error: (cat, msg) => console.error(`[${cat}] ❌ ${msg}`),
    info: (cat, msg) => console.log(`[${cat}] ℹ️ ${msg}`),
    warn: (cat, msg) => console.warn(`[${cat}] ⚠️ ${msg}`),
    debug: (cat, msg) => console.log(`[${cat}] 🔍 ${msg}`)
  };
}

try {
  const errorHandler = require('../utils/globalErrorHandler');
  handleError = errorHandler.handleError;
  resetErrorCounter = errorHandler.resetErrorCounter;
} catch (e) {
  handleError = (error, source) => console.error(`[${source}] Error:`, error.message);
  resetErrorCounter = () => {};
}

// Memory monitor (optional)
let memoryMonitor = null;
try {
  const { getMemoryMonitor } = require('../utils/memoryMonitor');
  memoryMonitor = getMemoryMonitor();
} catch (err) {
  // Memory monitor not available
}

// ============================================================================
// ------------------- Connection State -------------------
// ============================================================================

const connections = {
  tinglebot: null,
  inventories: null,
  inventoriesNative: null,
  inventoriesNativeClient: null,
  vending: null,
  items: null,
  itemsClient: null
};

// Track connection promises to prevent duplicate connections
const connectionPromises = {
  tinglebot: null,
  inventories: null,
  inventoriesNative: null,
  vending: null,
  items: null
};

// ============================================================================
// ------------------- Database Connection Manager Class -------------------
// ============================================================================

class DatabaseConnectionManager {
  // ==========================================================================
  // ------------------- Initialization -------------------
  // ==========================================================================

  /**
   * Initialize all database connections
   * Optimized for Railway deployment with sequential connection for better resource management
   * @returns {Promise<void>}
   */
  static async initialize() {
    try {
      const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
      logger.info('DATABASE', `Initializing database connections${isRailway ? ' (Railway optimized)' : ''}...`);
      
      // Railway: Connect sequentially to reduce initial memory spike
      // Local: Connect in parallel for faster startup
      if (isRailway) {
        // Sequential connection for Railway (better memory management)
        await this.connectToTinglebot();
        await this.connectToInventories();
      } else {
        // Parallel connection for local development (faster)
        await Promise.all([
          this.connectToTinglebot(),
          this.connectToInventories()
        ]);
      }
      
      // Start health monitoring (with Railway-optimized intervals)
      startHealthChecks({
        tinglebot: mongoose.connection,
        inventories: connections.inventories,
        vending: connections.vending
      });
      
      logger.success('DATABASE', 'All database connections initialized');
    } catch (error) {
      handleError(error, "connectionManager");
      logger.error('DATABASE', 'Failed to initialize database connections');
      throw error;
    }
  }

  // ==========================================================================
  // ------------------- Tinglebot Connection -------------------
  // ==========================================================================

  /**
   * Connect to Tinglebot database (main database)
   * @returns {Promise<mongoose.Connection>}
   */
  static async connectToTinglebot() {
    // If already connecting, wait for that promise
    if (connectionPromises.tinglebot) {
      return await connectionPromises.tinglebot;
    }

    // If already connected and healthy, return existing connection
    if (mongoose.connection.readyState === 1) {
      try {
        await mongoose.connection.db.admin().ping();
        return mongoose.connection;
      } catch (pingError) {
        // Connection exists but ping failed, will reconnect
        logger.warn('DATABASE', 'Tinglebot connection ping failed, reconnecting...');
      }
    }

    // Create connection promise
    connectionPromises.tinglebot = retryOperation(async () => {
      mongoose.set("strictQuery", false);
      const uri = dbConfig.tinglebot;

      if (!uri) {
        throw new Error('Missing MongoDB URI for tinglebot database');
      }

      const connection = await mongoose.connect(uri, dbConfig.options);
      connections.tinglebot = connection;

      // Sync TTL indexes
      try {
        const TempData = require('../models/TempDataModel');
        const RuuGame = require('../models/RuuGameModel');
        const { VendingRequest } = require('../models/VendingModel');

        await Promise.all([
          TempData.syncIndexes(),
          RuuGame.syncIndexes(),
          VendingRequest.syncIndexes()
        ]);

        logger.info('DATABASE', 'TTL indexes synced successfully');
      } catch (indexError) {
        if (!indexError.message.includes('equivalent index already exists')) {
          logger.warn('DATABASE', `Could not sync TTL indexes: ${indexError.message}`);
        }
      }

      // Track connection pool size
      if (memoryMonitor) {
        try {
          const poolSize = mongoose.connection.db?.serverConfig?.poolSize || 0;
          memoryMonitor.trackResource('dbPoolSize_tinglebot', poolSize);
        } catch (e) {
          // Ignore errors
        }
      }

      resetErrorCounter();
      logger.success('DATABASE', 'Tinglebot database connected');
      return connection;
    }, {
      operationName: 'connectToTinglebot',
      maxRetries: 3
    }).catch(error => {
      connectionPromises.tinglebot = null;
      handleError(error, "connectionManager");
      logger.error('DATABASE', 'Failed to connect to tinglebot database');
      throw error;
    });

    try {
      return await connectionPromises.tinglebot;
    } finally {
      connectionPromises.tinglebot = null;
    }
  }

  /**
   * Get Tinglebot Mongoose connection instance (for Agenda)
   * @returns {mongoose.Connection}
   */
  static getTinglebotConnection() {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Tinglebot connection not established. Call connectToTinglebot() first.');
    }
    return mongoose.connection;
  }

  /**
   * Get Tinglebot connection URI
   * @returns {string}
   */
  static getTinglebotUri() {
    return dbConfig.tinglebot;
  }

  // ==========================================================================
  // ------------------- Inventories Connection -------------------
  // ==========================================================================

  /**
   * Connect to Inventories database (Mongoose)
   * @returns {Promise<mongoose.Connection>}
   */
  static async connectToInventories() {
    // If already connecting, wait for that promise
    if (connectionPromises.inventories) {
      return await connectionPromises.inventories;
    }

    // If already connected and healthy, return existing connection
    if (connections.inventories && connections.inventories.readyState === 1) {
      return connections.inventories;
    }

    // Create connection promise
    connectionPromises.inventories = retryOperation(async () => {
      const uri = dbConfig.inventories;

      if (!uri) {
        throw new Error('Missing MongoDB URI for inventories database');
      }

      const connection = await mongoose.createConnection(uri, dbConfig.options);
      
      // Wait for connection to be established
      await new Promise((resolve, reject) => {
        if (connection.readyState === 1) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout - inventories database did not connect within 30 seconds'));
        }, 30000);

        connection.once('connected', () => {
          clearTimeout(timeout);
          resolve();
        });

        connection.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // Ensure we're using the 'inventories' database
      connection.useDb('inventories');
      connections.inventories = connection;

      logger.success('DATABASE', 'Inventories database connected');
      return connection;
    }, {
      operationName: 'connectToInventories',
      maxRetries: 3
    }).catch(error => {
      connectionPromises.inventories = null;
      connections.inventories = null;
      handleError(error, "connectionManager");
      logger.error('DATABASE', 'Failed to connect to inventories database');
      throw error;
    });

    try {
      return await connectionPromises.inventories;
    } finally {
      connectionPromises.inventories = null;
    }
  }

  /**
   * Get Inventories Mongoose connection instance
   * @returns {mongoose.Connection}
   */
  static getInventoriesConnection() {
    if (!connections.inventories || connections.inventories.readyState !== 1) {
      throw new Error('Inventories connection not established. Call connectToInventories() first.');
    }
    return connections.inventories;
  }

  /**
   * Connect to Inventories database (Native MongoClient)
   * @returns {Promise<Db>}
   */
  static async connectToInventoriesNative() {
    // If already connecting, wait for that promise
    if (connectionPromises.inventoriesNative) {
      return await connectionPromises.inventoriesNative;
    }

    // If already connected, check health and return
    if (connections.inventoriesNative && connections.inventoriesNativeClient) {
      try {
        await Promise.race([
          connections.inventoriesNative.admin().ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 2000))
        ]);
        return connections.inventoriesNative;
      } catch (pingError) {
        logger.warn('DATABASE', 'Native inventories connection lost, reconnecting...');
        connections.inventoriesNative = null;
        connections.inventoriesNativeClient = null;
      }
    }

    // Create connection promise
    connectionPromises.inventoriesNative = retryOperation(async () => {
      const uri = dbConfig.inventories;

      if (!uri) {
        throw new Error('Missing MongoDB URI for inventories database');
      }

      const client = new MongoClient(uri, dbConfig.options);
      await client.connect();
      const db = client.db('inventories');

      connections.inventoriesNativeClient = client;
      connections.inventoriesNative = db;

      // Track connection pool size
      if (memoryMonitor) {
        try {
          const poolSize = client.topology?.s?.pool?.totalConnectionCount || 0;
          memoryMonitor.trackResource('dbPoolSize_inventories', poolSize);
        } catch (e) {
          // Ignore errors
        }
      }

      logger.success('DATABASE', 'Native inventories database connected');
      return db;
    }, {
      operationName: 'connectToInventoriesNative',
      maxRetries: 3
    }).catch(error => {
      connectionPromises.inventoriesNative = null;
      connections.inventoriesNative = null;
      connections.inventoriesNativeClient = null;
      handleError(error, "connectionManager");
      logger.error('DATABASE', 'Failed to connect to native inventories database');
      throw error;
    });

    try {
      return await connectionPromises.inventoriesNative;
    } finally {
      connectionPromises.inventoriesNative = null;
    }
  }

  /**
   * Get inventory collection for a character
   * @param {string} characterName - Character name
   * @returns {Promise<Collection>}
   */
  static async getInventoryCollection(characterName) {
    if (typeof characterName !== "string") {
      throw new Error("Character name must be a string.");
    }
    const inventoriesDb = await this.connectToInventoriesNative();
    const collectionName = characterName.trim().toLowerCase();
    return inventoriesDb.collection(collectionName);
  }

  // ==========================================================================
  // ------------------- Vending Connection -------------------
  // ==========================================================================

  /**
   * Connect to Vending database
   * @returns {Promise<mongoose.Connection>}
   */
  static async connectToVending() {
    // If already connecting, wait for that promise
    if (connectionPromises.vending) {
      return await connectionPromises.vending;
    }

    // If already connected and healthy, return existing connection
    if (connections.vending && connections.vending.readyState === 1) {
      return connections.vending;
    }

    // Create connection promise
    connectionPromises.vending = retryOperation(async () => {
      const uri = dbConfig.vending;

      if (!uri) {
        throw new Error('Missing MongoDB URI for vending database');
      }

      const connection = await mongoose.createConnection(uri, dbConfig.options);
      connections.vending = connection;

      logger.success('DATABASE', 'Vending database connected');
      return connection;
    }, {
      operationName: 'connectToVending',
      maxRetries: 3
    }).catch(error => {
      connectionPromises.vending = null;
      connections.vending = null;
      handleError(error, "connectionManager");
      logger.error('DATABASE', 'Failed to connect to vending database');
      throw error;
    });

    try {
      return await connectionPromises.vending;
    } finally {
      connectionPromises.vending = null;
    }
  }

  /**
   * Get Vending Mongoose connection instance
   * @returns {mongoose.Connection}
   */
  static getVendingConnection() {
    if (!connections.vending || connections.vending.readyState !== 1) {
      throw new Error('Vending connection not established. Call connectToVending() first.');
    }
    return connections.vending;
  }

  // ==========================================================================
  // ------------------- Items Connection -------------------
  // ==========================================================================

  /**
   * Connect to Items database (uses inventories/tinglebot URI)
   * @param {Object} context - Context for error handling
   * @returns {Promise<Db>}
   */
  static async connectToInventoriesForItems(context = {}) {
    // If already connecting, wait for that promise
    if (connectionPromises.items) {
      return await connectionPromises.items;
    }

    // If already connected, check health and return
    if (connections.itemsClient && connections.items) {
      try {
        await Promise.race([
          connections.itemsClient.db('tinglebot').admin().ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 2000))
        ]);
        return connections.items;
      } catch (pingError) {
        logger.warn('DATABASE', 'Items connection lost, reconnecting...');
        connections.itemsClient = null;
        connections.items = null;
      }
    }

    // Create connection promise
    connectionPromises.items = retryOperation(async () => {
      const uri = dbConfig.inventories || dbConfig.tinglebot;

      if (!uri) {
        throw new Error('Missing MongoDB URI for items database');
      }

      const client = new MongoClient(uri, dbConfig.options);
      await client.connect();
      const db = client.db('tinglebot');

      connections.itemsClient = client;
      connections.items = db;

      resetErrorCounter();
      logger.success('DATABASE', 'Items database connected');
      return db;
    }, {
      operationName: 'connectToInventoriesForItems',
      maxRetries: 3
    }).catch(error => {
      connectionPromises.items = null;
      connections.itemsClient = null;
      connections.items = null;
      handleError(error, "connectionManager", context);
      logger.error('DATABASE', 'Failed to connect to items database');
      throw error;
    });

    try {
      return await connectionPromises.items;
    } finally {
      connectionPromises.items = null;
    }
  }

  // ==========================================================================
  // ------------------- Health Monitoring -------------------
  // ==========================================================================

  /**
   * Perform health check on all connections
   * @returns {Promise<Object>}
   */
  static async healthCheck() {
    const checks = {};

    if (mongoose.connection) {
      checks.tinglebot = await checkConnectionHealth('tinglebot', mongoose.connection);
    }

    if (connections.inventories) {
      checks.inventories = await checkConnectionHealth('inventories', connections.inventories);
    }

    if (connections.vending) {
      checks.vending = await checkConnectionHealth('vending', connections.vending);
    }

    return checks;
  }

  /**
   * Get connection status for all databases
   * @returns {Object}
   */
  static getConnectionStatus() {
    return {
      tinglebot: {
        connected: mongoose.connection.readyState === 1,
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name
      },
      inventories: {
        connected: connections.inventories?.readyState === 1,
        readyState: connections.inventories?.readyState || 0,
        host: connections.inventories?.host,
        name: connections.inventories?.name
      },
      vending: {
        connected: connections.vending?.readyState === 1,
        readyState: connections.vending?.readyState || 0,
        host: connections.vending?.host,
        name: connections.vending?.name
      }
    };
  }

  // ==========================================================================
  // ------------------- Lifecycle Management -------------------
  // ==========================================================================

  /**
   * Close all database connections gracefully
   * @returns {Promise<void>}
   */
  static async closeAll() {
    try {
      logger.info('DATABASE', 'Closing all database connections...');

      // Stop health checks
      stopHealthChecks();

      // Close Mongoose connections
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        logger.info('DATABASE', 'Tinglebot connection closed');
      }

      if (connections.inventories && connections.inventories.readyState === 1) {
        await connections.inventories.close();
        logger.info('DATABASE', 'Inventories connection closed');
      }

      if (connections.vending && connections.vending.readyState === 1) {
        await connections.vending.close();
        logger.info('DATABASE', 'Vending connection closed');
      }

      // Close native clients
      if (connections.inventoriesNativeClient) {
        await connections.inventoriesNativeClient.close();
        logger.info('DATABASE', 'Native inventories connection closed');
      }

      if (connections.itemsClient) {
        await connections.itemsClient.close();
        logger.info('DATABASE', 'Items connection closed');
      }

      // Reset all connections
      Object.keys(connections).forEach(key => {
        connections[key] = null;
      });

      logger.success('DATABASE', 'All database connections closed');
    } catch (error) {
      logger.error('DATABASE', `Error closing connections: ${error.message}`);
      throw error;
    }
  }
}

// ============================================================================
// ------------------- Process Exit Handlers -------------------
// ============================================================================

process.on('SIGINT', async () => {
  await DatabaseConnectionManager.closeAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await DatabaseConnectionManager.closeAll();
  process.exit(0);
});

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = DatabaseConnectionManager;
