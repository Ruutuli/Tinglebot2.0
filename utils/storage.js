// ------------------- Storage Utility -------------------
// This module provides in-memory storage and persistent storage for submissions

// ------------------- Imports -------------------
// Standard libraries for file system and path management
const fs = require('fs');
const path = require('path');

// ------------------- File Path Constants -------------------
// Path to the file where submissions are stored
const storageFile = path.join(__dirname, '../data/submissions.json');

// Ensure the data directory exists
if (!fs.existsSync(path.join(__dirname, '../data'))) {
  fs.mkdirSync(path.join(__dirname, '../data'));
}

// Create the submissions file if it doesn't exist
if (!fs.existsSync(storageFile)) {
  console.error('Submissions storage file does not exist. Creating a new one.');
  fs.writeFileSync(storageFile, JSON.stringify({}));
}

// ------------------- In-Memory Store -------------------
// In-memory submission store using a Map for quick access
const submissionStore = new Map();

// ------------------- Safe JSON Read Function -------------------
// Reads a JSON file and returns the parsed data, handling errors gracefully
function safeReadJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error(`Error reading JSON file at ${filePath}:`, error.message);
    return {};
  }
}


// ------------------- Save Submission to Storage -------------------
// Saves a submission to the persistent storage (file system)
function saveSubmissionToStorage(submissionId, submissionData) {
  if (!submissionId || !submissionData) {
      console.error('Invalid data passed to saveSubmissionToStorage:', { submissionId, submissionData });
      return;
  }
  const submissions = safeReadJSON(storageFile);
  submissions[submissionId] = submissionData;
  fs.writeFileSync(storageFile, JSON.stringify(submissions, null, 2));
}


// ------------------- Retrieve Submission from Storage -------------------
// Retrieves a submission by its ID from persistent storage
function retrieveSubmissionFromStorage(submissionId) {
  const submissions = safeReadJSON(storageFile);
  console.log('Current submissions in storage:', Object.keys(submissions));  
  return submissions[submissionId] || null;
}

// ------------------- Delete Submission from Storage -------------------
// Deletes a submission from persistent storage by its ID
function deleteSubmissionFromStorage(submissionId) {
  const submissions = safeReadJSON(storageFile);

  if (submissions[submissionId]) {
      console.log(`Deleting submission with ID: ${submissionId}`);
      delete submissions[submissionId]; // Remove entry by ID
      fs.writeFileSync(storageFile, JSON.stringify(submissions, null, 2)); // Save changes
  } else {
      console.warn(`Submission ID not found in storage: ${submissionId}`);
  }
}

// Path to the file where healing requests are stored
const healingRequestsFile = path.join(__dirname, '../data/healingRequests.json');

// Ensure the file exists
if (!fs.existsSync(healingRequestsFile)) {
  console.error('Healing Requests storage file does not exist. Creating a new one.');
  fs.writeFileSync(healingRequestsFile, JSON.stringify({}));
}

