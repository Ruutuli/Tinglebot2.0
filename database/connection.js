const mongoose = require('mongoose');
const { handleError } = require('../utils/globalErrorHandler');
require('dotenv').config();
const tinglebotUri = process.env.MONGODB_TINGLEBOT_URI;
const inventoriesUri = process.env.MONGODB_INVENTORIES_URI;
let tinglebotConnection = null;
let inventoriesConnection = null;
const connectionOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4
};

async function getTinglebotConnection() {
  try {
    if (!tinglebotConnection || mongoose.connection.readyState === 0) {
      mongoose.set('strictQuery', false);
      await mongoose.connect(tinglebotUri, connectionOptions);
      tinglebotConnection = mongoose.connection;
      
      tinglebotConnection.on('error', (err) => {
        handleError(err, 'connection.js');
        console.error('MongoDB connection error:', err);
      });
      
      tinglebotConnection.on('disconnected', () => {
        console.warn('MongoDB disconnected. Attempting to reconnect...');
        tinglebotConnection = null;
      });
    }
    return tinglebotConnection;
  } catch (error) {
    handleError(error, 'connection.js');
    console.error("Error connecting to Tinglebot database:", error);
    throw error;
  }
}

async function getInventoriesConnection() {
  try {
    if (!inventoriesConnection || inventoriesConnection.readyState === 0) {
      inventoriesConnection = mongoose.createConnection(inventoriesUri, connectionOptions);
      
      inventoriesConnection.on('error', (err) => {
        handleError(err, 'connection.js');
        console.error('Inventories MongoDB connection error:', err);
      });
      
      inventoriesConnection.on('disconnected', () => {
        console.warn('Inventories MongoDB disconnected. Will reconnect on next use.');
        inventoriesConnection = null;
      });
    }
    return inventoriesConnection;
  } catch (error) {
    handleError(error, 'connection.js');
    console.error("Error connecting to Inventories database:", error);
    throw error;
  }
}

module.exports = {
  getTinglebotConnection,
  getInventoriesConnection
};
