const { getTinglebotConnection, getInventoriesConnection } = require('./connection');
const Item = require('../models/ItemModel');
const BaseService = require('./BaseService');
const { handleError } = require('../utils/globalErrorHandler');
const generalCategories = require('../models/GeneralItemCategories');

class ItemService extends BaseService {
  constructor() {
    super(Item, 'ItemService');
  }

   async getAllItems() {
    try {
      await getTinglebotConnection();
      return await this.find();
    } catch (error) {
      handleError(error, 'ItemService');
      console.error("Error fetching all items:", error.message);
      throw error;
    }
  }

    async getItemByName(itemName) {
    try {
      await getTinglebotConnection();
      const normalizedItemName = itemName.trim().toLowerCase();
      const escapedName = normalizedItemName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      
      return await this.findOne({
        itemName: new RegExp(`^${escapedName}$`, 'i')
      });
    } catch (error) {
      handleError(error, 'ItemService');
      console.error(`Error fetching item "${itemName}":`, error.message);
      throw error;
    }
  }

    async getItemsByMonster(monsterName) {
    try {
      await getTinglebotConnection();
      const query = {
        $or: [
          { monsterList: monsterName },
          { [monsterName]: true }
        ]
      };
      
      const items = await this.find(query);
      return items.filter(item => item.itemName && item.itemRarity);
    } catch (error) {
      handleError(error, 'ItemService');
      console.error(`Error fetching items for monster "${monsterName}":`, error.message);
      throw error;
    }
  }

    async getCraftableItems(inventory) {
    try {
      await getTinglebotConnection();
      const craftableItems = await this.find({ crafting: true });
      const craftableWithMaterials = [];

      for (const item of craftableItems) {
        const { craftingMaterial } = item;
        if (!craftingMaterial || craftingMaterial.length === 0) {
          continue;
        }
        
        if (this.checkMaterialAvailability(craftingMaterial, inventory)) {
          craftableWithMaterials.push(item);
        }
      }
      
      return craftableWithMaterials;
    } catch (error) {
      handleError(error, 'ItemService');
      console.error("Error fetching craftable items:", error.message);
      throw error;
    }
  }

    checkMaterialAvailability(craftingMaterials, inventory) {
    for (const material of craftingMaterials) {
      const { _id, itemName, quantity } = material;
      
      if (!_id) {
        const specificItems = this.getSpecificItems(itemName);
        if (specificItems.length === 0) {
          return false;
        }
        
        let specificMaterialAvailable = false;
        for (const specificItem of specificItems) {
          if (this.checkMaterial(null, specificItem, quantity, inventory)) {
            specificMaterialAvailable = true;
            break;
          }
        }
        
        if (!specificMaterialAvailable) {
          return false;
        }
      } else if (!this.checkMaterial(_id, itemName, quantity, inventory)) {
        return false;
      }
    }
    
    return true;
  }

    checkMaterial(materialId, materialName, quantityNeeded, inventory) {
    try {
      if (!materialId && !materialName) {
        return false;
      }
      
      const itemById = materialId
        ? inventory.find(inv => inv.itemId && inv.itemId.toString() === materialId.toString())
        : inventory.find(inv => inv.itemName === materialName);
        
      return itemById && itemById.quantity >= quantityNeeded;
    } catch (error) {
      handleError(error, 'ItemService');
      console.error("Error checking material:", error.message);
      return false;
    }
  }

    getSpecificItems(generalItemName) {
    return generalCategories[generalItemName] || [];
  }

    async getItemsByCategory(category) {
    try {
      await getTinglebotConnection();
      return await this.find({
        category: { $regex: `^${category}$`, $options: 'i' }
      });
    } catch (error) {
      handleError(error, 'ItemService');
      console.error(`Error fetching items by category "${category}":`, error.message);
      throw error;
    }
  }
}

const itemService = new ItemService();
module.exports = itemService;
