const { Storage } = require('@google-cloud/storage');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');
const dotenv = require('dotenv');
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });

// Create a storage client
let storage;
if (process.env.RAILWAY_ENVIRONMENT) {
    // Create service account object from environment variables
    const serviceAccount = {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
        universe_domain: "googleapis.com"
    };
    storage = new Storage({
        credentials: serviceAccount,
        projectId: process.env.GCP_PROJECT_ID,
    });
} else {
    // Local environment - use key file
    const serviceKeyPath = path.join(__dirname, 'service_account.json');
    storage = new Storage({
        keyFilename: serviceKeyPath,
        projectId: process.env.GCP_PROJECT_ID,
    });
}

// Reference the storage bucket
const bucket = storage.bucket(process.env.GCP_BUCKET_NAME);

module.exports = bucket;
