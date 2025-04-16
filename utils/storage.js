// ------------------- Standard Libraries -------------------
// Import core Node.js modules.
const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');


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
// ------------------- Healing Requests Storage Functions -------------------
// Functions for managing healing requests in persistent storage.

// Define file path for healing requests.
const healingRequestsFile = path.join(__dirname, '../data/healingRequests.json');

// Create the healing requests file if it doesn't exist.
if (!fs.existsSync(healingRequestsFile)) {
  fs.writeFileSync(healingRequestsFile, JSON.stringify({}));
}

// Save a healing request to storage.
function saveHealingRequestToStorage(healingRequestId, healingRequestData) {
  try {
    const healingRequests = safeReadJSON(healingRequestsFile);
    healingRequests[healingRequestId] = healingRequestData;
    fs.writeFileSync(healingRequestsFile, JSON.stringify(healingRequests, null, 2), 'utf-8');
  } catch (error) {
    handleError(error, 'storage.js');

    console.error(`[storage.js]: logs Error saving healing request ${healingRequestId}:`, error.message);
  }
}

// Retrieve a healing request by its ID, expiring requests older than 24 hours.
function retrieveHealingRequestFromStorage(healingRequestId) {
  const healingRequests = safeReadJSON(healingRequestsFile);
  const request = healingRequests[healingRequestId];
  if (request && Date.now() - request.timestamp > 24 * 60 * 60 * 1000) {
    console.warn(`[storage.js]: logs Healing request ${healingRequestId} has expired.`);
    delete healingRequests[healingRequestId];
    fs.writeFileSync(healingRequestsFile, JSON.stringify(healingRequests, null, 2), 'utf-8');
    return null;
  }
  return request || null;
}

// Delete a healing request from storage by its ID.
function deleteHealingRequestFromStorage(healingRequestId) {
  const healingRequests = safeReadJSON(healingRequestsFile);
  if (healingRequests[healingRequestId]) {
    delete healingRequests[healingRequestId];
    fs.writeFileSync(healingRequestsFile, JSON.stringify(healingRequests, null, 2));
  } else {
    console.warn(`[storage.js]: logs Healing Request ID not found in storage: ${healingRequestId}`);
  }
}

// Cleanup healing requests older than 24 hours.
function cleanupExpiredHealingRequests() {
  try {
    const healingRequests = safeReadJSON(healingRequestsFile);
    const currentTime = Date.now();
    let updated = false;
    for (const requestId in healingRequests) {
      const request = healingRequests[requestId];
      if (currentTime - request.timestamp > 24 * 60 * 60 * 1000) {
        delete healingRequests[requestId];
        updated = true;
      }
    }
    if (updated) {
      fs.writeFileSync(healingRequestsFile, JSON.stringify(healingRequests, null, 2), 'utf-8');
    }
  } catch (error) {
    handleError(error, 'storage.js');

    console.error('[storage.js]: logs Error cleaning up expired healing requests:', error.message);
  }
}


// ============================================================================
// ------------------- Vending Requests Storage Functions -------------------
// Functions for managing vending requests in persistent storage.

// Define file path for vending requests.
const vendingRequestsFile = path.join(__dirname, '../data/vendingRequests.json');

// Create the vending requests file if it doesn't exist.
if (!fs.existsSync(vendingRequestsFile)) {
  console.error('[storage.js]: logs Vending Requests storage file does not exist. Creating a new one.');
  fs.writeFileSync(vendingRequestsFile, JSON.stringify({}));
}

// Save a vending request to storage.
function saveVendingRequestToStorage(requestId, requestData) {
  try {
    const vendingRequests = safeReadJSON(vendingRequestsFile);
    vendingRequests[requestId] = requestData;
    fs.writeFileSync(vendingRequestsFile, JSON.stringify(vendingRequests, null, 2), 'utf-8');
  } catch (error) {
    handleError(error, 'storage.js');

    console.error(`[storage.js]: logs Error saving vending request ${requestId}:`, error.message);
  }
}

