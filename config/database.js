const path = require('path');
const dotenv = require('dotenv');

// Determine environment - use NODE_ENV or default to development
const env = process.env.NODE_ENV || 'development';

// Try to load environment variables from .env file first
try {
  dotenv.config({ path: `.env.${env}` });
} catch (error) {
  // Silent fail if .env file not found
}

// Helper function to get MongoDB URI with fallbacks
const getMongoUri = (env, type) => {
  const devUri = process.env[`MONGODB_${type}_URI_DEV`];
  const prodUri = process.env[`MONGODB_${type}_URI_PROD`];
  const fallbackUri = process.env.MONGODB_URI;

  if (env === 'development') {
    return devUri || fallbackUri;
  } else {
    return prodUri || fallbackUri;
  }
};

const dbConfig = {
  development: {
    tinglebot: getMongoUri('development', 'TINGLEBOT'),
    inventories: getMongoUri('development', 'INVENTORIES'),
    vending: getMongoUri('development', 'VENDING')
  },
  production: {
    tinglebot: getMongoUri('production', 'TINGLEBOT'),
    inventories: getMongoUri('production', 'INVENTORIES'),
    vending: getMongoUri('production', 'VENDING')
  }
};

// Validate configuration
const config = dbConfig[env];
if (!config.tinglebot || !config.inventories || !config.vending) {
  throw new Error('Database configuration is incomplete');
}

module.exports = config; 