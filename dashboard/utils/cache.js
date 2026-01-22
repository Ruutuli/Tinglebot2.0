// ============================================================================
// ------------------- Cache Management Utility -------------------
// LRU-like cache implementation with automatic expiration
// ============================================================================

const logger = require('./logger');

// Check if we're in production
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'true';

// Memory monitor (optional - won't break if not initialized)
let memoryMonitor = null;
try {
  const { getMemoryMonitor } = require('./memoryMonitor');
  memoryMonitor = getMemoryMonitor();
} catch (err) {
  // Memory monitor not available, continue without it
}

// ------------------- Cache Entry Class -------------------
class CacheEntry {
  constructor(data, ttl) {
    this.data = data;
    this.createdAt = Date.now();
    this.ttl = ttl; // Time to live in milliseconds
    this.accessCount = 0;
    this.lastAccessed = Date.now();
  }

  isExpired() {
    return Date.now() - this.createdAt > this.ttl;
  }

  touch() {
    this.accessCount++;
    this.lastAccessed = Date.now();
  }
}

// ------------------- Cache Class -------------------
class Cache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000; // Maximum number of entries
    this.defaultTTL = options.defaultTTL || 30 * 60 * 1000; // 30 minutes default
    this.store = new Map();
    this.cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 5 minutes
    this.cacheName = options.name || 'unnamed'; // Cache name for tracking
    
    // Start cleanup interval
    this.startCleanup();
    
    // Register cache size with memory monitor
    if (memoryMonitor) {
      memoryMonitor.trackCache(this.cacheName, this.store.size);
    }
  }

  // ------------------- Function: get -------------------
  // Gets a value from cache
  get(key) {
    const entry = this.store.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (entry.isExpired()) {
      this.store.delete(key);
      return null;
    }
    
    entry.touch();
    return entry.data;
  }

  // ------------------- Function: set -------------------
  // Sets a value in cache
  set(key, value, ttl = null) {
    // If cache is full, remove least recently used entry
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictLRU();
    }
    
    const entryTTL = ttl || this.defaultTTL;
    this.store.set(key, new CacheEntry(value, entryTTL));
    
    // Update memory monitor with cache size
    if (memoryMonitor && this.cacheName) {
      memoryMonitor.trackCache(this.cacheName, this.store.size);
    }
  }

  // ------------------- Function: has -------------------
  // Checks if a key exists in cache
  has(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }
    
    if (entry.isExpired()) {
      this.store.delete(key);
      return false;
    }
    
    return true;
  }

  // ------------------- Function: delete -------------------
  // Deletes a key from cache
  delete(key) {
    return this.store.delete(key);
  }

  // ------------------- Function: clear -------------------
  // Clears all entries from cache
  clear() {
    this.store.clear();
  }

  // ------------------- Function: evictLRU -------------------
  // Evicts the least recently used entry
  evictLRU() {
    let lruKey = null;
    let lruTime = Infinity;
    
    for (const [key, entry] of this.store.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      this.store.delete(lruKey);
    }
  }

  // ------------------- Function: cleanup -------------------
  // Removes expired entries
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.store.entries()) {
      if (entry.isExpired()) {
        this.store.delete(key);
        cleaned++;
      }
    }
    
    // Update memory monitor with cache size
    if (memoryMonitor && this.cacheName) {
      memoryMonitor.trackCache(this.cacheName, this.store.size);
    }
    
    // Don't log cache cleanup in production
    if (cleaned > 0 && !isProduction) {
      logger.debug(`Cache cleanup: removed ${cleaned} expired entries`, null, 'cache.js');
    }
  }

  // ------------------- Function: startCleanup -------------------
  // Starts automatic cleanup interval
  startCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  // ------------------- Function: stopCleanup -------------------
  // Stops automatic cleanup interval
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ------------------- Function: getStats -------------------
  // Returns cache statistics
  getStats() {
    const now = Date.now();
    let expired = 0;
    let totalAccess = 0;
    
    for (const entry of this.store.values()) {
      if (entry.isExpired()) {
        expired++;
      }
      totalAccess += entry.accessCount;
    }
    
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      expired,
      totalAccess,
      hitRate: this.store.size > 0 ? totalAccess / this.store.size : 0
    };
  }
}

// ------------------- Create Cache Instances -------------------
const inventoryCache = new Cache({
  name: 'inventoryCache',
  maxSize: 500,
  defaultTTL: 30 * 60 * 1000, // 30 minutes
  cleanupInterval: 5 * 60 * 1000 // 5 minutes
});

const characterListCache = new Cache({
  name: 'characterListCache',
  maxSize: 10,
  defaultTTL: 10 * 60 * 1000, // 10 minutes
  cleanupInterval: 5 * 60 * 1000
});

const characterDataCache = new Cache({
  name: 'characterDataCache',
  maxSize: 100,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  cleanupInterval: 5 * 60 * 1000
});

const spiritOrbCache = new Cache({
  name: 'spiritOrbCache',
  maxSize: 200,
  defaultTTL: 10 * 60 * 1000, // 10 minutes
  cleanupInterval: 5 * 60 * 1000
});

module.exports = {
  Cache,
  inventoryCache,
  characterListCache,
  characterDataCache,
  spiritOrbCache
};






