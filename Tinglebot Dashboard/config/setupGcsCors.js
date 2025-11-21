const { Storage } = require('@google-cloud/storage');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
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

async function setupCors() {
    try {
        const bucketName = process.env.GCP_BUCKET_NAME;
        if (!bucketName) {
            throw new Error('GCP_BUCKET_NAME environment variable is not set');
        }

        const bucket = storage.bucket(bucketName);

        // CORS configuration for allowing image access from your domain
        const corsConfiguration = [
            {
                origin: [
                    'https://tinglebot.xyz',
                    'https://www.tinglebot.xyz',
                    'http://localhost:5001',
                    'http://localhost:3000'
                ],
                method: ['GET', 'HEAD'],
                responseHeader: [
                    'Content-Type',
                    'Access-Control-Allow-Origin',
                    'Access-Control-Allow-Methods',
                    'Access-Control-Allow-Headers',
                    'Cache-Control'
                ],
                maxAgeSeconds: 3600
            }
        ];

        // Set the CORS configuration
        await bucket.setCorsConfiguration(corsConfiguration);

        console.log('✅ CORS configuration updated successfully for bucket:', bucketName);
        console.log('📋 CORS configuration:', JSON.stringify(corsConfiguration, null, 2));
        
        // Verify the configuration
        const [corsConfig] = await bucket.getCorsConfiguration();
        console.log('🔍 Current CORS configuration:', JSON.stringify(corsConfig, null, 2));

    } catch (error) {
        console.error('❌ Error setting up CORS:', error);
        process.exit(1);
    }
}

// Run the setup
setupCors();
