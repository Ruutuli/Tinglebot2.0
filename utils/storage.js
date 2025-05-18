// ------------------- Standard Libraries -------------------
// Import core Node.js modules.
const { handleError } = require('../utils/globalErrorHandler');
const TempData = require('../models/TempDataModel');
const mongoose = require('mongoose');

// ============================================================================
// ------------------- In-Memory Storage -------------------
// Map to store submission data in memory
const submissionStore = new Map();

// ============================================================================
// ------------------- Submission Storage Functions -------------------
// Functions for saving, retrieving, and deleting submissions from persistent storage.

// Save a submission to storage.
async function saveSubmissionToStorage(submissionId, submissionData) {
  try {
    if (!submissionId || !submissionData) {
      console.error(`[storage.js]: ❌ Missing submissionId or data for save operation`);
      throw new Error('Missing submissionId or data');
    }

    console.log(`[storage.js]: 🔄 Saving submission ${submissionId}`);
    
    // Set expiration to 48 hours from now
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Create the properly structured document
    const submission = {
      type: 'submission',
      key: submissionId,
      data: {
        ...submissionData,
        createdAt: submissionData.createdAt || now,
        updatedAt: now
      },
      expiresAt
    };

    const result = await TempData.findOneAndUpdate(
      { type: 'submission', key: submissionId },
      submission,
      { upsert: true, new: true }
    );

    console.log(`[storage.js]: ✅ Successfully saved submission ${submissionId}`);
    return result;
  } catch (error) {
    handleError(error, 'storage.js');
    console.error(`[storage.js]: ❌ Error saving submission ${submissionId}:`, error);
    throw error;
  }
}

// Retrieve a submission by its ID.
async function retrieveSubmissionFromStorage(submissionId) {
  try {
    console.log(`[storage.js]: 🔍 Retrieving submission ${submissionId}`);
    const submission = await TempData.findByTypeAndKey('submission', submissionId);
    if (submission) {
      console.log(`[storage.js]: ✅ Found submission ${submissionId} (${submission.data?.status || 'unknown status'})`);
      return submission.data;
    } else {
      console.log(`[storage.js]: ❌ No submission found for ${submissionId}`);
      return null;
    }
  } catch (error) {
    handleError(error, 'storage.js');
    console.error(`[storage.js]: ❌ Error retrieving submission ${submissionId}:`, error);
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
  await saveToStorage(battleId, 'battle', battleData);
}

async function retrieveBattleProgressFromStorage(battleId) {
  return retrieveFromStorage(battleId, 'battle');
}

async function deleteBattleProgressFromStorage(battleId) {
  await deleteFromStorage(battleId, 'battle');
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

// ============================================================================
// ------------------- Module Exports -------------------
// Export all storage-related functions for use in other modules.
module.exports = {
  saveSubmissionToStorage,
  retrieveSubmissionFromStorage,
  deleteSubmissionFromStorage,
  submissionStore,
  
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
  cleanupExpiredHealingRequests
};
