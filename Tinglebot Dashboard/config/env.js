// ============================================================================
// ------------------- Environment Variable Configuration -------------------
// Centralized environment variable loading and validation
// ============================================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const logger = require('../utils/logger');

// ------------------- Environment Detection -------------------
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'true';
const isDevelopment = !isProduction;
const isLocalhost = process.env.FORCE_LOCALHOST === 'true' || 
                   process.env.NODE_ENV === 'development' ||
                   process.env.USE_LOCALHOST === 'true';

// ------------------- Required Environment Variables -------------------
const requiredVars = [
  'MONGODB_URI',
  'MONGODB_TINGLEBOT_URI',
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'SESSION_SECRET'
];

// ------------------- Optional Environment Variables with Defaults -------------------
const optionalVars = {
  PORT: 5001,
  NODE_ENV: 'development',
  DOMAIN: isProduction ? 'tinglebot.xyz' : 'localhost',
  ALLOWED_ORIGINS: null, // Will be set based on environment if not provided
  PROD_GUILD_ID: null,
  ADMIN_ROLE_ID: null,
  MONGODB_INVENTORIES_URI: null,
  MONGODB_VENDING_URI: null,
  GCP_BUCKET_NAME: 'tinglebot',
  DISCORD_CALLBACK_URL: null, // Will be constructed if not provided
  CONSOLE_LOG_CHANNEL: null,
  ITEMS_SPREADSHEET_ID: null
};

// ------------------- Function: validateEnvVars -------------------
// Validates that all required environment variables are set
function validateEnvVars() {
  const missing = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    const error = `Missing required environment variables: ${missing.join(', ')}`;
    logger.error(error, null, 'env.js');
    throw new Error(error);
  }
  
  logger.success('All required environment variables are set', 'env.js');
}

// ------------------- Function: getEnv -------------------
// Gets an environment variable with optional default
function getEnv(key, defaultValue = null) {
  return process.env[key] !== undefined ? process.env[key] : defaultValue;
}

// ------------------- Function: getRequiredEnv -------------------
// Gets a required environment variable, throws if missing
function getRequiredEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

// ------------------- Function: getBooleanEnv -------------------
// Gets a boolean environment variable
function getBooleanEnv(key, defaultValue = false) {
  const value = process.env[key];
  if (value === undefined || value === null) {
    return defaultValue;
  }
  return value === 'true' || value === '1' || value === 'yes';
}

// ------------------- Function: getNumberEnv -------------------
// Gets a number environment variable
function getNumberEnv(key, defaultValue = null) {
  const value = process.env[key];
  if (value === undefined || value === null) {
    return defaultValue;
  }
  const num = Number(value);
  if (isNaN(num)) {
    logger.warn(`Invalid number for ${key}, using default: ${defaultValue}`, 'env.js');
    return defaultValue;
  }
  return num;
}

// ------------------- Function: getArrayEnv -------------------
// Gets an array environment variable (comma-separated)
function getArrayEnv(key, defaultValue = []) {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

// ------------------- Constructed Values -------------------
function getDiscordCallbackUrl() {
  if (process.env.DISCORD_CALLBACK_URL) {
    return process.env.DISCORD_CALLBACK_URL;
  }
  
  const domain = getEnv('DOMAIN', isProduction ? 'tinglebot.xyz' : 'localhost');
  const port = isProduction ? '' : `:${getEnv('PORT', 5001)}`;
  const protocol = isProduction ? 'https' : 'http';
  
  return `${protocol}://${domain}${port}/auth/discord/callback`;
}

function getAllowedOrigins() {
  if (process.env.ALLOWED_ORIGINS) {
    return getArrayEnv('ALLOWED_ORIGINS');
  }
  
  if (isProduction) {
    return ['https://tinglebot.xyz', 'https://www.tinglebot.xyz'];
  }
  
  return ['http://localhost:5001', 'http://localhost:3000'];
}

// ------------------- Exported Configuration -------------------
// Use lazy getters for required env vars to avoid throwing errors at module load time
const env = {
  // Environment flags
  isProduction,
  isDevelopment,
  isLocalhost,
  
  // Core configuration
  port: getNumberEnv('PORT', 5001),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  domain: getEnv('DOMAIN', isProduction ? 'tinglebot.xyz' : 'localhost'),
  
  // Database - use getters for required vars to allow lazy loading
  get mongodbUri() {
    return getRequiredEnv('MONGODB_URI');
  },
  get mongodbTinglebotUri() {
    return getRequiredEnv('MONGODB_TINGLEBOT_URI');
  },
  mongodbInventoriesUri: getEnv('MONGODB_INVENTORIES_URI') || getEnv('MONGODB_INVENTORIES_URI_PROD'),
  mongodbVendingUri: getEnv('MONGODB_VENDING_URI') || getEnv('MONGODB_VENDING_URI_PROD'),
  
  // Discord - use getters for required vars
  get discordToken() {
    return getRequiredEnv('DISCORD_TOKEN');
  },
  get discordClientId() {
    return getRequiredEnv('DISCORD_CLIENT_ID');
  },
  get discordClientSecret() {
    return getRequiredEnv('DISCORD_CLIENT_SECRET');
  },
  discordCallbackUrl: getDiscordCallbackUrl(),
  prodGuildId: getEnv('PROD_GUILD_ID'),
  adminRoleId: getEnv('ADMIN_ROLE_ID'),
  
  // Session - use getter for required var
  get sessionSecret() {
    return getRequiredEnv('SESSION_SECRET');
  },
  
  // CORS
  allowedOrigins: getAllowedOrigins(),
  
  // Google Cloud
  gcpBucketName: getEnv('GCP_BUCKET_NAME', 'tinglebot'),
  
  // Other
  consoleLogChannel: getEnv('CONSOLE_LOG_CHANNEL'),
  itemsSpreadsheetId: getEnv('ITEMS_SPREADSHEET_ID')
};

// ------------------- Validate on Load -------------------
if (require.main === module) {
  // Only validate if this file is run directly
  try {
    validateEnvVars();
    logger.success('Environment configuration loaded successfully', 'env.js');
  } catch (error) {
    logger.error('Environment validation failed', error, 'env.js');
    process.exit(1);
  }
}

module.exports = {
  env,
  validateEnvVars,
  getEnv,
  getRequiredEnv,
  getBooleanEnv,
  getNumberEnv,
  getArrayEnv,
  isProduction,
  isDevelopment,
  isLocalhost
};

