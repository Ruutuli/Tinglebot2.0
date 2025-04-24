const { handleError } = require("../utils/globalErrorHandler");
// ============================================================================
// Database Connections
// ------------------- Required functions will be initialized later -------------------
// We'll use dependency injection to avoid circular dependencies
let dbFunctions = {
 connectToInventories: null,
 fetchItemByName: null,
 fetchCharacterById: null,
};
// Initialize function to set the required db functions
function initializeInventoryUtils(dbModuleFunctions) {
 dbFunctions = {
  ...dbFunctions,
  ...dbModuleFunctions,
 };
}

// ============================================================================
// Utility Functions
// ------------------- Importing utility functions -------------------
const {
 appendSheetData,
 authorizeSheets,
 getSheetIdByTitle,
 readSheetData,
 writeSheetData,
} = require("../utils/googleSheetsUtils");
const { extractSpreadsheetId } = require("../utils/validation");
const { promptUserForSpecificItems } = require("../utils/itemUtils");

// ============================================================================
// Database Models
// ------------------- Importing database models -------------------
const generalCategories = require("../models/GeneralItemCategories");

// ============================================================================
// General Utility Functions
// ------------------- Format Date and Time -------------------
// Formats a given date in EST with a specific format.
function formatDateTime(date) {
 const options = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "America/New_York",
 };
 return (
  new Intl.DateTimeFormat("en-US", options)
   .format(new Date(date))
   .replace(",", " |") + " EST"
 );
}

