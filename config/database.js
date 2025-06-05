const path = require('path');
const dotenv = require('dotenv');

// Determine environment - use NODE_ENV or default to development
const env = process.env.NODE_ENV || 'development';

// Try to load environment variables from .env file first
try {
  dotenv.config({ path: `.env.${env}` });
} catch (error) {
  console.log(`No .env.${env} file found, using environment variables directly`);
}

const dbConfig = {
  development: {
    tinglebot: process.env.MONGODB_TINGLEBOT_URI_DEV,
    inventories: process.env.MONGODB_INVENTORIES_URI_DEV,
    vending: process.env.MONGODB_VENDING_URI_DEV
  },
  production: {
    tinglebot: process.env.MONGODB_TINGLEBOT_URI_PROD,
    inventories: process.env.MONGODB_INVENTORIES_URI_PROD,
    vending: process.env.MONGODB_VENDING_URI_PROD
  }
};

// Validate configuration
const config = dbConfig[env];
if (!config.tinglebot || !config.inventories || !config.vending) {
  console.error('Missing required MongoDB URIs in environment variables');
  console.error('Current environment:', env);
  console.error('Available environment variables:', Object.keys(process.env));
  console.error('Development config:', {
    tinglebot: !!process.env.MONGODB_TINGLEBOT_URI_DEV,
    inventories: !!process.env.MONGODB_INVENTORIES_URI_DEV,
    vending: !!process.env.MONGODB_VENDING_URI_DEV
  });
  console.error('Production config:', {
    tinglebot: !!process.env.MONGODB_TINGLEBOT_URI_PROD,
    inventories: !!process.env.MONGODB_INVENTORIES_URI_PROD,
    vending: !!process.env.MONGODB_VENDING_URI_PROD
  });
  throw new Error('Database configuration is incomplete');
}

console.log(`[Database Config] Using ${env} environment configuration`);
module.exports = config; 