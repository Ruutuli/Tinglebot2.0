// ============================================================================
// ------------------- Database Connection Utilities -------------------
// ============================================================================
//
// ------------------- Database Connection ------------------
// MongoDB connection management with connection pooling and caching -

import mongoose from "mongoose";
import { logger } from "@/utils/logger";

// ============================================================================
// ------------------- Constants & Configuration -------------------
// ============================================================================

// ------------------- getMongoUri ------------------
// Retrieves MongoDB URI. Prefer MONGODB_TINGLEBOT_URI so Party + exploringMap (Square) data
// come from the same DB as the bot; fall back to MONGODB_URI.
function getMongoUri(): string {
  const uri =
    process.env.MONGODB_TINGLEBOT_URI ||
    process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "[db.ts]❌ Set MONGODB_TINGLEBOT_URI or MONGODB_URI in your .env (same DB as the bot for exploring map + parties)."
    );
  }
  return uri;
}

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

type InventoriesConnectionCache = {
  conn: mongoose.Connection | null;
  promise: Promise<mongoose.Connection> | null;
};

type VendingConnectionCache = {
  conn: mongoose.Connection | null;
  promise: Promise<mongoose.Connection> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __mongoose: MongooseCache | undefined;
  // eslint-disable-next-line no-var
  var __inventoriesConnection: InventoriesConnectionCache | undefined;
  // eslint-disable-next-line no-var
  var __vendingConnection: VendingConnectionCache | undefined;
}

// ============================================================================
// ------------------- Connection Caching -------------------
// ============================================================================

const cached: MongooseCache = globalThis.__mongoose ?? { conn: null, promise: null };
if (process.env.NODE_ENV !== "production") {
  globalThis.__mongoose = cached;
}

const cachedInventories: InventoriesConnectionCache = globalThis.__inventoriesConnection ?? { conn: null, promise: null };
if (process.env.NODE_ENV !== "production") {
  globalThis.__inventoriesConnection = cachedInventories;
}

const cachedVending: VendingConnectionCache = globalThis.__vendingConnection ?? { conn: null, promise: null };
if (process.env.NODE_ENV !== "production") {
  globalThis.__vendingConnection = cachedVending;
}

// ============================================================================
// ------------------- Connection Functions -------------------
// ============================================================================

// ------------------- connect ------------------
// Establishes and caches MongoDB connection -

