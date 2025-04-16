// =================== STANDARD LIBRARIES ===================
// ------------------- Configure Environment Variables -------------------
// Load environment variables from the .env file.
require('dotenv').config();

// ------------------- Import MongoDB Client -------------------
// Import the MongoClient from the mongodb package.
const { MongoClient } = require('mongodb');



const { handleError } = require('../utils/globalErrorHandler');
// =================== DATABASE SERVICES ===================
// ------------------- Import Item Service -------------------
// Import the fetchAllItems function from the itemService module.
const { fetchAllItems } = require('./itemService');



// =================== CONSTANTS ===================
// ------------------- Village Names and Stock Configuration -------------------
// Define village names and configuration for items per village and limited items count.
const VILLAGE_NAMES = ['Rudania', 'Inariko', 'Vhintl'];
const ITEMS_PER_VILLAGE = 10;
const LIMITED_ITEMS_COUNT = 5; // Number of limited items

// ------------------- Village Images -------------------
// URLs for village images.
const VILLAGE_IMAGES = {
    Rudania: 'https://static.wixstatic.com/media/7573f4_a0d0d9c6b91644f3b67de8612a312e42~mv2.png',
    Inariko: 'https://static.wixstatic.com/media/7573f4_c88757c19bf244aa9418254c43046978~mv2.png',
    Vhintl: 'https://static.wixstatic.com/media/7573f4_968160b5206e4d9aa1b254464d97f9a9~mv2.png',
};

// ------------------- Village Icons -------------------
// URLs for village icons.
const VILLAGE_ICONS = {
    Rudania: 'https://static.wixstatic.com/media/7573f4_ffb523e41dbb43c183283a5afbbc74e1~mv2.png',
    Inariko: 'https://static.wixstatic.com/media/7573f4_066600957d904b1dbce10912d698f5a2~mv2.png',
    Vhintl: 'https://static.wixstatic.com/media/7573f4_15ac377e0dd643309853fc77250a86a1~mv2.png',
};

const DEFAULT_IMAGE_URL = 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';



// =================== DATABASE CONNECTIONS ===================
// ------------------- Connect to the MongoDB Database -------------------
// Establish a connection to the MongoDB database using the URI from environment variables.
const connectToDatabase = async () => {
    const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
    try {
        await client.connect();
        return client;
    } catch (error) {
    handleError(error, 'vendingService.js');

        console.error('[vendingService.js]: ❌ Error connecting to database:', error);
        throw error;
    }
};



// =================== DATABASE SERVICES ===================
// ------------------- Clear Existing Vending Stock -------------------
// Clears all existing records from the 'vending_stock' collection.
const clearExistingStock = async () => {
    const client = await connectToDatabase();
    const db = client.db('tinglebot');
    const stockCollection = db.collection('vending_stock');

    try {
        await stockCollection.deleteMany({});
    } catch (error) {
    handleError(error, 'vendingService.js');

        console.error('[vendingService.js]: ❌ Error clearing vending stock:', error);
    } finally {
        await client.close();
    }
};

