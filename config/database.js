const path = require('path');
const dotenv = require('dotenv');

// Determine environment - use NODE_ENV or default to development
const env = process.env.NODE_ENV || 'development';
console.log(`[database.js]: 🔄 Using ${env} environment`);

// Try to load environment variables from .env file first
try {
  dotenv.config({ path: `.env.${env}` });
  console.log(`[database.js]: ✅ Loaded environment from .env.${env}`);
} catch (error) {
  console.log(`[database.js]: ⚠️ No .env.${env} file found, using environment variables directly`);
}

// Helper function to get MongoDB URI with fallbacks
const getMongoUri = (env, type) => {
  const devUri = process.env[`MONGODB_${type}_URI_DEV`];
  const prodUri = process.env[`MONGODB_${type}_URI_PROD`];
  const fallbackUri = process.env.MONGODB_URI;

  console.log(`[database.js]: 📝 Getting MongoDB URI for ${type} in ${env} mode`);
  console.log(`[database.js]: 🔍 Available URIs:`, {
    devUri: devUri ? '✅ Set' : '❌ Not set',
    prodUri: prodUri ? '✅ Set' : '❌ Not set',
    fallbackUri: fallbackUri ? '✅ Set' : '❌ Not set'
  });

  if (env === 'development') {
    if (!devUri) {
      console.error(`[database.js]: ❌ Missing MONGODB_${type}_URI_DEV for development environment`);
      throw new Error(`Missing MONGODB_${type}_URI_DEV for development environment`);
    }
    return devUri;
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
  console.error('[database.js]: ❌ Missing required MongoDB URIs in environment variables');
  console.error('[database.js]: 📝 Current environment:', env);
  console.error('[database.js]: 📝 Available environment variables:', Object.keys(process.env));
  console.error('[database.js]: 📝 Development config:', {
    tinglebot: !!process.env.MONGODB_TINGLEBOT_URI_DEV,
    inventories: !!process.env.MONGODB_INVENTORIES_URI_DEV,
    vending: !!process.env.MONGODB_VENDING_URI_DEV
  });
  console.error('[database.js]: 📝 Production config:', {
    tinglebot: !!process.env.MONGODB_TINGLEBOT_URI_PROD,
    inventories: !!process.env.MONGODB_INVENTORIES_URI_PROD,
    vending: !!process.env.MONGODB_VENDING_URI_PROD
  });
  console.error('[database.js]: 📝 Fallback URI available:', !!process.env.MONGODB_URI);
  throw new Error('Database configuration is incomplete');
}

console.log(`[database.js]: ✅ Using ${env} environment configuration`);
console.log(`[database.js]: 📝 Database URIs:`, {
  tinglebot: config.tinglebot ? '✅ Set' : '❌ Not set',
  inventories: config.inventories ? '✅ Set' : '❌ Not set',
  vending: config.vending ? '✅ Set' : '❌ Not set'
});

module.exports = config; 