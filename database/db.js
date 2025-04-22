const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");
const { google } = require("googleapis");
const { handleError } = require("../utils/globalErrorHandler");
const {
 authorizeSheets,
 appendSheetData,
 extractSpreadsheetId,
 isValidGoogleSheetsUrl,
 readSheetData,
} = require("../utils/googleSheetsUtils");
require("dotenv").config();

const Character = require("../models/CharacterModel");
const Item = require("../models/ItemModel");
const Monster = require("../models/MonsterModel");
const Quest = require("../models/QuestModel");
const RelicModel = require("../models/RelicModel");
const User = require("../models/UserModel");
const generalCategories = require("../models/GeneralItemCategories");

const tinglebotUri = process.env.MONGODB_TINGLEBOT_URI;
const inventoriesUri = process.env.MONGODB_INVENTORIES_URI;
let tinglebotConnection = null;
let inventoriesConnection = null;
let inventoriesDbConnection = null;

const connectionOptions = {
 useNewUrlParser: true,
 useUnifiedTopology: true,
 serverSelectionTimeoutMS: 5000,
 connectTimeoutMS: 10000,
 socketTimeoutMS: 45000,
 family: 4,
};

const VILLAGE_NAMES = ["Rudania", "Inariko", "Vhintl"];
const ITEMS_PER_VILLAGE = 10;
const LIMITED_ITEMS_COUNT = 5;

const VILLAGE_IMAGES = {
 Rudania:
  "https://static.wixstatic.com/media/7573f4_a0d0d9c6b91644f3b67de8612a312e42~mv2.png",
 Inariko:
  "https://static.wixstatic.com/media/7573f4_c88757c19bf244aa9418254c43046978~mv2.png",
 Vhintl:
  "https://static.wixstatic.com/media/7573f4_968160b5206e4d9aa1b254464d97f9a9~mv2.png",
};

const VILLAGE_ICONS = {
 Rudania:
  "https://static.wixstatic.com/media/7573f4_ffb523e41dbb43c183283a5afbbc74e1~mv2.png",
 Inariko:
  "https://static.wixstatic.com/media/7573f4_066600957d904b1dbce10912d698f5a2~mv2.png",
 Vhintl:
  "https://static.wixstatic.com/media/7573f4_15ac377e0dd643309853fc77250a86a1~mv2.png",
};

async function getTinglebotConnection() {
 try {
  if (!tinglebotConnection || mongoose.connection.readyState === 0) {
   mongoose.set("strictQuery", false);
   await mongoose.connect(tinglebotUri, connectionOptions);
   tinglebotConnection = mongoose.connection;

   tinglebotConnection.on("error", (err) => {
    handleError(err, "connection.js");
    console.error("MongoDB connection error:", err);
   });

   tinglebotConnection.on("disconnected", () => {
    console.warn("MongoDB disconnected. Attempting to reconnect...");
    tinglebotConnection = null;
   });
  }
  return tinglebotConnection;
 } catch (error) {
  handleError(error, "connection.js");
  console.error("Error connecting to Tinglebot database:", error);
  throw error;
 }
}

async function getInventoriesConnection() {
 try {
  if (!inventoriesConnection || inventoriesConnection.readyState === 0) {
   inventoriesConnection = mongoose.createConnection(
    inventoriesUri,
    connectionOptions
   );

   inventoriesConnection.on("error", (err) => {
    handleError(err, "connection.js");
    console.error("Inventories MongoDB connection error:", err);
   });

   inventoriesConnection.on("disconnected", () => {
    console.warn(
     "Inventories MongoDB disconnected. Will reconnect on next use."
    );
    inventoriesConnection = null;
   });
  }
  return inventoriesConnection;
 } catch (error) {
  handleError(error, "connection.js");
  console.error("Error connecting to Inventories database:", error);
  throw error;
 }
}

const connectToInventories = async () => {
 if (!inventoriesDbConnection) {
  const client = new MongoClient(inventoriesUri, {});
  await client.connect();
  inventoriesDbConnection = client.db();
 }
 return inventoriesDbConnection;
};

const getInventoryCollection = async (characterName) => {
 if (typeof characterName !== "string") {
  throw new Error("Character name must be a string.");
 }
 const inventoriesDb = await connectToInventories();
 const collectionName = characterName.trim().toLowerCase();
 return inventoriesDb.collection(collectionName);
};

