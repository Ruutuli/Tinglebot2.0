// ------------------- Standard Libraries -------------------
// Import core Node.js modules.
const { handleError } = require('../utils/globalErrorHandler');
const TempData = require('../models/TempDataModel');
const mongoose = require('mongoose');

// ============================================================================
// ------------------- Submission Storage Functions -------------------
// Functions for saving, retrieving, and deleting submissions from persistent storage.

// Save a submission to storage.
async function saveSubmissionToStorage(key, submissionData) {
  try {
    if (!key || !submissionData) {
      console.error(`[storage.js]: ❌ Missing key or data for save operation`);
      throw new Error('Missing key or data');
    }

    // Set expiration to 48 hours from now
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Ensure all required fields are present and properly structured
    const submission = {
      type: 'submission',
      key,
      data: {
        submissionId: submissionData.submissionId || key,
        userId: submissionData.userId,
        username: submissionData.username,
        userAvatar: submissionData.userAvatar,
        category: submissionData.category || 'art',
        questEvent: submissionData.questEvent || 'N/A',
        questBonus: submissionData.questBonus || 'N/A',
        baseSelections: submissionData.baseSelections || [],
        typeMultiplierSelections: submissionData.typeMultiplierSelections || [],
        productMultiplierValue: submissionData.productMultiplierValue,
        addOnsApplied: submissionData.addOnsApplied || [],
        specialWorksApplied: submissionData.specialWorksApplied || [],
        characterCount: submissionData.characterCount || 1,
        typeMultiplierCounts: submissionData.typeMultiplierCounts || {},
        finalTokenAmount: submissionData.finalTokenAmount || 0,
        tokenCalculation: submissionData.tokenCalculation || 'N/A',
        collab: submissionData.collab || null,
        fileUrl: submissionData.fileUrl,
        fileName: submissionData.fileName,
        title: submissionData.title,
        updatedAt: now,
        createdAt: submissionData.createdAt || now
      },
      expiresAt
    };

    const result = await TempData.findOneAndUpdate(
      { type: 'submission', key },
      submission,
      { upsert: true, new: true }
    );

    console.log(`[storage.js]: ✅ Saved submission ${key}`);
    return result;
  } catch (error) {
    console.error(`[storage.js]: ❌ Error saving submission ${key}:`, error);
    throw error;
  }
}

// Update submission data efficiently without duplicate saves
async function updateSubmissionData(submissionId, updates) {
  try {
    if (!submissionId || !updates) {
      console.error(`[storage.js]: ❌ Missing submissionId or updates for update operation`);
      throw new Error('Missing submissionId or updates');
    }

    const now = new Date();
    
    // First, get the existing submission data
    const existingData = await retrieveSubmissionFromStorage(submissionId);
    if (!existingData) {
      console.error(`[storage.js]: ❌ Submission ${submissionId} not found for update`);
      return null;
    }

    // Merge the updates with existing data
    const updateData = {
      ...existingData,
      ...updates,
      updatedAt: now
    };

    const result = await TempData.findOneAndUpdate(
      { type: 'submission', key: submissionId },
      { 
        $set: { 
          'data': updateData,
          expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000)
        }
      },
      { new: true }
    );

    if (result) {
      return result.data;
    } else {
      console.error(`[storage.js]: ❌ Submission ${submissionId} not found for update`);
      return null;
    }
  } catch (error) {
    console.error(`[storage.js]: ❌ Error updating submission ${submissionId}:`, error);
    throw error;
  }
}

// Get or create submission data for a user
async function getOrCreateSubmission(userId, initialData = {}) {
  try {
    // Try to find existing submission
    let submissionId = await findLatestSubmissionIdForUser(userId);
    let submissionData = null;

    if (submissionId) {
      submissionData = await retrieveSubmissionFromStorage(submissionId);
    }

    // If no existing submission, create new one
    if (!submissionData) {
      submissionId = 'A' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      
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
        createdAt: new Date(),
        updatedAt: new Date(),
        ...initialData
      };

      await saveSubmissionToStorage(submissionId, submissionData);
      console.log(`[storage.js]: ✅ Created new submission: ${submissionId}`);
    }

    return { submissionId, submissionData };
  } catch (error) {
    console.error(`[storage.js]: ❌ Error in getOrCreateSubmission:`, error);
    throw error;
  }
}

