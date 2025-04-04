// ------------------- Standard Library Imports -------------------
require('dotenv').config();

// ------------------- Local Module Imports -------------------
// Importing the Relic model and database connection function.
const RelicModel = require('../models/RelicModel');
const { connectToTinglebot } = require('../database/connection');

// ------------------- Relic Service Functions -------------------

// ------------------- Create a New Relic -------------------
// Creates a new relic entry in the database using provided data.
const createRelic = async (relicData) => {
  try {
    await connectToTinglebot();
    const newRelic = new RelicModel(relicData);
    return await newRelic.save();
  } catch (error) {
    console.error('[relicService.js]: ❌ Error creating relic:', error);
    throw error;
  }
};

// ------------------- Fetch Relics by Character -------------------
// Retrieves all relics discovered by the specified character.
const fetchRelicsByCharacter = async (characterName) => {
  try {
    await connectToTinglebot();
    return await RelicModel.find({ discoveredBy: characterName }).lean();
  } catch (error) {
    console.error('[relicService.js]: ❌ Error fetching relics by character:', error);
    throw error;
  }
};

// ------------------- Appraise a Relic -------------------
// Marks a relic as appraised and updates its appraisal details.
const appraiseRelic = async (relicId, appraiserName, description) => {
  try {
    await connectToTinglebot();
    return await RelicModel.findByIdAndUpdate(
      relicId,
      {
        appraised: true,
        appraisedBy: appraiserName,
        appraisalDate: new Date(),
        appraisalDescription: description
      },
      { new: true }
    );
  } catch (error) {
    console.error('[relicService.js]: ❌ Error appraising relic:', error);
    throw error;
  }
};

// ------------------- Archive a Relic -------------------
// Marks a relic as archived and updates art submission details.
const archiveRelic = async (relicId, imageUrl) => {
  try {
    await connectToTinglebot();
    return await RelicModel.findByIdAndUpdate(
      relicId,
      {
        artSubmitted: true,
        imageUrl: imageUrl,
        archived: true
      },
      { new: true }
    );
  } catch (error) {
    console.error('[relicService.js]: ❌ Error archiving relic:', error);
    throw error;
  }
};

// ------------------- Mark Relic as Deteriorated -------------------
// Updates a relic's status to indicate deterioration due to late appraisal or submission.
const markRelicDeteriorated = async (relicId) => {
  try {
    await connectToTinglebot();
    return await RelicModel.findByIdAndUpdate(
      relicId,
      { deteriorated: true },
      { new: true }
    );
  } catch (error) {
    console.error('[relicService.js]: ❌ Error marking relic as deteriorated:', error);
    throw error;
  }
};

// ------------------- Fetch Archived Relics -------------------
// Retrieves all relics that have been archived into the Library.
const fetchArchivedRelics = async () => {
  try {
    await connectToTinglebot();
    return await RelicModel.find({ archived: true }).lean();
  } catch (error) {
    console.error('[relicService.js]: ❌ Error fetching archived relics:', error);
    throw error;
  }
};

// ------------------- Fetch a Single Relic by ID -------------------
// Retrieves a relic based on its unique identifier.
const fetchRelicById = async (relicId) => {
  try {
    await connectToTinglebot();
    return await RelicModel.findById(relicId).lean();
  } catch (error) {
    console.error('[relicService.js]: ❌ Error fetching relic by ID:', error);
    throw error;
  }
};

// ------------------- Delete All Relics -------------------
// Deletes all relic entries from the database. Use with caution.
const deleteAllRelics = async () => {
  try {
    await connectToTinglebot();
    // Corrected to use RelicModel instead of an undefined Relic.
    return await RelicModel.deleteMany({});
  } catch (error) {
    console.error('[relicService.js]: ❌ Error deleting relics:', error);
    throw error;
  }
};

// ------------------- Module Exports -------------------
module.exports = {
  createRelic,
  fetchRelicsByCharacter,
  appraiseRelic,
  archiveRelic,
  markRelicDeteriorated,
  fetchArchivedRelics,
  fetchRelicById,
  deleteAllRelics
};