class BaseService {
 constructor(model, serviceName) {
  this.model = model;
  this.serviceName = serviceName;
 }

 async findOne(query, options = {}) {
  try {
   const result = await this.model
    .findOne(query, options.projection || {})
    .lean(options.lean !== false)
    .exec();

   if (!result && options.throwIfNotFound) {
    throw new Error(`${options.entityName || "Document"} not found`);
   }

   return result;
  } catch (error) {
   handleError(error, this.serviceName);
   console.error(`[${this.serviceName}]: Error in findOne:`, error.message);
   throw error;
  }
 }

 async find(query = {}, options = {}) {
  try {
   let queryBuilder = this.model.find(query, options.projection || {});

   if (options.sort) {
    queryBuilder = queryBuilder.sort(options.sort);
   }

   if (options.limit) {
    queryBuilder = queryBuilder.limit(options.limit);
   }

   if (options.skip) {
    queryBuilder = queryBuilder.skip(options.skip);
   }

   if (options.populate) {
    queryBuilder = queryBuilder.populate(options.populate);
   }

   return await queryBuilder.lean(options.lean !== false).exec();
  } catch (error) {
   handleError(error, this.serviceName);
   console.error(`[${this.serviceName}]: Error in find:`, error.message);
   throw error;
  }
 }

 async create(data) {
  try {
   const newDocument = new this.model(data);
   await newDocument.save();
   return newDocument;
  } catch (error) {
   handleError(error, this.serviceName);
   console.error(`[${this.serviceName}]: Error in create:`, error.message);
   throw error;
  }
 }

 async updateById(id, updateData, options = {}) {
  try {
   return await this.model
    .findByIdAndUpdate(id, updateData, { new: true, ...options })
    .lean(options.lean !== false)
    .exec();
  } catch (error) {
   handleError(error, this.serviceName);
   console.error(`[${this.serviceName}]: Error in updateById:`, error.message);
   throw error;
  }
 }

 async updateMany(query, updateData, options = {}) {
  try {
   return await this.model.updateMany(query, updateData, options).exec();
  } catch (error) {
   handleError(error, this.serviceName);
   console.error(`[${this.serviceName}]: Error in updateMany:`, error.message);
   throw error;
  }
 }

 async deleteById(id) {
  try {
   return await this.model.findByIdAndDelete(id).lean().exec();
  } catch (error) {
   handleError(error, this.serviceName);
   console.error(`[${this.serviceName}]: Error in deleteById:`, error.message);
   throw error;
  }
 }

 async deleteMany(query) {
  try {
   return await this.model.deleteMany(query).exec();
  } catch (error) {
   handleError(error, this.serviceName);
   console.error(`[${this.serviceName}]: Error in deleteMany:`, error.message);
   throw error;
  }
 }

 async count(query = {}) {
  try {
   return await this.model.countDocuments(query).exec();
  } catch (error) {
   handleError(error, this.serviceName);
   console.error(`[${this.serviceName}]: Error in count:`, error.message);
   throw error;
  }
 }
}

class CharacterService extends BaseService {
 constructor() {
  super(Character, "CharacterService");
 }

 async getCharactersInVillage(userId, village) {
  try {
   await getTinglebotConnection();
   const characters = await this.find({ userId });
   return characters.filter(
    (character) =>
     character.currentVillage.toLowerCase() === village.toLowerCase()
   );
  } catch (error) {
   handleError(error, "CharacterService");
   console.error(
    `Error getting characters in village ${village}:`,
    error.message
   );
   throw error;
  }
 }

 async getCharacterByName(characterName) {
  try {
   await getTinglebotConnection();
   const character = await this.findOne(
    {
     name: new RegExp(`^${characterName.trim()}$`, "i"),
    },
    {
     throwIfNotFound: true,
     entityName: `Character "${characterName}"`,
    }
   );
   return character;
  } catch (error) {
   handleError(error, "CharacterService");
   console.error(`Error fetching character "${characterName}":`, error.message);
   throw error;
  }
 }

 async getBlightedCharacters(userId) {
  try {
   await getTinglebotConnection();
   return await this.find({ userId, blighted: true });
  } catch (error) {
   handleError(error, "CharacterService");
   console.error(
    `Error fetching blighted characters for user ${userId}:`,
    error.message
   );
   throw error;
  }
 }

