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

    try {
        const currentMonth = new Date().getMonth() + 1;

        // Clear existing stock for the new month
        await clearExistingStock();

        const allItems = await fetchAllItems();
        const vendingItems = allItems.filter(item => item.vending && item.itemRarity <= 7);

        if (vendingItems.length === 0) {
            return;
        }

        // Create stock list for each village
        const stockList = {};
        for (const villageName of VILLAGE_NAMES) {
            stockList[villageName] = [];

            while (stockList[villageName].length < ITEMS_PER_VILLAGE) {
                const randomIndex = Math.floor(Math.random() * vendingItems.length);
                const selectedItem = vendingItems[randomIndex];

                if (!stockList[villageName].some(item => item.itemName === selectedItem.itemName)) {
                    const points = Math.floor(Math.random() * ((250 / 5) - 1) + 1) * 5 + 5;
                    const vendingType = Math.random() < 0.5 ? 'Shopkeeper' : 'Merchant';

                    stockList[villageName].push({
                        itemName: selectedItem.itemName,
                        emoji: selectedItem.emoji,
                        points,
                        vendingType,
                        itemRarity: selectedItem.itemRarity,
                    });
                }
            }
        }

        // Generate limited items
        const limitedItems = [];
        while (limitedItems.length < LIMITED_ITEMS_COUNT) {
            const randomIndex = Math.floor(Math.random() * allItems.length);
            const selectedItem = allItems[randomIndex];

            if (!limitedItems.some(item => item.itemName === selectedItem.itemName) &&
                selectedItem.itemRarity >= 7 && selectedItem.vending) {
                const points = Math.floor(Math.random() * ((500 - 250) / 5 + 1)) * 5 + 250;
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
        return currentStock || null;
    } catch (error) {
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

// ------------------- Export the service functions -------------------
module.exports = {
    clearExistingStock,
    generateVendingStockList,
    getCurrentVendingStockList,
    VILLAGE_IMAGES,
    VILLAGE_ICONS,
    getLimitedItems,
    updateItemStockByName,
};

