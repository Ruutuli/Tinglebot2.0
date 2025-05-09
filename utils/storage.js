// ------------------- Standard Libraries -------------------
// Import core Node.js modules.
const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');
const TempData = require('../models/TempDataModel');


// ============================================================================
// ------------------- File Path Constants -------------------
// Define and ensure file paths and directories for persistent storage.

// Define file path for submissions data.
const storageFile = path.join(__dirname, '../data/submissions.json');

// Ensure the data directory exists.
if (!fs.existsSync(path.join(__dirname, '../data'))) {
  fs.mkdirSync(path.join(__dirname, '../data'));
}

// Create the submissions file if it doesn't exist.
if (!fs.existsSync(storageFile)) {
  console.error('[storage.js]: logs Submissions storage file does not exist. Creating a new one.');
  fs.writeFileSync(storageFile, JSON.stringify({}));
}


// ------------------- In-Memory Store -------------------
// Define an in-memory store for submissions using a Map.
const submissionStore = new Map();


// ------------------- JSON File Handling Functions -------------------
// Safely reads a JSON file and returns the parsed data; returns an empty object on error.
function safeReadJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return data ? JSON.parse(data) : {};
  } catch (error) {
    handleError(error, 'storage.js');

    console.error(`[storage.js]: logs Error reading JSON file at ${filePath}:`, error.message);
    return {};
  }
}


// ============================================================================
// ------------------- Submission Storage Functions -------------------
// Functions for saving, retrieving, and deleting submissions from persistent storage.

// Save a submission to storage.
function saveSubmissionToStorage(submissionId, submissionData) {
  if (!submissionId || !submissionData) {
    return;
  }
  const submissions = safeReadJSON(storageFile);
  submissions[submissionId] = submissionData;
  fs.writeFileSync(storageFile, JSON.stringify(submissions, null, 2));
}

// Retrieve a submission by its ID.
function retrieveSubmissionFromStorage(submissionId) {
  const submissions = safeReadJSON(storageFile);
  return submissions[submissionId] || null;
}

// Delete a submission from storage by its ID.
function deleteSubmissionFromStorage(submissionId) {
  const submissions = safeReadJSON(storageFile);
  if (submissions[submissionId]) {
    delete submissions[submissionId];
    fs.writeFileSync(storageFile, JSON.stringify(submissions, null, 2));
  }
}


// ============================================================================
// ------------------- Temporary Data Storage Functions -------------------
// Functions for managing temporary data in MongoDB

// Generic storage functions
async function saveToStorage(key, type, data) {
  try {
    await TempData.create({ key, type, data });
  } catch (error) {
    handleError(error, 'storage.js');
    throw error;
  }
}

async function retrieveFromStorage(key, type) {
  try {
    const result = await TempData.findByTypeAndKey(type, key);
    return result?.data || null;
  } catch (error) {
    handleError(error, 'storage.js');
    throw error;
  }
}

async function deleteFromStorage(key, type) {
  try {
    await TempData.findOneAndDelete({ key, type });
  } catch (error) {
    handleError(error, 'storage.js');
    throw error;
  }
}

async function retrieveAllByType(type) {
  try {
    const results = await TempData.findAllByType(type);
    return results.map(doc => doc.data);
  } catch (error) {
    handleError(error, 'storage.js');
    throw error;
  }
}

// Healing request functions
async function saveHealingRequestToStorage(healingRequestId, requestData) {
  await saveToStorage(healingRequestId, 'healing', requestData);
}

async function retrieveHealingRequestFromStorage(healingRequestId) {
  return retrieveFromStorage(healingRequestId, 'healing');
}

async function deleteHealingRequestFromStorage(healingRequestId) {
  await deleteFromStorage(healingRequestId, 'healing');
}

// Vending request functions
async function saveVendingRequestToStorage(fulfillmentId, requestData) {
  await saveToStorage(fulfillmentId, 'vending', requestData);
}

