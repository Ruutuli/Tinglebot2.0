// ------------------- Import MongoDB client and environment variables -------------------
const { MongoClient } = require('mongodb');
require('dotenv').config();

// ------------------- MongoDB connection URI and connection variable -------------------
const inventoriesUri = process.env.MONGODB_INVENTORIES_URI;
let inventoriesDbConnection = null;

// ------------------- Connect to the Inventories database -------------------
const connectToInventories = async () => {
    if (!inventoriesDbConnection) {
        const client = new MongoClient(inventoriesUri, {});
        await client.connect();
        inventoriesDbConnection = client.db(); // Connect to the default database
    }
    return inventoriesDbConnection;
};

// ------------------- Get the inventory collection for a character -------------------
const getInventoryCollection = async (characterName) => {
    if (typeof characterName !== 'string') {
        throw new Error('Character name must be a string.');
    }
    const inventoriesDb = await connectToInventories();
    const collectionName = characterName.trim().toLowerCase();
    return inventoriesDb.collection(collectionName);
};

// ------------------- Export the connection and collection functions -------------------
module.exports = {
    connectToInventories,
    getInventoryCollection,
};

