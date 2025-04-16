const { handleError } = require('../utils/globalErrorHandler');

// ------------------- Import necessary modules -------------------
const { connectToTinglebot } = require('../database/connection'); // Adjust path to `connection.js`
const User = require('../models/UserModel'); // Adjust path to `UserModel.js`

// ------------------- Fix Slots Script -------------------
async function fixSlots() {
    try {
        // Connect to the Tinglebot database
        await connectToTinglebot();
        console.log('[fixSlots.js]: Connected to the Tinglebot database.');

        // Update all users to have 2 character slots
        const result = await User.updateMany({}, { $set: { characterSlot: 2 } });
        console.log(`[fixSlots.js]: Successfully updated ${result.nModified} users to have 2 character slots.`);
    } catch (error) {
    handleError(error, 'fixSlots.js');

        console.error('[fixSlots.js]: Error updating character slots:', error);
    } finally {
        // Close the database connection
        process.exit(0); // Exit the script gracefully
    }
}

// ------------------- Execute the script -------------------
fixSlots();
