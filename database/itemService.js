// =================== STANDARD LIBRARIES ===================
// ------------------- Load environment configuration -------------------
require('dotenv').config();

// ------------------- Import MongoDB client and ObjectId -------------------
const { MongoClient, ObjectId } = require('mongodb');


const { handleError } = require('../utils/globalErrorHandler');
// =================== DATABASE MODELS ===================
// ------------------- Import local database models -------------------
// Note: Sorted alphabetically by variable name.
const generalCategories = require('../models/GeneralItemCategories');
const ItemModel         = require('../models/ItemModel');


// =================== DATABASE CONNECTION ===================
// ------------------- Establish connection to the Inventories database -------------------
// This function connects to the MongoDB instance using the URI stored in environment variables.
const connectToInventories = async () => {
    const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
    try {
        await client.connect();
        return client;
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error connecting to Inventories database:', error);
        throw error;
    }
};


// =================== UTILITY FUNCTIONS ===================
// ------------------- Map general item names to specific items -------------------
// Returns a list of specific items for a given general item name.
const getSpecificItems = (generalItemName) => {
    return generalCategories[generalItemName] || [];
};

// ------------------- Check if required materials are available -------------------
// Iterates through each required crafting material and checks if it is present in the inventory.
const checkMaterialAvailability = (craftingMaterials, inventory) => {
    let allMaterialsAvailable = true;
    for (const material of craftingMaterials) {
        const { _id, itemName, quantity } = material;
        if (!_id) {
            const specificItems = getSpecificItems(itemName);
            if (specificItems.length === 0) {
                allMaterialsAvailable = false;
                continue;
            }
            let specificMaterialAvailable = false;
            for (const specificItem of specificItems) {
                if (checkMaterial(null, specificItem, quantity, inventory)) {
                    specificMaterialAvailable = true;
                    break;
                }
            }
            if (!specificMaterialAvailable) {
                allMaterialsAvailable = false;
            }
        } else {
            if (!checkMaterial(_id, itemName, quantity, inventory)) {
                allMaterialsAvailable = false;
            }
        }
    }
    return allMaterialsAvailable;
};

// ------------------- Verify if a specific material is present in the inventory -------------------
// Checks whether the inventory contains the material by ID or name and if the quantity meets the requirement.
const checkMaterial = (materialId, materialName, quantityNeeded, inventory) => {
    try {
        if (!materialId && !materialName) {
            return false;
        }
        const itemById = materialId
            ? inventory.find(inv => inv.itemId && inv.itemId.toString() === materialId.toString())
            : inventory.find(inv => inv.itemName === materialName);
        return itemById && itemById.quantity >= quantityNeeded;
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error checking material:', error);
        return false;
    }
};

