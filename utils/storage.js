// ------------------- storage.js -------------------
// This module provides both in-memory and persistent storage for submissions,
// healing requests, and vending requests. It handles reading and writing JSON
// data to the file system, as well as cleanup of expired entries.

// ============================================================================
// Standard Libraries
// ------------------- Importing Node.js core modules -------------------
const fs = require('fs');
const path = require('path');


// ============================================================================
// File Path Constants
// ------------------- Define file paths for storage -------------------
const storageFile = path.join(__dirname, '../data/submissions.json');

// Ensure the data directory exists
if (!fs.existsSync(path.join(__dirname, '../data'))) {
  fs.mkdirSync(path.join(__dirname, '../data'));
}

// Create the submissions file if it doesn't exist
if (!fs.existsSync(storageFile)) {
  console.error('[storage.js]: logs Submissions storage file does not exist. Creating a new one.');
  fs.writeFileSync(storageFile, JSON.stringify({}));
}


// ============================================================================
// In-Memory Store
// ------------------- Define an in-memory submission store using a Map -------------------
const submissionStore = new Map();


// ============================================================================
// JSON File Handling Functions
// ------------------- Safe JSON Read Function -------------------
// Reads a JSON file and returns the parsed data, handling errors gracefully.
function safeReadJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error(`[storage.js]: logs Error reading JSON file at ${filePath}:`, error.message);
    return {};
  }
}


// ============================================================================
// Submission Storage Functions
// ------------------- Save Submission to Storage -------------------
// Saves a submission to persistent storage (the file system).
function saveSubmissionToStorage(submissionId, submissionData) {
  if (!submissionId || !submissionData) {
    return;
  }
  const submissions = safeReadJSON(storageFile);
  submissions[submissionId] = submissionData;
  fs.writeFileSync(storageFile, JSON.stringify(submissions, null, 2));
}

// ------------------- Retrieve Submission from Storage -------------------
// Retrieves a submission by its ID from persistent storage.
function retrieveSubmissionFromStorage(submissionId) {
  const submissions = safeReadJSON(storageFile);
  return submissions[submissionId] || null;
}

// ------------------- Delete Submission from Storage -------------------
// Deletes a submission from persistent storage by its ID.
function deleteSubmissionFromStorage(submissionId) {
  const submissions = safeReadJSON(storageFile);
  if (submissions[submissionId]) {
    delete submissions[submissionId];
    fs.writeFileSync(storageFile, JSON.stringify(submissions, null, 2));
  }
}


// ============================================================================
// Healing Requests Storage Functions
// ------------------- File Path for Healing Requests -------------------
const healingRequestsFile = path.join(__dirname, '../data/healingRequests.json');

// Ensure the healing requests file exists
if (!fs.existsSync(healingRequestsFile)) {
  fs.writeFileSync(healingRequestsFile, JSON.stringify({}));
}

// ------------------- Save Healing Request to Storage -------------------
// Saves a healing request to persistent storage.
function saveHealingRequestToStorage(healingRequestId, healingRequestData) {
  try {
    const healingRequests = safeReadJSON(healingRequestsFile);
    healingRequests[healingRequestId] = healingRequestData;
    fs.writeFileSync(healingRequestsFile, JSON.stringify(healingRequests, null, 2), 'utf-8');
  } catch (error) {
    console.error(`[storage.js]: logs Error saving healing request ${healingRequestId}:`, error.message);
  }
}

// ------------------- Retrieve Healing Request from Storage -------------------
// Retrieves a healing request by its ID. Expires requests older than 24 hours.
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

// ------------------- Delete Healing Request from Storage -------------------
// Deletes a healing request by its ID from persistent storage.
function deleteHealingRequestFromStorage(healingRequestId) {
  const healingRequests = safeReadJSON(healingRequestsFile);
  if (healingRequests[healingRequestId]) {
    delete healingRequests[healingRequestId];
    fs.writeFileSync(healingRequestsFile, JSON.stringify(healingRequests, null, 2));
  } else {
    console.warn(`[storage.js]: logs Healing Request ID not found in storage: ${healingRequestId}`);
  }
}

// ------------------- Cleanup Expired Healing Requests -------------------
// Removes healing requests that are older than 24 hours from persistent storage.
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
    console.error('[storage.js]: logs Error cleaning up expired healing requests:', error.message);
  }
}


// ============================================================================
// Vending Requests Storage Functions
// ------------------- File Path for Vending Requests -------------------
const vendingRequestsFile = path.join(__dirname, '../data/vendingRequests.json');

// Ensure the vending requests file exists
if (!fs.existsSync(vendingRequestsFile)) {
  console.error('[storage.js]: logs Vending Requests storage file does not exist. Creating a new one.');
  fs.writeFileSync(vendingRequestsFile, JSON.stringify({}));
}

// ------------------- Save Vending Request to Storage -------------------
// Saves a vending request to persistent storage.
function saveVendingRequestToStorage(requestId, requestData) {
  try {
    const vendingRequests = safeReadJSON(vendingRequestsFile);
    vendingRequests[requestId] = requestData;
    fs.writeFileSync(vendingRequestsFile, JSON.stringify(vendingRequests, null, 2), 'utf-8');
  } catch (error) {
    console.error(`[storage.js]: logs Error saving vending request ${requestId}:`, error.message);
  }
}

// ------------------- Retrieve Vending Request from Storage -------------------
// Retrieves a vending request by its ID from persistent storage.
function retrieveVendingRequestFromStorage(requestId) {
  const vendingRequests = safeReadJSON(vendingRequestsFile);
  return vendingRequests[requestId] || null;
}

// ------------------- Delete Vending Request from Storage -------------------
// Deletes a vending request by its ID from persistent storage.
function deleteVendingRequestFromStorage(requestId) {
  const vendingRequests = safeReadJSON(vendingRequestsFile);
  if (vendingRequests[requestId]) {
    delete vendingRequests[requestId];
    fs.writeFileSync(vendingRequestsFile, JSON.stringify(vendingRequests, null, 2));
  } else {
    console.warn(`[storage.js]: logs Vending Request ID not found in storage: ${requestId}`);
  }
}

// ------------------- Retrieve All Vending Requests -------------------
// Retrieves all vending requests from persistent storage.
function retrieveAllVendingRequests() {
  try {
    const vendingRequests = safeReadJSON(vendingRequestsFile);
    return Object.values(vendingRequests);
  } catch (error) {
    console.error('[storage.js]: logs Error retrieving all vending requests:', error.message);
    return [];
  }
}

// ------------------- Cleanup Expired Vending Requests -------------------
// Removes vending requests older than 30 days from persistent storage.
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
    console.error('[storage.js]: logs Error cleaning up expired vending requests:', error.message);
  }
}


// ============================================================================
// Module Exports
// ------------------- Exporting Storage Functions -------------------
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
  cleanupExpiredVendingRequests
};
