// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Define the inventory schema -------------------
const inventorySchema = new Schema({
  characterId: { type: Schema.Types.ObjectId, ref: 'Character', required: true }, // Reference to Character model
  itemName: { type: String, required: true }, // Item name
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true }, // Reference to Item model
  quantity: { type: Number, default: 1 }, // Quantity of the item (default to 1)
  category: { type: String }, // Item category
  type: { type: String }, // Item type
  subtype: { type: String }, // Item subtype
  job: { type: String }, // Associated job
  perk: { type: String }, // Associated perk
  location: { type: String }, // Item location
  date: { type: Date }, // Date associated with the item
  craftedAt: { type: Date }, // Date the item was crafted (if applicable)
  gatheredAt: { type: Date }, // Date the item was gathered (if applicable)
  obtain: { type: String, default: '' },
  synced: { type: String, unique: true }, // Unique identifier for synced items
  fortuneTellerBoost: { type: Boolean, default: false } // Tag for items crafted with Fortune Teller boost (sell for 20% more)
});

// Lazy import to avoid Next.js/Turbopack build-time resolution issues
let getInventoriesConnectionModule = null;
async function getGetInventoriesConnection() {
  if (!getInventoriesConnectionModule) {
    // Use dynamic import with a constructed path to avoid static analysis
    // This prevents Next.js/Turbopack from trying to resolve it at build time
    const dbPath = '../lib' + '/db';
    getInventoriesConnectionModule = await import(dbPath);
  }
  return getInventoriesConnectionModule.getInventoriesConnection();
}

// ------------------- Initialize the inventory model -------------------
// Initialize the model using the inventories database connection
// Accepts an optional connection parameter to work with both bot and dashboard
const initializeInventoryModel = async (inventoriesConnection = null) => {
  try {
    let connection = inventoriesConnection;
    
    // If no connection provided, get one from lib/db.ts
    if (!connection) {
      connection = await getGetInventoriesConnection();
    }
    
    if (!connection) {
      throw new Error('Failed to connect to the inventories database');
    }

    // Ensure we're using the 'inventories' database (useDb returns a new connection; use it for the model)
    const dbConnection = connection.useDb ? connection.useDb('inventories') : connection;

    // Reuse existing model if already compiled to avoid OverwriteModelError
    const model = dbConnection.models['Inventory'] || dbConnection.model('Inventory', inventorySchema);
    return {
      model,
      connection: connection
    };
  } catch (error) {
    console.error(`[initializeInventoryModel]: Error initializing model:`, error);
    throw error;
  }
};

// Export both the schema and the initialization function
module.exports = initializeInventoryModel;
module.exports.inventorySchema = inventorySchema;