 async getInventoryCollection(characterName) {
  try {
   if (typeof characterName !== "string") {
    throw new TypeError(
     `Expected a string for characterName, but received ${typeof characterName}`
    );
   }

   await getInventoriesConnection();
   const collectionName = characterName.trim().toLowerCase();
   return await getInventoryCollection(collectionName);
  } catch (error) {
   handleError(error, "CharacterService");
   console.error(
    `Error getting inventory collection for "${characterName}":`,
    error.message
   );
   throw error;
  }
 }

 async createInventory(characterName, characterId, job) {
  try {
   const collection = await this.getInventoryCollection(characterName);
   const initialInventory = {
    characterId,
    itemName: "Initial Item",
    quantity: 1,
    category: "Misc",
    type: "Misc",
    subtype: "Misc",
    job,
    perk: "",
    location: "",
    link: "",
    date: new Date(),
    obtain: [],
   };
   await collection.insertOne(initialInventory);
  } catch (error) {
   handleError(error, "CharacterService");
   console.error(
    `Error creating inventory for "${characterName}":`,
    error.message
   );
   throw error;
  }
 }

 async addPet(characterId, petName, species, size, level, perk) {
  try {
   await getTinglebotConnection();
   await this.updateById(characterId, {
    $push: {
     pets: {
      name: petName,
      species,
      size,
      level,
      rollsRemaining: 1,
      perks: [perk],
     },
    },
   });
  } catch (error) {
   handleError(error, "CharacterService");
   console.error(`Error adding pet "${petName}" to character:`, error.message);
   throw error;
  }
 }

 async updatePet(characterId, petName, updatedPetData) {
  try {
   await getTinglebotConnection();
   await Character.updateOne(
    { _id: characterId, "pets.name": petName },
    { $set: { "pets.$": updatedPetData } }
   );
  } catch (error) {
   handleError(error, "CharacterService");
   console.error(`Failed to update pet "${petName}":`, error.message);
   throw error;
  }
 }

 async resetAllPetRolls() {
  try {
   await getTinglebotConnection();
   const characters = await this.find({});

   for (const character of characters) {
    if (character.pets && Array.isArray(character.pets)) {
     character.pets = character.pets.map((pet) => {
      pet.rollsRemaining = Math.min(pet.level, 3);
      return pet;
     });

     await this.updateById(character._id, { pets: character.pets });
    }
   }
  } catch (error) {
   handleError(error, "CharacterService");
   console.error(
    "Error resetting pet rolls for all characters:",
    error.message
   );
   throw error;
  }
 }
}

class ItemService extends BaseService {
 constructor() {
  super(Item, "ItemService");
 }

 async getAllItems() {
  try {
   await getTinglebotConnection();
   return await this.find();
  } catch (error) {
   handleError(error, "ItemService");
   console.error("Error fetching all items:", error.message);
   throw error;
  }
 }

 async getItemByName(itemName) {
  try {
   await getTinglebotConnection();
   const normalizedItemName = itemName.trim().toLowerCase();
   const escapedName = normalizedItemName.replace(
    /[-\/\\^$*+?.()|[\]{}]/g,
    "\\$&"
   );

   return await this.findOne({
    itemName: new RegExp(`^${escapedName}$`, "i"),
   });
  } catch (error) {
   handleError(error, "ItemService");
   console.error(`Error fetching item "${itemName}":`, error.message);
   throw error;
  }
 }

 async getItemsByMonster(monsterName) {
  try {
   await getTinglebotConnection();
   const query = {
    $or: [{ monsterList: monsterName }, { [monsterName]: true }],
   };

   const items = await this.find(query);
   return items.filter((item) => item.itemName && item.itemRarity);
  } catch (error) {
   handleError(error, "ItemService");
   console.error(
    `Error fetching items for monster "${monsterName}":`,
    error.message
   );
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
   handleError(error, "ItemService");
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
    ? inventory.find(
       (inv) => inv.itemId && inv.itemId.toString() === materialId.toString()
      )
    : inventory.find((inv) => inv.itemName === materialName);

   return itemById && itemById.quantity >= quantityNeeded;
  } catch (error) {
   handleError(error, "ItemService");
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
    category: { $regex: `^${category}$`, $options: "i" },
   });
  } catch (error) {
   handleError(error, "ItemService");
   console.error(
    `Error fetching items by category "${category}":`,
    error.message
   );
   throw error;
  }
 }
}

class MonsterService extends BaseService {
 constructor() {
  super(Monster, "MonsterService");
 }

