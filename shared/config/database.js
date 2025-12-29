const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

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

module.exports = dbConfig; 