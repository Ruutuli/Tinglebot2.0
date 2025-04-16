// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { handleError } = require('../utils/globalErrorHandler');
const { connectToTinglebot } = require('../database/connection'); // Use your connection.js file

(async function cleanJobVoucherField() {
    try {
        // Connect to the Tinglebot database
        console.log('Connecting to Tinglebot database...');
        await connectToTinglebot();
        console.log('✅ Connected to the database.');

        // Define the Character model (use loose schema for flexibility)
        const Character = mongoose.model('Character', new mongoose.Schema({}, { strict: false, collection: 'characters' }));

        // Update documents where jobVoucher is an invalid string
        const result = await Character.updateMany(
            { jobVoucher: { $type: 'string' } },
            { $set: { jobVoucher: false } }
        );

        console.log(`✅ Updated ${result.modifiedCount} documents where jobVoucher was invalid.`);
    } catch (error) {
    handleError(error, 'cleanup.js');

        console.error('❌ Error during cleanup:', error.message);
    } finally {
        // Close the database connection
        mongoose.connection.close();
        console.log('🔌 Database connection closed.');
    }
})();
