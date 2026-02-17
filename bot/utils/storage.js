const { handleError } = require("../utils/globalErrorHandler");
const logger = require("../utils/logger");
const TempData = require("../models/TempDataModel");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const STORAGE_DIR = path.join(__dirname, "..", "data");
const BOOSTING_STORAGE_FILE = path.join(STORAGE_DIR, "boosting_requests.json");

if (!fs.existsSync(STORAGE_DIR)) {
 fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// ============================================================================
// ------------------- Submission Storage Functions -------------------
// Functions for saving, retrieving, and deleting submissions from persistent storage.

async function saveWeaponSubmissionToStorage(key, weaponData) {
 try {
  if (!key || !weaponData) {
   console.error(`[storage.js]: Missing key or data for weapon save operation`);
   throw new Error("Missing key or data");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const weaponSubmission = {
   type: "weaponSubmission",
   key,
   data: {
    submissionId: weaponData.submissionId || key,
    userId: weaponData.userId,
    username: weaponData.username,
    userAvatar: weaponData.userAvatar,
    characterName: weaponData.characterName,
    weaponName: weaponData.weaponName,
    baseWeapon: weaponData.baseWeapon,
    modifiers: weaponData.modifiers,
    type: weaponData.type,
    subtype: weaponData.subtype,
    description: weaponData.description,
    image: weaponData.image,
    itemId: weaponData.itemId,
    status: weaponData.status || 'pending',
    submissionMessageId: weaponData.submissionMessageId,
    notificationMessageId: weaponData.notificationMessageId,
    submittedAt: weaponData.submittedAt || now,
    crafted: weaponData.crafted || false,
    craftingMaterials: weaponData.craftingMaterials || [],
    staminaToCraft: weaponData.staminaToCraft || 0,
    approvedAt: weaponData.approvedAt,
    approvedBy: weaponData.approvedBy,
    updatedAt: now,
    createdAt: weaponData.createdAt || now,
   },
   expiresAt,
  };

  const result = await TempData.findOneAndUpdate(
   { type: "weaponSubmission", key },
   weaponSubmission,
   { upsert: true, new: true }
  );

  console.log(`[storage.js]: Saved weapon submission ${key}`);
  return result;
 } catch (error) {
  console.error(`[storage.js]: Error saving weapon submission ${key}:`, error);
  throw error;
 }
}

async function retrieveWeaponSubmissionFromStorage(key) {
 try {
  const weaponSubmission = await TempData.findByTypeAndKey("weaponSubmission", key);
  if (weaponSubmission) {
   return weaponSubmission.data;
  }
  return null;
 } catch (error) {
  console.error(`[storage.js]: Error retrieving weapon submission ${key}:`, error);
  throw error;
 }
}

async function updateWeaponSubmissionData(submissionId, updates) {
 try {
  if (!submissionId || !updates) {
   console.error(`[storage.js]: Missing submissionId or updates for weapon update operation`);
   throw new Error("Missing submissionId or updates");
  }

  const now = new Date();

  const existingData = await retrieveWeaponSubmissionFromStorage(submissionId);
  if (!existingData) {
   console.error(`[storage.js]: Weapon submission ${submissionId} not found for update`);
   return null;
  }

  const updateData = {
   ...existingData,
   ...updates,
   updatedAt: now,
  };

  const result = await TempData.findOneAndUpdate(
   { type: "weaponSubmission", key: submissionId },
   {
    $set: {
     data: updateData,
     expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
    },
   },
   { new: true }
  );

  if (result) {
   return result.data;
  } else {
   console.error(`[storage.js]: Weapon submission ${submissionId} not found for update`);
   return null;
  }
 } catch (error) {
  console.error(`[storage.js]: Error updating weapon submission ${submissionId}:`, error);
  throw error;
 }
}

async function deleteWeaponSubmissionFromStorage(submissionId) {
 try {
  await TempData.findOneAndDelete({ type: "weaponSubmission", key: submissionId });
 } catch (error) {
  handleError(error, "storage.js");
  throw new Error("Failed to delete weapon submission");
 }
}

async function getAllWeaponSubmissions() {
 try {
  const weaponSubmissions = await TempData.find({ type: "weaponSubmission" });
  return weaponSubmissions.map(submission => ({
   key: submission.key,
   data: submission.data
  }));
 } catch (error) {
  console.error(`[storage.js]: Error retrieving all weapon submissions:`, error);
  throw error;
 }
}

async function saveSubmissionToStorage(key, submissionData) {
 try {
  if (!key || !submissionData) {
   console.error(`[storage.js]: Missing key or data for save operation`);
   throw new Error("Missing key or data");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const submission = {
   type: "submission",
   key,
   data: {
    submissionId: submissionData.submissionId || key,
    userId: submissionData.userId,
    username: submissionData.username,
    userAvatar: submissionData.userAvatar,
    category: submissionData.category || "art",
    questEvent: submissionData.questEvent || "N/A",
    questBonus: submissionData.questBonus ? String(submissionData.questBonus) : "N/A",
    baseSelections: submissionData.baseSelections || [],
    typeMultiplierSelections: submissionData.typeMultiplierSelections || [],
    productMultiplierValue: submissionData.productMultiplierValue,
    addOnsApplied: submissionData.addOnsApplied || [],
    specialWorksApplied: submissionData.specialWorksApplied || [],
    characterCount: submissionData.characterCount || 1,
    typeMultiplierCounts: submissionData.typeMultiplierCounts || {},
    finalTokenAmount: submissionData.finalTokenAmount || 0,
    tokenCalculation: submissionData.tokenCalculation || "N/A",
    collab: submissionData.collab || null,
    blightId: submissionData.blightId || null,
    tokenTracker: submissionData.tokenTracker || null,
    fileUrl: submissionData.fileUrl,
    fileName: submissionData.fileName,
    title: submissionData.title,
    link: submissionData.link,
    wordCount: submissionData.wordCount,
    description: submissionData.description,
    taggedCharacters: submissionData.taggedCharacters || [],
    isGroupMeme: submissionData.isGroupMeme === true,
    memeMode: submissionData.memeMode || null,
    memeTemplate: submissionData.memeTemplate || null,
    updatedAt: now,
    createdAt: submissionData.createdAt || now,
   },
   expiresAt,
  };

  const result = await TempData.findOneAndUpdate(
   { type: "submission", key },
   submission,
   { upsert: true, new: true }
  );

  logger.success('STORAGE', `Saved submission ${key}`);
  return result;
 } catch (error) {
  console.error(`[storage.js]: Error saving submission ${key}:`, error);
  throw error;
 }
}

async function updateSubmissionData(submissionId, updates) {
 try {
  if (!submissionId || !updates) {
   console.error(
    `[storage.js]: Missing submissionId or updates for update operation`
   );
   throw new Error("Missing submissionId or updates");
  }

  const now = new Date();

  const existingData = await retrieveSubmissionFromStorage(submissionId);
  if (!existingData) {
   console.error(
    `[storage.js]: Submission ${submissionId} not found for update`
   );
   return null;
  }

  const updateData = {
   ...existingData,
   ...updates,
   updatedAt: now,
  };

  const result = await TempData.findOneAndUpdate(
   { type: "submission", key: submissionId },
   {
    $set: {
     data: updateData,
     expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
    },
   },
   { new: true }
  );

  if (result) {
   return result.data;
  } else {
   console.error(
    `[storage.js]: Submission ${submissionId} not found for update`
   );
   return null;
  }
 } catch (error) {
  console.error(
   `[storage.js]: Error updating submission ${submissionId}:`,
   error
  );
  throw error;
 }
}

async function getOrCreateSubmission(userId, initialData = {}) {
 try {
  let submissionId = await findLatestSubmissionIdForUser(userId);
  let submissionData = null;

  if (submissionId) {
   submissionData = await retrieveSubmissionFromStorage(submissionId);
  }

  if (!submissionData) {
   submissionId =
    "A" +
    Math.floor(Math.random() * 1000000)
     .toString()
     .padStart(6, "0");

   submissionData = {
    submissionId,
    userId,
    baseSelections: [],
    typeMultiplierSelections: [],
    productMultiplierValue: undefined,
    addOnsApplied: [],
    specialWorksApplied: [],
    characterCount: 1,
    typeMultiplierCounts: {},
    finalTokenAmount: 0,
    tokenCalculation: null,
    collab: null,
    tokenTracker: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...initialData,
   };

   await saveSubmissionToStorage(submissionId, submissionData);
   console.log(`[storage.js]: Created new submission: ${submissionId}`);
  }

  return { submissionId, submissionData };
 } catch (error) {
  console.error(`[storage.js]: Error in getOrCreateSubmission:`, error);
  throw error;
 }
}

async function retrieveSubmissionFromStorage(key) {
 try {
  const submission = await TempData.findByTypeAndKey("submission", key);
  if (submission) {
   return submission.data;
  }
  return null;
 } catch (error) {
  console.error(`[storage.js]: Error retrieving submission ${key}:`, error);
  throw error;
 }
}

async function deleteSubmissionFromStorage(submissionId) {
 try {
  await TempData.findOneAndDelete({ type: "submission", key: submissionId });
 } catch (error) {
  handleError(error, "storage.js");
  throw new Error("Failed to delete submission");
 }
}

// ============================================================================
// ------------------- Enhanced Boosting Storage Functions -------------------
// File-based storage for boosting requests with duration tracking

function saveBoostingRequestToStorage(requestId, requestData) {
 try {
  const allRequests = getAllBoostingRequests();
  allRequests[requestId] = {
   ...requestData,
   lastUpdated: new Date().toISOString(),
  };

  fs.writeFileSync(BOOSTING_STORAGE_FILE, JSON.stringify(allRequests, null, 2));
  console.log(`[storage.js]: Saved boosting request ${requestId}`);
 } catch (error) {
  console.error(
   `[storage.js]: Error saving boosting request ${requestId}:`,
   error
  );
  throw error;
 }
}

function retrieveBoostingRequestFromStorage(requestId) {
 try {
  const allRequests = getAllBoostingRequests();
  return allRequests[requestId] || null;
 } catch (error) {
  console.error(
   `[storage.js]: Error retrieving boosting request ${requestId}:`,
   error
  );
  return null;
 }
}

function retrieveBoostingRequestFromStorageByCharacter(characterName) {
 try {
  const allRequests = getAllBoostingRequests();
  const currentTime = Date.now();

  for (const [requestId, requestData] of Object.entries(allRequests)) {
   if (
    requestData.targetCharacter === characterName &&
    requestData.status === "accepted"
   ) {
    if (
     requestData.boostExpiresAt &&
     currentTime <= requestData.boostExpiresAt
    ) {
     return requestData;
    } else if (
     requestData.boostExpiresAt &&
     currentTime > requestData.boostExpiresAt
    ) {
     requestData.status = "expired";
     saveBoostingRequestToStorage(requestId, requestData);
    }
   }
  }

  return null;
 } catch (error) {
  console.error(
   `[storage.js]: Error retrieving active boost for ${characterName}:`,
   error
  );
  return null;
 }
}

function getAllBoostingRequests() {
 try {
  if (!fs.existsSync(BOOSTING_STORAGE_FILE)) {
   return {};
  }

  const data = fs.readFileSync(BOOSTING_STORAGE_FILE, "utf8");
  return JSON.parse(data);
 } catch (error) {
  console.error("[storage.js]: Error reading boosting requests file:", error);
  return {};
 }
}

function getAllActiveBoosts() {
 try {
  const allRequests = getAllBoostingRequests();
  const currentTime = Date.now();
  const activeBoosts = [];

  for (const [requestId, requestData] of Object.entries(allRequests)) {
   if (requestData.status === "accepted") {
    if (
     requestData.boostExpiresAt &&
     currentTime <= requestData.boostExpiresAt
    ) {
     activeBoosts.push({
      requestId,
      ...requestData,
     });
    } else if (
     requestData.boostExpiresAt &&
     currentTime > requestData.boostExpiresAt
    ) {
     requestData.status = "expired";
     saveBoostingRequestToStorage(requestId, requestData);
    }
   }
  }

  return activeBoosts;
 } catch (error) {
  console.error("[storage.js]: Error getting active boosts:", error);
  return [];
 }
}

function getPendingRequestsForCharacter(characterName) {
 try {
  const allRequests = getAllBoostingRequests();
  const currentTime = Date.now();
  const pendingRequests = [];

  for (const [requestId, requestData] of Object.entries(allRequests)) {
   if (
    requestData.boostingCharacter === characterName &&
    requestData.status === "pending"
   ) {
    if (requestData.expiresAt && currentTime <= requestData.expiresAt) {
     pendingRequests.push({
      requestId,
      ...requestData,
     });
    } else if (requestData.expiresAt && currentTime > requestData.expiresAt) {
     requestData.status = "expired";
     saveBoostingRequestToStorage(requestId, requestData);
    }
   }
  }

  return pendingRequests;
 } catch (error) {
  console.error(
   `[storage.js]: Error getting pending requests for ${characterName}:`,
   error
  );
  return [];
 }
}

function deleteBoostingRequestFromStorage(requestId) {
 try {
  const allRequests = getAllBoostingRequests();
  delete allRequests[requestId];

  fs.writeFileSync(BOOSTING_STORAGE_FILE, JSON.stringify(allRequests, null, 2));
  console.log(`[storage.js]: Deleted boosting request ${requestId}`);
 } catch (error) {
  console.error(
   `[storage.js]: Error deleting boosting request ${requestId}:`,
   error
  );
  throw error;
 }
}

function cleanupExpiredBoostingRequests() {
 try {
  const allRequests = getAllBoostingRequests();
  const currentTime = Date.now();
  let expiredRequests = 0;
  let expiredBoosts = 0;

  for (const [requestId, requestData] of Object.entries(allRequests)) {
   let updated = false;

   if (
    requestData.status === "pending" &&
    requestData.expiresAt &&
    currentTime > requestData.expiresAt
   ) {
    requestData.status = "expired";
    updated = true;
    expiredRequests++;
    console.log(`[storage.js]: ⏰ Expired pending boost request ${requestId}`);
   }

   if (
    requestData.status === "accepted" &&
    requestData.boostExpiresAt &&
    currentTime > requestData.boostExpiresAt
   ) {
    requestData.status = "expired";
    updated = true;
    expiredBoosts++;
    console.log(
     `[storage.js]: ⏰ Expired active boost ${requestId} for ${requestData.targetCharacter}`
    );
   }

   if (updated) {
    allRequests[requestId] = requestData;
   }
  }

  if (expiredRequests > 0 || expiredBoosts > 0) {
   fs.writeFileSync(
    BOOSTING_STORAGE_FILE,
    JSON.stringify(allRequests, null, 2)
   );
  }

  return {
   expiredRequests,
   expiredBoosts,
   totalProcessed: Object.keys(allRequests).length,
  };
 } catch (error) {
  console.error("[storage.js]: ❌ Error during boost cleanup:", error);
  return {
   expiredRequests: 0,
   expiredBoosts: 0,
   totalProcessed: 0,
   error: error.message,
  };
 }
}

function getBoostingStatistics() {
 try {
  const allRequests = getAllBoostingRequests();
  const stats = {
   total: 0,
   pending: 0,
   fulfilled: 0,
   expired: 0,
   active: 0,
   byCategory: {},
   byJob: {},
  };

  const currentTime = Date.now();

  for (const requestData of Object.values(allRequests)) {
   stats.total++;

   if (requestData.status === "pending") {
    if (requestData.expiresAt && currentTime <= requestData.expiresAt) {
     stats.pending++;
    } else {
     stats.expired++;
    }
   } else if (requestData.status === "accepted") {
    stats.fulfilled++;
    if (
     requestData.boostExpiresAt &&
     currentTime <= requestData.boostExpiresAt
    ) {
     stats.active++;
    }
   } else if (requestData.status === "fulfilled") {
    stats.fulfilled++;
   } else if (requestData.status === "expired") {
    stats.expired++;
   }

   if (requestData.category) {
    stats.byCategory[requestData.category] =
     (stats.byCategory[requestData.category] || 0) + 1;
   }

   if (requestData.boostingCharacter) {
    stats.byJob[requestData.boostingCharacter] =
     (stats.byJob[requestData.boostingCharacter] || 0) + 1;
   }
  }

  return stats;
 } catch (error) {
  console.error("[storage.js]: ❌ Error getting boosting statistics:", error);
  return {
   total: 0,
   pending: 0,
   fulfilled: 0,
   expired: 0,
   active: 0,
   byCategory: {},
   byJob: {},
   error: error.message,
  };
 }
}

function archiveOldBoostingRequests(daysOld = 30) {
 try {
  const allRequests = getAllBoostingRequests();
  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  const archiveFile = path.join(
   STORAGE_DIR,
   `boosting_archive_${new Date().toISOString().split("T")[0]}.json`
  );

  const toArchive = {};
  const toKeep = {};

  for (const [requestId, requestData] of Object.entries(allRequests)) {
   const requestTime = requestData.timestamp || 0;

   if (requestData.status === "expired" && requestTime < cutoffTime) {
    toArchive[requestId] = requestData;
   } else {
    toKeep[requestId] = requestData;
   }
  }

  if (Object.keys(toArchive).length > 0) {
   fs.writeFileSync(archiveFile, JSON.stringify(toArchive, null, 2));
   console.log(
    `[storage.js]: 📦 Archived ${Object.keys(toArchive).length} old boost requests to ${archiveFile}`
   );
  }

  fs.writeFileSync(BOOSTING_STORAGE_FILE, JSON.stringify(toKeep, null, 2));

  return {
   archived: Object.keys(toArchive).length,
   remaining: Object.keys(toKeep).length,
  };
 } catch (error) {
  console.error("[storage.js]: ❌ Error archiving old boost requests:", error);
  return {
   archived: 0,
   remaining: 0,
   error: error.message,
  };
 }
}

function markBoostAsExpired(requestId) {
 const requestData = retrieveBoostingRequestFromStorage(requestId);
 if (requestData) {
  requestData.status = "expired";
  saveBoostingRequestToStorage(requestId, requestData);
 }
}

// ============================================================================
// ------------------- Temporary Data Storage Functions -------------------
// Functions for managing temporary data in MongoDB

async function saveToStorage(key, type, data) {
 try {
  const now = new Date();
  let expiresAt;

  switch (type) {
   case "healing":
    expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    break;
   case "vending":
    expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    break;
   case "boosting":
    expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    break;
   case "battle":
    expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    break;
   case "encounter":
    expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    break;
   case "blight":
    expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    break;
   case "travel":
    expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    break;
   case "gather":
    expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    break;
   case "trade":
    expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    break;
   case "monthly":
    expiresAt = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    break;
   default:
    expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  await TempData.create({ key, type, data, expiresAt });
 } catch (error) {
  handleError(error, "storage.js");
  throw error;
 }
}

async function retrieveFromStorage(key, type) {
 try {
  const result = await TempData.findByTypeAndKey(type, key);
  return result?.data || null;
 } catch (error) {
  handleError(error, "storage.js");
  throw error;
 }
}

async function deleteFromStorage(key, type) {
 try {
  await TempData.findOneAndDelete({ key, type });
 } catch (error) {
  handleError(error, "storage.js");
  throw error;
 }
}

async function retrieveAllByType(type) {
 try {
  const results = await TempData.findAllByType(type);
  return results.map((doc) => doc.data);
 } catch (error) {
  handleError(error, "storage.js");
  throw error;
 }
}

async function saveHealingRequestToStorage(healingRequestId, requestData) {
 await saveToStorage(healingRequestId, "healing", requestData);
}

async function retrieveHealingRequestFromStorage(healingRequestId) {
 return retrieveFromStorage(healingRequestId, "healing");
}

async function deleteHealingRequestFromStorage(healingRequestId) {
 await deleteFromStorage(healingRequestId, "healing");
}

async function saveVendingRequestToStorage(fulfillmentId, requestData) {
 await saveToStorage(fulfillmentId, "vending", requestData);
}

async function retrieveVendingRequestFromStorage(fulfillmentId) {
 return retrieveFromStorage(fulfillmentId, "vending");
}

async function deleteVendingRequestFromStorage(fulfillmentId) {
 await deleteFromStorage(fulfillmentId, "vending");
}

async function retrieveAllVendingRequests() {
 return retrieveAllByType("vending");
}

async function saveBattleProgressToStorage(battleId, battleData) {
 try {
  console.log(`[storage.js]: Raw battle data received:`, {
   battleId,
   monster: {
    name: battleData.monster?.name,
    hearts: JSON.stringify(battleData.monster?.hearts),
    tier: battleData.monster?.tier,
   },
   raw: JSON.stringify(battleData, null, 2),
  });

  console.log(`[storage.js]: Processing monster hearts:`, {
   type: typeof battleData.monster?.hearts,
   value: JSON.stringify(battleData.monster?.hearts),
   hasCurrent: battleData.monster?.hearts?.current !== undefined,
   hasMax: battleData.monster?.hearts?.max !== undefined,
   rawValue: battleData.monster?.hearts,
  });

  let currentHearts = 0;
  let maxHearts = 1;

  if (
   typeof battleData.monster?.hearts === "object" &&
   battleData.monster?.hearts !== null
  ) {
   console.log(`[storage.js]: Extracting hearts from object:`, {
    hearts: JSON.stringify(battleData.monster.hearts),
    current: battleData.monster.hearts.current,
    max: battleData.monster.hearts.max,
   });

   currentHearts = Math.max(0, Number(battleData.monster.hearts.current || 0));
   maxHearts = Math.max(1, Number(battleData.monster.hearts.max || 1));

   console.log(`[storage.js]: Extracted hearts from object format:`, {
    current: currentHearts,
    max: maxHearts,
    original: JSON.stringify(battleData.monster.hearts),
   });
  } else if (typeof battleData.monster?.hearts === "number") {
   console.log(`[storage.js]: Extracting hearts from number:`, {
    hearts: battleData.monster.hearts,
   });

   currentHearts = Math.max(0, battleData.monster.hearts);
   maxHearts = Math.max(1, currentHearts);

   console.log(`[storage.js]: Extracted hearts from number format:`, {
    current: currentHearts,
    max: maxHearts,
    original: battleData.monster.hearts,
   });
  } else {
   console.error(`[storage.js]: Invalid hearts format:`, {
    type: typeof battleData.monster?.hearts,
    value: battleData.monster?.hearts,
   });
   return null;
  }

  const transformedData = {
   type: "battle",
   key: battleId,
   data: {
    ...battleData,
    monster: {
     ...battleData.monster,
     hearts: {
      current: currentHearts,
      max: maxHearts,
     },
    },
   },
   expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  };

  console.log(`[storage.js]: Transformed data before save:`, {
   type: transformedData.type,
   key: transformedData.key,
   monster: {
    name: transformedData.data.monster.name,
    hearts: JSON.stringify(transformedData.data.monster.hearts),
    tier: transformedData.data.monster.tier,
   },
  });

  const result = await TempData.findOneAndUpdate(
   { type: "battle", key: battleId },
   transformedData,
   { new: true, upsert: true }
  );

  if (!result) {
   console.error(
    `[storage.js]: Failed to save battle progress for ${battleId}`
   );
   return null;
  }

  console.log(`[storage.js]: Save result:`, {
   battleId,
   savedHearts: JSON.stringify(result.monster.hearts),
   expectedHearts: JSON.stringify(transformedData.monster.hearts),
   originalHearts: JSON.stringify(battleData.monster?.hearts),
  });

  return result;
 } catch (error) {
  console.error(`[storage.js]: Error saving battle progress:`, {
   error: error.message,
   battleId,
   battleData: JSON.stringify(battleData),
  });
  return null;
 }
}

async function retrieveBattleProgressFromStorage(battleId) {
 try {
  const battle = await TempData.findByTypeAndKey("battle", battleId);
  if (battle) {
   console.log(
    `[storage.js]: Found battle progress for Battle ID "${battleId}"`
   );
   return battle.data;
  }
  console.error(
   `[storage.js]: No battle progress found for Battle ID "${battleId}"`
  );
  return null;
 } catch (error) {
  console.error(
   `[storage.js]: Error retrieving battle progress for Battle ID "${battleId}":`,
   error
  );
  throw error;
 }
}

async function deleteBattleProgressFromStorage(battleId) {
 try {
  await TempData.findOneAndDelete({ type: "battle", key: battleId });
  console.log(
   `[storage.js]: Deleted battle progress for Battle ID "${battleId}"`
  );
 } catch (error) {
  console.error(
   `[storage.js]: Error deleting battle progress for Battle ID "${battleId}":`,
   error
  );
  throw error;
 }
}

async function saveEncounterToStorage(encounterId, encounterData) {
 await saveToStorage(encounterId, "encounter", encounterData);
}

async function retrieveEncounterFromStorage(encounterId) {
 return retrieveFromStorage(encounterId, "encounter");
}

async function deleteEncounterFromStorage(encounterId) {
 await deleteFromStorage(encounterId, "encounter");
}

async function saveBlightRequestToStorage(submissionId, requestData) {
 await saveToStorage(submissionId, "blight", requestData);
}

async function retrieveBlightRequestFromStorage(submissionId) {
 return retrieveFromStorage(submissionId, "blight");
}

async function deleteBlightRequestFromStorage(submissionId) {
 await deleteFromStorage(submissionId, "blight");
}

async function saveMonthlyEncounterToStorage(encounterId, encounterData) {
 await saveToStorage(encounterId, "monthly", encounterData);
}

async function retrieveMonthlyEncounterFromStorage(encounterId) {
 return retrieveFromStorage(encounterId, "monthly");
}

async function deleteMonthlyEncounterFromStorage(encounterId) {
 await deleteFromStorage(encounterId, "monthly");
}

async function saveTradeToStorage(tradeId, tradeData) {
 await saveToStorage(tradeId, "trade", tradeData);
}

async function retrieveTradeFromStorage(tradeId) {
 return retrieveFromStorage(tradeId, "trade");
}

async function deleteTradeFromStorage(tradeId) {
 await deleteFromStorage(tradeId, "trade");
}

async function savePendingEditToStorage(editId, editData) {
 console.log(
  `[storage.js]: savePendingEditToStorage called with editId=${editId}`
 );
 await saveToStorage(editId, "pendingEdit", editData);
}

async function retrievePendingEditFromStorage(editId) {
 return retrieveFromStorage(editId, "pendingEdit");
}

async function deletePendingEditFromStorage(editId) {
 console.log(
  `[storage.js]: deletePendingEditFromStorage called with editId=${editId}`
 );
 await deleteFromStorage(editId, "pendingEdit");
}

async function cleanupExpiredEntries(maxAgeInMs = 86400000) {
 try {
  const result = await TempData.cleanup(maxAgeInMs);
  return result;
 } catch (error) {
  handleError(error, "storage.js");
  throw error;
 }
}

async function cleanupEntriesWithoutExpiration() {
 try {
  const result = await TempData.deleteMany({
   expiresAt: { $exists: false },
  });
  console.log(
   `[storage.js]: Cleaned up ${result.deletedCount} entries without expiration dates`
  );
 } catch (error) {
  handleError(error, "storage.js");
  console.error(
   "[storage.js]: Error cleaning up entries without expiration dates:",
   error.message
  );
 }
}

async function cleanupExpiredHealingRequests() {
 try {
  const result = await TempData.deleteMany({
   type: "healing",
   expiresAt: { $lt: new Date() },
  });
  logger.success('CLEANUP', `Cleaned up ${result.deletedCount} expired healing requests`);
 } catch (error) {
  handleError(error, "storage.js");
  console.error(
   "[storage.js]: Error cleaning up expired healing requests:",
   error.message
  );
 }
}

async function runWithTransaction(fn) {
 const session = await mongoose.startSession();
 session.startTransaction();
 try {
  const result = await fn(session);
  await session.commitTransaction();
  return result;
 } catch (error) {
  await session.abortTransaction();
  handleError(error, "storage.js");
  throw error;
 } finally {
  session.endSession();
 }
}

async function findLatestSubmissionIdForUser(userId) {
 try {
  const result = await TempData.findOne({
   type: "submission",
   "data.userId": userId,
   expiresAt: { $gt: new Date() },
  }).sort({ "data.updatedAt": -1 });

  return result?.data?.submissionId || null;
 } catch (error) {
  console.error(
   `[storage.js]: Error finding latest submission for user ${userId}:`,
   error
  );
  return null;
 }
}

module.exports = {
 saveWeaponSubmissionToStorage,
 retrieveWeaponSubmissionFromStorage,
 updateWeaponSubmissionData,
 deleteWeaponSubmissionFromStorage,
 getAllWeaponSubmissions,

 saveSubmissionToStorage,
 updateSubmissionData,
 getOrCreateSubmission,
 retrieveSubmissionFromStorage,
 deleteSubmissionFromStorage,

 saveHealingRequestToStorage,
 retrieveHealingRequestFromStorage,
 deleteHealingRequestFromStorage,

 saveVendingRequestToStorage,
 retrieveVendingRequestFromStorage,
 deleteVendingRequestFromStorage,
 retrieveAllVendingRequests,

 saveBoostingRequestToStorage,
 retrieveBoostingRequestFromStorage,
 retrieveBoostingRequestFromStorageByCharacter,
 getAllBoostingRequests,
 getAllActiveBoosts,
 getPendingRequestsForCharacter,
 deleteBoostingRequestFromStorage,
 cleanupExpiredBoostingRequests,
 getBoostingStatistics,
 archiveOldBoostingRequests,
 markBoostAsExpired,

 saveBattleProgressToStorage,
 retrieveBattleProgressFromStorage,
 deleteBattleProgressFromStorage,

 saveEncounterToStorage,
 retrieveEncounterFromStorage,
 deleteEncounterFromStorage,

 saveBlightRequestToStorage,
 retrieveBlightRequestFromStorage,
 deleteBlightRequestFromStorage,

 saveMonthlyEncounterToStorage,
 retrieveMonthlyEncounterFromStorage,
 deleteMonthlyEncounterFromStorage,

 saveTradeToStorage,
 retrieveTradeFromStorage,
 deleteTradeFromStorage,

 savePendingEditToStorage,
 retrievePendingEditFromStorage,
 deletePendingEditFromStorage,

 cleanupExpiredEntries,
 runWithTransaction,
 cleanupExpiredHealingRequests,
 cleanupEntriesWithoutExpiration,

 retrieveAllByType,
 findLatestSubmissionIdForUser,

 saveToStorage,
 retrieveFromStorage,
 deleteFromStorage,
};
