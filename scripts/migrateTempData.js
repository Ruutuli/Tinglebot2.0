require('dotenv').config();
const { runMigrations, cleanupOldEntries } = require('../utils/tempDataMigration');

async function main() {
  try {
    console.log('🔄 Starting temporary data migration process...');
    
    // Run migrations
    await runMigrations();
    
    // Cleanup entries older than 24 hours
    await cleanupOldEntries();
    
    console.log('✅ Migration and cleanup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main(); 