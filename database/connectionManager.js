// ============================================================================
// ------------------- Database Connection Manager -------------------
// Centralized connection management for all MongoDB databases
// ============================================================================

const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const path = require('path');
const dbConfig = require('../config/database');

// Try to import logger and error handler (may not be available in all contexts)
let logger = null;
let handleError = null;
let resetErrorCounter = null;

try {
  // Try bot logger first
  const loggerPath = path.join(__dirname, '..', 'bot', 'utils', 'logger');
  logger = require(loggerPath);
} catch (e) {
  try {
    // Try dashboard logger
    const loggerPath = path.join(__dirname, '..', 'Tinglebot Dashboard', 'utils', 'logger');
    logger = require(loggerPath);
  } catch (e2) {
    // Fallback to console logger
    logger = {
      success: (cat, msg) => console.log(`[${cat}] ✅ ${msg}`),
      error: (cat, msg) => console.error(`[${cat}] ❌ ${msg}`),
      info: (cat, msg) => console.log(`[${cat}] ℹ️ ${msg}`),
      warn: (cat, msg) => console.warn(`[${cat}] ⚠️ ${msg}`),
      database: (msg, src) => console.log(`[DATABASE] ${msg}`)
    };
  }
}

try {
  const errorHandlerPath = path.join(__dirname, '..', 'bot', 'utils', 'globalErrorHandler');
  const errorHandler = require(errorHandlerPath);
  handleError = errorHandler.handleError;
  resetErrorCounter = errorHandler.resetErrorCounter;
} catch (e) {
  // Fallback error handler
  handleError = (error, source) => {
    console.error(`[${source || 'connectionManager'}] Error:`, error.message);
  };
  resetErrorCounter = () => {};
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

// ============================================================================
// ------------------- Connection Manager Class -------------------
// ============================================================================

class DatabaseConnectionManager {
  // ------------------- connectToTinglebot -------------------
  static async connectToTinglebot() {
    try {
      // Check if connection exists and is valid
      if (mongoose.connection.readyState === 1) {
        try {
          await mongoose.connection.db.admin().ping();
          return mongoose.connection;
        } catch (pingError) {
          // Connection exists but ping failed, will reconnect below
        }
      }

      // If no valid connection, create new one
      if (!connections.tinglebot || mongoose.connection.readyState === 0) {
        mongoose.set("strictQuery", false);
        const uri = dbConfig.tinglebot;

        if (!uri) {
          throw new Error('Missing MongoDB URI for tinglebot database');
        }

        connections.tinglebot = await mongoose.connect(uri, dbConfig.options);

        logger.success('DATABASE', 'Tinglebot database connected');
        resetErrorCounter();
      }

      return connections.tinglebot;
    } catch (error) {
      handleError(error, "connectionManager");
      logger.error('DATABASE', 'Failed to connect to tinglebot database');
      throw error;
    }
  }

  // ------------------- connectToInventories -------------------
  static async connectToInventories() {
    try {
      // Check if connection exists and is valid
      if (connections.inventories && connections.inventories.readyState === 1) {
        return connections.inventories;
      }

      const uri = dbConfig.inventories;

      if (!uri) {
        throw new Error('Missing MongoDB URI for inventories database. Please set MONGODB_INVENTORIES_URI_PROD or MONGODB_INVENTORIES_URI');
      }

      connections.inventories = await mongoose.createConnection(uri, dbConfig.options);

      // Wait for connection to be established
      await new Promise((resolve, reject) => {
        if (connections.inventories.readyState === 1) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout - inventories database did not connect within 30 seconds'));
        }, 30000);

        connections.inventories.once('connected', () => {
          clearTimeout(timeout);
          resolve();
        });

        connections.inventories.once('error', (err) => {
          clearTimeout(timeout);
          console.error(`[connectionManager]: ❌ Inventories database connection error:`, err);
          reject(err);
        });
      });

      // Ensure we're using the 'inventories' database
      connections.inventories.useDb('inventories');

      logger.success('DATABASE', 'Inventories database connected');
      return connections.inventories;
    } catch (error) {
      handleError(error, "connectionManager");
      console.error("[connectionManager]: ❌ Failed to connect to inventories database:", error.message);
      connections.inventories = null; // Reset on error
      throw error;
    }
  }

  // ------------------- connectToInventoriesNative -------------------
  static async connectToInventoriesNative() {
    try {
      // Always check if we have a valid connection first
      if (connections.inventoriesNative && connections.inventoriesNativeClient) {
        try {
          await connections.inventoriesNative.admin().ping();
          return connections.inventoriesNative;
        } catch (pingError) {
          console.log("[connectionManager]: Native inventories connection lost, reconnecting...");
          // Connection is dead, reset and reconnect
          connections.inventoriesNative = null;
          connections.inventoriesNativeClient = null;
        }
      }

      // If no connection, create a new one
      if (!connections.inventoriesNative) {
        const uri = dbConfig.inventories;

        if (!uri) {
          throw new Error('Missing MongoDB URI for inventories database');
        }

        connections.inventoriesNativeClient = new MongoClient(uri, dbConfig.options);
        await connections.inventoriesNativeClient.connect();
        connections.inventoriesNative = connections.inventoriesNativeClient.db('inventories');

        logger.success('DATABASE', 'Native inventories database connected');
      }

      return connections.inventoriesNative;
    } catch (error) {
      console.error("[connectionManager]: ❌ Error connecting to Native inventories database:", error.message);
      connections.inventoriesNative = null;
      connections.inventoriesNativeClient = null;
      throw error;
    }
  }

  // ------------------- getInventoryCollection -------------------
  static async getInventoryCollection(characterName) {
    if (typeof characterName !== "string") {
      throw new Error("Character name must be a string.");
    }
    const inventoriesDb = await this.connectToInventoriesNative();
    const collectionName = characterName.trim().toLowerCase();
    return inventoriesDb.collection(collectionName);
  }

  // ------------------- connectToVending -------------------
  static async connectToVending() {
    try {
      if (connections.vending && connections.vending.readyState === 1) {
        return connections.vending;
      }

      const uri = dbConfig.vending;

      if (!uri) {
        throw new Error('Missing MongoDB URI for vending database');
      }

      connections.vending = await mongoose.createConnection(uri, dbConfig.options);

      logger.success('DATABASE', 'Vending database connected');
      return connections.vending;
    } catch (error) {
      handleError(error, "connectionManager");
      console.error("[connectionManager]: ❌ Error in connectToVending:", error.message);
      throw error;
    }
  }

  // ------------------- connectToInventoriesForItems -------------------
  static async connectToInventoriesForItems(context = {}) {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        // Always check if we have a valid connection first
        if (connections.itemsClient && connections.items) {
          try {
            await connections.itemsClient.db('tinglebot').admin().ping();
            return connections.items;
          } catch (pingError) {
            console.log("[connectionManager]: Items connection lost, reconnecting...");
            connections.itemsClient = null;
            connections.items = null;
          }
        }

        // If no client or connection failed, create a new one
        if (!connections.itemsClient) {
          const uri = dbConfig.inventories || dbConfig.tinglebot;

          if (!uri) {
            throw new Error('Missing MongoDB URI for items database');
          }

          logger.info('DATABASE', `Connecting to items database... (attempt ${retryCount + 1}/${maxRetries})`);
          connections.itemsClient = new MongoClient(uri, dbConfig.options);
          await connections.itemsClient.connect();
          connections.items = connections.itemsClient.db('tinglebot');

          logger.success('DATABASE', 'Items database connected');
          resetErrorCounter();
        }

        if (!connections.items) {
          throw new Error('Database connection failed - items database is null');
        }

        return connections.items;
      } catch (error) {
        retryCount++;
        console.error(`[connectionManager]: ❌ Error connecting to Items database (attempt ${retryCount}/${maxRetries}):`, error.message);

        connections.itemsClient = null;
        connections.items = null;

        if (retryCount >= maxRetries) {
          handleError(error, "connectionManager", context);
          console.error("[connectionManager]: Error details:", {
            name: error.name,
            code: error.code,
            stack: error.stack
          });
          throw error;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
  }

  // ------------------- closeAllConnections -------------------
  static async closeAllConnections() {
    try {
      if (connections.tinglebot && mongoose.connection.readyState === 1) {
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

      if (connections.inventoriesNativeClient) {
        await connections.inventoriesNativeClient.close();
        logger.info('DATABASE', 'Native inventories connection closed');
      }

      if (connections.itemsClient) {
        await connections.itemsClient.close();
        logger.info('DATABASE', 'Items connection closed');
      }
    } catch (error) {
      console.error("[connectionManager]: Error closing connections:", error.message);
    }
  }
}

// Cleanup on process exit
process.on('SIGINT', async () => {
  await DatabaseConnectionManager.closeAllConnections();
  process.exit(0);
});

module.exports = DatabaseConnectionManager;

