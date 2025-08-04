// ------------------- resetRhifuBlight.js -------------------
// This script resets Rhifu's blight stage back to 1 for testing/debugging purposes.
// It updates the character's blightStage, lastRollDate, and blightedAt fields.

// ============================================================================
// Standard Libraries & Third-Party Modules
// ------------------- Importing third-party modules -------------------
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

const { handleError } = require('../utils/globalErrorHandler');

// ============================================================================
// Local Modules
// ------------------- Importing custom modules -------------------
const Character = require('../models/CharacterModel');
const { connectToTinglebot, connectToInventories } = require('../database/db');

// ============================================================================
// Reset Functions
// ------------------- resetRhifuBlight -------------------
// Resets Rhifu's blight stage back to 1 and clears roll history
async function resetRhifuBlight() {
  try {
    console.log('🔄 Starting Rhifu blight reset...');
    
    // Connect to databases
    await connectToTinglebot();
    await connectToInventories();
    console.log('✅ Connected to databases');
    
    // Find Rhifu's character
    const rhifu = await Character.findOne({ name: 'Rhifu' });
    
    if (!rhifu) {
      console.log('❌ Rhifu not found in database');
      return;
    }
    
    console.log(`📊 Current Rhifu status:`);
    console.log(`   - Blight Stage: ${rhifu.blightStage}`);
    console.log(`   - Last Roll Date: ${rhifu.lastRollDate}`);
    console.log(`   - Blighted At: ${rhifu.blightedAt}`);
    console.log(`   - Blighted: ${rhifu.blighted}`);
    
    // Reset blight stage to 1
    rhifu.blightStage = 1;
    
    // Clear last roll date to allow immediate rolling
    rhifu.lastRollDate = null;
    
    // Keep blightedAt as is (when they first got blighted)
    // Keep blighted: true (they're still blighted, just back to stage 1)
    
    // Save the changes
    await rhifu.save();
    
    console.log('✅ Rhifu blight reset completed:');
    console.log(`   - New Blight Stage: ${rhifu.blightStage}`);
    console.log(`   - Last Roll Date: ${rhifu.lastRollDate}`);
    console.log(`   - Blighted: ${rhifu.blighted}`);
    console.log(`   - Can now roll immediately`);
    
  } catch (error) {
    console.error('❌ Error resetting Rhifu blight:', error);
    handleError(error, 'resetRhifuBlight');
  }
}

// ============================================================================
// Main Execution
// ------------------- Script execution -------------------
if (require.main === module) {
  console.log('🚀 Starting Rhifu blight reset script...');
  console.log('📁 Current directory:', process.cwd());
  console.log('🔧 Environment:', process.env.NODE_ENV || 'development');
  
  resetRhifuBlight()
    .then(() => {
      console.log('🎉 Rhifu blight reset script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

// ============================================================================
// Module Exports
// ------------------- Exporting functions -------------------
module.exports = {
  resetRhifuBlight
}; 