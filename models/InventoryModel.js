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

// ------------------- Initialize the inventory model -------------------
// Initialize the model using the inventories database connection
// Accepts an optional connection parameter to work with both bot and dashboard
const initializeInventoryModel = async (inventoriesConnection = null) => {
  try {
    let connection = inventoriesConnection;
    
    // If no connection provided, try to get one from available sources
    if (!connection) {
      // Try dashboard connection first (if running from dashboard)
      try {
        const path = require('path');
        const dbDashboardPath = path.join(__dirname, '..', 'Tinglebot Dashboard', 'database', 'db-dashboard');
        const dbDashboard = require(dbDashboardPath);
        connection = await dbDashboard.connectToInventories();
      } catch (dashboardError) {
        // If dashboard import fails, try bot connection
        try {
          const dbBotPath = path.join(__dirname, '..', 'database', 'db-bot');
          const dbBot = require(dbBotPath);
          connection = await dbBot.connectToInventories();
        } catch (botError) {
          throw new Error(`Failed to connect to inventories database from either location: ${botError.message}`);
        }
      }
    }
    
    if (!connection) {
      throw new Error('Failed to connect to the inventories database');
    }

    // Ensure we're using the 'inventories' database
    if (connection.useDb) {
      connection.useDb('inventories');
    }

    // Create and return both the model and connection
    const model = connection.model('Inventory', inventorySchema);
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