// =================== DATABASE SERVICES ===================
// ------------------- Fetch all items from the database -------------------
// Retrieves all items from the 'items' collection in the 'tinglebot' database.
const fetchAllItems = async () => {
    const client = await connectToInventories();
    try {
        const db = client.db('tinglebot');
        const items = await db.collection('items').find().toArray();
        return items;
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error fetching all items:', error);
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Fetch item by name -------------------
// Retrieves a single item from the database that exactly matches the provided name (case-insensitive).
async function fetchItemByName(itemName) {
    const client = await connectToInventories();
    try {
        const db = client.db('tinglebot');
        const normalizedItemName = itemName.trim().toLowerCase();

        // Escape regex metacharacters to prevent invalid RegExp errors
        const escapedName = normalizedItemName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

        const item = await db.collection('items').findOne({
            itemName: new RegExp(`^${escapedName}$`, 'i')
        });

        if (!item) {
            console.warn(`[itemService.js]: ⚠️ No item found for "${normalizedItemName}"`);
            return null;
        }
        return item;
    } catch (error) {
        handleError(error, 'itemService.js');
        console.error('[itemService.js]: ❌ Error fetching item by name:', error);
        throw error;
    } finally {
        await client.close();
    }
}

// ------------------- Fetch item by ID -------------------
// Retrieves an item from the database by its MongoDB ObjectId.
const fetchItemById = async (itemId) => {
    const client = await connectToInventories();
    try {
        const db = client.db('tinglebot');
        const item = await db.collection('items').findOne({ _id: ObjectId(itemId) });
        return item;
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error fetching item by ID:', error);
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Fetch items by monster type or drop -------------------
// Retrieves items associated with a given monster by checking specific fields.
const fetchItemsByMonster = async (monsterName) => {
    const client = await connectToInventories();
    try {
        const db = client.db('tinglebot');
        const query = {
            $or: [
                { monsterList: monsterName },
                { [monsterName]: true }
            ]
        };
        const items = await db.collection('items').find(query).toArray();
        return items.filter(item => item.itemName && item.itemRarity);
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error fetching items by monster:', error);
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Fetch craftable items and check material availability -------------------
// Retrieves items marked as craftable and then checks if all required crafting materials are available in the inventory.
const fetchCraftableItemsAndCheckMaterials = async (inventory) => {
    const client = await connectToInventories();
    try {
        const db = client.db('tinglebot');
        const craftableItems = await db.collection('items').find({ crafting: true }).toArray();
        const craftableItemsWithMaterials = [];

        for (const item of craftableItems) {
            const { craftingMaterial } = item;
            if (!craftingMaterial || craftingMaterial.length === 0) {
                continue;
            }
            const allMaterialsAvailable = checkMaterialAvailability(craftingMaterial, inventory);
            if (allMaterialsAvailable) {
                craftableItemsWithMaterials.push(item);
            }
        }
        return craftableItemsWithMaterials;
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error fetching craftable items and checking materials:', error);
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Fetch and sort items by rarity -------------------
// Enriches inventory items with rarity information from the database and sorts them accordingly.
const fetchAndSortItemsByRarity = async (inventoryItems) => {
    try {
        const itemIds = inventoryItems.map(item => item.itemId);
        const itemsFromDB = await ItemModel.find({ _id: { $in: itemIds } }).lean();

        const itemsWithRarity = inventoryItems.map(inventoryItem => {
            const dbItem = itemsFromDB.find(dbItem => dbItem._id.toString() === inventoryItem.itemId.toString());
            return {
                ...inventoryItem,
                itemRarity: dbItem ? dbItem.itemRarity : 1 // Default to 1 if no rarity found
            };
        });

        itemsWithRarity.sort((a, b) => a.itemRarity - b.itemRarity);
        return itemsWithRarity;
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error fetching and sorting items by rarity:', error);
        throw error;
    }
};

// ------------------- Get items that can be crafted using a specific ingredient -------------------
// Searches for craftable items that require the given ingredient and returns a formatted list.
const getIngredientItems = async (ingredientName) => {
    try {
        const items = await fetchAllItems();
        const craftingItems = items.filter(item => item.crafting);

        // Find direct matches where the ingredient is part of the crafting materials.
        const directMatches = craftingItems.filter(item =>
            item.craftingMaterial.some(material => material.itemName === ingredientName)
        );

        // Format the results with markdown for enhanced readability.
        const formattedResults = directMatches.map(item => ({
            name: `**${item.emoji || '🔹'} ${item.itemName}** | ${item.staminaToCraft} 🟩 | ${item.craftingJobs.join(', ')}`,
            value: item.itemName,
            craftingMaterial: item.craftingMaterial
        }));

        return formattedResults;
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error fetching ingredient items:', error);
        throw error;
    }
};

// ------------------- Fetch multiple items by their IDs -------------------
// Retrieves a batch of items from the database based on an array of MongoDB ObjectIds.
const fetchItemsByIds = async (itemIds) => {
    const client = await connectToInventories();
    try {
        const db = client.db('tinglebot');
        const items = await db.collection('items').find({ _id: { $in: itemIds } }).toArray();
        return items;
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error fetching items by IDs:', error);
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Fetch item rarity by name -------------------
// Retrieves the rarity of an item based on its name (case-insensitive) from the database.
const fetchItemRarityByName = async (itemName) => {
    const client = await connectToInventories();
    try {
        const db = client.db('tinglebot');
        const normalizedItemName = itemName.trim().toLowerCase();
        const escapedName = normalizedItemName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const item = await db.collection('items').findOne({
            itemName: new RegExp(`^${escapedName}$`, 'i')
        });
        return item ? item.itemRarity : null;
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error fetching item rarity by name:', error);
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Fetch items by category -------------------
// Retrieves items from the database that match a specific category (case-insensitive).
const fetchItemsByCategory = async (category) => {
    const client = await connectToInventories();
    try {
        const db = client.db('tinglebot');
        const items = await db.collection('items').find({
            category: { $regex: `^${category}$`, $options: 'i' }
        }).toArray();

        if (!items || items.length === 0) {
            console.warn(`[itemService.js]: ⚠️ No items found in category: ${category}`);
            return [];
        }
        return items;
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error fetching items by category:', error);
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Fetch all distinct valid weapon subtypes -------------------
// Retrieves a list of distinct weapon subtypes from the database, converted to lowercase.
const fetchValidWeaponSubtypes = async () => {
    const client = await connectToInventories();
    try {
        const db = client.db('tinglebot');
        const subtypes = await db.collection('items').distinct('subtype');
        return subtypes.filter(Boolean).map(sub => sub.toLowerCase());
    } catch (error) {
    handleError(error, 'itemService.js');

        console.error('[itemService.js]: ❌ Error fetching valid weapon subtypes:', error);
        return [];
    } finally {
        await client.close();
    }
};


// =================== EXPORT FUNCTIONS ===================
// ------------------- Export all database service and utility functions -------------------
module.exports = {
    // Database Services
    fetchAllItems,
    fetchItemByName,
    fetchItemById,
    fetchItemsByMonster,
    fetchCraftableItemsAndCheckMaterials,
    fetchAndSortItemsByRarity,
    getIngredientItems,
    fetchItemsByIds,
    fetchItemRarityByName,
    fetchItemsByCategory,
    fetchValidWeaponSubtypes,
    // Utility Functions
    getSpecificItems
};
