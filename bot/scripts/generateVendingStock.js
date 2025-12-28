// ------------------- generateVendingStock.js -------------------
// Script to generate vending stock for the current month

// ============================================================================
// Environment Configuration
// ------------------- Load environment variables first -------------------
const path = require('path');
const dotenv = require('dotenv');
// Load .env from project root (parent directory of scripts folder)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ============================================================================
// Local Modules
// ------------------- Importing database functions -------------------
const { generateVendingStockList } = require('../../database/db');
const logger = require('../../utils/logger');

// ============================================================================
// Main Function
// ------------------- Generate vending stock -------------------
async function main() {
  try {
    logger.info('VENDING_STOCK', '🔄 Generating vending stock for this month...');
    
    await generateVendingStockList();
    
    logger.success('VENDING_STOCK', '✅ Vending stock generated successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('VENDING_STOCK', '❌ Error generating vending stock:', error);
    console.error('Error details:', error);
    process.exit(1);
  }
}

main();

