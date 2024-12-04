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
    console.error('Error reading JSON file:', error);
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
  console.log('Available submission IDs:', Object.keys(submissions)); // Debug
  return submissions[submissionId] || null;
}

// ------------------- Delete Submission from Storage -------------------
// Deletes a submission from persistent storage by its ID
function deleteSubmissionFromStorage(submissionId) {
  const submissions = safeReadJSON(storageFile);  // Read existing submissions
  delete submissions[submissionId];               // Delete the submission by ID
  fs.writeFileSync(storageFile, JSON.stringify(submissions, null, 2)); // Write back to file
}

// ------------------- Exported Functions -------------------
// Export functions and in-memory store for external use
module.exports = {
  submissionStore,                 // In-memory store for temporary submission data
  saveSubmissionToStorage,         // Save submission to persistent storage
  retrieveSubmissionFromStorage,   // Retrieve submission from persistent storage
  deleteSubmissionFromStorage      // Delete submission from persistent storage
};
