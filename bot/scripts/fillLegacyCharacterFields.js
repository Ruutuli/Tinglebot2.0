// ============================================================================
// ------------------- Fill Legacy Character Fields Script -------------------
// Seeds existing character documents with "TBA" for empty biography fields
// (virtue, gender, personality, history, extras). Run once for legacy data.
// ============================================================================

const path = require('path');
const dotenv = require('dotenv');

const env = process.env.NODE_ENV || 'development';
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const envSpecificPath = path.resolve(__dirname, '..', '..', `.env.${env}`);
if (require('fs').existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath });
} else {
  dotenv.config({ path: rootEnvPath });
}

const DatabaseConnectionManager = require('../database/connectionManager');
const logger = require('../utils/logger');

const TBA = 'TBA';

async function fillLegacyCharacterFields() {
  try {
    logger.info('SCRIPT', 'Connecting to database...');
    await DatabaseConnectionManager.initialize();
    logger.info('SCRIPT', 'Database connected');

    const mongooseConnection = DatabaseConnectionManager.getTinglebotConnection();
    if (!mongooseConnection || mongooseConnection.readyState !== 1) {
      logger.error('SCRIPT', 'MongoDB connection not ready');
      process.exit(1);
    }

    const charactersCollection = mongooseConnection.db.collection('characters');

    const fields = [
      { key: 'virtue', query: { $or: [{ virtue: '' }, { virtue: null }, { virtue: { $exists: false } }] } },
      { key: 'gender', query: { $or: [{ gender: '' }, { gender: null }, { gender: { $exists: false } }] } },
      { key: 'personality', query: { $or: [{ personality: '' }, { personality: null }, { personality: { $exists: false } }] } },
      { key: 'history', query: { $or: [{ history: '' }, { history: null }, { history: { $exists: false } }] } },
      { key: 'extras', query: { $or: [{ extras: '' }, { extras: null }, { extras: { $exists: false } }] } },
    ];

    let totalUpdated = 0;

    for (const { key, query } of fields) {
      const result = await charactersCollection.updateMany(query, { $set: { [key]: TBA } });
      if (result.modifiedCount > 0) {
        logger.info('SCRIPT', `Set ${key}=TBA for ${result.modifiedCount} character(s)`);
        totalUpdated += result.modifiedCount;
      }
    }

    if (totalUpdated === 0) {
      logger.info('SCRIPT', 'No legacy characters needed updates.');
    } else {
      logger.success('SCRIPT', `Seeded ${totalUpdated} field update(s) with TBA.`);
    }

    process.exit(0);
  } catch (error) {
    logger.error('SCRIPT', 'Error filling legacy character fields:', error);
    console.error(error);
    process.exit(1);
  }
}

fillLegacyCharacterFields();
