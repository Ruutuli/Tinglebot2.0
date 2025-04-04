// ------------------- Import required modules and configurations -------------------
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Item = require('../models/ItemModel');
const { parseItemData, fetchSheetData, authorize } = require('../utils/itemUtils');
const { connectToTinglebot } = require('../database/connection');

// ------------------- Function to sync items to MongoDB -------------------
async function syncItems() {
  await connectToTinglebot();

  try {
    const auth = await authorize(); // authorize Google Sheets API
    const sheetData = await fetchSheetData(auth); // fetch data from the sheet

    // Map sheet data to item objects
    const items = sheetData.map(row => parseItemData(row));

    // Save or update each item in MongoDB
    for (const itemData of items) {
      await Item.findOneAndUpdate(
        { itemName: itemData.itemName }, // search by item name
        itemData, // update with new data
        { upsert: true, new: true } // create if not found
      );
    }

    // Create a map of item IDs for crafting materials
    const allItems = await Item.find();
    const itemIdMap = allItems.reduce((acc, item) => {
      acc[item.itemName] = { _id: item._id.toString(), itemName: item.itemName };
      return acc;
    }, {});

    // Update items with crafting materials
    for (const itemData of items) {
      const originalItem = sheetData.find((row) => row[0] === itemData.itemName);
      if (!originalItem) continue;

      const craftingMaterials = (originalItem[11] || '').split('\n').map((line) => {
        const [item, quantity] = line.split(' ⨯ ');
        const itemInfo = itemIdMap[item.trim()];
        if (itemInfo && quantity) {
          return { _id: itemInfo._id, itemName: itemInfo.itemName, quantity: parseInt(quantity.trim()) || 0 };
        }
        return null;
      }).filter((mat) => mat && mat._id && mat.quantity);

      if (craftingMaterials.length > 0) {
        await Item.findOneAndUpdate(
          { itemName: itemData.itemName },
          { craftingMaterial: craftingMaterials },
          { upsert: true, new: true }
        );
      }
    }

    console.log('✅ Items successfully synchronized to MongoDB');
  } catch (error) {
    console.error('❌ Error synchronizing items:', error);
    throw error;
  } finally {
    mongoose.disconnect(); // close MongoDB connection
  }
}

// ------------------- Execute the synchronization function -------------------
syncItems().catch(error => {
  console.error('❌ Error during item synchronization:', error);
  process.exit(1);
});

