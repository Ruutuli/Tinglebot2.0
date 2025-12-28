// ============================================================================
// ------------------- Google Sheets Authentication Test Script -------------------
// Standalone script to test Google Sheets authentication independently
// ============================================================================

const dotenv = require('dotenv');
const path = require('path');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');

// Load environment variables
const envPath = path.resolve(__dirname, '../..', '.env');
console.log(`[test-google-auth.js]: Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

// Test configuration
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ============================================================================
// ------------------- Diagnostic Functions -------------------
// ============================================================================

function diagnoseEnvVars() {
    console.log('\n🔬 DIAGNOSING ENVIRONMENT VARIABLES');
    console.log('=' .repeat(60));
    
    const vars = {
        GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
        GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
        GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID,
        GOOGLE_PRIVATE_KEY_ID: process.env.GOOGLE_PRIVATE_KEY_ID,
        RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT
    };
    
    console.log('\n📋 Environment Variable Status:');
    for (const [key, value] of Object.entries(vars)) {
        if (key === 'GOOGLE_PRIVATE_KEY') {
            console.log(`   ${key}: ${value ? '✅ Set (' + value.length + ' chars)' : '❌ Missing'}`);
        } else {
            console.log(`   ${key}: ${value ? '✅ Set' : '❌ Missing'}`);
        }
    }
    
    if (vars.GOOGLE_PRIVATE_KEY) {
        const key = vars.GOOGLE_PRIVATE_KEY;
        console.log('\n📋 Private Key Analysis:');
        console.log(`   Length: ${key.length} characters`);
        console.log(`   Has actual newlines (\\n): ${key.includes('\n')} (count: ${(key.match(/\n/g) || []).length})`);
        console.log(`   Has escaped newlines (\\\\n): ${key.includes('\\n')} (count: ${(key.match(/\\n/g) || []).length})`);
        console.log(`   Has BEGIN marker: ${key.includes('-----BEGIN PRIVATE KEY-----')}`);
        console.log(`   Has END marker: ${key.includes('-----END PRIVATE KEY-----')}`);
        console.log(`   First 80 chars: ${key.substring(0, 80).replace(/\n/g, '\\n')}`);
        console.log(`   Last 80 chars: ${key.substring(Math.max(0, key.length - 80)).replace(/\n/g, '\\n')}`);
    }
    
    console.log('=' .repeat(60) + '\n');
}

function normalizePrivateKey(privateKey) {
    if (!privateKey) return null;
    
    let normalized = String(privateKey).trim();
    normalized = normalized.replace(/^["']|["']$/g, '');
    normalized = normalized.replace(/\\n/g, '\n');
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    if (normalized.includes('-----BEGIN PRIVATE KEY-----') && normalized.includes('-----END PRIVATE KEY-----')) {
        const beginMarker = '-----BEGIN PRIVATE KEY-----';
        const endMarker = '-----END PRIVATE KEY-----';
        
        const beginPos = normalized.indexOf(beginMarker);
        const endPos = normalized.indexOf(endMarker);
        
        if (beginPos !== -1 && endPos !== -1 && endPos > beginPos) {
            normalized = normalized.substring(beginPos, endPos + endMarker.length);
        }
        
        if (!normalized.startsWith(beginMarker + '\n')) {
            normalized = beginMarker + '\n' + normalized.substring(beginMarker.length);
        }
        if (!normalized.includes('\n' + endMarker + '\n') && !normalized.endsWith('\n' + endMarker)) {
            normalized = normalized.replace(endMarker, '\n' + endMarker);
        }
        
        normalized = normalized.trimEnd() + '\n';
    }
    
    return normalized;
}

// ============================================================================
// ------------------- Authentication Tests -------------------
// ============================================================================

async function testJWTMethod() {
    console.log('\n🔐 Testing JWT Authentication Method...');
    console.log('-'.repeat(60));
    
    try {
        const rawKey = process.env.GOOGLE_PRIVATE_KEY;
        if (!rawKey) {
            throw new Error('GOOGLE_PRIVATE_KEY not set');
        }
        
        const normalizedKey = normalizePrivateKey(rawKey);
        if (!normalizedKey) {
            throw new Error('Failed to normalize private key');
        }
        
        console.log(`✅ Private key normalized: ${normalizedKey.length} chars, ${normalizedKey.split('\n').length} lines`);
        
        const auth = new google.auth.JWT(
            process.env.GOOGLE_CLIENT_EMAIL,
            null,
            normalizedKey,
            SCOPES
        );
        
        return new Promise((resolve, reject) => {
            auth.authorize((err, tokens) => {
                if (err) {
                    console.error(`❌ JWT Authentication FAILED: ${err.message}`);
                    reject(err);
                } else {
                    console.log(`✅ JWT Authentication SUCCESSFUL!`);
                    console.log(`   Token expires in: ${tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'N/A'}`);
                    resolve(auth);
                }
            });
        });
    } catch (error) {
        console.error(`❌ JWT Test Error: ${error.message}`);
        throw error;
    }
}

async function testGoogleAuthMethod() {
    console.log('\n🔐 Testing GoogleAuth.fromJSON() Method...');
    console.log('-'.repeat(60));
    
    try {
        const rawKey = process.env.GOOGLE_PRIVATE_KEY;
        if (!rawKey) {
            throw new Error('GOOGLE_PRIVATE_KEY not set');
        }
        
        const normalizedKey = normalizePrivateKey(rawKey);
        if (!normalizedKey) {
            throw new Error('Failed to normalize private key');
        }
        
        const credentials = {
            type: "service_account",
            project_id: process.env.GOOGLE_PROJECT_ID,
            private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
            private_key: normalizedKey,
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            client_id: process.env.GOOGLE_CLIENT_ID,
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
            universe_domain: "googleapis.com"
        };
        
        const auth = new GoogleAuth({
            credentials: credentials,
            scopes: SCOPES
        });
        
        const client = await auth.getClient();
        console.log(`✅ GoogleAuth Authentication SUCCESSFUL!`);
        
        // Try to get an access token
        const token = await auth.getAccessToken();
        if (token) {
            console.log(`✅ Access token obtained successfully`);
        }
        
        return auth;
    } catch (error) {
        console.error(`❌ GoogleAuth Test Error: ${error.message}`);
        throw error;
    }
}

// ============================================================================
// ------------------- Main Test Function -------------------
// ============================================================================

async function runTests() {
    console.log('\n🚀 Starting Google Sheets Authentication Tests');
    console.log('=' .repeat(60));
    
    // Step 1: Diagnose environment variables
    diagnoseEnvVars();
    
    // Step 2: Test JWT method
    let jwtSuccess = false;
    try {
        await testJWTMethod();
        jwtSuccess = true;
    } catch (error) {
        console.error(`\n❌ JWT method failed: ${error.message}`);
    }
    
    // Step 3: Test GoogleAuth method
    let googleAuthSuccess = false;
    try {
        await testGoogleAuthMethod();
        googleAuthSuccess = true;
    } catch (error) {
        console.error(`\n❌ GoogleAuth method failed: ${error.message}`);
    }
    
    // Step 4: Summary
    console.log('\n' + '=' .repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(60));
    console.log(`   JWT Method: ${jwtSuccess ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   GoogleAuth Method: ${googleAuthSuccess ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('=' .repeat(60) + '\n');
    
    if (!jwtSuccess && !googleAuthSuccess) {
        console.error('❌ All authentication methods failed!');
        console.error('   Please check:');
        console.error('   1. Private key format (should have actual newlines)');
        console.error('   2. Service account email matches the key');
        console.error('   3. Key has not been revoked in Google Cloud Console');
        process.exit(1);
    } else {
        console.log('✅ At least one authentication method succeeded!');
        process.exit(0);
    }
}

// Run the tests
runTests().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});

