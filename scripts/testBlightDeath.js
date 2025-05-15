const mongoose = require('mongoose');
const Character = require('../models/CharacterModel');
require('dotenv').config();

async function setBlightStage5() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Set death deadline to today
        const today = new Date();
        today.setHours(23, 59, 59, 999); // Set to end of today

        // Update the character
        const result = await Character.findOneAndUpdate(
            { _id: '681faada272e3ebf580298d9' },
            {
                blighted: true,
                blightStage: 5,
                deathDeadline: today
            },
            { new: true }
        );

        if (result) {
            console.log('Successfully updated character:');
            console.log(`Name: ${result.name}`);
            console.log(`Blighted: ${result.blighted}`);
            console.log(`Blight Stage: ${result.blightStage}`);
            console.log(`Death Deadline: ${result.deathDeadline}`);
        } else {
            console.log('Character not found');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
setBlightStage5(); 