 toCamelCase(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w|\s+|[-()/])/g, (match, index) => {
   if (match === "-" || match === "(" || match === ")" || match === "/")
    return "";
   return index === 0 ? match.toLowerCase() : match.toUpperCase();
  });
 }

 async getByNameMapping(nameMapping) {
  if (!nameMapping) {
   throw new Error("No nameMapping provided");
  }

  try {
   await getTinglebotConnection();
   const normalizedMapping = this.toCamelCase(nameMapping);
   return await this.findOne({ nameMapping: normalizedMapping });
  } catch (error) {
   handleError(error, "MonsterService");
   console.error(
    `Error fetching monster by mapping "${nameMapping}":`,
    error.message
   );
   throw error;
  }
 }

 async getMonsterAboveTier(minTier = 5) {
  try {
   await getTinglebotConnection();
   const monsters = await this.find({ tier: { $gte: minTier } });

   if (!monsters || monsters.length === 0) {
    throw new Error(`No monsters found above tier ${minTier}`);
   }

   return monsters[Math.floor(Math.random() * monsters.length)];
  } catch (error) {
   handleError(error, "MonsterService");
   console.error(
    `Error fetching monsters above tier ${minTier}:`,
    error.message
   );
   throw error;
  }
 }

 async getMonsterAboveTierByRegion(minTier = 5, region) {
  if (!region) {
   throw new Error("Region must be specified");
  }

  try {
   await getTinglebotConnection();
   const filter = {
    tier: { $gte: minTier },
    [region.toLowerCase()]: true,
   };

   const monsters = await this.find(filter);

   if (!monsters || monsters.length === 0) {
    throw new Error(
     `No monsters found above tier ${minTier} in region ${region}`
    );
   }

   return monsters[Math.floor(Math.random() * monsters.length)];
  } catch (error) {
   handleError(error, "MonsterService");
   console.error(
    `Error fetching monsters above tier ${minTier} in region ${region}:`,
    error.message
   );
   throw error;
  }
 }
}

const characterService = new CharacterService();
const itemService = new ItemService();
const monsterService = new MonsterService();

async function createQuest(questData) {
 const quest = new Quest(questData);
 await quest.save();
 return quest;
}

async function joinQuest(userId, questId) {
 const quest = await Quest.findById(questId);
 if (!quest || quest.status !== "open")
  throw new Error("Quest is not available.");
 quest.participants.push(userId);
 await quest.save();
}

async function completeQuest(userId, questId) {
 const quest = await Quest.findById(questId);
 if (!quest) throw new Error("Quest not found.");

 const auth = await authorizeSheets();
 await appendSheetData(auth, quest.spreadsheetId, "Quests!A1", [
  [userId, questId, quest.rewards],
 ]);
 return quest.rewards;
}

const createRelic = async (relicData) => {
 try {
  await getTinglebotConnection();
  const newRelic = new RelicModel(relicData);
  return await newRelic.save();
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error creating relic:", error);
  throw error;
 }
};

const fetchRelicsByCharacter = async (characterName) => {
 try {
  await getTinglebotConnection();
  return await RelicModel.find({ discoveredBy: characterName }).lean();
 } catch (error) {
  handleError(error, "relicService.js");
  console.error(
   "[relicService.js]: ❌ Error fetching relics by character:",
   error
  );
  throw error;
 }
};

const appraiseRelic = async (
 relicId,
 appraiserName,
 description,
 rollOutcome
) => {
 try {
  await getTinglebotConnection();
  const updateData = {
   appraised: true,
   appraisedBy: appraiserName,
   appraisalDate: new Date(),
   appraisalDescription: description,
  };
  if (rollOutcome) {
   updateData.rollOutcome = rollOutcome;
  }
  return await RelicModel.findByIdAndUpdate(relicId, updateData, { new: true });
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error appraising relic:", error);
  throw error;
 }
};

const archiveRelic = async (relicId, imageUrl) => {
 try {
  await getTinglebotConnection();
  return await RelicModel.findByIdAndUpdate(
   relicId,
   {
    artSubmitted: true,
    imageUrl: imageUrl,
    archived: true,
   },
   { new: true }
  );
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error archiving relic:", error);
  throw error;
 }
};

const markRelicDeteriorated = async (relicId) => {
 try {
  await getTinglebotConnection();
  return await RelicModel.findByIdAndUpdate(
   relicId,
   { deteriorated: true },
   { new: true }
  );
 } catch (error) {
  handleError(error, "relicService.js");
  console.error(
   "[relicService.js]: ❌ Error marking relic as deteriorated:",
   error
  );
  throw error;
 }
};

