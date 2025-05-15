const mongoose = require('mongoose');
const Character = require('../models/CharacterModel');
require('dotenv').config(); // Add this to load .env file

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_TINGLEBOT_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Successfully connected to MongoDB.');
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

async function resetCharacterFields() {
    try {
        // First, let's check how many characters exist
        const totalCharacters = await Character.countDocuments();
        console.log(`Total characters in database: ${totalCharacters}`);

        if (totalCharacters === 0) {
            console.log('No characters found in the database. Please check your database connection and collection name.');
            return;
        }

        // Update all characters to reset testing-related fields
        const result = await Character.updateMany(
            {}, // Match all documents
            {
                $set: {
                    // Reset jail-related fields
                    inJail: false,
                    jailReleaseTime: null,
                    
                    // Reset job-related fields
                    jobVoucher: false,
                    jobVoucherJob: null,
                    jobDateChanged: null,
                    
                    // Reset debuff fields
                    'debuff.active': false,
                    'debuff.endDate': null,
                    
                    // Reset daily roll tracking
                    dailyRoll: new Map(),
                    
                    // Reset other testing-related fields
                    failedStealAttempts: 0,
                    failedFleeAttempts: 0,
                    canBeStolenFrom: true,
                    lastRollDate: null,

                }
            }
        );

        console.log(`Successfully reset fields for ${result.modifiedCount} characters`);
        console.log('Reset fields include:');
        console.log('- Jail status and release time');
        console.log('- Job voucher and related fields');
        console.log('- Debuff status');
        console.log('- Daily roll tracking');
        console.log('- Failed attempts counters');
        console.log('- Other testing-related fields');

    } catch (error) {
        console.error('Error resetting character fields:', error);
    } finally {
        // Close the database connection
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

// Run the reset function
resetCharacterFields(); 