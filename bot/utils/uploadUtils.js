// ------------------- Upload Utilities -------------------
// Handles image uploads to Google Cloud Storage

// ------------------- Imports -------------------
// Group imports logically
const { v4: uuidv4 } = require('uuid');               // For generating unique identifiers
const { handleError } = require('../utils/globalErrorHandler');
const bucket = require('../config/gcsService');       // Google Cloud Storage bucket configuration

// ------------------- Upload Submission Image -------------------
// Uploads an image to Google Cloud Storage and returns the public URL
async function uploadSubmissionImage(imageUrl, imageName) {
  try {
    const { default: fetch } = await import('node-fetch');
    // Define the destination path within the Google Cloud Storage bucket
    const destination = `Submissions/${uuidv4()}-${imageName}`;
    const file = bucket.file(destination);

    // Fetch the image from the provided URL
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();  // Convert response to ArrayBuffer
    const buffer = Buffer.from(arrayBuffer);           // Convert ArrayBuffer to Buffer

    // Save the image to the Google Cloud Storage bucket
    await file.save(buffer, {
      metadata: {
        contentType: 'image/png',                  // Set appropriate content type
        cacheControl: 'public, max-age=31536000',  // Cache control for public access
      },
    });

    // Construct the public URL for the uploaded image
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    return publicUrl;

  } catch (error) {
    handleError(error, 'uploadUtils.js');

    console.error('Error uploading image to Google Cloud:', error);
    throw new Error('Failed to upload image');  // Throw error if upload fails
  }
}

// ------------------- Upload Pet Image -------------------
// Uploads an image to Google Cloud Storage under the "pets" folder and returns the public URL
async function uploadPetImage(imageUrl, imageName) {
  try {
    const { default: fetch } = await import('node-fetch');
    // Define the destination path within the Google Cloud Storage bucket under "pets"
    const destination = `pets/${uuidv4()}-${imageName}`;
    const file = bucket.file(destination);

    // Fetch the image from the provided URL
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save the image to the Google Cloud Storage bucket
    await file.save(buffer, {
      metadata: {
        contentType: 'image/png',                  // Set appropriate content type
        cacheControl: 'public, max-age=31536000',  // Cache control for public access
      },
    });

    // Construct the public URL for the uploaded image
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    return publicUrl;
  } catch (error) {
    handleError(error, 'uploadUtils.js');

    console.error('Error uploading image to Google Cloud:', error);
    throw new Error('Failed to upload image');  // Throw error if upload fails
  }
}

// ------------------- Upload Quest Clue Image (buffer) -------------------
// Uploads a buffer to GCS under quest-clues/ and returns the public URL
async function uploadQuestClueBuffer(buffer, filename) {
  try {
    const destination = `quest-clues/${filename}`;
    const file = bucket.file(destination);
    await file.save(buffer, {
      metadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000',
      },
    });
    return `https://storage.googleapis.com/${bucket.name}/${destination}`;
  } catch (error) {
    handleError(error, 'uploadUtils.js');
    console.error('Error uploading quest clue image to GCS:', error);
    throw new Error('Failed to upload quest clue image');
  }
}

// ------------------- Exported Utilities -------------------
// Export the upload function for external use
module.exports = { uploadSubmissionImage, uploadPetImage, uploadQuestClueBuffer };