// Retrieve a vending request by its ID.
function retrieveVendingRequestFromStorage(requestId) {
  const vendingRequests = safeReadJSON(vendingRequestsFile);
  return vendingRequests[requestId] || null;
}

// Delete a vending request from storage by its ID.
function deleteVendingRequestFromStorage(requestId) {
  const vendingRequests = safeReadJSON(vendingRequestsFile);
  if (vendingRequests[requestId]) {
    delete vendingRequests[requestId];
    fs.writeFileSync(vendingRequestsFile, JSON.stringify(vendingRequests, null, 2));
  } else {
    console.warn(`[storage.js]: logs Vending Request ID not found in storage: ${requestId}`);
  }
}

// Retrieve all vending requests.
function retrieveAllVendingRequests() {
  try {
    const vendingRequests = safeReadJSON(vendingRequestsFile);
    return Object.values(vendingRequests);
  } catch (error) {
    handleError(error, 'storage.js');

    console.error('[storage.js]: logs Error retrieving all vending requests:', error.message);
    return [];
  }
}

// Cleanup vending requests older than 30 days.
function cleanupExpiredVendingRequests() {
  try {
    const vendingRequests = safeReadJSON(vendingRequestsFile);
    const currentTime = Date.now();
    const oneMonthInMillis = 30 * 24 * 60 * 60 * 1000; // 30 days
    let updated = false;
    for (const requestId in vendingRequests) {
      const request = vendingRequests[requestId];
      if (currentTime - new Date(request.createdAt).getTime() > oneMonthInMillis) {
        delete vendingRequests[requestId];
        updated = true;
      }
    }
    if (updated) {
      fs.writeFileSync(vendingRequestsFile, JSON.stringify(vendingRequests, null, 2), 'utf-8');
    }
  } catch (error) {
    handleError(error, 'storage.js');

    console.error('[storage.js]: logs Error cleaning up expired vending requests:', error.message);
  }
}


// ============================================================================
// ------------------- Boosting Requests Storage Functions -------------------
// Functions for managing boosting requests in persistent storage.

// Define file path for boosting requests.
const boostingRequestsFile = path.join(__dirname, '../data/boostingRequests.json');

// Create the boosting requests file if it doesn't exist.
if (!fs.existsSync(boostingRequestsFile)) {
  fs.writeFileSync(boostingRequestsFile, JSON.stringify({}));
}

// Retrieve a boosting request by character name where the request is fulfilled.
function retrieveBoostingRequestFromStorageByCharacter(characterName) {
  const boostingRequests = safeReadJSON(boostingRequestsFile);
  for (const requestId in boostingRequests) {
    const request = boostingRequests[requestId];
    if (request.targetCharacter.toLowerCase() === characterName.toLowerCase() && request.status === 'fulfilled') {
      return request;
    }
  }
  return null;
}

// ------------------- Save Boosting Request to Storage -------------------
// Saves a boosting request to persistent storage.
function saveBoostingRequestToStorage(requestId, requestData) {
  try {
    const boostingRequests = safeReadJSON(boostingRequestsFile);
    boostingRequests[requestId] = requestData;
    fs.writeFileSync(boostingRequestsFile, JSON.stringify(boostingRequests, null, 2));
  } catch (error) {
    handleError(error, 'storage.js');

    console.error(`[storage.js]: logs Error saving boosting request ${requestId}:`, error.message);
  }
}

// ------------------- Retrieve Boosting Request from Storage -------------------
// Retrieves a boosting request by its ID.
function retrieveBoostingRequestFromStorage(requestId) {
  const boostingRequests = safeReadJSON(boostingRequestsFile);
  return boostingRequests[requestId] || null;
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
  cleanupExpiredHealingRequests,
  
  saveVendingRequestToStorage,
  retrieveVendingRequestFromStorage,
  deleteVendingRequestFromStorage,
  retrieveAllVendingRequests,
  cleanupExpiredVendingRequests,
  
  saveBoostingRequestToStorage,
  retrieveBoostingRequestFromStorage,
  retrieveBoostingRequestFromStorageByCharacter
};
