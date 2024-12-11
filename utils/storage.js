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
    console.log('File Read Content:', data);
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
    console.log(`Healing request ${healingRequestId} saved to ${healingRequestsFile}`);
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


function cleanupExpiredHealingRequests(postNotification) {
  try {
    const healingRequests = safeReadJSON(healingRequestsFile);
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    for (const [id, request] of Object.entries(healingRequests)) {
      if (now - request.timestamp > twentyFourHours) {
        console.log(`Deleting expired healing request: ${id}`);

        // If a notification function is provided, send the notification
        if (postNotification) {
          postNotification(
            `🕒 Healing request **${id}** for **${request.characterRequesting}** in **${request.village}** has expired.`
          );
        }

        delete healingRequests[id];
      }
    }

    // Write updated data back to the file
    fs.writeFileSync(healingRequestsFile, JSON.stringify(healingRequests, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error during cleanup of expired healing requests:', error.message);
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
  cleanupExpiredHealingRequests
};
