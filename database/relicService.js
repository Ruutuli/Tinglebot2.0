// =================== STANDARD LIBRARIES ===================
// ------------------- Load environment configuration -------------------
require('dotenv').config();


// =================== DATABASE MODELS ===================
// ------------------- Import local models -------------------
const RelicModel = require('../models/RelicModel');
const { connectToTinglebot } = require('../database/connection');


// =================== RELIC SERVICE FUNCTIONS ===================

// ------------------- Create a new relic entry -------------------
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

// ------------------- Fetch relics by character name -------------------
const fetchRelicsByCharacter = async (characterName) => {
  try {
    await connectToTinglebot();
    return await RelicModel.find({ discoveredBy: characterName }).lean();
  } catch (error) {
    console.error('[relicService.js]: ❌ Error fetching relics by character:', error);
    throw error;
  }
};

// ------------------- Mark a relic as appraised -------------------
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

// ------------------- Mark a relic as archived (after art is submitted) -------------------
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

// ------------------- Mark a relic as deteriorated -------------------
const markRelicDeteriorated = async (relicId) => {
  try {
    await connectToTinglebot();
    return await RelicModel.findByIdAndUpdate(
      relicId,
      {
        deteriorated: true
      },
      { new: true }
    );
  } catch (error) {
    console.error('[relicService.js]: ❌ Error marking relic as deteriorated:', error);
    throw error;
  }
};

// ------------------- Fetch all appraised and archived relics -------------------
const fetchArchivedRelics = async () => {
  try {
    await connectToTinglebot();
    return await RelicModel.find({ archived: true }).lean();
  } catch (error) {
    console.error('[relicService.js]: ❌ Error fetching archived relics:', error);
    throw error;
  }
};

// ------------------- Fetch a single relic by ID -------------------
const fetchRelicById = async (relicId) => {
  try {
    await connectToTinglebot();
    return await RelicModel.findById(relicId).lean();
  } catch (error) {
    console.error('[relicService.js]: ❌ Error fetching relic by ID:', error);
    throw error;
  }
};

async function deleteAllRelics() {
  try {
    await Relic.deleteMany({});
  } catch (error) {
    console.error('[relicService.js]: ❌ Error deleting relics:', error);
    throw error;
  }
}


// =================== EXPORTS ===================
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
