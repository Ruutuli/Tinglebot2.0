// Script to manually trigger the weather reminder job
// Use this to test if the weather reminder function works

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const env = process.env.NODE_ENV || 'development';
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const envSpecificPath = path.resolve(__dirname, '..', '..', `.env.${env}`);
if (require('fs').existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath });
} else {
  dotenv.config({ path: rootEnvPath });
}

const DatabaseConnectionManager = require('../database/connectionManager');
const { postWeatherReminder } = require('../scheduler/scheduler');
const logger = require('../utils/logger');

async function triggerWeatherReminder() {
  try {
    logger.info('SCRIPT', 'Connecting to database...');
    
    // Initialize database connection
    await DatabaseConnectionManager.initialize();
    logger.info('SCRIPT', 'Database connected');
    
    // Create a mock client for testing
    // Note: This won't actually post to Discord, but will test the function
    const mockClient = {
      user: { id: 'system' },
      channels: { 
        cache: new Map(),
        fetch: async (id) => {
          logger.warn('SCRIPT', `Mock client - cannot fetch channel ${id}`);
          return null;
        }
      },
      guilds: { cache: new Map() },
      isReady: () => true
    };
    
    logger.info('SCRIPT', '\n⏰ Triggering weather reminder...');
    logger.info('SCRIPT', 'Note: This uses a mock client, so it may not post to Discord.');
    logger.info('SCRIPT', 'Check your bot logs to see if the function executes properly.\n');
    
    // Try to call the function
    try {
      await postWeatherReminder(mockClient);
      logger.success('SCRIPT', '✅ Weather reminder function executed (may have failed due to mock client)');
    } catch (error) {
      logger.error('SCRIPT', `❌ Weather reminder function failed: ${error.message}`);
      logger.info('SCRIPT', 'This might be expected with a mock client.');
      logger.info('SCRIPT', 'Check if the error is related to Discord client or weather data.');
    }
    
    logger.info('SCRIPT', '\n✅ Script completed!');
    logger.info('SCRIPT', 'If you want to test with a real client, run this from within the bot.');
    
    process.exit(0);
    
  } catch (error) {
    logger.error('SCRIPT', 'Error triggering weather reminder:', error);
    console.error(error);
    process.exit(1);
  }
}

// Run the trigger
triggerWeatherReminder();
