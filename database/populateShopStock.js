const mongoose = require('mongoose');
require('dotenv').config();

async function populateShopStock() {
    console.log('🔄 Checking and populating ShopStock collection...');
    
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000
        });
        
        // Define proper schemas
        const ItemSchema = new mongoose.Schema({
            itemName: String,
            buyPrice: Number,
            sellPrice: Number,
            emoji: String
        });
        
        const ShopStockSchema = new mongoose.Schema({
            itemName: {
                type: String,
                required: true
            },
            stock: {
                type: Number,
                required: true,
                min: 0
            },
            timestamp: {
                type: Date,
                default: Date.now
            }
        });
        
        const Items = mongoose.model('Items', ItemSchema);
        const ShopStock = mongoose.model('ShopStock', ShopStockSchema);
        
        // Get all items with their names
        const items = await Items.find({}, 'itemName buyPrice sellPrice emoji');
        console.log(`📦 Found ${items.length} items in the database`);
        
        // Debug: Show first few items
        console.log('\n🔍 Sample items from Items collection:');
        items.slice(0, 3).forEach(item => {
            console.log(item);
        });
        
        // Clear existing shop stock
        console.log('\n🗑️ Clearing existing shop stock...');
        await ShopStock.deleteMany({});
        console.log('✅ Existing shop stock cleared');
        
        console.log('\n📝 Populating shop stock...');
        
        // Create shop stock entries for valid items only
        const stockEntries = items
            .filter(item => item && item.itemName) // Only include items with valid names
            .map(item => ({
                itemName: item.itemName,
                stock: Math.floor(Math.random() * 10) + 1, // Random stock between 1-10
                timestamp: new Date()
            }));
        
        console.log(`Creating ${stockEntries.length} shop stock entries...`);
        
        // Debug: Show first few entries
        console.log('\n🔍 Sample stock entries to be inserted:');
        stockEntries.slice(0, 3).forEach(entry => {
            console.log(entry);
        });
        
        if (stockEntries.length > 0) {
            await ShopStock.insertMany(stockEntries);
            console.log('✅ Shop stock populated successfully!');
            
            // Display some sample items
            const sampleItems = await ShopStock.find().limit(5);
            console.log('\n📋 Final sample shop items:');
            sampleItems.forEach(item => {
                console.log(`- ${item.itemName}: ${item.stock} in stock`);
            });
        } else {
            console.log('❌ No valid items found to populate shop stock!');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
    }
}

// Run the population script
populateShopStock(); 