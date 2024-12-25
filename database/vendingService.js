// ------------------- Import necessary modules and services -------------------
const { MongoClient } = require('mongodb');
const { fetchAllItems } = require('./itemService');
require('dotenv').config();

// ------------------- Define village names, items per village, and limited item counts -------------------
const VILLAGE_NAMES = ['Rudania', 'Inariko', 'Vhintl'];
const ITEMS_PER_VILLAGE = 10;
const LIMITED_ITEMS_COUNT = 5; // Number of limited items

// ------------------- Village images and icons -------------------
const VILLAGE_IMAGES = {
    Rudania: 'https://static.wixstatic.com/media/7573f4_a0d0d9c6b91644f3b67de8612a312e42~mv2.png',
    Inariko: 'https://static.wixstatic.com/media/7573f4_c88757c19bf244aa9418254c43046978~mv2.png',
    Vhintl: 'https://static.wixstatic.com/media/7573f4_968160b5206e4d9aa1b254464d97f9a9~mv2.png',
};

const VILLAGE_ICONS = {
    Rudania: 'https://static.wixstatic.com/media/7573f4_ffb523e41dbb43c183283a5afbbc74e1~mv2.png',
    Inariko: 'https://static.wixstatic.com/media/7573f4_066600957d904b1dbce10912d698f5a2~mv2.png',
    Vhintl: 'https://static.wixstatic.com/media/7573f4_15ac377e0dd643309853fc77250a86a1~mv2.png',
};

const DEFAULT_IMAGE_URL = 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';

// ------------------- Connect to the MongoDB database -------------------
const connectToDatabase = async () => {
    const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
    try {
        await client.connect();
        return client;
    } catch (error) {
        throw error;
    }
};

// ------------------- Clear existing vending stock from the database -------------------
const clearExistingStock = async () => {
    const client = await connectToDatabase();
    const db = client.db('tinglebot');
    const stockCollection = db.collection('vending_stock');

    try {
        await stockCollection.deleteMany({});
    } catch (error) {
        console.error('❌ Error clearing vending stock:', error);
    } finally {
        await client.close();
    }
};

// ------------------- Generate monthly vending stock list -------------------
const generateVendingStockList = async () => {
    const client = await connectToDatabase();
    const db = client.db('tinglebot');
    const stockCollection = db.collection('vending_stock');

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

        // Filter items for Merchants and Shopkeepers
        const merchantItems = allItems.filter(item => item.vending && item.itemRarity >= 1 && item.itemRarity <= 10);
        const shopkeeperItems = allItems.filter(item => item.vending && item.itemRarity >= 1 && item.itemRarity <= 10);

        if (merchantItems.length === 0 || shopkeeperItems.length === 0) {
            throw new Error('Insufficient items available for generating stock.');
        }

        // Separate priority items for Shopkeepers
        const priorityItemsForShopkeepers = shopkeeperItems.filter(item =>
            priorityItems.includes(item.itemName)
        );

        // Helper function to generate prices ending in 0 or 5
        const generateRoundedPrice = (min, max) => {
            const randomPrice = min + Math.floor(Math.random() * (max - min + 1));
            const adjustedPrice = Math.round(randomPrice / 5) * 5; // Ensure price ends in 0 or 5
            return Math.min(adjustedPrice, max); // Clamp to max
        };

        // Helper function to apply weighted probability for Shopkeepers
        const selectItemWithWeight = (items, weightThreshold) => {
            const weightedItems = items.flatMap(item => {
                const weight = priorityItems.includes(item.itemName) ? weightThreshold : 1; // Priority items get 5x weight
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
                    const points = generateRoundedPrice(5, 250); // Merchant items cost 5–250
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
                    const points = generateRoundedPrice(50, 300); // Shopkeeper items cost 100–300
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

        // Generate limited items (rarity 7+ and stock 1-5)
        const limitedItems = [];
        while (limitedItems.length < LIMITED_ITEMS_COUNT) {
            const randomIndex = Math.floor(Math.random() * allItems.length);
            const selectedItem = allItems[randomIndex];

            // Ensure uniqueness and proper rarity
            if (!limitedItems.some(item => item.itemName === selectedItem.itemName) &&
                selectedItem.itemRarity >= 7 && selectedItem.vending) {
                const points = generateRoundedPrice(250, 500); // Limited items cost 250–500
                const stock = Math.floor(Math.random() * 5) + 1;

                limitedItems.push({
                    itemName: selectedItem.itemName,
                    emoji: selectedItem.emoji,
                    points,
                    stock,
                });
            }
        }

        // Insert the generated stock list into the database
        await stockCollection.insertOne({
            month: currentMonth,
            stockList,
            limitedItems,
            createdAt: new Date(),
        });
    } catch (error) {
        console.error('❌ Error generating vending stock list:', error);
    } finally {
        await client.close();
    }
};


// ------------------- Get the current month's vending stock list -------------------
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
            stockList: normalizedStockList, // Replace with normalized stock list
        };
    } catch (error) {
        console.error('[getCurrentVendingStockList]: Error:', error);
        throw error;
    } finally {
        await client.close();
    }
};


// ------------------- Get limited items for the current month -------------------
const getLimitedItems = async () => {
    const client = await connectToDatabase();
    const db = client.db('tinglebot');
    const stockCollection = db.collection('vending_stock');

    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentStock = await stockCollection.findOne({ month: currentMonth });
        return currentStock ? currentStock.limitedItems : [];
    } catch (error) {
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Update the stock quantity of a limited item by name -------------------
const updateItemStockByName = async (itemName, quantity) => {
    const client = await connectToDatabase();
    const db = client.db('tinglebot');
    const stockCollection = db.collection('vending_stock');

    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentStock = await stockCollection.findOne({ month: currentMonth });

        if (!currentStock) {
            throw new Error('No current stock found');
        }

        const itemIndex = currentStock.limitedItems.findIndex(item => item.itemName === itemName);

        if (itemIndex === -1) {
            throw new Error('Item not found in limited stock');
        }

        // Update the stock quantity
        currentStock.limitedItems[itemIndex].stock -= quantity;

        // Save the updated stock back to the database
        await stockCollection.updateOne(
            { month: currentMonth },
            { $set: { limitedItems: currentStock.limitedItems } }
        );
    } catch (error) {
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Adds or updates stock for a specific item belonging to a character-------------------

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
        console.error('[updateVendingStock]: Error updating stock:', error);
        throw error;
    } finally {
        await client.close();
    }
}



// ------------------- Export the service functions -------------------
module.exports = {
    clearExistingStock,
    generateVendingStockList,
    getCurrentVendingStockList,
    VILLAGE_IMAGES,
    VILLAGE_ICONS,
    getLimitedItems,
    updateItemStockByName,
    updateVendingStock
};

