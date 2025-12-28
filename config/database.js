const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file in project root
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const dbConfig = {
  tinglebot: process.env.MONGODB_TINGLEBOT_URI_PROD || process.env.MONGODB_URI,
  inventories: process.env.MONGODB_INVENTORIES_URI_PROD || process.env.MONGODB_URI,
  vending: process.env.MONGODB_VENDING_URI_PROD || process.env.MONGODB_URI
};

// Validate configuration
if (!dbConfig.tinglebot || !dbConfig.inventories || !dbConfig.vending) {
  throw new Error('Database configuration is incomplete');
}

module.exports = dbConfig; 