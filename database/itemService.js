// ------------------- Import necessary modules and environment variables -------------------
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();
const ItemModel = require('../models/ItemModel'); // Ensure correct import
const generalCategories = require('../models/GeneralItemCategories'); // Correct import

// ------------------- Connect to the Inventories database -------------------
const connectToInventories = async () => {
    const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
    try {
        await client.connect();
        return client;
    } catch (error) {
        throw error;
    }
};

// ------------------- Fetch all items from the database -------------------
const fetchAllItems = async () => {
    const client = await connectToInventories();
    const db = client.db('tinglebot');
    const items = await db.collection('items').find().toArray();
    await client.close();
    return items;
};

// ------------------- Fetch item by name from the database -------------------
async function fetchItemByName(itemName) {
    const client = await connectToInventories();
    const db = client.db('tinglebot');
    const normalizedItemName = itemName.trim().toLowerCase();

    try {
        console.log(`[fetchItemByName]: Searching for item "${normalizedItemName}"`);

        // Fetch items that match exactly (case-insensitive)
        const item = await db.collection('items').findOne({
            itemName: new RegExp(`^${normalizedItemName}$`, 'i')
        });

        if (!item) {
            console.warn(`[fetchItemByName]: No item found for "${normalizedItemName}"`);
            return null;
        }

        console.log(`[fetchItemByName]: Found item: ${item.itemName}, ID: ${item._id}`);
        return item;
    } catch (error) {
        console.error("[fetchItemByName]: Error fetching item by name:", error);
        throw error;
    } finally {
        await client.close();
    }
}


// ------------------- Fetch item by ID from the database -------------------
const fetchItemById = async (itemId) => {
    const client = await connectToInventories();
    const db = client.db('tinglebot');
    const item = await db.collection('items').findOne({ _id: ObjectId(itemId) });
    await client.close();
    return item;
};

// ------------------- Fetch items by monster type or drop -------------------
const fetchItemsByMonster = async (monsterName) => {
    const client = await connectToInventories();
    const db = client.db('tinglebot');
    const query = {
        $or: [
            { monsterList: monsterName },
            { [monsterName]: true }
        ]
    };
    const items = await db.collection('items').find(query).toArray();
    await client.close();
    return items.filter(item => item.itemName && item.itemRarity);
};

// ------------------- Map general item names to specific items -------------------
const getSpecificItems = (generalItemName) => {
    return generalCategories[generalItemName] || [];
};

// ------------------- Fetch craftable items and check material availability -------------------
const fetchCraftableItemsAndCheckMaterials = async (inventory) => {
    const client = await connectToInventories();
    const db = client.db('tinglebot');
    const craftableItems = await db.collection('items').find({ crafting: true }).toArray();
    const craftableItemsWithMaterials = [];

    for (const item of craftableItems) {
        const { itemName, craftingMaterial } = item;
        if (!craftingMaterial || craftingMaterial.length === 0) {
            continue;
        }
        const allMaterialsAvailable = checkMaterialAvailability(craftingMaterial, inventory);
        if (allMaterialsAvailable) {
            craftableItemsWithMaterials.push(item);
        }
    }

    await client.close();
    return craftableItemsWithMaterials;
};

// ------------------- Check if required materials are present in the inventory -------------------
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

// ------------------- Check if a specific material is available in the inventory -------------------
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
        return false;
    }
};

// ------------------- Fetch and sort items by rarity -------------------
const fetchAndSortItemsByRarity = async (inventoryItems) => {
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
};

// ------------------- Get items that can be crafted using a specific ingredient -------------------
const getIngredientItems = async (ingredientName) => {
    const items = await fetchAllItems();
    const craftingItems = items.filter(item => item.crafting);

    // Find direct matches
    const directMatches = craftingItems.filter(item => 
        item.craftingMaterial.some(material => material.itemName === ingredientName)
    );

    // Format the result
    const formattedResults = directMatches.map(item => ({
        name: `${item.emoji || '🔹'} ${item.itemName} | ${item.staminaToCraft} 🟩 | ${item.craftingJobs.join(', ')}`,
        value: item.itemName,
        craftingMaterial: item.craftingMaterial
    }));

    return formattedResults;
};

// New function to fetch multiple items by name or ID in batch
const fetchItemsByIds = async (itemIds) => {
    const client = await connectToInventories();
    const db = client.db('tinglebot');
    try {
        const items = await db.collection('items').find({ _id: { $in: itemIds } }).toArray();
        return items;
    } catch (error) {
        throw error;
    } finally {
        await client.close();
    }
};

// ------------------- Fetch item rarity by name -------------------
const fetchItemRarityByName = async (itemName) => {
    const client = await connectToInventories();
    const db = client.db('tinglebot');
    const normalizedItemName = itemName.trim().toLowerCase();
    try {
        const item = await db.collection('items').findOne({
            itemName: new RegExp(`^${normalizedItemName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i')
        });
        return item ? item.itemRarity : null; // Return the item's rarity or null if not found
    } catch (error) {
        throw error;
    } finally {
        await client.close();
    }
};


// ------------------- Fetch items by category from the database -------------------
const fetchItemsByCategory = async (category) => {
    const client = await connectToInventories();
    const db = client.db('tinglebot');

    try {
        // Fetch items matching the category
        const items = await db.collection('items').find({
            category: { $regex: `^${category}$`, $options: 'i' } // Case-insensitive match
        }).toArray();

        if (!items || items.length === 0) {
            console.warn(`❌ No items found in category: ${category}`);
            return []; // Return empty array if no matches are found
        }

        return items;
    } catch (error) {
        console.error("❌ Error fetching items by category:", error);
        throw error;
    } finally {
        await client.close();
    }
};


// ------------------- Export functions -------------------
module.exports = {
    fetchItemByName,
    fetchItemsByIds,
    fetchItemById,
    fetchItemsByMonster,
    fetchCraftableItemsAndCheckMaterials,
    getSpecificItems,
    fetchAllItems,
    fetchAndSortItemsByRarity,
    getIngredientItems,
    fetchItemRarityByName,
    fetchItemsByCategory
};

