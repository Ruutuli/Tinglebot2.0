const { MongoClient } = require('mongodb');
require('dotenv').config();

async function testMongoConnection() {
    console.log('🔍 Testing MongoDB connection...');
    console.log('\n📝 Connection Details:');
    console.log('URI:', process.env.MONGODB_INVENTORIES_URI.replace(/\/\/[^:]+:[^@]+@/, '//****:****@')); // Hide credentials
    
    const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {
        serverSelectionTimeoutMS: 5000, // 5 second timeout for faster feedback
        connectTimeoutMS: 5000,
        socketTimeoutMS: 5000,
        maxPoolSize: 1,
        minPoolSize: 1,
        retryWrites: true,
        retryReads: true,
        w: 'majority',
        wtimeoutMS: 2500,
        heartbeatFrequencyMS: 10000,
        maxIdleTimeMS: 60000,
        family: 4
    });

    try {
        console.log('\n🔄 Attempting to connect...');
        await client.connect();
        console.log('✅ Successfully connected to MongoDB!');
        
        // Test database operations
        console.log('\n📊 Testing database operations...');
        const db = client.db('inventories');
        
        // List collections
        const collections = await db.listCollections().toArray();
        console.log('\n📚 Available collections:');
        collections.forEach(collection => {
            console.log(`- ${collection.name}`);
        });

        // Test a simple query
        console.log('\n🔍 Testing a simple query...');
        const result = await db.collection('items').findOne();
        console.log('Sample document:', result ? 'Found' : 'No documents found');

    } catch (error) {
        console.error('\n❌ Connection failed!');
        console.error('\n🔍 Error Details:');
        console.error('Error Type:', error.name);
        console.error('Error Message:', error.message);
        
        if (error.reason) {
            console.error('\n📋 Topology Description:');
            console.error('Type:', error.reason.type);
            console.error('Servers:', Array.from(error.reason.servers.keys()));
            console.error('Stale:', error.reason.stale);
            console.error('Compatible:', error.reason.compatible);
        }

        console.error('\n🔧 Possible Solutions:');
        console.error('1. Check if MongoDB Atlas cluster is running');
        console.error('2. Verify your IP is whitelisted in MongoDB Atlas');
        console.error('3. Check if the connection string is correct');
        console.error('4. Ensure network connectivity to MongoDB Atlas');
        console.error('5. Check if the database user credentials are valid');
    } finally {
        await client.close();
        console.log('\n🔌 Connection closed');
    }
}

// Run the test
testMongoConnection(); 