// ------------------- Escape Regular Expression -------------------
// Escapes special characters in a string for use in a regular expression.
function escapeRegExp(string) {
 return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// Inventory Management Functions
// ------------------- Sync Inventory to Database and Google Sheets -------------------
// Synchronizes inventory data by updating the database and reflecting changes in Google Sheets.
async function syncToInventoryDatabase(character, item, interaction) {
 try {
  if (!dbFunctions.connectToInventories) {
   throw new Error("Database functions not initialized in inventoryUtils");
  }

  const inventoriesConnection = await dbFunctions.connectToInventories();
  const db = inventoriesConnection.useDb("inventories");
  const inventoryCollection = db.collection(character.name.toLowerCase());

  const existingItem = await inventoryCollection.findOne({
   characterId: item.characterId,
   itemName: String(item.itemName).trim().toLowerCase(),
  });

  if (existingItem) {
   await inventoryCollection.updateOne(
    {
     characterId: item.characterId,
     itemName: String(item.itemName).trim().toLowerCase(),
    },
    { $inc: { quantity: item.quantity } }
   );
  } else {
   await inventoryCollection.insertOne(item);
  }

  const auth = await authorizeSheets();
  const spreadsheetId = extractSpreadsheetId(character.inventory);
  const range = "loggedInventory!A2:M";
  const sheetData = await readSheetData(auth, spreadsheetId, range);

  const rowIndex = sheetData.findIndex(
   (row) => row[0] === character.name && row[1] === item.itemName
  );
  if (rowIndex !== -1) {
   sheetData[rowIndex] = [
    character.name,
    item.itemName,
    item.quantity,
    item.category,
    item.type,
    item.subtype,
    item.obtain,
    item.job,
    item.perk,
    item.location,
    item.link,
    formatDateTime(item.date),
    item.synced,
   ];
   const updateRange = `loggedInventory!A${rowIndex + 2}:M${rowIndex + 2}`;
   await writeSheetData(auth, spreadsheetId, updateRange, [
    sheetData[rowIndex],
   ]);
  }
 } catch (error) {
  handleError(error, "inventoryUtils.js");
  console.error(
   "[inventoryUtils.js]: logs Error syncing to inventory database:",
   error
  );
  throw error;
 }
}

// ------------------- Add Single Item to Inventory Database -------------------
// Adds a single item to a character's inventory; updates quantity if the item already exists.
async function addItemInventoryDatabase(
 characterId,
 itemName,
 quantity,
 interaction,
 obtain = ""
) {
 try {
  if (!interaction) {
   throw new Error("Interaction object is undefined.");
  }
  const character = await fetchCharacterById(characterId);
  if (!character) {
   throw new Error(`Character with ID ${characterId} not found`);
  }
  console.log(
   `[inventoryUtils.js]: logs Found character: ${character.name}, ID: ${character._id}`
  );

  const inventoriesConnection = await connectToInventories();
  const db = inventoriesConnection.useDb("inventories");
  const collectionName = character.name.toLowerCase().replace(/\s+/g, "_");
  const inventoryCollection = db.collection(collectionName);

  console.log(
   `[inventoryUtils.js]: logs Checking inventory for character "${character.name}" in collection "${collectionName}"`
  );

  const item = await fetchItemByName(itemName);
  if (!item) {
   throw new Error(`Item with name "${itemName}" not found`);
  }
  console.log(
   `[inventoryUtils.js]: logs Found item: ${item.itemName}, ID: ${item._id}`
  );

  const inventoryItem = await inventoryCollection.findOne({
   characterId,
   itemName: new RegExp(
    `^${escapeRegExp(itemName.trim().toLowerCase())}$`,
    "i"
   ),
   obtain,
  });

  if (inventoryItem) {
   const newQuantity = inventoryItem.quantity + quantity;
   console.log(
    `[inventoryUtils.js]: logs Updating existing item "${itemName}" - New Quantity: ${newQuantity}`
   );
   await inventoryCollection.updateOne(
    { characterId, itemName: inventoryItem.itemName, obtain },
    { $set: { quantity: newQuantity } }
   );
  } else {
   const newItem = {
    characterId,
    itemName: item.itemName,
    itemId: item._id,
    quantity,
    category: Array.isArray(item.category) ? item.category.join(", ") : "Misc",
    type: Array.isArray(item.type) ? item.type.join(", ") : "Unknown",
    subtype: Array.isArray(item.subtype) ? item.subtype.join(", ") : "",
    location: character.currentVillage || "Unknown",
    date: new Date(),
    obtain,
   };
   console.log(
    `[inventoryUtils.js]: logs Adding new item "${itemName}" to collection "${collectionName}"`
   );
   await inventoryCollection.insertOne(newItem);
  }
  return true;
 } catch (error) {
  handleError(error, "inventoryUtils.js");

  console.error(
   "[inventoryUtils.js]: logs Error adding item to inventory database:",
   error
  );
  throw error;
 }
}

// ------------------- Remove Item from Inventory Database -------------------
// Removes a specified quantity of an item from a character's inventory.
async function removeItemInventoryDatabase(
 characterId,
 itemName,
 quantity,
 interaction
) {
 try {
  const character = await fetchCharacterById(characterId);
  if (!character) {
   throw new Error(`Character with ID ${characterId} not found`);
  }
  const collectionName = character.name.toLowerCase();
  const inventoriesConnection = await connectToInventories();
  const db = inventoriesConnection.useDb("inventories");
  const inventoryCollection = db.collection(collectionName);

  const inventoryItem = await inventoryCollection.findOne({
   characterId: character._id,
   itemName: new RegExp(
    `^${escapeRegExp(String(itemName).trim().toLowerCase())}$`,
    "i"
   ),
  });
  if (!inventoryItem) {
   return false;
  }
  if (inventoryItem.quantity < quantity) {
   return false;
  }
  const newQuantity = inventoryItem.quantity - quantity;
  if (newQuantity === 0) {
   await inventoryCollection.deleteOne({
    characterId: character._id,
    itemName: inventoryItem.itemName,
   });
  } else {
   await inventoryCollection.updateOne(
    { characterId: character._id, itemName: inventoryItem.itemName },
    { $set: { quantity: newQuantity } }
   );
  }
  return true;
 } catch (error) {
  handleError(error, "inventoryUtils.js");

  console.error(
   "[inventoryUtils.js]: logs Error removing item from inventory database:",
   error
  );
  throw error;
 }
}

// ------------------- Add Multiple Items to Database -------------------
// Adds multiple items to a character's inventory database.
const addItemsToDatabase = async (character, items, interaction) => {
 try {
  const inventoriesConnection = await connectToInventories();
  const db = inventoriesConnection.useDb("inventories");
  const collectionName = character.name.toLowerCase();
  const inventoryCollection = db.collection(collectionName);

  for (const item of items) {
   const itemName = String(item.itemName).trim().toLowerCase();
   const existingItem = await inventoryCollection.findOne({
    characterId: character._id,
    itemName,
   });
   if (existingItem) {
    await inventoryCollection.updateOne(
     { characterId: character._id, itemName },
     { $inc: { quantity: item.quantity } }
    );
   } else {
    await inventoryCollection.insertOne({
     ...item,
     characterId: character._id,
     characterName: character.name,
     date: new Date(),
    });
   }
  }

  const spreadsheetId = getSheetIdByTitle(character.inventory);
  if (interaction) {
   const sheetRows = items.map((item) => [
    character.name,
    item.itemName,
    item.quantity,
    new Date().toISOString(),
    `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
   ]);
   await appendSheetData(spreadsheetId, "Inventory", sheetRows);
  }
 } catch (error) {
  handleError(error, "inventoryUtils.js");

  console.error(
   "[inventoryUtils.js]: logs Error adding multiple items to database:",
   error
  );
  throw error;
 }
};

// ------------------- Create New Item Database Entry -------------------
// Creates a new item entry object for a character's inventory.
const createNewItemDatabase = (
 character,
 itemName,
 quantity,
 category,
 type,
 interaction
) => {
 itemName = String(itemName).trim().toLowerCase();
 const link = interaction
  ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
  : "";
 return {
  characterId: character._id,
  characterName: character.name,
  itemName,
  quantity,
  category: Array.isArray(category) ? category.join(", ") : category,
  type: Array.isArray(type) ? type.join(", ") : type,
  subtype: "",
  job: character.job || "",
  perk: character.perk || "",
  location: character.currentLocation || character.homeVillage || "",
  link,
  date: new Date(),
  obtain: "Crafting",
  synced: "",
 };
};

// ------------------- Create Removed Item Database Entry -------------------
// Creates a record for an item removed from a character's inventory.
const createRemovedItemDatabase = (
 character,
 item,
 quantity,
 interaction,
 obtainMethod = "Manual Entry"
) => {
 const itemName = String(item.itemName).trim().toLowerCase();
 const link = interaction
  ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
  : "";
 return {
  characterId: character._id,
  characterName: character.name,
  itemId: item._id,
  itemName,
  quantity: -quantity,
  category: Array.isArray(item.category)
   ? item.category.join(", ")
   : item.category,
  type: Array.isArray(item.type) ? item.type.join(", ") : item.type,
  subtype: item.subtype,
  job: character.job || "",
  perk: character.perk || "",
  location: character.currentLocation || character.homeVillage || "",
  link,
  date: new Date(),
  obtain: obtainMethod,
  synced: "",
 };
};

// ------------------- Process Materials for Crafting -------------------
// Processes required materials for crafting an item, ensuring sufficient quantities and updating inventory.
const processMaterials = async (
 interaction,
 character,
 inventory,
 craftableItem,
 quantity
) => {
 const materialsUsed = [];
 for (const material of craftableItem.craftingMaterial) {
  const materialName = material.itemName;
  let specificItems = [];
  let requiredQuantity = material.quantity * quantity;

  if (generalCategories[materialName]) {
   const result = await promptUserForSpecificItems(
    interaction,
    inventory,
    materialName,
    requiredQuantity
   );
   if (result === "canceled") {
    return "canceled";
   }
   specificItems = result;
  } else {
   specificItems = inventory.filter((item) => item.itemName === materialName);
  }

  let totalQuantity = specificItems.reduce(
   (sum, item) => sum + item.quantity,
   0
  );
  if (totalQuantity < requiredQuantity) {
   throw new Error(
    `❌ **Unable to find or insufficient quantity for ${materialName} in ${character.name}'s inventory. Required: ${requiredQuantity}, Found: ${totalQuantity}**`
   );
  }

  for (const specificItem of specificItems) {
   if (requiredQuantity <= 0) break;
   let removeQuantity = Math.min(requiredQuantity, specificItem.quantity);
   await removeItemInventoryDatabase(
    character._id,
    specificItem.itemName,
    removeQuantity,
    interaction
   );
   materialsUsed.push({
    itemName: specificItem.itemName,
    quantity: removeQuantity,
    _id: specificItem._id,
   });
   requiredQuantity -= removeQuantity;
  }
 }
 return materialsUsed;
};

// ------------------- Remove Initial Item if Synced -------------------
// Removes the "Initial Item" from the inventory if the inventory has been marked as synced.
async function removeInitialItemIfSynced(characterId) {
 try {
  if (!dbFunctions.fetchCharacterById) {
   throw new Error(
    "fetchCharacterById function not initialized in inventoryUtils"
   );
  }

  const character = await dbFunctions.fetchCharacterById(characterId);
  if (!character) {
   throw new Error(`Character with ID ${characterId} not found`);
  }

  if (character.inventorySynced) {
   const collectionName = character.name.toLowerCase();
   const inventoriesConnection = await dbFunctions.connectToInventories();
   const db = inventoriesConnection.useDb("inventories");
   const inventoryCollection = db.collection(collectionName);
   const initialItem = await inventoryCollection.findOne({
    characterId: character._id,
    itemName: "Initial Item",
   });
   if (initialItem) {
    await inventoryCollection.deleteOne({ _id: initialItem._id });
    console.log("Initial Item removed from inventory.");
   } else {
    console.log("Initial Item not found in inventory.");
   }
  }
 } catch (error) {
  handleError(error, "inventoryUtils.js");
  console.error(
   `[inventoryUtils.js]: logs Error removing Initial Item: ${error.message}`
  );
  throw error;
 }
}

// ------------------- Add Item to Vending Inventory -------------------
// Adds an item to a vending inventory collection or updates its stock quantity.
const addItemToVendingInventory = async (collectionName, item) => {
 try {
  const inventoriesConnection = await connectToInventories();
  const db = inventoriesConnection.useDb("vending");
  const inventoryCollection = db.collection(collectionName);
  const existingItem = await inventoryCollection.findOne({
   characterName: item.characterName,
   itemName: item.itemName,
  });
  if (existingItem) {
   await inventoryCollection.updateOne(
    { characterName: item.characterName, itemName: item.itemName },
    { $inc: { stockQty: item.stockQty } }
   );
  } else {
   await inventoryCollection.insertOne(item);
  }
 } catch (error) {
  handleError(error, "inventoryUtils.js");

  console.error(
   "[inventoryUtils.js]: logs Error adding item to vending inventory:",
   error
  );
  throw error;
 }
};

// ============================================================================
// Exported Functions
// ------------------- Exporting all inventory management functions -------------------
module.exports = {
 syncToInventoryDatabase,
 addItemInventoryDatabase,
 removeItemInventoryDatabase,
 processMaterials,
 createNewItemDatabase,
 createRemovedItemDatabase,
 addItemsToDatabase,
 removeInitialItemIfSynced,
 addItemToVendingInventory,
};