// ------------------- Save Healing Request to Storage -------------------
function saveHealingRequestToStorage(healingRequestId, healingRequestData) {
  try {
    // Read existing requests
    const healingRequests = safeReadJSON(healingRequestsFile);

    // Append the new request
    healingRequests[healingRequestId] = healingRequestData;

    // Write back to file
    fs.writeFileSync(healingRequestsFile, JSON.stringify(healingRequests, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error saving healing request ${healingRequestId}:`, error.message);
  }
}

// ------------------- Retrieve Healing Request from Storage -------------------
function retrieveHealingRequestFromStorage(healingRequestId) {
  const healingRequests = safeReadJSON(healingRequestsFile);
  const request = healingRequests[healingRequestId];

  if (request && Date.now() - request.timestamp > 24 * 60 * 60 * 1000) {
    console.warn(`Healing request ${healingRequestId} has expired.`);
    delete healingRequests[healingRequestId];
    fs.writeFileSync(healingRequestsFile, JSON.stringify(healingRequests, null, 2), 'utf-8');
    return null;
  }

  return request || null;
}

// ------------------- Delete Healing Request from Storage -------------------
function deleteHealingRequestFromStorage(healingRequestId) {
  const healingRequests = safeReadJSON(healingRequestsFile);

  if (healingRequests[healingRequestId]) {
    delete healingRequests[healingRequestId]; // Remove entry by ID
    fs.writeFileSync(healingRequestsFile, JSON.stringify(healingRequests, null, 2)); // Save changes
  } else {
    console.warn(`Healing Request ID not found in storage: ${healingRequestId}`);
  }
}

// ------------------- Cleanup Expired Healing Requests -------------------
function cleanupExpiredHealingRequests() {
  try {
    const healingRequests = safeReadJSON(healingRequestsFile);

    const currentTime = Date.now();
    let updated = false;

    for (const requestId in healingRequests) {
      const request = healingRequests[requestId];
      if (currentTime - request.timestamp > 24 * 60 * 60 * 1000) { // Older than 24 hours
        console.log(`[storage.js] Removing expired healing request with ID: ${requestId}`);
        delete healingRequests[requestId];
        updated = true;
      }
    }

    if (updated) {
      fs.writeFileSync(healingRequestsFile, JSON.stringify(healingRequests, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error('[storage.js] Error cleaning up expired healing requests:', error.message);
  }
}

// ------------------- File Path for Vending Requests -------------------
const vendingRequestsFile = path.join(__dirname, '../data/vendingRequests.json');

// Ensure the vending requests file exists
if (!fs.existsSync(vendingRequestsFile)) {
    console.error('Vending Requests storage file does not exist. Creating a new one.');
    fs.writeFileSync(vendingRequestsFile, JSON.stringify({}));
}

// ------------------- Save Vending Request to Storage -------------------
function saveVendingRequestToStorage(requestId, requestData) {
    try {
        const vendingRequests = safeReadJSON(vendingRequestsFile);

        // Append the new request
        vendingRequests[requestId] = requestData;

        // Write back to file
        fs.writeFileSync(vendingRequestsFile, JSON.stringify(vendingRequests, null, 2), 'utf-8');
    } catch (error) {
        console.error(`Error saving vending request ${requestId}:`, error.message);
    }
}

// ------------------- Retrieve Vending Request from Storage -------------------
function retrieveVendingRequestFromStorage(requestId) {
    const vendingRequests = safeReadJSON(vendingRequestsFile);
    return vendingRequests[requestId] || null;
}

// ------------------- Delete Vending Request from Storage -------------------
function deleteVendingRequestFromStorage(requestId) {
    const vendingRequests = safeReadJSON(vendingRequestsFile);

    if (vendingRequests[requestId]) {
        delete vendingRequests[requestId]; // Remove entry by ID
        fs.writeFileSync(vendingRequestsFile, JSON.stringify(vendingRequests, null, 2)); // Save changes
    } else {
        console.warn(`Vending Request ID not found in storage: ${requestId}`);
    }
}

// ------------------- Retrieve All Vending Requests from Storage -------------------
function retrieveAllVendingRequests() {
  try {
      const vendingRequests = safeReadJSON(vendingRequestsFile);
      return Object.values(vendingRequests); // Return an array of all requests
  } catch (error) {
      console.error('[storage.js] Error retrieving all vending requests:', error.message);
      return [];
  }
}

// ------------------- Cleanup Expired Vending Requests -------------------
function cleanupExpiredVendingRequests() {
  try {
      const vendingRequests = safeReadJSON(vendingRequestsFile);
      const currentTime = Date.now();
      const oneMonthInMillis = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
      let updated = false;

      for (const requestId in vendingRequests) {
          const request = vendingRequests[requestId];
          if (currentTime - new Date(request.createdAt).getTime() > oneMonthInMillis) {
              console.log(`[storage.js] Removing expired vending request with ID: ${requestId}`);
              delete vendingRequests[requestId];
              updated = true;
          }
      }

      if (updated) {
          fs.writeFileSync(vendingRequestsFile, JSON.stringify(vendingRequests, null, 2), 'utf-8');
          console.log('[storage.js] Expired vending requests cleaned up successfully.');
      }
  } catch (error) {
      console.error('[storage.js] Error cleaning up expired vending requests:', error.message);
  }
}

// ------------------- Exported Functions -------------------
// Export functions and in-memory store for external use
module.exports = {
  submissionStore,                 // In-memory store for temporary submission data
  saveSubmissionToStorage,         // Save submission to persistent storage
  retrieveSubmissionFromStorage,   // Retrieve submission from persistent storage
  deleteSubmissionFromStorage,      // Delete submission from persistent storage
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