const fetchArchivedRelics = async () => {
 try {
  await getTinglebotConnection();
  return await RelicModel.find({ archived: true }).lean();
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error fetching archived relics:", error);
  throw error;
 }
};

const fetchRelicById = async (relicId) => {
 try {
  await getTinglebotConnection();
  return await RelicModel.findById(relicId).lean();
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error fetching relic by ID:", error);
  throw error;
 }
};

const deleteAllRelics = async () => {
 try {
  await getTinglebotConnection();
  return await RelicModel.deleteMany({});
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error deleting relics:", error);
  throw error;
 }
};

async function getTokenBalance(userId) {
 try {
  const user = await User.findOne({ discordId: userId });
  return user?.tokens || 0;
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error("[tokenService.js]: ❌ Error fetching token balance:", error);
  throw error;
 }
}

async function getOrCreateToken(userId, tokenTrackerLink = "") {
 await getTinglebotConnection();
 let user = await User.findOne({ discordId: userId });

 if (!user) {
  user = new User({
   discordId: userId,
   tokens: 0,
   tokenTracker: tokenTrackerLink || "",
   tokensSynced: false,
  });
  await user.save();
 } else if (tokenTrackerLink && !user.tokenTracker) {
  user.tokenTracker = tokenTrackerLink;
  await user.save();
 }
 return user;
}

