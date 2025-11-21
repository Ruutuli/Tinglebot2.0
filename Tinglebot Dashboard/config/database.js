const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Helper function to get MongoDB URI
const getMongoUri = (type) => {
  return process.env[`MONGODB_${type}_URI_PROD`] || process.env.MONGODB_URI;
};

const dbConfig = {
  tinglebot: getMongoUri('TINGLEBOT'),
  inventories: getMongoUri('INVENTORIES'),
  vending: getMongoUri('VENDING')
};

// Validate configuration
if (!dbConfig.tinglebot || !dbConfig.inventories || !dbConfig.vending) {
  throw new Error('Database configuration is incomplete');
}

module.exports = dbConfig; 