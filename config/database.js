const path = require('path');
const dotenv = require('dotenv');
const env = process.env.NODE_ENV || 'development';

// Load environment variables
dotenv.config({ path: `.env.${env}` });

// Validate required environment variables
const requiredEnvVars = [
  'MONGODB_TINGLEBOT_URI_DEV',
  'MONGODB_INVENTORIES_URI_DEV',
  'MONGODB_VENDING_URI_DEV',
  'MONGODB_TINGLEBOT_URI_PROD',
  'MONGODB_INVENTORIES_URI_PROD',
  'MONGODB_VENDING_URI_PROD'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
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

// Validate the configuration
const config = dbConfig[env];
if (!config.tinglebot || !config.inventories || !config.vending) {
  console.error(`❌ Invalid database configuration for environment: ${env}`);
  process.exit(1);
}

module.exports = config; 