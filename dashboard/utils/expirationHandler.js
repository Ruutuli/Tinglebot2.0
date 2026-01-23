const TempData = require('../models/TempDataModel');
const { handleError } = require('./globalErrorHandler');


// Function to check for expired requests and notify users
async function checkExpiredRequests(client) {
  try {
    // Find all expired requests
    const expiredRequests = await TempData.findExpired();
    
    for (const request of expiredRequests) {
      try {
        // Get the request data
        const { type, key, data } = request;
        
        // Prepare notification message based on request type
        let message = '';
        let userId = '';
        
        switch (type) {
          case 'healing':
            message = `Your healing request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
            break;
          case 'vending':
            message = `Your vending request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
            break;
          case 'boosting':
            message = `Your boosting request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
            break;
          case 'battle':
            message = `Your battle progress for ${data.characterName} has expired after 48 hours without being completed.`;
            userId = data.userId;
            break;
          case 'encounter':
            message = `Your encounter request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
            break;
          case 'blight':
            message = `Your blight healing request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
            break;
          case 'travel':
            message = `Your travel request for ${data.characterName} has expired after 48 hours without being completed.`;
            userId = data.userId;
            break;
          case 'gather':
            message = `Your gathering request for ${data.characterName} has expired after 48 hours without being completed.`;
            userId = data.userId;
            break;
          case 'delivery':
            message = `Your delivery request from ${data.sender} to ${data.recipient} has expired after 48 hours without being completed.`;
            userId = data.userId;
            break;
          default:
            message = `Your ${type} request has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
        }

        // Send DM to user if we have their ID
        if (userId) {
          try {
            const user = await client.users.fetch(userId);
            if (user) {
              await user.send(message);
            }
          } catch (dmError) {
            console.error(`[expirationHandler.js]: Failed to send DM to user ${userId}:`, dmError);
          }
        }

        // Delete the expired request
        await TempData.findByIdAndDelete(request._id);
        
        console.log(`[expirationHandler.js]: Deleted expired ${type} request for ${key}`);
      } catch (requestError) {
        console.error(`[expirationHandler.js]: Error processing expired request ${request._id}:`, requestError);
      }
    }
  } catch (error) {
    handleError(error, 'expirationHandler.js');
  }
}

// Track expiration check state to prevent duplicate initialization
let expirationCheckTimer = null;
let isExpirationChecksRunning = false;
let isCheckInProgress = false;
let expirationClient = null;

// Function to calculate time until next 8 AM EST (for setTimeout fallback)
// 8 AM EST = 13:00 UTC
function getTimeUntilNext8AM() {
  const now = new Date();
  // Get current UTC time
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  const currentSecond = now.getUTCSeconds();
  const currentMs = now.getUTCMilliseconds();
  
  // Calculate next 13:00 UTC (8 AM EST)
  const next8AM = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    13, 0, 0, 0
  ));
  
  // If it's already past 13:00 UTC (8 AM EST), schedule for next day
  if (currentHour > 13 || (currentHour === 13 && (currentMinute > 0 || currentSecond > 0 || currentMs > 0))) {
    next8AM.setUTCDate(next8AM.getUTCDate() + 1);
  }
  
  return next8AM.getTime() - now.getTime();
}

// Function to stop expiration checks (for cleanup)
function stopExpirationChecks() {
  console.log('[expirationHandler.js]: Stopping expiration checks...');
  
  // Clear the running flag first to prevent new schedules
  isExpirationChecksRunning = false;
  
  // Clear any existing timer
  if (expirationCheckTimer !== null) {
    try {
      clearTimeout(expirationCheckTimer);
      expirationCheckTimer = null;
    } catch (error) {
      console.log('[expirationHandler.js]: Error clearing timer during stop:', error);
    }
  }
  
  // Clear client reference
  expirationClient = null;
  
  console.log('[expirationHandler.js]: Expiration checks stopped');
}

// Function to start the expiration check interval
function startExpirationChecks(client) {
  // Atomic check-and-set: Prevent duplicate initialization
  if (isExpirationChecksRunning) {
    console.log('[expirationHandler.js]: Expiration checks already running - skipping duplicate initialization');
    return;
  }

  // Clear any existing timer
  if (expirationCheckTimer !== null) {
    console.log('[expirationHandler.js]: Found existing timer during initialization - clearing it');
    try {
      clearTimeout(expirationCheckTimer);
    } catch (error) {
      console.log('[expirationHandler.js]: Error clearing existing timer during initialization:', error);
    }
    expirationCheckTimer = null;
  }

  // Set flags atomically
  isExpirationChecksRunning = true;
  expirationClient = client;

  // Use setTimeout for expiration checks
  if (expirationCheckTimer === null) {
    console.log('[expirationHandler.js]: Using setTimeout fallback for expiration checks');
    const scheduleNextCheck = () => {
      if (!isExpirationChecksRunning || !expirationClient) {
        return;
      }
      
      if (isCheckInProgress) {
        // Reschedule when check completes
        return;
      }
      
      const timeUntilNext = getTimeUntilNext8AM();
      expirationCheckTimer = setTimeout(async () => {
        expirationCheckTimer = null;
        
        if (isCheckInProgress) {
          scheduleNextCheck();
          return;
        }
        
        isCheckInProgress = true;
        try {
          await checkExpiredRequests(expirationClient);
        } catch (error) {
          console.error('[expirationHandler.js]: Error in expiration check:', error);
        } finally {
          isCheckInProgress = false;
          if (isExpirationChecksRunning && expirationCheckTimer === null) {
            scheduleNextCheck();
          }
        }
      }, timeUntilNext);
    };
    
    scheduleNextCheck();
  }
  
  // Run initial check (async, non-blocking)
  (async () => {
    if (isCheckInProgress) {
      console.log('[expirationHandler.js]: Initial check skipped - check already in progress');
      return;
    }
    
    isCheckInProgress = true;
    try {
      await checkExpiredRequests(client);
    } catch (error) {
      console.error('[expirationHandler.js]: Error in initial expiration check:', error);
    } finally {
      isCheckInProgress = false;
    }
  })();
}

module.exports = {
  checkExpiredRequests,
  startExpirationChecks,
  stopExpirationChecks
}; 