// ------------------- Generate Monthly Vending Stock List -------------------
// Generates a monthly vending stock list by selecting items for each village and limited items.
// The function filters items for Merchants and Shopkeepers, applies price calculations, and stores the result.
const generateVendingStockList = async () => {
    const client = await connectToDatabase();
    const db = client.db('tinglebot');
    const stockCollection = db.collection('vending_stock');

    // Priority items for shopkeepers
    const priorityItems = [
        "Leather", "Eldin Ore", "Wood", "Rock Salt", "Goat Butter", "Cotton", "Hylian Rice", "Iron bar",
        "Tabantha Wheat", "Wool", "Fresh Milk", "Goron Ore", "Bird Egg", "Luminous Stone", "Goron Spice",
        "Chuchu Jelly", "Gold Dust", "Cane Sugar", "Gold Bar", "Fancy Fabric", "Vintage Linen", "Bird Feather"
    ];

    try {
        const currentMonth = new Date().getMonth() + 1;

        // Clear existing stock for the new month
        await clearExistingStock();

        const allItems = await fetchAllItems();

        // Filter items for Merchants and Shopkeepers (vending items with rarity between 1 and 10)
        const merchantItems = allItems.filter(item => item.vending && item.itemRarity >= 1 && item.itemRarity <= 10);
        const shopkeeperItems = allItems.filter(item => item.vending && item.itemRarity >= 1 && item.itemRarity <= 10);

        if (merchantItems.length === 0 || shopkeeperItems.length === 0) {
            throw new Error('[vendingService.js]: ❌ Insufficient items available for generating stock.');
        }

        // Separate priority items for Shopkeepers (priority items receive higher weight)
        const priorityItemsForShopkeepers = shopkeeperItems.filter(item =>
            priorityItems.includes(item.itemName)
        );

        // ------------------- Helper Function: Generate Rounded Price -------------------
        // Generates a random price between min and max, rounded to the nearest multiple of 5.
        const generateRoundedPrice = (min, max) => {
            const randomPrice = min + Math.floor(Math.random() * (max - min + 1));
            const adjustedPrice = Math.round(randomPrice / 5) * 5;
            return Math.min(adjustedPrice, max);
        };

        // ------------------- Helper Function: Select Item With Weight -------------------
        // Applies weighted probability to select an item from the list; priority items receive higher weight.
        const selectItemWithWeight = (items, weightThreshold) => {
            const weightedItems = items.flatMap(item => {
                const weight = priorityItems.includes(item.itemName) ? weightThreshold : 1;
                return Array(weight).fill(item);
            });
            const randomIndex = Math.floor(Math.random() * weightedItems.length);
            return weightedItems[randomIndex];
        };

        // Create stock list for each village
        const stockList = {};
        for (const villageName of VILLAGE_NAMES) {
            stockList[villageName] = [];

            // Generate 4 items for Merchants
            while (stockList[villageName].filter(item => item.vendingType === 'Merchant').length < 4) {
                const randomIndex = Math.floor(Math.random() * merchantItems.length);
                const selectedItem = merchantItems[randomIndex];

                if (!stockList[villageName].some(item => item.itemName === selectedItem.itemName)) {
                    const points = generateRoundedPrice(5, 250); // Merchant items cost between 5 and 250 points
                    stockList[villageName].push({
                        itemName: selectedItem.itemName,
                        emoji: selectedItem.emoji,
                        points,
                        vendingType: 'Merchant',
                        itemRarity: selectedItem.itemRarity,
                        village: villageName,
                    });
                }
            }

            // Generate 4 items for Shopkeepers
            while (stockList[villageName].filter(item => item.vendingType === 'Shopkeeper').length < 4) {
                const selectedItem = selectItemWithWeight(shopkeeperItems, 5); // Priority items get 5x weight

                if (!stockList[villageName].some(item => item.itemName === selectedItem.itemName)) {
                    const points = generateRoundedPrice(50, 300); // Shopkeeper items cost between 50 and 300 points
                    stockList[villageName].push({
                        itemName: selectedItem.itemName,
                        emoji: selectedItem.emoji,
                        points,
                        vendingType: 'Shopkeeper',
                        itemRarity: selectedItem.itemRarity,
                        village: villageName,
                    });
                }
            }
        }

        // Generate limited items (items with rarity 7+ and unique, with stock between 1 and 5)
        const limitedItems = [];
        while (limitedItems.length < LIMITED_ITEMS_COUNT) {
            const randomIndex = Math.floor(Math.random() * allItems.length);
            const selectedItem = allItems[randomIndex];

            if (!limitedItems.some(item => item.itemName === selectedItem.itemName) &&
                selectedItem.itemRarity >= 7 && selectedItem.vending) {
                const points = generateRoundedPrice(250, 500); // Limited items cost between 250 and 500 points
                const stock = Math.floor(Math.random() * 5) + 1;
                limitedItems.push({
                    itemName: selectedItem.itemName,
                    emoji: selectedItem.emoji,
                    points,
                    stock,
                });
            }
        }

        // Insert the generated stock list into the 'vending_stock' collection
        await stockCollection.insertOne({
            month: currentMonth,
            stockList,
            limitedItems,
            createdAt: new Date(),
        });
    } catch (error) {
    handleError(error, 'vendingService.js');

        console.error('[vendingService.js]: ❌ Error generating vending stock list:', error);
    } finally {
        await client.close();
    }
};

