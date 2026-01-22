// ============================================================================
// ------------------- Database Configuration -------------------
// Purpose: Centralized database configuration module
// - Loads MongoDB connection URIs from environment variables
// - Provides standardized connection options for all databases
// - Configures retry strategies and health monitoring settings
// - Optimized for both local development and Railway deployment
// Used by: connectionManager.js, db.js, retryStrategy.js, healthMonitor.js
// ============================================================================

const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// Load environment variables - try root .env first, then dashboard/.env as fallback
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const dashboardEnvPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(dashboardEnvPath)) {
  dotenv.config({ path: dashboardEnvPath });
}

// Helper function to get MongoDB URI
// Checks multiple environment variable name patterns for flexibility
const getMongoUri = (type) => {
  // Try production-specific variable first, then generic, then fallback
  let uri = process.env[`MONGODB_${type}_URI_PROD`] 
      || process.env[`MONGODB_${type}_URI`]
      || process.env.MONGODB_URI;
  
  // Fallback for vending database
  if (!uri && type === 'VENDING') {
    uri = 'mongodb://tinglebot.4cmc11t.mongodb.net/tinglebot';
  }
  
  return uri || null;
};

const dbConfig = {
  tinglebot: getMongoUri('TINGLEBOT'),
  inventories: getMongoUri('INVENTORIES'),
  vending: getMongoUri('VENDING')
};

// ============================================================================
// ------------------- Standardized Connection Options -------------------
// Modern MongoDB 6.x driver options with optimal pooling and retry settings
// ============================================================================

// Determine environment (dev/prod)
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT;
const isRailway = !!process.env.RAILWAY_ENVIRONMENT;

// Standardized connection options for all MongoDB connections
const connectionOptions = {
  // Connection pool settings
  maxPoolSize: isRailway ? 15 : 20,              // Railway: 15, Local: 20
  minPoolSize: isRailway ? 1 : 2,                // Railway: 1, Local: 2
  maxIdleTimeMS: isRailway ? 20000 : 30000,      // Railway: 20s, Local: 30s
  
  // Timeout settings
  serverSelectionTimeoutMS: isRailway ? 10000 : 15000,  // Railway: 10s, Local: 15s
  connectTimeoutMS: isRailway ? 10000 : 15000,         // Railway: 10s, Local: 15s
  socketTimeoutMS: isRailway ? 30000 : 45000,           // Railway: 30s, Local: 45s
  
  // Retry settings
  retryWrites: true,
  retryReads: true,
  
  // Heartbeat settings
  heartbeatFrequencyMS: isRailway ? 5000 : 10000,   // Railway: 5s, Local: 10s
  
  // Compression (if supported by server)
  compressors: ['zlib'],
  
  // Additional options for production
  ...(isProduction && {
    // Production-specific optimizations
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  })
};

// Retry strategy configuration
const retryConfig = {
  maxRetries: 3,
  initialDelay: 1000,           // 1 second initial delay
  maxDelay: 10000,             // 10 seconds max delay
  backoffMultiplier: 2,        // Exponential backoff
  jitter: true                  // Add random jitter to prevent thundering herd
};

// Health monitoring configuration
const healthConfig = {
  checkInterval: 30000,         // Check health every 30 seconds
  pingTimeout: 5000,            // 5 second timeout for ping
  failureThreshold: 3,          // 3 consecutive failures before alerting
  alertCooldown: 300000         // 5 minutes between alerts
};

// Validate configuration - only require tinglebot, others are optional
// Don't throw error at module load - let connection functions handle missing URIs
if (!dbConfig.tinglebot) {
  console.error('Warning: Database configuration is incomplete. Tinglebot database URI not found.');
  console.error('Please set one of: MONGODB_TINGLEBOT_URI_PROD, MONGODB_TINGLEBOT_URI, or MONGODB_URI');
  // Don't throw - allow server to start and handle connection errors gracefully
}

// Warn about missing optional databases but don't fail
if (!dbConfig.inventories) {
  console.warn('Warning: MONGODB_INVENTORIES_URI_PROD not set. Inventories database features will be unavailable.');
}

if (!dbConfig.vending) {
  console.warn('Warning: MONGODB_VENDING_URI_PROD not set. Vending database features will be unavailable.');
}

module.exports = {
  ...dbConfig,
  options: connectionOptions,
  retryConfig,
  healthConfig,
  isProduction
}; 