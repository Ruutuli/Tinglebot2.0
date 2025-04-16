// ------------------- Import necessary modules and environment variables -------------------
const mongoose = require('mongoose');
const { handleError } = require('../utils/globalErrorHandler');
require('dotenv').config();

// ------------------- Define Database URIs from environment variables -------------------
const tinglebotUri = process.env.MONGODB_TINGLEBOT_URI;
const inventoriesUri = process.env.MONGODB_INVENTORIES_URI;

// ------------------- Define database connection variables -------------------
let tinglebotDbConnection;
let inventoriesDbConnection;

// ------------------- Connect to the Tinglebot database -------------------
async function connectToTinglebot() {
    try {
      if (!tinglebotDbConnection || mongoose.connection.readyState === 0) {
        mongoose.set('strictQuery', false);  
        tinglebotDbConnection = await mongoose.connect(tinglebotUri, {});
      }
      return tinglebotDbConnection;
    } catch (error) {
    handleError(error, 'connection.js');

      console.error("❌ Error connecting to Tinglebot database:", error);
      throw error;
    }
  }

// ------------------- Connect to the Inventories database -------------------
async function connectToInventories() {
    try {
      if (!inventoriesDbConnection) {
        inventoriesDbConnection = mongoose.createConnection(inventoriesUri, {});
      }
      return inventoriesDbConnection;
    } catch (error) {
    handleError(error, 'connection.js');

      console.error("❌ Error connecting to Inventories database:", error);
      throw error;
    }
  }
// ------------------- Export the connection functions -------------------
module.exports = {
    connectToTinglebot,
    connectToInventories,
};

