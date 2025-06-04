const mongoose = require('mongoose');
const dotenv = require('dotenv');
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });

async function testDatabaseConnection() {
    console.log('🔍 Testing database connections in', env, 'mode...');
    
    try {
        // Test Tinglebot database connection
        console.log('\n📦 Testing Tinglebot database connection...');
        await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000
        });
        console.log('✅ Tinglebot database connection successful!');
        console.log('Database name:', mongoose.connection.db.databaseName);
        await mongoose.connection.close();

        // Test Inventories database connection
        console.log('\n🎒 Testing Inventories database connection...');
        await mongoose.connect(process.env.MONGODB_INVENTORIES_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000
        });
        console.log('✅ Inventories database connection successful!');
        console.log('Database name:', mongoose.connection.db.databaseName);
        await mongoose.connection.close();

        // Test Vending database connection
        console.log('\n🛍️ Testing Vending database connection...');
        await mongoose.connect(process.env.MONGODB_VENDING_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000
        });
        console.log('✅ Vending database connection successful!');
        console.log('Database name:', mongoose.connection.db.databaseName);
        await mongoose.connection.close();

        console.log('\n✨ All database connections tested successfully!');
        console.log('\n📝 Summary:');
        console.log('- Tinglebot DB:', process.env.MONGODB_TINGLEBOT_URI.split('/').pop());
        console.log('- Inventories DB:', process.env.MONGODB_INVENTORIES_URI.split('/').pop());
        console.log('- Vending DB:', process.env.MONGODB_VENDING_URI.split('/').pop());

    } catch (error) {
        console.error('\n❌ Database test failed:', error);
        
        if (error.name === 'MongoServerSelectionError') {
            console.error('\n🔍 Connection Details:');
            console.error('Error Type:', error.name);
            console.error('Error Message:', error.message);
            console.error('\nPossible causes:');
            console.error('1. MongoDB server is not running');
            console.error('2. Network connectivity issues');
            console.error('3. Invalid connection string');
            console.error('4. Firewall blocking connection');
            console.error('5. MongoDB Atlas IP whitelist issues');
        }
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
            console.log('\n🔌 Database connection closed');
        }
    }
}

// Run the test
testDatabaseConnection(); 