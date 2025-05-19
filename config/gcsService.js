const { Storage } = require('@google-cloud/storage');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');
require('dotenv').config();

// Load the service account key JSON file
const serviceKeyPath = path.join('./config/service_account.json');

// Create a storage client
const storage = new Storage({
  keyFilename: serviceKeyPath,
  projectId: process.env.GCP_PROJECT_ID,
});

// Reference the storage bucket
const bucket = storage.bucket(process.env.GCP_BUCKET_NAME);

module.exports = bucket;