// Retrieve a submission by its ID.
async function retrieveSubmissionFromStorage(key) {
  try {
    const submission = await TempData.findByTypeAndKey('submission', key);
    if (submission) {
      return submission.data;
    }
    return null;
  } catch (error) {
    console.error(`[storage.js]: ❌ Error retrieving submission ${key}:`, error);
    throw error;
  }
}

// Delete a submission from storage by its ID.
async function deleteSubmissionFromStorage(submissionId) {
  try {
    await TempData.findOneAndDelete({ type: 'submission', key: submissionId });
  } catch (error) {
    handleError(error, 'storage.js');
    throw new Error('Failed to delete submission');
  }
}

// ============================================================================
// ------------------- Temporary Data Storage Functions -------------------
// Functions for managing temporary data in MongoDB

// Generic storage functions
async function saveToStorage(key, type, data) {
  try {
    const now = new Date();
    let expiresAt;

    // Set expiration based on type
    switch (type) {
      case 'healing':
        expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        break;
      case 'vending':
        expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
        break;
      case 'boosting':
        expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        break;
      case 'battle':
        expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours
        break;
      case 'encounter':
        expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours
        break;
      case 'blight':
        expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
        break;
      case 'travel':
        expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours
        break;
      case 'gather':
        expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours
        break;
      case 'trade':
        expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        break;
      case 'monthly':
        // Set to end of current month
        expiresAt = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      default:
        expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default 24 hours
    }

    await TempData.create({ key, type, data, expiresAt });
  } catch (error) {
    handleError(error, 'storage.js');
    throw error;
  }
}

async function retrieveFromStorage(key, type) {
  try {
    const result = await TempData.findByTypeAndKey(type, key);
    return result?.data || null;
  } catch (error) {
    handleError(error, 'storage.js');
    throw error;
  }
}

async function deleteFromStorage(key, type) {
  try {
    await TempData.findOneAndDelete({ key, type });
  } catch (error) {
    handleError(error, 'storage.js');
    throw error;
  }
}

async function retrieveAllByType(type) {
  try {
    const results = await TempData.findAllByType(type);
    return results.map(doc => doc.data);
  } catch (error) {
    handleError(error, 'storage.js');
    throw error;
  }
}

// Healing request functions
async function saveHealingRequestToStorage(healingRequestId, requestData) {
  await saveToStorage(healingRequestId, 'healing', requestData);
}

async function retrieveHealingRequestFromStorage(healingRequestId) {
  return retrieveFromStorage(healingRequestId, 'healing');
}

async function deleteHealingRequestFromStorage(healingRequestId) {
  await deleteFromStorage(healingRequestId, 'healing');
}

// Vending request functions
async function saveVendingRequestToStorage(fulfillmentId, requestData) {
  await saveToStorage(fulfillmentId, 'vending', requestData);
}

async function retrieveVendingRequestFromStorage(fulfillmentId) {
  return retrieveFromStorage(fulfillmentId, 'vending');
}

async function deleteVendingRequestFromStorage(fulfillmentId) {
  await deleteFromStorage(fulfillmentId, 'vending');
}

async function retrieveAllVendingRequests() {
  return retrieveAllByType('vending');
}

// Boosting request functions
async function saveBoostingRequestToStorage(boostRequestId, requestData) {
  await saveToStorage(boostRequestId, 'boosting', requestData);
}

async function retrieveBoostingRequestFromStorage(boostRequestId) {
  return retrieveFromStorage(boostRequestId, 'boosting');
}

async function retrieveBoostingRequestFromStorageByCharacter(characterName) {
  const requests = await retrieveAllByType('boosting');
  return requests.find(request => request.targetCharacter === characterName);
}