async function updateTokenBalance(userId, change) {
 try {
  if (isNaN(change)) {
   throw new Error(
    `[tokenService.js]: Invalid token change value provided: ${change}`
   );
  }
  const user = await User.findOneAndUpdate(
   { discordId: userId },
   {},
   { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const currentBalance = user.tokens || 0;
  const newBalance = currentBalance + change;
  if (newBalance < 0) {
   throw new Error(
    `[tokenService.js]: Insufficient tokens. Current balance: ${currentBalance}, Change: ${change}`
   );
  }
  user.tokens = newBalance;
  await user.save();
  return newBalance;
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error(
   `[tokenService.js]: ❌ Error updating token balance for user ID ${userId}:`,
   error
  );
  throw error;
 }
}

async function syncTokenTracker(userId) {
 await getTinglebotConnection();
 const user = await getOrCreateToken(userId);
 if (!user.tokenTracker || !isValidGoogleSheetsUrl(user.tokenTracker)) {
  const errorMessage = "Invalid Google Sheets URL";
  console.error(`[tokenService.js]: ${errorMessage}`, {
   userId,
   tokenTracker: user.tokenTracker,
  });
  throw new Error(errorMessage);
 }
 const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
 const auth = await authorizeSheets();

 try {
  const range = "loggedTracker!B7:F";
  const tokenData = await readSheetData(auth, spreadsheetId, range);
  if (!tokenData || tokenData.length === 0) {
   throw new Error("No data found in the specified range.");
  }

  let totalEarned = 0;
  let totalSpent = 0;
  tokenData.forEach((row, index) => {
   const type = row[3]?.toLowerCase();
   const amount = parseInt(row[4], 10);
   if (!type || isNaN(amount)) {
    console.warn(
     `[tokenService.js]: Skipping row ${index + 7} due to invalid data.`
    );
    return;
   }
   if (type === "earned") {
    totalEarned += amount;
   } else if (type === "spent") {
    totalSpent += Math.abs(amount);
   }
  });

  user.tokens = totalEarned - totalSpent;
  user.tokensSynced = true;
  await user.save();

  const syncRow = ["Initial Sync", "You can delete this!", "", "sync", "0"];
  await appendSheetData(auth, spreadsheetId, "loggedTracker!B:F", [syncRow]);
  return user;
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error("[tokenService.js]: ❌ Error syncing token tracker:", error);
  throw new Error("Error syncing token tracker.");
 }
}

async function appendEarnedTokens(
 userId,
 fileName,
 category,
 amount,
 fileUrl = ""
) {
 const user = await getOrCreateToken(userId);
 const tokenTrackerLink = user.tokenTracker;
 if (!isValidGoogleSheetsUrl(tokenTrackerLink)) {
  throw new Error(
   `[tokenService.js]: Invalid Google Sheets URL for user ${userId}`
  );
 }
 const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
 const auth = await authorizeSheets();
 const checkRange = "loggedTracker!B7:F";
 let nextRow = 7;
 try {
  const response = await google
   .sheets({ version: "v4", auth })
   .spreadsheets.values.get({
    spreadsheetId,
    range: checkRange,
   });
  const rows = response.data.values || [];
  nextRow += rows.length;
  const appendRange = `loggedTracker!B${nextRow}:F`;
  const newRow = [fileName, fileUrl, category, "earned", `${amount}`];
  await google.sheets({ version: "v4", auth }).spreadsheets.values.update({
   spreadsheetId,
   range: appendRange,
   valueInputOption: "USER_ENTERED",
   resource: { values: [newRow] },
  });
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error(
   `[tokenService.js]: ❌ Error appending earned token data: ${error.message}`
  );
  throw new Error("Error appending earned token data to the Google Sheet.");
 }
}

async function appendSpentTokens(userId, purchaseName, amount, link = "") {
 try {
  const user = await getOrCreateToken(userId);
  const tokenTrackerLink = user.tokenTracker;
  if (!isValidGoogleSheetsUrl(tokenTrackerLink)) {
   throw new Error(
    `[tokenService.js]: Invalid Google Sheets URL for user ID: ${userId}`
   );
  }
  const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
  const auth = await authorizeSheets();
  const newRow = [purchaseName, link, "", "spent", `-${amount}`];
  await appendSheetData(auth, spreadsheetId, "loggedTracker!B7:F", [newRow]);
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error(
   "[tokenService.js]: ❌ Error appending spent token data:",
   error
  );
  throw error;
 }
}

async function getUserGoogleSheetId(userId) {
 try {
  const user = await User.findOne({ discordId: userId });
  if (user && user.tokenTracker) {
   if (!isValidGoogleSheetsUrl(user.tokenTracker)) {
    throw new Error(
     `[tokenService.js]: Invalid Google Sheets URL for user ${userId}`
    );
   }
   return extractSpreadsheetIdFromUrl(user.tokenTracker);
  } else {
   console.error(
    `[tokenService.js]: No Token Tracker linked for user ${userId}`
   );
   return null;
  }
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error(
   `[tokenService.js]: ❌ Error retrieving Token Tracker ID for user ${userId}:`,
   error.message
  );
  return null;
 }
}

function extractSpreadsheetIdFromUrl(url) {
 const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
 const match = url.match(regex);
 return match ? match[1] : null;
}

async function getOrCreateUser(discordId, googleSheetsUrl, timezone) {
 await getTinglebotConnection();
 let user = await User.findOne({ discordId });

 if (!user) {
  user = new User({
   discordId,
   googleSheetsUrl: googleSheetsUrl || "",
   timezone: timezone || "UTC",
   tokens: 0,
   tokenTracker: "",
   blightedcharacter: false,
  });
  await user.save();
 } else {
  user.googleSheetsUrl = googleSheetsUrl || user.googleSheetsUrl || "";
  user.timezone = timezone || user.timezone || "UTC";
  await user.save();
 }

 return user;
}

const getUserById = async (discordId) => {
 console.log(`Fetching user by Discord ID: ${discordId}`);
 await getTinglebotConnection();
 const user = await User.findOne({ discordId });
 console.log(`User found: ${user ? user.discordId : "Not found"}`);
 return user;
};

async function updateUserTokens(discordId, amount, activity, link = "") {
 await getTinglebotConnection();
 const user = await User.findOne({ discordId });

 if (!user) {
  throw new Error("User not found");
 }

 user.tokens += amount;
 await user.save();

 if (user.tokenTracker) {
  const auth = await authorizeSheets();
  const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
  const range = "loggedTracker!B:F";
  const dateTime = new Date().toISOString();
  const values = [["Update", activity, link, amount.toString(), dateTime]];
  await appendSheetData(auth, spreadsheetId, range, values);
 }

 return user;
}

async function updateUserTokenTracker(discordId, tokenTracker) {
 await getTinglebotConnection();
 const user = await User.findOneAndUpdate(
  { discordId },
  { tokenTracker },
  { new: true }
 );

 if (!user) {
  throw new Error("User not found");
 }

 return user;
}

const connectToDatabase = async () => {
 const client = new MongoClient(inventoriesUri, {});
 try {
  await client.connect();
  return client;
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error("[vendingService.js]: ❌ Error connecting to database:", error);
  throw error;
 }
};

const clearExistingStock = async () => {
 const client = await connectToDatabase();
 const db = client.db("tinglebot");
 const stockCollection = db.collection("vending_stock");

 try {
  await stockCollection.deleteMany({});
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error("[vendingService.js]: ❌ Error clearing vending stock:", error);
 } finally {
  await client.close();
 }
};

const generateVendingStockList = async () => {
 const client = await connectToDatabase();
 const db = client.db("tinglebot");
 const stockCollection = db.collection("vending_stock");
 const priorityItems = [
  "Leather",
  "Eldin Ore",
  "Wood",
  "Rock Salt",
  "Goat Butter",
  "Cotton",
  "Hylian Rice",
  "Iron bar",
  "Tabantha Wheat",
  "Wool",
  "Fresh Milk",
  "Goron Ore",
  "Bird Egg",
  "Luminous Stone",
  "Goron Spice",
  "Chuchu Jelly",
  "Gold Dust",
  "Cane Sugar",
  "Gold Bar",
  "Fancy Fabric",
  "Vintage Linen",
  "Bird Feather",
 ];

 try {
  const currentMonth = new Date().getMonth() + 1;
  await clearExistingStock();
  const allItems = await itemService.getAllItems();
  const merchantItems = allItems.filter(
   (item) => item.vending && item.itemRarity >= 1 && item.itemRarity <= 10
  );
  const shopkeeperItems = allItems.filter(
   (item) => item.vending && item.itemRarity >= 1 && item.itemRarity <= 10
  );

  if (merchantItems.length === 0 || shopkeeperItems.length === 0) {
   throw new Error(
    "[vendingService.js]: ❌ Insufficient items available for generating stock."
   );
  }

  const priorityItemsForShopkeepers = shopkeeperItems.filter((item) =>
   priorityItems.includes(item.itemName)
  );

  const generateRoundedPrice = (min, max) => {
   const randomPrice = min + Math.floor(Math.random() * (max - min + 1));
   const adjustedPrice = Math.round(randomPrice / 5) * 5;
   return Math.min(adjustedPrice, max);
  };

  const selectItemWithWeight = (items, weightThreshold) => {
   const weightedItems = items.flatMap((item) => {
    const weight = priorityItems.includes(item.itemName) ? weightThreshold : 1;
    return Array(weight).fill(item);
   });
   const randomIndex = Math.floor(Math.random() * weightedItems.length);
   return weightedItems[randomIndex];
  };

  const stockList = {};
  for (const villageName of VILLAGE_NAMES) {
   stockList[villageName] = [];

   while (
    stockList[villageName].filter((item) => item.vendingType === "Merchant")
     .length < 4
   ) {
    const randomIndex = Math.floor(Math.random() * merchantItems.length);
    const selectedItem = merchantItems[randomIndex];

    if (
     !stockList[villageName].some(
      (item) => item.itemName === selectedItem.itemName
     )
    ) {
     const points = generateRoundedPrice(5, 250);
     stockList[villageName].push({
      itemName: selectedItem.itemName,
      emoji: selectedItem.emoji,
      points,
      vendingType: "Merchant",
      itemRarity: selectedItem.itemRarity,
      village: villageName,
     });
    }
   }

   while (
    stockList[villageName].filter((item) => item.vendingType === "Shopkeeper")
     .length < 4
   ) {
    const selectedItem = selectItemWithWeight(shopkeeperItems, 5);

    if (
     !stockList[villageName].some(
      (item) => item.itemName === selectedItem.itemName
     )
    ) {
     const points = generateRoundedPrice(50, 300);
     stockList[villageName].push({
      itemName: selectedItem.itemName,
      emoji: selectedItem.emoji,
      points,
      vendingType: "Shopkeeper",
      itemRarity: selectedItem.itemRarity,
      village: villageName,
     });
    }
   }
  }

  const limitedItems = [];
  while (limitedItems.length < LIMITED_ITEMS_COUNT) {
   const randomIndex = Math.floor(Math.random() * allItems.length);
   const selectedItem = allItems[randomIndex];

   if (
    !limitedItems.some((item) => item.itemName === selectedItem.itemName) &&
    selectedItem.itemRarity >= 7 &&
    selectedItem.vending
   ) {
    const points = generateRoundedPrice(250, 500);
    const stock = Math.floor(Math.random() * 5) + 1;
    limitedItems.push({
     itemName: selectedItem.itemName,
     emoji: selectedItem.emoji,
     points,
     stock,
    });
   }
  }

  await stockCollection.insertOne({
   month: currentMonth,
   stockList,
   limitedItems,
   createdAt: new Date(),
  });
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error(
   "[vendingService.js]: ❌ Error generating vending stock list:",
   error
  );
 } finally {
  await client.close();
 }
};

const getCurrentVendingStockList = async () => {
 const client = await connectToDatabase();
 const db = client.db("tinglebot");
 const stockCollection = db.collection("vending_stock");

 try {
  const currentMonth = new Date().getMonth() + 1;
  const currentStock = await stockCollection.findOne({ month: currentMonth });
  if (!currentStock) {
   return null;
  }

  const normalizedStockList = {};
  for (const village in currentStock.stockList) {
   const normalizedVillage = village.toLowerCase().trim();
   normalizedStockList[normalizedVillage] = currentStock.stockList[village];
  }

  return {
   ...currentStock,
   stockList: normalizedStockList,
  };
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error(
   "[vendingService.js]: ❌ Error retrieving current vending stock list:",
   error
  );
  throw error;
 } finally {
  await client.close();
 }
};

const getLimitedItems = async () => {
 const client = await connectToDatabase();
 const db = client.db("tinglebot");
 const stockCollection = db.collection("vending_stock");

 try {
  const currentMonth = new Date().getMonth() + 1;
  const currentStock = await stockCollection.findOne({ month: currentMonth });
  return currentStock ? currentStock.limitedItems : [];
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error(
   "[vendingService.js]: ❌ Error retrieving limited items:",
   error
  );
  throw error;
 } finally {
  await client.close();
 }
};

const updateItemStockByName = async (itemName, quantity) => {
 const client = await connectToDatabase();
 const db = client.db("tinglebot");
 const stockCollection = db.collection("vending_stock");

 try {
  const currentMonth = new Date().getMonth() + 1;
  const currentStock = await stockCollection.findOne({ month: currentMonth });

  if (!currentStock) {
   throw new Error("[vendingService.js]: No current stock found");
  }

  const itemIndex = currentStock.limitedItems.findIndex(
   (item) => item.itemName === itemName
  );
  if (itemIndex === -1) {
   throw new Error("[vendingService.js]: Item not found in limited stock");
  }

  currentStock.limitedItems[itemIndex].stock -= quantity;

  await stockCollection.updateOne(
   { month: currentMonth },
   { $set: { limitedItems: currentStock.limitedItems } }
  );
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error(
   "[vendingService.js]: ❌ Error updating item stock by name:",
   error
  );
  throw error;
 } finally {
  await client.close();
 }
};

async function updateVendingStock({
 characterId,
 itemName,
 stockQty,
 tokenPrice,
 artPrice,
 otherPrice,
 tradesOpen,
}) {
 const client = await connectToDatabase();
 const db = client.db("tinglebot");
 const stockCollection = db.collection("vending_stock");

 try {
  const stockEntry = {
   characterId,
   itemName,
   stockQty,
   tokenPrice,
   artPrice,
   otherPrice,
   tradesOpen,
   updatedAt: new Date(),
  };

  await stockCollection.updateOne(
   { characterId, itemName },
   { $set: stockEntry },
   { upsert: true }
  );
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error("[vendingService.js]: ❌ Error updating vending stock:", error);
  throw error;
 } finally {
  await client.close();
 }
}

module.exports = {
 getTinglebotConnection,
 getInventoriesConnection,
 connectToInventories,
 getInventoryCollection,
 characterService,
 itemService,
 monsterService,
 createQuest,
 joinQuest,
 completeQuest,
 createRelic,
 fetchRelicsByCharacter,
 appraiseRelic,
 archiveRelic,
 markRelicDeteriorated,
 fetchArchivedRelics,
 fetchRelicById,
 deleteAllRelics,
 getOrCreateToken,
 updateTokenBalance,
 syncTokenTracker,
 appendEarnedTokens,
 appendSpentTokens,
 getUserGoogleSheetId,
 getTokenBalance,
 getOrCreateUser,
 getUserById,
 updateUserTokens,
 updateUserTokenTracker,
 connectToDatabase,
 clearExistingStock,
 generateVendingStockList,
 getCurrentVendingStockList,
 getLimitedItems,
 updateItemStockByName,
 updateVendingStock,
 VILLAGE_IMAGES,
 VILLAGE_ICONS,
};