// ------------------- Get Current Month's Vending Stock List -------------------
// Retrieves the vending stock list for the current month from the database and normalizes village names.
const getCurrentVendingStockList = async () => {
    const client = await connectToDatabase();
    const db = client.db('tinglebot');
    const stockCollection = db.collection('vending_stock');

    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentStock = await stockCollection.findOne({ month: currentMonth });
        if (!currentStock) {
            return null;
        }

        // Normalize village names in the stock list
        const normalizedStockList = {};
        for (const village in currentStock.stockList) {
            const normalizedVillage = village.toLowerCase().trim();
            normalizedStockList[normalizedVillage] = currentStock.stockList[village];
        }

        return {
            ...currentStock,
            stockList: normalizedStockList,
        };
    } catch (error) {
    handleError(error, 'vendingService.js');

        console.error('[vendingService.js]: ❌ Error retrieving current vending stock list:', error);
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Get Limited Items for Current Month -------------------
// Retrieves limited items from the vending stock for the current month.
const getLimitedItems = async () => {
    const client = await connectToDatabase();
    const db = client.db('tinglebot');
    const stockCollection = db.collection('vending_stock');

    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentStock = await stockCollection.findOne({ month: currentMonth });
        return currentStock ? currentStock.limitedItems : [];
    } catch (error) {
    handleError(error, 'vendingService.js');

        console.error('[vendingService.js]: ❌ Error retrieving limited items:', error);
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Update Limited Item Stock by Name -------------------
// Updates the stock quantity of a limited item identified by its name.
const updateItemStockByName = async (itemName, quantity) => {
    const client = await connectToDatabase();
    const db = client.db('tinglebot');
    const stockCollection = db.collection('vending_stock');

    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentStock = await stockCollection.findOne({ month: currentMonth });

        if (!currentStock) {
            throw new Error('[vendingService.js]: No current stock found');
        }

        const itemIndex = currentStock.limitedItems.findIndex(item => item.itemName === itemName);
        if (itemIndex === -1) {
            throw new Error('[vendingService.js]: Item not found in limited stock');
        }

        // Update the stock quantity
        currentStock.limitedItems[itemIndex].stock -= quantity;

        // Save the updated stock back to the database
        await stockCollection.updateOne(
            { month: currentMonth },
            { $set: { limitedItems: currentStock.limitedItems } }
        );
    } catch (error) {
    handleError(error, 'vendingService.js');

        console.error('[vendingService.js]: ❌ Error updating item stock by name:', error);
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Update Vending Stock for a Character -------------------
// Adds or updates the vending stock entry for a specific item associated with a character.
async function updateVendingStock({ characterId, itemName, stockQty, tokenPrice, artPrice, otherPrice, tradesOpen }) {
    const client = await connectToDatabase();
    const db = client.db('tinglebot');
    const stockCollection = db.collection('vending_stock');

    try {
        const stockEntry = {
            characterId,
            itemName,
            stockQty,
            tokenPrice,
            artPrice,
            otherPrice,
            tradesOpen,
            updatedAt: new Date()
        };

        await stockCollection.updateOne(
            { characterId, itemName },
            { $set: stockEntry },
            { upsert: true }
        );
    } catch (error) {
    handleError(error, 'vendingService.js');

        console.error('[vendingService.js]: ❌ Error updating vending stock:', error);
        throw error;
    } finally {
        await client.close();
    }
}



// =================== EXPORT FUNCTIONS ===================
// ------------------- Export Vending Service Functions -------------------
// Exports all service functions and constants for external use.
module.exports = {
    connectToDatabase,
    clearExistingStock,
    generateVendingStockList,
    getCurrentVendingStockList,
    getLimitedItems,
    updateItemStockByName,
    updateVendingStock,
    VILLAGE_IMAGES,
    VILLAGE_ICONS
};