// Battle progress functions
async function saveBattleProgressToStorage(battleId, battleData) {
  try {
    console.log(`[storage.js]: 🔍 Raw battle data received:`, {
      battleId,
      monster: {
        name: battleData.monster?.name,
        hearts: JSON.stringify(battleData.monster?.hearts),
        tier: battleData.monster?.tier
      },
      raw: JSON.stringify(battleData, null, 2)
    });

    // Process monster hearts
    console.log(`[storage.js]: 🔍 Processing monster hearts:`, {
      type: typeof battleData.monster?.hearts,
      value: JSON.stringify(battleData.monster?.hearts),
      hasCurrent: battleData.monster?.hearts?.current !== undefined,
      hasMax: battleData.monster?.hearts?.max !== undefined,
      rawValue: battleData.monster?.hearts
    });

    // Extract heart values
    let currentHearts = 0;
    let maxHearts = 1;

    if (typeof battleData.monster?.hearts === 'object' && battleData.monster?.hearts !== null) {
      console.log(`[storage.js]: 🔍 Extracting hearts from object:`, {
        hearts: JSON.stringify(battleData.monster.hearts),
        current: battleData.monster.hearts.current,
        max: battleData.monster.hearts.max
      });

      currentHearts = Math.max(0, Number(battleData.monster.hearts.current || 0));
      maxHearts = Math.max(1, Number(battleData.monster.hearts.max || 1));

      console.log(`[storage.js]: ✅ Extracted hearts from object format:`, {
        current: currentHearts,
        max: maxHearts,
        original: JSON.stringify(battleData.monster.hearts)
      });
    } else if (typeof battleData.monster?.hearts === 'number') {
      console.log(`[storage.js]: 🔍 Extracting hearts from number:`, {
        hearts: battleData.monster.hearts
      });

      currentHearts = Math.max(0, battleData.monster.hearts);
      maxHearts = Math.max(1, currentHearts);

      console.log(`[storage.js]: ✅ Extracted hearts from number format:`, {
        current: currentHearts,
        max: maxHearts,
        original: battleData.monster.hearts
      });
    } else {
      console.error(`[storage.js]: ❌ Invalid hearts format:`, {
        type: typeof battleData.monster?.hearts,
        value: battleData.monster?.hearts
      });
      return null;
    }

    // Transform data according to schema
    const transformedData = {
      type: 'battle',
      key: battleId,
      data: {
        ...battleData,
        monster: {
          ...battleData.monster,
          hearts: {
            current: currentHearts,
            max: maxHearts
          }
        }
      },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours
    };

    console.log(`[storage.js]: 🔄 Transformed data before save:`, {
      type: transformedData.type,
      key: transformedData.key,
      monster: {
        name: transformedData.data.monster.name,
        hearts: JSON.stringify(transformedData.data.monster.hearts),
        tier: transformedData.data.monster.tier
      }
    });

    // Save to database
    const result = await TempData.findOneAndUpdate(
      { type: 'battle', key: battleId },
      transformedData,
      { new: true, upsert: true }
    );

    // Verify save
    if (!result) {
      console.error(`[storage.js]: ❌ Failed to save battle progress for ${battleId}`);
      return null;
    }

    console.log(`[storage.js]: ✅ Save result:`, {
      battleId,
      savedHearts: JSON.stringify(result.monster.hearts),
      expectedHearts: JSON.stringify(transformedData.monster.hearts),
      originalHearts: JSON.stringify(battleData.monster?.hearts)
    });

    return result;
  } catch (error) {
    console.error(`[storage.js]: ❌ Error saving battle progress:`, {
      error: error.message,
      battleId,
      battleData: JSON.stringify(battleData)
    });
    return null;
  }
}

async function retrieveBattleProgressFromStorage(battleId) {
  try {
    const battle = await TempData.findByTypeAndKey('battle', battleId);
    if (battle) {
      console.log(`[storage.js]: ✅ Found battle progress for Battle ID "${battleId}"`);
      return battle.data;
    }
    console.error(`[storage.js]: ❌ No battle progress found for Battle ID "${battleId}"`);
    return null;
  } catch (error) {
    console.error(`[storage.js]: ❌ Error retrieving battle progress for Battle ID "${battleId}":`, error);
    throw error;
  }
}

async function deleteBattleProgressFromStorage(battleId) {
  try {
    await TempData.findOneAndDelete({ type: 'battle', key: battleId });
    console.log(`[storage.js]: ✅ Deleted battle progress for Battle ID "${battleId}"`);
  } catch (error) {
    console.error(`[storage.js]: ❌ Error deleting battle progress for Battle ID "${battleId}":`, error);
    throw error;
  }
}

// Encounter functions
async function saveEncounterToStorage(encounterId, encounterData) {
  await saveToStorage(encounterId, 'encounter', encounterData);
}

async function retrieveEncounterFromStorage(encounterId) {
  return retrieveFromStorage(encounterId, 'encounter');
}

