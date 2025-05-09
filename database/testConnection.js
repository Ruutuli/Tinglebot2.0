const mongoose = require('mongoose');
require('dotenv').config();

async function testDatabaseConnection() {
    console.log('🔍 Testing database connection...');
    
    try {
        // Test main database connection
        console.log('\n📦 Testing main database connection...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000 // 5 second timeout
        });
        console.log('✅ Main database connection successful!');

        // Test ShopStock collection
        console.log('\n🛍️ Testing ShopStock collection...');
        const ShopStock = mongoose.model('ShopStock', new mongoose.Schema({}));
        const shopItems = await ShopStock.find().limit(1);
        console.log('✅ ShopStock collection accessible');
        console.log('Sample item:', shopItems[0] || 'No items found');

        // Test Items collection
        console.log('\n📦 Testing Items collection...');
        const Items = mongoose.model('Items', new mongoose.Schema({}));
        const items = await Items.find().limit(1);
        console.log('✅ Items collection accessible');
        console.log('Sample item:', items[0] || 'No items found');

        // Test Inventories collection
        console.log('\n🎒 Testing Inventories collection...');
        const Inventories = mongoose.model('Inventories', new mongoose.Schema({}));
        const inventories = await Inventories.find().limit(1);
        console.log('✅ Inventories collection accessible');
        console.log('Sample inventory:', inventories[0] || 'No inventories found');

        // Test database operations
        console.log('\n⚡ Testing database operations...');
        
        // Test write operation
        const testItem = new ShopStock({
            itemName: 'Test Item',
            stock: 1,
            timestamp: new Date()
        });
        await testItem.save();
        console.log('✅ Write operation successful');

        // Test read operation
        const readItem = await ShopStock.findOne({ itemName: 'Test Item' });
        console.log('✅ Read operation successful');

        // Test update operation
        await ShopStock.updateOne(
            { itemName: 'Test Item' },
            { $set: { stock: 2 } }
        );
        console.log('✅ Update operation successful');

        // Test delete operation
        await ShopStock.deleteOne({ itemName: 'Test Item' });
        console.log('✅ Delete operation successful');

        console.log('\n✨ All database tests completed successfully!');
    } catch (error) {
        console.error('\n❌ Database test failed:', error);
        
        // Detailed error information
        if (error.name === 'MongoServerSelectionError') {
            console.error('\n🔍 Connection Details:');
            console.error('Error Type:', error.name);
            console.error('Error Message:', error.message);
            console.error('Topology Description:', error.reason?.topologyDescription);
            console.error('\nPossible causes:');
            console.error('1. MongoDB server is not running');
            console.error('2. Network connectivity issues');
            console.error('3. Invalid connection string');
            console.error('4. Firewall blocking connection');
            console.error('5. MongoDB Atlas IP whitelist issues');
        }
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
    }
}

// Run the test
testDatabaseConnection(); 