export async function connect(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }
  if (!cached.promise) {
    cached.promise = mongoose.connect(getMongoUri(), {
      maxPoolSize: 50,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// ------------------- getInventoriesConnection ------------------
// Get a cached connection to the inventories database.
// Reuses the same connection to avoid SSL handshake issues and reduce overhead.
// Automatically recreates connection on SSL errors or connection failures -

export async function getInventoriesConnection(): Promise<mongoose.Connection> {
  // Check if connection exists and is healthy
  if (cachedInventories.conn) {
    const readyState = cachedInventories.conn.readyState;
    // 1 = connected, 2 = connecting, 0 = disconnected, 99 = uninitialized
    if (readyState === 1) {
      return cachedInventories.conn;
    }
    // If connection is in a bad state, reset it
    if (readyState === 0 || readyState === 99) {
      cachedInventories.conn = null;
      cachedInventories.promise = null;
    }
  }

  if (!cachedInventories.promise) {
    cachedInventories.promise = (async () => {
      const mongoUri = getMongoUri();
      const connection = mongoose.createConnection(mongoUri, {
        maxPoolSize: 20,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      
      // Add error handlers to detect connection issues
      connection.on("error", (err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        const errorMessage = error.message;
        
        // If it's an SSL error or connection error, reset the cached connection
        if (
          errorMessage.includes("SSL") ||
          errorMessage.includes("tlsv1") ||
          errorMessage.includes("ECONNRESET") ||
          errorMessage.includes("connection")
        ) {
          logger.error("lib/db", `Connection error detected, resetting cache: ${errorMessage}`);
          cachedInventories.conn = null;
          cachedInventories.promise = null;
        }
      });

      connection.on("disconnected", () => {
        logger.warn("lib/db", "Connection disconnected, resetting cache");
        cachedInventories.conn = null;
        cachedInventories.promise = null;
      });
      
      await connection.asPromise();
      return connection;
    })();
  }

  try {
    cachedInventories.conn = await cachedInventories.promise;
    return cachedInventories.conn;
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    
    // Reset promise on error so we can retry
    cachedInventories.promise = null;
    cachedInventories.conn = null;
    
    logger.error("lib/db", `Failed to get inventories connection: ${error.message}`);
    throw error;
  }
}

// ------------------- getInventoriesDb ------------------
// Get the inventories database instance.
// Handles SSL errors by recreating the connection if needed -

export async function getInventoriesDb() {
  try {
    const connection = await getInventoriesConnection();
    const inventoriesDb = connection.useDb("inventories");
    const db = inventoriesDb.db;
    
    if (!db) {
      throw new Error("[db.ts]❌ Failed to access inventories database");
    }
    
    return db;
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const errorMessage = error.message;
    
    // If it's an SSL error, reset the connection and retry once
    if (
      errorMessage.includes("SSL") ||
      errorMessage.includes("tlsv1") ||
      errorMessage.includes("ECONNRESET")
    ) {
      logger.warn("lib/db", `SSL/connection error detected, retrying: ${errorMessage}`);
      
      // Reset the cached connection
      cachedInventories.conn = null;
      cachedInventories.promise = null;
      
      // Retry once
      const connection = await getInventoriesConnection();
      const inventoriesDb = connection.useDb("inventories");
      const db = inventoriesDb.db;
      
      if (!db) {
        throw new Error("[db.ts]❌ Failed to access inventories database after retry");
      }
      
      return db;
    }
    
    logger.error("lib/db", `Failed to get inventories database: ${errorMessage}`);
    throw error;
  }
}

// ------------------- connectToVending ------------------
// Get a cached connection for vending models.
// Reuses the same connection to avoid SSL handshake issues and reduce overhead.
// Automatically recreates connection on SSL errors or connection failures -

export async function connectToVending(): Promise<mongoose.Connection> {
  // Check if connection exists and is healthy
  if (cachedVending.conn) {
    const readyState = cachedVending.conn.readyState;
    // 1 = connected, 2 = connecting, 0 = disconnected, 99 = uninitialized
    if (readyState === 1) {
      return cachedVending.conn;
    }
    // If connection is in a bad state, reset it
    if (readyState === 0 || readyState === 99) {
      cachedVending.conn = null;
      cachedVending.promise = null;
    }
  }

  if (!cachedVending.promise) {
    cachedVending.promise = (async () => {
      const mongoUri = getMongoUri();
      const connection = mongoose.createConnection(mongoUri, {
        maxPoolSize: 20,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      
      // Add error handlers to detect connection issues
      connection.on("error", (err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        const errorMessage = error.message;
        
        // If it's an SSL error or connection error, reset the cached connection
        if (
          errorMessage.includes("SSL") ||
          errorMessage.includes("tlsv1") ||
          errorMessage.includes("ECONNRESET") ||
          errorMessage.includes("connection")
        ) {
          logger.error("lib/db", `Vending connection error detected, resetting cache: ${errorMessage}`);
          cachedVending.conn = null;
          cachedVending.promise = null;
        }
      });

      connection.on("disconnected", () => {
        logger.warn("lib/db", "Vending connection disconnected, resetting cache");
        cachedVending.conn = null;
        cachedVending.promise = null;
      });
      
      await connection.asPromise();
      return connection;
    })();
  }

  try {
    cachedVending.conn = await cachedVending.promise;
    return cachedVending.conn;
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    
    // Reset promise on error so we can retry
    cachedVending.promise = null;
    cachedVending.conn = null;
    
    logger.error("lib/db", `Failed to get vending connection: ${error.message}`);
    throw error;
  }
}