async function deleteEncounterFromStorage(encounterId) {
  await deleteFromStorage(encounterId, 'encounter');
}

// Blight request functions
async function saveBlightRequestToStorage(submissionId, requestData) {
  await saveToStorage(submissionId, 'blight', requestData);
}

async function retrieveBlightRequestFromStorage(submissionId) {
  return retrieveFromStorage(submissionId, 'blight');
}

async function deleteBlightRequestFromStorage(submissionId) {
  await deleteFromStorage(submissionId, 'blight');
}

// Monthly encounter functions
async function saveMonthlyEncounterToStorage(encounterId, encounterData) {
  await saveToStorage(encounterId, 'monthly', encounterData);
}

async function retrieveMonthlyEncounterFromStorage(encounterId) {
  return retrieveFromStorage(encounterId, 'monthly');
}

async function deleteMonthlyEncounterFromStorage(encounterId) {
  await deleteFromStorage(encounterId, 'monthly');
}

// Trade functions
async function saveTradeToStorage(tradeId, tradeData) {
  await saveToStorage(tradeId, 'trade', tradeData);
}

async function retrieveTradeFromStorage(tradeId) {
  return retrieveFromStorage(tradeId, 'trade');
}

async function deleteTradeFromStorage(tradeId) {
  await deleteFromStorage(tradeId, 'trade');
}

// Pending Edit functions
async function savePendingEditToStorage(editId, editData) {
  console.log(`[storage.js]: 🔄 savePendingEditToStorage called with editId=${editId}`);
  await saveToStorage(editId, 'pendingEdit', editData);
}

async function retrievePendingEditFromStorage(editId) {
  return retrieveFromStorage(editId, 'pendingEdit');
}

async function deletePendingEditFromStorage(editId) {
  console.log(`[storage.js]: 🔄 deletePendingEditFromStorage called with editId=${editId}`);
  await deleteFromStorage(editId, 'pendingEdit');
}

// Cleanup function
async function cleanupExpiredEntries(maxAgeInMs = 86400000) {
  try {
    const result = await TempData.cleanup(maxAgeInMs);
    return result;
  } catch (error) {
    handleError(error, 'storage.js');
    throw error;
  }
}

// ---- Function: cleanupEntriesWithoutExpiration ----
// Cleans up entries that don't have an expiration date
async function cleanupEntriesWithoutExpiration() {
  try {
    const result = await TempData.deleteMany({
      expiresAt: { $exists: false }
    });
    console.log(`[storage.js]: ✅ Cleaned up ${result.deletedCount} entries without expiration dates`);
  } catch (error) {
    handleError(error, 'storage.js');
    console.error('[storage.js]: ❌ Error cleaning up entries without expiration dates:', error.message);
  }
}

// ---- Function: cleanupExpiredHealingRequests ----
// Cleans up expired healing requests from the database
async function cleanupExpiredHealingRequests() {
  try {
    const result = await TempData.deleteMany({
      type: 'healing',
      expiresAt: { $lt: new Date() }
    });
    console.log(`[storage.js]: ✅ Cleaned up ${result.deletedCount} expired healing requests`);
  } catch (error) {
    handleError(error, 'storage.js');
    console.error('[storage.js]: ❌ Error cleaning up expired healing requests:', error.message);
  }
}

// ============================================================================
// ---- Transaction Helper ----
// Runs a function within a mongoose transaction session.
// ============================================================================

// ---- Function: runWithTransaction ----
// Runs the given async function within a mongoose transaction session.
async function runWithTransaction(fn) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    handleError(error, 'storage.js');
    throw error;
  } finally {
    session.endSession();
  }
}

// Find the latest (not expired) submission for a userId
async function findLatestSubmissionIdForUser(userId) {
  try {
    const result = await TempData.findOne({
      type: 'submission',
      'data.userId': userId,
      expiresAt: { $gt: new Date() }
    }).sort({ 'data.updatedAt': -1 });
    
    return result?.data?.submissionId || null;
  } catch (error) {
    console.error(`[storage.js]: ❌ Error finding latest submission for user ${userId}:`, error);
    return null;
  }
}

// ============================================================================
// ------------------- Module Exports -------------------
// Export all storage-related functions for use in other modules.
module.exports = {
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

  // Add the generic storage functions
  saveToStorage,
  retrieveFromStorage,
  deleteFromStorage
};