async function retrieveVendingRequestFromStorage(fulfillmentId) {
  return retrieveFromStorage(fulfillmentId, 'vending');
}

async function deleteVendingRequestFromStorage(fulfillmentId) {
  await deleteFromStorage(fulfillmentId, 'vending');
}

async function retrieveAllVendingRequests() {
  return retrieveAllByType('vending');
}

// Boosting request functions
async function saveBoostingRequestToStorage(boostRequestId, requestData) {
  await saveToStorage(boostRequestId, 'boosting', requestData);
}

async function retrieveBoostingRequestFromStorage(boostRequestId) {
  return retrieveFromStorage(boostRequestId, 'boosting');
}

async function retrieveBoostingRequestFromStorageByCharacter(characterName) {
  const requests = await retrieveAllByType('boosting');
  return requests.find(request => request.targetCharacter === characterName);
}

// Battle progress functions
async function saveBattleProgressToStorage(battleId, battleData) {
  await saveToStorage(battleId, 'battle', battleData);
}

async function retrieveBattleProgressFromStorage(battleId) {
  return retrieveFromStorage(battleId, 'battle');
}

async function deleteBattleProgressFromStorage(battleId) {
  await deleteFromStorage(battleId, 'battle');
}

// Encounter functions
async function saveEncounterToStorage(encounterId, encounterData) {
  await saveToStorage(encounterId, 'encounter', encounterData);
}

async function retrieveEncounterFromStorage(encounterId) {
  return retrieveFromStorage(encounterId, 'encounter');
}

async function deleteEncounterFromStorage(encounterId) {
  await deleteFromStorage(encounterId, 'encounter');
}

// Blight request functions
async function saveBlightRequestToStorage(submissionId, requestData) {
  await saveToStorage(submissionId, 'blight', requestData);
}

async function retrieveBlightRequestFromStorage(submissionId) {
  return retrieveFromStorage(submissionId, 'blight');
}

async function deleteBlightRequestFromStorage(submissionId) {
  await deleteFromStorage(submissionId, 'blight');
}

// Monthly encounter functions
async function saveMonthlyEncounterToStorage(encounterId, encounterData) {
  await saveToStorage(encounterId, 'monthly', encounterData);
}

async function retrieveMonthlyEncounterFromStorage(encounterId) {
  return retrieveFromStorage(encounterId, 'monthly');
}

async function deleteMonthlyEncounterFromStorage(encounterId) {
  await deleteFromStorage(encounterId, 'monthly');
}

// Cleanup function
async function cleanupExpiredEntries(maxAgeInMs = 86400000) {
  try {
    const result = await TempData.cleanup(maxAgeInMs);
    return result;
  } catch (error) {
    handleError(error, 'storage.js');
    throw error;
  }
}


// ============================================================================
// ------------------- Module Exports -------------------
// Export all storage-related functions for use in other modules.
module.exports = {
  submissionStore,
  saveSubmissionToStorage,
  retrieveSubmissionFromStorage,
  deleteSubmissionFromStorage,
  
  saveHealingRequestToStorage,
  retrieveHealingRequestFromStorage,
  deleteHealingRequestFromStorage,
  
  saveVendingRequestToStorage,
  retrieveVendingRequestFromStorage,
  deleteVendingRequestFromStorage,
  retrieveAllVendingRequests,
  
  saveBoostingRequestToStorage,
  retrieveBoostingRequestFromStorage,
  retrieveBoostingRequestFromStorageByCharacter,
  
  saveBattleProgressToStorage,
  retrieveBattleProgressFromStorage,
  deleteBattleProgressFromStorage,
  
  saveEncounterToStorage,
  retrieveEncounterFromStorage,
  deleteEncounterFromStorage,
  
  saveBlightRequestToStorage,
  retrieveBlightRequestFromStorage,
  deleteBlightRequestFromStorage,
  
  saveMonthlyEncounterToStorage,
  retrieveMonthlyEncounterFromStorage,
  deleteMonthlyEncounterFromStorage,
  
  cleanupExpiredEntries
};
