// sanitizeJobVouchers.js

// ------------------- Load environment variables -------------------
require('dotenv').config();

// ------------------- Standard Libraries -------------------
const mongoose = require('mongoose');

// ------------------- Database Connections -------------------
const { connectToTinglebot } = require('../database/connection');

// ------------------- Database Models -------------------
const Character = require('../models/CharacterModel');

// ============================================================================
// ------------------- Job Voucher Sanitization Script -------------------
// This script connects to the Tinglebot database and resets all job voucher data
// for every character. It is used to clean up job voucher flags and selections
// before a new season, feature update, or maintenance reset.
// ============================================================================

async function sanitizeJobVouchers() {
  try {
    // 1. Connect to the Tinglebot database
    await connectToTinglebot();
    console.log('✅ [sanitizeJobVouchers]: Connected to Tinglebot DB');

    // 2. Reset jobVoucher and jobVoucherJob for all characters
    const result = await Character.updateMany(
      {},
      {
        $set: {
          jobVoucher: false,
          jobVoucherJob: null
        }
      }
    );

    console.log(`🎫 [sanitizeJobVouchers]: Cleared job voucher data for ${result.modifiedCount} character(s)`);

    // 3. Exit
    console.log('🚀 [sanitizeJobVouchers]: Job voucher sanitization complete. Exiting.');
    process.exit(0);
  } catch (err) {
    console.error('❌ [sanitizeJobVouchers]: Sanitization failed:', err);
    process.exit(1);
  }
}

sanitizeJobVouchers();
